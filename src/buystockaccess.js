/**
 * buystockaccess.js - purchase a stock-market access tier and log the spend.
 *
 * Usage: run buystockaccess.js <tier>
 *   tix    TIX API access   ($5b)   ns.stock.purchaseTixApi()
 *   wse    WSE account      ($200m) ns.stock.purchaseWseAccount()
 *   4sui   4S Market Data   ($1b,  needs WSE) ns.stock.purchase4SMarketData()
 *   4stix  4S Data TIX API  ($25b, needs TIX) ns.stock.purchase4SMarketDataTixApi()
 *
 * Records an "expense" transaction (measured before/after money delta) on a real
 * purchase so the spend shows up in transactions-YYYY-MM-DD.json instead of looking
 * like an unexplained money drop later. If the tier is already owned, nothing is
 * bought and nothing is logged. No await between the money reads and the purchase,
 * so no other writer can interleave the recordTransaction read-modify-write.
 *
 * ASCII-only on purpose: seeded into the game via wget, which mangles non-ASCII.
 */
import { recordTransaction } from "./translog.js";

const TIERS = {
  tix: { label: "TIX API access", has: (ns) => ns.stock.hasTixApiAccess(), buy: (ns) => ns.stock.purchaseTixApi() },
  wse: { label: "WSE account", has: (ns) => ns.stock.hasWseAccount(), buy: (ns) => ns.stock.purchaseWseAccount() },
  "4sui": { label: "4S Market Data (UI)", has: (ns) => ns.stock.has4SData(), buy: (ns) => ns.stock.purchase4SMarketData() },
  "4stix": { label: "4S Market Data TIX API", has: (ns) => ns.stock.has4SDataTixApi(), buy: (ns) => ns.stock.purchase4SMarketDataTixApi() },
};

export async function main(ns) {
  const tier = String(ns.args[0] || "").toLowerCase();
  const spec = TIERS[tier];
  if (!spec) {
    ns.tprint("ERROR buystockaccess usage: run buystockaccess.js <tix|wse|4sui|4stix>");
    return;
  }
  if (spec.has(ns)) {
    ns.tprint("buystockaccess: " + spec.label + " already owned -- nothing bought.");
    return;
  }
  const before = ns.getServerMoneyAvailable("home");
  const ok = spec.buy(ns);
  const after = ns.getServerMoneyAvailable("home");
  const spent = Math.max(0, before - after);
  if (!ok || !spec.has(ns)) {
    ns.tprint("buystockaccess: FAILED to buy " + spec.label + " (money $" + ns.format.number(before) + ").");
    return;
  }
  if (spent > 0) {
    const nowMs = Date.now();
    recordTransaction(ns, {
      type: "expense",
      source: "stock-access",
      tier,
      detail: spec.label,
      amount: spent,
      timestamp: nowMs,
      time: new Date(nowMs).toLocaleTimeString(),
    });
  }
  ns.tprint("buystockaccess: bought " + spec.label + " for $" + ns.format.number(spent) + " -- logged to transactions.");
}
