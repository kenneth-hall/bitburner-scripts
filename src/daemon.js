// Central-allocation daemon (Phase 2 of the batcher refactor). Runs forever
// on home. Two cadences: hosts/targets refresh every CYCLE_MS (rooting, new
// purchases, level-ups picked up automatically -- same as Phase 1), and a
// much faster BATCH_INTERVAL_MS inner loop that reads live security/money for
// the top-ranked target, launches a timed HWGW batch when it's prepped, or
// dispatches prep jobs when it's drifted, then spends any leftover RAM
// prepping lower-ranked targets. scheduler.js (Phase 2's replacement for
// allocator.js) does all the pure thread/timing math; this file does all the
// `ns` calls and exec/scp plumbing, same split Phase 1 had.

import { getHosts } from "./hosts.js";
import { getTargets } from "./targets.js";
import {
  WORKER_SCRIPTS,
  HACK_FRACTION,
  GROW_BUFFER,
  WEAKEN_BUFFER,
  DRIFT_SEC_EPSILON,
  DRIFT_MONEY_FRACTION,
  MIN_HACK_FRACTION,
  BATCH_INTERVAL_MS,
  RANK_HYSTERESIS,
  isPrepped,
  shrinkHackFraction,
  planBatch,
  assignBatchHosts,
  planPrep,
  pickBatchTarget,
  pipelineDepth,
  batchRamCost,
  carveReservation,
} from "./scheduler.js";

const CYCLE_MS = 10000;

// How many recent launch events to keep visible in the tail window. Without
// this, per-dispatch launch lines would vanish the instant the next tick's
// ns.clearLog() runs -- a ring buffer persisted across ticks keeps a rolling
// window of them visible instead of a single tick's worth.
const MAX_LAUNCH_HISTORY = 30;

// Phase 1's daemon scp'd these to every rooted host over its runs; they're
// dead weight now that hack.js/grow.js/weaken.js replace them. Swept once at
// startup, not every CYCLE_MS -- ns.rm just returns false (harmlessly) once
// they're gone, so repeating it forever would be pointless.
const OLD_WORKER_FILES = ["hackloop.js", "growloop.js", "weakenloop.js"];

// hosts.js stays unchanged per spec (its HOME_RESERVE_GB is private to it);
// this is duplicated here only for the cheap per-tick RAM re-read below,
// which intentionally skips hosts.js's rooting/nuke scan -- that stays on
// the CYCLE_MS cadence. The codebase already duplicates small helpers this
// way (e.g. scanNetwork appears in hosts.js/targets.js/killscripts.js).
const HOME_RESERVE_GB = 32;

// daemon.js runs unattended for a long time, so unlike a one-shot manual
// utility's output (already implicitly timestamped by "you just ran it"),
// its terminal notifications fire at unpredictable moments during that run
// -- knowing *when* matters, so every one of them gets a timestamp prefix.
function tprintTs(ns, message) {
  ns.tprint(`[${new Date().toLocaleTimeString()}] ${message}`);
}

/**
 * Fire-and-forget launch for a long-running companion script that opens its
 * own tail window and never exits (targetsmonitor.js) -- unlike
 * runAndWait's one-shot utilities, there's nothing to wait for here.
 */
function launchDetached(ns, script, ...args) {
  const scriptRam = ns.getScriptRam(script, "home");
  const freeRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  if (scriptRam > freeRam) {
    tprintTs(
      ns,
      `INFO: skipped ${script} at startup -- needs ${ns.format.ram(scriptRam)} but only ${ns.format.ram(freeRam)} free on home`
    );
    return;
  }

  const pid = ns.exec(script, "home", 1, ...args);
  if (pid === 0) tprintTs(ns, `ERROR: failed to start ${script}`);
}

