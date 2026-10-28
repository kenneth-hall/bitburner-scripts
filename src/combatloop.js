/**
 * combatloop.js - autonomous combat-100 grind: crime earns money, the gym spends it.
 *
 * Alternates the single player-action slot between
 *   (a) the best-paying crime (chance * money / time, read live), and
 *   (b) a gym workout on the lowest combat stat that is still under TARGET,
 * switching on a money bank with hysteresis. Stops (and stopAction()s) when every
 * combat stat >= TARGET. Re-asserts its own action if something else grabs the slot.
 * Next step afterwards: run joinbladeburner.js
 *
 * ASSUMPTIONS (not measured here): Iron Gym ~ $120/s per stat, Powerhouse ~ $2400/s
 * (BN3/BN6 notes). The bank thresholds below are derived from those; if a gym
 * switch bounces straight back to crime, the real cost is higher than assumed.
 * Gym needs the player to be in the gym's city (Sector-12 after a node reset).
 * Uses focus=false so the UI stays drivable (~80% gains, see memory notes).
 *
 * Usage: run combatloop.js [target=100]
 * Log: combatloop-log.json (ring-capped). ASCII only (this file is wget-seeded).
 */

const COMBAT = ["strength", "defense", "dexterity", "agility"];
const CRIMES = ["Shoplift", "Rob Store", "Mug", "Larceny", "Deal Drugs", "Bond Forgery",
  "Traffick Arms", "Homicide", "Grand Theft Auto", "Kidnap", "Assassinate", "Heist"];
const GYMS = [
  { name: "Powerhouse Gym", costPerSec: 2400 },
  { name: "Iron Gym", costPerSec: 120 },
];
const GYM_STAT = { strength: "str", defense: "def", dexterity: "dex", agility: "agi" };
const GYM_CITY = "Sector-12";
const TICK_MS = 20_000;
const BANK_SECONDS = 600;   // enter gym with this many seconds of gym cost banked
const FLOOR_SECONDS = 20;   // leave gym when under this many seconds of cost
const LOG_FILE = "combatloop-log.json";
const RING_CAP = 300;

export async function main(ns) {
  ns.disableLog("ALL");
  const target = Number(ns.args[0] ?? 100);
  let entries = [];
  const raw = ns.read(LOG_FILE);
  if (raw) { try { entries = JSON.parse(raw) || []; } catch { entries = []; } }
  const log = (rec) => {
    rec.t = Date.now();
    entries.push(rec);
    if (entries.length > RING_CAP) entries = entries.slice(entries.length - RING_CAP);
    ns.write(LOG_FILE, JSON.stringify(entries, null, 2), "w");
  };

  let mode = "crime";
  let gym = null;
  let crime = null;
  let gymStat = null;
  log({ event: "start", target });

  while (true) {
    const pl = ns.getPlayer();
    const money = ns.getServerMoneyAvailable("home");
    const levels = {};
    for (const s of COMBAT) levels[s] = pl.skills[s];
    const need = COMBAT.filter((s) => levels[s] < target);

    if (need.length === 0) {
      ns.singularity.stopAction();
      log({ event: "gate-met", levels, money });
      ns.tprint("combatloop: GATE MET, all combat >= " + target + ". Next: run joinbladeburner.js");
      return;
    }

    // Pick the gym tier we can bank for; Iron if we cannot afford Powerhouse's bank.
    const wantGym = GYMS.find((g) => money >= g.costPerSec * BANK_SECONDS) ?? null;
    const curGymDef = GYMS.find((g) => g.name === gym);

    if (mode === "crime" && wantGym && pl.city === GYM_CITY) {
      mode = "gym";
      gym = wantGym.name;
    } else if (mode === "gym") {
      const floor = (curGymDef ? curGymDef.costPerSec : 120) * FLOOR_SECONDS;
      if (money < floor || pl.city !== GYM_CITY) { mode = "crime"; gym = null; }
    }

    const work = ns.singularity.getCurrentWork();
    if (mode === "gym") {
      const lowest = need.slice().sort((a, b) => levels[a] - levels[b])[0];
      const gymOk = work && work.type === "CLASS" && gymStat === lowest;
      if (!gymOk) {
        const ok = ns.singularity.gymWorkout(gym, GYM_STAT[lowest], false);
        gymStat = lowest;
        log({ event: "gym", gym, stat: lowest, ok, money, levels });
        if (!ok) { mode = "crime"; gym = null; }
      }
    }
    if (mode === "crime") {
      let best = null;
      for (const c of CRIMES) {
        let chance, st;
        try {
          chance = ns.singularity.getCrimeChance(c);
          st = ns.singularity.getCrimeStats(c);
        } catch { continue; }
        const score = chance * st.money / (st.time / 1000);
        if (!best || score > best.score) best = { name: c, score, chance };
      }
      const stillCrime = work && work.type === "CRIME" && crime === best.name;
      if (!stillCrime) {
        ns.singularity.commitCrime(best.name, false);
        crime = best.name;
        gymStat = null;
        log({ event: "crime", crime: best.name, chance: best.chance, perSec: best.score, money, levels });
      }
    }

    ns.print("mode " + mode + " money " + money + " levels " + JSON.stringify(levels));
    await ns.sleep(TICK_MS);
  }
}
