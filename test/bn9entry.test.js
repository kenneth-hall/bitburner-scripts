// Pure-function tests for Phase 43 WI-D's bn9entry.js (spec acceptance criteria WD1-WD11,
// WD-CAL1-3, WD-SL). Mirrors bn10entry.test.js's style -- decideEntryAction and its
// supporting pure functions take NO `ns` calls, so every precedence branch and boundary is
// testable here without a live game.
import { describe, it, expect } from 'vitest';
import {
  decideEntryAction,
  computeReplanReason,
  computeRateDrift,
  computeRailsOk,
  resolveNextStep,
  shouldRetryJoin,
  classifyJoinAttempt,
  isRatchetModeOk,
  resolveSlotHold,
  isCalibrationComplete,
  computeGrindRatePerStat,
  evaluatePlannerPoll,
  ensureCompanionsLaunched,
  pauseAugfarmerAndCheck,
  STATS,
  TARGET_LEVEL,
  MAX_ENTROPY,
  MONEY_FLOOR,
  REPLAN_LEVEL_DELTA,
  REPLAN_MAX_AGE_MS,
  REPLAN_RATE_DRIFT_FRACTION,
  JOIN_RETRY_CADENCE_MS,
  CALIBRATE_MIN_ATTEMPTS,
  CALIBRATE_MIN_ELAPSED_MS,
  CALIBRATE_HARD_CAP_MS,
  PLANNER_TIMEOUT_MS,
  REQUIRED_RATCHET_MODE,
  SLOT_HOLD_MAX_AGE_MS,
  COMPANIONS_SCRIPT,
  AUGFARMER_PAUSE_FILE,
  SLOT_HOLD_FILE,
} from '../src/bn9entry.js';

function fullRailsOk() {
  return { entropy: true, moneyFloor: true, singleInstance: true };
}

function levelsAt(value) {
  return { strength: value, defense: value, dexterity: value, agility: value };
}

function freshPlan(overrides = {}) {
  return {
    levels: levelsAt(1),
    entropy: 0,
    moneyAvailable: 1_000_000,
    timestamp: 1_000_000,
    grindRatePerStat: 0.179,
    nextStep: { name: 'HemoRecirculator', price: 135_000_000 },
    ...overrides,
  };
}

describe('decideEntryAction -- WD1: hold precedence', () => {
  it('WD1: returns hold whenever a graft is in flight, outranking join -- exact case: stats cross 100 mid-graft', () => {
    const ctx = {
      currentWork: { type: 'GRAFTING', augName: 'Bionic Spine' },
      combatLevels: { strength: 101, defense: 100, dexterity: 130, agility: 150 },
      plan: freshPlan(),
      money: 5_000_000, entropy: 2, nowMs: 2_000_000,
      grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'hold', reason: 'graft-in-flight' });
  });

  it('does NOT return hold when currentWork is a non-GRAFTING type', () => {
    const ctx = {
      currentWork: { type: 'CRIME', crimeType: 'Mug' },
      combatLevels: levelsAt(50), plan: freshPlan(),
      money: 5_000_000, entropy: 0, nowMs: 1_000_000,
      grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx).kind).not.toBe('hold');
  });

  it('does NOT return hold when currentWork is null', () => {
    const ctx = {
      currentWork: null, combatLevels: levelsAt(50), plan: freshPlan(),
      money: 5_000_000, entropy: 0, nowMs: 1_000_000,
      grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx).kind).not.toBe('hold');
  });
});

describe('decideEntryAction -- join', () => {
  it('returns join once all four combat stats are >= 100', () => {
    const ctx = {
      currentWork: null, combatLevels: levelsAt(100), plan: freshPlan(),
      money: 0, entropy: 0, nowMs: 1_000_000, grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'join', reason: 'combat-gate-met' });
  });

  it('does not join while any single stat is under 100', () => {
    const ctx = {
      currentWork: null, combatLevels: { strength: 100, defense: 100, dexterity: 100, agility: 99.9 },
      plan: freshPlan(), money: 0, entropy: 0, nowMs: 1_000_000,
      grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx).kind).not.toBe('join');
  });
});

