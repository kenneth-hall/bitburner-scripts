/**
 * sleevemanager.js -- keeps the sleeve working, and notices when it isn't.
 *
 * WHY THIS EXISTS. Nothing managed the sleeve. Every src/sleeve*.js file is a one-shot
 * probe, daemon.js launches no sleeve script, so the sleeve's task was whatever the last
 * human or probe left behind. On 2026-08-19 that was IDLE: sleevepoolprobe.js finished,
 * faithfully restored the task it found (originalTask: null), and the sleeve sat doing
 * nothing until Kenneth happened to look. This script is the watcher that was missing.
 *
 * WHAT IT DOES. One job, done reliably: if the sleeve is idle, put it back on crime.
 * Then write what it saw to sleeve-state.json so the next "what is the sleeve doing?"
 * is a file read instead of a probe run.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *  - It does NOT run Bladeburner actions. Measured 2026-08-18 (sleevepoolprobe.js): a sleeve
 *    on contracts drains 62-68% of the SAME countRemaining pool the player's Tracking needs.
 *    Sleeve contracts compete for supply, they do not add throughput. Mirroring the player is
 *    the one assignment the evidence rules out. See docs/bitnodes.md's risk section.
 *  - It does NOT buy sleeve augmentations, even though shock reaches 0 and the money is
 *    trivial. Installing an aug on a sleeve RESETS THAT SLEEVE'S STATS
 *    (docs/sleeve-grafting-reference.md section 2) and needs current faction reputation we
 *    may not hold. That is a decision with a real cost, not a chore to automate. The script
 *    reports augReady instead, and Kenneth calls it.
 *  - It does NOT override a deliberate non-crime assignment BY DEFAULT. If a human parks the
 *    sleeve on Shock Recovery or Synchronize, that is respected -- only IDLE is treated as a
 *    fault. Drop sleevemanager-pause.txt to stop it touching anything at all. Phase 43 WI-F
 *    adds an OPT-IN, more active mode (see decideSleeveAction's syncThreshold parameter) that
 *    also arbitrates between Synchronize and Crime based on sync -- still off by default,
 *    every existing call site (no threshold argument) is byte-for-byte unaffected.
 *
 * WHY CRIME. The player's action slot is locked to Bladeburner, so combat exp is the one
 * thing the player cannot earn in parallel and a sleeve can. Sync is at 100, so exp transfers
 * at full rate, and Mug trains strength/defense/dexterity/agility at once. That matters right
 * now because the engine spends 37% of its actions on Hyperbolic Regeneration Chamber --
 * healing, because contracts hurt more than the player can absorb at combat 110.
 *
 * PHASE 43 WI-F -- syncThreshold ACTIVE-POLICY MODE. Why this file, not bn9entry.js (spec
 * Section 8): this file already exists, already does almost this exact job (measured 17.70 GB
 * live: getNumSleeves 4 + getSleeve 4 + getTask 4 + setToCommitCrime 4), and every ns.sleeve.*
 * method costs a flat 4 GB -- building the same capability again inside bn9entry.js would pay
 * that RAM a second time in a second process. BN9's needed policy (actively switch the sleeve
 * between Synchronize, below a sync threshold, and crime, at or above it) is more active than
 * the existing default ("fix idle only, respect every deliberate task"), so it is an ADDITIVE
 * opt-in mode behind a new, optional `syncThreshold` argument -- absent, behaviour is
 * unchanged. main() reads the threshold from ns.args[0] (bn9companions.js launches this file
 * with "50" -- sync's benefit compounds, so raising it early pays off across the whole
 * remaining grind; BN10 precedent: sync climbed 27 -> 100 unattended over a comparable
 * wall-clock window while running Synchronize).
 *
 * RAM: getNumSleeves 4 + getSleeve 4 + getTask 4 + setToCommitCrime 4 + setToSynchronize
 * (new, WI-F) 4 = 20 GB + base. Estimated ~21.70 GB (17.70 GB measured baseline + 4.00 GB for
 * the one new method) -- pending live remeasurement (WF4) before bn9companions.js is trusted
 * to launch it unattended.
 *
 * ASCII-only (docs/dev-server.md -- new files are seeded by in-game wget, which mangles
 * non-ASCII punctuation into a parse error).
 */

