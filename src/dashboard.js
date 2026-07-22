// Phase 24 -- the single standing tail. Every companion (daemon.js,
// targetsmonitor.js, cloudmanager.js, xpfarm.js, transactionsmonitor.js,
// resourcemanager.js, augfarmer.js) is headless and publishes a small state
// file; this script is the only renderer that opens a window, reading those
// seven files and formatting them to a fixed column/row budget. Dashboard
// space is gated by the observability convention (CLAUDE.md): a panel is
// added here only via a brainstorm decision, never silently -- ad-hoc writes
// would break the no-wrap/no-scroll guarantee this window exists to provide.
//
// Geometry contract (S10): width/height/font are hardcoded and re-asserted
// every poll (891x1262, font 16 -- the daemon window's live anchor position,
// confirmed 2026-07-14 via CDP: transform: translate(1653px, 21px)), so the
// column budget is a provable function of width+font, not a moving target.
// Position is asserted once at launch only -- dragging the window is allowed
// and persists across polls; only a manual resize/font change snaps back.
// The native collapse control is respected (never fought via
// setTailMinimized).
//
// Exactly-one-popup rule (S11): three layers run before this instance's own
// ns.ui.openTail() --
//   1. ns.atExit(() => ns.ui.closeTail()) -- self-closes on every script death
//      the game runs callbacks for (manual kill, killscripts sweep, a CDP
//      restart, ns.exit).
//   2. Running-duplicate sweep (ns.ps("home")): any other live dashboard.js
//      process gets its tail closed + killed -- the new instance wins.
//   3. Dead-orphan sweep (ns.getRecentScripts()): closes any dashboard.js
//      entry whose atExit didn't run (crash, or a pre-phase-24 leftover).
// No setTailTitle -- the title stays the filename, so tools/bb's
// restartScript (close-by-filename) keeps working.
//
// Exec'd by daemon.js via launchDetached; not importable (headless-companion
// pattern -- see the other six scripts' own headers). RAM: measured 2.6 GB
// live (ramcheck.js, 2026-07-14) -- within the 2-4 GB band (ns.ui.* +
// ns.ps/ns.getRecentScripts/ns.read/ns.print all 0 GB per markdown/, plus
// this file's own static footprint; no getTargets or other analysis
// import). Hit the identifier-hygiene trap once during implementation --
// see the `state["share"]` comment below and CLAUDE.md's script-writing
// rules -- initial measurement was a false 5 GB.

import { readFinanceState, isStateStale } from "./financestate.js";
import { transactionsFileName } from "./translog.js";

export const DASHBOARD_W = 891;
export const DASHBOARD_H = 1262;
export const DASHBOARD_FONT = 16;
export const DASHBOARD_X = 1653; // live daemon-tail anchor, confirmed via CDP 2026-07-14
export const DASHBOARD_Y = 21;
// S8 -- calibrated live in L2 (2026-07-14): the ruler's ungapped digit runs
// measure exactly 9.6001px/char at 891px width/font 16 (JetBrainsMono); the
// content Paper's clientWidth is 890px, so 92 whole characters fit
// (92*9.6001=883.2px) while the 96-char ruler line rendered clipped to the
// same width as the 92-char one, proving 93-96 get cut off, not wrapped.
export const COLUMN_BUDGET = 92;
export const ROW_BUDGET = 58;
export const POLL_MS = 1000;
export const RULER_FLAG = "dashboard-ruler.txt";
export const PANEL_ENTRY_CAP = 3;

// Per-panel staleness thresholds (S7): max(3 x writer cadence, 15s), reusing
// financestate.js's isStateStale. Transactions has no STALE flag (S5) -- the
// daily file only changes on income, so "stale" would misfire during a
// genuine income lull; the panel shows the last record's age instead.
const STALE_MS = {
  daemon: 15_000,
  targets: 15_000,
  finance: 15_000,
  xpfarm: 30_000,
  cloud: 30_000,
  augfarmer: 390_000,
  // gangmanager.js writes once per gang tick (nextUpdate resolves 2000-5000ms),
  // so 3x the worst cadence is 15s -- floored to the same 15s as daemon.
  gang: 15_000,
  // Phase 32 -- goallog.js samples every 60s; 3x that, over the 15s floor.
  goal: 180_000,
};

