// Cloud fleet manager (Phase 11 rename + extension of cloudupgrader.js).
// Always-on, cheap ns.cloud surface, zero Singularity calls (same hard
// constraint as resourcemanager.js). Absorbs cloud *purchasing* alongside
// the Phase 10 upgrade behavior -- it purchases now, it still never renames
// (Phase 7's live session recorded upgradecloudserver.js's rename/recreate
// disrupting the daemon; an auto-manager doing that continuously would make
// it chronic -- upgradecloudserver.js/fleetupgrade.js/renamecloudservers.js
// remain the manual rename paths).
//
// Per poll, in order: (1) bootstrap buy -- the first cloud server, if the
// fleet is empty, funded from live money (this is the fulfiller of
// resourcemanager.js's own bootstrap-server reservation, so it deliberately
// ignores that reservation rather than gating on it -- see the phase 11
// spec's Reservation model); (2) upgrade -- Phase 10 behavior verbatim,
// lowest-RAM-first, spending only available cash; (3) growth buy -- a new
// 16GB server, once every owned server is maxed and a purchase slot is free,
// also spending only available cash. Auto-bought servers are named
// cloud-<n> (nextCloudName, mirrors renamecloudservers.js's idempotent
// scheme) so they never need the manual rename utility.
//
// Fail-safe: no finance state (missing, unparseable, or stale) means spend
// nothing at all (bootstrap included) -- this script never guesses at
// reservations. cloud-upgrade-off.txt (name kept from Phase 10) now pauses
// every kind of spending here, not just upgrades.

import { recordTransaction } from "./translog.js";
import { tprintTs } from "./common.js";
import { isStateStale, readFinanceState } from "./financestate.js";

const POLL_MS = 10_000;
const STALE_MS = 15_000; // >7 resource-manager polls (POLL_MS=2000 there)
const OFF_MARKER = "cloud-upgrade-off.txt";
const BOOTSTRAP_RAM = 2;
const GROWTH_RAM = 16;
const CLOUD_NAME_PATTERN = /^cloud-(\d+)$/;

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

/**
 * Pure. True only when every owned server is maxed out AND a purchase slot
 * is free -- an empty fleet never triggers a growth buy (that's the
 * bootstrap step's job). Mirrors renamecloudservers.js's philosophy of never
 * acting on an empty/undersized signal by accident.
 */
export function shouldBuyGrowthServer(fleet, ramLimit, serverLimit) {
  if (fleet.length === 0) return false;
  if (fleet.length >= serverLimit) return false;
  return fleet.every((s) => s.ram >= ramLimit);
}

/**
 * Pure. Lowest free cloud-<n> index across ownedNames -- names not matching
 * the pattern (e.g. legacy pserv-*) claim nothing. Mirrors
 * renamecloudservers.js's nextIndex exactly, so a later manual rename run
 * stays idempotent alongside auto-bought servers.
 *
 * Uses String.match, not RegExp.exec -- the RAM analyzer charges the full
 * ns.exec (1.30 GB) for any literal ".exec(" in the script, regardless of
 * what it's actually called on (Phase 9's identifier-hygiene lesson).
 */
