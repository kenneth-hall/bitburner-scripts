// Pure-function tests for Phase 27 Tier 1's gang manager (spec: S10). Every
// function under test is ns-free by design -- the main() loop is thin
// plumbing around these, same split as daemon.js/scheduler.js.
//
// LADDER FIXTURE (2026-07-20): the live TASK_LADDER is pinned to a single rung
// (rep pivot -- see gangmanager.js's header). The multi-rung promote/demote
// machinery is still present and must stay covered, so the tests that exercise
// climbing inject FIXTURE_LADDER instead of reading the live constant. Tests
// that assert live *policy* (e.g. verify-gang's VALID_TASKS) keep using
// TASK_LADDER, since there the point is what the gang actually does.
import { describe, it, expect } from 'vitest';
import {
  TASK_LADDER,
  SINK_TASK,
  RETRY_STAT_GROWTH,
  freshProbeState,
  weightedStat,
  nextRecruitName,
  rebuildRungs,
  initBaseline,
  evalSink,
  evalPromotion,
  planAssignments,
  appendGangLog,
  buildGangState,
  GANG_LOG_MAX_ENTRIES,
} from '../src/gangmanager.js';

// The historical five-rung money ladder, kept here as a test fixture so the
// climbing machinery stays exercised while the live ladder is pinned to one rung.
const FIXTURE_LADDER = ['Ransomware', 'Phishing', 'Identity Theft', 'Fraud & Counterfeiting', 'Money Laundering'];

const EVAL_TICKS = 30;
const PROBE_TICKS = 5;

const WEIGHTS = { hackWeight: 80, strWeight: 0, defWeight: 0, dexWeight: 0, agiWeight: 0, chaWeight: 20 };

function stats(overrides = {}) {
  return { hack: 100, str: 1, def: 1, dex: 1, agi: 1, cha: 1, ...overrides };
}

// --- weightedStat ------------------------------------------------------

describe('weightedStat', () => {
  it('sums stat x weight / 100', () => {
    expect(weightedStat(stats({ hack: 100, cha: 50 }), WEIGHTS)).toBe((100 * 80 + 50 * 20) / 100);
  });
});

// --- nextRecruitName -----------------------------------------------------

describe('nextRecruitName', () => {
  it('starts at nite-01 with no existing members', () => {
    expect(nextRecruitName([])).toBe('nite-01');
  });

  it('fills a gap deterministically', () => {
    expect(nextRecruitName(['nite-01', 'nite-03'])).toBe('nite-02');
  });

  it('advances past a collision to the next suffix', () => {
    expect(nextRecruitName(['nite-01', 'nite-02'])).toBe('nite-03');
  });

  it('ignores existing non-scheme names', () => {
    expect(nextRecruitName(['Bob', 'nite-01'])).toBe('nite-02');
  });
});

// --- rebuildRungs ----------------------------------------------------------

describe('rebuildRungs', () => {
  it('a persisted rung wins on a name match', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: 'Unassigned' }], { 'nite-01': 3 }, FIXTURE_LADDER);
    expect(rungs['nite-01']).toBe(3);
  });

  it('a member on a known ladder task keeps that rung (live rebuild, no persisted match)', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: 'Fraud & Counterfeiting' }], {}, FIXTURE_LADDER);
    expect(rungs['nite-01']).toBe(FIXTURE_LADDER.indexOf('Fraud & Counterfeiting'));
  });

  it('"Unassigned" or an off-policy task falls back to rung 0', () => {
    const rungs = rebuildRungs(
      [
        { name: 'nite-01', task: 'Unassigned' },
        { name: 'nite-02', task: SINK_TASK },
      ],
      {}
    );
    expect(rungs['nite-01']).toBe(0);
    expect(rungs['nite-02']).toBe(0);
  });

  // Regression (2026-07-20, rep pivot): pinning the live ladder to one rung left
  // real persisted rungs of 2 in gang-state.json. Unclamped, ladder[2] is
  // undefined and every member gets setMemberTask(name, undefined) -- which the
  // gang API silently turns into "Unassigned", idling the whole gang.
  it('a persisted rung beyond the end of the ladder clamps to the top rung', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: SINK_TASK }], { 'nite-01': 2 }, ['Ransomware']);
    expect(rungs['nite-01']).toBe(0);
  });

  it('the live ladder is pinned to a single rung (rep pivot -- change deliberately, not by accident)', () => {
    expect(TASK_LADDER).toEqual(['Ransomware']);
  });

  it('a persisted name that no longer exists is simply absent from the result -- ignored, not an error', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: 'Ransomware' }], { 'nite-99': 4, 'nite-01': 2 }, FIXTURE_LADDER);
    expect(rungs).toEqual({ 'nite-01': 2 });
  });
});

