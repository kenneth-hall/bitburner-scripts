// Unit tests for src/common.js's findPath: a BFS parent-chain walk generalized
// to take an explicit start host (default "home").
import { describe, it, expect } from 'vitest';
import { findPath } from '../src/common.js';

// A small adjacency map: home -- a -- b -- target, plus an isolated island.
const ADJACENCY = {
  home: ['a'],
  a: ['home', 'b'],
  b: ['a', 'target'],
  target: ['b'],
  island: [],
};

function makeMockNs(adjacency) {
  return {
    scan: (host) => adjacency[host] ?? [],
  };
}

describe('findPath', () => {
  it('walks from home by default, inclusive of both ends', () => {
    const ns = makeMockNs(ADJACENCY);
    expect(findPath(ns, 'target')).toEqual(['home', 'a', 'b', 'target']);
  });

  it('walks from an explicit non-home start', () => {
    const ns = makeMockNs(ADJACENCY);
    expect(findPath(ns, 'target', 'a')).toEqual(['a', 'b', 'target']);
  });

  it('returns [start] when start === target', () => {
    const ns = makeMockNs(ADJACENCY);
    expect(findPath(ns, 'b', 'b')).toEqual(['b']);
  });

  it('returns null when the target is unreachable', () => {
    const ns = makeMockNs(ADJACENCY);
    expect(findPath(ns, 'island', 'home')).toBeNull();
  });
});
