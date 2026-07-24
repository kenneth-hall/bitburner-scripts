// Central-allocation daemon (Phase 2 of the batcher refactor; Phase 7 made it
// multi-target). Runs forever on home. Two cadences: hosts/targets refresh
// every CYCLE_MS (rooting, new purchases, level-ups picked up automatically),
// and a much faster BATCH_INTERVAL_MS inner loop that rebuilds the active
// batch-member set every tick (pickBatchSet, in scheduler.js), launches a
// timed HWGW batch for each prepped member or dispatches prep for each
// drifted one, then spends any leftover RAM prepping non-member targets.
// scheduler.js does all the pure thread/timing/selection math; this file
// does all the `ns` calls and exec/scp plumbing, same split Phase 1 had.

import { getHosts, HOME_RESERVE_GB, totalAllocatableRam } from "./hosts.js";
import { getTargets } from "./targets.js";
import { tprintTs, workerRamCosts, buildTargetsRanking } from "./common.js";
import {
  WORKER_SCRIPTS,
  SHARE_FRACTION,
  SHARE_SCRIPT,
  XP_SCRIPTS,
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
  pickBatchSet,
  cappedPipelineDepth,
  memberReserveGb,
  batchRamCost,
  carveReservation,
  planShareTopUp,
} from "./scheduler.js";
import {
  sampleBatchFields,
  samplePrepFields,
  inFlightByTarget,
  hasFormulas,
  isForcedLegacy,
  crossCheckFormulas,
} from "./sampling.js";

const CYCLE_MS = 10000;

// Exported so it can be pulled down via viteburner's download feature
// (press "d" in the dev terminal, or automatically every 5 minutes -- see
// vite.config.ts) for offline review -- 0 GB RAM cost (ns.write), rewritten
// as a bounded ring buffer so the file doesn't grow unbounded over a long
// session. Every record carries an `event` field ("batch" | "skip" | "enter"
// | "exit" | "mode" | "snapshot" | "xcheck") -- the cap means "last N
// events", not "last N batches", so anything reading the log must filter by
// `event`. Ordering is defined on `timestamp` for most events, but
// `firstTimestamp` for coalesced skips -- an in-place-updated skip's
// `lastTimestamp` can legitimately exceed the `timestamp` of records
// appended after it. The single most recent `mode` event is pinned at the
// head by trimLog() rather than evicted by ordinary FIFO trimming (see
// trimLog's comment) -- everything else ages out in arrival order.
// Phase 9 schema change: `snapshot` events carry `sharePool` (was `share` --
// renamed to stop colliding with ns.share's RAM-cost name, see
// docs/phases/phase-09-batcher-refactor.md) and a new `hackingLevel` field. Old logs stay
// readable by old checker versions via git; the current checker validates
// only the current schema.
// Phase 15 schema change: `snapshot` events gain a top-level `candidateCount`
// (candidates.length that tick) and each `members[]` entry gains a `floor`
// boolean (pipelineCostGb > batchBudgetGb -- true iff pickBatchSet's floor
// rule seated it over-budget). Both additive; the daemon rewrites the whole
// file on flush, so a restarted session's log is uniformly new-schema.
// Phase 20 schema change: `snapshot` events gain `xpPool` (parallel to
// `sharePool`, but with no target/attainedPct -- the XP engine is
// opportunistic, there's nothing to attain). Additive only.
const DAEMON_LOG_FILE = "daemon-batch-log.json";
export const DAEMON_LOG_MAX_ENTRIES = 2000; // raised from 1000 (Phase 7): N members means N x the batch/skip events per tick; exported for trimLog's unit test
const LOG_FLUSH_INTERVAL_MS = 10000; // lazy-flush cadence for batch/skip/snapshot events; mode/enter/exit flush immediately

// Sparse hacking-level/XP time series, separate from the batch ring buffer above.
// Purpose: a long-horizon ETA to the Daedalus hacking gate (2500) -- the batch log
// carries hackingLevel per tick but ages out in ~an hour at fleet size, far too short
// to fit a levels/hour trend against an endgame gate that's hours-to-days away. This is
// time-gated (not per-tick) and survives daemon restarts (loaded from disk at startup),
// so the series accumulates across the frequent restarts our workflow does.
const HACK_PROGRESS_FILE = "hacking-progress-log.json";
const HACK_SAMPLE_INTERVAL_MS = 3 * 60 * 1000; // one {level, exp} sample at most every 3 min
const HACK_PROGRESS_MAX_SAMPLES = 1000; // ~50 h of history at that cadence; small file, plenty of curve to extrapolate

// Phase 1's daemon scp'd these to every rooted host over its runs; they're
// dead weight now that hack.js/grow.js/weaken.js replace them. Swept once at
// startup, not every CYCLE_MS -- ns.rm just returns false (harmlessly) once
// they're gone, so repeating it forever would be pointless.
const OLD_WORKER_FILES = ["hackloop.js", "growloop.js", "weakenloop.js"];

// Phase 8: a 0-byte marker file on home forces the effective share fraction
// to 0 for same-session A/B measurement, without a build swap -- checked
// every tick (ns.fileExists is 0 GB), same pattern as sampling.js's
// legacy-mode.txt.
const SHARE_OFF_MARKER = "share-off.txt";

// Phase 18: caps the tail's combined member+draining list so its height
// stays bounded at any fleet size (the active set has reached 17) -- the
// only way to guarantee the window's header never scrolls out of view.
const MEMBER_LIST_CAP = 12;

// Phase 26 B1: the always-on companions this daemon supervises (relaunches if
// missing). Deliberately excludes the self-terminating fulfillers
// (procureprograms.js, procureformulas.js, studybootstrap.js,
// backdoorfactions.js, backdoorwd.js) -- their absence is their SUCCESS
// state, and a supervisor can't tell "done" from "died early" without owning
// each script's own completion predicate (recorded limitation, see the phase
// spec's open question iii; a crash-before-done there heals at the next
// daemon restart, same as before this phase).
export const RESIDENT_COMPANIONS = [
  "transactionsmonitor.js",
  "resourcemanager.js",
  "cloudmanager.js",
  "gangmanager.js", // Phase 27 -- priority slot right after cloudmanager.js, matches the launch-block order above
  "augfarmer.js",
  "dashboard.js",
  "xpfarm.js",
  "ratchetlog.js",
  // gangratelog.js is deliberately NOT here: as of 2026-07-24 it self-exits at
  // startup when gang-state.json is missing/stale (no gang), so supervising it
  // would relaunch it on a 5-min loop forever. Absence is its success state --
  // same reason procureprograms.js/backdoorwd.js are excluded. It is still
  // launched at startup below.
  "goallog.js", // Phase 32 -- BN2.1 progress sampler (installed-M / smoothed income rate / next-aug timer), feeds dashboard.js's GOAL panel
];
export const SUPERVISOR_CHECK_MS = 60_000; // time-gated inside the main loop, like the share-marker check
export const SUPERVISOR_RETRY_MS = 5 * 60_000; // per-script backoff so an instantly-re-crashing script doesn't relaunch-storm

// Phase 24 (S2): a purpose-built status snapshot for dashboard.js -- distinct
// from DAEMON_LOG_FILE's event ring buffer, which only carries this info
// once per CYCLE_MS via `snapshot` events and lacks several tail-only fields
// (math mode, share-OFF flag, per-tick WARNs). Written every tick, 0 GB.
const DAEMON_STATUS_FILE = "daemon-status.json";

// dashboard.js's targets panel source. Written here rather than by a separate
// monitor: producing it needs the ranked target list plus each target's live
// security/money, and the daemon already computes both every tick (liveStates,
// below). The retired targetsmonitor.js re-derived the ranking via its own
// getTargets import -- ~9.5 GB of duplicated getServer/*Analyze* machinery in a
// second process, for a file the daemon could write for 0 GB. Same 1 s cadence
// either way: targetsmonitor's LIVE_REFRESH_MS and BATCH_INTERVAL_MS are both
// 1000, so retiring it cost no freshness.
const TARGETS_RANKING_FILE = "targets-ranking.json";
const TARGETS_RANKING_TOP_N = 5; // file carries a little more than the panel shows, at zero extra cost

/**
 * Shared free-RAM-check preamble for launchDetached/runAndWait: true iff
 * script fits in home's current free RAM, printing the INFO skip itself when
 * it doesn't (call-site-neutral message -- no "at startup" claim, since
 * runAndWait's only customer runs mid-startup-sequence, not launchDetached's
 * companions).
 */
