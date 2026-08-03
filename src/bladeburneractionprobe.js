/**
 * bladeburneractionprobe.js - read-only, post-employment: per-action yield sweep across all
 * 36 Bladeburner actions (3 contracts, 6 operations, 6 general, 21 black ops).
 *
 * Answers the question bladeburnerprobe.js's reachability sweep couldn't: bn6-playbook.md's
 * Stage-2 re-check needs rank-gain-PER-ACTION to turn the known 400,000-rank Operation Daedalus
 * gate into a time estimate. Nothing in the existing probe reads that -- it only confirms the
 * ladder shape, not the climb rate.
 *
 * Deliberately a SIBLING of bladeburnerprobe.js, not an edit to it -- that script is the stable
 * before/after reachability record (docs/bladeburner-reference.md §9: "re-run these, don't
 * rewrite them"). This one is scoped narrowly to keep RAM down: no singularity calls, no
 * BitNode-multiplier reads, no name-lister re-verification (catalog is hardcoded from the
 * already-recovered static list).
 *
 * Read-only: no startAction, no upgradeSkill, no setActionLevel/setActionAutolevel, nothing that
 * mutates game state.
 *
 * RAM: static dot-notation only (see bladeburnerprobe.js's footgun #1 -- bracket dispatch on
 * ns.bladeburner[name]() defeats the RAM analyzer and dies uncatchably at runtime).
 *
 * Writes bladeburneractionprobe-<epoch>.json (synced to logs/ by the vite.config.ts filter).
 */

const CONTRACTS = ["Tracking", "Bounty Hunter", "Retirement"];
const OPERATIONS = [
  "Investigation", "Undercover Operation", "Sting Operation", "Raid",
  "Stealth Retirement Operation", "Assassination",
];
const GENERAL = [
  "Training", "Field Analysis", "Recruitment", "Diplomacy",
  "Hyperbolic Regeneration Chamber", "Incite Violence",
];
const BLACKOPS = [
  "Operation Typhoon", "Operation Zero", "Operation X", "Operation Titan", "Operation Ares",
  "Operation Archangel", "Operation Juggernaut", "Operation Red Dragon", "Operation K",
  "Operation Deckard", "Operation Tyrell", "Operation Wallace", "Operation Shoulder of Orion",
  "Operation Hyron", "Operation Morpheus", "Operation Ion Storm", "Operation Annihilus",
  "Operation Ultron", "Operation Centurion", "Operation Vindictus", "Operation Daedalus",
];

