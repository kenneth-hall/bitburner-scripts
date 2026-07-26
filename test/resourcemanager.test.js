// Unit tests for src/resourcemanager.js's pure logic (renamed from
// financemanager.js in Phase 11): parseManualExtra, computeReservations,
// computeAvailable, diffReservations. Phase 35 WI3 (D5/D7) added the
// three-branch opener rule (computeOpenerActivation) and per-reservation
// ages (stampReservationAges); the old "cheapest unowned opener is always
// fully reserved" test is rewritten per the ground-rules existing-test
// policy -- cited inline.
import { describe, it, expect } from 'vitest';
import {
  BOOTSTRAP_SERVER_COST,
  TOR_ROUTER_COST,
  FORMULAS_COST,
  FORMULAS_HACKING_LEVEL_THRESHOLD,
  PORT_OPENER_COSTS,
  AUGFARMER_STALE_MS,
  CHEAP_OPENER_FLOOR,
  OPENER_INCOME_HORIZON_MS,
  OPENER_ACTIVATION_FRACTION,
  OPENER_ACTIVATION_RELEASE_FRACTION,
  OPENER_ELIGIBILITY_RELEASE_MULT,
  OPENER_FAST_FUND_MS,
  parseManualExtra,
  parseAugReserve,
  computeReservations,
  computeOpenerActivation,
  stampReservationAges,
  computeAvailable,
  diffReservations,
} from '../src/resourcemanager.js';

const BASE_STATE = {
  serverCount: 1,
  hasTor: true,
  ownedPrograms: new Set(PORT_OPENER_COSTS.map((p) => p.file)),
  hackingLevel: 1,
  hasFormulas: false,
  manualExtraAmount: 0,
};

describe('parseManualExtra', () => {
  it('treats a missing/empty file as nothing to reserve, not bad content', () => {
    expect(parseManualExtra('')).toEqual({ amount: 0, badContent: false });
    expect(parseManualExtra(undefined)).toEqual({ amount: 0, badContent: false });
    expect(parseManualExtra(null)).toEqual({ amount: 0, badContent: false });
  });

  it('accepts a finite positive number', () => {
    expect(parseManualExtra('2500000000')).toEqual({ amount: 2_500_000_000, badContent: false });
    expect(parseManualExtra('1')).toEqual({ amount: 1, badContent: false });
  });

  it('rejects garbage', () => {
    expect(parseManualExtra('not-a-number')).toEqual({ amount: 0, badContent: true });
  });

  it('rejects zero and negative numbers', () => {
    expect(parseManualExtra('0')).toEqual({ amount: 0, badContent: true });
    expect(parseManualExtra('-5')).toEqual({ amount: 0, badContent: true });
  });

  it('rejects NaN and Infinity', () => {
    expect(parseManualExtra('NaN')).toEqual({ amount: 0, badContent: true });
    expect(parseManualExtra('Infinity')).toEqual({ amount: 0, badContent: true });
  });
});

describe('parseAugReserve', () => {
  const NOW = 1_000_000;

  it('treats a missing/empty file as nothing to reserve, not bad content', () => {
    expect(parseAugReserve('', NOW, AUGFARMER_STALE_MS)).toEqual({ amount: 0, aug: null, badContent: false, stale: false });
    expect(parseAugReserve(undefined, NOW, AUGFARMER_STALE_MS)).toEqual({ amount: 0, aug: null, badContent: false, stale: false });
    expect(parseAugReserve(null, NOW, AUGFARMER_STALE_MS)).toEqual({ amount: 0, aug: null, badContent: false, stale: false });
  });

  it('accepts a fresh, valid reservation', () => {
    const raw = JSON.stringify({ amount: 2_500_000, aug: 'Bionic Arms', faction: 'CyberSec', timestamp: NOW - 1000 });
    expect(parseAugReserve(raw, NOW, AUGFARMER_STALE_MS)).toEqual({ amount: 2_500_000, aug: 'Bionic Arms', badContent: false, stale: false });
  });

  it('rejects malformed JSON', () => {
    expect(parseAugReserve('not-json{', NOW, AUGFARMER_STALE_MS)).toEqual({ amount: 0, aug: null, badContent: true, stale: false });
  });

  it('rejects a non-finite or negative amount', () => {
    expect(parseAugReserve(JSON.stringify({ amount: NaN, timestamp: NOW }), NOW, AUGFARMER_STALE_MS)).toEqual({
      amount: 0,
      aug: null,
      badContent: true,
      stale: false,
    });
    expect(parseAugReserve(JSON.stringify({ amount: -5, timestamp: NOW }), NOW, AUGFARMER_STALE_MS)).toEqual({
      amount: 0,
      aug: null,
      badContent: true,
      stale: false,
    });
  });

  it('forces amount to 0 and reports stale once the timestamp exceeds staleMs', () => {
    const raw = JSON.stringify({ amount: 2_500_000, aug: 'Bionic Arms', timestamp: NOW - AUGFARMER_STALE_MS - 1 });
    expect(parseAugReserve(raw, NOW, AUGFARMER_STALE_MS)).toEqual({ amount: 0, aug: 'Bionic Arms', badContent: false, stale: true });
  });

  it('treats a missing/non-finite timestamp as stale (NaN comparisons never satisfy >)', () => {
    const raw = JSON.stringify({ amount: 2_500_000, aug: 'Bionic Arms' });
    expect(parseAugReserve(raw, NOW, AUGFARMER_STALE_MS)).toEqual({ amount: 0, aug: 'Bionic Arms', badContent: false, stale: true });
  });

  it('amount 0 is valid content, not badContent', () => {
    const raw = JSON.stringify({ amount: 0, aug: null, timestamp: NOW });
    expect(parseAugReserve(raw, NOW, AUGFARMER_STALE_MS)).toEqual({ amount: 0, aug: null, badContent: false, stale: false });
  });
});

