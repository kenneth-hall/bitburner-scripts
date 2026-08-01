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
export const HOSPITALIZATION_COST_ESTIMATE = 10_400_000; // seeded from the 7/30 trial's $229.5m / 22 failures
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

export const RATE_WINDOWS_MS = { "1h": 3_600_000, "24h": 86_400_000, cumulative: Infinity };

// Decision 3: the three scripts that outrank this engine for the player-action slot.
export const HIGHER_PRIORITY_CLAIMANTS = ["backdoorwd.js", "backdoorfactions.js", "studybootstrap.js"];

// WI2's skill table: Overclock -> Blade's Intuition -> Digital Observer/Tracer
// -> Reaper/Evasive System. Never Hands of Midas/Hyperdrive/Cyber's Edge/
// Datamancer -- and Cloak/Short-Circuit are excluded too, simply by never
// appearing in this order (planSkillBuy only ever considers listed skills).
export const SKILL_BUY_ORDER = ["Overclock", "Blade's Intuition", "Digital Observer", "Tracer", "Reaper", "Evasive System"];
export const SKILL_LEVEL_CAP = { Overclock: 90 }; // documented max -- beyond it, no more throughput

// Free-window overhead actions (decision 6) and their policy knobs. Not a
// spec-mandated formula -- a defensible, logged default: keep HP topped
// first, suppress chaos before it costs future success chance, else grow
// the team (Operations/BlackOps only benefit), else just top HP again.
export const CHAOS_DIPLOMACY_THRESHOLD = 1.0;
export const TEAM_SIZE_TARGET = 6;
export const CITY_ROTATE_CHAOS_THRESHOLD = 2.0; // shouldRotateCity's default -- open question 1: switchCity cost/interruption unmeasured

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
 * priced failure cost, with a hard HP guard: below `hpFloorFraction` of max
 * HP, any candidate that risks HP on failure is dropped from consideration
 * entirely (Investigation is exempt via `risksHp: false`). Returns `null`
 * when nothing is left to pick -- the caller runs recovery overhead instead
 * (Hyperbolic Regeneration Chamber isn't a rank candidate, so it never
 * appears in `candidates`).
 * @param {{type:string, name:string, pMin:number, rankGain:number, rankLoss:number, timeMs:number, risksHp:boolean}[]} candidates
 * @param {{hpFraction:number, hpFloorFraction?:number, hospitalizationCostEstimate?:number, rankMoneyExchange?:number}} opts
 */
