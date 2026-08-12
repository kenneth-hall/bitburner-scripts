/**
 * Phase 39 (phase-39-bladeburner-primary.spec.md) -- bladeburnermanager.js rebuilt for
 * Bladeburner-primary. Supersedes Phase 38's architecture (docs/phases/
 * phase-38-bladeburner-engine.spec.md) while reusing its slot-hold contract, file/log
 * plumbing, and dashboard panel.
 *
 * The engine now HOLDS the player-action slot continuously and grants bounded,
 * budgeted YIELDS to higher-priority claimants (S2) instead of standing down
 * unconditionally. Telemetry is rebuilt from scratch (S1): every rate field is derived
 * from getRank()/getCurrentAction(), never from the engine's own intent -- Phase 38's
 * numbers were wrong in a way its own state file could not reveal (rankGained: 0,
 * dutyCycle: 1, while live rank moved 1,217 -> 1,221).
 *
 * Two safety gates are structural, not policy (S4, S5): Overclock is held at its
 * current level (Q10 unresolved -- per-action vs per-second stamina cost), and Stage B
 * (the five risky Operations) is excluded from the candidate pool entirely (Q11
 * unresolved -- HP cost per failed operation). Both require a two-key flip: a recorded
 * answer in docs/bladeburner-reference.md AND a constant edit. Neither has a runtime
 * lift path.
 *
 * There is an undiagnosed engine-level bug in the game's own startAction: it can
 * return `true` while getCurrentAction() reads `null` for the whole action (confirmed
 * for Tracking and Raid; Investigation ran clean). This engine detects, quarantines,
 * and instruments the failure (S6) rather than assuming a cause.
 *
 * Marker contract (owned here, augfarmer.js only ever reads):
 *   file bladeburner-slot-hold.json, home. {ts: epoch ms, holder: string}.
 *   Written/refreshed BEFORE every startAction call (never after). Deleted on
 *   release/yield-grant/atExit.
 *
 * No Singularity calls, at all -- every cross-script signal (augfarmer's phase, rep
 * deficit, backdoor activity) is read from an already-exported state file via ns.read
 * (0 GB). No money spent through any API. Observability is files, not popups.
 */

// ---- Files ------------------------------------------------------------------------
export const BB_STATE_FILE = "bladeburner-state.json";
export const BB_LOG_FILE = "bladeburner-log.json";
export const BB_LOG_MAX_ENTRIES = 2000;
export const BB_ATTEMPTS_FILE = "bladeburner-attempts.json";
export const BB_ATTEMPTS_MAX_ENTRIES = 5000;
export const BB_OFF_MARKER = "bladeburner-off.txt";
// Own copy of the marker contract's filename/tuning -- import-bleed rule (CLAUDE.md):
// bladeburnermanager.js is never imported by augfarmer.js/backdoorfactions.js/daemon.js
// and vice versa, so these live twice, in sync by convention, not by shared code.
export const SLOT_HOLD_FILE = "bladeburner-slot-hold.json";
export const SLOT_HOLD_HOLDER_NAME = "bladeburnermanager";
export const SLOT_HOLD_MAX_AGE_MS = 30_000;
const AUG_STATE_FILE = "augfarmer-state.json";
const BACKDOOR_ACTIVITY_FILES = {
  "backdoorfactions.js": "backdoorfactions-activity.json",
  "backdoorwd.js": "backdoorwd-activity.json",
};

// ---- Tuning -------------------------------------------------------------------------
export const BB_POLL_MS = 10_000;
export const AUG_STATE_FRESH_MS = 60_000;
export const BACKDOOR_ACTIVITY_FRESH_MS = 180_000;
export const HIGHER_PRIORITY_CLAIMANTS = ["backdoorwd.js", "backdoorfactions.js", "studybootstrap.js"];
const STUDY_CLAIMANT = "studybootstrap.js";
export const REP_YIELD_CLAIMANT = "augfarmer-rep-work"; // synthetic claimant name -- not a process, driven by S3's detector

// S2.2 -- per-claimant yield bound, before S2.4's escalation.
export const BACKDOOR_YIELD_MAX_MS = 180_000;
export const STUDY_YIELD_MAX_MS = 300_000;
// S2.3 -- the rep-yield budget. The cap binds; the slice is derived from it (3 slices/hour).
//
// 🔴 SET TO 0 ON 2026-08-03 (Kenneth's call, option (a)), REVERSING the spec's D11a
// default of 0.15. This is not a tuning tweak -- the measurement says the yield buys
// literally nothing toward the win condition:
//
//   * The single player-action slot is shared: Bladeburner rank OR faction rep, never
//     both. The 0.15 was the spec's guess at a fair split, explicitly declared "a
//     defensible default, not a measurement" (S16.9).
//   * But `augfarmer.js`'s `scoreAug` picks augs by `hacking / hacking_exp / faction_rep`
//     -- leftover targeting from the M-climb win path DROPPED on 2026-08-02. So the rep
//     grind aims at hacking augs.
//   * Checked what the live rep target actually pays (augcheck.js, 2026-08-03):
//     `Neuregen Gene Modification` = `hacking_exp: 1.4` and **1.0 on every combat stat and
//     every bladeburner_* mult**. Same for every other Chongqing aug. Against rank 400,000
//     that is worth EXACTLY ZERO.
//   * So there was no trade-off to balance -- we were paying 15% of the win path for
//     nothing. The optimum on current targeting is 0.
//
// ⚠️ This does NOT freeze the aug ratchet, which is why it is safe. Its next purchase is
// NeuroFlux Governor, whose rep requirement (1.854k) is ALREADY MET (`deficit: 0`) -- NFG
// is money-gated, and money comes from the batcher at zero slot cost. NFG grants
// +1%/level to ALL mults including strength/defense/dexterity/agility, and combat feeds
// max HP (`10 + defense/10`) and max stamina, i.e. DUTY CYCLE -- currently the binding
// constraint. The ratchet therefore keeps contributing to rank without the slot at all.
//
// Restore a positive value ONLY alongside retargeting `scoreAug` at combat/bladeburner
// mults (option (b), not taken) -- otherwise it re-buys hacking exp with win-path time.
export const MAX_REP_YIELD_DUTY = 0.15;
// 🔴 REVISED 2026-08-04 -- the 0 above was wrong, and an install proved it in 8 hours.
// Cutting the yield to 0 rested on "NFG's rep requirement is already met (deficit 0)".
// That was true when measured and did NOT survive an install: **installs reset faction
// rep**, so the 4:21 AM install left the ratchet needing 2,374 rep for a $4.7m NeuroFlux
// Governor it could otherwise afford instantly, with no way to earn it. Frozen ratchet.
//
// But a flat percentage was never the right shape either, because the two ends of a cycle
// differ completely in what the rep BUYS:
//
//   post-install  NeuroFlux Governor    2,374 rep (~34 min)  +1% ALL mults incl. combat
//                                                            -> max HP / stamina -> DUTY -> rank
//   later         Neuregen Gene Mod.   20,653 rep (~5 h)     hacking_exp 1.4, 1.0 on every
//                                                            combat and bladeburner_* mult
//
// So the gate is on the SIZE OF THE DEFICIT, which cleanly separates them: cheap targets
// (NFG's ladder) get funded, expensive ones (the hacking augs at 20k-112k rep) are refused.
// It is a heuristic, not a proof -- a cheap-but-useless aug can slip through (Chongqing's
// Nuoptimal Nootropic Injector sits at exactly 5,000 rep and buys charisma/company_rep) --
// but it costs one burst, and the expensive worthless ones are what actually mattered.
// The yield is self-limiting regardless: detectRepStarvation clears once the deficit closes.
export const REP_YIELD_MAX_DEFICIT = 5_000;
export const REP_YIELD_SLICE_MS = 180_000;
// S2.4 -- anti-livelock escalation: 180 -> 360 -> 720 -> 1,440s, then flat. Reset on a clean grant.
export const YIELD_ESCALATION_MAX_DOUBLINGS = 3;
export const MIN_HOLD_AFTER_OVERRUN_MS = 300_000;
export const LIVELOCK_WARN_STREAK = 3;

// S3 -- rep-starvation detector constants. All five are DECLARED PROVISIONAL (S16.9) and
// logged into every event so they're re-derivable from data, not asserted as measured.
// 🔴 30 min -> 5 min, 2026-08-04. 30 was a spec default explicitly declared provisional
// (S16.9, "a defensible default, not a measurement"), and it demonstrably never completed:
// zero rep-starvation events across days of real starvation. A long confirmation window
// buys little here -- the starved condition already requires phase grinding, a positive
// deficit, AND no measurable rep progress, and the yield it gates is bounded (15% duty,
// 3-min slices) and deficit-gated to targets worth funding. Five minutes is ample
// confirmation without being unreachable.
export const REP_STARVED_SUSTAIN_MS = 5 * 60_000;
export const REP_STARVED_RATE = 0.5;
export const REP_STARVED_CLEAR_RATE = 1.0;
export const REP_STARVED_CLEAR_MS = 5 * 60_000;

// S4 -- Overclock is HELD at the current live level. Q10 UNRESOLVED (per-action vs
// per-second stamina cost) -- raising this requires (a) a recorded Q10 answer in
// docs/bladeburner-reference.md §8 and (b) this edit. No runtime path lifts it.
export const OVERCLOCK_HOLD_LEVEL = 17;
export const SKILL_BUY_ORDER = ["Blade's Intuition", "Digital Observer", "Tracer", "Overclock", "Reaper", "Evasive System"];
export const SKILL_LEVEL_CAP = {
  "Blade's Intuition": 25,
  "Digital Observer": 25,
  Tracer: 25,
  Overclock: OVERCLOCK_HOLD_LEVEL,
  Reaper: 6,
  "Evasive System": 6,
};

// S5 -- Stage B is gated shut. Q11 UNRESOLVED (HP cost per failed operation). Flipping
// requires (a) a recorded Q11 answer and a measured HP budget and (b) this edit.
export const STAGE_B_ENABLED = false;
const CONTRACTS = ["Tracking", "Bounty Hunter", "Retirement"];
const SAFE_OPERATIONS = ["Investigation"]; // no HP loss on failure -- never gated out
const RISKY_OPERATIONS = ["Undercover Operation", "Sting Operation", "Raid", "Stealth Retirement Operation", "Assassination"];
const OPERATIONS = [...SAFE_OPERATIONS, ...RISKY_OPERATIONS];
const NO_HP_RISK_ACTIONS = new Set(SAFE_OPERATIONS);

// S6 -- start-verification quarantine.
export const ACTION_START_FAILURE_LIMIT = 3;
export const ACTION_QUARANTINE_MS = 30 * 60_000;
// S11 -- debounce floor for re-triggering an unchanged, observed-idle GENERAL action
// (Contracts/Operations loop on their own and retry every tick on a verified failure;
// this floor applies only to the General-action re-trigger case).
export const GENERAL_ACTION_RECHECK_MS = 15_000;

// S8 -- objective function, default unchanged from Phase 38 (D3-OPEN is genuinely open).
export const OBJECTIVE_MODE = "per-second";

// S9 -- HP/stamina guards. STAMINA_RESUME_FRACTION lowered 0.8 -> 0.55 (S16.4): the
// closed-form penalty min(1, fraction/0.5) clamps at 1, so resting past 50% is provably
// wasted wall-clock.
export const HP_FLOOR_FRACTION = 0.5;
export const HP_RESUME_FRACTION = 0.85;
export const STAMINA_FLOOR_FRACTION = 0.5;
export const STAMINA_RESUME_FRACTION = 0.55;

// S9a -- post-install regime. maxHp = 10 + floor(defense/10) collapses to ~10 right
// after an install (defense resets to 1); it climbs monotonically from Bladeburner
// action exp thereafter (measured 1 -> 171 defense in 26h), so the regime is
// self-limiting. Detected free off ns.getPlayer(), already read every tick.
export const POST_INSTALL_HP_MAX_THRESHOLD = 12;
export const POST_INSTALL_TRAINING_MAX_MS = 30 * 60_000;
export const REGIME_DOMINATED_THRESHOLD = 0.35;
// Confirmed live 2026-08-03: computeCrossover runs every ~1s tick, and logging its raw
// output unconditionally flooded the 2000-entry ring in minutes -- evicting every other
// kind (yield-grant, quarantine-set, checkpoints...) almost immediately. Edge-triggered
// (a lead flag flips) plus a heartbeat, not every tick.
export const CROSSOVER_LOG_INTERVAL_MS = 5 * 60_000;
export const YIELD_REFUSED_LOG_INTERVAL_MS = 5 * 60_000;
// 🔴 Added 2026-08-03 after the 10.5-hour HRC park (see shouldStartAction). That failure
// was invisible for 10.5 hours because nothing shouted: the engine reported a perfectly
// healthy-looking 100% duty cycle while `rankProducingSec` sat at 0. The existing
// broken-telemetry assertion keys on `rankProducingSec >= 1800` and so -- correctly --
// could never catch a run where that field is ZERO. This closes that gap from the other
// side: wall time accumulating with NO rank-producing time at all.
export const OVERHEAD_STALL_WARN_MS = 45 * 60_000;

// S10 -- overhead ladder / city / team knobs.
export const CHAOS_DIPLOMACY_THRESHOLD = 1.0;
// 🔴 Chaos policy, added 2026-08-03 after measuring that chaos was compounding unchecked
// and materially eating EV: Sector-12 climbed **69.1 -> 177.7 in 10.6h** and Tracking's
// EV/sec collapsed **0.0211 -> 0.0084 (2.5x)** over exactly that span. `Diplomacy` was
// structurally unreachable -- `pickOverheadAction` is only called when `pickRankAction`
// returns null (i.e. while recovering), and the call site passed `hpRecovering ? 0 :
// hpFraction`, which forced the HP branch and returned HRC before the chaos branch could
// ever be evaluated. So the chaos lever existed and had never once fired.
//
// ⚠️ This policy is a BOUNDED BET, not a solved problem, and the prior evidence cuts
// against it: the 2026-07-30 trial (docs/bn6-playbook.md) measured Diplomacy's bump as
// **2-3x smaller than the decay it was fighting**. That was at chaos ~0.3 versus 178 now,
// a completely different regime, so it is not decisive -- but it is a real reason not to
// bet the run on this. Hence: target-seeking (stops on its own once chaos is controlled),
// hard duty ceiling (cannot eat the run if it turns out to be too weak), and
// SELF-MEASURING (every run logs its chaos delta, so the per-run effectiveness this policy
// is missing gets answered from data instead of guessed -- the S7 pattern).
//
// Diplomacy is 60,000 ms and HRC is 60,000 ms (measured, bladeburneractionprobe), so one
// Diplomacy costs exactly one HRC cycle = ~2 HP of forgone recovery. It is only ever taken
// from recovery time that is currently 100% idle healing -- never from the rank action.
export const CHAOS_TARGET = 50;
export const MAX_DIPLOMACY_DUTY = 0.2;
// Read-only, and FREE on RAM: getCityChaos is already charged, so sampling all six cities
// costs nothing extra. This is the data Q5 (city rotation) needs -- rotating to a clean
// city may well beat grinding Diplomacy, and until now we only ever sampled our own city.
export const ALL_CITIES = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"];
export const TEAM_SIZE_TARGET = 6; // only consulted while STAGE_B_ENABLED
export const LOW_INVENTORY_COUNT_THRESHOLD = 20;
export const CITY_ROTATE_CHAOS_THRESHOLD = 2.0;
// Still false, but the REASON changed on 2026-08-03. switchCity is no longer unmeasured:
// it costs $0, 0 rank, no travel time, and only interrupts the running action (measured
// via src/switchbbcity.js, recorded in docs/bladeburner-reference.md §6). What remains
// open is the POLICY, not the mechanic -- when to move, anti-thrash hysteresis, and
// whether a higher-population city beats a lower-chaos one once chaos is controlled.
// That is a spec-level decision, so the engine still never rotates on its own; moves are
// made manually with switchbbcity.js.
export const CITY_ROTATION_ENABLED = false;
// 🔴 MEASURED 2026-08-03: Raid CONSUMES the city. Six Raids took Volhaven from
// 1,170.6m population / 75 communities to **0 population / 71 communities**, and at zero
// Synthoid population the success chance of EVERY action -- contracts included -- goes to
// 0. Tracking's score fell to exactly 0.0 and the engine stalled with rank flat until the
// city was changed. So a drained city is not just "bad for Raid", it is a total stall, and
// it is detectable from population alone.
export const MIN_CITY_POPULATION = 1_000_000;
const RAID_MIN_COMMUNITIES = 1; // "there must be an existing Synthoid community" (reference §5) -- exact threshold undocumented, 1 is the literal reading

export const BLACKOPS_DAEDALUS_RANK = 400_000;

// S14 -- checkpoint bars, against rankPerWallSec (S1 supersedes Phase 38's rankPerHeldSec framing).
export const C1_UPTIME_MS = 24 * 3600_000;
export const C1_BAR = 0.007;
export const C3_UPTIME_MS = 7 * 24 * 3600_000;
export const C3A_DUTY_BAR = 0.2;
export const C3B_BAR = 0.35;

// Finite rate windows. `cumulative` is deliberately absent here -- it's derived from
// `totals` (persisted across restarts), never from the pruned sample buffer, which
// silently truncated both "24h" and "cumulative" to ~2h47m in the 2026-08-02 bug.
export const RATE_WINDOWS_MS = { "1h": 3_600_000, "24h": 86_400_000 };
export const MAX_FINITE_WINDOW_MS = Math.max(...Object.values(RATE_WINDOWS_MS));
export const SAMPLE_HARD_CAP = 120_000;

// ---- Phase 40 -- autolevel governor tuning (phase-40-autolevel-governor.spec.md S2.2) --
// Shipped INERT: "shadow" computes and logs decisions but never calls a setter (S7). Flip
// to "active" only per S5/S7's staged gate (WI3, out of scope for this implementation).
export const LEVEL_GOVERNOR_MODE = "active"; // "off" | "shadow" | "active"
export const LEVEL_RECENT_WINDOW = 30;
export const LEVEL_MIN_SAMPLES = 20;
export const LEVEL_LOWER_BAND = 0.6;
export const LEVEL_RAISE_BAND = 0.95;
export const LEVEL_COOLDOWN_MS = 600_000;
export const LEVEL_FLOOR = 1;
export const LEVEL_CEILING_HOLD_MS = 21_600_000; // 6h
export const LEVEL_HARD_CEILING_RETRY_MS = 14_400_000; // 4h
export const LEVEL_MAX_RAISE_STEP = 4;
export const LEVEL_MAX_TOTAL_DROP = 12;
export const LEVEL_DROP_BUDGET_MS = 86_400_000; // 24h
export const LEVEL_SET_RETRY_MS = 1_800_000; // 30 min
// Revision 3 (2026-08-10): replaces LEVEL_UNCERTAIN_WARN_FRACTION -- there is no boundary
// detector left to be uncertain about. SETTLE_MAX_MS is S1.2's single-action-regime
// fallback (an open run this old is settled in place, estimated); ESTIMATED_SAMPLE_WARN_
// FRACTION gates the warn when too much of a window is running on that estimate instead
// of exact subtraction.
export const SETTLE_MAX_MS = 300_000; // 5 min
export const ESTIMATED_SAMPLE_WARN_FRACTION = 0.25;
export const COHORT_MIN_ACTIONS = 2;
export const LEVEL_OUTCOME_LEVELS_KEPT = 12;
// S8 -- "edge-triggered only, plus a 30-minute heartbeat" (the crossover-flood lesson).
export const LEVEL_GOVERN_HEARTBEAT_MS = 30 * 60_000;

// ---- Pure functions (the testable surface) -----------------------------------------

/** Pure. `(pMin*rankGain - (1-pMin)*rankLoss) / (timeMs/1000)`. Unchanged from Phase 38 -- this IS scoreCandidate's per-second score. */
export function expectedRankPerSec({ pMin, rankGain, rankLoss, timeMs }) {
  const seconds = timeMs / 1000;
  if (!(seconds > 0)) return 0;
  return (pMin * rankGain - (1 - pMin) * rankLoss) / seconds;
}

