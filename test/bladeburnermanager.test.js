// Pure-function tests for Phase 39's bladeburnermanager.js (phase-39-bladeburner-primary
// .spec.md's "Tests" section). main() is thin plumbing around these, same split as
// daemon.js/gangmanager.js -- every function under test is ns-free (buildCandidates
// takes a minimal fake `ns.bladeburner` object -- it never touches anything else).
import { describe, it, expect } from 'vitest';
import {
  expectedRankPerSec,
  scoreCandidate,
  buildCandidates,
  applyStageGate,
  computeCrossover,
  isQuarantined,
  updateQuarantine,
  pickRankAction,
  planSkillBuy,
  SKILL_BUY_ORDER,
  SKILL_LEVEL_CAP,
  OVERCLOCK_HOLD_LEVEL,
  STAGE_B_ENABLED,
  ACTION_START_FAILURE_LIMIT,
  ACTION_QUARANTINE_MS,
  OBJECTIVE_MODE,
  isInventoryLow,
  LOW_INVENTORY_COUNT_THRESHOLD,
  shouldRotateCity,
  updateCityStock,
  CITY_ROTATE_CHAOS_THRESHOLD,
  higherPriorityClaimant,
  HIGHER_PRIORITY_CLAIMANTS,
  classifyBackdoorActivity,
  BACKDOOR_ACTIVITY_FRESH_MS,
  resolveYieldGrant,
  REP_YIELD_CLAIMANT,
  BACKDOOR_YIELD_MAX_MS,
  STUDY_YIELD_MAX_MS,
  REP_YIELD_SLICE_MS,
  MAX_REP_YIELD_DUTY,
  MIN_HOLD_AFTER_OVERRUN_MS,
  LIVELOCK_WARN_STREAK,
  classifyRepProgress,
  detectRepStarvation,
  seedRepStarvation,
  REP_STARVED_SUSTAIN_MS,
  REP_STARVED_RATE,
  REP_STARVED_CLEAR_RATE,
  REP_STARVED_CLEAR_MS,
  computeWallRates,
  dutyFromTotals,
  pruneSamples,
  emptyTotals,
  accumulateTotals,
  seedTotals,
  RATE_WINDOWS_MS,
  MAX_FINITE_WINDOW_MS,
  SAMPLE_HARD_CAP,
  evaluateC1,
  evaluateC3A,
  evaluateC3B,
  C1_UPTIME_MS,
  C1_BAR,
  C3_UPTIME_MS,
  C3A_DUTY_BAR,
  appendBbLog,
  seedBbLog,
  appendAttempt,
  seedAttempts,
  buildBbState,
  BB_LOG_MAX_ENTRIES,
  BB_ATTEMPTS_MAX_ENTRIES,
  HP_FLOOR_FRACTION,
  AUG_STATE_FRESH_MS,
  BLACKOPS_DAEDALUS_RANK,
  pickOverheadAction,
  shouldStartAction,
  detectOverheadStall,
  OVERHEAD_STALL_WARN_MS,
  GENERAL_ACTION_RECHECK_MS,
  isPostInstallRegime,
  POST_INSTALL_HP_MAX_THRESHOLD,
  POST_INSTALL_TRAINING_MAX_MS,
  CHAOS_DIPLOMACY_THRESHOLD,
  CHAOS_TARGET,
  MAX_DIPLOMACY_DUTY,
  diplomacyBudgetRemainingMs,
  accumulateDiplomacyEffect,
  emptyDiplomacyEffect,
  TEAM_SIZE_TARGET,
  updateStaminaRecovering,
  STAMINA_FLOOR_FRACTION,
  STAMINA_RESUME_FRACTION,
  updateHpRecovering,
  HP_RESUME_FRACTION,
} from '../src/bladeburnermanager.js';

// --- expectedRankPerSec / scoreCandidate (S8) -------------------------------

describe('expectedRankPerSec', () => {
  it('positive EV: high success chance, small loss', () => {
    expect(expectedRankPerSec({ pMin: 0.9, rankGain: 10, rankLoss: 2, timeMs: 10_000 })).toBeCloseTo(0.88, 6);
  });

  it('negative EV: low success chance, large loss', () => {
    expect(expectedRankPerSec({ pMin: 0.03, rankGain: 50, rankLoss: 10, timeMs: 20_000 })).toBeCloseTo(-0.41, 6);
  });

  it('zero/negative time returns 0, not Infinity/NaN', () => {
    expect(expectedRankPerSec({ pMin: 0.5, rankGain: 10, rankLoss: 1, timeMs: 0 })).toBe(0);
  });
});

describe('scoreCandidate', () => {
  const c = { pMin: 0.5, rankGain: 10, rankLoss: 2, timeMs: 10_000 };

  it('per-second mode: score equals expectedRankPerSec', () => {
    const { score, evPerSec } = scoreCandidate(c, 'per-second');
    expect(score).toBeCloseTo(expectedRankPerSec(c), 10);
    expect(evPerSec).toBeCloseTo(expectedRankPerSec(c), 10);
  });

  it('per-action mode: score is the raw EV, not divided by time', () => {
    const { score, evPerAction } = scoreCandidate(c, 'per-action');
    const rawEv = 0.5 * 10 - 0.5 * 2; // 4
    expect(score).toBeCloseTo(rawEv, 10);
    expect(evPerAction).toBeCloseTo(rawEv, 10);
  });

  it('both scores are always present regardless of mode', () => {
    const perSec = scoreCandidate(c, 'per-second');
    const perAction = scoreCandidate(c, 'per-action');
    expect(perSec.evPerAction).toBeCloseTo(perAction.evPerAction, 10);
    expect(perSec.evPerSec).toBeCloseTo(perAction.evPerSec, 10);
  });

  it('negative raw EV stays negative in both modes (sign is time-invariant)', () => {
    const negative = { pMin: 0.05, rankGain: 5, rankLoss: 50, timeMs: 5_000 };
    expect(scoreCandidate(negative, 'per-second').score).toBeLessThan(0);
    expect(scoreCandidate(negative, 'per-action').score).toBeLessThan(0);
  });

  it("is a pure function of the pMin it's handed -- multiplies it by nothing extra (no stamina correction)", () => {
    // The unverified premise (Q12/blocker 11): this asserts a property of OUR code, not
    // of the game's returned estimate. A fixture with a given pMin scores identically to
    // hand-computed EV, proving scoreCandidate applies no hidden correction.
    const candidate = { pMin: 0.356, rankGain: 0.726, rankLoss: 0, timeMs: 13_000 };
    const handComputed = (0.356 * 0.726 - (1 - 0.356) * 0) / 13;
    expect(scoreCandidate(candidate, 'per-second').score).toBeCloseTo(handComputed, 10);
  });
});

// --- buildCandidates / applyStageGate split (S5.1, fixes reviewer blocker 1) -------

function fakeNs(counts, chances = {}, rankGain = {}, rankLoss = {}, timeMs = {}) {
  return {
    bladeburner: {
      getActionCountRemaining: (type, name) => counts[name] ?? 0,
      getActionEstimatedSuccessChance: (type, name) => chances[name] ?? [0.5, 0.5],
      getActionRankGain: (type, name) => rankGain[name] ?? 1,
      getActionRankLoss: (type, name) => rankLoss[name] ?? 0,
      getActionTime: (type, name) => timeMs[name] ?? 10_000,
    },
  };
}

const ALL_ACTIONS = ['Tracking', 'Bounty Hunter', 'Retirement', 'Investigation', 'Undercover Operation', 'Sting Operation', 'Raid', 'Stealth Retirement Operation', 'Assassination'];
const FULL_COUNTS = Object.fromEntries(ALL_ACTIONS.map((n) => [n, 10]));

describe('buildCandidates', () => {
  it('returns every Contract/Operation with count >= 1, regardless of stage', () => {
    const ns = fakeNs(FULL_COUNTS);
    const candidates = buildCandidates(ns);
    expect(candidates.map((c) => c.name).sort()).toEqual([...ALL_ACTIONS].sort());
  });

  it('skips an action with count < 1', () => {
    const ns = fakeNs({ ...FULL_COUNTS, Raid: 0.5 });
    const candidates = buildCandidates(ns);
    expect(candidates.some((c) => c.name === 'Raid')).toBe(false);
  });

  it('marks Investigation as not risking HP; every other action as risking HP', () => {
    const ns = fakeNs(FULL_COUNTS);
    const candidates = buildCandidates(ns);
    expect(candidates.find((c) => c.name === 'Investigation').risksHp).toBe(false);
    expect(candidates.find((c) => c.name === 'Tracking').risksHp).toBe(true);
    expect(candidates.find((c) => c.name === 'Raid').risksHp).toBe(true);
  });

  it('knows nothing about stages -- the five risky operations are present even when STAGE_B_ENABLED is false', () => {
    expect(STAGE_B_ENABLED).toBe(false);
    const ns = fakeNs(FULL_COUNTS);
    const candidates = buildCandidates(ns);
    for (const risky of ['Undercover Operation', 'Sting Operation', 'Raid', 'Stealth Retirement Operation', 'Assassination']) {
      expect(candidates.some((c) => c.name === risky)).toBe(true);
    }
  });
});

describe('applyStageGate', () => {
  const pool = ALL_ACTIONS.map((name) => ({
    type: name === 'Tracking' || name === 'Bounty Hunter' || name === 'Retirement' ? 'Contracts' : 'Operations',
    name,
    pMin: name === 'Raid' ? 0.99 : 0.1, // Raid engineered to have the HIGHEST EV in the fixture
    rankGain: name === 'Raid' ? 1000 : 1,
    rankLoss: 0,
    timeMs: 10_000,
  }));

  it('drops the five risky operations when stageBEnabled is false -- even when their EV is highest in the fixture', () => {
    const gated = applyStageGate(pool, false);
    for (const risky of ['Undercover Operation', 'Sting Operation', 'Raid', 'Stealth Retirement Operation', 'Assassination']) {
      expect(gated.some((c) => c.name === risky)).toBe(false);
    }
  });

  it('Investigation and all Contracts survive the gate', () => {
    const gated = applyStageGate(pool, false);
    expect(gated.some((c) => c.name === 'Investigation')).toBe(true);
    for (const contract of ['Tracking', 'Bounty Hunter', 'Retirement']) {
      expect(gated.some((c) => c.name === contract)).toBe(true);
    }
  });

  it('passes the pool through unchanged when stageBEnabled is true', () => {
    expect(applyStageGate(pool, true)).toEqual(pool);
  });

  it('buildCandidates -> applyStageGate compose in the documented order (S5.1 wiring)', () => {
    const ns = fakeNs(FULL_COUNTS);
    const full = buildCandidates(ns);
    const gated = applyStageGate(full, STAGE_B_ENABLED);
    expect(gated.length).toBeLessThan(full.length);
    expect(gated.every((c) => full.includes(c))).toBe(true);
  });
});

