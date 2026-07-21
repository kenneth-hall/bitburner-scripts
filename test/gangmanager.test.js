// Pure-function tests for Phase 29's gang manager (spec: S9). Every function
// under test is ns-free by design -- main() is thin plumbing around these,
// same split as daemon.js/scheduler.js.
//
// Phase 27's probe-machinery tests (evalPromotion state machine, probe
// fixtures, stat-growth cooldowns) are deleted along with the machinery
// they covered -- evalLadderMove (exact, Formulas-based) replaces
// evalPromotion entirely (S2, Prominent flag 1). This is an intended
// removal, not lost coverage.
import { describe, it, expect } from 'vitest';
import {
  TASK_LADDER,
  SINK_TASK,
  LADDER_VERSION,
  FRESH_RECRUIT_RUNG,
  ASCEND_MIN_FACTOR,
  ROOTKITS,
  MEMBER_AUGS,
  ROOTKIT_MONEY_FLOOR,
  MEMBER_AUG_MONEY_FLOOR,
  nextRecruitName,
  rebuildRungs,
  initBaseline,
  evalSink,
  evalLadderMove,
  evalAscension,
  planEquipmentBuys,
  planAssignments,
  appendGangLog,
  seedGangLog,
  buildGangState,
  GANG_LOG_MAX_ENTRIES,
} from '../src/gangmanager.js';

// The historical five-rung money ladder, kept here as a generic injectable-
// ladder fixture for planAssignments tests that don't care about the live
// ladder's specific task names -- only that rung -> task indexing works.
const FIXTURE_LADDER = ['Ransomware', 'Phishing', 'Identity Theft', 'Fraud & Counterfeiting', 'Money Laundering'];

// --- nextRecruitName -----------------------------------------------------

describe('nextRecruitName', () => {
  it('starts at nite-01 with no existing members', () => {
    expect(nextRecruitName([])).toBe('nite-01');
  });

  it('fills a gap deterministically', () => {
    expect(nextRecruitName(['nite-01', 'nite-03'])).toBe('nite-02');
  });

  it('advances past a collision to the next suffix', () => {
    expect(nextRecruitName(['nite-01', 'nite-02'])).toBe('nite-03');
  });

  it('ignores existing non-scheme names', () => {
    expect(nextRecruitName(['Bob', 'nite-01'])).toBe('nite-02');
  });
});

// --- TASK_LADDER / SINK_TASK shape (S1) -----------------------------------

describe('TASK_LADDER (S1)', () => {
  it('is the 8-rung respect-ordered ladder, sink at rung 0 (change deliberately, not by accident)', () => {
    expect(TASK_LADDER).toEqual(['Ethical Hacking', 'Ransomware', 'Phishing', 'Identity Theft', 'DDoS Attacks', 'Plant Virus', 'Money Laundering', 'Cyberterrorism']);
  });

  it('SINK_TASK is TASK_LADDER[0]', () => {
    expect(SINK_TASK).toBe(TASK_LADDER[0]);
  });
});

// --- rebuildRungs (S7) -----------------------------------------------------

