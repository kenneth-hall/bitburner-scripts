/**
 * Phase 29 -- gang manager, Tiers 1-3: recruit + task ladder + equipment +
 * ascension. Territory (Tier 4) stays OUT OF SCOPE -- `setTerritoryWarfare`
 * must never appear below this comment (grep-checked by the acceptance
 * criteria).
 *
 * Recruiting is one-way: there is no `removeMember`/`fireMember` in the gang
 * API, only `renameMember`. Every `recruitMember` call below is permanent.
 *
 * `setMemberTask` silently sets "Unassigned" (idle) on an invalid task name
 * instead of throwing -- startup validation (every ladder/sink/equipment
 * name checked against `getTaskNames()`/`getEquipmentCost`) exists
 * specifically to fail loud instead of idling the whole gang silently
 * forever.
 *
 * The task ladder is now Formulas-driven (`evalLadderMove` replaces Phase
 * 27's empirical probe-and-compare `evalPromotion`, deleted this phase --
 * see phase-29-gang-scaling.spec.md, Prominent flag 1). Formulas.exe does
 * NOT survive an install: the ladder mover suspends (freezes rungs, keeps
 * observing) whenever `formulasAvailable` is false rather than crashing or
 * guessing (Prominent flag 3). Ascension previews and equipment logic are
 * plain `ns.gang` calls and keep running regardless.
 *
 * `gang-off.txt` on home suppresses ALL actions (recruit + task moves +
 * ascension + equipment) while the loop keeps observing/logging --
 * Kenneth's manual-control lever and the sanctioned way to hand-drive
 * members without fighting this script.
 *
 * One import: `recordTransaction` from `translog.js` (its entire `ns`
 * surface is `read`/`write`, both 0 GB -- import-bleed charges nothing). No
 * other imports (import-bleed rule) -- local few-line helpers instead.
 * Predicted RAM ~24.8 GB (see phase-29-gang-scaling.spec.md S6);
 * measured-on-ship RAM belongs in logs/ramcheck-result.json, not restated
 * here.
 *
 * Run: launched automatically by daemon.js's companion block.
 */

import { recordTransaction } from "./translog.js";

// Respect-ordered, 8 rungs, sink as rung 0 (S1). Strictly ordered by
// baseRespect, which is also strictly ordered by baseWanted -- every
// promotion is more respect for more heat, exactly the trade evalLadderMove
// prices. "Ethical Hacking" at rung 0 makes standing sink capacity emerge
// from the existing rung machinery: a heat-demoted member lands on the sink
// with no new concept needed. Excluded, with reasons: Fraud & Counterfeiting
// (dominated by DDoS -- less respect, more wanted, more difficulty),
// Vigilante Justice (dominated by Ethical Hacking), Train */Territory
// Warfare/Unassigned (zero respect). See phase-29-gang-scaling.spec.md S1.
export const TASK_LADDER = ["Ethical Hacking", "Ransomware", "Phishing", "Identity Theft", "DDoS Attacks", "Plant Virus", "Money Laundering", "Cyberterrorism"];
export const SINK_TASK = "Ethical Hacking"; // == TASK_LADDER[0]; the emergency watchdog and rung 0 deliberately share it
export const SINK_ENTER_DEVIATION = 0.02;
export const SINK_EXIT_DEVIATION = 0.005;

// Persisted-state schema version (S7). A mismatch (including the pre-Phase-29
// file, which has none) discards persisted rungs and rebuilds from live
// tasks -- rung indices are ladder-relative, and the ladder was just
// re-numbered (old rung 0 == Ransomware is new rung 1).
export const LADDER_VERSION = 2;

// A fresh recruit (or any member on an unknown/off-policy task) starts
// earning, not cooling -- shared by rebuildRungs' default and the live
// recruit block so the two call sites can't drift apart (S7 blocker 3).
export const FRESH_RECRUIT_RUNG = 1;

// Ladder-move cadence (S2) and cooldowns.
export const PLAN_TICKS = 5;
export const PROMOTE_COOLDOWN_TICKS = 300;

// Ascension policy (S3): ascend aggressively (rep tracks the respect *rate*,
// not the total -- ascension claws back nothing), staggered gang-wide so at
// most one member is regrowing at a time.
export const ASCEND_MIN_FACTOR = 1.5;
export const ASCEND_COOLDOWN_TICKS = 60;

