// Integration tests for graftplanner.js's main() (Phase 41 WI2's acceptance criteria B4/B5,
// carried forward through Phase 43 WI-C's rebuild on graftmath.js's beam search).
//
// The pure math (expForLevel, statHoursRemaining, bottleneckHours, planGraftLadder itself,
// prerequisite admissibility, entropy correctness, beam-width convergence) moved to
// src/graftmath.js and is tested there (test/graftmath.test.js) -- this file now only tests
// the thin `ns`-touching glue: does main() assemble candidates correctly, exclude owned augs,
// resolve the live BitNode's config, read the grind-rate override/goal-state income signal,
// and write graft-plan.json in the expected shape.
import { describe, it, expect } from 'vitest';
import {
  main,
  STATS,
  NODE_MULT,
  TARGET_LEVEL,
  ENTROPY_PER_GRAFT,
  DEFAULT_GRIND_EXP_PER_SEC,
  DEFAULT_MAX_SPEND,
  PLAN_FILE,
  SCHEMA_VERSION,
} from '../src/graftplanner.js';

describe('graftplanner.js re-exports Phase 41\'s BN10 constants unchanged (WC5)', () => {
  it('NODE_MULT/TARGET_LEVEL/ENTROPY_PER_GRAFT/DEFAULT_GRIND_EXP_PER_SEC/DEFAULT_MAX_SPEND still read the exact BN10 values', () => {
    expect(NODE_MULT).toBe(0.4);
    expect(TARGET_LEVEL).toBe(100);
    expect(ENTROPY_PER_GRAFT).toBe(0.98);
    expect(DEFAULT_GRIND_EXP_PER_SEC).toBe(2.62);
    expect(DEFAULT_MAX_SPEND).toBe(1_500_000_000);
  });
});

