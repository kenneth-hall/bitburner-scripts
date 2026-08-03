// Pure-function tests for Phase 38 Slice B's bladeburnermanager.js (spec:
// "Tests" section). main() is thin plumbing around these, same split as
// daemon.js/gangmanager.js -- every function under test is ns-free.
import { describe, it, expect } from 'vitest';
import {
  expectedRankPerSec,
  pickRankAction,
  planSkillBuy,
  SKILL_BUY_ORDER,
  SKILL_LEVEL_CAP,
  shouldRotateCity,
  classifyWindow,
  higherPriorityClaimant,
  HIGHER_PRIORITY_CLAIMANTS,
  classifyBackdoorActivity,
  BACKDOOR_ACTIVITY_FRESH_MS,
  computeRealizedRates,
  computeDutyCycle,
  computeRepForegone,
  projectRankEta,
  estimateRepRatePerSec,
  appendBbLog,
  seedBbLog,
  buildBbState,
  BB_LOG_MAX_ENTRIES,
  HP_FLOOR_FRACTION,
  AUG_STATE_FRESH_MS,
  BLACKOPS_DAEDALUS_RANK,
  pickOverheadAction,
  isInventoryLow,
  LOW_INVENTORY_COUNT_THRESHOLD,
  CHAOS_DIPLOMACY_THRESHOLD,
  TEAM_SIZE_TARGET,
  pruneSamples,
  emptyTotals,
  accumulateTotals,
  seedTotals,
  ratesFromTotals,
  dutyFromTotals,
  RATE_WINDOWS_MS,
  MAX_FINITE_WINDOW_MS,
  SAMPLE_HARD_CAP,
  CHECKPOINT_A_UPTIME_MS,
  CHECKPOINT_A_BAR,
  updateStaminaRecovering,
  STAMINA_FLOOR_FRACTION,
  STAMINA_RESUME_FRACTION,
  updateHpRecovering,
  HP_RESUME_FRACTION,
  OVERCLOCK_HOLD_LEVEL,
} from '../src/bladeburnermanager.js';

// --- expectedRankPerSec ----------------------------------------------------

describe('expectedRankPerSec', () => {
  it('positive EV: high success chance, small loss', () => {
    // (0.9*10 - 0.1*2) / 10s = (9 - 0.2)/10 = 0.88
    expect(expectedRankPerSec({ pMin: 0.9, rankGain: 10, rankLoss: 2, timeMs: 10_000 })).toBeCloseTo(0.88, 6);
  });

  it('negative EV: low success chance, large loss', () => {
    // (0.03*50 - 0.97*10) / 20s = (1.5 - 9.7)/20 = -0.41
    expect(expectedRankPerSec({ pMin: 0.03, rankGain: 50, rankLoss: 10, timeMs: 20_000 })).toBeCloseTo(-0.41, 6);
  });

  it('zero/negative time returns 0, not Infinity/NaN', () => {
    expect(expectedRankPerSec({ pMin: 0.5, rankGain: 10, rankLoss: 1, timeMs: 0 })).toBe(0);
  });
});

// --- pickRankAction (decision 7) -------------------------------------------

