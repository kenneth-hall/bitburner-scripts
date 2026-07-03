// Decides *what to attack* and how hard, as opposed to hosts.js which finds
// *where we can run workers*. daemon.js feeds this target list, in rank
// order, to scheduler.js each cycle.

import { HACK_FRACTION, WORKER_SCRIPTS, batchRamCost } from "./scheduler.js";

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
 * Ranks reachable servers by expected dollars per GB-second (same
 * eligibility filter as before: has money, RequiredHackingLevel under half
 * the player's hacking level) and adds an exact steady-state thread plan for
 * each: hack HACK_FRACTION of current money, grow back to max, weaken enough
 * to counteract the security added by both plus hold at min security.
 *
 * hackAnalyze/growthAnalyze/weakenAnalyze are all linear in thread count
 * "regardless of how many threads are assigned to each call" (per docs), so
 * splitting a target's thread plan across multiple processes/hosts doesn't
 * change the total effect -- the daemon relies on this to spread threads.
 * growthAnalyze does ignore the $1-per-thread additive bonus grow() gets at
 * very low money, so growThreads is a slight overestimate there; harmless
 * since we round up anyway.
 * @param {NS} ns
 */
export function getTargets(ns) {
  const myHackLevel = ns.getHackingLevel();
  const purchased = new Set(ns.cloud.getServerNames());
  const weakenPerThread = ns.weakenAnalyze(1);

  // Read once per call, not per server -- these don't change between
  // servers, only between game restarts (script file edits).
  const workerRamCosts = {
    [WORKER_SCRIPTS.hack]: ns.getScriptRam(WORKER_SCRIPTS.hack, "home"),
    [WORKER_SCRIPTS.grow]: ns.getScriptRam(WORKER_SCRIPTS.grow, "home"),
    [WORKER_SCRIPTS.weaken]: ns.getScriptRam(WORKER_SCRIPTS.weaken, "home"),
  };

  const targets = [];

  for (const server of scanNetwork(ns)) {
    if (purchased.has(server)) continue;

    const maxMoney = ns.getServerMaxMoney(server);
    if (maxMoney <= 0) continue;

    const reqLevel = ns.getServerRequiredHackingLevel(server);
    if (reqLevel >= myHackLevel / 2) continue;

    const minSecurityLevel = ns.getServerMinSecurityLevel(server);

    // Money-independent sizing (mirrors sampleBatchFields in daemon.js):
    // hackAnalyzeThreads(server, maxMoney * fraction) returns -1 -- silently
    // floored to 1 thread by the old max(1, ceil(...)) guard -- whenever the
    // server currently holds less than that absolute amount. A drained
    // target would then get a near-zero batchRamCost and an *inflated*
    // score: the ranking's worst error would be a fake #1. hackAnalyze
    // shouldn't be 0 for a target that passed the reqLevel filter above, but
    // skip rather than divide into Infinity if it ever is.
    const hackAnalyzePerThread = ns.hackAnalyze(server);
    if (hackAnalyzePerThread <= 0) continue;

    // cores defaults to 1 for growthAnalyze/growthAnalyzeSecurity/weakenAnalyze below;
    // hosts with more cores (multi-core purchased servers) grow/weaken harder per thread
    // than planned here, so actual prep will run a bit faster than this plan assumes.
    const hackThreads = Math.max(1, Math.ceil(HACK_FRACTION / hackAnalyzePerThread));
    const growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(server, 1 / (1 - HACK_FRACTION))));
    const securityAdded =
      ns.hackAnalyzeSecurity(hackThreads, server) + ns.growthAnalyzeSecurity(growThreads, server);
    const weakenThreads = Math.max(1, Math.ceil(securityAdded / weakenPerThread));

    const ramCost = batchRamCost(
      [
        { script: WORKER_SCRIPTS.hack, threads: hackThreads },
        { script: WORKER_SCRIPTS.grow, threads: growThreads },
        { script: WORKER_SCRIPTS.weaken, threads: weakenThreads },
      ],
      workerRamCosts
    );
    const weakenTime = ns.getWeakenTime(server);

    // hackAnalyzeChance and weakenTime are both sampled at *current*
    // security, so a high-security (unprepped/drifted) target scores
    // pessimistically here -- acceptable, since the score self-corrects as
    // prep progresses, but it means a great-but-unweakened target ranks low
    // until the waterfall gets around to prepping it.
    const score = (maxMoney * HACK_FRACTION * ns.hackAnalyzeChance(server)) / (ramCost * (weakenTime / 1000));

    targets.push({
      server,
      maxMoney,
      minSecurityLevel,
      requiredHackingLevel: reqLevel,
      ratio: maxMoney / minSecurityLevel,
      score,
      currentSecurity: ns.getServerSecurityLevel(server),
      currentMoney: ns.getServerMoneyAvailable(server),
      hackThreads,
      growThreads,
      weakenThreads,
      totalThreads: hackThreads + growThreads + weakenThreads,
      // Phase 2: durations for the batch scheduler's timing math. These are
      // only refreshed every CYCLE_MS here; the live batch path in daemon.js
      // re-samples fresh durations at every batch launch instead of using
      // these, since security drifts faster than the CYCLE_MS refresh.
      hackTime: ns.getHackTime(server),
      growTime: ns.getGrowTime(server),
      weakenTime,
    });
  }

  targets.sort((a, b) => b.score - a.score);
  return targets;
}

/** @param {NS} ns */
export async function main(ns) {
  const targets = getTargets(ns);

  ns.tprint("===== targets summary =====");
  if (targets.length === 0) {
    ns.tprint("No eligible targets found.");
    return;
  }
  for (const t of targets) {
    ns.tprint(
      `${t.server}: score ${t.score.toExponential(2)} (ratio ${ns.format.number(t.ratio)}) | ` +
        `sec ${t.currentSecurity.toFixed(1)}/${t.minSecurityLevel} | ` +
        `money ${ns.format.number(t.currentMoney)}/${ns.format.number(t.maxMoney)} | ` +
        `threads H${t.hackThreads}/G${t.growThreads}/W${t.weakenThreads} (${t.totalThreads} total) | ` +
        `times H${ns.format.time(t.hackTime)}/G${ns.format.time(t.growTime)}/W${ns.format.time(t.weakenTime)}`
    );
  }
}
