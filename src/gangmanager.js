/**
 * Phase 27 Tier 1 -- gang manager: recruit + task-assign only. Equipment
 * purchases, member ascension, and territory-warfare toggling are OUT OF
 * SCOPE for this file -- future tiers, not a patch on this one (see
 * phase-27-gang.spec.md's Build order). The corresponding `ns.gang.*` action
 * calls for those three mechanics must never appear below this comment
 * (grep-checked by the acceptance criteria).
 *
 * Recruiting is one-way: there is no `removeMember`/`fireMember` in the gang
 * API, only `renameMember`. Every `recruitMember` call below is permanent.
 *
 * `setMemberTask` silently sets "Unassigned" (idle) on an invalid task name
 * instead of throwing -- S7's startup validation (every ladder/sink task name
 * checked against `getTaskNames()`) exists specifically to fail loud instead
 * of idling the whole gang silently forever.
 *
 * `gang-off.txt` on home suppresses ALL actions (recruit + setMemberTask)
 * while the loop keeps observing/logging -- Kenneth's manual-control lever
 * and the sanctioned way to hand-drive members without fighting this script.
 *
 * No imports (import-bleed rule) -- local few-line helpers instead. Predicted
 * RAM ~12.7 GB (see phase-27-gang.spec.md S6); measured-on-ship RAM belongs in
 * logs/ramcheck-result.json, not restated here.
 *
 * Run: launched automatically by daemon.js's companion block.
 */

// The task ladder members climb. PINNED TO ONE RUNG as of 2026-07-20 -- the gang
// is optimized for REPUTATION, not money, and Ransomware is the best task on the
// board for that by ~20x. See docs/phases/phase-28-gang-rep-pivot.md.
//
// The full money-ordered ladder was:
//   Ransomware -> Phishing -> Identity Theft -> Fraud & Counterfeiting -> Money Laundering
// Each rung pays more and generates disproportionately more heat: promoting a
// member from Ransomware to Identity Theft doubles their respect and multiplies
// their wanted gain by 750. Seven members on Identity Theft need ~75 on the sink
// to break even, so the gang thrashed between earning and cooling (71.6% sink
// duty over 4.3h) and respect gain -- which is what buys faction rep -- was zero
// for most of its life.
//
// The climbing machinery below is deliberately left intact, not deleted: with a
// one-entry ladder evalPromotion hits its "top rung, nothing to probe" early exit
// and goes quiet. Re-adding rungs here is all it takes to switch it back on.
export const TASK_LADDER = ["Ransomware"];
export const SINK_TASK = "Ethical Hacking"; // dominates Vigilante Justice: same wanted reduction, more money, higher hack weight
export const SINK_ENTER_DEVIATION = 0.02;
export const SINK_EXIT_DEVIATION = 0.005;
export const EVAL_TICKS = 30;
export const PROBE_TICKS = 5;
export const RETRY_STAT_GROWTH = 1.25;
export const STATE_WRITE_TICKS = 10;
export const GANG_STATE_FILE = "gang-state.json";
export const GANG_LOG_FILE = "gang-log.json";
export const GANG_LOG_MAX_ENTRIES = 2000;
export const GANG_OFF_MARKER = "gang-off.txt";

const PROBE_IDLE = "idle";
const PROBE_BASELINE = "baseline";
const PROBE_PROBING = "probing";

/** Fresh per-member promotion-probe state -- in-memory only, never persisted (S7: a restart costs at most one redundant probe). */
export function freshProbeState() {
  return { phase: PROBE_IDLE, ticksIdle: 0, readings: [], baselineMean: null, preProbeRung: null, cooldowns: {} };
}

/**
 * Pure. Σ task-weight × stat / 100 -- the one use the weight table has
 * without Formulas.exe: a relative growth meter, never an absolute
 * threshold. Bracket notation on all six stat fields (identifier hygiene --
 * `hack` is a real charged `ns` method; the other five ride along for
 * uniformity per the spec).
 * @param {{hack:number,str:number,def:number,dex:number,agi:number,cha:number}} stats
 * @param {{hackWeight:number,strWeight:number,defWeight:number,dexWeight:number,agiWeight:number,chaWeight:number}} weights
 */
