// Codified acceptance criteria (docs/phases/phase-05-batcher-refactor.md: "Verification"
// -> "Log checker"). Reads REAL exported day-files -- run via `npm run
// verify:log`, not `npm test` (see vitest.config.ts's exclude and this
// project's own vitest.verify.config.ts). Directory overridable via
// TRANSACTIONS_LOG_DIR; defaults to logs/ (repo-relative). One day can
// export more than one file across a session, so this glob-scans the whole
// directory rather than reading a single hardcoded path.
//
// Hard assertions fail the run. Soft reports only print -- income/expense
// totals are phase-of-game dependent, so they inform rather than gate.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { INCOME_WINDOW_MAX_MS } from '../src/translog.js';
import { parseWindows, windowedIncomeRate } from './windowed-rate.js';

const LOG_DIR = process.env.TRANSACTIONS_LOG_DIR ?? path.join(process.cwd(), 'logs');
const FILENAME_PATTERN = /^transactions-\d{4}-\d{2}-\d{2}\.json$/;

const VALID_EXPENSE_SOURCES = new Set([
  'cloud-purchase',
  'fleet-upgrade',
  'darkweb-program', // purchasescripts.js -- retired in Phase 11, kept for historical day-files
  'home-ram-upgrade',
  'single-server-upgrade', // upgradecloudserver.js -- missing from this whitelist since that script's own phase; found via a real 2026-07-04 session log
  'auto-cloud-upgrade', // cloudupgrader.js (Phase 10) / cloudmanager.js (Phase 11 rename)
  'auto-tor', // procureprograms.js (Phase 11)
  'auto-port-opener', // procureprograms.js (Phase 11)
  'auto-cloud-purchase', // cloudmanager.js (Phase 11)
  'auto-aug', // augfarmer.js (Phase 23)
  'auto-aug-gate', // augfarmer.js (Phase 26 A1) -- the gate-fill buy, flagged separately from auto-aug
  'auto-travel', // augfarmer.js (Phase 23)
  'auto-formulas', // procureformulas.js -- pre-existing bug (missing from this whitelist), folded into Phase 23's ship gate
  'auto-donation', // augfarmer.js (Phase 25, S6) -- the generalized donation route
  'home-cores-upgrade', // installer.js (Phase 25, S10) -- mirrors home-ram-upgrade's shape
]);
const VALID_INCOME_SOURCES = new Set(['hacking']);

let files; // [{ name, entries }]

beforeAll(() => {
  if (!fs.existsSync(LOG_DIR)) {
    throw new Error(`No log directory found at ${LOG_DIR} -- export a real session first (or set TRANSACTIONS_LOG_DIR).`);
  }
  const names = fs.readdirSync(LOG_DIR).filter((f) => FILENAME_PATTERN.test(f));
  if (names.length === 0) {
    throw new Error(`No transactions-YYYY-MM-DD.json files found in ${LOG_DIR} -- export a real session first.`);
  }
  files = names.map((name) => ({
    name,
    entries: JSON.parse(fs.readFileSync(path.join(LOG_DIR, name), 'utf8')),
  }));
});

function orderingKey(r) {
  return r.type === 'income' ? r.firstTimestamp : r.timestamp;
}

describe('log format', () => {
  it('every file parses as a JSON array', () => {
    for (const f of files) {
      expect(Array.isArray(f.entries), `${f.name} did not parse to an array`).toBe(true);
    }
  });

  it('every record has a valid type/source and the fields its type assigns it', () => {
    for (const f of files) {
      for (const r of f.entries) {
        expect(['income', 'expense'], `${f.name}: unknown type ${r.type}`).toContain(r.type);

        if (r.type === 'income') {
          expect(VALID_INCOME_SOURCES.has(r.source), `${f.name}: unknown income source ${r.source}`).toBe(true);
          expect(r).toMatchObject({
            type: 'income',
            source: 'hacking',
            amount: expect.any(Number),
            firstTimestamp: expect.any(Number),
            lastTimestamp: expect.any(Number),
            time: expect.any(String),
          });
          expect(r.timestamp, `${f.name}: income record has a plain timestamp field`).toBeUndefined();
        } else {
          expect(VALID_EXPENSE_SOURCES.has(r.source), `${f.name}: unknown expense source ${r.source}`).toBe(true);
          expect(r).toMatchObject({
            type: 'expense',
            source: expect.any(String),
            amount: expect.any(Number),
            timestamp: expect.any(Number),
            time: expect.any(String),
          });
          expect(r.firstTimestamp, `${f.name}: expense record has a firstTimestamp field`).toBeUndefined();
          expect(r.lastTimestamp, `${f.name}: expense record has a lastTimestamp field`).toBeUndefined();
        }
      }
    }
  });
});

