// Always-on companion, launched by daemon.js at startup alongside the other
// monitors. Owns faction-join detection for the whole playthrough: the
// backdoor script (backdoorfactions.js) exits once its targets are done and
// would miss any later join, so a dedicated watcher is the only thing that
// sees every join, however it happens (backdoor invite, hacknet production,
// manual acceptance in the UI). Never calls ns.exec; writes nothing but
// events via eventlog.js. Must stay Singularity-free -- unlike
// backdoorfactions.js, this script is meant to be cheap and always running.
//
// No tail window, unlike the other monitors -- there's nothing to watch
// minute-to-minute here (joins are rare), so tprintTs on each recorded event
// is the whole UI.
//
// Poll cadence is deliberately slow (POLL_MS = 10s, not 1s like the other
// monitors) since joins are rare and nothing here needs to feel live.

import { recordEvent, EVENTS_FILE } from "./eventlog.js";
import { tprintTs } from "./common.js";

const POLL_MS = 10_000;

/** Pure. Names present in `currentFactions` but not `previousFactions`. */
function newlyJoined(previousFactions, currentFactions) {
  const previous = new Set(previousFactions);
  return currentFactions.filter((f) => !previous.has(f));
}

/**
 * Pure. Current faction memberships with no `faction-joined` record in
 * `events` under `resetId` -- closes the downtime gap (joins that happened
 * while the watcher was down: a daemon-restart gap, a crash) and, on the
 * very first-ever run, records the save's pre-existing memberships.
 */
function missingJoinEvents(currentFactions, events, resetId) {
  const recorded = new Set(
    events.filter((e) => e.type === "faction-joined" && e.resetId === resetId).map((e) => e.faction)
  );
  return currentFactions.filter((f) => !recorded.has(f));
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const resetId = ns.getResetInfo().lastAugReset;
  let currentFactions = ns.getPlayer().factions;

  // Startup reconciliation: anything already joined this reset with no
  // recorded event gets logged now, flagged `late: true` -- its timestamp is
  // discovery time, not actual join time. That's what the flag means.
  const raw = ns.read(EVENTS_FILE);
  const events = raw ? JSON.parse(raw) : [];
  for (const faction of missingJoinEvents(currentFactions, events, resetId)) {
    recordEvent(ns, { type: "faction-joined", faction, late: true });
    tprintTs(ns, `INFO: faction-joined (late) ${faction}`);
  }

  let previousFactions = currentFactions;

  while (true) {
    await ns.sleep(POLL_MS);
    currentFactions = ns.getPlayer().factions;
    for (const faction of newlyJoined(previousFactions, currentFactions)) {
      recordEvent(ns, { type: "faction-joined", faction });
      tprintTs(ns, `INFO: faction-joined ${faction}`);
    }
    previousFactions = currentFactions;
  }
}

export { newlyJoined, missingJoinEvents };
