// Unit tests for src/targetsmonitor.js's buildTargetsRanking (Phase 24, S3 --
// the dashboard.js targets panel source). The live-refresh/re-rank loop
// itself needs `ns` and isn't unit-tested here.
import { describe, it, expect } from 'vitest';
import { buildTargetsRanking } from '../src/targetsmonitor.js';

describe('buildTargetsRanking', () => {
  it('stamps timestamp/time and carries totalCount separately from the entries list', () => {
    const entries = [{ server: 'a', prepped: true, sec: 1, minSec: 1, money: 100, maxMoney: 200, score: 5 }];
    const record = buildTargetsRanking(entries, 12, 1000);
    expect(record).toEqual({ timestamp: 1000, time: expect.any(String), totalCount: 12, targets: entries });
  });

  it('handles an empty ranking (no eligible targets)', () => {
    const record = buildTargetsRanking([], 0, 1000);
    expect(record.targets).toEqual([]);
    expect(record.totalCount).toBe(0);
  });
});
