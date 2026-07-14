# Phase 24 features: single condensed dashboard window

**Stage:** brainstorm handoff for the spec stage (fable), per `CLAUDE.md`'s Development
workflow. Records the decisions, the rejected alternatives, and the open questions fable must
resolve. Kenneth set the direction in the 2026-07-14 brainstorm; exact line formatting is
delegated to implementation.

This is **Phase 18 Layer 3**, deferred there with the trigger *"revisit only if five
self-placing tidy windows still feel like too many."* The trigger fired: we're at **seven**
standing windows (`daemon`, `targetsmonitor`, `transactionsmonitor`, `cloudmanager`,
`resourcemanager`, `xpfarm`, `augfarmer`). Layers 1–2 shipped (geometry persistence + a content
pass); this collapses all seven into one.

## Problem

Seven tail windows is back to the sprawl Phase 18 set out to tame — too many to place, read,
and keep tidy across every aug install. Consolidating to one window is not a formatting change:
it's an architecture change (headless workers + a renderer). See Decisions.

## Decisions (locked by Kenneth, 2026-07-14)

### Window & sizing
- **One window, all seven feeds.** `dashboard.js` is the sole standing tail. Every current
  companion goes **headless** (keeps computing/writing, drops its own tail) — daemon included.
  It is *dashboard-only*, not "daemon + dashboard."
- **Hardcoded size on all three axes:** width **891**, height **1262**, font **16** — the
  daemon window's current geometry (`logs/tail-layout.json`, read live 2026-07-14), adopted as
  the maximum dashboard space. This is the ceiling; content must fit with **no scrolling**.
- **The dashboard opts out of resize-persistence.** It **re-asserts** its hardcoded geometry on
  every launch and overrides manual resizing. Rationale: the no-wrap guarantee is really a
  *column-budget* guarantee, and column budget = f(width, font); pinning both makes it provable
  and testable. Kenneth accepts losing "remember where I dragged it" for this window because a
  **collapse button** covers the get-it-out-of-the-way need. (Contrast the other six under
  Phase 18, which *did* persist manual tweaks — this window deliberately does not.)

### Layout & formatting
- **No word wrapping, ever.** The renderer never hands the game a string longer than the column
  budget. A data feed that needs two lines emits **two intentional strings** (e.g. label/context
  on line 1, indented values on line 2), each independently within budget — never a soft wrap
  into a new line.
- **Column budget is a fixed constant** (~88 cols at 891px/font-16; exact value the
  implementer's call, measured live). Every emitted line is `≤ budget`, enforced by a test.
- **Sub-panel entry cap: no more than 3 tracked entries per panel.** For any panel that lists
  entries (targets, transactions, aug deficits, …): show the **top 3**, **highest-KPI first,
  sorted descending**, with a `(+N more)` tail if truncated. Full lists stay in the file logs
  that already exist. KPI/scalar panels (fleet util, finance reserve, xp/sec) show their headline
  numbers and aren't subject to the 3-entry cap (they have no list).
- **Formatting details delegated** (per-panel line layout, abbreviations, column widths, whether
  to use one tall column or two side-by-side within the 88-col width) — within the goals below.

### Exactly-one-popup rule (locked)
- **At most one dashboard tail is ever alive — active or not.** Bitburner leaves a killed
  script's tail open (reverting its title to the filename), so a naive kill+relaunch orphans the
  old window; a re-asserting hardcoded window then snaps back *on top* of the orphan, which the
  user can't see, move, or close. This is a documented recurring bug (`BACKLOG.md`: ten stacked
  orphaned `daemon` tails found 2026-07-12, one frozen on a stale frame → false util reading).
- **Enforcement:** on `dashboard.js` startup, **close every existing tail matching its
  filename/title before opening its own** (post-kill any pre-existing match is a dead orphan, so
  close-all-then-open is safe — the same fix pattern already noted for the `tools/bb restart`
  bug). The spec must define this in-game (via `ns.ui`) so it holds in normal play, not only when
  Claude drives a CDP restart.