describe('decideEntryAction -- WD2: grind (never idle) when the entropy ceiling or money floor bind', () => {
  const boundaryCases = [
    ['entropy ceiling breached', { entropy: false, moneyFloor: true, singleInstance: true }],
    ['money floor breached', { entropy: true, moneyFloor: false, singleInstance: true }],
    ['single-instance guard failed', { entropy: true, moneyFloor: true, singleInstance: false }],
    ['every rail failed at once', { entropy: false, moneyFloor: false, singleInstance: false }],
  ];

  for (const [label, railsOk] of boundaryCases) {
    it('WD2: ' + label + ' -> grind, never idle', () => {
      const ctx = {
        currentWork: null, combatLevels: levelsAt(1), plan: freshPlan(),
        money: 5_000_000, entropy: 0, nowMs: freshPlan().timestamp,
        grindRatePerStat: 0.179, railsOk,
      };
      const decision = decideEntryAction(ctx);
      expect(decision.kind).toBe('grind');
      expect(decision.kind).not.toBe('idle');
    });
  }

  it('WD2 (via computeRailsOk boundaries): entropy gate fails at MAX_ENTROPY, not just above it', () => {
    const rails = computeRailsOk({ entropy: MAX_ENTROPY, money: 1_000_000_000, nextStepPrice: 1, singleInstanceHeld: true });
    expect(rails.entropy).toBe(false);
    const justUnder = computeRailsOk({ entropy: MAX_ENTROPY - 0.01, money: 1_000_000_000, nextStepPrice: 1, singleInstanceHeld: true });
    expect(justUnder.entropy).toBe(true);
  });

  it('WD2 (via computeRailsOk boundaries): money floor gate fails once spending the next step would breach MONEY_FLOOR', () => {
    const rails = computeRailsOk({ entropy: 0, money: MONEY_FLOOR + 99, nextStepPrice: 100, singleInstanceHeld: true });
    expect(rails.moneyFloor).toBe(false);
    const justOk = computeRailsOk({ entropy: 0, money: MONEY_FLOOR + 100, nextStepPrice: 100, singleInstanceHeld: true });
    expect(justOk.moneyFloor).toBe(true);
  });
});

