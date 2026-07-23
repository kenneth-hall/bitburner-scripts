/**
 * queuedgain.js — read-only. What's actually in the aug queue right now, and what would installing
 * it bank? Prints queuedCount, the queued augs' cumulative HACKING-mult (queuedGain, the metric the
 * install trigger gates on), and the current escalation factor (1.9^queuedCount) that an install
 * would reset. JSON out so it syncs. @param {NS} ns
 */
export async function main(ns) {
  const sing = ns.singularity;
  const installed = sing.getOwnedAugmentations(false);
  const owned = sing.getOwnedAugmentations(true); // purchased (queued) + installed
  // multiset diff: queued = owned minus installed
  const inst = [...installed];
  const queued = [];
  for (const n of owned) {
    const i = inst.indexOf(n);
    if (i >= 0) inst.splice(i, 1);
    else queued.push(n);
  }
  let gain = 1;
  const detail = queued.map((n) => {
    const h = sing.getAugmentationStats(n).hacking || 1;
    gain *= h;
    return { name: n, hack: h };
  });
  const escalation = Math.pow(1.9, queued.length);
  const out = { ts: Date.now(), queuedCount: queued.length, queuedGain: gain, escalationFactor: escalation, augs: detail };
  ns.write(`logs/queuedgain-${out.ts}.json`, JSON.stringify(out, null, 2), "w");
  ns.tprint(`==== queued gain ====`);
  ns.tprint(`  queued augs   : ${queued.length}`);
  ns.tprint(`  queuedGain    : ${gain.toFixed(4)}  (hacking-mult if installed; trigger gate = 1.1)`);
  ns.tprint(`  escalation now: ${escalation.toFixed(1)}x  (1.9^${queued.length}, reset by install)`);
  for (const d of detail) ns.tprint(`    ${d.hack.toFixed(3)}  ${d.name}`);
  ns.tprint(`  -> logs/queuedgain-${out.ts}.json`);
}
