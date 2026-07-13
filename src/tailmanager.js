// Phase 18: owns every dashboard tail window's geometry -- restores saved
// position/size/font/minimized on launch, persists Kenneth's manual tweaks to
// TAIL_LAYOUT_FILE. Never opens or closes a window itself (each dashboard
// opens its own tail via ns.ui.openTail()); this script is headless, no tail
// of its own. Centralized rather than each dashboard self-managing, so the
// 0.3GB getRunningScript cost (see markdown/bitburner.ns.getrunningscript.md)
// is paid once instead of once per window, and so there's a single writer to
// the layout file (no read-modify-write hazard). Cheap ns surface throughout:
// getRunningScript, ns.ui.* (all 0GB per markdown/bitburner.userinterface.*.md),
// ns.read/ns.write/ns.sleep.

const POLL_MS = 1000;

export const TAIL_LAYOUT_FILE = "tail-layout.json";
export const GEOMETRY_EPSILON_PX = 2;

// Exactly the standing dashboard companions daemon.js launches at startup
// (five through Phase 18, plus Phase 20's xpfarm.js). bootstrap.js/
// procureprograms.js/launchmonitor.js are deliberately excluded --
// transient/manual tails, not standing dashboards (features doc).
export const MANAGED_TAILS = [
  { script: "daemon.js", title: "daemon", defaultW: 840, defaultH: 420 },
  { script: "targetsmonitor.js", title: "targets", defaultW: 760, defaultH: 220 },
  { script: "transactionsmonitor.js", title: "transactions", defaultW: 560, defaultH: 180 },
  { script: "cloudmanager.js", title: "cloud manager", defaultW: 560, defaultH: 200 },
  { script: "resourcemanager.js", title: "resource manager", defaultW: 560, defaultH: 180 },
  { script: "xpfarm.js", title: "xp farm", defaultW: 560, defaultH: 200 },
];

const LAYOUT_MARGIN_PX = 8;

/**
 * Pure. First-run default layout: tiles `entries` (MANAGED_TAILS-shaped) in a
 * column stacked against the right edge of the game window, top to bottom,
 * starting a new column further left when the current one would overflow
 * gameH. Deterministic -- no ns, no randomness. Only used to fill windows
 * that have no saved geometry yet; persistence takes over after that.
 * @param {number} gameW
 * @param {number} gameH
 * @param {{script: string, defaultW: number, defaultH: number}[]} entries
 * @returns {Record<string, {x: number, y: number, width: number, height: number}>}
 */
export function computeDefaultLayout(gameW, gameH, entries) {
  const layout = {};
  let columnX = gameW;
  let y = LAYOUT_MARGIN_PX;
  let columnWidth = 0;

  for (const entry of entries) {
    if (y + entry.defaultH > gameH && y > LAYOUT_MARGIN_PX) {
      // Current column is full -- start a new one to the left of it.
      columnX -= columnWidth + LAYOUT_MARGIN_PX;
      y = LAYOUT_MARGIN_PX;
      columnWidth = 0;
    }
    const x = columnX - entry.defaultW - LAYOUT_MARGIN_PX;
    layout[entry.script] = { x, y, width: entry.defaultW, height: entry.defaultH };
    y += entry.defaultH + LAYOUT_MARGIN_PX;
    columnWidth = Math.max(columnWidth, entry.defaultW);
  }

  return layout;
}

/**
 * Pure. Parses TAIL_LAYOUT_FILE's raw contents -- empty/malformed/non-object
 * JSON all collapse to {} (treated as "no saved layout yet"), never throws.
 * Unknown script keys and missing per-window fields are tolerated by callers
 * (a window with no saved entry, or a partial entry, falls back to the
 * computed default for whatever's missing).
 * @param {string} raw
 * @returns {Record<string, object>}
 */
export function parseLayoutFile(raw) {
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed;
}

function differsBeyondEpsilon(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return true;
  return Math.abs(a - b) >= GEOMETRY_EPSILON_PX;
}

/** Pure. True iff two geometry objects' x/y/width/height all match within GEOMETRY_EPSILON_PX. */
function geometryMatches(a, b) {
  if (!a || !b) return false;
  return !differsBeyondEpsilon(a.x, b.x) && !differsBeyondEpsilon(a.y, b.y) && !differsBeyondEpsilon(a.width, b.width) && !differsBeyondEpsilon(a.height, b.height);
}

