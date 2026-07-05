// Unit tests for src/cloudupgrader.js's pure logic: planNextUpgrade and
// isStateStale. The affordability check itself stays in the ns glue (it's
// two live comparisons) -- not tested here.
import { describe, it, expect } from 'vitest';
import { planNextUpgrade, isStateStale } from '../src/cloudupgrader.js';

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

describe('isStateStale', () => {
  const NOW = 1_000_000_000;
  const STALE_MS = 15_000;

  it('is fresh well within the window', () => {
    expect(isStateStale(NOW - 1000, NOW, STALE_MS)).toBe(false);
  });

  it('is fresh exactly at the boundary (checker uses strict >)', () => {
    expect(isStateStale(NOW - STALE_MS, NOW, STALE_MS)).toBe(false);
  });

  it('is stale just past the boundary', () => {
    expect(isStateStale(NOW - STALE_MS - 1, NOW, STALE_MS)).toBe(true);
  });

  it('is stale when the timestamp is missing', () => {
    expect(isStateStale(null, NOW, STALE_MS)).toBe(true);
    expect(isStateStale(undefined, NOW, STALE_MS)).toBe(true);
  });
});
