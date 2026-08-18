/**
 * graftplanner.js - Phase 41 WI2: computes the optimal graft ladder into graft-plan.json,
 * then exits. Pays the catalog/price/time/stats/prereq RAM ONCE, so bn10entry.js (the
 * resident executor) never has to.
 *
 * WHY A SEPARATE SCRIPT (spec A1). A single script covering catalog reads, prerequisite
 * checks, grafting, crime, travel and the join needs >=53 GB, which does not fit alongside
 * daemon.js + companions even after WI1's 64 GB home upgrade. Planner and executor are
 * separate processes communicating through graft-plan.json.
 *
 * WHY IT RUNS ON THE FLEET, NOT HOME (spec A1a). Singularity/Grafting calls carry no
 * home-only requirement (upgradehomeramonce.js's header records this precedent).
 * bn10entry.js execs this file to a fleet host with enough free RAM -- see that script for
 * the host-selection logic. This file itself does not care where it runs.
 *
 * THE PURE CORE (unit-tested in test/graftplanner.test.js, zero `ns` calls):
 *   expForLevel(level, effectiveMult) -- e^((level/effectiveMult + 200)/32) - 534.6.
 *     Validated against BN6's measured combat-gate cost: expForLevel(100, 1.28) = 5,417/stat
 *     (1.28 is BN6's SF1.3 base-multiplier floor, NOT 1.0 -- see spec B2's correction history).
 *   remainingExp(mults, banked, opts) -- per-stat exp still needed to reach opts.targetLevel,
 *     SUMMED across the four stats, each stat's own deficit clamped at >=0 BEFORE summing
 *     (never `sum(need) - sum(banked)`, which would let a surplus in one already-capped stat
 *     mask a genuine deficit in another -- the "gate binds on the worst stat, never a scalar"
 *     rule from the spec, enforced here via per-stat clamping rather than a single blended
 *     number). Validated against the spec's B1 golden fixture (features doc Section 3.2's
 *     "Exp remaining" column, sourced from the SAME sum-of-clamped-per-stat model).
 *   planGraftLadder(candidates, currentMults, banked, opts) -- greedy walk by
 *     exp-reduction-per-dollar, respecting prerequisite admissibility (a candidate needs
 *     every prereq either already owned or earlier in the SAME ladder -- getGraftableAugmentations
 *     checks neither money nor prereqs, sleeve-grafting-reference.md Section 7), capped at
 *     opts.maxSpend. chosenK is the index of the walk's MINIMUM totalHours (graft hours so
 *     far + projected grind hours), not the largest affordable k -- the curve turns (features
 *     Section 3.2: k=7 at 9.6h beats k=10 at 11.5h). `projections` carries the FULL walk (every
 *     k reached within maxSpend) so a cheaper-but-slower tail is visible even though `ladder`
 *     stops at chosenK.
 *
 * NOTE: NEVER reads graftrecon.js's `combatLevelFactor` field. That field multiplies a single
 * aug's four stat mults TOGETHER, which credits a one-stat aug as though it lifted all four --
 * confirmed live to overstate the ladder by ~13x. This file computes its own per-stat
 * CombatQuad from getAugmentationStats directly and never imports graftrecon.js.
 *
 * WARNING: EMPIRICAL QUESTION LEFT OPEN (spec WI2, "must determine this empirically before
 * shipping"): does ns.getPlayer().mults already include the entropy debuff? This file
 * ANSWERED 2026-08-17: IT DOES. Live mults carry the debuff, so main() divides it back out
 * graftrecon.js's existing model (which computes its raw combat factor from
 * getAugmentationStats and applies entropy as a SEPARATE multiplier, never reading it out of
 * player.mults). That assumption is inherited from precedent, not independently re-verified
 * live in this implementation pass (no running game available). VERIFY before trusting a
 * plan across multiple grafts: read player.mults before graft #1 and again after it lands --
 * if mults moved by ~entropyPerGraft on their own, this file's model double-counts entropy
 * and needs a fix. This is also L2's job per the spec.
 *
 * NODE_MULT and GRIND_EXP_PER_SEC are BN10-specific constants, not queried live -- there is
 * no cheap live call for StrengthLevelMultiplier (ns.getBitNodeMultipliers() is a genuine
 * multi-GB Singularity call, not itemized in this script's RAM budget) and NODE_MULT is
 * already measured (bitnodemults.js / CLAUDE.md: BN10's StrengthLevelMultiplier is 0.40 for
 * all four combat stats). GRIND_EXP_PER_SEC (2.62) is features doc Section 3.2's live
 * observed rate at combat 74, Mug, focused, +1 sleeve idle -- an open question (S-1/S-2,
 * expires 2026-08-19), overridable via ns.args[1] once bn10entry.js's own log (C4) gives a
 * fresher measurement.
 *
 * RAM budget (spec Section 5, gate <=30 GB) -- EXPECTED itemisation, NOT a measured figure
 * (no running game in this implementation pass; verify live with `mem graftplanner.js`):
 *   getGraftableAugmentations   5.00 GB
 *   getAugmentationGraftPrice   3.75 GB
 *   getAugmentationGraftTime    3.75 GB
 *   getAugmentationStats        5.00 GB
 *   getAugmentationPrereq       5.00 GB
 *   getOwnedAugmentations       5.00 GB
 *   getPlayer / ns.write / ns.sleep / base    ~0 GB (documented 0-cost elsewhere in this repo)
 *   ------------------------------------------------
 *   ~27.5 GB expected, gate 30 GB.
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

export const STATS = ["strength", "defense", "dexterity", "agility"];

// BN10-specific, measured -- see the header note above. Not re-derived live by this script.
export const NODE_MULT = 0.4;
export const TARGET_LEVEL = 100;
export const ENTROPY_PER_GRAFT = 0.98;
export const DEFAULT_GRIND_EXP_PER_SEC = 2.62;
// Mirrors bn10entry.js's R1 MAX_GRAFT_SPEND -- no point planning grafts the executor's own
// safety rail would refuse to buy.
export const DEFAULT_MAX_SPEND = 1_500_000_000;

export const PLAN_FILE = "graft-plan.json";
export const SCHEMA_VERSION = 1;

/**
 * Pure. e^((level/effectiveMult + 200)/32) - 534.6 -- the exp-to-level formula, validated
 * against BN6's measured combat-gate cost: expForLevel(100, 1.28) = 5,417/stat (1.28 is
 * BN6's SF1.3 base-multiplier floor -- see CLAUDE.md's aggregate mult table).
 */
