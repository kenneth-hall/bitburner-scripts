/**
 * hacknetboost.js -- one-off: buy the cheap remaining Hacknet headroom on
 * hacknet-server-0, then exit. Cores to a target, RAM to a target, capped spend.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A MANAGER. Phase 43's D2 said "build to ~$42m
 * and stop", reasoning off a $774m bankroll. At $11.6b the arithmetic changed:
 * cores 10->11 costs $43m for +6.67% production (a ~1.4h payback) and RAM 64->128
 * costs $80m for +7% (~2.5h). Level upgrades stay dead ($5.7b for +1%, a 52-day
 * payback) and new servers stay dead (~$54b to level one to usefulness), so this
 * takes only the two cheap levers and stops. Still no recurring manager -- D2's
 * real argument (money has almost nothing to buy in BN9) is unchanged.
 *
 * Production model, measured: hashes/sec scales as level * 0.001 * 1.07^log2(ram)
 * * (cores+5)/6 * the hacknet_node_money mult (which carries grafting Entropy --
 * that is why production read 0.5379 pre-graft and 0.5062 after).
 *
 * Identifier hygiene: no local/property named after a real ns method or DOM
 * global. `ns.hacknet` is a real namespace, so nothing here is named `hacknet`.
 *
 * ASCII-only (brand-new src/ file -- viteburner's new-file upload path).
 *
 * Usage: run hacknetboost.js [coreTarget] [ramTargetGb] [spendCap]
 * Writes hacknetboost-<epoch>.json (vite.config.ts filter entry).
 */

import { recordTransaction } from "./translog.js";

export const NODE_INDEX = 0;
export const DEFAULT_CORE_TARGET = 14;
export const DEFAULT_RAM_TARGET_GB = 128;
export const DEFAULT_CAP = 400_000_000; // ~$350m projected + margin

/** Pure. Steps of a doubling ladder from `current` to `target` (0 if already there). */
export function ramStepsNeeded(current, target) {
  if (!(current > 0) || !(target > 0) || target <= current) return 0;
  return Math.round(Math.log2(target / current));
}

/** Pure. Decide what to buy given live readings. Never spends past `cap`. */
export function planBoost({ cores, coreTarget, ram, ramTarget, coreCost, ramCost, cap }) {
  const coreSteps = Math.max(0, (coreTarget ?? 0) - (cores ?? 0));
  const ramSteps = ramStepsNeeded(ram, ramTarget);
  const wantCore = coreSteps > 0 && Number.isFinite(coreCost);
  const wantRam = ramSteps > 0 && Number.isFinite(ramCost);
  const total = (wantCore ? coreCost : 0) + (wantRam ? ramCost : 0);
  if (!wantCore && !wantRam) return { action: "already-done", coreSteps: 0, ramSteps: 0, total: 0 };
  if (total > cap) return { action: "refused-cap", coreSteps, ramSteps, total, cap };
  return { action: "buy", coreSteps, ramSteps, total };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const coreTarget = Number(ns.args[0]) > 0 ? Number(ns.args[0]) : DEFAULT_CORE_TARGET;
  const ramTarget = Number(ns.args[1]) > 0 ? Number(ns.args[1]) : DEFAULT_RAM_TARGET_GB;
  const cap = Number(ns.args[2]) > 0 ? Number(ns.args[2]) : DEFAULT_CAP;

  const nowMs = Date.now();
  const rec = { ts: nowMs, iso: new Date(nowMs).toISOString(), coreTarget, ramTarget, cap };

  const before = ns.hacknet.getNodeStats(NODE_INDEX);
  rec.before = { level: before.level, ram: before.ram, cores: before.cores, production: before.production };

  const coreSteps = Math.max(0, coreTarget - before.cores);
  const ramSteps = ramStepsNeeded(before.ram, ramTarget);
  const coreCost = coreSteps > 0 ? ns.hacknet.getCoreUpgradeCost(NODE_INDEX, coreSteps) : 0;
  const ramCost = ramSteps > 0 ? ns.hacknet.getRamUpgradeCost(NODE_INDEX, ramSteps) : 0;

  const plan = planBoost({
    cores: before.cores, coreTarget, ram: before.ram, ramTarget,
    coreCost: coreSteps > 0 ? coreCost : NaN, ramCost: ramSteps > 0 ? ramCost : NaN, cap,
  });
  rec.plan = { ...plan, coreCost, ramCost };

  if (plan.action !== "buy") {
    rec.action = plan.action;
    ns.tprint("hacknetboost: " + plan.action + " -- cores " + before.cores + "/" + coreTarget +
      ", ram " + before.ram + "/" + ramTarget + " GB, total $" + ns.format.number(plan.total) +
      " vs cap $" + ns.format.number(cap));
    ns.write("hacknetboost-" + nowMs + ".json", JSON.stringify(rec, null, 2), "w");
    return;
  }

  // Verify, never trust a setter's boolean (house rule).
  if (coreSteps > 0) {
    ns.hacknet.upgradeCore(NODE_INDEX, coreSteps);
    await ns.sleep(200);
  }
  if (ramSteps > 0) {
    ns.hacknet.upgradeRam(NODE_INDEX, ramSteps);
    await ns.sleep(200);
  }

  const after = ns.hacknet.getNodeStats(NODE_INDEX);
  rec.after = { level: after.level, ram: after.ram, cores: after.cores, production: after.production };
  rec.coresBought = after.cores - before.cores;
  rec.ramStepsBought = ramStepsNeeded(before.ram, after.ram);
  rec.productionGain = after.production / (before.production || 1);
  rec.action = "bought";

  if (rec.coresBought > 0) {
    recordTransaction(ns, {
      type: "expense", source: "hacknet-core-upgrade",
      detail: before.cores + " -> " + after.cores + " cores",
      amount: coreCost, timestamp: nowMs, time: new Date(nowMs).toLocaleString(),
    });
  }
  if (rec.ramStepsBought > 0) {
    recordTransaction(ns, {
      type: "expense", source: "hacknet-ram-upgrade",
      detail: before.ram + "GB -> " + after.ram + "GB",
      amount: ramCost, timestamp: nowMs, time: new Date(nowMs).toLocaleString(),
    });
  }

  ns.write("hacknetboost-" + nowMs + ".json", JSON.stringify(rec, null, 2), "w");
  ns.tprint("hacknetboost: cores " + before.cores + " -> " + after.cores + ", ram " + before.ram +
    " -> " + after.ram + " GB; production " + before.production.toFixed(4) + " -> " +
    after.production.toFixed(4) + " h/s (x" + rec.productionGain.toFixed(3) + ").");
}
