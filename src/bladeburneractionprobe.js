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
