/**
 * bladeburnertrial.js - the live trial bladeburneractionprobe.js's numbers demanded: does
 * scouting (Field Analysis) or skill investment change the measured rank/sec rate?
 *
 * bladeburneractionprobe.js measured a bad rate (~5-6 months to rank 400,000) at zero skill
 * investment and zero scouting. Two unknowns stood between that and a verdict (see
 * docs/bn6-playbook.md §1): does Field Analysis narrow the population estimate (the in-game
 * doc's unverified claim), and does spending skill points (untestable read-only -- we held 0 SP
 * at rank 0) move success chance/rank gain. This is a REAL engine action, not a probe -- it calls
 * startAction and upgradeSkill, both state-mutating. Run only with Kenneth's go-ahead.
 *
 * ⚠️ v1 BUG, FIXED HERE: `startAction` is NOT one-shot -- it behaves like `commitCrime`
 * (docs/bladeburner-reference.md's combat-grind lesson repeating): once started, the SAME action
 * auto-repeats indefinitely until a different action is started or `stopBladeburnerAction()` is
 * called. `getCurrentAction()` never returns null between reps, so a `while (getCurrentAction()
 * !== null)` loop never exits. v1 ran this way for 23 real minutes, stuck re-running Field
 * Analysis (harmless, since Field Analysis is what the scout phase wanted anyway -- it just
 * never advanced past the scout phase into the grind phase). Confirmed live: rank climbed to
 * 5.1, 1 skill point accrued, and Raid's success-chance RANGE collapsed from a spread
 * ([0.075, 0.097] pre-trial) to a single point estimate (0.0901) -- direct evidence FOR the
 * in-game doc's unverified "the estimate narrows as you scout" claim. That data point is banked
 * and this version does NOT re-scout from scratch (SCOUT_COUNT below reflects that).
 *
 * Fix: detect one completed rep by polling `getActionCurrentTime()` and watching for it to drop
 * (wrap from near the action's full time back down near 0) rather than waiting for
 * `getCurrentAction()` to go null. Switching actions still uses `startAction` with a different
 * name, which appears to preempt the auto-repeat (unconfirmed by docs, observed empirically here).
 *
 * Design:
 *  1. Scout phase (SCOUT_COUNT reps, may be 0 -- see above).
 *  2. Grind phase (unbounded): each cycle, recompute expected rank/sec for all 3 contracts + 6
 *     operations (same formula as bladeburneractionprobe.js), run the current best one to ONE
 *     completion, log the actual rank delta, then spend any accrued skill points on the cheapest
 *     affordable skill (broad round-robin -- effects are undocumented, so this tests "does
 *     investment help at all" rather than isolating one skill).
 *
 * Control loop: await ns.bladeburner.nextUpdate() between polls -- 0 GB, wakes on the engine's
 * own update boundary (docs/bladeburner-reference.md §6).
 *
 * RAM: ~46.6 GB -- does not fit alongside augfarmer.js (64.10 GB) on a 128 GB home. Kill
 * augfarmer.js for the trial's duration and restart it after (same pattern as the probes).
 *
 * Writes bladeburnertrial-log.json (ring-capped). Runs until killed -- there is no natural stop
 * condition since this is exploratory. Check progress via the log, not by waiting for it to end.
 */

const CONTRACTS = ["Tracking", "Bounty Hunter", "Retirement"];
const OPERATIONS = [
  "Investigation", "Undercover Operation", "Sting Operation", "Raid",
  "Stealth Retirement Operation", "Assassination",
];
const SKILLS = [
  "Blade's Intuition", "Cloak", "Short-Circuit", "Digital Observer", "Tracer", "Overclock",
  "Reaper", "Evasive System", "Datamancer", "Cyber's Edge", "Hands of Midas", "Hyperdrive",
];
const SCOUT_ACTION = { type: "General", name: "Field Analysis" };
const REFERENCE_ACTION = { type: "Operations", name: "Raid" };
const SCOUT_COUNT = 0; // v1 already banked ~50 reps live; see docstring
const LOG_FILE = "bladeburnertrial-log.json";
const RING_CAP = 1000;

