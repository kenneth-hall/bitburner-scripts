// Program procurement (Phase 11 rename + evolution of purchasescripts.js).
// Self-terminating Singularity fulfiller for TOR + the five port openers
// only (S1's narrowing -- today's purchasescripts.js bought every affordable
// darkweb program; utility programs like ServerProfiler/DeepscanV1-V2/
// AutoLink become hand-buys, Formulas.exe stays reservation-only).
//
// Launched by daemon.js at startup via launchDetached (exec-by-filename,
// same isolation pattern as upgradehomeram.js) -- it's expensive to launch
// (Singularity RAM multiplier without SF4), so an exec failure here usually
// means a home-RAM problem, not a bug. Persists on a slow poll
// (POLL_MS = 30_000) until TOR + all five openers are owned, then tprints a
// summary and exits, freeing its ~66GB Singularity surface until the next
// daemon restart. Also runnable by hand (same acquisition loop).
//
// Prices come from resourcemanager.js's static PORT_OPENER_COSTS/
// TOR_ROUTER_COST table, not darkweb reads (S2) -- 0GB pure-constant
// imports instead of getDarkwebPrograms/getDarkwebProgramCost's 8GB each.
// A wrong constant is benign: purchaseProgram/purchaseTor just returns
// false, nothing is recorded, the next pass retries.
//
// Fail-safe: no finance state (missing, unparseable, or stale) means buy
// nothing this pass (S3, same rule as cloudmanager.js) -- without fresh
// state this script can't see the bootstrap-server reservation it's
// required to respect.
//
// Bootstrap holdback: the only reservation this script respects is
// bootstrap-server's amount (bootstrapHoldbackFrom) -- it won't spend below
// the $110k first-cloud-server foothold while that reservation is active.
// Every other reservation (manual-extra, formulas, and even this script's
// own tor-router/next-port-opener reservations) is deliberately ignored --
// this script is their fulfiller, so gating on them would be circular;
// beyond the one foothold guard, purchases race cheapest-first by design.
//
// Missing-Source-File fail-safe (discovered live, not in the original spec):
// purchaseTor/purchaseProgram throw a runtime error -- they don't return
// false -- when the account lacks the Source-File that Singularity API
// requires. Both calls are wrapped in try/catch; a throw prints one WARN and
// exits immediately (exitSingularityUnavailable), same as the "everything
// owned" exit. resourcemanager.js's reservations are untouched by this, so
// the cash stays protected for a hand-buy exactly like before this phase.

import { recordTransaction } from "./translog.js";
import { PORT_OPENER_COSTS, TOR_ROUTER_COST } from "./resourcemanager.js";
import { tprintTs } from "./common.js";
import { isStateStale, readFinanceState, STALE_MS } from "./financestate.js";

const POLL_MS = 30_000;

/** Pure. The bootstrap-server reservation's amount, or 0 if absent/malformed. */
export function bootstrapHoldbackFrom(state) {
  if (!state || !Array.isArray(state.reservations)) return 0;
  const r = state.reservations.find((x) => x.key === "bootstrap-server");
  return r ? r.amount : 0;
}

/** Pure. Cheapest unowned port opener, or null if every opener is owned. */
function cheapestUnownedOpener(ownedFiles) {
  const unowned = PORT_OPENER_COSTS.filter((p) => !ownedFiles.has(p.file));
  if (unowned.length === 0) return null;
  return unowned.reduce((min, p) => (p.cost < min.cost ? p : min));
}

/**
 * Pure. The whole per-pass decision: buy TOR first (unblocks
 * purchaseProgram), then the cheapest unowned opener, one action at a time,
 * never spending below holdback. Returns {action: "done"} once TOR + every
 * opener is owned.
 */
export function planProgramPurchase({ hasTor, ownedFiles, money, holdback }) {
  if (hasTor) {
    const cheapest = cheapestUnownedOpener(ownedFiles);
    if (cheapest === null) return { action: "done" };
    if (money - cheapest.cost >= holdback) {
      return { action: "buy-program", file: cheapest.file, cost: cheapest.cost };
    }
    return { action: "wait" };
  }
  if (money - TOR_ROUTER_COST >= holdback) return { action: "buy-tor" };
  return { action: "wait" };
}

/**
 * purchaseTor/purchaseProgram throw (not return false) when the account
 * lacks the Source-File this Singularity API requires -- discovered live,
 * not documented in the spec, which assumed a graceful `false`. Nothing
 * about that will change mid-session, so treat it as permanent for this
 * run: print once and let the caller return, exiting and freeing the ~66GB
 * surface. resourcemanager.js's reservations are untouched by this, so the
 * cash stays protected for a hand-buy exactly like before this phase existed.
 */
function exitSingularityUnavailable(ns, callLabel, error) {
  tprintTs(ns, `WARN: ${callLabel} threw -- Singularity purchases unavailable right now (${error?.message ?? error})`);
  ns.tprint("===== procureprograms summary =====");
  ns.tprint("  can't auto-buy yet -- exiting. resourcemanager.js's reservations still protect the cash for a hand-buy.");
  // Phase 18: this script isn't one of tailmanager.js's managed windows
  // (transient, not a standing dashboard) and a script finishing on its own
  // doesn't auto-close its tail either -- close it here so a clean exit
  // doesn't leave a frozen window for Kenneth to close by hand. No args =
  // closes the caller's own tail (0 GB).
  ns.ui.closeTail();
}

