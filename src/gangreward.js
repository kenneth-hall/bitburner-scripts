/**
 * Phase 30 -- what does TERRITORY actually reward? (read-only, Formulas-based)
 *
 * Territory is the only thing gang warfare wins. This quantifies its payoff:
 * uses ns.formulas.gang.respectGain/moneyGain on a real member+task, varying
 * ONLY the gang's territory fraction, to read the exact multiplier curve. Tells
 * us what we're currently getting at 14.3% and what 100% would buy -- i.e. the
 * real cost of deferring Tier 4.
 *
 * Read-only. No action-group calls; nothing is assigned or engaged.
 *
 * -> logs/gangreward-<epoch>.json (+ terminal summary)
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog('ALL');
  const out = { epoch: Date.now(), member: null, task: null, rows: [], errors: [] };

  try {
    const gang = ns.gang.getGangInformation();
    const names = ns.gang.getMemberNames();
    // Pick the top respect earner as the representative member.
    let best = null;
    for (const n of names) {
      const m = ns.gang.getMemberInformation(n);
      if (!best || (m.respectGain ?? 0) > (best.respectGain ?? 0)) best = m;
    }
    out.member = { name: best.name, task: best.task };
    const task = ns.gang.getTaskStats(best.task);
    out.task = best.task;

    const territories = [0.0, 0.143, 0.25, 0.5, 0.857, 1.0];
    const base = { ...gang };
    for (const terr of territories) {
      const g = { ...base, territory: terr };
      const respect = ns.formulas.gang.respectGain(g, best, task);
      const money = ns.formulas.gang.moneyGain(g, best, task);
      out.rows.push({ territory: terr, respect, money });
      await ns.sleep(0);
    }
  } catch (err) {
    out.errors.push(String(err.message || err));
  }

  const fileName = `gangreward-${out.epoch}.json`;
  ns.write(fileName, JSON.stringify(out, null, 2), 'w');

  if (out.rows.length) {
    const cur = out.rows.find((r) => r.territory === 0.143) || out.rows[0];
    ns.tprint(`INFO gangreward: member=${out.member.name} task=${out.task}`);
    // Money and respect scale with territory at DIFFERENT exponents (money
    // ~territory^2.5, respect much flatter) -- print a separate vs-current
    // multiplier for each. A single shared column caused the Phase 30 verdict
    // to apply the respect ratio (~20x) to money too, understating the real
    // money prize (~124x at 100%) ~8x (fixed 2026-07-22).
    ns.tprint(`  territory   respect/t   respect-x     money/t   money-x`);
    for (const r of out.rows) {
      const rMult = cur.respect > 0 ? r.respect / cur.respect : 0;
      const mMult = cur.money > 0 ? r.money / cur.money : 0;
      const mark = r.territory === 0.143 ? '  <- current' : '';
      ns.tprint(
        `  ${(r.territory * 100).toFixed(1).padStart(5)}%   ` +
          `${ns.format.number(r.respect).padStart(9)}  ${(rMult.toFixed(2) + 'x').padStart(8)}   ` +
          `${ns.format.number(r.money).padStart(9)}  ${(mMult.toFixed(2) + 'x').padStart(7)}${mark}`,
      );
    }
  }
  for (const e of out.errors) ns.tprint(`  ERR ${e}`);
  ns.tprint(`  -> ${fileName}`);
}
