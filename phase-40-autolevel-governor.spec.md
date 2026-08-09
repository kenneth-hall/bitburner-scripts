# Phase 40 spec: the autolevel governor

**Stage:** spec (Stage 2), drafted 2026-08-08 from `phase-40-autolevel-governor.features.md`.
**Model flow:** brainstorm (opus) → this spec (fable) → cold `spec-reviewer` pass → implement (sonnet).
**Branch:** cut off `master` at implementation time. ⚠️ The dev server watches this checkout — **do not
switch branches while the game is connected** (CLAUDE.md); stop `npm run dev` first for any merge
choreography.
**Builds on:** `docs/phases/phase-39-bladeburner-primary.spec.md` (S6 verification, S7 ledger, S9a
post-install regime, S13 state shape). Nothing in Phase 39 is superseded; two of its fields are
**repaired**, and one function gains an optional parameter.

**Read first:** `phase-40-autolevel-governor.features.md` (D1–D5 are settled — this spec implements
them and does not re-argue them; §5.1's two answered questions **and its 2026-08-08 `rankLoss`
retraction** are the design's load-bearing inputs), `docs/bn6-go-no-go.md` §11–§12 (the
measurements), `docs/bladeburner-reference.md` §6 "Action levels" + §7 gotchas 5/6/13/14.

**What ships:** a repaired attempt ledger in `src/bladeburnermanager.js` (realised per-completion
outcomes + the four dead `context` correlates), a per-action autolevel governor built as **two** pure
functions — a decision and a state reducer — plus a read-back-verified actuator, vitest coverage for
every one of them, a shadow→active staging gate, and the doc reconciliations. **No new log file. No
new script. No live probe.** No source code is written by this document.

---

## Revision 2 (2026-08-08) — cold-review blocker fixes, index

The `spec-reviewer` cold pass returned **11 blockers** plus 7 lower-severity items. Each is fixed at
the section named below and carries an inline `(fixes blocker N)` marker so this table can be
verified rather than trusted.

| # | Blocker | Fixed in |
|---|---|---|
| 1 | V6/L8's 703 rank/h bar fails today with zero code changed (engine's own field reads 694); middle band undefined | **S5** (rewritten) + **L4/L8** + **V6** |
| 2 | 🔴 Per-level counters + autolevel make `LEVEL_LOWER_BAND` unreachable — the governor cannot engage mid-slide, only after terminal collapse | **S2.1** (new — the counter model) + the rule table + **L3** |
| 3 | `regimeReset` source undefined and unlatched; can walk a level to the floor | **S2.2** rule 2 (latched in the pure inputs) |
| 4 | No guard against action-independent collapse; ownership irreversible ⇒ `Tracking` can be walked down | **S2.3** (`classifyCohort`) + **S2.2** rule 6c (drop budget) |
| 5 | `hardCeilingLevel` never expires against an upward-moving max level | **S2.4** |
| 6 | `uncertain` boundaries have no specified consumer | **S1.2** + `foldCompletion` + **L2/L6** |
| 7 | Ship gate arithmetically unsatisfiable for WI1 (+4 GB change vs a +12 GB gate) | **S10** (split R1a/R1b, measured numbers) |
| 8 | V3 contradicts S5's revert call site | **V3** (restated) |
| 9 | WI1's hoist instruction deletes reads that are still consumed | **WI1** (exact reads named, not a line range) |
| 10 | Governor state transitions unspecified and loop-inline — the shape the spec's own ground rules forbid | **S2.5** (`applyLevelDecision`, a pure reducer) |
| 11 | `rankLoss` sign problem | ✅ **RESOLVED BY MEASUREMENT** — see immediately below |

### Blocker 11, resolved by measurement, not by argument *(features §5.1(b), corrected in the repo)*

Across all **4,486** consecutive-interval rank deltas in `bladeburner-attempts.json`: **2,743
positive, 1,777 exactly zero, ZERO negative.** `rankLoss` is never observed to apply — a failed
`Investigation` pays nothing; it does not cost rank. Four consequences, folded in throughout:

1. **§12.2's by-level curve carries no sign error.** The reconstruction's `d < 0` guard never fired,
   so nothing was silently dropped. The evidence base for D1/D2 is intact.
2. **`observed.rankDelta` can never be negative** — S1 specifies no negative handling and no test
   fixture asserts one. A negative reading in production is an instrument fault, not a failed action
   (S1.3 makes it a `warn` and drops the sample).
3. **`success` is derived from `successDelta >= 1` and from nothing else** — never from the sign or
   magnitude of a rank change. That is the only success signal in the design.
4. 🔴 **V1's ±25% cross-check on `Tracking` cannot validate the failure path** — `Tracking` succeeds
   ~100% of the time, so a settlement bug that mishandled failures would pass it silently. That was
   the reviewer's real point, and it gets its own criterion: **S1.3 + V1b** validate the instrument
   *on failures*, using `Investigation` (~99% zero-rate) and a pairing invariant.

⚠️ The remaining §5.1 caveat stands: those level→payout figures are `Tracking`'s (a Contract), and
`Investigation` is an Operation — **Q40-8**.

---

## Context — the four things this spec exists to get right

1. **The instrument is broken, and every number in the brainstorm is a workaround.** `observed.rankDelta`
   and `observed.successDelta` are `0` on all 4,487 records and four `context` fields are hardcoded
   `null` (`bladeburnermanager.js:1653`). §12's dose-response curve had to be rebuilt by *differencing
   `context.rank` between consecutive records* — a method that silently drops the last record and any
   record straddling an install. **A controller cannot be driven off a field that is zero.**
   🔑 The root cause is not a missing assignment: the record is settled **one tick (~1 s) after the
   start**, while the action pays out ~50 s later at its *completion*. `rankDelta` and `successDelta`
   are being measured over the wrong interval. Wiring the fields without moving the settlement point
   would produce zeros that *look* deliberate.
2. **The controller's input must be realised outcomes, and only realised outcomes (D3).** The
   estimator's *lower* bound was measured biased **high** — `Investigation` predicted pMin 0.764
   against a realised ~7% (§11.5). **No function introduced by this phase may call
   `getActionEstimatedSuccessChance`**, directly or through a parameter; V2 greps for it.
3. **The trade is asymmetric, and that asymmetry — not a target level — is the design.** §5.1:
   payout scales ~**+4%/level** while success collapses ~**8% → 99% zero across 12 levels**.
   Overshooting *downward* is cheap; sitting above the cliff forfeits ~100% of that action's yield
   (pure opportunity cost — blocker 11 retracted the "and costs rank" half, which changes the
   magnitude of the penalty but not its direction). So the governor **hunts the highest
   reliably-clearing level**, drops fast, and raises one cautious step at a time.
4. **`Tracking` is load-bearing and must not be walked down.** It supplies ~30 actions/h at
   19.77–24.52 rank/action with a 0–1% failure rate; `Investigation` is filler on capacity `Tracking`
   cannot supply (§11.4). D5 requires the governor to be generic *and* a no-op on a converged action.
   🔴 **Revision 2 no longer claims ownership-on-slide alone guarantees this** (blocker 4): a
   city-wide collapse would drag `Tracking` below the band too. Three independent guards now stand
   between the governor and that outcome — the cohort guard (S2.3), the drop budget (S2.2 rule 6c),
   and the revert path (S5) — and L7 measures it.

---

## Ground rules

- **CLAUDE.md conventions apply in full.** In particular:
  - **Identifier hygiene.** The RAM analyzer bills on *names*: a local named `window` cost Phase 38
    **+25 GB**, `state.share` cost **+2.4 GB**, a local `ls` cost **+0.20 GB**. Every identifier this
    spec introduces is pre-screened in **S9**, including the one that nearly happened here: the
    governor's trailing sample buffer is `recentWindow`, **never `window`**.
  - **Import bleed.** `bladeburnermanager.js` keeps importing only from `common.js`. No new imports.
  - **No Singularity calls.** Unchanged.
  - **Observability is files, not popups** — and specifically **no new file**: Q40-5 is resolved in
    S8 in favour of extending the existing ledger + state snapshot, so **`vite.config.ts` is not
    edited** (both target files already have filter entries, lines 97–99). The `dashboard.js`
    `BLADEBURNER` panel is **not** touched; no new dashboard space is requested.
- **Loop-inline logic is untestable.** Every behaviour an acceptance criterion depends on is an
  exported pure function with vitest coverage. Phase 39's 10.5-hour HRC park was loop-inline code;
  that is the precedent this rule exists on, and **blocker 10 is that rule applied to this spec's own
  first draft** — the governor's state transitions were one sentence of prose and are now
  `applyLevelDecision` (S2.5).
- **No behavioural supersession in existing tests.** The 1246-test suite stays green. Exactly **two**
  acknowledged edits are permitted, both additive, named in **T1**.