export async function main(ns) {
  // ---- 2026-08-02: arg-gated stamina-cost mode (Phase 39) ---------------------
  // `run bladeburneractionprobe.js stamina` measures THE question that decides
  // whether Overclock is worth 16,908 rank: is stamina spent PER ACTION or PER
  // SECOND of action?
  //
  //   per-SECOND  -> Overclock (8.3x faster actions) gives 8.3x the actions for the
  //                  same stamina/min. Pure win, buy it.
  //   per-ACTION  -> 8.3x faster means 8.3x the stamina burn, duty cycle collapses
  //                  by the same factor, and sustained rank/sec is UNCHANGED.
  //                  Overclock would be 16,908 rank for nothing.
  //
  // Discriminator: run two actions of very different duration and compare stamina
  // drain per MINUTE. Equal drain/min => per-second. Drain/min scaling with 1/duration
  // => per-action.
  //
  // ⚠️ MUTATING (startAction/stopBladeburnerAction), but SELF-MANAGING: it pauses
  // bladeburnermanager.js via the off-marker for the duration and clears it in a
  // `finally`, so no manual kill/restart is needed and a crash cannot leave the engine
  // idle. See runStaminaWindows for why the marker is written from in-game rather than
  // synced from src/. Short windows deliberately: Tracking failures cost 3 HP each and
  // max HP is only 27.
  if (ns.args[0] === "stamina") return await staminaCostMode(ns);

  // ---- 2026-08-02: arg-gated general-action stamina mode (Phase 39 Q6) --------
  // `run bladeburneractionprobe.js general` answers: do General actions OTHER
  // than Hyperbolic Regeneration Chamber cost stamina, or are they free
  // (maintenance actions the engine can run without touching the duty budget)?
  // Deliberately excludes Recruitment -- it has a real, permanent side effect
  // (adds a team member) that D6 hasn't decided to trigger yet; testing it here
  // would make an undecided decision as a probe side effect.
  if (ns.args[0] === "general") return await generalStaminaMode(ns);

  // ---- 2026-08-02: arg-gated level-sweep mode (Phase 39 Q3) --------------------
  // `run bladeburneractionprobe.js levels` answers: is max action level EV-optimal
  // on Tracking, or does the difficulty/reward tradeoff peak lower? ZERO rank/HP
  // risk -- never calls startAction, only setActionLevel + read-back. Restores the
  // original level and autolevel setting in a `finally`.
  if (ns.args[0] === "levels") return await levelSweepMode(ns);

  // ---- 2026-08-02: arg-gated Raid HP-cost mode (Phase 39 Q11) ------------------
  // `run bladeburneractionprobe.js raid` answers: how much HP does a failed
  // OPERATION cost, vs. the known 3 HP/failure for contracts? REAL HP RISK,
  // unlike every other mode in this file -- guarded by a precondition (refuses
  // to start below 85% HP), a hard abort floor (stops immediately at 50% HP,
  // matching bladeburnermanager.js's own HP_FLOOR_FRACTION), and a bounded
  // window (~3 attempts at Raid's current 63s action time, not an open loop).
  if (ns.args[0] === "raid") return await raidHpCostMode(ns);

  const out = { ts: Date.now(), iso: new Date().toISOString(), note: "read-only action-yield sweep" };
  out.stage = "start";
  const emit = (label) => {
    out.stage = label;
    try {
      ns.write("bladeburneractionprobe-" + out.ts + ".json", JSON.stringify(out, null, 2), "w");
    } catch (e) {
      ns.tprint("bladeburneractionprobe: WRITE FAILED at " + label + ": " + String(e));
    }
  };
  emit("opened");

  out.player = { rank: ns.bladeburner.getRank(), stamina: ns.bladeburner.getStamina() };
  emit("player");

  const readAction = (type, name) => {
    const rec = { type, name };
    try { rec.timeMs = ns.bladeburner.getActionTime(type, name); } catch (e) { rec.timeMsErr = String(e).slice(0, 200); }
    try { rec.successChance = ns.bladeburner.getActionEstimatedSuccessChance(type, name); } catch (e) { rec.successChanceErr = String(e).slice(0, 200); }
    try { rec.countRemaining = ns.bladeburner.getActionCountRemaining(type, name); } catch (e) { rec.countRemainingErr = String(e).slice(0, 200); }
    try { rec.rankGain = ns.bladeburner.getActionRankGain(type, name); } catch (e) { rec.rankGainErr = String(e).slice(0, 200); }
    try { rec.rankLoss = ns.bladeburner.getActionRankLoss(type, name); } catch (e) { rec.rankLossErr = String(e).slice(0, 200); }
    try { rec.repGain = ns.bladeburner.getActionRepGain(type, name); } catch (e) { rec.repGainErr = String(e).slice(0, 200); }
    return rec;
  };

  out.contracts = CONTRACTS.map((n) => readAction("Contracts", n));
  emit("contracts");
  out.operations = OPERATIONS.map((n) => readAction("Operations", n));
  emit("operations");
  out.general = GENERAL.map((n) => readAction("General", n));
  emit("general");
  out.blackops = BLACKOPS.map((n) => readAction("Black Operations", n));
  emit("blackops");

  // Cheap derived summary: rank/sec at the estimated-success MIN chance, for the actions that
  // grant rank at all (general actions mostly don't).
  out.rankPerSecEstimate = {};
  for (const bucket of ["contracts", "operations"]) {
    for (const rec of out[bucket]) {
      if (typeof rec.rankGain === "number" && typeof rec.timeMs === "number" && Array.isArray(rec.successChance)) {
        const [pMin] = rec.successChance;
        const expectedGain = pMin * rec.rankGain - (1 - pMin) * (rec.rankLoss || 0);
        out.rankPerSecEstimate[rec.name] = expectedGain / (rec.timeMs / 1000);
      }
    }
  }
  emit("summary");

  out.stage = "complete";
  const file = "bladeburneractionprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");

  ns.tprint("bladeburneractionprobe: rank=" + out.player.rank + " stamina=" + JSON.stringify(out.player.stamina));
  const best = Object.entries(out.rankPerSecEstimate).sort((a, b) => b[1] - a[1]);
  ns.tprint("  best rank/sec (expected, at min success chance): " + best.map(([n, v]) => n + "=" + v.toFixed(3)).join(", "));
  ns.tprint("  -> " + file);
}

