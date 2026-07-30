/**
 * bladeburnerskillprobe.js - read-only, post-employment: cost/level sweep across all 12
 * Bladeburner skills.
 *
 * Sibling to bladeburneractionprobe.js, split out to keep each probe's RAM small rather than
 * one large script. Answers what docs/bladeburner-reference.md §8 still lists open: the skills'
 * cost curves (getSkillUpgradeCost throws pre-employment).
 *
 * Read-only: no upgradeSkill, nothing that mutates game state.
 *
 * RAM: static dot-notation only.
 *
 * Writes bladeburnerskillprobe-<epoch>.json (synced to logs/ by the vite.config.ts filter).
 */

const SKILLS = [
  "Blade's Intuition", "Cloak", "Short-Circuit", "Digital Observer", "Tracer", "Overclock",
  "Reaper", "Evasive System", "Datamancer", "Cyber's Edge", "Hands of Midas", "Hyperdrive",
];

export async function main(ns) {
  const out = { ts: Date.now(), iso: new Date().toISOString(), note: "read-only skill cost/level sweep" };

  out.skillPoints = ns.bladeburner.getSkillPoints();

  out.skills = SKILLS.map((name) => {
    const rec = { name };
    try { rec.level = ns.bladeburner.getSkillLevel(name); } catch (e) { rec.levelErr = String(e).slice(0, 200); }
    try { rec.nextCost = ns.bladeburner.getSkillUpgradeCost(name, 1); } catch (e) { rec.nextCostErr = String(e).slice(0, 200); }
    try { rec.next5Cost = ns.bladeburner.getSkillUpgradeCost(name, 5); } catch (e) { rec.next5CostErr = String(e).slice(0, 200); }
    try {
      rec.maxAffordableAtCurrentPoints = ns.formulas.bladeburner.skillMaxUpgradeCount(name, rec.level ?? 0, out.skillPoints);
    } catch (e) { rec.maxAffordableErr = String(e).slice(0, 200); }
    return rec;
  });

  const file = "bladeburnerskillprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");

  ns.tprint("bladeburnerskillprobe: skillPoints=" + out.skillPoints);
  ns.tprint("  " + out.skills.map((s) => s.name + "=" + (s.nextCost ?? s.nextCostErr)).join(" | "));
  ns.tprint("  -> " + file);
}
