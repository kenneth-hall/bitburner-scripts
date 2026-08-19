/**
 * sleevepoolprobe.js - is the Bladeburner contract pool PER-ACTOR or PER-CITY?
 *
 * WHY A SECOND PROBE. sleevebbprobe.js tried to answer this by A/B-ing the RANK RATE, and its
 * result must not be used. Three fatal confounds, all visible in its own log:
 *   1. It observed 6.40 rank TOTAL across both phases. At rank ~7 a single action completion moves
 *      the number materially, so noise dominates the signal completely.
 *   2. The "stable control" was not stable. bladeburnermanager.js changed action class mid-probe --
 *      Contracts/Retirement, then General/Hyperbolic Regeneration Chamber once HP fell to 0.45. A
 *      control that switches to HEALING is not a control.
 *   3. The two actors were on DIFFERENT contracts (main on Retirement, sleeve on Tracking), so a
 *      shared-pool effect could not have shown up even if it exists.
 * The lesson: a RATE A/B needs a stable control and enough signal. When neither is available,
 *    observe the STATE the mechanism acts on instead of its downstream rate.
 *
 * THIS DESIGN observes the pool directly. getActionCountRemaining("Contracts","Tracking") IS the
 * pool. The main engine is paused so only the sleeve can consume, making attribution unambiguous:
 *   Phase A: engine paused, sleeve IDLE       -> count drift from REGENERATION alone
 *   Phase B: engine paused, sleeve on Tracking -> drift including whatever the sleeve consumes
 * If the sleeve's completions decrement the same counter, the pool is SHARED (per-city) and sleeves
 * cannot parallelise the grind. If the counter only regenerates while the sleeve still completes
 * contracts, the pool is PER-ACTOR and BN10's ordering case holds.
 *
 * /!\ MUTATES: pauses bladeburnermanager.js via bladeburner-off.txt and reassigns the sleeve.
 * Both are restored in a finally.
 *
 * Usage: run sleevepoolprobe.js [phaseMinutes]   (default 10)
 * RAM: ~24 GB.  ASCII-only.
 */

const OFF_MARKER = "bladeburner-off.txt";
const DEFAULT_PHASE_MIN = 10;

