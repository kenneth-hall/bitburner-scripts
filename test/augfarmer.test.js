// Unit tests for src/augfarmer.js's pure decision functions (Phase 23).
// Fixtures use fictional faction/aug names except where a specific real name
// is the point of the assertion (e.g. "The Red Pill" must drop from the D2
// filter by name, per S2's stated property).
import { describe, it, expect } from 'vitest';
import {
  MULT_FILTER_KEYS,
  UTILITY_ALLOWLIST,
  NFG_NAME,
  filterAugs,
  expandPrereqs,
  campBlocked,
  evaluateInviteReqs,
  pickWorkType,
  slotAvailable,
  pickTarget,
  planPass,
  buildReserveRecord,
} from '../src/augfarmer.js';

function statsAllOnes(overrides = {}) {
  const stats = {};
  for (const key of MULT_FILTER_KEYS) stats[key] = 1;
  return { ...stats, ...overrides };
}

describe('filterAugs', () => {
  it('keeps an aug with a relevant hacking mult', () => {
    const kept = filterAugs({ HackAug: statsAllOnes({ hacking: 1.1 }) }, []);
    expect(kept.has('HackAug')).toBe(true);
  });

  it('drops a combat-only aug', () => {
    const kept = filterAugs({ CombatAug: statsAllOnes({ strength: 1.3, defense: 1.3 }) }, []);
    expect(kept.has('CombatAug')).toBe(false);
  });

  it('keeps a mixed hacking+combat aug (inclusive OR)', () => {
    const kept = filterAugs({ MixedAug: statsAllOnes({ hacking: 1.1, strength: 1.3 }) }, []);
    expect(kept.has('MixedAug')).toBe(true);
  });

  it('keeps a charisma-only aug', () => {
    const kept = filterAugs({ ChaAug: statsAllOnes({ charisma: 1.2, charisma_exp: 1.2 }) }, []);
    expect(kept.has('ChaAug')).toBe(true);
  });

  it('drops an all-1.0 aug', () => {
    const kept = filterAugs({ UtilAug: statsAllOnes() }, []);
    expect(kept.has('UtilAug')).toBe(false);
  });

  it('keeps an all-1.0 aug that is allow-listed', () => {
    const kept = filterAugs({ 'CashRoot Starter Kit': statsAllOnes() }, UTILITY_ALLOWLIST);
    expect(kept.has('CashRoot Starter Kit')).toBe(true);
  });

  it('drops The Red Pill (all-1.0, not allow-listed) -- S2\'s stated property', () => {
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

  it('a skip-category prereq (no passesFilter field checked here) is still included -- D6', () => {
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
  function aug(overrides = {}) {
    return { prereqs: [], sellers: [], repReq: 0, price: 0, passesFilter: true, isNFG: false, ...overrides };
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

  it('sorts by rep deficit ascending -- a rep-met candidate sorts before a bigger deficit', () => {
    const catalog = {
      augs: {
        AugHighDeficit: aug({ sellers: ['F1'], repReq: 1000 }),
        AugMet: aug({ sellers: ['F1'], repReq: 100 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 200 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe('AugMet');
    expect(target.deficit).toBe(0);
  });

  it('tie-breaks equal deficits by raw repReq ascending', () => {
    // Equal deficit (500) via different faction rep per seller: AugF@F1
    // (1000-500=500), AugG@F2 (800-300=500) -- repReq differs (1000 vs 800),
    // so the tie-break (not plain deficit ordering) is what picks AugG.
    const catalog = {
      augs: {
        AugF: aug({ sellers: ['F1'], repReq: 1000 }),
        AugG: aug({ sellers: ['F2'], repReq: 800 }),
      },
      factions: { F1: faction(), F2: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 500, F2: 300 } }), new Set(['F1', 'F2']), new Set(), false);
    expect(target.deficit).toBe(500);
    expect(target.aug).toBe('AugG');
  });

  it('tie-breaks equal deficit+repReq by price ascending', () => {
    const catalog = {
      augs: {
        AugCheap: aug({ sellers: ['F1'], repReq: 1000, price: 500 }),
        AugPricey: aug({ sellers: ['F1'], repReq: 1000, price: 5000 }),
      },
      factions: { F1: faction() },
    };
    // Both need distinct names but identical repReq/deficit -- force via two factions with same rep.
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe('AugCheap');
  });

  it('includes NFG in the sort when uncapped', () => {
    const catalog = { augs: { [NFG_NAME]: aug({ sellers: ['F1'], repReq: 100, isNFG: true }) }, factions: { F1: faction() } };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe(NFG_NAME);
  });

  it('excludes NFG from the sort when capped this cycle', () => {
    const catalog = { augs: { [NFG_NAME]: aug({ sellers: ['F1'], repReq: 100, isNFG: true }) }, factions: { F1: faction() } };
    expect(pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), true)).toBeNull();
  });

  it('skips a camp-blocked candidate and takes the next reachable one (D5: skip, dont stall)', () => {
    const catalog = {
      augs: {
        AugCamp: aug({ sellers: ['Chongqing'], repReq: 100 }),
        AugOther: aug({ sellers: ['CyberSec'], repReq: 500 }),
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
    const catalog = { augs: { AugX: aug({ sellers: ['F1'], repReq: 100 }) }, factions: { F1: faction() } };
    const target = pickTarget(catalog, facts({ invites: new Set(['F1']) }), new Set(), new Set(), false);
    expect(target.status).toBe('invite-pending');
  });

  it('marks status awaiting-invite when requirements are met but no invite has surfaced yet', () => {
    const catalog = { augs: { AugX: aug({ sellers: ['F1'], repReq: 100 }) }, factions: { F1: faction({ inviteReqs: [{ type: 'city', city: 'Aevum' }] }) } };
    const target = pickTarget(catalog, facts({ city: 'Aevum' }), new Set(), new Set(), false);
    expect(target.status).toBe('awaiting-invite');
  });

  it('marks status city-gap (with gapCity) when travel is the only unmet requirement', () => {
    const catalog = { augs: { AugX: aug({ sellers: ['F1'], repReq: 100 }) }, factions: { F1: faction({ inviteReqs: [{ type: 'city', city: 'Aevum' }] }) } };
    const target = pickTarget(catalog, facts({ city: 'Volhaven' }), new Set(), new Set(), false);
    expect(target.status).toBe('city-gap');
    expect(target.gapCity).toBe('Aevum');
  });

  it('chain targeting: targets the deepest unowned prereq, carrying the prereqs own faction/repReq/deficit', () => {
    const catalog = {
      augs: {
        Wanted: aug({ sellers: ['F1'], repReq: 5000, prereqs: ['Prereq'] }),
        Prereq: aug({ sellers: ['F2'], repReq: 100, passesFilter: false }),
      },
      factions: { F1: faction(), F2: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F2: 0 } }), new Set(['F1', 'F2']), new Set(), false);
    expect(target.aug).toBe('Prereq');
    expect(target.faction).toBe('F2');
    expect(target.repReq).toBe(100);
    expect(target.wantedFor).toBe('Wanted');
  });

  it('drops the wanted aug entirely when a prereq has no in-scope seller', () => {
    const catalog = { augs: { Wanted: aug({ sellers: ['F1'], repReq: 100, prereqs: ['Ghost'] }) }, factions: { F1: faction() } };
    expect(pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false)).toBeNull();
  });

  it('dedupes two wanted augs that share the same unowned prereq into one candidate', () => {
    const catalog = {
      augs: {
        WantedA: aug({ sellers: ['F1'], repReq: 5000, prereqs: ['SharedPrereq'] }),
        WantedB: aug({ sellers: ['F1'], repReq: 6000, prereqs: ['SharedPrereq'] }),
        SharedPrereq: aug({ sellers: ['F1'], repReq: 100 }),
      },
      factions: { F1: faction() },
    };
    const target = pickTarget(catalog, facts({ factionRep: { F1: 0 } }), new Set(['F1']), new Set(), false);
    expect(target.aug).toBe('SharedPrereq');
    // Dedup keeps the first wanted aug encountered that resolves to this
    // actionable link -- wantedFor names *a* motivating aug, not "both".
    expect(['WantedA', 'WantedB']).toContain(target.wantedFor);
  });
});

describe('planPass', () => {
  const scope = new Set(['CyberSec', 'F1']);

  it('join gating: emits join only when the invite is pending', () => {
    const awaitingTarget = { aug: 'X', faction: 'F1', repReq: 100, deficit: 100, status: 'awaiting-invite' };
    const plan1 = planPass({ target: awaitingTarget, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
    expect(plan1.actions.some((a) => a.type === 'join')).toBe(false);
    expect(plan1.phase).toBe('awaiting-invite');

    const pendingTarget = { ...awaitingTarget, status: 'invite-pending' };
    const plan2 = planPass({ target: pendingTarget, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
    expect(plan2.actions).toEqual([{ type: 'join', faction: 'F1' }]);
  });

  it('never emits a join (or any action) for an out-of-scope faction, even when invited (D11 defense-in-depth)', () => {
    const outOfScope = { aug: 'X', faction: 'SlumSnakes', repReq: 100, deficit: 100, status: 'invite-pending' };
    const plan = planPass({ target: outOfScope, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
    expect(plan.actions.some((a) => a.type === 'join')).toBe(false);
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

    it("buy/reserve actions still fire while yielded (only work is slot-gated)", () => {
      const plan = planPass({ target: metTarget, currentWork: { type: 'COMPANY' }, factionScope: scope, money: 500, livePrice: 500, paused: false });
      expect(plan.actions.some((a) => a.type === 'buy')).toBe(true);
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

    it('issues work when not already working the wanted (faction, workType) pair', () => {
      const plan = planPass({ target: grindTarget, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
      expect(plan.actions).toEqual([{ type: 'work', faction: 'CyberSec', workType: 'hacking' }]);
    });

    it('does not re-issue work when current work already matches', () => {
      const currentWork = { type: 'FACTION', factionName: 'CyberSec', factionWorkType: 'hacking' };
      const plan = planPass({ target: grindTarget, currentWork, factionScope: scope, money: 0, livePrice: null, paused: false });
      expect(plan.actions.some((a) => a.type === 'work')).toBe(false);
      expect(plan.phase).toBe('grinding');
    });

    it('yields (no work action) when the slot is held by manual work', () => {
      const plan = planPass({ target: grindTarget, currentWork: { type: 'COMPANY' }, factionScope: scope, money: 0, livePrice: null, paused: false });
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

  it('idle-plateau when there is no target', () => {
    const plan = planPass({ target: null, currentWork: null, factionScope: scope, money: 0, livePrice: null, paused: false });
    expect(plan.phase).toBe('idle-plateau');
    expect(plan.reserve).toBe(0);
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
