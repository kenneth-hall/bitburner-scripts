// Unit tests for src/translog.js: transactionsFileName goldens, shouldCoalesce
// decision cases, and a mock-ns test for recordTransaction's read-modify-write.
import { describe, it, expect } from 'vitest';
import {
  transactionsFileName,
  recordTransaction,
  shouldCoalesce,
  coalesceIndexForSource,
  INCOME_COALESCE_GAP_MS,
  INCOME_WINDOW_MAX_MS,
} from '../src/translog.js';

describe('transactionsFileName', () => {
  it('builds YYYY-MM-DD from local date parts', () => {
    expect(transactionsFileName(new Date(2026, 6, 4))).toBe('transactions-2026-07-04.json');
  });

  it('pads a single-digit month', () => {
    expect(transactionsFileName(new Date(2026, 0, 15))).toBe('transactions-2026-01-15.json');
  });

  it('pads a single-digit day', () => {
    expect(transactionsFileName(new Date(2026, 10, 3))).toBe('transactions-2026-11-03.json');
  });

  it('pads both a single-digit month and day', () => {
    expect(transactionsFileName(new Date(2026, 0, 5))).toBe('transactions-2026-01-05.json');
  });
});

describe('shouldCoalesce', () => {
  const T = 1_000_000_000; // arbitrary epoch ms anchor

  it('folds within the gap and well under the max window', () => {
    const last = { type: 'income', firstTimestamp: T, lastTimestamp: T + 10_000 };
    expect(shouldCoalesce(last, T + 40_000)).toBe(true);
  });

  it('breaks once the gap since lastTimestamp is exceeded', () => {
    const last = { type: 'income', firstTimestamp: T, lastTimestamp: T };
    expect(shouldCoalesce(last, T + INCOME_COALESCE_GAP_MS + 1)).toBe(false);
  });

  it('folds at exactly the max projected window (checker asserts <=)', () => {
    const last = { type: 'income', firstTimestamp: T, lastTimestamp: T + 250_000 };
    expect(shouldCoalesce(last, T + INCOME_WINDOW_MAX_MS)).toBe(true);
  });

  it('breaks once the projected window exceeds the max', () => {
    const last = { type: 'income', firstTimestamp: T, lastTimestamp: T + 250_000 };
    expect(shouldCoalesce(last, T + INCOME_WINDOW_MAX_MS + 1)).toBe(false);
  });

  it('never folds into a non-income last record', () => {
    const last = { type: 'expense', source: 'darkweb-program', timestamp: T };
    expect(shouldCoalesce(last, T + 1000)).toBe(false);
  });

  it('never folds when there is no last record', () => {
    expect(shouldCoalesce(undefined, T)).toBe(false);
    expect(shouldCoalesce(null, T)).toBe(false);
  });
});

describe('coalesceIndexForSource', () => {
  const T = 1_000_000_000;

  it('finds the last same-source income record across an interleaved fixture, ignoring other sources', () => {
    const entries = [
      { type: 'income', source: 'gang', amount: 1, firstTimestamp: T - 30_000, lastTimestamp: T - 30_000 },
      { type: 'income', source: 'hacking', amount: 2, firstTimestamp: T - 20_000, lastTimestamp: T - 20_000 },
      { type: 'expense', source: 'auto-aug', amount: 3, timestamp: T - 15_000 },
      { type: 'income', source: 'gang', amount: 4, firstTimestamp: T - 10_000, lastTimestamp: T - 10_000 },
    ];
    expect(coalesceIndexForSource(entries, 'gang', T)).toBe(3);
    expect(coalesceIndexForSource(entries, 'hacking', T)).toBe(1);
  });

  it('returns -1 once the gap since lastTimestamp is exceeded', () => {
    const entries = [{ type: 'income', source: 'gang', firstTimestamp: T, lastTimestamp: T }];
    expect(coalesceIndexForSource(entries, 'gang', T + INCOME_COALESCE_GAP_MS + 1)).toBe(-1);
  });

  it('returns -1 once the projected window would exceed the max', () => {
    const entries = [{ type: 'income', source: 'gang', firstTimestamp: T, lastTimestamp: T + 250_000 }];
    expect(coalesceIndexForSource(entries, 'gang', T + INCOME_WINDOW_MAX_MS + 1)).toBe(-1);
  });

  it('returns -1 when no record of that source exists', () => {
    const entries = [{ type: 'income', source: 'hacking', firstTimestamp: T, lastTimestamp: T }];
    expect(coalesceIndexForSource(entries, 'gang', T)).toBe(-1);
  });

  it('never returns an expense record\'s index, even one with a matching source string', () => {
    const entries = [
      { type: 'expense', source: 'gang-equip', amount: 5, timestamp: T - 1000 },
      { type: 'income', source: 'gang', firstTimestamp: T - 500, lastTimestamp: T - 500 },
    ];
    expect(coalesceIndexForSource(entries, 'gang-equip', T)).toBe(-1);
  });

  it('returns -1 on an empty array', () => {
    expect(coalesceIndexForSource([], 'gang', T)).toBe(-1);
  });
});

describe('recordTransaction', () => {
  function makeMockNs({ readReturn = '' } = {}) {
    const calls = { sequence: [], read: [], write: [] };
    return {
      calls,
      read: (filename) => {
        calls.sequence.push('read');
        calls.read.push([filename]);
        return readReturn;
      },
      write: (filename, data, mode) => {
        calls.sequence.push('write');
        calls.write.push([filename, data, mode]);
      },
    };
  }

  it('appends to an existing array and writes in "w" mode', () => {
    const existing = [{ type: 'expense', source: 'darkweb-program', program: 'BruteSSH.exe', amount: 500_000, timestamp: 1, time: 'x' }];
    const ns = makeMockNs({ readReturn: JSON.stringify(existing) });
    const record = { type: 'expense', source: 'home-ram-upgrade', newRamGb: 64, amount: 1_000_000, timestamp: 2, time: 'y' };

    recordTransaction(ns, record);

    expect(ns.calls.write).toHaveLength(1);
    const [filename, data, mode] = ns.calls.write[0];
    expect(filename).toMatch(/^transactions-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mode).toBe('w');
    expect(JSON.parse(data)).toEqual([...existing, record]);
  });

  it('starts a fresh one-element array when the file is missing/empty', () => {
    const ns = makeMockNs({ readReturn: '' });
    const record = { type: 'expense', source: 'cloud-purchase', hostname: 'pserv-16gb-0', ram: 16, amount: 200_000, timestamp: 3, time: 'z' };

    recordTransaction(ns, record);

    const [, data] = ns.calls.write[0];
    expect(JSON.parse(data)).toEqual([record]);
  });

  it('reads before it writes, with no call in between', () => {
    const ns = makeMockNs({ readReturn: '' });
    recordTransaction(ns, { type: 'expense', source: 'darkweb-program', program: 'FTPCrack.exe', amount: 100, timestamp: 4, time: 'w' });
    expect(ns.calls.sequence).toEqual(['read', 'write']);
  });
});
