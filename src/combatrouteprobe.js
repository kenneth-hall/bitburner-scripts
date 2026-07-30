/**
 * combatrouteprobe.js - one-off: pick the cheapest route from combat stats 1 to
 * 100, the gate on joinBladeburnerDivision() in BN6.
 *
 * Read-only (getCrimeStats / getCrimeChance / getPlayer / formulas). Commits no
 * crime and starts no workout -- it only reads the tables and does the arithmetic.
 *
 * Measured context this exists to settle: Iron Gym is $120/sec per stat and
 * trains ONE stat at a time (read off the live UI), against $2.7k banked at
 * $0/s income -- so gym is priced out for now. Crime is free and pays, but at
 * combat 1 the only all-four-stat crime (Mug) shows 5.15% success. This probe
 * decides whether crime is actually viable or whether the whole gate is
 * income-blocked like everything else in the node right now.
 *
 * ⚠️ One genuine unknown it CANNOT settle: whether a FAILED crime still grants
 * exp (and if so at what fraction). Bitburner is widely believed to grant
 * reduced exp on failure, but that is not in markdown/ anywhere, so this reports
 * BOTH bounds -- successOnly (pessimistic) and allAttempts (optimistic) -- and
 * the truth is somewhere between. Resolve it by measuring a live crime loop.
 *
 * Writes combatrouteprobe-<epoch>.json.
 */

const CRIMES = [
  "Shoplift", "Rob Store", "Mug", "Larceny", "Deal Drugs", "Bond Forgery",
  "Traffick Arms", "Homicide", "Grand Theft Auto", "Kidnap", "Assassination", "Heist",
];

const COMBAT = ["strength", "defense", "dexterity", "agility"];
const TARGET_LEVEL = 100;
const IRON_GYM_COST_PER_SEC = 120; // read off the live Iron Gym UI 2026-07-29

export async function main(ns) {
  const out = { ts: Date.now(), iso: new Date().toISOString() };
  const pl = ns.getPlayer();
  const sk = pl.skills;
  const ex = pl.exp;
  const mu = pl.mults;

  const f = ns.formulas.skills;

  // Exp still needed per stat to reach level 100.
  const need = {};
  let needTotal = 0;
  for (const s of COMBAT) {
    const target = f.calculateExp(TARGET_LEVEL, mu[s]);
    const remaining = Math.max(0, target - ex[s]);
    need[s] = { level: sk[s], mult: mu[s], expNow: ex[s], expForTarget: target, expNeeded: remaining };
    needTotal += remaining;
  }
  out.need = need;
  out.needTotalAcrossFourStats = needTotal;
  out.money = ns.getServerMoneyAvailable("home");

  // --- crime table ---
  const rows = [];
  for (const name of CRIMES) {
    let st, chance;
    try {
      st = ns.singularity.getCrimeStats(name);
      chance = ns.singularity.getCrimeChance(name);
    } catch (err) {
      rows.push({ crime: name, error: String(err).slice(0, 200) });
      continue;
    }
    const secs = st.time / 1000;
    const perStat = {};
    let trainsAllFour = true;
    for (const s of COMBAT) {
      const raw = st[s + "_exp"] ?? 0;
      perStat[s] = raw;
      if (raw <= 0) trainsAllFour = false;
    }
    // Two bounds on wall-clock to get EVERY combat stat to 100. The binding stat
    // is the slowest one, so take the max over stats.
    const secsFor = (expMultiplier) => {
      let worst = 0;
      for (const s of COMBAT) {
        const perSec = (perStat[s] * expMultiplier) / secs;
        if (perSec <= 0) return Infinity;
        worst = Math.max(worst, need[s].expNeeded / perSec);
      }
      return worst;
    };
    rows.push({
      crime: name,
      chance,
      timeSec: secs,
      money: st.money,
      moneyPerSec: st.money * chance / secs,
      karma: st.karma,
      kills: st.kills,
      difficulty: st.difficulty,
      trainsAllFour,
      expPerCrime: perStat,
      intelligenceExp: st.intelligence_exp ?? 0,
      secsToAll100_successOnly: secsFor(chance),
      secsToAll100_allAttempts: secsFor(1),
    });
  }
  rows.sort((a, b) => (a.secsToAll100_successOnly ?? Infinity) - (b.secsToAll100_successOnly ?? Infinity));
  out.crimes = rows;

  // --- gym comparison ---
  // Gym trains ONE stat at a time, so total time is the SUM over stats, and the
  // dollar cost is that whole duration at the per-second rate. Iron Gym's exp
  // rate is not exposed by any API, so this reports the cost of the time rather
  // than pretending to know the rate.
  const best = rows.find((r) => Number.isFinite(r.secsToAll100_successOnly));
  out.gym = {
    ironGymCostPerSecPerStat: IRON_GYM_COST_PER_SEC,
    note: "Gym exp/sec is not exposed by any ns API -- cost side only. Trains one stat at a time (4 sequential runs).",
    affordableSecondsAtCurrentMoney: out.money / IRON_GYM_COST_PER_SEC,
    costIfItTook_1h_perStat: IRON_GYM_COST_PER_SEC * 3600 * 4,
    costIfItTook_10min_perStat: IRON_GYM_COST_PER_SEC * 600 * 4,
  };

  out.verdict = {
    bestCrime: best ? best.crime : null,
    bestCrimeHours_successOnly: best ? best.secsToAll100_successOnly / 3600 : null,
    bestCrimeHours_allAttempts: best ? best.secsToAll100_allAttempts / 3600 : null,
    bestCrimeMoneyPerSec: best ? best.moneyPerSec : null,
    gymPricedOut: out.money / IRON_GYM_COST_PER_SEC < 600,
  };

  const file = "combatrouteprobe-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");

  ns.tprint("=== combat 1->100 route ===");
  ns.tprint("  exp needed: " + ns.format.number(needTotal) + " across 4 stats");
  ns.tprint("  money $" + ns.format.number(out.money) + " -> gym buys " +
    ns.format.number(out.gym.affordableSecondsAtCurrentMoney) + "s of training");
  ns.tprint("  top crimes by time-to-all-100 (successOnly / allAttempts):");
  for (const r of rows.slice(0, 5)) {
    if (r.error) { ns.tprint("    " + r.crime + " ERR " + r.error); continue; }
    const a = Number.isFinite(r.secsToAll100_successOnly) ? (r.secsToAll100_successOnly / 3600).toFixed(2) + "h" : "never";
    const b = Number.isFinite(r.secsToAll100_allAttempts) ? (r.secsToAll100_allAttempts / 3600).toFixed(2) + "h" : "never";
    ns.tprint("    " + r.crime.padEnd(18) + " " + (r.chance * 100).toFixed(2) + "%  " +
      a + " / " + b + "  $" + ns.format.number(r.moneyPerSec) + "/s" +
      (r.trainsAllFour ? "  [all4]" : ""));
  }
  ns.tprint("  -> " + file);
}
