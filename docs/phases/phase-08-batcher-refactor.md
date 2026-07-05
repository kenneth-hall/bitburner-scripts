# Refactor spec: faction share allocation (Phase 8)

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner watcher that syncs into the game). Phase 7 (see `phase-07-batcher-refactor.md`) is complete, live-verified, and pushed; `npm test` was last green at 88/88. Phase 6 was implemented and fully reverted — historical only.

This phase builds BACKLOG's "`ns.share()` script + dedicated RAM allocation" item: dedicate a slice of fleet RAM to `ns.share()`, which boosts reputation-gain rate for **all faction work** while running. Today no share script exists at all; the daemon's budget math assumes batching owns 100% of allocatable capacity.

API facts, verified against `markdown/` (re-verify signatures during implementation per ground rules):

- `ns.share()` — 2.4 GB, runs in **10-second cycles**, `await`ed. Boost applies to all faction work of all factions. "Scales with thread count, but at a sharply decreasing rate."
- `ns.getSharePower()` — 0.2 GB, returns the current network-wide share multiplier. "Multiplicative effect on rep/second while doing hacking work for a faction"; non-linear for non-hacking work.
- `ns.formulas.reputation.sharePower(threads, cpuCores?)` — predicts share power for a hypothetical thread count (Formulas.exe is owned; like all `ns.formulas.*`, throws without it).

## The 25% figure — untuned, by design

The starting allocation is **25% of current total allocatable capacity** (`SHARE_FRACTION = 0.25`). This number is **a deliberate guess, not a tuned value**. Two facts make tuning impossible up front: share power has sharply diminishing returns per thread (25% of the fleet may buy only marginally more than 10% would), and the income cost of the carve depends on how much of the fleet batching can actually saturate. The verification section exists to replace this guess with measured numbers — the phase is not done until both sides of the tradeoff have been measured and the follow-up tuning decision is recorded in `BACKLOG.md`.

**Accepted assumption, not an oversight:** RAM spent on share is RAM not spent on batching, which costs both **income** and **hacking XP** — so share slows hacking-level growth and therefore everything downstream of level (new targets/servers unlocking, thread efficiency). We take that tradeoff knowingly to buy faction rep speed. The spec does not attempt to model or compensate for it; it measures it.

Two more accepted-untuned choices, same treatment (documented, revisit with data): share placement ignores host CPU cores (`sharePower` scales with cores, and home may have >1 — see open questions), and the one-cycle worker design means the live share level oscillates slightly below target as workers expire and are replaced (measured by the target-attainment soft report, not "fixed").

## Settled decisions (agreed with Kenneth pre-spec, 2026-07-04)

- **Hard carve.** Share targets `SHARE_FRACTION × totalAllocatableRam(hosts)` unconditionally; the batch admission budget becomes the remaining fraction. Not "yield to batching": a stable, known share level is what makes the before/after measurement attributable.
- **One-cycle workers.** `share.js` runs a single `await ns.share()` (≈10 s) and exits. The daemon tops the pool up every tick toward the live target. Scaling down = stop topping up; the pool decays to the new target within ~10 s. **Zero `ns.kill` call sites**, matching Phase 7's natural-exit philosophy. `killscripts.js` needs **no change** (BACKLOG expected an exclusion — unnecessary under this design: the startup sweep kills share workers, and the daemon replenishes them within a tick).
- **Rep measurement = `getSharePower` in snapshots + manual UI rep readings.** Faction rep is only programmatically readable via `ns.singularity.getFactionRep` (no-SF4 RAM multiplier); declined. Kenneth records the faction's rep number from the game UI at each measurement-window boundary while doing faction work.
- **Live-recomputed target.** The GB target is recomputed **every tick** from the `CYCLE_MS`-cached host list (cheap arithmetic — same freshness as the batch budget), so RAM upgrades grow the share allocation within one `CYCLE_MS`.
- **Runtime toggle for A/B measurement.** A 0-byte marker file `share-off.txt` on home forces the effective fraction to 0 (checked every tick via `ns.fileExists`, same pattern as `legacy-mode.txt`). This is what makes same-session before/after windows possible without swapping builds.

