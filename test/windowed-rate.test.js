import { describe, it, expect } from 'vitest';
import { parseWindows, windowedIncomeRate } from './windowed-rate.js';

describe('parseWindows', () => {
  it('returns [] for an unset/empty spec', () => {
    expect(parseWindows(undefined)).toEqual([]);
    expect(parseWindows('')).toEqual([]);
  });

  it('parses a single unlabeled range', () => {
    expect(parseWindows('1000-2000')).toEqual([{ label: '1000-2000', start: 1000, end: 2000 }]);
  });

  it('parses multiple comma-separated ranges', () => {
    expect(parseWindows('1000-2000,3000-4000')).toEqual([
      { label: '1000-2000', start: 1000, end: 2000 },
      { label: '3000-4000', start: 3000, end: 4000 },
    ]);
  });

  it('parses labeled ranges', () => {
    expect(parseWindows('A:1000-2000,B:3000-4000')).toEqual([
      { label: 'A', start: 1000, end: 2000 },
      { label: 'B', start: 3000, end: 4000 },
    ]);
  });
});

describe('windowedIncomeRate', () => {
  const entries = [
    { type: 'income', source: 'hacking', amount: 1000, firstTimestamp: 1000, lastTimestamp: 1500 },
    { type: 'income', source: 'hacking', amount: 2000, firstTimestamp: 5000, lastTimestamp: 5500 }, // outside window A
    { type: 'expense', source: 'fleet-upgrade', amount: 500, timestamp: 1200 }, // never counted
  ];

  it('sums income records fully contained within the window, computing $/min', () => {
    const window = { label: 'A', start: 0, end: 60_000 }; // 1 minute
    const result = windowedIncomeRate(entries, window);
    expect(result).toEqual({ label: 'A', total: 3000, perMinute: 3000, count: 2 });
  });

  it('excludes records outside the window', () => {
    const window = { label: 'narrow', start: 0, end: 2000 };
    const result = windowedIncomeRate(entries, window);
    expect(result.total).toBe(1000);
    expect(result.count).toBe(1);
  });

  it('returns perMinute 0 for a zero-width window instead of dividing by zero', () => {
    const window = { label: 'zero', start: 1000, end: 1000 };
    const result = windowedIncomeRate(entries, window);
    expect(result.perMinute).toBe(0);
  });

  it('returns zeros for a window with no matching income', () => {
    const window = { label: 'empty', start: 100_000, end: 200_000 };
    expect(windowedIncomeRate(entries, window)).toEqual({ label: 'empty', total: 0, perMinute: 0, count: 0 });
  });

  // --- overlap proration (2026-07-04 fix: a strict fully-contained filter
  // was found, via a real session, to silently drop most records -- income
  // coalesces on a rolling ~5min cadence independent of window boundaries,
  // so straddling is the common case) ---

  describe('records straddling a window boundary', () => {
    const straddling = [{ type: 'income', source: 'hacking', amount: 1000, firstTimestamp: 0, lastTimestamp: 1000 }];

    it('prorates a record straddling the END boundary by the overlapping fraction', () => {
      const window = { label: 'w', start: 0, end: 250 }; // covers the first 25% of the record's span
      const result = windowedIncomeRate(straddling, window);
      expect(result.total).toBeCloseTo(250);
      expect(result.count).toBe(1);
    });

    it('prorates a record straddling the START boundary by the overlapping fraction', () => {
      const window = { label: 'w', start: 750, end: 2000 }; // covers the last 25% of the record's span
      const result = windowedIncomeRate(straddling, window);
      expect(result.total).toBeCloseTo(250);
    });

    it('splits a record spanning two adjacent windows so the halves sum to the full amount', () => {
      const first = windowedIncomeRate(straddling, { label: 'first', start: 0, end: 400 });
      const second = windowedIncomeRate(straddling, { label: 'second', start: 400, end: 1000 });
      expect(first.total + second.total).toBeCloseTo(1000);
    });

    it('caps a record whose full span exceeds the window at only the overlapping portion', () => {
      const wide = [{ type: 'income', source: 'hacking', amount: 1000, firstTimestamp: 0, lastTimestamp: 1000 }];
      const window = { label: 'inner', start: 200, end: 400 }; // 20% of the record's span, fully inside it
      const result = windowedIncomeRate(wide, window);
      expect(result.total).toBeCloseTo(200);
    });
  });

  it('counts a zero-span record in full when it falls inside the window', () => {
    const zeroSpan = [{ type: 'income', source: 'hacking', amount: 500, firstTimestamp: 100, lastTimestamp: 100 }];
    const result = windowedIncomeRate(zeroSpan, { label: 'w', start: 0, end: 200 });
    expect(result.total).toBe(500);
  });
});
