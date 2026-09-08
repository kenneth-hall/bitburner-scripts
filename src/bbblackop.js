/**
 * bbblackop.js - fire Bladeburner black ops, one at a time, with the slot held properly.
 *
 * WHY (2026-08-15). bladeburnermanager.js has no black-op stage at all -- it grinds rank
 * forever and stops. But rank 400,000 is only the gate on the LAST op; the node clears by
 * completing all 21 in order, and as of today ZERO are done (getNextBlackOp reads
 * "Operation Typhoon", the first). This runs the ladder.
 *
 * 🔴 IRREVERSIBILITY RAIL. Completing `Operation Daedalus` DESTROYS THE BITNODE and ends
 * the run. This script REFUSES to start it unless invoked with the explicit `daedalus`
 * argument. Every other op is safe -- they are progress, not an exit. The rail is a
 * separate argument rather than a count so that "run the ladder" can never walk off the
 * end by accident.
 *
 * SLOT DISCIPLINE -- all FOUR claimants, per CLAUDE.md's landmine. Pausing only the
 * obvious one is what defeated four separate measurement attempts on 2026-08-02, each
 * with an identical symptom from a different cause:
 *   bladeburnermanager.js -> BB_OFF_MARKER
 *   augfarmer.js          -> AUG_PAUSE_FILE (it watches for the manager RELEASING the
 *                            slot hold and immediately starts faction work in the gap)
 *   backdoorfactions.js / backdoorwd.js -> both yield to SLOT_HOLD_FILE
 * So: pause the manager, pause augfarmer, and claim the slot ourselves -- refreshing
 * inside SLOT_HOLD_MAX_AGE_MS for the whole run. All three files are cleared in a
 * `finally`, because leaving BB_OFF_MARKER behind idles the engine indefinitely, which on
 * an unattended run is far worse than losing a measurement.
 *
 * VERIFICATION. `startAction` returning true does NOT mean the action is running --
 * confirmed live, true returned while getCurrentAction() read null across 60 samples.
 * Every start here is verified against getCurrentAction(), and every completion against
 * getNextBlackOp() advancing, never against a boolean or an elapsed timer.
 *
 * Usage:
 *   run bbblackop.js            -> fire the next op, once
 *   run bbblackop.js 5          -> fire up to 5 ops in order, stopping before Daedalus
 *   run bbblackop.js 21 daedalus-> allow the final op (DESTROYS THE NODE)
 *
 * ASCII-only: brand-new src/ files may need in-game wget seeding, which mangles UTF-8.
 *
 * Writes bbblackop-<epoch>.json (synced to logs/ by the vite.config.ts filter).
 */

const BB_OFF_MARKER = "bladeburner-off.txt";
const SLOT_HOLD_FILE = "bladeburner-slot-hold.json";
const AUG_PAUSE_FILE = "augfarmer-pause.txt";

const FINAL_OP = "Operation Daedalus";
const HOLD_REFRESH_MS = 10_000; // SLOT_HOLD_MAX_AGE_MS is 30s; refresh well inside it
const HP_FLOOR = 0.5;           // matches bladeburnermanager's HP_FLOOR_FRACTION
const START_VERIFY_MS = 8_000;

// 🔴 ADDED 2026-08-16 AFTER A REAL LOSS. The first version bounded ATTEMPTS (40) but
// never bounded RANK, and a failed black op costs ~30% of that op's reward. Five straight
// Centurion failures drained 382,418 -> 358,443 (~24,000 rank) before it was killed by
// hand; left alone, MAX_ATTEMPTS would have permitted ~190,000. Bounding the wrong
// quantity is not a guard.
//
// RANK_FLOOR is the real constraint: `Operation Daedalus` requires rank 400,000 AT THE
// MOMENT OF THE ATTEMPT, so letting rank fall below that does not merely waste time, it
// makes the win condition unreachable until it is re-ground. Both guards are checked
// before every attempt AND after every failure, since a single failure can cross either.
const RANK_FLOOR = 400_000;

// 2026-09-07: raised 40,000 -> 120,000. The budget exists as a runaway brake, but it was
// sized when rank sat just over the floor; rank now reads ~732,000, i.e. ~332,000 of
// headroom, and MAX_ATTEMPTS (40/op) already bounds a single bad op. At the measured
// ~349 rank per failure the expected cost of the remaining ladder is ~18,000, so 40,000
// would abort a merely UNLUCKY run partway rather than a runaway one. RANK_FLOOR is the
// guard that actually protects the win condition and is unchanged.
const RANK_LOSS_BUDGET = 120_000; // per run, across all ops

