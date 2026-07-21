/**
 * Throwaway read-only probe: where is income coming from THIS install cycle?
 * Dumps ns.getMoneySources().sinceInstall (nonzero fields) + the gang's live
 * money rate to logs/moneysources-<epoch>.json + a terminal summary.
 * One-off per the one-off-scripts convention -- output to a file, not a paste.
 */
/** Pure-ish helper: nonzero numeric fields of one MoneySource block. */
function nonzeroFields(block) {
  const out = {};
  for (const [k, v] of Object.entries(block)) {
    if (typeof v === "number" && v !== 0 && k !== "total") out[k] = v;
  }
  return out;
}

/** @param {NS} ns */
export async function main(ns) {
  const sources = ns.getMoneySources();
  const src = sources.sinceInstall;
  const nonzero = nonzeroFields(src);
  // sinceStart too: settles whether it persists across an aug install (the
  // docs don't say) -- if it does, its totals will dwarf sinceInstall's after
  // today's install #14.
  const startBlock = sources.sinceStart;
  const nonzeroStart = nonzeroFields(startBlock);

  let gangRate = null;
  if (ns.gang.inGang()) {
    const g = ns.gang.getGangInformation();
    gangRate = g["moneyGainRate"]; // per gang tick (~ every 2s)
  }

  const total = src.total ?? Object.values(nonzero).reduce((a, b) => a + b, 0);
  const rows = Object.entries(nonzero).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  ns.tprint("===== income sources (this install cycle) =====");
  for (const [k, v] of rows) {
    const pct = total !== 0 ? ((v / total) * 100).toFixed(1) : "0";
    ns.tprint(`  ${k.padEnd(16)} $${ns.format.number(v)}  (${pct}% of net)`);
  }
  ns.tprint(`  ${"NET total".padEnd(16)} $${ns.format.number(total)}`);
  if (gangRate !== null) ns.tprint(`  gang moneyGainRate: $${ns.format.number(gangRate)}/tick (~/2s)`);

  const startTotal = startBlock.total ?? Object.values(nonzeroStart).reduce((a, b) => a + b, 0);
  ns.tprint(`  sinceStart net total: $${ns.format.number(startTotal)} (vs sinceInstall $${ns.format.number(total)})`);

  const out = {
    time: new Date().toLocaleString(),
    timestamp: Date.now(),
    sinceInstall: nonzero,
    netTotal: total,
    sinceStart: nonzeroStart,
    sinceStartNetTotal: startTotal,
    gangMoneyGainRatePerTick: gangRate,
  };
  const file = `logs/moneysources-${Date.now()}.json`;
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint(`  -> ${file}`);
}
