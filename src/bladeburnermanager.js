/**
 * Phase 38 spec Slice B (WI2/WI3) -- bladeburnermanager.js: a headless resident
 * (gangmanager.js mould) that plays Bladeburner unattended and instruments its
 * own rank curve, cooperating with augfarmer.js's slot hold (Slice A) via the
 * SLOT_HOLD_FILE marker contract.
 *
 * **Deliverable is a decision** -- is the counter-map's back-half Bladeburner
 * premise real? -- not a BN6 clear. Hacking remains the BN6 win path; this
 * engine's whole purpose is to measure whether the rank grind is fast enough
 * to matter for BN9/BN10/BN13/BN14, per docs/bn6-playbook.md.
 *
 * Marker contract (owned here, augfarmer.js only ever reads):
 *   file bladeburner-slot-hold.json, home. {ts: epoch ms, holder: string}.
 *   Written/refreshed BEFORE every startAction call (never after -- reversed
 *   ordering lets augfarmer's next poll read the slot idle and re-grab it).
 *   Deleted on release / off-marker / atExit. See phase-38-bladeburner-engine
 *   .spec.md's "marker contract" section for the full rationale.
 *
 * Off-marker (bladeburner-off.txt) idles IN-LOOP, matching cloudmanager.js's
 * OFF_MARKER pattern -- it does NOT exit, because the supervisor is gated
 * only on inBladeburner() and an exiting-but-still-in-node script would be
 * relaunched every SUPERVISOR_RETRY_MS forever (the 110-attempt/9.1h flood
 * the gang-gating precedent exists to prevent).
 *
 * Decision 3 (blocker B4): stands down for any of backdoorwd.js/
 * backdoorfactions.js/studybootstrap.js -- checked via ns.ps("home") every
 * BB_POLL_MS and before every startAction. augfarmer.js itself never
 * outranks this engine; that's the entire point of Slice A's cooperative
 * hold.
 *
 * No money spent via any API (skill points are earned, not bought with
 * cash). No dashboard change this phase (Phase 24 gate) --
 * bladeburner-state.json + bladeburner-log.json are the observability
 * surface.
 *
 * Completeness fixes, 2026-08-01 (found while checking live state against
 * features doc D10 -- confirmed live: teamSize stuck at 0, chaos climbing
 * unchecked, for the entire session, because augfarmer.js's "grinding" phase
 * -- its steady state during a climb -- classifies as contested, so the
 * free-window branch that gates ALL general actions almost never runs; a
 * known, logged, deliberately-out-of-scope augfarmer limitation per the
 * spec's decision 6, not something this file should route around):
 *   - `setTeamSize` was never called anywhere -- `Recruitment` building an
 *     "available" pool never reached an Operation, which needs its own
 *     explicit per-action assignment (a separate count from the pool, per
 *     the API's own remarks). Now assigned every contested tick an
 *     Operation is picked.
 *   - `Incite Violence` -- named a "kept" action in features D10 -- was
 *     decided-and-never-wired into `pickOverheadAction`. Added, gated on a
 *     new `isInventoryLow` signal, as a safety net against the features
 *     doc's one still-open question (inventory exhaustion over a multi-day
 *     run).
 *   - Stamina is now read and exposed in bladeburner-state.json
 *     (visibility only, no policy attached yet) -- the prior "0% penalty"
 *     reading was a 75min high-variety trial, not a multi-hour continuous
 *     one; live at restart it read 22% of max, materially lower.
 * `Field Analysis`/`Training` were deliberately NOT added to the overhead
 * ladder or given a contested-time carve-out -- features D10 already
 * measured Field Analysis as near-worthless (0.1 rank/30s, barely narrows
 * the estimate) and Training as strictly dominated by Reaper/Evasive System
 * (stats wipe on install, skill points don't). Re-litigating either would be
 * reopening an already-reasoned decision without new evidence.
 */

// ---- Files ----------------------------------------------------------------
export const BB_STATE_FILE = "bladeburner-state.json";
export const BB_LOG_FILE = "bladeburner-log.json";
export const BB_LOG_MAX_ENTRIES = 2000;
export const BB_OFF_MARKER = "bladeburner-off.txt";
// Own copy of the marker contract's filename/tuning -- bladeburnermanager.js
// is never imported by augfarmer.js and vice versa (import-bleed rule), so
// these live twice, in sync by convention, not by shared code.
export const SLOT_HOLD_FILE = "bladeburner-slot-hold.json";
export const SLOT_HOLD_HOLDER_NAME = "bladeburnermanager";
export const SLOT_HOLD_MAX_AGE_MS = 30_000;
// Read-only reference to augfarmer.js's own state file -- window classification input.
const AUG_STATE_FILE = "augfarmer-state.json";
// Read-only references to the two activity-marker-bearing claimants' own
// state files (decision 3 amendment, 2026-08-01, extended to backdoorwd.js
// the same day -- see classifyBackdoorActivity's doc comment). Keyed by the
// exact filename higherPriorityClaimant returns, so the main-loop lookup is
// a plain object index, not a chain of ===. studybootstrap.js has no entry:
// it's one-shot, never resident, so it keeps the original presence-only rule.
const BACKDOOR_ACTIVITY_FILES = {
  "backdoorfactions.js": "backdoorfactions-activity.json",
  "backdoorwd.js": "backdoorwd-activity.json",
};

// ---- Tuning (spec decisions 4/6/7/8/9) -------------------------------------
export const BB_POLL_MS = 10_000; // matches augfarmer's POLL_MS -- 3 marker refreshes inside SLOT_HOLD_MAX_AGE_MS
export const HOLD_SLICE_MS = 60_000; // one-minute contested slices (decision 4)
export const MAX_CONTESTED_DUTY = 0.25; // at most 25% of contested wall-time held, per rolling hour
export const AUG_STATE_FRESH_MS = 60_000; // beyond this, augfarmer-state.json is treated as stale -> contested (decision 6)
// Decision 3 amendment (2026-08-01, extended to backdoorwd.js same day):
// both claimants write their activity marker every POLL_MS (60s, their own
// constant, not imported -- see the import-bleed rule) while idle, so 3x
// that cadence is the same max(3x-writer-cadence, floor) shape as every
// other freshness bound in this codebase (dashboard.js's STALE_MS, this
// file's own AUG_STATE_FRESH_MS).
export const BACKDOOR_ACTIVITY_FRESH_MS = 180_000;
export const HP_FLOOR_FRACTION = 0.5; // below this fraction of max HP, only non-HP-risking actions run (decision 7)
export const HOSPITALIZATION_COST_ESTIMATE = 10_400_000; // re-seeded 2026-08-02 from the live panel's $837.4m / 81 hospitalizations
// Measured 2026-08-02 from the in-game event log: EVERY failed Tracking contract logged
// "Took 3 damage", and max HP is `10 + floor(defense/10)` = 27 at defense 171 -- so a
// hospitalization costs NINE failures, not one. The discount in `pickRankAction` used to
// charge the full hospitalization estimate against every individual failure, which is a
// ~9x overcharge at full HP and scored Tracking at -0.0316 against Investigation's +0.0016.
// That single sign flip is why the engine ground the 4x-worse action for hours.
export const HP_DAMAGE_PER_FAILURE = 3;
// 🔴 2026-08-02, found live within minutes of shipping the HP-floor fix below: a single
// threshold makes the HP guard FLAP. Observed -- HP 15 -> fail -> 12 (below the 0.5 floor)
// -> rest 1 min -> 14 (above it) -> one contract -> fail -> 11 -> rest... Because
// Hyperbolic Regeneration Chamber restores only 2 HP/min while one failed contract costs 3,
// a single failure re-trips the guard immediately. Same shape, and same fix, as
// STAMINA_RESUME_FRACTION: recover to a margin above the floor, not to the floor itself.
export const HP_RESUME_FRACTION = 0.85;
// RANK_MONEY_EXCHANGE is a DECLARED, PROVISIONAL constant (spec decision 7: "so
// the trade-off is visible and tunable rather than implicit") -- there is no
// real dollars-per-rank exchange rate; this sets how strongly a candidate's
// failure cost discourages it relative to its raw expected rank/sec. Logged
// on every pickRankAction call site so it's revisable from measured data.
export const RANK_MONEY_EXCHANGE = 10_000_000;
export const BLACKOPS_DAEDALUS_RANK = 400_000; // Operation Daedalus's rank gate (docs/bladeburner-reference.md S8)

