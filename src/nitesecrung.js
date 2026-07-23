/**
 * nitesecrung.js — read-only affordability check (SF4). Given current money, how much of NiteSec's
 * HACKING-mult catalog can we install RIGHT NOW, and what hacking multiplier does that rung yield?
 *
 * Simulates buying cheapest-first under the per-purchase price escalation (each queued aug multiplies
 * subsequent prices). Reports the affordable rung (count + spend + resulting M) so the "compound now
 * vs bank for the core rung" decision rests on a number. Writes JSON so it syncs via the bridge.
 *
 * Read-only: no purchases, no installs. @param {NS} ns
 */
export async function main(ns) {
  const sing = ns.singularity;
  const FACTION = "NiteSec";
  const ESCALATE = 1.9; // price multiplier per aug already queued (vanilla default)

  const player = ns.getPlayer();
  const money = player.money;
  const curM = player.mults.hacking; // current level-mult (SF + installed augs; 0 augs => SF only)

  // Pull hacking-mult augs (stats.hacking > 1), each with its current marginal price.
  const augs = [];
  for (const name of sing.getAugmentationsFromFaction(FACTION)) {
    const stats = sing.getAugmentationStats(name);
    const hack = stats.hacking || 1;
    if (hack > 1) augs.push({ name, price: sing.getAugmentationPrice(name), hack });
  }
  // Cheapest-first is the most augs-per-dollar order; escalation applies as 1.9^i to the i-th buy.
  augs.sort((a, b) => a.price - b.price);

  let spend = 0, i = 0, mMult = 1;
  const bought = [];
  for (const a of augs) {
    const cost = a.price * Math.pow(ESCALATE, i);
    if (spend + cost > money) continue; // skip ones we can't afford; keep trying cheaper-scaled ones
    spend += cost;
    mMult *= a.hack;
    bought.push({ name: a.name, hack: a.hack, simCost: cost });
    i++;
  }

  // Full-catalog reference: cumulative hacking mult if we could buy every hacking aug (money aside).
  const fullMult = augs.reduce((m, a) => m * a.hack, 1);

  const out = {
    ts: Date.now(),
    money, currentM: curM,
    hackAugCount: augs.length,
    affordableNow: {
      count: bought.length,
      spend,
      resultingM: curM * mMult,   // M after installing this rung (NFG not included)
      augs: bought,
    },
    fullCatalog: {
      resultingM: curM * fullMult, // M if the whole hacking catalog were installed
    },
  };
  const path = `logs/nitesecrung-${out.ts}.json`;
  ns.write(path, JSON.stringify(out, null, 2), "w");

  ns.tprint(`==== NiteSec rung check ====`);
  ns.tprint(`  money now      : ${ns.format.number(money)}`);
  ns.tprint(`  current M      : ${curM.toFixed(3)}`);
  ns.tprint(`  hacking augs   : ${augs.length} in catalog`);
  ns.tprint(`  affordable NOW : ${bought.length} augs, spend ${ns.format.number(spend)}`);
  ns.tprint(`  M after rung   : ${(curM * mMult).toFixed(3)}  (from ${curM.toFixed(3)})`);
  ns.tprint(`  M if full cat  : ${(curM * fullMult).toFixed(3)}`);
  ns.tprint(`  -> ${path}`);
}
