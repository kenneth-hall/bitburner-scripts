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
// 2026-08-16: the success-skill target is now an argument. The first pass hardcoded
// 200/200, which was right for opening the ladder but is not where it ends -- the last
// three ops sit at ~18-20% success with a ~30% rank penalty per failure, so the target
// is now a tuning knob rather than a constant.
//   run bbskillbuy.js dry          -> plan at the default target, buy nothing
//   run bbskillbuy.js 250 dry      -> plan at BI/DO 250, buy nothing
//   run bbskillbuy.js 250          -> buy toward BI/DO 250
const DEFAULT_SUCCESS_TARGET = 200;

// ---------------------------------------------------------------------------
// The success multiplier is a PRODUCT: (1 + 0.03*BI) * (1 + 0.04*DO). Spending the
// bank in list order therefore starves whichever skill comes second.
//
// Measured live 2026-08-25 in BN10, spending 535,869 SP at target 2000:
//   Blade's Intuition: L250 -> L756 [ok]
//   Digital Observer:  L250 -> L250 [unaffordable-or-at-max]
// ...and it reported [ok]. Realised x260 against a balanced ~x475 at equal spend --
// roughly 1.8x thrown away. Harmless in BN10 (the ladder was already cleared); this
// file's own header had said "balanced levels beat a lopsided stack at equal spend"
// the whole time, so the principle was written down and not implemented.
//
// The fix is a marginal-value walk: at each step buy the ONE level, on whichever of
// the two skills, that raises the product most per skill point spent. Costs rise with
// level while the multiplicative gain per level shrinks, so a per-step greedy on
// (gain - 1) / cost tracks the balanced optimum instead of draining one side.
export const BI_PER_LEVEL = 0.03;
export const DO_PER_LEVEL = 0.04;

/** Pure. The success multiplier at given levels. */
export function successMultiplierAt(biLevel, doLevel) {
  return (1 + BI_PER_LEVEL * biLevel) * (1 + DO_PER_LEVEL * doLevel);
}

/**
 * Pure. Which single level to buy next, or null when neither is worth/able to buy.
 * `biCost`/`doCost` are the quoted cost of ONE more level (Infinity/NaN when maxed).
 * Ties go to Digital Observer -- it carries the larger per-level coefficient, so at
 * equal score it compounds faster.
 */
export function pickNextSuccessLevel({ biLevel, doLevel, biCost, doCost, points, target }) {
  const base = successMultiplierAt(biLevel, doLevel);
  const scoreOf = (gain, cost) =>
    Number.isFinite(cost) && cost > 0 && cost <= points ? (gain / base - 1) / cost : -Infinity;
  const biOk = biLevel < target;
  const doOk = doLevel < target;
  const biScore = biOk ? scoreOf(successMultiplierAt(biLevel + 1, doLevel), biCost) : -Infinity;
  const doScore = doOk ? scoreOf(successMultiplierAt(biLevel, doLevel + 1), doCost) : -Infinity;
  if (biScore === -Infinity && doScore === -Infinity) return null;
  return doScore >= biScore ? "Digital Observer" : "Blade's Intuition";
}


function buildPlan(successTarget) {
  // 2026-09-01 (BN9 Stage A): Reaper BEFORE Overclock. Overclock only pays when action
  // time binds; stamina is spent PER ACTION (Q10), so on Stage A's 41-78s contracts it
  // buys no throughput at all -- measured live here at stamina fraction 0.553 against a
  // 0.50 floor, i.e. stamina-bound, not time-bound. Reaper raises combat stats and so
  // raises success chance NOW. Overclock stays in the plan because it mattered enormously
  // on BN6's 185-7,377s black ops; it just must not out-rank a live lever to get there.
  return [
    { skill: "Reaper", target: 50 },
    { skill: "Overclock", target: 90 },
  ];
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const argTarget = ns.args.map(Number).find((n) => Number.isFinite(n) && n > 0);
  const successTarget = argTarget ?? DEFAULT_SUCCESS_TARGET;
  const BUY_PLAN = buildPlan(successTarget);

  const outRec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "spend banked SP ahead of the black-op ladder",
    dryRun: ns.args.includes("dry"),
    successTarget,
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
  for (const sp of ["Blade's Intuition", "Digital Observer"]) outRec.before.levels[sp] = ns.bladeburner.getSkillLevel(sp);
  flush("before");

  // Interleaved success-skill pass -- see pickNextSuccessLevel above. Runs before the
  // sequential plan so the product-valued pair is never starved by list order.
  const SUCCESS_PAIR = ["Blade's Intuition", "Digital Observer"];
  outRec.successPass = { target: successTarget, bought: { "Blade's Intuition": 0, "Digital Observer": 0 }, steps: 0 };
  for (let guard = 0; guard < 100000; guard += 1) {
    const biLevel = ns.bladeburner.getSkillLevel("Blade's Intuition");
    const doLevel = ns.bladeburner.getSkillLevel("Digital Observer");
    const points = ns.bladeburner.getSkillPoints();
    const choice = pickNextSuccessLevel({
      biLevel,
      doLevel,
      biCost: ns.bladeburner.getSkillUpgradeCost("Blade's Intuition", 1),
      doCost: ns.bladeburner.getSkillUpgradeCost("Digital Observer", 1),
      points,
      target: successTarget,
    });
    if (choice === null) break;
    if (outRec.dryRun) {
      outRec.successPass.bought[choice] += 1;
      outRec.successPass.steps += 1;
      // Dry run cannot advance real levels, so stop after recording the first pick.
      outRec.successPass.dryRunNote = "first pick only -- levels cannot advance without buying";
      break;
    }
    ns.bladeburner.upgradeSkill(choice, 1);
    const after = ns.bladeburner.getSkillLevel(choice);
    const expected = (choice === "Blade's Intuition" ? biLevel : doLevel) + 1;
    if (after !== expected) {
      outRec.successPass.abort = "MISMATCH on " + choice + " -- level did not advance";
      break;
    }
    outRec.successPass.bought[choice] += 1;
    outRec.successPass.steps += 1;
    if (outRec.successPass.steps % 50 === 0) await ns.sleep(20);
  }
  outRec.successPass.levelsAfter = {
    "Blade's Intuition": ns.bladeburner.getSkillLevel("Blade's Intuition"),
    "Digital Observer": ns.bladeburner.getSkillLevel("Digital Observer"),
  };
  flush("success-pass");

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
  for (const sp of ["Blade's Intuition", "Digital Observer"]) outRec.after.levels[sp] = ns.bladeburner.getSkillLevel(sp);

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

// touch to force resync
