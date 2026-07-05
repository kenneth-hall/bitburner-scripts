// Codified acceptance criteria (docs/phases/phase-10-finance-cloud.md: "Log verification").
// Reads a REAL exported logs/finance-log.json -- run via `npm run
// verify:log`, not `npm test` (see vitest.config.ts's exclude and this
// project's own vitest.verify.config.ts). Path overridable via
// FINANCE_LOG_PATH; defaults to logs/finance-log.json (repo-relative).
// Skips (doesn't fail) when the file doesn't exist yet, same convention as
// the transactions checker for a missing day-file -- but note in the handoff
// that the file existing at all is itself a Live-A acceptance item.
//
// Hard assertions fail the run. The cross-log listing against the
// transactions log is a soft report only -- the two logs sample at
// different moments, so it informs rather than gates.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LOG_PATH = process.env.FINANCE_LOG_PATH ?? path.join(process.cwd(), 'logs', 'finance-log.json');
const TRANSACTIONS_LOG_DIR = process.env.TRANSACTIONS_LOG_DIR ?? path.join(process.cwd(), 'logs');
const TRANSACTIONS_FILENAME_PATTERN = /^transactions-\d{4}-\d{2}-\d{2}\.json$/;

const KNOWN_RESERVATION_KEYS = new Set(['bootstrap-server', 'tor-router', 'next-port-opener', 'formulas', 'manual-extra']);

let entries; // finance-log.json entries, or null if the file doesn't exist yet
let logExists = true;

beforeAll(() => {
  if (!fs.existsSync(LOG_PATH)) {
    logExists = false;
    return;
  }
  const raw = fs.readFileSync(LOG_PATH, 'utf8');
  try {
    entries = JSON.parse(raw);
  } catch {
    throw new Error('finance-log.json truncated mid-export -- restart the dev server / re-export and retry.');
  }
});

describe('log format', () => {
  it('parses to an array (or is skipped if not exported yet)', () => {
    if (!logExists) {
      console.log(`\n(skipped: no finance log found at ${LOG_PATH} yet -- export a real session first)`);
      expect(true).toBe(true);
      return;
    }
    expect(Array.isArray(entries)).toBe(true);
  });

  it('every entry has a valid event and the shared schema', () => {
    if (!logExists) return;
    for (const e of entries) {
      expect(['startup', 'reservations'], `unknown event type: ${e.event}`).toContain(e.event);
      expect(e).toMatchObject({
        timestamp: expect.any(Number),
        time: expect.any(String),
        money: expect.any(Number),
        totalReserved: expect.any(Number),
        available: expect.any(Number),
        reservations: expect.any(Array),
        changed: expect.any(Array),
      });
      for (const r of e.reservations) {
        expect(r).toMatchObject({ key: expect.any(String), label: expect.any(String), amount: expect.any(Number) });
      }
    }
  });
});

describe('hard assertions', () => {
  it('timestamps are non-decreasing', () => {
    if (!logExists) return;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].timestamp, `entry ${i} out of order`).toBeGreaterThanOrEqual(entries[i - 1].timestamp);
    }
  });

  it('totalReserved equals the sum of the reservations amounts', () => {
    if (!logExists) return;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const sum = e.reservations.reduce((s, r) => s + r.amount, 0);
      expect(e.totalReserved, `entry ${i}: totalReserved mismatch`).toBe(sum);
    }
  });

  it('available equals max(0, money - totalReserved)', () => {
    if (!logExists) return;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      expect(e.available, `entry ${i}: available mismatch`).toBe(Math.max(0, e.money - e.totalReserved));
    }
  });

  it('every reservation key is from the known set', () => {
    if (!logExists) return;
    for (let i = 0; i < entries.length; i++) {
      for (const r of entries[i].reservations) {
        expect(KNOWN_RESERVATION_KEYS.has(r.key), `entry ${i}: unknown reservation key ${r.key}`).toBe(true);
      }
    }
  });

  it('every "reservations" entry has a non-empty changed list (startup entries are exempt)', () => {
    if (!logExists) return;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.event !== 'reservations') continue;
      expect(e.changed.length, `entry ${i}: "reservations" event with empty changed`).toBeGreaterThan(0);
    }
  });
});

describe('soft reports', () => {
  it('prints the current reservation state and each auto-cloud-upgrade expense next to the nearest preceding finance entry', () => {
    console.log('\n--- verify-finance soft report ---');
    if (!logExists) {
      console.log(`(no finance log at ${LOG_PATH} yet)`);
      expect(true).toBe(true);
      return;
    }

    const last = entries[entries.length - 1];
    if (last) {
      console.log(`current reservations (as of ${last.time}):`);
      if (last.reservations.length === 0) {
        console.log('  (none)');
      } else {
        for (const r of last.reservations) console.log(`  ${r.key}: $${r.amount.toFixed(0)} (${r.label})`);
      }
      console.log(`  totalReserved: $${last.totalReserved.toFixed(0)} | available: $${last.available.toFixed(0)}`);
    }

    if (fs.existsSync(TRANSACTIONS_LOG_DIR)) {
      const names = fs.readdirSync(TRANSACTIONS_LOG_DIR).filter((f) => TRANSACTIONS_FILENAME_PATTERN.test(f));
      const upgradeRecords = names
        .flatMap((name) => JSON.parse(fs.readFileSync(path.join(TRANSACTIONS_LOG_DIR, name), 'utf8')))
        .filter((r) => r.type === 'expense' && r.source === 'auto-cloud-upgrade')
        .sort((a, b) => a.timestamp - b.timestamp);

      if (upgradeRecords.length > 0) {
        console.log('\nauto-cloud-upgrade expenses vs. nearest preceding finance entry:');
        for (const r of upgradeRecords) {
          const preceding = [...entries].reverse().find((e) => e.timestamp <= r.timestamp);
          const availableLabel = preceding ? `$${preceding.available.toFixed(0)} available` : '(no preceding finance entry)';
          console.log(`  ${r.time} ${r.hostname} ${r.detail} -$${r.amount.toFixed(0)} -- ${availableLabel}`);
        }
      } else {
        console.log('\nno auto-cloud-upgrade expenses recorded yet');
      }
    }

    expect(true).toBe(true); // this block only reports; it never fails
  });
});
