# Phase 24 spec: single condensed dashboard window (`dashboard.js`)

## Context

Work in `C:\Users\admin\bitburner-scripts`. Requirements: `phase-24-dashboard.features.md` —
read it first; this spec assumes it, including the locked decisions (one window / all seven
feeds headless / hardcoded 891×1262 font 16 / no-wrap column budget / ≤3-entry panel cap /
exactly-one-popup / the observability convention landing in `CLAUDE.md` at close-out). This is
Phase 18 Layer 3: Layers 1–2 (geometry persistence + content pass) shipped; this collapses the
seven standing tails (`daemon`, `targetsmonitor`, `transactionsmonitor`, `cloudmanager`,
`resourcemanager`, `xpfarm`, `augfarmer`) into one renderer window and retires the
geometry-persistence system it obsoletes.

What ships: one new renderer `src/dashboard.js` (the only standing tail), headless conversions
of all seven companions (each keeps computing and writing; none opens a tail), three new small
state writes (`daemon-status.json`, `targets-ranking.json`, `cloud-state.json`) plus one flagged
addition (`xpfarm-state.json`), deletion of `tailmanager.js` + its test + its launch line +
`tail-layout.json`'s export line, `vite.config.ts` export lines for the new state files, vitest
coverage for every pure formatter/builder, a new `verify:log` shape check, and the doc
reconciliations (CLAUDE.md observability convention + auto-restart section, `docs/scripts.md`,
BACKLOG/CHANGELOG).

**Audience note:** the implementer does everything marked **[code]**. Kenneth does everything
marked **[live]** — except daemon restarts and story-popup dismissal, which CLAUDE.md
pre-authorizes Claude to do over CDP. No [live] step requires editing code; the two post-live
[code] steps (recording the calibrated column budget and the measured RAM figures) are
constant/comment edits.

## Ground rules

- `CLAUDE.md` rules apply. `ns` surface verified against `markdown/` and live call sites during
  spec drafting: `ns.ui.openTail()` / `closeTail(pid?)` / `moveTail(x, y, pid?)` /
  `resizeTail(w, h, pid?)` / `setTailFontSize(px, …)` / `setTailMinimized(min, pid?)` — all 0 GB
  (`markdown/bitburner.userinterface.*.md`; pid-form usage proven live in `tailmanager.js` and
  `killscripts.js`); `ns.atExit(f)` 0 GB; `ns.getRecentScripts()` 0.2 GB (returns most recent
  first; `RecentScript` extends `RunningScript`, so `pid`/`filename` are documented in
  `markdown/bitburner.runningscript.md` — `bitburner.recentscript.md` itself only adds
  `timeOfDeath`); `ns.ps(host)` 0.2 GB; `ns.kill`
  0.5 GB; `ns.read`/`ns.write`/`ns.print`/`ns.clearLog` 0 GB. `ns.format.number`/`ns.format.ram`
  per this build (never `ns.formatNumber`). No Singularity calls anywhere in this phase.
- **No spend, no transactions-log changes.** Nothing here buys anything; `recordTransaction`
  call sites are untouched.
