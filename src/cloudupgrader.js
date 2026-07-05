// Phase 10: financemanager.js's first customer. Spends *available* cash
// (live money minus financemanager.js's reservations) upgrading owned cloud
// servers one power-of-2 tier at a time. Upgrade only -- never purchases a
// new server (that stays reserved-for, see financemanager.js's
// bootstrap-server rule) and never renames one (Phase 7's live session
// recorded upgradecloudserver.js's rename/recreate disrupting the daemon;
// an auto-upgrader doing that continuously would make it chronic --
// upgradecloudserver.js/fleetupgrade.js remain the manual rename paths).
//
// Zero Singularity calls, same hard constraint as financemanager.js.
//
// Fail-safe: no finance state (missing, unparseable, or stale) means
// spend nothing -- this script never guesses at reservations.

import { recordTransaction } from "./translog.js";

const POLL_MS = 10_000;
const STALE_MS = 15_000; // >7 finance-manager polls (POLL_MS=2000 there)
const OFF_MARKER = "cloud-upgrade-off.txt";
const FINANCE_STATE_FILE = "finance-state.json";

/**
 * Pure. Picks the next upgrade: lowest current RAM first, ties broken by
 * list order (the cheapest single move, and it levels the fleet toward
 * uniform host sizes, which the batcher's job-per-single-host assignment
 * likes -- matches fleetupgrade.js's laggard-first philosophy). Servers
 * already at ramLimit are excluded. Returns null when the fleet is empty or
 * every server is already maxed.
 */
export function planNextUpgrade(fleet, ramLimit) {
  const upgradable = fleet.filter((s) => s.ram < ramLimit);
  if (upgradable.length === 0) return null;

  let best = upgradable[0];
  for (let i = 1; i < upgradable.length; i++) {
    if (upgradable[i].ram < best.ram) best = upgradable[i];
  }
  return { hostname: best.hostname, nextTier: best.ram * 2 };
}

/** Pure. Missing/null timestamp is always stale -- no finance manager running yet counts as stale. */
export function isStateStale(stateTimestamp, now, staleMs) {
  if (stateTimestamp === null || stateTimestamp === undefined) return true;
  return now - stateTimestamp > staleMs;
}

function tprintTs(ns, message) {
  ns.tprint(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function readFinanceState(ns) {
  const raw = ns.read(FINANCE_STATE_FILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  let wasStale = true; // starts "stale" so the very first real state clears it without a spurious WARN
  let lastUpgrade = null; // {hostname, fromRam, toRam, cost, time}

  while (true) {
    const timeLabel = new Date().toLocaleTimeString();

    if (ns.fileExists(OFF_MARKER, "home")) {
      ns.clearLog();
      ns.print(`===== cloud upgrader @ ${timeLabel} =====`);
      ns.print(`PAUSED (${OFF_MARKER} present)`);
      await ns.sleep(POLL_MS);
      continue;
    }

    const state = readFinanceState(ns);
    const stale = isStateStale(state?.timestamp ?? null, Date.now(), STALE_MS);

    if (stale) {
      if (!wasStale) tprintTs(ns, "WARN: finance state stale/missing -- spending nothing until it recovers");
      wasStale = true;
      ns.clearLog();
      ns.print(`===== cloud upgrader @ ${timeLabel} =====`);
      ns.print(`finance state ${state ? "stale" : "missing"} -- spending nothing`);
      await ns.sleep(POLL_MS);
      continue;
    }
    if (wasStale) tprintTs(ns, "INFO: finance state recovered -- resuming");
    wasStale = false;

    let availableCash = Math.max(0, ns.getPlayer().money - state.totalReserved);
    const ramLimit = ns.cloud.getRamLimit();

    while (true) {
      const owned = ns.cloud.getServerNames();
      if (owned.length === 0) break;

      const fleet = owned.map((hostname) => ({ hostname, ram: ns.getServerMaxRam(hostname) }));
      const plan = planNextUpgrade(fleet, ramLimit);
      if (plan === null) break;

      const cost = ns.cloud.getServerUpgradeCost(plan.hostname, plan.nextTier);
      if (cost < 0) {
        tprintTs(ns, `WARN: getServerUpgradeCost(${plan.hostname}, ${plan.nextTier}) returned negative -- skipping this poll`);
        break;
      }

      const liveMoney = ns.getPlayer().money; // fresh read -- money may have moved since the top of this poll
      if (cost > availableCash || cost > liveMoney) break;

      const fromRam = ns.getServerMaxRam(plan.hostname);
      const ok = ns.cloud.upgradeServer(plan.hostname, plan.nextTier);
      if (!ok) {
        // The world disagrees with our inputs (cost moved, server state
        // changed) -- retrying the same pick synchronously here would be an
        // unbounded loop in a no-await section, i.e. a game-freezing hang.
        // Break and let the next poll re-derive everything fresh.
        tprintTs(ns, `WARN: upgradeServer(${plan.hostname}, ${plan.nextTier}) returned false -- stopping this poll's upgrade loop`);
        break;
      }

      const nowMs = Date.now();
      recordTransaction(ns, {
        type: "expense",
        source: "auto-cloud-upgrade",
        hostname: plan.hostname,
        detail: `${fromRam}GB -> ${plan.nextTier}GB`,
        amount: cost,
        timestamp: nowMs,
        time: new Date(nowMs).toLocaleTimeString(),
      });
      tprintTs(ns, `CLOUDUPGRADE: ${plan.hostname} ${ns.format.ram(fromRam)} -> ${ns.format.ram(plan.nextTier)} for $${ns.format.number(cost)}`);

      availableCash -= cost;
      lastUpgrade = { hostname: plan.hostname, fromRam, toRam: plan.nextTier, cost, time: new Date(nowMs).toLocaleTimeString() };
    }

    const owned = ns.cloud.getServerNames();
    const fleet = owned.map((hostname) => ({ hostname, ram: ns.getServerMaxRam(hostname) }));
    const nextPlan = planNextUpgrade(fleet, ramLimit);
    const nextCost = nextPlan ? ns.cloud.getServerUpgradeCost(nextPlan.hostname, nextPlan.nextTier) : null;

    ns.clearLog();
    ns.print(`===== cloud upgrader @ ${timeLabel} =====`);
    ns.print(`available: $${ns.format.number(availableCash)} | reserved: $${ns.format.number(state.totalReserved)}`);
    if (fleet.length === 0) {
      ns.print("no cloud servers owned");
    } else {
      const minRam = Math.min(...fleet.map((f) => f.ram));
      const maxRam = Math.max(...fleet.map((f) => f.ram));
      ns.print(`fleet: ${fleet.length} server(s), ${ns.format.ram(minRam)} - ${ns.format.ram(maxRam)}`);
    }
    if (nextPlan) {
      const affordable = nextCost !== null && nextCost <= availableCash;
      ns.print(
        `next: ${nextPlan.hostname} -> ${ns.format.ram(nextPlan.nextTier)} for $${ns.format.number(nextCost)}` +
          (affordable ? "" : " (can't afford yet)")
      );
    } else if (fleet.length > 0) {
      ns.print("fleet maxed -- all servers at the RAM limit");
    }
    if (lastUpgrade) {
      ns.print(
        `last upgrade: ${lastUpgrade.hostname} ${ns.format.ram(lastUpgrade.fromRam)} -> ${ns.format.ram(lastUpgrade.toRam)} ` +
          `for $${ns.format.number(lastUpgrade.cost)} @ ${lastUpgrade.time}`
      );
    }

    await ns.sleep(POLL_MS);
  }
}
