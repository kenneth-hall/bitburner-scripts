// Resource manager (Phase 11 rename of financemanager.js, charter unchanged
// from Phase 10): reservation-based available-cash service. Decides how much
// cash is *available* for other scripts to spend by holding reservations for
// known upcoming purchases (first cloud server, TOR, port openers,
// Formulas.exe) plus a manual override -- cash is either earmarked for a
// known upcoming purchase or actively deployed, never idle by accident. As
// of Phase 11, most of those reservations are fulfilled automatically by
// procureprograms.js/cloudmanager.js rather than hand-bought -- this script
// only ever reserves, never spends. Named "resource manager" (not "finance
// manager") because it budgets the money dimension now, shaped so a future
// RAM dimension could slot in alongside it later (not built -- see
// docs/phases/phase-11-resource-manager.spec.md's Out of scope).
//
// Zero Singularity calls (Kenneth's hard constraint -- without SF4 those
// carry a 16x RAM multiplier): ownership is read via ns.fileExists/
// ns.hasTorRouter, and prices are a static table verified once in-game (see
// docs/phases/phase-10-finance-cloud.md's Cost table / Live validation A1). If a live
// price differs, fix the constant below -- that's the one allowed edit to a
// "just a config fix", not a design change.
//
// Identifier hygiene (Phase 9's lesson): no identifier/property/object key
// here may exactly match an ns API function name unless it's a real ns call
// -- checked against NetscriptDefinitions.d.ts at implementation time.
//
// Formulas.exe reservation has a manual kill switch: presence of
// finance-disable-formulas.txt suppresses it regardless of hacking level,
// until the file is removed (no auto re-enable) -- same "you're in control"
// philosophy as finance-reserve-extra.txt, just a flag file instead of a
// number file.
//
// Publishes finance-state.json (overwritten every poll, 0 GB ns.write --
// customers recompute availability against their own live money read, only
// totalReserved/timestamp are load-bearing) and finance-log.json (a FIFO
// ring buffer, appended only when the reservation set actually changes, plus
// one startup entry -- see vite.config.ts for the auto-export wiring).

import { tprintTs } from "./common.js";
import { FINANCE_STATE_FILE } from "./financestate.js";

const POLL_MS = 2000;

const LOG_FILE = "finance-log.json";
const MANUAL_EXTRA_FILE = "finance-reserve-extra.txt";
export const FORMULAS_DISABLE_FILE = "finance-disable-formulas.txt";
const LOG_MAX_ENTRIES = 500;

// Phase 23: augfarmer.js's own reservation file -- duplicated as a plain
// string constant here (not imported) because this script must stay
// Singularity-free, and augfarmer.js's allowed-import list is deliberately
// narrow (common.js/translog.js only, see its header) -- neither script
// imports the other. augfarmer.js owns the write; this script only reads.
const AUGFARMER_RESERVE_FILE = "augfarmer-reserve.json";
export const AUGFARMER_STALE_MS = 60_000; // 6 augfarmer polls (POLL_MS=10_000 there)

export const BOOTSTRAP_SERVER_COST = 110_000; // 2GB cloud-server price -- Kenneth hand-buys the first foothold in the UI, not purchasecloudservers.js's 16GB floor
export const TOR_ROUTER_COST = 200_000;
export const FORMULAS_COST = 5_000_000_000;
export const FORMULAS_HACKING_LEVEL_THRESHOLD = 400; // strictly greater, per Kenneth's wording (bumped from 300 during Round B live validation, 2026-07-05)

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

// Phase 35 WI3 (D11/D5/§3/Q7): the opener-reservation rule that replaces
// "reserve the cheapest unowned opener, full stop" -- cheap openers (the
// ladder's first rungs, which F1 showed END the post-install $0 window) are
// always reserved in full; expensive ones (HTTPWorm/SQLInject) are gated on
// eligibility (can trailing income plausibly fund this within
// OPENER_INCOME_HORIZON_MS?) and activation (either enough cash banked
// already, or income can fund it within OPENER_FAST_FUND_MS). See
// computeOpenerActivation.
export const CHEAP_OPENER_FLOOR = 5_000_000;
export const OPENER_INCOME_HORIZON_MS = 8 * 60 * 60 * 1000; // 8h
export const OPENER_ACTIVATION_FRACTION = 0.5; // arm: money >= this * cost
export const OPENER_ACTIVATION_RELEASE_FRACTION = 0.35; // hysteresis: release only below this * cost (cold-review M3)
export const OPENER_ELIGIBILITY_RELEASE_MULT = 1.25; // hysteresis: eligible stays eligible until cost > horizon * income * this
export const OPENER_FAST_FUND_MS = 30 * 60 * 1000; // 30 min -- the second activation clause (cold-review blocker 6)

