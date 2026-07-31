# Phase 38 spec: the Bladeburner engine

**Stage:** spec (drafted 2026-07-31 from `phase-38-bladeburner-engine.features.md`; **revised once**
against a cold `spec-reviewer` pass that returned **9 blockers**).
**Model flow:** brainstorm opus → this spec (⚠️ **also opus, not fable** — deviation flagged and
accepted) → cold review ×1 → implement (sonnet).
**Scope:** a `bladeburnermanager.js` resident that plays Bladeburner unattended and instruments its
own rank curve, the narrow `augfarmer.js` cooperative slot hold that makes it possible, and
supervisor gating. **Deliverable is a decision** — is the counter-map's back-half Bladeburner
premise real? — not a BN6 clear. Hacking remains the BN6 win path.

**✅ Slice A (WI1) shipped and live-green 2026-07-31.** `resolveSlotHold` + the `planPass`
`slotHold` suppression sites landed on `phase-38-bladeburner-engine` (35 new tests, `npm test`
1060/1060, `npm run verify:log`'s 3 failures pre-existing/unrelated — confirmed via `git stash`).
Ship gate T1/T2/R1/V1/V2 all cleared:
- **R1** — `mem augfarmer.js` re-measured live at **64.10 GB**, byte-identical to the pre-change
  baseline. No RAM drift from the marker read (0 GB `ns.read`) or the new identifiers.
- **V1/V2** — exercised live with a throwaway stand-in harness (`slotholdtest.js`, deleted after
  the run per its own header — not committed) that played bladeburnermanager's role: stopped the
  player's action, wrote/refreshed the marker for 40s, then stopped refreshing and watched for
  30s+. Transcript (abridged): marker written → `augfarmer.js: INFO: slot held by slotholdtest --
  rep work suppressed` within one poll; `getCurrentWork()` stayed `null` for the full 40s hold
  while `phase` stayed `"grinding"` throughout (never leaked, decision 1 confirmed); refresh
  stopped → ~32s later `augfarmer.js: INFO: slot hold released -- rep work resuming`, work
  resumed with a fresh `cyclesWorked` count, no operator action. Matches decision 5's ~30s
  self-healing bound and blocker B8's prompt-write-gate intent exactly.
- **Known cosmetic gap, not a correctness issue:** `augfarmer-state.json`'s `slotHold.holdAgeMs`
  does not tick upward during a sustained hold — it's only rewritten on `slotHoldChanged` (a
  transition edge) or the 5-min heartbeat, the same precedent as `awaitingMoneySinceChanged`/
  `triggerArmChanged`. The live-observed ground truth (`getCurrentWork()`, the log lines) is what
  was actually tested; a consumer reading `holdAgeMs` mid-hold sees a stale-but-not-wrong age.

**Slice B (WI2-4, `bladeburnermanager.js` + supervisor gating) is next — not started.**

## Context

Two of the features doc's conclusions were overturned by its own process, and the spec inherits the
corrected versions:

- **2026-07-30** — a 75-minute trial measured 0.0144 rank/sec ⇒ ~10.5 months to the rank-400,000
  `Operation Daedalus` gate; Bladeburner was shelved.
- **2026-07-31 (a)** — the slot blocker resolved **against** the design: Bladeburner and
  `singularity` player-work share one exclusive slot that `getCurrentWork()` **cannot see**, so
  `augfarmer.js` re-grabs it ~4s after any Bladeburner action starts and kills it.
- **2026-07-31 (b)** — the **in-game Bladeburner panel had never been opened**, and it contradicts
  the 7/30 model: action time is reducible **10×** (`Overclock`, max 90), skill points accrue at
  **1 per 3 ranks** (~133,000 across the climb vs the 13 measured), team size was **0**, and action
  levels rise with success.

**This spec is not "test whether the verdict was premature." The verdict is known unsound. This
builds the instrument that finds the real curve, and bounds what it costs the win path.**

### Review changelog (what the cold pass changed)

