/**
 * leverprobe.js -- READ-ONLY. Settles three open BN6 questions in one run.
 *
 * Q-CAP  Does the action level cap at 100? Tracking sits at 99 and the entire
 *        9-25 day forecast spread rides on whether rankGain keeps compounding
 *        at 1.0410/level. getActionMaxLevel answers it directly -- no fitting.
 *
 * Q-REGEN Does stamina regen scale with MAX stamina, or is it a flat rate?
 *        Decides whether "Cyber's Edge" (+2% max stamina, 1 SP base) is worth
 *        any of the ~8,819 idle skill points, and it is currently NOT in
 *        bladeburnermanager.js's SKILL_BUY_ORDER at all.
 *        Install #43 cratered staminaMax 136.50 -> 76.85, which is an accidental
 *        natural experiment: Q10 measured regen 0.03352/s at the OLD max.
 *          - still ~0.0335 now  => regen is FLAT       => Cyber's Edge is worthless
 *          - ~0.019 now (halved) => regen SCALES w/ max => Cyber's Edge multiplies rank rate
 *
 * Q-DIP  Is the stamina guard starving Diplomacy? bladeburnermanager.js:547
 *        returns HRC on staminaRecovering ABOVE the Diplomacy branch, and the
 *        diplomacy budget reads 100% unused while Ishima chaos climbs. Recording
 *        chaos + what action is actually running during stamina recovery tells us
 *        whether that ordering is costing anything.
 *
 * STRICTLY READ-ONLY: no startAction, no upgradeSkill, no travel, no state change.
 * Safe to run alongside bladeburnermanager.js -- it never claims the action slot.
 *
 * Output: logs/leverprobe-<epoch>.json (one file per run).
 */

const SAMPLE_MS = 1000;
const SAMPLE_COUNT = 300; // ~5 minutes

