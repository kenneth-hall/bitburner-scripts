// Phase 22 -- auto-backdoor the four hacking-faction servers (surface
// invites, never join). Self-terminating Singularity fulfiller, the
// procureprograms.js model: launched by daemon.js at startup via
// launchDetached (exec-by-filename, never imported -- it's the only file
// besides procureprograms.js allowed Singularity calls), stays resident on a
// slow poll (POLL_MS = 60_000) while any of CSEC/avmnite-02h/I.I.I.I/
// run4theh111z is still unmet, and exits (closing its own tail) only once
// all four are permanently done -- "has something to do" means an unmet
// target still exists across the whole hacking climb (54 -> 542), not that
// an action is available this instant, so it must not exit on a lull (the
// daemon only launches companions at startup; nothing would relaunch it).
//
// The hard rail (absolute, not negotiable): this script installs backdoors
// only and never joins a faction on the player's behalf. Joining can
// permanently lock out mutually-exclusive factions -- Kenneth decides which
// invites to accept (docs/reset-protocol.md). Fulcrum (needs 250k company
// rep on top of the backdoor) and Daedalus/The-Cave (separate endgame flow)
// are out of scope by mechanic, not oversight -- see
// phase-22-autobackdoor.features.md.
//
// Terminal-hijack race (accepted, documented, not engineered against):
// installBackdoor() moves the player's terminal to the target and takes real
// time; the player manually moving the terminal between this script's sanity
// check and its installBackdoor call is a residual race the slow poll keeps
// rare. Save-and-restore the origin server around every batch of actions.
//
// No standing tail (S2): four rare events over a whole node don't justify a
// window -- deliberate deviation from the monitor-dashboard pattern. Status
// still goes to this script's own log every poll (ns.clearLog + ns.print) so
// a manually-opened tail is informative, and tprintTs fires only on
// classification changes plus one launch summary and one exit summary --
// never per-poll. ns.ui.closeTail() on exit is a 0 GB no-op when no tail is
// open, kept anyway so a manually-opened tail can't be left frozen (Phase 18
// clean-exit rule).
//
// RAM: measured 11 GB at SF4.3's 1x multiplier (ramcheck.js, 2026-07-12,
// logs/ramcheck-result.json) -- lands in phase-22-autobackdoor.spec.md S4's
// derived ~9-13 GB band; daemon.js read 16.3 GB in the same pass, flat vs.
// its known baseline (docs/phases/CHANGELOG.md), confirming the one added
// launchDetached line didn't touch the batcher's own RAM.
//
// Exec-by-filename, never imported: keeps every other script's RAM bundle
// free of this file's Singularity surface (see hot-path rule in CLAUDE.md).

import { findPath, tprintTs } from "./common.js";
import { tryRoot } from "./hosts.js";

const FACTION_TARGETS = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z"];
const POLL_MS = 60_000;
const STATUS_FILE = "backdoor-status.json";

/**
 * Pure. classifyTarget's phase-06 contract: backdoorInstalled wins
 * (undefined treated as false), then factionJoined, then eligibility. A
 * non-finite/missing requiredLevel can never be "ready" -- there's nothing
 * to compare hackingLevel against.
 */
export function classifyTarget({ backdoorInstalled, factionJoined, hackingLevel, requiredLevel, rooted }) {
  if (backdoorInstalled === true) return "done-backdoored";
  if (factionJoined === true) return "done-joined";
  if (Number.isFinite(requiredLevel) && hackingLevel >= requiredLevel && rooted) return "ready";
  return "waiting";
}

/**
 * Walks the terminal to `destination`, connecting hop-by-hop. Reads current
 * position fresh every call (never trusts a caller-remembered position, so a
 * stranded half-walk self-corrects next call). findPath returns a
 * start-inclusive path -- element 0 is where the player already is, so
 * connect is called on every element *after* the first (phase-06's cold
 * review caught the off-by-one of connecting to the start too). Returns
 * false on an unreachable destination or any failed connect, without
 * throwing -- caller decides how to treat that.
 * @param {NS} ns
 * @param {string} destination
 */
export function walkTo(ns, destination) {
  const current = ns.singularity.getCurrentServer();
  if (current === destination) return true;

  const path = findPath(ns, destination, current);
  if (path === null) return false;

  for (let i = 1; i < path.length; i++) {
    if (!ns.singularity.connect(path[i])) return false;
  }
  return true;
}

function writeStatus(ns, { hackingLevel, targets, allDone }) {
  const nowMs = Date.now();
  ns.write(
    STATUS_FILE,
    JSON.stringify(
      {
        timestamp: nowMs,
        time: new Date(nowMs).toLocaleTimeString(),
        hackingLevel,
        targets,
        allDone,
      },
      null,
      2,
    ),
    "w",
  );
}

