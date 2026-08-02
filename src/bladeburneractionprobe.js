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
  // ⚠️ MUTATING (startAction/stopBladeburnerAction). Kill bladeburnermanager.js first
  // or the two will fight over the action slot. Restores nothing on its own -- the
  // caller restarts the manager. Short windows deliberately: Tracking failures cost
  // 3 HP each and max HP is only 27.
  if (ns.args[0] === "stamina") return await staminaCostMode(ns);

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
    ns.bladeburner.startAction(target.type, target.name);

    const samples = [];
    while (Date.now() - t0 < STAMINA_WINDOW_MS) {
      await ns.sleep(STAMINA_TICK_MS);
      const [c] = ns.bladeburner.getStamina();
      samples.push({ atMs: Date.now() - t0, stamina: c });
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
      samples,
    });
    emit("ran-" + target.name);
  }

  ns.bladeburner.stopBladeburnerAction();
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
  ns.tprint("  rankDelta " + out.rankDelta.toFixed(2) + " -> " + file);
}