describe('decideEntryAction / computeReplanReason -- WD3: each of the five replan triggers', () => {
  it('no-plan -- replan when no plan has ever been computed', () => {
    const ctx = {
      currentWork: null, combatLevels: levelsAt(1), plan: null,
      money: 0, entropy: 0, nowMs: 1_000_000, grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'replan', reason: 'no-plan' });
  });

  it('level-drift -- replan once a stat has risen >= REPLAN_LEVEL_DELTA since the plan snapshot', () => {
    const plan = freshPlan({ levels: levelsAt(1) });
    const atThreshold = { ...levelsAt(1) };
    atThreshold.strength = 1 + REPLAN_LEVEL_DELTA;
    const ctx = { plan, combatLevels: atThreshold, money: 0, entropy: 0, nowMs: plan.timestamp, grindRatePerStat: 0.179 };
    expect(computeReplanReason(ctx)).toBe('level-drift-strength');
  });

  it('money-crossed-next-step -- fires only on the RISE past a previously-unaffordable price', () => {
    const plan = freshPlan({ nextStep: { name: 'Bionic Spine', price: 500_000_000 }, moneyAvailable: 100_000_000 });
    const roseCtx = { plan, combatLevels: levelsAt(1), money: 600_000_000, entropy: 0, nowMs: plan.timestamp };
    expect(computeReplanReason(roseCtx)).toBe('money-crossed-next-step');
    const stillUnderCtx = { plan, combatLevels: levelsAt(1), money: 200_000_000, entropy: 0, nowMs: plan.timestamp };
    expect(computeReplanReason(stillUnderCtx)).toBeNull();
  });

  it('entropy-drift -- fires when live entropy differs from the plan\'s recorded value', () => {
    const plan = freshPlan({ entropy: 0 });
    const driftedCtx = { plan, combatLevels: levelsAt(1), money: 0, entropy: 1, nowMs: plan.timestamp };
    expect(computeReplanReason(driftedCtx)).toBe('entropy-drift');
  });

  it('plan-stale -- fires once plan age exceeds REPLAN_MAX_AGE_MS', () => {
    const plan = freshPlan({ timestamp: 1_000_000 });
    const staleCtx = { plan, combatLevels: levelsAt(1), money: 0, entropy: 0, nowMs: plan.timestamp + REPLAN_MAX_AGE_MS + 1 };
    expect(computeReplanReason(staleCtx)).toBe('plan-stale');
    const freshCtx = { plan, combatLevels: levelsAt(1), money: 0, entropy: 0, nowMs: plan.timestamp + REPLAN_MAX_AGE_MS - 1 };
    expect(computeReplanReason(freshCtx)).toBeNull();
  });

  it('grind-rate-drift -- fires once the live rate drifts more than REPLAN_RATE_DRIFT_FRACTION from the plan\'s recorded rate', () => {
    const plan = freshPlan({ grindRatePerStat: 0.179 });
    const driftedCtx = { plan, combatLevels: levelsAt(1), money: 0, entropy: 0, nowMs: plan.timestamp, grindRatePerStat: 0.179 * 1.3 };
    expect(computeReplanReason(driftedCtx)).toBe('grind-rate-drift');
    const withinBandCtx = { plan, combatLevels: levelsAt(1), money: 0, entropy: 0, nowMs: plan.timestamp, grindRatePerStat: 0.179 * 1.1 };
    expect(computeReplanReason(withinBandCtx)).toBeNull();
  });
});

describe('computeRateDrift', () => {
  it('handles scalar vs scalar', () => {
    expect(computeRateDrift(0.2, 0.24)).toBeCloseTo(0.2, 6);
  });
  it('handles scalar plan rate vs per-stat live rate', () => {
    const drift = computeRateDrift(0.2, { strength: 0.2, defense: 0.2, dexterity: 0.2, agility: 0.3 });
    expect(drift).toBeCloseTo(0.5, 6);
  });
  it('returns null when nothing is comparable', () => {
    expect(computeRateDrift(null, 0.2)).toBeNull();
    expect(computeRateDrift(0, 0.2)).toBeNull(); // non-positive plan rate is not comparable
  });
});

describe('decideEntryAction -- grind is the sole fallthrough (never idle)', () => {
  it('a plan with no admissible next step -> grind, never idle', () => {
    const ctx = {
      currentWork: null, combatLevels: levelsAt(1), plan: freshPlan({ nextStep: null }),
      money: 5_000_000, entropy: 0, nowMs: freshPlan().timestamp, grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    const decision = decideEntryAction(ctx);
    expect(decision.kind).toBe('grind');
  });

  it('a fresh plan, an admissible step, and every rail clear -> graft (grind is a fallthrough, not the default)', () => {
    const plan = freshPlan({ moneyAvailable: 500_000_000 });
    const ctx = {
      currentWork: null, combatLevels: levelsAt(1), plan,
      money: 500_000_000, entropy: 0, nowMs: plan.timestamp, grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'graft', reason: 'next-step-affordable' });
  });
});

describe('decideEntryAction -- full precedence order', () => {
  it('replan outranks graft even when a next step is affordable', () => {
    const stalePlan = freshPlan({ timestamp: 0 });
    const ctx = {
      currentWork: null, combatLevels: levelsAt(1), plan: stalePlan,
      money: 500_000_000, entropy: 0, nowMs: REPLAN_MAX_AGE_MS + 1, grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx).kind).toBe('replan');
  });

  it('join outranks replan (a stale plan does not block joining once the gate is met)', () => {
    const stalePlan = freshPlan({ timestamp: 0 });
    const ctx = {
      currentWork: null, combatLevels: levelsAt(100), plan: stalePlan,
      money: 0, entropy: 0, nowMs: REPLAN_MAX_AGE_MS + 1, grindRatePerStat: 0.179, railsOk: fullRailsOk(),
    };
    expect(decideEntryAction(ctx)).toEqual({ kind: 'join', reason: 'combat-gate-met' });
  });
});