/**
 * Pure decision core for one managed window, one poll. saved/live/prevLive
 * are geometry objects shaped {x, y, width, height, fontSize?, minimized?};
 * live/prevLive are null when the window is closed (script not running, or
 * has no tail open) or on the manager's first poll. mode is this window's
 * carried state, "RESTORING" | "TRACKING" -- the caller holds mode (and
 * prevLive) across polls and feeds back nextMode; this function itself is
 * stateless.
 *
 * Mode lifecycle: every window starts RESTORING. The only transition to
 * TRACKING is a poll where live matches saved within epsilon (the restore
 * stuck). Any live === null poll resets to RESTORING, so a window the user
 * closes and later re-tails snaps back to its saved geometry before tracking
 * resumes, rather than picking up wherever the freshly-reopened window
 * happened to land.
 *
 * While RESTORING, keep pushing `saved` every poll until it sticks (handles
 * "does moveTail land before the window finishes opening" without a
 * one-shot race -- see phase-18 spec S7). While TRACKING, a live geometry
 * that differs from saved AND has settled (matches prevLive within epsilon --
 * i.e. the drag has stopped) is adopted as the new saved value; an
 * in-progress drag (live !== prevLive) is left alone so mid-drag frames never
 * get written. The caller MUST fold a non-null `save` back into its own
 * `saved` before the next call -- that's what prevents immediately
 * re-diverging from the just-adopted value and (with mode already TRACKING)
 * re-entering RESTORING against the user's own drag.
 *
 * Minimized guard: while live.minimized is true, x/y/width/height diffs are
 * ignored in both modes (the minimized title-bar's geometry is not a tweak
 * and not a restore target); only the minimized flag itself is compared,
 * applied, and saved in that state.
 * @param {object|null} saved
 * @param {object|null} live
 * @param {object|null} prevLive
 * @param {"RESTORING"|"TRACKING"} mode
 * @returns {{apply: object|null, save: object|null, nextMode: "RESTORING"|"TRACKING"}}
 */
export function reconcileTick(saved, live, prevLive, mode) {
  if (live === null || live === undefined) {
    return { apply: null, save: null, nextMode: "RESTORING" };
  }

  if (live.minimized) {
    if (saved && saved.minimized !== live.minimized) {
      return { apply: null, save: { ...saved, minimized: live.minimized }, nextMode: mode };
    }
    return { apply: null, save: null, nextMode: mode };
  }

  if (mode === "RESTORING") {
    if (geometryMatches(live, saved)) {
      return { apply: null, save: null, nextMode: "TRACKING" };
    }
    return { apply: saved, save: null, nextMode: "RESTORING" };
  }

  // mode === "TRACKING": adopt a settled user tweak (live differs from saved,
  // and live === prevLive means the drag/resize has stopped). An in-progress
  // drag (live !== prevLive) is left alone so mid-drag frames never get saved.
  if (!geometryMatches(live, saved) && geometryMatches(live, prevLive)) {
    const save = { x: live.x, y: live.y, width: live.width, height: live.height, fontSize: live.fontSize, minimized: live.minimized };
    return { apply: null, save, nextMode: "TRACKING" };
  }
  return { apply: null, save: null, nextMode: "TRACKING" };
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  // Deliberately headless -- no ns.ui.openTail() here (see header charter).

  const layout = parseLayoutFile(ns.read(TAIL_LAYOUT_FILE));
  const [gameW, gameH] = ns.ui.windowSize();
  const defaults = computeDefaultLayout(gameW, gameH, MANAGED_TAILS);
  for (const entry of MANAGED_TAILS) {
    if (!layout[entry.script]) layout[entry.script] = defaults[entry.script];
  }

  const modeByScript = new Map(MANAGED_TAILS.map((e) => [e.script, "RESTORING"]));
  const prevLiveByScript = new Map(MANAGED_TAILS.map((e) => [e.script, null]));
  const titledByScript = new Map(MANAGED_TAILS.map((e) => [e.script, false]));

  while (true) {
    let dirty = false;

    for (const entry of MANAGED_TAILS) {
      const rs = ns.getRunningScript(entry.script, "home");
      const live = rs?.tailProperties ?? null;
      const saved = layout[entry.script];
      const mode = modeByScript.get(entry.script);
      const prevLive = prevLiveByScript.get(entry.script);

      const { apply, save, nextMode } = reconcileTick(saved, live, prevLive, mode);

      if (apply) {
        ns.ui.moveTail(apply.x, apply.y, rs.pid);
        ns.ui.resizeTail(apply.width, apply.height, rs.pid);
        if (apply.fontSize !== undefined) ns.ui.setTailFontSize(apply.fontSize, rs.pid);
        if (apply.minimized !== undefined) ns.ui.setTailMinimized(apply.minimized, rs.pid);
        if (!titledByScript.get(entry.script)) {
          ns.ui.setTailTitle(entry.title, rs.pid);
          titledByScript.set(entry.script, true);
        }
      }

      if (save) {
        layout[entry.script] = save;
        dirty = true;
      }

      modeByScript.set(entry.script, nextMode);
      prevLiveByScript.set(entry.script, live);
      if (live === null) titledByScript.set(entry.script, false); // re-title on the next restore after a reopen
    }

    if (dirty) {
      ns.write(TAIL_LAYOUT_FILE, JSON.stringify(layout, null, 2), "w");
    }

    await ns.sleep(POLL_MS);
  }
}