/**
 * `run leverprobe.js intel` -- skips the 5-minute stamina sample and instead reads:
 *
 *   Q11-MOOT? getActionEstimatedSuccessChance for every action in the CURRENT city.
 *             Q11 asks "HP cost per FAILED operation". If Raid reads [1.0, 1.0] here we
 *             never fail, so that cost is never paid and Q11 cannot gate Stage B in this
 *             city. bladeburner-state.json currently reads stageBBlockedBy: "Q11".
 *
 *   Q14/RETRACTION  getCityEstimatedPopulation + getCityCommunities for ALL SIX cities.
 *             Both take a city argument, so this needs NO travel and changes nothing.
 *             Volhaven's cached pop reads 0 with 77 communities and a ~10h-stale
 *             updatedMs -- if a fresh read returns nonzero, the "Volhaven is dead"
 *             reading was staleness, which is what the retraction claimed.
 *
 * 🔴 EVERY VALUE HERE IS AN `Estimated` RANGE [MIN, MAX], NOT A POINT. That is the trap
 * that produced three successive wrong conclusions on this exact question. [0.0, 1.0] is
 * maximum uncertainty = UNSCOUTED, and is NOT the same as "zero". Report ranges, never
 * midpoints.
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  if (ns.args[0] === "intel") return intelRun(ns);

  const startedAt = Date.now();
  const out = {
    probe: "leverprobe",
    startedAt,
    startedAtLabel: new Date(startedAt).toISOString(),
    note: "read-only; no game state modified",
  };

  // ---- Q-CAP: action levels, current vs max ------------------------------
  // getActionCurrentLevel / getActionMaxLevel both return -1 on an invalid pair,
  // so -1 is recorded verbatim rather than silently coerced.
  const levels = [];
  const contractNames = ns.bladeburner.getContractNames();
  const operationNames = ns.bladeburner.getOperationNames();
  for (const [kind, names] of [["Contracts", contractNames], ["Operations", operationNames]]) {
    for (const name of names) {
      levels.push({
        kind,
        name,
        current: ns.bladeburner.getActionCurrentLevel(kind, name),
        max: ns.bladeburner.getActionMaxLevel(kind, name),
      });
    }
  }
  out.actionLevels = levels;
  out.capVerdict = summariseCap(levels);

  // ---- skills + banked SP ------------------------------------------------
  const skillNames = [
    "Blade's Intuition", "Cloak", "Short-Circuit", "Digital Observer", "Tracer",
    "Overclock", "Reaper", "Evasive System", "Datamancer", "Cyber's Edge",
    "Hands of Midas", "Hyperdrive",
  ];
  out.skillPoints = ns.bladeburner.getSkillPoints();
  out.skills = skillNames.map((name) => {
    const entry = { name, level: ns.bladeburner.getSkillLevel(name) };
    try {
      entry.nextCost = ns.bladeburner.getSkillUpgradeCost(name, 1);
    } catch (err) {
      entry.nextCost = null;
      entry.costError = String(err).slice(0, 120);
    }
    return entry;
  });

  // ---- chaos across all cities (informs rotation + Q-DIP) ----------------
  const cityNames = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"];
  out.homeCity = ns.bladeburner.getCity();
  out.chaos = {};
  for (const city of cityNames) {
    try {
      out.chaos[city] = ns.bladeburner.getCityChaos(city);
    } catch (err) {
      out.chaos[city] = null;
    }
  }

  out.rankAtStart = ns.bladeburner.getRank();

  // ---- Q-REGEN + Q-DIP: stamina time series ------------------------------
  // Sample current/max stamina plus the live action. Regen is derived from the
  // RISING segments only -- Q10 established that spend happens as a discrete
  // drop on action completion, so a naive endpoint slope would net the two out.
  const series = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const pair = ns.bladeburner.getStamina(); // [current, max]
    let actionName = null;
    let actionType = null;
    try {
      const act = ns.bladeburner.getCurrentAction();
      if (act) {
        actionName = act.name ?? null;
        actionType = act.type ?? null;
      }
    } catch (err) {
      actionName = "<error>";
    }
    series.push({
      t: Date.now(),
      cur: pair[0],
      max: pair[1],
      actionType,
      actionName,
    });
    await ns.sleep(SAMPLE_MS);
  }
  out.staminaSeries = series;
  out.regen = deriveRegen(series);
  out.rankAtEnd = ns.bladeburner.getRank();
  out.finishedAt = Date.now();

  const fname = `leverprobe-${startedAt}.json`;
  ns.write(fname, JSON.stringify(out, null, 2), "w");

  ns.tprint("=== leverprobe ===");
  ns.tprint(`CAP: ${out.capVerdict.summary}`);
  ns.tprint(`REGEN: ${out.regen.summary}`);
  ns.tprint(`staminaMax observed: ${out.regen.maxObserved}`);
  ns.tprint(`chaos ${out.homeCity}: ${ns.format.number(out.chaos[out.homeCity] ?? 0)}`);
  ns.tprint(`skill points banked: ${ns.format.number(out.skillPoints)}`);
  ns.tprint(`wrote ${fname}`);
}

/**
 * READ-ONLY intel pass. No travel, no action change, no purchase.
 * @param {NS} ns
 */
