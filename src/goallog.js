/**
 * Phase 32 -- durable BN2.1 progress sampler ("is the node progressing?").
 *
 * The loud metrics (gang respect, faction rep) are solved subgoals -- the
 * metric that actually gates the win is the installed hacking multiplier
 * `M` climbing toward the w0r1d_d43m0n gate, and it had no standing readout.
 * This resident samples that (plus a smoothed income rate and the
 * $-to-next-aug/awaiting-money timer) into a durable series + a small
 * snapshot dashboard.js can render for zero added ns RAM.
 *
 * Mirrors gangratelog.js's shape exactly: a resident that consumes state
 * other companions already write (augfarmer-state.json) plus two base-API
 * reads of its own (getMoneySources, getPlayer), ring-caps a series, and
 * publishes an overwrite-in-place snapshot. Daemon-supervised
 * (RESIDENT_COMPANIONS) so both files survive restarts/installs.
 *
 * Separate file from gangratelog.js (not merged): different cadence (60s vs
 * 5min), different inputs (real ns.getPlayer/getMoneySources RAM vs a free
 * gang-state.json re-read), and a different lifecycle question. One-file-
 * one-job; only the ring-append helper is shared (imported below -- safe
 * because gangratelog.js's entire ns surface is 0 GB, so importing it can't
 * bleed real RAM in per CLAUDE.md's import-bleed rule).
 *
 * -> logs/goal-log.json    (ring-capped cumulative series, newest last)
 * -> logs/goal-state.json  (overwrite-in-place snapshot, dashboard.js's GOAL panel)
 */

import { appendCapped } from "./gangratelog.js";

export const SERIES_FILE = "goal-log.json";
export const SNAPSHOT_FILE = "goal-state.json";
export const AUGFARMER_STATE_FILE = "augfarmer-state.json"; // hardcoded, not imported -- see dashboard.js's own precedent for why a reader shouldn't import a heavy companion module for a filename string
// Phase 35 WI6: same hardcoded-filename precedent -- daemon.js/resourcemanager.js's
// own state files, read tolerantly, no import (keeps this script's ns surface
// exactly what it was: getMoneySources + getPlayer + ns.read/ns.write).
export const DAEMON_STATUS_FILE = "daemon-status.json";
export const FINANCE_STATE_FILE = "finance-state.json";
export const BOUNDARY_START_FILE = "boundary-start.json"; // bootstrap.js's per-boundary marker (Phase 35 WI1)

export const SAMPLE_INTERVAL_MS = 60_000; // 1 min -> RING_CAP below is 48h of history
export const RING_CAP = 2880; // 2880 * 1min = 48h; oldest samples drop off the front
export const RATE_WINDOW_MS = 600_000; // 10 min: flattens batch-landing noise, short enough to read as "now"
export const TREND_UP_RATIO = 1.05;
export const TREND_DOWN_RATIO = 0.95;

// Phase 35 WI3 (D5/D6): 24h trailing income window -- resourcemanager.js's
// opener-eligibility signal (D11's rule is measured against this, not
// RATE_WINDOW_MS's 10 min, so the post-install $0 stretch can't zero the
// estimator -- F1's flaw fix). The ring holds 48h, ample for a 24h window.
export const INCOME_WINDOW_24H_MS = 24 * 60 * 60 * 1000;

// Phase 35 WI6 (D6/D12): the liveness verdict's own constants.
export const STUCK_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h -- also WARMING's minimum series span
export const STUCK_INCOME_FLOOR = 1; // $1/s
export const BOUNDARY_GRACE_MS = 4 * 60 * 60 * 1000; // 4h -- a boundary window is EXPECTED to look dead
export const DAEMON_STATUS_STALE_MS = 10 * 60 * 1000; // 10 min -- past this, daemon-status.json itself is the dead signal (genuine daemon death, not the export bridge -- goallog runs in-game reading in-game files)
// Mirrors daemon.js's own BOUNDARY_WINDOW_MS -- duplicated, not imported
// (daemon.js's ns surface is far too heavy for this Singularity-free
// resident to pull in for one constant).
const BOUNDARY_WINDOW_MS = 16 * 60 * 60 * 1000;

