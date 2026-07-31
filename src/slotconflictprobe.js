/**
 * slotconflictprobe.js - Phase 38's BLOCKER test: does a running Bladeburner action occupy the
 * same player-action slot augfarmer.js uses for faction rep work?
 *
 * Why it matters: slotAvailable() (augfarmer.js:711) yields on ANY getCurrentWork() type that
 * isn't CLASS or own-faction FACTION. If a Bladeburner action surfaces there, the aug ratchet
 * permanently yields -> rep grind stops -> the hacking path's aug->M pipeline stalls. That would
 * put a Bladeburner engine in direct conflict with the actual BN6 win path.
 *
 * ⚠️ MUTATING (starts a Bladeburner action) -- run only with an explicit go-ahead, not under the
 * standing read-only data-gathering grant. Kept minimal and SELF-CLEANING: it picks Field Analysis
 * (a General action -- always 100% success, no rank loss, no contract/op count consumed), observes,
 * then calls stopBladeburnerAction() to restore the status quo before exiting.
 *
 * Requires augfarmer.js to be RUNNING and in its "grinding" phase for the observation to mean
 * anything -- the probe checks that up front and refuses if not.
 *
 * RAM ~9.1 GB. Writes slotconflictprobe-<epoch>.json + tprints the verdict.
 */

const AUG_STATE = "augfarmer-state.json";
const OBSERVE_MS = 25_000; // augfarmer polls ~10s; this gives it 2+ passes to react
const RECOVER_MS = 20_000; // and the same again to observe it resuming after we stop

export async function main(ns) {
  ns.disableLog("ALL");
  const out = { ts: Date.now(), iso: new Date().toISOString(), note: "Phase 38 blocker: bladeburner vs player action slot" };

  const readAugPhase = () => {
    const raw = ns.read(AUG_STATE);
    if (!raw) return { phase: null, ageSec: null, note: "no state file" };
    try {
      const s = JSON.parse(raw);
      return { phase: s.phase, workTarget: s.workTarget ?? null, ageSec: (Date.now() - s.timestamp) / 1000 };
    } catch (e) { return { phase: null, ageSec: null, note: "unparseable: " + String(e).slice(0, 80) }; }
  };

  // --- 0. preconditions ---
  out.before = {
    currentWork: ns.singularity.getCurrentWork(),
    bladeburnerAction: ns.bladeburner.getCurrentAction(),
    augfarmer: readAugPhase(),
  };
  ns.tprint("slotconflict: BEFORE  work=" + JSON.stringify(out.before.currentWork) +
    "  bbAction=" + JSON.stringify(out.before.bladeburnerAction) +
    "  augPhase=" + out.before.augfarmer.phase);

  if (out.before.bladeburnerAction) {
    ns.tprint("slotconflict: ABORT -- a Bladeburner action is already running; result would be ambiguous.");
    out.aborted = "bladeburner action already running";
    ns.write("slotconflictprobe-" + out.ts + ".json", JSON.stringify(out, null, 2), "w");
    return;
  }

  // --- 1. start a harmless Bladeburner action ---
  out.started = ns.bladeburner.startAction("General", "Field Analysis");
  await ns.sleep(1000);
  out.immediatelyAfter = {
    currentWork: ns.singularity.getCurrentWork(),
    bladeburnerAction: ns.bladeburner.getCurrentAction(),
  };
  ns.tprint("slotconflict: STARTED Field Analysis (ok=" + out.started + ")  work=" +
    JSON.stringify(out.immediatelyAfter.currentWork) +
    "  bbAction=" + JSON.stringify(out.immediatelyAfter.bladeburnerAction));

  // --- 2. let augfarmer poll and react ---
  await ns.sleep(OBSERVE_MS);
  out.afterObserve = {
    currentWork: ns.singularity.getCurrentWork(),
    bladeburnerAction: ns.bladeburner.getCurrentAction(),
    augfarmer: readAugPhase(),
  };
  ns.tprint("slotconflict: AFTER " + (OBSERVE_MS / 1000) + "s  work=" + JSON.stringify(out.afterObserve.currentWork) +
    "  bbAction=" + JSON.stringify(out.afterObserve.bladeburnerAction) +
    "  augPhase=" + out.afterObserve.augfarmer.phase);

  // --- 3. restore the status quo ---
  ns.bladeburner.stopBladeburnerAction();
  await ns.sleep(RECOVER_MS);
  out.afterStop = {
    currentWork: ns.singularity.getCurrentWork(),
    bladeburnerAction: ns.bladeburner.getCurrentAction(),
    augfarmer: readAugPhase(),
  };
  ns.tprint("slotconflict: STOPPED, after " + (RECOVER_MS / 1000) + "s  work=" +
    JSON.stringify(out.afterStop.currentWork) +
    "  augPhase=" + out.afterStop.augfarmer.phase);

  // --- 4. verdict ---
  // The conflict exists if, while the Bladeburner action ran, EITHER the player work slot stopped
  // showing augfarmer's faction work, OR augfarmer itself flipped to "yielded".
  const workBefore = out.before.currentWork;
  const workDuring = out.afterObserve.currentWork;
  const workTypeChanged = (workBefore?.type ?? null) !== (workDuring?.type ?? null);
  const augYielded = out.afterObserve.augfarmer.phase === "yielded";
  const conflict = workTypeChanged || augYielded;

  out.verdict = {
    conflict,
    workTypeBefore: workBefore?.type ?? null,
    workTypeDuring: workDuring?.type ?? null,
    workTypeChanged,
    augPhaseBefore: out.before.augfarmer.phase,
    augPhaseDuring: out.afterObserve.augfarmer.phase,
    augYielded,
    augPhaseAfterStop: out.afterStop.augfarmer.phase,
    interpretation: conflict
      ? "CONFLICT: a Bladeburner action displaces/blocks augfarmer's faction rep work. A Bladeburner engine cannot run concurrently with the aug ratchet without duty-cycling."
      : "NO CONFLICT: Bladeburner actions run on a SEPARATE track from the singularity player-work slot. The engine can run concurrently with the aug ratchet.",
  };

  const file = "slotconflictprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint("slotconflict: VERDICT -> " + (conflict ? "CONFLICT" : "NO CONFLICT"));
  ns.tprint("  " + out.verdict.interpretation);
  ns.tprint("  -> " + file);
}
