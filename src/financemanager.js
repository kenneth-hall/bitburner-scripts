// Phase 10: reservation-based available-cash service. Decides how much cash
// is *available* for other scripts to spend by holding reservations for
// known upcoming hand-purchases (first cloud server, TOR, port openers,
// Formulas.exe) plus a manual override -- cash is either earmarked for a
// known upcoming purchase or actively deployed, never idle by accident.
//
// Zero Singularity calls (Kenneth's hard constraint -- without SF4 those
// carry a 16x RAM multiplier): ownership is read via ns.fileExists/
// ns.hasTorRouter, and prices are a static table verified once in-game (see
// finance-cloud-phase10.md's Cost table / Live validation A1). If a live
// price differs, fix the constant below -- that's the one allowed edit to a
// "just a config fix", not a design change.
//
// Identifier hygiene (Phase 9's lesson): no identifier/property/object key
// here may exactly match an ns API function name unless it's a real ns call
// -- checked against NetscriptDefinitions.d.ts at implementation time.
//
// Publishes finance-state.json (overwritten every poll, 0 GB ns.write --
// customers recompute availability against their own live money read, only
// totalReserved/timestamp are load-bearing) and finance-log.json (a FIFO
// ring buffer, appended only when the reservation set actually changes, plus
// one startup entry -- see vite.config.ts for the auto-export wiring).

const POLL_MS = 2000;

const STATE_FILE = "finance-state.json";
const LOG_FILE = "finance-log.json";
const MANUAL_EXTRA_FILE = "finance-reserve-extra.txt";
const LOG_MAX_ENTRIES = 500;

export const BOOTSTRAP_SERVER_COST = 110_000; // 2GB cloud-server price -- Kenneth hand-buys the first foothold in the UI, not purchasecloudservers.js's 16GB floor
export const TOR_ROUTER_COST = 200_000;
export const FORMULAS_COST = 5_000_000_000;
export const FORMULAS_HACKING_LEVEL_THRESHOLD = 300; // strictly greater, per Kenneth's wording

// Order matches hosts.js's PORT_OPENERS exactly (not imported -- importing
// hosts.js would pull in its rooting/nuke ns surface, which this
// Singularity-free script has no business paying for; the codebase already
// duplicates small tables this way, e.g. daemon.js's own HOME_RESERVE_GB).
export const PORT_OPENER_COSTS = [
  { file: "BruteSSH.exe", label: "BruteSSH.exe", cost: 500_000 },
  { file: "FTPCrack.exe", label: "FTPCrack.exe", cost: 1_500_000 },
  { file: "relaySMTP.exe", label: "relaySMTP.exe", cost: 5_000_000 },
  { file: "HTTPWorm.exe", label: "HTTPWorm.exe", cost: 30_000_000 },
  { file: "SQLInject.exe", label: "SQLInject.exe", cost: 250_000_000 },
];

/**
 * Pure. Parses finance-reserve-extra.txt's raw content: a missing/empty file
 * is a quiet "nothing to reserve" (not bad content -- there's no file to be
 * bad), while a present-but-unparseable value (garbage, <=0, NaN, Infinity)
 * is reported back as badContent so the caller can WARN once per distinct
 * bad value.
 */
export function parseManualExtra(raw) {
  if (raw === undefined || raw === null || raw === "") return { amount: 0, badContent: false };
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return { amount: n, badContent: false };
  return { amount: 0, badContent: true };
}

/**
 * Pure. Builds the active reservation list from cheap ownership/state facts.
 * Each rule is independent and additive -- see finance-cloud-phase10.md's
 * "Reservation rules" for the full rationale per rule.
 */
export function computeReservations({ serverCount, hasTor, ownedPrograms, hackingLevel, hasFormulas, manualExtraAmount }) {
  const reservations = [];

  if (serverCount === 0) {
    reservations.push({ key: "bootstrap-server", label: "first cloud server (hand-buy)", amount: BOOTSTRAP_SERVER_COST });
  }

  if (!hasTor) {
    reservations.push({ key: "tor-router", label: "TOR router", amount: TOR_ROUTER_COST });
  }

  const unowned = PORT_OPENER_COSTS.filter((p) => !ownedPrograms.has(p.file));
  if (unowned.length > 0) {
    const cheapest = unowned.reduce((min, p) => (p.cost < min.cost ? p : min));
    reservations.push({ key: "next-port-opener", label: cheapest.label, amount: cheapest.cost });
  }

  if (hackingLevel > FORMULAS_HACKING_LEVEL_THRESHOLD && !hasFormulas) {
    reservations.push({ key: "formulas", label: "Formulas.exe", amount: FORMULAS_COST });
  }

  if (manualExtraAmount > 0) {
    reservations.push({ key: "manual-extra", label: `manual reserve (${MANUAL_EXTRA_FILE})`, amount: manualExtraAmount });
  }

  const totalReserved = reservations.reduce((sum, r) => sum + r.amount, 0);
  return { reservations, totalReserved };
}

/** Pure. Reservations may legitimately exceed money (e.g. formulas at $5b) -- that's the design working, not an error state. */
export function computeAvailable(money, totalReserved) {
  return Math.max(0, money - totalReserved);
}

/**
 * Pure. Diffs two reservation lists by key: added (new key), removed (key
 * gone), changed (same key, different amount/label -- the port-opener
 * ladder walking from one program to the next is the main case). changedKeys
 * is the flattened list the log's `changed` field wants.
 */
