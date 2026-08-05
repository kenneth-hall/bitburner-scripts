// Codified acceptance criteria (phase-32-bn2-progress-tracker.spec.md, work
// item 9): shape checks against the two REAL exported goallog.js files --
// run via `npm run verify:log`, not `npm test` (see vitest.verify.config.ts).
// Skip-if-missing, matching verify-gang.test.js's convention -- the file
// existing at all is itself a live acceptance item (V2 in the spec's live
// procedure).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = process.env.GOAL_LOG_DIR ?? path.join(process.cwd(), 'logs');

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

describe('goal-state.json (Phase 32)', () => {
  it('parses with the three KPI blocks present', () => {
    const { exists, data } = readJson('goal-state.json');
    if (!exists) return skip('goal-state.json');

    expect(Number.isFinite(data.timestamp)).toBe(true);

    expect(data.mProgress).toBeTruthy();
    expect(Number.isFinite(data.mProgress.target)).toBe(true);
    expect(typeof data.mProgress.targetLabel).toBe('string');

    // Retargeted 2026-08-04: the win condition (rank -> Operation Daedalus).
    // Optional-shaped so a pre-retarget export still passes -- `value` is
    // legitimately null before the Bladeburner division is joined.
    if (data.rankProgress !== null && data.rankProgress !== undefined) {
      expect(Number.isFinite(data.rankProgress.target)).toBe(true);
      expect(typeof data.rankProgress.targetLabel).toBe('string');
      if (data.rankProgress.value !== null) {
        expect(Number.isFinite(data.rankProgress.value)).toBe(true);
        expect(Number.isFinite(data.rankProgress.pct)).toBe(true);
      }
      const rf = data.rankProgress.forecast;
      if (rf) {
        expect(['OK', 'WARMING', 'STALLED', 'REACHED']).toContain(rf.status);
        // The whole point of the STALLED branch: "no measurement" must never be
        // published as Infinity.
        if (rf.daysToTarget !== null) expect(Number.isFinite(rf.daysToTarget)).toBe(true);
      }
    }

    expect(data.income).toBeTruthy();
    expect(Number.isFinite(data.income.windowMs)).toBe(true);
    if (data.income.perSec !== null) expect(Number.isFinite(data.income.perSec)).toBe(true);
    if (data.income.trend !== null) expect(['UP', 'DOWN', 'FLAT']).toContain(data.income.trend);

    // nextAug is legitimately null on a plateau (no target) -- only shape-check when present.
    if (data.nextAug !== null) {
      expect(typeof data.nextAug.phase).toBe('string');
      if (data.nextAug.waitingMs !== null) expect(data.nextAug.waitingMs).toBeGreaterThanOrEqual(0);
    }

    // Phase 35 WI6: liveness is additive -- present on any post-deploy export.
    if (data.liveness !== null && data.liveness !== undefined) {
      expect(['OK', 'STUCK', 'WARMING', 'BOUNDARY']).toContain(data.liveness.status);
      if (data.liveness.status === 'STUCK') {
        expect(['daemon-dead', 'starved', 'reservation-pin', 'idle', 'boundary-overrun']).toContain(data.liveness.reason);
      }
    }
  });
});

describe('goal-log.json (Phase 32)', () => {
  it('parses as an array with non-decreasing t', () => {
    const { exists, data } = readJson('goal-log.json');
    if (!exists) return skip('goal-log.json');

    expect(Array.isArray(data)).toBe(true);
    for (let i = 1; i < data.length; i++) {
      expect(data[i].t, `entry ${i} out of order`).toBeGreaterThanOrEqual(data[i - 1].t);
    }
  });

  it('every sample carries finite cumulative fields', () => {
    const { exists, data } = readJson('goal-log.json');
    if (!exists) return skip('goal-log.json');
    if (data.length === 0) {
      console.log('\n(skipped: goal-log.json is empty)');
      expect(true).toBe(true);
      return;
    }

    for (const sample of data) {
      expect(Number.isFinite(sample.gangCum)).toBe(true);
      expect(Number.isFinite(sample.hackingCum)).toBe(true);
      expect(Number.isFinite(sample.mHacking)).toBe(true);
    }
  });
});
