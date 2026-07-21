/**
 * Phase 30 -- gang TERRITORY / POWER read-only probe (pre-spec recon).
 *
 * Answers the pivotal Tier 4 question before any spec is written: can a
 * pure-hacking gang (combat stats pinned at 1) win a clash? Reads our power +
 * territory, every rival's power + territory, and the exact clash win-odds
 * against each rival. If odds sit near 0 across the board, Tier 4 is dead on
 * arrival and we skip Stage 2 entirely.
 *
 * Read-only. Touches nothing in the Gang API's action group -- clashes stay
 * OFF, no task is reassigned, setTerritoryWarfare is never called.
 *
 * -> logs/gangterritory-<epoch>.json  (+ terminal summary)
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog('ALL');

  const out = { epoch: Date.now(), self: null, rivals: null, errors: [] };

  try {
    const g = ns.gang.getGangInformation();
    out.self = {
      faction: g.faction,
      power: g.power,
      territory: g.territory,
      territoryClashChance: g.territoryClashChance,
      territoryWarfareEngaged: g.territoryWarfareEngaged,
      respectGainRate: g.respectGainRate,
      moneyGainRate: g.moneyGainRate,
    };
  } catch (err) {
    out.errors.push(`getGangInformation: ${String(err.message || err)}`);
  }

  try {
    // getOtherGangInformation was REMOVED in this 3.0.0 fork -> getAllGangInformation.
    const others = ns.gang.getAllGangInformation(); // { gangName: { power, territory } }
    const selfPower = out.self ? out.self.power : 0;
    const rows = [];
    for (const name of Object.keys(others)) {
      if (out.self && name === out.self.faction) continue; // skip ourselves
      const info = others[name] || {};
      let winChance = null;
      try {
        winChance = ns.gang.getChanceToWinClash(name);
      } catch (err) {
        winChance = `ERR ${String(err.message || err)}`;
      }
      const powerRatio = info.power > 0 || selfPower > 0 ? selfPower / (selfPower + info.power) : null;
      rows.push({ name, power: info.power, territory: info.territory, winChance, powerRatio });
      await ns.sleep(0);
    }
    // Weakest rival first -- that's the only one worth clashing against.
    rows.sort((a, b) => (a.power ?? Infinity) - (b.power ?? Infinity));
    out.rivals = rows;
  } catch (err) {
    out.errors.push(`getOtherGangInformation/getChanceToWinClash: ${String(err.message || err)}`);
  }

  const fileName = `gangterritory-${out.epoch}.json`;
  ns.write(fileName, JSON.stringify(out, null, 2), 'w');

  const pct = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : String(x));
  if (out.self) {
    ns.tprint(
      `INFO gangterritory: US power=${ns.format.number(out.self.power)} ` +
        `territory=${pct(out.self.territory)} clashesEngaged=${out.self.territoryWarfareEngaged}`,
    );
  }
  if (out.rivals) {
    ns.tprint(`  ${out.rivals.length} rivals (weakest first):`);
    for (const r of out.rivals) {
      ns.tprint(
        `   ${r.name.padEnd(16)} power=${ns.format.number(r.power).padStart(10)} ` +
          `terr=${pct(r.territory).padStart(6)}  winClash=${pct(r.winChance)}`,
      );
    }
  }
  for (const e of out.errors) ns.tprint(`  ERR ${e}`);
  ns.tprint(`  -> ${fileName}`);
}