// BN6.1 target (retargeted 2026-07-29, entering BN6 off the BN5.1 clear).
//
// ⚠️ READ THIS BEFORE TRUSTING THE NUMBER: in BN6, M IS NOT THE WIN CONDITION.
// BN6 is cleared by completing the final Bladeburner black op (Operation
// Daedalus) -- a *rank* ladder, and rank is bought with actions, not money
// (decision + arithmetic in docs/bn6-playbook.md). So unlike BN2/BN5, this
// target is NOT the finish line. It is the *fallback* hacking path's gate,
// kept for two reasons that are still genuinely useful:
//   1. M remains the honest proxy for "is the aug ratchet converting money into
//      progress at all" -- which is what evalTripwire below actually tests, and
//      that test is valid regardless of which win path we take.
//   2. If the black-op ladder turns out to be infeasible (playbook §5's first
//      open question, resolved cheaply at Stage 2), this becomes the real gate
//      again with no code change.
// The label is "fallback", not "gate", so the dashboard cannot misread it as the
// plan. `forecast.daysToGate` likewise projects the fallback path -- a real
// number for a path we do not currently intend to walk.
//
// The fallback arithmetic: gate = 6,000 (Difficulty 200% x 3,000 base -- the
// linearity was confirmed live at BN2's 500% -> 15,000). BN6's hacking-level
// multiplier is 0.35, so the curve carries that haircut:
//     level = 0.35 * M * (32*ln(exp + 534.6) - 200)
// Inverting for level 6,000:
//   exp  1.0B -> M 37.0    5.0B -> M 33.3   13.9B -> M 31.3
//   exp 50.0B -> M 29.1  100.0B -> M 28.1
// (Formula validated against the BN2.1 clear: predicts level 15,020 at M=34.3 /
// 13.9B exp; the actual reading was 15,019.) 13.9B is what BN2 actually banked,
// and BN6 nerfs exp gain to 0.25 -- 2x worse than BN5, 4x worse than BN1/BN2 --
// so a bigger stack is expensive here. M=30 is the honest middle of that curve.
// Note the fallback path ALSO needs 35 augs for the Daedalus invite (live-read
// DaedalusAugsRequirement: 35, up from the usual 30), which this target does
// not capture.
export const M_TARGET = 30;
export const M_TARGET_LABEL = "fallback";
// Overshoot/comfort target. Equal to M_TARGET while undecided, which suppresses
// the dashboard's separate gate line (it only renders when gateTarget > target).
export const M_GATE_TARGET = 30;

// GP2 tripwire (BN2.1 goalposts): M only ever climbs (installs), so "M has not
// increased across the last FLAT_WINDOW" == the ratchet is stuck (no install /
// income stalled). 12h matches the goalpost table; require ~11h of history
// before asserting so a fresh series reads "warming up", not a false stall.
export const FLAT_WINDOW_MS = 43_200_000; // 12h
export const TRIPWIRE_MIN_SPAN_MS = 39_600_000; // 11h

/**
 * Pure. GP2 tripwire from the persistent M series: STALLED when we have
 * >=TRIPWIRE_MIN_SPAN_MS of history and M hasn't grown across the last
 * FLAT_WINDOW_MS; WARMING when there isn't enough history yet; else ON TRACK.
 * M is monotonic within a node, so a strict increase is all "on track" needs.
 * @param {{t:number, mHacking:number}[]} series
 */