describe('computeCrossover', () => {
  it('reports operations that are gated out of the live pool -- C2 must be reachable while Stage B is shut', () => {
    const candidates = [
      { type: 'Contracts', name: 'Tracking', pMin: 0.5, rankGain: 1, rankLoss: 0, timeMs: 10_000 },
      { type: 'Operations', name: 'Raid', pMin: 0.5, rankGain: 100, rankLoss: 0, timeMs: 10_000 },
    ];
    const gated = applyStageGate(candidates, false);
    expect(gated.some((c) => c.name === 'Raid')).toBe(false);
    const crossover = computeCrossover(candidates, 'per-second');
    expect(crossover.bestOperation.name).toBe('Raid');
  });

  it('operationLeadsPerSec true when the best operation beats the best contract per-second', () => {
    const candidates = [
      { type: 'Contracts', name: 'Tracking', pMin: 0.5, rankGain: 1, rankLoss: 0, timeMs: 10_000 },
      { type: 'Operations', name: 'Raid', pMin: 0.5, rankGain: 100, rankLoss: 0, timeMs: 10_000 },
    ];
    expect(computeCrossover(candidates).operationLeadsPerSec).toBe(true);
  });

  it('operationLeadsPerSec false when the contract still leads', () => {
    const candidates = [
      { type: 'Contracts', name: 'Tracking', pMin: 0.9, rankGain: 100, rankLoss: 0, timeMs: 1_000 },
      { type: 'Operations', name: 'Raid', pMin: 0.05, rankGain: 55, rankLoss: 2.5, timeMs: 66_000 },
    ];
    expect(computeCrossover(candidates).operationLeadsPerSec).toBe(false);
  });

  it('operationLeadsPerSec and operationLeadsPerAction can disagree -- C2 reads ONLY the per-second flag (S14.1)', () => {
    // Raid: bigger per-action EV (50 > 8.9) but a much LOWER per-second EV (long action
    // time dilutes it: 0.083 < Tracking's 0.742).
    const candidates = [
      { type: 'Contracts', name: 'Tracking', pMin: 0.9, rankGain: 10, rankLoss: 1, timeMs: 12_000 },
      { type: 'Operations', name: 'Raid', pMin: 0.5, rankGain: 100, rankLoss: 0, timeMs: 600_000 },
    ];
    const crossover = computeCrossover(candidates, 'per-second');
    expect(crossover.operationLeadsPerAction).toBe(true);
    expect(crossover.operationLeadsPerSec).toBe(false);
  });

  it('null best-of when a side has no candidates, and leads default to false', () => {
    const crossover = computeCrossover([{ type: 'Contracts', name: 'Tracking', pMin: 0.5, rankGain: 1, rankLoss: 0, timeMs: 1000 }]);
    expect(crossover.bestOperation.name).toBeNull();
    expect(crossover.operationLeadsPerSec).toBe(false);
  });
});

// --- isQuarantined / updateQuarantine (S6) ----------------------------------

describe('isQuarantined / updateQuarantine', () => {
  it('not quarantined initially', () => {
    expect(isQuarantined({}, 'Tracking', 1000)).toBe(false);
  });

  it('trips at ACTION_START_FAILURE_LIMIT consecutive failures', () => {
    let state = { failures: {}, quarantine: {} };
    for (let i = 0; i < ACTION_START_FAILURE_LIMIT - 1; i++) state = updateQuarantine(state, 'Tracking', false, 1000);
    expect(isQuarantined(state.quarantine, 'Tracking', 1000)).toBe(false);
    state = updateQuarantine(state, 'Tracking', false, 1000);
    expect(state.justQuarantined).toBe(true);
    expect(isQuarantined(state.quarantine, 'Tracking', 1000)).toBe(true);
  });

  it('a verified success resets the failure counter without quarantining', () => {
    let state = { failures: {}, quarantine: {} };
    state = updateQuarantine(state, 'Tracking', false, 1000);
    state = updateQuarantine(state, 'Tracking', true, 1000);
    expect(state.failures.Tracking).toBe(0);
    expect(isQuarantined(state.quarantine, 'Tracking', 1000)).toBe(false);
  });

  it('expires after ACTION_QUARANTINE_MS -- isQuarantined reads false past the expiry', () => {
    let state = { failures: {}, quarantine: {} };
    for (let i = 0; i < ACTION_START_FAILURE_LIMIT; i++) state = updateQuarantine(state, 'Tracking', false, 1000);
    const expiry = state.quarantine.Tracking;
    expect(isQuarantined(state.quarantine, 'Tracking', expiry - 1)).toBe(true);
    expect(isQuarantined(state.quarantine, 'Tracking', expiry)).toBe(false);
  });

  it('the one retry attempt: a failure right after expiry re-quarantines immediately, not after 3 more strikes', () => {
    let state = { failures: {}, quarantine: {} };
    for (let i = 0; i < ACTION_START_FAILURE_LIMIT; i++) state = updateQuarantine(state, 'Tracking', false, 1000);
    const expiry = state.quarantine.Tracking;
    state = updateQuarantine(state, 'Tracking', false, expiry); // the one retry, and it fails
    expect(state.justQuarantined).toBe(true);
    expect(state.quarantine.Tracking).toBe(expiry + ACTION_QUARANTINE_MS);
  });

  it('the one retry attempt: a SUCCESS right after expiry clears the quarantine', () => {
    let state = { failures: {}, quarantine: {} };
    for (let i = 0; i < ACTION_START_FAILURE_LIMIT; i++) state = updateQuarantine(state, 'Tracking', false, 1000);
    const expiry = state.quarantine.Tracking;
    state = updateQuarantine(state, 'Tracking', true, expiry);
    expect(state.justCleared).toBe(true);
    expect(isQuarantined(state.quarantine, 'Tracking', expiry)).toBe(false);
  });
});

// --- pickRankAction (S8's hard floor + S9's guards; reshaped -- no hospitalization discount) --

describe('pickRankAction', () => {
  const highEv = { type: 'Contracts', name: 'Tracking', pMin: 0.9, rankGain: 10, rankLoss: 1, timeMs: 12_000 };
  const lowEv = { type: 'Contracts', name: 'Bounty Hunter', pMin: 0.5, rankGain: 2, rankLoss: 5, timeMs: 20_000 };

  it('picks the higher-scoring candidate', () => {
    expect(pickRankAction([highEv, lowEv], {}).name).toBe('Tracking');
  });

  it('never returns a candidate with EV <= 0 -- the hard net-negative floor', () => {
    const negative = { type: 'Contracts', name: 'Bad', pMin: 0.01, rankGain: 1, rankLoss: 100, timeMs: 1000 };
    expect(pickRankAction([negative], {})).toBeNull();
  });

  it('returns null while hpRecovering, regardless of candidate quality', () => {
    expect(pickRankAction([highEv], { hpRecovering: true })).toBeNull();
  });

  it('returns null while staminaRecovering', () => {
    expect(pickRankAction([highEv], { staminaRecovering: true })).toBeNull();
  });

  it('respects quarantine -- a quarantined top candidate is skipped in favour of the next-best', () => {
    // lowEv must itself clear the net-negative floor to be a valid "next-best".
    const positiveLowEv = { type: 'Contracts', name: 'Bounty Hunter', pMin: 0.6, rankGain: 3, rankLoss: 1, timeMs: 20_000 };
    const quarantine = { Tracking: 999_999 };
    const picked = pickRankAction([highEv, positiveLowEv], { quarantine, nowMs: 1000 });
    expect(picked.name).toBe('Bounty Hunter');
  });

  it('returns null when every candidate is quarantined', () => {
    const quarantine = { Tracking: 999_999, 'Bounty Hunter': 999_999 };
    expect(pickRankAction([highEv, lowEv], { quarantine, nowMs: 1000 })).toBeNull();
  });

  it('returns null on an empty candidate list', () => {
    expect(pickRankAction([], {})).toBeNull();
  });

  it('is not tested for -- and does not perform -- stage gating (applyStageGate is the only gate, S5.1)', () => {
    // A risky operation handed directly to pickRankAction is eligible if it scores well --
    // gating is the CALLER's job (applyStageGate before this function ever sees the pool).
    const raid = { type: 'Operations', name: 'Raid', pMin: 0.9, rankGain: 100, rankLoss: 1, timeMs: 10_000 };
    expect(pickRankAction([raid], {}).name).toBe('Raid');
  });

  it('honours the mode option -- per-action can rank a low-per-second candidate above a high-per-second one', () => {
    const bigSlow = { type: 'Operations', name: 'Raid', pMin: 0.5, rankGain: 100, rankLoss: 0, timeMs: 600_000 };
    const smallFast = { type: 'Contracts', name: 'Tracking', pMin: 0.9, rankGain: 10, rankLoss: 1, timeMs: 12_000 };
    expect(pickRankAction([bigSlow, smallFast], { mode: 'per-second' }).name).toBe('Tracking');
    expect(pickRankAction([bigSlow, smallFast], { mode: 'per-action' }).name).toBe('Raid');
  });
});

// --- planSkillBuy (unchanged from Phase 38 -- SKILL_BUY_ORDER/SKILL_LEVEL_CAP/OVERCLOCK_HOLD_LEVEL survive) --

describe('planSkillBuy', () => {
  it('buys the highest-priority affordable skill (success skills first)', () => {
    const levels = {};
    const costs = { Overclock: 5, "Blade's Intuition": 1 };
    const buy = planSkillBuy(levels, 10, costs);
    expect(buy).toEqual({ skill: "Blade's Intuition", toLevel: 1, cost: 1 });
  });

  it('holds Overclock at its cap so a large SP balance cannot drain into it', () => {
    const levels = { "Blade's Intuition": 25, 'Digital Observer': 25, Tracer: 25, Overclock: OVERCLOCK_HOLD_LEVEL, Reaper: 6, 'Evasive System': 6 };
    const costs = { Overclock: 27, "Blade's Intuition": 100, 'Digital Observer': 100, Tracer: 100, Reaper: 10, 'Evasive System': 10 };
    expect(planSkillBuy(levels, 100_000, costs)).toBeNull();
  });

  it('respects a level cap -- Overclock stops being considered at its hold level even with unlimited SP', () => {
    const levels = { Overclock: 90 };
    const costs = { Overclock: 1, "Blade's Intuition": 4 };
    const buy = planSkillBuy(levels, 10, costs);
    expect(buy.skill).toBe("Blade's Intuition");
  });

  it('never buys the excluded skills, even if they are the only affordable ones', () => {
    const levels = {};
    const costs = { 'Hands of Midas': 1, Hyperdrive: 1, "Cyber's Edge": 1, Datamancer: 1, Cloak: 1, 'Short-Circuit': 1 };
    expect(planSkillBuy(levels, 100, costs)).toBeNull();
  });

  it('a missing/non-finite cost entry is treated as unaffordable, not a crash', () => {
    const levels = {};
    const costs = { Overclock: Infinity, "Blade's Intuition": 5 };
    expect(planSkillBuy(levels, 10, costs).skill).toBe("Blade's Intuition");
  });
});

