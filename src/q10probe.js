/**
 * q10probe.js - READ-ONLY dense sampler answering Q10: is Bladeburner stamina spent
 * PER ACTION or PER SECOND?
 *
 * Why it matters (docs/bladeburner-reference.md §10): `Overclock` cuts action time -1%
 * per level to a max of 90. We sit at 17 (OVERCLOCK_HOLD_LEVEL), so ~x8.3 throughput is
 * unclaimed -- the difference between a ~26-day and a ~4-day path to the 400,000 gate.
 * But that x8.3 is only real if stamina is spent per SECOND. If it is spent per ACTION,
 * faster actions burn stamina proportionally faster, sustainable duty falls to match, and
 * Overclock buys nothing. Nobody has measured which.
 *
 * The discriminator: STAMINA DRAINED PER COMPLETED ACTION, and PER RANK-PRODUCING SECOND.
 * Run this once at the current Overclock level, raise Overclock, run it again:
 *   - per-second  => drain/sec constant across the two runs; drain/action FALLS with time
 *   - per-action  => drain/action constant across the two runs; drain/sec RISES
 *
 * Read-only: no startAction, no upgradeSkill, no setActionLevel, no switchCity. It does
 * NOT claim the player-action slot, so it runs alongside bladeburnermanager.js rather than
 * contending with it (see the four-claimant LANDMINE in CLAUDE.md) -- it only watches.
 *
 * Deliberately samples every SAMPLE_MS rather than trusting the engine's own telemetry:
 * "an engine that measures itself must be validated against an independent source"
 * (the Phase 38 lesson). This is that independent source.
 *
 *   run q10probe.js            # 300s (default)
 *   run q10probe.js 600 base   # 600s, tagged "base"
 *
 * Writes q10probe-<epoch>.json (synced to logs/ by the vite.config.ts filter).
 *
 * @param {NS} ns
 */
