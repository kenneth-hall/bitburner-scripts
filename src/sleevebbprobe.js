/**
 * sleevebbprobe.js - THE measurement the BN10-next node ordering rests on.
 *
 * THE QUESTION. docs/bitnodes.md ranks BN10 first partly because sleeves may PARALLELISE the
 * Bladeburner rank grind. In BN6, `Tracking` was ~100% of all rank gained, and it is
 * SUPPLY-CAPPED: countRemaining pinned at 1.00, regeneration-limited to ~30 actions/hour. If that
 * regeneration pool is PER-CITY rather than PER-ACTOR, a sleeve running Contracts in the same city
 * adds nothing -- it just draws from the same pool the main character is already draining, and
 * BN10's lead collapses to its bare 1.25x redo-tax edge over BN9.
 *
 * This was called "circular -- cannot be measured until SF10 is held, i.e. after BN10 is cleared".
 * That was WRONG (corrected 2026-08-16): sleeves are live from BN10 ENTRY; SF10 only grants them
 * OUTSIDE the node. It needed sleeves + a Bladeburner join, and both are now in hand.
 *
 * METHOD. Rank is a single counter, so the test is a straight A/B on its rate:
 *   Phase A: sleeve IDLE          -> rank/hour from the main character alone
 *   Phase B: sleeve on Contracts  -> rank/hour with both actors drawing
 * Interpretation:
 *   rate rises ~2x        => PER-ACTOR pool. Parallelism is real; BN10's ordering case holds.
 *   rate flat             => PER-CITY pool. The sleeve competes rather than adds -> revisit order.
 *   rate rises a little   => partial/shared with its own regen; report the ratio, do not round it.
 *
 * /!\ MUTATES the sleeve's task. Captures the original and restores it in a finally.
 * Does NOT touch the main character's action -- bladeburnermanager.js keeps the slot throughout,
 * which is what makes the main character a stable control.
 *
 * Usage: run sleevebbprobe.js [phaseMinutes]   (default 12)
 *
 * RAM: ~24 GB.  ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

const DEFAULT_PHASE_MIN = 12;
const CONTRACT_ACTION = "Take on contracts";
const CONTRACT_NAME = "Tracking";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const phaseMin = Number(ns.args[0]) > 0 ? Number(ns.args[0]) : DEFAULT_PHASE_MIN;
  const rec = { ts: Date.now(), iso: new Date().toISOString(), phaseMin,
    note: "A/B: does a sleeve on Bladeburner contracts ADD rank, or share a per-city pool" };
  const flush = () => ns.write("sleevebbprobe-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  let originalTask = null;
  try { originalTask = ns.sleeve.getTask(0); } catch { originalTask = null; }
  rec.originalTask = originalTask ? JSON.parse(JSON.stringify(originalTask)) : null;

  const readRank = () => { try { return ns.bladeburner.getRank(); } catch { return null; } };
  if (readRank() === null) {
    rec.fatal = "getRank threw -- not in the Bladeburner division";
    flush(); ns.tprint("sleevebbprobe: ABORT -- " + rec.fatal); return;
  }

  const runPhase = async (label) => {
    const r0 = readRank(); const t0 = Date.now();
    await ns.sleep(phaseMin * 60000);
    const r1 = readRank(); const t1 = Date.now();
    const hours = (t1 - t0) / 3600000;
    return { label, rankStart: r0, rankEnd: r1, gain: r1 - r0, hours, rankPerHour: (r1 - r0) / hours };
  };

  try {
    // ---- Phase A: sleeve idle -------------------------------------------------
    ns.sleeve.setToIdle(0);
    await ns.sleep(2000);
    rec.phaseATask = (() => { const t = ns.sleeve.getTask(0); return t ? t.type : null; })();
    rec.phaseA = await runPhase("sleeve-idle");
    flush();

    // ---- Phase B: sleeve on Bladeburner contracts -----------------------------
    let assigned = null;
    try { assigned = ns.sleeve.setToBladeburnerAction(0, CONTRACT_ACTION, CONTRACT_NAME); }
    catch (err) { rec.assignError = String(err).slice(0, 200); }
    rec.assignReturned = assigned;
    await ns.sleep(2000);
    // Verify with getTask -- never trust the setter's return value.
    const verify = ns.sleeve.getTask(0);
    rec.phaseBTask = verify ? JSON.parse(JSON.stringify(verify)) : null;
    rec.phaseBVerified = !!verify && verify.type === "BLADEBURNER";
    flush();

    if (!rec.phaseBVerified) {
      rec.verdict = "could-not-assign";
      ns.tprint("sleevebbprobe: sleeve would not take the Bladeburner action -- task reads " +
        (verify ? verify.type : "null") + (rec.assignError ? " | " + rec.assignError : ""));
    } else {
      rec.phaseB = await runPhase("sleeve-on-contracts");
      const a = rec.phaseA.rankPerHour, b = rec.phaseB.rankPerHour;
      rec.ratio = a > 0 ? b / a : null;
      rec.verdict = rec.ratio === null ? "no-baseline"
        : rec.ratio >= 1.6 ? "PER-ACTOR (parallelism real)"
        : rec.ratio <= 1.15 ? "PER-CITY (sleeve competes, adds ~nothing)"
        : "PARTIAL (shared pool with its own regen)";
    }
  } catch (err) {
    rec.threw = String(err).slice(0, 300);
  } finally {
    try {
      if (rec.originalTask && rec.originalTask.type === "SYNCHRO") ns.sleeve.setToSynchronize(0);
      else if (rec.originalTask && rec.originalTask.type === "RECOVERY") ns.sleeve.setToShockRecovery(0);
      else ns.sleeve.setToIdle(0);
      rec.restored = true;
    } catch { rec.restored = false; }
    flush();
  }

  ns.tprint("sleevebbprobe: " + phaseMin + " min per phase");
  if (rec.phaseA) ns.tprint("  A sleeve idle      : " + rec.phaseA.gain + " rank in " +
    rec.phaseA.hours.toFixed(3) + "h = " + rec.phaseA.rankPerHour.toFixed(1) + " rank/h");
  if (rec.phaseB) ns.tprint("  B sleeve contracts : " + rec.phaseB.gain + " rank in " +
    rec.phaseB.hours.toFixed(3) + "h = " + rec.phaseB.rankPerHour.toFixed(1) + " rank/h");
  if (rec.ratio) ns.tprint("  ratio B/A = " + rec.ratio.toFixed(3));
  ns.tprint("  VERDICT: " + rec.verdict);
  ns.tprint("  -> sleevebbprobe-" + rec.ts + ".json");
}
