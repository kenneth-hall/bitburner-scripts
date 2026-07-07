# Phase 15 features: small-fleet batching floor — fix the zero-member income stall

**Stage:** requirements handoff for the spec stage, per `CLAUDE.md`'s Development workflow.

## Goal

Income has been flat since the Jul 5 reset because `daemon.js` launches **no workers at
all**: `pickBatchSet` seats zero batch members on a small fleet and has no fallback, so the
daemon idles forever while the share pool burns a quarter of the fleet. Fix the scheduler so
a non-empty candidate list always produces at least one working member, make the stall state
loudly visible if it ever recurs, and get income climbing again on the current 940GB fleet.

## Diagnosis (evidence, from exported logs — not pasted terminal output)

All files under `logs/`, exported 2026-07-06 19:53.

1. **`daemon-batch-log.json`**: 322 entries since the daemon restart at 7:00:35 PM —
   1 `mode` event + **321 `snapshot` events and nothing else**. Zero `batch`, `skip`,
   `enter`, `exit` events. Every snapshot: `memberCount: 0`, `members: []`.
2. **Utilization is bit-for-bit frozen** at `28.085106382978726%` across all 321 snapshots
   (54 minutes). The only RAM in use is the share pool (232GB of a 235GB target) plus the
   daemon/companions on home. `waterfallFreeGb: 676` never moves → the waterfall is
   prepping nothing → every eligible target is already prepped (prep from earlier sessions
   completed; nothing consumes it).
3. **Fleet is post-reset small**: `budgetGb: 940`, `batchBudgetGb: 705` (share carve takes
   25%). `finance-log.json` shows $11.7M cash, all of it short of the $30M HTTPWorm.exe
   reservation. `bootstrap-log.json` shows the Phase 14 cold-start ran Jul 5 3:22 PM and
   handed off to the daemon at 4:09 PM; `transactions-2026-07-05.json` shows the last
   spend (cloud-0 → 512GB) landed the same second as the handoff. Nothing has been earned
   or bought since: **the daemon has produced $0 for ~27 hours.**