// Equipment (S5): two classes, two policies. ROOTKITS is broad/early/
// ascension-disposable; MEMBER_AUGS is staged/breadth-first/rotation-only
// (survives ascension, which is the entire reason the tier exists).
// Hardcoded from logs/gangprobe-1784562548352.json -- S7's startup
// validation guards drift.
export const ROOTKITS = ["NUKE Rootkit", "Soulstealer Rootkit", "Hmap Node", "Demon Rootkit", "Jack the Ripper"];
export const MEMBER_AUGS = ["Neuralstimulator", "DataJack", "BitWire"]; // descending ln(mult)/$ -- each dollar buys the most multiplier first
export const ROOTKIT_MONEY_FLOOR = 1e9;
export const MEMBER_AUG_MONEY_FLOOR = 15e9;
export const BUY_TICKS = 10;

export const STATE_WRITE_TICKS = 10;
export const GANG_STATE_FILE = "gang-state.json";
export const GANG_LOG_FILE = "gang-log.json";
export const GANG_LOG_MAX_ENTRIES = 2000;
export const GANG_OFF_MARKER = "gang-off.txt";

/**
 * Pure. Deterministic recruit names `nite-01`, `nite-02`, … -- fills gaps
 * left by any future member loss, never spins on a collision (caller retries
 * next tick per S3). Non-scheme existing names (a manual rename) are simply
 * never matched, so they can't block a slot.
 * @param {string[]} existingNames
 */
export function nextRecruitName(existingNames) {
  const existing = new Set(existingNames);
  let i = 1;
  while (existing.has(`nite-${String(i).padStart(2, "0")}`)) i++;
  return `nite-${String(i).padStart(2, "0")}`;
}

/**
 * Pure. Startup rung rebuild (S7). Persisted rungs are honored only when
 * `persisted.version` matches `LADDER_VERSION`; a mismatch (including no
 * version at all -- the pre-Phase-29 file) discards them entirely, so every
 * member falls through to the task-match path. A member already on a known
 * ladder task keeps that rung; anyone else (fresh recruit, "Unassigned", or
 * any off-policy task) lands on `FRESH_RECRUIT_RUNG` -- a fresh recruit
 * should earn, not cool (S7 blocker 3).
 * @param {{name:string, task:string}[]} members
 * @param {{version:number|null, rungs:Record<string, number>}} persisted
 */
export function rebuildRungs(members, persisted = { version: null, rungs: {} }, ladder = TASK_LADDER) {
  const persistedRungs = persisted.version === LADDER_VERSION ? persisted.rungs ?? {} : {};
  const rungs = {};
  for (const m of members) {
    if (persistedRungs[m.name] !== undefined) {
      // Clamp: a persisted rung can outlive a shortened/renumbered ladder.
      rungs[m.name] = Math.min(persistedRungs[m.name], ladder.length - 1);
      continue;
    }
    const idx = ladder.indexOf(m.task);
    rungs[m.name] = idx !== -1 ? idx : FRESH_RECRUIT_RUNG;
  }
  return rungs;
}

/**
 * Pure (S2). One tick of the wanted-level watchdog: updates the baseline
 * whenever `wantedLevel` is AT OR BELOW the lowest ever seen, computes
 * deviation with a denominator floor, and applies enter/exit hysteresis
 * (0.02 in / 0.005 out) so a healthy series never flaps. Unchanged from
 * Phase 27 -- under S2 the steady state keeps `netWanted <= 0`, so this
 * watchdog is now a true last resort; its firing rate is a health metric,
 * not a duty cycle.
 * @param {{wantedLevel:number, wantedPenalty:number, baselineWantedLevel:number|undefined, baselinePenalty:number|undefined, sinkMode:boolean}} params
 */
export function evalSink({ wantedLevel, wantedPenalty, baselineWantedLevel, baselinePenalty, sinkMode }) {
  let nextBaselineWantedLevel = baselineWantedLevel;
  let nextBaselinePenalty = baselinePenalty;
  if (nextBaselineWantedLevel === undefined || wantedLevel <= nextBaselineWantedLevel) {
    nextBaselineWantedLevel = wantedLevel;
    nextBaselinePenalty = wantedPenalty;
  }

  const deviation = Math.abs(wantedPenalty - nextBaselinePenalty) / Math.max(Math.abs(nextBaselinePenalty), 1);

  let nextSinkMode = sinkMode;
  let event = null;
  if (!sinkMode && deviation >= SINK_ENTER_DEVIATION) {
    nextSinkMode = true;
    event = "sink-enter";
  } else if (sinkMode && deviation <= SINK_EXIT_DEVIATION) {
    nextSinkMode = false;
    event = "sink-exit";
  }

  return { sinkMode: nextSinkMode, baselineWantedLevel: nextBaselineWantedLevel, baselinePenalty: nextBaselinePenalty, deviation, event };
}