// --- isInventoryLow / shouldRotateCity / updateCityStock (S10) -------------------

describe('isInventoryLow', () => {
  it('true when every tracked count is at/under the threshold', () => {
    expect(isInventoryLow([5, 10, 0], 20)).toBe(true);
  });
  it('false when at least one count is comfortably above the threshold', () => {
    expect(isInventoryLow([5, 500, 0], 20)).toBe(false);
  });
  it('true on an empty pool', () => {
    expect(isInventoryLow([], 20)).toBe(true);
  });
  it('uses LOW_INVENTORY_COUNT_THRESHOLD as the default', () => {
    expect(isInventoryLow([LOW_INVENTORY_COUNT_THRESHOLD])).toBe(true);
    expect(isInventoryLow([LOW_INVENTORY_COUNT_THRESHOLD + 1])).toBe(false);
  });
});

describe('shouldRotateCity', () => {
  it('does not rotate below the threshold', () => {
    expect(shouldRotateCity({ Aevum: 0.5, Chongqing: 0.1 }, 'Aevum', 1.0)).toEqual({ rotate: false, city: null });
  });
  it('rotates to the lowest-chaos other city once over the threshold', () => {
    expect(shouldRotateCity({ Aevum: 2.0, Chongqing: 0.1, Sector12: 0.4 }, 'Aevum', 1.0)).toEqual({ rotate: true, city: 'Chongqing' });
  });
  it('never rotates to itself', () => {
    expect(shouldRotateCity({ Aevum: 5.0 }, 'Aevum', 1.0).rotate).toBe(false);
  });
});

describe('updateCityStock', () => {
  it('records a fresh city entry', () => {
    const { stock } = updateCityStock(null, { cityName: 'Sector-12', population: 1000, communities: 5, chaos: 0, contractCount: 100, opCount: 100 }, 1000);
    expect(stock['Sector-12']).toEqual({ pop: 1000, communities: 5, chaos: 0, contractCount: 100, opCount: 100, updatedMs: 1000 });
  });

  it('preserves other cities already in the stock', () => {
    const prior = { Aevum: { pop: 1, communities: 1, chaos: 0, contractCount: 1, opCount: 1, updatedMs: 0 } };
    const { stock } = updateCityStock(prior, { cityName: 'Sector-12', population: 1, communities: 1, chaos: 0, contractCount: 1, opCount: 1 }, 1000);
    expect(stock.Aevum).toBeDefined();
    expect(stock['Sector-12']).toBeDefined();
  });

  it('flags a chaos breach at/above the rotation threshold', () => {
    const { breaches } = updateCityStock(null, { cityName: 'Aevum', population: 1, communities: 1, chaos: CITY_ROTATE_CHAOS_THRESHOLD, contractCount: 100, opCount: 100 }, 1000);
    expect(breaches.some((b) => b.type === 'chaos')).toBe(true);
  });

  it('flags a low-inventory breach', () => {
    const { breaches } = updateCityStock(null, { cityName: 'Aevum', population: 1, communities: 1, chaos: 0, contractCount: 1, opCount: 1 }, 1000);
    expect(breaches.some((b) => b.type === 'inventory')).toBe(true);
  });

  it('flags a communities breach -- Raid needs an existing Synthoid community', () => {
    const { breaches } = updateCityStock(null, { cityName: 'Aevum', population: 1, communities: 0, chaos: 0, contractCount: 100, opCount: 100 }, 1000);
    expect(breaches.some((b) => b.type === 'communities')).toBe(true);
  });

  it('🔴 flags a DRAINED city -- measured 2026-08-03: six Raids took Volhaven to 0 population, which zeroes the success chance of EVERY action (contracts included) and stalls the engine outright', () => {
    const { breaches } = updateCityStock(null, { cityName: 'Volhaven', population: 0, communities: 71, chaos: 5.9, contractCount: 500, opCount: 500 }, 1000);
    expect(breaches.some((b) => b.type === 'population-drained')).toBe(true);
  });

  it('a healthy population raises no drained breach', () => {
    const { breaches } = updateCityStock(null, { cityName: 'Ishima', population: 1132.7e6, communities: 39, chaos: 3.1, contractCount: 500, opCount: 500 }, 1000);
    expect(breaches.some((b) => b.type === 'population-drained')).toBe(false);
  });

  // ACKNOWLEDGED FIXTURE CHANGE 2026-08-03 (spec T1): population raised from a toy 1000 to
  // a realistic figure, because 1000 Synthoids is genuinely NOT comfortable under the new
  // population-drained rule -- at ~0 population every action's success chance is 0.
  it('no breaches when everything is comfortable', () => {
    const { breaches } = updateCityStock(null, { cityName: 'Aevum', population: 569.1e6, communities: 10, chaos: 0, contractCount: 500, opCount: 500 }, 1000);
    expect(breaches).toEqual([]);
  });
});

// --- higherPriorityClaimant / classifyBackdoorActivity (unchanged) ---------------

describe('higherPriorityClaimant', () => {
  it('detects each of the three higher-priority scripts', () => {
    for (const filename of HIGHER_PRIORITY_CLAIMANTS) {
      expect(higherPriorityClaimant([{ filename }])).toBe(filename);
    }
  });
  it('returns null when none of the three are present', () => {
    expect(higherPriorityClaimant([{ filename: 'augfarmer.js' }, { filename: 'dashboard.js' }])).toBeNull();
  });
  it('returns null on an empty process list', () => {
    expect(higherPriorityClaimant([])).toBeNull();
  });
});

describe('classifyBackdoorActivity', () => {
  const T = 1_000_000_000;
  it('idle: active false, fresh timestamp', () => {
    expect(classifyBackdoorActivity({ active: false, timestamp: T }, T)).toBe('idle');
  });
  it('busy: active true, regardless of freshness', () => {
    expect(classifyBackdoorActivity({ active: true, timestamp: T }, T)).toBe('busy');
  });
  it('busy: missing marker (null)', () => {
    expect(classifyBackdoorActivity(null, T)).toBe('busy');
  });
  it('busy: marker without a numeric timestamp', () => {
    expect(classifyBackdoorActivity({ active: false }, T)).toBe('busy');
  });
  it('busy: stale idle claim', () => {
    expect(classifyBackdoorActivity({ active: false, timestamp: T - BACKDOOR_ACTIVITY_FRESH_MS - 1 }, T)).toBe('busy');
  });
  it('idle: exactly at the freshness bound is still fresh', () => {
    expect(classifyBackdoorActivity({ active: false, timestamp: T - BACKDOOR_ACTIVITY_FRESH_MS }, T)).toBe('idle');
  });
});

// --- resolveYieldGrant (S2.1-S2.4) ------------------------------------------------

