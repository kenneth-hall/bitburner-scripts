// One-shot XP-engine worker (Phase 20): hacks a target once and exits. Distinct
// filename from hack.js so the money batcher's in-flight sweep never counts
// it (see phase-20-xpfarm.spec.md S1) -- xpfarm.js decides thread count, no
// decision logic belongs in here. No additionalMsec: the XP engine has no
// batch timing to offset, unlike the batcher's hack.js.
// args[1] is an ignored, monotonically increasing launch uid (same
// duplicate-filename+args exec-restriction workaround as share.js's counter).
/** @param {NS} ns */
export async function main(ns) {
  await ns.hack(String(ns.args[0]));
}
