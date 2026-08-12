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
measurements), `docs/bladeburner-reference.md` §5 (incl. the in-game console) + §6 "Action levels" +
§7 gotchas 5/6/13/14.

**What ships:** a repaired attempt ledger in `src/bladeburnermanager.js` (realised per-run outcomes
settled by **success-count subtraction**, + the four dead `context` correlates), a per-action
autolevel governor built as **two** pure functions — a decision and a state reducer — plus a
read-back-verified actuator, vitest coverage for every one of them, a shadow→active staging gate, and
the doc reconciliations. **No new log file. No new script. No live probe.** No source code is written
by this document.

---

## Revision 3 (2026-08-10) — WI1's mechanism REPLACED after a measured 21 h live failure

Revision 2's WI1 shipped to a branch and ran live for ~21 hours. **It produced zero usable data**,
and the staging gates (S7/L2/V1 — "no governor decision may be acted on until V1 passes") did their
job: the defect was caught **before activation**, at the cost of one branch cycle, with nothing
mis-set in the game.

**Measured in production:**

- **`complete` records: 0** in ~21 h. Ledger kinds present: `start` (ring full) and
  `start-failure` (5) only.
- **Governor decisions: 1,998 — every one** `insufficient-data` / `"samples"` / `samples: 0`. The
  controller never received a single data point.
- **Root cause, measured, not inferred:** `detectActionBoundary` required `sameAction` across
  consecutive ticks to observe a wrap — and the engine **changes action on 99.3% of consecutive
  starts** (4,961 of 4,994), strictly alternating `Tracking` (~45 s) → `Investigation` (~77 s). The
  wrap this design waited for is a state the engine essentially never occupies.

🔴 **This was not an implementation defect — sonnet implemented Revision 2's S1 correctly, and every
pure-function test passed.** The *mechanism* was incompatible with how the live engine behaves, and
nothing in the spec's own test surface could have caught it: the pure functions were all correct; the
live loop simply never fed them. That earns the **fifth method rule**, sibling to the four in
CLAUDE.md:

> 🔑 **A tested function is not a tested mechanism.** Unit tests prove the function computes; only
> observing the live loop *feed* it proves the mechanism works. Any controller spec must name the
> live signal that will show its input pipeline flowing (here: L2's settled-record count), and that
> check runs before anything acts.

**The replacement mechanism (S1, rewritten): `successRate = Δ getActionSuccesses ÷ Δ starts`, per
action.** No boundary detection at all. The very alternation that starved Revision 2's detector makes
this one dense: every switch is a settlement point. Revision 2's S1 explicitly *rejected* this
mechanism, and **that rejection was wrong** — it argued "successes increment only on success, so
every failure is invisible," which reasons about detecting individual *events*. The governor only
ever consumes an *aggregate rate*, and `starts − successes` is the failure count, exactly. The
faulty rejection is preserved, struck through, in S1.1 so it cannot be re-derived.

**Index of Revision 3 changes:**

| What | Change |
|---|---|
| S1.1–S1.2 | Mechanism replaced: settle-on-next-start subtraction; `detectActionBoundary` and `getActionCurrentTime` **deleted** |
| Blocker 6 (uncertain boundaries) | **Evaporates** — no boundaries exist. Replaced by three narrower dispositions (multi-rep intervals, counter-reset guard, single-action fallback), S1.2 |
| S2.1 | `recentWindow` now holds **settled interval entries**, not per-completion samples — semantics pinned, cost-if-wrong stated |
| WI2 | `foldCompletion` → **`foldSettlement`** (reshaped input, same fold semantics). `planLevelAdjustment` / `applyLevelDecision` / `classifyCohort` **unchanged** |
| S10 / R-gates | `getActionCurrentTime` deleted ⇒ **WI1 gate = 90.00 GB (R0 + 0.00)**, WI2 gate = **98.00 GB** |
| V1/V1b | Re-grounded on the in-game **Bladeburner console** (UI-only, no API — reference §5), which independently validated three instruments to within 1–6% |
| S5/V6 | Aggregate 1.10× PASS bar **retired as unattributable** — `Tracking`'s own rate is compounding +7–8%/6 h with no governor at all (718 → 1,090 rank/h across 48 h). PASS is now mechanism-level; the aggregate delta survives only as the revert tripwire |
| Live numbers | All Revision-2 standing figures restamped from 2026-08-10 live reads (rank 100,237 · 24 h 1,016 rank/h · `Tracking` L121 / 35.41 / 0% · `Investigation` L33 / 0.00 / 100% zero · Ishima chaos 170.5) |
| Open questions | Q40-11 **deleted** (its call is gone); Q40-14 / Q40-15 / Q40-16 added |

**Standing rulings, closed by Kenneth and not reopenable here:** Q40-12 (ownership is never
auto-released) and S2.3's single-action-cohort case (the lower is allowed, with a warn). D3 remains
absolute. Chaos remains falsified as `Investigation`'s cause — restamped at chaos **170.5** (2.5× in
two days) with `Tracking` still at **0%** failure; do not resurrect it.

---

## Revision 2 (2026-08-08) — cold-review blocker fixes, index

The `spec-reviewer` cold pass returned **11 blockers** plus 7 lower-severity items. Each is fixed at
the section named below. *(Revision 3 note: blocker 6's fix is superseded — the uncertain-boundary
machinery is deleted along with the boundary detector itself.)*

| # | Blocker | Fixed in |
|---|---|---|
| 1 | V6/L8's 703 rank/h bar fails today with zero code changed; middle band undefined | **S5** + **L4/L8** + **V6** *(re-revised in Rev 3)* |
| 2 | 🔴 Per-level counters + autolevel make `LEVEL_LOWER_BAND` unreachable | **S2.1** + the rule table + **L3** |
| 3 | `regimeReset` source undefined and unlatched | **S2.2** rule 2 (latched in the pure inputs) |
| 4 | No guard against action-independent collapse | **S2.3** (`classifyCohort`) + **S2.2** rule 6c (drop budget) |
| 5 | `hardCeilingLevel` never expires | **S2.4** |
| 6 | `uncertain` boundaries have no consumer | ~~S1.2's disposition~~ **superseded in Rev 3 — no boundaries exist** |
| 7 | Ship gate arithmetically unsatisfiable for WI1 | **S10** *(re-derived in Rev 3: 90.00 / 98.00)* |
| 8 | V3 contradicts S5's revert call site | **V3** (restated) |
| 9 | WI1's hoist deletes reads still consumed | **WI1** (exact reads named) |
| 10 | Governor state transitions loop-inline | **S2.5** (`applyLevelDecision`, pure reducer) |
| 11 | `rankLoss` sign problem | ✅ **RESOLVED BY MEASUREMENT** — see below |

### Blocker 11, resolved by measurement *(features §5.1(b), corrected in the repo)*

Across all **4,486** consecutive-interval rank deltas: **2,743 positive, 1,777 exactly zero, ZERO
negative.** `rankLoss` is never observed to apply — a failed `Investigation` pays nothing. Four
consequences, folded in throughout: (1) §12.2's by-level curve carries no sign error; (2)
`observed.rankDelta` can never be negative — a negative reading is an instrument fault (S1.2's
counter-reset guard); (3) **`success` derives from success-count deltas and nothing else** — never
from the sign or magnitude of a rank change; (4) `Tracking` alone cannot validate the failure path —
**V1b** validates it on `Investigation`, now with the console as the independent numerator source.

---

## Context — the four things this spec exists to get right