describe('computeReservations', () => {
  it('fresh post-reset state reserves exactly bootstrap + tor + first port opener, totaling $810k', () => {
    const { reservations, totalReserved } = computeReservations({
      serverCount: 0,
      hasTor: false,
      ownedPrograms: new Set(),
      hackingLevel: 1,
      hasFormulas: false,
      manualExtraAmount: 0,
    });
    expect(reservations.map((r) => r.key)).toEqual(['bootstrap-server', 'tor-router', 'next-port-opener']);
    expect(reservations.find((r) => r.key === 'next-port-opener').label).toBe('BruteSSH.exe');
    expect(totalReserved).toBe(BOOTSTRAP_SERVER_COST + TOR_ROUTER_COST + 500_000);
    expect(totalReserved).toBe(810_000);
  });

  it('bootstrap-server drops once a server is owned', () => {
    const { reservations } = computeReservations({ ...BASE_STATE, serverCount: 0 });
    expect(reservations.map((r) => r.key)).toContain('bootstrap-server');
    const { reservations: after } = computeReservations({ ...BASE_STATE, serverCount: 1 });
    expect(after.map((r) => r.key)).not.toContain('bootstrap-server');
  });

  it('tor-router drops once TOR is owned', () => {
    const { reservations } = computeReservations({ ...BASE_STATE, hasTor: false });
    expect(reservations.map((r) => r.key)).toContain('tor-router');
    const { reservations: after } = computeReservations({ ...BASE_STATE, hasTor: true });
    expect(after.map((r) => r.key)).not.toContain('tor-router');
  });

  // Rewritten per Phase 35 (D5) -- the ground-rules existing-test policy:
  // this pins the OLD "cheapest unowned opener is always fully reserved"
  // rule, which the phase deliberately supersedes. Cheap rungs (<=
  // CHEAP_OPENER_FLOOR) still always reserve in full -- unaffected by the
  // new policy. Expensive rungs (HTTPWorm/SQLInject) now depend on
  // eligibility/activation -- see the computeOpenerActivation and
  // "expensive-opener reservation" suites below for that policy's coverage.
  it('port-opener reservation walks the cheap-tier ladder unconditionally as each cheap program is bought', () => {
    const owned = new Set();
    let r = computeReservations({ ...BASE_STATE, ownedPrograms: owned }).reservations.find((x) => x.key === 'next-port-opener');
    expect(r.label).toBe('BruteSSH.exe');

    owned.add('BruteSSH.exe');
    r = computeReservations({ ...BASE_STATE, ownedPrograms: owned }).reservations.find((x) => x.key === 'next-port-opener');
    expect(r.label).toBe('FTPCrack.exe');

    owned.add('FTPCrack.exe');
    r = computeReservations({ ...BASE_STATE, ownedPrograms: owned }).reservations.find((x) => x.key === 'next-port-opener');
    expect(r.label).toBe('relaySMTP.exe');

    owned.add('relaySMTP.exe');
    // The ladder now points at HTTPWorm ($30M, > CHEAP_OPENER_FLOOR) -- with
    // no money/income supplied (both undefined/null), it is NOT reserved.
    r = computeReservations({ ...BASE_STATE, ownedPrograms: owned }).reservations.find((x) => x.key === 'next-port-opener');
    expect(r).toBeUndefined();

    owned.add('HTTPWorm.exe');
    r = computeReservations({ ...BASE_STATE, ownedPrograms: owned }).reservations.find((x) => x.key === 'next-port-opener');
    expect(r).toBeUndefined(); // SQLInject, same reason

    owned.add('SQLInject.exe');
    const { reservations } = computeReservations({ ...BASE_STATE, ownedPrograms: owned });
    expect(reservations.map((x) => x.key)).not.toContain('next-port-opener');
  });

  describe('expensive-opener reservation (Phase 35 WI3/D5 -- HTTPWorm/SQLInject)', () => {
    const ownedThroughRelay = new Set(['BruteSSH.exe', 'FTPCrack.exe', 'relaySMTP.exe']); // ladder points at HTTPWorm ($30M)
    const ownedThroughHTTP = new Set([...ownedThroughRelay, 'HTTPWorm.exe']); // ladder points at SQLInject ($250M)

    it('the §3 fixture: SQLInject $250M, money $5.3M, stale/low income -> NOT reserved, available > 0', () => {
      const { reservations, totalReserved } = computeReservations({
        ...BASE_STATE,
        ownedPrograms: ownedThroughHTTP,
        money: 5_300_000,
        trailingIncomePerSec: null,
      });
      expect(reservations.map((r) => r.key)).not.toContain('next-port-opener');
      expect(computeAvailable(5_300_000, totalReserved)).toBeGreaterThan(0);
    });

    it('reserved via the money clause (money >= 0.5 * cost) even with no income signal', () => {
      const { reservations } = computeReservations({
        ...BASE_STATE,
        ownedPrograms: ownedThroughRelay,
        money: 15_000_000, // exactly 0.5 * $30M
        trailingIncomePerSec: 1_000_000, // must also be ELIGIBLE: 8h * $1M/s is enormous, so eligible
      });
      expect(reservations.find((r) => r.key === 'next-port-opener')?.label).toBe('HTTPWorm.exe');
    });

    it('reserved via the fast-fund clause (income * 30min >= cost) even at low cash', () => {
      // $412k/s (measured healthy batcher figure) * 1800s = $741.6M >> $30M.
      const { reservations } = computeReservations({
        ...BASE_STATE,
        ownedPrograms: ownedThroughRelay,
        money: 1, // far below the money clause
        trailingIncomePerSec: 412_000,
      });
      expect(reservations.find((r) => r.key === 'next-port-opener')?.label).toBe('HTTPWorm.exe');
    });

    it('absent when ineligible: 8h * income < cost, regardless of cash on hand', () => {
      const { reservations } = computeReservations({
        ...BASE_STATE,
        ownedPrograms: ownedThroughRelay,
        money: 1_000_000_000, // plenty of cash
        trailingIncomePerSec: 1, // 8h * $1/s = $28.8k << $30M
      });
      expect(reservations.map((r) => r.key)).not.toContain('next-port-opener');
    });

    it('null income -> floor-only mode: expensive opener never reserved regardless of cash', () => {
      const { reservations } = computeReservations({
        ...BASE_STATE,
        ownedPrograms: ownedThroughRelay,
        money: 1_000_000_000,
        trailingIncomePerSec: null,
      });
      expect(reservations.map((r) => r.key)).not.toContain('next-port-opener');
    });
  });

  it('formulas reservation respects the strict > 400 boundary', () => {
    expect(
      computeReservations({ ...BASE_STATE, hackingLevel: 400, hasFormulas: false }).reservations.map((r) => r.key)
    ).not.toContain('formulas');
    expect(
      computeReservations({ ...BASE_STATE, hackingLevel: 401, hasFormulas: false }).reservations.map((r) => r.key)
    ).toContain('formulas');
    const formulasReservation = computeReservations({ ...BASE_STATE, hackingLevel: 401, hasFormulas: false }).reservations.find(
      (r) => r.key === 'formulas'
    );
    expect(formulasReservation.amount).toBe(FORMULAS_COST);
  });

  it('formulas reservation drops once owned, regardless of level', () => {
    expect(
      computeReservations({ ...BASE_STATE, hackingLevel: 9999, hasFormulas: true }).reservations.map((r) => r.key)
    ).not.toContain('formulas');
  });

  it('formulasDisabled suppresses the reservation and reports formulasSuppressed: true', () => {
    const result = computeReservations({ ...BASE_STATE, hackingLevel: 401, hasFormulas: false, formulasDisabled: true });
    expect(result.reservations.map((r) => r.key)).not.toContain('formulas');
    expect(result.formulasSuppressed).toBe(true);
  });

  it('formulasDisabled has no effect (and reports formulasSuppressed: false) when the reservation would not have applied anyway', () => {
    const belowThreshold = computeReservations({ ...BASE_STATE, hackingLevel: 1, hasFormulas: false, formulasDisabled: true });
    expect(belowThreshold.formulasSuppressed).toBe(false);

    const alreadyOwned = computeReservations({ ...BASE_STATE, hackingLevel: 9999, hasFormulas: true, formulasDisabled: true });
    expect(alreadyOwned.formulasSuppressed).toBe(false);
  });

  it('formulasSuppressed is false by default when formulasDisabled is not set', () => {
    expect(computeReservations({ ...BASE_STATE, hackingLevel: 401, hasFormulas: false }).formulasSuppressed).toBe(false);
  });

  it('next-aug adds a reservation only when augReserve.amount is positive', () => {
    expect(computeReservations({ ...BASE_STATE, augReserve: { amount: 0, aug: null } }).reservations.map((r) => r.key)).not.toContain(
      'next-aug'
    );
    const { reservations } = computeReservations({ ...BASE_STATE, augReserve: { amount: 3_500_000, aug: 'Bionic Arms' } });
    const r = reservations.find((x) => x.key === 'next-aug');
    expect(r.amount).toBe(3_500_000);
    expect(r.label).toContain('Bionic Arms');
  });

  it('next-aug is absent when augReserve is undefined (no farmer running yet)', () => {
    expect(computeReservations({ ...BASE_STATE }).reservations.map((r) => r.key)).not.toContain('next-aug');
  });

  it('manual-extra adds a reservation only when the amount is positive', () => {
    expect(computeReservations({ ...BASE_STATE, manualExtraAmount: 0 }).reservations.map((r) => r.key)).not.toContain('manual-extra');
    const { reservations } = computeReservations({ ...BASE_STATE, manualExtraAmount: 2_500_000_000 });
    const r = reservations.find((x) => x.key === 'manual-extra');
    expect(r.amount).toBe(2_500_000_000);
  });

  it('totalReserved is the sum of every active reservation', () => {
    const { reservations, totalReserved } = computeReservations({
      serverCount: 0,
      hasTor: false,
      ownedPrograms: new Set(),
      hackingLevel: 401,
      hasFormulas: false,
      manualExtraAmount: 1_000_000,
    });
    const expected = reservations.reduce((sum, r) => sum + r.amount, 0);
    expect(totalReserved).toBe(expected);
  });
});

