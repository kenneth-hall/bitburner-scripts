/**
 * stanekcharger.js - resident: fills spare fleet RAM with stanekworker.js threads that charge
 * every non-booster fragment on Stanek's Gift, and writes stanek-state.json (fragment charge +
 * effects, thread totals) every pass.
 *
 * RAM policy: never touches home (HOME is the residents' space). On every other rooted host it
 * launches one worker with all free RAM above a per-host headroom, but stops once the workers'
 * total reaches CAP_FRAC of the non-home fleet, so the batcher keeps a slice. Workers run
 * forever; kill this script AND `kill stanekworker.js` on each host to release the RAM
 * (`run stanekcharger.js stop` does the sweep).
 * Bigger hosts first: charge per call scales with that call's thread count.
 * ASCII-only.
 */
const WORKER = "stanekworker.js";
const LOOP_MS = 30_000;
const CAP_FRAC = 0.85; // max share of non-home fleet RAM held by workers
const HEADROOM_FRAC = 0.05; // per-host free RAM left for batcher next-tick launches
const STATE_FILE = "stanek-state.json";

/** @param {NS} ns */
function allHosts(ns) {
  const seen = new Set(["home"]);
  const queue = ["home"];
  while (queue.length) {
    const h = queue.shift();
    for (const n of ns.scan(h)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  seen.delete("home");
  return [...seen].filter((h) => ns.hasRootAccess(h) && ns.getServerMaxRam(h) > 0);
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const workerRam = ns.getScriptRam(WORKER, "home");
  if (ns.args[0] === "stop") {
    let n = 0;
    for (const h of allHosts(ns)) if (ns.scriptKill(WORKER, h)) n++;
    ns.tprint(`stanekcharger: killed workers on ${n} hosts`);
    return;
  }
  while (true) {
    const frags = ns.stanek.activeFragments();
    const chargeable = frags.filter((f) => f.type !== 18); // 18 = booster (FragmentType)
    const args = chargeable.flatMap((f) => [f.x, f.y]);
    const hosts = allHosts(ns).sort((a, b) => ns.getServerMaxRam(b) - ns.getServerMaxRam(a));
    const fleet = hosts.reduce((s, h) => s + ns.getServerMaxRam(h), 0);
    let held = 0;
    let workerHosts = 0;
    let threadsTotal = 0;
    let biggest = 0;
    for (const h of hosts) {
      const running = ns.getRunningScript(WORKER, h, ...args);
      if (running) { held += running.threads * workerRam; threadsTotal += running.threads; workerHosts++; biggest = Math.max(biggest, running.threads); }
    }
    let launched = 0;
    if (args.length) {
      for (const h of hosts) {
        if (held >= CAP_FRAC * fleet) break;
        if (ns.getRunningScript(WORKER, h, ...args)) continue;
        const max = ns.getServerMaxRam(h);
        const free = max - ns.getServerUsedRam(h) - HEADROOM_FRAC * max;
        const room = Math.min(free, CAP_FRAC * fleet - held);
        const threads = Math.floor(room / workerRam);
        if (threads < 1) continue;
        if (!ns.fileExists(WORKER, h)) ns.scp(WORKER, h, "home");
        if (ns.exec(WORKER, h, threads, ...args) > 0) {
          held += threads * workerRam; threadsTotal += threads; workerHosts++; launched++; biggest = Math.max(biggest, threads);
        }
      }
    }
    const state = {
      timestamp: Date.now(),
      fleetGb: fleet, heldGb: held, capFrac: CAP_FRAC, workerHosts, threadsTotal, biggestWorkerThreads: biggest, launched,
      fragments: frags.map((f) => ({ id: f.id, x: f.x, y: f.y, effect: f.effect, power: f.power, numCharge: f.numCharge, highestCharge: f.highestCharge, chargedEffect: f.chargedEffect })),
      mults: ns.getPlayer().mults,
    };
    ns.write(STATE_FILE, JSON.stringify(state), "w");
    await ns.sleep(LOOP_MS);
  }
}