| # | Finding | Resolution |
|---|---|---|
| B1 | Marker contract entirely unspecified, yet L2 asks Kenneth to hand-write one | **§ "The marker contract"** added — filename, schema, tolerance, ordering, ownership |
| B2 | `HOLD_SLICE_MS`/duty cycle undefined; `RATE_MIN_SAMPLES = 30` starvation could silently disable the ratchet's arming path | Constants pinned (decision 4); starvation **dissolved** by B3's fix (holds now produce samples) |
| B3 | Decision 2's reasoning factually wrong (`pickHorizonGrind` reads no rates) and its call-site edit ambiguous | **Old decision 2 deleted.** Sample normally; bound the duty cycle; name and log the residual bias |
| B4 | `backdoorwd.js` (the node-clear executor) and `backdoorfactions.js` also own the slot; engine preempts unconditionally | **New decision 3** — engine stands down while any higher-priority slot claimant runs |
| B5 | Bars derived in wall-clock, measured per held-second — over-reports by 1/dutyCycle | **Decision 8** defines one denominator and reports ETA at both current and 100% duty |
| B6 | Checkpoint B's "fitted trend" unadjudicable | Clause **deleted**; single hard bar + stated default |
| B7 | Realized-rate math loop-inline (violates own ground rule); `verify:log` vacuous | Three pure functions exported + tested; verify-log assertions added |
| B8 | `slotHold` not in the state write gate (5-min lag); `classifyWindow` unbounded/underspecified | Write-gate term added; staleness bound, conservative default, case per phase |
| B9 | Off-marker "honours" ambiguous — the exit reading recreates the 9.1h relaunch storm | Specified idle-in-loop + stop action + delete marker |
| S1 | Decision 6's justification wrong — an orphaned action self-heals in ≤10s | Corrected; `atExit` demoted to hygiene, decision 5 named as the real backstop |
| S3/S4 | Two code-citation errors in decision 1 | Both corrected |
| S5 | "Free windows" aren't free (deficit 0 still accrues rep) | Classification tightened |

---

## Ground rules

- **`augfarmer.js` RAM must measure unchanged** against its live `ramcheck.js` baseline. Additions
  are `ns.read` (**0 GB**) of one new file plus pure arithmetic; augfarmer already calls
  `ns.fileExists` (`:2115`) and `ns.read`. Any delta is checked against the identifier-hygiene bug
  class **first**.
- **`daemon.js` RAM must be re-measured, not assumed.** WI4 adds `ns.bladeburner.inBladeburner()`
  (documented 0 GB), but documented RAM has already proved a poor guide in this API.
- **Identifier hygiene.** New identifiers: `resolveSlotHold`, `SLOT_HOLD_FILE`,
  `SLOT_HOLD_MAX_AGE_MS`, `SLOT_HOLD_FUTURE_TOLERANCE_MS`, `slotHold`, `slotHoldChanged`,
  `holdActive`, `holdAgeMs`, `holdReason`, `holderName`, `pickRankAction`, `expectedRankPerSec`,
  `planSkillBuy`, `skillLevels`, `shouldRotateCity`, `cityName`, `chaosByCity`, `classifyWindow`,
  `computeRealizedRates`, `computeDutyCycle`, `computeRepForegone`, `projectRankEta`,
  `higherPriorityClaimant`, `dutyCycle`, `overheadSec`, `rankSec`, `repForegone`,
  `BLADEBURNER_OFF_MARKER`, `BLADEBURNER_GATED_COMPANIONS`, `HOLD_SLICE_MS`,
  `MAX_CONTESTED_DUTY`, `BB_POLL_MS`, `AUG_STATE_FRESH_MS`.
  ⚠️ **Deliberately avoided:** `skills` (shadows `ns.formulas.skills`) → `skillLevels`; `city` →
  `cityName`; `probe` (shadows `ns.dnet.probe` — cost 0.20 GB on the name alone in
  `bladeburnerprobe.js`); and the standing short-name list (`ls`/`ps`/`rm`/`run`/`kill`/`read`/
  `write`/`scan`/`hack`/`grow`/`weaken`/`share`/`exec`/`tail`). `ns.ps()` **is called** (decision 3)
  but no identifier is named `ps`.
- **The engine spends no money via any API.** ⚠️ It *does* lose money indirectly through
  hospitalization (22 events / **$229.5m** in a 75-minute trial), which decision 7 must bound.
- **No dashboard change this phase** (Phase 24 gate; the features doc made no panel decision).
  Observability is `bladeburner-state.json` + `bladeburner-log.json`.
- **Loop-inline code is not testable** — `test/augfarmer.test.js` exercises exported pure functions
  only. **Every behaviour an acceptance criterion depends on must be an exported pure function.**
- **Existing-test policy.** Shape-extension edits are expected and cite this spec. **No behavioural
  supersession.** Any change to an existing fixture's *expected value* is stop-and-re-derive.

---

## The marker contract *(blocker B1)*

The interface between Slice A and Slice B. Pinned here because Slice A ships and is hand-tested
**before** the engine exists.

- **File:** `bladeburner-slot-hold.json`, on `home`.
- **Schema:** `{ "ts": <epoch ms, number>, "holder": <string> }`. `ts` is the write time, refreshed
  every `BB_POLL_MS`. `holder` is informational (`"bladeburnermanager"`), surfaced in state for
  legibility; it is **never** used to decide whether the hold is honoured.