/**
 * Pure (S8/S7). Baseline captured on the manager's very first tick, or
 * restored from a persisted state file. When neither applies, captures the
 * current reading as baseline anyway -- self-healing, since evalSink's own
 * min-tracking lowers it toward the true floor -- but flags `rebaseline`
 * whenever the gang wasn't obviously fresh (wantedLevel already above the
 * game's floor of 1).
 * @param {{wantedLevel:number, wantedPenalty:number, persisted:{baselineWantedLevel:number,baselinePenalty:number}|null}} params
 */
export function initBaseline({ wantedLevel, wantedPenalty, persisted }) {
  if (persisted && persisted.baselineWantedLevel !== undefined && persisted.baselinePenalty !== undefined) {
    return { baselineWantedLevel: persisted.baselineWantedLevel, baselinePenalty: persisted.baselinePenalty, event: null };
  }
  const nonFresh = wantedLevel > 1;
  return { baselineWantedLevel: wantedLevel, baselinePenalty: wantedPenalty, event: nonFresh ? "rebaseline" : null };
}

/**
 * Pure (S2). Exact, Formulas-based ladder movement -- replaces Phase 27's
 * empirical probe. At most one op per call, priced in this order:
 *
 * 1. Suppressed (sink mode / off-marker / no Formulas) -> no op.
 * 2. Heat demote -- if `netWantedActual` > 0: demote the rung>=1 member with
 *    the lowest marginal respect-per-heat `(r(rung)-r(rung-1)) /
 *    max(w(rung)-w(rung-1), 1e-9)`. The 1e-9 floor is load-bearing: a
 *    clamped-to-zero (or negative) marginal wanted delta must rank that
 *    member LAST for demotion (demoting them frees no heat), not divide by
 *    zero. Sets that member's promote cooldown.
 * 3. Efficiency demote -- else if some member's `respectAtPrevRung >
 *    respectAtRung` (stats no longer carry the rung -- post-ascension /
 *    fresh recruit): demote whoever has the largest such gap. No cooldown.
 * 4. Promote -- else among members with `rung < top`, no active cooldown,
 *    `respectAtNextRung > respectAtRung`, and projected
 *    `netWantedActual - actualWantedGain + wantedAtNextRung <= 0`: promote
 *    the largest respect gain. The subtraction uses the member's ACTUAL
 *    current wantedLevelGain, not a Formulas prediction of their current
 *    rung -- otherwise model residual leaks into the safety margin.
 *
 * All respect/wanted-at-rung values are Formulas-computed by the caller
 * (this function only compares numbers -- it never touches `ns`).
 * @param {{
 *   suppressed: boolean,
 *   netWantedActual: number,
 *   members: {
 *     name: string, rung: number, top: number,
 *     actualWantedGain: number,
 *     respectAtRung: number, respectAtPrevRung: number|null, respectAtNextRung: number|null,
 *     wantedAtRung: number, wantedAtPrevRung: number|null, wantedAtNextRung: number|null,
 *     cooldownActive: boolean,
 *   }[]
 * }} params
 */
