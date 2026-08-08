/**
 * raidtest.js -- MEASURES WHAT A RAID COSTS A CITY. This script CHANGES GAME STATE.
 *
 * 🔴 IRREVERSIBLE, BY DESIGN. Raiding a city is believed to reduce its population and
 * communities and cannot be undone. That is the entire point: the cost has NEVER been
 * measured, and the retracted "Raid permanently kills a city" finding left the question
 * *unanswered*, not *answered safely*. This spends a city we do not use in order to price
 * the one we do.
 *
 * Kenneth authorised this test explicitly on 2026-08-08 ("yea test") after being shown the
 * irreversibility. It is NOT covered by the standing read-only probe grant.
 *
 *   run raidtest.js Aevum 20        # raid Aevum 20 times, measure, come home
 *
 * WHY A THROWAWAY CITY: `Raid` scores ~97 rank/action vs the ~12 we currently average, and
 * actions/hour is pinned at ~55 by stamina, so rank/sec is directly proportional to
 * rank/action. If Raid is cheap this is a ~7x lever (≈21 days -> ≈3). If it is expensive we
 * need to know that BEFORE pointing it at Ishima, which is our best city by 3.8x population
 * and 8.5x chaos.
 *
 * 🔴 CAVEAT ADDED 2026-08-08, AFTER THIS SCRIPT WAS WRITTEN -- READ BEFORE TRUSTING THE ~7x.
 * That "~97 rank/action" is a PREDICTION from `getActionEstimatedSuccessChance`, and that
 * estimator was measured the same day to be biased HIGH at its LOWER bound -- not merely
 * uncertain (`docs/bn6-go-no-go.md` §11.5). The measurement: `Investigation` predicts
 * pMin 0.764 and realises a ~7% success rate; over 960 actions it pays 4.27 rank/action
 * against a predicted 14.23, and 68.9% of its attempts pay nothing at all. So:
 *
 *   - The PAYOFF half of the case above is soft. Even the converged pMin-1.0 case
 *     (`Tracking`, 965 actions, zero failures) still over-states rank MAGNITUDE by 17%.
 *     Treat ~97 as an upper bound that has never been realised, not as a measurement.
 *   - The COST half is unaffected, and is still the whole point -- pop/community loss is
 *     read from `getCityEstimatedPopulation`/`getCityCommunities` before and after, not
 *     predicted. This test remains worth running.
 *
 * 🔴 AND IT WEAKENS THE SAFETY GATE BELOW, which is the more important consequence.
 * `MIN_SAFE_PMIN` = 0.9 exists to stop us raiding where failures cost HP (Q11). But the bias
 * lands specifically in the UNCONVERGED range: pMin 1.000 proved accurate on success rate
 * (Tracking: 0 failures in 965), pMin 0.764 proved wildly optimistic (Investigation: ~7%).
 * A pMin of 0.9 is therefore in the untrustworthy regime -- it is NOT evidence of 90% real
 * success. **Consider requiring pMin === 1.0 (fully converged) before raiding anything.**
 * Deliberately left at 0.9 rather than changed silently: tightening it is a behaviour change
 * to an authorised, state-mutating script and is Kenneth's call. Raised 2026-08-08.
 *
 * SAFETY RAILS (all abort -> travel home -> write the log):
 *   - refuses to run in Ishima or any city given as the HOME_CITY
 *   - aborts before raiding if Raid's pMin in the target is below MIN_SAFE_PMIN (a failed
 *     operation costs HP -- that is Q11, and Q11 is only known moot in Ishima)
 *   - aborts mid-run if HP drops below HP_ABORT_FRACTION
 *   - aborts mid-run if stamina drops below STAM_ABORT_FRACTION
 *   - ALWAYS returns to HOME_CITY in a finally block, even on exception
 *
 * PRECONDITION -- the caller MUST have quiesced all four player-action-slot claimants first
 * (bladeburnermanager via bladeburner-off.txt, plus augfarmer/backdoorfactions/backdoorwd).
 * `startAction` returning true does NOT mean the action started; this script verifies with
 * getCurrentAction and aborts if it cannot hold the slot.
 *
 * Output: logs/leverprobe-<epoch>.json (reuses the live download filter; probe field = raidtest)
 */

