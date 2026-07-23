// Unit tests for src/augfarmer.js's pure decision functions (Phase 23/25).
// Fixtures use fictional faction/aug names except where a specific real name
// is the point of the assertion (e.g. "The Red Pill" is allow-listed as of
// 2026-07-15 -- Kenneth's explicit ask; the real six-city enemy graph is
// the point of the pickCamp fixtures).
import { describe, it, expect } from 'vitest';
import {
  MULT_FILTER_KEYS,
  UTILITY_ALLOWLIST,
  NFG_NAME,
  pickNfgSeller,
  SCORE_W_EXP,
  SCORE_W_REP,
  SCORE_W_MONEY,
  SCORE_W_SPEED,
  ALLOWLIST_SCORE,
  MIN_TOTAL_GAIN,
  GRIND_HORIZON_MS,
  PASSIVE_REP_FACTIONS,
  TRIGGER_SUSTAIN_MS,
  RATE_EWMA_ALPHA,
  SPEND_DOWN_BUY_CAP,
  NFG_PRICE_LADDER,
  NFG_REP_LADDER,
  AUG_PRICE_LADDER,
  FUNDING_HORIZON_MS,
  FUND_CAP_FALLBACK,
  GOAL_STALE_MS,
  MUSTBUY_HOLD_MAX_MS,
  MUSTBUY_HOLD_CAP_FALLBACK,
  nfgLevelsByRep,
  scoreAug,
  filterAugs,
  expandPrereqs,
  campBlocked,
  cityFactionNames,
  computeCamps,
  pickCamp,
  planJoins,
  evaluateInviteReqs,
  pickWorkType,
  slotAvailable,
  computeFundCap,
  pickTarget,
  pickWorkFaction,
  pickHorizonGrind,
  findAugCountGate,
  computeGateRelease,
  pickGateFiller,
  updateRepRates,
  evalTrigger,
  decideInstall,
  INSTALL_OVERHEAD_MS,
  spendDownPlan,
  mustBuyTotal,
  daedalusInviteReserve,
  daedalusDonationReserve,
  shouldDonateToDaedalus,
  buildDecisionRecord,
  planPass,
  buildReserveRecord,
  STALL_CYCLE_FACTOR,
  STALL_MIN_MS,
  STALL_MAX_MS,
  STALL_FALLBACK_MS,
  STALL_REWARN_MS,
  computeStallThreshold,
  recentCycleIntervals,
  evalStall,
  STALL_QUEUE_FLOOR,
  nextAwaitingSince,
} from '../src/augfarmer.js';

function statsAllOnes(overrides = {}) {
  const stats = {};
  for (const key of MULT_FILTER_KEYS) stats[key] = 1;
  return { ...stats, ...overrides };
}

describe('scoreAug', () => {
  it('hacking-only: score equals hacking-1', () => {
    expect(scoreAug('X', statsAllOnes({ hacking: 1.2 }), new Set())).toBeCloseTo(0.2, 6);
  });

  it('exp-only: discounted by SCORE_W_EXP', () => {
    expect(scoreAug('X', statsAllOnes({ hacking_exp: 1.2 }), new Set())).toBeCloseTo(SCORE_W_EXP * 0.2, 6);
  });

  it('rep-only: discounted by SCORE_W_REP', () => {
    expect(scoreAug('X', statsAllOnes({ faction_rep: 1.2 }), new Set())).toBeCloseTo(SCORE_W_REP * 0.2, 6);
  });

  it('mixed hacking+exp+rep sums all three terms', () => {
    const score = scoreAug('X', statsAllOnes({ hacking: 1.1, hacking_exp: 1.1, faction_rep: 1.1 }), new Set());
    expect(score).toBeCloseTo(0.1 + SCORE_W_EXP * 0.1 + SCORE_W_REP * 0.1, 6);
  });

  it('all-1.0 (pure utility, not allow-listed) scores exactly 0', () => {
    expect(scoreAug('X', statsAllOnes(), new Set())).toBe(0);
  });

  it('an allow-listed name always scores ALLOWLIST_SCORE, regardless of stats', () => {
    const allowSet = new Set(['Neuroreceptor Management Implant']);
    expect(scoreAug('Neuroreceptor Management Implant', statsAllOnes(), allowSet)).toBe(ALLOWLIST_SCORE);
    expect(scoreAug('Neuroreceptor Management Implant', statsAllOnes({ hacking: 5 }), allowSet)).toBe(ALLOWLIST_SCORE);
  });

  it('money-only: discounted by SCORE_W_MONEY (2026-07-15 amendment)', () => {
    expect(scoreAug('X', statsAllOnes({ hacking_money: 1.4 }), new Set())).toBeCloseTo(SCORE_W_MONEY * 0.4, 6);
  });

  it('speed-only: discounted by SCORE_W_SPEED (2026-07-15 amendment)', () => {
    expect(scoreAug('X', statsAllOnes({ hacking_speed: 1.1 }), new Set())).toBeCloseTo(SCORE_W_SPEED * 0.1, 6);
  });

  it('ignores chance/grow/charisma/company entirely -- Kenneth\'s amendment was specifically money/speed', () => {
    const score = scoreAug(
      'X',
      statsAllOnes({ hacking_chance: 2, hacking_grow: 2, charisma: 2, charisma_exp: 2, company_rep: 2 }),
      new Set(),
    );
    expect(score).toBe(0);
  });
});

describe('filterAugs', () => {
  it('keeps an aug with a relevant hacking mult', () => {
    const kept = filterAugs({ HackAug: statsAllOnes({ hacking: 1.1 }) }, []);
    expect(kept.has('HackAug')).toBe(true);
  });

  it('drops a combat-only aug (no hacking/hacking_exp/faction_rep effect)', () => {
    const kept = filterAugs({ CombatAug: statsAllOnes({ strength: 1.3, defense: 1.3 }) }, []);
    expect(kept.has('CombatAug')).toBe(false);
  });

  it('drops a chance/grow/charisma/company-only aug -- still unweighted', () => {
    const kept = filterAugs(
      { UtilityAug: statsAllOnes({ hacking_chance: 1.5, hacking_grow: 1.5, charisma: 1.5, company_rep: 1.5 }) },
      [],
    );
    expect(kept.has('UtilityAug')).toBe(false);
  });

  it('keeps a money/speed-only aug -- 2026-07-15 amendment (ENM Analyze Engine/DMA Upgrade class)', () => {
    const kept = filterAugs({ MoneySpeedAug: statsAllOnes({ hacking_money: 1.4, hacking_speed: 1.1 }) }, []);
    expect(kept.has('MoneySpeedAug')).toBe(true);
  });

  it('keeps a mixed hacking+combat aug (inclusive OR via a positive score)', () => {
    const kept = filterAugs({ MixedAug: statsAllOnes({ hacking: 1.1, strength: 1.3 }) }, []);
    expect(kept.has('MixedAug')).toBe(true);
  });

  it('drops an all-1.0 aug', () => {
    const kept = filterAugs({ UtilAug: statsAllOnes() }, []);
    expect(kept.has('UtilAug')).toBe(false);
  });

  it('keeps NRMI and CashRoot Starter Kit (allow-listed)', () => {
    const kept = filterAugs(
      { 'Neuroreceptor Management Implant': statsAllOnes(), 'CashRoot Starter Kit': statsAllOnes() },
      UTILITY_ALLOWLIST,
    );
    expect(kept.has('Neuroreceptor Management Implant')).toBe(true);
    expect(kept.has('CashRoot Starter Kit')).toBe(true);
  });

  it("drops The Blade's Simulacrum -- S3's flagged allowlist trim, still stands", () => {
    const kept = filterAugs({ "The Blade's Simulacrum": statsAllOnes() }, UTILITY_ALLOWLIST);
    expect(kept.has("The Blade's Simulacrum")).toBe(false);
  });

  it('keeps The Red Pill -- allow-listed 2026-07-15 (Kenneth\'s explicit ask, reverses the prior "drops by construction" property)', () => {
    const kept = filterAugs({ 'The Red Pill': statsAllOnes() }, UTILITY_ALLOWLIST);
    expect(kept.has('The Red Pill')).toBe(true);
  });
});

describe('expandPrereqs', () => {
  function catalogWith(augs) {
    return { augs };
  }

  it('no-prereq aug passes through as a one-element chain', () => {
    const catalog = catalogWith({ Solo: { prereqs: [], sellers: ['F1'] } });
    expect(expandPrereqs('Solo', catalog, new Set())).toEqual(['Solo']);
  });

  it('an unowned chain is ordered deepest-first, ending in the candidate', () => {
    const catalog = catalogWith({
      Top: { prereqs: ['Mid'], sellers: ['F1'] },
      Mid: { prereqs: ['Bottom'], sellers: ['F1'] },
      Bottom: { prereqs: [], sellers: ['F1'] },
    });
    expect(expandPrereqs('Top', catalog, new Set())).toEqual(['Bottom', 'Mid', 'Top']);
  });

  it('an owned prereq is skipped, not included in the chain', () => {
    const catalog = catalogWith({
      Top: { prereqs: ['Mid'], sellers: ['F1'] },
      Mid: { prereqs: [], sellers: ['F1'] },
    });
    expect(expandPrereqs('Top', catalog, new Set(['Mid']))).toEqual(['Top']);
  });

  it('a filter-failing prereq (no passesFilter field checked here) is still included -- D6', () => {
    const catalog = catalogWith({
      Top: { prereqs: ['CombatPrereq'], sellers: ['F1'] },
      CombatPrereq: { prereqs: [], sellers: ['F1'], passesFilter: false },
    });
    expect(expandPrereqs('Top', catalog, new Set())).toEqual(['CombatPrereq', 'Top']);
  });

  it('returns null when any link has no in-scope seller', () => {
    const catalog = catalogWith({
      Top: { prereqs: ['Ghost'], sellers: ['F1'] },
      // Ghost absent entirely -- no in-scope faction sells it
    });
    expect(expandPrereqs('Top', catalog, new Set())).toBeNull();
  });

  it('returns null when the candidate itself has no in-scope seller', () => {
    const catalog = catalogWith({ Lonely: { prereqs: [], sellers: [] } });
    expect(expandPrereqs('Lonely', catalog, new Set())).toBeNull();
  });
});

describe('campBlocked', () => {
  const enemiesByFaction = {
    Sector12: ['Chongqing', 'NewTokyo', 'Ishima', 'Volhaven'],
    Aevum: ['Chongqing', 'NewTokyo', 'Ishima', 'Volhaven'],
    Chongqing: ['Sector12', 'Aevum', 'Volhaven'],
    CyberSec: [],
  };

  it('a camp-mate is never blocked by its own camp', () => {
    expect(campBlocked('Aevum', enemiesByFaction, new Set(['Sector12']))).toBe(false);
  });

  it('a cross-camp faction is blocked once its enemy is joined', () => {
    expect(campBlocked('Chongqing', enemiesByFaction, new Set(['Sector12']))).toBe(true);
  });

  it('a non-city faction with an empty enemies list is never blocked', () => {
    expect(campBlocked('CyberSec', enemiesByFaction, new Set(['Sector12', 'Chongqing']))).toBe(false);
  });
});

// Real six-city enemy graph (2026-07-14 live catalog dump) -- the fixture
// pickCamp/cityFactionNames/computeCamps are checked against.
function realCityCatalog(augs = {}) {
  const factions = {
    Aevum: { enemies: ['Chongqing', 'New Tokyo', 'Ishima', 'Volhaven'] },
    'Sector-12': { enemies: ['Chongqing', 'New Tokyo', 'Ishima', 'Volhaven'] },
    Chongqing: { enemies: ['Sector-12', 'Aevum', 'Volhaven'] },
    'New Tokyo': { enemies: ['Sector-12', 'Aevum', 'Volhaven'] },
    Ishima: { enemies: ['Sector-12', 'Aevum', 'Volhaven'] },
    Volhaven: { enemies: ['Chongqing', 'Sector-12', 'New Tokyo', 'Aevum', 'Ishima'] },
    CyberSec: { enemies: [] },
  };
  return { augs, factions };
}