1. **The instrument is broken, and every number in the brainstorm is a workaround.** `observed.rankDelta`
   and `observed.successDelta` are `0` on all records and four `context` fields are hardcoded `null`
   (`bladeburnermanager.js:1653`). §12's dose-response curve had to be rebuilt by differencing
   `context.rank` between consecutive records. **A controller cannot be driven off a field that is
   zero** — and, Revision 3 adds, **it cannot be driven off a mechanism the live loop never feeds.**
   The root cause of the dead fields is that the record is settled one tick (~1 s) after the start,
   while the action pays out ~45–77 s later; Revision 2 moved the settlement to a *boundary* that the
   alternating engine never exhibits; Revision 3 moves it to the **next verified start**, which the
   alternating engine exhibits ~59 times an hour.
2. **The controller's input must be realised outcomes, and only realised outcomes (D3).** The
   estimator's lower bound was measured biased **high** (`Investigation` predicted pMin 0.764,
   realised ~7%, §11.5). **No function introduced by this phase may call
   `getActionEstimatedSuccessChance`**, directly or through a parameter; V2 greps for it.
3. **The trade is asymmetric, and that asymmetry — not a target level — is the design.** Payout
   scales ~+4%/level (`Tracking`-measured; now visibly ~5%/level at L121) while success collapses
   ~8% → 99% zero across 12 levels. Overshooting downward is cheap; sitting above the cliff forfeits
   ~100% of the action's yield. The governor hunts the highest reliably-clearing level, drops fast,
   raises one cautious step at a time.
4. **`Tracking` is load-bearing and must not be walked down.** Restamped 2026-08-10: **L121, 35.41
   rank/action, 0% failure, yield rising ~5%/level and the rate compounding** (6 h buckets over 48 h:
   718 → 760 → 801 → 864 → 911 → 981 → 1,029 → 1,090 rank/h). Three independent guards stand between
   the governor and that action — the cohort guard (S2.3), the drop budget (S2.2 rule 6c), and the
   revert path (S5) — and L7 measures it. `Investigation` meanwhile reads **L33, 0.00 rank/action,
   100% zero** — stuck, contributing nothing; restoring it projects the ETA from **~12.3 → ~9.9
   days**.

---

## Ground rules

- **CLAUDE.md conventions apply in full.** In particular:
  - **Identifier hygiene.** The RAM analyzer bills on *names*: a local named `window` cost Phase 38
    **+25 GB**, `state.share` cost **+2.4 GB**, a local `ls` cost **+0.20 GB**. Every identifier this
    spec introduces is pre-screened in **S9**; the governor's trailing sample buffer is
    `recentWindow`, **never `window`**.
  - **Import bleed.** `bladeburnermanager.js` keeps importing only from `common.js`. No new imports.
  - **No Singularity calls.** Unchanged.
  - **Observability is files, not popups** — and **no new file**: Q40-5 is resolved in S8 in favour
    of extending the existing ledger + state snapshot, so **`vite.config.ts` is not edited** (both
    target files already have filter entries, lines 97–99). The `dashboard.js` `BLADEBURNER` panel is
    not touched.
- **Loop-inline logic is untestable** — every behaviour an acceptance criterion depends on is an
  exported pure function with vitest coverage. **And its Revision-3 corollary: a tested function is
  not a tested mechanism** — the live signal proving the input pipeline flows (L2's settled-record
  count) is itself a named, gating check.
- **No behavioural supersession in existing tests.** The 1246-test suite stays green. Exactly **two**
  acknowledged edits are permitted, both additive, named in **T1**.