// Phase 35 WI3 (D6): goallog.js's snapshot -- the trailing-24h income signal
// the opener rule reads. Duplicated filename constant, not imported (same
// Singularity-free-script precedent as PORT_OPENER_COSTS above).
const GOAL_STATE_FILE = "goal-state.json";
const GOAL_STATE_STALE_MS = 5 * 60 * 1000;

/**
 * Pure (Phase 35 WI3/D5). Whether the expensive-opener reservation should be
 * active RIGHT NOW, given `prevActive` (whether THIS SAME target was active
 * last poll -- the caller resets this to false when the ladder's cheapest-
 * unowned target changes, so hysteresis never bleeds across different
 * openers). `trailingIncomePerSec` non-numeric (missing/stale signal, or a
 * fresh node's cleared series) always returns false -- floor-only mode,
 * hysteresis doesn't apply to a lost signal.
 *
 * Not-previously-active (arm thresholds): eligible when cost <=
 * horizon*income; activated when money >= ACTIVATION_FRACTION*cost OR
 * cost <= income*FAST_FUND_MS (the second clause is what makes the pin
 * bound real -- without it, other spenders can hold cash below half-price
 * indefinitely and the opener never funds).
 *
 * Previously active (release thresholds, cold-review M3): stays eligible
 * until cost > horizon*income*ELIGIBILITY_RELEASE_MULT; stays activated
 * until money < ACTIVATION_RELEASE_FRACTION*cost (augfarmer buys can
 * legitimately drop cash after activation without releasing the
 * reservation on every 2s poll).
 */
export function computeOpenerActivation({ cost, money, trailingIncomePerSec, prevActive }) {
  if (typeof trailingIncomePerSec !== "number" || !Number.isFinite(trailingIncomePerSec)) return false;

  // trailingIncomePerSec is $/SECOND; the *_MS constants are milliseconds --
  // convert to seconds before multiplying, or eligibility/fast-fund read
  // 1000x too generous.
  const horizonSec = OPENER_INCOME_HORIZON_MS / 1000;
  const fastFundSec = OPENER_FAST_FUND_MS / 1000;

  // 🔴 FIXED 2026-08-04: `stillFunded` must mirror the ARM clause's `||` fast-fund branch.
  // It did not, and the result was an infinite reserve/release flap -- observed live
  // spamming the terminal every 2s for `next-port-opener (SQLInject.exe)`: at money
  // $19.99m / cost $250m / income ~$200k/s, ARM passed via fast-fund
  // (250m <= 200k*1800s = 360m) while RELEASE tested only money >= 0.35*250m = $87.5m and
  // failed -- so it armed, released, armed, released forever. Hysteresis REQUIRES the
  // release band to be at least as lenient as the arm band; carrying only one of the two
  // arm clauses into release inverted that.
  if (prevActive) {
    const stillEligible = cost <= horizonSec * trailingIncomePerSec * OPENER_ELIGIBILITY_RELEASE_MULT;
    const stillFunded =
      money >= OPENER_ACTIVATION_RELEASE_FRACTION * cost || cost <= trailingIncomePerSec * fastFundSec;
    return stillEligible && stillFunded;
  }

  const eligible = cost <= horizonSec * trailingIncomePerSec;
  const funded = money >= OPENER_ACTIVATION_FRACTION * cost || cost <= trailingIncomePerSec * fastFundSec;
  return eligible && funded;
}

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
 * Pure (Phase 23, S7). Parses augfarmer-reserve.json's raw content: missing/
 * empty is a quiet zero (nothing running yet), malformed JSON or a
 * non-finite/negative amount is badContent, and a timestamp older than
 * `staleMs` (or missing/non-finite -- NaN comparisons never satisfy `>`, so
 * this must be checked explicitly) forces amount to 0 with stale:true -- a
 * crashed farmer must not freeze fleet growth forever.
 */
export function parseAugReserve(raw, now, staleMs) {
  if (raw === undefined || raw === null || raw === "") return { amount: 0, aug: null, badContent: false, stale: false };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { amount: 0, aug: null, badContent: true, stale: false };
  }
  if (!parsed || typeof parsed !== "object" || !Number.isFinite(parsed.amount) || parsed.amount < 0) {
    return { amount: 0, aug: null, badContent: true, stale: false };
  }

  const stale = !Number.isFinite(parsed.timestamp) || now - parsed.timestamp > staleMs;
  if (stale) return { amount: 0, aug: parsed.aug ?? null, badContent: false, stale: true };
  return { amount: parsed.amount, aug: parsed.aug ?? null, badContent: false, stale: false };
}

