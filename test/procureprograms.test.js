// Unit tests for src/procureprograms.js's pure logic: planProgramPurchase
// and bootstrapHoldbackFrom (new in Phase 11).
import { describe, it, expect } from 'vitest';
import { planProgramPurchase, bootstrapHoldbackFrom } from '../src/procureprograms.js';
import { TOR_ROUTER_COST, PORT_OPENER_COSTS } from '../src/resourcemanager.js';

const ALL_OPENERS = new Set(PORT_OPENER_COSTS.map((p) => p.file));

describe('planProgramPurchase', () => {
  it('everything owned -- done', () => {
    expect(planProgramPurchase({ hasTor: true, ownedFiles: ALL_OPENERS, money: 0, holdback: 0 })).toEqual({ action: 'done' });
  });

  it('no TOR, affordable over holdback -- buy-tor', () => {
    expect(
      planProgramPurchase({ hasTor: false, ownedFiles: new Set(), money: TOR_ROUTER_COST + 1_000, holdback: 0 })
    ).toEqual({ action: 'buy-tor' });
  });

  it('no TOR, not affordable -- wait', () => {
    expect(
      planProgramPurchase({ hasTor: false, ownedFiles: new Set(), money: TOR_ROUTER_COST - 1, holdback: 0 })
    ).toEqual({ action: 'wait' });
  });

  it('no TOR, affordable only by dipping below holdback -- wait', () => {
    const holdback = 100_000;
    expect(
      planProgramPurchase({ hasTor: false, ownedFiles: new Set(), money: TOR_ROUTER_COST + holdback - 1, holdback })
    ).toEqual({ action: 'wait' });
  });

  it('no TOR, boundary money - cost === holdback -- buy-tor', () => {
    const holdback = 100_000;
    expect(
      planProgramPurchase({ hasTor: false, ownedFiles: new Set(), money: TOR_ROUTER_COST + holdback, holdback })
    ).toEqual({ action: 'buy-tor' });
  });

  it('TOR owned, cheapest-unowned selection walks the ladder as ownedFiles grows', () => {
    const owned = new Set();
    let plan = planProgramPurchase({ hasTor: true, ownedFiles: owned, money: 1_000_000_000, holdback: 0 });
    expect(plan).toEqual({ action: 'buy-program', file: 'BruteSSH.exe', cost: 500_000 });

    owned.add('BruteSSH.exe');
    plan = planProgramPurchase({ hasTor: true, ownedFiles: owned, money: 1_000_000_000, holdback: 0 });
    expect(plan).toEqual({ action: 'buy-program', file: 'FTPCrack.exe', cost: 1_500_000 });

    owned.add('FTPCrack.exe');
    plan = planProgramPurchase({ hasTor: true, ownedFiles: owned, money: 1_000_000_000, holdback: 0 });
    expect(plan).toEqual({ action: 'buy-program', file: 'relaySMTP.exe', cost: 5_000_000 });

    owned.add('relaySMTP.exe');
    plan = planProgramPurchase({ hasTor: true, ownedFiles: owned, money: 1_000_000_000, holdback: 0 });
    expect(plan).toEqual({ action: 'buy-program', file: 'HTTPWorm.exe', cost: 30_000_000 });

    owned.add('HTTPWorm.exe');
    plan = planProgramPurchase({ hasTor: true, ownedFiles: owned, money: 1_000_000_000, holdback: 0 });
    expect(plan).toEqual({ action: 'buy-program', file: 'SQLInject.exe', cost: 250_000_000 });

    owned.add('SQLInject.exe');
    plan = planProgramPurchase({ hasTor: true, ownedFiles: owned, money: 1_000_000_000, holdback: 0 });
    expect(plan).toEqual({ action: 'done' });
  });

  it('TOR owned, nothing affordable -- wait', () => {
    expect(
      planProgramPurchase({ hasTor: true, ownedFiles: new Set(), money: 100_000, holdback: 0 })
    ).toEqual({ action: 'wait' });
  });

  it('holdback 0 behaves as plain affordability', () => {
    expect(
      planProgramPurchase({ hasTor: true, ownedFiles: new Set(), money: 500_000, holdback: 0 })
    ).toEqual({ action: 'buy-program', file: 'BruteSSH.exe', cost: 500_000 });
  });
});

describe('bootstrapHoldbackFrom', () => {
  it('returns the bootstrap-server reservation amount when present', () => {
    const state = { reservations: [{ key: 'bootstrap-server', label: 'x', amount: 110_000 }, { key: 'tor-router', label: 'y', amount: 200_000 }] };
    expect(bootstrapHoldbackFrom(state)).toBe(110_000);
  });

  it('returns 0 when the key is absent', () => {
    const state = { reservations: [{ key: 'tor-router', label: 'y', amount: 200_000 }] };
    expect(bootstrapHoldbackFrom(state)).toBe(0);
  });

  it('returns 0 for null/undefined state', () => {
    expect(bootstrapHoldbackFrom(null)).toBe(0);
    expect(bootstrapHoldbackFrom(undefined)).toBe(0);
  });

  it('returns 0 when reservations is missing or malformed', () => {
    expect(bootstrapHoldbackFrom({})).toBe(0);
    expect(bootstrapHoldbackFrom({ reservations: null })).toBe(0);
    expect(bootstrapHoldbackFrom({ reservations: 'not-an-array' })).toBe(0);
  });
});