describe('rebuildRungs', () => {
  it('a version-matched persisted rung wins on a name match (clamped)', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: 'Unassigned' }], { version: LADDER_VERSION, rungs: { 'nite-01': 3 } }, FIXTURE_LADDER);
    expect(rungs['nite-01']).toBe(3);
  });

  it('a persisted rung beyond the end of the ladder clamps to the top rung', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: SINK_TASK }], { version: LADDER_VERSION, rungs: { 'nite-01': 99 } }, FIXTURE_LADDER);
    expect(rungs['nite-01']).toBe(FIXTURE_LADDER.length - 1);
  });

  it('version mismatch discards persisted rungs entirely, even when the name matches', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: 'Unassigned' }], { version: 1, rungs: { 'nite-01': 3 } }, FIXTURE_LADDER);
    expect(rungs['nite-01']).toBe(FRESH_RECRUIT_RUNG); // falls through to the unknown-task default, not 3
  });

  it('no version at all (the pre-Phase-29 state file) is treated as a mismatch', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: 'Unassigned' }], { version: null, rungs: { 'nite-01': 2 } }, FIXTURE_LADDER);
    expect(rungs['nite-01']).toBe(FRESH_RECRUIT_RUNG);
  });

  it('a member on a known ladder task keeps that rung (task-match path)', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: 'Fraud & Counterfeiting' }], { version: LADDER_VERSION, rungs: {} }, FIXTURE_LADDER);
    expect(rungs['nite-01']).toBe(FIXTURE_LADDER.indexOf('Fraud & Counterfeiting'));
  });

  it('the live sink task maps to rung 0 via task-match', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: SINK_TASK }], { version: LADDER_VERSION, rungs: {} }, TASK_LADDER);
    expect(rungs['nite-01']).toBe(0);
  });

  it('"Unassigned" or an off-policy task falls back to FRESH_RECRUIT_RUNG, not 0 (S7 blocker 3 -- a fresh recruit should earn, not cool)', () => {
    const rungs = rebuildRungs(
      [
        { name: 'nite-01', task: 'Unassigned' },
        { name: 'nite-02', task: 'some-manual-task' },
      ],
      { version: LADDER_VERSION, rungs: {} },
      FIXTURE_LADDER
    );
    expect(rungs['nite-01']).toBe(FRESH_RECRUIT_RUNG);
    expect(rungs['nite-02']).toBe(FRESH_RECRUIT_RUNG);
    expect(FRESH_RECRUIT_RUNG).toBe(1);
  });

  it('a persisted name that no longer exists is simply absent from the result -- ignored, not an error', () => {
    const rungs = rebuildRungs([{ name: 'nite-01', task: 'Ransomware' }], { version: LADDER_VERSION, rungs: { 'nite-99': 4, 'nite-01': 2 } }, FIXTURE_LADDER);
    expect(rungs).toEqual({ 'nite-01': 2 });
  });
});

// --- initBaseline ------------------------------------------------------

describe('initBaseline', () => {
  it('a fresh gang (wantedLevel at the floor of 1) captures baseline with no rebaseline event', () => {
    const r = initBaseline({ wantedLevel: 1, wantedPenalty: 1, persisted: null });
    expect(r).toEqual({ baselineWantedLevel: 1, baselinePenalty: 1, event: null });
  });

  it('restores from persisted state verbatim, no event', () => {
    const r = initBaseline({ wantedLevel: 5, wantedPenalty: 0.8, persisted: { baselineWantedLevel: 1, baselinePenalty: 1 } });
    expect(r).toEqual({ baselineWantedLevel: 1, baselinePenalty: 1, event: null });
  });

  it('missing state on a non-fresh gang (wantedLevel above the floor) captures current + flags rebaseline', () => {
    const r = initBaseline({ wantedLevel: 8, wantedPenalty: 0.7, persisted: null });
    expect(r).toEqual({ baselineWantedLevel: 8, baselinePenalty: 0.7, event: 'rebaseline' });
  });
});

// --- evalSink (S4, unchanged from Phase 27) -------------------------------

