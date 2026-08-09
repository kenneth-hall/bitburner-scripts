// Codified acceptance criteria (phase-39-bladeburner-primary.spec.md, T2 + acceptance
// criteria T2/V-series). Run via `npm run verify:log`, not `npm test`
// (vitest.verify.config.ts). Skip-if-missing, matching verify-gang.test.js's convention.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BB_LOG_MAX_ENTRIES, BB_ATTEMPTS_MAX_ENTRIES, BLACKOPS_DAEDALUS_RANK } from '../src/bladeburnermanager.js';

const LOG_DIR = process.env.BLADEBURNER_LOG_DIR ?? path.join(process.cwd(), 'logs');

function readJson(filename) {
  const filePath = path.join(LOG_DIR, filename);
  if (!fs.existsSync(filePath)) return { exists: false, data: null };
  try {
    return { exists: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch {
    throw new Error(`${filename} truncated mid-export -- restart the dev server / re-export and retry.`);
  }
}

function skip(filename) {
  console.log(`\n(skipped: no ${filename} found at ${LOG_DIR} yet -- export a real session first)`);
  expect(true).toBe(true);
}

const RATE_WINDOW_LABELS = ['1h', '24h', 'cumulative'];

describe('bladeburner-state.json (Phase 39)', () => {
  it('parses, carries the S13 fields, and rankPerWallSec/dutyCycle are finite and sane in every window', () => {
    const { exists, data } = readJson('bladeburner-state.json');
    if (!exists) return skip('bladeburner-state.json');

    expect(typeof data.off).toBe('boolean');
    expect(typeof data.holdActive).toBe('boolean');
    expect(data.blackOpsDaedalusRank).toBe(BLACKOPS_DAEDALUS_RANK);
    expect(Number.isFinite(data.timestamp)).toBe(true);

    if (data.off) {
      // Off-marker snapshots carry no rate data -- that's the expected shape.
      return;
    }

    expect(Number.isFinite(data.rank)).toBe(true);
    expect(data.rank).toBeGreaterThanOrEqual(0);
    expect(data.rates).toBeTypeOf('object');
    expect(data.duty).toBeTypeOf('object');
    expect(['A', 'B']).toContain(data.stage);
    expect(typeof data.stageBEnabled).toBe('boolean');

    for (const label of RATE_WINDOW_LABELS) {
      const rate = data.rates?.[label];
      if (!rate) continue; // a window with no samples yet is legitimately absent, not a failure
      expect(Number.isFinite(rate.rankPerWallSec)).toBe(true);
      expect(rate.rankPerWallSec).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(rate.dutyCycle)).toBe(true);
      expect(rate.dutyCycle).toBeGreaterThanOrEqual(0);
      expect(rate.dutyCycle).toBeLessThanOrEqual(1);
    }

    // S13's duty block -- the four exhaustive wall-time buckets.
    if (data.duty && Number.isFinite(data.duty.rankProducingSec)) {
      expect(data.duty.rankProducingSec).toBeGreaterThanOrEqual(0);
      expect(data.duty.overheadSec).toBeGreaterThanOrEqual(0);
      expect(data.duty.yieldedSec).toBeGreaterThanOrEqual(0);
      expect(data.duty.idleSec).toBeGreaterThanOrEqual(0);
    }

    expect(Number.isFinite(data.repForegone)).toBe(true);
    expect(data.repForegone).toBeGreaterThanOrEqual(0);
  });

  it('Phase 40 S8: carries a levelGovernor block whose mode is one of the three values, and every per-action successes <= attempts', () => {
    const { exists, data } = readJson('bladeburner-state.json');
    if (!exists) return skip('bladeburner-state.json');
    const lg = data.levelGovernor;
    if (!lg) return skip('bladeburner-state.json (no levelGovernor block yet)');

    expect(['off', 'shadow', 'active']).toContain(lg.mode);
    expect(Number.isFinite(lg.completions)).toBe(true);
    expect(lg.completions).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(lg.uncertainCompletions)).toBe(true);
    expect(typeof lg.constants).toBe('object');

    for (const [name, action] of Object.entries(lg.actions ?? {})) {
      if (!Number.isFinite(action.attempts) || !Number.isFinite(action.successes)) continue;
      expect(action.successes, `${name}: successes must not exceed attempts`).toBeLessThanOrEqual(action.attempts);
    }
  });

  it('🔴 QUALIFIED broken-telemetry assertion (fixes reviewer blocker 10): a full hour with half of it verified on a rank-producing action must show SOME rank movement -- Tracking carries no rank loss on failure, so zero movement across that much verified time is diagnostic of the Phase 38 startAction-lied-about-duty bug, not a state this spec designs for', () => {
    const { exists, data } = readJson('bladeburner-state.json');
    if (!exists) return skip('bladeburner-state.json');
    const cumulative = data.rates?.cumulative;
    if (!cumulative) return skip('bladeburner-state.json (no cumulative rate block yet)');

    const wallSec = cumulative.wallSec ?? data.totals?.wallSec;
    const rankProducingSec = cumulative.rankProducingSec ?? data.totals?.rankProducingSec;
    const rankGained = cumulative.rankGained ?? data.totals?.rankGained;
    if (!Number.isFinite(wallSec) || !Number.isFinite(rankProducingSec) || !Number.isFinite(rankGained)) {
      return skip('bladeburner-state.json (cumulative totals not populated yet)');
    }

    const broken = wallSec >= 3600 && rankProducingSec >= 1800 && rankGained === 0;
    expect(broken).toBe(false);
  });

  it('🔴 OVERHEAD-STALL assertion (added 2026-08-03 after a 10.5h live park): hours of wall time with ZERO rank-producing seconds is a stalled engine -- the assertion above cannot catch this, because it requires rankProducingSec >= 1800 and this failure mode has it at 0', () => {
    const { exists, data } = readJson('bladeburner-state.json');
    if (!exists) return skip('bladeburner-state.json');
    if (data.off) return; // off-marker runs legitimately do nothing
    const cumulative = data.rates?.cumulative;
    if (!cumulative) return skip('bladeburner-state.json (no cumulative rate block yet)');

    const wallSec = cumulative.wallSec ?? data.totals?.wallSec;
    const rankProducingSec = cumulative.rankProducingSec ?? data.totals?.rankProducingSec;
    const yieldedSec = data.duty?.yieldedSec ?? 0;
    if (!Number.isFinite(wallSec) || !Number.isFinite(rankProducingSec)) {
      return skip('bladeburner-state.json (cumulative totals not populated yet)');
    }

    // Qualified against the three states that legitimately produce zero rank time
    // (blocker-10's lesson applied to this field): everything quarantined, the
    // post-install Training regime, and long yields to a higher-priority claimant.
    const heldWallSec = wallSec - yieldedSec;
    const exempt = data.allActionsQuarantined === true || data.regime === 'post-install';
    const stalled = heldWallSec >= 2 * 3600 && rankProducingSec === 0 && !exempt;
    expect(stalled).toBe(false);
  });
});