### Observability convention (new project rule, documented with this phase)
This phase surfaced a standing problem: new features frequently add popups (debug or permanent),
which is exactly what produced seven windows. New convention, to land in `CLAUDE.md` at close-out:

> **Observability convention.** New features emit observations to a **log file** by default —
> non-lossy and Claude-readable via the viteburner bridge without a paste. **Dashboard space is
> gated:** a panel, indicator, or status line is added to `dashboard.js` only via a brainstorm
> decision ("do we get value from surfacing this?"), never silently — the window is a
> fixed-budget, no-wrap, single-instance surface, so ad-hoc writes would break the very
> guarantees it exists to provide. Spawning a **new standalone popup** is the anti-pattern this
> replaces. (A throwaway `tprint` probe during development is fine — it's ephemeral debugging,
> not a feature emitting observations.)

The crisp form Kenneth signed off on: **"use dashboard or logs."** Temporary ad-hoc dashboard
output was explicitly **dropped** (considered and rejected — see Rejected alternatives): it would
let any feature bust the column budget and defeat the no-wrap test.

## Goals (acceptance-shaped)

- One standing tail window (`dashboard.js`); the other seven scripts run headless.
- The window opens at 891×1262, font 16, and re-asserts that on every launch regardless of prior
  manual resize.
- **No line wraps** and **nothing scrolls** in normal operation at that fixed size.
- Each list-type panel shows ≤3 entries, highest-value first, descending, with `(+N more)` when
  truncated.
- After a daemon restart (stand-in for an aug install), **exactly one** dashboard tail exists —
  no orphan hidden behind it.
- Every panel's data comes from an on-disk state file; no panel recomputes expensive analysis
  inside the renderer.

## Work (headless conversions + renderer)

State-file landscape (verified 2026-07-14):

| Companion | Status on disk today | Conversion |
|---|---|---|
| **resourcemanager** | `finance-state.json` (+ `finance-log.json`) | headless only (drop tail) |
| **xpfarm** | `xpfarm-log.json` | headless only |
| **augfarmer** | `augfarmer-state.json` (+ catalog/reserve) | headless only |
| **daemon** | `daemon-batch-log.json` = **event log, not a status snapshot** | headless + **verify/add** a status snapshot the renderer can read (util, power, batch budget, active-member set) |
| **transactionsmonitor** | writes the daily `transactions-YYYY-MM-DD.json` (it's the income **writer**) | headless — keep the writer, drop the tail; renderer derives totals/last-3 from the daily file (or a small summary state) |
| **targetsmonitor** | **tail-only** — runs the expensive `getTargets` ranking live, persists nothing | **headless split** — the ranking analysis must write to a file; renderer reads top-3 |
| **cloudmanager** | **tail-only** — no state persisted | **add a small state-file write** (next upgrade / last buy / bootstrap status) |

New: **`dashboard.js`** — the single renderer. Reads the seven state files, formats to the fixed
column budget, redraws with `ns.clearLog()` + `ns.print()` (same non-append pattern the current
dashboards use), enforces the exactly-one-popup rule on startup.

**Likely retirement: `tailmanager.js` + `tail-layout.json`.** Phase 18's geometry-persistence
system exists solely to place and remember seven windows. With one hardcoded, self-asserting,
persistence-opted-out window, there is nothing left for it to manage. Expect this phase to delete
`tailmanager.js`, remove `tail-layout.json`, and drop the daemon's launch of tailmanager. (Open
question below: is there any residual value — e.g. font persistence — worth keeping? Lean no.)

**Launch wiring:** `daemon.js` currently opens its own tail and launches the companions +
tailmanager. It should instead launch the seven headless workers + `dashboard.js`, and open no
tail of its own.

## Rejected alternatives

- **Dynamic window sizing / responsive column budget** — rejected. A status window has no reason
  to be responsive, and recomputing columns from pixel width per resize is exactly where wrap
  bugs live (font-metric estimates drift, lines spill, bug only reproduces at some sizes).
  Hardcoding all three axes makes the no-wrap guarantee provable and testable. (Kenneth's
  instinct; confirmed against the tradeoff.)
