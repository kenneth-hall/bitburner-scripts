/**
 * hacknetramonce.js -- Phase 43 WI-A: buys EXACTLY ONE tier of RAM on `hacknet-server-0`
 * (1 -> 64 GB), then exits. Mirrors upgradehomeramonce.js's shape: one-shot, capped spend,
 * recordTransaction on success only, refuses above cap rather than silently doing nothing.
 *
 * WHY THIS RUNS FIRST, STANDALONE, BEFORE bn9entry.js (spec Section 1's Ordering). Money binds
 * the graft ladder (spec Section 6's sensitivity table), and the Hacknet's ~1.50x income step
 * is the cheapest, fastest lever available before anything else starts spending -- $41.7m
 * measured, well inside a single day of BN9's Hacknet-only income.
 *
 * NOT BUILT: any recurring Hacknet manager (D2 stops here on purpose -- spec Section 3).
 *
 * RAM (spec Section 3's table, gate not itemized beyond spot-checking no ns-heavy import
 * snuck in):
 *   hacknet.getNodeStats         ~0.5 GB
 *   hacknet.getRamUpgradeCost     0.5 GB
 *   hacknet.upgradeRam            0.5 GB
 *   getServer (verification read) ~2.00 GB
 *   base + file IO                ~0.5 GB
 *   ------------------------------------------------
 *   ~4.0 GB expected -- verify live with `mem hacknetramonce.js`.
 *
 * IDENTIFIER HYGIENE: no local/property name here is `graft`, `work`, `exec`, `share`, `read`,
 * `write`, `kill`, `run`, `ls`, `ps`, `scan`, `hack`, `grow`, `tail`, `window`, `document`,
 * `process`, or any other real ns/DOM global name.
 *
 * ASCII-only (brand-new src/ file -- viteburner's new-file upload bug needs an ASCII wget seed).
 *
 * Usage: run hacknetramonce.js [maxSpendCap]
 * Writes hacknetramonce-<epoch>.json (one file per run -- vite.config.ts filter entry, HA5).
 */

import { recordTransaction } from "./translog.js";

export const TARGET_RAM_GB = 64;
export const DEFAULT_CAP = 55_000_000; // measured $41.7m + ~32% margin (spec Section 3)
export const NODE_INDEX = 0;

/** Pure. True iff n is a positive power of two. */
export function isPowerOfTwo(n) {
  return Number.isFinite(n) && n > 0 && Math.log2(n) % 1 === 0;
}

/** Pure. Number of RAM-doubling levels needed to go from currentRam to targetRam. */
export function computeLevelsNeeded(currentRam, targetRam) {
  return Math.round(Math.log2(targetRam / currentRam));
}

/**
 * Pure. Decides what hacknetramonce.js should do, given already-live-read values.
 *
 * Returns one of:
 *   {action: "invalid-current-ram", currentRam}
 *     -- currentRam is not a positive power of two (HA3's sibling guard: this script assumes
 *        the node's RAM ladder is the standard doubling sequence).
 *   {action: "already-done", currentRam, targetRam}
 *     -- currentRam already >= targetRam. HA3: this is logged as "already at or above target",
 *        NEVER as "REFUSED" -- that label is reserved for "can't afford it".
 *   {action: "refused-cap", levelsNeeded, cost, cap}
 *     -- affordable in principle but the live cost exceeds the caller-supplied spend cap.
 *   {action: "buy", levelsNeeded, cost, cap}
 *     -- go ahead and call ns.hacknet.upgradeRam.
 *
 * `cost` may be omitted (undefined) on the FIRST call of a two-phase decide (levelsNeeded is
 * needed before cost can be read live) -- in that case the "buy"/"refused-cap" branch is not
 * yet decidable and the caller must re-call with a real cost once it has one. This function
 * never reads `ns` itself; the caller supplies every value.
 */
export function decideHacknetRamUpgrade({ currentRam, targetRam, cost, cap }) {
  if (!isPowerOfTwo(currentRam)) {
    return { action: "invalid-current-ram", currentRam };
  }
  if (currentRam >= targetRam) {
    return { action: "already-done", currentRam, targetRam };
  }
  const levelsNeeded = computeLevelsNeeded(currentRam, targetRam);
  if (typeof cost !== "number") {
    return { action: "buy", levelsNeeded }; // cost not yet known -- caller must re-decide once it is
  }
  if (cost > cap) {
    return { action: "refused-cap", levelsNeeded, cost, cap };
  }
  return { action: "buy", levelsNeeded, cost, cap };
}