describe('pickRankAction', () => {
  const safe = { type: 'Operations', name: 'Investigation', pMin: 0.3, rankGain: 5, rankLoss: 0, timeMs: 10_000, risksHp: false };
  const risky = { type: 'Operations', name: 'Raid', pMin: 0.1, rankGain: 55, rankLoss: 2.5, timeMs: 66_000, risksHp: true };

  it('picks the higher-EV candidate when HP is healthy', () => {
    const highEv = { type: 'Contracts', name: 'Tracking', pMin: 0.9, rankGain: 10, rankLoss: 1, timeMs: 12_000, risksHp: true };
    const lowEv = { type: 'Contracts', name: 'Bounty Hunter', pMin: 0.5, rankGain: 2, rankLoss: 5, timeMs: 20_000, risksHp: true };
    const picked = pickRankAction([highEv, lowEv], { hpFraction: 1 });
    expect(picked.name).toBe('Tracking');
  });

  it('prefers lower failure cost at equal raw EV (the discount term breaks the tie)', () => {
    // Two candidates engineered to identical expectedRankPerSec but different
    // pMin/timeMs, so the hospitalization discount is the only thing that
    // can separate them.
    const cheapFailure = { type: 'Contracts', name: 'A', pMin: 0.9, rankGain: 10, rankLoss: 1, timeMs: 10_000, risksHp: true };
    // Same EV as A: (0.9*10 - 0.1*1)/10 = 0.89. Give B a much lower pMin at a
    // much shorter time so its (1-pMin)/actionSeconds discount term is huge.
    const bRankGain = (0.89 * 1 + (1 - 0.1) * 1) / 0.1; // solve so EV matches at pMin=0.1, timeMs=1000
    const expensiveFailure = { type: 'Contracts', name: 'B', pMin: 0.1, rankGain: bRankGain, rankLoss: 1, timeMs: 1_000, risksHp: true };
    expect(expectedRankPerSec(cheapFailure)).toBeCloseTo(expectedRankPerSec(expensiveFailure), 6);
    const picked = pickRankAction([cheapFailure, expensiveFailure], { hpFraction: 1 });
    expect(picked.name).toBe('A');
  });

  // 🔴 Rewritten 2026-08-02. This test used to assert `picked.name === 'Investigation'`,
  // i.e. it locked in the bug: below the HP floor the pool filtered down to the only
  // non-HP-risking action, which is Investigation -- and Investigation cannot restore HP,
  // so the engine could never climb back above the floor. Live cost: hours of grinding an
  // action worth 0.0077 rank/s over one worth 0.0307. The guard must RECOVER, not re-pick.
  it('HP guard: below the floor, returns null so the caller can route to recovery', () => {
    const picked = pickRankAction([risky, safe], { hpFraction: HP_FLOOR_FRACTION - 0.01, hpCurrent: 13 });
    expect(picked).toBeNull();
  });

  it('HP guard: returns null below the floor even when only safe candidates exist', () => {
    // The trap case specifically: Investigation alone must NOT keep the engine pinned
    // below the floor forever.
    const picked = pickRankAction([safe], { hpFraction: 0.1, hpCurrent: 3 });
    expect(picked).toBeNull();
  });

  it('hospitalization cost is amortised over the failures left before hospitalization', () => {
    // The live 2026-08-02 numbers that exposed the defect. Tracking's true EV is ~4x
    // Investigation's, but charging the full hospitalization estimate against every
    // single failure scored Tracking negative and handed the pick to Investigation.
    const tracking = { type: 'Contracts', name: 'Tracking', pMin: 0.356, rankGain: 0.726, rankLoss: 0, timeMs: 13_000, risksHp: true };
    const investigation = { type: 'Operations', name: 'Investigation', pMin: 0.0966, rankGain: 3.533, rankLoss: 0.321, timeMs: 33_000, risksHp: false };

    // Old behaviour, reproduced by withholding absolute HP: 9x overcharge -> wrong pick.
    expect(pickRankAction([tracking, investigation], { hpFraction: 1 }).name).toBe('Investigation');

    // Fixed: at full HP (27) a failure costs 3, so nine failures fit before hospitalization.
    expect(pickRankAction([tracking, investigation], { hpFraction: 1, hpCurrent: 27 }).name).toBe('Tracking');
  });

  it('the failure discount grows as HP falls, so risk aversion rises approaching the floor', () => {
    const risky2 = { type: 'Contracts', name: 'Tracking', pMin: 0.356, rankGain: 0.726, rankLoss: 0, timeMs: 13_000, risksHp: true };
    const safe2 = { type: 'Operations', name: 'Investigation', pMin: 0.0966, rankGain: 3.533, rankLoss: 0.321, timeMs: 33_000, risksHp: false };
    // Healthy: the contract's raw EV dominates its amortised failure cost.
    expect(pickRankAction([risky2, safe2], { hpFraction: 1, hpCurrent: 27 }).name).toBe('Tracking');
    // One failure from hospitalization (but still above the floor): the discount bites.
    expect(pickRankAction([risky2, safe2], { hpFraction: 0.6, hpCurrent: 3 }).name).toBe('Investigation');
  });

  it('HP guard: at/above the floor, HP-risking candidates are eligible again', () => {
    const bigEv = { ...risky, pMin: 0.95, rankGain: 100, rankLoss: 1 };
    const picked = pickRankAction([bigEv, safe], { hpFraction: HP_FLOOR_FRACTION });
    expect(picked.name).toBe('Raid');
  });

  it('returns null when HP is low and every candidate risks HP -- caller falls back to recovery', () => {
    expect(pickRankAction([risky], { hpFraction: 0.1 })).toBeNull();
  });

  it('returns null on an empty candidate list', () => {
    expect(pickRankAction([], { hpFraction: 1 })).toBeNull();
  });
});

// --- planSkillBuy ------------------------------------------------------------

