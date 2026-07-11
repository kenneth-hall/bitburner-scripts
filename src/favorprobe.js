/** @param {NS} ns
 * Donation/rep lock-down probe. Formulas.exe is authoritative for the money<->rep
 * curve; it is favor-AGNOSTIC, so we apply the faction favor bonus (1+favor/100)
 * ourselves. Favor is NOT scriptable without SF4 — pass the UI-read value below.
 * Everything the probe CANNOT know (NFG rep-req/price per level, NFG/ENM mult
 * effect) is listed at the end so the gap is explicit.
 */
export async function main(ns) {
  const f = ns.formulas.reputation;
  const p = ns.getPlayer();

  // UI-read inputs (confirm live; these are the only non-computed numbers here).
  const DAEDALUS_FAVOR = 160;            // read off the Daedalus page
  const favorMult = 1 + DAEDALUS_FAVOR / 100;

  // Known rep requirements (game constants, not assumptions).
  const AUG_REP = {
    "Analyze Engine (ENM)": 625_000,
    "DMA Upgrade (ENM)": 1_000_000,
    "Core V3 Upgrade (ENM)": 1_750_000,
    "The Red Pill": 2_500_000,
  };

  // donationForRep is favor-agnostic → favor-adjusted cost = baseline / favorMult.
  const costFor = (rep) => ({
    rep,
    baseline: f.donationForRep(rep, p),
    withFavor: f.donationForRep(rep, p) / favorMult,
  });
  const repTargets = [2.5e6, 5e6, 10e6, 20e6, 50e6];
  const moneyProbe = [1e12, 2e12, 5e12, 1e13];

  const out = {
    time: new Date().toLocaleString(),
    timestamp: Date.now(),
    moneyOnHand: p.money,
    faction_rep_mult: p.mults.faction_rep,
    assumedDaedalusFavor: DAEDALUS_FAVOR,
    favorMult,
    augRepRequirements: AUG_REP,
    donationCostForRep: repTargets.map(costFor),
    repFromMoney: moneyProbe.map((m) => ({
      money: m,
      baselineRep: f.repFromDonation(m, p),
      withFavorRep: f.repFromDonation(m, p) * favorMult,
    })),
    repToReach150Favor: f.calculateFavorToRep(150),
    favorFromInstallingAt2_5m: f.calculateRepToFavor(2_500_000),
  };
  const path = `logs/favorprobe-${out.timestamp}.json`;
  ns.write(path, JSON.stringify(out, null, 2), "w");

  const e = (n) => "$" + n.toExponential(3);
  ns.tprint("=== DONATION LOCK-DOWN PROBE ===");
  ns.tprint(`money on hand: ${e(p.money)} | faction_rep mult ${p.mults.faction_rep.toFixed(3)}`);
  ns.tprint(`assumed Daedalus favor ${DAEDALUS_FAVOR} -> x${favorMult.toFixed(2)} donation bonus (CONFIRM at UI)`);
  ns.tprint("rep target -> donate cost (baseline / with favor):");
  for (const t of out.donationCostForRep)
    ns.tprint(`  ${(t.rep / 1e6).toFixed(1)}m rep: ${e(t.baseline)} / ${e(t.withFavor)}`);
  ns.tprint(`aug rep reqs: Red Pill 2.5m, Core V3 1.75m, DMA 1.0m, Analyze 625k (all cleared by 2.5m)`);
  ns.tprint(`full JSON -> ${path}`);
}
