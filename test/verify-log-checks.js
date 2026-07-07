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

const SHARE_CAP_GRACE_MS = 30_000; // one 10s worker cycle + two 10s snapshot cadences of slack (see docs/phases/phase-08-batcher-refactor.md)
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
    .filter((e) => e.event === 'snapshot' && e.sharePool && e.sharePool.threads > 0)
    .map((e) => e.sharePool.inFlightRamGb / e.sharePool.threads);
  const perThreadRamGb = perThreadSamples.length > 0 ? Math.min(...perThreadSamples) : 0;

  let lastZeroFractionTimestamp = null;
  for (const e of entries) {
    if (e.event === 'mode' && e.shareFraction === 0) lastZeroFractionTimestamp = e.timestamp;
    if (e.event !== 'snapshot' || !e.sharePool) continue;

    if (e.sharePool.targetGb > 0) {
      if (e.sharePool.inFlightRamGb > e.sharePool.targetGb + perThreadRamGb) {
        violations.push({
          time: e.time,
          reason: `inFlightRamGb ${e.sharePool.inFlightRamGb} exceeds targetGb ${e.sharePool.targetGb} + one thread (${perThreadRamGb})`,
        });
      }
    } else {
      const withinGrace = lastZeroFractionTimestamp !== null && e.timestamp - lastZeroFractionTimestamp < SHARE_CAP_GRACE_MS;
      if (!withinGrace && e.sharePool.inFlightRamGb > perThreadRamGb) {
        violations.push({
          time: e.time,
          reason: `zero-target inFlightRamGb ${e.sharePool.inFlightRamGb} exceeds one-thread tolerance outside the ${SHARE_CAP_GRACE_MS}ms grace window`,
        });
      }
    }
  }
  return violations;
}

/**
 * Budget invariant (updated for Phase 8, amended for Phase 15): every
 * snapshot's aggregate member cost must fit within batchBudgetGb (not
 * budgetGb -- share's carve reduces what batching is admitted against), and
 * batchBudgetGb must never exceed budgetGb (the two plus share's target
 * should sum to budgetGb by construction).
 *
 * Phase 15: pickBatchSet's floor rule can seat exactly one member whose own
 * pipelineCostGb legitimately exceeds batchBudgetGb (a fleet too small to
 * afford even one full batch) -- that member is flagged `floor: true` and is
 * excluded from the cost-total sum below, rather than blindly exempting
 * every over-budget snapshot (which would silently hide a real regression).
 * Two consistency checks replace the blind exemption: a `floor: true` member
 * can only ever be alone (the floor rule only fires into an empty seating,
 * and the resulting negative `remaining` blocks any other seat that tick --
 * see pickBatchSet's floor-pass doc comment), and its flag must actually be
 * warranted (pipelineCostGb > batchBudgetGb) -- otherwise it's an
 * inconsistent flag, not real floor behavior.
 * @param {any[]} entries
 */