const STATE_FILE = "sleeve-state.json";
const PAUSE_FILE = "sleevemanager-pause.txt";
const CRIME_NAME = "Mug";
const CYCLE_MS = 10_000;

/**
 * Decide what to do with one sleeve. Pure -- no ns, so it is testable without a game.
 *
 * With `syncThreshold` OMITTED (undefined): the ORIGINAL, unchanged behaviour -- fix idle
 * only, respect every deliberate task (including an in-progress Synchronize).
 *   {act: "none",   why}  -- leave it alone
 *   {act: "crime",  why}  -- assign CRIME_NAME
 *
 * With `syncThreshold` a number (Phase 43 WI-F, BN9's active-policy mode): this mode
 * arbitrates ONLY between Synchronize and Crime, and ONLY when the sleeve is currently idle,
 * already synchronizing, or already committing a crime -- any OTHER deliberate task
 * (Recovery, Company, Faction, Bladeburner, Class, Infiltrate, Support) is still left alone,
 * unchanged deference.
 *   - idle: sync < threshold -> synchronize; sync >= threshold -> crime.
 *   - already synchronizing: sync >= threshold -> crime (it just crossed); else -> none.
 *   - already on crime: left alone (mirrors the default mode's crime deference -- once
 *     managed sync has been raised past the threshold it never needs to fall back below it,
 *     per docs/sleeve-grafting-reference.md, so there is no legitimate case this mode needs
 *     to interrupt a running crime to re-synchronize).
 *   {act: "synchronize", why}  -- assign Synchronize
 *   {act: "crime",        why}  -- assign CRIME_NAME
 *   {act: "none",          why}  -- leave it alone
 */