async function runAndWait(ns, script, ...args) {
  // Singularity scripts (purchasescripts.js, upgradehomeram.js) carry a RAM
  // multiplier without SF4 and commonly just don't fit on home yet -- that's
  // an expected, non-fatal outcome (see purchasescripts.js's own comment),
  // not a bug, so check for it up front and say so plainly instead of
  // surfacing a generic "failed to start" that reads like one.
  const scriptRam = ns.getScriptRam(script, "home");
  const freeRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  if (scriptRam > freeRam) {
    tprintTs(
      ns,
      `INFO: skipped ${script} at startup -- needs ${ns.format.ram(scriptRam)} but only ${ns.format.ram(freeRam)} free on home`
    );
    return;
  }

  const pid = ns.exec(script, "home", 1, ...args);
  if (pid === 0) {
    tprintTs(ns, `ERROR: failed to start ${script}`);
    return;
  }
  while (ns.isRunning(pid)) {
    await ns.sleep(100);
  }
}

/** Cheap live free-RAM re-read for an already-known host list -- no rescan. */
function refreshFreeRam(ns, hosts) {
  return hosts.map((h) => {
    const maxRam = ns.getServerMaxRam(h.hostname);
    const usedRam = ns.getServerUsedRam(h.hostname);
    const reserve = h.hostname === "home" ? HOME_RESERVE_GB : 0;
    return { hostname: h.hostname, freeRam: Math.max(0, maxRam - usedRam - reserve) };
  });
}

/**
 * Fixed allocatable capacity (maxRam minus home's reserve), from the
 * CYCLE_MS-cached host list -- this barely changes tick to tick, unlike free
 * RAM, so it's the right denominator for "how full is the system", not
 * "how much did we spend this tick" (see utilization comment in main()).
 */
function totalAllocatableRam(hosts) {
  return hosts.reduce((sum, h) => {
    const reserve = h.hostname === "home" ? HOME_RESERVE_GB : 0;
    return sum + Math.max(0, h.maxRam - reserve);
  }, 0);
}

/**
 * Samples fresh per-batch thread counts and durations for a prepped target.
 * GROW_BUFFER is applied to the grow thread count BEFORE growthAnalyzeSecurity
 * is called on it -- growth is exponential in threads, so buffering the
 * security-added value computed from the raw count would undersize weaken2.
 */
function sampleBatchFields(ns, target, hackFraction) {
  // Money-independent sizing: hackAnalyzeThreads(server, maxMoney * fraction)
  // returns -1 whenever the server currently holds less than that absolute
  // amount, which the old max(1, ceil(...)) guard silently collapsed to a
  // single thread -- a drained target would get a near-zero batch and, later,
  // a wildly under-reserved pipeline. Sizing off ns.hackAnalyze (money stolen
  // per thread, current-state) instead is strictly more correct too: hacking
  // fraction f of CURRENT money is exactly what the 1/(1-f) grow multiplier
  // below is built to restore.
  const hackPerThread = ns.hackAnalyze(target.server);
  if (hackPerThread <= 0) return null; // unhackable this tick -- shouldn't happen for an eligible target; avoids dividing into Infinity threads
  const hackThreads = Math.max(1, Math.ceil(hackFraction / hackPerThread));
  const hackSecurityAdded = ns.hackAnalyzeSecurity(hackThreads, target.server);

  const growMultiplier = 1 / (1 - hackFraction);
  const rawGrowThreads = ns.growthAnalyze(target.server, growMultiplier);
  const growThreads = Math.max(1, Math.ceil(rawGrowThreads * GROW_BUFFER));
  const growSecurityAdded = ns.growthAnalyzeSecurity(growThreads, target.server);

  const weakenPerThread = ns.weakenAnalyze(1);
  const weaken1Threads = Math.max(1, Math.ceil((hackSecurityAdded * WEAKEN_BUFFER) / weakenPerThread));
  const weaken2Threads = Math.max(1, Math.ceil((growSecurityAdded * WEAKEN_BUFFER) / weakenPerThread));

  return {
    server: target.server,
    hackThreads,
    growThreads,
    weaken1Threads,
    weaken2Threads,
    hackTime: ns.getHackTime(target.server),
    growTime: ns.getGrowTime(target.server),
    weakenTime: ns.getWeakenTime(target.server),
  };
}

/** Sums threads of a given script already running against a target, across all known hosts. */
function countInFlightThreads(ns, hosts, server, script) {
  let threads = 0;
  for (const host of hosts) {
    for (const proc of ns.ps(host.hostname)) {
      if (proc.filename === script && String(proc.args[0]) === server) threads += proc.threads;
    }
  }
  return threads;
}

