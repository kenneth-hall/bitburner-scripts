/**
 * sleevesyncprobe.js - measures how much of a sleeve's experience ACTUALLY reaches the player.
 *
 * WHY THIS IS THE LOAD-BEARING MEASUREMENT OF BN10.
 * BN10's entry cost is a combat gate: joinBladeburnerDivision() needs all four combat stats
 * at 100, and BN10 multiplies combat LEVELS by 0.40, which (levels being logarithmic in exp)
 * compounds into an estimated ~588k exp -- about 27x what BN6's same gate cost. That estimate
 * treats the gate as SERIAL: one player, one action slot, days of grinding before the win-
 * condition engine can even start.
 *
 * The in-game FAQ says it is not serial:
 *   "When a sleeve earns experience, it earns experience for itself, the player's original
 *    consciousness, AND all other sleeves."
 *   "Let N be the sleeve's synchronization ... both the sleeve and [the player gain N%]."
 *
 * If that is true and live, N sleeves on crime attack the combat gate IN PARALLEL, and the
 * whole BN10 plan changes shape -- the gate stops being a multi-day serial blocker and the
 * sleeve manager becomes the entry engine rather than a side feature.
 *
 * 📌 This is exactly the class of claim CLAUDE.md says must not be taken on faith: it comes
 * from FAQ PROSE, not from the API, and the last estimate built on unchecked prose (the
 * combat gate itself, at base mult 1.28) was 57% wrong. So: measure it.
 *
 * METHOD -- an A/B against the player's own exp counter, which is the only number that
 * actually matters. The player's own crime keeps running through BOTH phases at a constant
 * rate, so it subtracts out cleanly:
 *   Phase A (baseline): every sleeve Idle.        -> player exp/sec from the player alone
 *   Phase B (treatment): every sleeve on Mug.     -> player exp/sec with sleeves feeding in
 *   transfer per sleeve = (rateB - rateA) / numSleeves
 * Cross-checked against each sleeve's OWN exp gain in phase B, which gives the realised
 * transfer RATIO to compare against the reported `sync` value.
 *
 * ⚠️ MUTATES SLEEVE TASKS. Original tasks are captured up front and restored at the end
 * (including on error, via a finally block). Nothing is bought and the player's own action
 * is never touched.
 *
 * Usage: run sleevesyncprobe.js [phaseSeconds]      (default 90)
 *
 * RAM: 5 sleeve methods x 4 GB = 20 GB + change.
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

const DEFAULT_PHASE_SEC = 90;
const COMBAT_STATS = ["strength", "defense", "dexterity", "agility"];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const phaseSec = Number(ns.args[0]) > 0 ? Number(ns.args[0]) : DEFAULT_PHASE_SEC;

  const rec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    phaseSec,
    note: "A/B: does sleeve exp reach the player, and at what fraction of reported sync",
  };

  const write = () => ns.write("sleevesyncprobe-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  const combatExpOf = (p) => {
    const out = {};
    for (const k of COMBAT_STATS) out[k] = p.exp[k];
    return out;
  };
  const combatTotal = (e) => COMBAT_STATS.reduce((acc, k) => acc + e[k], 0);

  let count = 0;
  try {
    count = ns.sleeve.getNumSleeves();
  } catch (err) {
    rec.fatal = "getNumSleeves threw: " + String(err).slice(0, 200);
    write();
    ns.tprint("sleevesyncprobe: ABORT -- " + rec.fatal);
    return;
  }
  rec.numSleeves = count;
  if (count === 0) {
    rec.fatal = "no sleeves";
    write();
    ns.tprint("sleevesyncprobe: ABORT -- no sleeves");
    return;
  }

  // ---- capture original tasks so the probe can put everything back --------------
  const originals = [];
  for (let i = 0; i < count; i++) {
    let t = null;
    try {
      t = ns.sleeve.getTask(i);
    } catch (err) {
      t = { readError: String(err).slice(0, 120) };
    }
    originals.push(t);
  }
  rec.originalTasks = JSON.parse(JSON.stringify(originals));

  const snapshotSleeves = () => {
    const out = [];
    for (let i = 0; i < count; i++) {
      try {
        const s = ns.sleeve.getSleeve(i);
        out.push({
          index: i,
          sync: s.sync,
          shock: s.shock,
          memory: s.memory,
          storedCycles: s.storedCycles,
          exp: combatExpOf(s),
        });
      } catch (err) {
        out.push({ index: i, error: String(err).slice(0, 120) });
      }
    }
    return out;
  };

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    rec.restore = [];
    for (let i = 0; i < count; i++) {
      const t = originals[i];
      let how = "idle";
      try {
        if (t && t.type === "CRIME" && t.crimeType) {
          ns.sleeve.setToCommitCrime(i, t.crimeType);
          how = "crime:" + t.crimeType;
        } else if (t && t.type === "SYNCHRO") {
          ns.sleeve.setToSynchronize(i);
          how = "synchronize";
        } else if (t && t.type === "RECOVERY") {
          ns.sleeve.setToShockRecovery(i);
          how = "shock-recovery";
        } else {
          // Every other original shape (Idle, Class, Recovery, Synchro, ...) is restored
          // to Idle rather than guessed at. Recorded so the divergence is visible rather
          // than silent -- see rec.originalTasks for what it actually was.
          ns.sleeve.setToIdle(i);
          how = t && t.type ? "idle (was " + t.type + ", NOT restored exactly)" : "idle";
        }
      } catch (err) {
        how = "RESTORE FAILED: " + String(err).slice(0, 120);
      }
      rec.restore.push({ index: i, how });
    }
  };

  try {
    // ================= PHASE A -- baseline, all sleeves idle =====================
    for (let i = 0; i < count; i++) {
      try { ns.sleeve.setToIdle(i); } catch (err) { /* recorded via verify below */ }
    }
    await ns.sleep(1500); // let the assignment settle before sampling

    rec.phaseA = {};
    rec.phaseA.verifyTasks = [];
    for (let i = 0; i < count; i++) {
      // Never trust a setter's return value -- verify with getTask (standing rule).
      try {
        const t = ns.sleeve.getTask(i);
        rec.phaseA.verifyTasks.push({ index: i, type: t ? t.type : null });
      } catch (err) {
        rec.phaseA.verifyTasks.push({ index: i, error: String(err).slice(0, 120) });
      }
    }

    const pA0 = ns.getPlayer();
    const sA0 = snapshotSleeves();
    const tA0 = Date.now();
    await ns.sleep(phaseSec * 1000);
    const pA1 = ns.getPlayer();
    const sA1 = snapshotSleeves();
    const tA1 = Date.now();

    rec.phaseA.elapsedSec = (tA1 - tA0) / 1000;
    rec.phaseA.playerExpStart = combatExpOf(pA0);
    rec.phaseA.playerExpEnd = combatExpOf(pA1);
    rec.phaseA.playerCombatGain = combatTotal(combatExpOf(pA1)) - combatTotal(combatExpOf(pA0));
    rec.phaseA.playerRatePerSec = rec.phaseA.playerCombatGain / rec.phaseA.elapsedSec;
    rec.phaseA.sleevesStart = sA0;
    rec.phaseA.sleevesEnd = sA1;

    // ================= PHASE B -- treatment, all sleeves on Mug ==================
    rec.phaseB = {};
    rec.phaseB.assign = [];
    for (let i = 0; i < count; i++) {
      try {
        const ok = ns.sleeve.setToCommitCrime(i, "Mug");
        rec.phaseB.assign.push({ index: i, returned: ok });
      } catch (err) {
        rec.phaseB.assign.push({ index: i, error: String(err).slice(0, 160) });
      }
    }
    await ns.sleep(1500);

    rec.phaseB.verifyTasks = [];
    for (let i = 0; i < count; i++) {
      try {
        const t = ns.sleeve.getTask(i);
        rec.phaseB.verifyTasks.push({
          index: i,
          type: t ? t.type : null,
          crimeType: t && t.crimeType ? t.crimeType : undefined,
        });
      } catch (err) {
        rec.phaseB.verifyTasks.push({ index: i, error: String(err).slice(0, 120) });
      }
    }

    const pB0 = ns.getPlayer();
    const sB0 = snapshotSleeves();
    const tB0 = Date.now();
    await ns.sleep(phaseSec * 1000);
    const pB1 = ns.getPlayer();
    const sB1 = snapshotSleeves();
    const tB1 = Date.now();

    rec.phaseB.elapsedSec = (tB1 - tB0) / 1000;
    rec.phaseB.playerExpStart = combatExpOf(pB0);
    rec.phaseB.playerExpEnd = combatExpOf(pB1);
    rec.phaseB.playerCombatGain = combatTotal(combatExpOf(pB1)) - combatTotal(combatExpOf(pB0));
    rec.phaseB.playerRatePerSec = rec.phaseB.playerCombatGain / rec.phaseB.elapsedSec;
    rec.phaseB.sleevesStart = sB0;
    rec.phaseB.sleevesEnd = sB1;

    // ================= DERIVED ===================================================
    const deltaRate = rec.phaseB.playerRatePerSec - rec.phaseA.playerRatePerSec;
    rec.derived = {
      playerRateA: rec.phaseA.playerRatePerSec,
      playerRateB: rec.phaseB.playerRatePerSec,
      deltaRatePerSec: deltaRate,
      deltaPerSleevePerSec: deltaRate / count,
      // The headline: does the player benefit from sleeve work AT ALL?
      transferIsReal: deltaRate > 0,
      multiplierOnPlayerRate: rec.phaseA.playerRatePerSec > 0
        ? rec.phaseB.playerRatePerSec / rec.phaseA.playerRatePerSec
        : null,
    };

    // Per-sleeve realised transfer ratio: what the sleeve earned for ITSELF in phase B
    // vs what the player gained. Compared against the reported `sync` so the FAQ's
    // "player gains N%" claim is checked as a NUMBER, not just a direction.
    let sleeveOwnGainTotal = 0;
    rec.derived.perSleeve = [];
    for (let i = 0; i < count; i++) {
      const a = sB0[i];
      const b = sB1[i];
      if (!a || !b || a.error || b.error) continue;
      const own = combatTotal(b.exp) - combatTotal(a.exp);
      sleeveOwnGainTotal += own;
      rec.derived.perSleeve.push({
        index: i,
        sync: a.sync,
        shock: a.shock,
        ownCombatGain: own,
        ownRatePerSec: own / rec.phaseB.elapsedSec,
        storedCyclesStart: a.storedCycles,
        storedCyclesEnd: b.storedCycles,
      });
    }
    rec.derived.sleeveOwnGainTotal = sleeveOwnGainTotal;
    rec.derived.playerGainFromSleeves = deltaRate * rec.phaseB.elapsedSec;
    rec.derived.realisedTransferRatio = sleeveOwnGainTotal > 0
      ? (deltaRate * rec.phaseB.elapsedSec) / sleeveOwnGainTotal
      : null;
    const syncs = rec.derived.perSleeve.map((r) => r.sync).filter((v) => typeof v === "number");
    rec.derived.reportedSyncMean = syncs.length
      ? syncs.reduce((a, b) => a + b, 0) / syncs.length
      : null;
    rec.derived.predictedTransferRatio = rec.derived.reportedSyncMean !== null
      ? rec.derived.reportedSyncMean / 100
      : null;
  } catch (err) {
    rec.threw = String(err).slice(0, 400);
  } finally {
    restore();
    write();
  }

  // ---- terminal summary --------------------------------------------------------
  ns.tprint("sleevesyncprobe: " + count + " sleeves, " + phaseSec + "s per phase");
  if (rec.threw) ns.tprint("  THREW: " + rec.threw);
  if (rec.derived) {
    const d = rec.derived;
    ns.tprint("  player combat exp/sec  A (sleeves idle): " + d.playerRateA.toFixed(4));
    ns.tprint("  player combat exp/sec  B (sleeves Mug):  " + d.playerRateB.toFixed(4));
    ns.tprint("  delta: " + d.deltaRatePerSec.toFixed(4) + "/sec total, " +
      d.deltaPerSleevePerSec.toFixed(4) + "/sec per sleeve");
    ns.tprint("  TRANSFER IS REAL: " + (d.transferIsReal ? "YES" : "NO"));
    if (d.multiplierOnPlayerRate !== null) {
      ns.tprint("  player rate multiplier from " + count + " sleeves: x" +
        d.multiplierOnPlayerRate.toFixed(3));
    }
    ns.tprint("  realised transfer ratio: " +
      (d.realisedTransferRatio !== null ? d.realisedTransferRatio.toFixed(4) : "n/a") +
      "  vs predicted (sync/100): " +
      (d.predictedTransferRatio !== null ? d.predictedTransferRatio.toFixed(4) : "n/a"));
  }
  ns.tprint("  tasks restored: " + (rec.restore ? rec.restore.length : 0));
  ns.tprint("  -> sleevesyncprobe-" + rec.ts + ".json");
}
