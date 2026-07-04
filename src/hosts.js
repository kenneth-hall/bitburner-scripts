// Discovers *where we can run workers*, as opposed to targets.js which
// decides *what to attack*. Called fresh every daemon cycle so newly rooted
// servers and newly purchased servers show up automatically.

const HOME_RESERVE_GB = 32;

const PORT_OPENERS = [
  { file: "BruteSSH.exe", open: (ns, host) => ns.brutessh(host) },
  { file: "FTPCrack.exe", open: (ns, host) => ns.ftpcrack(host) },
  { file: "relaySMTP.exe", open: (ns, host) => ns.relaysmtp(host) },
  { file: "HTTPWorm.exe", open: (ns, host) => ns.httpworm(host) },
  { file: "SQLInject.exe", open: (ns, host) => ns.sqlinject(host) },
];

function scanNetwork(ns) {
  const visited = new Set(["home"]);
  const queue = ["home"];
  const found = [];

  while (queue.length > 0) {
    const host = queue.shift();
    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        found.push(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return found;
}

/**
 * Scans the network, nukes anything newly rootable (regardless of whether it
 * holds money), and returns every host we can run workers on: rooted network
 * servers, purchased servers, and home. Home's free RAM is reported with
 * HOME_RESERVE_GB held back so the daemon and manual scripts always have
 * room to run.
 * @param {NS} ns
 */
export function getHosts(ns) {
  const owned = PORT_OPENERS.filter((p) => ns.fileExists(p.file, "home"));
  const purchased = new Set(ns.cloud.getServerNames());
  const myHackLevel = ns.getHackingLevel();

  const hosts = [];

  for (const server of scanNetwork(ns)) {
    if (purchased.has(server)) continue;

    if (!ns.hasRootAccess(server)) {
      const reqLevel = ns.getServerRequiredHackingLevel(server);
      const reqPorts = ns.getServerNumPortsRequired(server);
      if (reqLevel > myHackLevel || reqPorts > owned.length) continue;

      for (const program of owned) program.open(ns, server);
      ns.nuke(server);
      ns.tprint(`INFO: rooted new host ${server}`);
    }

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
