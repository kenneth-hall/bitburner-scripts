/**
 * bn9entry.js -- Phase 43 WI-D: the slot-owning entry state machine for BN9. Takes the run
 * from "one unattended Hacknet Server, combat 1/1/1/1" to
 * joinBladeburnerDivision() === true, verified.
 *
 * STATE SEQUENCE (spec Sections 6-7): ASSESS -> LAUNCH_COMPANIONS -> PAUSE_AUGFARMER ->
 * CALIBRATE_GRIND -> (planner invoked with the measured rate) ->
 * GRAFTING | GRAFT_START | GRIND | JOIN -> DONE.
 *
 * LAUNCH_COMPANIONS/PAUSE_AUGFARMER/CALIBRATE_GRIND run ONCE, in order, as a bootstrap phase
 * before the main per-tick decision loop starts (decideEntryAction never needs to know about
 * them -- by the time it runs for real, companions are up, augfarmer is paused, and a real
 * grind rate is in hand). Every phase is restart-idempotent: a crash and re-launch re-derives
 * "already done" from live state (ns.scriptRunning, the slot-hold marker, a fresh calibration
 * run) rather than trusting an in-memory flag that died with the old process.
 *
 * decideEntryAction PRECEDENCE, strict order (spec Section 7): hold > join > replan > graft >
 * grind. grind is the SOLE fallthrough -- there is no idle state, since the gate is reachable
 * by grinding alone even at k=0 (graftmath.js's planGraftLadder always has a k=0 baseline).
 *
 * THE CENTRAL HAZARD (spec A3, carried from Phase 41's bn10entry.js precedent):
 * graftAugmentation() CANCELS THE CURRENT WORK and charges money UP FRONT. While
 * currentWork.type === "GRAFTING", this file issues NO work-cancelling call -- no re-issued
 * graftAugmentation, no commitCrime, no travelToCity, no slot release in ns.atExit. The `hold`
 * branch is how that prohibition is enforced: it outranks every other decision, including
 * `join`.
 *
 * SLOT OWNERSHIP (spec A2). Claims SLOT_HOLD_FILE and refreshes it every <=10s
 * (HOLD_REFRESH_MS), well inside the 30s SLOT_HOLD_MAX_AGE_MS every consumer fails open on
 * (augfarmer.js, backdoorfactions.js, bladeburnermanager.js). waitForOngoingGrafting() is
 * forbidden (it blocks, so it cannot refresh the hold) -- getCurrentWork() is polled on the
 * main loop cadence instead.
 *
 * PLANNER/EXECUTOR HANDSHAKE (spec Section 7): treats graftplanner.js as a request/response
 * pair. execStartMs recorded before ns.exec; polled via ns.scriptRunning every
 * PLANNER_POLL_MS; the resulting graft-plan.json is trusted ONLY if outRecord.ts >=
 * execStartMs (guards a stale read from an unrelated prior invocation); a 120s timeout retries
 * once (re-exec), a second timeout halts (bn9entry-hold.txt) and takes no further graft/replan
 * action until cleared by hand; a `{fatal: ...}` record is logged distinctly and never read for
 * `ladder`/`chosenK` (the absence of a ladder is handled safely by construction -- no
 * admissible candidate simply falls through to `grind`).
 *
 * PREFLIGHT RAIL (spec Section 7, the no-install rail, CLAUDE.md Section 12.2). ASSESS's first
 * action, repeated on every tick: ns.read("ratchet-mode.txt").trim() === "observe". Anything
 * else halts immediately (bn9entry-hold.txt), logs the observed value, and starts nothing --
 * grafting or grinding -- until cleared by hand. bn9entry.js itself never calls
 * installAugmentations anywhere in this file (verified by code review -- no such call exists).
 *
 * ASSUMPTIONS THIS FILE MAKES WHERE THE SPEC LEFT A GAP (flagged for the record, per
 * CLAUDE.md's "log dropped/filled gaps" convention):
 *   - WD2 requires "the entropy ceiling or money floor bind" as a grind-triggering rail, but
 *     Section 6/7's prose never pins BN9 numbers for either (unlike bn10entry.js's spec, which
 *     named MAX_ENTROPY=8 and MONEY_FLOOR=$50m explicitly). This file ports the SAME SHAPE from
 *     bn10entry.js's R1/R2 with BN9-appropriate values: MAX_ENTROPY=12 (comfortably above the
 *     converged k=11 ladder, spec Section 5.1) and MONEY_FLOOR=$50,000,000 (same floor
 *     bn10entry.js used, no BN9-specific reason to differ). No MAX_GRAFT_SPEND rail is ported --
 *     graftmath.js's own NODE_CONFIGS[9].maxSpend already bounds the beam search's total spend,
 *     and nothing in WD1-WD11 asks for a second, redundant spend ceiling here.
 *   - CALIBRATE_GRIND's "attempts >= 20" bound (spec Section 6) has no cheap live call for a
 *     real per-crime attempt count within this script's RAM budget (ns.getCrimeStats is
 *     itemized for the calibration FALLBACK path, not a live counter). This file approximates
 *     "attempts" as elapsed poll-ticks during calibration -- a coarse proxy, but the AND'd
 *     5-minute elapsed bound is the constraint that actually binds in practice (60s of 3s
 *     ticks reaches 20 "attempts" long before 5 minutes elapses), so the approximation does not
 *     change when calibration actually ends.
 *   - "already-on-crime + sync < syncThreshold" is left to sleevemanager.js's own WI-F decision
 *     (see that file) -- bn9entry.js makes zero ns.sleeve.* calls per spec Section 8's design.
 *
 * RAM budget (spec Section 9's table, gate <=34 GB): itemised in the spec; not measured here
 * (no running game in this implementation pass) -- verify live with `mem bn9entry.js`.
 *
 * IDENTIFIER HYGIENE: no local/property name here is `graft`, `work`, `exec`, `share`, `read`,
 * `write`, `kill`, `run`, `ls`, `ps`, `scan`, `hack`, `grow`, `tail`, `window`, `document`,
 * `process`, or any other real ns/DOM global name.
 *
 * ASCII-only (brand-new src/ file -- viteburner's new-file upload bug needs an ASCII wget seed).
 *
 * Usage: run bn9entry.js
 * Writes bn9entry-log.json (ring-capped), bn9entry-progress.json (grafted-so-far ladder
 * progress), bn9entry-lock.json (single-instance heartbeat), refreshes
 * bladeburner-slot-hold.json, and (on a preflight/handshake failure) bn9entry-hold.txt.
 * Stand down: there is no separate off-marker in this design -- kill the process (the same
 * mechanism `cli.mjs restart`/`kill` uses elsewhere in this repo); an in-flight graft is never
 * touched regardless of how the process exits, via ns.atExit's own currentWork check.
 */

