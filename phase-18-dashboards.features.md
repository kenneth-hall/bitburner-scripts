# Phase 18 features: readable, self-placing dashboard windows

**Stage:** brainstorm handoff for the spec stage (fable), per `CLAUDE.md`'s Development
workflow. Records the decisions, the rejected alternatives, and the open questions fable must
resolve. Kenneth set the direction in the 2026-07-08 brainstorm; formatting details are
delegated to implementation.

## Problem

The five in-game tail windows (`daemon.js`, `targetsmonitor.js`, `transactionsmonitor.js`,
`cloudmanager.js`, `resourcemanager.js`) are hard to read and tedious to maintain. From the
2026-07-08 screenshot (`Capture.JPG`) and the code, two mechanical root causes:

1. **Lines wrap** because windows are too *narrow* for the wide single lines each script prints
   (e.g. transactions folds `5:36:59` / `PM`; cloudmanager folds `can't afford` / `yet)`; the
   daemon folds `… power 1.31` / `| batch budget 28.08TB`; targetsmonitor's one-line-per-target
   wraps to two, so ~14 targets ≈ 28 rows).
2. **The header scrolls out of view** because content is *taller* than the window. Every
   dashboard already redraws correctly (`ns.clearLog()` + `ns.print()`, not append), but
   Bitburner auto-scrolls the log to its last line after each redraw, so when content exceeds
   the window height the `===== header =====` gets buried.

Separately, **nothing positions or sizes the windows** — each script just calls
`ns.ui.openTail()` with no geometry — so every augmentation install means re-dragging and
re-sizing all five by hand.

## Decisions (locked by Kenneth, 2026-07-08)

- **Keep multiple windows for now; single-window consolidation is a deferred "maybe"** to
  revisit *after* everything below, not part of this phase's acceptance. Its architecture notes
  are captured at the end so they aren't lost.
- **Remember the user's tweaks** — restore each window's last position/size (and font size) on
  launch, so it survives an aug install. Not a hardcoded layout.
- **Drop the quantity tracked** — apply the "status in popups, lists in logs" convention:
  shrink each window's line count; full history stays in the file logs that already exist (or
  gains one).
- **Formatting is the implementer's call** (line layout, abbreviations, widths) within the
  goals below.
- **Font size is fine as-is** — don't force a font change; just persist it if the user changes
  it (it rides along in the geometry, see below).

## Goals (acceptance-shaped)

- No dashboard line wraps at its restored default width.
- No dashboard's normal-state content is tall enough to scroll its header out of view at its
  restored default height.
- After a daemon restart (the stand-in for an aug install — same window teardown/relaunch),
  every window reopens at the position/size/font the user last left it, with no manual
  dragging.
- The verbose per-tick lists move to file logs (or shrink to a few entries); the popups read as
  live status.

## Work, in the order Kenneth wants it

### Layer 1 — managed tail geometry (foundational, do first)

The highest-leverage fix and independent of window count. The game exposes (verified in
`markdown/`): `ns.ui.openTail`, `moveTail(x, y, pid?)`, `resizeTail(w, h, pid?)`,
`setTailTitle(title, pid?)`, `setTailFontSize(px, …)` — **all 0 GB** — plus
`ns.getRunningScript(pid?).tailProperties` → `{x, y, width, height, fontSize, minimized}` and
`ns.ui.windowSize()`. **RAM caveat:** `getRunningScript()` costs **0.3 GB** (the only non-free
piece); it accepts a **pid**, and `moveTail`/`resizeTail` also take a pid — so one script can
read and place *every* window (see the centralized-vs-self-managed fork in Open Questions).

Behavior:
- **Restore on launch:** open the window, then move/resize/set-font to the saved geometry for
  that window. On first run (no saved geometry) compute a sensible non-overlapping default from
  `ns.ui.windowSize()`.
- **Persist tweaks:** detect when the user has moved/resized/re-fonted a window (compare live
  `tailProperties` to the last-applied values) and save the new geometry to a layout file, so
  it comes back next launch. `fontSize` persists automatically as part of this — that's the
  whole font story.
- Throttle saves so this doesn't rewrite the layout file every poll (change-detected + a
  minimum interval).

### Layer 2 — content pass (apply the convention, stop the wrap/scroll)

Per-window intent (exact line formatting delegated):