describe('resolveYieldGrant', () => {
  it('grants a backdoor claimant that is present and busy', () => {
    const d = resolveYieldGrant('backdoorfactions.js', 'busy', 1000, null, {});
    expect(d.yield).toBe(true);
    expect(d.budgetMs).toBe(BACKDOOR_YIELD_MAX_MS);
  });

  it('does not grant when idle (marker cleared)', () => {
    const d = resolveYieldGrant('backdoorfactions.js', 'idle', 1000, null, {});
    expect(d.yield).toBe(false);
    expect(d.reason).toBe('not-requested');
  });

  it('grants studybootstrap.js on presence alone (activity is always "busy" for it, no marker)', () => {
    const d = resolveYieldGrant('studybootstrap.js', 'busy', 1000, null, {});
    expect(d.yield).toBe(true);
    expect(d.budgetMs).toBe(STUDY_YIELD_MAX_MS);
  });

  it('continues an in-progress grant under its budget', () => {
    const prior = { claimant: 'backdoorfactions.js', sinceMs: 1000, budgetMs: BACKDOOR_YIELD_MAX_MS };
    const d = resolveYieldGrant('backdoorfactions.js', 'busy', 1000 + BACKDOOR_YIELD_MAX_MS - 1, prior, {});
    expect(d.yield).toBe(true);
    expect(d.reason).toBe('continuing');
  });

  it('ends CLEANLY when the claimant clears its marker mid-grant -- resets the overrun streak', () => {
    const prior = { claimant: 'backdoorfactions.js', sinceMs: 1000, budgetMs: BACKDOOR_YIELD_MAX_MS };
    const d = resolveYieldGrant('backdoorfactions.js', 'idle', 1000 + 1000, prior, { overrunStreak: { 'backdoorfactions.js': 2 } });
    expect(d.yield).toBe(false);
    expect(d.ended).toBe('clean');
    expect(d.overrunStreak['backdoorfactions.js']).toBe(0);
  });

  it('RECLAIMS UNCONDITIONALLY at the bound when the claimant is still busy -- an overrun, not an extension', () => {
    const prior = { claimant: 'backdoorfactions.js', sinceMs: 1000, budgetMs: BACKDOOR_YIELD_MAX_MS };
    const d = resolveYieldGrant('backdoorfactions.js', 'busy', 1000 + BACKDOOR_YIELD_MAX_MS, prior, {});
    expect(d.yield).toBe(false);
    expect(d.overrun).toBe(true);
    expect(d.ended).toBe('overrun');
    expect(d.overrunStreak['backdoorfactions.js']).toBe(1);
  });

  it('the escalation ladder doubles 180 -> 360 -> 720 -> 1,440s and stops there', () => {
    const budgets = (streak) => ({ overrunStreak: { 'backdoorfactions.js': streak } });
    const grantAt = (streak) => resolveYieldGrant('backdoorfactions.js', 'busy', 0, null, budgets(streak));
    expect(grantAt(0).budgetMs).toBe(180_000);
    expect(grantAt(1).budgetMs).toBe(360_000);
    expect(grantAt(2).budgetMs).toBe(720_000);
    expect(grantAt(3).budgetMs).toBe(1_440_000);
    expect(grantAt(10).budgetMs).toBe(1_440_000); // capped, does not keep doubling
  });

  it('enforces MIN_HOLD_AFTER_OVERRUN_MS before granting the same claimant again', () => {
    const fairnessUntilMs = { 'backdoorfactions.js': 5000 };
    expect(resolveYieldGrant('backdoorfactions.js', 'busy', 4999, null, { fairnessUntilMs }).yield).toBe(false);
    expect(resolveYieldGrant('backdoorfactions.js', 'busy', 4999, null, { fairnessUntilMs }).reason).toBe('fairness-floor');
    expect(resolveYieldGrant('backdoorfactions.js', 'busy', 5000, null, { fairnessUntilMs }).yield).toBe(true);
  });

  it('an overrun sets the fairness floor MIN_HOLD_AFTER_OVERRUN_MS into the future', () => {
    const prior = { claimant: 'backdoorfactions.js', sinceMs: 1000, budgetMs: 180_000 };
    const nowMs = 1000 + 180_000;
    const d = resolveYieldGrant('backdoorfactions.js', 'busy', nowMs, prior, {});
    expect(d.fairnessUntilMs['backdoorfactions.js']).toBe(nowMs + MIN_HOLD_AFTER_OVERRUN_MS);
  });

  it('flags livelockSuspected once the overrun streak reaches LIVELOCK_WARN_STREAK', () => {
    const prior = { claimant: 'backdoorfactions.js', sinceMs: 0, budgetMs: 720_000 };
    const d = resolveYieldGrant('backdoorfactions.js', 'busy', 720_000, prior, { overrunStreak: { 'backdoorfactions.js': LIVELOCK_WARN_STREAK - 1 } });
    expect(d.overrunStreak['backdoorfactions.js']).toBe(LIVELOCK_WARN_STREAK);
    expect(d.livelockSuspected).toBe(true);
  });

  it('ANTI-LIVELOCK REGRESSION: a claimant that never clears its marker is still reclaimed every bound, never held indefinitely', () => {
    let overrunStreak = {};
    let fairnessUntilMs = {};
    let grant = null;
    let nowMs = 0;
    const grantDurations = [];
    for (let cycle = 0; cycle < 6; cycle++) {
      // Grant phase: request until granted (may be blocked by the fairness floor first).
      let d = resolveYieldGrant('backdoorfactions.js', 'busy', nowMs, grant, { overrunStreak, fairnessUntilMs });
      while (!d.yield && d.reason === 'fairness-floor') {
        nowMs = fairnessUntilMs['backdoorfactions.js'];
        d = resolveYieldGrant('backdoorfactions.js', 'busy', nowMs, grant, { overrunStreak, fairnessUntilMs });
      }
      expect(d.yield).toBe(true);
      grant = { claimant: 'backdoorfactions.js', sinceMs: d.sinceMs, budgetMs: d.budgetMs };
      grantDurations.push(d.budgetMs);
      overrunStreak = d.overrunStreak;
      fairnessUntilMs = d.fairnessUntilMs;
      // Run the grant out to its bound -- claimant still busy -> overrun, unconditional reclaim.
      nowMs = grant.sinceMs + grant.budgetMs;
      const end = resolveYieldGrant('backdoorfactions.js', 'busy', nowMs, grant, { overrunStreak, fairnessUntilMs });
      expect(end.yield).toBe(false);
      expect(end.ended).toBe('overrun');
      overrunStreak = end.overrunStreak;
      fairnessUntilMs = end.fairnessUntilMs;
      grant = null;
    }
    // Every grant was bounded (never open-ended) and capped at 1,440s -- the engine
    // reclaims at every single bound, which is the actual anti-livelock guarantee S2.4
    // makes (NOT that the engine holds a numeric majority of the hour -- its own worked
    // example puts the worst-case steady state at 1,440s yielded / 300s held, a MINORITY,
    // which is exactly why S2.4 also makes it loud via livelockSuspected).
    expect(Math.max(...grantDurations)).toBe(1_440_000);
    expect(grantDurations).toEqual([180_000, 360_000, 720_000, 1_440_000, 1_440_000, 1_440_000]);
  });

  // --- rep yield set to 0 on 2026-08-03 (reverses the spec's D11a default of 0.15) ---
  //
  // Measured basis: the single action slot is Bladeburner rank OR faction rep, never both.
  // augfarmer's scoreAug picks augs by hacking mults (leftover from the M-climb path
  // dropped 2026-08-02), and the live rep target `Neuregen Gene Modification` reads
  // hacking_exp 1.4 with 1.0 on EVERY combat stat and EVERY bladeburner_* mult -- worth
  // exactly zero toward rank 400,000. So the yield was buying nothing.

  it('🔴 THE DECISION: rep yield is capped at zero, so no rep slice is ever granted', () => {
    expect(MAX_REP_YIELD_DUTY).toBe(0);
    const d = resolveYieldGrant(REP_YIELD_CLAIMANT, 'busy', 1000, null, { rollingHourRepYieldMs: 0 });
    expect(d.yield).toBe(false);
    expect(d.refused).toBe(true);
  });

  it('the backdoor/study claimants are UNAFFECTED -- only the rep yield was zeroed', () => {
    // These protect correctness (an interrupted installBackdoor), not economy, so the
    // decision must not have collateral-damaged them.
    expect(resolveYieldGrant('backdoorfactions.js', 'busy', 1000, null, {}).yield).toBe(true);
    expect(resolveYieldGrant('studybootstrap.js', 'busy', 1000, null, {}).yield).toBe(true);
  });

  // ACKNOWLEDGED FIXTURE CHANGE 2026-08-03 (spec T1: named, not silent). These three now
  // inject `maxRepYieldDuty` because the LIVE cap is 0, which makes the slice mechanism
  // unreachable by default. The mechanism itself is unchanged and stays tested so it is
  // known-good if option (b) ever revives it.
  it('the rep claimant grants a fixed REP_YIELD_SLICE_MS with no escalation', () => {
    const d = resolveYieldGrant(REP_YIELD_CLAIMANT, 'busy', 1000, null, { maxRepYieldDuty: 0.15 });
    expect(d.budgetMs).toBe(REP_YIELD_SLICE_MS);
  });

  it('the rolling-hour rep cap refuses a WHOLE slice rather than truncating one', () => {
    const almostFull = 0.15 * 3_600_000 - 1; // one ms short of the cap
    const d = resolveYieldGrant(REP_YIELD_CLAIMANT, 'busy', 1000, null, { rollingHourRepYieldMs: almostFull, maxRepYieldDuty: 0.15 });
    expect(d.yield).toBe(false);
    expect(d.refused).toBe(true);
    expect(d.reason).toBe('rep-cap-refused');
  });

  it('the rep cap grants when the slice fits exactly within the rolling-hour budget', () => {
    const exactRoom = 0.15 * 3_600_000 - REP_YIELD_SLICE_MS;
    const d = resolveYieldGrant(REP_YIELD_CLAIMANT, 'busy', 1000, null, { rollingHourRepYieldMs: exactRoom, maxRepYieldDuty: 0.15 });
    expect(d.yield).toBe(true);
  });
});

// --- classifyRepProgress / detectRepStarvation (S3, fixes reviewer blocker 2) ----

describe('classifyRepProgress', () => {
  const target = { aug: 'X', faction: 'F1' };

  it('progressing: deficit closed on the same target', () => {
    const prev = { workTarget: { ...target, deficit: 1000 } };
    const curr = { workTarget: { ...target, deficit: 900 } };
    expect(classifyRepProgress(prev, curr, 10)).toEqual({ status: 'progressing', ratePerSec: 10 });
  });

  it('STALLED (not unknown): deficit unchanged -- the state the old null swallowed', () => {
    const prev = { workTarget: { ...target, deficit: 1000 } };
    const curr = { workTarget: { ...target, deficit: 1000 } };
    expect(classifyRepProgress(prev, curr, 10)).toEqual({ status: 'stalled', ratePerSec: 0 });
  });

  it('stalled: deficit grew', () => {
    const prev = { workTarget: { ...target, deficit: 900 } };
    const curr = { workTarget: { ...target, deficit: 1000 } };
    expect(classifyRepProgress(prev, curr, 10).status).toBe('stalled');
  });

  it('unknown: target changed between reads', () => {
    const prev = { workTarget: { aug: 'X', faction: 'F1', deficit: 1000 } };
    const curr = { workTarget: { aug: 'Y', faction: 'F1', deficit: 900 } };
    expect(classifyRepProgress(prev, curr, 10)).toEqual({ status: 'unknown', ratePerSec: null });
  });

  it('unknown: missing workTarget on either side', () => {
    expect(classifyRepProgress(null, { workTarget: { ...target, deficit: 1 } }, 10).status).toBe('unknown');
    expect(classifyRepProgress({ workTarget: { ...target, deficit: 1 } }, null, 10).status).toBe('unknown');
  });

  it('unknown: dtSec <= 0', () => {
    const prev = { workTarget: { ...target, deficit: 1000 } };
    const curr = { workTarget: { ...target, deficit: 900 } };
    expect(classifyRepProgress(prev, curr, 0).status).toBe('unknown');
  });
});

describe('detectRepStarvation', () => {
  const T0 = 1_000_000_000;
  const target = { aug: 'Neuregen Gene Modification', faction: 'Chongqing' };
  // The live fixture shape from augfarmer-state.json: target.deficit reads 0 (head
  // purchase target met) while workTarget.deficit reads a large positive number (the
  // rep-grind target) -- reading target.deficit instead of workTarget.deficit was the bug.
  const liveShape = (deficit, atMs = T0) => ({ phase: 'grinding', timestamp: atMs, target: { deficit: 0 }, workTarget: { ...target, deficit } });

  // accumSinceMs is stamped on the FIRST tick that observes "stalled" (the tick that
  // establishes the status, comparing against a prior read) -- not retroactively to an
  // earlier "unknown" baseline read. So driving the detector to "fired" needs THREE
  // ticks: (1) baseline/unknown, (2) the first stalled comparison (starts the
  // accumulator), (3) SUSTAIN_MS later (fires). This helper does exactly that and
  // returns the state at the moment accumulation started, so tests can advance from there.
  function primeStalled(deficit = 20653) {
    let state = detectRepStarvation(liveShape(deficit, T0), T0, null);
    const t = T0 + 1000;
    state = detectRepStarvation(liveShape(deficit, t), t, state);
    expect(state.status).toBe('stalled');
    expect(state.accumSinceMs).toBe(t);
    return { state, primedAtMs: t };
  }

  it('does not fire before REP_STARVED_SUSTAIN_MS has elapsed since accumulation started', () => {
    const { state: primed, primedAtMs } = primeStalled();
    const t = primedAtMs + REP_STARVED_SUSTAIN_MS - 1000;
    const state = detectRepStarvation(liveShape(20653, t), t, primed);
    expect(state.fired).toBe(false);
  });

  it('fires once the starved (stalled) condition holds for REP_STARVED_SUSTAIN_MS', () => {
    const { state: primed, primedAtMs } = primeStalled();
    const t = primedAtMs + REP_STARVED_SUSTAIN_MS;
    const state = detectRepStarvation(liveShape(20653, t), t, primed);
    expect(state.fired).toBe(true);
    expect(state.justFired).toBe(true);
  });

  it('a fixture built from the live augfarmer-state.json shape (target.deficit: 0) fires -- reads workTarget, not target', () => {
    const { state: primed, primedAtMs } = primeStalled(20653);
    const t = primedAtMs + REP_STARVED_SUSTAIN_MS;
    const state = detectRepStarvation(liveShape(20653, t), t, primed);
    expect(state.fired).toBe(true);
  });

  it('does not fire while progressing above REP_STARVED_RATE', () => {
    let state = null;
    let deficit = 100_000;
    let t = T0;
    for (let i = 0; i < 10; i++) {
      state = detectRepStarvation(liveShape(deficit, t), t, state);
      t += 60_000;
      deficit -= 2 * 60_000; // 2 rep/sec, above REP_STARVED_RATE
    }
    expect(state.fired).toBe(false);
  });

  it('does not fire on "unknown" samples (missing/stale data is inert, not evidence of starvation)', () => {
    let state = null;
    let t = T0;
    for (let i = 0; i < 10; i++) {
      state = detectRepStarvation(null, t, state);
      t += REP_STARVED_SUSTAIN_MS / 2;
    }
    expect(state.fired).toBe(false);
    expect(state.status).toBe('unknown');
  });

  it('an "unknown" sample does not RESET an in-progress accumulation either', () => {
    const { state: primed, primedAtMs } = primeStalled();
    const midT = primedAtMs + 1000;
    const midState = detectRepStarvation(null, midT, primed); // stale/unknown blip mid-accumulation
    expect(midState.accumSinceMs).toBe(primed.accumSinceMs); // untouched by the unknown sample
    const t = primedAtMs + REP_STARVED_SUSTAIN_MS;
    const state = detectRepStarvation(liveShape(20653, t), t, midState);
    expect(state.fired).toBe(true);
  });

  it('clears on sustained progress at/above REP_STARVED_CLEAR_RATE for REP_STARVED_CLEAR_MS', () => {
    const { state: primed, primedAtMs } = primeStalled();
    let t = primedAtMs + REP_STARVED_SUSTAIN_MS;
    let state = detectRepStarvation(liveShape(20653, t), t, primed);
    expect(state.fired).toBe(true);
    let deficit = 20653;
    for (let i = 0; i < 6; i++) {
      t += REP_STARVED_CLEAR_MS / 5;
      deficit -= REP_STARVED_CLEAR_RATE * (REP_STARVED_CLEAR_MS / 5 / 1000);
      state = detectRepStarvation(liveShape(deficit, t), t, state);
    }
    expect(state.fired).toBe(false);
    expect(state.clearedNow).toBe(true);
  });

  it('clears when the deficit reaches zero', () => {
    const { state: primed, primedAtMs } = primeStalled();
    let t = primedAtMs + REP_STARVED_SUSTAIN_MS;
    let state = detectRepStarvation(liveShape(20653, t), t, primed);
    expect(state.fired).toBe(true);
    t += 1000;
    state = detectRepStarvation({ ...liveShape(0, t), workTarget: { ...target, deficit: 0 } }, t, state);
    expect(state.fired).toBe(false);
  });

  it('clears when the phase leaves "grinding"', () => {
    const { state: primed, primedAtMs } = primeStalled();
    let t = primedAtMs + REP_STARVED_SUSTAIN_MS;
    let state = detectRepStarvation(liveShape(20653, t), t, primed);
    expect(state.fired).toBe(true);
    t += 1000;
    state = detectRepStarvation({ ...liveShape(20653, t), phase: 'awaiting-money' }, t, state);
    expect(state.fired).toBe(false);
  });
});

