/**
 * homefund.js - earn money by crime, buy home RAM upgrades until TARGET_GB.
 * Needed so bladeburnermanager.js (99 GB) has a host. Kill daemon.js first (32 GB home).
 * Usage: run homefund.js [targetGb=256]
 * Log: homefund-log.json. ASCII only (this file is wget-seeded).
 */
const CRIMES = ["Shoplift", "Rob Store", "Mug", "Larceny", "Deal Drugs", "Bond Forgery",
  "Traffick Arms", "Homicide", "Grand Theft Auto", "Kidnap", "Assassinate", "Heist"];

export async function main(ns) {
  ns.disableLog("ALL");
  const target = Number(ns.args[0] ?? 256);
  const log = (rec) => {
    rec.t = Date.now();
    ns.write("homefund-log.json", JSON.stringify(rec) + "\n", "a");
  };
  let crime = null;
  while (true) {
    const ram = ns.getServerMaxRam("home");
    if (ram >= target) {
      ns.singularity.stopAction();
      log({ event: "done", ram });
      ns.tprint("homefund: home RAM " + ram + " GB >= " + target + ". Next: run daemon.js, then bladeburnermanager.js");
      return;
    }
    const cost = ns.singularity.getUpgradeHomeRamCost();
    if (ns.getServerMoneyAvailable("home") >= cost) {
      const ok = ns.singularity.upgradeHomeRam();
      log({ event: "upgrade", ok, cost, ramBefore: ram });
      if (ok) continue;
    }
    let best = null;
    for (const c of CRIMES) {
      let chance, st;
      try {
        chance = ns.singularity.getCrimeChance(c);
        st = ns.singularity.getCrimeStats(c);
      } catch { continue; }
      const score = chance * st.money / (st.time / 1000);
      if (!best || score > best.score) best = { name: c, score };
    }
    const work = ns.singularity.getCurrentWork();
    if (!(work && work.type === "CRIME" && crime === best.name)) {
      ns.singularity.commitCrime(best.name, false);
      crime = best.name;
      log({ event: "crime", crime, perSec: best.score, cost, money: ns.getServerMoneyAvailable("home") });
    }
    await ns.sleep(10000);
  }
}