function logFileName(nowMs) {
  return "hacknetramonce-" + nowMs + ".json";
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const capArg = Number(ns.args[0]);
  const cap = Number.isFinite(capArg) && capArg > 0 ? capArg : DEFAULT_CAP;

  const nowMs = Date.now();
  const outRecord = { ts: nowMs, iso: new Date(nowMs).toISOString(), targetRam: TARGET_RAM_GB, cap };

  const statsBefore = ns.hacknet.getNodeStats(NODE_INDEX);
  const currentRam = statsBefore.ram;
  outRecord.currentRam = currentRam;
  outRecord.productionBefore = statsBefore.production;

  const preDecision = decideHacknetRamUpgrade({ currentRam, targetRam: TARGET_RAM_GB, cap });

  if (preDecision.action === "invalid-current-ram") {
    outRecord.action = "invalid-current-ram";
    ns.tprint("hacknetramonce: REFUSED -- hacknet-server-" + NODE_INDEX + "'s RAM (" +
      currentRam + " GB) is not a power of two <= " + TARGET_RAM_GB + " GB.");
    ns.write(logFileName(nowMs), JSON.stringify(outRecord, null, 2), "w");
    return;
  }

  if (preDecision.action === "already-done") {
    outRecord.action = "already-done";
    ns.tprint("hacknetramonce: already at or above target (" + currentRam + " GB >= " +
      TARGET_RAM_GB + " GB) -- no-op.");
    ns.write(logFileName(nowMs), JSON.stringify(outRecord, null, 2), "w");
    return;
  }

  const levelsNeeded = preDecision.levelsNeeded;
  const cost = ns.hacknet.getRamUpgradeCost(NODE_INDEX, levelsNeeded);
  outRecord.levelsNeeded = levelsNeeded;
  outRecord.cost = cost;

  const decision = decideHacknetRamUpgrade({ currentRam, targetRam: TARGET_RAM_GB, cost, cap });

  if (decision.action === "refused-cap") {
    outRecord.action = "refused-cap";
    ns.tprint("hacknetramonce: REFUSED -- upgrade cost $" + ns.format.number(cost) +
      " exceeds cap $" + ns.format.number(cap) + ". Pass a higher cap as arg 1 to override.");
    ns.write(logFileName(nowMs), JSON.stringify(outRecord, null, 2), "w");
    return;
  }

  // House rule: verify, don't trust a setter's boolean.
  const boughtBoolIgnored = ns.hacknet.upgradeRam(NODE_INDEX, levelsNeeded);
  void boughtBoolIgnored;

  const server = ns.getServer("hacknet-server-" + NODE_INDEX);
  const statsAfter = ns.hacknet.getNodeStats(NODE_INDEX);
  outRecord.maxRamFromGetServer = server.maxRam;
  outRecord.ramFromNodeStats = statsAfter.ram;
  outRecord.mismatch = server.maxRam !== statsAfter.ram;
  outRecord.productionAfter = statsAfter.production;

  const verified = server.maxRam >= TARGET_RAM_GB;
  outRecord.action = verified ? "bought" : "bought-unverified";

  if (verified) {
    recordTransaction(ns, {
      type: "expense",
      source: "hacknet-ram-upgrade",
      detail: currentRam + "GB -> " + server.maxRam + "GB",
      amount: cost,
      timestamp: nowMs,
      time: new Date(nowMs).toLocaleString(),
    });
    ns.tprint("hacknetramonce: BOUGHT " + levelsNeeded + " level(s) for $" +
      ns.format.number(cost) + " -- " + currentRam + " GB -> " + server.maxRam + " GB.");
  } else {
    ns.tprint("hacknetramonce: WARN -- upgradeRam() called but getServer() reads " +
      server.maxRam + " GB, expected >= " + TARGET_RAM_GB + " GB. No transaction recorded.");
  }

  if (outRecord.mismatch) {
    ns.tprint("hacknetramonce: WARN -- getServer().maxRam (" + server.maxRam +
      ") and getNodeStats().ram (" + statsAfter.ram + ") disagree.");
  }

  ns.write(logFileName(nowMs), JSON.stringify(outRecord, null, 2), "w");
}