/**
 * Pure. Builds the active reservation list from cheap ownership/state facts.
 * Each rule is independent and additive -- see docs/phases/phase-10-finance-cloud.md's
 * "Reservation rules" for the full rationale per rule.
 *
 * formulasDisabled is a manual kill switch (presence of FORMULAS_DISABLE_FILE)
 * for the formulas reservation specifically -- it only has an effect while
 * the reservation would otherwise apply, which is reported back as
 * formulasSuppressed so the caller can distinguish "disabled and would have
 * fired" from "disabled but moot" (already owned / level too low).
 *
 * Phase 35 WI3 (D5): the next-port-opener rule is now a three-branch policy
 * (see computeOpenerActivation) -- `money`/`trailingIncomePerSec` are new
 * required inputs, and `prevOpenerActive`/`prevOpenerTarget` thread the
 * hysteresis state forward (the caller persists `openerActive`/
 * `openerTarget` from this call's return into next poll's args). Cheap
 * openers (<= CHEAP_OPENER_FLOOR) skip all of this -- always reserved in
 * full, exactly as before.
 *
 * Phase 43 WI-B: `cloudServerLimit` (default undefined -- preserves every existing call site's
 * behavior byte-for-byte) skips the bootstrap-server reservation when it is exactly 0 (BN9:
 * CloudServerLimit is a static per-BitNode 0, so cloudmanager.js's auto-buy this reservation
 * exists to fund can never succeed -- reserving $110k for it forever would lock that amount out
 * of every consumer of the reservation total, for nothing). Any other value (including the
 * BN6/BN10-shaped `> 0` case, or simply not passing the parameter) reserves exactly as before.
 */
export function computeReservations({
  serverCount,
  hasTor,
  ownedPrograms,
  hackingLevel,
  hasFormulas,
  manualExtraAmount,
  formulasDisabled,
  augReserve,
  money,
  trailingIncomePerSec = null,
  prevOpenerActive = false,
  prevOpenerTarget = null,
  cloudServerLimit = undefined,
}) {
  const reservations = [];

  if (serverCount === 0 && cloudServerLimit !== 0) {
    reservations.push({ key: "bootstrap-server", label: "first cloud server (cloudmanager auto-buy)", amount: BOOTSTRAP_SERVER_COST });
  }

  if (!hasTor) {
    reservations.push({ key: "tor-router", label: "TOR router", amount: TOR_ROUTER_COST });
  }

  let openerActive = false;
  let openerTarget = null;
  const unowned = PORT_OPENER_COSTS.filter((p) => !ownedPrograms.has(p.file));
  if (unowned.length > 0) {
    const cheapest = unowned.reduce((min, p) => (p.cost < min.cost ? p : min));
    openerTarget = cheapest.file;
    if (cheapest.cost <= CHEAP_OPENER_FLOOR) {
      reservations.push({ key: "next-port-opener", label: cheapest.label, amount: cheapest.cost });
      openerActive = true;
    } else {
      // Hysteresis only carries forward when the ladder's cheapest-unowned
      // target is the SAME opener as last poll -- a ladder advance (the
      // cheap rungs finish buying, cheapest-unowned jumps to an expensive
      // one) must start that opener from the arm thresholds, never inherit
      // a prior opener's release-banded leniency.
      const samePrevTarget = prevOpenerTarget === cheapest.file;
      openerActive = computeOpenerActivation({
        cost: cheapest.cost,
        money,
        trailingIncomePerSec,
        prevActive: samePrevTarget && !!prevOpenerActive,
      });
      if (openerActive) {
        reservations.push({ key: "next-port-opener", label: cheapest.label, amount: cheapest.cost });
      }
    }
  }

  const formulasWouldApply = hackingLevel > FORMULAS_HACKING_LEVEL_THRESHOLD && !hasFormulas;
  let formulasSuppressed = false;
  if (formulasWouldApply) {
    if (formulasDisabled) {
      formulasSuppressed = true;
    } else {
      reservations.push({ key: "formulas", label: "Formulas.exe", amount: FORMULAS_COST });
    }
  }

  if (manualExtraAmount > 0) {
    reservations.push({ key: "manual-extra", label: `manual reserve (${MANUAL_EXTRA_FILE})`, amount: manualExtraAmount });
  }

  if (augReserve && augReserve.amount > 0) {
    reservations.push({ key: "next-aug", label: `next aug: ${augReserve.aug ?? "?"} (augfarmer)`, amount: augReserve.amount });
  }

  const totalReserved = reservations.reduce((sum, r) => sum + r.amount, 0);
  return { reservations, totalReserved, formulasSuppressed, openerActive, openerTarget };
}

