// Phase 25 (2026-07-15 amendment, Kenneth's explicit ask) -- auto-backdoor
// w0r1d_d43m0n once it exists and hacking clears its requirement. THE
// single most consequential automated action in this whole project:
// installBackdoor() on WD ends the current BitNode (destroys the run,
// hands off to Source-File/BitVerse selection) -- not reversible in-session
// the way a wasted install cycle is. Kenneth authorized this explicitly
// (2026-07-15) after being told the actual restrictions in play (this file,
// the ratchet-mode.txt auto-install gate, and the Red Pill allow-listing
// were all named individually before he said "remove all of them").
//
// Deliberately its own file, not folded into backdoorfactions.js -- that
// script's own hard rail scopes it to the four hacking-faction servers only
// ("Daedalus/The-Cave... out of scope by mechanic, not oversight"). WD is a
// run-ending action, a different category from a faction-invite backdoor;
// isolating it here mirrors why installer.js was split out of augfarmer.js
// (blast-radius isolation, not code reuse).
//
// Self-terminating Singularity fulfiller, same shape as backdoorfactions.js
// (reuses its walkTo helper): polls every POLL_MS until WD exists AND
// hacking clears its requirement, backdoors it, prints an unmissable
// summary, and exits. Launched by daemon.js at startup via launchDetached
// -- harmless before Red Pill is bought (WD doesn't exist yet, so every
// poll is a silent no-op) and self-terminates the moment it fires, so it
// never lingers as dead weight after BN1 clears.

import { tprintTs } from "./common.js";
import { walkTo } from "./backdoorfactions.js";
import { tryRoot } from "./hosts.js";

const WD_HOST = "w0r1d_d43m0n";
const POLL_MS = 60_000;

function exitSingularityUnavailable(ns, callLabel, error) {
  tprintTs(ns, `WARN: ${callLabel} threw -- Singularity unavailable right now (${error?.message ?? error})`);
  ns.tprint("===== backdoorwd summary =====");
  ns.tprint("  can't auto-backdoor w0r1d_d43m0n yet -- exiting.");
  ns.ui.closeTail();
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  let singularityProven = false;

  while (true) {
    const timeLabel = new Date().toLocaleTimeString();

    let server = null;
    try {
      server = ns.getServer(WD_HOST);
    } catch {
      // Doesn't exist yet -- Red Pill not installed. Not a Singularity
      // failure (getServer isn't Singularity-gated), just "too early".
    }

    if (!server) {
      ns.clearLog();
      ns.print(`===== backdoor WD @ ${timeLabel} =====`);
      ns.print("w0r1d_d43m0n does not exist yet -- waiting for The Red Pill install");
      await ns.sleep(POLL_MS);
      continue;
    }

    if (server.backdoorInstalled) {
      tprintTs(ns, "SUMMARY: w0r1d_d43m0n already backdoored -- BN1 clear already complete. Exiting.");
      ns.ui.closeTail();
      return;
    }

    const hackingLevel = ns.getHackingLevel();
    const requiredLevel = ns.getServerRequiredHackingLevel(WD_HOST);
    const ready = hackingLevel >= requiredLevel;

    if (!ready) {
      ns.clearLog();
      ns.print(`===== backdoor WD @ ${timeLabel} =====`);
      ns.print(`hacking ${hackingLevel} / ${requiredLevel} required -- waiting`);
      await ns.sleep(POLL_MS);
      continue;
    }

    let rooted;
    try {
      rooted = ns.hasRootAccess(WD_HOST) || tryRoot(ns, WD_HOST);
      singularityProven = true; // getHackingLevel/hasRootAccess/tryRoot aren't Singularity, but the guard is harmless here
    } catch (e) {
      tprintTs(ns, `WARN: rooting ${WD_HOST} threw (${e?.message ?? e}) -- retrying next poll`);
      await ns.sleep(POLL_MS);
      continue;
    }

    if (!rooted) {
      ns.clearLog();
      ns.print(`===== backdoor WD @ ${timeLabel} =====`);
      ns.print("hacking level met but rooting failed (missing port openers?) -- retrying");
      await ns.sleep(POLL_MS);
      continue;
    }

    let origin;
    try {
      origin = ns.singularity.getCurrentServer();
      singularityProven = true;
    } catch (e) {
      if (!singularityProven) {
        exitSingularityUnavailable(ns, "getCurrentServer", e);
        return;
      }
      tprintTs(ns, `WARN: getCurrentServer threw (${e?.message ?? e}) -- retrying next poll`);
      await ns.sleep(POLL_MS);
      continue;
    }

    try {
      if (!walkTo(ns, WD_HOST)) {
        tprintTs(ns, `WARN: couldn't walk to ${WD_HOST} -- retrying next poll`);
        await ns.sleep(POLL_MS);
        continue;
      }
      if (ns.singularity.getCurrentServer() !== WD_HOST) {
        tprintTs(ns, "WARN: sanity check failed after walking to w0r1d_d43m0n -- retrying next poll");
        await ns.sleep(POLL_MS);
        continue;
      }
      await ns.singularity.installBackdoor();
      tprintTs(ns, "================================================");
      tprintTs(ns, "BACKDOOR: w0r1d_d43m0n -- BN1 CLEAR. BitNode complete.");
      tprintTs(ns, "================================================");
    } catch (e) {
      if (!singularityProven) {
        exitSingularityUnavailable(ns, "installBackdoor(w0r1d_d43m0n)", e);
        return;
      }
      tprintTs(ns, `WARN: installBackdoor(w0r1d_d43m0n) threw (${e?.message ?? e}) -- retrying next poll`);
      await ns.sleep(POLL_MS);
      continue;
    }

    try {
      walkTo(ns, origin);
    } catch {
      // BN1 just ended -- the origin server may not even exist anymore
      // post-reset. Not worth reporting.
    }

    ns.ui.closeTail();
    return;
  }
}