// Decision 9's checkpoint bars, re-derived against rankPerHeldSec.
export const CHECKPOINT_A_UPTIME_MS = 24 * 3600_000;
export const CHECKPOINT_A_BAR = 0.043;
export const CHECKPOINT_B_UPTIME_MS = 7 * 24 * 3600_000;
export const CHECKPOINT_B_BAR = 0.1543;

// Only the FINITE windows are derived from the per-tick sample buffer. `cumulative`
// is deliberately absent: it is built from `totals` (see emptyTotals) instead,
// because a ring-buffered sample array can never express "since the engine
// started" -- found live 2026-08-02, when a 10,000-sample cap silently made both
// "24h" and "cumulative" mean "the last 2h47m" and left both checkpoints
// permanently `null`. Adding `cumulative: Infinity` back here would reintroduce
// exactly that bug.
export const RATE_WINDOWS_MS = { "1h": 3_600_000, "24h": 86_400_000 };

// `ns.bladeburner.nextUpdate()` resolves ~1x/sec, so the sample buffer must hold
// at least as many samples as the largest finite window has SECONDS or that
// window truncates without saying so. Pruning is by timestamp (exact, and it
// self-adjusts if RATE_WINDOWS_MS changes); the count cap is only a
// runaway backstop for a build whose tick rate is faster than assumed.
export const MAX_FINITE_WINDOW_MS = Math.max(...Object.values(RATE_WINDOWS_MS));
export const SAMPLE_HARD_CAP = 120_000;

// Decision 3: the three scripts that outrank this engine for the player-action slot.
export const HIGHER_PRIORITY_CLAIMANTS = ["backdoorwd.js", "backdoorfactions.js", "studybootstrap.js"];

// WI2's skill table: Overclock -> Blade's Intuition -> Digital Observer/Tracer
// -> Reaper/Evasive System. Never Hands of Midas/Hyperdrive/Cyber's Edge/
// Datamancer -- and Cloak/Short-Circuit are excluded too, simply by never
// appearing in this order (planSkillBuy only ever considers listed skills).
// 🔴 REORDERED 2026-08-02 (Phase 39 D5), after measuring the real cost curve with the
// extended bladeburnerskillprobe.js. Two things were wrong with the old order
// `["Overclock", "Blade's Intuition", ...]` + `{Overclock: 90}`:
//
//  1. **Overclock was first, and it is the one skill we cannot yet justify.** It costs
//     5,636 SP / 16,908 rank for an 8.3x ACTION-TIME multiplier -- which is worth nothing
//     if stamina, not time, is the binding constraint. That is Phase 39 Q10 and it is
//     unmeasured, so Overclock is HELD at its current level until answered. (Held via the
//     cap, not by removing it from the order, so re-enabling is a one-line change.)
//  2. **The practical effect was diffuse drip-buying.** Because planSkillBuy takes the
//     first AFFORDABLE entry, and Overclock's next level costs 27 SP, small balances kept
//     falling through to whatever was cheapest -- live evidence 2026-08-02: Reaper went
//     4 -> 6 and Evasive System 4 -> 5 while the two skills that actually gate the Stage
//     A -> B tier switch sat at 6 and 6. 407 SP had been spent this way for a x1.18 total
//     success multiplier.
//
// Measured payoff for the new order: Blade's Intuition + Digital Observer both to L25 =
// 1,305 SP / 3,915 rank, taking operation success from x1.42 to x3.50. Tracer is included
// at the same tier because it lifts CONTRACTS, which is what Stage A actually runs.
// Caps are a deliberate checkpoint, not a ceiling -- when all three reach 25, SP starts
// accumulating unspent, which is the signal to re-evaluate against fresh numbers.
//
// ⚠️ Known minor imperfection: planFirstEligible fills sequentially (BI to 25, then DO,
// then Tracer) rather than round-robin. Since the skills' effects multiply, a balanced
// climb would dominate slightly at every intermediate point; the ENDPOINT is identical,
// so this is not worth extra machinery today. Logged rather than silently accepted.
export const SKILL_BUY_ORDER = ["Blade's Intuition", "Digital Observer", "Tracer", "Overclock", "Reaper", "Evasive System"];
export const OVERCLOCK_HOLD_LEVEL = 17; // Phase 39 Q10 -- raise to 90 once stamina cost is proven per-SECOND
export const SKILL_LEVEL_CAP = {
  "Blade's Intuition": 25,
  "Digital Observer": 25,
  Tracer: 25,
  Overclock: OVERCLOCK_HOLD_LEVEL,
  Reaper: 6,
  "Evasive System": 6,
};

// Free-window overhead actions (decision 6) and their policy knobs. Not a
// spec-mandated formula -- a defensible, logged default: keep HP topped
// first, suppress chaos before it costs future success chance, else grow
// the team (Operations/BlackOps only benefit), else just top HP again.
export const CHAOS_DIPLOMACY_THRESHOLD = 1.0;
export const TEAM_SIZE_TARGET = 6;
// Stamina guard (2026-08-02). Measured live off the in-game panel, not assumed:
// `Stamina Penalty: 89.5%` at 4.371/83.555 stamina (5.2%), against `0.0%` at full
// stamina on 2026-07-31. The reference's §9 "still open" note said stamina was
// full throughout the 7/30 trial so it was not then a factor -- a continuous run
// makes it the dominant one. Two thresholds, not one: recovering only to the
// floor would resume firing straight back into the penalty band and flap.
export const STAMINA_FLOOR_FRACTION = 0.5;
export const STAMINA_RESUME_FRACTION = 0.8;
export const CITY_ROTATE_CHAOS_THRESHOLD = 2.0; // shouldRotateCity's default -- open question 1: switchCity cost/interruption unmeasured
// Provisional, logged (RANK_MONEY_EXCHANGE's pattern) -- the 7/30 trial read counts in the
// hundreds (Tracking 496, Raid 268) and called inventory "not the binding constraint", but that
// was a ~75min sample; the regen-vs-consumption rate over a multi-day run is the features doc's
// own still-open question. This is a conservative floor, not a measured one -- revisit once
// inventory-count samples exist across a long run.
export const LOW_INVENTORY_COUNT_THRESHOLD = 20;

