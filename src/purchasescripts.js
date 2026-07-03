// Manual utility that buys port-opener programs. daemon.js runs this once
// at startup; it's expensive to launch (Singularity RAM multiplier without
// SF4), so exec failures here are usually a home-RAM problem, not a bug.
/** @param {NS} ns */
export async function main(ns) {
  if (!ns.hasTorRouter()) {
    ns.tprint("ERROR: No TOR router. Purchase one before running purchasescripts.");
    return;
  }

  const available = ns.singularity.getDarkwebPrograms();
  const shoppingList = [];

  for (const program of available) {
    const cost = ns.singularity.getDarkwebProgramCost(program);
    if (cost > 0) shoppingList.push({ program, cost });
  }

  shoppingList.sort((a, b) => a.cost - b.cost);

  const purchased = [];
  const skipped = [];

  for (const { program, cost } of shoppingList) {
    if (ns.getPlayer().money < cost) {
      skipped.push(`${program}: need $${ns.format.number(cost)}`);
      continue;
    }
    if (ns.singularity.purchaseProgram(program)) {
      purchased.push(`${program}: $${ns.format.number(cost)}`);
    } else {
      skipped.push(`${program}: purchase failed`);
    }
  }

  ns.tprint("===== purchasescripts summary =====");
  ns.tprint(`Purchased (${purchased.length}):`);
  for (const line of purchased) ns.tprint(`  ${line}`);
  ns.tprint(`Skipped (${skipped.length}):`);
  for (const line of skipped) ns.tprint(`  ${line}`);
}