- **No batcher changes.** `daemon.js` loses its `openTail`, swaps the `tailmanager.js` launch
  line for `dashboard.js`, and gains the status-file write. Scheduler/sampling/targets/workers,
  `HOME_RESERVE_GB`, batch logic, and the `daemon-batch-log.json` event schema are untouched
  (`xpfarm.js`'s claim reader depends on that schema).
- **Headless ≠ silent.** Every converted companion keeps its `ns.clearLog()`/`ns.print` status
  block verbatim — a manual in-game `tail <script>` during debugging still shows live status for
  free, and the diff per companion stays one line (the removed `ns.ui.openTail()`). *(Flagged
  interpretation: the features file says "drops its own tail," which this satisfies; the print
  blocks are invisible until someone deliberately tails.)*
- **Identifier hygiene:** no standalone identifier aliases an ns method name; no literal
  `".exec("` outside `ns.exec` call sites (cloudmanager's `String.match` lesson). Pre-checked
  clean: `COLUMN_BUDGET`, `ROW_BUDGET`, `DASHBOARD_W/H/X/Y/FONT`, `clampLine`, `capEntries`,
  `panelLines`, `buildDaemonStatus`, `buildTargetsRanking`, `buildCloudState`, `buildXpState`,
  `readStateFile`, `RULER_FLAG`.
- Branch `phase24-dashboard` off `master`. `npm test` the implementer runs and clears; RAM
  readings and the visual/live gates are Kenneth's (daemon restarts are Claude-over-CDP,
  pre-authorized). BACKLOG/CHANGELOG edits ride the same branch. Before merging back, run the
  CLAUDE.md worktree checks (`git log HEAD..master`).

## Spec-stage decisions

Resolves the features file's eight open questions (Q1–Q8) plus the judgment calls it delegated.

- **S1 — Renderer poll: 1 s (Q8).** `targetsmonitor` and `transactionsmonitor` already redraw
  at 1 s today, so "feels live" is calibrated at 1 s; every read is 0 GB and every file parsed
  per poll is small by construction (S2–S6 keep ring logs out of the render path). Per-panel
  staleness thresholds derive from each writer's cadence (S7 table), not from the render poll.
- **S2 — daemon gets a dedicated `daemon-status.json`, written every tick (Q1).**
  `daemon-batch-log.json` is a 2000-entry ring of events; its `snapshot` events fire only once
  per `CYCLE_MS` (10 s) and lack tail-only state (math mode, hosts count, share-OFF flag,
  per-tick WARNs). Parsing a ring log every render poll is exactly the "renderer recomputes"
  anti-pattern the features forbid. Instead the daemon's step-8 display block also assembles a
  small status record (a pure exported `buildDaemonStatus(...)` over values already computed:
  math mode, fleet/budget/hosts/targets/util, members with the per-member display fields,
  draining, share block incl. OFF state, waterfall free + prepping list, stall/skip/failed-launch
  warns) and `ns.write`s it (`"w"` mode, 0 GB) each tick. The record carries **all** seated
  members (the renderer applies the 3-cap; the file is the offline evidence, so it keeps the
  full set). The early "No eligible targets" branch writes the **same shape with empty/null
  values** — every key present, list fields `[]`, scalars `0`/`null`, plus `noTargets: true` —
  never a shape with keys missing, so a fresh node renders a live "no eligible targets" panel
  rather than a stale one. The event log and its schema are untouched.
- **S3 — targetsmonitor goes headless and writes `targets-ranking.json` each live refresh
  (Q2).** Both cadences survive unchanged: full `getTargets` re-rank per `TARGETS_CYCLE_MS`
  (10 s), cheap live sec/money re-read per `LIVE_REFRESH_MS` (1 s). Each live refresh writes
  `{ timestamp, time, totalCount, targets: [top 5 × { server, prepped, sec, minSec, money,
  maxMoney, score }] }` (top 5, not 3 — the file keeps a little more than the panel shows, for
  log value at zero cost). RAM is unchanged (drops a 0 GB `openTail`, adds a 0 GB `write`);
  the expensive analysis stays exactly where it is. The renderer reads top 3, `(+N more)` from
  `totalCount`.
- **S4 — cloudmanager writes `cloud-state.json` per poll (Q3).** Fields — all already computed
  for the tail block: `{ timestamp, time, paused, financeStale, available, reserved,
  fleet: { count, minRam, maxRam, serverLimit, ramLimit } | null, next: { hostname, tier, cost,
  affordable } | null, growth: { status } | null, lastUpgrade, lastBootstrapBuy, lastGrowthBuy }`.
  The paused and finance-stale early branches write too (with their flag set), so the panel
  distinguishes "paused" from "dead". Assembled by a pure exported `buildCloudState(...)`.
- **S5 — transactions panel reads the daily `transactions-YYYY-MM-DD.json` directly; no new
  writer (Q4).** `transactionsmonitor` already re-reads and parses that file every 1 s for its
  own tail today, so the parse cost at the renderer's 1 s poll is status quo, just relocated.
  The monitor goes headless and keeps its writer role verbatim. The renderer derives — with
  the field split pinned, because income and expense records carry *different* timestamp
  fields (income: `firstTimestamp`/`lastTimestamp`; every `recordTransaction` expense:
  `timestamp` — see `translog.js` and the monitor's own display comment): today's income
  total = sum of `amount` over `type === "income"` records; expense total = sum over
  `type === "expense"`; rate = income total / minutes elapsed since the **earliest income
  record's** `firstTimestamp` (fallback to its `timestamp` if absent), **omitted entirely
  when no income record exists** — never anchored on an expense record, whose missing
  `firstTimestamp` would otherwise produce a NaN rate on a day whose first record is an
  expense; last 3 records newest-first by `lastTimestamp ?? timestamp` (recency is this
  panel's sort KPI — same semantics as today's tail). *(Noted behavior changes: the per-poll
  full-file sum replaces the monitor's incremental in-memory accumulator — new work, but 0 GB
  and bounded by translog's coalescing; and the file-sum "today" total survives monitor
  restarts, where the current in-memory total resets — strictly better. The monitor's known
  startup-gap limitation on what gets recorded is unchanged.)* No monitor-liveness
  staleness flag is possible from this file (it only changes on income) — the panel shows the
  last record's age instead of a STALE marker (S7).
- **S6 — xpfarm gains a small `xpfarm-state.json` snapshot per pass (flagged addition beyond
  the features table's "headless only").** `xpfarm-log.json` is a 2000-entry ring — the same
  parse-per-poll problem as S2, and the features' own goal line ("every panel's data comes from
  an on-disk state file; no panel recomputes expensive analysis") wins over the table's
  provisional "headless only". Each pass (all branches: off / no-target / normal) also writes
  the current pass's record — the same object already appended to the ring — as a standalone
  overwrite-in-place snapshot. One extra `ns.write` line per branch, 0 GB, zero new analysis.
- **S7 — Per-panel staleness: `max(3 × writer cadence, 15 s)`, reusing `financestate.js`'s
  `isStateStale`.** A panel whose state file is missing renders "no data yet"; unparseable →
  "unreadable"; timestamp older than its threshold → the panel's title line carries
  `STALE <age>`. Thresholds: daemon 15 s (1 s writer), targets 15 s (1 s), finance 15 s (2 s,
  matches the existing `STALE_MS` convention), xpfarm 30 s (10 s), cloud 30 s (10 s), augfarmer
  **390 s** (its state file writes on change + a 5-min heartbeat — S11 of phase 23; 6.5 min =
  heartbeat + one poll of slack), transactions: no STALE flag, last-record age shown (S5).
  **Tolerance covers the format step, not just the parse:** a record that parses but is
  missing fields the formatter iterates (a truncated write, a schema drift) must render as
  that panel's "unreadable" line, not throw — each formatter treats absent list fields as `[]`
  and absent scalars as `?`, **and** `renderAll` additionally wraps each panel's formatter
  call in a per-panel catch that substitutes the "unreadable" line, so no single record shape
  can ever take down the only window. One bad file degrades one panel only.
- **S8 — Column budget: `COLUMN_BUDGET = 88` initial, calibrated live via a flag-gated ruler
  mode; enforced three ways (Q5).** (a) Every emitted line passes through `clampLine` — a hard
  guard that truncates to budget with a trailing `…`; the formatters are designed to fit, the
  clamp makes "the renderer never hands the game a longer string" true by construction against
  hostile data (a 40-char server name can't wrap the window, it gets visibly truncated — the
  correct failure). (b) Tests assert every rendered line ≤ `COLUMN_BUDGET` across worst-case
  fixtures. (c) L2's live calibration: while `dashboard-ruler.txt` exists on home, the renderer
  prepends numbered ruler lines (lengths 80 / 84 / 88 / 92 / 96) above the panels — the one
  mode allowed to exceed budget, existing precisely to measure where the real wrap point is at
  891 px / font 16. If the measured budget ≠ 88, the constant is edited once [code] and L2
  re-runs. The ruler is a built-in calibration mode, not ad-hoc dashboard output — it renders
  nothing but rulers-above-panels, only while the flag file exists, and the flag's toggle path
  is the same as `share-off.txt`'s today.
- **S9 — Layout: one tall column; `ROW_BUDGET = 58`; per-panel row caps sum to 55 (Q5).**
  Two side-by-side columns inside 88 cols were rejected: 44 cols can't hold a daemon member
  line, and every panel would need a second, narrower format. Row arithmetic at font 16 in a
  1262 px window: ≥60 text rows; 58 is the enforced ceiling, 55 the worst-case allocation —
  header 1, daemon 12 (title+fleet, members 3 + `(+N)`, share, waterfall, stall warn, skip
  warns capped at 2 + `(+N)`, failed-launch warn), targets 5, xpfarm 6 (title/KPI + 3 targets +
  `(+1 more)` — `XP_TOP_N` is 4), cloud 6, finance 7 (title, money line, 3 reservations +
  `(+N)`, formulas-suppressed line), transactions 6, augfarmer 5 (title, phase, target,
  bought/joined, Daedalus gate), separators 7. The implementer may rebalance rows between
  panels; the test-enforced invariants are `ROW_BUDGET` on worst-case fixtures and the ≤3 entry
  cap. Every list panel sorts descending by its KPI (targets: score; members: seat order —
  already score-ranked; reservations: amount; transactions: recency; xp targets: the engine's
  own pick order) and truncates with `(+N more)`. KPI/scalar lines are exempt from the cap
  (they aren't lists). A feed needing two lines emits two intentional strings, each
  independently clamped — never a soft wrap.
- **S10 — Geometry: width/height/font re-asserted every poll; position asserted at launch
  only; minimize respected (interprets "re-asserts its hardcoded geometry… and overrides manual
  resizing").** The no-wrap guarantee is a function of **width and font** (and no-scroll of
  height), so those three are blindly re-asserted each poll (`resizeTail(891, 1262)`,
  `setTailFontSize(16)` — 0 GB, idempotent, no `getRunningScript` needed). Position does not
  affect the column budget, so dragging is allowed: `moveTail(DASHBOARD_X, DASHBOARD_Y)` fires
  once at startup (constants default `(1653, 21)` — the daemon window's live anchor; the
  exported `tail-layout.json` is stale at 874×343, so the implementer re-reads the live position
  once at implementation time and sets the constants). The collapse need is the tail's native
  minimize control; the renderer never calls `setTailMinimized`, so a collapsed dashboard stays
  collapsed (the per-poll resize updates the restored geometry without expanding — implementer
  verifies this non-expansion live in L3; if resize *does* un-minimize in this fork, gate the
  re-assert on `ns.getRunningScript()`'s `tailProperties.minimized`, +0.3 GB, same guard
  `tailmanager.js` uses today).
- **S11 — Exactly-one-popup: three layers (Q6).**
  1. **`ns.atExit(() => ns.ui.closeTail())`** registered at startup — the tail self-closes on
     every script death the game runs callbacks for (manual `kill`, killscripts' sweep, a CDP
     restart, `ns.exit`), so the orphan is prevented at the source, in normal play, with 0 GB.
  2. **Running-duplicate sweep:** on startup, `ns.ps("home")` → any other process with
     `filename === "dashboard.js"` gets `ns.ui.closeTail(pid)` + `ns.kill(pid)` (the new
     instance wins — it has the fresher code; same close-then-kill breath as `killscripts.js`).
  3. **Dead-orphan sweep:** `ns.getRecentScripts()` → every entry with
     `filename === "dashboard.js"` gets `ns.ui.closeTail(pid)` — catches a predecessor whose
     `atExit` didn't run (crash, or pre-phase leftovers). **Implementer verify:** confirm live
     that `closeTail` on a *dead* pid actually closes the orphaned window (killscripts only
     proves the close-before-kill order). If it doesn't, layer 3 is dropped, layers 1–2 stand
     (they already prevent new orphans on every normal path), and the fallback for a crashed
     orphan is documented in the header as "close it by hand / `tools/bb` — rare by
     construction"; L4's acceptance gate is unchanged either way because the paths it exercises
     go through layers 1–2.
  All three run before this instance's own `ns.ui.openTail()`. No `setTailTitle` — the title
  stays the filename, which also keeps `tools/bb`'s `restartScript` close-by-filename working.
- **S12 — tailmanager retired in full (Q7).** Delete `src/tailmanager.js` and
  `test/tailmanager.test.js`; remove the daemon's launch line and `vite.config.ts`'s
  `tail-layout.json` export line. Residual-value check performed at spec time: the only
  salvage candidate, font persistence, is moot (the one remaining window hardcodes font 16 and
  the other six have no windows), and grep shows the remaining references are docs, tests, this
  phase's features file, and `tools/bb/driver.mjs`'s comment — no code imports it. The stale
  `tail-layout.json` on home is inert; L1 removes it with a terminal `rm` [live] rather than
  paying `ns.rm`'s RAM anywhere. `tools/bb/driver.mjs`'s `restartScript` comment ("tailmanager.js
  re-docks the fresh window") is updated to describe the atExit world; the transient-tail scripts
  (`bootstrap.js`, `procureprograms.js`, `procureformulas.js`, `launchmonitor.js`,
  `backdoorfactions.js`) are **out of scope** — they keep their short-lived tails, which the
  features' "one standing tail" goal permits.
- **S13 — Every renderer source file is exported to `logs/` — the three new state files,
  xpfarm's, and now `finance-state.json` too (flagged reversal of the phase-11 precedent).**
  `finance-state.json` stayed unexported because its content was "already visible live in the
  tail"; this phase deletes that tail, and the acceptance criterion "each panel is validated
  against its exported file" would otherwise be unverifiable for the finance panel
  (`finance-log.json` only writes on reservation *change*, so the live money/available scalars
  never reach disk offline). The exports are (a) L5's evidence — each panel checked against a
  file, not a screenshot squint — and (b) the post-phase Claude-readable record the
  observability convention demands, without CDP. Five `vite.config.ts` lines:
  `daemon-status.json`, `targets-ranking.json`, `cloud-state.json`, `xpfarm-state.json`,
  `finance-state.json` → `logs/…`, comments in the existing style (the finance line's comment
  notes the precedent reversal and why). `resourcemanager.js`'s writer is unchanged.
- **S14 — `verify:log` gains a dashboard-state shape check.** New
  `test/verify-dashboard-state.test.js` in the verify config's family: for each of the five
  exported state files that is *present* in `logs/`, assert it parses and carries its required
  fields (skip-if-missing, like the run-dependent checks already in `verify-log`); assert
  `daemon-status.json`'s member count and `targets-ranking.json`'s `totalCount` are coherent
  (members ≤ totalCount is NOT asserted — different populations; just shape + finite numbers +
  timestamps). This keeps the phase's live artifacts machine-checked offline per CLAUDE.md's
  test-against-logs rule.

## Design

### Work item 1 — `src/dashboard.js` [code]

Header states: purpose (Phase 24 — the single standing tail; every companion is headless and
publishes state files; dashboard space is gated by the observability convention, see CLAUDE.md);
the S10 geometry contract (hardcoded 891×1262 font 16, size/font re-asserted per poll, position
free after launch, minimize respected); the S11 exactly-one rule and its three layers; measured
RAM (added post-live); exec'd by `daemon.js`, importable by nothing.

Constants: `DASHBOARD_W = 891`, `DASHBOARD_H = 1262`, `DASHBOARD_FONT = 16`,
`DASHBOARD_X/Y` (S10), `COLUMN_BUDGET = 88` (S8, calibrated in L2), `ROW_BUDGET = 58` (S9),
`POLL_MS = 1000` (S1), `RULER_FLAG = "dashboard-ruler.txt"`, per-panel stale thresholds (S7),
`PANEL_ENTRY_CAP = 3`.

Pure exports (unit-tested; plain data in, `string[]` out, no `ns` — formatting helpers take
pre-formatted number strings or a passed-in format function so tests don't need `ns.format`):

- `clampLine(line, budget)` — S8's hard guard (`…` truncation).
- `capEntries(entries, cap)` — returns `{ shown, moreCount }`; callers render `(+N more)`.
- One formatter per panel: `daemonPanel(state, now)`, `targetsPanel(state, now)`,
  `financePanel(state, now)`, `xpPanel(state, now)`, `cloudPanel(state, now)`,
  `transactionsPanel(entries, now)`, `augPanel(state, now)` — each handles
  `null` (missing → "no data yet"), a `parseFailed` sentinel ("unreadable"), stale (S7 title
  marker), and its worst-case row cap (S9). Two-line feeds are two intentional strings.
- `renderAll(states, now)` — assembles header + panels + separators, applies `clampLine` to
  every line, returns the full `string[]`; the test surface for `ROW_BUDGET`.
- `rulerLines()` — S8's calibration block.

Main loop: startup — S11 sweeps, `atExit` registration, `openTail()`, `moveTail`, then per
poll: re-assert size/font (S10) → read the seven sources (`readStateFile` per-panel tolerant
JSON reader; `readFinanceState` reused from `financestate.js`; today's transactions filename via
`transactionsFileName` from `translog.js` — both Singularity-free seams) → `renderAll` →
`ns.clearLog()` + print each line (ruler block prepended while `RULER_FLAG` exists) → sleep.
No tprint chatter; the renderer emits no terminal lines after launch (its job is the window).

### Work item 2 — headless conversions [code]

Each of the seven companions: delete its `ns.ui.openTail()` line, keep everything else
(including the print blocks — ground rule). Additional per-script changes:

- **`daemon.js`:** remove `ns.ui.openTail()` (line ~342); replace the `tailmanager.js` launch
  line with `launchDetached(ns, "dashboard.js");` (comment: Phase 24 — the single standing
  tail; renderer only, reads the companions' state files, ~2–3 GB); add the `buildDaemonStatus`
  pure export + `ns.write(DAEMON_STATUS_FILE, …, "w")` in the step-8 display block and the
  no-targets early branch (S2). `MEMBER_LIST_CAP` and the tail print block stay (debug view).
- **`targetsmonitor.js`:** + `buildTargetsRanking` export + the per-refresh write (S3).
- **`cloudmanager.js`:** + `buildCloudState` export + the per-poll write incl. paused/stale
  branches (S4).
- **`xpfarm.js`:** + `buildXpState` (or reuse the existing per-pass record object) + the
  snapshot write in all three branches (S6).
- **`transactionsmonitor.js`, `resourcemanager.js`, `augfarmer.js`:** openTail removal only —
  their state files already exist (daily transactions file; `finance-state.json`;
  `augfarmer-state.json`).

### Work item 3 — tailmanager retirement [code]

Per S12: delete `src/tailmanager.js`, `test/tailmanager.test.js`; remove the daemon launch line
(work item 2 swaps it) and the `tail-layout.json` line in `vite.config.ts`; update the
`tools/bb/driver.mjs` `restartScript` doc comment. Delete `logs/tail-layout.json` from the
repo working tree if present (it's an export artifact of a file that no longer exists).

### Work item 4 — `vite.config.ts` [code]

Add five export lines (S13): `daemon-status.json`, `targets-ranking.json`, `cloud-state.json`,
`xpfarm-state.json`, `finance-state.json` → `logs/…` (comments: Phase 24 — overwrite-in-place
renderer sources; exported as the panels' offline evidence; the finance line notes the
precedent reversal). Remove the `tail-layout.json` line (work item 3) and update the
long download-scope comment above the filter, which still describes finance-state.json as
deliberately unexported.

### Work item 5 — tests [code]

Vitest, existing fixture style. `test/dashboard.test.js`:

- `clampLine`: under/at/over budget; over-budget ends in `…` and is exactly budget long.
- `capEntries`: under/at/over cap; `moreCount` correct.
- Each panel formatter: representative state → expected lines, **every line ≤
  `COLUMN_BUDGET`**; missing → "no data yet"; malformed sentinel → "unreadable"; **partial
  record** (parses, but iterated/scalar fields absent — e.g. a daemon record with no `members`
  key) → renders without throwing (S7's format-step tolerance), plus a `renderAll`-level test
  that a formatter which *does* throw degrades to that panel's "unreadable" line while the
  other panels render; stale timestamp → `STALE` marker in the title line; entry cap: 4+
  entries → 3 shown descending by the panel's KPI + `(+N more)`; hostile-length fields
  (40-char hostname, huge numbers) clamp rather than wrap; two-line feeds each independently
  ≤ budget. Transactions math (S5): income-only total, expense total, rate anchored on the
  earliest income record, rate omitted when the day's records are expense-only (the
  NaN-rate regression case), fallback `timestamp` ordering.
- `renderAll` on a worst-case composite fixture (all panels at max rows, all warns firing):
  total rows ≤ `ROW_BUDGET`, every line ≤ `COLUMN_BUDGET`.
- Sort-descending property per list panel (targets by score, reservations by amount,
  transactions by recency).

Builder shape tests: `buildDaemonStatus` / `buildTargetsRanking` / `buildCloudState` /
`buildXpState` produce the S2–S4/S6 fields from representative inputs (in `daemon.test.js`,
new `targetsmonitor.test.js`, `cloudmanager.test.js`, `xpfarm.test.js` respectively).
`test/verify-dashboard-state.test.js` per S14. `test/tailmanager.test.js` deleted.

### Work item 6 — doc reconciliations [code]

- **`CLAUDE.md`:** (a) land the observability convention verbatim from the features file
  (§ "Engineering conventions"); (b) rewrite the "Auto-restart changed scripts" section's
  companion bullet — it currently says restart "closes the orphaned tail window … and
  `tailmanager.js` re-docks the fresh window", which is dead machinery after this phase; the
  new text: companions are headless (nothing to re-dock), `dashboard.js` self-closes its tail
  via `atExit`, and `restart daemon.js` remains the core-loop path.
- **`docs/scripts.md`:** add `dashboard.js`; remove `tailmanager.js`; mark the seven
  companions headless (state-file column already exists or gains the new filenames).
- **`BACKLOG.md`:** delete the "Single condensed dashboard window" idea (this ships it);
  update the "`tools/bb` `restart` never closes the daemon's orphaned tail" bug — the
  managed-title mismatch is moot (no tailmanager, no re-titling; dashboard self-closes), so
  either close it against this phase or narrow it to the transient-tail scripts if Kenneth
  wants the loop-all-matches `closeTail` fix anyway.
- **`docs/phases/CHANGELOG.md`:** dated close-out entry (notes: S6 xpfarm-state addition, S13
  export deviation, headless-keeps-prints interpretation, the calibrated column budget, which
  fallbacks fired in S10/S11 verification, measured RAM). Graduate both phase docs to
  `docs/phases/`. Staged with the work, not after.

## Live procedure [live]

Pre-step: work items 1–6 merged locally, `npm test` green, dev server healthy,
`dist/src/dashboard.js` present (standing byte-check rule).

- **L1 — Launch.** Claude restarts `daemon.js` over CDP. Confirm: exactly one new window
  ("dashboard.js") at 891×1262 font 16 at the anchor position; **zero** companion tails
  (screenshot/aria — only transient tails like procureprograms may briefly appear);
  `tailmanager.js` absent from `ps`; the four new state files exporting to `logs/`.
  `rm tail-layout.json` on home (S12). `run ramcheck.js dashboard.js` → 2–4 GB band; daemon
  and all seven companions flat vs. their header figures. Figures recorded [code, comments].
- **L2 — Column-budget calibration (the no-wrap gate's input).** Create `dashboard-ruler.txt`
  (same toggle path as `share-off.txt`); read which ruler line is the longest that doesn't
  wrap at the fixed size. If ≠ 88: edit `COLUMN_BUDGET` [code], push, re-check. Remove the
  flag. Then eyeball every panel at live data: no wrapped line, no vertical scrollbar.
- **L3 — Geometry contract.** Kenneth drags the window (allowed — stays), resizes it (snaps
  back ≤1 poll), changes font via UI if possible (snaps back), clicks the native collapse
  (stays collapsed across polls — S10's non-expansion check; if it fights, apply S10's
  `tailProperties.minimized` fallback [code] and re-run).
- **L4 — Exactly-one (the features' restart gate).** Twice: (a) Claude runs
  `node tools/bb/cli.mjs restart daemon.js`; (b) Claude kills `daemon.js` from the CDP
  terminal and re-runs it by hand. After each: exactly one dashboard window exists (aria count
  of windows whose heading matches `dashboard.js`), at the asserted geometry, live (timestamp
  ticking). Also probe S11 layer 3: with the dashboard running, `kill dashboard.js` from the
  terminal — the tail should vanish (atExit); if an orphan ever remains, note whether the next
  launch's `getRecentScripts` sweep clears it (the implementer-verify item).
- **L5 — Panel truth.** For each panel, compare against its exported `logs/` state file (or
  the daily transactions file): values match, ≤3 entries + `(+N more)` where the source has
  more, descending order. Force one staleness: `touch`-pause or kill one companion (e.g.
  `kill cloudmanager.js`) → its panel shows `STALE`/"no data" within its S7 threshold while
  every other panel keeps rendering; relaunch via daemon restart.
- **L6 — Soak.** ≥30 min: no wrap/scroll creep (spot screenshots), the window's geometry
  still asserted, no terminal chatter from the renderer, `npm run verify:log` green including
  S14's new shape checks.

## Acceptance criteria

- **`npm test` green** including work item 5's full list. [code, implementer clears]
- **No-wrap/no-scroll, proven then observed:** `COLUMN_BUDGET` calibrated in L2 and every
  rendered line test-clamped ≤ it; `renderAll` ≤ `ROW_BUDGET` on the worst-case fixture; L2/L6
  visual confirmation at 891×1262/16. [code + live]
- **Exactly one dashboard tail after both restart paths** (L4), and zero standing companion
  tails after L1. [live]
- **Geometry re-assertion observed** (L3): manual resize reverts ≤1 poll; collapse is not
  fought. [live]
- **Every panel fed from disk:** panels match their exported state files (L5); the renderer
  contains no `getTargets`/analysis import and no ns call beyond the ground-rules surface —
  checkable by reading `dashboard.js`'s import list + `ramcheck` band (an analysis import
  would blow the 2–4 GB band immediately). [live + code]
- **RAM recorded:** `logs/ramcheck-result.json` shows `dashboard.js` in 2–4 GB; daemon + seven
  companions flat vs. header figures; `tailmanager.js` gone. [live artifact + code comments]
- **`npm run verify:log` green** including `verify-dashboard-state` against real exported
  files. [live]
- **Doc reconciliations landed:** CLAUDE.md convention + auto-restart rewrite;
  `docs/scripts.md`; BACKLOG entries resolved; CHANGELOG close-out. [code, checkable by
  reading the files]

## Files touched

**New:** `src/dashboard.js`, `test/dashboard.test.js`, `test/targetsmonitor.test.js`,
`test/verify-dashboard-state.test.js`.

**Edited:** `src/daemon.js` (openTail removal, launch-line swap, status write + builder),
`src/targetsmonitor.js`, `src/cloudmanager.js`, `src/xpfarm.js` (headless + state writes),
`src/transactionsmonitor.js`, `src/resourcemanager.js`, `src/augfarmer.js` (openTail removal
only), `vite.config.ts` (+5 / −1 lines, comment update), `test/daemon.test.js`, `test/cloudmanager.test.js`,
`test/xpfarm.test.js` (builder tests), `tools/bb/driver.mjs` (comment), `CLAUDE.md`,
`docs/scripts.md`, `BACKLOG.md`, `docs/phases/CHANGELOG.md`.

**Deleted:** `src/tailmanager.js`, `test/tailmanager.test.js`, `logs/tail-layout.json`
(working-tree artifact), the in-game `tail-layout.json` (L1, terminal `rm`).

**Deliberately untouched:** the batcher core (`scheduler.js`/`sampling.js`/`targets.js`/
`hosts.js`/workers), `daemon-batch-log.json`'s schema (xpfarm's claim reader),
`translog.js`/`financestate.js` (imported seams, no new code), the transient-tail scripts
(`bootstrap.js`, `procureprograms.js`, `procureformulas.js`, `launchmonitor.js`,
`backdoorfactions.js` — S12), `killscripts.js` (its close-then-kill already does the right
thing).

## Open questions

None blocking. Three watch-items are folded into the procedure rather than left open:
(a) `closeTail` on a dead pid (S11 layer 3 — verified in L4, with a defined fallback);
(b) `resizeTail` vs. a minimized window (S10 — verified in L3, with a defined fallback);
(c) the true column budget at 891 px/font 16 (S8 — measured in L2, constant edited once).
