// Unit tests for src/goallog.js's pure helpers (Phase 32): the cumulative-
// series rate primitive, the trend comparator built on it, and the snapshot
// assembler dashboard.js's GOAL panel reads.
import { describe, it, expect } from 'vitest';
import {
  computeRateRange,
  computeTrend,
  buildSnapshot,
  M_TARGET,
  M_TARGET_LABEL,
  RATE_WINDOW_MS,
} from '../src/goallog.js';

const T = 1_000_000_000;

function series(points) {
  // points: [ [tOffsetMs, gangCum, hackingCum], ... ]
  return points.map(([dt, gangCum, hackingCum]) => ({ t: T + dt, gangCum, hackingCum, mHacking: 1 }));
}

describe('computeRateRange', () => {
  it('happy path: total $/sec across two cumulative samples', () => {
    const s = series([[0, 1000, 500], [10_000, 2000, 1500]]); // total 1500 -> 3500, delta 2000 over 10s
    expect(computeRateRange(s, T, T + 10_000, 'total')).toBeCloseTo(200, 6);
  });

  it('happy path: a single per-source field', () => {
    const s = series([[0, 1000, 500], [10_000, 2000, 800]]);
    expect(computeRateRange(s, T, T + 10_000, 'gangCum')).toBeCloseTo(100, 6);
    expect(computeRateRange(s, T, T + 10_000, 'hackingCum')).toBeCloseTo(30, 6);
  });

  it('null with fewer than two samples in range', () => {
    const s = series([[0, 1000, 500]]);
    expect(computeRateRange(s, T, T + 10_000, 'total')).toBeNull();
    expect(computeRateRange([], T, T + 10_000, 'total')).toBeNull();
  });

  it('null on a zero (or inverted) span', () => {
    const s = series([[0, 1000, 500], [0, 1000, 500]]); // same t, both in range
    expect(computeRateRange(s, T, T, 'total')).toBeNull();
  });

  it('null on an in-range decrease of the selected field', () => {
    const s = series([[0, 1000, 500], [10_000, 500, 500]]); // gangCum dropped
    expect(computeRateRange(s, T, T + 10_000, 'gangCum')).toBeNull();
    // total still decreased too (1500 -> 1000)
    expect(computeRateRange(s, T, T + 10_000, 'total')).toBeNull();
  });

  it('only considers samples within [fromMs, toMs]', () => {
    const s = series([[-20_000, 0, 0], [0, 1000, 500], [10_000, 2000, 1500], [20_000, 9999, 9999]]);
    expect(computeRateRange(s, T, T + 10_000, 'total')).toBeCloseTo(200, 6);
  });
});

