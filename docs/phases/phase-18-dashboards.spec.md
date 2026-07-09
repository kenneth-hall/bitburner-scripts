# Phase 18 spec: readable, self-placing dashboard windows

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner
watcher that syncs into the game). Requirements: `phase-18-dashboards.features.md` — read it
first; this spec assumes it.

Two layers ship in this phase, in order: **Layer 1**, a new `tailmanager.js` companion that
restores every dashboard window's last position/size/font on launch and persists the user's
manual tweaks to a game-side layout file; **Layer 2**, a content pass across the five dashboard
tails applying "status in popups, lists in logs" so nothing wraps at the restored default width
and no header scrolls out of view. **Layer 3 (single condensed window) is explicitly out of
scope** — deferred per the features file; nothing here may foreclose it, and the centralized
manager is deliberately the stepping stone toward it.

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked **[code]**.
Kenneth does everything marked **[live]**. No [live] step requires editing code; a failed
[live] check loops back to a [code] fix, as in prior phases.

## Ground rules

- `CLAUDE.md` rules apply in full: NS API signatures/RAM costs verified against `markdown/`
  (done for every call this spec binds to — cited inline), no community solutions, no
  game-source reading, no spoilers.
- **No Singularity calls anywhere in this phase.**
- **Transactions log: N/A** — nothing here spends money. Stated so the omission is visibly
  deliberate. `transactionsmonitor.js`'s edits are display-only; **its income-writer block
  (the read-coalesce-write section) is untouchable** — the features file locks this.
- **Log schema is frozen.** The daemon's `logEvent` calls (`skip`/`batch`/`snapshot`/`enter`/
  `exit`/`mode`/`xcheck`) are not added to, removed, or reshaped. Layer 2's "demote to log"
  means *delete the redundant `ns.print` line*; the information already lives in
  `daemon-batch-log.json`. `npm run verify:log` must stay green with zero rule changes.
