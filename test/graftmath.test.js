// Pure-function tests for Phase 43 WI-C's src/graftmath.js -- the beam-search graft-ladder
// planner and its supporting pure math (spec acceptance criteria WC1-WC7).
//
// WC1/WC2 NOW RUN AGAINST THE REAL BN9 CAPTURE (test/fixtures/graft-catalog-bn9.json,
// sourced from logs/graftrecon-1787701791849.json -- logs/ is gitignored, so this tracked
// copy is what test fixtures must use, same convention as graft-catalog-bn10.json). An
// earlier draft of this file used a hand-built synthetic fixture instead because no BN9
// capture had been tracked yet; that synthetic case is KEPT below (it demonstrates the
// all-four-stat-only degeneracy with round, hand-verifiable numbers that the real 36-aug
// catalog doesn't offer) but is no longer the only, or the primary, coverage for WC1/WC2.
//
// ⚠️ ONE NUMBER IN THE FIXTURE'S OWN `goldenBeamResults.width300_converged` BLOCK IS NOT
// PREREQUISITE-ADMISSIBLE, and this file does NOT assert it. That block's `picks` includes
// `Augmented Targeting III` without `Augmented Targeting II` (and `Combat Rib III` without
// `Combat Rib II`, `LuminCloaking-V2` without `V1`) -- impossible from an empty owned-set,
// since those tiers require the previous tier already owned (real, static per-augmentation
// game data -- see AUG_PREREQ_MAP below, unchanged from BN10's, since prereqs are not
// BitNode-specific). Reproduced exactly here: running this file's planGraftLadder against
// the fixture WITH prereqs=[] on every candidate (i.e. prereq-blind, the same mistake) gives
// chosenK=11 / 21.17h / that exact picks list -- confirming the golden block was captured by
// a beam search that never read getAugmentationPrereq, the SAME class of error Phase 41's
// original BN10 numbers had (test/fixtures/graft-catalog-bn10.json's own candidates predate
// prereq-aware selection too; see graftplanner.js's git history for that correction). With
// prereqs correctly enforced, the true converged optimum (stable across widths 300/600/1200/
// 2400, verified independently below) is chosenK=10, ~22.62h, a ten-aug set that substitutes
// Augmented Targeting I+II for the inadmissible III, and Combat Rib I for the inadmissible
// III. WC1 asserts THIS number. Shipping a test that asserts the inadmissible figure would
// either force weakening the prereq check (the exact defect WI-C's beam search exists to not
// repeat) or hardcode a special case that contradicts the algorithm's own stated contract --
// both worse than a documented, evidence-backed divergence from the fixture's own note.
// WC2 (width 1) is UNAFFECTED by this -- SPTN-97/Bionic Spine/HemoRecirculator carry no
// prereqs, so the degenerate all-four-stat-only result is identical with or without prereq
// enforcement, and is asserted here exactly as the fixture states it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  STATS,
  NODE_CONFIGS,
  resolveNodeConfig,
  expForLevel,
  statHoursRemaining,
  bottleneckHours,

  moneyWaitHours,
  liveGrindRate,
  multiplyCombatMults,
  applyEntropy,
  planGraftLadder,
} from '../src/graftmath.js';

const bn10Fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'test/fixtures/graft-catalog-bn10.json'), 'utf8')
);
const bn9Fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'test/fixtures/graft-catalog-bn9.json'), 'utf8')
);

