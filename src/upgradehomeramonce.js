// Manual utility -- buys EXACTLY ONE home RAM tier, then exits.
//
// Sibling to upgradehomeram.js, which loops `while money >= cost` and drains
// the entire bankroll. That no-reserve drain is correct only during an
// install spend-down (money is about to be wiped anyway); outside one it
// competes with the gang/aug plans for capital. This variant exists for the
// outside-an-install case: one tier, capped spend, no loop.
//
// Optional arg: a max spend in dollars (default MAX_SPEND). Refuses to buy
// if the next tier costs more than that -- so a mistaken run on an expensive
// tier is a no-op, not a surprise.
//
// Singularity calls carry no home-only requirement, so this runs from any
// server with enough free RAM (the fleet, typically -- home is usually the
// thing that's too full, which is why you're running this).

import { recordTransaction } from "./translog.js";

const MAX_SPEND = 500e6;

/** @param {NS} ns */
export async function main(ns) {
  const cap = Number(ns.args[0]) || MAX_SPEND;
  const before = ns.getServerMaxRam("home");
  const cost = ns.singularity.getUpgradeHomeRamCost();
  const money = ns.getPlayer().money;

  ns.tprint("===== upgradehomeramonce =====");
  ns.tprint(`Home RAM: ${ns.format.ram(before)} | next tier: $${ns.format.number(cost)} | held: $${ns.format.number(money)} | cap: $${ns.format.number(cap)}`);

  if (cost > cap) {
    ns.tprint(`REFUSED: next tier ($${ns.format.number(cost)}) exceeds cap ($${ns.format.number(cap)}). Pass a higher cap as arg 1 to override.`);
    return;
  }
  if (money < cost) {
    ns.tprint(`REFUSED: cannot afford next tier ($${ns.format.number(cost)} > $${ns.format.number(money)}).`);
    return;
  }

  if (!ns.singularity.upgradeHomeRam()) {
    ns.tprint("FAILED: upgradeHomeRam() returned false -- no purchase made.");
    return;
  }

  const after = ns.getServerMaxRam("home");
  recordTransaction(ns, {
    type: "expense",
    source: "home-ram-upgrade",
    newRamGb: after,
    amount: cost,
    timestamp: Date.now(),
    time: new Date().toLocaleString(),
  });

  ns.tprint(`BOUGHT one tier for $${ns.format.number(cost)} -- home ${ns.format.ram(before)} -> ${ns.format.ram(after)}.`);
}
