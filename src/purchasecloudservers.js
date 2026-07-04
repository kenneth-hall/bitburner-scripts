// Manual utility, run by hand -- not wired into daemon.js. Buys new cloud
// (purchased) servers at one of the standard power-of-2 sizes, starting at
// 16GB (anything smaller isn't worth spending a purchase slot on). Usage:
//   run purchasecloudservers.js <sizeGB> [count]
// <sizeGB> must be one of the standard sizes printed on error; [count] caps
// how many to buy this run (default: keep buying until out of money or out
// of purchase slots). hosts.js picks up any new cloud servers automatically
// on daemon.js's next refresh -- no extra wiring needed here.

import { recordTransaction } from "./translog.js";

/** @param {NS} ns */
export async function main(ns) {
  const ramLimit = ns.cloud.getRamLimit();
  const standardSizes = [];
  for (let size = 16; size <= ramLimit; size *= 2) standardSizes.push(size);

  const requestedSize = Number(ns.args[0]);
  if (!standardSizes.includes(requestedSize)) {
    ns.tprint(`ERROR: usage: run purchasecloudservers.js <sizeGB> [count]`);
    ns.tprint(`ERROR: <sizeGB> must be one of: ${standardSizes.join(", ")}`);
    return;
  }

  let requestedCount = Infinity;
  if (ns.args[1] !== undefined) {
    requestedCount = Math.floor(Number(ns.args[1]));
    if (!Number.isFinite(requestedCount) || requestedCount <= 0) {
      ns.tprint(`ERROR: count must be a positive integer, got ${ns.args[1]}`);
      return;
    }
  }

  const serverLimit = ns.cloud.getServerLimit();
  let slotsLeft = serverLimit - ns.cloud.getServerNames().length;

  if (slotsLeft <= 0) {
    ns.tprint(`ERROR: already at the cloud server limit (${serverLimit}).`);
    return;
  }

  const cost = ns.cloud.getServerCost(requestedSize);
  const purchased = [];
  let index = 0;

  while (purchased.length < requestedCount && slotsLeft > 0) {
    if (ns.getPlayer().money < cost) break;
    const hostname = ns.cloud.purchaseServer(`pserv-${requestedSize}gb-${index}`, requestedSize);
    if (!hostname) break;
    purchased.push(hostname);
    recordTransaction(ns, {
      type: "expense",
      source: "cloud-purchase",
      hostname,
      ram: requestedSize,
      amount: cost,
      timestamp: Date.now(),
      time: new Date().toLocaleString(),
    });
    slotsLeft--;
    index++;
  }

  ns.tprint("===== purchasecloudservers summary =====");
  ns.tprint(`Size: ${ns.format.ram(requestedSize)} | cost each: $${ns.format.number(cost)}`);
  if (purchased.length === 0) {
    ns.tprint(`Purchased none. Money: $${ns.format.number(ns.getPlayer().money)}`);
  } else {
    ns.tprint(`Purchased ${purchased.length} server(s), total cost $${ns.format.number(cost * purchased.length)}:`);
    for (const hostname of purchased) ns.tprint(`  ${hostname}`);
  }
  if (slotsLeft <= 0) ns.tprint(`Reached the cloud server limit (${serverLimit}).`);
}
