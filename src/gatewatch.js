/**
 * GP1 watcher (2026-07-21) -- auto-captures BN2.1's single most important
 * measurement: the true `w0r1d_d43m0n` hacking-level gate, which is only
 * READABLE once The Red Pill installs (before that `getServerRequiredHackingLevel`
 * returns a placeholder -- the source of the ~85%-confidence 15,000 INFERENCE).
 * The whole clear plan scales linearly off this number, so a 24/7 unattended run
 * must not miss the moment. Automates "run worldprobe.js the instant Red Pill
 * lands" and folds in the second open measurement (does NiteSec faction rep
 * survive an install? -- decides whether the deep NFG tail is money- or
 * rep-paced; see BACKLOG.md).
 *
 * Resident daemon companion (relaunched after each install, so it's alive on the
 * far side of the Red-Pill install boundary). Each poll appends one sample to a
 * ring-capped series (seeded from the existing file so restarts/installs don't
 * wipe the pre-install rep history -- same pattern as gangmanager.js's
 * seedGangLog). When Red Pill first reads as INSTALLED, it: reads the live gate,
 * compares post-install NiteSec rep to the last pre-install sample (the
 * rep-survives verdict), writes a durable `gatewatch-result.json`, tprints a loud
 * alert, and exits (job done).
 *
 * RAM: base calls (getResetInfo/getServerRequiredHackingLevel/getHackingLevel/
 * getPlayer) + one Singularity call (getFactionRep, ~1x at SF4.3), guarded so a
 * post-install not-a-member state is recorded, not crashed. Exec'd by daemon.js
 * by filename; never imported.
 */

const NITESEC = "NiteSec";
const WD = "w0r1d_d43m0n";
const RED_PILL = "The Red Pill";
const LOG_FILE = "gatewatch-log.json";
const RESULT_FILE = "gatewatch-result.json";
const POLL_MS = 60_000;
const MAX_SAMPLES = 500;

/** Pure. Seed the poll series from persisted content (survives restart/install); [] on any bad read, ring-capped. */
export function seedSamples(raw, cap = MAX_SAMPLES) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.length > cap ? parsed.slice(parsed.length - cap) : parsed;
}

/** Pure. Given the seeded series and a fresh post-install rep, the rep-survives verdict vs the last pre-install sample. */
export function repSurvivesVerdict(samples, postRep) {
  const lastPre = [...samples].reverse().find((s) => s && s.redPill === false && Number.isFinite(s.niteSecRep));
  if (!lastPre) return { known: false, preRep: null, postRep, survived: null };
  // "survived" = post-install rep is not a reset-to-zero (allow a small tolerance for rounding).
  return { known: true, preRep: lastPre.niteSecRep, postRep, survived: postRep > lastPre.niteSecRep * 0.5 };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  let samples = seedSamples(ns.read(LOG_FILE));

  while (true) {
    const now = Date.now();
    const owned = ns.getResetInfo().ownedAugs ?? {};
    const redPill = RED_PILL in owned;

    let niteSecRep = null;
    try {
      niteSecRep = ns.singularity.getFactionRep(NITESEC);
    } catch {
      niteSecRep = null; // not a member (e.g. just after an install) -- itself a signal
    }

    // WD does not exist until Red Pill installs, so getServerRequiredHackingLevel
    // THROWS before then (worldprobe.js guards this identically). null until live.
    let gateRequirement = null;
    try {
      gateRequirement = ns.getServerRequiredHackingLevel(WD);
    } catch {
      gateRequirement = null;
    }

    const sample = {
      timestamp: now,
      time: new Date(now).toLocaleString(),
      redPill,
      niteSecRep,
      hackingLevel: ns.getHackingLevel(),
      M: ns.getPlayer().mults.hacking,
      gateRequirement,
    };
    samples.push(sample);
    if (samples.length > MAX_SAMPLES) samples = samples.slice(samples.length - MAX_SAMPLES);
    ns.write(LOG_FILE, JSON.stringify(samples), "w");

    if (redPill) {
      const verdict = repSurvivesVerdict(samples, niteSecRep);
      const result = {
        ...sample,
        neededMForGate: null, // filled below
        repSurvivesInstall: verdict,
        note: "GP1 CAPTURED -- true WD gate is now live (Red Pill installed). Re-size the clear plan off gateRequirement.",
      };
      // M needed for the gate is (gate / base-level-at-M=1) -- we can't cleanly invert here, so leave the raw
      // gate + current M/level for the human/next-session to re-derive against docs/bitnodes.md's level formula.
      ns.write(RESULT_FILE, JSON.stringify(result, null, 2), "w");
      ns.tprint("=====================================================");
      ns.tprint("=== GP1 CAPTURED: w0r1d_d43m0n gate is now LIVE ===");
      ns.tprint(`  required hacking level : ${sample.gateRequirement}`);
      ns.tprint(`  player hacking now     : ${sample.hackingLevel}   (M=${sample.M.toFixed(3)})`);
      ns.tprint(
        `  NiteSec rep survives install: ${verdict.known ? (verdict.survived ? `YES (pre ${Math.round(verdict.preRep)} -> post ${Math.round(verdict.postRep)})` : `NO (pre ${Math.round(verdict.preRep)} -> post ${Math.round(verdict.postRep ?? 0)})`) : "unknown (no pre-install sample)"}`
      );
      ns.tprint(`  -> logs/${RESULT_FILE}. Everything in the clear-plan table re-sizes off the gate above.`);
      ns.tprint("=====================================================");
      return; // done
    }

    await ns.sleep(POLL_MS);
  }
}
