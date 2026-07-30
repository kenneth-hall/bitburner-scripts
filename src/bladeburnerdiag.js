/**
 * bladeburnerdiag.js - throwaway read-only check: is bladeburnertrial.js actually progressing,
 * or hung? Reads rank/current-action/action-elapsed-time without touching trial state.
 */
export async function main(ns) {
  const rank = ns.bladeburner.getRank();
  const action = ns.bladeburner.getCurrentAction();
  const elapsed = ns.bladeburner.getActionCurrentTime();
  const sp = ns.bladeburner.getSkillPoints();
  const raidChance = ns.bladeburner.getActionEstimatedSuccessChance("Operations", "Raid");
  ns.tprint("bladeburnerdiag: rank=" + rank + " action=" + JSON.stringify(action) + " elapsedMs=" + elapsed +
    " skillPoints=" + sp + " raidChance=" + JSON.stringify(raidChance));
}
