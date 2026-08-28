// Unit tests for src/hacknetboost.js's pure helpers -- the one-off that bought
// hacknet-server-0's remaining cheap headroom (cores 10->14, RAM 64->128 GB).
import { describe, it, expect } from 'vitest';
import { ramStepsNeeded, planBoost, DEFAULT_CAP } from '../src/hacknetboost.js';

describe('ramStepsNeeded', () => {
  it('counts doublings', () => {
    expect(ramStepsNeeded(1, 64)).toBe(6);
    expect(ramStepsNeeded(64, 128)).toBe(1);
  });
  it('returns 0 when already at or above target', () => {
    expect(ramStepsNeeded(128, 128)).toBe(0);
    expect(ramStepsNeeded(256, 128)).toBe(0);
  });
  it('tolerates junk input rather than returning NaN', () => {
    expect(ramStepsNeeded(0, 64)).toBe(0);
    expect(ramStepsNeeded(64, 0)).toBe(0);
  });
});

describe('planBoost', () => {
  const base = { cores: 10, coreTarget: 14, ram: 64, ramTarget: 128 };

  it('buys when the total is inside the cap', () => {
    const p = planBoost({ ...base, coreCost: 372e6, ramCost: 80e6, cap: 500e6 });
    expect(p.action).toBe('buy');
    expect(p.coreSteps).toBe(4);
    expect(p.ramSteps).toBe(1);
  });

  it('REFUSES above the cap rather than silently part-buying', () => {
    // The live case: $451.9m against a $400m default cap. The estimate that set
    // that default was low (core costs escalate 1.55x per step), and the cap is
    // what caught it instead of the spend just happening.
    const p = planBoost({ ...base, coreCost: 372e6, ramCost: 80e6, cap: DEFAULT_CAP });
    expect(p.action).toBe('refused-cap');
    expect(p.total).toBeCloseTo(452e6, -6);
  });

  it('is a no-op once both targets are met', () => {
    const p = planBoost({ cores: 14, coreTarget: 14, ram: 128, ramTarget: 128, cap: 1e12 });
    expect(p.action).toBe('already-done');
    expect(p.total).toBe(0);
  });

  it('buys only the leg that is still short', () => {
    const p = planBoost({ cores: 14, coreTarget: 14, ram: 64, ramTarget: 128, coreCost: NaN, ramCost: 80e6, cap: 1e12 });
    expect(p.action).toBe('buy');
    expect(p.coreSteps).toBe(0);
    expect(p.ramSteps).toBe(1);
    expect(p.total).toBeCloseTo(80e6, -3);
  });
});