/**
 * Samples live prep thread counts for a target that isn't prepped. Reuses
 * the CYCLE_MS-cached growTime/weakenTime from targets.js -- prep needs no
 * sub-second timing precision, unlike the batch path.
 *
 * Discounts whatever's already in flight against this target before sizing
 * this tick's request -- without this, a target that's still far from
 * prepped gets a fresh full-size weaken/grow request every tick on top of
 * whatever previous ticks already launched (which can take minutes to land),
 * quickly pinning RAM with redundant, stacked copies of the same job.
 * ns.ps can't tell a weaken.js process launched for the security-gap purpose
 * apart from one launched to counter a grow's security increase (same script,
 * same args), so in-flight weaken threads are credited to the gap first
 * (the more concrete, already-measured need), with any leftover credited to
 * the grow's counter-weaken.
 */
function samplePrepFields(ns, hosts, target) {
  const server = target.server;
  const currentSecurity = ns.getServerSecurityLevel(server);
  const currentMoney = ns.getServerMoneyAvailable(server);
  const weakenPerThread = ns.weakenAnalyze(1);

  const inFlightWeaken = countInFlightThreads(ns, hosts, server, WORKER_SCRIPTS.weaken);
  const inFlightGrow = countInFlightThreads(ns, hosts, server, WORKER_SCRIPTS.grow);

  const securityGap = Math.max(0, currentSecurity - target.minSecurityLevel);
  const rawWeakenThreadsForGap = securityGap > DRIFT_SEC_EPSILON ? Math.max(1, Math.ceil(securityGap / weakenPerThread)) : 0;
  const weakenThreadsForGap = Math.max(0, rawWeakenThreadsForGap - inFlightWeaken);

  const needsGrow = currentMoney < target.maxMoney * DRIFT_MONEY_FRACTION;
  let growThreads = 0;
  let weakenThreadsForGrow = 0;
  if (needsGrow) {
    // growthAnalyze ignores the $1/thread additive bonus grow() gets at very
    // low money (per docs), and a bare maxMoney/currentMoney blows up to
    // Infinity once a server's been emptied -- floor currentMoney at 1 so the
    // multiplier stays finite; the additive bonus covers the rest in practice.
    const safeCurrentMoney = Math.max(currentMoney, 1);
    const growMultiplier = target.maxMoney / safeCurrentMoney;
    const rawGrowThreads = Math.max(1, Math.ceil(ns.growthAnalyze(server, growMultiplier)));
    growThreads = Math.max(0, rawGrowThreads - inFlightGrow);

    if (growThreads > 0) {
      // Sized off the DISCOUNTED grow count -- this only needs to counter the
      // security this tick's new grow threads will add, not the in-flight
      // ones (those already got their own counter-weaken when they launched).
      const growSecurityAdded = ns.growthAnalyzeSecurity(growThreads, server);
      const leftoverInFlightWeaken = Math.max(0, inFlightWeaken - rawWeakenThreadsForGap);
      weakenThreadsForGrow = Math.max(0, Math.ceil(growSecurityAdded / weakenPerThread) - leftoverInFlightWeaken);
    }
  }

  return {
    server,
    growThreads,
    weakenThreadsForGap,
    weakenThreadsForGrow,
    growTime: target.growTime,
    weakenTime: target.weakenTime,
    currentSecurity,
    currentMoney,
  };
}

// Appends a timestamped line per successful launch to launchEvents. These
// feed into the persistent recentLaunches ring buffer (see main()) rather
// than being printed directly here -- a plain per-tick print would just get
// wiped the instant ns.clearLog() runs for the next tick's status block.
function launchJobs(ns, jobs, launchEvents) {
  let failed = 0;
  for (const job of jobs) {
    const pid = ns.exec(job.script, job.hostname, job.threads, job.target, job.additionalMsec);
    if (pid === 0) {
      failed++;
      continue;
    }
    const action = job.script.replace(".js", "");
    const timestamp = new Date().toLocaleTimeString();
    launchEvents.push(
      `${timestamp} ${action.padEnd(7)} ${String(job.threads).padStart(4)}t @ ${job.hostname} -> ${job.target} (+${job.additionalMsec}ms)`
    );
  }
  return failed;
}

