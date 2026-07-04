// ns-dependent helpers shared by multiple scripts. No policy decisions, no
// batching math -- keep the ns surface minimal and cheap. This file ends up
// in daemon.js's import bundle (via hosts.js), so it must never call
// anything Singularity or ns.cloud.* -- either would multiply daemon.js's
// RAM cost 16x without SF4. Keep this charter permanently, even as later
// items add more exports here.

/**
 * BFS parent-chain walk from `start` to `target`. Returns the hop list
 * inclusive of both ends (`[start]` when `start === target`), or `null` if
 * unreachable.
 */
function findPath(ns, target, start = "home") {
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

// Same 3-line implementation as daemon.js's private copy -- kept here so
// eventlog.js's companions (factionwatcher.js, backdoorfactions.js) don't
// each add a third/fourth copy. daemon.js's own copy is left untouched;
// rewiring daemon internals to import this is the later consolidation
// item's job, not this phase's.
function tprintTs(ns, message) {
  ns.tprint(`[${new Date().toLocaleTimeString()}] ${message}`);
}

export { findPath, tprintTs };