describe('evalSink', () => {
  it('first tick (no baseline yet) captures the current reading, zero deviation, no event', () => {
    const r = evalSink({ wantedLevel: 3, wantedPenalty: 0.9, baselineWantedLevel: undefined, baselinePenalty: undefined, sinkMode: false });
    expect(r.baselineWantedLevel).toBe(3);
    expect(r.baselinePenalty).toBe(0.9);
    expect(r.deviation).toBe(0);
    expect(r.event).toBeNull();
  });

  it('enters sink mode at deviation >= 0.02, not at 0.019', () => {
    const below = evalSink({ wantedLevel: 5, wantedPenalty: 0.019, baselineWantedLevel: 1, baselinePenalty: 0, sinkMode: false });
    expect(below.sinkMode).toBe(false);
    expect(below.event).toBeNull();

    const at = evalSink({ wantedLevel: 5, wantedPenalty: 0.02, baselineWantedLevel: 1, baselinePenalty: 0, sinkMode: false });
    expect(at.sinkMode).toBe(true);
    expect(at.event).toBe('sink-enter');
  });

  it('exits sink mode at deviation <= 0.005, not at 0.006', () => {
    const sinkOn = { wantedLevel: 5, baselineWantedLevel: 1, baselinePenalty: 0, sinkMode: true };
    const above = evalSink({ ...sinkOn, wantedPenalty: 0.006 });
    expect(above.sinkMode).toBe(true);
    expect(above.event).toBeNull();

    const at = evalSink({ ...sinkOn, wantedPenalty: 0.005 });
    expect(at.sinkMode).toBe(false);
    expect(at.event).toBe('sink-exit');
  });

  it('a healthy series never flaps', () => {
    let sinkMode = false;
    for (let i = 0; i < 20; i++) {
      const r = evalSink({ wantedLevel: 1, wantedPenalty: 1 + (i % 2 === 0 ? 0.001 : -0.001), baselineWantedLevel: 1, baselinePenalty: 1, sinkMode });
      sinkMode = r.sinkMode;
      expect(r.event).toBeNull();
    }
  });

  it('baseline updates whenever wantedLevel is at or below the lowest ever seen, and not otherwise', () => {
    const lower = evalSink({ wantedLevel: 0.5, wantedPenalty: 0.95, baselineWantedLevel: 1, baselinePenalty: 1, sinkMode: false });
    expect(lower.baselineWantedLevel).toBe(0.5);
    expect(lower.baselinePenalty).toBe(0.95);

    const same = evalSink({ wantedLevel: 1, wantedPenalty: 0.6, baselineWantedLevel: 1, baselinePenalty: 0.5, sinkMode: false });
    expect(same.baselineWantedLevel).toBe(1);
    expect(same.baselinePenalty).toBe(0.6);

    const higher = evalSink({ wantedLevel: 2, wantedPenalty: 0.7, baselineWantedLevel: 1, baselinePenalty: 1, sinkMode: false });
    expect(higher.baselineWantedLevel).toBe(1);
    expect(higher.baselinePenalty).toBe(1);
  });

  it('multiplier-form baseline (~1): deviation is relative, finite', () => {
    const r = evalSink({ wantedLevel: 5, wantedPenalty: 1.1, baselineWantedLevel: 1, baselinePenalty: 1, sinkMode: false });
    expect(r.deviation).toBeCloseTo(0.1);
    expect(Number.isFinite(r.deviation)).toBe(true);
  });

  it('fraction-form baseline (0): deviation degrades to absolute, never NaN/Infinity', () => {
    const r = evalSink({ wantedLevel: 5, wantedPenalty: 0.05, baselineWantedLevel: 1, baselinePenalty: 0, sinkMode: false });
    expect(r.deviation).toBeCloseTo(0.05);
    expect(Number.isFinite(r.deviation)).toBe(true);
    expect(Number.isNaN(r.deviation)).toBe(false);
  });
});

// --- evalLadderMove (S2) -----------------------------------------------

function ladderMember(overrides = {}) {
  return {
    name: 'nite-01',
    rung: 1,
    top: 7,
    actualWantedGain: 0,
    respectAtRung: 1,
    respectAtPrevRung: null,
    respectAtNextRung: null,
    wantedAtRung: 0,
    wantedAtPrevRung: null,
    wantedAtNextRung: null,
    cooldownActive: false,
    ...overrides,
  };
}