export function evalLadderMove({ suppressed, netWantedActual, members }) {
  if (suppressed) return { op: null };

  if (netWantedActual > 0) {
    const candidates = members.filter((m) => m.rung >= 1);
    if (candidates.length > 0) {
      let best = null;
      let bestRatio = Infinity;
      for (const m of candidates) {
        const deltaR = m.respectAtRung - m.respectAtPrevRung;
        const deltaW = m.wantedAtRung - m.wantedAtPrevRung;
        const ratio = deltaR / Math.max(deltaW, 1e-9);
        if (ratio < bestRatio) {
          bestRatio = ratio;
          best = m;
        }
      }
      return { op: "demote", name: best.name, rung: best.rung - 1, reason: "heat", netWanted: netWantedActual, setCooldown: true, projectedNetWanted: null };
    }
  }

  const ineff = members.filter((m) => m.rung >= 1 && m.respectAtPrevRung > m.respectAtRung);
  if (ineff.length > 0) {
    let best = ineff[0];
    let bestGain = best.respectAtPrevRung - best.respectAtRung;
    for (const m of ineff) {
      const gain = m.respectAtPrevRung - m.respectAtRung;
      if (gain > bestGain) {
        bestGain = gain;
        best = m;
      }
    }
    return { op: "demote", name: best.name, rung: best.rung - 1, reason: "efficiency", netWanted: netWantedActual, setCooldown: false, projectedNetWanted: null };
  }

  const eligible = members.filter((m) => m.rung < m.top && !m.cooldownActive && m.respectAtNextRung > m.respectAtRung);
  const promotable = eligible
    .map((m) => ({ m, projected: netWantedActual - m.actualWantedGain + m.wantedAtNextRung }))
    .filter(({ projected }) => projected <= 0);
  if (promotable.length > 0) {
    let best = promotable[0];
    let bestGain = best.m.respectAtNextRung - best.m.respectAtRung;
    for (const c of promotable) {
      const gain = c.m.respectAtNextRung - c.m.respectAtRung;
      if (gain > bestGain) {
        bestGain = gain;
        best = c;
      }
    }
    return { op: "promote", name: best.m.name, rung: best.m.rung + 1, reason: null, netWanted: netWantedActual, setCooldown: false, projectedNetWanted: best.projected };
  }

  return { op: null };
}

/**
 * Pure (S3). Global ascension stagger: ascend at most one member per
 * `ASCEND_COOLDOWN_TICKS` (caller derives `cooldownTicksRemaining` from
 * elapsed ticks since the last ascend -- this function holds no state of its
 * own), chosen among members whose preview clears `ASCEND_MIN_FACTOR`. A
 * member with no preview result (below the game's undocumented ascension
 * floor) is silently skipped, not an error -- they keep earning and cross
 * the floor on their own. On ascension, the member's rung resets to
 * `FRESH_RECRUIT_RUNG`: their stats just went to ~0 and the exact mover
 * would otherwise spend many cycles walking them back down.
 * @param {{offMarker:boolean, cooldownTicksRemaining:number, members:{name:string, previewHack:number|null}[]}} params
 */
export function evalAscension({ offMarker, cooldownTicksRemaining, members }) {
  if (offMarker || cooldownTicksRemaining > 0) return { op: null };

  const eligible = members.filter((m) => m.previewHack !== null && m.previewHack >= ASCEND_MIN_FACTOR);
  if (eligible.length === 0) return { op: null };

  let best = eligible[0];
  for (const m of eligible) if (m.previewHack > best.previewHack) best = m;
  return { op: "ascend", name: best.name, rung: FRESH_RECRUIT_RUNG };
}

/**
 * Pure (S5). Two equipment policies over one money pool, evaluated in order:
 * rootkits (broad/early, skipping members about to ascend so the gear isn't
 * wiped the same cycle it's bought), then member augmentations (staged
 * breadth-first -- tier k for every eligible member before any tier k+1 --
 * restricted to members who have ascended at least once, the concrete proof
 * they're in the ascension rotation where permanence pays for the price).
 * Owned items are never re-bought; a floor (rootkit/aug) is held back after
 * every purchase so the tier never drains the wallet to zero.
 * `offMarker` gates the whole function to an empty list, same pattern as
 * `planAssignments` -- callers may call this unconditionally every
 * `BUY_TICKS` tick without their own off-marker branch.
 * @param {{
 *   offMarker: boolean,
 *   money: number,
 *   members: { name: string, upgrades: string[], augmentations: string[], hackAscMult: number, imminentAscension: boolean }[],
 *   rootkitCosts: Record<string, number>,
 *   memberAugCosts: Record<string, number>,
 * }} params
 */
export function planEquipmentBuys({ offMarker, money, members, rootkitCosts, memberAugCosts }) {
  if (offMarker) return [];
  const ops = [];
  let remaining = money;

  for (const m of members) {
    if (m.imminentAscension) continue;
    for (const item of ROOTKITS) {
      if (m.upgrades.includes(item)) continue;
      const cost = rootkitCosts[item];
      if (remaining < cost + ROOTKIT_MONEY_FLOOR) continue;
      ops.push({ name: m.name, item, cost, class: "rootkit" });
      remaining -= cost;
    }
  }

  const rotationMembers = members.filter((m) => m.hackAscMult > 1);
  for (const item of MEMBER_AUGS) {
    for (const m of rotationMembers) {
      if (m.augmentations.includes(item)) continue;
      const cost = memberAugCosts[item];
      if (remaining < cost + MEMBER_AUG_MONEY_FLOOR) continue;
      ops.push({ name: m.name, item, cost, class: "aug" });
      remaining -= cost;
    }
  }

  return ops;
}

