/**
 * graftladder.js -- run the BN10 combat graft ladder unattended, serially, with rails.
 *
 * WHY. Measured 2026-08-19: BN10 rank ran at 19.05 rank/h with only 25.5% of wall time
 * producing rank. The other 75% is Hyperbolic Regeneration Chamber -- healing damage from
 * FAILED contracts. Commit 767f4c6 measured the mechanic: damage comes ONLY from failures,
 * regen is flat 2.00 HP/min, so one failure costs ~3.5 min of healing against a ~28s action.
 * Raising max HP is measured worthless (flat regen against a bigger pool). The lever is
 * FEWER FAILURES, which means more combat stat, which means grafting.
 *
 * WHY A RUNNER AND NOT SIX graftone.js CALLS. The ladder is ~6 serial grafts over ~7 hours,
 * and the game blocks terminal writes while a focused graft is running -- so driving it by
 * hand is six timed check-ins where a missed one just wastes wall clock. Three hand-driven
 * grafts (2 at the BN10 entry gate, 1 on 2026-08-19) all matched projected price and duration
 * to within 0.1% (priceMatchesProjection true; durationRatio 1.0007 / 1.0012 / 1.000), which
 * is what makes an unattended run defensible now and was not true before.
 *
 * THE TRAP THIS EXISTS TO AVOID. ns.grafting.getGraftableAugmentations() explicitly "does not
 * check your current money and prerequisite augmentations" -- so the graftrecon.js catalog
 * lists augs that CANNOT actually be grafted yet. A hardcoded ladder built off that list
 * (Graphene Bionic Arms Upgrade needs Bionic Arms, and so on) would fail partway with money
 * already spent on the augs before it. This runner resolves prerequisites live via
 * ns.singularity.getAugmentationPrereq and inserts any missing GRAFTABLE prereq ahead of its
 * dependent, rather than trusting an offline plan.
 *
 * RAILS, all of which abort the whole ladder rather than continue:
 *  - bladeburner-off.txt must exist. grafting cancels in-flight work AND charges up front, so
 *    if bladeburnermanager.js is live it will restart a Bladeburner action on top of a graft
 *    we already paid for. This is the fifth player-action-slot claimant (CLAUDE.md).
 *  - MAX_TOTAL_SPEND / MAX_TOTAL_HOURS cap the run.
 *  - a realised price that disagrees with the projection stops the run (the price model is
 *    the thing the whole plan is costed on).
 *  - start is verified with getCurrentWork(), never the boolean return -- the standing rule,
 *    with startAction as precedent.
 *  - an aug already owned is skipped, so a restart resumes instead of re-buying.
 *
 * Usage: run graftladder.js dry   -- resolve + print the plan, spend nothing
 *        run graftladder.js       -- execute
 *
 * Waits for an already-running graft to finish before starting, so it can be launched while
 * a hand-driven graft is still in flight.
 *
 * RAM: ~25 GB (singularity getOwnedAugmentations 5 + getAugmentationPrereq 5 + travelToCity 2
 * + getCurrentWork 0.5, grafting price/time/graft 3.75 each, getPlayer 0.5).
 *
 * ASCII-only (docs/dev-server.md -- new files are seeded by in-game wget, which mangles
 * non-ASCII punctuation into a parse error).
 */

import { recordTransaction } from "./translog.js";

const GRAFT_CITY = "New Tokyo";
const BB_OFF_MARKER = "bladeburner-off.txt";
const STATS = ["strength", "defense", "dexterity", "agility"];

// Ordered by combat-gain-per-HOUR, which is the binding constraint -- income runs ~$34.6b/h
// while the whole ladder costs ~$80b, so money is not what limits this, serial focused time
// is. graftrecon.js's own ladder is ordered by PRICE and needs ~13h to reach what this
// reaches in ~7h. Hydroflame Left Arm is deliberately absent: $7.5t, ~9 days of income.
const LADDER = [
  "SPTN-97 Gene Modification",
  "Graphene Bionic Spine Upgrade",
  "Graphene Bionic Arms Upgrade",
  "Graphene Bionic Legs Upgrade",
  "NEMEAN Subdermal Weave",
  "Graphene Bone Lacings",
];

