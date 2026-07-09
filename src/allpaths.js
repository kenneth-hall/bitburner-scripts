// Discovers every reachable server from home via BFS and prints its
// connection path -- an unbounded-depth alternative to the terminal's
// "scan-analyze". Read-only (ns.scan only, no Singularity): it doesn't
// connect anywhere, just reports the routes.

import { findAllPaths } from "./common.js";

/** @param {NS} ns */
export async function main(ns) {
  const paths = findAllPaths(ns);
  paths.delete("home");

  ns.tprint(`===== reachable servers (${paths.size}) =====`);
  if (paths.size === 0) {
    ns.tprint("No servers found.");
    return;
  }

  for (const host of [...paths.keys()].sort()) {
    ns.tprint(`${host}: ${paths.get(host).join(" -> ")}`);
  }
}
