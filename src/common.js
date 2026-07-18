// Shared ns-dependent helpers used by 2+ scripts. Charter (Phase 13): no
// policy decisions, no batching/finance math; keep the ns surface minimal and
// cheap (ns.scan, ns.tprint, ns.getScriptRam). Netscript RAM charging is
// reachability-based, not whole-file/bundle (Phase 9/13, re-confirmed Phase
// 16): an importer pays only for the helpers it actually calls, so
// co-locating helpers here never cross-charges an importer for a helper it
// never reaches. Nothing ns.cloud.*, nothing Singularity, ever.

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
 * BFS parent-chain walk from `start` (default "home") to target; returns the
 * hop list inclusive of both ends, or null if unreachable. The `start`
 * parameter (Phase 22) lets a caller path from wherever the player's terminal
 * currently sits -- ns.singularity.connect only reaches neighbors, so a
 * home-rooted path is useless once the player has moved. Default preserves
 * every existing call site (connect.js) byte-for-byte.
 */
export function findPath(ns, target, start = "home") {
  const visited = new Map([[start, null]]);
  const queue = [start];

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

/**
 * One BFS from home, reconstructed into every discovered host's full path at
 * once -- the all-targets counterpart to findPath's single-target walk.
 * Returns a Map<hostname, string[]> including "home" itself (path ["home"]).
 */
export function findAllPaths(ns) {
  const visited = new Map([["home", null]]);
  const queue = ["home"];

  while (queue.length > 0) {
    const host = queue.shift();
    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) {
        visited.set(neighbor, host);
        queue.push(neighbor);
      }
    }
  }

  const paths = new Map();
  for (const node of visited.keys()) {
    const path = [];
    for (let n = node; n !== null; n = visited.get(n)) {
      path.unshift(n);
    }
    paths.set(node, path);
  }
  return paths;
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

/**
 * Assembles the targets-ranking.json record from `entries` (already sliced to
 * the top N and live-refreshed) and the full unsliced count -- dashboard.js
 * derives its own top-3 + "(+N more)" from this.
 *
 * Pure. Lived in targetsmonitor.js until that script was retired (its ranking
 * duplicated getTargets analysis daemon.js already pays for -- ~9.5 GB of
 * getServer + the *Analyze* family, a second time, in a second process). It
 * sits in common.js rather than daemon.js so the unit test can import it
 * without dragging in the daemon.
 */
export function buildTargetsRanking(entries, totalCount, now) {
  return { timestamp: now, time: new Date(now).toLocaleTimeString(), totalCount, targets: entries };
}
