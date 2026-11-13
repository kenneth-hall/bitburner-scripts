/**
 * stanekworker.js - charge Stanek's Gift fragments forever, round-robin.
 * args: x1 y1 x2 y2 ... (root coordinates of the fragments to charge).
 * Launched by stanekcharger.js with as many threads as the host allows; charge per call
 * scales with thread count. ASCII-only.
 */
/** @param {NS} ns */
export async function main(ns) {
  const coords = [];
  for (let i = 0; i + 1 < ns.args.length; i += 2) coords.push([Number(ns.args[i]), Number(ns.args[i + 1])]);
  if (coords.length === 0) return;
  for (let i = 0; ; i = (i + 1) % coords.length) {
    await ns.stanek.chargeFragment(coords[i][0], coords[i][1]);
  }
}
