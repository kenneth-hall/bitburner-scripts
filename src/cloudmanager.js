// Cloud fleet manager (Phase 11 rename + extension of cloudupgrader.js).
// Always-on, cheap ns.cloud surface, zero Singularity calls (same hard
// constraint as resourcemanager.js). Absorbs cloud *purchasing* alongside
// the Phase 10 upgrade behavior -- it purchases now, it still never renames
// (Phase 7's live session recorded upgradecloudserver.js's rename/recreate
// disrupting the daemon; an auto-manager doing that continuously would make
// it chronic -- upgradecloudserver.js/fleetupgrade.js/renamecloudservers.js
// remain the manual rename paths).
//
// Per poll, in order (Phase 35 D3/D9 -- REORDERED, growth now leads): (1)
// bootstrap buy -- the first cloud server, if the fleet is empty, funded
// from live money (this is the fulfiller of resourcemanager.js's own
// bootstrap-server reservation, so it deliberately ignores that reservation
// rather than gating on it -- see the phase 11 spec's Reservation model);
// (2) growth buy loop -- a NEW ranking-derived-size server (pickGrowthRam)
// whenever a purchase slot is free and one is affordable, MULTIPLE per poll,
// spending only available cash -- this now wins over upgrading even when
// existing servers aren't maxed (1x vs 2x $/GB, measured 2.4x live; BN5's
// CloudServerSoftcapCost penalizes big single hosts); (3) upgrade loop --
// Phase 10 behavior verbatim, lowest-RAM-first, runs ONLY when this poll
// placed no growth buy and none is affordable -- the cold-start fallback
// (post-install: 2GB fleet, ~$110k cash, growth costs $3.5M+ -- without this
// fallback the only affordable recovery rungs, the $110k/$220k/$440k upgrade
// tiers, would never fire). Auto-bought servers are named cloud-<n>
// (nextCloudName, mirrors renamecloudservers.js's idempotent scheme) so they
// never need the manual rename utility.
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
const CLOUD_NAME_PATTERN = /^cloud-(\d+)$/;

// Phase 35 WI2: daemon.js's live target ranking (0 GB ns.read; not imported
// -- see resourcemanager.js's own precedent for duplicating small filename
// constants rather than pulling in a heavy module for one string).
const TARGETS_RANKING_FILE = "targets-ranking.json";
export const GROWTH_RAM_MIN = 64; // floors out fresh-node n00dles-class jobs without the 16GB fragmentation trap (F4)
export const GROWTH_RAM_MAX = 1024; // caps a single buy so one whale target can't convert the whole bankroll into one host
export const GROWTH_RAM_FALLBACK = 512; // sized to F4's measured ~350-380GB harakiri-class hack job, the worst real case observed
export const GROWTH_RAM_STALE_MS = 5 * 60 * 1000; // 5 min, judged from the ranking file's own timestamp

// Phase 24 (S4): dashboard.js's cloud panel source, written every poll
// (including the paused/finance-stale early branches, each with its own flag
// set so the panel can distinguish "paused" from "dead").
const CLOUD_STATE_FILE = "cloud-state.json";

/**
 * Pure (Phase 24, S4). Assembles the cloud-state.json record from
 * already-computed poll values -- every key present regardless of branch
 * (paused/stale calls carry mostly defaults, normal calls carry the full
 * fleet/next/growth picture).
 */
export function buildCloudState({
  now,
  paused = false,
  financeStale = false,
  disabled = false,
  disabledReason = null,
  available = 0,
  reserved = 0,
  fleet = null,
  next = null,
  growth = null,
  lastUpgrade = null,
  lastBootstrapBuy = null,
  lastGrowthBuy = null,
}) {
  return { timestamp: now, time: new Date(now).toLocaleTimeString(), paused, financeStale, disabled, disabledReason, available, reserved, fleet, next, growth, lastUpgrade, lastBootstrapBuy, lastGrowthBuy };
}

/**
 * Pure (Phase 43 WI-B). Whether cloudmanager.js should stand itself down ENTIRELY --
 * CloudServerLimit is a static per-BitNode constant (confirmed live in BN9,
 * logs/hacknetprobe-1787699918752.json: cloud.limit: 0), so ns.cloud.purchaseServer can never
 * succeed there and this poll loop would otherwise retry an impossible purchase forever. This
 * check effectively fires once per process lifetime -- the caller `return`s on true rather than
 * looping again.
 */
