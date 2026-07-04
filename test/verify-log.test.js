// Codified acceptance criteria (spec: "Automated verification" -> "Log
// checker"). Reads a REAL exported session log -- run via `npm run
// verify:log`, not `npm test` (see vitest.config.ts's exclude and this
// project's own vitest.verify.config.ts). Path overridable via
// DAEMON_LOG_PATH; defaults to logs/daemon-batch-log.json (repo-relative).
//
// Hard assertions fail the run. Soft reports only print -- they're
// phase-of-game dependent (early-run leveling churns legitimately), so they
// inform rather than gate.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LOG_PATH = process.env.DAEMON_LOG_PATH ?? path.join(process.cwd(), 'logs', 'daemon-batch-log.json');

let entries;

beforeAll(() => {
  if (!fs.existsSync(LOG_PATH)) {
    throw new Error(`No log found at ${LOG_PATH} -- export a real session first (or set DAEMON_LOG_PATH).`);
  }
  entries = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));

  // Old-format logs (review finding): the daemon rewrites the file wholesale
  // from an in-memory buffer that starts empty, so mixed-format files can't
  // exist -- fail fast with a clear message instead of partially validating
  // a pre-Phase-4 log.
  const hasEventField = entries.length === 0 || entries.every((e) => typeof e.event === 'string');
  const hasStartupMode = entries.some((e) => e.event === 'mode');
  if (!hasEventField || !hasStartupMode) {
    throw new Error('This looks like a pre-Phase-4 log (missing `event` field or a startup `mode` event) -- re-export from a new session.');
  }
});

function orderingKey(e) {
  return e.event === 'skip' ? e.firstTimestamp : e.timestamp;
}

function latestConfigAsOf(index) {
  for (let i = index; i >= 0; i--) {
    if (entries[i].event === 'mode') return entries[i].config;
  }
  return null;
}

describe('log format', () => {
  it('every event has a valid event type', () => {
    const validTypes = new Set(['batch', 'skip', 'flip', 'mode', 'xcheck']);
    for (const e of entries) {
      expect(validTypes.has(e.event), `unknown event type: ${e.event}`).toBe(true);
    }
  });

  it('every event has the fields this spec assigns it', () => {
    for (const e of entries) {
      switch (e.event) {
        case 'batch':
          expect(e).toMatchObject({
            time: expect.any(String),
            timestamp: expect.any(Number),
            batchTarget: expect.any(String),
            prepped: expect.any(Boolean),
            security: { current: expect.any(Number), min: expect.any(Number) },
            money: { current: expect.any(Number), max: expect.any(Number) },
            batchesInFlight: expect.any(Number),
            totalBatchesSkipped: expect.any(Number),
            totalBatchesShrunk: expect.any(Number),
            failedLaunches: expect.any(Number),
            pipeline: {
              depth: expect.any(Number),
              reserveGb: expect.any(Number),
              commitmentPct: expect.any(Number),
              waterfallAvailableGb: expect.any(Number),
            },
            utilizationPct: expect.any(Number),
            batch: { id: expect.any(Number), hackFraction: expect.any(Number), hackChance: expect.any(Number), expectedSteal: expect.any(Number) },
          });
          break;
        case 'skip':
          expect(e).toMatchObject({
            time: expect.any(String),
            firstTimestamp: expect.any(Number),
            lastTimestamp: expect.any(Number),
            count: expect.any(Number),
            batchTarget: expect.any(String),
            saturated: expect.any(Boolean),
            batchesInFlight: expect.any(Number),
            pipeline: expect.any(Object),
            utilizationPct: expect.any(Number),
          });
          break;
        case 'flip':
          expect(e).toMatchObject({
            time: expect.any(String),
            timestamp: expect.any(Number),
            from: expect.any(String),
            to: expect.any(String),
            commitmentPct: expect.any(Number),
          });
          expect(e.fromScore === null || typeof e.fromScore === 'number').toBe(true);
          expect(e.toScore === null || typeof e.toScore === 'number').toBe(true);
          break;
        case 'mode':
          expect(e).toMatchObject({
            time: expect.any(String),
            timestamp: expect.any(Number),
            formulas: expect.any(Boolean),
            forcedLegacy: expect.any(Boolean),
            config: {
              HACK_FRACTION: expect.any(Number),
              GROW_BUFFER: expect.any(Number),
              WEAKEN_BUFFER: expect.any(Number),
              DRIFT_SEC_EPSILON: expect.any(Number),
              DRIFT_MONEY_FRACTION: expect.any(Number),
              RANK_HYSTERESIS: expect.any(Number),
              BATCH_INTERVAL_MS: expect.any(Number),
            },
          });
          break;
        case 'xcheck':
          expect(e).toMatchObject({
            time: expect.any(String),
            timestamp: expect.any(Number),
            target: expect.any(String),
            field: expect.any(String),
            soft: expect.any(Boolean),
          });
          break;
      }
    }
  });
});

