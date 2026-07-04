// Manual utility, run by hand -- not wired into daemon.js. Given one owned
// cloud server, repeatedly upgrades it one power-of-2 tier at a time (16 ->
// 32 -> 64 -> ...) for as long as it's affordable, stopping at either the
// ram ceiling or the first tier the player can't afford. Unlike
// fleetupgrade.js (which rebalances every owned server together and renames
// the whole fleet by original list position), this only touches the one
// server named on the command line, then -- if its name doesn't already
// reflect its final capacity -- renames it to pserv-<sizeGB>gb-<n>, picking
// the lowest instance number <n> not already used by another owned server
// at that same size, so it never collides with an existing same-size name.
// Usage: run upgradecloudserver.js <hostname>

import { recordTransaction } from "./translog.js";

const PSERV_NAME_PATTERN = /^pserv-(\d+)gb-(\d+)$/;

/** Pure. Lowest non-negative integer not already used as an instance number by another owned server at `sizeGB`. */
function nextInstanceNumber(otherOwnedNames, sizeGB) {
  const used = new Set();
  for (const name of otherOwnedNames) {
    const match = PSERV_NAME_PATTERN.exec(name);
    if (match && Number(match[1]) === sizeGB) used.add(Number(match[2]));
  }
  let n = 0;
  while (used.has(n)) n++;
  return n;
}

/** @param {NS} ns */
export async function main(ns) {
  const hostname = ns.args[0];
  const owned = ns.cloud.getServerNames();

  if (!hostname || !owned.includes(hostname)) {
    ns.tprint(`ERROR: usage: run upgradecloudserver.js <hostname>`);
    ns.tprint(`ERROR: owned cloud servers: ${owned.length === 0 ? "(none)" : owned.join(", ")}`);
    return;
  }

  const ramLimit = ns.cloud.getRamLimit();
  const startRam = ns.getServerMaxRam(hostname);
  const startMoney = ns.getPlayer().money;
  const report = [];

  while (true) {
    const currentRam = ns.getServerMaxRam(hostname);
    if (currentRam >= ramLimit) break; // already at the ceiling

    const nextTier = currentRam * 2;
    const cost = ns.cloud.getServerUpgradeCost(hostname, nextTier);
    if (cost < 0) {
      ns.tprint(`WARN: bad upgrade cost for ${hostname} -> ${ns.format.ram(nextTier)}, stopping`);
      break;
    }
    if (ns.getPlayer().money < cost) break; // can't afford the next tier -- stop

    if (!ns.cloud.upgradeServer(hostname, nextTier)) {
      ns.tprint(`WARN: upgradeServer failed for ${hostname} -> ${ns.format.ram(nextTier)}, stopping`);
      break;
    }

    report.push(`  ${ns.format.ram(currentRam)} -> ${ns.format.ram(nextTier)}: $${ns.format.number(cost)}`);
    recordTransaction(ns, {
      type: "expense",
      source: "single-server-upgrade",
      hostname,
      detail: `${currentRam}GB -> ${nextTier}GB`,
      amount: cost,
      timestamp: Date.now(),
      time: new Date().toLocaleString(),
    });
  }

  const finalRam = ns.getServerMaxRam(hostname);
  const spent = startMoney - ns.getPlayer().money;

  // Rename only if the current name doesn't already reflect finalRam --
  // covers both a post-upgrade size change and a custom name that was never
  // in the pserv-<sizeGB>gb-<n> shape to begin with. `owned` is the
  // pre-rename snapshot from validation above, so it still lists every
  // *other* server's real current name to check for collisions against.
  const currentMatch = PSERV_NAME_PATTERN.exec(hostname);
  let reportedName = hostname;
  if (!currentMatch || Number(currentMatch[1]) !== finalRam) {
    const otherOwnedNames = owned.filter((name) => name !== hostname);
    const instance = nextInstanceNumber(otherOwnedNames, finalRam);
    const newName = `pserv-${finalRam}gb-${instance}`;
    if (ns.cloud.renameServer(hostname, newName)) {
      reportedName = newName;
    } else {
      ns.tprint(`WARN: rename ${hostname} -> ${newName} failed, still reporting under ${hostname}`);
    }
  }

  ns.tprint(`===== upgrade summary: ${hostname} =====`);
  if (report.length === 0) {
    ns.tprint(`  Nothing upgraded (either at the ${ns.format.ram(ramLimit)} ceiling or can't afford the next tier).`);
  } else {
    for (const line of report) ns.tprint(line);
  }
  ns.tprint(`${reportedName}: ${ns.format.ram(startRam)} -> ${ns.format.ram(finalRam)}, spent $${ns.format.number(spent)}`);
  if (reportedName !== hostname) ns.tprint(`Renamed ${hostname} -> ${reportedName}`);
}
