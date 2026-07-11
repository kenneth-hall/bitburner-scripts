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

const WEAKEN = "weaken.js";
const HACK = "hack.js";
const RESERVE_FRAC = 0.05; // leave 5% of each host free for the money batcher
const HACK_FRAC = 0.84; // hack/weaken split to hold min security (weaken -0.05 vs hack +0.002 at 4x duration)
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

  // mode: "weaken" (original stopgap) or "hack" (hack-saturation test). Default hack.
  const mode = (ns.args[0] ?? "hack").toString();
  const weakenRam = ns.getScriptRam(WEAKEN, "home");
  const hackRam = ns.getScriptRam(HACK, "home");
  let uid = 0;

  while (true) {
    const target = bestTarget(ns);
    if (!target) {
      ns.print("no rooted target yet -- waiting");
      await ns.sleep(LOOP_MS);
      continue;
    }

    const hosts = listHosts(ns);
    let hackThreads = 0;
    let weakenThreads = 0;

    for (const host of hosts) {
      const usable = host.freeRam - RESERVE_FRAC * host.maxRam;
      if (usable < weakenRam) continue;
      ns.scp([WEAKEN, HACK], host.hostname, "home");

      if (mode === "hack") {
        // Split this host's usable RAM ~84/16 hack/weaken on the same target,
        // fire-and-forget: hack drains money (harmless -- exp is money-independent)
        // and the weaken share holds min security so hackTime stays short.
        const wThreads = Math.floor((usable * (1 - HACK_FRAC)) / weakenRam);
        const hThreads = Math.floor((usable - wThreads * weakenRam) / hackRam);
        if (wThreads >= 1 && ns.exec(WEAKEN, host.hostname, wThreads, target, 0, uid++) !== 0) weakenThreads += wThreads;
        if (hThreads >= 1 && ns.exec(HACK, host.hostname, hThreads, target, 0, uid++) !== 0) hackThreads += hThreads;
      } else {
        const wThreads = Math.floor(usable / weakenRam);
        if (wThreads >= 1 && ns.exec(WEAKEN, host.hostname, wThreads, target, 0, uid++) !== 0) weakenThreads += wThreads;
      }
    }

    const sec = ns.getServerSecurityLevel(target);
    const minSec = ns.getServerMinSecurityLevel(target);
    ns.print(
      `[${new Date().toLocaleTimeString()}] ${mode} ${target} (req ${ns.getServerRequiredHackingLevel(target)}) | ` +
        `+${ns.format.number(hackThreads)}H/${ns.format.number(weakenThreads)}W | ` +
        `sec ${sec.toFixed(1)}/${minSec.toFixed(1)} | lvl ${ns.getHackingLevel()}`,
    );

    await ns.sleep(LOOP_MS);
  }
}