export function weightedStat(stats, weights) {
  return (
    (stats["hack"] * weights.hackWeight +
      stats["str"] * weights.strWeight +
      stats["def"] * weights.defWeight +
      stats["dex"] * weights.dexWeight +
      stats["agi"] * weights.agiWeight +
      stats["cha"] * weights.chaWeight) /
    100
  );
}

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
 * Pure. Startup rung rebuild (S7): a persisted rung wins when the member name
 * matches; otherwise a member already on a known ladder task keeps that rung,
 * and anyone else (fresh recruit, "Unassigned", or any off-policy task) lands
 * on rung 0 -- resolved to a real assignment at the first planAssignments
 * call, not here.
 * @param {{name:string, task:string}[]} members
 * @param {Record<string, number>} persistedRungs
 */
export function rebuildRungs(members, persistedRungs = {}, ladder = TASK_LADDER) {
  const rungs = {};
  for (const m of members) {
    if (persistedRungs[m.name] !== undefined) {
      // Clamp: a persisted rung can outlive a shortened ladder (it did when the
      // ladder was pinned to one rung -- live state held rungs of 2). Without
      // this, ladder[rung] is undefined and members get assigned a nonexistent
      // task.
      rungs[m.name] = Math.min(persistedRungs[m.name], ladder.length - 1);
      continue;
    }
    const idx = ladder.indexOf(m.task);
    rungs[m.name] = idx !== -1 ? idx : 0;
  }
  return rungs;
}

/**
 * Pure (S8/S7). Baseline captured on the manager's very first tick, or
 * restored from a persisted state file. When neither applies (missing/
 * unreadable state file), captures the current reading as baseline anyway --
 * self-healing, since evalSink's own min-tracking lowers it toward the true
 * floor as wanted drains -- but flags `rebaseline` whenever the gang wasn't
 * obviously fresh (wantedLevel already above the game's floor of 1), so the
 * imprecise startup capture is visible in the log rather than silent.
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
 * Pure (S2). One tick of the wanted-level watchdog: updates the baseline
 * whenever `wantedLevel` is AT OR BELOW the lowest ever seen, computes
 * deviation with a denominator floor (zero-safe under either an undocumented
 * multiplier-form or fraction-form `wantedPenalty`), and applies enter/exit
 * hysteresis (0.02 in / 0.005 out) so a healthy series never flaps.
 *
 * The "at or below" (not strictly below) comparison is a live-bug fix
 * (2026-07-19/20): a fresh gang starts AT its wanted floor on tick one, so a
 * strict "new minimum" test can never fire again once first touched --
 * confirmed live, the gang sat parked on SINK_TASK for 8.5+ hours because
 * `wantedPenalty` drifted upward over time (apparently as a function of gang
 * growth, not of `wantedLevel`, which stayed pinned at its floor the entire
 * time) while the baseline stayed frozen at its pre-recruitment tick-zero
 * capture. Comparing "at or below" instead lets the baseline keep tracking
 * `wantedPenalty` every tick the gang is calm (at its floor), so deviation
 * only grows when `wantedLevel` actually rises above where it's ever been --
 * the intended signal -- rather than from organic drift while calm.
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
 * Pure (S1). One tick of one member's promotion-probe state machine.
 * idle -> (EVAL_TICKS elapsed, no active cooldown) -> baseline (collect
 * PROBE_TICKS moneyGain reads on the current rung) -> probing (bump to
 * rung+1, collect PROBE_TICKS more reads) -> compare means: strictly better
 * -> promoted (stay on rung+1); else -> reverted (back to the pre-probe rung,
 * cooldown recorded against the failed rung's weightedStat). A sink-mode
 * entry mid-probe reverts to the pre-probe rung immediately, discarding any
 * partial readings -- no stranded probes. The top rung is never probed
 * (nothing to promote to).
 * @param {{rung:number, moneyGain:number, weightedStatValue:number, state:object, sinkMode:boolean, ladderLength:number, evalTicks:number, probeTicks:number, retryStatGrowth:number}} params
 */
