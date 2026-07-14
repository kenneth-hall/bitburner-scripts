// Unit tests for src/daemon.js's trimLog (Phase 16, F2 -- fixes the
// pinned-branch off-by-one that left the ring buffer at MAX + 1 while a
// `mode` event was pinned) and buildDaemonStatus (Phase 24, S2 -- the
// dashboard.js status-snapshot builder). trimLog/DAEMON_LOG_MAX_ENTRIES are
// exported for this test only -- no other behavior change.
import { describe, it, expect } from 'vitest';
import { trimLog, DAEMON_LOG_MAX_ENTRIES, buildDaemonStatus } from '../src/daemon.js';

/** Builds MAX + extra plain entries, no `mode` event -- non-pinned case. */
function buildPlainEntries(count) {
  return Array.from({ length: count }, (_, i) => ({ event: 'batch', i }));
}

describe('trimLog', () => {
  it('no-ops when entries are already within the cap', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES - 1);
    expect(trimLog(entries, new Map())).toBe(entries);
  });

  it('non-pinned overflow trims to exactly DAEMON_LOG_MAX_ENTRIES via plain FIFO', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    const trimmed = trimLog(entries, new Map());
    expect(trimmed).toHaveLength(DAEMON_LOG_MAX_ENTRIES);
    expect(trimmed[0]).toBe(entries[5]);
  });

  it('pinned overflow trims to exactly DAEMON_LOG_MAX_ENTRIES, not MAX + 1 (F2 regression)', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    entries[2] = { event: 'mode', hackFraction: 0.5 }; // inside the overflow region -> pinned
    const trimmed = trimLog(entries, new Map());
    expect(trimmed).toHaveLength(DAEMON_LOG_MAX_ENTRIES);
  });

  it('the pinned mode event is at index 0', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    const modeEvent = { event: 'mode', hackFraction: 0.5 };
    entries[2] = modeEvent;
    const trimmed = trimLog(entries, new Map());
    expect(trimmed[0]).toBe(modeEvent);
  });

  it('a skip record dropped only by the widened slice triggers its openSkipRecords deletion', () => {
    // overflow = 5 for a MAX+5 array; the widened slice (overflow + 1 = 6)
    // drops one more real entry than the un-widened slice would have --
    // put the skip record at that exact boundary index (5) so this test
    // fails against the pre-fix (overflow-only) slice width.
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    entries[0] = { event: 'mode', hackFraction: 0.5 }; // pinned, index 0 < overflow (5)
    const skipRecord = { event: 'skip', batchTarget: 'n00dles' };
    entries[5] = skipRecord; // boundary entry only dropped by the widened (overflow+1) slice
    const openSkipRecords = new Map([['n00dles', skipRecord]]);

    trimLog(entries, openSkipRecords);

    expect(openSkipRecords.has('n00dles')).toBe(false);
  });

  it('does not clean up an openSkipRecords entry whose record survives (not dropped)', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    const skipRecord = { event: 'skip', batchTarget: 'n00dles' };
    entries[DAEMON_LOG_MAX_ENTRIES] = skipRecord; // well within the kept tail
    const openSkipRecords = new Map([['n00dles', skipRecord]]);

    trimLog(entries, openSkipRecords);

    expect(openSkipRecords.has('n00dles')).toBe(true);
  });
});

describe('buildDaemonStatus', () => {
  it('every key is present with defaults when called with only the scalars the no-targets branch has', () => {
    const status = buildDaemonStatus({ now: 1000, useFormulas: false, forcedLegacy: false, noTargets: true, hostsCount: 5, shareOff: true, sharePower: 1 });
    expect(status).toMatchObject({
      timestamp: 1000,
      noTargets: true,
      mathMode: 'legacy',
      fleet: { totalMaxRam: 0, batchBudgetGb: 0, hostsCount: 5, targetsCount: 0, utilizationPct: 0 },
      members: [],
      memberCount: 0,
      draining: [],
      drainingCount: 0,
      share: { off: true, targetGb: 0, inFlightRamGb: 0, threads: 0, attainedPct: null, sharePower: 1 },
      waterfall: { availableGb: 0, prepping: [] },
      warns: { stall: false, skipServers: [], failedLaunches: 0 },
    });
  });

  it('mathMode reflects formulas/legacy/legacy-forced', () => {
    expect(buildDaemonStatus({ now: 1, useFormulas: true, forcedLegacy: false }).mathMode).toBe('formulas');
    expect(buildDaemonStatus({ now: 1, useFormulas: false, forcedLegacy: false }).mathMode).toBe('legacy');
    expect(buildDaemonStatus({ now: 1, useFormulas: false, forcedLegacy: true }).mathMode).toBe('legacy-forced');
  });

  it('carries every seated member, not just the display-capped set', () => {
    const members = Array.from({ length: 17 }, (_, i) => ({ server: `s${i}` }));
    const status = buildDaemonStatus({ now: 1, useFormulas: true, forcedLegacy: false, members });
    expect(status.members).toHaveLength(17);
    expect(status.memberCount).toBe(17);
  });
});