- **Identifier hygiene (Phase 9/11's lesson):** no new identifier, export, or object key may
  exactly match an ns function/method name. Specifically banned for this phase's new code:
  `openTail`, `moveTail`, `resizeTail`, `setTailTitle`, `setTailFontSize`, `setTailMinimized`,
  `renderTail`, `closeTail`, `windowSize`, `getRunningScript`. The names this spec assigns
  (`TAIL_LAYOUT_FILE`, `MANAGED_TAILS`, `computeDefaultLayout`, `reconcileTick`,
  `parseLayoutFile`, `GEOMETRY_EPSILON_PX`) are pre-checked clean; re-check anything the
  implementer adds beyond them.
- Pure logic lives in exported ns-free functions, unit-tested per existing patterns
  (`test/*.test.js` house style); ns-touching code stays in `tailmanager.js`'s main loop.
- Branch `phase18-dashboards` off `master` in this checkout (the live sync *is* the
  verification loop); merge/push only after the full gate set per the ship gate.
- **Kill+restart the dev server at the start of the RAM-gate step** (standing rule), byte-check
  `dist/src/*` before trusting any reading.

## Spec-stage decisions

Resolving the features file's seven open questions:

- **S1 (features Q1) — centralized manager, as a new companion script `tailmanager.js`.**
  Not self-managed (5 × 0.3 GB `getRunningScript` ≈ 1.5 GB, and five writers to one layout
  file), and not folded into `daemon.js` (keeps the daemon's RAM exactly flat and its tick free
  of UI concerns; matches the established companion pattern; and a standalone manager is the
  natural seed of Layer 3's future `dashboard.js`). Cost: one new resident script, ~1.9 GB
  expected (1.6 base + 0.3 `getRunningScript`; every `ns.ui.*` call used is 0 GB, verified in
  `markdown/bitburner.userinterface.*.md`). The manager finds windows **by filename** via
  `ns.getRunningScript(filename, "home")` (accepts `FilenameOrPID`; all five dashboards run
  argument-less on home, so filename is unambiguous) — no `ns.ps` needed, no pid plumbing from
  `daemon.js`.
- **S2 (features Q2) — one layout file, single writer.** `tail-layout.json` on home, written
  only by `tailmanager.js` — concurrency moot. Shape: `{ "<script filename>": { x, y, width,
  height, fontSize, minimized } }`. Home files survive augmentation installs, which is the
  entire persistence story. Also exported to `logs/tail-layout.json` via a `vite.config.ts`
  download-filter line so persistence is verifiable from a file, not a screenshot (log-over-
  paste rule).
- **S3 (features Q3) — first-run default layout: right-edge column stack.** Pure function
  `computeDefaultLayout(gameW, gameH, entries)` tiles the managed windows top-to-bottom against
  the right edge (x = gameW − width − margin, y cumulative + margin, margin 8 px), starting a
  second column further left when the first overflows gameH. Per-window default sizes are
  starting values (table in Work item 1), expected to be tuned once by Kenneth live — after
  which persistence owns them and the defaults never matter again.
- **S4 (features Q4) — tweak detection: epsilon + settle, no timers.** A geometry field
  "changed" only if it differs from the saved value by ≥ `GEOMETRY_EPSILON_PX = 2` (absorbs
  sub-pixel jitter; `fontSize`/`minimized` compare exact). A change is **saved only when
  settled**: live geometry equal (within epsilon) to the *previous poll's* live geometry —
  i.e. the drag has stopped — and different from what's on disk. At most one file write per
  poll; in steady state, zero writes.
- **S5 (features Q5) — daemon member list capped at 12 + `(+N more)`.** It is the core status,
  so show as many as fit a sane default height, but a hard cap is the only way to *guarantee*
  the no-scroll acceptance at any fleet size (the active set has reached 17). 12 member lines +
  ~7 status lines ≈ 19 lines fits the default height in Work item 1's table.
- **S6 (features Q6) — no new periodic ranking export.** The full ranking is already
  obtainable on demand: standalone `run targets.js` exports `targets-summary-<ts>.json` (vite
  filter exists). The targets window gains a one-line footer pointing at that, instead of a new
  log. Nothing added to `vite.config.ts` for this.
- **S7 (features Q7) — restore races are solved by reconciliation, not one-shot restore.**
  The manager never assumes a window is open: each poll, per window, it reads
  `tailProperties`; `null` → do nothing this poll (the script opens its own tail; retry next
  poll). Geometry is applied only against a live window and re-applied until it sticks, so
  "does moveTail land before the window finishes opening" stops mattering. `renderTail` is not
  used. A live step confirms the loop converges in practice.

## Addendum (post-implementation, folded in at Kenneth's request during live validation)

Live validation surfaced a related gap: `ns.kill()` doesn't close a process's tail window --
it's a separate UI element that persists showing frozen/orphaned content until explicitly
closed. `tailmanager.js` can't reach it either (it only ever sees the *current* running
instance via `getRunningScript`, never a dead pid's leftover window). Every daemon restart was
therefore leaving the previous run's five dashboard windows on screen, frozen, alongside the
new live ones. Fix folded into this phase rather than filed separately, since it's one line in
the exact right place: `killscripts.js` already loops `ns.ps("home")` and calls
`ns.kill(proc.pid)` for everything it kills, so it already has the pid `closeTail` needs --
`ns.ui.closeTail(proc.pid)` added immediately before the existing `ns.kill(proc.pid)` call.
0 GB (`markdown/bitburner.userinterface.closetail.md`). No new pure logic (nothing to unit-test
beyond what's already untested `ns`-orchestration in that file); covered by a live check.
**Caveat:** this only prevents *future* orphans -- windows already left over from restarts
before this fix shipped need one manual close; add that to the live validation below.

**Second addendum (same session):** `procureprograms.js` is self-terminating (exits once TOR +
all port openers are owned, or once it determines Singularity purchases are unavailable this
session) and hits the identical gap from the other side -- a script finishing on its own
doesn't auto-close its tail either, so every clean exit left a frozen window for Kenneth to
close by hand. It isn't a `tailmanager.js`-managed window (transient, not a standing
dashboard), so the only place to fix this is the script itself. `main()` has exactly four
`return` points (everything owned; Source-File 4 not active; two Singularity-throw fallbacks
routed through the shared `exitSingularityUnavailable` helper) -- each now calls
`ns.ui.closeTail()` (no args, closes the caller's own tail, 0 GB) immediately before its
summary `tprint`s and `return`. Noted trade-off: the window closes on every exit path,
including the "can't buy yet" ones, so a session watching it to see *why* it stopped loses the
window -- accepted, since the reason is already `tprint`ed to the main terminal on every exit.

## Design

### Work item 1 — `src/tailmanager.js`: the window manager companion (Layer 1) [code]

New always-on companion, launched from `daemon.js`'s startup (`launchDetached(ns,
"tailmanager.js")`, added alongside the existing five). Header charter: *owns every dashboard
tail's geometry — restores saved position/size/font/minimized on launch, persists Kenneth's
manual tweaks to `TAIL_LAYOUT_FILE`; never opens or closes windows (each dashboard opens its
own tail); no exec, no spend, cheap ns surface (`getRunningScript`, `ns.ui.*`, `ns.read`,
`ns.write`, `ns.sleep`).* It does **not** open a tail of its own — it is headless.

Constants and exports (pure parts exported for tests):

- `export const TAIL_LAYOUT_FILE = "tail-layout.json";`
- `export const GEOMETRY_EPSILON_PX = 2;`
- `export const MANAGED_TAILS` — array of `{ script, title, defaultW, defaultH }` for exactly
  the five standing dashboards:

  | script | title | defaultW × defaultH (px, starting values) |
  |---|---|---|
  | `daemon.js` | `daemon` | 840 × 420 |
  | `targetsmonitor.js` | `targets` | 760 × 220 |
  | `transactionsmonitor.js` | `transactions` | 560 × 180 |
  | `cloudmanager.js` | `cloud manager` | 560 × 200 |
  | `resourcemanager.js` | `resource manager` | 560 × 180 |

  Sizing guidance, not acceptance: default tail font ≈ 12 px monospace ≈ 7 px/char, so widths
  target the longest post-Layer-2 line per window (~92 chars for the daemon) plus padding.
  Kenneth tunes live once; persistence takes over from there.
- `export function computeDefaultLayout(gameW, gameH, entries)` — pure, per S3. Returns
  `{ [script]: { x, y, width, height } }`. Deterministic; no ns.
- `export function parseLayoutFile(raw)` — pure: `""`/malformed JSON/non-object → `{}`;
  unknown script keys tolerated (ignored by the loop); missing fields per window tolerated
  (treated as "no saved value" → default used).
- `export function reconcileTick(saved, live, prevLive, mode)` — pure decision core, called
  per window per poll. `saved`/`live`/`prevLive` are geometry objects (`live`/`prevLive` are
  `null` when the window is closed / on the first poll); `mode` is the per-window state,
  `"RESTORING" | "TRACKING"`. Returns `{ apply: geom | null, save: geom | null, nextMode }`.
  The function is stateless — the main loop holds each window's `mode` (and `prevLive`) and
  feeds back `nextMode`. **Mode lifecycle:** every window starts in `RESTORING` at manager
  start; the only transition to `TRACKING` is a poll where `live` matches `saved` within
  epsilon; any `live === null` poll resets the window to `RESTORING`, so a window the user
  closes and later re-tails (or a monitor that crashes and relaunches) is snapped back to its
  saved geometry before tracking resumes. Decision table:
  - `live === null` → `{ apply: null, save: null, nextMode: "RESTORING" }` (window closed or
    script not running — never reopen, never save; respects a deliberate close; primes the
    re-restore on reappearance).
  - `mode === "RESTORING"`, `live` within epsilon of `saved` →
    `{ apply: null, save: null, nextMode: "TRACKING" }` (restore has stuck).
  - `mode === "RESTORING"`, otherwise → `{ apply: saved, save: null, nextMode: "RESTORING" }`
    (keep pushing saved geometry until it sticks — S7's reconcile-until-stuck).
  - `mode === "TRACKING"`, `live` differs from `saved` beyond epsilon **and** settled
    (matches `prevLive` within epsilon) → `{ apply: null, save: live, nextMode: "TRACKING" }`
    (the user moved it; adopt — the caller updates `saved` to the returned `save`, which is
    what prevents re-entering RESTORING against the user's drag).
  - **Minimized guard:** while `live.minimized` is true, x/y/width/height diffs are ignored
    in *both* modes (the minimized bar's geometry is neither restored against nor saved);
    only the `minimized` flag itself is compared/applied/saved in that state.
  - Otherwise `{ apply: null, save: null, nextMode: mode }`.

Main loop (`POLL_MS = 1000`, matching the monitors):

1. On start: `raw = ns.read(TAIL_LAYOUT_FILE)`; `layout = parseLayoutFile(raw)`; fill any
   missing windows from `computeDefaultLayout(...ns.ui.windowSize(), MANAGED_TAILS)` (defaults
   are used only for windows with no saved entry — a partial file keeps its saved windows).
2. Each poll, for each `MANAGED_TAILS` entry: `rs = ns.getRunningScript(entry.script, "home")`;
   `live = rs?.tailProperties ?? null`. Run `reconcileTick`; on `apply`: `ns.ui.moveTail(x, y,
   rs.pid)`, `ns.ui.resizeTail(width, height, rs.pid)`, `ns.ui.setTailFontSize(fontSize,
   rs.pid)` (skip the font call when no saved fontSize — never force the default over a game
   setting), `ns.ui.setTailMinimized(minimized, rs.pid)` (only when saved value exists), and
   `ns.ui.setTailTitle(entry.title, rs.pid)` once per restore.
3. On any `save`: update the in-memory layout and `ns.write(TAIL_LAYOUT_FILE,
   JSON.stringify(layout, null, 2), "w")` — synchronous with the poll, single writer, no
   read-modify-write hazard.

`daemon.js` change for this item: one `launchDetached(ns, "tailmanager.js");` line in the
companion-launch block (plus its comment) — exec-by-filename, so `daemon.js`'s own RAM is
untouched. `killscripts.js` already sweeps companions by virtue of killing everything but the
protected daemon pid; relaunch on daemon restart is idempotent (the manager just re-restores).

### Work item 2 — `vite.config.ts`: export the layout file [code]

Add `if (file === 'tail-layout.json') return 'logs/tail-layout.json';` to the download
`location` filter, with a one-line comment marking it Phase 18's persistence-verification
export. (Precedent note for the reviewer: unlike `finance-state.json` — deliberately
unexported because it's a heartbeat already visible in a tail — the layout file's on-disk
content *is* the feature under test here, and reading it beats screenshots.)

### Work item 3 — daemon tail: status only (Layer 2) [code]

`daemon.js` print-section edits (lines ~811–901). **`logEvent` calls and all math untouched;
`ns.print`/format changes only.**

Keep (reformatted):

```
===== daemon @ 5:57:23 PM ===== math: legacy
fleet 37.44TB | budget 28.08TB | hosts 24 | targets 14 | util 50.3%
members 1 (+2 draining):
  phantasy        DRIFTED  0/26 in flight | commit  1% | sec 15.6/7 | $600.000m/600.000m
  ...                                          (cap 12 lines, then `  (+N more)`)
share 9.36TB/9.36TB (100.0%) | 2,339t | power 1.31
waterfall 0.00GB free | prepping: none
```

- Line 2 merges today's `hosts/targets/members/util/fleet` line with `batch budget` (moved off
  the share line) — one status line, ≤ ~80 chars. `members N` moves to its own list-header
  line so line 2 stays short; draining count rides there.
- Member lines: current format kept (it fits at the default width); capped at 12 by the
  existing score order, then one `  (+N more)` line. DRAINING lines count toward the same cap.
- Share line: drop the trailing `| batch budget …` (moved to line 2); `share: OFF (…)` branch
  unchanged.

Delete from the tail (all redundant with `daemon-batch-log.json`):

- `skipped(total) / shrunk(total)` counters line (per-event `skip` records exist).
- `last launch: #N …` line (`batch` events carry id/server/fraction/steal/lands).
- Per-member `prep <server>: X/Yt dispatched…` lines (member prep state is in `snapshot`
  events; the waterfall `prepping:` summary and the member `DRIFTED` flag remain in the tail).
  This deliberately drops the `RAM-LIMITED` inline cue — a conscious loss, noted here so it's
  not re-litigated at review.
- `INFO: <server> skipped this tick -- pipeline saturated…` lines (expected rhythm, logged).

Keep inline (genuine warnings, unchanged text): the zero-member stall WARN, the
empty-pipeline-skip WARN, the `failedLaunches` WARN, and the "No eligible targets." early
branch (lines ~506–508, reformatted to the new header only).

### Work item 4 — targets tail: top 5 + pointer (Layer 2) [code]

`targetsmonitor.js`: add `const TOP_N = 5;`. Print becomes:

```
===== targets @ 5:57:23 PM ===== (top 5 of 14 by score)
-> phantasy        PREPPED | sec  5.00/5   | $ 68.750m/ 68.750m | pri 1.99e+2
   silver-helix    DRIFTED | sec 30.00/10  | $  1.750m/  1.750m | pri 2.16e+2
   ...
(full ranking: run targets.js -> targets-summary-<ts>.json)
```

- Slice to `TOP_N`; header carries `(top X of Y by score)`; the standalone legend line is
  deleted (its content folds into the header + footer).
- Line format: same fields as today, `priority` shortened to `pri`; target ≤ ~78 chars.
- `getTargets`/`isPrepped` cadence logic untouched.

### Work item 5 — transactions tail: totals + last 3 (Layer 2) [code]

`transactionsmonitor.js`: `DISPLAY_COUNT` 20 → 3. Print becomes (status first):

```
===== transactions @ 5:57:23 PM =====
today: $3.221b hacking | rate: $151.872m/min
  [income]  +$24.490m hacking @ 5:36:59 PM
  [expense] -$56.320m auto-cloud-upgrade @ 5:36:59 PM
  [expense] -$28.160m auto-cloud-upgrade @ 5:36:19 PM
(full log: transactions-2026-07-08.json)
```

- Totals move above the entries; rate line merges into the totals line (omit `| rate: …` until
  `firstIncomeTimestamp` exists, matching today's conditional).
- Per-entry timestamp becomes time-only, derived for display as
  `new Date(r.lastTimestamp).toLocaleTimeString()` — **the on-disk record (`r.time`, full
  locale string) is unchanged**.
- Footer names the actual rotating filename (already computed).
- The writer block (baseline/delta/coalesce/`ns.write`) and `dayRolledOver` reset logic:
  **no changes**.

### Work item 6 — cloud/resource tails: de-wrap (Layer 2) [code]

`cloudmanager.js` — same lines, tightened so the longest is ≤ ~58 chars:

- `available: $1.056b | reserved: $0.000` (unchanged).
- `next: cloud-0 -> 65.54TB, $1.802b (can't afford)` — `for $X` → `, $X`; `(can't afford
  yet)` → `(can't afford)`.
- `last upgrade: cloud-0 -> 32.77TB, $901.120m @ 5:50:19 PM` — drop the `fromRam ->` prefix
  (the wrap culprit); keep cost + time-only timestamp (already time-only).
- `bootstrap bought:` / `last growth buy:` lines: same `, $X @ time` tightening.
- PAUSED / stale-state early branches: header only, unchanged otherwise.

`resourcemanager.js`:

- Header `===== finance manager @ … =====` → `===== resource manager @ … =====` (script was
  renamed in Phase 11; the header never followed — cosmetic fix, and `verify-log-checks.js`
  must be grepped for any assertion on the old string before assuming this is free; if a check
  matches it, update the check in the same commit).
- `money:` line and `totalReserved: … | available: …` line merge into one:
  `money $1.056b | reserved $0.000 | available $1.056b`.
- Reservations list stays whole — it is bounded (a handful of rules) and *is* the status.
- `formulas reservation: DISABLED …` and `last change:` lines unchanged.

### Work item 7 — tests [code]

New `test/tailmanager.test.js` (house style, mock-free — all pure):

- `computeDefaultLayout`: five windows tile down the right edge without overlap inside a
  1920×1080 frame; overflow starts a second column; deterministic output; empty entry list →
  `{}`.
- `parseLayoutFile`: round-trip of a saved layout; `""` → `{}`; malformed JSON → `{}`;
  non-object JSON (`"[]"`, `"3"`) → `{}`; partial per-window fields preserved.
- `reconcileTick`: closed window → no-op **and** `nextMode === "RESTORING"` (from either
  mode — covers X-close-then-re-tail re-restoring); RESTORING pushes `apply` until live
  matches saved, then transitions to TRACKING; in TRACKING, sub-epsilon drift never saves;
  a settled move saves exactly the live geometry and stays TRACKING (no snap-back: with
  `saved` updated to the returned `save`, the next poll is a no-op); an unsettled
  (still-moving) drag neither saves nor applies; minimized guard ignores x/y/w/h diffs in
  both modes and still tracks the flag itself.

No new tests for the Layer-2 print edits — display-only, covered by the live checks (stated
per the "where practical" convention).

### Work item 8 — BACKLOG / CHANGELOG bookkeeping [code]

- `BACKLOG.md`: keep the Phase 18 In-Progress entry current (it already exists); on close-out,
  move a dated condensed entry to `docs/phases/CHANGELOG.md`, graduate both phase docs to
  `docs/phases/`, and trim the superseded parts of the "Monitor cleanup + more meaningful
  logging" Idea (the out-of-game dashboard half stays open, per the features file).
- Staged in the same commits as the work they describe.

## RAM gate [live, via `ramcheck.js` → `logs/ramcheck-result.json`]

Kill+restart the dev server first; byte-check `dist/src/*`. Fresh baseline on the full set
before the branch's changes, re-run after:

`run ramcheck.js daemon.js tailmanager.js targetsmonitor.js transactionsmonitor.js cloudmanager.js resourcemanager.js`

| script | expected | why |
|---|---|---|
| `daemon.js` | **flat** (16.30 GB baseline) | gains one exec-by-filename launch line; print edits are 0 GB |
| `tailmanager.js` | **new, ~1.9 GB** (record actual) | 1.6 base + 0.3 `getRunningScript`; every `ns.ui.*` used is 0 GB, `read`/`write`/`sleep` free |
| `targetsmonitor.js` | flat | print/slice edits only |
| `transactionsmonitor.js` | flat | display-only edits; `Date` formatting is not an ns call |
| `cloudmanager.js` | flat | string edits only |
| `resourcemanager.js` | flat | string edits only |

`tailmanager.js` materially above ~2.0 GB is a bust → identifier-hygiene hunt (`mem`-trace per
Phase 9/11) before proceeding — the likeliest culprit would be a name collision with an
`ns.ui` method, which the Ground rules ban pre-empts. Any non-flat delta on the other five is
likewise a bust.

## Live validation [live]

`npm run dev` running (restarted at the gate step above). This phase's primary gate is
live/visual per the features file.

1. Restart `daemon.js`. **First-run layout:** all five windows open and, within a few seconds,
   snap to the right-edge column with titles `daemon` / `targets` / `transactions` /
   `cloud manager` / `resource manager`. (First run has no layout file, so this exercises
   `computeDefaultLayout` + the S7 reconcile-until-stuck loop in one step.)
2. **No wrap / no hidden header:** at the restored sizes, no window shows a folded line, and
   each window's `=====` header is visible without scrolling in normal operation (daemon
   window: with the member list at or under its cap). If a window fails, note which — that
   loops back to a [code] width/height-default or line-format fix.
3. **Tweak persistence:** drag/resize at least two windows (move the daemon somewhere
   distinctive; resize transactions). Within a few polls `logs/tail-layout.json` (auto-export)
   shows the new geometry for exactly those windows. Restart `daemon.js`: every window returns
   to where it was left — including the tweaked ones — with no manual dragging.
4. **Respect close / re-restore on reopen:** X-close one monitor's window; confirm the manager
   does not reopen it and `tail-layout.json` keeps its last geometry. Then manually re-tail
   that script (`tail <script>` or the Active Scripts UI): the window snaps back to its saved
   geometry within a few polls (the `live === null` → RESTORING reset). It likewise reopens
   and restores on the next daemon restart.
5. **Content spot-checks:** transactions shows totals + 3 entries + filename footer; targets
   shows top 5 with `(top 5 of N)`; daemon shows the two-line status + members + share +
   waterfall and none of the deleted lines; resource manager header reads `resource manager`.
6. `npm run verify:log` against a fresh export — green, zero rule changes (log schema frozen).
7. **Aug-install survival** is structurally untestable on demand — record as
   observe-at-next-install: windows should come back to their saved geometry after the install
   (the layout file persists on home). Not a sign-off blocker; the restart test (step 3) is
   the stand-in, since an install is a teardown+relaunch of the same shape.

## Acceptance criteria

- `npm test` green: all pre-existing tests plus Work item 7's `tailmanager` suite. (Implementer
  runs and clears this.)
- RAM gate per table: five flat, `tailmanager.js` recorded at ~1.9 GB and ≤ 2.0 GB, all
  byte-verified against `dist/src/*`, results in `logs/ramcheck-result.json`.
- Live steps 1–6 pass as described; step 7 recorded as observe-at-next-install.
- `npm run verify:log` green with no check-rule edits (except a `resource manager` header
  string update if — and only if — a check asserted the old header, per Work item 6).
- `logs/tail-layout.json` demonstrates persistence: contains the tweaked geometry from live
  step 3 and survives the daemon restart unchanged.
- BACKLOG/CHANGELOG updated per Work item 8, staged with the work.

## Files touched

**New:** `src/tailmanager.js`, `test/tailmanager.test.js`.

**Edited (src):** `src/daemon.js` (companion launch line + Work item 3 print edits),
`src/targetsmonitor.js`, `src/transactionsmonitor.js` (display block only),
`src/cloudmanager.js`, `src/resourcemanager.js`, `src/killscripts.js` (addendum: closes each
process's tail window in the same loop that kills it), `src/procureprograms.js` (addendum:
closes its own tail window at each of its four self-terminating exit points).

**Edited (config):** `vite.config.ts` (one download-filter line).

**Docs:** `BACKLOG.md`, `docs/phases/CHANGELOG.md`, plus this spec and
`phase-18-dashboards.features.md` at repo root until graduation.

**Deliberately untouched:** `transactionsmonitor.js`'s income-writer block; every `logEvent`
call and the daemon-batch-log schema; `verify-log-checks.js` (unless the `resource manager`
header string is asserted there); `scheduler.js`, `sampling.js`, `targets.js`, `translog.js`,
all workers; `bootstrap.js` / `procureprograms.js` / `launchmonitor.js` (transient/manual
tails — **not** in `MANAGED_TAILS`, by design); Layer 3 in its entirety.
