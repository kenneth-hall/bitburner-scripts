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
import { sampleBatchFields, samplePrepFields, hasFormulas, isForcedLegacy, crossCheckFormulas } from "./sampling.js";
import { recordEvent } from "./eventlog.js";

const CYCLE_MS = 10000;

// Exported so it can be pulled down via viteburner's download feature
// (press "d" in the dev terminal, or automatically every 5 minutes -- see
// vite.config.ts) for offline review -- 0 GB RAM cost (ns.write), rewritten
// as a bounded ring buffer so the file doesn't grow unbounded over a long
// session. Every record carries an `event` field ("batch" | "skip" | "flip" |
// "mode" | "xcheck") -- the cap means "last 1000 events", not "last 1000
// batches", so anything reading the log must filter by `event`. Ordering is
// defined on `timestamp` for most events, but `firstTimestamp` for coalesced
// skips -- an in-place-updated skip's `lastTimestamp` can legitimately exceed
// the `timestamp` of records appended after it.
const DAEMON_LOG_FILE = "daemon-batch-log.json";
const DAEMON_LOG_MAX_ENTRIES = 1000;
const LOG_FLUSH_INTERVAL_MS = 10000; // lazy-flush cadence for coalesced skip updates

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

// Companions daemon.js launches via launchDetached below, retried every
// CYCLE_MS refresh until each one succeeds once (see companionLaunched in
// main()) -- post-reset home RAM is smallest exactly when a companion like
// backdoorfactions.js matters most, so a single startup attempt could miss
// it by days. Applied uniformly to all four: the two pre-existing monitors
// get the same retry as a small behavior improvement (a RAM-skipped monitor
// now eventually launches), not just the two new companions.
const COMPANION_SCRIPTS = ["targetsmonitor.js", "transactionsmonitor.js", "factionwatcher.js", "backdoorfactions.js"];

/**
 * Fire-and-forget launch for a long-running companion script that opens its
 * own tail window and never exits -- unlike runAndWait's one-shot utilities,
 * there's nothing to wait for here. Returns true iff exec returned a nonzero
 * pid. `announceSkip` is false for retry attempts so a companion that keeps
 * not fitting doesn't spam the same INFO message every CYCLE_MS -- the
 * one-time startup message already said it's waiting.
 */