describe('cityFactionNames / computeCamps', () => {
  it('identifies exactly the six cities as "city factions" (non-conflicting factions never appear)', () => {
    const catalog = realCityCatalog();
    expect(cityFactionNames(catalog)).toEqual(['Aevum', 'Chongqing', 'Ishima', 'New Tokyo', 'Sector-12', 'Volhaven']);
  });

  it('partitions the real enemy graph into the three known camps', () => {
    const catalog = realCityCatalog();
    const camps = computeCamps(cityFactionNames(catalog), catalog).map((c) => c.slice().sort());
    expect(camps).toEqual([
      ['Aevum', 'Sector-12'],
      ['Chongqing', 'Ishima', 'New Tokyo'],
      ['Volhaven'],
    ]);
  });

  it('camp derivation is structural, not name-based -- a shuffled/renamed enemy graph of the same shape re-partitions accordingly', () => {
    const factions = {
      Alpha: { enemies: ['Gamma', 'Delta', 'Epsilon', 'Zeta'] },
      Beta: { enemies: ['Gamma', 'Delta', 'Epsilon', 'Zeta'] },
      Gamma: { enemies: ['Alpha', 'Beta', 'Zeta'] },
      Delta: { enemies: ['Alpha', 'Beta', 'Zeta'] },
      Epsilon: { enemies: ['Alpha', 'Beta', 'Zeta'] },
      Zeta: { enemies: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'] },
    };
    const catalog = { augs: {}, factions };
    const camps = computeCamps(cityFactionNames(catalog), catalog).map((c) => c.slice().sort());
    expect(camps).toEqual([
      ['Alpha', 'Beta'],
      ['Delta', 'Epsilon', 'Gamma'],
      ['Zeta'],
    ]);
  });
});

describe('pickCamp', () => {
  it('reality rule: an already-joined city faction locks the camp regardless of scoring', () => {
    const catalog = realCityCatalog({ LoneAug: { sellers: ['Volhaven'], score: 10 } });
    const result = pickCamp(catalog, new Set(), new Set(['Sector-12']));
    expect(result.reason).toBe('reality');
    expect(result.camp.slice().sort()).toEqual(['Aevum', 'Sector-12']);
  });

  it('scores each camp by summing scoreAug over unowned augs whose entire seller set lies inside that camp', () => {
    const catalog = realCityCatalog({
      AevumOnly: { sellers: ['Aevum'], score: 1 },
      ChongqingOnly: { sellers: ['Chongqing'], score: 5 },
      SharedAcrossCamps: { sellers: ['Aevum', 'Chongqing'], score: 100 }, // spans camps -- discriminates nothing
      SoldEverywhereToo: { sellers: ['Aevum', 'CyberSec'], score: 100 }, // sold by a non-city faction too -- discriminates nothing
    });
    const result = pickCamp(catalog, new Set(), new Set());
    expect(result.reason).toBe('scored');
    expect(result.camp.slice().sort()).toEqual(['Chongqing', 'Ishima', 'New Tokyo']);
  });

  it('ignores owned augs when scoring, falling to the camp-size tie-break once nothing discriminates', () => {
    const catalog = realCityCatalog({ AevumOnly: { sellers: ['Aevum'], score: 5 } });
    const result = pickCamp(catalog, new Set(['AevumOnly']), new Set());
    expect(result.camp.slice().sort()).toEqual(['Chongqing', 'Ishima', 'New Tokyo']);
  });
});

describe('planJoins', () => {
  const catalog = {
    factions: {
      CyberSec: { enemies: [] },
      TianDiHui: { enemies: [] },
      Aevum: { enemies: ['Chongqing'] },
      Chongqing: { enemies: ['Aevum'] },
    },
  };

  it('joins every invite-pending, camp-allowed in-scope faction', () => {
    const invites = new Set(['CyberSec', 'TianDiHui', 'Aevum']);
    const joins = planJoins(catalog, invites, new Set(), { camp: ['Aevum'] });
    expect(joins.slice().sort()).toEqual(['Aevum', 'CyberSec', 'TianDiHui']);
  });

  it('excludes a cross-camp city faction even if invited', () => {
    const invites = new Set(['Aevum', 'Chongqing']);
    const joins = planJoins(catalog, invites, new Set(), { camp: ['Aevum'] });
    expect(joins).toEqual(['Aevum']);
  });

  it('never joins an out-of-scope faction (rail preserved)', () => {
    const invites = new Set(['SlumSnakes']);
    expect(planJoins(catalog, invites, new Set(), null)).toEqual([]);
  });

  it('skips a faction already joined', () => {
    const invites = new Set(['CyberSec']);
    expect(planJoins(catalog, invites, new Set(['CyberSec']), null)).toEqual([]);
  });
});

describe('evaluateInviteReqs', () => {
  it('city requirement met/unmet', () => {
    expect(evaluateInviteReqs([{ type: 'city', city: 'Aevum' }], { city: 'Aevum' }).joinable).toBe(true);
    expect(evaluateInviteReqs([{ type: 'city', city: 'Aevum' }], { city: 'Volhaven' }).joinable).toBe(false);
  });

  it('money requirement met/unmet', () => {
    expect(evaluateInviteReqs([{ type: 'money', money: 1000 }], { money: 2000 }).joinable).toBe(true);
    expect(evaluateInviteReqs([{ type: 'money', money: 1000 }], { money: 500 }).joinable).toBe(false);
  });

  it('skills requirement met/unmet, across multiple skills', () => {
    expect(evaluateInviteReqs([{ type: 'skills', skills: { hacking: 200 } }], { skills: { hacking: 250 } }).joinable).toBe(true);
    expect(
      evaluateInviteReqs([{ type: 'skills', skills: { hacking: 200, strength: 50 } }], { skills: { hacking: 250, strength: 10 } }).joinable
    ).toBe(false);
  });

  it('someCondition is an OR across sub-conditions', () => {
    const reqs = [{ type: 'someCondition', conditions: [{ type: 'city', city: 'Aevum' }, { type: 'city', city: 'Sector-12' }] }];
    expect(evaluateInviteReqs(reqs, { city: 'Sector-12' }).joinable).toBe(true);
    expect(evaluateInviteReqs(reqs, { city: 'Volhaven' }).joinable).toBe(false);
  });

  it('not + employedBy negates the sub-condition', () => {
    const reqs = [{ type: 'not', condition: { type: 'employedBy', company: 'NSA' } }];
    expect(evaluateInviteReqs(reqs, { jobs: new Set() }).joinable).toBe(true);
    expect(evaluateInviteReqs(reqs, { jobs: new Set(['NSA']) }).joinable).toBe(false);
  });

  it('an unknown requirement type is treated as unmet (conservative default)', () => {
    expect(evaluateInviteReqs([{ type: 'bladeburnerRank', rank: 10 }], {}).joinable).toBe(false);
  });

  it('flags onlyCityGap when every other requirement is met', () => {
    const reqs = [{ type: 'money', money: 0 }, { type: 'city', city: 'Aevum' }];
    const result = evaluateInviteReqs(reqs, { money: 100, city: 'Volhaven' });
    expect(result.joinable).toBe(false);
    expect(result.onlyCityGap).toBe(true);
    expect(result.gapCity).toBe('Aevum');
  });

  it('does not flag onlyCityGap when another requirement is also unmet', () => {
    const reqs = [{ type: 'money', money: 1000 }, { type: 'city', city: 'Aevum' }];
    const result = evaluateInviteReqs(reqs, { money: 0, city: 'Volhaven' });
    expect(result.onlyCityGap).toBe(false);
  });
});

describe('pickWorkType', () => {
  it('prefers hacking, then field, then security', () => {
    expect(pickWorkType(['security', 'hacking', 'field'])).toBe('hacking');
    expect(pickWorkType(['security', 'field'])).toBe('field');
    expect(pickWorkType(['security'])).toBe('security');
  });
});

describe('pickTarget', () => {
  function augFx(overrides = {}) {
    return { prereqs: [], sellers: [], repReq: 0, price: 0, passesFilter: true, isNFG: false, score: 1, ...overrides };
  }
  function faction(overrides = {}) {
    return { enemies: [], inviteReqs: [], workTypes: ['hacking'], ...overrides };
  }
  function facts(overrides = {}) {
    return { city: 'Sector-12', money: 0, skills: {}, karma: 0, jobs: new Set(), invites: new Set(), factionRep: {}, ...overrides };
  }

  it('returns null (plateau) when there is nothing to target', () => {
    expect(pickTarget({ augs: {}, factions: {} }, facts(), new Set(), new Set(), false)).toBeNull();
  });

  it('rep-met candidates sort before any deficit>0 candidate', () => {
    const catalog = {
      augs: {
        AugHighDeficit: augFx({ sellers: ['F1'], repReq: 1000 }),
        AugMet: augFx({ sellers: ['F1'], repReq: 100 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 200 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe('AugMet');
    expect(target.deficit).toBe(0);
  });

  it('among rep-met candidates, higher score sorts first', () => {
    const catalog = {
      augs: {
        LowScore: augFx({ sellers: ['F1'], repReq: 0, score: 0.5 }),
        HighScore: augFx({ sellers: ['F1'], repReq: 0, score: 2 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe('HighScore');
  });

  // Phase 33 decision 1: tier 0 sorts price-DESC (escalation-optimal), not
  // price-ASC -- the buy-order fix this spec exists for. Score is only a
  // tie-break within equal price now.
  it('among rep-met candidates with equal score, PRICIER sorts first (phase-33-money-throughput.spec.md decision 1)', () => {
    const catalog = {
      augs: {
        AugCheap: augFx({ sellers: ['F1'], repReq: 0, price: 500 }),
        AugPricey: augFx({ sellers: ['F1'], repReq: 0, price: 5000 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe('AugPricey');
  });

  it('unmet candidates sort by score/deficit descending', () => {
    const catalog = {
      augs: {
        LowRatio: augFx({ sellers: ['F1'], repReq: 1000, score: 1 }),
        HighRatio: augFx({ sellers: ['F2'], repReq: 100, score: 1 }),
      },
      factions: { F1: faction(), F2: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0, F2: 0 } }), new Set(['F1', 'F2']), new Set(), false);
    expect(target.aug).toBe('HighRatio');
  });

  it('unmet tie-break: equal score/deficit ratio -> price ascending', () => {
    const catalog = {
      augs: {
        AugPricey: augFx({ sellers: ['F1'], repReq: 500, score: 1, price: 5000 }),
        AugCheap: augFx({ sellers: ['F2'], repReq: 500, score: 1, price: 500 }),
      },
      factions: { F1: faction(), F2: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0, F2: 0 } }), new Set(['F1', 'F2']), new Set(), false);
    expect(target.aug).toBe('AugCheap');
    expect(target.deficit).toBe(500);
  });

  it('includes NFG in the sort when uncapped', () => {
    const catalog = { augs: { [NFG_NAME]: augFx({ sellers: ['F1'], repReq: 100, isNFG: true }) }, factions: { F1: faction() } };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe(NFG_NAME);
  });

  it('NFG stays targetable even when a level is already owned -- repeatable, unlike a discrete aug (regression)', () => {
    const catalog = { augs: { [NFG_NAME]: augFx({ sellers: ['F1'], repReq: 100, isNFG: true }) }, factions: { F1: faction() } };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set([NFG_NAME]), false);
    expect(target.aug).toBe(NFG_NAME);
    expect(target.deficit).toBe(100);
  });

  it('a genuinely-owned discrete aug (non-NFG) is still excluded, unaffected by the NFG carve-out', () => {
    const catalog = {
      augs: {
        Owned: augFx({ sellers: ['F1'], repReq: 100 }),
        [NFG_NAME]: augFx({ sellers: ['F1'], repReq: 500, isNFG: true }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(['Owned']), false);
    expect(target.aug).toBe(NFG_NAME);
  });

  it('capped this cycle keeps NFG as a grind target (buyBlocked), not excluded -- rep costs nothing and banks ahead for the next spend-down', () => {
    const catalog = { augs: { [NFG_NAME]: augFx({ sellers: ['F1'], repReq: 100, isNFG: true }) }, factions: { F1: faction() } };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), true);
    expect(target.aug).toBe(NFG_NAME);
    expect(target.buyBlocked).toBe(true);
  });

  it('uncapped NFG is not buyBlocked', () => {
    const catalog = { augs: { [NFG_NAME]: augFx({ sellers: ['F1'], repReq: 100, isNFG: true }) }, factions: { F1: faction() } };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.buyBlocked).toBe(false);
  });

  it('skips a camp-blocked candidate and takes the next reachable one (D5: skip, dont stall)', () => {
    const catalog = {
      augs: {
        AugCamp: augFx({ sellers: ['Chongqing'], repReq: 100 }),
        AugOther: augFx({ sellers: ['CyberSec'], repReq: 500 }),
      },
      factions: {
        Chongqing: faction({ enemies: ['Sector12'] }),
        CyberSec: faction(),
      },
    };
    const target = pickTarget(catalog, facts({ factionRep: { CyberSec: 0 } }), new Set(['Sector12']), new Set(), false);
    expect(target.aug).toBe('AugOther');
  });

  it('marks status invite-pending when an invite is already pending', () => {
    const catalog = { augs: { AugX: augFx({ sellers: ['F1'], repReq: 100 }) }, factions: { F1: faction() } };
    const target = pickTarget(catalog, facts({ invites: new Set(['F1']) }), new Set(), new Set(), false);
    expect(target.status).toBe('invite-pending');
  });

  it('marks status awaiting-invite when requirements are met but no invite has surfaced yet', () => {
    const catalog = { augs: { AugX: augFx({ sellers: ['F1'], repReq: 100 }) }, factions: { F1: faction({ inviteReqs: [{ type: 'city', city: 'Aevum' }] }) } };
    const target = pickTarget(catalog, facts({ city: 'Aevum' }), new Set(), new Set(), false);
    expect(target.status).toBe('awaiting-invite');
  });

  it('marks status city-gap (with gapCity) when travel is the only unmet requirement', () => {
    const catalog = { augs: { AugX: augFx({ sellers: ['F1'], repReq: 100 }) }, factions: { F1: faction({ inviteReqs: [{ type: 'city', city: 'Aevum' }] }) } };
    const target = pickTarget(catalog, facts({ city: 'Volhaven' }), new Set(), new Set(), false);
    expect(target.status).toBe('city-gap');
    expect(target.gapCity).toBe('Aevum');
  });

  it('chain targeting: targets the deepest unowned prereq, inheriting the wanted aug\'s score for ordering', () => {
    const catalog = {
      augs: {
        Wanted: augFx({ sellers: ['F1'], repReq: 5000, prereqs: ['Prereq'], score: 3 }),
        Prereq: augFx({ sellers: ['F2'], repReq: 100, passesFilter: false, score: 0 }),
      },
      factions: { F1: faction(), F2: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F2: 0 } }), new Set(['F1', 'F2']), new Set(), false);
    expect(target.aug).toBe('Prereq');
    expect(target.faction).toBe('F2');
    expect(target.repReq).toBe(100);
    expect(target.wantedFor).toBe('Wanted');
    expect(target.score).toBe(3);
  });

  it('a low-score prereq for a high-score wanted aug outranks a mid-score direct aug at equal deficit', () => {
    const catalog = {
      augs: {
        Wanted: augFx({ sellers: ['F1'], repReq: 5000, prereqs: ['Prereq'], score: 5 }),
        Prereq: augFx({ sellers: ['F2'], repReq: 500, passesFilter: false, score: 0 }),
        DirectMid: augFx({ sellers: ['F3'], repReq: 500, score: 2 }),
      },
      factions: { F1: faction(), F2: faction(), F3: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F2: 0, F3: 0 } }), new Set(['F1', 'F2', 'F3']), new Set(), false);
    expect(target.aug).toBe('Prereq');
  });

  it('drops the wanted aug entirely when a prereq has no in-scope seller', () => {
    const catalog = { augs: { Wanted: augFx({ sellers: ['F1'], repReq: 100, prereqs: ['Ghost'] }) }, factions: { F1: faction() } };
    expect(pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false)).toBeNull();
  });

  it('shared-prereq dedupe keeps the max inheriting score', () => {
    const catalog = {
      augs: {
        WantedLow: augFx({ sellers: ['F1'], repReq: 5000, prereqs: ['SharedPrereq'], score: 1 }),
        WantedHigh: augFx({ sellers: ['F1'], repReq: 6000, prereqs: ['SharedPrereq'], score: 4 }),
        SharedPrereq: augFx({ sellers: ['F1'], repReq: 100, passesFilter: false, score: 0 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe('SharedPrereq');
    expect(target.score).toBe(4);
    expect(target.wantedFor).toBe('WantedHigh');
  });

  it('returns the full sorted candidate list alongside the head (S5 needs it)', () => {
    const catalog = {
      augs: {
        A: augFx({ sellers: ['F1'], repReq: 0, score: 2 }),
        B: augFx({ sellers: ['F1'], repReq: 0, score: 1 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.candidates.map((c) => c.aug)).toEqual(['A', 'B']);
  });
});

// Phase 33 (phase-33-money-throughput.spec.md decisions 1/3): the tiered
// rep-met sort + fundCap. Its own fixtures, mirroring the `pickTarget'
// describe block above (self-contained per this file's convention).
describe('pickTarget — Phase 33 fundCap + tiers', () => {
  function augFx(overrides = {}) {
    return { prereqs: [], sellers: [], repReq: 0, price: 0, passesFilter: true, isNFG: false, score: 1, ...overrides };
  }
  function faction(overrides = {}) {
    return { enemies: [], inviteReqs: [], workTypes: ['hacking'], ...overrides };
  }
  function facts(overrides = {}) {
    return { city: 'Sector-12', money: 0, skills: {}, karma: 0, jobs: new Set(), invites: new Set(), factionRep: {}, ...overrides };
  }

  it('tier ordering: buyable discretes, then NFG, then fundBlocked discretes, then buyBlocked NFG', () => {
    const catalog = {
      augs: {
        Cheap: augFx({ sellers: ['F1'], repReq: 0, price: 100 }),
        Costly: augFx({ sellers: ['F1'], repReq: 0, price: 100_000 }), // fundBlocked (over cap)
        [NFG_NAME]: augFx({ sellers: ['F1'], repReq: 0, isNFG: true, price: 5000 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), true, 1000);
    // nfgCapped=true -> NFG is buyBlocked (tier 3); Costly's price (100,000)
    // exceeds fundCap (1000) -> fundBlocked (tier 2); Cheap is tier 0.
    expect(target.candidates.map((c) => c.aug)).toEqual(['Cheap', 'Costly', NFG_NAME]);
  });

  it('an unblocked NFG (tier 1) sorts between buyable discretes (tier 0) and fundBlocked discretes (tier 2)', () => {
    const catalog = {
      augs: {
        Cheap: augFx({ sellers: ['F1'], repReq: 0, price: 100 }),
        Costly: augFx({ sellers: ['F1'], repReq: 0, price: 100_000 }), // fundBlocked
        [NFG_NAME]: augFx({ sellers: ['F1'], repReq: 0, isNFG: true, price: 5000 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false, 1000);
    expect(target.candidates.map((c) => c.aug)).toEqual(['Cheap', NFG_NAME, 'Costly']);
  });

  it('a $0 utility-style aug sorts LAST among tier-0 buyable discretes (price-DESC)', () => {
    const catalog = {
      augs: {
        Utility: augFx({ sellers: ['F1'], repReq: 0, price: 0, score: 0.25 }),
        Expensive: augFx({ sellers: ['F1'], repReq: 0, price: 1_000_000, score: 2 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.candidates.map((c) => c.aug)).toEqual(['Expensive', 'Utility']);
  });

  it('fundCap boundary: price === fundCap is still fundable (strict > only)', () => {
    const catalog = { augs: { AtCap: augFx({ sellers: ['F1'], repReq: 0, price: 1000 }) }, factions: { F1: faction() } };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false, 1000);
    expect(target.fundBlocked).toBe(false);
  });

  it('a deficit>0 candidate is never marked fundBlocked, however low the cap', () => {
    const catalog = { augs: { Unmet: augFx({ sellers: ['F1'], repReq: 5000, price: 1_000_000 }) }, factions: { F1: faction() } };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false, 1);
    expect(target.fundBlocked).toBe(false);
    expect(target.deficit).toBeGreaterThan(0);
  });

  it('default fundCap (Infinity, 5-arg call) preserves rep-met-before-deficit grouping and never fundBlocks', () => {
    const catalog = {
      augs: {
        Met: augFx({ sellers: ['F1'], repReq: 0, price: 1_000_000_000 }),
        Unmet: augFx({ sellers: ['F1'], repReq: 5000, price: 1 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe('Met');
    expect(target.fundBlocked).toBe(false);
  });
});

describe('pickWorkFaction', () => {
  const candidates = [
    { faction: 'CyberSec', deficit: 100, workTypes: ['hacking'] }, // passive
    { faction: 'Aevum', deficit: 50, workTypes: ['field'] }, // active, joined
    { faction: 'Chongqing', deficit: 0, workTypes: ['hacking'] }, // rep-met, not grindable
  ];
  const passive = new Set(['CyberSec']);

  it('skips passive factions, returning the first grindable joined non-passive candidate', () => {
    const result = pickWorkFaction(candidates, new Set(['CyberSec', 'Aevum']), passive, new Set());
    expect(result.faction).toBe('Aevum');
  });

  it('skips donation-closable factions', () => {
    const result = pickWorkFaction(candidates, new Set(['CyberSec', 'Aevum']), passive, new Set(['Aevum']));
    expect(result).toBe(candidates[0]);
  });

  it('falls back to the head candidate when every grindable one is passive', () => {
    const onlyPassive = [{ faction: 'CyberSec', deficit: 100, workTypes: ['hacking'] }];
    const result = pickWorkFaction(onlyPassive, new Set(['CyberSec']), passive, new Set());
    expect(result.faction).toBe('CyberSec');
  });

  it('respects joined-only -- an unjoined candidate is skipped even if otherwise eligible', () => {
    const result = pickWorkFaction(candidates, new Set(['CyberSec']), passive, new Set());
    expect(result).toBe(candidates[0]);
  });
});

describe('updateRepRates', () => {
  it('bootstraps quietly on the first sample, then computes a raw rate on the second, then EWMA-blends on the third', () => {
    let rates = updateRepRates({}, {}, { F1: 1000 }, 10_000);
    expect(rates.F1).toBeUndefined();

    rates = updateRepRates(rates, { F1: 1000 }, { F1: 1100 }, 10_000);
    expect(rates.F1).toBeCloseTo(0.01, 6);

    rates = updateRepRates(rates, { F1: 1100 }, { F1: 1300 }, 10_000);
    const instRate = 200 / 10_000;
    expect(rates.F1).toBeCloseTo(RATE_EWMA_ALPHA * instRate + (1 - RATE_EWMA_ALPHA) * 0.01, 6);
  });

  it("a faction missing from this pass's reps is left untouched", () => {
    const rates = updateRepRates({ F1: 0.5 }, { F1: 1000 }, {}, 1000);
    expect(rates.F1).toBe(0.5);
  });

  it('zero (or negative) dt is a no-op', () => {
    expect(updateRepRates({ F1: 0.5 }, { F1: 1000 }, { F1: 2000 }, 0)).toEqual({ F1: 0.5 });
  });
});

describe('pickHorizonGrind', () => {
  const joined = new Set(['CyberSec', 'NiteSec', 'Sector-12', 'Aevum']);

  it('returns the highest-priority candidate still owed rep', () => {
    const candidates = [
      { aug: NFG_NAME, faction: 'CyberSec', deficit: 0 },
      { aug: 'CashRoot Starter Kit', faction: 'Sector-12', deficit: 11_914 },
      { aug: 'CRTX42-AA Gene Modification', faction: 'NiteSec', deficit: 42_579 },
    ];
    expect(pickHorizonGrind(candidates, joined, new Set())).toEqual({ faction: 'Sector-12', deficit: 11_914 });
  });

  it('skips rep-met candidates rather than reporting a zero-length horizon', () => {
    const candidates = [{ aug: NFG_NAME, faction: 'CyberSec', deficit: 0 }];
    expect(pickHorizonGrind(candidates, joined, new Set())).toEqual({ faction: undefined, deficit: 0 });
  });

  it('skips factions we have not joined (their rep cannot accrue)', () => {
    const candidates = [{ aug: 'Enhanced Myelin Sheathing', faction: 'The Black Hand', deficit: 97_578 }];
    expect(pickHorizonGrind(candidates, joined, new Set())).toEqual({ faction: undefined, deficit: 0 });
  });

  it('skips donation-closable factions -- money closes those, not time', () => {
    const candidates = [{ aug: 'CashRoot Starter Kit', faction: 'Sector-12', deficit: 11_914 }];
    expect(pickHorizonGrind(candidates, joined, new Set(['Sector-12']))).toEqual({ faction: undefined, deficit: 0 });
  });

  it('handles no candidates at all', () => {
    expect(pickHorizonGrind([], joined, new Set())).toEqual({ faction: undefined, deficit: 0 });
    expect(pickHorizonGrind(null, joined, new Set())).toEqual({ faction: undefined, deficit: 0 });
  });

  it('counts PASSIVE factions, unlike pickWorkFaction -- passive rep still takes time', () => {
    // The live 2026-07-16 plateau: every remaining grind is passive, so
    // pickWorkFaction has nothing to work and falls back to the rep-met head.
    // The horizon must NOT follow it there -- passive rep accrues slowly, so
    // NiteSec's 42.6k deficit is exactly the wait the trigger exists to
    // measure. This divergence is the fix.
    const candidates = [
      { aug: NFG_NAME, faction: 'CyberSec', deficit: 0, score: 0.023 },
      { aug: 'CRTX42-AA Gene Modification', faction: 'NiteSec', deficit: 42_579, score: 0.155 },
    ];
    const workTarget = pickWorkFaction(candidates, joined, PASSIVE_REP_FACTIONS, new Set());
    expect(workTarget.deficit).toBe(0); // fell back to the rep-met head: nothing to actively work

    expect(pickHorizonGrind(candidates, joined, new Set())).toEqual({ faction: 'NiteSec', deficit: 42_579 });
  });

  it('regression: the passive-only plateau arms the trigger instead of deadlocking it', () => {
    // Wire the real chain, not evalTrigger in isolation -- both live bugs
    // were in this wiring while evalTrigger's own unit tests stayed green.
    const candidates = [
      { aug: NFG_NAME, faction: 'CyberSec', deficit: 0, score: 0.023, buyBlocked: true },
      { aug: 'CRTX42-AA Gene Modification', faction: 'NiteSec', deficit: 42_579, score: 0.155 },
    ];
    const donationClosable = new Set();
    // ~0.9 rep/s passive => NiteSec is ~13h out, past the 8h threshold.
    const rate = 0.9 / 1000;
    const inputs = (grind) => ({
      queuedGain: 1.37,
      queuedCount: 8,
      phase: 'grinding',
      targetFaction: grind.faction,
      deficit: grind.deficit,
      repRates: { NiteSec: rate, CyberSec: rate },
      rateSamples: { NiteSec: 40, CyberSec: 40 },
      now: 1_000_000,
    });

    const fixed = pickHorizonGrind(candidates, joined, donationClosable);
    const armedFixed = evalTrigger(inputs(fixed), null);
    expect(armedFixed.armed).toBe(true);
    // It arms because it MEASURED NiteSec's ~13h wait and judged it too long.
    expect(armedFixed.horizonMs).toBeGreaterThan(GRIND_HORIZON_MS);

    // The superseded wiring (follow pickWorkFaction) fell back to the rep-met
    // head and reported no faction owed rep. Since gap 7 (2026-07-18) that no
    // longer deadlocks -- it arms as a plateau -- so `armed` alone no longer
    // discriminates the two wirings. What still does: the stale wiring arms
    // BLIND, with horizonMs null, having never seen the 42.6k deficit it was
    // supposed to be waiting on. Right answer, wrong reasoning; the assertion
    // is on the reasoning.
    const viaWorkFaction = pickWorkFaction(candidates, joined, PASSIVE_REP_FACTIONS, donationClosable);
    const stale = { faction: viaWorkFaction.deficit > 0 ? viaWorkFaction.faction : undefined, deficit: viaWorkFaction.deficit > 0 ? viaWorkFaction.deficit : 0 };
    expect(evalTrigger(inputs(stale), null).horizonMs).toBeNull();
  });
});

describe('Phase 26 A1 — gate-aware buying', () => {
  // Daedalus's real requirements, read live from the game 2026-07-18.
  const DAEDALUS_REQS = [
    { type: 'numAugmentations', numAugmentations: 30 },
    { type: 'money', money: 100_000_000_000 },
    {
      type: 'someCondition',
      conditions: [
        { type: 'skills', skills: { hacking: 2500 } },
        { type: 'skills', skills: { strength: 1500, defense: 1500, dexterity: 1500, agility: 1500 } },
      ],
    },
  ];
  // The live deadlock: 29/30 augs, everything else comfortably met.
  const STUCK = { augCount: 29, money: 1_571_600_000_000_000, skills: { hacking: 4435 } };

  describe('numAugmentations requirement (the precondition)', () => {
    it('was unimplemented and fell through to a silent false — it must now evaluate', () => {
      // Before the fix this hit `default: return false`, so the requirement read
      // UNMET forever and anything keyed on it could never fire.
      expect(evaluateInviteReqs(DAEDALUS_REQS, { ...STUCK, augCount: 30 }).joinable).toBe(true);
    });

    it('counts DISTINCT augs — 29 is short, 30 clears, 31 still clears', () => {
      expect(evaluateInviteReqs(DAEDALUS_REQS, STUCK).joinable).toBe(false);
      expect(evaluateInviteReqs(DAEDALUS_REQS, { ...STUCK, augCount: 31 }).joinable).toBe(true);
    });

    it('a missing augCount reads as 0, not as met', () => {
      expect(evaluateInviteReqs(DAEDALUS_REQS, { money: 1e15, skills: { hacking: 4435 } }).joinable).toBe(false);
    });
  });

  describe('onlyAugCountGap — the seam, mirroring onlyCityGap', () => {
    it("reports the gap when the count is the ONLY unmet requirement (today's state)", () => {
      const r = evaluateInviteReqs(DAEDALUS_REQS, STUCK);
      expect(r.onlyAugCountGap).toBe(true);
      expect(r.augCountGap).toBe(1);
    });

    it('does NOT report when something else is also unmet — the safety clause', () => {
      // A fresh node: no money, no hacking. This is what stops the rule firing
      // during early game, when buying junk augs would be catastrophic.
      const fresh = { augCount: 2, money: 1000, skills: { hacking: 10 } };
      expect(evaluateInviteReqs(DAEDALUS_REQS, fresh).onlyAugCountGap).toBe(false);
    });

    it('reports gap size, not just a boolean, so a deficit > 1 is visible', () => {
      expect(evaluateInviteReqs(DAEDALUS_REQS, { ...STUCK, augCount: 24 }).augCountGap).toBe(6);
    });

    it('is false once joinable', () => {
      expect(evaluateInviteReqs(DAEDALUS_REQS, { ...STUCK, augCount: 30 }).onlyAugCountGap).toBe(false);
    });
  });

  describe('findAugCountGate', () => {
    const catalog = {
      factions: {
        Daedalus: { inviteReqs: DAEDALUS_REQS },
        'The Covenant': { inviteReqs: [{ type: 'numAugmentations', numAugmentations: 20 }] },
        CyberSec: { inviteReqs: [{ type: 'backdoorInstalled', server: 'CSEC' }] },
      },
    };
    const scope = new Set(['Daedalus', 'The Covenant', 'CyberSec']);

    it('finds the gate when one exists', () => {
      expect(findAugCountGate(catalog, STUCK, new Set(), scope)).toEqual({ faction: 'Daedalus', gap: 1 });
    });

    it('prefers the SHORTEST gap across factions', () => {
      // At 19 augs Covenant needs 1 and Daedalus needs 11 — chase the cheap one.
      const r = findAugCountGate(catalog, { ...STUCK, augCount: 19 }, new Set(), scope);
      expect(r).toEqual({ faction: 'The Covenant', gap: 1 });
    });

    it('skips factions already joined', () => {
      expect(findAugCountGate(catalog, STUCK, new Set(['Daedalus']), scope)).toBeNull();
    });

    it('skips out-of-scope factions', () => {
      expect(findAugCountGate(catalog, STUCK, new Set(), new Set(['CyberSec']))).toBeNull();
    });

    it('returns null when nothing is gated on a count', () => {
      expect(findAugCountGate(catalog, { ...STUCK, augCount: 30 }, new Set(), scope)).toBeNull();
    });
  });

  describe('computeGateRelease — Phase 26 A2', () => {
    const catalog = { factions: { Daedalus: { inviteReqs: DAEDALUS_REQS } } };
    const scope = new Set(['Daedalus']);

    it('closedByQueue true: the gate found on the INSTALLED count closes on the OWNED (incl. queued) count', () => {
      // STUCK.augCount (29) is installed-only; 30 owned (1 queued) closes it.
      expect(computeGateRelease(catalog, STUCK, 30, new Set(), scope)).toEqual({ faction: 'Daedalus', gap: 1, closedByQueue: true });
    });

    it('closedByQueue false: a gate exists but nothing queued closes it', () => {
      const r = computeGateRelease(catalog, STUCK, 29, new Set(), scope); // owned == installed -- nothing queued
      expect(r).toEqual({ faction: 'Daedalus', gap: 1, closedByQueue: false });
    });

    it('null when no count gate exists on the installed count', () => {
      expect(computeGateRelease(catalog, { ...STUCK, augCount: 30 }, 30, new Set(), scope)).toBeNull();
    });

    it('skips joined/out-of-scope factions exactly like findAugCountGate', () => {
      expect(computeGateRelease(catalog, STUCK, 30, new Set(['Daedalus']), scope)).toBeNull();
      expect(computeGateRelease(catalog, STUCK, 30, new Set(), new Set())).toBeNull();
    });

    it('cold review two-faction case: the SHORTEST-gap faction (X) closes by queue while a second, larger-deficit faction (Y) stays open — closedByQueue must read true for X', () => {
      // A second findAugCountGate call on the owned count would find Y (gap
      // 10, still open on 30) instead of null, and a naive "closedByQueue :=
      // second call returned null" implementation would misread that as
      // "the gate did not close" — even though X's OWN gate, the one this
      // whole computation is about, closed exactly as queued.
      const twoFactionCatalog = {
        factions: {
          FactionX: { inviteReqs: [{ type: 'numAugmentations', numAugmentations: 30 }] },
          FactionY: { inviteReqs: [{ type: 'numAugmentations', numAugmentations: 40 }] },
        },
      };
      const twoScope = new Set(['FactionX', 'FactionY']);
      const r = computeGateRelease(twoFactionCatalog, { augCount: 29 }, 30, new Set(), twoScope);
      expect(r).toEqual({ faction: 'FactionX', gap: 1, closedByQueue: true });
    });
  });

  describe('pickGateFiller', () => {
    // The live buyable set at the deadlock: all filter-dropped, all rep-met.
    const augs = {
      'Wired Reflexes': { price: 2_500_000, repReq: 1250, sellers: ['Tian Di Hui', 'Ishima'], prereqs: [], isNFG: false, passesFilter: false },
      'NutriGen Implant': { price: 2_500_001, repReq: 6250, sellers: ['New Tokyo'], prereqs: [], isNFG: false, passesFilter: false },
      'Neural Wit Amplifier': { price: 10_000_000, repReq: 5000, sellers: ['BitRunners'], prereqs: [], isNFG: false, passesFilter: false },
      'NeuroFlux Governor': { price: 1, repReq: 1, sellers: ['Chongqing'], prereqs: [], isNFG: true, passesFilter: true },
      'Combat Rib II': { price: 100, repReq: 1, sellers: ['Ishima'], prereqs: ['Combat Rib I'], isNFG: false, passesFilter: false },
      'EMBA Analyze Engine': { price: 6_000_000_000, repReq: 625_000, sellers: ['Daedalus'], prereqs: [], isNFG: false, passesFilter: true },
    };
    const rep = { 'Tian Di Hui': 126_787, Ishima: 75_643, 'New Tokyo': 75_801, BitRunners: 168_054, Chongqing: 1_357_600 };

    it('picks the cheapest rep-met aug, ignoring passesFilter entirely', () => {
      expect(pickGateFiller(augs, new Set(), rep)).toEqual({ aug: 'Wired Reflexes', faction: 'Tian Di Hui', price: 2_500_000 });
    });

    it('never picks NFG — it is one entry, so it can never raise the distinct count', () => {
      // NFG is the cheapest thing here by far. Picking it would "succeed" and
      // leave the gate exactly as shut: the deadlock, reconstructed.
      const r = pickGateFiller(augs, new Set(), rep);
      expect(r.aug).not.toBe('NeuroFlux Governor');
    });

    it('skips augs with unowned prereqs — each chain link carries its own 1.9x tax', () => {
      // Combat Rib II is by far the cheapest ($100) but needs Combat Rib I.
      expect(pickGateFiller(augs, new Set(), rep).aug).toBe('Wired Reflexes');
      // ...and becomes eligible once the prereq is owned.
      expect(pickGateFiller(augs, new Set(['Combat Rib I']), rep).aug).toBe('Combat Rib II');
    });

    it('skips augs we already own or have queued', () => {
      expect(pickGateFiller(augs, new Set(['Wired Reflexes']), rep).aug).toBe('NutriGen Implant');
    });

    it('skips augs whose only sellers we lack the rep for', () => {
      // EMBA is unowned and passing, but Daedalus is exactly who we cannot reach.
      expect(pickGateFiller({ 'EMBA Analyze Engine': augs['EMBA Analyze Engine'] }, new Set(), rep)).toBeNull();
    });

    it('returns null when nothing is buyable', () => {
      expect(pickGateFiller({}, new Set(), rep)).toBeNull();
      expect(pickGateFiller(augs, new Set(Object.keys(augs)), rep)).toBeNull();
    });
  });

  describe('the runaway: queued augs must close the gap (live incident 2026-07-18 07:39)', () => {
    // Shipped with the gate keyed on INSTALLED augs. Buying queues an aug, so
    // the installed count never moved, `gap` stayed 1, and the rule re-fired
    // every pass: 5 buys in 50 seconds ($4.75m -> $371m at 1.9x each) before
    // it was killed. Seventh instance of "what we have" vs "what we will have".
    const reqs = [{ type: 'numAugmentations', numAugmentations: 30 }];
    const catalog = { factions: { Daedalus: { inviteReqs: reqs } } };
    const scope = new Set(['Daedalus']);
    const facts = { money: 1e15, skills: { hacking: 4435 } };

    it('gap is open at 29 distinct owned-or-queued', () => {
      expect(findAugCountGate(catalog, { ...facts, augCount: 29 }, new Set(), scope)).toEqual({ faction: 'Daedalus', gap: 1 });
    });

    it('gap CLOSES once the purchase is queued, before any install', () => {
      // The whole fix: 29 installed + 1 queued = 30 distinct => stop buying.
      expect(findAugCountGate(catalog, { ...facts, augCount: 30 }, new Set(), scope)).toBeNull();
    });

    it('stays closed while over-queued, so a re-fire cannot cascade', () => {
      for (const n of [31, 34, 40]) {
        expect(findAugCountGate(catalog, { ...facts, augCount: n }, new Set(), scope)).toBeNull();
      }
    });
  });

  describe('planPass emits the gate-fill buy', () => {
    const base = {
      joinFactions: [],
      factionScope: new Set(['Daedalus']),
      money: 1e15,
      livePrice: 100,
      paused: false,
      mode: 'auto',
      endgameHold: true,
      target: null,
    };

    it('emits a flagged buy and a gate-fill phase', () => {
      const plan = planPass({ ...base, gateFill: { aug: 'Wired Reflexes', faction: 'Tian Di Hui', price: 2_500_000 } });
      expect(plan.phase).toBe('gate-fill');
      expect(plan.actions).toContainEqual({
        type: 'buy',
        aug: 'Wired Reflexes',
        faction: 'Tian Di Hui',
        price: 2_500_000,
        gateFill: true,
      });
    });

    it('paused still wins over a gate-fill', () => {
      const plan = planPass({ ...base, paused: true, gateFill: { aug: 'Wired Reflexes', faction: 'Tian Di Hui', price: 1 } });
      expect(plan.phase).toBe('paused');
      expect(plan.actions).toEqual([]);
    });

    it('no gateFill leaves behavior exactly as before', () => {
      expect(planPass({ ...base }).phase).not.toBe('gate-fill');
    });
  });
});

describe('nfgLevelsByRep', () => {
  // NFG's repReq escalates x1.14/level, same shape as its base price. Measured
  // at install #9 (2026-07-18): 122,736 -> 998,737 across exactly 16 levels
  // bought (ratio 8.137 = 1.14^16). This corrects the close-out's "does not
  // climb with level" claim. -> docs/neuroflux.md
  it('0 when rep cannot clear even the first level', () => {
    expect(nfgLevelsByRep(9_999, 10_000)).toBe(0);
    expect(nfgLevelsByRep(0, 10_000)).toBe(0);
  });

  it('exactly 1 at the requirement, and until the second level is affordable', () => {
    expect(nfgLevelsByRep(10_000, 10_000)).toBe(1);
    expect(nfgLevelsByRep(11_399, 10_000)).toBe(1); // 2nd level needs 11,400
    expect(nfgLevelsByRep(11_400, 10_000)).toBe(2);
  });

  it("install #9's live shape: 122,736 req against 3.93m rep allows 27 levels", () => {
    // Money bound it to 16 that cycle, which is why rep never showed up as the
    // constraint -- but the headroom is collapsing: that same 3.93m rep covers
    // only 11 levels against the NEW 998,737 requirement, and rep restarts at
    // zero next install while the requirement does not.
    expect(nfgLevelsByRep(3_932_303, 122_736)).toBe(27);
    expect(nfgLevelsByRep(3_932_303, 998_737)).toBe(11);
  });

  it('degenerate inputs never produce a bound that would suppress the tail wrongly', () => {
    expect(nfgLevelsByRep(-1, 10_000)).toBe(0);
    expect(nfgLevelsByRep(10_000, 0)).toBe(0);
  });
});

describe('evalTrigger', () => {
  function baseInputs(overrides = {}) {
    return {
      queuedGain: 2,
      queuedCount: 3,
      nfgPrice: 0,
      nfgHackingMult: 1,
      money: 0,
      phase: 'idle-plateau',
      targetFaction: undefined,
      deficit: 0,
      repRates: {},
      rateSamples: {},
      paused: false,
      endgameHold: false,
      mode: 'observe',
      now: 1_000_000,
      ...overrides,
    };
  }

  it('the gain floor blocks arming even at idle-plateau (early-cycle degenerate-loop guard)', () => {
    expect(evalTrigger(baseInputs({ queuedGain: 1.05 }), null).armed).toBe(false);
  });

  it('arms at idle-plateau once the gain floor is cleared', () => {
    const t = evalTrigger(baseInputs(), null);
    expect(t.armed).toBe(true);
    // Phase 31: not stalled (default) -- pins this as a gainArmed/phaseArmed
    // arm, not accidentally masked by stallArmed.
    expect(t.reasons.stallArmed).toBe(false);
  });

  it('queuedCount 0 blocks arming even with a huge projected gain', () => {
    expect(evalTrigger(baseInputs({ queuedCount: 0, queuedGain: 5 }), null).armed).toBe(false);
  });

  it('paused blocks arming', () => {
    expect(evalTrigger(baseInputs({ paused: true }), null).armed).toBe(false);
  });

  it('endgame hold blocks arming', () => {
    expect(evalTrigger(baseInputs({ endgameHold: true }), null).armed).toBe(false);
  });

  it('awaiting-money phase never arms (rep is met; buy-then-install dominates)', () => {
    expect(evalTrigger(baseInputs({ phase: 'awaiting-money' }), null).armed).toBe(false);
  });

  it('fires once armed continuously for TRIGGER_SUSTAIN_MS, and sustain resets/fired clears when armed lapses', () => {
    const t0 = evalTrigger(baseInputs({ now: 0 }), null);
    expect(t0.fired).toBe(false);
    const t1 = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS - 1 }), t0);
    expect(t1.fired).toBe(false);
    const t2 = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS }), t1);
    expect(t2.fired).toBe(true);
    const lapsed = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS + 1, queuedGain: 1 }), t2);
    expect(lapsed.armed).toBe(false);
    expect(lapsed.fired).toBe(false);
  });

  it('horizon-fire needs a measured rate with at least RATE_MIN_SAMPLES samples, and a horizon exceeding GRIND_HORIZON_MS', () => {
    const belowSampleFloor = baseInputs({ phase: 'grinding', targetFaction: 'F1', deficit: 1_000_000, repRates: { F1: 1 }, rateSamples: { F1: 5 } });
    expect(evalTrigger(belowSampleFloor, null).armed).toBe(false);

    const shortHorizon = baseInputs({ phase: 'grinding', targetFaction: 'F1', deficit: 1000, repRates: { F1: 1 }, rateSamples: { F1: 40 } });
    expect(evalTrigger(shortHorizon, null).armed).toBe(false);

    const longHorizon = baseInputs({ phase: 'grinding', targetFaction: 'F1', deficit: GRIND_HORIZON_MS * 2, repRates: { F1: 1 }, rateSamples: { F1: 40 } });
    const t = evalTrigger(longHorizon, null);
    expect(t.armed).toBe(true);
    // Phase 31: rep-horizon arm, not stallArmed (which excludes phase "grinding" anyway).
    expect(t.reasons.stallArmed).toBe(false);
  });

  describe('gap 7 -- grinding with nothing owed rep is a plateau, and must arm', () => {
    // Live regression, 2026-07-18: the auto cycle sat 25h in phase "grinding"
    // with gainArmed true (gain 2.36) and $3.3q idle, because every reachable
    // aug was rep-met so pickHorizonGrind returned {faction: undefined} and
    // the old code read that as "no horizon -> don't arm". NFG's per-cycle cap
    // keeps planActions in "grinding" (never "idle-plateau"), so this state is
    // the steady state at a plateau, not a transient.
    const noOwedGrind = { phase: 'grinding', targetFaction: undefined, deficit: 0 };

    it('arms when pickHorizonGrind found no faction still owed rep', () => {
      const t = evalTrigger(baseInputs(noOwedGrind), null);
      // Phase 34 decision 8: shape-extension edit (escalationArmed added), not
      // an expected-value change -- see phase-34-install-timing.spec.md.
      expect(t.reasons).toEqual({ gainArmed: true, phaseArmed: true, gateArmed: false, stallArmed: false, escalationArmed: false });
      expect(t.armed).toBe(true);
      expect(t.horizonMs).toBeNull();
    });

    it('fires after the normal sustain, same as any other arm', () => {
      const t0 = evalTrigger(baseInputs({ ...noOwedGrind, now: 0 }), null);
      expect(t0.fired).toBe(false);
      expect(evalTrigger(baseInputs({ ...noOwedGrind, now: TRIGGER_SUSTAIN_MS }), t0).fired).toBe(true);
    });

    it('still respects every gain-side block (the plateau read widens phaseArmed only)', () => {
      expect(evalTrigger(baseInputs({ ...noOwedGrind, queuedGain: 1.05 }), null).armed).toBe(false);
      expect(evalTrigger(baseInputs({ ...noOwedGrind, queuedCount: 0, queuedGain: 5 }), null).armed).toBe(false);
      expect(evalTrigger(baseInputs({ ...noOwedGrind, paused: true }), null).armed).toBe(false);
      expect(evalTrigger(baseInputs({ ...noOwedGrind, endgameHold: true }), null).armed).toBe(false);
    });

    it('does NOT arm when we are merely money-blocked (that is phase awaiting-money)', () => {
      // rep is met but cash is short -- waiting genuinely earns the buy, so
      // this must stay a non-arming phase. Guards the fix against overreach.
      expect(evalTrigger(baseInputs({ phase: 'awaiting-money', targetFaction: undefined, deficit: 0 }), null).armed).toBe(false);
    });

    it('a faction IS owed rep -> the horizon rule still governs (unchanged)', () => {
      const short = baseInputs({ phase: 'grinding', targetFaction: 'F1', deficit: 1000, repRates: { F1: 1 }, rateSamples: { F1: 40 } });
      expect(evalTrigger(short, null).armed).toBe(false);
    });

    it("install #8's live shape: the exact state that stalled 25h", () => {
      const stalled = baseInputs({
        phase: 'grinding',
        targetFaction: undefined, // all 38 reachable augs rep-met
        deficit: 0,
        queuedGain: 2.0091,
        queuedCount: 6,
        nfgPrice: 8_661_370_675,
        nfgHackingMult: 1.01,
        money: 3_336_199_017_192_556,
        mode: 'auto',
      });
      const t = evalTrigger(stalled, null);
      expect(t.armed).toBe(true);
      expect(t.totalGain).toBeGreaterThan(MIN_TOTAL_GAIN);
    });
  });

  describe('the NFG projection is bounded by rep, not money alone', () => {
    // The money-only projection was documented as "accepted optimism -- NFG's
    // rep requirement may bind first." Since repReq escalates x1.14/level while
    // rep resets to zero every install, that optimism is now the common case,
    // and it inflates the very totalGain MIN_TOTAL_GAIN gates on.
    const rich = { nfgPrice: 1e9, nfgHackingMult: 1.01, money: 1e15, queuedGain: 1, queuedCount: 1 };

    it('takes the rep bound when rep is the tighter of the two', () => {
      const moneyOnly = evalTrigger(baseInputs(rich), null);
      expect(moneyOnly.nfgLevelsProjected).toBeGreaterThan(3);
      const repBound = evalTrigger(baseInputs({ ...rich, nfgRep: 12_000, nfgRepReq: 10_000 }), null);
      expect(repBound.nfgLevelsProjected).toBe(2); // 10k + 11.4k cleared, 12.996k not
      expect(repBound.totalGain).toBeLessThan(moneyOnly.totalGain);
    });

    it('leaves the money bound alone when money is the tighter of the two', () => {
      const poor = { ...rich, money: 3e9 }; // ~2 levels of cash
      const a = evalTrigger(baseInputs(poor), null);
      const b = evalTrigger(baseInputs({ ...poor, nfgRep: 1e12, nfgRepReq: 10_000 }), null);
      expect(b.nfgLevelsProjected).toBe(a.nfgLevelsProjected);
    });

    it('projects 0 levels when rep cannot clear even the first', () => {
      const t = evalTrigger(baseInputs({ ...rich, nfgRep: 9_999, nfgRepReq: 10_000 }), null);
      expect(t.nfgLevelsProjected).toBe(0);
      expect(t.projectedNfgFactor).toBe(1);
    });

    it('unsupplied rep/repReq stays money-only (back-compat for other callers)', () => {
      const a = evalTrigger(baseInputs(rich), null);
      const b = evalTrigger(baseInputs({ ...rich, nfgRep: 0, nfgRepReq: 0 }), null);
      expect(b.nfgLevelsProjected).toBe(a.nfgLevelsProjected);
    });

    it('ZERO usable rep projects 0 levels -- not money-only (live 2026-07-18)', () => {
      // The case the whole fix exists for, and the one an over-eager
      // supplied-ness test silently skips: no joined seller clears repReq, so
      // pickNfgSeller returns null, the caller passes rep 0, and spendDownPlan
      // suppresses the entire tail. Projecting money-only here claimed 14
      // levels and a 1.1495 totalGain -- over MIN_TOTAL_GAIN -- against a real
      // yield of zero. `repReq > 0` is what marks the info supplied; rep 0 is
      // a real answer, not a missing one.
      const t = evalTrigger(baseInputs({ ...rich, nfgRep: 0, nfgRepReq: 998_737 }), null);
      expect(t.nfgLevelsProjected).toBe(0);
      expect(t.projectedNfgFactor).toBe(1);
      expect(t.totalGain).toBe(1); // queuedGain alone, no phantom NFG tail
    });
  });

  it('auto-mode latch: once fired, a spend-down/installing phase input does not clear it', () => {
    const t0 = evalTrigger(baseInputs({ now: 0, mode: 'auto' }), null);
    const t1 = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS, mode: 'auto' }), t0);
    expect(t1.fired).toBe(true);
    const duringSpendDown = evalTrigger(
      baseInputs({ now: TRIGGER_SUSTAIN_MS + 60_000, mode: 'auto', phase: 'spend-down', queuedGain: 1, queuedCount: 0 }),
      t1,
    );
    expect(duringSpendDown.fired).toBe(true);
    expect(duringSpendDown.latched).toBe(true);
  });

  it('the pause-file lever drops the latch back to observe behavior', () => {
    const t0 = evalTrigger(baseInputs({ now: 0, mode: 'auto' }), null);
    const t1 = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS, mode: 'auto' }), t0);
    const paused = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS + 1, mode: 'auto', paused: true }), t1);
    expect(paused.fired).toBe(false);
  });

  it('the mode-file lever (mode no longer "auto") drops the latch', () => {
    const t0 = evalTrigger(baseInputs({ now: 0, mode: 'auto' }), null);
    const t1 = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS, mode: 'auto' }), t0);
    // The reverted call must land on inputs that genuinely do NOT arm, or the
    // test proves nothing about the latch. A grind with a short measured
    // horizon is such a state; bare `phase: 'grinding'` is not (since gap 7 it
    // arms as a plateau when no faction is owed rep).
    const reverted = evalTrigger(
      baseInputs({ now: TRIGGER_SUSTAIN_MS + 1, mode: 'observe', phase: 'grinding', targetFaction: 'F1', deficit: 1000, repRates: { F1: 1 }, rateSamples: { F1: 40 } }),
      t1,
    );
    expect(reverted.fired).toBe(false);
  });

  it('NFG projection: n derived from the price ladder vs money (money-only, S7 boundary rule)', () => {
    const result = evalTrigger(baseInputs({ queuedGain: 1, queuedCount: 1, nfgPrice: 100_000, nfgHackingMult: 1.05, money: 1_000_000 }), null);
    const expectedRatio = 1 + (1_000_000 * (NFG_PRICE_LADDER - 1)) / 100_000;
    const expectedN = Math.floor(Math.log(expectedRatio) / Math.log(NFG_PRICE_LADDER));
    expect(result.nfgLevelsProjected).toBe(expectedN);
    expect(result.projectedNfgFactor).toBeCloseTo(Math.pow(1.05, expectedN), 6);
  });

  describe('Phase 26 A2 — gate-release arming (S1/S2/S10)', () => {
    const closedTrue = { faction: 'Daedalus', gap: 1, closedByQueue: true };
    const closedFalse = { faction: 'Daedalus', gap: 1, closedByQueue: false };

    it('arms under endgameHold, ignoring MIN_TOTAL_GAIN — the live BN1.3 fixture (totalGain 1.02) verbatim', () => {
      const t = evalTrigger(baseInputs({ queuedGain: 1.02, endgameHold: true, gateRelease: closedTrue }), null);
      expect(t.totalGain).toBeCloseTo(1.02, 6);
      expect(t.totalGain).toBeLessThan(MIN_TOTAL_GAIN);
      expect(t.reasons.gateArmed).toBe(true);
      expect(t.armed).toBe(true);
      expect(t.gateRelease).toEqual(closedTrue);
      // Phase 31: pins this as a gateArmed arm, not masked by stallArmed
      // (which is structurally false here anyway -- endgameHold excludes it).
      expect(t.reasons.stallArmed).toBe(false);
    });

    it('does NOT arm when a gate exists but the queue does not close it (the A2-runaway-analog guard)', () => {
      const t = evalTrigger(baseInputs({ endgameHold: true, gateRelease: closedFalse }), null);
      expect(t.reasons.gateArmed).toBe(false);
      expect(t.armed).toBe(false); // gainArmed is also false here (endgameHold)
    });

    it('does not arm at queuedCount 0, even with a closed gate release', () => {
      const t = evalTrigger(baseInputs({ queuedCount: 0, endgameHold: true, gateRelease: closedTrue }), null);
      expect(t.armed).toBe(false);
    });

    it('paused blocks a gate-release arm exactly like a gain-side arm', () => {
      const t = evalTrigger(baseInputs({ paused: true, endgameHold: true, gateRelease: closedTrue }), null);
      expect(t.armed).toBe(false);
    });

    it('sustain is still required — no instant fire from a gate-release arm', () => {
      const t0 = evalTrigger(baseInputs({ now: 0, endgameHold: true, gateRelease: closedTrue }), null);
      expect(t0.armed).toBe(true);
      expect(t0.fired).toBe(false);
      const t1 = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS, endgameHold: true, gateRelease: closedTrue }), t0);
      expect(t1.fired).toBe(true);
    });

    it('the auto-mode latch and abort levers apply to a gate-armed fire exactly as to a gain-armed one', () => {
      const t0 = evalTrigger(baseInputs({ now: 0, mode: 'auto', endgameHold: true, gateRelease: closedTrue }), null);
      const t1 = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS, mode: 'auto', endgameHold: true, gateRelease: closedTrue }), t0);
      expect(t1.fired).toBe(true);

      // Latches through a spend-down pass even though the gate input clears
      // (the queue is now empty -- installer.js took over).
      const duringSpendDown = evalTrigger(
        baseInputs({ now: TRIGGER_SUSTAIN_MS + 60_000, mode: 'auto', phase: 'spend-down', queuedGain: 1, queuedCount: 0, gateRelease: null }),
        t1,
      );
      expect(duringSpendDown.fired).toBe(true);
      expect(duringSpendDown.latched).toBe(true);

      // The pause lever still clears it.
      const paused = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS + 1, mode: 'auto', endgameHold: true, gateRelease: closedTrue, paused: true }), t1);
      expect(paused.fired).toBe(false);
    });

    it('once-per-gate is structural: the post-install fixture (gate met on installed count, queue empty) cannot re-arm', () => {
      // After the install, findAugCountGate reads the requirement met on the
      // installed count (no gate at all) => gateRelease is null upstream, and
      // the queue is empty. Neither the gain path nor the gate path can arm.
      const t = evalTrigger(baseInputs({ queuedCount: 0, gateRelease: null }), null);
      expect(t.armed).toBe(false);
      expect(t.reasons.gateArmed).toBe(false);
    });
  });

  describe('Phase 26 D9 — nfgBoundBy names the tail\'s binding constraint', () => {
    it('"money" when no rep info is supplied', () => {
      const t = evalTrigger(baseInputs({ nfgPrice: 1e9, nfgHackingMult: 1.01, money: 1e15, queuedGain: 1, queuedCount: 1 }), null);
      expect(t.nfgBoundBy).toBe('money');
      expect(t.nfgLevelsProjected).toBeGreaterThan(0);
    });

    it('"rep" when rep is the tighter (or equally tight) bound — including when it cuts the tail to zero', () => {
      const t = evalTrigger(
        baseInputs({ nfgPrice: 1e9, nfgHackingMult: 1.01, money: 1e15, queuedGain: 1, queuedCount: 1, nfgRep: 0, nfgRepReq: 998_737 }),
        null,
      );
      expect(t.nfgBoundBy).toBe('rep');
      expect(t.nfgLevelsProjected).toBe(0);
    });

    it('"none" when no NFG price info is supplied at all (default inputs)', () => {
      const t = evalTrigger(baseInputs(), null);
      expect(t.nfgBoundBy).toBe('none');
      expect(t.nfgLevelsProjected).toBe(0);
    });
  });

  describe('Phase 31 — stall-arming (the money-blocked-deadlock fix)', () => {
    // Models the live 71h deadlock's gain branch: money-blocked, gain-side
    // queue already clears MIN_TOTAL_GAIN, but queuedCount is below the floor
    // -- gainArmed alone is what should arm stallArmed here.
    const moneyBlockedGainCase = { phase: 'awaiting-money', queuedGain: 1.18, queuedCount: 3, stalled: true };
    // A padding queue whose gain never clears MIN_TOTAL_GAIN (all hacking
    // 1.0 count-gate augs) but has queued enough purchases to have escalated
    // the price ladder -- the queue-floor sub-condition's reason to exist.
    const paddingQueueCase = { phase: 'idle-plateau', queuedGain: 1.0, queuedCount: STALL_QUEUE_FLOOR, stalled: true };

    it('1. stalled + gain, money-blocked -> arms via the gain sub-condition', () => {
      const t = evalTrigger(baseInputs(moneyBlockedGainCase), null);
      expect(t.totalGain).toBeGreaterThanOrEqual(MIN_TOTAL_GAIN);
      expect(t.armed).toBe(true);
      expect(t.reasons.stallArmed).toBe(true);
      // Confirms this is the NEW hatch, not the pre-existing ones.
      expect(t.reasons.phaseArmed).toBe(false);
      expect(t.reasons.gateArmed).toBe(false);
    });

    it('2. stalled + padding queue, plateaued, queuedCount at the floor -> arms via the queue-floor sub-condition', () => {
      const t = evalTrigger(baseInputs(paddingQueueCase), null);
      expect(t.totalGain).toBeLessThan(MIN_TOTAL_GAIN);
      expect(t.reasons.gainArmed).toBe(false);
      expect(t.armed).toBe(true);
      expect(t.reasons.stallArmed).toBe(true);
    });

    it('3. stalled + tiny queue, below the floor and below the gain gate -> keeps waiting', () => {
      const t = evalTrigger(baseInputs({ phase: 'idle-plateau', queuedGain: 1.0, queuedCount: 2, stalled: true }), null);
      expect(t.armed).toBe(false);
      expect(t.reasons.stallArmed).toBe(false);
    });

    it('4. boundary: queuedCount exactly STALL_QUEUE_FLOOR arms (pins the >= boundary against regressing to >)', () => {
      const atFloor = evalTrigger(baseInputs({ phase: 'idle-plateau', queuedGain: 1.0, queuedCount: STALL_QUEUE_FLOOR, stalled: true }), null);
      expect(atFloor.armed).toBe(true);
      expect(atFloor.reasons.stallArmed).toBe(true);
      const belowFloor = evalTrigger(baseInputs({ phase: 'idle-plateau', queuedGain: 1.0, queuedCount: STALL_QUEUE_FLOOR - 1, stalled: true }), null);
      expect(belowFloor.armed).toBe(false);
      expect(belowFloor.reasons.stallArmed).toBe(false);
    });

    it("5. stalled + productive grind (fable's blocker) -- stallArmed never overrides a sub-horizon grind", () => {
      // Same shortHorizon shape as the pre-existing horizon-fire test: gainArmed
      // true, phaseArmed false (horizon under GRIND_HORIZON_MS). Without the
      // `phase !== "grinding"` gate this would wrongly install mid-grind.
      const t = evalTrigger(
        baseInputs({ phase: 'grinding', targetFaction: 'F1', deficit: 1000, repRates: { F1: 1 }, rateSamples: { F1: 40 }, stalled: true }),
        null,
      );
      expect(t.reasons.gainArmed).toBe(true);
      expect(t.reasons.phaseArmed).toBe(false);
      expect(t.armed).toBe(false);
      expect(t.reasons.stallArmed).toBe(false);
    });

    it('6. grinding, long horizon (regression) -- arms via the pre-existing phaseArmed path, not stallArmed', () => {
      const t = evalTrigger(
        baseInputs({ phase: 'grinding', targetFaction: 'F1', deficit: GRIND_HORIZON_MS * 2, repRates: { F1: 1 }, rateSamples: { F1: 40 }, stalled: true }),
        null,
      );
      expect(t.armed).toBe(true);
      expect(t.reasons.phaseArmed).toBe(true);
      expect(t.reasons.stallArmed).toBe(false);
    });

    it('7. not stalled -- no regression for the non-stalled money-blocked case', () => {
      const t = evalTrigger(baseInputs({ ...moneyBlockedGainCase, stalled: false }), null);
      expect(t.armed).toBe(false);
      expect(t.reasons.stallArmed).toBe(false);
    });

    it('8. paused / endgameHold honor their guards even against an otherwise-arming stalled state', () => {
      const paused = evalTrigger(baseInputs({ ...paddingQueueCase, paused: true }), null);
      expect(paused.armed).toBe(false);
      expect(paused.reasons.stallArmed).toBe(false);

      const endgameHeld = evalTrigger(baseInputs({ ...moneyBlockedGainCase, endgameHold: true }), null);
      expect(endgameHeld.armed).toBe(false);
      expect(endgameHeld.reasons.stallArmed).toBe(false);
    });

    it('9. default -- stalled omitted from inputs behaves as stalled:false (explicit-default check)', () => {
      const { stalled, ...withoutStalled } = moneyBlockedGainCase;
      const t = evalTrigger(baseInputs(withoutStalled), null);
      expect(t.armed).toBe(false);
      expect(t.reasons.stallArmed).toBe(false);
    });

    it('10. sustain + latch -- parity with gateArmed\'s existing coverage', () => {
      const t0 = evalTrigger(baseInputs({ ...paddingQueueCase, now: 0 }), null);
      expect(t0.armed).toBe(true);
      expect(t0.fired).toBe(false);
      const t1 = evalTrigger(baseInputs({ ...paddingQueueCase, now: TRIGGER_SUSTAIN_MS }), t0);
      expect(t1.fired).toBe(true);
      expect(t1.reasons.stallArmed).toBe(true);

      // Auto-mode latch: once fired, inputs that would no longer arm (queue
      // spent down, no longer stalled) stay fired/latched.
      const t0Auto = evalTrigger(baseInputs({ ...paddingQueueCase, now: 0, mode: 'auto' }), null);
      const t1Auto = evalTrigger(baseInputs({ ...paddingQueueCase, now: TRIGGER_SUSTAIN_MS, mode: 'auto' }), t0Auto);
      expect(t1Auto.fired).toBe(true);
      const duringSpendDown = evalTrigger(
        baseInputs({ now: TRIGGER_SUSTAIN_MS + 60_000, mode: 'auto', phase: 'spend-down', queuedGain: 1, queuedCount: 0, stalled: false }),
        t1Auto,
      );
      expect(duringSpendDown.fired).toBe(true);
      expect(duringSpendDown.latched).toBe(true);
    });
  });

  describe('Phase 33 — must-buy hold (decision 6a)', () => {
    it('holds: suppresses an otherwise-gainArmed idle-plateau while money < mustBuyCost <= mustBuyCap', () => {
      const t = evalTrigger(baseInputs({ mustBuyCost: 1000, mustBuyCap: 5000, money: 0 }), null);
      expect(t.mustBuyHold).toBe(true);
      expect(t.armed).toBe(false);
    });

    it('holds: suppresses stallArmed the same way', () => {
      // phase deliberately NOT "grinding" -- stallArmed's own exclusion (see
      // evalTrigger's header) would otherwise make this test's premise false
      // regardless of the must-buy hold.
      const t = evalTrigger(
        baseInputs({ phase: 'awaiting-money', queuedGain: 1, stalled: true, queuedCount: STALL_QUEUE_FLOOR, mustBuyCost: 1000, mustBuyCap: 5000, money: 0 }),
        null,
      );
      expect(t.reasons.stallArmed).toBe(true); // the raw reason still fires...
      expect(t.mustBuyHold).toBe(true);
      expect(t.armed).toBe(false); // ...but the hold suppresses the overall arm
    });

    it('does NOT hold gateArmed — the one arming reason exempt by design', () => {
      const t = evalTrigger(
        baseInputs({ endgameHold: true, gateRelease: { faction: 'Daedalus', gap: 1, closedByQueue: true }, mustBuyCost: 1000, mustBuyCap: 5000, money: 0 }),
        null,
      );
      expect(t.mustBuyHold).toBe(true);
      expect(t.reasons.gateArmed).toBe(true);
      expect(t.armed).toBe(true);
    });

    it('releases once money clears mustBuyCost', () => {
      const t = evalTrigger(baseInputs({ mustBuyCost: 1000, mustBuyCap: 5000, money: 1000 }), null);
      expect(t.mustBuyHold).toBe(false);
      expect(t.armed).toBe(true);
    });

    it('waives when mustBuyCost exceeds mustBuyCap, however little money there is', () => {
      const t = evalTrigger(baseInputs({ mustBuyCost: 10_000, mustBuyCap: 5000, money: 0 }), null);
      expect(t.mustBuyHold).toBe(false);
      expect(t.armed).toBe(true);
    });

    it('mustBuyCost 0 (nothing to must-buy) never holds', () => {
      const t = evalTrigger(baseInputs({ mustBuyCost: 0, mustBuyCap: 5000, money: 0 }), null);
      expect(t.mustBuyHold).toBe(false);
      expect(t.armed).toBe(true);
    });

    it('defaults (mustBuyCost/mustBuyCap omitted) change nothing from pre-Phase-33 behavior', () => {
      const t = evalTrigger(baseInputs(), null);
      expect(t.mustBuyHold).toBe(false);
      expect(t.armed).toBe(true);
    });
  });

  describe('Phase 34 — escalation-aware install timing (evalTrigger passthrough)', () => {
    it('defaults regression: omitting the three new inputs reproduces pre-Phase-34 behavior', () => {
      // Phase 31 fixture (moneyBlockedGainCase-shaped): money-blocked-alike
      // gain arm, no livePrice/incomePerSec/targetIsNFG supplied.
      const t = evalTrigger(baseInputs({ phase: 'awaiting-money', queuedGain: 1.18, queuedCount: 3, stalled: true }), null);
      expect(t.reason).toBeDefined();
      expect(t.blockers).toBeDefined();
      expect(t.reasons.escalationArmed).toBe(false);
      expect(t.armed).toBe(true); // stallArmed still fires exactly as before
      expect(t.reasons.stallArmed).toBe(true);

      // gap-7 fixture.
      const gap7 = evalTrigger(baseInputs({ phase: 'grinding', targetFaction: undefined, deficit: 0 }), null);
      expect(gap7.armed).toBe(true);
      expect(gap7.reasons.escalationArmed).toBe(false);
      expect(gap7.reason).toBe('gain-phase');
    });

    it('sustain + latch parity for an escalation-armed state (mirrors the gateArmed/stallArmed coverage)', () => {
      const escFixture = {
        phase: 'awaiting-money',
        queuedGain: 2.118,
        queuedCount: 11,
        livePrice: 1.048e12,
        money: 3.79e11,
        incomePerSec: 8.5e7,
        targetIsNFG: false,
      };
      const t0 = evalTrigger(baseInputs({ ...escFixture, now: 0 }), null);
      expect(t0.armed).toBe(true);
      expect(t0.reason).toBe('escalation');
      expect(t0.fired).toBe(false);
      const t1 = evalTrigger(baseInputs({ ...escFixture, now: TRIGGER_SUSTAIN_MS }), t0);
      expect(t1.fired).toBe(true);

      const t0Auto = evalTrigger(baseInputs({ ...escFixture, now: 0, mode: 'auto' }), null);
      const t1Auto = evalTrigger(baseInputs({ ...escFixture, now: TRIGGER_SUSTAIN_MS, mode: 'auto' }), t0Auto);
      expect(t1Auto.fired).toBe(true);
      const duringSpendDown = evalTrigger(
        baseInputs({ now: TRIGGER_SUSTAIN_MS + 60_000, mode: 'auto', phase: 'spend-down', queuedGain: 1, queuedCount: 0 }),
        t1Auto,
      );
      expect(duringSpendDown.fired).toBe(true);
      expect(duringSpendDown.latched).toBe(true);
    });
  });
});