- **Ownership:** the engine is the sole writer and deleter. **`augfarmer.js` never writes or deletes
  it** — it only reads. This keeps the win-path script free of any responsibility for the
  experiment's lifecycle.
- **Deletion:** on slice release, on off-marker, and in `ns.atExit`. A *deleted* marker and a
  *stale* marker are equivalent in effect (both ⇒ not held); deletion is the fast path, staleness is
  the crash backstop.
- **⚠️ Write ordering is load-bearing:** the engine **writes/refreshes the marker BEFORE calling
  `startAction`**, never after. Reversed, augfarmer's next poll (≤10s) reads the slot as idle and
  kills the action — precisely the 7/31 probe result this whole phase is built on.
- **`SLOT_HOLD_FUTURE_TOLERANCE_MS = 5_000`.** Both processes share one `Date.now()`, so a future
  `ts` means a corrupt/hand-edited file. 5s makes the guard deterministic to test without being
  loose enough to matter.

---

## Spec-stage decisions

### 1. 🔴 The hold must NOT introduce a new `phase` string — this overrides features D9

`plan.phase` is not a display field; `decideInstall`/`evalTrigger` switch on it:

| Site | Test | Effect of a new `"slot-held"` string |
|---|---|---|
| `:1114` | `phase !== "grinding"` gates **`stallArmed`** | **passes** ⇒ stall trigger becomes eligible during holds |
| `:1124` | `else if (phase === "grinding")` | blocker attribution silently changes |
| `:1074/1076` | `idle-plateau` / `grinding` branches | falls through both ⇒ `phaseBlocker = "phase:slot-held"` |
| `:1138` | `phase === "awaiting-money"` gates escalation | ⚠️ **corrected (S3):** the donation-eligible/money-blocked path sets `phase = "awaiting-money"` at `:1870` and **falls through** to the slot logic at `:1873`, so a new string would have **replaced** it and suppressed escalation arming. The earlier draft called this "unaffected" — that was wrong. |

A Bladeburner slice of minutes must not make the ratchet more willing to install; early installs
cost a smaller buy-set plus a full re-climb, expensive under BN6's `HackExpGain 0.25` /
`CloudServerSoftcap 2.0`. In-file precedent: `:~1800` forces `phase: "grinding"` specifically so a
slot outcome can't leak into `evalTrigger`.

**Decision: the hold suppresses the `work` *action* and leaves `phase` exactly as it would have
been.** Legibility comes from a sibling `slotHold` field, never from overloading `phase`.

### 2. Rep-rate sampling proceeds normally — the slower rate is *true* *(replaces the old decision 2, blocker B3)*

The first draft skipped `updateRepRates` across hold windows. **That was wrong on three counts**, all
caught in review:

1. Its stated rationale — "horizons feed `pickHorizonGrind`" — is **false**. `pickHorizonGrind`
   (`:934-942`) takes `(sortedCandidates, joinedSet, donationClosableSet)` and never reads a rate.
2. **The "distortion" is the measurement.** While the engine holds the slot, rep genuinely accrues
   more slowly. Carrying pre-hold rates forward makes `decideInstall`'s `horizonMs = deficit / rate`
   (`:1084`) a *counterfactual* — "how long if nobody were stealing the slot" — so it does not
   remove bias, it **reverses its sign** and hides it.
3. The edit was ambiguous at `:2251-2260`, where `prevFactionRep`/`lastRateUpdate` advance
   unconditionally; skipping the block instead of the call would divide a two-interval rep delta by
   a one-interval `dt` — reproducing the very deflation it aimed to prevent. And "hold active for
   *part* of the interval" is unobservable from two polled reads.

**Decision: do not touch the rate-sampling path at all.** Sample normally.

- **Direction of the residual bias, stated explicitly:** holding depresses measured rep/sec ⇒
  `horizonMs` lengthens ⇒ the grind arm (which fires when the horizon *exceeds* `GRIND_HORIZON_MS`)
  becomes **more** likely ⇒ installs land **slightly earlier**. Bounded by `MAX_CONTESTED_DUTY`
  (decision 4).
- **It also dissolves blocker B2's second half:** because held passes still produce samples,
  `RATE_MIN_SAMPLES = 30` (`:145`, required at `:1083`) can never be starved by holding. Skipping
  would have risked leaving `phaseBlocker = "no-rate-sample"` set indefinitely and silently
  disabling the ratchet's primary arming path.
- **Auditability:** the engine logs `heldFraction` per window, so the uncorrected rate can be
  recovered after the fact. No correction is applied in-line.

### 3. 🔴 The engine stands down for higher-priority slot claimants *(new — blocker B4)*

