// Unit tests for src/financestate.js (Phase 16, F4 -- extracted from the
// byte-duplicated copies formerly in cloudmanager.js/procureprograms.js).
import { describe, it, expect } from 'vitest';
import { isStateStale, readFinanceState, FINANCE_STATE_FILE } from '../src/financestate.js';

describe('isStateStale', () => {
  const NOW = 1_000_000_000;
  const STALE_MS = 15_000;

  it('is fresh well within the window', () => {
    expect(isStateStale(NOW - 1000, NOW, STALE_MS)).toBe(false);
  });

  it('is fresh exactly at the boundary (checker uses strict >)', () => {
    expect(isStateStale(NOW - STALE_MS, NOW, STALE_MS)).toBe(false);
  });

  it('is stale just past the boundary', () => {
    expect(isStateStale(NOW - STALE_MS - 1, NOW, STALE_MS)).toBe(true);
  });

  it('is stale when the timestamp is missing', () => {
    expect(isStateStale(null, NOW, STALE_MS)).toBe(true);
    expect(isStateStale(undefined, NOW, STALE_MS)).toBe(true);
  });
});

describe('readFinanceState', () => {
  function makeNs(fileContents) {
    return { read: (file) => (file === FINANCE_STATE_FILE ? fileContents : '') };
  }

  it('returns null for a missing file (empty read)', () => {
    expect(readFinanceState(makeNs(''))).toBeNull();
  });

  it('parses valid JSON content', () => {
    const state = { timestamp: 123, totalReserved: 500_000 };
    expect(readFinanceState(makeNs(JSON.stringify(state)))).toEqual(state);
  });

  it('returns null for unparseable content instead of throwing', () => {
    expect(readFinanceState(makeNs('not json'))).toBeNull();
  });
});
