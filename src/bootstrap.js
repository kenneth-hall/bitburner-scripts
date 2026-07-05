// Phase 14: cold-start bootstrap deployer. Home-resident, runs while
// daemon.js can't yet fit on home (8GB reset home, 16.30GB daemon). Deploys
// bootloop.js copies to rooted network servers' RAM, retargets them via a
// re-scp'd control file (no kill/redeploy needed), and auto-hands off to
// daemon.js the moment home RAM fits it. Zero Singularity calls -- purchases
// stay manual; the nudge feature (S6) is tprint-only.
//
// Identifier hygiene (Phase 9's lesson): no identifier/property/object key
// here may exactly match an ns API function name unless it's a real ns call
// -- checked against NetscriptDefinitions.d.ts at implementation time.

import { getHosts } from "./hosts.js";
import { DRIFT_SEC_EPSILON, DRIFT_MONEY_FRACTION } from "./scheduler.js";
import { TOR_ROUTER_COST, PORT_OPENER_COSTS } from "./resourcemanager.js";

const POLL_MS = 10_000;
const CONTROL_FILE = "bootstrap-control.json";
const LOG_FILE = "bootstrap-log.json";
const LOG_MAX_ENTRIES = 500;
const BOOTLOOP_SCRIPT = "bootloop.js";
const DAEMON_SCRIPT = "daemon.js";
const KILLSCRIPTS_SCRIPT = "killscripts.js";

/**
 * Pure. Ranks bootstrap targets the same way targets.js's isEligibleTarget
 * does: requiredHackingLevel strictly under half the player's hacking level
 * (primary tier), falling back to requiredHackingLevel <= myHackLevel only
 * when the primary tier is empty (cold start, level 1). Picks the
 * highest-maxMoney candidate within whichever tier applied.
 * @param {{hostname: string, maxMoney: number, requiredHackingLevel: number}[]} candidates
 * @param {number} myHackLevel
 */
export function pickBootstrapTarget(candidates, myHackLevel) {
  const primary = candidates.filter((c) => c.requiredHackingLevel < myHackLevel / 2);
  const pool = primary.length > 0 ? primary : candidates.filter((c) => c.requiredHackingLevel <= myHackLevel);
  if (pool.length === 0) return null;
  return pool.reduce((best, c) => (c.maxMoney > best.maxMoney ? c : best));
}

/**
 * Pure. Per-host thread top-up: threads = floor(freeRam / bootloopRam),
 * zero-thread hosts dropped (covers home automatically -- getHosts holds
 * HOME_RESERVE_GB back, so home reports 0 free below a 32GB home).
 * @param {{hostname: string, freeRam: number}[]} hosts
 * @param {number} bootloopRam
 */
export function planBootDeployment(hosts, bootloopRam) {
  return hosts
    .map((h) => ({ hostname: h.hostname, threads: Math.floor(h.freeRam / bootloopRam) }))
    .filter((h) => h.threads > 0);
}

/**
 * Pure. Folds the imported drift constants into the S4 control-file shape.
 * @param {{target: string, minSecurityLevel: number, maxMoney: number}} params
 */
export function buildBootControl({ target, minSecurityLevel, maxMoney }) {
  return {
    target,
    minSecurityLevel,
    maxMoney,
    securityEpsilon: DRIFT_SEC_EPSILON,
    moneyFraction: DRIFT_MONEY_FRACTION,
  };
}

/**
 * Pure. First crossed-affordability item in ladder order: tor-router while
 * TOR is unowned, else the cheapest unowned PORT_OPENER_COSTS entry, else
 * null. The opener nudge's key is the opener's .file (not a constant), so an
 * announced-once Set at the call site distinguishes each rung as ownership
 * grows.
 * @param {{money: number, hasTor: boolean, ownedProgramFiles: Set<string>}} params
 */
