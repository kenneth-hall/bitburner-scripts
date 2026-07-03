# Refactor spec: pipeline reservation waterfall (Phase 3)

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner watcher that syncs into the game). Phase 2 (see `batcher-refactor-phase2.md`) built the timed HWGW batcher: `daemon.js` launches a batch against the top-ranked target every `BATCH_INTERVAL_MS`, preps it when drifted, then spends leftover RAM prepping lower-ranked targets.

It works, but batches skip constantly. Two causes, confirmed by audit:

1. **Greedy leftover prep.** The lower-target prep loop in `daemon.js` (the `targets.slice(1)` loop) walks *every* unprepped target each tick and lets `planPrep` consume the entire remaining pool. Prep jobs occupy RAM for the target's full `weakenTime` — minutes — so one tick's spend pins RAM through hundreds of subsequent batch-launch opportunities. The in-flight discounting in `samplePrepFields` prevents infinite stacking, but its steady state is "every unprepped target's full prep requirement in flight at once," and a drained target's grow-from-$1 request is enormous. The batch target skips because lesser targets already ate the RAM.
2. **Fragmentation.** Batch jobs must each fit whole on a single host (`assignBatchHosts` returns null otherwise), while prep splits freely across hosts and shreds every large contiguous block. Even with plenty of aggregate free RAM, the grow job (largest, ×`GROW_BUFFER`) can fit on no single host → skip.

**Phase 3 fixes both with a waterfall: reserve enough RAM to keep the top target's batch pipeline full, carved out of the largest hosts, before lower-ranked targets see anything.** It also replaces the crude `maxMoney / minSecurity` ranking with a real efficiency score, so the target getting the reservation is actually the most profitable one.

## Ground rules

