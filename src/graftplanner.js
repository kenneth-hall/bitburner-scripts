/**
 * graftplanner.js - Phase 41 WI2, rebuilt on Phase 43 WI-C's beam search: computes the
 * combat-graft ladder into graft-plan.json, then exits. Pays the catalog/price/time/stats/
 * prereq RAM ONCE, so the resident executor (bn9entry.js / bn10entry.js) never has to.
 *
 * WHY A SEPARATE SCRIPT (spec A1). A single script covering catalog reads, prerequisite
 * checks, grafting, crime, travel and the join needs >=53 GB, which does not fit alongside
 * daemon.js + companions. Planner and executor are separate processes communicating through
 * graft-plan.json.
 *
 * WHY THIS FILE HAS ALMOST NO PURE MATH OF ITS OWN ANY MORE (Phase 43 WI-C). Every function
 * that used to live here (expForLevel, remainingExp, the greedy planGraftLadder) moved to
 * src/graftmath.js, a genuinely zero-`ns` module -- see that file's header for why (it charges
 * NO importer any RAM, and is the shared surface both graftplanner.js and bn9entry.js's
 * CALIBRATE_GRIND step need). THE ALGORITHM ALSO CHANGED, not just its location: the old
 * greedy walk selected by SUMMED exp-deficit reduction per dollar, which is wrong because the
 * combat gate is min(str,def,dex,agi) >= targetLevel, not a sum -- see graftmath.js Section 0
 * for the measured 52.6h-vs-21.17h failure this fixes. Replaced by a beam search
 * (graftmath.js's planGraftLadder, width 300, converged through width 2400).
 *
 * BITNODE-AWARE (new in Phase 43): this script no longer hardcodes BN10's constants. It reads
 * ns.getResetInfo().currentNode (non-Singularity, ~0 GB) and calls
 * graftmath.resolveNodeConfig(currentNode, overrides) to get nodeMult/targetLevel/
 * entropyPerGraft/grindExpPerSec/maxSpend for WHICHEVER node it is actually running in.
 * ns.args[0]/[1] still override maxSpend/grindExpPerSec exactly as before (bn9entry.js's
 * CALIBRATE_GRIND passes the live-measured rate this way).
 *
 * NOTE: NEVER reads graftrecon.js's `combatLevelFactor` field. That field multiplies a single
 * aug's four stat mults TOGETHER, which credits a one-stat aug as though it lifted all four --
 * confirmed live to overstate the ladder by ~13x. This file computes its own per-stat
 * CombatQuad from getAugmentationStats directly and never imports graftrecon.js.
 *
 * ns.getPlayer().mults ALREADY INCLUDES the entropy debuff (measured 2026-08-17,
 * logs/graftone-1787021054487.json: HemoRecirculator is a raw x1.08 per combat stat, and at
 * entropy 1 the observed delta was exactly x1.0584 = 1.08 * 0.98). main() divides the
 * already-applied debuff back out below before handing base mults to the beam search, which
 * models entropyPerGraft^k over FUTURE grafts itself (graftmath.js's applyEntropy).
 *
 * INCOME RATE (new in Phase 43, Q8): the beam search's moneyWaitHours scoring term needs a
 * live income rate. Read from goal-state.json's income.perSec24h (same file/shape
 * resourcemanager.js's readTrailingIncome reads, duplicated here rather than imported --
 * consistent with this codebase's convention of duplicating small filenames rather than
 * pulling in a heavier module for one field, e.g. resourcemanager.js's own PORT_OPENER_COSTS
 * precedent). Missing/stale/non-numeric collapses to 0 (money-wait becomes infinite once
 * genuinely unaffordable, which is the conservative default -- see graftmath.test.js's WC5
 * "fixture's own live money" test for what that looks like in practice).
 *
 * RAM budget (spec Section 9, gate <=30 GB) -- EXPECTED itemisation, NOT a measured figure
 * (no running game in this implementation pass; verify live with `mem graftplanner.js`):
 *   getGraftableAugmentations   5.00 GB
 *   getAugmentationGraftPrice   3.75 GB
 *   getAugmentationGraftTime    3.75 GB
 *   getAugmentationStats        5.00 GB
 *   getAugmentationPrereq       5.00 GB
 *   getOwnedAugmentations       5.00 GB
 *   getResetInfo (non-Singularity) / getPlayer / ns.read / ns.write / ns.sleep / base   ~1.60 GB
 *   graftmath.js import        0.00 GB -- verified live, not estimated (WC7)
 *   ------------------------------------------------
 *   ~29.1 GB expected, gate 30 GB.
 *
 * IDENTIFIER HYGIENE (this build's RAM analyzer is name-based, not call-graph-based --
 * CLAUDE.md's "Script writing rules"). No local/property name here is `graft`, `work`,
 * `exec`, `share`, `read`, `write`, `kill`, `run`, `ls`, `ps`, `scan`, `hack`, `grow`,
 * `tail`, `window`, or any other real `ns`/DOM global name -- checked by hand at write time.
 * `augmentationName`/`candidateName`/`stepList` etc. are used instead of the obvious short
 * forms precisely to stay clear of this footgun.
 *
 * ASCII-only: this is a brand-new src/ file (docs/dev-server.md's viteburner new-file
 * upload bug needs an in-game `wget` seed for a brand-new file, which mangles non-ASCII).
 *
 * Usage: run graftplanner.js [maxSpend] [grindExpPerSec]
 * Writes graft-plan.json (overwritten in place -- one live plan, not a per-run log; synced
 * via vite.config.ts's filter list).
 */