describe('bladeburner-log.json (Phase 39)', () => {
  it('parses as a ring-capped array of known-kind event records', () => {
    const { exists, data } = readJson('bladeburner-log.json');
    if (!exists) return skip('bladeburner-log.json');

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(BB_LOG_MAX_ENTRIES);

    // S12's complete set -- Phase 38's retired `stand-down`/`stand-down-clear` stay in
    // the union so a not-yet-aged-out Phase 38 tail still parses.
    const knownKinds = new Set([
      'startup', 'off-marker-on', 'off-marker-off', 'skill-buy', 'stand-down', 'stand-down-clear',
      'yield-grant', 'yield-reclaim', 'yield-overrun', 'yield-refused',
      'quarantine-set', 'quarantine-clear',
      'crossover',
      'rep-starvation-set', 'rep-starvation-clear',
      'diplomacy-effect',
      'regime-enter', 'regime-exit',
      'checkpoint-C1', 'checkpoint-C2', 'checkpoint-C3',
      'warn',
      // Phase 40 -- the autolevel governor (S8).
      'level-govern', 'level-govern-revert',
    ]);
    for (const record of data) {
      expect(record).toMatchObject({ timestamp: expect.any(Number), time: expect.any(String), kind: expect.any(String) });
      expect(knownKinds.has(record.kind)).toBe(true);
    }
  });

  it('every skill-buy event has a positive cost and a valid skill name', () => {
    const { exists, data } = readJson('bladeburner-log.json');
    if (!exists) return skip('bladeburner-log.json');

    const buys = data.filter((r) => r.kind === 'skill-buy');
    if (buys.length === 0) {
      console.log('\n(skipped: no skill-buy events logged yet)');
      expect(true).toBe(true);
      return;
    }
    for (const record of buys) {
      expect(record.cost).toBeGreaterThan(0);
      expect(typeof record.skill).toBe('string');
    }
  });
});

