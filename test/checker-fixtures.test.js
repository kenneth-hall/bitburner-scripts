// Checker-logic tests against synthetic fixtures (Phase 4's pattern, applied
// to Phase 8's three new daemon-log hard assertions): a clean fixture passes
// all three, and a fixture deliberately violating one assertion fails
// exactly that one while the other two stay clean. Runs under plain `npm
// test` (deliberately NOT named verify-*.test.js, so vitest.config.ts's
// exclude doesn't skip it) -- unlike verify-log.test.js, this never touches a
// real exported game log.
import { describe, it, expect } from 'vitest';
import { checkShareCap, checkBudgetInvariant, checkFractionConsistency, checkNaturalExit, dropPreConfigStragglers } from './verify-log-checks.js';
import {
  checkKnownEventsAndTimestamps,
  checkTimestampsNonDecreasing,
  checkHandoffTerminal,
  checkDeployShape,
  checkTargetSwitchDistinct,
} from './verify-bootstrap-checks.js';

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
    sharePool: { targetGb: 250, inFlightRamGb: 248, threads: 62, attainedPct: 99.2, sharePower: 1.8 },
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
  const entries = [...baseEntries(), cleanSnapshot({ sharePool: { targetGb: 250, inFlightRamGb: 260, threads: 62, attainedPct: 104, sharePower: 1.8 } })];

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
  const entries = [...baseEntries(), cleanSnapshot({ sharePool: { targetGb: 999, inFlightRamGb: 248, threads: 62, attainedPct: 24.8, sharePower: 1.8 } })];

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
        sharePool: { targetGb: 0, inFlightRamGb: 40, threads: 10, attainedPct: null, sharePower: 1.2 },
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
        sharePool: { targetGb: 0, inFlightRamGb: 40, threads: 10, attainedPct: null, sharePower: 1.2 },
      }),
    ];
    expect(checkShareCap(entries).length).toBeGreaterThan(0);
  });
});

describe('checkNaturalExit', () => {
  it('passes a clean exit -> drain -> enter sequence', () => {
    const entries = [
      { event: 'exit', time: 't1', timestamp: 1000, server: 'a', reason: 'displaced', batchesInFlight: 2, inFlightRamGb: 10, commitmentPct: 50 },
      { event: 'snapshot', time: 't2', timestamp: 1100, draining: [{ server: 'a', batchesInFlight: 1, inFlightRamGb: 5 }] },
      { event: 'snapshot', time: 't3', timestamp: 1200, draining: [] },
      { event: 'enter', time: 't4', timestamp: 1300, server: 'a', score: 100, displaced: [], prepped: true },
    ];
    expect(checkNaturalExit(entries)).toEqual([]);
  });

  // Modeled on the real Phase 8 failure (docs/phases/phase-09-batcher-refactor.md): a
  // `displaced` exit followed by `batch` events against the same server with
  // no intervening `enter` -- the pass-3/pass-4 both-lists bug's fingerprint.
  it('flags a batch event against a server with an open exit and no intervening enter', () => {
    const entries = [
      { event: 'exit', time: 't1', timestamp: 1000, server: 'a', reason: 'displaced', batchesInFlight: 2, inFlightRamGb: 10, commitmentPct: 50 },
      { event: 'batch', time: 't2', timestamp: 1100, batchTarget: 'a' },
    ];
    const violations = checkNaturalExit(entries);
    expect(violations.length).toBe(1);
    expect(violations[0].reason).toMatch(/batch event for a while it has an open exit/);
  });

  it('flags a rising draining count for a server with an open exit', () => {
    const entries = [
      { event: 'exit', time: 't1', timestamp: 1000, server: 'a', reason: 'displaced', batchesInFlight: 2, inFlightRamGb: 10, commitmentPct: 50 },
      { event: 'snapshot', time: 't2', timestamp: 1100, draining: [{ server: 'a', batchesInFlight: 1, inFlightRamGb: 5 }] },
      { event: 'snapshot', time: 't3', timestamp: 1200, draining: [{ server: 'a', batchesInFlight: 2, inFlightRamGb: 10 }] },
    ];
    const violations = checkNaturalExit(entries);
    expect(violations.length).toBe(1);
    expect(violations[0].reason).toMatch(/increased after exit/);
  });
});

