// Unit tests for src/goallog.js's pure helpers (Phase 32): the cumulative-
// series rate primitive, the trend comparator built on it, and the snapshot
// assembler dashboard.js's GOAL panel reads.
import { describe, it, expect } from 'vitest';
import {
  computeRateRange,
  computeTrend,
  buildSnapshot,
  evalTripwire,
  evalStuck,
  M_TARGET,
  M_TARGET_LABEL,
  M_GATE_TARGET,
  RATE_WINDOW_MS,
  FLAT_WINDOW_MS,
  INCOME_WINDOW_24H_MS,
  STUCK_WINDOW_MS,
  STUCK_INCOME_FLOOR,
  BOUNDARY_GRACE_MS,
  DAEMON_STATUS_STALE_MS,
  computeForecast,
  FORECAST_MIN_SPAN_MS,
  AUG_STATE_STALE_MS,
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
    expect(snap.mProgress).toEqual({ value: 1.51, target: M_TARGET, targetLabel: M_TARGET_LABEL, pct: Math.round((1.51 / M_TARGET) * 100), gateTarget: M_GATE_TARGET, queuedValue: null, queuedPct: null, queuedCount: null });
  });

  it('mProgress: projects post-install M from augState.queuedGain (purchased-not-installed augs)', () => {
    const s = [{ t: T, gangCum: 0, hackingCum: 0, mHacking: 1.5 }];
    const snap = buildSnapshot(s, { queuedGain: 2, queuedCount: 9 }, T);
    expect(snap.mProgress.queuedValue).toBe(3); // 1.5 x 2
    expect(snap.mProgress.queuedPct).toBe(Math.round((3 / M_TARGET) * 100));
    expect(snap.mProgress.queuedCount).toBe(9);
  });

  it('mProgress: queued projection is null when augState lacks queuedGain', () => {
    const s = [{ t: T, gangCum: 0, hackingCum: 0, mHacking: 1.5 }];
    const snap = buildSnapshot(s, { phase: 'grinding' }, T);
    expect(snap.mProgress.queuedValue).toBeNull();
    expect(snap.mProgress.queuedPct).toBeNull();
    expect(snap.mProgress.queuedCount).toBeNull();
  });

  it('includes the tripwire status in the snapshot', () => {
    const snap = buildSnapshot([{ t: T, gangCum: 0, hackingCum: 0, mHacking: 1.51 }], null, T);
    expect(snap.tripwire).toBeDefined();
    expect(snap.tripwire.status).toBe('WARMING'); // single sample -> not enough span
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

  it('nextAug is withheld when augfarmer-state is stale (farmer not running)', () => {
    // Regression: BN6.1 entry showed a 4.6h-stale BN5 target as if it were live,
    // because augfarmer needs 64.10 GB and a fresh node's home is 32 GB.
    const target = { aug: 'NeuroFlux Governor', faction: 'Tian Di Hui', livePrice: 8.5e9 };
    const stale = { timestamp: T - AUG_STATE_STALE_MS - 1, target, phase: 'awaiting-money', awaitingMoneySince: T - 5 * 3_600_000 };
    const snap = buildSnapshot([], stale, T);
    expect(snap.nextAug).toBeNull();
    expect(snap.augStateStale).toBe(true);
  });

  it('nextAug is reported normally when augfarmer-state is fresh', () => {
    const target = { aug: 'BitWire', faction: 'CyberSec', livePrice: 1e6 };
    const fresh = { timestamp: T - AUG_STATE_STALE_MS + 1000, target, phase: 'grinding' };
    const snap = buildSnapshot([], fresh, T);
    expect(snap.nextAug).not.toBeNull();
    expect(snap.nextAug.aug).toBe('BitWire');
    expect(snap.augStateStale).toBe(false);
  });

  it('augStateStale is null (not false) when there is no timestamp to judge', () => {
    // A missing file and a dead farmer are different problems -- null means
    // "cannot tell", which the dashboard renders as "none", not "stale".
    expect(buildSnapshot([], null, T).augStateStale).toBeNull();
    expect(buildSnapshot([], { target: { aug: 'x' } }, T).augStateStale).toBeNull();
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

  // Phase 35 WI3 (D6): the trailing-24h income signal resourcemanager.js's
  // opener rule reads.
  it('income.perSec24h: computed over the full 24h window, not RATE_WINDOW_MS', () => {
    const s = [
      { t: T, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: T + INCOME_WINDOW_24H_MS, gangCum: 864_000, hackingCum: 0, mHacking: 1 }, // 10/s over 24h
    ];
    const snap = buildSnapshot(s, null, T + INCOME_WINDOW_24H_MS);
    expect(snap.income.perSec24h).toBeCloseTo(10, 6);
  });

  it('income.perSec24h is null on sub-2-sample or node-reset-cleared history, same convention as perSec', () => {
    const s = [{ t: T, gangCum: 100, hackingCum: 50, mHacking: 1 }];
    expect(buildSnapshot(s, null, T).income.perSec24h).toBeNull();
  });
});

describe('evalStuck (Phase 35 WI6/D6/D12)', () => {
  const NOW = 2_000_000_000;
  const H = 3_600_000;
  const BOUNDARY_WINDOW_MS = 16 * H; // mirrors goallog.js's own (unexported) constant

  function healthySeries(nowMs, spanMs = 3 * H) {
    // gangCum grows steadily -> a real, healthy $/sec across the recent window.
    return [
      { t: nowMs - spanMs, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: nowMs, gangCum: spanMs / 1000, hackingCum: 0, mHacking: 1 }, // 1 $/s average
    ];
  }

  function deadSeries(nowMs, totalSpanMs = 3 * H) {
    // Flat totals ACROSS THE RECENT STUCK_WINDOW_MS window -> $0/s (well
    // under STUCK_INCOME_FLOOR) -- two points bracket that window so
    // computeRateRange has >=2 in-range samples, plus an older point purely
    // to establish the overall series span for rule 1.
    return [
      { t: nowMs - totalSpanMs, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: nowMs - STUCK_WINDOW_MS, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: nowMs, gangCum: 0, hackingCum: 0, mHacking: 1 },
    ];
  }

  function shortSeries(nowMs, spanMs) {
    return [
      { t: nowMs - spanMs, gangCum: 0, hackingCum: 0, mHacking: 1 },
      { t: nowMs, gangCum: 0, hackingCum: 0, mHacking: 1 },
    ];
  }

  const freshDaemonStatus = (over = {}) => ({
    timestamp: NOW,
    fleet: { utilizationPct: 0 },
    warns: { skipServers: [] },
    members: [],
    ...over,
  });

  it('WARMING: empty series', () => {
    expect(evalStuck({ series: [], daemonStatus: freshDaemonStatus(), financeState: null, boundaryStartMs: null, nowMs: NOW })).toEqual({
      status: 'WARMING',
      reason: null,
    });
  });

  it('WARMING: series span < STUCK_WINDOW_MS', () => {
    const series = shortSeries(NOW, STUCK_WINDOW_MS - 1000);
    expect(evalStuck({ series, daemonStatus: freshDaemonStatus(), financeState: null, boundaryStartMs: null, nowMs: NOW }).status).toBe('WARMING');
  });

  it('BOUNDARY: boundaryStartMs within BOUNDARY_GRACE_MS -- alerting inside the window is noise', () => {
    const series = deadSeries(NOW);
    const result = evalStuck({ series, daemonStatus: freshDaemonStatus(), financeState: null, boundaryStartMs: NOW - H, nowMs: NOW });
    expect(result).toEqual({ status: 'BOUNDARY', reason: null });
  });

  it('daemon-dead: daemonStatus is null', () => {
    const series = healthySeries(NOW);
    const result = evalStuck({ series, daemonStatus: null, financeState: null, boundaryStartMs: null, nowMs: NOW });
    expect(result).toEqual({ status: 'STUCK', reason: 'daemon-dead' });
  });

  it('daemon-dead: daemonStatus.timestamp older than DAEMON_STATUS_STALE_MS', () => {
    const series = healthySeries(NOW);
    const stale = freshDaemonStatus({ timestamp: NOW - DAEMON_STATUS_STALE_MS - 1 });
    const result = evalStuck({ series, daemonStatus: stale, financeState: null, boundaryStartMs: null, nowMs: NOW });
    expect(result).toEqual({ status: 'STUCK', reason: 'daemon-dead' });
  });

  it('starved: skipServers non-empty + low utilization', () => {
    const series = deadSeries(NOW);
    const daemonStatus = freshDaemonStatus({ warns: { skipServers: ['n00dles'] }, fleet: { utilizationPct: 2 } });
    const result = evalStuck({ series, daemonStatus, financeState: null, boundaryStartMs: null, nowMs: NOW });
    expect(result).toEqual({ status: 'STUCK', reason: 'starved' });
  });

  it('reservation-pin: available === 0 + an aged (> STUCK_WINDOW_MS) reservation -- fires regardless of utilization', () => {
    const series = deadSeries(NOW);
    const daemonStatus = freshDaemonStatus({ fleet: { utilizationPct: 80 } }); // high utilization -- would suppress starved/idle
    const financeState = { available: 0, reservations: [{ key: 'next-port-opener', since: NOW - STUCK_WINDOW_MS - 1000 }] };
    const result = evalStuck({ series, daemonStatus, financeState, boundaryStartMs: null, nowMs: NOW });
    expect(result).toEqual({ status: 'STUCK', reason: 'reservation-pin' });
  });

  it('reservation-pin does NOT fire when the reservation is younger than STUCK_WINDOW_MS', () => {
    const series = deadSeries(NOW);
    const daemonStatus = freshDaemonStatus({ fleet: { utilizationPct: 80 } });
    const financeState = { available: 0, reservations: [{ key: 'next-port-opener', since: NOW - 1000 }] };
    const result = evalStuck({ series, daemonStatus, financeState, boundaryStartMs: null, nowMs: NOW });
    expect(result.status).toBe('OK');
  });

  it('idle: zero batches in flight + low utilization (catch-all dead)', () => {
    const series = deadSeries(NOW);
    const daemonStatus = freshDaemonStatus({ members: [{ server: 'a', batchesInFlight: 0 }], fleet: { utilizationPct: 1 } });
    const result = evalStuck({ series, daemonStatus, financeState: null, boundaryStartMs: null, nowMs: NOW });
    expect(result).toEqual({ status: 'STUCK', reason: 'idle' });
  });

  it('boundary-overrun: a dead signature past grace but still within BOUNDARY_WINDOW_MS renames the reason', () => {
    const series = deadSeries(NOW);
    const daemonStatus = freshDaemonStatus({ members: [{ server: 'a', batchesInFlight: 0 }], fleet: { utilizationPct: 1 } });
    const boundaryStartMs = NOW - (BOUNDARY_GRACE_MS + H); // past grace, well within the 16h window
    const result = evalStuck({ series, daemonStatus, financeState: null, boundaryStartMs, nowMs: NOW });
    expect(result).toEqual({ status: 'STUCK', reason: 'boundary-overrun' });
  });

  it('past BOUNDARY_WINDOW_MS entirely, a dead signature reports its real name, not boundary-overrun', () => {
    const series = deadSeries(NOW);
    const daemonStatus = freshDaemonStatus({ members: [{ server: 'a', batchesInFlight: 0 }], fleet: { utilizationPct: 1 } });
    const boundaryStartMs = NOW - (BOUNDARY_WINDOW_MS + H);
    const result = evalStuck({ series, daemonStatus, financeState: null, boundaryStartMs, nowMs: NOW });
    expect(result).toEqual({ status: 'STUCK', reason: 'idle' });
  });

  it('OK: healthy income, whatever the fleet state', () => {
    const series = healthySeries(NOW);
    const result = evalStuck({ series, daemonStatus: freshDaemonStatus(), financeState: null, boundaryStartMs: null, nowMs: NOW });
    expect(result).toEqual({ status: 'OK', reason: null });
  });

  describe('must-not-fire fixtures', () => {
    it('a synthetic prep window (high utilization, ~$0 income) reads OK, not STUCK', () => {
      const series = deadSeries(NOW);
      const daemonStatus = freshDaemonStatus({ members: [{ server: 'a', batchesInFlight: 3 }], fleet: { utilizationPct: 95 } });
      const result = evalStuck({ series, daemonStatus, financeState: { available: 5000, reservations: [] }, boundaryStartMs: null, nowMs: NOW });
      expect(result).toEqual({ status: 'OK', reason: null });
    });

    it('the boundary window inside grace reads BOUNDARY even with $0 income, never STUCK', () => {
      const series = deadSeries(NOW);
      const daemonStatus = freshDaemonStatus({ members: [{ server: 'a', batchesInFlight: 0 }], fleet: { utilizationPct: 0 } });
      const result = evalStuck({ series, daemonStatus, financeState: null, boundaryStartMs: NOW - H, nowMs: NOW });
      expect(result.status).toBe('BOUNDARY');
    });

    // major-2 pin: a series GAP inside the recent window makes computeRateRange
    // return null -- `null < STUCK_INCOME_FLOOR` coerces true in JS, which
    // would misread a gap as a below-floor income without this guard.
    it('null-income-from-a-series-gap reads OK, never STUCK', () => {
      const series = [
        { t: NOW - 3 * H, gangCum: 0, hackingCum: 0, mHacking: 1 }, // outside the recent STUCK_WINDOW_MS window
        { t: NOW, gangCum: 0, hackingCum: 0, mHacking: 1 }, // the only point inside it -> computeRateRange returns null
      ];
      const daemonStatus = freshDaemonStatus({ members: [{ server: 'a', batchesInFlight: 0 }], fleet: { utilizationPct: 0 } });
      const result = evalStuck({ series, daemonStatus, financeState: null, boundaryStartMs: null, nowMs: NOW });
      expect(result).toEqual({ status: 'OK', reason: null });
    });

    // major-1 pin: null boundaryStartMs skips BOTH the grace rule and the
    // boundary-overrun relabeling -- a dead signature reports its real name.
    it('null boundaryStartMs skips the boundary rules entirely', () => {
      const series = deadSeries(NOW);
      const daemonStatus = freshDaemonStatus({ members: [{ server: 'a', batchesInFlight: 0 }], fleet: { utilizationPct: 0 } });
      const result = evalStuck({ series, daemonStatus, financeState: null, boundaryStartMs: null, nowMs: NOW });
      expect(result).toEqual({ status: 'STUCK', reason: 'idle' });
      expect(evalStuck({ series, daemonStatus, financeState: null, boundaryStartMs: undefined, nowMs: NOW })).toEqual({
        status: 'STUCK',
        reason: 'idle',
      });
    });
  });
});

describe('buildSnapshot liveness passthrough (Phase 35 WI6)', () => {
  const T2 = 3_000_000_000;

  it('four-arg call carries the liveness block through verbatim', () => {
    const liveness = { status: 'STUCK', reason: 'idle', sinceMs: T2 - 1000, boundaryStartMs: null };
    const snap = buildSnapshot([{ t: T2, gangCum: 0, hackingCum: 0, mHacking: 1 }], null, T2, liveness);
    expect(snap.liveness).toBe(liveness);
  });

  it('three-arg back-compat: liveness defaults to null', () => {
    const snap = buildSnapshot([{ t: T2, gangCum: 0, hackingCum: 0, mHacking: 1 }], null, T2);
    expect(snap.liveness).toBeNull();
  });
});

describe('evalTripwire (GP2)', () => {
  const H = 3_600_000;

  it('UNKNOWN on an empty series', () => {
    expect(evalTripwire([], T)).toEqual({ status: 'UNKNOWN', flatHours: null });
  });

  it('WARMING until there is >=11h of history', () => {
    const s = [{ t: T, mHacking: 1.5 }, { t: T + 5 * H, mHacking: 1.5 }]; // only 5h span
    expect(evalTripwire(s, T + 5 * H).status).toBe('WARMING');
  });

  it('ON TRACK when M grew across a full 12h window', () => {
    const start = T;
    const s = [{ t: start, mHacking: 1.5 }, { t: start + FLAT_WINDOW_MS, mHacking: 2.0 }];
    expect(evalTripwire(s, start + FLAT_WINDOW_MS).status).toBe('ON TRACK');
  });

  it('STALLED when M is flat across a full 12h window', () => {
    const start = T;
    const s = [{ t: start, mHacking: 1.51 }, { t: start + FLAT_WINDOW_MS, mHacking: 1.51 }];
    const r = evalTripwire(s, start + FLAT_WINDOW_MS);
    expect(r.status).toBe('STALLED');
    expect(r.flatHours).toBe(12);
  });

  it('references the oldest sample WITHIN the window, not the whole series, so an old jump does not mask a recent stall', () => {
    const start = T;
    // M jumped 24h ago but has been flat for the last 12h -> STALLED.
    const s = [
      { t: start, mHacking: 1.0 },
      { t: start + 12 * H, mHacking: 5.0 }, // the jump, 12h into the series
      { t: start + 24 * H, mHacking: 5.0 }, // flat since
    ];
    expect(evalTripwire(s, start + 24 * H).status).toBe('STALLED');
  });
});

describe('computeForecast', () => {
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  const pt = (t, mHacking, hackingCum = 0) => ({ t, mHacking, gangCum: 0, hackingCum });

  it('WARMING below FORECAST_MIN_SPAN_MS -- a fresh series is not judged', () => {
    const s = [pt(T, 1.28), pt(T + FORECAST_MIN_SPAN_MS - 1, 1.5)];
    const r = computeForecast(s, T + FORECAST_MIN_SPAN_MS - 1);
    expect(r.status).toBe('WARMING');
    expect(r.daysToGate).toBeNull();
  });

  it('WARMING on an empty or single-sample series', () => {
    expect(computeForecast([], T).status).toBe('WARMING');
    expect(computeForecast([pt(T, 1.28)], T).status).toBe('WARMING');
    expect(computeForecast(null, T).status).toBe('WARMING');
  });

  it('projects days-to-gate from the observed dM/dt', () => {
    // M climbs 1.0 point across exactly 1 day -> 1.0 M/day.
    const s = [pt(T, 2.0), pt(T + DAY, 3.0)];
    const r = computeForecast(s, T + DAY);
    expect(r.status).toBe('OK');
    expect(r.mPerDay).toBeCloseTo(1.0, 6);
    expect(r.mRemaining).toBeCloseTo(M_TARGET - 3.0, 6);
    expect(r.daysToGate).toBeCloseTo(M_TARGET - 3.0, 6);
    expect(r.etaMs).toBeCloseTo((M_TARGET - 3.0) * DAY, 0);
    expect(r.basisHours).toBe(24);
  });

  it('STALLED (not Infinity) when the span is long enough but M never moved', () => {
    const s = [pt(T, 1.41), pt(T + 48 * HOUR, 1.41)];
    const r = computeForecast(s, T + 48 * HOUR);
    expect(r.status).toBe('STALLED');
    // "no measurement" is not "infinitely far" -- the distinction the
    // primary number exists to preserve.
    expect(r.daysToGate).toBeNull();
    expect(r.etaMs).toBeNull();
    expect(r.mRemaining).toBeCloseTo(M_TARGET - 1.41, 6);
  });

  it('REACHED at or past the target', () => {
    const s = [pt(T, M_TARGET), pt(T + 48 * HOUR, M_TARGET + 0.5)];
    const r = computeForecast(s, T + 48 * HOUR);
    expect(r.status).toBe('REACHED');
    expect(r.daysToGate).toBe(0);
    expect(r.mRemaining).toBe(0);
  });

  it('derives $-per-M-point and money-remaining from the same span', () => {
    // $2b earned across a 1.0-point M gain -> $2b per M point.
    const s = [pt(T, 2.0, 0), pt(T + DAY, 3.0, 2e9)];
    const r = computeForecast(s, T + DAY);
    expect(r.dollarsPerMPoint).toBeCloseTo(2e9, 0);
    expect(r.moneyRemaining).toBeCloseTo(2e9 * (M_TARGET - 3.0), 0);
  });

  it('leaves the money cross-check null when cumulative money did not advance', () => {
    const s = [pt(T, 2.0, 5e9), pt(T + DAY, 3.0, 5e9)];
    const r = computeForecast(s, T + DAY);
    expect(r.status).toBe('OK');
    expect(r.daysToGate).not.toBeNull(); // primary still works -- it is model-free
    expect(r.dollarsPerMPoint).toBeNull();
    expect(r.moneyRemaining).toBeNull();
  });

  it('reproduces the live BN5 reading that motivated the field', () => {
    // MEASURED EVIDENCE, do not edit: M 1.28 -> 1.4126 across 54h of BN5.1 node
    // time (2026-07-26). The fixture is the measurement; daysToGate is derived
    // from it AND from M_TARGET, so the projection moves when the node's target
    // moves while the evidence below stays fixed.
    //   - Under BN5's target (M_TARGET 9.7) this read ~152 days -- the original
    //     headline: months, not that plan's 1.5-3 weeks.
    //   - Under BN6's fallback target (M_TARGET 30) the same rate reads ~485
    //     days, which is precisely why BN6 is not being cleared by the hacking
    //     path (docs/bn6-playbook.md §1).
    // Asserted against the live constant so this test tracks retargets instead
    // of silently rotting, while the two readings above preserve both verdicts.
    const s = [pt(T, 1.28, 81e6), pt(T + 54 * HOUR, 1.4126, 1.835e9)];
    const r = computeForecast(s, T + 54 * HOUR);
    expect(r.status).toBe('OK');
    const mPerDay = (1.4126 - 1.28) / (54 / 24);
    expect(r.mPerDay).toBeCloseTo(mPerDay, 6);
    // The rate is so slow that the projection is months under ANY target we've
    // held -- that, not a specific day count, is the durable conclusion.
    expect(r.daysToGate).toBeCloseTo((M_TARGET - 1.4126) / mPerDay, 4);
    expect(r.daysToGate).toBeGreaterThan(100);
  });

  it('is surfaced on the snapshot', () => {
    const s = [pt(T, 2.0, 0), pt(T + DAY, 3.0, 2e9)];
    const snap = buildSnapshot(s, null, T + DAY);
    expect(snap.forecast.status).toBe('OK');
    expect(snap.forecast.daysToGate).toBeCloseTo(M_TARGET - 3.0, 6);
  });
});