// 🔴 THE FIX FOR WHAT KILLED THE 2026-09-06 RUN. Stamina below 50% of max applies a
// success-chance PENALTY, and a black-op attempt costs more stamina than it regenerates
// over its own runtime -- so firing retries back-to-back is a death spiral: fail -> less
// stamina -> lower success -> more failures. Measured, in that run's own log:
//   Operation Tyrell            start stamina 1.00 ->  5 failures
//   Operation Wallace           start stamina 0.68 -> 10 failures
//   Operation Shoulder of Orion start stamina 0.15 -> 37 failures, ABORTED, -12,927 rank
// The tell that it is the penalty and not a real ceiling: Orion read pMax 0.6046 at
// stamina 0.15 -- the ONLY op in the whole ladder history with pMax below 1.0000 -- and
// reads 1.0000 again once stamina recovers. Nothing was wrong with the op.
//
// So: gate every attempt, the first and every retry, on stamina being back above
// STAMINA_GATE. The wait is bounded so a stuck regen cannot hang the run forever.
const STAMINA_GATE = 0.80;
const STAMINA_WAIT_MAX_MS = 60 * 60_000;
const STAMINA_POLL_MS = 5_000;

function holdSlot(ns) {
  ns.write(SLOT_HOLD_FILE, JSON.stringify({ ts: Date.now(), holder: "bbblackop" }), "w");
}

/**
 * Block until stamina is back above STAMINA_GATE, keeping the slot hold refreshed the
 * whole time so no other claimant steals it during the rest. The slot is deliberately
 * left EMPTY -- stamina regenerates on its own, and running anything in it would spend
 * the stamina we are waiting on. Returns the wait record for the log.
 */
