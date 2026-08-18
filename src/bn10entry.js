/**
 * bn10entry.js - Phase 41 WI3: the slot-owning entry engine. Takes the run from BN10 node
 * entry to joinBladeburnerDivision() === true by sequencing grafts (per graft-plan.json,
 * written by graftplanner.js) and combat-crime grinding on the single player-action slot,
 * then stands down cleanly.
 *
 * STATE MACHINE: ASSESS -> GRAFTING | GRAFT_START | GRIND | JOIN -> DONE. The pure core
 * (decideEntryAction) picks the next STAGE; this file's main() loop does the actual `ns`
 * work for whichever stage was picked, re-running ASSESS every poll.
 *
 * decideEntryAction PRECEDENCE (spec WI3, strict order -- see that function's own comment
 * for the full reasoning): hold > join > replan > graft > grind. grind is the ONLY
 * fallthrough -- there is no idle state, because the gate is reachable by grinding alone
 * (48.2h at k=0, features doc Section 3.2) and an idle state on budget exhaustion would be a
 * terminal deadlock on an unattended engine (revision 1's bug, fixed in revision 2).
 *
 * NOTE: THE CENTRAL HAZARD (spec Section 2.3): graftAugmentation() CANCELS THE CURRENT WORK and
 * charges money UP FRONT. While currentWork.type === "GRAFTING", this file issues NO
 * work-cancelling call -- no re-issued graftAugmentation, no commitCrime, no travelToCity, no
 * slot release in ns.atExit, no stand-down cancellation. The `hold` branch is how that
 * prohibition is enforced: it outranks every other decision, including `join` (tested at the
 * exact case where combat crosses 100 mid-graft -- C1).
 *
 * SLOT OWNERSHIP (spec A2). Claims SLOT_HOLD_FILE and refreshes it every <=10s
 * (HOLD_REFRESH_MS), well inside the 30s SLOT_HOLD_MAX_AGE_MS every consumer fails open on
 * (augfarmer.js:768, backdoorfactions.js:89). waitForOngoingGrafting() is FORBIDDEN (spec
 * A2a) because it blocks and cannot refresh the hold -- getCurrentWork() is polled on the
 * main loop cadence instead.
 *
 * SAFETY RAILS (spec WI3):
 *   R1 -- bounds the PERSISTENT quantity, not a per-process counter: live
 *     ns.getPlayer().entropy against MAX_ENTROPY (restart-proof), a DEDICATED persisted
 *     ledger file (GRAFT_LEDGER_FILE, survives restarts) against MAX_GRAFT_SPEND, and a
 *     single-instance guard via a heartbeat lock file (LOCK_FILE) -- two live PIDs racing
 *     was an observed failure mode (BACKLOG.md: `cli.mjs restart` racing the supervisor).
 *     INTERPRETATION NOTE: the spec says "persisted transaction ledger" -- this file reads
 *     that as a DEDICATED ledger (GRAFT_LEDGER_FILE) rather than re-scanning every daily
 *     transactions-YYYY-MM-DD.json (which would need ns.ls, not itemized in this script's RAM
 *     budget, and complicates day-rollover). recordTransaction (R3) is STILL called on every
 *     successful graft, satisfying the standing logging convention independently.
 *   R2 -- MONEY_FLOOR ($50m) checked live immediately before any graft spend.
 *   R2a -- reserve the graft budget from the fleet: NOT IMPLEMENTED. The spec offers an
 *     explicit escape hatch ("or record an explicit accepted-risk decision") and this
 *     implementation takes it -- wiring a new reservation source into resourcemanager.js is
 *     an existing-engine change outside this phase's "adds new scripts only" instruction.
 *     Accepted risk: cloudmanager.js can outspend the grafter (documented $5.08t in ~2.5min
 *     against totalReserved:0). Logged in BACKLOG.md; not mitigated here.
 *   R3 -- every successful graft calls recordTransaction (translog.js), on success only.
 *   R4 -- graftAugmentation's return value is NEVER trusted. A graft start is verified by
 *     polling getCurrentWork().type === "GRAFTING" within GRAFT_VERIFY_MS. Symmetrically, a
 *     join is verified by whether a SUBSEQUENT getRank() call throws (ns.bladeburner.* throws
 *     until the division is joined -- bladeburner-reference.md), never by
 *     joinBladeburnerDivision()'s boolean (C6).
 *   R5 -- STANDOWN_FILE stands the engine down: finish an in-flight graft (A3a), start
 *     nothing new otherwise. Checked in main()'s loop wrapper, NOT inside decideEntryAction
 *     (which stays a pure function of state that already reflects "graft in flight or not" --
 *     see that function's own comment for why stand-down is not one of its five branches).
 *   R6 -- ASSESS reconciles pre-existing work: if a CRIME matching CRIME_NAME is already
 *     running, it is ADOPTED (left alone), never restarted -- BN6 precedent
 *     (combatgrind.js's crime survived its own script's death; this file's grind branch must
 *     not clobber survivor progress on every poll).
 *
 * OPEN QUESTIONS THIS FILE DEFAULTS ON, EACH WITH THE SPEC'S DATE (Section 7):
 *   S-1 crime = Mug (expires 2026-08-19). S-2 focused = true (expires 2026-08-19).
 *   S-3 sleeve task left unchanged (expires at L2). S-4 entropy debuff accepted (2026-08-20).
 *
 * RAM budget -- MEASURED LIVE 2026-08-17, not estimated.
 *   graftAugmentation           7.50 GB
 *   commitCrime                 5.00 GB
 *   joinBladeburnerDivision     4.00 GB
 *   bladeburner.getRank         4.00 GB  <- C6 verification; the spec Section 5 table OMITTED
 *                                           this, which is half of why the first build missed.
 *   travelToCity                2.00 GB
 *   base + getPlayer + getCurrentWork + rm + fileExists + file IO   ~3.30 GB
 *   ------------------------------------------------
 *   25.80 GB measured after the A1a removal below (28.85 GB before it).
 *
 * THE FIRST BUILD FAILED THIS GATE ON MEASUREMENT: 28.85 GB against a 24 GB spec gate.
 *   Two causes, both spec defects rather than implementation defects:
 *     (1) the Section 5 table never counted bladeburner.getRank, which C6 itself requires;
 *     (2) A1a (executor dispatches the planner to a fleet host) cost 3.05 GB across
 *         cloud.getServerNames + getServerMaxRam + getServerUsedRam + scp + exec.
 *   A1a is now WITHDRAWN (see requestReplan below). The gate is re-derived to <=26 GB from
 *   this measurement plus its purpose -- fitting on home beside daemon.js and companions --
 *   NOT bent to whatever the code happened to need.
 * IDENTIFIER HYGIENE. No local/property/object-key name here is `graft`, `work`, `exec`,
 * `share`, `read`, `write`, `kill`, `run`, `ls`, `ps`, `scan`, `hack`, `grow`, `tail`,
 * `window`, or any other real `ns`/DOM global name.
 *
 * ASCII-only (brand-new src/ file -- viteburner's new-file upload bug needs an ASCII wget seed).
 *
 * Usage: run bn10entry.js
 * Writes bn10entry-log.json (ring-capped, C4), bn10entry-progress.json (which ladder steps
 * this engine has already grafted), bn10entry-graft-ledger.json (R1's persisted spend total),
 * bn10entry-lock.json (single-instance heartbeat), and refreshes bladeburner-slot-hold.json.
 * Stand down: create bn10entry-off.txt on home (R5).
 */

