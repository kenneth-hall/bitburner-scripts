/**
 * recoverbn.js - one-shot BitNode clear, built for the 2026-09-18 save recovery.
 *
 * WHY THIS EXISTS. destroybn.js cannot be used here: it refuses to fire unless
 * getNextBlackOp() reads null, i.e. all 21 black ops are complete. The recovery
 * save reaches the same game call by the OTHER documented route --
 *   "the special augment installed and the required hacking level
 *    OR Completed the final black op."
 * The recovery save carries The Red Pill and hacking 6338 (gate 6000), so the
 * hacking route is satisfied and the game performs its own correct prestige.
 * Letting the game do the reset is the entire point: a prestige touches servers,
 * factions, augmentations, programs and skills at once, and hand-synthesizing
 * that is how a save gets subtly broken.
 *
 * !! IRREVERSIBLE. Ends the current BitNode. Money, augmentations, skills,
 * factions and the fleet are wiped. Source-Files, home scripts and Intelligence
 * survive -- that is the whole point of the recovery.
 *
 * nextBN is MANDATORY in this build (see destroybn.js's measured note).
 *
 * usage: run recoverbn.js <1-15> confirm
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

/** @param {NS} ns */
export async function main(ns) {
  const confirmed = ns.args.includes("confirm");
  const nextBN = ns.args.map(Number).find((n) => Number.isInteger(n) && n >= 1 && n <= 15);

  const info = ns.getPlayer();
  const node = ns.getResetInfo().currentNode;
  ns.tprint("recoverbn: node BN" + node + " | hacking " + info.skills.hacking + " (gate 6000)");

  // diag: the call no-opped silently on 2026-09-18 with both documented preconditions
  // apparently met, so read the actual state rather than trusting the doc.
  if (ns.args.includes("diag")) {
    const wd = ns.getServer("w0r1d_d43m0n");
    const augs = ns.singularity.getOwnedAugmentations(false);
    ns.tprint("  hackingLevel        : " + ns.getHackingLevel());
    ns.tprint("  wd.requiredHacking  : " + wd.requiredHackingSkill);
    ns.tprint("  wd.hasAdminRights   : " + wd.hasAdminRights);
    ns.tprint("  wd.backdoorInstalled: " + wd.backdoorInstalled);
    ns.tprint("  wd.openPortCount    : " + wd.openPortCount + " / needs " + wd.numOpenPortsRequired);
    ns.tprint("  hasTheRedPill       : " + augs.includes("The Red Pill"));
    ns.tprint("  ownedAugs count     : " + augs.length);
    ns.tprint("  inBladeburner       : " + ns.bladeburner.inBladeburner());
    return;
  }

  if (nextBN === undefined) {
    ns.tprint("recoverbn: ABORT - destination node is required and is never defaulted.");
    ns.tprint("recoverbn: usage - run recoverbn.js <1-15> confirm");
    return;
  }
  if (!confirmed) {
    ns.tprint("recoverbn: DRY RUN - nothing destroyed. Would clear BN" + node + " and jump to BN" + nextBN + ".");
    ns.tprint("recoverbn: re-run with the 'confirm' argument to fire.");
    return;
  }

  ns.tprint("recoverbn: DESTROYING w0r1d_d43m0n. Next node: BN" + nextBN + ".");
  ns.singularity.destroyW0r1dD43m0n(nextBN);
}