// ---- stamina-cost mode (2026-08-02, Phase 39) --------------------------------

const BB_OFF_MARKER = "bladeburner-off.txt";
const SLOT_HOLD_FILE = "bladeburner-slot-hold.json";

const STAMINA_SAMPLES = [
  { type: "Contracts", name: "Tracking", note: "short action (13s base)" },
  { type: "Operations", name: "Investigation", note: "long action (33s base), and the only one with NO HP loss on failure" },
];
const STAMINA_WINDOW_MS = 150_000; // 150s per action -- long enough for several completions of both
const STAMINA_TICK_MS = 5_000;

async function staminaCostMode(ns) {
  const out = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "MUTATING: stamina cost per action vs per second (Phase 39 Overclock decision)",
    windowMs: STAMINA_WINDOW_MS,
    runs: [],
  };
  const emit = (label) => {
    out.stage = label;
    try { ns.write("bladeburneractionprobe-" + out.ts + ".json", JSON.stringify(out, null, 2), "w"); } catch (e) { /* breadcrumb only */ }
  };

  out.startRank = ns.bladeburner.getRank();
  emit("start");

  try {
    await runStaminaWindows(ns, out, emit);
  } finally {
    // ALWAYS clear the pause, including on an exception or a mid-run kill. Leaving
    // this file behind would idle the Bladeburner engine indefinitely, which on an
    // unattended run is far worse than losing the measurement.
    try { ns.rm(BB_OFF_MARKER, "home"); } catch { /* already gone */ }
    try { ns.rm(SLOT_HOLD_FILE, "home"); } catch { /* already gone */ }
    out.pauseCleared = !ns.fileExists(BB_OFF_MARKER, "home");
    emit("pause-cleared");
  }

  out.endRank = ns.bladeburner.getRank();
  out.rankDelta = out.endRank - out.startRank;

  // The verdict. If drain/min is roughly equal across two actions of very different
  // duration, cost is per-second and Overclock multiplies throughput for free. If
  // drain/min scales with actions/min instead, cost is per-action and Overclock buys
  // nothing sustained.
  if (out.runs.length === 2) {
    const [a, b] = out.runs;
    out.verdict = {
      drainPerMinRatio: a.netDrainPerMin / b.netDrainPerMin,
      drainPerAttemptRatio: a.netDrainPerAttempt / b.netDrainPerAttempt,
      actionTimeRatio: b.actionTimeMs / a.actionTimeMs,
      reading: "drainPerMinRatio near 1 => PER-SECOND (Overclock is a real multiplier). drainPerAttemptRatio near 1 => PER-ACTION (Overclock does not raise the stamina-limited ceiling).",
    };
  }

  out.stage = "complete";
  const file = "bladeburneractionprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");
  for (const r of out.runs) {
    ns.tprint(`  ${r.name}: ${r.actionTimeMs / 1000}s | drain ${r.netDrainPerMin.toFixed(2)}/min | ${r.netDrainPerAttempt.toFixed(2)}/attempt (${r.estimatedAttempts.toFixed(1)} attempts)`);
  }
  if (out.verdict) ns.tprint(`  ratios -> perMin ${out.verdict.drainPerMinRatio.toFixed(2)} | perAttempt ${out.verdict.drainPerAttemptRatio.toFixed(2)} | actionTime ${out.verdict.actionTimeRatio.toFixed(2)}`);
  ns.tprint(`  pauseCleared=${out.pauseCleared} rankDelta ${out.rankDelta.toFixed(2)} -> ${file}`);
}