describe('dropPreConfigStragglers', () => {
  it('drops leftover pre-mode-event snapshots, fixing an otherwise-failing fraction-consistency check', () => {
    // A ring-buffer straggler: a snapshot from the tail end of the previous
    // window survives, but its own `mode` event has already aged out --
    // unsliced, it has no preceding mode event at all (a hard violation).
    // The real window's own mode + snapshot follow right after.
    const strayFromPreviousWindow = cleanSnapshot({ time: 'stray', timestamp: 500 });
    const entries = [strayFromPreviousWindow, ...baseEntries(), cleanSnapshot()];

    expect(checkFractionConsistency(entries).length).toBeGreaterThan(0);
    expect(checkFractionConsistency(dropPreConfigStragglers(entries))).toEqual([]);
  });

  it('passes a log that already starts with a mode event through unchanged', () => {
    const entries = [...baseEntries(), cleanSnapshot()];
    expect(dropPreConfigStragglers(entries)).toEqual(entries);
  });

  it('passes an empty array through unchanged', () => {
    expect(dropPreConfigStragglers([])).toEqual([]);
  });
});

describe('bootstrap-log checker fixtures (Phase 14)', () => {
  function cleanBootstrapLog() {
    return [
      { event: 'startup', time: 't0', timestamp: 1000, securityEpsilon: 1, moneyFraction: 0.9, bootloopRam: 2.2 },
      { event: 'new-hosts', time: 't1', timestamp: 1100, added: ['n00dles'], removed: [] },
      { event: 'deploy', time: 't2', timestamp: 1200, target: 'n00dles', hosts: [{ host: 'n00dles', threads: 4 }], totalThreads: 4 },
      { event: 'target-switch', time: 't3', timestamp: 1300, from: 'n00dles', to: 'foodnstuff', hackingLevel: 5 },
      { event: 'nudge', time: 't4', timestamp: 1400, key: 'tor-router', cost: 200_000 },
      { event: 'handoff', time: 't5', timestamp: 1500, homeFreeRam: 26, daemonPid: 42 },
    ];
  }

  it('a clean log passes all five checks', () => {
    const entries = cleanBootstrapLog();
    expect(checkKnownEventsAndTimestamps(entries)).toEqual([]);
    expect(checkTimestampsNonDecreasing(entries)).toEqual([]);
    expect(checkHandoffTerminal(entries)).toEqual([]);
    expect(checkDeployShape(entries)).toEqual([]);
    expect(checkTargetSwitchDistinct(entries)).toEqual([]);
  });

  it('flags an unknown event kind or a missing timestamp', () => {
    expect(checkKnownEventsAndTimestamps([{ event: 'mystery', timestamp: 1000 }]).length).toBeGreaterThan(0);
    expect(checkKnownEventsAndTimestamps([{ event: 'startup' }]).length).toBeGreaterThan(0);
  });

  it('flags out-of-order timestamps', () => {
    const entries = [
      { event: 'startup', timestamp: 2000 },
      { event: 'new-hosts', timestamp: 1000, added: [], removed: [] },
    ];
    expect(checkTimestampsNonDecreasing(entries).length).toBeGreaterThan(0);
  });

  it('flags more than one handoff event', () => {
    const entries = [
      { event: 'handoff', timestamp: 1000 },
      { event: 'handoff', timestamp: 2000 },
    ];
    expect(checkHandoffTerminal(entries).length).toBeGreaterThan(0);
  });

  it('flags any entry appearing after a handoff event', () => {
    const entries = [
      { event: 'handoff', timestamp: 1000 },
      { event: 'new-hosts', timestamp: 2000, added: [], removed: [] },
    ];
    expect(checkHandoffTerminal(entries).length).toBeGreaterThan(0);
  });

  it('flags a deploy entry with an empty host list', () => {
    const entries = [{ event: 'deploy', timestamp: 1000, target: 'n00dles', hosts: [], totalThreads: 0 }];
    expect(checkDeployShape(entries).length).toBeGreaterThan(0);
  });

  it('flags a deploy entry with a non-positive-integer thread count', () => {
    const entries = [{ event: 'deploy', timestamp: 1000, target: 'n00dles', hosts: [{ host: 'n00dles', threads: 0 }], totalThreads: 0 }];
    expect(checkDeployShape(entries).length).toBeGreaterThan(0);
    const fractional = [{ event: 'deploy', timestamp: 1000, target: 'n00dles', hosts: [{ host: 'n00dles', threads: 1.5 }], totalThreads: 1.5 }];
    expect(checkDeployShape(fractional).length).toBeGreaterThan(0);
  });

  it('flags a target-switch entry with identical from/to', () => {
    const entries = [{ event: 'target-switch', timestamp: 1000, from: 'n00dles', to: 'n00dles', hackingLevel: 5 }];
    expect(checkTargetSwitchDistinct(entries).length).toBeGreaterThan(0);
  });
});