describe('evalLadderMove', () => {
  it('suppressed -> no op regardless of member data', () => {
    const r = evalLadderMove({ suppressed: true, netWantedActual: 999, members: [ladderMember({ respectAtNextRung: 1000, respectAtRung: 1 })] });
    expect(r.op).toBeNull();
  });

  it('heat demote: picks the lowest marginal respect-per-heat member and sets its cooldown', () => {
    const a = ladderMember({ name: 'a', rung: 2, respectAtRung: 10, respectAtPrevRung: 8, wantedAtRung: 5, wantedAtPrevRung: 1 }); // deltaR=2, deltaW=4, ratio=0.5
    const b = ladderMember({ name: 'b', rung: 3, respectAtRung: 20, respectAtPrevRung: 15, wantedAtRung: 10, wantedAtPrevRung: 8 }); // deltaR=5, deltaW=2, ratio=2.5
    const r = evalLadderMove({ suppressed: false, netWantedActual: 1, members: [a, b] });
    expect(r).toMatchObject({ op: 'demote', name: 'a', rung: 1, reason: 'heat', setCooldown: true });
  });

  it('heat demote: a clamped-to-zero (or negative) marginal wanted delta ranks that member LAST, not NaN/Infinity', () => {
    // b's deltaW is 0 (clamped) -- the 1e-9 floor makes its ratio huge, so it must NOT be picked over a's finite, low ratio.
    const a = ladderMember({ name: 'a', rung: 1, respectAtRung: 2, respectAtPrevRung: 1, wantedAtRung: 1, wantedAtPrevRung: 0 }); // ratio = 1
    const b = ladderMember({ name: 'b', rung: 1, respectAtRung: 100, respectAtPrevRung: 1, wantedAtRung: 5, wantedAtPrevRung: 5 }); // deltaW=0 -> ratio huge
    const r = evalLadderMove({ suppressed: false, netWantedActual: 1, members: [a, b] });
    expect(r.name).toBe('a');
    expect(Number.isFinite(r.rung)).toBe(true);
  });

  it('rung-0 members are never heat-demoted further, and are not promote/efficiency-demote candidates either', () => {
    const rung0 = ladderMember({ name: 'a', rung: 0, respectAtRung: 5, respectAtPrevRung: null, respectAtNextRung: null, wantedAtRung: 1, wantedAtNextRung: null });
    const r = evalLadderMove({ suppressed: false, netWantedActual: 1, members: [rung0] });
    expect(r.op).toBeNull();
  });

  it('efficiency demote: fires when netWantedActual <= 0 and some rung no longer carries its stats, picks the largest gain', () => {
    const a = ladderMember({ name: 'a', rung: 2, respectAtRung: 5, respectAtPrevRung: 8 }); // gain 3
    const b = ladderMember({ name: 'b', rung: 3, respectAtRung: 10, respectAtPrevRung: 12 }); // gain 2
    const r = evalLadderMove({ suppressed: false, netWantedActual: 0, members: [a, b] });
    expect(r).toMatchObject({ op: 'demote', name: 'a', rung: 1, reason: 'efficiency', setCooldown: false });
  });

  it('promote: requires rung < top, no cooldown, respectAtNextRung > respectAtRung, and a non-positive projected budget; picks max respect gain', () => {
    const excludedByCooldown = ladderMember({ name: 'c', rung: 0, respectAtRung: 1, respectAtNextRung: 1000, wantedAtNextRung: 0.1, actualWantedGain: 0, cooldownActive: true });
    const a = ladderMember({ name: 'a', rung: 0, respectAtRung: 1, respectAtNextRung: 3, wantedAtNextRung: 0.2, actualWantedGain: 0.1 }); // gain 2, projected = -5-0.1+0.2 = -4.9
    const b = ladderMember({ name: 'b', rung: 0, respectAtRung: 1, respectAtNextRung: 5, wantedAtNextRung: 1, actualWantedGain: 0.1 }); // gain 4, projected = -5-0.1+1 = -4.1
    const r = evalLadderMove({ suppressed: false, netWantedActual: -5, members: [excludedByCooldown, a, b] });
    expect(r).toMatchObject({ op: 'promote', name: 'b', rung: 1, reason: null, setCooldown: false });
    expect(r.projectedNetWanted).toBeCloseTo(-4.1);
  });

  it('promote boundary: a projected budget landing exactly at 0 is allowed; just above 0 is not', () => {
    const atZero = ladderMember({ name: 'zero', rung: 0, respectAtRung: 1, respectAtNextRung: 2, wantedAtNextRung: 0, actualWantedGain: 0 });
    const allowed = evalLadderMove({ suppressed: false, netWantedActual: 0, members: [atZero] });
    expect(allowed.op).toBe('promote');

    const aboveZero = ladderMember({ name: 'above', rung: 0, respectAtRung: 1, respectAtNextRung: 2, wantedAtNextRung: 0.0001, actualWantedGain: 0 });
    const blocked = evalLadderMove({ suppressed: false, netWantedActual: 0, members: [aboveZero] });
    expect(blocked.op).toBeNull();
  });

  it('promote: top-rung members are never eligible', () => {
    const top = ladderMember({ name: 'a', rung: 7, top: 7, respectAtRung: 5, respectAtNextRung: null, actualWantedGain: 0 });
    const r = evalLadderMove({ suppressed: false, netWantedActual: -5, members: [top] });
    expect(r.op).toBeNull();
  });

  it('no eligible move of any kind -> op null', () => {
    const flat = ladderMember({ name: 'a', rung: 3, respectAtRung: 5, respectAtPrevRung: 5, respectAtNextRung: 5, wantedAtNextRung: 0, actualWantedGain: 0 });
    const r = evalLadderMove({ suppressed: false, netWantedActual: 0, members: [flat] });
    expect(r.op).toBeNull();
  });
});