/**
 * The measurement proper. Split out so staminaCostMode's `finally` can guarantee the
 * pause marker is cleared no matter how this exits.
 *
 * 🔑 2026-08-02 -- how the pause works, and why this route rather than the obvious one.
 * The probe needs EXCLUSIVE use of the single player-action slot, but daemon.js's
 * supervisor relaunches bladeburnermanager.js within ~60s of any kill, and the two then
 * fight over the slot (this killed the first attempt outright -- it died at stage
 * "start" with no data). bladeburnermanager.js already honours an off-marker file that
 * makes it stop its action, release the slot hold, and idle IN-LOOP -- so the supervisor
 * stays satisfied and nothing gets relaunched.
 *
 * The trap: creating that marker from the repo (src/bladeburner-off.txt) hits the known
 * viteburner new-file upload bug -- brand-new src/ files never sync, silently. The fix is
 * to write it from INSIDE the game with ns.write, where no sync is involved at all.
 */
/** Claim the player-action slot as ourselves, so augfarmer.js keeps its hands off it. */
function holdSlot(ns) {
  ns.write(SLOT_HOLD_FILE, JSON.stringify({ ts: Date.now(), holder: "bladeburneractionprobe" }), "w");
}

async function runStaminaWindows(ns, out, emit) {
  ns.write(BB_OFF_MARKER, "paused by bladeburneractionprobe.js stamina mode @ " + out.iso + "\n", "w");
  emit("pause-requested");

  // 🔴 2026-08-02, third attempt -- the SECOND failure mode, and it is the opposite of the
  // first. Pausing bladeburnermanager.js makes it RELEASE the slot-hold marker, and
  // augfarmer.js watches for exactly that: the live log reads "slot hold released -- rep
  // work resuming" the instant the probe starts. augfarmer then begins faction work, which
  // occupies the single player-action slot, so the probe's startAction never takes effect.
  // Symptom was identical to the first bug -- zero drain, start === end -- but the cause is
  // a DIFFERENT script, which is why fixing the manager alone did not help. So: pause the
  // manager AND immediately claim the slot ourselves, refreshing inside
  // SLOT_HOLD_MAX_AGE_MS (30s) for the entire run.
  holdSlot(ns);

  let waited = 0;
  while (waited < 30_000) {
    await ns.sleep(2_000);
    waited += 2_000;
    holdSlot(ns);
    const live = ns.bladeburner.getCurrentAction();
    if (!live || !live.name || live.name === "Hyperbolic Regeneration Chamber") break;
  }
  out.slotReleasedAfterMs = waited;
  ns.bladeburner.stopBladeburnerAction();
  emit("slot-acquired");

  for (const target of STAMINA_SAMPLES) {
    const actionTimeMs = ns.bladeburner.getActionTime(target.type, target.name);
    // Rest to a known, penalty-free starting point so the two windows are comparable
    // and neither run dips into the sub-50% penalty band (reference S5: the success
    // multiplier is min(1, fraction/0.5), so below half the runs are not comparable).
    ns.bladeburner.startAction("General", "Hyperbolic Regeneration Chamber");
    let guard = 0;
    while (guard++ < 240) {
      const [cur, max] = ns.bladeburner.getStamina();
      if (cur / max >= 0.75) break;
      await ns.sleep(5_000);
    }

    const [startStam, maxStam] = ns.bladeburner.getStamina();
    const startSucc = ns.bladeburner.getActionSuccesses(target.type, target.name);
    const t0 = Date.now();
    holdSlot(ns);
    const started = ns.bladeburner.startAction(target.type, target.name);

    const samples = [];
    let preempted = 0;
    while (Date.now() - t0 < STAMINA_WINDOW_MS) {
      await ns.sleep(STAMINA_TICK_MS);
      holdSlot(ns); // keep the claim fresh inside SLOT_HOLD_MAX_AGE_MS
      const [c] = ns.bladeburner.getStamina();
      // Record whether OUR action is still the live one. Two runs were silently invalid
      // because something else held the slot and nothing ever checked.
      const live = ns.bladeburner.getCurrentAction();
      if (!live || live.name !== target.name) preempted++;
      samples.push({ atMs: Date.now() - t0, stamina: c, liveAction: live ? live.name : null });
    }

    const [endStam] = ns.bladeburner.getStamina();
    const endSucc = ns.bladeburner.getActionSuccesses(target.type, target.name);
    const elapsedMin = (Date.now() - t0) / 60_000;
    const drained = startStam - endStam;
    // Actions ATTEMPTED (not just succeeded) is what we want per-action cost against,
    // and the API only exposes successes -- so derive attempts from elapsed/actionTime,
    // which is exact while the action auto-repeats uninterrupted.
    const attempts = (Date.now() - t0) / actionTimeMs;

    out.runs.push({
      ...target,
      actionTimeMs,
      startStamina: startStam,
      endStamina: endStam,
      maxStamina: maxStam,
      elapsedMin,
      netDrained: drained,
      netDrainPerMin: drained / elapsedMin,
      estimatedAttempts: attempts,
      netDrainPerAttempt: drained / attempts,
      successesDuringWindow: endSucc - startSucc,
      startActionReturned: started,
      preemptedSamples: preempted,
      totalSamples: samples.length,
      valid: started === true && preempted === 0 && startStam !== endStam,
      samples,
    });
    emit("ran-" + target.name);
  }

  ns.bladeburner.stopBladeburnerAction();
}