- **Every setter is verified by read-back.** `setActionLevel` and `setActionAutolevel` both return
  **`void`** (reference gotcha 6 — "no success signal at all. Read back to confirm"), and
  `getActionAutolevel` returns `false` for an invalid action too (gotcha 5). Same class as gotcha 14
  (`startAction`'s lying boolean), same treatment: **the read-back is the evidence, the call is not.**
- **RAM is re-measured, never assumed** — S10, now with a **measured** R0 and a per-work-item gate.
- **`augfarmer.js`, `backdoorfactions.js`, `backdoorwd.js`, `daemon.js`, `dashboard.js`,
  `installer.js` get ZERO edits.** An unavoidable edit to any of them is a stop-and-return-to-spec.

---

## Spec-stage decisions

### S1 — The ledger is repaired by moving the settlement point, not by filling in fields *(D4, features §4)*

Two record kinds, not one. The existing `start` / `start-failure` record is **kept unchanged** — it is
S6's verification evidence and the `startAction`-no-op diagnostic — and a new **`complete`** record
carries the realised outcome. (Phase 39's S7 schema already named `kind: "complete"`; it was never
implemented.)

#### S1.1 — Completion detection

The engine currently has no way to see a completion: `startAction` auto-repeats and
`getCurrentAction()` stays non-`null` across reps (reference gotcha 13), so the only documented
detector is **`getActionCurrentTime()` wrapping** — elapsed ms dropping from near the action's full
time back to ~0. That is a genuinely new 4 GB call (grep-confirmed: it appears in
`bladeburnerdiag.js` and `bladeburnertrial.js`, **not** in `bladeburnermanager.js`). It is the only
new *read* this phase adds.

⚠️ **Rejected alternative, and why:** inferring completions from `getActionSuccesses` alone (0 GB
marginal) is cheaper and **wrong** — successes increment only on success, so every *failure* is
invisible, and the failure rate is the governor's entire input. Inferring from a rank increase fails
for the same reason, plus blocker 11's finding that failures move rank by exactly zero.

#### S1.2 — Settlement, and the disposition of uncertain boundaries *(fixes blocker 6)*

A `boundaryState` accumulator holds `{type, name, level, rankAtBoundary, successesAtBoundary,
sinceMs}`. On a detected completion:

| field | source |
|---|---|
| `observed.successDelta` | `getActionSuccesses(type,name)` now − at last boundary (already-charged call) |
| `observed.rankDelta` | `getRank()` now − at last boundary (already read every tick). **Never negative** (blocker 11) |
| `observed.actionSec` | wall seconds since the last boundary |
| `success` | `successDelta >= 1`, **and nothing else** |
| `uncertain` | see below |

The accumulator is **discarded, not settled**, whenever the running action changes or verification
fails between boundaries — a preempted rep pays nothing, so attributing an interval that spans two
actions manufactures exactly the contaminated sample `bladeburnermanager.js:1671-1674` was written to
catch for Diplomacy.

🔴 **An `uncertain` completion is RECORDED but NEVER FOLDED.** This is a live path, not a corner
case: `nextUpdate()` resolves 1,000–5,000 ms of *simulated* time per tick and bonus time spends at up
to 5×, so one tick can straddle more than one rep. Collapsing N reps into one sample corrupts both
the numerator (`successDelta` can exceed 1) and the denominator (always 1) — i.e. it corrupts exactly
the success rate the governor reads and the rank/action V1 grades. Disposition, stated in one place:

- `uncertain` is set when **either** `detectActionBoundary` reports `uncertain: true`
  (`elapsedMs − previousElapsedMs > actionTimeMs`) **or** `successDelta > 1` — the second is an
  independent signal that the time-based detector missed a boundary, and it costs nothing to check.
- Uncertain records are written to `bladeburner-attempts.json` with `uncertain: true` (they are
  evidence about the instrument) and are **excluded** from `recentWindow`, from `byLevel`, and from
  every L2/L6/V1 aggregate — each of those aggregates filters `uncertain !== true`, and the test
  suite asserts the filter.
- `levelGovernor.uncertainCompletions` and `.completions` are both counted in state. Above
  `LEVEL_UNCERTAIN_WARN_FRACTION = 0.05` of completions the engine emits one `warn`
  (`reason: "boundary-uncertainty-high"`) — the instrument is then losing samples and the governor's
  windows fill more slowly than this spec's timings assume.

#### S1.3 — The four null correlates cost 0 GB, and the failure path gets its own validation

| field | source | new RAM |
|---|---|---|
| `context.cityChaos` | `getCityChaos` — already called twice per tick (`:1597` inside the `else`, `:1716` after the start block) | **0** |
| `context.teamSize` | `getTeamSize` — same, `:1598` / `:1719` | **0** |
| `context.countRemaining` | `getActionCountRemaining` — already called by `buildCandidates(:303)`, which **discards the value**; carry it onto the candidate object | **0** |
| `context.skillLevelsHash` | `getSkillLevel` — already called for all of `SKILL_BUY_ORDER` at `:1704`, after the start block | **0** |

The fix is a **hoist and de-duplicate**, specified exactly in WI1 (blocker 9). Net call count falls;
net RAM is unchanged.

**One free correction folded in:** `predicted.pMax` is currently `undefined` because
`buildCandidates` destructures only `[pMin]` from a call that returns both. Take both — the
estimator's *width* is the uncertainty signal §11.5 and §12 keep reconstructing, and it costs
nothing. (This is a recorded *observation*; D3 still forbids any controller function reading either.)

🔴 **Validating the instrument on FAILURES, which `Tracking` structurally cannot do** (blocker 11's
fourth consequence). Three checks, all cheap, all in V1b:

1. **The pairing invariant.** Given zero negative deltas ever observed, a settled non-uncertain
   record must satisfy `successDelta === 0 ⇒ rankDelta === 0` and `successDelta >= 1 ⇒ rankDelta > 0`.
   Bar: **≤5% of records violate it**, and the violation rate is logged rather than assumed zero.
2. **The failure-path sample.** `Investigation` is measured at a **99% zero-rate**, so its `complete`
   records must read `successDelta === 0` on **≥90%** of them. An instrument that silently reported
   every rep as a success would pass every `Tracking` check and fail this one.
3. **A negative `rankDelta` is an instrument fault**, not a failed action: `warn`
   (`reason: "negative-rank-delta"`), drop the sample, do not fold it.

⚠️ **One deviation, flagged rather than folded in:** `flushLogs` writes the ledger as
`JSON.stringify(attemptEntries, null, 2)` every 10 s. This phase roughly **doubles the record rate**,
halving the ring's time depth (5,000 records ≈ 5 days → ≈ 2.5). Two deliberate responses: (a) the cap
stays at 5,000 and the pretty-print indentation is **dropped** — all consumers are `JSON.parse`, so
this is a ~40% write-size saving with no information loss; (b) the depth loss is made irrelevant by
S8's persisted aggregates, which survive ring eviction.

### S2 — The governor

#### S2.1 — The counter model: a trailing window that SURVIVES game-driven level changes *(fixes blocker 2 — the most serious)*

The first draft counted "attempts at exactly the current level" and reset on every level change.
**That makes the lower band structurally unreachable**, and the reviewer's arithmetic is correct:
autolevel advances the level on **every success**, so for a still-succeeding action the per-level
counter resets on the first success. Reaching `minSamples: 20` at one level requires 19 consecutive
failures, i.e. an observed success rate ≤ **0.05** — so the effective take-ownership threshold was
0.05, not 0.60, and the governor could only engage *after* terminal collapse, never mid-slide.
Worse, `Tracking` at ~100% success would never exceed 1 attempt at any level, so rule 7 would never
be evaluated and L3's stated pass was unreachable.

**Resolution — one counter, and it is explicitly level-agnostic:**

| | |
|---|---|
| **`recentWindow`** | A trailing ring of the last `LEVEL_RECENT_WINDOW = 30` **non-uncertain** completions of that action, each `{level, success, rankDelta, atMs}`. **It is reset ONLY when the governor itself changes the level** (or takes/loses ownership). A *game-driven* level change does **not** reset it. This is the counter every decision reads |
| **`byLevel`** | Per-level `{attempts, successes, rankSum}`, pruned to the 12 most-recently-touched levels. 🔴 **Recorded data only — NOT a controller input.** It exists so Q40-6's realised-yield hill-climb is a pure re-analysis later |

**The explicit answer to "do `attempts`/`successes` survive a game-driven level change": the
`recentWindow` does, by design; `byLevel` does not, because it is keyed by level.** For an
**ungoverned** action the window therefore spans several game-driven levels — deliberately, because
that is what makes a *slide* detectable while it is still a slide. For a **governed** action the
level only changes when we change it, and we reset the window then, so the window is automatically
"completions at the current level" with no special case.

`actionOutcome` carries `levelSpan: {min, max}` (the level range present in the window) so every
decision is logged with its provenance and the mixed-level case is directly testable.

**Reachability, restated numerically:** at ~30 completions/h (`Tracking`) and ~26/h
(`Investigation`), a full window fills in **~60–70 minutes**. Rule 7 is evaluated every tick
thereafter. `LEVEL_MIN_SAMPLES = 20` is the decision floor; the window holds 30 so a decision is
never taken on the ragged edge of the buffer.

#### S2.2 — `planLevelAdjustment`: the decision *(pure)*

```js
/**
 * Pure. The autolevel governor's decision for ONE action. Reads realised outcomes only --
 * getActionEstimatedSuccessChance appears nowhere in this call graph (D3, V2).
 *
 * @param {{
 *   name: string, type: "Contracts"|"Operations",
 *   level: number,                  // getActionCurrentLevel at decision time
 *   governed: boolean,              // autolevel already set false by us
 *   attempts: number,               // non-uncertain completions in recentWindow (S2.1)
 *   successes: number,
 *   rankSum: number,                // realised rank over the window -- logged, not a band input
 *   levelSpan: {min:number, max:number},
 *   levelSetAtMs: number|null,      // when WE last set this action's level
 *   ceilingLevel: number|null, ceilingSetAtMs: number|null,
 *   hardCeilingLevel: number|null, hardCeilingSetAtMs: number|null,
 *   regimeResetAppliedAtMs: number|null,
 *   drops: {atMs:number, levels:number}[],   // OUR level reductions, for the drop budget
 *   governorFailedUntilMs: number|null,
 *   raiseStreak: number
 * }} actionOutcome
 * @param {{ nowMs:number, regimeEnteredAtMs?:number|null, cohortCollapsed?:boolean,
 *           minSamples?:number, lowerBand?:number, raiseBand?:number, cooldownMs?:number,
 *           minLevel?:number, ceilingHoldMs?:number, hardCeilingRetryMs?:number,
 *           maxRaiseStep?:number, maxTotalDrop?:number, dropBudgetMs?:number }} opts
 * @returns {{ decision:"hold"|"lower"|"raise"|"insufficient-data",
 *             toLevel:number|null, successRate:number|null, samples:number,
 *             levelSpan:{min:number,max:number}|null, reason:string }}
 */
export function planLevelAdjustment(actionOutcome, opts)
```

**Behaviour, in evaluation order.** Each row is a unit test.

| # | Condition | Result | Why |
|---|---|---|---|
| 1 | `level`/`attempts`/`successes` non-finite or negative, or `successes > attempts` | `insufficient-data`, `toLevel: null`, reason `"bad-input"` | Never act on a malformed record |
| 1b | `governorFailedUntilMs !== null && nowMs < governorFailedUntilMs` | `hold`, reason `"governor-failed"` | A setter that did not take is not retried for 30 min (S2.5) |
| 2 | **`regimeEnteredAtMs !== null`** and `governed === true` and (`regimeResetAppliedAtMs === null` **or** `regimeResetAppliedAtMs < regimeEnteredAtMs`) | `lower` to `max(minLevel, floor(level/2))`, reason `"post-install-reset"` — bypasses `minSamples` and `cooldownMs`; clears `ceilingLevel` (**not** `hardCeilingLevel`, S2.4) | Blocker 3's latch, **in the inputs**: the source is the engine's existing `regime-enter` edge (`isPostInstallRegime(player.hp.max)`, logged at `:1497`), and the `regimeResetAppliedAtMs < regimeEnteredAtMs` comparison makes it **once per regime entry**, provably. An install resets combat stats to 1 and every clearable level collapses at once (Q40-3) |
| 3 | `regimeEnteredAtMs !== null` and `governed === false` | `hold`, reason `"ungoverned-regime"` | An ungoverned action is on autolevel and may be fine — `Tracking` took **no** measured damage across install #43 at L102–112 (§12.3). Rule 6 catches it empirically at a cost of ≤1 window |
| 4 | `attempts < minSamples` | `insufficient-data`, reason `"samples"` | 20 completions ≈ 45 min |
| 5 | `levelSetAtMs !== null` and `nowMs − levelSetAtMs < cooldownMs` | `hold`, reason `"cooldown"` | Wall-clock anti-thrash floor; mostly non-binding because rule 4 binds first |
| 5b | `opts.cohortCollapsed === true` **and** the decision would be `lower` | `hold`, reason `"cohort-collapse"` | **Blocker 4.** See S2.3 |
| 6 | `successRate < lowerBand` | `lower` — step = `4` if `successRate < 0.20`, `2` if `< 0.40`, else `1`; `toLevel = max(minLevel, level − step)`; reason `"below-band"`, or `"take-ownership"` when `governed === false`. **If `level <= minLevel`, degrades to `hold` / `"at-floor"`** *(the reviewer's non-blocking note: the old rule 7 was unreachable as an independent branch, so it is folded in here)* | The asymmetry (§5.1): a 4-level overshoot costs ~1.2× payout, a 1-level undershoot leaves ~99% failure. `Investigation` at ~1% converges 33 → 29 in **one** step |
| 6c | rule 6 fired and `levelDropsInWindow(drops, nowMs, dropBudgetMs) + step > maxTotalDrop` | step clamped to the remaining budget; if the remainder is 0 ⇒ `hold`, reason `"drop-budget"`, and the caller emits one `warn` | **Blocker 4's belt.** Bounds the worst case at `LEVEL_MAX_TOTAL_DROP = 12` levels per rolling 24 h **regardless of cause** — including causes nobody has thought of. A regime reset (rule 2) does **not** charge this budget; it is not a controller drop |
| 7 | `governed === false` (rule 6 did not fire) | `hold`, reason `"autolevel-healthy"` | **D5's no-op guarantee, structural.** An ungoverned action is never raised — autolevel raises it on every success, strictly faster than anything this controller can do |
| 8 | `successRate >= raiseBand`, `governed === true`, ceilings permit | `raise` — step = `min(maxRaiseStep, 1 + raiseStreak)`; `toLevel = level + step`, clamped to `ceilingLevel − 1` while that ceiling holds and to `hardCeilingLevel` while that one holds (S2.4); reason `"above-band"` | Payout rises ~4%/level and the clearable level is a **moving target** (combat stats regrow). The streak lets a post-install action climb 10 → 30 in ~7 windows instead of 20 |
| 9 | rule 8's clamp yields `toLevel <= level` | `hold`, reason `"ceiling"` | |
| 10 | otherwise | `hold`, reason `"in-band"` | The intended steady state |

**Defaults (provisional; written into every log event so they can be re-derived offline):**
`LEVEL_RECENT_WINDOW = 30` · `LEVEL_MIN_SAMPLES = 20` · `LEVEL_LOWER_BAND = 0.60` ·
`LEVEL_RAISE_BAND = 0.95` · `LEVEL_COOLDOWN_MS = 600_000` · `LEVEL_FLOOR = 1` ·
`LEVEL_CEILING_HOLD_MS = 21_600_000` (6 h) · `LEVEL_HARD_CEILING_RETRY_MS = 14_400_000` (4 h) ·
`LEVEL_MAX_RAISE_STEP = 4` · `LEVEL_MAX_TOTAL_DROP = 12` · `LEVEL_DROP_BUDGET_MS = 86_400_000` ·
`LEVEL_SET_RETRY_MS = 1_800_000` · `LEVEL_UNCERTAIN_WARN_FRACTION = 0.05` ·
`COHORT_MIN_ACTIONS = 2` · `LEVEL_OUTCOME_LEVELS_KEPT = 12`.

⚠️ **The band is a proxy, and its cost if wrong is bounded and small.** §12.2's realised peak sits at
L26–29, i.e. a 63–87% success rate — which is what `[0.60, 0.95]` targets. If the true optimum sits
*below* 0.60, the governor parks 1–2 levels low and forfeits ~4–8% of that action's yield — **~1.5%
of the aggregate** at `Investigation`'s ~16% share. If it sits above 0.95, the raise band finds it.
Logged as **Q40-6**; `byLevel.rankSum` is recorded specifically so a future phase can hill-climb on
realised yield instead of a proxy.

#### S2.3 — `classifyCohort`: the action-independent-collapse guard *(fixes blocker 4)*

A city-wide success collapse is documented real — `MIN_CITY_POPULATION`'s comment, and an unscouted
city reading `[0.0000, 1.0000]` on every action. In that state **`Tracking` also crosses the lower
band**, the governor would take ownership, set `autolevel` false permanently, and walk L112 down 4
levels per 20 completions — ~20 h of forfeited payout on the load-bearing action, which Context §4
promises is structurally impossible. The first draft had no guard. It does now:

```js
/**
 * Pure. Is the whole sampled cohort down, or is one action down? Chaos and population are
 * city-scoped and hit every action equally (features §1.1), so a cohort-wide collapse is
 * NOT an autolevel problem and must not be answered by lowering levels.
 * @param {{name:string, attempts:number, successes:number}[]} outcomes
 * @param {{minSamples?:number, lowerBand?:number, minActions?:number}} opts
 * @returns {{collapsed:boolean, sampled:number, belowBand:number, reason:string}}
 */
export function classifyCohort(outcomes, opts)
```

- `sampled` = actions with `attempts >= minSamples`. `belowBand` = of those, how many read
  `successRate < lowerBand`.
- `collapsed: true` iff `sampled >= COHORT_MIN_ACTIONS (2)` **and** `belowBand === sampled`.
- **`sampled < 2` ⇒ `collapsed: false`, reason `"single-action-cohort"`, and the lower is ALLOWED.**
  A judgment call, made rather than hedged: with one sampled action the two hypotheses are
  indistinguishable, and holding forever would disable the phase whenever the pool narrows to one
  action. **Cost if wrong:** a city-wide collapse with a single-action pool walks that action down;
  the raise band recovers it once the city does, at ~4%/level. The caller logs one `warn`
  (`reason: "single-action-cohort"`) so the ambiguity is visible rather than silent.
- 🔑 **This delivers features §3.1's deferred chaos test for free.** A `cohort-collapse` event *is*
  the action-independent-degradation signature that phase named as its wake condition, recorded with
  each action's realised rate. Diplomacy stays deferred; its wake condition is now instrumented.

#### S2.4 — Ceilings, and why `hardCeilingLevel` must expire *(fixes blocker 5)*

Two ceilings, different meanings, both **aged out inside `planLevelAdjustment`** so the reducer never
has to clear them (one place, one test):

| | Set by | Held for | Cleared by rule 2? |
|---|---|---|---|
| `ceilingLevel` | a `lower` — the lowest level a lower has fired *from* | `LEVEL_CEILING_HOLD_MS` (6 h), then treated as `null` | **Yes** — combat stats collapse at an install, so a stats-derived ceiling is meaningless afterwards |
| `hardCeilingLevel` | the game **refusing** a raise (read-back < requested) | `LEVEL_HARD_CEILING_RETRY_MS` (4 h), then treated as `null` for exactly one raise attempt to `hardCeilingLevel + 1`; a second clamp resets the timer | **No** — it reflects the action's `maxLevel`, a property of the action rather than of our stats, and nothing suggests `maxLevel` falls at an install |

**Why the 4 h expiry is mandatory, not tidy:** no regime reset is scheduled (`src/ratchet-mode.txt` =
`observe`, installs stopped 2026-08-06) while the action level is measured *still climbing* at
~1 level / 3.5 h (§11.1). A permanent hard ceiling would cap that action forever and forfeit exactly
the 4%/level gradient D2 exists to protect. 4 h sits just above the observed climb interval, so the
re-probe tracks growth without thrashing.

⚠️ **Acknowledged, not solved: bounded oscillation.** Between a `lower` and its ceiling expiry the
governor can cycle raise → clamp/lower → hold. Worst case is one wasted raise per
`LEVEL_CEILING_HOLD_MS`, i.e. **~12% of one action's completions in mildly-degraded operation** until
combat stats catch up. Accepted (≈2% of the aggregate) rather than damped with more machinery; it is
visible in the `level-govern` log as a raise/lower alternation, and Q40-6's hill-climb is the
principled fix if it ever matters.

#### S2.5 — `applyLevelDecision`: the state transitions, as a pure reducer *(fixes blocker 10)*

The first draft left these in one sentence of loop-inline prose — the exact shape this spec's own
ground rules forbid, and the shape that hid Phase 39's 10.5-hour park. They decide oscillation vs.
ratchet, so they get `planLevelAdjustment`'s treatment:

```js
/**
 * Pure. Folds an APPLIED decision (and the actuator's read-back) into the action's
 * governor state. Never calls ns; the caller supplies the read-back.
 * @param {actionState} prior
 * @param {{decision:string, toLevel:number|null, reason:string}} decision
 * @param {{level:number, autolevel:boolean|null, ok:boolean}} readBack
 * @param {number} nowMs
 * @returns {actionState}
 */
export function applyLevelDecision(prior, decision, readBack, nowMs)
```

| case | transition |
|---|---|
| `hold` / `insufficient-data` | **identity** — no field mutates (asserted: a decision that does nothing must change nothing) |
| `lower` applied, read-back == `toLevel` | `level = readBack.level`; `governed = true`; `levelSetAtMs = nowMs`; `recentWindow = []`; `raiseStreak = 0`; `drops = [...drops, {atMs: nowMs, levels: prior.level − readBack.level}]`; `ceilingLevel = min(prior.ceilingLevel ?? ∞, prior.level)` — **replaced only when the new lower fires from a level below the recorded ceiling**; `ceilingSetAtMs = nowMs` |
| `lower` applied, read-back **≠** `toLevel` | `level = readBack.level` (the game is the truth); `governorFailedUntilMs = nowMs + LEVEL_SET_RETRY_MS`; `recentWindow = []`; **no ceiling update, no drop charged** |
| `raise` applied, read-back == `toLevel` | `level = readBack.level`; `raiseStreak = prior.raiseStreak + 1`; `levelSetAtMs = nowMs`; `recentWindow = []` |
| `raise` **clamped** (read-back < `toLevel`) | `level = readBack.level`; `hardCeilingLevel = readBack.level`; `hardCeilingSetAtMs = nowMs`; `raiseStreak = 0`; `recentWindow = []` |
| `lower` with reason `"post-install-reset"` | as `lower`, **plus** `regimeResetAppliedAtMs = nowMs`, `ceilingLevel = null`, `ceilingSetAtMs = null`, `hardCeilingLevel` **untouched**, and **`drops` NOT charged** |
| autolevel read-back failed (actuator step 1) | `governorFailedUntilMs = nowMs + LEVEL_SET_RETRY_MS`; **`governed` stays `false`**; nothing else mutates |
| ownership released (S5 revert) | `governed = false`; `ceilingLevel` / `hardCeilingLevel` / `raiseStreak` / `drops` / `levelSetAtMs` all cleared; `recentWindow = []` |

**`raiseStreak` resets on:** any `lower`, any clamp, any read-back failure, and ownership release. It
increments **only** on a clean raise. That is the complete list, and it is a test.

`levelDropsInWindow(drops, nowMs, windowMs)` is a separate one-line pure function (sum of `levels`
for entries newer than `windowMs`), so rule 6c is testable independently of the reducer.

### S3 — The actuator: boundary-aligned, read-back-verified, slot-safe

Non-pure, in the loop, and the **only** code path that calls `setActionLevel`. Preconditions, all
four required:

1. `LEVEL_GOVERNOR_MODE === "active"` (S7).
2. **No active yield grant.** During a grant the engine has released the slot and started nothing; a
   forced restart would preempt the claimant and break Phase 39 S2.1's ordering contract. Level
   changes are suppressed and re-evaluated after the reclaim.
3. The action is not quarantined and not `governorFailed`.
4. We are at a **completion boundary** for that action, or the action is not currently running.

⚠️ **Precondition 4 does not by itself dodge Q40-7** *(the reviewer's non-blocking note, accepted)* —
auto-repeat means the next rep has already begun by the time we observe the boundary. **Step 5's
forced restart is what makes the level change take effect on a rep that started under it**;
precondition 4 merely makes the discarded progress ~0 instead of ~50 s.

Then, in order:

1. **If ungoverned:** `setActionAutolevel(type, name, false)`, then **read back**
   `getActionAutolevel`. If it does not read `false`: `warn` (`reason: "autolevel-set-failed"`),
   **abort without setting the level**, `governorFailed` for 30 min. Setting a level while autolevel
   is still on would be undone by the game on the next success.
2. `setActionLevel(type, name, toLevel)`, then **read back** `getActionCurrentLevel`.
3. Read-back disagreement is handled **by direction**: a `raise` reading back low is a max-level
   clamp (`hardCeilingLevel`, not an error); a `lower` reading back wrong is a genuine anomaly
   (`warn`, `governorFailed`). Both feed S2.5's reducer.
4. `applyLevelDecision(prior, decision, readBack, nowMs)` — the single state transition (S2.5).
5. If the action is the one currently running, force one restart so the next rep begins at the new
   level: `shouldStartAction` gains an optional `forceRestartReason = null` parameter which, when
   set, overrides **only** the `"running-desired"` early return. **Every existing test passes
   unchanged because the parameter defaults to `null`.** The restart is verified by S6 like any other.
6. Log exactly **one** `level-govern` event: the decision, both read-backs, the constants in force,
   `successRate` / `samples` / `levelSpan`, and `cohort` (S2.3's report).

**Player-action slot: the governor does not need it, and this is confirmed from the reference, not
assumed.** `docs/bladeburner-reference.md` §6 "Action levels" documents both setters as plain setters
with no lifecycle semantics; the slot is claimed by `startAction` / `commitCrime` / `workForFaction` /
`installBackdoor`. The **only** slot-touching call this phase makes is step 5's restart — using a slot
the engine already holds, and suppressed by precondition 2 whenever it does not.

### S4 — Ownership is sticky, reconciled from the game, and released only deliberately *(D2)*

Once taken, ownership persists. Handing `autolevel` back would re-run the succeed → level-up →
harder → fail loop this phase exists to break; §12.2 shows the loop has no self-exit (at 1% success
the action cannot climb out, and autolevel never lowers).

**Reconciliation across restarts costs nothing.** On startup, for each levelable action,
`getActionAutolevel` (already charged) reading `false` ⇒ governed. Counters and ceilings are
additionally seeded from the persisted snapshot (S8); ownership itself is read from the game, so a
lost state file degrades to "re-earn the samples", never to "hand `Investigation` back to autolevel".

⚠️ **This marker inherits gotcha 5, and the inheritance is real, not theoretical** *(reviewer's
non-blocking note)*: `getActionAutolevel` also returns `false` for an invalid action, and a
**killed** `bladeburneractionprobe.js` never runs its `finally` restore (`:379–381`) — leaving
`autolevel` false at a probe-set level, which this engine would then adopt as its own. Mitigation,
not a fix: adoption logs one `level-govern` event with `adopted: true` and the adopted level, and the
`recentWindow` starts **empty**, so no decision is ever taken on pre-restart data. The first decision
comes ~1 h later, from data this engine collected itself.

### S5 — Baseline, tripwire, and revert *(fixes blocker 1)*

**The revert path.** `LEVEL_GOVERNOR_MODE = "off"` (edited in the repo, then
`cli.mjs restart bladeburnermanager.js`). On the first tick in `"off"` with governed actions present,
the engine calls `setActionAutolevel(type, name, true)` once per governed action, reads back, logs
one `level-govern-revert` per action, and drops ownership via S2.5's release transition.

⚠️ **What revert restores:** the **policy** (the game resumes autolevelling), not the exact prior
level. The action re-climbs from where it was left at one level per success — minutes for `Tracking`,
hours for `Investigation`. Sufficient, because the pre-Phase-40 behaviour *is* the climb. No
`getActionMaxLevel` call is needed for this, which is 4 GB saved.

🔴 **The bar is a delta on the engine's own field, because the two candidate numbers are two
different instruments.** The first draft's `≥ 703 rank/h` **fails today with zero code changed**:
703 is an externally-fitted clean-35 h-window number, while `rates["24h"].rankPerWallSec` — the field
the criterion actually reads — recorded **0.19286 = 694 rank/h** in the same snapshot (§11.1). So:

- **L4 captures `baselineRankPerWallSec` = `rates["24h"].rankPerWallSec` from
  `bladeburner-state.json` at the moment of the activation flip**, and records it, stamped, in the
  close-out. Same field, same instrument, same engine on both sides of the comparison.
- **PASS (V6):** at +24 h, `rates["24h"].rankPerWallSec >= 1.10 × baseline`. (§1.4's extrapolation
  predicts ×1.34; 1.10 is a bar a real fix clears and noise does not.)
- **INCONCLUSIVE:** `0.90 × baseline` to `1.10 × baseline`. **Verdict: keep running, do not revert,
  re-evaluate once at +72 h against the same field.** If still inconclusive at +72 h the governor
  stays enabled — it is not harming — and the phase closes with "mechanism works, aggregate effect
  below detection", which is an honest outcome and is recorded as one.
- **REVERT (tripwire):** `< 0.90 × baseline`.
- ⚠️ **703 and 630 are retired as absolute bars.** Per CLAUDE.md's "stamp or omit volatile numbers",
  neither belongs in an acceptance criterion; they survive only as context.

🔴 **"Clean window" is load-bearing, because a trend read across a known disturbance is not a
trend:** the window must contain **no install** (checked against `logs/ratchet-log.json`'s
timestamps — installs are currently stopped) and `totals.postInstallSec === 0`. If either fails, the
verdict is **advisory, not binding**, and the window is re-taken — the same shape as Phase 39's
`regimeDominated`. The 24 h clock starts at the **first applied level change**, not at merge.

### S6 — Scope: which actions are governed

Contracts and Operations in `applyStageGate(buildCandidates(ns), STAGE_B_ENABLED)`. Consequences,
all deliberate:

- **General actions are excluded** — `getActionSuccesses` throws for them ("not levelable", confirmed
  live 2026-08-03), and they have no level.
- **The five Stage-B operations are never governed**, because they are never run and never sampled.
  The governor cannot become a back door into Stage B: it changes levels, not selection, and never
  calls `startAction` with an action it did not receive from the already-gated pool.
- Today that means `Tracking` (ungoverned, healthy) and `Investigation` (the target), with
  `Bounty Hunter` / `Retirement` governed automatically if they ever enter the pool — D5's "generic,
  so no Phase 41 when `Tracking` hits its own cliff", at no extra cost. It is also what makes S2.3's
  cohort test meaningful: two sampled actions is the current, normal state.

### S7 — Shipping staged: `shadow` before `active`

`LEVEL_GOVERNOR_MODE = "off" | "shadow" | "active"`, default **`"shadow"`** at WI2's merge.

In `"shadow"` the governor computes and **logs** decisions edge-triggered and calls no setter. Not
caution theatre — the lesson this node has paid for repeatedly is *an engine that measures itself
must be validated against an independent source before its numbers are trusted*, and this
controller's input is a field that has been **returning zero for five days**. Shadow costs ~1 sample
window (~1 h) and buys a check that the repaired ledger reports `Investigation` ≈ 1% and `Tracking`
≈ 100% — numbers already known independently from §12.1's reconstruction.

**If wrong, the cost is ~1 hour of the ~5 days this phase is trying to save.**

### S8 — Where the data lives: extend the ledger, aggregate in state *(resolves Q40-5)*

- **`bladeburner-attempts.json`** gains `kind: "complete"` records (S1). No new file ⇒ no
  `vite.config.ts` edit.
- **`bladeburner-state.json`** gains one `levelGovernor` block:

```
levelGovernor: {
  mode, completions, uncertainCompletions,
  cohort: { collapsed, sampled, belowBand, reason },
  constants: { recentWindow, minSamples, lowerBand, raiseBand, cooldownMs, ceilingHoldMs,
               hardCeilingRetryMs, maxRaiseStep, maxTotalDrop, dropBudgetMs },
  actions: { <name>: { type, level, governed, adopted, governorFailedUntilMs,
                       attempts, successes, rankSum, levelSpan,   // recentWindow summary
                       levelSetAtMs, ceilingLevel, ceilingSetAtMs,
                       hardCeilingLevel, hardCeilingSetAtMs,
                       regimeResetAppliedAtMs, drops, raiseStreak,
                       lastDecision: { decision, toLevel, successRate, samples, reason, atMs },
                       byLevel: { <level>: { attempts, successes, rankSum } } } } }
```

🔴 **`byLevel` and `drops` are only cumulative if something persists them** — the fifth-instance rule
from §11.7. Both are seeded on startup by a pure `seedLevelGovernor(raw)` reading the prior
`bladeburner-state.json` (the `seedTotals` precedent — defined at `:912`, called at `:1129`), **with
a schema guard**: adoption is gated on the presence of the block's own `constants` key, and a blob
missing it is rejected **whole** rather than partially adopted. That guard is not hypothetical —
Phase 39 shipped exactly that bug when a Phase-38 `totals` blob was partially adopted because two
field names matched. There is a restart round-trip unit test.

`byLevel` is pruned to `LEVEL_OUTCOME_LEVELS_KEPT = 12` most-recently-touched levels per action, and
`drops` to entries within `LEVEL_DROP_BUDGET_MS`, so a snapshot written every 10 s cannot grow
without bound.

- **`bladeburner-log.json`** gains `level-govern` and `level-govern-revert`; the failure and guard
  paths use the existing `warn` kind (`autolevel-set-failed`, `level-set-failed`,
  `negative-rank-delta`, `boundary-uncertainty-high`, `cohort-collapse`, `single-action-cohort`,
  `drop-budget-exhausted`).
  ⚠️ **Edge-triggered only, plus a 30-minute heartbeat.** Phase 39 shipped a bug where `crossover`
  logged every tick and evicted the entire 2,000-entry ring within minutes; a per-tick `hold` would
  reproduce it exactly. **A `hold` is never logged except on the heartbeat or on a change of
  `reason`.**

### S9 — Identifier hygiene pre-screen

New identifiers, checked against `ns.*` (all namespaces: `ns`, `ns.ui`, `ns.cloud`, `ns.singularity`,
`ns.formulas`, `ns.bladeburner`, `ns.dnet`) and the browser/Node globals:

`planLevelAdjustment`, `applyLevelDecision`, `classifyCohort`, `levelDropsInWindow`,
`detectActionBoundary`, `foldCompletion`, `seedLevelGovernor`, `pruneLevelOutcomes`,
`skillLevelsFingerprint`, `boundaryState`, `recentWindow`, `actionOutcome`, `actionState`,
`levelGovernor`, `governed`, `adopted`, `governorFailedUntilMs`, `toLevel`, `successRate`,
`levelSpan`, `raiseStreak`, `ceilingLevel`, `ceilingSetAtMs`, `hardCeilingLevel`,
`hardCeilingSetAtMs`, `levelSetAtMs`, `regimeResetAppliedAtMs`, `regimeEnteredAtMs`, `rankSum`,
`byLevel`, `drops`, `cohortCollapsed`, `uncertainCompletions`, `elapsedMs`, `previousElapsedMs`,
`forceRestartReason`, `lowerBand`, `raiseBand`, `maxRaiseStep`, `maxTotalDrop`, `minSamples`,
`baselineRankPerWallSec`, plus the `LEVEL_*` / `COHORT_MIN_ACTIONS` constants named in S2.2.

⚠️ **Three deliberate swerves, each naming the collision it dodges:**
1. **`recentWindow`, never `window`** — the trailing buffer is the single most natural place in this
   design to write `window`, and that identifier cost Phase 38 **+25 GB** on the name alone.
2. **`ceilingLevel`, never `probeCeiling`** — Phase 39's S15 lists `probe` as billed 0.20 GB
   (`ns.dnet.probe`). The compound name is almost certainly safe; using it would leave a near-miss in
   the file for the next reader to copy.
3. **`skillLevelsFingerprint`** is the *function*; `skillLevelsHash` stays the JSON *field* name for
   schema continuity with Phase 39's S7 shape.

Also avoided, unchanged from Phase 39's list: `window`, `document`, `location`, `navigator`,
`history`, `self`, `top`, `parent`, `global`, `process`, `share`, `exec`, `ls`, `ps`, `rm`, `mv`,
`run`, `kill`, `read`, `write`, `scan`, `hack`, `grow`, `weaken`, `tail`, `probe`, `skills`, `city`.
**Any surprising `ramcheck.js` reading is checked against this class first.**

### S10 — RAM: measured baseline, per-work-item gates *(fixes blocker 7)*

**R0 is measured, not assumed: 90.00 GB on current `master`** (`mem bladeburnermanager.js`,
2026-08-08). None of `getActionCurrentTime` / `setActionLevel` / `setActionAutolevel` is currently
charged — grep-confirmed. Historical calibration: this file read **86.00 GB** with a `window`
identifier collision present and **61.00 GB** once it was found (Phase 38); Phase 39's five new
legitimate calls took it to 90.00.

The first draft's single "R0 + 12.00 GB" gate was **arithmetically unsatisfiable for WI1**, which
introduces only one of the three calls. Split:

| gate | after | expected | delta |
|---|---|---|---|
| **R1a** | WI1 | **94.00 GB** | +4.00 — `getActionCurrentTime` only |
| **R1b** | WI2 | **102.00 GB** | +8.00 — `setActionLevel` + `setActionAutolevel` |

`daemon.js` / `augfarmer.js` **flat** at both. **Any other reading stops the phase** and is checked
against S9's identifier class *first*: a `+16` at R1b means a fourth call crept in (most likely
`getActionMaxLevel`, deliberately unused — S2.4/S5); a `+14.4` or `+12.2` is an identifier collision,
not a call. Every reading is only trustworthy if `ramcheck.js`'s `bytes[name]` matches
`dist/src/bladeburnermanager.js`'s length.

Free-RAM context: home had 162 GB free at 90 GB usage, so +12 GB is affordable; the gate exists
because an unexplained reading is a *bug signal*, not because the budget is tight.

---

## Design — work items

**Restructured from the features doc's three, and here is the change and the reason.** Features §6
proposed (1) ledger repair, (2) governor, (3) live validation. Kept: ledger repair as WI1. **Split
differently:** the governor ships **inert** (WI2, `"shadow"`) and activation-plus-validation becomes
one item (WI3) — a "validation work item" with nothing to validate is not independently shippable,
whereas "ship the controller switched off" genuinely is. Still three items, each on its own gates.

### WI1 — Ledger repair [code] *(S1, D4)*

**Merges first; WI2/WI3 are not trusted before it.** Unblocks the open `BACKLOG` bug "`startAction`
silently no-ops for Tracking and Raid" as a side effect — its recorded next action is "check whether
the ledger's context fields correlate with which attempts fail", unexecutable while those fields are
`null`.

| Function | Responsibility |
|---|---|
| `detectActionBoundary({ elapsedMs, previousElapsedMs, actionTimeMs, verified, sameAction })` | **Pure, new.** `{completed, uncertain, reason}`. `completed` on a wrap (`elapsedMs < previousElapsedMs`); `uncertain: true` additionally when `elapsedMs − previousElapsedMs > actionTimeMs`. `completed: false` with reasons `"not-running"` / `"action-changed"` / `"no-baseline"` / `"bad-action-time"` |
| `skillLevelsFingerprint(skillLevels, order)` | **Pure, new.** `order.map(s => skillLevels[s] ?? 0).join("/")` |
| `buildCandidates(ns)` | carries `countRemaining` (value already fetched at `:303`) and `pMax` (already returned by the same call) |
| `recordAttempt(...)` | unchanged shape; now also serves `kind: "complete"` |

**The hoist, stated as exact surviving reads and their new position** *(fixes blocker 9 — the first
draft said "delete `:1715–1719`", which would have removed `cityName` (still used at `:1722`,
`:1740`, `:1745`, `:1747`), `population` and `communities` (both consumed by `updateCityStock` at
`:1722`), none of which even exist in the `else`-branch block it was conflating them with)*:

1. **Move the entire city-stock block up**, from its current position after the start block to
   immediately **before** candidate selection (before the `buildCandidates` call at `:1567`). Moving:
   `cityName`, `chaos`, `population`, `communities`, `teamSize`, `contractCount`, `opCount`
   (`:1715–1721`), the `updateCityStock` call and `cityStock` assignment (`:1722–1723`), `chaosByCity`
   (`:1730`), and the breach-logging block (`:1740–1745`). **Nothing in it reads `chosenAction`** —
   verified — so the move is behaviour-preserving. `shouldRotateCity`'s dead branch (`:1746–1749`)
   moves with it. The Stage-B team assignment at `:1752` *does* read `chosenAction` and **stays where
   it is**.
2. **Delete only the three duplicate declarations inside the `else` branch** (`cityName` `:1596`,
   `chaos` `:1597`, `teamSize` `:1598`); the branch then uses the hoisted values.
3. **Compute the inventory counts once.** `getInventoryCounts(ns)` (`:1599`) and the
   `contractCount` / `opCount` reductions (`:1720–1721`) both call `getActionCountRemaining` for every
   tracked action — 18 calls per tick where 9 suffice. Compute the per-action array once, derive the
   two sums from it, and feed both `isInventoryLow` and `updateCityStock`. **RAM is unchanged** (the
   method is already charged); this is a call-count reduction folded in because the hoist touches the
   same lines anyway. Flagged rather than silent.
4. **Hoist the skill-level read block** (`:1701–1707`) above candidate selection so
   `skillLevelsFingerprint` can run at attempt-context time. `planSkillBuy` / `upgradeSkill` stay
   where they are, reading the hoisted values.
5. Populate the four `context` correlates at `:1653` from the hoisted values plus the candidate's
   `countRemaining`.

Loop changes: read `getActionCurrentTime()` each tick; maintain `boundaryState`; settle a `complete`
record at each boundary per S1.2 (including the uncertain disposition); drop the ledger's
pretty-print indentation.

### WI2 — The governor, shipped inert [code] *(S2, S3, S4, S7, S8, S9)*

| Function | Responsibility |
|---|---|
| `planLevelAdjustment(actionOutcome, opts)` | **Pure, new.** S2.2's decision table. The whole policy |
| `applyLevelDecision(prior, decision, readBack, nowMs)` | **Pure, new.** S2.5's reducer. The whole state machine |
| `classifyCohort(outcomes, opts)` | **Pure, new.** S2.3's action-independent-collapse guard |
| `levelDropsInWindow(drops, nowMs, windowMs)` | **Pure, new.** Rule 6c's budget |
| `foldCompletion(governorState, { name, type, level, success, rankDelta, uncertain, nowMs })` | **Pure, new.** Folds one completion into `recentWindow` + `byLevel`; **drops uncertain samples** (S1.2) |
| `pruneLevelOutcomes(byLevel, keep)` | **Pure, new.** |
| `seedLevelGovernor(raw)` | **Pure, new.** Restart persistence with the `constants`-key schema guard |
| `shouldStartAction({..., forceRestartReason})` | **existing, one optional parameter added, default `null`** |
| actuator (loop-inline) | S3's six steps, unreachable while `LEVEL_GOVERNOR_MODE !== "active"`. Its only non-pure content is the four `ns` calls and their read-backs |

RAM lands here in full (+8.00 GB to 102.00): the static analyzer bills the setter names whether or
not the mode constant makes them reachable. Expected, and why R1b is measured at WI2, not WI3.

### WI3 — Activation, live validation, tripwire [live] *(S5, S7)*

One-line flip of `LEVEL_GOVERNOR_MODE` to `"active"`, gated on **V4**, then the L-series. Doc
reconciliations, staged in the same commit per CLAUDE.md:

- `docs/bladeburner-reference.md` §6 "Action levels": `setActionLevel` **can lower** with no clamp
  (proven over 31 levels, `bladeburneractionprobe-1785722785366.json`); read-back is the only success
  signal; a raise clamped at max is detectable by read-back, so `getActionMaxLevel` is not required
  for a level controller. **Also §5/§6: `rankLoss` is documented but never observed to apply** —
  4,486 intervals, zero negative deltas (blocker 11).
- `docs/bn6-go-no-go.md`: a §13 recording the ledger repair and the `rankLoss` retraction, with the
  differencing reconstruction and the repaired `observed.rankDelta` shown **side by side for one
  window** — that comparison is V1.
- `docs/bn6-playbook.md` §1: the governor and its tripwire (expressed as the delta, not 630).
- `BACKLOG.md`: the `startAction` no-op bug's next action becomes executable — name the now-populated
  correlates. `docs/phases/CHANGELOG.md`: the dated entry.
- `CLAUDE.md`'s "Current standing" bullet: `Investigation`'s realised rank/action, stamped.

---

## Tests [code]

`test/bladeburnermanager.test.js`, extending the existing file. Every assertion is a named test.

**`planLevelAdjustment`** — one test per S2.2 row, plus:
- **The D5 no-op test.** `Tracking`-shaped: `governed: false`, `attempts: 30`, `successes: 30` ⇒
  `hold` / `"autolevel-healthy"`, `toLevel === null`. **The regression test for "the governor touched
  the load-bearing action."**
- **The blocker-2 reachability test.** A `levelSpan: {min: 108, max: 112}` window (a mixed-level
  window, which the old per-level model could never produce) with `attempts: 30` ⇒ rule 7 is
  **evaluated**, not short-circuited to `insufficient-data`. And the mirror: an ungoverned action
  with `attempts: 30, successes: 9` (0.30) ⇒ `lower` / `"take-ownership"` — **the mid-slide
  engagement the old model made impossible.**
- **The `Investigation` fixture, from live numbers.** `level: 33`, `governed: false`, `attempts: 30`,
  `successes: 0` ⇒ `lower`, `toLevel === 29`, reason `"take-ownership"`.
- **Sample floor:** `attempts: 19, successes: 0` ⇒ `insufficient-data`, `toLevel === null`. **A
  catastrophic-looking small sample does not act.**
- **Floor clamp:** `level: 2`, `successRate: 0` ⇒ `toLevel === 1`; at `level: 1` ⇒ `hold` /
  `"at-floor"`.
- **Cohort guard (blocker 4):** `cohortCollapsed: true` with a `Tracking`-shaped fixture at
  `successRate: 0.1` ⇒ `hold` / `"cohort-collapse"`, `toLevel === null`. **The regression test for
  "a city-wide collapse walked `Tracking` down."**
- **Drop budget (blocker 4):** `drops` summing 10 within 24 h + a step-4 lower ⇒ step clamped to 2;
  summing 12 ⇒ `hold` / `"drop-budget"`; a `drops` entry 25 h old ⇒ not counted.
- **Ceilings (blocker 5):** raise clamped to `ceilingLevel − 1` at 1 h; ceiling released at 7 h;
  `hardCeilingLevel` clamps at 1 h and is **aged out at 5 h** for exactly one attempt to
  `hardCeilingLevel + 1`.
- **Raise streak:** 0/1/2/5 ⇒ steps 1/2/3/4 (capped).
- **Post-install reset (blocker 3):** `regimeEnteredAtMs` set, `governed: true`, `attempts: 0` ⇒
  `lower` to `floor(level/2)` despite zero samples and an unexpired cooldown. **The latch test:** the
  same fixture with `regimeResetAppliedAtMs >= regimeEnteredAtMs` ⇒ `hold` — *called twice in
  succession it fires exactly once*, which is the "walks to the floor in one tick sequence" bug.
  `governed: false` ⇒ `hold` / `"ungoverned-regime"`.
- **Bad input:** `successes > attempts`, `NaN` level, negative attempts ⇒ `insufficient-data`.

**`applyLevelDecision`** — one test per S2.5 row, and specifically: `hold` is the **identity**;
`ceilingLevel` is replaced **only** by a lower firing from a level below the recorded ceiling; a
clamped raise sets `hardCeilingLevel` and zeroes `raiseStreak`; a `post-install-reset` clears
`ceilingLevel` but **not** `hardCeilingLevel` and charges **no** drop; a failed autolevel read-back
leaves `governed === false`.

**`classifyCohort`** — two actions both below band ⇒ `collapsed: true`; one below, one above ⇒
`false`; one sampled action below band ⇒ `false` / `"single-action-cohort"` (**the lower is
allowed**); actions under `minSamples` are not counted in `sampled`.

**`levelDropsInWindow`** — sums inside the window, excludes outside, empty ⇒ 0.

**`detectActionBoundary`** — wrap detected; monotonic elapsed not detected; `previousElapsedMs: null`
⇒ `"no-baseline"`; `verified: false` ⇒ `"not-running"`; `sameAction: false` ⇒ `"action-changed"`; a
jump exceeding `actionTimeMs` ⇒ `completed: true, uncertain: true`; `actionTimeMs: 0` ⇒
`"bad-action-time"`.

**`foldCompletion` (blocker 6)** — a success and a failure fold into the right counters; **an
`uncertain: true` completion changes NO counter** and increments `uncertainCompletions` only; a
`successDelta > 1` completion is treated as uncertain even when the time detector did not flag it;
`recentWindow` caps at `LEVEL_RECENT_WINDOW` and evicts oldest-first; `byLevel` is keyed by the level
at completion, **not** the current level; **a game-driven level change does not clear
`recentWindow`** (blocker 2's invariant, asserted directly).

**`seedLevelGovernor`** — round-trip: a blob written by `buildBbState` reseeds to identical counters
and `drops`. **Schema guard:** a blob missing `constants` is rejected **whole**, not partially adopted
— the regression test for Phase 39's `seedTotals` bug.

**`skillLevelsFingerprint`** — stable for equal inputs; changes on any level change; a missing skill
reads `0`, not `undefined`.

**`shouldStartAction`** — **existing tests pass unmodified.** New: with
`forceRestartReason: "level-change"` and `liveActionName === chosenAction.name` ⇒
`{start: true, reason: "level-change"}`; with the parameter absent, the same fixture still returns
`{start: false, reason: "running-desired"}`.

**`buildCandidates`** — the fake-`ns` fixture asserts `countRemaining` and `pMax` present and finite.

**D3's guard, as a test not a promise:** `planLevelAdjustment`, `applyLevelDecision`,
`classifyCohort`, `foldCompletion`, `detectActionBoundary`, `seedLevelGovernor` take no `ns` and no
candidate object, so the estimator is structurally unreachable from the controller. V2's grep is the
other half.

`test/verify-bladeburner.test.js` (`npm run verify:log`):
- `knownKinds` gains `level-govern` and `level-govern-revert`.
- `bladeburner-state.json` carries a `levelGovernor` block whose `mode` is one of the three values
  and whose per-action `successes <= attempts`.
- **Ledger-repair assertions, all qualified on record count so a freshly-restarted engine cannot fail
  them:** among non-uncertain `kind: "complete"` records — (a) if ≥50 carry `name === "Tracking"`,
  `successDelta` is not identically zero across them; (b) **if ≥50 carry `name === "Investigation"`,
  at least 90% read `successDelta === 0`** (the failure-path check `Tracking` cannot provide,
  blocker 11); (c) **no record has `rankDelta < 0`**; (d) the pairing invariant
  (`successDelta === 0 ⇔ rankDelta === 0`) holds on **≥95%** of records.

---

## Live procedure [live]

No probe script, no hand-started action. Every step reads what the engine produces, or flips one line.

- **L1 — RAM.** S10's R1a (after WI1, 94.00) and R1b (after WI2, 102.00), `daemon.js` / `augfarmer.js`
  flat, `bytes` fresh against `dist/`.
- **L2 — The ledger is alive** (after WI1). From `logs/bladeburner-attempts.json`, over non-uncertain
  `complete` records:
  - **≥25 records within 60 minutes** of the restart *(reviewer's note: the first draft said 30
    minutes, which sits exactly at measured supply — ~56 actions/h across two actions — with no
    margin; 60 minutes gives ~2×)*;
  - **`Tracking`'s mean `observed.rankDelta` within ±25% of a same-window rank-differencing
    reconstruction re-run on the new file** (context: §11.3 put it at 19.77 whole-window, 24.52
    latest bucket). Outside that band, **stop** — instrument and reconstruction disagree;
  - **the failure-path checks (S1.3):** `Investigation` `successDelta === 0` on ≥90%, zero negative
    `rankDelta`, pairing invariant ≥95%;
  - `context.cityChaos` / `countRemaining` / `skillLevelsHash` / `teamSize` non-`null` on **≥99%** of
    records written after the restart;
  - `uncertainCompletions / completions < 0.05`. Above it, L3/L6's timings slip and the boundary
    detector needs a look before activation.
- **L3 — Shadow agrees with what we already know** (after WI2). ⚠️ **Read no earlier than 90 minutes
  after the restart** — `recentWindow` needs ~60–70 min to fill (S2.1), and `insufficient-data`
  before that is the specified behaviour, not a failure *(blocker 2: the first draft's bar was
  unreachable because the counters could never fill)*. Then, from `bladeburner-log.json`:
  `Investigation` reads `decision: "lower"` with `successRate ≤ 0.10`; **`Tracking` reads
  `decision: "hold"`, reason `"autolevel-healthy"`, with `samples >= 20`** — the `samples` term is
  what proves rule 7 was actually evaluated rather than short-circuited. 🔴 **A shadow `lower` on
  `Tracking` stops the phase.**
- **L4 — Activate** (WI3): flip `LEVEL_GOVERNOR_MODE` to `"active"` in the repo, verify the push
  landed, `node tools/bb/cli.mjs restart bladeburnermanager.js`. **Record `baselineRankPerWallSec` =
  `rates["24h"].rankPerWallSec` from `bladeburner-state.json` at this moment, stamped** — every later
  bar is a ratio on it (S5). ⚠️ A `run` failure can hide behind a RUNTIME ERROR modal the terminal
  does not show — confirm the engine is alive from a fresh `bladeburner-state.json` write, not from
  `read-terminal`.
- **L5 — The change applied, verified against the game** (within 30 min of L4). One `level-govern`
  event with `applied: true` for `Investigation`, **and** the in-game Bladeburner panel
  (`cli.mjs goto Bladeburner`, `cli.mjs body`) showing that action's level at the new value.
  **Log-only confirmation is not sufficient** — Phase 38's lesson applied to a setter with no return
  value.
- **L6 — Mechanism check, +4 h.** `Investigation`'s mean rank/action over non-uncertain `complete`
  records in the trailing 2 h: **≥ 4.0** (0.23 today; §12.2's peak is 9–10 at a different combat-stat
  level, so 4.0 is a bar a working fix clears comfortably and a broken one cannot). **Miss ⇒ diagnose
  before 24 h, do not wait for the tripwire.**
- **L7 — `Tracking` unharmed, +4 h.** Three terms:
  - its level was **not lowered** and `governed` reads `false` (or, if it was taken, a
    `cohort-collapse` / `single-action-cohort` event explains why);
  - its mean rank/action is **not more than 10% below** its pre-activation value. ⚠️ **One-sided by
    design** *(reviewer's note)*: `Tracking` is measured drifting **+37% over 35 h** (~+1.1%/h), so a
    symmetric ±10% band would flag its own known upward drift as a regression;
  - its completions/h **≥ 25** (it ran ~30/h). This is the detector for a predicted second-order
    effect: as `Investigation`'s level falls, the estimator scores it *higher*, and selection still
    runs on that estimator (out of scope, features §3.2). If `Tracking`'s share of starts falls, the
    aggregate can drop even though both actions improved.
- **L8 — Aggregate, +24 h clean.** `rates["24h"].rankPerWallSec` against `baselineRankPerWallSec`:
  **≥ 1.10× PASS · 0.90–1.10× INCONCLUSIVE (keep running, re-read once at +72 h) · < 0.90× REVERT**
  (S5), subject to S5's clean-window definition.

---

## Acceptance criteria

- **T1 — `npm test` green** (1246 existing + the new tests), with **no existing fixture's expected
  value changed except two acknowledged additive exceptions**: (1) `verify-bladeburner.test.js`'s
  `knownKinds` gains two entries; (2) `shouldStartAction`'s fixtures gain new cases while every
  existing case passes byte-identically. Anything else is stop-and-re-derive. [code — Claude clears]
- **T2 — `npm run verify:log` green**, including all four qualified ledger assertions. [code]
- **R1a — 94.00 GB after WI1; R1b — 102.00 GB after WI2**, `daemon.js` / `augfarmer.js` flat, `bytes`
  fresh. Any other reading stops the phase (S10). [live]
- **V1 — L2's `Tracking` cross-check passes** (±25% against the independent reconstruction). 🔴 **No
  governor decision may be acted on until V1 passes.** [live]
- **V1b — L2's failure-path checks pass** (`Investigation` ≥90% zero, zero negative `rankDelta`,
  pairing invariant ≥95%). **V1 alone is insufficient**: `Tracking` succeeds ~100% of the time, so a
  settlement bug in the failure path would pass it silently (blocker 11). [live]
- **V2 — the estimator is structurally unreachable from the controller**, by grep and by test:
  `getActionEstimatedSuccessChance` appears in exactly one place, `buildCandidates`, and none of the
  six controller functions or the actuator references it. D3 as a checkable property. [code]
- **V3 — the setters have exactly the call sites this spec authorises** *(fixes blocker 8 — the first
  draft said "exactly one call site, both inside the actuator", which contradicted S5's revert, that
  fires on a tick where the actuator is unreachable by its own precondition 1)*: `setActionLevel`
  **exactly one** call site (actuator step 2); `setActionAutolevel` **exactly two** (actuator step 1,
  and S5's revert), **each immediately followed by a read-back**. Grepping three lines is the check.
  [code]
- **V4 — L3 passes** (shadow agrees with §12.1, with `samples >= 20` on `Tracking`) **before** the
  activation flip. [live]
- **V5 — L6 and L7 pass at +4 h.** [live]
- **V6 — L8 at +24 h clean, against `baselineRankPerWallSec`**, with S5's three-band verdict. This is
  the phase's actual deliverable. [live]

**Ship gate:** T1/T2/V2/V3 self-cleared by Claude. **WI1 merges on R1a + V1 + V1b** and nothing
downstream is trusted before it. WI2 merges on T1/T2 + R1b + V4. WI3's flip happens only after V4;
V5/V6 are close-out deliverables, not merge blockers (precedent: Phase 35's V3, Phase 39's C1/C2).

---

## Files touched

**New:** none.

**Edited:** `src/bladeburnermanager.js`, `test/bladeburnermanager.test.js`,
`test/verify-bladeburner.test.js`, `docs/bladeburner-reference.md`, `docs/bn6-go-no-go.md`,
`docs/bn6-playbook.md`, `BACKLOG.md`, `docs/phases/CHANGELOG.md`, `CLAUDE.md` (the stamped "Current
standing" bullet only).

**Deliberately untouched:** `vite.config.ts` (both target files already filtered — S8),
`src/dashboard.js` (no new panel space), `src/augfarmer.js`, `src/backdoorfactions.js`,
`src/backdoorwd.js`, `src/installer.js`, `src/daemon.js`, `src/bladeburneractionprobe.js` (its
restore-in-`finally` is what keeps S4's ownership marker mostly unambiguous — do not "simplify" it),
the batcher core.

---

## Non-goals *(carried from features §3 and §7 — do not build these here)*

- **Diplomacy pre-emption** (§3.1). Premise falsified: chaos is city-scoped and `Tracking` took zero
  damage at chaos 66.5. The chaos-branch starvation remains a real defect in `BACKLOG.md`, and its
  **wake condition is now instrumented for free** — S2.3's `cohort-collapse` event *is* the
  action-independent-degradation signature that phase named.
- **The `objectiveMode` per-second → per-action flip** (§3.2). Wake condition: the repaired ledger
  carrying ≥1 week of realised per-action yields — deliberately sequenced after this phase.
- **Dropping `Investigation`** (§3.3) — it is filler on capacity `Tracking` cannot supply.
- **City rotation** (§3.4), **Stage B / `Raid`**, **The Blade's Simulacrum**, **Bladeburner augs**,
  **sleeves**, **any change to action *selection***.
- **Claiming +34% / ~5 days saved.** §1.4 is an extrapolation from per-level yields measured at a
  *different* combat-stat level. It is the reason to build, not a result. The phase's claim is what
  L6/L8 measure.
- **Claiming chaos is harmless.** The finding is narrower: chaos *cannot* explain an action-specific
  collapse.

---

## Open questions carried forward

Each carries a default and a date, per CLAUDE.md.

| # | Question | Default while unanswered | Trigger / date |
|---|---|---|---|
| **Q40-6** | Is `[0.60, 0.95]` the right proxy for the realised-yield peak, or should the governor hill-climb on `byLevel.rankSum/attempts`? | **Ship the band.** Bounded cost if wrong: ~4–8% of one action's yield ≈ ~1.5% of the aggregate. `byLevel` is recorded so the hill-climb is a pure re-analysis | ≥200 completions across ≥3 levels for one action — expected ~1 week after WI1. **2026-08-16** |
| **Q40-7** | Does `setActionLevel` on a *running* rep reset or corrupt its progress? Both setters return `void` | **Never find out.** S3 step 5's forced restart makes the question moot; precondition 4 makes the discarded progress ~0 | Only if the forced restart shows as a measurable duty-cycle cost (currently 99.4%). **2026-08-22** |
| **Q40-8** | Does §5.1's ~+4%/level payout slope — measured on `Tracking`, a **Contract** — hold for **Operations**? | **Assume it does, and note the controller does not depend on it**: `planLevelAdjustment` reads success rate, never payout. A wrong slope invalidates S2.2's *justification*, not the mechanism | Free from WI1's ledger once `Investigation` has completions at ≥3 levels. **2026-08-16** |
| **Q40-9** | The post-install branch (rule 2) is **unit-tested only** — the install cadence is stopped (`src/ratchet-mode.txt` = `observe`) | **Leave it enabled.** Strictly safer than the alternative (an action stranded above its post-install clearable level pays ~0) | First install after the cadence resumes. **Event-triggered, no date** |
| **Q40-10** | Does the governor perturb action **selection**? As `Investigation`'s level falls, its (hot) estimated EV rises | **Do not change selection** (out of scope). L7's ≥25 completions/h on `Tracking` is the detector | L7, +4 h after activation. If it fires, the answer is the `objectiveMode` phase, not a governor tweak |
| **Q40-11** | `getActionCurrentTime()` is "undefined behavior when idle" (reference §6) — `0`, `-1`, stale, or throw? | **Guarded by construction:** `detectActionBoundary` returns `"not-running"` whenever `verified === false`, so the value is never *used* when idle | If a `complete` record appears with an implausible `actionSec`. Standing |
| **Q40-12** | 🆕 Should ownership ever be released **automatically** — e.g. an action holding `successRate >= raiseBand` at its hard ceiling for days no longer needs governing? | **No automatic release.** Handing `autolevel` back re-arms the loop this phase exists to break, and §12.2 shows it has no self-exit. Release is manual, via S5's mode flip | Reopen only if a governed action is observed permanently pinned at a hard ceiling with the raise band satisfied. **2026-09-01** |
| **Q40-13** | 🆕 Is `LEVEL_MAX_TOTAL_DROP = 12` per 24 h right? It bounds blocker 4's worst case, but it also bounds *legitimate* deep recovery — `Investigation` needs 4, a post-install `Tracking` could need far more | **12**, with regime resets exempt (they are the one legitimate deep drop, and rule 2 bypasses the budget). If a `drop-budget-exhausted` warn ever fires *outside* a cohort collapse, the constant is wrong, not the situation | First `drop-budget-exhausted` warn. **Event-triggered** |

---

## Logged dropped objections

1. **The whole phase rests on a dose-response curve reconstructed from a broken instrument.** §12.2's
   by-level table was built by differencing `context.rank` because `observed.rankDelta` is dead — the
   defect WI1 fixes. The curve is probably right (monotonic, smooth across an install boundary,
   n=1,501, and blocker 11 confirms no sign error dropped samples), but **WI1 is repairing the
   instrument that produced the evidence for WI2.** V1 + V1b are the mitigation.
2. **A closed-loop controller is being added to an engine whose action *selection* still runs on a
   number measured 16× hot.** This phase fixes the smaller, safer thing first. If L7 shows selection
   eating the gain, the response is the `objectiveMode` phase, **not** widening this controller.
3. **`Investigation`'s realised peak (~9–10 rank/action) is worth ~244 rank/h against a ~700 rank/h
   baseline on a ~20-day path.** Even a perfect outcome saves ~5 days; it does not change the shape
   of the BN6 decision. Worth doing because it is cheap and reversible, not because it is decisive.
4. **Four of the governor's constants are invented defaults** (`LEVEL_RECENT_WINDOW`,
   `LEVEL_MIN_SAMPLES`, `LEVEL_LOWER_BAND`, `LEVEL_RAISE_BAND`), and blocker 4's fixes added two more
   (`LEVEL_MAX_TOTAL_DROP`, `COHORT_MIN_ACTIONS`). All are written into every `level-govern` event so
   they can be re-derived offline — the treatment Phase 39's S3 constants got, for the same reason.
5. **NEW — the cohort guard trades a real failure mode for a rarer one.** It can block a *correct*
   lower whenever both sampled actions happen to be below band for unrelated reasons. Accepted
   deliberately: the blocked case costs one window of a degraded `Investigation`; the unblocked case
   costs ~20 h of a degraded `Tracking`, the load-bearing action. If the guard ever blocks a lower
   that later proves correct, the event log carries both actions' rates, so the misfire is
   diagnosable rather than invisible.