The features doc treated this as a two-party contract. **It is not.** Other scripts occupy the same
player-action slot and read no marker:

| Script | Call | Why it outranks the engine |
|---|---|---|
| `backdoorwd.js:125` | `installBackdoor()` on `w0r1d_d43m0n` | ⚠️ **the literal node-clear executor.** Preempting it can block the win condition outright. |
| `backdoorfactions.js:224` | `installBackdoor()` on faction servers | re-runs **every install cycle**; gates faction unlocks |
| `studybootstrap.js:75` | `universityCourse` | post-install bootstrap |

`startAction` cancels whatever the player is doing. A slice boundary landing during a WD backdoor —
retried on a slow poll while the engine re-asserts every 10s — could prevent the node clear with no
error and no criterion that would catch it.

**Decision:** `higherPriorityClaimant(processList)` — a pure function over `ns.ps("home")` output
(0.2 GB) — returns the name of any running `backdoorwd.js` / `backdoorfactions.js` /
`studybootstrap.js`. When one is present the engine **releases its hold, stops its action, and does
not re-acquire** until the claimant exits. Checked every `BB_POLL_MS`, and **before** every
`startAction`. Verified live at **L4**.

### 4. Duty cycle and slice length are pinned, not left to the implementer *(blocker B2)*

These decide whether the experiment costs the win path 5% or 80% of its rep throughput:

- **`HOLD_SLICE_MS = 60_000`** — one-minute contested slices. Long enough to complete the fast
  rank-producing contracts (Tracking 12s, Retirement 17s, Bounty Hunter 21s), short enough that a
  released slice returns the slot promptly.
- **`MAX_CONTESTED_DUTY = 0.25`** — over any rolling hour the engine holds at most 25% of
  *contested* wall-time. Free-window holding (decision 6) is **not** capped.
- **`BB_POLL_MS = 10_000`** — matches augfarmer's `POLL_MS` and gives three refreshes inside
  `SLOT_HOLD_MAX_AGE_MS`.
- ⚠️ **The marker refresh must not be blocked by a long action.** `Recruitment` runs 291s — far
  longer than the 30s staleness bound — so the poll loop refreshes the marker on its own cadence,
  independent of action progress. A refresh that only fired between actions would let the hold go
  stale mid-`Recruitment` and hand the slot back, producing hold/re-grab thrash (review S1's genuinely
  uncovered risk).

### 5. `resolveSlotHold` is the safety boundary, and it fails OPEN

The marker is written by a program that can crash. **Every failure mode resolves to *not held*:**

| Input | Result | `holdReason` |
|---|---|---|
| file absent / empty | not held | `"no-marker"` |
| unparseable JSON | not held | `"unparseable"` |
| missing / non-numeric `ts` | not held | `"no-timestamp"` |
| `nowMs - ts > SLOT_HOLD_MAX_AGE_MS` | not held | `"stale"` |
| `ts - nowMs > SLOT_HOLD_FUTURE_TOLERANCE_MS` | not held | `"future-timestamp"` |
| fresh and well-formed | **held** | `"held"` |

**`SLOT_HOLD_MAX_AGE_MS = 30_000`** — three engine heartbeats and three augfarmer polls. Worst case
for a crashed engine: **≤30s of lost rep grinding**, self-healing, no operator action. This is the
`resourcemanager.js` stale-reservation pattern (*"treating as no reservation until it recovers"*) —
**not** the `cloud-upgrade-off.txt` presence check, which is hand-placed and has no writer to crash.
**This is the phase's one safety-critical requirement.**

### 6. Overhead goes in the gaps; contested time goes to rank *(features D10, tightened by S5)*

`classifyWindow(augState, nowMs)` returns `free` | `contested`:

- **`free`** only when augfarmer emits **no faction-work action at all**: `phase` ∈
  {`spend-down`, `installing`, `paused`, `idle-plateau`}.
- **`contested`** for everything else — **including `awaiting-money` with `workTarget.deficit === 0`**
  (⚠️ review S5: rep still accrues toward the head/NFG tail there, so calling it free would
  under-report `repForegone`, the exact failure D7/D10 exist to prevent) — and including
  `grinding`, `yielded`, `gate-fill`, `install-ready`, `awaiting-invite`, any unrecognised phase,
  and a missing/unparseable/stale state file.
- **`AUG_STATE_FRESH_MS = 60_000`.** Beyond that, classification is `contested` regardless of
  content. ⚠️ **Known limitation:** `augfarmer-state.json`'s write gate (`:2963-2973`) fires on
  first-launch / 5-min heartbeat / a buy / `awaitingMoneySinceChanged` / `triggerArmChanged`, and
  its `plan.phase !== previousPhase` term is a **documented dead OR-term** (BACKLOG), so phase
  transitions are *not* reliably persisted promptly. **Consequence: free windows will be
  under-detected, not over-detected.** That is the safe direction — the engine holds contested time
  it could have had for free, costing throughput, never the reverse. Fixing the dead term is
  explicitly out of scope (BACKLOG notes it changes write cadence for every consumer).

