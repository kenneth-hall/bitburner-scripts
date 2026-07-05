// Unit tests for src/targets.js's isEligibleTarget -- Phase 12's root-access
// eligibility fix. Pure and ns-free, same as scheduler.js's sampled functions.
import { describe, it, expect } from 'vitest';
import { isEligibleTarget } from '../src/targets.js';

describe('isEligibleTarget', () => {
  const base = { rooted: true, maxMoney: 1_000_000, requiredHackingLevel: 10, myHackLevel: 100 };

  it('accepts a target that meets all conditions', () => {
    expect(isEligibleTarget(base)).toBe(true);
  });

  it('rejects an unrooted target -- the Phase 12 regression case', () => {
    expect(isEligibleTarget({ ...base, rooted: false })).toBe(false);
  });

  it('rejects a target with no max money', () => {
    expect(isEligibleTarget({ ...base, maxMoney: 0 })).toBe(false);
  });

  it('rejects requiredHackingLevel exactly at half myHackLevel (strict < preserved)', () => {
    expect(isEligibleTarget({ ...base, requiredHackingLevel: 50, myHackLevel: 100 })).toBe(false);
  });

  it('accepts requiredHackingLevel just under half myHackLevel', () => {
    expect(isEligibleTarget({ ...base, requiredHackingLevel: 49, myHackLevel: 100 })).toBe(true);
  });

  it('documents the known no-eligible-targets-at-level-1 behavior', () => {
    expect(isEligibleTarget({ ...base, myHackLevel: 1, requiredHackingLevel: 1 })).toBe(false);
  });
});
