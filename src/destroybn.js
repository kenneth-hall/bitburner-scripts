/**
 * destroybn.js - destroy w0r1d_d43m0n and land on the BitVerse screen.
 *
 * 🔴 IRREVERSIBLE. This ENDS THE CURRENT BITNODE. Rank, skill points, money,
 * augmentations, the fleet and every faction membership are wiped. What survives is
 * Source-Files, scripts on home, and Intelligence.
 *
 * WHY IT EXISTS (2026-08-16). Completing the final black op does NOT auto-destroy the
 * node -- that was assumed and is wrong. `Operation Daedalus` completed, `getNextBlackOp()`
 * returned `null`, the BlackOps tab rendered empty, and the game carried on normally with
 * the engine still grinding rank. The actual trigger is this Singularity call. Per
 * `markdown/bitburner.singularity.destroyw0r1dd43m0n.md`:
 *
 *   "You must have the special augment installed and the required hacking level
 *    OR Completed the final black op."
 *
 * So the Bladeburner route ends here, not at the last op.
 *
 * 🔴 BUILD DIVERGENCE, measured live 2026-08-16 -- `nextBN` is MANDATORY here.
 * `markdown/bitburner.singularity.destroyw0r1dd43m0n.md` documents it as OPTIONAL and says
 * "Passing undefined leaves you on the BitVerse screen." That is false in this fork:
 * omitting it throws
 *   TYPE ERROR - singularity.destroyW0r1dD43m0n: 'nextBN' must be a number. Is undefined.
 * So there is NO "land on the BitVerse and decide later" option -- the destination must be
 * chosen at the call site. This script therefore REQUIRES an explicit node number and will
 * not guess one; the next-node choice carries its own standing warnings
 * (docs/bitnodes.md's 2026-08-16 re-derivation) and must never be a silent default.
 *
 * ⚠️ Sibling to CLAUDE.md's "this build is not vanilla" rule, and worse than it: here even
 * the BUNDLED markdown/ docs were wrong, not just the online ones. Optionality in a
 * signature is not a guarantee -- verify by calling.
 *
 * PRECONDITION CHECK, not a trust exercise: refuses to fire unless `getNextBlackOp()`
 * reads `null`. The whole point is that "the last op completed" and "the node is
 * destroyable" turned out to be different states, so this verifies the one that matters
 * rather than assuming the other implies it.
 *
 * RAM: 32 GB * 1 (SF4.3 discount) for destroyW0r1dD43m0n, + 2 GB getNextBlackOp.
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const confirmed = ns.args.includes("confirm");
  const nextBN = ns.args.map(Number).find((n) => Number.isInteger(n) && n >= 1 && n <= 15);

  if (!ns.bladeburner.inBladeburner()) {
    ns.tprint("destroybn: ABORT - not in the Bladeburner division; cannot verify the black-op route.");
    return;
  }

  const pending = ns.bladeburner.getNextBlackOp();
  if (pending !== null) {
    ns.tprint("destroybn: ABORT - black ops remain. getNextBlackOp() reads '" +
      pending.name + "' (rank " + pending.rank + "). Finish the ladder first.");
    return;
  }

  const rankNow = ns.bladeburner.getRank();
  ns.tprint("destroybn: precondition OK - getNextBlackOp() is null, all 21 black ops complete.");
  ns.tprint("destroybn: rank " + ns.format.number(rankNow) + " | node " + ns.getResetInfo().currentNode);

  if (nextBN === undefined) {
    ns.tprint("destroybn: ABORT - no destination node given, and 'nextBN' is MANDATORY in this build.");
    ns.tprint("destroybn: usage - run destroybn.js <1-15> confirm   (e.g. 'run destroybn.js 10 confirm')");
    return;
  }

  if (!confirmed) {
    ns.tprint("destroybn: DRY RUN - nothing destroyed. Would jump to BN" + nextBN + ".");
    ns.tprint("destroybn: re-run with the 'confirm' argument to fire.");
    return;
  }

  ns.tprint("destroybn: DESTROYING w0r1d_d43m0n. This ends the BitNode. Next node: BN" + nextBN + ".");
  ns.singularity.destroyW0r1dD43m0n(nextBN);
}