/**
 * getResetInfo (1 GB, not itself Singularity-gated) reports which
 * Source-Files are currently active -- checked up front so the common case
 * (SF4 missing) never touches purchaseTor/purchaseProgram at all, instead of
 * relying solely on catching their throw. The try/catch stays as a backstop
 * for any case this check doesn't cover.
 */
function hasSourceFile4(ns) {
  return (ns.getResetInfo().ownedSF.get(4) ?? 0) > 0;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const bought = [];
  let wasStale = true; // starts "stale" so the very first real state clears it without a spurious WARN

  while (true) {
    const ownedFiles = new Set();
    for (const p of PORT_OPENER_COSTS) {
      if (ns.fileExists(p.file, "home")) ownedFiles.add(p.file);
    }
    const hasTor = ns.hasTorRouter();

    if (hasTor && ownedFiles.size === PORT_OPENER_COSTS.length) {
      // Announce only if we actually bought something this run; a restart that
      // finds TOR + every opener already owned exits silently (no "nothing
      // needed" terminal noise on the steady-state daemon restart).
      if (bought.length > 0) {
        ns.tprint("===== procureprograms summary =====");
        for (const line of bought) ns.tprint(`  ${line}`);
      }
      ns.ui.closeTail(); // Phase 18: clean exit shouldn't leave a frozen window behind -- see exitSingularityUnavailable's comment
      return;
    }

    if (!hasSourceFile4(ns)) {
      ns.tprint("===== procureprograms summary =====");
      ns.tprint("  can't auto-buy yet (Source-File 4 not active) -- exiting. Reservations still protect the cash for a hand-buy.");
      ns.ui.closeTail(); // Phase 18: see exitSingularityUnavailable's comment
      return;
    }

    const timeLabel = new Date().toLocaleTimeString();
    const state = readFinanceState(ns);
    const stale = isStateStale(state?.timestamp ?? null, Date.now(), STALE_MS);

    if (stale) {
      if (!wasStale) tprintTs(ns, "WARN: finance state stale/missing -- buying nothing until it recovers");
      wasStale = true;
      ns.clearLog();
      ns.print(`===== procure programs @ ${timeLabel} =====`);
      ns.print(`finance state ${state ? "stale" : "missing"} -- buying nothing`);
      await ns.sleep(POLL_MS);
      continue;
    }
    if (wasStale) tprintTs(ns, "INFO: finance state recovered -- resuming");
    wasStale = false;

    const holdback = bootstrapHoldbackFrom(state);
    const money = ns.getPlayer().money;
    const plan = planProgramPurchase({ hasTor, ownedFiles, money, holdback });

    let statusLine;
    if (plan.action === "buy-tor") {
      let bought_;
      try {
        bought_ = ns.singularity.purchaseTor();
      } catch (e) {
        exitSingularityUnavailable(ns, "purchaseTor", e);
        return;
      }
      if (bought_) {
        const nowMs = Date.now();
        recordTransaction(ns, {
          type: "expense",
          source: "auto-tor",
          amount: TOR_ROUTER_COST,
          timestamp: nowMs,
          time: new Date(nowMs).toLocaleTimeString(),
        });
        tprintTs(ns, `PROCURE: TOR router for $${ns.format.number(TOR_ROUTER_COST)}`);
        bought.push(`TOR router: $${ns.format.number(TOR_ROUTER_COST)}`);
        statusLine = "bought TOR router this pass";
      } else {
        tprintTs(ns, "WARN: purchaseTor() returned false -- retrying next pass");
        statusLine = "purchaseTor() failed, retrying";
      }
    } else if (plan.action === "buy-program") {
      let bought_;
      try {
        bought_ = ns.singularity.purchaseProgram(plan.file);
      } catch (e) {
        exitSingularityUnavailable(ns, `purchaseProgram(${plan.file})`, e);
        return;
      }
      if (bought_) {
        const nowMs = Date.now();
        recordTransaction(ns, {
          type: "expense",
          source: "auto-port-opener",
          program: plan.file,
          amount: plan.cost,
          timestamp: nowMs,
          time: new Date(nowMs).toLocaleTimeString(),
        });
        tprintTs(ns, `PROCURE: ${plan.file} for $${ns.format.number(plan.cost)}`);
        bought.push(`${plan.file}: $${ns.format.number(plan.cost)}`);
        statusLine = `bought ${plan.file} this pass`;
      } else {
        tprintTs(ns, `WARN: purchaseProgram(${plan.file}) returned false -- retrying next pass`);
        statusLine = `purchaseProgram(${plan.file}) failed, retrying`;
      }
    } else {
      statusLine = `waiting for cash (holdback $${ns.format.number(holdback)})`;
    }

    ns.clearLog();
    ns.print(`===== procure programs @ ${timeLabel} =====`);
    ns.print(`money: $${ns.format.number(money)} | holdback: $${ns.format.number(holdback)}`);
    ns.print(`TOR: ${hasTor ? "owned" : "not owned"}`);
    ns.print(`openers owned: ${ownedFiles.size}/${PORT_OPENER_COSTS.length}`);
    ns.print(statusLine);

    await ns.sleep(POLL_MS);
  }
}