- Same as Phases 1–2: verify every NS API call against the docs in `markdown\` (purchased servers are `ns.cloud.*`, formatting is `ns.format.*`). Do not rely on memorized signatures. Do not search the web or reference community batcher implementations.
- **No Formulas.exe** (`ns.formulas`) anywhere. All math from the basic analysis functions evaluated against *current* state. Where current-state sampling distorts a number, note the distortion and its direction in a code comment rather than trying to eliminate it.
- `scheduler.js` stays pure — no `ns` calls in it. New planning math goes there; new `ns` sampling goes in `daemon.js` or `targets.js`.
- Worker scripts (`hack.js`, `grow.js`, `weaken.js`) are untouched.
- Preserve Phase 2 behavior everywhere this spec doesn't explicitly change it: the stage-1 batch/prep path for the top target, the shrink-fraction retry loop (except the gating rule below), drift handling, logging conventions (persistent launch ring buffer, timestamped tprints, per-tick status block), startup sequence.

## The reservation mechanism

**Pipeline depth.** Steady state wants one batch launched per `BATCH_INTERVAL_MS` until the first lands `weakenTime` later, so:

```
pipelineDepth = ceil(weakenTime / BATCH_INTERVAL_MS)
```

**Per-tick reserve.** Denominate the reserve in RAM, not batch count. A count-based reserve (`(depth − batchesInFlight) × cost`) has a ratchet failure mode with the shrink-fraction retry loop: when RAM tightens, stage 1 doesn't skip — it shrinks and launches a runt, which a size-blind count treats as a full pipeline slot. Runts fill the count, the reserve decays, the waterfall pins the freed RAM in minutes-long prep, and full-fraction batches never fit again — a stable low-yield equilibrium the skip counter never sees. Instead:

```
reserve = max(0, pipelineDepth × fullBatchRamCost − inFlightTopTargetRam)
```

- `fullBatchRamCost` is *always* the cost of a full-`HACK_FRACTION` batch (cost basis below), even when this tick's launch was fraction-shrunk. This is what breaks the ratchet: a runt launch leaves the reserve nearly intact, so the next tick's full-fraction attempt still has protected RAM to land in.
- `inFlightTopTargetRam` = Σ over every process on every known host where the filename is one of the three worker scripts and `args[0]` is the batch target: `ramCosts[filename] × threads`. Measure it *after* the tick's stage-1 launch so just-launched jobs are included. During a drift this sum includes stage-1's own prep jobs against the top target — deliberate: that RAM is already committed to the same pipeline's restart, and the elevated-security cost basis (which overestimates) pushes the other way. Note both distortions in a comment.
- `weakenTime` for the depth comes from the same fresh sample as the cost basis — not the `CYCLE_MS`-stale copy in the targets list.

Self-balancing as before: the reserve decays toward zero as RAM committed to the top target approaches the pipeline's full cost (prep then gets the surplus automatically) and snaps back up as broken batches drain after a level-up drift. No cap, no new tunables — when the reserve exceeds the pool, lower targets get nothing, by design.

One known wobble to observe, not pre-fix: at exact saturation the reserve is 0 and the next launch depends on a landing freeing RAM just before the tick fires — timing jitter can make the full-fraction batch miss and the retry loop launch a runt instead. Countervailing: real tick cadence runs slower than `BATCH_INTERVAL_MS` (tick work takes time), so `pipelineDepth` slightly overestimates, leaving accidental slack in the safe direction. The shrunk-launch counter in the status block (below) exists to show which effect wins before any deliberate slack gets added.

**Cost basis.** `fullBatchRamCost` = Σ over the four jobs of `ramCosts[script] × threads`, from a fresh `sampleBatchFields` sample at full `HACK_FRACTION` — computed every tick regardless of whether a batch launched, shrank, or skipped, and regardless of drift. Comment the distortion: sampling while security is elevated overestimates hack threads and therefore the reserve — the safe direction (over-reserving during re-prep protects the pipeline that's about to restart). This sampling only *is* safe after cleanup 3 below (money-independent hack sizing); with the current `hackAnalyzeThreads` call, a drifted target holding less than `HACK_FRACTION × maxMoney` would return -1, collapse to 1 thread via the `max(1, ceil(...))` guard, and silently under-reserve at exactly the moment over-reserving matters.

**Shrink gating.** One explicit change to the Phase 2 retry loop: shrink the hack fraction only when the pipeline is empty (`batchesInFlight === 0`); with batches in flight, a full-fraction miss is a skip, not a shrink. Rationale: in the RAM-poor regime the pool fills with in-flight batches before the pipeline is depth-complete, and every tick between "pool exhausted" and "first landing" fails the full-fraction fit — ungated, the retry loop pumps runts into the scraps, and those runt slots *self-perpetuate*: a tick where a runt lands frees only runt-sized RAM, so full fraction never fits at that slot again and the launch-size pattern locks in with period `weakenTime`. The reserve can't prevent this (stage 1 has unlimited claim). Gated, the gap produces clean skips instead — the scraps idle for up to `weakenTime`, a small deliberate loss — and shrinking still bootstraps an empty pipeline exactly as Phase 2 intended. A skip with `batchesInFlight > 0` is therefore expected saturation behavior, not a failure; the status block should make that readable (e.g. distinguish "skipped: pipeline saturated" from a skip on an empty pipeline, which still indicates real trouble).

**Carving.** The reserve is subtracted from the pool *hosts largest-free-RAM first*, so the biggest contiguous blocks — the only places a batch's grow job can land — are what get protected. Implement as a pure function in `scheduler.js`:

- `carveReservation(hosts, reserveGb)` → returns a new pool where `reserveGb` has been deducted from hosts in descending `freeRam` order (a host can be reduced to 0; move to the next until the reserve is satisfied or the pool is exhausted). The returned pool is what the lower-target prep loop receives.

**Placement.** Stage 1 (batch launch, or prep of the batch target when drifted) keeps first, unlimited claim on the pool exactly as today. The reserve applies only to the pool handed to the lower-target loop — which, with hysteresis, becomes "every target except the batch target" rather than literally `targets.slice(1)` (the incumbent may not be ranked first). Reserving even while the batch target is still prepping is deliberate: the moment it flips to prepped, the pipeline can start filling instead of waiting minutes for lower-target prep jobs to expire.

## Efficiency-score ranking

Replace the `ratio: maxMoney / minSecurityLevel` ranking in `targets.js` with expected dollars per GB-second. Every job in a batch occupies its RAM for ≈ `weakenTime` (additionalMsec pads the shorter actions out to the shared landing window), so RAM-time per batch ≈ `batchRamCost × weakenTime`, and:

```
score = (maxMoney × HACK_FRACTION × hackAnalyzeChance(server)) / (batchRamCost × weakenTimeSeconds)
```

- `batchRamCost` here is the steady-state plan `targets.js` already computes (hack/grow/weaken thread counts) costed at the worker scripts' RAM (`ns.getScriptRam` on home — import `WORKER_SCRIPTS` from `scheduler.js`). Read the script RAM once per `getTargets` call, not per server.
- **The plan's hack sizing must switch to the money-independent form first** (cleanup 3): `ns.hackAnalyzeThreads(server, maxMoney × HACK_FRACTION)` returns -1 whenever the server *currently* holds less than the requested amount (per `markdown\bitburner.ns.hackanalyzethreads.md`), and the existing `max(1, ceil(...))` guard turns that into 1 thread. A drained target would get a near-zero `batchRamCost` and an *inflated* score — the ranking's worst error would be a fake #1, the dangerous direction. Use `ceil(HACK_FRACTION / ns.hackAnalyze(server))` instead.
- Comment the remaining distortion: `hackAnalyzeChance` and `weakenTime` are sampled at *current* security, so high-security targets score pessimistically. Acceptable — scores self-correct as prep progresses — but it means a great-but-unweakened target ranks low until the waterfall gets around to prepping it.
- Sort descending by `score`. Keep the `ratio` field out or keep it for display — either is fine, but the sort key is `score`.
- Keep `targets.js` runnable standalone; add the score to the summary line (`ns.format.number` or exponent formatting — pick whatever reads cleanly, scores will be small).

**Incumbent hysteresis.** The current-security sampling cuts both ways: the moment the top target drifts (a level-up breaks in-flight batches, security rises), its *own* score tanks at the next `CYCLE_MS` refresh — exactly when stage 1 is investing re-prep and the reserve is protecting its pipeline. Phase 2's static ratio couldn't rank-flip from drift; this score can, orphaning the prep investment and slamming the reserve to full depth against a cold target (`inFlightTopTargetRam` starts at 0). So the daemon's *choice* gets stickiness while the ranking stays pure:

- New export in `scheduler.js`: `RANK_HYSTERESIS = 1.25` — a challenger must score 25% better than the incumbent to take the batch-target slot.
- New pure helper in `scheduler.js`: `pickBatchTarget(targets, incumbentServer, hysteresis)` — returns the incumbent's entry if it's still in the list and no target beats its score by ≥ the factor; otherwise `targets[0]`. Incumbent gone from the list (level filter, etc.) → `targets[0]`, no special case.
- `daemon.js` tracks the incumbent server name across ticks and feeds it in. `targets.js` standalone output is unaffected — it shows raw score order; the stickiness lives only in the daemon.

## Cleanups (secondary, do in the same pass)

1. **Unify `HACK_FRACTION`.** `targets.js` has a private `HACK_FRACTION = 0.25` duplicating `scheduler.js`'s export. Delete the local copy and import from `scheduler.js`. This is a correctness prerequisite for the score: the ranking math must use the same fraction the daemon batches with.
2. **Cross-server delta bug.** In `daemon.js`, `previousMoney`/`previousSecurity` persist across ticks but are compared against whatever the current batch target is. When the batch target changes, the first tick prints a meaningless cross-server Δ spike. Track which server the previous values belong to and reset both to null when it changes.
3. **Money-independent hack sizing in `sampleBatchFields`.** Replace `ns.hackAnalyzeThreads(server, target.maxMoney * hackFraction)` with `Math.max(1, Math.ceil(hackFraction / ns.hackAnalyze(server)))`. This is a correctness prerequisite for both the reserve's cost basis and the ranking (see the -1 sentinel notes above). The semantics shift from "fraction of max money" to "fraction of current money" — strictly *more* correct for the batch design: hacking fraction f of current money is exactly what the `1/(1−f)` grow multiplier restores, whereas the old amount-of-max form left the grow multiplier slightly mismatched whenever money sat below max. Guard against `hackAnalyze` returning 0 (unhackable server) by treating the sample as unusable rather than dividing by zero — shouldn't happen for eligible targets, but don't let it produce Infinity threads.

## Files

- **`scheduler.js`** — add pure helpers: `pipelineDepth(weakenTimeMs)`, `batchRamCost(jobs, ramCosts)` (works for both a planned batch's jobs and the steady-state plan), `carveReservation(hosts, reserveGb)`, `pickBatchTarget(targets, incumbentServer, hysteresis)`; add `RANK_HYSTERESIS`. Everything existing stays.
- **`daemon.js`** — pick the batch target through `pickBatchTarget`; switch `sampleBatchFields` to money-independent hack sizing; measure `inFlightTopTargetRam` after stage 1; compute the reserve; carve it; pass the carved pool to the lower-target loop. Fix the delta bug. Extend the status block: reserve GB, `pipelineDepth`, pipeline commitment (`inFlightTopTargetRam / (pipelineDepth × fullBatchRamCost)` as a %), `batchesInFlight` (count, kept for context), GB actually available to the waterfall (log "waterfall: 0 GB free" plainly when the reserve swallows the pool — that state is expected early on and shouldn't look like an error), and a running count of fraction-shrunk launches next to the skip counter. Runts are the new skips: a flat skip counter with a climbing shrink counter is the ratchet's signature, so it must be visible.
- **`targets.js`** — import `HACK_FRACTION` and `WORKER_SCRIPTS` from `scheduler.js`; switch the plan's hack sizing to `ns.hackAnalyze` (cleanup 3's rationale); add `batchRamCost`-based score; sort by it; show it in the standalone summary.
- **`hosts.js`, workers, `killscripts.js`, `purchasescripts.js`, `upgradehomeram.js`, `connect.js`** — unchanged.

## Acceptance criteria

The pipeline's full cost is `pipelineDepth × fullBatchRamCost` — plausibly tens of TB for a real target (depth runs 60–300 at `BATCH_INTERVAL_MS = 1000`), so the total pool being *below* it is the normal early/mid-game state, not an edge case. Criteria split by regime:

**Both regimes:**

- Every launched batch is at full `HACK_FRACTION` except while bootstrapping an empty pipeline (the only case shrink gating still permits). A flat skip counter alone proves nothing — watch the shrunk-launch counter for fraction degradation.
- When the reserve exceeds the pool, the waterfall dispatches nothing and says so clearly — no crash, no error-looking spam.
- The batch target does not flip away mid-re-prep after a level-up drift (hysteresis working); `targets.js` standalone prints raw scores and its ordering reflects them.
- The status delta line no longer spikes when the batch target changes.
- `scheduler.js` remains free of `ns` calls; `hosts.js` and `targets.js` still run standalone.
- In-flight jobs are still never killed; no behavior change to stage 1's batch/prep logic beyond the sizing swap in `sampleBatchFields`, the shrink gating rule, and where in-flight RAM is measured.

**RAM-rich only (pool ≥ pipeline cost):**

- With the batch target prepped, a full-fraction batch launches every tick: skip counter and shrunk-launch counter both stay flat.
- The logged reserve visibly decays toward 0 as commitment approaches 100%, and rebuilds as broken batches drain after a drift.
- Lower-target prep may legitimately spend from the very first tick — surplus beyond the reserve going to the waterfall immediately is correct behavior, not a leak.

**RAM-poor only (pool < pipeline cost):**

- Expected rhythm per pipeline cycle: a burst of full-fraction launches until the pool is exhausted, then saturation skips (logged as such, `batchesInFlight > 0`) until the first landings, then one full-fraction launch per landing. Saturation skips accumulating is normal here; skips on an empty or unsaturated pipeline are the real signal.
- Every tick reads "waterfall: 0 GB free" and lower targets get nothing — this is the design working, and the reserve-decay criterion is unobservable here. Don't chase it; the commitment % in the status block is the meaningful progress signal instead.

## Out of scope

Port-based job ledgers, cancelling broken batches, Formulas.exe math, batching multiple targets simultaneously, any cap/percentage knob on the reservation, and deliberate reserve slack padding (e.g. `pipelineDepth + 1`) — revisit the last two only if the logs show target transitions too slow or saturation-jitter runts (a climbing shrink counter at ~100% commitment). Keep the door open as before: scheduler stays pure, workers stay dumb.