import { recordTransaction } from "./translog.js";
import { resolveNodeConfig } from "./graftmath.js"; // zero-ns import (WC7) -- costs 0 GB

export const STATS = ["strength", "defense", "dexterity", "agility"];
export const TARGET_LEVEL = 100;
export const BIT_NODE = 9;

export const SLOT_HOLD_FILE = "bladeburner-slot-hold.json";
export const SLOT_HOLD_HOLDER_NAME = "bn9entry";
export const HOLD_REFRESH_MS = 10_000;
export const SLOT_HOLD_MAX_AGE_MS = 30_000; // matches augfarmer.js's own constant exactly
export const SLOT_HOLD_FUTURE_TOLERANCE_MS = 5_000; // matches augfarmer.js's own constant exactly

export const RATCHET_MODE_FILE = "ratchet-mode.txt";
export const REQUIRED_RATCHET_MODE = "observe";

export const HOLD_FILE = "bn9entry-hold.txt";
export const PLAN_FILE = "graft-plan.json";
export const PROGRESS_FILE = "bn9entry-progress.json";
export const LOCK_FILE = "bn9entry-lock.json";
export const LOG_FILE = "bn9entry-log.json";
export const LOG_RING_CAP = 1000;

export const LOCK_STALE_MS = 30_000; // matches the slot-hold convention

export const MAX_ENTROPY = 12; // assumption -- see header note
export const MONEY_FLOOR = 50_000_000; // assumption -- see header note

export const REPLAN_LEVEL_DELTA = 5;
export const REPLAN_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const REPLAN_RATE_DRIFT_FRACTION = 0.20;

export const CRIME_NAME = "Mug";
export const FOCUSED = true;

export const CALIBRATE_MIN_ATTEMPTS = 20;
export const CALIBRATE_MIN_ELAPSED_MS = 5 * 60 * 1000;
export const CALIBRATE_HARD_CAP_MS = 20 * 60 * 1000;

export const GRAFT_VERIFY_MS = 8_000;
export const JOIN_RETRY_CADENCE_MS = 5_000;

export const COMPANIONS_SCRIPT = "bn9companions.js";
export const AUGFARMER_PAUSE_FILE = "augfarmer-pause.txt";
export const AUGFARMER_HOLDER_NAME = "augfarmer";

export const PLANNER_SCRIPT = "graftplanner.js";
export const PLANNER_TIMEOUT_MS = 120_000;
export const PLANNER_POLL_MS = 2_000;

export const POLL_MS = 3_000;

const NEW_TOKYO = "New Tokyo"; // grafting clinic location -- sleeve-grafting-reference.md Section 7

// ---------------------------------------------------------------------------------------
// Pure core -- NO `ns` calls anywhere below this line until main(). Same rule as
// bn10entry.js's decideEntryAction: the live loop's job is to gather ctx and act on the
// returned decision, never to fold logic into the read/act split itself.
// ---------------------------------------------------------------------------------------

