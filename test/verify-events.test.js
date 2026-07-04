// Codified acceptance criteria (batcher-refactor-phase6.md: "Verification" ->
// "Log checker"). Reads the REAL exported persistent events log -- run via
// `npm run verify:log` (see vitest.config.ts's exclude and this project's own
// vitest.verify.config.ts), never `npm test`. Path overridable via
// EVENTS_LOG_PATH; defaults to logs/events-log.json (repo-relative). Unlike
// the daemon/transactions logs, this file is never rotated -- one file, one
// read, for the whole playthrough.
//
// Hard assertions fail the run. Soft reports only print -- record counts are
// phase-of-game dependent, so they inform rather than gate.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LOG_PATH = process.env.EVENTS_LOG_PATH ?? path.join(process.cwd(), 'logs', 'events-log.json');

const KNOWN_TYPES = new Set(['faction-joined', 'backdoor-installed', 'daemon-started']);

let entries;

beforeAll(() => {
  if (!fs.existsSync(LOG_PATH)) {
    throw new Error(`No events log found at ${LOG_PATH} -- export a real session first (or set EVENTS_LOG_PATH).`);
  }
  entries = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
});

describe('log format', () => {
  it('parses as a JSON array', () => {
    expect(Array.isArray(entries)).toBe(true);
  });

  it('every record has a known type', () => {
    for (const r of entries) {
      expect(KNOWN_TYPES.has(r.type), `unknown type ${r.type}`).toBe(true);
    }
  });

  it('faction-joined records carry a non-empty faction; backdoor-installed a non-empty server', () => {
    for (const r of entries) {
      if (r.type === 'faction-joined') {
        expect(typeof r.faction, `record missing faction: ${JSON.stringify(r)}`).toBe('string');
        expect(r.faction.length, `record has an empty faction: ${JSON.stringify(r)}`).toBeGreaterThan(0);
      } else if (r.type === 'backdoor-installed') {
        expect(typeof r.server, `record missing server: ${JSON.stringify(r)}`).toBe('string');
        expect(r.server.length, `record has an empty server: ${JSON.stringify(r)}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('hard assertions', () => {
  it('timestamp and resetId are always positive', () => {
    for (const r of entries) {
      expect(r.timestamp, `non-positive timestamp: ${JSON.stringify(r)}`).toBeGreaterThan(0);
      expect(r.resetId, `non-positive resetId: ${JSON.stringify(r)}`).toBeGreaterThan(0);
    }
  });

  it('resetId never exceeds its own record\'s timestamp', () => {
    for (const r of entries) {
      expect(r.resetId, `resetId after timestamp: ${JSON.stringify(r)}`).toBeLessThanOrEqual(r.timestamp);
    }
  });

  it('timestamp is monotone non-decreasing in append order', () => {
    for (let i = 1; i < entries.length; i++) {
      expect(
        entries[i].timestamp,
        `entry ${i} (${entries[i].type}) out of order`
      ).toBeGreaterThanOrEqual(entries[i - 1].timestamp);
    }
  });
});

describe('soft reports', () => {
  it('prints record counts per reset and per type', () => {
    console.log('\n--- verify-events soft reports ---');
    const byReset = {};
    const byType = {};
    for (const r of entries) {
      byReset[r.resetId] = (byReset[r.resetId] ?? 0) + 1;
      byType[r.type] = (byType[r.type] ?? 0) + 1;
    }
    console.log(`total records: ${entries.length}`);
    console.log('by reset:');
    for (const [resetId, count] of Object.entries(byReset)) {
      console.log(`  ${new Date(Number(resetId)).toISOString()}: ${count}`);
    }
    console.log('by type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}`);
    }

    expect(true).toBe(true); // this block only reports; it never fails
  });
});