/**
 * Pure (S8). Both scores are ALWAYS computed and logged so switching `mode` later is a
 * re-analysis of the ledger, not a re-measurement. `scoreCandidate` is a pure function of
 * the `pMin` it is handed and multiplies it by nothing -- whether the game's returned
 * estimate is pre- or post- stamina-penalty is an UNVERIFIED premise (Q12), not asserted
 * here either way.
 * @param {{pMin:number, rankGain:number, rankLoss:number, timeMs:number}} candidate
 * @param {"per-second"|"per-action"} [mode]
 */
export function scoreCandidate(candidate, mode = OBJECTIVE_MODE) {
  const { pMin, rankGain, rankLoss } = candidate;
  const evPerAction = pMin * rankGain - (1 - pMin) * rankLoss;
  const evPerSec = expectedRankPerSec(candidate);
  return { evPerSec, evPerAction, score: mode === "per-action" ? evPerAction : evPerSec };
}

/**
 * Pure (S5.1) -- the UNGATED pool. All 3 Contracts + all 6 Operations passing
 * `getActionCountRemaining >= 1`. Knows nothing about stages; never consulted directly
 * by any action-starting path (that's `applyStageGate`'s job, S5.1). This is the single
 * source `computeCrossover` scores from, so C2's evidence is reachable while Stage B is
 * gated shut.
 *
 * Phase 40 S1.3: carries `countRemaining` (the value this function already fetches to
 * gate the pool -- no longer discarded) and `pMax` (the estimator's upper bound, already
 * returned by the same `getActionEstimatedSuccessChance` call as `pMin`) onto every
 * candidate. Net call count is UNCHANGED -- both were already-charged reads.
 * @param {NS} ns
 */
export function buildCandidates(ns) {
  const candidates = [];
  for (const [type, names] of [
    ["Contracts", CONTRACTS],
    ["Operations", OPERATIONS],
  ]) {
    for (const name of names) {
      const countRemaining = ns.bladeburner.getActionCountRemaining(type, name);
      if (countRemaining < 1) continue;
      const [pMin, pMax] = ns.bladeburner.getActionEstimatedSuccessChance(type, name);
      candidates.push({
        type,
        name,
        pMin,
        pMax,
        rankGain: ns.bladeburner.getActionRankGain(type, name),
        rankLoss: ns.bladeburner.getActionRankLoss(type, name),
        timeMs: ns.bladeburner.getActionTime(type, name),
        risksHp: !NO_HP_RISK_ACTIONS.has(name),
        countRemaining,
      });
    }
  }
  return candidates;
}

/**
 * Pure (S5.1) -- the ONLY filter that gates anything. Drops the five risky Operations
 * when `stageBEnabled` is false; `Investigation` and all Contracts always survive. This
 * is the Q11 safety test: an EV/scoring change cannot reopen Stage B, because nothing
 * downstream of this function ever re-admits a dropped candidate.
 * @param {{type:string, name:string}[]} candidates
 * @param {boolean} stageBEnabled
 */
export function applyStageGate(candidates, stageBEnabled) {
  if (stageBEnabled) return candidates;
  return candidates.filter((c) => c.type !== "Operations" || !RISKY_OPERATIONS.includes(c.name));
}

/**
 * Pure (S5.1, C2's evidence). Consumes the FULL ungated pool straight from
 * `buildCandidates` -- deliberately scores gated-out operations. Returns a report of
 * `{name, score}` pairs only; nothing here can reach `startAction` (no candidate object
 * survives into the return value).
 * @param {{type:string,name:string,pMin:number,rankGain:number,rankLoss:number,timeMs:number}[]} candidates
 * @param {"per-second"|"per-action"} [mode]
 */
export function computeCrossover(candidates, mode = OBJECTIVE_MODE) {
  const contracts = candidates.filter((c) => c.type === "Contracts");
  const operations = candidates.filter((c) => c.type === "Operations");
  const bestOf = (list, scoreMode) => {
    let best = null;
    for (const c of list) {
      const s = scoreCandidate(c, scoreMode).score;
      if (best === null || s > best.score) best = { name: c.name, score: s };
    }
    return best;
  };
  const bestContractPerSec = bestOf(contracts, "per-second");
  const bestOperationPerSec = bestOf(operations, "per-second");
  const bestContractPerAction = bestOf(contracts, "per-action");
  const bestOperationPerAction = bestOf(operations, "per-action");
  return {
    bestContract: { name: bestContractPerSec?.name ?? null, scorePerSec: bestContractPerSec?.score ?? null, scorePerAction: bestContractPerAction?.score ?? null },
    bestOperation: { name: bestOperationPerSec?.name ?? null, scorePerSec: bestOperationPerSec?.score ?? null, scorePerAction: bestOperationPerAction?.score ?? null },
    // S14.1 -- C2 trips ONLY on the per-second lead, regardless of OBJECTIVE_MODE. The
    // per-action lead is an observation (evidence for a future, human re-pin), never a trigger.
    operationLeadsPerSec: bestOperationPerSec !== null && bestContractPerSec !== null && bestOperationPerSec.score > bestContractPerSec.score,
    operationLeadsPerAction: bestOperationPerAction !== null && bestContractPerAction !== null && bestOperationPerAction.score > bestContractPerAction.score,
  };
}

/** Pure. `true` while `nowMs` is inside the action's quarantine window. */
export function isQuarantined(quarantineMap, name, nowMs) {
  const expiry = quarantineMap?.[name];
  return typeof expiry === "number" && nowMs < expiry;
}

/**
 * Pure (S6). The consecutive-failure counter / quarantine-expiry latch. `state` is
 * `{failures: {name: count}, quarantine: {name: expiryMs}}`. On expiry the action gets
 * exactly ONE retry attempt (via `isQuarantined` reading false past the expiry) -- a
 * failure on that retry re-quarantines immediately, without waiting for three fresh
 * failures.
 * @param {{failures:Record<string,number>, quarantine:Record<string,number>}} state
 * @param {string} name
 * @param {boolean} verified
 * @param {number} nowMs
 */
export function updateQuarantine(state, name, verified, nowMs) {
  const failures = { ...(state?.failures ?? {}) };
  const quarantine = { ...(state?.quarantine ?? {}) };
  const priorExpiry = quarantine[name];
  const wasPastExpiry = typeof priorExpiry === "number" && nowMs >= priorExpiry; // the one retry attempt
  if (verified) {
    failures[name] = 0;
    if (typeof priorExpiry === "number") delete quarantine[name];
    return { failures, quarantine, justQuarantined: false, justCleared: typeof priorExpiry === "number" };
  }
  if (wasPastExpiry) {
    quarantine[name] = nowMs + ACTION_QUARANTINE_MS;
    failures[name] = 0;
    return { failures, quarantine, justQuarantined: true, justCleared: false };
  }
  const count = (failures[name] ?? 0) + 1;
  failures[name] = count;
  if (count >= ACTION_START_FAILURE_LIMIT) {
    quarantine[name] = nowMs + ACTION_QUARANTINE_MS;
    failures[name] = 0;
    return { failures, quarantine, justQuarantined: true, justCleared: false };
  }
  return { failures, quarantine, justQuarantined: false, justCleared: false };
}

/**
 * Pure (S8's hard net-negative floor + S9's HP/stamina guards). `candidates` must
 * already be `applyStageGate`'d -- this function does NOT gate stages (S5.1). Quarantined
 * candidates are skipped via `opts.quarantine`/`opts.nowMs`. Returns `null` when
 * recovering, when the pool is empty, or when nothing scores positive -- the caller
 * routes to `pickOverheadAction` in all three cases.
 * @param {{type:string,name:string,pMin:number,rankGain:number,rankLoss:number,timeMs:number}[]} candidates
 * @param {{hpRecovering?:boolean, staminaRecovering?:boolean, quarantine?:Record<string,number>, nowMs?:number, mode?:string}} opts
 */
