# Phase 16 spec: Fable audit cleanup — F2–F8

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner
watcher that syncs into the game). Requirements: `phase-16-audit-cleanup.features.md` — read it
first; this spec assumes it.

This closes findings **F2–F8** from the 2026-07-06 Fable full-repo audit (`BACKLOG.md`, "Fable
discoveries"; F1 shipped in Phase 15). It is a **behavior-preserving housekeeping phase**: three
dedup / shared-seam extractions (F4/F5/F6), three small correctness/display fixes (F2/F3/F8),
and test backfill (F7). No batching, scheduling, finance, or targeting math changes. The safety
net is `npm test` (I can run and clear myself), a RAM gate on the import-graph moves (waits on
Kenneth's in-game run), and a before/after daemon session — there are no new features to drive.

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked **[code]**.
Kenneth does everything marked **[live]**. No [live] step requires editing code.

## Ground rules

- `CLAUDE.md` rules apply in full: verify NS API signatures/RAM costs against `markdown/`
  before use, no community solutions, no game-source reading, no spoilers.
- **No Singularity calls** — none of these findings touches a Singularity call site (F4's
  `procureprograms.js` edits are to its finance-state client code, not its Singularity ladder).
- **Transactions log: N/A** — nothing here spends money; no `recordTransaction` call sites.
  Stated so the omission is visibly deliberate. F3 edits the income *display* accounting in
  `transactionsmonitor.js`, not the on-disk record path.
- **Identifier hygiene (Phase 9's lesson):** new/moved exported names — `financestate.js`'s
  `readFinanceState`, `isStateStale`, `FINANCE_STATE_FILE`, `STALE_MS`; `hosts.js`'s
  `totalAllocatableRam`; the F3 rollover helper; the newly-exported `nextIndex` /
  `nextInstanceNumber`; and `daemon.js`'s newly-exported `trimLog` / `DAEMON_LOG_MAX_ENTRIES` —
  checked against `NetscriptDefinitions.d.ts`; none matches an ns function name. Re-check any
  name the implementer adds beyond this spec.
- **Reachability-based charging is the load-bearing premise** (Phase 9/13). Every "flat RAM"
  claim below rests on it; the RAM gate re-confirms it, and it is the arbiter of F5b's header
  wording (Work item 2).
- Pure logic lives in exported ns-free functions, unit-tested per existing patterns; ns-touching
  code stays in its owning module.
- Worktree/branch conventions as prior phases (suggest branch `phase16-audit-cleanup`);
  local-first, merge/push only after the RAM gate + live session per the ship gate. Commit this
  spec + the features file with the code.
- **Kill+restart the dev server at the start of the RAM-gate step** (standing stale-connection
  workaround), and byte-check `dist/src/*` against the pushed files before trusting any reading.

## Spec-stage decisions

The features file left three open questions; resolved here as decided-with-rationale:

- **S1 — F8 label word is `fleet`.** The 823 status line becomes `fleet ${ns.format.ram(
  totalMaxRam)}`, leaving `batch budget` (869) as the only "budget" on screen. Rationale: matches
  the daemon's existing "fleet" vocabulary and reads as the whole-fleet allocatable total, which
  is what `totalMaxRam` is. Cosmetic; no other candidate (`total`/`capacity`) is clearer.
- **S2 — F3 gets a pure rollover helper, unit-tested.** `dayRolledOver(prevFilename,
  curFilename)` (pure, ns-free) is extracted and tested; the ns-touching read/write stays in the
  monitor loop. Rationale: the project prefers a testable seam over a "trust me" display-only
  fix, and it's a three-line function. (Resolves features Open question 2.)
- **S3 — the F4/F5/F6 moves are done as one consolidation pass sharing one RAM gate**, with the
  small fixes (F2/F3/F8) and tests (F7) riding the same branch and `npm test`. Rationale:
  features-doc Goal — F4 and F5 touch the same four files; splitting costs an extra gate for no
  safety benefit. RAM-gate file set fixed in the RAM gate section below.

## Design

### Work item 1 — `src/financestate.js`, the finance-state client seam (F4) [code]

New module. Charter (state in its header, mirroring `common.js`): *finance-state.json client
helpers shared by its consumers; cheap ns surface (`ns.read` only), no policy, no cross-module
cycles.* Contents:

- `export const FINANCE_STATE_FILE = "finance-state.json";`
- `export const STALE_MS = 15_000;` — carry the existing value and its rationale comment
  (`cloudmanager.js:29`: ">7 resource-manager polls at POLL_MS=2000").
- `export function readFinanceState(ns)` — the byte-identical body currently in
  `cloudmanager.js` (98) / `procureprograms.js` (87): `ns.read(FINANCE_STATE_FILE)` →
  `JSON.parse`, tolerant of empty/malformed (returns `null` on empty/parse failure, exactly as
  today — preserve the current empty/catch behavior verbatim; do not "improve" it).
- `export function isStateStale(stateTimestamp, now, staleMs)` — moved verbatim from
  `cloudmanager.js` (56), pure.

Rewiring:

- `cloudmanager.js`: delete its local `FINANCE_STATE_FILE` (31), `STALE_MS` (29),
  `readFinanceState` (98), and `isStateStale` (56); import all four from `financestate.js`. Its
  call sites (131–132) are unchanged in shape.
- `procureprograms.js`: delete its local `FINANCE_STATE_FILE` (48), `STALE_MS` (47), and
  `readFinanceState` (87); **remove `import { isStateStale } from "./cloudmanager.js"` (44)** and
  import `isStateStale` (plus the other three) from `financestate.js`. Call sites (155–156)
  unchanged in shape.
- `resourcemanager.js` (the writer): replace its local `STATE_FILE = "finance-state.json"` (39)
  with `import { FINANCE_STATE_FILE } from "./financestate.js"` and use that name at its write
  site. It imports **only** the filename constant — it never reads or staleness-checks.

Charter compliance: `readFinanceState` reaches only `ns.read` (0 GB); `isStateStale` is pure;
constants are pure. Consumers already `ns.read` this file / already carry these values today, so
RAM is **flat** on all three (reachability premise). No import cycle: `financestate.js` imports
nothing from its consumers (this is the fix for `procureprograms → cloudmanager`).

### Work item 2 — consolidate `tprintTs` and correct `common.js`'s header (F5 / F5b) [code]

- `resourcemanager.js`, `cloudmanager.js`, `procureprograms.js`, `bootstrap.js`: delete each
  local `tprintTs` definition and `import { tprintTs } from "./common.js"` instead. Verified
  those four carry local copies; `daemon.js`/`hosts.js` already import the shared one, so this
  brings the last four in line.
- **In the same change, rewrite `common.js`'s header (lines 1–4).** Replace the clause "-- every
  importer's bundle pays for all of it" with the reachability model: an importer is charged only
  for the ns surface of the helpers it actually calls (Phase 9/13), so co-locating helpers here
  does not cross-charge importers for helpers they never reach. Keep the rest of the charter
  (cheap surface: `ns.scan`/`ns.tprint`/`ns.getScriptRam`; nothing `ns.cloud.*`, nothing
  Singularity). The RAM gate on a converted consumer (Work item 1/2 files) is the arbiter: flat
  RAM confirms reachability and finalizes this wording. (If — contrary to Phase 13 — a consumer's
  RAM *rose* by importing `tprintTs`, that is a bust: stop, re-open with the identifier-hygiene
  trace, and the header stays as-is; not expected.)

`tprintTs` reaches only `ns.tprint`; the four consumers already call `ns.tprint` via their local
copies, so RAM is **flat**.

### Work item 3 — move `totalAllocatableRam` into `hosts.js` (F6) [code]

- Add `export function totalAllocatableRam(hosts)` to `hosts.js`, next to `HOME_RESERVE_GB`,
  body byte-identical to the current copies (`home ? HOME_RESERVE_GB : 0` reserve, sum of
  `maxRam - reserve` — preserve exactly, including the `Math.max(0, …)` treatment if present in
  the source; copy from `daemon.js:154-158`). Pure — no ns surface.
- `daemon.js`: delete its local `totalAllocatableRam` (154–158); import it from `hosts.js`. It
  **keeps** its existing `HOME_RESERVE_GB` import (still used at 142). Call site 527 unchanged.
- `sharecurve.js`: delete its local `totalAllocatableRam` (14–18); import it from `hosts.js`.
  It used `HOME_RESERVE_GB` **only** inside that helper, so **drop `HOME_RESERVE_GB` from its
  `hosts.js` import** (keep `listHosts`) and add `totalAllocatableRam`. Call site 29 unchanged.
  Implementer: confirm via grep that `sharecurve.js` has no other `HOME_RESERVE_GB` use before
  dropping the import.

Both files already import from `hosts.js`; the helper is pure, so RAM is **flat** on both.

### Work item 4 — fix `trimLog`'s pinned-branch off-by-one (F2) [code]

In `daemon.js`'s `trimLog` (235–260), the pinned branch currently returns `MAX + 1` entries.
Fix so the pinned result is exactly `DAEMON_LOG_MAX_ENTRIES`:

- Pinned `dropped` slice widens by one: `entries.slice(0, overflow + 1).filter((_, i) => i !==
  latestModeIndex)` (still valid — `pinned` guarantees `latestModeIndex < overflow < overflow +
  1`, so the mode event is inside the widened slice and correctly excluded). This keeps the
  `openSkipRecords` cleanup firing for the one extra dropped entry (old index `overflow`).
- Pinned return becomes `[entries[latestModeIndex], ...entries.slice(overflow + 1)]` → length
  `1 + (MAX - 1) = MAX`.
- **Non-pinned branch unchanged** (`dropped = entries.slice(0, overflow)`, return
  `entries.slice(overflow)` → length `MAX`).

`trimLog` is already pure but **module-private** — `daemon.js` currently exports only `main`.
To make it unit-testable, **add `export` to `trimLog` and to `DAEMON_LOG_MAX_ENTRIES`** (the
length assertion needs the cap value; export it rather than hardcode `2000` in the test).
Identifier hygiene: neither `trimLog` nor `DAEMON_LOG_MAX_ENTRIES` matches an ns function name.
Export-for-test only — no behavior change. Add unit coverage (Work item 7) asserting: pinned
result length == `DAEMON_LOG_MAX_ENTRIES` (not `+ 1`); the pinned mode event is at index 0; a
`skip` record dropped by the *widened* slice triggers its `openSkipRecords` deletion.

### Work item 5 — reset the income display at the day boundary (F3) [code]

In `transactionsmonitor.js`'s loop (33–99):

- Compute the transactions filename **once** at the top of each poll
  (`transactionsFileName(new Date(now))`), replacing the two separate computations at 48 and 76
  (they already refer to the same instant within a poll; consolidating is behavior-neutral and
  needed for the check below). Reuse it for both the delta-write block and the display header.
- Track `let currentDayFile = null;` alongside the running totals. Each poll, **before** folding
  in the delta: if `dayRolledOver(currentDayFile, filename)` is true, reset `todayIncomeTotal =
  0` and `firstIncomeTimestamp = null`; then set `currentDayFile = filename`.
- `export function dayRolledOver(prevFilename, curFilename)` — pure: `return prevFilename !==
  null && prevFilename !== curFilename;`. (First poll: `prevFilename === null` → no spurious
  reset on startup.) Put it in `transactionsmonitor.js` and export for the unit test, or in
  `translog.js` next to `transactionsFileName` if the implementer finds that a more natural home
  — either is fine; the test imports from wherever it lands. It reaches no ns surface.

Effect: a session crossing midnight zeroes "today's hacking income" and the `$/min` rate when
the rotated filename changes, so the total tracks the file actually being displayed. On-disk
records are untouched (already correct). RAM: `transactionsmonitor.js` gains no ns call — flat
(it is in the gate set as a canary; see below).

### Work item 6 — disambiguate the F8 label [code]

In `daemon.js`, change the 823 status line from `budget ${ns.format.ram(totalMaxRam)}` to
`fleet ${ns.format.ram(totalMaxRam)}` (S1). Text-only; no value or field changes; the share
line's `batch budget` (869) is left as-is. No RAM effect.

### Work item 7 — test backfill (F7) [code]

- `standardSizes` (`cloudcosts.js`, already exported): new unit test — powers of two from 16 up
  to the passed limit, inclusive-boundary and below-16 edge cases.
- `nextIndex` (`renamecloudservers.js`, 18): **add `export`**; unit-test the gap-filling/next
  behavior over a set of used indices (including empty set and a set with holes).
- `nextInstanceNumber` (`upgradecloudserver.js`, 18): **add `export`**; unit-test next instance
  number for a given size from a set of owned names (including none owned).
- `trimLog` + `DAEMON_LOG_MAX_ENTRIES` (`daemon.js`): **add `export` to both** (Work item 4);
  unit-test the pinned-length fix per Work item 4's assertions.
- Plus the `dayRolledOver` (Work item 5) and `totalAllocatableRam` (Work item 3, now a testable
  pure export) cases.

Export-for-test only — no behavior change to any of these scripts. Follow the existing
`test/*.test.js` house style (mock-free where possible). New test files or additions to existing
ones per what matches each module's current test layout.

### Work item 8 — BACKLOG / CHANGELOG bookkeeping [code]

- `BACKLOG.md`: move F2–F8 out of "Fable discoveries" as this ships. During the work, add an
  "In Progress" entry pointing at these phase docs; at close-out, replace the F2–F8 bullets with
  a dated condensed entry in `docs/phases/CHANGELOG.md` and graduate both phase docs to
  `docs/phases/`. The "Fable discoveries" preamble already notes F1 was cleared; after this the
  section is empty and can be removed.
- Staged in the same commits as the code they describe (`CLAUDE.md` tracking-work rule).

## RAM gate [code, via `ramcheck.js` → `logs/ramcheck-result.json`]

Kill+restart the dev server first, byte-check `dist/src/*` against the working tree. The current
`logs/ramcheck-result.json` only holds baselines for four scripts, so **capture a fresh baseline
on the full F16 set before making changes**, then re-run after:

`run ramcheck.js daemon.js sharecurve.js hosts.js bootstrap.js cloudmanager.js procureprograms.js resourcemanager.js transactionsmonitor.js`

| script | expected | why |
|---|---|---|
| `daemon.js` | flat (16.30 GB baseline) | F6 helper is pure; F2/F8 add no ns call |
| `bootstrap.js` | flat (6.20 GB baseline) | F5 `tprintTs` reaches only `ns.tprint`, already called |
| `sharecurve.js` | flat | F6 helper pure; drops an unused `HOME_RESERVE_GB` import |
| `hosts.js` | flat | gains a pure export; new export must charge nothing |
| `cloudmanager.js` | flat | F4 helpers reach only `ns.read` (already used); F5 `tprintTs` already called |
| `procureprograms.js` | flat | same as cloudmanager; import source changes, reachable ns surface does not |
| `resourcemanager.js` | flat | imports only a string constant + `tprintTs` (already called) |
| `transactionsmonitor.js` | flat | F3 adds no ns call (pure rollover check) |

Any non-flat delta is a bust → identifier-hygiene hunt (Phase 9/11's `mem`-trace method) before
proceeding, and it decides F5b's header wording (Work item 2). A surviving bust re-opens the
relevant move (e.g. keep a helper module-local rather than shared) — fallback only, since it
costs the dedup. Read the gate from `logs/ramcheck-result.json`, **not** `mem`/terminal, and
refresh the dev-server connection before measuring (stale-export gotcha).

## Live validation [live]

Behavior-preserving bar — "nothing moved." `npm run dev` running (restart it first).

1. After merge/push syncs, restart `daemon.js` and run a normal session (kill + `run
   daemon.js`, or a plain `run daemon.js` letting `killscripts.js` sweep the old instance).
2. **Tail window:** the daemon status line reads `fleet …` and `batch budget …` as two distinct
   numbers (F8). The finance-driven companions (`cloudmanager.js`/`procureprograms.js`/
   `resourcemanager.js`) run without errors and their `tprintTs` notices still carry timestamps
   (F5).
3. `npm run verify:log` green against the exported log, same character as prior acceptance runs
   (no regression from the F4/F5/F6 refactor).
4. **F3 midnight reset** is structurally hard to force on demand — record it as an
   observe-at-next-midnight check (the "today's hacking income" total should drop to the new
   day's figure when the transactions file rotates), **not** a sign-off blocker. Its logic is
   covered by the `dayRolledOver` unit test; the live check is confirmation only.

## Acceptance criteria

- `npm test` green: all pre-existing tests plus Work item 7's new cases (`standardSizes`,
  `nextIndex`, `nextInstanceNumber`, `trimLog` pinned-length, `dayRolledOver`,
  `totalAllocatableRam`), zero failures. (I run and clear this myself.)
- `npm run verify:log` green (unchanged behavior; refactor introduces no new log semantics).
- RAM gate: all eight scripts byte-verified against `dist/src/*` and **flat** vs. the
  fresh baseline, recorded in `logs/ramcheck-result.json`. (Waits on Kenneth's in-game run.)
- Live steps 1–3 pass as described; F3 recorded as observe-at-next-midnight.
- No import cycle remains (`procureprograms.js` no longer imports from `cloudmanager.js`);
  `common.js`'s header states the reachability model.
- BACKLOG/CHANGELOG updated per Work item 8, staged in the same commits as the work.

## Files touched

**New:** `src/financestate.js`.

**Edited (src):** `src/cloudmanager.js`, `src/procureprograms.js`, `src/resourcemanager.js`
(F4); `src/bootstrap.js`, `src/common.js` (F5/F5b); `src/hosts.js`, `src/daemon.js`,
`src/sharecurve.js` (F6; `daemon.js` also F2 + F8 + export-for-test of `trimLog` /
`DAEMON_LOG_MAX_ENTRIES`); `src/transactionsmonitor.js` (F3);
`src/renamecloudservers.js`, `src/upgradecloudserver.js` (F7 export-for-test).

**Tests:** the relevant `test/*.test.js` files for `standardSizes`, `nextIndex`,
`nextInstanceNumber`, `trimLog`, `dayRolledOver`, `totalAllocatableRam` (new files or additions
per each module's existing layout).

**Docs:** `BACKLOG.md`, `docs/phases/CHANGELOG.md`, plus this spec and
`phase-16-audit-cleanup.features.md` at repo root until graduation.

**Deliberately untouched:** all workers, `scheduler.js`, `sampling.js`, `targets.js`,
`translog.js`'s record path (F3 touches only the monitor's display accounting; the
`dayRolledOver` helper may *live* in `translog.js` but adds no behavior there),
`vite.config.ts` (no new exported log), the Singularity ladders, batching/finance math.