export function shouldStandDown(serverLimit) {
  return serverLimit === 0;
}

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
 * Pure (Phase 35 WI2/D3-D9: the "every server maxed" gate is RETIRED --
 * growth now wins over upgrading whenever a slot is free, not just once the
 * fleet is fully maxed). True whenever a purchase slot is free -- an empty
 * fleet never triggers a growth buy (that's the bootstrap step's job).
 * Mirrors renamecloudservers.js's philosophy of never acting on an
 * empty/undersized signal by accident.
 */
export function shouldBuyGrowthServer(fleet, serverLimit) {
  if (fleet.length === 0) return false;
  return fleet.length < serverLimit;
}

/**
 * Pure (Phase 35 WI2). Whether a growth buy is possible RIGHT NOW, given the
 * already-priced cost for pickGrowthRam's derived size (pricing itself isn't
 * pure -- ns.cloud.getServerCost -- so the caller computes it and passes it
 * in). This is the upgrade loop's cold-start-fallback gate: it runs only
 * when this is false AND no growth buy happened yet this poll. The
 * cold-start case this exists to protect: a 2 GB bootstrap fleet with ~$110k
 * cash and a $3.5M+ derived growth cost returns false here, so the
 * $110k/$220k/$440k upgrade tiers stay reachable.
 */
