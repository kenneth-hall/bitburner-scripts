// Codified acceptance criteria (phase-24-dashboard.spec.md, S14): shape
// checks against the five REAL exported dashboard.js renderer-source state
// files -- run via `npm run verify:log`, not `npm test` (see
// vitest.config.ts's exclude and this project's own vitest.verify.config.ts).
// Each file is skip-if-missing (like the run-dependent checks already in
// verify-log), matching the convention that the file existing at all is
// itself a Live-L1 acceptance item, not something this checker should fail
// on for a session that hasn't run yet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = process.env.DASHBOARD_STATE_DIR ?? path.join(process.cwd(), 'logs');

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

describe('daemon-status.json', () => {
  it('parses and carries the required fields', () => {
    const { exists, data } = readJson('daemon-status.json');
    if (!exists) return skip('daemon-status.json');
    expect(data).toMatchObject({
      timestamp: expect.any(Number),
      time: expect.any(String),
      mathMode: expect.any(String),
      fleet: expect.any(Object),
      members: expect.any(Array),
      memberCount: expect.any(Number),
    });
    expect(Number.isFinite(data.memberCount)).toBe(true);
  });
});

describe('targets-ranking.json', () => {
  it('parses and carries the required fields', () => {
    const { exists, data } = readJson('targets-ranking.json');
    if (!exists) return skip('targets-ranking.json');
    expect(data).toMatchObject({
      timestamp: expect.any(Number),
      time: expect.any(String),
      totalCount: expect.any(Number),
      targets: expect.any(Array),
    });
    expect(Number.isFinite(data.totalCount)).toBe(true);
  });
});

describe('cloud-state.json', () => {
  it('parses and carries the required fields', () => {
    const { exists, data } = readJson('cloud-state.json');
    if (!exists) return skip('cloud-state.json');
    expect(data).toMatchObject({ timestamp: expect.any(Number), time: expect.any(String) });
    expect(typeof data.paused).toBe('boolean');
    expect(typeof data.financeStale).toBe('boolean');
  });
});

describe('xpfarm-state.json', () => {
  it('parses and carries the required fields', () => {
    const { exists, data } = readJson('xpfarm-state.json');
    if (!exists) return skip('xpfarm-state.json');
    expect(data).toMatchObject({ timestamp: expect.any(Number), time: expect.any(String) });
    expect(typeof data.off).toBe('boolean');
  });
});

describe('finance-state.json', () => {
  it('parses and carries the required fields', () => {
    const { exists, data } = readJson('finance-state.json');
    if (!exists) return skip('finance-state.json');
    expect(data).toMatchObject({
      timestamp: expect.any(Number),
      time: expect.any(String),
      money: expect.any(Number),
      totalReserved: expect.any(Number),
      available: expect.any(Number),
      reservations: expect.any(Array),
    });
  });
});

describe('cross-file coherence', () => {
  it('daemon-status.json member count and targets-ranking.json totalCount are both finite (different populations -- no ordering asserted between them)', () => {
    const daemon = readJson('daemon-status.json');
    const targets = readJson('targets-ranking.json');
    if (!daemon.exists || !targets.exists) {
      console.log('\n(skipped cross-file check: one or both files not exported yet)');
      expect(true).toBe(true);
      return;
    }
    expect(Number.isFinite(daemon.data.memberCount)).toBe(true);
    expect(Number.isFinite(targets.data.totalCount)).toBe(true);
    expect(Number.isFinite(daemon.data.timestamp)).toBe(true);
    expect(Number.isFinite(targets.data.timestamp)).toBe(true);
  });
});