| Window | Change |
|---|---|
| **transactionsmonitor** | Drop the 20-entry list (`DISPLAY_COUNT`) to totals + last ~3. Full history already lives in `transactions-YYYY-MM-DD.json`. Shorten the per-entry timestamp to time-only (kills the `PM` wrap); keep full timestamps in the file. **The income-writer logic stays untouched.** |
| **targetsmonitor** | Show the top ~5 by score + `(+N more)`; the daemon window already shows the *active* member set, so the full ranking is reference. Optionally export the full ranking to a periodic log (open question). |
| **daemon** | Keep the fleet-status lines and the active-member list (that *is* the status). Demote the per-tick spam — `prep … dispatched`, `INFO … skipped (saturated)`, `skipped/shrunk` counters, `last launch` detail — to the log (most already exists as `daemon-batch-log.json` events, so this is largely "stop printing what's already logged"). Keep genuine WARNs inline (empty-pipeline skip, failed launches, zero-member stall). Trim wide lines so nothing wraps. |
| **cloudmanager / resourcemanager** | Already short status. Reformat so the `next` / `last upgrade` / `bootstrap` lines stop wrapping (trim timestamps/labels). No structural change. |

### Layer 3 — single condensed window (DEFERRED / "maybe", after Layers 1–2)

Explicitly **out of scope for this phase's acceptance.** Revisit only if, after Layers 1–2,
five self-placing tidy windows still feel like too many. Captured so it isn't re-derived:

- It's not a formatting change — it needs one **renderer** script reading the others' state
  files (`finance-state.json` exists; the daemon writes `daemon-batch-log.json` snapshots;
  transactions has its daily file). `transactionsmonitor` is the income **writer** and
  `targetsmonitor` runs the expensive `getTargets` analysis, so going single-window means
  splitting those into **headless** workers (keep writing/analyzing, drop their tails) and
  adding a `dashboard.js` that renders the unified view.
- A centralized Layer-1 window manager (below) is a natural stepping stone toward this.

## Rejected alternatives

- **"Scroll the log back to top" control** — the game exposes no such API; fixed instead by
  keeping content shorter than the window (Layer 2).
- **Hardcoded fixed layout** — rejected; Kenneth wants his manual tweaks remembered
  (persistence).
- **Consolidate to one window now** — deferred to Layer 3 per Kenneth ("a maybe, at the end").
- **Force a larger font** — rejected; current font is fine, only persist user changes.

## Open questions for fable

1. **Centralized vs. self-managed geometry (RAM-driven).** `getRunningScript()` is 0.3 GB and
   pid-addressable, and `moveTail`/`resizeTail` take a pid — so a *single* window-manager
   (owning the layout file, placing every window by pid) pays 0.3 GB **once**, vs. each of ~5
   dashboards self-managing at 0.3 GB **each** (~1.5 GB on contested home RAM). Lean:
   centralized manager (cheaper, and a stepping stone to Layer 3). Fable to confirm it can
   reliably enumerate the dashboard pids (daemon launches them, so it knows them) and that
   moving/sizing by pid works before the target window has finished opening.
2. **Layout file shape/concurrency.** One shared file keyed by script name (synchronous
   read-modify-write, translog-style — lost updates self-heal since geometry is re-detected next
   poll) vs. per-script files (zero contention). Moot if Layer 1 is centralized (single writer);
   decide alongside Q1.
3. **First-run default layout** algorithm from `ns.ui.windowSize()` — how to tile N windows
   without overlap across resolutions.
4. **Save cadence / change threshold** — how to detect "the user moved it" without thrashing
   the file, and without a 1px jitter counting as a change.
5. **daemon member list height** — the active set can be ~14 members; show all (and size the
   default window tall enough) or cap at top-N + `(+N more)`? It's the core status, so lean
   show-all with a default height that fits, but verify against the no-scroll goal.
6. **targetsmonitor full-ranking export** — worth writing the whole ranking to a
   `targets-summary`-style log periodically now that the popup only shows top-5, or leave the
   full list unlogged?
7. **Timing/race on restore** — does move/resize applied immediately after `openTail` land
   reliably, or is `ns.ui.renderTail(pid)` needed first? Verify live.

## Validation expectations (for the spec to make concrete)

- **Live/visual is the primary gate** (this is a UI feature): confirm in-game that (a) no window
  wraps at restored default size, (b) no header scrolls out of view in normal operation, (c)
  after a daemon restart every window returns to the last position/size/font, and (d) a manual
  drag/resize is remembered across the next restart. Say so explicitly — much of this is
  live-only.
- **`npm test`** for the pure helpers: default-layout math, change-detection/throttle logic,
  layout-file load/save (round-trip + malformed/missing file), and any list-truncation/format
  helpers factored out to be testable.
- **RAM gate** — touches `daemon.js` + the four monitors (+ a new shared helper/manager);
  confirm the 0.3 GB `getRunningScript` cost lands where the design intends (once, if
  centralized) and nowhere else.
- `npm run verify:log` if any new log/check is added (e.g. a targets-ranking export).
