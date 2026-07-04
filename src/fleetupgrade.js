// Permanent manual utility, not part of the daemon toolset (never launched
// by daemon.js) -- but not one-off either: it's a transactions-log call site
// (src/translog.js) now, run repeatedly whenever fleet upgrades are wanted.
// Repeatedly rebalances the whole owned cloud-server fleet: first
// spends money bringing every server below the fleet's current max RAM up to
// that level, then -- once the whole fleet is level -- spends money bumping
// every server up one power-of-2 tier together. Repeats (re-checking live
// player money each step, since a stale number would either overspend or
// leave cash on the table) until neither move is affordable. Once spending
// stops, every server is renamed to pserv-<sizeGB>gb-<index> (index fixed by
// its position in the original list) so the hostname always matches its
// actual capacity.
//
// Safe to run alongside daemon.js (Phase 4's serverExists guard covers the
// rename window). In-flight workers on a renamed host keep running
// uninterrupted and re-attach to the daemon's tracking at its next refresh --
// worker identity is filename + args, never hostname.

import { recordTransaction } from "./translog.js";

/** @param {NS} ns */
export async function main(ns) {
  const ramLimit = ns.cloud.getRamLimit();
  const owned = ns.cloud.getServerNames();
  if (owned.length === 0) {
    ns.tprint("No owned cloud servers to upgrade.");
    return;
  }

  const startMoney = ns.getPlayer().money;
  const report = [];

  while (true) {
    const maxRam = Math.max(...owned.map((h) => ns.getServerMaxRam(h)));
    const laggards = owned.filter((h) => ns.getServerMaxRam(h) < maxRam);

    if (laggards.length > 0) {
      const costs = laggards.map((h) => ns.cloud.getServerUpgradeCost(h, maxRam));
      if (costs.some((c) => c < 0)) {
        ns.tprint(`WARN: bad upgrade cost bringing a laggard up to ${maxRam}GB, stopping`);
        break;
      }
      const totalCost = costs.reduce((a, b) => a + b, 0);
      if (ns.getPlayer().money < totalCost) break; // can't afford to level the fleet up -- stop

      // ok's per-host boolean matters -- upgradeServer's return was
      // previously ignored, so a failed upgrade silently reported (and
      // logged) as if it had succeeded. Zip each host with its pre-sampled
      // cost (costs is index-aligned with laggards) and only report/record
      // what actually went through.
      const results = laggards.map((h, i) => ({ host: h, cost: costs[i], ok: ns.cloud.upgradeServer(h, maxRam) }));
      const succeeded = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      for (const r of failed) {
        ns.tprint(`WARN: upgradeServer failed for ${r.host} -> ${ns.format.ram(maxRam)}`);
      }
      if (succeeded.length > 0) {
        const succeededCost = succeeded.reduce((sum, r) => sum + r.cost, 0);
        report.push(
          `  Leveled ${succeeded.length} server(s) up to ${ns.format.ram(maxRam)}: ${succeeded.map((r) => r.host).join(", ")} ($${ns.format.number(succeededCost)})`,
        );
        recordTransaction(ns, {
          type: "expense",
          source: "fleet-upgrade",
          detail: `level to ${ns.format.ram(maxRam)}`,
          servers: succeeded.map((r) => r.host),
          amount: succeededCost,
          timestamp: Date.now(),
          time: new Date().toLocaleString(),
        });
      }
      continue;
    }

    // fleet is level -- try bumping everyone up one tier together
    if (maxRam >= ramLimit) break; // already at the ceiling, nothing left to do
    const nextTier = maxRam * 2;
    const costs = owned.map((h) => ns.cloud.getServerUpgradeCost(h, nextTier));
    if (costs.some((c) => c < 0)) {
      ns.tprint(`WARN: bad upgrade cost bumping fleet to ${nextTier}GB, stopping`);
      break;
    }
    const totalCost = costs.reduce((a, b) => a + b, 0);
    if (ns.getPlayer().money < totalCost) break; // can't afford to bump the whole fleet -- stop

    const results = owned.map((h, i) => ({ host: h, cost: costs[i], ok: ns.cloud.upgradeServer(h, nextTier) }));
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    for (const r of failed) {
      ns.tprint(`WARN: upgradeServer failed for ${r.host} -> ${ns.format.ram(nextTier)}`);
    }
    if (succeeded.length > 0) {
      const succeededCost = succeeded.reduce((sum, r) => sum + r.cost, 0);
      report.push(
        `  Bumped ${succeeded.length} server(s) ${ns.format.ram(maxRam)} -> ${ns.format.ram(nextTier)}: ${succeeded.map((r) => r.host).join(", ")} ($${ns.format.number(succeededCost)})`,
      );
      recordTransaction(ns, {
        type: "expense",
        source: "fleet-upgrade",
        detail: `bump ${ns.format.ram(maxRam)} -> ${ns.format.ram(nextTier)}`,
        servers: succeeded.map((r) => r.host),
        amount: succeededCost,
        timestamp: Date.now(),
        time: new Date().toLocaleString(),
      });
    }
  }

  // renameServer's boolean return matters: the docs don't say whether a
  // rename can fail while scripts are running on the box, but assume it can
  // -- calling getServerMaxRam on a name that never actually took would
  // throw. On failure, warn and keep reporting under the old (still real)
  // name instead.
  const newNames = owned.map((h, i) => `pserv-${ns.getServerMaxRam(h)}gb-${i}`);
  const reportedNames = owned.map((h, i) => {
    if (newNames[i] === h) return h;
    const renamed = ns.cloud.renameServer(h, newNames[i]);
    if (!renamed) {
      ns.tprint(`WARN: rename ${h} -> ${newNames[i]} failed, still reporting under ${h}`);
      return h;
    }
    return newNames[i];
  });

  const spent = startMoney - ns.getPlayer().money;
  ns.tprint("===== fleet upgrade summary =====");
  if (report.length === 0) ns.tprint("  Nothing upgraded (not enough money for any move).");
  for (const line of report) ns.tprint(line);
  for (const name of reportedNames) ns.tprint(`  ${name}: ${ns.format.ram(ns.getServerMaxRam(name))}`);
  ns.tprint(`Spent $${ns.format.number(spent)}, $${ns.format.number(ns.getPlayer().money)} remaining.`);
}