describe('planSkillBuy', () => {
  // 🔴 Rewritten 2026-08-02 (Phase 39 D5). This asserted "Overclock first", which was the
  // old policy. Overclock costs 16,908 rank for an 8.3x ACTION-TIME multiplier that is
  // worth nothing if stamina rather than time is the binding constraint (Q10, unmeasured),
  // so it is now HELD at OVERCLOCK_HOLD_LEVEL while the success skills -- which gate the
  // Stage A -> B tier switch -- go first.
  it('buys the highest-priority affordable skill (success skills first)', () => {
    const levels = {};
    const costs = { Overclock: 5, 'Blade\'s Intuition': 1 };
    const buy = planSkillBuy(levels, 10, costs);
    expect(buy).toEqual({ skill: 'Blade\'s Intuition', toLevel: 1, cost: 1 });
  });

  it('holds Overclock at its cap so a large SP balance cannot drain into it', () => {
    // The whole point of the hold: with every success skill capped out and plenty of SP
    // banked, Overclock must still not be bought until Q10 is answered.
    const levels = { 'Blade\'s Intuition': 25, 'Digital Observer': 25, Tracer: 25, Overclock: OVERCLOCK_HOLD_LEVEL, Reaper: 6, 'Evasive System': 6 };
    const costs = { Overclock: 27, 'Blade\'s Intuition': 100, 'Digital Observer': 100, Tracer: 100, Reaper: 10, 'Evasive System': 10 };
    expect(planSkillBuy(levels, 100_000, costs)).toBeNull();
  });

  it('prefers Blade\'s Intuition / Digital Observer / Tracer over Reaper and Evasive System', () => {
    // The live failure this encodes: because planSkillBuy takes the first AFFORDABLE
    // entry and Overclock's next level cost 27 SP, small balances kept falling through to
    // whatever was cheapest -- Reaper drifted 4 -> 6 while Digital Observer sat at 6.
    const levels = { 'Blade\'s Intuition': 6, 'Digital Observer': 6, Tracer: 6, Reaper: 4, 'Evasive System': 4 };
    const costs = { 'Blade\'s Intuition': 16, 'Digital Observer': 13, Tracer: 13, Reaper: 10, 'Evasive System': 10, Overclock: 27 };
    expect(planSkillBuy(levels, 16, costs).skill).toBe('Blade\'s Intuition');
  });

  it('skips an unaffordable higher-priority skill and buys the next affordable one', () => {
    const levels = {};
    const costs = { Overclock: 1000, 'Blade\'s Intuition': 5 };
    const buy = planSkillBuy(levels, 10, costs);
    expect(buy.skill).toBe('Blade\'s Intuition');
  });

  it('respects a level cap -- Overclock stops being considered at its documented max (90)', () => {
    const levels = { Overclock: 90 };
    const costs = { Overclock: 1, 'Blade\'s Intuition': 4 };
    const buy = planSkillBuy(levels, 10, costs);
    expect(buy.skill).toBe('Blade\'s Intuition');
  });

  it('never buys the four excluded skills, even if they are the only affordable ones', () => {
    const levels = {};
    const costs = { 'Hands of Midas': 1, Hyperdrive: 1, 'Cyber\'s Edge': 1, Datamancer: 1 };
    expect(planSkillBuy(levels, 100, costs)).toBeNull();
  });

  it('never buys Cloak or Short-Circuit either -- they are simply absent from the order', () => {
    const levels = {};
    const costs = { Cloak: 1, 'Short-Circuit': 1 };
    expect(planSkillBuy(levels, 100, costs)).toBeNull();
  });

  it('returns null when nothing in the order is affordable or uncapped', () => {
    const levels = { Overclock: 90 };
    const costs = {};
    expect(planSkillBuy(levels, 0, costs)).toBeNull();
  });

  it('a missing/non-finite cost entry is treated as unaffordable, not a crash', () => {
    const levels = {};
    const costs = { Overclock: Infinity, 'Blade\'s Intuition': 5 };
    const buy = planSkillBuy(levels, 10, costs);
    expect(buy.skill).toBe('Blade\'s Intuition');
  });
});

// --- isInventoryLow -----------------------------------------------------------

describe('isInventoryLow', () => {
  it('true when every tracked count is at/under the threshold', () => {
    expect(isInventoryLow([5, 10, 0], 20)).toBe(true);
  });

  it('false when at least one count is comfortably above the threshold', () => {
    expect(isInventoryLow([5, 500, 0], 20)).toBe(false);
  });

  it('true on an empty pool -- nothing left at all', () => {
    expect(isInventoryLow([], 20)).toBe(true);
  });

  it('exactly at the threshold counts as low', () => {
    expect(isInventoryLow([20], 20)).toBe(true);
  });

  it('uses LOW_INVENTORY_COUNT_THRESHOLD as the default', () => {
    expect(isInventoryLow([LOW_INVENTORY_COUNT_THRESHOLD])).toBe(true);
    expect(isInventoryLow([LOW_INVENTORY_COUNT_THRESHOLD + 1])).toBe(false);
  });
});

// --- pickOverheadAction (decision 6, Incite Violence added 2026-08-01) ------