/** Pure. ns.read("ratchet-mode.txt")'s raw content must be EXACTLY "observe" (trimmed). */
export function isRatchetModeOk(raw) {
  return typeof raw === "string" && raw.trim() === REQUIRED_RATCHET_MODE;
}

/**
 * Pure (duplicated from augfarmer.js's resolveSlotHold rather than imported -- importing from
 * augfarmer.js would charge this file its ENTIRE ns footprint via the import-bleed pattern,
 * CLAUDE.md's documented failure class). Resolves SLOT_HOLD_FILE's raw content into a hold
 * verdict, failing OPEN on every malformed input.
 */
export function resolveSlotHold(raw, nowMs, maxAgeMs = SLOT_HOLD_MAX_AGE_MS, futureToleranceMs = SLOT_HOLD_FUTURE_TOLERANCE_MS) {
  if (!raw) return { holdActive: false, holdReason: "no-marker", holderName: null, holdAgeMs: null };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { holdActive: false, holdReason: "unparseable", holderName: null, holdAgeMs: null };
  }
  const ts = parsed?.ts;
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return { holdActive: false, holdReason: "no-timestamp", holderName: null, holdAgeMs: null };
  }
  const holderName = typeof parsed.holder === "string" ? parsed.holder : null;
  const holdAgeMs = nowMs - ts;
  if (holdAgeMs > maxAgeMs) return { holdActive: false, holdReason: "stale", holderName, holdAgeMs };
  if (ts - nowMs > futureToleranceMs) return { holdActive: false, holdReason: "future-timestamp", holderName, holdAgeMs };
  return { holdActive: true, holdReason: "held", holderName, holdAgeMs };
}

/** Pure. WD-CAL2: the calibration window's stated bounds -- attempts+elapsed AND, or a hard cap alone. */
export function isCalibrationComplete({ attempts, elapsedMs }) {
  if (elapsedMs >= CALIBRATE_HARD_CAP_MS) return true;
  return attempts >= CALIBRATE_MIN_ATTEMPTS && elapsedMs >= CALIBRATE_MIN_ELAPSED_MS;
}

/** Pure. Per-stat exp/sec from a before/after combat-exp snapshot over elapsedMs. */
export function computeGrindRatePerStat(expBefore, expAfter, elapsedMs) {
  const elapsedSec = elapsedMs / 1000;
  const rate = {};
  for (const stat of STATS) {
    const before = expBefore && typeof expBefore[stat] === "number" ? expBefore[stat] : 0;
    const after = expAfter && typeof expAfter[stat] === "number" ? expAfter[stat] : 0;
    rate[stat] = elapsedSec > 0 ? Math.max(0, (after - before) / elapsedSec) : 0;
  }
  return rate;
}

/**
 * Pure. Max fractional drift between a plan's recorded grind rate and a live-measured one.
 * Both may be a scalar (applied uniformly) or a per-stat CombatQuad. Returns null when there
 * is nothing comparable (missing/non-positive plan rate on every stat).
 */
export function computeRateDrift(planRate, liveRate) {
  const planPerStat = typeof planRate === "number" ? Object.fromEntries(STATS.map((s) => [s, planRate])) : planRate;
  const livePerStat = typeof liveRate === "number" ? Object.fromEntries(STATS.map((s) => [s, liveRate])) : liveRate;
  let maxDrift = null;
  for (const stat of STATS) {
    const p = planPerStat ? planPerStat[stat] : null;
    const l = livePerStat ? livePerStat[stat] : null;
    if (typeof p !== "number" || typeof l !== "number" || !(p > 0)) continue;
    const drift = Math.abs(l - p) / p;
    if (maxDrift === null || drift > maxDrift) maxDrift = drift;
  }
  return maxDrift;
}

/**
 * Pure. computeRailsOk from already-gathered live values (WD2's "entropy ceiling or money
 * floor bind" rails -- see header note on the BN9 numbers this file assumes).
 */
export function computeRailsOk({ entropy, money, nextStepPrice, singleInstanceHeld }) {
  const entropyOk = typeof entropy !== "number" || entropy < MAX_ENTROPY;
  const moneyFloorOk = nextStepPrice == null || (money - nextStepPrice) >= MONEY_FLOOR;
  const singleInstanceOk = !!singleInstanceHeld;
  return { entropy: entropyOk, moneyFloor: moneyFloorOk, singleInstance: singleInstanceOk };
}

/**
 * Pure. Five replan triggers (spec Section 7): a combat stat rose >= REPLAN_LEVEL_DELTA since
 * the plan was computed; money rose past a previously-unaffordable next-step price; entropy
 * differs from the plan's recorded value; plan age exceeds REPLAN_MAX_AGE_MS; grind-rate
 * drift exceeds REPLAN_RATE_DRIFT_FRACTION (20%) from the plan's recorded rate.
 */
