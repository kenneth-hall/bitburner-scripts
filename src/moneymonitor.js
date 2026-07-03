// Dedicated popup for money milestones and periodic income reports -- pulled
// out of daemon.js's own tail window, which gets ns.clearLog()'d every
// BATCH_INTERVAL_MS and would wipe a milestone line the instant the next
// tick redraws.
//
// Entries are kept newest-first: each new milestone/income line is
// unshifted onto a capped ring buffer and the whole buffer is reprinted, the
// same pattern daemon.js uses for its recent-launches window -- but only on
// an actual event, not every poll, since nothing else on screen changes
// between them.
//
// Read-only: never calls ns.exec, so it has zero effect on the worker-RAM
// pool daemon.js competes for.

const MONEY_MILESTONE = 100_000;
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

  const startMoney = ns.getPlayer().money;
  // Starts at the next multiple of MONEY_MILESTONE strictly above whatever
  // the player already has, so startup doesn't immediately fire for money
  // earned before this run.
  let nextMoneyMilestone = (Math.floor(startMoney / MONEY_MILESTONE) + 1) * MONEY_MILESTONE;
  let intervalStartMoney = startMoney;
  let lastReportTime = Date.now();
  const entries = [];

  ns.print(`===== money monitor (newest first, last 0/${MAX_HISTORY}) =====`);
  ns.print("(none yet)");

  while (true) {
    const playerMoney = ns.getPlayer().money;

    // Looped (not just `if`) in case a single tick's money jump clears more
    // than one MONEY_MILESTONE at once.
    while (playerMoney >= nextMoneyMilestone) {
      logEvent(
        ns,
        entries,
        `[${new Date().toLocaleTimeString()}] MILESTONE: total money reached $${ns.format.number(nextMoneyMilestone)} (now $${ns.format.number(playerMoney)})`
      );
      nextMoneyMilestone += MONEY_MILESTONE;
    }

    if (Date.now() - lastReportTime >= INCOME_REPORT_MS) {
      const earned = playerMoney - intervalStartMoney;
      const perMinute = earned / (INCOME_REPORT_MS / 60_000);
      logEvent(
        ns,
        entries,
        `[${new Date().toLocaleTimeString()}] income (last 5m): ${earned >= 0 ? "+" : ""}$${ns.format.number(earned)} ` +
          `(~$${ns.format.number(perMinute)}/min)`
      );
      intervalStartMoney = playerMoney;
      lastReportTime = Date.now();
    }

    await ns.sleep(POLL_MS);
  }
}