export function evalTripwire(series, nowMs) {
  const list = (Array.isArray(series) ? series : []).filter(
    (s) => s && typeof s.t === "number" && typeof s.mHacking === "number"
  );
  if (list.length === 0) return { status: "UNKNOWN", flatHours: null };
  const last = list[list.length - 1];
  const windowStart = nowMs - FLAT_WINDOW_MS;
  const ref = list.find((s) => s.t >= windowStart) ?? list[0];
  const spanMs = last.t - ref.t;
  const flatHours = Math.round((spanMs / 3_600_000) * 10) / 10;
  if (spanMs < TRIPWIRE_MIN_SPAN_MS) return { status: "WARMING", flatHours };
  if (last.mHacking > ref.mHacking) return { status: "ON TRACK", flatHours };
  return { status: "STALLED", flatHours };
}

/**
 * Pure. $/sec over [fromMs, toMs] for `field` ("gangCum" | "hackingCum" |
 * "total"), or null when there are fewer than two samples in range, the
 * span is non-positive, or the selected field decreased across the range
 * (a stale/corrupt read, not a real income loss -- cumulative sources only
 * go down at node entry, which the sampler's own reset guard already
 * clears the series for).
 */
export function computeRateRange(series, fromMs, toMs, field) {
  const list = Array.isArray(series) ? series : [];
  const inRange = list.filter((s) => s && typeof s.t === "number" && s.t >= fromMs && s.t <= toMs);
  if (inRange.length < 2) return null;

  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  const spanMs = last.t - first.t;
  if (!(spanMs > 0)) return null;

  const valueOf = (s) => (field === "total" ? (s.gangCum ?? 0) + (s.hackingCum ?? 0) : (s[field] ?? 0));
  const delta = valueOf(last) - valueOf(first);
  if (delta < 0) return null;

  return delta / (spanMs / 1000);
}

/**
 * Pure (Phase 35 WI6/D6/D12). Liveness verdict beside GP2's tripwire --
 * GP2 answers "is M progressing over 12h"; this answers "is the engine
 * ALIVE right now" (a stall a session might not read for hours -- the
 * 21.7h-unread-STALLED incident this exists to shrink time-to-diagnosis
 * for). Rules, in order, FIRST MATCH WINS:
 *
 *  1. series span < STUCK_WINDOW_MS -> WARMING (mirrors GP2's warming
 *     stance -- a fresh node isn't judged).
 *  2. boundaryStartMs present (null/absent skips this rule entirely -- the
 *     marker doesn't exist until the first post-deploy boundary) and
 *     nowMs - boundaryStartMs < BOUNDARY_GRACE_MS -> BOUNDARY (a boundary
 *     window is EXPECTED to look dead; alerting inside it is noise).
 *  3. daemonStatus null or its timestamp > DAEMON_STATUS_STALE_MS old ->
 *     STUCK / "daemon-dead" (goallog runs in-game reading in-game files,
 *     so staleness here is genuine daemon death, not the export bridge).
 *  4. trailing-STUCK_WINDOW_MS income: a NULL return (sparse series, gap,
 *     reset) is "no measurement", never "below floor" -- `null < floor`
 *     coerces true in JS and would turn every series gap into a false
 *     alarm. A real number < STUCK_INCOME_FLOOR AND one of, checked in
 *     order: skipServers non-empty + low utilization -> "starved";
 *     available === 0 + an aged (> STUCK_WINDOW_MS) reservation ->
 *     "reservation-pin"; zero batches in flight + low utilization ->
 *     "idle" (catch-all dead). If boundaryStartMs is within
 *     BOUNDARY_WINDOW_MS but past grace, the reason is reported as
 *     "boundary-overrun" instead of the signature name -- a dead engine
 *     deep into a boundary is a TRUE alarm by this phase's own thesis, and
 *     naming it distinctly is what lets a soak review score verdicts
 *     (boundary-overrun during a boundary is expected/true; a
 *     signature-named STUCK outside one is either real or a tuning bug).
 *     Otherwise -> OK.
 *
 * Legit multi-hour prep windows don't fire: prep is grow/weaken holding
 * RAM, so utilizationPct is high and neither "starved" nor "idle" matches.
 *
 * @param {{series: object[], daemonStatus: object|null, financeState: object|null, boundaryStartMs: number|null, nowMs: number}} params
 */