In free windows the engine runs zero-rank overhead (`Recruitment`, `Diplomacy`,
`Hyperbolic Regeneration Chamber`). In contested windows it runs **rank-producing actions only**.
**`Training` is never routine upkeep** (features D10: combat stats are wiped by every install while
rank and skill points survive; effective combat is bought via `Reaper`/`Evasive System` instead).
`Field Analysis` is rare, not the ~50 accidental reps of the 7/30 trial.

### 7. Failure cost is priced, not hand-waved *(review S2)*

`pickRankAction` must not rank on expected rank alone — the 7/30 trial's Raid grinding was
**2 successes / 22 failures**, and hospitalization cost **$229.5m** against a node where money binds
the aug ratchet.

- **EV includes rank loss** (already in `expectedRankPerSec`).
- **Hard HP guard:** below `HP_FLOOR_FRACTION = 0.5` of max, the engine runs
  `Hyperbolic Regeneration Chamber` instead of any HP-risking action, in **either** window type.
  (`Investigation` is the only action documented to cost no HP on failure and is exempt.)
- **Money discount:** candidates are ranked on
  `expectedRankPerSec − (1 − pMin) × HOSPITALIZATION_COST_ESTIMATE / actionSeconds / RANK_MONEY_EXCHANGE`,
  with `HOSPITALIZATION_COST_ESTIMATE` seeded at **$10.4m** (the measured $229.5m ÷ 22) and refreshed
  live from the panel-equivalent API values. `RANK_MONEY_EXCHANGE` is a declared, logged constant so
  the trade-off is visible and tunable rather than implicit.

### 8. One denominator for "realized rate", and ETA reported two ways *(blocker B5)*

The bars are wall-clock; the naive measurement was per-held-second; those differ by `1/dutyCycle`.

**Definitions, fixed here:**
- `heldSec` — **all** engine-held slot seconds, including zero-rank overhead. (Excluding overhead
  would flatter the rate by exactly the amount features D10 says is material.)
- `rankPerHeldSec = rankGained / heldSec` — *efficiency*.
- `rankPerWallSec = rankGained / engineUptimeSec` — *actual throughput*.
- `etaCurrentDuty = (400000 − rank) / rankPerWallSec` — what the current co-existing deployment
  achieves.
- `etaFullDuty = (400000 − rank) / rankPerHeldSec` — what a **dedicated** deployment would achieve.

**Checkpoint bars apply to `etaFullDuty`**, because the phase's question is *"is the mechanic
viable"*, not *"is it viable while also running the ratchet at 75% priority."* Both numbers are
logged; the 7/30 baseline (0.0144) is restated as `rankPerHeldSec`, which is what it actually was
(the trial held the slot continuously).

### 9. D8's stopping condition, re-derived *(blocker B6)*

- 400,000 rank ÷ 3 weeks (1.814×10⁶ s) ⇒ **0.2205 rank/held-sec**
- 400,000 rank ÷ 1 month (2.592×10⁶ s) ⇒ **0.1543 rank/held-sec**
- 7/30 baseline: **0.0144 rank/held-sec**

| Checkpoint | When | Bar | On a miss |
|---|---|---|---|
| **A — smoke test, NOT a viability test** | ~24h uptime | `rankPerHeldSec` ≥ **0.043** (3× baseline) | Stop and diagnose before burning a week. ⚠️ At 24h the engine has ~1,200 rank ⇒ ~400 SP, nowhere near `Overclock` 90, so this **cannot** measure viability. Inspect, in order: duty cycle, success rate, SP spend rate, hospitalization rate. |
| **B — the viability bar** | ~1 week | `etaFullDuty` ≤ **1 month** (i.e. `rankPerHeldSec` ≥ 0.1543) | **Declare Bladeburner non-viable** for BN6 *and* the counter-map's back half; re-derive `docs/bitnodes.md`'s node order without it. |

