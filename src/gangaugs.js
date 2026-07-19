/**
 * gangaugs.js — Phase 27 discovery. Sweeps the candidate gang-capable factions' augmentation
 * catalogs and computes the cumulative multipliers each one is worth, so the BN2 commit-vs-abort
 * decision (and the irreversible gang-faction choice) can be made from static data instead of
 * from a gang we can't un-create.
 *
 * Works with ZERO factions joined and no gang: singularity.getAugmentationsFromFaction does not
 * require membership (verified live 2026-07-19). Nothing here spends or commits anything.
 *
 * Usage:
 *   run gangaugs.js                      -> sweep the default candidate list
 *   run gangaugs.js "Faction A" "..."    -> sweep an explicit list
 *
 * Needs ~29 GB (Singularity), so run it from a fleet server, not a crowded home, then
 * `scp logs/gangaugs-<epoch>.json home` so viteburner pulls it back.
 *
 * @param {NS} ns
 */
const CANDIDATES = [
  "Slum Snakes",
  "Tetrads",
  "Speakers for the Dead",
  "The Dark Army",
  "The Syndicate",
  "NiteSec",
  "The Black Hand",
];

// The mult fields that matter to a hacking-mult run. `hacking` is the level mult the
// Daedalus/w0r1d_d43m0n plan tracks (M); the rest are supporting.
const TRACKED = ["hacking", "hacking_exp", "hacking_money", "hacking_speed", "hacking_chance"];

export async function main(ns) {
  const sing = ns.singularity;
  const names = ns.args.length ? ns.args.map(String) : CANDIDATES;

  const out = { ts: Date.now(), tracked: TRACKED, factions: [], union: null, errors: [] };
  const unionAugs = new Map();

  for (const factionName of names) {
    let augNames;
    try {
      augNames = sing.getAugmentationsFromFaction(factionName);
    } catch (e) {
      out.errors.push({ faction: factionName, error: String(e) });
      continue;
    }

    const entry = { faction: factionName, augCount: augNames.length, mults: {}, maxRepReq: 0, totalPrice: 0, augs: [] };
    for (const key of TRACKED) entry.mults[key] = 1;

    for (const augName of augNames) {
      const stats = sing.getAugmentationStats(augName);
      const repReq = sing.getAugmentationRepReq(augName);
      const price = sing.getAugmentationPrice(augName);

      for (const key of TRACKED) entry.mults[key] *= stats[key] ?? 1;
      entry.maxRepReq = Math.max(entry.maxRepReq, repReq);
      entry.totalPrice += price;

      // NeuroFlux is purchasable repeatedly and would distort a one-pass product; flag it.
      const isNfg = augName.startsWith("NeuroFlux");
      entry.augs.push({ name: augName, repReq, price, hacking: stats.hacking ?? 1, hacking_exp: stats.hacking_exp ?? 1, isNfg });
      if (!unionAugs.has(augName)) unionAugs.set(augName, stats);
    }

    entry.augs.sort((a, b) => b.hacking - a.hacking);
    out.factions.push(entry);
  }

  // Union across every swept faction: the ceiling if we could reach all of them.
  const union = { augCount: unionAugs.size, mults: {} };
  for (const key of TRACKED) union.mults[key] = 1;
  for (const stats of unionAugs.values()) {
    for (const key of TRACKED) union.mults[key] *= stats[key] ?? 1;
  }
  out.union = union;

  out.factions.sort((a, b) => b.mults.hacking - a.mults.hacking);

  const path = `logs/gangaugs-${out.ts}.json`;
  ns.write(path, JSON.stringify(out, null, 2), "w");

  ns.tprint("=== gang faction aug catalogs (cumulative mults, NFG counted once) ===");
  for (const entry of out.factions) {
    ns.tprint(
      `${entry.faction.padEnd(24)} augs ${String(entry.augCount).padStart(3)} | ` +
      `hack x${entry.mults.hacking.toFixed(3)} | exp x${entry.mults.hacking_exp.toFixed(3)} | ` +
      `maxRep ${ns.format.number(entry.maxRepReq)} | cost ${ns.format.number(entry.totalPrice)}`
    );
  }
  ns.tprint(`UNION (${union.augCount} distinct augs): hack x${union.mults.hacking.toFixed(3)} | exp x${union.mults.hacking_exp.toFixed(3)}`);
  for (const e of out.errors) ns.tprint(`ERROR: ${e.faction}: ${e.error}`);
  ns.tprint(`-> ${path}`);
}