describe('resolveNextStep', () => {
  it('returns the first ladder entry not yet grafted', () => {
    const plan = { ladder: [{ name: 'A', price: 1 }, { name: 'B', price: 2 }] };
    expect(resolveNextStep(plan, [])).toEqual({ name: 'A', price: 1 });
    expect(resolveNextStep(plan, ['A'])).toEqual({ name: 'B', price: 2 });
    expect(resolveNextStep(plan, ['A', 'B'])).toBeNull();
  });
});

describe('WD6: join verification -- success decided by getRank(), never the boolean', () => {
  it('shouldRetryJoin: bounded cadence', () => {
    expect(shouldRetryJoin({ attempts: 0, lastAttemptMs: null, nowMs: 1_000_000 })).toBe(true);
    const state = { attempts: 1, lastAttemptMs: 1_000_000, nowMs: 1_000_000 + JOIN_RETRY_CADENCE_MS - 1 };
    expect(shouldRetryJoin(state)).toBe(false);
    expect(shouldRetryJoin({ ...state, nowMs: 1_000_000 + JOIN_RETRY_CADENCE_MS })).toBe(true);
  });

  it('classifyJoinAttempt: verified (a subsequent getRank() succeeding) overrides a false boolean', () => {
    expect(classifyJoinAttempt({ threw: false, joinedBool: false, verified: true })).toBe('join-verified');
    expect(classifyJoinAttempt({ threw: true, joinedBool: true, verified: false })).toBe('join-verify-threw');
    expect(classifyJoinAttempt({ threw: false, joinedBool: false, verified: false })).toBe('join-returned-false');
  });
});

describe('WD9: the ratchet-mode preflight halts on any value other than "observe"', () => {
  it('exact match required', () => {
    expect(isRatchetModeOk(REQUIRED_RATCHET_MODE)).toBe(true);
    expect(isRatchetModeOk('observe ')).toBe(true); // trimmed
  });
  it('halts on "auto", empty, missing, or garbage', () => {
    for (const raw of ['auto', '', null, undefined, 'Observe', 'OBSERVE']) {
      expect(isRatchetModeOk(raw)).toBe(false);
    }
  });
});

describe('resolveSlotHold (duplicated from augfarmer.js, WD8)', () => {
  it('fails open on a missing marker', () => {
    expect(resolveSlotHold('', 1000).holdActive).toBe(false);
  });
  it('fails open on unparseable content', () => {
    expect(resolveSlotHold('not json', 1000).holdActive).toBe(false);
  });
  it('is active when fresh and holder matches', () => {
    const raw = JSON.stringify({ ts: 1000, holder: 'augfarmer' });
    const info = resolveSlotHold(raw, 1000 + 5000, SLOT_HOLD_MAX_AGE_MS);
    expect(info.holdActive).toBe(true);
    expect(info.holderName).toBe('augfarmer');
  });
  it('is inactive (stale) past SLOT_HOLD_MAX_AGE_MS', () => {
    const raw = JSON.stringify({ ts: 1000, holder: 'augfarmer' });
    const info = resolveSlotHold(raw, 1000 + SLOT_HOLD_MAX_AGE_MS + 1, SLOT_HOLD_MAX_AGE_MS);
    expect(info.holdActive).toBe(false);
    expect(info.holdReason).toBe('stale');
  });
});

