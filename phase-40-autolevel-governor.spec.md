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
them and does not re-argue them; §5.1's two answered questions are the design's load-bearing inputs),
`docs/bn6-go-no-go.md` §11–§12 (the measurements), `docs/bladeburner-reference.md` §6 "Action levels"
+ §7 gotchas 5/6/13/14 (the API this spec drives).

**What ships:** a repaired attempt ledger in `src/bladeburnermanager.js` (realised per-completion
outcomes + the four dead `context` correlates), a per-action autolevel governor built as one pure
decision function plus a verified actuator, vitest coverage for every new pure function, a
shadow→active staging gate, and the doc reconciliations. **No new log file. No new script. No live
probe.** No source code is written by this document.

---

## Context — the four things this spec exists to get right

1. **The instrument is broken, and every number in the brainstorm is a workaround.** `observed.rankDelta`
   and `observed.successDelta` are `0` on all 4,487 records and four `context` fields are hardcoded
   `null` (`bladeburnermanager.js:1653`). §12's entire dose-response curve had to be rebuilt by
   *differencing `context.rank` between consecutive records* — a method that silently drops the last
   record and any record straddling an install. **A controller cannot be driven off a field that is
   zero.** WI1 is therefore a prerequisite, not a polish pass, exactly as WI1 was in Phase 39.
   🔑 The root cause is not a missing assignment: the record is settled **one tick (~1 s) after the
   start**, while the action pays out ~50 s later at its *completion*. `rankDelta` and `successDelta`
   are being measured over the wrong interval. Wiring the fields without moving the settlement point
   would produce zeros that *look* deliberate.
2. **The controller's input must be realised outcomes, and only realised outcomes (D3).** The
   estimator's *lower* bound was measured biased **high** — `Investigation` predicted pMin 0.764
   against a realised ~7% (§11.5). A governor reading `getActionEstimatedSuccessChance` would have
   concluded nothing was wrong for the entire five days the action was collapsing. **No function
   introduced by this phase may call that method**, and V2 greps for it.
3. **The trade is wildly asymmetric, and that asymmetry — not a target level — is the design.**
   §5.1: payout scales ~**+4%/level** while success collapses ~**8% → 99% zero across 12 levels**.
   Overshooting *downward* is cheap; sitting above the cliff is catastrophic (and for `Investigation`
   actively rank-negative, `rankLoss` 0.774). So the governor **hunts the highest reliably-clearing
   level**, drops fast, and raises one cautious step at a time.
4. **`Tracking` is load-bearing and must not be touched.** It supplies ~30 actions/h at 19.77–24.52
   rank/action with a 0–1% failure rate; `Investigation` is filler on capacity `Tracking` cannot
   supply (§11.4). D5 requires the governor to be generic *and* a no-op on a converged action. This
   spec achieves that structurally rather than by tuning: **the governor only takes ownership of an
   action after that action's own realised success rate falls below the band** (S3). Until then
   `autolevel` is left exactly as the game has it, so `Tracking`'s measured-good free climb continues
   untouched.

---

## Ground rules

- **CLAUDE.md conventions apply in full.** In particular:
  - **Identifier hygiene.** The RAM analyzer bills on *names*: a local named `window` cost Phase 38
    **+25 GB**, `state.share` cost **+2.4 GB**, a local `ls` cost **+0.20 GB**. Every identifier this
    spec introduces is pre-screened in **S9**, including the one that nearly happened here: the
    governor's trailing sample buffer is `outcomeWindow`, **never `window`**.
  - **Import bleed.** `bladeburnermanager.js` keeps importing only from `common.js`. No new imports.
  - **No Singularity calls.** Unchanged.
  - **Observability is files, not popups** — and specifically **no new file**: Q40-5 is resolved in
    S8 in favour of extending the existing ledger + state snapshot, so **`vite.config.ts` is not
    edited** (both target files already have filter entries, lines 97–99). The `dashboard.js`
    `BLADEBURNER` panel is **not** touched either; no new dashboard space is requested.
- **Loop-inline logic is untestable.** Every behaviour an acceptance criterion depends on is an
  exported pure function with vitest coverage. Phase 39's 10.5-hour HRC park was loop-inline code;
  that is the precedent this rule exists on.
- **No behavioural supersession in existing tests.** The 1246-test suite stays green. Exactly **two**
  acknowledged edits are permitted, both additive, both named in **T1**. Any other changed expected
  value is stop-and-re-derive.
- **Every setter is verified by read-back.** `setActionLevel` and `setActionAutolevel` both return
  **`void`** (reference gotcha 6 — "no success signal at all. Read back to confirm"), and
  `getActionAutolevel` returns `false` for an invalid action too (gotcha 5). This is the same class as
  gotcha 14 (`startAction`'s lying boolean), and it gets the same treatment: **the read-back is the
  evidence, the call is not.**
- **RAM is re-measured, never assumed** — see **S10**, which specifies a *delta* gate rather than an
  absolute one, because the last recorded absolute figure is five commits stale.
- **`augfarmer.js`, `backdoorfactions.js`, `backdoorwd.js`, `daemon.js`, `dashboard.js`,
  `installer.js` get ZERO edits.** If implementation finds an edit to any of them unavoidable, that is
  a stop-and-return-to-spec.

---

## Spec-stage decisions

### S1 — The ledger is repaired by moving the settlement point, not by filling in fields *(D4, features §4)*

Two record kinds, not one. The existing `start` / `start-failure` record is **kept unchanged** — it is
S6's verification evidence and the `startAction`-no-op diagnostic — and a new **`complete`** record
carries the realised outcome. (Phase 39's S7 schema already named `kind: "complete"`; it was never
implemented.)

**Completion detection.** The engine currently has no way to see a completion at all: `startAction`
auto-repeats and `getCurrentAction()` stays non-`null` across reps (reference gotcha 13), so the only
documented detector is **`getActionCurrentTime()` wrapping** — elapsed ms dropping from near the
action's full time back to ~0. That is a genuinely new 4 GB call (grep-confirmed: it appears in
`bladeburnerdiag.js` and `bladeburnertrial.js`, **not** in `bladeburnermanager.js`). It is priced in
S10 and it is the only new *read* this phase adds.

⚠️ **Rejected alternative, and why:** inferring completions from `getActionSuccesses` alone (already
charged, 0 GB marginal) is cheaper and **wrong** — successes increment only on success, so every
*failure* is invisible, and the failure rate is precisely the governor's input. Inferring from a rank
increase fails for the same reason plus `Tracking`'s `rankLoss` of 0.