// --- seedRepStarvation (2026-08-03: the D11a guard could never fire) --------------
//
// 🔴 The detector needs 30 min of CONTINUOUS starvation, but its accumulator lived only in
// memory while the engine restarts routinely (installs kill it, the supervisor relaunches
// it, deploys restart it -- 22 startups in one log ring). Every restart reset the window to
// zero, so the mechanism protecting the aug ratchet from Bladeburner had never once fired.
// Measured cost: 0.0023 rep/s starved vs 1.1631 rep/s working -- 503x -- and a 54h stall.

describe('seedRepStarvation', () => {
  const NOW = 10_000_000;

  it('🔴 THE REGRESSION: an in-progress accumulation survives a restart', () => {
    const state = { timestamp: NOW - 1000, repStarvation: { fired: false, sinceMs: NOW - 20 * 60_000, status: 'stalled' } };
    const seeded = seedRepStarvation(state, NOW);
    expect(seeded.accumSinceMs).toBe(NOW - 20 * 60_000);
    expect(seeded.fired).toBe(false);
  });

  it('and the restored accumulation actually reaches the fire threshold instead of restarting the clock', () => {
    // 20 minutes were already banked before the restart; 10 more must be enough.
    const state = { timestamp: NOW - 1000, repStarvation: { fired: false, sinceMs: NOW - 20 * 60_000, status: 'stalled' } };
    let s = seedRepStarvation(state, NOW);
    const shape = (deficit, at) => ({ phase: 'grinding', timestamp: at, workTarget: { aug: 'A', faction: 'F', deficit } });
    s = detectRepStarvation(shape(999, NOW), NOW, s); // establishes a baseline read
    const later = NOW + 10 * 60_000 + 1000;
    s = detectRepStarvation(shape(999, later), later, s); // stalled, and past 30 min total
    expect(s.fired).toBe(true);
  });

  it('a fired state survives a restart too -- the yield must not silently stop', () => {
    const state = { timestamp: NOW - 1000, repStarvation: { fired: true, sinceMs: NOW - 60 * 60_000 } };
    expect(seedRepStarvation(state, NOW).fired).toBe(true);
  });

  it('a STALE snapshot is not restored -- no resuming a days-old accumulation and firing instantly', () => {
    const state = { timestamp: NOW - 16 * 60_000, repStarvation: { fired: false, sinceMs: NOW - 60 * 60_000 } };
    expect(seedRepStarvation(state, NOW)).toBeNull();
  });

  it('missing / malformed / never-accumulated input degrades to a fresh start, not a crash', () => {
    expect(seedRepStarvation(null, NOW)).toBeNull();
    expect(seedRepStarvation({}, NOW)).toBeNull();
    expect(seedRepStarvation({ timestamp: NOW, repStarvation: 'corrupt' }, NOW)).toBeNull();
    expect(seedRepStarvation({ timestamp: NOW, repStarvation: { fired: false, sinceMs: null } }, NOW)).toBeNull();
  });
});

// --- computeWallRates / dutyFromTotals (S1, T-TEL -- the Phase 38 regression test) --

describe('computeWallRates', () => {
  const windows = { short: 10_000 };

  it('finite window: derives rankPerWallSec and dutyCycle from wallSec/actionSec/rankGained', () => {
    const samples = [
      { timestamp: 1000, wallSec: 5, actionSec: 5, rankDelta: 1, rankProducingSec: 5, postInstallSec: 0 },
      { timestamp: 2000, wallSec: 5, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0 },
    ];
    const out = computeWallRates(emptyTotals(), samples, windows, 2000);
    expect(out.short.wallSec).toBe(10);
    expect(out.short.actionSec).toBe(5);
    expect(out.short.rankGained).toBe(1);
    expect(out.short.dutyCycle).toBe(0.5);
    expect(out.short.rankPerWallSec).toBe(0.1);
  });

  it('zero-wallSec window reports 0, not NaN/Infinity', () => {
    const out = computeWallRates(emptyTotals(), [], windows, 2000);
    expect(out.short).toEqual({ wallSec: 0, actionSec: 0, rankGained: 0, rankProducingSec: 0, postInstallSec: 0, rankPerWallSec: 0, dutyCycle: 0, rankPerWallSecExPostInstall: 0 });
  });

  it("T-TEL REGRESSION (Phase 38's defining bug): the engine INTENDED an action for the whole window but getCurrentAction() never verified -> dutyCycle is 0 and rankPerWallSec reflects only real rank movement", () => {
    // 100 ticks of 1s each, engine believed it was holding the whole time (intent), but
    // every tick failed verification (actionSec: 0) except the two ticks a rank action
    // genuinely completed for 1s with a real rank gain.
    const samples = [];
    for (let i = 0; i < 100; i++) samples.push({ timestamp: i * 1000, wallSec: 1, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0 });
    samples.push({ timestamp: 100_000, wallSec: 1, actionSec: 1, rankDelta: 0.5, rankProducingSec: 1, postInstallSec: 0 });
    const out = computeWallRates(emptyTotals(), samples, { all: Infinity }, 100_000);
    expect(out.all.dutyCycle).toBeCloseTo(1 / 101, 6);
    expect(out.all.rankGained).toBe(0.5);
  });

  it('cumulative comes from totals, not the pruned sample buffer', () => {
    const totals = { ...emptyTotals(), wallSec: 100_000, actionSec: 80_000, rankGained: 500, rankProducingSec: 60_000, postInstallSec: 0 };
    const out = computeWallRates(totals, [], {}, 999_999);
    expect(out.cumulative.wallSec).toBe(100_000);
    expect(out.cumulative.rankPerWallSec).toBeCloseTo(0.005, 10);
    expect(out.cumulative.dutyCycle).toBeCloseTo(0.8, 10);
  });

  it('rankPerWallSecExPostInstall excludes exactly the post-install seconds while the headline rate still includes them', () => {
    const totals = { ...emptyTotals(), wallSec: 1000, actionSec: 1000, rankGained: 10, rankProducingSec: 500, postInstallSec: 400 };
    const out = computeWallRates(totals, [], {}, 0);
    expect(out.cumulative.rankPerWallSec).toBeCloseTo(0.01, 10);
    expect(out.cumulative.rankPerWallSecExPostInstall).toBeCloseTo(10 / 600, 10);
  });
});

describe('dutyFromTotals', () => {
  it('splits into the four exhaustive buckets', () => {
    const totals = { ...emptyTotals(), rankProducingSec: 10, overheadSec: 5, yieldedSec: 3, idleSec: 2 };
    expect(dutyFromTotals(totals)).toEqual({ rankProducingSec: 10, overheadSec: 5, yieldedSec: 3, idleSec: 2 });
  });
});

// --- pruneSamples (unchanged) ------------------------------------------------------

describe('pruneSamples', () => {
  it('drops samples older than the window and keeps the rest', () => {
    const samples = [{ timestamp: 0 }, { timestamp: 5_000 }, { timestamp: 10_000 }];
    expect(pruneSamples(samples, 10_000, 6_000)).toEqual([{ timestamp: 5_000 }, { timestamp: 10_000 }]);
  });
  it('keeps a sample exactly at the cutoff', () => {
    expect(pruneSamples([{ timestamp: 4_000 }], 10_000, 6_000)).toEqual([{ timestamp: 4_000 }]);
  });
  it('returns the SAME array when nothing is old enough to drop', () => {
    const samples = [{ timestamp: 9_000 }, { timestamp: 10_000 }];
    expect(pruneSamples(samples, 10_000, 6_000)).toBe(samples);
  });
  it('empty input is safe', () => {
    expect(pruneSamples([], 10_000)).toEqual([]);
  });
  it('the hard cap trims the OLDEST entries when the tick rate outruns the window', () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({ timestamp: 1_000 + i }));
    const out = pruneSamples(samples, 1_010, 60_000, 4);
    expect(out).toHaveLength(4);
    expect(out[0].timestamp).toBe(1_006);
  });
  it('REGRESSION: a full 24h at 1 tick/sec survives pruning', () => {
    const ticks = 86_400;
    const samples = Array.from({ length: ticks }, (_, i) => ({ timestamp: i * 1000 }));
    const out = pruneSamples(samples, (ticks - 1) * 1000);
    expect(out).toHaveLength(ticks);
    expect(SAMPLE_HARD_CAP).toBeGreaterThan(MAX_FINITE_WINDOW_MS / 1000);
  });
  it('RATE_WINDOWS_MS must not contain an infinite window -- cumulative comes from totals', () => {
    expect(Object.values(RATE_WINDOWS_MS).every(Number.isFinite)).toBe(true);
    expect(MAX_FINITE_WINDOW_MS).toBe(86_400_000);
  });
});