const CONTRACTS = ["Tracking", "Bounty Hunter", "Retirement"];
const OPERATIONS = ["Investigation", "Undercover Operation", "Sting Operation", "Raid", "Stealth Retirement Operation", "Assassination"];
const NO_HP_RISK_ACTIONS = new Set(["Investigation"]); // decision 7: the one action with no HP loss on failure

// ---- Pure functions (the testable surface) ---------------------------------

/** Pure. `(pMin*rankGain - (1-pMin)*rankLoss) / (timeMs/1000)`. */
export function expectedRankPerSec({ pMin, rankGain, rankLoss, timeMs }) {
  const seconds = timeMs / 1000;
  if (!(seconds > 0)) return 0;
  return (pMin * rankGain - (1 - pMin) * rankLoss) / seconds;
}

/**
 * Pure (decision 7). Picks the best rank-producing candidate, EV minus a
 * priced failure cost.
 *
 * 🔴 2026-08-02 -- TWO live-measured defects fixed here. Both made the engine
 * grind `Investigation` (true EV 0.0077 rank/s) instead of `Tracking` (0.0307),
 * i.e. 4x worse, for hours at a stretch.
 *
 * 1. **The hospitalization discount was charged per FAILURE, not per
 *    HOSPITALIZATION.** It takes `ceil(hp / HP_DAMAGE_PER_FAILURE)` failures to
 *    hospitalize -- NINE at full HP (27 max, 3 damage a failure, both measured).
 *    Charging the whole $10.4m against each individual failure scored Tracking at
 *    **-0.0316** against Investigation's **+0.0016**, so the engine correctly
 *    followed a badly wrong number. Now amortised over the failures actually
 *    remaining before hospitalization, which also makes the discount *rise* as HP
 *    falls -- the intended risk-aversion, now on the right scale.
 * 2. **The HP floor was a trap, not a guard.** Below `hpFloorFraction` the pool
 *    filtered to non-HP-risking actions, which is exactly `[Investigation]` -- and
 *    Investigation never restores HP, so nothing could ever lift HP back above the
 *    floor. The engine parked there indefinitely while `pickOverheadAction`'s own
 *    HP->Hyperbolic-Regeneration-Chamber branch sat unreachable (dead code). Now the
 *    HP-low case returns `null`, routing to that recovery branch as designed; HRC
 *    restores HP *and* stamina, so it buys back the far more valuable action too.
 *
 * Returns `null` when nothing should be run -- the caller runs recovery overhead
 * instead (Hyperbolic Regeneration Chamber isn't a rank candidate, so it never
 * appears in `candidates`).
 * @param {{type:string, name:string, pMin:number, rankGain:number, rankLoss:number, timeMs:number, risksHp:boolean}[]} candidates
 * @param {{hpFraction:number, hpCurrent?:number, hpFloorFraction?:number, hospitalizationCostEstimate?:number, rankMoneyExchange?:number, damagePerFailure?:number}} opts
 */