## Ground rules

- `CLAUDE.md` rules apply in full: verify every NS API signature against `markdown/` (don't rely on memory), no community share-script implementations, don't read game source.
- `scheduler.js` stays pure — the share-allocation math lives there, unit-tested, no `ns` calls.
- **No changes to the batching math.** `sampleBatchFields`, `planBatch`, `planPrep`, `assignBatchHosts`, `carveReservation`, `pickBatchSet`'s internals, buffers, fractions, drift thresholds: all untouched. The only batching-visible change is the number passed as `pickBatchSet`'s `budgetGb`.
- The share manager must not depend on `ns.formulas.*` — after a reset (no Formulas.exe) share must keep working. The only formulas consumer this phase is the manual one-shot curve script.
- Tests via vitest only, in `test/` at repo root, existing mock-ns style. Same git worktree/branch conventions as prior phases; local-first, no push until live verification.

## Design

### Constants and pure math (`scheduler.js`)

- `SHARE_FRACTION = 0.25` — exported, alongside the existing tunables.
- `SHARE_SCRIPT = "share.js"` — exported, alongside `WORKER_SCRIPTS` (not inside it: everything that iterates `WORKER_SCRIPTS` — scp loops, `ramCosts` maps, in-flight target bucketing — means "the three targeted batch workers", and share has no target argument).
- `planShareTopUp(targetGb, inFlightShareGb, ramPerThread, hosts) -> {jobs: [{hostname, threads}], shortfallGb}` — new pure function. Computes the whole-thread top-up needed to close the gap between `inFlightShareGb` and `targetGb`, then fills it from the host pool **smallest-free-RAM-first** (deliberately the opposite end from `carveReservation`'s largest-first: big contiguous blocks are the only places a batch's grow job can land, so share consumes fragments first and preserves them). Never overshoots the target: total launched threads ≤ `floor((targetGb − inFlightShareGb) / ramPerThread)`. Returns whatever gap it couldn't place as `shortfallGb` (informational — the pool can be too fragmented or too full this tick; next tick retries). Does not mutate the input pool; returns jobs only (the daemon adjusts its live pool copy after launching, same as batch launches).

### The worker (`src/share.js`)

New dumb worker, the exact shape of `hack.js`/`grow.js`/`weaken.js`: header comment, `export async function main(ns) { await ns.share(); }`. One 10-second share cycle, then exit. No loop, no logging. Expected script RAM 4.00 GB/thread (1.6 base + 2.4 `share`) — confirm with `mem share.js` in-game and use `ns.getScriptRam` in the daemon, never a hardcoded number.

**Uniqueness arg (review finding):** every exec passes one argument the worker ignores — a monotonically increasing counter the daemon keeps (`ns.exec(SHARE_SCRIPT, hostname, threads, shareLaunchCounter++)`). Rationale: Bitburner refuses to start a script when an instance with identical filename+args is already running on that host (`exec` returns 0), and steady-state top-ups routinely land on hosts still running a live share worker from ≤10 s ago — with no args, those launches would persistently fail. Note: the local `markdown/` exec doc is **silent** on this duplicate rule, so confirm it in-game before relying on the fix's necessity (run `run share.js` twice on home; the second should fail) — but ship the counter arg either way, it costs nothing and is immune to the question. The sweep is unaffected: share processes are identified by filename only, never by args.

### Daemon integration (`daemon.js`)

**One capacity quantity (review finding).** Everywhere this spec says "total capacity" it means exactly one number: `totalAllocatableRam(hosts)` — the existing daemon function, maxRam summed across hosts minus `HOME_RESERVE_GB` on home. The daemon already holds it in the variable `totalMaxRam` and logs it as the snapshot's `budgetGb`; those are two names for the same value, not different quantities. Share target = `effectiveShareFraction × totalMaxRam`; batch budget = `(1 − effectiveShareFraction) × totalMaxRam`; the two sum to `totalMaxRam` by construction and can never oversubscribe it.

- `refreshCycle()` scp's `share.js` to every host alongside the three workers, and `ramCosts` gains a `share.js` entry (via `ns.getScriptRam`, same as the others).
- Effective fraction, computed every tick: `shareOff = ns.fileExists("share-off.txt", "home")`; `effectiveShareFraction = shareOff ? 0 : SHARE_FRACTION`. On any change of the effective fraction between ticks (including the marker appearing/disappearing), `tprintTs` it and append a `mode` log event (see logging) with immediate flush.
- **Tick order** (new steps in bold, existing Phase 7 steps otherwise unchanged):
  1. Rename guard, `CYCLE_MS` refresh — unchanged.
  2. Pre-tick in-flight sweep — now also totals share (see sweep section).
  3. **Share top-up, before anything batch-related:** `shareTargetGb = effectiveShareFraction × totalMaxRam`; call `planShareTopUp(shareTargetGb, sweep.share.ramGb, ramCosts["share.js"], liveHosts)`; launch the jobs (`ns.exec(SHARE_SCRIPT, hostname, threads, counter)` — see the uniqueness arg above); deduct every planned job's RAM from the live pool (failures too — matching the batch path's existing behavior; the over-deduction self-corrects at next tick's `refreshFreeRam`). Share is the hard carve's senior claimant, so it draws from the pool first each tick; batching's aggregate is bounded by its own reduced budget below, so steady-state coexistence is by construction. Failed execs (pid 0) count into the existing `failedLaunches`.
  4. Candidates + `pickBatchSet` — **`budgetGb` becomes `(1 − effectiveShareFraction) × totalMaxRam`**. This is the entire batching-visible change.
  5. Member loop, aggregate reserve carve, waterfall, display/logging/sleep — unchanged mechanics. (The waterfall can't eat share's claim: the top-up already physically took its RAM in step 3.)
- Steady-state behavior to expect (document in comments, don't "fix"): each tick replaces roughly the tenth of the pool that just expired (1 s ticks against 10 s worker cycles), so in-flight share hovers just under target and never exceeds it. On daemon restart, `killscripts.js` sweeps all share workers and tick 1 relaunches the full allocation at once (bounded by one exec per host). When the marker file appears mid-run, the pool decays to zero over ~10 s with no kills; when it's deleted, the next tick tops back up.
- **Expected transition, note in the spec-reader's mental model:** the first tick after share activates, the batch budget drops by `SHARE_FRACTION` — `pickBatchSet` may emit `"unaffordable"` exits for members that no longer fit. That is the natural-exit machinery doing its job, and the log checker's existing natural-exit invariant already covers the drain. Expect these exits clustered at toggle timestamps in an A/B session.

### Sweep extension (`sampling.js`)

`inFlightByTarget(ns, hosts, ramCosts)` return shape changes to `{ byTarget: {server: {batches, ramGb}}, share: {threads, ramGb} }`. Same single pass: a `proc.filename === SHARE_SCRIPT` process accumulates `proc.threads` and `ramCosts[SHARE_SCRIPT] × proc.threads` into `share` (share processes have no target arg — they must not touch `byTarget`); everything else exactly as today. **This is a deliberate breaking shape change** — update both daemon call sites and the five existing `inFlightByTarget` unit tests in the same commit; the post-launch call site simply ignores the `share` field. Rationale for extending rather than adding a second function: Phase 7's two-sweeps-per-tick property is load-bearing (its doc comment says so), and a separate share sweep would quietly make it three.

### Curve script (`src/sharecurve.js`)

Manual one-shot, the phase's tuning instrument. Requires Formulas.exe (guard with `hasFormulas(ns)` from `sampling.js`; tprint a clear message and exit if absent). Computes `totalAllocatableRam` over `getHosts(ns)` and `ns.getScriptRam("share.js")`, then prints and exports:

- Current live state: `ns.getSharePower()`, current in-flight share threads (reuse the sweep).
- The predicted curve: for each candidate fraction (5%, 10%, 15%, 25%, 40%, 50%, 75%, 100%), the affordable thread count (`floor(fraction × capacity / ramPerThread)`) and `ns.formulas.reputation.sharePower(threads, 1)` (1 core — the fleet is essentially all 1-core; note home's actual core count in the output for context, via `ns.getServer("home").cpuCores`).

Writes `sharecurve-<epoch ms>.json` (one file per run, the `targets-summary` pattern) and needs a matching `vite.config.ts` download-filter entry — per `CLAUDE.md`, exported files, not terminal copy/paste. This makes the rep side of revisiting 25% nearly free: the curve says what share power any other fraction would buy without running a live session per candidate.

## Logging: schema additions

- **`mode` event** — two new fields on **every** `mode` event (startup included): `shareFraction` (the effective fraction) and `shareOff` (marker state); the `config` snapshot gains `SHARE_FRACTION`. The event now fires on effective-share-fraction changes as well as math-mode changes (it is the log's config record; a toggle mid-session must be visible in the log with a timestamp). Pinning, immediate flush, and checker semantics unchanged.
- **`snapshot` event** — gains a `share` block: `{targetGb, inFlightRamGb, threads, attainedPct, sharePower}` where `attainedPct = inFlightRamGb / targetGb × 100` (0-target case: report `attainedPct: null`), and `sharePower` is `ns.getSharePower()` sampled once per snapshot (0.2 GB, once per `CYCLE_MS` — negligible). Also gains `batchBudgetGb` (the number actually passed to `pickBatchSet`) so the budget invariant below is checkable from the log alone.
- No new event types, and share top-ups are **not** logged per-tick (same treatment as prep dispatches: display only). Log volume is therefore unaffected — snapshots just get wider.
- **Ring-buffer honesty, restated for the A/B protocol:** at high member counts the 2000-entry ring retains only the last ~4–6 minutes. A toggle session's *earlier* window's snapshots will be evicted by session end. The A/B protocol below therefore copies the exported log file at each window boundary (out-of-game `cp` of `logs/daemon-batch-log.json` to `logs/daemon-batch-log-<label>.json`); the checker runs against each copy via its existing env-var path override.

## Display

One share line in the tail popup, between the member lines and the waterfall line, e.g.:

`share: 249TB/250TB (99.6%) | 62,250t | power 1.87 | batch budget 750TB`

Exact formatting is the implementer's call; requirements: target vs. in-flight GB, attainment %, thread count, live `getSharePower`, and the reduced batch budget made visible. When the marker forces share off, say so explicitly (`share: OFF (share-off.txt)`) rather than showing 0/0.

## Automated verification

Same three layers as Phases 4–7.

**1. Unit tests (`npm test`).**

- `test/scheduler.test.js` — `planShareTopUp`: fills toward target smallest-host-first; splits across hosts; whole threads only (rounds down); never overshoots the target even when the pool has room; returns zero jobs at/above target (including `targetGb = 0` — the marker case); `shortfallGb` reported when the pool can't fit the gap; skips zero-free hosts; input pool not mutated. Constants exported (`SHARE_FRACTION`, `SHARE_SCRIPT`).
- `test/sampling.test.js` — the five existing `inFlightByTarget` cases updated for the new return shape, plus: share processes accumulate into `share` by filename with thread and RAM totals; share never appears in `byTarget`; zero share processes yields `{threads: 0, ramGb: 0}` (callers never null-check).
- `test/verify-log.test.js` — extended per below, plus checker-logic tests against synthetic fixtures (the Phase 4 pattern: one clean fixture passes, one deliberately violating each new assertion fails exactly those).

**2. Log checker (`npm run verify:log`).**

- Field validation: `snapshot.share` block shape and `snapshot.batchBudgetGb`; `mode.shareFraction`/`mode.shareOff` present.
- New hard assertions:
  - **Share-cap invariant (review finding — grace window made explicit):** every snapshot with `targetGb > 0` has `share.inFlightRamGb ≤ share.targetGb` + one thread's RAM of tolerance (one-cycle workers are only ever launched up to the gap, so exceeding target means double-launch accounting is broken). For snapshots with `targetGb = 0`: workers legally take up to ~10 s to expire after a toggle-off, so the assertion is time-gated — a zero-target snapshot whose `timestamp` is **≥ 30 s** after the latest preceding `mode` event that set `shareFraction` to 0 must have `inFlightRamGb` ≤ one thread's RAM; zero-target snapshots inside that 30 s grace window are exempt (30 s = one 10 s worker cycle plus two 10 s snapshot cadences of slack — decay evidence, not a race). This makes the mandated B→A′ toggle pass by construction while still catching a pool that never decays.
  - **Budget invariant, updated:** Σ members' `pipelineCostGb ≤ batchBudgetGb` (replaces the Phase 7 check against `budgetGb`), and `batchBudgetGb ≤ budgetGb`.
  - **Fraction consistency:** each snapshot's `share.targetGb` equals the latest preceding `mode` event's `shareFraction × budgetGb` within **2% relative tolerance** (deliberately loose — the host list refreshes on the `CYCLE_MS` cadence, so target and budget can be one refresh apart). The startup `mode` event (which Phase 4's `previousMathMode = null` convention already guarantees fires on every daemon start) carries `shareFraction` like any other, so a "latest preceding `mode` event" exists for every snapshot in a valid log — the checker may hard-fail a snapshot with no preceding `mode` event, as it effectively already does via the validity marker.
- Soft reports (extend the existing block): share target-attainment min/avg/max across snapshots; `sharePower` min/avg/max; batch-side utilization (utilization derived excluding `share.inFlightRamGb`, so post-phase numbers stay comparable to Phase 7's ~20% baseline — raw utilization now includes share and would read misleadingly high).
- `test/verify-transactions.test.js` — new **windowed-rate soft report**: an env var (e.g. `VERIFY_WINDOWS="<startMs>-<endMs>[,<startMs>-<endMs>...]"`, optionally labeled) makes the checker print hacking-income $/min per window alongside the whole-file report. This is the automated half of the income comparison: windows come from the A/B toggle timestamps (which the `mode` events record). Unit-test it against a synthetic transactions fixture via the existing path-override pattern.

**3. Live validation — the A/B measurement protocol.** This is the phase's reason to exist; it is an acceptance criterion, not an optional extra.

- One formulas-mode session, fleet at current size, structured as **A (share off) → B (share on) → A′ (share off)**, each window ≥ 10 minutes, **all inside one calendar day** (the transactions log rotates at midnight — a session spanning it splits the income evidence across two files and silently truncates the windowed report). A′ exists to bound the session-long confounds (hacking level rises throughout, so a plain A→B comparison flatters whichever window runs later; A vs. A′ brackets that drift). Toggle via the marker file; the `mode` events timestamp each boundary.
- **Precondition for the rep side:** Kenneth is *actively doing faction work of the same type for the same faction* for the entire session. If no faction work is running, share power sits there multiplying zero and the rep side of the experiment is void. Record: faction, work type, and the UI rep number at each window boundary (4 readings). Rep confounds to note next to the numbers rather than control for: rep/sec also moves with hacking level and stat multipliers; the A/A′ bracket is the honesty check here too.
- **Income side:** at each window boundary, note the timestamp; after the session run the windowed-rate report over the transactions file for the three windows.
- **Log evidence:** copy `logs/daemon-batch-log.json` at each boundary (see ring-buffer note); run `verify:log` against each copy — all hard assertions green in all three.
- **Curve calibration:** run `sharecurve.js` once during window B. Decision rule (so this is decidable, not vibes): compute the curve's prediction at the *actual in-flight thread count* the run reports (not the theoretical 25% count — the pool oscillates below target); if measured `getSharePower` disagrees with that prediction by **more than 2× in either direction**, treat it as a defect (wrong formulas call, wrong sweep, or a wrong assumption about what `getSharePower` measures) and investigate before handoff; within 2× but not close, record the gap in the handoff summary (cores and mid-cycle churn plausibly explain modest gaps).
- **The tuning follow-up (required output):** a `BACKLOG.md` entry recording: measured income $/min for A/B/A′, measured rep/min for A/B/A′, measured share power at 25%, the predicted power at the other candidate fractions from the curve export, and a recommendation (keep 25% / raise / lower) with one sentence of reasoning. The 25% guess must not outlive this phase unexamined — that entry is where it gets its first real numbers.

## Files

- **`src/share.js`** — new one-cycle worker.
- **`src/sharecurve.js`** — new manual one-shot (formulas-gated).
- **`scheduler.js`** — `SHARE_FRACTION`, `SHARE_SCRIPT`, `planShareTopUp`. Still pure.
- **`sampling.js`** — `inFlightByTarget` shape change per above.
- **`daemon.js`** — share top-up step, reduced batch budget, marker check, `mode`/`snapshot`/display additions, scp + ramCosts entries. Expected new `ns` surface: `getSharePower` (0.2 GB) only (`fileExists`/`exec`/`scp`/`getScriptRam` already in the bundle) — the RAM gate verifies.
- **`vite.config.ts`** — download-filter entry for `sharecurve-*.json`.
- **`test/scheduler.test.js`, `test/sampling.test.js`, `test/verify-log.test.js`, `test/verify-transactions.test.js`** — per the verification section.
- **`hosts.js`, `targets.js`, workers, monitors, `translog.js`, `killscripts.js`** — untouched. (`killscripts.js` explicitly: the no-exclusion decision is design, not an oversight.)
- **`BACKLOG.md`** — on completion: move the share item to Done with the measured numbers; file the tuning follow-up entry.

## Acceptance criteria

**Runnable (green before handoff):**

- `npm test` green: existing suite (with the five updated sweep cases), plus `planShareTopUp` and the new sweep/share cases, plus the checker-fixture tests.
- `npm run verify:log` green — all hard assertions including the three new ones — against each of the three A/B/A′ window copies.
- The windowed-rate transactions report runs and its numbers appear in the handoff summary.

**Observed:**

- Tail popup share line matches the log's snapshot share block (spot-check one tick).
- Marker toggle mid-session: share pool decays to ~0 within ~15 s of creating `share-off.txt` (watch the share line), refills within ~2 ticks of deleting it; batch members exit `"unaffordable"` at activation only if the budget genuinely no longer fits them, and re-enter after deactivation.
- `grep`/read the diff: **zero `ns.kill`/`killall` call sites added**; `killscripts.js` untouched.
- RAM gate: `daemon.js` expected 16.10 → ~16.30 GB (+`getSharePower` 0.2); `share.js` ≈ 4.00 GB; flag anything unexplained over ~0.5 GB. `targets.js` unaffected (imports nothing new).
- `getSharePower` > 1 while the pool is up (whatever the no-share baseline reads — verify it's 1 in-game before window B, and record it).
- The A/B/A′ protocol executed in full, with all four rep readings, three income rates, the curve export, and the BACKLOG tuning entry written.

## Out of scope

Auto-tuning or scheduling the share fraction (time-of-day, work-aware, level-aware); core-weighted or home-preferring share placement; a rep-rate logger (would need Singularity); changing `HOME_RESERVE_GB`; batching-math changes of any kind; the consistency-consolidation BACKLOG item; per-faction anything; dashboards. Scheduler stays pure, workers stay dumb, sampling keeps the one math seam.

## Peer review record (2026-07-04)

A cold-context reviewer (given only this file and the raw requirements) raised three blocking issues, all accepted and folded in above: (1) "total capacity" appeared under three names (`totalAllocatableRam`, `totalMaxRam`, `budgetGb`) with no statement they're one quantity → unified explicitly in the daemon-integration section; (2) the zero-target share-cap assertion contradicted the mandated B→A′ toggle (a decaying pool legally holds RAM for ~10 s at target 0) → replaced with an explicit 30 s grace window keyed to the toggle's `mode` event; (3) the no-args worker mandate collides with Bitburner's duplicate filename+args exec restriction, making steady-state top-ups fail persistently → every exec now passes an ignored monotonic counter arg, with an in-game confirmation step since the local exec doc is silent on the rule. Its non-blocking observations (failed-exec RAM deduction unstated, midnight rotation of the transactions file, startup `mode` event needing `shareFraction`, unnumbered tolerances on two checks) were also adopted.

## Open questions

- **Core-weighted placement.** `sharePower(threads, cpuCores)` says cores matter, and home may have upgraded cores while the fleet is 1-core. Placing share threads on home first could buy more power per GB — but home RAM is the most contested (reserve, companions, manual scripts). Deliberately untuned this phase; the curve script records home's core count so the follow-up has the data. Deferred, not decided.