// --- emptyTotals / accumulateTotals / seedTotals (S1's reshaped totals) -----------

describe('emptyTotals / accumulateTotals', () => {
  it('starts at zero on every field', () => {
    expect(emptyTotals()).toEqual({ wallSec: 0, actionSec: 0, rankGained: 0, rankProducingSec: 0, overheadSec: 0, yieldedSec: 0, idleSec: 0, postInstallSec: 0, restarts: 0 });
  });

  it('a verified rank-producing tick credits wallSec, actionSec, rankGained, rankProducingSec', () => {
    const out = accumulateTotals(emptyTotals(), { wallSec: 5, actionSec: 5, rankDelta: 2, rankProducingSec: 5, postInstallSec: 0, kind: 'rank' });
    expect(out).toEqual({ wallSec: 5, actionSec: 5, rankGained: 2, rankProducingSec: 5, overheadSec: 0, yieldedSec: 0, idleSec: 0, postInstallSec: 0, restarts: 0 });
  });

  it('an overhead tick advances actionSec (if verified) but not rankProducingSec', () => {
    const out = accumulateTotals(emptyTotals(), { wallSec: 4, actionSec: 4, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0, kind: 'overhead' });
    expect(out.actionSec).toBe(4);
    expect(out.rankProducingSec).toBe(0);
    expect(out.overheadSec).toBe(4);
  });

  it('a yielded tick advances wallSec/yieldedSec only -- zero actionSec', () => {
    const out = accumulateTotals(emptyTotals(), { wallSec: 7, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0, kind: 'yielded' });
    expect(out).toEqual({ wallSec: 7, actionSec: 0, rankGained: 0, rankProducingSec: 0, overheadSec: 0, yieldedSec: 7, idleSec: 0, postInstallSec: 0, restarts: 0 });
  });

  it('an idle (off-marker) tick advances wallSec/idleSec only', () => {
    const out = accumulateTotals(emptyTotals(), { wallSec: 3, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0, kind: 'idle' });
    expect(out.idleSec).toBe(3);
  });

  it('the four buckets always sum to wallSec (given the caller convention: rankProducingSec === wallSec iff kind is "rank")', () => {
    let totals = emptyTotals();
    const kinds = ['rank', 'overhead', 'yielded', 'idle'];
    for (let i = 0; i < 40; i++) {
      const kind = kinds[i % 4];
      totals = accumulateTotals(totals, { wallSec: 1, actionSec: kind === 'rank' || kind === 'overhead' ? 1 : 0, rankDelta: 0, rankProducingSec: kind === 'rank' ? 1 : 0, postInstallSec: 0, kind });
    }
    expect(totals.rankProducingSec + totals.overheadSec + totals.yieldedSec + totals.idleSec).toBeCloseTo(totals.wallSec, 10);
  });

  it('does not mutate its input', () => {
    const before = emptyTotals();
    accumulateTotals(before, { wallSec: 5, actionSec: 5, rankDelta: 2, rankProducingSec: 5, postInstallSec: 0, kind: 'rank' });
    expect(before).toEqual(emptyTotals());
  });

  it('missing fields are treated as zero, not NaN', () => {
    const out = accumulateTotals(emptyTotals(), { kind: 'rank' });
    expect(out).toEqual(emptyTotals());
  });

  it('a negative rankDelta (a failed action losing rank) reduces rankGained', () => {
    const out = accumulateTotals(emptyTotals(), { wallSec: 3, actionSec: 3, rankDelta: -1.5, rankProducingSec: 3, postInstallSec: 0, kind: 'rank' });
    expect(out.rankGained).toBe(-1.5);
  });

  it('postInstallSec accumulates independently of kind', () => {
    const out = accumulateTotals(emptyTotals(), { wallSec: 10, actionSec: 10, rankDelta: 0, rankProducingSec: 0, postInstallSec: 10, kind: 'overhead' });
    expect(out.postInstallSec).toBe(10);
  });
});

describe('seedTotals', () => {
  it('null/missing state starts fresh with no restart counted', () => {
    expect(seedTotals(null)).toEqual(emptyTotals());
    expect(seedTotals({})).toEqual(emptyTotals());
  });

  it('restores every field and counts the restart', () => {
    const prior = { wallSec: 100, actionSec: 80, rankGained: 5, rankProducingSec: 60, overheadSec: 20, yieldedSec: 10, idleSec: 5, postInstallSec: 0, restarts: 2 };
    expect(seedTotals({ totals: prior })).toEqual({ ...prior, restarts: 3 });
  });

  it('a partial totals object fills the missing fields with zero rather than NaN', () => {
    expect(seedTotals({ totals: { wallSec: 50 } })).toEqual({ ...emptyTotals(), wallSec: 50, restarts: 1 });
  });

  it('rejects non-finite and negative values instead of poisoning the measurement', () => {
    const out = seedTotals({ totals: { wallSec: NaN, actionSec: -5, rankGained: 'nope', rankProducingSec: Infinity } });
    expect(out).toEqual({ ...emptyTotals(), restarts: 1 });
  });

  it('a non-object totals field degrades to fresh', () => {
    expect(seedTotals({ totals: 'corrupt' })).toEqual(emptyTotals());
  });

  it('LIVE REGRESSION 2026-08-03: a Phase-38-shaped totals blob (no wallSec, but colliding rankGained/overheadSec field names) is rejected in full, not partially adopted', () => {
    // The exact live symptom: a fresh restart under this engine seeded rankGained: 1824.8
    // and overheadSec: 48720 from the old shape's same-named fields, against a genuinely
    // fresh wallSec: 0 -- producing a rankPerWallSec of ~12-29 instead of the true ~0.02-0.03
    // until enough new wallSec accrued to dilute the contamination back down.
    const phase38Shaped = { heldSec: 75745, uptimeSec: 77354, rankGained: 1824.8, rankSec: 28227, overheadSec: 48720, unheldSec: 1609, restarts: 4 };
    expect(seedTotals({ totals: phase38Shaped })).toEqual(emptyTotals());
  });

  it('carrying totals across a restart preserves the accumulated rate', () => {
    let totals = emptyTotals();
    for (let i = 0; i < 10; i++) totals = accumulateTotals(totals, { wallSec: 1, actionSec: 1, rankDelta: 0.1, rankProducingSec: 1, postInstallSec: 0, kind: 'rank' });
    const resumed = seedTotals({ totals });
    expect(resumed.rankGained).toBeCloseTo(1, 10);
    expect(resumed.restarts).toBe(1);
  });
});

// --- Checkpoints (S14) ------------------------------------------------------------

describe('evaluateC1', () => {
  it('null before the uptime threshold', () => {
    expect(evaluateC1({ ...emptyTotals(), wallSec: C1_UPTIME_MS / 1000 - 1 })).toBeNull();
  });
  it('PASS at/above the bar once uptime is met', () => {
    const totals = { ...emptyTotals(), wallSec: C1_UPTIME_MS / 1000, rankGained: (C1_UPTIME_MS / 1000) * C1_BAR };
    expect(evaluateC1(totals).met).toBe(true);
  });
  it('FAIL below the bar', () => {
    const totals = { ...emptyTotals(), wallSec: C1_UPTIME_MS / 1000, rankGained: 0 };
    expect(evaluateC1(totals).met).toBe(false);
  });
});

describe('evaluateC3A', () => {
  it('null before 7 days', () => {
    expect(evaluateC3A({ ...emptyTotals(), wallSec: C3_UPTIME_MS / 1000 - 1 })).toBeNull();
  });
  it('requires BOTH the rate bar and the duty-cycle floor', () => {
    const wallSec = C3_UPTIME_MS / 1000;
    const goodRateBadDuty = { ...emptyTotals(), wallSec, rankGained: wallSec * C1_BAR, actionSec: wallSec * (C3A_DUTY_BAR - 0.01) };
    expect(evaluateC3A(goodRateBadDuty).met).toBe(false);
    const goodBoth = { ...emptyTotals(), wallSec, rankGained: wallSec * C1_BAR, actionSec: wallSec * C3A_DUTY_BAR };
    expect(evaluateC3A(goodBoth).met).toBe(true);
  });
});

describe('evaluateC3B', () => {
  it('is "not-applicable", never a miss, while STAGE_B_ENABLED is false', () => {
    expect(STAGE_B_ENABLED).toBe(false);
    expect(evaluateC3B(STAGE_B_ENABLED)).toEqual({ status: 'not-applicable', reason: 'STAGE_B_ENABLED false' });
  });
});

// --- appendBbLog / seedBbLog / appendAttempt / seedAttempts -----------------------

describe('appendBbLog', () => {
  it('appends and ring-trims at BB_LOG_MAX_ENTRIES', () => {
    const entries = Array.from({ length: BB_LOG_MAX_ENTRIES }, (_, i) => ({ i }));
    const next = appendBbLog(entries, { i: 'new' });
    expect(next.length).toBe(BB_LOG_MAX_ENTRIES);
    expect(next[next.length - 1]).toEqual({ i: 'new' });
  });
});

describe('seedBbLog', () => {
  it('parses valid JSON array content', () => {
    expect(seedBbLog(JSON.stringify([{ kind: 'startup' }]))).toEqual([{ kind: 'startup' }]);
  });
  it('falls back to [] on missing/empty/malformed/non-array content', () => {
    expect(seedBbLog('')).toEqual([]);
    expect(seedBbLog(null)).toEqual([]);
    expect(seedBbLog('not json')).toEqual([]);
    expect(seedBbLog(JSON.stringify({ not: 'an array' }))).toEqual([]);
  });
});

describe('appendAttempt / seedAttempts (S7)', () => {
  it('ring-trims at BB_ATTEMPTS_MAX_ENTRIES', () => {
    const entries = Array.from({ length: BB_ATTEMPTS_MAX_ENTRIES }, (_, i) => ({ i }));
    const next = appendAttempt(entries, { i: 'new' });
    expect(next.length).toBe(BB_ATTEMPTS_MAX_ENTRIES);
    expect(next[next.length - 1]).toEqual({ i: 'new' });
  });
  it('seedAttempts falls back to [] on malformed content', () => {
    expect(seedAttempts('not json')).toEqual([]);
    expect(seedAttempts(null)).toEqual([]);
  });
});

// --- buildBbState ------------------------------------------------------------------

describe('buildBbState', () => {
  it('computes timestamp/time from `now` and spreads every other field verbatim', () => {
    const state = buildBbState({ now: 1000, rank: 42, blackOpsDaedalusRank: BLACKOPS_DAEDALUS_RANK });
    expect(state.timestamp).toBe(1000);
    expect(state.time).toBeTypeOf('string');
    expect(state.rank).toBe(42);
    expect(state.blackOpsDaedalusRank).toBe(BLACKOPS_DAEDALUS_RANK);
  });
});