// --- evalAscension (S3) -------------------------------------------------

describe('evalAscension', () => {
  it(`fires at factor >= ${ASCEND_MIN_FACTOR}, not at ${ASCEND_MIN_FACTOR - 0.01}`, () => {
    const below = evalAscension({ offMarker: false, cooldownTicksRemaining: 0, members: [{ name: 'a', previewHack: ASCEND_MIN_FACTOR - 0.01 }] });
    expect(below.op).toBeNull();

    const at = evalAscension({ offMarker: false, cooldownTicksRemaining: 0, members: [{ name: 'a', previewHack: ASCEND_MIN_FACTOR }] });
    expect(at.op).toBe('ascend');
    expect(at.name).toBe('a');
  });

  it('returns the rung-1 (FRESH_RECRUIT_RUNG) reset on ascend', () => {
    const r = evalAscension({ offMarker: false, cooldownTicksRemaining: 0, members: [{ name: 'a', previewHack: 2 }] });
    expect(r.rung).toBe(FRESH_RECRUIT_RUNG);
  });

  it('a positive cooldown enforces one ascension per window, regardless of eligibility', () => {
    const r = evalAscension({ offMarker: false, cooldownTicksRemaining: 5, members: [{ name: 'a', previewHack: 10 }] });
    expect(r.op).toBeNull();
  });

  it('a member with no preview (below the ascension floor) is silently skipped, not an error', () => {
    const r = evalAscension({
      offMarker: false,
      cooldownTicksRemaining: 0,
      members: [
        { name: 'below-floor', previewHack: null },
        { name: 'eligible', previewHack: 1.6 },
      ],
    });
    expect(r.op).toBe('ascend');
    expect(r.name).toBe('eligible');
  });

  it('among multiple eligible members, picks the highest preview factor', () => {
    const r = evalAscension({
      offMarker: false,
      cooldownTicksRemaining: 0,
      members: [
        { name: 'a', previewHack: 1.6 },
        { name: 'b', previewHack: 3.0 },
        { name: 'c', previewHack: 2.1 },
      ],
    });
    expect(r.name).toBe('b');
  });

  it('off-marker suppresses ascension entirely', () => {
    const r = evalAscension({ offMarker: true, cooldownTicksRemaining: 0, members: [{ name: 'a', previewHack: 10 }] });
    expect(r.op).toBeNull();
  });
});

// --- planEquipmentBuys (S5) ---------------------------------------------

// Default owns every rootkit already -- most fixtures here are aug-focused,
// and this keeps them isolated from the rootkit loop (an unowned item with
// no matching rootkitCosts entry would poison `remaining` with NaN). Tests
// that specifically exercise rootkit purchasing override upgrades: [].
function equipMember(overrides = {}) {
  return { name: 'nite-01', upgrades: [...ROOTKITS], augmentations: [], hackAscMult: 1, imminentAscension: false, ...overrides };
}

function flatCosts(items, cost) {
  const map = {};
  for (const item of items) map[item] = cost;
  return map;
}

