// Phase 20 production XP engine (replaces the Phase 20 MVP weaken-fill
// prototype -- its findings live in phase-20-xpfarm.features.md). Fills the
// fleet's *surplus* RAM -- whatever the money batcher and share pool leave
// unclaimed -- with fire-and-forget hack workers against the highest-
// difficulty eligible servers, holding those servers at minimum security
// with a minority weaken allocation. The batcher keeps first claim on the
// fleet every tick; this engine only spends what's left over, so it
// self-scales from near-zero on a busy young fleet to near-total on an idle
// endgame one. Full design: phase-20-xpfarm.spec.md.
//
// Distinct worker filenames (xphack.js/xpweaken.js, see scheduler.js's
// XP_SCRIPTS) keep the money batcher's inFlightByTarget sweep structurally
// blind to this engine's processes (spec S1) -- no shared accounting, no
// batch-timing interaction, no HWGW awareness needed here at all.
//
// Toggle: `xp-off.txt` on home (checked every pass, 0 GB) suppresses new
// launches; in-flight workers decay naturally (fire-and-forget, no kill
// sweep). Run: launched automatically by daemon.js's companion block.
import { listHosts } from "./hosts.js";
import { scanNetwork } from "./common.js";
import { XP_SCRIPTS, carveReservation } from "./scheduler.js";

const LOOP_MS = 10_000;
const XP_RESERVE_FRAC = 0.05; // per-host headroom for the batcher's next-tick launches
const CRUSH_SEC_GAP = 5; // sec above min beyond which a target gets a sized crush volley (S8)
const WEAKEN_SEC_PER_THREAD = 0.05; // 1-core threads; home's core bonus only over-delivers (harmless)
const CRUSH_OVERSIZE = 1.1; // volley sizing margin over the measured gap (S8)
const HACK_SEC_PER_THREAD = 0.002; // hack's sec-add per thread per completion (S9)
const HOLD_OVERSIZE = 1.25; // hold-stream margin over the exact wave offset; floors at min harmlessly (S9)
const HOLD_HACK_WAVE = Math.floor(CRUSH_SEC_GAP / HACK_SEC_PER_THREAD); // 2,500 -- one landing wave <= one gap (S9)
const XP_OVERFLOW_ENABLED = true; // surplus beyond every held demand goes to targets[0] as pure hack (S9)
const XP_TOP_N = 4; // was 3 (S9): one overflow absorber + three fully-held targets
const SNAPSHOT_STALE_MS = 60_000; // batcher snapshot older than this => daemon not running, claim 0
const XP_OFF_MARKER = "xp-off.txt";
const XP_LOG_FILE = "xpfarm-log.json";
const XP_LOG_MAX_ENTRIES = 2000;

// Mirrors daemon.js's own (unexported) DAEMON_LOG_FILE constant -- this
// engine reads the batcher's log as a plain file, not an import (daemon.js's
// module has a live main() loop; importing it would run a second daemon).
const DAEMON_LOG_FILE = "daemon-batch-log.json";

/**
 * Parses `daemon-batch-log.json`'s raw contents and returns the batcher's
 * unmet forward claim from the newest `snapshot` event: the pipeline RAM
 * members intend to commit but haven't launched yet (`sum(members[].reserveGb)`)
 * plus share's top-up gap (`max(0, sharePool.targetGb - sharePool.inFlightRamGb)`).
 * `claimedServers` is every member and draining server, for target exclusion.
 *
 * Missing/empty content, malformed JSON, no snapshot event, or a snapshot
 * older than SNAPSHOT_STALE_MS (daemon not running, or just started) all
 * collapse to a zero claim -- not an error, just "nothing to protect from".
 * A snapshot with no `draining` field is the normal steady state (the daemon
 * only attaches it when non-empty), not malformed -- absent means empty.
 * @param {string} raw
 * @param {number} now
 */