describe('bladeburner-attempts.json (Phase 39, S7)', () => {
  it('parses as a ring-capped array; every start/start-failure record carries verified and both predicted scores', () => {
    const { exists, data } = readJson('bladeburner-attempts.json');
    if (!exists) return skip('bladeburner-attempts.json');

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(BB_ATTEMPTS_MAX_ENTRIES);

    const startRecords = data.filter((r) => r.kind === 'start' || r.kind === 'start-failure');
    if (startRecords.length === 0) {
      console.log('\n(skipped: no start/start-failure attempts logged yet)');
      expect(true).toBe(true);
      return;
    }
    for (const record of startRecords) {
      expect(typeof record.verified).toBe('boolean');
      // General overhead actions carry no `predicted` (no candidate scored) -- only
      // rank-candidate attempts are required to carry both scores.
      if (record.predicted) {
        expect(Number.isFinite(record.predicted.evPerSec)).toBe(true);
        expect(Number.isFinite(record.predicted.evPerAction)).toBe(true);
      }
    }
  });
});

describe('bladeburner-attempts.json ledger repair (Phase 40 WI1, blocker 11)', () => {
  // All four assertions are qualified on record COUNT so a freshly-restarted engine
  // (too few `complete` records yet) cannot fail them -- T2's exact wording.
  it('(a) Tracking: with >=50 non-uncertain complete records, successDelta is not identically zero across them', () => {
    const { exists, data } = readJson('bladeburner-attempts.json');
    if (!exists) return skip('bladeburner-attempts.json');
    const tracking = data.filter((r) => r.kind === 'complete' && r.uncertain !== true && r.name === 'Tracking');
    if (tracking.length < 50) return skip('bladeburner-attempts.json (fewer than 50 Tracking complete records yet)');
    expect(tracking.some((r) => (r.observed?.successDelta ?? 0) !== 0)).toBe(true);
  });

  it('(b) Investigation: with >=50 non-uncertain complete records, at least 90% read successDelta === 0 -- the failure-path check Tracking cannot provide (blocker 11)', () => {
    const { exists, data } = readJson('bladeburner-attempts.json');
    if (!exists) return skip('bladeburner-attempts.json');
    const investigation = data.filter((r) => r.kind === 'complete' && r.uncertain !== true && r.name === 'Investigation');
    if (investigation.length < 50) return skip('bladeburner-attempts.json (fewer than 50 Investigation complete records yet)');
    const zeroRate = investigation.filter((r) => (r.observed?.successDelta ?? 0) === 0).length / investigation.length;
    expect(zeroRate).toBeGreaterThanOrEqual(0.9);
  });

  it('(c) no complete record ever has rankDelta < 0 -- a negative reading is an instrument fault (blocker 11), not a failed action', () => {
    const { exists, data } = readJson('bladeburner-attempts.json');
    if (!exists) return skip('bladeburner-attempts.json');
    const completes = data.filter((r) => r.kind === 'complete');
    if (completes.length === 0) return skip('bladeburner-attempts.json (no complete records yet)');
    expect(completes.every((r) => (r.observed?.rankDelta ?? 0) >= 0)).toBe(true);
  });

  it('(d) the pairing invariant (successDelta === 0 <=> rankDelta === 0) holds on >=95% of non-uncertain complete records', () => {
    const { exists, data } = readJson('bladeburner-attempts.json');
    if (!exists) return skip('bladeburner-attempts.json');
    const completes = data.filter((r) => r.kind === 'complete' && r.uncertain !== true && r.observed);
    if (completes.length === 0) return skip('bladeburner-attempts.json (no complete records yet)');
    const paired = completes.filter((r) => (r.observed.successDelta === 0) === (r.observed.rankDelta === 0));
    expect(paired.length / completes.length).toBeGreaterThanOrEqual(0.95);
  });
});