/** Pure. Reservations may legitimately exceed money (e.g. formulas at $5b) -- that's the design working, not an error state. */
export function computeAvailable(money, totalReserved) {
  return Math.max(0, money - totalReserved);
}

/**
 * Pure (Phase 35 WI3/D7). Stamps each reservation with `since` (first-seen
 * epoch-ms, read from `firstSeenMs`), adding any newly-appeared key and
 * dropping any key no longer present -- so `since` resets when a key
 * disappears and later returns, rather than reporting a stale first-seen
 * time from a long-gone reservation. Returns a NEW firstSeenMs object (does
 * not mutate the input) alongside the stamped reservation list -- this is
 * what makes "reservation held while available is $0 for N hours" a
 * detectable state (goallog.js's evalStuck `reservation-pin` branch) instead
 * of a silent one.
 */
export function stampReservationAges(reservations, firstSeenMs, nowMs) {
  const nextFirstSeenMs = {};
  const stamped = reservations.map((r) => {
    const since = firstSeenMs[r.key] ?? nowMs;
    nextFirstSeenMs[r.key] = since;
    return { ...r, since };
  });
  return { reservations: stamped, firstSeenMs: nextFirstSeenMs };
}

/**
 * Reads goallog.js's trailing-24h income signal (Phase 35 WI3/D6) --
 * missing/unparseable/stale (> GOAL_STATE_STALE_MS by its own `timestamp`)
 * or a non-numeric `income.perSec24h` all collapse to null (the opener
 * rule's floor-only mode).
 */
