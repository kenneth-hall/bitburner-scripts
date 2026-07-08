// Companion dashboard for daemon.js, launched via launchDetached at startup --
// exactly replaces moneymonitor.js's slot. Unlike moneymonitor.js, this one
// writes: it's the sole income-side writer of the daily transactions log
// (src/translog.js), coalescing hack-landing deltas into windowed records
// (see shouldCoalesce in translog.js) instead of one record per landing --
// with the pipeline saturated, landings arrive about once a second, and a
// record per landing would be ~86k records/day with a full-array rewrite
// each time.
//
// Known limitation: baselines ns.getMoneySources().sinceStart.hacking at
// startup, so income accrued in the gap between a daemon kill and this
// script's relaunch (or after a crash) is never recorded. Accepted -- it's
// seconds per restart. A future income/getMoneySources reconciliation
// mismatch should read as this known gap, not a bug hunt.
//
// The income write here does its own inline read-modify-write instead of
// calling translog.js's recordTransaction, because folding a delta into the
// last record requires inspecting/mutating it first -- recordTransaction
// only supports an unconditional append. Both paths share the same
// synchronous discipline: no `await` between the `ns.read` and the
// `ns.write`, ever -- see translog.js's header for why that's the entire
// concurrency story for this multi-writer log.
//
// Never calls ns.exec; zero effect on the worker-RAM pool daemon.js competes
// for. Writes nothing but the income records described above.

import { transactionsFileName, shouldCoalesce } from "./translog.js";

const POLL_MS = 1000;
const DISPLAY_COUNT = 20;

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
  ns.ui.openTail();

  let baselineHackingIncome = ns.getMoneySources().sinceStart.hacking;
  let todayIncomeTotal = 0;
  let firstIncomeTimestamp = null;
  let currentDayFile = null;

  while (true) {
    const now = Date.now();
    const filename = transactionsFileName(new Date(now));

    if (dayRolledOver(currentDayFile, filename)) {
      todayIncomeTotal = 0;
      firstIncomeTimestamp = null;
    }
    currentDayFile = filename;

    const currentHackingIncome = ns.getMoneySources().sinceStart.hacking;
    const delta = currentHackingIncome - baselineHackingIncome;
    baselineHackingIncome = currentHackingIncome;

    if (delta > 0) {
      const raw = ns.read(filename);
      const entries = raw ? JSON.parse(raw) : [];
      const last = entries[entries.length - 1];

      if (shouldCoalesce(last, now)) {
        last.amount += delta;
        last.lastTimestamp = now;
        last.time = new Date(now).toLocaleString();
      } else {
        entries.push({
          type: "income",
          source: "hacking",
          amount: delta,
          firstTimestamp: now,
          lastTimestamp: now,
          time: new Date(now).toLocaleString(),
        });
      }
      ns.write(filename, JSON.stringify(entries, null, 2), "w"); // no await between the read above and this write

      todayIncomeTotal += delta;
      if (firstIncomeTimestamp === null) firstIncomeTimestamp = now;
    }

    // Redraw every poll, not only on writes -- a write-tied redraw goes
    // stale during income lulls and never reflects expense records other
    // scripts append to the same file. This second read is free (0 GB).
    const raw = ns.read(filename);
    const entries = raw ? JSON.parse(raw) : [];
    const recent = entries.slice(-DISPLAY_COUNT).reverse(); // newest first

    ns.clearLog();
    ns.print(`===== transactions (${filename}) =====`);
    if (recent.length === 0) {
      ns.print("(none yet today)");
    } else {
      for (const r of recent) {
        if (r.type === "income") {
          ns.print(`  [income]  +$${ns.format.number(r.amount)} hacking (${r.time})`);
        } else {
          ns.print(`  [expense] -$${ns.format.number(r.amount)} ${r.source} (${r.time})`);
        }
      }
    }
    ns.print(`----- today's hacking income: $${ns.format.number(todayIncomeTotal)} -----`);
    if (firstIncomeTimestamp !== null) {
      const elapsedMin = (Date.now() - firstIncomeTimestamp) / 60_000;
      const perMinute = elapsedMin > 0 ? todayIncomeTotal / elapsedMin : 0;
      ns.print(`----- rate: $${ns.format.number(perMinute)}/min -----`);
    }

    await ns.sleep(POLL_MS);
  }
}