const MAX_TOTAL_SPEND = 130e9; // matches the finance-reserve-extra.txt reservation
const MAX_TOTAL_HOURS = 12;
// Price is inferred from a money DELTA, and hacking income lands in lumps (the batcher
// settles batches worth billions every few minutes), so the delta is noisy in ONE direction:
// income arriving mid-measurement makes the graft look CHEAPER than it was. That is harmless.
// Being charged MORE than projected is the real alarm, because the whole plan is costed on
// the price model. So the check is asymmetric rather than a symmetric tolerance.
// Measured 2026-08-20: a $18.000b graft read $17.950b -- a $50m lump landing in a 1.2s window
// tripped a symmetric $5m tolerance and aborted a healthy ladder.
const PRICE_OVERCHARGE_FACTOR = 1.02; // charged more than this x projected -> stop
const PRICE_UNDERCHARGE_FLOOR = 0.5; // charged less than this x projected -> it did not really charge
const MONEY_WAIT_POLL_MS = 30000;
const MONEY_WAIT_MAX_MS = 60 * 60000; // income is ~$34.6b/h; an hour of waiting means something is wrong
const WORK_POLL_MS = 10000;

function snapshot(ns, label) {
  const p = ns.getPlayer();
  const snap = {
    label, ts: Date.now(), iso: new Date().toISOString(), city: p.city,
    money: p.money, entropy: p.entropy, mults: {}, levels: {},
  };
  for (const s of STATS) {
    snap.mults[s] = p.mults[s];
    snap.levels[s] = p.skills[s];
  }
  return snap;
}

/**
 * Pure. Is the money actually charged for a graft consistent with the quoted price?
 *
 * Asymmetric on purpose. The charge is inferred from a money delta while hacking income is
 * still arriving in lumps, so a delta SMALLER than quoted just means a batch settled inside
 * the measurement window -- benign. A delta LARGER than quoted means the price model the whole
 * ladder is costed on is wrong, which is worth stopping for. A delta far BELOW quoted means it
 * probably did not charge at all, which is also worth stopping for.
 */
export function priceIsSane(realised, projected) {
  if (!Number.isFinite(realised) || !Number.isFinite(projected) || projected <= 0) return false;
  if (realised > projected * PRICE_OVERCHARGE_FACTOR) return false;
  if (realised < projected * PRICE_UNDERCHARGE_FLOOR) return false;
  return true;
}

/**
 * Pure. Expands an ordered wish list into an execution order in which every aug's
 * prerequisites appear before it.
 *
 * `ownedSet` is what we already hold; `graftableSet` is what the game says can be grafted at
 * all. A missing prereq that IS graftable gets inserted ahead of its dependent (recursively);
 * a missing prereq that is NOT graftable makes the dependent unreachable, and the dependent is
 * dropped with a reason rather than attempted -- attempting it would stall the ladder on a
 * call that cannot succeed.
 *
 * Exported for tests: this is the part that is wrong in an offline plan and right only against
 * live prereq data.
 */