export function growthPossible(fleet, serverLimit, cost, availableCash, liveMoney) {
  if (!shouldBuyGrowthServer(fleet, serverLimit)) return false;
  return cost <= availableCash && cost <= liveMoney;
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Pure (Phase 35 WI2/D4, F4's trap closed). Growth-buy size: the smallest
 * power of two >= the max `hackJobGb` across the top-3 ranked targets (not
 * head-only, so a second fleet member's larger hack job can't be orphaned),
 * clamped to [GROWTH_RAM_MIN, min(GROWTH_RAM_MAX, ramLimit)] -- never above
 * the node's cloud RAM limit (cold-review major 10). Falls back to
 * {ramGb: GROWTH_RAM_FALLBACK, source: "fallback"} when the ranking is
 * missing/stale (> GROWTH_RAM_STALE_MS by its own `timestamp` field) or no
 * top-3 entry carries a `hackJobGb`.
 * @param {{timestamp: number, targets: {hackJobGb: number|null}[]}|null} ranking
 */
export function pickGrowthRam(ranking, nowMs, ramLimit) {
  const ceiling = Math.min(GROWTH_RAM_MAX, ramLimit);
  const stale = !ranking || typeof ranking.timestamp !== "number" || nowMs - ranking.timestamp > GROWTH_RAM_STALE_MS;
  const sizes = !stale && Array.isArray(ranking.targets)
    ? ranking.targets.slice(0, 3).map((t) => t?.hackJobGb).filter((v) => typeof v === "number" && v > 0)
    : [];

  if (sizes.length === 0) {
    return { ramGb: clamp(GROWTH_RAM_FALLBACK, GROWTH_RAM_MIN, ceiling), source: "fallback" };
  }
  return { ramGb: clamp(nextPow2(Math.max(...sizes)), GROWTH_RAM_MIN, ceiling), source: "ranking" };
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

  let wasStale = true; // starts "stale" so the very first real state clears it without a spurious WARN
  let lastUpgrade = null; // {hostname, fromRam, toRam, cost, time}
  let lastBootstrapBuy = null; // {hostname, cost, time}
  let lastGrowthBuy = null; // {hostname, cost, time}
  let bootstrapFailing = false; // WARN-once-per-transition tracking, bootstrap purchaseServer()
  let growthFailing = false; // same, growth-buy purchaseServer()

  while (true) {
    const timeLabel = new Date().toLocaleTimeString();

    // Phase 43 WI-B: stand down entirely in a BitNode where CloudServerLimit is 0 (e.g. BN9 --
    // "private servers disabled"). This must run BEFORE the OFF_MARKER check: OFF_MARKER is a
    // reversible pause a human can lift, this is a permanent-for-the-node fact this script
    // cannot act on regardless.
    if (shouldStandDown(ns.cloud.getServerLimit())) {
      ns.write(
        CLOUD_STATE_FILE,
        JSON.stringify(buildCloudState({
          now: Date.now(),
          disabled: true,
          disabledReason: "CloudServerLimit is 0 for this BitNode",
        })),
        "w"
      );
      tprintTs(ns, "cloudmanager: CloudServerLimit is 0 -- nothing to manage, exiting.");
      return;
    }

    if (ns.fileExists(OFF_MARKER, "home")) {
      ns.clearLog();
      ns.print(`===== cloud manager @ ${timeLabel} =====`);
      ns.print(`PAUSED (${OFF_MARKER} present)`);
      ns.write(CLOUD_STATE_FILE, JSON.stringify(buildCloudState({ now: Date.now(), paused: true, lastUpgrade, lastBootstrapBuy, lastGrowthBuy })), "w");
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
      ns.write(CLOUD_STATE_FILE, JSON.stringify(buildCloudState({ now: Date.now(), financeStale: true, lastUpgrade, lastBootstrapBuy, lastGrowthBuy })), "w");
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
          ns.print(`CLOUDBUY: ${hostname} (${ns.format.ram(BOOTSTRAP_RAM)}) for $${ns.format.number(cost)} -- bootstrap foothold`);
          lastBootstrapBuy = { hostname, cost, time: new Date(nowMs).toLocaleTimeString() };
          bootstrapStatus = { waiting: false, failing: false, cost };
        }
      } else {
        bootstrapStatus = { waiting: true, failing: false, cost };
      }
    }

    // Step 2 (Phase 35 D3/D9 -- MOVED ahead of upgrading): growth buy loop.
    // Multiple buys per poll while a slot is free AND the ranking-derived
    // size is affordable -- this now wins over upgrading existing servers
    // even when they aren't maxed.
    let rankingForGrowth = null;
    {
      const rankingRaw = ns.read(TARGETS_RANKING_FILE);
      if (rankingRaw) {
        try {
          rankingForGrowth = JSON.parse(rankingRaw);
        } catch {
          rankingForGrowth = null;
        }
      }
    }
    let growthStatus = null;
    let growthBoughtCount = 0;
    while (true) {
      const owned = ns.cloud.getServerNames();
      const fleet = owned.map((hostname) => ({ hostname, ram: ns.getServerMaxRam(hostname) }));
      if (!shouldBuyGrowthServer(fleet, serverLimit)) break;

      const { ramGb, source } = pickGrowthRam(rankingForGrowth, Date.now(), ramLimit);
      const cost = ns.cloud.getServerCost(ramGb);
      const liveMoney = ns.getPlayer().money;
      if (!growthPossible(fleet, serverLimit, cost, availableCash, liveMoney)) {
        growthStatus = { waiting: true, failing: false, cost, ramGb, source };
        break;
      }

      const name = nextCloudName(owned);
      const hostname = ns.cloud.purchaseServer(name, ramGb);
      if (hostname === "") {
        if (!growthFailing) tprintTs(ns, `WARN: purchaseServer(${name}, ${ramGb}) returned empty string -- retrying next poll`);
        growthFailing = true;
        growthStatus = { waiting: false, failing: true, cost, ramGb, source };
        // A persistent failure retrying synchronously here would be an
        // unbounded loop in a no-await section -- break and let the next
        // poll re-derive everything fresh (same caution as the upgrade loop
        // below).
        break;
      }

      growthFailing = false;
      const nowMs = Date.now();
      recordTransaction(ns, {
        type: "expense",
        source: "auto-cloud-purchase",
        hostname,
        ram: ramGb,
        amount: cost,
        timestamp: nowMs,
        time: new Date(nowMs).toLocaleTimeString(),
      });
      ns.print(`CLOUDBUY: ${hostname} (${ns.format.ram(ramGb)}) for $${ns.format.number(cost)} -- growth buy (${source}), slot ${owned.length + 1}/${serverLimit}`);
      lastGrowthBuy = { hostname, cost, time: new Date(nowMs).toLocaleTimeString() };
      availableCash -= cost;
      growthBoughtCount++;
      growthStatus = { waiting: false, failing: false, cost, ramGb, source };
    }

    // Step 3: upgrade loop -- Phase 10 behavior verbatim, but now the
    // cold-start fallback: runs ONLY when this poll placed no growth buy and
    // none is currently affordable (no free slot, no known size, or the
    // derived size is unaffordable) -- otherwise the only affordable
    // post-install recovery rungs (the $110k/$220k/$440k upgrade tiers)
    // would never fire while growth is unaffordable, and growth spend would
    // starve upgrades entirely once it IS affordable (intentional -- growth
    // wins per D9).
    const growthStillPossible = (() => {
      const owned = ns.cloud.getServerNames();
      const fleet = owned.map((hostname) => ({ hostname, ram: ns.getServerMaxRam(hostname) }));
      const { ramGb } = pickGrowthRam(rankingForGrowth, Date.now(), ramLimit);
      const cost = ns.cloud.getServerCost(ramGb);
      return growthPossible(fleet, serverLimit, cost, availableCash, ns.getPlayer().money);
    })();
    if (growthBoughtCount === 0 && !growthStillPossible) {
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
        ns.print(`CLOUDUPGRADE: ${plan.hostname} ${ns.format.ram(fromRam)} -> ${ns.format.ram(plan.nextTier)} for $${ns.format.number(cost)}`);

        availableCash -= cost;
        lastUpgrade = { hostname: plan.hostname, fromRam, toRam: plan.nextTier, cost, time: new Date(nowMs).toLocaleTimeString() };
      }
    }

    const owned = ns.cloud.getServerNames();
    const fleet = owned.map((hostname) => ({ hostname, ram: ns.getServerMaxRam(hostname) }));
    const nextPlan = planNextUpgrade(fleet, ramLimit);
    const nextCost = nextPlan ? ns.cloud.getServerUpgradeCost(nextPlan.hostname, nextPlan.nextTier) : null;
    const slotFree = shouldBuyGrowthServer(fleet, serverLimit);

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
    // Growth renders in PREFERENCE to the next-upgrade line while a slot is
    // free (Phase 35 D3/D9 -- they were mutually exclusive under the old
    // policy; kept that way here so this tail's line count doesn't change).
    if (slotFree) {
      if (growthStatus?.failing) {
        ns.print(`growth buy: purchaseServer failing (cost $${ns.format.number(growthStatus.cost)}, ${ns.format.ram(growthStatus.ramGb)}) -- retrying`);
      } else if (growthStatus?.waiting) {
        ns.print(`growth buy: waiting for cash (need $${ns.format.number(growthStatus.cost)}, ${ns.format.ram(growthStatus.ramGb)}, ${growthStatus.source})`);
      } else if (growthBoughtCount > 0) {
        ns.print(`growth buy: bought ${growthBoughtCount} this poll for $${ns.format.number(growthStatus.cost)} (${ns.format.ram(growthStatus.ramGb)} last)`);
      } else {
        ns.print(`growth buy: slot available (${fleet.length}/${serverLimit})`);
      }
    } else if (nextPlan) {
      const affordable = nextCost !== null && nextCost <= availableCash;
      ns.print(
        `next: ${nextPlan.hostname} -> ${ns.format.ram(nextPlan.nextTier)}, $${ns.format.number(nextCost)}` +
          (affordable ? "" : " (can't afford)")
      );
    } else if (fleet.length > 0) {
      ns.print(`fleet at server limit (${serverLimit})`);
    }
    if (lastUpgrade) {
      ns.print(
        `last upgrade: ${lastUpgrade.hostname} -> ${ns.format.ram(lastUpgrade.toRam)}, ` +
          `$${ns.format.number(lastUpgrade.cost)} @ ${lastUpgrade.time}`
      );
    }
    if (lastBootstrapBuy) {
      ns.print(`bootstrap bought: ${lastBootstrapBuy.hostname}, $${ns.format.number(lastBootstrapBuy.cost)} @ ${lastBootstrapBuy.time}`);
    }
    if (lastGrowthBuy) {
      ns.print(`last growth buy: ${lastGrowthBuy.hostname}, $${ns.format.number(lastGrowthBuy.cost)} @ ${lastGrowthBuy.time}`);
    }

    // Phase 35 WI2 (cold-review blocker 3): the `growth` block is now
    // UNCONDITIONAL whenever a slot is free -- the old `!nextPlan` gate is
    // permanently false under the new policy (growth wins even when
    // existing servers aren't maxed).
    let growthBlock = null;
    if (fleet.length > 0) {
      growthBlock = slotFree
        ? {
            status: growthStatus?.failing ? "failing" : growthStatus?.waiting ? "waiting" : growthBoughtCount > 0 ? "bought" : "available",
            ramGb: growthStatus?.ramGb ?? null,
            source: growthStatus?.source ?? null,
          }
        : { status: "at-limit" };
    }

    ns.write(
      CLOUD_STATE_FILE,
      JSON.stringify(
        buildCloudState({
          now: Date.now(),
          available: availableCash,
          reserved: state.totalReserved,
          fleet: fleet.length > 0 ? { count: fleet.length, minRam: Math.min(...fleet.map((f) => f.ram)), maxRam: Math.max(...fleet.map((f) => f.ram)), serverLimit, ramLimit } : null,
          next: nextPlan ? { hostname: nextPlan.hostname, tier: nextPlan.nextTier, cost: nextCost, affordable: nextCost !== null && nextCost <= availableCash } : null,
          growth: growthBlock,
          lastUpgrade,
          lastBootstrapBuy,
          lastGrowthBuy,
        })
      ),
      "w"
    );

    await ns.sleep(POLL_MS);
  }
}
