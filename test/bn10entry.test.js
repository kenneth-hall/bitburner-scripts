// Pure-function tests for Phase 41 WI3's bn10entry.js (phase-41-bn10-entry.spec.md's
// acceptance criteria C1-C3, C6). decideEntryAction takes NO `ns` calls -- same rule as
// Phase 40's decideInstall -- so every precedence branch and every replan/rail boundary is
// testable here without a live game.
import { describe, it, expect } from 'vitest';
import {
  decideEntryAction,
  computeReplanReason,
  computeRailsOk,
  resolveNextStep,
  shouldRetryJoin,
  classifyJoinAttempt,
  STATS,
  TARGET_LEVEL,
  MAX_ENTROPY,
  MAX_GRAFT_SPEND,
  MONEY_FLOOR,
  REPLAN_LEVEL_DELTA,
  REPLAN_MAX_AGE_MS,
  JOIN_RETRY_CADENCE_MS,
} from '../src/bn10entry.js';

function fullRailsOk() {
  return { entropy: true, spend: true, moneyFloor: true, singleInstance: true };
}

function levelsAt(value) {
  return { strength: value, defense: value, dexterity: value, agility: value };
}

function freshPlan(overrides = {}) {
  return {
    levels: levelsAt(74),
    entropy: 0,
    moneyAvailable: 1_000_000,
    timestamp: 1_000_000,
    nextStep: { name: 'HemoRecirculator', price: 135_000_000 },
    ...overrides,
  };
}

describe('decideEntryAction -- C1: hold precedence', () => {
  it('C1: returns hold whenever a graft is in flight, outranking join -- exact case: stats cross 100 mid-graft', () => {
    const ctx = {
      currentWork: { type: 'GRAFTING', augName: 'Bionic Spine' },
      combatLevels: { strength: 101, defense: 100, dexterity: 130, agility: 150 }, // ALL >= 100
      plan: freshPlan(),
      money: 5_000_000,
      entropy: 2,
      nowMs: 2_000_000,
      railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'hold', reason: 'graft-in-flight' });
  });

  it('does NOT return hold when currentWork is a non-GRAFTING type', () => {
    const ctx = {
      currentWork: { type: 'CRIME', crimeType: 'Mug' },
      combatLevels: levelsAt(50),
      plan: freshPlan(),
      money: 5_000_000, entropy: 0, nowMs: 1_000_000,
      railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx).kind).not.toBe('hold');
  });

  it('does NOT return hold when currentWork is null', () => {
    const ctx = {
      currentWork: null,
      combatLevels: levelsAt(50),
      plan: freshPlan(),
      money: 5_000_000, entropy: 0, nowMs: 1_000_000,
      railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx).kind).not.toBe('hold');
  });
});

describe('decideEntryAction -- join', () => {
  it('returns join once all four combat stats are >= 100', () => {
    const ctx = {
      currentWork: null,
      combatLevels: { strength: 100, defense: 100, dexterity: 100, agility: 100 },
      plan: freshPlan(),
      money: 0, entropy: 0, nowMs: 1_000_000,
      railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'join', reason: 'combat-gate-met' });
  });

  it('does not join while any single stat is under 100', () => {
    const ctx = {
      currentWork: null,
      combatLevels: { strength: 100, defense: 100, dexterity: 100, agility: 99.9 },
      plan: freshPlan(),
      money: 0, entropy: 0, nowMs: 1_000_000,
      railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx).kind).not.toBe('join');
  });
});

