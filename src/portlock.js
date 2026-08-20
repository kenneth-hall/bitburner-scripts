/**
 * portlock.js -- what is the network worth that we cannot reach, and which program unlocks it?
 *
 * WHY. On 2026-08-20 the batcher's entire eligible target set topped out at $250m maxMoney
 * while fleet utilisation sat at 34% -- more RAM than targets to spend it on. We own exactly
 * one of the five port openers (BruteSSH.exe), and procureprograms.js was not running, so the
 * other four were never bought despite $48b sitting idle. The question this answers is not
 * "are we missing programs" (yes, trivially) but "what does that actually COST", which is the
 * only version of the question worth acting on.
 *
 * Reports, per port-requirement tier: how many servers sit there, their total maxMoney, and
 * how much becomes reachable with each ADDITIONAL opener bought in order. Also splits out
 * servers blocked by hacking LEVEL rather than ports -- buying an opener does not help those,
 * and conflating the two would overstate the prize.
 *
 * Read-only: scans, reads server properties, nukes nothing and buys nothing.
 *
 * RAM: ~1 GB (scan 0.2 + getServer* reads + hasRootAccess).
 *
 * ASCII-only (docs/dev-server.md -- new files are seeded by in-game wget, which mangles
 * non-ASCII punctuation into a parse error).
 */

const OPENER_ORDER = [
  "BruteSSH.exe",
  "FTPCrack.exe",
  "relaySMTP.exe",
  "HTTPWorm.exe",
  "SQLInject.exe",
];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // Walk the whole network breadth-first.
  const seen = new Set(["home"]);
  const queue = ["home"];
  while (queue.length > 0) {
    const host = queue.shift();
    for (const next of ns.scan(host)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  const owned = OPENER_ORDER.filter((p) => ns.fileExists(p, "home"));
  const ownedCount = owned.length;
  const playerLevel = ns.getHackingLevel();

  const rows = [];
  for (const host of seen) {
    if (host === "home") continue;
    if (ns.getServerMaxRam(host) >= 0 && host.startsWith("cloud-")) continue; // our own fleet
    rows.push({
      host,
      ports: ns.getServerNumPortsRequired(host),
      maxMoney: ns.getServerMaxMoney(host),
      level: ns.getServerRequiredHackingLevel(host),
      root: ns.hasRootAccess(host),
    });
  }

  // Money-bearing servers only -- a $0 server is never a batcher target, so counting it
  // as "locked value" would inflate the prize with servers nobody wants.
  const earners = rows.filter((r) => r.maxMoney > 0);

  const rec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    playerLevel,
    ownedOpeners: owned,
    ownedCount,
    totalServers: rows.length,
    earners: earners.length,
    tiers: [],
    unlockLadder: [],
  };

  for (let p = 0; p <= 5; p++) {
    const tier = earners.filter((r) => r.ports === p);
    rec.tiers.push({
      ports: p,
      servers: tier.length,
      totalMaxMoney: tier.reduce((a, r) => a + r.maxMoney, 0),
      rooted: tier.filter((r) => r.root).length,
      levelBlocked: tier.filter((r) => r.level > playerLevel).length,
    });
  }

  // What each NEXT opener buys, cumulatively, split by whether hacking level also blocks it.
  for (let k = ownedCount + 1; k <= 5; k++) {
    const newly = earners.filter((r) => r.ports === k);
    const reachable = newly.filter((r) => r.level <= playerLevel);
    rec.unlockLadder.push({
      buying: OPENER_ORDER[k - 1],
      opensTier: k,
      servers: newly.length,
      moneyAllTiers: newly.reduce((a, r) => a + r.maxMoney, 0),
      serversUsableNow: reachable.length,
      moneyUsableNow: reachable.reduce((a, r) => a + r.maxMoney, 0),
      topServers: reachable
        .sort((a, b) => b.maxMoney - a.maxMoney)
        .slice(0, 5)
        .map((r) => r.host + " $" + ns.format.number(r.maxMoney) + " lvl" + r.level),
    });
  }

  ns.write("portlock-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  ns.tprint("portlock: own " + ownedCount + "/5 openers [" + owned.join(", ") + "] | hacking " + playerLevel);
  ns.tprint("  tier | servers | rooted | lvl-blocked | total maxMoney");
  for (const t of rec.tiers) {
    ns.tprint("   " + t.ports + "p  |   " + String(t.servers).padStart(4) + "  |  " +
      String(t.rooted).padStart(4) + "  |    " + String(t.levelBlocked).padStart(4) + "     | $" +
      ns.format.number(t.totalMaxMoney));
  }
  ns.tprint("  what each next opener actually buys (usable now = hacking level also satisfied):");
  for (const u of rec.unlockLadder) {
    ns.tprint("   " + u.buying + " -> +" + u.serversUsableNow + " usable servers, $" +
      ns.format.number(u.moneyUsableNow) + " maxMoney (" + u.servers + " total in tier)");
    for (const t of u.topServers) ns.tprint("      " + t);
  }
  ns.tprint("  -> portlock-" + rec.ts + ".json");
}
