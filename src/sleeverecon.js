/**
 * sleeverecon.js - read-only census of every sleeve, at BN10 entry.
 *
 * WHY. docs/sleeve-grafting-reference.md was built from the in-game FAQ text, not from the
 * live API. The FAQ tells us the MECHANICS (sync transfers exp, shock penalises it, memory
 * is the only thing surviving a node switch); it does not tell us our actual starting
 * numbers, and every BN10 plan turns on those numbers:
 *   - sync   -> how much of a sleeve's exp reaches the player (LINEAR term)
 *   - shock  -> how badly that exp is currently penalised, and how far from 0 (aug gate)
 *   - memory -> what sync resets to in the NEXT node (the BN10-exclusive purchase)
 *   - cost   -> what another sleeve / memory point costs against our actual bankroll
 *
 * Read-only: reads sleeves and prices, assigns nothing, buys nothing.
 *
 * RAM: 5 sleeve methods x 4 GB = 20 GB + change. Deliberately split from the A/B probe so
 * neither has to fit alongside the other on a 32 GB fresh-node home.
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const rec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "BN10 sleeve census -- sync/shock/memory/prices at node entry",
  };

  const player = ns.getPlayer();
  rec.player = {
    money: player.money,
    city: player.city,
    hacking: player.skills.hacking,
    strength: player.skills.strength,
    defense: player.skills.defense,
    dexterity: player.skills.dexterity,
    agility: player.skills.agility,
    exp: {
      strength: player.exp.strength,
      defense: player.exp.defense,
      dexterity: player.exp.dexterity,
      agility: player.exp.agility,
    },
    // The combat multiplier that makes BN10's gate 27x BN6's. Recorded so the probe's
    // output is self-contained rather than needing the Stats panel cross-read.
    mults: {
      strength: player.mults.strength,
      defense: player.mults.defense,
      dexterity: player.mults.dexterity,
      agility: player.mults.agility,
    },
  };

  let count = 0;
  try {
    count = ns.sleeve.getNumSleeves();
  } catch (err) {
    rec.fatal = "getNumSleeves threw: " + String(err).slice(0, 200);
    ns.write("sleeverecon-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");
    ns.tprint("sleeverecon: ABORT -- " + rec.fatal);
    return;
  }
  rec.numSleeves = count;

  rec.sleeves = [];
  for (let i = 0; i < count; i++) {
    const row = { index: i };
    try {
      const s = ns.sleeve.getSleeve(i);
      row.sync = s.sync;
      row.shock = s.shock;
      row.memory = s.memory;
      row.storedCycles = s.storedCycles;
      row.city = s.city;
      row.hp = s.hp ? s.hp.current + "/" + s.hp.max : undefined;
      row.skills = {
        strength: s.skills.strength,
        defense: s.skills.defense,
        dexterity: s.skills.dexterity,
        agility: s.skills.agility,
        hacking: s.skills.hacking,
      };
      row.exp = {
        strength: s.exp.strength,
        defense: s.exp.defense,
        dexterity: s.exp.dexterity,
        agility: s.exp.agility,
      };
      // Sleeve mults are their OWN -- the reference doc records them all reading 100.00%
      // in the UI, which would mean a sleeve gains raw exp with no aug stack behind it.
      row.mults = {
        strength: s.mults.strength,
        defense: s.mults.defense,
        dexterity: s.mults.dexterity,
        agility: s.mults.agility,
      };
    } catch (err) {
      row.sleeveError = String(err).slice(0, 160);
    }
    try {
      const t = ns.sleeve.getTask(i);
      row.currentTask = t ? JSON.parse(JSON.stringify(t)) : null;
    } catch (err) {
      row.taskError = String(err).slice(0, 160);
    }
    try {
      const augs = ns.sleeve.getSleevePurchasableAugs(i);
      row.purchasableAugCount = Array.isArray(augs) ? augs.length : null;
      // Only the cheapest few matter for planning; the full list is noise at shock > 0.
      row.cheapestAugs = Array.isArray(augs)
        ? augs.slice().sort((a, b) => a.cost - b.cost).slice(0, 5)
        : null;
    } catch (err) {
      // Expected to be the shock-gate error at shock > 0 -- capture it verbatim, it is
      // the answer to "is shock 0 enforced at the API or only in the UI?"
      row.purchasableAugsError = String(err).slice(0, 200);
    }
    rec.sleeves.push(row);
    await ns.sleep(5);
  }

  try {
    rec.nextSleeveCost = ns.sleeve.getSleeveCost();
  } catch (err) {
    rec.nextSleeveCostError = String(err).slice(0, 200);
  }

  ns.write("sleeverecon-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  ns.tprint("sleeverecon: " + count + " sleeves | player $" + ns.format.number(player.money) +
    " | combat " + player.skills.strength + "/" + player.skills.defense + "/" +
    player.skills.dexterity + "/" + player.skills.agility);
  ns.tprint("  combat mult (str): " + player.mults.strength.toFixed(4));
  for (const r of rec.sleeves) {
    ns.tprint("  sleeve " + r.index + ": sync " + r.sync + " shock " + r.shock +
      " memory " + r.memory + " | city " + r.city +
      " | combat " + r.skills.strength + "/" + r.skills.defense + "/" +
      r.skills.dexterity + "/" + r.skills.agility +
      " | task " + (r.currentTask ? r.currentTask.type : "null") +
      " | augs " + (r.purchasableAugCount !== undefined && r.purchasableAugCount !== null
        ? r.purchasableAugCount : "ERR"));
  }
  ns.tprint("  next sleeve costs: " + (rec.nextSleeveCost !== undefined
    ? "$" + ns.format.number(rec.nextSleeveCost) : rec.nextSleeveCostError));
  ns.tprint("  -> sleeverecon-" + rec.ts + ".json");
}
