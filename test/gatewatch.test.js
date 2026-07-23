// Unit tests for src/gatewatch.js's pure helpers (GP1 watcher).
import { describe, it, expect } from 'vitest';
import { seedSamples, repSurvivesVerdict, ownsAug } from '../src/gatewatch.js';

describe('ownsAug', () => {
  it('reads a Map, which is what ns.getResetInfo().ownedAugs actually returns', () => {
    // Regression: `"The Red Pill" in map` is always false -- it checks the Map object's own
    // properties, not its entries. That silently suppressed the GP1 capture (2026-07-23).
    const owned = new Map([['The Red Pill', 1], ['NeuroFlux Governor', 8]]);
    expect(ownsAug(owned, 'The Red Pill')).toBe(true);
    expect(ownsAug(owned, 'NeuroFlux Governor')).toBe(true);
    expect(ownsAug(owned, 'QLink')).toBe(false);
  });

  it('still reads a plain object, if the API shape ever changes back', () => {
    expect(ownsAug({ 'The Red Pill': 1 }, 'The Red Pill')).toBe(true);
    expect(ownsAug({ 'The Red Pill': 1 }, 'QLink')).toBe(false);
  });

  it('treats a missing collection as owning nothing rather than throwing', () => {
    expect(ownsAug(undefined, 'The Red Pill')).toBe(false);
    expect(ownsAug(null, 'The Red Pill')).toBe(false);
  });
});

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
  it('compares post-install rep to the PEAK pre-install sample and reports survived=true when held', () => {
    const samples = [
      { redPill: false, niteSecRep: 3_000_000 },
      { redPill: false, niteSecRep: 3_100_000 }, // peak pre-install
      { redPill: true, niteSecRep: 3_100_000 },  // post-install sample being evaluated
    ];
    const v = repSurvivesVerdict(samples, 3_100_000);
    expect(v).toEqual({ known: true, preRep: 3_100_000, postRep: 3_100_000, survived: true });
  });

  it('is not fooled by a mis-flagged post-install sample in the tail (the Map-bug history)', () => {
    // Every sample the Map bug persisted reads `redPill: false`, including post-install ones.
    // A "last pre-install sample" baseline would pick the 641k reset sample and compare rep to
    // itself -> a false survived=true. The peak baseline sees the 21m -> 3.1m drop for what it is.
    const samples = [
      { redPill: false, niteSecRep: 21_026_000 }, // genuinely pre-install
      { redPill: false, niteSecRep: 641_000 },    // actually POST-install, mis-flagged
      { redPill: false, niteSecRep: 3_087_000 },  // rep re-climbing after the reset
    ];
    const v = repSurvivesVerdict(samples, 3_087_000);
    expect(v.preRep).toBe(21_026_000);
    expect(v.survived).toBe(false);
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
