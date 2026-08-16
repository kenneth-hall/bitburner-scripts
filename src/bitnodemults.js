/**
 * bitnodemults.js - exact BitNode multipliers for ANY node, at ANY Source-File level.
 *
 * WHY THIS EXISTS (2026-08-16). Every per-node multiplier table in docs/bitnodes.md is a
 * HAND-READ TRANSCRIPTION off the BitVerse selection panel, captured one node at a time.
 * Those tables now carry real decisions -- the 2026-08-16 node-order re-derivation scores
 * every node on `redo-tax = (1 / BladeburnerRank) * BladeburnerSkillCost`, computed
 * straight off them. A transcription error would silently move the whole order.
 *
 * `ns.getBitNodeMultipliers(n?, lvl?)` takes BOTH a node number and a level, so it is a
 * pure/hypothetical query: it returns the exact table for a node we have never visited,
 * at a Source-File level we do not hold. That makes it the authoritative check on all 15
 * tables at once, and the only way to answer questions like BN12's undocumented ramp law
 * without clearing BN12 repeatedly.
 *
 * Requires SF5 (held: SF5.1) or being in BN5. Returns DECIMALS (1.5, not 150%).
 *
 * Usage:
 *   run bitnodemults.js            -> current node + all 15 at level 1, + the redo-tax table
 *   run bitnodemults.js sweep 12   -> BN12 across levels 1..12 (derives the recursion ramp)
 *   run bitnodemults.js sweep 12 20-> same, levels 1..20
 *
 * RAM: 4 GB (getBitNodeMultipliers) + change. Deliberately tiny -- it must be runnable on a
 * fresh, RAM-saturated home, which is exactly when a node's table is most worth checking.
 *
 * Read-only: queries multipliers, mutates nothing.
 *
 * ASCII-only (docs/dev-server.md's wget-seeding caveat).
 */

const NODE_COUNT = 15;