// ---- level-sweep mode (2026-08-02, Phase 39 Q3) ------------------------------

const LEVEL_SWEEP_TARGET = { type: "Contracts", name: "Tracking" };

async function levelSweepMode(ns) {
  const t = LEVEL_SWEEP_TARGET;
  const out = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "READ-ONLY (no startAction): action-level EV sweep on Tracking (Q3)",
    target: t,
    levels: [],
  };

  const originalLevel = ns.bladeburner.getActionCurrentLevel(t.type, t.name);
  const originalAutolevel = ns.bladeburner.getActionAutolevel(t.type, t.name);
  const maxLevel = ns.bladeburner.getActionMaxLevel(t.type, t.name);
  out.originalLevel = originalLevel;
  out.originalAutolevel = originalAutolevel;
  out.maxLevel = maxLevel;

  try {
    if (originalAutolevel) ns.bladeburner.setActionAutolevel(t.type, t.name, false);

    for (let level = 1; level <= maxLevel; level++) {
      ns.bladeburner.setActionLevel(t.type, t.name, level);
      const confirmedLevel = ns.bladeburner.getActionCurrentLevel(t.type, t.name);
      const successChance = ns.bladeburner.getActionEstimatedSuccessChance(t.type, t.name);
      const actionTimeMs = ns.bladeburner.getActionTime(t.type, t.name);
      const rankGain = ns.bladeburner.getActionRankGain(t.type, t.name, level);
      const rankLoss = ns.bladeburner.getActionRankLoss(t.type, t.name, level);
      const repGain = ns.bladeburner.getActionRepGain(t.type, t.name, level);
      const [pMin, pMax] = successChance;
      const pMid = (pMin + pMax) / 2;
      const evPerAttempt = pMid * rankGain - (1 - pMid) * rankLoss;
      const evPerSec = evPerAttempt / (actionTimeMs / 1000);
      out.levels.push({
        level, confirmedLevel, pMin, pMax, pMid, rankGain, rankLoss, repGain, actionTimeMs,
        evPerAttempt, evPerSec,
      });
    }
  } finally {
    ns.bladeburner.setActionLevel(t.type, t.name, originalLevel);
    if (originalAutolevel) ns.bladeburner.setActionAutolevel(t.type, t.name, true);
    out.restoredLevel = ns.bladeburner.getActionCurrentLevel(t.type, t.name);
    out.restoredAutolevel = ns.bladeburner.getActionAutolevel(t.type, t.name);
  }

  const byEvPerSec = [...out.levels].sort((a, b) => b.evPerSec - a.evPerSec);
  const byEvPerAttempt = [...out.levels].sort((a, b) => b.evPerAttempt - a.evPerAttempt);
  out.bestByEvPerSec = byEvPerSec[0];
  out.bestByEvPerAttempt = byEvPerAttempt[0];

  const file = "bladeburneractionprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint(`levelsweep: swept levels 1..${maxLevel} on ${t.name} (was ${originalLevel}, autolevel=${originalAutolevel})`);
  ns.tprint(`  best by EV/sec: level ${out.bestByEvPerSec.level} (${out.bestByEvPerSec.evPerSec.toFixed(4)} rank/s, p=${out.bestByEvPerSec.pMid.toFixed(3)})`);
  ns.tprint(`  best by EV/attempt: level ${out.bestByEvPerAttempt.level} (${out.bestByEvPerAttempt.evPerAttempt.toFixed(4)} rank, p=${out.bestByEvPerAttempt.pMid.toFixed(3)})`);
  ns.tprint(`  restored level=${out.restoredLevel} autolevel=${out.restoredAutolevel} -> ${file}`);
}

