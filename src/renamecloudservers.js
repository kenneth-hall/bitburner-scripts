// Manual utility, run by hand -- not wired into daemon.js. Renames every
// owned cloud server to the cloud-<n> pattern (no capacity in the name), so
// the hostname stops going stale every time cloudmanager.js/
// upgradecloudserver.js/fleetupgrade.js grows a server's RAM. Purely a
// rename -- never purchases or upgrades anything (that stays
// purchasecloudservers.js's / cloudmanager.js's / upgradecloudserver.js's /
// fleetupgrade.js's job). Idempotent: a server already named cloud-<n> is
// left alone (and its index reserved), so a re-run after buying more
// servers only touches the new ones and never collides with an
// already-renamed server -- and since Phase 11's cloudmanager.js already
// names auto-bought servers cloud-<n> itself (nextCloudName), this utility
// is now only needed for legacy pserv-* names.
// Usage: run renamecloudservers.js

const CLOUD_NAME_PATTERN = /^cloud-(\d+)$/;

/** Pure. Lowest non-negative integer not already in `usedIndices`. */
export function nextIndex(usedIndices) {
  let n = 0;
  while (usedIndices.has(n)) n++;
  return n;
}

/** @param {NS} ns */
export async function main(ns) {
  const owned = ns.cloud.getServerNames();
  if (owned.length === 0) {
    ns.tprint("No owned cloud servers to rename.");
    return;
  }

  const usedIndices = new Set();
  const toRename = [];
  for (const name of owned) {
    const match = CLOUD_NAME_PATTERN.exec(name);
    if (match) {
      usedIndices.add(Number(match[1]));
    } else {
      toRename.push(name);
    }
  }

  const renamed = [];
  const failed = [];
  for (const oldName of toRename) {
    const index = nextIndex(usedIndices);
    const newName = `cloud-${index}`;
    if (ns.cloud.renameServer(oldName, newName)) {
      usedIndices.add(index); // only claim the index once the rename actually took
      renamed.push({ oldName, newName });
    } else {
      failed.push(oldName);
    }
  }

  ns.tprint("===== renamecloudservers summary =====");
  if (renamed.length === 0 && failed.length === 0) {
    ns.tprint("  Every owned server already matches the cloud-<n> pattern -- nothing to rename.");
  }
  for (const r of renamed) ns.tprint(`  ${r.oldName} -> ${r.newName}`);
  for (const name of failed) ns.tprint(`WARN: rename failed for ${name} (still named ${name})`);
}