/**
 * Pure (S1/S7/S8). Reconciles every member's current task against policy:
 * off-marker -> no ops at all; else desired = SINK_TASK under sink mode, else
 * ladder[rung] (defaulting an unrecorded rung to 0 -- shouldn't happen in
 * practice, since rebuildRungs/recruit always populate one, but clamping one
 * that exceeds the ladder). Only members whose current task differs from the
 * desired one get an op -- no redundant `setMemberTask` calls.
 * @param {{members:{name:string, task:string}[], rungs:Record<string, number>, sinkMode:boolean, offMarker:boolean, ladder?:string[]}} params
 */
export function planAssignments({ members, rungs, sinkMode, offMarker, ladder = TASK_LADDER }) {
  if (offMarker) return [];
  const ops = [];
  for (const m of members) {
    const rung = Math.min(rungs[m.name] ?? 0, ladder.length - 1);
    const desired = sinkMode ? SINK_TASK : ladder[rung];
    if (m.task !== desired) ops.push({ name: m.name, task: desired });
  }
  return ops;
}

/** Ring-trims GANG_LOG_FILE's in-memory buffer to GANG_LOG_MAX_ENTRIES, plain FIFO (no config record to pin). */
export function appendGangLog(entries, record) {
  entries.push(record);
  if (entries.length > GANG_LOG_MAX_ENTRIES) entries = entries.slice(entries.length - GANG_LOG_MAX_ENTRIES);
  return entries;
}

/** Pure (S8). Assembles the gang-state.json snapshot record from already-computed values. */
export function buildGangState({ now, gangInfo, sinkMode, baselineWantedLevel, baselinePenalty, bonusMs, formulasAvailable, formulasSuspended, offMarker, netWantedRate, members }) {
  return {
    timestamp: now,
    time: new Date(now).toLocaleTimeString(),
    respect: gangInfo["respect"],
    respectGainRate: gangInfo["respectGainRate"],
    moneyGainRate: gangInfo["moneyGainRate"],
    wantedLevel: gangInfo["wantedLevel"],
    wantedPenalty: gangInfo["wantedPenalty"],
    baselinePenalty,
    baselineWantedLevel,
    sinkMode,
    territory: gangInfo["territory"],
    memberCount: members.length,
    bonusMs,
    formulasAvailable,
    formulasSuspended,
    offMarker,
    ladderVersion: LADDER_VERSION,
    netWantedRate,
    members,
  };
}

function ts() {
  return { timestamp: Date.now(), time: new Date().toLocaleTimeString() };
}

