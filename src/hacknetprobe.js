/** BN9 recon: hacknet-server economics, hash upgrades, and the node's damage report.
 * Read-only. Writes logs/hacknetprobe-<epoch>.json. */
export async function main(ns) {
  const out = { ts: Date.now(), iso: new Date().toISOString(), errors: {} };
  const t = (label, fn) => { try { out[label] = fn(); } catch (e) { out.errors[label] = String(e).slice(0, 300); } };

  t("resetInfo", () => ns.getResetInfo());
  t("player", () => {
    const p = ns.getPlayer();
    return { money: p.money, hacking: p.skills.hacking, str: p.skills.strength,
             def: p.skills.defense, dex: p.skills.dexterity, agi: p.skills.agility,
             cha: p.skills.charisma, city: p.city, mults: p.mults };
  });
  t("home", () => {
    const s = ns.getServer("home");
    return { maxRam: s.maxRam, usedRam: s.ramUsed, cores: s.cpuCores };
  });

  // Hacknet: is it Servers (BN9) or Nodes?
  t("hacknetBasics", () => ({
    numNodes: ns.hacknet.numNodes(),
    maxNumNodes: ns.hacknet.maxNumNodes(),
    purchaseNodeCost: ns.hacknet.getPurchaseNodeCost(),
    numHashes: ns.hacknet.numHashes(),
    hashCapacity: ns.hacknet.hashCapacity(),
    studyMult: ns.hacknet.getStudyMult(),
    trainingMult: ns.hacknet.getTrainingMult(),
  }));
  t("hashUpgrades", () => {
    const names = ns.hacknet.getHashUpgrades();
    const rows = {};
    for (const n of names) {
      const row = { level: null, cost1: null, cost10: null, cost100: null };
      try { row.level = ns.hacknet.getHashUpgradeLevel(n); } catch (e) { row.level = "ERR " + String(e).slice(0, 80); }
      try { row.cost1 = ns.hacknet.hashCost(n, 1); } catch (e) { row.cost1 = "ERR"; }
      try { row.cost10 = ns.hacknet.hashCost(n, 10); } catch (e) { row.cost10 = "ERR"; }
      try { row.cost100 = ns.hacknet.hashCost(n, 100); } catch (e) { row.cost100 = "ERR"; }
      rows[n] = row;
    }
    return rows;
  });
  t("nodeZeroStats", () => (ns.hacknet.numNodes() > 0 ? ns.hacknet.getNodeStats(0) : "no nodes owned"));
  t("upgradeCosts", () => (ns.hacknet.numNodes() > 0 ? {
    level1: ns.hacknet.getLevelUpgradeCost(0, 1),
    ram1: ns.hacknet.getRamUpgradeCost(0, 1),
    core1: ns.hacknet.getCoreUpgradeCost(0, 1),
    cache1: ns.hacknet.getCacheUpgradeCost(0, 1),
  } : "no nodes owned"));
  t("hacknetMults", () => ns.getHacknetMultipliers());

  // How bad is the server economy really?
  t("servers", () => {
    const picks = ["n00dles", "foodnstuff", "joesguns", "phantasy", "the-hub", "rho-construction",
                   "zer0", "omega-net", "silver-helix", "netlink", "catalyst", "rothman-uni"];
    const rows = {};
    for (const h of picks) {
      try {
        const s = ns.getServer(h);
        rows[h] = { maxMoney: s.moneyMax, curMoney: s.moneyAvailable, minSec: s.minDifficulty,
                    curSec: s.hackDifficulty, reqHack: s.requiredHackingSkill, ports: s.numOpenPortsRequired,
                    maxRam: s.maxRam, root: s.hasAdminRights };
      } catch (e) { rows[h] = "ERR"; }
    }
    return rows;
  });
  t("cloud", () => ({ limit: ns.cloud.getServerLimit(), ramLimit: ns.cloud.getRamLimit(), owned: ns.cloud.getServerNames().length }));
  t("wdGate", () => {
    const s = ns.getServer("w0r1d_d43m0n");
    return { reqHack: s.requiredHackingSkill, ports: s.numOpenPortsRequired, backdoor: s.backdoorInstalled };
  });
  t("bladeburner", () => {
    try { return { rank: ns.bladeburner.getRank(), inDivision: true }; }
    catch (e) { return { inDivision: false, err: String(e).slice(0, 160) }; }
  });
  t("formulasExe", () => ns.fileExists("Formulas.exe", "home"));

  const path = `hacknetprobe-${out.ts}.json`;
  ns.write(path, JSON.stringify(out, null, 2), "w");
  ns.tprint(`hacknetprobe -> ${path}`);
}
