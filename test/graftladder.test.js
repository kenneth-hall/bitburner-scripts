import { describe, it, expect } from 'vitest';
import { resolvePlan } from '../src/graftladder.js';

// The whole reason this function exists: ns.grafting.getGraftableAugmentations() documents
// that it "does not check your current money and prerequisite augmentations", so the catalog
// graftrecon.js builds lists augs that cannot actually be grafted yet. An offline plan built
// from that list fails partway with money already spent on the augs before it.

const lookup = (table) => (name) => table[name] || [];

describe('resolvePlan', () => {
  it('passes through a list with no prerequisites, in order', () => {
    const out = resolvePlan(['A', 'B'], new Set(), new Set(['A', 'B']), lookup({}));
    expect(out.order).toEqual(['A', 'B']);
    expect(out.dropped).toEqual([]);
  });

  it('inserts a missing graftable prereq AHEAD of its dependent', () => {
    const out = resolvePlan(
      ['Graphene Bionic Arms Upgrade'],
      new Set(),
      new Set(['Graphene Bionic Arms Upgrade', 'Bionic Arms']),
      lookup({ 'Graphene Bionic Arms Upgrade': ['Bionic Arms'] }),
    );
    expect(out.order).toEqual(['Bionic Arms', 'Graphene Bionic Arms Upgrade']);
  });

  it('does not re-graft a prereq already owned', () => {
    const out = resolvePlan(
      ['Graphene Bionic Spine Upgrade'],
      new Set(['Bionic Spine']),
      new Set(['Graphene Bionic Spine Upgrade']),
      lookup({ 'Graphene Bionic Spine Upgrade': ['Bionic Spine'] }),
    );
    expect(out.order).toEqual(['Graphene Bionic Spine Upgrade']);
  });

  it('resolves a multi-level prereq chain depth-first', () => {
    const out = resolvePlan(
      ['C'],
      new Set(),
      new Set(['A', 'B', 'C']),
      lookup({ C: ['B'], B: ['A'] }),
    );
    expect(out.order).toEqual(['A', 'B', 'C']);
  });

  it('drops a dependent whose prereq is not graftable, rather than attempting it', () => {
    const out = resolvePlan(
      ['Needs Faction Aug'],
      new Set(),
      new Set(['Needs Faction Aug']),
      lookup({ 'Needs Faction Aug': ['Faction Only Aug'] }),
    );
    expect(out.order).toEqual([]);
    expect(out.dropped.map((d) => d.reason)).toContain('not-graftable');
    expect(out.dropped.some((d) => d.name === 'Needs Faction Aug')).toBe(true);
  });

  it('skips an aug already owned -- so a restart resumes instead of re-buying', () => {
    const out = resolvePlan(['A', 'B'], new Set(['A']), new Set(['A', 'B']), lookup({}));
    expect(out.order).toEqual(['B']);
    expect(out.dropped).toContainEqual({ name: 'A', reason: 'already-owned' });
  });

  it('never emits the same aug twice when two entries share a prereq', () => {
    const out = resolvePlan(
      ['X', 'Y'],
      new Set(),
      new Set(['X', 'Y', 'Shared']),
      lookup({ X: ['Shared'], Y: ['Shared'] }),
    );
    expect(out.order).toEqual(['Shared', 'X', 'Y']);
    expect(new Set(out.order).size).toBe(out.order.length);
  });

  it('terminates on a prereq cycle instead of recursing forever', () => {
    const out = resolvePlan(['A'], new Set(), new Set(['A', 'B']), lookup({ A: ['B'], B: ['A'] }));
    expect(out.order).toEqual([]);
    expect(out.dropped.some((d) => d.reason === 'prereq-cycle')).toBe(true);
  });

  it('tolerates a lookup returning undefined for an aug with no prereq record', () => {
    const out = resolvePlan(['A'], new Set(), new Set(['A']), () => undefined);
    expect(out.order).toEqual(['A']);
  });

  it('LIVE SHAPE 2026-08-19: the planned BN10 ladder against what we actually hold', () => {
    // Bionic Spine was grafted at the BN10 entry gate, so its Graphene upgrade is reachable
    // directly -- but the Arms/Legs upgrades are not, and a hardcoded plan would have tried
    // them anyway. SPTN-97 was in flight when the runner was written, so it is owned by then.
    const owned = new Set(['HemoRecirculator', 'Bionic Spine', 'SPTN-97 Gene Modification']);
    const graftable = new Set([
      'Graphene Bionic Spine Upgrade', 'Graphene Bionic Arms Upgrade',
      'Graphene Bionic Legs Upgrade', 'NEMEAN Subdermal Weave', 'Graphene Bone Lacings',
      'Bionic Arms', 'Bionic Legs',
    ]);
    const prereqs = {
      'Graphene Bionic Spine Upgrade': ['Bionic Spine'],
      'Graphene Bionic Arms Upgrade': ['Bionic Arms'],
      'Graphene Bionic Legs Upgrade': ['Bionic Legs'],
      'Graphene Bone Lacings': ['Bone Lacings'],
    };
    const out = resolvePlan(
      ['SPTN-97 Gene Modification', 'Graphene Bionic Spine Upgrade', 'Graphene Bionic Arms Upgrade',
        'Graphene Bionic Legs Upgrade', 'NEMEAN Subdermal Weave', 'Graphene Bone Lacings'],
      owned, graftable, lookup(prereqs),
    );
    expect(out.order).toEqual([
      'Graphene Bionic Spine Upgrade',
      'Bionic Arms', 'Graphene Bionic Arms Upgrade',
      'Bionic Legs', 'Graphene Bionic Legs Upgrade',
      'NEMEAN Subdermal Weave',
    ]);
    // Bone Lacings is not graftable here, so its Graphene upgrade is correctly unreachable
    expect(out.dropped.some((d) => d.name === 'Graphene Bone Lacings')).toBe(true);
  });
});