export function computeReplanReason(ctx) {
  const { plan, combatLevels, money, entropy, nowMs, grindRatePerStat } = ctx;
  if (!plan) return "no-plan";

  for (const stat of STATS) {
    const before = plan.levels && typeof plan.levels[stat] === "number" ? plan.levels[stat] : null;
    const now = combatLevels ? combatLevels[stat] : null;
    if (before !== null && typeof now === "number" && now - before >= REPLAN_LEVEL_DELTA) {
      return "level-drift-" + stat;
    }
  }

  if (
    plan.nextStep &&
    typeof plan.nextStep.price === "number" &&
    typeof plan.moneyAvailable === "number" &&
    plan.moneyAvailable <= plan.nextStep.price &&
    typeof money === "number" &&
    money > plan.nextStep.price
  ) {
    return "money-crossed-next-step";
  }

  if (typeof plan.entropy === "number" && typeof entropy === "number" && plan.entropy !== entropy) {
    return "entropy-drift";
  }

  if (typeof plan.timestamp === "number" && typeof nowMs === "number" && nowMs - plan.timestamp > REPLAN_MAX_AGE_MS) {
    return "plan-stale";
  }

  if (grindRatePerStat != null && plan.grindRatePerStat != null) {
    const drift = computeRateDrift(plan.grindRatePerStat, grindRatePerStat);
    if (drift !== null && drift > REPLAN_RATE_DRIFT_FRACTION) {
      return "grind-rate-drift";
    }
  }

  return null;
}

/**
 * Pure. The decision core (spec Section 7). PRECEDENCE, strict order: hold > join > replan >
 * graft > grind. grind is the SOLE fallthrough (never idle).
 *
 * ctx:
 *   currentWork: {type: string, ...} | null
 *   combatLevels: {strength, defense, dexterity, agility}
 *   plan: {levels, entropy, moneyAvailable, timestamp, grindRatePerStat,
 *          nextStep: {name, price} | null} | null
 *   money, entropy, nowMs: numbers
 *   grindRatePerStat: number | CombatQuad | null -- the CURRENT live/calibrated rate
 *   railsOk: {entropy, moneyFloor, singleInstance}
 *
 * Returns {kind: "hold"|"join"|"replan"|"graft"|"grind", reason: string}.
 */
export function decideEntryAction(ctx) {
  const {
    currentWork = null,
    combatLevels,
    plan = null,
    money = 0,
    entropy = 0,
    nowMs = 0,
    grindRatePerStat = null,
    railsOk = {},
  } = ctx;

  // 1. hold -- outranks everything, including join (A3).
  if (currentWork && currentWork.type === "GRAFTING") {
    return { kind: "hold", reason: "graft-in-flight" };
  }

  // 2. join
  const allAtTarget = STATS.every((stat) => (combatLevels ? combatLevels[stat] : 0) >= TARGET_LEVEL);
  if (allAtTarget) {
    return { kind: "join", reason: "combat-gate-met" };
  }

  // 3. replan
  const replanReason = computeReplanReason({ plan, combatLevels, money, entropy, nowMs, grindRatePerStat });
  if (replanReason) {
    return { kind: "replan", reason: replanReason };
  }

  // 4. graft (only if a next step exists AND every rail passes)
  if (plan && plan.nextStep) {
    const entropyOk = railsOk.entropy !== false;
    const moneyFloorOk = railsOk.moneyFloor !== false;
    const singleInstanceOk = railsOk.singleInstance !== false;
    if (entropyOk && moneyFloorOk && singleInstanceOk) {
      return { kind: "graft", reason: "next-step-affordable" };
    }
    const blockedBy = !entropyOk ? "entropy-ceiling" : !moneyFloorOk ? "money-floor" : "single-instance-guard";
    return { kind: "grind", reason: "rails-blocked:" + blockedBy };
  }

  // 5. grind -- sole fallthrough.
  return { kind: "grind", reason: "no-admissible-step" };
}

/** Pure. Bounded retry cadence for joinBladeburnerDivision() attempts. */
export function shouldRetryJoin({ attempts = 0, lastAttemptMs = null, nowMs }, cadenceMs = JOIN_RETRY_CADENCE_MS) {
  if (attempts === 0 || lastAttemptMs === null) return true;
  return nowMs - lastAttemptMs >= cadenceMs;
}

/**
 * Pure. Classifies one joinBladeburnerDivision() attempt for logging. Success is decided by a
 * SUBSEQUENT getRank() not throwing, never by joinBladeburnerDivision()'s own boolean (WD6).
 */
export function classifyJoinAttempt({ threw, joinedBool, verified }) {
  if (threw) return "join-verify-threw";
  if (verified) return "join-verified";
  if (joinedBool) return "join-returned-true-unverified";
  return "join-returned-false";
}