describe('main() (B4 -- fake ns integration)', () => {
  function makeFakeNs({
    owned = [], catalog = [], stats = {}, prices = {}, times = {}, prereqs = {},
    args = [], currentNode = 10, goalState = null,
  } = {}) {
    const written = {};
    const files = {};
    if (goalState) files['goal-state.json'] = JSON.stringify(goalState);
    return {
      args,
      disableLog: () => {},
      sleep: async () => {},
      tprint: () => {},
      read: (file) => files[file] ?? '',
      write: (file, content) => { written[file] = content; },
      format: { number: (n) => String(n) },
      getResetInfo: () => ({ currentNode }),
      getPlayer: () => ({
        mults: { strength: 1.3824, defense: 1.3824, dexterity: 1.3824, agility: 1.3824 },
        exp: { strength: 1000, defense: 1000, dexterity: 1000, agility: 1000 },
        skills: { strength: 74, defense: 74, dexterity: 74, agility: 74 },
        entropy: 0,
        money: 3_000_000,
      }),
      singularity: {
        getOwnedAugmentations: () => owned,
        getAugmentationStats: (name) => stats[name] || { strength: 1, defense: 1, dexterity: 1, agility: 1 },
        getAugmentationPrereq: (name) => prereqs[name] || [],
      },
      grafting: {
        getGraftableAugmentations: () => catalog,
        getAugmentationGraftPrice: (name) => prices[name] ?? 1000,
        getAugmentationGraftTime: (name) => times[name] ?? 3_600_000,
      },
      _written: written,
    };
  }

  it('B4: writes graft-plan.json with schemaVersion, bitNode, and every computation input', async () => {
    const fakeNs = makeFakeNs({
      catalog: ['TestAug'],
      stats: { TestAug: { strength: 1.1, defense: 1, dexterity: 1, agility: 1 } },
      prices: { TestAug: 500_000 },
      times: { TestAug: 3_600_000 },
    });
    await main(fakeNs);
    expect(fakeNs._written[PLAN_FILE]).toBeDefined();
    const record = JSON.parse(fakeNs._written[PLAN_FILE]);
    expect(record.schemaVersion).toBe(SCHEMA_VERSION);
    expect(record.bitNode).toBe(10);
    expect(record.inputs).toBeDefined();
    expect(record.inputs.currentMults).toEqual({ strength: 1.3824, defense: 1.3824, dexterity: 1.3824, agility: 1.3824 });
    expect(record.inputs.banked).toEqual({ strength: 1000, defense: 1000, dexterity: 1000, agility: 1000 });
    expect(record.inputs.money).toBe(3_000_000);
    expect(record.inputs.entropy).toBe(0);
    expect(record.inputs.grindRatePerStat).toBe(DEFAULT_GRIND_EXP_PER_SEC);
    expect(record.inputs.entropyPerGraft).toBe(ENTROPY_PER_GRAFT);
    expect(typeof record.timestamp).toBe('number');
    expect(typeof record.totalHours).toBe('number');
    expect(Array.isArray(record.ladder)).toBe(true);
  });

  it('B5 (via main): an owned aug never reaches the plan even though the catalog lists it', async () => {
    const fakeNs = makeFakeNs({
      owned: ['AlreadyOwned'],
      catalog: ['AlreadyOwned', 'NotOwned'],
      stats: {
        AlreadyOwned: { strength: 1.5, defense: 1, dexterity: 1, agility: 1 },
        NotOwned: { strength: 1.1, defense: 1, dexterity: 1, agility: 1 },
      },
      prices: { AlreadyOwned: 1, NotOwned: 500_000 },
      times: { AlreadyOwned: 3_600_000, NotOwned: 3_600_000 },
    });
    await main(fakeNs);
    const record = JSON.parse(fakeNs._written[PLAN_FILE]);
    expect(record.ladder.some((s) => s.name === 'AlreadyOwned')).toBe(false);
  });

  it('BitNode-aware (Phase 43): resolves BN9\'s config, not BN10\'s, when getResetInfo says BN9', async () => {
    const fakeNs = makeFakeNs({ currentNode: 9, catalog: [] });
    await main(fakeNs);
    const record = JSON.parse(fakeNs._written[PLAN_FILE]);
    expect(record.bitNode).toBe(9);
    expect(record.inputs.nodeMult).toBe(0.45);
    expect(record.inputs.grindRatePerStat).toBe(0.179); // NODE_CONFIGS[9]'s calibration-pending placeholder
  });

  it('a single scalar grind-rate CLI override (ns.args[1], old BN10 call shape) is honoured', async () => {
    const fakeNs = makeFakeNs({ args: [DEFAULT_MAX_SPEND, 0.5], catalog: [] });
    await main(fakeNs);
    const record = JSON.parse(fakeNs._written[PLAN_FILE]);
    expect(record.inputs.grindRatePerStat).toBe(0.5);
  });

  it('a per-stat grind-rate CLI override (four positional args, CALIBRATE_GRIND\'s shape) is honoured', async () => {
    const fakeNs = makeFakeNs({ args: [DEFAULT_MAX_SPEND, 0.1, 0.2, 0.3, 0.4], catalog: [] });
    await main(fakeNs);
    const record = JSON.parse(fakeNs._written[PLAN_FILE]);
    expect(record.inputs.grindRatePerStat).toEqual({ strength: 0.1, defense: 0.2, dexterity: 0.3, agility: 0.4 });
  });

  it('reads a live, fresh goal-state.json income rate for the money-wait term', async () => {
    const fakeNs = makeFakeNs({
      catalog: [],
      goalState: { timestamp: Date.now(), income: { perSec24h: 12_345 } },
    });
    await main(fakeNs);
    const record = JSON.parse(fakeNs._written[PLAN_FILE]);
    expect(record.inputs.incomeRatePerSecDollars).toBe(12_345);
  });

  it('a missing/stale goal-state.json collapses income rate to 0, not a crash', async () => {
    const fakeNs = makeFakeNs({ catalog: [] }); // no goalState at all
    await main(fakeNs);
    const record = JSON.parse(fakeNs._written[PLAN_FILE]);
    expect(record.inputs.incomeRatePerSecDollars).toBe(0);
  });

  it('only combat-touching candidates (at least one mult != 1) reach the plan', async () => {
    const fakeNs = makeFakeNs({
      catalog: ['NotCombat', 'IsCombat'],
      stats: {
        NotCombat: { strength: 1, defense: 1, dexterity: 1, agility: 1, hacking: 1.5 },
        IsCombat: { strength: 1.1, defense: 1, dexterity: 1, agility: 1 },
      },
      prices: { NotCombat: 1000, IsCombat: 1000 },
      times: { NotCombat: 3_600_000, IsCombat: 3_600_000 },
    });
    await main(fakeNs);
    const record = JSON.parse(fakeNs._written[PLAN_FILE]);
    expect(record.candidateCount).toBe(1);
  });

  it('a getGraftableAugmentations throw aborts with a fatal record, not a crash', async () => {
    const fakeNs = makeFakeNs({});
    fakeNs.grafting.getGraftableAugmentations = () => { throw new Error('boom'); };
    await main(fakeNs);
    const record = JSON.parse(fakeNs._written[PLAN_FILE]);
    expect(typeof record.fatal).toBe('string');
    expect(record.ladder).toBeUndefined();
  });
});

describe('STATS re-export', () => {
  it('matches graftmath.js\'s canonical stat order', () => {
    expect(STATS).toEqual(['strength', 'defense', 'dexterity', 'agility']);
  });
});