**Settlement.** A `boundaryState` accumulator holds `{type, name, level, rankAtBoundary,
successesAtBoundary, sinceMs}`. On a detected completion:

| field | source |
|---|---|
| `observed.successDelta` | `getActionSuccesses(type,name)` now − at last boundary (already-charged call) |
| `observed.rankDelta` | `getRank()` now − at last boundary (already read every tick) |
| `observed.actionSec` | wall seconds since the last boundary |
| `success` | `successDelta >= 1` |

The accumulator is **discarded, not settled**, whenever the running action changes or verification
fails between boundaries — a preempted rep pays nothing, so attributing an interval that spans two
actions would manufacture exactly the kind of contaminated sample `bladeburnermanager.js:1671-1674`
was written to catch for Diplomacy.

**The four null correlates cost 0 GB to fix**, and that is a checkable claim, not an estimate:

| field | source | new RAM |
|---|---|---|
| `context.cityChaos` | `getCityChaos` — already called twice per tick (`:1597` inside the `else`, `:1716` after the start block) | **0** |
| `context.teamSize` | `getTeamSize` — same, `:1598` / `:1719` | **0** |
| `context.countRemaining` | `getActionCountRemaining` — already called by `buildCandidates(:303)`, which **discards the value**; carry it onto the candidate object | **0** |
| `context.skillLevelsHash` | `getSkillLevel` — already called for all of `SKILL_BUY_ORDER` at `:1703`, after the start block | **0** |

The fix is a **hoist and de-duplicate**: move the city/team/inventory read block and the skill-level
read block **above** candidate selection, delete the duplicate block at `:1715–1719`, and pass the
values into both `pickOverheadAction` and the attempt context. Net call count falls; net RAM is
unchanged.

**One free correction folded in:** `predicted.pMax` is currently `undefined` because
`buildCandidates` destructures only `[pMin]` from a call that returns both. Take both. The
estimator's *width* is the uncertainty signal §11.5 and §12 keep having to reconstruct, and it costs
nothing.

**One deviation, flagged rather than folded in:** `flushLogs` writes the attempts ledger as
`JSON.stringify(attemptEntries, null, 2)` every 10 s. This phase roughly **doubles the record rate**,
which halves the ring's time depth (5,000 records ≈ 5 days → ≈ 2.5). Two responses, both deliberate:
(a) the cap stays at 5,000 and the pretty-print indentation is **dropped** (`JSON.stringify(entries)`)
— all consumers are `JSON.parse`, so this is a pure ~40% write-size saving with no information loss;
(b) the depth loss is made irrelevant by S8's persisted aggregates, which survive ring eviction.

### S2 — The governor's decision is one pure function *(the testable surface)*

Precedents: `pickRankAction`, `planSkillBuy`, `shouldRotateCity`, `diplomacyBudgetRemainingMs`,
`detectOverheadStall`. This follows them exactly.

```js
/**
 * Pure. The autolevel governor's entire decision for ONE action. Reads realised outcomes
 * only -- no getActionEstimatedSuccessChance anywhere in this call graph (D3).
 *
 * @param {{
 *   name: string,               // for the reason string only
 *   type: "Contracts"|"Operations",
 *   level: number,              // getActionCurrentLevel at decision time
 *   governed: boolean,          // autolevel already set false by us
 *   attempts: number,           // COMPLETED reps observed at exactly `level` since the last level change
 *   successes: number,
 *   rankSum: number,            // realised rank over those completions -- logged, not used in the band decision
 *   levelSetAtMs: number|null,  // when WE last set this action's level (null = never)
 *   ceilingLevel: number|null,  // lowest level a `lower` has fired from since ceilingSetAtMs
 *   ceilingSetAtMs: number|null,
 *   hardCeilingLevel: number|null, // highest level the game accepted on read-back (S3 step 4)
 *   raiseStreak: number         // consecutive clean windows that produced a `raise`
 * }} actionOutcome
 * @param {{ nowMs:number, regimeReset?:boolean, minSamples?:number, lowerBand?:number,
 *           raiseBand?:number, cooldownMs?:number, minLevel?:number, ceilingHoldMs?:number,
 *           maxRaiseStep?:number }} opts
 * @returns {{ decision:"hold"|"lower"|"raise"|"insufficient-data",
 *             toLevel:number|null, successRate:number|null, samples:number, reason:string }}
 */
export function planLevelAdjustment(actionOutcome, opts)
```

**Behaviour, in evaluation order.** Each row is a unit test.

