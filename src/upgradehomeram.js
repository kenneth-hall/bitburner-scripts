// Manual utility, run by hand -- not wired into daemon.js. Needs ~74GB free
// RAM just to launch (Singularity RAM multiplier without SF4), so if it
// won't even start, buy home RAM through the game UI first.

import { recordTransaction } from "./translog.js";

/** @param {NS} ns */
export async function main(ns) {
  const purchased = [];

  while (true) {
    const cost = ns.singularity.getUpgradeHomeRamCost();
    if (ns.getPlayer().money < cost) break;
    if (!ns.singularity.upgradeHomeRam()) break;
    purchased.push(cost);
    recordTransaction(ns, {
      type: "expense",
      source: "home-ram-upgrade",
      newRamGb: ns.getServerMaxRam("home"),
      amount: cost,
      timestamp: Date.now(),
      time: new Date().toLocaleString(),
    });
  }

  ns.tprint("===== upgradehomeram summary =====");
  if (purchased.length === 0) {
    ns.tprint("No upgrades purchased.");
  } else {
    const total = purchased.reduce((a, b) => a + b, 0);
    ns.tprint(`Purchased ${purchased.length} upgrade(s) for $${ns.format.number(total)} total.`);
  }
  ns.tprint(`Home RAM is now ${ns.format.number(ns.getServerMaxRam("home"))} GB.`);
}