- **Every setter is verified by read-back.** `setActionLevel` and `setActionAutolevel` both return
  **`void`** (reference gotcha 6), and `getActionAutolevel` returns `false` for an invalid action too
  (gotcha 5). Same class as gotcha 14 (`startAction`'s lying boolean), same treatment: **the
  read-back is the evidence, the call is not.**
- **RAM is re-measured, never assumed** — S10, measured R0, per-work-item gates.
- **`augfarmer.js`, `backdoorfactions.js`, `backdoorwd.js`, `daemon.js`, `dashboard.js`,
  `installer.js` get ZERO edits.** An unavoidable edit to any of them is a stop-and-return-to-spec.

---

## Spec-stage decisions

### S1 — The ledger is repaired by success-count subtraction, settled at the next start *(D4; REWRITTEN in Rev 3)*

Two record kinds. The existing `start` / `start-failure` record is **kept unchanged** — it is S6's
verification evidence and the `startAction`-no-op diagnostic — and a new **`complete`** record
carries the realised outcome of each settled run interval.

#### S1.1 — The mechanism: `successRate = Δ getActionSuccesses ÷ Δ starts`

**Every verified start is a settlement point for the run it terminates.** The engine already records,
at each start of action X, `successesBefore` (`getActionSuccesses(X)`, `:1639`) and `context.rank`
(`:1653`) — both already charged, 0 GB marginal. When the **next** verified start fires (of any
action — the engine alternates on 99.3% of consecutive starts, so this is ~59 times/hour), the
previous action's open run is settled:

| field | source |
|---|---|
| `observed.successDelta` | `getActionSuccesses(X)` now − `successesBefore` at X's start |
| `observed.rankDelta` | `getRank()` now − `context.rank` at X's start. Attributable to X alone — only X ran in the interval |
| `observed.actionSec` | wall seconds from X's verified start to this settlement |
| `attempts` | `max(1, successDelta)` — see S1.2's multi-rep disposition |
| `success` | `successDelta >= 1`, and nothing else |

Why this is the right shape, stated as properties: **immune to action alternation** (the switch *is*
the settlement trigger — the exact behaviour that starved Revision 2's detector feeds this one);
**immune to bonus time** (no time arithmetic is load-bearing on the primary path; a compressed
interval still yields exact success counts); **needs no boundary detection at all**
(`detectActionBoundary` and its `getActionCurrentTime()` read are **deleted** — 4 GB back); **the
denominator is exact** (the engine counts its own verified starts; nothing is estimated on the
primary path).

~~**Rejected alternative: inferring completions from `getActionSuccesses` alone — successes increment
only on success, so every failure is invisible, and the failure rate is precisely the governor's
input.**~~ 🔴 **That rejection (Revision 2's S1.1) was WRONG, and it cost a 21-hour live cycle.** It
reasons about detecting individual *events*; the governor only ever consumes an *aggregate rate*, and
`starts − successes` **is** the failure count — exact, per action, with both terms already in hand.
Kept struck-through so the argument cannot be re-derived by a future session. *(The event-level
version stays true and stays irrelevant: no record identifies which particular rep failed. Nothing in
this phase needs one.)*

#### S1.2 — Dispositions: the three narrow cases that replace blocker 6's boundary machinery

No boundaries ⇒ no `uncertain` boundaries ⇒ Revision 2's entire disposition apparatus
(`detectActionBoundary`, `uncertain` records, `LEVEL_UNCERTAIN_WARN_FRACTION`) is **deleted**, not
carried. What remains are three narrower cases:

1. **Multi-rep intervals** (auto-repeat + bonus time can complete >1 rep before the next start):
   `successDelta` can exceed 1. `attempts = max(1, successDelta)` keeps `successes ≤ attempts` by
   construction. ⚠️ **Known, bounded bias:** an interval with 2 reps of which 1 failed settles as
   1/1 — the failure is invisible *within multi-rep intervals only*. Direction: overestimates
   success, so the governor raises marginally too eagerly; the next window corrects at ~4%/level.
   Bounded because multi-rep intervals require the engine *not* to switch, and it switches 99.3% of
   the time.
2. **Counter-reset guard.** `successDelta < 0` is possible if the game's per-action success counter
   ever resets (an install is the obvious candidate — **whether `getActionSuccesses` survives an
   install is unknown**, and per the method rule *a counter is not cumulative until you find the code
   that persists it*, this spec assumes nothing). Disposition: **discard the interval, re-baseline
   from the current read, log one `warn` (`reason: "success-counter-reset"`)**. Never folded, never
   negative in the ledger. **Q40-16.**
3. **The single-action regime** (the mirror of Revision 2's failure — a mechanism fed only by
   switches starves when the engine stops switching, e.g. `Investigation` quarantined or a
   one-action pool). Fallback: an open run older than `SETTLE_MAX_MS = 300_000` is settled in place
   without a start — `successDelta` by subtraction as usual (exact), but `attempts =
   max(successDelta, round(actionSec / actionTimeSec))`, using the `getActionTime` value already on
   the candidate. The record carries **`estimated: true`**. ⚠️ This is the one place an estimate
   enters the pipeline, and it is fenced: estimated entries **are** folded (the governor must not go
   blind in exactly the regime where an action might need help), the flag is carried into
   `recentWindow` entries and the `level-govern` log, and if estimated entries exceed
   `ESTIMATED_SAMPLE_WARN_FRACTION = 0.25` of a window the engine emits one `warn` — the governor is
   then running on arithmetic, not measurement, and a human should look. Cost if the estimate is
   wrong: the denominator skews by ±1 per interval; at 5-minute settlement cadence that is a ≤20%
   error on a small minority of samples. **Q40-15.**

Also unchanged from Revision 2: the open run is **discarded** (not settled) when verification fails
mid-interval, and the first interval after an engine restart is discarded for lack of a baseline
(`openRunState` is in-memory only — deliberately, per the persistence method rule: a baseline from a
dead process is not a baseline).

#### S1.3 — The four null correlates cost 0 GB, and the console is the independent cross-check

| field | source | new RAM |
|---|---|---|
| `context.cityChaos` | `getCityChaos` — already called twice per tick (`:1597`, `:1716`) | **0** |
| `context.teamSize` | `getTeamSize` — same (`:1598` / `:1719`) | **0** |
| `context.countRemaining` | `getActionCountRemaining` — already called by `buildCandidates(:303)`, value currently discarded; carry it on the candidate | **0** |
| `context.skillLevelsHash` | `getSkillLevel` — already called for all of `SKILL_BUY_ORDER` (`:1704`) | **0** |

The fix is a hoist and de-duplicate, specified exactly in WI1. **One free correction folded in:**
`predicted.pMax` is currently `undefined` (`buildCandidates` destructures only `[pMin]`); take both.
(Recorded observation only — D3 still bars any controller function from reading either.)

🔑 **The independent instrument: the in-game Bladeburner console** (UI-only, no API — verified
against the official upstream repo; documented in `docs/bladeburner-reference.md` §5 and
`tools/bb/README.md`). It logs every **completion** with exact rank. Measured 2026-08-10 over a
2.69 h window, three instruments agreed: console **82 `Tracking` completions · 29.79
rank/completion · 909 rank/h** vs the engine's `rates["1h"]` **902 rank/h** vs a `context.rank`
differencing reconstruction of **28.21 rank/action** — agreement within 1–6%.

⚠️ **The console logs successes ONLY** — zero failure lines in 2.69 h while `Investigation` started
every ~77 s. It therefore validates the **numerator** (success counts and their rank) and is a
cross-check, never a source; **the failure rate exists only by subtraction**, which is why V1b's
failure-path validation is stated as a *consistency triangle*, not a direct read:

1. **Numerator check (V1, `Tracking`):** ledger Σ`successDelta` and mean rank/success over a ≥2 h
   window vs the console's completion-line count and mean rank/completion — **within ±10%** (the
   three-instrument agreement above was 1–6%).
2. **Failure-path numerator check (V1b, `Investigation`):** the console's `Investigation`
   completion-line count over the same window vs ledger Σ`successDelta` — **within ±1 line or ±10%,
   whichever is looser** (both are near-zero today; exactness is the point).
3. **Denominator check (V1b):** ledger Σ`attempts` for `Investigation` vs the engine's own verified
   `start` records for `Investigation` in the window — **equal within the two boundary intervals**.
   The subtraction's two terms are now each independently validated, so `starts − successes` — the
   failure count itself — is validated even though no instrument can see a failure directly.
4. **Pairing invariant (V1b):** settled non-estimated records satisfy `successDelta === 0 ⇒
   rankDelta === 0` and `successDelta >= 1 ⇒ rankDelta > 0` on **≥95%** of records (blocker 11: zero
   negative deltas ever observed; only X runs during X's interval).

⚠️ **One deviation, flagged rather than folded in:** `flushLogs` writes the ledger pretty-printed
every 10 s; this phase roughly doubles the record rate, halving the ring's time depth (~5 → ~2.5
days). Responses: (a) cap stays 5,000, indentation dropped (`JSON.stringify(entries)`) — ~40%
write-size saving, no information loss; (b) the depth loss is made irrelevant by S8's persisted
aggregates.

### S2 — The governor

#### S2.1 — The counter model: `recentWindow` holds settled intervals, and survives game-driven level changes *(blocker 2; entry shape re-pinned in Rev 3)*

Revision 2's per-level counter was structurally unreachable (autolevel resets it on every success —
effective engage threshold 0.05, not 0.60). The trailing-window resolution stands; **Revision 3
re-pins what an entry is**, since per-completion samples no longer exist:

| | |
|---|---|
| **`recentWindow`** | A trailing ring of the last `LEVEL_RECENT_WINDOW = 30` **settled interval entries** for that action, each `{level, attempts, successes, rankDelta, estimated, atMs}` (S1.2's shapes). The decision's `attempts` / `successes` are the **sums** over the ring. **Reset ONLY when the governor itself changes the level** (or takes/loses ownership); a *game-driven* level change does **not** reset it — that survival is what makes a slide detectable while it is still a slide |
| **`byLevel`** | Per-level `{attempts, successes, rankSum}`, pruned to the 12 most-recently-touched levels. Recorded data only — **NOT a controller input**; it exists so Q40-6's realised-yield hill-climb is a pure re-analysis later |

**Cost of the entry-shape change if wrong:** in the normal alternating regime one entry ≈ one
completion, so the window's information content and fill time are unchanged (~30 entries/action/hour
⇒ full in **~60–70 min**, same as Revision 2 assumed). In a multi-rep or estimated regime an entry
can carry several attempts, so the window can represent *more* than 30 attempts — the decision sums
attempts rather than counting entries, so `minSamples` still measures evidence, not entries. The
residual risk is S1.2's disposition-1 bias (multi-rep failures invisible), already bounded there.

`actionOutcome` carries `levelSpan: {min, max}` (the level range present in the window) so every
decision is logged with its provenance and the mixed-level case is directly testable.

#### S2.2 — `planLevelAdjustment`: the decision *(pure; UNCHANGED from Revision 2)*

The signature and the eleven-row behaviour table are unchanged by Revision 3 — only the pipeline
*feeding* `attempts` / `successes` changed. Restated compactly; each row is still a unit test:

```js
export function planLevelAdjustment(actionOutcome, opts)
// actionOutcome: { name, type, level, governed, attempts, successes, rankSum,
//                  levelSpan, levelSetAtMs, ceilingLevel, ceilingSetAtMs,
//                  hardCeilingLevel, hardCeilingSetAtMs, regimeResetAppliedAtMs,
//                  drops, governorFailedUntilMs, raiseStreak }
// opts:          { nowMs, regimeEnteredAtMs?, cohortCollapsed?, minSamples?, lowerBand?,
//                  raiseBand?, cooldownMs?, minLevel?, ceilingHoldMs?, hardCeilingRetryMs?,
//                  maxRaiseStep?, maxTotalDrop?, dropBudgetMs? }
// returns:       { decision: "hold"|"lower"|"raise"|"insufficient-data",
//                  toLevel, successRate, samples, levelSpan, reason }
```

| # | Condition | Result |
|---|---|---|
| 1 | malformed inputs (`successes > attempts`, non-finite, negative) | `insufficient-data` / `"bad-input"` |
| 1b | `governorFailedUntilMs` unexpired | `hold` / `"governor-failed"` |
| 2 | regime entered, governed, reset not yet applied this regime (`regimeResetAppliedAtMs < regimeEnteredAtMs`) | `lower` to `max(minLevel, floor(level/2))` / `"post-install-reset"` — bypasses samples+cooldown, clears `ceilingLevel` only, charges no drop, fires **once per regime entry** (latched in the inputs) |
| 3 | regime entered, ungoverned | `hold` / `"ungoverned-regime"` |
| 4 | `attempts < minSamples (20)` | `insufficient-data` / `"samples"` |
| 5 | governor-set level younger than `cooldownMs` | `hold` / `"cooldown"` |
| 5b | `cohortCollapsed` and the decision would be `lower` | `hold` / `"cohort-collapse"` |
| 6 | `successRate < lowerBand (0.60)` | `lower` — step 4 / 2 / 1 below 0.20 / 0.40 / band; `"below-band"`, or `"take-ownership"` if ungoverned; at `minLevel` degrades to `hold` / `"at-floor"` |
| 6c | drop budget (`LEVEL_MAX_TOTAL_DROP = 12` per rolling 24 h) exhausted | step clamped; at 0 ⇒ `hold` / `"drop-budget"` + one warn. Regime resets exempt |
| 7 | ungoverned, rule 6 did not fire | `hold` / `"autolevel-healthy"` — **D5's structural no-op** |
| 8 | `successRate >= raiseBand (0.95)`, governed, ceilings permit | `raise` — step `min(maxRaiseStep, 1 + raiseStreak)`, clamped by both ceilings (S2.4) |
| 9 | clamp yields `toLevel <= level` | `hold` / `"ceiling"` |
| 10 | otherwise | `hold` / `"in-band"` |

**Defaults (provisional; written into every log event):** `LEVEL_RECENT_WINDOW = 30` ·
`LEVEL_MIN_SAMPLES = 20` · `LEVEL_LOWER_BAND = 0.60` · `LEVEL_RAISE_BAND = 0.95` ·
`LEVEL_COOLDOWN_MS = 600_000` · `LEVEL_FLOOR = 1` · `LEVEL_CEILING_HOLD_MS = 21_600_000` ·
`LEVEL_HARD_CEILING_RETRY_MS = 14_400_000` · `LEVEL_MAX_RAISE_STEP = 4` · `LEVEL_MAX_TOTAL_DROP = 12`
· `LEVEL_DROP_BUDGET_MS = 86_400_000` · `LEVEL_SET_RETRY_MS = 1_800_000` · `SETTLE_MAX_MS = 300_000`
· `ESTIMATED_SAMPLE_WARN_FRACTION = 0.25` · `COHORT_MIN_ACTIONS = 2` ·
`LEVEL_OUTCOME_LEVELS_KEPT = 12`.

⚠️ The `[0.60, 0.95]` band is a proxy for the realised-yield peak (§12.2 puts it at a 63–87% success
rate); mis-placement costs ~4–8% of one action's yield ≈ ~1.5% of the aggregate. **Q40-6**;
`byLevel.rankSum` is recorded so the hill-climb is a pure re-analysis later.

#### S2.3 — `classifyCohort`: the action-independent-collapse guard *(blocker 4; unchanged)*

`classifyCohort(outcomes, opts)` → `{collapsed, sampled, belowBand, reason}`. `collapsed: true` iff
≥`COHORT_MIN_ACTIONS (2)` actions have ≥`minSamples` attempts **and all of them** read below the
band — chaos and population are city-scoped and hit every action equally (features §1.1), so a
cohort-wide collapse is not an autolevel problem and must not be answered by lowering levels.
**Kenneth's ruling stands: with a single sampled action the lower is ALLOWED**, reason
`"single-action-cohort"`, with one warn — the ambiguity is visible, not silent. 🔑 A
`cohort-collapse` event is features §3.1's action-independent-degradation signature, instrumented
for free.

#### S2.4 — Ceilings *(blocker 5; unchanged)*

`ceilingLevel` (set by a `lower`, held `LEVEL_CEILING_HOLD_MS` = 6 h, cleared by rule 2) and
`hardCeilingLevel` (set by the game refusing a raise via read-back, aged out every
`LEVEL_HARD_CEILING_RETRY_MS` = 4 h for exactly one re-probe to `hardCeilingLevel + 1`, **not**
cleared by rule 2). Both aged inside `planLevelAdjustment`. The 4 h re-probe is mandatory, not tidy:
no regime reset is scheduled (`ratchet-mode.txt` = `observe`) while the level is measured still
climbing ~1 level / 3.5 h — a permanent cap forfeits exactly the payout gradient D2 protects.
⚠️ Bounded oscillation across the ceiling-hold window (~12% of one action's completions in
mildly-degraded operation) is acknowledged and accepted; visible in the log as a raise/lower
alternation.

#### S2.5 — `applyLevelDecision`: the state transitions, as a pure reducer *(blocker 10; unchanged)*

`applyLevelDecision(prior, decision, readBack, nowMs)` → `actionState`. The full transition table of
Revision 2 stands verbatim: `hold`/`insufficient-data` is the **identity**; a clean `lower` sets
`governed`, resets `recentWindow` and `raiseStreak`, charges `drops`, and updates `ceilingLevel` only
when firing from below the recorded ceiling; a mismatched `lower` adopts the game's level, sets
`governorFailedUntilMs`, charges nothing; a clean `raise` increments `raiseStreak`; a clamped raise
sets `hardCeilingLevel` and zeroes the streak; `post-install-reset` additionally stamps
`regimeResetAppliedAtMs`, clears only `ceilingLevel`, charges no drop; a failed autolevel read-back
leaves `governed === false`; release (S5) clears everything. **`raiseStreak` resets on any lower, any
clamp, any read-back failure, and release; increments only on a clean raise — the complete list, and
a test.** `levelDropsInWindow(drops, nowMs, windowMs)` stays a separate one-line pure function.

### S3 — The actuator *(unchanged, except step 6's log fields)*

Non-pure, in the loop, the **only** `setActionLevel` call path. Preconditions: `mode === "active"`;
no active yield grant (a forced restart during a grant would break Phase 39 S2.1's ordering);
action not quarantined / not `governorFailed`; at a settlement point for that action or the action
not currently running. ⚠️ Precondition 4 does not by itself dodge Q40-7 — step 5's forced restart is
what makes the change take effect; the precondition only makes the discarded progress ~0.

Steps: (1) if ungoverned, `setActionAutolevel(false)` + read-back, abort on mismatch
(`governorFailed`, 30 min); (2) `setActionLevel` + read-back; (3) disagreement handled by direction —
raise-read-low is a max-clamp (`hardCeilingLevel`), lower-read-wrong is an anomaly
(`warn` + `governorFailed`); (4) `applyLevelDecision`; (5) if the action is running, one forced
restart via `shouldStartAction`'s new `forceRestartReason` parameter (default `null`, overrides only
`"running-desired"`; every existing test passes unchanged), verified by S6; (6) exactly one
`level-govern` event carrying the decision, both read-backs, the constants, `successRate` /
`samples` / `levelSpan` / **`estimatedFraction`** (Rev 3), and the cohort report.

**The player-action slot is not needed** — reference §6 documents both setters as plain setters with
no lifecycle semantics; the only slot-touching call is step 5's restart, on a slot the engine already
holds, suppressed by precondition 2 otherwise.

### S4 — Ownership *(unchanged; Kenneth's Q40-12 ruling stands)*

Sticky; reconciled from the game on startup (`getActionAutolevel === false` ⇒ governed — only this
engine and `bladeburneractionprobe.js` write that flag, and the probe restores in a `finally`);
released only via S5's manual mode flip, **never automatically**. ⚠️ Gotcha-5 inheritance stands: a
*killed* probe leaves `autolevel` false at a probe-set level, which this engine adopts — mitigated by
`adopted: true` logging and an empty starting `recentWindow`, so the first decision comes ~1 h later
from data this engine collected itself.

### S5 — Baseline, tripwire, and revert *(REWRITTEN in Rev 3 — the aggregate PASS bar was unattributable)*

**The revert path (unchanged):** `LEVEL_GOVERNOR_MODE = "off"`, then
`cli.mjs restart bladeburnermanager.js`. First tick in `"off"` restores `autolevel = true` per
governed action, read-back verified, one `level-govern-revert` each, ownership dropped via S2.5's
release. Revert restores the *policy*, not the prior level — the pre-Phase-40 behaviour is the climb,
and the climb resumes.

🔴 **Revision 2's V6 (aggregate ≥ 1.10× baseline = PASS) is retired as UNATTRIBUTABLE, and the
reason is measured:** `Tracking`'s rate is compounding on its own — 6 h buckets over the last 48 h
run **718 → 760 → 801 → 864 → 911 → 981 → 1,029 → 1,090 rank/h**, ≈ +7–8% per 6 h, with **no
governor at all**. A +10%/24 h aggregate bar would be cleared by drift alone, and per the method rule
*a trend read across a known disturbance is not a trend* — here the disturbance is a **known
background trend**, and grading the governor on a number the background produces by itself would be
marking our own homework. The deliverable is therefore graded at the **mechanism level**, where
attribution is exact, and the aggregate survives only as the safety tripwire:

- **L4 records `baselineRankPerWallSec` = `rates["24h"].rankPerWallSec`** from
  `bladeburner-state.json` at the activation flip, stamped — same field, same instrument on both
  sides of every later comparison.
- **PASS (V6) — mechanism-level, attributable:** over the clean 24 h window, from settled
  non-estimated `complete` records: `Investigation` mean **≥ 4.0 rank/action** (0.00 today) **and**
  its summed contribution **≥ 100 rank/h** (≈0 today; ~26 settlements/h × ≥4.0 gives headroom).
  Both numbers come from the repaired ledger — building the instrument that makes this attribution
  possible is precisely WI1.
- **REVERT (tripwire):** `rates["24h"].rankPerWallSec < 0.90 × baseline` at any point past +24 h.
  Given the measured upward drift, an engine merely *holding* baseline would already be suspect; one
  10% below it while the ungoverned trend is +30%/24 h is unambiguous harm.
- **Neither PASS nor REVERT:** governor stays enabled (it is not harming), close-out records
  "mechanism below bar, aggregate unharmed" with the ledger attached. An honest outcome, recorded as
  one.
- ⚠️ 703, 630, and Revision 2's 1.10× are all retired as bars. Per "stamp or omit volatile numbers",
  the only absolute numbers in the criteria are per-action ones the governor directly controls.

🔴 **"Clean window" is load-bearing:** no install in the window (`logs/ratchet-log.json`) and
`totals.postInstallSec === 0`, else the verdict is advisory and the window is re-taken. The 24 h
clock starts at the **first applied level change**.

### S6 — Scope *(unchanged)*

Actions in `applyStageGate(buildCandidates(ns), STAGE_B_ENABLED)`. General actions excluded
(`getActionSuccesses` throws for them — confirmed live 2026-08-03; and they have no level). The five
Stage-B operations are never governed because they are never run; the governor changes levels, not
selection, and cannot become a back door into Stage B. Today: `Tracking` (ungoverned, healthy),
`Investigation` (the target); `Bounty Hunter` / `Retirement` auto-governed if they ever enter the
pool.

### S7 — Shipping staged: `shadow` before `active` *(unchanged, and now proven)*

`LEVEL_GOVERNOR_MODE = "off" | "shadow" | "active"`, default `"shadow"` at WI2's merge. In shadow the
governor logs decisions and calls no setter. **Revision 3 is this stage's proof of value:** the
Rev 2 mechanism died in exactly this stage — L2's settled-record bar read 0, the governor logged
1,998 `insufficient-data` decisions, and nothing in the game was ever mis-set. Shadow costs ~1 sample
window (~1 h); the check is that the repaired ledger reports `Investigation` ≈ 0% and `Tracking`
≈ 100% — numbers known independently from §12.1's reconstruction and now from the console.

### S8 — Where the data lives *(one field renamed)*

Unchanged from Revision 2 except: `uncertainCompletions` is **replaced** by `estimatedSettlements`
(count of `estimated: true` records folded) and `completions` by `settlements`. The `levelGovernor`
block, its `constants` snapshot (now including `settleMaxMs` / `estimatedWarnFraction`), the
per-action state, `byLevel`, and the `seedLevelGovernor` schema guard (adoption gated on the
`constants` key, whole-blob rejection — the Phase 39 `seedTotals` regression) all stand, with the
restart round-trip unit test. Log kinds unchanged (`level-govern`, `level-govern-revert`; `warn`
reasons gain `success-counter-reset` and `estimated-fraction-high`, lose the boundary ones);
edge-triggered plus 30-minute heartbeat, `hold` never logged except on heartbeat or reason change.

### S9 — Identifier hygiene pre-screen *(delta from Rev 2)*

**Removed** (deleted with the boundary mechanism): `detectActionBoundary`, `boundaryState`,
`elapsedMs`, `previousElapsedMs`, `uncertainCompletions`.
**Added**, screened against all `ns.*` namespaces and DOM/Node globals: `settleActionRun`,
`foldSettlement`, `openRunState`, `settlements`, `estimatedSettlements`, `estimatedFraction`,
`viaTimeout`, `SETTLE_MAX_MS`, `ESTIMATED_SAMPLE_WARN_FRACTION`.
⚠️ `openRunState` deliberately does not shorten to `run` (a billed name — `ns.run`); the buffer stays
`recentWindow`, never `window` (+25 GB, Phase 38); `ceilingLevel` never `probeCeiling` (`probe` is
billed, `ns.dnet.probe`); `skillLevelsFingerprint` is the function, `skillLevelsHash` the JSON field.
The full Rev 2 avoid-list stands. **Any surprising `ramcheck.js` reading is checked against this
class first.**

### S10 — RAM: measured baseline, per-work-item gates *(re-derived in Rev 3)*

**R0 measured: 90.00 GB on current `master`** (`mem bladeburnermanager.js`). Rev 3's mechanism
**deletes** the only new read Rev 2 added (`getActionCurrentTime`, 4 GB) — `getActionSuccesses` and
`getActionTime` are already charged, so WI1 now adds **zero** new `ns` surface:

| gate | after | expected | delta |
|---|---|---|---|
| **R1a** | WI1 | **90.00 GB** | **+0.00** — subtraction settlement uses only already-charged calls |
| **R1b** | WI2 | **98.00 GB** | +8.00 — `setActionLevel` + `setActionAutolevel` |

`daemon.js` / `augfarmer.js` **flat** at both. **Any other reading stops the phase**, checked against
S9's identifier class *first*: any movement at R1a means an accidental new name or call (there should
be none); `+12` at R1b means a third call crept in (most likely `getActionMaxLevel`, deliberately
unused); fractional deltas are identifier collisions. Readings are trustworthy only when
`ramcheck.js`'s `bytes[name]` matches `dist/src/bladeburnermanager.js`'s length. 🔑 R1a's **flat**
expectation is itself a useful property: WI1 becomes a pure-logic change with no RAM risk at all.

