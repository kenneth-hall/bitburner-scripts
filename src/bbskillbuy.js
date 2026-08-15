/**
 * bbskillbuy.js - spend banked Bladeburner skill points ahead of the black-op ladder.
 *
 * WHY THIS EXISTS (2026-08-15). The engine banks skill points and never spends them:
 * Stage A runs Tracking at 100% realised success, so success-chance skills buy nothing
 * and the pile grew to ~114,000 SP idle. The black-op ladder inverts that completely --
 * every one of the 21 ops is success-gated, and Operation Daedalus reads pMax 0.0670
 * (a FALLING upper bound, i.e. a real ceiling, not an intel gap) at 7,377s per attempt.
 *
 * Two levers, both affordable from the existing bank:
 *   Blade's Intuition (+3%/lvl, all actions) x Digital Observer (+4%/lvl, Ops+BlackOps)
 *     -> success multiplier (1+0.03*BI)*(1+0.04*DO). 25/25 = 3.5x today; 200/200 = 63x.
 *   Overclock (-1% action time/lvl, max 90) -> whole ladder 16.6h serial -> 1.7h.
 *
 * NOTE ON OVERCLOCK, because the repo says it is dead: that finding
 * (docs/bn6-playbook.md, Q10) is correct FOR THE CONTRACT GRIND, where stamina is spent
 * per-action and caps throughput at ~55 actions/hour no matter how fast each one is.
 * Black ops run 1-2 HOURS each, i.e. ~0.5 actions/hour -- two orders of magnitude under
 * that ceiling -- so there the binding constraint is wall-clock time, not stamina, and
 * Overclock's 10x applies directly. Do not carry the "Overclock is dead" conclusion
 * across that boundary.
 *
 * SAFETY. Mutating (upgradeSkill), but it does NOT touch the player-action slot, so it
 * runs concurrently with bladeburnermanager.js -- no off-marker, no quiesce needed.
 * Affordability is computed BEFORE each buy (getSkillUpgradeCost is cumulative from the
 * current level, and the docs never say whether an unaffordable count partially applies).
 * Infinity is guarded: getSkillUpgradeCost returns it past a skill's max level.
 *
 * Skill points have no competing use and are NOT consumed by installs (rank and skills
 * both survive), so there is no reserve held back.
 *
 * ASCII-only on purpose: brand-new src/ files never sync (docs/dev-server.md) and get
 * seeded via in-game wget, which mangles UTF-8 punctuation into a parse error.
 *
 * Writes bbskillbuy-<epoch>.json (synced to logs/ by the vite.config.ts filter).
 */

