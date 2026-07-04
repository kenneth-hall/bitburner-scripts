# Refactor spec: multi-target batching with natural exit (Phase 7)

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner watcher that syncs into the game). Phase 5 (see `batcher-refactor-phase5.md`) is complete and live-verified; Phase 6 was implemented and fully reverted (see its status note — treat it as historical only). `npm test` was last green at 78/78.

Today the daemon batches exactly **one** target (the hysteresis-protected incumbent) and spends leftover RAM prepping the others. The most recent exported session (2026-07-04, ~11:30–11:39 AM, forced-legacy mode) shows why that now wastes most of the fleet: 397 batches across a 9-minute window, but **RAM utilization averaged ~6.3%** with ~957TB free in the waterfall, while the single-target slot churned through 6 different servers via 8 flips. The fleet can fund many full pipelines at once; the daemon can only drive one.

Phase 7 removes that limit: **batch as many high-value targets concurrently as RAM can sustain**, and let a target leave the active set **naturally** — stop feeding it and let its in-flight batches land on their own, never killing processes.

Phase 4 explicitly left "batching multiple targets simultaneously" out of scope; this is that door being opened. The scheduler/daemon/sampling *math* is healthy — thread sizing, timing offsets, buffers, prep sizing, and the formulas/legacy seam do not change. What changes is orchestration: which targets get batches each tick, how RAM is reserved, and what gets logged.

Two data notes for the validation section:

- The current `logs/daemon-batch-log.json` is **truncated mid-write** (invalid JSON — the auto-download appears to have caught the daemon mid-rewrite). It cannot pass `npm run verify:log` as-is; its salvageable prefix is the source of the 6.3%-utilization baseline above. Fresh exports are required for acceptance, and the checker gains a friendlier error for this case (see log checker section).
- That session ran with `legacy-mode.txt` present (its `mode` event records `forcedLegacy: true`). Acceptance sessions for this phase run in **formulas mode** unless a criterion says otherwise — prepped-state scoring is what keeps set membership stable.

## Settled decisions (agreed with Kenneth pre-spec, 2026-07-04)