---

## Design — work items

Three items, unchanged in structure from Revision 2 (ledger repair → governor inert → activation),
re-derived in content.

### WI1 — Ledger repair by subtraction settlement [code] *(S1, D4; REWRITTEN)*

**Merges first; WI2/WI3 are not trusted before it.** Unblocks the open `BACKLOG` `startAction`-no-op
bug as a side effect (its next action needs the now-populated correlates).

| Function | Responsibility |
|---|---|
| `settleActionRun(openRun, { successesNow, rankNow, nowMs, actionTimeMs, viaTimeout })` | **Pure, new.** Builds one settled outcome from an open run and current reads: `successDelta` / `rankDelta` by subtraction, `attempts` per S1.2 (`max(1, successDelta)`, or the `viaTimeout` estimate), the `estimated` flag, and the counter-reset disposition (`successDelta < 0` ⇒ `{discard: true, reason: "success-counter-reset"}`) |
| `skillLevelsFingerprint(skillLevels, order)` | **Pure, new.** `order.map(s => skillLevels[s] ?? 0).join("/")` |
| `buildCandidates(ns)` | carries `countRemaining` and `pMax` (both already fetched, currently discarded) |
| `recordAttempt(...)` | unchanged shape; now also serves `kind: "complete"` |

**`detectActionBoundary` is not built.** *(Rev 2 defined it; Rev 3 deletes it before it reaches
`master` — the branch carrying it is superseded, not merged.)*