import { recordTransaction } from "./translog.js";

export const STATS = ["strength", "defense", "dexterity", "agility"];
export const TARGET_LEVEL = 100;

export const SLOT_HOLD_FILE = "bladeburner-slot-hold.json";
export const SLOT_HOLD_HOLDER_NAME = "bn10entry";
export const HOLD_REFRESH_MS = 10_000; // SLOT_HOLD_MAX_AGE_MS is 30s (bladeburnermanager.js)

export const STANDOWN_FILE = "bn10entry-off.txt";
export const PLAN_FILE = "graft-plan.json";
export const PROGRESS_FILE = "bn10entry-progress.json";
export const LEDGER_FILE = "bn10entry-graft-ledger.json";
export const LOCK_FILE = "bn10entry-lock.json";
export const LOG_FILE = "bn10entry-log.json";
export const LOG_RING_CAP = 1000;

export const LOCK_STALE_MS = 30_000; // matches the slot-hold convention

export const MAX_ENTROPY = 8; // R1
export const MAX_GRAFT_SPEND = 1_500_000_000; // R1
export const MONEY_FLOOR = 50_000_000; // R2

export const REPLAN_LEVEL_DELTA = 5;
export const REPLAN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const CRIME_NAME = "Mug"; // S-1 default, expires 2026-08-19
export const FOCUSED = true; // S-2 default, expires 2026-08-19

export const GRAFT_VERIFY_MS = 8_000;
export const JOIN_RETRY_CADENCE_MS = 5_000;