export function expForLevel(level, effectiveMult) {
  return Math.exp((level / effectiveMult + 200) / 32) - 534.6;
}

/**
 * Pure. Per-stat exp still needed to reach opts.targetLevel, summed across all four stats.
 * Each stat's deficit is computed independently (its own mult, its own banked exp) and
 * clamped at >=0 BEFORE summing -- a stat already past target contributes 0, never a
 * negative correction that could mask another stat's real deficit. `mults` are BASE mults
 * (entropy NOT applied by the caller -- see the header's empirical-question note); this
 * function applies opts.nodeMult to get each stat's effective mult.
 *
 * mults/banked are 4-tuples (CombatQuad: {strength, defense, dexterity, agility}), never
 * scalars -- collapsing to one number (as graftrecon.js's deprecated combatLevelFactor did
 * by multiplying all four mults together) is the exact bug this shape prevents.
 */
export function remainingExp(mults, banked, opts) {
  const { nodeMult, targetLevel } = opts;
  let total = 0;
  for (const stat of STATS) {
    const effectiveMult = mults[stat] * nodeMult;
    const need = expForLevel(targetLevel, effectiveMult);
    total += Math.max(0, need - banked[stat]);
  }
  return total;
}

/** Pure. Elementwise product of two CombatQuads. */
function multiplyMults(a, b) {
  const out = {};
  for (const stat of STATS) out[stat] = a[stat] * b[stat];
  return out;
}

/** Pure. Applies a scalar entropy factor to every stat of a CombatQuad. */
function applyEntropyFactor(mults, factor) {
  const out = {};
  for (const stat of STATS) out[stat] = mults[stat] * factor;
  return out;
}