export function pickRankAction(candidates, opts = {}) {
  const { hpRecovering = false, staminaRecovering = false, quarantine = {}, nowMs = 0, mode = OBJECTIVE_MODE } = opts;
  if (hpRecovering || staminaRecovering) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (isQuarantined(quarantine, c.name, nowMs)) continue;
    const { score } = scoreCandidate(c, mode);
    if (score <= 0) continue; // hard net-negative floor, both modes (sign is time-invariant)
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Pure. At most one skill buy per call. `costs` is a live single-level snapshot.
 * Overclock is unreachable at/above `SKILL_LEVEL_CAP.Overclock` (== OVERCLOCK_HOLD_LEVEL)
 * -- the Q10 safety test.
 * @param {Record<string, number>} skillLevels
 * @param {number} points
 * @param {Record<string, number>} costs
 * @param {{order?: string[], levelCap?: Record<string, number>}} policy
 */
export function planSkillBuy(skillLevels, points, costs, policy = {}) {
  const order = policy.order ?? SKILL_BUY_ORDER;
  const levelCap = policy.levelCap ?? SKILL_LEVEL_CAP;
  for (const skill of order) {
    const level = skillLevels[skill] ?? 0;
    const cap = levelCap[skill];
    if (cap !== undefined && level >= cap) continue;
    const cost = costs[skill];
    if (cost === undefined || !Number.isFinite(cost) || cost > points) continue;
    return { skill, toLevel: level + 1, cost };
  }
  return null;
}

/** Pure. `true` when every tracked Contract/Operation's remaining count is at/under `threshold`. An empty list counts as low too. */
export function isInventoryLow(counts, threshold = LOW_INVENTORY_COUNT_THRESHOLD) {
  if (counts.length === 0) return true;
  return counts.every((c) => c <= threshold);
}

/** Pure (S10, Q5). Rotates to the lowest-chaos other city once `threshold` is crossed. Retained but never called for effect while CITY_ROTATION_ENABLED is false -- switchCity's cost/interruption is unmeasured. */
export function shouldRotateCity(chaosByCity, cityName, threshold) {
  const currentChaos = chaosByCity[cityName];
  if (currentChaos === undefined || currentChaos < threshold) return { rotate: false, city: null };
  let best = null;
  let bestChaos = Infinity;
  for (const [city, chaos] of Object.entries(chaosByCity)) {
    if (city === cityName) continue;
    if (chaos < bestChaos) {
      bestChaos = chaos;
      best = city;
    }
  }
  if (best === null) return { rotate: false, city: null };
  return { rotate: true, city: best };
}

/**
 * Pure (S10/WI5). Folds one city's fresh reads into the per-city stock and flags floor
 * breaches (Raid's community precondition, the chaos rotation threshold, low
 * contract/operation inventory) -- purely instrumentation; `CITY_ROTATION_ENABLED` gates
 * whether anything ever acts on a breach.
 * @param {Record<string, object>|null} priorStock
 * @param {{cityName:string, population:number, communities:number, chaos:number, contractCount:number, opCount:number}} reads
 * @param {number} nowMs
 */
export function updateCityStock(priorStock, reads, nowMs) {
  const { cityName, population, communities, chaos, contractCount, opCount } = reads;
  const breaches = [];
  if (chaos >= CITY_ROTATE_CHAOS_THRESHOLD) breaches.push({ type: "chaos", cityName, value: chaos });
  if (contractCount <= LOW_INVENTORY_COUNT_THRESHOLD || opCount <= LOW_INVENTORY_COUNT_THRESHOLD) {
    breaches.push({ type: "inventory", cityName, contractCount, opCount });
  }
  if (communities < RAID_MIN_COMMUNITIES) breaches.push({ type: "communities", cityName, communities });
  if (population < MIN_CITY_POPULATION) breaches.push({ type: "population-drained", cityName, population });
  return {
    stock: { ...(priorStock ?? {}), [cityName]: { pop: population, communities, chaos, contractCount, opCount, updatedMs: nowMs } },
    breaches,
  };
}

/** Pure. Hysteresis latch for the stamina guard: trips at `floor`, releases only at `resume`. */
export function updateStaminaRecovering(recovering, staminaFraction, floor = STAMINA_FLOOR_FRACTION, resume = STAMINA_RESUME_FRACTION) {
  if (staminaFraction < floor) return true;
  if (staminaFraction >= resume) return false;
  return recovering;
}

/** Pure. Same hysteresis latch shape as `updateStaminaRecovering`, for HP. */
export function updateHpRecovering(recovering, hpFraction, floor = HP_FLOOR_FRACTION, resume = HP_RESUME_FRACTION) {
  if (hpFraction < floor) return true;
  if (hpFraction >= resume) return false;
  return recovering;
}

/** Pure (S9a). `maxHp` collapses to ~10 right after an install (defense resets to 1) and climbs monotonically thereafter -- self-limiting, free off a read the engine already makes every tick. */
export function isPostInstallRegime(hpMax) {
  return hpMax <= POST_INSTALL_HP_MAX_THRESHOLD;
}

/**
 * Pure (S9a, S10, S11). HP/stamina recovery outranks everything (HRC). If HRC itself is
 * quarantined (`opts.hrcQuarantined`), there is no recovery path -- the caller sets
 * `recoveryActionQuarantined` and WARNs; this falls through to the next-best overhead
 * action rather than stalling completely. In the post-install regime, `Training` is
 * preferred (buys back the regime's own exit condition, capped at
 * POST_INSTALL_TRAINING_MAX_MS). `Recruitment` only appears while Stage B is enabled
 * (S10/S16.5 -- zero Stage-A benefit, 4m22s of slot time).
 * @param {number} hpFraction
 * @param {number|undefined} cityChaos
 * @param {number} teamSize
 * @param {boolean} lowInventory
 * @param {boolean} [staminaRecovering]
 * @param {{hrcQuarantined?:boolean, stageBEnabled?:boolean, inPostInstallRegime?:boolean, postInstallTrainingMs?:number}} [opts]
 */
export function pickOverheadAction(hpFraction, cityChaos, teamSize, lowInventory, staminaRecovering = false, opts = {}) {
  const { hrcQuarantined = false, stageBEnabled = false, inPostInstallRegime = false, postInstallTrainingMs = 0, hpRecovering = false, diplomacyBudgetMs = 0 } = opts;
  const hrc = { type: "General", name: "Hyperbolic Regeneration Chamber" };
  // 🔴 The HARD floor -- genuine danger. Never traded away for anything. Note this is the
  // real `hpFraction` now: the caller used to pass `hpRecovering ? 0 : hpFraction`, which
  // collapsed "building a buffer inside the hysteresis band" into "HP is zero" and made
  // every branch below unreachable during recovery. That is why Diplomacy never ran.
  if (hpFraction < HP_FLOOR_FRACTION && !hrcQuarantined) return hrc;
  // Stamina gates success chance directly, and Diplomacy itself costs ~0.2 stamina/use
  // (Q6), so stamina recovery is never interrupted either.
  if (staminaRecovering && !hrcQuarantined) return hrc;
  if (inPostInstallRegime && postInstallTrainingMs < POST_INSTALL_TRAINING_MAX_MS) return { type: "General", name: "Training" };
  if (lowInventory) return { type: "General", name: "Incite Violence" };
  // Chaos suppression. Safe here by construction: we are at/above the hard HP floor and
  // not stamina-recovering. Target-seeking, so it stops on its own once chaos is back
  // under CHAOS_TARGET, and budget-capped so it cannot eat the run if it proves too weak.
  if (cityChaos !== undefined && cityChaos > CHAOS_TARGET && diplomacyBudgetMs > 0) return { type: "General", name: "Diplomacy" };
  // Still inside the HP hysteresis band (above the floor, below the resume mark) -> keep
  // healing. Below the chaos branch deliberately: chaos compounds against every future
  // roll, HP only gates the next one, and this time was previously 100% idle healing.
  if (hpRecovering) return hrc;
  if (cityChaos !== undefined && cityChaos > CHAOS_DIPLOMACY_THRESHOLD && diplomacyBudgetMs > 0) return { type: "General", name: "Diplomacy" };
  if (stageBEnabled && teamSize < TEAM_SIZE_TARGET) return { type: "General", name: "Recruitment" };
  return hrc;
}

/**
 * Pure (S6/S11). Decides whether to call `startAction` this tick.
 *
 * 🔴 EXTRACTED FROM THE LOOP 2026-08-03 AFTER A 10.5-HOUR LIVE FAILURE. The inline
 * version read `isIdleRead && (changed || !isGeneral || debounceElapsed)` -- i.e. it
 * AND-ed observed-idleness over every other reason to act. But reference gotcha 13 says
 * `startAction` auto-repeats and `getCurrentAction()` stays **non-null across reps**, so
 * once ANY action was running the engine could never start a different one: the `changed`
 * term was computed and then permanently gated shut. Live cost: the HP floor tripped at 08:33, the
 * ladder correctly picked `Hyperbolic Regeneration Chamber`, HRC started and kept
 * repeating -- and the engine sat in it for **10.5 hours at 100% duty and zero rank**,
 * long after HP had recovered to full. Exactly 3 `startAction` attempts in that window.
 * This was loop-inline and therefore untested, which is the whole reason the spec's
 * ground rules say behaviour must live in exported pure functions.
 *
 * The corrected rule inverts the priority: the ONLY reason **not** to start is that the
 * game is already running exactly the action we want (restarting it would reset its
 * progress -- S6). Anything else running is a reason to switch, immediately.
 *
 * @param {{type:string,name:string}} chosenAction what the ladder wants to run now
 * @param {{type:string,name:string}|null} intendedAction what we last called startAction with
 * @param {string|null} liveActionName `getCurrentAction()?.name` -- the GAME's truth, not our intent
 * @returns {{start:boolean, reason:string}}
 */
export function shouldStartAction({ chosenAction, intendedAction, liveActionName, nowMs, lastGeneralRecheckMs = 0, generalRecheckMs = GENERAL_ACTION_RECHECK_MS, forceRestartReason = null }) {
  // Already running precisely what we want -> never restart (S6: a repeat startAction
  // resets action progress and completes nothing). Phase 40 S3 step 5's ONE exception:
  // a forced restart so a just-applied level change takes effect on the next rep instead
  // of the one already in flight. The parameter defaults to null, so every existing call
  // site/test is unaffected.
  if (liveActionName && liveActionName === chosenAction.name) {
    if (forceRestartReason) return { start: true, reason: forceRestartReason };
    return { start: false, reason: "running-desired" };
  }
  // Running something else -> switch NOW, regardless of idleness. This is the line whose
  // absence caused the 10.5-hour park.
  if (liveActionName) return { start: true, reason: "switch" };
  // Idle from here down.
  const changed = !intendedAction || intendedAction.type !== chosenAction.type || intendedAction.name !== chosenAction.name;
  if (changed) return { start: true, reason: "switch-idle" };
  // Same action, observed idle. General actions can fire once and stop (S11), so
  // re-trigger them -- but debounce, so one lagging/transient null read right after a
  // start cannot thrash the action.
  if (chosenAction.type === "General" && nowMs - lastGeneralRecheckMs < generalRecheckMs) return { start: false, reason: "debounced" };
  return { start: true, reason: "restart-idle" };
}

/**
 * Pure. Detects the failure mode that hid for 10.5 hours on 2026-08-03: the engine is
 * alive, holding the slot, reporting a healthy duty cycle -- and running nothing that
 * pays rank. Deliberately qualified rather than a bare `rankProducingSec === 0`, because
 * this spec designs for three states that legitimately produce zero rank time
 * (blocker-10's lesson applied to a new field): every action quarantined (already flagged
 * by `allActionsQuarantined`), the post-install `Training` regime (S9a, capped at 30 min),
 * and a long yield to a higher-priority claimant (that time lands in `yieldedSec`, not
 * `overheadSec`).
 * @returns {{stalled:boolean, sinceMs:number|null, reason:string}}
 */
export function detectOverheadStall({ nowMs, lastRankProducingMs, allActionsQuarantined, inPostInstallRegime, warnAfterMs = OVERHEAD_STALL_WARN_MS }) {
  if (allActionsQuarantined) return { stalled: false, sinceMs: lastRankProducingMs, reason: "all-quarantined" };
  if (inPostInstallRegime) return { stalled: false, sinceMs: lastRankProducingMs, reason: "post-install-regime" };
  if (!Number.isFinite(lastRankProducingMs)) return { stalled: false, sinceMs: null, reason: "no-baseline" };
  const elapsed = nowMs - lastRankProducingMs;
  if (elapsed < warnAfterMs) return { stalled: false, sinceMs: lastRankProducingMs, reason: "within-budget" };
  return { stalled: true, sinceMs: lastRankProducingMs, reason: "no-rank-producing-time" };
}

// ---- S2/S3 -- slot ownership, bounded yields, rep-starvation detector --------------

function budgetForClaimant(claimant, streak) {
  if (claimant === STUDY_CLAIMANT) return STUDY_YIELD_MAX_MS;
  const doublings = Math.min(streak, YIELD_ESCALATION_MAX_DOUBLINGS);
  return BACKDOOR_YIELD_MAX_MS * 2 ** doublings;
}

/**
 * Pure (S2.1-S2.4). Decides this tick's yield state for `claimant` (or `null` if nobody
 * wants the slot). `activity` is the caller's already-resolved "busy"/"idle"/null signal
 * (S2.2 -- presence+marker for the backdoor scripts, presence-only for
 * studybootstrap.js, `detectRepStarvation`'s `fired` for the rep claimant).
 *
 * Reclaim is UNCONDITIONAL at the budget bound -- a claimant that never clears its
 * marker cannot starve the win path indefinitely (S2.4's anti-livelock guarantee); the
 * cost is an escalating budget (180->360->720->1,440s) plus a fairness floor
 * (`MIN_HOLD_AFTER_OVERRUN_MS`) so the escalation can never converge on "the claimant
 * owns the slot".
 * @param {string|null} claimant
 * @param {"busy"|"idle"|null} activity
 * @param {number} nowMs
 * @param {{claimant:string, sinceMs:number, budgetMs:number}|null} priorGrant
 * @param {{overrunStreak?:Record<string,number>, fairnessUntilMs?:Record<string,number>, rollingHourRepYieldMs?:number}} [budgets]
 */
export function resolveYieldGrant(claimant, activity, nowMs, priorGrant, budgets = {}) {
  const overrunStreak = budgets.overrunStreak ?? {};
  const fairnessUntilMs = budgets.fairnessUntilMs ?? {};
  const rollingHourRepYieldMs = budgets.rollingHourRepYieldMs ?? 0;
  // Injectable so the slice mechanism stays under test even though the live cap is 0
  // (2026-08-03). If option (b) -- retargeting scoreAug at combat mults -- is ever taken,
  // this machinery must still be known-good rather than quietly rotted.
  const maxRepYieldDuty = budgets.maxRepYieldDuty ?? MAX_REP_YIELD_DUTY;
  const wantsSlot = claimant !== null && claimant !== undefined && activity === "busy";
  const base = { claimant, overrunStreak, fairnessUntilMs, overrun: false, ended: null, refused: false, livelockSuspected: false };

  if (priorGrant && priorGrant.claimant === claimant) {
    if (wantsSlot) {
      const elapsed = nowMs - priorGrant.sinceMs;
      if (elapsed < priorGrant.budgetMs) {
        return { ...base, yield: true, budgetMs: priorGrant.budgetMs, sinceMs: priorGrant.sinceMs, reason: "continuing" };
      }
      const streak = (overrunStreak[claimant] ?? 0) + 1;
      return {
        ...base,
        yield: false,
        budgetMs: priorGrant.budgetMs,
        sinceMs: priorGrant.sinceMs,
        reason: "overrun",
        overrun: true,
        ended: "overrun",
        overrunStreak: { ...overrunStreak, [claimant]: streak },
        fairnessUntilMs: { ...fairnessUntilMs, [claimant]: nowMs + MIN_HOLD_AFTER_OVERRUN_MS },
        livelockSuspected: streak >= LIVELOCK_WARN_STREAK,
      };
    }
    return {
      ...base,
      yield: false,
      budgetMs: priorGrant.budgetMs,
      sinceMs: priorGrant.sinceMs,
      reason: "clean",
      ended: "clean",
      overrunStreak: { ...overrunStreak, [claimant]: 0 },
    };
  }

  if (!wantsSlot) return { ...base, yield: false, budgetMs: 0, sinceMs: null, reason: "not-requested" };

  const fairnessFloor = fairnessUntilMs[claimant];
  if (typeof fairnessFloor === "number" && nowMs < fairnessFloor) {
    return { ...base, yield: false, budgetMs: 0, sinceMs: null, reason: "fairness-floor" };
  }
  if (claimant === REP_YIELD_CLAIMANT) {
    if (rollingHourRepYieldMs + REP_YIELD_SLICE_MS > maxRepYieldDuty * 3_600_000) {
      return { ...base, yield: false, budgetMs: 0, sinceMs: null, reason: "rep-cap-refused", refused: true };
    }
    return { ...base, yield: true, budgetMs: REP_YIELD_SLICE_MS, sinceMs: nowMs, reason: "granted" };
  }
  return { ...base, yield: true, budgetMs: budgetForClaimant(claimant, overrunStreak[claimant] ?? 0), sinceMs: nowMs, reason: "granted" };
}

/**
 * Pure (S3, fixes reviewer blocker 2). Splits the old `estimateRepRatePerSec`'s
 * overloaded `null` into three meanings so "no measurable progress" (stalled) stops
 * being indistinguishable from "no data" (unknown) -- the defect that made the old
 * detector structurally unable to fire.
 * @param {{workTarget:{aug:string,faction:string,deficit:number}}|null} prevAugState
 * @param {{workTarget:{aug:string,faction:string,deficit:number}}|null} currAugState
 * @param {number} dtSec
 */
export function classifyRepProgress(prevAugState, currAugState, dtSec) {
  const prev = prevAugState?.workTarget;
  const curr = currAugState?.workTarget;
  if (!prev || !curr || !(dtSec > 0)) return { status: "unknown", ratePerSec: null };
  if (prev.aug !== curr.aug || prev.faction !== curr.faction) return { status: "unknown", ratePerSec: null };
  const closed = prev.deficit - curr.deficit;
  if (closed > 0) return { status: "progressing", ratePerSec: closed / dtSec };
  return { status: "stalled", ratePerSec: 0 };
}

/** Pure (internal). estimateRepRatePerSec retained ONLY as classifyRepProgress's internal rate computation (WI2). */
function estimateRepRatePerSec(prevAugState, currAugState, dtSec) {
  const { ratePerSec } = classifyRepProgress(prevAugState, currAugState, dtSec);
  return ratePerSec !== null && ratePerSec > 0 ? ratePerSec : null;
}

/**
 * Pure. Is a rep yield WORTH the win-path time it costs? Gated on the size of the rep
 * deficit rather than a flat duty percentage, because cheap deficits are NeuroFlux
 * Governor (+1% to all mults including combat -> duty cycle -> rank) while expensive ones
 * are the hacking augs, which are worth zero toward rank 400,000. See
 * `REP_YIELD_MAX_DEFICIT` for the measured numbers behind the split.
 * @param {{workTarget?:{deficit?:number}}|null} augState
 */
export function repYieldWorthwhile(augState, maxDeficit = REP_YIELD_MAX_DEFICIT) {
  const deficit = augState?.workTarget?.deficit;
  if (typeof deficit !== "number" || !Number.isFinite(deficit)) return { worthwhile: false, deficit: null, reason: "no-deficit" };
  if (deficit <= 0) return { worthwhile: false, deficit, reason: "already-met" };
  if (deficit > maxDeficit) return { worthwhile: false, deficit, reason: "deficit-too-expensive" };
  return { worthwhile: true, deficit, reason: "cheap-enough" };
}

/**
 * Pure (S3, fixes reviewer blocker 2). Reads `workTarget.*` (NOT `target.*` -- the head
 * purchase target reads `deficit: 0` exactly when the ratchet is grinding normally, which
 * is the bug that made the old detector unreachable). `priorState` carries the
 * accumulators forward across calls; `status === "unknown"` is inert in both directions
 * (neither accumulates toward firing nor clears an existing fire).
 * @param {{phase:string, workTarget:{aug:string,faction:string,deficit:number}, timestamp:number}|null} augState
 * @param {number} nowMs
 * @param {{fired?:boolean, accumSinceMs?:number|null, clearAccumSinceMs?:number|null, lastAugState?:object|null, lastReadMs?:number|null}|null} priorState
 */
export function detectRepStarvation(augState, nowMs, priorState) {
  const prior = priorState ?? {};
  const dtSec = typeof prior.lastReadMs === "number" ? (nowMs - prior.lastReadMs) / 1000 : 0;
  const fresh = typeof augState?.timestamp === "number" ? nowMs - augState.timestamp <= AUG_STATE_FRESH_MS : augState != null;
  const effectiveCurr = fresh ? augState : null;
  const { status, ratePerSec } = classifyRepProgress(prior.lastAugState ?? null, effectiveCurr, dtSec);

  const phase = augState?.phase;
  const deficit = augState?.workTarget?.deficit;
  const grinding = phase === "grinding" && typeof deficit === "number" && deficit > 0;
  const noProgress = status === "stalled" || (status === "progressing" && ratePerSec < REP_STARVED_RATE);
  const starvedNow = grinding && noProgress;

  // 🔴 FIXED 2026-08-04. This used to be `starvedNow ? (accumSinceMs ?? nowMs) : null`,
  // which HARD-RESET the accumulator whenever augfarmer's phase was momentarily anything
  // other than "grinding". augfarmer cycles through awaiting-money / yielded / gate-fill /
  // install-ready / paused constantly, so any blip erased all accumulated evidence -- and
  // with a 30-minute window the detector could essentially never complete one. Live proof:
  // ZERO rep-starvation events ever logged, across days of genuine 503x rep starvation.
  //
  // The fix separates two things the old line conflated. Only EVIDENCE THAT REP IS MOVING
  // (or the deficit being met) is grounds to erase accumulated starvation. A momentary
  // non-grinding phase is INERT -- exactly how `status === "unknown"` is already treated,
  // and for the same reason: absence of evidence is not evidence of health.
  const measurableProgress = status === "progressing" && ratePerSec >= REP_STARVED_RATE;
  const deficitMet = augState != null && (augState.workTarget == null || (typeof deficit === "number" && deficit <= 0));
  let accumSinceMs = prior.accumSinceMs ?? null;
  if (measurableProgress || deficitMet) {
    accumSinceMs = null;
  } else if (starvedNow) {
    accumSinceMs = accumSinceMs ?? nowMs;
  }

  const wasFired = prior.fired ?? false;
  let fired = wasFired;
  if (!fired && accumSinceMs !== null && nowMs - accumSinceMs >= REP_STARVED_SUSTAIN_MS) fired = true;

  const clearingNow = status === "progressing" && ratePerSec >= REP_STARVED_CLEAR_RATE;
  let clearAccumSinceMs = prior.clearAccumSinceMs ?? null;
  if (status !== "unknown") {
    clearAccumSinceMs = clearingNow ? (clearAccumSinceMs ?? nowMs) : null;
  }

  const deficitGone = deficitMet;
  const notGrinding = augState != null && phase !== "grinding";
  let clearedNow = false;
  if (fired && ((clearingNow && clearAccumSinceMs !== null && nowMs - clearAccumSinceMs >= REP_STARVED_CLEAR_MS) || deficitGone || notGrinding)) {
    fired = false;
    clearedNow = true;
  }

  return {
    fired,
    status,
    ratePerSec,
    accumSinceMs,
    clearAccumSinceMs,
    lastAugState: augState,
    lastReadMs: nowMs,
    clearedNow,
    justFired: fired && !wasFired,
  };
}

// ---- Decision 3 -- higher-priority player-action-slot claimants --------------------

/** Pure. The name of any running higher-priority claimant, or `null`. `processList` is `ns.ps("home")`'s output. */
export function higherPriorityClaimant(processList) {
  for (const p of processList) {
    if (HIGHER_PRIORITY_CLAIMANTS.includes(p.filename)) return p.filename;
  }
  return null;
}

/**
 * Pure. Distinguishes "resident but idle" from "mid-installBackdoor()" via the
 * claimant's own activity marker. Fails toward `"busy"` on every ambiguous case
 * (missing/malformed marker, active:true, a stale timestamp).
 * @param {{active:boolean, timestamp:number}|null} activity
 */
export function classifyBackdoorActivity(activity, nowMs) {
  if (!activity || typeof activity.timestamp !== "number") return "busy";
  if (activity.active) return "busy";
  if (nowMs - activity.timestamp > BACKDOOR_ACTIVITY_FRESH_MS) return "busy";
  return "idle";
}

// ---- S1/S7 -- telemetry -------------------------------------------------------------

/** Pure. A fresh since-startup accumulator (S1's `totals`). Persisted across restarts -- an in-memory total cannot survive augfarmer's installs killing/relaunching this engine repeatedly. */
export function emptyTotals() {
  return { wallSec: 0, actionSec: 0, rankGained: 0, rankProducingSec: 0, overheadSec: 0, yieldedSec: 0, idleSec: 0, postInstallSec: 0, restarts: 0 };
}

/**
 * Pure. Folds one per-tick sample into the since-startup totals. `sample.kind` is one of
 * "rank"/"overhead"/"yielded"/"idle" and is exhaustive -- every tick's `wallSec` lands in
 * exactly one of `rankProducingSec`/`overheadSec`/`yieldedSec`/`idleSec`, so the four
 * always sum to `wallSec`. `actionSec` (S1's honest duty numerator) is verified-running
 * time only, independent of `kind`.
 */
export function accumulateTotals(totals, sample) {
  const wallSec = sample.wallSec ?? 0;
  return {
    wallSec: totals.wallSec + wallSec,
    actionSec: totals.actionSec + (sample.actionSec ?? 0),
    rankGained: totals.rankGained + (sample.rankDelta ?? 0),
    rankProducingSec: totals.rankProducingSec + (sample.rankProducingSec ?? 0),
    overheadSec: totals.overheadSec + (sample.kind === "overhead" ? wallSec : 0),
    yieldedSec: totals.yieldedSec + (sample.kind === "yielded" ? wallSec : 0),
    idleSec: totals.idleSec + (sample.kind === "idle" ? wallSec : 0),
    postInstallSec: totals.postInstallSec + (sample.postInstallSec ?? 0),
    restarts: totals.restarts,
  };
}

/**
 * Pure. Restores `detectRepStarvation`'s accumulator across a restart.
 *
 * 🔴 WITHOUT THIS THE D11a GUARD CAN NEVER FIRE, and that was the live state on
 * 2026-08-03. The detector needs `REP_STARVED_SUSTAIN_MS` (30 min) of *continuous*
 * starvation before it fires -- but `repStarvationState` was initialised to `null` on
 * every startup and nothing read it back, while the engine restarts routinely (22 startups
 * in one log ring: augfarmer's installs kill it, daemon.js's supervisor relaunches it,
 * every deploy restarts it). Any restart inside the window reset the accumulator to zero,
 * so the entire mechanism protecting the ratchet from Bladeburner had never once fired.
 * Measured cost of that: rep accrued at **0.0023 rep/s while starved vs 1.1631 rep/s while
 * working -- a 503x difference** -- which is why the aug ratchet sat 54h without an install.
 *
 * This is exactly the bug class `seedTotals` already exists to solve ("installs restart
 * this engine repeatedly and an in-memory total cannot span a 24h window"); the starvation
 * accumulator has the identical requirement and simply never got the identical fix.
 *
 * ⚠️ Bounded by `maxAgeMs`: a genuinely old snapshot is NOT restored, so the engine can
 * never resume a stale accumulation from days ago and fire instantly on startup.
 * `lastAugState` is deliberately not restored -- the first tick after a restart then reads
 * `"unknown"`, which S3 makes inert in both directions, so it costs one tick, not a verdict.
 * @param {any} state parsed bladeburner-state.json, or null
 */
export function seedRepStarvation(state, nowMs, maxAgeMs = 15 * 60_000) {
  const prior = state?.repStarvation;
  if (!prior || typeof prior !== "object") return null;
  if (!Number.isFinite(state?.timestamp) || nowMs - state.timestamp > maxAgeMs) return null;
  const accumSinceMs = Number.isFinite(prior.sinceMs) ? prior.sinceMs : null;
  if (accumSinceMs === null && prior.fired !== true) return null;
  return {
    fired: prior.fired === true,
    accumSinceMs,
    clearAccumSinceMs: null,
    lastAugState: null,
    lastReadMs: null,
  };
}

/** Pure. Recovers totals from a persisted bladeburner-state.json so a restart continues the measurement. Malformed/partial input degrades to fresh rather than throwing. */
export function seedTotals(state) {
  const fresh = emptyTotals();
  const prior = state?.totals;
  // `wallSec` is the schema sentinel: Phase 38's totals shape had NO such field (it used
  // `heldSec`/`uptimeSec`), but coincidentally shared the `rankGained` AND `overheadSec`
  // field NAMES with this shape -- confirmed live 2026-08-03, first Phase 39 restart:
  // a Phase-38-shaped state seeded `rankGained: 1824.8` / `overheadSec: 48720` (real old
  // cumulative values) against a fresh `wallSec: 0`, producing a `rankPerWallSec` of
  // ~12-29 (vs. a true rate around 0.02-0.03) until enough new wallSec accrued to dilute
  // it back down. A totals blob missing `wallSec` entirely is therefore NOT a partially
  // corrupt instance of this shape -- it is a different, incompatible shape, and must be
  // rejected in full rather than field-by-field (which is what let the two colliding
  // names sneak through).
  if (!prior || typeof prior !== "object" || !("wallSec" in prior)) return fresh;
  const seeded = {};
  for (const key of Object.keys(fresh)) {
    const value = prior[key];
    seeded[key] = Number.isFinite(value) && value >= 0 ? value : fresh[key];
  }
  seeded.restarts += 1;
  return seeded;
}

/** Pure. Drops samples older than `maxWindowMs`, with a count cap as a runaway backstop -- see MAX_FINITE_WINDOW_MS/SAMPLE_HARD_CAP's declarations for why the count cap alone is insufficient. */
export function pruneSamples(samples, nowMs, maxWindowMs = MAX_FINITE_WINDOW_MS, hardCap = SAMPLE_HARD_CAP) {
  const cutoff = nowMs - maxWindowMs;
  let out = samples.length > 0 && samples[0].timestamp < cutoff ? samples.filter((s) => s.timestamp >= cutoff) : samples;
  if (out.length > hardCap) out = out.slice(out.length - hardCap);
  return out;
}

function summarizeWindow(wallSec, actionSec, rankGained, rankProducingSec, postInstallSec) {
  const rankPerWallSec = wallSec > 0 ? rankGained / wallSec : 0;
  const exPostInstallWallSec = wallSec - postInstallSec;
  return {
    wallSec,
    actionSec,
    rankGained,
    rankProducingSec,
    postInstallSec,
    rankPerWallSec,
    dutyCycle: wallSec > 0 ? actionSec / wallSec : 0,
    // S9a -- attribution only, never the graded number: excludes exactly the seconds
    // spent in the post-install regime (collapsed max HP/stamina), so a miss is
    // attributable ("40% of the week at maxHp 10") instead of merely observed.
    rankPerWallSecExPostInstall: exPostInstallWallSec > 0 ? (rankGained - 0) / exPostInstallWallSec : 0,
  };
}

/**
 * Pure (S1, WI1). Per-window `{wallSec, actionSec, rankGained, rankProducingSec,
 * postInstallSec, rankPerWallSec, dutyCycle, rankPerWallSecExPostInstall}` -- 🔴 the
 * single rule that would have caught every Phase 38 telemetry bug: no field here is
 * derived from the engine's own intent. `dutyCycle` comes from verified
 * `getCurrentAction()` time; `rankGained` comes from `getRank()` deltas. Finite windows
 * are derived from `samples` (pruned); `cumulative` from `totals` (persisted,
 * restart-proof).
 * @param {ReturnType<typeof emptyTotals>} totals
 * @param {{timestamp:number, wallSec:number, actionSec:number, rankDelta:number, rankProducingSec:number, postInstallSec:number}[]} samples
 * @param {Record<string, number>} windows
 * @param {number} nowMs
 */
export function computeWallRates(totals, samples, windows, nowMs) {
  const out = {};
  for (const [label, windowMs] of Object.entries(windows)) {
    const cutoff = Number.isFinite(windowMs) ? nowMs - windowMs : -Infinity;
    const inWindow = samples.filter((s) => s.timestamp >= cutoff && s.timestamp <= nowMs);
    const wallSec = inWindow.reduce((sum, s) => sum + (s.wallSec ?? 0), 0);
    const actionSec = inWindow.reduce((sum, s) => sum + (s.actionSec ?? 0), 0);
    const rankGained = inWindow.reduce((sum, s) => sum + (s.rankDelta ?? 0), 0);
    const rankProducingSec = inWindow.reduce((sum, s) => sum + (s.rankProducingSec ?? 0), 0);
    const postInstallSec = inWindow.reduce((sum, s) => sum + (s.postInstallSec ?? 0), 0);
    out[label] = summarizeWindow(wallSec, actionSec, rankGained, rankProducingSec, postInstallSec);
  }
  out.cumulative = summarizeWindow(totals.wallSec, totals.actionSec, totals.rankGained, totals.rankProducingSec, totals.postInstallSec);
  return out;
}

/** Pure. S13's `duty` block, derived from totals: the four exhaustive wall-time buckets. */
export function dutyFromTotals(totals) {
  return { rankProducingSec: totals.rankProducingSec, overheadSec: totals.overheadSec, yieldedSec: totals.yieldedSec, idleSec: totals.idleSec };
}

/** Ring-trims BB_LOG_FILE's in-memory buffer. */
export function appendBbLog(entries, record) {
  entries.push(record);
  if (entries.length > BB_LOG_MAX_ENTRIES) entries = entries.slice(entries.length - BB_LOG_MAX_ENTRIES);
  return entries;
}

/** Pure. Parses persisted BB_LOG_FILE content into a starting buffer -- malformed/missing/non-array all fall back to []. */
export function seedBbLog(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.length > BB_LOG_MAX_ENTRIES ? parsed.slice(parsed.length - BB_LOG_MAX_ENTRIES) : parsed;
}

/** Ring-trims BB_ATTEMPTS_FILE's in-memory buffer (S7). */
export function appendAttempt(entries, record) {
  entries.push(record);
  if (entries.length > BB_ATTEMPTS_MAX_ENTRIES) entries = entries.slice(entries.length - BB_ATTEMPTS_MAX_ENTRIES);
  return entries;
}

/** Pure. Parses persisted BB_ATTEMPTS_FILE content -- malformed/missing/non-array all fall back to []. */
export function seedAttempts(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.length > BB_ATTEMPTS_MAX_ENTRIES ? parsed.slice(parsed.length - BB_ATTEMPTS_MAX_ENTRIES) : parsed;
}

/** Pure (S7). Assembles one attempt-ledger record from already-read/computed values -- the caller supplies every field, this just fixes the shape. Unchanged shape (Phase 40 S1): also serves `kind: "complete"` records -- the caller spreads extra top-level fields (`attempts`/`success`/`estimated`, Revision 3) onto the returned object rather than this function growing new parameters. */
export function recordAttempt({ ts, kind, type, name, level, autolevel, startActionReturned, verified, predicted, observed, context }) {
  return { ts, kind, type, name, level, autolevel, startActionReturned, verified, predicted, observed, context };
}

/**
 * Pure (Phase 40 Rev 3, S1.1/S1.2). Settles one open action run by success-count
 * SUBTRACTION -- replaces `detectActionBoundary`'s time-based wrap detection entirely.
 * Revision 2's detector required the SAME action across consecutive ticks to observe a
 * wrap; measured live, the engine changes action on 99.3% of consecutive starts, so that
 * wrap essentially never occurred (21h live, zero `complete` records). The replacement
 * needs no boundary at all: the caller settles `openRun` whenever the NEXT verified start
 * fires (of any action -- the alternation IS the trigger) or, in the single-action regime
 * where nothing ever switches, after `SETTLE_MAX_MS` (`viaTimeout: true`).
 *
 * `successDelta < 0` (S1.2's counter-reset guard -- the game's per-action success counter
 * resetting, e.g. across an install; survival unconfirmed, Q40-16) is NEVER folded: the
 * caller discards the interval and re-baselines from the current read.
 *
 * `viaTimeout: true` is the one place an estimate enters the pipeline: `attempts` is
 * `max(successDelta, round(actionSec / actionTimeSec))` rather than the exact
 * `max(1, successDelta)` used on the primary (switch-triggered) path. A non-positive
 * `actionTimeMs` degrades to `max(1, successDelta)` rather than dividing by it.
 * @param {{type:string, name:string, level:number, successesBefore:number, rankBefore:number, startAtMs:number}} openRun
 * @param {{successesNow:number, rankNow:number, nowMs:number, actionTimeMs:number, viaTimeout?:boolean}} args
 * @returns {{discard:true, reason:"success-counter-reset"}|{discard:false, type:string, name:string, level:number, attempts:number, successes:number, success:boolean, rankDelta:number, actionSec:number, estimated:boolean, atMs:number}}
 */
/**
 * Pure (S1.2, rewritten 2026-08-10). Decides what the settlement pipeline does this
 * tick: settle the open interval, open a fresh one, or discard.
 *
 * 🔴 **WHY THIS EXISTS, AND WHY IT KEYS OFF THE GAME.** The first version of this gate
 * lived inline and read `trackable = verified && intendedAction && ...`, i.e. it keyed
 * off **the engine's own intent** — a variable set only when `startAction` fires.
 * Measured live: the engine parked on a single auto-repeating `Tracking` (correct
 * behaviour — `shouldStartAction` must not restart what is already running), so no
 * start fired, `intendedAction` went stale, `trackable` went false, and **settlement
 * stopped for 15+ minutes**. The `SETTLE_MAX_MS` fallback written *precisely* for the
 * single-action regime was gated behind the SAME flag, so it could never fire in the
 * one regime it exists to serve. Symptom: 408 governor decisions all reading
 * `samples: 0` while rank climbed normally at ~1,150/h.
 *
 * That is Phase 39's own rule broken one layer up — *no field may be derived from the
 * engine's own intent* — and it is why this is a **pure, tested** function now: six
 * unit tests covered `settleActionRun` (the arithmetic) while the gate deciding whether
 * it was ever REACHED had zero. A tested function is not a tested mechanism.
 *
 * `liveAction` is `ns.bladeburner.getCurrentAction()`'s `{type, name} | null` — the
 * game's answer, which stays correct across auto-repeats, parks, and missed starts.
 * @param {{type?:string,name?:string}|null} liveAction
 * @param {{type:string,name:string,startAtMs:number}|null} openRun
 * @param {number} nowMs
 * @param {number} [settleMaxMs]
 * @returns {{settle:{viaTimeout:boolean}|null, open:{type:string,name:string}|null, discard:boolean}}
 */
export function planSettlementStep({ liveAction, openRun, nowMs, settleMaxMs = SETTLE_MAX_MS }) {
  // General actions are not levelable and never settle (S6 scope).
  const trackable = !!(liveAction && liveAction.name && liveAction.type && liveAction.type !== "General");
  // Nothing trackable is running: drop any open interval rather than attributing it
  // across a gap. Never settle here -- the interval's end is unknown.
  if (!trackable) return { settle: null, open: null, discard: true };
  const same = openRun !== null && openRun.type === liveAction.type && openRun.name === liveAction.name;
  // A switch (or a cold start) -- settle the OLD interval by exact subtraction, then
  // re-baseline on what is running now.
  if (!same) {
    return { settle: openRun !== null ? { viaTimeout: false } : null, open: { type: liveAction.type, name: liveAction.name }, discard: false };
  }
  // Same action still running. The single-action-regime fallback: settle in place once
  // the interval has run long enough that waiting for a switch is starving the governor.
  if (nowMs - openRun.startAtMs >= settleMaxMs) {
    return { settle: { viaTimeout: true }, open: { type: liveAction.type, name: liveAction.name }, discard: false };
  }
  return { settle: null, open: null, discard: false };
}

export function settleActionRun(openRun, { successesNow, rankNow, nowMs, actionTimeMs, viaTimeout = false }) {
  const successDelta = successesNow - openRun.successesBefore;
  if (successDelta < 0) {
    return { discard: true, reason: "success-counter-reset" };
  }
  const rankDelta = Math.max(0, rankNow - openRun.rankBefore); // blocker 11: never negative -- a negative reading is an instrument fault, not a real decrease
  const actionSec = Math.max(0, (nowMs - openRun.startAtMs) / 1000);
  let attempts;
  if (viaTimeout) {
    if (!(actionTimeMs > 0)) {
      attempts = Math.max(1, successDelta);
    } else {
      const actionTimeSec = actionTimeMs / 1000;
      attempts = Math.max(successDelta, Math.round(actionSec / actionTimeSec));
    }
  } else {
    // Multi-rep intervals (auto-repeat + bonus time can complete >1 rep before the next
    // start) can read successDelta > 1 -- attempts = max(1, successDelta) keeps
    // successes <= attempts by construction. Known, bounded bias (S1.2): an interval with
    // 2 reps of which 1 failed settles as 1/1 -- overestimates success, bounded because it
    // requires the engine NOT to switch, which happens 99.3% of the time.
    attempts = Math.max(1, successDelta);
  }
  return {
    discard: false,
    type: openRun.type,
    name: openRun.name,
    level: openRun.level,
    attempts,
    successes: successDelta,
    success: successDelta >= 1,
    rankDelta,
    actionSec,
    estimated: !!viaTimeout,
    atMs: nowMs,
  };
}

/** Pure (Phase 40 S1.1). A stable per-skill-levels fingerprint for `context.skillLevelsHash` -- a missing skill reads 0, not undefined, so a partial `skillLevels` object still fingerprints deterministically. */
export function skillLevelsFingerprint(skillLevels, order) {
  return order.map((s) => skillLevels[s] ?? 0).join("/");
}

/** Pure (S14). `null` while below the uptime threshold; otherwise the PASS/FAIL verdict against C1_BAR. */
export function evaluateC1(totals) {
  const uptimeMs = totals.wallSec * 1000;
  if (uptimeMs < C1_UPTIME_MS) return null;
  const rate = totals.wallSec > 0 ? totals.rankGained / totals.wallSec : 0;
  return { met: rate >= C1_BAR, rankPerWallSec: rate, bar: C1_BAR };
}

/** Pure (S14.3). C3-A -- engine health while Stage B is gated shut: C1's bar held for a week, plus a duty-cycle floor (the term that actually catches stamina-thrashing/quarantine-flooded degradation). */
export function evaluateC3A(totals) {
  const uptimeMs = totals.wallSec * 1000;
  if (uptimeMs < C3_UPTIME_MS) return null;
  const rate = totals.wallSec > 0 ? totals.rankGained / totals.wallSec : 0;
  const dutyCycle = totals.wallSec > 0 ? totals.actionSec / totals.wallSec : 0;
  return { met: rate >= C1_BAR && dutyCycle >= C3A_DUTY_BAR, rankPerWallSec: rate, dutyCycle, bar: C1_BAR, dutyBar: C3A_DUTY_BAR };
}

/** Pure (S14.3). C3-B never evaluates while STAGE_B_ENABLED is a hard `false` module constant -- reported `not-applicable`, never `miss` (a miss here would be a false negative in the node-level fallback conversation). */
export function evaluateC3B(stageBEnabled) {
  if (!stageBEnabled) return { status: "not-applicable", reason: "STAGE_B_ENABLED false" };
  // No runtime path reaches here in this build -- STAGE_B_ENABLED has no lift path (S5).
  // A future session that flips the constant must also add the since-flip accumulation
  // this verdict would need; left unimplemented deliberately rather than as dead code
  // for a state that cannot currently occur.
  return { status: "not-applicable", reason: "since-flip accumulation not yet implemented" };
}

/** Pure. Assembles the bladeburner-state.json snapshot (S13) from already-computed values. */
export function buildBbState(fields) {
  const { now } = fields;
  return {
    timestamp: now,
    time: new Date(now).toLocaleTimeString(),
    ...fields,
  };
}

// ---- Phase 40 -- the autolevel governor (S2). Every function here is pure and takes no
// `ns`/candidate object -- D3's guard, structural: `getActionEstimatedSuccessChance`
// cannot reach the controller because nothing here can call it (V2). --------------------

/** Pure (S2.1). A fresh per-action governor state -- the shape `foldSettlement`/`applyLevelDecision`/`seedLevelGovernor` all operate on. */
export function emptyActionGovernorState(type) {
  return {
    type,
    level: null,
    governed: false,
    adopted: false,
    governorFailedUntilMs: null,
    levelSetAtMs: null,
    ceilingLevel: null,
    ceilingSetAtMs: null,
    hardCeilingLevel: null,
    hardCeilingSetAtMs: null,
    regimeResetAppliedAtMs: null,
    drops: [],
    raiseStreak: 0,
    recentWindow: [],
    byLevel: {},
    settlements: 0,
    estimatedSettlements: 0,
    lastDecision: null,
  };
}

/**
 * Pure (S2.5's `levelDropsInWindow` helper, fixes blocker 4's rule 6c). Sums `.levels`
 * for `drops` entries newer than `windowMs` -- OUR level reductions only (a regime reset
 * is not charged here, S2.2 rule 2).
 * @param {{atMs:number, levels:number}[]} drops
 */
export function levelDropsInWindow(drops, nowMs, windowMs) {
  if (!Array.isArray(drops)) return 0;
  return drops.filter((d) => d && Number.isFinite(d.atMs) && nowMs - d.atMs < windowMs).reduce((sum, d) => sum + (d.levels ?? 0), 0);
}

/**
 * Pure. The autolevel governor's decision for ONE action. Reads realised outcomes only --
 * `getActionEstimatedSuccessChance` appears nowhere in this call graph (D3, V2).
 * S2.2's rule table, evaluated in order; the first matching rule returns.
 * @param {{
 *   name?: string, type?: "Contracts"|"Operations",
 *   level: number, governed: boolean, attempts: number, successes: number, rankSum?: number,
 *   levelSpan: {min:number, max:number}|null,
 *   levelSetAtMs: number|null,
 *   ceilingLevel: number|null, ceilingSetAtMs: number|null,
 *   hardCeilingLevel: number|null, hardCeilingSetAtMs: number|null,
 *   regimeResetAppliedAtMs: number|null,
 *   drops: {atMs:number, levels:number}[],
 *   governorFailedUntilMs: number|null,
 *   raiseStreak: number
 * }} actionOutcome
 * @param {{ nowMs:number, regimeEnteredAtMs?:number|null, cohortCollapsed?:boolean,
 *           minSamples?:number, lowerBand?:number, raiseBand?:number, cooldownMs?:number,
 *           minLevel?:number, ceilingHoldMs?:number, hardCeilingRetryMs?:number,
 *           maxRaiseStep?:number, maxTotalDrop?:number, dropBudgetMs?:number }} opts
 * @returns {{ decision:"hold"|"lower"|"raise"|"insufficient-data",
 *             toLevel:number|null, successRate:number|null, samples:number,
 *             levelSpan:{min:number,max:number}|null, reason:string }}
 */
export function planLevelAdjustment(actionOutcome, opts = {}) {
  const {
    nowMs,
    regimeEnteredAtMs = null,
    cohortCollapsed = false,
    minSamples = LEVEL_MIN_SAMPLES,
    lowerBand = LEVEL_LOWER_BAND,
    raiseBand = LEVEL_RAISE_BAND,
    cooldownMs = LEVEL_COOLDOWN_MS,
    minLevel = LEVEL_FLOOR,
    ceilingHoldMs = LEVEL_CEILING_HOLD_MS,
    hardCeilingRetryMs = LEVEL_HARD_CEILING_RETRY_MS,
    maxRaiseStep = LEVEL_MAX_RAISE_STEP,
    maxTotalDrop = LEVEL_MAX_TOTAL_DROP,
    dropBudgetMs = LEVEL_DROP_BUDGET_MS,
  } = opts;
  const {
    level, attempts, successes, governed, levelSetAtMs, ceilingLevel, ceilingSetAtMs,
    hardCeilingLevel, hardCeilingSetAtMs, regimeResetAppliedAtMs, drops = [],
    governorFailedUntilMs = null, raiseStreak = 0, levelSpan = null,
  } = actionOutcome;

  // Rule 1 -- never act on a malformed record.
  if (
    !Number.isFinite(level) || level < 0 ||
    !Number.isFinite(attempts) || attempts < 0 ||
    !Number.isFinite(successes) || successes < 0 ||
    successes > attempts
  ) {
    return { decision: "insufficient-data", toLevel: null, successRate: null, samples: attempts, levelSpan, reason: "bad-input" };
  }

  const successRate = attempts > 0 ? successes / attempts : null;

  // Rule 1b -- a setter that didn't take is not retried immediately.
  if (governorFailedUntilMs !== null && governorFailedUntilMs !== undefined && nowMs < governorFailedUntilMs) {
    return { decision: "hold", toLevel: null, successRate, samples: attempts, levelSpan, reason: "governor-failed" };
  }

  const regimeArmed = regimeEnteredAtMs !== null && regimeEnteredAtMs !== undefined &&
    (regimeResetAppliedAtMs === null || regimeResetAppliedAtMs === undefined || regimeResetAppliedAtMs < regimeEnteredAtMs);

  // Rule 2 -- post-install reset, latched to once per regime entry (blocker 3).
  if (regimeEnteredAtMs !== null && regimeEnteredAtMs !== undefined && governed === true && regimeArmed) {
    const toLevel = Math.max(minLevel, Math.floor(level / 2));
    return { decision: "lower", toLevel, successRate, samples: attempts, levelSpan, reason: "post-install-reset" };
  }

  // Rule 3 -- an ungoverned action during a regime is left to autolevel (rule 6 catches a
  // real collapse empirically at a cost of <=1 window).
  if (regimeEnteredAtMs !== null && regimeEnteredAtMs !== undefined && governed === false) {
    return { decision: "hold", toLevel: null, successRate, samples: attempts, levelSpan, reason: "ungoverned-regime" };
  }

  // Rule 4 -- sample floor.
  if (attempts < minSamples) {
    return { decision: "insufficient-data", toLevel: null, successRate, samples: attempts, levelSpan, reason: "samples" };
  }

  // Rule 5 -- wall-clock anti-thrash floor.
  if (levelSetAtMs !== null && levelSetAtMs !== undefined && nowMs - levelSetAtMs < cooldownMs) {
    return { decision: "hold", toLevel: null, successRate, samples: attempts, levelSpan, reason: "cooldown" };
  }

  if (successRate < lowerBand) {
    // Rule 6's floor-clamp degrade, evaluated before the cohort guard: at the floor there
    // is no "lower" decision for 5b to guard in the first place.
    if (level <= minLevel) {
      return { decision: "hold", toLevel: null, successRate, samples: attempts, levelSpan, reason: "at-floor" };
    }
    // Rule 5b (blocker 4) -- a cohort-wide collapse is not an autolevel problem.
    if (cohortCollapsed === true) {
      return { decision: "hold", toLevel: null, successRate, samples: attempts, levelSpan, reason: "cohort-collapse" };
    }
    // Rule 6 -- lower, asymmetric step sized to how far below band we are.
    let step = successRate < 0.2 ? 4 : successRate < 0.4 ? 2 : 1;
    // Rule 6c -- the drop budget, regardless of cause.
    const priorDrops = levelDropsInWindow(drops, nowMs, dropBudgetMs);
    if (priorDrops + step > maxTotalDrop) {
      const remaining = maxTotalDrop - priorDrops;
      if (remaining <= 0) {
        return { decision: "hold", toLevel: null, successRate, samples: attempts, levelSpan, reason: "drop-budget" };
      }
      step = remaining;
    }
    const toLevel = Math.max(minLevel, level - step);
    const reason = governed === false ? "take-ownership" : "below-band";
    return { decision: "lower", toLevel, successRate, samples: attempts, levelSpan, reason };
  }

  // Rule 7 -- D5's no-op guarantee: an ungoverned, healthy action is never touched.
  if (governed === false) {
    return { decision: "hold", toLevel: null, successRate, samples: attempts, levelSpan, reason: "autolevel-healthy" };
  }

  // Rule 8 -- raise, streak-accelerated, clamped to whichever ceiling still holds.
  if (successRate >= raiseBand) {
    const step = Math.min(maxRaiseStep, 1 + raiseStreak);
    let toLevel = level + step;
    const ceilingActive = ceilingLevel !== null && ceilingLevel !== undefined && ceilingSetAtMs !== null && ceilingSetAtMs !== undefined && nowMs - ceilingSetAtMs < ceilingHoldMs;
    if (ceilingActive) toLevel = Math.min(toLevel, ceilingLevel - 1);
    const hardCeilingActive = hardCeilingLevel !== null && hardCeilingLevel !== undefined && hardCeilingSetAtMs !== null && hardCeilingSetAtMs !== undefined && nowMs - hardCeilingSetAtMs < hardCeilingRetryMs;
    if (hardCeilingActive) toLevel = Math.min(toLevel, hardCeilingLevel);
    // Rule 9 -- the clamp ate the whole step.
    if (toLevel <= level) {
      return { decision: "hold", toLevel: null, successRate, samples: attempts, levelSpan, reason: "ceiling" };
    }
    return { decision: "raise", toLevel, successRate, samples: attempts, levelSpan, reason: "above-band" };
  }

  // Rule 10 -- the intended steady state.
  return { decision: "hold", toLevel: null, successRate, samples: attempts, levelSpan, reason: "in-band" };
}

/**
 * Pure. Is the whole sampled cohort down, or is one action down? Chaos and population are
 * city-scoped and hit every action equally, so a cohort-wide collapse is NOT an autolevel
 * problem and must not be answered by lowering levels (blocker 4).
 * @param {{name:string, attempts:number, successes:number}[]} outcomes
 * @param {{minSamples?:number, lowerBand?:number, minActions?:number}} opts
 * @returns {{collapsed:boolean, sampled:number, belowBand:number, reason:string}}
 */
export function classifyCohort(outcomes, opts = {}) {
  const { minSamples = LEVEL_MIN_SAMPLES, lowerBand = LEVEL_LOWER_BAND, minActions = COHORT_MIN_ACTIONS } = opts;
  const sampledList = (outcomes ?? []).filter((o) => Number.isFinite(o?.attempts) && o.attempts >= minSamples);
  const belowBandList = sampledList.filter((o) => (o.attempts > 0 ? o.successes / o.attempts : 0) < lowerBand);
  const sampled = sampledList.length;
  const belowBand = belowBandList.length;
  if (sampled < minActions) {
    return { collapsed: false, sampled, belowBand, reason: "single-action-cohort" };
  }
  const collapsed = belowBand === sampled;
  return { collapsed, sampled, belowBand, reason: collapsed ? "cohort-collapse" : "not-collapsed" };
}

/**
 * Pure. Folds an APPLIED decision (and the actuator's read-back) into the action's
 * governor state. Never calls `ns` -- the caller supplies the read-back (S2.5, fixes
 * blocker 10). `hold`/`insufficient-data` are the identity: a decision that does nothing
 * must change nothing.
 * @param {ReturnType<typeof emptyActionGovernorState>} prior
 * @param {{decision:string, toLevel:number|null, reason:string}} decision
 * @param {{level:number, autolevel:boolean|null, ok:boolean}} readBack
 * @param {number} nowMs
 */
export function applyLevelDecision(prior, decision, readBack, nowMs) {
  const kind = decision?.decision;
  const toLevel = decision?.toLevel;
  const reason = decision?.reason;

  if (kind === "hold" || kind === "insufficient-data") {
    return { ...prior };
  }

  // Synthetic case: the actuator's step 1 (setActionAutolevel(false)) didn't take -- no
  // level was ever attempted (S3 step 1, S2.5's "autolevel read-back failed" row).
  if (kind === "autolevel-set-failed") {
    return { ...prior, governorFailedUntilMs: nowMs + LEVEL_SET_RETRY_MS, governed: false };
  }

  // Synthetic case: S5's revert -- ownership released deliberately, everything WE tracked
  // is cleared (Q40-12: this is the ONLY path that ever releases ownership).
  if (kind === "release") {
    return {
      ...prior,
      governed: false,
      ceilingLevel: null,
      ceilingSetAtMs: null,
      hardCeilingLevel: null,
      hardCeilingSetAtMs: null,
      raiseStreak: 0,
      drops: [],
      levelSetAtMs: null,
      recentWindow: [],
    };
  }

  if (kind === "lower") {
    const matched = readBack?.level === toLevel;
    if (matched && reason === "post-install-reset") {
      return {
        ...prior,
        level: readBack.level,
        governed: true,
        levelSetAtMs: nowMs,
        recentWindow: [],
        raiseStreak: 0,
        regimeResetAppliedAtMs: nowMs,
        ceilingLevel: null,
        ceilingSetAtMs: null,
        // hardCeilingLevel untouched; drops NOT charged (S2.5).
      };
    }
    if (matched) {
      const priorCeiling = prior.ceilingLevel === null || prior.ceilingLevel === undefined ? Infinity : prior.ceilingLevel;
      const replaceCeiling = prior.level < priorCeiling;
      return {
        ...prior,
        level: readBack.level,
        governed: true,
        levelSetAtMs: nowMs,
        recentWindow: [],
        raiseStreak: 0,
        drops: [...(prior.drops ?? []), { atMs: nowMs, levels: prior.level - readBack.level }],
        ceilingLevel: replaceCeiling ? prior.level : prior.ceilingLevel,
        ceilingSetAtMs: replaceCeiling ? nowMs : prior.ceilingSetAtMs,
      };
    }
    // Read-back mismatch on a lower is a genuine anomaly, not a max-level clamp.
    return {
      ...prior,
      level: readBack?.level ?? prior.level,
      governorFailedUntilMs: nowMs + LEVEL_SET_RETRY_MS,
      recentWindow: [],
    };
  }

  if (kind === "raise") {
    const matched = readBack?.level === toLevel;
    if (matched) {
      return {
        ...prior,
        level: readBack.level,
        raiseStreak: (prior.raiseStreak ?? 0) + 1,
        levelSetAtMs: nowMs,
        recentWindow: [],
      };
    }
    // Read-back < toLevel is a max-level clamp, not an error.
    return {
      ...prior,
      level: readBack?.level ?? prior.level,
      hardCeilingLevel: readBack?.level ?? prior.hardCeilingLevel,
      hardCeilingSetAtMs: nowMs,
      raiseStreak: 0,
      recentWindow: [],
    };
  }

  return { ...prior };
}

/**
 * Pure (S2.1; Revision 3 -- renamed + reshaped from `foldCompletion`). Folds one SETTLED
 * interval (`settleActionRun`'s non-discarded output) into the governor's per-action
 * state -- `recentWindow` (evicts oldest-first past `LEVEL_RECENT_WINDOW`) + `byLevel`
 * (keyed by the level AT COMPLETION, not the current level). `attempts`/`successes` are
 * SUMS now, not a boolean -- a multi-rep or `estimated` interval can represent more than
 * one attempt. `settleActionRun`'s `{discard: true}` shape is never passed in here -- the
 * caller filters it and logs its own warn instead.
 * @param {ReturnType<typeof emptyActionGovernorState>} governorState
 * @param {{name?:string, type?:string, level:number, attempts:number, successes:number, rankDelta:number, estimated:boolean, atMs:number}} settledOutcome
 */
export function foldSettlement(governorState, settledOutcome) {
  const prior = governorState ?? emptyActionGovernorState(settledOutcome?.type ?? null);
  const { level, attempts, successes, rankDelta, estimated, atMs } = settledOutcome;

  const recentWindow = [...(prior.recentWindow ?? []), { level, attempts, successes, rankDelta: rankDelta ?? 0, estimated: !!estimated, atMs }];
  const trimmedWindow = recentWindow.length > LEVEL_RECENT_WINDOW ? recentWindow.slice(recentWindow.length - LEVEL_RECENT_WINDOW) : recentWindow;

  const levelKey = String(level);
  const byLevelWithoutKey = { ...(prior.byLevel ?? {}) };
  const priorLevelStats = byLevelWithoutKey[levelKey] ?? { attempts: 0, successes: 0, rankSum: 0 };
  delete byLevelWithoutKey[levelKey]; // re-inserted below -- moves this key to the "most recently touched" end for pruneLevelOutcomes' LRU order
  const byLevelUnpruned = {
    ...byLevelWithoutKey,
    [levelKey]: {
      attempts: priorLevelStats.attempts + attempts,
      successes: priorLevelStats.successes + successes,
      rankSum: priorLevelStats.rankSum + (rankDelta ?? 0),
    },
  };

  return {
    ...prior,
    recentWindow: trimmedWindow,
    byLevel: pruneLevelOutcomes(byLevelUnpruned, LEVEL_OUTCOME_LEVELS_KEPT),
    settlements: (prior.settlements ?? 0) + 1,
    estimatedSettlements: (prior.estimatedSettlements ?? 0) + (estimated ? 1 : 0),
  };
}

/** Pure (S8). Drops the least-recently-touched `byLevel` entries past `keep` -- relies on `foldSettlement` re-inserting a touched key so object key order tracks recency. */
export function pruneLevelOutcomes(byLevel, keep = LEVEL_OUTCOME_LEVELS_KEPT) {
  const keys = Object.keys(byLevel ?? {});
  if (keys.length <= keep) return byLevel;
  const out = { ...byLevel };
  for (const k of keys.slice(0, keys.length - keep)) delete out[k];
  return out;
}

/**
 * Pure (S8, the `seedTotals` precedent). Restores the governor's restart-persistent
 * bookkeeping (ceilings, drops, byLevel, adoption/failure state) from a parsed
 * `bladeburner-state.json`. Deliberately does NOT restore `recentWindow` -- S4: "a lost
 * state file degrades to re-earn the samples, never to hand back ownership" -- the raw
 * settlement ring is not part of the persisted shape (only its derived summary is, for
 * observability); the live loop re-fills it from fresh settlements after a restart.
 *
 * Schema guard: a blob missing its own `constants` key is rejected WHOLE, not partially
 * adopted (the Phase 39 `seedTotals` regression, S8).
 * @param {any} raw parsed bladeburner-state.json, or null
 * @returns {{actions: Record<string, object>}|null}
 */
export function seedLevelGovernor(raw) {
  const block = raw?.levelGovernor;
  if (!block || typeof block !== "object" || !("constants" in block)) return null;
  const rawActions = block.actions && typeof block.actions === "object" ? block.actions : {};
  const actions = {};
  for (const [name, a] of Object.entries(rawActions)) {
    if (!a || typeof a !== "object") continue;
    const base = emptyActionGovernorState(typeof a.type === "string" ? a.type : null);
    actions[name] = {
      ...base,
      governorFailedUntilMs: Number.isFinite(a.governorFailedUntilMs) ? a.governorFailedUntilMs : null,
      levelSetAtMs: Number.isFinite(a.levelSetAtMs) ? a.levelSetAtMs : null,
      ceilingLevel: Number.isFinite(a.ceilingLevel) ? a.ceilingLevel : null,
      ceilingSetAtMs: Number.isFinite(a.ceilingSetAtMs) ? a.ceilingSetAtMs : null,
      hardCeilingLevel: Number.isFinite(a.hardCeilingLevel) ? a.hardCeilingLevel : null,
      hardCeilingSetAtMs: Number.isFinite(a.hardCeilingSetAtMs) ? a.hardCeilingSetAtMs : null,
      regimeResetAppliedAtMs: Number.isFinite(a.regimeResetAppliedAtMs) ? a.regimeResetAppliedAtMs : null,
      drops: Array.isArray(a.drops) ? a.drops.filter((d) => d && Number.isFinite(d.atMs) && Number.isFinite(d.levels)) : [],
      raiseStreak: Number.isFinite(a.raiseStreak) && a.raiseStreak >= 0 ? a.raiseStreak : 0,
      byLevel: a.byLevel && typeof a.byLevel === "object" ? a.byLevel : {},
      adopted: a.adopted === true,
    };
  }
  return {
    actions,
    settlements: Number.isFinite(block.settlements) && block.settlements >= 0 ? block.settlements : 0,
    estimatedSettlements: Number.isFinite(block.estimatedSettlements) && block.estimatedSettlements >= 0 ? block.estimatedSettlements : 0,
  };
}

// ---- Non-pure helpers (touch ns, kept tiny and uncovered by unit tests) -----------

function ts() {
  return { timestamp: Date.now(), time: new Date().toLocaleTimeString() };
}

function writeSlotHold(ns) {
  ns.write(SLOT_HOLD_FILE, JSON.stringify({ ts: Date.now(), holder: SLOT_HOLD_HOLDER_NAME }), "w");
}

function releaseSlotHold(ns) {
  try {
    ns.rm(SLOT_HOLD_FILE, "home");
  } catch {
    // best-effort -- augfarmer's staleness guard is the real backstop
  }
}

/** Tolerant JSON reader shared by every read-only cross-script state file this engine consumes. */
function readJsonState(ns, file) {
  const raw = ns.read(file);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Non-pure (ns-touching). Remaining counts for every tracked Contract/Operation -- feeds `isInventoryLow`. */
function getInventoryCounts(ns) {
  const counts = [];
  for (const [type, names] of [
    ["Contracts", CONTRACTS],
    ["Operations", OPERATIONS],
  ]) {
    for (const name of names) counts.push(ns.bladeburner.getActionCountRemaining(type, name));
  }
  return counts;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  if (!ns.bladeburner.inBladeburner()) {
    ns.tprint("ERROR: bladeburnermanager.js started without Bladeburner access -- exiting.");
    return;
  }

  let samples = []; // {timestamp, wallSec, actionSec, rankDelta, rankProducingSec, postInstallSec} -- finite windows only, pruned
  const persistedState = readJsonState(ns, BB_STATE_FILE);
  let totals = seedTotals(persistedState); // persists across restarts -- see emptyTotals's doc comment
  let logEntries = seedBbLog(ns.read(BB_LOG_FILE));
  let attemptEntries = seedAttempts(ns.read(BB_ATTEMPTS_FILE));
  logEntries = appendBbLog(logEntries, { ...ts(), kind: "startup", resumedTotals: { ...totals } });

  // Seeded from the persisted log so a restart doesn't re-announce a verdict already
  // recorded (the ring can age a verdict out -- re-logging it then is the right failure
  // direction for the phase's real deliverable).
  let checkpointC1Logged = logEntries.some((e) => e.kind === "checkpoint-C1");
  let checkpointC2Logged = logEntries.some((e) => e.kind === "checkpoint-C2");
  let checkpointC3Logged = logEntries.some((e) => e.kind === "checkpoint-C3");
  let firstLeadPerSecAtMs = logEntries.find((e) => e.kind === "crossover" && e.operationLeadsPerSec)?.ts ?? null;
  let firstLeadPerActionAtMs = logEntries.find((e) => e.kind === "crossover" && e.operationLeadsPerAction)?.ts ?? null;

  let previousOffMarker = null;
  let wasOffLastTick = false;
  let previousRank = ns.bladeburner.getRank();
  let previousAugState = readJsonState(ns, AUG_STATE_FILE);
  // Restored across restarts -- the 30-min starvation window is longer than this engine's
  // typical uptime between restarts, so an in-memory-only accumulator never completes it.
  let repStarvationState = seedRepStarvation(persistedState, Date.now());
  let lastMarkerWriteMs = 0;
  let lastStateWrite = 0;
  let staminaRecovering = false;
  let hpRecovering = false;
  let quarantineState = { failures: {}, quarantine: {} };
  let intendedAction = null; // {type, name} -- what we last called startAction with (main-loop intent, never trusted for telemetry)
  let pendingAttemptContext = null; // predicted/context captured at the moment we called startAction, finalized into a ledger record once verified next tick
  let lastGeneralRecheckMs = 0;
  let lastGeneralActionName = null;
  let cityStock = {};
  let cityBreachState = {}; // {cityName: Set<breachType>} -- edge-triggers city-breach warnings
  let previousCrossoverLeadsPerSec = null;
  let previousCrossoverLeadsPerAction = null;
  let lastCrossoverLogMs = 0;
  let lastYieldRefusedLogMs = 0;
  let postInstallTrainingMs = 0;
  let wasPostInstall = false;
  let activeGrant = null; // {claimant, sinceMs, budgetMs} | null -- S2's yieldedTo
  let overrunStreak = {};
  let fairnessUntilMs = {};
  let repYieldEvents = []; // {startMs, durationMs} -- rolling-hour ledger for S2.3's cap
  let hospitalizationsInferred = 0;
  let previousHp = null; // {current, max} -- S9's inference signal
  let previousActionWasHrc = false;
  let allActionsQuarantinedFlag = false;
  let lastRankProducingMs = Date.now(); // baseline for detectOverheadStall
  let overheadStallWarned = false;
  let overheadStall = { stalled: false, sinceMs: null, reason: "no-baseline" };
  let repYieldWorth = { worthwhile: false, deficit: null, reason: "no-read" };
  let diplomacyEvents = []; // {startMs, durationMs} -- rolling-hour ledger for MAX_DIPLOMACY_DUTY
  let diplomacyEffect = emptyDiplomacyEffect(); // the per-run chaos delta this policy is missing
  let diplomacyRunStart = null; // {atMs, chaosBefore} while a Diplomacy action is in flight
  let chaosByCity = {}; // all six cities -- free on RAM, and the data Q5 (rotation) needs
  let recoveryActionQuarantinedFlag = false;
  let livelockSuspected = null;

  // ---- Phase 40 -- autolevel governor + ledger repair state -------------------------
  // Revision 3: `boundaryState`/`previousElapsedMs` are GONE -- there is no time-based
  // wrap detector left. `openRunState` is the interval currently open for whichever
  // action is running, settled by subtraction at the NEXT verified start (of any action)
  // or, in the single-action regime, after SETTLE_MAX_MS.
  let openRunState = null; // {type, name, level, successesBefore, rankBefore, startAtMs} -- discarded (not settled) on any verification failure
  const seededGovernor = seedLevelGovernor(persistedState); // S8 -- null on a missing/malformed/schema-mismatched blob, never partially adopted
  let settlementsCount = seededGovernor?.settlements ?? 0; // levelGovernor.settlements (S1.2/S8) -- summed across actions for the state snapshot
  let estimatedSettlementsCount = seededGovernor?.estimatedSettlements ?? 0;
  let levelGovernorActions = seededGovernor ? { ...seededGovernor.actions } : {}; // {name: actionState} -- ownership itself is always reconciled live (S4), never trusted from this seed
  let regimeEnteredAtMs = null; // Phase 39's existing regime-enter edge, now also feeding S2.2 rule 2
  let forcedRestartAction = null; // {type, name, reason} -- S3 step 5, consumed by the NEXT tick's shouldStartAction call
  let lastLevelGovernLog = {}; // {name: {reason, atMs}} -- S8's edge-trigger-plus-heartbeat log gate
  let cohortWarnLogged = false;
  let singleActionCohortWarnLogged = false;
  let lastCohortReport = { collapsed: false, sampled: 0, belowBand: 0, reason: "no-data" };
  let governorRevertDone = false; // S5 -- fires the revert exactly once per "off" transition, not every tick
  let estimatedFractionWarnLogged = false; // edge-triggers "estimated-fraction-high" (S1.2) -- one warn per crossing, not one per tick

  // Shared by all three state-snapshot write sites (off-marker/interim/held) so
  // `levelGovernor.mode` is always one of the three values, per T2's verify:log check.
  const buildLevelGovernorSnapshot = () => ({
    mode: LEVEL_GOVERNOR_MODE,
    settlements: settlementsCount,
    estimatedSettlements: estimatedSettlementsCount,
    cohort: lastCohortReport,
    constants: {
      recentWindow: LEVEL_RECENT_WINDOW,
      minSamples: LEVEL_MIN_SAMPLES,
      lowerBand: LEVEL_LOWER_BAND,
      raiseBand: LEVEL_RAISE_BAND,
      cooldownMs: LEVEL_COOLDOWN_MS,
      ceilingHoldMs: LEVEL_CEILING_HOLD_MS,
      hardCeilingRetryMs: LEVEL_HARD_CEILING_RETRY_MS,
      maxRaiseStep: LEVEL_MAX_RAISE_STEP,
      maxTotalDrop: LEVEL_MAX_TOTAL_DROP,
      dropBudgetMs: LEVEL_DROP_BUDGET_MS,
      settleMaxMs: SETTLE_MAX_MS,
      estimatedWarnFraction: ESTIMATED_SAMPLE_WARN_FRACTION,
    },
    actions: Object.fromEntries(
      Object.entries(levelGovernorActions).map(([name, a]) => [
        name,
        {
          type: a.type,
          level: a.level,
          governed: a.governed,
          adopted: a.adopted,
          governorFailedUntilMs: a.governorFailedUntilMs,
          attempts: a.recentWindow.reduce((sum, e) => sum + (e.attempts ?? 0), 0),
          successes: a.recentWindow.reduce((sum, e) => sum + (e.successes ?? 0), 0),
          rankSum: a.recentWindow.reduce((sum, e) => sum + (e.rankDelta ?? 0), 0),
          levelSpan: a.recentWindow.length > 0
            ? { min: Math.min(...a.recentWindow.map((e) => e.level)), max: Math.max(...a.recentWindow.map((e) => e.level)) }
            : null,
          levelSetAtMs: a.levelSetAtMs,
          ceilingLevel: a.ceilingLevel,
          ceilingSetAtMs: a.ceilingSetAtMs,
          hardCeilingLevel: a.hardCeilingLevel,
          hardCeilingSetAtMs: a.hardCeilingSetAtMs,
          regimeResetAppliedAtMs: a.regimeResetAppliedAtMs,
          drops: a.drops,
          raiseStreak: a.raiseStreak,
          lastDecision: a.lastDecision,
          byLevel: a.byLevel,
        },
      ]),
    ),
  });

  ns.atExit(() => {
    try {
      ns.bladeburner.stopBladeburnerAction();
    } catch {
      // best-effort hygiene -- SLOT_HOLD_MAX_AGE_MS staleness is the real backstop
    }
    releaseSlotHold(ns);
  });

  const flushLogs = () => {
    ns.write(BB_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");
    // S1.3 -- Phase 40 roughly doubles the record rate (a `complete` record per rep, on
    // top of `start`); pretty-print indentation is a ~40% write-size cost with zero
    // information loss (every consumer is JSON.parse), so it's dropped here only.
    ns.write(BB_ATTEMPTS_FILE, JSON.stringify(attemptEntries), "w");
  };

  while (true) {
    const tickStartMs = Date.now();
    await ns.bladeburner.nextUpdate();
    const nowMs = Date.now();
    const wallSec = Math.max(0, (nowMs - tickStartMs) / 1000);

    // ---- Off-marker: idles IN-LOOP (does not exit -- the supervisor is gated only on
    // inBladeburner(), and an exiting-but-still-in-node script would be relaunched forever).
    const offMarker = ns.fileExists(BB_OFF_MARKER, "home");
    if (offMarker !== previousOffMarker && previousOffMarker !== null) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: offMarker ? "off-marker-on" : "off-marker-off" });
    }
    previousOffMarker = offMarker;
    if (!offMarker) wasOffLastTick = false;

    if (offMarker) {
      if (!wasOffLastTick) {
        try {
          ns.bladeburner.stopBladeburnerAction();
        } catch {
          /* already idle */
        }
      }
      wasOffLastTick = true;
      releaseSlotHold(ns);
      activeGrant = null;
      intendedAction = null;
      samples.push({ timestamp: nowMs, wallSec, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0 });
      samples = pruneSamples(samples, nowMs);
      totals = accumulateTotals(totals, { wallSec, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0, kind: "idle" });

      if (nowMs - lastStateWrite >= 60_000) {
        const rank = ns.bladeburner.getRank();
        const rates = computeWallRates(totals, samples, RATE_WINDOWS_MS, nowMs);
        ns.write(
          BB_STATE_FILE,
          JSON.stringify(
            buildBbState({
              now: nowMs,
              off: true,
              stage: STAGE_B_ENABLED ? "B" : "A",
              objectiveMode: OBJECTIVE_MODE,
              holdActive: false,
              holdReason: "off-marker",
              yieldedTo: null,
              rank,
              rankTarget: BLACKOPS_DAEDALUS_RANK,
              skillPoints: ns.bladeburner.getSkillPoints(),
              skillPointsIdle: null,
              skillPointsIdleSinceMs: null,
              skillLevels: {},
              overclockHeldAt: OVERCLOCK_HOLD_LEVEL,
              stageBEnabled: STAGE_B_ENABLED,
              stageBBlockedBy: "Q11",
              cityName: null,
              cityStock,
              teamSize: null,
              hpFraction: null,
              stamina: null,
              rates,
              duty: dutyFromTotals(totals),
              regime: wasPostInstall ? "post-install" : "steady",
              postInstallTrainingMs,
              crossover: null,
              quarantine: quarantineState.quarantine,
              allActionsQuarantined: allActionsQuarantinedFlag,
              recoveryActionQuarantined: recoveryActionQuarantinedFlag,
              startFailures: quarantineState.failures,
              repStarvation: repStarvationState
                ? { fired: repStarvationState.fired, sinceMs: repStarvationState.accumSinceMs, status: repStarvationState.status, observedRepRate: repStarvationState.ratePerSec }
                : { fired: false, sinceMs: null, status: "unknown", observedRepRate: null },
              yieldLedger: { rollingHourRepYieldMs: rollingHourRepYieldMs(repYieldEvents, nowMs), overrunStreak },
              livelockSuspected,
              repForegone: 0,
              hospitalizationsInferred,
              checkpointC1: null,
              checkpointC2: null,
              checkpointC3: null,
              totals: { ...totals },
              blackOpsDaedalusRank: BLACKOPS_DAEDALUS_RANK,
              levelGovernor: buildLevelGovernorSnapshot(),
            }),
            null,
            2,
          ),
          "w",
        );
        lastStateWrite = nowMs;
      }
      flushLogs();
      continue;
    }

    // ---- Determine who wants the slot this tick (S2.2's presence+marker table). -------
    const processList = ns.ps("home");
    let requestedClaimant = null;
    let requestedActivity = null;
    for (const name of HIGHER_PRIORITY_CLAIMANTS) {
      const present = processList.some((p) => p.filename === name);
      if (!present) continue;
      const activityFile = BACKDOOR_ACTIVITY_FILES[name];
      const activity = activityFile ? classifyBackdoorActivity(readJsonState(ns, activityFile), nowMs) : "busy"; // studybootstrap.js: presence-only
      if (activity === "busy") {
        requestedClaimant = name;
        requestedActivity = "busy";
        break;
      }
    }
    const augState = readJsonState(ns, AUG_STATE_FILE);
    repStarvationState = detectRepStarvation(augState, nowMs, repStarvationState);
    if (repStarvationState.justFired) logEntries = appendBbLog(logEntries, { ...ts(), kind: "rep-starvation-set", status: repStarvationState.status, ratePerSec: repStarvationState.ratePerSec });
    if (repStarvationState.clearedNow) logEntries = appendBbLog(logEntries, { ...ts(), kind: "rep-starvation-clear" });
    // The detector always RUNS -- its status is real telemetry, and it is how we see the
    // ratchet is rep-starved at all -- but it only REQUESTS the slot when the yield is
    // worth the win-path time (deficit-gated) and the duty cap is non-zero. Without that
    // guard a permanently-fired detector would ask, be refused, and log `yield-refused`
    // every ~1s tick, flooding the 2000-entry ring the way the crossover log once did.
    // Deficit-gated: only ask for the slot when the rep actually buys something that
    // moves rank (see REP_YIELD_MAX_DEFICIT). Also keeps the refusal path quiet -- a
    // permanently-fired detector must not spam yield-refused every tick.
    repYieldWorth = repYieldWorthwhile(augState);
    if (!requestedClaimant && repStarvationState.fired && MAX_REP_YIELD_DUTY > 0 && repYieldWorth.worthwhile) {
      requestedClaimant = REP_YIELD_CLAIMANT;
      requestedActivity = "busy";
    }

    // ---- S2's yield/reclaim decision. Evaluate the claimant we're CURRENTLY granted to
    // (if any) first -- a grant in progress is not preempted by a new higher-priority
    // request showing up mid-grant. --------------------------------------------------
    const evalClaimant = activeGrant ? activeGrant.claimant : requestedClaimant;
    let evalActivity;
    if (evalClaimant === activeGrant?.claimant && evalClaimant !== requestedClaimant) {
      // Re-check the grant-holder's OWN activity fresh, even if a different claimant is
      // now also asking -- the holder's grant must resolve on its own terms first.
      if (evalClaimant === REP_YIELD_CLAIMANT) evalActivity = repStarvationState.fired ? "busy" : "idle";
      else {
        const activityFile = BACKDOOR_ACTIVITY_FILES[evalClaimant];
        const present = processList.some((p) => p.filename === evalClaimant);
        if (!present) evalActivity = "idle";
        else evalActivity = activityFile ? classifyBackdoorActivity(readJsonState(ns, activityFile), nowMs) : "busy";
      }
    } else {
      evalActivity = requestedActivity;
    }
    const rollingHourMs = rollingHourRepYieldMs(repYieldEvents, nowMs);
    const decision = resolveYieldGrant(evalClaimant, evalActivity, nowMs, activeGrant, { overrunStreak, fairnessUntilMs, rollingHourRepYieldMs: rollingHourMs });
    overrunStreak = decision.overrunStreak;
    fairnessUntilMs = decision.fairnessUntilMs;
    if (decision.livelockSuspected) {
      livelockSuspected = { claimant: evalClaimant, streak: overrunStreak[evalClaimant] ?? 0, sinceMs: nowMs };
      logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "livelock-suspected", claimant: evalClaimant, streak: overrunStreak[evalClaimant] ?? 0 });
    } else if (decision.ended === "clean") {
      livelockSuspected = null;
    }
    // Rate-limited: a claimant that keeps asking while the cap is spent would otherwise
    // log once per ~1s tick and evict the whole ring (the crossover-flood lesson, applied
    // defensively here so a future non-zero MAX_REP_YIELD_DUTY cannot reintroduce it).
    if (decision.refused && nowMs - lastYieldRefusedLogMs >= YIELD_REFUSED_LOG_INTERVAL_MS) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: "yield-refused", claimant: evalClaimant, rollingHourRepYieldMs: rollingHourMs });
      lastYieldRefusedLogMs = nowMs;
    }

    if (decision.yield && (!activeGrant || activeGrant.claimant !== evalClaimant)) {
      // Granting a NEW yield -- S2.1's ordering is load-bearing (slotconflictprobe.js
      // confirmed mutual preemption when neither side held the marker at handover):
      // stop our own action FIRST, release the marker SECOND.
      try {
        ns.bladeburner.stopBladeburnerAction();
      } catch {
        /* idle */
      }
      releaseSlotHold(ns);
      intendedAction = null;
      pendingAttemptContext = null;
      const forgoneRank = wallSec * (totals.wallSec > 0 ? totals.rankGained / totals.wallSec : 0);
      logEntries = appendBbLog(logEntries, { ...ts(), kind: "yield-grant", claimant: evalClaimant, budgetMs: decision.budgetMs, forgoneRank });
    }
    if (decision.ended) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: decision.ended === "overrun" ? "yield-overrun" : "yield-reclaim", claimant: evalClaimant, heldMs: nowMs - decision.sinceMs });
    }
    activeGrant = decision.yield ? { claimant: evalClaimant, sinceMs: decision.sinceMs, budgetMs: decision.budgetMs } : null;
    if (evalClaimant === REP_YIELD_CLAIMANT && decision.yield) repYieldEvents = [...repYieldEvents.filter((e) => e.startMs > nowMs - 3_600_000), { startMs: nowMs, durationMs: wallSec * 1000 }];

    // Lightweight snapshot used by the two early-exit branches below (yielded /
    // just-reclaimed) -- deliberately NOT the full end-of-tick snapshot, which closes
    // over values (crossover, chosenAction, skill reads, city reads...) that this early
    // in the tick have not been computed yet.
    const writeInterimSnapshot = (holdReason) => {
      const rank = ns.bladeburner.getRank();
      const rates = computeWallRates(totals, samples, RATE_WINDOWS_MS, nowMs);
      ns.write(
        BB_STATE_FILE,
        JSON.stringify(
          buildBbState({
            now: nowMs,
            off: false,
            stage: STAGE_B_ENABLED ? "B" : "A",
            objectiveMode: OBJECTIVE_MODE,
            holdActive: !activeGrant,
            holdReason,
            yieldedTo: activeGrant,
            rank,
            rankTarget: BLACKOPS_DAEDALUS_RANK,
            skillPoints: ns.bladeburner.getSkillPoints(),
            skillPointsIdle: null,
            skillPointsIdleSinceMs: null,
            skillLevels: {},
            overclockHeldAt: OVERCLOCK_HOLD_LEVEL,
            stageBEnabled: STAGE_B_ENABLED,
            stageBBlockedBy: "Q11",
            cityName: null,
            cityStock,
            teamSize: null,
            hpFraction: null,
            stamina: null,
            rates,
            duty: dutyFromTotals(totals),
            regime: wasPostInstall ? "post-install" : "steady",
            postInstallTrainingMs,
            crossover: null,
            quarantine: quarantineState.quarantine,
            allActionsQuarantined: allActionsQuarantinedFlag,
            recoveryActionQuarantined: recoveryActionQuarantinedFlag,
            startFailures: quarantineState.failures,
            repStarvation: { fired: repStarvationState.fired, sinceMs: repStarvationState.accumSinceMs, status: repStarvationState.status, observedRepRate: repStarvationState.ratePerSec, worth: repYieldWorth },
            yieldLedger: { rollingHourRepYieldMs: rollingHourRepYieldMs(repYieldEvents, nowMs), overrunStreak },
            livelockSuspected,
            repForegone: 0,
            hospitalizationsInferred,
            checkpointC1: null,
            checkpointC2: checkpointC2Logged ? { operationLeadsPerSec: true, firstLeadPerSecAtMs } : null,
            checkpointC3: null,
            totals: { ...totals },
            blackOpsDaedalusRank: BLACKOPS_DAEDALUS_RANK,
            levelGovernor: buildLevelGovernorSnapshot(),
          }),
          null,
          2,
        ),
        "w",
      );
    };

    if (activeGrant) {
      // Reclaim happens automatically once the claimant clears its marker or the bound
      // hits (both are `decision.ended` cases, handled above on the tick they occur) --
      // while a grant is active we do nothing but poll (S2.1 step 3: no action started).
      samples.push({ timestamp: nowMs, wallSec, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0 });
      samples = pruneSamples(samples, nowMs);
      totals = accumulateTotals(totals, { wallSec, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0, kind: "yielded" });
      if (nowMs - lastStateWrite >= 10_000) {
        writeInterimSnapshot("yielded");
        lastStateWrite = nowMs;
      }
      flushLogs();
      continue;
    }
    if (decision.ended) {
      // S2.1's reclaim step 1 (marker back FIRST) fires the tick a grant ends; step 2 (one
      // full poll before competing for the slot) is enforced by simply not starting an
      // action until the NEXT tick, since we `continue` here without picking one.
      writeSlotHold(ns);
      lastMarkerWriteMs = nowMs;
      samples.push({ timestamp: nowMs, wallSec, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0 });
      samples = pruneSamples(samples, nowMs);
      totals = accumulateTotals(totals, { wallSec, actionSec: 0, rankDelta: 0, rankProducingSec: 0, postInstallSec: 0, kind: "overhead" });
      if (nowMs - lastStateWrite >= 10_000) {
        writeInterimSnapshot("reclaiming");
        lastStateWrite = nowMs;
      }
      flushLogs();
      continue;
    }

    // ---- S6: read the game's ACTUAL current action first, verify against last intent. --
    const rankNow = ns.bladeburner.getRank();
    const rankDelta = rankNow - previousRank;
    previousRank = rankNow;

    const player = ns.getPlayer();
    const hpFraction = player.hp.max > 0 ? player.hp.current / player.hp.max : 1;
    // S9's inference rule: a single-tick HP jump to max, from below max, while our OWN
    // chosen action last tick was NOT HRC (which restores ~2 HP/min, not a full heal in
    // ~1s) -- inferred, second-class to the panel's authoritative counter (L2).
    if (previousHp && previousHp.current < previousHp.max && player.hp.current === player.hp.max && !previousActionWasHrc) {
      hospitalizationsInferred += 1;
      attemptEntries = appendAttempt(attemptEntries, {
        ts: nowMs,
        kind: "hospitalization-inferred",
        type: intendedAction?.type ?? null,
        name: intendedAction?.name ?? null,
        observed: { hpBefore: previousHp.current, hpAfter: player.hp.current },
      });
    }
    previousHp = { current: player.hp.current, max: player.hp.max };

    const inPostInstall = isPostInstallRegime(player.hp.max);
    if (inPostInstall && !wasPostInstall) {
      postInstallTrainingMs = 0;
      regimeEnteredAtMs = nowMs; // Phase 40 S2.2 rule 2's latch input -- never cleared, only compared against per-action regimeResetAppliedAtMs
      logEntries = appendBbLog(logEntries, { ...ts(), kind: "regime-enter" });
    } else if (!inPostInstall && wasPostInstall) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: "regime-exit" });
    }
    wasPostInstall = inPostInstall;

    const [staminaCur, staminaMax] = ns.bladeburner.getStamina();
    const staminaFraction = staminaMax > 0 ? staminaCur / staminaMax : 1;
    staminaRecovering = updateStaminaRecovering(staminaRecovering, staminaFraction);
    hpRecovering = updateHpRecovering(hpRecovering, hpFraction);

    const liveAction = ns.bladeburner.getCurrentAction();
    const verified = !!(liveAction && liveAction.name && intendedAction && liveAction.name === intendedAction.name);
    // Snapshot, since `intendedAction` is reassigned later THIS tick if a new start fires
    // below -- the governor's S3 precondition 4 ("currently running") must pair with the
    // SAME intent `verified` was computed against, not a start decision made afterward.
    const verifiedRunningAction = verified ? intendedAction : null;

    // Finalize the pending attempt (the action we started LAST tick) now that we know
    // whether it verified.
    if (pendingAttemptContext) {
      const successesNow = pendingAttemptContext.type && pendingAttemptContext.type !== "General" ? ns.bladeburner.getActionSuccesses(pendingAttemptContext.type, pendingAttemptContext.name) : 0;
      const successDelta = successesNow - pendingAttemptContext.successesBefore;
      attemptEntries = appendAttempt(
        attemptEntries,
        recordAttempt({
          ts: nowMs,
          kind: verified ? "start" : "start-failure",
          type: pendingAttemptContext.type,
          name: pendingAttemptContext.name,
          level: pendingAttemptContext.level,
          autolevel: pendingAttemptContext.autolevel,
          startActionReturned: pendingAttemptContext.startActionReturned,
          verified,
          predicted: pendingAttemptContext.predicted,
          observed: { rankDelta, actionSec: verified ? wallSec : 0, successDelta, hpBefore: pendingAttemptContext.hpBefore, hpAfter: player.hp.current },
          context: pendingAttemptContext.context,
        }),
      );
      const q = updateQuarantine(quarantineState, pendingAttemptContext.name, verified, nowMs);
      quarantineState = q;
      if (q.justQuarantined) {
        logEntries = appendBbLog(logEntries, { ...ts(), kind: "quarantine-set", action: pendingAttemptContext.name, until: nowMs + ACTION_QUARANTINE_MS });
        if (pendingAttemptContext.name === "Hyperbolic Regeneration Chamber") {
          recoveryActionQuarantinedFlag = true;
          logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "recovery-action-quarantined" });
        }
      }
      if (q.justCleared) logEntries = appendBbLog(logEntries, { ...ts(), kind: "quarantine-clear", action: pendingAttemptContext.name });
      pendingAttemptContext = null;
    }

    const isRankProducing = verified && intendedAction && intendedAction.type !== "General";
    const rankProducingSecTick = isRankProducing ? wallSec : 0;
    const actionSecTick = verified ? wallSec : 0;
    const postInstallSecTick = inPostInstall ? wallSec : 0;
    if (inPostInstall && verified && intendedAction?.name === "Training") postInstallTrainingMs += wallSec * 1000;
    previousActionWasHrc = verified && intendedAction?.name === "Hyperbolic Regeneration Chamber";

    // Overhead-stall watchdog -- the thing that was missing when the engine parked in HRC
    // for 10.5 hours while reporting 100% duty (see OVERHEAD_STALL_WARN_MS).
    if (rankProducingSecTick > 0) {
      lastRankProducingMs = nowMs;
      overheadStallWarned = false;
    }
    overheadStall = detectOverheadStall({ nowMs, lastRankProducingMs, allActionsQuarantined: allActionsQuarantinedFlag, inPostInstallRegime: inPostInstall });
    if (overheadStall.stalled && !overheadStallWarned) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "overhead-stall", sinceMs: overheadStall.sinceMs, elapsedMs: nowMs - overheadStall.sinceMs, intendedAction });
      overheadStallWarned = true;
    }

    // ---- WI1 hoist (fixes blocker 9): city/team/skill reads moved up from after the
    // start block (their original position) to here, before candidate selection, so the
    // attempt-context correlates (S1.3) and the settlement-by-subtraction block below can
    // both read them without any new RAM -- nothing in this block reads `chosenAction`,
    // verified against every downstream consumer, so the move is behaviour-preserving.
    // The Stage-B team assignment (which DOES read chosenAction) stays at its original
    // position, after chosenAction is chosen. ------------------------------------------
    const cityName = ns.bladeburner.getCity();
    const chaos = ns.bladeburner.getCityChaos(cityName);
    const population = ns.bladeburner.getCityEstimatedPopulation(cityName);
    const communities = ns.bladeburner.getCityCommunities(cityName);
    const teamSize = ns.bladeburner.getTeamSize();
    // Computed ONCE (fixes blocker 9's flagged call-count reduction): getInventoryCounts
    // and the old inline contractCount/opCount reductions both called
    // getActionCountRemaining for every tracked action -- 18 calls/tick where 9 suffice.
    // RAM is unchanged (the method is already charged); this only reduces call COUNT.
    const inventoryCounts = getInventoryCounts(ns); // CONTRACTS then OPERATIONS, in that order
    const contractCount = inventoryCounts.slice(0, CONTRACTS.length).reduce((a, b) => a + b, 0);
    const opCount = inventoryCounts.slice(CONTRACTS.length).reduce((a, b) => a + b, 0);
    const lowInventory = isInventoryLow(inventoryCounts);
    const cityUpdate = updateCityStock(cityStock, { cityName, population, communities, chaos, contractCount, opCount }, nowMs);
    cityStock = cityUpdate.stock;
    // All six cities, FREE on RAM (getCityChaos/getCityEstimatedPopulation/
    // getCityCommunities are already charged for our own city, so the extra five cost
    // nothing), and this is the complete dataset Q5 needs. Until now the engine only ever
    // sampled its OWN city, which is exactly why nobody knew Sector-12 sat at 50x the
    // chaos of Volhaven. ⚠️ Chaos alone must NOT decide a rotation -- population drives
    // success chance and communities gate Raid -- which is why all three are sampled.
    chaosByCity = Object.fromEntries(
      ALL_CITIES.map((c) => [
        c,
        { chaos: ns.bladeburner.getCityChaos(c), pop: ns.bladeburner.getCityEstimatedPopulation(c), communities: ns.bladeburner.getCityCommunities(c) },
      ]),
    );
    // Edge-triggered (log only on the transition INTO a breach) -- confirmed live
    // 2026-08-03: Sector-12's chaos sits ~69 (way above the rotation threshold) during
    // ordinary grinding, and logging it every tick has the exact same ring-flooding
    // effect as the unthrottled crossover log above.
    const priorBreachTypes = cityBreachState[cityName] ?? new Set();
    const currentBreachTypes = new Set(cityUpdate.breaches.map((b) => b.type));
    for (const breach of cityUpdate.breaches) {
      if (!priorBreachTypes.has(breach.type)) logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: `city-breach-${breach.type}`, ...breach });
    }
    cityBreachState = { ...cityBreachState, [cityName]: currentBreachTypes };
    if (CITY_ROTATION_ENABLED) {
      const chaosByCityStock = Object.fromEntries(Object.entries(cityStock).map(([c, v]) => [c, v.chaos]));
      shouldRotateCity(chaosByCityStock, cityName, CITY_ROTATE_CHAOS_THRESHOLD); // instrumented only -- never acted on (Q5 unmeasured)
    }

    // Skill-level read block, hoisted (WI1 point 4) so skillLevelsFingerprint can run at
    // attempt-context time. planSkillBuy/upgradeSkill stay at their ORIGINAL position,
    // below, reading these same hoisted values.
    const skillLevels = {};
    const skillCosts = {};
    for (const skill of SKILL_BUY_ORDER) {
      skillLevels[skill] = ns.bladeburner.getSkillLevel(skill);
      skillCosts[skill] = ns.bladeburner.getSkillUpgradeCost(skill, 1);
    }
    const points = ns.bladeburner.getSkillPoints();
    const skillLevelsHash = skillLevelsFingerprint(skillLevels, SKILL_BUY_ORDER);

    // ---- WI1 S1.1/S1.2 (Revision 3) -- settlement by success-count SUBTRACTION,
    // triggered by the NEXT verified start (of any action -- the engine's own 99.3%
    // alternation IS the trigger, not an obstacle) or, in the single-action regime, by
    // SETTLE_MAX_MS. No boundary detection, no `getActionCurrentTime` read: both are
    // deleted along with `detectActionBoundary`, whose SAME-action wrap detector
    // essentially never fired live (21h, zero `complete` records -- the engine changes
    // action on 99.3% of consecutive starts). A preempted/unverified interval is
    // discarded, not settled: attributing an interval spanning two different actions
    // would manufacture exactly the contaminated sample the Diplomacy code already
    // guards against elsewhere in this file. --------------------------------------------
    const trackable = verified && intendedAction && intendedAction.type !== "General";
    const sameOpenAction = trackable && openRunState !== null && openRunState.type === intendedAction.type && openRunState.name === intendedAction.name;
    let justSettledAction = null; // {type, name} -- feeds S3 precondition 4 (acting only at a settlement point, or on an idle action)

    // Settles `openRunState` (captured locally before any reassignment) via subtraction,
    // folds it into the ledger + governor state, or -- on a counter reset (S1.2) --
    // discards it and logs a warn instead. Never call with `openRunState === null`.
    const settleOpenRun = (viaTimeout) => {
      // Deliberately NOT named `run` -- a billed identifier (`ns.run`, CLAUDE.md's
      // hygiene list). Same reason `openRunState` isn't shortened to `run` (S9).
      const closingRun = openRunState;
      const successesNow = ns.bladeburner.getActionSuccesses(closingRun.type, closingRun.name);
      const actionTimeMs = ns.bladeburner.getActionTime(closingRun.type, closingRun.name);
      const settled = settleActionRun(closingRun, { successesNow, rankNow, nowMs, actionTimeMs, viaTimeout });
      if (settled.discard) {
        logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "success-counter-reset", type: closingRun.type, name: closingRun.name });
        return;
      }
      settlementsCount += 1;
      if (settled.estimated) estimatedSettlementsCount += 1;

      attemptEntries = appendAttempt(attemptEntries, {
        ...recordAttempt({
          ts: nowMs,
          kind: "complete",
          type: settled.type,
          name: settled.name,
          level: settled.level,
          autolevel: null,
          startActionReturned: null,
          verified: true,
          predicted: null,
          observed: { rankDelta: settled.rankDelta, actionSec: settled.actionSec, successDelta: settled.successes },
          context: {
            rank: rankNow,
            staminaCurrent: staminaCur,
            staminaMax,
            staminaFraction,
            hpFraction,
            cityName,
            cityChaos: chaos,
            countRemaining: ns.bladeburner.getActionCountRemaining(settled.type, settled.name),
            skillLevelsHash,
            teamSize,
          },
        }),
        attempts: settled.attempts,
        success: settled.success,
        estimated: settled.estimated,
      });

      if (rankNow - closingRun.rankBefore < 0) {
        logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "negative-rank-delta", type: closingRun.type, name: closingRun.name, rankBefore: closingRun.rankBefore, rankAfter: rankNow });
      }

      const priorActionState = levelGovernorActions[settled.name] ?? emptyActionGovernorState(settled.type);
      levelGovernorActions[settled.name] = foldSettlement(priorActionState, settled);
      justSettledAction = { type: settled.type, name: settled.name };
    };

    const openFreshRun = (type, name) => ({
      type,
      name,
      level: ns.bladeburner.getActionCurrentLevel(type, name),
      successesBefore: ns.bladeburner.getActionSuccesses(type, name),
      rankBefore: rankNow,
      startAtMs: nowMs,
    });

    // 🔴 Keyed off `liveAction` (the GAME's answer), NOT `intendedAction` (ours). Fixed
    // 2026-08-10 after a measured live park -- see planSettlementStep's doc comment.
    const settlePlan = planSettlementStep({ liveAction, openRun: openRunState, nowMs });
    if (settlePlan.settle) settleOpenRun(settlePlan.settle.viaTimeout);
    if (settlePlan.open) openRunState = openFreshRun(settlePlan.open.type, settlePlan.open.name);
    else if (settlePlan.discard) openRunState = null;

    const estimatedFractionHigh = settlementsCount > 0 && estimatedSettlementsCount / settlementsCount > ESTIMATED_SAMPLE_WARN_FRACTION;
    if (estimatedFractionHigh && !estimatedFractionWarnLogged) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "estimated-fraction-high", settlements: settlementsCount, estimatedSettlements: estimatedSettlementsCount });
      estimatedFractionWarnLogged = true;
    } else if (!estimatedFractionHigh) {
      estimatedFractionWarnLogged = false;
    }

    // ---- Candidate selection: buildCandidates (ungated) -> applyStageGate (the ONLY
    // gate) -> pickRankAction. computeCrossover ALSO consumes the ungated pool -- C2's
    // evidence is reachable without ever opening the gate (S5.1). ----------------------
    const fullPool = buildCandidates(ns);
    const gatedPool = applyStageGate(fullPool, STAGE_B_ENABLED);
    const crossover = computeCrossover(fullPool, OBJECTIVE_MODE);
    if (crossover.operationLeadsPerSec && firstLeadPerSecAtMs === null) firstLeadPerSecAtMs = nowMs;
    if (crossover.operationLeadsPerAction && firstLeadPerActionAtMs === null) firstLeadPerActionAtMs = nowMs;
    // Edge-triggered (a lead flag flips) + a heartbeat, not every tick -- see
    // CROSSOVER_LOG_INTERVAL_MS's comment for the live incident this fixes.
    const crossoverChanged = crossover.operationLeadsPerSec !== previousCrossoverLeadsPerSec || crossover.operationLeadsPerAction !== previousCrossoverLeadsPerAction;
    if (crossoverChanged || nowMs - lastCrossoverLogMs >= CROSSOVER_LOG_INTERVAL_MS) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: "crossover", ...crossover });
      lastCrossoverLogMs = nowMs;
    }
    previousCrossoverLeadsPerSec = crossover.operationLeadsPerSec;
    previousCrossoverLeadsPerAction = crossover.operationLeadsPerAction;
    if (crossover.operationLeadsPerSec && !checkpointC2Logged) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: "checkpoint-C2", ...crossover, stageBEnabled: STAGE_B_ENABLED });
      checkpointC2Logged = true;
    }

    const picked = pickRankAction(gatedPool, { hpRecovering, staminaRecovering, quarantine: quarantineState.quarantine, nowMs, mode: OBJECTIVE_MODE });
    allActionsQuarantinedFlag = gatedPool.length > 0 && gatedPool.every((c) => isQuarantined(quarantineState.quarantine, c.name, nowMs));
    if (allActionsQuarantinedFlag) logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "all-actions-quarantined" });

    let chosenAction;
    let chosenCandidate = null;
    if (picked) {
      chosenAction = { type: picked.type, name: picked.name };
      chosenCandidate = picked;
    } else {
      // cityName/chaos/teamSize/lowInventory are hoisted above (WI1 point 2 -- deletes
      // only these three duplicate declarations; the branch now uses the hoisted values).
      // 🔴 Passes the REAL hpFraction plus the latch as a separate flag. The old
      // `hpRecovering ? 0 : hpFraction` destroyed the distinction between "genuinely in
      // danger" and "above the floor, building a buffer", which forced the HP branch and
      // made the chaos branch dead code. See pickOverheadAction's doc comment.
      chosenAction = pickOverheadAction(hpFraction, chaos, teamSize, lowInventory, staminaRecovering, {
        hrcQuarantined: isQuarantined(quarantineState.quarantine, "Hyperbolic Regeneration Chamber", nowMs),
        stageBEnabled: STAGE_B_ENABLED,
        inPostInstallRegime: inPostInstall,
        postInstallTrainingMs,
        hpRecovering,
        diplomacyBudgetMs: diplomacyBudgetRemainingMs(diplomacyEvents, nowMs),
      });
    }

    // ---- S6/S11: start only on a genuine transition, or a debounced re-trigger of an
    // observed-idle GENERAL action. Contracts/Operations retry every tick on failure
    // (they run for many seconds/minutes -- an unverified tick after start is a real
    // signal, not a normal completion boundary). --------------------------------------
    const isGeneral = chosenAction.type === "General";
    if (chosenAction.name !== lastGeneralActionName) {
      lastGeneralActionName = chosenAction.name;
      lastGeneralRecheckMs = 0; // a real switch is never debounced
    }
    const startDecision = shouldStartAction({
      chosenAction,
      intendedAction,
      liveActionName: liveAction?.name ?? null,
      nowMs,
      lastGeneralRecheckMs,
      // Phase 40 S3 step 5 -- a level change applied to the CURRENTLY running action last
      // tick forces one restart so it takes effect on the next rep. One-shot: consumed
      // here regardless of whether it matches this tick's chosenAction.
      forceRestartReason: forcedRestartAction && forcedRestartAction.type === chosenAction.type && forcedRestartAction.name === chosenAction.name ? forcedRestartAction.reason : null,
    });
    forcedRestartAction = null;

    if (startDecision.start) {
      writeSlotHold(ns);
      lastMarkerWriteMs = nowMs;
      if (isGeneral) lastGeneralRecheckMs = nowMs;
      const level = chosenCandidate ? ns.bladeburner.getActionCurrentLevel(chosenAction.type, chosenAction.name) : null;
      const autolevel = chosenCandidate ? ns.bladeburner.getActionAutolevel(chosenAction.type, chosenAction.name) : null;
      // getActionSuccesses throws for General actions ("not levelable") -- confirmed live
      // 2026-08-03. Only Contracts/Operations are levelable.
      const successesBefore = chosenAction.type !== "General" ? ns.bladeburner.getActionSuccesses(chosenAction.type, chosenAction.name) : 0;
      const startActionReturned = ns.bladeburner.startAction(chosenAction.type, chosenAction.name);
      intendedAction = chosenAction;
      pendingAttemptContext = {
        type: chosenAction.type,
        name: chosenAction.name,
        level,
        autolevel,
        startActionReturned,
        successesBefore,
        hpBefore: player.hp.current,
        predicted: chosenCandidate
          ? { pMin: chosenCandidate.pMin, pMax: chosenCandidate.pMax, rankGain: chosenCandidate.rankGain, rankLoss: chosenCandidate.rankLoss, actionTimeMs: chosenCandidate.timeMs, evPerSec: scoreCandidate(chosenCandidate, "per-second").evPerSec, evPerAction: scoreCandidate(chosenCandidate, "per-action").evPerAction }
          : null,
        // S1.3 -- the four correlates, now populated from this tick's hoisted reads
        // instead of hardcoded null. countRemaining comes from the candidate itself
        // (buildCandidates already fetched it) when we started a ranked action; General/
        // overhead actions have no candidate, so it stays null (unchanged from before).
        context: { rank: rankNow, staminaCurrent: staminaCur, staminaMax, staminaFraction, hpFraction, cityName, cityChaos: chaos, countRemaining: chosenCandidate?.countRemaining ?? null, skillLevelsHash, teamSize },
      };
      // Open a Diplomacy measurement window. This is the whole reason the policy is
      // defensible without knowing Diplomacy's strength up front: it answers that
      // question from its own operation, per S7, rather than assuming it.
      if (chosenAction.name === "Diplomacy") {
        const atCity = ns.bladeburner.getCity();
        diplomacyRunStart = { atMs: nowMs, cityName: atCity, chaosBefore: ns.bladeburner.getCityChaos(atCity) };
        diplomacyEvents = [...diplomacyEvents.filter((e) => e.startMs > nowMs - 3_600_000), { startMs: nowMs, durationMs: 60_000 }];
      }
    }

    // Settle a Diplomacy measurement once the run is over (we moved on to something else).
    if (diplomacyRunStart && intendedAction?.name !== "Diplomacy") {
      const settleCity = ns.bladeburner.getCity();
      const chaosAfter = ns.bladeburner.getCityChaos(settleCity);
      // 🔴 DISCARD the sample if the city changed mid-window. Chaos is per-city, so a move
      // makes the before/after delta a comparison between two different cities' chaos --
      // not an effect of Diplomacy. Caught immediately in the live run that introduced
      // this: a single sample recorded "174.15 chaos removed", which was entirely the
      // Sector-12 (177.5) -> Volhaven (3.4) move. Left in, it would have told the next
      // session Diplomacy is ~50x stronger than it is.
      const sameCity = settleCity === diplomacyRunStart.cityName;
      if (sameCity) diplomacyEffect = accumulateDiplomacyEffect(diplomacyEffect, diplomacyRunStart.chaosBefore, chaosAfter);
      logEntries = appendBbLog(logEntries, {
        ...ts(),
        kind: "diplomacy-effect",
        cityName: diplomacyRunStart.cityName,
        discarded: !sameCity,
        discardReason: sameCity ? null : `city changed ${diplomacyRunStart.cityName} -> ${settleCity}`,
        chaosBefore: diplomacyRunStart.chaosBefore,
        chaosAfter,
        removed: sameCity ? diplomacyRunStart.chaosBefore - chaosAfter : null,
        elapsedMs: nowMs - diplomacyRunStart.atMs,
        meanRemovedPerRun: diplomacyEffect.meanRemovedPerRun,
        runs: diplomacyEffect.runs,
      });
      diplomacyRunStart = null;
    }

    // Refresh the marker independently of action progress (a long action must not let
    // the marker go stale mid-action).
    if (nowMs - lastMarkerWriteMs >= BB_POLL_MS) {
      writeSlotHold(ns);
      lastMarkerWriteMs = nowMs;
    }

    // ---- Skill buy (best-effort, one per tick). skillLevels/skillCosts/points are
    // hoisted above (WI1 point 4); this stays at its original position, reading them. --
    const buy = planSkillBuy(skillLevels, points, skillCosts);
    if (buy) {
      const ok = ns.bladeburner.upgradeSkill(buy.skill);
      if (ok) logEntries = appendBbLog(logEntries, { ...ts(), kind: "skill-buy", skill: buy.skill, toLevel: buy.toLevel, cost: buy.cost, costs: { ...skillCosts } });
    }

    // City stock instrumentation (S10/WI5) is hoisted above, before candidate selection
    // (WI1 point 1) -- cityName/chaos/population/communities/teamSize/cityStock/
    // chaosByCity/the breach log are all already computed for this tick.

    // ---- Team assignment for Operations (Stage B only -- no benefit in Stage A). ------
    if (STAGE_B_ENABLED && chosenAction.type === "Operations") {
      const availableTeam = ns.bladeburner.getTeamSize();
      if (availableTeam > 0) ns.bladeburner.setTeamSize(chosenAction.type, chosenAction.name, availableTeam);
    }

    // ---- Phase 40 WI2 -- the autolevel governor (S2-S5, S7). Scope is S6: every
    // Contract/Operation in the already-gated pool (gatedPool never contains a Stage-B
    // operation while STAGE_B_ENABLED is false, so the governor cannot reach one). Shadow
    // mode computes and logs a decision for every governed-scope action every tick but
    // NEVER calls a setter; only "active" mode's actuator (below) does that, and Q40-12:
    // ownership, once taken, is released only by S5's deliberate revert, never here. -----
    if (LEVEL_GOVERNOR_MODE === "off") {
      if (!governorRevertDone) {
        for (const [name, priorState] of Object.entries(levelGovernorActions)) {
          if (!priorState.governed) continue;
          ns.bladeburner.setActionAutolevel(priorState.type, name, true);
          const autolevelNow = ns.bladeburner.getActionAutolevel(priorState.type, name);
          levelGovernorActions[name] = applyLevelDecision(
            priorState,
            { decision: "release", toLevel: null, reason: "revert" },
            { level: priorState.level, autolevel: autolevelNow, ok: autolevelNow === true },
            nowMs,
          );
          logEntries = appendBbLog(logEntries, { ...ts(), kind: "level-govern-revert", type: priorState.type, name, ok: autolevelNow === true });
        }
        governorRevertDone = true;
      }
    } else {
      governorRevertDone = false;
      const governedScope = gatedPool.map((c) => ({ type: c.type, name: c.name }));

      // S2.3 -- is the whole sampled cohort down, or just one action? Computed from each
      // action's OWN recentWindow (not the estimator -- D3/V2). Revision 3: `attempts`/
      // `successes` are SUMS over the settled entries, not entry counts -- a multi-rep or
      // estimated interval can represent more than one attempt (S2.1).
      const outcomesForCohort = governedScope.map((c) => {
        const priorState = levelGovernorActions[c.name] ?? emptyActionGovernorState(c.type);
        levelGovernorActions[c.name] = priorState;
        const windowEntries = priorState.recentWindow;
        return {
          name: c.name,
          attempts: windowEntries.reduce((sum, e) => sum + (e.attempts ?? 0), 0),
          successes: windowEntries.reduce((sum, e) => sum + (e.successes ?? 0), 0),
        };
      });
      const cohort = classifyCohort(outcomesForCohort, { minSamples: LEVEL_MIN_SAMPLES, lowerBand: LEVEL_LOWER_BAND, minActions: COHORT_MIN_ACTIONS });
      lastCohortReport = cohort;
      if (cohort.collapsed) {
        if (!cohortWarnLogged) {
          logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "cohort-collapse", ...cohort });
          cohortWarnLogged = true;
        }
      } else {
        cohortWarnLogged = false;
      }
      if (cohort.reason === "single-action-cohort") {
        if (!singleActionCohortWarnLogged) {
          logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "single-action-cohort", ...cohort });
          singleActionCohortWarnLogged = true;
        }
      } else {
        singleActionCohortWarnLogged = false;
      }

      for (const c of governedScope) {
        // S4 -- ownership is always reconciled from the game, never trusted from a seed.
        // getActionAutolevel/getActionCurrentLevel are both already-charged reads
        // (Phase 39), so this costs nothing new.
        const liveAutolevel = ns.bladeburner.getActionAutolevel(c.type, c.name);
        const liveLevel = ns.bladeburner.getActionCurrentLevel(c.type, c.name);
        let actionState = levelGovernorActions[c.name] ?? emptyActionGovernorState(c.type);
        const nowGoverned = liveAutolevel === false;
        if (nowGoverned && !actionState.governed) {
          // S4's adoption path: autolevel already reads false and we didn't set it (a
          // fresh takeover, or a stray probe's leftover, gotcha 5). recentWindow starts
          // EMPTY -- no decision is ever taken on pre-adoption data.
          actionState = { ...actionState, governed: true, adopted: true, level: liveLevel, recentWindow: [] };
          logEntries = appendBbLog(logEntries, { ...ts(), kind: "level-govern", type: c.type, name: c.name, adopted: true, level: liveLevel });
        } else {
          actionState = { ...actionState, governed: nowGoverned, level: liveLevel };
        }
        levelGovernorActions[c.name] = actionState;

        // Revision 3: sums over settled interval entries, not entry counts (S2.1) --
        // `minSamples` measures evidence (attempts), not how many settlements produced it.
        const windowEntries = actionState.recentWindow;
        const attempts = windowEntries.reduce((sum, e) => sum + (e.attempts ?? 0), 0);
        const successes = windowEntries.reduce((sum, e) => sum + (e.successes ?? 0), 0);
        const rankSum = windowEntries.reduce((sum, e) => sum + (e.rankDelta ?? 0), 0);
        const estimatedCount = windowEntries.filter((e) => e.estimated).length;
        const estimatedFraction = windowEntries.length > 0 ? estimatedCount / windowEntries.length : 0;
        const levelSpan = windowEntries.length > 0
          ? { min: Math.min(...windowEntries.map((e) => e.level)), max: Math.max(...windowEntries.map((e) => e.level)) }
          : { min: liveLevel, max: liveLevel };

        const actionOutcome = {
          name: c.name,
          type: c.type,
          level: liveLevel,
          governed: actionState.governed,
          attempts,
          successes,
          rankSum,
          levelSpan,
          levelSetAtMs: actionState.levelSetAtMs,
          ceilingLevel: actionState.ceilingLevel,
          ceilingSetAtMs: actionState.ceilingSetAtMs,
          hardCeilingLevel: actionState.hardCeilingLevel,
          hardCeilingSetAtMs: actionState.hardCeilingSetAtMs,
          regimeResetAppliedAtMs: actionState.regimeResetAppliedAtMs,
          drops: actionState.drops,
          governorFailedUntilMs: actionState.governorFailedUntilMs,
          raiseStreak: actionState.raiseStreak,
        };
        const decision = planLevelAdjustment(actionOutcome, {
          nowMs,
          regimeEnteredAtMs,
          cohortCollapsed: cohort.collapsed,
          minSamples: LEVEL_MIN_SAMPLES,
          lowerBand: LEVEL_LOWER_BAND,
          raiseBand: LEVEL_RAISE_BAND,
          cooldownMs: LEVEL_COOLDOWN_MS,
          minLevel: LEVEL_FLOOR,
          ceilingHoldMs: LEVEL_CEILING_HOLD_MS,
          hardCeilingRetryMs: LEVEL_HARD_CEILING_RETRY_MS,
          maxRaiseStep: LEVEL_MAX_RAISE_STEP,
          maxTotalDrop: LEVEL_MAX_TOTAL_DROP,
          dropBudgetMs: LEVEL_DROP_BUDGET_MS,
        });
        actionState.lastDecision = { decision: decision.decision, toLevel: decision.toLevel, successRate: decision.successRate, samples: decision.samples, reason: decision.reason, atMs: nowMs };

        // S8 -- edge-triggered (a `hold` logs only on a reason change) plus a 30-min
        // heartbeat; a non-hold decision always logs (the crossover-flood lesson).
        const lastLog = lastLevelGovernLog[c.name];
        const shouldLog = decision.decision !== "hold" || !lastLog || lastLog.reason !== decision.reason || nowMs - lastLog.atMs >= LEVEL_GOVERN_HEARTBEAT_MS;

        // ---- S3 actuator -- the ONLY code path that calls setActionLevel, and (besides
        // S5's revert above) one of exactly two that call setActionAutolevel. Every
        // precondition below is required (S3): mode active, no active yield grant, the
        // action not quarantined (governorFailed is already folded into `decision` via
        // planLevelAdjustment's rule 1b), and -- precondition 4 -- either we're at a
        // settlement point for THIS action or it isn't the one currently running.
        const isCurrentlyRunning = verifiedRunningAction && verifiedRunningAction.type === c.type && verifiedRunningAction.name === c.name;
        const atSettlementOrIdle = !isCurrentlyRunning || (justSettledAction && justSettledAction.type === c.type && justSettledAction.name === c.name);
        const canAct = LEVEL_GOVERNOR_MODE === "active"
          && !activeGrant
          && !isQuarantined(quarantineState.quarantine, c.name, nowMs)
          && atSettlementOrIdle
          && (decision.decision === "lower" || decision.decision === "raise");

        if (canAct) {
          if (!actionState.governed) {
            // Step 1 -- take ownership first; a level set while autolevel is still on
            // would be undone by the game on the next success.
            ns.bladeburner.setActionAutolevel(c.type, c.name, false);
            const autolevelOk = ns.bladeburner.getActionAutolevel(c.type, c.name) === false;
            if (!autolevelOk) {
              logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "autolevel-set-failed", type: c.type, name: c.name });
              actionState = applyLevelDecision(actionState, { decision: "autolevel-set-failed", toLevel: null, reason: "autolevel-set-failed" }, { level: liveLevel, autolevel: true, ok: false }, nowMs);
              levelGovernorActions[c.name] = actionState;
              logEntries = appendBbLog(logEntries, {
                ...ts(), kind: "level-govern", type: c.type, name: c.name, applied: false,
                decision: decision.decision, toLevel: decision.toLevel, reason: decision.reason,
                successRate: decision.successRate, samples: decision.samples, levelSpan: decision.levelSpan, estimatedFraction, cohort,
              });
              lastLevelGovernLog[c.name] = { reason: decision.reason, atMs: nowMs };
              continue;
            }
          }
          // Step 2 -- set the level, read back.
          ns.bladeburner.setActionLevel(c.type, c.name, decision.toLevel);
          const readLevel = ns.bladeburner.getActionCurrentLevel(c.type, c.name);
          // Step 3 -- read-back disagreement handled by direction: a raise reading back
          // low is a max-level clamp (not an error); a lower reading back wrong is a
          // genuine anomaly.
          if (readLevel !== decision.toLevel && decision.decision === "lower") {
            logEntries = appendBbLog(logEntries, { ...ts(), kind: "warn", reason: "level-set-failed", type: c.type, name: c.name, toLevel: decision.toLevel, readLevel });
          }
          const readBack = { level: readLevel, autolevel: false, ok: readLevel === decision.toLevel };
          // Step 4 -- fold the applied decision into state.
          actionState = applyLevelDecision(actionState, decision, readBack, nowMs);
          levelGovernorActions[c.name] = actionState;
          logEntries = appendBbLog(logEntries, {
            ...ts(), kind: "level-govern", type: c.type, name: c.name, applied: true,
            decision: decision.decision, toLevel: decision.toLevel, reason: decision.reason, readBack,
            successRate: decision.successRate, samples: decision.samples, levelSpan: decision.levelSpan, estimatedFraction, cohort,
          });
          lastLevelGovernLog[c.name] = { reason: decision.reason, atMs: nowMs };
          // Step 5 -- force one restart if this is the action currently running, so the
          // level change takes effect on the next rep (consumed by shouldStartAction
          // above on the NEXT tick).
          if (isCurrentlyRunning) forcedRestartAction = { type: c.type, name: c.name, reason: "level-change" };
        } else if (shouldLog) {
          logEntries = appendBbLog(logEntries, {
            ...ts(), kind: "level-govern", type: c.type, name: c.name, applied: false,
            decision: decision.decision, toLevel: decision.toLevel, reason: decision.reason,
            successRate: decision.successRate, samples: decision.samples, levelSpan: decision.levelSpan, estimatedFraction, cohort,
          });
          lastLevelGovernLog[c.name] = { reason: decision.reason, atMs: nowMs };
        }
      }
    }

    // ---- Rep foregone (audit trail) -- only meaningful while yielding to the rep
    // claimant, which this branch never reaches (handled above); kept 0 here.
    samples.push({ timestamp: nowMs, wallSec, actionSec: actionSecTick, rankDelta, rankProducingSec: rankProducingSecTick, postInstallSec: postInstallSecTick });
    samples = pruneSamples(samples, nowMs);
    totals = accumulateTotals(totals, { wallSec, actionSec: actionSecTick, rankDelta, rankProducingSec: rankProducingSecTick, postInstallSec: postInstallSecTick, kind: isRankProducing ? "rank" : "overhead" });

    function writeStateSnapshot() {
      const rates = computeWallRates(totals, samples, RATE_WINDOWS_MS, nowMs);
      const dutyBlock = dutyFromTotals(totals);
      const regimeFraction = totals.wallSec > 0 ? totals.postInstallSec / totals.wallSec : 0;
      const c1 = evaluateC1(totals);
      const c3a = evaluateC3A(totals);
      const c3b = evaluateC3B(STAGE_B_ENABLED);
      if (c1 && !checkpointC1Logged) {
        logEntries = appendBbLog(logEntries, { ...ts(), kind: "checkpoint-C1", ...c1, postInstallFraction: regimeFraction, regimeDominated: regimeFraction > REGIME_DOMINATED_THRESHOLD });
        checkpointC1Logged = true;
      }
      if (c3a && !checkpointC3Logged) {
        logEntries = appendBbLog(logEntries, { ...ts(), kind: "checkpoint-C3", variant: "C3-A", ...c3a, postInstallFraction: regimeFraction, regimeDominated: regimeFraction > REGIME_DOMINATED_THRESHOLD });
        checkpointC3Logged = true;
      }
      ns.write(
        BB_STATE_FILE,
        JSON.stringify(
          buildBbState({
            now: nowMs,
            off: false,
            stage: STAGE_B_ENABLED ? "B" : "A",
            objectiveMode: OBJECTIVE_MODE,
            holdActive: !activeGrant,
            holdReason: activeGrant ? "yielded" : "held",
            yieldedTo: activeGrant,
            rank: rankNow,
            rankTarget: BLACKOPS_DAEDALUS_RANK,
            skillPoints: points,
            skillPointsIdle: planSkillBuy(skillLevels, points, skillCosts) ? null : points,
            skillPointsIdleSinceMs: null,
            skillLevels,
            overclockHeldAt: OVERCLOCK_HOLD_LEVEL,
            stageBEnabled: STAGE_B_ENABLED,
            stageBBlockedBy: "Q11",
            cityName,
            cityStock,
            teamSize,
            hpFraction,
            stamina: { current: staminaCur, max: staminaMax, fraction: staminaFraction, recovering: staminaRecovering, floor: STAMINA_FLOOR_FRACTION, resume: STAMINA_RESUME_FRACTION },
            rates,
            duty: dutyBlock,
            regime: inPostInstall ? "post-install" : "steady",
            postInstallTrainingMs,
            crossover: { ...crossover, firstLeadPerSecAtMs, firstLeadPerActionAtMs },
            quarantine: quarantineState.quarantine,
            allActionsQuarantined: allActionsQuarantinedFlag,
            recoveryActionQuarantined: recoveryActionQuarantinedFlag,
            startFailures: quarantineState.failures,
            overheadStall, // watchdog for the 10.5h HRC park -- see OVERHEAD_STALL_WARN_MS
            intendedAction, // what we last called startAction with (intent, NOT evidence -- S1)
            chaosByCity, // all six cities -- Q5's rotation evidence, free on RAM
            diplomacy: {
              budgetRemainingMs: diplomacyBudgetRemainingMs(diplomacyEvents, nowMs),
              runsThisHour: diplomacyEvents.filter((e) => e.startMs > nowMs - 3_600_000).length,
              target: CHAOS_TARGET,
              maxDuty: MAX_DIPLOMACY_DUTY,
              effect: diplomacyEffect, // meanRemovedPerRun is the number that settles whether this policy is worth keeping
            },
            repStarvation: { fired: repStarvationState.fired, sinceMs: repStarvationState.accumSinceMs, status: repStarvationState.status, observedRepRate: repStarvationState.ratePerSec, worth: repYieldWorth },
            yieldLedger: { rollingHourRepYieldMs: rollingHourRepYieldMs(repYieldEvents, nowMs), overrunStreak },
            livelockSuspected,
            repForegone: 0,
            hospitalizationsInferred,
            checkpointC1: c1,
            checkpointC2: checkpointC2Logged ? { operationLeadsPerSec: true, firstLeadPerSecAtMs } : null,
            checkpointC3: c3a ?? c3b,
            totals: { ...totals },
            blackOpsDaedalusRank: BLACKOPS_DAEDALUS_RANK,
            levelGovernor: buildLevelGovernorSnapshot(),
          }),
          null,
          2,
        ),
        "w",
      );

      ns.clearLog();
      ns.print(`===== bladeburner @ ${new Date(nowMs).toLocaleTimeString()} =====`);
      ns.print(`stage ${STAGE_B_ENABLED ? "B" : "A"} | rank ${rankNow.toFixed(1)} | action ${chosenAction.name}${isRankProducing ? "" : " (overhead)"} | SP ${points}`);
      ns.print(`rankPerWallSec (cumulative) ${rates.cumulative.rankPerWallSec.toFixed(5)} | dutyCycle ${rates.cumulative.dutyCycle.toFixed(2)}`);
      ns.print(`uptime ${(totals.wallSec / 3600).toFixed(2)}h | restarts ${totals.restarts} | regime ${inPostInstall ? "post-install" : "steady"}`);
      ns.print(`stamina ${(staminaFraction * 100).toFixed(1)}%${staminaRecovering ? " RECOVERING" : ""} | hp ${(hpFraction * 100).toFixed(0)}%`);
    }

    if (nowMs - lastStateWrite >= 10_000) {
      writeStateSnapshot();
      lastStateWrite = nowMs;
      flushLogs();
    }
  }
}

