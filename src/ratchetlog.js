// Phase 25 Slice 0 -- aug-ratchet instrumentation. Standalone, headless
// (no tail; emits to a log file per Phase 24's observability convention).
// Purpose: capture the buy/install/grind-rep ratchet's real numbers so the
// Phase 25 install-trigger is built from measured data, not first-principles
// math (the "vibes-with-equations" trap). Every install between now and the
// finished controller is a data point that can't be back-filled -- this
// starts the clock.
//
// What it records: on each install boundary (ns.getResetInfo().lastAugReset
// changes) it writes a paired {pre, post} cycle record -- mults.hacking
// before/after, hack level+exp, augs installed/queued, NFG level, per-faction
// rep+favor, money. The re-climb curve is derivable by correlating installTime
// against the daemon's existing hackProgress series (daemon-batch-log.json).
//
// Install-survival: the install soft-reset kills this script. So each poll
// persists the current snapshot to LAST_FILE; the daemon relaunches this
// companion post-reset, and the first poll after restart sees the persisted
// pre-install snapshot's lastAugReset != the current one and records the
// boundary it "missed" while dead. (Up to POLL_MS of staleness on the pre
// snapshot -- fine; mult only moves on a buy.)
//
// RAM: Singularity companion (getOwnedAugmentations / getFactionRep /
// getFactionFavor), 1x at SF4.3. Launched via daemon.launchDetached, which
// skips it if home can't fit it (non-fatal) -- same contract as the others.

import { tprintTs } from "./common.js";

const POLL_MS = 30_000;
const LOG_FILE = "ratchet-log.json"; // append-only array of install-cycle records
const LAST_FILE = "ratchet-last.json"; // rolling latest snapshot (install-survival)
const NFG_NAME = "NeuroFlux Governor";

function readJSON(ns, file) {
  const raw = ns.read(file);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Full player + faction state snapshot. Throws if Singularity is unavailable. */
function snapshot(ns) {
  const player = ns.getPlayer();
  const reset = ns.getResetInfo();
  const ownedAll = ns.singularity.getOwnedAugmentations(true);
  const ownedInstalled = ns.singularity.getOwnedAugmentations(false);
  const nfgLevel = ownedInstalled.filter((a) => a === NFG_NAME).length;

  const factionState = {};
  for (const f of player.factions) {
    factionState[f] = {
      rep: ns.singularity.getFactionRep(f),
      favor: ns.singularity.getFactionFavor(f),
    };
  }

  return {
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString(),
    lastAugReset: reset.lastAugReset,
    hackLevel: player.skills.hacking,
    hackExp: player.exp.hacking,
    money: player.money,
    mults: {
      hacking: player.mults.hacking,
      hacking_exp: player.mults.hacking_exp,
      faction_rep: player.mults.faction_rep,
    },
    augsInstalled: ownedInstalled.length,
    augsQueued: ownedAll.length - ownedInstalled.length,
    nfgLevel,
    factions: factionState,
  };
}

function appendRecord(ns, record) {
  const existing = readJSON(ns, LOG_FILE) ?? [];
  existing.push(record);
  ns.write(LOG_FILE, JSON.stringify(existing, null, 2), "w");
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // Persisted pre-install snapshot survives an install that killed us mid-run.
  let last = readJSON(ns, LAST_FILE);
  let installCount = (readJSON(ns, LOG_FILE) ?? []).length;
  let proven = false;

  while (true) {
    let snap;
    try {
      snap = snapshot(ns);
      proven = true;
    } catch (e) {
      if (!proven) {
        // First call failed => no SF4 this run. Nothing to instrument; exit quietly.
        tprintTs(ns, `WARN: Singularity unavailable (${e?.message ?? e}) -- ratchetlog exiting`);
        return;
      }
      tprintTs(ns, `WARN: snapshot threw (${e?.message ?? e}) -- retry next poll`);
      await ns.sleep(POLL_MS);
      continue;
    }

    if (last && snap.lastAugReset !== last.lastAugReset) {
      installCount += 1;
      appendRecord(ns, {
        install: installCount,
        installTime: snap.timestamp,
        installTimeLabel: snap.time,
        deltaMultHacking: snap.mults.hacking - last.mults.hacking,
        augsActivated: last.augsQueued, // queued pre-install => installed this boundary
        pre: last,
        post: snap,
      });
      tprintTs(
        ns,
        `RATCHET: install #${installCount} -- mult.hacking ${last.mults.hacking.toFixed(3)} -> ${snap.mults.hacking.toFixed(3)}, ` +
          `level ${last.hackLevel} -> ${snap.hackLevel}, ${last.augsQueued} aug(s) activated`,
      );
    }

    last = snap;
    ns.write(LAST_FILE, JSON.stringify(snap), "w");
    await ns.sleep(POLL_MS);
  }
}