export function checkBudgetInvariant(entries) {
  const violations = [];
  for (const e of entries) {
    if (e.event !== 'snapshot') continue;
    const floorMembers = e.members.filter((m) => m.floor === true);
    if (floorMembers.length > 0 && e.members.length > 1) {
      violations.push({ time: e.time, reason: `floor member coexists with ${e.members.length - 1} other member(s) in the same snapshot -- floor rule only ever seats alone` });
    }
    for (const m of floorMembers) {
      if (m.pipelineCostGb <= e.batchBudgetGb) {
        violations.push({ time: e.time, reason: `${m.server} flagged floor:true but pipelineCostGb ${m.pipelineCostGb} does not exceed batchBudgetGb ${e.batchBudgetGb}` });
      }
    }
    const totalCost = e.members.filter((m) => m.floor !== true).reduce((sum, m) => sum + m.pipelineCostGb, 0);
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
 * Stall invariant (Phase 15): a snapshot with eligible candidates but zero
 * seated members is the exact zero-member-forever bug this phase fixes --
 * cappedPipelineDepth + pickBatchSet's floor rule together should make it
 * unreachable, so any sighting is a regression, not a benign state. Also
 * checks candidateCount's shape: a non-negative number, always >=
 * memberCount (members are always drawn from candidates).
 * @param {any[]} entries
 */
export function checkNoStall(entries) {
  const violations = [];
  for (const e of entries) {
    if (e.event !== 'snapshot') continue;
    if (typeof e.candidateCount !== 'number' || e.candidateCount < 0) {
      violations.push({ time: e.time, reason: `candidateCount ${e.candidateCount} is not a non-negative number` });
      continue;
    }
    if (e.candidateCount < e.memberCount) {
      violations.push({ time: e.time, reason: `candidateCount ${e.candidateCount} is less than memberCount ${e.memberCount}` });
    }
    if (e.candidateCount > 0 && e.memberCount === 0) {
      violations.push({ time: e.time, reason: `zero-member stall: ${e.candidateCount} candidate(s) but no members seated` });
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
    if (e.event !== 'snapshot' || !e.sharePool) continue;

    if (latestShareFraction === null) {
      violations.push({ time: e.time, reason: 'snapshot has no preceding mode event to validate sharePool.targetGb against' });
      continue;
    }
    const expected = latestShareFraction * e.budgetGb;
    const actual = e.sharePool.targetGb;
    const tolerance = FRACTION_TOLERANCE * Math.max(Math.abs(expected), 1e-9);
    if (Math.abs(actual - expected) > tolerance) {
      violations.push({
        time: e.time,
        reason: `sharePool.targetGb ${actual} vs expected ${expected} (shareFraction ${latestShareFraction} x budgetGb ${e.budgetGb}) outside ${FRACTION_TOLERANCE * 100}% tolerance`,
      });
    }
  }
  return violations;
}

/**
 * Natural-exit invariant (Phase 9 extraction of the check that lived inline
 * in verify-log.test.js): once a server has an open exit (an `exit` event
 * with no `enter` for that server since), "no new batches after exit, drain
 * only" must hold -- no `batch` event may target it, and its `snapshot`
 * `draining` entry's batchesInFlight may only fall, never rise, between
 * observations. Returns one violation per offending `batch` event and one
 * per rising draining observation.
 * @param {any[]} entries
 */
export function checkNaturalExit(entries) {
  const violations = [];
  const openExits = new Set();
  const lastDrainingBatches = new Map();
  for (const e of entries) {
    if (e.event === 'exit') {
      openExits.add(e.server);
      lastDrainingBatches.delete(e.server);
    } else if (e.event === 'enter') {
      openExits.delete(e.server);
      lastDrainingBatches.delete(e.server);
    } else if (e.event === 'batch') {
      if (openExits.has(e.batchTarget)) {
        violations.push({ time: e.time, reason: `batch event for ${e.batchTarget} while it has an open exit -- no new batches after exit` });
      }
    } else if (e.event === 'snapshot') {
      const drainingByServer = new Map((e.draining ?? []).map((d) => [d.server, d.batchesInFlight]));
      for (const server of openExits) {
        const current = drainingByServer.get(server) ?? 0;
        if (lastDrainingBatches.has(server) && current > lastDrainingBatches.get(server)) {
          violations.push({ time: e.time, reason: `${server}'s draining batchesInFlight increased after exit -- drain only, never refill` });
        }
        lastDrainingBatches.set(server, current);
      }
    }
  }
  return violations;
}

/**
 * Ring-buffer straggler slicing (Phase 9, opt-in). A boundary copy of the log
 * can contain leftover entries from the previous session window whose own
 * `mode` event has already aged out of the ring -- config-dependent checks
 * (fraction consistency) then hard-fail with "no preceding mode event" even
 * though nothing is actually broken, just a mixed-window export artifact.
 * Drops everything before the first retained `mode` event and nothing else;
 * a log that already starts with `mode` (or is empty) passes through
 * unchanged.
 *
 * Caveat, deliberately not hidden: any `exit` events inside the dropped
 * prefix are dropped too, so natural-exit tracking (checkNaturalExit) only
 * covers the sliced range -- an exit whose matching enter/drain lived
 * entirely in the dropped prefix is invisible to it. Only reach for this
 * when a copy hard-fails on the missing-mode-event message, not by default.
 * @param {any[]} entries
 * @returns {any[]}
 */
export function dropPreConfigStragglers(entries) {
  const firstModeIndex = entries.findIndex((e) => e.event === 'mode');
  if (firstModeIndex === -1) return entries; // no mode event at all -- the existing format guard already fails this case clearly
  return entries.slice(firstModeIndex);
}