function d_consumed(rec){ return rec.consumedPerCompletion === null ? 0 : rec.consumedPerCompletion; }

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const phaseMin = Number(ns.args[0]) > 0 ? Number(ns.args[0]) : DEFAULT_PHASE_MIN;
  const rec = { ts: Date.now(), iso: new Date().toISOString(), phaseMin,
    note: "direct pool observation: does a sleeve's contract completion decrement countRemaining" };
  const flush = () => ns.write("sleevepoolprobe-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  const count = () => { try { return ns.bladeburner.getActionCountRemaining("Contracts", "Tracking"); } catch { return null; } };
  const rank = () => { try { return ns.bladeburner.getRank(); } catch { return null; } };
  const sleeveDone = () => { try { const t = ns.sleeve.getTask(0); return t && t.type === "BLADEBURNER" ? t.tasksCompleted : null; } catch { return null; } };

  if (count() === null) { rec.fatal = "getActionCountRemaining threw"; flush();
    ns.tprint("sleevepoolprobe: ABORT -- " + rec.fatal); return; }

  let originalTask = null;
  try { originalTask = ns.sleeve.getTask(0); } catch { /* ignore */ }
  rec.originalTask = originalTask ? JSON.parse(JSON.stringify(originalTask)) : null;

  try {
    ns.write(OFF_MARKER, "sleevepoolprobe -- pool attribution measurement", "w");
    ns.sleeve.setToIdle(0);
    await ns.sleep(15000); // let the engine observe the marker and stand down

    // ---- Phase A: nobody consuming -> pure regeneration -----------------------
    const a0 = { count: count(), rank: rank(), t: Date.now() };
    await ns.sleep(phaseMin * 60000);
    const a1 = { count: count(), rank: rank(), t: Date.now() };
    rec.phaseA = { label: "idle", ...a0, endCount: a1.count, endRank: a1.rank,
      minutes: (a1.t - a0.t) / 60000, countDelta: a1.count - a0.count, rankDelta: a1.rank - a0.rank };
    rec.phaseA.regenPerMin = rec.phaseA.countDelta / rec.phaseA.minutes;
    flush();

    // ---- Phase B: sleeve consuming -------------------------------------------
    rec.assignReturned = ns.sleeve.setToBladeburnerAction(0, "Take on contracts", "Tracking");
    await ns.sleep(3000);
    const verify = ns.sleeve.getTask(0);
    rec.phaseBVerified = !!verify && verify.type === "BLADEBURNER";
    if (!rec.phaseBVerified) {
      rec.verdict = "could-not-assign"; flush();
    } else {
      // Sample THROUGHOUT, not just at the endpoints. The first run could not tell "the sleeve
      // completed nothing" from "completions that pay no rank", because the task ended mid-window
      // and only the endpoints were recorded. Those imply opposite conclusions.
      const b0 = { count: count(), rank: rank(), done: sleeveDone(), t: Date.now() };
      rec.samples = [];
      const SAMPLE_MS = 20000;
      const ticks = Math.max(1, Math.round((phaseMin * 60000) / SAMPLE_MS));
      for (let i = 0; i < ticks; i++) {
        await ns.sleep(SAMPLE_MS);
        let taskType = null, done = null, actionName = null;
        try {
          const t = ns.sleeve.getTask(0);
          taskType = t ? t.type : null;
          actionName = t && t.actionName ? t.actionName : null;
          done = t && t.type === "BLADEBURNER" ? t.tasksCompleted : null;
        } catch { /* recorded as nulls */ }
        rec.samples.push({ tSec: Math.round((Date.now() - b0.t) / 1000), count: count(),
          rank: rank(), taskType, actionName, done });
        if (i % 3 === 0) flush();
      }
      const b1 = { count: count(), rank: rank(), done: sleeveDone(), t: Date.now() };
      // Did the task survive the window, and did completions ever advance?
      const bbSamples = rec.samples.filter((x) => x.taskType === "BLADEBURNER");
      rec.taskHeldSamples = bbSamples.length;
      rec.taskTotalSamples = rec.samples.length;
      rec.taskSurvived = rec.samples.length > 0 && rec.samples[rec.samples.length - 1].taskType === "BLADEBURNER";
      const doneVals = bbSamples.map((x) => x.done).filter((v) => typeof v === "number");
      rec.completionsObserved = doneVals.length > 1 ? Math.max(...doneVals) - Math.min(...doneVals) : 0;
      const rankVals = rec.samples.map((x) => x.rank).filter((v) => typeof v === "number");
      rec.rankMovedDuringPhaseB = rankVals.length > 1 && (Math.max(...rankVals) - Math.min(...rankVals)) > 1e-9;
      rec.phaseB = { label: "sleeve-on-tracking", ...b0, endCount: b1.count, endRank: b1.rank,
        endDone: b1.done, minutes: (b1.t - b0.t) / 60000,
        countDelta: b1.count - b0.count, rankDelta: b1.rank - b0.rank,
        sleeveCompletions: (b1.done ?? 0) - (b0.done ?? 0) };
      rec.phaseB.netPerMin = rec.phaseB.countDelta / rec.phaseB.minutes;

      // Consumption attributable to the sleeve = regeneration we expected minus what we saw.
      rec.consumedBySleeve = (rec.phaseA.regenPerMin * rec.phaseB.minutes) - rec.phaseB.countDelta;
      rec.completions = rec.phaseB.sleeveCompletions;
      rec.consumedPerCompletion = rec.completions > 0 ? rec.consumedBySleeve / rec.completions : null;

      rec.verdict =
        !rec.taskSurvived && rec.completionsObserved === 0
          ? "INCONCLUSIVE -- sleeve task did not persist and never completed anything"
        : rec.completionsObserved > 0 && !rec.rankMovedDuringPhaseB
          ? "SLEEVE CONTRACTS PAY NO PLAYER RANK -- completions observed, rank never moved"
        : rec.completionsObserved > 0 && rec.rankMovedDuringPhaseB && d_consumed(rec) >= 0.5
          ? "SHARED POOL -- sleeve pays rank but drains the same counter"
        : rec.completionsObserved > 0 && rec.rankMovedDuringPhaseB
          ? "PER-ACTOR -- sleeve pays rank without draining the counter"
        : "INCONCLUSIVE (completion counter unusable: " + rec.completions + ")";
    }
  } catch (err) {
    rec.threw = String(err).slice(0, 300);
  } finally {
    try { ns.rm(OFF_MARKER, "home"); rec.markerRemoved = true; } catch { rec.markerRemoved = false; }
    try {
      if (rec.originalTask && rec.originalTask.type === "SYNCHRO") ns.sleeve.setToSynchronize(0);
      else ns.sleeve.setToIdle(0);
      rec.restored = true;
    } catch { rec.restored = false; }
    flush();
  }

  ns.tprint("sleevepoolprobe: " + phaseMin + " min per phase");
  if (rec.phaseA) ns.tprint("  A idle   : count " + rec.phaseA.count.toFixed(2) + " -> " +
    rec.phaseA.endCount.toFixed(2) + "  (regen " + rec.phaseA.regenPerMin.toFixed(4) + "/min)");
  if (rec.phaseB) {
    ns.tprint("  B sleeve : count " + rec.phaseB.count.toFixed(2) + " -> " +
      rec.phaseB.endCount.toFixed(2) + "  (net " + rec.phaseB.netPerMin.toFixed(4) + "/min)");
    ns.tprint("  sleeve completions: " + rec.completions +
      " | count consumed by sleeve: " + rec.consumedBySleeve.toFixed(2) +
      " | per completion: " + (rec.consumedPerCompletion === null ? "n/a" : rec.consumedPerCompletion.toFixed(3)));
  }
  ns.tprint("  VERDICT: " + rec.verdict);
  ns.tprint("  -> sleevepoolprobe-" + rec.ts + ".json");
}
