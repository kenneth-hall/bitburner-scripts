/**
 * bn2probe.js -- one-off recon for the post-Tier-1 BN2 replan. Read-only.
 *
 * Answers the two numbers the gang-rep path turns on: how much NiteSec rep we
 * actually hold against The Red Pill's 2.5m gate, and what the current player
 * hacking multiplier is against the ~30-35 the 15,000 w0r1d_d43m0n gate needs.
 *
 * Bare output filename on purpose -- see gangaugs.js's note on vite's filter.
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const p = ns.getPlayer();
  const out = {
    ts: Date.now(),
    money: p.money,
    hackingLevel: ns.getHackingLevel(),
    mults: p.mults,
    factions: p.factions,
    factionRep: {},
    ownedAugs: ns.getResetInfo().ownedAugs,
  };

  for (const f of p.factions) {
    try {
      out.factionRep[f] = ns.singularity.getFactionRep(f);
    } catch (e) {
      out.factionRep[f] = String(e);
    }
  }

  const path = `bn2probe-${out.ts}.json`;
  ns.write(path, JSON.stringify(out, null, 2), "w");

  ns.tprint(`=== BN2 probe ===`);
  ns.tprint(`hacking level ${out.hackingLevel} | mults.hacking x${p.mults.hacking.toFixed(3)} | exp x${p.mults.hacking_exp.toFixed(3)}`);
  ns.tprint(`money ${ns.format.number(p.money)} | owned augs ${Object.keys(out.ownedAugs).length}`);
  for (const f of p.factions) {
    ns.tprint(`  ${f.padEnd(24)} rep ${ns.format.number(out.factionRep[f])}`);
  }
  ns.tprint(`-> ${path}`);
}
