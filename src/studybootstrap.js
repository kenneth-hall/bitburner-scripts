// Post-install XP kick. One-shot: the moment after an augment install the
// character sits at hacking level 1 with a wiped fleet and no port openers, so
// the money batcher / xpfarm.js have almost nothing to grind and the player's
// hacking level can idle at ~1 for hours (observed 2026-07-12: ~1-2h stuck at
// level 1 post-install). This converts that dead time into hacking XP by
// throwing the character into Rothman University's Computer Science class.
//
// Deliberately minimal (scoped with Kenneth 2026-07-12): "if hacking is low,
// join the class -- no leaving." It does NOT stop the class or hand back to the
// batcher; studying runs indefinitely (it only holds the single player-action
// slot, which nothing else contends for post-install -- the fleet's scripts run
// independently). A stop/handoff crossover is explicitly future work.
//
// Trigger is `hack < HACK_THRESHOLD`, not `== 1`: a stray bootloop weaken can
// bump you to level 2-3 before this first runs, and an exact-equals-1 check
// would then miss the post-install window it exists to catch. Once studying
// lifts you past the threshold the one-shot simply never fires again on later
// daemon restarts.
//
// Launched by daemon.js at startup via launchDetached (exec-by-filename, same
// Singularity-isolation pattern as procureprograms.js) -- universityCourse
// carries the Singularity RAM multiplier, so an exec/fit failure here is an
// expected home-RAM outcome, not a bug. Also runnable by hand.
//
// City: after an install you land in Sector-12, which is Rothman's city, so no
// travel is needed (travelToCity costs ~$200k and post-install money is ~$1k --
// see the post-install-landing-city note). If somehow not in Sector-12 this
// skips rather than spending to travel.
//
// Missing-Source-File fail-safe: universityCourse is Singularity-gated and
// throws (not returns false) without SF4, exactly like procureprograms.js's
// purchase calls. getResetInfo (1 GB, not itself gated) short-circuits the
// common no-SF4 case up front; the try/catch is a backstop for anything that
// check doesn't cover.

import { tprintTs } from "./common.js";

const HACK_THRESHOLD = 10;
const UNIVERSITY = "Rothman University";
const COURSE = "Computer Science";
const CITY = "Sector-12";

/** getResetInfo (1 GB, not Singularity-gated) reports active Source-Files, so
 * the common no-SF4 case never touches the throwing universityCourse call. */
function hasSourceFile4(ns) {
  return (ns.getResetInfo().ownedSF.get(4) ?? 0) > 0;
}

/** @param {NS} ns */
export async function main(ns) {
  const hack = ns.getHackingLevel();
  // Silent no-op: past the post-install window (the common case on every daemon
  // restart), there's nothing to announce. Only the actual study action, or a
  // genuine can't-act diagnostic below, is worth a terminal line.
  if (hack >= HACK_THRESHOLD) return;

  if (!hasSourceFile4(ns)) {
    tprintTs(ns, "INFO: studybootstrap skipped -- Source-File 4 not active (can't drive university via Singularity)");
    return;
  }

  const city = ns.getPlayer().city;
  if (city !== CITY) {
    tprintTs(ns, `INFO: studybootstrap skipped -- in ${city}, not ${CITY} (won't spend ~$200k to travel to ${UNIVERSITY})`);
    return;
  }

  let started;
  try {
    // focus: false -- ~80% XP but no UI hijack; this is a background kick, not
    // an action Kenneth is watching.
    started = ns.singularity.universityCourse(UNIVERSITY, COURSE, false);
  } catch (e) {
    tprintTs(ns, `WARN: universityCourse threw -- Singularity unavailable right now (${e?.message ?? e})`);
    return;
  }

  if (started) {
    tprintTs(ns, `STUDYBOOTSTRAP: hacking ${hack} < ${HACK_THRESHOLD} -- started ${COURSE} at ${UNIVERSITY} (unfocused)`);
  } else {
    tprintTs(ns, `WARN: universityCourse(${UNIVERSITY}, ${COURSE}) returned false -- not studying`);
  }
}
