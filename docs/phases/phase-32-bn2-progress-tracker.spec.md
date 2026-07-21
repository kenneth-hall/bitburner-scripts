# Phase 32 spec: BN2.1 progress tracker — dashboard goal section

**Stage:** spec (drafted fable 2026-07-21, from `phase-32-bn2-progress-tracker.features.md`).
**Model flow:** brainstorm opus → this spec (fable) → cold review by `spec-reviewer` → implement (sonnet).

## Context

We cannot answer *"are we progressing toward ending BN2.1?"* at a glance: the loud metrics
(gang respect, faction rep) are solved subgoals, and the metric that gates the win — installed
hacking multiplier `M` climbing toward ~16.7 (core NiteSec catalog) / ~29 (with QLink) — has no
standing readout. The features doc decided three KPIs (`M` progress %, smoothed income rate with
trend, $-to-next-aug + elapsed awaiting-money timer) and a two-step work order:

- **Step 1 (prerequisite):** complete the income ledger — `transactionsmonitor.js` records only
  hacking income (~4% of reality; gang is ~96%, measured live 2026-07-21).
- **Step 2:** a durable progress sampler + a dashboard "GOAL" section reading its state file.

Architecture (decided in features): one resident sampler writing a snapshot + ring-capped series,
mirroring the `gangratelog.js` ⇒ `gang-state.json` ⇒ dashboard pattern; `dashboard.js` stays a
pure `ns.read` renderer with **zero added ns RAM**. Dashboard space for the section was approved
in the brainstorm (the observability convention's gate).

## Ground rules

- `dashboard.js` gains **no new `ns` surface** — it reads one new state file with the existing
  tolerant reader and renders via a new pure panel formatter. RAM must measure unchanged (2.6 GB).
- The sampler is a **headless resident companion**: `exec`'d by `daemon.js`, supervised via
  `RESIDENT_COMPANIONS`, never imported into `daemon.js`. No Singularity calls anywhere in this
  phase (`getPlayer`/`getMoneySources` are base API).
- Every writer of the daily transactions log keeps the translog concurrency invariant: **no
  `await` between the `ns.read` and the `ns.write`**.
- Identifier hygiene (this build's RAM analyzer misreads *names*): access the money-sources gang
  field via **bracket notation** (`sinceStart["gang"]` — `ns.gang` is a real ns property); no
  local/field names matching ns methods (`hack`, `share`, `exec`, `ls`, `ps`, `run`, `kill`,
  `read`, `write`, `scan`, `grow`, `tail`, …). `.hacking` dot access is proven safe
  (`transactionsmonitor.js` live at expected RAM).
- Purchases: this phase spends nothing; no new `recordTransaction` call sites. Step 1 *records*
  gang income — it changes what is logged, not what is spent.
- Tests: vitest units for every pure function; `npm run verify:log` extended to cover the new
  income source and the new state files; RAM gates via `ramcheck.js`; live validation steps
  marked **[live]**.

## Spec-stage decisions

1. **Separate sampler, not an extended `gangratelog.js` (features OQ1 → (a)).** New file
   `src/goallog.js`. `gangratelog.js` is a thin gang-state consumer on a 5-min/14-day cadence;
   the goal sampler needs a 60-s cadence, `getPlayer` + `getMoneySources` (real RAM), and a
   different lifecycle question ("is the *node* progressing"). Merging would couple two jobs and
   put gang-file parsing next to player-API reads for no shared code beyond a 5-line ring append.
   One-file-one-job wins; the ring append is imported (decision 8).
2. **Naming: `goallog.js` / `goal-state.json` / `goal-log.json` / panel `GOAL`.** The features
   doc said "`bn2progresslog.js` or similar"; the node-agnostic name is chosen because the tool
   outlives BN2 (retargeting = editing two constants), the dashboard section is literally the
   "goal section", and `progress-log.json` would collide confusably with the existing
   `hacking-progress-log.json`. The BN2-specific part is *only* the target constants.
3. **Cadence & windows (features OQ2).** `SAMPLE_INTERVAL_MS = 60_000`; `RING_CAP = 2880`
   (48 h of samples — enough for smoothing and short-horizon reasoning; multi-week history is
   what `ratchet-log.json` already records per install). Rate window `RATE_WINDOW_MS = 600_000`
   (10 min): long enough to flatten batch-landing noise, short enough that the trend arrow
   reflects "now". Trend compares the latest 10-min window's rate against the *previous* 10-min
   window's, with **relative** thresholds (`×1.05` up / `×0.95` down, else flat) — absolute
   $-thresholds would break as income scales over the node. Single cadence, no second ring: at
   60 s resolution the 5-min-ring argument for two cadences disappears.
4. **The sampler diffs `getMoneySources().sinceStart` (gang + hacking), not `sinceInstall` —
   probe-backed change from the features text.** Measured live this session (extended
   `moneysources.js`, `logs/moneysources-1784656604572.json`): `sinceStart` net $20.873b vs
   `sinceInstall` $13.383b — **`sinceStart` survives installs** (14 installs into this node,
   unreset by today's install #14; the API docs are silent, so this was probed per the read-only
   probe rule). Diffing `sinceStart` makes the series continuous across installs — no
   discontinuity guard needed at every install, only at **node entry**, where `sinceStart` does
   reset: on append, if the new cumulative is *below* the last sample's, the series file is
   cleared first (samples from a previous node are junk). The features doc's actual reasoning
   (diff a cumulative, never trust `moneyGainRate`'s unit) is preserved; only the block chosen
   improves. KPI 2's post-install false-alarm risk drops further — the data itself no longer
   jumps at an install, only the real underlying rate does, and the 10-min window absorbs that.
5. **`M` target constants.** `M_TARGET = 16.7`, `M_TARGET_LABEL = "core"` in `goallog.js`,
   echoed into the snapshot so the dashboard prints the label and a later switch to 29/QLink is
   a visible two-constant edit, never silent. Numerator: `ns.getPlayer().mults.hacking`
   (installed only, per features). Percent = `Math.round(value / target * 100)`, rendered with a
   `~` prefix (the features' honesty note: linear-on-multiplicative, morale gauge not literal %).
6. **Step 1 coalescing is per-source (design detail the features left open).** With gang and
   hacking deltas landing in the same 1-s poll loop, tail-only coalescing (`shouldCoalesce` on
   the last record) would interleave `[gang, hacking, gang, …]` and never coalesce anything —
   ~170k records/day. Instead: a new pure helper in `translog.js`,
   `coalesceIndexForSource(entries, source, nowTimestamp)`, reverse-scans for the **last income
   record of that source** and returns its index iff the existing `shouldCoalesce` window logic
   passes (else −1). Folding into an *interior* record is safe against the verify checker's
   ordering assertion because income records are ordered by `firstTimestamp`, which a fold never
   touches (only `amount`/`lastTimestamp`/`time`). Steady-state volume: ≤ 2 sources × 288
   five-min windows ≈ 576 records/day.
7. **Awaiting-money stamp (features OQ3) — in scope, restored across relaunches.** `augfarmer.js`
   keeps an in-memory `awaitingMoneySince` (ms epoch): stamped on the pass where `plan.phase`
   *enters* `"awaiting-money"`, preserved while it stays there, cleared (null) on any other
   phase. Persisted as a top-level field in `augfarmer-state.json`; restored at startup via the
   **existing Phase 26 B2 restore block's `lastAugReset` match** (same key, same rationale: an
   install boundary invalidates it, a mere relaunch shouldn't reset the timer) — restore only
   when the saved record's phase is also `"awaiting-money"`. The elapsed time is computed by
   *readers* (`now − awaitingMoneySince`), so the stamp being written up to 5 min late by the
   heartbeat costs nothing — the absolute entry time is what's stored. Transition logic is a
   pure exported helper `nextAwaitingSince(prev, phase, nowMs)` so it's unit-testable.
8. **Ring append reused from `gangratelog.js`.** `goallog.js` imports `appendCapped` from
   `./gangratelog.js`. Import bleed is the concern; it's void here because `gangratelog.js`'s
   entire ns surface is 0 GB (`read`/`write`/`sleep`/`disableLog`). The RAM gate on `goallog.js`
   (criterion R2) is the standing guard if `gangratelog.js` ever grows ns calls. Moving the
   helper to `common.js` was rejected: `common.js` is *not* a cheap module (`scan`,
   `getScriptRam`, …) and importing it would bleed real GB into both samplers.
9. **Panel placement (features OQ5): GOAL is the first panel, above DAEMON.** It is the "why
   everything below exists" readout; DAEMON stays the alarm surface directly under it. Row cost:
   4 lines + 1 separator = 5 rows. Accounting against `ROW_BUDGET = 58`: current typical render
   ≈ 51 rows (header 1; DAEMON 8; GANG 5; TARGETS 4; XP 3; CLOUD 3; FINANCE 7; TRANSACTIONS 7;
   AUG 7; separators included) → ≈ 56 with GOAL. Worst-case (max warns + max entries) can brush
   the budget; the **designated give-back rows**, if the live check (L4) shows overflow, are
   TRANSACTIONS shown-entries 3→2 and FINANCE reservations 3→2 — decided here so an overflow fix
   is a constant edit, not a new space negotiation.
10. **Staleness:** `STALE_MS.goal = 180_000` (3 × the 60-s cadence, over the 15-s floor —
    matches the S7 convention).
11. **Display formats (pinned so formatter tests are exact).** Words not arrows for trend
    (`UP`/`DOWN`/`FLAT` — the gangPanel precedent; glyph rendering is untested in this font
    budget). Lines (each still `clampLine`d):
    - Title: `-- GOAL (BN2.1) --` + stale suffix
    - `M 1.51/16.7 (core) ~9%`
    - Income line, three exact forms (cold-review blocker resolved): `perSec` null (sub-2-sample
      window — first sampler minute, and ~1 min after every node entry clears the series) →
      `income (warming up)` with no value; `perSec` non-null but `trend` null (<2 windows of
      history) → `income $5.09m/s (warming up)`; both non-null → `income $5.09m/s UP (10m)`
    - `next: <aug> $15.4b | waiting 12m` — waiting shown only when awaiting-money and the stamp
      exists, using the snapshot's stored `waitingMs` (≤60 s stale on a minutes-granularity
      display — the panel never recomputes from `awaitingSince`); `<60 min` as `Nm`, else
      `Xh Ym`; no target → `next: none`
12. **Observed pre-existing bug, logged not fixed (out of scope):** in `augfarmer.js`'s
    state-write gate (~line 2336), `previousPhase = plan.phase` is assigned *before* the
    `plan.phase !== previousPhase` check, so the phase-change condition is always false and
    phase flips persist only via the 5-min heartbeat. This phase doesn't depend on it (decision
    7), but it belongs in `BACKLOG.md` → Bugs as part of this phase's docs commit. Fixing it is
    a one-line reorder **not** authorized here — it changes write cadence for every consumer.

## Design

### Work item 1 — `src/translog.js`: per-source coalesce helper [code]

Add pure `coalesceIndexForSource(entries, source, nowTimestamp)` (decision 6): reverse-scan for
the last `type === "income" && source === source` record; return its index iff
`shouldCoalesce(record, nowTimestamp)` passes, else −1. `shouldCoalesce` itself is unchanged
(existing tests untouched). Export it.

### Work item 2 — `src/transactionsmonitor.js`: gang income [code]

- Second baseline `let baselineGangIncome = ns.getMoneySources().sinceStart["gang"]` beside the
  existing hacking baseline (bracket notation per ground rules; same known startup-baseline gap,
  extend the header comment to say so).
- Each poll, read `ns.getMoneySources().sinceStart` **once**, compute both deltas at the same
  `now`. For each source (`"hacking"`, `"gang"`) with `delta > 0`: find the fold target via
  `coalesceIndexForSource`; fold or append a record identical in shape to today's income records
  but with its own `source`. Both sources' writes happen inside one synchronous
  read-modify-write of the day file (single `ns.read` → mutate for both → single `ns.write`) —
  the no-`await` invariant holds trivially.
- Display: today-total line becomes `today: $X (hacking $H | gang $G)` with the same rate
  suffix; per-record lines already print `r.source`.
- Guard unchanged: `delta > 0` — a node reset (cumulative drop) skips the write and the next
  poll re-baselines, exactly as the hacking path behaves today.

### Work item 3 — verify:log checker [code]

`test/verify-transactions.test.js`: add `'gang'` to `VALID_INCOME_SOURCES`; generalize the
income `toMatchObject` from the hardcoded `source: 'hacking'` to the record's own (whitelisted)
source. No other assertion changes — ordering and window bounds hold per decision 6.

### Work item 4 — `src/augfarmer.js`: `awaitingMoneySince` [code]

Per decision 7: pure `nextAwaitingSince(prev, phase, nowMs)` — `prev` is the **previous
timestamp** (ms epoch or null), *not* the previous phase (cold-review disambiguation): returns
`nowMs` when `phase === "awaiting-money"` and `prev` is null (entry), `prev` unchanged when
already set and still awaiting (preserve), `null` otherwise (exit). Wire it in the main loop
**before** `previousPhase` is reassigned; add `awaitingMoneySince` to the state record; extend
the startup restore block (`lastAugReset` match AND saved phase `"awaiting-money"`).

**Write-on-transition (cold-review gap):** because the phase-change write condition is dead
(decision 12), a stamp set between heartbeats would go unpersisted for up to 5 min, and a
relaunch in that window would restart the timer. So the state-write gate gains one narrowly
scoped OR-term: *the `awaitingMoneySince` value changed this pass* (set or cleared). This does
not touch the general phase-change condition — decision 12's bug stays logged, not fixed.

Pure-logic change only — RAM must measure unchanged (64.10 GB).

### Work item 5 — `src/goallog.js`: the sampler (new) [code]

Headless resident, `gangratelog.js`'s shape. Constants: `SAMPLE_INTERVAL_MS = 60_000`,
`RING_CAP = 2880`, `RATE_WINDOW_MS = 600_000`, `TREND_UP_RATIO = 1.05`,
`TREND_DOWN_RATIO = 0.95`, `M_TARGET = 16.7`, `M_TARGET_LABEL = "core"`,
`SERIES_FILE = "goal-log.json"`, `SNAPSHOT_FILE = "goal-state.json"`.

Each tick:
1. Read `sources = ns.getMoneySources().sinceStart`; `player = ns.getPlayer()`.
2. Append `{ t, gangCum: sources["gang"], hackingCum: sources.hacking, mHacking:
   player.mults.hacking }` to the series (tolerant read like `gangratelog.js`; **node-reset
   guard** per decision 4: if the last sample's `gangCum + hackingCum` exceeds the new sum,
   clear the series first). `appendCapped`, write.
3. Read `augfarmer-state.json` (tolerant); build and write the snapshot:

```json
{
  "timestamp": 0, "time": "…",
  "mProgress": { "value": 1.51, "target": 16.7, "targetLabel": "core", "pct": 9 },
  "income": { "perSec": 0, "trend": "UP|DOWN|FLAT|null", "windowMs": 600000,
              "gangPerSec": 0, "hackingPerSec": 0 },
  "nextAug": { "aug": "…", "faction": "…", "price": 0, "phase": "…",
               "awaitingSince": 0, "waitingMs": 0 }
}
```

`nextAug` is `null` when augfarmer state is missing/unreadable or has no target; `waitingMs`
(= `now − awaitingSince`) and `awaitingSince` only when phase is `"awaiting-money"` and the
stamp exists. `gangPerSec`/`hackingPerSec` are the same window diffs split by source — cheap,
and the gang-vs-batcher share question (CLAUDE.md's "may overtake late-cycle, unverified") gets
a standing measured answer for free.

Pure functions (exported, unit-tested): `computeRateRange(series, fromMs, toMs, field)` →
$/sec or `null` (<2 samples in range, non-positive span, or a decrease *in the selected field*
inside the range) — `field` is `"gangCum"`, `"hackingCum"`, or `"total"` (sum of both; the
combined rate and the two splits are the same primitive, so Work item 9's tests aren't
invented); `computeTrend(series, nowMs, windowMs)` → `"UP"|"DOWN"|"FLAT"|null` comparing
`[now−w, now]` vs `[now−2w, now−w]` per decision 3, always on `"total"`;
`buildSnapshot(series, augState, nowMs)` → the snapshot object. `main` is a thin shell around
them.

Expected RAM: base 1.6 + `getMoneySources` 1.0 + `getPlayer` 0.5 ≈ **3.1 GB**; gate band
**≤ 4.0 GB** (R2). No gang API, no Singularity.

### Work item 6 — `src/dashboard.js`: GOAL panel [code]

- `GOAL_STATE_FILE = "goal-state.json"` (hardcoded filename per the existing no-import
  precedent); `STALE_MS.goal = 180_000`.
- Pure `goalPanel(state, now)` following the house formatter contract (null → "no data yet",
  `PARSE_FAILED` → "unreadable", `??` tolerance on every field) rendering decision 11's lines.
- Register in `renderAll` as the **first** panel (decision 9), read the file in `main`'s states
  block. No other panel changes in this item — the give-back trims fire only if L4 fails.

### Work item 7 — `src/daemon.js`: wiring [code]

Add `"goallog.js"` to `RESIDENT_COMPANIONS` (after `gangratelog.js`) and a `launchDetached(ns,
"goallog.js")` beside gangratelog's. No new ns surface; daemon RAM must measure unchanged.

### Work item 8 — `vite.config.ts`: log sync [code]

Two filter lines: `goal-state.json` → `logs/goal-state.json`, `goal-log.json` →
`logs/goal-log.json`, commented in the Phase 24 renderer-sources style.

### Work item 9 — tests [code]

- `test/translog.test.js`: `coalesceIndexForSource` — finds last same-source income across an
  interleaved `[gang, hacking, expense, gang]` fixture; −1 on gap expiry, window overflow, no
  match; never returns an expense index.
- `test/goallog.test.js` (new): `computeRateRange` (happy path against a hand-built cumulative
  series for `"total"` and one per-source field; null on <2 samples / zero span; null on
  in-range decrease of the selected field),
  `computeTrend` (UP/DOWN/FLAT with the ×1.05/×0.95 boundaries pinned exactly; null when either
  window lacks a rate), `buildSnapshot` (pct rounding; nextAug null cases; waitingMs only in
  awaiting-money; node-reset-cleared series yields `income.trend null`).
- `test/augfarmer.test.js`: `nextAwaitingSince` — stamps on entry, preserves during, clears on
  exit, `null` prev handling; plus one state-record-shape assertion that `awaitingMoneySince`
  is emitted.
- `test/dashboard.test.js`: `goalPanel` null / PARSE_FAILED / full / missing-field renders
  (exact strings per decision 11); `renderAll` emits GOAL first.
- verify:log: work item 3's checker changes, plus a new `test/verify-goal.test.js` asserting
  `logs/goal-state.json` parses with the three KPI blocks present and
  `logs/goal-log.json` parses as an array with non-decreasing `t` (modeled on
  `verify-gang.test.js`; skip-with-message when the files don't exist yet so the suite stays
  green on a fresh checkout — match the existing checkers' missing-file convention).

### Work item 10 — docs [code]

`BACKLOG.md`: add the decision-12 bug entry; note the gang-income ledger gap as closed.
`docs/scripts.md`: `goallog.js` row. `docs/logging.md`: the two new files. Condensed CHANGELOG
entry staged with the ship commit (not before). Graduate both phase docs to `docs/phases/` at
ship per convention.

## Live procedure [live]

- **L1 (Step 1 first, it's the foundation):** after deploy + `restart transactionsmonitor.js`
  over CDP, within ~2 min today's `transactions-*.json` shows `source: "gang"` income records
  coalescing into ≤5-min windows. `npm run verify:log` green against the real file.
- **L2 (reconciliation, one-time):** sum of `gang-equip` expense records since install #14's
  timestamp ≈ `sinceInstall.gang_expenses` from a fresh `moneysources.js` run (approximate —
  startup-baseline gaps are the known slack; same-order-of-magnitude agreement is the bar).
- **L3 (sampler):** after `restart daemon.js` (or first supervisor pass), `logs/goal-state.json`
  and `logs/goal-log.json` appear and refresh on the 60-s cadence; after ~20 min the trend is
  non-null; `mProgress.value` matches the latest `auginfo` read (1.51); `income.perSec` is
  order-of-magnitude consistent with the moneysources probe.
- **L4 (dashboard):** GOAL renders as the top panel; a CDP `shot` confirms no wrap and no
  vertical scroll (ruler flag optional). Overflow → apply decision 9's give-back trims and
  re-shot.
- **L5 (stamp):** the live cycle is already in `awaiting-money` (Phase 31 close-out), so
  `augfarmer-state.json` gains `awaitingMoneySince` on the first restarted pass and the GOAL
  panel shows a growing `waiting` figure; after the next install fires, the field clears.

## Acceptance criteria

Test-gated (Claude clears): **T1** `npm test` green including every new unit above; **T2**
`npm run verify:log` green with the updated transactions checker and new goal checker.

RAM-gated [live]: **R1** `dashboard.js` unchanged (2.6 GB) and `transactionsmonitor.js`,
`daemon.js`, `augfarmer.js` (64.10 GB) all unchanged from their pre-change `ramcheck.js`
baselines; **R2** `goallog.js` ≤ 4.0 GB. Any surprise checked against the identifier-hygiene
bug class before being believed.

Live-gated [live]: **V1** = L1+L2; **V2** = L3; **V3** = L4; **V4** = L5.

Ship gate per CLAUDE.md: T1/T2 self-cleared; R*/V* wait on Kenneth's in-game run; then merge +
push without further sign-off.

## Files touched

- `src/translog.js` — `coalesceIndexForSource` (new export)
- `src/transactionsmonitor.js` — gang baseline + per-source coalescing + display line
- `src/augfarmer.js` — `nextAwaitingSince` + state field + restore-block extension
- `src/goallog.js` — **new** sampler
- `src/dashboard.js` — `goalPanel`, GOAL registration, `STALE_MS.goal`, state read
- `src/daemon.js` — resident registration + launch
- `vite.config.ts` — two download-filter lines
- `test/translog.test.js`, `test/goallog.test.js` (new), `test/augfarmer.test.js`,
  `test/dashboard.test.js`, `test/verify-transactions.test.js`, `test/verify-goal.test.js` (new)
- `BACKLOG.md`, `docs/scripts.md`, `docs/logging.md` (+ CHANGELOG/doc graduation at ship)
- *(already landed this session, pre-spec probe)* `src/moneysources.js` — dumps `sinceStart`
  alongside `sinceInstall`

## Open questions (log, don't block)

1. **`M_TARGET` hand-off when the core catalog completes.** At M ≈ 16.7 the readout pins ~100%
   while the real decision (QLink at $25t vs. NFG tail) is still open. Deliberately not
   automated — flipping to `29 / "qlink"` is a visible two-constant edit and a Kenneth
   conversation at that milestone, not before.
2. **Is `sinceStart` also immune to soft resets other than node entry?** The probe proves
   install-survival; nothing else in BN2.1 resets progress, so the node-entry guard is believed
   sufficient. If the series ever clears unexpectedly, suspect this assumption first.
3. **Trend thresholds (±5%) are provisional** — same status as the ratchet's tuning constants.
   If the arrow flaps in live use, widen the band (constant edit, not redesign).
