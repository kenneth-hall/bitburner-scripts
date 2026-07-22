/**
 * stockrecon.js - post-TIX harvest of everything the $5b TIX purchase unlocks
 * for read-only, without any 4S ($25b) purchase. Answers the immediately-
 * resolvable stock-engine open questions in one run:
 *   - symbol list + count (OQ4)
 *   - getOrganization gate: docs claim WSE+TIX; test with whatever is owned (OQ3)
 *   - getForecast gate: must throw without 4S TIX (confirms the signal is gated)
 *   - nextUpdate gate: does the loop primitive resolve on TIX alone?
 *   - per-symbol ask/bid/spread/maxShares, and the real round-trip friction
 *     (getPurchaseCost - getSaleGain at ~5% of max shares) that any trade edge
 *     must clear -- all read-only, no shares are ever bought.
 *
 * Writes stockrecon-<epoch>.json (synced to logs/ via vite.config.ts). Read-only:
 * places no orders, holds no positions. ASCII-only (seeded via wget).
 */
export async function main(ns) {
  const out = { ts: Date.now(), iso: new Date().toISOString() };
  out.access = {
    wse: ns.stock.hasWseAccount(),
    tix: ns.stock.hasTixApiAccess(),
    s4ui: ns.stock.has4SData(),
    s4tix: ns.stock.has4SDataTixApi(),
  };
  const fileFor = (o) => "stockrecon-" + o.ts + ".json";
  if (!out.access.tix) {
    out.error = "TIX not owned -- run buystockaccess.js tix first";
    ns.write(fileFor(out), JSON.stringify(out, null, 2), "w");
    ns.tprint("stockrecon: " + out.error);
    return;
  }

  const syms = ns.stock.getSymbols();
  out.symbolCount = syms.length;
  const first = syms[0];

  // OQ3: getOrganization docs claim WSE+TIX -- does it work on TIX alone here?
  try {
    out.orgGate = { works: true, sample: first + "=" + ns.stock.getOrganization(first) };
  } catch (err) {
    out.orgGate = { works: false, error: String(err) };
  }

  // 4S gate: getForecast must throw without 4S TIX access.
  try {
    out.forecastGate = { works: true, sample: ns.stock.getForecast(first) };
  } catch (err) {
    out.forecastGate = { works: false, error: String(err) };
  }

  // Loop primitive: does nextUpdate resolve on TIX alone (no 4S)?
  try {
    out.nextUpdate = { works: true, processedMs: await ns.stock.nextUpdate() };
  } catch (err) {
    out.nextUpdate = { works: false, error: String(err) };
  }

  // Per-symbol snapshot + friction sample at ~5% of max shares, long, market order.
  const orgOk = out.orgGate.works;
  out.stocks = syms.map((sym) => {
    const askPx = ns.stock.getAskPrice(sym);
    const bidPx = ns.stock.getBidPrice(sym);
    const cap = ns.stock.getMaxShares(sym);
    const n = Math.max(1, Math.floor(cap * 0.05));
    const cost = ns.stock.getPurchaseCost(sym, n, "L");
    const proceeds = ns.stock.getSaleGain(sym, n, "L");
    const rtLoss = cost - proceeds; // spread + 2x $100k commission + own price impact
    return {
      sym,
      org: orgOk ? ns.stock.getOrganization(sym) : null,
      askPx,
      bidPx,
      spreadPct: askPx > 0 ? (askPx - bidPx) / askPx : null,
      maxShares: cap,
      sampleShares: n,
      buyCost: cost,
      sellProceeds: proceeds,
      roundTripLoss: rtLoss,
      roundTripLossPct: cost > 0 ? rtLoss / cost : null,
    };
  });

  ns.write(fileFor(out), JSON.stringify(out, null, 2), "w");
  ns.tprint(
    "stockrecon: " + out.symbolCount + " symbols; org=" + out.orgGate.works +
    " forecast=" + out.forecastGate.works + " nextUpdate=" + out.nextUpdate.works +
    " -> " + fileFor(out)
  );
}