| # | Condition | Result | Why |
|---|---|---|---|
| 1 | `level`/`attempts`/`successes` non-finite or negative, or `attempts < successes` | `insufficient-data`, `toLevel: null`, reason `"bad-input"` | Never act on a malformed record |
| 2 | `opts.regimeReset === true` **and** `governed === true` | `lower` to `max(minLevel, floor(level/2))`, reason `"post-install-reset"` — **bypasses `minSamples` and `cooldownMs`**; also clears the ceiling | An install resets combat stats to 1 and every clearable level collapses at once (Q40-3). Waiting for 20 failures burns ~45 min of near-zero yield per governed action |
| 3 | `opts.regimeReset === true` **and** `governed === false` | `hold`, reason `"ungoverned-regime"` | Deliberate: an ungoverned action is on autolevel and may be fine (`Tracking` took **no** measured damage across install #43 at L102–112, §12.3). Rule 6 catches it empirically within one window at a cost of ≤1 window |
| 4 | `attempts < minSamples` | `insufficient-data`, reason `"samples"` | 20 completions ≈ 45 min at `Investigation`'s ~26/h |
| 5 | `levelSetAtMs !== null` and `nowMs − levelSetAtMs < cooldownMs` | `hold`, reason `"cooldown"` | Wall-clock anti-thrash floor. Mostly non-binding (rule 4 binds first); it exists so a fast action cannot oscillate |
| 6 | `successRate < lowerBand` | `lower` — step = `4` if `successRate < 0.20`, `2` if `< 0.40`, else `1`; `toLevel = max(minLevel, level − step)`; reason `"below-band"` (or `"take-ownership"` when `governed === false`) | The asymmetry (§5.1): a 4-level overshoot costs ~1.2× payout, a 1-level undershoot costs ~99% success. `Investigation` at L33 / ~1% converges 33 → 29 in **one** step |
| 7 | `level <= minLevel` and rule 6 fired | `hold`, reason `"at-floor"` | Nothing left to give |
| 8 | `governed === false` (and rule 6 did not fire) | `hold`, reason `"autolevel-healthy"` | **D5's no-op guarantee, structural.** An ungoverned action is never raised — autolevel already raises it on every success, which is strictly faster than anything this controller can do |
| 9 | `successRate >= raiseBand`, `governed === true`, ceiling permits | `raise` — step = `min(maxRaiseStep, 1 + raiseStreak)`; `toLevel = level + step`, clamped to `ceilingLevel − 1` while the ceiling holds and to `hardCeilingLevel` always; reason `"above-band"` | Payout rises ~4%/level and the clearable level is a **moving target** (combat stats regrow). The streak lets a post-install action climb 10 → 30 in ~7 windows instead of 20 |
| 10 | rule 9's clamp yields `toLevel <= level` | `hold`, reason `"ceiling"` | |
| 11 | otherwise | `hold`, reason `"in-band"` | The intended steady state |

**Ceiling semantics.** `ceilingLevel` is the lowest level a `lower` has fired *from*; while
`nowMs − ceilingSetAtMs < ceilingHoldMs` (default **6 h**) the governor will not raise back to it.
After that the ceiling is treated as `null` — combat stats grow continuously from Bladeburner actions
(1 → 171 defence in 26 h, §S9a), so a permanent ceiling would forfeit the payout gradient that D2 was
written to protect. `hardCeilingLevel` is different and permanent-until-regime-reset: it is set by the
actuator when the game **refuses** a raise (read-back < requested), which is how this spec avoids
paying 4 GB for `getActionMaxLevel`.

**Defaults (all provisional, all written into every log event so they can be re-derived offline):**
`LEVEL_MIN_SAMPLES = 20` · `LEVEL_LOWER_BAND = 0.60` · `LEVEL_RAISE_BAND = 0.95` ·
`LEVEL_COOLDOWN_MS = 600_000` · `LEVEL_FLOOR = 1` · `LEVEL_CEILING_HOLD_MS = 21_600_000` ·
`LEVEL_MAX_RAISE_STEP = 4`.

⚠️ **The band is a proxy, and its cost if wrong is bounded and small.** §12.2's realised peak sits at
L26–29, i.e. a 63–87% success rate — which is what `[0.60, 0.95]` targets. If the true optimum sits
*below* 0.60 (high-variance payouts favouring more failures), the governor parks 1–2 levels low and
forfeits ~4–8% of that action's yield — **~1.5% of the aggregate rate** at `Investigation`'s ~16%
share. If it sits above 0.95, the raise band finds it. Logged as **Q40-6**; `rankSum` is carried per
level specifically so a future phase can hill-climb on realised yield instead of a proxy.

### S3 — The actuator: boundary-aligned, read-back-verified, slot-safe

Non-pure, in the loop, and the **only** code path that calls `setActionLevel`/`setActionAutolevel`.
Preconditions, all four required:

1. `LEVEL_GOVERNOR_MODE === "active"` (S7).
2. **No active yield grant.** During a grant the engine has released the slot and started nothing;
   a forced restart would preempt the claimant and break S2.1's ordering contract. Level changes are
   suppressed and re-evaluated after the reclaim.
3. The action is not quarantined and not `governorFailed` (S3 step 4).
4. We are at a **completion boundary** for that action, or the action is not currently running.
   Changing the level of a running rep is undocumented (**Q40-7**); this precondition means the spec
   never has to know the answer.

Then, in order:

1. **If ungoverned:** `setActionAutolevel(type, name, false)`, then **read back**
   `getActionAutolevel`. If it does not read `false`, log `warn` (`reason: "autolevel-set-failed"`),
   **abort without setting the level**, and mark `governorFailed` for `LEVEL_SET_RETRY_MS` (30 min).
   Setting a level while autolevel is still on would be undone by the game on the next success.
2. `setActionLevel(type, name, toLevel)`, then **read back** `getActionCurrentLevel`.
3. **Read-back disagreement is handled by direction, not by a single error path:**
   - decision was `raise` and read-back `< toLevel` ⇒ the game clamped at max. Set
     `hardCeilingLevel = readBack`, log `level-govern` with `clamped: true`. **Not an error.**
   - decision was `lower` and read-back `≠ toLevel` ⇒ genuine anomaly. Log `warn`
     (`reason: "level-set-failed"`), set `governorFailed` for `LEVEL_SET_RETRY_MS`.
4. Reset that action's outcome counters, set `levelSetAtMs`, update `ceilingLevel`/`raiseStreak`.
5. If the action is the one currently running, force one restart so the next rep begins at the new
   level: `shouldStartAction` gains an optional `forceRestartReason = null` parameter which, when
   set, overrides only the `"running-desired"` early return. **Every existing test passes unchanged
   because the parameter defaults to `null`.** Cost of the restart is ≤1 s of elapsed progress
   (we are at a boundary), and the restart is verified by S6 like any other.
6. Log exactly **one** `level-govern` event carrying the full decision, both read-backs, the
   constants in force, and the realised `successRate`/`samples` it acted on.

**Player-action slot: the governor does not need it, and this is confirmed from the reference, not
assumed.** `docs/bladeburner-reference.md` §6 "Action levels" documents `setActionLevel` /
`setActionAutolevel` as plain setters with no lifecycle semantics; the slot is claimed by
`startAction` / `commitCrime` / `workForFaction` / `installBackdoor`. The **only** slot-touching call
this phase makes is step 5's restart — which uses a slot the engine already holds, and which
precondition 2 suppresses whenever it does not.

### S4 — Ownership is sticky, reconciled from the game, and never handed back automatically *(D2)*

Once taken, ownership persists. Handing `autolevel` back would re-run the succeed → level-up →
harder → fail loop that this phase exists to break, and §12.2 shows the loop has no self-exit: at 1%
success the action cannot climb out and autolevel never lowers.

**Reconciliation across restarts costs nothing.** The engine restarts often (17 logged). On startup,
for each levelable action, `getActionAutolevel` (already charged) reading `false` ⇒ governed. Only
this engine and `bladeburneractionprobe.js` ever write that flag, and the probe restores it in a
`finally` (`:379–381`), so `false` is an unambiguous ownership marker. Counters and ceilings are
additionally seeded from the persisted snapshot (S8) — but ownership itself is read from the game, so
a lost state file degrades to "re-earn the samples", never to "hand `Investigation` back to autolevel".

### S5 — The revert path is a mode flip plus one restore tick *(features §6's tripwire)*

`LEVEL_GOVERNOR_MODE = "off"` (edited in the repo, then `cli.mjs restart bladeburnermanager.js`).
On the first tick in `"off"` with governed actions present, the engine calls
`setActionAutolevel(type, name, true)` once per governed action, reads back, logs one
`level-govern-revert` per action, and drops ownership.

⚠️ **What revert does and does not restore, stated plainly:** it restores the **policy** (the game
resumes autolevelling), not the exact prior level. The action re-climbs from wherever it was left, at
one level per success — for `Tracking` that is minutes, for `Investigation` hours. That is sufficient
because reverting means "the pre-Phase-40 behaviour is back", and the pre-Phase-40 behaviour *is* the
climb. No `getActionMaxLevel` call is needed for this, which is the second 4 GB saved.

**Tripwire, numeric:** revert if the aggregate rank rate over a **clean** 24 h window falls below
**630 rank/h** (−10% on the 703 rank/h baseline stamped 2026-08-08).
🔴 **"Clean" is load-bearing and is defined here, because a trend read across a known disturbance is
not a trend:** the window must contain **no install** (checked against `logs/ratchet-log.json`'s
timestamps — installs are currently stopped, `src/ratchet-mode.txt` = `observe`) and
`totals.postInstallSec === 0` over the window. If either fails, the verdict is **advisory, not
binding**, and the window is re-taken — the same shape as Phase 39's `regimeDominated`.
The 24 h clock starts at the **first applied level change**, not at merge.

### S6 — Scope: which actions are governed

Contracts and Operations that the engine actually runs, i.e. members of
`applyStageGate(buildCandidates(ns), STAGE_B_ENABLED)`. Consequences, all deliberate:

- **General actions are excluded** — `getActionSuccesses` throws for them ("not levelable", confirmed
  live 2026-08-03), and they have no level.
- **The five Stage-B operations are never governed**, because they are never run and therefore never
  sampled. The governor cannot become a back door into Stage B: it never calls `startAction` with an
  action it did not receive from the already-gated pool, and it changes levels, not selection.
- In practice today that means `Tracking` (ungoverned, healthy) and `Investigation` (the target), with
  `Bounty Hunter` / `Retirement` governed automatically if they ever enter the pool. That is D5's
  "generic, so no Phase 41 when `Tracking` hits its own cliff", at no extra cost.

### S7 — Shipping staged: `shadow` before `active` *(a spec-stage addition to features §6)*

`LEVEL_GOVERNOR_MODE = "off" | "shadow" | "active"`, default **`"shadow"`** at WI2's merge.

In `"shadow"` the governor computes and **logs** its decisions on an edge-triggered basis and calls
no setter. This is not caution theatre — it is the one lesson this node has paid for repeatedly:
*an engine that measures itself must be validated against an independent source before its numbers
are trusted*, and this controller's input is a field that has been **returning zero for five days**.
Shadow mode costs at most one sample window (~45 min) and buys a check that the repaired ledger
reports `Investigation` ≈ 1% and `Tracking` ≈ 100% — numbers we already know independently from
§12.1's reconstruction. If shadow disagrees with §12.1, the ledger repair is wrong and activating
would have set levels off a broken instrument.

**If wrong, the cost is ~45 minutes of the ~5 days this phase is trying to save.**

### S8 — Where the data lives: extend the ledger, aggregate in state *(resolves Q40-5)*

- **`bladeburner-attempts.json`** gains `kind: "complete"` records (S1). No new file ⇒ no
  `vite.config.ts` edit.
- **`bladeburner-state.json`** gains one `levelGovernor` block — the *aggregates*, which is what the
  controller actually reads:

```
levelGovernor: {
  mode, constants: { minSamples, lowerBand, raiseBand, cooldownMs, ceilingHoldMs, maxRaiseStep },
  actions: { <name>: { type, level, governed, governorFailedUntilMs,
                       attempts, successes, rankSum,          // at the CURRENT level only
                       levelSetAtMs, ceilingLevel, ceilingSetAtMs, hardCeilingLevel, raiseStreak,
                       lastDecision: { decision, toLevel, successRate, samples, reason, atMs },
                       byLevel: { <level>: { attempts, successes, rankSum } } } } }
```

🔴 **`byLevel` is only cumulative if something persists it** — the fifth-instance rule from §11.7.
It is seeded on startup by a pure `seedLevelGovernor(raw)` reading the prior `bladeburner-state.json`
(the `seedTotals` precedent, `:1131`), **with a schema guard**: adoption is gated on the presence of
the block's own `constants` key, and a blob missing it is rejected whole rather than partially
adopted. That guard is not hypothetical — Phase 39 shipped exactly that bug when a Phase-38 `totals`
blob was partially adopted because two field names happened to match. There is a unit test for the
restart round-trip.

`byLevel` is pruned to the `LEVEL_OUTCOME_LEVELS_KEPT = 12` most-recently-touched levels per action,
so a snapshot written every 10 s cannot grow without bound.

- **`bladeburner-log.json`** gains three event kinds: `level-govern` (a decision applied, or a shadow
  decision), `level-govern-revert` (S5), and the existing `warn` kind for the two failure paths.
  ⚠️ **Edge-triggered only, plus a 30-minute heartbeat.** Phase 39 shipped a bug where `crossover`
  logged every tick and evicted the entire 2,000-entry ring within minutes; a per-tick `hold` decision
  would reproduce it exactly. **A `hold` is never logged except on the heartbeat or on a change of
  `reason`.**

### S9 — Identifier hygiene pre-screen

New identifiers, checked against `ns.*` (all namespaces: `ns`, `ns.ui`, `ns.cloud`, `ns.singularity`,
`ns.formulas`, `ns.bladeburner`, `ns.dnet`) and the browser/Node globals:

`planLevelAdjustment`, `detectActionBoundary`, `foldCompletion`, `seedLevelGovernor`,
`pruneLevelOutcomes`, `skillLevelsFingerprint`, `boundaryState`, `outcomeWindow`, `actionOutcome`,
`levelGovernor`, `governed`, `governorFailed`, `governorFailedUntilMs`, `toLevel`, `successRate`,
`raiseStreak`, `ceilingLevel`, `ceilingSetAtMs`, `hardCeilingLevel`, `levelSetAtMs`, `rankSum`,
`byLevel`, `elapsedMs`, `previousElapsedMs`, `forceRestartReason`, `regimeReset`, `lowerBand`,
`raiseBand`, `maxRaiseStep`, `minSamples`, `LEVEL_GOVERNOR_MODE`, `LEVEL_MIN_SAMPLES`,
`LEVEL_LOWER_BAND`, `LEVEL_RAISE_BAND`, `LEVEL_COOLDOWN_MS`, `LEVEL_FLOOR`, `LEVEL_CEILING_HOLD_MS`,
`LEVEL_MAX_RAISE_STEP`, `LEVEL_SET_RETRY_MS`, `LEVEL_OUTCOME_LEVELS_KEPT`,
`BASELINE_RANK_PER_HOUR`, `TRIPWIRE_RANK_PER_HOUR`.

⚠️ **Three deliberate swerves, each naming the collision it dodges:**
1. **`outcomeWindow`, never `window`** — the trailing sample buffer is the single most natural place
   in this design to write `window`, and that identifier cost Phase 38 **+25 GB** on the name alone.
2. **`ceilingLevel`, never `probeCeiling`** — Phase 39's S15 lists `probe` as billed 0.20 GB
   (`ns.dnet.probe`). The compound name would almost certainly be safe; using it anyway would put a
   near-miss in the file for the next reader to copy.
3. **`skillLevelsFingerprint`** is the *function*; `skillLevelsHash` stays the JSON *field* name for
   schema continuity with Phase 39's S7 shape.

Also deliberately avoided, unchanged from Phase 39's list: `window`, `document`, `location`,
`navigator`, `history`, `self`, `top`, `parent`, `global`, `process`, `share`, `exec`, `ls`, `ps`,
`rm`, `mv`, `run`, `kill`, `read`, `write`, `scan`, `hack`, `grow`, `weaken`, `tail`, `probe`,
`skills`, `city`. **Any surprising `ramcheck.js` reading is checked against this class first.**

### S10 — RAM: a delta gate, because the absolute baseline is stale

**Do not assume 90.00 GB.** That figure is `docs/phases/CHANGELOG.md`'s Phase-39 R1 reading
(2026-08-03) and **five commits have landed on `src/bladeburnermanager.js` since** with no recorded
re-measure (`logs/ramcheck-result.json` carries only `daemon.js` / `share.js`). For historical
calibration: this file measured **86.00 GB** when a `window` identifier collision was present and
**61.00 GB** after it was found (Phase 38); Phase 39 then took it to a legitimately-explained
90.00 GB.

The gate is therefore a **delta**:

1. **R0 — baseline, before any edit.** `run ramcheck.js bladeburnermanager.js daemon.js augfarmer.js`
   on the unmodified `master` working tree. Record the number in the spec's close-out.
2. **R1 — after.** Same command. **Expected: R0 + 12.00 GB, exactly**, from three genuinely new
   4 GB calls — `getActionCurrentTime` (S1), `setActionLevel`, `setActionAutolevel` (S3).
   `daemon.js` / `augfarmer.js` **flat**.
3. **Anything other than +12.00 GB stops the phase** and is checked against S9's identifier class
   *first*, before any other theory. A `+16` reading means a fourth call crept in (most likely
   `getActionMaxLevel` — deliberately not used, see S2/S5); a `+14.4` or `+12.2` reading is an
   identifier collision, not a call.
4. Every reading is only trustworthy if `bytes[name]` matches `dist/src/bladeburnermanager.js`'s
   length — `ramcheck.js` records it for exactly this reason.

Free-RAM context: home had 162 GB free at 90 GB usage, so +12 GB is affordable; it is gated because
an unexplained reading is a *bug signal*, not because the budget is tight.

---

## Design — work items

**Restructured from the features doc's three, and here is the change and the reason.** Features §6
proposed (1) ledger repair, (2) governor, (3) live validation. Kept: ledger repair as WI1. **Split
differently:** the governor ships **inert** (WI2, `"shadow"`) and activation-plus-validation becomes
one item (WI3), because live validation is not separable from the flip that produces the behaviour to
validate — a "validation work item" with nothing to validate is not independently shippable, whereas
"ship the controller switched off" genuinely is. Net: still three items, each mergeable on its own
gates.

### WI1 — Ledger repair [code] *(S1, D4)*

**Merges first; WI2/WI3 are not trusted before it.** Unblocks the open `BACKLOG` bug
"`startAction` silently no-ops for Tracking and Raid" as a side effect — that bug's recorded next
action is "check whether the ledger's context fields correlate with which attempts fail", which has
been unexecutable because those fields are `null`.

| Function | Responsibility |
|---|---|
| `detectActionBoundary({ elapsedMs, previousElapsedMs, actionTimeMs, verified, sameAction })` | **Pure, new.** `{completed, uncertain, reason}`. `completed` on a wrap (`elapsedMs < previousElapsedMs`); `uncertain: true` additionally when `elapsedMs − previousElapsedMs > actionTimeMs` (bonus time can process >1 rep in one `nextUpdate`). `completed: false` with reasons `"not-running"` / `"action-changed"` / `"no-baseline"` / `"bad-action-time"` |
| `skillLevelsFingerprint(skillLevels, order)` | **Pure, new.** Stable short string, `order.map(s => skillLevels[s] ?? 0).join("/")` |
| `buildCandidates(ns)` | carries `countRemaining` (value already fetched at `:303`) and `pMax` (already returned by the same call) |
| `recordAttempt(...)` | unchanged shape; now also serves `kind: "complete"` |

Loop changes: read `getActionCurrentTime()` each tick; maintain `boundaryState`; settle a `complete`
record at each boundary; **hoist** the city/team/skill reads above candidate selection and delete the
duplicate block at `:1715–1719`; populate the four `context` correlates at `:1653`; drop the ledger's
pretty-print indentation.

### WI2 — The governor, shipped inert [code] *(S2, S3, S4, S7, S8, S9)*

| Function | Responsibility |
|---|---|
| `planLevelAdjustment(actionOutcome, opts)` | **Pure, new.** S2's eleven-row table. The whole policy |
| `foldCompletion(governorState, { name, type, level, success, rankDelta, nowMs })` | **Pure, new.** Folds one completion into `attempts`/`successes`/`rankSum` and `byLevel`; prunes via `pruneLevelOutcomes` |
| `pruneLevelOutcomes(byLevel, keep)` | **Pure, new.** Keeps the `LEVEL_OUTCOME_LEVELS_KEPT` most-recently-touched levels |
| `seedLevelGovernor(raw)` | **Pure, new.** Restart persistence with the `constants`-key schema guard (S8) |
| `shouldStartAction({..., forceRestartReason})` | **existing, one optional parameter added, default `null`** — overrides only the `"running-desired"` early return |
| actuator (loop-inline) | S3's six steps, unreachable while `LEVEL_GOVERNOR_MODE !== "active"` |

RAM lands here in full (+12 GB): the static analyzer bills the setter names whether or not the mode
constant makes them reachable. That is expected and is why R1 is measured at WI2, not WI3.

### WI3 — Activation, live validation, tripwire [live] *(S5, S7)*

One-line flip of `LEVEL_GOVERNOR_MODE` to `"active"`, gated on **V2** below, then the L-series checks.
Also the doc reconciliations, staged in the same commit per CLAUDE.md:

- `docs/bladeburner-reference.md` §6 "Action levels": record that `setActionLevel` **can lower** a
  level with no clamp (proven over 31 levels, `bladeburneractionprobe-1785722785366.json`), that
  read-back is the only success signal, and that a raise clamped at max is detectable by read-back —
  so `getActionMaxLevel` is not required for a level controller.
- `docs/bn6-go-no-go.md`: a §13 recording the ledger repair, and an explicit strike-through of §11.4's
  and §12's "reconstructed by differencing `context.rank`" workaround note once `observed.rankDelta`
  is real — with **both** methods' numbers side by side for one window, which is the cross-check.
- `docs/bn6-playbook.md` §1: the governor's existence and its tripwire.
- `BACKLOG.md`: the `startAction` no-op bug's next action becomes executable — update it to name the
  now-populated correlates. `docs/phases/CHANGELOG.md`: the dated entry.
- `CLAUDE.md`'s "Current standing" bullet: `Investigation`'s realised rank/action, stamped.

---

## Tests [code]

`test/bladeburnermanager.test.js`, extending the existing file. Every assertion below is a named
test.

**`planLevelAdjustment`** — one test per S2 row, plus:
- **The D5 no-op test.** `Tracking`-shaped fixture: `governed: false`, `attempts: 400`,
  `successes: 400` ⇒ `hold` / `"autolevel-healthy"`, `toLevel === null`. **An ungoverned action is
  never raised and never lowered while in band** — this is the regression test for "the governor
  touched the load-bearing action".
- **The `Investigation` fixture, from live numbers.** `level: 33`, `governed: false`,
  `attempts: 342`, `successes: 3` (0.9%) ⇒ `lower`, `toLevel === 29`, reason `"take-ownership"`.
- **Sample floor:** `attempts: 19`, `successes: 0` ⇒ `insufficient-data`, `toLevel === null`. **A
  catastrophic-looking small sample does not act** — an estimate is not a measurement.
- **Floor clamp:** `level: 2`, `successRate: 0` ⇒ `toLevel === 1`, never 0 or negative; at `level: 1`
  ⇒ `hold` / `"at-floor"`.
- **Ceiling:** after a `lower` from 33, a later clean window at 29 with `ceilingSetAtMs` 1 h ago ⇒
  raise clamped to 32, never 33; the same fixture with `ceilingSetAtMs` 7 h ago ⇒ ceiling released.
- **`hardCeilingLevel`** always clamps, regardless of `ceilingHoldMs`.
- **Raise streak:** `raiseStreak` 0/1/2/5 ⇒ steps 1/2/3/4 (capped).
- **Post-install reset:** `regimeReset: true`, `governed: true`, `level: 30`, `attempts: 0` ⇒ `lower`
  to 15 **despite zero samples and an unexpired cooldown**; the same fixture with `governed: false`
  ⇒ `hold` / `"ungoverned-regime"`.
- **Bad input:** `successes > attempts`, `NaN` level, negative attempts ⇒ `insufficient-data`.

**`detectActionBoundary`** — wrap detected; monotonic elapsed not detected; `previousElapsedMs: null`
⇒ `"no-baseline"`; `verified: false` ⇒ `"not-running"`; `sameAction: false` ⇒ `"action-changed"`;
a jump exceeding `actionTimeMs` ⇒ `completed: true, uncertain: true`; `actionTimeMs: 0` ⇒
`"bad-action-time"`.

**`foldCompletion` / `pruneLevelOutcomes`** — a success and a failure fold into the right counters;
`byLevel` keyed by the level at completion, **not** the current level; pruning keeps exactly
`LEVEL_OUTCOME_LEVELS_KEPT` and drops the least-recently-touched.

**`seedLevelGovernor`** — the round-trip test: a state blob written by `buildBbState` reseeds to
identical counters. **And the schema-guard test:** a blob missing `constants` is rejected **whole**
(not partially adopted) — the regression test for Phase 39's `seedTotals` partial-adoption bug.

**`skillLevelsFingerprint`** — stable across calls with the same input; changes when any level
changes; missing skill reads `0`, not `undefined`.

**`shouldStartAction`** — **the existing tests must pass unmodified.** New: with
`forceRestartReason: "level-change"` and `liveActionName === chosenAction.name` ⇒
`{start: true, reason: "level-change"}`; with the parameter absent, the same fixture still returns
`{start: false, reason: "running-desired"}`.

**`buildCandidates`** — the fake-`ns` fixture asserts `countRemaining` and `pMax` are present and
finite on every candidate.

**D3's guard, as a test not a promise:** a test asserts that `planLevelAdjustment`, `foldCompletion`,
`detectActionBoundary` and `seedLevelGovernor` are pure functions of their arguments — they take no
`ns` and no candidate object, so the estimator is structurally unreachable from the controller.
V2's grep is the second half of this check.

`test/verify-bladeburner.test.js` (`npm run verify:log`):
- `knownKinds` gains `level-govern` and `level-govern-revert`.
- `bladeburner-state.json` carries a `levelGovernor` block whose `mode` is one of the three values
  and whose per-action `successes <= attempts`.
- **The ledger-repair assertion, qualified so it cannot fail a correct engine:** among
  `bladeburner-attempts.json` records with `kind === "complete"` **and** `name === "Tracking"`, if
  there are **at least 50**, then `successDelta` is not identically zero across them. Qualified on
  the count because a freshly-restarted engine legitimately has none, and scoped to `Tracking`
  because it is the action with a known ~100% success rate — a zero there is unambiguous instrument
  failure, which is the precise defect §12.4 found.

---

## Live procedure [live]

No probe script, no hand-started action. Every step is a read of what the engine produces, or a
one-line mode flip.

- **L1 — RAM.** S10's R0/R1 pair, with `daemon.js` / `augfarmer.js` flat and the `bytes` freshness
  check against `dist/src/`.
- **L2 — The ledger is alive** (after WI1, ~30 min of uptime). From `logs/bladeburner-attempts.json`:
  - `kind: "complete"` records exist, ≥ 25 of them;
  - **`Tracking`'s mean `observed.rankDelta` over complete records lands in 15.0–30.0** — the
    independent cross-check, since §11.3's rank-differencing reconstruction put it at 19.77 (whole
    window) and 24.52 (latest bucket). Outside that band, **stop**: the instrument and the
    reconstruction disagree and one of them is wrong. Pass/fail bar: **within ±25% of a same-window
    reconstruction re-run on the new file.**
  - `context.cityChaos` / `countRemaining` / `skillLevelsHash` / `teamSize` non-`null` on **≥ 99%** of
    records written after the restart.