- **Natural exit = drain in flight.** A demoted/ineligible target stops receiving new batches and prep; in-flight jobs land on their own schedule and free their RAM as they do. No `ns.kill`/`ns.killall` anywhere in the change. (The "drain + dedicated re-warm" variant was considered and declined; note the ordinary prep waterfall may still touch an exited target like any other non-member — that's pre-existing behavior, not a re-warm feature.)
- **Set sizing = RAM-bounded greedy.** Walk targets in score order and admit each while the total budget can sustain its full pipeline. No `MAX_BATCH_TARGETS` constant.
- **Reservation = per member.** Every active target gets the same full-pipeline reservation treatment the single target gets today; admission and reservation unify (a target is admitted exactly when its pipeline fits the remaining budget).
- **Testing = unit tests + log checker**, the Phase 4 pattern. No tick-level simulation harness this phase.

## Ground rules

- `CLAUDE.md` rules apply in full: verify every NS API signature against `markdown\` (don't rely on memory), no community batcher implementations, don't read game source.
- `scheduler.js` stays pure — no `ns` calls. The new set-selection function lives there and is unit-tested like the rest.
- Worker scripts (`hack.js`, `grow.js`, `weaken.js`) are untouched.
- **No changes to the math**: `sampleBatchFields`, `samplePrepFields`, `steadyStatePlan`, `planBatch`, `planPrep`, `assignBatchHosts`, `carveReservation`, buffers, `HACK_FRACTION`, drift thresholds, and the formulas/legacy seam all keep their current behavior. If an edit would change how big a batch is or when its jobs land, it's out of scope.
- Tests run through vitest only (ESM-in-`.js`, no `"type": "module"` — don't add one). Keep the existing mock-ns style: canned returns chosen so every `ceil()` lands far from a float boundary.
- Tests live in `test/` at the repo root, never under `src/` (viteburner syncs `src/**` into the game).
- `git`: same worktree/branch conventions as prior phases; local-first, no push until live verification.

## Design

### The active set

Replace the single incumbent with a **member set**, rebuilt every tick by a new pure function in `scheduler.js`:

```
pickBatchSet(candidates, incumbentServers, budgetGb, hysteresis)
  -> { members: [...], exits: [{server, reason}] }
```

- `candidates`: the tick's targets in score-descending order (as `getTargets` returns them), each annotated by the daemon with `pipelineCostGb` (depth × full-fraction batch RAM, from `sampleBatchFields` at `HACK_FRACTION` + `pipelineDepth(steadyWeakenTime)` — the exact cost basis the reserve uses today) and `prepped` (live `isPrepped`). Candidates whose sample came back `null` (unhackable this tick) are excluded by the daemon before the call.
- `budgetGb`: `totalAllocatableRam(hosts)` — fixed capacity (maxRam minus home reserve), the same denominator utilization already uses. Deliberately not "free RAM right now": members' own in-flight batches occupy free RAM, and the budget question is "can the fleet sustain this pipeline", not "is the RAM idle this instant".
- `incumbentServers`: last tick's member list (order preserved).

Selection runs as **four sequential passes**; each pass walks in score order, and "fits" always means a per-candidate check against the budget remaining at that moment (skip-and-continue, never prefix-stop — a mid-list candidate that doesn't fit is passed over and the walk continues to cheaper, lower-scored ones):

1. **Incumbents keep their seats first.** Walk incumbents in score order; seat each whose `pipelineCostGb` fits the remaining budget. An incumbent that doesn't fit (budget shrank, or higher-scored incumbents' pipelines grew) exits with reason `"unaffordable"` — but lower-scored, cheaper incumbents after it still get their per-candidate check and keep their seats if they fit; their pipelines are already warm, and evicting them because a bigger sibling didn't fit would waste that drain. An incumbent absent from `candidates` (dropped by eligibility or a null sample) exits with reason `"ineligible"`.
2. **Non-incumbents fill spare budget freely.** Walk remaining candidates in score order; admit each whose `pipelineCostGb` fits the remaining budget (same skip-and-continue). No prepped gate here — entering on spare budget displaces nothing, and stage 1 will prep a cold entrant exactly as the waterfall would have.
3. **Displacement is gated and rate-limited.** If a non-incumbent still doesn't fit but outscores seated incumbents, it may evict only when: (a) its score ≥ each evicted incumbent's score × `hysteresis` (evicting from the lowest-scored seat upward, as many seats as needed to fit), and (b) the challenger is `prepped` — same rationale as Phase 4's challenger gate: prepped-state scoring lets a stone-cold fresh unlock clear the bar instantly, and flipping committed RAM to a target that then needs a full prep cycle trades noise-churn for cold-churn. In legacy mode the daemon passes `prepped: true` for all candidates (preserving Phase 4's convention: the gate is a formulas-mode refinement). **At most one displacement entry per tick** (the single highest-scored qualifying challenger); evicted members exit with reason `"displaced"`. This bounds churn structurally — no need for a cooldown timer.
4. **Refill.** A displacement can free more budget than the entrant consumes; run one more rule-2 pass over the remaining non-members so that slack isn't stranded until next tick.

`RANK_HYSTERESIS` (1.25) is reused as the displacement factor. `pickBatchTarget` and its tests are **deleted**. With a budget that fits exactly one pipeline, `pickBatchSet` *approximately* reproduces `pickBatchTarget`'s behavior — the new unit tests must include that degenerate case — with one deliberate difference: `pickBatchTarget` only ever let `targets[0]` challenge, while rule 3 admits the highest-scored *qualifying* challenger, so an unprepped #1 no longer blocks a prepped, hysteresis-clearing #2. That's the "best-prepped-challenger picker" Phase 4 explicitly deferred, landing here as a natural consequence of set selection rather than as its own feature.

Startup is the trivial case: no incumbents, everything admits via rule 2, no gates fire.

Known approximation, comment it at the call site: the budget check is fleet-total, but `assignBatchHosts` still requires each job on a single host — a pipeline can fit the budget while a given tick's grow job doesn't fit any single host (fragmentation). That's handled where it always was: the per-tick launch attempt skips or (bootstrap-only) shrinks, exactly as today.

### Per-tick flow

Stage 1 generalizes from "the batch target" to "each member, in score order":

1. Rename guard and `CYCLE_MS` refresh, unchanged.
2. One **in-flight sweep** (see below) builds per-target `{batches, ramGb}` for all targets in a single pass over `ns.ps`.
3. Sample cost basis for every candidate (`sampleBatchFields` at `HACK_FRACTION` + `pipelineDepth`); call `pickBatchSet`; log `exit` events for anything that left, `enter` events for anything that joined.
4. **For each member in score order**: if prepped, attempt one batch launch from the live pool (per-member shrink gating: shrinking allowed only when *that member's* in-flight batch count is 0 — the gate goes per-target, the global `totalBatchesShrunk`/`totalBatchesSkipped` counters stay global); if drifted, dispatch prep from the pool (same `samplePrepFields`/`planPrep` path as today, with its existing in-flight discounting). Score order means the highest-value pipeline gets first claim on this tick's free RAM.
5. **Reserve carve**: after all members act, compute each member's outstanding reserve (`pipelineCostGb − inFlightRamGb`, floored at 0, in-flight re-measured to include this tick's launches) and carve the **sum** from the pool via the existing `carveReservation` — one aggregate carve, largest-hosts-first, exactly the current mechanism with a bigger number.
6. **Waterfall**: prep non-members with whatever survives the carve, unchanged. (When the budget admits every eligible target — plausible at current fleet size — the waterfall simply has nothing to do; keep it for when the budget is tight.)
7. Display, logging, `ns.sleep(BATCH_INTERVAL_MS)`.

Pacing is unchanged *per target*: one batch per member per tick means each member still launches at most one batch per `BATCH_INTERVAL_MS`, so `pipelineDepth`'s math and the interleaving guarantee (`BATCH_INTERVAL_MS ≥ 4 × SPACING_MS`) hold per pipeline as they do today.

Per-member bookkeeping that used to be scalar becomes a per-server map: previous money/security (for the Δ display), last-launched batch, prep status. The flip-specific machinery (`incumbentServer`, `previousCommitmentPct`, the flip cache comment block) is deleted along with the `flip` event.

### Natural exit

An exit is purely a scheduling decision: the daemon stops launching batches and stage-1 prep at that target, stops carving reserve for it, and logs one `exit` event carrying the drained investment (`batchesInFlight` and `inFlightRamGb` at exit, plus `commitmentPct` = in-flight RAM / pipeline cost). The in-flight jobs are one-shot workers that were always going to terminate on their own — nothing to clean up, **no kill calls**. Their RAM frees itself as they land, over at most one `weakenTime`.

A drained target may re-enter later through the normal admission rules (spare budget: ungated; displacement: gated). Any hack jobs still in flight at re-entry count toward its pipeline again automatically — in-flight accounting is by `filename + args`, which never knew about membership.

Transition dynamics to expect (document in comments, don't "fix"): a displacing entrant starts with an empty pipeline while the evictee's RAM drains over up to a `weakenTime`, so the entrant's first ticks will bootstrap-shrink or skip-with-empty-pipeline until RAM frees. That's the existing bootstrap path doing its job; the empty-pipeline WARN stays (it's still the right signal when it happens *outside* a transition). A second expected dynamic, same treatment: admission and reservation account for pipeline cost only, while a drifted member's stage-1 prep dispatch is uncapped — several members re-prepping simultaneously can transiently starve a higher member's pipeline *refill* (the reserve carve happens after all members act). Score-ordered launches keep per-tick priority correct and the system self-corrects within a weakenTime; expect skip clusters during simultaneous re-preps, don't gate on their absence.

### In-flight accounting: one sweep

`sumInFlightRam` and `countBatchesInFlight` currently scan `ns.ps` across all hosts per call, per target. With N members that's N full sweeps per tick. Replace both with one function in `sampling.js` (it's ns-dependent, and its sibling `countInFlightThreads` already lives there):

```
inFlightByTarget(ns, hosts, ramCosts)
  -> Map/object: server -> { batches, ramGb }
```

One pass over every host's `ns.ps`: for each worker process (filename in `ramCosts`), attribute `ramCosts[filename] × threads` to `args[0]`'s `ramGb`; increment `batches` when the filename is `WORKER_SCRIPTS.hack` (each batch has exactly one hack job — the existing proxy). Unit-tested with the `inFlightPs` fixture style already in `test/sampling.test.js`. `sumInFlightRam`/`countBatchesInFlight` in `daemon.js` are deleted. **This supersedes the BACKLOG consolidation sub-item that planned to move those two functions into `sampling.js`** — update that BACKLOG entry when this ships so the consolidation item doesn't redo it.

The daemon calls it once per tick (step 2) and once after member launches (for the reserve's post-launch re-measure, step 5) — two sweeps total per tick, regardless of member count, versus the current two-per-target.

### What gets deleted

- `pickBatchTarget` (scheduler.js) and its unit tests — replaced by `pickBatchSet` + new tests.
- `planSpeculativeBatch` and the "other targets with bandwidth right now" display block — the speculative dry-run existed to show what multi-targeting *would* do; now the daemon does it.
- `sumInFlightRam`, `countBatchesInFlight` (daemon.js) — replaced by `inFlightByTarget`.
- The `flip` event, `incumbentServer`/`previousCommitmentPct` and the challenger-gate sampling at the top of the tick — subsumed by set selection and `enter`/`exit` events.

## Status display

The tail popup is redesigned around the set; this also addresses the verbosity half of BACKLOG's monitor-cleanup item (the out-of-game dashboard half stays in Ideas). Target layout, roughly:

```
===== daemon @ 11:42:07 AM ===== math: formulas
hosts: 38 | targets: 9 | members: 6 (+1 draining) | util: 61.3% | budget 1.02PB
skipped(total): 1204 | shrunk(total): 3
  joesguns        PREPPED  12/105 in flight | commit  11% | sec 5.0/5 | $412m/$412m
  harakiri-sushi  PREPPED 104/104 in flight | commit 100% | sec 5.0/5 | $250m/$250m
  ...one line per member, score order...
  max-hardware    DRAINING 41 batches landing, ~2.1m left
waterfall: 112TB free | prepping: nectar-net
last launch: #4821 harakiri-sushi 11:42:07 AM | frac 25% | steal ~$62m | lands 11:45:33 AM
```

Exact formatting is the implementer's call; the requirements are: one line per member (prep state, in-flight/depth, commitment, sec/money vs. targets), draining targets shown with an estimated drain-complete time (latest in-flight hack landing isn't tracked per job — a `weakenTime` upper bound is fine, label it `~`), a single compact last-launch line instead of today's multi-line per-batch landing breakdown, and the per-target Δ money/sec lines dropped (the transactions log now covers realized income). The prep-dispatch detail lines (requested vs. launched threads) stay, but only for drifted members, and one line per member not per sub-job — collapse to `prep joesguns: 412/900t dispatched -- RAM-LIMITED`.

## Logging: schema v2

The single-target log schema can't describe a set. Changes to `daemon.js`'s ring buffer, all shapes validated by the updated checker:

- **`mode` event** — unchanged fields, plus the `config` snapshot gains nothing new (no new tunables this phase). Its presence still marks a valid log. A v2 log is detected by the presence of at least one `snapshot` event (see below); the checker fails fast on v1 logs with a "pre-Phase-7 log, re-export" message, same pattern as the Phase 4 fail-fast.
- **`batch` event** — unchanged shape (it was already per-target via `batchTarget`); `batchesInFlight` and the `pipeline` block now describe *that member's* pipeline. Add `memberCount` (int) so a batch record is self-describing about set size.
- **`skip` event** — per-target coalescing replaces last-entry coalescing: with members interleaving every tick, "the previous entry" is usually some other target's record. Keep an in-memory map `server -> reference to its open skip record`; a new skip coalesces into that record iff classification matches and no `batch`/`enter`/`exit` for that server was appended since (any of those closes the open record). **Ring-buffer eviction also closes the open record**: when trimming splices a referenced skip record out of the buffer, its map entry is dropped in the same operation — otherwise later skips would coalesce into a spliced-out ghost object that never reaches disk, silently losing skip data from the exported log. Ordering stays defined on `firstTimestamp`; the existing lazy-flush rules apply unchanged.
- **`enter` event** (new) — `time`, `timestamp`, `server`, `score`, `displaced: string[]` (every server evicted by this rule-3 entry — rule 3 can evict multiple seats for one entrant; empty array for a spare-budget entry), `prepped` (bool, at entry).
- **`exit` event** (new, replaces `flip`) — `time`, `timestamp`, `server`, `reason: "displaced" | "unaffordable" | "ineligible"`, `batchesInFlight`, `inFlightRamGb`, `commitmentPct` (the investment now draining — the number that makes churn cost visible, inherited from the flip event's purpose). **Basis for `commitmentPct` and `inFlightRamGb`**: in-flight comes from the tick's sweep (available regardless of eligibility), but pipeline cost is *not* recomputable for an `"ineligible"` exit (the target has no usable sample this tick, by definition) — so the daemon caches each member's `pipelineCostGb` every tick it holds a seat, and every exit computes `commitmentPct` from that **last-known** cost. A member always has at least one seated tick behind it, so the field is always a number; the checker validates it as such.
- **`snapshot` event** (new) — written once per `CYCLE_MS` (first tick after each refresh): `time`, `timestamp`, `utilizationPct`, `budgetGb`, `waterfallFreeGb`, `memberCount`, `members: [{server, score, prepped, batchesInFlight, depth, pipelineCostGb, inFlightRamGb, reserveGb, commitmentPct}]`, `draining: [{server, batchesInFlight, inFlightRamGb}]` (non-members with in-flight hack jobs; omit once empty). This is the utilization time series BACKLOG's dashboard item asked for, and the primary evidence for every multi-target acceptance criterion.

**Log volume management** — this is load-bearing, not cosmetic. Today ~1 batch event/second flushes the whole buffer to disk on every append. With N members that's N appends/second, each a full-buffer `JSON.stringify` — at 6+ members and 1000 entries this is multiple MB-scale rewrites per second. Changes:

- `DAEMON_LOG_MAX_ENTRIES` raises to **2000**. Be honest about what that buys: all event types share one retention window, so at ~6 members (≈6 batch events/sec plus skips/snapshots) the buffer holds roughly the **last 4–6 minutes** of a session — snapshots included, they get no special reach. Every buffer-window claim in the acceptance criteria is scoped accordingly.
- **The most recent `mode` event is pinned**: the ring trim never evicts it — if trimming would drop the latest `mode` record, it is retained at the head of the buffer instead. Without this, any session longer than the buffer window evicts the startup `mode` event and hard-fails the checker's validity marker and per-batch `HACK_FRACTION` lookup (`latestConfigAsOf`), making the ≥20-minute acceptance session unpassable by construction. Pinning keeps every retained batch record's config lookup resolvable and the log self-describing at any session length. (Older `mode` events trim normally; only the latest is pinned. The checker's monotonic-timestamp assertion must treat the pinned head record as exempt — it can legitimately be older than nothing, since it's always first, but state the exemption explicitly in the checker.)
- **All appends flush lazily** on the existing `LOG_FLUSH_INTERVAL_MS` (10s) timer, except `mode`, `enter`, and `exit`, which flush immediately (rare, and the events acceptance cares most about losing). The current "batch events flush immediately" rule is retired — a ≤10s data-loss window on a ring buffer that's already lossy by design costs nothing.
- The mid-write truncation seen in the wild is inherent to full-file rewrites racing the auto-download and gets *more* likely with bigger files — the checker handles it gracefully (below) rather than this phase attempting atomic-write gymnastics in-game.

## Automated verification

Same three layers as Phase 4; the in-game cross-check (`xcheck`) is untouched.

**1. Unit tests (`npm test`).**

- `test/scheduler.test.js` — `pickBatchSet`: greedy admission fills in score order under budget; single-pipeline budget degenerates to `pickBatchTarget`'s behavior (hold under hysteresis, flip over it, gate blocks an unprepped challenger — and the deliberate divergence: a prepped, hysteresis-clearing #2 displaces past an unprepped #1); **skip-and-continue admission pinned with a mixed-cost case** (incumbents A > B > C by score, B too big for remaining budget, C small enough: A and C seat, only B exits `"unaffordable"`); incumbents seat before better-scored non-incumbents when the budget only fits one; spare-budget entry requires no gate; displacement evicts lowest-scored seat(s), each individually beaten by hysteresis, with **all** evicted servers returned for the `enter` record's `displaced` array; one displacement per tick even when two challengers qualify; the rule-4 refill pass admits a small non-member into budget freed by a displacement; incumbent missing from candidates exits `"ineligible"`; budget shrink exits `"unaffordable"`; empty candidates returns empty members with all incumbents exiting; input arrays not mutated. Delete the `pickBatchTarget` cases.
- `test/sampling.test.js` — `inFlightByTarget` goldens: multi-host, multi-target fixture; RAM attribution by filename × threads; hack-only batch counting; non-worker filenames ignored; targets with no processes absent from the result.

**2. Log checker (`npm run verify:log`).**

- Fail-fast additions: v1 logs (no `snapshot` event) rejected with a clear message; a `JSON.parse` failure reports "log truncated mid-export — restart the dev server / re-export and retry" instead of a raw stack trace (this exact failure occurred 2026-07-04).
- Field validation extended to `enter`/`exit`/`snapshot`; `flip` removed from the valid-event set.
- Hard assertions, existing ones kept (timestamps monotonic on the ordering key — with the pinned-head `mode` record explicitly exempt, per the volume section; global counters non-decreasing; per-batch `hackFraction` equals the log's own recorded `HACK_FRACTION` unless bootstrapping — the bootstrap exception is already per-target via the record's own `batchesInFlight`, so it survives multi-target unchanged; skip coalescing well-formed; zero hard `xcheck`s). New hard assertions:
  - **Natural-exit invariant**: between an `exit` for server S and the next `enter` for S (or end of log), S's `batchesInFlight` across successive `snapshot` records (in `draining`, or absent = 0) never increases, and no `batch` event for S appears. This is "no new batches after exit, drain only" made mechanically checkable — prep waterfall activity doesn't disturb it because prep never launches `hack.js`.
  - **Budget invariant**: in every `snapshot`, Σ members' `pipelineCostGb` ≤ `budgetGb`, and `memberCount` matches the members array length.
  - **Enter/exit sanity**: every server named in an `enter`'s `displaced` array has a matching same-tick `exit` with reason `"displaced"`, and every `"displaced"` exit is named by a same-tick `enter` (compare timestamps within one `BATCH_INTERVAL_MS`); `exit.commitmentPct` is always a number (last-known-cost basis per the schema section).
- Soft reports (extend the existing block): utilization time series summary — min/avg/max across snapshots, against the recorded **6.3% pre-phase baseline**; member-count over time; enters/exits per hour with each exit's drained `commitmentPct` (successor to the flip-rate report — same baseline framing: 8 flips/9min pre-phase); per-target batch counts; skip breakdown as today.

**3. Validation against available log files.** The existing exported logs serve as *before* evidence only: the salvaged 2026-07-04 session (6.3% utilization, 8 flips, 6 serial targets) is the baseline the soft reports cite. They cannot pass the v2 checker (by design — fail-fast) and the current file is corrupt anyway. Acceptance requires fresh exports per below. `transactions-YYYY-MM-DD.json` provides the independent income cross-check: same-character income rate before/after, same session length, same math mode.

## Files

- **`scheduler.js`** — add `pickBatchSet`; delete `pickBatchTarget`. Still pure.
- **`sampling.js`** — add `inFlightByTarget`. Everything else untouched.
- **`daemon.js`** — the orchestration rewrite: member loop, aggregate reserve carve, per-member bookkeeping maps, new display, schema-v2 logging with lazy flush, deletions listed above. No new `ns` API surface is expected (`ns.ps`, `ns.write`, `ns.exec`, the getServer* family are all already in the bundle) — the RAM gate below verifies that claim.
- **`test/scheduler.test.js`, `test/sampling.test.js`, `test/verify-log.test.js`** — per the verification section.
- **`targets.js`, `hosts.js`, workers, monitors, translog, everything else** — untouched. (`targetsmonitor.js`'s misleading `->` marker is a separate BACKLOG item; if this phase lands first, that item's "the daemon's actual target can differ" legend text should later say "the daemon's active *set*" — leave the note there, don't fix it here.)
- **`BACKLOG.md`** — on completion: move this phase to Done; annotate the consolidation item's in-flight-scanner sub-item as superseded (done via Phase 7); update the monitor-cleanup item (utilization time series: shipped as `snapshot` events; verbosity: addressed).

## Acceptance criteria

**Runnable (green before handoff):**

- `npm test` green: all existing tests except the deleted `pickBatchTarget` cases, plus the new `pickBatchSet` and `inFlightByTarget` suites.
- `npm run verify:log` green (all hard assertions, including the three new ones) against a fresh **≥20-minute formulas-mode session** with the fleet at current size. The checker validates the buffer's retained window (expected ~4–6 minutes at high member counts, per the volume section) — that's the deal the ring buffer has always offered, now stated plainly. Within that retained window: **every** snapshot must show `memberCount ≥ 2` (that's what "sustained" means here), and average utilization materially above the 6.3% baseline; include the numbers in the handoff summary. (Utilization stays a soft report — its ceiling is Σ pipeline costs / budget, which is phase-of-game dependent — but "not obviously higher than 6.3%" means something is wrong; investigate before handoff.)
- At least one **natural exit observed in the same or a second session's log**, with the natural-exit invariant passing over it. If no exit happens organically, force re-ranking churn with the Phase 4 marker trick (create `legacy-mode.txt` mid-run, then delete it — each switch reshuffles scores through the same seam a real change would). Note in the handoff which kind it was.
- Zero hard `xcheck` events, as before.

**Observed:**

- Tail popup shows multiple members batching concurrently with per-member lines matching the log's snapshots (spot-check one tick).
- An exit observed live: the member line flips to DRAINING, no new launches for it (watch `launchmonitor.js` or the log), RAM visibly returns over ~one weakenTime, and — if it re-enters — in-flight batches are counted again immediately.
- `grep`/read the diff to confirm **no `ns.kill`/`killall` call sites were added** (natural exit is scheduling-only).
- Income sanity: the transactions log's income rate over the session is reported next to a comparable pre-phase session's rate (e.g. Phase 5's $7.18B/10.7min figure or a fresh pre-implementation capture, same math mode). More concurrent pipelines against lower-ranked targets should raise total income even though each added target is individually less efficient than the top one; a *drop* needs explaining before handoff.
- RAM gate: `getScriptRam` before/after for `daemon.js` (expect ~flat — no new ns surface), `scheduler.js` bundle consumers unchanged. Flag any growth over ~0.5GB.
- Log flush behavior: with ≥3 members active, confirm the log file's on-disk update cadence is the lazy interval (~10s), not per-launch (file mtime or the dev-server download timing is evidence enough).

## Out of scope

Realized per-target income attribution (BACKLOG "per-target income/efficiency log" — the `snapshot`/`batch` events are its raw material, but closing the loop on landed money per target is its own phase); the out-of-game dashboard; buffer or hysteresis retuning; cancelling broken batches; port-based job ledgers; per-target `HACK_FRACTION` tuning (all members batch at the same fraction this phase); prep-cycle duration logging; the consistency-consolidation item beyond the one superseded sub-item; atomic log writes in-game. Scheduler stays pure, workers stay dumb, sampling keeps the one math seam.

## Peer review record (2026-07-04)

A cold-context reviewer (given only this file and the raw requirements) raised four blocking issues, all accepted and folded in above: (1) the ring buffer evicting the startup `mode` event made the ≥20-minute acceptance session unpassable → latest `mode` event pinned, buffer-window claims made honest; (2) admission rule 1 was ambiguous between prefix-stop and skip-and-continue → skip-and-continue specified everywhere, pinned by a mixed-cost unit test; (3) per-target open skip records could coalesce into ring-evicted ghost objects → eviction now closes the open record; (4) `exit.commitmentPct` was uncomputable for ineligible exits and `enter.displaced` couldn't represent multi-seat evictions → last-known-cost basis and `string[]` respectively. Its non-blocking observations on the degenerate-case equivalence, pass sequencing, "sustained" vagueness, and prep-starvation dynamics were also adopted.

## Open questions

- **Evidence-window size.** With everything sharing one 2000-entry ring, high-member-count sessions retain only the last ~4–6 minutes for offline validation. This spec accepts that (pinning only the `mode` event) rather than adding per-type retention or splitting snapshots into their own file. If longer windows turn out to matter — e.g. for the future per-target income phase — a separate snapshot stream file is the natural fix; deferred, not decided.