export function evalPromotion({ rung, moneyGain, weightedStatValue, state, sinkMode, ladderLength, evalTicks, probeTicks, retryStatGrowth }) {
  if (sinkMode) {
    if (state.phase !== PROBE_IDLE) {
      return { rung: state.preProbeRung ?? rung, state: freshProbeState(), event: null };
    }
    return { rung, state, event: null };
  }

  if (state.phase === PROBE_IDLE) {
    const nextRung = rung + 1;
    if (nextRung >= ladderLength) return { rung, state, event: null }; // top rung -- nothing to probe

    const cooldownStat = state.cooldowns[nextRung];
    const ticksIdle = state.ticksIdle + 1;
    if (cooldownStat !== undefined && weightedStatValue < cooldownStat * retryStatGrowth) {
      return { rung, state: { ...state, ticksIdle }, event: null };
    }
    if (ticksIdle < evalTicks) {
      return { rung, state: { ...state, ticksIdle }, event: null };
    }
    return { rung, state: { ...state, phase: PROBE_BASELINE, ticksIdle: 0, readings: [moneyGain] }, event: null };
  }

  if (state.phase === PROBE_BASELINE) {
    const readings = [...state.readings, moneyGain];
    if (readings.length < probeTicks) return { rung, state: { ...state, readings }, event: null };
    const baselineMean = readings.reduce((a, b) => a + b, 0) / readings.length;
    return {
      rung: rung + 1,
      state: { phase: PROBE_PROBING, ticksIdle: 0, readings: [], baselineMean, preProbeRung: rung, cooldowns: state.cooldowns },
      event: null,
    };
  }

  // PROBE_PROBING
  const readings = [...state.readings, moneyGain];
  if (readings.length < probeTicks) return { rung, state: { ...state, readings }, event: null };
  const probeMean = readings.reduce((a, b) => a + b, 0) / readings.length;

  if (probeMean > state.baselineMean) {
    return { rung, state: freshProbeState(), event: "promote" };
  }
  const failedRung = rung; // currently sitting on the probed (failed) rung
  const cooldowns = { ...state.cooldowns, [failedRung]: weightedStatValue };
  return { rung: state.preProbeRung, state: { ...freshProbeState(), cooldowns }, event: "demote" };
}

