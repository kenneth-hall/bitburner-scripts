/**
 * stanekcloudprobe.js - read-only: cloud server cost per RAM tier, limits, owned servers.
 * Writes stanekcloudprobe-<epoch>.json. ASCII-only.
 */
/** @param {NS} ns */
export async function main(ns) {
  const c = ns.cloud;
  const out = { ts: Date.now(), money: ns.getServerMoneyAvailable("home"), ramLimit: c.getRamLimit(), serverLimit: c.getServerLimit(), owned: c.getServerNames(), tiers: [] };
  for (let r = 8; r <= out.ramLimit; r *= 2) out.tiers.push({ ram: r, cost: c.getServerCost(r) });
  const file = `stanekcloudprobe-${out.ts}.json`;
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint(`money ${ns.format.number(out.money)} limit ${out.serverLimit} ramLimit ${out.ramLimit} owned ${out.owned.length} -> ${file}`);
}