export function pickRankAction(candidates, opts) {
  const {
    hpFraction,
    hpCurrent = null,
    hpRecovering = null,
    hpFloorFraction = HP_FLOOR_FRACTION,
    hospitalizationCostEstimate = HOSPITALIZATION_COST_ESTIMATE,
    rankMoneyExchange = RANK_MONEY_EXCHANGE,
    damagePerFailure = HP_DAMAGE_PER_FAILURE,
  } = opts;

  // Defect 2: recover rather than grind the one action that can never lift HP.
  // Prefers the caller's hysteresis latch (`updateHpRecovering`) when supplied;
  // the bare threshold is the fallback, and it FLAPS -- see HP_RESUME_FRACTION.
  if (hpRecovering !== null ? hpRecovering : hpFraction < hpFloorFraction) return null;
  if (candidates.length === 0) return null;

  // Defect 1: how many more failures we can absorb before a hospitalization.
  // Falls back to 1 (the old, punitive behaviour) only when absolute HP is
  // unavailable -- callers pass it, so that path is a safety net, not the norm.
  const failuresToHospitalize =
    hpCurrent !== null && damagePerFailure > 0 ? Math.max(1, Math.ceil(hpCurrent / damagePerFailure)) : 1;

  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const ev = expectedRankPerSec(c);
    const actionSeconds = c.timeMs / 1000;
    const discount =
      c.risksHp && actionSeconds > 0
        ? ((1 - c.pMin) * (hospitalizationCostEstimate / failuresToHospitalize)) / actionSeconds / rankMoneyExchange
        : 0;
    const score = ev - discount;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Pure. At most one skill buy per call (evalLadderMove's "one op per call"
 * precedent) -- walks `policy.order`, skipping capped/unaffordable skills,
 * buying the first eligible one. `costs` is `{skillName: nextLevelCost}`,
 * a live single-level snapshot (the SP cost curve is unpublished, so this
 * applies a marginal rule rather than assuming a closed form).
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

/**
 * Pure. `true` when every tracked Contract/Operation's remaining count is at/under `threshold` --
 * i.e. the whole pool is genuinely thin, not just one action drained (single-action depletion is
 * already handled by `buildCandidates` skipping it and picking among what's left). An empty list
 * counts as low too (nothing left at all).
 * @param {number[]} counts
 * @param {number} [threshold]
 */
export function isInventoryLow(counts, threshold = LOW_INVENTORY_COUNT_THRESHOLD) {
  if (counts.length === 0) return true;
  return counts.every((c) => c <= threshold);
}

/**
 * Pure. Rotates to the lowest-chaos other city once the current city's
 * chaos crosses `threshold`. Open question 1 (spec): switchCity's cost/
 * interruption is unmeasured -- this is built ahead of that measurement.
 * @param {Record<string, number>} chaosByCity
 * @param {string} cityName
 * @param {number} threshold
 */
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

const FREE_PHASES = new Set(["spend-down", "installing", "paused", "idle-plateau"]);

/**
 * Pure (decision 6). `free` only when augfarmer emits no faction-work action
 * at all; `contested` for everything else, including a missing/unparseable/
 * stale state file (the caller is responsible for turning a JSON-parse
 * failure into `null` before calling this -- that's what makes "missing" and
 * "unparseable" collapse to the same branch here) and `awaiting-money` with
 * `workTarget.deficit === 0` (review S5 -- rep still accrues there, so it
 * must NOT be classified free).
 * @param {{phase:string, timestamp:number}|null} augState
 * @param {number} nowMs
 */
export function classifyWindow(augState, nowMs) {
  if (!augState || typeof augState.timestamp !== "number") return "contested";
  if (nowMs - augState.timestamp > AUG_STATE_FRESH_MS) return "contested";
  return FREE_PHASES.has(augState.phase) ? "free" : "contested";
}

/**
 * Pure (decision 3). The name of any running higher-priority claimant, or
 * `null`. `processList` is `ns.ps("home")`'s output ({filename, ...}[]).
 * @param {{filename:string}[]} processList
 */
export function higherPriorityClaimant(processList) {
  for (const p of processList) {
    if (HIGHER_PRIORITY_CLAIMANTS.includes(p.filename)) return p.filename;
  }
  return null;
}

/**
 * Pure (decision 3 amendment, 2026-08-01, extended to backdoorwd.js the same
 * day). `higherPriorityClaimant` alone can't distinguish "resident but
 * asleep in its 60s poll" from "mid-installBackdoor()" -- it only sees
 * process presence, and both `backdoorfactions.js` and `backdoorwd.js` stay
 * resident for their entire unmet-target lifetime (potentially most of the
 * hacking climb), not just the brief windows they're actually touching the
 * shared action slot. This reads the claimant's own activity marker
 * (written immediately before/after its installBackdoor() block) to recover
 * the distinction, so the engine can reclaim the idle majority of that
 * residency instead of standing down for the whole thing.
 *
 * Fails toward `"busy"` on every ambiguous case -- missing/malformed marker,
 * an explicit `active:true`, or a stale timestamp all mean "can't prove it's
 * safe", same fail-conservative shape as `classifyWindow`. Only an explicit
 * `active:false` with a FRESH timestamp counts as `"idle"`. This narrows,
 * but does not eliminate, the race decision 3 was built to avoid -- see the
 * spec's decision 3 amendment for the accepted residual window.
 *
 * `backdoorwd.js` was initially left out of the first amendment on the
 * assumption its irreversible, run-ending action was categorically riskier
 * to interrupt -- re-examined the same day: an interrupted
 * `installBackdoor()` just retries next poll either way (WD has no closing
 * window), so the recovery cost is identical, not worse. What's actually
 * different about WD is the importance of the event once it *fires*, not
 * the fragility of an interruption, so the same trade applies.
 * `studybootstrap.js` still has no marker: it's one-shot (never resident),
 * so it never had this problem.
 * @param {{active:boolean, timestamp:number}|null} activity
 */
export function classifyBackdoorActivity(activity, nowMs) {
  if (!activity || typeof activity.timestamp !== "number") return "busy";
  if (activity.active) return "busy";
  if (nowMs - activity.timestamp > BACKDOOR_ACTIVITY_FRESH_MS) return "busy";
  return "idle";
}

/**
 * Pure (decision 8, blocker B7). Per named window, sums already-recorded
 * per-tick samples ({timestamp, heldSec, uptimeSec, rankDelta}) within
 * `windowMs` of `nowMs` and derives the two realized rates. `heldSec`
 * includes zero-rank overhead ticks (excluding it would flatter the rate by
 * exactly the amount decision 6/D10 says is material). Zero-held/zero-uptime
 * windows report rate 0, never NaN/Infinity.
 * @param {{timestamp:number, heldSec:number, uptimeSec:number, rankDelta:number}[]} samples
 * @param {Record<string, number>} windows label -> window length in ms (Infinity for cumulative)
 * @param {number} nowMs
 */
export function computeRealizedRates(samples, windows, nowMs) {
  const out = {};
  for (const [label, windowMs] of Object.entries(windows)) {
    const cutoff = Number.isFinite(windowMs) ? nowMs - windowMs : -Infinity;
    const inWindow = samples.filter((s) => s.timestamp >= cutoff && s.timestamp <= nowMs);
    const heldSec = inWindow.reduce((sum, s) => sum + (s.heldSec ?? 0), 0);
    const engineUptimeSec = inWindow.reduce((sum, s) => sum + (s.uptimeSec ?? 0), 0);
    const rankGained = inWindow.reduce((sum, s) => sum + (s.rankDelta ?? 0), 0);
    out[label] = {
      rankGained,
      heldSec,
      engineUptimeSec,
      rankPerHeldSec: heldSec > 0 ? rankGained / heldSec : 0,
      rankPerWallSec: engineUptimeSec > 0 ? rankGained / engineUptimeSec : 0,
    };
  }
  return out;
}

/**
 * Pure. Drops samples older than `maxWindowMs`, with a count cap as a runaway
 * backstop. A count cap ALONE is not sufficient and was the 2026-08-02 bug: it
 * bounds the buffer in ticks, but every window here is expressed in wall time,
 * so a cap smaller than `maxWindowMs / tickMs` truncates the widest window
 * without any visible symptom. The cheap `samples[0]` check keeps the common
 * tick allocation-free.
 * @param {{timestamp:number}[]} samples
 */
export function pruneSamples(samples, nowMs, maxWindowMs = MAX_FINITE_WINDOW_MS, hardCap = SAMPLE_HARD_CAP) {
  const cutoff = nowMs - maxWindowMs;
  let out = samples.length > 0 && samples[0].timestamp < cutoff ? samples.filter((s) => s.timestamp >= cutoff) : samples;
  if (out.length > hardCap) out = out.slice(out.length - hardCap);
  return out;
}

/**
 * Pure. A fresh since-startup accumulator. These are the numbers the Phase 38
 * checkpoints are actually judged on, so they must NOT live in the pruned
 * sample buffer: `uptimeSec` is what gets compared against
 * CHECKPOINT_A/B_UPTIME_MS, and a ring buffer caps it below 24h forever.
 * Persisted into bladeburner-state.json and re-seeded on startup by
 * `seedTotals`, because the engine is restarted routinely (augfarmer's installs
 * killed and relaunched it 6 times in the 27h before 2026-08-02) and an
 * in-memory-only total would reset well inside a 24h -- let alone 1-week --
 * measurement.
 */
export function emptyTotals() {
  return { heldSec: 0, uptimeSec: 0, rankGained: 0, rankSec: 0, overheadSec: 0, unheldSec: 0, restarts: 0 };
}

/** Pure. Folds one per-tick sample into the since-startup totals. Returns a new object; never mutates. */
export function accumulateTotals(totals, sample) {
  const dur = sample.uptimeSec ?? 0;
  return {
    heldSec: totals.heldSec + (sample.heldSec ?? 0),
    uptimeSec: totals.uptimeSec + dur,
    rankGained: totals.rankGained + (sample.rankDelta ?? 0),
    rankSec: totals.rankSec + (sample.kind === "contested" ? dur : 0),
    overheadSec: totals.overheadSec + (sample.kind === "free" ? dur : 0),
    unheldSec: totals.unheldSec + (sample.kind === "unheld" ? dur : 0),
    restarts: totals.restarts,
  };
}

/**
 * Pure. Recovers the totals from a previously-persisted bladeburner-state.json
 * so a restart continues the measurement instead of restarting it, and counts
 * the restart. Missing/malformed/partial input degrades to a fresh accumulator
 * rather than throwing -- a corrupt state file must not wedge the engine.
 * @param {any} state parsed bladeburner-state.json, or null
 */
export function seedTotals(state) {
  const fresh = emptyTotals();
  const prior = state?.totals;
  if (!prior || typeof prior !== "object") return fresh;
  const seeded = {};
  for (const key of Object.keys(fresh)) {
    const value = prior[key];
    seeded[key] = Number.isFinite(value) && value >= 0 ? value : fresh[key];
  }
  seeded.restarts += 1;
  return seeded;
}

/** Pure. The `cumulative` entry of `rates`, derived from totals rather than from the pruned sample buffer. */
export function ratesFromTotals(totals) {
  return {
    rankGained: totals.rankGained,
    heldSec: totals.heldSec,
    engineUptimeSec: totals.uptimeSec,
    rankPerHeldSec: totals.heldSec > 0 ? totals.rankGained / totals.heldSec : 0,
    rankPerWallSec: totals.uptimeSec > 0 ? totals.rankGained / totals.uptimeSec : 0,
  };
}

/** Pure. The `cumulative` entry of `duty`, derived from totals. Same three-way split as computeDutyCycle. */
export function dutyFromTotals(totals) {
  const totalSec = totals.rankSec + totals.overheadSec + totals.unheldSec;
  return {
    rankSec: totals.rankSec,
    overheadSec: totals.overheadSec,
    unheldSec: totals.unheldSec,
    dutyCycle: totalSec > 0 ? (totals.rankSec + totals.overheadSec) / totalSec : 0,
  };
}

/**
 * Pure. Per named window, the three-way split of engine uptime: `rankSec`
 * (held time running an action that actually pays rank), `overheadSec` (held
 * time running a zero-rank General action -- Hyperbolic Regeneration Chamber,
 * Diplomacy, Recruitment, Incite Violence), `unheldSec` (stood down --
 * off-marker or a higher-priority claimant). `dutyCycle` is the held fraction
 * of total uptime.
 *
 * `kind` is tagged from the CHOSEN ACTION, not from the window: before
 * 2026-08-02 a contested window that fell back to HRC (the exhausted-inventory
 * path) was still tagged "contested" and so counted as rankSec, which made a
 * zero-rank stall read as 100% productive duty. The rate denominators were
 * never wrong -- `heldSec` intentionally includes overhead -- but the split
 * that exists to make that overhead visible was.
 * @param {{timestamp:number, uptimeSec:number, kind:"contested"|"free"|"unheld"}[]} samples
 * @param {Record<string, number>} windows
 * @param {number} nowMs
 */
export function computeDutyCycle(samples, windows, nowMs) {
  const out = {};
  for (const [label, windowMs] of Object.entries(windows)) {
    const cutoff = Number.isFinite(windowMs) ? nowMs - windowMs : -Infinity;
    const inWindow = samples.filter((s) => s.timestamp >= cutoff && s.timestamp <= nowMs);
    let rankSec = 0;
    let overheadSec = 0;
    let unheldSec = 0;
    for (const s of inWindow) {
      const dur = s.uptimeSec ?? 0;
      if (s.kind === "contested") rankSec += dur;
      else if (s.kind === "free") overheadSec += dur;
      else unheldSec += dur;
    }
    const totalSec = rankSec + overheadSec + unheldSec;
    out[label] = { rankSec, overheadSec, unheldSec, dutyCycle: totalSec > 0 ? (rankSec + overheadSec) / totalSec : 0 };
  }
  return out;
}

/** Pure (decision 2's audit trail). The experiment's rep price: held contested seconds times the observed rep rate. */
export function computeRepForegone(contestedHeldSec, repRatePerSec) {
  return contestedHeldSec * repRatePerSec;
}

/** Pure. Checkpoint arithmetic: seconds to `target` at `ratePerSec`. `null` for a zero/negative rate (unreachable, not an error); `0` once already at/past target. */
export function projectRankEta(rankNow, target, ratePerSec) {
  const remaining = target - rankNow;
  if (remaining <= 0) return 0;
  if (!(ratePerSec > 0)) return null;
  return remaining / ratePerSec;
}

/** Ring-trims BB_LOG_FILE's in-memory buffer, plain FIFO (gangmanager.js's appendGangLog precedent). */
export function appendBbLog(entries, record) {
  entries.push(record);
  if (entries.length > BB_LOG_MAX_ENTRIES) entries = entries.slice(entries.length - BB_LOG_MAX_ENTRIES);
  return entries;
}

/** Pure. Parses persisted BB_LOG_FILE content into a starting buffer (gangmanager.js's seedGangLog precedent) -- malformed/missing/non-array all fall back to []. */
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

/**
 * Pure. Estimates the current rep/sec augfarmer is (or would be) earning on
 * its live workTarget, from two augfarmer-state.json reads -- the cheapest
 * signal available without adding a Singularity call (and RAM) to this
 * engine just to sample faction rep directly. Only comparable across two
 * samples targeting the SAME (faction, aug) pair; anything else (missing
 * data, a target change, a non-decreasing deficit) reports `null` ("unknown
 * this pass") rather than a misleading number. Spec open question 5: this
 * makes `repForegone` a slight UNDER-estimate (the rate is sampled while
 * partly held), which is the safe direction, not exact.
 * @param {{workTarget:{aug:string,faction:string,deficit:number}}|null} prevAugState
 * @param {{workTarget:{aug:string,faction:string,deficit:number}}|null} currAugState
 * @param {number} dtSec
 */
export function estimateRepRatePerSec(prevAugState, currAugState, dtSec) {
  const prev = prevAugState?.workTarget;
  const curr = currAugState?.workTarget;
  if (!prev || !curr || !(dtSec > 0)) return null;
  if (prev.aug !== curr.aug || prev.faction !== curr.faction) return null;
  const closed = prev.deficit - curr.deficit;
  if (!(closed > 0)) return null;
  return closed / dtSec;
}

/** Pure. Assembles the bladeburner-state.json snapshot from already-computed values. */
export function buildBbState({ now, off, holdActive, holdReason, standDownFor, rank, skillPoints, skillLevels, cityName, chaosByCity, teamSize, hpFraction, stamina = null, rates, duty, totals = null, repForegone, hospitalizations, checkpointA, checkpointB }) {
  return {
    timestamp: now,
    time: new Date(now).toLocaleTimeString(),
    off,
    holdActive,
    holdReason,
    standDownFor,
    rank,
    skillPoints,
    skillLevels,
    cityName,
    chaosByCity,
    teamSize,
    hpFraction,
    stamina,
    rates,
    duty,
    // Load-bearing, not diagnostic: seedTotals reads this back on restart, so
    // dropping it from the snapshot silently restarts the measurement.
    totals,
    repForegone,
    hospitalizations,
    checkpointA,
    checkpointB,
    blackOpsDaedalusRank: BLACKOPS_DAEDALUS_RANK,
  };
}

// ---- Non-pure helpers (touch ns, kept tiny and uncovered by unit tests) ----

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
    // best-effort -- decision 5's staleness guard is the real backstop
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

function buildCandidates(ns) {
  const candidates = [];
  for (const [type, names] of [
    ["Contracts", CONTRACTS],
    ["Operations", OPERATIONS],
  ]) {
    for (const name of names) {
      if (ns.bladeburner.getActionCountRemaining(type, name) < 1) continue;
      const [pMin] = ns.bladeburner.getActionEstimatedSuccessChance(type, name);
      candidates.push({
        type,
        name,
        pMin,
        rankGain: ns.bladeburner.getActionRankGain(type, name),
        rankLoss: ns.bladeburner.getActionRankLoss(type, name),
        timeMs: ns.bladeburner.getActionTime(type, name),
        risksHp: !NO_HP_RISK_ACTIONS.has(name),
      });
    }
  }
  return candidates;
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

/** Free-window overhead choice (decision 6). Not a spec-mandated formula -- see CHAOS_DIPLOMACY_THRESHOLD's declaration.
 * `Incite Violence` added 2026-08-01: features doc D10 named it one of the four "protective or
 * enabling" actions that stay (contract/op inventory regen), but it was decided-and-never-wired --
 * the ladder only ever covered HRC/Diplomacy/Recruitment. Without it, if the pool ever genuinely
 * thins over a multi-day unattended run (features doc's own still-open question: "determines
 * whether a sustainable steady state exists or whether the engine exhausts its inventory and
 * stalls"), `buildCandidates` would eventually return empty, `pickRankAction` would return null, and
 * the contested branch would fall back to HRC forever with no path back -- a silent, permanent stall.
 * Placed above chaos/team since running dry is a stall, not just an efficiency loss. */
/**
 * Pure. Hysteresis latch for the stamina guard: trips at `floor`, releases only
 * at `resume`, holds its previous value in between. A single threshold would
 * resume firing at the exact stamina level that just failed, so the engine would
 * flap in and out of the penalty band instead of recovering out of it.
 */
export function updateStaminaRecovering(recovering, staminaFraction, floor = STAMINA_FLOOR_FRACTION, resume = STAMINA_RESUME_FRACTION) {
  if (staminaFraction < floor) return true;
  if (staminaFraction >= resume) return false;
  return recovering;
}

/**
 * Pure. Same hysteresis latch as `updateStaminaRecovering`, for HP. Added
 * 2026-08-02 after the single-threshold HP guard was observed flapping live --
 * HRC restores 2 HP/min but one failed contract costs 3, so recovering only to
 * the floor guarantees the very next failure re-trips it.
 */
export function updateHpRecovering(recovering, hpFraction, floor = HP_FLOOR_FRACTION, resume = HP_RESUME_FRACTION) {
  if (hpFraction < floor) return true;
  if (hpFraction >= resume) return false;
  return recovering;
}

export function pickOverheadAction(hpFraction, cityChaos, teamSize, lowInventory, staminaRecovering = false) {
  if (hpFraction < HP_FLOOR_FRACTION) return { type: "General", name: "Hyperbolic Regeneration Chamber" };
  // Whether the other General actions consume stamina is UNMEASURED (the reference
  // documents no stamina cost for any action), so recovery deliberately parks on the
  // one action known to restore rather than spend -- if they turn out to be free,
  // this ladder can do useful work while stamina refills instead. Logged as an open
  // question rather than assumed either way.
  if (staminaRecovering) return { type: "General", name: "Hyperbolic Regeneration Chamber" };
  if (lowInventory) return { type: "General", name: "Incite Violence" };
  if (cityChaos !== undefined && cityChaos > CHAOS_DIPLOMACY_THRESHOLD) return { type: "General", name: "Diplomacy" };
  if (teamSize < TEAM_SIZE_TARGET) return { type: "General", name: "Recruitment" };
  return { type: "General", name: "Hyperbolic Regeneration Chamber" };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  if (!ns.bladeburner.inBladeburner()) {
    ns.tprint("ERROR: bladeburnermanager.js started without Bladeburner access -- exiting.");
    return;
  }

  let samples = []; // {timestamp, heldSec, uptimeSec, rankDelta, kind} -- finite windows only, pruned
  // The checkpoint measurement continues across restarts (seedTotals' doc comment).
  let totals = seedTotals(readJsonState(ns, BB_STATE_FILE));
  let logEntries = seedBbLog(ns.read(BB_LOG_FILE));
  logEntries = appendBbLog(logEntries, { ...ts(), kind: "startup", resumedTotals: { ...totals } });
  // Seeded from the persisted log so a restart doesn't re-announce a verdict it
  // already recorded (the log ring-trims, so if it ages out it is re-logged --
  // which is the right failure direction for the phase's one deliverable).
  let checkpointALogged = logEntries.some((entry) => entry.kind === "checkpoint-A");
  let checkpointBLogged = logEntries.some((entry) => entry.kind === "checkpoint-B");

  let previousOffMarker = null;
  let previousStandDownFor = null;
  let previousRank = ns.bladeburner.getRank();
  let previousAugState = readJsonState(ns, AUG_STATE_FILE);
  let previousAugStateReadMs = Date.now();
  let contestedHeldSecTotal = 0;
  let repForegoneTotal = 0;
  let lastMarkerWriteMs = 0;
  let holdActive = false;
  let currentAction = null; // {type, name} -- what we last called startAction with
  // "Num Times Hospitalized" / "Money Lost From Hospitalizations" are panel-only
  // (docs/bladeburner-reference.md S5) -- no ns.bladeburner.* getter exposes
  // them, so this stays 0 until/unless a future API exposes it. Not a bug.
  const hospitalizationsSeen = null;
  let lastStateWrite = 0;
  let staminaRecovering = false; // hysteresis latch between STAMINA_FLOOR_FRACTION and STAMINA_RESUME_FRACTION
  let hpRecovering = false; // same latch shape for HP -- see HP_RESUME_FRACTION

  /** One place that records a tick, so the finite-window buffer and the since-startup
   *  totals can never drift apart (they did, silently, when each push site trimmed
   *  the buffer by hand and nothing accumulated a real total). */
  const recordSample = (sample) => {
    samples.push(sample);
    samples = pruneSamples(samples, sample.timestamp);
    totals = accumulateTotals(totals, sample);
  };

  /** The rates/duty/totals/checkpoint block, identical at all three state-write
   *  sites. `cumulative` and the checkpoint uptime come from `totals`, the finite
   *  windows from `samples` -- see RATE_WINDOWS_MS for why that split is mandatory. */
  const buildRateBlock = (atMs) => {
    const cumulativeRates = ratesFromTotals(totals);
    const rate = cumulativeRates.rankPerHeldSec;
    const uptimeMs = totals.uptimeSec * 1000;
    return {
      rates: { ...computeRealizedRates(samples, RATE_WINDOWS_MS, atMs), cumulative: cumulativeRates },
      duty: { ...computeDutyCycle(samples, RATE_WINDOWS_MS, atMs), cumulative: dutyFromTotals(totals) },
      totals: { ...totals },
      checkpointA: uptimeMs >= CHECKPOINT_A_UPTIME_MS ? { met: rate >= CHECKPOINT_A_BAR, rankPerHeldSec: rate, bar: CHECKPOINT_A_BAR } : null,
      checkpointB: uptimeMs >= CHECKPOINT_B_UPTIME_MS ? { met: rate >= CHECKPOINT_B_BAR, rankPerHeldSec: rate, bar: CHECKPOINT_B_BAR } : null,
    };
  };

  ns.atExit(() => {
    try {
      ns.bladeburner.stopBladeburnerAction();
    } catch {
      // best-effort hygiene, per review S1 -- decision 5's staleness guard is the real backstop
    }
    releaseSlotHold(ns);
  });

  while (true) {
    const tickStartMs = Date.now();
    await ns.bladeburner.nextUpdate();
    const nowMs = Date.now();
    const uptimeSec = Math.max(0, (nowMs - tickStartMs) / 1000);

    const offMarker = ns.fileExists(BB_OFF_MARKER, "home");
    if (offMarker !== previousOffMarker && previousOffMarker !== null) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: offMarker ? "off-marker-on" : "off-marker-off" });
    }
    previousOffMarker = offMarker;

    if (offMarker) {
      try {
        ns.bladeburner.stopBladeburnerAction();
      } catch {
        /* idle */
      }
      releaseSlotHold(ns);
      holdActive = false;
      currentAction = null;
      recordSample({ timestamp: nowMs, heldSec: 0, uptimeSec, rankDelta: 0, kind: "unheld" });

      if (nowMs - lastStateWrite >= 60_000) {
        const rank = ns.bladeburner.getRank();
        ns.write(
          BB_STATE_FILE,
          JSON.stringify(
            buildBbState({
              now: nowMs,
              off: true,
              holdActive: false,
              holdReason: "off-marker",
              standDownFor: null,
              rank,
              skillPoints: ns.bladeburner.getSkillPoints(),
              skillLevels: {},
              cityName: null,
              chaosByCity: {},
              teamSize: null,
              hpFraction: null,
              ...buildRateBlock(nowMs),
              repForegone: repForegoneTotal,
              hospitalizations: hospitalizationsSeen,
            }),
            null,
            2,
          ),
          "w",
        );
        lastStateWrite = nowMs;
      }
      ns.write(BB_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");
      continue;
    }

    const processList = ns.ps("home");
    let standDownFor = higherPriorityClaimant(processList);
    // Decision 3 amendment (2026-08-01, extended to backdoorwd.js same day):
    // backdoorfactions.js/backdoorwd.js only actually need the slot for
    // their brief installBackdoor() windows, not their whole (potentially
    // climb-long) residency -- see classifyBackdoorActivity's doc comment.
    // studybootstrap.js keeps the original presence-only rule (one-shot,
    // never resident, so it never benefits from this anyway).
    const activityFile = BACKDOOR_ACTIVITY_FILES[standDownFor];
    if (activityFile) {
      const activity = readJsonState(ns, activityFile);
      if (classifyBackdoorActivity(activity, nowMs) === "idle") standDownFor = null;
    }
    if (standDownFor !== previousStandDownFor) {
      logEntries = appendBbLog(logEntries, { ...ts(), kind: standDownFor ? "stand-down" : "stand-down-clear", claimant: standDownFor });
    }
    previousStandDownFor = standDownFor;

    if (standDownFor) {
      try {
        ns.bladeburner.stopBladeburnerAction();
      } catch {
        /* idle */
      }
      releaseSlotHold(ns);
      holdActive = false;
      currentAction = null;
      recordSample({ timestamp: nowMs, heldSec: 0, uptimeSec, rankDelta: 0, kind: "unheld" });

      // Mirrors the off-marker branch above -- without this, a long stand-down
      // (the common case so far: backdoorfactions.js) left bladeburner-state.json
      // never written at all, so nothing external could see the engine was alive
      // and why. Confirmed live 2026-08-01 by the Phase 38 adversarial review.
      if (nowMs - lastStateWrite >= 60_000) {
        const rank = ns.bladeburner.getRank();
        ns.write(
          BB_STATE_FILE,
          JSON.stringify(
            buildBbState({
              now: nowMs,
              off: false,
              holdActive: false,
              holdReason: "stand-down",
              standDownFor,
              rank,
              skillPoints: ns.bladeburner.getSkillPoints(),
              skillLevels: {},
              cityName: null,
              chaosByCity: {},
              teamSize: null,
              hpFraction: null,
              ...buildRateBlock(nowMs),
              repForegone: repForegoneTotal,
              hospitalizations: hospitalizationsSeen,
            }),
            null,
            2,
          ),
          "w",
        );
        lastStateWrite = nowMs;
      }
      ns.write(BB_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");
      continue;
    }

    // Window classification (decision 6) -- read augfarmer's state read-only.
    const augState = readJsonState(ns, AUG_STATE_FILE);
    const windowKind = classifyWindow(augState, nowMs);

    const rankNow = ns.bladeburner.getRank();
    const rankDelta = rankNow - previousRank;
    previousRank = rankNow;

    const player = ns.getPlayer();
    const hpFraction = player.hp.max > 0 ? player.hp.current / player.hp.max : 1;
    // Visibility only (2026-08-01) -- no action reacts to this yet. The one prior data point
    // ("0% Stamina Penalty") came from the 75min 7/30 trial, not a multi-hour continuous-fire
    // run; this closes the blind spot instrumentally instead of continuing to assume it holds.
    const [staminaCur, staminaMax] = ns.bladeburner.getStamina();
    const staminaFraction = staminaMax > 0 ? staminaCur / staminaMax : 1;

    // 🔴 2026-08-02: this was "visibility only -- no action reacts to this yet",
    // and the cost of that was measured, not theorised. Live panel read:
    // `Stamina Penalty: 89.5%` at 5.2% stamina, with the game log showing
    // "Your Bladeburner action was cancelled because your stamina hit 0" twice in
    // one hour and a steady run of "Investigation failed! Lost 0.343 rank."
    // Cumulative rank over that window was NEGATIVE (-1.90 rank in 198 held sec).
    // A 24h checkpoint measured through this would have reported a negative rate
    // and read as a viability verdict on the mechanic rather than on the bug.
    staminaRecovering = updateStaminaRecovering(staminaRecovering, staminaFraction);
    hpRecovering = updateHpRecovering(hpRecovering, hpFraction);

    let chosenAction = null;
    let earnsRank = false;
    if (windowKind === "contested" && !staminaRecovering) {
      const candidates = buildCandidates(ns);
      const picked = pickRankAction(candidates, { hpFraction, hpCurrent: player.hp.current, hpRecovering });
      if (picked) {
        chosenAction = { type: picked.type, name: picked.name };
        earnsRank = true;
        // 2026-08-01: setTeamSize was never called anywhere -- Recruitment building an
        // "available" pool (getTeamSize() with no args) never actually reached an Operation,
        // which needs its own explicit assignment (getTeamSize(type,name) is a SEPARATE,
        // per-action count per the API remarks). TEAM_SIZE_TARGET existed as a real constant
        // gating a Recruitment decision whose entire product was silently discarded.
        if (picked.type === "Operations") {
          const availableTeam = ns.bladeburner.getTeamSize();
          if (availableTeam > 0) ns.bladeburner.setTeamSize(picked.type, picked.name, availableTeam);
        }
      }
    }
    // Reached by a free window OR by a contested window with nothing viable left
    // to run. The contested fallback used to hardcode Hyperbolic Regeneration
    // Chamber, which pays no rank AND cannot regenerate contract/operation
    // inventory -- so once `buildCandidates` came back empty (it filters on
    // getActionCountRemaining < 1) the engine sat in HRC forever with no path
    // back. That is the permanent stall pickOverheadAction's own comment warns
    // about, and the `Incite Violence` fix added for it only ever ran in the free
    // branch -- which live duty-cycle data on 2026-08-02 showed had not been
    // entered ONCE in 2h47m of uptime. Routing both cases through
    // pickOverheadAction closes it: the same ladder that regenerates inventory
    // also suppresses chaos and grows the team, all strictly better than idling.
    if (!chosenAction) {
      const cityName = ns.bladeburner.getCity();
      const chaos = ns.bladeburner.getCityChaos(cityName);
      const teamSize = ns.bladeburner.getTeamSize();
      const lowInventory = isInventoryLow(getInventoryCounts(ns));
      chosenAction = pickOverheadAction(hpRecovering ? 0 : hpFraction, chaos, teamSize, lowInventory, staminaRecovering);
    }

    // Marker write BEFORE startAction (load-bearing ordering, marker contract).
    writeSlotHold(ns);
    lastMarkerWriteMs = nowMs;
    holdActive = true;

    // startAction auto-repeats (reference S6/S7 gotcha 13), so this must NOT fire
    // every tick -- restarting a running action would reset its progress and
    // nothing would ever complete. The original guard compared the chosen action
    // against `currentAction`, i.e. intent against intent, and reasoned that "there
    // is no completion boundary this loop needs to detect."
    //
    // 🔴 That reasoning was wrong, and cost the whole first grind window
    // (2026-08-02): the GAME can cancel a running action out from under the engine.
    // Live evidence -- the in-game log shows "Your Bladeburner action was cancelled
    // because your stamina hit 0" twice in an hour, and `getCurrentAction()` probed
    // `null` at a moment when `bladeburner-state.json` claimed `holdActive: true`,
    // `dutyCycle: 1`. The engine sat idle, never restarted (its intent hadn't
    // changed, so the guard stayed shut), and went on billing the time as held AND
    // rank-earning. That is the single largest error in the measurement.
    //
    // Fixed by asking the GAME, not our own intent. Deliberately an idle check
    // rather than an equality check on the live action: `getCurrentAction()` returns
    // plain strings whose exact values for the `type` field are undocumented
    // (reference gotcha 10), so comparing them could silently never match and
    // restart every tick -- strictly worse than the bug being fixed. `null`-when-idle
    // IS documented, and is confirmed live. 1 GB.
    const liveAction = ns.bladeburner.getCurrentAction();
    const idle = !liveAction || !liveAction.name;
    // On a failed start (opaque boolean, undocumented cause), `currentAction` is left
    // null so the next tick retries rather than assuming an action that never started.
    if (idle || !currentAction || currentAction.type !== chosenAction.type || currentAction.name !== chosenAction.name) {
      const started = ns.bladeburner.startAction(chosenAction.type, chosenAction.name);
      currentAction = started ? chosenAction : null;
      if (idle && !started) logEntries = appendBbLog(logEntries, { ...ts(), kind: "restart-failed", action: chosenAction, staminaFraction, hpFraction });
    }

    // Refresh the marker independently of action progress (decision 4) --
    // a long action (Recruitment, 291s) must not let the marker go stale
    // mid-action, so this is time-gated on BB_POLL_MS, not on completion.
    if (nowMs - lastMarkerWriteMs >= BB_POLL_MS) {
      writeSlotHold(ns);
      lastMarkerWriteMs = nowMs;
    }

    // Skill buy (best-effort, one per tick per planSkillBuy's contract).
    const skillLevels = {};
    const skillCosts = {};
    for (const skill of SKILL_BUY_ORDER) {
      skillLevels[skill] = ns.bladeburner.getSkillLevel(skill);
      skillCosts[skill] = ns.bladeburner.getSkillUpgradeCost(skill, 1);
    }
    const points = ns.bladeburner.getSkillPoints();
    const buy = planSkillBuy(skillLevels, points, skillCosts);
    if (buy) {
      const ok = ns.bladeburner.upgradeSkill(buy.skill);
      if (ok) {
        logEntries = appendBbLog(logEntries, { ...ts(), kind: "skill-buy", skill: buy.skill, toLevel: buy.toLevel, cost: buy.cost, costs: { ...skillCosts } });
      }
    }

    // repForegone accrual (decision 2's audit trail, open question 5's estimate).
    const dtSec = (nowMs - previousAugStateReadMs) / 1000;
    const rate = estimateRepRatePerSec(previousAugState, augState, dtSec);
    if (windowKind === "contested" && rate !== null) {
      contestedHeldSecTotal += uptimeSec;
      repForegoneTotal += computeRepForegone(uptimeSec, rate);
    }
    previousAugState = augState;
    previousAugStateReadMs = nowMs;

    // `kind` follows the chosen ACTION, not the window (computeDutyCycle's doc
    // comment): a contested window that fell through to a zero-rank General
    // action is overhead, and tagging it "contested" made a stall read as 100%
    // productive duty.
    recordSample({ timestamp: nowMs, heldSec: uptimeSec, uptimeSec, rankDelta, kind: earnsRank ? "contested" : "free" });

    if (nowMs - lastStateWrite >= 10_000) {
      const rateBlock = buildRateBlock(nowMs);
      const cityName = ns.bladeburner.getCity();
      const chaosByCity = { [cityName]: ns.bladeburner.getCityChaos(cityName) };
      ns.write(
        BB_STATE_FILE,
        JSON.stringify(
          buildBbState({
            now: nowMs,
            off: false,
            holdActive,
            holdReason: "held",
            standDownFor: null,
            rank: rankNow,
            skillPoints: points,
            skillLevels,
            cityName,
            chaosByCity,
            teamSize: ns.bladeburner.getTeamSize(),
            hpFraction,
            stamina: { current: staminaCur, max: staminaMax, fraction: staminaFraction, recovering: staminaRecovering, floor: STAMINA_FLOOR_FRACTION, resume: STAMINA_RESUME_FRACTION },
            ...rateBlock,
            repForegone: repForegoneTotal,
            hospitalizations: hospitalizationsSeen,
          }),
          null,
          2,
        ),
        "w",
      );

      // Phase 38's actual deliverable. bladeburner-state.json is rewritten every
      // 10s, so a checkpoint verdict that only ever lived there would be a value
      // nobody was watching at the moment it appeared; the log is append-only and
      // survives restarts, so the verdict is recoverable after the fact.
      if (rateBlock.checkpointA && !checkpointALogged) {
        logEntries = appendBbLog(logEntries, { ...ts(), kind: "checkpoint-A", ...rateBlock.checkpointA, totals: { ...totals } });
        checkpointALogged = true;
      }
      if (rateBlock.checkpointB && !checkpointBLogged) {
        logEntries = appendBbLog(logEntries, { ...ts(), kind: "checkpoint-B", ...rateBlock.checkpointB, totals: { ...totals } });
        checkpointBLogged = true;
      }

      ns.write(BB_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");
      lastStateWrite = nowMs;

      ns.clearLog();
      ns.print(`===== bladeburner @ ${new Date(nowMs).toLocaleTimeString()} =====`);
      ns.print(`rank ${rankNow.toFixed(1)} | action ${chosenAction.name} (${windowKind}${earnsRank ? "" : ", overhead"}) | SP ${points}`);
      ns.print(`rankPerHeldSec (cumulative) ${rateBlock.rates.cumulative.rankPerHeldSec.toFixed(5)} | dutyCycle ${rateBlock.duty.cumulative.dutyCycle.toFixed(2)}`);
      ns.print(`uptime ${(totals.uptimeSec / 3600).toFixed(2)}h (24h checkpoint at ${(CHECKPOINT_A_UPTIME_MS / 3600_000).toFixed(0)}h) | restarts ${totals.restarts}`);
      ns.print(`stamina ${(staminaFraction * 100).toFixed(1)}%${staminaRecovering ? " RECOVERING" : ""} | hp ${(hpFraction * 100).toFixed(0)}%`);
    }
  }
}