export function latestBatcherClaim(raw, now) {
  const empty = { claimGb: 0, claimedServers: [] };
  if (!raw) return empty;

  let entries;
  try {
    entries = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!Array.isArray(entries)) return empty;

  let snapshot = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].event === "snapshot") {
      snapshot = entries[i];
      break;
    }
  }
  if (!snapshot) return empty;
  if (now - snapshot.timestamp > SNAPSHOT_STALE_MS) return empty;

  const members = snapshot.members ?? [];
  const draining = snapshot.draining ?? [];
  const sharePool = snapshot.sharePool ?? { targetGb: 0, inFlightRamGb: 0 };

  const claimGb = members.reduce((sum, m) => sum + (m.reserveGb ?? 0), 0) + Math.max(0, (sharePool.targetGb ?? 0) - (sharePool.inFlightRamGb ?? 0));
  const claimedServers = [...new Set([...members.map((m) => m.server), ...draining.map((d) => d.server)])];

  return { claimGb, claimedServers };
}

/**
 * Nets each host by `reserveFrac * maxRam`, clamped at 0 -- the per-host
 * headroom that must be applied BEFORE the claim carve (spec S2's binding
 * order), so downstream functions need only `freeRam`. Preserves input
 * order; does not mutate.
 * @param {{hostname: string, freeRam: number, maxRam: number}[]} hosts
 * @param {number} reserveFrac
 */
export function applyXpReserve(hosts, reserveFrac) {
  return hosts.map((h) => ({ hostname: h.hostname, freeRam: Math.max(0, h.freeRam - reserveFrac * h.maxRam) }));
}

/**
 * Pure filter+sort: rooted, `reqLevel <= playerLevel`, `maxMoney > 0`, not
 * batcher-claimed -- sorted by reqLevel descending (highest exp/op first),
 * top `topN`.
 * @param {{server: string, reqLevel: number, maxMoney: number, rooted: boolean}[]} candidates
 * @param {string[]} claimedServers
 * @param {number} topN
 * @param {number} playerLevel
 */
export function pickXpTargets(candidates, claimedServers, topN, playerLevel) {
  const claimed = new Set(claimedServers);
  return candidates
    .filter((c) => c.rooted && c.reqLevel <= playerLevel && c.maxMoney > 0 && !claimed.has(c.server))
    .sort((a, b) => b.reqLevel - a.reqLevel)
    .slice(0, topN);
}

/**
 * Allocator (S9): demand-driven packing across the FULL shared host pool --
 * no more per-target host assignment. Demands are packed in priority order,
 * each one greedily from the first host with room, spilling to later hosts
 * as needed (a demand the pool can't fully cover lands partially --
 * converges/self-corrects over subsequent passes, not a bug); hosts under
 * one thread's RAM for a given demand are skipped for it.
 *
 * (a) Sized, cooldown-gated crush volleys (S8, unchanged): a target whose
 *     current security exceeds `minSec + crushSecGap` AND is not in
 *     cooldown (`target.crushOk`) gets `ceil((sec - minSec) /
 *     weakenSecPerThread * crushOversize)` weaken threads (kind "volley").
 * (b) Held weaken streams, sized to the wave they must offset (spec point
 *     3): for an under-gap target, to the hack wave actually achievable
 *     this pass (peeked against the post-volley pool, before any stream or
 *     wave consumes anything -- `min(holdHackWave, capacity)`); for an
 *     over-gap target (no hack wave this pass -- see (c)), to the FULL
 *     `holdHackWave`, so its stream is established before its cooldown
 *     clears. `w = ceil(h * hackSecPerThread / weakenSecPerThread *
 *     holdOversize)` (kind "hold").
 * (c) Held hack waves, capped at `holdHackWave` threads per target per
 *     pass, summed across every host that contributes (spec point 2) --
 *     an over-gap target gets none, its capacity falls through to (d)
 *     (spec point 4, keyed on the sec reading, not the crush/crush-wait
 *     split).
 * (d) Overflow: when `opts.overflowEnabled`, everything left over goes to
 *     `targets[0]` (highest reqLevel) as pure hack (kind "overflow"),
 *     ignoring the cap/gap/cooldown entirely (spec point 5).
 *
 * Deterministic; no ns.
 * @param {{hostname: string, freeRam: number}[]} hosts
 * @param {{server: string, sec: number, minSec: number, crushOk: boolean}[]} targets sorted by reqLevel desc; targets[0] is the overflow absorber
 * @param {Record<string, number>} ramCosts keyed by XP_SCRIPTS.hack/weaken
 * @param {{crushSecGap: number, weakenSecPerThread: number, crushOversize: number, hackSecPerThread: number, holdOversize: number, holdHackWave: number, overflowEnabled: boolean}} opts
 */