const BB_OFF_MARKER = "bladeburner-off.txt"; // must match bladeburnermanager.js:42
const HOME_CITY = "Ishima";
const MIN_SAFE_PMIN = 0.9;
const HP_ABORT_FRACTION = 0.6;
const STAM_ABORT_FRACTION = 0.35;
const MAX_RAIDS = 40;
const POLL_MS = 1000;
const ACTION_TIMEOUT_MS = 300_000;

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const target = String(ns.args[0] ?? "");
  const wanted = Math.min(Number(ns.args[1]) || 0, MAX_RAIDS);
  const startedAt = Date.now();
  const fname = `leverprobe-${startedAt}.json`;

  const out = {
    probe: "raidtest",
    startedAt,
    startedAtLabel: new Date(startedAt).toISOString(),
    target,
    requested: wanted,
    homeCity: HOME_CITY,
    aborted: false,
    abortReason: null,
    raidsCompleted: 0,
    events: [],
  };
  const note = (msg) => {
    out.events.push({ t: Date.now(), msg });
    ns.print(msg);
  };

  if (!target || wanted < 1) {
    ns.tprint("ERROR usage: run raidtest.js <city> <count>");
    return;
  }
  if (target === HOME_CITY) {
    ns.tprint(`ERROR refusing to raid ${HOME_CITY} -- this script only tests throwaway cities`);
    return;
  }

  const snapshot = (label) => {
    const row = { label, t: Date.now() };
    for (const c of [target, HOME_CITY]) {
      row[c] = {
        pop: safe(() => ns.bladeburner.getCityEstimatedPopulation(c)),
        communities: safe(() => ns.bladeburner.getCityCommunities(c)),
        chaos: safe(() => ns.bladeburner.getCityChaos(c)),
      };
    }
    row.rank = safe(() => ns.bladeburner.getRank());
    row.raidCount = safe(() => ns.bladeburner.getActionCountRemaining("Operations", "Raid"));
    const st = safe(() => ns.bladeburner.getStamina());
    if (st) { row.stam = st[0]; row.stamMax = st[1]; }
    return row;
  };

  try {
    // Stand bladeburnermanager.js down for the duration, and OWN the cleanup. Creating this
    // marker by hand is a trap: if anything then fails, the engine stays off indefinitely and
    // the run silently earns zero rank. Tying it to this script's finally block means the
    // engine always comes back, including on an exception or a kill mid-run.
    ns.write(BB_OFF_MARKER, "raidtest", "w");
    out.events.push({ t: Date.now(), msg: `created ${BB_OFF_MARKER} (engine stand-down)` });
    await ns.sleep(6000); // let the manager notice, stop its action, and release the slot

    out.before = snapshot("before-travel");
    note(`traveling ${ns.bladeburner.getCity()} -> ${target}`);
    ns.bladeburner.switchCity(target);
    await ns.sleep(1500);
    const arrivedAt = ns.bladeburner.getCity();
    if (arrivedAt !== target) {
      out.aborted = true;
      out.abortReason = `switchCity did not take -- still in ${arrivedAt}`;
      return;
    }

    // Gate 1: is Raid actually safe here? A failed operation costs HP (Q11), and Q11 is
    // only known moot in Ishima. An unscouted city reads [0,1] and must NOT be raided.
    const range = ns.bladeburner.getActionEstimatedSuccessChance("Operations", "Raid");
    out.targetRaidSuccess = { pMin: range[0], pMax: range[1], unscouted: range[0] === 0 && range[1] === 1 };
    note(`${target} Raid success = [${range[0]}, ${range[1]}]`);
    if (range[0] < MIN_SAFE_PMIN) {
      out.aborted = true;
      out.abortReason = `Raid pMin ${range[0]} < ${MIN_SAFE_PMIN} in ${target} -- unsafe (failed ops cost HP). NOT raiding.`;
      note(out.abortReason);
      return;
    }

    out.baseline = snapshot("baseline-in-target");
    out.perRaid = [];

    for (let i = 0; i < wanted; i++) {
      const hpFrac = ns.getPlayer().hp.current / ns.getPlayer().hp.max;
      const st = ns.bladeburner.getStamina();
      if (hpFrac < HP_ABORT_FRACTION) {
        out.aborted = true;
        out.abortReason = `HP ${(hpFrac * 100).toFixed(0)}% below floor after ${i} raids`;
        break;
      }
      if (st[0] / st[1] < STAM_ABORT_FRACTION) {
        out.aborted = true;
        out.abortReason = `stamina ${(st[0] / st[1] * 100).toFixed(0)}% below floor after ${i} raids`;
        break;
      }

      ns.bladeburner.startAction("Operations", "Raid");
      await ns.sleep(1200);
      // The documented trap: startAction's boolean lies. Verify.
      const running = ns.bladeburner.getCurrentAction();
      if (!running || running.name !== "Raid") {
        out.aborted = true;
        out.abortReason = `could not hold the action slot on raid ${i + 1} (getCurrentAction=${running ? running.name : "null"}) -- a slot claimant is still live`;
        break;
      }

      const waitStart = Date.now();
      while (Date.now() - waitStart < ACTION_TIMEOUT_MS) {
        const cur = ns.bladeburner.getCurrentAction();
        if (!cur || cur.name !== "Raid") break;
        await ns.sleep(POLL_MS);
      }
      out.raidsCompleted = i + 1;
      out.perRaid.push(snapshot(`after-raid-${i + 1}`));
      note(`raid ${i + 1}/${wanted} done`);
    }

    out.after = snapshot("after-raids");
  } catch (err) {
    out.aborted = true;
    out.abortReason = `exception: ${String(err).slice(0, 300)}`;
  } finally {
    try { ns.bladeburner.stopBladeburnerAction(); } catch { /* already idle */ }
    try {
      ns.bladeburner.switchCity(HOME_CITY);
      await ns.sleep(1500);
    } catch (err) {
      out.events.push({ t: Date.now(), msg: `FAILED to return to ${HOME_CITY}: ${String(err).slice(0, 200)}` });
    }
    // Hand the engine back. This MUST happen on every path -- see the note at creation.
    try {
      if (ns.fileExists(BB_OFF_MARKER, "home")) ns.rm(BB_OFF_MARKER, "home");
      out.events.push({ t: Date.now(), msg: `removed ${BB_OFF_MARKER} (engine resumed)` });
      out.offMarkerCleared = !ns.fileExists(BB_OFF_MARKER, "home");
    } catch (err) {
      out.offMarkerCleared = false;
      out.events.push({ t: Date.now(), msg: `🔴 FAILED to remove ${BB_OFF_MARKER}: ${String(err).slice(0, 200)} -- DELETE IT MANUALLY OR THE ENGINE STAYS OFF` });
    }
    out.endedInCity = safe(() => ns.bladeburner.getCity());
    out.finishedAt = Date.now();
    out.delta = computeDelta(out);
    ns.write(fname, JSON.stringify(out, null, 2), "w");

    ns.tprint("=== raidtest ===");
    ns.tprint(`target ${target} | raids completed ${out.raidsCompleted}/${wanted}`);
    if (out.aborted) ns.tprint(`ABORTED: ${out.abortReason}`);
    if (out.delta) {
      ns.tprint(`pop     ${out.delta.popBefore} -> ${out.delta.popAfter}  (${out.delta.popPct})`);
      ns.tprint(`commun. ${out.delta.commBefore} -> ${out.delta.commAfter}`);
      ns.tprint(`per raid: ${out.delta.popPerRaid} pop, ${out.delta.commPerRaid} communities`);
    }
    ns.tprint(`ended in ${out.endedInCity} | off-marker cleared: ${out.offMarkerCleared} | wrote ${fname}`);
    if (!out.offMarkerCleared) ns.tprint(`🔴 DELETE ${BB_OFF_MARKER} MANUALLY -- the engine is still stood down`);
  }
}

function safe(fn) {
  try { return fn(); } catch { return null; }
}

/** Pure. Population/community delta attributable to the raids. */
function computeDelta(out) {
  if (!out.baseline || !out.after || !out.raidsCompleted) return null;
  const t = out.target;
  const a = out.baseline[t];
  const b = out.after[t];
  if (!a || !b || a.pop === null || b.pop === null) return null;
  const dPop = b.pop - a.pop;
  const dComm = b.communities - a.communities;
  return {
    popBefore: a.pop.toExponential(4),
    popAfter: b.pop.toExponential(4),
    popPct: a.pop > 0 ? `${((dPop / a.pop) * 100).toFixed(3)}%` : "n/a",
    commBefore: a.communities,
    commAfter: b.communities,
    popPerRaid: (dPop / out.raidsCompleted).toExponential(4),
    commPerRaid: (dComm / out.raidsCompleted).toFixed(4),
    chaosBefore: a.chaos,
    chaosAfter: b.chaos,
  };
}
