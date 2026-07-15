// Phase 25 -- the one file allowed to call ns.singularity.installAugmentations.
// Exec'd only from augfarmer.js's auto-mode branch (S10 step 2, a raw
// ns.exec("installer.js", "home", 1) -- never via launchDetached/daemon.js,
// so this file's Singularity + upgrade-cost surface never bundles into the
// batcher). Refuses to act unless ratchet-mode.txt reads exactly "auto" at
// the moment it starts -- defense in depth against a stray manual
// `run installer.js` in observe mode (S10 step 3).
//
// Sequence: re-verify mode -> max home RAM (recordTransaction per tier,
// source home-ram-upgrade) -> max home cores (source home-cores-upgrade,
// hardware after augs -- mult is the node-clearing lever and money is about
// to vanish either way) -> one final decision record -> installAugmentations
// with cbScript "bootstrap.js" (the canonical cold-start entry; home RAM/
// cores persist across the install per docs/reset-protocol.md, so the
// handoff is immediate). Control should never return after that call (it
// can't-happen given augfarmer's queuedCount>=1 gate) -- if it does, WARN
// and exit rather than looping.
//
// Import discipline (spec S1/ground rules): only common.js/translog.js --
// never augfarmer.js, never daemon.js -- so this file's RAM footprint is
// self-contained and this stays the *only* installAugmentations call site
// (grep -rn installAugmentations src/ must match only here).
//
// RAM: derived ~16 GB at SF4.3's 1x multiplier (spec S12: base 1.6 +
// installAugmentations 5 + RAM/cores upgrade set (~9) + getPlayer 0.5 +
// read/write 0). Acceptance band 12-22 GB -- measure via `ramcheck.js` and
// record here once live.

import { tprintTs } from "./common.js";
import { recordTransaction } from "./translog.js";

const RATCHET_MODE_FILE = "ratchet-mode.txt";
const DECISIONS_FILE = "ratchet-decisions.json";
const DECISIONS_CAP = 500;

function readJSON(ns, file) {
  const raw = ns.read(file);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function appendDecision(ns, kind, detail) {
  const now = Date.now();
  const record = { timestamp: now, time: new Date(now).toLocaleTimeString(), kind, mode: "auto", source: "installer.js", detail };
  const existing = readJSON(ns, DECISIONS_FILE) ?? [];
  existing.push(record);
  while (existing.length > DECISIONS_CAP) existing.shift();
  ns.write(DECISIONS_FILE, JSON.stringify(existing, null, 2), "w");
}

/** @param {NS} ns */
export async function main(ns) {
  const modeRaw = ns.read(RATCHET_MODE_FILE);
  if (modeRaw?.trim() !== "auto") {
    tprintTs(ns, `WARN: installer.js run but ${RATCHET_MODE_FILE} doesn't read "auto" -- refusing to act (observe mode is the default rail)`);
    return;
  }

  const ramPurchases = [];
  while (true) {
    const cost = ns.singularity.getUpgradeHomeRamCost();
    if (ns.getPlayer().money < cost) break;
    if (!ns.singularity.upgradeHomeRam()) break;
    ramPurchases.push(cost);
    recordTransaction(ns, {
      type: "expense",
      source: "home-ram-upgrade",
      newRamGb: ns.getServerMaxRam("home"),
      amount: cost,
      timestamp: Date.now(),
      time: new Date().toLocaleTimeString(),
    });
  }
  if (ramPurchases.length > 0) {
    tprintTs(ns, `RATCHET: bought ${ramPurchases.length} home RAM tier(s) for $${ns.format.number(ramPurchases.reduce((a, b) => a + b, 0))} -- home is now ${ns.format.ram(ns.getServerMaxRam("home"))}`);
  }

  const coresPurchases = [];
  while (true) {
    const cost = ns.singularity.getUpgradeHomeCoresCost();
    if (ns.getPlayer().money < cost) break;
    if (!ns.singularity.upgradeHomeCores()) break;
    coresPurchases.push(cost);
    recordTransaction(ns, {
      type: "expense",
      source: "home-cores-upgrade",
      newCores: ns.getServer("home").cpuCores,
      amount: cost,
      timestamp: Date.now(),
      time: new Date().toLocaleTimeString(),
    });
  }
  if (coresPurchases.length > 0) {
    tprintTs(ns, `RATCHET: bought ${coresPurchases.length} home core tier(s) for $${ns.format.number(coresPurchases.reduce((a, b) => a + b, 0))} -- home now has ${ns.getServer("home").cpuCores} core(s)`);
  }

  const player = ns.getPlayer();
  appendDecision(ns, "install", {
    ramTiersBought: ramPurchases.length,
    coreTiersBought: coresPurchases.length,
    homeRamGb: ns.getServerMaxRam("home"),
    homeCores: ns.getServer("home").cpuCores,
    money: player.money,
    multsHacking: player.mults.hacking,
    hackLevel: player.skills.hacking,
  });

  tprintTs(ns, "RATCHET: installing augmentations now -- bootstrap.js will relaunch the fleet post-reset");
  ns.singularity.installAugmentations("bootstrap.js");

  // Unreachable given augfarmer's queuedCount>=1 gate -- the game only
  // skips the reset when nothing is queued.
  tprintTs(ns, "WARN: installAugmentations returned control -- no queued augmentations? exiting without resetting");
}
