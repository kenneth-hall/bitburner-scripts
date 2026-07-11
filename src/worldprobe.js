/** @param {NS} ns
 * One-off: confirm w0r1d_d43m0n has spawned (Red Pill) and read its LIVE gates.
 * Writes a log so the result survives lossy terminal copy. Delete after BN1.
 */
export async function main(ns) {
  const host = "w0r1d_d43m0n";
  const out = { time: new Date().toLocaleString(), timestamp: Date.now(), host };
  try {
    out.exists = true;
    out.requiredHackingSkill = ns.getServerRequiredHackingLevel(host);
    out.hasAdminRights = ns.hasRootAccess(host);
    const s = ns.getServer(host);
    out.backdoorInstalled = s.backdoorInstalled;
    out.numOpenPortsRequired = s.numOpenPortsRequired;
    out.playerHacking = ns.getHackingLevel();
    out.gap = out.requiredHackingSkill - out.playerHacking;
  } catch (e) {
    out.exists = false;
    out.error = String(e);
  }
  const path = `logs/worldprobe-${out.timestamp}.json`;
  ns.write(path, JSON.stringify(out, null, 2), "w");
  ns.tprint("=== W0R1D_D43M0N PROBE ===");
  ns.tprint(JSON.stringify(out));
  ns.tprint(`log -> ${path}`);
}
