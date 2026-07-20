/**
 * ascendrecon.js -- Phase 29 recon. Answers the one question the docs can't:
 * does NiteSec faction rep track our respect TOTAL or our respect GAIN RATE?
 *
 * Ascension destroys respect. If rep tracks the total, faction rep should drop the
 * instant we ascend, and Tier 3 policy must be conservative. If rep tracks the rate,
 * faction rep keeps climbing monotonically and ascension is nearly free for us.
 *
 * Usage:
 *   run ascendrecon.js            -> PREVIEW ONLY. Reads getAscensionResult for every
 *                                    member and reports the trade. Ascends nothing.
 *   run ascendrecon.js --commit   -> preview, then ascend the single member with the
 *                                    LEAST earnedRespect (cheapest possible probe),
 *                                    sampling faction rep before and after.
 *
 * @param {NS} ns
 */
const FACTION = "NiteSec";

function snapshot(ns) {
  const info = ns.gang.getGangInformation();
  return {
    t: Date.now(),
    factionRep: ns.singularity.getFactionRep(FACTION),
    respect: info.respect,
    respectGainRate: info.respectGainRate,
    wantedLevel: info.wantedLevel,
    wantedPenalty: info.wantedPenalty,
  };
}

export async function main(ns) {
  const commit = ns.args.includes("--commit");
  const out = { ts: Date.now(), commit, previews: [], before: null, after: [], ascended: null };

  const members = ns.gang.getMemberNames();
  for (const name of members) {
    const info = ns.gang.getMemberInformation(name);
    let result = null;
    try {
      result = ns.gang.getAscensionResult(name);
    } catch (e) {
      result = { error: String(e) };
    }
    out.previews.push({
      name,
      task: info.task,
      earnedRespect: info.earnedRespect,
      hack: info.hack,
      hackAscMult: info.hack_asc_mult,
      hackAscPoints: info.hack_asc_points,
      result,
    });
  }

  ns.tprint(`=== ascension previews (${members.length} members) ===`);
  for (const p of out.previews) {
    const r = p.result || {};
    ns.tprint(
      `  ${p.name.padEnd(9)} hack ${String(p.hack).padStart(4)} ascMult x${(p.hackAscMult ?? 1).toFixed(3)} ` +
      `earnedResp ${Number(p.earnedRespect).toFixed(2).padStart(9)} | ascend -> hack x${r.hack ? r.hack.toFixed(4) : "?"} ` +
      `costing ${r.respect !== undefined ? Number(r.respect).toFixed(2) : "?"} respect`
    );
  }

  if (!commit) {
    const path = `ascendrecon-${out.ts}.json`;
    ns.write(path, JSON.stringify(out, null, 2), "w");
    ns.tprint(`PREVIEW ONLY -- nothing ascended. Re-run with --commit to probe.`);
    ns.tprint(`-> ${path}`);
    return;
  }

  // Cheapest possible probe: the member who has earned the least respect since their
  // last ascension is the one whose ascension destroys the least of our rep driver.
  const victim = out.previews
    .filter((p) => p.result && p.result.respect !== undefined)
    .sort((a, b) => a.result.respect - b.result.respect)[0];

  if (!victim) {
    ns.tprint("ERROR: no member has a valid ascension result -- nothing to probe.");
    return;
  }

  out.before = snapshot(ns);
  ns.tprint(`--- BEFORE: factionRep ${out.before.factionRep.toFixed(3)} | respect ${out.before.respect.toFixed(2)} | rate ${out.before.respectGainRate.toFixed(5)}`);
  ns.tprint(`--- ascending ${victim.name} (cheapest: ${victim.result.respect.toFixed(2)} respect)`);

  const applied = ns.gang.ascendMember(victim.name);
  out.ascended = { name: victim.name, applied };

  // Sample immediately, then across several gang ticks so a rate change is visible.
  for (let i = 0; i < 6; i++) {
    const s = snapshot(ns);
    out.after.push(s);
    ns.tprint(
      `--- AFTER +${i}: factionRep ${s.factionRep.toFixed(3)} | respect ${s.respect.toFixed(2)} | rate ${s.respectGainRate.toFixed(5)}`
    );
    if (i < 5) await ns.gang.nextUpdate();
  }

  const repDelta = out.after[0].factionRep - out.before.factionRep;
  const respectDelta = out.after[0].respect - out.before.respect;
  out.verdict = {
    repDelta,
    respectDelta,
    interpretation:
      repDelta < -0.001
        ? "REP TRACKS TOTAL -- faction rep dropped on ascension. Tier 3 must be conservative."
        : "REP TRACKS RATE -- faction rep did not drop. Ascension is nearly free for our gate.",
  };
  ns.tprint(`=== VERDICT: ${out.verdict.interpretation}`);
  ns.tprint(`    repDelta ${repDelta.toFixed(4)} | respectDelta ${respectDelta.toFixed(2)}`);

  const path = `ascendrecon-${out.ts}.json`;
  ns.write(path, JSON.stringify(out, null, 2), "w");
  ns.tprint(`-> ${path}`);
}
