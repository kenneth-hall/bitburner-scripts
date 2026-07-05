# Refactor spec: Phase 8 close-out (Phase 9)

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner watcher that syncs into the game). Phase 8 (see `phase-08-batcher-refactor.md`) is merged to `master` and live-verified, `npm test` last green at 120/120 — but it closed with two acceptance items explicitly waived or degraded, plus one bug it discovered outside its own scope:

1. **The RAM anomaly, waived.** `daemon.js` measures 18.7 GB in-game vs. an expected ~16.3 GB (16.10 Phase-7 baseline + 0.2 for `getSharePower`) — a +2.4 GB unexplained delta that survived an extensive live bisection.
2. **The income comparison, not clean.** Window A ran ~5 min (spec wants ≥10), and A′'s income rate was 4–5x everything else — dominated by natural hacking-level growth, not share. The rep-side result (share ≈ +45% rep/sec, consistent with measured sharePower 1.417) is solid and is **not** re-measured here.
3. **The `pickBatchSet` pass-3/pass-4 self-contradiction bug** (Phase 7 code, exposed by Phase 8's toggle): a server can appear in both `result.exits` (reason `"displaced"`) and `result.members` in the same call. Confirmed against the real Phase 8 A/B log copies: the natural-exit hard assertion fails on 3 of the 5 copies in `logs/phase8-ab/` (114/114/31 violations), all starting at the 3:28:28 PM B→A′ toggle. Any re-run toggle will re-trigger it, so **this fix is a prerequisite for item 2's re-run going green**.

This phase delivers all three, so every Phase 8 acceptance criterion is either genuinely closed or closed-with-recorded-evidence. Scope decisions confirmed with Kenneth 2026-07-04: pickBatchSet fix in scope; RAM fix via rename (reclaim the 2.4 GB); `hackingLevel` added to snapshot events to automate the level-confound tracking.

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked **[code]**. Kenneth does everything marked **[live]** — in-game runs, measurements, toggles. Nothing in a [live] step should require editing code.

## Root-cause analysis: the RAM anomaly (do not re-derive)

**Probable root cause, established 2026-07-04 from official docs + the recorded measurements.** Bitburner computes a script's RAM statically: it parses the script *and its imports* into an AST (acorn) and matches names against the NS API cost table. The matcher works on *names*, not resolved references — it cannot tell `ns.share()` apart from an unrelated identifier or property named `share`. `ns.share` costs exactly **2.4 GB** (`markdown/bitburner.ns.share.md`).

Phase 8 introduced exactly one new name into `daemon.js`'s compile-time surface that collides with a costed NS function: the sweep's `share` field —

- `sampling.js` (`inFlightByTarget`): `const share = { threads: 0, ramGb: 0 }`, `share.threads += …`, `share.ramGb += …`, `return { byTarget, share }`.
- `daemon.js`: `preTickInFlight.share.ramGb`, `preTickInFlight.share.threads`, and the snapshot record's `share: { … }` key.
- `sharecurve.js`: `sweep.share.threads`.

The arithmetic is exact with zero residual: 16.10 (Phase 7 baseline) + 0.2 (`getSharePower`, expected) + **2.4 (phantom `share` charge) = 18.70 measured**.

This also explains the bisection's maddening pattern, recorded in BACKLOG: every **real-file splice** kept the colliding names (reproduced every time — e.g. `ramtest-step2only-nostartup.js` at 18.6 kept the `sampling.js` import and sweep call), while every **manual reconstruction** renamed or restructured exactly those constructs (never reproduced, ~10 attempts).

What is *not* yet pinned down: which construct(s) exactly the matcher charges (bare identifier, member-access property, object-literal key, shorthand), and whether import charging is whole-file or reachability-based. The phase does not need to know — the rename removes every candidate construct at once — but the measurements in the RAM-gate section are designed so the answer falls out for free, and the fallback plan isolates it if the gate falsifies the hypothesis.

**Ground-rule reminder:** this analysis was built from official documentation and local measurements only. Do **not** open the game's RAM-calculation source to shortcut confirmation — docs and in-game measurement are the allowed instruments (CLAUDE.md, Off-limits).

## Ground rules

- `CLAUDE.md` rules apply in full: verify every NS API signature/cost against `markdown/` (don't rely on memory or this spec's numbers), no community solutions, don't read game source.
- `scheduler.js` stays pure — the pickBatchSet fix is arithmetic/set logic only, no `ns`.
- **No changes to batching math or share math.** `planBatch`, `planPrep`, `planShareTopUp`, `carveReservation`, buffers, fractions, `SHARE_FRACTION`: untouched. The only scheduler change is pass 4's eligibility guard.
- Tests via vitest only, in `test/` at repo root, existing mock-free pure-function style. Same worktree/branch conventions as prior phases (e.g. `worktree-phase9-closeout`); local-first, no push until live verification.
- `logs/` is untracked: nothing under `logs/` may be a vitest dependency. Real-log validation happens as implementation-time one-off scripts with expected numbers recorded here.

## Design

### Work item 1 — `pickBatchSet` both-lists fix (`scheduler.js`) [code]

**Bug (confirmed with BACKLOG's repro against current `master`):** pass 3 evicts an incumbent (`exits` gets `{server, reason: "displaced"}`), then pass 4's refill walk re-admits that same server in the same call when the eviction freed more budget than the entrant consumed and the evicted server's own cost fits the leftover. Result: the server is in both `exits` and `members`; downstream, `daemon.js` logs a real `exit`, sets a `drainDeadline`, but the server never leaves `previousMemberSet`, so no `enter` ever logs — corrupting the exit/enter pairing and failing the natural-exit hard assertion.

**Fix:** track the servers evicted by pass 3 in a `justEvicted` set (filled inside the displacement commit block); pass 4's refill loop skips any candidate in that set. A displaced server is ineligible for re-admission until the next tick, when it competes as an ordinary non-incumbent (pass 2) — by then the daemon has already logged its exit and, on re-admission, will log a proper `enter`.

**Post-fix repro expectation** (BACKLOG's exact case: candidates challenger/300/12, mid/70/30, n00dles/60/5, incumbents `['mid','n00dles']`, budget 35, hysteresis 1.25): `members == ['challenger']`; `exits` contains both `mid:displaced` and `n00dles:displaced`; the exits/members intersection is empty.

**Unit tests (`test/scheduler.test.js`):**

- The BACKLOG repro, asserting the exact post-fix expectation above.
- A refill-still-works case: displacement frees more than the entrant needs and a *never-evicted* cheap candidate exists → pass 4 admits that candidate (the guard must not kill legitimate refill).
- A shared assertion helper (e.g. `expectNoOverlap(result)`) asserting no server appears in both `exits` and `members`, applied in every new case and added to the existing displacement-path cases.
- All existing `pickBatchSet` cases (15 `it` cases as of this writing — BACKLOG's "13 new cases" note is stale) untouched and green — the fix must not change any of their outcomes (none of them exercises the refill-after-displacement overlap).

### Work item 2 — the rename: `share` → `sharePool` [code]

Rename the colliding name everywhere it exists as an identifier/property in the import graph. `sharePool` verified absent from `NetscriptDefinitions.d.ts` (2026-07-04); re-verify before use, and if a different name is preferred, check it the same way — the rule is *no identifier or property name in `src/` may exactly match an NS API function name* unless it's a real `ns` call.

- `sampling.js` — `inFlightByTarget`'s local + return shape: `{ byTarget, sharePool }`. Update the doc comment (including the "share is always present" line).
- `daemon.js` — `preTickInFlight.sharePool.*`; snapshot record key `share:` → `sharePool:`. Everything else (locals like `shareTargetGb`, `shareOff`, `effectiveShareFraction`, `SHARE_OFF_MARKER`, `mode` fields `shareFraction`/`shareOff`) does **not** exactly match an API name and stays as-is.
- `sharecurve.js` — `sweep.sharePool.threads`.
- `test/verify-log-checks.js` + `test/verify-log.test.js` — checker reads `e.sharePool`; schema validation renamed. **This is a deliberate log-schema change**: snapshot events carry `sharePool` from Phase 9 on. Old logs stay readable by old checker versions via git; the current checker validates the current schema only. Note the change in `daemon.js`'s log header comment.
- `test/sampling.test.js`, `test/checker-fixtures.test.js` — fixtures/cases updated to the new shape, same commit.
- **Do not touch:** `share.js` (its `await ns.share()` is the one legitimate charge; filename string `"share.js"` is a string literal, not an identifier), `SHARE_SCRIPT`'s value, `SHARE_FRACTION`, display strings, and `snapshot.sharePool.sharePower` (formulas-namespace name; current measurements show it charging 0 — see RAM gate).

### Work item 3 — checker + snapshot additions [code]

**(a) `hackingLevel` in snapshots.** `daemon.js`'s snapshot record gains `hackingLevel: ns.getHackingLevel()`. Sampled where the snapshot is built (once per `CYCLE_MS` — negligible). Checker: field validation `expect.any(Number)`; soft report prints first/last/min/max hackingLevel and the first→last delta across the file's snapshots. This automates BACKLOG's "track the level confound" suggestion: each A/B/A′ window copy self-reports its own level drift.
**RAM note (review finding):** `getHackingLevel` costs 0.05 GB (`markdown/bitburner.ns.gethackinglevel.md`), but `daemon.js` **already pays it** through its static imports — `hosts.js:45` and `targets.js:44` both call it, and the analyzer charges each costed name once per bundle (the same once-per-name model that makes the 18.70 arithmetic exact). Adding the direct call therefore changes `daemon.js`'s measured RAM by **+0.00**.

**(b) Ring-buffer straggler slicing, opt-in.** New pure helper in `test/verify-log-checks.js`: `dropPreConfigStragglers(entries)` — returns `entries.slice(i)` where `i` is the index of the **first** `mode` event (identity if the log starts with one; unchanged if none exists — the existing format guard already fails that case with a clear message). Wired into `verify-log.test.js`'s `beforeAll` behind env var `VERIFY_SLICE_STRAGGLERS=1`. Rationale (observed live in Phase 8): a boundary copy can contain leftover entries from the previous window whose own `mode` event aged out of the ring; config-dependent checks then hard-fail with "no preceding mode event" — a mixed-window artifact, not a code defect. Slicing from the *first* retained `mode` event drops exactly the unvalidatable prefix and nothing else.
Document the caveat in the helper's comment: any `exit` events inside the dropped prefix are dropped too, so natural-exit tracking only covers the sliced range — on the real Phase 8 copy this lost nothing (see validation table below), but it's a property to know, not hide.
Unit tests (`test/checker-fixtures.test.js`): straggler fixture (snapshots before the first `mode` event) fails fraction-consistency unsliced and passes sliced; a log that starts with `mode` passes through identical; empty array passes through.

**(c) Extract the natural-exit walk into a pure check (review finding).** The natural-exit invariant currently lives as fail-fast `expect` calls inside `verify-log.test.js` (the walk over `exit`/`enter`/`batch`/`snapshot.draining`). Extract it into `test/verify-log-checks.js` as `checkNaturalExit(entries)` returning a violations array (one violation per batch-event-against-an-open-exit, one per rising draining count), exactly the style of the three existing checks; `verify-log.test.js` asserts the array is empty. This makes the invariant unit-testable against synthetic fixtures (add a known-bad fixture to `test/checker-fixtures.test.js` modeled on the real failure: a `displaced` exit followed by `batch` events with no intervening `enter`) and makes the implementation-time validation table below mechanically countable instead of hand-derived.

### Implementation-time validation against the real Phase 8 logs [code, run locally]

`logs/phase8-ab/` holds five real boundary copies from the Phase 8 session. After work items 1–3, run a one-off node script (not committed as a test — `logs/` is untracked) exercising the pure checks against them, and check the results against this table (produced 2026-07-04 with the same checks pre-fix):

| copy | natural-exit | fraction-consistency | expected after this phase |
|---|---|---|---|
| `A-safety-151658` | pass | pass | unchanged: pass |
| `A-end-B-start` | pass | pass | unchanged: pass |
| `B-end-Aprime-start` | **31 violations** | pass | **still 31** — historical data from pre-fix code; nothing offline can turn it green |
| `Aprime-only` | **114 violations** | pass | still 114 |
| `Aprime-end` | **114 violations** | **15 violations** (stragglers) | natural-exit still 114; fraction **0 with `dropPreConfigStragglers`** (its one `mode` event sits at index 243; the slice keeps 1757 of 2000 entries and all 114 real violations — verified 2026-07-04) |

The point of this step: prove the slice helper reproduces the live remedy exactly, and prove it does **not** mask the real natural-exit failures. The historical copies stay red on natural-exit forever — that's the bug's fingerprint, replaced by the new session's green copies, not retroactively fixed.

Also re-run BACKLOG's repro through the fixed `pickBatchSet` (plain node import) and confirm the post-fix expectation from work item 1.

## RAM gate — the hypothesis test [live]

Order matters: take the "before" measurements with the **currently live (pre-Phase-9)** code, before viteburner syncs anything.

1. **Before sync:** `run ramcheck.js daemon.js share.js targets.js` → record. Expected: daemon 18.70, share 4.00; targets.js has no recorded post-Phase-8 measurement — its value here decides bundle-vs-reachability below.
2. Sync Phase 9 code, restart the daemon, **after:** run the same command → record.

Decision tree on the after-measurement of `daemon.js` (expected surface change: −2.4 phantom `share`, and **nothing else** — the new `getHackingLevel` call is already charged via the `hosts.js`/`targets.js` imports, see work item 3a):

- **≈ 16.30 GB** → root cause **confirmed**: identifier-name collision with `ns.share`. Record mechanism + numbers in BACKLOG (move the waived item to Done); the Phase 8 "flag anything unexplained over ~0.5 GB" criterion is retroactively satisfied — the flag found a real, now-explained mechanism.
- **≈ 18.70 GB** (unchanged) → hypothesis **falsified**; keep the rename (hygiene) and execute the fallback plan below.
- **Anything else** (e.g. ≈ 16.50, or 16.35 — which would mean the once-per-name import-charging assumption is also wrong in an interesting way) → partially confirmed; run the fallback matrix to isolate the remainder.

Free extra datum: if `targets.js` (which imports `sampling.js` but never touched the sweep) **drops by 2.4** from its before-value, import charging is whole-file ("bundle charging", as the codebase already assumes); if it's **unchanged**, charging is reachability-based and the `common.js` consolidation item's RAM assumptions in BACKLOG deserve a footnote. Record which.

## Fallback diagnostic plan (only if the gate falsifies or partially confirms) [code prepares, live measures]

Sonnet writes the files; Kenneth measures each with `ramcheck.js` (one `run` per batch of files; results land in `ramcheck-result.json`, which vite already downloads). Each file is ≤5 lines. Predictions assume base cost 1.6; any file measuring 4.0 has the 2.4 charge.

| file | contents beyond empty `main(ns)` | isolates |
|---|---|---|
| `ramtest-e1.js` | nothing | calibration (expect 1.60) |
| `ramtest-e2.js` | `const x = { share: 1 };` | object-literal key |
| `ramtest-e3.js` | `const x = {}; if (x.share) {}` | member-access property name |
| `ramtest-e4.js` | `let share = 1; share++;` | bare identifier |
| `ramtest-e5.js` | `const x = { "share": 1 };` | quoted string key |
| `ramtest-e6.js` | `const share = 1; const x = { share };` | shorthand property |
| `ramtest-e7.js` | `import { f } from "./ramtest-mod.js";` (never called), where `ramtest-mod.js` exports `f()` containing a local `share` object | import charging: whole-file vs reachability |

Also have a one-off print `ns.getFunctionRamCost("share")` (expect 2.4) to confirm the cost-table entry directly (`markdown/bitburner.ns.getfunctionramcost.md`).

If the matrix comes back all-1.60 (no construct charges — the hypothesis is fully dead), fall back to the technique that reproduced reliably during Phase 8: **bisect the real file itself**, not reconstructions. `git show 742b415:src/daemon.js` (the Phase 8 commit) as the known-18.7 baseline; delete the bottom half of `main`'s body, measure, keep the half that stays anomalous, repeat — each step is one splice + one `ramcheck.js` run, so the trigger statement is bounded in ~7 measurements. Timebox: the matrix plus one full splice bisection (~30 min in-game). If still unexplained, stop; record everything measured in BACKLOG and re-waive with the new data. The acceptance criterion for this arm is *the plan executed and findings recorded*, not "nature must cooperate."

Clean up all `ramtest-*` files (repo and in-game `rm`) when done.

## Live validation — the clean A/B/A′ income session [live]

The income-side re-run BACKLOG asked for. Rep side is **not** re-measured (Phase 8's rep result stands); faction work during the session is optional and irrelevant to the income numbers.

- Preconditions: Phase 9 code live, RAM gate step already done, formulas mode, all inside one calendar day (midnight rotates the transactions file). **Fleet frozen for the whole session**: no `purchasecloudservers.js` / `upgradecloudserver.js` / `fleetupgrade.js` / `upgradehomeram.js` runs — the Phase 7 session showed a mid-session fleet operation invalidates the comparison.
- Windows: **A (share off) → B (share on) → A′ (share off), each ≥ 10 minutes** — A's ≥10 min is the criterion Phase 8 missed. Toggle via `share-off.txt`; note each boundary's wall-clock time; the `mode` events record exact epoch-ms.
- At each boundary (4 total): copy `logs/daemon-batch-log.json` to `logs/phase9-ab/daemon-batch-log-<label>.json`. Take an extra mid-window copy during B and A′ (cheap insurance against ring eviction — the Phase 8 lesson).
- After the session:
  - `npm run verify:log` with `DAEMON_LOG_PATH` pointed at each copy (add `VERIFY_SLICE_STRAGGLERS=1` if a copy hard-fails on "no preceding mode event") — **all hard assertions green on all copies**, natural-exit included. This is the criterion the pickBatchSet fix unblocks; expect displaced exits clustered at toggles with proper drains/re-enters.
  - Windowed income: `VERIFY_WINDOWS="A:<start>-<end>,B:<start>-<end>,Aprime:<start>-<end>" npm run verify:log` (epoch-ms from the `mode` events) → three $/min numbers.
  - Quote each window's income next to its hackingLevel drift (first→last from that window copy's snapshot soft report). A-vs-A′ brackets the level confound; if A and A′ still disagree wildly while level drift is small, say so rather than forcing a conclusion.
- **Required output — the BACKLOG tuning entry:** measured $/min for A/B/A′ with level drift per window, the income cost of share at 25% stated with its confidence, and a keep/raise/lower recommendation for `SHARE_FRACTION` combining this with Phase 8's curve export (rep side). This replaces the "not clean enough to quote" caveat from Phase 8.

## Files

- **`scheduler.js`** — pass-4 `justEvicted` guard. Still pure.
- **`sampling.js`, `daemon.js`, `sharecurve.js`** — the rename; `daemon.js` also gains snapshot `hackingLevel` (a new direct `getHackingLevel` call, but +0.00 measured RAM — already charged via imports, see work item 3a; the RAM gate expects exactly −2.4).
- **`test/scheduler.test.js`** — repro + refill + no-overlap cases.
- **`test/verify-log-checks.js`** — rename + `dropPreConfigStragglers`.
- **`test/verify-log.test.js`** — rename, `hackingLevel` validation + soft report, `VERIFY_SLICE_STRAGGLERS` wiring.
- **`test/sampling.test.js`, `test/checker-fixtures.test.js`** — shape updates + straggler-slice cases.
- **`ramcheck.js`** — unchanged (already takes script-name args).
- **`hosts.js`, `targets.js`, workers, monitors, `translog.js`, `killscripts.js`, `share.js`, `vite.config.ts`** — untouched.
- **`BACKLOG.md`** — on completion: close the RAM-anomaly item (root cause + numbers), the pickBatchSet item, and the clean-session item; write the tuning entry; file one new idea item: *RAM-analyzer identifier hygiene* — `WORKER_SCRIPTS`' keys `hack`/`grow`/`weaken` likely cost 0.1+0.15+0.15 = 0.4 GB phantom in every importer (same mechanism, baked into every baseline since Phase 2; verifiable with the E-matrix technique; renaming is a wider, separate refactor).

## Acceptance criteria

**Runnable (green before handoff):**

- `npm test` green: existing suite + new pickBatchSet cases (incl. the no-overlap helper on displacement paths) + straggler-slice cases + renamed-shape/`hackingLevel` schema cases.
- Implementation-time validation table reproduced against `logs/phase8-ab/` with actuals reported in the handoff summary (natural-exit failures preserved, fraction 15→0 under slice, repro fixed).

**Observed (Kenneth, in order):**

- RAM gate before/after recorded; `daemon.js` ≈ 16.30 GB (root cause confirmed) **or** the fallback plan executed to completion with findings recorded. `share.js` 4.00 unchanged; `targets.js` before/after recorded with the bundle-vs-reachability conclusion.
- The A/B/A′ session executed per protocol: all windows ≥ 10 min, one calendar day, fleet frozen; `verify:log` green on **every** window copy; three windowed $/min numbers with per-window level drift.
- No both-lists corruption at toggles: every `displaced` exit pairs with a drain and (if re-admitted) a logged re-enter — natural-exit green is the mechanical form of this.
- BACKLOG updated per Files section.

## Out of scope

Acting on the `SHARE_FRACTION` recommendation (the tuning entry records it; changing the constant is its own follow-up); renaming `WORKER_SCRIPTS` keys (filed as the hygiene idea item); the consistency-consolidation item; targetsmonitor's ratio→priority item; rep-side re-measurement; dashboards; any batching/share math change beyond the pass-4 guard; reading game source to shortcut the diagnostic.

## Peer review record (2026-07-04)

A cold-context reviewer (given only this file and the raw requirements) raised one blocking issue, accepted and folded in above: the RAM-gate decision tree's expected values were wrong by the `getHackingLevel` charge — `daemon.js` already pays that 0.05 GB through its static `hosts.js`/`targets.js` imports (both call `ns.getHackingLevel()`), so under the spec's own once-per-name model the confirmed arm is ≈16.30 GB and the falsified arm ≈18.70, not 16.35/18.75; as written, a perfect confirmation would have been misrouted to the fallback matrix and a wrong conclusion recorded. Two non-blocking observations were also adopted: the stale "13 existing cases" count (actually 15), and extracting the natural-exit walk into a violation-returning pure check so the validation table is mechanically countable (now work item 3c). The reviewer independently hand-traced the pickBatchSet repro and all existing displacement-path tests through the proposed fix and confirmed the spec's compatibility claims.

## Open questions

- None — the one review disagreement candidate (whether `getHackingLevel` needed listing as new surface) was resolved in the reviewer's favor by checking `hosts.js:45`/`targets.js:44` directly.
