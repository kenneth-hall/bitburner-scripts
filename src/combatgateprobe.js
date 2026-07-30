/**
 * combatgateprobe.js - one-off: size the combat-stats 1 -> 100 grind that gates
 * joinBladeburnerDivision() in BN6. Read-only (Formulas + getPlayer only).
 * Writes combatgateprobe-<epoch>.json.
 */
export async function main(ns) {
  const out = { ts: Date.now(), iso: new Date().toISOString() };
  const pl = ns.getPlayer();
  const sk = pl.skills;
  const ex = pl.exp;
  const m = pl.mults;

  const f = ns.formulas.skills;
  const stats = ["strength", "defense", "dexterity", "agility"];
  const rows = {};
  let totalExpNeeded = 0;
  for (const s of stats) {
    const mult = m[s];
    const target = f.calculateExp(100, mult);
    const have = ex[s];
    const need = Math.max(0, target - have);
    totalExpNeeded += need;
    rows[s] = {
      level: sk[s], mult, expNow: have,
      expForLevel100: target, expNeeded: need,
    };
  }
  out.perStat = rows;
  out.totalExpNeededAcrossFourStats = totalExpNeeded;

  // What level would the CURRENT exp give at various mults, and what does a
  // bigger combat mult buy? Combat augs are the lever here, same as hacking.
  const curve = {};
  for (const mult of [1.28, 2, 3, 5, 8]) {
    curve[mult] = f.calculateExp(100, mult);
  }
  out.expForLevel100ByMult = curve;

  out.note = "expNeeded is per-stat; gym trains one stat at a time. Combat mult 1.28 = SF1.3 floor, no augs.";
  const file = "combatgateprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint("combatgate: total exp needed across 4 stats = " + ns.format.number(totalExpNeeded));
  for (const s of stats) ns.tprint("  " + s + ": lvl " + rows[s].level + " need " + ns.format.number(rows[s].expNeeded) + " exp");
  ns.tprint("  -> " + file);
}
