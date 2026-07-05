// Unit tests for src/bootstrap.js's pure logic: pickBootstrapTarget,
// planBootDeployment, buildBootControl, nextPurchaseNudge, shouldHandOff,
// appendBootLog.
import { describe, it, expect } from 'vitest';
import { DRIFT_SEC_EPSILON, DRIFT_MONEY_FRACTION } from '../src/scheduler.js';
import { TOR_ROUTER_COST, PORT_OPENER_COSTS } from '../src/resourcemanager.js';
import {
  pickBootstrapTarget,
  planBootDeployment,
  buildBootControl,
  nextPurchaseNudge,
  shouldHandOff,
  appendBootLog,
} from '../src/bootstrap.js';

describe('pickBootstrapTarget', () => {
  it('picks the highest-maxMoney candidate within the primary tier', () => {
    const candidates = [
      { hostname: 'a', maxMoney: 1000, requiredHackingLevel: 5 },
      { hostname: 'b', maxMoney: 5000, requiredHackingLevel: 5 },
      { hostname: 'c', maxMoney: 3000, requiredHackingLevel: 5 },
    ];
    // myHackLevel 20 -> primary needs requiredHackingLevel < 10
    expect(pickBootstrapTarget(candidates, 20).hostname).toBe('b');
  });

  it('falls back to the <= myHackLevel tier at a level-1 cold start (n00dles-class candidate)', () => {
    const candidates = [{ hostname: 'n00dles', maxMoney: 1_750_000, requiredHackingLevel: 1 }];
    // myHackLevel 1 -> primary needs requiredHackingLevel < 0.5, which n00dles' req 1 fails
    expect(pickBootstrapTarget(candidates, 1)).toEqual(candidates[0]);
  });

  it('ignores fallback-tier candidates (even with higher maxMoney) once the primary tier is non-empty', () => {
    const candidates = [
      { hostname: 'primary-pick', maxMoney: 1000, requiredHackingLevel: 5 }, // qualifies for primary at level 20 (5 < 10)
      { hostname: 'fallback-only', maxMoney: 999_999, requiredHackingLevel: 15 }, // fails primary (15 < 10 false), passes fallback (15 <= 20)
    ];
    expect(pickBootstrapTarget(candidates, 20).hostname).toBe('primary-pick');
  });

  it('treats requiredHackingLevel exactly at myHackLevel / 2 as fallback-tier only (strict <)', () => {
    const candidates = [{ hostname: 'boundary', maxMoney: 1000, requiredHackingLevel: 10 }];
    // myHackLevel 20 -> myHackLevel / 2 === 10 -> 10 < 10 is false -> primary tier empty -> fallback (10 <= 20) picks it
    expect(pickBootstrapTarget(candidates, 20)).toEqual(candidates[0]);
  });

  it('returns null for an empty candidate list', () => {
    expect(pickBootstrapTarget([], 20)).toBeNull();
  });
});

describe('planBootDeployment', () => {
  it('computes floor(freeRam / bootloopRam) per host', () => {
    const plan = planBootDeployment([{ hostname: 'a', freeRam: 10 }], 2.2);
    expect(plan).toEqual([{ hostname: 'a', threads: 4 }]); // floor(10 / 2.2) = 4
  });

  it('drops a zero-free host', () => {
    const plan = planBootDeployment([{ hostname: 'home', freeRam: 0 }, { hostname: 'n00dles', freeRam: 4.4 }], 2.2);
    expect(plan).toEqual([{ hostname: 'n00dles', threads: 2 }]);
  });

  it('handles an exact-multiple free RAM cleanly', () => {
    const plan = planBootDeployment([{ hostname: 'a', freeRam: 6 }], 2);
    expect(plan).toEqual([{ hostname: 'a', threads: 3 }]);
  });

  it('returns an empty plan when bootloopRam is bigger than every host', () => {
    const plan = planBootDeployment([{ hostname: 'a', freeRam: 1 }, { hostname: 'b', freeRam: 2 }], 2.2);
    expect(plan).toEqual([]);
  });
});