export function pickRankAction(candidates, opts) {
  const { hpFraction, hpFloorFraction = HP_FLOOR_FRACTION, hospitalizationCostEstimate = HOSPITALIZATION_COST_ESTIMATE, rankMoneyExchange = RANK_MONEY_EXCHANGE } = opts;

  const hpLow = hpFraction < hpFloorFraction;
  const pool = hpLow ? candidates.filter((c) => !c.risksHp) : candidates;
  if (pool.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    const ev = expectedRankPerSec(c);
    const actionSeconds = c.timeMs / 1000;
    const discount = c.risksHp && actionSeconds > 0 ? ((1 - c.pMin) * hospitalizationCostEstimate) / actionSeconds / rankMoneyExchange : 0;
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
 * Pure. Per named window, the three-way split of engine uptime: `rankSec`
 * (contested-window held time), `overheadSec` (free-window held time,
 * zero-rank), `unheldSec` (stood down -- off-marker or a higher-priority
 * claimant). `dutyCycle` is the held fraction of total uptime.
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
export function buildBbState({ now, off, holdActive, holdReason, standDownFor, rank, skillPoints, skillLevels, cityName, chaosByCity, teamSize, hpFraction, rates, duty, repForegone, hospitalizations, checkpointA, checkpointB }) {
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
    rates,
    duty,
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

/** Free-window overhead choice (decision 6). Not a spec-mandated formula -- see CHAOS_DIPLOMACY_THRESHOLD's declaration. */
function pickOverheadAction(hpFraction, cityChaos, teamSize) {
  if (hpFraction < HP_FLOOR_FRACTION) return { type: "General", name: "Hyperbolic Regeneration Chamber" };
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

  let samples = []; // {timestamp, heldSec, uptimeSec, rankDelta, kind}
  let logEntries = seedBbLog(ns.read(BB_LOG_FILE));
  logEntries = appendBbLog(logEntries, { ...ts(), kind: "startup" });

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
      samples.push({ timestamp: nowMs, heldSec: 0, uptimeSec, rankDelta: 0, kind: "unheld" });
      if (samples.length > 10_000) samples = samples.slice(samples.length - 10_000);

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
              rates: computeRealizedRates(samples, RATE_WINDOWS_MS, nowMs),
              duty: computeDutyCycle(samples, RATE_WINDOWS_MS, nowMs),
              repForegone: repForegoneTotal,
              hospitalizations: hospitalizationsSeen,
              checkpointA: null,
              checkpointB: null,
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
      samples.push({ timestamp: nowMs, heldSec: 0, uptimeSec, rankDelta: 0, kind: "unheld" });
      if (samples.length > 10_000) samples = samples.slice(samples.length - 10_000);

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
              rates: computeRealizedRates(samples, RATE_WINDOWS_MS, nowMs),
              duty: computeDutyCycle(samples, RATE_WINDOWS_MS, nowMs),
              repForegone: repForegoneTotal,
              hospitalizations: hospitalizationsSeen,
              checkpointA: null,
              checkpointB: null,
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

    let chosenAction = null;
    if (windowKind === "contested") {
      const candidates = buildCandidates(ns);
      const picked = pickRankAction(candidates, { hpFraction });
      chosenAction = picked ? { type: picked.type, name: picked.name } : { type: "General", name: "Hyperbolic Regeneration Chamber" };
    } else {
      const cityName = ns.bladeburner.getCity();
      const chaos = ns.bladeburner.getCityChaos(cityName);
      const teamSize = ns.bladeburner.getTeamSize();
      chosenAction = pickOverheadAction(hpFraction, chaos, teamSize);
    }

    // Marker write BEFORE startAction (load-bearing ordering, marker contract).
    writeSlotHold(ns);
    lastMarkerWriteMs = nowMs;
    holdActive = true;

    // startAction auto-repeats (reference S6/S7 gotcha 13) -- only called
    // when the chosen action changes, not every tick. This sidesteps needing
    // getActionCurrentTime() wrap-detection entirely: nothing here reacts to
    // an individual rep completing, only to the *choice* changing (a window
    // flip, an HP-guard trip, or a re-ranked EV), so there is no completion
    // boundary this loop needs to detect. On a failed start (opaque boolean,
    // undocumented cause), `currentAction` is left null so the next tick
    // retries rather than assuming an action is running that never started.
    if (!currentAction || currentAction.type !== chosenAction.type || currentAction.name !== chosenAction.name) {
      const started = ns.bladeburner.startAction(chosenAction.type, chosenAction.name);
      currentAction = started ? chosenAction : null;
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

    samples.push({ timestamp: nowMs, heldSec: uptimeSec, uptimeSec, rankDelta, kind: windowKind === "contested" ? "contested" : "free" });
    if (samples.length > 10_000) samples = samples.slice(samples.length - 10_000);

    if (nowMs - lastStateWrite >= 10_000) {
      const rates = computeRealizedRates(samples, RATE_WINDOWS_MS, nowMs);
      const duty = computeDutyCycle(samples, RATE_WINDOWS_MS, nowMs);
      const cumulativeRankPerHeldSec = rates.cumulative?.rankPerHeldSec ?? 0;
      const uptimeMs = samples.reduce((sum, s) => sum + (s.uptimeSec ?? 0) * 1000, 0);
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
            rates,
            duty,
            repForegone: repForegoneTotal,
            hospitalizations: hospitalizationsSeen,
            checkpointA: uptimeMs >= CHECKPOINT_A_UPTIME_MS ? { met: cumulativeRankPerHeldSec >= CHECKPOINT_A_BAR, rankPerHeldSec: cumulativeRankPerHeldSec, bar: CHECKPOINT_A_BAR } : null,
            checkpointB: uptimeMs >= CHECKPOINT_B_UPTIME_MS ? { met: cumulativeRankPerHeldSec >= CHECKPOINT_B_BAR, rankPerHeldSec: cumulativeRankPerHeldSec, bar: CHECKPOINT_B_BAR } : null,
          }),
          null,
          2,
        ),
        "w",
      );
      ns.write(BB_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");
      lastStateWrite = nowMs;

      ns.clearLog();
      ns.print(`===== bladeburner @ ${new Date(nowMs).toLocaleTimeString()} =====`);
      ns.print(`rank ${rankNow.toFixed(1)} | action ${chosenAction.name} (${windowKind}) | SP ${points}`);
      ns.print(`rankPerHeldSec (cumulative) ${cumulativeRankPerHeldSec.toFixed(5)} | dutyCycle ${(duty.cumulative?.dutyCycle ?? 0).toFixed(2)}`);
    }
  }
}