describe('decideInstall — Phase 34 (escalation-aware install timing)', () => {
  // Mirrors evalTrigger's baseInputs fixture, but at decideInstall's own
  // ctx shape (totalGain precomputed rather than derived from
  // queuedGain/nfgPrice/nfgHackingMult -- that projection lives one layer up
  // in evalTrigger and is unit-tested there).
  function baseCtx(overrides = {}) {
    return {
      totalGain: 2,
      queuedCount: 3,
      money: 0,
      phase: 'idle-plateau',
      targetFaction: undefined,
      deficit: 0,
      repRates: {},
      rateSamples: {},
      paused: false,
      endgameHold: false,
      gateRelease: null,
      stalled: false,
      mustBuyCost: 0,
      mustBuyCap: Infinity,
      livePrice: null,
      incomePerSec: null,
      targetIsNFG: false,
      ...overrides,
    };
  }

  describe('existing-path re-coverage (DECIDED 1 — every legacy arming path survives the extraction)', () => {
    it('gate arms regardless of endgameHold/mustBuyHold', () => {
      const closedTrue = { faction: 'Daedalus', gap: 1, closedByQueue: true };
      const d = decideInstall(baseCtx({ totalGain: 1.02, endgameHold: true, gateRelease: closedTrue, mustBuyCost: 1000, mustBuyCap: 5000, money: 0 }));
      expect(d.armed).toBe(true);
      expect(d.reason).toBe('gate');
      expect(d.reasons.gateArmed).toBe(true);
    });

    it('gain-phase arms on idle-plateau', () => {
      const d = decideInstall(baseCtx());
      expect(d.armed).toBe(true);
      expect(d.reason).toBe('gain-phase');
    });

    it('gain-phase arms on gap-7 no-faction-owed grinding', () => {
      const d = decideInstall(baseCtx({ phase: 'grinding', targetFaction: undefined, deficit: 0 }));
      expect(d.armed).toBe(true);
      expect(d.reason).toBe('gain-phase');
      expect(d.horizonMs).toBeNull();
    });

    it('gain-phase arms on a long rep horizon', () => {
      const d = decideInstall(
        baseCtx({ phase: 'grinding', targetFaction: 'F1', deficit: GRIND_HORIZON_MS * 2, repRates: { F1: 1 }, rateSamples: { F1: 40 } }),
      );
      expect(d.armed).toBe(true);
      expect(d.reason).toBe('gain-phase');
    });

    it('stall arms via the gain branch (money-blocked, gainArmed true, queue below floor)', () => {
      const d = decideInstall(baseCtx({ phase: 'awaiting-money', totalGain: 1.18, queuedCount: 3, stalled: true }));
      expect(d.armed).toBe(true);
      expect(d.reason).toBe('stall');
      expect(d.reasons.stallArmed).toBe(true);
    });

    it('stall arms via the queue-floor branch (gain below MIN_TOTAL_GAIN, queue at the floor)', () => {
      const d = decideInstall(baseCtx({ totalGain: 1.0, queuedCount: STALL_QUEUE_FLOOR, stalled: true }));
      expect(d.armed).toBe(true);
      expect(d.reason).toBe('stall');
    });

    it('stall is blocked by "grinding" (never overrides a productive grind)', () => {
      const d = decideInstall(
        baseCtx({ phase: 'grinding', targetFaction: 'F1', deficit: 1000, repRates: { F1: 1 }, rateSamples: { F1: 40 }, stalled: true }),
      );
      expect(d.armed).toBe(false);
      expect(d.blockers.stall).toBe('grinding');
    });

    it('stall is blocked by "mustbuy-hold"', () => {
      const d = decideInstall(
        baseCtx({ phase: 'awaiting-money', totalGain: 1.18, queuedCount: 3, stalled: true, mustBuyCost: 1000, mustBuyCap: 5000, money: 0 }),
      );
      expect(d.reasons.stallArmed).toBe(true);
      expect(d.armed).toBe(false);
      expect(d.blockers.stall).toBe('mustbuy-hold');
    });
  });

  describe('escalation rule', () => {
    // The 2026-07-23 live fixture (BACKLOG.md): 11 queued, waiting on an
    // aug escalated ~1,180x by the queue itself.
    const liveFixture = {
      phase: 'awaiting-money',
      queuedCount: 11,
      totalGain: 2.118,
      livePrice: 1.048e12,
      money: 3.79e11,
      incomePerSec: 8.5e7,
      targetIsNFG: false,
    };

    it('(a) the live fixture arms', () => {
      const d = decideInstall(baseCtx(liveFixture));
      expect(d.armed).toBe(true);
      expect(d.reason).toBe('escalation');
      expect(d.reasons.escalationArmed).toBe(true);
      expect(d.escalation.waitMs).toBeGreaterThan(7.8e6);
      expect(d.escalation.afterMs).toBeGreaterThan(1e4);
      expect(d.escalation.afterMs).toBeLessThan(1.1e4);
    });

    it('(b) not a wait-duration rule -- a short absolute wait still arms when it dominates', () => {
      // Raise money so waitMs is only ~20 min, still comfortably over
      // overhead+afterMs (~10.2 min) -- pins that this is a DOMINANCE rule,
      // not a "wait long enough" rule.
      const money = liveFixture.livePrice - (20 * 60_000 * liveFixture.incomePerSec) / 1000;
      const d = decideInstall(baseCtx({ ...liveFixture, money }));
      expect(d.escalation.waitMs).toBeCloseTo(20 * 60_000, -2);
      expect(d.armed).toBe(true);
      expect(d.reason).toBe('escalation');
    });

    it('(c) low escalation does not arm -- wait-not-dominant', () => {
      const d = decideInstall(
        baseCtx({ phase: 'awaiting-money', queuedCount: 1, totalGain: 2, livePrice: 900_000, money: 899_000, incomePerSec: 100 }),
      );
      expect(d.armed).toBe(false);
      expect(d.blockers.escalation).toBe('wait-not-dominant');
    });

    it('(d) no income signal (null) -- distinct from zero income, no staleness WARN trigger elsewhere', () => {
      const d = decideInstall(baseCtx({ ...liveFixture, incomePerSec: null }));
      expect(d.armed).toBe(false);
      expect(d.blockers.escalation).toBe('no-income-signal');
      expect(d.escalation.incomeAvailable).toBe(false);
      expect(d.escalation.waitMs).toBeNull();
    });

    it('(e) NFG target is excluded', () => {
      const d = decideInstall(baseCtx({ ...liveFixture, targetIsNFG: true }));
      expect(d.armed).toBe(false);
      expect(d.blockers.escalation).toBe('nfg-target');
    });

    it('(f) wrong phase never reaches the escalation rule', () => {
      const grinding = decideInstall(baseCtx({ ...liveFixture, phase: 'grinding', targetFaction: undefined }));
      expect(grinding.blockers.escalation).toBe('phase-not-awaiting-money');

      const idle = decideInstall(baseCtx({ ...liveFixture, phase: 'idle-plateau' }));
      expect(idle.blockers.escalation).toBe('phase-not-awaiting-money');
    });

    it('(g) mustBuyHold exemption pin: escalation arms through an active must-buy hold', () => {
      const fixture = {
        ...liveFixture,
        stalled: true,
        // money (3.79e11) < mustBuyCost <= mustBuyCap -- the hold's actual
        // guard shape, not merely a nonzero cost (which does nothing if it's
        // already affordable).
        mustBuyCost: 4e11,
        mustBuyCap: 5e11,
      };
      const d = decideInstall(baseCtx(fixture));
      expect(d.armed).toBe(true);
      expect(d.reason).toBe('escalation');
      expect(d.blockers.stall).toBe('mustbuy-hold');
      // gain-phase's first failing guard is the phase mismatch, not
      // mustbuy-hold -- gain-phase can only report mustbuy-hold from an
      // otherwise-arming phase.
      expect(d.blockers.gainPhase).toBe('phase:awaiting-money');

      // Companion: the same fixture, NFG-targeted -- pins that the NFG
      // exclusion, not the mustBuyHold exemption, is what's under test.
      const nfg = decideInstall(baseCtx({ ...fixture, targetIsNFG: true }));
      expect(nfg.armed).toBe(false);
    });

    it('(h) paused / endgameHold block via gain-not-armed', () => {
      const paused = decideInstall(baseCtx({ ...liveFixture, paused: true }));
      expect(paused.blockers.escalation).toBe('gain-not-armed');

      const endgameHeld = decideInstall(baseCtx({ ...liveFixture, endgameHold: true }));
      expect(endgameHeld.blockers.escalation).toBe('gain-not-armed');
    });

    it('(i) strict boundary: waitMs === overhead + afterMs exactly does not arm', () => {
      // basePrice = livePrice / AUG_PRICE_LADDER**queuedCount; solve money so
      // waitMs lands exactly on overhead+afterMs.
      const queuedCount = 2;
      const livePrice = 1_000_000_000;
      const incomePerSec = 1000;
      const basePrice = livePrice / Math.pow(AUG_PRICE_LADDER, queuedCount);
      const afterMs = (basePrice / incomePerSec) * 1000;
      const targetWaitMs = INSTALL_OVERHEAD_MS + afterMs;
      const money = livePrice - (targetWaitMs * incomePerSec) / 1000;
      const d = decideInstall(baseCtx({ phase: 'awaiting-money', queuedCount, totalGain: 2, livePrice, money, incomePerSec }));
      expect(d.escalation.waitMs).toBeCloseTo(targetWaitMs, 6);
      expect(d.armed).toBe(false);
      expect(d.blockers.escalation).toBe('wait-not-dominant');
    });

    it('(j) zero income is distinct from missing income', () => {
      const d = decideInstall(baseCtx({ ...liveFixture, incomePerSec: 0 }));
      expect(d.armed).toBe(false);
      expect(d.blockers.escalation).toBe('zero-income');
      expect(d.escalation.incomeAvailable).toBe(false);
    });
  });
});

