# Phase 16 features: Fable audit cleanup — F2–F8

**Stage:** requirements handoff for the spec stage, per `CLAUDE.md`'s Development workflow.
The spec stage turns this into `phase-16-audit-cleanup.spec.md` and delegates a cold-context
`spec-reviewer` pass before implementation.

This is a **behavior-preserving housekeeping phase** — a Phase-13-flavor consolidation pass
plus a handful of small correctness/display fixes and test backfill. No batching, scheduling,
finance, or targeting math changes. The safety net is `npm test` plus the RAM gate (for the
import-graph moves) plus a before/after daemon session; there are no new features to live-drive
beyond confirming nothing regressed.

## Goal

Clear the actionable findings from the 2026-07-06 full-repo Fable audit that are still open in
`BACKLOG.md` ("Fable discoveries" section). F1 already shipped in Phase 15; this phase takes
**F2 through F8**. They cluster into three groups:

- **Dedup / shared-seam extraction (F4, F5, F6)** — the same copy-paste pattern Phase 13
  attacked, in the corners Phase 13 didn't reach: finance-state client code, a fourth-wave
  `tprintTs` duplication, and a duplicated `totalAllocatableRam`.
- **Small correctness / display fixes (F2, F3, F8)** — a benign log-cap off-by-one, a
  day-boundary reset the income display never does, and an ambiguous "budget" label.
- **Test backfill (F7)** — three untested pure helpers.

Doing them together is deliberate: F4 and F5 (and the RAM-gate half of F6) touch the same
`resourcemanager.js` / `cloudmanager.js` / `procureprograms.js` / `bootstrap.js` files, so a
single consolidation pass avoids editing and re-gating them three times — exactly the folding
Fable's own notes suggested ("fold F5 into F4's cleanup pass," "fold F6 into the same pass").

## What's duplicated / wrong today (verified against `src/` on 2026-07-07)

- **F2 — `trimLog` off-by-one when the mode event is pinned** (`daemon.js` 235–260). In the
  pinned branch the function returns `[entries[latestModeIndex], ...entries.slice(overflow)]`.
  `entries.slice(overflow)` is already `DAEMON_LOG_MAX_ENTRIES` long, so prepending the pinned
  mode event yields **`MAX + 1`** entries, and it stays at `MAX + 1` for every call while the
  pinned mode event still sits in the overflow region. The contract comment (225–234) says it
  "trims the ring buffer to `DAEMON_LOG_MAX_ENTRIES`." Benign — nothing asserts the exact cap,
  it's 2001 vs 2000 — but the code doesn't do what its comment says.
- **F3 — `transactionsmonitor.js`'s "today's hacking income" never resets at midnight**
  (38–39, 69–70, 94–99). `todayIncomeTotal` / `firstIncomeTimestamp` accumulate from monitor
  **start**, not from the day boundary. The transactions *file* rotates correctly — the display
  reads `transactionsFileName(new Date())` fresh each poll (76) — but the "today's hacking
  income" total and the derived `$/min` rate keep summing across midnight, so a session that
  crosses midnight labels *yesterday + today combined* as "today." Display-only; the on-disk
  daily logs are correct.
- **F4 — finance-state client code is triplicated.** The `"finance-state.json"` filename literal
  appears in `resourcemanager.js` (39, the writer), `cloudmanager.js` (31), and
  `procureprograms.js` (48). `readFinanceState` is byte-duplicated in `cloudmanager.js` (98) and
  `procureprograms.js` (87). `STALE_MS = 15_000` is re-declared in both readers
  (`cloudmanager.js` 29, `procureprograms.js` 47). And `isStateStale` lives in `cloudmanager.js`
  (56, exported) with `procureprograms.js` **importing it from there** (44) — one consumer
  importing a shared helper from another consumer instead of from a neutral seam.
- **F5 — `tprintTs` duplicated in four daemon companions.** `common.js` already exports
  `tprintTs` (adopted by `daemon.js`/`hosts.js` in Phase 13), but `resourcemanager.js`,
  `cloudmanager.js`, `procureprograms.js`, and `bootstrap.js` each still carry a **local copy**
  predating Phase 13. Verified: those four define a local `tprintTs`; `daemon.js`/`hosts.js`
  import the shared one.
- **F5b — `common.js`'s own header contradicts the Phase-13 charging model it rests on.** Lines
  1–4 say the module keeps its ns surface cheap "-- **every importer's bundle pays for all of
  it**." That is the *bundle-charging* assumption Phase 9/13 disproved: charging is
  **reachability-based** (an importer pays only for the helpers it actually calls). This header
  is exactly why the four local `tprintTs` copies were never folded in — the (incorrect) fear
  was that importing `tprintTs` would also charge `scanNetwork`/`findPath`/`workerRamCosts`'s ns
  surface. One of the two texts is wrong; F5's fix and this header correction must land together.