/** Non-pure-adjacent (no ns) helper: rolling-hour sum of rep-yield event durations, kept out of resolveYieldGrant's signature so that function stays a plain reducer over caller-supplied state. */
function rollingHourRepYieldMs(events, nowMs) {
  return events.filter((e) => e.startMs > nowMs - 3_600_000).reduce((sum, e) => sum + e.durationMs, 0);
}

/**
 * Pure. Milliseconds of Diplomacy still affordable inside the rolling hour, per
 * `MAX_DIPLOMACY_DUTY`. Same shape as the rep-yield ledger (S2.3). Returns 0 when the
 * ceiling is reached, which is what makes `pickOverheadAction`'s chaos branch fall
 * through to healing instead of grinding a lever that may be too weak to help.
 * @param {{startMs:number, durationMs:number}[]} events
 */
export function diplomacyBudgetRemainingMs(events, nowMs, maxDuty = MAX_DIPLOMACY_DUTY) {
  const spent = events.filter((e) => e.startMs > nowMs - 3_600_000).reduce((sum, e) => sum + e.durationMs, 0);
  return Math.max(0, maxDuty * 3_600_000 - spent);
}

/**
 * Pure. Folds one completed Diplomacy run's observed chaos delta into a running estimate
 * — the number this whole policy is missing and cannot be designed correctly without.
 * `chaosBefore - chaosAfter` is chaos REMOVED, so positive means it worked. Kept as a
 * small ring so the estimate tracks the current regime rather than the whole run.
 * @param {{runs:number, totalRemoved:number, samples:number[]}} prior
 */
export function accumulateDiplomacyEffect(prior, chaosBefore, chaosAfter, maxSamples = 20) {
  const removed = chaosBefore - chaosAfter;
  if (!Number.isFinite(removed)) return prior;
  const samples = [...prior.samples, removed].slice(-maxSamples);
  return {
    runs: prior.runs + 1,
    totalRemoved: prior.totalRemoved + removed,
    samples,
    meanRemovedPerRun: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

/** Pure. A fresh Diplomacy-effect accumulator. */
export function emptyDiplomacyEffect() {
  return { runs: 0, totalRemoved: 0, samples: [], meanRemovedPerRun: null };
}
