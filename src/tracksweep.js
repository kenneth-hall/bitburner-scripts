/**
 * tracksweep.js -- measure Tracking's success rate and rank-per-action AS A FUNCTION OF LEVEL.
 *
 * WHY. The level governor's LEVEL_LOWER_BAND is 0.6 and LEVEL_RAISE_BAND is 0.95, so an action
 * realising 80% -- exactly where BN10's Tracking sits -- is in the dead band and is never acted
 * on. That band implicitly prices a failure as ONE lost action. Measured 2026-08-19, a failure
 * costs 7.09 HP at a flat 2.00 HP/min regen = 3.5 minutes of healing against a 28-second action,
 * i.e. about 7.5 actions of wall clock. The band is therefore mispriced -- but the CORRECT band
 * cannot be derived without the success-vs-level curve, and Phase 40's premise was falsified by
 * tuning off a curve reconstructed from a broken instrument. So: measure it, do not model it.
 *
 * THE SECOND QUESTION, WHICH MAY MATTER MORE. In BN6, Tracking's yield GREW +4.03%/level, which
 * is why levels were worth climbing. BN10's first 50 samples hint at the opposite (rank/action
 * 0.805 at L5 down to 0.309 at L16) on n=1-12 per level -- far too thin to believe, but if it
 * holds then levels are worthless here and the governor should FLOOR Tracking rather than tune a
 * band. This sweep is powered to tell those apart.
 *
 * HOW. This script does exactly one thing: it parks Tracking at a level and holds it. It does not
 * choose actions, does not touch any other action, and does not record outcomes -- the engine's
 * own attempts log already stamps `level` on every attempt, so the analysis reads that. Keeping
 * the actuator and the instrument separate is deliberate: it is the same split that let Phase 40
 * discover its instrument was broken without also corrupting its actuator.
 *
 * SAFETY RAILS.
 *  - Restores autolevel on exit, including on kill (ns.atExit).
 *  - Aborts a level early on FAILURE_ABORT consecutive-ish failures, so a bad high level cannot
 *    burn the run in healing time.
 *  - Touches ONLY Contracts/Tracking. Never Retirement, never a General action.
 *  - Read-only with respect to money, augs and skills.
 *
 * WARNING: setActionLevel has NO success signal (reference section 6), so every set is read back with
 *    getActionCurrentLevel before the dwell is counted.
 *
 * ASCII-only (docs/dev-server.md -- new files are seeded by in-game wget).
 */

const TYPE = "Contracts";
const NAME = "Tracking";
const LEVELS = [4, 8, 16, 24, 32];
const DWELL_MS = 2 * 60 * 60 * 1000; // ~2h -> n about 20 at the measured ~11 actions/h
const SAMPLE_MS = 60_000;
const FAILURE_ABORT = 12; // abort a level after this many failures in its dwell

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const startedLevel = ns.bladeburner.getActionCurrentLevel(TYPE, NAME);
  const maxLevel = ns.bladeburner.getActionMaxLevel(TYPE, NAME);
  if (startedLevel < 0) {
    ns.tprint("tracksweep: ABORT -- getActionCurrentLevel returned -1 (invalid action?)");
    return;
  }

  // Restore autolevel no matter how we exit -- a killed sweep must not leave Tracking frozen.
  ns.atExit(() => {
    try {
      ns.bladeburner.setActionAutolevel(TYPE, NAME, true);
    } catch (err) {
      /* nothing useful to do at exit */
    }
  });

  const rec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "success + rank/action vs Tracking level; analysis reads bladeburner-attempts.json",
    startedLevel,
    maxLevel,
    levels: LEVELS,
    dwellMs: DWELL_MS,
    stages: [],
  };
  ns.tprint("tracksweep: start level " + startedLevel + " (max " + maxLevel + "), sweeping " +
    LEVELS.join(",") + " at " + (DWELL_MS / 60000) + " min each");

  for (const level of LEVELS) {
    if (level > maxLevel) {
      rec.stages.push({ level, skipped: "above maxLevel " + maxLevel });
      ns.tprint("tracksweep: skip L" + level + " -- above maxLevel " + maxLevel);
      continue;
    }
    ns.bladeburner.setActionAutolevel(TYPE, NAME, false);
    ns.bladeburner.setActionLevel(TYPE, NAME, level);
    const readBack = ns.bladeburner.getActionCurrentLevel(TYPE, NAME);

    const stage = {
      level,
      readBack,
      levelHeld: readBack === level,
      startedAtMs: Date.now(),
      startRank: ns.bladeburner.getRank(),
      samples: [],
    };
    if (!stage.levelHeld) {
      ns.tprint("tracksweep: WARN L" + level + " did not stick (read back " + readBack + ") -- recording anyway");
    }
    ns.tprint("tracksweep: holding L" + readBack + " for " + (DWELL_MS / 60000) + " min");

    let failures = 0;
    let prevSuccesses = null;
    const until = Date.now() + DWELL_MS;
    while (Date.now() < until) {
      await ns.sleep(SAMPLE_MS);
      const cur = ns.bladeburner.getActionCurrentLevel(TYPE, NAME);
      const succ = ns.bladeburner.getActionSuccesses(TYPE, NAME);
      stage.samples.push({
        t: Date.now(),
        level: cur,
        rank: ns.bladeburner.getRank(),
        successes: succ,
      });
      if (prevSuccesses !== null && succ === prevSuccesses) {
        // no new success this minute -- a weak proxy for failure pressure, used only for the rail
        failures++;
      } else {
        failures = 0;
      }
      prevSuccesses = succ;
      if (cur !== readBack) {
        stage.drifted = "level changed to " + cur + " mid-dwell (governor or autolevel)";
        ns.tprint("tracksweep: L" + readBack + " drifted to " + cur + " -- ending stage early");
        break;
      }
      if (failures >= FAILURE_ABORT) {
        stage.aborted = "no new success for " + FAILURE_ABORT + " consecutive minutes";
        ns.tprint("tracksweep: L" + readBack + " aborted -- " + stage.aborted);
        break;
      }
    }
    stage.endedAtMs = Date.now();
    stage.endRank = ns.bladeburner.getRank();
    stage.rankGained = stage.endRank - stage.startRank;
    stage.minutes = (stage.endedAtMs - stage.startedAtMs) / 60000;
    rec.stages.push(stage);
    ns.write("tracksweep-" + rec.ts + ".json", JSON.stringify(rec, null, 1), "w");
    ns.tprint("tracksweep: L" + readBack + " done -- +" + stage.rankGained.toFixed(2) +
      " rank over " + stage.minutes.toFixed(0) + " min");
  }

  ns.bladeburner.setActionAutolevel(TYPE, NAME, true);
  rec.restoredAutolevel = true;
  rec.finishedIso = new Date().toISOString();
  ns.write("tracksweep-" + rec.ts + ".json", JSON.stringify(rec, null, 1), "w");
  ns.tprint("tracksweep: COMPLETE -- autolevel restored. Analyse with the attempts log by level.");
}
