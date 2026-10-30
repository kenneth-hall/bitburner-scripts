/**
 * citychaos.js - read-only: chaos / estimated population / communities for all six
 * Bladeburner cities, plus the next black op's success range as seen from the current
 * city. Writes citychaos-<epoch>.json. ASCII-only.
 */
const ALL_CITIES = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"];

/** @param {NS} ns */
export async function main(ns) {
  const bb = ns.bladeburner;
  const next = bb.getNextBlackOp();
  const out = {
    ts: Date.now(),
    city: bb.getCity(),
    teamSize: bb.getTeamSize(),
    next: next ? { name: next.name, chance: bb.getActionEstimatedSuccessChance("Black Operations", next.name) } : null,
    cities: Object.fromEntries(ALL_CITIES.map((c) => [c, {
      chaos: bb.getCityChaos(c), pop: bb.getCityEstimatedPopulation(c), communities: bb.getCityCommunities(c),
    }])),
  };
  const file = `citychaos-${out.ts}.json`;
  ns.write(file, JSON.stringify(out, null, 2), "w");
  for (const [c, v] of Object.entries(out.cities)) ns.tprint(`${c.padEnd(10)} chaos ${v.chaos.toFixed(1).padStart(8)}  pop ${(v.pop / 1e9).toFixed(2)}b  comm ${v.communities}`);
  ns.tprint(`city=${out.city} team=${out.teamSize} next=${JSON.stringify(out.next)} -> ${file}`);
}