describe('planEquipmentBuys', () => {
  it('buys every missing rootkit for a member while money clears cost + floor', () => {
    const rootkitCosts = flatCosts(ROOTKITS, 1e6);
    const money = ROOTKITS.length * 1e6 + ROOTKIT_MONEY_FLOOR + 1e6; // comfortably above every rootkit's floor gate
    const ops = planEquipmentBuys({ offMarker: false, money, members: [equipMember({ upgrades: [] })], rootkitCosts, memberAugCosts: {} });
    expect(ops.map((o) => o.item).sort()).toEqual([...ROOTKITS].sort());
    expect(ops.every((o) => o.class === 'rootkit')).toBe(true);
  });

  it('floor boundary is exact: remaining == cost + floor buys, remaining == cost + floor - 1 does not', () => {
    const item = ROOTKITS[0];
    const cost = 1e6;
    const rootkitCosts = flatCosts(ROOTKITS, cost);

    const atFloor = planEquipmentBuys({ offMarker: false, money: cost + ROOTKIT_MONEY_FLOOR, members: [equipMember({ upgrades: [] })], rootkitCosts, memberAugCosts: {} });
    expect(atFloor.some((o) => o.item === item)).toBe(true);

    const belowFloor = planEquipmentBuys({ offMarker: false, money: cost + ROOTKIT_MONEY_FLOOR - 1, members: [equipMember({ upgrades: [] })], rootkitCosts, memberAugCosts: {} });
    expect(belowFloor.some((o) => o.item === item)).toBe(false);
  });

  it('owned rootkits are never re-bought', () => {
    const rootkitCosts = flatCosts(ROOTKITS, 1e6);
    const money = ROOTKITS.length * 1e6 + ROOTKIT_MONEY_FLOOR + 1e6;
    const ops = planEquipmentBuys({ offMarker: false, money, members: [equipMember({ upgrades: [ROOTKITS[0]] })], rootkitCosts, memberAugCosts: {} });
    expect(ops.some((o) => o.item === ROOTKITS[0])).toBe(false);
  });

  it('a member about to ascend is skipped for rootkits, but not for member augs', () => {
    const rootkitCosts = flatCosts(ROOTKITS, 1e6);
    const memberAugCosts = flatCosts(MEMBER_AUGS, 1e6);
    const money = 100e9;
    const member = equipMember({ imminentAscension: true, hackAscMult: 1.5 }); // ascended at least once -> aug-eligible
    const ops = planEquipmentBuys({ offMarker: false, money, members: [member], rootkitCosts, memberAugCosts });
    expect(ops.some((o) => o.class === 'rootkit')).toBe(false);
    expect(ops.some((o) => o.class === 'aug')).toBe(true);
  });

  it('member augs are restricted to members who have ascended at least once (hackAscMult > 1)', () => {
    const memberAugCosts = flatCosts(MEMBER_AUGS, 1e6);
    const never = equipMember({ name: 'never', hackAscMult: 1 });
    const ascended = equipMember({ name: 'ascended', hackAscMult: 1.5 });
    const ops = planEquipmentBuys({ offMarker: false, money: 100e9, members: [never, ascended], rootkitCosts: {}, memberAugCosts });
    expect(ops.every((o) => o.name === 'ascended')).toBe(true);
  });

  it('member-aug staging is breadth-first: every eligible member gets tier k before anyone gets tier k+1', () => {
    const memberAugCosts = flatCosts(MEMBER_AUGS, 1e6);
    const a = equipMember({ name: 'a', hackAscMult: 1.5 });
    const b = equipMember({ name: 'b', hackAscMult: 1.5 });
    const ops = planEquipmentBuys({ offMarker: false, money: 100e9, members: [a, b], rootkitCosts: {}, memberAugCosts });
    const items = ops.map((o) => o.item);
    // tier 0 (MEMBER_AUGS[0]) for both members must appear before tier 1 (MEMBER_AUGS[1]) for either.
    const lastTier0 = items.lastIndexOf(MEMBER_AUGS[0]);
    const firstTier1 = items.indexOf(MEMBER_AUGS[1]);
    expect(lastTier0).toBeLessThan(firstTier1);
    expect(ops.filter((o) => o.item === MEMBER_AUGS[0])).toHaveLength(2);
  });

  it('owned member augs are never re-bought', () => {
    const memberAugCosts = flatCosts(MEMBER_AUGS, 1e6);
    const member = equipMember({ hackAscMult: 1.5, augmentations: [MEMBER_AUGS[0]] });
    const ops = planEquipmentBuys({ offMarker: false, money: 100e9, members: [member], rootkitCosts: {}, memberAugCosts });
    expect(ops.some((o) => o.item === MEMBER_AUGS[0])).toBe(false);
  });

  it('member-aug floor boundary is exact, same shape as the rootkit floor', () => {
    const item = MEMBER_AUGS[0];
    const cost = 1e6;
    const memberAugCosts = { [item]: cost };
    const member = equipMember({ hackAscMult: 1.5 });

    const atFloor = planEquipmentBuys({ offMarker: false, money: cost + MEMBER_AUG_MONEY_FLOOR, members: [member], rootkitCosts: {}, memberAugCosts });
    expect(atFloor.some((o) => o.item === item)).toBe(true);

    const belowFloor = planEquipmentBuys({ offMarker: false, money: cost + MEMBER_AUG_MONEY_FLOOR - 1, members: [member], rootkitCosts: {}, memberAugCosts });
    expect(belowFloor.some((o) => o.item === item)).toBe(false);
  });

  it('off-marker produces an empty op list regardless of money or eligibility', () => {
    const rootkitCosts = flatCosts(ROOTKITS, 1e6);
    const memberAugCosts = flatCosts(MEMBER_AUGS, 1e6);
    const ops = planEquipmentBuys({ offMarker: true, money: 1e12, members: [equipMember({ hackAscMult: 2 })], rootkitCosts, memberAugCosts });
    expect(ops).toEqual([]);
  });
});

