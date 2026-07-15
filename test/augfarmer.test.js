// Unit tests for src/augfarmer.js's pure decision functions (Phase 23/25).
// Fixtures use fictional faction/aug names except where a specific real name
// is the point of the assertion (e.g. "The Red Pill" must drop from the
// score filter by name, per S3's preserved property; the real six-city
// enemy graph is the point of the pickCamp fixtures).
import { describe, it, expect } from 'vitest';
import {
  MULT_FILTER_KEYS,
  UTILITY_ALLOWLIST,
  NFG_NAME,
  SCORE_W_EXP,
  SCORE_W_REP,
  ALLOWLIST_SCORE,
  MIN_TOTAL_GAIN,
  GRIND_HORIZON_MS,
  TRIGGER_SUSTAIN_MS,
  RATE_EWMA_ALPHA,
  SPEND_DOWN_BUY_CAP,
  NFG_PRICE_LADDER,
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
  pickTarget,
  pickWorkFaction,
  updateRepRates,
  evalTrigger,
  spendDownPlan,
  buildDecisionRecord,
  planPass,
  buildReserveRecord,
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

  it('ignores non-hacking mult keys entirely (money/speed/chance/grow/charisma/company)', () => {
    const score = scoreAug(
      'X',
      statsAllOnes({ hacking_money: 2, hacking_speed: 2, hacking_chance: 2, hacking_grow: 2, charisma: 2, charisma_exp: 2, company_rep: 2 }),
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

  it('drops a money/speed/chance/grow/charisma/company-only aug -- the old ten-key set members that no longer qualify', () => {
    const kept = filterAugs(
      { UtilityAug: statsAllOnes({ hacking_money: 1.5, hacking_speed: 1.5, hacking_chance: 1.5, hacking_grow: 1.5, charisma: 1.5, company_rep: 1.5 }) },
      [],
    );
    expect(kept.has('UtilityAug')).toBe(false);
  });

  it('keeps a mixed hacking+combat aug (inclusive OR via a positive score)', () => {
    const kept = filterAugs({ MixedAug: statsAllOnes({ hacking: 1.1, strength: 1.3 }) }, []);
    expect(kept.has('MixedAug')).toBe(true);
  });

  it('drops an all-1.0 aug', () => {
    const kept = filterAugs({ UtilAug: statsAllOnes() }, []);
    expect(kept.has('UtilAug')).toBe(false);
  });

  it('keeps NRMI (allow-listed, S3\'s shrunk one-name list)', () => {
    const kept = filterAugs({ 'Neuroreceptor Management Implant': statsAllOnes() }, UTILITY_ALLOWLIST);
    expect(kept.has('Neuroreceptor Management Implant')).toBe(true);
  });

  it('drops CashRoot Starter Kit and The Blade\'s Simulacrum -- S3\'s flagged allowlist trim', () => {
    const kept = filterAugs(
      { 'CashRoot Starter Kit': statsAllOnes(), "The Blade's Simulacrum": statsAllOnes() },
      UTILITY_ALLOWLIST,
    );
    expect(kept.has('CashRoot Starter Kit')).toBe(false);
    expect(kept.has("The Blade's Simulacrum")).toBe(false);
  });

  it('drops The Red Pill (all-1.0, not allow-listed) -- preserved property', () => {
    const kept = filterAugs({ 'The Red Pill': statsAllOnes() }, UTILITY_ALLOWLIST);
    expect(kept.has('The Red Pill')).toBe(false);
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

  it('among rep-met candidates with equal score, cheaper price sorts first', () => {
    const catalog = {
      augs: {
        AugCheap: augFx({ sellers: ['F1'], repReq: 0, price: 500 }),
        AugPricey: augFx({ sellers: ['F1'], repReq: 0, price: 5000 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe('AugCheap');
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

  it('excludes NFG from the sort when capped this cycle', () => {
    const catalog = { augs: { [NFG_NAME]: augFx({ sellers: ['F1'], repReq: 100, isNFG: true }) }, factions: { F1: faction() } };
    expect(pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), true)).toBeNull();
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
    expect(evalTrigger(baseInputs(), null).armed).toBe(true);
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
    expect(evalTrigger(longHorizon, null).armed).toBe(true);
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
    const reverted = evalTrigger(baseInputs({ now: TRIGGER_SUSTAIN_MS + 1, mode: 'observe', phase: 'grinding' }), t1);
    expect(reverted.fired).toBe(false);
  });

  it('NFG projection: n derived from the price ladder vs money (money-only, S7 boundary rule)', () => {
    const result = evalTrigger(baseInputs({ queuedGain: 1, queuedCount: 1, nfgPrice: 100_000, nfgHackingMult: 1.05, money: 1_000_000 }), null);
    const expectedRatio = 1 + (1_000_000 * 0.9) / 100_000;
    const expectedN = Math.floor(Math.log(expectedRatio) / Math.log(NFG_PRICE_LADDER));
    expect(result.nfgLevelsProjected).toBe(expectedN);
    expect(result.projectedNfgFactor).toBeCloseTo(Math.pow(1.05, expectedN), 6);
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

  it('repeats NFG buys along the observed price ladder until unaffordable', () => {
    const nfgState = { livePrice: 100, faction: 'BitRunners', repMet: true };
    const actions = spendDownPlan([], { augs: {} }, 100 * (1 + NFG_PRICE_LADDER), nfgState);
    expect(actions.length).toBe(2);
    expect(actions[0]).toMatchObject({ aug: NFG_NAME, faction: 'BitRunners', price: 100 });
    expect(actions[1]).toMatchObject({ aug: NFG_NAME, faction: 'BitRunners', price: 190 });
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