// ---- Raid HP-cost mode (2026-08-02, Phase 39 Q11) ----------------------------

const RAID_TARGET = { type: "Operations", name: "Raid" };
const RAID_WINDOW_MS = 200_000; // ~3 attempts at Raid's current 63s action time
const RAID_TICK_MS = 5_000;
const RAID_HP_PRECONDITION_FRACTION = 0.85; // refuse to start below this
const RAID_HP_ABORT_FRACTION = 0.5; // matches bladeburnermanager.js's HP_FLOOR_FRACTION

function readHpFraction(ns) {
  const hp = ns.getPlayer().hp;
  return hp.max > 0 ? hp.current / hp.max : 1;
}

async function raidHpCostMode(ns) {
  const out = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "MUTATING, REAL HP RISK: HP cost per failed Raid (Q11)",
    windowMs: RAID_WINDOW_MS,
    hpAbortFraction: RAID_HP_ABORT_FRACTION,
  };
  const emit = (label) => {
    out.stage = label;
    try { ns.write("bladeburneractionprobe-" + out.ts + ".json", JSON.stringify(out, null, 2), "w"); } catch { /* breadcrumb only */ }
  };
  emit("start");

  out.startHpFraction = readHpFraction(ns);
  if (out.startHpFraction < RAID_HP_PRECONDITION_FRACTION) {
    out.aborted = "HP below precondition (" + (out.startHpFraction * 100).toFixed(1) + "% < " +
      (RAID_HP_PRECONDITION_FRACTION * 100) + "%) -- refusing to start";
    ns.write("bladeburneractionprobe-" + out.ts + ".json", JSON.stringify(out, null, 2), "w");
    ns.tprint("raidHpCost: ABORT (precondition) -- " + out.aborted);
    return;
  }

  try {
    await runRaidWindow(ns, out, emit);
  } finally {
    try { ns.rm(BB_OFF_MARKER, "home"); } catch { /* already gone */ }
    try { ns.rm(SLOT_HOLD_FILE, "home"); } catch { /* already gone */ }
    out.pauseCleared = !ns.fileExists(BB_OFF_MARKER, "home");
    out.endHpFraction = readHpFraction(ns);
    emit("pause-cleared");
  }

  const file = "bladeburneractionprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint(`raidHpCost: ${out.aborted ? "ABORTED (" + out.aborted + ")" : "complete"}` +
    ` startHp=${(out.startHpFraction * 100).toFixed(1)}% endHp=${(out.endHpFraction * 100).toFixed(1)}%` +
    (out.hpCostPerFailure != null ? ` hpCostPerFailure=${out.hpCostPerFailure.toFixed(2)} (${out.failures} failures)` : ""));
  ns.tprint(`  pauseCleared=${out.pauseCleared} -> ${file}`);
}

