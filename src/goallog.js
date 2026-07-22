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

export const SAMPLE_INTERVAL_MS = 60_000; // 1 min -> RING_CAP below is 48h of history
export const RING_CAP = 2880; // 2880 * 1min = 48h; oldest samples drop off the front
export const RATE_WINDOW_MS = 600_000; // 10 min: flattens batch-landing noise, short enough to read as "now"
export const TREND_UP_RATIO = 1.05;
export const TREND_DOWN_RATIO = 0.95;

// Core NiteSec catalog floor (~$149b, all-but-QLink). Switching to the
// QLink-inclusive target (~29) is a visible two-constant edit + a Kenneth
// conversation at that milestone (Phase 32 OQ1), never silent.
export const M_TARGET = 16.7;
export const M_TARGET_LABEL = "core";
// Overshoot target (fable 2026-07-21): stopping at M≈29 leaves a 7–36-day
// terminal XP grind; M≈35–37 keeps it to hours. Display-only context.
export const M_GATE_TARGET = 36;

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
 * has no target (plateau).
 */
export function buildSnapshot(series, augState, nowMs) {
  const list = Array.isArray(series) ? series : [];
  const latest = list.length > 0 ? list[list.length - 1] : null;

  const mValue = latest && typeof latest.mHacking === "number" ? latest.mHacking : null;
  const pct = mValue !== null ? Math.round((mValue / M_TARGET) * 100) : null;

  const perSec = computeRateRange(list, nowMs - RATE_WINDOW_MS, nowMs, "total");
  const gangPerSec = computeRateRange(list, nowMs - RATE_WINDOW_MS, nowMs, "gangCum");
  const hackingPerSec = computeRateRange(list, nowMs - RATE_WINDOW_MS, nowMs, "hackingCum");
  const trend = computeTrend(list, nowMs, RATE_WINDOW_MS);

  let nextAug = null;
  if (augState && augState.target) {
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
    mProgress: { value: mValue, target: M_TARGET, targetLabel: M_TARGET_LABEL, pct, gateTarget: M_GATE_TARGET },
    income: { perSec, trend, windowMs: RATE_WINDOW_MS, gangPerSec, hackingPerSec },
    tripwire: evalTripwire(list, nowMs),
    nextAug,
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

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

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

    const augState = readJsonTolerant(ns, AUGFARMER_STATE_FILE);
    const snapshot = buildSnapshot(series, augState, nowMs);
    ns.write(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), "w");

    await ns.sleep(SAMPLE_INTERVAL_MS);
  }
}