describe('computeStallThreshold — Phase 26 B2 (S4)', () => {
  const H = 3600_000;

  it('falls back to STALL_FALLBACK_MS with fewer than 2 measured intervals', () => {
    expect(computeStallThreshold([])).toBe(STALL_FALLBACK_MS);
    expect(computeStallThreshold([5 * H])).toBe(STALL_FALLBACK_MS);
  });

  it('STALL_CYCLE_FACTOR x median, inside the clamp — the gap-7 shape (cycles ~4-8h)', () => {
    const cycles = [4 * H, 6 * H, 8 * H];
    expect(computeStallThreshold(cycles)).toBe(STALL_CYCLE_FACTOR * 6 * H);
  });

  it('clamps fast cycles up to STALL_MIN_MS', () => {
    const cycles = [1 * H, 1 * H, 1 * H]; // median 1h -> 3x = 3h, below the 12h floor
    expect(computeStallThreshold(cycles)).toBe(STALL_MIN_MS);
  });

  it('clamps slow cycles down to STALL_MAX_MS', () => {
    const cycles = [20 * H, 22 * H, 24 * H]; // median 22h -> 3x = 66h, above the 48h ceiling
    expect(computeStallThreshold(cycles)).toBe(STALL_MAX_MS);
  });

  it('ignores non-positive entries when computing the median', () => {
    expect(computeStallThreshold([0, -5, 4 * H, 6 * H])).toBe(STALL_CYCLE_FACTOR * 5 * H);
  });
});