// --- updateStaminaRecovering (STAMINA_RESUME_FRACTION lowered 0.8 -> 0.55, S16.4) --

describe('updateStaminaRecovering', () => {
  it('trips at the floor', () => {
    expect(updateStaminaRecovering(false, STAMINA_FLOOR_FRACTION - 0.01)).toBe(true);
  });
  it('does not trip exactly at the floor', () => {
    expect(updateStaminaRecovering(false, STAMINA_FLOOR_FRACTION)).toBe(false);
  });
  it('releases at the resume threshold', () => {
    expect(updateStaminaRecovering(true, STAMINA_RESUME_FRACTION)).toBe(false);
  });
  it('HOLDS in the hysteresis band rather than flapping back into the penalty', () => {
    const mid = (STAMINA_FLOOR_FRACTION + STAMINA_RESUME_FRACTION) / 2;
    expect(updateStaminaRecovering(true, mid)).toBe(true);
    expect(updateStaminaRecovering(false, mid)).toBe(false);
  });
  it('the band is non-empty', () => {
    expect(STAMINA_RESUME_FRACTION).toBeGreaterThan(STAMINA_FLOOR_FRACTION);
  });
  it('STAMINA_RESUME_FRACTION is 0.55 -- lowered from Phase 38, above 50% is provably wasted rest per the closed-form penalty', () => {
    expect(STAMINA_RESUME_FRACTION).toBe(0.55);
  });
  it('a full drain-and-refill cycle trips once and releases once, at the new 0.55 resume', () => {
    let recovering = false;
    const seen = [];
    for (const fraction of [1.0, 0.7, 0.55, 0.49, 0.2, 0.05, 0.3, 0.6, 0.79, 0.8, 0.95]) {
      recovering = updateStaminaRecovering(recovering, fraction);
      seen.push(recovering);
    }
    expect(seen).toEqual([false, false, false, true, true, true, true, false, false, false, false]);
  });
});

describe('updateHpRecovering', () => {
  it('trips below the floor', () => {
    expect(updateHpRecovering(false, HP_FLOOR_FRACTION - 0.01)).toBe(true);
  });
  it('does NOT release at the floor -- that is the flap', () => {
    expect(updateHpRecovering(true, HP_FLOOR_FRACTION + 0.01)).toBe(true);
  });
  it('releases only at the resume mark', () => {
    expect(updateHpRecovering(true, HP_RESUME_FRACTION)).toBe(false);
  });
  it('holds its previous value inside the band', () => {
    const mid = (HP_FLOOR_FRACTION + HP_RESUME_FRACTION) / 2;
    expect(updateHpRecovering(false, mid)).toBe(false);
    expect(updateHpRecovering(true, mid)).toBe(true);
  });
  it('pickRankAction honours the latch over the bare threshold', () => {
    const c = { type: 'Contracts', name: 'Tracking', pMin: 0.5, rankGain: 1, rankLoss: 0, timeMs: 13_000 };
    expect(pickRankAction([c], { hpRecovering: true })).toBeNull();
    expect(pickRankAction([c], { hpRecovering: false }).name).toBe('Tracking');
  });
});

// --- Diplomacy budget + effect measurement (2026-08-03) ---------------------------

describe('diplomacyBudgetRemainingMs', () => {
  const NOW = 10_000_000;

  it('a fresh hour has the full ceiling available', () => {
    expect(diplomacyBudgetRemainingMs([], NOW)).toBe(MAX_DIPLOMACY_DUTY * 3_600_000);
  });

  it('spends down as runs accumulate, and floors at 0 rather than going negative', () => {
    const ceiling = MAX_DIPLOMACY_DUTY * 3_600_000;
    const oneRun = [{ startMs: NOW - 1000, durationMs: 60_000 }];
    expect(diplomacyBudgetRemainingMs(oneRun, NOW)).toBe(ceiling - 60_000);
    const manyRuns = Array.from({ length: 100 }, (_, i) => ({ startMs: NOW - i * 1000, durationMs: 60_000 }));
    expect(diplomacyBudgetRemainingMs(manyRuns, NOW)).toBe(0);
  });

  it('runs older than the rolling hour stop counting', () => {
    const old = [{ startMs: NOW - 3_600_001, durationMs: 60_000 }];
    expect(diplomacyBudgetRemainingMs(old, NOW)).toBe(MAX_DIPLOMACY_DUTY * 3_600_000);
  });

  it('the ceiling bounds Diplomacy to at most MAX_DIPLOMACY_DUTY of any hour', () => {
    const ceiling = MAX_DIPLOMACY_DUTY * 3_600_000;
    expect(ceiling / 3_600_000).toBeCloseTo(MAX_DIPLOMACY_DUTY, 10);
    expect(ceiling / 60_000).toBe(12); // at most 12 sixty-second runs per hour
  });
});

describe('accumulateDiplomacyEffect', () => {
  it('records chaos REMOVED (before - after), so positive means it worked', () => {
    const out = accumulateDiplomacyEffect(emptyDiplomacyEffect(), 100, 95);
    expect(out.runs).toBe(1);
    expect(out.totalRemoved).toBe(5);
    expect(out.meanRemovedPerRun).toBe(5);
  });

  it('a run where chaos ROSE anyway records negative -- the honest reading, not clamped to 0', () => {
    const out = accumulateDiplomacyEffect(emptyDiplomacyEffect(), 100, 105);
    expect(out.meanRemovedPerRun).toBe(-5);
  });

  it('averages across runs', () => {
    let e = emptyDiplomacyEffect();
    e = accumulateDiplomacyEffect(e, 100, 90); // 10
    e = accumulateDiplomacyEffect(e, 90, 88); // 2
    expect(e.runs).toBe(2);
    expect(e.meanRemovedPerRun).toBe(6);
  });

  it('keeps a bounded sample ring so the estimate tracks the current regime', () => {
    let e = emptyDiplomacyEffect();
    for (let i = 0; i < 50; i++) e = accumulateDiplomacyEffect(e, 100, 99, 20);
    expect(e.samples.length).toBe(20);
    expect(e.runs).toBe(50); // the lifetime count is still exact
  });

  it('a non-finite reading is ignored rather than poisoning the estimate', () => {
    const e = accumulateDiplomacyEffect(emptyDiplomacyEffect(), NaN, 5);
    expect(e.runs).toBe(0);
  });

  it('🔴 the real live contamination: a cross-city delta must never be fed in as a Diplomacy effect', () => {
    // Caught live 2026-08-03: one sample recorded 174.15 "removed", which was entirely the
    // Sector-12 (177.5) -> Volhaven (3.4) move. The caller is responsible for discarding a
    // sample whose city changed mid-window; this documents WHY that guard exists by showing
    // what the number looks like if it does not.
    const contaminated = accumulateDiplomacyEffect(emptyDiplomacyEffect(), 177.53, 3.39);
    expect(contaminated.meanRemovedPerRun).toBeCloseTo(174.14, 1);
    // ...which is ~50x any plausible single-run effect, i.e. obviously a city move.
    expect(contaminated.meanRemovedPerRun).toBeGreaterThan(100);
  });
});

// --- detectOverheadStall (the 2026-08-03 watchdog) --------------------------------

describe('detectOverheadStall', () => {
  const NOW = 10_000_000;
  const base = { nowMs: NOW, allActionsQuarantined: false, inPostInstallRegime: false };

  it('fires once rank-producing time has been absent longer than the budget', () => {
    const d = detectOverheadStall({ ...base, lastRankProducingMs: NOW - OVERHEAD_STALL_WARN_MS });
    expect(d.stalled).toBe(true);
    expect(d.reason).toBe('no-rank-producing-time');
  });

  it('does not fire inside the budget', () => {
    expect(detectOverheadStall({ ...base, lastRankProducingMs: NOW - OVERHEAD_STALL_WARN_MS + 1 }).stalled).toBe(false);
  });

  it('REGRESSION: the live 10.5h park would have fired this watchdog', () => {
    const tenPointFiveHours = 10.5 * 3600 * 1000;
    expect(detectOverheadStall({ ...base, lastRankProducingMs: NOW - tenPointFiveHours }).stalled).toBe(true);
  });

  it('stays quiet while every action is quarantined -- already flagged separately, not a second alarm', () => {
    const d = detectOverheadStall({ ...base, lastRankProducingMs: NOW - 99 * 3600_000, allActionsQuarantined: true });
    expect(d.stalled).toBe(false);
    expect(d.reason).toBe('all-quarantined');
  });

  it('stays quiet in the post-install Training regime -- zero rank time is the design there (S9a)', () => {
    const d = detectOverheadStall({ ...base, lastRankProducingMs: NOW - 99 * 3600_000, inPostInstallRegime: true });
    expect(d.stalled).toBe(false);
    expect(d.reason).toBe('post-install-regime');
  });

  it('needs a baseline -- a missing/non-finite last-rank timestamp is not evidence of a stall', () => {
    expect(detectOverheadStall({ ...base, lastRankProducingMs: null }).stalled).toBe(false);
    expect(detectOverheadStall({ ...base, lastRankProducingMs: undefined }).reason).toBe('no-baseline');
  });
});

// --- isPostInstallRegime (S9a) -----------------------------------------------------

describe('isPostInstallRegime', () => {
  it('classifies hp.max === 10 (fresh install, defense reset) as post-install', () => {
    expect(isPostInstallRegime(10)).toBe(true);
  });
  it('classifies hp.max === 27 (measured steady-state) as NOT post-install', () => {
    expect(isPostInstallRegime(27)).toBe(false);
  });
  it('the threshold itself counts as post-install', () => {
    expect(isPostInstallRegime(POST_INSTALL_HP_MAX_THRESHOLD)).toBe(true);
    expect(isPostInstallRegime(POST_INSTALL_HP_MAX_THRESHOLD + 1)).toBe(false);
  });
});

// --- pickOverheadAction (S9a, S10, S11 -- reshaped: no Recruitment in Stage A, Training preferred post-install) --