async function runRaidWindow(ns, out, emit) {
  const t = RAID_TARGET;

  ns.write(BB_OFF_MARKER, "paused by bladeburneractionprobe.js raid mode @ " + out.iso + "\n", "w");
  emit("pause-requested");
  holdSlot(ns);

  let waited = 0;
  while (waited < 30_000) {
    await ns.sleep(2_000);
    waited += 2_000;
    holdSlot(ns);
    if (!ns.bladeburner.getCurrentAction()) break;
  }
  out.slotReleasedAfterMs = waited;
  ns.bladeburner.stopBladeburnerAction();
  emit("slot-acquired");

  const startSucc = ns.bladeburner.getActionSuccesses(t.type, t.name);
  const t0 = Date.now();
  holdSlot(ns);
  out.startActionReturned = ns.bladeburner.startAction(t.type, t.name);

  const samples = [];
  let lastHpFraction = out.startHpFraction;
  let aborted = false;
  while (Date.now() - t0 < RAID_WINDOW_MS) {
    await ns.sleep(RAID_TICK_MS);
    holdSlot(ns);
    const hpFraction = readHpFraction(ns);
    const live = ns.bladeburner.getCurrentAction();
    samples.push({ atMs: Date.now() - t0, hpFraction, liveAction: live ? live.name : null });
    lastHpFraction = hpFraction;

    if (hpFraction < RAID_HP_ABORT_FRACTION) {
      aborted = true;
      out.aborted = "HP dropped below abort floor (" + (hpFraction * 100).toFixed(1) + "% < " +
        (RAID_HP_ABORT_FRACTION * 100) + "%) mid-run -- stopping immediately";
      ns.tprint("raidHpCost: HARD ABORT -- " + out.aborted);
      break;
    }
  }
  ns.bladeburner.stopBladeburnerAction();
  emit("ran");

  const endSucc = ns.bladeburner.getActionSuccesses(t.type, t.name);
  const successesDuring = endSucc - startSucc;
  const elapsedMs = Date.now() - t0;
  const estimatedAttempts = elapsedMs / ns.bladeburner.getActionTime(t.type, t.name);
  const estimatedFailures = Math.max(0, Math.round(estimatedAttempts - successesDuring));

  out.samples = samples;
  out.successesDuring = successesDuring;
  out.estimatedAttempts = estimatedAttempts;
  out.failures = estimatedFailures;
  out.hpLost = out.startHpFraction - lastHpFraction; // fraction, not HP points -- max HP read separately below
  const maxHp = ns.getPlayer().hp.max;
  out.maxHp = maxHp;
  out.hpPointsLost = out.hpLost * maxHp;
  if (estimatedFailures > 0) out.hpCostPerFailure = out.hpPointsLost / estimatedFailures;
  out.aborted = aborted ? out.aborted : undefined;
}

// ---- general-action stamina mode (2026-08-02, Phase 39 Q6) ------------------

const GENERAL_TARGETS = ["Training", "Field Analysis", "Diplomacy", "Incite Violence"];
const GENERAL_WINDOW_MS = 30_000;
const GENERAL_TICK_MS = 5_000;