describe('recentCycleIntervals — Phase 26 B2 (S4)', () => {
  const H = 3600_000;

  it('derives consecutive deltas from installTime, order-independent input', () => {
    const records = [{ installTime: 30 * H }, { installTime: 10 * H }, { installTime: 20 * H }];
    expect(recentCycleIntervals(records, 0)).toEqual([10 * H, 10 * H]);
  });

  it("bounds to the current node — a previous node's records do not leak in", () => {
    const records = [{ installTime: 5 * H }, { installTime: 10 * H }, { installTime: 15 * H }]; // all pre-node-reset
    expect(recentCycleIntervals(records, 100 * H)).toEqual([]);
  });

  it('caps at the last 5 deltas', () => {
    const records = Array.from({ length: 8 }, (_, i) => ({ installTime: i * H }));
    expect(recentCycleIntervals(records, 0)).toEqual([H, H, H, H, H]);
  });
});

describe('evalStall — Phase 26 B2 (S4)', () => {
  const H = 3600_000;
  function stallInputs(overrides = {}) {
    return {
      nowMs: 25 * H,
      lastAugReset: 0,
      mode: 'auto',
      installSeqActive: false,
      paused: false,
      cycleIntervalsMs: [4 * H, 6 * H, 8 * H], // median 6h -> threshold 18h
      ...overrides,
    };
  }

  it('the gap-7 shape: cycles ~4-8h, age 25h => stalled (threshold 18h), warns on the crossing', () => {
    const s = evalStall(stallInputs(), null);
    expect(s.thresholdMs).toBe(18 * H);
    expect(s.ageMs).toBe(25 * H);
    expect(s.stalled).toBe(true);
    expect(s.warnDue).toBe(true);
  });

  it('below threshold: not stalled, no warn', () => {
    const s = evalStall(stallInputs({ nowMs: 10 * H }), null);
    expect(s.stalled).toBe(false);
    expect(s.warnDue).toBe(false);
  });

  it('gated off in observe mode, while paused, or during an active install sequence', () => {
    expect(evalStall(stallInputs({ mode: 'observe' }), null).stalled).toBe(false);
    expect(evalStall(stallInputs({ paused: true }), null).stalled).toBe(false);
    expect(evalStall(stallInputs({ installSeqActive: true }), null).stalled).toBe(false);
  });

  it('the gap-9 shape still reports: evalStall takes no endgameHold input at all, so a healthy-looking endgame deadlock still ages and crosses the threshold', () => {
    const s = evalStall(stallInputs(), null);
    expect(s.stalled).toBe(true);
  });

  it('re-warn cadence: true at the crossing, false until STALL_REWARN_MS elapses, true again after', () => {
    const t0 = evalStall(stallInputs({ nowMs: 25 * H }), null);
    expect(t0.warnDue).toBe(true);
    const t1 = evalStall(stallInputs({ nowMs: 25 * H + STALL_REWARN_MS - 1 }), t0);
    expect(t1.warnDue).toBe(false);
    const t2 = evalStall(stallInputs({ nowMs: 25 * H + STALL_REWARN_MS }), t1);
    expect(t2.warnDue).toBe(true);
  });

  it('clearing (not stalled) resets lastWarnMs so the next stall re-arms the crossing fresh', () => {
    const t0 = evalStall(stallInputs({ nowMs: 25 * H }), null);
    const cleared = evalStall(stallInputs({ nowMs: 26 * H, lastAugReset: 26 * H }), t0); // fresh install -> age 0
    expect(cleared.stalled).toBe(false);
    expect(cleared.lastWarnMs).toBeNull();
  });
});

