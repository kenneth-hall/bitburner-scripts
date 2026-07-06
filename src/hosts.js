// Discovers *where we can run workers*, as opposed to targets.js which
// decides *what to attack*. Called fresh every daemon cycle so newly rooted
// servers and newly purchased servers show up automatically.

import { scanNetwork, tprintTs } from "./common.js";

export const HOME_RESERVE_GB = 32;

/**
 * Roots `server` if it isn't already, returning true iff it ends the call
 * rooted. Reads owned openers and hacking level fresh every call (rather than
 * hoisting them to a caller-supplied argument) -- deliberate: it keeps the
 * future backdoor phase's call signature trivial (tryRoot(ns, "CSEC")), and
 * once-per-name RAM charging plus the small candidate count make the repeated
 * reads free in both GB and time.
 *
 * PORT_OPENERS is declared inside this function, not at module scope: a
 * module-top-level const's closures are statically reachable to every
 * importer of this file regardless of which export they actually call
 * (confirmed live, Phase 13 RAM gate -- launchmonitor.js's listHosts-only
 * import still carried the five openers' 0.25GB until this move, and
 * sharecurve.js picked up that same unwanted 0.25GB the instant it started
 * importing anything from hosts.js). Scoping it here means the five opener
 * closures are only reachable from a script that actually calls tryRoot.
 * @param {NS} ns
 * @param {string} server
 */
export function tryRoot(ns, server) {
  if (ns.hasRootAccess(server)) return true;

  const PORT_OPENERS = [
    { file: "BruteSSH.exe", open: (ns, host) => ns.brutessh(host) },
    { file: "FTPCrack.exe", open: (ns, host) => ns.ftpcrack(host) },
    { file: "relaySMTP.exe", open: (ns, host) => ns.relaysmtp(host) },
    { file: "HTTPWorm.exe", open: (ns, host) => ns.httpworm(host) },
    { file: "SQLInject.exe", open: (ns, host) => ns.sqlinject(host) },
  ];

  const owned = PORT_OPENERS.filter((p) => ns.fileExists(p.file, "home"));
  const reqLevel = ns.getServerRequiredHackingLevel(server);
  const reqPorts = ns.getServerNumPortsRequired(server);
  const myHackLevel = ns.getHackingLevel();
  if (reqLevel > myHackLevel || reqPorts > owned.length) return false;

  for (const program of owned) program.open(ns, server);
  ns.nuke(server);
  tprintTs(ns, `INFO: rooted new host ${server}`);
  return true;
}

/**
 * Pure listing, no rooting side effects: every host we can currently run
 * workers on -- rooted network servers, purchased servers, and home. Home's
 * free RAM is reported with HOME_RESERVE_GB held back so the daemon and
 * manual scripts always have room to run. Purchased servers are skipped in
 * the network pass and appended once, unconditionally -- they also appear in
 * ns.scan's results and always have root, so skipping them there and
 * appending them separately avoids double-counting every purchased server.
 * @param {NS} ns
 */
export function listHosts(ns) {
  const purchased = new Set(ns.cloud.getServerNames());

  const hosts = [];

  for (const server of scanNetwork(ns)) {
    if (purchased.has(server)) continue;
    if (!ns.hasRootAccess(server)) continue;

    hosts.push({
      hostname: server,
      maxRam: ns.getServerMaxRam(server),
      freeRam: ns.getServerMaxRam(server) - ns.getServerUsedRam(server),
    });
  }

  for (const server of purchased) {
    hosts.push({
      hostname: server,
      maxRam: ns.getServerMaxRam(server),
      freeRam: ns.getServerMaxRam(server) - ns.getServerUsedRam(server),
    });
  }

  const homeMaxRam = ns.getServerMaxRam("home");
  const homeUsedRam = ns.getServerUsedRam("home");
  hosts.push({
    hostname: "home",
    maxRam: homeMaxRam,
    freeRam: Math.max(0, homeMaxRam - homeUsedRam - HOME_RESERVE_GB),
  });

  return hosts;
}

/**
 * Scans the network, nukes anything newly rootable (regardless of whether it
 * holds money), and returns listHosts(ns)'s full host list. Composition:
 * rooting pass (tryRoot per non-purchased network host, result unused --
 * rooting is the point), then listHosts.
 * @param {NS} ns
 */
export function getHosts(ns) {
  const purchased = new Set(ns.cloud.getServerNames());

  for (const server of scanNetwork(ns)) {
    if (purchased.has(server)) continue;
    tryRoot(ns, server);
  }

  return listHosts(ns);
}

/** @param {NS} ns */
export async function main(ns) {
  const hosts = getHosts(ns);

  ns.tprint("===== hosts summary =====");
  if (hosts.length === 0) {
    ns.tprint("No usable hosts found.");
    return;
  }
  for (const h of hosts) {
    ns.tprint(`${h.hostname}: ${ns.format.number(h.freeRam)} / ${ns.format.number(h.maxRam)} GB free`);
  }
}
