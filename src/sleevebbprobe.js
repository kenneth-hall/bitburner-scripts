/**
 * sleevebbprobe.js - what should the one sleeve be doing in a Bladeburner node?
 *
 * TWO QUESTIONS, ONE INTERLEAVED RUN. Both are open in the docs and both are answered against a
 * matched sleeve-idle control, which is the thing every previous attempt lacked.
 *
 *   Q1 (primary) - does `Infiltrate Synthoids` actually generate supply?
 *       docs/sleeve-grafting-reference.md Section 6 measured contract regeneration at ~1.00/min
 *       and operations at 0.63-0.81/min, but EVERY sample was taken with the sleeve already
 *       infiltrating. Section 9 records the attribution as unestablished and asks for exactly one
 *       thing: a matched window with the sleeve idle. The C arms here are that window.
 *       This is primary because Tracking is SUPPLY-LIMITED: countRemaining reads ~2.2, not the
 *       ~3,340 the manager's cityStock aggregate suggests (that figure sums all contracts, and the
 *       stock sits in Bounty Hunter ~1,885 and Retirement, which the engine barely touches). If
 *       Infiltrate really doubles regeneration it is aimed straight at the binding constraint.
 *
 *   Q2 - does a sleeve on CONTRACTS add player rank, or only drain the pool?
 *       2026-08-18 measured the drain (0.308-0.34/min) and that half is sound. The rank half was
 *       never tested: the engine was paused, so player rank could not move in EITHER arm, and the
 *       probe self-reported INCONCLUSIVE. A control that cannot move is not a control. The engine
 *       is live here at ~214 rank/h, so rank can move, and that makes the question answerable.
 *
 * WHY THE SLEEVE TAKES **Bounty Hunter**, NOT Tracking.
 * Tracking is the engine's earner and is nearly dry (~2.2 remaining), so pointing the sleeve at it
 * would steal directly from the run to answer a question. Bounty Hunter holds ~1,885 and the engine
 * only dips into it opportunistically when Tracking runs out. /!\ It is NOT a zero-background
 * channel -- the engine has 31 attempts on it, unlike BN6 where it had never been run once -- so
 * the background is real, small, and must be subtracted via the idle arms rather than assumed away.
 *
 * THE INSTRUMENT, AND ONE CORRECTION TO THE RECORD.
 * The docs say `getTask` is blind to a sleeve's Bladeburner task (null on all 36 samples of the
 * 2026-08-18 run). Measured here 2026-09-21, that is NOT true for Infiltrate: getTask returns
 * {type: "INFILTRATE", cyclesWorked, cyclesNeeded}. Whether "Take on contracts" reports is still
 * open, so this probe logs getTask raw every sample as evidence and does not depend on it.
 * What it depends on instead is `getActionCountRemaining` drain as a POSITIVE CONTROL: if the
 * contract arms drain Bounty Hunter faster than the idle arms, the sleeve is demonstrably working
 * whatever the setter or getTask claim. Without that, a flat rank reading is unreadable -- it
 * cannot be told apart from a sleeve that never started, which is the 2026-08-18 mistake.
 *
 * `getActionSuccesses` is an exact integer counter, so it is the low-noise companion to rank/hour.
 *
 * DESIGN. Six INTERLEAVED phases, not two. The engine's rank rate is rising (~3.9%/level at ~1.5
 * levels/h), a monotonic confound that a plain A-then-B ordering would hand to B as if it were an
 * effect -- "a trend read across a known disturbance is not a trend". Interleaving lets the drift
 * be read off A1->A2 and subtracted.
 *   A1 idle -> B1 contracts -> C1 infiltrate -> A2 idle -> B2 contracts -> C2 infiltrate
 *
 * /!\ MUTATES the sleeve's task, and nothing else. It never touches the player action slot --
 * bladeburnermanager.js holds that throughout, which is what makes the engine a stable control.
 * /!\ RESTORE: the original task type is "INFILTRATE", not "BLADEBURNER". An earlier revision of
 * this file tested for "BLADEBURNER" and fell through to setToIdle, which would have silently
 * ended Infiltrate Synthoids and parked the sleeve -- the same failure shape as the sleevemanager
 * bug in BACKLOG.md. Restore therefore targets the ACTION, not a round-trip of the task type, and
 * a 0 GB atExit covers the kill/eviction path a `finally` does not (verified live: it fired on a
 * hard kill and put the sleeve back on Infiltrate).
 *
 * Usage: run sleevebbprobe.js [phaseMinutes]   (default 12 -> ~72 min total)
 *
 * RAM: 30.60 GB measured, against 31.95 GB free on home. Trimmed deliberately --
 * setToSynchronize/setToShockRecovery were dropped because the original task here is Bladeburner
 * and carrying them cost 8 GB home does not have.
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

const DEFAULT_PHASE_MIN = 12;
const SAMPLE_MS = 15000;

const CONTRACT_ACTION = "Take on contracts";
const INFILTRATE_ACTION = "Infiltrate Synthoids";

// The contract the sleeve is pointed at: banked deep, and not the engine's earner.
const SLEEVE_CONTRACT = "Bounty Hunter";
// Engine's earner, tracked only to confirm the probe did not disturb the run.
const ENGINE_CONTRACT = "Tracking";
// Regeneration channels watched for the Infiltrate lift. Retirement is a second, independent
// channel so Q1 does not rest on a single counter.
const WATCH = [
  { key: "tracking", type: "Contracts", name: "Tracking" },
  { key: "bounty", type: "Contracts", name: "Bounty Hunter" },
  { key: "retirement", type: "Contracts", name: "Retirement" },
  { key: "sting", type: "Operations", name: "Sting Operation" },
];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const phaseMin = Number(ns.args[0]) > 0 ? Number(ns.args[0]) : DEFAULT_PHASE_MIN;

  const rec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    phaseMin,
    sampleMs: SAMPLE_MS,
    sleeveContract: SLEEVE_CONTRACT,
    bitNode: (() => { try { return ns.getResetInfo().currentNode; } catch { return null; } })(),
    note: "interleaved idle/contracts/infiltrate; Q1 = does Infiltrate generate supply, Q2 = do sleeve contracts add player rank",
    phases: [],
  };
  const flush = () => ns.write("sleevebbprobe-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  // ---- probes, each defensive: this runs over an hour beside a live engine -------------------
  const readRank = () => { try { return ns.bladeburner.getRank(); } catch { return null; } };
  const readSucc = (t, n) => { try { return ns.bladeburner.getActionSuccesses(t, n); } catch { return null; } };
  const readCount = (t, n) => { try { return ns.bladeburner.getActionCountRemaining(t, n); } catch { return null; } };
  const readLevel = () => { try { return ns.bladeburner.getActionCurrentLevel("Contracts", ENGINE_CONTRACT); } catch { return null; } };
  const readTask = () => { try { return ns.sleeve.getTask(0); } catch { return null; } };

  if (readRank() === null) {
    rec.fatal = "getRank threw -- not in the Bladeburner division";
    flush();
    ns.tprint("sleevebbprobe: ABORT -- " + rec.fatal);
    return;
  }

  const originalTask = readTask();
  rec.originalTask = originalTask ? JSON.parse(JSON.stringify(originalTask)) : null;
  rec.originalTaskVisible = originalTask !== null;

  // A `finally` does not run on a hard kill or a RAM eviction, and this holds the sleeve off its
  // real job for over an hour. atExit is 0 GB and fires on the deaths the game runs callbacks for,
  // so the sleeve goes back even if the run never reaches its own cleanup. Restoring twice is
  // harmless; leaving the sleeve parked silently is the failure worth paying nothing to avoid.
  let restoreDone = false;
  ns.atExit(() => {
    if (restoreDone) return;
    try { ns.sleeve.setToBladeburnerAction(0, INFILTRATE_ACTION); } catch { /* nothing left to try */ }
  });

  const sample = () => {
    const s = {
      t: Date.now(),
      rank: readRank(),
      level: readLevel(),
      succEngine: readSucc("Contracts", ENGINE_CONTRACT),
      succSleeve: readSucc("Contracts", SLEEVE_CONTRACT),
      count: {},
      task: (() => { const t = readTask(); return t ? (t.type || "?") : null; })(),
    };
    for (const w of WATCH) s.count[w.key] = readCount(w.type, w.name);
    return s;
  };

  // Assign without trusting the return value; the caller verifies from the drain, not from this.
  const assign = (mode) => {
    const out = { mode, returned: null, error: null, taskAfter: null };
    try {
      if (mode === "idle") out.returned = ns.sleeve.setToIdle(0);
      else if (mode === "contracts") out.returned = ns.sleeve.setToBladeburnerAction(0, CONTRACT_ACTION, SLEEVE_CONTRACT);
      else if (mode === "infiltrate") out.returned = ns.sleeve.setToBladeburnerAction(0, INFILTRATE_ACTION);
    } catch (err) {
      out.error = String(err).slice(0, 200);
    }
    const t = readTask();
    out.taskAfter = t ? JSON.parse(JSON.stringify(t)) : null;
    return out;
  };

  const runPhase = async (label, mode) => {
    const phase = { label, mode, assign: assign(mode), samples: [] };
    await ns.sleep(3000); // let the assignment settle before the first sample
    const deadline = Date.now() + phaseMin * 60000;
    const store = () => { rec.phases = rec.phases.filter((p) => p.label !== label).concat([phase]); flush(); };
    while (Date.now() < deadline) {
      phase.samples.push(sample());
      store();
      await ns.sleep(SAMPLE_MS);
    }
    phase.samples.push(sample());

    const first = phase.samples[0];
    const last = phase.samples[phase.samples.length - 1];
    const hours = (last.t - first.t) / 3600000;
    const mins = (last.t - first.t) / 60000;
    const rate = (a, b) => (a === null || b === null || mins <= 0 ? null : (b - a) / mins);

    const perMin = {};
    for (const w of WATCH) perMin[w.key] = rate(first.count[w.key], last.count[w.key]);

    phase.summary = {
      minutes: mins,
      n: phase.samples.length,
      rankGain: last.rank - first.rank,
      rankPerHour: hours > 0 ? (last.rank - first.rank) / hours : null,
      succEngineGain: last.succEngine === null || first.succEngine === null ? null : last.succEngine - first.succEngine,
      succSleeveGain: last.succSleeve === null || first.succSleeve === null ? null : last.succSleeve - first.succSleeve,
      countPerMin: perMin,
      levelStart: first.level,
      levelEnd: last.level,
      taskSeen: phase.samples.filter((s) => s.task !== null).length,
      taskTypes: Array.from(new Set(phase.samples.map((s) => s.task).filter((x) => x !== null))),
    };
    store();
    ns.tprint("sleevebbprobe: " + label + " -- " + phase.summary.rankPerHour.toFixed(1) +
      " rank/h | succ eng+" + phase.summary.succEngineGain + " slv+" + phase.summary.succSleeveGain +
      " | bounty " + (perMin.bounty === null ? "?" : perMin.bounty.toFixed(3)) + "/min");
    return phase;
  };

  try {
    await runPhase("A1-idle", "idle");
    await runPhase("B1-contracts", "contracts");
    await runPhase("C1-infiltrate", "infiltrate");
    await runPhase("A2-idle", "idle");
    await runPhase("B2-contracts", "contracts");
    await runPhase("C2-infiltrate", "infiltrate");

    // ---- analysis ------------------------------------------------------------------------------
    const byLabel = {};
    for (const p of rec.phases) byLabel[p.label] = p.summary;
    const mean = (xs) => {
      const v = xs.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const arm = (a, b, pick) => mean([byLabel[a] ? pick(byLabel[a]) : null, byLabel[b] ? pick(byLabel[b]) : null]);
    const IDLE = ["A1-idle", "A2-idle"];
    const CON = ["B1-contracts", "B2-contracts"];
    const INF = ["C1-infiltrate", "C2-infiltrate"];

    const idleRank = arm(IDLE[0], IDLE[1], (s) => s.rankPerHour);
    const conRank = arm(CON[0], CON[1], (s) => s.rankPerHour);
    const infRank = arm(INF[0], INF[1], (s) => s.rankPerHour);
    const idleSlvSucc = arm(IDLE[0], IDLE[1], (s) => s.succSleeveGain);
    const conSlvSucc = arm(CON[0], CON[1], (s) => s.succSleeveGain);
    const idleBounty = arm(IDLE[0], IDLE[1], (s) => s.countPerMin.bounty);
    const conBounty = arm(CON[0], CON[1], (s) => s.countPerMin.bounty);
    const infBounty = arm(INF[0], INF[1], (s) => s.countPerMin.bounty);
    const idleRet = arm(IDLE[0], IDLE[1], (s) => s.countPerMin.retirement);
    const infRet = arm(INF[0], INF[1], (s) => s.countPerMin.retirement);
    const idleSting = arm(IDLE[0], IDLE[1], (s) => s.countPerMin.sting);
    const infSting = arm(INF[0], INF[1], (s) => s.countPerMin.sting);

    // Engine drift, read off the two idle arms so it is not mistaken for an effect.
    const drift = byLabel[IDLE[0]] && byLabel[IDLE[1]]
      ? byLabel[IDLE[1]].rankPerHour - byLabel[IDLE[0]].rankPerHour : null;

    // POSITIVE CONTROL for Q2. Without it a flat rank reading is unreadable.
    const q2ControlPassed = idleBounty !== null && conBounty !== null && conBounty < idleBounty - 0.05;

    const q1 = {
      idleBountyPerMin: idleBounty, infiltrateBountyPerMin: infBounty,
      idleRetirementPerMin: idleRet, infiltrateRetirementPerMin: infRet,
      idleStingPerMin: idleSting, infiltrateStingPerMin: infSting,
      bountyLift: idleBounty !== null && infBounty !== null ? infBounty - idleBounty : null,
      retirementLift: idleRet !== null && infRet !== null ? infRet - idleRet : null,
      stingLift: idleSting !== null && infSting !== null ? infSting - idleSting : null,
    };
    const lifts = [q1.bountyLift, q1.retirementLift, q1.stingLift].filter((x) => x !== null);
    q1.meanLift = lifts.length ? lifts.reduce((a, b) => a + b, 0) / lifts.length : null;
    q1.verdict = q1.meanLift === null ? "UNREADABLE"
      : q1.meanLift > 0.15 ? "INFILTRATE GENERATES SUPPLY -- attribution now established against a matched idle control"
      : q1.meanLift < -0.15 ? "INFILTRATE SUPPRESSES SUPPLY -- unexpected, re-measure before acting"
      : "NO MEASURABLE LIFT -- the ~1.00/min in the docs is NOT attributable to Infiltrate; the sleeve is doing nothing useful there";

    const q2 = {
      idleRankPerHour: idleRank, contractRankPerHour: conRank, infiltrateRankPerHour: infRank,
      rankRatio: idleRank ? conRank / idleRank : null,
      idleSleeveSuccGain: idleSlvSucc, contractSleeveSuccGain: conSlvSucc,
      succDelta: idleSlvSucc !== null && conSlvSucc !== null ? conSlvSucc - idleSlvSucc : null,
      idleBountyPerMin: idleBounty, contractBountyPerMin: conBounty,
      drainDelta: idleBounty !== null && conBounty !== null ? conBounty - idleBounty : null,
      positiveControlPassed: q2ControlPassed,
    };
    q2.verdict = !q2ControlPassed
      ? "INCONCLUSIVE -- positive control FAILED: the contract arms show no extra Bounty Hunter drain, so the sleeve cannot be shown to have been working. Do NOT read the rank result (this is the 2026-08-18 trap)."
      : q2.succDelta !== null && q2.succDelta > 1
        ? "ADDS RANK -- sleeve contract completions credit the player's success counter (+" + q2.succDelta.toFixed(1) + " per phase over idle)"
        : "COMPETES, ADDS NOTHING -- the sleeve provably drained supply while the player's success counter did not move. The 2026-08-18 conclusion, now with a control that COULD have moved.";

    rec.analysis = { engineDriftRankPerHour: drift, q1, q2 };
    rec.verdict = "Q1: " + q1.verdict + " || Q2: " + q2.verdict;
  } catch (err) {
    rec.threw = String(err).slice(0, 300);
  } finally {
    const restore = { attempted: INFILTRATE_ACTION, error: null };
    try {
      ns.sleeve.setToBladeburnerAction(0, INFILTRATE_ACTION);
    } catch (err) {
      restore.error = String(err).slice(0, 200);
    }
    const t = readTask();
    restore.taskAfter = t ? JSON.parse(JSON.stringify(t)) : null;
    restore.verified = !!t && t.type === "INFILTRATE";
    rec.restore = restore;
    restoreDone = restore.verified;
    flush();
  }

  ns.tprint("===== sleevebbprobe =====");
  for (const p of rec.phases) {
    if (!p.summary) continue;
    const c = p.summary.countPerMin;
    ns.tprint("  " + p.label.padEnd(14) + p.summary.rankPerHour.toFixed(1).padStart(7) + " rank/h" +
      " | succ eng+" + String(p.summary.succEngineGain).padStart(2) + " slv+" + String(p.summary.succSleeveGain).padStart(2) +
      " | bounty " + (c.bounty === null ? "?" : c.bounty.toFixed(3)).padStart(7) +
      " retire " + (c.retirement === null ? "?" : c.retirement.toFixed(3)).padStart(7) +
      " sting " + (c.sting === null ? "?" : c.sting.toFixed(3)).padStart(7) +
      " | task " + (p.summary.taskTypes.join(",") || "none"));
  }
  if (rec.analysis) {
    ns.tprint("  Q1 mean supply lift from Infiltrate: " +
      (rec.analysis.q1.meanLift === null ? "?" : rec.analysis.q1.meanLift.toFixed(3)) + "/min");
    ns.tprint("  Q2 positive control passed: " + rec.analysis.q2.positiveControlPassed +
      " | succ delta " + (rec.analysis.q2.succDelta === null ? "?" : rec.analysis.q2.succDelta.toFixed(1)));
    ns.tprint("  engine drift across run: " +
      (rec.analysis.engineDriftRankPerHour === null ? "?" : rec.analysis.engineDriftRankPerHour.toFixed(1)) + " rank/h");
  }
  ns.tprint("  " + (rec.verdict || rec.threw || rec.fatal || "no verdict"));
  ns.tprint("  restored: " + JSON.stringify(rec.restore));
  ns.tprint("  -> sleevebbprobe-" + rec.ts + ".json");
}