/** Pure. True iff every prereq of `candidate` is owned or already chosen earlier in the ladder. */
function isAdmissible(candidate, owned, chosenNames) {
  const prereqs = candidate.prereqs || [];
  return prereqs.every((p) => owned.has(p) || chosenNames.includes(p));
}

/**
 * Pure. Greedy graft-ladder planner (spec WI2).
 *
 * candidates: [{name, price, graftHours, mults: CombatQuad, prereqs: string[]}]
 * currentMults / banked: CombatQuad (BASE mults, entropy not applied -- see header)
 * opts: {nodeMult, targetLevel, grindExpPerSec, entropyPerGraft, owned: Set<string>,
 *        maxSpend, moneyAvailable}
 *
 * Returns {ladder, chosenK, projections}:
 *   projections[k] for k=0..N -- every step reached by the greedy walk within maxSpend,
 *     including the k=0 baseline (no grafts). Each entry: {k, name, price, graftHours,
 *     cumCost, cumGraftHours, remainingExp, grindHours, totalHours}.
 *   chosenK -- the k (>=0) at which totalHours is at its GLOBAL MINIMUM across projections
 *     (spec: "choosing chosenK at the MINIMUM of totalHours, not the maximum affordable").
 *   ladder -- projections[1..chosenK] (the actual grafts to buy, in order; empty if
 *     chosenK is 0).
 */