describe('hard assertions', () => {
  it('amount is always positive', () => {
    for (const f of files) {
      for (const r of f.entries) {
        expect(r.amount, `${f.name}: non-positive amount ${r.amount}`).toBeGreaterThan(0);
      }
    }
  });

  it('income records have firstTimestamp <= lastTimestamp and a bounded window', () => {
    for (const f of files) {
      for (const r of f.entries) {
        if (r.type !== 'income') continue;
        expect(r.firstTimestamp, `${f.name}: income record's firstTimestamp after lastTimestamp`).toBeLessThanOrEqual(r.lastTimestamp);
        expect(
          r.lastTimestamp - r.firstTimestamp,
          `${f.name}: income record's window exceeds INCOME_WINDOW_MAX_MS`
        ).toBeLessThanOrEqual(INCOME_WINDOW_MAX_MS);
      }
    }
  });

  it('records are ordered by their type-appropriate ordering key', () => {
    for (const f of files) {
      for (let i = 1; i < f.entries.length; i++) {
        expect(
          orderingKey(f.entries[i]),
          `${f.name}: entry ${i} (${f.entries[i].type}/${f.entries[i].source}) out of order`
        ).toBeGreaterThanOrEqual(orderingKey(f.entries[i - 1]));
      }
    }
  });
});

describe('soft reports', () => {
  it('prints per-day income total, income/minute, and expense total by source', () => {
    console.log('\n--- verify-transactions soft reports ---');
    for (const f of files) {
      const income = f.entries.filter((r) => r.type === 'income');
      const expenses = f.entries.filter((r) => r.type === 'expense');
      const incomeTotal = income.reduce((sum, r) => sum + r.amount, 0);

      console.log(`\n${f.name}:`);
      if (income.length > 0) {
        const windowMs = income[income.length - 1].lastTimestamp - income[0].firstTimestamp;
        const perMinute = windowMs > 0 ? incomeTotal / (windowMs / 60_000) : 0;
        console.log(`  income: $${incomeTotal.toFixed(0)} over ${(windowMs / 60000).toFixed(1)} min (~$${perMinute.toFixed(0)}/min)`);
      } else {
        console.log('  income: none');
      }

      const bySource = {};
      for (const e of expenses) bySource[e.source] = (bySource[e.source] ?? 0) + e.amount;
      const sourceNames = Object.keys(bySource);
      if (sourceNames.length > 0) {
        console.log('  expenses by source:');
        for (const source of sourceNames) console.log(`    ${source}: $${bySource[source].toFixed(0)}`);
      } else {
        console.log('  expenses: none');
      }
    }

    expect(true).toBe(true); // this block only reports; it never fails
  });

  it('prints per-window hacking income $/min for Phase 8\'s A/B/A\' toggle protocol (VERIFY_WINDOWS)', () => {
    const windows = parseWindows(process.env.VERIFY_WINDOWS);
    if (windows.length === 0) {
      console.log('\n--- verify-transactions windowed report --- (set VERIFY_WINDOWS="label1:startMs-endMs,label2:startMs-endMs,..." to enable)');
      expect(true).toBe(true);
      return;
    }

    // Windows are absolute epoch-ms, so combining every day-file's entries is
    // safe even though the A/B/A' protocol is meant to stay inside one
    // calendar day (see the file-format comment above on midnight rotation).
    const allEntries = files.flatMap((f) => f.entries);
    console.log('\n--- verify-transactions windowed report ---');
    for (const window of windows) {
      const { label, total, perMinute, count } = windowedIncomeRate(allEntries, window);
      console.log(`  ${label}: $${total.toFixed(0)} over ${((window.end - window.start) / 60000).toFixed(1)} min (~$${perMinute.toFixed(0)}/min, ${count} record(s))`);
    }

    expect(true).toBe(true); // this block only reports; it never fails
  });
});
