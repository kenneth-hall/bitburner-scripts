// Codified acceptance criteria (phase-25-faction-strategy.spec.md, S9/work
// item 4): shape checks against the two REAL exported ratchet audit-trail
// files -- run via `npm run verify:log`, not `npm test` (see
// vitest.config.ts's exclude and this project's own vitest.verify.config.ts).
// Each file is skip-if-missing, matching verify-dashboard-state.test.js's
// convention -- the file existing at all is itself a live acceptance item.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = process.env.RATCHET_LOG_DIR ?? path.join(process.cwd(), 'logs');

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

describe('ratchet-log.json (Slice 0)', () => {
  it('parses as an array of paired pre/post install-cycle records', () => {
    const { exists, data } = readJson('ratchet-log.json');
    if (!exists) return skip('ratchet-log.json');
    expect(Array.isArray(data)).toBe(true);
    for (const record of data) {
      expect(record).toMatchObject({
        install: expect.any(Number),
        installTime: expect.any(Number),
        pre: expect.any(Object),
        post: expect.any(Object),
      });
      expect(Number.isFinite(record.deltaMultHacking)).toBe(true);
      expect(Number.isFinite(record.pre.mults?.hacking)).toBe(true);
      expect(Number.isFinite(record.post.mults?.hacking)).toBe(true);
    }
  });
});

describe('ratchet-decisions.json (Phase 25 S9)', () => {
  it('parses as a ring-capped array of decision records', () => {
    const { exists, data } = readJson('ratchet-decisions.json');
    if (!exists) return skip('ratchet-decisions.json');
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(500);
    for (const record of data) {
      expect(record).toMatchObject({
        timestamp: expect.any(Number),
        time: expect.any(String),
        kind: expect.any(String),
      });
      expect(['observe', 'auto']).toContain(record.mode);
    }
  });
});