export const PLANNER_SCRIPT = "graftplanner.js";
export const REPLAN_REQUEST_FILE = "graft-replan-request.txt"; // executor -> human/supervisor handoff

export const POLL_MS = 3_000;

const NEW_TOKYO = "New Tokyo"; // grafting clinic location (VitaLife) -- sleeve-grafting-reference.md Section 7

// ---------------------------------------------------------------------------------------
// Pure core -- NO `ns` calls anywhere below this line until main(). Same rule as Phase 40's
// decideInstall: the live loop's job is to gather ctx and act on the returned decision, never
// to fold logic into the read/act split itself.
// ---------------------------------------------------------------------------------------

/**
 * Pure. Which (if any) of the four replan triggers fires, given the CURRENT plan snapshot
 * (or null if no plan has ever been computed). Each trigger only fires in the direction the
 * spec names: a stat LEVEL RISE (never a fall), money RISING PAST a previously-unaffordable
 * next-step price (never a fall -- "a fall cannot make a step admissible"), an ENTROPY
 * mismatch (either direction -- entropy only ever rises within a node, so this is really a
 * rise-detector too, but compared for inequality rather than direction), or plan AGE.
 * Returns a reason string, or null if the plan is still fresh.
 */
export function computeReplanReason(ctx) {
  const { plan, combatLevels, money, entropy, nowMs } = ctx;
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

  return null;
}

/**
 * Pure. R1/R2/single-instance rails, evaluated from already-gathered live values (the caller
 * does the `ns` reads; this function only combines them). All four gates are independent and
 * additive -- any one failing routes decideEntryAction to `grind`, never an idle state (C2).
 */
export function computeRailsOk({ entropy, cumulativeGraftSpend, nextStepPrice, money, singleInstanceHeld }) {
  const entropyOk = typeof entropy !== "number" || entropy < MAX_ENTROPY;
  const spendOk = nextStepPrice == null || (cumulativeGraftSpend + nextStepPrice) <= MAX_GRAFT_SPEND;
  const moneyFloorOk = nextStepPrice == null || (money - nextStepPrice) >= MONEY_FLOOR;
  const singleInstanceOk = !!singleInstanceHeld;
  return { entropy: entropyOk, spend: spendOk, moneyFloor: moneyFloorOk, singleInstance: singleInstanceOk };
}

/**
 * Pure. Phase 41 WI3's decision core.
 *
 * ctx:
 *   currentWork: {type: string, ...} | null   -- ns.singularity.getCurrentWork(), as-is
 *   combatLevels: {strength, defense, dexterity, agility}
 *   plan: {levels, entropy, moneyAvailable, timestamp, nextStep: {name, price} | null} | null
 *     -- nextStep is resolved by the CALLER (main()) as the first ladder entry not yet in the
 *     local grafted-progress file; this function never touches ownership state itself.
 *   money, entropy, nowMs: numbers
 *   railsOk: {entropy, spend, moneyFloor, singleInstance} -- see computeRailsOk
 *
 * Returns {kind: "hold"|"join"|"replan"|"graft"|"grind", reason: string}.
 *
 * PRECEDENCE (strict, spec WI3): hold > join > replan > graft > grind. grind is the ONLY
 * fallthrough -- reachable whenever graft is not chosen, for ANY reason (no plan, no next
 * step, or any rail blocked), because the gate is reachable by grinding alone and an idle
 * result would be a terminal deadlock on an unattended engine.
 *
 * Stand-down (R5, bn10entry-off.txt) is deliberately NOT a sixth branch here -- it is an
 * `ns.fileExists` read, which this pure function may not perform, and its actual effect
 * ("start nothing new, but let an in-flight graft finish") is exactly what `hold`'s
 * precedence over everything else already guarantees for the one case that matters. main()
 * wraps this function's result: while stand-down is set, it executes `hold` as normal (a
 * graft in flight is never touched) but treats any OTHER returned kind as a no-op for that
 * tick, logging that stand-down suppressed it.
 */