describe('pickOverheadAction', () => {
  it('HP guard takes priority over everything else, including low inventory', () => {
    expect(pickOverheadAction(HP_FLOOR_FRACTION - 0.01, 5, 0, true)).toEqual({ type: 'General', name: 'Hyperbolic Regeneration Chamber' });
  });

  it('low inventory beats chaos and team size once HP is fine', () => {
    expect(pickOverheadAction(1, CHAOS_DIPLOMACY_THRESHOLD + 1, 0, true)).toEqual({ type: 'General', name: 'Incite Violence' });
  });

  it('high chaos triggers Diplomacy once HP and inventory are fine', () => {
    expect(pickOverheadAction(1, CHAOS_DIPLOMACY_THRESHOLD + 0.1, 0, false)).toEqual({ type: 'General', name: 'Diplomacy' });
  });

  it('low team size triggers Recruitment once HP, inventory and chaos are fine', () => {
    expect(pickOverheadAction(1, 0, TEAM_SIZE_TARGET - 1, false)).toEqual({ type: 'General', name: 'Recruitment' });
  });

  it('defaults to HRC once every other condition is satisfied', () => {
    expect(pickOverheadAction(1, 0, TEAM_SIZE_TARGET, false)).toEqual({ type: 'General', name: 'Hyperbolic Regeneration Chamber' });
  });

  it('stamina recovery parks on HRC, outranking inventory/chaos/team', () => {
    expect(pickOverheadAction(1, CHAOS_DIPLOMACY_THRESHOLD + 1, 0, true, true)).toEqual({ type: 'General', name: 'Hyperbolic Regeneration Chamber' });
  });

  it('the HP guard still outranks stamina recovery (both land on HRC anyway)', () => {
    expect(pickOverheadAction(0, 0, TEAM_SIZE_TARGET, false, true)).toEqual({ type: 'General', name: 'Hyperbolic Regeneration Chamber' });
  });

  it('omitting staminaRecovering is behaviour-identical to the pre-2026-08-02 ladder', () => {
    expect(pickOverheadAction(1, CHAOS_DIPLOMACY_THRESHOLD + 1, 0, true)).toEqual(pickOverheadAction(1, CHAOS_DIPLOMACY_THRESHOLD + 1, 0, true, false));
  });
});

// --- updateStaminaRecovering (2026-08-02 stamina guard) -----------------------
//
// Live measurement behind these: `Stamina Penalty: 89.5%` at 5.2% stamina, the
// in-game log reporting actions cancelled at stamina 0, and a NEGATIVE cumulative
// rank rate (-1.90 rank over 198 held sec) while nothing reacted to any of it.

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

  it('the band is non-empty -- a single threshold would resume at the level that just failed', () => {
    expect(STAMINA_RESUME_FRACTION).toBeGreaterThan(STAMINA_FLOOR_FRACTION);
  });

  it('a full drain-and-refill cycle trips once and releases once', () => {
    let recovering = false;
    const seen = [];
    for (const fraction of [1.0, 0.7, 0.55, 0.49, 0.2, 0.05, 0.3, 0.6, 0.79, 0.8, 0.95]) {
      recovering = updateStaminaRecovering(recovering, fraction);
      seen.push(recovering);
    }
    expect(seen).toEqual([false, false, false, true, true, true, true, true, true, false, false]);
  });

  it('at the measured 5.2% live reading, it recovers', () => {
    expect(updateStaminaRecovering(false, 4.371 / 83.555)).toBe(true);
  });
});

// --- shouldRotateCity --------------------------------------------------------

describe('shouldRotateCity', () => {
  it('does not rotate below the threshold', () => {
    expect(shouldRotateCity({ Aevum: 0.5, Chongqing: 0.1 }, 'Aevum', 1.0)).toEqual({ rotate: false, city: null });
  });

  it('rotates to the lowest-chaos other city once over the threshold', () => {
    expect(shouldRotateCity({ Aevum: 2.0, Chongqing: 0.1, Sector12: 0.4 }, 'Aevum', 1.0)).toEqual({ rotate: true, city: 'Chongqing' });
  });

  it('never rotates to itself', () => {
    const result = shouldRotateCity({ Aevum: 5.0 }, 'Aevum', 1.0);
    expect(result.rotate).toBe(false);
  });
});

// --- classifyWindow (decision 6) --------------------------------------------

