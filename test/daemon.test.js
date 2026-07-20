// Unit tests for src/daemon.js's trimLog (Phase 16, F2 -- fixes the
// pinned-branch off-by-one that left the ring buffer at MAX + 1 while a
// `mode` event was pinned) and buildDaemonStatus (Phase 24, S2 -- the
// dashboard.js status-snapshot builder). trimLog/DAEMON_LOG_MAX_ENTRIES are
// exported for this test only -- no other behavior change.
import { describe, it, expect } from 'vitest';
import { trimLog, DAEMON_LOG_MAX_ENTRIES, buildDaemonStatus, planRelaunches, RESIDENT_COMPANIONS, SUPERVISOR_RETRY_MS } from '../src/daemon.js';

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

describe('planRelaunches — Phase 26 B1 (S5/S10)', () => {
  const residents = ['a.js', 'b.js', 'c.js'];

  it('a missing resident is queued for launch, with its attempt time recorded', () => {
    const running = new Set(['b.js', 'c.js']);
    const r = planRelaunches(running, residents, new Set(), {}, 1000);
    expect(r.launch).toEqual(['a.js']);
    expect(r.waitingRam).toEqual([]);
    expect(r.lastAttemptMs['a.js']).toBe(1000);
  });

  it('a running resident needs nothing', () => {
    const running = new Set(residents);
    const r = planRelaunches(running, residents, new Set(), {}, 1000);
    expect(r.launch).toEqual([]);
    expect(r.waitingRam).toEqual([]);
  });

  it('backoff: missing again within SUPERVISOR_RETRY_MS is not relaunched; after it is', () => {
    const running = new Set(['b.js', 'c.js']);
    const priorAttempts = { 'a.js': 1000 };
    const stillWithin = planRelaunches(running, residents, new Set(), priorAttempts, 1000 + SUPERVISOR_RETRY_MS - 1);
    expect(stillWithin.launch).toEqual([]);
    expect(stillWithin.lastAttemptMs['a.js']).toBe(1000); // untouched -- no attempt was made

    const afterBackoff = planRelaunches(running, residents, new Set(), priorAttempts, 1000 + SUPERVISOR_RETRY_MS);
    expect(afterBackoff.launch).toEqual(['a.js']);
    expect(afterBackoff.lastAttemptMs['a.js']).toBe(1000 + SUPERVISOR_RETRY_MS);
  });

  it('missing + unfit => waitingRam, no launch, no attempt-time update', () => {
    const running = new Set(['b.js', 'c.js']);
    const r = planRelaunches(running, residents, new Set(['a.js']), {}, 1000);
    expect(r.launch).toEqual([]);
    expect(r.waitingRam).toEqual(['a.js']);
    expect(r.lastAttemptMs['a.js']).toBeUndefined();
  });

  it('unfit -> fit transition launches immediately -- no backoff accrued while waiting', () => {
    const running = new Set(['b.js', 'c.js']);
    // Missing and unfit for a long stretch -- no attempt time was ever set.
    const waiting = planRelaunches(running, residents, new Set(['a.js']), {}, 1000);
    expect(waiting.lastAttemptMs['a.js']).toBeUndefined();
    // Now it fits: must launch immediately, not wait out SUPERVISOR_RETRY_MS.
    const nowFits = planRelaunches(running, residents, new Set(), waiting.lastAttemptMs, 1000 + 1);
    expect(nowFits.launch).toEqual(['a.js']);
  });

  it('self-terminating scripts never appear -- list membership is the rail', () => {
    expect(RESIDENT_COMPANIONS).not.toContain('procureprograms.js');
    expect(RESIDENT_COMPANIONS).not.toContain('procureformulas.js');
    expect(RESIDENT_COMPANIONS).not.toContain('studybootstrap.js');
    expect(RESIDENT_COMPANIONS).not.toContain('backdoorfactions.js');
    expect(RESIDENT_COMPANIONS).not.toContain('backdoorwd.js');
  });

  it('Phase 27: gangmanager.js is resident, in the priority slot right after cloudmanager.js', () => {
    expect(RESIDENT_COMPANIONS).toContain('gangmanager.js');
    const cloudIdx = RESIDENT_COMPANIONS.indexOf('cloudmanager.js');
    expect(RESIDENT_COMPANIONS[cloudIdx + 1]).toBe('gangmanager.js');
  });

  it('multiple missing residents are all handled in one pass', () => {
    const r = planRelaunches(new Set(), residents, new Set(), {}, 1000);
    expect(r.launch.sort()).toEqual(['a.js', 'b.js', 'c.js']);
  });
});