/**
 * Total RAM (GB) currently occupied by worker-script processes targeting
 * `server`, across all known hosts -- the reserve's "already committed to
 * this pipeline" offset. Checking `ramCosts[proc.filename] !== undefined`
 * naturally restricts the sum to the three worker scripts (ramCosts' only
 * keys) without a separate WORKER_SCRIPTS membership check.
 */
function sumInFlightRam(ns, hosts, server, ramCosts) {
  let ram = 0;
  for (const host of hosts) {
    for (const proc of ns.ps(host.hostname)) {
      if (String(proc.args[0]) !== server) continue;
      const cost = ramCosts[proc.filename];
      if (cost !== undefined) ram += cost * proc.threads;
    }
  }
  return ram;
}

function countBatchesInFlight(ns, hosts, server) {
  let count = 0;
  for (const host of hosts) {
    for (const proc of ns.ps(host.hostname)) {
      // Each batch has exactly one hack.js job, so counting those is a
      // faithful proxy for "batches in flight" without a per-job ledger.
      if (proc.filename === WORKER_SCRIPTS.hack && String(proc.args[0]) === server) count++;
    }
  }
  return count;
}

function cleanupOldWorkerFiles(ns, hosts) {
  let removed = 0;
  for (const host of hosts) {
    for (const file of OLD_WORKER_FILES) {
      if (ns.rm(file, host.hostname)) removed++;
    }
  }
  return removed;
}

