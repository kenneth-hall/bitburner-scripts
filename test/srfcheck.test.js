// Tests for Phase 43 WI-E's src/srfcheck.js -- the machine-checked S-RF re-verification
// gate feeding the Section 11 (Phase-42 disposition) decision.
import { describe, it, expect } from 'vitest';
import {
  main,
  sumActionOutcomes,
  computeDominantRealisedSuccess,
  MIN_ATTEMPTS,
} from '../src/srfcheck.js';

describe('sumActionOutcomes', () => {
  it('sums attempts/successes/rankSum across every level key', () => {
    const byLevel = {
      10: { attempts: 20, successes: 18, rankSum: 100 },
      20: { attempts: 30, successes: 29, rankSum: 200 },
    };
    expect(sumActionOutcomes(byLevel)).toEqual({ attempts: 50, successes: 47, rankSum: 300 });
  });

  it('handles an empty/missing byLevel without crashing', () => {
    expect(sumActionOutcomes({})).toEqual({ attempts: 0, successes: 0, rankSum: 0 });
    expect(sumActionOutcomes(undefined)).toEqual({ attempts: 0, successes: 0, rankSum: 0 });
  });
});

describe('computeDominantRealisedSuccess', () => {
  it('picks the action with the largest summed rankSum as dominant', () => {
    const actions = {
      Investigation: { byLevel: { 21: { attempts: 270, successes: 2, rankSum: 5 } } },
      Tracking: { byLevel: { 136: { attempts: 1499, successes: 1499, rankSum: 71000 } } },
    };
    const result = computeDominantRealisedSuccess(actions);
    expect(result.dominantAction).toBe('Tracking');
  });

  it('computes realisedSuccess = successes/attempts for the dominant action', () => {
    const actions = {
      Tracking: { byLevel: { 100: { attempts: 200, successes: 180, rankSum: 5000 } } },
    };
    const result = computeDominantRealisedSuccess(actions);
    expect(result.realisedSuccess).toBeCloseTo(0.9, 6);
  });

  it('srfProtected is realisedSuccess >= 0.90, exactly as bladeburnermanager.js\'s own REALISED_FLOOR_MIN_SUCCESS', () => {
    const protectedActions = { A: { byLevel: { 1: { attempts: 100, successes: 90, rankSum: 1000 } } } };
    expect(computeDominantRealisedSuccess(protectedActions).srfProtected).toBe(true);

    const unprotectedActions = { A: { byLevel: { 1: { attempts: 100, successes: 89, rankSum: 1000 } } } };
    expect(computeDominantRealisedSuccess(unprotectedActions).srfProtected).toBe(false);
  });

  it('below MIN_ATTEMPTS -- not enough evidence -- realisedSuccess and srfProtected are both null, not a guess', () => {
    const thinActions = { A: { byLevel: { 1: { attempts: MIN_ATTEMPTS - 1, successes: MIN_ATTEMPTS - 1, rankSum: 1000 } } } };
    const result = computeDominantRealisedSuccess(thinActions);
    expect(result.realisedSuccess).toBeNull();
    expect(result.srfProtected).toBeNull();
    expect(result.meetsMinAttempts).toBe(false);
  });

  it('at EXACTLY MIN_ATTEMPTS, evidence is sufficient (>=, not >)', () => {
    const actions = { A: { byLevel: { 1: { attempts: MIN_ATTEMPTS, successes: MIN_ATTEMPTS, rankSum: 1000 } } } };
    const result = computeDominantRealisedSuccess(actions);
    expect(result.meetsMinAttempts).toBe(true);
    expect(result.realisedSuccess).toBe(1);
  });

  it('sums an action\'s outcomes across MULTIPLE levels, not just its current one', () => {
    const actions = {
      Tracking: {
        byLevel: {
          120: { attempts: 500, successes: 500, rankSum: 20000 },
          136: { attempts: 999, successes: 999, rankSum: 51000 },
        },
      },
    };
    const result = computeDominantRealisedSuccess(actions);
    expect(result.attempts).toBe(1499);
    expect(result.successes).toBe(1499);
  });

  it('an empty ledger returns nulls, not a crash or a false positive', () => {
    const result = computeDominantRealisedSuccess({});
    expect(result.dominantAction).toBeNull();
    expect(result.realisedSuccess).toBeNull();
    expect(result.srfProtected).toBeNull();
  });
});

describe('main() (fake ns integration)', () => {
  function makeFakeNs(stateContent) {
    const written = {};
    return {
      disableLog: () => {},
      tprint: () => {},
      read: (file) => (file === 'bladeburner-state.json' ? JSON.stringify(stateContent) : ''),
      write: (file, content) => { written[file] = content; },
      _written: written,
    };
  }

  it('WE4: the output file carries a numeric realisedSuccess and a boolean srfProtected', async () => {
    const fakeNs = makeFakeNs({
      levelGovernor: {
        actions: {
          Tracking: { byLevel: { 136: { attempts: 1499, successes: 1499, rankSum: 71000 } } },
        },
      },
    });
    await main(fakeNs);
    const key = Object.keys(fakeNs._written).find((k) => /^srfcheck-\d+\.json$/.test(k));
    expect(key).toBeDefined();
    const record = JSON.parse(fakeNs._written[key]);
    expect(typeof record.realisedSuccess).toBe('number');
    expect(typeof record.srfProtected).toBe('boolean');
    expect(record.dominantAction).toBe('Tracking');
  });

  it('a missing bladeburner-state.json (engine never launched yet) does not crash -- reports stateSourceFound:false and null evidence', async () => {
    const fakeNs = makeFakeNs(null);
    fakeNs.read = () => '';
    await main(fakeNs);
    const key = Object.keys(fakeNs._written).find((k) => /^srfcheck-\d+\.json$/.test(k));
    const record = JSON.parse(fakeNs._written[key]);
    expect(record.stateSourceFound).toBe(false);
    expect(record.realisedSuccess).toBeNull();
  });
});
