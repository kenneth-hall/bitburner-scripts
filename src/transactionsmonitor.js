// Companion dashboard for daemon.js, launched via launchDetached at startup --
// exactly replaces moneymonitor.js's slot. Unlike moneymonitor.js, this one
// writes: it's the sole income-side writer of the daily transactions log
// (src/translog.js), coalescing per-source deltas into windowed records
// (see shouldCoalesce/coalesceIndexForSource in translog.js) instead of one
// record per landing -- with the pipeline saturated, hacking landings arrive
// about once a second, and a record per landing would be ~86k records/day
// with a full-array rewrite each time.
//
// Phase 32 (Step 1): tracks BOTH hacking and gang income, not hacking alone.
// Gang income was ~96% of actual income this BN2.1 cycle (measured live
// 2026-07-21, moneysources.js) -- a ledger that only diffed .hacking was
// capturing ~4% of reality. Both sources are diffed from the same
// ns.getMoneySources().sinceStart read each poll, so a delta is always
// computed against a consistent snapshot.
//
// Known limitation: baselines ns.getMoneySources().sinceStart at startup, so
// income accrued in the gap between a daemon kill and this script's relaunch
// (or after a crash) is never recorded, for either source. Accepted -- it's
// seconds per restart. A future income/getMoneySources reconciliation
// mismatch should read as this known gap, not a bug hunt.
//
// The income write here does its own inline read-modify-write instead of
// calling translog.js's recordTransaction, because folding a delta into an
// existing record requires inspecting/mutating it first -- recordTransaction
// only supports an unconditional append. Both sources' folds/appends happen
// inside ONE synchronous read-modify-write of the day file (single read,
// mutate for each source with a positive delta, single write) -- the no-
// `await`-in-between concurrency invariant (translog.js's header) holds
// trivially since nothing yields between them.
//
// Never calls ns.exec; zero effect on the worker-RAM pool daemon.js competes
// for. Writes nothing but the income records described above.

import { transactionsFileName, shouldCoalesce, coalesceIndexForSource } from "./translog.js";

const POLL_MS = 1000;
const DISPLAY_COUNT = 3; // Phase 18: status popup, not a scrolling list -- the full day is transactions-YYYY-MM-DD.json
const INCOME_SOURCES = ["hacking", "gang"];

/**
 * Pure. True when the day-rotated transactions filename has changed since
 * the last poll -- the boundary the running "today" totals (below) should
 * reset on, since the file itself already rotates correctly and the display
 * should track whichever file it's actually reading. The first poll
 * (prevFilename === null) never rolls over, so startup doesn't spuriously
 * zero a total that was never accumulated.
 */
export function dayRolledOver(prevFilename, curFilename) {
  return prevFilename !== null && prevFilename !== curFilename;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // Bracket notation on "gang" deliberately -- ns.gang is a real ns
  // property, and this build's RAM analyzer misreads a literal `.gang`
  // property access as a reference to it regardless of receiver (CLAUDE.md
  // identifier-hygiene rule). `.hacking` dot access is proven safe (this
  // file, pre-Phase-32, measured at expected RAM).
  const sourcesAtStartup = ns.getMoneySources().sinceStart;
  let baselineHackingIncome = sourcesAtStartup.hacking;
  let baselineGangIncome = sourcesAtStartup["gang"];
  let todayIncomeTotal = 0;
  let todayIncomeBySource = { hacking: 0, gang: 0 };
  let firstIncomeTimestamp = null;
  let currentDayFile = null;

  while (true) {
    const now = Date.now();
    const filename = transactionsFileName(new Date(now));

    if (dayRolledOver(currentDayFile, filename)) {
      todayIncomeTotal = 0;
      todayIncomeBySource = { hacking: 0, gang: 0 };
      firstIncomeTimestamp = null;
    }
    currentDayFile = filename;

    const sources = ns.getMoneySources().sinceStart;
    const currentHackingIncome = sources.hacking;
    const currentGangIncome = sources["gang"];
    const hackingDelta = currentHackingIncome - baselineHackingIncome;
    const gangDelta = currentGangIncome - baselineGangIncome;
    baselineHackingIncome = currentHackingIncome;
    baselineGangIncome = currentGangIncome;

    // Per-source deltas, computed once at this poll's `now` -- a node reset
    // (cumulative drop) on either source alone skips just that source's
    // write and re-baselines on the next poll, exactly as the pre-Phase-32
    // hacking-only guard behaved.
    const deltasBySource = { hacking: hackingDelta, gang: gangDelta };
    const positiveSources = INCOME_SOURCES.filter((s) => deltasBySource[s] > 0);

    if (positiveSources.length > 0) {
      const raw = ns.read(filename);
      const entries = raw ? JSON.parse(raw) : [];

      for (const source of positiveSources) {
        const delta = deltasBySource[source];
        const idx = coalesceIndexForSource(entries, source, now);
        if (idx >= 0) {
          entries[idx].amount += delta;
          entries[idx].lastTimestamp = now;
          entries[idx].time = new Date(now).toLocaleString();
        } else {
          entries.push({
            type: "income",
            source,
            amount: delta,
            firstTimestamp: now,
            lastTimestamp: now,
            time: new Date(now).toLocaleString(),
          });
        }
        todayIncomeTotal += delta;
        todayIncomeBySource[source] = (todayIncomeBySource[source] ?? 0) + delta;
        if (firstIncomeTimestamp === null) firstIncomeTimestamp = now;
      }
      ns.write(filename, JSON.stringify(entries, null, 2), "w"); // no await between the read above and this write
    }

    // Redraw every poll, not only on writes -- a write-tied redraw goes
    // stale during income lulls and never reflects expense records other
    // scripts append to the same file. This second read is free (0 GB).
    const raw = ns.read(filename);
    const entries = raw ? JSON.parse(raw) : [];
    const recent = entries.slice(-DISPLAY_COUNT).reverse(); // newest first

    ns.clearLog();
    ns.print(`===== transactions @ ${new Date().toLocaleTimeString()} =====`);

    let todayLine = `today: $${ns.format.number(todayIncomeTotal)} (hacking $${ns.format.number(todayIncomeBySource.hacking)} | gang $${ns.format.number(todayIncomeBySource["gang"])})`;
    if (firstIncomeTimestamp !== null) {
      const elapsedMin = (Date.now() - firstIncomeTimestamp) / 60_000;
      const perMinute = elapsedMin > 0 ? todayIncomeTotal / elapsedMin : 0;
      todayLine += ` | rate: $${ns.format.number(perMinute)}/min`;
    }
    ns.print(todayLine);

    if (recent.length === 0) {
      ns.print("(none yet today)");
    } else {
      for (const r of recent) {
        // Time-only for display -- some writers' r.time is a full locale
        // string (date + time), the wrap culprit this phase fixes; the
        // on-disk r.time is untouched. Income records carry lastTimestamp
        // (see the coalescing block above); every recordTransaction expense
        // writer carries timestamp instead -- not the same field name.
        const displayTime = new Date(r.lastTimestamp ?? r.timestamp).toLocaleTimeString();
        if (r.type === "income") {
          ns.print(`  [income]  +$${ns.format.number(r.amount)} ${r.source} @ ${displayTime}`);
        } else {
          ns.print(`  [expense] -$${ns.format.number(r.amount)} ${r.source} @ ${displayTime}`);
        }
      }
    }
    ns.print(`(full log: ${filename})`);

    await ns.sleep(POLL_MS);
  }
}
