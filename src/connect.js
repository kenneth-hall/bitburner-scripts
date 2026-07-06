// Finds the network path to a target server (default: CSEC, the CyberSec
// faction server) via BFS and lists the files sitting on it. Read-only --
// does not actually connect the terminal, so it's free to run.

import { findPath } from "./common.js";

const DEFAULT_TARGET = "CSEC";

/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0] ?? DEFAULT_TARGET;

  const path = findPath(ns, target);
  if (path === null) {
    ns.tprint(`ERROR: no route to ${target} found.`);
    return;
  }

  const files = ns.ls(target);

  ns.tprint(`===== path to ${target} =====`);
  ns.tprint(`  ${path.join(" -> ")}`);

  ns.tprint(`===== files on ${target} =====`);
  if (files.length === 0) {
    ns.tprint("No files found.");
  } else {
    for (const file of files) ns.tprint(`  ${file}`);
  }
}