export async function main(ns) {
  ns.disableLog("ALL");
  const durationSec = Number(ns.args[0]) || 300;
  const tag = String(ns.args[1] ?? "run");
  const SAMPLE_MS = 1000;

  if (!ns.bladeburner.inBladeburner()) {
    ns.tprint("ERROR: not in the Bladeburner division.");
    return;
  }

  const skillLevels = {};
  for (const sk of ["Overclock", "Blade's Intuition", "Digital Observer", "Tracer", "Reaper", "Evasive System"]) {
    skillLevels[sk] = ns.bladeburner.getSkillLevel(sk);
  }
  const trackingTimeMs = ns.bladeburner.getActionTime("Contracts", "Tracking");

  const samples = [];
  const startMs = Date.now();
  const endMs = startMs + durationSec * 1000;

  while (Date.now() < endMs) {
    const stam = ns.bladeburner.getStamina(); // [current, max]
    const act = ns.bladeburner.getCurrentAction();
    samples.push({
      t: Date.now() - startMs,
      cur: stam[0],
      max: stam[1],
      rank: ns.bladeburner.getRank(),
      // `act` is null when nothing is running; record the shape, not a guess.
      actType: act ? act.type : null,
      actName: act ? act.name : null,
    });
    await ns.sleep(SAMPLE_MS);
  }

  // --- analysis -------------------------------------------------------------
  // A "rank-producing" sample is one where a Contract/Operation was running.
  // Regeneration (Hyperbolic Regeneration Chamber) and idle are excluded from the
  // drain numerator AND denominator -- mixing them in is what makes naive duty-based
  // stamina estimates meaningless.
  const isProducing = (s) => s.actType === "Contracts" || s.actType === "Operations";

  let drainTotal = 0;
  let producingSec = 0;      // ALL producing wall-time, not just seconds that happened to drain
  let regenTotal = 0;
  let regenSec = 0;
  let actionCompletions = 0;
  let drainTickCount = 0;    // producing seconds on which stamina actually FELL
  const drainTicks = [];     // the discrete drops, for shape inspection

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    const dt = (cur.t - prev.t) / 1000;
    const delta = prev.cur - cur.cur; // positive = drained
    const rankTick = cur.rank > prev.rank + 1e-9;

    if (isProducing(prev) && isProducing(cur)) {
      producingSec += dt;
      if (delta > 0) {
        drainTotal += delta;
        drainTickCount += 1;
        if (drainTicks.length < 60) drainTicks.push({ tSec: cur.t / 1000, drop: delta, rankTick });
      }
      if (rankTick) actionCompletions += 1;
    } else if (!isProducing(prev) && !isProducing(cur) && delta < 0) {
      regenTotal += -delta; regenSec += dt;
    }
  }

  const drainPerSec = producingSec > 0 ? drainTotal / producingSec : null;
  const drainPerAction = actionCompletions > 0 ? drainTotal / actionCompletions : null;
  const regenPerSec = regenSec > 0 ? regenTotal / regenSec : null;

  // THE SINGLE-RUN DISCRIMINATOR.
  // Per-SECOND stamina => stamina falls on (nearly) every producing second, so
  // drainTickCount ~ producingSec and drops are small + uniform.
  // Per-ACTION stamina => it falls only when an action completes, so
  // drainTickCount ~ actionCompletions and drops are large + spiky.
  // Reporting the ratio to BOTH candidates means the verdict does not rest on one
  // hand-picked denominator.
  const tickPerProducingSec = producingSec > 0 ? drainTickCount / producingSec : null;
  const tickPerCompletion = actionCompletions > 0 ? drainTickCount / actionCompletions : null;
  let verdict = "inconclusive";
  if (tickPerProducingSec !== null && tickPerCompletion !== null) {
    if (tickPerProducingSec > 0.5 && tickPerCompletion > 2) verdict = "PER-SECOND";
    else if (tickPerProducingSec < 0.2 && tickPerCompletion >= 0.5 && tickPerCompletion <= 2) verdict = "PER-ACTION";
  }

  const result = {
    ts: startMs,
    iso: new Date(startMs).toISOString(),
    tag,
    note: "Q10 read-only stamina-accounting sweep",
    durationSec,
    sampleMs: SAMPLE_MS,
    skillLevels,
    trackingTimeMs,
    totals: {
      samples: samples.length,
      producingSec,
      drainTotal,
      actionCompletions,
      drainTickCount,
      regenSec,
      regenTotal,
    },
    metrics: {
      drainPerProducingSec: drainPerSec,
      drainPerCompletedAction: drainPerAction,
      regenPerRestingSec: regenPerSec,
      rankGained: samples.length ? samples[samples.length - 1].rank - samples[0].rank : 0,
      // Single-run discriminator -- see the comment block above.
      tickPerProducingSec,
      tickPerCompletion,
      verdict,
    },
    drainTicks,
    samples,
  };

  const file = `q10probe-${startMs}.json`;
  ns.write(file, JSON.stringify(result, null, 1), "w");

  ns.tprint(`q10probe [${tag}] Overclock=${skillLevels.Overclock} trackingTime=${(trackingTimeMs / 1000).toFixed(1)}s`);
  ns.tprint(`  producing ${producingSec.toFixed(0)}s | drained ${drainTotal.toFixed(2)} | completions ${actionCompletions} | drainTicks ${drainTickCount}`);
  ns.tprint(`  drain/sec    = ${drainPerSec === null ? "n/a" : drainPerSec.toFixed(5)}`);
  ns.tprint(`  drain/action = ${drainPerAction === null ? "n/a" : drainPerAction.toFixed(4)}`);
  ns.tprint(`  ticks/producingSec = ${tickPerProducingSec === null ? "n/a" : tickPerProducingSec.toFixed(3)} | ticks/completion = ${tickPerCompletion === null ? "n/a" : tickPerCompletion.toFixed(2)}`);
  ns.tprint(`  VERDICT: ${verdict}`);
  ns.tprint(`  -> ${file}`);
}
