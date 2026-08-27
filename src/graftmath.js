/**
 * graftmath.js -- Phase 43 WI-C: the shared graft-ladder planning surface, and a genuinely
 * ZERO-`ns` module. Every function here takes live game state as plain-value parameters from
 * its caller; none of them reads it itself.
 *
 * WHY THIS FILE EXISTS, RATHER THAN LIVING IN common.js (spec 12.3). common.js already exists
 * and is already shared, but it calls ns.scan (x3)/ns.tprint/ns.getScriptRam and imports
 * WORKER_SCRIPTS from scheduler.js -- importing graft-planning code from it would charge any
 * importer ~0.9-1.0 GB via the exact import-bleed pattern CLAUDE.md documents by name
 * (targetsmonitor.js importing a four-line pure helper out of scheduler.js and being charged
 * for hack/grow/weaken/getScriptRam/fileExists it never called). common.js's own header also
 * states its charter as "no policy decisions, no batching/finance math" -- a beam search does
 * not belong there on that ground alone.
 *
 * THE HARD RULE, enforced by code review before every commit: this file contains ZERO `ns.*`
 * calls, and it imports NOTHING that contains one (never common.js, never scheduler.js,
 * nothing ns-bearing). Verify with `grep -n "ns\." src/graftmath.js` returning nothing outside
 * comments before every commit. This makes its RAM contribution to any importer exactly 0 GB
 * -- a property to be verified live (WC7), not merely asserted from the source containing no
 * "ns." text.
 *
 * WHY A BEAM SEARCH, NOT GREEDY (spec Section 0). graftplanner.js (Phase 41) selected grafts by
 * SUMMED exp-deficit reduction per dollar -- wrong, because the gate is
 * min(str,def,dex,agi) >= 100, and a sum is not a minimum. A width-1 greedy fix (score by
 * bottleneck-hours reduction per graft-hour) is ALSO wrong: from BN9's exact starting point (all
 * four mults tied at 1.3824, stats tied at 1/1/1/1), any candidate that doesn't touch all four
 * stats leaves min() unmoved while entropy (0.98^(k+1)) lowers every mult -- a strictly negative
 * score for every partial-coverage candidate, so width-1 greedy can only ever pick all-four-stat
 * augs. Measured: 52.6h at width 1 vs 21.17h converged (beam width >= 300) -- greedy is 2.5x
 * worse. See test/graftmath.test.js for a synthetic fixture reproducing this exact failure mode
 * (the real BN9 catalog capture, logs/graftrecon-<epoch>.json, is gitignored and was not
 * available to this implementation pass -- see that test file's header for the full note, and
 * BACKLOG.md for the follow-up to check the golden numbers in once a live capture exists,
 * mirroring how test/fixtures/graft-catalog-bn10.json was captured and tracked for Phase 41).
 *
 * IDENTIFIER HYGIENE. No local/property/object-key name here is `graft`, `work`, `exec`,
 * `share`, `read`, `write`, `kill`, `run`, `ls`, `ps`, `scan`, `hack`, `grow`, `tail`, `window`,
 * `document`, `process`, or any other real ns/DOM global name.
 *
 * ASCII-only (brand-new src/ file -- viteburner's new-file upload bug needs an ASCII wget seed).
 */

export const STATS = ["strength", "defense", "dexterity", "agility"];

/**
 * Per-BitNode planning constants. BN10's values are Phase 41's exact constants (NODE_MULT 0.4,
 * TARGET_LEVEL 100, ENTROPY_PER_GRAFT 0.98, DEFAULT_GRIND_EXP_PER_SEC 2.62, DEFAULT_MAX_SPEND
 * 1.5e9) -- resolveNodeConfig(10, {}) must reproduce them exactly (WC5).
 *
 * BN9's nodeMult (0.45) is measured (CLAUDE.md: "BN9 combat level mult 0.45"). grindExpPerSec
 * is deliberately the BORROWED BN6 Mug placeholder (0.179 exp/s/stat) -- WI-D's CALIBRATE_GRIND
 * step (spec Section 6) is mandatory precisely because this placeholder is not trustworthy (a
 * 3x error in it swings irreversible spend 4.6x); it exists here only so a plan can be computed
 * at all before the first live calibration lands, and bn9entry-log.json must record
 * "calibration-pending" as the rate source whenever this exact value is still in effect (WD-CAL3).
 * maxSpend (10b) is a generous search-space ceiling covering the features doc's measured
 * $3.83-4.84b range with headroom -- NOT a safety rail (bn9entry.js carries no MAX_GRAFT_SPEND
 * rail in this spec, unlike bn10entry.js's R1; this is purely a beam-search cutoff so the search
 * does not wander into implausibly expensive candidate sets).
 */