- **L3 — Shadow agrees with what we already know** (after WI2, ~1 h). From `bladeburner-log.json`'s
  `level-govern` shadow entries: `Investigation` reads `decision: "lower"` with `successRate ≤ 0.10`;
  `Tracking` reads `decision: "hold"`, reason `"autolevel-healthy"`. 🔴 **A shadow `lower` on
  `Tracking` stops the phase** — that is the load-bearing action and the governor would be about to
  break it.
- **L4 — Activate** (WI3): flip `LEVEL_GOVERNOR_MODE` to `"active"` in the repo, verify the push
  landed, `node tools/bb/cli.mjs restart bladeburnermanager.js`. ⚠️ A `run` failure can hide behind a
  RUNTIME ERROR modal the terminal does not show — confirm the engine is alive from a fresh
  `bladeburner-state.json` write, not from `read-terminal`.
- **L5 — The change applied, verified against the game** (within 30 min of L4). One `level-govern`
  event with `applied: true` for `Investigation`, and — the independent source — the in-game
  Bladeburner panel (`cli.mjs goto Bladeburner`, `cli.mjs body`) showing that action's level at the
  new value. **Log-only confirmation is not sufficient**; this is the Phase 38 lesson applied to a
  setter with no return value.
- **L6 — Mechanism check, +4 h.** `Investigation`'s realised mean rank/action over `complete` records
  in the trailing 2 h: **≥ 4.0** (it reads 0.23 today; the §12.2 table's peak is 9–10 at a different
  combat-stat level, so 4.0 is a bar a working fix clears comfortably and a broken one cannot).
  **Miss ⇒ diagnose before 24 h, do not wait for the tripwire.**