// Hardcoded rather than imported from each writer -- mirrors
// resourcemanager.js's AUGFARMER_RESERVE_FILE precedent: a Singularity-free
// (or analysis-free) reader shouldn't import a heavy companion module just
// for a filename string.
const DAEMON_STATUS_FILE = "daemon-status.json";
const TARGETS_RANKING_FILE = "targets-ranking.json";
const CLOUD_STATE_FILE = "cloud-state.json";
const XPFARM_STATE_FILE = "xpfarm-state.json";
const AUGFARMER_STATE_FILE = "augfarmer-state.json";
const GANG_STATE_FILE = "gang-state.json";
const GOAL_STATE_FILE = "goal-state.json"; // Phase 32 -- goallog.js's overwrite-in-place snapshot

// goallog.js's RATE_WINDOW_MS, hardcoded rather than imported -- goallog.js's
// ns surface is getMoneySources+getPlayer (real RAM); importing it would
// bleed that into dashboard.js's 0-added-RAM budget (CLAUDE.md's import-
// bleed rule). Every real snapshot carries its own income.windowMs anyway;
// this is only the display fallback for a partial/malformed record.
const DEFAULT_GOAL_WINDOW_MS = 600_000;

// gangmanager.js's ASCEND_MIN_FACTOR, hardcoded rather than imported:
// importing ANY symbol from gangmanager.js would charge dashboard.js that
// module's entire ns.gang surface (CLAUDE.md's import-bleed rule:
// targetsmonitor.js paid 0.60 GB for a four-line pure helper). dashboard.js
// must stay a 0 GB reader.
//
// Phase 29's observation-window goal (respectGainRate >= 1.27/tick) is retired:
// the window closed early 2026-07-21 with the rate ~425x over it, so a
// "% of goal" readout only ever printed five-digit noise. The trend arrow
// below is the live health signal that replaced it.
export const GANG_ASCEND_MIN_FACTOR = 1.5;

// Trend sampling (the dashboard is its own sampler): gang-state.json is a
// single overwritten snapshot, so "is the rate climbing?" has nowhere else to
// come from. One sample per minute, capped at an hour of history. In-memory
// only; a dashboard restart resets it -- durable, multi-hour history is Tier 4
// candidate work (BACKLOG), now that the observation-window freeze is lifted.
export const GANG_SAMPLE_MS = 60_000;
export const GANG_SAMPLE_CAP = 60;

// Sentinel distinguishing "file present but didn't parse" (S7: renders as
// "unreadable") from "file missing" (null, renders as "no data yet").
export const PARSE_FAILED = "PARSE_FAILED";

/**
 * S8's hard guard: truncates `line` to `budget` characters, ending in a
 * trailing "…" when it doesn't fit -- the renderer never hands the game a
 * string longer than budget, by construction, regardless of what a
 * formatter produces (hostile data included).
 */
export function clampLine(line, budget) {
  if (line.length <= budget) return line;
  if (budget <= 0) return "";
  return line.slice(0, budget - 1) + "…";
}

/** Slices `entries` to `cap`, reporting how many were dropped. Callers render `(+N more)` from moreCount. */
export function capEntries(entries, cap) {
  const list = entries ?? [];
  return { shown: list.slice(0, cap), moreCount: Math.max(0, list.length - cap) };
}

/** S8's calibration block: five ruler lines (lengths 80/84/88/92/96), each stamped with its own length. */
export function rulerLines() {
  return [80, 84, 88, 92, 96].map((len) => {
    let line = `${len}:`;
    while (line.length < len) line += (line.length % 10).toString();
    return line.slice(0, len);
  });
}

// --- small pure number formatters (no ns -- panels take raw numbers) -------

function fmtNum(n) {
  if (n === undefined || n === null || !Number.isFinite(n)) return "?";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "t";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "b";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "m";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return n.toFixed(1);
}

function fmtRam(gb) {
  if (gb === undefined || gb === null || !Number.isFinite(gb)) return "?";
  if (gb >= 1e6) return (gb / 1e6).toFixed(2) + "PB";
  if (gb >= 1e3) return (gb / 1e3).toFixed(2) + "TB";
  return gb.toFixed(1) + "GB";
}

function fmtPct(n) {
  if (n === undefined || n === null || !Number.isFinite(n)) return "?%";
  return `${n.toFixed(1)}%`;
}

function fmtRate(n) {
  if (n === undefined || n === null || !Number.isFinite(n)) return "?";
  return n.toFixed(2);
}