async function intelRun(ns) {
  const startedAt = Date.now();
  const city = ns.bladeburner.getCity();
  const out = {
    probe: "leverprobe:intel",
    startedAt,
    startedAtLabel: new Date(startedAt).toISOString(),
    currentCity: city,
    note: "read-only; no travel, no state change. ALL success values are [min,max] ESTIMATE ranges.",
  };

  // ---- Q11: do we ever actually fail in this city? ----------------------
  const actions = [
    ...ns.bladeburner.getContractNames().map((n) => ["Contracts", n]),
    ...ns.bladeburner.getOperationNames().map((n) => ["Operations", n]),
  ];
  out.successRanges = actions.map(([kind, name]) => {
    const entry = { kind, name };
    try {
      const range = ns.bladeburner.getActionEstimatedSuccessChance(kind, name);
      entry.pMin = range[0];
      entry.pMax = range[1];
      entry.converged = range[0] === range[1];
      entry.unscouted = range[0] === 0 && range[1] === 1;
      entry.neverFails = range[0] >= 1;
    } catch (err) {
      entry.error = String(err).slice(0, 120);
    }
    try {
      entry.countRemaining = ns.bladeburner.getActionCountRemaining(kind, name);
    } catch (err) {
      entry.countRemaining = null;
    }
    return entry;
  });
  const raid = out.successRanges.find((x) => x.name === "Raid");
  out.q11Verdict = !raid || raid.pMin === undefined
    ? "Raid unreadable"
    : raid.neverFails
      ? `Raid pMin=${raid.pMin} in ${city} -> NEVER FAILS -> Q11 (HP per failed op) cannot gate Stage B here`
      : `Raid pMin=${raid.pMin} pMax=${raid.pMax} in ${city} -> failure IS possible -> Q11 still binds`;

  // ---- Q14 / the retraction: is Volhaven dead, or just unscouted? -------
  const cityNames = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"];
  out.cities = cityNames.map((name) => {
    const entry = { name };
    try {
      entry.population = ns.bladeburner.getCityEstimatedPopulation(name);
    } catch (err) {
      entry.population = null;
    }
    try {
      entry.communities = ns.bladeburner.getCityCommunities(name);
    } catch (err) {
      entry.communities = null;
    }
    try {
      entry.chaos = ns.bladeburner.getCityChaos(name);
    } catch (err) {
      entry.chaos = null;
    }
    return entry;
  });
  const vol = out.cities.find((c) => c.name === "Volhaven");
  out.volhavenVerdict = vol && vol.population > 0
    ? `Volhaven pop reads ${vol.population} -> the cached 0 was STALE/unscouted, not drained`
    : `Volhaven pop still reads ${vol ? vol.population : "?"} with ${vol ? vol.communities : "?"} communities -> inconclusive from population alone (this is an ESTIMATE; 0 can mean unknown)`;

  out.finishedAt = Date.now();
  const fname = `leverprobe-${startedAt}.json`;
  ns.write(fname, JSON.stringify(out, null, 2), "w");

  ns.tprint("=== leverprobe:intel ===");
  ns.tprint(`city: ${city}`);
  ns.tprint(`Q11: ${out.q11Verdict}`);
  ns.tprint(`Volhaven: ${out.volhavenVerdict}`);
  ns.tprint(`wrote ${fname}`);
}

/** Pure. Reports whether any action is sitting AT its max level. */
function summariseCap(levels) {
  const valid = levels.filter((x) => x.max > 0);
  const atCap = valid.filter((x) => x.current >= x.max);
  const maxima = [...new Set(valid.map((x) => x.max))].sort((a, b) => a - b);
  return {
    distinctMaxValues: maxima,
    atCap: atCap.map((x) => `${x.name} ${x.current}/${x.max}`),
    summary: atCap.length
      ? `${atCap.length} action(s) AT CAP -- ${atCap.map((x) => `${x.name} ${x.current}/${x.max}`).join(", ")}`
      : `none at cap; max levels seen: ${maxima.join(", ")}`,
  };
}

/**
 * Pure. Regen from rising segments only. Any interval where current DROPPED is a
 * spend event (Q10) and is excluded rather than averaged in.
 */
function deriveRegen(series) {
  let gained = 0;
  let seconds = 0;
  let drops = 0;
  let dropTotal = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    const dv = cur.cur - prev.cur;
    const dt = (cur.t - prev.t) / 1000;
    if (dt <= 0) continue;
    if (dv >= 0) {
      gained += dv;
      seconds += dt;
    } else {
      drops++;
      dropTotal += -dv;
    }
  }
  const rate = seconds > 0 ? gained / seconds : null;
  const maxObserved = series.length ? series[series.length - 1].max : null;
  // Q10 baseline: 0.03352/s measured at the pre-install max.
  const flatPrediction = 0.03352;
  let verdict = "inconclusive";
  if (rate !== null && maxObserved) {
    const ratio = rate / flatPrediction;
    if (ratio > 0.85) verdict = "FLAT (regen independent of max) -> Cyber's Edge buys no throughput";
    else if (ratio < 0.7) verdict = "SCALES with max -> Cyber's Edge multiplies rank rate";
    else verdict = "ambiguous -- between flat and proportional";
  }
  return {
    ratePerSec: rate,
    risingSeconds: seconds,
    dropCount: drops,
    meanDrop: drops > 0 ? dropTotal / drops : null,
    maxObserved,
    q10Baseline: flatPrediction,
    verdict,
    summary: rate === null
      ? "no data"
      : `${rate.toFixed(5)}/s over ${seconds.toFixed(0)}s rising (${drops} spend events) -- ${verdict}`,
  };
}
