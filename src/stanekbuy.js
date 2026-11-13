/**
 * stanekbuy.js - buy one cloud server and immediately fill it with a stanekworker.js charging
 * every non-booster fragment (before the daemon's batcher can claim it). Charge per call scales
 * with the call's thread count, and the fragment effect scales with ln(highest single charge),
 * so one big host beats many small ones.
 * usage: run stanekbuy.js <ramGb> [hostname]   Writes stanekbuy-<epoch>.json. ASCII-only.
 */
import { recordTransaction } from "./translog.js";

const WORKER = "stanekworker.js";
// Root coords of the 5 stat fragments from stanekplace.js LAYOUT, in board-read order --
// must match stanekcharger.js's args exactly so it recognises this worker as its own.
const FRAGMENT_COORDS = [0, 0, 1, 0, 3, 0, 0, 2, 3, 3];

/** @param {NS} ns */
export async function main(ns) {
  const ram = Number(ns.args[0]);
  const name = String(ns.args[1] ?? "stanek-0");
  const cost = ns.cloud.getServerCost(ram);
  const out = { ts: Date.now(), ram, name, cost, money: ns.getServerMoneyAvailable("home") };
  if (!(cost > 0) || cost > out.money) {
    out.error = "unaffordable or invalid ram";
  } else {
    const host = ns.cloud.purchaseServer(name, ram);
    out.host = host;
    if (host) {
      const nowMs = Date.now();
      recordTransaction(ns, { type: "expense", source: "stanek-cloud-purchase", hostname: host, ram, amount: cost, timestamp: nowMs, time: new Date(nowMs).toLocaleTimeString() });
      ns.scp(WORKER, host, "home");
      const args = FRAGMENT_COORDS; // hard-coded: reading the board costs 5 GB and home is tight
      const threads = Math.floor((ns.getServerMaxRam(host) - ns.getServerUsedRam(host)) / ns.getScriptRam(WORKER, "home"));
      out.threads = threads;
      out.pid = ns.exec(WORKER, host, threads, ...args);
    }
  }
  const file = `stanekbuy-${out.ts}.json`;
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint(`${out.error ?? `bought ${out.host} ${ram}GB for ${ns.format.number(cost)}; worker pid ${out.pid} x${out.threads}`} -> ${file}`);
}
