// Decides *what to attack* and how hard, as opposed to hosts.js which finds
// *where we can run workers*. daemon.js feeds this target list, in rank
// order, to scheduler.js each cycle.

const HACK_FRACTION = 0.25;

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
 * Ranks reachable servers by MaxMoney / MinSecurityLevel (same eligibility
 * filter as before: has money, RequiredHackingLevel under half the player's
 * hacking level) and adds an exact steady-state thread plan for each:
 * hack HACK_FRACTION of max money, grow back to max, weaken enough to
 * counteract the security added by both plus hold at min security.
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

  const targets = [];

  for (const server of scanNetwork(ns)) {
    if (purchased.has(server)) continue;

    const maxMoney = ns.getServerMaxMoney(server);
    if (maxMoney <= 0) continue;

    const reqLevel = ns.getServerRequiredHackingLevel(server);
    if (reqLevel >= myHackLevel / 2) continue;

    const minSecurityLevel = ns.getServerMinSecurityLevel(server);

    // cores defaults to 1 for growthAnalyze/growthAnalyzeSecurity/weakenAnalyze below;
    // hosts with more cores (multi-core purchased servers) grow/weaken harder per thread
    // than planned here, so actual prep will run a bit faster than this plan assumes.
    const hackThreads = Math.max(1, Math.ceil(ns.hackAnalyzeThreads(server, maxMoney * HACK_FRACTION)));
    const growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(server, 1 / (1 - HACK_FRACTION))));
    const securityAdded =
      ns.hackAnalyzeSecurity(hackThreads, server) + ns.growthAnalyzeSecurity(growThreads, server);
    const weakenThreads = Math.max(1, Math.ceil(securityAdded / weakenPerThread));

    targets.push({
      server,
      maxMoney,
      minSecurityLevel,
      requiredHackingLevel: reqLevel,
      ratio: maxMoney / minSecurityLevel,
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
      weakenTime: ns.getWeakenTime(server),
    });
  }

  targets.sort((a, b) => b.ratio - a.ratio);
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
      `${t.server}: ratio ${ns.format.number(t.ratio)} | ` +
        `sec ${t.currentSecurity.toFixed(1)}/${t.minSecurityLevel} | ` +
        `money ${ns.format.number(t.currentMoney)}/${ns.format.number(t.maxMoney)} | ` +
        `threads H${t.hackThreads}/G${t.growThreads}/W${t.weakenThreads} (${t.totalThreads} total) | ` +
        `times H${ns.format.time(t.hackTime)}/G${ns.format.time(t.growTime)}/W${ns.format.time(t.weakenTime)}`
    );
  }
}