The first draft's second clause ("a fitted trend crossing 0.2205 before rank 20,000") is **deleted**
— no estimator, window, or fit criterion was specified, so two reviewers would compute different
answers to a question that retires a four-node strategy. **Default if never revisited: non-viable.**
Checkpoint B is a close-out deliverable, not a merge blocker (precedent: Phase 35's V3).

### 10. Ship in two slices; Slice A validates before Slice B is written

WI1 touches the most safety-critical script in the repo for an experiment's benefit. **Slice A =
WI1. Slice B = WI2–WI4.** A failure in Slice A's live validation stops the phase with no engine code
written.

---

## Design

### Work item 1 — `augfarmer.js` cooperative slot hold [code] *(Slice A)*

**New exported pure function:**

```js
export function resolveSlotHold(raw, nowMs,
                                maxAgeMs = SLOT_HOLD_MAX_AGE_MS,
                                futureToleranceMs = SLOT_HOLD_FUTURE_TOLERANCE_MS)
// -> { holdActive: boolean, holdReason: string, holderName: string|null, holdAgeMs: number|null }
```
Per decision 5's table; fails open on every malformed input.

**`planPass` gains one destructured parameter**, `slotHold`, defaulting to `{ holdActive: false }`
so every existing call site and fixture is unaffected:

- **Fallthrough site (`:1873`)** — when `holdActive`, do **not** push the `work` action; return the
  phase the pass would otherwise have produced (decision 1). ⚠️ **The `yield` action is still
  emitted when the slot is genuinely unavailable** (`slotAvailable().available === false`); a hold
  and a foreign work type are independent conditions and both are reported.
- **`target.fundBlocked` branch (`:1829-1840`)** — same suppression. ⚠️ **Corrected (review S4):** the
  first draft called this "the rep-met/grind site". It is the **fundBlocked** branch. The actual
  rep-met branch (`:1846-1854`) emits no work action and needs no change.
- Everything else — `join`, `travel`, `buy`, `donate`, reserves, install sequencing — untouched.
  **The hold is advisory for rep grinding only.**

**Main loop:** read `SLOT_HOLD_FILE` via `ns.read` (0 GB) each pass; resolve; pass into `planPass`.
**Do not modify the rate-sampling block** (decision 2). Write
`slotHold: { holdActive, holderName, holdAgeMs, holdReason }` into `augfarmer-state.json`, and
**add `slotHoldChanged` to the write gate at `:2973`** — the exact precedent of
`awaitingMoneySinceChanged` and Phase 36's `triggerArmChanged`, both added because a 5-minute
heartbeat is too slow for a field a consumer depends on (blocker B8). Log transition-only lines on
acquire/release (the `"yielded"` precedent at `:2948-2953`), never per-poll.

### Work item 2 — `bladeburnermanager.js` [code] *(Slice B)*

Headless resident, `gangmanager.js` mould.

- **Gating:** exits immediately when `inBladeburner()` is false (supervisor-filtered, WI4).
- **Off-marker (`bladeburner-off.txt`) — blocker B9:** **idles in-loop**, matching
  `cloudmanager.js:195-202` / `gangmanager.js:525`; it does **not** exit, because the supervisor is
  gated only on `inBladeburner()` and an exiting script would be relaunched every
  `SUPERVISOR_RETRY_MS` forever — the 110-attempt / 9.1h flood WI4 exists to prevent. The off path
  **stops the Bladeburner action, deletes the hold marker**, and writes state with `off: true`.
- **`ns.atExit`** → `stopBladeburnerAction()` + delete the marker. ⚠️ **Corrected (review S1):** the
  first draft called this "the phase's second safety-critical requirement" and justified it by
  claiming an orphaned action "keeps stealing the slot with nothing alive to re-assert." **That was
  wrong** — augfarmer reads a running Bladeburner action as `slotAvailable(null,…) → available:true`
  (`:711-712`) and re-grabs within one poll, killing the orphan in ≤10s. `atExit` is **hygiene**
  (avoids thrash, keeps the measurement clean), and is unreliable on kill-all/install paths anyway;
  **decision 5's staleness guard is the real backstop.**

**Exported pure functions (the testable surface):**

| Function | Responsibility |
|---|---|
| `expectedRankPerSec(action)` | `(pMin·rankGain − (1−pMin)·rankLoss) / (timeMs/1000)` |
| `pickRankAction(candidates, opts)` | decision 7 — EV **minus** priced failure cost, with the HP guard |
| `planSkillBuy(skillLevels, points, costs, policy)` | `Overclock` → `Blade's Intuition` → `Digital Observer`/`Tracer` → `Reaper`/`Evasive System`; **never** `Hands of Midas`/`Hyperdrive`/`Cyber's Edge`/`Datamancer` |
| `shouldRotateCity(chaosByCity, cityName, threshold)` | rotation decision |
| `classifyWindow(augState, nowMs)` | decision 6, incl. staleness and conservative default |
| `higherPriorityClaimant(processList)` | decision 3 |
| `computeRealizedRates(samples, windows, nowMs)` | decision 8's four numbers *(blocker B7)* |
| `computeDutyCycle(samples, windows)` | rank-producing vs overhead vs unheld |
| `computeRepForegone(contestedHeldSec, repRatePerSec)` | the experiment's price |
| `projectRankEta(rankNow, target, ratePerSec)` | checkpoint arithmetic |

⚠️ The **SP cost curve is unpublished** (only point values via `getSkillUpgradeCost`), so
`planSkillBuy` takes live costs as an argument and applies a marginal rule rather than assuming a
closed form. The engine logs the full cost vector on every buy so the curve is recoverable.

**Loop:** `await ns.bladeburner.nextUpdate()` (0 GB) as the tick; marker refreshed every
`BB_POLL_MS` **independent of action progress** (decision 4); completion detected via
`getActionCurrentTime()` **wrapping**, never by waiting for `getCurrentAction()` to go `null`
(reference §6/§7 gotcha 13 — `startAction` auto-repeats).

### Work item 3 — instrumentation [code] *(Slice B)*

`bladeburner-state.json` (overwrite-in-place) + `bladeburner-log.json` (ring-capped), **plus
`vite.config.ts` filter entries for both** (⚠️ a missing entry silently strands output — the 7/30
finding).

Carries: `rankPerHeldSec` / `rankPerWallSec` / `etaCurrentDuty` / `etaFullDuty` over rolling
1h/24h/cumulative windows; per-city chaos series and rotation events; skill levels with the live
cost vector at each buy; duty cycle (rank vs overhead vs unheld); `repForegone`; hospitalization
count/cost deltas; `heldFraction` (decision 2's audit trail); and both checkpoint bars.

### Work item 4 — supervisor gating [code] *(Slice B)*

- `bladeburnermanager.js` added to `RESIDENT_COMPANIONS`, plus a startup `launchDetached` alongside
  the gang precedent (`daemon.js:739-747`) so it doesn't wait up to 60s for the first supervisor
  check *(review S6)*.
- **`BLADEBURNER_GATED_COMPANIONS`** mirroring `GANG_GATED_COMPANIONS` (`:158`).
- **`supervisedResidents` gains a third parameter** — `supervisedResidents(residents, hasGang,
  hasBladeburner = true)` — defaulting to `true` so the existing two-arg call sites and tests are
  behaviour-identical *(review S6, and the "no behavioural supersession" rule)*.
- ⚠️ **`inBladeburner()` is wrapped in try/catch** at the daemon call site *(review S7)*:
  `bladeburner-reference.md` gotcha 11 claims the whole API throws pre-join *including 0 GB
  methods*, while §6 records `inBladeburner()` returning `false` live pre-join. The reference
  contradicts itself and the supervisor loop is not where that should be discovered. Throw ⇒ treat
  as `false`.

---

## Tests [code]

**`test/augfarmer.test.js` (Slice A):**

- `resolveSlotHold`: one case per decision-5 row — absent, empty, unparseable, missing `ts`,
  non-numeric `ts`, exactly at `maxAgeMs`, one ms past, future beyond tolerance, future within
  tolerance, fresh-and-valid.
- **T-SAFE (the phase's safety test):** a marker `maxAgeMs + 1` old ⇒ `holdActive: false`. This
  assertion stands between a crashed engine and a stalled win path.
- `planPass` with `holdActive: true`: emits **no** `work` action, and **`phase` is asserted equal to
  the same fixture run with the hold absent** — equality against the no-hold run, never a hard-coded
  string, so the test cannot drift into blessing a phase change. ⚠️ **Fixtures must include** the
  donation-eligible/money-blocked path (`:1860-1871`, `awaiting-money` falling through to the slot
  logic) and a non-null `currentWork` case (the `yielded` branch, `:1874-1876`) *(review minor)*.
- `planPass` with a hold still emits `join`/`travel`/`buy`/`donate` and an identical `reserve`.
- `planPass` called **without** `slotHold` behaves exactly as before (default-parameter test).

**`test/bladeburnermanager.test.js` (Slice B, new):** `expectedRankPerSec` sign handling;
`pickRankAction` — prefers lower failure cost at equal EV, **and** respects the HP guard;
`planSkillBuy` — priority order, affordability, never buys the four excluded skills;
`classifyWindow` — a case per phase string **plus** stale, missing, and unparseable state, all
defaulting to `contested`; `higherPriorityClaimant` — each of the three scripts and the empty case;
`computeRealizedRates` / `computeDutyCycle` / `computeRepForegone` — including zero-held and
zero-uptime edge cases; `shouldRotateCity`; `projectRankEta` with zero/negative rate.

**`npm run verify:log` *(blocker B7)*:** add a `test/verify-bladeburner.test.js` asserting
`bladeburner-state.json` exists once the engine has run, carries the decision-8 fields, and that
`rankPerHeldSec`/`rankPerWallSec` are finite and non-negative. Without it T2 passes identically
whether the file holds correct numbers, wrong numbers, or does not exist.

## Live procedure [live]

**Slice A:** **L1** deploy WI1 with no engine and no marker — augfarmer behaves identically
(`slotHold.holdActive: false`, rep grinding continues, install trigger unaffected). **L2** hand-write
`bladeburner-slot-hold.json` per the marker contract with a fresh `ts`; confirm rep work stops,
`slotHold` populates **promptly** (the write-gate term), `phase` unchanged, `ramcheck.js` flat.
**L3** stop refreshing it; confirm rep work **auto-resumes within ~30s**, no operator action —
decision 5 proven live, not just in vitest.

**Slice B:** **L4** engine up; confirm slice acquire/release, augfarmer resumes between slices,
`repForegone` accrues, **and decision 3 holds — run `backdoorfactions.js` concurrently and confirm
the engine stands down** *(blocker B4)*. **L5** kill `bladeburnermanager.js` mid-action; confirm
`atExit` cleanup and augfarmer recovery. **L6** 24h → checkpoint A. **L7** ~1 week → checkpoint B
(close-out). ⚠️ **L4 also measures `switchCity`'s cost/interruption** (open question 1).

## Acceptance criteria

Test-gated (Claude clears): **T1** `npm test` green including T-SAFE, no existing fixture's expected
value changed. **T2** `npm run verify:log` green **including the new `verify-bladeburner` checks**.

RAM-gated [live]: **R1** `augfarmer.js` unchanged vs baseline. **R2** `daemon.js` re-measured, delta
explained.

Live-gated [live]: **V1** = L1+L2 (hold works, phase unchanged, `slotHold` prompt). **V2** = L3
(**staleness auto-recovery** — the safety criterion). **V3** = L4 (slices + **claimant stand-down**).
**V4** = L6 checkpoint A. **V5** = L7 checkpoint B — close-out deliverable carrying decision 9's
non-viable default.

**Ship gate:** T1/T2 self-cleared; **Slice A merges on R1+V1+V2**; **Slice B is not written until
Slice A is live-green** (decision 10).

## Files touched

- `src/augfarmer.js` — `resolveSlotHold`, `SLOT_HOLD_FILE`, `SLOT_HOLD_MAX_AGE_MS`,
  `SLOT_HOLD_FUTURE_TOLERANCE_MS`, `planPass` parameter + two suppression sites, `slotHold` state
  field, `slotHoldChanged` write-gate term, transition logging. **Rate-sampling block untouched.**
- `src/bladeburnermanager.js` (new); `bladeburner-off.txt` convention
- `src/daemon.js` — `RESIDENT_COMPANIONS`, `BLADEBURNER_GATED_COMPANIONS`, `supervisedResidents`
  third param, guarded `inBladeburner()`, startup launch
- `vite.config.ts` — filters for `bladeburner-state.json`, `bladeburner-log.json`
- `test/augfarmer.test.js`, `test/bladeburnermanager.test.js` (new),
  `test/verify-bladeburner.test.js` (new)
- `BACKLOG.md` / `docs/phases/CHANGELOG.md` / phase-doc graduation at ship;
  `docs/bladeburner-reference.md` gains newly measured mechanics (SP cost curve, `switchCity` cost)

## Open questions (log, don't block)

1. **`switchCity` cost/interruption unmeasured** (reference §8). `shouldRotateCity` is built in
   Slice B before the measurement lands at L4; if it interrupts the running action, rotation cadence
   needs rework. Logged risk, accepted.
2. **Should the engine ever refuse to release a slice** when augfarmer's deficit is urgent? Spec says
   no — augfarmer always wins on re-assert. Revisit if holds are observed to delay an install.
3. **Dashboard indicator for an active hold** — deliberately not built (Phase 24 gate). `slotHold` in
   the state file is the mitigation. Raise as a brainstorm item if a silent hold ever causes a
   diagnostic detour.
4. **Bonus time** (`getBonusTime`, 5× spend) unmodelled; with sleep disabled it may never accrue.
5. **`repForegone` uses augfarmer's observed rep/sec**, which is itself depressed while held
   (decision 2). It is therefore a slight **under**-estimate of the true price. Noted so it isn't
   mistaken for exact.
6. **`augfarmer-state.json`'s dead `plan.phase !== previousPhase` write-gate term** (BACKLOG) is why
   free windows are under-detected (decision 6). Fixing it is out of scope here but would directly
   improve this engine's throughput — worth pairing with whatever phase finally addresses it.