export async function main(ns) {
  ns.disableLog("ALL");

  let entries = [];
  const raw = ns.read(LOG_FILE);
  if (raw) { try { entries = JSON.parse(raw) || []; } catch { entries = []; } }
  const append = (rec) => {
    entries.push(rec);
    if (entries.length > RING_CAP) entries = entries.slice(entries.length - RING_CAP);
    ns.write(LOG_FILE, JSON.stringify(entries, null, 2), "w");
  };

  // Runs `type`/`name` to exactly ONE completion, detected via getActionCurrentTime() wrapping
  // back down after startAction's auto-repeat begins a fresh rep.
  const runOneCompletion = async (type, name) => {
    const cur = ns.bladeburner.getCurrentAction();
    if (!cur || cur.type !== type || cur.name !== name) {
      ns.bladeburner.startAction(type, name);
    }
    let lastElapsed = ns.bladeburner.getActionCurrentTime();
    let ticks = 0;
    while (true) {
      await ns.bladeburner.nextUpdate();
      ticks++;
      const c = ns.bladeburner.getCurrentAction();
      if (!c || c.type !== type || c.name !== name) {
        // Something displaced us (shouldn't happen solo) -- re-assert and keep waiting.
        ns.bladeburner.startAction(type, name);
        lastElapsed = 0;
        continue;
      }
      const elapsed = ns.bladeburner.getActionCurrentTime();
      if (elapsed < lastElapsed) return { ticks }; // wrapped -- one rep completed
      lastElapsed = elapsed;
    }
  };

  const spendSkillPoints = () => {
    const spent = [];
    let sp = ns.bladeburner.getSkillPoints();
    let progressed = true;
    while (sp > 0 && progressed) {
      progressed = false;
      let cheapestName = null;
      let cheapestCost = Infinity;
      for (const name of SKILLS) {
        const cost = ns.bladeburner.getSkillUpgradeCost(name, 1);
        if (cost <= sp && cost < cheapestCost) { cheapestCost = cost; cheapestName = name; }
      }
      if (cheapestName && ns.bladeburner.upgradeSkill(cheapestName, 1)) {
        spent.push({ skill: cheapestName, cost: cheapestCost, newLevel: ns.bladeburner.getSkillLevel(cheapestName) });
        sp -= cheapestCost;
        progressed = true;
      }
    }
    return spent;
  };

  const bestAction = () => {
    let best = null;
    for (const [type, names] of [["Contracts", CONTRACTS], ["Operations", OPERATIONS]]) {
      for (const name of names) {
        const [pMin] = ns.bladeburner.getActionEstimatedSuccessChance(type, name);
        const gain = ns.bladeburner.getActionRankGain(type, name);
        const loss = ns.bladeburner.getActionRankLoss(type, name);
        const timeMs = ns.bladeburner.getActionTime(type, name);
        const expectedPerSec = (pMin * gain - (1 - pMin) * loss) / (timeMs / 1000);
        if (!best || expectedPerSec > best.expectedPerSec) best = { type, name, expectedPerSec, pMin, gain, loss, timeMs };
      }
    }
    return best;
  };

  // --- Scout phase (skippable, see SCOUT_COUNT) ---
  const preScout = ns.bladeburner.getActionEstimatedSuccessChance(REFERENCE_ACTION.type, REFERENCE_ACTION.name);
  append({ t: Date.now(), event: "start", rank: ns.bladeburner.getRank(), skillPoints: ns.bladeburner.getSkillPoints(), preScoutRaidChance: preScout });
  if (SCOUT_COUNT > 0) {
    ns.tprint("bladeburnertrial: scouting via Field Analysis x" + SCOUT_COUNT + " (Raid chance now " + JSON.stringify(preScout) + ")");
    for (let i = 0; i < SCOUT_COUNT; i++) {
      await runOneCompletion(SCOUT_ACTION.type, SCOUT_ACTION.name);
    }
    const postScout = ns.bladeburner.getActionEstimatedSuccessChance(REFERENCE_ACTION.type, REFERENCE_ACTION.name);
    append({ t: Date.now(), event: "post-scout", rank: ns.bladeburner.getRank(), preScoutRaidChance: preScout, postScoutRaidChance: postScout });
    ns.tprint("bladeburnertrial: scouting done. Raid chance " + JSON.stringify(preScout) + " -> " + JSON.stringify(postScout));
  } else {
    ns.tprint("bladeburnertrial: skipping scout phase (already banked live in v1) -- Raid chance now " + JSON.stringify(preScout));
  }

  // --- Grind phase, unbounded ---
  // v3: chance decayed steadily across v2's 22-cycle run, unrelated to rank/skills -- likely the
  // undocumented chaos mechanic. Every DIPLOMACY_EVERY cycles, run Diplomacy once (always 100%
  // success per the earlier action-yield probe) and log Raid's chance immediately before/after,
  // to test whether it's a chaos-reduction lever.
  const DIPLOMACY_EVERY = 5;
  ns.tprint("bladeburnertrial: entering adaptive grind loop (v3, testing Diplomacy every " + DIPLOMACY_EVERY + ")");
  let lastRank = ns.bladeburner.getRank();
  let actionsRun = 0;
  while (true) {
    if (actionsRun > 0 && actionsRun % DIPLOMACY_EVERY === 0) {
      const preChance = ns.bladeburner.getActionEstimatedSuccessChance(REFERENCE_ACTION.type, REFERENCE_ACTION.name);
      await runOneCompletion("General", "Diplomacy");
      const postChance = ns.bladeburner.getActionEstimatedSuccessChance(REFERENCE_ACTION.type, REFERENCE_ACTION.name);
      append({ t: Date.now(), event: "diplomacy", actionsRun, preChance, postChance });
      ns.tprint("bladeburnertrial: Diplomacy run -- Raid chance " + JSON.stringify(preChance) + " -> " + JSON.stringify(postChance));
    }

    const choice = bestAction();
    await runOneCompletion(choice.type, choice.name);
    actionsRun++;

    const newRank = ns.bladeburner.getRank();
    const rankDelta = newRank - lastRank;
    lastRank = newRank;

    const spent = spendSkillPoints();

    append({
      t: Date.now(), event: "action", actionsRun, action: choice.name,
      predictedExpectedPerSec: choice.expectedPerSec, predictedChance: choice.pMin,
      rankDelta, newRank, skillsSpent: spent,
    });

    if (actionsRun % 5 === 0) {
      ns.tprint("bladeburnertrial: " + actionsRun + " actions | " + choice.name +
        " (predicted " + choice.expectedPerSec.toFixed(4) + " rank/sec) | rank " + newRank.toFixed(2) +
        " | SP spent this cycle: " + spent.length);
    }
  }
}
