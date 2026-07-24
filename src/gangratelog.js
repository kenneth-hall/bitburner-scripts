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
// Past this, gang-state.json is not "a stalled writer" -- it's a DEAD node's
// leftover file, and sampling it corrupts the series with frozen duplicates.
//
// Deliberately generous (6 sample intervals) to PRESERVE this file's original
// design intent: a stalled gangmanager is supposed to show up as a growing
// `stateAgeMs` in the series rather than a silently-frozen rate, so a genuine
// stall stays visible for half an hour before we stop recording it. The two
// cases are distinguishable only by duration -- a stall self-heals, a node
// change never does.
//
// Found live 2026-07-23: entering BN5 (no gang) left this resident replaying
// BN2's final gang state -- respect 77.8M / 12 members / $16.9M/s, frozen, with
// stateAgeMs climbing past 8,337,732 (2.3h) -- one bogus row every 5 min into a
// 14-day series. Resumes automatically the moment a real gangmanager writes
// again, so this needs no manual re-arming if a gang is ever created here.
export const MAX_STATE_AGE_MS = 30 * 60_000;

/**
 * Pure. Distil a gang-state.json record into one compact series row.
 * Returns null when the state has no members yet (nothing meaningful to sample),
 * or when it is staler than MAX_STATE_AGE_MS (no live gang -- see that constant).
 * `nowMs` is the sampler's own wall clock; `stateAgeMs` exposes gangmanager
 * staleness (a stalled writer shows up as a growing age in the series, not as a
 * silently-frozen rate) up to the staleness cutoff.
 */
export function summarizeSample(state, nowMs, maxStateAgeMs = MAX_STATE_AGE_MS) {
  if (!state || !Array.isArray(state.members) || state.members.length === 0) return null;

  // A state with no usable timestamp can't be aged, so it is sampled as before
  // rather than silently dropped -- unknown age is not evidence of a dead gang.
  const age = typeof state.timestamp === "number" ? nowMs - state.timestamp : null;
  if (age !== null && age > maxStateAgeMs) return null;

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
    stateAgeMs: age,
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

  // Self-exit when there is demonstrably no gang to sample (BN5's case).
  // Deliberately a FILE check, not ns.gang.inGang(): this script touches no
  // gang API at all, and the RAM analyzer bills an imported module's entire ns
  // surface, so reaching for the (nominally 0 GB) gang call risks importing
  // cost into the one gang-adjacent script that currently has none. A missing
  // or long-stale gang-state.json means gangmanager isn't writing, which is
  // exactly the condition this sampler has nothing to do in.
  //
  // Exiting rather than idling is why this is NOT in RESIDENT_COMPANIONS: the
  // supervisor would relaunch it on a 5-min loop forever. Absence is its
  // success state, same convention as procureprograms.js. daemon.js still
  // launches it at startup, so a node that HAS a gang starts it normally; a
  // gang created mid-node needs a daemon restart to pick it up (acceptable --
  // creating one is a deliberate, tripwired decision, not a background event).
  const startupState = ns.read(STATE_FILE);
  let startupAgeMs = Infinity;
  if (startupState) {
    try {
      startupAgeMs = Date.now() - (JSON.parse(startupState).timestamp ?? 0);
    } catch {
      startupAgeMs = Infinity;
    }
  }
  if (startupAgeMs > MAX_STATE_AGE_MS) {
    ns.tprint(`gangratelog: no live gang (${STATE_FILE} missing or stale) -- exiting.`);
    return;
  }

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