describe('decideEntryAction / computeReplanReason -- C3: each replan trigger', () => {
  it('C3: no-plan -- replan when no plan has ever been computed', () => {
    const ctx = {
      currentWork: null, combatLevels: levelsAt(50), plan: null,
      money: 0, entropy: 0, nowMs: 1_000_000, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'replan', reason: 'no-plan' });
  });

  it('C3: level-drift -- replan once a stat has risen >= REPLAN_LEVEL_DELTA since the plan snapshot', () => {
    const plan = freshPlan({ levels: levelsAt(74) });
    const justUnder = { ...levelsAt(74) };
    justUnder.strength = 74 + REPLAN_LEVEL_DELTA - 1;
    const atThreshold = { ...levelsAt(74) };
    atThreshold.strength = 74 + REPLAN_LEVEL_DELTA;

    const belowCtx = { currentWork: null, combatLevels: justUnder, plan, money: 0, entropy: 0, nowMs: plan.timestamp };
    expect(computeReplanReason(belowCtx)).toBeNull();

    const atCtx = { currentWork: null, combatLevels: atThreshold, plan, money: 0, entropy: 0, nowMs: plan.timestamp };
    expect(computeReplanReason(atCtx)).toBe('level-drift-strength');
    expect(decideEntryAction({ ...atCtx, railsOk: fullRailsOk() })).toEqual({ kind: 'replan', reason: 'level-drift-strength' });
  });

  it('C3: level-drift fires per-stat (each of the four stats independently trips it)', () => {
    for (const stat of STATS) {
      const plan = freshPlan({ levels: levelsAt(74) });
      const levels = levelsAt(74);
      levels[stat] = 74 + REPLAN_LEVEL_DELTA;
      const reason = computeReplanReason({ plan, combatLevels: levels, money: 0, entropy: 0, nowMs: plan.timestamp });
      expect(reason).toBe('level-drift-' + stat);
    }
  });

  it('C3: money-crossed-next-step -- fires only on the RISE past a previously-unaffordable price, never on a fall', () => {
    const plan = freshPlan({ nextStep: { name: 'Bionic Spine', price: 500_000_000 }, moneyAvailable: 100_000_000 });

    // Rise past the price: was unaffordable at plan time (100m <= 500m), now affordable.
    const roseCtx = { plan, combatLevels: levelsAt(74), money: 600_000_000, entropy: 0, nowMs: plan.timestamp };
    expect(computeReplanReason(roseCtx)).toBe('money-crossed-next-step');

    // Still under the price: no trigger.
    const stillUnderCtx = { plan, combatLevels: levelsAt(74), money: 200_000_000, entropy: 0, nowMs: plan.timestamp };
    expect(computeReplanReason(stillUnderCtx)).toBeNull();

    // Was ALREADY affordable at plan time -- a further rise must not re-trigger every poll
    // ("a fall cannot make a step admissible" implies the inverse must not spin either).
    const alreadyAffordablePlan = freshPlan({ nextStep: { name: 'Bionic Spine', price: 500_000_000 }, moneyAvailable: 900_000_000 });
    const stillRisingCtx = { plan: alreadyAffordablePlan, combatLevels: levelsAt(74), money: 950_000_000, entropy: 0, nowMs: alreadyAffordablePlan.timestamp };
    expect(computeReplanReason(stillRisingCtx)).toBeNull();
  });

  it('C3: entropy-drift -- fires when live entropy differs from the plan\'s recorded value', () => {
    const plan = freshPlan({ entropy: 0 });
    const driftedCtx = { plan, combatLevels: levelsAt(74), money: 0, entropy: 1, nowMs: plan.timestamp };
    expect(computeReplanReason(driftedCtx)).toBe('entropy-drift');

    const sameCtx = { plan, combatLevels: levelsAt(74), money: 0, entropy: 0, nowMs: plan.timestamp };
    expect(computeReplanReason(sameCtx)).toBeNull();
  });

  it('C3: plan-stale -- fires once plan age exceeds REPLAN_MAX_AGE_MS', () => {
    const plan = freshPlan({ timestamp: 1_000_000 });
    const freshCtx = { plan, combatLevels: levelsAt(74), money: 0, entropy: 0, nowMs: plan.timestamp + REPLAN_MAX_AGE_MS - 1 };
    expect(computeReplanReason(freshCtx)).toBeNull();

    const staleCtx = { plan, combatLevels: levelsAt(74), money: 0, entropy: 0, nowMs: plan.timestamp + REPLAN_MAX_AGE_MS + 1 };
    expect(computeReplanReason(staleCtx)).toBe('plan-stale');
  });
});