async function waitForStamina(ns, tag) {
  const rec = { tag, waitedMs: 0 };
  const [c0, m0] = ns.bladeburner.getStamina();
  rec.fractionBefore = c0 / m0;
  if (rec.fractionBefore >= STAMINA_GATE) { rec.fractionAfter = rec.fractionBefore; return rec; }

  ns.bladeburner.stopBladeburnerAction();
  while (rec.waitedMs < STAMINA_WAIT_MAX_MS) {
    await ns.sleep(STAMINA_POLL_MS);
    rec.waitedMs += STAMINA_POLL_MS;
    holdSlot(ns);
    const [c, m] = ns.bladeburner.getStamina();
    if (c / m >= STAMINA_GATE) break;
  }
  const [c1, m1] = ns.bladeburner.getStamina();
  rec.fractionAfter = c1 / m1;
  rec.timedOut = rec.fractionAfter < STAMINA_GATE;
  return rec;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const maxOps = Number(ns.args[0]) > 0 ? Number(ns.args[0]) : 1;
  const allowFinal = ns.args.includes("daedalus");

  const outRec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "black-op ladder runner",
    maxOps,
    allowFinal,
    ops: [],
  };
  const flush = (label) => {
    outRec.stage = label;
    try {
      ns.write("bbblackop-" + outRec.ts + ".json", JSON.stringify(outRec, null, 2), "w");
    } catch (err) {
      ns.tprint("bbblackop: WRITE FAILED at " + label + ": " + String(err));
    }
  };

  if (!ns.bladeburner.inBladeburner()) {
    outRec.abort = "not in the Bladeburner division";
    flush("abort");
    ns.tprint("bbblackop: ABORT - not in the Bladeburner division");
    return;
  }

  outRec.startRank = ns.bladeburner.getRank();
  flush("start");

  ns.write(BB_OFF_MARKER, "paused by bbblackop.js @ " + outRec.iso + "\n", "w");
  ns.write(AUG_PAUSE_FILE, "paused by bbblackop.js @ " + outRec.iso + "\n", "w");
  holdSlot(ns);
  flush("paused");

  try {
    // Wait for whatever the manager had running to fall out of the slot before claiming it.
    let waited = 0;
    while (waited < 30_000) {
      await ns.sleep(2_000);
      waited += 2_000;
      holdSlot(ns);
      const live = ns.bladeburner.getCurrentAction();
      if (!live || !live.name || live.name === "Hyperbolic Regeneration Chamber") break;
    }
    outRec.slotAcquiredAfterMs = waited;
    ns.bladeburner.stopBladeburnerAction();
    flush("slot-acquired");

    for (let i = 0; i < maxOps; i++) {
      const nextOp = ns.bladeburner.getNextBlackOp();
      if (!nextOp) {
        outRec.laddercomplete = "getNextBlackOp returned null - no ops remain";
        break;
      }

      const opRec = { name: nextOp.name, rankRequired: nextOp.rank };
      const rankNow = ns.bladeburner.getRank();
      const [stamCur, stamMax] = ns.bladeburner.getStamina();
      const hpNow = ns.getPlayer().hp;
      opRec.rankBefore = rankNow;
      opRec.hpFraction = hpNow.current / hpNow.max;
      opRec.staminaFraction = stamCur / stamMax;

      if (nextOp.name === FINAL_OP && !allowFinal) {
        opRec.result = "REFUSED - final op destroys the BitNode; re-run with the 'daedalus' argument";
        outRec.ops.push(opRec);
        flush("refused-final");
        break;
      }
      if (rankNow < nextOp.rank) {
        opRec.result = "BLOCKED - rank " + rankNow.toFixed(0) + " < required " + nextOp.rank;
        outRec.ops.push(opRec);
        flush("blocked-rank");
        break;
      }
      if (opRec.hpFraction < HP_FLOOR) {
        opRec.result = "BLOCKED - HP fraction " + opRec.hpFraction.toFixed(2) + " below floor " + HP_FLOOR;
        outRec.ops.push(opRec);
        flush("blocked-hp");
        break;
      }
      if (rankNow < RANK_FLOOR) {
        opRec.result = "BLOCKED - rank " + rankNow.toFixed(0) + " below RANK_FLOOR " + RANK_FLOOR;
        outRec.ops.push(opRec);
        flush("blocked-rank-floor");
        break;
      }
      if (outRec.startRank - rankNow > RANK_LOSS_BUDGET) {
        opRec.result = "BLOCKED - run has lost " + (outRec.startRank - rankNow).toFixed(0) +
          " rank, over the " + RANK_LOSS_BUDGET + " budget";
        outRec.ops.push(opRec);
        flush("blocked-loss-budget");
        break;
      }

      // Rest to the gate BEFORE reading the success chance -- the estimate itself is
      // depressed by the stamina penalty, so reading it while tired logs a number that
      // describes the rest state rather than the op.
      opRec.staminaWaits = [];
      opRec.staminaWaits.push(await waitForStamina(ns, "pre-op"));
      const [stamGated, stamGatedMax] = ns.bladeburner.getStamina();
      opRec.staminaFractionAtStart = stamGated / stamGatedMax;

      opRec.successChance = ns.bladeburner.getActionEstimatedSuccessChance("Black Operations", nextOp.name);
      opRec.actionTimeMs = ns.bladeburner.getActionTime("Black Operations", nextOp.name);

      holdSlot(ns);
      ns.bladeburner.stopBladeburnerAction();
      opRec.startActionReturned = ns.bladeburner.startAction("Black Operations", nextOp.name);

      // Verify the action ACTUALLY started -- the boolean is known to lie.
      let verified = false;
      let verifyWaited = 0;
      while (verifyWaited < START_VERIFY_MS) {
        await ns.sleep(1_000);
        verifyWaited += 1_000;
        holdSlot(ns);
        const live = ns.bladeburner.getCurrentAction();
        if (live && live.name === nextOp.name) { verified = true; break; }
      }
      opRec.startVerified = verified;
      if (!verified) {
        opRec.result = "FAILED TO START - getCurrentAction never showed the op (slot stolen?)";
        outRec.ops.push(opRec);
        flush("start-failed");
        break;
      }

      // Wait for completion, detected by getNextBlackOp ADVANCING (a success) or by the
      // action leaving the slot (a failure). Timer is a backstop, never the signal.
      // The deadline is per-ATTEMPT and is extended on every retry -- a single fixed
      // deadline would let a failed op time out instead of retrying, and the back half of
      // the ladder runs at pMin 0.17-0.59, so failures are expected, not exceptional.
      // MAX_ATTEMPTS bounds the whole thing so a genuinely impossible op cannot spin.
      const MAX_ATTEMPTS = 40;
      let deadline = Date.now() + opRec.actionTimeMs + 60_000;
      let attempts = 0;
      let advanced = false;
      while (Date.now() < deadline && attempts < MAX_ATTEMPTS) {
        await ns.sleep(2_000);
        holdSlot(ns);
        const stillNext = ns.bladeburner.getNextBlackOp();
        if (!stillNext || stillNext.name !== nextOp.name) { advanced = true; break; }
        const live = ns.bladeburner.getCurrentAction();
        if (!live || live.name !== nextOp.name) {
          // Action left the slot without the ladder advancing -> a failed attempt.
          // Retrying is also what answers "are failed black ops retryable" -- inferred
          // from getActionCountRemaining staying at 1, never actually measured.
          attempts++;
          opRec.failedAttempts = attempts;
          const hpMid = ns.getPlayer().hp;
          if (hpMid.current / hpMid.max < HP_FLOOR) {
            opRec.result = "ABORTED MID-OP - HP fell below floor after " + attempts + " failed attempt(s)";
            break;
          }
          // The guards that were missing. A failure can cross either one on its own.
          const rankMid = ns.bladeburner.getRank();
          if (rankMid < RANK_FLOOR) {
            opRec.result = "ABORTED MID-OP - rank " + rankMid.toFixed(0) + " fell below RANK_FLOOR " +
              RANK_FLOOR + " after " + attempts + " failed attempt(s); Daedalus would become unattemptable";
            break;
          }
          if (outRec.startRank - rankMid > RANK_LOSS_BUDGET) {
            opRec.result = "ABORTED MID-OP - run has lost " + (outRec.startRank - rankMid).toFixed(0) +
              " rank, over the " + RANK_LOSS_BUDGET + " budget, after " + attempts + " failed attempt(s)";
            break;
          }
          // Rest before retrying. Without this the next attempt runs at a lower stamina
          // than the one that just failed, which is the spiral described at STAMINA_GATE.
          const waitRec = await waitForStamina(ns, "retry-" + attempts);
          opRec.staminaWaits.push(waitRec);

          ns.bladeburner.startAction("Black Operations", nextOp.name);
          deadline = Date.now() + opRec.actionTimeMs + 60_000; // clock restarts AFTER the rest
        }
      }

      opRec.advanced = advanced;
      opRec.rankAfter = ns.bladeburner.getRank();
      opRec.rankDelta = opRec.rankAfter - opRec.rankBefore;
      // Do NOT clobber a result the loop already set (the mid-op HP abort).
      if (!opRec.result) opRec.result = advanced ? "COMPLETED" : "TIMED OUT - did not advance";
      outRec.ops.push(opRec);
      flush("op-" + i);
      if (!advanced) break;
    }
  } finally {
    try { ns.rm(BB_OFF_MARKER, "home"); } catch { /* already gone */ }
    try { ns.rm(SLOT_HOLD_FILE, "home"); } catch { /* already gone */ }
    try { ns.rm(AUG_PAUSE_FILE, "home"); } catch { /* already gone */ }
    outRec.pauseCleared = !ns.fileExists(BB_OFF_MARKER, "home");
    outRec.augPauseCleared = !ns.fileExists(AUG_PAUSE_FILE, "home");
    outRec.endRank = ns.bladeburner.getRank();
    const remaining = ns.bladeburner.getNextBlackOp();
    outRec.nextOpAfterRun = remaining ? remaining.name : null;
    flush("done");
  }

  ns.tprint("bbblackop: ran " + outRec.ops.length + " op(s), rank " +
    ns.format.number(outRec.startRank) + " -> " + ns.format.number(outRec.endRank) +
    " | next op: " + (outRec.nextOpAfterRun ?? "NONE REMAIN"));
  for (const op of outRec.ops) {
    ns.tprint("  " + op.name + ": " + op.result +
      (op.rankDelta !== undefined ? " (rank +" + op.rankDelta.toFixed(0) + ")" : "") +
      (op.failedAttempts ? " [" + op.failedAttempts + " failed attempt(s)]" : ""));
  }
  ns.tprint("  pause cleared: " + outRec.pauseCleared + " / augfarmer pause cleared: " + outRec.augPauseCleared);
  ns.tprint("  -> bbblackop-" + outRec.ts + ".json");
}
