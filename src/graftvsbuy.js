/**
 * graftvsbuy.js - the graft-vs-install question, measured rather than argued.
 *
 * WHY. phase-41-bn10-entry.spec.md rejected the faction-aug route (R2) for ENTRY on process
 * grounds -- invites gated on karma/stats/city, a rep grind competing for the same player-action
 * slot, and an install that wipes money and fleet at the moment we are accumulating both. That is
 * reasoning, not arithmetic: nobody has ever compared the two on PRICE, and the two costs are
 * scaled by different BitNode multipliers (BN10: AugmentationMoneyCost 5x, AugmentationRepCost 2x;
 * whether either applies to GRAFT price is unknown).
 *
 * This reads, for every graftable augmentation, the purchase price, the graft price, and the rep
 * requirement, so the premium can be computed instead of assumed.
 *
 * Read-only: prices and requirements only. Buys nothing, grafts nothing.
 *
 * RAM: ~19 GB (getAugmentationPrice 5 + getAugmentationRepReq 5 + getGraftableAugmentations 5
 *      + getAugmentationGraftPrice 3.75).
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const rec = { ts: Date.now(), iso: new Date().toISOString(),
    note: "purchase price vs graft price vs rep requirement, per graftable aug" };

  const p = ns.getPlayer();
  rec.player = { money: p.money, entropy: p.entropy, city: p.city };

  let catalog = [];
  try { catalog = ns.grafting.getGraftableAugmentations(); }
  catch (err) { rec.fatal = String(err).slice(0, 200); }

  rec.rows = [];
  for (const augName of catalog) {
    const row = { name: augName };
    try { row.buyPrice = ns.singularity.getAugmentationPrice(augName); } catch { row.buyPrice = null; }
    try { row.graftPrice = ns.grafting.getAugmentationGraftPrice(augName); } catch { row.graftPrice = null; }
    try { row.repReq = ns.singularity.getAugmentationRepReq(augName); } catch { row.repReq = null; }
    if (typeof row.buyPrice === "number" && row.buyPrice > 0 && typeof row.graftPrice === "number") {
      row.graftPremium = row.graftPrice / row.buyPrice;
    }
    rec.rows.push(row);
    await ns.sleep(3);
  }

  const withPremium = rec.rows.filter((r) => typeof r.graftPremium === "number");
  if (withPremium.length) {
    const premiums = withPremium.map((r) => r.graftPremium).sort((a, b) => a - b);
    rec.premiumStats = {
      n: premiums.length,
      min: premiums[0],
      median: premiums[Math.floor(premiums.length / 2)],
      max: premiums[premiums.length - 1],
      allEqual: Math.abs(premiums[0] - premiums[premiums.length - 1]) < 1e-6,
    };
  }

  ns.write("graftvsbuy-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");
  ns.tprint("graftvsbuy: " + rec.rows.length + " graftable augs | entropy " + p.entropy);
  if (rec.premiumStats) {
    const s = rec.premiumStats;
    ns.tprint("  graft price / purchase price -- min " + s.min.toFixed(3) +
      " median " + s.median.toFixed(3) + " max " + s.max.toFixed(3) +
      (s.allEqual ? "  [CONSTANT RATIO]" : "  [VARIES]"));
  }
  for (const r of withPremium.slice(0, 8)) {
    ns.tprint("    " + r.name.slice(0, 30).padEnd(30) +
      " buy $" + ns.format.number(r.buyPrice) + " / graft $" + ns.format.number(r.graftPrice) +
      " = x" + r.graftPremium.toFixed(2) + " | rep " + ns.format.number(r.repReq));
  }
  ns.tprint("  -> graftvsbuy-" + rec.ts + ".json");
}