describe('nextAwaitingSince — Phase 32 KPI 3', () => {
  const T = 1_000_000_000;

  it('stamps nowMs on entry (prev null, phase awaiting-money)', () => {
    expect(nextAwaitingSince(null, 'awaiting-money', T)).toBe(T);
  });

  it('preserves the existing stamp while still awaiting-money', () => {
    expect(nextAwaitingSince(T, 'awaiting-money', T + 60_000)).toBe(T);
  });

  it('clears to null on any other phase', () => {
    expect(nextAwaitingSince(T, 'grinding', T + 60_000)).toBeNull();
    expect(nextAwaitingSince(null, 'idle-plateau', T)).toBeNull();
  });

  it('treats undefined prev the same as null (fresh entry)', () => {
    expect(nextAwaitingSince(undefined, 'awaiting-money', T)).toBe(T);
  });
});

describe('pickNfgSeller', () => {
  it('picks the joined seller with the MOST rep, not catalog order', () => {
    // The gap-6 regression, with install #6's real shape: catalog order put
    // CyberSec first, but Chongqing held 4x the rep.
    const sellers = ['CyberSec', 'NiteSec', 'Chongqing'];
    const rep = { CyberSec: 54_690, NiteSec: 7_328, Chongqing: 226_822 };
    expect(pickNfgSeller(sellers, rep, 10_181)).toBe('Chongqing');
  });

  it('ignores sellers we have not joined (absent from factionRep)', () => {
    const sellers = ['Illuminati', 'CyberSec'];
    expect(pickNfgSeller(sellers, { CyberSec: 54_690 }, 10_181)).toBe('CyberSec');
  });

  it('ignores a seller that has not cleared repReq', () => {
    const rep = { CyberSec: 9_000, NiteSec: 12_000 };
    expect(pickNfgSeller(['CyberSec', 'NiteSec'], rep, 10_181)).toBe('NiteSec');
  });

  it('returns null when no joined seller clears repReq -- caller suppresses the tail', () => {
    expect(pickNfgSeller(['CyberSec'], { CyberSec: 9_000 }, 10_181)).toBeNull();
  });

  it('returns null for no sellers at all', () => {
    expect(pickNfgSeller([], { CyberSec: 99_999 }, 10_181)).toBeNull();
    expect(pickNfgSeller(undefined, { CyberSec: 99_999 }, 10_181)).toBeNull();
  });

  it('treats exactly-met rep as met (boundary)', () => {
    expect(pickNfgSeller(['CyberSec'], { CyberSec: 10_181 }, 10_181)).toBe('CyberSec');
  });
});

