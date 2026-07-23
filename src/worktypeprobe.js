/**
 * worktypeprobe.js -- read-only. Which factions in play actually offer faction work?
 * Written to diagnose augfarmer.js's recurring
 * "workForFaction: factionWorkType expected to be a string. Is undefined" throw:
 * pickWorkType() returns types[0] === undefined for a faction with an empty
 * workTypes list, and that undefined goes straight into workForFaction.
 * Hypothesis: a GANG faction offers no faction work at all. JSON out so it syncs.
 * @param {NS} ns
 */
export async function main(ns) {
  const sing = ns.singularity;
  const joined = ns.getPlayer().factions;
  const out = { time: new Date().toLocaleString(), joined, workTypes: {}, empty: [] };

  for (const faction of joined) {
    try {
      const types = sing.getFactionWorkTypes(faction);
      out.workTypes[faction] = types;
      if (!types || types.length === 0) out.empty.push(faction);
    } catch (e) {
      out.workTypes[faction] = `THREW: ${e}`;
      out.empty.push(faction);
    }
  }

  try {
    out.inGang = ns.gang.inGang();
    out.gangFaction = out.inGang ? ns.gang.getGangInformation().faction : null;
  } catch (e) {
    out.inGang = `THREW: ${e}`;
  }

  const file = `worktypeprobe-${Date.now()}.json`;
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint(`==== work types ====`);
  for (const [f, t] of Object.entries(out.workTypes)) ns.tprint(`  ${f}: ${JSON.stringify(t)}`);
  ns.tprint(`  gang faction: ${out.gangFaction}`);
  ns.tprint(`  EMPTY (no faction work): ${out.empty.join(", ") || "none"}`);
  ns.tprint(`  -> logs/${file}`);
}
