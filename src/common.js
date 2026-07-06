// Shared ns-dependent helpers used by 2+ scripts. Charter (Phase 13): no
// policy decisions, no batching/finance math; keep the ns surface minimal and
// cheap (ns.scan, ns.tprint, ns.getScriptRam) -- every importer's bundle pays
// for all of it. Nothing ns.cloud.*, nothing Singularity, ever.

import { WORKER_SCRIPTS } from "./scheduler.js";

/** BFS from home; returns every discovered hostname (excluding home itself). */
export function scanNetwork(ns) {
  const visited = new Set(["home"]);
  const queue = ["home"];
  const found = [];

  while (queue.length > 0) {
    const host = queue.shift();
    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        found.push(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return found;
}

/**
 * BFS parent-chain walk from home to target; returns the hop list inclusive
 * of both ends, or null if unreachable.
 */
export function findPath(ns, target) {
  const visited = new Map([["home", null]]);
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    if (host === target) break;
    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) {
        visited.set(neighbor, host);
        queue.push(neighbor);
      }
    }
  }

  if (!visited.has(target)) return null;

  const path = [];
  for (let node = target; node !== null; node = visited.get(node)) {
    path.unshift(node);
  }
  return path;
}

// daemon.js runs unattended for a long time, so unlike a one-shot manual
// utility's output (already implicitly timestamped by "you just ran it"),
// its terminal notifications fire at unpredictable moments during that run
// -- knowing *when* matters, so every one of them gets a timestamp prefix.
export function tprintTs(ns, message) {
  ns.tprint(`[${new Date().toLocaleTimeString()}] ${message}`);
}

/**
 * The three-worker getScriptRam map (hack/grow/weaken) -- read once per call,
 * not per server, since these don't change between servers, only between
 * game restarts (script file edits). WORKER_SCRIPTS deliberately means "the
 * three targeted batch workers" (scheduler.js's own comment); no share key,
 * no include-share flag.
 */
export function workerRamCosts(ns) {
  return {
    [WORKER_SCRIPTS.hack]: ns.getScriptRam(WORKER_SCRIPTS.hack, "home"),
    [WORKER_SCRIPTS.grow]: ns.getScriptRam(WORKER_SCRIPTS.grow, "home"),
    [WORKER_SCRIPTS.weaken]: ns.getScriptRam(WORKER_SCRIPTS.weaken, "home"),
  };
}