export function planXpJobs(hosts, targets, ramCosts, opts) {
  const { crushSecGap, weakenSecPerThread, crushOversize, hackSecPerThread, holdOversize, holdHackWave, overflowEnabled } = opts;
  const hackRam = ramCosts[XP_SCRIPTS.hack];
  const weakenRam = ramCosts[XP_SCRIPTS.weaken];
  const jobs = [];
  let hackThreads = 0;
  let weakenThreads = 0;
  let volleyThreads = 0;
  let overflowHackThreads = 0;

  const empty = { jobs, hackThreads, weakenThreads, volleyThreads, overflowHackThreads };
  if (targets.length === 0 || hosts.length === 0) return empty;

  const pool = hosts.map((h) => ({ hostname: h.hostname, freeRam: h.freeRam }));

  // Packs up to `count` threads of `threadRam` GB each, greedily from the
  // first host with room, spilling to later ones; mutates the pool. Returns
  // the actual number of threads placed (< count when the pool runs out).
  function draw(threadRam, count, emit) {
    let placed = 0;
    for (let i = 0; i < pool.length && placed < count; i++) {
      const host = pool[i];
      if (host.freeRam < threadRam) continue;
      const take = Math.min(Math.floor(host.freeRam / threadRam), count - placed);
      if (take < 1) continue;
      emit(host.hostname, take);
      host.freeRam -= take * threadRam;
      placed += take;
    }
    return placed;
  }

  // Non-mutating read of how many `threadRam`-sized threads the pool could
  // currently afford, capped at `cap` -- used to size a stream ahead of its
  // own wave without reserving anything.
  function peekCapacity(threadRam, cap) {
    let total = 0;
    for (const host of pool) {
      if (total >= cap) break;
      if (host.freeRam >= threadRam) total += Math.floor(host.freeRam / threadRam);
    }
    return Math.min(total, cap);
  }

  const overGap = new Map(targets.map((t) => [t.server, t.sec > t.minSec + crushSecGap]));

  // (a) sized, cooldown-gated crush volleys
  for (const t of targets) {
    if (!overGap.get(t.server) || !t.crushOk) continue;
    const needed = Math.ceil(((t.sec - t.minSec) / weakenSecPerThread) * crushOversize);
    if (needed < 1) continue;
    const placed = draw(weakenRam, needed, (hostname, threads) => {
      jobs.push({ hostname, script: XP_SCRIPTS.weaken, threads, target: t.server, kind: "volley" });
    });
    weakenThreads += placed;
    volleyThreads += placed;
  }

  // (b) held weaken streams -- sized against the wave each target is about
  // to receive, peeked from the post-volley pool before any stream/wave
  // consumes it (all targets peek the same untouched pool; a RAM-starved
  // multi-target pass slightly over-sizes later targets' streams -- rare,
  // self-correcting per spec).
  const plannedWave = new Map();
  for (const t of targets) {
    plannedWave.set(t.server, overGap.get(t.server) ? holdHackWave : peekCapacity(hackRam, holdHackWave));
  }
  for (const t of targets) {
    const h = plannedWave.get(t.server);
    const w = Math.ceil(((h * hackSecPerThread) / weakenSecPerThread) * holdOversize);
    if (w < 1) continue;
    const placed = draw(weakenRam, w, (hostname, threads) => {
      jobs.push({ hostname, script: XP_SCRIPTS.weaken, threads, target: t.server, kind: "hold" });
    });
    weakenThreads += placed;
  }

  // (c) held hack waves -- over-gap targets get none this pass
  for (const t of targets) {
    if (overGap.get(t.server)) continue;
    const cap = Math.min(holdHackWave, plannedWave.get(t.server));
    if (cap < 1) continue;
    const placed = draw(hackRam, cap, (hostname, threads) => {
      jobs.push({ hostname, script: XP_SCRIPTS.hack, threads, target: t.server });
    });
    hackThreads += placed;
  }

  // (d) overflow -- everything left goes to targets[0] as pure hack
  if (overflowEnabled) {
    const absorber = targets[0].server;
    const placed = draw(hackRam, Infinity, (hostname, threads) => {
      jobs.push({ hostname, script: XP_SCRIPTS.hack, threads, target: absorber, kind: "overflow" });
    });
    hackThreads += placed;
    overflowHackThreads += placed;
  }

  return { jobs, hackThreads, weakenThreads, volleyThreads, overflowHackThreads };
}