describe('spendDownPlan', () => {
  function candidate(overrides = {}) {
    return { aug: 'X', faction: 'F1', deficit: 0, price: 0, score: 1, ...overrides };
  }

  it('buys rep-met discrete augs, skipping unaffordable ones without stopping the pass', () => {
    const candidates = [candidate({ aug: 'A', price: 100 }), candidate({ aug: 'B', price: 200 }), candidate({ aug: 'C', price: 50 })];
    const actions = spendDownPlan(candidates, { augs: {} }, 150, null);
    expect(actions.map((a) => a.aug)).toEqual(['A', 'C']);
  });

  it('skips a not-yet-rep-met candidate', () => {
    const actions = spendDownPlan([candidate({ aug: 'A', price: 100, deficit: 5 })], { augs: {} }, 1000, null);
    expect(actions).toEqual([]);
  });

  it('skips NFG in the discrete pass -- handled by the repeated NFG tail', () => {
    const actions = spendDownPlan([candidate({ aug: NFG_NAME, price: 100 })], { augs: {} }, 1000, null);
    expect(actions).toEqual([]);
  });

  it('stops the NFG tail when the REP ladder runs out before the money does', () => {
    // 2026-07-18: repReq escalates x1.14/level, so clearing level 1's rep does
    // not license the whole tail. Money here funds many levels; rep funds 2.
    const nfgState = { livePrice: 100, faction: 'BitRunners', repMet: true, rep: 12_000, repReq: 10_000 };
    const actions = spendDownPlan([], { augs: {} }, 1e12, nfgState);
    expect(actions.length).toBe(2);
    expect(actions.every((a) => a.aug === NFG_NAME)).toBe(true);
  });

  it('money still binds when it is the tighter of the two ladders', () => {
    const nfgState = { livePrice: 100, faction: 'BitRunners', repMet: true, rep: 1e12, repReq: 10_000 };
    const actions = spendDownPlan([], { augs: {} }, 100 + 100 * NFG_PRICE_LADDER + 1, nfgState);
    expect(actions.length).toBe(2);
  });

  it('omitted rep/repReq leaves the tail money-bounded (back-compat)', () => {
    const nfgState = { livePrice: 100, faction: 'BitRunners', repMet: true };
    const withRep = spendDownPlan([], { augs: {} }, 100 + 100 * NFG_PRICE_LADDER + 1, nfgState);
    expect(withRep.length).toBe(2);
  });

  it('rep 0 with a real repReq buys nothing, however much money there is', () => {
    // rep 0 is a real answer (cap 0), not missing info -- the same
    // discriminator evalTrigger uses. repMet already guards this path today;
    // the cap must agree rather than falling back to unbounded.
    const nfgState = { livePrice: 100, faction: 'BitRunners', repMet: true, rep: 0, repReq: 998_737 };
    expect(spendDownPlan([], { augs: {} }, 1e15, nfgState)).toEqual([]);
  });

  it('repeats NFG buys along the observed price ladder until unaffordable', () => {
    const nfgState = { livePrice: 100, faction: 'BitRunners', repMet: true };
    // Budget funds exactly two levels (100 + 100*L) with $1 of slack, so the
    // assertion tests the ladder, not float equality on the affordability edge.
    const actions = spendDownPlan([], { augs: {} }, 100 + 100 * NFG_PRICE_LADDER + 1, nfgState);
    expect(actions.length).toBe(2);
    expect(actions[0]).toMatchObject({ aug: NFG_NAME, faction: 'BitRunners', price: 100 });
    expect(actions[1]).toMatchObject({ aug: NFG_NAME, faction: 'BitRunners', price: 100 * NFG_PRICE_LADDER });
  });

  it("suppresses the NFG tail when its rep requirement isn't yet met (repMet:false)", () => {
    const nfgState = { livePrice: 100, faction: 'BitRunners', repMet: false };
    expect(spendDownPlan([], { augs: {} }, 1_000_000, nfgState)).toEqual([]);
  });

  it('respects SPEND_DOWN_BUY_CAP even with unlimited money', () => {
    const nfgState = { livePrice: 1, faction: 'BitRunners', repMet: true };
    const actions = spendDownPlan([], { augs: {} }, Infinity, nfgState);
    expect(actions.length).toBe(SPEND_DOWN_BUY_CAP);
  });

  describe('Phase 33 decision 6b — must-buy head', () => {
    it('empty mustBuyNames reproduces today\'s plan exactly (regression pin)', () => {
      const candidates = [candidate({ aug: 'A', price: 100 }), candidate({ aug: 'B', price: 200 }), candidate({ aug: 'C', price: 50 })];
      const actions = spendDownPlan(candidates, { augs: {} }, 150, null);
      expect(actions.map((a) => a.aug)).toEqual(['A', 'C']);
      const explicit = spendDownPlan(candidates, { augs: {} }, 150, null, new Set());
      expect(explicit.map((a) => a.aug)).toEqual(['A', 'C']);
    });

    it('must-buys are planned FIRST despite sorting behind an expensive non-must-buy discrete', () => {
      // Expensive (price 900, not a must-buy) sorts ahead of the must-buys in
      // S3's caller-sorted order, but the must-buy head still plans first.
      const candidates = [
        candidate({ aug: 'Expensive', price: 900 }),
        candidate({ aug: 'Neuroreceptor', price: 550 }),
        candidate({ aug: 'CashRoot', price: 125 }),
      ];
      const mustBuyNames = new Set(['Neuroreceptor', 'CashRoot']);
      const actions = spendDownPlan(candidates, { augs: {} }, 10_000, null, mustBuyNames);
      expect(actions.map((a) => a.aug)).toEqual(['Neuroreceptor', 'CashRoot', 'Expensive']);
    });

    it('within the must-buy set, price-DESC -- a $0 aug (Red Pill) lands last of them', () => {
      const candidates = [
        candidate({ aug: 'The Red Pill', price: 0 }),
        candidate({ aug: 'CashRoot', price: 125 }),
        candidate({ aug: 'Neuroreceptor', price: 550 }),
      ];
      const mustBuyNames = new Set(['The Red Pill', 'CashRoot', 'Neuroreceptor']);
      const actions = spendDownPlan(candidates, { augs: {} }, 10_000, null, mustBuyNames);
      expect(actions.map((a) => a.aug)).toEqual(['Neuroreceptor', 'CashRoot', 'The Red Pill']);
    });

    it('NFG still plans last, after both the must-buy head and the rest', () => {
      const candidates = [candidate({ aug: 'MustBuy', price: 100 }), candidate({ aug: 'Rest', price: 200 })];
      const nfgState = { livePrice: 50, faction: 'BitRunners', repMet: true };
      const actions = spendDownPlan(candidates, { augs: {} }, 10_000, nfgState, new Set(['MustBuy']));
      expect(actions[0].aug).toBe('MustBuy');
      expect(actions[1].aug).toBe('Rest');
      expect(actions[2].aug).toBe(NFG_NAME);
    });

    it('affordability and SPEND_DOWN_BUY_CAP still apply to the must-buy head', () => {
      const candidates = [candidate({ aug: 'TooExpensive', price: 100_000 }), candidate({ aug: 'Affordable', price: 50 })];
      const actions = spendDownPlan(candidates, { augs: {} }, 100, null, new Set(['TooExpensive', 'Affordable']));
      expect(actions.map((a) => a.aug)).toEqual(['Affordable']);
    });
  });
});

describe('mustBuyTotal — Phase 33 decision 6b', () => {
  it('empty list -> 0', () => {
    expect(mustBuyTotal([])).toBe(0);
    expect(mustBuyTotal()).toBe(0);
  });

  it('a single price has no escalation applied (i=0 -> ladder^0 == 1)', () => {
    expect(mustBuyTotal([1000])).toBe(1000);
  });

  it('pins the decision-6 worked example: Neuroreceptor 7.17b, CashRoot*1.9 3.10b (approx), Red Pill 0', () => {
    // Values as read live at the spec's measurement point (already-escalated
    // live prices, decision 6): Neuroreceptor $7.17b (index 0), CashRoot's
    // OWN live price at that same moment was ~$1.629b (index 1), Red Pill $0
    // (index 2). Total: 7.17b + 1.629b*1.9 + 0 ≈ 10.27b.
    const total = mustBuyTotal([7.17e9, 1.629e9, 0]);
    expect(total).toBeCloseTo(7.17e9 + 1.629e9 * AUG_PRICE_LADDER, -6);
    expect(total / 1e9).toBeCloseTo(10.27, 1);
  });

  it('sequential ×1.9 arithmetic pinned exactly for a simple fixture', () => {
    // price_0*1 + price_1*1.9 + price_2*1.9^2
    const total = mustBuyTotal([100, 100, 100]);
    expect(total).toBeCloseTo(100 + 100 * AUG_PRICE_LADDER + 100 * AUG_PRICE_LADDER ** 2, 6);
  });
});

describe('computeFundCap — Phase 33 decision 3', () => {
  it('invariant: fundCap >= money always, with a real income signal', () => {
    const fundCap = computeFundCap(11_870_000_000, 2_920_000);
    expect(fundCap).toBeGreaterThanOrEqual(11_870_000_000);
    expect(fundCap).toBe(11_870_000_000 + 2_920_000 * (FUNDING_HORIZON_MS / 1000));
  });

  it('invariant: fundCap >= money always, on the no-income fallback (null incomePerSec)', () => {
    const fundCap = computeFundCap(0, null);
    expect(fundCap).toBeGreaterThanOrEqual(0);
    expect(fundCap).toBe(FUND_CAP_FALLBACK);
  });

  it('the fallback is ADDITIVE to money, not a replacement -- an already-affordable aug can never be capped', () => {
    const money = 999_999_999_999;
    const fundCap = computeFundCap(money, undefined);
    expect(fundCap).toBe(money + FUND_CAP_FALLBACK);
  });

  it('zero income reads as a real (if tiny) signal, not "unreadable" -- 0 !== null/undefined', () => {
    const fundCap = computeFundCap(1000, 0);
    expect(fundCap).toBe(1000);
  });
});

describe('daedalusInviteReserve', () => {
  it('reads the money requirement live from inviteReqs', () => {
    const catalog = { factions: { Daedalus: { inviteReqs: [{ type: 'skills', skills: { hacking: 2500 } }, { type: 'money', money: 100_000_000_000 }] } } };
    expect(daedalusInviteReserve(catalog)).toBe(100_000_000_000);
  });

  it('is 0 when there is no money requirement (or no Daedalus entry)', () => {
    expect(daedalusInviteReserve({ factions: { Daedalus: { inviteReqs: [{ type: 'skills', skills: {} }] } } })).toBe(0);
    expect(daedalusInviteReserve({ factions: {} })).toBe(0);
  });
});

describe('daedalusDonationReserve', () => {
  const base = { redPillRepReq: 2_500_000, daedalusRep: 0, daedalusFavor: 200, favorToDonate: 150, hasFormulas: true, donationCost: 1_500_000_000_000 };

  it('reserves the live donation cost once favor clears the threshold and rep is short', () => {
    expect(daedalusDonationReserve(base)).toBe(1_500_000_000_000);
  });

  it('is 0 once rep already meets the requirement -- Red Pill is $0, nothing to reserve', () => {
    expect(daedalusDonationReserve({ ...base, daedalusRep: 2_500_000 })).toBe(0);
    expect(daedalusDonationReserve({ ...base, daedalusRep: 3_000_000 })).toBe(0);
  });

  it('is 0 below the favor threshold -- donating is not actionable yet', () => {
    expect(daedalusDonationReserve({ ...base, daedalusFavor: 100 })).toBe(0);
  });

  it('is 0 without Formulas.exe', () => {
    expect(daedalusDonationReserve({ ...base, hasFormulas: false })).toBe(0);
  });

  it('is 0 when the rep requirement is unreadable', () => {
    expect(daedalusDonationReserve({ ...base, redPillRepReq: null })).toBe(0);
  });

  it('shrinks as rep grinds toward the requirement -- a moving target (caller supplies the live cost each time)', () => {
    const early = daedalusDonationReserve({ ...base, daedalusRep: 0, donationCost: 1_500_000_000_000 });
    const later = daedalusDonationReserve({ ...base, daedalusRep: 2_000_000, donationCost: 300_000_000_000 });
    expect(later).toBeLessThan(early);
  });
});