export function planGraftLadder(candidates, currentMults, banked, opts) {
  const { nodeMult, targetLevel, grindExpPerSec, entropyPerGraft, owned, maxSpend } = opts;

  const pool = candidates.filter((c) => !owned.has(c.name));

  let cumMults = { ...currentMults };
  let cumCost = 0;
  let cumGraftHours = 0;
  const chosenNames = [];
  let remainingPool = pool;

  const projections = [];

  const projectStep = (k, name, price, graftHours) => {
    const entropyFactor = Math.pow(entropyPerGraft, k);
    const effectiveMults = applyEntropyFactor(cumMults, entropyFactor);
    const remaining = remainingExp(effectiveMults, banked, { nodeMult, targetLevel });
    const grindHours = remaining / grindExpPerSec / 3600;
    const totalHours = cumGraftHours + grindHours;
    projections.push({
      k, name, price, graftHours,
      cumCost, cumGraftHours,
      remainingExp: remaining, grindHours, totalHours,
    });
  };

  projectStep(0, null, 0, 0);

  let k = 0;
  while (true) {
    const admissible = remainingPool.filter((c) => isAdmissible(c, owned, chosenNames));
    if (admissible.length === 0) break;

    const currentRemaining = projections[projections.length - 1].remainingExp;
    const nextEntropyFactor = Math.pow(entropyPerGraft, k + 1);

    let bestCandidate = null;
    let bestScore = -Infinity;
    let bestTrialMults = null;
    for (const candidate of admissible) {
      const trialMults = multiplyMults(cumMults, candidate.mults);
      const trialEffective = applyEntropyFactor(trialMults, nextEntropyFactor);
      const trialRemaining = remainingExp(trialEffective, banked, { nodeMult, targetLevel });
      const reduction = currentRemaining - trialRemaining;
      const score = candidate.price > 0 ? reduction / candidate.price : (reduction > 0 ? Infinity : -Infinity);
      const better = score > bestScore ||
        (score === bestScore && bestCandidate !== null && candidate.price < bestCandidate.price);
      if (better) {
        bestScore = score;
        bestCandidate = candidate;
        bestTrialMults = trialMults;
      }
    }

    if (!bestCandidate) break;

    const nextCumCost = cumCost + bestCandidate.price;
    if (nextCumCost > maxSpend) break;

    k += 1;
    cumCost = nextCumCost;
    cumGraftHours += bestCandidate.graftHours;
    cumMults = bestTrialMults;
    chosenNames.push(bestCandidate.name);
    remainingPool = remainingPool.filter((c) => c.name !== bestCandidate.name);

    projectStep(k, bestCandidate.name, bestCandidate.price, bestCandidate.graftHours);
  }

  let chosenK = 0;
  let minTotalHours = projections[0].totalHours;
  for (const step of projections) {
    if (step.totalHours < minTotalHours) {
      minTotalHours = step.totalHours;
      chosenK = step.k;
    }
  }

  const ladder = projections.filter((step) => step.k >= 1 && step.k <= chosenK);

  return { ladder, chosenK, projections };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const maxSpendArg = Number(ns.args[0]);
  const maxSpend = Number.isFinite(maxSpendArg) && maxSpendArg > 0 ? maxSpendArg : DEFAULT_MAX_SPEND;
  const grindArg = Number(ns.args[1]);
  const grindExpPerSec = Number.isFinite(grindArg) && grindArg > 0 ? grindArg : DEFAULT_GRIND_EXP_PER_SEC;

  const outRecord = { ts: Date.now(), iso: new Date().toISOString(), schemaVersion: SCHEMA_VERSION };

  const player = ns.getPlayer();
  // MEASURED 2026-08-17 (logs/graftone-1787021054487.json), and it CORRECTS this file's
  // original assumption. ns.getPlayer().mults ALREADY INCLUDES the entropy debuff:
  // HemoRecirculator is a raw x1.08 per combat stat, and at entropy 1 the observed delta was
  // exactly x1.0584 = 1.08 * 0.98. The header used to assume the opposite and flagged that, if
  // wrong, this file would DOUBLE-COUNT entropy. It was wrong, so it did.
  //
  // Harmless on a first plan at entropy 0 (0.98^0 = 1), silently compounding on every REPLAN
  // after a graft -- which is exactly the failure mode the spec asked to be checked. planGraftLadder
  // models entropy itself as entropyPerGraft^k over FUTURE grafts, so it must be handed
  // entropy-FREE base mults. Divide the already-applied debuff back out here.
  const appliedEntropyFactor = Math.pow(ENTROPY_PER_GRAFT, player.entropy || 0);
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

  const opts = {
    nodeMult: NODE_MULT,
    targetLevel: TARGET_LEVEL,
    grindExpPerSec,
    entropyPerGraft: ENTROPY_PER_GRAFT,
    owned: ownedNames,
    maxSpend,
    moneyAvailable: money,
  };
  const planResult = planGraftLadder(candidateList, currentMults, banked, opts);

  // B4: every input the plan was computed from, so staleness is detectable downstream.
  outRecord.inputs = {
    currentMults, banked, entropy, money,
    nodeMult: NODE_MULT, targetLevel: TARGET_LEVEL,
    grindExpPerSec, entropyPerGraft: ENTROPY_PER_GRAFT, maxSpend,
  };
  outRecord.candidateCount = candidateList.length;
  outRecord.ladder = planResult.ladder;
  outRecord.chosenK = planResult.chosenK;
  outRecord.projections = planResult.projections;
  // Convenience fields for bn10entry.js's replan-trigger comparison (spec WI3):
  outRecord.levels = {
    strength: player.skills.strength,
    defense: player.skills.defense,
    dexterity: player.skills.dexterity,
    agility: player.skills.agility,
  };
  outRecord.timestamp = outRecord.ts;
  outRecord.moneyAvailable = money;

  ns.write(PLAN_FILE, JSON.stringify(outRecord, null, 2), "w");

  const chosenStep = planResult.projections[planResult.chosenK];
  const chosenTotalHoursLabel = chosenStep ? chosenStep.totalHours.toFixed(1) : "?";
  ns.tprint("graftplanner: " + candidateList.length + " combat-touching candidates | chosenK=" +
    planResult.chosenK + " | ladder cost $" +
    ns.format.number(planResult.ladder.reduce((sum, s) => sum + s.price, 0)) +
    " | totalHours " + chosenTotalHoursLabel);
  for (const step of planResult.ladder) {
    ns.tprint("  k=" + step.k + " " + step.name + " -- $" + ns.format.number(step.price) +
      " / " + step.graftHours.toFixed(2) + "h -> remaining " + step.remainingExp.toFixed(0) +
      " exp, total " + step.totalHours.toFixed(1) + "h");
  }
  ns.tprint("  -> " + PLAN_FILE);
}
