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
 * Hacking-income $/min for one window, over income records fully contained
 * within it (firstTimestamp >= start, lastTimestamp <= end) -- the coalescing
 * gap (translog.js's INCOME_COALESCE_GAP_MS) is small relative to a 10+
 * minute A/B window, so partial-overlap edge effects are negligible.
 * @param {any[]} entries
 * @param {{label: string, start: number, end: number}} window
 */
export function windowedIncomeRate(entries, window) {
  const income = entries.filter(
    (r) => r.type === 'income' && r.firstTimestamp >= window.start && r.lastTimestamp <= window.end
  );
  const total = income.reduce((sum, r) => sum + r.amount, 0);
  const windowMs = window.end - window.start;
  const perMinute = windowMs > 0 ? total / (windowMs / 60_000) : 0;
  return { label: window.label, total, perMinute, count: income.length };
}
