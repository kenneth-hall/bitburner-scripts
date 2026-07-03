// ONE-OFF utility, not part of the daemon toolset -- run once by hand, then
// delete. Removes daemon-log.json, the orphaned file left on home from
// before the export was renamed to daemon-batch-log.json; daemon.js no
// longer writes to the old name, so it just sits there unused.

/** @param {NS} ns */
export async function main(ns) {
  if (ns.rm("daemon-log.json")) {
    ns.tprint("Deleted daemon-log.json");
  } else {
    ns.tprint("daemon-log.json not found (already gone)");
  }
}
