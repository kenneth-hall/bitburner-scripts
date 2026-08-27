// Unit tests for src/cloudmanager.js's pure logic (renamed + extended from
// cloudupgrader.js in Phase 11): planNextUpgrade, shouldBuyGrowthServer,
// nextCloudName, and buildCloudState (Phase 24, S4 -- the dashboard.js cloud
// panel source). isStateStale moved to src/financestate.js (Phase 16, F4) --
// see test/financestate.test.js. Phase 35 WI2 (D3/D9, the growth-buy
// inversion) added pickGrowthRam and growthPossible. The raw affordability
// comparisons against live money stay in the ns glue -- not tested here.
import { describe, it, expect } from 'vitest';
import {
  planNextUpgrade,
  shouldBuyGrowthServer,
  growthPossible,
  pickGrowthRam,
  nextCloudName,
  buildCloudState,
  shouldStandDown,
  GROWTH_RAM_MIN,
  GROWTH_RAM_MAX,
  GROWTH_RAM_FALLBACK,
  GROWTH_RAM_STALE_MS,
} from '../src/cloudmanager.js';

describe('planNextUpgrade', () => {
  it('picks the lowest-RAM server', () => {
    const fleet = [
      { hostname: 'pserv-a', ram: 64 },
      { hostname: 'pserv-b', ram: 16 },
      { hostname: 'pserv-c', ram: 32 },
    ];
    expect(planNextUpgrade(fleet, 1_048_576)).toEqual({ hostname: 'pserv-b', nextTier: 32 });
  });

  it('breaks a tie by list order', () => {
    const fleet = [
      { hostname: 'pserv-a', ram: 16 },
      { hostname: 'pserv-b', ram: 16 },
    ];
    expect(planNextUpgrade(fleet, 1_048_576)).toEqual({ hostname: 'pserv-a', nextTier: 32 });
  });

  it('skips servers already at the RAM limit', () => {
    const fleet = [
      { hostname: 'pserv-a', ram: 1_048_576 },
      { hostname: 'pserv-b', ram: 16 },
    ];
    expect(planNextUpgrade(fleet, 1_048_576)).toEqual({ hostname: 'pserv-b', nextTier: 32 });
  });

  it('returns null when every server is at the limit', () => {
    const fleet = [
      { hostname: 'pserv-a', ram: 1_048_576 },
      { hostname: 'pserv-b', ram: 1_048_576 },
    ];
    expect(planNextUpgrade(fleet, 1_048_576)).toBeNull();
  });

  it('returns null for an empty fleet', () => {
    expect(planNextUpgrade([], 1_048_576)).toBeNull();
  });

  it('nextTier is exactly a doubling of current RAM', () => {
    const fleet = [{ hostname: 'pserv-a', ram: 256 }];
    expect(planNextUpgrade(fleet, 1_048_576)).toEqual({ hostname: 'pserv-a', nextTier: 512 });
  });
});

describe('shouldBuyGrowthServer (Phase 35 WI2/D3-D9 -- the "every server maxed" gate is RETIRED, rewritten per spec)', () => {
  const RAM_LIMIT = 1_048_576;
  const SERVER_LIMIT = 25;

  it('is true whenever a slot is free, regardless of whether existing servers are maxed (the inversion)', () => {
    const fleet = [
      { hostname: 'cloud-0', ram: 16 }, // nowhere near maxed
      { hostname: 'cloud-1', ram: 16 },
    ];
    expect(shouldBuyGrowthServer(fleet, SERVER_LIMIT)).toBe(true);
  });

  it('is true when every server is at the RAM limit and a slot is free (still true, just no longer the only case)', () => {
    const fleet = [
      { hostname: 'cloud-0', ram: RAM_LIMIT },
      { hostname: 'cloud-1', ram: RAM_LIMIT },
    ];
    expect(shouldBuyGrowthServer(fleet, SERVER_LIMIT)).toBe(true);
  });

  it('is false at the server limit', () => {
    const fleet = Array.from({ length: SERVER_LIMIT }, (_, i) => ({ hostname: `cloud-${i}`, ram: 16 }));
    expect(shouldBuyGrowthServer(fleet, SERVER_LIMIT)).toBe(false);
  });

  it('is false for an empty fleet (bootstrap step handles that case)', () => {
    expect(shouldBuyGrowthServer([], SERVER_LIMIT)).toBe(false);
  });

  it('is true at the boundary: fleet.length === serverLimit - 1', () => {
    const fleet = Array.from({ length: SERVER_LIMIT - 1 }, (_, i) => ({ hostname: `cloud-${i}`, ram: 16 }));
    expect(shouldBuyGrowthServer(fleet, SERVER_LIMIT)).toBe(true);
  });
});

