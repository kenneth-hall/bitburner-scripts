// Checker-logic tests against synthetic fixtures (Phase 4's pattern, applied
// to Phase 8's three new daemon-log hard assertions): a clean fixture passes
// all three, and a fixture deliberately violating one assertion fails
// exactly that one while the other two stay clean. Runs under plain `npm
// test` (deliberately NOT named verify-*.test.js, so vitest.config.ts's
// exclude doesn't skip it) -- unlike verify-log.test.js, this never touches a
// real exported game log.
import { describe, it, expect } from 'vitest';
import { checkShareCap, checkBudgetInvariant, checkFractionConsistency } from './verify-log-checks.js';

function baseEntries({ shareFraction = 0.25, shareOff = false } = {}) {
  return [
    {
      event: 'mode',
      time: 't0',
      timestamp: 1000,
      formulas: false,
      forcedLegacy: false,
      shareFraction,
      shareOff,
      config: { SHARE_FRACTION: 0.25 },
    },
  ];
}

function cleanSnapshot(overrides = {}) {
  return {
    event: 'snapshot',
    time: 't1',
    timestamp: 2000,
    budgetGb: 1000,
    batchBudgetGb: 750,
    members: [{ server: 'a', pipelineCostGb: 700 }],
    share: { targetGb: 250, inFlightRamGb: 248, threads: 62, attainedPct: 99.2, sharePower: 1.8 },
    ...overrides,
  };
}

describe('checker fixtures: clean log', () => {
  const entries = [...baseEntries(), cleanSnapshot()];

  it('passes all three Phase 8 hard assertions', () => {
    expect(checkShareCap(entries)).toEqual([]);
    expect(checkBudgetInvariant(entries)).toEqual([]);
    expect(checkFractionConsistency(entries)).toEqual([]);
  });
});

describe('checker fixtures: share-cap violation', () => {
  // inFlightRamGb (260) exceeds targetGb (250) + one thread's RAM (~4.19) --
  // everything else stays at the clean fixture's values.
  const entries = [...baseEntries(), cleanSnapshot({ share: { targetGb: 250, inFlightRamGb: 260, threads: 62, attainedPct: 104, sharePower: 1.8 } })];

  it('fails only the share-cap check', () => {
    expect(checkShareCap(entries).length).toBeGreaterThan(0);
    expect(checkBudgetInvariant(entries)).toEqual([]);
    expect(checkFractionConsistency(entries)).toEqual([]);
  });
});

describe('checker fixtures: budget invariant violation', () => {
  // Member cost (800) exceeds batchBudgetGb (750) -- share block stays clean.
  const entries = [...baseEntries(), cleanSnapshot({ members: [{ server: 'a', pipelineCostGb: 800 }] })];

  it('fails only the budget invariant', () => {
    expect(checkShareCap(entries)).toEqual([]);
    expect(checkBudgetInvariant(entries).length).toBeGreaterThan(0);
    expect(checkFractionConsistency(entries)).toEqual([]);
  });

  it('also flags batchBudgetGb exceeding budgetGb', () => {
    const overBudget = [...baseEntries(), cleanSnapshot({ batchBudgetGb: 1100 })];
    expect(checkBudgetInvariant(overBudget).length).toBeGreaterThan(0);
  });
});

describe('checker fixtures: fraction consistency violation', () => {
  // share.targetGb (999) is nowhere near shareFraction(0.25) x budgetGb(1000) = 250.
  const entries = [...baseEntries(), cleanSnapshot({ share: { targetGb: 999, inFlightRamGb: 248, threads: 62, attainedPct: 24.8, sharePower: 1.8 } })];

  it('fails only fraction consistency', () => {
    expect(checkShareCap(entries)).toEqual([]); // 248 is well under 999 + tolerance -- not a cap violation
    expect(checkBudgetInvariant(entries)).toEqual([]);
    expect(checkFractionConsistency(entries).length).toBeGreaterThan(0);
  });

  it('flags a snapshot with no preceding mode event at all', () => {
    expect(checkFractionConsistency([cleanSnapshot()]).length).toBeGreaterThan(0);
  });
});

describe('checker fixtures: share-cap grace window', () => {
  it('exempts a lingering zero-target pool within 30s of the toggle-off mode event', () => {
    const entries = [
      ...baseEntries(),
      { event: 'mode', time: 't1', timestamp: 2000, formulas: false, forcedLegacy: false, shareFraction: 0, shareOff: true, config: { SHARE_FRACTION: 0.25 } },
      cleanSnapshot({
        time: 't2',
        timestamp: 2010, // 10ms after toggle-off -- well within the 30s grace window
        share: { targetGb: 0, inFlightRamGb: 40, threads: 10, attainedPct: null, sharePower: 1.2 },
      }),
    ];
    expect(checkShareCap(entries)).toEqual([]);
  });

  it('flags a lingering zero-target pool outside the 30s grace window', () => {
    const entries = [
      ...baseEntries(),
      { event: 'mode', time: 't1', timestamp: 2000, formulas: false, forcedLegacy: false, shareFraction: 0, shareOff: true, config: { SHARE_FRACTION: 0.25 } },
      cleanSnapshot({
        time: 't2',
        timestamp: 2000 + 31_000, // 31s after toggle-off -- past the 30s grace window
        share: { targetGb: 0, inFlightRamGb: 40, threads: 10, attainedPct: null, sharePower: 1.2 },
      }),
    ];
    expect(checkShareCap(entries).length).toBeGreaterThan(0);
  });
});
