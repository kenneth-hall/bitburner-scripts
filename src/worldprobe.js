/** @param {NS} ns
 * One-off: confirm w0r1d_d43m0n has spawned (Red Pill) and read its LIVE gates.
 * Writes a log so the result survives lossy terminal copy.
 *
 * Reused for Phase 33's WD-gate checkpoint (phase-33-money-throughput.spec.md
 * work item 6/L3) instead of writing a duplicate probe -- this script already
 * does exactly what that item asked for (getServerRequiredHackingLevel +
 * hasRootAccess + hacking level, read-only, logged). It predates BN2 (its
 * original "Delete after BN1" note is stale -- the same checkpoint recurs
 * every node past a Red Pill install, so it stays).
 *
 * 2026-07-21: the write path was `logs/worldprobe-*.json` directly, which is
 * NOT the bare-filename + vite.config.ts-filter convention every other
 * one-shot probe uses (sf4check.js, auginfo.js, ...) -- so its output was
 * never actually pulled to disk by viteburner's scoped download. Fixed to
 * match: bare filename here, the `logs/` prefix supplied by the filter.
 *
 * 2026-07-21: dropped the `ns.getServer(host)` call (backdoorInstalled/
 * numOpenPortsRequired) -- measured 3.8 GB against Phase 33's R2 gate (<=2.0
 * GB), and `getServer` was the whole excess (the other three calls are all
 * base-tier). Neither field is what this checkpoint needs (the hacking-level
 * gate); backdoor status is `backdoorwd.js`'s job, not this probe's.
 */
export async function main(ns) {
  const host = "w0r1d_d43m0n";
  const out = { time: new Date().toLocaleString(), timestamp: Date.now(), host };
  try {
    out.exists = true;
    out.requiredHackingSkill = ns.getServerRequiredHackingLevel(host);
    out.hasAdminRights = ns.hasRootAccess(host);
    out.playerHacking = ns.getHackingLevel();
    out.gap = out.requiredHackingSkill - out.playerHacking;
  } catch (e) {
    out.exists = false;
    out.error = String(e);
  }
  const file = `worldprobe-${out.timestamp}.json`;
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint("=== W0R1D_D43M0N PROBE ===");
  ns.tprint(JSON.stringify(out));
  ns.tprint(`log -> logs/${file}`);
}