describe('growthPossible (Phase 35 WI2 -- the upgrade loop\'s cold-start-fallback gate)', () => {
  const SERVER_LIMIT = 25;

  it('the cold-start fixture: 2GB fleet, $110k cash, $3.5M+ derived cost -> not possible (upgrade path taken)', () => {
    const fleet = [{ hostname: 'cloud-0', ram: 2 }];
    expect(growthPossible(fleet, SERVER_LIMIT, 3_500_000, 110_000, 110_000)).toBe(false);
  });

  it('growth buy wins when affordable', () => {
    const fleet = [{ hostname: 'cloud-0', ram: 2 }];
    expect(growthPossible(fleet, SERVER_LIMIT, 3_500_000, 4_000_000, 4_000_000)).toBe(true);
  });

  it('false when no slot is free even if affordable (upgrades-only when slots full)', () => {
    const fleet = Array.from({ length: SERVER_LIMIT }, (_, i) => ({ hostname: `cloud-${i}`, ram: 1024 }));
    expect(growthPossible(fleet, SERVER_LIMIT, 100, 1_000_000, 1_000_000)).toBe(false);
  });

  it('false for an empty fleet even if affordable -- empty fleet never growth-buys', () => {
    expect(growthPossible([], SERVER_LIMIT, 100, 1_000_000, 1_000_000)).toBe(false);
  });

  it('gates on the tighter of availableCash and liveMoney', () => {
    const fleet = [{ hostname: 'cloud-0', ram: 2 }];
    expect(growthPossible(fleet, SERVER_LIMIT, 1000, 999, 5000)).toBe(false); // availableCash short
    expect(growthPossible(fleet, SERVER_LIMIT, 1000, 5000, 999)).toBe(false); // liveMoney short
    expect(growthPossible(fleet, SERVER_LIMIT, 1000, 1000, 1000)).toBe(true); // exact boundary, both sufficient
  });
});

describe('pickGrowthRam (Phase 35 WI2/D4 -- F4\'s trap closed)', () => {
  const RAM_LIMIT = 1_048_576;
  const NOW = 1_000_000;

  function ranking(targets, timestamp = NOW) {
    return { timestamp, targets };
  }

  it('picks the smallest power of two >= the max hackJobGb across the top 3', () => {
    const r = ranking([{ hackJobGb: 100 }, { hackJobGb: 300 }, { hackJobGb: 50 }]);
    expect(pickGrowthRam(r, NOW, RAM_LIMIT)).toEqual({ ramGb: 512, source: 'ranking' });
  });

  it('uses the MAX across top-3, not just the head entry -- a second member\'s larger job is not orphaned', () => {
    const r = ranking([{ hackJobGb: 10 }, { hackJobGb: 900 }, { hackJobGb: 20 }]);
    expect(pickGrowthRam(r, NOW, RAM_LIMIT).ramGb).toBe(1024);
  });

  it('ignores entries beyond the top 3', () => {
    const r = ranking([{ hackJobGb: 10 }, { hackJobGb: 10 }, { hackJobGb: 10 }, { hackJobGb: 99999 }]);
    expect(pickGrowthRam(r, NOW, RAM_LIMIT).ramGb).toBe(GROWTH_RAM_MIN);
  });

  it('clamps the low end at GROWTH_RAM_MIN', () => {
    const r = ranking([{ hackJobGb: 1 }]);
    expect(pickGrowthRam(r, NOW, RAM_LIMIT).ramGb).toBe(GROWTH_RAM_MIN);
  });

  it('clamps the high end at GROWTH_RAM_MAX', () => {
    const r = ranking([{ hackJobGb: 5000 }]);
    expect(pickGrowthRam(r, NOW, RAM_LIMIT).ramGb).toBe(GROWTH_RAM_MAX);
  });

  it('clamps the high end at ramLimit when ramLimit is below GROWTH_RAM_MAX (cold-review major 10)', () => {
    const r = ranking([{ hackJobGb: 5000 }]);
    expect(pickGrowthRam(r, NOW, 256).ramGb).toBe(256);
  });

  it('falls back to GROWTH_RAM_FALLBACK when the ranking is missing', () => {
    expect(pickGrowthRam(null, NOW, RAM_LIMIT)).toEqual({ ramGb: GROWTH_RAM_FALLBACK, source: 'fallback' });
  });

  it('falls back when the ranking is stale by its own timestamp', () => {
    const r = ranking([{ hackJobGb: 100 }], NOW - GROWTH_RAM_STALE_MS - 1);
    expect(pickGrowthRam(r, NOW, RAM_LIMIT).source).toBe('fallback');
  });

  it('is fresh exactly at the staleness boundary', () => {
    const r = ranking([{ hackJobGb: 100 }], NOW - GROWTH_RAM_STALE_MS);
    expect(pickGrowthRam(r, NOW, RAM_LIMIT).source).toBe('ranking');
  });

  it('falls back when no top-3 entry carries a hackJobGb field', () => {
    const r = ranking([{ hackJobGb: null }, {}, { hackJobGb: undefined }]);
    expect(pickGrowthRam(r, NOW, RAM_LIMIT)).toEqual({ ramGb: GROWTH_RAM_FALLBACK, source: 'fallback' });
  });

  it('the fallback size itself respects the ramLimit clamp', () => {
    expect(pickGrowthRam(null, NOW, 128).ramGb).toBe(128);
  });
});

