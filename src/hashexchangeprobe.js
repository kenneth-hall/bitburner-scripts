/**
 * hashexchangeprobe.js -- close Q1 (phase-43-bn9-opening.features.md).
 *
 * Buys exactly ONE "Exchange for Bladeburner Rank" and ONE "Exchange for
 * Bladeburner SP" and measures what each actually grants, against a drift
 * baseline. This is a TEST PURCHASE, not a read-only probe: it spends 500
 * hashes (about $125m of foregone auto-sale at the measured $250,000/hash).
 *
 * Bladeburner rank moves in discrete jumps on action settlement, so the run
 * samples three times before and three times after each spend. If a settle
 * lands inside a spend window the drift columns make it visible instead of
 * silently inflating the result.
 *
 * ASCII-only on purpose: brand-new src/ files are seeded via in-game wget
 * (docs/dev-server.md), which mangles UTF-8 punctuation into a parse error.
 *
 * Writes hashexchangeprobe-<epoch>.json.
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const out = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "Q1: rank and SP granted per Exchange for Bladeburner purchase",
    testPurchase: true,
    samples: {},
    spends: [],
  };

  const flush = (stage) => {
    out.stage = stage;
    try {
      ns.write("hashexchangeprobe-" + out.ts + ".json", JSON.stringify(out, null, 2), "w");
    } catch (err) {
      ns.tprint("hashexchangeprobe: WRITE FAILED at " + stage + ": " + String(err));
    }
  };

  if (!ns.bladeburner.inBladeburner()) {
    out.abort = "not in the Bladeburner division";
    flush("abort");
    ns.tprint("hashexchangeprobe: ABORT - not in the Bladeburner division");
    return;
  }

  const read = () => ({
    t: Date.now(),
    rank: ns.bladeburner.getRank(),
    sp: ns.bladeburner.getSkillPoints(),
    hashes: ns.hacknet.numHashes(),
    money: ns.getPlayer().money,
  });

  // Three samples 400ms apart establish the passive drift rate for rank and SP,
  // so the spend delta can be reported net of the grind that runs alongside it.
  const series = async (label, n) => {
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      rows.push(read());
      if (i < n - 1) await ns.sleep(400);
    }
    out.samples[label] = rows;
    return rows;
  };

  const driftRates = (rows) => {
    const f = rows[0];
    const l = rows[rows.length - 1];
    const dt = (l.t - f.t) / 1000;
    return dt > 0 ? { rankPerSec: (l.rank - f.rank) / dt, spPerSec: (l.sp - f.sp) / dt, sec: dt } : null;
  };

  const baseline = await series("baseline", 3);
  out.driftBaseline = driftRates(baseline);

  const UPGRADES = ["Exchange for Bladeburner Rank", "Exchange for Bladeburner SP"];

  for (const name of UPGRADES) {
    const rec = { upgrade: name };
    try {
      rec.levelBefore = ns.hacknet.getHashUpgradeLevel(name);
      rec.hashCost = ns.hacknet.hashCost(name);
    } catch (err) {
      rec.costError = String(err).slice(0, 200);
    }

    const before = read();
    rec.before = before;

    if (before.hashes < rec.hashCost) {
      rec.result = "SKIPPED - only " + before.hashes.toFixed(0) + " hashes, need " + rec.hashCost;
      out.spends.push(rec);
      continue;
    }

    rec.spendHashesReturned = ns.hacknet.spendHashes(name);
    // Verify against a re-read rather than trusting the boolean: CLAUDE.md's
    // "verify, don't trust the return value" rule.
    const after = read();
    rec.after = after;
    rec.levelAfter = ns.hacknet.getHashUpgradeLevel(name);
    rec.purchaseConfirmed = rec.levelAfter === rec.levelBefore + 1;

    const elapsedSec = (after.t - before.t) / 1000;
    const drift = out.driftBaseline;
    rec.elapsedSec = elapsedSec;
    rec.rawRankDelta = after.rank - before.rank;
    rec.rawSpDelta = after.sp - before.sp;
    rec.hashesSpent = before.hashes - after.hashes;
    rec.netRankDelta = drift ? rec.rawRankDelta - drift.rankPerSec * elapsedSec : null;
    rec.netSpDelta = drift ? rec.rawSpDelta - drift.spPerSec * elapsedSec : null;
    rec.result = rec.purchaseConfirmed ? "ok" : "MISMATCH - upgrade level did not advance";

    out.spends.push(rec);
    flush("spend-" + name);
    await ns.sleep(1500);
  }

  const settle = await series("settle", 3);
  out.driftAfter = driftRates(settle);
  out.nextCosts = {};
  for (const name of UPGRADES) {
    try {
      out.nextCosts[name] = ns.hacknet.hashCost(name);
    } catch (err) {
      out.nextCosts[name] = String(err).slice(0, 120);
    }
  }
  flush("done");

  ns.tprint("hashexchangeprobe: baseline drift " +
    (out.driftBaseline ? out.driftBaseline.rankPerSec.toFixed(4) + " rank/s, " + out.driftBaseline.spPerSec.toFixed(4) + " sp/s" : "n/a"));
  for (const rec of out.spends) {
    ns.tprint("  " + rec.upgrade);
    ns.tprint("    cost " + String(rec.hashCost) + " hashes | spent " + (rec.hashesSpent ?? "-") +
      " | level " + rec.levelBefore + " -> " + (rec.levelAfter ?? "-") + " [" + rec.result + "]");
    ns.tprint("    rank " + (rec.rawRankDelta != null ? rec.rawRankDelta.toFixed(2) : "-") +
      " raw / " + (rec.netRankDelta != null ? rec.netRankDelta.toFixed(2) : "-") + " net" +
      " | SP " + (rec.rawSpDelta != null ? rec.rawSpDelta.toFixed(2) : "-") +
      " raw / " + (rec.netSpDelta != null ? rec.netSpDelta.toFixed(2) : "-") + " net");
  }
  ns.tprint("  next costs: " + JSON.stringify(out.nextCosts));
  ns.tprint("  -> hashexchangeprobe-" + out.ts + ".json");
}