export function nextCloudName(ownedNames) {
  const usedIndices = new Set();
  for (const name of ownedNames) {
    const match = name.match(CLOUD_NAME_PATTERN);
    if (match) usedIndices.add(Number(match[1]));
  }
  let index = 0;
  while (usedIndices.has(index)) index++;
  return `cloud-${index}`;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  let wasStale = true; // starts "stale" so the very first real state clears it without a spurious WARN
  let lastUpgrade = null; // {hostname, fromRam, toRam, cost, time}
  let lastBootstrapBuy = null; // {hostname, cost, time}
  let lastGrowthBuy = null; // {hostname, cost, time}
  let bootstrapFailing = false; // WARN-once-per-transition tracking, bootstrap purchaseServer()
  let growthFailing = false; // same, growth-buy purchaseServer()

  while (true) {
    const timeLabel = new Date().toLocaleTimeString();

    if (ns.fileExists(OFF_MARKER, "home")) {
      ns.clearLog();
      ns.print(`===== cloud manager @ ${timeLabel} =====`);
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
      ns.print(`===== cloud manager @ ${timeLabel} =====`);
      ns.print(`finance state ${state ? "stale" : "missing"} -- spending nothing`);
      await ns.sleep(POLL_MS);
      continue;
    }
    if (wasStale) tprintTs(ns, "INFO: finance state recovered -- resuming");
    wasStale = false;

    let availableCash = Math.max(0, ns.getPlayer().money - state.totalReserved);
    const ramLimit = ns.cloud.getRamLimit();
    const serverLimit = ns.cloud.getServerLimit();

    // Step 1: bootstrap buy -- funded from live money, ignoring reservations
    // entirely (this script is the fulfiller of resourcemanager.js's own
    // bootstrap-server reservation; gating on it would be circular).
    let bootstrapStatus = null;
    if (ns.cloud.getServerNames().length === 0) {
      const cost = ns.cloud.getServerCost(BOOTSTRAP_RAM);
      const liveMoney = ns.getPlayer().money;
      if (liveMoney >= cost) {
        const name = nextCloudName(ns.cloud.getServerNames());
        const hostname = ns.cloud.purchaseServer(name, BOOTSTRAP_RAM);
        if (hostname === "") {
          if (!bootstrapFailing) tprintTs(ns, `WARN: purchaseServer(${name}, ${BOOTSTRAP_RAM}) returned empty string -- retrying next poll`);
          bootstrapFailing = true;
          bootstrapStatus = { waiting: false, failing: true, cost };
        } else {
          bootstrapFailing = false;
          const nowMs = Date.now();
          recordTransaction(ns, {
            type: "expense",
            source: "auto-cloud-purchase",
            hostname,
            ram: BOOTSTRAP_RAM,
            amount: cost,
            timestamp: nowMs,
            time: new Date(nowMs).toLocaleTimeString(),
          });
          tprintTs(ns, `CLOUDBUY: ${hostname} (${ns.format.ram(BOOTSTRAP_RAM)}) for $${ns.format.number(cost)} -- bootstrap foothold`);
          lastBootstrapBuy = { hostname, cost, time: new Date(nowMs).toLocaleTimeString() };
          bootstrapStatus = { waiting: false, failing: false, cost };
        }
      } else {
        bootstrapStatus = { waiting: true, failing: false, cost };
      }
    }

    // Step 2: upgrade loop -- Phase 10 behavior verbatim.
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

    // Step 3: growth buy -- once every owned server is maxed and a purchase
    // slot is free. Discretionary (gated on availableCash, not a
    // reservation); at most one per poll -- the new server starts below
    // ramLimit, so the trigger goes false on its own next evaluation.
    let growthStatus = null;
    {
      const owned = ns.cloud.getServerNames();
      const fleet = owned.map((hostname) => ({ hostname, ram: ns.getServerMaxRam(hostname) }));
      if (shouldBuyGrowthServer(fleet, ramLimit, serverLimit)) {
        const cost = ns.cloud.getServerCost(GROWTH_RAM);
        const liveMoney = ns.getPlayer().money;
        if (cost <= availableCash && cost <= liveMoney) {
          const name = nextCloudName(owned);
          const hostname = ns.cloud.purchaseServer(name, GROWTH_RAM);
          if (hostname === "") {
            if (!growthFailing) tprintTs(ns, `WARN: purchaseServer(${name}, ${GROWTH_RAM}) returned empty string -- retrying next poll`);
            growthFailing = true;
            growthStatus = { waiting: false, failing: true, cost };
          } else {
            growthFailing = false;
            const nowMs = Date.now();
            recordTransaction(ns, {
              type: "expense",
              source: "auto-cloud-purchase",
              hostname,
              ram: GROWTH_RAM,
              amount: cost,
              timestamp: nowMs,
              time: new Date(nowMs).toLocaleTimeString(),
            });
            tprintTs(ns, `CLOUDBUY: ${hostname} (${ns.format.ram(GROWTH_RAM)}) for $${ns.format.number(cost)} -- growth buy, slot ${owned.length + 1}/${serverLimit}`);
            lastGrowthBuy = { hostname, cost, time: new Date(nowMs).toLocaleTimeString() };
            availableCash -= cost;
            growthStatus = { waiting: false, failing: false, cost };
          }
        } else {
          growthStatus = { waiting: true, failing: false, cost };
        }
      }
    }

    const owned = ns.cloud.getServerNames();
    const fleet = owned.map((hostname) => ({ hostname, ram: ns.getServerMaxRam(hostname) }));
    const nextPlan = planNextUpgrade(fleet, ramLimit);
    const nextCost = nextPlan ? ns.cloud.getServerUpgradeCost(nextPlan.hostname, nextPlan.nextTier) : null;

    ns.clearLog();
    ns.print(`===== cloud manager @ ${timeLabel} =====`);
    ns.print(`available: $${ns.format.number(availableCash)} | reserved: $${ns.format.number(state.totalReserved)}`);
    if (fleet.length === 0) {
      ns.print("no cloud servers owned");
      if (bootstrapStatus) {
        if (bootstrapStatus.failing) {
          ns.print(`bootstrap: purchaseServer failing (cost $${ns.format.number(bootstrapStatus.cost)}) -- retrying`);
        } else if (bootstrapStatus.waiting) {
          ns.print(`bootstrap: waiting for cash (need $${ns.format.number(bootstrapStatus.cost)})`);
        } else {
          ns.print(`bootstrap: bought this poll for $${ns.format.number(bootstrapStatus.cost)}`);
        }
      }
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
      if (fleet.length < serverLimit) {
        if (growthStatus?.failing) {
          ns.print(`growth buy: purchaseServer failing (cost $${ns.format.number(growthStatus.cost)}) -- retrying`);
        } else if (growthStatus?.waiting) {
          ns.print(`growth buy: waiting for cash (need $${ns.format.number(growthStatus.cost)})`);
        } else if (growthStatus) {
          ns.print(`growth buy: bought this poll for $${ns.format.number(growthStatus.cost)}`);
        } else {
          ns.print(`growth buy: slot available (${fleet.length}/${serverLimit})`);
        }
      } else {
        ns.print(`fleet at server limit (${serverLimit})`);
      }
    }
    if (lastUpgrade) {
      ns.print(
        `last upgrade: ${lastUpgrade.hostname} ${ns.format.ram(lastUpgrade.fromRam)} -> ${ns.format.ram(lastUpgrade.toRam)} ` +
          `for $${ns.format.number(lastUpgrade.cost)} @ ${lastUpgrade.time}`
      );
    }
    if (lastBootstrapBuy) {
      ns.print(`bootstrap bought: ${lastBootstrapBuy.hostname} for $${ns.format.number(lastBootstrapBuy.cost)} @ ${lastBootstrapBuy.time}`);
    }
    if (lastGrowthBuy) {
      ns.print(`last growth buy: ${lastGrowthBuy.hostname} for $${ns.format.number(lastGrowthBuy.cost)} @ ${lastGrowthBuy.time}`);
    }

    await ns.sleep(POLL_MS);
  }
}