- **Keep the dashboard in the resize-persistence system** — rejected for this window; a
  re-asserting fixed size is what guarantees no-wrap. The collapse button covers get-it-out-of-
  the-way.
- **Temporary/ad-hoc dashboard output as a debug fallback** — rejected. Free-injected lines can
  exceed the column budget and reintroduce wrap, and the no-wrap test can't cover lines it
  doesn't know about. Debug goes to logs (or a throwaway `tprint`); anything wanting dashboard
  space goes through the brainstorm gate.
- **daemon keeps its own tail, dashboard absorbs the other six** — rejected. "Exactly one popup"
  means daemon goes headless too; two windows is just a smaller sprawl.
- **Soft-wrapping long feeds** — rejected by the no-wrap rule; two-line feeds are formatted
  intentionally.

## Open questions for fable

1. **daemon status snapshot.** Does `daemon-batch-log.json` already carry everything the daemon
   tail shows (fleet util, share power, batch budget, active-member set), or does daemon need a
   dedicated `daemon-status.json` snapshot write for the renderer? Verify against the current tail
   content; lean toward a purpose-built snapshot so the renderer isn't parsing an event log.
2. **targetsmonitor split shape.** Where does the `getTargets` ranking get written — a new
   `targets-ranking.json` the (now headless) targetsmonitor writes each poll, and the renderer
   reads top-3? Confirm the analysis cadence/RAM doesn't change by dropping the tail.
3. **cloudmanager state file.** What minimal fields does the cloud panel need (next upgrade target
   + cost, last purchase, "can't afford yet")? Define the small state write.
4. **transactions summary source.** Renderer computes totals + last-3 from the daily
   `transactions-YYYY-MM-DD.json` directly, or does transactionsmonitor write a tiny summary
   state? Lean: read the daily file (no new writer), but confirm size/parse cost per poll.
5. **Column budget exact value + panel layout.** Measure the real char-per-line at 891px/font-16
   live; decide one tall column vs. two side-by-side within 88 cols; lay out the seven panels so
   the total fits in ~60 rows with no scroll. Which panels are KPI-scalar vs. list (3-entry cap)?
6. **Exactly-one-popup mechanism in-game.** Confirm the `ns.ui` surface can enumerate + close
   pre-existing tails matching `dashboard.js` on startup (so it holds in normal play, not just via
   CDP). If `ns.ui` can't close a *dead* orphan's tail by title, define the fallback.
7. **tailmanager retirement.** Confirm nothing else depends on `tailmanager.js` /
   `tail-layout.json`; delete both, or is any piece (e.g. persisting the user's font choice) worth
   salvaging? Lean: full retirement.
8. **Render cadence.** Poll interval for the renderer (the seven state files update at their own
   rates); pick something that feels live without thrashing reads.

## Validation expectations (for the spec to make concrete)

- **Live/visual is the primary gate** (UI feature): confirm in-game that (a) no line wraps and
  nothing scrolls at 891×1262/font-16, (b) the window re-asserts its size after a manual resize +
  daemon restart, (c) after a restart **exactly one** dashboard tail exists (no hidden orphan —
  check via `tools/bb` `aria`/`shot`), (d) every panel shows live data from its state file, ≤3
  entries where applicable. Much of this is live-only; say so.
- **`npm test`** for the pure helpers: the column-budget/line-length guard (assert every rendered
  line ≤ budget across representative state fixtures), the 3-entry truncation + descending sort,
  and each panel's state-file → line formatting (round-trip + missing/malformed file).
- **RAM gate** — touches `daemon.js`, all seven companions (headless conversions), a new
  `dashboard.js`, and deletes `tailmanager.js`. Confirm the net RAM change and that no expensive
  call (e.g. `getTargets`) moved into the renderer.
- **Close-out doc sweep** — land the observability convention in `CLAUDE.md`; confirm no stale
  popup/window-sizing rule contradicts the fixed-dashboard model (2026-07-14 check: CLAUDE.md's
  popup mentions are all CDP-driving mechanics, still valid; the "status in popups, lists in logs"
  phrasing lives only in the Phase 18 features doc, not the instructions — nothing to retract).