Loop changes: maintain `openRunState` (opened at each verified start from values **already read** —
`successesBefore`, `context.rank`, the timestamp); settle it at the next verified start, at
verification failure (discard), or at `SETTLE_MAX_MS` (estimated fallback); emit one `complete`
record per settlement; discard the first post-restart interval. **The hoist** (S1.3's correlates) is
unchanged from Revision 2 and remains specified as exact reads, not line ranges: move the city-stock
block (`cityName` … `opCount`, `updateCityStock`, `chaosByCity`, breach logging — none of it reads
`chosenAction`; the Stage-B team assignment does and stays) above candidate selection; delete only
the three duplicate `else`-branch declarations (`:1596–1598`); compute the per-action inventory array
once (9 calls, not 18) feeding both `isInventoryLow` and `updateCityStock`; hoist the skill-level
block; populate the four correlates at `:1653`. Drop the ledger's pretty-print indentation.

### WI2 — The governor, shipped inert [code] *(S2–S4, S7–S9)*

| Function | Status in Rev 3 |
|---|---|
| `planLevelAdjustment` | **unchanged** (S2.2) |
| `applyLevelDecision` | **unchanged** (S2.5) |
| `classifyCohort` | **unchanged** (S2.3) |
| `levelDropsInWindow` | **unchanged** |
| `foldSettlement(governorState, settledOutcome)` | **renamed + reshaped** from `foldCompletion`: folds one settled interval entry (`{level, attempts, successes, rankDelta, estimated, atMs}`) into `recentWindow` + `byLevel`; discarded outcomes are never passed in |
| `pruneLevelOutcomes`, `seedLevelGovernor` | **unchanged** (schema guard included) |
| `shouldStartAction({..., forceRestartReason})` | **unchanged** — optional param, default `null` |
| actuator (loop-inline) | **unchanged** save step 6's `estimatedFraction` field |

RAM lands here (+8.00 GB to 98.00): the analyzer bills the setter names regardless of the mode
constant. R1b is measured at WI2, not WI3.

### WI3 — Activation, live validation, tripwire [live] *(S5, S7)*

The mode flip, gated on V4, then the L-series. Doc reconciliations in the same commit:
`docs/bladeburner-reference.md` §6 (setters lower without clamp; read-back is the only success
signal; `rankLoss` documented-but-never-observed — 4,486 intervals, zero negative; **and the §5
console section gains the "successes only — validates numerators, cannot see failures" caveat**);
`docs/bn6-go-no-go.md` §13 (ledger repair, the Rev 2 mechanism failure and its method rule, the
side-by-side differencing-vs-`observed.rankDelta` window that is V1); `docs/bn6-playbook.md` §1;
`BACKLOG.md`; `docs/phases/CHANGELOG.md`; `CLAUDE.md`'s stamped standing bullet.

---

## Tests [code]

`test/bladeburnermanager.test.js`, extending the existing file. Rev 2's test list stands for the
unchanged functions (`planLevelAdjustment` — all rows including the D5 no-op, mid-slide engagement,
cohort guard, drop budget, ceilings, regime latch, bad input; `applyLevelDecision` — all transitions;
`classifyCohort`; `levelDropsInWindow`; `seedLevelGovernor` round-trip + schema guard;
`skillLevelsFingerprint`; `shouldStartAction` back-compat; `buildCandidates` `countRemaining`/`pMax`).
**Replaced / new:**

- **`settleActionRun`** *(replaces every `detectActionBoundary` test)* — subtraction correct on a
  normal 1-success and a 0-success interval; `attempts = max(1, successDelta)` (a 3-success
  bonus-time interval reads 3/3); **`successDelta < 0` returns `{discard: true, reason:
  "success-counter-reset"}` and never a negative record** (blocker 11 + the counter method rule);
  `viaTimeout` produces `estimated: true` with `attempts = max(successDelta,
  round(actionSec/actionTimeSec))`; a zero/negative `actionTimeMs` in the timeout path degrades to
  `attempts = max(1, successDelta)` rather than dividing by it.
- **`foldSettlement`** — folds attempts/successes/rankDelta into `recentWindow` sums and `byLevel`
  keyed by the entry's level; `estimated` entries fold **and** increment `estimatedSettlements`;
  ring caps at `LEVEL_RECENT_WINDOW` entries, evicts oldest-first; **a game-driven level change does
  not clear `recentWindow`** (blocker 2's invariant, asserted directly); discarded outcomes are not
  representable as inputs (the fold takes a settled outcome; `settleActionRun`'s discard shape is not
  one).
- **The mechanism-feed test (the fifth method rule, in code):** a scripted sequence of verified
  starts alternating between two actions — the *measured live pattern* — must yield one settled
  record per switch and a filling `recentWindow`. This is the fixture Rev 2's suite lacked: it
  encodes the engine's actual behaviour, not the mechanism's happy path.

`test/verify-bladeburner.test.js` (`npm run verify:log`): `knownKinds` +2; `levelGovernor` block
sanity (`successes <= attempts` per action, `mode` valid); ledger assertions qualified on count —
(a) ≥50 `Tracking` `complete` records ⇒ Σ`successDelta` not identically zero; (b) ≥50
`Investigation` records ⇒ ≥90% read `successDelta === 0`; (c) no record with `rankDelta < 0` or
`successDelta < 0`; (d) pairing invariant on ≥95% of non-estimated records; (e) **estimated fraction
< 0.25** across the file.

---

## Live procedure [live]

- **L1 — RAM.** R1a **flat at 90.00** after WI1; R1b **98.00** after WI2; `daemon.js` /
  `augfarmer.js` flat; `bytes` fresh against `dist/`.
- **L2 — The pipeline flows** (after WI1; **this is the check Revision 2 failed, and it gates
  everything**). From `logs/bladeburner-attempts.json`:
  - **≥25 `complete` records within 60 minutes** of the restart (settlements arrive with every
    switch, ~59/h measured — ~2× margin);
  - **`Tracking` numerator vs the console (V1):** over a ≥2 h window, ledger Σ`successDelta` and
    mean `rankDelta`/success vs the console's completion-line count and mean rank/completion,
    **±10%** (the 2026-08-10 three-instrument agreement was 1–6%: 82 lines · 29.79 vs 28.21 vs
    902/909 rank/h);
  - **failure path (V1b):** `Investigation` console-line count vs ledger Σ`successDelta` (±1 line or
    ±10%, whichever is looser); ledger Σ`attempts` vs its verified `start` count (equal within the
    two boundary intervals); pairing invariant ≥95%; zero negative deltas;
  - correlates non-`null` on ≥99% of post-restart records; estimated fraction < 0.05 in this
    (normal, alternating) regime.
- **L3 — Shadow agrees with what we already know** (after WI2; read no earlier than +90 min —
  `recentWindow` needs ~60–70 min). `Investigation`: `decision: "lower"`, `successRate ≤ 0.10`.
  `Tracking`: `decision: "hold"` / `"autolevel-healthy"` with **`samples >= 20`** — the term proving
  rule 7 was evaluated, not short-circuited. 🔴 A shadow `lower` on `Tracking` stops the phase.
- **L4 — Activate.** Flip the mode in the repo, verify the push, `cli.mjs restart
  bladeburnermanager.js`; **record `baselineRankPerWallSec` stamped** (S5). Confirm the engine is
  alive from a fresh `bladeburner-state.json` write, not `read-terminal` (RUNTIME ERROR modals are
  invisible to the terminal).
- **L5 — The change applied, against the game** (≤30 min after L4). One `level-govern` with
  `applied: true` for `Investigation` **and** the in-game panel showing the new level
  (`cli.mjs goto Bladeburner` + `body`). Log-only confirmation is not sufficient.
- **L6 — Mechanism, +4 h.** `Investigation` mean rank/action over settled non-estimated records in
  the trailing 2 h **≥ 4.0** (0.00 today). Miss ⇒ diagnose before 24 h.
- **L7 — `Tracking` unharmed, +4 h.** Level not lowered and `governed === false` (or a
  cohort/single-action event explains why); mean rank/action **not more than 10% below**
  pre-activation (one-sided — its own drift is strongly upward); completions/h **≥ 25** (the
  selection-perturbation detector, Q40-10).
- **L8 — Verdict, +24 h clean** (S5): PASS on the mechanism bars (`Investigation` ≥ 4.0 rank/action
  **and** ≥ 100 rank/h contribution); REVERT if `rates["24h"].rankPerWallSec < 0.90 ×
  baselineRankPerWallSec`; otherwise governor stays enabled and the close-out records the honest
  middle.

---

## Acceptance criteria

- **T1 — `npm test` green** (1246 existing + new), exactly two additive exceptions: `knownKinds`
  +2, and `shouldStartAction` gains cases while every existing case passes byte-identically.
  [code — Claude clears]
- **T2 — `npm run verify:log` green**, including the five qualified ledger assertions. [code]
- **R1a — 90.00 GB (flat) after WI1; R1b — 98.00 GB after WI2**; companions flat; `bytes` fresh.
  Any other reading stops the phase (S10). [live]
- **V1 — L2's `Tracking` numerator cross-check vs the console passes (±10%).** 🔴 No governor
  decision may be acted on until V1 passes. [live]
- **V1b — L2's failure-path triangle passes** (console numerator match on `Investigation` +
  starts-vs-attempts denominator match + pairing invariant + zero negatives). The subtraction's two
  terms are each independently validated, so the failure count is validated even though no
  instrument can see a failure directly (blocker 11). [live]
- **V2 — estimator unreachable from the controller**: `getActionEstimatedSuccessChance` appears
  exactly once (`buildCandidates`); none of the controller functions or the actuator references it.
  [code]
- **V3 — setter call sites exactly as authorised**: `setActionLevel` one (actuator step 2);
  `setActionAutolevel` two (actuator step 1, S5 revert); each read-back verified. [code]
- **V4 — L3 passes before the flip.** [live]
- **V5 — L6 + L7 at +4 h.** [live]
- **V6 — L8's mechanism-level verdict at +24 h clean** (S5). This is the phase's deliverable, and it
  is graded on numbers the governor directly controls — the aggregate is deliberately only the
  revert tripwire, because `Tracking`'s measured background compounding makes an aggregate PASS
  unattributable. [live]

**Ship gate:** T1/T2/V2/V3 self-cleared. **WI1 merges on R1a + V1 + V1b.** WI2 merges on T1/T2 +
R1b + V4. WI3's flip only after V4; V5/V6 are close-out deliverables, not merge blockers (precedent:
Phase 35's V3, Phase 39's C1/C2).