export function evalStuck({ series, daemonStatus, financeState, boundaryStartMs, nowMs }) {
  const list = (Array.isArray(series) ? series : []).filter((s) => s && typeof s.t === "number");

  if (list.length === 0) return { status: "WARMING", reason: null };
  const span = list[list.length - 1].t - list[0].t;
  if (span < STUCK_WINDOW_MS) return { status: "WARMING", reason: null };

  const hasBoundary = typeof boundaryStartMs === "number";
  const boundaryElapsedMs = hasBoundary ? nowMs - boundaryStartMs : null;
  if (hasBoundary && boundaryElapsedMs >= 0 && boundaryElapsedMs < BOUNDARY_GRACE_MS) {
    return { status: "BOUNDARY", reason: null };
  }

  if (!daemonStatus || typeof daemonStatus.timestamp !== "number" || nowMs - daemonStatus.timestamp > DAEMON_STATUS_STALE_MS) {
    return { status: "STUCK", reason: "daemon-dead" };
  }

  const perSecRecent = computeRateRange(list, nowMs - STUCK_WINDOW_MS, nowMs, "total");
  if (perSecRecent === null) return { status: "OK", reason: null };

  if (perSecRecent < STUCK_INCOME_FLOOR) {
    const utilizationPct = daemonStatus.fleet?.utilizationPct ?? 0;
    const skipServers = Array.isArray(daemonStatus.warns?.skipServers) ? daemonStatus.warns.skipServers : [];
    const available = financeState?.available;
    const reservations = Array.isArray(financeState?.reservations) ? financeState.reservations : [];
    const batchesInFlight = Array.isArray(daemonStatus.members)
      ? daemonStatus.members.reduce((sum, m) => sum + (m?.batchesInFlight ?? 0), 0)
      : 0;

    let signature = null;
    if (skipServers.length > 0 && utilizationPct < 5) {
      signature = "starved";
    } else if (available === 0 && reservations.some((r) => typeof r.since === "number" && nowMs - r.since > STUCK_WINDOW_MS)) {
      signature = "reservation-pin";
    } else if (batchesInFlight === 0 && utilizationPct < 5) {
      signature = "idle";
    }

    if (signature) {
      const boundaryOverrun = hasBoundary && boundaryElapsedMs < BOUNDARY_WINDOW_MS; // past grace is already guaranteed here
      return { status: "STUCK", reason: boundaryOverrun ? "boundary-overrun" : signature };
    }
  }

  return { status: "OK", reason: null };
}

// Forecast: don't project off a sliver of history. M is a STEP function
// (it only moves at an install), so a short window straddling no install
// reads 0 and a short window straddling one reads absurdly high. 6h is the
// floor for the span to be worth extrapolating at all; the ring holds 48h,
// which is the practical basis.
export const FORECAST_MIN_SPAN_MS = 6 * 60 * 60 * 1000;

/**
 * Pure. The forecast the GOAL panel's `pct` could never give: at the rate M
 * has ACTUALLY moved across the retained series, how long until it reaches
 * M_TARGET?
 *
 * `pct` (mValue / M_TARGET) is arithmetically true and strategically
 * misleading -- it reads 15% while the money side is nowhere near 15% done,
 * because aug prices escalate. This answers the question the node is
 * actually asking, and it's deliberately MODEL-FREE on the primary number:
 * no aug-cost curve, no budget constant to rot. It measures dM/dt directly
 * and divides the remainder by it. Whatever the cost curve turns out to be,
 * it is already priced into the observed dM/dt.
 *
 * Statuses: WARMING (span < FORECAST_MIN_SPAN_MS -- a fresh series isn't
 * judged, mirroring evalTripwire/evalStuck's stance), REACHED (already at or
 * past target), STALLED (span is long enough and M did not move -- there is
 * no rate to extrapolate, so daysToGate is null, NOT Infinity: "no
 * measurement" and "infinitely far" are different claims and only the former
 * is true), OK.
 *
 * `dollarsPerMPoint` / `moneyRemaining` are a SECONDARY cross-check, and
 * they are a lower bound, not an estimate: they extrapolate the node's
 * observed $-per-M linearly, and the real curve escalates. Reported because
 * it's the number that connects the forecast to income -- but read it as
 * "at least this much", never "this much".
 *
 * @param {{t:number, mHacking:number, gangCum:number, hackingCum:number}[]} series
 */