// Priority order matters: Overclock first (cheap, and the time cut compounds over every
// retry of every op), then the two success skills kept level with each other -- the
// multiplier is a PRODUCT, so balanced levels beat a lopsided stack at equal spend.
const BUY_PLAN = [
  { skill: "Overclock", target: 90 },
  { skill: "Blade's Intuition", target: 200 },
  { skill: "Digital Observer", target: 200 },
  { skill: "Reaper", target: 50 },
];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const outRec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "spend banked SP ahead of the black-op ladder",
    dryRun: ns.args[0] === "dry",
    steps: [],
  };

  const flush = (label) => {
    outRec.stage = label;
    try {
      ns.write("bbskillbuy-" + outRec.ts + ".json", JSON.stringify(outRec, null, 2), "w");
    } catch (err) {
      ns.tprint("bbskillbuy: WRITE FAILED at " + label + ": " + String(err));
    }
  };

  if (!ns.bladeburner.inBladeburner()) {
    outRec.abort = "not in the Bladeburner division";
    flush("abort");
    ns.tprint("bbskillbuy: ABORT - not in the Bladeburner division");
    return;
  }

  const successMult = () =>
    (1 + 0.03 * ns.bladeburner.getSkillLevel("Blade's Intuition")) *
    (1 + 0.04 * ns.bladeburner.getSkillLevel("Digital Observer"));

  outRec.before = {
    skillPoints: ns.bladeburner.getSkillPoints(),
    rank: ns.bladeburner.getRank(),
    successMultiplier: successMult(),
    actionTimeMultiplier: 1 - 0.01 * ns.bladeburner.getSkillLevel("Overclock"),
    levels: {},
  };
  for (const entry of BUY_PLAN) outRec.before.levels[entry.skill] = ns.bladeburner.getSkillLevel(entry.skill);
  flush("before");

  for (const entry of BUY_PLAN) {
    const spName = entry.skill;
    const curLevel = ns.bladeburner.getSkillLevel(spName);
    const pointsNow = ns.bladeburner.getSkillPoints();
    const step = { skill: spName, fromLevel: curLevel, target: entry.target, pointsAvailable: pointsNow };

    if (curLevel >= entry.target) {
      step.result = "already-at-or-above-target";
      outRec.steps.push(step);
      continue;
    }

    // Walk DOWN from the requested count to the largest affordable one. Infinity means
    // the skill's max level is below that count, so it is also a signal to shrink.
    let stepCount = entry.target - curLevel;
    let costTotal = Infinity;
    while (stepCount > 0) {
      const quoted = ns.bladeburner.getSkillUpgradeCost(spName, stepCount);
      if (Number.isFinite(quoted) && quoted <= pointsNow) {
        costTotal = quoted;
        break;
      }
      stepCount -= 1;
    }

    if (stepCount <= 0) {
      step.result = "unaffordable-or-at-max";
      step.nextSingleCost = ns.bladeburner.getSkillUpgradeCost(spName, 1);
      outRec.steps.push(step);
      continue;
    }

    step.count = stepCount;
    step.cost = costTotal;
    step.toLevel = curLevel + stepCount;

    if (outRec.dryRun) {
      step.result = "dry-run (not purchased)";
      outRec.steps.push(step);
      continue;
    }

    const bought = ns.bladeburner.upgradeSkill(spName, stepCount);
    step.upgradeSkillReturned = bought;
    // Verify against a re-read rather than trusting the boolean -- CLAUDE.md's
    // "verify, don't trust the return value" rule, and startAction has already been
    // caught returning true while nothing happened.
    step.levelAfter = ns.bladeburner.getSkillLevel(spName);
    step.pointsAfter = ns.bladeburner.getSkillPoints();
    step.result = step.levelAfter === step.toLevel ? "ok" : "MISMATCH - level did not reach target";
    outRec.steps.push(step);
    flush("step-" + spName);
    await ns.sleep(50);
  }

  outRec.after = {
    skillPoints: ns.bladeburner.getSkillPoints(),
    successMultiplier: successMult(),
    actionTimeMultiplier: 1 - 0.01 * ns.bladeburner.getSkillLevel("Overclock"),
    levels: {},
  };
  for (const entry of BUY_PLAN) outRec.after.levels[entry.skill] = ns.bladeburner.getSkillLevel(entry.skill);

  outRec.deltas = {
    successMultiplier: outRec.before.successMultiplier + " -> " + outRec.after.successMultiplier,
    actionTimeMultiplier: outRec.before.actionTimeMultiplier + " -> " + outRec.after.actionTimeMultiplier,
    skillPointsSpent: outRec.before.skillPoints - outRec.after.skillPoints,
  };
  flush("done");

  ns.tprint(
    "bbskillbuy: " + (outRec.dryRun ? "DRY RUN " : "") +
    "SP " + ns.format.number(outRec.before.skillPoints) + " -> " + ns.format.number(outRec.after.skillPoints) +
    " | success x" + outRec.before.successMultiplier.toFixed(2) + " -> x" + outRec.after.successMultiplier.toFixed(2) +
    " | action time x" + outRec.before.actionTimeMultiplier.toFixed(2) + " -> x" + outRec.after.actionTimeMultiplier.toFixed(2)
  );
  for (const step of outRec.steps) {
    ns.tprint("  " + step.skill + ": L" + step.fromLevel + " -> L" + (step.levelAfter ?? step.toLevel ?? step.fromLevel) + " [" + step.result + "]");
  }
  ns.tprint("  -> bbskillbuy-" + outRec.ts + ".json");
}