function fitsOnHome(ns, script) {
  const scriptRam = ns.getScriptRam(script, "home");
  const freeRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  if (scriptRam > freeRam) {
    tprintTs(ns, `INFO: skipped ${script} -- needs ${ns.format.ram(scriptRam)} but only ${ns.format.ram(freeRam)} free on home`);
    return false;
  }
  return true;
}

/**
 * Fire-and-forget launch for a long-running companion script that never exits
 * (transactionsmonitor.js), or a Singularity-heavy
 * self-terminating one (procureprograms.js) -- unlike runAndWait's one-shot
 * utilities, there's nothing to wait for here. Singularity scripts carry a
 * RAM multiplier without SF4 and commonly just don't fit on home yet -- an
 * expected, non-fatal outcome, not a bug.
 */
function launchDetached(ns, script, ...args) {
  if (!fitsOnHome(ns, script)) return;

  const pid = ns.exec(script, "home", 1, ...args);
  if (pid === 0) tprintTs(ns, `ERROR: failed to start ${script}`);
}

/**
 * Pure (Phase 26 B1, S5). Which resident companions need a relaunch attempt
 * this check.
 *
 * `runningNames`: Set of script filenames currently in ns.ps("home").
 * `residents`: the full RESIDENT_COMPANIONS list (order preserved in output).
 * `unfitNames`: Set of resident names that are missing AND currently don't
 * fit on home (fitsOnHome false) -- these go to `waitingRam`, not `launch`,
 * and their backoff clock is untouched, so an unfit->fit transition launches
 * immediately instead of waiting out a backoff that accrued while unfit
 * (cold review blocker 2's "missing != died" case: a resident that simply
 * doesn't fit yet -- normal for augfarmer.js's 64.1 GB in a fresh node's
 * early hours -- is its own state, not a relaunch attempt).
 * `lastAttemptMs`: {[script]: timestamp} of the last relaunch ATTEMPT
 * (fit-and-missing only); absent/undefined means "never attempted".
 * `nowMs`: current time.
 *
 * Returns {launch, waitingRam, lastAttemptMs} -- `lastAttemptMs` is the
 * caller's next map, with an entry added/updated ONLY for names actually
 * placed in `launch` this call (never for `waitingRam` names).
 * @param {Set<string>} runningNames
 * @param {string[]} residents
 * @param {Set<string>} unfitNames
 * @param {Record<string, number>} lastAttemptMs
 * @param {number} nowMs
 * @returns {{launch: string[], waitingRam: string[], lastAttemptMs: Record<string, number>}}
 */
export function planRelaunches(runningNames, residents, unfitNames, lastAttemptMs, nowMs) {
  const launch = [];
  const waitingRam = [];
  const nextAttempts = { ...lastAttemptMs };

  for (const script of residents) {
    if (runningNames.has(script)) continue; // running -- nothing to do
    if (unfitNames.has(script)) {
      waitingRam.push(script);
      continue; // no attempt-time update -- backoff must not accrue while unfit
    }
    const last = nextAttempts[script];
    if (last !== undefined && nowMs - last < SUPERVISOR_RETRY_MS) continue; // still within backoff
    launch.push(script);
    nextAttempts[script] = nowMs;
  }

  return { launch, waitingRam, lastAttemptMs: nextAttempts };
}

/**
 * Runs a cheap non-Singularity one-shot utility and waits for it to exit
 * before returning -- its real sole customer is killscripts.js, which the
 * daemon must wait out before launching workers.
 */
