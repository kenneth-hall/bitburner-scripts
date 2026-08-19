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
 *  - It does NOT override a deliberate non-crime assignment. If a human parks the sleeve on
 *    Shock Recovery or Synchronize, that is respected -- only IDLE is treated as a fault.
 *    Drop sleevemanager-pause.txt to stop it touching anything at all.
 *
 * WHY CRIME. The player's action slot is locked to Bladeburner, so combat exp is the one
 * thing the player cannot earn in parallel and a sleeve can. Sync is at 100, so exp transfers
 * at full rate, and Mug trains strength/defense/dexterity/agility at once. That matters right
 * now because the engine spends 37% of its actions on Hyperbolic Regeneration Chamber --
 * healing, because contracts hurt more than the player can absorb at combat 110.
 *
 * RAM: getNumSleeves 4 + getSleeve 4 + getTask 4 + setToCommitCrime 4 = 16 GB + base.
 * Deliberately lean -- every ns.sleeve method is 4 GB, so aug/price reads stay in the
 * existing one-shot sleeverecon.js rather than being folded in here.
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
 * Returns one of:
 *   {act: "none",   why}  -- leave it alone
 *   {act: "crime",  why}  -- assign CRIME_NAME
 */
export function decideSleeveAction(taskNow) {
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

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  let count = 0;
  try {
    count = ns.sleeve.getNumSleeves();
  } catch (err) {
    ns.tprint("sleevemanager: getNumSleeves threw -- not in a node with sleeves? " + String(err).slice(0, 120));
    return;
  }
  ns.tprint("sleevemanager: managing " + count + " sleeve(s), crime=" + CRIME_NAME + ", cycle=" + CYCLE_MS + "ms");

  for (;;) {
    const paused = ns.fileExists(PAUSE_FILE, "home");
    const snap = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      paused,
      crimeName: CRIME_NAME,
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

        const decision = decideSleeveAction(taskNow);
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
            ns.tprint("sleevemanager: sleeve " + i + " was idle -> " + CRIME_NAME);
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