export function computeForecast(series, nowMs) {
  const list = (Array.isArray(series) ? series : []).filter(
    (s) => s && typeof s.t === "number" && typeof s.mHacking === "number"
  );
  const empty = {
    status: "WARMING",
    basisHours: null,
    mPerDay: null,
    mRemaining: null,
    daysToGate: null,
    etaMs: null,
    dollarsPerMPoint: null,
    moneyRemaining: null,
  };
  if (list.length < 2) return empty;

  const first = list[0];
  const last = list[list.length - 1];
  const spanMs = last.t - first.t;
  if (!(spanMs > 0)) return empty;

  const basisHours = Math.round((spanMs / 3_600_000) * 10) / 10;
  const mRemaining = Math.max(0, M_TARGET - last.mHacking);

  if (spanMs < FORECAST_MIN_SPAN_MS) return { ...empty, basisHours, mRemaining };
  if (mRemaining === 0) {
    return { ...empty, status: "REACHED", basisHours, mRemaining: 0, daysToGate: 0, etaMs: 0 };
  }

  const dM = last.mHacking - first.mHacking;
  if (!(dM > 0)) {
    return { ...empty, status: "STALLED", basisHours, mRemaining };
  }

  const mPerDay = dM / (spanMs / 86_400_000);
  const daysToGate = mRemaining / mPerDay;

  // Secondary: observed $ spent per M-point over the same span. Uses the
  // same cumulative fields computeRateRange reads, so a corrupt/reset series
  // that decreased yields null rather than a negative cost.
  const totalOf = (s) => (s.gangCum ?? 0) + (s.hackingCum ?? 0);
  const dMoney = totalOf(last) - totalOf(first);
  const dollarsPerMPoint = dMoney > 0 ? dMoney / dM : null;
  const moneyRemaining = dollarsPerMPoint !== null ? dollarsPerMPoint * mRemaining : null;

  return {
    status: "OK",
    basisHours,
    mPerDay,
    mRemaining,
    daysToGate,
    etaMs: daysToGate * 86_400_000,
    dollarsPerMPoint,
    moneyRemaining,
  };
}

/**
 * Pure. Compares the latest `windowMs` window's total $/sec against the
 * PREVIOUS `windowMs` window's, relative (x1.05 up / x0.95 down) rather than
 * absolute so the thresholds don't need retuning as income scales over the
 * node. Null when either window lacks a computable rate.
 */
export function computeTrend(series, nowMs, windowMs) {
  const recent = computeRateRange(series, nowMs - windowMs, nowMs, "total");
  const prior = computeRateRange(series, nowMs - 2 * windowMs, nowMs - windowMs, "total");
  if (recent === null || prior === null) return null;

  if (recent > prior * TREND_UP_RATIO) return "UP";
  if (recent < prior * TREND_DOWN_RATIO) return "DOWN";
  return "FLAT";
}

/**
 * Pure. Builds the snapshot dashboard.js's GOAL panel reads. `augState` is
 * augfarmer-state.json's parsed contents (or null/undefined when
 * missing/unreadable) -- nextAug is null in that case, or when the state
 * has no target (plateau). `liveness` (Phase 35 WI6, additive/optional --
 * existing three-arg callers/tests are untouched) is the assembled
 * {status, reason, sinceMs, boundaryStartMs} block main() builds from
 * evalStuck's verdict.
 */
