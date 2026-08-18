/**
 * sleevememprobe.js - prices the BN10-EXCLUSIVE, PERMANENT sleeve purchases.
 *
 * WHY (phase-41 acceptance Z1). Sleeve MEMORY is the only purchase in the game that is both
 * BN10-exclusive and permanent across every future node: memory sets a sleeve's STARTING
 * synchronization on entry to any later BitNode, and it can never be bought outside BN10.
 * Q41-4 deferred it with the wake condition "expires at Bladeburner join, at which point it must
 * be priced explicitly rather than forgotten" -- and the join is exactly what just happened.
 *
 * This prices it so the decision is made on numbers instead of quietly skipped.
 *
 * Read-only: reads prices and sleeve state. Buys nothing.
 *
 * RAM: ~16 GB (4 sleeve methods x 4 GB).
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const rec = { ts: Date.now(), iso: new Date().toISOString(),
    note: "Z1: price sleeve memory (BN10-exclusive, permanent across nodes) + next sleeve" };

  const p = ns.getPlayer();
  rec.money = p.money;

  const count = ns.sleeve.getNumSleeves();
  rec.numSleeves = count;
  rec.sleeves = [];
  for (let i = 0; i < count; i++) {
    const s = ns.sleeve.getSleeve(i);
    const row = { index: i, memory: s.memory, sync: s.sync, shock: s.shock, steps: [] };
    for (const amount of [1, 5, 10, 25, 50, 99]) {
      try {
        const cost = ns.sleeve.getMemoryUpgradeCost(i, amount);
        row.steps.push({ amount, cost, affordable: cost <= p.money,
          memoryAfter: Math.min(100, s.memory + amount) });
      } catch (err) {
        row.steps.push({ amount, error: String(err).slice(0, 120) });
      }
      await ns.sleep(3);
    }
    rec.sleeves.push(row);
  }

  try { rec.nextSleeveCost = ns.sleeve.getSleeveCost(); }
  catch (err) { rec.nextSleeveCostError = String(err).slice(0, 150); }

  ns.write("sleevememprobe-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  ns.tprint("sleevememprobe: " + count + " sleeve(s) | $" + ns.format.number(p.money));
  for (const r of rec.sleeves) {
    ns.tprint("  sleeve " + r.index + ": memory " + r.memory + " sync " + r.sync.toFixed(1) +
      " shock " + r.shock.toFixed(1));
    for (const st of r.steps) {
      if (st.error) { ns.tprint("    +" + st.amount + ": ERR " + st.error); continue; }
      ns.tprint("    +" + String(st.amount).padStart(2) + " memory -> " + st.memoryAfter +
        "  $" + ns.format.number(st.cost) + (st.affordable ? "  [affordable]" : "  [too dear]"));
    }
  }
  ns.tprint("  next sleeve: " + (rec.nextSleeveCost !== undefined
    ? "$" + ns.format.number(rec.nextSleeveCost) : rec.nextSleeveCostError));
  ns.tprint("  -> sleevememprobe-" + rec.ts + ".json");
}