describe('hard assertions', () => {
  it('timestamps are monotonic across the log (firstTimestamp for coalesced skips)', () => {
    for (let i = 1; i < entries.length; i++) {
      expect(orderingKey(entries[i]), `entry ${i} (${entries[i].event}) out of order`).toBeGreaterThanOrEqual(orderingKey(entries[i - 1]));
    }
  });

  it('totalBatchesSkipped and totalBatchesShrunk never decrease', () => {
    const batches = entries.filter((e) => e.event === 'batch');
    for (let i = 1; i < batches.length; i++) {
      expect(batches[i].totalBatchesSkipped).toBeGreaterThanOrEqual(batches[i - 1].totalBatchesSkipped);
      expect(batches[i].totalBatchesShrunk).toBeGreaterThanOrEqual(batches[i - 1].totalBatchesShrunk);
    }
  });

  it('every batch event\'s hackFraction matches the log\'s own recorded HACK_FRACTION, unless bootstrapping', () => {
    entries.forEach((e, i) => {
      if (e.event !== 'batch') return;
      const config = latestConfigAsOf(i);
      expect(config, `batch at index ${i} has no preceding mode event to validate against`).not.toBeNull();
      if (e.batch.hackFraction === config.HACK_FRACTION) return;
      // Sub-fraction is only legitimate bootstrap behavior when the pipeline
      // was empty before this launch (batchesInFlight === 1, i.e. just the
      // one this record is reporting) -- a shrink against a non-empty
      // pipeline is the ratchet signature Phase 3 closed, a real failure.
      expect(
        e.batchesInFlight,
        `batch at index ${i} shrunk to ${e.batch.hackFraction} with a non-empty pipeline (batchesInFlight=${e.batchesInFlight}) -- ratchet regression`
      ).toBeLessThanOrEqual(1);
    });
  });

  it('skip coalescing is well-formed', () => {
    for (const e of entries) {
      if (e.event !== 'skip') continue;
      expect(e.count).toBeGreaterThanOrEqual(1);
      expect(e.firstTimestamp).toBeLessThanOrEqual(e.lastTimestamp);
    }
  });

  it('has zero hard xcheck events (soft grow mismatches are reported, not gated)', () => {
    const hardMismatches = entries.filter((e) => e.event === 'xcheck' && e.soft !== true);
    expect(hardMismatches, JSON.stringify(hardMismatches, null, 2)).toEqual([]);
  });
});

describe('soft reports', () => {
  it('prints flip rate, skip breakdown, shrink delta, and drift-window reserve behavior', () => {
    const batches = entries.filter((e) => e.event === 'batch');
    const flips = entries.filter((e) => e.event === 'flip');
    const skips = entries.filter((e) => e.event === 'skip');
    const xchecks = entries.filter((e) => e.event === 'xcheck');

    console.log('\n--- verify-log soft reports ---');

    if (entries.length > 0) {
      const windowMs = orderingKey(entries[entries.length - 1]) - orderingKey(entries[0]);
      const windowHours = windowMs / 3_600_000;
      const flipsPerHour = windowHours > 0 ? flips.length / windowHours : 0;
      console.log(`flips: ${flips.length} over ${(windowMs / 60000).toFixed(1)} min (${flipsPerHour.toFixed(1)}/hr; baseline to beat: 14 / 12.7 min)`);
      for (const f of flips) {
        console.log(`  ${f.time} ${f.from} -> ${f.to} | abandoned ${f.commitmentPct.toFixed(1)}% commitment`);
      }
    }

    const skipCount = skips.reduce((sum, s) => sum + s.count, 0);
    const saturatedCount = skips.filter((s) => s.saturated).reduce((sum, s) => sum + s.count, 0);
    console.log(`skips: ${skipCount} total (${saturatedCount} saturated, ${skipCount - saturatedCount} empty-pipeline)`);

    if (batches.length > 0) {
      const shrinkDelta = batches[batches.length - 1].totalBatchesShrunk - batches[0].totalBatchesShrunk;
      console.log(`shrunk-launch delta over window: ${shrinkDelta}`);
    }

    const preppedReserves = batches.filter((b) => b.prepped).map((b) => b.pipeline.reserveGb);
    const driftedReserves = batches.filter((b) => !b.prepped).map((b) => b.pipeline.reserveGb);
    if (preppedReserves.length > 0 && driftedReserves.length > 0) {
      const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
      console.log(
        `reserve across drift windows: prepped avg ${avg(preppedReserves).toFixed(1)}GB (n=${preppedReserves.length}) vs ` +
          `drifted avg ${avg(driftedReserves).toFixed(1)}GB (n=${driftedReserves.length}) -- should sit near each other, not balloon`
      );
    }

    const softXchecks = xchecks.filter((e) => e.soft === true);
    console.log(`soft (grow) xcheck mismatches: ${softXchecks.length}`);

    expect(true).toBe(true); // this block only reports; it never fails
  });
});