// augfarmer-state.json is written on change PLUS a 5-min heartbeat while
// augfarmer.js is alive, so a file older than this means the farmer is NOT
// running and its contents describe a past that may not even be this BitNode.
// Caught live 2026-07-29: on BN6.1 entry the GOAL panel reported
// nextAug "NeuroFlux Governor / Tian Di Hui / $8.5b, awaiting-money for 4.6h"
// -- every field left over from the BN5.1 install, because augfarmer needs
// 64.10 GB and a fresh node's home is 32 GB, so it had never run here at all.
// Stale-but-plausible is worse than absent: it invites planning against a
// target that does not exist. 15 min = 3 missed heartbeats.
export const AUG_STATE_STALE_MS = 15 * 60 * 1000;

export function buildSnapshot(series, augState, nowMs, liveness = null) {
  const list = Array.isArray(series) ? series : [];
  const latest = list.length > 0 ? list[list.length - 1] : null;

  const mValue = latest && typeof latest.mHacking === "number" ? latest.mHacking : null;
  const pct = mValue !== null ? Math.round((mValue / M_TARGET) * 100) : null;

  // Projected M if the augs already PURCHASED this cycle were installed now.
  // augfarmer publishes queuedGain (product of the queued-but-uninstalled augs'
  // hacking mults); installed M x that == post-install M. Purchased-only -- it
  // deliberately excludes the speculative NFG tail (that lives in
  // trigger.totalGain, not here). Both null when augState is absent or carries
  // no queued figures, so the dashboard just omits the projection line.
  const queuedGain = augState && typeof augState.queuedGain === "number" ? augState.queuedGain : null;
  const queuedCount = augState && typeof augState.queuedCount === "number" ? augState.queuedCount : null;
  const queuedValue = mValue !== null && queuedGain !== null ? mValue * queuedGain : null;
  const queuedPct = queuedValue !== null ? Math.round((queuedValue / M_TARGET) * 100) : null;

  const perSec = computeRateRange(list, nowMs - RATE_WINDOW_MS, nowMs, "total");
  const gangPerSec = computeRateRange(list, nowMs - RATE_WINDOW_MS, nowMs, "gangCum");
  const hackingPerSec = computeRateRange(list, nowMs - RATE_WINDOW_MS, nowMs, "hackingCum");
  const trend = computeTrend(list, nowMs, RATE_WINDOW_MS);
  // Phase 35 WI3: trailing-24h $/sec -- resourcemanager.js's opener
  // eligibility signal. Null (sparse series, node reset) means "no
  // measurement", same convention as `perSec`.
  const perSec24h = computeRateRange(list, nowMs - INCOME_WINDOW_24H_MS, nowMs, "total");

  // Suppress a stale farmer's target rather than reporting it as live. `stale`
  // is surfaced so the dashboard can say "not running" instead of silently
  // showing nothing (a missing file and a dead farmer are different problems).
  const augTs = augState && typeof augState.timestamp === "number" ? augState.timestamp : null;
  const augStateStale = augTs !== null && nowMs - augTs > AUG_STATE_STALE_MS;

  let nextAug = null;
  if (augState && augState.target && !augStateStale) {
    nextAug = {
      aug: augState.target.aug ?? null,
      faction: augState.target.faction ?? null,
      price: augState.target.livePrice ?? null,
      phase: augState.phase ?? null,
      awaitingSince: null,
      waitingMs: null,
    };
    if (augState.phase === "awaiting-money" && typeof augState.awaitingMoneySince === "number") {
      nextAug.awaitingSince = augState.awaitingMoneySince;
      nextAug.waitingMs = nowMs - augState.awaitingMoneySince;
    }
  }

  return {
    timestamp: nowMs,
    time: new Date(nowMs).toLocaleString(),
    mProgress: { value: mValue, target: M_TARGET, targetLabel: M_TARGET_LABEL, pct, gateTarget: M_GATE_TARGET, queuedValue, queuedPct, queuedCount },
    income: { perSec, trend, windowMs: RATE_WINDOW_MS, gangPerSec, hackingPerSec, perSec24h },
    forecast: computeForecast(list, nowMs),
    tripwire: evalTripwire(list, nowMs),
    liveness,
    nextAug,
    // true == augfarmer.js has missed >=3 heartbeats, so nextAug is deliberately
    // withheld. null when there is no state file at all (never ran / fresh node).
    augStateStale: augTs === null ? null : augStateStale,
  };
}

