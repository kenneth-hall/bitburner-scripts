// Manual utility, run by hand -- prints cloud (purchased) server costs to
// the terminal. Two sections: what a fresh server costs at each standard
// power-of-2 size (mirrors purchasecloudservers.js's own size list), and
// what it'd cost to upgrade each server you already own to the next
// standard tier above its current size.

/** The standard power-of-2 purchase sizes up to ramLimit, starting at 16GB. */
export function standardSizes(ramLimit) {
  const sizes = [];
  for (let size = 16; size <= ramLimit; size *= 2) sizes.push(size);
  return sizes;
}

/** @param {NS} ns */
export async function main(ns) {
  const ramLimit = ns.cloud.getRamLimit();
  const sizes = standardSizes(ramLimit);

  const playerMoney = ns.getPlayer().money;
  const owned = ns.cloud.getServerNames();
  const serverLimit = ns.cloud.getServerLimit();

  ns.tprint("===== cloud server costs =====");
  ns.tprint(`Player money: $${ns.format.number(playerMoney)}`);
  ns.tprint(`Purchase slots: ${owned.length}/${serverLimit} used (${serverLimit - owned.length} free)`);

  ns.tprint("--- new purchase cost by size ---");
  for (const size of sizes) {
    const cost = ns.cloud.getServerCost(size);
    const afford = playerMoney >= cost ? "" : "  -- can't afford";
    ns.tprint(`  ${ns.format.ram(size).padStart(10)} : $${ns.format.number(cost)}${afford}`);
  }

  ns.tprint("--- owned servers: upgrade to next tier ---");
  if (owned.length === 0) {
    ns.tprint("  (none owned)");
  } else {
    for (const hostname of owned) {
      const currentRam = ns.getServerMaxRam(hostname);
      const nextSize = sizes.find((size) => size > currentRam);
      if (nextSize === undefined) {
        ns.tprint(`  ${hostname.padEnd(16)} ${ns.format.ram(currentRam).padStart(10)} -> already at max size`);
        continue;
      }
      const upgradeCost = ns.cloud.getServerUpgradeCost(hostname, nextSize);
      const afford = playerMoney >= upgradeCost ? "" : "  -- can't afford";
      ns.tprint(
        `  ${hostname.padEnd(16)} ${ns.format.ram(currentRam).padStart(10)} -> ${ns.format.ram(nextSize).padStart(10)}: ` +
          `$${ns.format.number(upgradeCost)}${afford}`
      );
    }
  }
}