- **F6 — `totalAllocatableRam` duplicated, byte-identical, in `daemon.js` (154–158) and
  `sharecurve.js` (14–18)** — same `home ? HOME_RESERVE_GB : 0` reserve handling. Both files
  already import from `hosts.js`, which is where `HOME_RESERVE_GB` itself lives; the helper
  belongs next to it. Pure arithmetic over host records — no ns surface at all.
- **F7 — three untested pure helpers.** `standardSizes` (`cloudcosts.js` 8, already exported,
  feeds `purchasecloudservers.js`'s arg validation); `nextIndex` (`renamecloudservers.js` 18,
  **module-private**); `nextInstanceNumber` (`upgradecloudserver.js` 18, **module-private**).
  Testing the latter two means exporting them first (trivial, house style).
- **F8 — ambiguous "budget" label** (`daemon.js`). The status line at 823 prints
  `budget ${ns.format.ram(totalMaxRam)}` — that's the **whole-fleet** allocatable total. The
  share line at 869 separately prints `batch budget ${ns.format.ram(batchBudgetGb)}` — the
  post-share-carve batch budget. Two different numbers, both under the word "budget."

## The enabling fact (why the F4/F5/F6 moves are RAM-safe)

Same premise Phase 13 relied on and re-confirmed live: **Netscript RAM charging is
reachability-based, not whole-file/bundle** (Phase 9's `share`→`sharePool` result; Phase 13's
gate). Co-locating helpers in a shared module does **not** cross-charge importers for helpers
they never call. Concretely for this phase:

- Importing `tprintTs` from `common.js` pays for `ns.tprint` only — **not** for `scanNetwork`'s
  `ns.scan` or `workerRamCosts`'s `ns.getScriptRam`, because the importer never reaches them.
  The four companions already call `ns.tprint` via their local copies, so RAM stays **flat**.
- A new `financestate.js` whose helpers reach only `ns.read` (0 GB) + pure logic adds nothing to
  its consumers, who already `ns.read` the same file today.
- `totalAllocatableRam` is pure arithmetic (no ns surface); moving it changes no reachable ns
  call for either importer.

F5b's header contradiction is the visible symptom of the old (wrong) belief. The RAM gate is
the arbiter: if a converted consumer's RAM stays flat, reachability holds and the header gets
corrected to say so.

## Decisions

1. **New module `src/financestate.js` (F4).** Holds the finance-state *client* seam: the
   `FINANCE_STATE_FILE = "finance-state.json"` constant, `STALE_MS`, `readFinanceState(ns)`
   (`ns.read` + `JSON.parse`, tolerant of empty/malformed), and `isStateStale` (pure, moved
   out of `cloudmanager.js`). `cloudmanager.js` and `procureprograms.js` import all four and
   delete their local copies; `procureprograms.js` stops importing `isStateStale` *from
   `cloudmanager.js`*. `resourcemanager.js` (the writer) imports **only** `FINANCE_STATE_FILE`
   — it never reads or staleness-checks. Charter mirrors `common.js`: cheap ns surface
   (`ns.read` only), no policy, no cross-module cycles.
   *(Branch: rejected folding this into `common.js` — see Rejected alternatives.)*
2. **Consolidate `tprintTs` onto `common.js` (F5) and correct `common.js`'s header (F5b).**
   `resourcemanager.js` / `cloudmanager.js` / `procureprograms.js` / `bootstrap.js` import
   `tprintTs` from `common.js` and delete their local definitions. In the same edit, rewrite
   `common.js`'s 1–4 header so it states the **reachability** model (an importer pays only for
   the helpers it actually calls) instead of "every importer's bundle pays for all of it." The
   RAM gate on a converted consumer confirms the direction before the text is finalized.
3. **Move `totalAllocatableRam` into `hosts.js` (F6),** exported, next to `HOME_RESERVE_GB`.
   `daemon.js` and `sharecurve.js` import it and delete their local copies. `daemon.js` keeps
   its existing `HOME_RESERVE_GB` import (still used at 142); `sharecurve.js`, which used
   `HOME_RESERVE_GB` *only* inside the moved helper, drops that import and imports the helper
   instead. The helper stays pure (host records in, GB out) so it's unit-testable.
4. **Fix `trimLog`'s pinned-branch off-by-one (F2).** When pinning, drop one extra real entry so
   the result is exactly `DAEMON_LOG_MAX_ENTRIES`: return `[modeEvent, ...entries.slice(overflow
   + 1)]`, and extend the `dropped` slice to `entries.slice(0, overflow + 1)` (still filtering
   out the pinned mode index) so the `openSkipRecords` cleanup still fires for the newly-dropped
   entry. Not a pure one-liner — both the kept slice and the dropped slice shift by one — so the
   spec must keep the skip-record bookkeeping correct. `trimLog` is already a pure function;
   add/extend a unit test asserting the pinned result length is `MAX`, not `MAX + 1`.
5. **Reset the income display at the day boundary (F3).** Track the day the running total
   belongs to — the cleanest signal is the transactions filename already computed each poll
   (`transactionsFileName(new Date())`), since that literally *is* the rotation boundary. When
   it changes from the last observed value, reset `todayIncomeTotal = 0` and
   `firstIncomeTimestamp = null` before folding in the current delta. Extract the rollover
   decision as a tiny pure helper (e.g. `dayRolledOver(prevFile, curFile)` or a day-key compare)
   so it gets a unit test; the ns-touching read/write stays in the loop.
