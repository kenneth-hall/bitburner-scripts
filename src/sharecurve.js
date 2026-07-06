// Manual one-shot tuning instrument for Phase 8's share allocation. Prints
// (and exports) the predicted ns.formulas.reputation.sharePower curve across
// a spread of candidate fractions, so revisiting SHARE_FRACTION (currently a
// deliberate guess -- see scheduler.js) doesn't require a live session per
// candidate. Requires Formulas.exe; the daemon's own share manager never
// depends on it, only this script does.

import { SHARE_SCRIPT } from "./scheduler.js";
import { hasFormulas, inFlightByTarget } from "./sampling.js";
import { listHosts, HOME_RESERVE_GB } from "./hosts.js";

const CANDIDATE_FRACTIONS = [0.05, 0.1, 0.15, 0.25, 0.4, 0.5, 0.75, 1.0];

function totalAllocatableRam(hosts) {
  return hosts.reduce((sum, h) => {
    const reserve = h.hostname === "home" ? HOME_RESERVE_GB : 0;
    return sum + Math.max(0, h.maxRam - reserve);
  }, 0);
}

/** @param {NS} ns */
export async function main(ns) {
  if (!hasFormulas(ns)) {
    ns.tprint("ERROR: sharecurve.js requires Formulas.exe (or legacy-mode.txt is forcing it off) -- nothing to compute.");
    return;
  }

  const hosts = listHosts(ns);
  const capacity = totalAllocatableRam(hosts);
  const ramPerThread = ns.getScriptRam(SHARE_SCRIPT, "home");
  const cpuCores = ns.getServer("home").cpuCores;

  const currentSharePower = ns.getSharePower();
  const ramCosts = { [SHARE_SCRIPT]: ramPerThread };
  const sweep = inFlightByTarget(ns, hosts, ramCosts);
  const currentThreads = sweep.sharePool.threads;

  const curve = CANDIDATE_FRACTIONS.map((fraction) => {
    const threads = Math.floor((fraction * capacity) / ramPerThread);
    // 1 core: the fleet is essentially all 1-core; home's actual cpuCores is
    // reported separately below for context, per the spec's open question on
    // core-weighted placement (deliberately untuned this phase).
    const sharePower = threads > 0 ? ns.formulas.reputation.sharePower(threads, 1) : 1;
    return { fraction, threads, sharePower };
  });

  const timestamp = Date.now();

  ns.tprint("===== sharecurve =====");
  ns.tprint(`capacity: ${ns.format.ram(capacity)} | ramPerThread: ${ns.format.ram(ramPerThread)} | home cores: ${cpuCores}`);
  ns.tprint(`current: ${currentThreads} threads in flight, sharePower ${currentSharePower.toFixed(3)}`);
  for (const c of curve) {
    ns.tprint(`  ${(c.fraction * 100).toFixed(0).padStart(3)}% -> ${String(c.threads).padStart(7)}t -> power ${c.sharePower.toFixed(3)}`);
  }

  ns.write(
    `sharecurve-${timestamp}.json`,
    JSON.stringify(
      {
        time: new Date().toLocaleTimeString(),
        timestamp,
        capacity,
        ramPerThread,
        homeCpuCores: cpuCores,
        current: { threads: currentThreads, sharePower: currentSharePower },
        curve,
      },
      null,
      2
    ),
    "w"
  );
}