describe('computeTrend', () => {
  it('UP when the recent window clears the recent/prior ratio', () => {
    // prior window [T-2w, T-w]: total 0 -> 1000 over w=600_000ms -> rate ~1.667
    // recent window [T-w, T]: total 1000 -> 3000 over w -> rate ~3.333 (2x prior)
    const s = [
      { t: T - 2 * RATE_WINDOW_MS, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: T - RATE_WINDOW_MS, gangCum: 1000, hackingCum: 0, mHacking: 1 },
      { t: T, gangCum: 3000, hackingCum: 0, mHacking: 1 },
    ];
    expect(computeTrend(s, T, RATE_WINDOW_MS)).toBe('UP');
  });

  it('DOWN when the recent window falls under the ratio', () => {
    const s = [
      { t: T - 2 * RATE_WINDOW_MS, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: T - RATE_WINDOW_MS, gangCum: 3000, hackingCum: 0, mHacking: 1 },
      { t: T, gangCum: 4000, hackingCum: 0, mHacking: 1 },
    ];
    expect(computeTrend(s, T, RATE_WINDOW_MS)).toBe('DOWN');
  });

  it('FLAT just inside the UP threshold, UP just outside it (avoids float-boundary flakiness at exactly x1.05)', () => {
    const priorCum = 1000;
    const inside = [
      { t: T - 2 * RATE_WINDOW_MS, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: T - RATE_WINDOW_MS, gangCum: priorCum, hackingCum: 0, mHacking: 1 },
      { t: T, gangCum: priorCum + priorCum * 1.04, hackingCum: 0, mHacking: 1 },
    ];
    expect(computeTrend(inside, T, RATE_WINDOW_MS)).toBe('FLAT');

    const outside = [
      { t: T - 2 * RATE_WINDOW_MS, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: T - RATE_WINDOW_MS, gangCum: priorCum, hackingCum: 0, mHacking: 1 },
      { t: T, gangCum: priorCum + priorCum * 1.06, hackingCum: 0, mHacking: 1 },
    ];
    expect(computeTrend(outside, T, RATE_WINDOW_MS)).toBe('UP');
  });

  it('FLAT on equal rates', () => {
    const s = [
      { t: T - 2 * RATE_WINDOW_MS, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: T - RATE_WINDOW_MS, gangCum: 1000, hackingCum: 0, mHacking: 1 },
      { t: T, gangCum: 2000, hackingCum: 0, mHacking: 1 },
    ];
    expect(computeTrend(s, T, RATE_WINDOW_MS)).toBe('FLAT');
  });

  it('null when either window lacks a rate (sub-2-sample history)', () => {
    const s = [{ t: T, gangCum: 1000, hackingCum: 0, mHacking: 1 }];
    expect(computeTrend(s, T, RATE_WINDOW_MS)).toBeNull();
  });

  it('FLAT just inside the DOWN threshold, DOWN just outside it (avoids float-boundary flakiness at exactly x0.95)', () => {
    const priorCum = 1000;
    const inside = [
      { t: T - 2 * RATE_WINDOW_MS, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: T - RATE_WINDOW_MS, gangCum: priorCum, hackingCum: 0, mHacking: 1 },
      { t: T, gangCum: priorCum + priorCum * 0.96, hackingCum: 0, mHacking: 1 },
    ];
    expect(computeTrend(inside, T, RATE_WINDOW_MS)).toBe('FLAT');

    const outside = [
      { t: T - 2 * RATE_WINDOW_MS, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: T - RATE_WINDOW_MS, gangCum: priorCum, hackingCum: 0, mHacking: 1 },
      { t: T, gangCum: priorCum + priorCum * 0.94, hackingCum: 0, mHacking: 1 },
    ];
    expect(computeTrend(outside, T, RATE_WINDOW_MS)).toBe('DOWN');
  });
});

describe('buildSnapshot', () => {
  it('mProgress: rounds pct and echoes the target/label', () => {
    const s = [{ t: T, gangCum: 0, hackingCum: 0, mHacking: 1.51 }];
    const snap = buildSnapshot(s, null, T);
    expect(snap.mProgress).toEqual({ value: 1.51, target: M_TARGET, targetLabel: M_TARGET_LABEL, pct: Math.round((1.51 / M_TARGET) * 100) });
  });

  it('mProgress.value/pct are null on an empty series', () => {
    const snap = buildSnapshot([], null, T);
    expect(snap.mProgress.value).toBeNull();
    expect(snap.mProgress.pct).toBeNull();
  });

  it('nextAug is null when augState is missing/unreadable', () => {
    expect(buildSnapshot([], null, T).nextAug).toBeNull();
    expect(buildSnapshot([], undefined, T).nextAug).toBeNull();
  });

  it('nextAug is null when augState has no target (plateau)', () => {
    expect(buildSnapshot([], { phase: 'idle-plateau', target: null }, T).nextAug).toBeNull();
  });

  it('nextAug carries the target fields but no waiting stamp outside awaiting-money', () => {
    const snap = buildSnapshot([], { phase: 'grinding', target: { aug: 'x', faction: 'y', livePrice: 123 } }, T);
    expect(snap.nextAug).toEqual({ aug: 'x', faction: 'y', price: 123, phase: 'grinding', awaitingSince: null, waitingMs: null });
  });

  it('nextAug.waitingMs is populated only in awaiting-money with a stamp', () => {
    const since = T - 12 * 60_000;
    const snap = buildSnapshot([], { phase: 'awaiting-money', target: { aug: 'x', faction: 'y', livePrice: 1 }, awaitingMoneySince: since }, T);
    expect(snap.nextAug.awaitingSince).toBe(since);
    expect(snap.nextAug.waitingMs).toBe(12 * 60_000);
  });

  it('awaiting-money without a stamp (pre-Phase-32 state / not-yet-written) leaves waiting null', () => {
    const snap = buildSnapshot([], { phase: 'awaiting-money', target: { aug: 'x', faction: 'y', livePrice: 1 } }, T);
    expect(snap.nextAug.awaitingSince).toBeNull();
    expect(snap.nextAug.waitingMs).toBeNull();
  });

  it('income.trend is null right after a node-reset-cleared series (sub-2-window history)', () => {
    const s = [{ t: T, gangCum: 100, hackingCum: 50, mHacking: 1 }];
    const snap = buildSnapshot(s, null, T);
    expect(snap.income.trend).toBeNull();
  });
});
