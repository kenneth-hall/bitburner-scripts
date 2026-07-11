// One-off diagnostic: dump the current owned-augmentation stack and the
// aggregate player multipliers, WITHOUT Singularity. Two base-cost calls do
// the whole job:
//   ns.getResetInfo().ownedAugs -- Map<name, level> of every installed aug
//     (the level is meaningful for NeuroFlux Governor; 1 for everything else).
//   ns.getPlayer().mults        -- the summed multiplier effect of that stack
//     (mults.hacking is the "level-mult", mults.hacking_exp the "exp-mult"
//     the Daedalus-2500 plan tracks -- see BACKLOG.md).
// The augmentation *shop* (what's for sale, prices, rep needed) is Singularity-
// gated and NOT visible here -- read that from the in-game UI / CDP driver.
//
// Read-only. Writes a fresh timestamped auginfo-<epoch>.json per run so pre-
// vs post-install comparisons each land as their own file in logs/ (same
// one-shot pattern as targets-summary-*.json), then tprints a summary.
/** @param {NS} ns */
export async function main(ns) {
  const owned = ns.getResetInfo().ownedAugs; // Map<string, number>
  const player = ns.getPlayer();
  const mults = player.mults;

  // Map -> plain object, sorted by name, so the JSON is stable/diffable.
  const augs = {};
  for (const name of [...owned.keys()].sort()) augs[name] = owned.get(name);
  const nfgLevel = owned.get("NeuroFlux Governor") ?? 0;

  const result = {
    time: new Date().toLocaleString(),
    timestamp: Date.now(),
    hackingLevel: ns.getHackingLevel(),
    hackingExp: player.exp.hacking,
    augCount: owned.size,
    neurofluxLevel: nfgLevel,
    // Full multiplier block for completeness; the hacking-relevant ones are
    // pulled out in the tprint below.
    mults,
    ownedAugs: augs,
  };

  const file = `auginfo-${result.timestamp}.json`;
  ns.write(file, JSON.stringify(result, null, 2), "w");

  const f3 = (x) => x.toFixed(3);
  ns.tprint(`\n===== AUG INFO -- ${result.augCount} augs owned (NeuroFlux Gov lvl ${nfgLevel}) =====`);
  ns.tprint(`  hacking level: ${result.hackingLevel}   exp: ${ns.format.number(result.hackingExp)}`);
  ns.tprint(`  HACKING MULTS  level(hacking) ${f3(mults.hacking)}   exp(hacking_exp) ${f3(mults.hacking_exp)}`);
  ns.tprint(
    `                 money ${f3(mults.hacking_money)}  grow ${f3(mults.hacking_grow)}  ` +
      `chance ${f3(mults.hacking_chance)}  speed ${f3(mults.hacking_speed)}`,
  );
  ns.tprint(`  owned augmentations:`);
  for (const name of [...owned.keys()].sort()) {
    const lvl = owned.get(name);
    ns.tprint(`    ${name}${lvl > 1 ? `  x${lvl}` : ""}`);
  }
  ns.tprint(`  full multiplier block + machine-readable copy -> logs/${file}`);
}