describe('classifyWindow', () => {
  const T = 1_000_000_000;

  it('free phases: spend-down, installing, paused, idle-plateau', () => {
    for (const phase of ['spend-down', 'installing', 'paused', 'idle-plateau']) {
      expect(classifyWindow({ phase, timestamp: T }, T)).toBe('free');
    }
  });

  it('contested phases: grinding, yielded, gate-fill, install-ready, awaiting-invite, awaiting-money', () => {
    for (const phase of ['grinding', 'yielded', 'gate-fill', 'install-ready', 'awaiting-invite', 'awaiting-money']) {
      expect(classifyWindow({ phase, timestamp: T }, T)).toBe('contested');
    }
  });

  it('an unrecognised phase string defaults to contested', () => {
    expect(classifyWindow({ phase: 'some-future-phase', timestamp: T }, T)).toBe('contested');
  });

  it('awaiting-money with workTarget.deficit === 0 is still contested (review S5)', () => {
    expect(classifyWindow({ phase: 'awaiting-money', timestamp: T, workTarget: { deficit: 0 } }, T)).toBe('contested');
  });

  it('missing state (null) defaults to contested', () => {
    expect(classifyWindow(null, T)).toBe('contested');
  });

  it('a state object without a numeric timestamp defaults to contested', () => {
    expect(classifyWindow({ phase: 'idle-plateau' }, T)).toBe('contested');
  });

  it('stale state (older than AUG_STATE_FRESH_MS) defaults to contested even in a free phase', () => {
    expect(classifyWindow({ phase: 'idle-plateau', timestamp: T - AUG_STATE_FRESH_MS - 1 }, T)).toBe('contested');
  });

  it('exactly at the freshness bound is still fresh (not stale)', () => {
    expect(classifyWindow({ phase: 'idle-plateau', timestamp: T - AUG_STATE_FRESH_MS }, T)).toBe('free');
  });
});

// --- higherPriorityClaimant (decision 3) ------------------------------------

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

// --- classifyBackdoorActivity (decision 3 amendment, 2026-08-01) ------------

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

  it('busy: stale idle claim (older than BACKDOOR_ACTIVITY_FRESH_MS)', () => {
    expect(classifyBackdoorActivity({ active: false, timestamp: T - BACKDOOR_ACTIVITY_FRESH_MS - 1 }, T)).toBe('busy');
  });

  it('idle: exactly at the freshness bound is still fresh', () => {
    expect(classifyBackdoorActivity({ active: false, timestamp: T - BACKDOOR_ACTIVITY_FRESH_MS }, T)).toBe('idle');
  });

  it('busy: a stale active:true marker stays busy (fails toward safe, not toward stale-so-ignore)', () => {
    expect(classifyBackdoorActivity({ active: true, timestamp: T - BACKDOOR_ACTIVITY_FRESH_MS - 1 }, T)).toBe('busy');
  });
});

// --- computeRealizedRates / computeDutyCycle / computeRepForegone (decision 8, blocker B7) --

describe('computeRealizedRates', () => {
  const windows = { short: 10_000, cumulative: Infinity };

  it('sums heldSec/uptimeSec/rankDelta within each window and derives both rates', () => {
    const samples = [
      { timestamp: 1000, heldSec: 5, uptimeSec: 5, rankDelta: 1 },
      { timestamp: 2000, heldSec: 5, uptimeSec: 5, rankDelta: 1 },
    ];
    const out = computeRealizedRates(samples, windows, 2000);
    expect(out.cumulative).toEqual({ rankGained: 2, heldSec: 10, engineUptimeSec: 10, rankPerHeldSec: 0.2, rankPerWallSec: 0.2 });
  });

  it('a window with zero held/uptime seconds reports rate 0, not NaN/Infinity', () => {
    const out = computeRealizedRates([], windows, 2000);
    expect(out.cumulative).toEqual({ rankGained: 0, heldSec: 0, engineUptimeSec: 0, rankPerHeldSec: 0, rankPerWallSec: 0 });
  });

  it('excludes samples outside the window', () => {
    const samples = [
      { timestamp: 0, heldSec: 100, uptimeSec: 100, rankDelta: 100 }, // strictly before cutoff (10001-10000=1) -- outside the 10s "short" window
      { timestamp: 9999, heldSec: 1, uptimeSec: 1, rankDelta: 1 },
    ];
    const out = computeRealizedRates(samples, windows, 10_001);
    expect(out.short.rankGained).toBe(1);
  });
});

describe('computeDutyCycle', () => {
  const windows = { cumulative: Infinity };

  it('splits uptime into rank/overhead/unheld and derives dutyCycle', () => {
    const samples = [
      { timestamp: 1000, uptimeSec: 6, kind: 'contested' },
      { timestamp: 2000, uptimeSec: 3, kind: 'free' },
      { timestamp: 3000, uptimeSec: 1, kind: 'unheld' },
    ];
    const out = computeDutyCycle(samples, windows, 3000);
    expect(out.cumulative).toEqual({ rankSec: 6, overheadSec: 3, unheldSec: 1, dutyCycle: 0.9 });
  });

  it('zero-uptime edge case reports dutyCycle 0, not NaN', () => {
    const out = computeDutyCycle([], windows, 1000);
    expect(out.cumulative).toEqual({ rankSec: 0, overheadSec: 0, unheldSec: 0, dutyCycle: 0 });
  });
});

