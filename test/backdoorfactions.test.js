// Unit tests for src/backdoorfactions.js's pure/testable pieces:
// classifyTarget (the four classification outcomes) and walkTo (the only
// pre-reset coverage the terminal-walk logic gets -- a wrong walk would
// otherwise ship green and only surface at the next reset).
import { describe, it, expect } from 'vitest';
import { classifyTarget, walkTo } from '../src/backdoorfactions.js';

describe('classifyTarget', () => {
  it('is done-backdoored once the backdoor is installed', () => {
    expect(
      classifyTarget({ backdoorInstalled: true, factionJoined: false, hackingLevel: 1, requiredLevel: 50, rooted: false })
    ).toBe('done-backdoored');
  });

  it('is done-backdoored even if the faction was also joined (backdoor check wins)', () => {
    expect(
      classifyTarget({ backdoorInstalled: true, factionJoined: true, hackingLevel: 1, requiredLevel: 50, rooted: false })
    ).toBe('done-backdoored');
  });

  it('is done-joined when the faction is joined but the backdoor is not installed', () => {
    expect(
      classifyTarget({ backdoorInstalled: false, factionJoined: true, hackingLevel: 1, requiredLevel: 50, rooted: false })
    ).toBe('done-joined');
  });

  it('is ready when hacking level suffices and the server is rooted', () => {
    expect(
      classifyTarget({ backdoorInstalled: false, factionJoined: false, hackingLevel: 100, requiredLevel: 50, rooted: true })
    ).toBe('ready');
  });

  it('is waiting when hacking level is insufficient, even if rooted', () => {
    expect(
      classifyTarget({ backdoorInstalled: false, factionJoined: false, hackingLevel: 10, requiredLevel: 50, rooted: true })
    ).toBe('waiting');
  });

  it('is waiting when not rooted, even if hacking level suffices', () => {
    expect(
      classifyTarget({ backdoorInstalled: false, factionJoined: false, hackingLevel: 100, requiredLevel: 50, rooted: false })
    ).toBe('waiting');
  });
});

describe('walkTo', () => {
  // Chain topology: home -- a -- b -- target.
  const ADJACENCY = {
    home: ['a'],
    a: ['home', 'b'],
    b: ['a', 'target'],
    target: ['b'],
  };

  function makeMockNs({ current, connectFails = new Set() }) {
    const calls = { connect: [] };
    return {
      calls,
      scan: (host) => ADJACENCY[host] ?? [],
      singularity: {
        getCurrentServer: () => current,
        connect: (host) => {
          calls.connect.push(host);
          return !connectFails.has(host);
        },
      },
    };
  }

  it('returns true with zero connect calls when already at the destination', () => {
    const ns = makeMockNs({ current: 'target' });
    expect(walkTo(ns, 'target')).toBe(true);
    expect(ns.calls.connect).toEqual([]);
  });

  it('connects once per path element after the first, in path order', () => {
    const ns = makeMockNs({ current: 'home' });
    expect(walkTo(ns, 'target')).toBe(true);
    expect(ns.calls.connect).toEqual(['a', 'b', 'target']);
  });

  it('stops and returns false the moment a connect call fails', () => {
    const ns = makeMockNs({ current: 'home', connectFails: new Set(['b']) });
    expect(walkTo(ns, 'target')).toBe(false);
    expect(ns.calls.connect).toEqual(['a', 'b']);
  });
});
