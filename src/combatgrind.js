/**
 * combatgrind.js - one-time: grind combat stats to 100 via crime, the gate on
 * joinBladeburnerDivision() in BN6. Logs the MEASURED exp rate so the
 * failed-crime-exp question gets an answer instead of an assumption.
 *
 * Why crime and not a gym: Iron Gym is $120/sec per stat and trains ONE stat at
 * a time (live UI read 2026-07-29), against ~$3.9k banked at $0/s income -- it
 * buys 32 seconds. Crime is free, pays, and Mug trains all four combat stats at
 * once (3.84 exp each per 4s attempt).
 *
 * ⚠️ The decisive unknown this measures: does a FAILED crime grant exp? At Mug's
 * 5.15% success chance the two bounds are 30.4h (successes only) vs 1.57h (all
 * attempts) -- a 20x spread, and nothing in markdown/ settles it. The first
 * sample interval below distinguishes them decisively (expect ~57 exp/stat/min
 * if all attempts count, ~3 if only successes do).
 *
 * Deliberately does NOT call joinBladeburnerDivision (saves 4 GB, and joining is
 * a one-liner best done deliberately once the gate is confirmed met).
 *
 * Usage: run combatgrind.js [crimeName]   (default "Mug")
 * RAM 8.70 GB. Writes combatgrind-log.json (ring-capped) + tprints progress.
 *
 * ⚠️ It does NOT fit alongside the full daemon stack on a 32 GB fresh-node home:
 * daemon 16.30 + transactionsmonitor 2.60 + resourcemanager 3.35 + cloudmanager
 * 6.25 + goallog 3.10 = 31.60 GB, leaving 0.40 GB. Observed 2026-07-29: started
 * fine on an empty home, then vanished the moment daemon.js was relaunched.
 * ✅ That is survivable, because commitCrime sets a PLAYER action that outlives
 * the script -- the crime kept running (verified: "You are attempting to Mug",
 * stats still climbing) with no script alive at all. So the script is really a
 * measurement + re-assertion harness, not the thing doing the work. Run it on a
 * quiet home to measure, let it die, and the grind continues unattended.
 * The cost of it dying is only that nothing re-asserts if something else grabs
 * the player action slot -- low risk today since augfarmer.js (the known
 * contender) cannot fit in 32 GB either.
 *
 * MEASURED 2026-07-29 at combat 1, mult 1.28, Mug: 0.179 exp/sec/stat
 * (~10.8/min) -- which is NEITHER predicted bound (57/min all-attempts, 3/min
 * success-only). So failed crimes DO grant exp, but at a reduced fraction, not
 * the full rate. ~8.4h to level 100 at that constant rate, and it accelerates as
 * rising stats lift Mug's success chance.
 */

const COMBAT = ["strength", "defense", "dexterity", "agility"];
const TARGET_LEVEL = 100;
const SAMPLE_MS = 30_000;
const LOG_FILE = "combatgrind-log.json";
const RING_CAP = 200;

export async function main(ns) {
  ns.disableLog("ALL");
  const crimeName = ns.args[0] ?? "Mug";

  const startedAt = Date.now();
  const pl0 = ns.getPlayer();
  const baseline = {};
  for (const s of COMBAT) baseline[s] = pl0.exp[s];

  let entries = [];
  const raw = ns.read(LOG_FILE);
  if (raw) { try { entries = JSON.parse(raw) || []; } catch { entries = []; } }

  const append = (rec) => {
    entries.push(rec);
    if (entries.length > RING_CAP) entries = entries.slice(entries.length - RING_CAP);
    ns.write(LOG_FILE, JSON.stringify(entries, null, 2), "w");
  };

  const started = ns.singularity.commitCrime(crimeName, false);
  ns.tprint(`combatgrind: committing "${crimeName}" (${started}ms/attempt) -- target all combat >= ${TARGET_LEVEL}`);
  append({ t: startedAt, event: "start", crime: crimeName, attemptMs: started, baseline });

  let verdictLogged = false;

  while (true) {
    await ns.sleep(SAMPLE_MS);

    const pl = ns.getPlayer();
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const levels = {};
    const gained = {};
    const perSec = {};
    let lowest = Infinity;
    for (const s of COMBAT) {
      levels[s] = pl.skills[s];
      gained[s] = pl.exp[s] - baseline[s];
      perSec[s] = gained[s] / elapsedSec;
      lowest = Math.min(lowest, pl.skills[s]);
    }

    // Re-assert if something else grabbed the player action slot (augfarmer's
    // workForFaction is the known contender -- it cannot run at 32 GB home
    // today, but this makes the grinder robust if it comes online mid-grind).
    const work = ns.singularity.getCurrentWork();
    const stillCriming = work && work.type === "CRIME";
    if (!stillCriming) {
      ns.singularity.commitCrime(crimeName, false);
      append({ t: Date.now(), event: "reasserted", displacedBy: work ? work.type : null });
    }

    append({ t: Date.now(), event: "sample", elapsedSec, levels, gained, perSec, lowest });

    // One-shot verdict on the failed-crime-exp question, from the first sample.
    if (!verdictLogged) {
      verdictLogged = true;
      ns.tprint(`combatgrind: measured ${perSec.strength.toFixed(3)} exp/sec/stat` +
        ` (~${(perSec.strength * 60).toFixed(1)}/min) -- ~57/min => failures DO grant exp, ~3/min => they do NOT`);
    }

    const remaining = {};
    for (const s of COMBAT) remaining[s] = Math.max(0, TARGET_LEVEL - pl.skills[s]);
    ns.tprint(`combatgrind: ${Math.round(elapsedSec)}s | lowest lvl ${lowest}/${TARGET_LEVEL} | ` +
      COMBAT.map((s) => `${s.slice(0, 3)} ${pl.skills[s]}`).join(" ") +
      ` | $${ns.format.number(ns.getServerMoneyAvailable("home"))}`);

    if (lowest >= TARGET_LEVEL) {
      append({ t: Date.now(), event: "gate-met", elapsedSec, levels, perSec });
      ns.tprint(`combatgrind: GATE MET in ${(elapsedSec / 60).toFixed(1)} min -- ` +
        `all combat >= ${TARGET_LEVEL}. Next: joinBladeburnerDivision(), then re-run bladeburnerprobe.js`);
      ns.singularity.stopAction();
      return;
    }
  }
}