describe('WD-CAL2: isCalibrationComplete\'s three boundaries', () => {
  it('attempts-only reached, elapsed too short -> not complete', () => {
    expect(isCalibrationComplete({ attempts: CALIBRATE_MIN_ATTEMPTS, elapsedMs: CALIBRATE_MIN_ELAPSED_MS - 1 })).toBe(false);
  });
  it('elapsed reached, attempts too few -> not complete', () => {
    expect(isCalibrationComplete({ attempts: CALIBRATE_MIN_ATTEMPTS - 1, elapsedMs: CALIBRATE_MIN_ELAPSED_MS })).toBe(false);
  });
  it('both reached -> complete', () => {
    expect(isCalibrationComplete({ attempts: CALIBRATE_MIN_ATTEMPTS, elapsedMs: CALIBRATE_MIN_ELAPSED_MS })).toBe(true);
  });
  it('hard cap alone -> complete regardless of attempt count', () => {
    expect(isCalibrationComplete({ attempts: 0, elapsedMs: CALIBRATE_HARD_CAP_MS })).toBe(true);
  });
  it('just under the hard cap, with insufficient attempts/elapsed otherwise -> not complete', () => {
    expect(isCalibrationComplete({ attempts: 0, elapsedMs: CALIBRATE_HARD_CAP_MS - 1 })).toBe(false);
  });
});

describe('computeGrindRatePerStat', () => {
  it('computes per-stat exp/sec from a before/after snapshot', () => {
    const before = { strength: 100, defense: 100, dexterity: 100, agility: 100 };
    const after = { strength: 200, defense: 150, dexterity: 100, agility: 100 };
    const rate = computeGrindRatePerStat(before, after, 10_000); // 10s
    expect(rate.strength).toBeCloseTo(10, 6);
    expect(rate.defense).toBeCloseTo(5, 6);
    expect(rate.dexterity).toBeCloseTo(0, 6);
  });
  it('never returns a negative rate', () => {
    const before = { strength: 200, defense: 0, dexterity: 0, agility: 0 };
    const after = { strength: 100, defense: 0, dexterity: 0, agility: 0 }; // "fell" -- shouldn't happen, clamp anyway
    const rate = computeGrindRatePerStat(before, after, 10_000);
    expect(rate.strength).toBe(0);
  });
});

describe('WD10: the planner handshake\'s four failure paths', () => {
  it('stale-plan rejection: a record with ts < execStartMs is rejected even though the script finished', () => {
    const outcome = evaluatePlannerPoll({
      scriptRunning: false, nowMs: 2000, execStartMs: 1000, timeoutMs: PLANNER_TIMEOUT_MS,
      record: { ts: 500, ladder: [] }, attemptNumber: 1,
    });
    expect(outcome.status).toBe('stale-rejected');
  });

  it('single timeout + retry: still running past the timeout on attempt 1 -> retry, not halt', () => {
    const outcome = evaluatePlannerPoll({
      scriptRunning: true, nowMs: 1000 + PLANNER_TIMEOUT_MS, execStartMs: 1000, timeoutMs: PLANNER_TIMEOUT_MS,
      record: null, attemptNumber: 1,
    });
    expect(outcome.status).toBe('timeout-retry');
  });

  it('double timeout: still running past the timeout on attempt 2 -> halt', () => {
    const outcome = evaluatePlannerPoll({
      scriptRunning: true, nowMs: 1000 + PLANNER_TIMEOUT_MS, execStartMs: 1000, timeoutMs: PLANNER_TIMEOUT_MS,
      record: null, attemptNumber: 2,
    });
    expect(outcome.status).toBe('timeout-halt');
  });

  it('fatal-record handling: a {fatal: ...} record is classified distinctly, never treated as ok', () => {
    const outcome = evaluatePlannerPoll({
      scriptRunning: false, nowMs: 2000, execStartMs: 1000, timeoutMs: PLANNER_TIMEOUT_MS,
      record: { ts: 1500, fatal: 'getGraftableAugmentations threw' }, attemptNumber: 1,
    });
    expect(outcome.status).toBe('fatal');
    expect(outcome.message).toMatch(/getGraftableAugmentations/);
  });

  it('a fresh, non-fatal record after finishing is "ok"', () => {
    const outcome = evaluatePlannerPoll({
      scriptRunning: false, nowMs: 2000, execStartMs: 1000, timeoutMs: PLANNER_TIMEOUT_MS,
      record: { ts: 1500, ladder: [], chosenK: 0 }, attemptNumber: 1,
    });
    expect(outcome.status).toBe('ok');
  });

  it('still running, before the timeout -> still-running (no action)', () => {
    const outcome = evaluatePlannerPoll({
      scriptRunning: true, nowMs: 1000 + PLANNER_TIMEOUT_MS - 1, execStartMs: 1000, timeoutMs: PLANNER_TIMEOUT_MS,
      record: null, attemptNumber: 1,
    });
    expect(outcome.status).toBe('still-running');
  });
});