import { STATS, resolveNodeConfig, planGraftLadder } from "./graftmath.js";

// Re-exported for backward compatibility with anything still importing graftplanner.js's old
// BN10-only constants -- now sourced from graftmath.js's NODE_CONFIGS[10] rather than
// hardcoded twice.
const BN10_DEFAULTS = resolveNodeConfig(10, {});
export const NODE_MULT = BN10_DEFAULTS.nodeMult;
export const TARGET_LEVEL = BN10_DEFAULTS.targetLevel;
export const ENTROPY_PER_GRAFT = BN10_DEFAULTS.entropyPerGraft;
export const DEFAULT_GRIND_EXP_PER_SEC = BN10_DEFAULTS.grindExpPerSec;
export const DEFAULT_MAX_SPEND = BN10_DEFAULTS.maxSpend;

export { STATS, planGraftLadder };

export const PLAN_FILE = "graft-plan.json";
export const SCHEMA_VERSION = 2; // bumped: ladder/output shape changed with the beam search (Phase 43 WI-C)

const GOAL_STATE_FILE = "goal-state.json";
const GOAL_STATE_STALE_MS = 5 * 60 * 1000;

/**
 * Reads goal-state.json's trailing-24h income signal (same convention as
 * resourcemanager.js's readTrailingIncome) -- missing/unparseable/stale or non-numeric all
 * collapse to 0, the conservative default for the beam search's money-wait term.
 */
