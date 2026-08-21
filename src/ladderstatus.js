/**
 * ladderstatus.js -- what are we actually grinding towards, read LIVE, in whatever node we are in.
 *
 * WHY. The number "rank 400,000" is a HARDCODED CONSTANT in two places (goallog.js's RANK_TARGET
 * and bladeburnermanager.js's BLACKOPS_DAEDALUS_RANK). It was written during BN6 and has never
 * been verified against the live game in BN10. CLAUDE.md's own durable lesson from BN6 is that a
 * PROGRESS TARGET IS NOT A WIN CONDITION: the engine there read "on track" for weeks while it had
 * no black-op stage at all and would have ground Tracking forever. The remedy recorded was
 * "re-derive the goal periodically; don't trust the proxy". This script is that re-derivation,
 * and it takes every number from the game rather than from a constant.
 *
 * The real win condition is completing all 21 black ops IN ORDER, ending at Operation Daedalus.
 * Rank is only the gating requirement on each one, so what matters is not "rank vs 400,000" but
 * "which op is next, what does IT need, and can we clear it".
 *
 * Reports: current rank, how many ops are done, the next op and its requirement, and the full
 * ladder with each op's rank requirement, whether rank already satisfies it, and the estimated
 * success range. Ops we can already afford by RANK are flagged -- the ladder pays rank rewards,
 * so an op cleared early is rank we do not have to grind.
 *
 * READ-ONLY. Starts nothing, spends nothing, does not touch the player-action slot, so it is
 * safe to run alongside bladeburnermanager.js.
 *
 * RAM: ~10 GB (getRank 4 + getNextBlackOp 2 + getBlackOpRank 2 + getBlackOpNames 0 +
 * getActionEstimatedSuccessChance 4, shared).
 *
 * ASCII-only (docs/dev-server.md -- new files are seeded by in-game wget, which mangles
 * non-ASCII punctuation into a parse error).
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  if (!ns.bladeburner.inBladeburner()) {
    ns.tprint("ladderstatus: ABORT -- not in the Bladeburner division");
    return;
  }

  const rank = ns.bladeburner.getRank();
  const names = ns.bladeburner.getBlackOpNames();
  const next = ns.bladeburner.getNextBlackOp();

  const rec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    bitNode: ns.getResetInfo().currentNode,
    rank,
    nextBlackOp: next,
    totalOps: names.length,
    ops: [],
  };

  // getBlackOpNames is NOT documented as rank-sorted, so sort by requirement ourselves rather
  // than trusting array order -- the ladder must be walked in rank order.
  const table = names.map((name) => ({ name, rankReq: ns.bladeburner.getBlackOpRank(name) }));
  table.sort((a, b) => a.rankReq - b.rankReq);

  const nextName = next && typeof next === "object" ? next.name : next;
  let doneCount = 0;
  let reachedNext = false;
  for (const row of table) {
    if (row.name === nextName) reachedNext = true;
    // Everything ordered before the next op has been completed.
    const done = !reachedNext && nextName !== null && nextName !== undefined;
    if (done) doneCount++;
    let chance = null;
    try {
      chance = ns.bladeburner.getActionEstimatedSuccessChance("Black Operations", row.name);
    } catch {
      chance = null;
    }
    rec.ops.push({
      name: row.name,
      rankReq: row.rankReq,
      done,
      rankSatisfied: rank >= row.rankReq,
      isNext: row.name === nextName,
      chance,
    });
  }
  rec.doneCount = doneCount;
  rec.remaining = table.length - doneCount;
  rec.finalOp = table[table.length - 1];
  rec.rankSatisfiedNotDone = rec.ops.filter((o) => !o.done && o.rankSatisfied).length;

  ns.write("ladderstatus-" + rec.ts + ".json", JSON.stringify(rec, null, 2), "w");

  ns.tprint("ladderstatus: BN" + rec.bitNode + " | rank " + ns.format.number(rank) +
    " | ops done " + doneCount + "/" + table.length);
  ns.tprint("  next: " + (nextName ?? "(none -- ladder complete)") +
    (next && next.rank !== undefined ? " (needs rank " + ns.format.number(next.rank) + ")" : ""));
  ns.tprint("  FINAL op is " + rec.finalOp.name + ", needing rank " + ns.format.number(rec.finalOp.rankReq) +
    "  <- this is the real gate, read live");
  ns.tprint("  ops whose RANK requirement is already satisfied but not yet done: " + rec.rankSatisfiedNotDone);
  ns.tprint("  ladder:");
  for (const o of rec.ops) {
    const mark = o.done ? "DONE" : o.isNext ? "NEXT" : o.rankSatisfied ? "rank-ok" : "locked";
    const ch = o.chance ? " p[" + o.chance[0].toFixed(4) + ", " + o.chance[1].toFixed(4) + "]" : "";
    ns.tprint("    " + mark.padEnd(8) + o.name.padEnd(30) + " rank " + ns.format.number(o.rankReq) + ch);
  }
  ns.tprint("  -> ladderstatus-" + rec.ts + ".json");
}