async function runAndWait(ns, script, ...args) {
  if (!fitsOnHome(ns, script)) return;

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
 * Launches this tick's share top-up jobs, each carrying a unique, ignored
 * counter arg (see share.js's header comment) so a top-up landing on a host
 * still running a live share worker from the previous tick doesn't collide
 * with Bitburner's duplicate filename+args exec restriction. Returns only
 * the RAM/threads of jobs that actually started (pid !== 0) -- a failed exec
 * never ran, so it shouldn't inflate the reported in-flight share total, even
 * though its planned RAM is still deducted from the live host pool by the
 * caller (matching the batch launch path's existing behavior).
 */
function launchShareJobs(ns, jobs, ramPerThread, startCounter) {
  let counter = startCounter;
  let failed = 0;
  let launchedRamGb = 0;
  let launchedThreads = 0;
  for (const job of jobs) {
    const pid = ns.exec(SHARE_SCRIPT, job.hostname, job.threads, counter++);
    if (pid === 0) {
      failed++;
    } else {
      launchedRamGb += ramPerThread * job.threads;
      launchedThreads += job.threads;
    }
  }
  return { failed, launchedRamGb, launchedThreads, nextCounter: counter };
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

function cleanupOldWorkerFiles(ns, hosts) {
  let removed = 0;
  for (const host of hosts) {
    for (const file of OLD_WORKER_FILES) {
      if (ns.rm(file, host.hostname)) removed++;
    }
  }
  return removed;
}

/** Rewrites DAEMON_LOG_FILE in full ("w" mode) from the in-memory buffer. */
function flushDaemonLog(ns, entries) {
  ns.write(DAEMON_LOG_FILE, JSON.stringify(entries, null, 2), "w");
}

/** Load the persisted hacking-progress series so a daemon restart continues it
 * (rather than resetting the ETA baseline every restart). Tolerates a missing or
 * malformed file by starting fresh. */
function readHackProgress(ns) {
  try {
    const raw = ns.read(HACK_PROGRESS_FILE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Trims the ring buffer to exactly DAEMON_LOG_MAX_ENTRIES, pinning the most
 * recent `mode` event at the head instead of letting ordinary FIFO trimming
 * evict it -- a session longer than the buffer window would otherwise lose
 * the config record every batch's hackFraction check depends on, making a
 * long acceptance session unpassable by the log checker. Also closes
 * (deletes) any `openSkipRecords` entry whose referenced object is being
 * dropped here -- otherwise a later skip for that server would coalesce into
 * a spliced-out ghost object that never reaches disk, silently losing skip
 * data.
 *
 * Pinning costs one extra slot (the mode event prepended on top of a
 * DAEMON_LOG_MAX_ENTRIES-length tail), so the pinned branch drops one extra
 * real entry (`overflow + 1`, not `overflow`) to keep the result at exactly
 * DAEMON_LOG_MAX_ENTRIES (Phase 16, F2 -- was MAX + 1 while pinned).
 */
export function trimLog(entries, openSkipRecords) {
  if (entries.length <= DAEMON_LOG_MAX_ENTRIES) return entries;
  const overflow = entries.length - DAEMON_LOG_MAX_ENTRIES;

  let latestModeIndex = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].event === "mode") {
      latestModeIndex = i;
      break;
    }
  }
  const pinned = latestModeIndex !== -1 && latestModeIndex < overflow;
  const dropCount = pinned ? overflow + 1 : overflow;

  const dropped = pinned
    ? entries.slice(0, dropCount).filter((_, i) => i !== latestModeIndex)
    : entries.slice(0, dropCount);

  for (const droppedEntry of dropped) {
    if (droppedEntry.event === "skip" && openSkipRecords.get(droppedEntry.batchTarget) === droppedEntry) {
      openSkipRecords.delete(droppedEntry.batchTarget);
    }
  }

  const kept = entries.slice(dropCount);
  return pinned ? [entries[latestModeIndex], ...kept] : kept;
}

/**
 * Pure (Phase 24, S2). Assembles the daemon-status.json record from
 * already-computed display values -- every key present regardless of input
 * (defaults cover the early "no eligible targets" branch, which calls this
 * with just the scalars it has), so a fresh node renders a live "no eligible
 * targets" panel rather than a stale or partially-shaped one.
 */
export function buildDaemonStatus({
  now,
  useFormulas,
  forcedLegacy,
  noTargets = false,
  totalMaxRam = 0,
  batchBudgetGb = 0,
  hostsCount = 0,
  targetsCount = 0,
  utilizationPct = 0,
  members = [],
  memberCount,
  draining = [],
  drainingCount,
  shareOff,
  shareTargetGb = 0,
  shareInFlightRamGb = 0,
  shareInFlightThreads = 0,
  shareAttainedPct = null,
  sharePower = 0,
  waterfallAvailableGb = 0,
  prepping = [],
  stallWarn = false,
  skipWarnServers = [],
  failedLaunches = 0,
}) {
  return {
    timestamp: now,
    time: new Date(now).toLocaleTimeString(),
    noTargets,
    mathMode: useFormulas ? "formulas" : forcedLegacy ? "legacy-forced" : "legacy",
    fleet: { totalMaxRam, batchBudgetGb, hostsCount, targetsCount, utilizationPct },
    members,
    memberCount: memberCount ?? members.length,
    draining,
    drainingCount: drainingCount ?? draining.length,
    share: {
      off: !!shareOff,
      targetGb: shareTargetGb,
      inFlightRamGb: shareInFlightRamGb,
      threads: shareInFlightThreads,
      attainedPct: shareAttainedPct,
      sharePower,
    },
    waterfall: { availableGb: waterfallAvailableGb, prepping },
    warns: { stall: !!stallWarn, skipServers: skipWarnServers, failedLaunches },
  };
}

/** Pure push+trim, no flush -- flush timing is decided once at end-of-tick. */
function appendLogEvent(entries, openSkipRecords, record) {
  entries.push(record);
  return trimLog(entries, openSkipRecords);
}

/**
 * Records a skip tick, coalescing consecutive skips for the SAME TARGET (not
 * "the previous entry globally" -- with members interleaving every tick, the
 * previous entry is usually some other target's record) into one record
 * (count, firstTimestamp, lastTimestamp) via the per-server `openSkipRecords`
 * map. A skip coalesces into the open record iff one exists for this server
 * AND its `saturated` classification matches; any `batch`/`enter`/`exit`
 * event for that server closes the open record (deletes the map entry), as
 * does ring-buffer eviction (see trimLog). Never flushes itself -- returns
 * the (possibly trimmed) entries array; the caller decides flush timing.
 */
function recordSkipEvent(entries, openSkipRecords, record) {
  const open = openSkipRecords.get(record.batchTarget);
  if (open && open.saturated === record.saturated) {
    open.count += 1;
    open.lastTimestamp = record.timestamp;
    open.time = record.time;
    open.batchesInFlight = record.batchesInFlight;
    open.pipeline = record.pipeline;
    open.utilizationPct = record.utilizationPct;
    return entries;
  }

  const fresh = {
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
  };
  entries.push(fresh);
  entries = trimLog(entries, openSkipRecords);
  openSkipRecords.set(record.batchTarget, fresh);
  return entries;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  // Wipe the terminal once on launch so a restart starts from a clean
  // scrollback -- the daemon's own tprint lines and the pre-restart clutter
  // don't accumulate across sessions.
  ns.ui.clearTerminal();

  // Pass our own pid so killscripts.js protects only *this* daemon.js
  // instance, not every process named daemon.js -- otherwise a stale
  // instance left running from a previous session would never get cleaned
  // up on restart, and would silently compete with the new one for RAM.
  await runAndWait(ns, "killscripts.js", ns.pid);
  // Companion: doesn't call ns.exec, so it has zero effect on the worker-RAM
  // pool this daemon competes for -- transactionsmonitor.js writes the day's
  // transactions log (src/translog.js) as income lands. Headless as of Phase
  // 24 -- dashboard.js is the only standing tail. (targetsmonitor.js was
  // retired here: it cost 12.70 GB to re-derive a ranking this daemon already
  // computes, and now writes itself -- see TARGETS_RANKING_FILE.)
  launchDetached(ns, "transactionsmonitor.js");
  // Phase 11: resource manager first, so its state file usually exists by
  // its consumers' first polls -- a nicety, not a correctness requirement,
  // since both consumers' stale/missing guards treat "no state yet" safely.
  // cloudmanager.js is always-on cheap ns.cloud; procureprograms.js is the
  // Singularity-heavy self-terminating TOR/port-opener fulfiller -- it exits
  // on its own once everything it owns-checks is owned, freeing its RAM
  // until the next daemon restart.
  launchDetached(ns, "resourcemanager.js");
  launchDetached(ns, "cloudmanager.js");
  // Phase 27 (S6/S9): gang manager -- inserted directly after cloudmanager.js
  // in the priority slot the RAM census assigned it (the phase's primary
  // gate can't be the script that loses the startup RAM race). Recruit +
  // task-assign only (Tier 1); Tier 2-4 are future phases.
  launchDetached(ns, "gangmanager.js");
  // Phase 30 survivor: durable respect-rate / ascension-mult series sampler.
  // Thin consumer of gang-state.json (no gang API) -- persists the downsampled
  // series gangmanager's overwrite-in-place snapshot can't keep.
  launchDetached(ns, "gangratelog.js");
  // Phase 32: BN2.1 progress sampler -- installed hacking mult `M` toward the
  // w0r1d_d43m0n gate, a smoothed gang+hacking income $/sec + trend, and the
  // $-to-next-aug/awaiting-money timer. ~3.1 GB (getMoneySources+getPlayer).
  launchDetached(ns, "goallog.js");
  launchDetached(ns, "procureprograms.js");
  // Phase 22: Singularity-heavy self-terminating fulfiller for the four
  // hacking-faction backdoors -- resident until all four are done (never
  // joins any faction); exits across a level climb only when finished, not
  // on lulls, since nothing relaunches it until the next daemon restart.
  launchDetached(ns, "backdoorfactions.js");
  // Formulas.exe fulfiller: resident Singularity companion that buys Formulas
  // once hacking clears the reservation threshold (>400) and it's affordable
  // above the bootstrap holdback, then exits. daemon switches legacy->formulas
  // math within a cycle once the file lands. Vetoed by finance-disable-formulas.txt.
  launchDetached(ns, "procureformulas.js");
  // Post-install XP kick: one-shot Singularity companion that throws the
  // character into Rothman University Computer Science when hacking is still
  // near level 1 (fresh install), converting post-install dead time into
  // hacking XP. Self-terminating -- fires (or skips) once and exits, so later
  // daemon restarts past the level threshold are no-ops.
  launchDetached(ns, "studybootstrap.js");
  // Phase 23: always-on Singularity aug farmer -- joins the D11-authorized
  // faction scope, grinds rep, and buys the next cheapest-rep-deficit aug
  // forever (install stays Kenneth's). ~53 GB at SF4.3's 1x, so post-install
  // INFO-skips are expected until home RAM grows back -- see the script's
  // own header.
  launchDetached(ns, "augfarmer.js");
  // Phase 24: the single standing tail -- renderer only, reads the seven
  // companions' state files and formats them to a fixed column/row budget.
  // ~2-4 GB.
  launchDetached(ns, "dashboard.js");
  // Phase 20: XP engine -- fills surplus RAM with hack workers; self-
  // suppresses when the fleet is busy (the batcher's claim is senior).
  launchDetached(ns, "xpfarm.js");
  // Phase 25 Slice 0: headless aug-ratchet instrumentation -- records a
  // {pre, post} snapshot on every install boundary so the install-trigger is
  // built from measured data. Disk-persisted, so it reconciles the boundary
  // the install itself killed it across. Tiny; skipped if home can't fit it.
  launchDetached(ns, "ratchetlog.js");
  // 2026-07-15 amendment (Kenneth's explicit ask): auto-backdoors
  // w0r1d_d43m0n -- ends the BitNode. Harmless before Red Pill is bought
  // (WD doesn't exist yet, every poll is a silent no-op); self-terminates
  // the instant it fires. See the script's own header for why this is a
  // separate file from backdoorfactions.js, not folded into it.
  launchDetached(ns, "backdoorwd.js");
  // GP1 watcher (2026-07-21): captures the true w0r1d_d43m0n hacking-level gate
  // the instant Red Pill installs (unreadable before then) + whether NiteSec
  // faction rep survives the install. Resident, self-terminates once captured;
  // relaunched here each install so it's alive on the far side of the boundary.
  launchDetached(ns, "gatewatch.js");

  let hosts = [];
  let targets = [];
  let ramCosts = {};
  let previousTargetNames = new Set();
  let totalBatchesSkipped = 0;
  let totalBatchesShrunk = 0; // full-fraction misses that launched anyway at a smaller fraction (bootstrap-only, per shrink gating)
  let batchSequence = 0;
  let logEntries = []; // in-memory mirror of DAEMON_LOG_FILE's bounded ring buffer
  let lastLazyFlush = Date.now(); // last time a lazy-flush-eligible event was flushed to disk
  let hackProgress = readHackProgress(ns); // sparse {timestamp, level, exp} series, continued across restarts
  let lastHackSample = hackProgress.length ? hackProgress[hackProgress.length - 1].timestamp : 0; // 0 => sample on the first tick
  let useFormulas = false;
  let forcedLegacy = false;
  let previousMathMode = null; // null until the first refreshCycle; startup records its mode to the log but no longer prints it (only real transitions do)

  // --- Phase 8 share-allocation state ---
  let shareOff = ns.fileExists(SHARE_OFF_MARKER, "home");
  let effectiveShareFraction = shareOff ? 0 : SHARE_FRACTION;
  let previousShareFraction = effectiveShareFraction; // seeded (not null): the startup mode event below already carries this value, so no separate toggle-triggered event fires for it
  let shareLaunchCounter = 0; // monotonically increasing, ignored exec arg -- see share.js/launchShareJobs

  // --- Phase 7 multi-member state (replaces the old single incumbentServer) ---
  let memberServers = []; // last tick's active member server names, score order -- the pickBatchSet "incumbentServers" input
  let lastKnownPipelineCostGb = new Map(); // server -> cost, refreshed every tick a seat is held; read (never recomputed) at exit time
  let openSkipRecords = new Map(); // server -> open skip-log record reference, for per-target coalescing (see recordSkipEvent/trimLog)
  let drainDeadlines = new Map(); // server -> estimated drain-complete epoch-ms, display-only
  let lastLaunchInfo = null; // single most-recent launch across all members, for the compact "last launch" display line
  let justRefreshed = true; // true only for the tick that just ran refreshCycle() -- gates the once-per-CYCLE_MS snapshot event
  let pendingImmediateFlush = false; // set when a mode/enter/exit event was appended this tick -- forces an immediate flush instead of the lazy timer

  // --- Phase 26 B1 companion-supervisor state ---
  let lastSupervisorCheck = 0; // 0 => check on the first tick
  let supervisorAttempts = {}; // script -> last relaunch-attempt timestamp (planRelaunches' lastAttemptMs)
  let companionMissingSince = {}; // script -> ms first observed missing (cleared once seen running again)
  let companionAttemptCount = {}; // script -> relaunch attempts since it went missing (cleared once running)
  let waitingRamAnnounced = new Set(); // scripts currently in the waiting-ram state we've already announced once

  // Appends a "mode" event carrying BOTH the math-mode and share-allocation
  // config, whichever changed -- the log's one config record, so a toggle of
  // either is visible with a timestamp regardless of which one moved.
  function recordModeEvent() {
    logEntries = appendLogEvent(logEntries, openSkipRecords, {
      event: "mode",
      time: new Date().toLocaleTimeString(),
      timestamp: Date.now(),
      formulas: useFormulas,
      forcedLegacy,
      shareFraction: effectiveShareFraction,
      shareOff,
      config: {
        HACK_FRACTION,
        GROW_BUFFER,
        WEAKEN_BUFFER,
        DRIFT_SEC_EPSILON,
        DRIFT_MONEY_FRACTION,
        RANK_HYSTERESIS,
        BATCH_INTERVAL_MS,
        SHARE_FRACTION,
      },
    });
    pendingImmediateFlush = true;
  }

  async function refreshCycle() {
    const newlyRooted = [];
    hosts = getHosts(ns, newlyRooted);
    if (newlyRooted.length > 0) {
      // Demoted from a per-host terminal tprint (a rebuild flood) to one
      // batched log event -- read the history in daemon-batch-log.json.
      logEntries = appendLogEvent(logEntries, openSkipRecords, {
        event: "rooted",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        servers: newlyRooted,
      });
      pendingImmediateFlush = true;
    }
    targets = getTargets(ns);

    // Re-checked every CYCLE_MS (decided): a mid-run Formulas.exe purchase
    // upgrades the math within one refresh, no restart; after a reset the
    // check silently falls back to legacy. Nothing to remember across resets.
    useFormulas = hasFormulas(ns);
    forcedLegacy = isForcedLegacy(ns);
    if (useFormulas !== previousMathMode) {
      // Only announce genuine mid-run transitions (e.g. a Formulas.exe
      // purchase upgrading legacy->formulas). The first-cycle emission
      // (previousMathMode starts null) merely restates the mode we booted
      // into -- steady state for the majority of a run, non-actionable
      // terminal noise, same call the "new target" prints below got.
      if (previousMathMode !== null) {
        tprintTs(ns, `INFO: math mode ${useFormulas ? "formulas" : forcedLegacy ? "legacy (forced)" : "legacy"}`);
      }
      previousMathMode = useFormulas;
      // recordModeEvent() still fires on the very first refreshCycle, so
      // every log file states its mode from the first record and is
      // self-describing -- the log checker validates against this recorded
      // config, not whatever the source tree says today. Relies on
      // effectiveShareFraction/shareOff already being current for this tick
      // (set at the top of the main loop, before refreshCycle can be called).
      recordModeEvent();
    }

    for (const host of hosts) {
      if (host.hostname === "home") continue;
      ns.scp([WORKER_SCRIPTS.hack, WORKER_SCRIPTS.grow, WORKER_SCRIPTS.weaken, SHARE_SCRIPT], host.hostname);
    }

    ramCosts = {
      ...workerRamCosts(ns),
      [SHARE_SCRIPT]: ns.getScriptRam(SHARE_SCRIPT, "home"),
      // Phase 20: priced so inFlightByTarget can bucket the XP engine's
      // processes into xpPool -- the daemon never launches these itself.
      [XP_SCRIPTS.hack]: ns.getScriptRam(XP_SCRIPTS.hack, "home"),
      [XP_SCRIPTS.weaken]: ns.getScriptRam(XP_SCRIPTS.weaken, "home"),
    };

    const currentTargetNames = new Set(targets.map((t) => t.server));
    // "new target" prints were removed as non-actionable terminal noise: they
    // fire routinely as the hacking level climbs and unlocks servers, and
    // targets-ranking.json already surfaces the live eligible-target set. The
    // rarer "dropped target" line is kept -- a target leaving eligibility is
    // infrequent and more likely to be worth a glance.
    for (const name of previousTargetNames) {
      if (!currentTargetNames.has(name)) tprintTs(ns, `INFO: dropped target ${name}`);
    }
    previousTargetNames = currentTargetNames;

    // Runtime canary, once per CYCLE_MS: compares formulas math against
    // legacy at the *current* state (not prepped -- both branches only agree
    // there if the target happens to be exactly at min/max) for the
    // highest-scored active member. Skipped in legacy mode (nothing to
    // cross-check) and whenever there's no active member yet.
    if (useFormulas && memberServers.length > 0) {
      const crossCheckTarget = targets.find((t) => t.server === memberServers[0]);
      if (crossCheckTarget) {
        const mismatches = crossCheckFormulas(ns, crossCheckTarget);
        for (const mismatch of mismatches) {
          tprintTs(
            ns,
            `WARN: xcheck mismatch on ${crossCheckTarget.server} (${mismatch.field}${mismatch.soft ? ", soft" : ""}): ` +
              `legacy=${mismatch.legacy} formulas=${mismatch.formulas}`
          );
          logEntries = appendLogEvent(logEntries, openSkipRecords, {
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
    justRefreshed = false;
    pendingImmediateFlush = false;

    // Marker re-checked every tick (ns.fileExists is 0 GB), independent of
    // the CYCLE_MS host/target refresh cadence -- a toggle mid-cycle takes
    // effect within one tick, matching the spec's A/B-measurement intent.
    // Computed BEFORE refreshCycle() might run below, so its own mode event
    // (on a math-mode change) always carries this tick's current share state.
    shareOff = ns.fileExists(SHARE_OFF_MARKER, "home");
    const nextShareFraction = shareOff ? 0 : SHARE_FRACTION;
    if (nextShareFraction !== previousShareFraction) {
      tprintTs(ns, nextShareFraction === 0 ? `INFO: share OFF (${SHARE_OFF_MARKER})` : `INFO: share ON (${(nextShareFraction * 100).toFixed(0)}%)`);
      effectiveShareFraction = nextShareFraction;
      previousShareFraction = nextShareFraction;
      recordModeEvent();
    } else {
      effectiveShareFraction = nextShareFraction;
    }

    // Guard against the fleetupgrade.js rename window, airtight not
    // best-effort: fleetupgrade.js contains no await, so it runs atomically
    // between daemon ticks -- every rename lands while the daemon sleeps --
    // and there are no awaits between this guard and the per-host calls
    // below, so no try/catch is needed either. Checked every tick (not just
    // on the CYCLE_MS cadence) because renames can land mid-cycle: while a
    // renamed host is missing from `hosts`, its workers are invisible to the
    // in-flight sweep, so batchesInFlightBeforeTick can read 0 with a full
    // pipeline in flight -- reopening the shrink gate and letting a runt
    // launch mid-pipeline, the exact ratchet Phase 3 closed. An immediate
    // refreshCycle() (not waiting out CYCLE_MS) closes that window within
    // the tick that detects it.
    const vanishedHostnames = hosts.filter((h) => !ns.serverExists(h.hostname)).map((h) => h.hostname);
    if (vanishedHostnames.length > 0) {
      for (const hostname of vanishedHostnames) {
        tprintTs(ns, `INFO: host ${hostname} no longer exists (renamed mid-cycle?) -- refreshing immediately`);
      }
      hosts = hosts.filter((h) => !vanishedHostnames.includes(h.hostname));
      await refreshCycle();
      lastCycleTime = Date.now();
      justRefreshed = true;
    } else if (Date.now() - lastCycleTime >= CYCLE_MS) {
      await refreshCycle();
      lastCycleTime = Date.now();
      justRefreshed = true;
    }

    // Phase 26 B1 (S5): companion supervisor -- time-gated inside this loop
    // like the share-marker check, independent of the CYCLE_MS/targets state
    // (a companion death matters whether or not there are eligible targets
    // right now). ns.ps("home") is already charged via sampling.js's
    // inFlightByTarget, reachable from this same file -- this direct call
    // adds no new RAM (S9).
    const supervisorNowMs = Date.now();
    if (supervisorNowMs - lastSupervisorCheck >= SUPERVISOR_CHECK_MS) {
      lastSupervisorCheck = supervisorNowMs;
      const runningNames = new Set(ns.ps("home").map((p) => p.filename));

      for (const script of RESIDENT_COMPANIONS) {
        if (runningNames.has(script)) {
          delete companionMissingSince[script];
          delete companionAttemptCount[script];
        } else if (companionMissingSince[script] === undefined) {
          companionMissingSince[script] = supervisorNowMs;
        }
      }

      const unfitNames = new Set(RESIDENT_COMPANIONS.filter((s) => !runningNames.has(s) && !fitsOnHome(ns, s)));
      const supervisorPlan = planRelaunches(runningNames, RESIDENT_COMPANIONS, unfitNames, supervisorAttempts, supervisorNowMs);
      supervisorAttempts = supervisorPlan.lastAttemptMs;

      for (const script of supervisorPlan.launch) {
        companionAttemptCount[script] = (companionAttemptCount[script] ?? 0) + 1;
        const sinceMs = supervisorNowMs - (companionMissingSince[script] ?? supervisorNowMs);
        tprintTs(ns, `SUPERVISOR: ${script} not running -- relaunching (attempt ${companionAttemptCount[script]}, missing ${Math.round(sinceMs / 1000)}s)`);
        logEntries = appendLogEvent(logEntries, openSkipRecords, {
          event: "companion-relaunch",
          time: new Date().toLocaleTimeString(),
          timestamp: supervisorNowMs,
          script,
          attempt: companionAttemptCount[script],
          sinceMs,
        });
        pendingImmediateFlush = true;
        launchDetached(ns, script);
        waitingRamAnnounced.delete(script); // a fresh launch attempt supersedes any prior waiting-ram announcement
      }

      // Missing + unfit is its own state, not a relaunch (cold review blocker
      // 2): no WARN, no companion-relaunch event, no attempt-time update --
      // one INFO line + one log event on ENTERING the state, then silence
      // until it fits (normal relaunch resumes, backoff clock fresh) or shows
      // up. Without this the supervisor would WARN every 5 min for hours in
      // exactly the fresh-node window B1 exists to protect.
      for (const script of supervisorPlan.waitingRam) {
        if (!waitingRamAnnounced.has(script)) {
          waitingRamAnnounced.add(script);
          tprintTs(ns, `INFO: ${script} missing but doesn't fit on home yet -- waiting for RAM`);
          logEntries = appendLogEvent(logEntries, openSkipRecords, {
            event: "companion-waiting-ram",
            time: new Date().toLocaleTimeString(),
            timestamp: supervisorNowMs,
            script,
          });
        }
      }
      for (const script of [...waitingRamAnnounced]) {
        if (!supervisorPlan.waitingRam.includes(script)) waitingRamAnnounced.delete(script);
      }
    }

    if (targets.length === 0) {
      ns.clearLog();
      ns.print(`===== daemon @ ${new Date().toLocaleTimeString()} =====`);
      ns.print("No eligible targets.");
      ns.write(
        DAEMON_STATUS_FILE,
        JSON.stringify(
          buildDaemonStatus({
            now: Date.now(),
            useFormulas,
            forcedLegacy,
            noTargets: true,
            hostsCount: hosts.length,
            shareOff,
            sharePower: ns.getSharePower(),
          })
        ),
        "w"
      );
      await ns.sleep(BATCH_INTERVAL_MS);
      continue;
    }

    // --- Step 2: one in-flight sweep (pre-tick) -----------------------------
    let liveHosts = refreshFreeRam(ns, hosts);
    // Fixed capacity, not "free RAM right now" -- the latter already excludes
    // whatever earlier ticks' still-in-flight batches are using. Comparing
    // against total capacity instead reflects everything currently in
    // flight, old and new -- and it's the budget pickBatchSet admits
    // pipelines against below.
    const totalMaxRam = totalAllocatableRam(hosts);
    const preTickInFlight = inFlightByTarget(ns, hosts, ramCosts);
    let failedLaunches = 0;

    // --- Step 3: share top-up (hard carve, before anything batch-related) --
    // Share is the hard carve's senior claimant: it draws from the pool
    // first every tick, and batching's aggregate is bounded by its own
    // reduced budget below (batchBudgetGb) -- steady-state coexistence is by
    // construction, not by yielding. One-cycle workers (share.js) mean the
    // live pool only ever hovers just under target and decays toward it
    // within ~10s of a toggle -- expected, not "fixed" (see share.js).
    const shareTargetGb = effectiveShareFraction * totalMaxRam;
    const shareTopUp = planShareTopUp(shareTargetGb, preTickInFlight.sharePool.ramGb, ramCosts[SHARE_SCRIPT], liveHosts);
    const shareLaunch = launchShareJobs(ns, shareTopUp.jobs, ramCosts[SHARE_SCRIPT], shareLaunchCounter);
    failedLaunches += shareLaunch.failed;
    shareLaunchCounter = shareLaunch.nextCounter;
    for (const job of shareTopUp.jobs) {
      const host = liveHosts.find((h) => h.hostname === job.hostname);
      if (host) host.freeRam -= ramCosts[SHARE_SCRIPT] * job.threads;
    }
    // Computed from preTickInFlight + this tick's launches rather than a
    // third ns.ps() sweep -- Phase 7's two-sweeps-per-tick property is
    // load-bearing (see sampling.js's inFlightByTarget doc comment).
    const shareInFlightRamGb = preTickInFlight.sharePool.ramGb + shareLaunch.launchedRamGb;
    const shareInFlightThreads = preTickInFlight.sharePool.threads + shareLaunch.launchedThreads;
    const batchBudgetGb = (1 - effectiveShareFraction) * totalMaxRam;

    // --- Step 4: candidate sampling, pickBatchSet, enter/exit logging ------
    const candidates = [];
    const targetsByServer = new Map(targets.map((t) => [t.server, t]));
    const liveStates = new Map(); // server -> liveTargetState, reused by the member loop and display below

    for (const target of targets) {
      const liveState = liveTargetState(ns, target);
      liveStates.set(target.server, liveState);
      const realPrepped = isPrepped(liveState);

      // Cost basis + pipeline depth, sampled fresh every tick regardless of
      // whether this target ends up a member. steadyWeakenTime (not
      // weakenTime) feeds depth -- it's the cost-basis duration, not real
      // job timing, not targets.js's CYCLE_MS-stale copy.
      const sample = sampleBatchFields(ns, target, HACK_FRACTION, useFormulas);
      if (sample === null) continue; // unhackable this tick -- excluded from candidates; an incumbent here exits "ineligible"

      const jobs = planBatch(sample);
      const ramCost = batchRamCost(jobs, ramCosts);
      // Phase 15: capped by batchBudgetGb, not the raw throughput ceiling --
      // a fleet too small to ever afford one target's FULL pipeline should
      // still admit a partial one (see scheduler.js's cappedPipelineDepth doc
      // comment); the known approximation is that this caps against the
      // full budget, not the remaining budget at seat time, same spirit as
      // the fleet-total-vs-single-host approximation pickBatchSet documents.
      const depth = cappedPipelineDepth(sample.steadyWeakenTime, ramCost, batchBudgetGb);
      candidates.push({
        server: target.server,
        score: target.score,
        pipelineCostGb: depth * ramCost,
        // Gate input for pickBatchSet's displacement pass only. Legacy mode
        // forces this true unconditionally (Phase 4's convention): legacy's
        // current-state scoring already only lets a challenger through once
        // the waterfall has warmed it up, so the gate would be redundant.
        // realPrepped (below) is what everything else uses.
        prepped: useFormulas ? realPrepped : true,
        realPrepped,
        depth,
        sample,
        jobs,
      });
    }

    // Known approximation (see scheduler.js's own doc comment on
    // pickBatchSet): this is a fleet-total GB budget check, but
    // assignBatchHosts still requires each job to land on a single host -- a
    // pipeline can fit the aggregate budget while a given tick's job doesn't
    // fit any one host. Handled downstream by the existing per-member
    // shrink/skip retry loop (step 5), not here.
    //
    // budgetGb is batchBudgetGb, not totalMaxRam (Phase 8's entire
    // batching-visible change): share's hard carve already physically took
    // its RAM in step 3, so batching is admitted against what's left.
    const result = pickBatchSet(candidates, memberServers, batchBudgetGb, RANK_HYSTERESIS);

    const candidateByServer = new Map(candidates.map((c) => [c.server, c]));
    const membersByServer = new Map(result.members.map((m) => [m.server, m]));
    const previousMemberSet = new Set(memberServers);
    const newMemberSet = new Set(result.members.map((m) => m.server));

    for (const exit of result.exits) {
      const inFlightInfo = preTickInFlight.byTarget[exit.server] ?? { batches: 0, ramGb: 0 };
      // "ineligible" exits have no fresh sample this tick by definition, so
      // commitmentPct is computed from the last-known cost cached below,
      // never recomputed live.
      const lastCost = lastKnownPipelineCostGb.get(exit.server) ?? 0;
      const commitmentPct = lastCost > 0 ? (inFlightInfo.ramGb / lastCost) * 100 : 0;
      // Demoted from terminal to log-only (rebuild flood) -- history is the
      // "exit" event below, in daemon-batch-log.json.
      logEntries = appendLogEvent(logEntries, openSkipRecords, {
        event: "exit",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        server: exit.server,
        reason: exit.reason,
        batchesInFlight: inFlightInfo.batches,
        inFlightRamGb: inFlightInfo.ramGb,
        commitmentPct,
      });
      pendingImmediateFlush = true;
      openSkipRecords.delete(exit.server);
      if (inFlightInfo.batches > 0) {
        const weakenTimeMs = targetsByServer.get(exit.server)?.weakenTime ?? candidateByServer.get(exit.server)?.sample.weakenTime ?? 0;
        drainDeadlines.set(exit.server, Date.now() + weakenTimeMs);
      }
    }

    for (const member of result.members) {
      if (previousMemberSet.has(member.server)) continue; // not an entrant this tick
      const displaced = result.displacement && result.displacement.entrant === member.server ? result.displacement.displaced : [];
      // Demoted from terminal to log-only (rebuild flood) -- history is the
      // "enter" event below, in daemon-batch-log.json.
      logEntries = appendLogEvent(logEntries, openSkipRecords, {
        event: "enter",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        server: member.server,
        score: member.score,
        displaced,
        prepped: member.realPrepped,
      });
      pendingImmediateFlush = true;
      openSkipRecords.delete(member.server);
      drainDeadlines.delete(member.server);
    }

    // Cache every seated tick's cost -- not just on entry -- so a later
    // "ineligible" exit (no fresh sample that tick, by definition) still has
    // a usable last-known basis for commitmentPct.
    for (const member of result.members) {
      lastKnownPipelineCostGb.set(member.server, member.pipelineCostGb);
    }

    // --- Step 5: member loop, score order (pickBatchSet already sorted) ----
    // Transition dynamics to expect (documented, not "fixed"): a displacing
    // entrant starts with an empty pipeline while the evictee's RAM drains
    // over up to a weakenTime, so the entrant's first ticks will
    // bootstrap-shrink or skip-with-empty-pipeline until RAM frees -- the
    // existing bootstrap path doing its job. Separately, admission/reserve
    // account for pipeline cost only, while a drifted member's stage-1 prep
    // dispatch below is uncapped -- several members re-prepping
    // simultaneously can transiently starve a higher member's pipeline
    // *refill* (the reserve carve happens after all members act, step 6).
    // Score-ordered launches keep per-tick priority correct and the system
    // self-corrects within a weakenTime; skip clusters during simultaneous
    // re-preps are expected, not a bug to gate on.
    const memberResults = [];

    for (const member of result.members) {
      const target = targetsByServer.get(member.server);
      const batchesInFlightBeforeTick = preTickInFlight.byTarget[member.server]?.batches ?? 0;

      if (member.realPrepped) {
        // Shrink gating: only bootstrap (shrink the fraction) when THIS
        // MEMBER's pipeline is empty -- the gate is now per-member, but the
        // global totalBatchesShrunk/totalBatchesSkipped counters stay
        // global, same rationale as before (a full-fraction miss against a
        // non-empty pipeline is a skip, not a shrink).
        const allowShrink = batchesInFlightBeforeTick === 0;
        let fraction = HACK_FRACTION;
        let assigned = null;
        let winningRates = null;
        while (fraction >= MIN_HACK_FRACTION) {
          const rates = fraction === HACK_FRACTION ? member.sample : sampleBatchFields(ns, target, fraction, useFormulas);
          if (rates === null) break; // unusable sample -- nothing sane to plan this tick
          const jobs = fraction === HACK_FRACTION ? member.jobs : planBatch(rates);
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

          const launchedAt = Date.now();
          const actionDurations = [
            ["hack", winningRates.hackTime],
            ["weaken1", winningRates.weakenTime],
            ["grow", winningRates.growTime],
            ["weaken2", winningRates.weakenTime],
          ];
          batchSequence++;
          const lastLandsAt = Math.max(...assigned.map((job, i) => launchedAt + job.additionalMsec + actionDurations[i][1]));
          lastLaunchInfo = {
            id: batchSequence,
            server: member.server,
            launchedAt,
            hackFraction: fraction,
            hackChance: ns.hackAnalyzeChance(member.server),
            expectedSteal: target.maxMoney * fraction,
            lastLandsAt,
          };
          memberResults.push({
            server: member.server,
            kind: "launched",
            id: batchSequence,
            fraction,
            hackChance: lastLaunchInfo.hackChance,
            expectedSteal: lastLaunchInfo.expectedSteal,
            jobs: assigned.map((job, i) => ({ action: actionDurations[i][0], threads: job.threads, hostname: job.hostname })),
          });
        } else {
          totalBatchesSkipped++;
          memberResults.push({ server: member.server, kind: "skipped", saturated: !allowShrink });
        }
      } else {
        // Drifted -- dispatch prep, same samplePrepFields/planPrep path as
        // today, with its existing in-flight discounting untouched.
        const prepFields = samplePrepFields(ns, hosts, target, useFormulas);
        const { jobs, hosts: remaining, schedule } = planPrep(prepFields, liveHosts, ramCosts);
        failedLaunches += launchJobs(ns, jobs);
        liveHosts = remaining;
        memberResults.push({
          server: member.server,
          kind: "prep",
          launchedThreads: schedule.reduce((sum, s) => sum + s.launchedThreads, 0),
          requestedThreads: schedule.reduce((sum, s) => sum + s.requestedThreads, 0),
        });
      }
    }

    // --- Step 6: aggregate reserve carve ------------------------------------
    // Second in-flight sweep, AFTER this tick's launches, so the reserve
    // reflects what's actually committed now (including anything just
    // launched above). Its `sharePool` field is deliberately unused (see step
    // 3 -- share's post-top-up state is tracked arithmetically instead, so
    // this stays exactly two sweeps per tick, not three).
    const postLaunchInFlight = inFlightByTarget(ns, hosts, ramCosts);
    let totalReserveGb = 0;
    const memberReserve = new Map(); // server -> {reserveGb, inFlightRamGb, batchesInFlight}
    for (const member of result.members) {
      const info = postLaunchInFlight.byTarget[member.server] ?? { batches: 0, ramGb: 0 };
      // Floor-seated members reserve nothing -- see memberReserveGb's comment
      // for why an unaffordable pipeline's reserve is unspendable, and how
      // carving it anyway deadlocks a cold-start fleet.
      const reserveGb = memberReserveGb(member.pipelineCostGb, info.ramGb, batchBudgetGb);
      memberReserve.set(member.server, { reserveGb, inFlightRamGb: info.ramGb, batchesInFlight: info.batches });
      totalReserveGb += reserveGb;
    }

    const preWaterfallTotal = liveHosts.reduce((sum, h) => sum + h.freeRam, 0);
    const carvedPool = carveReservation(liveHosts, totalReserveGb); // existing mechanism, unchanged -- one aggregate carve, largest-hosts-first, just a bigger number
    const waterfallAvailableGb = carvedPool.reduce((sum, h) => sum + h.freeRam, 0);

    // --- Step 7: waterfall (non-members) ------------------------------------
    const nonMemberTargets = targets.filter((t) => !newMemberSet.has(t.server));
    let waterfallPool = carvedPool;
    const preppedThisTick = [];
    for (const target of nonMemberTargets) {
      if (waterfallPool.length === 0 || waterfallPool.every((h) => h.freeRam <= 0)) break;
      // liveStates always has every target (populated for the full `targets`
      // list in step 3, and nonMemberTargets is a subset) -- reusing it here
      // avoids a redundant duplicate ns call for state that hasn't changed
      // since step 3 (nothing launches against non-members before this loop).
      if (isPrepped(liveStates.get(target.server))) continue;
      const prepFields = samplePrepFields(ns, hosts, target, useFormulas);
      const { jobs, hosts: remaining } = planPrep(prepFields, waterfallPool, ramCosts);
      failedLaunches += launchJobs(ns, jobs);
      waterfallPool = remaining;
      if (jobs.length > 0) preppedThisTick.push(target.server);
    }
    const spentByWaterfall = waterfallAvailableGb - waterfallPool.reduce((sum, h) => sum + h.freeRam, 0);
    const totalRemaining = preWaterfallTotal - spentByWaterfall;
    const utilization = totalMaxRam > 0 ? ((totalMaxRam - totalRemaining) / totalMaxRam) * 100 : 0;

    // --- Step 8: display, logging, sleep ------------------------------------
    const drainingServers = Object.keys(postLaunchInFlight.byTarget).filter(
      (server) => !newMemberSet.has(server) && postLaunchInFlight.byTarget[server].batches > 0
    );

    ns.clearLog();
    ns.print(`===== daemon @ ${new Date().toLocaleTimeString()} ===== math: ${useFormulas ? "formulas" : forcedLegacy ? "legacy (forced)" : "legacy"}`);
    ns.print(
      `fleet ${ns.format.ram(totalMaxRam)} | budget ${ns.format.ram(batchBudgetGb)} | hosts ${hosts.length} | ` +
        `targets ${targets.length} | util ${utilization.toFixed(1)}%`
    );

    // Phase 15: this state should be unreachable now that candidate
    // construction caps depth by affordability and pickBatchSet's floor rule
    // guarantees a seat whenever candidates is non-empty -- any sighting
    // means both of those broke at once. Loud on purpose (every tick it
    // holds), 0GB (ns.print).
    if (result.members.length === 0 && candidates.length > 0) {
      const cheapest = candidates.reduce((min, c) => (c.pipelineCostGb < min.pipelineCostGb ? c : min));
      ns.print(
        `WARN: zero-member stall -- ${candidates.length} candidate(s) but none seated ` +
          `(cheapest: ${cheapest.server} @ ${ns.format.ram(cheapest.pipelineCostGb)} vs budget ${ns.format.ram(batchBudgetGb)})`
      );
    }

    // Phase 18: members + draining share one capped list (MEMBER_LIST_CAP) so
    // the tail's height stays bounded at any fleet size -- overflow collapses
    // to a single "(+N more)" line instead of scrolling the header out of
    // view (the active set has reached 17 members).
    ns.print(`members ${result.members.length}${drainingServers.length > 0 ? ` (+${drainingServers.length} draining)` : ""}:`);
    const memberLines = result.members.map((member) => {
      const info = memberReserve.get(member.server);
      const liveState = liveStates.get(member.server);
      const target = targetsByServer.get(member.server);
      const commitPct = member.pipelineCostGb > 0 ? (info.inFlightRamGb / member.pipelineCostGb) * 100 : 0;
      const isFloor = member.pipelineCostGb > batchBudgetGb;
      return (
        `  ${member.server.padEnd(15)} ${member.realPrepped ? "PREPPED" : "DRIFTED"}${isFloor ? " FLOOR" : ""} ` +
        `${String(info.batchesInFlight).padStart(3)}/${member.depth} in flight | ` +
        `commit ${commitPct.toFixed(0).padStart(3)}% | ` +
        `sec ${liveState.currentSecurity.toFixed(1)}/${target.minSecurityLevel} | ` +
        `$${ns.format.number(liveState.currentMoney)}/${ns.format.number(target.maxMoney)}`
      );
    });
    const drainingLines = drainingServers.map((server) => {
      const deadline = drainDeadlines.get(server);
      const etaLabel = deadline ? `~${Math.max(0, (deadline - Date.now()) / 60000).toFixed(1)}m left` : "eta unknown";
      return `  ${server.padEnd(15)} DRAINING ${postLaunchInFlight.byTarget[server].batches} batch(es) landing, ${etaLabel}`;
    });
    const statusLines = [...memberLines, ...drainingLines];
    for (const line of statusLines.slice(0, MEMBER_LIST_CAP)) ns.print(line);
    if (statusLines.length > MEMBER_LIST_CAP) ns.print(`  (+${statusLines.length - MEMBER_LIST_CAP} more)`);

    const sharePower = ns.getSharePower();
    if (shareOff) {
      ns.print(`share: OFF (${SHARE_OFF_MARKER})`);
    } else {
      const shareAttainedPct = shareTargetGb > 0 ? (shareInFlightRamGb / shareTargetGb) * 100 : null;
      ns.print(
        `share: ${ns.format.ram(shareInFlightRamGb)}/${ns.format.ram(shareTargetGb)}` +
          `${shareAttainedPct !== null ? ` (${shareAttainedPct.toFixed(1)}%)` : ""} | ` +
          `${shareInFlightThreads.toLocaleString()}t | power ${sharePower.toFixed(2)}`
      );
    }

    ns.print(
      `waterfall: ${ns.format.ram(waterfallAvailableGb)} free | prepping: ${preppedThisTick.length > 0 ? preppedThisTick.join(", ") : "none"}`
    );

    // Per-member skip WARNs only (empty-pipeline, the real signal to watch) --
    // saturated skips (expected RAM-poor rhythm) and the last-launch/
    // prep-dispatch detail lines are dropped from the tail: all already live
    // in daemon-batch-log.json's skip/batch/snapshot events (Phase 18).
    for (const mr of memberResults) {
      if (mr.kind !== "skipped" || mr.saturated) continue;
      ns.print(`WARN: ${mr.server} skipped this tick -- insufficient RAM even at MIN_HACK_FRACTION (empty pipeline)`);
    }
    if (failedLaunches > 0) ns.print(`WARN: ${failedLaunches} launch(es) failed (exec returned pid 0)`);

    // Phase 24 (S2): dashboard.js's status snapshot -- built from the same
    // values just displayed above, mapped into buildDaemonStatus's shape.
    // Carries ALL seated members (the renderer applies the 3-cap; this file
    // is the offline evidence).
    const statusMembers = result.members.map((member) => {
      const info = memberReserve.get(member.server);
      const liveState = liveStates.get(member.server);
      const target = targetsByServer.get(member.server);
      const commitPct = member.pipelineCostGb > 0 ? (info.inFlightRamGb / member.pipelineCostGb) * 100 : 0;
      return {
        server: member.server,
        prepped: member.realPrepped,
        floor: member.pipelineCostGb > batchBudgetGb,
        batchesInFlight: info.batchesInFlight,
        depth: member.depth,
        commitPct,
        sec: liveState.currentSecurity,
        minSec: target.minSecurityLevel,
        money: liveState.currentMoney,
        maxMoney: target.maxMoney,
      };
    });
    const statusDraining = drainingServers.map((server) => {
      const deadline = drainDeadlines.get(server);
      return {
        server,
        batches: postLaunchInFlight.byTarget[server].batches,
        etaMin: deadline ? Math.max(0, (deadline - Date.now()) / 60000) : null,
      };
    });
    const shareAttainedPct = !shareOff && shareTargetGb > 0 ? (shareInFlightRamGb / shareTargetGb) * 100 : null;
    const skipWarnServers = memberResults.filter((mr) => mr.kind === "skipped" && !mr.saturated).map((mr) => mr.server);
    const stallWarn = result.members.length === 0 && candidates.length > 0;

    ns.write(
      DAEMON_STATUS_FILE,
      JSON.stringify(
        buildDaemonStatus({
          now: Date.now(),
          useFormulas,
          forcedLegacy,
          totalMaxRam,
          batchBudgetGb,
          hostsCount: hosts.length,
          targetsCount: targets.length,
          utilizationPct: utilization,
          members: statusMembers,
          draining: statusDraining,
          shareOff,
          shareTargetGb,
          shareInFlightRamGb,
          shareInFlightThreads,
          shareAttainedPct,
          sharePower,
          waterfallAvailableGb,
          prepping: preppedThisTick,
          stallWarn,
          skipWarnServers,
          failedLaunches,
        })
      ),
      "w"
    );

    // dashboard.js's targets panel source (see TARGETS_RANKING_FILE). targets
    // is already score-ordered by getTargets, and liveStates was populated for
    // every target earlier this tick -- before the sample===null continue, so
    // even targets excluded from candidates still carry a live entry here.
    const candidateCostGb = new Map(candidates.map((c) => [c.server, c.pipelineCostGb]));
    ns.write(
      TARGETS_RANKING_FILE,
      JSON.stringify(
        buildTargetsRanking(
          // `live`, not `ls` -- a local named `ls` matches ns.ls and the static
          // RAM analyzer charges its 0.20 GB on the name alone, never mind that
          // the receiver is a Map entry. Measured: 16.50 GB with `ls`, 16.30 GB
          // with `live`. Same class as CLAUDE.md's `state.share` phantom.
          targets.slice(0, TARGETS_RANKING_TOP_N).map((t) => {
            const live = liveStates.get(t.server);
            return {
              server: t.server,
              prepped: isPrepped(live),
              sec: live.currentSecurity,
              minSec: t.minSecurityLevel,
              money: live.currentMoney,
              maxMoney: t.maxMoney,
              score: t.score,
              // Why a target is or isn't seatable, exported so it can be read
              // without a live probe. pickBatchSet seats a candidate only when
              // pipelineCostGb <= the batch budget; when NO candidate fits, the
              // floor rule seats the highest-SCORED one, which is not
              // necessarily the cheapest. Without this field there is no way to
              // tell "the fleet is one tier short" from "every target is
              // wildly out of reach" -- exactly the question left open by the
              // 2026-07-24 cold-start deadlock. null = excluded from candidates
              // this tick (unhackable sample).
              pipelineCostGb: candidateCostGb.get(t.server) ?? null,
            };
          }),
          targets.length,
          Date.now()
        )
      ),
      "w"
    );

    // Per-member batch/skip events, each self-describing about set size via
    // memberCount. Prep dispatches aren't logged as events (never were --
    // only displayed), matching pre-Phase-7 behavior.
    for (const mr of memberResults) {
      if (mr.kind === "launched") {
        const info = memberReserve.get(mr.server);
        const member = membersByServer.get(mr.server);
        const liveState = liveStates.get(mr.server);
        const target = targetsByServer.get(mr.server);
        logEntries = appendLogEvent(logEntries, openSkipRecords, {
          event: "batch",
          time: new Date().toLocaleTimeString(),
          timestamp: Date.now(),
          batchTarget: mr.server,
          prepped: true,
          security: { current: liveState.currentSecurity, min: target.minSecurityLevel },
          money: { current: liveState.currentMoney, max: target.maxMoney },
          batchesInFlight: info.batchesInFlight,
          totalBatchesSkipped,
          totalBatchesShrunk,
          failedLaunches,
          pipeline: {
            depth: member.depth,
            reserveGb: info.reserveGb,
            commitmentPct: member.pipelineCostGb > 0 ? (info.inFlightRamGb / member.pipelineCostGb) * 100 : 0,
            waterfallAvailableGb,
          },
          utilizationPct: utilization,
          memberCount: result.members.length,
          batch: { id: mr.id, hackFraction: mr.fraction, hackChance: mr.hackChance, expectedSteal: mr.expectedSteal, jobs: mr.jobs },
        });
        openSkipRecords.delete(mr.server);
      } else if (mr.kind === "skipped") {
        const info = memberReserve.get(mr.server);
        const member = membersByServer.get(mr.server);
        logEntries = recordSkipEvent(logEntries, openSkipRecords, {
          time: new Date().toLocaleTimeString(),
          timestamp: Date.now(),
          batchTarget: mr.server,
          saturated: mr.saturated,
          batchesInFlight: info.batchesInFlight,
          pipeline: {
            depth: member.depth,
            reserveGb: info.reserveGb,
            commitmentPct: member.pipelineCostGb > 0 ? (info.inFlightRamGb / member.pipelineCostGb) * 100 : 0,
            waterfallAvailableGb,
          },
          utilizationPct: utilization,
        });
      }
    }

    // Utilization time series + full member snapshot, once per CYCLE_MS --
    // the primary evidence for multi-target acceptance criteria and the
    // dashboard-ready RAM-utilization series BACKLOG asked for.
    if (justRefreshed) {
      const draining = drainingServers.map((server) => ({
        server,
        batchesInFlight: postLaunchInFlight.byTarget[server].batches,
        inFlightRamGb: postLaunchInFlight.byTarget[server].ramGb,
      }));
      const shareAttainedPct = shareTargetGb > 0 ? (shareInFlightRamGb / shareTargetGb) * 100 : null;
      const snapshotRecord = {
        event: "snapshot",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        utilizationPct: utilization,
        budgetGb: totalMaxRam,
        batchBudgetGb,
        waterfallFreeGb: waterfallAvailableGb,
        memberCount: result.members.length,
        candidateCount: candidates.length, // Phase 15: candidateCount > 0 && memberCount === 0 is the stall signature verify:log now hard-fails on
        hackingLevel: ns.getHackingLevel(),
        members: result.members.map((m) => {
          const info = memberReserve.get(m.server);
          return {
            server: m.server,
            score: m.score,
            prepped: m.realPrepped,
            batchesInFlight: info.batchesInFlight,
            depth: m.depth,
            pipelineCostGb: m.pipelineCostGb,
            inFlightRamGb: info.inFlightRamGb,
            reserveGb: info.reserveGb,
            commitmentPct: m.pipelineCostGb > 0 ? (info.inFlightRamGb / m.pipelineCostGb) * 100 : 0,
            floor: m.pipelineCostGb > batchBudgetGb, // Phase 15: floor-seated (pickBatchSet's floor rule), same predicate as the display's FLOOR tag
          };
        }),
        sharePool: {
          targetGb: shareTargetGb,
          inFlightRamGb: shareInFlightRamGb,
          threads: shareInFlightThreads,
          attainedPct: shareAttainedPct,
          sharePower,
        },
        // Phase 20: from the existing post-launch sweep (no third sweep) --
        // the daemon never launches XP work itself, so there's nothing to
        // arithmetic-track between sweeps the way share's post-top-up state is.
        xpPool: postLaunchInFlight.xpPool,
      };
      if (draining.length > 0) snapshotRecord.draining = draining;
      logEntries = appendLogEvent(logEntries, openSkipRecords, snapshotRecord);
    }

    if (pendingImmediateFlush || Date.now() - lastLazyFlush >= LOG_FLUSH_INTERVAL_MS) {
      flushDaemonLog(ns, logEntries);
      lastLazyFlush = Date.now();
    }

    // Sparse hacking-level/XP sample for the Daedalus-2500 ETA series. Time-gated
    // (independent of the per-tick snapshot) so it spans hours-to-days in a small,
    // ring-trimmed file. exp is the smooth signal (level is integer-quantized), so a
    // rate fit works even between level-ups; level is the metric the gate is stated in.
    if (Date.now() - lastHackSample >= HACK_SAMPLE_INTERVAL_MS) {
      lastHackSample = Date.now();
      hackProgress.push({ timestamp: Date.now(), level: ns.getHackingLevel(), exp: ns.getPlayer().exp.hacking });
      if (hackProgress.length > HACK_PROGRESS_MAX_SAMPLES) hackProgress = hackProgress.slice(-HACK_PROGRESS_MAX_SAMPLES);
      ns.write(HACK_PROGRESS_FILE, JSON.stringify(hackProgress, null, 2), "w");
    }

    memberServers = result.members.map((m) => m.server);
    await ns.sleep(BATCH_INTERVAL_MS);
  }
}
