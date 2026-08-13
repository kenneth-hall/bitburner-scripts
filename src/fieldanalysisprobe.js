/**
 * fieldanalysisprobe.js -- 2026-08-13
 *
 * TWO questions in one run, because both need the same quiesce:
 *
 *  Q-A (READ-ONLY, "should we be running the other actions?"): dump the FULL action
 *      inventory -- every Contract, Operation and General action -- with its estimate
 *      RANGE [min,max], count remaining, action time, rank gain and level. Offline
 *      analysis joins this to the realised ledger. Nothing here mutates.
 *
 *  Q-B (MUTATING, "does Field Analysis reopen the estimate?"): Tracking's estimate
 *      LOW end has collapsed 0.89 -> 0.25 while its HIGH end never moved off 1.0000
 *      and realised success stayed 100%. That signature is lost INTEL, not a real
 *      decline. `Field Analysis` is the documented counter and has NEVER been in the
 *      engine's pool. Run it and watch whether pMin climbs back.
 *
 * The verdict is pMin's trajectory: rising => intel problem, fixable, wire Field
 * Analysis into the pool. Flat => the decay is level-driven, and the fix is the
 * selection-reads-the-ledger change instead.
 *
 * SLOT SAFETY -- this is the four-way-contention landmine, and both failure modes
 * are already recorded in bladeburneractionprobe.js:
 *   1. Killing bladeburnermanager -> daemon.js relaunches it within ~60s and the two
 *      fight over the slot. So we use its off-marker and let it idle IN-LOOP.
 *   2. The off-marker makes it RELEASE the slot hold, and augfarmer.js grabs the slot
 *      the instant it sees it unclaimed. So we claim the hold OURSELVES and refresh it
 *      inside SLOT_HOLD_MAX_AGE_MS (30s) for the whole run, and pause augfarmer too.
 * Every marker is cleared in a `finally` -- leaving one behind idles the engine forever,
 * which on an unattended run is far worse than losing the measurement.
 *
 * ASCII ONLY -- this file is seeded via in-game `wget`, which mangles UTF-8
 * (docs/dev-server.md).
 */

const BB_OFF_MARKER = "bladeburner-off.txt";
const SLOT_HOLD_FILE = "bladeburner-slot-hold.json";
const AUG_PAUSE_FILE = "augfarmer-pause.txt";

const HOLD_REFRESH_MS = 10_000; // well inside SLOT_HOLD_MAX_AGE_MS (30s)
const FA_WINDOW_MS = 15 * 60 * 1000; // 15 min of Field Analysis
const SAMPLE_EVERY_MS = 30_000;

const CONTRACTS = ["Tracking", "Bounty Hunter", "Retirement"];
const OPERATIONS = [
  "Investigation",
  "Undercover Operation",
  "Sting Operation",
  "Raid",
  "Stealth Retirement Operation",
  "Assassination",
];
const GENERAL = [
  "Training",
  "Field Analysis",
  "Recruitment",
  "Diplomacy",
  "Hyperbolic Regeneration Chamber",
  "Incite Violence",
];

/** Read one action's full public state. Pure read -- safe to call any time. */
function readAction(ns, type, name) {
  const row = { type, name };
  const bb = ns.bladeburner;
  try {
    const est = bb.getActionEstimatedSuccessChance(type, name);
    row.pMin = est[0];
    row.pMax = est[1];
    row.width = est[1] - est[0];
  } catch (e) {
    row.estError = String(e).slice(0, 120);
  }
  const safe = (label, fn) => {
    try { row[label] = fn(); } catch (e) { row[label] = null; }
  };
  safe("countRemaining", () => bb.getActionCountRemaining(type, name));
  safe("actionTimeMs", () => bb.getActionTime(type, name));
  safe("repGain", () => bb.getActionRepGain(type, name));
  safe("level", () => bb.getActionCurrentLevel(type, name));
  safe("maxLevel", () => bb.getActionMaxLevel(type, name));
  safe("successes", () => bb.getActionSuccesses(type, name));
  return row;
}

/** Q-A: the whole pool, one snapshot. */
function inventory(ns) {
  const rows = [];
  for (const n of CONTRACTS) rows.push(readAction(ns, "Contracts", n));
  for (const n of OPERATIONS) rows.push(readAction(ns, "Operations", n));
  for (const n of GENERAL) rows.push(readAction(ns, "General", n));
  return rows;
}

/** Just the estimate bounds, for the trajectory series (cheap enough to sample often). */
function estimateSnapshot(ns) {
  const snap = {};
  for (const n of CONTRACTS) {
    try {
      const e = ns.bladeburner.getActionEstimatedSuccessChance("Contracts", n);
      snap[n] = { pMin: e[0], pMax: e[1] };
    } catch (err) { /* skip */ }
  }
  for (const n of OPERATIONS) {
    try {
      const e = ns.bladeburner.getActionEstimatedSuccessChance("Operations", n);
      snap[n] = { pMin: e[0], pMax: e[1] };
    } catch (err) { /* skip */ }
  }
  return snap;
}

