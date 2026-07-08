// Unit tests for src/daemon.js's trimLog (Phase 16, F2 -- fixes the
// pinned-branch off-by-one that left the ring buffer at MAX + 1 while a
// `mode` event was pinned). trimLog/DAEMON_LOG_MAX_ENTRIES are exported
// for this test only -- no other behavior change.
import { describe, it, expect } from 'vitest';
import { trimLog, DAEMON_LOG_MAX_ENTRIES } from '../src/daemon.js';

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
