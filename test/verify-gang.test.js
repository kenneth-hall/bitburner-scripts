// Codified acceptance criteria (phase-29-gang-scaling.spec.md, S9): shape
// checks against the two REAL exported gang-manager files -- run via
// `npm run verify:log`, not `npm test` (see vitest.verify.config.ts). Each
// file is skip-if-missing, matching verify-ratchet.test.js's convention --
// the file existing at all is itself a live acceptance item.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TASK_LADDER, SINK_TASK, GANG_LOG_MAX_ENTRIES, LADDER_VERSION } from '../src/gangmanager.js';

const LOG_DIR = process.env.GANG_LOG_DIR ?? path.join(process.cwd(), 'logs');

// Combined relative/absolute tolerance (S9 cold-review note 4) -- a
// near-zero actual (a freshly-ascended member's respectGain ~= 0, or a
// clamped-to-zero wantedLevelGain) can't blow up a bare ratio.
const ABS_EPS = 1e-4;
const REL_TOLERANCE = 0.1;

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

// Robust to a minority of outlier readings (e.g. a just-ascended member's
// near-zero actual): the MEDIAN reading must clear tolerance, not every one.
function medianPasses(perReadingPass) {
  if (perReadingPass.length === 0) return true;
  const passCount = perReadingPass.filter(Boolean).length;
  return passCount >= Math.ceil(perReadingPass.length / 2);
}

const VALID_TASKS = new Set([...TASK_LADDER, SINK_TASK, 'Unassigned']);

describe('gang-state.json (Phase 29, S8)', () => {
  it('parses, numeric fields are finite, sinkMode is boolean, every member is on an in-policy task, ladderVersion is current', () => {
    const { exists, data } = readJson('gang-state.json');
    if (!exists) return skip('gang-state.json');

    expect(typeof data.sinkMode).toBe('boolean');
    expect(typeof data.formulasSuspended).toBe('boolean');
    expect(data.ladderVersion).toBe(LADDER_VERSION);
    expect(Number.isFinite(data.respect)).toBe(true);
    expect(Number.isFinite(data.wantedLevel)).toBe(true);
    expect(Number.isFinite(data.wantedPenalty)).toBe(true);
    expect(Number.isFinite(data.baselinePenalty)).toBe(true);
    expect(Number.isFinite(data.memberCount)).toBe(true);
    expect(Number.isFinite(data.netWantedRate)).toBe(true);
    expect(Array.isArray(data.members)).toBe(true);
    expect(data.members).toHaveLength(data.memberCount);

    for (const member of data.members) {
      expect(VALID_TASKS.has(member.task)).toBe(true);
      expect(Number.isFinite(member.rung)).toBe(true);
    }
  });

  it('model validation: predicted-vs-actual respect and wanted gains agree to within tolerance on a qualifying snapshot (median-robust)', () => {
    const { exists, data } = readJson('gang-state.json');
    if (!exists) return skip('gang-state.json');

    const qualifying = data.formulasSuspended === false && data.sinkMode === false;
    if (!qualifying) {
      console.log('\n(skipped: snapshot not qualifying -- formulasSuspended/sinkMode must both be false)');
      expect(true).toBe(true);
      return;
    }

    const respectPass = [];
    const wantedPass = [];
    for (const m of data.members ?? []) {
      if (typeof m.predictedRespectGain === 'number' && typeof m.respectGain === 'number') {
        respectPass.push(Math.abs(m.predictedRespectGain - m.respectGain) <= Math.max(REL_TOLERANCE * Math.abs(m.respectGain), ABS_EPS));
      }
      if (typeof m.predictedWantedGain === 'number' && typeof m.wantedLevelGain === 'number') {
        wantedPass.push(Math.abs(m.predictedWantedGain - m.wantedLevelGain) <= Math.max(REL_TOLERANCE * Math.abs(m.wantedLevelGain), ABS_EPS));
      }
    }
    if (respectPass.length === 0 && wantedPass.length === 0) {
      console.log('\n(skipped: qualifying snapshot has no predicted readings yet)');
      expect(true).toBe(true);
      return;
    }

    expect(medianPasses(respectPass)).toBe(true);
    expect(medianPasses(wantedPass)).toBe(true);
  });
});

describe('gang-log.json (Phase 29, S8)', () => {
  it('parses as a ring-capped array of known-kind event records', () => {
    const { exists, data } = readJson('gang-log.json');
    if (!exists) return skip('gang-log.json');

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(GANG_LOG_MAX_ENTRIES);

    const knownKinds = new Set([
      'startup',
      'rebaseline',
      'recruit',
      'promote',
      'demote',
      'ascend',
      'equip-buy',
      'sink-enter',
      'sink-exit',
      'off-marker',
      'formulas-suspend',
      'formulas-resume',
    ]);
    for (const record of data) {
      expect(record).toMatchObject({ timestamp: expect.any(Number), time: expect.any(String), kind: expect.any(String) });
      expect(knownKinds.has(record.kind)).toBe(true);
    }
  });

  it('every equip-buy event has a positive cost', () => {
    const { exists, data } = readJson('gang-log.json');
    if (!exists) return skip('gang-log.json');

    const equipBuys = data.filter((r) => r.kind === 'equip-buy');
    if (equipBuys.length === 0) {
      console.log('\n(skipped: no equip-buy events logged yet)');
      expect(true).toBe(true);
      return;
    }
    for (const record of equipBuys) {
      expect(record.cost).toBeGreaterThan(0);
    }
  });
});