/** Ring-trims XP_LOG_FILE's in-memory buffer to XP_LOG_MAX_ENTRIES, no pinning needed (no config record to preserve). */
function appendXpLog(entries, record) {
  entries.push(record);
  if (entries.length > XP_LOG_MAX_ENTRIES) entries = entries.slice(entries.length - XP_LOG_MAX_ENTRIES);
  return entries;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const ramCosts = {
    [XP_SCRIPTS.hack]: ns.getScriptRam(XP_SCRIPTS.hack, "home"),
    [XP_SCRIPTS.weaken]: ns.getScriptRam(XP_SCRIPTS.weaken, "home"),
  };
  let uid = 0;
  let logEntries = [];
  // Per-target crush-volley cooldown (S8): server -> timestamp before which no
  // further volley is launched at that target. Plain in-memory Map -- an
  // engine restart loses it (worst case one duplicate sized volley, bounded),
  // and a daemon restart kills the workers and the engine together
  // (killscripts sweep), so ledger and in-flight state always reset coherently.
  const crushUntil = new Map();

  while (true) {
    const off = ns.fileExists(XP_OFF_MARKER, "home");
    if (off) {
      ns.clearLog();
      ns.print(`xp: OFF (${XP_OFF_MARKER})`);
      logEntries = appendXpLog(logEntries, {
        timestamp: Date.now(),
        time: new Date().toLocaleTimeString(),
        off: true,
        usableGb: 0,
        claimGb: 0,
        hackingLevel: ns.getHackingLevel(),
        targets: [],
      });
      ns.write(XP_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");
      await ns.sleep(LOOP_MS);
      continue;
    }

    const claim = latestBatcherClaim(ns.read(DAEMON_LOG_FILE), Date.now());

    const candidates = [];
    for (const server of scanNetwork(ns)) {
      candidates.push({
        server,
        rooted: ns.hasRootAccess(server),
        reqLevel: ns.getServerRequiredHackingLevel(server),
        maxMoney: ns.getServerMaxMoney(server),
      });
    }
    const playerLevel = ns.getHackingLevel();
    const pickedTargets = pickXpTargets(candidates, claim.claimedServers, XP_TOP_N, playerLevel);

    if (pickedTargets.length === 0) {
      ns.clearLog();
      ns.print(`===== xp farm @ ${new Date().toLocaleTimeString()} =====`);
      ns.print("no eligible XP target");
      logEntries = appendXpLog(logEntries, {
        timestamp: Date.now(),
        time: new Date().toLocaleTimeString(),
        off: false,
        usableGb: 0,
        claimGb: claim.claimGb,
        hackingLevel: playerLevel,
        targets: [],
      });
      ns.write(XP_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");
      await ns.sleep(LOOP_MS);
      continue;
    }

    const hosts = listHosts(ns);
    const reserved = applyXpReserve(hosts, XP_RESERVE_FRAC);
    const carvedPool = carveReservation(reserved, claim.claimGb);
    const usableGb = carvedPool.reduce((sum, h) => sum + h.freeRam, 0);

    const now = Date.now();
    const targets = pickedTargets.map((t) => ({
      server: t.server,
      reqLevel: t.reqLevel,
      sec: ns.getServerSecurityLevel(t.server),
      minSec: ns.getServerMinSecurityLevel(t.server),
      crushOk: now >= (crushUntil.get(t.server) ?? 0),
    }));

    const plan = planXpJobs(carvedPool, targets, ramCosts, {
      crushSecGap: CRUSH_SEC_GAP,
      weakenSecPerThread: WEAKEN_SEC_PER_THREAD,
      crushOversize: CRUSH_OVERSIZE,
      hackSecPerThread: HACK_SEC_PER_THREAD,
      holdOversize: HOLD_OVERSIZE,
      holdHackWave: HOLD_HACK_WAVE,
      overflowEnabled: XP_OVERFLOW_ENABLED,
    });

    const scpDone = new Set();
    const perTarget = new Map(
      targets.map((t) => [t.server, { hackThreadsLaunched: 0, weakenThreadsLaunched: 0, volleyThreadsLaunched: 0, overflowHackThreadsLaunched: 0 }])
    );
    let failedLaunches = 0;

    for (const job of plan.jobs) {
      if (!scpDone.has(job.hostname)) {
        ns.scp([XP_SCRIPTS.hack, XP_SCRIPTS.weaken], job.hostname, "home");
        scpDone.add(job.hostname);
      }
      const pid = ns.exec(job.script, job.hostname, job.threads, job.target, uid++);
      if (pid === 0) {
        failedLaunches++;
        continue;
      }
      const agg = perTarget.get(job.target);
      if (job.script === XP_SCRIPTS.hack) {
        if (job.kind === "overflow") agg.overflowHackThreadsLaunched += job.threads;
        else agg.hackThreadsLaunched += job.threads;
      } else {
        agg.weakenThreadsLaunched += job.threads;
        if (job.kind === "volley") agg.volleyThreadsLaunched += job.threads;
      }
    }

    // A volley that actually launched (>=1 thread, real pid) starts this
    // target's cooldown -- until it passes, re-reading the same drifted sec
    // every pass would just re-crush it (the pathology the live burst caught).
    for (const target of targets) {
      if (perTarget.get(target.server).volleyThreadsLaunched > 0) {
        crushUntil.set(target.server, now + ns.getWeakenTime(target.server) + LOOP_MS);
      }
    }

    ns.clearLog();
    ns.print(`===== xp farm @ ${new Date().toLocaleTimeString()} =====`);
    ns.print(
      `usable ${ns.format.ram(usableGb)} | claim ${ns.format.ram(claim.claimGb)} | lvl ${playerLevel} | ` +
        `+${ns.format.number(plan.hackThreads)}H/${ns.format.number(plan.weakenThreads)}W`
    );
    if (failedLaunches > 0) ns.print(`WARN: ${failedLaunches} launch(es) failed (exec returned pid 0)`);

    const targetLogEntries = [];
    let overflowGb = 0;
    for (const target of targets) {
      const overGap = target.sec > target.minSec + CRUSH_SEC_GAP;
      const mode = overGap ? (target.crushOk ? "crush" : "crush-wait") : "hold";
      const agg = perTarget.get(target.server);
      overflowGb += agg.overflowHackThreadsLaunched * ramCosts[XP_SCRIPTS.hack];
      ns.print(
        `  ${target.server.padEnd(15)} req ${String(target.reqLevel).padStart(5)} ${mode.padEnd(10)} ` +
          `sec ${target.sec.toFixed(1)}/${target.minSec.toFixed(1)} | +${agg.hackThreadsLaunched}H/${agg.weakenThreadsLaunched}W` +
          (agg.volleyThreadsLaunched > 0 ? ` (vol ${agg.volleyThreadsLaunched})` : "") +
          (agg.overflowHackThreadsLaunched > 0 ? ` ovf ${ns.format.number(agg.overflowHackThreadsLaunched)}` : "")
      );
      targetLogEntries.push({
        server: target.server,
        reqLevel: target.reqLevel,
        mode,
        sec: target.sec,
        minSec: target.minSec,
        hackThreadsLaunched: agg.hackThreadsLaunched,
        weakenThreadsLaunched: agg.weakenThreadsLaunched,
        volleyThreadsLaunched: agg.volleyThreadsLaunched,
        overflowHackThreadsLaunched: agg.overflowHackThreadsLaunched,
      });
    }

    logEntries = appendXpLog(logEntries, {
      timestamp: Date.now(),
      time: new Date().toLocaleTimeString(),
      off: false,
      usableGb,
      claimGb: claim.claimGb,
      hackingLevel: playerLevel,
      overflowGb,
      targets: targetLogEntries,
    });
    ns.write(XP_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");

    await ns.sleep(LOOP_MS);
  }
}
