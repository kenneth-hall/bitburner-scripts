// Codified acceptance criterion C4 (phase-41-bn10-entry.spec.md). Run via `npm run
// verify:log`, not `npm test` (vitest.verify.config.ts). Skip-if-missing, matching
// verify-bladeburner.test.js's convention -- there is no logs/ directory in a fresh
// worktree/CI checkout, only after a live session has exported one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LOG_RING_CAP } from '../src/bn10entry.js';

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

const STATS = ['strength', 'defense', 'dexterity', 'agility'];

describe('bn10entry-log.json (Phase 41 WI3, spec C4)', () => {
  it('is a ring-capped array of per-poll decision records, each carrying every C4 field', () => {
    const { exists, data } = readJson('bn10entry-log.json');
    if (!exists) return skip('bn10entry-log.json');

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(LOG_RING_CAP);

    for (const record of data) {
      expect(Number.isFinite(record.ts)).toBe(true);
      expect(typeof record.iso).toBe('string');

      // "four combat exp values, four levels"
      expect(record.combatExp).toBeTypeOf('object');
      expect(record.combatLevels).toBeTypeOf('object');
      for (const stat of STATS) {
        expect(Number.isFinite(record.combatExp[stat])).toBe(true);
        expect(Number.isFinite(record.combatLevels[stat])).toBe(true);
      }

      expect(Number.isFinite(record.money)).toBe(true);
      expect(Number.isFinite(record.entropy)).toBe(true);

      // "current action kind"
      expect('currentWorkKind' in record).toBe(true);

      // "decision + reason"
      expect(typeof record.decision).toBe('string');
      expect(['hold', 'join', 'replan', 'graft', 'grind']).toContain(record.decision);
      expect(typeof record.reason).toBe('string');
    }
  });

  it('timestamps are non-decreasing (a ring buffer appended in wall-clock order)', () => {
    const { exists, data } = readJson('bn10entry-log.json');
    if (!exists) return skip('bn10entry-log.json');
    for (let i = 1; i < data.length; i++) {
      expect(data[i].ts).toBeGreaterThanOrEqual(data[i - 1].ts);
    }
  });
});

describe('graft-plan.json (Phase 41 WI2, spec B4)', () => {
  it('carries schemaVersion and every input the plan was computed from', () => {
    const { exists, data } = readJson('graft-plan.json');
    if (!exists) return skip('graft-plan.json');

    if (data.fatal) return; // an aborted planner run (e.g. grafting unavailable) is a valid shape too

    expect(Number.isFinite(data.schemaVersion)).toBe(true);
    expect(data.inputs).toBeTypeOf('object');
    for (const stat of STATS) {
      expect(Number.isFinite(data.inputs.currentMults[stat])).toBe(true);
      expect(Number.isFinite(data.inputs.banked[stat])).toBe(true);
    }
    expect(Number.isFinite(data.inputs.money)).toBe(true);
    expect(Number.isFinite(data.inputs.entropy)).toBe(true);
    expect(Number.isFinite(data.inputs.grindExpPerSec)).toBe(true);
    expect(Number.isFinite(data.timestamp)).toBe(true);
    expect(Array.isArray(data.ladder)).toBe(true);
    expect(Number.isFinite(data.chosenK)).toBe(true);
  });
});
