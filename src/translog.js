// Shared write helper for the daily transactions log (transactions-YYYY-MM-DD.json).
// Multiple writers touch the same day-file: this file's income companion
// (transactionsmonitor.js) and any manually-run purchase script. Safety
// rests entirely on one invariant -- every writer must go through
// recordTransaction (or replicate its exact shape) and never `await`
// anywhere between the `ns.read` and the `ns.write`. Bitburner scripts are
// single-threaded JS, so a synchronous read-modify-write can't be
// interleaved by another script's writer; an `await` in the middle would
// open a window for another writer's update to get clobbered. This is the
// whole concurrency story -- there is no locking, and none is needed as
// long as every writer respects this.
//
// ns.read/ns.write are both 0 GB (confirmed in markdown/), so importing
// this module is RAM-free in principle.

const INCOME_COALESCE_GAP_MS = 60_000;
const INCOME_WINDOW_MAX_MS = 5 * 60_000;

/** Pure. Local date parts (not toISOString, which is UTC and would rotate the file at the wrong hour). */
function transactionsFileName(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `transactions-${yyyy}-${mm}-${dd}.json`;
}

/**
 * Appends one record to today's file. Synchronous read-modify-write: no
 * `await` anywhere in this body -- see the invariant documented above.
 */
function recordTransaction(ns, record) {
  const filename = transactionsFileName(new Date());
  const raw = ns.read(filename); // "" for a missing file
  const entries = raw ? JSON.parse(raw) : [];
  entries.push(record);
  ns.write(filename, JSON.stringify(entries, null, 2), "w");
}

/**
 * Pure. Decides whether an income delta landing at `nowTimestamp` should
 * fold into `lastRecord` or start a fresh record. Gates on the *projected*
 * window (nowTimestamp - firstTimestamp), not the current one -- gating on
 * the current window would let the final fold stretch a window right up to
 * INCOME_WINDOW_MAX_MS past the bound by up to the gap, and the log checker
 * asserts a hard `<=` on that window.
 */
function shouldCoalesce(lastRecord, nowTimestamp) {
  if (!lastRecord || lastRecord.type !== "income") return false;
  if (nowTimestamp - lastRecord.lastTimestamp > INCOME_COALESCE_GAP_MS) return false;
  const projectedWindow = nowTimestamp - lastRecord.firstTimestamp;
  if (projectedWindow > INCOME_WINDOW_MAX_MS) return false;
  return true;
}

/**
 * Pure (Phase 32). Reverse-scans `entries` for the LAST income record whose
 * `source` matches, returning its index iff `shouldCoalesce` passes against
 * it at `nowTimestamp` -- else -1. Per-source rather than tail-only: with
 * two writers landing in the same poll (gang + hacking), the literal last
 * array entry alternates sources and a tail-only check would never
 * coalesce anything. Folding into this record (rather than the tail) is
 * safe against the verify checker's ordering assertion because income
 * records are ordered by firstTimestamp, which a fold never touches (only
 * amount/lastTimestamp/time change).
 */
function coalesceIndexForSource(entries, source, nowTimestamp) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const record = entries[i];
    if (record.type === "income" && record.source === source) {
      return shouldCoalesce(record, nowTimestamp) ? i : -1;
    }
  }
  return -1;
}

export { transactionsFileName, recordTransaction, shouldCoalesce, coalesceIndexForSource, INCOME_COALESCE_GAP_MS, INCOME_WINDOW_MAX_MS };
