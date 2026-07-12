// Formulas.exe fulfiller -- the backdoorfactions.js resident model. Buys
// Formulas.exe once hacking > FORMULAS_HACKING_LEVEL_THRESHOLD (mirroring the
// exact condition resourcemanager.js uses to decide the formulas reservation)
// and it's affordable above the bootstrap holdback, then exits. daemon.js
// re-checks Formulas.exe every cycle and switches legacy -> formulas math
// within one cycle once the file appears, so the buy takes effect live with no
// restart.
//
// Why resident, not self-terminating like procureprograms.js: hacking > 400 is
// reached long after the port openers are bought (the post-install XP
// re-climb), so a one-shot buyer launched at daemon startup would exit before
// it's ever eligible. This stays resident on a slow poll until Formulas is
// owned or the buy is vetoed, the same way backdoorfactions.js waits out its
// hacking climb (54 -> 542) before it can act. RAM (Singularity, ~1x at SF4.3)
// is negligible on a post-aug-install home (home RAM persists across aug
// installs); on a fresh-BitNode 8 GB home, launchDetached's fit-check in
// daemon.js defers it until home grows, same as the other Singularity
// companions.
//
// Veto: presence of finance-disable-formulas.txt (resourcemanager.js's manual
// kill switch for the formulas reservation) exits this without buying -- a
// deliberate "I don't want Formulas this run" signal. A later daemon restart
// re-evaluates if the flag is removed.
//
// Fail-safes mirror procureprograms.js: no fresh finance state -> buy nothing
// this pass (so the bootstrap-server holdback reservation is respected before
// it's readable); purchaseProgram throws (not returns false) without SF4 ->
// print once and exit. The only reservation honored is the bootstrap holdback
// (gating on our own formulas reservation would be circular -- we're its
// fulfiller), same rule as procureprograms.js.
//
// Exec-by-filename from daemon.js, never imported -- keeps this file's
// Singularity surface out of every other script's RAM bundle (CLAUDE.md
// hot-path rule).

import { recordTransaction } from "./translog.js";
import { FORMULAS_COST, FORMULAS_HACKING_LEVEL_THRESHOLD, FORMULAS_DISABLE_FILE } from "./resourcemanager.js";
import { bootstrapHoldbackFrom } from "./procureprograms.js";
import { tprintTs } from "./common.js";
import { isStateStale, readFinanceState, STALE_MS } from "./financestate.js";

const POLL_MS = 30_000;
const FORMULAS_FILE = "Formulas.exe";

/**
 * Pure. The whole per-pass decision, mirroring procureprograms.js's
 * planProgramPurchase. Order matters: owned/vetoed are terminal ("done"/
 * "disabled" -> exit); the level gate is the resident wait branch; TOR is
 * required before purchaseProgram can touch the darkweb; stale state and the
 * holdback both defer the buy without exiting.
 * @returns {{action: "done"|"disabled"|"wait-level"|"wait-tor"|"wait-stale"|"wait-cash"|"buy"}}
 */
export function planFormulasPurchase({ hasFormulas, disabled, hacking, hasTor, money, holdback, stale }) {
  if (hasFormulas) return { action: "done" };
  if (disabled) return { action: "disabled" };
  if (hacking <= FORMULAS_HACKING_LEVEL_THRESHOLD) return { action: "wait-level" };
  if (!hasTor) return { action: "wait-tor" };
  if (stale) return { action: "wait-stale" };
  if (money - FORMULAS_COST < holdback) return { action: "wait-cash" };
  return { action: "buy" };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  let wasStale = true; // starts "stale" so the first real state clears it without a spurious WARN

  while (true) {
    const state = readFinanceState(ns);
    const stale = isStateStale(state?.timestamp ?? null, Date.now(), STALE_MS);
    const plan = planFormulasPurchase({
      hasFormulas: ns.fileExists(FORMULAS_FILE, "home"),
      disabled: ns.fileExists(FORMULAS_DISABLE_FILE, "home"),
      hacking: ns.getHackingLevel(),
      hasTor: ns.hasTorRouter(),
      money: ns.getPlayer().money,
      holdback: bootstrapHoldbackFrom(state),
      stale,
    });

    // Terminal outcomes exit quietly (owned) / on a deliberate veto (disabled) --
    // no "nothing to do" terminal noise, per the startup-quiet convention.
    if (plan.action === "done" || plan.action === "disabled") {
      ns.ui.closeTail();
      return;
    }

    if (plan.action === "buy") {
      let bought;
      try {
        bought = ns.singularity.purchaseProgram(FORMULAS_FILE);
      } catch (e) {
        tprintTs(ns, `WARN: purchaseProgram(${FORMULAS_FILE}) threw -- Singularity unavailable right now (${e?.message ?? e})`);
        ns.ui.closeTail();
        return;
      }
      if (bought) {
        const nowMs = Date.now();
        recordTransaction(ns, {
          type: "expense",
          source: "auto-formulas",
          program: FORMULAS_FILE,
          amount: FORMULAS_COST,
          timestamp: nowMs,
          time: new Date(nowMs).toLocaleTimeString(),
        });
        tprintTs(
          ns,
          `PROCURE: ${FORMULAS_FILE} for $${ns.format.number(FORMULAS_COST)} -- daemon switches to formulas math within a cycle`,
        );
        ns.ui.closeTail();
        return;
      }
      tprintTs(ns, `WARN: purchaseProgram(${FORMULAS_FILE}) returned false -- retrying next pass`);
    } else if (plan.action === "wait-stale") {
      if (!wasStale) tprintTs(ns, "WARN: finance state stale/missing -- holding Formulas buy until it recovers");
      wasStale = true;
    }
    if (plan.action !== "wait-stale") wasStale = false;

    ns.clearLog();
    ns.print(`===== procure formulas @ ${new Date().toLocaleTimeString()} =====`);
    ns.print(`status: ${plan.action}`);
    ns.print(`hacking: ${ns.getHackingLevel()} (need > ${FORMULAS_HACKING_LEVEL_THRESHOLD})`);
    ns.print(`money: $${ns.format.number(ns.getPlayer().money)} | need $${ns.format.number(FORMULAS_COST)} + holdback`);

    await ns.sleep(POLL_MS);
  }
}
