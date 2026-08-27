/**
 * bn9companions.js -- Phase 43 WI-E: supervises the two residents daemon.js would have
 * launched and never did (`sleevemanager.js`, `bladeburnermanager.js`), launched early by
 * bn9entry.js (its first real action, LAUNCH_COMPANIONS) rather than at a post-join step.
 *
 * WHY THIS GAP EXISTS AT ALL (spec Section 2, A4). daemon.js stays down for the whole phase
 * (D1) and has no supervise-only mode -- it is one loop that both schedules the batcher and
 * launches RESIDENT_COMPANIONS, with no switch to run one half without the other. But
 * something still has to keep bladeburnermanager.js and sleevemanager.js alive: neither was
 * ever in daemon.js's RESIDENT_COMPANIONS list, even in BN10 -- sleevemanager.js in
 * particular has never been daemon-supervised in this repo's history.
 *
 * WHY LAUNCHED EARLY, NOT POST-JOIN. sleevemanager.js needs to already be managing the
 * sleeve BEFORE bn9entry.js's CALIBRATE_GRIND runs -- the whole point of the WI-F sync fix is
 * that the sleeve's contribution needs to be INSIDE the calibrated grind rate, not layered on
 * after. bladeburnermanager.js's gate simply stays closed (ns.bladeburner.inBladeburner()
 * reads false) until the join opens it; there is no cost to this script running the whole
 * time waiting for that.
 *
 * TWO TARGETS, TWO GATES:
 *   - sleevemanager.js  -- gateOpen is always TRUE (it already degrades cleanly with zero
 *     sleeves via its own getNumSleeves try/catch). Launched with the BN9 syncThreshold
 *     argument ("50").
 *   - bladeburnermanager.js -- gateOpen is ns.bladeburner.inBladeburner() (0 GB, confirmed
 *     callable pre-join -- bbblackop.js/bbskillbuy.js/bladeburnermanager.js's own startup
 *     guard all call it unguarded). Not launched until the join flips that true.
 *
 * shouldLaunch(isRunning, gateOpen) is the SAME pure function for both targets -- two call
 * sites, not two functions (spec Section 10).
 *
 * RAM (spec Section 9's table, gate 6 GB):
 *   bladeburner.inBladeburner   ~0 GB
 *   scriptRunning                ~0.10 GB
 *   exec                          1.30 GB
 *   base + file IO                ~0.50 GB
 *   ------------------------------------------------
 *   ~1.9 GB expected -- verify live with `mem bn9companions.js`.
 *
 * IDENTIFIER HYGIENE: no local/property name here is `graft`, `work`, `exec`, `share`,
 * `read`, `write`, `kill`, `run`, `ls`, `ps`, `scan`, `hack`, `grow`, `tail`, `window`,
 * `document`, `process`, or any other real ns/DOM global name -- `exec` in particular is
 * avoided as a local name even though the script CALLS ns.exec, per the repo-wide convention
 * (see cloudmanager.js's nextCloudName header note on the same substring trap).
 *
 * ASCII-only (brand-new src/ file -- viteburner's new-file upload bug needs an ASCII wget seed).
 *
 * Usage: run bn9companions.js
 * Writes bn9companions-state.json (overwrite-in-place, so a dead supervisor loop is itself
 * visible -- a stale timestamp means THIS script died, not just a target).
 */

export const SLEEVE_SCRIPT = "sleevemanager.js";
export const BLADEBURNER_SCRIPT = "bladeburnermanager.js";
export const SYNC_THRESHOLD_ARG = "50";
export const STATE_FILE = "bn9companions-state.json";
export const POLL_MS = 10_000;

/**
 * Pure. shouldLaunch(isRunning, gateOpen) -- the SAME function for both companion targets
 * (spec Section 10's exact signature). True iff the gate is open and the target is not
 * already running.
 */
export function shouldLaunch(isRunning, gateOpen) {
  return gateOpen && !isRunning;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  let sleeveLastLaunchMs = null;
  let bladeburnerLastLaunchMs = null;

  for (;;) {
    const nowMs = Date.now();

    const sleeveRunning = ns.scriptRunning(SLEEVE_SCRIPT, "home");
    const sleeveGateOpen = true; // always -- sleevemanager.js degrades cleanly with zero sleeves
    if (shouldLaunch(sleeveRunning, sleeveGateOpen)) {
      ns.exec(SLEEVE_SCRIPT, "home", 1, SYNC_THRESHOLD_ARG);
      sleeveLastLaunchMs = nowMs;
    }

    let bladeburnerGateOpen = false;
    try {
      bladeburnerGateOpen = ns.bladeburner.inBladeburner();
    } catch {
      bladeburnerGateOpen = false; // defensive -- inBladeburner is documented callable pre-join, but never trust a single call site over a fallback
    }
    const bladeburnerRunning = ns.scriptRunning(BLADEBURNER_SCRIPT, "home");
    if (shouldLaunch(bladeburnerRunning, bladeburnerGateOpen)) {
      ns.exec(BLADEBURNER_SCRIPT, "home", 1);
      bladeburnerLastLaunchMs = nowMs;
    }

    // Re-read after any launch this tick so the snapshot reflects reality, not the
    // pre-launch read (ns.exec is effectively synchronous for process-table purposes).
    const state = {
      ts: nowMs,
      iso: new Date(nowMs).toISOString(),
      sleeve: {
        running: ns.scriptRunning(SLEEVE_SCRIPT, "home"),
        gateOpen: sleeveGateOpen,
        lastLaunchMs: sleeveLastLaunchMs,
      },
      bladeburner: {
        running: ns.scriptRunning(BLADEBURNER_SCRIPT, "home"),
        gateOpen: bladeburnerGateOpen,
        lastLaunchMs: bladeburnerLastLaunchMs,
      },
    };
    ns.write(STATE_FILE, JSON.stringify(state, null, 2), "w");

    await ns.sleep(POLL_MS);
  }
}