export const NODE_CONFIGS = {
  9: {
    nodeMult: 0.45,
    targetLevel: 100,
    entropyPerGraft: 0.98,
    grindExpPerSec: 0.179, // calibration-pending placeholder -- see comment above
    maxSpend: 10_000_000_000,
    beamWidth: 300,
    maxDepth: 14,
  },
  10: {
    nodeMult: 0.4,
    targetLevel: 100,
    entropyPerGraft: 0.98,
    grindExpPerSec: 2.62,
    maxSpend: 1_500_000_000,
    beamWidth: 300,
    maxDepth: 14,
  },
};

/** Pure. Merges NODE_CONFIGS[bitNodeN] with `overrides` (e.g. a live-calibrated grindExpPerSec). */
export function resolveNodeConfig(bitNodeN, overrides) {
  const base = NODE_CONFIGS[bitNodeN];
  if (!base) {
    throw new Error("graftmath: no NODE_CONFIGS entry for BitNode " + bitNodeN);
  }
  return { ...base, ...(overrides || {}) };
}

/**
 * Pure. e^((level/effectiveMult + 200)/32) - 534.6 -- the exp-to-level formula, validated
 * against BN6's measured combat-gate cost: expForLevel(100, 1.28) = 5,417/stat.
 */
export function expForLevel(level, effectiveMult) {
  return Math.exp((level / effectiveMult + 200) / 32) - 534.6;
}

/**
 * Pure. Hours of grinding still needed for ONE stat to reach opts.targetLevel, at a scalar
 * grind rate (exp/sec) for that stat. `mult` is this stat's CURRENT effective-mult INPUT
 * (already entropy-adjusted by the caller -- this function applies opts.nodeMult on top, same
 * split as remainingExp/planGraftLadder used to). Returns 0 if already past target, Infinity if
 * exp is still needed but the grind rate is 0 or negative (unreachable by grinding alone).
 */
export function statHoursRemaining(mult, banked, grindRateForStat, opts) {
  const { nodeMult, targetLevel } = opts;
  const effectiveMult = mult * nodeMult;
  const need = expForLevel(targetLevel, effectiveMult);
  const remaining = Math.max(0, need - banked);
  if (remaining === 0) return 0;
  if (!(grindRateForStat > 0)) return Infinity;
  return remaining / grindRateForStat / 3600;
}

/**
 * Pure. max() over the four stats' statHoursRemaining -- THE gate is min(stat) >= targetLevel,
 * so the hours-to-clear-it is bounded by the WORST (slowest) stat, never a sum or an average.
 * This is the function whose absence made the original sum-based selection wrong (spec Section 0).
 *
 * grindRatePerStat may be a single scalar (applied to every stat) or a CombatQuad-shaped object
 * ({strength, defense, dexterity, agility}) -- CALIBRATE_GRIND measures per-stat rates, but a
 * uniform placeholder (e.g. NODE_CONFIGS' borrowed default) is a legitimate scalar input too.
 */
export function bottleneckHours(mults, banked, grindRatePerStat, opts) {
  let worst = 0;
  for (const stat of STATS) {
    const rate = typeof grindRatePerStat === "number" ? grindRatePerStat : grindRatePerStat[stat];
    const hours = statHoursRemaining(mults[stat], banked[stat], rate, opts);
    if (hours > worst) worst = hours;
  }
  return worst;
}

/**
 * Pure. Hours of waiting for money to arrive before `cumCost` is affordable, given a flat
 * income rate in dollars/second. 0 if already affordable (cumCost <= moneyAvailable). Infinity
 * if a shortfall exists and the income rate is 0 or negative (unreachable by waiting alone).
 */
export function moneyWaitHours(cumCost, moneyAvailable, incomeRatePerSecDollars) {
  const shortfall = cumCost - moneyAvailable;
  if (shortfall <= 0) return 0;
  if (!(incomeRatePerSecDollars > 0)) return Infinity;
  return shortfall / incomeRatePerSecDollars / 3600;
}