/**
 * Pure (S1/S7/S8). Reconciles every member's current task against policy:
 * off-marker -> no ops at all; else desired = SINK_TASK under sink mode, else
 * ladder[rung] (defaulting an unrecorded rung to 0, clamping one that exceeds
 * the ladder). Only members whose current task differs from the desired one get
 * an op -- no redundant `setMemberTask` calls.
 *
 * `ladder` is injectable so the multi-rung machinery stays testable while the
 * live ladder is pinned to a single rung.
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
export function buildGangState({ now, gangInfo, sinkMode, baselineWantedLevel, baselinePenalty, bonusMs, formulasAvailable, offMarker, members }) {
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
    offMarker,
    members,
  };
}

function ts() {
  return { timestamp: Date.now(), time: new Date().toLocaleTimeString() };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  if (!ns.gang.inGang()) {
    ns.tprint("ERROR: gangmanager.js started without a gang -- exiting.");
    return;
  }

  const taskNames = ns.gang.getTaskNames();
  const requiredTasks = [...TASK_LADDER, SINK_TASK];
  for (const t of requiredTasks) {
    if (!taskNames.includes(t)) {
      ns.tprint(`ERROR: gangmanager.js -- task "${t}" not found in getTaskNames() -- exiting (setMemberTask silently idles on a bad name, so this fails loud instead).`);
      return;
    }
  }

  const taskWeights = {};
  for (const t of requiredTasks) taskWeights[t] = ns.gang.getTaskStats(t);

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
  let rungs = rebuildRungs(liveMembers, persisted?.rungs ?? {});
  let probeStates = {};
  for (const name of existingNames) probeStates[name] = freshProbeState();

  let logEntries = [];
  logEntries = appendGangLog(logEntries, { ...ts(), kind: "startup", sinkMode, baselineWantedLevel, baselinePenalty, memberCount: existingNames.length });
  if (baseInit.event === "rebaseline") {
    logEntries = appendGangLog(logEntries, { ...ts(), kind: "rebaseline", wantedLevel: initialInfo["wantedLevel"], wantedPenalty: initialInfo["wantedPenalty"] });
  }

  let previousOffMarker = null; // null so the very first tick's reading never logs a spurious toggle
  let tick = 0;

  while (true) {
    await ns.gang.nextUpdate();

    const bonusMs = ns.gang.getBonusTime();
    const offMarker = ns.fileExists(GANG_OFF_MARKER, "home");
    let eventFired = false;

    if (offMarker !== previousOffMarker && previousOffMarker !== null) {
      logEntries = appendGangLog(logEntries, { ...ts(), kind: "off-marker", offMarker });
      eventFired = true;
    }
    previousOffMarker = offMarker;

    if (!offMarker) {
      while (ns.gang.canRecruitMember()) {
        const name = nextRecruitName(ns.gang.getMemberNames());
        if (!ns.gang.recruitMember(name)) break; // collision/cap race -- retry next tick, never spin
        rungs[name] = 0;
        probeStates[name] = freshProbeState();
        logEntries = appendGangLog(logEntries, { ...ts(), kind: "recruit", name });
        eventFired = true;
      }
    }

    const gangInfo = ns.gang.getGangInformation();
    const memberNames = ns.gang.getMemberNames();
    const members = memberNames.map((name) => {
      const info = ns.gang.getMemberInformation(name);
      return {
        name,
        task: info.task,
        moneyGain: info.moneyGain,
        respectGain: info.respectGain,
        wantedLevelGain: info.wantedLevelGain,
        stats: { hack: info["hack"], str: info["str"], def: info["def"], dex: info["dex"], agi: info["agi"], cha: info["cha"] },
      };
    });

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

    for (const m of members) {
      const rung = rungs[m.name] ?? 0;
      const state = probeStates[m.name] ?? freshProbeState();
      const task = TASK_LADDER[Math.min(rung, TASK_LADDER.length - 1)];
      const wsv = weightedStat(m.stats, taskWeights[task]);
      const result = evalPromotion({
        rung,
        moneyGain: m.moneyGain,
        weightedStatValue: wsv,
        state,
        sinkMode,
        ladderLength: TASK_LADDER.length,
        evalTicks: EVAL_TICKS,
        probeTicks: PROBE_TICKS,
        retryStatGrowth: RETRY_STAT_GROWTH,
      });
      if (result.event) {
        logEntries = appendGangLog(logEntries, {
          ...ts(),
          kind: result.event,
          name: m.name,
          rung: result.rung,
          evalTicks: EVAL_TICKS,
          probeTicks: PROBE_TICKS,
          retryStatGrowth: RETRY_STAT_GROWTH,
        });
        eventFired = true;
      }
      rungs[m.name] = result.rung;
      probeStates[m.name] = result.state;
    }

    const ops = planAssignments({ members: members.map((m) => ({ name: m.name, task: m.task })), rungs, sinkMode, offMarker });
    for (const op of ops) ns.gang.setMemberTask(op.name, op.task);

    ns.clearLog();
    ns.print(`===== gang @ ${new Date().toLocaleTimeString()} =====`);
    ns.print(
      `${gangInfo["faction"]} | respect ${ns.format.number(gangInfo["respect"])} | members ${members.length} | ` +
        `sink ${sinkMode ? "ON" : "off"} | wanted ${gangInfo["wantedLevel"].toFixed(2)}${offMarker ? " | OFF-MARKER" : ""}`
    );

    tick++;
    if (tick % STATE_WRITE_TICKS === 0 || eventFired) {
      const formulasAvailable = ns.fileExists("Formulas.exe", "home");
      const stateMembers = members.map((m) => ({
        name: m.name,
        task: m.task,
        desiredTask: sinkMode ? SINK_TASK : TASK_LADDER[Math.min(rungs[m.name] ?? 0, TASK_LADDER.length - 1)],
        rung: rungs[m.name] ?? 0,
        stats: m.stats,
        moneyGain: m.moneyGain,
        respectGain: m.respectGain,
        wantedLevelGain: m.wantedLevelGain,
      }));
      const state = buildGangState({
        now: Date.now(),
        gangInfo,
        sinkMode,
        baselineWantedLevel,
        baselinePenalty,
        bonusMs,
        formulasAvailable,
        offMarker,
        members: stateMembers,
      });
      ns.write(GANG_STATE_FILE, JSON.stringify({ ...state, rungs }), "w");
      ns.write(GANG_LOG_FILE, JSON.stringify(logEntries, null, 2), "w");
    }
  }
}
