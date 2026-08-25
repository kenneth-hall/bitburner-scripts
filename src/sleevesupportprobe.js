/**
 * sleevesupportprobe.js - what does the sleeve task "Support main sleeve" actually DO?
 *
 * WHY A THIRD PROBE, and what killed the first two (do not repeat these):
 *   sleevebbprobe.js   - A/B'd the rank RATE with an unstable control that switched to HEALING
 *                        mid-run, 6.40 rank of total signal, and the two actors on DIFFERENT
 *                        contracts. Unusable.
 *   sleevepoolprobe.js - observed the pool directly (good) but ran with the ENGINE PAUSED, so
 *                        player rank could not move in EITHER phase. Its "produced zero rank"
 *                        reading was guaranteed by the setup. Self-reported INCONCLUSIVE:
 *                        taskHeldSamples 0 of 36, completionsObserved 0.
 *
 * A CONTROL THAT CANNOT MOVE IS NOT A CONTROL. This probe runs the engine LIVE in every phase,
 * so the host's rank is free to move under both treatment and control.
 *
 * TWO DESIGN DECISIONS THAT MATTER:
 *
 * 1. NO BOUNDARY DETECTION. Phase 40's WI1 shipped a correct implementation of a broken
 *    mechanism -- detectActionBoundary bailed on !sameAction while the engine alternates on
 *    99.3% of consecutive starts, so no unit test could have caught it. This probe never
 *    detects a start. It reads bladeburnermanager's OWN ledger
 *    (bladeburner-state.json -> levelGovernor.actions.<name>.byLevel.<level>), which already
 *    counts {attempts, successes, rankSum} and is the instrument the engine itself trusts.
 *
 * 2. BUCKETED BY LEVEL, so the autolevel climb cannot masquerade as an effect. Tracking's yield
 *    grows +4.03%/level; comparing raw rank/hour across phases would credit that climb to the
 *    sleeve. Comparing WITHIN a level bucket cannot.
 *
 * SHAPE: A1 (sleeve Idle) -> B (sleeve Supporting) -> A2 (sleeve Idle). The trailing control is
 * what separates a real effect from monotonic drift; a two-phase A/B cannot.
 *
 * INSTRUMENT GUARD. The prior probe's fatal detail: getTask read null on ALL 36 samples while
 * the counter drained, so it could not see a sleeve's Bladeburner task at all. If the task does
 * not HOLD here, this probe reports INSTRUMENT FAILURE and refuses to publish a number.
 * Leading suspect for that failure, never checked: sleeve HP read 1/17 at the time. HP is
 * sampled every tick here so the hypothesis is testable from the log either way.
 *
 * MUTATES: reassigns the sleeve, and drops sleevemanager-pause.txt so sleevemanager.js cannot
 * reassign it back mid-phase. Both restored in a finally. It does NOT pause
 * bladeburnermanager.js -- that is the whole point.
 *
 * Usage: run sleevesupportprobe.js [phaseMinutes] [sleeveIndex]   (default 45, 0)
 * ASCII-only: brand-new src/ files may need in-game wget seeding, which mangles UTF-8.
 * Writes sleevesupportprobe-<epoch>.json (synced to logs/ by the vite.config.ts filter).
 */

const STATE_FILE = "bladeburner-state.json";
const SLEEVE_PAUSE_FILE = "sleevemanager-pause.txt";
const SUPPORT_TASK = "Support main sleeve";
const SAMPLE_MS = 10000;
const DEFAULT_PHASE_MIN = 45;
const MIN_HOLD_FRACTION = 0.8; // below this, the instrument is not observing the task

/** Flatten the engine's ledger to { "<action>|<level>": {attempts, successes, rankSum} }. */
function snapshotLedger(ns) {
  const out = { buckets: {}, rank: null, level: {}, stateTs: null, engineOff: null };
  let parsed = null;
  try { parsed = JSON.parse(ns.read(STATE_FILE)); } catch { return out; }
  if (!parsed) return out;
  out.rank = parsed.rank ?? null;
  out.stateTs = parsed.timestamp ?? null;
  out.engineOff = parsed.off ?? null;
  const actions = parsed.levelGovernor?.actions ?? {};
  for (const name of Object.keys(actions)) {
    const entry = actions[name];
    out.level[name] = entry?.level ?? null;
    const byLevel = entry?.byLevel ?? {};
    for (const lvl of Object.keys(byLevel)) {
      const bucket = byLevel[lvl];
      out.buckets[name + "|" + lvl] = {
        attempts: bucket?.attempts ?? 0,
        successes: bucket?.successes ?? 0,
        rankSum: bucket?.rankSum ?? 0,
      };
    }
  }
  return out;
}