/** Pure. Resolves the plan's next actionable step: the first ladder entry not yet grafted. */
export function resolveNextStep(plan, graftedNames) {
  if (!plan || !Array.isArray(plan.ladder)) return null;
  const done = new Set(graftedNames || []);
  for (const step of plan.ladder) {
    if (step && step.name && !done.has(step.name)) {
      return { name: step.name, price: step.price };
    }
  }
  return null;
}

/**
 * Pure (WD10). Evaluates one poll of the planner request/response handshake.
 *
 * ctx: {scriptRunning: bool, nowMs, execStartMs, timeoutMs, record: object|null (already
 *   read+parsed if scriptRunning is false), attemptNumber: 1|2}
 *
 * Returns one of: {status: "still-running"}, {status: "timeout-retry"},
 *   {status: "timeout-halt"}, {status: "no-record"}, {status: "fatal", message},
 *   {status: "stale-rejected"}, {status: "ok", record}.
 */
export function evaluatePlannerPoll({ scriptRunning, nowMs, execStartMs, timeoutMs, record, attemptNumber }) {
  if (scriptRunning) {
    if (nowMs - execStartMs >= timeoutMs) {
      return attemptNumber >= 2 ? { status: "timeout-halt" } : { status: "timeout-retry" };
    }
    return { status: "still-running" };
  }
  if (!record) return { status: "no-record" };
  if (record.fatal) return { status: "fatal", message: record.fatal };
  if (typeof record.ts !== "number" || record.ts < execStartMs) return { status: "stale-rejected" };
  return { status: "ok", record };
}

// ---------------------------------------------------------------------------------------
// Executor -- everything below touches `ns`. Kept thin around the pure core above.
// ---------------------------------------------------------------------------------------

