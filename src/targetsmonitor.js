// Read-only live dashboard of every eligible hack target -- a companion to
// daemon.js's own tail window, which only ever surfaces its single current
// batch target. This never calls ns.exec, so it has zero effect on the
// worker-RAM pool daemon.js competes for; its own static RAM cost (from
// reusing getTargets's analysis functions, same footprint as running
// targets.js standalone) lives on whatever host runs this script, typically
// home alongside daemon.js.
//
// Two cadences, mirroring daemon.js's own split: a full re-rank/re-plan
// refresh (ranking, thread plan, durations -- all somewhat expensive
// per-target analysis) on TARGETS_CYCLE_MS, and a cheap live security/money
// re-read + reprint every LIVE_REFRESH_MS so the numbers actually tick.

import { getTargets } from "./targets.js";
import { isPrepped } from "./scheduler.js";

const TARGETS_CYCLE_MS = 10000;
const LIVE_REFRESH_MS = 1000;

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  let targets = getTargets(ns);
  let lastCycleTime = Date.now();

  while (true) {
    if (Date.now() - lastCycleTime >= TARGETS_CYCLE_MS) {
      targets = getTargets(ns);
      lastCycleTime = Date.now();
    }

    ns.clearLog();
    ns.print(`===== targets monitor @ ${new Date().toLocaleTimeString()} =====`);

    if (targets.length === 0) {
      ns.print("No eligible targets.");
      await ns.sleep(LIVE_REFRESH_MS);
      continue;
    }

    targets.forEach((t, i) => {
      const currentSecurity = ns.getServerSecurityLevel(t.server);
      const currentMoney = ns.getServerMoneyAvailable(t.server);
      const prepped = isPrepped({
        currentSecurity,
        minSecurityLevel: t.minSecurityLevel,
        currentMoney,
        maxMoney: t.maxMoney,
      });
      const marker = i === 0 ? "-> " : "   "; // top-ranked entry is daemon.js's current batch target
      ns.print(
        `${marker}${t.server.padEnd(16)} ${prepped ? "PREPPED" : "DRIFTED"} | ` +
          `sec ${currentSecurity.toFixed(2).padStart(7)}/${String(t.minSecurityLevel).padStart(3)} | ` +
          `money ${ns.format.number(currentMoney).padStart(10)}/${ns.format.number(t.maxMoney).padStart(10)} | ` +
          `ratio ${ns.format.number(t.ratio)}`
      );
    });

    await ns.sleep(LIVE_REFRESH_MS);
  }
}
