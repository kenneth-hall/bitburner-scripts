// Codified acceptance criteria for Phase 43's three new log files (spec Section 14's test
// plan: bn9entry-log.json/WD4, bn9companions-state.json/WE-adjacent, hacknetramonce-<epoch>.json
// /HA4). Run via `npm run verify:log`, not `npm test` (vitest.verify.config.ts). Skip-if-missing,
// matching verify-bn10entry.test.js's convention -- there is no logs/ directory in a fresh
// worktree/CI checkout, only after a live session has exported one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LOG_RING_CAP } from '../src/bn9entry.js';

const LOG_DIR = process.env.BLADEBURNER_LOG_DIR ?? path.join(process.cwd(), 'logs');
const STATS = ['strength', 'defense', 'dexterity', 'agility'];

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

function latestMatching(pattern) {
  if (!fs.existsSync(LOG_DIR)) return null;
  const matches = fs.readdirSync(LOG_DIR).filter((f) => pattern.test(f));
  if (matches.length === 0) return null;
  matches.sort();
  return matches[matches.length - 1];
}

describe('bn9entry-log.json (Phase 43 WI-D, spec WD4)', () => {
  it('is a ring-capped array of per-poll decision records, each carrying every WD4 field', () => {
    const { exists, data } = readJson('bn9entry-log.json');
    if (!exists) return skip('bn9entry-log.json');

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(LOG_RING_CAP);

    for (const record of data) {
      expect(Number.isFinite(record.ts)).toBe(true);
      expect(typeof record.iso).toBe('string');

      expect(record.combatExp).toBeTypeOf('object');
      expect(record.combatLevels).toBeTypeOf('object');
      for (const stat of STATS) {
        expect(Number.isFinite(record.combatExp[stat])).toBe(true);
        expect(Number.isFinite(record.combatLevels[stat])).toBe(true);
      }

      expect(Number.isFinite(record.money)).toBe(true);
      expect(Number.isFinite(record.entropy)).toBe(true);
      expect('currentWorkKind' in record).toBe(true);

      // WD-CAL3: rate source is one of the three named values.
      expect(['calibration-pending', 'calibrated', 'live-refined']).toContain(record.rateSource);

      expect(typeof record.event).toBe('string');
    }
  });

  it('timestamps are non-decreasing (a ring buffer appended in wall-clock order)', () => {
    const { exists, data } = readJson('bn9entry-log.json');
    if (!exists) return skip('bn9entry-log.json');
    for (let i = 1; i < data.length; i++) {
      expect(data[i].ts).toBeGreaterThanOrEqual(data[i - 1].ts);
    }
  });

  it('WD-SL: a sleeve field is present on every record (null when sleevemanager.js has not written yet, never missing entirely)', () => {
    const { exists, data } = readJson('bn9entry-log.json');
    if (!exists) return skip('bn9entry-log.json');
    for (const record of data) {
      expect('sleeve' in record).toBe(true);
    }
  });
});

describe('bn9companions-state.json (Phase 43 WI-E)', () => {
  it('carries running/gated status for both supervised targets', () => {
    const { exists, data } = readJson('bn9companions-state.json');
    if (!exists) return skip('bn9companions-state.json');

    expect(Number.isFinite(data.ts)).toBe(true);
    expect(data.sleeve).toBeTypeOf('object');
    expect(typeof data.sleeve.running).toBe('boolean');
    expect(typeof data.sleeve.gateOpen).toBe('boolean');
    expect(data.bladeburner).toBeTypeOf('object');
    expect(typeof data.bladeburner.running).toBe('boolean');
    expect(typeof data.bladeburner.gateOpen).toBe('boolean');
  });
});

describe('hacknetramonce-<epoch>.json (Phase 43 WI-A, spec HA4)', () => {
  it('logs hash production before/after so the ~1.50x claim is checkable against reality', () => {
    const latest = latestMatching(/^hacknetramonce-\d+\.json$/);
    if (!latest) return skip('hacknetramonce-<epoch>.json');
    const { data } = readJson(latest);
    expect(Number.isFinite(data.ts)).toBe(true);
    expect(typeof data.action).toBe('string');
    if (data.action === 'bought') {
      expect(Number.isFinite(data.productionBefore)).toBe(true);
      expect(Number.isFinite(data.productionAfter)).toBe(true);
    }
  });
});