- **L7 — `Tracking` unharmed, +4 h.** Its realised mean rank/action within **±10%** of its
  pre-activation value, its level **not lowered**, and its completions/h **≥ 25** (it ran ~30/h).
  ⚠️ The completions/h bar is there for a predicted second-order effect: as `Investigation`'s level
  falls, the estimator will score it *higher*, and the engine's selection still runs on that
  estimator (deliberately out of scope, features §3.2). If `Tracking`'s share of starts falls
  materially, the aggregate can drop even though both actions improved.
- **L8 — Aggregate, +24 h clean.** `rates["24h"].rankPerWallSec × 3600` ≥ **703 rank/h**.
  **< 630 ⇒ S5's revert**, subject to S5's clean-window definition.

---

## Acceptance criteria

- **T1 — `npm test` green** (1246 existing + the new tests), with **no existing fixture's expected
  value changed except two acknowledged additive exceptions**: (1) `verify-bladeburner.test.js`'s
  `knownKinds` gains two entries; (2) `shouldStartAction`'s fixtures gain new cases while every
  existing case passes byte-identically. Anything else is stop-and-re-derive. [code — Claude clears]
- **T2 — `npm run verify:log` green**, including the qualified ledger-repair assertion. [code]
- **R1 — RAM is R0 + 12.00 GB exactly**, `daemon.js` / `augfarmer.js` flat, `bytes` fresh against
  `dist/`. Any other delta stops the phase (S10). [live]
