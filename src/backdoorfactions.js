// Post-reset companion: after an augmentation install resets hacking level
// (and invite eligibility), watches the named faction servers and installs
// their backdoors as soon as we qualify. Backdoor only -- no auto-join, for
// any faction; joining stays a manual player decision. Standalone script
// launched by daemon.js (same companion pattern as the monitors), never
// imported by anything, and the only file in this repo allowed Singularity
// calls -- without SF4, every ns.singularity.* call costs its base RAM x16,
// so keeping that cost isolated to a script that exits once its work is done
// (instead of daemon.js or anything it imports) is the whole point of this
// file existing separately.
//
// Scope guard: SERVER_TARGETS is exactly CSEC and avmnite-02h. Adding a
// target later should be a one-line constant change, not a redesign.
//
// RAM: measure and record the actual figure here after a live getScriptRam
// check (expected ~100GB -- three Singularity calls -- see the phase's
// handoff notes for the measured number). This is exactly why the daemon-side
// launch-retry mechanism exists: post-reset home RAM is smallest exactly
// when this script matters most.

import { findPath, tprintTs } from "./common.js";
import { tryRoot } from "./hosts.js";
import { recordEvent } from "./eventlog.js";

const SERVER_TARGETS = { CSEC: "CyberSec", "avmnite-02h": "NiteSec" };
const POLL_MS = 60_000;

/**
 * Pure. Classifies one target's backdoor/faction state so the poll loop's
 * side-effecting actions can be driven by a single testable decision.
 */
function classifyTarget({ backdoorInstalled, factionJoined, hackingLevel, requiredLevel, rooted }) {
  if (backdoorInstalled) return "done-backdoored";
  if (factionJoined) return "done-joined";
  if (hackingLevel >= requiredLevel && rooted) return "ready";
  return "waiting";
}

/**
 * Walks the terminal to `destination`, hop by hop via ns.singularity.connect
 * -- connect only reaches neighbors, so a distant target can't be jumped to
 * directly. Reads getCurrentServer fresh every call rather than trusting a
 * caller-remembered position, so a stranded half-walk self-corrects on the
 * next call. findPath's returned path is start-inclusive (element 0 is
 * wherever we already are) -- connecting to it would loop forever when
 * origin === destination, so every connect call skips element 0.
 */
function walkTo(ns, destination) {
  const current = ns.singularity.getCurrentServer();
  if (current === destination) return true;

  const path = findPath(ns, destination, current);
  if (path === null) return false;

  for (let i = 1; i < path.length; i++) {
    if (!ns.singularity.connect(path[i])) return false;
  }
  return true;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const done = new Set(); // server names whose classification reached a done-* state
  const lastClassification = new Map();
  const totalServerTargets = Object.keys(SERVER_TARGETS).length;

  while (true) {
    const player = ns.getPlayer();

    for (const [server, faction] of Object.entries(SERVER_TARGETS)) {
      if (done.has(server)) continue;

      const info = ns.getServer(server);
      const classification = classifyTarget({
        backdoorInstalled: info.backdoorInstalled === true,
        factionJoined: player.factions.includes(faction),
        hackingLevel: ns.getHackingLevel(),
        requiredLevel: info.requiredHackingSkill ?? 0,
        rooted: ns.hasRootAccess(server) || tryRoot(ns, server),
      });

      // tprint on classification CHANGES only -- a 60s cadence must not spam
      // the terminal every poll.
      if (classification !== lastClassification.get(server)) {
        lastClassification.set(server, classification);
        tprintTs(ns, `INFO: ${server} ${classification}`);
      }

      if (classification === "done-backdoored" || classification === "done-joined") {
        done.add(server);
        continue;
      }
      if (classification !== "ready") continue;

      const origin = ns.singularity.getCurrentServer();
      if (!walkTo(ns, server)) {
        tprintTs(ns, `WARN: failed to walk to ${server}`);
        walkTo(ns, origin);
        continue; // retry next poll
      }
      if (ns.singularity.getCurrentServer() !== server) {
        tprintTs(ns, `WARN: sanity check failed, not on ${server} after walk`);
        walkTo(ns, origin);
        continue; // retry next poll
      }

      // Residual terminal-hijack window: the install itself takes real time
      // during which the player's terminal sits on the target. A player
      // moving the terminal between the sanity check above and this await
      // is an accepted race -- not worth guarding against for a background
      // companion.
      await ns.singularity.installBackdoor();
      tprintTs(ns, `INFO: backdoor installed on ${server}`);
      recordEvent(ns, { type: "backdoor-installed", server });

      // A failed restore walk is a WARN, never a reason to treat the
      // install as failed -- the install itself already succeeded above.
      if (!walkTo(ns, origin)) {
        tprintTs(ns, `WARN: failed to restore terminal to ${origin}`);
      }
    }

    // Exit once every server target is done -- frees this script's
    // Singularity-sized RAM. killscripts.js sweeps it on daemon restart;
    // relaunch is idempotent because every check above re-derives state
    // fresh instead of trusting memory.
    if (done.size >= totalServerTargets) break;

    await ns.sleep(POLL_MS);
  }
}

export { classifyTarget, walkTo, SERVER_TARGETS };
