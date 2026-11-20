/**
 * joinbladeburner.js - one-time: the combat-stat grind (combatgrind.js) is done
 * (all four combat stats measured at 172, gate is 100). This stops the now-pointless
 * unattended Mug crime (the grinder script died mid-run per its documented RAM-contention
 * risk, but the player action it started kept running with nothing left alive to call
 * stopAction() at the gate) and joins the Bladeburner division per
 * docs/bn6-playbook.md's "next action, no decision needed" step.
 *
 * Does NOT call joinBladeburnerFaction() -- that needs rank >= 25, which requires
 * being in the division first and running actions. That's the real Stage 2/3 work.
 *
 * Writes joinbladeburner-<epoch>.json (host-scoped: from a fleet host it stays there).
 *
 * `auto` arg (2026-11-20): the daemon's unattended path. Refuses below the
 * combat-100 gate and does NOT stopAction() -- if bladeburnermanager.js can't
 * fit yet, the running Mug keeps earning combat exp instead of the player
 * going idle; the manager's startAction replaces it once it launches.
 */

export async function main(ns) {
  const out = { ts: Date.now(), iso: new Date().toISOString() };

  const before = ns.getPlayer();
  out.combatBefore = {
    strength: before.skills.strength,
    defense: before.skills.defense,
    dexterity: before.skills.dexterity,
    agility: before.skills.agility,
  };
  out.currentWorkBefore = ns.singularity.getCurrentWork();

  const auto = ns.args[0] === "auto";
  if (auto && Math.min(...Object.values(out.combatBefore)) < 100) {
    ns.tprint("joinbladeburner: auto -- combat gate (100) not met, nothing done");
    return;
  }
  if (!auto) ns.singularity.stopAction();

  out.joined = ns.bladeburner.joinBladeburnerDivision();
  out.inBladeburnerAfter = ns.bladeburner.inBladeburner();

  ns.write("joinbladeburner-" + out.ts + ".json", JSON.stringify(out, null, 2), "w");
  ns.tprint("joinbladeburner: joined=" + out.joined + " inBladeburner=" + out.inBladeburnerAfter);
}