describe('computeOpenerActivation (Phase 35 WI3/D5, cold-review M3 hysteresis)', () => {
  const COST = 30_000_000; // HTTPWorm

  it('boundary value pinned: activation exactly at 0.5*cost arms (>=)', () => {
    expect(computeOpenerActivation({ cost: COST, money: OPENER_ACTIVATION_FRACTION * COST, trailingIncomePerSec: 1_000_000, prevActive: false })).toBe(true);
    expect(computeOpenerActivation({ cost: COST, money: OPENER_ACTIVATION_FRACTION * COST - 1, trailingIncomePerSec: 0, prevActive: false })).toBe(false);
  });

  it('not-previously-active: eligible + funded via the money clause', () => {
    expect(computeOpenerActivation({ cost: COST, money: COST, trailingIncomePerSec: 1_000_000, prevActive: false })).toBe(true);
  });

  it('not-previously-active: eligible + funded via the fast-fund clause at low cash', () => {
    const income = COST / (OPENER_FAST_FUND_MS / 1000); // $/sec that funds `cost` in exactly FAST_FUND_MS
    expect(computeOpenerActivation({ cost: COST, money: 1, trailingIncomePerSec: income, prevActive: false })).toBe(true);
  });

  it('not-previously-active: ineligible even if fully funded', () => {
    expect(computeOpenerActivation({ cost: COST, money: COST * 10, trailingIncomePerSec: 1, prevActive: false })).toBe(false);
  });

  it('hysteresis: previously active stays active at 0.4*cost (between the release band and full funding)', () => {
    expect(
      computeOpenerActivation({ cost: COST, money: 0.4 * COST, trailingIncomePerSec: 1_000_000, prevActive: true })
    ).toBe(true);
  });

  it('hysteresis: previously active releases below 0.35*cost', () => {
    expect(
      computeOpenerActivation({ cost: COST, money: OPENER_ACTIVATION_RELEASE_FRACTION * COST - 1, trailingIncomePerSec: 1_000_000, prevActive: true })
    ).toBe(false);
    expect(
      computeOpenerActivation({ cost: COST, money: OPENER_ACTIVATION_RELEASE_FRACTION * COST, trailingIncomePerSec: 1_000_000, prevActive: true })
    ).toBe(true); // exact boundary stays active
  });

  it('hysteresis: eligibility persists to 1.25x the arm threshold once active', () => {
    const income = 1_000; // horizonSec(28800) * income = $28.8M arm threshold
    const armThreshold = (OPENER_INCOME_HORIZON_MS / 1000) * income; // $28.8M
    const releaseThreshold = armThreshold * OPENER_ELIGIBILITY_RELEASE_MULT; // $36M
    const midCost = (armThreshold + releaseThreshold) / 2; // $32.4M -- ineligible fresh, still eligible via hysteresis
    expect(computeOpenerActivation({ cost: midCost, money: midCost, trailingIncomePerSec: income, prevActive: false })).toBe(false);
    expect(computeOpenerActivation({ cost: midCost, money: midCost, trailingIncomePerSec: income, prevActive: true })).toBe(true);
  });

  it('null/non-numeric income always returns false, active or not -- floor-only mode, no hysteresis for a lost signal', () => {
    expect(computeOpenerActivation({ cost: COST, money: COST * 10, trailingIncomePerSec: null, prevActive: true })).toBe(false);
    expect(computeOpenerActivation({ cost: COST, money: COST * 10, trailingIncomePerSec: undefined, prevActive: true })).toBe(false);
  });
});

