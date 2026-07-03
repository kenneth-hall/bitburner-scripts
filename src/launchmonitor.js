// Dedicated popup for the daemon's launch history -- pulled out of
// daemon.js's own tail window, where a growing ring buffer alongside a
// per-tick status snapshot eventually crowded the status info above it out
// of view.
//
// Fully independent of daemon.js: rather than daemon.js pushing launch
// events here (which would need port or file coordination), this script
// just watches ns.ps() across every known host and reports any
// hack.js/grow.js/weaken.js process it hasn't seen before -- the same
// decoupled, read-only pattern targetsmonitor.js and moneymonitor.js use.
// Target and additionalMsec are recovered from the worker scripts' own
// launch args, so the reconstructed line carries the same detail daemon.js
// used to log directly.

import { getHosts } from "./hosts.js";
import { WORKER_SCRIPTS } from "./scheduler.js";

const HOST_REFRESH_MS = 10_000;
const POLL_MS = 1000;
const MAX_HISTORY = 30;

const WORKER_FILES = new Set(Object.values(WORKER_SCRIPTS));

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  let hosts = getHosts(ns);
  let lastHostRefresh = Date.now();
  const entries = [];
  let seenPids = new Set();
  // First poll only establishes a baseline -- everything already running
  // when this monitor starts isn't a NEW launch, just pre-existing state.
  let firstPoll = true;

  ns.print(`===== launch monitor (newest first, last 0/${MAX_HISTORY}) =====`);
  ns.print("(none yet)");

  while (true) {
    if (Date.now() - lastHostRefresh >= HOST_REFRESH_MS) {
      hosts = getHosts(ns);
      lastHostRefresh = Date.now();
    }

    const currentPids = new Set();
    const newLines = [];

    for (const host of hosts) {
      for (const proc of ns.ps(host.hostname)) {
        if (!WORKER_FILES.has(proc.filename)) continue;
        currentPids.add(proc.pid);
        if (seenPids.has(proc.pid) || firstPoll) continue;

        const action = proc.filename.replace(".js", "");
        const target = proc.args[0];
        const additionalMsec = Number(proc.args[1]) || 0;
        const timestamp = new Date().toLocaleTimeString();
        newLines.push(
          `${timestamp} ${action.padEnd(7)} ${String(proc.threads).padStart(4)}t @ ${host.hostname} -> ${target} (+${additionalMsec}ms)`
        );
      }
    }

    if (newLines.length > 0) {
      for (let i = newLines.length - 1; i >= 0; i--) entries.unshift(newLines[i]);
      if (entries.length > MAX_HISTORY) entries.length = MAX_HISTORY;

      ns.clearLog();
      ns.print(`===== launch monitor (newest first, last ${entries.length}/${MAX_HISTORY}) =====`);
      for (const entry of entries) ns.print(entry);
    }

    seenPids = currentPids;
    firstPoll = false;
    await ns.sleep(POLL_MS);
  }
}
