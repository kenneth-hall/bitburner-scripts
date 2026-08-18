// Pure-function tests for Phase 41 WI2's graftplanner.js (phase-41-bn10-entry.spec.md's
// acceptance criteria B1-B5). expForLevel/remainingExp/planGraftLadder are all ns-free; main()
// is thin plumbing around them (catalog reads -> planGraftLadder -> ns.write), covered here
// only for B4's output-shape requirement via a minimal fake `ns`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  expForLevel,
  remainingExp,
  planGraftLadder,
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

const fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'test/fixtures/graft-catalog-bn10.json'), 'utf8')
);

// PREREQUISITES ARE NOT IN THE FIXTURE (graftrecon.js never read getAugmentationPrereq --
// see the fixture's own provenance note). This is the real, tiered prerequisite structure
// for this candidate set (Roman-numeral tiers require the previous tier; Graphene-* upgrades
// require their base implant) -- static game data, not a guess, and exactly the relationship
// the spec calls out by name ("the features doc's own greedy order contains Augmented
// Targeting II without Augmented Targeting I").
const PREREQ_MAP = {
  'Augmented Targeting II': ['Augmented Targeting I'],
  'Augmented Targeting III': ['Augmented Targeting II'],
  'Combat Rib II': ['Combat Rib I'],
  'Combat Rib III': ['Combat Rib II'],
  'LuminCloaking-V2 Skin Implant': ['LuminCloaking-V1 Skin Implant'],
  'Graphene BrachiBlades Upgrade': ['BrachiBlades'],
  'Graphene Bionic Arms Upgrade': ['Bionic Arms'],
  'Graphene Bionic Legs Upgrade': ['Bionic Legs'],
  'Graphene Bionic Spine Upgrade': ['Bionic Spine'],
};

function fixtureCandidates() {
  return fixture.candidates.map((c) => ({ ...c, prereqs: PREREQ_MAP[c.name] || [] }));
}

describe('expForLevel', () => {
  it('B2: expForLevel(100, 1.28) = 5417/stat (BN6\'s measured combat-gate cost), x4 = 21668', () => {
    const perStat = expForLevel(100, 1.28);
    expect(perStat).toBeCloseTo(5416.95, 1);
    expect(perStat * 4).toBeCloseTo(21667.78, 1);
  });

  it('is monotonically increasing in level at a fixed mult', () => {
    const mult = 0.6;
    expect(expForLevel(50, mult)).toBeLessThan(expForLevel(75, mult));
    expect(expForLevel(75, mult)).toBeLessThan(expForLevel(100, mult));
  });

  it('is monotonically decreasing in mult at a fixed level (a higher mult is always cheaper)', () => {
    expect(expForLevel(100, 0.8)).toBeLessThan(expForLevel(100, 0.5));
  });
});

describe('remainingExp', () => {
  it('sums per-stat exp clamped at >=0 -- an already-capped stat contributes 0, never a negative correction', () => {
    const mults = { strength: 2, defense: 2, dexterity: 2, agility: 2 };
    // strength/defense already WAY past target (huge banked exp); dexterity/agility at 0.
    const needAt100 = expForLevel(TARGET_LEVEL, 2 * NODE_MULT);
    const banked = {
      strength: needAt100 * 10, // far past requirement
      defense: needAt100 * 10,
      dexterity: 0,
      agility: 0,
    };
    const result = remainingExp(mults, banked, { nodeMult: NODE_MULT, targetLevel: TARGET_LEVEL });
    // If a naive (sum(need) - sum(banked)) model were used, the huge strength/defense surplus
    // would swamp the dexterity/agility deficit and could even go negative. The correct,
    // per-stat-clamped model must equal exactly 2x the single-stat need (str/def contribute 0).
    expect(result).toBeCloseTo(needAt100 * 2, 6);
    expect(result).toBeGreaterThan(0);
  });

  it('matches the BN6 formula total exactly at mult 1.28, nodeMult 1, banked 0 (B2 cross-check)', () => {
    const mults = { strength: 1.28, defense: 1.28, dexterity: 1.28, agility: 1.28 };
    const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
    const total = remainingExp(mults, banked, { nodeMult: 1, targetLevel: 100 });
    expect(total).toBeCloseTo(21667.78, 1);
  });

  it('reproduces the live BN10 k=0 baseline exactly: 454,176 total remaining exp at combat 74', () => {
    const currentMults = fixture.playerAtCapture.combatMults;
    const banked = {};
    for (const stat of STATS) banked[stat] = expForLevel(74, currentMults[stat] * fixture.nodeMult);
    const total = remainingExp(currentMults, banked, { nodeMult: fixture.nodeMult, targetLevel: TARGET_LEVEL });
    expect(total).toBeCloseTo(454175.97, 0);
  });
});

