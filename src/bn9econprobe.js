/** BN9 recon #2: where money actually comes from, and what the hacknet can be built into.
 * Read-only (Formulas.exe + getMoneySources). Writes bn9econprobe-<epoch>.json. */
export async function main(ns) {
  const out = { ts: Date.now(), iso: new Date().toISOString(), errors: {} };
  const t = (k, fn) => { try { out[k] = fn(); } catch (e) { out.errors[k] = String(e).slice(0, 300); } };

  t("moneySources", () => ns.getMoneySources());
  t("hsConstants", () => ns.formulas.hacknetServers.constants());
  t("hnMults", () => ns.getHacknetMultipliers());

  // What does the CURRENT node produce, and what would upgrades do?
  t("gainCurve", () => {
    const m = ns.getHacknetMultipliers().production;
    const rows = {};
    const combos = [
      [1, 1, 1], [100, 1, 10], [100, 8, 10], [100, 64, 10], [100, 8192, 10],
      [200, 8192, 16], [300, 8192, 16], [300, 8192, 128],
    ];
    for (const [lvl, ram, cores] of combos) {
      rows[`L${lvl}/R${ram}/C${cores}`] = ns.formulas.hacknetServers.hashGainRate(lvl, 0, ram, cores, m);
    }
    return rows;
  });

  // Cost to build the fleet out: what does server #2..#20 cost, and the upgrade ladders?
  t("fleetCost", () => {
    const m = ns.getHacknetMultipliers();
    const buy = {};
    for (const n of [1, 2, 5, 10, 19, 20]) buy[`server#${n + 1}`] = ns.formulas.hacknetServers.hacknetServerCost(n + 1, m.purchaseCost);
    return buy;
  });
  t("upgradeLadders", () => {
    const m = ns.getHacknetMultipliers();
    const f = ns.formulas.hacknetServers;
    return {
      ramFrom1: [1, 2, 4, 8, 16, 32, 64].map((r) => [r, f.ramUpgradeCost(r, 1, m.ramCost)]),
      coreFrom10: [10, 16, 32, 64].map((c) => [c, f.coreUpgradeCost(c, 1, m.coreCost)]),
      levelFrom1: [1, 25, 50, 75, 100, 150, 200].map((l) => [l, f.levelUpgradeCost(l, 1, m.levelCost)]),
      cacheFrom5: [1, 3, 5, 7, 10].map((c) => [c, f.cacheUpgradeCost(c, 1)]),
    };
  });

  // Network RAM: with cloud servers disabled, what is actually available to run scripts on?
  t("networkRam", () => {
    const seen = new Set(["home"]);
    const stack = ["home"];
    let totalMax = 0, rootedMax = 0, count = 0, rooted = 0;
    while (stack.length) {
      const h = stack.pop();
      const s = ns.getServer(h);
      count++; totalMax += s.maxRam;
      if (s.hasAdminRights) { rooted++; rootedMax += s.maxRam; }
      for (const n of ns.scan(h)) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    return { serverCount: count, totalMaxRam: totalMax, rootedCount: rooted, rootedMaxRam: rootedMax };
  });

  const p = `bn9econprobe-${out.ts}.json`;
  ns.write(p, JSON.stringify(out, null, 2), "w");
  ns.tprint(`bn9econprobe -> ${p}`);
}