function readJson(ns, file, fallback) {
  const raw = ns.read(file);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function appendRing(ns, file, record, cap) {
  const list = readJson(ns, file, []);
  list.push(record);
  const trimmed = list.length > cap ? list.slice(list.length - cap) : list;
  ns.write(file, JSON.stringify(trimmed, null, 2), "w");
}

function refreshSlotHold(ns) {
  ns.write(SLOT_HOLD_FILE, JSON.stringify({ ts: Date.now(), holder: SLOT_HOLD_HOLDER_NAME }), "w");
}

function refreshLock(ns) {
  ns.write(LOCK_FILE, JSON.stringify({ pid: ns.pid, ts: Date.now() }), "w");
}

function claimSingleInstance(ns) {
  const existing = readJson(ns, LOCK_FILE, null);
  const nowMs = Date.now();
  if (existing && typeof existing.pid === "number" && existing.pid !== ns.pid) {
    const fresh = typeof existing.ts === "number" && nowMs - existing.ts < LOCK_STALE_MS;
    if (fresh) return false;
  }
  refreshLock(ns);
  return true;
}

function writeHold(ns, record) {
  ns.write(HOLD_FILE, JSON.stringify({ ts: Date.now(), ...record }, null, 2), "w");
}

function readHold(ns) {
  return readJson(ns, HOLD_FILE, null);
}

function isHeld(ns) {
  return ns.fileExists(HOLD_FILE, "home");
}

function readGraftedNames(ns) {
  const progress = readJson(ns, PROGRESS_FILE, { graftedNames: [] });
  return Array.isArray(progress.graftedNames) ? progress.graftedNames : [];
}

function addGraftedName(ns, name) {
  const progress = readJson(ns, PROGRESS_FILE, { graftedNames: [] });
  const names = Array.isArray(progress.graftedNames) ? progress.graftedNames : [];
  if (!names.includes(name)) names.push(name);
  ns.write(PROGRESS_FILE, JSON.stringify({ graftedNames: names }, null, 2), "w");
}

function readCombatLevels(ns) {
  const player = ns.getPlayer();
  return {
    strength: player.skills.strength,
    defense: player.skills.defense,
    dexterity: player.skills.dexterity,
    agility: player.skills.agility,
  };
}

function readCombatExp(ns) {
  const player = ns.getPlayer();
  return {
    strength: player.exp.strength,
    defense: player.exp.defense,
    dexterity: player.exp.dexterity,
    agility: player.exp.agility,
  };
}

function readSleeveSnapshot(ns) {
  // WD-SL: informational only, read from sleeve-state.json (0 GB ns.read) -- NEVER a direct
  // ns.sleeve.* call. Absent/stale/malformed logs null rather than blocking.
  const state = readJson(ns, "sleeve-state.json", null);
  if (!state || !Array.isArray(state.sleeves) || state.sleeves.length === 0) return null;
  const first = state.sleeves[0];
  return { sync: first?.sync ?? null, task: first?.task ?? null, ts: state.ts ?? null };
}

function buildPlanCtx(ns) {
  const raw = readJson(ns, PLAN_FILE, null);
  if (!raw || !Array.isArray(raw.ladder)) return null;
  const graftedNames = readGraftedNames(ns);
  return {
    levels: raw.levels || null,
    entropy: typeof raw.entropy === "number" ? raw.entropy : null,
    moneyAvailable: typeof raw.moneyAvailable === "number" ? raw.moneyAvailable : null,
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : null,
    grindRatePerStat: raw.inputs && raw.inputs.grindRatePerStat != null ? raw.inputs.grindRatePerStat : null,
    ladder: raw.ladder,
    nextStep: resolveNextStep(raw, graftedNames),
  };
}

/** LAUNCH_COMPANIONS (spec: bn9entry.js's first real action, before PAUSE_AUGFARMER). */
export async function ensureCompanionsLaunched(ns, logEvent) {
  if (ns.scriptRunning(COMPANIONS_SCRIPT, "home")) return true;
  const pid = ns.exec(COMPANIONS_SCRIPT, "home", 1);
  logEvent("launch-companions", { pid });
  return pid !== 0;
}

/** PAUSE_AUGFARMER (spec: runs before any slot-claiming action). Returns true once verified released. */
export function pauseAugfarmerAndCheck(ns, logEvent) {
  ns.write(AUGFARMER_PAUSE_FILE, "1", "w");
  const holdInfo = resolveSlotHold(ns.read(SLOT_HOLD_FILE), Date.now());
  const releasedByAugfarmer = !(holdInfo.holdActive && holdInfo.holderName === AUGFARMER_HOLDER_NAME);
  logEvent("pause-augfarmer-check", { released: releasedByAugfarmer, holdInfo });
  return releasedByAugfarmer;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  if (!claimSingleInstance(ns)) {
    ns.tprint("bn9entry: ABORT -- another instance already holds " + LOCK_FILE);
    return;
  }

  ns.atExit(() => {
    let currentWorkRec = null;
    try { currentWorkRec = ns.singularity.getCurrentWork(); } catch { /* Singularity unavailable */ }
    if (!currentWorkRec || currentWorkRec.type !== "GRAFTING") {
      try { ns.rm(SLOT_HOLD_FILE, "home"); } catch { /* already gone */ }
      try { ns.rm(LOCK_FILE, "home"); } catch { /* already gone */ }
    }
  });

  const nodeConfig = resolveNodeConfig(BIT_NODE, {});

  let joinAttempts = 0;
  let lastJoinAttemptMs = null;

  // Bootstrap phase -- companions, then augfarmer pause, then calibration -- each idempotent
  // across a restart via live state, not an in-memory flag.
  let bootstrapPhase = "companions";
  let calibrationState = null; // {startMs, ticks, expBefore}
  let calibratedRate = null; // per-stat CombatQuad, once calibration completes
  let rateSource = "calibration-pending"; // WD-CAL3
  const rateSampleRing = []; // {ts, combatExp} for liveGrindRate re-refinement post-calibration

  let plannerHandshake = null; // {execStartMs, attemptNumber} while a planner run is outstanding

  const logEvent = (kind, detail) => {
    const nowMs = Date.now();
    const combatExp = readCombatExp(ns);
    const combatLevels = readCombatLevels(ns);
    const player = ns.getPlayer();
    let currentWork = null;
    try { currentWork = ns.singularity.getCurrentWork(); } catch { /* transient */ }
    appendRing(ns, LOG_FILE, {
      ts: nowMs, iso: new Date(nowMs).toISOString(),
      combatExp, combatLevels, money: player.money, entropy: player.entropy,
      currentWorkKind: currentWork ? currentWork.type : null,
      rateSource,
      sleeve: readSleeveSnapshot(ns),
      event: kind, detail: detail ?? null,
    }, LOG_RING_CAP);
  };

  while (true) {
    const nowMs = Date.now();

    // --- Preflight rail (repeated every tick, including every replan) -----------------
    const ratchetRaw = ns.read(RATCHET_MODE_FILE);
    if (!isRatchetModeOk(ratchetRaw)) {
      writeHold(ns, { reason: "ratchet-mode", observed: ratchetRaw, blockGrind: true, blockGraft: true });
      logEvent("preflight-halt", { observed: ratchetRaw });
      await ns.sleep(POLL_MS);
      continue;
    }

    const holdRecord = isHeld(ns) ? readHold(ns) : null;
    const blockGraft = !!holdRecord;
    const blockGrind = !!holdRecord && holdRecord.blockGrind === true;

    // --- Bootstrap phase: LAUNCH_COMPANIONS -> PAUSE_AUGFARMER -> CALIBRATE_GRIND -------
    if (bootstrapPhase === "companions") {
      const ok = await ensureCompanionsLaunched(ns, logEvent);
      if (ok) bootstrapPhase = "pause-augfarmer";
      refreshSlotHold(ns);
      refreshLock(ns);
      await ns.sleep(POLL_MS);
      continue;
    }

    if (bootstrapPhase === "pause-augfarmer") {
      const released = pauseAugfarmerAndCheck(ns, logEvent);
      if (released) bootstrapPhase = "calibrate";
      refreshSlotHold(ns);
      refreshLock(ns);
      await ns.sleep(POLL_MS);
      continue;
    }

    if (bootstrapPhase === "calibrate") {
      refreshSlotHold(ns);
      refreshLock(ns);

      let currentWork = null;
      try { currentWork = ns.singularity.getCurrentWork(); } catch { /* transient */ }

      if (!calibrationState) {
        calibrationState = { startMs: nowMs, ticks: 0, expBefore: readCombatExp(ns) };
      }
      calibrationState.ticks += 1;

      const alreadyCriming = currentWork && currentWork.type === "CRIME" && currentWork.crimeType === CRIME_NAME;
      if (!alreadyCriming && !blockGrind) {
        ns.singularity.commitCrime(CRIME_NAME, FOCUSED);
      }

      const elapsedMs = nowMs - calibrationState.startMs;
      if (isCalibrationComplete({ attempts: calibrationState.ticks, elapsedMs })) {
        const expAfter = readCombatExp(ns);
        calibratedRate = computeGrindRatePerStat(calibrationState.expBefore, expAfter, elapsedMs);
        rateSource = "calibrated";
        bootstrapPhase = "run";
        logEvent("calibration-complete", { calibratedRate, elapsedMs, ticks: calibrationState.ticks });
      }
      await ns.sleep(POLL_MS);
      continue;
    }

    // --- Main decision loop (bootstrapPhase === "run") ---------------------------------
    let currentWork = null;
    try {
      currentWork = ns.singularity.getCurrentWork();
    } catch (err) {
      ns.tprint("bn9entry: getCurrentWork threw (" + (err?.message ?? err) + ") -- retrying next poll");
      await ns.sleep(POLL_MS);
      continue;
    }

    const combatLevels = readCombatLevels(ns);
    const combatExp = readCombatExp(ns);
    rateSampleRing.push({ ts: nowMs, combatExp });
    if (rateSampleRing.length > 600) rateSampleRing.shift(); // bounded ring, ~30min at 3s polls

    const player = ns.getPlayer();
    const money = player.money;
    const entropy = player.entropy;

    // Live-refine the rate once enough fresh samples exist (liveGrindRate's own job in
    // graftmath.js is intentionally NOT imported here to keep this file's per-tick rate
    // source simple and inspectable -- a light local re-derivation over the same ring):
    let effectiveRate = calibratedRate;
    if (rateSampleRing.length >= 20) {
      const first = rateSampleRing[0];
      const last = rateSampleRing[rateSampleRing.length - 1];
      const windowElapsedMs = last.ts - first.ts;
      if (windowElapsedMs > 60_000) {
        effectiveRate = computeGrindRatePerStat(first.combatExp, last.combatExp, windowElapsedMs);
        rateSource = "live-refined";
      }
    }

    const planCtx = buildPlanCtx(ns);
    const railsOk = computeRailsOk({
      entropy,
      money,
      nextStepPrice: planCtx?.nextStep?.price ?? null,
      singleInstanceHeld: true,
    });

    const decision = decideEntryAction({
      currentWork, combatLevels, plan: planCtx, money, entropy, nowMs,
      grindRatePerStat: effectiveRate, railsOk,
    });

    let effectiveKind = decision.kind;
    if (decision.kind === "hold") {
      // never suppressed -- A3 outranks everything, including an active hold record.
    } else if (blockGraft && (decision.kind === "graft" || decision.kind === "replan")) {
      effectiveKind = "held-suppressed";
    } else if (blockGrind && decision.kind === "grind") {
      effectiveKind = "held-suppressed";
    }

    switch (effectiveKind) {
      case "hold": {
        refreshSlotHold(ns);
        refreshLock(ns);
        logEvent("hold");
        break;
      }

      case "held-suppressed": {
        logEvent("held-suppressed", decision);
        break;
      }

      case "join": {
        refreshSlotHold(ns);
        refreshLock(ns);
        if (!shouldRetryJoin({ attempts: joinAttempts, lastAttemptMs: lastJoinAttemptMs, nowMs })) {
          logEvent("join-retry-deferred");
          break;
        }
        joinAttempts += 1;
        lastJoinAttemptMs = nowMs;
        let joinedBool = false;
        try {
          joinedBool = ns.bladeburner.joinBladeburnerDivision();
        } catch (err) {
          logEvent("join-attempt-threw", String(err).slice(0, 200));
          break;
        }
        let threw = false;
        let verified = false;
        try {
          const rankAfter = ns.bladeburner.getRank();
          verified = typeof rankAfter === "number" && Number.isFinite(rankAfter);
        } catch {
          threw = true;
        }
        const classification = classifyJoinAttempt({ threw, joinedBool, verified });
        logEvent(classification);
        if (classification === "join-verified") {
          logEvent("done");
          try { ns.rm(SLOT_HOLD_FILE, "home"); } catch { /* already gone */ }
          try { ns.rm(LOCK_FILE, "home"); } catch { /* already gone */ }
          ns.tprint("bn9entry: DONE -- joinBladeburnerDivision() verified via getRank().");
          return;
        }
        break;
      }

      case "replan": {
        refreshSlotHold(ns);
        refreshLock(ns);
        if (!plannerHandshake) {
          const execStartMs = Date.now();
          ns.exec(PLANNER_SCRIPT, "home", 1, nodeConfig.maxSpend,
            ...(typeof effectiveRate === "number" ? [effectiveRate] : STATS.map((s) => effectiveRate?.[s] ?? nodeConfig.grindExpPerSec)));
          plannerHandshake = { execStartMs, attemptNumber: 1 };
          logEvent("planner-exec", { execStartMs, attemptNumber: 1 });
          break;
        }

        const scriptRunning = ns.scriptRunning(PLANNER_SCRIPT, "home");
        const record = scriptRunning ? null : readJson(ns, PLAN_FILE, null);
        const outcome = evaluatePlannerPoll({
          scriptRunning, nowMs, execStartMs: plannerHandshake.execStartMs,
          timeoutMs: PLANNER_TIMEOUT_MS, record, attemptNumber: plannerHandshake.attemptNumber,
        });

        if (outcome.status === "still-running") {
          break;
        }
        if (outcome.status === "timeout-retry") {
          logEvent("planner-timeout");
          const execStartMs = Date.now();
          ns.exec(PLANNER_SCRIPT, "home", 1, nodeConfig.maxSpend,
            ...(typeof effectiveRate === "number" ? [effectiveRate] : STATS.map((s) => effectiveRate?.[s] ?? nodeConfig.grindExpPerSec)));
          plannerHandshake = { execStartMs, attemptNumber: 2 };
          break;
        }
        if (outcome.status === "timeout-halt") {
          writeHold(ns, { reason: "planner-double-timeout", blockGrind: false, blockGraft: true });
          logEvent("planner-timeout-halt");
          plannerHandshake = null;
          break;
        }
        if (outcome.status === "fatal") {
          logEvent("planner-fatal", outcome.message);
          plannerHandshake = null;
          break;
        }
        if (outcome.status === "stale-rejected" || outcome.status === "no-record") {
          logEvent("planner-stale-or-missing", outcome.status);
          plannerHandshake = null;
          break;
        }
        // "ok"
        logEvent("planner-ok", { chosenK: outcome.record.chosenK, totalHours: outcome.record.totalHours });
        plannerHandshake = null;
        break;
      }

      case "graft": {
        refreshSlotHold(ns);
        refreshLock(ns);
        const step = planCtx.nextStep;
        const livePlayer = ns.getPlayer();
        if (livePlayer.city !== NEW_TOKYO) {
          const traveled = ns.singularity.travelToCity(NEW_TOKYO);
          logEvent("travel", traveled);
          break;
        }
        if (livePlayer.money - step.price < MONEY_FLOOR) {
          logEvent("graft-blocked-money-floor");
          break;
        }
        let graftBoolIgnored;
        try {
          graftBoolIgnored = ns.grafting.graftAugmentation(step.name, FOCUSED);
        } catch (err) {
          logEvent("graft-attempt-threw", String(err).slice(0, 200));
          break;
        }
        void graftBoolIgnored; // never trust the boolean
        let verifiedStart = false;
        let waited = 0;
        while (waited < GRAFT_VERIFY_MS) {
          await ns.sleep(1_000);
          waited += 1_000;
          refreshSlotHold(ns);
          let liveWork = null;
          try { liveWork = ns.singularity.getCurrentWork(); } catch { /* transient */ }
          if (liveWork && liveWork.type === "GRAFTING") { verifiedStart = true; break; }
        }
        if (verifiedStart) {
          recordTransaction(ns, {
            type: "expense",
            source: "graft",
            detail: step.name,
            amount: step.price,
            timestamp: Date.now(),
            time: new Date().toLocaleString(),
          });
          addGraftedName(ns, step.name);
          logEvent("graft-verified", step.name);
        } else {
          logEvent("graft-not-verified", step.name);
        }
        break;
      }

      case "grind": {
        refreshSlotHold(ns);
        refreshLock(ns);
        const alreadyCriming = currentWork && currentWork.type === "CRIME" && currentWork.crimeType === CRIME_NAME;
        if (!alreadyCriming) {
          ns.singularity.commitCrime(CRIME_NAME, FOCUSED);
          logEvent("grind-started");
        } else {
          logEvent("grind-adopted");
        }
        break;
      }

      default:
        logEvent("unknown-decision-kind");
        break;
    }

    await ns.sleep(POLL_MS);
  }
}