// Tiered prerequisite map -- REAL, static per-augmentation game data (Roman-numeral tiers
// require the previous tier; Graphene-* upgrades require their base implant). NOT
// BitNode-specific, so the same map applies to both fixtures; neither graftrecon.js capture
// reads getAugmentationPrereq itself, so tests supply this explicitly (both fixtures'
// provenance notes say so).
const AUG_PREREQ_MAP = {
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

function bn10Candidates() {
  return bn10Fixture.candidates.map((c) => ({ ...c, prereqs: AUG_PREREQ_MAP[c.name] || [] }));
}

// bn9Fixture's candidates are graftrecon.js's raw shape (graftPrice/graftTimeHours/mults with
// UNTOUCHED stats simply absent) -- normalise to planGraftLadder's {price, graftHours, mults:
// CombatQuad} shape, same defaulting graftplanner.js's main() applies (an absent stat mult
// defaults to 1, i.e. "does not touch this stat").
function bn9Candidates({ withPrereqs = true } = {}) {
  return bn9Fixture.candidates.map((c) => {
    const mults = {};
    for (const stat of STATS) mults[stat] = typeof c.mults[stat] === 'number' ? c.mults[stat] : 1;
    return {
      name: c.name,
      price: c.graftPrice,
      graftHours: c.graftTimeHours,
      mults,
      prereqs: withPrereqs ? AUG_PREREQ_MAP[c.name] || [] : [],
    };
  });
}

function bn9PlanOpts(overrides = {}) {
  return {
    nodeMult: bn9Fixture.nodeMult,
    targetLevel: 100,
    grindRatePerStat: 0.179, // the placeholder rate goldenBeamResults' own note names
    entropyPerGraft: 0.98,
    owned: new Set(),
    maxSpend: 1e12, // no spend ceiling for this reproduction -- goldenBeamResults' own note carries no maxSpend either
    moneyAvailable: bn9Fixture.playerAtCapture.money, // $920,101,175.93 -- "bankroll $920m" per spec
    incomeRatePerSecDollars: 89_600, // "income $89,600/s" per spec Section 5's arithmetic
    maxDepth: 14,
    ...overrides,
  };
}

function bn9BankedZero() {
  return { strength: 0, defense: 0, dexterity: 0, agility: 0 }; // combat 1/1/1/1 at capture -- negligible banked exp
}

describe('resolveNodeConfig -- WC5', () => {
  it('WC5: resolveNodeConfig(10, {}) reproduces Phase 41\'s exact BN10 constants', () => {
    const cfg = resolveNodeConfig(10, {});
    expect(cfg.nodeMult).toBe(0.4);
    expect(cfg.targetLevel).toBe(100);
    expect(cfg.entropyPerGraft).toBe(0.98);
    expect(cfg.grindExpPerSec).toBe(2.62);
    expect(cfg.maxSpend).toBe(1_500_000_000);
  });

  it('overrides merge on top of the base config without mutating NODE_CONFIGS', () => {
    const cfg = resolveNodeConfig(9, { grindExpPerSec: 0.222 });
    expect(cfg.grindExpPerSec).toBe(0.222);
    expect(cfg.nodeMult).toBe(NODE_CONFIGS[9].nodeMult);
    expect(NODE_CONFIGS[9].grindExpPerSec).toBe(0.179); // untouched
  });

  it('throws for an unknown BitNode -- no silent fallback to a wrong table', () => {
    expect(() => resolveNodeConfig(1, {})).toThrow();
  });
});

describe('expForLevel', () => {
  it('matches BN6\'s measured combat-gate cost: expForLevel(100, 1.28) = 5417/stat', () => {
    expect(expForLevel(100, 1.28)).toBeCloseTo(5416.95, 1);
  });

  it('is monotonically decreasing in mult at a fixed level (a higher mult is always cheaper)', () => {
    expect(expForLevel(100, 0.8)).toBeLessThan(expForLevel(100, 0.5));
  });
});

describe('statHoursRemaining', () => {
  const opts = { nodeMult: 1, targetLevel: 100 };

  it('is 0 once banked exp already meets the target', () => {
    const need = expForLevel(100, 1);
    expect(statHoursRemaining(1, need * 2, 1, opts)).toBe(0);
  });

  it('is Infinity when exp is still needed but the grind rate is 0', () => {
    expect(statHoursRemaining(1, 0, 0, opts)).toBe(Infinity);
  });

  it('scales inversely with the grind rate', () => {
    const slow = statHoursRemaining(1, 0, 1, opts);
    const fast = statHoursRemaining(1, 0, 2, opts);
    expect(fast).toBeCloseTo(slow / 2, 6);
  });
});

describe('bottleneckHours -- max over the four stats, never a sum', () => {
  it('is dominated by the SLOWEST stat, not swamped by three fast ones', () => {
    const opts = { nodeMult: 1, targetLevel: 100 };
    const mults = { strength: 5, defense: 5, dexterity: 5, agility: 0.5 }; // agility far behind
    const banked = { strength: 1e9, defense: 1e9, dexterity: 1e9, agility: 0 }; // three already done
    const rate = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
    const worst = bottleneckHours(mults, banked, rate, opts);
    const agilityAlone = statHoursRemaining(0.5, 0, 1, opts);
    expect(worst).toBeCloseTo(agilityAlone, 6);
    expect(worst).toBeGreaterThan(0);
  });

  it('accepts a scalar grind rate applied uniformly, as well as a per-stat object', () => {
    const opts = { nodeMult: 1, targetLevel: 100 };
    const mults = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
    const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
    const viaScalar = bottleneckHours(mults, banked, 0.5, opts);
    const viaObject = bottleneckHours(mults, banked, { strength: 0.5, defense: 0.5, dexterity: 0.5, agility: 0.5 }, opts);
    expect(viaScalar).toBeCloseTo(viaObject, 9);
  });
});

describe('moneyWaitHours', () => {
  it('is 0 when already affordable', () => {
    expect(moneyWaitHours(100, 200, 10)).toBe(0);
  });

  it('is the shortfall divided by the hourly income rate', () => {
    // shortfall 100, income $10/sec = $36000/hour -> 100/36000 h
    expect(moneyWaitHours(300, 200, 10)).toBeCloseTo(100 / 36000, 9);
  });

  it('is Infinity for a real shortfall against zero income', () => {
    expect(moneyWaitHours(300, 200, 0)).toBe(Infinity);
  });
});

describe('liveGrindRate', () => {
  const windowMs = 5 * 60 * 1000;

  it('returns null when fewer than minSamples fall in the window', () => {
    const samples = [{ ts: 1000, combatExp: { strength: 0, defense: 0, dexterity: 0, agility: 0 } }];
    expect(liveGrindRate(samples, 2000, windowMs, 2)).toBeNull();
  });

  it('computes per-stat exp/sec from the earliest and latest in-window sample', () => {
    const t0 = 1_000_000;
    const samples = [
      { ts: t0, combatExp: { strength: 100, defense: 100, dexterity: 100, agility: 100 } },
      { ts: t0 + 1000, combatExp: { strength: 110, defense: 105, dexterity: 100, agility: 90 } }, // agility "fell"
      { ts: t0 + 10_000, combatExp: { strength: 200, defense: 150, dexterity: 100, agility: 100 } },
    ];
    const rate = liveGrindRate(samples, t0 + 10_000, windowMs, 2);
    expect(rate.strength).toBeCloseTo((200 - 100) / 10, 6);
    expect(rate.defense).toBeCloseTo((150 - 100) / 10, 6);
    expect(rate.dexterity).toBeCloseTo(0, 6);
    // agility never goes negative even though the middle sample dipped -- first vs last only.
    expect(rate.agility).toBeCloseTo(0, 6);
  });

  it('excludes samples outside the window', () => {
    const t0 = 1_000_000;
    const samples = [
      { ts: t0 - windowMs - 1, combatExp: { strength: 0, defense: 0, dexterity: 0, agility: 0 } }, // too old
      { ts: t0 - 1000, combatExp: { strength: 100, defense: 0, dexterity: 0, agility: 0 } },
      { ts: t0, combatExp: { strength: 200, defense: 0, dexterity: 0, agility: 0 } },
    ];
    const rate = liveGrindRate(samples, t0, windowMs, 2);
    expect(rate.strength).toBeCloseTo(100, 6); // 100 exp / 1 sec, not against the too-old sample
  });
});

describe('applyEntropy / multiplyCombatMults', () => {
  it('applyEntropy raises entropyPerGraft to the given depth on every stat', () => {
    const mults = { strength: 2, defense: 2, dexterity: 2, agility: 2 };
    const out = applyEntropy(mults, 0.98, 3);
    for (const stat of STATS) expect(out[stat]).toBeCloseTo(2 * Math.pow(0.98, 3), 9);
  });

  it('multiplyCombatMults is elementwise', () => {
    const a = { strength: 2, defense: 3, dexterity: 4, agility: 5 };
    const b = { strength: 1.1, defense: 1, dexterity: 1, agility: 2 };
    expect(multiplyCombatMults(a, b)).toEqual({ strength: 2.2, defense: 3, dexterity: 4, agility: 10 });
  });
});

describe('planGraftLadder -- prerequisite admissibility and owned-aug exclusion (migrated from graftplanner.test.js\'s B5)', () => {
  const baseOpts = {
    nodeMult: 1, targetLevel: 100, grindRatePerStat: 1, entropyPerGraft: 0.98,
    maxSpend: 1e9, moneyAvailable: 1e9, incomeRatePerSecDollars: 0, beamWidth: 50, maxDepth: 5,
  };

  it('never emits an already-owned aug, even if it would otherwise score best', () => {
    const currentMults = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
    const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
    const candidates = [
      { name: 'CheapOwned', price: 1, graftHours: 0.1, mults: { strength: 5, defense: 5, dexterity: 5, agility: 5 }, prereqs: [] },
      { name: 'Unowned', price: 1000, graftHours: 1, mults: { strength: 1.1, defense: 1.1, dexterity: 1.1, agility: 1.1 }, prereqs: [] },
    ];
    const { ladder } = planGraftLadder(candidates, currentMults, banked, { ...baseOpts, owned: new Set(['CheapOwned']) });
    expect(ladder.some((s) => s.name === 'CheapOwned')).toBe(false);
  });

  it('never emits a candidate whose prerequisite is unmet and not satisfiable within the ladder', () => {
    const currentMults = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
    const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
    const candidates = [
      { name: 'Tier II', price: 100, graftHours: 0.1, mults: { strength: 3, defense: 3, dexterity: 3, agility: 3 }, prereqs: ['Tier I'] },
      { name: 'Filler', price: 100, graftHours: 0.1, mults: { strength: 1.05, defense: 1.05, dexterity: 1.05, agility: 1.05 }, prereqs: [] },
    ];
    const { ladder } = planGraftLadder(candidates, currentMults, banked, { ...baseOpts, owned: new Set() });
    expect(ladder.some((s) => s.name === 'Tier II')).toBe(false);
  });

  it('admits a tiered candidate once its prerequisite is chosen earlier in the same ladder', () => {
    const currentMults = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
    const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
    const candidates = [
      { name: 'Tier I', price: 100, graftHours: 0.1, mults: { strength: 1.2, defense: 1.2, dexterity: 1.2, agility: 1.2 }, prereqs: [] },
      { name: 'Tier II', price: 100, graftHours: 0.1, mults: { strength: 1.3, defense: 1.3, dexterity: 1.3, agility: 1.3 }, prereqs: ['Tier I'] },
    ];
    const { ladder } = planGraftLadder(candidates, currentMults, banked, { ...baseOpts, owned: new Set() });
    const names = ladder.map((s) => s.name);
    expect(names).toContain('Tier I');
    expect(names).toContain('Tier II');
    expect(names.indexOf('Tier I')).toBeLessThan(names.indexOf('Tier II'));
  });

  it('k=0 (pure grinding) is a legitimate outcome when no candidate improves on it', () => {
    const currentMults = { strength: 100, defense: 100, dexterity: 100, agility: 100 }; // already huge
    const banked = { strength: 1e9, defense: 1e9, dexterity: 1e9, agility: 1e9 }; // already done
    const candidates = [
      { name: 'Expensive', price: 1e12, graftHours: 1000, mults: { strength: 1.01, defense: 1.01, dexterity: 1.01, agility: 1.01 }, prereqs: [] },
    ];
    const { ladder, chosenK, totalHours } = planGraftLadder(candidates, currentMults, banked, { ...baseOpts, owned: new Set(), maxSpend: 1e9 });
    expect(chosenK).toBe(0);
    expect(ladder).toEqual([]);
    expect(totalHours).toBe(0); // already at target, nothing to wait or grind for
  });
});

describe('planGraftLadder -- WC1/WC2 (real BN9 fixture, graft-catalog-bn9.json)', () => {
  it('WC2 (negative control): beamWidth 1 reproduces the exact degenerate result -- 52.6h, k=3, all-four-stat picks only, in the fixture\'s own order', () => {
    const candidates = bn9Candidates();
    const result = planGraftLadder(candidates, bn9Fixture.playerAtCapture.combatMults, bn9BankedZero(), bn9PlanOpts({ beamWidth: 1 }));
    expect(result.chosenK).toBe(3);
    expect(result.totalHours).toBeCloseTo(52.6, 0); // "sensible tolerance" -- fixture's own figure is rounded to 1dp
    // Confirmed unaffected by prereqs (SPTN-97/Bionic Spine/HemoRecirculator carry none) --
    // exact order match, not just set match, since this is a genuinely single deterministic path.
    expect(result.ladder.map((s) => s.name)).toEqual(
      bn9Fixture.goldenBeamResults.width1_degenerate.picks
    );
    // Every pick touches all four stats -- the degeneracy Section 0 describes.
    const candidateByName = new Map(candidates.map((c) => [c.name, c]));
    for (const step of result.ladder) {
      const mults = candidateByName.get(step.name).mults;
      for (const stat of STATS) expect(mults[stat]).not.toBe(1);
    }
  });

  it('WC1 (positive control): beamWidth 300 finds the true prerequisite-admissible optimum -- k=10, ~22.62h, stable through width 2400', () => {
    const candidates = bn9Candidates(); // WITH real prereqs (default) -- see the file header note
    const currentMults = bn9Fixture.playerAtCapture.combatMults;
    const banked = bn9BankedZero();

    const expectedNames = [
      'Augmented Targeting I', 'Augmented Targeting II', 'Bionic Arms', 'Bionic Legs',
      'Bionic Spine', 'Combat Rib I', 'DermaForce Particle Barrier', 'HemoRecirculator',
      'Nanofiber Weave', 'Wired Reflexes',
    ].sort();

    const widths = [300, 600, 1200, 2400];
    const results = widths.map((beamWidth) => planGraftLadder(candidates, currentMults, banked, bn9PlanOpts({ beamWidth })));

    for (let i = 0; i < results.length; i++) {
      expect(results[i].chosenK).toBe(10);
      expect(results[i].totalHours).toBeCloseTo(22.62, 1); // ~2% tolerance -- float-derived
      // Order is NOT asserted: ties in the beam's frontier resolve to different (equally
      // optimal) insertion sequences at different widths -- verified directly (width 300's
      // ladder order differs from width 600's even though both total 22.6167h). The SET
      // reaching that exact total is the real invariant a "converged" claim makes, matching
      // how state dedup itself is defined (spec Section 5: "a chosen candidate set,
      // deduplicated by sorted name list -- two orderings of the same set are the same
      // state").
      expect([...results[i].ladder.map((s) => s.name)].sort()).toEqual(expectedNames);
    }
  });

  it('confirms the divergence from the fixture\'s own goldenBeamResults.width300_converged is explained: reproducing it exactly requires the SAME prereq-blind mistake', () => {
    const blindCandidates = bn9Candidates({ withPrereqs: false });
    const result = planGraftLadder(
      blindCandidates, bn9Fixture.playerAtCapture.combatMults, bn9BankedZero(),
      bn9PlanOpts({ beamWidth: 300 })
    );
    const golden = bn9Fixture.goldenBeamResults.width300_converged;
    expect(result.chosenK).toBe(golden.k);
    expect(result.totalHours).toBeCloseTo(golden.totalHours, 1);
    expect([...result.ladder.map((s) => s.name)].sort()).toEqual([...golden.picks].sort());
    // And it is inadmissible: Augmented Targeting III appears without II ever being chosen.
    const names = result.ladder.map((s) => s.name);
    expect(names).toContain('Augmented Targeting III');
    expect(names).not.toContain('Augmented Targeting II');
  });
});

describe('planGraftLadder -- synthetic tied-start structural demonstration (supplementary to WC1/WC2 above)', () => {
  // Kept alongside the real-fixture WC1/WC2 tests above (not a replacement for them): this
  // hand-built fixture demonstrates the SAME failure mode Section 0 describes with small,
  // round, hand-verifiable numbers the real 36-aug catalog doesn't offer -- all four
  // stats/mults tied at a common starting point, so a partial-coverage candidate cannot move
  // min() while entropy still taxes every stat, forcing a width-1 search to only ever pick
  // all-four-stat candidates, even though a WIDER search finds a materially cheaper path
  // through partial-coverage augs combined together.
  const currentMults = { strength: 1, defense: 1, dexterity: 1, agility: 1 };
  const banked = { strength: 0, defense: 0, dexterity: 0, agility: 0 };
  const opts = {
    nodeMult: 1, targetLevel: 100, grindRatePerStat: 1, entropyPerGraft: 0.98,
    owned: new Set(), maxSpend: 1e12, moneyAvailable: 1e12, incomeRatePerSecDollars: 0,
    maxDepth: 6,
  };

  // Two "broad" (all-four) candidates, expensive; four "narrow" (single-stat) candidates,
  // cheap, one per stat -- together the four narrow picks move every stat exactly as far as
  // the broad pair, for much less money and (crucially) they can only pay off if the search
  // is willing to hold a partial-coverage set across multiple steps before it stops looking
  // negative-scoring at width 1.
  const candidates = [
    { name: 'BroadA', price: 500_000, graftHours: 1, mults: { strength: 1.35, defense: 1.35, dexterity: 1.35, agility: 1.35 }, prereqs: [] },
    { name: 'BroadB', price: 500_000, graftHours: 1, mults: { strength: 1.35, defense: 1.35, dexterity: 1.35, agility: 1.35 }, prereqs: [] },
    { name: 'NarrowStr', price: 10_000, graftHours: 0.2, mults: { strength: 1.9, defense: 1, dexterity: 1, agility: 1 }, prereqs: [] },
    { name: 'NarrowDef', price: 10_000, graftHours: 0.2, mults: { strength: 1, defense: 1.9, dexterity: 1, agility: 1 }, prereqs: [] },
    { name: 'NarrowDex', price: 10_000, graftHours: 0.2, mults: { strength: 1, defense: 1, dexterity: 1.9, agility: 1 }, prereqs: [] },
    { name: 'NarrowAgi', price: 10_000, graftHours: 0.2, mults: { strength: 1, defense: 1, dexterity: 1, agility: 1.9 }, prereqs: [] },
  ];

  it('supplementary negative control: at beamWidth 1, the search is confined to all-four-stat picks', () => {
    const { ladder } = planGraftLadder(candidates, currentMults, banked, { ...opts, beamWidth: 1 });
    for (const step of ladder) {
      expect(['BroadA', 'BroadB']).toContain(step.name);
    }
  });

  it('supplementary positive control -- what makes the negative control above a real test: a wide beam finds a strictly cheaper plan by combining narrow picks', () => {
    const wide = planGraftLadder(candidates, currentMults, banked, { ...opts, beamWidth: 300 });
    const narrow1 = planGraftLadder(candidates, currentMults, banked, { ...opts, beamWidth: 1 });
    expect(wide.totalHours).toBeLessThan(narrow1.totalHours);
    // The wide search's ladder must actually USE at least one narrow candidate to prove the
    // difference is the coverage strategy, not just a tie-break.
    const wideNames = wide.ladder.map((s) => s.name);
    expect(wideNames.some((n) => n.startsWith('Narrow'))).toBe(true);
  });
});

describe('planGraftLadder -- WC3: convergence across beam widths', () => {
  it('widths 300, 600, 1200, 2400 return byte-identical ladder/chosenK/totalHours on the BN10 fixture', () => {
    const candidates = bn10Candidates();
    const currentMults = bn10Fixture.playerAtCapture.combatMults;
    const nodeMult = bn10Fixture.nodeMult;
    const banked = {};
    for (const stat of STATS) banked[stat] = expForLevel(74, currentMults[stat] * nodeMult);

    const opts = {
      // moneyAvailable set generously high (not the fixture's captured $3.3M) so this test
      // isolates the CONVERGENCE property (does a wider beam ever change the answer) from
      // money-wait dynamics, which is a separate, deliberately-added scoring term (spec
      // Section 12.1) the old greedy algorithm never had at all.
      nodeMult, targetLevel: 100, grindRatePerStat: 2.62, entropyPerGraft: 0.98,
      owned: new Set(), maxSpend: 1_500_000_000, moneyAvailable: 1_500_000_000,
      incomeRatePerSecDollars: 0, maxDepth: 14,
    };

    const results = [300, 600, 1200, 2400].map((beamWidth) => planGraftLadder(candidates, currentMults, banked, { ...opts, beamWidth }));
    for (let i = 1; i < results.length; i++) {
      expect(results[i].chosenK).toBe(results[0].chosenK);
      expect(results[i].totalHours).toBeCloseTo(results[0].totalHours, 9);
      expect(results[i].ladder.map((s) => s.name)).toEqual(results[0].ladder.map((s) => s.name));
    }
  });
});

describe('planGraftLadder -- WC4: entropy applied exactly once', () => {
  it('WC4.1 (pure): a chosen state at depth k has effective mults equal to currentMults x candidate-products x entropyPerGraft^k', () => {
    // dexterity/agility are pre-satisfied (huge banked exp) so they never bind the bottleneck --
    // isolating this test to the entropy-formula arithmetic, not the coverage tradeoff (WC1/WC2
    // already cover that separately). Candidates A/B are each individually a clear net win on
    // the two stats that DO bind (strength/defense), so the search is expected to take both.
    const currentMults = { strength: 2, defense: 2, dexterity: 2, agility: 2 };
    const banked = { strength: 0, defense: 0, dexterity: 1e9, agility: 1e9 };
    const candidates = [
      { name: 'A', price: 1, graftHours: 0.1, mults: { strength: 1.1, defense: 1, dexterity: 1, agility: 1 }, prereqs: [] },
      { name: 'B', price: 1, graftHours: 0.1, mults: { strength: 1, defense: 1.1, dexterity: 1, agility: 1 }, prereqs: [] },
    ];
    const opts = {
      // A slow grind rate makes the (tiny, 0.1h each) graft cost clearly worth paying against
      // the grind-hours it saves -- at a fast rate the exp deficit here is cheap enough in wall
      // time that grinding alone wins, which would make this a bad fixture for what this test
      // is actually checking (entropy arithmetic on a CHOSEN path, not the graft-vs-grind
      // tradeoff itself -- WC1/WC2 cover that).
      nodeMult: 1, targetLevel: 100, grindRatePerStat: 0.05, entropyPerGraft: 0.98,
      owned: new Set(), maxSpend: 1e9, moneyAvailable: 1e9, incomeRatePerSecDollars: 0,
      beamWidth: 10, maxDepth: 2,
    };
    const { ladder } = planGraftLadder(candidates, currentMults, banked, opts);
    expect(ladder.length).toBe(2);

    // Step k=1: effectiveMults = currentMults * firstCandidate.mults * 0.98^1
    const step1 = ladder[0];
    const first = candidates.find((c) => c.name === step1.name);
    for (const stat of STATS) {
      const expected = currentMults[stat] * first.mults[stat] * Math.pow(0.98, 1);
      expect(step1.effectiveMults[stat]).toBeCloseTo(expected, 9);
    }

    // Step k=2: effectiveMults = currentMults * candidateA.mults * candidateB.mults * 0.98^2
    const step2 = ladder[1];
    const second = candidates.find((c) => c.name === step2.name);
    for (const stat of STATS) {
      const expected = currentMults[stat] * first.mults[stat] * second.mults[stat] * Math.pow(0.98, 2);
      expect(step2.effectiveMults[stat]).toBeCloseTo(expected, 9);
    }
  });
});

describe('planGraftLadder -- WC5: BN10 golden fixture passes unmodified through the new code path', () => {
  // NOTE ON WHY THIS DOES NOT COMPARE AGAINST PHASE 41's OLD 9.91h NUMBER (discovered while
  // writing this test, worth recording rather than silently working around): the old
  // greedy planGraftLadder summed remainingExp ACROSS all four stats and divided by a single
  // scalar grind rate, i.e. it modeled the four stats as trained SERIALLY. bottleneckHours
  // (this phase's whole point, spec Section 0) takes the MAX, modeling them as trained
  // CONCURRENTLY by one Mug action -- the actually-correct mechanic. On this fixture, where all
  // four stats/mults are captured tied, that alone drops the honest baseline from ~48.15h
  // (old, wrong) to ~12.04h (new, correct) BEFORE any candidate is even considered -- so "at
  // least as good as 9.91h" is not a meaningful bar; the two numbers measure different things.
  // What IS still checkable here: the fixture loads and runs through the new code path without
  // modification, and the search recognizes a genuine, cheap, all-four-stat candidate
  // (HemoRecirculator, $135M, 1.08x all four) as an improvement over pure grinding once money
  // is not the binding constraint.
  it('runs to completion on the tracked BN10 fixture and improves on pure grinding once money is not binding', () => {
    const candidates = bn10Candidates();
    const currentMults = bn10Fixture.playerAtCapture.combatMults;
    const nodeMult = bn10Fixture.nodeMult;
    const banked = {};
    for (const stat of STATS) banked[stat] = expForLevel(74, currentMults[stat] * nodeMult);

    const cfg = resolveNodeConfig(10, {});
    const opts = {
      nodeMult: cfg.nodeMult, targetLevel: cfg.targetLevel, grindRatePerStat: cfg.grindExpPerSec,
      entropyPerGraft: cfg.entropyPerGraft, owned: new Set(), maxSpend: cfg.maxSpend,
      moneyAvailable: cfg.maxSpend, incomeRatePerSecDollars: 0, // money not binding -- isolates the graft-vs-grind tradeoff
      beamWidth: cfg.beamWidth, maxDepth: cfg.maxDepth,
    };
    const rootHours = bottleneckHours(currentMults, banked, cfg.grindExpPerSec, { nodeMult: cfg.nodeMult, targetLevel: cfg.targetLevel });

    const result = planGraftLadder(candidates, currentMults, banked, opts);
    expect(Number.isFinite(result.totalHours)).toBe(true);
    expect(result.chosenK).toBeGreaterThan(0);
    expect(result.ladder.some((s) => s.name === 'HemoRecirculator')).toBe(true);
    expect(result.totalHours).toBeLessThan(rootHours);
  });

  it('with the fixture\'s OWN captured live money ($3.3M) and zero assumed income, grafting anything is correctly infinitely deferred (money-wait dominates) -- pure grinding wins', () => {
    // This is the new model's added behavior Section 12.1 describes -- the old greedy never
    // checked live money against cost at all, only a maxSpend ceiling.
    const candidates = bn10Candidates();
    const currentMults = bn10Fixture.playerAtCapture.combatMults;
    const nodeMult = bn10Fixture.nodeMult;
    const banked = {};
    for (const stat of STATS) banked[stat] = expForLevel(74, currentMults[stat] * nodeMult);
    const cfg = resolveNodeConfig(10, {});
    const opts = {
      nodeMult: cfg.nodeMult, targetLevel: cfg.targetLevel, grindRatePerStat: cfg.grindExpPerSec,
      entropyPerGraft: cfg.entropyPerGraft, owned: new Set(), maxSpend: cfg.maxSpend,
      moneyAvailable: bn10Fixture.playerAtCapture.money, incomeRatePerSecDollars: 0,
      beamWidth: cfg.beamWidth, maxDepth: cfg.maxDepth,
    };
    const result = planGraftLadder(candidates, currentMults, banked, opts);
    expect(result.chosenK).toBe(0);
    expect(result.ladder).toEqual([]);
  });
});