/**
 * S7's two-tier throw handling, mirroring procureprograms.js's discovered
 * failure mode: installBackdoor/connect/getCurrentServer's only failure
 * signal is a throw, and "any throw exits" vs. "failures retry next poll"
 * can't both be the rule. A throw before the first successful Singularity
 * call is the no-SF4 sentinel (permanent this run -- print once, exit); a
 * throw after is by-definition transient game state (SF4 can't be revoked
 * mid-process), handled by each call site's own try/catch instead.
 */
function exitSingularityUnavailable(ns, callLabel, error) {
  tprintTs(ns, `WARN: ${callLabel} threw -- Singularity unavailable right now (${error?.message ?? error})`);
  ns.tprint("===== backdoorfactions summary =====");
  ns.tprint("  can't auto-backdoor yet -- exiting.");
  ns.ui.closeTail(); // Phase 18: clean exit shouldn't leave a frozen window behind
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const FactionName = ns.enums.FactionName;
  const FACTION_BY_SERVER = {
    CSEC: FactionName.CyberSec,
    "avmnite-02h": FactionName.NiteSec,
    "I.I.I.I": FactionName.TheBlackHand,
    run4theh111z: FactionName.BitRunners,
  };

  let singularityProven = false;
  let previousClassifications = {};
  let launchedSummary = false;

  while (true) {
    const timeLabel = new Date().toLocaleTimeString();
    const hackingLevel = ns.getHackingLevel();
    const joined = new Set(ns.getPlayer().factions);

    const rows = [];
    for (const server of FACTION_TARGETS) {
      const info = ns.getServer(server);
      const rooted = ns.hasRootAccess(server) || tryRoot(ns, server);
      const classification = classifyTarget({
        backdoorInstalled: info.backdoorInstalled,
        factionJoined: joined.has(FACTION_BY_SERVER[server]),
        hackingLevel,
        requiredLevel: info.requiredHackingSkill,
        rooted,
      });
      rows.push({ server, faction: FACTION_BY_SERVER[server], classification });
    }

    if (!launchedSummary) {
      tprintTs(
        ns,
        `LAUNCH: ${rows.map((r) => `${r.server}=${r.classification}`).join(", ")}`,
      );
      writeStatus(ns, { hackingLevel, targets: rows, allDone: rows.every((r) => r.classification.startsWith("done")) });
      launchedSummary = true;
      previousClassifications = Object.fromEntries(rows.map((r) => [r.server, r.classification]));
    } else {
      const changed = rows.filter((r) => previousClassifications[r.server] !== r.classification);
      if (changed.length > 0) {
        for (const r of changed) {
          tprintTs(ns, `CHANGE: ${r.server} -> ${r.classification}`);
        }
        writeStatus(ns, { hackingLevel, targets: rows, allDone: rows.every((r) => r.classification.startsWith("done")) });
        previousClassifications = Object.fromEntries(rows.map((r) => [r.server, r.classification]));
      }
    }

    const allDone = rows.every((r) => r.classification.startsWith("done"));
    if (allDone) {
      tprintTs(ns, "SUMMARY: all four faction servers done (backdoored or already joined) -- exiting");
      writeStatus(ns, { hackingLevel, targets: rows, allDone: true });
      ns.ui.closeTail();
      return;
    }

    const ready = rows.filter((r) => r.classification === "ready");
    if (ready.length > 0) {
      let origin;
      try {
        origin = ns.singularity.getCurrentServer();
        singularityProven = true;
      } catch (e) {
        if (!singularityProven) {
          exitSingularityUnavailable(ns, "getCurrentServer", e);
          return;
        }
        tprintTs(ns, `WARN: getCurrentServer threw mid-run (${e?.message ?? e}) -- retrying next poll`);
        origin = null;
      }

      if (origin !== null) {
        for (const r of ready) {
          try {
            if (!walkTo(ns, r.server)) {
              tprintTs(ns, `WARN: couldn't walk to ${r.server} -- retrying next poll`);
              continue;
            }
            singularityProven = true;
            if (ns.singularity.getCurrentServer() !== r.server) {
              tprintTs(ns, `WARN: sanity check failed after walking to ${r.server} -- retrying next poll`);
              continue;
            }
            await ns.singularity.installBackdoor();
            tprintTs(ns, `BACKDOOR: installed on ${r.server}`);
          } catch (e) {
            if (!singularityProven) {
              exitSingularityUnavailable(ns, `installBackdoor(${r.server})`, e);
              return;
            }
            tprintTs(ns, `WARN: action on ${r.server} threw (${e?.message ?? e}) -- retrying next poll`);
          }
        }

        try {
          walkTo(ns, origin);
        } catch (e) {
          tprintTs(ns, `WARN: couldn't restore origin server ${origin} (${e?.message ?? e})`);
        }
      }
    }

    ns.clearLog();
    ns.print(`===== backdoor factions @ ${timeLabel} =====`);
    ns.print(`hacking level: ${hackingLevel}`);
    for (const r of rows) ns.print(`  ${r.server} (${r.faction}): ${r.classification}`);

    await ns.sleep(POLL_MS);
  }
}
