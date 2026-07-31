// Codified acceptance criteria (phase-38-bladeburner-engine.spec.md, blocker
// B7 -- "T2 verify:log ... asserting bladeburner-state.json exists once the
// engine has run, carries the decision-8 fields, and that
// rankPerHeldSec/rankPerWallSec are finite and non-negative"). Run via
// `npm run verify:log`, not `npm test` (vitest.verify.config.ts). Skip-if-
// missing, matching verify-gang.test.js's convention -- Slice B hasn't run
// live yet on a fresh checkout, and that's not a failure.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BB_LOG_MAX_ENTRIES, BLACKOPS_DAEDALUS_RANK } from '../src/bladeburnermanager.js';

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

describe('bladeburner-state.json (Phase 38 Slice B, blocker B7)', () => {
  it('parses, carries the decision-8 fields, and rankPerHeldSec/rankPerWallSec are finite and non-negative in every window', () => {
    const { exists, data } = readJson('bladeburner-state.json');
    if (!exists) return skip('bladeburner-state.json');

    expect(typeof data.off).toBe('boolean');
    expect(typeof data.holdActive).toBe('boolean');
    expect(data.blackOpsDaedalusRank).toBe(BLACKOPS_DAEDALUS_RANK);
    expect(Number.isFinite(data.timestamp)).toBe(true);

    if (data.off) {
      // Off-marker snapshots (WI2's idle-in-loop path) carry no rate data --
      // that's the expected shape, not a hole to fill in.
      return;
    }

    expect(Number.isFinite(data.rank)).toBe(true);
    expect(data.rank).toBeGreaterThanOrEqual(0);
    expect(data.rates).toBeTypeOf('object');
    expect(data.duty).toBeTypeOf('object');

    for (const label of RATE_WINDOW_LABELS) {
      const rate = data.rates?.[label];
      if (!rate) continue; // a window with no samples yet is legitimately absent, not a failure
      expect(Number.isFinite(rate.rankPerHeldSec)).toBe(true);
      expect(rate.rankPerHeldSec).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(rate.rankPerWallSec)).toBe(true);
      expect(rate.rankPerWallSec).toBeGreaterThanOrEqual(0);

      const duty = data.duty?.[label];
      if (duty) {
        expect(Number.isFinite(duty.dutyCycle)).toBe(true);
        expect(duty.dutyCycle).toBeGreaterThanOrEqual(0);
        expect(duty.dutyCycle).toBeLessThanOrEqual(1);
      }
    }

    expect(Number.isFinite(data.repForegone)).toBe(true);
    expect(data.repForegone).toBeGreaterThanOrEqual(0);
  });
});

describe('bladeburner-log.json (Phase 38 Slice B)', () => {
  it('parses as a ring-capped array of known-kind event records', () => {
    const { exists, data } = readJson('bladeburner-log.json');
    if (!exists) return skip('bladeburner-log.json');

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(BB_LOG_MAX_ENTRIES);

    const knownKinds = new Set(['startup', 'off-marker-on', 'off-marker-off', 'stand-down', 'stand-down-clear', 'skill-buy']);
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
