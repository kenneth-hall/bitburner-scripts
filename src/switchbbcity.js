/**
 * One-off: move the Bladeburner division to a named city, and MEASURE what that costs.
 *
 * Why this exists (2026-08-03): the engine only ever sampled its own city's chaos, so
 * nobody knew Sector-12 sat at 177.5 chaos while Volhaven sat at 3.4. Sampling all six
 * (free -- getCityChaos was already charged) showed Sector-12 is the worst city on every
 * axis at once: chaos 177.5 vs 3.4, population 620.7m vs 1170.6m, communities 21 vs 75.
 * There is no trade-off to weigh, so the chaos problem is better solved by leaving than by
 * grinding Diplomacy.
 *
 * It is deliberately a MANUAL one-off, not engine behaviour: `CITY_ROTATION_ENABLED`
 * stays false in bladeburnermanager.js, because an autonomous rotation POLICY (when, how
 * often, anti-thrash hysteresis) is a spec-level decision that this does not pre-empt.
 *
 * Doubles as the Q5 measurement the reference lists as unknown -- "switchCity's cost,
 * travel time, and interaction with the running action are all undocumented and
 * unmeasured". Records money, the live action, and every city's stats either side of the
 * call, so the answer lands in a log instead of staying an open question.
 *
 *   run switchbbcity.js Volhaven
 *
 * @param {NS} ns
 */
export async function main(ns) {
  const CITIES = ["Aevum", "Chongqing", "Sector-12", "New Tokyo", "Ishima", "Volhaven"];
  const target = ns.args[0];

  if (!target || !CITIES.includes(target)) {
    ns.tprint(`ERROR: usage: run switchbbcity.js <city>  (one of: ${CITIES.join(", ")})`);
    return;
  }
  if (!ns.bladeburner.inBladeburner()) {
    ns.tprint("ERROR: not in the Bladeburner division.");
    return;
  }

  const snapshot = () =>
    Object.fromEntries(
      CITIES.map((c) => [c, { chaos: ns.bladeburner.getCityChaos(c), pop: ns.bladeburner.getCityEstimatedPopulation(c), communities: ns.bladeburner.getCityCommunities(c) }]),
    );

  const before = {
    city: ns.bladeburner.getCity(),
    money: ns.getPlayer().money,
    action: ns.bladeburner.getCurrentAction(),
    rank: ns.bladeburner.getRank(),
    stamina: ns.bladeburner.getStamina(),
    cities: snapshot(),
    atMs: Date.now(),
  };

  if (before.city === target) {
    ns.tprint(`INFO: already in ${target} -- nothing to do.`);
    return;
  }

  const returned = ns.bladeburner.switchCity(target);
  await ns.bladeburner.nextUpdate();

  const after = {
    city: ns.bladeburner.getCity(),
    money: ns.getPlayer().money,
    action: ns.bladeburner.getCurrentAction(),
    rank: ns.bladeburner.getRank(),
    stamina: ns.bladeburner.getStamina(),
    cities: snapshot(),
    atMs: Date.now(),
  };

  // The Q5 answers, computed rather than eyeballed.
  const result = {
    ts: before.atMs,
    iso: new Date(before.atMs).toISOString(),
    note: "Q5: switchCity cost / travel time / interaction with the running action",
    target,
    switchCityReturned: returned,
    switched: after.city === target,
    moneyCost: before.money - after.money,
    rankDelta: after.rank - before.rank,
    elapsedMs: after.atMs - before.atMs,
    actionBefore: before.action,
    actionAfter: after.action,
    // The engine restarts its own action next tick, so an interruption here is cheap --
    // but recording WHETHER it interrupts is the point.
    actionInterrupted: !!before.action && (!after.action || after.action.name !== before.action.name),
    chaosBefore: before.cities[before.city]?.chaos,
    chaosAfter: after.cities[after.city]?.chaos,
    before,
    after,
  };

  ns.write(`switchbbcity-${before.atMs}.json`, JSON.stringify(result, null, 2), "w");

  ns.tprint(`switchbbcity: ${before.city} -> ${after.city} (returned ${returned}, switched ${result.switched})`);
  ns.tprint(`  chaos ${result.chaosBefore?.toFixed(2)} -> ${result.chaosAfter?.toFixed(2)} | money cost $${ns.format.number(result.moneyCost)} | rank delta ${result.rankDelta.toFixed(4)}`);
  ns.tprint(`  action ${before.action ? before.action.name : "idle"} -> ${after.action ? after.action.name : "idle"} | interrupted ${result.actionInterrupted}`);
  ns.tprint(`  -> switchbbcity-${before.atMs}.json`);
}
