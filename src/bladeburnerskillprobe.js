/**
 * bladeburnerskillprobe.js - read-only, post-employment: cost/level sweep across all 12
 * Bladeburner skills.
 *
 * Sibling to bladeburneractionprobe.js, split out to keep each probe's RAM small rather than
 * one large script. Answers what docs/bladeburner-reference.md §8 still lists open: the skills'
 * cost curves (getSkillUpgradeCost throws pre-employment).
 *
 * Read-only: no upgradeSkill, nothing that mutates game state.
 *
 * ---- 2026-08-02 EXTENSION (Phase 39 Q1 -- the feasibility gate) ----------------
 * The original probe read only the next-1 and next-5 costs, which is enough to say
 * "cheap early" and nothing at all about the regime that matters. Phase 39's whole
 * two-stage bootstrap rests on a number nobody has measured: HOW MUCH RANK does it
 * cost to make Operations actually succeed?
 *
 * Rough extrapolation from two data points suggested ~15,000 SP (~45,000 rank) to take
 * Blade's Intuition + Digital Observer to ~100 each -- i.e. weeks. That estimate is
 * doing far too much load-bearing work for its evidence, so this sweep replaces it with
 * the real curve:
 *   - cumulative cost from the CURRENT level to a ladder of target levels, per skill
 *     (getSkillUpgradeCost's `count` is cumulative from current level, so target-current)
 *   - the success/throughput multiplier each target buys, from the in-panel per-level
 *     effects, so cost and benefit sit side by side
 *   - rank required = SP x 3 (panel: "one skill point every 3 ranks")
 *   - skillMaxUpgradeCount inverted against a ladder of hypothetical SP budgets
 *
 * Writes bladeburnerskillprobe-<epoch>.json (synced to logs/ by the vite.config.ts filter).
 */

const SKILLS = [
  "Blade's Intuition", "Cloak", "Short-Circuit", "Digital Observer", "Tracer", "Overclock",
  "Reaper", "Evasive System", "Datamancer", "Cyber's Edge", "Hands of Midas", "Hyperdrive",
];

// Per-level effect, from the in-game Skills tab (docs/bladeburner-reference.md S5).
// `kind` records what the bonus applies to so the report can pair cost with benefit.
const EFFECT = {
  "Blade's Intuition": { perLevel: 0.03, kind: "success: all Contracts/Operations/BlackOps" },
  "Cloak": { perLevel: 0.055, kind: "success: stealth-related" },
  "Short-Circuit": { perLevel: 0.055, kind: "success: retirement-related" },
  "Digital Observer": { perLevel: 0.04, kind: "success: all Operations + BlackOps" },
  "Tracer": { perLevel: 0.04, kind: "success: all Contracts" },
  "Overclock": { perLevel: -0.01, kind: "action time (max level 90)", maxLevel: 90 },
  "Reaper": { perLevel: 0.02, kind: "effective combat stats" },
  "Evasive System": { perLevel: 0.04, kind: "effective dex + agi" },
  "Datamancer": { perLevel: 0.05, kind: "population analysis effectiveness" },
  "Cyber's Edge": { perLevel: 0.02, kind: "max stamina" },
  "Hands of Midas": { perLevel: 0.10, kind: "contract money" },
  "Hyperdrive": { perLevel: 0.10, kind: "experience gain" },
};

const TARGET_LEVELS = [10, 25, 50, 75, 90, 100, 150, 200, 300];
const SP_BUDGETS = [100, 500, 1_000, 5_000, 10_000, 50_000, 133_000];
const RANKS_PER_SP = 3; // panel: "You will gain one skill point every 3 ranks."

/** Pure. Multiplier a skill's stated per-level effect reaches at `level`. */
function multiplierAt(name, level) {
  const e = EFFECT[name];
  if (!e) return null;
  return 1 + e.perLevel * level;
}