export function decideSleeveAction(taskNow, sync, syncThreshold) {
  if (syncThreshold === undefined) {
    if (taskNow === null || taskNow === undefined) {
      return { act: "crime", why: "idle -- no task at all" };
    }
    const kind = taskNow.type;
    if (kind === "CRIME") {
      // Already committing a crime. Leave it, even if it is a different crime than ours --
      // a human picking Homicide over Mug is a choice, not a fault.
      return { act: "none", why: "already on crime " + String(taskNow.crimeType) };
    }
    // Any other task (Recovery, Synchro, Class, Company, Faction, Bladeburner, Infiltrate,
    // Support) is somebody's deliberate call. Not ours to undo.
    return { act: "none", why: "deliberate non-crime task: " + String(kind) };
  }

  const kind = taskNow === null || taskNow === undefined ? null : taskNow.type;

  if (kind === "CRIME") {
    return { act: "none", why: "already on crime " + String(taskNow.crimeType) };
  }

  if (kind === "SYNCHRO") {
    if (sync >= syncThreshold) {
      return { act: "crime", why: "sync " + sync + " crossed threshold " + syncThreshold + " while synchronizing" };
    }
    return { act: "none", why: "still synchronizing, sync " + sync + " < threshold " + syncThreshold };
  }

  if (kind === null) {
    if (sync >= syncThreshold) {
      return { act: "crime", why: "idle, sync " + sync + " >= threshold " + syncThreshold };
    }
    return { act: "synchronize", why: "idle, sync " + sync + " < threshold " + syncThreshold };
  }

  // Any other deliberate task (Recovery, Class, Company, Faction, Bladeburner, Infiltrate,
  // Support) -- this mode only arbitrates between Synchronize and Crime, nothing else.
  return { act: "none", why: "deliberate task, unaffected by syncThreshold mode: " + String(kind) };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // Phase 43 WI-F: optional syncThreshold from ns.args[0] -- absent (undefined) preserves the
  // legacy default-off behaviour for every existing call site.
  const thresholdArg = Number(ns.args[0]);
  const syncThreshold = Number.isFinite(thresholdArg) ? thresholdArg : undefined;

  let count = 0;
  try {
    count = ns.sleeve.getNumSleeves();
  } catch (err) {
    ns.tprint("sleevemanager: getNumSleeves threw -- not in a node with sleeves? " + String(err).slice(0, 120));
    return;
  }
  ns.tprint("sleevemanager: managing " + count + " sleeve(s), crime=" + CRIME_NAME + ", cycle=" + CYCLE_MS +
    "ms" + (syncThreshold !== undefined ? ", syncThreshold=" + syncThreshold : ""));

  for (;;) {
    const paused = ns.fileExists(PAUSE_FILE, "home");
    const snap = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      paused,
      crimeName: CRIME_NAME,
      syncThreshold: syncThreshold === undefined ? null : syncThreshold,
      numSleeves: count,
      sleeves: [],
    };

    for (let i = 0; i < count; i++) {
      const row = { index: i };
      try {
        const info = ns.sleeve.getSleeve(i);
        row.sync = info.sync;
        row.shock = info.shock;
        row.memory = info.memory;
        row.storedCycles = info.storedCycles;
        row.city = info.city;
        row.hp = info.hp ? info.hp.current + "/" + info.hp.max : null;
        row.skills = {
          strength: info.skills.strength,
          defense: info.skills.defense,
          dexterity: info.skills.dexterity,
          agility: info.skills.agility,
        };
        // Shock must be EXACTLY 0 before any sleeve aug can be bought
        // (sleeve-grafting-reference.md section 5). Surfaced, never acted on -- buying
        // resets the sleeve's stats, so it is Kenneth's call, not a chore.
        row.augReady = info.shock === 0;

        const taskNow = ns.sleeve.getTask(i);
        row.task = taskNow ? { type: taskNow.type, crimeType: taskNow.crimeType || null } : null;

        const decision = decideSleeveAction(taskNow, info.sync, syncThreshold);
        row.decision = decision.act;
        row.why = decision.why;

        if (decision.act === "crime" && !paused) {
          const ok = ns.sleeve.setToCommitCrime(i, CRIME_NAME);
          // Never trust a setter's return value -- verify against getTask
          // (the standing rule; bladeburner.startAction is on record returning true
          // while getCurrentAction read null across 60 samples).
          const after = ns.sleeve.getTask(i);
          row.assignReturned = ok;
          row.assignVerified = !!(after && after.type === "CRIME");
          row.task = after ? { type: after.type, crimeType: after.crimeType || null } : null;
          if (!row.assignVerified) {
            ns.tprint("sleevemanager: WARN sleeve " + i + " would not take " + CRIME_NAME +
              " (returned " + ok + ", getTask still " + (after ? after.type : "null") + ")");
          } else {
            ns.tprint("sleevemanager: sleeve " + i + " -> " + CRIME_NAME);
          }
        } else if (decision.act === "synchronize" && !paused) {
          // Phase 43 WI-F: setToSynchronize returns void, not boolean (sleeve-grafting-
          // reference.md Section 3) -- there is nothing to ignore, but verification against
          // getTask still applies (the standing "verify, don't trust a setter" rule).
          ns.sleeve.setToSynchronize(i);
          const after = ns.sleeve.getTask(i);
          row.assignVerified = !!(after && after.type === "SYNCHRO");
          row.task = after ? { type: after.type, crimeType: after.crimeType || null } : null;
          if (!row.assignVerified) {
            ns.tprint("sleevemanager: WARN sleeve " + i + " would not take Synchronize" +
              " (getTask reads " + (after ? after.type : "null") + ")");
          } else {
            ns.tprint("sleevemanager: sleeve " + i + " -> Synchronize (sync " + info.sync +
              " < threshold " + syncThreshold + ")");
          }
        }
      } catch (err) {
        row.error = String(err).slice(0, 200);
      }
      snap.sleeves.push(row);
    }

    ns.write(STATE_FILE, JSON.stringify(snap, null, 1), "w");
    await ns.sleep(CYCLE_MS);
  }
}
