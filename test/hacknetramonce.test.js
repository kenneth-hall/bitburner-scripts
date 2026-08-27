// Tests for Phase 43 WI-A's src/hacknetramonce.js (spec acceptance criteria HA1-HA5).
import { describe, it, expect } from 'vitest';
import {
  main,
  isPowerOfTwo,
  computeLevelsNeeded,
  decideHacknetRamUpgrade,
  TARGET_RAM_GB,
  DEFAULT_CAP,
} from '../src/hacknetramonce.js';

describe('isPowerOfTwo', () => {
  it('is true for 1, 2, 4, 8, ..., 64', () => {
    for (const n of [1, 2, 4, 8, 16, 32, 64]) expect(isPowerOfTwo(n)).toBe(true);
  });
  it('is false for 0, negative, and non-powers', () => {
    for (const n of [0, -4, 3, 5, 100]) expect(isPowerOfTwo(n)).toBe(false);
  });
});

describe('computeLevelsNeeded', () => {
  it('1 -> 64 is 6 levels (doubling six times)', () => {
    expect(computeLevelsNeeded(1, 64)).toBe(6);
  });
  it('32 -> 64 is 1 level', () => {
    expect(computeLevelsNeeded(32, 64)).toBe(1);
  });
});

describe('decideHacknetRamUpgrade', () => {
  it('HA3: already at target -> "already-done", never "refused-cap" or a crash', () => {
    const d = decideHacknetRamUpgrade({ currentRam: 64, targetRam: TARGET_RAM_GB, cap: DEFAULT_CAP });
    expect(d.action).toBe('already-done');
  });

  it('HA3: already PAST target (a hypothetical higher tier) also reads already-done', () => {
    const d = decideHacknetRamUpgrade({ currentRam: 128, targetRam: TARGET_RAM_GB, cap: DEFAULT_CAP });
    expect(d.action).toBe('already-done');
  });

  it('invalid-current-ram for a non-power-of-two reading', () => {
    const d = decideHacknetRamUpgrade({ currentRam: 3, targetRam: TARGET_RAM_GB, cap: DEFAULT_CAP });
    expect(d.action).toBe('invalid-current-ram');
  });

  it('refused-cap when the live cost exceeds the cap -- distinct label from "already-done"', () => {
    const d = decideHacknetRamUpgrade({ currentRam: 1, targetRam: TARGET_RAM_GB, cost: 100_000_000, cap: DEFAULT_CAP });
    expect(d.action).toBe('refused-cap');
    expect(d.action).not.toBe('already-done');
  });

  it('buy when affordable', () => {
    const d = decideHacknetRamUpgrade({ currentRam: 1, targetRam: TARGET_RAM_GB, cost: 10_000_000, cap: DEFAULT_CAP });
    expect(d.action).toBe('buy');
    expect(d.levelsNeeded).toBe(6);
  });

  it('returns "buy" with no cost decided yet when cost is omitted (two-phase decide)', () => {
    const d = decideHacknetRamUpgrade({ currentRam: 1, targetRam: TARGET_RAM_GB, cap: DEFAULT_CAP });
    expect(d.action).toBe('buy');
    expect(d.levelsNeeded).toBe(6);
    expect(d.cost).toBeUndefined();
  });
});

describe('main() (fake ns integration)', () => {
  function makeFakeNs({ ram = 1, cost = 10_000_000, args = [], afterRam = TARGET_RAM_GB, mismatchRam = null } = {}) {
    const written = {};
    const txWrites = [];
    let currentRam = ram;
    return {
      args,
      disableLog: () => {},
      tprint: () => {},
      write: (file, content) => {
        written[file] = content;
        if (/^transactions-/.test(file)) txWrites.push(content);
      },
      read: () => '',
      format: { number: (n) => String(n) },
      hacknet: {
        getNodeStats: (i) => ({ ram: currentRam, production: currentRam * 10 }),
        getRamUpgradeCost: (i, levels) => cost,
        upgradeRam: (i, levels) => { currentRam = afterRam; return true; },
      },
      getServer: (hostname) => ({ maxRam: mismatchRam ?? afterRam }),
      _written: written,
      _txWrites: txWrites,
    };
  }

  function lastLogRecord(fakeNs) {
    const key = Object.keys(fakeNs._written).find((k) => /^hacknetramonce-\d+\.json$/.test(k));
    return JSON.parse(fakeNs._written[key]);
  }

  it('HA1/HA2: a successful buy writes maxRam=64 and records a transaction with a non-zero amount', async () => {
    const fakeNs = makeFakeNs({ ram: 1, cost: 41_700_000, afterRam: 64 });
    await main(fakeNs);
    const record = lastLogRecord(fakeNs);
    expect(record.action).toBe('bought');
    expect(record.maxRamFromGetServer).toBe(64);
    expect(fakeNs._txWrites.length).toBe(1);
    const tx = JSON.parse(fakeNs._txWrites[0])[0];
    expect(tx.source).toBe('hacknet-ram-upgrade');
    expect(tx.amount).toBeGreaterThan(0);
  });

  it('HA3: a second run against an already-64GB node logs "already-done", not "refused-cap", and records NO transaction', async () => {
    const fakeNs = makeFakeNs({ ram: 64 });
    await main(fakeNs);
    const record = lastLogRecord(fakeNs);
    expect(record.action).toBe('already-done');
    expect(fakeNs._txWrites.length).toBe(0);
  });

  it('refused-cap: a cost above the default cap makes no purchase and records no transaction', async () => {
    const fakeNs = makeFakeNs({ ram: 1, cost: DEFAULT_CAP + 1 });
    await main(fakeNs);
    const record = lastLogRecord(fakeNs);
    expect(record.action).toBe('refused-cap');
    expect(fakeNs._txWrites.length).toBe(0);
  });

  it('a custom cap passed as ns.args[0] is honoured', async () => {
    const fakeNs = makeFakeNs({ ram: 1, cost: 5_000_000, args: [1_000_000] }); // cap lower than cost
    await main(fakeNs);
    const record = lastLogRecord(fakeNs);
    expect(record.cap).toBe(1_000_000);
    expect(record.action).toBe('refused-cap');
  });

  it('HA4: hash production before/after is logged in the run\'s own file', async () => {
    const fakeNs = makeFakeNs({ ram: 1, cost: 10_000_000, afterRam: 64 });
    await main(fakeNs);
    const record = lastLogRecord(fakeNs);
    expect(typeof record.productionBefore).toBe('number');
    expect(typeof record.productionAfter).toBe('number');
  });

  it('logs a mismatch finding rather than silently resolving it when getServer and getNodeStats disagree', async () => {
    const fakeNs = makeFakeNs({ ram: 1, cost: 10_000_000, afterRam: 64, mismatchRam: 32 });
    await main(fakeNs);
    const record = lastLogRecord(fakeNs);
    expect(record.mismatch).toBe(true);
    expect(record.maxRamFromGetServer).toBe(32);
    expect(record.ramFromNodeStats).toBe(64);
    // getServer disagrees below target -- not verified as a successful buy, and no
    // transaction is recorded for an unverified purchase.
    expect(record.action).toBe('bought-unverified');
    expect(fakeNs._txWrites.length).toBe(0);
  });

  it('invalid-current-ram is refused and logged distinctly, without crashing', async () => {
    const fakeNs = makeFakeNs({ ram: 3 });
    await main(fakeNs);
    const record = lastLogRecord(fakeNs);
    expect(record.action).toBe('invalid-current-ram');
    expect(fakeNs._txWrites.length).toBe(0);
  });
});
