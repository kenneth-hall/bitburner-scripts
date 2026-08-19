/**
 * sleeveaugbuy.js -- report, then optionally buy, augmentations for a sleeve.
 *
 * WHY A SEPARATE SCRIPT. sleevemanager.js deliberately does not buy. Installing an aug on a
 * sleeve RESETS THAT SLEEVE'S STATS (docs/sleeve-grafting-reference.md section 2), so it is a
 * decision with a real cost rather than a chore to automate. Keeping the purchase out of the
 * resident loop also keeps that loop at 16 GB.
 *
 * THE TIMING RULE THIS EXISTS TO EXPLOIT. Because the install resets stats, the cost of buying
 * GROWS with every hour the sleeve works -- a sleeve on bonus time climbed 26 -> 43 combat in
 * 20 minutes. So the cheapest moment to buy is the FIRST moment shock reaches exactly 0, and
 * every aug worth buying should be bought in the SAME window, since one reset covers all of
 * them if they are purchased back to back.
 *
 * WHAT THE RESET DOES AND DOES NOT COST. The sleeve's own stats go to 1. The PLAYER keeps every
 * point of exp already transferred through sync -- that is banked and is not clawed back. So the
 * real cost is only the temporarily lower crime success while the sleeve re-climbs, not a loss
 * of anything the player already earned.
 *
 * MODES:
 *   run sleeveaugbuy.js            -- report only, buys nothing
 *   run sleeveaugbuy.js buy        -- buy every listed aug for sleeve 0, cheapest first
 *   run sleeveaugbuy.js buy <n>    -- same, for sleeve n
 *
 * RAM: getNumSleeves/getSleeve/getSleevePurchasableAugs/getSleeveAugmentationPrice/
 *      getSleeveAugmentationRepReq/purchaseSleeveAug = 6 x 4 GB = 24 GB + base.
 *
 * ASCII-only (docs/dev-server.md -- new files are seeded by in-game wget).
 */

const SPEND_CAP = 100_000_000; // hard rail: never spend more than $100m here without a code change

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const doBuy = ns.args[0] === "buy";
  const idx = Number(ns.args[1] ?? 0);

  const rec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    mode: doBuy ? "buy" : "report",
    sleeveIndex: idx,
    spendCap: SPEND_CAP,
  };

  const info = ns.sleeve.getSleeve(idx);
  rec.shock = info.shock;
  rec.augReady = info.shock === 0;
  rec.skillsBefore = {
    strength: info.skills.strength,
    defense: info.skills.defense,
    dexterity: info.skills.dexterity,
    agility: info.skills.agility,
  };
  rec.moneyBefore = ns.getPlayer().money;

  const offered = ns.sleeve.getSleevePurchasableAugs(idx);
  rec.offered = offered.map((a) => ({
    name: a.name,
    // AugmentPair.cost is what getSleevePurchasableAugs reports; cross-check it against the
    // dedicated price call, because sleeve prices are 0.2x the player price and a mismatch
    // would mean we are reading the wrong number.
    costFromPair: a.cost,
    priceCall: safe(ns, () => ns.sleeve.getSleeveAugmentationPrice(a.name)),
    repReq: safe(ns, () => ns.sleeve.getSleeveAugmentationRepReq(a.name)),
  }));
  rec.offered.sort((x, y) => (x.priceCall ?? x.costFromPair) - (y.priceCall ?? y.costFromPair));

  ns.tprint("sleeveaugbuy: sleeve " + idx + " shock=" + info.shock + " augReady=" + rec.augReady +
    " money=$" + ns.format.number(rec.moneyBefore));
  for (const a of rec.offered) {
    ns.tprint("  " + a.name + " | price $" + ns.format.number(a.priceCall ?? a.costFromPair) +
      " | repReq " + ns.format.number(a.repReq ?? -1));
  }

  if (!doBuy) {
    rec.note = "report only -- rerun with 'buy' to purchase";
    ns.write("sleeveaugbuy-" + rec.ts + ".json", JSON.stringify(rec, null, 1), "w");
    ns.tprint("sleeveaugbuy: REPORT ONLY. Rerun with: run sleeveaugbuy.js buy " + idx);
    return;
  }

  if (!rec.augReady) {
    rec.aborted = "shock is " + info.shock + ", must be exactly 0";
    ns.tprint("sleeveaugbuy: ABORT -- " + rec.aborted);
    ns.write("sleeveaugbuy-" + rec.ts + ".json", JSON.stringify(rec, null, 1), "w");
    return;
  }

  let spent = 0;
  rec.purchases = [];
  for (const a of rec.offered) {
    const price = a.priceCall ?? a.costFromPair;
    if (spent + price > SPEND_CAP) {
      rec.purchases.push({ name: a.name, skipped: "would breach spend cap" });
      continue;
    }
    const ok = ns.sleeve.purchaseSleeveAug(idx, a.name);
    // Verify against the installed list rather than trusting the boolean (standing rule).
    const owned = ns.sleeve.getSleeveAugmentations(idx);
    const verified = owned.includes(a.name);
    if (verified) spent += price;
    rec.purchases.push({ name: a.name, price, returned: ok, verified });
    ns.tprint("sleeveaugbuy: " + (verified ? "BOUGHT " : "FAILED ") + a.name +
      " ($" + ns.format.number(price) + ", returned " + ok + ")");
  }

  const after = ns.sleeve.getSleeve(idx);
  rec.spent = spent;
  rec.moneyAfter = ns.getPlayer().money;
  rec.skillsAfter = {
    strength: after.skills.strength,
    defense: after.skills.defense,
    dexterity: after.skills.dexterity,
    agility: after.skills.agility,
  };
  rec.installed = ns.sleeve.getSleeveAugmentations(idx);
  ns.write("sleeveaugbuy-" + rec.ts + ".json", JSON.stringify(rec, null, 1), "w");
  ns.tprint("sleeveaugbuy: spent $" + ns.format.number(spent) + " | stats " +
    JSON.stringify(rec.skillsBefore) + " -> " + JSON.stringify(rec.skillsAfter));
}

function safe(ns, fn) {
  try {
    return fn();
  } catch (err) {
    return null;
  }
}