export function diffReservations(prevList, nextList) {
  const prevByKey = new Map(prevList.map((r) => [r.key, r]));
  const nextByKey = new Map(nextList.map((r) => [r.key, r]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, next] of nextByKey) {
    const prev = prevByKey.get(key);
    if (!prev) {
      added.push(next);
    } else if (prev.amount !== next.amount || prev.label !== next.label) {
      changed.push({ key, fromAmount: prev.amount, fromLabel: prev.label, toAmount: next.amount, toLabel: next.label });
    }
  }
  for (const [key, prev] of prevByKey) {
    if (!nextByKey.has(key)) removed.push(prev);
  }

  const changedKeys = [...added.map((r) => r.key), ...removed.map((r) => r.key), ...changed.map((c) => c.key)];
  return { added, removed, changed, changedKeys, isEmpty: changedKeys.length === 0 };
}

function tprintTs(ns, message) {
  ns.tprint(`[${new Date().toLocaleTimeString()}] ${message}`);
}

/** Pure push+trim -- plain FIFO, no pinning needed (unlike daemon.js's log, there's no config record to protect). */
function appendFinanceLog(entries, record) {
  entries.push(record);
  if (entries.length > LOG_MAX_ENTRIES) entries.splice(0, entries.length - LOG_MAX_ENTRIES);
  return entries;
}

function flushFinanceLog(ns, entries) {
  ns.write(LOG_FILE, JSON.stringify(entries, null, 2), "w");
}

function announceDiff(ns, diff) {
  for (const r of diff.added) {
    tprintTs(ns, `FINANCE: reserved $${ns.format.number(r.amount)} -- ${r.key} (${r.label})`);
  }
  for (const c of diff.changed) {
    tprintTs(
      ns,
      `FINANCE: released ${c.key} (${c.fromLabel}) -- now reserving $${ns.format.number(c.toAmount)} for ${c.toLabel}`
    );
  }
  for (const r of diff.removed) {
    tprintTs(ns, `FINANCE: released ${r.key} (${r.label})`);
  }
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  let logEntries = [];
  let previousReservations = null; // null only until the startup poll runs
  let lastBadManualExtraRaw = null; // tracks the last WARNed-about bad value, so re-warning only happens on a NEW bad value
  let lastChangeTime = null;

  while (true) {
    const money = ns.getPlayer().money;
    const serverCount = ns.cloud.getServerNames().length;
    const hasTor = ns.hasTorRouter();
    const hackingLevel = ns.getHackingLevel();

    const ownedPrograms = new Set();
    for (const p of PORT_OPENER_COSTS) {
      if (ns.fileExists(p.file, "home")) ownedPrograms.add(p.file);
    }
    const hasFormulasExe = ns.fileExists("Formulas.exe", "home");

    const manualExtraRaw = ns.read(MANUAL_EXTRA_FILE);
    const parsedManualExtra = parseManualExtra(manualExtraRaw);
    if (parsedManualExtra.badContent) {
      if (manualExtraRaw !== lastBadManualExtraRaw) {
        tprintTs(ns, `WARN: ${MANUAL_EXTRA_FILE} exists but doesn't parse to a finite positive number (got "${manualExtraRaw}") -- ignoring`);
        lastBadManualExtraRaw = manualExtraRaw;
      }
    } else {
      lastBadManualExtraRaw = null;
    }

    const { reservations, totalReserved } = computeReservations({
      serverCount,
      hasTor,
      ownedPrograms,
      hackingLevel,
      hasFormulas: hasFormulasExe,
      manualExtraAmount: parsedManualExtra.amount,
    });
    const available = computeAvailable(money, totalReserved);

    const now = Date.now();
    const timeLabel = new Date(now).toLocaleTimeString();
    const stateRecord = { timestamp: now, time: timeLabel, money, totalReserved, available, reservations };
    ns.write(STATE_FILE, JSON.stringify(stateRecord), "w");

    if (previousReservations === null) {
      if (reservations.length === 0) {
        tprintTs(ns, "FINANCE: no active reservations");
      } else {
        tprintTs(ns, "FINANCE: initial reservations --");
        for (const r of reservations) {
          tprintTs(ns, `  ${r.key}: $${ns.format.number(r.amount)} (${r.label})`);
        }
      }
      logEntries = appendFinanceLog(logEntries, { event: "startup", ...stateRecord, changed: [] });
      flushFinanceLog(ns, logEntries);
      lastChangeTime = timeLabel;
    } else {
      const diff = diffReservations(previousReservations, reservations);
      if (!diff.isEmpty) {
        announceDiff(ns, diff);
        logEntries = appendFinanceLog(logEntries, { event: "reservations", ...stateRecord, changed: diff.changedKeys });
        flushFinanceLog(ns, logEntries);
        lastChangeTime = timeLabel;
      }
    }
    previousReservations = reservations;

    ns.clearLog();
    ns.print(`===== finance manager @ ${timeLabel} =====`);
    ns.print(`money: $${ns.format.number(money)}`);
    if (reservations.length === 0) {
      ns.print("no active reservations");
    } else {
      for (const r of reservations) {
        ns.print(`  ${r.key.padEnd(18)} $${ns.format.number(r.amount).padStart(12)}  ${r.label}`);
      }
    }
    ns.print(`totalReserved: $${ns.format.number(totalReserved)} | available: $${ns.format.number(available)}`);
    if (lastChangeTime) ns.print(`last change: ${lastChangeTime}`);

    await ns.sleep(POLL_MS);
  }
}
