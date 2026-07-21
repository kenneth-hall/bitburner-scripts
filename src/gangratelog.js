/**
 * Phase 30 survivor -- durable respect-rate / ascension-mult series sampler.
 *
 * `gang-state.json` (gangmanager.js) is OVERWRITTEN every tick, so no history
 * of respectGainRate, wantedPenalty magnitude, or the aggregate hack ascension
 * multiplier survives -- yet those series are the required inputs to any Tier 4
 * rate/decay/cadence reasoning (see BACKLOG.md "Gang manager Tier 4" survivor).
 *
 * This is the cheapest clean form of that sampler: rather than paying the gang
 * API's RAM to re-read state a second time, it CONSUMES the file gangmanager
 * already writes. Pure ns.read + ns.write -> ~0 gang-API RAM, and zero coupling
 * to gangmanager.js (it never imports or calls into it).
 *
 * Resident, not one-shot: it appends one downsampled row per interval to a
 * ring-capped series file. Supervised by daemon.js (RESIDENT_COMPANIONS) so the
 * series persists across restarts and installs -- a snapshot answers nothing;
 * the accumulated series is the whole point.
 *
 * -> logs/gang-rate-log.json  (ring-capped array of samples, newest last)
 */

export const STATE_FILE = "gang-state.json"; // gangmanager.js's per-tick snapshot (input)
export const RATE_LOG_FILE = "gang-rate-log.json"; // our durable downsampled series (output)
export const SAMPLE_INTERVAL_MS = 5 * 60_000; // 5 min -> RING_CAP below is ~14 days of history
export const RING_CAP = 4032; // 4032 * 5min = 14 days; oldest samples drop off the front

/**
 * Pure. Distil a gang-state.json record into one compact series row.
 * Returns null when the state has no members yet (nothing meaningful to sample).
 * `nowMs` is the sampler's own wall clock; `stateAgeMs` exposes gangmanager
 * staleness (a stalled writer shows up as a growing age in the series, not as a
 * silently-frozen rate).
 */
export function summarizeSample(state, nowMs) {
  if (!state || !Array.isArray(state.members) || state.members.length === 0) return null;

  const ascMults = state.members
    .map((m) => (m && typeof m.hackAscMult === "number" ? m.hackAscMult : null))
    .filter((v) => v !== null);

  let ascMean = null;
  let ascMin = null;
  let ascMax = null;
  if (ascMults.length > 0) {
    ascMin = Math.min(...ascMults);
    ascMax = Math.max(...ascMults);
    ascMean = ascMults.reduce((a, b) => a + b, 0) / ascMults.length;
  }

  return {
    t: nowMs, // sampler wall clock (ms epoch)
    stateAgeMs: typeof state.timestamp === "number" ? nowMs - state.timestamp : null,
    respect: state.respect ?? null,
    respectGainRate: state.respectGainRate ?? null,
    moneyGainRate: state.moneyGainRate ?? null,
    wantedLevel: state.wantedLevel ?? null,
    wantedPenalty: state.wantedPenalty ?? null,
    netWantedRate: state.netWantedRate ?? null,
    territory: state.territory ?? null,
    memberCount: state.memberCount ?? state.members.length,
    // Aggregate hack ascension multiplier across members -- the decay signal a
    // player aug install erodes (hack x0.9747/install; see docs/gang-api.md).
    ascHackMean: ascMean,
    ascHackMin: ascMin,
    ascHackMax: ascMax,
  };
}

/** Pure. Append `sample` to `series`, ring-capping at `cap` (drop oldest). */
export function appendCapped(series, sample, cap) {
  const next = Array.isArray(series) ? series.slice() : [];
  next.push(sample);
  if (next.length > cap) next.splice(0, next.length - cap);
  return next;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  while (true) {
    let series = [];
    const rawLog = ns.read(RATE_LOG_FILE);
    if (rawLog) {
      try {
        const parsed = JSON.parse(rawLog);
        if (Array.isArray(parsed)) series = parsed;
      } catch {
        // Corrupt log -> start fresh rather than crash the resident.
        series = [];
      }
    }

    const rawState = ns.read(STATE_FILE);
    if (rawState) {
      try {
        const state = JSON.parse(rawState);
        const sample = summarizeSample(state, Date.now());
        if (sample) {
          series = appendCapped(series, sample, RING_CAP);
          ns.write(RATE_LOG_FILE, JSON.stringify(series), "w");
        }
      } catch {
        // gang-state.json mid-write or malformed -> skip this sample.
      }
    }

    await ns.sleep(SAMPLE_INTERVAL_MS);
  }
}