describe('computeReservations -- opener hysteresis threading (prevOpenerActive/prevOpenerTarget)', () => {
  const ownedThroughRelay = new Set(['BruteSSH.exe', 'FTPCrack.exe', 'relaySMTP.exe']);

  // money/income chosen to sit strictly in the "release band, not the arm
  // band" for HTTPWorm ($30M): arm-eligible needs income >= ~$1041.67/s
  // (8h*income >= cost), release-eligible only needs >= ~$833.33/s (that
  // times 1.25); arm-funded needs money >= $15M (0.5*cost), release-funded
  // only needs >= $10.5M (0.35*cost). $900/s and $12M clear neither arm
  // threshold but clear both release thresholds -- exactly the gap
  // hysteresis bleed-through would exploit.
  const releaseOnlyIncome = 900;
  const releaseOnlyMoney = 12_000_000;

  it('a ladder advance to a NEW opener does not inherit the old opener\'s active hysteresis', () => {
    const result = computeReservations({
      ...BASE_STATE,
      ownedPrograms: ownedThroughRelay,
      money: releaseOnlyMoney,
      trailingIncomePerSec: releaseOnlyIncome,
      prevOpenerActive: true,
      prevOpenerTarget: 'SQLInject.exe', // a DIFFERENT opener was active last poll
    });
    expect(result.reservations.map((r) => r.key)).not.toContain('next-port-opener');
    expect(result.openerActive).toBe(false);
  });

  it('the SAME opener target correctly inherits hysteresis', () => {
    const result = computeReservations({
      ...BASE_STATE,
      ownedPrograms: ownedThroughRelay,
      money: releaseOnlyMoney,
      trailingIncomePerSec: releaseOnlyIncome,
      prevOpenerActive: true,
      prevOpenerTarget: 'HTTPWorm.exe', // the SAME opener was active last poll
    });
    expect(result.reservations.map((r) => r.key)).toContain('next-port-opener');
    expect(result.openerActive).toBe(true);
  });

  it('openerTarget reports the cheapest-unowned file even when not reserved (for the caller to track)', () => {
    const result = computeReservations({ ...BASE_STATE, ownedPrograms: ownedThroughRelay, money: 1, trailingIncomePerSec: null });
    expect(result.openerTarget).toBe('HTTPWorm.exe');
    expect(result.openerActive).toBe(false);
  });

  it('openerTarget is null once every opener is owned', () => {
    const result = computeReservations({ ...BASE_STATE });
    expect(result.openerTarget).toBeNull();
  });
});