describe('decideEntryAction -- C2: grind is the ONLY fallthrough, never an idle state', () => {
  const boundaryCases = [
    ['entropy ceiling breached', { entropy: false, spend: true, moneyFloor: true, singleInstance: true }],
    ['spend ceiling breached', { entropy: true, spend: false, moneyFloor: true, singleInstance: true }],
    ['money floor breached', { entropy: true, spend: true, moneyFloor: false, singleInstance: true }],
    ['single-instance guard failed', { entropy: true, spend: true, moneyFloor: true, singleInstance: false }],
    ['every rail failed at once', { entropy: false, spend: false, moneyFloor: false, singleInstance: false }],
  ];

  for (const [label, railsOk] of boundaryCases) {
    it('C2: ' + label + ' -> grind, never idle', () => {
      const ctx = {
        currentWork: null,
        combatLevels: levelsAt(74), // below gate, so join/hold do not intervene
        plan: freshPlan(), // has a nextStep -- rails alone must block it
        money: 5_000_000, entropy: 0, nowMs: freshPlan().timestamp,
        railsOk,
      };
      const decision = decideEntryAction(ctx);
      expect(decision.kind).toBe('grind');
      expect(decision.kind).not.toBe('idle');
      expect(decision.kind).not.toBe('wait');
    });
  }

  it('C2: no plan at all -> replan (not grind) on THIS tick, but the very next tick with still no plan.nextStep resolves to grind, never idle', () => {
    // First tick: no plan yet -- replan is correctly ranked above grind (spec precedence).
    const noPlanCtx = {
      currentWork: null, combatLevels: levelsAt(74), plan: null,
      money: 5_000_000, entropy: 0, nowMs: 1_000_000, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(noPlanCtx).kind).toBe('replan');

    // A plan exists but has no admissible next step (ladder exhausted / nothing affordable
    // at planning time) -- graft cannot be chosen, so grind is the fallthrough, not idle.
    const exhaustedPlanCtx = {
      currentWork: null, combatLevels: levelsAt(74),
      plan: freshPlan({ nextStep: null }),
      money: 5_000_000, entropy: 0, nowMs: freshPlan().timestamp, railsOk: fullRailsOk(),
    };
    const decision = decideEntryAction(exhaustedPlanCtx);
    expect(decision.kind).toBe('grind');
  });

  it('C2: with a fresh plan, an admissible step, and every rail clear, the engine actually grafts (grind is a fallthrough, not the default)', () => {
    // moneyAvailable already covers the next step's price at plan-compute time, so the
    // money-crossed-next-step replan trigger does not fire and graft is reachable.
    const plan = freshPlan({ moneyAvailable: 500_000_000 });
    const ctx = {
      currentWork: null, combatLevels: levelsAt(74), plan,
      money: 500_000_000, entropy: 0, nowMs: plan.timestamp, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'graft', reason: 'next-step-affordable' });
  });
});

describe('decideEntryAction -- full precedence order (hold > join > replan > graft > grind)', () => {
  it('replan still outranks graft even when a next step is affordable', () => {
    const stalePlan = freshPlan({ timestamp: 0 });
    const ctx = {
      currentWork: null, combatLevels: levelsAt(74), plan: stalePlan,
      money: 500_000_000, entropy: 0, nowMs: REPLAN_MAX_AGE_MS + 1, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx).kind).toBe('replan');
  });

  it('join still outranks replan (a stale plan does not block joining once the gate is met)', () => {
    const stalePlan = freshPlan({ timestamp: 0 });
    const ctx = {
      currentWork: null, combatLevels: levelsAt(100), plan: stalePlan,
      money: 0, entropy: 0, nowMs: REPLAN_MAX_AGE_MS + 1, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'join', reason: 'combat-gate-met' });
  });
});

