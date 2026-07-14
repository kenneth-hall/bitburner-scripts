// Read-only live analysis of every eligible hack target -- headless as of
// Phase 24 (dashboard.js is the only standing tail); this never calls
// ns.exec, so it has zero effect on the worker-RAM pool daemon.js competes
// for. Its own static RAM cost (from reusing getTargets's analysis
// functions, same footprint as running targets.js standalone) lives on
// whatever host runs this script, typically home alongside daemon.js.
//
// Two cadences, mirroring daemon.js's own split: a full re-rank/re-plan
// refresh (ranking, thread plan, durations -- all somewhat expensive
// per-target analysis) on TARGETS_CYCLE_MS, and a cheap live security/money
// re-read + rewrite every LIVE_REFRESH_MS so targets-ranking.json actually
// ticks. The print block stays (Phase 24 ground rule: headless != silent --
// a manual `tail targetsmonitor.js` still shows live status for free).

import { getTargets } from "./targets.js";
import { isPrepped } from "./scheduler.js";

const TARGETS_CYCLE_MS = 10000;
const LIVE_REFRESH_MS = 1000;
const TOP_N = 5; // Phase 18: status-sized popup; the full ranking is a file (see footer), not a scrolling list

// Phase 24 (S3): dashboard.js's targets panel source, written every live
// refresh -- top 5 (not the 3 the panel shows), so the file carries a little
// more than the renderer displays, at zero extra analysis cost.
const TARGETS_RANKING_FILE = "targets-ranking.json";

/**
 * Pure (Phase 24, S3). Assembles the targets-ranking.json record from
 * `entries` (TOP_N-sliced, already live-refreshed) and the full unsliced
 * count -- the renderer derives its own top-3 + "(+N more)" from this.
 */
export function buildTargetsRanking(entries, totalCount, now) {
  return { timestamp: now, time: new Date(now).toLocaleTimeString(), totalCount, targets: entries };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  let targets = getTargets(ns);
  let lastCycleTime = Date.now();

  while (true) {
    if (Date.now() - lastCycleTime >= TARGETS_CYCLE_MS) {
      targets = getTargets(ns);
      lastCycleTime = Date.now();
    }

    ns.clearLog();

    if (targets.length === 0) {
      ns.print(`===== targets @ ${new Date().toLocaleTimeString()} =====`);
      ns.print("No eligible targets.");
      ns.write(TARGETS_RANKING_FILE, JSON.stringify(buildTargetsRanking([], 0, Date.now())), "w");
      await ns.sleep(LIVE_REFRESH_MS);
      continue;
    }

    const shown = targets.slice(0, TOP_N);
    ns.print(`===== targets @ ${new Date().toLocaleTimeString()} ===== (top ${shown.length} of ${targets.length} by score)`);
    const rankingEntries = shown.map((t, i) => {
      const currentSecurity = ns.getServerSecurityLevel(t.server);
      const currentMoney = ns.getServerMoneyAvailable(t.server);
      const prepped = isPrepped({
        currentSecurity,
        minSecurityLevel: t.minSecurityLevel,
        currentMoney,
        maxMoney: t.maxMoney,
      });
      const marker = i === 0 ? "-> " : "   "; // top-ranked by score, not necessarily the daemon's actual member set under hysteresis
      ns.print(
        `${marker}${t.server.padEnd(16)} ${prepped ? "PREPPED" : "DRIFTED"} | ` +
          `sec ${currentSecurity.toFixed(2).padStart(7)}/${String(t.minSecurityLevel).padStart(3)} | ` +
          `$${ns.format.number(currentMoney).padStart(10)}/${ns.format.number(t.maxMoney).padStart(10)} | ` +
          `pri ${t.score.toExponential(2)}`
      );
      return { server: t.server, prepped, sec: currentSecurity, minSec: t.minSecurityLevel, money: currentMoney, maxMoney: t.maxMoney, score: t.score };
    });
    ns.print("(full ranking: run targets.js -> targets-summary-<ts>.json)");
    ns.write(TARGETS_RANKING_FILE, JSON.stringify(buildTargetsRanking(rankingEntries, targets.length, Date.now())), "w");

    await ns.sleep(LIVE_REFRESH_MS);
  }
}