/** Pure. Per-bucket delta between two ledger snapshots, dropping buckets that saw no attempts. */
export function ledgerDelta(before, after) {
  const out = {};
  for (const key of Object.keys(after.buckets)) {
    const post = after.buckets[key];
    const pre = before.buckets[key] ?? { attempts: 0, successes: 0, rankSum: 0 };
    const attempts = post.attempts - pre.attempts;
    if (attempts <= 0) continue;
    const successes = post.successes - pre.successes;
    const rankSum = post.rankSum - pre.rankSum;
    out[key] = {
      attempts,
      successes,
      rankSum,
      successRate: attempts > 0 ? successes / attempts : null,
      rankPerAttempt: attempts > 0 ? rankSum / attempts : null,
    };
  }
  return out;
}

/** Pure. Sum a delta map into one row, so phases also compare on a single pair of numbers. */
export function totalDelta(delta) {
  let attempts = 0, successes = 0, rankSum = 0;
  for (const key of Object.keys(delta)) {
    attempts += delta[key].attempts;
    successes += delta[key].successes;
    rankSum += delta[key].rankSum;
  }
  return {
    attempts, successes, rankSum,
    successRate: attempts > 0 ? successes / attempts : null,
    rankPerAttempt: attempts > 0 ? rankSum / attempts : null,
  };
}