// --- initBaseline ------------------------------------------------------

describe('initBaseline', () => {
  it('a fresh gang (wantedLevel at the floor of 1) captures baseline with no rebaseline event', () => {
    const r = initBaseline({ wantedLevel: 1, wantedPenalty: 1, persisted: null });
    expect(r).toEqual({ baselineWantedLevel: 1, baselinePenalty: 1, event: null });
  });

  it('restores from persisted state verbatim, no event', () => {
    const r = initBaseline({ wantedLevel: 5, wantedPenalty: 0.8, persisted: { baselineWantedLevel: 1, baselinePenalty: 1 } });
    expect(r).toEqual({ baselineWantedLevel: 1, baselinePenalty: 1, event: null });
  });

  it('missing state on a non-fresh gang (wantedLevel above the floor) captures current + flags rebaseline', () => {
    const r = initBaseline({ wantedLevel: 8, wantedPenalty: 0.7, persisted: null });
    expect(r).toEqual({ baselineWantedLevel: 8, baselinePenalty: 0.7, event: 'rebaseline' });
  });
});

// --- evalSink ------------------------------------------------------------

describe('evalSink', () => {
  it('first tick (no baseline yet) captures the current reading, zero deviation, no event', () => {
    const r = evalSink({ wantedLevel: 3, wantedPenalty: 0.9, baselineWantedLevel: undefined, baselinePenalty: undefined, sinkMode: false });
    expect(r.baselineWantedLevel).toBe(3);
    expect(r.baselinePenalty).toBe(0.9);
    expect(r.deviation).toBe(0);
    expect(r.event).toBeNull();
  });

  // Fraction-form baseline (0) is used for these boundary checks specifically
  // because it makes deviation === wantedPenalty exactly (no float error from
  // subtracting two nearly-equal numbers, which `1 - 0.005` etc. would incur).
  // wantedLevel (5) is deliberately kept ABOVE baselineWantedLevel (1) in
  // every case below -- otherwise the "at or below the minimum" baseline
  // update (the live-bug fix, see evalSink's doc comment) would overwrite
  // the very baseline these tests are trying to hold fixed and measure
  // deviation against.
  it('enters sink mode at deviation >= 0.02, not at 0.019', () => {
    const below = evalSink({ wantedLevel: 5, wantedPenalty: 0.019, baselineWantedLevel: 1, baselinePenalty: 0, sinkMode: false });
    expect(below.sinkMode).toBe(false);
    expect(below.event).toBeNull();

    const at = evalSink({ wantedLevel: 5, wantedPenalty: 0.02, baselineWantedLevel: 1, baselinePenalty: 0, sinkMode: false });
    expect(at.sinkMode).toBe(true);
    expect(at.event).toBe('sink-enter');
  });

  it('exits sink mode at deviation <= 0.005, not at 0.006', () => {
    const sinkOn = { wantedLevel: 5, baselineWantedLevel: 1, baselinePenalty: 0, sinkMode: true };
    const above = evalSink({ ...sinkOn, wantedPenalty: 0.006 });
    expect(above.sinkMode).toBe(true);
    expect(above.event).toBeNull();

    const at = evalSink({ ...sinkOn, wantedPenalty: 0.005 });
    expect(at.sinkMode).toBe(false);
    expect(at.event).toBe('sink-exit');
  });

  it('a healthy series never flaps', () => {
    let sinkMode = false;
    for (let i = 0; i < 20; i++) {
      const r = evalSink({ wantedLevel: 1, wantedPenalty: 1 + (i % 2 === 0 ? 0.001 : -0.001), baselineWantedLevel: 1, baselinePenalty: 1, sinkMode });
      sinkMode = r.sinkMode;
      expect(r.event).toBeNull();
    }
  });

  it('baseline updates whenever wantedLevel is at or below the lowest ever seen, and not otherwise', () => {
    const lower = evalSink({ wantedLevel: 0.5, wantedPenalty: 0.95, baselineWantedLevel: 1, baselinePenalty: 1, sinkMode: false });
    expect(lower.baselineWantedLevel).toBe(0.5);
    expect(lower.baselinePenalty).toBe(0.95);

    // Equal to the prior minimum -- still updates (this is the live-bug fix: a
    // fresh gang starts AT its floor, so "strictly lower" alone can never
    // re-fire once first touched).
    const same = evalSink({ wantedLevel: 1, wantedPenalty: 0.6, baselineWantedLevel: 1, baselinePenalty: 0.5, sinkMode: false });
    expect(same.baselineWantedLevel).toBe(1);
    expect(same.baselinePenalty).toBe(0.6);

    const higher = evalSink({ wantedLevel: 2, wantedPenalty: 0.7, baselineWantedLevel: 1, baselinePenalty: 1, sinkMode: false });
    expect(higher.baselineWantedLevel).toBe(1);
    expect(higher.baselinePenalty).toBe(1);
  });

  it('regression: baseline keeps tracking wantedPenalty drift while wantedLevel holds at its floor -- does not freeze at tick zero (live bug, 2026-07-19/20)', () => {
    // Reproduces the observed live failure: wantedLevel pinned at the floor
    // (1) for the entire run while wantedPenalty organically drifts (gang
    // growth, unrelated to any real wanted spike). With the fix the baseline
    // tracks the drift every tick, so deviation never grows and sinkMode
    // never incorrectly latches on.
    let baselineWantedLevel;
    let baselinePenalty;
    let sinkMode = false;
    const drift = [0.5, 0.55, 0.6, 0.64, 0.6, 0.55, 0.5];
    for (const wantedPenalty of drift) {
      const r = evalSink({ wantedLevel: 1, wantedPenalty, baselineWantedLevel, baselinePenalty, sinkMode });
      baselineWantedLevel = r.baselineWantedLevel;
      baselinePenalty = r.baselinePenalty;
      sinkMode = r.sinkMode;
      expect(sinkMode).toBe(false);
      expect(r.deviation).toBe(0);
    }
  });

  it('multiplier-form baseline (~1): deviation is relative, finite', () => {
    const r = evalSink({ wantedLevel: 5, wantedPenalty: 1.1, baselineWantedLevel: 1, baselinePenalty: 1, sinkMode: false });
    expect(r.deviation).toBeCloseTo(0.1);
    expect(Number.isFinite(r.deviation)).toBe(true);
  });

  it('fraction-form baseline (0): deviation degrades to absolute, never NaN/Infinity', () => {
    const r = evalSink({ wantedLevel: 5, wantedPenalty: 0.05, baselineWantedLevel: 1, baselinePenalty: 0, sinkMode: false });
    expect(r.deviation).toBeCloseTo(0.05);
    expect(Number.isFinite(r.deviation)).toBe(true);
    expect(Number.isNaN(r.deviation)).toBe(false);
  });
});

