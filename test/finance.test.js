// Unit tests for src/financemanager.js's pure logic: parseManualExtra,
// computeReservations, computeAvailable, diffReservations.
import { describe, it, expect } from 'vitest';
import {
  BOOTSTRAP_SERVER_COST,
  TOR_ROUTER_COST,
  FORMULAS_COST,
  FORMULAS_HACKING_LEVEL_THRESHOLD,
  PORT_OPENER_COSTS,
  parseManualExtra,
  computeReservations,
  computeAvailable,
  diffReservations,
} from '../src/financemanager.js';

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

  it('port-opener reservation walks the ladder as each program is bought', () => {
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
    r = computeReservations({ ...BASE_STATE, ownedPrograms: owned }).reservations.find((x) => x.key === 'next-port-opener');
    expect(r.label).toBe('HTTPWorm.exe');

    owned.add('HTTPWorm.exe');
    r = computeReservations({ ...BASE_STATE, ownedPrograms: owned }).reservations.find((x) => x.key === 'next-port-opener');
    expect(r.label).toBe('SQLInject.exe');

    owned.add('SQLInject.exe');
    const { reservations } = computeReservations({ ...BASE_STATE, ownedPrograms: owned });
    expect(reservations.map((x) => x.key)).not.toContain('next-port-opener');
  });

  it('formulas reservation respects the strict > 300 boundary', () => {
    expect(
      computeReservations({ ...BASE_STATE, hackingLevel: 300, hasFormulas: false }).reservations.map((r) => r.key)
    ).not.toContain('formulas');
    expect(
      computeReservations({ ...BASE_STATE, hackingLevel: 301, hasFormulas: false }).reservations.map((r) => r.key)
    ).toContain('formulas');
    const formulasReservation = computeReservations({ ...BASE_STATE, hackingLevel: 301, hasFormulas: false }).reservations.find(
      (r) => r.key === 'formulas'
    );
    expect(formulasReservation.amount).toBe(FORMULAS_COST);
  });

  it('formulas reservation drops once owned, regardless of level', () => {
    expect(
      computeReservations({ ...BASE_STATE, hackingLevel: 9999, hasFormulas: true }).reservations.map((r) => r.key)
    ).not.toContain('formulas');
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
      hackingLevel: 301,
      hasFormulas: false,
      manualExtraAmount: 1_000_000,
    });
    const expected = reservations.reduce((sum, r) => sum + r.amount, 0);
    expect(totalReserved).toBe(expected);
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