function liveTargetState(ns, target) {
  return {
    server: target.server,
    maxMoney: target.maxMoney,
    minSecurityLevel: target.minSecurityLevel,
    currentSecurity: ns.getServerSecurityLevel(target.server),
    currentMoney: ns.getServerMoneyAvailable(target.server),
  };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  // Pass our own pid so killscripts.js protects only *this* daemon.js
  // instance, not every process named daemon.js -- otherwise a stale
  // instance left running from a previous session would never get cleaned
  // up on restart, and would silently compete with the new one for RAM.
  await runAndWait(ns, "killscripts.js", ns.pid);
  await runAndWait(ns, "purchasescripts.js");
  // Companion dashboards: both read-only, never call ns.exec, so they have
  // zero effect on the worker-RAM pool this daemon competes for. Each opens
  // its own tail window itself via ns.ui.openTail().
  launchDetached(ns, "targetsmonitor.js");
  launchDetached(ns, "moneymonitor.js");

  let hosts = [];
  let targets = [];
  let ramCosts = {};
  let previousTargetNames = new Set();
  let totalBatchesSkipped = 0;
  let totalBatchesShrunk = 0; // full-fraction misses that launched anyway at a smaller fraction (bootstrap-only, per shrink gating)
  let batchSequence = 0;
  let lastBatch = null; // most recently launched batch's landing schedule, for progress logging
  let incumbentServer = null; // current batch target, sticky across ticks per RANK_HYSTERESIS
  let previousTargetServer = null; // which server previousMoney/previousSecurity belong to
  let previousMoney = null;
  let previousSecurity = null;
  let recentLaunches = []; // ring buffer of timestamped launch lines, persists across ticks

  async function refreshCycle() {
    hosts = getHosts(ns);
    targets = getTargets(ns);

    for (const host of hosts) {
      if (host.hostname === "home") continue;
      ns.scp([WORKER_SCRIPTS.hack, WORKER_SCRIPTS.grow, WORKER_SCRIPTS.weaken], host.hostname);
    }

    ramCosts = {
      [WORKER_SCRIPTS.hack]: ns.getScriptRam(WORKER_SCRIPTS.hack, "home"),
      [WORKER_SCRIPTS.grow]: ns.getScriptRam(WORKER_SCRIPTS.grow, "home"),
      [WORKER_SCRIPTS.weaken]: ns.getScriptRam(WORKER_SCRIPTS.weaken, "home"),
    };

    const currentTargetNames = new Set(targets.map((t) => t.server));
    for (const name of currentTargetNames) {
      if (!previousTargetNames.has(name)) tprintTs(ns, `INFO: new target ${name}`);
    }
    for (const name of previousTargetNames) {
      if (!currentTargetNames.has(name)) tprintTs(ns, `INFO: dropped target ${name}`);
    }
    previousTargetNames = currentTargetNames;
  }

  await refreshCycle();

  const removedCount = cleanupOldWorkerFiles(ns, hosts);
  if (removedCount > 0) tprintTs(ns, `INFO: removed ${removedCount} leftover Phase 1 worker file(s) from hosts`);

  let lastCycleTime = Date.now();

  while (true) {
    if (Date.now() - lastCycleTime >= CYCLE_MS) {
      await refreshCycle();
      lastCycleTime = Date.now();
    }

    if (targets.length === 0) {
      ns.clearLog();
      ns.print(`===== daemon @ ${new Date().toLocaleTimeString()} =====`);
      ns.print("No eligible targets.");
      await ns.sleep(BATCH_INTERVAL_MS);
      continue;
    }

    let liveHosts = refreshFreeRam(ns, hosts);
    // Fixed capacity, not "free RAM right now" -- the latter already excludes
    // whatever earlier ticks' still-in-flight batches are using, so comparing
    // this tick's fresh spend against it would understate utilization almost
    // always (one batch's RAM is small next to a large pre-existing free
    // pool). Comparing against total capacity instead reflects everything
    // currently in flight, old and new.
    const totalMaxRam = totalAllocatableRam(hosts);

    const batchTarget = pickBatchTarget(targets, incumbentServer, RANK_HYSTERESIS);
    incumbentServer = batchTarget.server;
    const liveBatchState = liveTargetState(ns, batchTarget);
    const prepped = isPrepped(liveBatchState);

    // "Was a batch already flying before this tick touched anything" -- the
    // shrink-gating rule below needs the state as of the *start* of the
    // tick, not after this tick's own launch.
    const batchesInFlightBeforeTick = countBatchesInFlight(ns, hosts, batchTarget.server);

    // Cost basis + pipeline depth, sampled fresh every tick regardless of
    // whether this tick's own launch attempt succeeds, shrinks, skips, or
    // isn't even attempted (drift) -- fullBatchRamCost must always reflect a
    // full-HACK_FRACTION batch so a runt launch below doesn't quietly shrink
    // the protected reserve. Sampling while security is elevated (mid
    // re-prep) overestimates hack threads and therefore the reserve -- the
    // safe direction, since over-reserving during re-prep protects the
    // pipeline that's about to restart. weakenTime for the depth comes from
    // this same fresh sample, not targets.js's CYCLE_MS-stale copy.
    const fullBatchSample = sampleBatchFields(ns, batchTarget, HACK_FRACTION);
    const fullBatchJobs = fullBatchSample ? planBatch(fullBatchSample) : [];
    const fullBatchRamCost = fullBatchSample ? batchRamCost(fullBatchJobs, ramCosts) : 0;
    const depth = fullBatchSample ? pipelineDepth(fullBatchSample.weakenTime) : 0;

    let failedLaunches = 0;
    let batchSkippedThisTick = false;
    let batchSkipSaturated = false; // true when the skip is expected saturation (batches already in flight), not real trouble
    let batchTargetPrepStatus = null;
    const launchEvents = [];

    if (prepped) {
      let fraction = HACK_FRACTION;
      let assigned = null;
      let winningRates = null;
      // Shrink gating: only bootstrap (shrink the fraction) when the
      // pipeline is empty. With batches already in flight, a full-fraction
      // miss is a skip, not a shrink -- ungated, the retry loop would pump
      // runts into RAM-poor scraps, and those runt slots self-perpetuate
      // (a tick where a runt lands frees only runt-sized RAM) until the
      // launch-size pattern locks in at period weakenTime.
      const allowShrink = batchesInFlightBeforeTick === 0;
      while (fraction >= MIN_HACK_FRACTION) {
        const rates = fraction === HACK_FRACTION ? fullBatchSample : sampleBatchFields(ns, batchTarget, fraction);
        if (rates === null) break; // unusable sample (see sampleBatchFields) -- nothing sane to plan this tick
        const jobs = fraction === HACK_FRACTION ? fullBatchJobs : planBatch(rates);
        assigned = assignBatchHosts(jobs, liveHosts, ramCosts);
        if (assigned) {
          winningRates = rates;
          break;
        }
        if (!allowShrink) {
          assigned = null;
          break;
        }
        fraction = shrinkHackFraction(fraction);
      }

      if (assigned) {
        if (fraction < HACK_FRACTION) totalBatchesShrunk++;
        failedLaunches += launchJobs(ns, assigned, launchEvents);
        for (const job of assigned) {
          const host = liveHosts.find((h) => h.hostname === job.hostname);
          if (host) host.freeRam -= ramCosts[job.script] * job.threads;
        }

        // Record this batch's landing schedule for the progress log below.
        // assignBatchHosts preserves planBatch's job order (hack, weaken1,
        // grow, weaken2), so zipping against the matching durations here is
        // safe -- landsAt = launch + additionalMsec + the job's own duration,
        // per the batch timing mechanism (each job completes at that sum).
        const launchedAt = Date.now();
        const actionDurations = [
          ["hack", winningRates.hackTime],
          ["weaken1", winningRates.weakenTime],
          ["grow", winningRates.growTime],
          ["weaken2", winningRates.weakenTime],
        ];
        batchSequence++;
        lastBatch = {
          id: batchSequence,
          server: batchTarget.server,
          launchedAt,
          hackFraction: fraction,
          hackChance: ns.hackAnalyzeChance(batchTarget.server),
          expectedSteal: batchTarget.maxMoney * fraction,
          landings: assigned.map((job, i) => ({
            action: actionDurations[i][0],
            threads: job.threads,
            hostname: job.hostname,
            landsAt: launchedAt + job.additionalMsec + actionDurations[i][1],
          })),
        };
      } else {
        totalBatchesSkipped++;
        batchSkippedThisTick = true;
        // If batches were already in flight, this is expected saturation
        // (the pipeline's full and waiting on a landing), not real trouble --
        // shrink gating deliberately let it fall through to a skip instead of
        // pumping a runt into the scraps.
        batchSkipSaturated = !allowShrink;
      }
    } else {
      const prepFields = samplePrepFields(ns, hosts, batchTarget);
      const { jobs, hosts: remaining, schedule } = planPrep(prepFields, liveHosts, ramCosts);
      failedLaunches += launchJobs(ns, jobs, launchEvents);
      liveHosts = remaining;

      // schedule (from planPrep) already distinguishes requested vs. actually
      // launched threads per sub-job -- planPrep silently short-changes
      // threads when RAM runs out (that's how "capped by available RAM" is
      // satisfied), so without this there's no way to tell "genuinely still
      // far from prepped" apart from "prep is RAM-starved and barely
      // dispatching anything." landsAt mirrors the batch landing math: each
      // sub-job completes at launch + additionalMsec + its own duration.
      const launchedAt = Date.now();
      batchTargetPrepStatus = {
        launchedThreads: schedule.reduce((sum, s) => sum + s.launchedThreads, 0),
        requestedThreads: schedule.reduce((sum, s) => sum + s.requestedThreads, 0),
        landings: schedule.map((s) => ({
          action: s.action,
          requestedThreads: s.requestedThreads,
          launchedThreads: s.launchedThreads,
          landsAt: launchedAt + s.additionalMsec + s.duration,
        })),
      };
    }

    // Reserve enough RAM to keep the top target's pipeline full, carved out
    // of the largest hosts first (the only places a batch's grow job can
    // land), before the lower-target loop sees anything. Measured AFTER
    // stage 1's launch above so just-launched jobs are counted -- during a
    // drift this also includes stage 1's own prep jobs against the batch
    // target, which is deliberate: that RAM is already committed to the same
    // pipeline's restart (and the elevated-security cost basis above, which
    // overestimates, pushes the reserve the other way).
    const inFlightTopTargetRam = sumInFlightRam(ns, hosts, batchTarget.server, ramCosts);
    const pipelineCost = depth * fullBatchRamCost;
    const reserveGb = Math.max(0, pipelineCost - inFlightTopTargetRam);

    const preWaterfallTotal = liveHosts.reduce((sum, h) => sum + h.freeRam, 0);
    const carvedPool = carveReservation(liveHosts, reserveGb);
    const waterfallAvailableGb = carvedPool.reduce((sum, h) => sum + h.freeRam, 0);

    // Spend leftover (unreserved) RAM prepping lower-ranked targets so
    // they're ready if rankings shift, chaining the shrinking pool across
    // targets. Filtered by server rather than targets.slice(1): with
    // hysteresis the incumbent may not be targets[0], and slice(1) would
    // then double-prep the incumbent (still present at its rank) while
    // never touching the true top-ranked target.
    const lowerTargets = targets.filter((t) => t.server !== batchTarget.server);
    let waterfallPool = carvedPool;
    for (const target of lowerTargets) {
      if (waterfallPool.length === 0 || waterfallPool.every((h) => h.freeRam <= 0)) break;
      if (isPrepped(liveTargetState(ns, target))) continue;
      const prepFields = samplePrepFields(ns, hosts, target);
      const { jobs, hosts: remaining } = planPrep(prepFields, waterfallPool, ramCosts);
      failedLaunches += launchJobs(ns, jobs, launchEvents);
      waterfallPool = remaining;
    }
    const spentByWaterfall = waterfallAvailableGb - waterfallPool.reduce((sum, h) => sum + h.freeRam, 0);

    // Merge this tick's launches into the persistent ring buffer -- printed
    // below the status snapshot, this is what keeps launch events visible
    // for a while instead of vanishing the instant the next tick redraws.
    recentLaunches.push(...launchEvents);
    if (recentLaunches.length > MAX_LAUNCH_HISTORY) {
      recentLaunches.splice(0, recentLaunches.length - MAX_LAUNCH_HISTORY);
    }

    // preWaterfallTotal minus what the waterfall loop actually spent --
    // reserved-but-unspent RAM is still genuinely free right now, just
    // earmarked, so it counts toward "remaining" the same as anything else.
    const totalRemaining = preWaterfallTotal - spentByWaterfall;
    const utilization = totalMaxRam > 0 ? ((totalMaxRam - totalRemaining) / totalMaxRam) * 100 : 0;
    const batchesInFlight = countBatchesInFlight(ns, hosts, batchTarget.server);
    const commitmentPct = pipelineCost > 0 ? (inFlightTopTargetRam / pipelineCost) * 100 : 0;

    ns.clearLog();
    ns.print(`===== daemon @ ${new Date().toLocaleTimeString()} =====`);
    ns.print(`hosts: ${hosts.length} | targets: ${targets.length} | RAM utilization: ${utilization.toFixed(1)}%`);
    ns.print(
      `batch target: ${batchTarget.server} | ${prepped ? "PREPPED" : "DRIFTED"} | ` +
        `batches in flight: ${batchesInFlight} | batches skipped (total): ${totalBatchesSkipped} | ` +
        `shrunk (total): ${totalBatchesShrunk}`
    );
    ns.print(
      `  pipeline: depth ${depth} | reserve ${ns.format.ram(reserveGb)} | commitment ${commitmentPct.toFixed(1)}% | ` +
        `waterfall: ${ns.format.ram(waterfallAvailableGb)} free`
    );

    // previousMoney/previousSecurity are only meaningful when they were
    // sampled from this same server -- a target-selection flip (ranking
    // change, hysteresis override) would otherwise diff two unrelated
    // servers' numbers and print a meaningless spike on the first tick.
    if (previousTargetServer !== batchTarget.server) {
      previousMoney = null;
      previousSecurity = null;
      previousTargetServer = batchTarget.server;
    }
    const moneyDelta = previousMoney === null ? 0 : liveBatchState.currentMoney - previousMoney;
    const securityDelta = previousSecurity === null ? 0 : liveBatchState.currentSecurity - previousSecurity;
    previousMoney = liveBatchState.currentMoney;
    previousSecurity = liveBatchState.currentSecurity;
    ns.print(
      `  sec ${liveBatchState.currentSecurity.toFixed(2)}/${batchTarget.minSecurityLevel} (Δ${securityDelta >= 0 ? "+" : ""}${securityDelta.toFixed(2)}) | ` +
        `money ${ns.format.number(liveBatchState.currentMoney)}/${ns.format.number(batchTarget.maxMoney)} ` +
        `(Δ${moneyDelta >= 0 ? "+" : ""}${ns.format.number(moneyDelta)})`
    );
    ns.print(
      `  durations: hack ${ns.format.time(batchTarget.hackTime)} | grow ${ns.format.time(batchTarget.growTime)} | ` +
        `weaken ${ns.format.time(batchTarget.weakenTime)}`
    );

    // Prep progress: what we asked for this tick vs. what actually got RAM
    // (planPrep silently shrinks threads when RAM runs out), so a target
    // that looks "stuck" is distinguishable from one that's just RAM-starved.
    // Each sub-job's landsAt is when it'll actually finish and move the
    // needle on security/money above -- same landing math as batches.
    if (batchTargetPrepStatus) {
      const now = Date.now();
      const capped = batchTargetPrepStatus.launchedThreads < batchTargetPrepStatus.requestedThreads ? " -- RAM-LIMITED" : "";
      ns.print(
        `  prep dispatched: ${batchTargetPrepStatus.launchedThreads}/${batchTargetPrepStatus.requestedThreads} threads${capped}`
      );
      for (const landing of batchTargetPrepStatus.landings) {
        if (landing.launchedThreads === 0) {
          ns.print(`    ${landing.action.padEnd(7)} 0/${landing.requestedThreads}t | not dispatched (no RAM)`);
          continue;
        }
        const remainingMs = landing.landsAt - now;
        const status = remainingMs <= 0 ? "LANDED" : `in ${(remainingMs / 1000).toFixed(1)}s`;
        ns.print(
          `    ${landing.action.padEnd(7)} ${landing.launchedThreads}/${landing.requestedThreads}t | ` +
            `lands ${new Date(landing.landsAt).toLocaleTimeString()} (${status})`
        );
      }
    }

    // Progress/timing indication: the landing schedule of the most recently
    // launched batch (the schedule this daemon actually built via
    // additionalMsec, not an observation of a running process). Ledger
    // tracking of every in-flight batch is out of scope for this phase, so
    // this only ever reflects the single latest launch, not the full queue.
    if (lastBatch) {
      const now = Date.now();
      ns.print(
        `  batch #${lastBatch.id} on ${lastBatch.server} @ ${new Date(lastBatch.launchedAt).toLocaleTimeString()} | ` +
          `hack fraction ${(lastBatch.hackFraction * 100).toFixed(1)}% | hack chance ${(lastBatch.hackChance * 100).toFixed(0)}% | ` +
          `expected steal ~$${ns.format.number(lastBatch.expectedSteal)}`
      );
      for (const landing of lastBatch.landings) {
        const remainingMs = landing.landsAt - now;
        const status = remainingMs <= 0 ? "LANDED" : `in ${(remainingMs / 1000).toFixed(1)}s`;
        const marker = landing.action === "hack" ? "  <- steals cash" : "";
        ns.print(
          `    ${landing.action.padEnd(7)} ${String(landing.threads).padStart(4)}t @ ${landing.hostname} | ` +
            `lands ${new Date(landing.landsAt).toLocaleTimeString()} (${status})${marker}`
        );
      }
    }

    if (batchSkippedThisTick) {
      // Saturated skip (batches already in flight, full-fraction just didn't
      // fit) is the expected RAM-poor rhythm, not a failure -- shrink gating
      // exists specifically so this reads as a clean skip instead of a runt
      // launch. A skip with an EMPTY pipeline is the real signal to watch.
      ns.print(
        batchSkipSaturated
          ? "INFO: batch skipped this tick -- pipeline saturated, waiting on a landing"
          : "WARN: batch skipped this tick -- insufficient RAM even at MIN_HACK_FRACTION (empty pipeline)"
      );
    }
    if (failedLaunches > 0) ns.print(`WARN: ${failedLaunches} launch(es) failed (exec returned pid 0)`);

    ns.print(`--- recent launches (newest first, last ${recentLaunches.length}/${MAX_LAUNCH_HISTORY}) ---`);
    if (recentLaunches.length === 0) {
      ns.print("  (none yet)");
    } else {
      for (let i = recentLaunches.length - 1; i >= 0; i--) ns.print(`  ${recentLaunches[i]}`);
    }

    await ns.sleep(BATCH_INTERVAL_MS);
  }
}