export function resolvePlan(wishList, ownedSet, graftableSet, prereqLookup) {
  const order = [];
  const placed = new Set();
  const dropped = [];

  const visit = (name, trail) => {
    if (placed.has(name) || ownedSet.has(name)) return true;
    if (trail.includes(name)) {
      dropped.push({ name, reason: "prereq-cycle" });
      return false;
    }
    if (!graftableSet.has(name)) {
      dropped.push({ name, reason: "not-graftable" });
      return false;
    }
    for (const pre of prereqLookup(name) || []) {
      if (ownedSet.has(pre)) continue;
      if (!visit(pre, trail.concat(name))) {
        dropped.push({ name, reason: "unreachable-prereq: " + pre });
        return false;
      }
    }
    placed.add(name);
    order.push(name);
    return true;
  };

  for (const name of wishList) {
    if (ownedSet.has(name)) {
      dropped.push({ name, reason: "already-owned" });
      continue;
    }
    visit(name, []);
  }
  return { order, dropped };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const dryRun = ns.args.includes("dry");

  const rec = {
    ts: Date.now(), iso: new Date().toISOString(), dryRun, ladder: LADDER,
    caps: { maxTotalSpend: MAX_TOTAL_SPEND, maxTotalHours: MAX_TOTAL_HOURS }, steps: [],
  };
  const flush = () => ns.write("graftladder-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  if (!ns.fileExists(BB_OFF_MARKER, "home")) {
    rec.result = "abort-engine-live";
    flush();
    ns.tprint("graftladder: ABORT -- " + BB_OFF_MARKER + " is missing, so bladeburnermanager.js");
    ns.tprint("  can restart a Bladeburner action on top of a graft we already paid for.");
    return;
  }

  const owned = new Set(ns.singularity.getOwnedAugmentations(true));
  const graftable = new Set(ns.grafting.getGraftableAugmentations());
  const plan = resolvePlan(LADDER, owned, graftable, (n) => ns.singularity.getAugmentationPrereq(n));
  rec.resolved = plan.order;
  rec.dropped = plan.dropped;

  rec.projected = plan.order.map((name) => ({
    name,
    price: ns.grafting.getAugmentationGraftPrice(name),
    hours: ns.grafting.getAugmentationGraftTime(name) / 3600000,
  }));
  rec.projectedTotalSpend = rec.projected.reduce((a, x) => a + x.price, 0);
  rec.projectedTotalHours = rec.projected.reduce((a, x) => a + x.hours, 0);
  flush();

  ns.tprint("graftladder: " + plan.order.length + " to graft, projected $" +
    ns.format.number(rec.projectedTotalSpend) + " / " + rec.projectedTotalHours.toFixed(1) + "h");
  for (const p of rec.projected) {
    ns.tprint("  " + p.name + " -- $" + ns.format.number(p.price) + " / " + p.hours.toFixed(2) + "h");
  }
  for (const d of plan.dropped) ns.tprint("  SKIP " + d.name + " -- " + d.reason);

  if (rec.projectedTotalSpend > MAX_TOTAL_SPEND) {
    rec.result = "abort-over-spend-cap";
    flush();
    ns.tprint("graftladder: ABORT -- projected spend exceeds cap $" + ns.format.number(MAX_TOTAL_SPEND));
    return;
  }
  if (rec.projectedTotalHours > MAX_TOTAL_HOURS) {
    rec.result = "abort-over-time-cap";
    flush();
    ns.tprint("graftladder: ABORT -- projected " + rec.projectedTotalHours.toFixed(1) +
      "h exceeds cap " + MAX_TOTAL_HOURS + "h");
    return;
  }
  if (dryRun) {
    rec.result = "dry-run";
    flush();
    ns.tprint("graftladder: DRY RUN -- nothing grafted. -> graftladder-" + rec.ts + ".json");
    return;
  }

  // Let an already-running graft finish -- this can be launched mid-flight.
  const inFlight = ns.singularity.getCurrentWork();
  if (inFlight && inFlight.type === "GRAFTING") {
    ns.tprint("graftladder: waiting for the in-flight graft to finish first...");
    rec.waitedForInFlight = true;
    while (true) {
      await ns.sleep(WORK_POLL_MS);
      const w = ns.singularity.getCurrentWork();
      if (!w || w.type !== "GRAFTING") break;
    }
  }

  rec.startedAtMs = Date.now();
  let spent = 0;

  for (const name of plan.order) {
    const step = { name, startedAtMs: Date.now() };
    rec.steps.push(step);

    if (ns.singularity.getOwnedAugmentations(true).includes(name)) {
      step.result = "skipped-already-owned";
      flush();
      continue;
    }

    step.projectedPrice = ns.grafting.getAugmentationGraftPrice(name);
    step.projectedTimeMs = ns.grafting.getAugmentationGraftTime(name);

    if (spent + step.projectedPrice > MAX_TOTAL_SPEND) {
      step.result = "stopped-spend-cap";
      rec.result = "stopped-spend-cap";
      flush();
      ns.tprint("graftladder: STOP -- next graft would cross the $" +
        ns.format.number(MAX_TOTAL_SPEND) + " cap.");
      return;
    }

    // Wait for money rather than abort -- income is ~$34.6b/h and cloudmanager is held off by
    // the finance reserve, so a shortfall is a timing gap, not a failure.
    const waitStart = Date.now();
    while (ns.getPlayer().money < step.projectedPrice) {
      if (Date.now() - waitStart > MONEY_WAIT_MAX_MS) {
        step.result = "abort-money-timeout";
        rec.result = "abort-money-timeout";
        flush();
        ns.tprint("graftladder: ABORT -- waited " + (MONEY_WAIT_MAX_MS / 60000) +
          " min for $" + ns.format.number(step.projectedPrice) + " and it never arrived.");
        return;
      }
      step.waitedForMoney = true;
      await ns.sleep(MONEY_WAIT_POLL_MS);
    }

    if (ns.getPlayer().city !== GRAFT_CITY) {
      ns.singularity.travelToCity(GRAFT_CITY);
      step.cityAfterTravel = ns.getPlayer().city;
      if (step.cityAfterTravel !== GRAFT_CITY) {
        step.result = "abort-travel-failed";
        rec.result = "abort-travel-failed";
        flush();
        ns.tprint("graftladder: ABORT -- could not reach " + GRAFT_CITY);
        return;
      }
    }

    step.before = snapshot(ns, "before");
    const moneyPre = ns.getPlayer().money;
    step.callReturned = ns.grafting.graftAugmentation(name, true);
    // Read money back IMMEDIATELY -- every millisecond of delay is another chance for an
    // income lump to land inside the measurement window and distort the inferred price.
    step.realisedPrice = moneyPre - ns.getPlayer().money;

    await ns.sleep(1200);
    const workNow = ns.singularity.getCurrentWork();
    step.verifiedWorkType = workNow ? workNow.type : null;
    step.verifiedStarted = !!workNow && workNow.type === "GRAFTING";
    step.priceRatio = step.projectedPrice > 0 ? step.realisedPrice / step.projectedPrice : null;
    step.priceMatchesProjection = priceIsSane(step.realisedPrice, step.projectedPrice);
    flush();

    if (!step.verifiedStarted) {
      step.result = "abort-start-unverified";
      rec.result = "abort-start-unverified";
      flush();
      ns.tprint("graftladder: ABORT -- '" + name + "' returned " + step.callReturned +
        " but getCurrentWork() reads " + step.verifiedWorkType + ".");
      return;
    }
    if (!step.priceMatchesProjection) {
      // The whole plan is costed on the price model. If it is wrong, stop and re-measure --
      // the graft is already paid for and running, so let it finish, then stop.
      step.result = "abort-price-mismatch";
      rec.result = "abort-price-mismatch";
      flush();
      ns.tprint("graftladder: ABORT after this graft -- realised $" +
        ns.format.number(step.realisedPrice) + " vs projected $" +
        ns.format.number(step.projectedPrice) + ".");
    }

    spent += step.realisedPrice;
    recordTransaction(ns, {
      type: "expense", source: "graft", amount: step.realisedPrice,
      detail: name + " (BN10 combat ladder)",
    });
    ns.tprint("graftladder: grafting " + name + " -- $" + ns.format.number(step.realisedPrice) +
      " / " + (step.projectedTimeMs / 3600000).toFixed(2) + "h");

    while (true) {
      await ns.sleep(WORK_POLL_MS);
      const w = ns.singularity.getCurrentWork();
      if (!w || w.type !== "GRAFTING") break;
    }

    step.realisedMs = Date.now() - step.startedAtMs;
    step.durationRatio = step.realisedMs / step.projectedTimeMs;
    step.after = snapshot(ns, "after");
    step.ownedAfter = ns.singularity.getOwnedAugmentations(true).includes(name);
    step.multDeltas = {};
    for (const s of STATS) step.multDeltas[s] = step.after.mults[s] / step.before.mults[s];
    if (step.result !== "abort-price-mismatch") {
      step.result = step.ownedAfter ? "grafted" : "completed-but-not-owned";
    }
    flush();

    ns.tprint("  " + name + ": " + step.result + " | combat " +
      STATS.map((s) => step.before.levels[s] + "->" + step.after.levels[s]).join("/") +
      " | entropy " + step.before.entropy + "->" + step.after.entropy);

    if (rec.result === "abort-price-mismatch") return;
    if (Date.now() - rec.startedAtMs > MAX_TOTAL_HOURS * 3600000) {
      rec.result = "stopped-time-cap";
      flush();
      ns.tprint("graftladder: STOP -- hit the " + MAX_TOTAL_HOURS + "h cap.");
      return;
    }
  }

  rec.result = "complete";
  rec.totalSpent = spent;
  rec.totalMs = Date.now() - rec.startedAtMs;
  const fin = ns.getPlayer();
  rec.finalLevels = {};
  for (const s of STATS) rec.finalLevels[s] = fin.skills[s];
  flush();
  ns.tprint("graftladder: COMPLETE -- $" + ns.format.number(spent) + " over " +
    (rec.totalMs / 3600000).toFixed(2) + "h | combat " + STATS.map((s) => rec.finalLevels[s]).join("/"));
  ns.tprint("  NEXT: delete bladeburner-off.txt and finance-reserve-extra.txt, then restart");
  ns.tprint("  bladeburnermanager.js and re-measure the duty cycle.");
  ns.tprint("  -> graftladder-" + rec.ts + ".json");
}