// --- planAssignments -------------------------------------------------------

describe('planAssignments', () => {
  it('a fresh member with no recorded rung at all defaults to rung 0 (defensive fallback -- rebuildRungs/recruit always populate a real rung in practice)', () => {
    const ops = planAssignments({ members: [{ name: 'nite-01', task: 'Unassigned' }], rungs: {}, sinkMode: false, offMarker: false });
    expect(ops).toEqual([{ name: 'nite-01', task: TASK_LADDER[0] }]);
  });

  it('sink mode assigns SINK_TASK to every member', () => {
    const ops = planAssignments({
      members: [
        { name: 'nite-01', task: 'Money Laundering' },
        { name: 'nite-02', task: 'Phishing' },
      ],
      rungs: { 'nite-01': 6, 'nite-02': 2 },
      sinkMode: true,
      offMarker: false,
    });
    expect(ops).toEqual([
      { name: 'nite-01', task: SINK_TASK },
      { name: 'nite-02', task: SINK_TASK },
    ]);
  });

  it('sink-off resumes the remembered rung, not rung 0 (injectable ladder)', () => {
    const ops = planAssignments({
      members: [{ name: 'nite-01', task: SINK_TASK }],
      rungs: { 'nite-01': 3 },
      sinkMode: false,
      offMarker: false,
      ladder: FIXTURE_LADDER,
    });
    expect(ops).toEqual([{ name: 'nite-01', task: FIXTURE_LADDER[3] }]);
  });

  it('desired equal to current emits no op (live ladder)', () => {
    const ops = planAssignments({ members: [{ name: 'nite-01', task: 'Ransomware' }], rungs: { 'nite-01': TASK_LADDER.indexOf('Ransomware') }, sinkMode: false, offMarker: false });
    expect(ops).toEqual([]);
  });

  it('an "Unassigned"/off-policy member is reconciled to policy (injectable ladder)', () => {
    const ops = planAssignments({ members: [{ name: 'nite-01', task: 'Unassigned' }], rungs: { 'nite-01': 2 }, sinkMode: false, offMarker: false, ladder: FIXTURE_LADDER });
    expect(ops).toEqual([{ name: 'nite-01', task: FIXTURE_LADDER[2] }]);
  });

  it('off-marker set produces an empty op list regardless of state', () => {
    const ops = planAssignments({
      members: [{ name: 'nite-01', task: 'Unassigned' }],
      rungs: { 'nite-01': 2 },
      sinkMode: true,
      offMarker: true,
    });
    expect(ops).toEqual([]);
  });

  it('restart-during-sink fixture: persisted {sinkMode:true, rungs} keeps members on SINK_TASK and resumes rungs on exit', () => {
    const membersOnSink = [{ name: 'nite-01', task: SINK_TASK }];
    const stillSink = planAssignments({ members: membersOnSink, rungs: { 'nite-01': 4 }, sinkMode: true, offMarker: false, ladder: FIXTURE_LADDER });
    expect(stillSink).toEqual([]); // already on SINK_TASK -- restored state matches live, no redundant op

    const afterExit = planAssignments({ members: membersOnSink, rungs: { 'nite-01': 4 }, sinkMode: false, offMarker: false, ladder: FIXTURE_LADDER });
    expect(afterExit).toEqual([{ name: 'nite-01', task: FIXTURE_LADDER[4] }]); // resumes rung 4, not rung 0
  });
});

