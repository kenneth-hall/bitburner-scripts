// Manual cleanup utility. daemon.js runs this once at startup for a clean
// slate, never per cycle -- the daemon's own kill/launch diffing handles
// steady-state churn.

import { scanNetwork } from "./common.js";

/**
 * args[0], if provided, is the pid of the script that invoked this one --
 * daemon.js passes its own ns.pid so its startup cleanup doesn't kill itself.
 * Matching by pid (not filename) means a *stale* daemon.js from a previous
 * run that was never killed gets swept up like anything else; only the
 * specific process that's calling us right now is protected. A standalone
 * manual run (no args) protects nothing but itself, so it kills everything,
 * including any lingering daemon.js.
 * @param {NS} ns
 */
export async function main(ns) {
  const callerPid = ns.args[0] !== undefined ? Number(ns.args[0]) : null;
  const killed = [];

  for (const proc of ns.ps("home")) {
    if (proc.pid === ns.pid || proc.pid === callerPid) continue;
    // Phase 18: ns.kill() doesn't close the process's tail window -- it's a
    // separate UI element that otherwise sits frozen/orphaned on screen
    // (tailmanager.js can't reach it either; it only ever sees the current
    // running instance via getRunningScript). Close it in the same breath as
    // the kill so every restart starts with a clean screen. 0 GB (markdown/
    // bitburner.userinterface.closetail.md).
    ns.ui.closeTail(proc.pid);
    ns.kill(proc.pid);
    killed.push(`home: ${proc.filename} (pid ${proc.pid})`);
  }

  for (const server of scanNetwork(ns)) {
    if (ns.killall(server)) {
      killed.push(`${server}: killall`);
    }
  }

  ns.tprint("===== killscripts summary =====");
  if (killed.length === 0) {
    ns.tprint("Nothing was running.");
  } else {
    for (const line of killed) ns.tprint(`  ${line}`);
  }
}
