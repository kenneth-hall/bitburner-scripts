// ONE-OFF utility, not part of the daemon toolset -- run once by hand, then
// delete. Repeatedly rebalances the whole owned cloud-server fleet: first
// spends money bringing every server below the fleet's current max RAM up to
// that level, then -- once the whole fleet is level -- spends money bumping
// every server up one power-of-2 tier together. Repeats (re-checking live
// player money each step, since a stale number would either overspend or
// leave cash on the table) until neither move is affordable. Once spending
// stops, every server is renamed to pserv-<sizeGB>gb-<index> (index fixed by
// its position in the original list) so the hostname always matches its
// actual capacity.

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

      for (const h of laggards) ns.cloud.upgradeServer(h, maxRam);
      report.push(
        `  Leveled ${laggards.length} server(s) up to ${ns.format.ram(maxRam)}: ${laggards.join(", ")} ($${ns.format.number(totalCost)})`,
      );
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

    for (const h of owned) ns.cloud.upgradeServer(h, nextTier);
    report.push(
      `  Bumped all ${owned.length} servers ${ns.format.ram(maxRam)} -> ${ns.format.ram(nextTier)} ($${ns.format.number(totalCost)})`,
    );
  }

  const newNames = owned.map((h, i) => `pserv-${ns.getServerMaxRam(h)}gb-${i}`);
  owned.forEach((h, i) => {
    if (newNames[i] !== h) ns.cloud.renameServer(h, newNames[i]);
  });

  const spent = startMoney - ns.getPlayer().money;
  ns.tprint("===== fleet upgrade summary =====");
  if (report.length === 0) ns.tprint("  Nothing upgraded (not enough money for any move).");
  for (const line of report) ns.tprint(line);
  for (const name of newNames) ns.tprint(`  ${name}: ${ns.format.ram(ns.getServerMaxRam(name))}`);
  ns.tprint(`Spent $${ns.format.number(spent)}, $${ns.format.number(ns.getPlayer().money)} remaining.`);
}