describe('pickOverheadAction', () => {
  it('HP guard takes priority over everything else', () => {
    expect(pickOverheadAction(HP_FLOOR_FRACTION - 0.01, 5, 0, true)).toEqual({ type: 'General', name: 'Hyperbolic Regeneration Chamber' });
  });

  it('stamina recovery also routes to HRC', () => {
    expect(pickOverheadAction(1, 0, 0, false, true)).toEqual({ type: 'General', name: 'Hyperbolic Regeneration Chamber' });
  });

  it('post-install regime prefers Training over everything except an unmet HP/stamina guard', () => {
    expect(pickOverheadAction(1, 0, 0, false, false, { inPostInstallRegime: true, postInstallTrainingMs: 0 })).toEqual({ type: 'General', name: 'Training' });
  });

  it('Training stops once POST_INSTALL_TRAINING_MAX_MS is reached, even still in the regime', () => {
    const picked = pickOverheadAction(1, 0, 0, false, false, { inPostInstallRegime: true, postInstallTrainingMs: POST_INSTALL_TRAINING_MAX_MS });
    expect(picked.name).not.toBe('Training');
  });

  it('low inventory beats chaos once HP/regime are fine', () => {
    expect(pickOverheadAction(1, CHAOS_DIPLOMACY_THRESHOLD + 1, 0, true)).toEqual({ type: 'General', name: 'Incite Violence' });
  });

  // ⚠️ ACKNOWLEDGED BEHAVIOUR CHANGE 2026-08-03 (spec T1 requires these be named, not
  // silently edited): Diplomacy is now BUDGET-GATED, so this fixture must supply a
  // budget. The default is 0 -- deliberately fail-safe, so a caller that forgets the
  // ledger gets "no Diplomacy" rather than an unbounded chaos grind.
  it('high chaos triggers Diplomacy once HP/inventory/regime are fine AND the budget has room', () => {
    expect(pickOverheadAction(1, CHAOS_DIPLOMACY_THRESHOLD + 0.1, 0, false, false, { diplomacyBudgetMs: 60_000 })).toEqual({ type: 'General', name: 'Diplomacy' });
  });

  it('and with no budget supplied it falls through to HRC rather than grinding chaos unbounded', () => {
    expect(pickOverheadAction(1, CHAOS_DIPLOMACY_THRESHOLD + 0.1, 0, false)).toEqual({ type: 'General', name: 'Hyperbolic Regeneration Chamber' });
  });

  it('Recruitment is DROPPED in Stage A, even with a low team size -- falls through to HRC (S10/S16.5)', () => {
    expect(pickOverheadAction(1, 0, TEAM_SIZE_TARGET - 1, false, false, { stageBEnabled: false })).toEqual({ type: 'General', name: 'Hyperbolic Regeneration Chamber' });
  });

  it('Recruitment reappears once Stage B is enabled', () => {
    expect(pickOverheadAction(1, 0, TEAM_SIZE_TARGET - 1, false, false, { stageBEnabled: true })).toEqual({ type: 'General', name: 'Recruitment' });
  });

  it('defaults to HRC once every other condition is satisfied', () => {
    expect(pickOverheadAction(1, 0, TEAM_SIZE_TARGET, false)).toEqual({ type: 'General', name: 'Hyperbolic Regeneration Chamber' });
  });

  // --- chaos / Diplomacy policy (2026-08-03) ---
  //
  // 🔴 The bug: pickOverheadAction is only reached when pickRankAction returns null (i.e.
  // while recovering), and the call site passed `hpRecovering ? 0 : hpFraction` -- which
  // forced the HP branch and returned HRC before the chaos branch could ever run. So
  // Diplomacy was dead code, chaos compounded unchecked (Sector-12 69 -> 178 in 10.6h),
  // and Tracking's EV/sec collapsed 2.5x over the same window.

  it('🔴 THE REGRESSION: inside the HP hysteresis band with high chaos, runs Diplomacy instead of idling in HRC', () => {
    const picked = pickOverheadAction(0.6, CHAOS_TARGET + 100, 0, false, false, { hpRecovering: true, diplomacyBudgetMs: 60_000 });
    expect(picked.name).toBe('Diplomacy');
  });

  it('🔴 THE REGRESSION, at the real measured numbers (HP 0.759 mid-band, chaos 177.7)', () => {
    const picked = pickOverheadAction(0.759, 177.7, 0, false, false, { hpRecovering: true, diplomacyBudgetMs: 60_000 });
    expect(picked.name).toBe('Diplomacy');
  });

  it('the HARD HP floor is never traded for chaos -- genuine danger still heals', () => {
    const picked = pickOverheadAction(HP_FLOOR_FRACTION - 0.01, 999, 0, false, false, { hpRecovering: true, diplomacyBudgetMs: 60_000 });
    expect(picked.name).toBe('Hyperbolic Regeneration Chamber');
  });

  it('stamina recovery is never interrupted for chaos (stamina gates success directly)', () => {
    const picked = pickOverheadAction(1, 999, 0, false, true, { diplomacyBudgetMs: 60_000 });
    expect(picked.name).toBe('Hyperbolic Regeneration Chamber');
  });

  it('SELF-LIMITING: once chaos is back under target, it stops on its own and resumes healing', () => {
    const picked = pickOverheadAction(0.6, CHAOS_TARGET - 1, 0, false, false, { hpRecovering: true, diplomacyBudgetMs: 60_000 });
    expect(picked.name).toBe('Hyperbolic Regeneration Chamber');
  });

  it('BUDGET-CAPPED: with the rolling-hour ceiling spent, it falls through to healing even at extreme chaos', () => {
    const picked = pickOverheadAction(0.6, 999, 0, false, false, { hpRecovering: true, diplomacyBudgetMs: 0 });
    expect(picked.name).toBe('Hyperbolic Regeneration Chamber');
  });

  it('the post-install regime still takes priority -- Training buys back its own exit condition', () => {
    const picked = pickOverheadAction(0.6, 999, 0, false, false, { hpRecovering: true, diplomacyBudgetMs: 60_000, inPostInstallRegime: true, postInstallTrainingMs: 0 });
    expect(picked.name).toBe('Training');
  });

  it('S11: if HRC itself is quarantined, the engine does NOT stall -- falls through to the next-best overhead action', () => {
    const picked = pickOverheadAction(HP_FLOOR_FRACTION - 0.01, CHAOS_DIPLOMACY_THRESHOLD + 1, 0, true, false, { hrcQuarantined: true });
    expect(picked.name).not.toBe('Hyperbolic Regeneration Chamber');
  });
});

// --- shouldStartAction (S6/S11) --------------------------------------------------
//
// 🔴 These exist because of a 10.5-HOUR LIVE FAILURE on 2026-08-03. The rule was inline
// in the main loop -- and therefore untested -- and read
// `isIdleRead && (changed || !isGeneral || debounceElapsed)`, AND-ing observed idleness
// over every other reason to act. Since startAction auto-repeats and getCurrentAction()
// stays non-null across reps (reference gotcha 13), the engine could never switch away
// from a running action: it picked HRC when the HP floor tripped, then sat in it for
// 10.5 hours at 100% duty and ZERO rank, long after HP hit full. 3 attempts in 10.5h.

describe('shouldStartAction', () => {
  const tracking = { type: 'Contracts', name: 'Tracking' };
  const hrc = { type: 'General', name: 'Hyperbolic Regeneration Chamber' };
  const NOW = 10_000_000;

  it('🔴 THE REGRESSION: switches away from a RUNNING action when the ladder wants a different one', () => {
    // The exact live state: HRC running and repeating (getCurrentAction non-null forever),
    // HP recovered, ladder now wants Tracking. The old rule returned false here, forever.
    const d = shouldStartAction({ chosenAction: tracking, intendedAction: hrc, liveActionName: 'Hyperbolic Regeneration Chamber', nowMs: NOW, lastGeneralRecheckMs: NOW });
    expect(d.start).toBe(true);
    expect(d.reason).toBe('switch');
  });

  it('🔴 THE REGRESSION, generalised: a non-null live action NEVER blocks a switch, at any debounce state', () => {
    for (const lastRecheck of [0, NOW, NOW - 1, NOW - 999_999]) {
      expect(shouldStartAction({ chosenAction: tracking, intendedAction: hrc, liveActionName: 'Hyperbolic Regeneration Chamber', nowMs: NOW, lastGeneralRecheckMs: lastRecheck }).start).toBe(true);
    }
  });

  it('does NOT restart the action already running (a repeat startAction resets progress, S6)', () => {
    const d = shouldStartAction({ chosenAction: tracking, intendedAction: tracking, liveActionName: 'Tracking', nowMs: NOW, lastGeneralRecheckMs: 0 });
    expect(d.start).toBe(false);
    expect(d.reason).toBe('running-desired');
  });

  it('does not restart a running GENERAL action we still want either', () => {
    const d = shouldStartAction({ chosenAction: hrc, intendedAction: hrc, liveActionName: 'Hyperbolic Regeneration Chamber', nowMs: NOW, lastGeneralRecheckMs: 0 });
    expect(d.start).toBe(false);
  });

  it('starts when idle with nothing intended yet (cold start)', () => {
    const d = shouldStartAction({ chosenAction: tracking, intendedAction: null, liveActionName: null, nowMs: NOW });
    expect(d.start).toBe(true);
    expect(d.reason).toBe('switch-idle');
  });

  it('S6: an idle read on the action we intended is a start FAILURE -> retry, which is what feeds the quarantine counter', () => {
    // The startAction no-op bug: intended Tracking, startAction returned true, but the
    // game reads idle. Retrying is what produces consecutive failures -> quarantine.
    const d = shouldStartAction({ chosenAction: tracking, intendedAction: tracking, liveActionName: null, nowMs: NOW });
    expect(d.start).toBe(true);
    expect(d.reason).toBe('restart-idle');
  });

  it('S11: an idle GENERAL action is re-triggered, but only past the debounce floor', () => {
    const within = shouldStartAction({ chosenAction: hrc, intendedAction: hrc, liveActionName: null, nowMs: NOW, lastGeneralRecheckMs: NOW - 1 });
    expect(within.start).toBe(false);
    expect(within.reason).toBe('debounced');
    const past = shouldStartAction({ chosenAction: hrc, intendedAction: hrc, liveActionName: null, nowMs: NOW, lastGeneralRecheckMs: NOW - GENERAL_ACTION_RECHECK_MS });
    expect(past.start).toBe(true);
    expect(past.reason).toBe('restart-idle');
  });

  it('the debounce never blocks a CHANGE of general action -- only a re-trigger of the same one', () => {
    const d = shouldStartAction({ chosenAction: { type: 'General', name: 'Training' }, intendedAction: hrc, liveActionName: null, nowMs: NOW, lastGeneralRecheckMs: NOW });
    expect(d.start).toBe(true);
    expect(d.reason).toBe('switch-idle');
  });

  it('LIVENESS PROPERTY: from any (running, wanted) pair, the engine either runs what it wants or acts to change that', () => {
    // The property the old rule violated. No state may leave the engine running action X
    // while wanting Y and doing nothing about it.
    const names = ['Tracking', 'Hyperbolic Regeneration Chamber', 'Training', null];
    for (const live of names) {
      for (const want of [tracking, hrc, { type: 'General', name: 'Training' }]) {
        const d = shouldStartAction({ chosenAction: want, intendedAction: { type: 'General', name: 'Hyperbolic Regeneration Chamber' }, liveActionName: live, nowMs: NOW, lastGeneralRecheckMs: 0 });
        const runningWhatWeWant = live === want.name;
        if (!runningWhatWeWant) expect(d.start).toBe(true); // must be acting, never parked
        else expect(d.start).toBe(false); // must not restart and reset progress
      }
    }
  });
});
