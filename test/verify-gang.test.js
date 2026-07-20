// Codified acceptance criteria (phase-27-gang.spec.md, S10): shape checks
// against the two REAL exported gang-manager files -- run via
// `npm run verify:log`, not `npm test` (see vitest.verify.config.ts). Each
// file is skip-if-missing, matching verify-ratchet.test.js's convention --
// the file existing at all is itself a live acceptance item.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TASK_LADDER, SINK_TASK, GANG_LOG_MAX_ENTRIES } from '../src/gangmanager.js';

const LOG_DIR = process.env.GANG_LOG_DIR ?? path.join(process.cwd(), 'logs');

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

const VALID_TASKS = new Set([...TASK_LADDER, SINK_TASK, 'Unassigned']);

describe('gang-state.json (Phase 27 Tier 1, S8)', () => {
  it('parses, numeric fields are finite, sinkMode is boolean, every member is on an in-policy task', () => {
    const { exists, data } = readJson('gang-state.json');
    if (!exists) return skip('gang-state.json');

    expect(typeof data.sinkMode).toBe('boolean');
    expect(Number.isFinite(data.respect)).toBe(true);
    expect(Number.isFinite(data.wantedLevel)).toBe(true);
    expect(Number.isFinite(data.wantedPenalty)).toBe(true);
    expect(Number.isFinite(data.baselinePenalty)).toBe(true);
    expect(Number.isFinite(data.memberCount)).toBe(true);
    expect(Array.isArray(data.members)).toBe(true);
    expect(data.members).toHaveLength(data.memberCount);

    for (const member of data.members) {
      expect(VALID_TASKS.has(member.task)).toBe(true);
      expect(Number.isFinite(member.rung)).toBe(true);
    }
  });
});

describe('gang-log.json (Phase 27 Tier 1, S8)', () => {
  it('parses as a ring-capped array of known-kind event records', () => {
    const { exists, data } = readJson('gang-log.json');
    if (!exists) return skip('gang-log.json');

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(GANG_LOG_MAX_ENTRIES);

    const knownKinds = new Set(['startup', 'rebaseline', 'recruit', 'promote', 'demote', 'sink-enter', 'sink-exit', 'off-marker']);
    for (const record of data) {
      expect(record).toMatchObject({ timestamp: expect.any(Number), time: expect.any(String), kind: expect.any(String) });
      expect(knownKinds.has(record.kind)).toBe(true);
    }
  });
});
