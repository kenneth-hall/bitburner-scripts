// One-shot Singularity liveness check (Phase 21). Confirms the player
// owns Source-File 4 at the level-3 gate (via `ownedSF`) and that a real
// ns.singularity.* call succeeds -- corroborating the SF4-level RAM
// discount is genuinely in effect, not just that the map entry exists.
//
// Standing rule: manual one-shot only, run directly from the terminal.
// NEVER exec'd from daemon.js or any hot-path module -- Singularity calls
// carry a heavy RAM multiplier and must stay isolated from the batcher's
// footprint. Kept after Phase 21 ships -- it's the generic "what SFs do I
// own / is Singularity alive" checker for every future reset.
/** @param {NS} ns */
export async function main(ns) {
  const ownedSF = [...ns.getResetInfo().ownedSF];
  const hackingLevel = ns.getHackingLevel();

  let singularityProbe = null;
  let singularityError = null;
  try {
    singularityProbe = ns.singularity.getOwnedAugmentations().length;
  } catch (err) {
    singularityError = String(err);
  }

  const result = {
    timestamp: Date.now(),
    ownedSF,
    singularityProbe,
    singularityError,
    hackingLevel,
  };

  const file = `sf4check-${result.timestamp}.json`;
  ns.write(file, JSON.stringify(result, null, 2), "w");

  if (singularityError) {
    ns.tprint(`SF4 CHECK: ownedSF=${JSON.stringify(ownedSF)}  singularity call THREW: ${singularityError}`);
  } else {
    ns.tprint(
      `SF4 CHECK: ownedSF=${JSON.stringify(ownedSF)}  singularityProbe=${singularityProbe} augs  hacking=${hackingLevel}`,
    );
  }
  ns.tprint(`  full result -> logs/${file}`);
}