- **V1 — L2 passes**: the repaired ledger agrees with the independent rank-differencing
  reconstruction within ±25% on `Tracking`. 🔴 **No governor decision may be acted on until V1
  passes** — this is the phase's non-negotiable criterion, and it is criterion V1 for the same reason
  it was in Phase 39. [live]
- **V2 — the estimator is structurally unreachable from the controller**, verified by grep as well as
  by test: `getActionEstimatedSuccessChance` appears in exactly one place, `buildCandidates`, and
  none of `planLevelAdjustment` / `foldCompletion` / `detectActionBoundary` / `seedLevelGovernor` /
  the actuator references it, directly or through a parameter. D3 as a checkable property. [code]
- **V3 — the setters are called from exactly one place.** `setActionLevel` and `setActionAutolevel`
  each have exactly one call site, both inside the actuator, both immediately followed by a
  read-back. Grepping four lines is the check. [code]
- **V4 — L3 passes** (shadow agrees with §12.1) **before** the activation flip. [live]
- **V5 — L6 and L7 pass at +4 h**: `Investigation` ≥ 4.0 rank/action, `Tracking` within ±10% and
  ≥ 25 completions/h. [live]
- **V6 — L8 at +24 h clean**: ≥ 703 rank/h, tripwire at < 630. This is the phase's actual
  deliverable. [live]