function readTrailingIncome(ns, nowMs) {
  const raw = ns.read(GOAL_STATE_FILE);
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.timestamp !== "number" || nowMs - parsed.timestamp > GOAL_STATE_STALE_MS) return null;
  const v = parsed?.income?.perSec24h;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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
    // 2026-07-15 fix: a moving-target reservation (e.g. augfarmer's live
    // Daedalus-donation cost, which shrinks every poll as rep grinds
    // toward it) keeps the same label while the dollar figure drifts --
    // that's not a meaningful transition worth a terminal line every 10s,
    // unlike the port-opener ladder's each-step label change. Still
    // recorded in the finance log either way (diffReservations' own
    // `changed` set, untouched) -- only the announce is suppressed.
    if (c.fromLabel === c.toLabel) continue;
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

  let logEntries = [];
  let previousReservations = null; // null only until the startup poll runs
  let previousFormulasSuppressed = null; // null only until the startup poll runs
  let lastBadManualExtraRaw = null; // tracks the last WARNed-about bad value, so re-warning only happens on a NEW bad value
  let lastBadAugReserveRaw = null; // same pattern for augfarmer-reserve.json
  let wasAugReserveStale = false; // tracks the stale->fresh transition so the WARN fires once, not every poll
  let lastChangeTime = null;

  // --- Phase 35 WI3 (D5/D7): opener hysteresis + per-reservation ages ---
  let prevOpenerActive = false;
  let prevOpenerTarget = null;
  let reservationFirstSeenMs = {}; // key -> firstSeenMs; in-memory, resets on restart (fine -- re-seeds within one poll)

  while (true) {
    const money = ns.getPlayer().money;
    const serverCount = ns.cloud.getServerNames().length;
    const cloudServerLimit = ns.cloud.getServerLimit(); // Phase 43 WI-B
    const hasTor = ns.hasTorRouter();
    const hackingLevel = ns.getHackingLevel();

    const ownedPrograms = new Set();
    for (const p of PORT_OPENER_COSTS) {
      if (ns.fileExists(p.file, "home")) ownedPrograms.add(p.file);
    }
    const hasFormulasExe = ns.fileExists("Formulas.exe", "home");
    const formulasDisabled = ns.fileExists(FORMULAS_DISABLE_FILE, "home");

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

    const augReserveRaw = ns.read(AUGFARMER_RESERVE_FILE);
    const parsedAugReserve = parseAugReserve(augReserveRaw, Date.now(), AUGFARMER_STALE_MS);
    if (parsedAugReserve.badContent) {
      if (augReserveRaw !== lastBadAugReserveRaw) {
        tprintTs(ns, `WARN: ${AUGFARMER_RESERVE_FILE} exists but doesn't parse to a valid reservation (got "${augReserveRaw}") -- ignoring`);
        lastBadAugReserveRaw = augReserveRaw;
      }
    } else {
      lastBadAugReserveRaw = null;
    }
    if (parsedAugReserve.stale && !wasAugReserveStale) {
      tprintTs(ns, `WARN: ${AUGFARMER_RESERVE_FILE} is stale -- treating as no reservation until it recovers`);
    }
    wasAugReserveStale = parsedAugReserve.stale;

    const now = Date.now();
    const trailingIncomePerSec = readTrailingIncome(ns, now);

    const {
      reservations: rawReservations,
      totalReserved,
      formulasSuppressed,
      openerActive,
      openerTarget,
    } = computeReservations({
      serverCount,
      hasTor,
      ownedPrograms,
      hackingLevel,
      hasFormulas: hasFormulasExe,
      manualExtraAmount: parsedManualExtra.amount,
      formulasDisabled,
      augReserve: parsedAugReserve,
      money,
      trailingIncomePerSec,
      prevOpenerActive,
      prevOpenerTarget,
      cloudServerLimit,
    });
    prevOpenerActive = openerActive;
    prevOpenerTarget = openerTarget;

    const { reservations, firstSeenMs } = stampReservationAges(rawReservations, reservationFirstSeenMs, now);
    reservationFirstSeenMs = firstSeenMs;

    const available = computeAvailable(money, totalReserved);

    const timeLabel = new Date(now).toLocaleTimeString();
    const stateRecord = { timestamp: now, time: timeLabel, money, totalReserved, available, reservations, formulasSuppressed };
    ns.write(FINANCE_STATE_FILE, JSON.stringify(stateRecord), "w");

    if (previousReservations === null) {
      if (reservations.length === 0) {
        tprintTs(ns, "FINANCE: no active reservations");
      } else {
        tprintTs(ns, "FINANCE: initial reservations --");
        for (const r of reservations) {
          tprintTs(ns, `  ${r.key}: $${ns.format.number(r.amount)} (${r.label})`);
        }
      }
      if (formulasSuppressed) {
        tprintTs(ns, `FINANCE: formulas reservation disabled by flag (${FORMULAS_DISABLE_FILE}) -- $${ns.format.number(FORMULAS_COST)} suppressed`);
      }
      logEntries = appendFinanceLog(logEntries, { event: "startup", ...stateRecord, changed: [] });
      flushFinanceLog(ns, logEntries);
      lastChangeTime = timeLabel;
    } else {
      const diff = diffReservations(previousReservations, reservations);
      const formulasFlagChanged = formulasSuppressed !== previousFormulasSuppressed;
      if (!diff.isEmpty || formulasFlagChanged) {
        if (!diff.isEmpty) announceDiff(ns, diff);
        if (formulasFlagChanged) {
          tprintTs(
            ns,
            formulasSuppressed
              ? `FINANCE: formulas reservation disabled by flag (${FORMULAS_DISABLE_FILE}) -- $${ns.format.number(FORMULAS_COST)} suppressed`
              : `FINANCE: formulas reservation flag cleared (${FORMULAS_DISABLE_FILE} removed) -- normal rules resume`
          );
        }
        logEntries = appendFinanceLog(logEntries, { event: "reservations", ...stateRecord, changed: diff.changedKeys });
        flushFinanceLog(ns, logEntries);
        lastChangeTime = timeLabel;
      }
    }
    previousReservations = reservations;
    previousFormulasSuppressed = formulasSuppressed;

    ns.clearLog();
    ns.print(`===== resource manager @ ${timeLabel} =====`);
    ns.print(`money $${ns.format.number(money)} | reserved $${ns.format.number(totalReserved)} | available $${ns.format.number(available)}`);
    if (reservations.length === 0) {
      ns.print("no active reservations");
    } else {
      for (const r of reservations) {
        ns.print(`  ${r.key.padEnd(18)} $${ns.format.number(r.amount).padStart(12)}  ${r.label}`);
      }
    }
    if (formulasSuppressed) {
      ns.print(`formulas reservation: DISABLED by flag (${FORMULAS_DISABLE_FILE}) -- would reserve $${ns.format.number(FORMULAS_COST)}`);
    }
    if (lastChangeTime) ns.print(`last change: ${lastChangeTime}`);

    await ns.sleep(POLL_MS);
  }
}