export async function main(ns) {
  const out = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "read-only skill cost/level sweep + Phase 39 Q1 feasibility ladder",
    ranksPerSkillPoint: RANKS_PER_SP,
  };

  out.skillPoints = ns.bladeburner.getSkillPoints();
  out.rank = ns.bladeburner.getRank();

  out.skills = SKILLS.map((name) => {
    const rec = { name, effect: EFFECT[name] ?? null };
    try { rec.level = ns.bladeburner.getSkillLevel(name); } catch (e) { rec.levelErr = String(e).slice(0, 200); }
    try { rec.nextCost = ns.bladeburner.getSkillUpgradeCost(name, 1); } catch (e) { rec.nextCostErr = String(e).slice(0, 200); }
    try { rec.next5Cost = ns.bladeburner.getSkillUpgradeCost(name, 5); } catch (e) { rec.next5CostErr = String(e).slice(0, 200); }
    try {
      rec.maxAffordableAtCurrentPoints = ns.formulas.bladeburner.skillMaxUpgradeCount(name, rec.level ?? 0, out.skillPoints);
    } catch (e) { rec.maxAffordableErr = String(e).slice(0, 200); }

    // ---- the ladder: cumulative SP (and therefore rank) to reach each target level ----
    const cur = rec.level ?? 0;
    rec.currentMultiplier = multiplierAt(name, cur);
    rec.ladder = [];
    for (const target of TARGET_LEVELS) {
      if (target <= cur) continue;
      const step = { targetLevel: target };
      try {
        const cost = ns.bladeburner.getSkillUpgradeCost(name, target - cur);
        step.cumulativeSp = cost;
        step.rankRequired = Number.isFinite(cost) ? cost * RANKS_PER_SP : cost;
        step.multiplier = multiplierAt(name, target);
      } catch (e) { step.err = String(e).slice(0, 200); }
      rec.ladder.push(step);
    }

    // ---- the inverse: how many levels does a given SP budget buy from here? ----
    rec.byBudget = SP_BUDGETS.map((sp) => {
      const b = { skillPoints: sp, rankRequired: sp * RANKS_PER_SP };
      try {
        b.levelsGained = ns.formulas.bladeburner.skillMaxUpgradeCount(name, cur, sp);
        b.resultingLevel = cur + b.levelsGained;
        b.resultingMultiplier = multiplierAt(name, b.resultingLevel);
      } catch (e) { b.err = String(e).slice(0, 200); }
      return b;
    });

    return rec;
  });

  // ---- headline: the two skills that gate the Stage A -> Stage B tier switch ----
  // Operation success scales as (1 + 0.03*BI) * (1 + 0.04*DO) -- the panel states
  // per-skill bonuses are additive within a skill and MULTIPLICATIVE across skills.
  const bi = out.skills.find((s) => s.name === "Blade's Intuition");
  const dobs = out.skills.find((s) => s.name === "Digital Observer");
  const oc = out.skills.find((s) => s.name === "Overclock");
  out.headline = {
    note: "Operation success multiplier = (1+0.03*BladesIntuition) * (1+0.04*DigitalObserver); Overclock is pure throughput.",
    current: {
      bladesIntuition: bi?.level,
      digitalObserver: dobs?.level,
      overclock: oc?.level,
      operationSuccessMultiplier: (multiplierAt("Blade's Intuition", bi?.level ?? 0) ?? 1) * (multiplierAt("Digital Observer", dobs?.level ?? 0) ?? 1),
      actionTimeMultiplier: multiplierAt("Overclock", oc?.level ?? 0),
    },
    combinedTargets: TARGET_LEVELS.map((t) => {
      const row = { bothSkillsAtLevel: t };
      const biStep = bi?.ladder?.find((l) => l.targetLevel === t);
      const doStep = dobs?.ladder?.find((l) => l.targetLevel === t);
      if (biStep && doStep && Number.isFinite(biStep.cumulativeSp) && Number.isFinite(doStep.cumulativeSp)) {
        row.totalSp = biStep.cumulativeSp + doStep.cumulativeSp;
        row.totalRankRequired = row.totalSp * RANKS_PER_SP;
        row.operationSuccessMultiplier = (multiplierAt("Blade's Intuition", t) ?? 1) * (multiplierAt("Digital Observer", t) ?? 1);
      }
      return row;
    }),
    overclockToMax: oc?.ladder?.find((l) => l.targetLevel === 90) ?? null,
  };

  const file = "bladeburnerskillprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");

  ns.tprint("bladeburnerskillprobe: rank=" + out.rank.toFixed(0) + " skillPoints=" + out.skillPoints);
  ns.tprint("  Overclock->90: " + JSON.stringify(out.headline.overclockToMax));
  for (const row of out.headline.combinedTargets) {
    if (row.totalSp !== undefined) {
      ns.tprint("  BI+DO both L" + row.bothSkillsAtLevel + ": " + row.totalSp.toFixed(0) + " SP = " + row.totalRankRequired.toFixed(0) + " rank -> opSuccess x" + row.operationSuccessMultiplier.toFixed(2));
    }
  }
  ns.tprint("  -> " + file);
}