// --- evalPromotion -----------------------------------------------------

/**
 * Single continuous simulation loop -- every tick re-derives moneyGain/
 * weightedStatValue/sinkMode from the CURRENT rung (via the supplied
 * callbacks), so it never desyncs the way composing several fixed-length
 * `driveTicks` segments can (a baseline/probing phase transition can land
 * mid-segment, one tick earlier than a naive EVAL_TICKS/PROBE_TICKS split
 * expects). Returns the final {rung, state} plus every {tick, event, rung}
 * fired along the way.
 */
function runPromotion({ startRung, startState = freshProbeState(), moneyGainOf, weightedStatOf, sinkModeOf = () => false, maxTicks }) {
  let rung = startRung;
  let state = startState;
  const events = [];
  for (let i = 0; i < maxTicks; i++) {
    const sinkMode = sinkModeOf(i, rung);
    const result = evalPromotion({
      rung,
      moneyGain: moneyGainOf(i, rung),
      weightedStatValue: weightedStatOf(i, rung),
      state,
      sinkMode,
      ladderLength: FIXTURE_LADDER.length,
      evalTicks: EVAL_TICKS,
      probeTicks: PROBE_TICKS,
      retryStatGrowth: RETRY_STAT_GROWTH,
    });
    rung = result.rung;
    state = result.state;
    if (result.event) events.push({ tick: i, event: result.event, rung });
  }
  return { rung, state, events };
}

