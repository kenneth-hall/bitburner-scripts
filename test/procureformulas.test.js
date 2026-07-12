// Unit tests for src/procureformulas.js's pure logic: planFormulasPurchase.
import { describe, it, expect } from 'vitest';
import { planFormulasPurchase } from '../src/procureformulas.js';
import { FORMULAS_COST, FORMULAS_HACKING_LEVEL_THRESHOLD } from '../src/resourcemanager.js';

// A baseline eligible-to-buy input; individual tests override one field.
const ELIGIBLE = {
  hasFormulas: false,
  disabled: false,
  hacking: FORMULAS_HACKING_LEVEL_THRESHOLD + 1,
  hasTor: true,
  money: FORMULAS_COST,
  holdback: 0,
  stale: false,
};

describe('planFormulasPurchase', () => {
  it('all conditions met -- buy', () => {
    expect(planFormulasPurchase(ELIGIBLE)).toEqual({ action: 'buy' });
  });

  it('already owned wins over everything -- done', () => {
    expect(planFormulasPurchase({ ...ELIGIBLE, hasFormulas: true, disabled: true, stale: true })).toEqual({ action: 'done' });
  });

  it('disable flag vetoes an otherwise-eligible buy -- disabled', () => {
    expect(planFormulasPurchase({ ...ELIGIBLE, disabled: true })).toEqual({ action: 'disabled' });
  });

  it('owned takes precedence over disabled', () => {
    expect(planFormulasPurchase({ ...ELIGIBLE, hasFormulas: true, disabled: true })).toEqual({ action: 'done' });
  });

  it('at exactly the threshold (not strictly greater) -- wait-level', () => {
    expect(planFormulasPurchase({ ...ELIGIBLE, hacking: FORMULAS_HACKING_LEVEL_THRESHOLD })).toEqual({ action: 'wait-level' });
  });

  it('one above the threshold clears the level gate', () => {
    expect(planFormulasPurchase({ ...ELIGIBLE, hacking: FORMULAS_HACKING_LEVEL_THRESHOLD + 1 })).toEqual({ action: 'buy' });
  });

  it('eligible level but no TOR -- wait-tor', () => {
    expect(planFormulasPurchase({ ...ELIGIBLE, hasTor: false })).toEqual({ action: 'wait-tor' });
  });

  it('stale finance state defers the buy -- wait-stale', () => {
    expect(planFormulasPurchase({ ...ELIGIBLE, stale: true })).toEqual({ action: 'wait-stale' });
  });

  it('affordable only by dipping below holdback -- wait-cash', () => {
    const holdback = 110_000;
    expect(planFormulasPurchase({ ...ELIGIBLE, money: FORMULAS_COST + holdback - 1, holdback })).toEqual({ action: 'wait-cash' });
  });

  it('boundary money - cost === holdback -- buy', () => {
    const holdback = 110_000;
    expect(planFormulasPurchase({ ...ELIGIBLE, money: FORMULAS_COST + holdback, holdback })).toEqual({ action: 'buy' });
  });

  it('cannot afford at all -- wait-cash', () => {
    expect(planFormulasPurchase({ ...ELIGIBLE, money: FORMULAS_COST - 1, holdback: 0 })).toEqual({ action: 'wait-cash' });
  });

  it('precedence: level gate is checked before TOR/stale/cash', () => {
    // Below threshold with no TOR, stale, and broke still reports the level wait.
    expect(
      planFormulasPurchase({ ...ELIGIBLE, hacking: 1, hasTor: false, stale: true, money: 0 })
    ).toEqual({ action: 'wait-level' });
  });

  it('precedence: TOR is checked before stale/cash', () => {
    expect(planFormulasPurchase({ ...ELIGIBLE, hasTor: false, stale: true, money: 0 })).toEqual({ action: 'wait-tor' });
  });
});
