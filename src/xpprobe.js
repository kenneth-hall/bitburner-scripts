// Phase 20 brainstorm probe (throwaway). Answers open-Q1 (does hack exp depend
// on the target's available money?) and gathers open-Q2 data (how hackExp /
// hackTime / hackChance move with security), so the spec is handed facts, not a
// fork. Analytical via Formulas.exe when owned (clean, no draining); otherwise
// reports that and leaves the live test to a follow-up.
// Run: `run xpprobe.js <target>` (defaults to fulcrumassets).
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0] ?? "fulcrumassets";
  const hasF = ns.fileExists("Formulas.exe", "home");
  const out = { target, hasFormulas: hasF, time: new Date().toLocaleString() };

  const s = ns.getServer(target);
  const p = ns.getPlayer();
  out.server = {
    reqLevel: s.requiredHackingSkill,
    minDifficulty: s.minDifficulty,
    baseDifficulty: s.baseDifficulty,
    hackDifficulty: s.hackDifficulty,
    moneyMax: s.moneyMax,
    moneyAvailable: s.moneyAvailable,
  };

  if (hasF) {
    const F = ns.formulas.hacking;
    // Q1: hackExp with money forced high vs zero, everything else equal.
    const sFullMoney = { ...s, moneyAvailable: s.moneyMax };
    const sZeroMoney = { ...s, moneyAvailable: 0 };
    out.hackExp_fullMoney = F.hackExp(sFullMoney, p);
    out.hackExp_zeroMoney = F.hackExp(sZeroMoney, p);
    out.Q1_moneyIndependent = out.hackExp_fullMoney === out.hackExp_zeroMoney;

    // Q2: how the op behaves at min security vs current security.
    const sMinSec = { ...s, hackDifficulty: s.minDifficulty };
    out.hackExp_minSec = F.hackExp(sMinSec, p);
    out.hackTime_minSec_s = F.hackTime(sMinSec, p) / 1000;
    out.hackTime_curSec_s = F.hackTime(s, p) / 1000;
    out.hackChance_minSec = F.hackChance(sMinSec, p);
    out.hackChance_curSec = F.hackChance(s, p);
    // Does hackExp track current security or base difficulty? (min vs cur)
    out.hackExp_tracksSecurity = out.hackExp_minSec !== out.hackExp_fullMoney;
  }

  ns.write("xpprobe-result.json", JSON.stringify(out, null, 2), "w");
  ns.tprint("\n===== XP PROBE (" + target + ") =====");
  ns.tprint("  Formulas.exe: " + hasF);
  if (hasF) {
    ns.tprint(`  Q1 hackExp fullMoney=${out.hackExp_fullMoney.toFixed(4)}  zeroMoney=${out.hackExp_zeroMoney.toFixed(4)}  -> money-independent: ${out.Q1_moneyIndependent}`);
    ns.tprint(`  Q2 hackTime minSec=${out.hackTime_minSec_s.toFixed(1)}s  curSec=${out.hackTime_curSec_s.toFixed(1)}s   hackChance minSec=${(out.hackChance_minSec*100).toFixed(1)}%`);
    ns.tprint(`     hackExp minSec=${out.hackExp_minSec.toFixed(4)} (tracks security: ${out.hackExp_tracksSecurity})`);
  } else {
    ns.tprint("  Formulas.exe not owned -- Q1 needs a live hack-exp delta test instead.");
  }
}
