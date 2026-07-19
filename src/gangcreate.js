/**
 * gangcreate.js — create the gang. One-way within the node: `isHacking` is fixed at creation by
 * the faction and there is no `leaveGang()`. Kenneth's standing call (2026-07-19) is that this is
 * cheap anyway — a BitNode restart costs a day, not a run.
 *
 * Doubles as the safe probe `docs/gang-api.md` describes: `createGang` returns false (no side
 * effect) if the faction can't host a gang, so a wrong faction name costs nothing.
 *
 * Usage: run gangcreate.js "NiteSec"
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const faction = String(ns.args[0] ?? "");
  if (!faction) return ns.tprint('ERROR: usage: run gangcreate.js "<Faction Name>"');

  if (ns.gang.inGang()) {
    const info = ns.gang.getGangInformation();
    return ns.tprint(`ALREADY IN A GANG: ${info.faction} (isHacking=${info.isHacking}) — no-op.`);
  }

  const created = ns.gang.createGang(faction);
  if (!created) {
    return ns.tprint(`NO GANG: "${faction}" refused createGang — not gang-capable, or requirements unmet. Nothing changed.`);
  }

  const info = ns.gang.getGangInformation();
  const out = { ts: Date.now(), faction: info.faction, isHacking: info.isHacking, info };
  ns.write(`logs/gangcreate-${out.ts}.json`, JSON.stringify(out, null, 2), "w");

  ns.tprint(`GANG CREATED: ${info.faction}`);
  ns.tprint(`  isHacking : ${info.isHacking}  (fixed permanently)`);
  ns.tprint(`  respect   : ${info.respect}`);
  ns.tprint(`  territory : ${info.territory}`);
  ns.tprint(`  next: run gangprobe.js — the static task/equipment tables are readable now.`);
}