describe('stampReservationAges (Phase 35 WI3/D7)', () => {
  const A = { key: 'tor-router', label: 'TOR router', amount: TOR_ROUTER_COST };
  const B = { key: 'next-port-opener', label: 'BruteSSH.exe', amount: 500_000 };

  it('a newly-seen key is stamped with the current time', () => {
    const { reservations, firstSeenMs } = stampReservationAges([A], {}, 1000);
    expect(reservations[0].since).toBe(1000);
    expect(firstSeenMs).toEqual({ 'tor-router': 1000 });
  });

  it('since is stable across polls (does not reset to the current time every poll)', () => {
    const first = stampReservationAges([A], {}, 1000);
    const second = stampReservationAges([A], first.firstSeenMs, 5000);
    expect(second.reservations[0].since).toBe(1000);
  });

  it('since is stable across hysteresis-held states (amount/label held constant across polls)', () => {
    const first = stampReservationAges([A, B], {}, 1000);
    const second = stampReservationAges([A, B], first.firstSeenMs, 9000);
    expect(second.reservations.find((r) => r.key === 'next-port-opener').since).toBe(1000);
  });

  it('resets when a key disappears and later returns', () => {
    const first = stampReservationAges([A, B], {}, 1000);
    const gone = stampReservationAges([A], first.firstSeenMs, 5000); // B disappears
    expect(gone.firstSeenMs['next-port-opener']).toBeUndefined();
    const back = stampReservationAges([A, B], gone.firstSeenMs, 9000); // B returns
    expect(back.reservations.find((r) => r.key === 'next-port-opener').since).toBe(9000); // fresh stamp, not 1000
  });

  it('does not mutate the input firstSeenMs object', () => {
    const input = { 'tor-router': 1000 };
    stampReservationAges([A, B], input, 5000);
    expect(input).toEqual({ 'tor-router': 1000 });
  });

  it('preserves every other reservation field unchanged', () => {
    const { reservations } = stampReservationAges([A], {}, 1000);
    expect(reservations[0]).toMatchObject({ key: 'tor-router', label: 'TOR router', amount: TOR_ROUTER_COST });
  });
});

