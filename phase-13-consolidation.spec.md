# Phase 13 spec: consistency consolidation — shared helpers (`src/common.js`)

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner
watcher that syncs into the game). Requirements: `phase-13-consolidation.features.md`.

This is a **behavior-preserving refactor** — no new game behavior, no batching/scheduling/
finance math change. It kills the copy-paste the 2026-07-04 audit catalogued (identical
`scanNetwork` copies — **four**, not the audit's three; see S11 — duplicated
`HOME_RESERVE_GB`, duplicated free-RAM preambles, duplicated `standardSizes` builders),
splits `hosts.js`'s overloaded `getHosts` into composable `tryRoot`/`listHosts`, and mints
the helpers the auto-backdoor and darknet phases both depend on — this phase is their hard
prerequisite. The safety net is `npm test`, the RAM gate, and a before/after daemon
session — not new features. One deliberate, flagged exception to "behavior-preserving":
S11 fixes a live double-count bug in `sharecurve.js`'s capacity report (a manual
instrument; the pipeline is untouched).

**What changed since the features file was written (2026-07-05, same day):** Phase 14
(bootstrap) shipped and its live handoff completed — the daemon runs again, so the
≥15-minute daemon session is feasible as written. Phase 14 also added `src/bootstrap.js`,
which **imports `getHosts` from `hosts.js`** (measured 6.20GB at Phase 14's gate, hard
ceiling < 8.00 for future resets) — it joins the RAM gate below. The pre-phase test count
is **231**, not the features file's implied 190.

**The enabling fact (Phase 9, confirmed live):** Netscript RAM charging is
reachability-based, not whole-file/bundle. Co-locating helpers in `common.js` does not
cross-charge importers for helpers they don't call — `connect.js` importing `findPath` pays
for `ns.scan` but not for `workerRamCosts`'s `ns.getScriptRam`, because `connect.js` never
calls it. Every flat-RAM prediction below rests on this; the RAM gate re-confirms it.

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked
**[code]**. Kenneth does everything marked **[live]**. No [live] step requires editing code.

## Ground rules

- `CLAUDE.md` rules apply in full: verify NS API signatures/RAM costs against `markdown/`
  before use, no community solutions, don't read game source, no spoilers beyond current
  progression.
- **Transactions log: N/A this phase** — nothing here spends money, so no `recordTransaction`
  call sites change. Stated so the omission is visibly deliberate.
- **No Singularity anywhere in this phase**; `common.js`'s charter (work item 1) explicitly
  bars `ns.cloud.*` and Singularity so its importers never risk reaching them.