export function decideEntryAction(ctx) {
  const {
    currentWork = null,
    combatLevels,
    plan = null,
    money = 0,
    entropy = 0,
    nowMs = 0,
    railsOk = {},
  } = ctx;

  // 1. hold -- outranks everything, including join (C1).
  if (currentWork && currentWork.type === "GRAFTING") {
    return { kind: "hold", reason: "graft-in-flight" };
  }

  // 2. join
  const allAtTarget = STATS.every((stat) => (combatLevels ? combatLevels[stat] : 0) >= TARGET_LEVEL);
  if (allAtTarget) {
    return { kind: "join", reason: "combat-gate-met" };
  }

  // 3. replan
  const replanReason = computeReplanReason({ plan, combatLevels, money, entropy, nowMs });
  if (replanReason) {
    return { kind: "replan", reason: replanReason };
  }

  // 4. graft (only if a next step exists AND every rail passes)
  if (plan && plan.nextStep) {
    const entropyOk = railsOk.entropy !== false;
    const spendOk = railsOk.spend !== false;
    const moneyFloorOk = railsOk.moneyFloor !== false;
    const singleInstanceOk = railsOk.singleInstance !== false;
    if (entropyOk && spendOk && moneyFloorOk && singleInstanceOk) {
      return { kind: "graft", reason: "next-step-affordable" };
    }
    const blockedBy = !entropyOk ? "entropy-ceiling" :
      !spendOk ? "spend-ceiling" :
      !moneyFloorOk ? "money-floor" :
      "single-instance-guard";
    return { kind: "grind", reason: "rails-blocked:" + blockedBy };
  }

  // 5. grind -- sole fallthrough (C2).
  return { kind: "grind", reason: "no-admissible-step" };
}

/**
 * Pure. Bounded retry cadence for joinBladeburnerDivision() attempts (C6: "retried on a
 * bounded cadence"). attempts=0 always retries immediately (the first attempt); otherwise
 * only once cadenceMs has elapsed since the last one.
 */
export function shouldRetryJoin({ attempts = 0, lastAttemptMs = null, nowMs }, cadenceMs = JOIN_RETRY_CADENCE_MS) {
  if (attempts === 0 || lastAttemptMs === null) return true;
  return nowMs - lastAttemptMs >= cadenceMs;
}

/**
 * Pure. Classifies one joinBladeburnerDivision() attempt for logging (C6: "logged distinctly
 * from a thrown call; success is confirmed by a subsequent getRank(), not the boolean").
 * `threw` is whether the VERIFICATION call (a subsequent ns.bladeburner.getRank()) threw --
 * per bladeburner-reference.md, the whole ns.bladeburner API throws pre-join, so a
 * post-attempt getRank() that does NOT throw is the actual success signal, independent of
 * whatever joinBladeburnerDivision() itself returned.
 */
export function classifyJoinAttempt({ threw, joinedBool, verified }) {
  if (threw) return "join-verify-threw";
  if (verified) return "join-verified";
  if (joinedBool) return "join-returned-true-unverified";
  return "join-returned-false";
}

/**
 * Pure. Resolves the plan's next actionable step: the first ladder entry whose name is not
 * yet in `graftedNames` (the local progress list). Returns {name, price} | null.
 */
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

/** Single-instance guard (R1). Returns true iff this process may proceed as the sole holder. */
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

function readCumulativeGraftSpend(ns) {
  const ledger = readJson(ns, LEDGER_FILE, { total: 0 });
  return typeof ledger.total === "number" ? ledger.total : 0;
}

