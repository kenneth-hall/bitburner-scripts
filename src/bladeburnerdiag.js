/**
 * bladeburnerdiag.js - throwaway READ-ONLY ladder-readiness probe.
 *
 * 2026-09-07 rewrite: the previous version answered "is bladeburnertrial.js hung?", a
 * question from a dead phase. It now answers the live one: where is the black-op ladder,
 * what does every remaining op read for success chance RIGHT NOW, and what is stamina
 * doing -- because the 2026-09-06 run aborted on Shoulder of Orion after 37 failures with
 * stamina at 0.15, and bbblackop.js has no stamina gate.
 *
 * Writes bladeburnerprobe-<epoch>.json (reuses that synced filename; the vite filter
 * matches the FILE, not the script).
 */

const BLACK_OPS = [
  "Operation Typhoon", "Operation Zero", "Operation X", "Operation Titan",
  "Operation Ares", "Operation Archangel", "Operation Juggernaut",
  "Operation Red Dragon", "Operation K", "Operation Deckard", "Operation Tyrell",
  "Operation Wallace", "Operation Shoulder of Orion", "Operation Hyron",
  "Operation Morpheus", "Operation Ion Storm", "Operation Annihilus",
  "Operation Ultron", "Operation Centurion", "Operation Vindictus",
  "Operation Daedalus",
];

/** @param {NS} ns */
export async function main(ns) {
  const rec = { ts: Date.now(), iso: new Date().toISOString(), note: "ladder readiness probe" };
  rec.rank = ns.bladeburner.getRank();
  rec.skillPoints = ns.bladeburner.getSkillPoints();
  const [sc, sm] = ns.bladeburner.getStamina();
  rec.stamina = { current: sc, max: sm, fraction: sc / sm };
  const hp = ns.getPlayer().hp;
  rec.hpFraction = hp.current / hp.max;
  rec.city = ns.bladeburner.getCity();
  rec.chaos = ns.bladeburner.getCityChaos(rec.city);
  rec.teamSize = ns.bladeburner.getTeamSize();
  rec.skills = {};
  for (const s of ["Blade's Intuition", "Cloak", "Short-Circuit", "Digital Observer",
                   "Tracer", "Overclock", "Reaper", "Evasive System", "Datamancer",
                   "Cyber's Edge", "Hands of Midas", "Hyperdrive"]) {
    rec.skills[s] = ns.bladeburner.getSkillLevel(s);
  }
  const next = ns.bladeburner.getNextBlackOp();
  rec.nextBlackOp = next ? { name: next.name, rankRequired: next.rank } : null;

  const startIdx = next ? BLACK_OPS.indexOf(next.name) : BLACK_OPS.length;
  rec.opsCompleted = startIdx;
  rec.opsRemaining = BLACK_OPS.length - startIdx;
  rec.ops = [];
  for (let i = startIdx; i < BLACK_OPS.length; i++) {
    const name = BLACK_OPS[i];
    const row = { idx: i + 1, name };
    try {
      row.successChance = ns.bladeburner.getActionEstimatedSuccessChance("Black Operations", name);
      row.actionTimeMs = ns.bladeburner.getActionTime("Black Operations", name);
      row.rankGain = ns.bladeburner.getActionRepGain("Black Operations", name);
      row.countRemaining = ns.bladeburner.getActionCountRemaining("Black Operations", name);
    } catch (e) { row.error = String(e); }
    rec.ops.push(row);
  }


  // --- SP spend simulation (read-only): greedy by marginal multiplier gain -------------
  // Success multiplier is the PRODUCT (1+0.03*BI)*(1+0.04*DO), so spend by marginal value,
  // not list order -- the defect fixed in bbskillbuy.js (89372cb).
  const biL = rec.skills["Blade's Intuition"], doL = rec.skills["Digital Observer"];
  const costOne = (name, extra) => {
    // cumulative cost of `extra+1` levels minus cumulative cost of `extra` levels
    const a = extra > 0 ? ns.bladeburner.getSkillUpgradeCost(name, extra) : 0;
    const b = ns.bladeburner.getSkillUpgradeCost(name, extra + 1);
    return b - a;
  };
  let bank = rec.skillPoints, bi = 0, dob = 0, steps = 0;
  const mult = (B, D) => (1 + 0.03 * B) * (1 + 0.04 * D);
  while (steps < 5000) {
    const cB = costOne("Blade's Intuition", bi);
    const cD = costOne("Digital Observer", dob);
    const base = mult(biL + bi, doL + dob);
    const gB = cB > 0 && isFinite(cB) ? (mult(biL + bi + 1, doL + dob) - base) / cB : -1;
    const gD = cD > 0 && isFinite(cD) ? (mult(biL + bi, doL + dob + 1) - base) / cD : -1;
    if (gB <= 0 && gD <= 0) break;
    if (gB >= gD) { if (cB > bank) break; bank -= cB; bi++; }
    else { if (cD > bank) break; bank -= cD; dob++; }
    steps++;
  }
  rec.spendSim = {
    bankBefore: rec.skillPoints,
    bankAfter: bank,
    spent: rec.skillPoints - bank,
    biFrom: biL, biTo: biL + bi,
    doFrom: doL, doTo: doL + dob,
    multBefore: mult(biL, doL),
    multAfter: mult(biL + bi, doL + dob),
  };

  const file = "bladeburnerprobe-" + rec.ts + ".json";
  ns.write(file, JSON.stringify(rec, null, 2), "w");
  ns.tprint("bladeburnerdiag: wrote " + file + " | rank=" + rec.rank.toFixed(0) +
    " sp=" + rec.skillPoints + " stam=" + rec.stamina.fraction.toFixed(3) +
    " next=" + (next ? next.name : "NONE") + " remaining=" + rec.opsRemaining + " | SPsim mult " + rec.spendSim.multBefore.toFixed(1) + " -> " + rec.spendSim.multAfter.toFixed(1));
}

