/**
 * stockpostest.js - one-shot experiment for stock-engine.md OQ2: do OPEN POSITIONS
 * survive an augmentation install, convert to cash, or vaporize?
 *
 * Usage:
 *   run stockpostest.js buy    take a small long position (default ~$100m of ECP)
 *   run stockpostest.js check  report position + money, no trading
 *
 * Run "buy" immediately before an install, "check" immediately after. Diffing the
 * two logs answers OQ2. ECP is chosen because it has the lowest measured spread
 * (~0.40%, stockrecon 2026-07-22), so the experiment's friction cost is minimal.
 * Optional args: [symbol] [dollars].
 *
 * Writes stockpostest-<mode>-<epoch>.json (synced to logs/ via vite.config.ts).
 * ASCII-only on purpose: seeded into the game via wget, which mangles non-ASCII.
 */
export async function main(ns) {
  const mode = String(ns.args[0] || "check").toLowerCase();
  const symbol = String(ns.args[1] || "ECP").toUpperCase();
  const budget = Number(ns.args[2] || 100e6);

  const out = { ts: Date.now(), iso: new Date().toISOString(), mode, symbol };
  out.tix = ns.stock.hasTixApiAccess();
  out.money = ns.getServerMoneyAvailable("home");

  if (!out.tix) {
    out.error = "TIX not owned -- access flags did NOT survive (see OQ1)";
    ns.write("stockpostest-" + mode + "-" + out.ts + ".json", JSON.stringify(out, null, 2), "w");
    ns.tprint("stockpostest: " + out.error);
    return;
  }

  const askPx = ns.stock.getAskPrice(symbol);
  out.askPrice = askPx;

  if (mode === "buy") {
    const shares = Math.floor(budget / askPx);
    out.sharesRequested = shares;
    out.fillPrice = ns.stock.buyStock(symbol, shares);
    out.moneyAfter = ns.getServerMoneyAvailable("home");
  }

  const pos = ns.stock.getPosition(symbol);
  out.position = { sharesLong: pos[0], avgLongPrice: pos[1], sharesShort: pos[2], avgShortPrice: pos[3] };
  out.markToMarket = pos[0] * askPx;

  const file = "stockpostest-" + mode + "-" + out.ts + ".json";
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint(
    "stockpostest[" + mode + "] " + symbol +
    " long=" + out.position.sharesLong +
    " avg=$" + ns.format.number(out.position.avgLongPrice) +
    " mtm=$" + ns.format.number(out.markToMarket) +
    " money=$" + ns.format.number(out.money) +
    " -> " + file
  );
}
