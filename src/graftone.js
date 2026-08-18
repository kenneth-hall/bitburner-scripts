/**
 * graftone.js - graft exactly ONE augmentation, with the before/after capture that
 * phase-41-bn10-entry.spec.md's L2 gate requires.
 *
 * WHY A ONE-SHOT RATHER THAN THE ENGINE. bn10entry.js exists and is unit-tested, but its LIVE
 * LOOP has never run. Phase 40's durable lesson is that a mechanism can be wrong while the code
 * is right -- its pure functions passed every test while the live loop never fed them. Grafting
 * charges money UP FRONT and accumulates Entropy that only an install clears, so the first one
 * is deliberately hand-driven and measured before anything unattended is trusted with $589m.
 *
 * WHAT L2 NEEDS ANSWERED, none of which is currently known:
 *   1. Does ns.getPlayer().mults ALREADY include the entropy debuff? If it does, graftplanner.js
 *      double-counts it and compounds the error on every replan.
 *   2. Is the reported graft time the real duration? markdown/bitburner.grafting.md says
 *      explicitly: "Do not use this value to determine when the ongoing grafting finishes."
 *      The whole choice of how many grafts to buy rests on that number.
 *   3. Does graft PRICE escalate with grafts already taken, the way purchased-aug price does
 *      (x1.9)? The ladder sums independent price reads and would be wrong if it does.
 *
 * Usage: run graftone.js "Aug Name"          -- grafts it
 *        run graftone.js "Aug Name" dry      -- captures + prices, grafts nothing
 *
 * Travels to New Tokyo first (graftAugmentation errors elsewhere). Verifies the start via
 * getCurrentWork(), never the return value -- the standing rule, with startAction as precedent.
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

import { recordTransaction } from "./translog.js";

const GRAFT_CITY = "New Tokyo";
const STATS = ["strength", "defense", "dexterity", "agility"];

function snapshot(ns, label) {
  const p = ns.getPlayer();
  const snap = { label, ts: Date.now(), iso: new Date().toISOString(), city: p.city,
    money: p.money, entropy: p.entropy, mults: {}, exp: {}, levels: {} };
  for (const s of STATS) {
    snap.mults[s] = p.mults[s];
    snap.exp[s] = p.exp[s];
    snap.levels[s] = p.skills[s];
  }
  return snap;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const augName = ns.args[0];
  const dryRun = ns.args.includes("dry");
  if (!augName || typeof augName !== "string") {
    ns.tprint("graftone: ABORT -- needs an augmentation name as arg 0");
    return;
  }

  const rec = { ts: Date.now(), aug: augName, dryRun };
  const flush = () => ns.write("graftone-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  rec.before = snapshot(ns, "before");
  rec.projectedPrice = ns.grafting.getAugmentationGraftPrice(augName);
  rec.projectedTimeMs = ns.grafting.getAugmentationGraftTime(augName);
  rec.projectedTimeHours = rec.projectedTimeMs / 3600000;
  rec.ownedBefore = ns.singularity.getOwnedAugmentations(true).includes(augName);
  flush();

  if (rec.ownedBefore) {
    ns.tprint("graftone: ABORT -- '" + augName + "' is already owned/grafted.");
    return;
  }
  if (rec.before.money < rec.projectedPrice) {
    ns.tprint("graftone: ABORT -- need $" + ns.format.number(rec.projectedPrice) +
      ", have $" + ns.format.number(rec.before.money));
    return;
  }

  ns.tprint("graftone: " + augName + " -- $" + ns.format.number(rec.projectedPrice) +
    " / " + rec.projectedTimeHours.toFixed(2) + "h projected | entropy " + rec.before.entropy +
    " | mult(str) " + rec.before.mults.strength.toFixed(4));

  if (dryRun) {
    rec.result = "dry-run";
    flush();
    ns.tprint("graftone: DRY RUN -- nothing grafted. -> graftone-" + rec.ts + ".json");
    return;
  }

  if (rec.before.city !== GRAFT_CITY) {
    const moved = ns.singularity.travelToCity(GRAFT_CITY);
    rec.travelAttempted = true;
    rec.travelReturned = moved;
    rec.cityAfterTravel = ns.getPlayer().city;
    if (rec.cityAfterTravel !== GRAFT_CITY) {
      rec.result = "travel-failed";
      flush();
      ns.tprint("graftone: ABORT -- could not reach " + GRAFT_CITY + " (in " + rec.cityAfterTravel + ")");
      return;
    }
  }

  const moneyPreGraft = ns.getPlayer().money;
  const startedMs = Date.now();
  rec.callReturned = ns.grafting.graftAugmentation(augName, true);

  // Verify with getCurrentWork(), never the return value.
  await ns.sleep(1200);
  const workNow = ns.singularity.getCurrentWork();
  rec.verifiedWorkType = workNow ? workNow.type : null;
  rec.verifiedStarted = !!workNow && workNow.type === "GRAFTING";
  rec.realisedPrice = moneyPreGraft - ns.getPlayer().money;
  rec.priceMatchesProjection = Math.abs(rec.realisedPrice - rec.projectedPrice) < 1e6;
  flush();

  if (!rec.verifiedStarted) {
    rec.result = "start-unverified";
    flush();
    ns.tprint("graftone: WARN -- call returned " + rec.callReturned +
      " but getCurrentWork() reads " + rec.verifiedWorkType + ". NOT grafting.");
    return;
  }

  recordTransaction(ns, {
    type: "expense", source: "graft", amount: rec.realisedPrice,
    detail: augName + " (phase-41 BN10 entry)",
  });

  ns.tprint("graftone: STARTED. realised price $" + ns.format.number(rec.realisedPrice) +
    (rec.priceMatchesProjection ? " (matches projection)" : " (DIFFERS from projection!)"));
  ns.tprint("  waiting for completion -- projected " + rec.projectedTimeHours.toFixed(2) + "h");

  // Poll to completion so realised DURATION is measured against the projection.
  while (true) {
    await ns.sleep(10000);
    const w = ns.singularity.getCurrentWork();
    if (!w || w.type !== "GRAFTING") break;
  }
  rec.realisedMs = Date.now() - startedMs;
  rec.realisedHours = rec.realisedMs / 3600000;
  rec.durationRatio = rec.realisedMs / rec.projectedTimeMs;
  rec.after = snapshot(ns, "after");
  rec.ownedAfter = ns.singularity.getOwnedAugmentations(true).includes(augName);
  rec.entropyDelta = rec.after.entropy - rec.before.entropy;
  rec.multDeltas = {};
  for (const s of STATS) rec.multDeltas[s] = rec.after.mults[s] / rec.before.mults[s];
  rec.result = rec.ownedAfter ? "grafted" : "completed-but-not-owned";
  flush();

  ns.tprint("graftone: " + rec.result.toUpperCase());
  ns.tprint("  entropy " + rec.before.entropy + " -> " + rec.after.entropy +
    " (delta " + rec.entropyDelta + ", expected +1)");
  ns.tprint("  duration realised " + rec.realisedHours.toFixed(2) + "h vs projected " +
    rec.projectedTimeHours.toFixed(2) + "h  (ratio " + rec.durationRatio.toFixed(3) + ")");
  ns.tprint("  mult deltas: " + STATS.map((s) => s.slice(0, 3) + " x" + rec.multDeltas[s].toFixed(4)).join(", "));
  ns.tprint("  levels: " + STATS.map((s) => rec.before.levels[s] + "->" + rec.after.levels[s]).join(", "));
  ns.tprint("  -> graftone-" + rec.ts + ".json");
}