**Ship gate:** T1/T2/V2/V3 are self-cleared by Claude. **WI1 merges on R1 + V1** and nothing
downstream is trusted before it. WI2 merges on T1/T2 + V4. WI3's flip happens only after V4; V5/V6
are close-out deliverables, not merge blockers (precedent: Phase 35's V3, Phase 39's C1/C2).

---

## Files touched

**New:** none.

**Edited:** `src/bladeburnermanager.js`, `test/bladeburnermanager.test.js`,
`test/verify-bladeburner.test.js`, `docs/bladeburner-reference.md`, `docs/bn6-go-no-go.md`,
`docs/bn6-playbook.md`, `BACKLOG.md`, `docs/phases/CHANGELOG.md`, `CLAUDE.md` (the stamped
"Current standing" bullet only).

**Deliberately untouched:** `vite.config.ts` (both target files already filtered — S8),
`src/dashboard.js` (no new panel space; the governor is legible from logs, per the observability
convention), `src/augfarmer.js`, `src/backdoorfactions.js`, `src/backdoorwd.js`, `src/installer.js`,
`src/daemon.js`, `src/bladeburneractionprobe.js` (its restore-in-`finally` is what makes S4's
ownership marker unambiguous — do not "simplify" it), the batcher core.

---

## Non-goals *(carried from features §3 and §7 — do not build these here)*

