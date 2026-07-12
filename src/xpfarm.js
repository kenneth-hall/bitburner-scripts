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
const HOLD_WEAKEN_FRAC = 0.16; // weaken share of each XP allocation (~14.1% analytic + margin)
const CRUSH_SEC_GAP = 5; // sec above min beyond which a target's whole allocation goes to weaken
const XP_TOP_N = 3; // simultaneous targets
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
 * Allocator: assigns each usable host (reserve-netted, claim-carved --
 * `hosts` carries only `{hostname, freeRam}`) wholly to one target,
 * round-robin over `targets`. A target whose current security exceeds
 * `minSec + crushSecGap` gets that host's ENTIRE slice as weaken ("crush",
 * driving a cold/drifted target back to min fast); otherwise the slice
 * splits `holdWeakenFrac` weaken / remainder hack, floored to whole threads,
 * weaken sized first -- either half drops silently if it floors to 0
 * threads. Hosts under one weaken thread's RAM are skipped entirely.
 * Deterministic; no ns.
 * @param {{hostname: string, freeRam: number}[]} hosts
 * @param {{server: string, sec: number, minSec: number}[]} targets
 * @param {Record<string, number>} ramCosts keyed by XP_SCRIPTS.hack/weaken
 * @param {{holdWeakenFrac: number, crushSecGap: number}} opts
 */
export function planXpJobs(hosts, targets, ramCosts, opts) {
  const { holdWeakenFrac, crushSecGap } = opts;
  const hackRam = ramCosts[XP_SCRIPTS.hack];
  const weakenRam = ramCosts[XP_SCRIPTS.weaken];
  const jobs = [];
  let hackThreads = 0;
  let weakenThreads = 0;

  if (targets.length === 0) return { jobs, hackThreads, weakenThreads };

  let targetIndex = 0;
  for (const host of hosts) {
    if (host.freeRam < weakenRam) continue;
    const target = targets[targetIndex % targets.length];
    targetIndex++;

    if (target.sec > target.minSec + crushSecGap) {
      const threads = Math.floor(host.freeRam / weakenRam);
      if (threads >= 1) {
        jobs.push({ hostname: host.hostname, script: XP_SCRIPTS.weaken, threads, target: target.server });
        weakenThreads += threads;
      }
      continue;
    }

    const wThreads = Math.floor((host.freeRam * holdWeakenFrac) / weakenRam);
    const remainingGb = host.freeRam - wThreads * weakenRam;
    const hThreads = Math.floor(remainingGb / hackRam);

    if (wThreads >= 1) {
      jobs.push({ hostname: host.hostname, script: XP_SCRIPTS.weaken, threads: wThreads, target: target.server });
      weakenThreads += wThreads;
    }
    if (hThreads >= 1) {
      jobs.push({ hostname: host.hostname, script: XP_SCRIPTS.hack, threads: hThreads, target: target.server });
      hackThreads += hThreads;
    }
  }

  return { jobs, hackThreads, weakenThreads };
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

    const targets = pickedTargets.map((t) => ({
      server: t.server,
      reqLevel: t.reqLevel,
      sec: ns.getServerSecurityLevel(t.server),
      minSec: ns.getServerMinSecurityLevel(t.server),
    }));

    const plan = planXpJobs(carvedPool, targets, ramCosts, { holdWeakenFrac: HOLD_WEAKEN_FRAC, crushSecGap: CRUSH_SEC_GAP });

    const scpDone = new Set();
    const perTarget = new Map(targets.map((t) => [t.server, { hackThreadsLaunched: 0, weakenThreadsLaunched: 0 }]));
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
      if (job.script === XP_SCRIPTS.hack) agg.hackThreadsLaunched += job.threads;
      else agg.weakenThreadsLaunched += job.threads;
    }

    ns.clearLog();
    ns.print(`===== xp farm @ ${new Date().toLocaleTimeString()} =====`);
    ns.print(
      `usable ${ns.format.ram(usableGb)} | claim ${ns.format.ram(claim.claimGb)} | lvl ${playerLevel} | ` +
        `+${ns.format.number(plan.hackThreads)}H/${ns.format.number(plan.weakenThreads)}W`
    );
    if (failedLaunches > 0) ns.print(`WARN: ${failedLaunches} launch(es) failed (exec returned pid 0)`);

    const targetLogEntries = [];
    for (const target of targets) {
      const mode = target.sec > target.minSec + CRUSH_SEC_GAP ? "crush" : "hold";
      const agg = perTarget.get(target.server);
      ns.print(
        `  ${target.server.padEnd(15)} req ${String(target.reqLevel).padStart(5)} ${mode.padEnd(5)} ` +
          `sec ${target.sec.toFixed(1)}/${target.minSec.toFixed(1)} | +${agg.hackThreadsLaunched}H/${agg.weakenThreadsLaunched}W`
      );
      targetLogEntries.push({
        server: target.server,
        reqLevel: target.reqLevel,
        mode,
        sec: target.sec,
        minSec: target.minSec,
        hackThreadsLaunched: agg.hackThreadsLaunched,
        weakenThreadsLaunched: agg.weakenThreadsLaunched,
      });
    }

    logEntries = appendXpLog(logEntries, {
      timestamp: Date.now(),
      time: new Date().toLocaleTimeString(),
      off: false,
      usableGb,
      claimGb: claim.claimGb,
      hackingLevel: playerLevel,
      targets: targetLogEntries,
    });
    ns.write(XP_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");

    await ns.sleep(LOOP_MS);
  }
}
