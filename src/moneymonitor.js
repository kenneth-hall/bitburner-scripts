// Dedicated popup for periodic income reports -- pulled out of daemon.js's
// own tail window, which gets ns.clearLog()'d every BATCH_INTERVAL_MS and
// would wipe a report line the instant the next tick redraws.
//
// Entries are kept newest-first: each new report is unshifted onto a capped
// ring buffer and the whole buffer is reprinted, the same pattern
// daemon.js uses for its recent-launches window -- but only on an actual
// event, not every poll, since nothing else on screen changes between them.
//
// Read-only: never calls ns.exec, so it has zero effect on the worker-RAM
// pool daemon.js competes for.

const INCOME_REPORT_MS = 5 * 60 * 1000;
const POLL_MS = 1000;
const MAX_HISTORY = 50;

function logEvent(ns, entries, line) {
  entries.unshift(line);
  if (entries.length > MAX_HISTORY) entries.length = MAX_HISTORY;

  ns.clearLog();
  ns.print(`===== money monitor (newest first, last ${entries.length}/${MAX_HISTORY}) =====`);
  for (const entry of entries) ns.print(entry);
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  // Hacking income only (decided): ns.getMoneySources().sinceStart.hacking is
  // a cumulative counter, so its delta is spend-proof and non-negative --
  // unlike the player's raw balance, which plunges negative in any window
  // where a server purchase/upgrade happens to land. The docs never define
  // how sinceStart differs from sinceInstall; for a windowed delta it doesn't
  // matter -- both are cumulative and reset only alongside events that kill
  // this monitor anyway.
  let intervalStartHackingIncome = ns.getMoneySources().sinceStart.hacking;
  let lastReportTime = Date.now();
  const entries = [];

  ns.print(`===== money monitor (newest first, last 0/${MAX_HISTORY}) =====`);
  ns.print("(none yet)");

  while (true) {
    if (Date.now() - lastReportTime >= INCOME_REPORT_MS) {
      const playerMoney = ns.getPlayer().money; // kept on the line for context (total balance), no longer the earned figure
      const hackingIncomeNow = ns.getMoneySources().sinceStart.hacking;
      const earned = hackingIncomeNow - intervalStartHackingIncome;
      const perMinute = earned / (INCOME_REPORT_MS / 60_000);
      logEvent(
        ns,
        entries,
        `[${new Date().toLocaleTimeString()}] $${ns.format.number(playerMoney)} total | ` +
          `+$${ns.format.number(earned)} hacking income in last 5m (~$${ns.format.number(perMinute)}/min)`
      );
      intervalStartHackingIncome = hackingIncomeNow;
      lastReportTime = Date.now();
    }

    await ns.sleep(POLL_MS);
  }
}
