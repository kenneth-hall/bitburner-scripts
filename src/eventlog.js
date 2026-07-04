// Shared write helper for the persistent, whole-playthrough events log
// (events-log.json). Unlike every other log in this project (ring-buffered
// daemon log, per-run targets summaries, daily transactions files), this one
// is never rotated, trimmed, or reset -- it exists so rare, high-signal
// milestones (faction joins, backdoor installs) stay permanently traceable
// and debuggable across resets. Files on home survive an augmentation
// install, so this file simply carries forward -- nothing to migrate.
//
// Rare events only: this playthrough should produce dozens of records total,
// not thousands. The full-array rewrite per append (same synchronous
// read-modify-write shape as translog.js) is only acceptable at that volume
// -- a future high-frequency stream needs its own file, never this one.
//
// Same multi-writer invariant as translog.js: never `await` between the
// `ns.read` and the `ns.write` below. Bitburner scripts are single-threaded
// JS, so a synchronous read-modify-write can't be interleaved by another
// script's writer; an `await` in the middle would open a window for another
// writer's update to get clobbered. This is the whole concurrency story --
// there is no locking, and none is needed as long as every writer respects
// this.
//
// Must stay Singularity- and ns.cloud.*-free: this file is in
// factionwatcher.js's bundle, which is meant to be a cheap, always-on
// companion.

const EVENTS_FILE = "events-log.json";

/**
 * Appends one record. Stamps the common fields itself (`time`, `timestamp`,
 * `resetId`) last, so no caller can accidentally override them -- callers
 * supply `type` plus type-specific fields only. Synchronous
 * read-modify-write: no `await` anywhere in this body, see the invariant
 * documented above.
 */
function recordEvent(ns, record) {
  const raw = ns.read(EVENTS_FILE); // "" for a missing file
  const entries = raw ? JSON.parse(raw) : [];
  const now = Date.now();
  entries.push({
    ...record,
    time: new Date(now).toLocaleString(),
    timestamp: now,
    resetId: ns.getResetInfo().lastAugReset,
  });
  ns.write(EVENTS_FILE, JSON.stringify(entries, null, 2), "w");
}

export { EVENTS_FILE, recordEvent };