export function nextPurchaseNudge({ money, hasTor, ownedProgramFiles }) {
  if (!hasTor) {
    return money >= TOR_ROUTER_COST ? { key: "tor-router", cost: TOR_ROUTER_COST } : null;
  }

  const unowned = PORT_OPENER_COSTS.filter((p) => !ownedProgramFiles.has(p.file));
  if (unowned.length === 0) return null;
  const cheapest = unowned.reduce((min, p) => (p.cost < min.cost ? p : min));
  return money >= cheapest.cost ? { key: cheapest.file, cost: cheapest.cost } : null;
}

/**
 * Pure. Handoff predicate: passes once daemon.js + killscripts.js together
 * fit in home's raw free RAM (not getHosts's reserve-adjusted figure, which
 * would never pass). "<=" so an exactly-fitting home passes.
 * @param {{daemonRam: number, killscriptsRam: number, homeFreeRam: number}} params
 */
export function shouldHandOff({ daemonRam, killscriptsRam, homeFreeRam }) {
  return daemonRam + killscriptsRam <= homeFreeRam;
}

/** Pure push+trim -- plain FIFO, same shape as resourcemanager.js's appendFinanceLog. */
export function appendBootLog(entries, record) {
  entries.push(record);
  if (entries.length > LOG_MAX_ENTRIES) entries.splice(0, entries.length - LOG_MAX_ENTRIES);
  return entries;
}