---

## Files touched

**New:** none.

**Edited:** `src/bladeburnermanager.js`, `test/bladeburnermanager.test.js`,
`test/verify-bladeburner.test.js`, `docs/bladeburner-reference.md`, `docs/bn6-go-no-go.md`,
`docs/bn6-playbook.md`, `BACKLOG.md`, `docs/phases/CHANGELOG.md`, `CLAUDE.md` (stamped standing
bullet only).

**Deliberately untouched:** `vite.config.ts`, `src/dashboard.js`, `src/augfarmer.js`,
`src/backdoorfactions.js`, `src/backdoorwd.js`, `src/installer.js`, `src/daemon.js`,
`src/bladeburneractionprobe.js` (its `finally` restore keeps S4's ownership marker mostly
unambiguous), the batcher core. **The Revision-2 WI1 branch is superseded, not merged** — its
boundary-detector code does not reach `master`.

---

## Non-goals *(unchanged from Rev 2)*

Diplomacy pre-emption (premise falsified; wake condition now instrumented via `cohort-collapse`) ·
the `objectiveMode` flip (sequenced after this phase's ledger) · dropping `Investigation` (filler on
capacity `Tracking` cannot supply) · city rotation, Stage B / `Raid`, Simulacrum, Bladeburner augs,
sleeves, any change to action *selection* · claiming +34%/~5 days (extrapolation, not result — and
Rev 3 adds: claiming any aggregate-rate improvement as the governor's, given the measured background
compounding) · claiming chaos is harmless (only: chaos cannot explain an action-specific collapse —
re-confirmed at chaos 170.5 with `Tracking` at 0%).

