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

  it('HP guard: below the floor, HP-risking candidates are dropped even if they have the best EV', () => {
    const picked = pickRankAction([risky, safe], { hpFraction: HP_FLOOR_FRACTION - 0.01 });
    expect(picked.name).toBe('Investigation');
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
  it('buys the highest-priority affordable skill (Overclock first)', () => {
    const levels = {};
    const costs = { Overclock: 5, 'Blade\'s Intuition': 1 };
    const buy = planSkillBuy(levels, 10, costs);
    expect(buy).toEqual({ skill: 'Overclock', toLevel: 1, cost: 5 });
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
