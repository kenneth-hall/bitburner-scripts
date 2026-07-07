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
import { checkShareCap, checkBudgetInvariant, checkFractionConsistency, checkNaturalExit, checkNoStall, dropPreConfigStragglers } from './verify-log-checks.js';

const LOG_PATH = process.env.DAEMON_LOG_PATH ?? path.join(process.cwd(), 'logs', 'daemon-batch-log.json');

let entries;

beforeAll(() => {
  if (!fs.existsSync(LOG_PATH)) {
    throw new Error(`No log found at ${LOG_PATH} -- export a real session first (or set DAEMON_LOG_PATH).`);
  }

  const raw = fs.readFileSync(LOG_PATH, 'utf8');
  // The daemon rewrites the file wholesale (JSON.stringify of the whole
  // buffer); the auto-download can catch it mid-rewrite, producing a
  // truncated, unparseable file (observed 2026-07-04) -- a clear message
  // beats a raw JSON.parse stack trace.
  try {
    entries = JSON.parse(raw);
  } catch {
    throw new Error('Log truncated mid-export -- restart the dev server / re-export and retry.');
  }

  // Old-format logs (review finding): the daemon rewrites the file wholesale
  // from an in-memory buffer that starts empty, so mixed-format files can't
  // exist -- fail fast with a clear message instead of partially validating
  // a pre-Phase-4 log.
  const hasEventField = entries.length === 0 || entries.every((e) => typeof e.event === 'string');
  const hasStartupMode = entries.some((e) => e.event === 'mode');
  if (!hasEventField || !hasStartupMode) {
    throw new Error('This looks like a pre-Phase-4 log (missing `event` field or a startup `mode` event) -- re-export from a new session.');
  }

  // Phase 7 (multi-target) is detected by the presence of at least one
  // `snapshot` event -- a v1/pre-Phase-7 log has none, and its `flip`
  // events/missing memberCount would fail the v2 checks below in confusing
  // ways rather than a clear "wrong log version" message.
  const hasSnapshot = entries.some((e) => e.event === 'snapshot');
  if (!hasSnapshot) {
    throw new Error('This looks like a pre-Phase-7 log (no `snapshot` event) -- re-export from a new multi-target session.');
  }

  // Opt-in (Phase 9): a boundary copy can carry leftover entries from the
  // previous window whose own `mode` event already aged out of the ring --
  // config-dependent checks then hard-fail on "no preceding mode event", a
  // mixed-window export artifact, not a code defect. Off by default so a
  // normal single-window log is validated in full.
  if (process.env.VERIFY_SLICE_STRAGGLERS === '1') {
    entries = dropPreConfigStragglers(entries);
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
    const validTypes = new Set(['batch', 'skip', 'enter', 'exit', 'mode', 'snapshot', 'xcheck']);
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
            memberCount: expect.any(Number),
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
        case 'enter':
          expect(e).toMatchObject({
            time: expect.any(String),
            timestamp: expect.any(Number),
            server: expect.any(String),
            score: expect.any(Number),
            displaced: expect.any(Array),
            prepped: expect.any(Boolean),
          });
          break;
        case 'exit':
          expect(e).toMatchObject({
            time: expect.any(String),
            timestamp: expect.any(Number),
            server: expect.any(String),
            batchesInFlight: expect.any(Number),
            inFlightRamGb: expect.any(Number),
            commitmentPct: expect.any(Number),
          });
          expect(['displaced', 'unaffordable', 'ineligible'], `exit for ${e.server} has unknown reason: ${e.reason}`).toContain(e.reason);
          break;
        case 'snapshot':
          expect(e).toMatchObject({
            time: expect.any(String),
            timestamp: expect.any(Number),
            utilizationPct: expect.any(Number),
            budgetGb: expect.any(Number),
            batchBudgetGb: expect.any(Number),
            waterfallFreeGb: expect.any(Number),
            memberCount: expect.any(Number),
            candidateCount: expect.any(Number),
            members: expect.any(Array),
            hackingLevel: expect.any(Number),
          });
          for (const m of e.members) {
            expect(m).toMatchObject({
              server: expect.any(String),
              score: expect.any(Number),
              prepped: expect.any(Boolean),
              batchesInFlight: expect.any(Number),
              depth: expect.any(Number),
              pipelineCostGb: expect.any(Number),
              inFlightRamGb: expect.any(Number),
              reserveGb: expect.any(Number),
              commitmentPct: expect.any(Number),
              floor: expect.any(Boolean),
            });
          }
          for (const d of e.draining ?? []) {
            expect(d).toMatchObject({ server: expect.any(String), batchesInFlight: expect.any(Number), inFlightRamGb: expect.any(Number) });
          }
          expect(e.sharePool).toMatchObject({
            targetGb: expect.any(Number),
            inFlightRamGb: expect.any(Number),
            threads: expect.any(Number),
            sharePower: expect.any(Number),
          });
          // attainedPct is null at targetGb === 0 (see the spec's 0-target
          // case) -- expect.any(Number) can't express "number or null".
          expect(
            typeof e.sharePool.attainedPct === 'number' || e.sharePool.attainedPct === null,
            `snapshot at ${e.time} has a non-number, non-null sharePool.attainedPct`
          ).toBe(true);
          break;
        case 'mode':
          expect(e).toMatchObject({
            time: expect.any(String),
            timestamp: expect.any(Number),
            formulas: expect.any(Boolean),
            forcedLegacy: expect.any(Boolean),
            shareFraction: expect.any(Number),
            shareOff: expect.any(Boolean),
            config: {
              HACK_FRACTION: expect.any(Number),
              GROW_BUFFER: expect.any(Number),
              WEAKEN_BUFFER: expect.any(Number),
              DRIFT_SEC_EPSILON: expect.any(Number),
              DRIFT_MONEY_FRACTION: expect.any(Number),
              RANK_HYSTERESIS: expect.any(Number),
              BATCH_INTERVAL_MS: expect.any(Number),
              SHARE_FRACTION: expect.any(Number),
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
  it('timestamps are monotonic across the log (firstTimestamp for coalesced skips; the pinned head mode event is exempt)', () => {
    // trimLog() pins the single most recent `mode` event at index 0 so it
    // survives ring-buffer eviction -- it can legitimately be "older than
    // nothing" since it's always first, so the comparison against index 0
    // is skipped when entries[0] is that pinned record. Every other
    // adjacent pair still has to be non-decreasing.
    const start = entries.length > 0 && entries[0].event === 'mode' ? 2 : 1;
    for (let i = start; i < entries.length; i++) {
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

  it('natural-exit invariant: no batch events and no rising draining counts between an exit and its next enter', () => {
    // "No new batches after exit, drain only" (Phase 9: extracted into
    // checkNaturalExit so the validation table in
    // docs/phases/phase-09-batcher-refactor.md is mechanically countable against
    // logs/phase8-ab/, not hand-derived).
    const violations = checkNaturalExit(entries);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('budget invariant (Phase 8, amended Phase 15): every snapshot keeps aggregate non-floor member cost within batchBudgetGb (not budgetGb -- share\'s carve reduces it), batchBudgetGb never exceeds budgetGb, a floor member never coexists with other members, and memberCount matches the members array', () => {
    const violations = checkBudgetInvariant(entries);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    for (const e of entries) {
      if (e.event !== 'snapshot') continue;
      expect(e.memberCount, `snapshot at ${e.time} has memberCount != members.length`).toBe(e.members.length);
    }
  });

  it('stall invariant (Phase 15): no snapshot has eligible candidates with zero members seated, and candidateCount is always >= memberCount', () => {
    const violations = checkNoStall(entries);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('share-cap invariant: in-flight share RAM never exceeds targetGb by more than one thread, with a 30s decay grace window after a toggle-off', () => {
    const violations = checkShareCap(entries);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('fraction consistency: every snapshot\'s share.targetGb matches the latest preceding mode event\'s shareFraction x budgetGb within 2% relative tolerance', () => {
    const violations = checkFractionConsistency(entries);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('enter/exit sanity: displaced entrants cross-reference a same-tick displaced exit and vice versa', () => {
    const anyModeEvent = entries.find((e) => e.event === 'mode');
    const tickWindowMs = anyModeEvent ? anyModeEvent.config.BATCH_INTERVAL_MS : 1000;
    const enters = entries.filter((e) => e.event === 'enter');
    const exits = entries.filter((e) => e.event === 'exit');

    for (const enter of enters) {
      for (const displacedServer of enter.displaced) {
        const matchingExit = exits.find(
          (ex) => ex.server === displacedServer && ex.reason === 'displaced' && Math.abs(ex.timestamp - enter.timestamp) <= tickWindowMs
        );
        expect(matchingExit, `enter for ${enter.server} lists displaced ${displacedServer} with no matching same-tick displaced exit`).toBeTruthy();
      }
    }

    for (const exit of exits) {
      expect(typeof exit.commitmentPct, `exit for ${exit.server} has a non-numeric commitmentPct`).toBe('number');
      if (exit.reason !== 'displaced') continue;
      const matchingEnter = enters.find(
        (en) => en.displaced.includes(exit.server) && Math.abs(en.timestamp - exit.timestamp) <= tickWindowMs
      );
      expect(matchingEnter, `displaced exit for ${exit.server} has no matching same-tick enter naming it`).toBeTruthy();
    }
  });
});

describe('soft reports', () => {
  it('prints enter/exit rate, utilization + member-count series, skip breakdown, shrink delta, and per-target batch counts', () => {
    const batches = entries.filter((e) => e.event === 'batch');
    const enters = entries.filter((e) => e.event === 'enter');
    const exits = entries.filter((e) => e.event === 'exit');
    const skips = entries.filter((e) => e.event === 'skip');
    const snapshots = entries.filter((e) => e.event === 'snapshot');
    const xchecks = entries.filter((e) => e.event === 'xcheck');

    console.log('\n--- verify-log soft reports ---');

    if (entries.length > 0) {
      const windowMs = orderingKey(entries[entries.length - 1]) - orderingKey(entries[0]);
      const windowHours = windowMs / 3_600_000;
      const exitsPerHour = windowHours > 0 ? exits.length / windowHours : 0;
      // Baseline framing carried over from the pre-Phase-7 single-target
      // daemon's flip rate (8 flips / 9 min there); exits are this phase's
      // successor metric, not a like-for-like count.
      console.log(
        `exits: ${exits.length} / enters: ${enters.length}, over ${(windowMs / 60000).toFixed(1)} min ` +
          `(${exitsPerHour.toFixed(1)} exits/hr; baseline to beat: pre-Phase-7's 8 flips / 9 min)`
      );
      for (const ex of exits) {
        console.log(`  ${ex.time} ${ex.server} exited (${ex.reason}) | ${ex.commitmentPct.toFixed(1)}% commitment draining`);
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

    if (snapshots.length > 0) {
      const utils = snapshots.map((s) => s.utilizationPct);
      const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
      console.log(
        `utilization across ${snapshots.length} snapshot(s): min ${Math.min(...utils).toFixed(1)}% / ` +
          `avg ${avg(utils).toFixed(1)}% / max ${Math.max(...utils).toFixed(1)}% (baseline to beat: 6.3%)`
      );

      const memberCounts = snapshots.map((s) => s.memberCount);
      console.log(
        `member count across snapshots: min ${Math.min(...memberCounts)} / avg ${avg(memberCounts).toFixed(1)} / max ${Math.max(...memberCounts)}`
      );

      // Phase 8: raw utilizationPct now includes share's RAM, so it would
      // read misleadingly high against Phase 7's ~20% baseline -- subtract
      // share's share of budgetGb back out for a like-for-like comparison.
      const shareSnapshots = snapshots.filter((s) => s.sharePool);
      if (shareSnapshots.length > 0) {
        const batchUtils = shareSnapshots.map((s) => s.utilizationPct - (s.sharePool.inFlightRamGb / s.budgetGb) * 100);
        console.log(
          `batch-side utilization (share excluded) across ${shareSnapshots.length} snapshot(s): min ${Math.min(...batchUtils).toFixed(1)}% / ` +
            `avg ${avg(batchUtils).toFixed(1)}% / max ${Math.max(...batchUtils).toFixed(1)}% (baseline to beat: Phase 7's ~20%)`
        );

        const attainedPcts = shareSnapshots.map((s) => s.sharePool.attainedPct).filter((p) => typeof p === 'number');
        if (attainedPcts.length > 0) {
          console.log(
            `share target-attainment across ${attainedPcts.length} snapshot(s): min ${Math.min(...attainedPcts).toFixed(1)}% / ` +
              `avg ${avg(attainedPcts).toFixed(1)}% / max ${Math.max(...attainedPcts).toFixed(1)}%`
          );
        }

        const sharePowers = shareSnapshots.map((s) => s.sharePool.sharePower);
        console.log(
          `sharePower across ${sharePowers.length} snapshot(s): min ${Math.min(...sharePowers).toFixed(3)} / ` +
            `avg ${avg(sharePowers).toFixed(3)} / max ${Math.max(...sharePowers).toFixed(3)}`
        );
      }

      const hackingLevels = snapshots.map((s) => s.hackingLevel).filter((h) => typeof h === 'number');
      if (hackingLevels.length > 0) {
        const first = hackingLevels[0];
        const last = hackingLevels[hackingLevels.length - 1];
        console.log(
          `hackingLevel across ${hackingLevels.length} snapshot(s): first ${first} / last ${last} / ` +
            `min ${Math.min(...hackingLevels)} / max ${Math.max(...hackingLevels)} / delta ${(last - first).toFixed(2)}`
        );
      }
    }

    const batchCountByTarget = new Map();
    for (const b of batches) {
      batchCountByTarget.set(b.batchTarget, (batchCountByTarget.get(b.batchTarget) ?? 0) + 1);
    }
    if (batchCountByTarget.size > 0) {
      console.log('batches per target:');
      for (const [server, count] of [...batchCountByTarget.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${server}: ${count}`);
      }
    }

    const softXchecks = xchecks.filter((e) => e.soft === true);
    console.log(`soft (grow) xcheck mismatches: ${softXchecks.length}`);

    expect(true).toBe(true); // this block only reports; it never fails
  });
});
