// Pure windowed-income-rate helpers for the Phase 8 A/B/A' income-side
// measurement -- parses a VERIFY_WINDOWS env spec and computes $/min per
// window from a transactions log's entries array. Lives in test/ (not src/)
// so viteburner never syncs it into the game, same reason
// scheduler.test.js's header comment gives for its own file placement.
//
// Windows come from the A/B toggle timestamps (recorded by daemon.js's
// `mode` events), so this only ever runs against exported logs, never
// in-game.

/**
 * Parses "<startMs>-<endMs>[,<startMs>-<endMs>...]", each range optionally
 * labeled as "<label>:<startMs>-<endMs>". Returns [] for a missing/empty spec.
 * @param {string | undefined} spec
 */
export function parseWindows(spec) {
  if (!spec) return [];
  return spec
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const hasLabel = part.includes(':');
      const [label, range] = hasLabel ? part.split(':') : [null, part];
      const [start, end] = range.split('-').map(Number);
      return { label: label ?? `${start}-${end}`, start, end };
    });
}

/**
 * Hacking-income $/min for one window. Income records coalesce over up to
 * INCOME_WINDOW_MAX_MS (5 min, translog.js) on a rolling cadence independent
 * of the A/B toggle timestamps, so a record straddling a window boundary is
 * the common case, not a rare edge -- a strict "fully contained" filter was
 * tried first and found (via a real session, 2026-07-04) to silently drop
 * most records near every boundary. Instead, each record's amount is
 * pro-rated by the fraction of its [firstTimestamp, lastTimestamp] interval
 * that overlaps this window (assumes a roughly even income rate within a
 * single coalesced record, which holds unless a huge one-off windfall lands
 * inside a record that also straddles a boundary). A record entirely outside
 * the window contributes 0; one entirely inside contributes its full amount.
 * @param {any[]} entries
 * @param {{label: string, start: number, end: number}} window
 */
export function windowedIncomeRate(entries, window) {
  let total = 0;
  let count = 0;
  for (const r of entries) {
    if (r.type !== 'income') continue;
    const recordSpanMs = r.lastTimestamp - r.firstTimestamp;

    if (recordSpanMs === 0) {
      // A single-instant record has no interval to overlap -- count it in
      // full if that instant falls inside the window (the overlapMs<=0 path
      // below would otherwise always skip it, since overlapEnd-overlapStart
      // can never exceed 0 for a zero-width interval).
      if (r.firstTimestamp >= window.start && r.firstTimestamp <= window.end) {
        total += r.amount;
        count++;
      }
      continue;
    }

    const overlapStart = Math.max(r.firstTimestamp, window.start);
    const overlapEnd = Math.min(r.lastTimestamp, window.end);
    const overlapMs = overlapEnd - overlapStart;
    if (overlapMs <= 0) continue;
    total += r.amount * (overlapMs / recordSpanMs);
    count++;
  }
  const windowMs = window.end - window.start;
  const perMinute = windowMs > 0 ? total / (windowMs / 60_000) : 0;
  return { label: window.label, total, perMinute, count };
}