/** Pure. Compare treatment against the POOLED controls, per shared level bucket. */
export function compare(controlA, controlB, treatment) {
  const rows = [];
  const keys = Object.keys(treatment).filter((k) => controlA[k] || controlB[k]);
  for (const key of keys) {
    const ctlAttempts = (controlA[key]?.attempts ?? 0) + (controlB[key]?.attempts ?? 0);
    const ctlRank = (controlA[key]?.rankSum ?? 0) + (controlB[key]?.rankSum ?? 0);
    const ctlSucc = (controlA[key]?.successes ?? 0) + (controlB[key]?.successes ?? 0);
    if (ctlAttempts <= 0) continue;
    const treat = treatment[key];
    const ctlPer = ctlRank / ctlAttempts;
    rows.push({
      bucket: key,
      controlAttempts: ctlAttempts,
      treatmentAttempts: treat.attempts,
      controlRankPerAttempt: ctlPer,
      treatmentRankPerAttempt: treat.rankPerAttempt,
      rankRatio: ctlPer > 0 ? treat.rankPerAttempt / ctlPer : null,
      controlSuccessRate: ctlSucc / ctlAttempts,
      treatmentSuccessRate: treat.successRate,
    });
  }
  return rows;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const phaseMin = Number(ns.args[0]) > 0 ? Number(ns.args[0]) : DEFAULT_PHASE_MIN;
  const sleeveIdx = Number(ns.args[1]) >= 0 ? Number(ns.args[1]) : 0;

  const rec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "what does 'Support main sleeve' do to the HOST's realised rank? engine stays LIVE",
    phaseMin, sleeveIdx,
    phases: {},
    samples: { A1: [], B: [], A2: [] },
  };
  const flush = (label) => {
    rec.stage = label;
    try { ns.write("sleevesupportprobe-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w"); }
    catch (err) { ns.tprint("sleevesupportprobe: WRITE FAILED at " + label + ": " + String(err)); }
  };

  if (ns.sleeve.getNumSleeves() <= sleeveIdx) {
    rec.abort = "no sleeve at index " + sleeveIdx;
    flush("abort");
    ns.tprint("sleevesupportprobe: ABORT - " + rec.abort);
    return;
  }

  // The engine MUST be live, or this repeats sleevepoolprobe's fatal flaw.
  const opening = snapshotLedger(ns);
  if (opening.stateTs === null) {
    rec.abort = "cannot read " + STATE_FILE + " - is bladeburnermanager.js running?";
    flush("abort");
    ns.tprint("sleevesupportprobe: ABORT - " + rec.abort);
    return;
  }
  const stateAgeMs = Date.now() - opening.stateTs;
  if (opening.engineOff === true || stateAgeMs > 120000) {
    rec.abort = "engine not live (off=" + opening.engineOff + ", state age " +
      Math.round(stateAgeMs / 1000) + "s). A control that cannot move is not a control.";
    flush("abort");
    ns.tprint("sleevesupportprobe: ABORT - " + rec.abort);
    return;
  }
  rec.originalTask = ns.sleeve.getTask(sleeveIdx);
  flush("start");

  ns.write(SLEEVE_PAUSE_FILE, "paused by sleevesupportprobe.js @ " + rec.iso + "\n", "w");

  const runPhase = async (label, assign) => {
    const phase = { label, startMs: Date.now(), holdSamples: 0, totalSamples: 0, taskShapes: [] };
    phase.assignReturned = assign();
    const before = snapshotLedger(ns);
    const endMs = Date.now() + phaseMin * 60000;
    while (Date.now() < endMs) {
      await ns.sleep(SAMPLE_MS);
      const task = ns.sleeve.getTask(sleeveIdx);
      const person = ns.sleeve.getSleeve(sleeveIdx);
      phase.totalSamples++;
      const isSupport = !!task && JSON.stringify(task).indexOf(SUPPORT_TASK) >= 0;
      if (label === "B" ? isSupport : task === null) phase.holdSamples++;
      if (phase.taskShapes.length < 3 && task !== null) phase.taskShapes.push(task);
      rec.samples[label].push({
        ms: Date.now(),
        task,
        hp: person?.hp ? person.hp.current + "/" + person.hp.max : null,
        shock: person?.shock ?? null,
        sync: person?.sync ?? null,
      });
      // Re-assert: sleevemanager is paused, but a hospitalisation can still drop the task.
      if (label === "B" && !isSupport) assign();
    }
    const after = snapshotLedger(ns);
    phase.endMs = Date.now();
    phase.rankBefore = before.rank;
    phase.rankAfter = after.rank;
    phase.rankGained = (after.rank ?? 0) - (before.rank ?? 0);
    phase.delta = ledgerDelta(before, after);
    phase.total = totalDelta(phase.delta);
    phase.holdFraction = phase.totalSamples > 0 ? phase.holdSamples / phase.totalSamples : 0;
    rec.phases[label] = phase;
    flush("phase-" + label);
    return phase;
  };

  try {
    await runPhase("A1", () => { ns.sleeve.setToIdle(sleeveIdx); return true; });
    await runPhase("B", () => ns.sleeve.setToBladeburnerAction(sleeveIdx, SUPPORT_TASK));
    await runPhase("A2", () => { ns.sleeve.setToIdle(sleeveIdx); return true; });

    const treat = rec.phases.B;
    if (treat.holdFraction < MIN_HOLD_FRACTION) {
      rec.verdict = "INSTRUMENT FAILURE - the sleeve held '" + SUPPORT_TASK + "' on only " +
        treat.holdSamples + "/" + treat.totalSamples + " samples (" +
        (treat.holdFraction * 100).toFixed(1) +
        "%). No number is published. Check the sampled HP: the task may not survive a low-HP sleeve.";
    } else {
      rec.comparison = compare(rec.phases.A1.delta, rec.phases.A2.delta, treat.delta);
      rec.verdict = rec.comparison.length === 0
        ? "NO SHARED LEVEL BUCKET between treatment and control - rerun with shorter phases"
        : "MEASURED - see comparison[] for per-level-bucket rank/attempt ratios (1.0 = no effect)";
    }
    flush("done");
    ns.tprint("sleevesupportprobe: " + rec.verdict);
    ns.tprint("sleevesupportprobe:   -> sleevesupportprobe-" + rec.ts + ".json");
  } finally {
    try { ns.sleeve.setToIdle(sleeveIdx); } catch { /* sleeve may be gone */ }
    try { ns.rm(SLEEVE_PAUSE_FILE, "home"); } catch { /* already gone */ }
    rec.sleevePauseCleared = !ns.fileExists(SLEEVE_PAUSE_FILE, "home");
    rec.restoredToIdle = true;
    flush("cleanup");
  }
}