describe('buildBootControl', () => {
  it('folds in the imported drift constants', () => {
    const control = buildBootControl({ target: 'n00dles', minSecurityLevel: 1, maxMoney: 1_750_000 });
    expect(control).toEqual({
      target: 'n00dles',
      minSecurityLevel: 1,
      maxMoney: 1_750_000,
      securityEpsilon: DRIFT_SEC_EPSILON,
      moneyFraction: DRIFT_MONEY_FRACTION,
    });
  });
});

describe('nextPurchaseNudge', () => {
  it('nudges tor-router when TOR is unowned and affordable', () => {
    expect(nextPurchaseNudge({ money: TOR_ROUTER_COST, hasTor: false, ownedProgramFiles: new Set() })).toEqual({
      key: 'tor-router',
      cost: TOR_ROUTER_COST,
    });
  });

  it('returns null when TOR is unowned but unaffordable', () => {
    expect(nextPurchaseNudge({ money: TOR_ROUTER_COST - 1, hasTor: false, ownedProgramFiles: new Set() })).toBeNull();
  });

  it('nudges the cheapest unowned opener once TOR is owned', () => {
    const cheapest = [...PORT_OPENER_COSTS].sort((a, b) => a.cost - b.cost)[0];
    const nudge = nextPurchaseNudge({ money: cheapest.cost, hasTor: true, ownedProgramFiles: new Set() });
    expect(nudge).toEqual({ key: cheapest.file, cost: cheapest.cost });
  });

  it('walks the ladder as ownedProgramFiles grows, yielding distinct keys for successive cheapest-unowned openers', () => {
    const sorted = [...PORT_OPENER_COSTS].sort((a, b) => a.cost - b.cost);
    const owned = new Set();
    const first = nextPurchaseNudge({ money: Infinity, hasTor: true, ownedProgramFiles: owned });
    expect(first.key).toBe(sorted[0].file);
    owned.add(sorted[0].file);
    const second = nextPurchaseNudge({ money: Infinity, hasTor: true, ownedProgramFiles: owned });
    expect(second.key).toBe(sorted[1].file);
    expect(second.key).not.toBe(first.key);
  });

  it('returns null once every opener is owned', () => {
    const owned = new Set(PORT_OPENER_COSTS.map((p) => p.file));
    expect(nextPurchaseNudge({ money: Infinity, hasTor: true, ownedProgramFiles: owned })).toBeNull();
  });

  it('fires exactly at the cost boundary (money === cost, >=)', () => {
    expect(nextPurchaseNudge({ money: TOR_ROUTER_COST, hasTor: false, ownedProgramFiles: new Set() })).not.toBeNull();
  });
});

describe('shouldHandOff', () => {
  it('fails when free RAM is under the combined requirement', () => {
    expect(shouldHandOff({ daemonRam: 16.3, killscriptsRam: 3, homeFreeRam: 19 })).toBe(false);
  });

  it('passes when free RAM is over the combined requirement', () => {
    expect(shouldHandOff({ daemonRam: 16.3, killscriptsRam: 3, homeFreeRam: 20 })).toBe(true);
  });

  it('passes when free RAM exactly equals the combined requirement', () => {
    expect(shouldHandOff({ daemonRam: 16.3, killscriptsRam: 3, homeFreeRam: 19.3 })).toBe(true);
  });
});

describe('appendBootLog', () => {
  it('trims to 500 entries, FIFO order', () => {
    let entries = [];
    for (let i = 0; i < 502; i++) {
      entries = appendBootLog(entries, { event: 'startup', i });
    }
    expect(entries.length).toBe(500);
    expect(entries[0].i).toBe(2);
    expect(entries[499].i).toBe(501);
  });

  it('does not trim under the limit', () => {
    let entries = [];
    entries = appendBootLog(entries, { event: 'startup', i: 0 });
    entries = appendBootLog(entries, { event: 'startup', i: 1 });
    expect(entries).toEqual([{ event: 'startup', i: 0 }, { event: 'startup', i: 1 }]);
  });
});