describe('computeAvailable', () => {
  it('is money minus totalReserved when non-negative', () => {
    expect(computeAvailable(1_000_000, 300_000)).toBe(700_000);
  });

  it('clamps at 0 when reservations exceed money', () => {
    expect(computeAvailable(1_000_000, FORMULAS_COST)).toBe(0);
  });

  it('clamps at 0 exactly at the boundary', () => {
    expect(computeAvailable(500, 500)).toBe(0);
  });
});

describe('diffReservations', () => {
  const A = { key: 'tor-router', label: 'TOR router', amount: TOR_ROUTER_COST };
  const B = { key: 'next-port-opener', label: 'BruteSSH.exe', amount: 500_000 };
  const B2 = { key: 'next-port-opener', label: 'FTPCrack.exe', amount: 1_500_000 };

  it('reports an add when a key appears that was not present before', () => {
    const diff = diffReservations([A], [A, B]);
    expect(diff.added.map((r) => r.key)).toEqual(['next-port-opener']);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.changedKeys).toEqual(['next-port-opener']);
    expect(diff.isEmpty).toBe(false);
  });

  it('reports a remove when a key disappears', () => {
    const diff = diffReservations([A, B], [B]);
    expect(diff.removed.map((r) => r.key)).toEqual(['tor-router']);
    expect(diff.added).toEqual([]);
    expect(diff.changedKeys).toEqual(['tor-router']);
  });

  it('reports a change when the same key gets a different amount/label', () => {
    const diff = diffReservations([A, B], [A, B2]);
    expect(diff.changed).toEqual([
      { key: 'next-port-opener', fromAmount: 500_000, fromLabel: 'BruteSSH.exe', toAmount: 1_500_000, toLabel: 'FTPCrack.exe' },
    ]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changedKeys).toEqual(['next-port-opener']);
  });

  it('reports no changes when the lists are identical', () => {
    const diff = diffReservations([A, B], [A, B]);
    expect(diff.isEmpty).toBe(true);
    expect(diff.changedKeys).toEqual([]);
  });

  it('handles multiple simultaneous changes and produces matching changedKeys', () => {
    const diff = diffReservations([A, B], [B2]);
    expect(diff.removed.map((r) => r.key)).toEqual(['tor-router']);
    expect(diff.changed.map((c) => c.key)).toEqual(['next-port-opener']);
    expect(diff.changedKeys.sort()).toEqual(['next-port-opener', 'tor-router'].sort());
  });
});
