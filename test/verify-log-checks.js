// Pure checker logic for Phase 8's three new daemon-log hard assertions,
// extracted out of verify-log.test.js so they can be unit-tested against
// synthetic fixtures (test/checker-fixtures.test.js) without a real exported
// game log -- verify-log.test.js itself only runs against a real log (see
// its own header comment), so this is the only way to exercise the checker
// logic under plain `npm test`.
//
// Each function returns an array of violation objects (empty = clean) rather
// than throwing/asserting -- callers decide whether that's a vitest
// assertion (verify-log.test.js) or a fixture expectation (checker-fixtures).

const SHARE_CAP_GRACE_MS = 30_000; // one 10s worker cycle + two 10s snapshot cadences of slack (see batcher-refactor-phase8.md)
const FRACTION_TOLERANCE = 0.02; // 2% relative, deliberately loose -- host list refreshes on CYCLE_MS, one refresh can separate target and budget

/**
 * Share-cap invariant: every snapshot with a positive share target must have
 * inFlightRamGb within one thread's RAM of that target (one-cycle workers are
 * only ever launched up to the gap, so exceeding by more than a thread means
 * double-launch accounting is broken). Zero-target snapshots are exempt for
 * SHARE_CAP_GRACE_MS after the toggle-off `mode` event (workers legally take
 * up to ~10s to decay), and hard-checked after that grace window.
 * @param {any[]} entries
 */
export function checkShareCap(entries) {
  const violations = [];

  // Representative per-thread RAM cost: the minimum observed
  // inFlightRamGb/threads ratio across snapshots with threads > 0. All
  // top-ups launch the same script, so this should be ~constant; taking the
  // min guards against a rounding sliver reading as a violation.
  const perThreadSamples = entries
    .filter((e) => e.event === 'snapshot' && e.share && e.share.threads > 0)
    .map((e) => e.share.inFlightRamGb / e.share.threads);
  const perThreadRamGb = perThreadSamples.length > 0 ? Math.min(...perThreadSamples) : 0;

  let lastZeroFractionTimestamp = null;
  for (const e of entries) {
    if (e.event === 'mode' && e.shareFraction === 0) lastZeroFractionTimestamp = e.timestamp;
    if (e.event !== 'snapshot' || !e.share) continue;

    if (e.share.targetGb > 0) {
      if (e.share.inFlightRamGb > e.share.targetGb + perThreadRamGb) {
        violations.push({
          time: e.time,
          reason: `inFlightRamGb ${e.share.inFlightRamGb} exceeds targetGb ${e.share.targetGb} + one thread (${perThreadRamGb})`,
        });
      }
    } else {
      const withinGrace = lastZeroFractionTimestamp !== null && e.timestamp - lastZeroFractionTimestamp < SHARE_CAP_GRACE_MS;
      if (!withinGrace && e.share.inFlightRamGb > perThreadRamGb) {
        violations.push({
          time: e.time,
          reason: `zero-target inFlightRamGb ${e.share.inFlightRamGb} exceeds one-thread tolerance outside the ${SHARE_CAP_GRACE_MS}ms grace window`,
        });
      }
    }
  }
  return violations;
}

/**
 * Budget invariant (updated for Phase 8): every snapshot's aggregate member
 * cost must fit within batchBudgetGb (not budgetGb -- share's carve reduces
 * what batching is admitted against), and batchBudgetGb must never exceed
 * budgetGb (the two plus share's target should sum to budgetGb by
 * construction).
 * @param {any[]} entries
 */
export function checkBudgetInvariant(entries) {
  const violations = [];
  for (const e of entries) {
    if (e.event !== 'snapshot') continue;
    const totalCost = e.members.reduce((sum, m) => sum + m.pipelineCostGb, 0);
    if (totalCost > e.batchBudgetGb) {
      violations.push({ time: e.time, reason: `member cost total ${totalCost} exceeds batchBudgetGb ${e.batchBudgetGb}` });
    }
    if (e.batchBudgetGb > e.budgetGb) {
      violations.push({ time: e.time, reason: `batchBudgetGb ${e.batchBudgetGb} exceeds budgetGb ${e.budgetGb}` });
    }
  }
  return violations;
}

/**
 * Fraction consistency: each snapshot's share.targetGb should equal the
 * latest preceding mode event's shareFraction x that snapshot's budgetGb,
 * within FRACTION_TOLERANCE relative tolerance (loose on purpose -- see
 * above). A snapshot with no preceding mode event is itself a violation (a
 * valid log always has a startup mode event first).
 * @param {any[]} entries
 */
export function checkFractionConsistency(entries) {
  const violations = [];
  let latestShareFraction = null;
  for (const e of entries) {
    if (e.event === 'mode') latestShareFraction = e.shareFraction;
    if (e.event !== 'snapshot' || !e.share) continue;

    if (latestShareFraction === null) {
      violations.push({ time: e.time, reason: 'snapshot has no preceding mode event to validate share.targetGb against' });
      continue;
    }
    const expected = latestShareFraction * e.budgetGb;
    const actual = e.share.targetGb;
    const tolerance = FRACTION_TOLERANCE * Math.max(Math.abs(expected), 1e-9);
    if (Math.abs(actual - expected) > tolerance) {
      violations.push({
        time: e.time,
        reason: `share.targetGb ${actual} vs expected ${expected} (shareFraction ${latestShareFraction} x budgetGb ${e.budgetGb}) outside ${FRACTION_TOLERANCE * 100}% tolerance`,
      });
    }
  }
  return violations;
}