describe('WD7: LAUNCH_COMPANIONS is idempotent via ns.scriptRunning', () => {
  function makeFakeNs({ running = false } = {}) {
    const execCalls = [];
    return {
      scriptRunning: (script) => (script === COMPANIONS_SCRIPT ? running : false),
      exec: (script, host, threads) => { execCalls.push({ script, host, threads }); return 7; },
      _execCalls: execCalls,
    };
  }

  it('execs bn9companions.js when not already running', async () => {
    const fakeNs = makeFakeNs({ running: false });
    const ok = await ensureCompanionsLaunched(fakeNs, () => {});
    expect(ok).toBe(true);
    expect(fakeNs._execCalls.length).toBe(1);
    expect(fakeNs._execCalls[0].script).toBe(COMPANIONS_SCRIPT);
  });

  it('does NOT exec again when already running -- a restart does not spawn a second copy', async () => {
    const fakeNs = makeFakeNs({ running: true });
    const ok = await ensureCompanionsLaunched(fakeNs, () => {});
    expect(ok).toBe(true);
    expect(fakeNs._execCalls.length).toBe(0);
  });
});

describe('WD8: PAUSE_AUGFARMER runs before any slot-claiming action; verifies actual release', () => {
  function makeFakeNs({ slotHoldRaw = '' } = {}) {
    const written = {};
    return {
      write: (file, content) => { written[file] = content; },
      read: (file) => (file === SLOT_HOLD_FILE ? slotHoldRaw : ''),
      _written: written,
    };
  }

  it('writes augfarmer-pause.txt every call (the marker augfarmer.js already honours)', () => {
    const fakeNs = makeFakeNs({});
    pauseAugfarmerAndCheck(fakeNs, () => {});
    expect(fakeNs._written[AUGFARMER_PAUSE_FILE]).toBeDefined();
  });

  it('reports NOT released while the slot hold is still held by augfarmer', () => {
    const fakeNs = makeFakeNs({ slotHoldRaw: JSON.stringify({ ts: Date.now(), holder: 'augfarmer' }) });
    const released = pauseAugfarmerAndCheck(fakeNs, () => {});
    expect(released).toBe(false);
  });

  it('reports released once the slot hold is absent (augfarmer actually stopped, not just told to)', () => {
    const fakeNs = makeFakeNs({ slotHoldRaw: '' });
    const released = pauseAugfarmerAndCheck(fakeNs, () => {});
    expect(released).toBe(true);
  });

  it('reports released once the slot hold is held by someone else (augfarmer specifically released it)', () => {
    const fakeNs = makeFakeNs({ slotHoldRaw: JSON.stringify({ ts: Date.now(), holder: 'bn9entry' }) });
    const released = pauseAugfarmerAndCheck(fakeNs, () => {});
    expect(released).toBe(true);
  });

  it('reports released once augfarmer\'s hold has gone stale (not merely that the marker file exists)', () => {
    const staleTs = Date.now() - SLOT_HOLD_MAX_AGE_MS - 1000;
    const fakeNs = makeFakeNs({ slotHoldRaw: JSON.stringify({ ts: staleTs, holder: 'augfarmer' }) });
    const released = pauseAugfarmerAndCheck(fakeNs, () => {});
    expect(released).toBe(true);
  });
});
