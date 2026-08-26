/**
 * srfcheck.js -- Phase 43 WI-E: machine-checked S-RF re-verification.
 *
 * WHY. Phase 42 (`phase-42-field-analysis.features.md`, unshipped, sitting in the repo root)
 * exists because BN10's `Tracking` realised 80% success, below S-RF's own
 * `REALISED_FLOOR_MIN_SUCCESS = 0.9` (bladeburnermanager.js) -- selection was exposed to a
 * `pMin` estimate that had decayed to ~500x wrong. BN9's realised success rate is unknown in
 * advance and depends on BN9's own combat/chaos dynamics, so the phase-42 disposition (spec
 * Section 11) needs a REAL, MEASURED number, not eyeballed off a dashboard or asserted in
 * prose -- this script produces exactly that number, one file at a time, read-only.
 *
 * READ-ONLY. Touches nothing: reads bladeburner-state.json (bladeburnermanager.js's own
 * persisted snapshot, already written every poll that engine runs) and writes its own output
 * file. No `ns.bladeburner.*` calls at all -- the ledger it needs is already on disk.
 *
 * WHERE THE DATA COMES FROM. bladeburnermanager.js persists `levelGovernor.actions`, an
 * object keyed by action name, each carrying `byLevel: {levelKey: {attempts, successes,
 * rankSum}}` -- the exact per-level realised-outcome ledger `realisedFloorScore` (S-RF)
 * itself reads. This script sums EVERY level's {attempts, successes, rankSum} for each
 * action (not just the current level -- S-RF's own "walk down to the highest PROVEN level"
 * logic is about scoring, not about what "the action's realised rate" means here), picks the
 * action with the largest summed `rankSum` (the "dominant rank-producing action" the spec
 * names), and reports realisedSuccess = successes/attempts for that one action, gated on
 * `attempts >= 100`.
 *
 * RAM: 0 GB (ns.read only, same as any other log-reading probe in this repo).
 *
 * IDENTIFIER HYGIENE: no local/property name here is `graft`, `work`, `exec`, `share`,
 * `read`, `write`, `kill`, `run`, `ls`, `ps`, `scan`, `hack`, `grow`, `tail`, `window`,
 * `document`, `process`, or any other real ns/DOM global name.
 *
 * ASCII-only (brand-new src/ file -- viteburner's new-file upload bug needs an ASCII wget seed).
 *
 * Usage: run srfcheck.js
 * Writes srfcheck-<epoch>.json (one file per run).
 */

export const BB_STATE_FILE = "bladeburner-state.json";
export const MIN_ATTEMPTS = 100;

/**
 * Pure. Sums attempts/successes/rankSum across every level entry in one action's `byLevel`.
 */
export function sumActionOutcomes(byLevel) {
  let attempts = 0;
  let successes = 0;
  let rankSum = 0;
  for (const key of Object.keys(byLevel || {})) {
    const s = byLevel[key];
    if (!s) continue;
    attempts += Number.isFinite(s.attempts) ? s.attempts : 0;
    successes += Number.isFinite(s.successes) ? s.successes : 0;
    rankSum += Number.isFinite(s.rankSum) ? s.rankSum : 0;
  }
  return { attempts, successes, rankSum };
}

/**
 * Pure. Given `levelGovernorActions` ({name: {byLevel: {...}}}), picks the action with the
 * largest summed rankSum (the "dominant rank-producing action") and computes its realised
 * success rate, gated on MIN_ATTEMPTS.
 *
 * Returns {dominantAction, attempts, successes, rankSum, realisedSuccess, srfProtected,
 * meetsMinAttempts} -- realisedSuccess/srfProtected are null when there is no dominant
 * action yet (empty ledger) or it has fewer than MIN_ATTEMPTS attempts (not enough evidence
 * to call it either way).
 */
export function computeDominantRealisedSuccess(levelGovernorActions, minAttempts = MIN_ATTEMPTS) {
  const names = Object.keys(levelGovernorActions || {});
  if (names.length === 0) {
    return {
      dominantAction: null, attempts: 0, successes: 0, rankSum: 0,
      realisedSuccess: null, srfProtected: null, meetsMinAttempts: false,
    };
  }

  let bestName = null;
  let bestOutcomes = null;
  for (const name of names) {
    const outcomes = sumActionOutcomes(levelGovernorActions[name]?.byLevel);
    if (!bestOutcomes || outcomes.rankSum > bestOutcomes.rankSum) {
      bestName = name;
      bestOutcomes = outcomes;
    }
  }

  const meetsMinAttempts = bestOutcomes.attempts >= minAttempts;
  const realisedSuccess = meetsMinAttempts && bestOutcomes.attempts > 0
    ? bestOutcomes.successes / bestOutcomes.attempts
    : null;
  const srfProtected = realisedSuccess === null ? null : realisedSuccess >= 0.90;

  return {
    dominantAction: bestName,
    attempts: bestOutcomes.attempts,
    successes: bestOutcomes.successes,
    rankSum: bestOutcomes.rankSum,
    realisedSuccess,
    srfProtected,
    meetsMinAttempts,
  };
}

function readJson(ns, file, fallback) {
  const raw = ns.read(file);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const nowMs = Date.now();
  const outRecord = { ts: nowMs, iso: new Date(nowMs).toISOString() };

  const state = readJson(ns, BB_STATE_FILE, null);
  const levelGovernorActions = state?.levelGovernor?.actions ?? {};

  const result = computeDominantRealisedSuccess(levelGovernorActions, MIN_ATTEMPTS);
  Object.assign(outRecord, result);
  outRecord.stateSourceFound = state !== null;

  const path = "srfcheck-" + nowMs + ".json";
  ns.write(path, JSON.stringify(outRecord, null, 2), "w");

  if (result.realisedSuccess === null) {
    ns.tprint("srfcheck: not enough evidence yet (" + result.attempts + "/" + MIN_ATTEMPTS +
      " attempts on '" + (result.dominantAction ?? "none") + "') -> " + path);
  } else {
    ns.tprint("srfcheck: '" + result.dominantAction + "' realisedSuccess=" +
      (result.realisedSuccess * 100).toFixed(1) + "% (n=" + result.attempts +
      ") srfProtected=" + result.srfProtected + " -> " + path);
  }
}
