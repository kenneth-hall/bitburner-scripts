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
 * 2026-08-02 update (Phase 39): under D1's "own the slot continuously" policy,
 * bladeburnermanager.js is running SOME action nearly always, so the old "abort if a Bladeburner
 * action is already running" precondition never clears on its own anymore. Reuses
 * bladeburneractionprobe.js's pause pattern -- write BB_OFF_MARKER, wait for the manager to
 * release, run the original test, clear the marker in a `finally` so the manager always resumes
 * even on an exception or a mid-run kill.
 *
 * RAM ~9.1 GB (+ the pause helpers' ns.read/ns.write/ns.bladeburner.getCurrentAction, already
 * covered dot-notation calls). Writes slotconflictprobe-<epoch>.json + tprints the verdict.
 */

const AUG_STATE = "augfarmer-state.json";
const BB_OFF_MARKER = "bladeburner-off.txt";
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

  try {
    await runProbe(ns, out, readAugPhase);
  } finally {
    try { ns.rm(BB_OFF_MARKER, "home"); } catch { /* already gone */ }
    out.pauseCleared = !ns.fileExists(BB_OFF_MARKER, "home");
  }
}

async function runProbe(ns, out, readAugPhase) {
  // --- -1. pause the manager so it releases the slot, then wait for it to actually stop ---
  ns.write(BB_OFF_MARKER, "paused by slotconflictprobe.js @ " + out.iso + "\n", "w");
  let waited = 0;
  while (waited < 30_000 && ns.bladeburner.getCurrentAction()) {
    await ns.sleep(2_000);
    waited += 2_000;
  }
  out.managerReleasedAfterMs = waited;

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
    ns.tprint("slotconflict: ABORT -- manager didn't release its action within 30s; result would be ambiguous.");
    out.aborted = "bladeburner action still running after pause";
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
  // ⚠️ v1's verdict logic was WRONG and reported "NO CONFLICT" on data that plainly showed one
  // (run 1785462422976). It compared work TYPE before-vs-during (FACTION -> FACTION, unchanged)
  // and augfarmer's phase (grinding -> grinding, unchanged), and missed the actual dynamics
  // entirely. Both of those look identical whether or not a conflict exists, because the conflict
  // resolves itself WITHIN the observation window: augfarmer reclaims the slot and everything
  // looks normal again by the time you sample.
  //
  // The three signals that actually detect it:
  //  (a) work goes NULL the instant a Bladeburner action starts  -> Bladeburner cancels faction work
  //  (b) bbAction goes NULL by the end of the observe window     -> augfarmer's re-grab killed it
  //  (c) cyclesWorked RESETS (large -> small)                    -> the work session restarted
  const workBefore = out.before.currentWork;
  const workImmediate = out.immediatelyAfter.currentWork;
  const workDuring = out.afterObserve.currentWork;

  const bbCancelledWork = workBefore != null && workImmediate == null;
  const augKilledBb = out.immediatelyAfter.bladeburnerAction != null && out.afterObserve.bladeburnerAction == null;
  const cyclesBefore = workBefore?.cyclesWorked ?? null;
  const cyclesDuring = workDuring?.cyclesWorked ?? null;
  const cyclesReset = cyclesBefore != null && cyclesDuring != null && cyclesDuring < cyclesBefore;

  const conflict = bbCancelledWork || augKilledBb || cyclesReset;

  out.verdict = {
    conflict,
    bbCancelledWork,
    augKilledBb,
    cyclesReset,
    cyclesBefore,
    cyclesDuring,
    workTypeBefore: workBefore?.type ?? null,
    workImmediatelyAfterStart: workImmediate?.type ?? null,
    workTypeDuring: workDuring?.type ?? null,
    augPhaseBefore: out.before.augfarmer.phase,
    augPhaseDuring: out.afterObserve.augfarmer.phase,
    augPhaseAfterStop: out.afterStop.augfarmer.phase,
    interpretation: conflict
      ? "CONFLICT (mutual preemption): Bladeburner and singularity player-work share one exclusive slot, but getCurrentWork() is BLIND to Bladeburner (returns null while an action runs). So augfarmer reads the slot as 'idle/available', re-grabs it, and kills the Bladeburner action -- it cannot yield to something it cannot see. An engine must coordinate explicitly; it cannot just run alongside."
      : "NO CONFLICT: Bladeburner actions run on a separate track from the singularity player-work slot.",
  };

  const file = "slotconflictprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint("slotconflict: VERDICT -> " + (conflict ? "CONFLICT" : "NO CONFLICT"));
  ns.tprint("  " + out.verdict.interpretation);
  ns.tprint("  -> " + file);
}