describe('evalPromotion', () => {
  it('strictly-better probe mean promotes and settles idle on the new rung', () => {
    // rung 0 always yields 10; rung 1 (once probing bumps it) yields 100 -- strictly better.
    const result = runPromotion({ startRung: 0, moneyGainOf: (i, rung) => (rung === 0 ? 10 : 100), weightedStatOf: () => 50, maxTicks: EVAL_TICKS + PROBE_TICKS * 2 + 5 });
    expect(result.rung).toBe(1);
    expect(result.state.phase).toBe('idle');
    expect(result.events.map((e) => e.event)).toContain('promote');
  });

  it('equal or worse probe mean reverts to the pre-probe rung and records a cooldown', () => {
    // rung 1 yields the SAME rate as rung 0 -- not strictly better, so the probe fails.
    const result = runPromotion({ startRung: 0, moneyGainOf: () => 10, weightedStatOf: () => 50, maxTicks: EVAL_TICKS + PROBE_TICKS * 2 + 5 });
    expect(result.rung).toBe(0);
    expect(result.state.phase).toBe('idle');
    expect(result.events.map((e) => e.event)).toContain('demote');
    expect(result.state.cooldowns[1]).toBe(50);
  });

  it('a strictly worse probe mean also reverts', () => {
    const result = runPromotion({ startRung: 0, moneyGainOf: (i, rung) => (rung === 0 ? 10 : 5), weightedStatOf: () => 50, maxTicks: EVAL_TICKS + PROBE_TICKS * 2 + 5 });
    expect(result.rung).toBe(0);
    expect(result.events.map((e) => e.event)).toContain('demote');
  });

  it('a cooldown blocks retrying the failed rung until weightedStat grows to 1.25x', () => {
    const failed = runPromotion({ startRung: 0, moneyGainOf: () => 10, weightedStatOf: () => 50, maxTicks: EVAL_TICKS + PROBE_TICKS * 2 + 5 });
    expect(failed.state.cooldowns[1]).toBe(50);

    // Still under the 1.25x growth threshold (62.5) -- stays idle forever, never re-enters baseline.
    const stillBlocked = runPromotion({ startRung: failed.rung, startState: failed.state, moneyGainOf: () => 10, weightedStatOf: () => 60, maxTicks: EVAL_TICKS * 2 });
    expect(stillBlocked.state.phase).toBe('idle');

    // Growth clears the threshold -- eligible again, so a fresh baseline collection can start.
    const cleared = runPromotion({ startRung: failed.rung, startState: failed.state, moneyGainOf: () => 10, weightedStatOf: () => 62.5, maxTicks: EVAL_TICKS + 2 });
    expect(['baseline', 'probing']).toContain(cleared.state.phase);
  });

  it('the top rung is never probed', () => {
    const topRung = FIXTURE_LADDER.length - 1;
    const result = runPromotion({ startRung: topRung, moneyGainOf: () => 999, weightedStatOf: () => 999, maxTicks: EVAL_TICKS * 3 });
    expect(result.rung).toBe(topRung);
    expect(result.state.phase).toBe('idle');
    expect(result.events).toEqual([]);
  });

  it('a probe interrupted by sink-enter reverts to the pre-probe rung, no stranded probe', () => {
    // Run just long enough to be mid-probe (past the baseline->probing transition, before the probe completes).
    const midProbeTicks = EVAL_TICKS + PROBE_TICKS + 1;
    const mid = runPromotion({ startRung: 0, moneyGainOf: () => 10, weightedStatOf: () => 50, maxTicks: midProbeTicks });
    expect(mid.state.phase).toBe('probing');
    expect(mid.rung).toBe(1);

    const interrupted = evalPromotion({
      rung: mid.rung,
      moneyGain: 999,
      weightedStatValue: 50,
      state: mid.state,
      sinkMode: true,
      ladderLength: FIXTURE_LADDER.length,
      evalTicks: EVAL_TICKS,
      probeTicks: PROBE_TICKS,
      retryStatGrowth: RETRY_STAT_GROWTH,
    });
    expect(interrupted.rung).toBe(0);
    expect(interrupted.state.phase).toBe('idle');
  });

  it('no probes while sink mode is on -- idle member stays put regardless of ticks elapsed', () => {
    const result = runPromotion({ startRung: 0, moneyGainOf: () => 999, weightedStatOf: () => 999, sinkModeOf: () => true, maxTicks: EVAL_TICKS * 3 });
    expect(result.rung).toBe(0);
    expect(result.state.phase).toBe('idle');
    expect(result.events).toEqual([]);
  });
});

// --- planAssignments -------------------------------------------------------