/** Phase 32 -- elapsed-time display for the awaiting-money timer: "Nm" under an hour, else "Xh Ym". */
function fmtElapsed(ms) {
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return "?";
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

/** Title-line STALE marker (S7), or "" when fresh/unknown. */
function staleSuffix(timestamp, now, staleMs) {
  if (timestamp === undefined || timestamp === null) return "";
  if (!isStateStale(timestamp, now, staleMs)) return "";
  return ` STALE ${Math.max(0, Math.round((now - timestamp) / 1000))}s`;
}

// --- panel formatters --------------------------------------------------
// Each: null -> "no data yet"; PARSE_FAILED -> "unreadable"; otherwise
// tolerant of missing scalar/list fields (S7's format-step tolerance) --
// absent lists read as [], absent scalars as "?". Two-line feeds are two
// intentional strings, never a soft wrap.

export function daemonPanel(state, now) {
  const title = "DAEMON";
  if (state === null) return [`-- ${title} --`, "no data yet"];
  if (state === PARSE_FAILED) return [`-- ${title} --`, "unreadable"];

  const stale = staleSuffix(state.timestamp, now, STALE_MS.daemon);
  const lines = [`-- ${title} -- ${state.mathMode ?? "?"}${stale}`];

  const fleet = state.fleet ?? {};
  lines.push(
    `fleet ${fmtRam(fleet.totalMaxRam)} budget ${fmtRam(fleet.batchBudgetGb)} | hosts ${fleet.hostsCount ?? 0} targets ${fleet.targetsCount ?? 0} | util ${fmtPct(fleet.utilizationPct)}`
  );

  if (state.noTargets) {
    lines.push("no eligible targets");
  } else {
    const members = state.members ?? [];
    const draining = state.draining ?? [];
    const drainingCount = state.drainingCount ?? draining.length;
    lines.push(`members ${state.memberCount ?? members.length}${drainingCount > 0 ? ` (+${drainingCount} draining)` : ""}:`);
    // Cap 2 rather than PANEL_ENTRY_CAP (2026-07-20): DAEMON stays the alarm
    // surface -- warns/stall/share/waterfall below are untouched -- but the
    // member list itself gave up a row to fund the GANG panel.
    const { shown, moreCount } = capEntries(members, 2);
    if (shown.length === 0) {
      lines.push("  (none)");
    } else {
      for (const m of shown) {
        lines.push(
          `  ${String(m.server ?? "?").padEnd(15)} ${m.prepped ? "PREPPED" : "DRIFTED"}${m.floor ? " FLOOR" : ""} ${m.batchesInFlight ?? 0}/${m.depth ?? 0} | commit ${fmtPct(m.commitPct)} | sec ${fmtNum(m.sec)}/${fmtNum(m.minSec)} | $${fmtNum(m.money)}/${fmtNum(m.maxMoney)}`
        );
      }
    }
    if (moreCount > 0) lines.push(`  (+${moreCount} more)`);
  }

  // Bracket notation deliberately, not `state.share` -- a literal `.share`
  // property access gets misread by this build's RAM analyzer as a
  // reference to the real, non-zero-cost ns.share() (see CLAUDE.md's
  // identifier-hygiene rule; confirmed live 2026-07-14: `.share` alone added
  // a false +2.4 GB, even with the local variable itself renamed).
  const shareBlock = state["share"] ?? {};
  if (shareBlock.off) {
    lines.push("share: OFF");
  } else {
    lines.push(
      `share: ${fmtRam(shareBlock.inFlightRamGb)}/${fmtRam(shareBlock.targetGb)} (${fmtPct(shareBlock.attainedPct)}) | ${shareBlock.threads ?? 0}t | power ${fmtRate(shareBlock.sharePower)}`
    );
  }

  const waterfall = state.waterfall ?? {};
  const prepping = waterfall.prepping ?? [];
  lines.push(`waterfall: ${fmtRam(waterfall.availableGb)} free | prepping: ${prepping.length > 0 ? prepping.join(", ") : "none"}`);

  const warns = state.warns ?? {};
  if (warns.stall) lines.push("WARN: zero-member stall");
  const skipServers = warns.skipServers ?? [];
  if (skipServers.length > 0) {
    const { shown: skipShown, moreCount: skipMore } = capEntries(skipServers, 2);
    lines.push(`WARN: skipped -- ${skipShown.join(", ")}${skipMore > 0 ? ` (+${skipMore} more)` : ""}`);
  }
  if ((warns.failedLaunches ?? 0) > 0) lines.push(`WARN: ${warns.failedLaunches} launch(es) failed`);

  return lines;
}

export function targetsPanel(state, now) {
  const title = "TARGETS";
  if (state === null) return [`-- ${title} --`, "no data yet"];
  if (state === PARSE_FAILED) return [`-- ${title} --`, "unreadable"];

  const stale = staleSuffix(state.timestamp, now, STALE_MS.targets);
  const lines = [`-- ${title} --${stale}`];
  const totalCount = state.totalCount ?? 0;
  const targets = (state.targets ?? []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (targets.length === 0) {
    lines.push("no eligible targets");
    return lines;
  }

  // Collapsed to a summary + the top-scored target only (2026-07-20). The
  // batcher is a mature subsystem: the full ranked list was tuning-era detail
  // that cost ~7 rows and was read only when something broke. Prepped count is
  // the health signal; the per-target breakdown lives in targets-ranking.json.
  const preppedCount = targets.filter((t) => t.prepped).length;
  const top = targets[0];
  lines.push(`${totalCount} eligible, ${preppedCount}/${targets.length} prepped`);
  lines.push(
    `top: ${String(top.server ?? "?")} ${top.prepped ? "PREPPED" : "DRIFTED"} | sec ${fmtNum(top.sec)}/${fmtNum(top.minSec)} | $${fmtNum(top.money)}/${fmtNum(top.maxMoney)}`
  );
  return lines;
}

/**
 * Pure ring-append for the gang trend sampler. Returns a NEW array (never
 * mutates), appending at most one sample per GANG_SAMPLE_MS and trimming to
 * GANG_SAMPLE_CAP oldest-first. A missing/unreadable state is a no-op, so a
 * transient read failure leaves the existing history intact rather than
 * punching a hole in it.
 */
export function pushGangSample(samples, state, now) {
  const list = samples ?? [];
  if (!state || state === PARSE_FAILED) return list;
  const rate = state.respectGainRate;
  if (!Number.isFinite(rate)) return list;

  const last = list[list.length - 1];
  if (last && now - last.t < GANG_SAMPLE_MS) return list;

  const next = list.concat([{ t: now, respect: state.respect ?? 0, rate }]);
  return next.length > GANG_SAMPLE_CAP ? next.slice(next.length - GANG_SAMPLE_CAP) : next;
}

/** Pure. Collapses the sample ring to {spanMs, rateDelta}, or null when there isn't enough history yet. */
export function summarizeGangTrend(samples, now) {
  const list = samples ?? [];
  if (list.length < 2) return null;
  const first = list[0];
  const last = list[list.length - 1];
  const spanMs = last.t - first.t;
  if (!(spanMs > 0)) return null;
  return { spanMs, rateDelta: (last.rate ?? 0) - (first.rate ?? 0) };
}

export function gangPanel(state, trend, now) {
  const title = "GANG";
  if (state === null) return [`-- ${title} --`, "no data yet"];
  if (state === PARSE_FAILED) return [`-- ${title} --`, "unreadable"];

  const stale = staleSuffix(state.timestamp, now, STALE_MS.gang);
  const lines = [`-- ${title} --${stale}`];

  // Mode flags first: an off-marker or an active wanted-sink explains an
  // otherwise alarming respect rate, so it has to precede the numbers.
  if (state.offMarker) {
    lines.push("OFF (gang-off.txt)");
    return lines;
  }

  const rate = state.respectGainRate;
  let trendPart = "";
  if (trend) {
    const mins = Math.round(trend.spanMs / 60_000);
    const arrow = trend.rateDelta > 0.0005 ? "UP" : trend.rateDelta < -0.0005 ? "DOWN" : "FLAT";
    const sign = trend.rateDelta >= 0 ? "+" : "";
    trendPart = ` | ${mins}m ${arrow} ${sign}${trend.rateDelta.toFixed(3)}`;
  }
  lines.push(
    `respect ${fmtNum(state.respect)} (+${fmtRate(rate)}/t)${trendPart}`
  );

  // netWantedRate is the health signal the Phase 27 sink bug hid: negative is
  // good (wanted draining), positive means the sink is losing ground.
  const netWanted = state.netWantedRate;
  const wantedFlag = !Number.isFinite(netWanted) ? "?" : netWanted <= 0 ? "OK" : "RISING";
  lines.push(
    `money $${fmtNum(state.moneyGainRate)}/s | wanted ${fmtRate(netWanted)} ${wantedFlag} | members ${state.memberCount ?? 0}`
  );

  // Bracket notation on ascPreviewHack deliberately -- the field name ends in
  // a real ns method name and this build's RAM analyzer has misread names, not
  // just calls (CLAUDE.md identifier hygiene). The field is written by the
  // frozen gangmanager.js, so it can't be renamed at the source.
  const members = state.members ?? [];
  const ascReady = members.filter((m) => (m["ascPreviewHack"] ?? 0) >= GANG_ASCEND_MIN_FACTOR).length;
  const sinkPart = state.sinkMode ? " | SINK MODE" : "";
  lines.push(`asc-ready ${ascReady}/${members.length} (>=${GANG_ASCEND_MIN_FACTOR}x)${sinkPart}`);

  const taskCounts = new Map();
  for (const m of members) {
    const t = m.task ?? "?";
    taskCounts.set(t, (taskCounts.get(t) ?? 0) + 1);
  }
  if (taskCounts.size > 0) {
    const taskEntries = [...taskCounts.entries()].sort((a, b) => b[1] - a[1]);
    const { shown, moreCount } = capEntries(taskEntries, PANEL_ENTRY_CAP);
    const taskPart = shown.map(([task, n]) => `${task} ${n}`).join(" | ");
    lines.push(`tasks: ${taskPart}${moreCount > 0 ? ` (+${moreCount} distinct more)` : ""}`);
  }

  return lines;
}

export function financePanel(state, now) {
  const title = "FINANCE";
  if (state === null) return [`-- ${title} --`, "no data yet"];
  if (state === PARSE_FAILED) return [`-- ${title} --`, "unreadable"];

  const stale = staleSuffix(state.timestamp, now, STALE_MS.finance);
  const lines = [`-- ${title} --${stale}`];
  lines.push(`money $${fmtNum(state.money)} | reserved $${fmtNum(state.totalReserved)} | available $${fmtNum(state.available)}`);

  const reservations = (state.reservations ?? []).slice().sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const { shown, moreCount } = capEntries(reservations, PANEL_ENTRY_CAP);
  if (shown.length === 0) {
    lines.push("no active reservations");
  } else {
    for (const r of shown) lines.push(`  ${String(r.key ?? "?").padEnd(16)} $${fmtNum(r.amount)}  ${r.label ?? ""}`);
    if (moreCount > 0) lines.push(`  (+${moreCount} more)`);
  }
  if (state.formulasSuppressed) lines.push("formulas reservation: DISABLED by flag");
  return lines;
}

export function xpPanel(state, now) {
  const title = "XP FARM";
  if (state === null) return [`-- ${title} --`, "no data yet"];
  if (state === PARSE_FAILED) return [`-- ${title} --`, "unreadable"];

  const stale = staleSuffix(state.timestamp, now, STALE_MS.xpfarm);
  const lines = [`-- ${title} --${stale}`];
  if (state.off) {
    lines.push("OFF (xp-off.txt)");
    return lines;
  }
  // Collapsed to one line (2026-07-20) -- same maturity argument as TARGETS.
  // The per-target mode/thread breakdown was tuning-era detail; the counts
  // below are enough to tell "running" from "stalled".
  const targets = state.targets ?? [];
  lines.push(
    `usable ${fmtRam(state.usableGb)} | claim ${fmtRam(state.claimGb)} | lvl ${state.hackingLevel ?? "?"} | ${targets.length} target(s)`
  );
  if (targets.length === 0) lines.push("no eligible XP target");
  return lines;
}

export function cloudPanel(state, now) {
  const title = "CLOUD";
  if (state === null) return [`-- ${title} --`, "no data yet"];
  if (state === PARSE_FAILED) return [`-- ${title} --`, "unreadable"];

  const stale = staleSuffix(state.timestamp, now, STALE_MS.cloud);
  const lines = [`-- ${title} --${stale}`];
  if (state.paused) {
    lines.push("PAUSED");
    return lines;
  }
  if (state.financeStale) {
    lines.push("finance state stale -- spending nothing");
    return lines;
  }

  // Collapsed (2026-07-20): fleet shape + spend headroom folded into one line,
  // and `last upgrade` dropped -- it is history, already in the transactions
  // panel and translog. `next` is kept as its own line ONLY when we can't
  // afford it, which is the one cloud state that wants attention.
  const fleet = state.fleet;
  const fleetPart = fleet
    ? `fleet ${fleet.count ?? 0}/${fleet.serverLimit ?? "?"}, ${fmtRam(fleet.minRam)}-${fmtRam(fleet.maxRam)}`
    : "no cloud servers owned";
  lines.push(`${fleetPart} | avail $${fmtNum(state.available)}`);

  const next = state.next;
  if (next && !next.affordable) {
    lines.push(`next: ${next.hostname ?? "?"} -> ${fmtRam(next.tier)}, $${fmtNum(next.cost)} (can't afford)`);
  } else if (!next && state.growth) {
    lines.push(`fleet maxed -- growth: ${state.growth.status ?? "?"}`);
  }
  return lines;
}

export function transactionsPanel(entries, now) {
  const title = "TRANSACTIONS";
  if (entries === null) return [`-- ${title} --`, "no data yet"];
  if (entries === PARSE_FAILED) return [`-- ${title} --`, "unreadable"];

  const list = Array.isArray(entries) ? entries : [];
  const income = list.filter((r) => r?.type === "income");
  const expense = list.filter((r) => r?.type === "expense");
  const incomeTotal = income.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const expenseTotal = expense.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  // Rate anchored on the earliest income record only (never an expense
  // record, whose missing firstTimestamp would otherwise produce a NaN
  // rate on a day whose first record is an expense); omitted entirely when
  // no income record exists.
  let rateLine = "";
  if (income.length > 0) {
    const earliest = income.reduce((min, r) => {
      const rKey = r.firstTimestamp ?? r.timestamp ?? Infinity;
      const minKey = min.firstTimestamp ?? min.timestamp ?? Infinity;
      return rKey < minKey ? r : min;
    });
    const anchor = earliest.firstTimestamp ?? earliest.timestamp;
    const elapsedMin = anchor !== undefined ? Math.max(0, (now - anchor) / 60_000) : 0;
    const rate = elapsedMin > 0 ? incomeTotal / elapsedMin : 0;
    rateLine = ` | rate $${fmtNum(rate)}/min`;
  }

  const lines = [`-- ${title} --`];
  lines.push(`today: +$${fmtNum(incomeTotal)} / -$${fmtNum(expenseTotal)}${rateLine}`);

  const sorted = list.slice().sort((a, b) => (b.lastTimestamp ?? b.timestamp ?? 0) - (a.lastTimestamp ?? a.timestamp ?? 0));
  const { shown } = capEntries(sorted, PANEL_ENTRY_CAP);
  if (shown.length === 0) {
    lines.push("(none yet today)");
  } else {
    for (const r of shown) {
      const t = new Date(r.lastTimestamp ?? r.timestamp ?? now).toLocaleTimeString();
      lines.push(r.type === "income" ? `  [income]  +$${fmtNum(r.amount)} @ ${t}` : `  [expense] -$${fmtNum(r.amount)} ${r.source ?? "?"} @ ${t}`);
    }
    const lastAgeSec = Math.max(0, Math.round((now - (shown[0].lastTimestamp ?? shown[0].timestamp ?? now)) / 1000));
    lines.push(`(last record ${lastAgeSec}s ago)`);
  }
  return lines;
}

export function augPanel(state, now) {
  const title = "AUG FARMER";
  if (state === null) return [`-- ${title} --`, "no data yet"];
  if (state === PARSE_FAILED) return [`-- ${title} --`, "unreadable"];

  const stale = staleSuffix(state.timestamp, now, STALE_MS.augfarmer);
  const lines = [`-- ${title} --${stale}`];
  lines.push(`phase: ${state.phase ?? "?"}`);
  const target = state.target;
  lines.push(target ? `target: ${target.aug ?? "?"} via ${target.faction ?? "?"} (deficit ${Math.round(target.deficit ?? 0)})` : "target: none");
  // `target` is what we buy next; `work` is what the action slot is actually
  // grinding. They routinely differ (a rep-met NFG heads the sort at deficit
  // 0 while the slot grinds another faction), and showing only the former
  // reads as "grinding for <target>" -- which is wrong, and hid a dead
  // install trigger for a day. Space authorized by Kenneth 2026-07-16.
  const work = state.workTarget;
  if (work?.faction) {
    lines.push(
      work.deficit > 0
        ? `work: ${work.faction} -> ${work.aug ?? "?"} (deficit ${Math.round(work.deficit)})`
        : `work: ${work.faction} (no grind -- rep met)`,
    );
  } else {
    lines.push("work: none");
  }
  const bought = state.boughtThisCycle ?? [];
  const joined = state.joinedFactions ?? [];
  lines.push(`bought ${bought.length} | joined ${joined.length}`);
  const gate = state.daedalusGate;
  if (gate) lines.push(`daedalus gate: ${gate.installed ?? 0}+${gate.queued ?? 0}/${gate.target ?? "?"}`);
  return lines;
}

/**
 * Phase 32 -- the "why everything below exists" readout: installed hacking
 * mult `M` progress toward the w0r1d_d43m0n gate, a smoothed income
 * $/sec + trend (fed by goallog.js's ring, NOT computed here), and the
 * $-to-next-aug + awaiting-money elapsed timer. Display forms are pinned
 * exactly (Phase 32 spec decision 11) so this formatter's tests are exact
 * strings, not substring checks.
 */
export function goalPanel(state, now) {
  const title = "GOAL (BN2.1)";
  if (state === null) return [`-- ${title} --`, "no data yet"];
  if (state === PARSE_FAILED) return [`-- ${title} --`, "unreadable"];

  const stale = staleSuffix(state.timestamp, now, STALE_MS.goal);
  const lines = [`-- ${title} --${stale}`];

  const m = state.mProgress ?? {};
  const mText = typeof m.value === "number" ? m.value.toFixed(2) : "?";
  const pctText = typeof m.pct === "number" ? m.pct : "?";
  const gatePart = m.gateTarget ? ` -> gate ~${m.gateTarget}` : "";
  lines.push(`M ${mText}/${m.target ?? "?"} (${m.targetLabel ?? "?"}) ~${pctText}%${gatePart}`);

  // Projected M if the augs already bought this cycle were installed now
  // (installed M x queuedGain). Only shown while augs are actually pending --
  // M sits flat through the whole buy phase and only steps at install, so this
  // is the line that makes the flat installed-M readable as progress, not a
  // stall. Omitted when nothing's queued (queuedCount 0) to keep the panel
  // quiet.
  if (typeof m.queuedValue === "number" && typeof m.queuedCount === "number" && m.queuedCount > 0) {
    const qPctText = typeof m.queuedPct === "number" ? m.queuedPct : "?";
    lines.push(`+queued: M ${m.queuedValue.toFixed(2)} ~${qPctText}% (${m.queuedCount} aug${m.queuedCount === 1 ? "" : "s"} pending install)`);
  }

  // Goalpost tripwire (GP2): M only climbs, so a 12h-flat M means the ratchet
  // stalled. STALLED is the alarm; ON TRACK/warming are quiet confirmations.
  const tw = state.tripwire ?? {};
  if (tw.status === "STALLED") {
    lines.push(`WARN: goalposts STALLED -- M flat ${tw.flatHours ?? "?"}h (ratchet stuck?)`);
  } else if (tw.status === "ON TRACK") {
    lines.push("goalposts: ON TRACK (M climbing)");
  } else if (tw.status === "WARMING") {
    lines.push(`goalposts: warming up (${tw.flatHours ?? "?"}h history)`);
  }

  const income = state.income ?? {};
  const perSec = income.perSec;
  const trend = income.trend;
  if (perSec === undefined || perSec === null) {
    lines.push("income (warming up)");
  } else if (trend === undefined || trend === null) {
    lines.push(`income $${fmtNum(perSec)}/s (warming up)`);
  } else {
    const mins = Math.round((income.windowMs ?? DEFAULT_GOAL_WINDOW_MS) / 60_000);
    lines.push(`income $${fmtNum(perSec)}/s ${trend} (${mins}m)`);
  }

  const next = state.nextAug;
  if (!next || !next.aug) {
    lines.push("next: none");
  } else {
    let line = `next: ${next.aug} $${fmtNum(next.price)}`;
    if (next.phase === "awaiting-money" && next.waitingMs !== undefined && next.waitingMs !== null) {
      line += ` | waiting ${fmtElapsed(next.waitingMs)}`;
    }
    lines.push(line);
  }

  return lines;
}

/**
 * Assembles the full window: header + seven panels (S9's layout order) each
 * followed by a separator line, every emitted line hard-clamped to
 * COLUMN_BUDGET. A panel formatter that throws (a malformed record shape the
 * S7 tolerance didn't anticipate) degrades to that panel's own "unreadable"
 * line instead of taking down the whole render -- the per-panel try/catch is
 * the second layer of S7's format-step tolerance, on top of each formatter's
 * own `??` defaults.
 */
export function renderAll(states, now) {
  const lines = [clampLine(`===== dashboard @ ${new Date(now).toLocaleTimeString()} =====`, COLUMN_BUDGET)];

  // GOAL leads (Phase 32, decision 9): the "why everything below exists"
  // readout goes first, DAEMON stays the alarm surface directly under it.
  // GANG sits under DAEMON: it is the rep engine the BN2 commitment rests
  // on, and the batcher panels below it were collapsed to summaries to fund
  // the rows (2026-07-20).
  const panelSpecs = [
    { name: "GOAL", fn: goalPanel, state: states.goal },
    { name: "DAEMON", fn: daemonPanel, state: states.daemon },
    { name: "GANG", fn: (s, n) => gangPanel(s, states.gangTrend ?? null, n), state: states.gangState },
    { name: "TARGETS", fn: targetsPanel, state: states.targets },
    { name: "XP FARM", fn: xpPanel, state: states.xp },
    { name: "CLOUD", fn: cloudPanel, state: states.cloud },
    { name: "FINANCE", fn: financePanel, state: states.finance },
    { name: "TRANSACTIONS", fn: transactionsPanel, state: states.transactions },
    { name: "AUG FARMER", fn: augPanel, state: states.augfarmer },
  ];

  for (const spec of panelSpecs) {
    let panelLines;
    try {
      panelLines = spec.fn(spec.state, now);
      if (!Array.isArray(panelLines)) throw new Error("formatter returned a non-array");
    } catch {
      panelLines = [`-- ${spec.name} --`, "unreadable"];
    }
    for (const line of panelLines) lines.push(clampLine(String(line), COLUMN_BUDGET));
    lines.push("");
  }

  return lines;
}

/** Tolerant JSON reader shared by every panel source: null (missing/empty) | PARSE_FAILED (malformed) | parsed value. */
function readStateFile(ns, filename) {
  const raw = ns.read(filename);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return PARSE_FAILED;
  }
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // S11 layer 1: self-close on every death the game runs callbacks for.
  ns.atExit(() => ns.ui.closeTail());

  // S11 layer 2: any other live dashboard.js instance is a stale duplicate --
  // the new instance wins (same close-then-kill breath as killscripts.js).
  for (const proc of ns.ps("home")) {
    if (proc.filename === "dashboard.js" && proc.pid !== ns.pid) {
      ns.ui.closeTail(proc.pid);
      ns.kill(proc.pid);
    }
  }
  // S11 layer 3: a predecessor whose atExit didn't run (crash, or a
  // pre-phase-24 leftover) -- close its orphaned tail by pid.
  for (const rs of ns.getRecentScripts()) {
    if (rs.filename === "dashboard.js" && rs.pid !== ns.pid) {
      ns.ui.closeTail(rs.pid);
    }
  }

  ns.ui.openTail();
  ns.ui.moveTail(DASHBOARD_X, DASHBOARD_Y); // position only -- asserted once, dragging afterward persists (S10)

  // Gang trend history -- the dashboard samples for itself (see
  // GANG_SAMPLE_MS). Held in the loop rather than inside renderAll so every
  // panel formatter stays pure and directly testable.
  let gangSamples = [];

  while (true) {
    // Width/height/font are re-asserted every poll -- the no-wrap guarantee
    // is a function of these three only (S10); idempotent, 0 GB.
    ns.ui.resizeTail(DASHBOARD_W, DASHBOARD_H);
    ns.ui.setTailFontSize(DASHBOARD_FONT);

    const now = Date.now();
    const states = {
      daemon: readStateFile(ns, DAEMON_STATUS_FILE),
      targets: readStateFile(ns, TARGETS_RANKING_FILE),
      // Reused seam (S13): financestate.js's own tolerant reader collapses
      // both "missing" and "malformed" to null, so financePanel's
      // PARSE_FAILED branch is unreachable via this path -- it exists so the
      // formatter still passes the uniform panel-formatter test suite.
      finance: readFinanceState(ns),
      xp: readStateFile(ns, XPFARM_STATE_FILE),
      cloud: readStateFile(ns, CLOUD_STATE_FILE),
      transactions: readStateFile(ns, transactionsFileName(new Date(now))),
      augfarmer: readStateFile(ns, AUGFARMER_STATE_FILE),
      gangState: readStateFile(ns, GANG_STATE_FILE),
      goal: readStateFile(ns, GOAL_STATE_FILE),
    };

    gangSamples = pushGangSample(gangSamples, states.gangState, now);
    states.gangTrend = summarizeGangTrend(gangSamples, now);

    const rulerOn = ns.fileExists(RULER_FLAG, "home");
    const lines = renderAll(states, now);

    ns.clearLog();
    if (rulerOn) for (const line of rulerLines()) ns.print(line);
    for (const line of lines) ns.print(line);

    await ns.sleep(POLL_MS);
  }
}