describe('planGraftLadder', () => {
  it('B5: never emits an already-owned/grafted aug, even if it would otherwise score best', () => {
    const currentMults = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
    const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
    const candidates = [
      { name: 'CheapOwned', price: 1, graftHours: 0.1, mults: { strength: 5, defense: 5, dexterity: 5, agility: 5 }, prereqs: [] },
      { name: 'Unowned', price: 1000, graftHours: 1, mults: { strength: 1.1, defense: 1.1, dexterity: 1.1, agility: 1.1 }, prereqs: [] },
    ];
    const { ladder, projections } = planGraftLadder(candidates, currentMults, banked, {
      nodeMult: 1, targetLevel: 100, grindExpPerSec: 1, entropyPerGraft: 0.98,
      owned: new Set(['CheapOwned']), maxSpend: 1e9, moneyAvailable: 1e9,
    });
    expect(ladder.some((s) => s.name === 'CheapOwned')).toBe(false);
    expect(projections.some((s) => s.name === 'CheapOwned')).toBe(false);
  });

  it('B5: never emits a candidate whose prerequisites are unmet (and not satisfiable within the ladder)', () => {
    const currentMults = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
    const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
    const candidates = [
      // Tier II is the BEST score by far, but its prereq (Tier I) is never made available.
      { name: 'Tier II', price: 100, graftHours: 0.1, mults: { strength: 3, defense: 3, dexterity: 3, agility: 3 }, prereqs: ['Tier I'] },
      { name: 'Filler', price: 100, graftHours: 0.1, mults: { strength: 1.05, defense: 1, dexterity: 1, agility: 1 }, prereqs: [] },
    ];
    const { ladder, projections } = planGraftLadder(candidates, currentMults, banked, {
      // entropyPerGraft: 1 (no tax) isolates prerequisite-filtering from the entropy/net-value
      // tradeoff -- with the real 0.98 tax a single-stat filler aug can legitimately be a NET
      // NEGATIVE pick (entropy taxes all four stats while it only helps one), which is a
      // correct model behavior covered separately, not what THIS test is checking.
      nodeMult: 1, targetLevel: 100, grindExpPerSec: 1, entropyPerGraft: 1,
      owned: new Set(), maxSpend: 1e9, moneyAvailable: 1e9,
    });
    expect(ladder.some((s) => s.name === 'Tier II')).toBe(false);
    expect(projections.some((s) => s.name === 'Tier II')).toBe(false);
    // Filler (no prereq) is still admissible and should appear.
    expect(ladder.some((s) => s.name === 'Filler')).toBe(true);
  });

  it('B5: admits a tiered candidate once its prerequisite is chosen earlier in the SAME ladder', () => {
    const currentMults = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
    const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
    const candidates = [
      { name: 'Tier I', price: 100, graftHours: 0.1, mults: { strength: 1.1, defense: 1, dexterity: 1, agility: 1 }, prereqs: [] },
      { name: 'Tier II', price: 100, graftHours: 0.1, mults: { strength: 1.3, defense: 1, dexterity: 1, agility: 1 }, prereqs: ['Tier I'] },
    ];
    const { ladder } = planGraftLadder(candidates, currentMults, banked, {
      nodeMult: 1, targetLevel: 100, grindExpPerSec: 1, entropyPerGraft: 0.98,
      owned: new Set(), maxSpend: 1e9, moneyAvailable: 1e9,
    });
    const names = ladder.map((s) => s.name);
    expect(names).toContain('Tier I');
    expect(names).toContain('Tier II');
    expect(names.indexOf('Tier I')).toBeLessThan(names.indexOf('Tier II'));
  });

  it('B3: selects the totalHours MINIMUM, not the maximum affordable -- proven by a cheaper-but-slower tail', () => {
    const currentMults = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
    const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
    const candidates = [
      // Step A: efficient, cuts remaining exp a lot for modest graft time -- lowers totalHours.
      { name: 'Efficient', price: 100, graftHours: 1, mults: { strength: 2, defense: 2, dexterity: 2, agility: 2 }, prereqs: [] },
      // Step B: cheap in MONEY, but a long graft for a tiny stat gain -- raises totalHours
      // back up even though it is affordable and would score positively on $ alone if graft
      // time were ignored. Its presence in `projections` (but not `ladder`) is what B3 proves.
      { name: 'SlowTail', price: 10, graftHours: 50, mults: { strength: 1.01, defense: 1, dexterity: 1, agility: 1 }, prereqs: [] },
    ];
    const { ladder, chosenK, projections } = planGraftLadder(candidates, currentMults, banked, {
      nodeMult: 1, targetLevel: 100, grindExpPerSec: 5, entropyPerGraft: 0.98,
      owned: new Set(), maxSpend: 1e9, moneyAvailable: 1e9,
    });
    // Both candidates are affordable and admissible -- the walk reaches k=2 in `projections`...
    expect(projections.some((s) => s.name === 'SlowTail')).toBe(true);
    // ...but chosenK must stop BEFORE the slow tail's 50h graft cost outweighs its tiny exp
    // saving, i.e. chosenK is the k=1 (Efficient-only) row, not k=2.
    expect(chosenK).toBe(1);
    expect(ladder.map((s) => s.name)).toEqual(['Efficient']);
    // And totalHours actually rises from k=1 to k=2, which is what makes this a real proof
    // (not just "SlowTail never got picked" for an unrelated reason).
    const step1 = projections.find((s) => s.k === 1);
    const step2 = projections.find((s) => s.k === 2);
    expect(step2.totalHours).toBeGreaterThan(step1.totalHours);
  });

  it('B1 golden (live BN10 fixture, combat 74, corrected for prerequisite filtering): reproduces the k=0..4 prefix of features doc Section 3.2 exactly, then diverges once Augmented Targeting II is correctly gated on Augmented Targeting I', () => {
    const candidates = fixtureCandidates();
    const currentMults = fixture.playerAtCapture.combatMults;
    const nodeMult = fixture.nodeMult;
    const banked = {};
    for (const stat of STATS) banked[stat] = expForLevel(74, currentMults[stat] * nodeMult);

    const { ladder, chosenK, projections } = planGraftLadder(candidates, currentMults, banked, {
      nodeMult, targetLevel: TARGET_LEVEL, grindExpPerSec: 2.62, entropyPerGraft: ENTROPY_PER_GRAFT,
      owned: new Set(), maxSpend: DEFAULT_MAX_SPEND, moneyAvailable: fixture.playerAtCapture.money,
    });

    // k=0 baseline: EXACT match to the features doc (454,176 remaining, 48.2h) -- no
    // prerequisite filtering applies before any grafts are chosen.
    expect(projections[0].remainingExp).toBeCloseTo(454175.97, 0);
    expect(projections[0].totalHours).toBeCloseTo(48.15, 1);

    // k=1..4: the doc's own greedy order (HemoRecirculator, Wired Reflexes, Combat Rib I,
    // Bionic Spine) needs no prerequisites among these four, so the corrected model matches
    // the doc's unfiltered one exactly through k=4 (within 2%, per B1's tolerance).
    const byK = Object.fromEntries(projections.map((s) => [s.k, s]));
    expect(byK[1].name).toBe('HemoRecirculator');
    expect(byK[2].name).toBe('Wired Reflexes');
    expect(byK[3].name).toBe('Combat Rib I');
    expect(byK[3].cumCost).toBeCloseTo(213_750_000, -6);
    expect(byK[3].totalHours).toBeCloseTo(27.6, 1);
    expect(byK[4].name).toBe('Bionic Spine');
    expect(byK[4].cumCost).toBeCloseTo(589_000_000, -7);
    expect(byK[4].totalHours).toBeCloseTo(11.6, 1);

    // CORRECTED LADDER (documented deviation from features doc Section 3.2's k=7/$919m/9.6h,
    // per B1's escape hatch -- that table was computed WITHOUT prerequisite filtering, and
    // "Augmented Targeting II" cannot be bought before "Augmented Targeting I" in this
    // model). The prerequisite constraint reroutes the back half of the ladder through
    // Combat Rib II / Augmented Targeting I / the two LuminCloaking tiers before Augmented
    // Targeting II becomes admissible, pushing the true totalHours minimum out to k=9.
    expect(chosenK).toBe(9);
    expect(ladder.map((s) => s.name)).toEqual([
      'HemoRecirculator', 'Wired Reflexes', 'Combat Rib I', 'Bionic Spine',
      'Combat Rib II', 'Augmented Targeting I', 'LuminCloaking-V1 Skin Implant',
      'LuminCloaking-V2 Skin Implant', 'Augmented Targeting II',
    ]);
    const chosenStep = projections.find((s) => s.k === chosenK);
    expect(chosenStep.totalHours).toBeCloseTo(9.91, 1);
    expect(chosenStep.cumCost).toBeCloseTo(1_061_250_000, -7);

    // The minimum is real, not an artifact of stopping early -- totalHours rises immediately
    // past chosenK (k=10 costs more AND takes longer overall).
    const nextStep = projections.find((s) => s.k === chosenK + 1);
    if (nextStep) expect(nextStep.totalHours).toBeGreaterThan(chosenStep.totalHours);
  });
});

