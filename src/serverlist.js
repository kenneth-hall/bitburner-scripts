// One-off diagnostic: list every reachable (non-owned) server sorted by the
// hacking level it requires -- for spotting backdoor / faction targets. Purely
// read-only (ns.scan + ns.getServer); it connects and backdoors nothing.
import { scanNetwork } from "./common.js";

/** @param {NS} ns */
export async function main(ns) {
  // NB: this build removed ns.getPurchasedServers() in 3.0.0 -- purchased/cloud
  // servers live under ns.cloud.* (same API the whole codebase already uses).
  const mine = new Set([...ns.cloud.getServerNames(), "home"]);
  const hosts = scanNetwork(ns).filter((h) => !mine.has(h));
  const lvl = ns.getHackingLevel();

  const rows = hosts
    .map((h) => {
      const s = ns.getServer(h);
      return {
        host: h,
        req: s.requiredHackingSkill,
        root: s.hasAdminRights,
        bd: s.backdoorInstalled,
        ports: s.numOpenPortsRequired,
        money: s.moneyMax,
      };
    })
    .sort((a, b) => a.req - b.req);

  ns.tprint(`\n===== SERVERS BY REQUIRED HACK LEVEL (${rows.length}) -- your level: ${lvl} =====`);
  ns.tprint(`  req  root bd ports  host                     maxMoney       status`);
  for (const r of rows) {
    let status;
    if (r.bd) status = "backdoored";
    else if (lvl < r.req) status = "level too low";
    else if (!r.root) status = "root it first";
    else status = "<== BACKDOOR NOW";
    const money = r.money === 0 ? "$0" : "$" + ns.format.number(r.money);
    ns.tprint(
      `${String(r.req).padStart(5)}  ${r.root ? "Y" : "n"}    ${r.bd ? "Y" : "n"}  ${String(r.ports).padStart(2)}    ` +
        `${r.host.padEnd(24)} ${money.padEnd(13)}  ${status}`,
    );
  }
}
