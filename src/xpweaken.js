// One-shot XP-engine worker (Phase 20): weakens a target once and exits.
// Distinct filename from weaken.js so the money batcher's in-flight sweep
// never counts it (see phase-20-xpfarm.spec.md S1) -- xpfarm.js decides
// thread count, no decision logic belongs in here.
// args[1] is an ignored, monotonically increasing launch uid (same
// duplicate-filename+args exec-restriction workaround as share.js's counter).
/** @param {NS} ns */
export async function main(ns) {
  await ns.weaken(String(ns.args[0]));
}
