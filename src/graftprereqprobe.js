/** Read the real prerequisite chain for every combat-graftable aug.
 * graftrecon.js never read getAugmentationPrereq, so every ladder built from its
 * output is admissibility-blind. Read-only. Writes graftprereqprobe-<epoch>.json. */
export async function main(ns) {
  const out = { ts: Date.now(), iso: new Date().toISOString(), prereqs: {}, owned: [], errors: {} };
  try { out.owned = ns.singularity.getOwnedAugmentations(true); } catch (e) { out.errors.owned = String(e).slice(0, 200); }
  let names = [];
  try { names = ns.grafting.getGraftableAugmentations(); } catch (e) { out.errors.catalog = String(e).slice(0, 200); }
  out.graftableCount = names.length;
  for (const n of names) {
    try { out.prereqs[n] = ns.singularity.getAugmentationPrereq(n); }
    catch (e) { out.errors[n] = String(e).slice(0, 120); }
  }
  const p = `graftprereqprobe-${out.ts}.json`;
  ns.write(p, JSON.stringify(out, null, 2), "w");
  ns.tprint(`graftprereqprobe -> ${p} (${names.length} augs, ${Object.keys(out.prereqs).filter(k => out.prereqs[k].length).length} with prereqs)`);
}