// The fields that actually drive decisions. Everything else is still dumped to the JSON;
// this list only controls the terminal summary and the derived table.
const KEY_FIELDS = [
  "HackingLevelMultiplier",
  "BladeburnerRank",
  "BladeburnerSkillCost",
  "ServerMaxMoney",
  "ScriptHackMoney",
  "AugmentationMoneyCost",
  "AugmentationRepCost",
  "WorldDaemonDifficulty",
  "DaedalusAugsRequirement",
  "CloudServerSoftcap",
  "HacknetNodeMoney",
];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const outRec = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "exact BitNode multipliers via ns.getBitNodeMultipliers(n, lvl)",
  };

  const flush = (label) => {
    outRec.stage = label;
    try {
      ns.write("bitnodemults-" + outRec.ts + ".json", JSON.stringify(outRec, null, 2), "w");
    } catch (err) {
      ns.tprint("bitnodemults: WRITE FAILED at " + label + ": " + String(err));
    }
  };

  // Flattened through a plain copy -- the raw return may not be JSON-safe (the same trap
  // bladeburnerprobe.js hit).
  const plain = (obj) => {
    const copy = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") copy[k] = v;
    }
    return copy;
  };

  const reset = ns.getResetInfo();
  outRec.currentNode = reset.currentNode;
  // 🔴 `ownedSF` is a **Map**, and JSON.stringify(Map) is `{}` -- silently, with no error.
  // The first run of this script reported `ownedSF {}` while the Augmentations page showed
  // five Source-Files, and getBitNodeMultipliers (which REQUIRES SF5) was working fine.
  // bladeburnerprobe.js already had this right; copying the pattern rather than the bug.
  // 📌 An empty object from a serialiser is not evidence of an empty collection.
  outRec.ownedSF = reset.ownedSF ? Object.fromEntries(reset.ownedSF) : undefined;

  // ---- matrix mode: EVERY node x EVERY level, plus a probe past the known max --
  // Added 2026-08-16 after the first pass only queried each node at level 1. If any node
  // other than BN12 varies its multipliers by Source-File level, a level-1-only sweep
  // silently misses it -- and BN12 proves at least one node does.
  if (ns.args[0] === "matrix") {
    const maxNode = Number(ns.args[1]) > 0 ? Number(ns.args[1]) : 20; // probe past 15 deliberately
    const maxLvl = Number(ns.args[2]) > 0 ? Number(ns.args[2]) : 5;
    outRec.mode = "matrix";
    outRec.matrix = {};
    outRec.nodesThatExist = [];
    outRec.variesByLevel = {};
    for (let n = 1; n <= maxNode; n++) {
      const perLevel = {};
      let ok = false;
      for (let lvl = 1; lvl <= maxLvl; lvl++) {
        try {
          perLevel[lvl] = plain(ns.getBitNodeMultipliers(n, lvl));
          ok = true;
        } catch (err) {
          perLevel[lvl] = { error: String(err).slice(0, 160) };
        }
        await ns.sleep(3);
      }
      if (ok) outRec.nodesThatExist.push(n);
      outRec.matrix[n] = perLevel;
      // Which fields actually move between level 1 and maxLvl?
      const a = perLevel[1], b = perLevel[maxLvl];
      if (a && b && !a.error && !b.error) {
        const moved = Object.keys(a).filter((k) => a[k] !== b[k]);
        if (moved.length) outRec.variesByLevel[n] = moved;
      }
    }
    flush("matrix");
    ns.tprint("bitnodemults: MATRIX nodes 1-" + maxNode + " x levels 1-" + maxLvl);
    ns.tprint("  nodes that exist: " + JSON.stringify(outRec.nodesThatExist));
    const varying = Object.keys(outRec.variesByLevel);
    ns.tprint("  nodes whose multipliers VARY by SF level: " + (varying.length ? JSON.stringify(varying) : "NONE besides none"));
    for (const n of varying) {
      ns.tprint("    BN" + n + ": " + outRec.variesByLevel[n].length + " fields move (" +
        outRec.variesByLevel[n].slice(0, 6).join(", ") + (outRec.variesByLevel[n].length > 6 ? ", ..." : "") + ")");
    }
    ns.tprint("  -> bitnodemults-" + outRec.ts + ".json");
    return;
  }

  // ---- sweep mode: one node across Source-File levels -------------------------
  if (ns.args[0] === "sweep") {
    const nodeNum = Number(ns.args[1]);
    const maxLvl = Number(ns.args[2]) > 0 ? Number(ns.args[2]) : 12;
    if (!Number.isInteger(nodeNum) || nodeNum < 1 || nodeNum > NODE_COUNT) {
      ns.tprint("bitnodemults: ABORT - sweep needs a node 1-" + NODE_COUNT);
      return;
    }
    outRec.mode = "sweep";
    outRec.sweepNode = nodeNum;
    outRec.levels = {};
    for (let lvl = 1; lvl <= maxLvl; lvl++) {
      try {
        outRec.levels[lvl] = plain(ns.getBitNodeMultipliers(nodeNum, lvl));
      } catch (err) {
        outRec.levels[lvl] = { error: String(err).slice(0, 200) };
        break;
      }
    }
    flush("sweep");
    ns.tprint("bitnodemults: BN" + nodeNum + " sweep, levels 1-" + maxLvl);
    for (const f of ["HackingLevelMultiplier", "BladeburnerRank", "BladeburnerSkillCost", "WorldDaemonDifficulty"]) {
      const row = [];
      for (let lvl = 1; lvl <= maxLvl; lvl++) {
        const m = outRec.levels[lvl];
        if (m && typeof m[f] === "number") row.push("L" + lvl + "=" + m[f].toFixed(4));
      }
      if (row.length) ns.tprint("  " + f + ": " + row.join(" "));
    }
    ns.tprint("  -> bitnodemults-" + outRec.ts + ".json");
    return;
  }

  // ---- default: current node, then all 15 at level 1 --------------------------
  try {
    outRec.current = plain(ns.getBitNodeMultipliers());
  } catch (err) {
    outRec.currentError = String(err).slice(0, 300);
    flush("abort");
    ns.tprint("bitnodemults: ABORT - getBitNodeMultipliers threw (needs SF5): " + outRec.currentError);
    return;
  }
  flush("current");

  outRec.allNodes = {};
  for (let n = 1; n <= NODE_COUNT; n++) {
    try {
      outRec.allNodes[n] = plain(ns.getBitNodeMultipliers(n, 1));
    } catch (err) {
      outRec.allNodes[n] = { error: String(err).slice(0, 200) };
    }
    await ns.sleep(5);
  }

  // Derived: the metric the node order is scored on. Computing it here rather than by hand
  // is the entire point -- a hand-transcribed table is what this script exists to check.
  outRec.redoTax = {};
  for (let n = 1; n <= NODE_COUNT; n++) {
    const m = outRec.allNodes[n];
    if (!m || typeof m.BladeburnerRank !== "number") continue;
    const rank = m.BladeburnerRank;
    const cost = typeof m.BladeburnerSkillCost === "number" ? m.BladeburnerSkillCost : 1;
    outRec.redoTax[n] = rank === 0 ? null : (1 / rank) * cost;
  }
  flush("done");

  ns.tprint("bitnodemults: current node BN" + outRec.currentNode + " | ownedSF " + JSON.stringify(outRec.ownedSF));
  ns.tprint("  --- current node key fields ---");
  for (const f of KEY_FIELDS) {
    if (typeof outRec.current[f] === "number") ns.tprint("    " + f + ": " + outRec.current[f]);
  }
  ns.tprint("  --- redo-tax by node (1/BladeburnerRank * BladeburnerSkillCost) ---");
  const ranked = Object.keys(outRec.redoTax)
    .filter((n) => outRec.redoTax[n] !== null)
    .sort((a, b) => outRec.redoTax[a] - outRec.redoTax[b]);
  for (const n of ranked) {
    const m = outRec.allNodes[n];
    ns.tprint("    BN" + n + ": " + outRec.redoTax[n].toFixed(3) + "x" +
      "  (rank " + m.BladeburnerRank + " / skillCost " + (m.BladeburnerSkillCost ?? 1) + ")");
  }
  ns.tprint("  -> bitnodemults-" + outRec.ts + ".json");
}

