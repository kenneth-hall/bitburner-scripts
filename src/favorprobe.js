/** @param {NS} ns */
export async function main(ns) {
  const f = ns.formulas.reputation;
  const p = ns.getPlayer();
  const money = p.money;
  const repFor150 = f.calculateFavorToRep(150);
  const favorFrom25m = f.calculateRepToFavor(2_500_000);
  const repFromAll = f.repFromDonation(money, p);
  const donateFor25m = f.donationForRep(2_500_000, p);
  const e = (n) => n.toExponential(3);
  ns.tprint("=== FAVOR/DONATION PROBE ===");
  ns.tprint(`money on hand: $${e(money)}`);
  ns.tprint(`rep to reach 150 favor (donation unlock): ${e(repFor150)}`);
  ns.tprint(`favor granted by installing at 2.5m rep: ${favorFrom25m.toFixed(1)}`);
  ns.tprint(`rep if you donated ALL money: ${e(repFromAll)}`);
  ns.tprint(`$ needed to buy 2.5m rep via donation: $${e(donateFor25m)}`);
}
