// Unit tests for src/backdoorfactions.js (Phase 22). Fake-ns style, no
// mocking framework -- per house convention (see test/common.test.js).
import { describe, it, expect } from 'vitest';
import { classifyTarget, walkTo, resolveBladeburnerHold } from '../src/backdoorfactions.js';

describe('classifyTarget', () => {
  it('backdoorInstalled wins over everything else', () => {
    expect(
      classifyTarget({ backdoorInstalled: true, factionJoined: false, hackingLevel: 1, requiredLevel: 54, rooted: false }),
    ).toBe('done-backdoored');
  });

  it('backdoored AND joined still reports done-backdoored (backdoor check comes first)', () => {
    expect(
      classifyTarget({ backdoorInstalled: true, factionJoined: true, hackingLevel: 999, requiredLevel: 54, rooted: true }),
    ).toBe('done-backdoored');
  });

  it('joined-but-not-backdoored reports done-joined', () => {
    expect(
      classifyTarget({ backdoorInstalled: false, factionJoined: true, hackingLevel: 999, requiredLevel: 54, rooted: true }),
    ).toBe('done-joined');
  });

  it('backdoorInstalled: undefined is treated as falsy, not done', () => {
    expect(
      classifyTarget({ backdoorInstalled: undefined, factionJoined: false, hackingLevel: 1, requiredLevel: 54, rooted: false }),
    ).toBe('waiting');
  });

  it('eligible (leveled + rooted) reports ready', () => {
    expect(
      classifyTarget({ backdoorInstalled: false, factionJoined: false, hackingLevel: 60, requiredLevel: 54, rooted: true }),
    ).toBe('ready');
  });

  it('leveled but not rooted reports waiting, not ready', () => {
    expect(
      classifyTarget({ backdoorInstalled: false, factionJoined: false, hackingLevel: 60, requiredLevel: 54, rooted: false }),
    ).toBe('waiting');
  });

  it('under-leveled reports waiting', () => {
    expect(
      classifyTarget({ backdoorInstalled: false, factionJoined: false, hackingLevel: 1, requiredLevel: 54, rooted: true }),
    ).toBe('waiting');
  });

  it('requiredLevel: undefined can never be ready, regardless of hackingLevel/rooted', () => {
    expect(
      classifyTarget({ backdoorInstalled: false, factionJoined: false, hackingLevel: 99999, requiredLevel: undefined, rooted: true }),
    ).toBe('waiting');
  });
});

describe('walkTo', () => {
  /** Builds a fake ns over a plain adjacency map (used by findPath's ns.scan) plus a mutable "current server" position and a connect() that can be told to fail on a given hop. */
  function makeWalkNs(adjacency, startAt, { failAt = null } = {}) {
    const state = { current: startAt };
    const connectCalls = [];
    return {
      state,
      connectCalls,
      scan: (host) => adjacency[host] ?? [],
      singularity: {
        getCurrentServer: () => state.current,
        connect: (host) => {
          connectCalls.push(host);
          if (host === failAt) return false;
          state.current = host;
          return true;
        },
      },
    };
  }

  const ADJACENCY = {
    home: ['a'],
    a: ['home', 'b'],
    b: ['a', 'target'],
    target: ['b'],
  };

  it('already at destination: returns true with zero connect calls', () => {
    const ns = makeWalkNs(ADJACENCY, 'target');
    expect(walkTo(ns, 'target')).toBe(true);
    expect(ns.connectCalls).toEqual([]);
  });

  it('multi-hop: connects once per path element after the first, in order, never the start', () => {
    const ns = makeWalkNs(ADJACENCY, 'home');
    expect(walkTo(ns, 'target')).toBe(true);
    expect(ns.connectCalls).toEqual(['a', 'b', 'target']);
    expect(ns.state.current).toBe('target');
  });

  it('mid-walk connect failure: stops connecting and returns false', () => {
    const ns = makeWalkNs(ADJACENCY, 'home', { failAt: 'b' });
    expect(walkTo(ns, 'target')).toBe(false);
    expect(ns.connectCalls).toEqual(['a', 'b']);
  });

  it('unreachable destination: returns false with zero connect calls', () => {
    const ns = makeWalkNs({ home: ['a'], a: ['home'], island: ['isolated'], isolated: ['island'] }, 'home');
    expect(walkTo(ns, 'island')).toBe(false);
    expect(ns.connectCalls).toEqual([]);
  });
});

// Phase 39 D1: the reverse direction of augfarmer.js's resolveSlotHold --
// same fail-open contract, own copy (import-bleed reasoning), mirrors
// augfarmer.test.js's resolveSlotHold coverage.
describe('resolveBladeburnerHold — Phase 39 D1 (reverse-direction marker contract)', () => {
  const T = 1_000_000;

  it('fails open on no marker', () => {
    expect(resolveBladeburnerHold(null, T).holdActive).toBe(false);
    expect(resolveBladeburnerHold('', T).holdActive).toBe(false);
  });

  it('fails open on unparseable JSON', () => {
    expect(resolveBladeburnerHold('not json', T)).toEqual({ holdActive: false, holdReason: 'unparseable' });
  });

  it('fails open on a missing/non-numeric timestamp', () => {
    expect(resolveBladeburnerHold(JSON.stringify({ holder: 'bladeburnermanager' }), T).holdActive).toBe(false);
    expect(resolveBladeburnerHold(JSON.stringify({ ts: 'now' }), T).holdActive).toBe(false);
  });

  it('holds active for a fresh marker', () => {
    const r = resolveBladeburnerHold(JSON.stringify({ ts: T - 1000, holder: 'bladeburnermanager' }), T);
    expect(r).toEqual({ holdActive: true, holdReason: 'held', holderName: 'bladeburnermanager' });
  });

  it('fails open on a stale marker (older than maxAgeMs)', () => {
    const r = resolveBladeburnerHold(JSON.stringify({ ts: T - 30_001, holder: 'bladeburnermanager' }), T);
    expect(r.holdActive).toBe(false);
    expect(r.holdReason).toBe('stale');
  });

  it('fails open on a future-dated marker beyond tolerance', () => {
    const r = resolveBladeburnerHold(JSON.stringify({ ts: T + 5_001 }), T);
    expect(r.holdActive).toBe(false);
    expect(r.holdReason).toBe('future-timestamp');
  });

  it('holderName is null when the field is missing or non-string', () => {
    const r = resolveBladeburnerHold(JSON.stringify({ ts: T - 1000 }), T);
    expect(r.holderName).toBe(null);
  });

  it('respects injected maxAgeMs/futureToleranceMs', () => {
    expect(resolveBladeburnerHold(JSON.stringify({ ts: T - 100 }), T, 50).holdActive).toBe(false);
    expect(resolveBladeburnerHold(JSON.stringify({ ts: T + 100 }), T, 30_000, 50).holdActive).toBe(false);
  });
});
