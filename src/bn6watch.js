/**
 * bn6watch.js -- READ-ONLY long-running sampler for the unattended BN6 session.
 *
 * WHY THIS EXISTS. Two constraints were measured on 2026-08-06/07 and neither is
 * tracked by any existing log:
 *
 *   1. `Tracking` capped at action level 100 -- the superlinear rank climb ended.
 *   2. `Tracking` ran to ZERO contracts remaining -- the engine's best contract is
 *      supply-starved, and NOTHING records how fast it comes back.
 *
 * Constraint 2 is the decision-relevant one and it is cheap to settle: sample
 * getActionCountRemaining over hours and fit the regeneration rate. If Tracking
 * regenerates at >= the ~55 actions/hour the stamina ceiling permits, supply is a
 * transient and the plateau is purely the level cap. If it regenerates slower, supply
 * is a hard ceiling and rank-per-action must come from somewhere else.
 *
 * STRICTLY READ-ONLY. No startAction, no upgradeSkill, no travel, no purchase. Does not
 * claim the player-action slot, so it is safe alongside bladeburnermanager.js and the
 * three other slot claimants.
 *
 * Output: logs/leverprobe-<epoch>.json  (deliberately reusing leverprobe's already-live
 * download filter -- adding a NEW filter needs a dev-server restart, and a restart
 * re-pushes src/ratchet-mode.txt, which is exactly what fired install #43. The `probe`
 * field distinguishes it. Do not "fix" this without reading CLAUDE.md's ratchet landmine.)
 *
 *   run bn6watch.js            # default cadence, runs until killed
 *   run bn6watch.js 30 480     # sample every 30s, stop after 480 samples
 */

const DEFAULT_INTERVAL_SEC = 60;
const DEFAULT_MAX_SAMPLES = 720; // 12h at 60s
const FLUSH_EVERY = 10; // rewrite the log every N samples

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const intervalSec = Number(ns.args[0]) > 0 ? Number(ns.args[0]) : DEFAULT_INTERVAL_SEC;
  const maxSamples = Number(ns.args[1]) > 0 ? Number(ns.args[1]) : DEFAULT_MAX_SAMPLES;
  const startedAt = Date.now();
  const fname = `leverprobe-${startedAt}.json`;

  const contractNames = ns.bladeburner.getContractNames();
  const operationNames = ns.bladeburner.getOperationNames();
  const tracked = [
    ...contractNames.map((n) => ["Contracts", n]),
    ...operationNames.map((n) => ["Operations", n]),
  ];

  const samples = [];
  const header = {
    probe: "bn6watch",
    startedAt,
    startedAtLabel: new Date(startedAt).toISOString(),
    intervalSec,
    maxSamples,
    note: "read-only long-run sampler; primary question is Tracking contract REGEN rate",
    city: ns.bladeburner.getCity(),
  };

  ns.tprint(`bn6watch: sampling every ${intervalSec}s, up to ${maxSamples} samples -> ${fname}`);

  for (let i = 0; i < maxSamples; i++) {
    const row = { t: Date.now() };
    try {
      row.rank = ns.bladeburner.getRank();
    } catch (err) { row.rank = null; }
    try {
      const pair = ns.bladeburner.getStamina();
      row.stam = pair[0];
      row.stamMax = pair[1];
    } catch (err) { row.stam = null; }
    try {
      const act = ns.bladeburner.getCurrentAction();
      row.act = act ? `${act.type}:${act.name}` : null;
    } catch (err) { row.act = null; }
    try {
      row.chaos = ns.bladeburner.getCityChaos(header.city);
    } catch (err) { row.chaos = null; }

    // The point of the whole script: per-action remaining counts over time.
    row.counts = {};
    for (const [kind, name] of tracked) {
      try {
        row.counts[name] = ns.bladeburner.getActionCountRemaining(kind, name);
      } catch (err) {
        row.counts[name] = null;
      }
    }
    samples.push(row);

    if (i % FLUSH_EVERY === 0 || i === maxSamples - 1) {
      const payload = { ...header, sampleCount: samples.length, lastAt: row.t, regen: fitRegen(samples), samples };
      ns.write(fname, JSON.stringify(payload), "w");
    }
    await ns.sleep(intervalSec * 1000);
  }

  const payload = { ...header, sampleCount: samples.length, finishedAt: Date.now(), regen: fitRegen(samples), samples };
  ns.write(fname, JSON.stringify(payload), "w");
  ns.tprint(`bn6watch: done, ${samples.length} samples -> ${fname}`);
}

/**
 * Pure. Per-action net change per hour. This is CONSUMPTION-NET regen: the engine is
 * spending from the same pool while we watch, so a positive number means "regenerating
 * faster than we burn it" and a negative means the reverse. That net is the number the
 * supply-ceiling question actually turns on -- gross regen is not separable here without
 * stopping the engine, which would not be read-only.
 */
function fitRegen(samples) {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const hours = (last.t - first.t) / 3.6e6;
  if (hours <= 0) return null;
  const perHour = {};
  for (const name of Object.keys(last.counts || {})) {
    const a = first.counts ? first.counts[name] : null;
    const b = last.counts[name];
    if (typeof a === "number" && typeof b === "number") {
      perHour[name] = (b - a) / hours;
    }
  }
  return { spanHours: hours, netPerHour: perHour };
}