4. **Why zero members**: prepped, eligible targets always yield non-null samples
   (`hackAnalyze > 0`), so candidates exist — the only remaining gate is
   `pickBatchSet`'s admission rule: a candidate seats only if its **full pipeline cost**
   (`pipelineDepth(weakenTime) × batchRamCost`) fits the budget. From the last exported
   `targets-summary` (legacy math), estimated pipeline costs: cheapest is n00dles at
   **~721GB vs the 705GB batch budget**; everything else is 6,000–1,200,000 GB. (That
   summary predates the reset; at today's hacking level 230 the legacy thread counts are
   larger, so today's costs are at least this bad.) No candidate ever fits → passes 1–4
   all seat nobody → `members: []` every tick, forever.

**Root cause:** Phase 7 unified admission and reservation as "seat a target iff its *entire*
pipeline fits the budget" (`docs/phases/phase-07-batcher-refactor.md`, decisions at lines
21–22). Its degenerate case analysis stopped at "budget fits exactly one pipeline"; "budget
fits **zero** pipelines" was never considered — the phase was designed and validated on a
~1PB fleet (the spec's own sample display line reads `budget 1.02PB`). The pre-Phase-7
single-target picker had no such gate, and the bootstrap-shrink path (halve the hack
fraction until a single batch fits, down to `MIN_HACK_FRACTION` = 1%) still exists — but it
runs **inside the member loop**, so it's unreachable when no member is ever seated. Phase 14
then created the first-ever small-fleet daemon session (post-reset handoff at 940GB), which
is exactly the regime that trips this latent gate. The daemon's empty-pipeline WARN also
lives inside the member loop, so the stall was completely silent.

## Immediate mitigation (Kenneth can do this now, before any code ships)

- In game terminal: `nano share-off.txt`, save (any content). The Phase 8 marker zeroes the
  share carve within one tick, raising the batch budget from 705GB to 940GB. Share is
  currently measuring `sharePower: 1.00` with 58 threads in flight, so nothing of value is
  lost. This *may* already seat n00dles (~721GB pre-reset estimate vs 940GB) — worth doing
  regardless, but current-level thread counts are likely higher, so don't count on it as
  the fix.
- `run targets.js` to export a fresh `targets-summary-*.json` — gives the spec/implementation
  stage current-level thread counts and pipeline costs to validate the numbers above.

## Decisions

1. **Budget-capped pipeline depth at candidate construction** (`daemon.js`, step 4).
   A candidate's admission depth becomes
   `max(1, min(pipelineDepth(steadyWeakenTime), floor(batchBudgetGb / ramCost)))`.
   Rationale: full depth is a *throughput ceiling*, not a minimum viable unit — a partial
   pipeline (fewer batches in flight than `weakenTime/BATCH_INTERVAL` allows) earns
   proportionally less but earns. Capping the depth makes `pipelineCostGb` an honest
   admission/reservation number on small fleets: n00dles at depth 8 (~640GB) seats inside
   705GB today. The cap also flows into `member.depth`, the reserve carve, and the
   display/snapshot fields for free, since they all read the same candidate fields.
   Known approximation (same spirit as Phase 7's fleet-total-vs-single-host note): the cap
   is computed against the full batch budget, not the remaining budget at seat time —
   pass walks still bound the aggregate, skip-and-continue handles the rest.
2. **Floor rule in `pickBatchSet`** (`scheduler.js`, pure, unit-testable): if, after the
   spare-budget pass, `seated` is empty and `candidates` is non-empty, seat the single
   highest-scored candidate regardless of cost. The existing member-loop machinery does the
   actual fitting: empty pipeline → `allowShrink` → halve the hack fraction until a batch
   fits on some host (down to `MIN_HACK_FRACTION`). This guarantees forward progress
   whenever *any* hackable target exists — even on a fleet too small for one full-fraction
   batch (decision 1's cap can't help there, since `depth ≥ 1` still prices one full batch).
   With decision 1 in place this rule fires only in that extreme; it's the safety net, not
   the workhorse.
3. **Make the stall state loud.** `snapshot` events gain a `candidateCount` field, and the
   daemon prints a persistent `WARN` line (tail window) whenever `memberCount === 0` while
   `candidateCount > 0` — which after decisions 1–2 should be impossible, so any sighting is
   a regression alarm. Extend the `npm run verify:log` checker to fail on any such snapshot.
   (Schema note: additive field only; the checker validates the current schema, per the
   existing convention in `daemon.js`'s log header comment.)

## Rejected alternatives

- **Raise `BATCH_INTERVAL_MS` to shrink depth** (depth = weakenTime/interval): linear help
  only — at 5s intervals harakiri-sushi still needs ~1,300GB — and it throttles big-fleet
  throughput globally. Wrong knob: the problem is admission's all-or-nothing shape, not the
  pipeline being deep.
- **Just lower/zero `SHARE_FRACTION`**: frees 235GB but leaves the structural zero-floor in
  place — the next reset (or any fleet below ~700GB) stalls again. Kept as the manual
  mitigation above, not the fix.
- **Keep `bootstrap.js` running until the fleet can afford a full pipeline**: moves the
  threshold instead of removing it, leaves the daemon's stall latent, and Phase 14's whole
  point was handing off *to* the daemon; the daemon should be viable at handoff scale.
- **A separate "leftover-RAM plain-hack fallback mode"** in the daemon: a second scheduling
  regime to maintain, when the shrink path already implements "fit a smaller batch into
  what's actually free" — it just needs to be reachable.

## Open questions

- Should decision 1's cap leave headroom (e.g. cap depth against ~90% of the batch budget)
  so a lone member doesn't starve the waterfall/prep entirely on small fleets? Current lean:
  no — reserve-vs-prep contention is a documented Phase 7 transition dynamic, and on a
  starved fleet the one member *is* the priority.
- Floor rule ordering: score order is chosen (score already divides by RAM cost and
  weakenTime, so it inherently favors affordable targets), but should a candidate whose
  *single batch* fits the budget be preferred over a higher-scored one that needs shrinking?
- `sharePower: 1.00` despite 58 share threads in flight for an hour looks wrong (expected
  >1 with live threads). Possibly a separate share.js bug or a game mechanic (e.g. bonus
  only accrues during faction work) — investigate separately; noted here so it isn't lost.
- Should share suppress itself automatically while fleet capacity or income is below some
  floor (resource-manager territory), instead of relying on the manual marker? Likely its
  own later phase.

## Out of scope

- Any change to share mechanics, `SHARE_FRACTION`, or the Phase 8 marker behavior.
- Target scoring/eligibility changes (`targets.js` untouched).
- Formulas-mode behavior: the bug and fix are mode-independent (admission math never
  branches on mode), so no formulas-specific work beyond existing test parity.

## Validation sketch (detail is the spec stage's job)

- **Unit tests** (`test/scheduler.test.js` + a daemon-side pure helper if the depth cap is
  extracted): floor rule seats exactly one highest-scored candidate when nothing fits;
  floor rule never fires when something fits; depth cap clamps to ≥1 and never exceeds
  full `pipelineDepth`; existing pass 1–4 cases unchanged.
- **Log checker** (`npm run verify:log`): fails on `memberCount === 0 && candidateCount > 0`
  snapshots; validates the new `candidateCount` field.
- **Live validation** (waits on Kenneth's in-game run, per the ship gate): restart daemon on
  the current 940GB fleet; within a few ticks `daemon-batch-log.json` must show `enter` +
  `batch` events and snapshots with `memberCount ≥ 1`; money visibly climbing; a follow-up
  export confirms batches landing (`lastLandsAt` passing, money deltas on the member).
