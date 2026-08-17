/**
 * graftrecon.js - is grafting actually available in BN10, and can it move the combat mult?
 *
 * WHY. The BN10 critical path is the combat-100 gate on joinBladeburnerDivision(). Because
 * combat LEVEL is logarithmic in exp, the required exp is dominated by the combat MULTIPLIER,
 * not by grind rate: at the live 0.5530 effective mult, level 100 costs ~146,665 exp/stat,
 * but at an effective 0.80 it costs ~25,207 -- a 5.8x collapse. So raising the mult is worth
 * far more than grinding faster.
 *
 * There are two routes to a higher combat mult, and they have completely different costs:
 *   (a) FACTION AUGS  -- needs faction invites (karma / combat stats / city), rep, and an
 *       INSTALL to apply, which wipes money+fleet and resets progress.
 *   (b) GRAFTING      -- needs only money and focused time, applies with NO install.
 * Route (b) would skip the entire faction+install detour, so which route work item 2 takes
 * turns on whether grafting is live and what it can actually buy.
 *
 * ⚠️ THE REASON THIS IS A PROBE AND NOT AN ASSUMPTION: docs/grafting.md records that in BN1
 * (2026-07-11) the grafting clinic did NOT appear at VitaLife/New Tokyo in this fork, unlock
 * condition unconfirmed. sleeve-grafting-reference.md §7 says grafting "should be available in
 * BN10, but verify before planning around it." This verifies it.
 *
 * Also prices the ENTROPY tax, which is the catch: every graft applies a compounding ~2%
 * debuff to ALL multipliers until the next install -- including the combat mult being bought.
 * A plan that grafts N combat augs nets (product of aug mults) x ~0.98^N, so the tax has to
 * be carried in the arithmetic, not mentioned in a footnote.
 *
 * Read-only: queries the graft catalog and prices. Grafts nothing, buys nothing, travels nowhere.
 *
 * RAM: ~20 GB (getGraftableAugmentations 5 + price 3.75 + time 3.75 + getAugmentationStats 5).
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

const COMBAT_MULT_KEYS = [
  "strength", "defense", "dexterity", "agility",
  "strength_exp", "defense_exp", "dexterity_exp", "agility_exp",
];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const rec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "BN10: is grafting live, and which grafts move the combat multiplier",
  };

  const player = ns.getPlayer();
  rec.player = {
    money: player.money,
    city: player.city,
    entropy: player.entropy,
    combatMults: {
      strength: player.mults.strength,
      defense: player.mults.defense,
      dexterity: player.mults.dexterity,
      agility: player.mults.agility,
    },
  };

  let catalog = null;
  try {
    catalog = ns.grafting.getGraftableAugmentations();
  } catch (err) {
    rec.fatal = "getGraftableAugmentations threw: " + String(err).slice(0, 250);
    ns.write("graftrecon-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");
    ns.tprint("graftrecon: ABORT -- " + rec.fatal);
    return;
  }

  rec.graftableCount = Array.isArray(catalog) ? catalog.length : null;
  rec.graftingAvailable = Array.isArray(catalog) && catalog.length > 0;

  // ⚠️ getGraftableAugmentations does NOT filter by money or prerequisites (reference §7),
  // so this list is the catalog, not a shopping list. Affordability is computed below.
  rec.augs = [];
  for (const augName of catalog || []) {
    const row = { name: augName };
    try {
      row.graftPrice = ns.grafting.getAugmentationGraftPrice(augName);
    } catch (err) {
      row.priceError = String(err).slice(0, 120);
    }
    try {
      row.graftTimeMs = ns.grafting.getAugmentationGraftTime(augName);
      row.graftTimeHours = row.graftTimeMs / 3_600_000;
    } catch (err) {
      row.timeError = String(err).slice(0, 120);
    }
    try {
      const multStats = ns.singularity.getAugmentationStats(augName);
      const moved = {};
      for (const k of Object.keys(multStats)) {
        if (multStats[k] !== 1) moved[k] = multStats[k];
      }
      row.mults = moved;
      // Does this aug touch the thing gating the node?
      let combatFactor = 1;
      for (const k of COMBAT_MULT_KEYS) {
        if (typeof multStats[k] === "number" && k.indexOf("_exp") === -1) {
          combatFactor *= multStats[k];
        }
      }
      row.combatLevelFactor = combatFactor;
      row.touchesCombatLevel = combatFactor !== 1;
    } catch (err) {
      row.statsError = String(err).slice(0, 120);
    }
    row.affordableNow = typeof row.graftPrice === "number" && row.graftPrice <= player.money;
    rec.augs.push(row);
    await ns.sleep(3);
  }

  // ---- the actual decision input: combat-level grafts, cheapest first ----------
  const combatGrafts = rec.augs
    .filter((a) => a.touchesCombatLevel && typeof a.graftPrice === "number")
    .sort((a, b) => a.graftPrice - b.graftPrice);
  rec.combatGrafts = combatGrafts;
  rec.combatGraftCount = combatGrafts.length;

  // Cumulative model: grafting the k cheapest combat augs, WITH the entropy tax carried.
  // Entropy is ~2% compounding per graft against every multiplier, so it eats into the
  // very mult being bought -- that is the whole reason to model it rather than note it.
  const ENTROPY_PER_GRAFT = 0.98;
  let cumFactor = 1;
  let cumCost = 0;
  let cumTimeH = 0;
  rec.cumulative = [];
  for (let k = 0; k < combatGrafts.length; k++) {
    const a = combatGrafts[k];
    cumFactor *= a.combatLevelFactor;
    cumCost += a.graftPrice;
    cumTimeH += a.graftTimeHours || 0;
    const entropyFactor = Math.pow(ENTROPY_PER_GRAFT, k + 1);
    rec.cumulative.push({
      grafts: k + 1,
      lastAug: a.name,
      rawCombatFactor: cumFactor,
      entropyFactor,
      netCombatFactor: cumFactor * entropyFactor,
      cumCost,
      cumTimeHours: cumTimeH,
    });
  }

  ns.write("graftrecon-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  ns.tprint("graftrecon: grafting available = " + rec.graftingAvailable +
    " (" + rec.graftableCount + " graftable) | entropy " + player.entropy +
    " | $" + ns.format.number(player.money) + " | city " + player.city);
  ns.tprint("  combat-LEVEL grafts: " + rec.combatGraftCount);
  for (const a of combatGrafts.slice(0, 12)) {
    ns.tprint("    " + a.name + " -- $" + ns.format.number(a.graftPrice) +
      " / " + (a.graftTimeHours || 0).toFixed(2) + "h / x" + a.combatLevelFactor.toFixed(3) +
      (a.affordableNow ? " [affordable]" : ""));
  }
  for (const c of rec.cumulative.slice(0, 8)) {
    ns.tprint("  k=" + c.grafts + ": net combat x" + c.netCombatFactor.toFixed(3) +
      " (raw x" + c.rawCombatFactor.toFixed(3) + " * entropy " + c.entropyFactor.toFixed(3) +
      ") for $" + ns.format.number(c.cumCost) + " / " + c.cumTimeHours.toFixed(1) + "h");
  }
  ns.tprint("  -> graftrecon-" + rec.ts + ".json");
}
