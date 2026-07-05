// Codified acceptance criteria (bootstrap-phase14-spec.md's work item 5).
// Reads a REAL exported logs/bootstrap-log.json -- run via `npm run
// verify:log`, not `npm test` (see vitest.config.ts's exclude and this
// project's own vitest.verify.config.ts). Path overridable via
// BOOTSTRAP_LOG_PATH; defaults to logs/bootstrap-log.json. Skips (doesn't
// fail) when the file doesn't exist yet -- same convention as
// verify-finance.test.js, built and confirmed against synthetic fixtures
// before a real log exists.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  checkKnownEventsAndTimestamps,
  checkTimestampsNonDecreasing,
  checkHandoffTerminal,
  checkDeployShape,
  checkTargetSwitchDistinct,
} from './verify-bootstrap-checks.js';

const LOG_PATH = process.env.BOOTSTRAP_LOG_PATH ?? path.join(process.cwd(), 'logs', 'bootstrap-log.json');

let entries;
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
    throw new Error('bootstrap-log.json truncated mid-export -- restart the dev server / re-export and retry.');
  }
});

describe('log format', () => {
  it('parses to an array (or is skipped if not exported yet)', () => {
    if (!logExists) {
      console.log(`\n(skipped: no bootstrap log found at ${LOG_PATH} yet -- export a real session first)`);
      expect(true).toBe(true);
      return;
    }
    expect(Array.isArray(entries)).toBe(true);
  });
});

describe('hard assertions', () => {
  it('every entry has a known event kind and a timestamp', () => {
    if (!logExists) return;
    expect(checkKnownEventsAndTimestamps(entries)).toEqual([]);
  });

  it('timestamps are non-decreasing', () => {
    if (!logExists) return;
    expect(checkTimestampsNonDecreasing(entries)).toEqual([]);
  });

  it('at most one handoff entry, and nothing after it', () => {
    if (!logExists) return;
    expect(checkHandoffTerminal(entries)).toEqual([]);
  });

  it('deploy entries carry a non-empty host list with positive integer threads', () => {
    if (!logExists) return;
    expect(checkDeployShape(entries)).toEqual([]);
  });

  it('target-switch entries have from !== to', () => {
    if (!logExists) return;
    expect(checkTargetSwitchDistinct(entries)).toEqual([]);
  });
});

describe('soft report', () => {
  it('prints a summary of the bootstrap run', () => {
    if (!logExists) {
      console.log(`\n(no bootstrap log at ${LOG_PATH} yet)`);
      expect(true).toBe(true);
      return;
    }
    console.log('\n--- verify-bootstrap soft report ---');
    const counts = {};
    for (const e of entries) counts[e.event] = (counts[e.event] ?? 0) + 1;
    console.log('event counts:', counts);
    const handoff = entries.find((e) => e.event === 'handoff');
    console.log(handoff ? `handoff occurred at ${handoff.time}` : 'no handoff yet (still bootstrapping)');
    expect(true).toBe(true);
  });
});
