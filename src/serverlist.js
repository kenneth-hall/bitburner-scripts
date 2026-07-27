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
        ram: s.maxRam,
      };
    })
    .sort((a, b) => a.req - b.req);

  // Fleet-RAM view: rooting a server adds its RAM to the batcher even when its
  // required level puts its MONEY out of reach -- so "what does the next port
  // opener buy us right now" is a RAM question, not a maxMoney question.
  const unrooted = rows.filter((r) => !r.root);
  const ramByPorts = new Map();
  for (const r of unrooted) ramByPorts.set(r.ports, (ramByPorts.get(r.ports) ?? 0) + r.ram);

  ns.tprint(`\n===== SERVERS BY REQUIRED HACK LEVEL (${rows.length}) -- your level: ${lvl} =====`);
  ns.tprint(`  req  root bd ports  host                     maxMoney       ram        status`);
  for (const r of rows) {
    let status;
    if (r.bd) status = "backdoored";
    else if (lvl < r.req) status = "level too low";
    else if (!r.root) status = "root it first";
    else status = "<== BACKDOOR NOW";
    const money = r.money === 0 ? "$0" : "$" + ns.format.number(r.money);
    ns.tprint(
      `${String(r.req).padStart(5)}  ${r.root ? "Y" : "n"}    ${r.bd ? "Y" : "n"}  ${String(r.ports).padStart(2)}    ` +
        `${r.host.padEnd(24)} ${money.padEnd(13)}  ${ns.format.ram(r.ram).padEnd(9)}  ${status}`,
    );
  }

  // What the isEligibleTarget `reqLevel < level/2` gate is actually rejecting.
  // The gate is a PROXY for hack success chance; targets.js's score already
  // multiplies by the EXACT chance (sampling.js's formulas.hacking.hackChance
  // at the prepped state). So print the exact number for every rooted, money-
  // bearing server we could hack at all -- that is the number the gate is
  // standing in for, and the only way to know what it costs us.
  if (ns.fileExists("Formulas.exe", "home")) {
    const player = ns.getPlayer();
    const rows2 = rows
      .filter((r) => r.root && r.money > 0 && r.req <= lvl)
      .map((r) => {
        const prepped = { ...ns.getServer(r.host), hackDifficulty: ns.getServerMinSecurityLevel(r.host), moneyAvailable: r.money };
        return { ...r, chance: ns.formulas.hacking.hackChance(prepped, player), wt: ns.formulas.hacking.weakenTime(prepped, player) };
      })
      // Rank by the score's own money*chance/time shape (ramCost omitted --
      // it needs the full thread plan; this is the relative-value view).
      .sort((a, b) => (b.money * b.chance) / b.wt - (a.money * a.chance) / a.wt);
    ns.tprint(`\n===== EXACT hackChance AT PREPPED STATE (rooted, hackable) -- gate admits req < ${Math.floor(lvl / 2)} =====`);
    ns.tprint(`  host                     req   maxMoney       chance   admitted?`);
    for (const r of rows2) {
      ns.tprint(
        `  ${r.host.padEnd(24)} ${String(r.req).padStart(4)}  ${("$" + ns.format.number(r.money)).padEnd(13)}  ` +
          `${(r.chance * 100).toFixed(1).padStart(5)}%   ${r.req < lvl / 2 ? "yes" : "NO -- gated out"}`,
      );
    }
  }

  ns.tprint(`\n===== UNROOTED FLEET RAM BY PORT REQUIREMENT =====`);
  for (const ports of [...ramByPorts.keys()].sort((a, b) => a - b)) {
    const count = unrooted.filter((r) => r.ports === ports).length;
    ns.tprint(`  ${ports} ports: ${ns.format.ram(ramByPorts.get(ports))} across ${count} server(s)`);
  }
}