// --- appendGangLog (ring trim) -------------------------------------------

describe('appendGangLog', () => {
  it('caps at GANG_LOG_MAX_ENTRIES, keeping the newest', () => {
    let entries = [];
    for (let i = 0; i < GANG_LOG_MAX_ENTRIES + 10; i++) {
      entries = appendGangLog(entries, { i });
    }
    expect(entries).toHaveLength(GANG_LOG_MAX_ENTRIES);
    expect(entries[0].i).toBe(10);
    expect(entries[entries.length - 1].i).toBe(GANG_LOG_MAX_ENTRIES + 9);
  });

  it('no-ops (no trim) while under the cap', () => {
    let entries = [{ i: 0 }, { i: 1 }];
    entries = appendGangLog(entries, { i: 2 });
    expect(entries).toEqual([{ i: 0 }, { i: 1 }, { i: 2 }]);
  });
});

// --- seedGangLog (restart continuity) ------------------------------------

describe('seedGangLog', () => {
  it('restores a persisted array so history survives a restart', () => {
    const prior = [{ kind: 'ascend', name: 'nite-04' }, { kind: 'equip-buy', name: 'nite-04' }];
    expect(seedGangLog(JSON.stringify(prior))).toEqual(prior);
  });

  it('falls back to [] on missing/empty content', () => {
    expect(seedGangLog('')).toEqual([]);
    expect(seedGangLog(undefined)).toEqual([]);
    expect(seedGangLog(null)).toEqual([]);
  });

  it('falls back to [] on malformed JSON rather than throwing', () => {
    expect(seedGangLog('{not json')).toEqual([]);
  });

  it('falls back to [] when the parsed value is not an array', () => {
    expect(seedGangLog('{"kind":"ascend"}')).toEqual([]);
    expect(seedGangLog('42')).toEqual([]);
  });

  it('ring-trims an oversized persisted file to GANG_LOG_MAX_ENTRIES, keeping the newest', () => {
    const oversized = Array.from({ length: GANG_LOG_MAX_ENTRIES + 5 }, (_, i) => ({ i }));
    const seeded = seedGangLog(JSON.stringify(oversized));
    expect(seeded).toHaveLength(GANG_LOG_MAX_ENTRIES);
    expect(seeded[0].i).toBe(5);
    expect(seeded[seeded.length - 1].i).toBe(GANG_LOG_MAX_ENTRIES + 4);
  });

  it('seeded history then appends continuously via appendGangLog', () => {
    let entries = seedGangLog(JSON.stringify([{ kind: 'ascend' }]));
    entries = appendGangLog(entries, { kind: 'startup' });
    expect(entries).toEqual([{ kind: 'ascend' }, { kind: 'startup' }]);
  });
});

// --- buildGangState ----------------------------------------------------

describe('buildGangState', () => {
  it('assembles the snapshot shape from already-computed values, including the S8 additions', () => {
    const gangInfo = { respect: 10, respectGainRate: 0.1, moneyGainRate: 5, wantedLevel: 1, wantedPenalty: 1, territory: 0.143 };
    const state = buildGangState({
      now: 1000,
      gangInfo,
      sinkMode: false,
      baselineWantedLevel: 1,
      baselinePenalty: 1,
      bonusMs: 0,
      formulasAvailable: true,
      formulasSuspended: false,
      offMarker: false,
      netWantedRate: -0.05,
      members: [{ name: 'nite-01' }],
    });
    expect(state).toMatchObject({
      timestamp: 1000,
      respect: 10,
      wantedLevel: 1,
      sinkMode: false,
      territory: 0.143,
      memberCount: 1,
      formulasAvailable: true,
      formulasSuspended: false,
      offMarker: false,
      ladderVersion: LADDER_VERSION,
      netWantedRate: -0.05,
    });
  });
});