async function generalStaminaMode(ns) {
  const out = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "MUTATING: does each non-HRC General action cost stamina beyond passive regen? (Q6)",
    windowMs: GENERAL_WINDOW_MS,
    runs: [],
  };
  const emit = (label) => {
    out.stage = label;
    try { ns.write("bladeburneractionprobe-" + out.ts + ".json", JSON.stringify(out, null, 2), "w"); } catch { /* breadcrumb only */ }
  };

  try {
    await runGeneralWindows(ns, out, emit);
  } finally {
    try { ns.rm(BB_OFF_MARKER, "home"); } catch { /* already gone */ }
    try { ns.rm(SLOT_HOLD_FILE, "home"); } catch { /* already gone */ }
    out.pauseCleared = !ns.fileExists(BB_OFF_MARKER, "home");
    emit("pause-cleared");
  }

  // Idle baseline gives the pure regen rate; each action's netDrainPerMin compared
  // against it says whether the action costs anything ON TOP of just letting time pass.
  const idle = out.runs.find((r) => r.name === "IDLE_BASELINE");
  if (idle) {
    for (const r of out.runs) {
      if (r === idle) continue;
      r.costsStaminaBeyondRegen = r.netDrainPerMin < idle.netDrainPerMin - 0.3; // small tolerance for sample noise
      r.deltaFromIdlePerMin = idle.netDrainPerMin - r.netDrainPerMin;
    }
  }

  out.stage = "complete";
  const file = "bladeburneractionprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");
  for (const r of out.runs) {
    ns.tprint(`  ${r.name}: netDrainPerMin=${r.netDrainPerMin.toFixed(3)}` +
      (r === idle ? "  (baseline)" : `  costsStamina=${r.costsStaminaBeyondRegen}  vsBaselineDelta=${r.deltaFromIdlePerMin?.toFixed(3)}`));
  }
  ns.tprint(`  pauseCleared=${out.pauseCleared} -> ${file}`);
}

async function runGeneralWindows(ns, out, emit) {
  ns.write(BB_OFF_MARKER, "paused by bladeburneractionprobe.js general mode @ " + out.iso + "\n", "w");
  emit("pause-requested");
  holdSlot(ns);

  let waited = 0;
  while (waited < 30_000) {
    await ns.sleep(2_000);
    waited += 2_000;
    holdSlot(ns);
    const live = ns.bladeburner.getCurrentAction();
    if (!live) break;
  }
  out.slotReleasedAfterMs = waited;
  ns.bladeburner.stopBladeburnerAction();
  emit("slot-acquired");

  // targets[0] is a pure idle window (no action started) -- the regen baseline
  // every other target is compared against.
  const targets = [{ type: null, name: "IDLE_BASELINE" }, ...GENERAL_TARGETS.map((n) => ({ type: "General", name: n }))];

  for (const target of targets) {
    const [startStam] = ns.bladeburner.getStamina();
    const t0 = Date.now();
    holdSlot(ns);
    const started = target.type ? ns.bladeburner.startAction(target.type, target.name) : null;

    const samples = [];
    let preempted = 0;
    while (Date.now() - t0 < GENERAL_WINDOW_MS) {
      await ns.sleep(GENERAL_TICK_MS);
      holdSlot(ns);
      const [c] = ns.bladeburner.getStamina();
      const live = ns.bladeburner.getCurrentAction();
      if (target.type && (!live || live.name !== target.name)) preempted++;
      if (!target.type && live) preempted++; // idle window: anything running at all is contamination
      samples.push({ atMs: Date.now() - t0, stamina: c, liveAction: live ? live.name : null });
    }

    const [endStam] = ns.bladeburner.getStamina();
    const elapsedMin = (Date.now() - t0) / 60_000;
    const drained = startStam - endStam;

    out.runs.push({
      ...target,
      startStamina: startStam,
      endStamina: endStam,
      elapsedMin,
      netDrained: drained,
      netDrainPerMin: drained / elapsedMin,
      startActionReturned: started,
      preemptedSamples: preempted,
      totalSamples: samples.length,
      valid: preempted === 0,
      samples,
    });
    emit("ran-" + target.name);
    ns.bladeburner.stopBladeburnerAction();
  }
}
