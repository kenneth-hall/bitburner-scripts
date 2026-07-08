// Finance-state client seam (Phase 16, F4): the finance-state.json shape and
// staleness rule shared by every reader of resourcemanager.js's published
// state. Charter (mirrors common.js): cheap ns surface (ns.read only), no
// policy, no cross-module cycles -- resourcemanager.js (the writer) imports
// only FINANCE_STATE_FILE from here; it never reads or staleness-checks.

export const FINANCE_STATE_FILE = "finance-state.json";
export const STALE_MS = 15_000; // >7 resource-manager polls (POLL_MS=2000 there)

/** Pure. Missing/null timestamp is always stale -- no finance manager running yet counts as stale. */
export function isStateStale(stateTimestamp, now, staleMs) {
  if (stateTimestamp === null || stateTimestamp === undefined) return true;
  return now - stateTimestamp > staleMs;
}

/** Reads and parses finance-state.json; null on missing/empty/unparseable content. */
export function readFinanceState(ns) {
  const raw = ns.read(FINANCE_STATE_FILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