---

## Open questions carried forward

| # | Question | Default while unanswered | Trigger / date |
|---|---|---|---|
| **Q40-6** | ~~Is `[0.60, 0.95]` the right proxy for the realised-yield peak, or hill-climb on `byLevel.rankSum/attempts`?~~ | ✅ **ANSWERED 2026-08-11 — KEEP THE BAND.** Trigger met on `Tracking` (725 attempts / 7 levels, L121–127). Realised yield is **monotone rising** 37.53 → 47.56 rank/action at **100% success throughout**, so band and hill-climb give the *same* instruction (climb) — the ~1.5% cost-if-wrong never materialised. ⚠️ Answered only over a **monotone** span; the band vs hill-climb question genuinely separates only near a peak, and no peak has been observed on `Tracking` through L127 | ~~2026-08-18~~ closed |
| **Q40-7** | ~~Does `setActionLevel` on a running rep reset/corrupt its progress?~~ | ✅ **ANSWERED 2026-08-11 — no measurable cost; default holds.** **3 forced restarts** actually occurred (the three `Investigation` drops, 2026-08-10). Measured after them: **24 h `dutyCycle` 0.99999997, 1 h 1.0**. The restart cost is below the instrument's resolution at n=3 | ~~2026-08-24~~ closed |
| **Q40-8** | ~~Does the ~+4%/level payout slope (Contract-measured) hold for Operations?~~ | ⛔ **VOID 2026-08-11 — unanswerable, and *that* is the finding.** The precondition is met in level *count* (`Investigation` sampled at L21/25/29/33) but **void in payout: three of the four levels have `rankSum` exactly 0**. There is no Operations slope to measure because there is no Operations payout. Default stays safe for the reason it gave — the controller reads success rate, never payout. 🔑 Re-confirmed on the Contract side: `Tracking` L121→127 measures **+4.03%/level**, matching the original ~+4% | ~~2026-08-18~~ void — see Q40-17 |
| **Q40-9** | The post-install branch is unit-tested only (install cadence stopped) | **Leave enabled** — strictly safer than a stranded high level | First install after cadence resumes. **Event-triggered** |
| **Q40-10** | Does the governor perturb *selection* (a lowered `Investigation` scores higher on the hot estimator)? | **Do not change selection**; L7's ≥25 completions/h on `Tracking` is the detector | L7. If it fires: the `objectiveMode` phase, not a governor tweak |
| **Q40-12** | ~~Automatic ownership release?~~ | ✅ **CLOSED by Kenneth — never auto-released.** Not reopenable here | — |
| **Q40-13** | Is `LEVEL_MAX_TOTAL_DROP = 12`/24 h right? | 🔴 **TRIGGER HAS FIRED 2026-08-11 — by the spec's own criterion, the constant is wrong.** `Investigation.lastDecision` reads `reason: "drop-budget"` with `cohort.collapsed: false` (`single-action-cohort`) — exactly the stated condition. It exhausted the budget in **3 drops of 4** (L33→29→25→21) and is now pinned at L21 for 24 h. ⚠️ **But raising the constant does not help** — `Investigation` fails at *every* level sampled, so more drops buy nothing (Q40-17). Do **not** retune 12 until Q40-17 is settled; the budget is not the binding problem, it only looks like it | **FIRED** — held pending Q40-17 |
| **Q40-14** | ~~Phantom failures in the denominator~~ | ✅ **ANSWERED 2026-08-11 — accepted, and tighter than predicted.** `Tracking` (true ~100% success) settled at **723/725 = 99.72%** across 7 levels; recent window 30/30. The trigger ("materially below 1.0") did not fire. Contamination is **≤0.28%**, better than the forecast ≲1–2% bound | ~~2026-08-18~~ closed |
| **Q40-15** | 🆕 **The estimated-attempts fallback** (`SETTLE_MAX_MS` path) divides by `getActionTime` — the one estimate in the pipeline | **Keep, fenced**: flagged per record, folded (the single-action regime must not blind the governor), warned above 25% of a window | If an `estimated-fraction-high` warn fires outside a deliberate single-action regime. **Event-triggered** |
| **Q40-16** | 🆕 Does `getActionSuccesses` survive an augmentation install, or reset? (Rank survives; action *successes* are undocumented) | **Assume nothing** — S1.2's counter-reset guard makes either answer safe (a reset settles as one discarded interval + a warn, then re-baselines) | First install; the guard's warn is itself the measurement. **Event-triggered** |
| **Q40-17** | 🆕🔴 **THE PHASE'S PREMISE IS FALSIFIED: `Investigation` is not rescuable by levelling.** The dose-response curve that justified this phase put a peak at **L26–29 ≈ 9–10 rank/action**. Live, governed, at the levels that curve named: **L29 → 0/20 successes, L25 → 0/20, L33 → 0/258, L21 → 2/270 (0.061 rank/action)**. The predicted peak is *absent* where it was predicted to be | **Undecided — Kenneth's call.** This is logged dropped-objection #1 landing ("the phase rests on a dose-response curve reconstructed from a broken instrument"). ⚠️ Do **not** read the aggregate rate as vindication: it doubled (0.1952 → 0.3986 rank/s) but that is **`Tracking`'s ungoverned autolevel climb** (L110→127, 19.77→47.56 rank/action), which is precisely the attribution the Rev 3 anti-claim list forbids crediting to the governor. The governor's own measured effect is `Investigation` 0.00 → 0.061 rank/action — real, and immaterial. ⚠️ Also do **not** conclude "drop `Investigation`": it runs as **filler on capacity `Tracking` cannot supply** (`Tracking` still supply-capped at **30.3 starts/h** of ~60/h total), so removing it frees nothing unless something replaces it | **2026-08-18** (inherits Q40-8's date) |