6. **Disambiguate the F8 label.** Rename the 823 status-line label from `budget` to a
   fleet-total word — proposed **`fleet`** (`fleet ${ns.format.ram(totalMaxRam)}`) — leaving
   "batch budget" (869) as the only "budget" on screen. Text-only; pick the exact word at spec
   time (see Open questions).
7. **Backfill tests for the F7 helpers.** Add vitest coverage for `standardSizes` (already
   exported), and export + test `nextIndex` (`renamecloudservers.js`) and `nextInstanceNumber`
   (`upgradecloudserver.js`). Export-for-test only; no behavior change to either script.

## Rejected alternatives

- **Fold finance-state helpers into `common.js`** instead of a new `financestate.js` — rejected.
  `common.js`'s charter is generic network/worker helpers with an `ns.scan`/`ns.tprint`/
  `ns.getScriptRam` surface; finance-state is a specific data-shape concern with its own
  filename constant and staleness policy. Phase 13 set the precedent of keeping domain-specific
  helpers in their owning module (`standardSizes` stayed in `cloudcosts.js`, not `common.js`).
  A dedicated seam keeps `common.js` from becoming a junk drawer.
- **Split the phase — ship F4/F5/F6 (needs a RAM gate) separately from F2/F3/F7/F8** — rejected
  as unnecessary overhead. The small fixes are independent and low-risk; bundling them costs one
  extra `npm test` run, not an extra gate, and keeps the audit closed in one changelog entry.
- **Leave `common.js`'s header alone and just add the imports (F5)** — rejected. The header is
  *why* the duplication persisted; leaving a live falsehood in the module that the next
  refactorer will read (and be misled by) defeats the point. Fix both together (Decision 2).
- **Rewrite F3 as a full "income since X" reconciliation** (handle the daemon-restart baseline
  gap too) — out of scope. That gap is a separately documented, accepted limitation
  (`transactionsmonitor.js` 10–14); F3 is only the midnight reset.
- **Chase F2 with its own live cycle** — rejected; it's a pure-function fix with a unit test and
  no live-observable effect (2001 vs 2000 in a ring buffer). It rides this phase's `npm test`.

## Open questions (for the spec stage / Kenneth)

1. **F8 wording** — `fleet` vs `total` vs `capacity` for the 823 label. Lean: `fleet` (matches
   the daemon's fleet vocabulary). Purely cosmetic; not blocking.
2. **F3 test seam** — is a pure `dayRolledOver` helper worth extracting for one unit test, or is
   a documented live/visual check enough for a display-only fix? Lean: extract it — the project
   values a testable seam over "trust me," and it's a three-line pure function. Spec decides.
3. **RAM-gate file set.** Expected: `financestate.js` (new), `cloudmanager.js`,
   `procureprograms.js`, `resourcemanager.js`, `bootstrap.js`, `common.js`, `hosts.js`,
   `daemon.js`, `sharecurve.js`. All expected **flat**. Spec stage should grep for any other
   importer of a changed export and add it if reachability changed. Per the logged-output
   convention, read the gate from `ramcheck.js` → `logs/ramcheck-result.json`, **not** `mem`/
   terminal — and refresh the viteburner dev-server connection before measuring (known
   stale-export gotcha).

## Out of scope

- Any new game behavior; any batching / scheduling / finance / targeting math change.
- The `transactionsmonitor.js` daemon-restart baseline gap (accepted limitation, distinct from
  F3's midnight reset).
- The physical `src/` subfolder split, the role-map README, and the `Phase N` comment sweep
  (separate BACKLOG items, not audit findings).
- Any Singularity work — none of these findings touches a Singularity call site.

## Validation sketch (the spec stage fills in detail)

- **Tests (`npm test`, I can run and clear myself):** new/extended units for `trimLog` (pinned
  length == `MAX`), the F3 rollover helper, `standardSizes`, `nextIndex`, `nextInstanceNumber`,
  and `totalAllocatableRam` (now a testable pure export). No existing test should change
  behavior — only import paths / new exports.
- **RAM gate (`ramcheck.js` → `logs/ramcheck-result.json`):** before/after on the Open-question-3
  file set; expect **flat everywhere**. Any unexplained delta → run the identifier-hygiene check
  before sign-off, and it also decides F5b's header wording. Waits on Kenneth's in-game run
  (per the ship gate).
- **Live (behavior-preserving bar — "nothing moved"):** a daemon session after the change with
  `npm run verify:log` green in the same character as prior acceptance runs; the tail window
  shows the F8 label reading `fleet …` and `batch budget …` as two distinct numbers. F3's
  midnight reset is structurally hard to force on demand — record it as an observe-at-next-
  midnight check, or (optional) a manual clock-forward test, rather than blocking sign-off on it.
