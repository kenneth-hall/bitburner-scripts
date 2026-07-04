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

  it('sums only income records fully contained within the window, computing $/min', () => {
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
});