/**
 * Pure. Re-derives a live per-stat grind rate (exp/sec) from a series of already-collected log
 * samples, each shaped {ts: number, combatExp: {strength, defense, dexterity, agility}}.
 * Samples outside [nowMs - windowMs, nowMs] are excluded. Returns null if fewer than
 * `minSamples` remain in the window (not enough data to trust a rate) or the surviving window
 * spans zero elapsed time. Never returns a negative rate per stat (a exp read that appears to
 * fall -- e.g. a node/entropy artifact -- clamps to 0 rather than reporting negative grind).
 */
export function liveGrindRate(logSamples, nowMs, windowMs, minSamples) {
  const inWindow = (logSamples || []).filter(
    (s) => s && typeof s.ts === "number" && nowMs - s.ts >= 0 && nowMs - s.ts <= windowMs
  );
  if (inWindow.length < minSamples) return null;

  const sorted = [...inWindow].sort((a, b) => a.ts - b.ts);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const elapsedSec = (last.ts - first.ts) / 1000;
  if (elapsedSec <= 0) return null;

  const rate = {};
  for (const stat of STATS) {
    const before = first.combatExp && typeof first.combatExp[stat] === "number" ? first.combatExp[stat] : 0;
    const after = last.combatExp && typeof last.combatExp[stat] === "number" ? last.combatExp[stat] : 0;
    rate[stat] = Math.max(0, (after - before) / elapsedSec);
  }
  return rate;
}

/** Pure. Elementwise product of two CombatQuads. */
export function multiplyCombatMults(a, b) {
  const out = {};
  for (const stat of STATS) out[stat] = a[stat] * b[stat];
  return out;
}

/** Pure. Applies Math.pow(entropyPerGraft, depth) to every stat of a CombatQuad. */
export function applyEntropy(mults, entropyPerGraft, depth) {
  const factor = Math.pow(entropyPerGraft, depth);
  const out = {};
  for (const stat of STATS) out[stat] = mults[stat] * factor;
  return out;
}

/** Pure. True iff every prereq of `candidate` is owned or already in `chosenSet`. */
function isAdmissible(candidate, owned, chosenSet) {
  const prereqs = candidate.prereqs || [];
  return prereqs.every((p) => owned.has(p) || chosenSet.has(p));
}

/**
 * Pure. Scores one search state (lower is better): the spec's
 *   max(moneyWaitHours, cumGraftHours) + bottleneckHours(effectiveMults)
 * moneyWaitHours and cumGraftHours are max()-combined (they proceed CONCURRENTLY -- money
 * accrues in the background of a graft running); bottleneckHours (the post-ladder grind) is
 * ADDED on top because grinding and grafting are mutually exclusive on the single player-action
 * slot and run strictly serially after every chosen graft has landed.
 */
function scoreState(state, banked, innerOpts, moneyAvailable, incomeRatePerSecDollars, grindRatePerStat) {
  const effectiveMults = applyEntropy(state.mults, innerOpts.entropyPerGraft, state.depth);
  const grindHours = bottleneckHours(effectiveMults, banked, grindRatePerStat, innerOpts);
  const waitHours = moneyWaitHours(state.cumCost, moneyAvailable, incomeRatePerSecDollars);
  const totalHours = Math.max(waitHours, state.cumGraftHours) + grindHours;
  return { totalHours, grindHours, waitHours, effectiveMults };
}

/**
 * Pure. The beam search (spec Section 5).
 *
 * candidates: [{name, price, graftHours, mults: CombatQuad, prereqs: string[]}]
 * currentMults / banked: CombatQuad -- currentMults are RAW (entropy-free) base mults, same
 *   convention as before: the caller (graftplanner.js's main()) divides the already-applied
 *   entropy debuff back out of ns.getPlayer().mults before calling this.
 * opts: {nodeMult, targetLevel, grindRatePerStat, entropyPerGraft, owned: Set<string>,
 *        maxSpend, moneyAvailable, incomeRatePerSecDollars, beamWidth = 300, maxDepth = 14}
 *
 * Returns {ladder, chosenK, totalHours}:
 *   ladder -- the chosen candidate set's steps in the order they were added, k=1..chosenK, each
 *     {k, name, price, graftHours, cumCost, cumGraftHours, grindHours, moneyWaitHours, totalHours}.
 *   chosenK -- depth of the best state found (>= 0 -- k=0, pure grinding, is a legitimate
 *     outcome and is always present in the search, since it is depth 0).
 *   totalHours -- the chosen state's score (the global minimum found across ALL depths visited,
 *     not just the final one -- the optimum may sit shallower than maxDepth).
 *
 * State dedup: two orderings of the same candidate SET are the same state (deduped by a
 * sorted-name key, keeping only the best-scoring instance). Beam width caps how many distinct
 * states survive each depth, ranked by score.
 */