*(Q40-11 — `getActionCurrentTime`'s undefined idle behaviour — is deleted, not carried: the call no
longer exists in the design.)*

---

## Logged dropped objections

1. **The phase rests on a dose-response curve reconstructed from a broken instrument** — unchanged,
   and now with a second layer: Revision 2's replacement instrument *also* failed, live. The
   mitigation is unchanged in shape and stronger in substance: V1/V1b now validate against an
   instrument **outside the engine entirely** (the game's own console), which is Phase 38's durable
   lesson applied for the third time.
2. **A closed-loop controller on an engine whose selection runs on a number measured 16× hot** —
   unchanged; if L7 fires, the answer is the `objectiveMode` phase.
3. **Even a perfect outcome saves ~2.4 days now (12.3 → 9.9), not 5** — this argument keeps
   shrinking because `Tracking` keeps compounding without help. Still worth doing: cheap, reversible,
   and it builds the realised-outcome ledger the `objectiveMode` phase needs regardless.
4. **Six of the governor's constants are invented defaults** — all written into every `level-govern`
   event for offline re-derivation.
5. **The cohort guard trades a real failure mode for a rarer one** (can block a correct lower when
   both actions are down for unrelated reasons) — accepted; the blocked case costs one window of a
   degraded `Investigation`, the unblocked case costs ~20 h of a degraded `Tracking`.
6. **NEW — the failure count is never directly observed by any instrument.** The console shows only
   successes; the ledger derives failures by subtraction. V1b's triangle validates both terms of the
   subtraction independently, which is as close as this game's surface allows. If a future mechanism
   ever *does* expose failures directly, re-validate against it.