describe('computeRailsOk', () => {
  it('all four gates pass when entropy/spend/money/instance are all within bounds', () => {
    const rails = computeRailsOk({
      entropy: 0, cumulativeGraftSpend: 0, nextStepPrice: 100_000_000,
      money: 200_000_000, singleInstanceHeld: true,
    });
    expect(rails).toEqual({ entropy: true, spend: true, moneyFloor: true, singleInstance: true });
  });

  it('entropy gate fails at MAX_ENTROPY, not just above it', () => {
    const rails = computeRailsOk({
      entropy: MAX_ENTROPY, cumulativeGraftSpend: 0, nextStepPrice: 1,
      money: 1_000_000_000, singleInstanceHeld: true,
    });
    expect(rails.entropy).toBe(false);
  });

  it('spend gate fails once cumulative + next step would exceed MAX_GRAFT_SPEND', () => {
    const rails = computeRailsOk({
      entropy: 0, cumulativeGraftSpend: MAX_GRAFT_SPEND - 100, nextStepPrice: 200,
      money: 1_000_000_000, singleInstanceHeld: true,
    });
    expect(rails.spend).toBe(false);
  });

  it('money floor gate fails once spending the next step would breach MONEY_FLOOR', () => {
    const rails = computeRailsOk({
      entropy: 0, cumulativeGraftSpend: 0, nextStepPrice: 100,
      money: MONEY_FLOOR + 99, singleInstanceHeld: true,
    });
    expect(rails.moneyFloor).toBe(false);
  });

  it('single-instance gate fails when the caller did not (re)claim the lock', () => {
    const rails = computeRailsOk({
      entropy: 0, cumulativeGraftSpend: 0, nextStepPrice: 100,
      money: 1_000_000_000, singleInstanceHeld: false,
    });
    expect(rails.singleInstance).toBe(false);
  });
});

describe('resolveNextStep', () => {
  it('returns the first ladder entry not yet in the grafted-progress list', () => {
    const plan = { ladder: [{ name: 'A', price: 1 }, { name: 'B', price: 2 }, { name: 'C', price: 3 }] };
    expect(resolveNextStep(plan, [])).toEqual({ name: 'A', price: 1 });
    expect(resolveNextStep(plan, ['A'])).toEqual({ name: 'B', price: 2 });
    expect(resolveNextStep(plan, ['A', 'B'])).toEqual({ name: 'C', price: 3 });
    expect(resolveNextStep(plan, ['A', 'B', 'C'])).toBeNull();
  });

  it('returns null for a missing or malformed plan', () => {
    expect(resolveNextStep(null, [])).toBeNull();
    expect(resolveNextStep({}, [])).toBeNull();
  });
});

describe('C6: join retry cadence + distinct-from-thrown classification', () => {
  it('shouldRetryJoin: always true on the first attempt', () => {
    expect(shouldRetryJoin({ attempts: 0, lastAttemptMs: null, nowMs: 1_000_000 })).toBe(true);
  });

  it('shouldRetryJoin: bounded cadence -- false before JOIN_RETRY_CADENCE_MS has elapsed, true after', () => {
    const state = { attempts: 1, lastAttemptMs: 1_000_000, nowMs: 1_000_000 + JOIN_RETRY_CADENCE_MS - 1 };
    expect(shouldRetryJoin(state)).toBe(false);
    const later = { ...state, nowMs: 1_000_000 + JOIN_RETRY_CADENCE_MS };
    expect(shouldRetryJoin(later)).toBe(true);
  });

  it('classifyJoinAttempt: a THROWN verification call is classified distinctly from a returned false', () => {
    const threwCase = classifyJoinAttempt({ threw: true, joinedBool: false, verified: false });
    const falseCase = classifyJoinAttempt({ threw: false, joinedBool: false, verified: false });
    expect(threwCase).toBe('join-verify-threw');
    expect(falseCase).toBe('join-returned-false');
    expect(threwCase).not.toBe(falseCase);
  });

  it('classifyJoinAttempt: success is decided by `verified` (a subsequent getRank() succeeding), NOT by the joinedBool return value', () => {
    // joinBladeburnerDivision() returned false, but getRank() afterward did NOT throw --
    // i.e. we were actually already joined (or joined despite the false return). The boolean
    // must not override the real verification signal.
    const verifiedDespiteFalseBool = classifyJoinAttempt({ threw: false, joinedBool: false, verified: true });
    expect(verifiedDespiteFalseBool).toBe('join-verified');

    // joinBladeburnerDivision() returned true, but getRank() threw afterward -- NOT verified,
    // regardless of the boolean.
    const unverifiedDespiteTrueBool = classifyJoinAttempt({ threw: true, joinedBool: true, verified: false });
    expect(unverifiedDespiteTrueBool).toBe('join-verify-threw');
  });
});