describe('nextCloudName', () => {
  it('starts at cloud-0 for an empty list', () => {
    expect(nextCloudName([])).toBe('cloud-0');
  });

  it('picks the next index after a contiguous run', () => {
    expect(nextCloudName(['cloud-0', 'cloud-1'])).toBe('cloud-2');
  });

  it('fills a gap before extending the run', () => {
    expect(nextCloudName(['cloud-0', 'cloud-2'])).toBe('cloud-1');
  });

  it('ignores names not matching the cloud-<n> pattern', () => {
    expect(nextCloudName(['pserv-16gb-0', 'pserv-16gb-1'])).toBe('cloud-0');
  });

  it('handles a mix of cloud-<n> and legacy names', () => {
    expect(nextCloudName(['pserv-4096gb-0', 'cloud-0', 'cloud-1'])).toBe('cloud-2');
  });
});

describe('buildCloudState', () => {
  it('every key is present with defaults on a bare call (the paused/stale early-branch shape)', () => {
    const state = buildCloudState({ now: 1000, paused: true });
    expect(state).toMatchObject({
      timestamp: 1000,
      paused: true,
      financeStale: false,
      disabled: false,
      disabledReason: null,
      available: 0,
      reserved: 0,
      fleet: null,
      next: null,
      growth: null,
      lastUpgrade: null,
      lastBootstrapBuy: null,
      lastGrowthBuy: null,
    });
  });

  it('distinguishes financeStale from paused', () => {
    const state = buildCloudState({ now: 1, financeStale: true });
    expect(state.paused).toBe(false);
    expect(state.financeStale).toBe(true);
  });

  it('carries the full fleet/next/growth picture on a normal poll', () => {
    const state = buildCloudState({
      now: 1,
      available: 100,
      reserved: 50,
      fleet: { count: 3, minRam: 16, maxRam: 64, serverLimit: 25, ramLimit: 1_048_576 },
      next: { hostname: 'cloud-0', tier: 128, cost: 1000, affordable: true },
      lastUpgrade: { hostname: 'cloud-0', fromRam: 64, toRam: 128, cost: 1000, time: '10:00:00' },
    });
    expect(state.fleet.count).toBe(3);
    expect(state.next.affordable).toBe(true);
    expect(state.lastUpgrade.hostname).toBe('cloud-0');
  });

  // Phase 43 WI-B, HB1: disabled/disabledReason round-trip, every other call shape unaffected.
  it('HB1: disabled/disabledReason round-trip when passed', () => {
    const state = buildCloudState({ now: 5, disabled: true, disabledReason: 'CloudServerLimit is 0 for this BitNode' });
    expect(state.disabled).toBe(true);
    expect(state.disabledReason).toBe('CloudServerLimit is 0 for this BitNode');
  });

  it('HB1: every other call shape (paused/financeStale/normal) still defaults disabled:false, disabledReason:null', () => {
    for (const call of [
      { now: 1 },
      { now: 1, paused: true },
      { now: 1, financeStale: true },
      { now: 1, available: 100, reserved: 50, fleet: { count: 1, minRam: 16, maxRam: 16, serverLimit: 25, ramLimit: 1_048_576 } },
    ]) {
      const state = buildCloudState(call);
      expect(state.disabled).toBe(false);
      expect(state.disabledReason).toBeNull();
    }
  });
});

describe('shouldStandDown (Phase 43 WI-B)', () => {
  it('HB3 (this branch, the new one): true exactly when CloudServerLimit is 0', () => {
    expect(shouldStandDown(0)).toBe(true);
  });

  it('HB3 (regression case): false for the BN6/BN10-shaped serverLimit > 0 -- the new branch does not fire', () => {
    expect(shouldStandDown(25)).toBe(false);
    expect(shouldStandDown(1)).toBe(false);
  });
});