export function planGraftLadder(candidates, currentMults, banked, opts) {
  const {
    nodeMult,
    targetLevel,
    grindRatePerStat,
    entropyPerGraft,
    owned = new Set(),
    maxSpend,
    moneyAvailable = 0,
    incomeRatePerSecDollars = 0,
    beamWidth = 300,
    maxDepth = 14,
  } = opts;
  const innerOpts = { nodeMult, targetLevel, entropyPerGraft };

  const pool = candidates.filter((c) => !owned.has(c.name));

  const rootState = { order: [], cumCost: 0, cumGraftHours: 0, mults: { ...currentMults }, depth: 0 };
  const rootScore = scoreState(rootState, banked, innerOpts, moneyAvailable, incomeRatePerSecDollars, grindRatePerStat);

  let bestState = rootState;
  let bestScore = rootScore;

  let frontier = [{ state: rootState, score: rootScore }];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextByKey = new Map();

    for (const { state } of frontier) {
      const chosenSet = new Set(state.order);
      for (const candidate of pool) {
        if (chosenSet.has(candidate.name)) continue;
        if (!isAdmissible(candidate, owned, chosenSet)) continue;

        const nextCumCost = state.cumCost + candidate.price;
        if (nextCumCost > maxSpend) continue;

        const nextOrder = [...state.order, candidate.name];
        const key = [...nextOrder].sort().join("|");
        const nextState = {
          order: nextOrder,
          cumCost: nextCumCost,
          cumGraftHours: state.cumGraftHours + candidate.graftHours,
          mults: multiplyCombatMults(state.mults, candidate.mults),
          depth: state.depth + 1,
        };
        const nextScore = scoreState(nextState, banked, innerOpts, moneyAvailable, incomeRatePerSecDollars, grindRatePerStat);

        const existing = nextByKey.get(key);
        if (!existing || nextScore.totalHours < existing.score.totalHours) {
          nextByKey.set(key, { state: nextState, score: nextScore });
        }
      }
    }

    if (nextByKey.size === 0) break;

    const ranked = [...nextByKey.values()].sort((a, b) => a.score.totalHours - b.score.totalHours);
    frontier = ranked.slice(0, beamWidth);

    for (const entry of frontier) {
      if (entry.score.totalHours < bestScore.totalHours) {
        bestState = entry.state;
        bestScore = entry.score;
      }
    }
  }

  // Reconstruct the per-step ladder for bestState's chosen order (k=1..chosenK), so the caller
  // gets a step-by-step view (used for logging/display), not just the final answer.
  const candidateByName = new Map(pool.map((c) => [c.name, c]));
  const ladder = [];
  let cursor = { order: [], cumCost: 0, cumGraftHours: 0, mults: { ...currentMults }, depth: 0 };
  for (const name of bestState.order) {
    const candidate = candidateByName.get(name);
    cursor = {
      order: [...cursor.order, name],
      cumCost: cursor.cumCost + candidate.price,
      cumGraftHours: cursor.cumGraftHours + candidate.graftHours,
      mults: multiplyCombatMults(cursor.mults, candidate.mults),
      depth: cursor.depth + 1,
    };
    const stepScore = scoreState(cursor, banked, innerOpts, moneyAvailable, incomeRatePerSecDollars, grindRatePerStat);
    ladder.push({
      k: cursor.depth,
      name,
      price: candidate.price,
      graftHours: candidate.graftHours,
      cumCost: cursor.cumCost,
      cumGraftHours: cursor.cumGraftHours,
      grindHours: stepScore.grindHours,
      moneyWaitHours: stepScore.waitHours,
      effectiveMults: stepScore.effectiveMults,
      totalHours: stepScore.totalHours,
    });
  }

  return { ladder, chosenK: bestState.depth, totalHours: bestScore.totalHours };
}