- **Diplomacy pre-emption** (§3.1). Its premise is falsified: chaos is city-scoped and `Tracking`
  took zero damage at chaos 66.5. The chaos-branch starvation is still a real defect and stays in
  `BACKLOG.md`; its **wake condition is this phase's free by-product** — a rise in `Tracking`'s
  zero-rate *while its level is held constant by the governor* is the action-independent signature
  chaos should have left and didn't.
- **The `objectiveMode` per-second → per-action flip** (§3.2). Wake condition: the repaired ledger
  carrying ≥1 week of realised per-action yields — i.e. deliberately sequenced *after* this phase.
- **Dropping `Investigation` from the pool** (§3.3). It is filler on capacity `Tracking` cannot
  supply; dropping it idles ~26 actions/h and gains nothing.
- **City rotation** (§3.4), **Stage B / `Raid`**, **The Blade's Simulacrum**, **Bladeburner augs**,
  **sleeves**, **any change to action *selection***.
- **Claiming +34% / ~5 days saved.** §1.4 is an extrapolation from per-level yields measured at a
  *different* combat-stat level. It is the reason to build, not a result, and it must not be restated
  as one. The phase's claim is what L6/L8 measure.
- **Claiming chaos is harmless.** The finding is narrower: chaos *cannot* explain an action-specific
  collapse.

---

## Open questions carried forward

Each carries a default and a date, per CLAUDE.md.

| # | Question | Default while unanswered | Trigger / date |
|---|---|---|---|
| **Q40-6** | Is the `[0.60, 0.95]` success band the right proxy for the realised-yield peak, or should the governor hill-climb on `rankSum/attempts` directly? | **Ship the band.** Bounded cost if wrong: ~4–8% of one action's yield ≈ ~1.5% of the aggregate (S2). `rankSum` is recorded per level so the hill-climb is a pure re-analysis, not a re-measurement | Revisit when `byLevel` holds ≥200 completions across ≥3 levels for one action — expected ~1 week after WI1. **2026-08-16** |
| **Q40-7** | Does `setActionLevel` on a *running* rep reset or corrupt its progress? Undocumented; both setters return `void` | **Never find out.** S3's precondition 4 changes levels only at a completion boundary, then forces one restart | Only if the forced restart shows up as a measurable duty-cycle cost in `rates["24h"].dutyCycle` (currently 99.4%). **2026-08-22** |
| **Q40-8** | Does §5.1's ~+4%/level payout slope — measured on `Tracking`, a **Contract** — hold for **Operations**? `Investigation`'s `rankLoss` is 0.774 where `Tracking`'s is 0 | **Assume it does, and note the controller does not depend on it**: `planLevelAdjustment` reads success rate, never payout. A wrong slope invalidates the *justification* in S2, not the mechanism | Free from WI1's ledger once `Investigation` has completions at ≥3 levels. **2026-08-16** |
| **Q40-9** | The post-install branch (S2 rule 2) is **unit-tested only** — the install cadence is stopped (`src/ratchet-mode.txt` = `observe`, 2026-08-06), so it cannot be live-validated in this phase | **Leave it enabled.** It is strictly safer than the alternative (an action stranded above its post-install clearable level pays ~0 and, for Operations, negative) | First install after the cadence resumes. **No date — event-triggered** |
| **Q40-10** | Does the governor interact badly with action **selection**? As `Investigation`'s level falls its (hot) estimated EV rises, so the engine may start it more often at `Tracking`'s expense | **Do not change selection** (out of scope, §3.2). L7's ≥25 completions/h bar on `Tracking` is the detector | At L7, +4 h after activation. If it fires, the answer is the `objectiveMode` phase, not a governor tweak |
| **Q40-11** | `getActionCurrentTime()` returns "undefined behavior when idle" (reference §6). What does it actually return — `0`, `-1`, stale, or throw? | **Guard by construction:** `detectActionBoundary` returns `"not-running"` whenever `verified === false`, so the value is never read when idle. The read still happens (RAM is static), the *use* does not | If a `complete` record ever appears with an implausible `actionSec`. Standing |

---

## Logged dropped objections

1. **The whole phase rests on a dose-response curve reconstructed from a broken instrument.** §12.2's
   by-level table was built by differencing `context.rank` because `observed.rankDelta` is dead — the
   very defect WI1 fixes. The curve is probably right (it is monotonic, smooth across an install
   boundary, and n=1,501), but **the honest statement is that WI1 is repairing the instrument that
   produced the evidence for WI2.** V1 is the mitigation: the repaired ledger must reproduce the
   reconstruction's numbers before any decision is acted on.
2. **A closed-loop controller is being added to an engine whose action *selection* already runs on a
   number measured 16× hot.** This phase deliberately fixes the smaller, safer thing first and leaves
   the larger one open. If L7 shows selection eating the gain, the correct response is to open the
   `objectiveMode` phase, **not** to widen this controller's remit.
3. **`Investigation`'s realised peak (~9–10 rank/action) is worth ~244 rank/h against a 703 rank/h
   baseline — and the whole path is ~20 days.** Even a perfect outcome here does not change the shape
   of the BN6 decision; it saves ~5 days. It is worth doing because it is cheap and reversible, not
   because it is decisive.
4. **Three of the governor's seven constants are invented defaults** (`LEVEL_MIN_SAMPLES`,
   `LEVEL_LOWER_BAND`, `LEVEL_RAISE_BAND`). They are written into every `level-govern` event so they
   can be re-derived offline from real data — the same treatment Phase 39's S3 constants got, and for
   the same reason: they are a defensible default, not a measurement.