function readIncomeRatePerSec(ns, nowMs) {
  const raw = ns.read(GOAL_STATE_FILE);
  if (!raw) return 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!parsed || typeof parsed.timestamp !== "number" || nowMs - parsed.timestamp > GOAL_STATE_STALE_MS) return 0;
  const v = parsed?.income?.perSec24h;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // BitNode-aware (Phase 43): resolve the live node's constants rather than assuming BN10.
  // getResetInfo is a non-Singularity, ~0 GB call (this file's header table).
  const currentBitNode = ns.getResetInfo().currentNode;
  const nodeConfig = resolveNodeConfig(currentBitNode, {});

  const maxSpendArg = Number(ns.args[0]);
  const maxSpend = Number.isFinite(maxSpendArg) && maxSpendArg > 0 ? maxSpendArg : nodeConfig.maxSpend;

  // Grind-rate override (spec Section 6): bn9entry.js's CALIBRATE_GRIND passes a measured
  // per-stat rate as four positional args (strength, defense, dexterity, agility, in
  // graftmath.STATS order) once it has one; a single scalar in ns.args[1] (the old BN10 call
  // shape) is still honoured for backward compatibility; absent either, fall back to the
  // node's own placeholder rate (NODE_CONFIGS[bitNode].grindExpPerSec -- "calibration-pending").
  const perStatArgs = STATS.map((_stat, i) => Number(ns.args[1 + i]));
  const allPerStatFinite = perStatArgs.every((v) => Number.isFinite(v) && v > 0);
  let grindRatePerStat;
  let grindRateSource;
  if (allPerStatFinite) {
    grindRatePerStat = {};
    STATS.forEach((stat, i) => { grindRatePerStat[stat] = perStatArgs[i]; });
    grindRateSource = "cli-per-stat";
  } else {
    const scalarArg = Number(ns.args[1]);
    if (Number.isFinite(scalarArg) && scalarArg > 0) {
      grindRatePerStat = scalarArg;
      grindRateSource = "cli-scalar";
    } else {
      grindRatePerStat = nodeConfig.grindExpPerSec;
      grindRateSource = "calibration-pending";
    }
  }

  const outRecord = { ts: Date.now(), iso: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, bitNode: currentBitNode };

  const player = ns.getPlayer();
  // MEASURED 2026-08-17 (logs/graftone-1787021054487.json). ns.getPlayer().mults ALREADY
  // INCLUDES the entropy debuff: HemoRecirculator is a raw x1.08 per combat stat, and at
  // entropy 1 the observed delta was exactly x1.0584 = 1.08 * 0.98.
  //
  // Harmless on a first plan at entropy 0 (0.98^0 = 1), silently compounding on every REPLAN
  // after a graft -- which is exactly the failure mode WC4's seam test (graftmath.test.js)
  // checks. planGraftLadder models entropy itself as entropyPerGraft^k over FUTURE grafts, so
  // it must be handed entropy-FREE base mults. Divide the already-applied debuff back out here.
  const appliedEntropyFactor = Math.pow(nodeConfig.entropyPerGraft, player.entropy || 0);
  const currentMults = {
    strength: player.mults.strength / appliedEntropyFactor,
    defense: player.mults.defense / appliedEntropyFactor,
    dexterity: player.mults.dexterity / appliedEntropyFactor,
    agility: player.mults.agility / appliedEntropyFactor,
  };
  const banked = {
    strength: player.exp.strength,
    defense: player.exp.defense,
    dexterity: player.exp.dexterity,
    agility: player.exp.agility,
  };
  const entropy = player.entropy;
  const money = player.money;

  let ownedNames;
  try {
    ownedNames = new Set(ns.singularity.getOwnedAugmentations(true));
  } catch (err) {
    outRecord.fatal = "getOwnedAugmentations threw: " + String(err).slice(0, 200);
    ns.write(PLAN_FILE, JSON.stringify(outRecord, null, 2), "w");
    ns.tprint("graftplanner: ABORT -- " + outRecord.fatal);
    return;
  }

  let catalog;
  try {
    catalog = ns.grafting.getGraftableAugmentations();
  } catch (err) {
    outRecord.fatal = "getGraftableAugmentations threw: " + String(err).slice(0, 200);
    ns.write(PLAN_FILE, JSON.stringify(outRecord, null, 2), "w");
    ns.tprint("graftplanner: ABORT -- " + outRecord.fatal);
    return;
  }

  const candidateList = [];
  for (const augmentationName of catalog || []) {
    if (ownedNames.has(augmentationName)) continue; // B5: never emit an owned/grafted aug

    let price;
    let graftTimeMs;
    let statsRaw;
    let prereqs;
    try {
      price = ns.grafting.getAugmentationGraftPrice(augmentationName);
      graftTimeMs = ns.grafting.getAugmentationGraftTime(augmentationName);
      statsRaw = ns.singularity.getAugmentationStats(augmentationName);
    } catch (err) {
      continue; // unreadable candidate -- skip rather than abort the whole plan
    }
    try {
      prereqs = ns.singularity.getAugmentationPrereq(augmentationName);
    } catch (err) {
      prereqs = [];
    }

    const mults = {
      strength: typeof statsRaw.strength === "number" ? statsRaw.strength : 1,
      defense: typeof statsRaw.defense === "number" ? statsRaw.defense : 1,
      dexterity: typeof statsRaw.dexterity === "number" ? statsRaw.dexterity : 1,
      agility: typeof statsRaw.agility === "number" ? statsRaw.agility : 1,
    };
    const touchesCombat = STATS.some((stat) => mults[stat] !== 1);
    if (!touchesCombat) continue; // only combat-level-relevant candidates matter here

    candidateList.push({ name: augmentationName, price, graftHours: graftTimeMs / 3_600_000, mults, prereqs });
    await ns.sleep(3);
  }

  const incomeRatePerSecDollars = readIncomeRatePerSec(ns, outRecord.ts);

  const opts = {
    nodeMult: nodeConfig.nodeMult,
    targetLevel: nodeConfig.targetLevel,
    grindRatePerStat,
    entropyPerGraft: nodeConfig.entropyPerGraft,
    owned: ownedNames,
    maxSpend,
    moneyAvailable: money,
    incomeRatePerSecDollars,
    beamWidth: nodeConfig.beamWidth,
    maxDepth: nodeConfig.maxDepth,
  };
  const planResult = planGraftLadder(candidateList, currentMults, banked, opts);

  // B4: every input the plan was computed from, so staleness is detectable downstream
  // (bn9entry.js's/bn10entry.js's replan triggers, WD3).
  outRecord.inputs = {
    currentMults, banked, entropy, money,
    nodeMult: nodeConfig.nodeMult, targetLevel: nodeConfig.targetLevel,
    grindRatePerStat, grindRateSource, entropyPerGraft: nodeConfig.entropyPerGraft,
    maxSpend, incomeRatePerSecDollars, beamWidth: nodeConfig.beamWidth, maxDepth: nodeConfig.maxDepth,
  };
  outRecord.candidateCount = candidateList.length;
  outRecord.ladder = planResult.ladder;
  outRecord.chosenK = planResult.chosenK;
  outRecord.totalHours = planResult.totalHours;
  // Convenience fields for the executor's (bn9entry.js/bn10entry.js) replan-trigger comparison:
  outRecord.levels = {
    strength: player.skills.strength,
    defense: player.skills.defense,
    dexterity: player.skills.dexterity,
    agility: player.skills.agility,
  };
  outRecord.timestamp = outRecord.ts;
  outRecord.moneyAvailable = money;

  ns.write(PLAN_FILE, JSON.stringify(outRecord, null, 2), "w");

  ns.tprint("graftplanner: BN" + currentBitNode + " | " + candidateList.length + " combat-touching candidates | chosenK=" +
    planResult.chosenK + " | ladder cost $" +
    ns.format.number(planResult.ladder.reduce((sum, s) => sum + s.price, 0)) +
    " | totalHours " + planResult.totalHours.toFixed(1) + " | rate source " + grindRateSource);
  for (const step of planResult.ladder) {
    ns.tprint("  k=" + step.k + " " + step.name + " -- $" + ns.format.number(step.price) +
      " / " + step.graftHours.toFixed(2) + "h -> grind " + step.grindHours.toFixed(1) +
      "h, total " + step.totalHours.toFixed(1) + "h");
  }
  ns.tprint("  -> " + PLAN_FILE);
}