- **Identifier hygiene (Phase 9/11's lesson):** no new identifier, property name, or
  object-literal key may exactly match an NS API function name. New exported names checked
  against `NetscriptDefinitions.d.ts` at spec time: `scanNetwork`, `findPath`, `tprintTs`,
  `workerRamCosts`, `tryRoot`, `listHosts`, `HOME_RESERVE_GB`, `standardSizes` — none is an
  exact NS function/method name (`scan` is, `scanNetwork` isn't; exact-match is the
  confirmed mechanism). Re-check any name invented during implementation.
- Unit tests are vitest in `test/`, following existing patterns. Helpers that take `ns` are
  tested with small hand-rolled fake-`ns` objects (a plain object with just the methods the
  helper touches, table-driven) — no mocking framework, consistent with the house
  "mock-free where possible" style.
- Worktree/branch conventions as prior phases (suggest `worktree-phase13-consolidation`);
  local-first, push/merge after live validation per the standing git authorization. Commit
  this spec + the features file with the code; graduate both to `docs/phases/` at close-out.
- **Kill+restart the dev server at the start of the RAM-gate step** (standing
  stale-connection workaround) rather than diagnosing a stale export reactively.

## Spec-stage decisions

The features file delegated these (its Open questions #1–4) plus a few design details to
the spec stage. Resolved here; the reviewer should treat them as decided-with-rationale.

- **S1 — phase number: 13, final** (features Open question #1). The sibling phase
  (`upgradehomeram.js` → resource-manager customer) has not started — BACKLOG still lists it
  under Next Up — and Phase 14 shipped as bootstrap, so 13 is the lowest free slot and this
  phase claims it. No rename needed.
- **S2 — `HOME_RESERVE_GB` stays defined in `hosts.js`, exported** (features Open question
  #2, taking the features default). It's a host-listing policy value and `common.js`'s
  charter bars policy; `daemon.js` already imports `hosts.js` (`getHosts`), so importing the
  constant adds no new dependency edge and no RAM (a constant reaches no ns call).
- **S3 — run the `WORKER_SCRIPTS`-key E-matrix confirmation during this phase's RAM gate:
  yes, confirm-only** (features Open question #3). It's nearly free while we're measuring
  anyway, and BACKLOG's RAM-analyzer-hygiene item explicitly wants the confirmation. Work
  item 8 adds a throwaway probe script; the result (either outcome) is recorded in that
  BACKLOG item and the probe is deleted before merge. The **rename** stays out of scope.
- **S4 — RAM-gate file set, final** (features Open question #4, grep of every `src/` import
  completed at spec): `hosts.js`, `targets.js`, `killscripts.js`, `connect.js`,
  `launchmonitor.js`, `daemon.js`, `cloudcosts.js`, `purchasecloudservers.js`, **plus three
  the features list missed**: `targetsmonitor.js` (imports `getTargets` from the changed
  `targets.js`), `bootstrap.js` (imports `getHosts` from the changed `hosts.js`; carries
  Phase 14's hard < 8.00 ceiling), and `sharecurve.js` (changed by S11). `common.js` itself
  gets **no standalone gate line** — it has no `main` and is never executed, so its cost
  only manifests through importers; the importer measurements *are* its measurement. No
  other `src/` file imports a changed export (verified: `sampling.js`,
  `procureprograms.js`, `cloudmanager.js`, the remaining monitors and one-shots import only
  unchanged modules or unchanged exports).
- **S5 — `standardSizes` is a pure function `standardSizes(ramLimit)`** (refinement of
  features Decision 8, which assumed the helper itself calls `ns.cloud.getRamLimit()`).
  Both call sites already read `getRamLimit()` themselves, so the helper takes the limit as
  an argument: `standardSizes(ramLimit)` → `[16, 32, ... ≤ ramLimit]`. Pure means it's
  unit-testable mock-free and reaches zero ns calls. It still **lives in `cloudcosts.js`**
  per the features decision — it's cloud-sizing policy, and keeping it out of `common.js`
  keeps that charter clean. RAM stays flat either way (both importers already reach
  `ns.cloud`).
- **S6 — `tryRoot(ns, server)` semantics.** Returns `true` iff the server ends the call
  rooted. Internally: already rooted → `true` immediately (no side effects); otherwise read
  owned openers (`PORT_OPENERS` × `ns.fileExists`) and `ns.getHackingLevel()` per call, and
  if `reqLevel > myHackLevel || reqPorts > owned.length` → `false`; else open all owned
  ports, `ns.nuke`, emit the rooted-host notice via `tprintTs` (same
  `INFO: rooted new host <server>` text, now timestamp-prefixed like the daemon's other
  unpredictable-timing notices — fixing the features-flagged missing timestamp), → `true`.
  Reading openers/level per call instead of hoisting them is deliberate: it keeps the
  future backdoor phase's call signature trivial (`tryRoot(ns, "CSEC")`), and once-per-name
  RAM charging plus the small candidate count make the repeated reads free in both GB and
  time.
- **S7 — `getHosts` composes as: rooting pass, then `listHosts`.** `getHosts(ns)` = for
  each `scanNetwork(ns)` host not in `ns.cloud.getServerNames()`, call `tryRoot(ns, host)`
  (result deliberately unused — rooting is the point); then `return listHosts(ns)`. The
  returned records are identical to today's (rooted network hosts + purchased + home with
  the reserve held back); the only observable delta is the notice's new timestamp prefix.
  The second network scan this implies is free RAM-wise (once-per-name charging) and
  trivial time-wise (same BFS the old code ran once). `listHosts(ns)`'s network pass
  **must skip members of `ns.cloud.getServerNames()`** (mirroring today's line-50
  `continue`) and filter the rest with `ns.hasRootAccess`; purchased servers are then
  appended once, unconditionally (they're always rooted — today's behavior); home is
  reported with `Math.max(0, max - used - HOME_RESERVE_GB)` exactly as today. The
  purchased-skip is load-bearing, not pedantry: purchased servers **do** appear in
  `ns.scan`'s results and have root, so a naive "filter by root, then append purchased"
  double-counts every purchased server — exactly the live bug `sharecurve.js`'s local
  `listHosts` has today (S11) — and would inflate the pool the daemon allocates against.
  Work item 9 pins this with a dedicated test.
- **S8 — `launchmonitor.js`'s expected RAM delta: −0.65GB, quantified** (correcting
  BACKLOG's stale "not a RAM fix" parenthetical, per features Decision 6). Switching to
  `listHosts` stops reaching: `fileExists` 0.10, `getHackingLevel` 0.05,
  `getServerRequiredHackingLevel` 0.10, `getServerNumPortsRequired` 0.10, the five opener
  functions 5 × 0.05 = 0.25, `nuke` 0.05 — total **0.65GB** (costs re-verified against
  `markdown/` at implementation, per ground rules). The rest of the file
  (`ps`/`ui`/`print`/`sleep`) is untouched. Gate expects the measured drop to match.
- **S9 — RAM-gate baseline protocol.** Known baselines from Phase 14's recorded gate:
  `daemon.js` 16.30, `killscripts.js` 3.00, `bootstrap.js` 6.20. The other seven files have
  no recorded baseline, so **live step 1 captures one ramcheck run on `master`** (before
  the branch is synced into the game) covering the full S4 set — the before/after
  comparison then reads off two `logs/ramcheck-result.json` snapshots, not memory.
- **S10 — named contingency for a +0.40GB delta on `hosts.js`/`killscripts.js`/
  `connect.js`.** These three currently import nothing; after this phase each imports
  `common.js`, which imports `scheduler.js` (for `WORKER_SCRIPTS`, used only by
  `workerRamCosts`) — identical new transitive topology, so all three carry the identical
  contingency. Under Phase 9's reachability model all stay flat (none calls
  `workerRamCosts`, so the `WORKER_SCRIPTS` literal — the suspected `hack`/`grow`/`weaken`
  key phantom — is unreachable from their mains). Every *other* gated file already imports
  `scheduler.js` directly or transitively today, so any import-chain phantom is already in
  its baseline — no delta expected there either way. If any of the three instead comes
  back **+0.40GB**, that's the key-phantom charging through the import chain: record it as
  the E-matrix answer (it makes work item 8's probe partly redundant — reconcile the two
  readings), and apply the pre-authorized fallback — move `workerRamCosts` out of
  `common.js` into its own tiny module (suggest `src/workerram.js`) imported only by
  `daemon.js`/`targets.js`, so `common.js` loses its `scheduler.js` edge. That deviates
  from features Decision 2, is justified only by a measured bust, and gets flagged in the
  close-out if taken.
- **S11 — `sharecurve.js` joins the scope: the audit undercounted (spec-review
  discovery).** `sharecurve.js` holds a **fourth** byte-identical `scanNetwork` (19–36), a
  **third** `HOME_RESERVE_GB = 32` (17, with a comment citing exactly the copy-paste
  precedent this phase removes), and a local `listHosts` (39–43) whose
  "filter network by root, then append purchased" construction **double-counts every
  purchased server** (they appear in both) — a real live bug inflating its capacity
  report. The features file's "three copies" audit missed all of it. Resolution: fold it
  in. Delete the local `scanNetwork`, `listHosts`, and `HOME_RESERVE_GB` (+ its stale
  comment); import `listHosts` and `HOME_RESERVE_GB` from `./hosts.js` (the shared
  `listHosts`'s records are a superset — `freeRam` added — so `totalAllocatableRam`'s
  `maxRam` reads still work). The capacity number this prints/exports **changes**
  (decreases): that's the double-count fix, a deliberate behavior change in a manual
  report instrument, flagged here rather than folded in silently. Its
  `totalAllocatableRam` duplication with `daemon.js` stays out of scope (not in the audit;
  noted for a later pass). Expected RAM: **+0.05** — the shared `listHosts` newly reaches
  `ns.getServerUsedRam` (0.05), which `sharecurve.js` never called before; acceptable for
  a manual one-shot and quantified in the gate.

## Design

### Work item 1 — `src/common.js` [code]

New module. Header states the charter verbatim-ish: *ns-dependent helpers shared by 2+
scripts; no policy decisions, no batching/finance math; keep the ns surface minimal and
cheap (`ns.scan`, `ns.tprint`, `ns.getScriptRam`); nothing `ns.cloud.*`, nothing
Singularity.* One import: `WORKER_SCRIPTS` from `./scheduler.js` (pure, ns-free; the edge
is one-way, no cycle). Contents, each exported:

- `scanNetwork(ns)` — moved **verbatim** from the four byte-identical copies
  (`hosts.js` 15–32, `targets.js` 8–25, `killscripts.js` 5–22, `sharecurve.js` 19–36; the
  features audit said three — S11): BFS from `home`, returns every discovered hostname
  (excluding `home` itself — unchanged semantics).
- `findPath(ns, target)` — moved verbatim from `connect.js` 7–29: BFS parent-chain walk,
  returns the hop list from `home` to `target` inclusive, or `null` if unreachable.
- `tprintTs(ns, message)` — moved verbatim from `daemon.js` 92–94, doc comment included
  (the "unpredictable-timing notifications get timestamps" rationale).
- `workerRamCosts(ns)` — the three-worker `getScriptRam` map both `targets.js` 70–74 and
  `daemon.js`'s `refreshCycle` 422–427 currently build:
  `{ [WORKER_SCRIPTS.hack]: ns.getScriptRam(WORKER_SCRIPTS.hack, "home"), ... }` for
  exactly the three batch workers. **No share key and no include-share flag** (features
  Decision 4): `WORKER_SCRIPTS` deliberately means "the three targeted batch workers"
  (scheduler.js's own comment), and the daemon's spread at its single share-needing call
  site is a one-liner.

### Work item 2 — `src/hosts.js` restructure [code]

- Delete the local `scanNetwork`; import it (and `tprintTs`) from `./common.js`.
- `export const HOME_RESERVE_GB = 32;` (was private).
- New exported `tryRoot(ns, server)` per S6; new exported `listHosts(ns)` per S7;
  `getHosts(ns)` becomes the S7 composition and keeps its current doc comment updated to
  describe the split. `PORT_OPENERS` stays private to `hosts.js`.
- The rooted-host notice moves from bare `ns.tprint` (line 59) into `tryRoot` via
  `tprintTs` — same message text, now timestamped.
- `main` (the manual `run hosts.js` summary) is untouched apart from calling the composed
  `getHosts`.

### Work item 3 — rewire `targets.js`, `killscripts.js`, `connect.js`, `sharecurve.js` [code]

- `targets.js`: delete local `scanNetwork` (8–25), import `scanNetwork` and
  `workerRamCosts` from `./common.js`; replace the local `workerRamCosts` object literal
  (70–74) with `const ramCosts = workerRamCosts(ns);` and update the references inside
  `getTargets` (local rename avoids shadowing the imported function). `isEligibleTarget`
  and all ranking logic untouched.
- `killscripts.js`: delete local `scanNetwork` (5–22), import from `./common.js`. Header
  already correct (features Decision 10 — BACKLOG's fix for it shipped earlier; no-op).
- `connect.js`: delete local `findPath` (7–29), import from `./common.js`. Behavior
  (print path + files, read-only) untouched.
- `sharecurve.js` (per S11): delete local `scanNetwork` (19–36), `listHosts` (39–43), and
  `HOME_RESERVE_GB` + its stale comment (13–17); import `listHosts` and `HOME_RESERVE_GB`
  from `./hosts.js`. `totalAllocatableRam` and everything below it unchanged. The
  capacity-report fix this carries is S11's flagged behavior change.

### Work item 4 — `daemon.js` internal cleanup [code]

- Delete local `tprintTs` (92–94); import it from `./common.js`.
- Delete the private `HOME_RESERVE_GB` (80) **and its justifying comment (75–79)** — the
  comment leans on the scanNetwork-triple-copy precedent this phase removes; import the
  constant from `./hosts.js` (already an import source for `getHosts`). Both readers of
  the constant — `refreshFreeRam` and `totalAllocatableRam` — are otherwise unchanged.
- Replace `refreshCycle`'s four-line ramCosts build (422–427) with
  `ramCosts = { ...workerRamCosts(ns), [SHARE_SCRIPT]: ns.getScriptRam(SHARE_SCRIPT, "home") };`
  (`workerRamCosts` imported from `./common.js`; `SHARE_SCRIPT` already imported).
- Factor the identical free-RAM-check preamble out of `launchDetached` (102–110) and
  `runAndWait` (122–130) into one **daemon-local** helper (suggest `fitsOnHome(ns, script)`
  → boolean, printing the INFO skip itself when false; name checked, no NS collision). Make
  the skip message call-site-neutral: drop "at startup" (suggest
  `INFO: skipped <script> -- needs X but only Y free on home`). Not exported — it's
  daemon-internal and there's no second customer.
- Fix `runAndWait`'s doc comment (117–121): its real sole customer is `killscripts.js`
  (line 323), a cheap non-Singularity one-shot the daemon must wait out before launching
  workers. Move the Singularity-doesn't-fit narration to `launchDetached`'s comment, where
  `procureprograms.js` actually runs.

### Work item 5 — `launchmonitor.js` → `listHosts` [code]

Swap both `getHosts` call sites (29, 42) to `listHosts` (import change on line 15). Rewrite
the header's "read-only pattern" paragraph to say it deliberately uses the **non-rooting**
`listHosts` so the read-only claim is true (today it nukes newly-rootable servers from
inside a monitor, racing the daemon's refresh — the features-flagged live falsehood).
Behavior consequence, acceptable and intended: the monitor no longer roots; newly rooted
hosts appear on its next `HOST_REFRESH_MS` (10s) refresh after the daemon roots them.
Expected RAM: **−0.65GB** per S8.

### Work item 6 — `cloudcosts.js` exports `standardSizes`; `purchasecloudservers.js` imports it [code]

Per S5: `cloudcosts.js` exports pure `standardSizes(ramLimit)` (the
`for (size = 16; size <= ramLimit; size *= 2)` builder); its `main` uses it;
`purchasecloudservers.js` deletes its local copy (14–16) and imports it. Both keep their
own `ns.cloud.getRamLimit()` read. RAM flat on both (already reach `ns.cloud`).

### Work item 7 — delete both dead files [code + live]

- **[code]** `git rm src/cleanup-old-daemon-log-temp.js` (run-once, job done) and root-level
  `cloud-server-costs.js` (stale duplicate of `src/cloudcosts.js`; never synced —
  `vite.config.ts` watches `src/**` only).
- **[live]** viteburner won't delete in-game copies: in-game,
  `rm cleanup-old-daemon-log-temp.js` (it was under `src/`, so a synced copy exists — check
  `ls home` first and report what's found). `cloud-server-costs.js` never synced; confirm
  absence rather than assuming.

### Work item 8 — E-matrix probe for the `WORKER_SCRIPTS`-key phantom [code + live, confirm-only]

Per S3. **[code]** Add throwaway `src/ramprobe-workerkeys.js`:
`import { WORKER_SCRIPTS } from "./scheduler.js";` and a `main(ns)` whose only ns call is
`ns.print(Object.values(WORKER_SCRIPTS).join(","))` (`print` is 0GB; `Object.values` makes
the literal reachable). Predicted readings: **1.60GB** → object-literal keys are *not*
charged (phantom theory dead for keys); **2.00GB** → the `hack`/`grow`/`weaken` keys are
charged (0.10 + 0.15 + 0.15 phantom confirmed; the rename becomes a justified future
phase). **[live]** it rides the same ramcheck run as the gate (S4 set + this probe).
**[code]** after the reading: record the result (either outcome) in BACKLOG's
"RAM-analyzer identifier hygiene" item, delete the probe from the branch before merge, and
**[live]** `rm ramprobe-workerkeys.js` in-game. Reconcile with S10's reading if that
contingency fired.

### Work item 9 — unit tests [code]

New `test/common.test.js` and additions to `test/targets.test.js`-style coverage for
`hosts.js` (new `test/hosts.test.js`). Fake-`ns` style per ground rules (plain objects,
only the methods touched). No existing test's *assertions* change — only import paths, if
any test reaches a moved helper (none does today; the moves are of private functions).

- `scanNetwork` (fake `ns.scan` over an adjacency table): linear chain; branching tree;
  cycle back toward `home` (visited-set terminates); `home` excluded from results;
  lone-`home` network → `[]`.
- `findPath`: multi-hop path returned in `home → … → target` order inclusive of both ends;
  `findPath(ns, "home")` → `["home"]`; unreachable target → `null`.
- `workerRamCosts` (fake `ns.getScriptRam` returning distinct values per filename):
  exactly the three `WORKER_SCRIPTS` filenames as keys — **no share key** (pins features
  Decision 4); values map through correctly.
- `tprintTs` (fake `ns.tprint` capturing its argument): output is
  `[<something>] <message>` — prefix present, message preserved verbatim.
- `tryRoot`: already-rooted → `true`, no opener/nuke calls (capture-list fake); rootable
  (level and ports satisfied) → openers invoked for owned programs only, `nuke` called,
  notice emitted, `true`; level too high → `false`, no nuke; ports exceed owned openers →
  `false`, no nuke.
- `listHosts`: unrooted network host excluded; rooted included with max/free RAM; purchased
  servers included unconditionally; **a purchased server that also appears in the network
  scan (as they all do live) appears in the result exactly once** — the S7/S11
  double-count regression pin; home reserve math incl. the `Math.max(0, …)` clamp
  (used < reserve case).
- `getHosts` composition: a fake network where one host is newly rootable → it appears in
  the returned list (root-then-list ordering pinned).

`npm test` green: all 231 pre-existing tests plus the above.

### Work item 10 — BACKLOG/CHANGELOG bookkeeping [code]

Staged in the same commits as the work (standing rule):

- Move the "Consistency consolidation" Next Up item to a dated, condensed
  `docs/phases/CHANGELOG.md` entry at close-out; update the priority-order note (item 1 of
  the two-item sequence is done; also correct its `tryRoot` wording — the helper lives in
  `hosts.js`, per features Decision 3).
- Record the work-item-8 probe result in the "RAM-analyzer identifier hygiene" item.
- Correct the stale "(Correctness fix, not a RAM fix — bundle charging means it already
  paid.)" parenthetical in the darknet/consolidation text if it survives the move (features
  Decision 6 / S8).
- At close-out: graduate `phase-13-consolidation.features.md` + this spec to `docs/phases/`.

## RAM gate [live ramcheck runs; code reacts to busts]

Kill+restart the dev server first (standing workaround). Baselines per S9: one `master`
run before the branch syncs (live step 1), then the after run on the branch (live step 3).
Command both times:
`run ramcheck.js hosts.js targets.js killscripts.js connect.js launchmonitor.js daemon.js cloudcosts.js purchasecloudservers.js targetsmonitor.js bootstrap.js sharecurve.js ramprobe-workerkeys.js`
(probe only exists in the after run) → `logs/ramcheck-result.json`, both snapshots kept for
the phase record.

| script | baseline | gate |
|---|---|---|
| `daemon.js` | 16.30 (Phase 14) | **exactly flat** — imports moved, reachable ns set unchanged |
| `killscripts.js` | 3.00 (Phase 14) | **exactly flat**; +0.40 → S10 contingency |
| `bootstrap.js` | 6.20 (Phase 14) | **exactly flat**, hard ceiling < 8.00 stands (Phase 14 cold-start requirement) |
| `hosts.js` | live step 1 | flat (same reachable set; `tprint` was already reached); +0.40 → S10 contingency |
| `targets.js` | live step 1 | flat |
| `connect.js` | live step 1 | flat; +0.40 → S10 contingency |
| `sharecurve.js` | live step 1 | **+0.05** per S11 (`getServerUsedRam` newly reached via the shared `listHosts`) |
| `launchmonitor.js` | live step 1 | **−0.65** per S8; a different-sized drop → explain before sign-off |
| `cloudcosts.js` / `purchasecloudservers.js` | live step 1 | flat (both already reach `ns.cloud`) |
| `targetsmonitor.js` | live step 1 | flat (imports unchanged exports of a changed file) |
| `ramprobe-workerkeys.js` | n/a (new, throwaway) | informational: 1.60 or 2.00 decides the key-phantom question (work item 8); either reading is a pass |

Any unexplained delta anywhere → identifier-hygiene hunt (Phase 9/11's `mem`-trace method)
before sign-off.

## Live validation [live]

`npm run dev` running; auto-reconnect enabled.

1. **Baseline ramcheck on `master`** (before the branch is synced into the game): the gate
   command above minus the probe. Confirms `logs/ramcheck-result.json` lands.
2. Switch the synced checkout to the phase branch (or merge-to-local per the standing
   local-first flow); **kill+restart the dev server**; confirm the changed files and
   `common.js` sync in.
3. **After ramcheck** (full command incl. probe); compare against step 1 + the Phase 14
   baselines per the gate table.
4. **≥15-minute daemon session** (restart `daemon.js`; its `runAndWait(killscripts.js)`
   startup path exercises work item 4's refactor immediately): income/behavior unchanged
   in character vs. prior acceptance runs; then `npm run verify:log` green and the
   transactions log showing income unchanged in character (bar is "nothing moved," not
   "improved").
5. **Rooted-host notice timestamp:** if a server becomes rootable during the session (post-
   handoff, hacking level is climbing, so plausible), the `INFO: rooted new host …` tprint
   now carries the `[HH:MM:SS]` prefix. If no new root occurs in the window, record as
   observe-when-it-happens rather than blocking.
6. **Monitor smoke runs:** `run launchmonitor.js` — populates normally on the non-rooting
   `listHosts`; `run connect.js` — prints the CSEC path as before; `run cloudcosts.js` —
   prints the size table as before; `run sharecurve.js` **if Formulas.exe is owned on the
   current save** — capacity now excludes the purchased-server double-count (expect a
   lower, correct number than a pre-phase run would show); without Formulas it exits on
   its guard before reaching the rewired code, so record the smoke as waived-until-
   Formulas rather than covered. (Do **not** smoke-run `killscripts.js` standalone
   mid-session — argless, it kills the daemon by design; step 4's daemon restart already
   exercised it.)
7. **Dead-file cleanup in-game** per work item 7; probe cleanup per work item 8.

## Acceptance criteria

- `npm test` green: all 231 pre-existing tests plus work item 9's new cases
  (verified by running it).
- RAM gate: both `logs/ramcheck-result.json` snapshots recorded; every gate-table row met
  (flat rows exactly flat, `launchmonitor.js` down 0.65, `bootstrap.js` < 8.00); probe
  reading recorded either way.
- ≥15-minute daemon session with `npm run verify:log` green and transactions-log income
  unchanged in character (live step 4).
- Dead files absent from the repo (git) and from the in-game filesystem (live step 7 /
  work item 7's `ls` check).
- Rooted-notice timestamp observed, or explicitly recorded as pending-first-occurrence
  (live step 5); `sharecurve.js` smoke observed or recorded as waived-until-Formulas
  (live step 6).
- BACKLOG/CHANGELOG updated per work item 10, staged with the work.

## Files touched

`src/common.js` (new), `src/hosts.js`, `src/targets.js`, `src/killscripts.js`,
`src/connect.js`, `src/daemon.js`, `src/launchmonitor.js`, `src/sharecurve.js`,
`src/cloudcosts.js`, `src/purchasecloudservers.js`, `test/common.test.js` (new),
`test/hosts.test.js` (new),
`BACKLOG.md`, `docs/phases/CHANGELOG.md` (at close-out), plus this spec and
`phase-13-consolidation.features.md` at repo root (graduating to `docs/phases/` at
close-out). Deleted: `src/cleanup-old-daemon-log-temp.js`, `cloud-server-costs.js` (root),
and the transient `src/ramprobe-workerkeys.js` (added then removed within the phase).

**Deliberately untouched:** `scheduler.js` (its `WORKER_SCRIPTS`/`SHARE_SCRIPT` semantics
are load-bearing and this phase only *imports* them), `sampling.js`, all four workers,
`bootstrap.js`/`bootloop.js` (bootstrap keeps calling the composed `getHosts` — it *wants*
rooting, per Phase 14's design), `resourcemanager.js`/`cloudmanager.js`/
`procureprograms.js`, `translog.js` + the transactions checker (nothing spends),
`targetsmonitor.js`/`transactionsmonitor.js`, `vite.config.ts` (no new exported logs —
`ramcheck-result.json` is already wired), `package.json`/`vitest*.config.ts`.