/** Formulas respect/wanted pair for one member at one hypothetical task, or nulls when stats is unavailable (e.g. an off-policy current task never cached). Not pure -- touches ns.formulas.gang.*, guarded by the caller's formulasAvailable check. */
function gainsFor(ns, gangInfo, raw, stats) {
  if (!stats) return { respect: null, wanted: null };
  return { respect: ns.formulas.gang.respectGain(gangInfo, raw, stats), wanted: ns.formulas.gang.wantedLevelGain(gangInfo, raw, stats) };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: gangmanager.js started without a gang -- exiting.");
    return;
  }

  const taskNames = ns.gang.getTaskNames();
  const requiredTasks = [...new Set([...TASK_LADDER, SINK_TASK])];
  for (const t of requiredTasks) {
    if (!taskNames.includes(t)) {
      ns.tprint(`ERROR: gangmanager.js -- task "${t}" not found in getTaskNames() -- exiting (setMemberTask silently idles on a bad name, so this fails loud instead).`);
      return;
    }
  }

  for (const item of [...ROOTKITS, ...MEMBER_AUGS]) {
    if (!Number.isFinite(ns.gang.getEquipmentCost(item))) {
      ns.tprint(`ERROR: gangmanager.js -- equipment "${item}" returned a non-finite cost (invalid name) -- exiting.`);
      return;
    }
  }

  const lookupTasks = [...new Set([...TASK_LADDER, "Unassigned"])];
  const taskStats = {};
  for (const t of lookupTasks) taskStats[t] = ns.gang.getTaskStats(t);

  let persisted = null;
  try {
    const raw = ns.read(GANG_STATE_FILE);
    if (raw) persisted = JSON.parse(raw);
  } catch {
    persisted = null;
  }

  const initialInfo = ns.gang.getGangInformation();
  const baseInit = initBaseline({
    wantedLevel: initialInfo["wantedLevel"],
    wantedPenalty: initialInfo["wantedPenalty"],
    persisted: persisted ? { baselineWantedLevel: persisted.baselineWantedLevel, baselinePenalty: persisted.baselinePenalty } : null,
  });
  let baselineWantedLevel = baseInit.baselineWantedLevel;
  let baselinePenalty = baseInit.baselinePenalty;
  let sinkMode = persisted?.sinkMode ?? false;

  const existingNames = ns.gang.getMemberNames();
  const liveMembers = existingNames.map((name) => ({ name, task: ns.gang.getMemberInformation(name).task }));
  let rungs = rebuildRungs(liveMembers, { version: persisted?.ladderVersion ?? null, rungs: persisted?.rungs ?? {} }, TASK_LADDER);
  let promoteCooldowns = {}; // in-memory only (S7) -- a restart costs at most one premature promotion attempt
  let lastAscendTick = -Infinity; // in-memory only (S7) -- a restart can ascend immediately, self-correcting

  let logEntries = [];
  logEntries = appendGangLog(logEntries, { ...ts(), kind: "startup", sinkMode, baselineWantedLevel, baselinePenalty, memberCount: existingNames.length, ladderVersion: LADDER_VERSION });
  if (baseInit.event === "rebaseline") {
    logEntries = appendGangLog(logEntries, { ...ts(), kind: "rebaseline", wantedLevel: initialInfo["wantedLevel"], wantedPenalty: initialInfo["wantedPenalty"] });
  }

  let previousOffMarker = null; // null so the very first tick's reading never logs a spurious toggle
  let previousFormulasAvailable = null;
  let tick = 0;

  while (true) {
    await ns.gang.nextUpdate();
    tick++;

    const bonusMs = ns.gang.getBonusTime();
    const offMarker = ns.fileExists(GANG_OFF_MARKER, "home");
    const formulasAvailable = ns.fileExists("Formulas.exe", "home");
    let eventFired = false;

    if (offMarker !== previousOffMarker && previousOffMarker !== null) {
      logEntries = appendGangLog(logEntries, { ...ts(), kind: "off-marker", offMarker });
      eventFired = true;
    }
    previousOffMarker = offMarker;

    if (formulasAvailable !== previousFormulasAvailable && previousFormulasAvailable !== null) {
      logEntries = appendGangLog(logEntries, { ...ts(), kind: formulasAvailable ? "formulas-resume" : "formulas-suspend" });
      eventFired = true;
    }
    previousFormulasAvailable = formulasAvailable;

    if (!offMarker) {
      while (ns.gang.canRecruitMember()) {
        const name = nextRecruitName(ns.gang.getMemberNames());
        if (!ns.gang.recruitMember(name)) break; // collision/cap race -- retry next tick, never spin
        rungs[name] = FRESH_RECRUIT_RUNG;
        logEntries = appendGangLog(logEntries, { ...ts(), kind: "recruit", name });
        eventFired = true;
      }
    }

    const gangInfo = ns.gang.getGangInformation();
    const memberNames = ns.gang.getMemberNames();
    const rawMembers = {};
    const members = memberNames.map((name) => {
      const info = ns.gang.getMemberInformation(name);
      rawMembers[name] = info;
      return {
        name,
        task: info.task,
        moneyGain: info.moneyGain,
        respectGain: info.respectGain,
        wantedLevelGain: info.wantedLevelGain,
        upgrades: info.upgrades,
        augmentations: info.augmentations,
        hackAscMult: info.hack_asc_mult,
        stats: { hack: info["hack"], str: info["str"], def: info["def"], dex: info["dex"], agi: info["agi"], cha: info["cha"] },
      };
    });

    // Ascension previews (S3) -- every tick, off-marker honored. Reused below
    // by the buy step's imminentAscension check (deliberate: ascend-before-
    // buy means a freshly-ascended member still shows this tick's stale
    // pre-ascend preview, which correctly keeps them skipped for rootkits
    // this same tick).
    const ascPreview = {};
    if (!offMarker) {
      for (const m of members) {
        const preview = ns.gang.getAscensionResult(m.name);
        ascPreview[m.name] = preview ? preview["hack"] : null;
      }
    } else {
      for (const m of members) ascPreview[m.name] = null;
    }

    const ticksSinceAscend = tick - lastAscendTick;
    const ascResult = evalAscension({
      offMarker,
      cooldownTicksRemaining: Math.max(0, ASCEND_COOLDOWN_TICKS - ticksSinceAscend),
      members: members.map((m) => ({ name: m.name, previewHack: ascPreview[m.name] })),
    });
    if (ascResult.op === "ascend") {
      const result = ns.gang.ascendMember(ascResult.name);
      if (result) {
        lastAscendTick = tick;
        rungs[ascResult.name] = ascResult.rung;
        logEntries = appendGangLog(logEntries, {
          ...ts(),
          kind: "ascend",
          name: ascResult.name,
          factors: { hack: result["hack"], str: result["str"], def: result["def"], dex: result["dex"], agi: result["agi"], cha: result["cha"] },
          respectLost: result.respect,
          ascendMinFactor: ASCEND_MIN_FACTOR,
          ascendCooldownTicks: ASCEND_COOLDOWN_TICKS,
        });
        eventFired = true;
      }
    }

    // Equipment buys (S5), every BUY_TICKS ticks. planEquipmentBuys gates its
    // own off-marker check (same pattern as planAssignments), but the outer
    // tick guard still skips the getServerMoneyAvailable/getEquipmentCost
    // reads entirely under off-marker -- no point paying for them either way.
    if (!offMarker && tick % BUY_TICKS === 0) {
      const money = ns.getServerMoneyAvailable("home");
      const rootkitCosts = {};
      for (const item of ROOTKITS) rootkitCosts[item] = ns.gang.getEquipmentCost(item);
      const memberAugCosts = {};
      for (const item of MEMBER_AUGS) memberAugCosts[item] = ns.gang.getEquipmentCost(item);

      const buyMembers = members.map((m) => ({
        name: m.name,
        upgrades: m.upgrades,
        augmentations: m.augmentations,
        hackAscMult: m.hackAscMult,
        imminentAscension: ascPreview[m.name] !== null && ascPreview[m.name] >= ASCEND_MIN_FACTOR,
      }));
      const buyOps = planEquipmentBuys({ offMarker, money, members: buyMembers, rootkitCosts, memberAugCosts });
      for (const op of buyOps) {
        const bought = ns.gang.purchaseEquipment(op.name, op.item);
        if (bought) {
          recordTransaction(ns, {
            type: "expense",
            source: "gang-equip",
            name: op.name,
            item: op.item,
            itemClass: op.class,
            amount: op.cost,
            timestamp: Date.now(),
            time: new Date().toLocaleString(),
          });
          logEntries = appendGangLog(logEntries, {
            ...ts(),
            kind: "equip-buy",
            name: op.name,
            item: op.item,
            itemClass: op.class,
            cost: op.cost,
            rootkitFloor: ROOTKIT_MONEY_FLOOR,
            memberAugFloor: MEMBER_AUG_MONEY_FLOOR,
          });
          eventFired = true;
        }
      }
    }

    // Emergency sink watchdog (S4, unchanged).
    const sinkResult = evalSink({
      wantedLevel: gangInfo["wantedLevel"],
      wantedPenalty: gangInfo["wantedPenalty"],
      baselineWantedLevel,
      baselinePenalty,
      sinkMode,
    });
    baselineWantedLevel = sinkResult.baselineWantedLevel;
    baselinePenalty = sinkResult.baselinePenalty;
    sinkMode = sinkResult.sinkMode;
    if (sinkResult.event) {
      logEntries = appendGangLog(logEntries, {
        ...ts(),
        kind: sinkResult.event,
        wantedLevel: gangInfo["wantedLevel"],
        wantedPenalty: gangInfo["wantedPenalty"],
        baselinePenalty,
        baselineWantedLevel,
        deviation: sinkResult.deviation,
      });
      eventFired = true;
    }

    // Per-member promote cooldowns decay every real tick, independent of PLAN_TICKS cadence.
    for (const name of Object.keys(promoteCooldowns)) {
      promoteCooldowns[name]--;
      if (promoteCooldowns[name] <= 0) delete promoteCooldowns[name];
    }

    const netWanted = members.reduce((sum, m) => sum + m.wantedLevelGain, 0);

    // Ladder move (S2), every PLAN_TICKS ticks. evalLadderMove itself is the
    // single source of truth for the suppression decision (sink/off-marker/
    // no-Formulas); ladderMembers is only built -- and formulas.gang.* only
    // called -- when the move isn't going to be suppressed anyway, so a
    // missing Formulas.exe (Prominent flag 3) never triggers a call that
    // would throw.
    if (tick % PLAN_TICKS === 0) {
      const suppressed = sinkMode || offMarker || !formulasAvailable;
      const top = TASK_LADDER.length - 1;
      const ladderMembers = suppressed
        ? []
        : members.map((m) => {
            const rung = Math.min(rungs[m.name] ?? FRESH_RECRUIT_RUNG, top);
            const raw = rawMembers[m.name];
            const cur = gainsFor(ns, gangInfo, raw, taskStats[TASK_LADDER[rung]]);
            const prev = rung >= 1 ? gainsFor(ns, gangInfo, raw, taskStats[TASK_LADDER[rung - 1]]) : { respect: null, wanted: null };
            const next = rung < top ? gainsFor(ns, gangInfo, raw, taskStats[TASK_LADDER[rung + 1]]) : { respect: null, wanted: null };
            return {
              name: m.name,
              rung,
              top,
              actualWantedGain: m.wantedLevelGain,
              respectAtRung: cur.respect,
              respectAtPrevRung: prev.respect,
              respectAtNextRung: next.respect,
              wantedAtRung: cur.wanted,
              wantedAtPrevRung: prev.wanted,
              wantedAtNextRung: next.wanted,
              cooldownActive: (promoteCooldowns[m.name] ?? 0) > 0,
            };
          });
      const moveResult = evalLadderMove({ suppressed, netWantedActual: netWanted, members: ladderMembers });
      if (moveResult.op) {
        rungs[moveResult.name] = moveResult.rung;
        if (moveResult.setCooldown) promoteCooldowns[moveResult.name] = PROMOTE_COOLDOWN_TICKS;
        logEntries = appendGangLog(logEntries, {
          ...ts(),
          kind: moveResult.op,
          name: moveResult.name,
          rung: moveResult.rung,
          reason: moveResult.reason,
          netWanted: moveResult.netWanted,
          projectedNetWanted: moveResult.projectedNetWanted,
          planTicks: PLAN_TICKS,
          promoteCooldownTicks: PROMOTE_COOLDOWN_TICKS,
        });
        eventFired = true;
      }
    }

    const ops = planAssignments({ members: members.map((m) => ({ name: m.name, task: m.task })), rungs, sinkMode, offMarker, ladder: TASK_LADDER });
    for (const op of ops) ns.gang.setMemberTask(op.name, op.task);

    ns.clearLog();
    ns.print(`===== gang @ ${new Date().toLocaleTimeString()} =====`);
    ns.print(
      `${gangInfo["faction"]} | respect ${ns.format.number(gangInfo["respect"])} | members ${members.length} | ` +
        `sink ${sinkMode ? "ON" : "off"} | wanted ${gangInfo["wantedLevel"].toFixed(2)} | formulas ${formulasAvailable ? "ok" : "MISSING"}${offMarker ? " | OFF-MARKER" : ""}`
    );

    if (tick % STATE_WRITE_TICKS === 0 || eventFired) {
      const top = TASK_LADDER.length - 1;
      const stateMembers = members.map((m) => {
        const rung = Math.min(rungs[m.name] ?? FRESH_RECRUIT_RUNG, top);
        const raw = rawMembers[m.name];
        const predicted = formulasAvailable ? gainsFor(ns, gangInfo, raw, taskStats[m.task]) : { respect: null, wanted: null };
        return {
          name: m.name,
          task: m.task,
          desiredTask: sinkMode ? SINK_TASK : TASK_LADDER[rung],
          rung,
          stats: m.stats,
          moneyGain: m.moneyGain,
          respectGain: m.respectGain,
          wantedLevelGain: m.wantedLevelGain,
          hackAscMult: m.hackAscMult,
          ascPreviewHack: ascPreview[m.name] ?? null,
          upgrades: m.upgrades,
          augmentations: m.augmentations,
          predictedRespectGain: predicted.respect,
          predictedWantedGain: predicted.wanted,
        };
      });
      const state = buildGangState({
        now: Date.now(),
        gangInfo,
        sinkMode,
        baselineWantedLevel,
        baselinePenalty,
        bonusMs,
        formulasAvailable,
        formulasSuspended: !formulasAvailable,
        offMarker,
        netWantedRate: netWanted,
        members: stateMembers,
      });
      ns.write(GANG_STATE_FILE, JSON.stringify({ ...state, rungs }), "w");
      ns.write(GANG_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");
    }
  }
}
