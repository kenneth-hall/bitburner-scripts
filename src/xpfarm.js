// Phase 20 MVP (throwaway pending the productionized version -- see
// phase-20-xpfarm.features.md). Converts the ~98% idle fleet into hacking XP by
// filling free fleet RAM with `weaken` workers aimed at the highest-difficulty
// rooted server. weaken is chosen because it's coexistence-safe: it only lowers
// security, so over-weakening a server is a harmless no-op for the money
// batcher's HWGW state -- unlike grow/hack, which would desync live batches.
//
// Coordination is deliberately dumb for the MVP: each pass reads listHosts'
// live free RAM (already net of whatever the batcher is using) and tops up
// weaken threads, leaving RESERVE_FRAC of every host free so the batcher (which
// uses ~2%) always has room. Previous passes' weakens are still running and
// already reduce freeRam, so this only fills the newly-freed slice -- it
// self-tops-up to near-saturation without killing anything.
//
// Run: `run xpfarm.js`. Stop: kill it. Measurement is the existing
// hacking-progress-log.json (exp/sec before vs after) -- that live number is
// the design input for the production version.
import { listHosts } from "./hosts.js";
import { scanNetwork } from "./common.js";

const WORKER = "weaken.js";
const RESERVE_FRAC = 0.05; // leave 5% of each host free for the money batcher
const LOOP_MS = 10_000;

/** Highest-difficulty rooted network server = most hacking XP per weaken. */
function bestTarget(ns) {
  let best = null;
  let bestReq = -1;
  for (const server of scanNetwork(ns)) {
    if (!ns.hasRootAccess(server)) continue;
    const req = ns.getServerRequiredHackingLevel(server);
    if (req > bestReq) {
      bestReq = req;
      best = server;
    }
  }
  return best;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const ramPerThread = ns.getScriptRam(WORKER, "home");
  let uid = 0;

  while (true) {
    const target = bestTarget(ns);
    if (!target) {
      ns.print("no rooted target yet -- waiting");
      await ns.sleep(LOOP_MS);
      continue;
    }

    const hosts = listHosts(ns);
    let launchedThreads = 0;
    let totalMax = 0;
    let totalUsed = 0;

    for (const host of hosts) {
      totalMax += host.maxRam;
      totalUsed += host.maxRam - host.freeRam;

      // Fill down to the reserve line: usable is freeRam minus RESERVE_FRAC of
      // this host's capacity, so the batcher always keeps a slice.
      const usable = host.freeRam - RESERVE_FRAC * host.maxRam;
      const threads = Math.floor(usable / ramPerThread);
      if (threads < 1) continue;

      ns.scp(WORKER, host.hostname, "home"); // robust vs. newly-rooted hosts the daemon hasn't scp'd yet
      const pid = ns.exec(WORKER, host.hostname, threads, target, 0, uid++);
      if (pid !== 0) launchedThreads += threads;
    }

    const utilPct = totalMax > 0 ? ((totalUsed + launchedThreads * ramPerThread) / totalMax) * 100 : 0;
    ns.print(
      `[${new Date().toLocaleTimeString()}] target ${target} (req ${ns.getServerRequiredHackingLevel(target)}) | ` +
        `+${ns.format.number(launchedThreads)} weaken threads | fleet ~${utilPct.toFixed(0)}% | hack lvl ${ns.getHackingLevel()}`,
    );

    await ns.sleep(LOOP_MS);
  }
}
