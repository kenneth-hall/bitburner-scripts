// Unit tests for src/bbskillbuy.js's success-skill allocator.
//
// The bug this guards: the success multiplier is a PRODUCT,
// (1 + 0.03*BI) * (1 + 0.04*DO), and the original spender walked a plain list, so
// whichever skill came second was starved. Measured live in BN10: 535,869 SP put
// Blade's Intuition 250 -> 756 and left Digital Observer at 250, reporting [ok].
import { describe, it, expect } from 'vitest';
import { pickNextSuccessLevel, successMultiplierAt } from '../src/bbskillbuy.js';

const walk = ({ points, biCost = 10, doCost = 10, target = 2000, bi = 0, doL = 0 }) => {
  let pts = points;
  for (let i = 0; i < 100000; i += 1) {
    const choice = pickNextSuccessLevel({ biLevel: bi, doLevel: doL, biCost, doCost, points: pts, target });
    if (choice === null) break;
    if (choice === "Blade's Intuition") { bi += 1; pts -= biCost; } else { doL += 1; pts -= doCost; }
  }
  return { bi, doL, mult: successMultiplierAt(bi, doL), left: pts };
};

describe('pickNextSuccessLevel', () => {
  it('beats an all-in-one-skill stack at identical spend', () => {
    const balanced = walk({ points: 1000 });
    expect(balanced.mult).toBeGreaterThan(successMultiplierAt(100, 0));
    // ~1.9x better, which is the same order as the ~1.8x measured lost in BN10.
    expect(balanced.mult / successMultiplierAt(100, 0)).toBeGreaterThan(1.7);
  });

  it('keeps the two skills close rather than draining one', () => {
    const { bi, doL } = walk({ points: 1000 });
    expect(Math.abs(bi - doL)).toBeLessThan(15);
    expect(bi).toBeGreaterThan(0);
    expect(doL).toBeGreaterThan(0);
  });

  it('leans to Digital Observer, which has the larger per-level coefficient', () => {
    const { bi, doL } = walk({ points: 1000 });
    expect(doL).toBeGreaterThanOrEqual(bi);
  });

  it('respects the cheaper skill when costs differ', () => {
    const { bi, doL } = walk({ points: 1000, biCost: 5, doCost: 40 });
    expect(bi).toBeGreaterThan(doL);
  });

  it('returns null when nothing is affordable', () => {
    expect(pickNextSuccessLevel({ biLevel: 0, doLevel: 0, biCost: 500, doCost: 500, points: 10, target: 200 })).toBeNull();
  });

  it('returns null once both are at target', () => {
    expect(pickNextSuccessLevel({ biLevel: 200, doLevel: 200, biCost: 1, doCost: 1, points: 1e9, target: 200 })).toBeNull();
  });

  it('still buys the other skill when one is maxed out', () => {
    const choice = pickNextSuccessLevel({ biLevel: 200, doLevel: 10, biCost: 1, doCost: 1, points: 1e9, target: 200 });
    expect(choice).toBe('Digital Observer');
  });

  it('treats a non-finite cost (skill at max) as unbuyable', () => {
    const choice = pickNextSuccessLevel({ biLevel: 5, doLevel: 5, biCost: Infinity, doCost: 10, points: 1000, target: 200 });
    expect(choice).toBe('Digital Observer');
  });

  it('never overspends the bank', () => {
    const { left } = walk({ points: 1000 });
    expect(left).toBeGreaterThanOrEqual(0);
  });
});