describe('planAssignments', () => {
  it('a fresh member (no recorded rung) is assigned Ransomware', () => {
    const ops = planAssignments({ members: [{ name: 'nite-01', task: 'Unassigned' }], rungs: {}, sinkMode: false, offMarker: false });
    expect(ops).toEqual([{ name: 'nite-01', task: 'Ransomware' }]);
  });

  it('sink mode assigns SINK_TASK to every member', () => {
    const ops = planAssignments({
      members: [
        { name: 'nite-01', task: 'Money Laundering' },
        { name: 'nite-02', task: 'Phishing' },
      ],
      rungs: { 'nite-01': 4, 'nite-02': 1 },
      sinkMode: true,
      offMarker: false,
    });
    expect(ops).toEqual([
      { name: 'nite-01', task: SINK_TASK },
      { name: 'nite-02', task: SINK_TASK },
    ]);
  });

  it('sink-off resumes the remembered rung, not rung 0', () => {
    const ops = planAssignments({
      members: [{ name: 'nite-01', task: SINK_TASK }],
      rungs: { 'nite-01': 3 },
      sinkMode: false,
      offMarker: false,
      ladder: FIXTURE_LADDER,
    });
    expect(ops).toEqual([{ name: 'nite-01', task: FIXTURE_LADDER[3] }]);
  });

  it('desired equal to current emits no op', () => {
    const ops = planAssignments({ members: [{ name: 'nite-01', task: 'Ransomware' }], rungs: { 'nite-01': 0 }, sinkMode: false, offMarker: false });
    expect(ops).toEqual([]);
  });

  it('an "Unassigned"/off-policy member is reconciled to policy', () => {
    const ops = planAssignments({ members: [{ name: 'nite-01', task: 'Unassigned' }], rungs: { 'nite-01': 2 }, sinkMode: false, offMarker: false, ladder: FIXTURE_LADDER });
    expect(ops).toEqual([{ name: 'nite-01', task: FIXTURE_LADDER[2] }]);
  });

  it('off-marker set produces an empty op list regardless of state', () => {
    const ops = planAssignments({
      members: [{ name: 'nite-01', task: 'Unassigned' }],
      rungs: { 'nite-01': 2 },
      sinkMode: true,
      offMarker: true,
    });
    expect(ops).toEqual([]);
  });

  it('restart-during-sink fixture: persisted {sinkMode:true, rungs} keeps members on SINK_TASK and resumes rungs on exit', () => {
    const membersOnSink = [{ name: 'nite-01', task: SINK_TASK }];
    const stillSink = planAssignments({ members: membersOnSink, rungs: { 'nite-01': 4 }, sinkMode: true, offMarker: false, ladder: FIXTURE_LADDER });
    expect(stillSink).toEqual([]); // already on SINK_TASK -- restored state matches live, no redundant op

    const afterExit = planAssignments({ members: membersOnSink, rungs: { 'nite-01': 4 }, sinkMode: false, offMarker: false, ladder: FIXTURE_LADDER });
    expect(afterExit).toEqual([{ name: 'nite-01', task: FIXTURE_LADDER[4] }]); // resumes rung 4, not rung 0
  });
});

// --- appendGangLog (ring trim) -------------------------------------------

describe('appendGangLog', () => {
  it('caps at GANG_LOG_MAX_ENTRIES, keeping the newest', () => {
    let entries = [];
    for (let i = 0; i < GANG_LOG_MAX_ENTRIES + 10; i++) {
      entries = appendGangLog(entries, { i });
    }
    expect(entries).toHaveLength(GANG_LOG_MAX_ENTRIES);
    expect(entries[0].i).toBe(10);
    expect(entries[entries.length - 1].i).toBe(GANG_LOG_MAX_ENTRIES + 9);
  });

  it('no-ops (no trim) while under the cap', () => {
    let entries = [{ i: 0 }, { i: 1 }];
    entries = appendGangLog(entries, { i: 2 });
    expect(entries).toEqual([{ i: 0 }, { i: 1 }, { i: 2 }]);
  });
});

// --- buildGangState ----------------------------------------------------

describe('buildGangState', () => {
  it('assembles the snapshot shape from already-computed values', () => {
    const gangInfo = { respect: 10, respectGainRate: 0.1, moneyGainRate: 5, wantedLevel: 1, wantedPenalty: 1, territory: 0.143 };
    const state = buildGangState({
      now: 1000,
      gangInfo,
      sinkMode: false,
      baselineWantedLevel: 1,
      baselinePenalty: 1,
      bonusMs: 0,
      formulasAvailable: false,
      offMarker: false,
      members: [{ name: 'nite-01' }],
    });
    expect(state).toMatchObject({
      timestamp: 1000,
      respect: 10,
      wantedLevel: 1,
      sinkMode: false,
      territory: 0.143,
      memberCount: 1,
      formulasAvailable: false,
      offMarker: false,
    });
  });
});
