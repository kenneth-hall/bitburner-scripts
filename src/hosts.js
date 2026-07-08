// Discovers *where we can run workers*, as opposed to targets.js which
// decides *what to attack*. Called fresh every daemon cycle so newly rooted
// servers and newly purchased servers show up automatically.

import { scanNetwork, tprintTs } from "./common.js";

export const HOME_RESERVE_GB = 32;

const PORT_OPENERS = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"];

/** Runs the port-opener program matching `file` against `host`. See tryRoot's doc comment for why this is a switch, not a lookup table of closures. */
function openPort(ns, file, host) {
  switch (file) {
    case "BruteSSH.exe":
      return ns.brutessh(host);
    case "FTPCrack.exe":
      return ns.ftpcrack(host);
    case "relaySMTP.exe":
      return ns.relaysmtp(host);
    case "HTTPWorm.exe":
      return ns.httpworm(host);
    case "SQLInject.exe":
      return ns.sqlinject(host);
  }
}

/**
 * Roots `server` if it isn't already, returning true iff it ends the call
 * rooted. Reads owned openers and hacking level fresh every call (rather than
 * hoisting them to a caller-supplied argument) -- deliberate: it keeps the
 * future backdoor phase's call signature trivial (tryRoot(ns, "CSEC")), and
 * once-per-name RAM charging plus the small candidate count make the repeated
 * reads free in both GB and time.
 *
 * PORT_OPENERS and openPort are scoped to this function/module deliberately,
 * and openPort calls each opener inline (a switch, not a lookup table of
 * closures) rather than storing `(ns, host) => ns.brutessh(host)`-style
 * function values in an object/array -- Phase 13's original implementation
 * used that closures-as-data shape and measured +0.25GB (5 openers) leaking
 * into every importer regardless of whether tryRoot was ever reached. A
 * mid-phase live re-run of the gate after switching to this inline-switch
 * shape still measured the same +0.25GB, which briefly looked like proof the
 * analyzer can't prune closures-as-data at all -- but a forensic pass found
 * the game had been serving stale pre-refactor code for that entire re-run (a
 * `git checkout` for an unrelated merge, done in this checkout while
 * viteburner's watcher was live, pushed the reverted files; see
 * docs/phases/phase-13-consolidation.closeout.md for the full timeline). A
 * verified re-run (byte-checked against dist/src/* so staleness can't repeat)
 * confirmed this inline-switch shape prunes correctly: exactly flat,
 * launchmonitor.js's -0.65 hit target. Lesson kept for the next RAM
 * puzzle: never trust a gate reading without a staleness check, and never
 * `git checkout`/switch branches in a dev-server-watched checkout while the
 * game is connected unless the push is intended.
 * @param {NS} ns
 * @param {string} server
 */
export function tryRoot(ns, server) {
  if (ns.hasRootAccess(server)) return true;

  const owned = PORT_OPENERS.filter((file) => ns.fileExists(file, "home"));
  const reqLevel = ns.getServerRequiredHackingLevel(server);
  const reqPorts = ns.getServerNumPortsRequired(server);
  const myHackLevel = ns.getHackingLevel();
  if (reqLevel > myHackLevel || reqPorts > owned.length) return false;

  for (const file of owned) openPort(ns, file, server);
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

/**
 * Pure. Fixed allocatable capacity across a host list (maxRam minus home's
 * reserve) -- the denominator daemon.js uses for "how full is the system"
 * and the budget pickBatchSet admits pipelines against, and sharecurve.js
 * uses for its share-fraction sweep.
 * @param {{hostname: string, maxRam: number}[]} hosts
 */
export function totalAllocatableRam(hosts) {
  return hosts.reduce((sum, h) => {
    const reserve = h.hostname === "home" ? HOME_RESERVE_GB : 0;
    return sum + Math.max(0, h.maxRam - reserve);
  }, 0);
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