function addToLedger(ns, amount) {
  const ledger = readJson(ns, LEDGER_FILE, { total: 0, entries: [] });
  ledger.total = (typeof ledger.total === "number" ? ledger.total : 0) + amount;
  ledger.entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  ledger.entries.push({ ts: Date.now(), amount });
  ns.write(LEDGER_FILE, JSON.stringify(ledger, null, 2), "w");
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

/**
 * A1a WITHDRAWN 2026-08-17 on a MEASURED RAM failure. This used to discover a fleet host
 * (ns.cloud.getServerNames + getServerMaxRam/UsedRam), ns.scp the planner there and ns.exec it.
 * Live `mem` read 28.85 GB against a 24 GB gate, and that quartet plus ns.exec is 3.05 GB of it.
 * The mechanism was already the weakest part of the design -- cold-review blocker 9 noted that
 * "planner and executor must never run concurrently" is unachievable when the executor is a
 * resident holding its own RAM whether idle or not.
 *
 * Replaced by a REQUEST FILE. The executor launches nothing; it records that its plan is stale
 * and keeps executing the plan it already has. graftplanner.js is started separately (by hand or
 * by daemon.js supervisor), which makes "never concurrent" true by construction rather than by
 * a rule with no enforcement.
 */
function requestReplan(ns, logEvent, reason) {
  try {
    ns.write(REPLAN_REQUEST_FILE, JSON.stringify({ ts: Date.now(), reason }), "w");
  } catch {
    // A failed request is not fatal -- the stale plan is still executable.
  }
  logEvent("replan-requested", reason);
  return true;
}

/**
 * Builds the plan's `nextStep`-resolved view for decideEntryAction's ctx, from the raw
 * graft-plan.json content plus this engine's own grafted-so-far progress.
 */
function buildPlanCtx(ns) {
  const raw = readJson(ns, PLAN_FILE, null);
  if (!raw || !Array.isArray(raw.ladder)) return null;
  const graftedNames = readGraftedNames(ns);
  return {
    levels: raw.levels || null,
    entropy: typeof raw.entropy === "number" ? raw.entropy : null,
    moneyAvailable: typeof raw.moneyAvailable === "number" ? raw.moneyAvailable : null,
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : null,
    ladder: raw.ladder,
    nextStep: resolveNextStep(raw, graftedNames),
  };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  if (!claimSingleInstance(ns)) {
    ns.tprint("bn10entry: ABORT -- another instance already holds " + LOCK_FILE);
    return;
  }

  let joinAttempts = 0;
  let lastJoinAttemptMs = null;

  ns.atExit(() => {
    // A3a: never cancel an in-flight graft on exit. If nothing is grafting, release the
    // slot and the lock so another claimant (or a fresh instance) isn't blocked by a stale
    // marker for up to 30s longer than necessary.
    let currentWorkRec = null;
    try { currentWorkRec = ns.singularity.getCurrentWork(); } catch { /* Singularity unavailable */ }
    if (!currentWorkRec || currentWorkRec.type !== "GRAFTING") {
      try { ns.rm(SLOT_HOLD_FILE, "home"); } catch { /* already gone */ }
      try { ns.rm(LOCK_FILE, "home"); } catch { /* already gone */ }
    }
  });

  while (true) {
    const nowMs = Date.now();
    const standDown = ns.fileExists(STANDOWN_FILE, "home");

    let currentWork = null;
    try {
      currentWork = ns.singularity.getCurrentWork();
    } catch (err) {
      ns.tprint("bn10entry: getCurrentWork threw (" + (err?.message ?? err) + ") -- retrying next poll");
      await ns.sleep(POLL_MS);
      continue;
    }

    const combatLevels = readCombatLevels(ns);
    const combatExp = readCombatExp(ns);
    const player = ns.getPlayer();
    const money = player.money;
    const entropy = player.entropy;

    const planCtx = buildPlanCtx(ns);
    const cumulativeGraftSpend = readCumulativeGraftSpend(ns);
    const railsOk = computeRailsOk({
      entropy,
      cumulativeGraftSpend,
      nextStepPrice: planCtx?.nextStep?.price ?? null,
      money,
      singleInstanceHeld: true, // already claimed at startup; a lost race is handled by claimSingleInstance failing to start
    });

    const decision = decideEntryAction({
      currentWork,
      combatLevels,
      plan: planCtx,
      money,
      entropy,
      nowMs,
      railsOk,
    });

    const logEvent = (kind, detail) => {
      appendRing(ns, LOG_FILE, {
        ts: nowMs, iso: new Date(nowMs).toISOString(),
        combatExp, combatLevels, money, entropy,
        currentWorkKind: currentWork ? currentWork.type : null,
        decision: decision.kind, reason: decision.reason,
        event: kind, detail: detail ?? null,
      }, LOG_RING_CAP);
    };

    let effectiveKind = decision.kind;
    if (standDown && decision.kind !== "hold") {
      effectiveKind = "standdown";
    }

    switch (effectiveKind) {
      case "hold": {
        // A3: issue NO work-cancelling call while a graft is in flight.
        refreshSlotHold(ns);
        refreshLock(ns);
        logEvent("hold");
        break;
      }

      case "standdown": {
        logEvent("standdown-suppressed");
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
          ns.tprint("bn10entry: DONE -- joinBladeburnerDivision() verified via getRank().");
          return;
        }
        break;
      }

      case "replan": {
        refreshSlotHold(ns);
        refreshLock(ns);
        requestReplan(ns, logEvent, decision.reason);
        // No blocking wait -- the loop falls through to a live decision next tick regardless
        // of whether the planner produced a fresh file in time. If it never gets a host,
        // decideEntryAction still has `grind` as its sole fallthrough (C2), so this tick's
        // logged decision (likely "replan" again next pass, or "grind" once plan.nextStep
        // reads null) never idles the engine.
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
          break; // re-assess next tick once travel lands
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
        void graftBoolIgnored; // R4: the boolean is deliberately never trusted
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
            source: "bn10entry-graft",
            aug: step.name,
            amount: step.price,
            timestamp: Date.now(),
            time: new Date().toLocaleString(),
          });
          addToLedger(ns, step.price);
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
        // R6: adopt a matching pre-existing crime rather than restarting it.
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