function tprintTs(ns, message) {
  ns.tprint(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function flushBootLog(ns, entries) {
  ns.write(LOG_FILE, JSON.stringify(entries, null, 2), "w");
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const bootloopRam = ns.getScriptRam(BOOTLOOP_SCRIPT, "home");

  let logEntries = [];
  let previousHostnames = new Set();
  let previousTarget = null;
  const announcedNudges = new Set();

  logEntries = appendBootLog(logEntries, {
    event: "startup",
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
    securityEpsilon: DRIFT_SEC_EPSILON,
    moneyFraction: DRIFT_MONEY_FRACTION,
    bootloopRam,
  });
  flushBootLog(ns, logEntries);

  let lastNudgeLabel = "none";
  let lastStatus = { target: null, tier: "-", totalThreads: 0, hostCount: 0 };

  while (true) {
    // --- Handoff check first: an idempotent bootstrap started when the
    // daemon already fits hands off on its very first poll, no deploy. ---
    const daemonRam = ns.getScriptRam(DAEMON_SCRIPT, "home");
    const killscriptsRam = ns.getScriptRam(KILLSCRIPTS_SCRIPT, "home");
    const homeFreeRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");

    if (shouldHandOff({ daemonRam, killscriptsRam, homeFreeRam })) {
      const pid = ns.exec(DAEMON_SCRIPT, "home", 1);
      if (pid > 0) {
        logEntries = appendBootLog(logEntries, {
          event: "handoff",
          time: new Date().toLocaleTimeString(),
          timestamp: Date.now(),
          homeFreeRam,
          daemonPid: pid,
        });
        flushBootLog(ns, logEntries);
        tprintTs(ns, `BOOTSTRAP: handed off to daemon.js (pid ${pid}) -- exiting`);
        return;
      }
      tprintTs(ns, `WARN: handoff exec returned pid 0 (daemon.js may already be running) -- still polling`);
      logEntries = appendBootLog(logEntries, {
        event: "handoff-blocked",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        homeFreeRam,
      });
      flushBootLog(ns, logEntries);
    }

    // --- Rooting + host discovery (getHosts nukes newly-rootable servers) ---
    const hosts = getHosts(ns);
    const currentHostnames = new Set(hosts.map((h) => h.hostname));
    const addedHosts = [...currentHostnames].filter((h) => !previousHostnames.has(h));
    const removedHosts = [...previousHostnames].filter((h) => !currentHostnames.has(h));
    if (addedHosts.length > 0 || removedHosts.length > 0) {
      logEntries = appendBootLog(logEntries, {
        event: "new-hosts",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        added: addedHosts,
        removed: removedHosts,
      });
      flushBootLog(ns, logEntries);
    }
    previousHostnames = currentHostnames;

    // --- Candidate build + target pick ---
    const myHackLevel = ns.getHackingLevel();
    const candidates = [];
    for (const host of hosts) {
      if (host.hostname === "home") continue;
      const maxMoney = ns.getServerMaxMoney(host.hostname);
      if (maxMoney <= 0) continue;
      candidates.push({
        hostname: host.hostname,
        maxMoney,
        requiredHackingLevel: ns.getServerRequiredHackingLevel(host.hostname),
      });
    }
    const pick = pickBootstrapTarget(candidates, myHackLevel);

    if (pick === null) {
      lastStatus = { target: null, tier: "-", totalThreads: 0, hostCount: 0 };
      ns.clearLog();
      ns.print(`===== bootstrap @ ${new Date().toLocaleTimeString()} =====`);
      ns.print("no eligible targets yet");
      await ns.sleep(POLL_MS);
      continue;
    }

    const primaryHasCandidates = candidates.some((c) => c.requiredHackingLevel < myHackLevel / 2);
    const tier = primaryHasCandidates ? "primary" : "fallback";

    if (previousTarget !== null && previousTarget !== pick.hostname) {
      logEntries = appendBootLog(logEntries, {
        event: "target-switch",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        from: previousTarget,
        to: pick.hostname,
        hackingLevel: myHackLevel,
      });
      flushBootLog(ns, logEntries);
    }
    previousTarget = pick.hostname;

    const minSecurityLevel = ns.getServerMinSecurityLevel(pick.hostname);
    const control = buildBootControl({ target: pick.hostname, minSecurityLevel, maxMoney: pick.maxMoney });
    ns.write(CONTROL_FILE, JSON.stringify(control), "w");

    const deployPlan = planBootDeployment(hosts, bootloopRam);
    const deployed = [];
    for (const planned of deployPlan) {
      ns.scp([CONTROL_FILE, BOOTLOOP_SCRIPT], planned.hostname);
      const pid = ns.exec(BOOTLOOP_SCRIPT, planned.hostname, planned.threads, Date.now());
      if (pid > 0) deployed.push({ host: planned.hostname, threads: planned.threads });
    }

    if (deployed.length > 0) {
      logEntries = appendBootLog(logEntries, {
        event: "deploy",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        target: pick.hostname,
        hosts: deployed,
        totalThreads: deployed.reduce((sum, d) => sum + d.threads, 0),
      });
      flushBootLog(ns, logEntries);
    }

    // --- Purchase nudge (tprint-only, no Singularity, no spends) ---
    const money = ns.getServerMoneyAvailable("home");
    const hasTor = ns.hasTorRouter();
    const ownedProgramFiles = new Set(PORT_OPENER_COSTS.filter((p) => ns.fileExists(p.file, "home")).map((p) => p.file));
    const nudge = nextPurchaseNudge({ money, hasTor, ownedProgramFiles });
    if (nudge !== null && !announcedNudges.has(nudge.key)) {
      announcedNudges.add(nudge.key);
      tprintTs(ns, `BOOTSTRAP: you can now afford ${nudge.key} ($${ns.format.number(nudge.cost)})`);
      logEntries = appendBootLog(logEntries, {
        event: "nudge",
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
        key: nudge.key,
        cost: nudge.cost,
      });
      flushBootLog(ns, logEntries);
      lastNudgeLabel = nudge.key;
    }

    lastStatus = {
      target: pick.hostname,
      tier,
      totalThreads: deployed.reduce((sum, d) => sum + d.threads, 0),
      hostCount: deployed.length,
    };

    ns.clearLog();
    ns.print(`===== bootstrap @ ${new Date().toLocaleTimeString()} =====`);
    ns.print(`target: ${lastStatus.target} (${lastStatus.tier}) | threads: ${lastStatus.totalThreads} on ${lastStatus.hostCount} host(s)`);
    ns.print(`last nudge: ${lastNudgeLabel}`);
    ns.print(`handoff headroom: need ${ns.format.ram(daemonRam + killscriptsRam)}, have ${ns.format.ram(homeFreeRam)} free on home`);

    await ns.sleep(POLL_MS);
  }
}
