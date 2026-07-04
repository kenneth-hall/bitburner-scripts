// One-cycle share worker (Phase 8): shares this host's RAM with factions for
// ~10 seconds, then exits. daemon.js decides thread count and re-launches a
// fresh copy every tick to keep the live share pool near its target -- no
// loop, no ns.kill call sites, matching the other workers' natural-exit
// design. args[0] is an ignored, monotonically increasing launch counter
// (see daemon.js): without it, Bitburner's duplicate filename+args exec
// restriction would block a top-up from relaunching on a host that's still
// running a share worker from a previous tick.
/** @param {NS} ns */
export async function main(ns) {
  await ns.share();
}