// --- pruneSamples / totals accumulator (2026-08-02 truncation bug) -----------
//
// The bug these cover: the sample buffer was trimmed to a fixed 10,000 entries
// while every window is expressed in wall time. At ~1 tick/sec that capped the
// buffer at ~2h47m, so "24h" and "cumulative" both silently meant "the last
// 2h47m" -- and because checkpoint uptime was summed from that same buffer, the
// 24h and 1-week checkpoints could never fire at all.

describe('pruneSamples', () => {
  it('drops samples older than the window and keeps the rest', () => {
    const samples = [
      { timestamp: 0 },
      { timestamp: 5_000 },
      { timestamp: 10_000 },
    ];
    expect(pruneSamples(samples, 10_000, 6_000)).toEqual([{ timestamp: 5_000 }, { timestamp: 10_000 }]);
  });

  it('keeps a sample exactly at the cutoff (matches computeRealizedRates >= cutoff)', () => {
    expect(pruneSamples([{ timestamp: 4_000 }], 10_000, 6_000)).toEqual([{ timestamp: 4_000 }]);
  });

  it('returns the SAME array when nothing is old enough to drop (allocation-free common tick)', () => {
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

  it('REGRESSION: a full 24h at 1 tick/sec survives pruning, so the widest window is not truncated', () => {
    // The old fixed cap was 10_000 -- an eighth of this.
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

describe('emptyTotals / accumulateTotals', () => {
  it('starts at zero on every field', () => {
    expect(emptyTotals()).toEqual({ heldSec: 0, uptimeSec: 0, rankGained: 0, rankSec: 0, overheadSec: 0, unheldSec: 0, restarts: 0 });
  });

  it('a contested (rank-earning) tick credits heldSec, uptimeSec, rankGained and rankSec', () => {
    const out = accumulateTotals(emptyTotals(), { heldSec: 5, uptimeSec: 5, rankDelta: 2, kind: 'contested' });
    expect(out).toEqual({ heldSec: 5, uptimeSec: 5, rankGained: 2, rankSec: 5, overheadSec: 0, unheldSec: 0, restarts: 0 });
  });

  it('a free (zero-rank overhead) tick is still held time but is NOT rankSec', () => {
    const out = accumulateTotals(emptyTotals(), { heldSec: 4, uptimeSec: 4, rankDelta: 0, kind: 'free' });
    expect(out.heldSec).toBe(4);
    expect(out.rankSec).toBe(0);
    expect(out.overheadSec).toBe(4);
  });

  it('an unheld tick advances uptime only -- not heldSec (the rate denominator)', () => {
    const out = accumulateTotals(emptyTotals(), { heldSec: 0, uptimeSec: 7, rankDelta: 0, kind: 'unheld' });
    expect(out).toEqual({ heldSec: 0, uptimeSec: 7, rankGained: 0, rankSec: 0, overheadSec: 0, unheldSec: 7, restarts: 0 });
  });

  it('does not mutate its input', () => {
    const before = emptyTotals();
    accumulateTotals(before, { heldSec: 5, uptimeSec: 5, rankDelta: 2, kind: 'contested' });
    expect(before).toEqual(emptyTotals());
  });

  it('missing fields are treated as zero, not NaN', () => {
    const out = accumulateTotals(emptyTotals(), { timestamp: 1, kind: 'contested' });
    expect(out).toEqual(emptyTotals());
  });

  it('a negative rankDelta (a failed action losing rank) reduces rankGained', () => {
    const out = accumulateTotals(emptyTotals(), { heldSec: 3, uptimeSec: 3, rankDelta: -1.5, kind: 'contested' });
    expect(out.rankGained).toBe(-1.5);
  });

  it('REGRESSION: totals reach the 24h checkpoint threshold where the capped buffer could not', () => {
    let totals = emptyTotals();
    for (let i = 0; i < 86_400; i++) totals = accumulateTotals(totals, { heldSec: 1, uptimeSec: 1, rankDelta: 0.05, kind: 'contested' });
    expect(totals.uptimeSec * 1000).toBeGreaterThanOrEqual(CHECKPOINT_A_UPTIME_MS);
    expect(ratesFromTotals(totals).rankPerHeldSec).toBeCloseTo(0.05, 10);
    expect(ratesFromTotals(totals).rankPerHeldSec >= CHECKPOINT_A_BAR).toBe(true);
  });
});

describe('seedTotals', () => {
  it('null/missing state starts fresh with no restart counted', () => {
    expect(seedTotals(null)).toEqual(emptyTotals());
    expect(seedTotals({})).toEqual(emptyTotals());
  });

  it('restores every field and counts the restart', () => {
    const prior = { heldSec: 100, uptimeSec: 120, rankGained: 5, rankSec: 90, overheadSec: 10, unheldSec: 20, restarts: 2 };
    expect(seedTotals({ totals: prior })).toEqual({ ...prior, restarts: 3 });
  });

  it('a partial totals object fills the missing fields with zero rather than NaN', () => {
    expect(seedTotals({ totals: { heldSec: 50 } })).toEqual({ ...emptyTotals(), heldSec: 50, restarts: 1 });
  });

  it('rejects non-finite and negative values instead of poisoning the measurement', () => {
    const out = seedTotals({ totals: { heldSec: NaN, uptimeSec: -5, rankGained: 'nope', rankSec: Infinity } });
    expect(out).toEqual({ ...emptyTotals(), restarts: 1 });
  });

  it('a non-object totals field degrades to fresh', () => {
    expect(seedTotals({ totals: 'corrupt' })).toEqual(emptyTotals());
  });

  it('carrying totals across a restart preserves the accumulated rate', () => {
    let totals = emptyTotals();
    for (let i = 0; i < 10; i++) totals = accumulateTotals(totals, { heldSec: 1, uptimeSec: 1, rankDelta: 0.1, kind: 'contested' });
    const resumed = seedTotals({ totals });
    expect(ratesFromTotals(resumed).rankPerHeldSec).toBeCloseTo(0.1, 10);
    expect(resumed.restarts).toBe(1);
  });
});

describe('ratesFromTotals / dutyFromTotals', () => {
  it('derives both rates from the totals', () => {
    const totals = { heldSec: 100, uptimeSec: 200, rankGained: 10, rankSec: 80, overheadSec: 20, unheldSec: 100, restarts: 0 };
    expect(ratesFromTotals(totals)).toEqual({ rankGained: 10, heldSec: 100, engineUptimeSec: 200, rankPerHeldSec: 0.1, rankPerWallSec: 0.05 });
  });

  it('splits duty and derives dutyCycle as the held fraction of uptime', () => {
    const totals = { heldSec: 100, uptimeSec: 200, rankGained: 10, rankSec: 80, overheadSec: 20, unheldSec: 100, restarts: 0 };
    expect(dutyFromTotals(totals)).toEqual({ rankSec: 80, overheadSec: 20, unheldSec: 100, dutyCycle: 0.5 });
  });

  it('zero totals report 0, never NaN/Infinity', () => {
    expect(ratesFromTotals(emptyTotals())).toEqual({ rankGained: 0, heldSec: 0, engineUptimeSec: 0, rankPerHeldSec: 0, rankPerWallSec: 0 });
    expect(dutyFromTotals(emptyTotals())).toEqual({ rankSec: 0, overheadSec: 0, unheldSec: 0, dutyCycle: 0 });
  });

  it('an all-overhead run reports full duty but zero rankSec -- the stall made visible', () => {
    let totals = emptyTotals();
    for (let i = 0; i < 100; i++) totals = accumulateTotals(totals, { heldSec: 1, uptimeSec: 1, rankDelta: 0, kind: 'free' });
    expect(dutyFromTotals(totals)).toEqual({ rankSec: 0, overheadSec: 100, unheldSec: 0, dutyCycle: 1 });
    expect(ratesFromTotals(totals).rankPerHeldSec).toBe(0);
  });
});

describe('computeRepForegone', () => {
  it('multiplies held seconds by the observed rate', () => {
    expect(computeRepForegone(100, 2.5)).toBe(250);
  });

  it('zero-held reports 0', () => {
    expect(computeRepForegone(0, 2.5)).toBe(0);
  });
});

// --- projectRankEta ----------------------------------------------------------

describe('projectRankEta', () => {
  it('computes seconds to target at a positive rate', () => {
    expect(projectRankEta(0, BLACKOPS_DAEDALUS_RANK, 1)).toBe(BLACKOPS_DAEDALUS_RANK);
  });

  it('returns 0 once at/past target', () => {
    expect(projectRankEta(BLACKOPS_DAEDALUS_RANK, BLACKOPS_DAEDALUS_RANK, 1)).toBe(0);
    expect(projectRankEta(BLACKOPS_DAEDALUS_RANK + 1, BLACKOPS_DAEDALUS_RANK, 1)).toBe(0);
  });

  it('returns null for a zero rate -- unreachable, not an error', () => {
    expect(projectRankEta(0, 100, 0)).toBeNull();
  });

  it('returns null for a negative rate', () => {
    expect(projectRankEta(0, 100, -0.5)).toBeNull();
  });
});

// --- estimateRepRatePerSec ---------------------------------------------------

describe('estimateRepRatePerSec', () => {
  const target = { aug: 'X', faction: 'F1' };

  it('computes a rate when the deficit closed on the same target', () => {
    const prev = { workTarget: { ...target, deficit: 1000 } };
    const curr = { workTarget: { ...target, deficit: 900 } };
    expect(estimateRepRatePerSec(prev, curr, 10)).toBeCloseTo(10, 6);
  });

  it('returns null when the target changed between reads', () => {
    const prev = { workTarget: { aug: 'X', faction: 'F1', deficit: 1000 } };
    const curr = { workTarget: { aug: 'Y', faction: 'F1', deficit: 900 } };
    expect(estimateRepRatePerSec(prev, curr, 10)).toBeNull();
  });

  it('returns null when the deficit did not decrease (no measurable progress)', () => {
    const prev = { workTarget: { ...target, deficit: 900 } };
    const curr = { workTarget: { ...target, deficit: 1000 } };
    expect(estimateRepRatePerSec(prev, curr, 10)).toBeNull();
  });

  it('returns null with missing workTarget on either side', () => {
    expect(estimateRepRatePerSec(null, { workTarget: { ...target, deficit: 1 } }, 10)).toBeNull();
    expect(estimateRepRatePerSec({ workTarget: { ...target, deficit: 1 } }, null, 10)).toBeNull();
  });

  it('returns null for zero/negative dt', () => {
    const prev = { workTarget: { ...target, deficit: 1000 } };
    const curr = { workTarget: { ...target, deficit: 900 } };
    expect(estimateRepRatePerSec(prev, curr, 0)).toBeNull();
  });
});

// --- appendBbLog / seedBbLog (gangmanager.js precedent) ---------------------

describe('appendBbLog', () => {
  it('appends and ring-trims at BB_LOG_MAX_ENTRIES', () => {
    const entries = Array.from({ length: BB_LOG_MAX_ENTRIES }, (_, i) => ({ i }));
    const next = appendBbLog(entries, { i: 'new' });
    expect(next.length).toBe(BB_LOG_MAX_ENTRIES);
    expect(next[next.length - 1]).toEqual({ i: 'new' });
    expect(next[0]).toEqual({ i: 1 });
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

  it('ring-trims an oversized persisted log', () => {
    const oversized = Array.from({ length: BB_LOG_MAX_ENTRIES + 10 }, (_, i) => ({ i }));
    const seeded = seedBbLog(JSON.stringify(oversized));
    expect(seeded.length).toBe(BB_LOG_MAX_ENTRIES);
    expect(seeded[0]).toEqual({ i: 10 });
  });
});

// --- buildBbState -------------------------------------------------------------

describe('buildBbState', () => {
  it('assembles the state record with blackOpsDaedalusRank carried in', () => {
    const state = buildBbState({
      now: 1000,
      off: false,
      holdActive: true,
      holdReason: 'held',
      standDownFor: null,
      rank: 42,
      skillPoints: 3,
      skillLevels: {},
      cityName: 'Aevum',
      chaosByCity: { Aevum: 0.5 },
      teamSize: 0,
      hpFraction: 1,
      rates: {},
      duty: {},
      repForegone: 0,
      hospitalizations: null,
      checkpointA: null,
      checkpointB: null,
    });
    expect(state.rank).toBe(42);
    expect(state.blackOpsDaedalusRank).toBe(BLACKOPS_DAEDALUS_RANK);
    expect(state.time).toBeTypeOf('string');
  });
});

// 🔴 2026-08-02: the single-threshold HP guard was observed FLAPPING live within
// minutes of shipping it -- HP 15 -> fail -> 12 (below floor) -> rest 1 min -> 14
// (above floor) -> one contract -> fail -> 11 -> rest. HRC restores 2 HP/min while a
// failed contract costs 3, so recovering only to the floor guarantees the next
// failure re-trips it. Same latch shape as the stamina guard.
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
    const c = { type: 'Contracts', name: 'Tracking', pMin: 0.5, rankGain: 1, rankLoss: 0, timeMs: 13_000, risksHp: true };
    // Above the floor, but still recovering -> must keep resting, not resume.
    expect(pickRankAction([c], { hpFraction: HP_FLOOR_FRACTION + 0.05, hpCurrent: 15, hpRecovering: true })).toBeNull();
    // Latch released -> eligible again.
    expect(pickRankAction([c], { hpFraction: HP_FLOOR_FRACTION + 0.05, hpCurrent: 15, hpRecovering: false }).name).toBe('Tracking');
  });
});
