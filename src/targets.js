// Decides *what to attack* and how hard, as opposed to hosts.js which finds
// *where we can run workers*. daemon.js feeds this target list, in rank
// order, to scheduler.js each cycle.

import { HACK_FRACTION, WORKER_SCRIPTS, batchRamCost } from "./scheduler.js";
import { steadyStatePlan, hasFormulas, isForcedLegacy } from "./sampling.js";

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
 * the player's hacking level) and adds a steady-state thread plan for each:
 * hack HACK_FRACTION, grow back to max, weaken enough to counteract the
 * security added by both plus hold at min security. The plan itself
 * (steadyStatePlan, in sampling.js) is mode-aware -- formulas mode scores at
 * the target's prepped state instead of its current condition, which is the
 * Phase 4 churn fix (see that function's doc comment).
 *
 * hackAnalyze/growthAnalyze/weakenAnalyze are all linear in thread count
 * "regardless of how many threads are assigned to each call" (per docs), so
 * splitting a target's thread plan across multiple processes/hosts doesn't
 * change the total effect -- the daemon relies on this to spread threads.
 * @param {NS} ns
 */
export function getTargets(ns) {
  const myHackLevel = ns.getHackingLevel();
  const purchased = new Set(ns.cloud.getServerNames());
  const useFormulas = hasFormulas(ns);

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

    // null means unhackable this tick (mirrors sampleBatchFields's identical
    // guard) -- a drained target would otherwise get a near-zero ramCost and
    // an *inflated* score, the ranking's worst error (a fake #1).
    const plan = steadyStatePlan(ns, { server, minSecurityLevel, maxMoney }, useFormulas);
    if (plan === null) continue;
    const { hackThreads, growThreads, weakenThreads, weakenTime, hackChance } = plan;

    const ramCost = batchRamCost(
      [
        { script: WORKER_SCRIPTS.hack, threads: hackThreads },
        { script: WORKER_SCRIPTS.grow, threads: growThreads },
        { script: WORKER_SCRIPTS.weaken, threads: weakenThreads },
      ],
      workerRamCosts
    );

    const score = (maxMoney * HACK_FRACTION * hackChance) / (ramCost * (weakenTime / 1000));

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
      // these, since security drifts faster than the CYCLE_MS refresh. No
      // formulas branch needed here -- same as batch timing (sampleBatchFields
      // splits "cost basis" from "real timing" via steadyWeakenTime for
      // exactly this reason), real duration is fixed by current state, not
      // the prepped-state score. `plan.weakenTime` (prepped-state in formulas
      // mode) already fed the score above; this field is deliberately a
      // fresh current-state sample instead, so samplePrepFields' job-landing
      // math and this status line stay consistent with hackTime/growTime.
      hackTime: ns.getHackTime(server),
      growTime: ns.getGrowTime(server),
      weakenTime: ns.getWeakenTime(server),
    });
  }

  targets.sort((a, b) => b.score - a.score);
  return targets;
}

// Exported so each run's summary can be read back offline (see logs/ and
// vite.config.ts's download filter) instead of relying on copy-pasted
// terminal output. Filename carries the epoch-ms timestamp so repeated runs
// (e.g. a before/after prep comparison) each land as their own file instead
// of overwriting each other -- letting multiple runs be compared without
// needing a fresh prompt/paste after every single one.
function targetsSummaryFile(timestamp) {
  return `targets-summary-${timestamp}.json`;
}

/** @param {NS} ns */
export async function main(ns) {
  const targets = getTargets(ns);
  const useFormulas = hasFormulas(ns);
  const forcedLegacy = isForcedLegacy(ns);
  const mathLabel = useFormulas ? "formulas" : forcedLegacy ? "legacy (forced)" : "legacy";
  const timestamp = Date.now();

  ns.tprint(`===== targets summary (math: ${mathLabel}) =====`);
  if (targets.length === 0) {
    ns.tprint("No eligible targets found.");
    ns.write(targetsSummaryFile(timestamp), JSON.stringify({ time: new Date().toLocaleTimeString(), timestamp, mathLabel, targets: [] }, null, 2), "w");
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

  ns.write(
    targetsSummaryFile(timestamp),
    JSON.stringify({ time: new Date().toLocaleTimeString(), timestamp, mathLabel, targets }, null, 2),
    "w"
  );
}