function launchDetached(ns, script, { announceSkip = true } = {}) {
  const scriptRam = ns.getScriptRam(script, "home");
  const freeRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  if (scriptRam > freeRam) {
    if (announceSkip) {
      tprintTs(
        ns,
        `INFO: skipped ${script} at startup -- needs ${ns.format.ram(scriptRam)} but only ${ns.format.ram(freeRam)} free on home`
      );
    }
    return false;
  }

  const pid = ns.exec(script, "home", 1);
  if (pid === 0) {
    tprintTs(ns, `ERROR: failed to start ${script}`);
    return false;
  }
  return true;
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

// launchmonitor.js watches ns.ps() across all hosts and reports new worker
// processes independently, so this only needs to launch and count failures --
// it doesn't build its own launch-event log anymore.
function launchJobs(ns, jobs) {
  let failed = 0;
  for (const job of jobs) {
    const pid = ns.exec(job.script, job.hostname, job.threads, job.target, job.additionalMsec);
    if (pid === 0) failed++;
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

/**
 * Dry-run version of stage 1's own retry loop: tries HACK_FRACTION, shrinking
 * down to MIN_HACK_FRACTION, against a given host pool, but never launches
 * anything -- purely for the tail window's "what would a batch against this
 * target look like right now" display. Returns null if nothing fits even at
 * MIN_HACK_FRACTION (no bandwidth for this target at all). Shrink gating
 * (the empty-pipeline rule) doesn't apply here -- there's no real pipeline
 * to protect for a target that isn't actually running batches.
 */
function planSpeculativeBatch(ns, target, pool, ramCosts, useFormulas) {
  let fraction = HACK_FRACTION;
  while (fraction >= MIN_HACK_FRACTION) {
    const rates = sampleBatchFields(ns, target, fraction, useFormulas);
    if (rates === null) return null; // unhackable this tick
    const jobs = planBatch(rates);
    const assigned = assignBatchHosts(jobs, pool, ramCosts);
    if (assigned) return { rates, assigned, fraction };
    fraction = shrinkHackFraction(fraction);
  }
  return null;
}

const JOB_LABELS = { hack: "H", weaken1: "W1", grow: "G", weaken2: "W2" };

/**
 * Collapses a batch's four per-job landings (action, threads, hostname,
 * landsAt) into two lines instead of four -- paired by which weaken counters
 * which action (weaken1 cancels hack's security bump, weaken2 cancels
 * grow's), rather than one line per job repeating near-identical landing
 * times (they're already timed to land within SPACING_MS of each other).
 * Returns both lines plus the latest landsAt across all four, for a single
 * trailing landing reference.
 */
function formatCompactBatchLines(landings) {
  const byAction = Object.fromEntries(landings.map((l) => [l.action, l]));
  const segment = (l) => `${JOB_LABELS[l.action].padEnd(2)} ${String(l.threads).padStart(4)}t@${l.hostname}`;
  const line1 = `${segment(byAction.hack)} | ${segment(byAction.weaken1)}`;
  const line2 = `${segment(byAction.grow)} | ${segment(byAction.weaken2)}`;
  const lastLandsAt = Math.max(...landings.map((l) => l.landsAt));
  return { line1, line2, lastLandsAt };
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

/** Rewrites DAEMON_LOG_FILE in full ("w" mode) from the in-memory buffer. */
function flushDaemonLog(ns, entries) {
  ns.write(DAEMON_LOG_FILE, JSON.stringify(entries, null, 2), "w");
}

/**
 * Appends one event to the in-memory log buffer and flushes immediately --
 * used for every event type except coalesced skips (see recordSkipEvent),
 * which mutate in place and flush lazily instead. Mutates and returns
 * `entries` for reassignment at the call site (trimming replaces the array
 * reference).
 */
function appendLogEvent(ns, entries, record) {
  entries.push(record);
  if (entries.length > DAEMON_LOG_MAX_ENTRIES) {
    entries.splice(0, entries.length - DAEMON_LOG_MAX_ENTRIES);
  }
  flushDaemonLog(ns, entries);
  return entries;
}

/**
 * Records a skip tick, coalescing consecutive skips with the same target and
 * saturated/empty classification into one record (count, firstTimestamp,
 * lastTimestamp) instead of appending -- a long saturation stretch at
 * BATCH_INTERVAL_MS cadence would otherwise evict hundreds of batch records
 * from the ring buffer. Never flushes itself -- returns `appended` so the
 * caller can flush immediately for a fresh record, or defer to the lazy
 * ~10s timer for an in-place update (mutates the in-memory array only).
 */
function recordSkipEvent(entries, record) {
  const last = entries[entries.length - 1];
  if (last && last.event === "skip" && last.batchTarget === record.batchTarget && last.saturated === record.saturated) {
    last.count += 1;
    last.lastTimestamp = record.timestamp;
    last.time = record.time;
    last.batchesInFlight = record.batchesInFlight;
    last.pipeline = record.pipeline;
    last.utilizationPct = record.utilizationPct;
    return { entries, appended: false };
  }

  entries.push({
    event: "skip",
    time: record.time,
    firstTimestamp: record.timestamp,
    lastTimestamp: record.timestamp,
    count: 1,
    batchTarget: record.batchTarget,
    saturated: record.saturated,
    batchesInFlight: record.batchesInFlight,
    pipeline: record.pipeline,
    utilizationPct: record.utilizationPct,
  });
  if (entries.length > DAEMON_LOG_MAX_ENTRIES) {
    entries.splice(0, entries.length - DAEMON_LOG_MAX_ENTRIES);
  }
  return { entries, appended: true };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  // Every manual `run daemon.js` from the terminal is itself a milestone
  // worth a permanent record -- restarts/crashes are exactly the downtime
  // gaps the other companions' startup reconciliation has to account for,
  // so having them logged here makes those gaps visible after the fact.
  recordEvent(ns, { type: "daemon-started" });

  // Pass our own pid so killscripts.js protects only *this* daemon.js
  // instance, not every process named daemon.js -- otherwise a stale
  // instance left running from a previous session would never get cleaned
  // up on restart, and would silently compete with the new one for RAM.
  await runAndWait(ns, "killscripts.js", ns.pid);
  // Companions: none of the four calls ns.exec, so they have zero effect on
  // the worker-RAM pool this daemon competes for. targetsmonitor.js is
  // read-only; transactionsmonitor.js writes the day's transactions log
  // (src/translog.js) as income lands; factionwatcher.js writes the
  // persistent events log as factions are joined; backdoorfactions.js
  // installs backdoors and writes backdoor-installed events, then exits once
  // its targets are done. Each opens its own tail window (or, for
  // factionwatcher.js, deliberately doesn't -- see its header) via
  // ns.ui.openTail(). Any not yet successfully launched here is retried
  // every CYCLE_MS inside refreshCycle() below -- see companionLaunched.
  const companionLaunched = new Map(COMPANION_SCRIPTS.map((script) => [script, launchDetached(ns, script)]));

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
  let logEntries = []; // in-memory mirror of DAEMON_LOG_FILE's bounded ring buffer
  let lastLazyFlush = Date.now(); // last time a coalesced skip update was flushed to disk
  let previousCommitmentPct = 0; // incumbent's commitment as of its last active tick -- the flip log's "abandoned" figure, since a flip tick never recomputes cost basis for the outgoing target
  let useFormulas = false;
  let forcedLegacy = false;
  let previousMathMode = null; // null until the first refreshCycle, so startup also announces its mode once

  async function refreshCycle() {
    // Retry any companion that hasn't launched yet -- silent (no repeated
    // INFO-skip spam; the startup attempt already announced it's waiting),
    // announcing only the eventual success. Stops retrying that script the
    // moment it launches once; if it later exits on its own (e.g.
    // backdoorfactions.js finishing), it's deliberately not relaunched until
    // the next daemon restart.
    for (const script of COMPANION_SCRIPTS) {
      if (companionLaunched.get(script)) continue;
      if (launchDetached(ns, script, { announceSkip: false })) {
        companionLaunched.set(script, true);
        tprintTs(ns, `INFO: ${script} launched (retry)`);
      }
    }

    hosts = getHosts(ns);
    targets = getTargets(ns);

    // Re-checked every CYCLE_MS (decided): a mid-run Formulas.exe purchase
    // upgrades the math within one refresh, no restart; after a reset the
    // check silently falls back to legacy. Nothing to remember across resets.
    useFormulas = hasFormulas(ns);
    forcedLegacy = isForcedLegacy(ns);
    if (useFormulas !== previousMathMode) {
      tprintTs(ns, `INFO: math mode ${useFormulas ? "formulas" : forcedLegacy ? "legacy (forced)" : "legacy"}`);
      previousMathMode = useFormulas;
      // Also fires on the very first refreshCycle (previousMathMode starts
      // null), so every log file states its mode from the first record and
      // is self-describing -- the log checker validates against this
      // recorded config, not whatever the source tree says today.
      logEntries = appendLogEvent(ns, logEntries, {
        event: "mode",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        formulas: useFormulas,
        forcedLegacy,
        config: { HACK_FRACTION, GROW_BUFFER, WEAKEN_BUFFER, DRIFT_SEC_EPSILON, DRIFT_MONEY_FRACTION, RANK_HYSTERESIS, BATCH_INTERVAL_MS },
      });
    }

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

    // Runtime canary, once per CYCLE_MS: compares formulas math against
    // legacy at the *current* state (not prepped -- both branches only agree
    // there if the target happens to be exactly at min/max) for whichever
    // server is the active batch target. Skipped in legacy mode (nothing to
    // cross-check) and on the very first refresh (no incumbent yet).
    if (useFormulas && incumbentServer !== null) {
      const crossCheckTarget = targets.find((t) => t.server === incumbentServer);
      if (crossCheckTarget) {
        const mismatches = crossCheckFormulas(ns, crossCheckTarget);
        for (const mismatch of mismatches) {
          tprintTs(
            ns,
            `WARN: xcheck mismatch on ${crossCheckTarget.server} (${mismatch.field}${mismatch.soft ? ", soft" : ""}): ` +
              `legacy=${mismatch.legacy} formulas=${mismatch.formulas}`
          );
          logEntries = appendLogEvent(ns, logEntries, {
            event: "xcheck",
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now(),
            target: crossCheckTarget.server,
            field: mismatch.field,
            legacy: mismatch.legacy,
            formulas: mismatch.formulas,
            soft: mismatch.soft,
          });
        }
      }
    }
  }

  await refreshCycle();

  const removedCount = cleanupOldWorkerFiles(ns, hosts);
  if (removedCount > 0) tprintTs(ns, `INFO: removed ${removedCount} leftover Phase 1 worker file(s) from hosts`);

  let lastCycleTime = Date.now();

  while (true) {
    // Guard against the fleetupgrade.js rename window, airtight not
    // best-effort: fleetupgrade.js contains no await, so it runs atomically
    // between daemon ticks -- every rename lands while the daemon sleeps --
    // and there are no awaits between this guard and the per-host calls
    // below, so no try/catch is needed either. Checked every tick (not just
    // on the CYCLE_MS cadence) because renames can land mid-cycle: while a
    // renamed host is missing from `hosts`, its workers are invisible to
    // countBatchesInFlight/sumInFlightRam, so batchesInFlightBeforeTick can
    // read 0 with a full pipeline in flight -- reopening the shrink gate and
    // letting a runt launch mid-pipeline, the exact ratchet Phase 3 closed.
    // An immediate refreshCycle() (not waiting out CYCLE_MS) closes that
    // window within the tick that detects it.
    const vanishedHostnames = hosts.filter((h) => !ns.serverExists(h.hostname)).map((h) => h.hostname);
    if (vanishedHostnames.length > 0) {
      for (const hostname of vanishedHostnames) {
        tprintTs(ns, `INFO: host ${hostname} no longer exists (renamed mid-cycle?) -- refreshing immediately`);
      }
      hosts = hosts.filter((h) => !vanishedHostnames.includes(h.hostname));
      await refreshCycle();
      lastCycleTime = Date.now();
    } else if (Date.now() - lastCycleTime >= CYCLE_MS) {
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

    // Scored at its prepped state, a fresh unlock can clear RANK_HYSTERESIS
    // while still stone-cold in formulas mode -- gate the flip on the
    // challenger actually being prepped, sampled only when there's a real
    // challenge to check (targets[0] isn't already the incumbent). Legacy
    // mode passes true unconditionally, preserving today's behavior exactly:
    // legacy's current-state scoring already only lets a challenger through
    // once the waterfall has warmed it up.
    let challengerPrepped = true;
    if (useFormulas && incumbentServer !== null && targets[0].server !== incumbentServer) {
      challengerPrepped = isPrepped(liveTargetState(ns, targets[0]));
    }
    const previousIncumbentServer = incumbentServer;
    const batchTarget = pickBatchTarget(targets, incumbentServer, RANK_HYSTERESIS, challengerPrepped);
    incumbentServer = batchTarget.server;

    // Flip detection: previousIncumbentServer !== null excludes the very
    // first tick's initial pick (not a flip, nothing was abandoned). The
    // outgoing target's cost basis is never recomputed this tick (stage 1
    // below only sizes the NEW batchTarget) -- previousCommitmentPct is
    // last tick's already-computed figure for whatever was batchTarget then,
    // which by construction is exactly this tick's outgoing incumbent.
    if (previousIncumbentServer !== null && batchTarget.server !== previousIncumbentServer) {
      const fromTarget = targets.find((t) => t.server === previousIncumbentServer);
      const toTarget = targets.find((t) => t.server === batchTarget.server);
      tprintTs(
        ns,
        `INFO: target flip ${previousIncumbentServer} -> ${batchTarget.server} ` +
          `(abandoned ${previousCommitmentPct.toFixed(1)}% commitment)`
      );
      logEntries = appendLogEvent(ns, logEntries, {
        event: "flip",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        from: previousIncumbentServer,
        to: batchTarget.server,
        fromScore: fromTarget ? fromTarget.score : null,
        toScore: toTarget ? toTarget.score : null,
        commitmentPct: previousCommitmentPct,
      });
    }

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
    // the protected reserve. In legacy mode, sampling while security is
    // elevated (mid re-prep) overestimates hack threads and therefore the
    // reserve -- the safe direction, since over-reserving during re-prep
    // protects the pipeline that's about to restart. In formulas mode the
    // cost basis is exact at the prepped state regardless of current drift,
    // so this overestimate doesn't apply. steadyWeakenTime (not weakenTime)
    // feeds depth -- it's the cost-basis duration, not real job timing, not
    // targets.js's CYCLE_MS-stale copy.
    const fullBatchSample = sampleBatchFields(ns, batchTarget, HACK_FRACTION, useFormulas);
    const fullBatchJobs = fullBatchSample ? planBatch(fullBatchSample) : [];
    const fullBatchRamCost = fullBatchSample ? batchRamCost(fullBatchJobs, ramCosts) : 0;
    const depth = fullBatchSample ? pipelineDepth(fullBatchSample.steadyWeakenTime) : 0;

    let failedLaunches = 0;
    let batchSkippedThisTick = false;
    let batchSkipSaturated = false; // true when the skip is expected saturation (batches already in flight), not real trouble
    let batchTargetPrepStatus = null;
    let batchLaunchedThisTick = null; // distinct from lastBatch, which persists stale across ticks where nothing launched

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
        const rates = fraction === HACK_FRACTION ? fullBatchSample : sampleBatchFields(ns, batchTarget, fraction, useFormulas);
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
        failedLaunches += launchJobs(ns, assigned);
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
        batchLaunchedThisTick = lastBatch;
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
      const prepFields = samplePrepFields(ns, hosts, batchTarget, useFormulas);
      const { jobs, hosts: remaining, schedule } = planPrep(prepFields, liveHosts, ramCosts);
      failedLaunches += launchJobs(ns, jobs);
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
      const prepFields = samplePrepFields(ns, hosts, target, useFormulas);
      const { jobs, hosts: remaining } = planPrep(prepFields, waterfallPool, ramCosts);
      failedLaunches += launchJobs(ns, jobs);
      waterfallPool = remaining;
    }
    const spentByWaterfall = waterfallAvailableGb - waterfallPool.reduce((sum, h) => sum + h.freeRam, 0);

    // preWaterfallTotal minus what the waterfall loop actually spent --
    // reserved-but-unspent RAM is still genuinely free right now, just
    // earmarked, so it counts toward "remaining" the same as anything else.
    const totalRemaining = preWaterfallTotal - spentByWaterfall;
    const utilization = totalMaxRam > 0 ? ((totalMaxRam - totalRemaining) / totalMaxRam) * 100 : 0;
    const batchesInFlight = countBatchesInFlight(ns, hosts, batchTarget.server);
    const commitmentPct = pipelineCost > 0 ? (inFlightTopTargetRam / pipelineCost) * 100 : 0;
    // Cached for the NEXT tick's flip detection -- if batchTarget changes
    // then, this tick's figure is the only record of what the (about to be
    // abandoned) incumbent's commitment was.
    previousCommitmentPct = commitmentPct;

    ns.clearLog();
    ns.print(`===== daemon @ ${new Date().toLocaleTimeString()} =====`);
    const mathLabel = useFormulas ? "formulas" : forcedLegacy ? "legacy (forced)" : "legacy";
    ns.print(
      `hosts: ${hosts.length} | targets: ${targets.length} | RAM utilization: ${utilization.toFixed(1)}% | math: ${mathLabel}`
    );
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

    // While drifted, stage 1 is prepping instead of sizing a batch this
    // tick, so lastBatch (below) won't have fresh numbers for the CURRENT
    // target -- it's the one entry that would otherwise show no H/W/G
    // breakdown at all. Fill that gap with the same speculative,
    // bandwidth-checked projection used for the other targets further down,
    // so this reads as "prep progress, and here's what it unlocks."
    if (!prepped) {
      const ownPlan = planSpeculativeBatch(ns, batchTarget, liveHosts, ramCosts, useFormulas);
      if (ownPlan) {
        const { rates, assigned, fraction } = ownPlan;
        const hackChance = ns.hackAnalyzeChance(batchTarget.server);
        ns.print(
          `  projected once prepped | hack fraction ${(fraction * 100).toFixed(1)}% | ` +
            `hack chance ${(hackChance * 100).toFixed(0)}% | expected steal ~$${ns.format.number(batchTarget.maxMoney * fraction)}`
        );
        const actionDurations = [
          ["hack", rates.hackTime],
          ["weaken1", rates.weakenTime],
          ["grow", rates.growTime],
          ["weaken2", rates.weakenTime],
        ];
        const now = Date.now();
        const landings = assigned.map((job, i) => ({
          action: actionDurations[i][0],
          threads: job.threads,
          hostname: job.hostname,
          landsAt: now + job.additionalMsec + actionDurations[i][1],
        }));
        const { line1, line2, lastLandsAt } = formatCompactBatchLines(landings);
        ns.print(`    ${line1}`);
        ns.print(
          `    ${line2} | would land ~${new Date(lastLandsAt).toLocaleTimeString()} (in ${((lastLandsAt - now) / 1000).toFixed(1)}s)`
        );
      } else {
        ns.print("  (no bandwidth for a full batch against this target right now)");
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
      const { line1, line2, lastLandsAt } = formatCompactBatchLines(lastBatch.landings);
      const remainingMs = lastLandsAt - now;
      const status = remainingMs <= 0 ? "LANDED" : `in ${(remainingMs / 1000).toFixed(1)}s`;
      ns.print(`    ${line1}`);
      ns.print(`    ${line2} | lands ${new Date(lastLandsAt).toLocaleTimeString()} (${status})`);
    }

    // Same layout as the real batch above, but for every OTHER ranked target
    // we currently have the RAM for -- a dry run (planSpeculativeBatch) of
    // stage 1's own retry loop against each, using the pool as it stands
    // after this tick's real spend (liveHosts, pre-reservation-carve: the
    // reserve is a priority rule for the batch target's own pipeline, not a
    // hard cap on whether OTHER targets could physically fit right now).
    // Targets where nothing fits even at MIN_HACK_FRACTION are left out
    // entirely -- that's what "have the bandwidth for" filters on. Landing
    // times are projected from *now*, not a real launch, since nothing here
    // is actually dispatched.
    const bandwidthTargets = [];
    for (const target of lowerTargets) {
      const plan = planSpeculativeBatch(ns, target, liveHosts, ramCosts, useFormulas);
      if (plan) bandwidthTargets.push({ target, plan });
    }
    if (bandwidthTargets.length > 0) {
      ns.print(`--- other targets with bandwidth right now (${bandwidthTargets.length}/${lowerTargets.length}) ---`);
      const now = Date.now();
      for (const { target, plan } of bandwidthTargets) {
        const { rates, assigned, fraction } = plan;
        const hackChance = ns.hackAnalyzeChance(target.server);
        ns.print(
          `  projected on ${target.server} | hack fraction ${(fraction * 100).toFixed(1)}% | ` +
            `hack chance ${(hackChance * 100).toFixed(0)}% | expected steal ~$${ns.format.number(target.maxMoney * fraction)}`
        );
        const actionDurations = [
          ["hack", rates.hackTime],
          ["weaken1", rates.weakenTime],
          ["grow", rates.growTime],
          ["weaken2", rates.weakenTime],
        ];
        const landings = assigned.map((job, i) => ({
          action: actionDurations[i][0],
          threads: job.threads,
          hostname: job.hostname,
          landsAt: now + job.additionalMsec + actionDurations[i][1],
        }));
        const { line1, line2, lastLandsAt } = formatCompactBatchLines(landings);
        ns.print(`    ${line1}`);
        ns.print(
          `    ${line2} | would land ~${new Date(lastLandsAt).toLocaleTimeString()} (in ${((lastLandsAt - now) / 1000).toFixed(1)}s)`
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

    // Exported snapshot for offline review (see DAEMON_LOG_FILE). Batch
    // launches always flush immediately; skip ticks coalesce into the
    // previous skip record when the target/classification match, flushing
    // only every LOG_FLUSH_INTERVAL_MS while coalescing (a long saturation
    // stretch at BATCH_INTERVAL_MS cadence would otherwise mean a full-buffer
    // JSON.stringify once a second for as long as it lasts).
    if (batchLaunchedThisTick) {
      logEntries = appendLogEvent(ns, logEntries, {
        event: "batch",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        batchTarget: batchTarget.server,
        prepped,
        security: { current: liveBatchState.currentSecurity, min: batchTarget.minSecurityLevel },
        money: { current: liveBatchState.currentMoney, max: batchTarget.maxMoney },
        batchesInFlight,
        totalBatchesSkipped,
        totalBatchesShrunk,
        failedLaunches,
        pipeline: { depth, reserveGb, commitmentPct, waterfallAvailableGb },
        utilizationPct: utilization,
        batch: {
          id: batchLaunchedThisTick.id,
          hackFraction: batchLaunchedThisTick.hackFraction,
          hackChance: batchLaunchedThisTick.hackChance,
          expectedSteal: batchLaunchedThisTick.expectedSteal,
          jobs: batchLaunchedThisTick.landings.map((l) => ({
            action: l.action,
            threads: l.threads,
            hostname: l.hostname,
          })),
        },
      });
    } else if (batchSkippedThisTick) {
      const skipResult = recordSkipEvent(logEntries, {
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        batchTarget: batchTarget.server,
        saturated: batchSkipSaturated,
        batchesInFlight,
        pipeline: { depth, reserveGb, commitmentPct, waterfallAvailableGb },
        utilizationPct: utilization,
      });
      logEntries = skipResult.entries;
      if (skipResult.appended || Date.now() - lastLazyFlush >= LOG_FLUSH_INTERVAL_MS) {
        flushDaemonLog(ns, logEntries);
        lastLazyFlush = Date.now();
      }
    }

    await ns.sleep(BATCH_INTERVAL_MS);
  }
}