describe('shouldDonateToDaedalus', () => {
  it('false when there is no reservation (nothing to donate for)', () => {
    expect(shouldDonateToDaedalus(0, 1_000_000_000_000)).toBe(false);
  });

  it('false below DONATION_BUFFER x the reserved amount', () => {
    expect(shouldDonateToDaedalus(1_000_000_000_000, 1_100_000_000_000)).toBe(false);
  });

  it('true once money clears DONATION_BUFFER x the reserved amount', () => {
    expect(shouldDonateToDaedalus(1_000_000_000_000, 1_200_000_000_000)).toBe(true);
  });
});

describe('buildDecisionRecord', () => {
  it('carries kind/mode/phase/timestamp and the constants in force', () => {
    const record = buildDecisionRecord('trigger-fire', { now: 12345, mode: 'observe', phase: 'idle-plateau', trigger: { armed: true }, money: 100 });
    expect(record.kind).toBe('trigger-fire');
    expect(record.mode).toBe('observe');
    expect(record.phase).toBe('idle-plateau');
    expect(record.timestamp).toBe(12345);
    expect(record.constants.MIN_TOTAL_GAIN).toBe(MIN_TOTAL_GAIN);
    expect(record.constants.TRIGGER_SUSTAIN_MS).toBe(TRIGGER_SUSTAIN_MS);
  });

  it('defaults target/trigger/detail to null when absent', () => {
    const record = buildDecisionRecord('camp-choice', { now: 1 });
    expect(record.target).toBeNull();
    expect(record.trigger).toBeNull();
    expect(record.detail).toBeNull();
  });
});

describe('planPass', () => {
  const scope = new Set(['CyberSec', 'F1', 'Daedalus']);

  it('proactive joins: emits a join per joinFactions entry independent of the head target', () => {
    const plan = planPass({ target: null, joinFactions: ['CyberSec', 'F1'], currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
    expect(plan.actions).toEqual([{ type: 'join', faction: 'CyberSec' }, { type: 'join', faction: 'F1' }]);
    expect(plan.phase).toBe('grinding');
  });

  it('never emits a join for an out-of-scope faction, even if the caller passes one (D11 defense-in-depth)', () => {
    const plan = planPass({ target: null, joinFactions: ['SlumSnakes'], currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
    expect(plan.actions).toEqual([]);
  });

  it("emits at most one travel action, carried straight through from the caller's pick", () => {
    const plan = planPass({ target: null, travel: { city: 'Aevum', faction: 'Aevum' }, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
    expect(plan.actions).toEqual([{ type: 'travel', city: 'Aevum', faction: 'Aevum' }]);
  });

  it('never emits a buy/work/donate action for an out-of-scope head target (D11 defense-in-depth)', () => {
    const outOfScope = { aug: 'X', faction: 'SlumSnakes', repReq: 100, deficit: 100, status: 'invite-pending' };
    const plan = planPass({ target: outOfScope, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
    expect(plan.actions.every((a) => a.type !== 'buy' && a.type !== 'work' && a.type !== 'donate')).toBe(true);
    expect(plan.phase).toBe('awaiting-invite');
  });

  describe('buy gating', () => {
    const metTarget = { aug: 'X', faction: 'F1', repReq: 100, deficit: 0, status: 'joined', workTypes: ['hacking'] };

    it('does not buy below the live price -- reserves and reports awaiting-money', () => {
      const plan = planPass({ target: metTarget, currentWork: null, factionScope: scope, money: 100, livePrice: 500, paused: false });
      expect(plan.actions.some((a) => a.type === 'buy')).toBe(false);
      expect(plan.phase).toBe('awaiting-money');
      expect(plan.reserve).toBe(500);
    });

    it('buys once money covers the live price', () => {
      const plan = planPass({ target: metTarget, currentWork: null, factionScope: scope, money: 500, livePrice: 500, paused: false });
      expect(plan.actions.some((a) => a.type === 'buy')).toBe(true);
      expect(plan.phase).toBe('grinding');
    });

    it('buy/reserve actions still fire while yielded (only work is slot-gated)', () => {
      const plan = planPass({ target: metTarget, currentWork: { type: 'COMPANY' }, factionScope: scope, money: 500, livePrice: 500, paused: false });
      expect(plan.actions.some((a) => a.type === 'buy')).toBe(true);
    });

    it('a buyBlocked target (NFG capped) never buys/reserves even when rep-met -- falls through to grind/work instead', () => {
      const cappedNfgTarget = { ...metTarget, aug: 'NeuroFlux Governor', buyBlocked: true, workTypes: ['hacking'] };
      const plan = planPass({ target: cappedNfgTarget, workTarget: cappedNfgTarget, currentWork: null, factionScope: scope, money: 1_000_000, livePrice: 500, paused: false });
      expect(plan.actions.some((a) => a.type === 'buy')).toBe(false);
      expect(plan.actions.some((a) => a.type === 'reserve')).toBe(false);
      expect(plan.actions).toContainEqual({ type: 'work', faction: 'F1', workType: 'hacking' });
    });

    describe('Phase 33 decision 4 -- fundBlocked head', () => {
      const fundBlockedTarget = { ...metTarget, fundBlocked: true, workTypes: ['hacking'] };

      it('no buy/donate; reserves the WHOLE balance (not livePrice); phase is "grinding"; work still fires', () => {
        const plan = planPass({
          target: fundBlockedTarget, workTarget: fundBlockedTarget, currentWork: null,
          factionScope: scope, money: 12_000_000_000, livePrice: 500, paused: false,
        });
        expect(plan.actions.some((a) => a.type === 'buy')).toBe(false);
        expect(plan.actions.some((a) => a.type === 'donate')).toBe(false);
        expect(plan.reserve).toBe(12_000_000_000);
        expect(plan.phase).toBe('grinding');
        expect(plan.actions).toContainEqual({ type: 'reserve', amount: 12_000_000_000, aug: 'X', faction: 'F1' });
        expect(plan.actions).toContainEqual({ type: 'work', faction: 'F1', workType: 'hacking' });
      });

      it('yields the slot exactly like any other target when currentWork is out-of-scope, but phase stays "grinding" (not "yielded")', () => {
        const plan = planPass({
          target: fundBlockedTarget, workTarget: fundBlockedTarget, currentWork: { type: 'COMPANY' },
          factionScope: scope, money: 1e9, livePrice: 500, paused: false,
        });
        expect(plan.actions).toContainEqual({ type: 'yield' });
        expect(plan.actions.some((a) => a.type === 'work')).toBe(false);
        expect(plan.phase).toBe('grinding');
      });

      it('observe-mode rail (out-of-scope faction) still wins over fundBlocked', () => {
        const outOfScopeFundBlocked = { ...fundBlockedTarget, faction: 'SlumSnakes' };
        const plan = planPass({ target: outOfScopeFundBlocked, currentWork: null, factionScope: scope, money: 1e9, livePrice: 500, paused: false });
        expect(plan.actions.every((a) => a.type !== 'buy' && a.type !== 'work' && a.type !== 'donate' && a.type !== 'reserve')).toBe(true);
        expect(plan.phase).toBe('awaiting-invite');
      });
    });
  });

  describe('donation gating (S6)', () => {
    const grindTarget = { aug: 'X', faction: 'F1', repReq: 1_000_000, deficit: 500_000, status: 'joined', workTypes: ['hacking'] };

    it('does not donate when favor is below the threshold -- grinds normally', () => {
      const plan = planPass({
        target: grindTarget, currentWork: null, factionScope: scope, money: 1e9, livePrice: 1000, paused: false,
        favor: 10, favorToDonate: 150, hasFormulas: true, donationCost: 5000,
      });
      expect(plan.actions.some((a) => a.type === 'donate')).toBe(false);
    });

    it('does not donate without Formulas.exe on home', () => {
      const plan = planPass({
        target: grindTarget, currentWork: null, factionScope: scope, money: 1e9, livePrice: 1000, paused: false,
        favor: 200, favorToDonate: 150, hasFormulas: false, donationCost: 5000,
      });
      expect(plan.actions.some((a) => a.type === 'donate')).toBe(false);
    });

    it('reserves donationCost + livePrice and waits when below DONATION_BUFFER x that total', () => {
      const plan = planPass({
        target: grindTarget, currentWork: null, factionScope: scope, money: 1000, livePrice: 1000, paused: false,
        favor: 200, favorToDonate: 150, hasFormulas: true, donationCost: 5000,
      });
      expect(plan.actions.some((a) => a.type === 'donate')).toBe(false);
      expect(plan.phase).toBe('awaiting-money');
      expect(plan.reserve).toBe(6000);
    });

    it('donates once money clears DONATION_BUFFER x (donationCost + livePrice)', () => {
      const plan = planPass({
        target: grindTarget, currentWork: null, factionScope: scope, money: 7200, livePrice: 1000, paused: false,
        favor: 200, favorToDonate: 150, hasFormulas: true, donationCost: 5000,
      });
      expect(plan.actions).toContainEqual({ type: 'donate', faction: 'F1', amount: 5000, deficit: 500_000 });
      expect(plan.reserve).toBe(6000);
    });

    it('excludes the donation route entirely under endgame hold', () => {
      const daedalusTarget = { ...grindTarget, faction: 'Daedalus' };
      const plan = planPass({
        target: daedalusTarget, currentWork: null, factionScope: scope, money: 1e12, livePrice: 0, paused: false,
        favor: 500, favorToDonate: 150, hasFormulas: true, donationCost: 100, endgameHold: true,
      });
      expect(plan.actions.some((a) => a.type === 'donate')).toBe(false);
    });

    it('a donation-closable head target still lets a different workTarget grind (money closes the head, not the slot)', () => {
      const plan = planPass({
        target: grindTarget, workTarget: { faction: 'CyberSec', workTypes: ['hacking'] }, currentWork: null,
        factionScope: scope, money: 1000, livePrice: 1000, paused: false,
        favor: 200, favorToDonate: 150, hasFormulas: true, donationCost: 5000,
      });
      expect(plan.actions).toContainEqual({ type: 'work', faction: 'CyberSec', workType: 'hacking' });
    });
  });

  describe('slotAvailable / etiquette', () => {
    it('yields on manual company/crime/out-of-scope faction work', () => {
      expect(slotAvailable({ type: 'COMPANY' }, scope).available).toBe(false);
      expect(slotAvailable({ type: 'CRIME' }, scope).available).toBe(false);
      expect(slotAvailable({ type: 'FACTION', factionName: 'Slum Snakes' }, scope).available).toBe(false);
    });

    it('takes/keeps the slot when idle, mid university class, or its own in-scope faction work', () => {
      expect(slotAvailable(null, scope).available).toBe(true);
      expect(slotAvailable({ type: 'CLASS' }, scope).available).toBe(true);
      expect(slotAvailable({ type: 'FACTION', factionName: 'CyberSec' }, scope).available).toBe(true);
    });

    const grindTarget = { aug: 'X', faction: 'CyberSec', repReq: 1000, deficit: 500, status: 'joined', workTypes: ['hacking'] };

    it('issues work for workTarget when not already working the wanted (faction, workType) pair', () => {
      const plan = planPass({ target: grindTarget, workTarget: grindTarget, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
      expect(plan.actions).toEqual([{ type: 'work', faction: 'CyberSec', workType: 'hacking' }]);
    });

    it('does not re-issue work when current work already matches', () => {
      const currentWork = { type: 'FACTION', factionName: 'CyberSec', factionWorkType: 'hacking' };
      const plan = planPass({ target: grindTarget, workTarget: grindTarget, currentWork, factionScope: scope, money: 0, livePrice: null, paused: false });
      expect(plan.actions.some((a) => a.type === 'work')).toBe(false);
      expect(plan.phase).toBe('grinding');
    });

    it('yields (no work action) when the slot is held by manual work', () => {
      const plan = planPass({ target: grindTarget, workTarget: grindTarget, currentWork: { type: 'COMPANY' }, factionScope: scope, money: 0, livePrice: null, paused: false });
      expect(plan.actions.some((a) => a.type === 'work')).toBe(false);
      expect(plan.phase).toBe('yielded');
    });
  });

  it('paused suppresses every action and zeroes the reservation', () => {
    const grindTarget = { aug: 'X', faction: 'CyberSec', repReq: 100, deficit: 0, status: 'joined', workTypes: ['hacking'] };
    const plan = planPass({ target: grindTarget, currentWork: null, factionScope: scope, money: 1_000_000, livePrice: 100, paused: true });
    expect(plan.actions).toEqual([]);
    expect(plan.reserve).toBe(0);
    expect(plan.phase).toBe('paused');
  });

  it('idle-plateau when there is no target and no proactive joins/travel', () => {
    const plan = planPass({ target: null, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
    expect(plan.phase).toBe('idle-plateau');
    expect(plan.reserve).toBe(0);
  });

  it('install-ready phase when the trigger has fired, regardless of target, suppressing buy/work/donate', () => {
    const grindTarget = { aug: 'X', faction: 'CyberSec', repReq: 1000, deficit: 500, status: 'joined', workTypes: ['hacking'] };
    const plan = planPass({ target: grindTarget, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false, fired: true });
    expect(plan.phase).toBe('install-ready');
    expect(plan.actions.some((a) => a.type === 'buy' || a.type === 'work' || a.type === 'donate')).toBe(false);
  });

  describe('S10 auto-mode install sequence', () => {
    it('observe mode never emits spend-down/exec/install actions even if installSeq is (mis-)supplied -- the rail', () => {
      const plan = planPass({
        target: null, currentWork: null, factionScope: scope, money: 5000, livePrice: null, paused: false,
        mode: 'observe', installSeq: { phase: 'spend-down', actions: [{ type: 'buy', aug: 'X', faction: 'F1', price: 100 }], execReady: true },
      });
      expect(plan.actions.some((a) => a.type === 'install-exec')).toBe(false);
      expect(plan.phase).not.toBe('spend-down');
      expect(plan.phase).not.toBe('installing');
    });

    it('auto mode spend-down emits the precomputed buy list and freezes the full-money reserve', () => {
      const plan = planPass({
        target: null, currentWork: null, factionScope: scope, money: 5000, livePrice: null, paused: false,
        mode: 'auto', installSeq: { phase: 'spend-down', actions: [{ type: 'buy', aug: 'X', faction: 'F1', price: 100 }], execReady: false },
      });
      expect(plan.actions).toEqual([{ type: 'buy', aug: 'X', faction: 'F1', price: 100 }]);
      expect(plan.reserve).toBe(5000);
      expect(plan.phase).toBe('spend-down');
    });

    it('auto mode appends install-exec once spend-down has nothing left to buy', () => {
      const plan = planPass({
        target: null, currentWork: null, factionScope: scope, money: 5000, livePrice: null, paused: false,
        mode: 'auto', installSeq: { phase: 'spend-down', actions: [], execReady: true },
      });
      expect(plan.actions).toEqual([{ type: 'install-exec' }]);
    });

    it('installing phase emits no actions and keeps freezing the full-money reserve', () => {
      const plan = planPass({
        target: null, currentWork: null, factionScope: scope, money: 5000, livePrice: null, paused: false,
        mode: 'auto', installSeq: { phase: 'installing' },
      });
      expect(plan.actions).toEqual([]);
      expect(plan.reserve).toBe(5000);
      expect(plan.phase).toBe('installing');
    });
  });
});

describe('buildReserveRecord', () => {
  it('a successful buy clears the reservation in the same pass -- {amount:0, aug:null, faction:null}', () => {
    const rec = buildReserveRecord(0, null, 1000);
    expect(rec).toMatchObject({ amount: 0, aug: null, faction: null, timestamp: 1000 });
  });

  it('a positive amount carries the target aug/faction', () => {
    const rec = buildReserveRecord(500, { aug: 'X', faction: 'F1' }, 1000);
    expect(rec).toMatchObject({ amount: 500, aug: 'X', faction: 'F1', timestamp: 1000 });
  });

  it('a non-positive amount always nulls aug/faction, even if a target is passed', () => {
    const rec = buildReserveRecord(0, { aug: 'X', faction: 'F1' }, 1000);
    expect(rec).toMatchObject({ amount: 0, aug: null, faction: null });
  });
});