describe('main() (B4 -- fake ns integration)', () => {
  function makeFakeNs({ owned = [], catalog = [], stats = {}, prices = {}, times = {}, prereqs = {} } = {}) {
    const written = {};
    return {
      args: [],
      disableLog: () => {},
      sleep: async () => {},
      tprint: () => {},
      write: (file, content) => { written[file] = content; },
      format: { number: (n) => String(n) },
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

  it('B4: writes graft-plan.json with schemaVersion and every computation input', async () => {
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
    expect(record.inputs).toBeDefined();
    expect(record.inputs.currentMults).toEqual({ strength: 1.3824, defense: 1.3824, dexterity: 1.3824, agility: 1.3824 });
    expect(record.inputs.banked).toEqual({ strength: 1000, defense: 1000, dexterity: 1000, agility: 1000 });
    expect(record.inputs.money).toBe(3_000_000);
    expect(record.inputs.entropy).toBe(0);
    expect(record.inputs.grindExpPerSec).toBe(DEFAULT_GRIND_EXP_PER_SEC);
    expect(record.inputs.entropyPerGraft).toBe(ENTROPY_PER_GRAFT);
    expect(typeof record.timestamp).toBe('number');
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
    const allNames = [...record.ladder, ...record.projections].map((s) => s.name);
    expect(allNames).not.toContain('AlreadyOwned');
  });
});
