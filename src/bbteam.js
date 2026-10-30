/**
 * bbteam.js [minutes=30] - recruit Bladeburner team members, then measure what a team
 * does to the next black op's estimated success.
 *
 * Mutating: takes the player-action slot (Recruitment) and idles bladeburnermanager via
 * bladeburner-off.txt for the duration; both are released in finally + atExit. Do not
 * run alongside bbblackop.js.
 *
 * The measurement is a same-instant A/B: setTeamSize(op, 0) -> read estimate, then
 * setTeamSize(op, all) -> read estimate. Nothing else moves between the two reads.
 * Writes bbteam-<epoch>.json. ASCII-only.
 */
const BB_OFF_MARKER = "bladeburner-off.txt";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const bb = ns.bladeburner;
  const minutes = Number(ns.args[0] ?? 30);
  const ts = Date.now();
  const file = `bbteam-${ts}.json`;
  const out = { ts, minutes, teamBefore: bb.getTeamSize(), recruits: [] };
  const save = () => ns.write(file, JSON.stringify(out, null, 2), "w");
  const release = () => { try { bb.stopBladeburnerAction(); ns.rm(BB_OFF_MARKER, "home"); } catch { /* dying */ } };
  ns.atExit(release);

  try {
    ns.write(BB_OFF_MARKER, "bbteam.js recruiting", "w");
    out.recruitTimeMs = bb.getActionTime("General", "Recruitment");
    out.recruitChance = bb.getActionEstimatedSuccessChance("General", "Recruitment");
    bb.stopBladeburnerAction();
    bb.startAction("General", "Recruitment");
    const end = ts + minutes * 60_000;
    let last = out.teamBefore;
    while (Date.now() < end) {
      await ns.sleep(5_000);
      const cur = bb.getCurrentAction();
      if (!cur || cur.name !== "Recruitment") bb.startAction("General", "Recruitment");
      const size = bb.getTeamSize();
      if (size !== last) { out.recruits.push({ t: Date.now(), size }); last = size; save(); }
    }
    bb.stopBladeburnerAction();
    out.teamAfter = bb.getTeamSize();

    const next = bb.getNextBlackOp();
    if (next) {
      bb.setTeamSize("Black Operations", next.name, 0);
      out.op = next.name;
      out.chanceTeam0 = bb.getActionEstimatedSuccessChance("Black Operations", next.name);
      out.setTo = bb.setTeamSize("Black Operations", next.name, out.teamAfter);
      out.chanceTeamN = bb.getActionEstimatedSuccessChance("Black Operations", next.name);
    }
    save();
    ns.tprint(`bbteam: team ${out.teamBefore} -> ${out.teamAfter} | ${out.op}: ` +
      `team0 ${JSON.stringify(out.chanceTeam0)} vs team${out.setTo} ${JSON.stringify(out.chanceTeamN)} -> ${file}`);
  } finally {
    release();
  }
}