function readJsonTolerant(ns, file) {
  const raw = ns.read(file);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Phase 35 WI6: reads BOUNDARY_START_FILE's timestamp, or null if
 * missing/malformed/pre-Phase-35 (mirrors daemon.js's own reader). */
function readBoundaryMarker(ns) {
  const parsed = readJsonTolerant(ns, BOUNDARY_START_FILE);
  return typeof parsed?.timestamp === "number" ? parsed.timestamp : null;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // Phase 35 WI6: tracks the current liveness status's start time --
  // resets whenever evalStuck's verdict changes, so the GOAL panel's
  // elapsed figure ("STUCK 3.2h") measures time in THIS status, not time
  // since the resident booted.
  let stuckSince = null;
  let lastLivenessStatus = null;

  while (true) {
    let series = [];
    const rawSeries = ns.read(SERIES_FILE);
    if (rawSeries) {
      try {
        const parsed = JSON.parse(rawSeries);
        if (Array.isArray(parsed)) series = parsed;
      } catch {
        series = []; // corrupt log -> start fresh rather than crash the resident
      }
    }

    const nowMs = Date.now();
    // Bracket notation on "gang" deliberately -- ns.gang is a real ns
    // property, and this build's RAM analyzer misreads a literal `.gang`
    // property access as a reference to it regardless of receiver
    // (CLAUDE.md identifier-hygiene rule). `.hacking` dot access is proven
    // safe (transactionsmonitor.js, live at expected RAM).
    const sources = ns.getMoneySources().sinceStart;
    const gangCum = sources["gang"] ?? 0;
    const hackingCum = sources.hacking ?? 0;
    const player = ns.getPlayer();

    // Node-entry reset guard (decision 4): sinceStart survives installs
    // (probed live, moneysources.js) but resets at node entry -- if the new
    // cumulative total is below the last sample's, the series is a previous
    // node's junk and gets cleared before this sample is appended.
    const priorLast = series.length > 0 ? series[series.length - 1] : null;
    if (priorLast && gangCum + hackingCum < priorLast.gangCum + priorLast.hackingCum) {
      series = [];
    }

    series = appendCapped(series, { t: nowMs, gangCum, hackingCum, mHacking: player.mults.hacking }, RING_CAP);
    ns.write(SERIES_FILE, JSON.stringify(series), "w");

    // Phase 35 WI6: two extra file reads (ns.read, 0 GB) plus the boundary
    // marker -- the liveness verdict's inputs.
    const daemonStatus = readJsonTolerant(ns, DAEMON_STATUS_FILE);
    const financeState = readJsonTolerant(ns, FINANCE_STATE_FILE);
    const boundaryStartMs = readBoundaryMarker(ns);
    const verdict = evalStuck({ series, daemonStatus, financeState, boundaryStartMs, nowMs });
    if (verdict.status !== lastLivenessStatus) {
      stuckSince = nowMs;
      lastLivenessStatus = verdict.status;
    }
    const liveness = { status: verdict.status, reason: verdict.reason, sinceMs: stuckSince, boundaryStartMs };

    const augState = readJsonTolerant(ns, AUGFARMER_STATE_FILE);
    const snapshot = buildSnapshot(series, augState, nowMs, liveness);
    ns.write(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), "w");

    await ns.sleep(SAMPLE_INTERVAL_MS);
  }
}
