import { describe, it, expect } from 'vitest';
import {
  planBbEntry,
  BB_COMBAT_GATE,
  BB_HOME_RAM_TARGET_GB,
  BB_JOIN_RETRY_MS,
  BB_HOMERAM_RETRY_MS,
  BB_HOMERAM_SPEND_FRACTION,
} from '../src/daemon.js';
import { recordTransactionHome, transactionsFileName } from '../src/translog.js';

const base = {
  offMarker: false,
  inBladeburner: false,
  combatMin: BB_COMBAT_GATE,
  homeMaxRam: 64,
  money: 400e6,
  nowMs: 1_000_000,
};

describe('planBbEntry', () => {
  it('joins once all combat stats reach the gate', () => {
    expect(planBbEntry(base)).toEqual({ kind: 'join', script: 'joinbladeburner.js', args: ['auto'] });
  });
  it('does nothing below the gate', () => {
    expect(planBbEntry({ ...base, combatMin: BB_COMBAT_GATE - 1 })).toBeNull();
  });
  it('off marker stands everything down', () => {
    expect(planBbEntry({ ...base, offMarker: true })).toBeNull();
    expect(planBbEntry({ ...base, offMarker: true, inBladeburner: true })).toBeNull();
  });
  it('join retries only after its own clock', () => {
    expect(planBbEntry({ ...base, lastJoinMs: base.nowMs - BB_JOIN_RETRY_MS + 1 })).toBeNull();
    expect(planBbEntry({ ...base, lastJoinMs: base.nowMs - BB_JOIN_RETRY_MS })?.kind).toBe('join');
  });
  it('post-join climbs home RAM with a capped spend', () => {
    const step = planBbEntry({ ...base, inBladeburner: true });
    expect(step).toEqual({
      kind: 'home-ram',
      script: 'upgradehomeramonce.js',
      args: [Math.floor(base.money * BB_HOMERAM_SPEND_FRACTION)],
    });
  });
  it('post-join ignores combat (stats can dip after the join)', () => {
    expect(planBbEntry({ ...base, inBladeburner: true, combatMin: 1 })?.kind).toBe('home-ram');
  });
  it('stops at the home RAM target', () => {
    expect(planBbEntry({ ...base, inBladeburner: true, homeMaxRam: BB_HOME_RAM_TARGET_GB })).toBeNull();
  });
  it('home-ram has its own slower retry clock, independent of join', () => {
    const s = { ...base, inBladeburner: true, lastJoinMs: base.nowMs };
    expect(planBbEntry(s)?.kind).toBe('home-ram');
    expect(planBbEntry({ ...s, lastHomeRamMs: base.nowMs - BB_HOMERAM_RETRY_MS + 1 })).toBeNull();
  });
  it('no money, no attempt', () => {
    expect(planBbEntry({ ...base, inBladeburner: true, money: 0 })).toBeNull();
  });
});

/** Minimal multi-host ns: host-scoped files, scp copies between them. */
function fakeNs(here, files) {
  return {
    getHostname: () => here,
    read: (f) => files[here]?.[f] ?? '',
    write: (f, data) => { (files[here] ??= {})[f] = data; },
    scp: (f, dest, src) => {
      if (files[src]?.[f] === undefined) return false;
      (files[dest] ??= {})[f] = files[src][f];
      return true;
    },
  };
}

describe('recordTransactionHome', () => {
  const fn = transactionsFileName(new Date());
  it('on home it is a plain append', () => {
    const files = { home: { [fn]: JSON.stringify([{ a: 1 }]) } };
    recordTransactionHome(fakeNs('home', files), { b: 2 });
    expect(JSON.parse(files.home[fn])).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it('off home it appends to home\'s file, not the local one', () => {
    const files = { home: { [fn]: JSON.stringify([{ a: 1 }]) }, fleet: { [fn]: JSON.stringify([{ stale: true }]) } };
    recordTransactionHome(fakeNs('fleet', files), { b: 2 });
    expect(JSON.parse(files.home[fn])).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it('off home with no home file, ignores a stale local copy', () => {
    const files = { home: {}, fleet: { [fn]: JSON.stringify([{ stale: true }]) } };
    recordTransactionHome(fakeNs('fleet', files), { b: 2 });
    expect(JSON.parse(files.home[fn])).toEqual([{ b: 2 }]);
  });
});