function holdSlot(ns) {
  ns.write(SLOT_HOLD_FILE, JSON.stringify({ ts: Date.now(), holder: "fieldanalysisprobe" }), "w");
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const out = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "Q-A full action inventory (read-only) + Q-B does Field Analysis reopen the estimate (mutating)",
    faWindowMs: FA_WINDOW_MS,
    stage: "init",
    series: [],
  };
  const file = "fieldanalysisprobe-" + out.ts + ".json";
  const emit = (label) => {
    out.stage = label;
    try { ns.write(file, JSON.stringify(out, null, 2), "w"); } catch (e) { /* breadcrumb only */ }
  };

  // ---- Q-A: inventory BEFORE touching anything -----------------------------
  out.city = ns.bladeburner.getCity();
  out.chaosBefore = ns.bladeburner.getCityChaos(out.city);
  out.rankBefore = ns.bladeburner.getRank();
  out.inventoryBefore = inventory(ns);
  emit("inventory-before");

  try {
    // ---- quiesce: engine off-marker, augfarmer pause, claim the slot -------
    ns.write(BB_OFF_MARKER, "paused by fieldanalysisprobe.js @ " + out.iso + "\n", "w");
    ns.write(AUG_PAUSE_FILE, "paused by fieldanalysisprobe.js @ " + out.iso + "\n", "w");
    holdSlot(ns);
    emit("pause-requested");

    // Wait for the engine to actually let go. Verify with getCurrentAction(),
    // never a boolean -- startAction's return value is a known liar (reference S8).
    let waited = 0;
    while (waited < 30_000) {
      await ns.sleep(2_000);
      waited += 2_000;
      holdSlot(ns);
      const live = ns.bladeburner.getCurrentAction();
      if (!live || !live.name || live.name === "Hyperbolic Regeneration Chamber") break;
    }
    out.slotReleasedAfterMs = waited;
    ns.bladeburner.stopBladeburnerAction();
    await ns.sleep(1_000);
    emit("slot-acquired");

    // ---- Q-B: run Field Analysis, sampling the estimate as we go ----------
    out.startReturned = ns.bladeburner.startAction("General", "Field Analysis");
    await ns.sleep(2_000);
    const live0 = ns.bladeburner.getCurrentAction();
    out.verifiedRunning = !!(live0 && live0.name === "Field Analysis");
    if (!out.verifiedRunning) {
      out.abortReason = "Field Analysis did not start (getCurrentAction=" + JSON.stringify(live0) + ")";
      emit("abort-not-running");
      return;
    }
    emit("fa-running");

    const t0 = Date.now();
    let lastSample = 0;
    while (Date.now() - t0 < FA_WINDOW_MS) {
      await ns.sleep(HOLD_REFRESH_MS);
      holdSlot(ns); // MUST stay inside 30s or augfarmer takes the slot
      const elapsed = Date.now() - t0;
      if (elapsed - lastSample >= SAMPLE_EVERY_MS) {
        lastSample = elapsed;
        const cur = ns.bladeburner.getCurrentAction();
        out.series.push({
          elapsedMs: elapsed,
          stillRunning: !!(cur && cur.name === "Field Analysis"),
          chaos: ns.bladeburner.getCityChaos(out.city),
          est: estimateSnapshot(ns),
        });
        emit("fa-sampling");
      }
    }

    ns.bladeburner.stopBladeburnerAction();
    await ns.sleep(1_000);
    out.chaosAfter = ns.bladeburner.getCityChaos(out.city);
    out.rankAfter = ns.bladeburner.getRank();
    out.inventoryAfter = inventory(ns);
    emit("measured");
  } finally {
    // ALWAYS restore. A stranded marker idles the engine indefinitely.
    try { ns.rm(BB_OFF_MARKER, "home"); } catch (e) { /* already gone */ }
    try { ns.rm(AUG_PAUSE_FILE, "home"); } catch (e) { /* already gone */ }
    try { ns.rm(SLOT_HOLD_FILE, "home"); } catch (e) { /* already gone */ }
    out.markersCleared =
      !ns.fileExists(BB_OFF_MARKER, "home") &&
      !ns.fileExists(AUG_PAUSE_FILE, "home") &&
      !ns.fileExists(SLOT_HOLD_FILE, "home");
    emit("restored");
  }

  // ---- verdict -----------------------------------------------------------
  const before = (out.inventoryBefore || []).find((r) => r.name === "Tracking");
  const after = (out.inventoryAfter || []).find((r) => r.name === "Tracking");
  if (before && after && before.pMin != null && after.pMin != null) {
    out.verdict = {
      trackingPMinBefore: before.pMin,
      trackingPMinAfter: after.pMin,
      delta: after.pMin - before.pMin,
      widthBefore: before.width,
      widthAfter: after.width,
      reading:
        "pMin RISING / width SHRINKING => intel problem, Field Analysis is the fix. " +
        "Flat => decay is level-driven, fix is selection-reads-the-ledger instead.",
    };
  }
  out.stage = "complete";
  ns.write(file, JSON.stringify(out, null, 2), "w");

  ns.tprint("=== fieldanalysisprobe ===");
  if (out.verdict) {
    ns.tprint(
      "  Tracking pMin " +
        out.verdict.trackingPMinBefore.toFixed(4) +
        " -> " +
        out.verdict.trackingPMinAfter.toFixed(4) +
        "  (delta " +
        (out.verdict.delta >= 0 ? "+" : "") +
        out.verdict.delta.toFixed(4) +
        ")"
    );
    ns.tprint(
      "  range width " + out.verdict.widthBefore.toFixed(4) + " -> " + out.verdict.widthAfter.toFixed(4)
    );
  }
  ns.tprint("  chaos " + out.chaosBefore.toFixed(1) + " -> " + (out.chaosAfter || 0).toFixed(1));
  ns.tprint("  markersCleared=" + out.markersCleared + " -> " + file);
}
