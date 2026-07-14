// Unit tests for src/cloudmanager.js's pure logic (renamed + extended from
// cloudupgrader.js in Phase 11): planNextUpgrade, shouldBuyGrowthServer,
// nextCloudName, and buildCloudState (Phase 24, S4 -- the dashboard.js cloud
// panel source). isStateStale moved to src/financestate.js (Phase 16, F4) --
// see test/financestate.test.js. The affordability checks themselves stay in
// the ns glue (live comparisons) -- not tested here.
import { describe, it, expect } from 'vitest';
import { planNextUpgrade, shouldBuyGrowthServer, nextCloudName, buildCloudState } from '../src/cloudmanager.js';

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

describe('shouldBuyGrowthServer', () => {
  const RAM_LIMIT = 1_048_576;
  const SERVER_LIMIT = 25;

  it('is true when every server is at the RAM limit and a slot is free', () => {
    const fleet = [
      { hostname: 'cloud-0', ram: RAM_LIMIT },
      { hostname: 'cloud-1', ram: RAM_LIMIT },
    ];
    expect(shouldBuyGrowthServer(fleet, RAM_LIMIT, SERVER_LIMIT)).toBe(true);
  });

  it('is false when one server is below the limit', () => {
    const fleet = [
      { hostname: 'cloud-0', ram: RAM_LIMIT },
      { hostname: 'cloud-1', ram: 16 },
    ];
    expect(shouldBuyGrowthServer(fleet, RAM_LIMIT, SERVER_LIMIT)).toBe(false);
  });

  it('is false at the server limit even if every server is maxed', () => {
    const fleet = Array.from({ length: SERVER_LIMIT }, (_, i) => ({ hostname: `cloud-${i}`, ram: RAM_LIMIT }));
    expect(shouldBuyGrowthServer(fleet, RAM_LIMIT, SERVER_LIMIT)).toBe(false);
  });

  it('is false for an empty fleet (bootstrap step handles that case)', () => {
    expect(shouldBuyGrowthServer([], RAM_LIMIT, SERVER_LIMIT)).toBe(false);
  });

  it('is true at the boundary: fleet.length === serverLimit - 1', () => {
    const fleet = Array.from({ length: SERVER_LIMIT - 1 }, (_, i) => ({ hostname: `cloud-${i}`, ram: RAM_LIMIT }));
    expect(shouldBuyGrowthServer(fleet, RAM_LIMIT, SERVER_LIMIT)).toBe(true);
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
});
