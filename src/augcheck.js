/**
 * augcheck.js — Singularity aug-SHOP lookup (SF4). Complements auginfo.js, which dumps OWNED augs
 * + aggregate mults with no Singularity. This reads the shop side (rep req / price / factions /
 * prereq / stat mults) for augs you don't own yet.
 *
 * Usage:
 *   run augcheck.js "Aug Name"            -> dump one aug's shop info
 *   run augcheck.js faction "Faction"     -> dump every aug a faction sells
 * Writes a timestamped logs/augcheck-<epoch>.txt (in-game FS) and prints a terminal summary.
 *
 * NOTE: getAugmentationStats returns numeric MULTS only — pure-utility augs (e.g. the focus-penalty
 * aug Neuroreceptor Management Implant) read all 1.0, so this cannot confirm non-mult effects.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const sing = ns.singularity;
  const args = ns.args.map(String);

  const dumpAug = (name) => ({
    name,
    repReq: sing.getAugmentationRepReq(name),
    basePrice: sing.getAugmentationBasePrice(name),
    price: sing.getAugmentationPrice(name),
    factions: sing.getAugmentationFactions(name),
    prereq: sing.getAugmentationPrereq(name),
    stats: sing.getAugmentationStats(name),
  });
  const printAug = (a) => {
    ns.tprint(`AUG: ${a.name}`);
    ns.tprint(`  factions : ${a.factions.join(", ")}`);
    ns.tprint(`  rep req  : ${ns.format.number(a.repReq)}`);
    ns.tprint(`  price    : ${ns.format.number(a.price)} (base ${ns.format.number(a.basePrice)})`);
    ns.tprint(`  prereq   : ${a.prereq.length ? a.prereq.join(", ") : "none"}`);
    ns.tprint(`  stats    : ${JSON.stringify(a.stats)}`);
  };

  const out = { ts: Date.now(), mode: null, augs: [] };
  try {
    if (args[0] === "faction") {
      if (!args[1]) return ns.tprint("ERROR: usage: run augcheck.js faction \"Faction Name\"");
      out.mode = `faction:${args[1]}`;
      for (const name of sing.getAugmentationsFromFaction(args[1])) out.augs.push(dumpAug(name));
    } else if (args[0]) {
      out.mode = `aug:${args[0]}`;
      out.augs.push(dumpAug(args[0]));
    } else {
      return ns.tprint('ERROR: usage: run augcheck.js "Aug Name"  |  run augcheck.js faction "Faction"');
    }
  } catch (e) {
    return ns.tprint(`ERROR: lookup failed (bad aug/faction name?): ${e}`);
  }

  const path = `logs/augcheck-${out.ts}.txt`;
  ns.write(path, JSON.stringify(out, null, 2), "w");
  ns.tprint(`augcheck (${out.mode}) -> ${path}`);
  for (const a of out.augs) printAug(a);
}
