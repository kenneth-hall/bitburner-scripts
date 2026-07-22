// Unit tests for src/gatewatch.js's pure helpers (GP1 watcher).
import { describe, it, expect } from 'vitest';
import { seedSamples, repSurvivesVerdict } from '../src/gatewatch.js';

describe('seedSamples', () => {
  it('restores a persisted array so the pre-install series survives a restart/install', () => {
    const prior = [{ timestamp: 1, redPill: false, niteSecRep: 100 }, { timestamp: 2, redPill: false, niteSecRep: 200 }];
    expect(seedSamples(JSON.stringify(prior))).toEqual(prior);
  });

  it('falls back to [] on missing/malformed/non-array content', () => {
    expect(seedSamples('')).toEqual([]);
    expect(seedSamples(undefined)).toEqual([]);
    expect(seedSamples('{not json')).toEqual([]);
    expect(seedSamples('{"a":1}')).toEqual([]);
  });

  it('ring-trims an oversized persisted series, keeping the newest', () => {
    const big = Array.from({ length: 12 }, (_, i) => ({ i }));
    const seeded = seedSamples(JSON.stringify(big), 10);
    expect(seeded).toHaveLength(10);
    expect(seeded[0].i).toBe(2);
    expect(seeded[seeded.length - 1].i).toBe(11);
  });
});

describe('repSurvivesVerdict', () => {
  it('compares post-install rep to the last PRE-install sample and reports survived=true when held', () => {
    const samples = [
      { redPill: false, niteSecRep: 3_000_000 },
      { redPill: false, niteSecRep: 3_100_000 }, // last pre-install
      { redPill: true, niteSecRep: 3_100_000 },  // post-install sample being evaluated
    ];
    const v = repSurvivesVerdict(samples, 3_100_000);
    expect(v).toEqual({ known: true, preRep: 3_100_000, postRep: 3_100_000, survived: true });
  });

  it('reports survived=false when rep reset toward zero across the install', () => {
    const samples = [{ redPill: false, niteSecRep: 3_100_000 }];
    const v = repSurvivesVerdict(samples, 0);
    expect(v.known).toBe(true);
    expect(v.survived).toBe(false);
  });

  it('handles a null post-install rep (not-a-member) as not survived', () => {
    const samples = [{ redPill: false, niteSecRep: 3_100_000 }];
    const v = repSurvivesVerdict(samples, null);
    expect(v.known).toBe(true);
    expect(v.survived).toBe(false);
  });

  it('reports known=false when there is no pre-install sample to compare against', () => {
    const samples = [{ redPill: true, niteSecRep: 3_100_000 }];
    const v = repSurvivesVerdict(samples, 3_100_000);
    expect(v).toEqual({ known: false, preRep: null, postRep: 3_100_000, survived: null });
  });

  it('ignores pre-install samples with a null rep when finding the comparison baseline', () => {
    const samples = [
      { redPill: false, niteSecRep: 2_000_000 },
      { redPill: false, niteSecRep: null },
    ];
    const v = repSurvivesVerdict(samples, 2_000_000);
    expect(v.preRep).toBe(2_000_000);
    expect(v.survived).toBe(true);
  });
});
