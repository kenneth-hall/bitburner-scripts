// Unit tests for src/common.js's shared helpers (Phase 13 consolidation).
// Fake-ns style: plain objects exposing only the methods each helper touches,
// table-driven where useful -- no mocking framework, per house convention.
import { describe, it, expect } from 'vitest';
import { scanNetwork, findPath, findAllPaths, tprintTs, workerRamCosts } from '../src/common.js';
import { WORKER_SCRIPTS } from '../src/scheduler.js';

/** Builds a fake ns.scan(host) => neighbors[] over a plain adjacency map. */
function makeScanNs(adjacency) {
  return { scan: (host) => adjacency[host] ?? [] };
}

describe('scanNetwork', () => {
  it('walks a linear chain, excluding home', () => {
    const ns = makeScanNs({
      home: ['a'],
      a: ['home', 'b'],
      b: ['a', 'c'],
      c: ['b'],
    });
    expect(scanNetwork(ns)).toEqual(['a', 'b', 'c']);
  });

  it('walks a branching tree in BFS order', () => {
    const ns = makeScanNs({
      home: ['a', 'b'],
      a: ['home', 'c'],
      b: ['home', 'd'],
      c: ['a'],
      d: ['b'],
    });
    expect(scanNetwork(ns)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('terminates on a cycle back toward home (visited-set)', () => {
    const ns = makeScanNs({
      home: ['a'],
      a: ['home', 'b'],
      b: ['a', 'home'], // cycle back to home
    });
    expect(scanNetwork(ns)).toEqual(['a', 'b']);
  });

  it('returns [] for a lone-home network', () => {
    const ns = makeScanNs({ home: [] });
    expect(scanNetwork(ns)).toEqual([]);
  });
});

describe('findPath', () => {
  it('returns the multi-hop path home -> ... -> target, inclusive of both ends', () => {
    const ns = makeScanNs({
      home: ['a'],
      a: ['home', 'b'],
      b: ['a', 'target'],
      target: ['b'],
    });
    expect(findPath(ns, 'target')).toEqual(['home', 'a', 'b', 'target']);
  });

  it('returns ["home"] when the target is home itself', () => {
    const ns = makeScanNs({ home: ['a'] });
    expect(findPath(ns, 'home')).toEqual(['home']);
  });

  it('returns null for an unreachable target', () => {
    const ns = makeScanNs({ home: ['a'], a: ['home'] });
    expect(findPath(ns, 'nowhere')).toBeNull();
  });
});

describe('findAllPaths', () => {
  it('returns every discovered host\'s full path, including home itself', () => {
    const ns = makeScanNs({
      home: ['a', 'b'],
      a: ['home', 'c'],
      b: ['home'],
      c: ['a'],
    });
    const paths = findAllPaths(ns);
    expect(paths.get('home')).toEqual(['home']);
    expect(paths.get('a')).toEqual(['home', 'a']);
    expect(paths.get('b')).toEqual(['home', 'b']);
    expect(paths.get('c')).toEqual(['home', 'a', 'c']);
    expect(paths.size).toBe(4);
  });

  it('matches findPath\'s result for the same target', () => {
    const ns = makeScanNs({
      home: ['a'],
      a: ['home', 'b'],
      b: ['a', 'target'],
      target: ['b'],
    });
    expect(findAllPaths(ns).get('target')).toEqual(findPath(ns, 'target'));
  });

  it('returns just home for a lone-home network', () => {
    const ns = makeScanNs({ home: [] });
    const paths = findAllPaths(ns);
    expect(paths.size).toBe(1);
    expect(paths.get('home')).toEqual(['home']);
  });
});

describe('workerRamCosts', () => {
  it('returns exactly the three WORKER_SCRIPTS filenames as keys, mapped through getScriptRam -- no share key', () => {
    const ramByFile = { [WORKER_SCRIPTS.hack]: 1.7, [WORKER_SCRIPTS.grow]: 1.75, [WORKER_SCRIPTS.weaken]: 1.75, 'share.js': 4.0 };
    const ns = { getScriptRam: (file) => ramByFile[file] };
    const costs = workerRamCosts(ns);
    expect(Object.keys(costs).sort()).toEqual(Object.values(WORKER_SCRIPTS).sort());
    expect(costs[WORKER_SCRIPTS.hack]).toBe(1.7);
    expect(costs[WORKER_SCRIPTS.grow]).toBe(1.75);
    expect(costs[WORKER_SCRIPTS.weaken]).toBe(1.75);
  });
});

describe('tprintTs', () => {
  it('prefixes the message with a timestamp bracket, preserving the message verbatim', () => {
    const printed = [];
    const ns = { tprint: (msg) => printed.push(msg) };
    tprintTs(ns, 'INFO: something happened');
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatch(/^\[.+\] INFO: something happened$/);
  });
});
