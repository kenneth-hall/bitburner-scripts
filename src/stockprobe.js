/**
 * stockprobe.js - read-only stock-market access + constants probe (stock-engine prep).
 * Captures the four access flags (WSE account / TIX API / 4S UI / 4S TIX API),
 * this build's StockMarketConstants (real costs, commission, tick timing), and
 * accumulated bonus time. Writes stockprobe-<epoch>.json (synced to logs/ via
 * the vite.config.ts download filter). Safe pre-purchase: only has*, getConstants
 * and getBonusTime, none of which need any stock-market access.
 * RAM: 1.6 base + 4x0.05 (has*) = 1.8 GB.
 */
export async function main(ns) {
  const probe = { ts: Date.now(), iso: new Date().toISOString() };
  try {
    probe.access = {
      wseAccount: ns.stock.hasWseAccount(),
      tixApi: ns.stock.hasTixApiAccess(),
      fourSigmaUi: ns.stock.has4SData(),
      fourSigmaTixApi: ns.stock.has4SDataTixApi(),
    };
    probe.constants = ns.stock.getConstants();
    probe.bonusTimeMs = ns.stock.getBonusTime();
  } catch (err) {
    probe.error = String(err);
  }
  const file = "stockprobe-" + probe.ts + ".json";
  ns.write(file, JSON.stringify(probe, null, 2), "w");
  ns.tprint("stockprobe: " + (probe.error ? "ERROR " + probe.error : "ok") + " -> " + file);
}
