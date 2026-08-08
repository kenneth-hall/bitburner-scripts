# Phase 39 spec: Bladeburner as the primary win path

**Stage:** spec (Stage 2), drafted 2026-08-02 from `phase-39-bladeburner-primary.features.md`.
**Model flow:** brainstorm (opus) → this spec (fable) → cold `spec-reviewer` pass → implement (sonnet).
**Branch:** `phase-38-slice-b` is currently checked out and the dev server watches this checkout — **do
not switch branches while the game is connected** (CLAUDE.md). Implementation branches off whatever
`master` looks like at implementation time; the branch choreography is an implementation-time
decision, not a spec one.
**Supersedes:** Phase 38's *architecture* (`docs/phases/phase-38-bladeburner-engine.spec.md`). Reuses
its slot-hold contract, its file/log plumbing, and its dashboard panel.

**Read first:** `phase-39-bladeburner-primary.features.md` (the decisions D1–D11a and the open
questions Q1–Q11 — this spec assumes them and does not re-argue them),
`docs/bladeburner-reference.md` (the interface: §5 mechanics, §6 API semantics, §7 gotchas),
`docs/bn6-playbook.md` §1.0–1.1 (the node-level bet and its tripwire).

**What ships:** a rebuilt `src/bladeburnermanager.js` (investment controller + correct wall-clock
telemetry + two hard safety gates), a new attempt-ledger log, `vite.config.ts` filter entries, a
re-pointed `dashboard.js` `BLADEBURNER` panel, vitest coverage for every new pure function, and the
doc reconciliations. **No new live probes.** No source code is written by this document.

---

## Revision 2 (2026-08-03) — cold-review blocker fixes, index

The `spec-reviewer` cold pass returned **12 blockers** plus 2 lower-severity items. Each is fixed at
the section named below, and each fixed section carries an inline `(fixes reviewer blocker N)` marker
so this table can be verified rather than trusted. **Nothing in this revision relaxes the two
engine-level gates** (S4's Overclock hold on Q10, S5's Stage-B gate on Q11) — several fixes make them
*structurally* harder to open than the previous draft did.

| # | Blocker | Fixed in |
|---|---|---|
| 1 | `buildCandidates` asked to be both the safety gate and C2's ungated scoring source | **S5.1** (new) + WI3's rewired table + Tests |
| 2 | Rep-starvation detector could never fire (rate is `null` in the starved state; wrong `deficit` field; no clear condition) | **S3** (rewritten) |
| 3 | `REP_YIELD_SLICE_MS` 600 s exceeded `MAX_REP_YIELD_DUTY`'s 540 s/hour | **S2.3** (new) |
| 4 | C2 ambiguous across scoring modes; undefined behaviour when C2 fires while gated shut | **S14.1 / S14.2** (new) |
| 5 | C3's 0.35 bar unreachable while gated ⇒ guaranteed "miss", untestable | **S14.3** (new) — C3 split into C3-A / C3-B |
| 6 | S11's unconditional 15 s re-trigger prevents recovery actions from ever completing | **S11** (inverted to idle-conditioned) |
| 7 | The yield mechanism itself unspecified; two signals conflated across claimants | **S2.1 / S2.2** (new) |
| 8 | Fixed 180 s reclaim can livelock against a legitimately-longer claimant | **S2.4** (new) — escalating budget + fairness floor + WARN |
| 9 | Hospitalisation assumed detectable; the API exposes no getter | **S9** (inference rule + panel as authority) |
| 10 | `dutyCycle === 1 && rankGained === 0` misfires on states this spec designs for | **Tests → `verify-bladeburner.test.js`** (qualified assertion) |
| 11 | Unverified stamina-penalty premise locked into a hard-failing unit test | **S8** (marked unverified) + **Q12** (offline settlement) |
| 12 | No post-install regime, though the ratchet installs freely and max HP collapses 27 → 10 | **S9a** (new) |
| (a) | Dangling "S11 names the permitted edits" cross-reference | **Ground rules** + S16.18 |
| (b) | "No existing fixture's expected value changes" contradicted by two required test edits | **T1** (four named exceptions) |

⚠️ **One judgment call inside these fixes is a node-level decision, not an engine one, and is
flagged rather than made unilaterally: S14.2's step 2** — what to do if the Q11 go-ahead is declined
after C2 fires. This spec's default is *revert to batcher-primary*, following
`docs/bn6-playbook.md` §1.1's existing tripwire, because that is the standing decision rather than a
new one. If Kenneth wants a different branch (e.g. grind Stage A indefinitely, or open Stage B on a
conservative HP budget without a measured Q11), that reverses a recorded default and should be said
explicitly.

---

## Context — the four things this spec exists to get right

1. **We have never measured a correctly-tuned Bladeburner engine.** Phase 38's engine was mis-tuned
   three ways and its telemetry reported `rankGained: 0` / `dutyCycle: 1` while live rank moved
   1,217 → 1,221. **No rank rate produced by Phase 38 is evidence.** D9's telemetry rebuild is
   therefore foundational: it is work item 1, not a polish pass, and every checkpoint in this spec is
   computed from it.
2. **There is an undiagnosed engine-level bug in the game's own `startAction`.**
   `startAction("Contracts","Tracking")` and `startAction("Operations","Raid")` both return `true`
   while `getCurrentAction()` reads `null` for the whole observation window and zero successes
   accrue; `startAction("Operations","Investigation")` does **not** show this (ran clean for a full
   100 s in the same session, with the slot fully quiesced). **Cause unknown.** This spec does not
   assume a cause and does not design around a guessed one — it makes the engine *detect, survive,
   and instrument* the failure (S6).
3. **Two open questions are UNRESOLVED, and each gates a large irreversible-ish commitment.**
   Q10 (is stamina spent per action or per second?) gates **Overclock**, a 16,908-rank spend. Q11
   (HP cost per failed operation) gates the **Stage A → Stage B tier switch**. Both were attempted
   live on 2026-08-02 and came back with **zero usable data**. The engine must hold both closed
   behind explicit constants (S4, S5) that a future session flips *after* an answer exists, not
   before.
4. **Live experimentation is capped.** Kenneth's instruction (2026-08-02 ~9:30pm): *"this is the last
   round of live testing to run without asking again."* This spec therefore proposes **no probe
   scripts and no live experiments**. Everything it needs measured, it measures **passively, as a
   by-product of the engine running** (the attempt ledger, S7). Anything that genuinely needs a
   dedicated experiment is named in "Open questions carried forward" as future work with a trigger.

### What Phase 39 is *for*, restated so the engine optimises the right thing

Stage A (contracts) is **not** the win path — it is the financing round that banks rank → skill
points so Stage B (operations) becomes possible. Phase 38's central error was optimising Stage A's
rank rate as if it were the goal. Contracts top out at **82.6 days even at a perfect 100% success
rate**; every viable path runs through operations (Raid pays ~110× Tracking per success). ⚠️ **If C2
(the Stage B crossover) is never reached, this phase has failed regardless of what C1 reads.**

---

## Ground rules

- **CLAUDE.md conventions apply in full.** In particular:
  - **Identifier hygiene.** The RAM analyzer bills on *names*, including DOM/Node globals (Phase 38
    lost +25 GB to a local named `window`). New identifiers are pre-screened in S15; none may alias
    an `ns.*` method reachable from any namespace (`ns`, `ns.ui`, `ns.cloud`, `ns.singularity`,
    `ns.formulas`, `ns.bladeburner`, …) or a browser global. Where a JSON field name must collide for
    schema reasons, access it with bracket notation.
  - **Import bleed.** `bladeburnermanager.js` imports only from `common.js` (pure/cheap). It must not
    import from `augfarmer.js`, `daemon.js`, or `scheduler.js` — cross-script constants that need to
    agree (`SLOT_HOLD_FILE` and friends) stay duplicated by convention, exactly as they are today.
  - **No Singularity calls in this engine, at all.** Every cross-script signal it needs
    (augfarmer's phase, rep rate, backdoor activity) is read from an already-exported **state file**
    via `ns.read` (0 GB). This is unchanged from Phase 38 and is load-bearing for RAM.
  - **Observability is files, not popups.** New observations go to log files with a
    `vite.config.ts` filter entry (⚠️ a missing entry silently strands output). The existing
    `BLADEBURNER` dashboard panel is re-pointed at the corrected fields — that is maintenance of an
    already-approved panel, **not** new dashboard space, and no new panel is added.
- **The engine spends no money through any API.** It loses money indirectly via hospitalisation
  (81 events / **$837.4m** to date); S9 bounds and reports that.
- **Loop-inline logic is untestable.** Every behaviour an acceptance criterion depends on is an
  exported pure function with vitest coverage. This is inherited from Phase 38's ground rules and is
  why that phase's bugs were findable at all.
- **No behavioural supersession in existing tests.** Phase 38's pure functions that survive
  (`expectedRankPerSec`, `updateStaminaRecovering`, `updateHpRecovering`, `higherPriorityClaimant`,
  `classifyBackdoorActivity`, `pruneSamples`, `seedTotals`, …) keep their existing tests. Changing an
  existing fixture's *expected value* is stop-and-re-derive, not an edit.
- **RAM is re-measured, never assumed.** `bladeburnermanager.js` measured **70.00 GB** at Phase 38
  close (61.00 before the `getCurrentAction()` addition). Band for this phase: **65–85 GB**; a
  reading outside it stops and is checked against the identifier-hygiene bug class *first*.
- **`augfarmer.js`, `backdoorfactions.js`, `daemon.js` are not edited by this phase at all.** *(fixes
  reviewer low-severity item (a) — an earlier draft pointed at "the edits S11 names explicitly"; S11
  is about General-action re-triggering and names no such edits, so the cross-reference was dangling.)*
  Zero edits to those three files is the actual position — see **Files touched → Deliberately
  untouched** for the per-file reason. Their RAM is re-measured in L1 purely to prove they were not
  touched, not because a change is expected. If implementation discovers an edit to one of them is
  genuinely unavoidable, that is a **stop-and-return-to-spec**, not an in-flight decision.

---

## Spec-stage decisions

### S1 — Telemetry is rebuilt first and everything else is computed from it *(D9)*

Phase 38's rate machinery is retained in **shape** (a totals accumulator persisted across restarts, a
pruned sample ring for finite windows) and corrected in **substance**. Definitions, fixed here:

| Name | Definition |
|---|---|
| `wallSec` | wall-clock seconds since engine start, accumulated in `totals` and **persisted** across restarts (augfarmer's installs killed and relaunched the engine 6× in 27h — an in-memory total cannot survive a 24h window, let alone a week) |
| `actionSec` | wall-clock seconds during which `getCurrentAction()` was **non-null and equal to the action the engine intended** — i.e. verified-running time, not intended time |
| `rankGained` | `getRank()` endpoint delta over the window, sampled every tick. **Never** derived from per-action bookkeeping |
| `rankPerWallSec` | `rankGained / wallSec` — **the checkpoint denominator** |
| `dutyCycle` | `actionSec / wallSec` — real duty, not intent |
| `rankProducingSec` | subset of `actionSec` spent on Contracts/Operations (not General overhead) |

🔴 **The single rule that would have caught every Phase 38 telemetry bug:** *no field may be derived
from the engine's own intent.* `dutyCycle` comes from `getCurrentAction()`, not from "we called
`startAction`". `rankGained` comes from `getRank()` endpoints, not from summed `getActionRankGain`.
Each such field carries a comment naming this rule.

**Checkpoint bars are stated against `rankPerWallSec`** (features §5), superseding Phase 38's
`rankPerHeldSec` framing, which let a 0%-duty engine report 100% duty.

### S2 — The engine owns the player-action slot; yields are bounded, budgeted, and priced *(D1, D11a)*

Phase 38's unconditional stand-down inverts under primary. The engine holds the slot continuously and
grants **bounded** yields.

#### S2.1 — What a yield mechanically *is* *(fixes reviewer blocker 7, part 1)*

A "yield" is not a mood; it is an exact three-step sequence, and its **ordering is the whole safety
property**. `slotconflictprobe.js` (2026-08-02 9pm) confirmed **mutual preemption is real** —
`bbCancelledWork: true` *and* `augKilledBb: true` in the same run — and it happened precisely because
neither side held `bladeburner-slot-hold.json` at the moment of the handover. The two orderings below
are inverses of each other and neither may be reordered:

**Granting a yield (engine → claimant):**
1. `ns.bladeburner.stopBladeburnerAction()` — our action stops **first**.
2. `releaseSlotHold(ns)` — `ns.rm("bladeburner-slot-hold.json")`, **second**. `augfarmer.js`'s
   `resolveSlotHold` then reads `no-marker` ⇒ `holdActive: false` and its `work` action is re-enabled
   on its next 10 s poll.
3. Set `yieldedTo = { claimant, sinceMs, budgetMs }`, log a `yield-grant` event, and keep polling
   (telemetry, marker-free) **without starting any action** until the grant ends.

**Reclaiming (claimant → engine):**
1. `writeSlotHold(ns)` — the marker goes back **first**, so augfarmer sees `holdActive: true` and
   suppresses its next `work` action *before* we compete for the slot.
2. Wait one full poll (`BB_POLL_MS`, 10 s ≥ augfarmer's own poll) so the suppression has actually
   been observed. This one-poll gap is the mutual-preemption fix; skipping it re-opens the exact
   window the probe caught.
3. `startAction(...)`, then S6's verification on the next tick.

**Interaction with a claimant that is mid-action** is asymmetric and that asymmetry is deliberate:
the engine only ever stops **its own** action. It never calls anything that interrupts another
claimant. On reclaim we simply take the slot; the game decides the rest. The consequence per claimant
is already known and acceptable — `workForFaction` is resumed by augfarmer on its next poll with no
lost rep, and an interrupted `installBackdoor()` retries next poll with identical recovery cost
(recorded in `classifyBackdoorActivity`'s doc comment, re-examined 2026-08-01).

#### S2.2 — Which signal governs which claimant *(fixes reviewer blocker 7, part 2)*

Two signals exist and they are **not interchangeable**; an earlier draft used them loosely. Both are
already implemented and correct — this table only pins which applies where:

| Signal | Mechanism | Why |
|---|---|---|
| **Presence** | `higherPriorityClaimant(ns.ps("home"))` — is the script resident at all | Necessary condition. A non-running script cannot need the slot |
| **Marker** | `classifyBackdoorActivity(readJsonState(ns, BACKDOOR_ACTIVITY_FILES[name]), nowMs)` — the claimant's own `active` flag, fresh | Sufficiency condition. Both backdoor scripts stay resident for their whole unmet-target lifetime but only need the slot for brief `installBackdoor()` windows |

| Claimant | Governing signal | Policy | Bound |
|---|---|---|---|
| `backdoorfactions.js` | **presence AND marker** — resident *and* `classifyBackdoorActivity(...) === "busy"` | yield | `BACKDOOR_YIELD_MAX_MS = 180_000` per grant, escalating per S2.4 |
| `backdoorwd.js` | **presence AND marker** (⚠️ spec deviation from D1 — see S16.1) | yield | same as above |
| `studybootstrap.js` | **presence only** — it has no marker file and never will (one-shot, never resident, so the marker refinement buys it nothing) | yield while present | `STUDY_YIELD_MAX_MS = 300_000` |
| `augfarmer.js` faction work (`workForFaction`) | **neither** — augfarmer never asserts a claim. The slot-hold contract is strictly one-way (it *reads* our marker; it writes nothing we read). Its yield is driven **only** by S3's detector reading `augfarmer-state.json` | yield only while the rep-starvation detector is fired | `REP_YIELD_SLICE_MS`, capped by `MAX_REP_YIELD_DUTY` — see S2.3 |

⚠️ **Marker write ordering is unchanged and still load-bearing:** outside a yield, the engine
writes/refreshes `bladeburner-slot-hold.json` **before** calling `startAction`, never after, and
refreshes on the poll cadence independent of action progress.

#### S2.3 — The rep-yield budget: the cap binds, the slice is derived from it *(fixes reviewer blocker 3)*

An earlier draft set `REP_YIELD_SLICE_MS = 600_000` against `MAX_REP_YIELD_DUTY = 0.15`
(= 540,000 ms of any rolling hour) — **a single grant already blew the cap**, so the two constants
could never both hold. Resolution:

- **`MAX_REP_YIELD_DUTY = 0.15` is the binding constant.** It is the D11a-vs-win-path trade and it is
  the one a future session will want to tune. Everything else is derived from it.
- **`REP_YIELD_SLICE_MS = 180_000`** (3 min), chosen so that exactly **three** whole slices fill the
  cap: `3 × 180,000 = 540,000 = 0.15 × 3,600,000`. No slice can individually exceed the cap, and the
  cap is reachable without a partial grant.
- The engine keeps a rolling-hour ledger of granted rep-yield milliseconds. **A slice is refused if
  granting it in full would exceed the cap** — grants are all-or-nothing, never truncated, so a
  3-minute faction-work window is never shortened into uselessness. The refusal is logged
  (`yield-refused`, with the rolling-hour total) so a starved ratchet is visible rather than silent.
- A slice **ends early** if the rep-starvation detector clears (S3) — that returns the slot sooner,
  which is always allowed.

#### S2.4 — Reclaim, overrun, and the anti-livelock escape hatch *(fixes reviewer blocker 8)*

**Reclaim is unconditional at the bound.** A claimant that never clears its marker cannot starve the
win path indefinitely — the failure mode that produced Phase 38's "zero data" state. But a flat,
never-widening 180 s bound applied to a claimant whose real work legitimately takes longer produces a
**livelock**: preempt → claimant retries → preempt → forever, and the thing that starves is
`backdoorfactions.js`, i.e. the faction unlocks feeding the ratchet that funds this entire phase.
That is a silent income failure, so it gets a real escape hatch, not a comment:

- **Escalating budget, per claimant.** Track `overrunStreak[claimant]` — consecutive grants that hit
  the bound with the marker still `busy`. The budget for the next grant to that claimant is
  `BACKDOOR_YIELD_MAX_MS × 2 ** min(overrunStreak, 3)` ⇒ **180 s → 360 s → 720 s → 1,440 s**, capped
  there (`YIELD_BUDGET_ESCALATION_CAP = 4`× doublings excluded; the cap is the 1,440 s rung).
- **The streak resets to 0** on any grant that ends because the claimant cleared its marker within
  budget (a clean grant), or when the claimant's process is no longer present in `ns.ps("home")`.
- **Fairness floor in both directions.** After any overrun-terminated grant, the engine holds the
  slot for at least `MIN_HOLD_AFTER_OVERRUN_MS = 300_000` before granting that claimant again, so the
  escalation can never converge on "the claimant owns the slot". Combined with the cap, worst-case
  steady state is 1,440 s yielded / 300 s held — bad, and therefore loud:
- **At `overrunStreak ≥ 3` the engine emits one WARN naming the claimant** and sets
  `livelockSuspected: { claimant, streak, sinceMs }` in `bladeburner-state.json`. This is a
  stop-and-look signal for a human, not something the engine tries to resolve itself — the correct
  response to "backdoorfactions.js has needed the slot for 24 continuous minutes" is to look at what
  it is actually doing, not to tune a constant.
- Every yield is logged as an **event with its forgone rank**: `yieldSec × rankPerWallSec` at the
  moment of the yield. D11a's fuse burns invisibly without this.

### S3 — Rep-starvation detector *(D11a, D10's residue)*

D5a dissolved the money-split arbitration (S4a), but **not** D11a: the ratchet's faction rep is
earned by `workForFaction`, which needs the slot, and Bladeburner is currently starving it to ~0
(measured 2.5 rep/min against 462.5k for favor). The failure mode is silent — the ratchet just stops
finding affordable augs and the income curve flattens.

🔴 **Two defects in the earlier draft of this section made the detector structurally unable to fire
in the state it exists to detect** *(fixes reviewer blocker 2)*. Both are verified against the live
repo, not inferred:

1. **It read the wrong deficit.** `augfarmer-state.json` carries **two**: `target.deficit` (the head
   *purchase* target — rep already met, so it reads **0** in the current live file) and
   `workTarget.deficit` (the *rep-grind* target — reads **20,653** in the same file). "The head
   target's `deficit > 0`" is the former on a plain reading, which is `0` exactly when the ratchet is
   grinding normally. **The detector reads `workTarget.faction` / `workTarget.deficit`, explicitly
   and by those field names.**
2. **Its only rate signal reports `null`, not `0`, in the starved state.**
   `estimateRepRatePerSec` (`src/bladeburnermanager.js:631`) returns `null` whenever
   `prev.deficit - curr.deficit` is not `> 0` — which is precisely what happens when Bladeburner
   holds the slot and augfarmer earns no rep at all. Combined with the old "missing/stale/unparseable
   ⇒ does not fire" rule, a `null` rate read as "no data" meant the detector could **never** fire.

**Corrected contract.** The rate estimator is split so the two meanings of `null` stop colliding.
`classifyRepProgress(prevAugState, currAugState, dtSec)` — pure, new, in this engine — returns
`{ status: "progressing" | "stalled" | "unknown", ratePerSec: number|null }`:

| Condition | `status` | `ratePerSec` |
|---|---|---|
| both reads present, same `workTarget.aug` + `workTarget.faction`, `dtSec > 0`, deficit **closed** | `"progressing"` | `closed / dtSec` |
| both reads present, same target, `dtSec > 0`, deficit **unchanged or grown** | **`"stalled"`** | `0` |
| either read missing / unparseable / stale (> `AUG_STATE_FRESH_MS`) / `workTarget` absent / target changed between reads / `dtSec ≤ 0` | `"unknown"` | `null` |

`detectRepStarvation(augState, nowMs, priorState)` — pure, reading `augfarmer-state.json` only:

- **Starved condition** (what must hold to accumulate toward firing), all of:
  `phase === "grinding"` **and** `workTarget.deficit > 0` **and** *no measurable rep progress*, where
  "no measurable rep progress" = `status === "stalled"` **or**
  (`status === "progressing"` **and** `ratePerSec < REP_STARVED_RATE = 0.5 rep/sec`).
- **Fires** once the starved condition has held continuously for
  `REP_STARVED_SUSTAIN_MS = 30 min`. A single non-starved sample resets the accumulator.
- **Clear (un-starved) condition** — the earlier draft had none, so once fired it never stopped.
  The detector clears when **any** of:
  - `status === "progressing"` with `ratePerSec ≥ REP_STARVED_CLEAR_RATE = 1.0 rep/sec` sustained for
    `REP_STARVED_CLEAR_MS = 5 min` (the ratchet is visibly moving again — a distinct, higher bar than
    the firing threshold, so the latch cannot flap around a single number, same shape as
    `updateStaminaRecovering`), **or**
  - `workTarget.deficit ≤ 0` or `workTarget` is absent (nothing left to grind for), **or**
  - `phase !== "grinding"` (the ratchet is not asking for rep time at all).
- While fired, the engine grants S2.3's `workForFaction` yield slices, subject to the rolling-hour
  cap. Clearing ends the current slice early.
- **`status === "unknown"` is inert in both directions:** it neither accumulates toward firing nor
  clears an existing fire, and it is logged with its reason. It is not evidence of health *or* of
  starvation, and treating it as either is what the earlier draft got wrong.
- ⚠️ **All five constants are declared provisional** (`REP_STARVED_SUSTAIN_MS`, `REP_STARVED_RATE`,
  `REP_STARVED_CLEAR_RATE`, `REP_STARVED_CLEAR_MS`, `MAX_REP_YIELD_DUTY`) and are written into every
  yield event so they can be re-derived offline from logged data. They are a defensible default, not
  a measurement.

### S4 — Overclock is HELD, in code, behind a two-key gate *(D5, Q10 UNRESOLVED)*

**Q10 is not a hypothesis to code around. It is unanswered after six attempts.** Per-second ⇒
Overclock's 8.3× throughput is real; per-action ⇒ 16,908 rank buys nothing sustained. The engine must
not resolve this by implication.

- `OVERCLOCK_HOLD_LEVEL` stays pinned at the **current live level (17)**. `planSkillBuy` may never
  return an `Overclock` purchase while the current level ≥ the hold level. The existing constant and
  its comment are retained; the comment is updated to say **"UNRESOLVED — not measured, not
  worthless"** (an earlier draft of D5 wrongly recorded Q10 as answered-and-negative).
- **Two keys are required to raise it**, and both are code/doc changes a human makes, never anything
  the engine infers: (a) a recorded answer to Q10 in `docs/bladeburner-reference.md` §8, and (b) an
  edit to `OVERCLOCK_HOLD_LEVEL`. There is no runtime path, no marker file, no threshold that lifts
  it.
- **Consequence, and it is the intended signal:** once BI/DO/Tracer hit their caps, skill points
  accumulate **unspent**. That is not a bug. `bladeburner-state.json` surfaces
  `skillPointsIdle` + `skillPointsIdleSinceMs` precisely so the accumulation is legible as "a
  decision is waiting on Q10", not as a stalled engine.

### S4a — No aug chase, no install freeze *(D5a — implement, do not relitigate)*

Skills beat the entire Bladeburner aug tree by ~2× on effect (BI+DO to L25 = ×2.47 for 3,915 rank,
persisting across installs) at a fraction of the cost, in a currency installs don't reset. Therefore:

- **The engine publishes no `repWindowActive` flag, no install-freeze signal, and no money claim.**
  D8's rep window and D10's money split are **not built**. Q2 is closed, not deferred.
- `augfarmer.js` / `installer.js` are **not modified** to honour any Bladeburner freeze.
- The engine does not read, target, or reason about Bladeburner faction rep beyond logging it as an
  observation.
- **Revisit trigger (logged, not scheduled):** if income ever makes the aug tier trivially affordable
  *and* a natural no-install stretch appears, buy opportunistically — a manual call, not engine
  behaviour.

### S5 — Stage B is gated shut until Q11 is answered *(Q11 UNRESOLVED)*

HP cost per failed **operation** is unmeasured; max HP is **27** and nine failed contracts already
hospitalise. Raid's probe returned **zero attempts**, not safe data.

- `STAGE_B_ENABLED = false`, a module constant.
- `Raid`, `Assassination`, `Sting Operation`, `Undercover Operation`, `Stealth Retirement Operation`
  are **excluded from the candidate pool entirely** while the gate is shut — not merely
  EV-deprioritised. An EV score alone is not a safety property; a scoring change or a success-chance
  swing must not be able to open this gate.
- **Flipping it requires:** a recorded Q11 answer (HP cost per failed operation) *and* a measured HP
  budget showing the guard in S9 can sustain the chosen operation, *and* the code edit. Same
  two-key shape as S4.
- The **crossover computation (Q8) still runs and is still logged while the gate is shut.** The
  engine computes, every cycle, the EV of every operation *as if* it were available, and records when
  the best operation's score exceeds the best contract's. **That logged crossing is checkpoint C2's
  evidence** — so the phase's real go/no-go can be reached without ever having risked HP on an
  unmeasured operation.

#### S5.1 — The build/gate split, stated structurally *(fixes reviewer blocker 1)*

An earlier draft asked one function to do two contradictory things: "`buildCandidates` returns
Contracts only, plus `Investigation`" (the safety gate) *and* "the engine computes the EV of every
operation as if it were available" (C2's evidence), with no named source for the ungated list. That
is not a wording problem — resolving it by having `buildCandidates` re-admit operations "just for
scoring" is exactly how a future EV recalculation quietly reopens a gate that exists to stop
unmeasured HP loss. The split is therefore **structural**, and the three functions are:

| Function | Consumes | Produces | Contract |
|---|---|---|---|
| `buildCandidates(ns)` | `ns` | the **full, ungated pool** — all 3 Contracts + all 6 Operations that pass `getActionCountRemaining(...) >= 1` | Knows nothing about stages. Never consulted directly by any action-starting path. **This is the single source for the ungated list** |
| `applyStageGate(candidates, stageBEnabled)` | the full pool | the pool minus the five gated Operations when `stageBEnabled === false` | Pure, one-line-testable, and **the only filter that gates anything**. `Investigation` is never removed (no HP loss on failure, and the one action empirically observed to actually start) |
| `computeCrossover(candidates, mode)` | the **full, ungated** pool straight from `buildCandidates` | `{ bestContract, bestOperation, operationLeads, firstLeadAtMs }` | Scores gated-out operations deliberately. Returns a **report**, never a candidate an action-starting path can consume |

**The invariant, enforced by construction and by V2's grep:**
`pickRankAction` is called on `applyStageGate(buildCandidates(ns), STAGE_B_ENABLED)` and on nothing
else. There is exactly one call site of `pickRankAction` and exactly one of `startAction` (S6), so
"could a gated operation reach `startAction`?" is answerable by reading two lines, not by reasoning
about a scoring function. `computeCrossover`'s return type contains no field that `startAction`
accepts — it carries `{name, score}` pairs for logging, not candidate objects.

### S6 — The `startAction` no-op is handled as an engine-level fault, not assumed away

The undiagnosed bug (Tracking ✗, Raid ✗, Investigation ✓) is the single largest threat to this phase:
an engine that believes `startAction`'s boolean will report a full duty cycle while doing nothing —
the exact Phase 38 failure, from a new cause.

**Start verification (mandatory, not optional):**

1. Write/refresh the slot-hold marker, then `startAction(type, name)`.
2. On the next tick (`await ns.bladeburner.nextUpdate()`, ~1 s), read `getCurrentAction()`.
3. **Verified** iff it is non-null and its `name` matches (compare on `name` only — `type` is
   returned as an undocumented plain string, reference gotcha 10). Otherwise it is a **start
   failure**, regardless of what the boolean said.
4. Never trust `startAction`'s return value for anything except logging it beside the verification
   result. ⚠️ Reference §7: `true` has been observed across 60 samples with `getCurrentAction()`
   `null` throughout.

**Quarantine:**

- `ACTION_START_FAILURE_LIMIT = 3` consecutive start failures for one action ⇒ quarantine it for
  `ACTION_QUARANTINE_MS = 30 min`; it is removed from the candidate pool and the next-best candidate
  runs. On expiry it gets exactly **one** retry attempt; a failure re-quarantines.
- If **every** rank candidate is quarantined, the engine falls back to the overhead ladder, sets
  `allActionsQuarantined: true` in state, and emits **one** WARN. ⚠️ It must **never** busy-loop
  `startAction` — repeated calls reset action progress and complete nothing (Phase 38's decision-6
  amendment 3 lesson).
- Quarantine state is **not** persisted across restarts (a restart is a legitimate reason to retry).

**Why this is the right shape:** it converts an undiagnosed game bug into (a) bounded degradation
instead of a silent 0%-duty run, and (b) the diagnostic dataset that Q10/Q11 need — for free, with no
live probe. See S7.

### S7 — The attempt ledger is the phase's diagnostic instrument *(D9's "EV predicted vs realised")*

`bladeburner-attempts.json`, ring-capped, one record per **attempt** (a `startAction` call and its
verification outcome) and one per **completion boundary**:

```
{ ts, kind: "start" | "complete" | "start-failure",
  type, name, level, autolevel,
  startActionReturned,          // the boolean, recorded but never trusted
  verified,                     // getCurrentAction() agreed on the next tick
  predicted: { pMin, pMax, rankGain, rankLoss, actionTimeMs,
               evPerSec, evPerAction },   // BOTH objective scores -- see S8
  observed:  { rankDelta, actionSec, successDelta, hpBefore, hpAfter },
  context:   { rank, staminaCurrent, staminaMax, staminaFraction,
               hpFraction, cityName, cityChaos, countRemaining,
               skillLevelsHash, teamSize } }
```

Three things fall out of this ledger with no extra work, and all three are named here so the
implementer does not treat it as "just logging":

1. **The Q10/Q11 diagnosis.** Every start failure is recorded with the full context of the moment.
   The difference between Investigation (works) and Tracking/Raid (no-op) is either in these fields
   or is not in the API at all — and that is a determination a future session can make **from logs**,
   without another live experiment.
2. **EV predicted vs realised.** `predicted.evPerSec` against the realised `rankDelta / actionSec`,
   aggregated per action, is the one field that shows the model drifting from the game.
3. **Offline re-ranking when Q10 lands.** Because **both** `evPerSec` and `evPerAction` are recorded
   for every attempt (S8), the "which objective function is right" question can be re-answered
   against real data by re-sorting the ledger — no re-run required.

### S8 — The objective function is a declared, switchable policy — default unchanged *(D3, D3-OPEN)*

D3-OPEN is genuinely open and the two answers point at opposite actions (per-second ranks Tracking
first; per-action ranks Raid 2× above it, at its *current* 5.3% success chance).

- `OBJECTIVE_MODE = "per-second"` — the **default**, matching current behaviour and the conservative
  reading. `"per-action"` is implemented and selectable in one edit.
- `scoreCandidate(candidate, mode)` returns the mode's score; **both scores are always computed and
  always logged** (S7), so switching modes later is a re-analysis, not a re-measurement.
- **Hard net-negative floor, in both modes:** never start an action with `EV ≤ 0`. Two actions are
  net-negative right now (Stealth Retirement, Assassination); Phase 38 ranked by rank-per-success and
  ground backwards.
- `EV = pMin·rankGain − (1 − pMin)·rankLoss`, where `pMin` is `getActionEstimatedSuccessChance`'s
  first tuple element **used exactly as returned**. The engine applies no stamina correction of its
  own.
- ⚠️ **UNVERIFIED ASSUMPTION, explicitly marked as such** *(fixes reviewer blocker 11)*. An earlier
  draft asserted that the game's returned estimate "is post-penalty" and locked that reading into a
  hard-failing unit test. **There is no evidence for it.** `docs/bladeburner-reference.md` §6 (the
  `getActionEstimatedSuccessChance` row) documents the tuple's shape and units and is silent on
  stamina; §5's closed-form penalty note documents `min(1, fraction/0.5)` from *panel* readings and
  never connects it to the API's return value; and the "what the API genuinely doesn't expose" list
  names "**Stamina**'s precise coupling to success chance" as an open item. So:
  - **What the spec commits to** is a property of *our* code, not of the game: `scoreCandidate` is a
    pure function of the `pMin` it is handed and multiplies it by nothing. That is what the unit test
    asserts — a fixture with a given `pMin` scores identically to hand-computed EV. **No test asserts
    anything about what the game's number means.**
  - **Why this default and not the other:** applying no correction is the status quo (Phase 38's
    behaviour), so the ledger stays comparable to prior data, and it is the *conservative* direction
    for the safety gates — if the returned value turns out to be pre-penalty, EV is over-estimated
    for contracts, which are zero-rank-loss, while every operation that could actually cost us HP is
    gated shut by S5 regardless.
  - **How it gets settled — empirically, offline, with no new probe.** S7's ledger already records
    `predicted.pMin` and `context.staminaFraction` on every attempt. Regress logged `pMin` against
    `staminaFraction` for a **fixed action at a fixed level**: if `pMin` falls roughly as
    `min(1, fraction/0.5)` below 50% stamina, the returned value is post-penalty; if `pMin` is flat
    across the stamina range, it is pre-penalty and the engine has been over-estimating EV in the
    penalty band the whole time. Either answer is recoverable from data the engine produces anyway.
    Carried forward as **Q12**.
- ⚠️ The features doc's rank-per-action table **must not be quoted as a finding.** It is the
  consequence of an unverified premise. The spec carries the *mechanism*, not the ranking.

### S9 — HP and stamina control *(D2, D7, Q9)*

- **Stamina band (D2):** run while `staminaFraction ≥ STAMINA_FLOOR_FRACTION (0.5)`; below it, route
  to `Hyperbolic Regeneration Chamber` and resume at `STAMINA_RESUME_FRACTION`, **lowered from
  Phase 38's 0.8 to 0.55** — the closed-form penalty `min(1, fraction/0.5)` clamps at 1, so every
  second spent resting above 50% is provably wasted wall-clock (~18 min to climb from 0 at the
  measured 2.35/min). The hysteresis latch shape (`updateStaminaRecovering`) is kept: a single
  threshold resumes firing at the level that just failed.
- **Never reach stamina 0.** The game cancels the action and `getCurrentAction()` goes `null`; S6's
  verification catches it, but the floor exists so it does not happen.
- **HP guard (D7):** unchanged in shape (`updateHpRecovering`, floor 0.5, resume 0.85). ⚠️ The floor
  must never become a **trap** — Phase 38's did, by filtering the pool to `Investigation`, which
  cannot restore HP. The guard routes to HRC, which restores 2 HP/min, and the unit tests assert
  that the recovering state always yields an HP-restoring action.
- **Hospitalisation has no getter — it is *inferred*, and labelled as inferred** *(fixes reviewer
  blocker 9)*. An earlier draft assumed hospitalisation events "can be logged and detected". They
  cannot be read: `src/bladeburnermanager.js:812–815` records the finding directly —
  *"Num Times Hospitalized / Money Lost From Hospitalizations are panel-only … no `ns.bladeburner.*`
  getter exposes them"* — and the field is hardcoded `null` today. `docs/bladeburner-reference.md`
  §5 agrees. The spec therefore names an actual detection rule instead of assuming a mechanism:
  - **Inference rule.** The engine already reads `ns.getPlayer().hp` every tick (`{current, max}`).
    A hospitalisation is inferred on a single-tick transition where `hp.current` jumps to `hp.max`
    from a prior sample with `hp.current < hp.max`, **and** the engine's own chosen action on the
    prior tick was **not** `Hyperbolic Regeneration Chamber` (HRC restores ~2 HP/min, which cannot
    produce a full-heal jump in one ~1 s tick). Recorded as `hospitalizationsInferred` (count) plus a
    `hospitalization-inferred` ledger record carrying `hpBefore`, `hpAfter`, the running action, and
    the tick's wall time.
  - **Money-delta correlation is explicitly rejected** as a detection signal: the batcher and the
    ratchet move money constantly and by far larger amounts, so an "unexplained delta" is
    unidentifiable in this save. The inference above uses only HP, which nothing else in the engine's
    view touches discontinuously.
  - **The inferred count is never quoted as authoritative.** It is a *cheap continuous* signal whose
    job is to make the cost legible between panel reads. The **authoritative** figure remains the
    in-game panel's `Num Times Hospitalized` / `Money Lost From Hospitalizations`, read over CDP.
    L2 already opens that panel; it additionally compares the panel's counter against
    `hospitalizationsInferred` and records the drift. If they diverge materially, the inference is
    reported as broken and the count is dropped rather than trusted — Phase 38's durable lesson
    applied to this field specifically.
- **Q9 (rest vs. accept hospitalisation) is NOT resolved here.** `HP_POLICY = "rest"` (current
  behaviour) is the default; `"accept"` (grind through, letting hospitalisation act as a paid instant
  full-HP reset at ~$10.4m) is implemented as the alternative branch but **not enabled**. The ledger
  records HP-blocked seconds either way.
  - ⚠️ **Q9's resolution path is bounded by the previous bullet, and this is a real narrowing.**
    The comparison is *not* "read two logged hospitalisation counts" — that count is inferred. Q9 is
    settled by **two CDP panel reads bracketing each policy period** (`Num Times Hospitalized` and
    `Money Lost From Hospitalizations` at start and end), differenced against
    `rankPerWallSec` / `dutyCycle` over the same window from the state file. That is two manual reads
    per period, not a live experiment, so it stays inside the session cap. If those bracketing reads
    are not taken, **Q9 does not get answered by this phase** — that is stated here rather than
    discovered at close-out.

### S9a — The post-install regime is a first-class state, not noise *(fixes reviewer blocker 12)*

**The earlier draft had no post-install regime at all**, which is a real hole given S4a's own design:
the ratchet installs **freely** and was observed installing **6 times in 27 hours**, killing and
relaunching this engine each time. An install resets combat stats to 1, and
`maxHp = 10 + floor(defense/10)` (`docs/bladeburner-reference.md` §5), so **max HP collapses from 27
to 10** — and max stamina and stamina regen collapse with it, both being agility-scaled. In that
regime the HP floor trips after **far fewer** failures than normal, the duty cycle craters, and the
engine is behaving *correctly* while producing numbers that look like a broken engine. Averaging
C1/C3 straight through those troughs without saying so would have repeated Phase 38's core mistake in
a new place.

**Detection — free, no new RAM.** The engine already reads `ns.getPlayer()` every tick.
`inPostInstallRegime = player.hp.max <= POST_INSTALL_HP_MAX_THRESHOLD (12)`. Max HP only reads that
low immediately after a reset (defense ≤ 20), and it climbs monotonically from Bladeburner action exp
thereafter — measured 1 → 171 defense in 26 h, so the regime is self-limiting and short. `getResetInfo().lastAugReset`
is the more direct signal (`augfarmer.js:2187` uses it) but is **not** adopted here: it adds an `ns`
call to an engine already inside a 65–85 GB band for a signal the free one already gives.

**Policy inside the regime** — the floors do *not* change, the ladder does:

- HP and stamina guards stay **fractional** (`0.5` floor, `0.85` / `0.55` resume). Fractions
  auto-scale to the collapsed maxima, so they become more conservative in absolute HP with no code
  change. Do not add absolute-HP floors; they would be wrong in exactly one of the two regimes.
- While `inPostInstallRegime`, the overhead ladder **prefers `Training`** over rank-producing actions.
  Training costs ~0 stamina (Q6) and grows the combat stats that raise both HP ceiling and stamina
  ceiling — i.e. it buys back the regime's own exit condition. It is **capped at
  `POST_INSTALL_TRAINING_MAX_MS = 30 min` per install** so it can never become an unbounded sink; the
  cap resets when the regime is next entered.
- Every sample and every ledger record carries `regime: "post-install" | "steady"`.

**How the checkpoints treat it — the honest average, plus attribution:**

- **C1 and C3 are computed over the FULL window, regime troughs included.** This is a deliberate
  choice, stated rather than overlooked: the ratchet's install cadence is a permanent feature of the
  design (S4a), so the post-install trough is a **recurring real cost of the chosen strategy**, not a
  measurement artefact to be excluded. A rank rate that excluded it would overstate what this node
  actually delivers.
- **`computeWallRates` additionally accumulates `postInstallSec` and `postInstallRankGained`**, and
  `bladeburner-state.json` reports `rankPerWallSecExPostInstall` alongside the headline figure.
  Neither checkpoint is graded on the ex-regime number — it exists so a miss is *attributable*
  ("we spent 40% of the week at maxHp 10") instead of merely observed.
- **Every checkpoint verdict's logged input vector must include `postInstallSec / wallSec`.** A C1 or
  C3 verdict recorded without that ratio is incomplete and is treated as a defect in the same class
  as Phase 38's missing duty cycle.
- ⚠️ **The one thing this does not fix:** if installs ever become frequent enough that the regime
  fraction dominates, C3's bar is measuring the ratchet's cadence more than the Bladeburner engine.
  The `postInstallSec / wallSec` ratio is the tell; **above 0.35 the checkpoint is reported as
  `regimeDominated: true`** and the verdict is advisory rather than binding.

### S10 — Action levels, city rotation, and team recruitment: deliberately minimal in v1

Each of these is a real lever, and each currently rests on an unmeasured input. None of them may
smuggle a live experiment into the engine.

- **Action levels (D4, Q3).** Q3 answered for Tracking: autolevel's choice (max) is within **3.6%**
  of the true EV/sec peak, and `rankLoss` is 0 at every contract level. **Decision: v1 does not touch
  action levels or autolevel at all.** The `setActionLevel` → read → restore search D4 describes is a
  *mutating* probe; running it inside the engine is a live experiment by another name. The engine
  **records** each action's current level and autolevel flag in the ledger so the question stays
  answerable. ⚠️ Carried forward: `Investigation`'s autolevel-driven collapse (46 ✓ / 301 ✗) is
  unswept and may behave very differently from Tracking — see Q3′ in the carried-forward table.
- **City rotation (D11, Q5).** `CITY_ROTATION_ENABLED = false`. `switchCity`'s cost, travel time, and
  interaction with the running action are all **undocumented and unmeasured**, and it is the one
  lever that has never been tested. The engine **tracks** per-city population / communities / chaos /
  inventory as a depleting stock with regeneration and logs when any floor is breached, so the
  rotation policy can be designed against real data — but it does not rotate. Sector-12 currently
  reads pop 847.7m, 31 communities, chaos 0.000, ~2,000 contracts remaining, so nothing is pressing.
- **Team recruitment (D6, Q4).** Teams apply to Operations/BlackOps **only**, and Stage B is gated
  shut (S5). `Recruitment` costs **4m22s of slot time** for zero Stage-A benefit. **Decision:
  `TEAM_SIZE_TARGET` applies only while `STAGE_B_ENABLED` is true**; in Stage A, Recruitment is
  removed from the overhead ladder. This implements §4a's "skip — test later when Stage B actually
  starts" over D6's unqualified "recruit a team". Flagged in S16.5.

### S11 — General actions do not auto-repeat *(Q6, a mechanical finding with teeth)*

Contracts and Operations loop on their own; **General actions fire once and stop**
(`getCurrentAction()` reads the action for one sample, then `null`). Any engine that starts
`Hyperbolic Regeneration Chamber` and waits will idle at 0% duty while believing it is resting.

🔴 **The re-trigger is conditional on observed idleness, never unconditional** *(fixes reviewer
blocker 6)*. An earlier draft said the ladder re-triggers "every 15 s **unconditionally** while the
chosen action is unchanged" — which directly contradicts S6's own rule that repeated `startAction`
calls reset action progress and complete nothing. Applied to `Hyperbolic Regeneration Chamber`, an
unconditional 15 s restart means the HP/stamina recovery action **can never finish a cycle**: the
engine would rest forever and recover nothing. That is the precise failure this phase exists to
stop, so the rule is inverted:

- **Re-trigger only when the action is observed idle.** On each poll tick, if the ladder's chosen
  action is unchanged **and** `getCurrentAction()` reads `null` (or reads a `name` that does not
  match the intended one), call `startAction` again and run S6's verification. If
  `getCurrentAction()` matches the intended action, **do nothing** — it is mid-cycle and restarting
  it would discard the progress.
- **`GENERAL_ACTION_RECHECK_MS = 15_000` is a debounce floor, not a restart interval.** It is the
  minimum time between two re-trigger *attempts* for the same action, so a single lagging or
  transient `null` read immediately after a start cannot thrash the action. Renamed from
  `GENERAL_ACTION_REFRESH_MS` so the constant's name stops implying an unconditional refresh.
- The interaction with S6 is deliberate and is the reason this shape works: a General action that is
  genuinely no-oping reads `null` forever, so the debounced re-trigger produces exactly the
  consecutive start failures `ACTION_START_FAILURE_LIMIT` counts, and the action quarantines like any
  other. ⚠️ **Carried risk, logged not solved:** if `Hyperbolic Regeneration Chamber` itself ever
  quarantines, the engine has no HP/stamina recovery path at all. S9's "the recovering state always
  yields an HP-restoring action" test covers the pool-filter version of this trap; the
  quarantine version is a new one — the engine emits a WARN and sets
  `recoveryActionQuarantined: true` rather than silently grinding at the floor.
- Measured stamina costs (Q6, single-sample, directional): Training ≈ 0, Field Analysis ≈ 0,
  Diplomacy ≈ 0.2/use, **Incite Violence ≈ 0.77/use** — budget Incite Violence as a real duty-cycle
  cost, not free upkeep.

### S12 — State, log, and file shapes

| File | Mode | Contents |
|---|---|---|
| `bladeburner-state.json` | overwrite-in-place | the snapshot (S13) — **same filename**, so the dashboard panel and `verify:log` keep a stable target |
| `bladeburner-log.json` | ring, cap 2,000 | events — the **exhaustive `kind` list** is fixed below, because `verify-bladeburner.test.js` validates against it |
| `bladeburner-attempts.json` | ring, cap 5,000 | **new** — S7's per-attempt ledger. Needs a new `vite.config.ts` filter entry |

**`bladeburner-log.json` event kinds — the complete set** *(this list is the source of truth for
`verify-bladeburner.test.js`'s `knownKinds`; adding a kind to the engine without adding it here is a
spec violation, not a test failure to patch)*:

| Retained from Phase 38 | New in Phase 39 |
|---|---|
| `startup`, `off-marker-on`, `off-marker-off`, `skill-buy` | `yield-grant`, `yield-reclaim`, `yield-overrun`, `yield-refused`, `quarantine-set`, `quarantine-clear`, `crossover`, `rep-starvation-set`, `rep-starvation-clear`, `regime-enter`, `regime-exit`, `checkpoint-C1`, `checkpoint-C2`, `checkpoint-C3`, `warn` |

⚠️ `stand-down` / `stand-down-clear` are **retired** with Phase 38's unconditional stand-down (S2);
their successors are `yield-grant` / `yield-reclaim`, which carry a budget and a forgone-rank figure
the old pair did not. Phase 38 records already in the ring keep parsing — the test's `knownKinds` is
the union of both columns **plus** the two retired kinds, so a ring that has not yet aged out its
Phase 38 tail does not fail `verify:log`.

`totals` stays inside `bladeburner-state.json` and is re-seeded on startup (`seedTotals`) —
**load-bearing, not diagnostic**: installs restart this engine repeatedly and an in-memory total
cannot span a 24 h window.

### S13 — `bladeburner-state.json` snapshot shape *(the D9 rebuild)*

```
{ timestamp, time, off, stage: "A" | "B", objectiveMode, holdActive, holdReason,
  yieldedTo: null | { claimant, sinceMs, budgetMs },
  rank, rankTarget: 400000,
  skillPoints, skillPointsIdle, skillPointsIdleSinceMs, skillLevels,
  overclockHeldAt,                          // S4 -- visible, so the hold is legible
  stageBEnabled, stageBBlockedBy: "Q11",    // S5 -- ditto
  cityName, cityStock: { <city>: { pop, communities, chaos, contractCount, opCount } },
  teamSize, hpFraction, stamina: { current, max, fraction },
  rates:  { "1h": {...}, "24h": {...}, cumulative: {...} },   // each: wallSec, actionSec,
                                                             // rankGained, rankPerWallSec, dutyCycle,
                                                             // postInstallSec, rankPerWallSecExPostInstall  (S9a)
  duty:   { rankProducingSec, overheadSec, yieldedSec, idleSec },
  regime: "steady" | "post-install", postInstallTrainingMs,   // S9a
  crossover: { bestContract: {name, scorePerSec, scorePerAction},
               bestOperation: {name, scorePerSec, scorePerAction},
               operationLeadsPerSec: bool, firstLeadPerSecAtMs,     // C2's TRIP condition (S14)
               operationLeadsPerAction: bool, firstLeadPerActionAtMs },  // observation only
  quarantine: { <action>: expiryMs }, allActionsQuarantined,
  recoveryActionQuarantined,                                  // S11 -- no HP/stamina recovery path
  startFailures: { <action>: count },
  repStarvation: { fired, sinceMs, status, observedRepRate },  // status per S3's classifyRepProgress
  yieldLedger: { rollingHourRepYieldMs, overrunStreak: { <claimant>: count } },  // S2.3/S2.4
  livelockSuspected: null | { claimant, streak, sinceMs },     // S2.4
  repForegone, hospitalizationsInferred,                       // S9 -- INFERRED, not read
  checkpointC1, checkpointC2, checkpointC3,
  totals }
```

Every rate field carries the S1 comment: *derived from `getRank()` / `getCurrentAction()`, never from
engine intent.*

### S14 — Checkpoints *(features §5, wall-clock)*

| # | When | Bar | On a miss |
|---|---|---|---|
| **C1** — smoke, "the engine is not broken" | 24 h wall-clock uptime | `rankPerWallSec` ≥ **0.007** | Stop and diagnose before burning a week. Inspect in order: `dutyCycle`, `startFailures`/quarantine, stamina histogram, HP-blocked seconds, `postInstallSec / wallSec` (S9a). ⚠️ C1 is **not** a viability test — contracts alone at this rate are ~570 days |
| **C2** — the real go/no-go | whenever it happens | `crossover.operationLeadsPerSec === true` — i.e. the best operation's **per-second** score exceeds the best contract's, on live numbers, logged (S5) | ⚠️ **If C2 is never reached, Phase 39 has failed regardless of C1.** Per `docs/bn6-playbook.md` §1.1, not reaching it within **~2 weeks** trips the node-level tripwire: **revert to batcher-primary** (default is revert, not extend) |
| **C3-A** — engine health while Stage B is gated shut | 7 d wall-clock uptime with `STAGE_B_ENABLED === false` | `rankPerWallSec` ≥ **0.007** **and** `dutyCycle` ≥ **0.20** | The engine has degraded since C1 — diagnose. **This is explicitly not a viability verdict** |
| **C3-B** — 1-week viability, Stage B open | 7 d of wall-clock uptime **accumulated after `STAGE_B_ENABLED` flips true** | `rankPerWallSec` ≥ **0.35** (≈ 2 weeks to rank 400,000) | Below this the node is a multi-month grind and the fallback conversation reopens **with evidence** |

#### S14.1 — C2 is pinned to one scoring mode *(fixes reviewer blocker 4, part 1)*

An earlier draft left C2 reading "best-operation score exceeds best-contract score" while S8 makes
the scoring mode freely switchable — and the two modes give **opposite verdicts**: under
`"per-action"`, Raid already scores ~2× Tracking *at its current 5.3% success chance*, so C2 would
fire essentially immediately and the phase's one real go/no-go would be satisfied by a
config default rather than by progress. Under `"per-second"` it is a genuine future crossing. So:

- **C2 trips on `operationLeadsPerSec` only.** The per-second score is the checkpoint's sole
  criterion, regardless of what `OBJECTIVE_MODE` is set to for *action selection*. Switching
  `OBJECTIVE_MODE` must not move the go/no-go bar; those are separate concerns and the spec now says
  so.
- **Both crossings are still computed and logged** (`operationLeadsPerAction` /
  `firstLeadPerActionAtMs`, S13). The per-action crossing is an **observation** — it is the evidence
  that would inform a *future, human* decision to re-pin C2 after Q10 lands. It trips nothing.
- **Rationale for choosing per-second:** it is the conservative reading, it is the current behaviour,
  and the per-action reading rests on the unverified premise D3-OPEN/Q10 explicitly withdrew. Pinning
  C2 to the mode that would fire immediately would be marking our own homework.
- ⚠️ **If Q10 later resolves to per-action, C2's pinning is re-opened** — that is new evidence, and
  the CLAUDE.md rule permits reopening on exactly that. It requires a spec amendment, not a constant
  edit, because the checkpoint is the phase's deliverable.

#### S14.2 — What happens when C2 fires while Stage B is gated shut *(fixes reviewer blocker 4, part 2)*

This is the expected case, not an edge case: S5 keeps the gate shut on Q11, and C2 is designed to be
reachable *without* opening it. The earlier draft never said what follows. It does now:

**A C2 fire does not open the Stage-B gate, and nothing in the engine may act on it.** The engine
logs `checkpoint-C2`, sets `checkpointC2` in state, surfaces the marker on the dashboard line, and
**continues running Stage A unchanged**. There is no runtime path from C2 to `STAGE_B_ENABLED`.

The required human next step, in order:

1. **Request a fresh go-ahead for the Q11 measurement.** Per the session cap (context item 4), a
   bounded live HP probe on one operation needs explicit approval; C2 firing is the trigger to *ask*,
   with evidence in hand, not a licence to proceed. This is the **default path** — the phase's whole
   design is "reach the crossover safely, then buy one measurement with it."
2. **If the go-ahead is declined, or Q11 comes back unmeasurable again** (a third `startAction`
   no-op on operations), the gate stays shut and the engine keeps grinding Stage A at a rate the spec
   already calls a ~570-day path. That is not a viable node plan, so the correct response is
   **revert to batcher-primary** under `docs/bn6-playbook.md` §1.1's tripwire — the same default as a
   C2 that never fires, reached by a different route.
3. **Only after a recorded Q11 answer** does S5's two-key flip apply, and C3-B's clock starts at
   that flip.

⚠️ **The one thing that must not happen** is the gate opening because the crossover "proved"
operations are worth it. EV is not a safety property (S5); Q11 is about HP, and a crossover says
nothing about HP.

#### S14.3 — Why C3 was split *(fixes reviewer blocker 5)*

The single C3 bar of **≥ 0.35 rank/wall-s** was **unreachable by this spec's own arithmetic while
Stage B is gated shut**: S14's own note derives a perfectly-tuned Stage-A ceiling near
**0.008 rank/wall-s** (Tracking's 0.0307 × a ~26% sustainable duty). 0.35 is ~44× that. So a
correctly-working, perfectly-tuned engine was **guaranteed** to read "C3: miss", which makes the
checkpoint untestable — it grades the gate, not the engine, and a verdict that cannot come back
positive teaches nothing.

- **C3-A** is what is gradeable while gated shut: is the engine still doing as well at 7 days as it
  did at 24 hours? Its bar is C1's rate held for a week **plus** a duty-cycle floor, which is the
  term that actually catches degradation (a stamina-thrashing or quarantine-flooded engine loses duty
  long before it loses rate).
- **C3-B** is the real viability test and it is **not evaluated at all** while the gate is shut. It
  is recorded as `{ status: "not-applicable", reason: "STAGE_B_ENABLED false" }` — **never as a
  miss.** Recording it as a miss is what the earlier draft did, and it would have shipped a false
  negative into the node-level fallback conversation.
- C3-B's 7-day clock counts **only** uptime accumulated after the gate opens. Pre-flip time is
  Stage-A time and cannot be evidence about Stage B.

Each checkpoint is logged **once** (seeded from the persisted log so a restart cannot re-announce a
verdict), with its full input vector — including `postInstallSec / wallSec` per S9a.

⚠️ **C1's bar was corrected from 0.05 during brainstorm and the correction matters:** Tracking drains
stamina at ~6.55/min net against HRC's ~2.35/min ⇒ sustainable duty ≈ **26%** ⇒ perfectly-tuned
Tracking tops out near 0.008 rank/wall-s. A bar of 0.05 would have failed a correctly-working engine.
🟢 The 26% is a floor, not a constant — max stamina and regen both scale with agility, which
Bladeburner actions grow for free.

### S15 — Identifier hygiene pre-screen

New identifiers, checked against `ns.*` (all namespaces) and the browser/Node globals:

`stageState`, `stageBEnabled`, `objectiveMode`, `scoreCandidate`, `verifyActionStarted`,
`recordAttempt`, `attemptLedger`, `appendAttempt`, `seedAttempts`, `quarantineFor`,
`updateQuarantine`, `isQuarantined`, `detectRepStarvation`, `resolveYieldGrant`, `yieldBudgetMs`,
`yieldedTo`, `computeWallRates`, `computeCrossover`, `cityStock`, `updateCityStock`,
`skillPointsIdle`, `overclockHeldAt`, `staminaFraction`, `hpFraction`, `generalRecheckMs`,
`startFailures`, `allActionsQuarantined`.

Added by the reviewer-blocker fixes, screened the same way: `applyStageGate` (blocker 1),
`classifyRepProgress`, `repProgressStatus` (blocker 2), `rollingHourRepYieldMs` (blocker 3),
`operationLeadsPerSec`, `operationLeadsPerAction` (blocker 4), `overrunStreak`, `livelockSuspected`,
`minHoldAfterOverrunMs` (blocker 8), `hospitalizationsInferred` (blocker 9),
`inPostInstallRegime`, `postInstallSec`, `postInstallTrainingMs`, `rankPerWallSecExPostInstall`,
`regimeDominated` (blocker 12), `recoveryActionQuarantined` (blocker 6).

⚠️ Two of these needed a deliberate swerve: **`regime`** is used only as a *string value*
(`regime: "steady"`), never as a bare identifier that could collide, and the boolean is
`inPostInstallRegime` rather than `postInstall` for readability; and **`status`** appears only as a
JSON field on `classifyRepProgress`'s return, destructured as `repProgressStatus` at every call site
rather than as a bare `status` local.

⚠️ **Deliberately avoided:** `window`, `document`, `location`, `navigator`, `history`, `self`, `top`,
`parent`, `global`, `process` (DOM/Node globals — Phase 38 lost +25 GB to `window`); `skills`
(shadows `ns.formulas.skills`) → `skillLevels`; `city` → `cityName`; `probe` (0.20 GB on the name
alone, `ns.dnet.probe`); `share`, `exec`, `ls`, `ps`, `rm`, `mv`, `run`, `kill`, `read`, `write`,
`scan`, `hack`, `grow`, `weaken`, `tail`. `ns.ps()` is still called (S2) but no identifier is named
`ps`. **Any surprising `ramcheck.js` reading is checked against this class first.**

### S16 — Spec-stage decisions the features doc did NOT make explicit *(flagged for review)*

Each of these is a judgment call this spec had to make to be implementable. They are collected here
rather than buried so they can be individually accepted, reversed, or sent back.

1. **`backdoorwd.js` gets a yield, contrary to D1's "no longer relevant. Do not yield."** D1's
   reasoning is sound (decision B dropped the WD gate, and the script live-checks as a no-op that
   never touches the slot). But the asymmetry is extreme — it is the literal node-clear executor and
   a false preemption there is unrecoverable, while the cost of the guard today is **exactly zero**,
   because it never asserts activity. Guard kept as a hazard rail. Reverse this only with an explicit
   statement that WD will never fire in BN6.
2. **`OBJECTIVE_MODE` defaults to `"per-second"`** — the status quo — with `"per-action"` implemented
   and both scores always logged. The features doc leaves D3-OPEN genuinely open; a spec must pick a
   runtime default, and picking the *unchanged* one keeps the ledger comparable to prior data.
3. **`STAGE_B_ENABLED` / `OVERCLOCK_HOLD_LEVEL` are two-key gates with no runtime lift path** (S4,
   S5). The features doc says "held" and "blocked"; this spec makes both structural rather than
   policy, so no scoring change or success-chance swing can open them.
4. **`STAMINA_RESUME_FRACTION` lowered 0.8 → 0.55.** Direct consequence of the closed-form penalty
   (zero benefit above 50%). Phase 38's 0.8 predates the closed form. This changes an existing
   constant's value, so it is called out rather than folded in.
5. **Recruitment is removed from the Stage-A overhead ladder** (D6 says recruit; §4a says skip until
   Stage B). This spec follows §4a, which is the later and better-reasoned position.
6. **Action-level control (D4) is not implemented in v1** — the level search is a mutating probe, and
   Q3 showed autolevel is within 3.6% of optimal for the action Stage A actually runs.
7. **City rotation (D11) is instrumented but disabled** — `switchCity`'s cost is unmeasured and
   measuring it is a live experiment, which is capped.
8. **Q9's alternative HP policy is implemented but not enabled**, so the comparison is an offline
   read of logged periods rather than a live A/B.
9. **S3's rep-starvation constants are invented defaults** — now **five** of them (30 min sustain /
   0.5 rep/s fire / 1.0 rep/s clear / 5 min clear-sustain / 15% rolling-hour duty cap), the clear
   pair added by blocker 2's fix. They are logged into every event so they can be re-derived from
   data.
10. **Phase 38's `MAX_CONTESTED_DUTY` / `HOLD_SLICE_MS` / `classifyWindow` free-vs-contested
    machinery is deleted, not repurposed.** Under primary there are no "contested slices" to budget —
    the engine holds the slot and yields on explicit, bounded request (S2). Keeping a duty cap would
    silently re-impose Phase 38's architecture. ⚠️ This deletes exported functions with existing
    tests; those tests are deleted with them (a deletion, not a behavioural supersession).

**Added 2026-08-03 by the cold-review blocker fixes** — each is a new judgment call, flagged the same
way and open to the same reversal:

11. **`REP_YIELD_SLICE_MS` derived from the duty cap, not chosen independently** (S2.3, blocker 3).
    The cap was made the authority and the slice set to `cap / 3 = 180 s`. The alternative — raising
    the cap to 0.30 so a 10-minute slice fits — was rejected: 30% of every hour is a large, undebated
    concession of the win path, and D11a's fuse is a *guard*, not a co-equal claim.
12. **The anti-livelock ladder's worst case is 1,440 s yielded / 300 s held** (S2.4, blocker 8) — a
    deliberately bad steady state that is made **loud** (`livelockSuspected` + WARN) rather than
    made impossible. Reversing this means either accepting an unbounded yield or accepting a starved
    `backdoorfactions.js`; neither is better, so the pick is "bounded, bad, and visible".
13. **C2 is pinned to the per-second score** (S14.1, blocker 4). This is a spec-stage judgment the
    features doc could not make, because D3-OPEN is open. Reversing it (pinning to per-action) makes
    C2 fire almost immediately and should be done **only** on a resolved Q10, via a spec amendment.
14. **C3 was split into C3-A / C3-B** (S14.3, blocker 5) rather than dropping the 0.35 bar. The bar
    itself is correct as a viability test; it was the *timing* that was wrong. C3-B reports
    `not-applicable` while gated shut — never `miss`.
15. **Hospitalisation is inferred from an HP-full-after-a-drop transition** (S9, blocker 9), because
    the API exposes no getter. The inference is explicitly second-class to the panel read, and Q9's
    resolution now depends on two manual CDP panel reads per policy period — a narrowing of what the
    features doc assumed was automatic.
16. **The post-install regime is accounted for but NOT excluded from the checkpoints** (S9a, blocker
    12). The averaging-across-regimes is accepted deliberately (the ratchet's cadence is a permanent
    feature of S4a's design, so its cost is real), with `rankPerWallSecExPostInstall` reported
    alongside for attribution and a `regimeDominated` flag above a 0.35 regime fraction.
17. **The stamina-penalty premise is demoted from asserted fact to unverified assumption** (S8,
    blocker 11) and the unit test now covers only our own code's behaviour. This means the engine may
    be over-estimating EV in the sub-50%-stamina band for the whole phase; S9's floor keeps the
    engine out of that band by design, which is why this is tolerable rather than blocking.
18. **`augfarmer.js` / `backdoorfactions.js` / `daemon.js` get ZERO edits** (Ground rules, low-severity
    item (a)). An earlier draft implied S11 authorised some; it does not, and none are needed —
    `augfarmer.js`'s hold contract is already correct (`augfarmer.js:1886/1935`) and
    `backdoorfactions.js`'s `resolveBladeburnerHold` shipped 2026-08-02.

---

## Design — work items

### WI1 — Telemetry rebuild in `src/bladeburnermanager.js` [code] *(S1, S7, S12, S13)*

**This ships and validates before the policy changes in WI2–WI4 are trusted.** Everything downstream
is computed from these numbers, and the last engine's numbers were wrong in a way its own state file
could not reveal.

New/reshaped exported pure functions:

| Function | Responsibility |
|---|---|
| `computeWallRates(totals, samples, windows, nowMs)` | S1's per-window `{wallSec, actionSec, rankGained, rankPerWallSec, dutyCycle}` |
| `accumulateTotals(totals, sample)` | extended with `actionSec` / `rankProducingSec` / `yieldedSec` |
| `appendAttempt(entries, record)` / `seedAttempts(raw)` | ledger ring, mirroring `appendBbLog` / `seedBbLog` |
| `recordAttempt(context)` | assembles S7's record shape (pure; the caller supplies read values) |
| `buildBbState({...})` | reshaped to S13 |

Loop changes: sample `getRank()` and `getCurrentAction()` **every tick**; `actionSec` accrues only on
a verified match; `totals` persists and re-seeds.

### WI2 — Slot ownership and bounded yields [code] *(S2, S3)*

- `resolveYieldGrant(claimant, activity, nowMs, priorGrant, budgets)` — pure: returns
  `{ yield: bool, budgetMs, reason, overrun: bool, overrunStreak }`. Unconditional reclaim at the
  bound, with S2.4's escalating budget, `MIN_HOLD_AFTER_OVERRUN_MS` floor, and
  `livelockSuspected` flag. Rep grants additionally consult the rolling-hour ledger (S2.3) and refuse
  a whole slice rather than truncating one.
- `classifyRepProgress(prevAugState, currAugState, dtSec)` — pure, **new** (S3): the
  `"progressing" / "stalled" / "unknown"` split that makes starvation detectable at all.
  `estimateRepRatePerSec` is retained only as its internal rate computation.
- `detectRepStarvation(augState, nowMs, priorState)` — pure, per S3, reading `workTarget.*` and
  carrying the fire **and clear** conditions.
- The yield/reclaim step sequences of S2.1 are implemented in the loop (not pure) and their **ordering
  is commented as load-bearing**, citing `slotconflictprobe.js`'s confirmed mutual preemption.
- Delete `classifyWindow`, `HOLD_SLICE_MS`, `MAX_CONTESTED_DUTY`, `computeRepForegone`'s
  contested-only framing (rep forgone is now computed per **yield grant**, per S2).
- Retain `higherPriorityClaimant` and `classifyBackdoorActivity` — both still correct, now feeding
  a bounded grant instead of an unconditional stand-down.

### WI3 — Action selection, verification, quarantine [code] *(S6, S8, S5, S9, S11)*

| Function | Responsibility |
|---|---|
| `scoreCandidate(candidate, mode)` | S8 — returns `{evPerSec, evPerAction, score}` from the `pMin` it is handed, applying no stamina correction of its own (S8's unverified-premise note) |
| `pickRankAction(candidates, opts)` | reshaped: hard `EV ≤ 0` floor, quarantine filter, HP/stamina guards. **Does not gate stages** — it is only ever called on already-gated input |
| `buildCandidates(ns)` | ⚠️ **the full, UNGATED pool** (S5.1) — all Contracts + all Operations passing `getActionCountRemaining >= 1`. Knows nothing about stages |
| `applyStageGate(candidates, stageBEnabled)` | **new, and the only gate** (S5.1) — drops the five risky Operations when `stageBEnabled` is false; never drops `Investigation` |
| `updateQuarantine(state, action, verified, nowMs)` | S6's counter/expiry latch |
| `computeCrossover(candidates, mode)` | consumes `buildCandidates`' **ungated** output (S5.1); returns `{name, score}` report pairs only — no candidate object a start path could consume |
| `pickOverheadAction(...)` | Recruitment dropped in Stage A (S10); `Training` preferred in the post-install regime (S9a); re-trigger conditioned on observed idleness per S11 |
| `classifyRepProgress(prev, curr, dtSec)` | **new** (S3) — splits `estimateRepRatePerSec`'s overloaded `null` into `"progressing" / "stalled" / "unknown"` |

**Wiring, stated explicitly because S5.1 makes it a safety property:** the rank path is exactly
`pickRankAction(applyStageGate(buildCandidates(ns), STAGE_B_ENABLED), opts)`, and the crossover path
is exactly `computeCrossover(buildCandidates(ns), mode)` — the same ungated pool, scored, never
started. The main loop's `startAction` call site is the only place that may call it, and it is
immediately followed by the verification step (S6) on the next tick — no other path may start an
action.

### WI4 — Skill policy [code] *(S4, D5)*

`planSkillBuy` keeps its existing shape and order (`Blade's Intuition` → `Digital Observer` →
`Tracer` → …) with `SKILL_LEVEL_CAP` staged **L10 first, then L25** so the cheap early rungs (477
rank for +29% success; 3,915 rank for ×2.47) land before anything expensive. `Overclock` is
unreachable while its level ≥ `OVERCLOCK_HOLD_LEVEL`. Never buys `Hands of Midas`, `Hyperdrive`,
`Cyber's Edge`, `Datamancer`, `Cloak`, `Short-Circuit`. Every buy logs the full live cost vector so
the curve stays recoverable.

⚠️ Known, accepted imperfection (carried from Phase 38): `planFirstEligible` fills sequentially
rather than round-robin. Since skill effects multiply, a balanced climb dominates slightly at every
intermediate point; the endpoint is identical. Not worth machinery today — logged, not silently
accepted.

### WI5 — City stock instrumentation, rotation disabled [code] *(S10, D11)*

`updateCityStock(prior, reads, nowMs)` — pure; tracks per-city population, communities, chaos, and
contract/operation inventory as a depleting stock, and flags floor breaches
(`Raid` community requirement, chaos band, low inventory). Logs breaches as events. `shouldRotateCity`
is retained but **never called for effect** while `CITY_ROTATION_ENABLED` is false.

### WI6 — Plumbing and docs [code]

- `vite.config.ts`: one new filter entry for `bladeburner-attempts.json`.
- `dashboard.js`: the existing `BLADEBURNER` panel's single content line is re-pointed at the S13
  fields — proposed: `<stage><gates> | rank <N> <rankPerWallSec>/ws duty <pct> | C1:<verdict>
  C3:<verdict>`, where `<gates>` renders a marker when Overclock is held or Stage B is gated, and
  `C3` renders **whichever of C3-A / C3-B is currently applicable** (S14.3) — never a `not-applicable`
  C3-B, which would read as a miss on a glance. **No new rows** (the window is at its measured height
  ceiling); if the line cannot fit the budget, drop the duty term, not the gate marker. ⚠️ A fired
  C2 while the gate is shut must be visible here (it is the phase's deliverable and it demands a
  human decision per S14.2) — fold it into `<gates>` rather than adding a term.
- `docs/bladeburner-reference.md`: record the corrected stamina-resume reasoning and the
  `startAction` no-op as a §7 gotcha (it is currently only in §8 and `BACKLOG.md`). **Add two
  findings surfaced by the cold review:** (a) §6's `getActionEstimatedSuccessChance` row gains an
  explicit *"unknown whether this is pre- or post-stamina-penalty — see Q12"* note, so the next
  session cannot re-derive the assumption as fact (blocker 11); (b) §5 gains the
  hospitalisation-inference rule and its explicit second-class status against the panel counter
  (blocker 9).
- `docs/bn6-playbook.md`: point §1's Phase-39 references at this spec; restate the ~2-week C2
  tripwire **and S14.2's "C2 fires while gated ⇒ ask for a Q11 go-ahead, else revert"** branch, since
  that is the node-level decision, not an engine-level one (blocker 4).
- `BACKLOG.md` / `docs/phases/CHANGELOG.md` / `docs/scripts.md`: staged in the same commit as the
  work, per CLAUDE.md.

---

## Tests [code]

`test/bladeburnermanager.test.js`, extending the existing file:

- **`computeWallRates`** — zero-uptime, zero-action, restart-with-seeded-totals, window pruning at an
  exact boundary. **T-TEL:** a fixture where the engine *intended* an action for the whole window but
  `getCurrentAction()` never verified ⇒ `dutyCycle === 0` and `rankPerWallSec` reflects only real
  rank movement. *This is the regression test for Phase 38's defining bug.*
- **`scoreCandidate`** — per-second vs per-action modes; both scores present in both modes; negative
  EV stays negative. ⚠️ **The stamina test asserts a property of our code, not of the game's return
  value** *(fixes reviewer blocker 11)*: a fixture with a given `pMin` scores identically to
  hand-computed `pMin·rankGain − (1−pMin)·rankLoss`, proving `scoreCandidate` multiplies `pMin` by
  nothing. **No test asserts that the game's estimate is post-penalty** — that premise is unverified
  (S8) and settling it in a hard-failing unit test would freeze a guess into the suite.
- **`pickRankAction`** — never returns `EV ≤ 0`; respects quarantine; respects HP/stamina guards;
  returns `null` when the pool empties. It is **not** tested for stage gating — it does not gate
  (S5.1); that is `applyStageGate`'s single job.
- **`applyStageGate`** — with `stageBEnabled` false, `Raid`/`Assassination`/`Sting`/`Undercover`/
  `Stealth Retirement` are absent **even when their EV is the highest in the fixture**;
  `Investigation` and all Contracts survive; with `stageBEnabled` true the pool passes through
  unchanged. *This is the Q11 safety test.*
- **`buildCandidates` / `applyStageGate` split** *(fixes reviewer blocker 1)* — `buildCandidates`
  returns the five risky operations **even while `STAGE_B_ENABLED` is false** (it is the ungated
  source, and C2 depends on it), and a test asserts the two are composed in exactly the order S5.1
  wires them.
- **`classifyRepProgress`** — `"progressing"` with a rate on a closing deficit; **`"stalled"` with
  rate `0` on an unchanged deficit** (the state the old `null` swallowed); `"unknown"` on missing /
  stale / unparseable / changed-target / `dtSec ≤ 0`.
- **`planSkillBuy` Overclock hold** — never returns `Overclock` at or above the hold level, **even
  with unlimited skill points and every other skill capped**. *This is the Q10 safety test.*
- **`updateQuarantine`** — trips at the limit, expires, single retry, re-quarantines; all-quarantined
  case sets the flag rather than returning an action.
- **`resolveYieldGrant`** — grants on presence **and** a fresh busy marker for the backdoor scripts,
  on presence alone for `studybootstrap.js` (S2.2); **reclaims unconditionally at the bound**;
  overrun flagged; the rolling-hour rep cap refuses a whole slice rather than truncating one (S2.3);
  **the escalation ladder doubles 180 → 360 → 720 → 1,440 s and stops there, resets on a clean grant,
  and enforces `MIN_HOLD_AFTER_OVERRUN_MS` between grants** (S2.4). A fixture where the claimant
  never clears its marker must show the engine still holding the slot a majority of a simulated hour
  — *the anti-livelock regression test.*
- **`detectRepStarvation`** — fires only after the sustain window; **fires when
  `classifyRepProgress` reports `"stalled"`** (the case the old `null`-only signal made unreachable);
  reads `workTarget.deficit`, **not** `target.deficit` — a fixture built from the live
  `augfarmer-state.json` shape (`target.deficit: 0`, `workTarget.deficit: 20653`) must fire;
  does **not** fire on `"unknown"`; **clears** on sustained progress / zero deficit / non-grinding
  phase, and an `"unknown"` sample neither fires nor clears.
- **`computeCrossover`** — reports operations that are gated out of the live pool (C2 must be
  reachable while Stage B is shut); returns **both** `operationLeadsPerSec` and
  `operationLeadsPerAction`, and a fixture where the two disagree confirms only the per-second flag
  is the one C2 reads (S14.1).
- **`inPostInstallRegime` / regime accounting** (S9a) — `hp.max = 10` classifies as post-install and
  `hp.max = 27` does not; `computeWallRates` splits `postInstallSec` out of `wallSec` and
  `rankPerWallSecExPostInstall` excludes exactly those seconds while the headline rate still
  includes them.
- **`updateCityStock`** — floor breaches flagged; no rotation side effect while disabled.
- **`updateStaminaRecovering`** — re-derived for the 0.55 resume value (S16.4); the latch still
  cannot flap.
- **`updateHpRecovering` + `pickOverheadAction`** — the recovering state **always** yields an
  HP-restoring action (the Phase 38 "floor is a trap" regression).

`test/verify-bladeburner.test.js` (`npm run verify:log`): `bladeburner-state.json` parses and carries
every S13 field; `rankPerWallSec` / `dutyCycle` finite, non-negative, and `dutyCycle ≤ 1`;
`bladeburner-attempts.json` parses, records carry `verified` and both predicted scores, length ≤ cap.

**Two edits to this file are required, and both change existing assertions** — named here as
acknowledged exceptions to T1's "no existing fixture's expected value changes" claim
*(fixes reviewer low-severity item (b))*:

1. **`knownKinds` (currently 6 entries, line 82) gains the 15 new kinds** enumerated in S12 and keeps
   `stand-down` / `stand-down-clear` so a not-yet-aged-out Phase 38 tail still parses.
2. **The `rankPerHeldSec` assertions (lines 56–57) are removed.** S1 supersedes that field with
   `rankPerWallSec`; the engine stops emitting it, so asserting it is finite would fail on a correct
   engine. The `rankPerWallSec` assertions on the adjacent lines stay and become the only rate check.

🔴 **The broken-telemetry assertion is qualified, not adopted as drafted** *(fixes reviewer blocker
10)*. An earlier draft asserted that `dutyCycle === 1 && rankGained === 0` is always a failure. That
pair is **legitimately producible by states this spec deliberately designs for**, so as drafted it
would fail a correctly-behaving engine:

- **the all-quarantined fallback** (S6) — every rank action quarantined, the overhead ladder running
  continuously ⇒ real duty 1.0, real rank gain 0. Correct behaviour, loudly flagged already via
  `allActionsQuarantined`;
- **a freshly-started window** — one verified sample into a window, no rank tick yet ⇒ the same pair;
- **the post-install regime** (S9a) — `Training` running at full duty by design, paying no rank.

The assertion therefore fails only on the combination that is genuinely diagnostic of Phase 38's bug
— *time was spent on rank-producing actions and no rank appeared*:

```
FAIL if   wallSec        >= 3600          // a full hour of this window has elapsed
   and    rankProducingSec >= 1800        // half of it verified on Contracts/Operations
   and    rankGained     === 0
```

`dutyCycle` is **not** a term: it is the field Phase 38 lied about, so it cannot also be the
detector. `rankProducingSec` (S1) is the honest replacement — it is non-zero only for verified time
on rank-paying actions, which is exactly the condition under which zero rank movement is impossible
for a working engine (Tracking carries no rank loss on failure, so its rank is monotonic).

---

## Live procedure [live] — observation only, no new experiments

⚠️ Per the session cap on live testing, **no step below runs a probe script or starts an action by
hand.** Each is a read of what the engine produces on its own.

- **L1 — RAM.** Claude restarts `bladeburnermanager.js` over CDP (pre-authorised). `run ramcheck.js
  bladeburnermanager.js daemon.js augfarmer.js` → engine in the 65–85 GB band; daemon and augfarmer
  **flat**. Figures recorded in headers.
- **L2 — Telemetry sanity, against an independent source.** 🔑 *The durable lesson of Phase 38: an
  engine that measures itself must be validated against an independent source before its numbers are
  trusted.* Read the **in-game Bladeburner panel** (`cli.mjs goto Bladeburner` + `cli.mjs body`) and
  compare rank, stamina, HP, and city chaos against `bladeburner-state.json` **at the same moment**.
  Any disagreement stops the phase here. ⚠️ **`Num Times Hospitalized` is compared separately and
  held to a weaker bar** *(blocker 9)*: it is compared against `hospitalizationsInferred`, which is an
  **inference**, not a read (S9). A mismatch there does **not** stop the phase — it retires the
  inferred field as untrustworthy and makes the panel the sole source, which is what Q9's resolution
  path already assumes. Record the two numbers either way; this reading is also Q9's first bracket.
- **L3 — Verification and quarantine, observed.** Confirm from `bladeburner-attempts.json` that
  `startActionReturned` and `verified` disagree at least once (they are already known to, for
  Tracking) and that the engine quarantines and moves on rather than looping. If they never disagree,
  the game bug has resolved itself — record that, it is a real finding.
- **L4 — Yield behaviour.** With `backdoorfactions.js` resident, confirm bounded grants and
  unconditional reclaim in the event log, each carrying its forgone-rank figure.
- **L5 — C1 at 24 h**, **L6 — C2 whenever the crossover is logged**, **L7 — C3 at 1 week.** All three
  read from the exported logs; none requires an in-game action.

---

## Acceptance criteria

- **T1 — `npm test` green**, including every test above, with **no existing fixture's expected value
  changed except the four acknowledged exceptions below** *(fixes reviewer low-severity item (b) — the
  earlier blanket claim was contradicted by the file's own required edits)*: [code — Claude clears]
  1. `updateStaminaRecovering`'s resume constant, 0.8 → 0.55 (S16.4);
  2. the deletions accompanying removed functions — `classifyWindow` / `HOLD_SLICE_MS` /
     `MAX_CONTESTED_DUTY` (S16.10). A deletion, not a supersession;
  3. **`verify-bladeburner.test.js`'s `knownKinds` set gains 15 entries** (S12's table);
  4. **`verify-bladeburner.test.js`'s two `rankPerHeldSec` assertions are removed** — S1 supersedes
     that field, so the engine stops emitting it.

  Everything outside this list is stop-and-re-derive, unchanged.
- **T2 — `npm run verify:log` green**, including the **qualified** broken-telemetry assertion
  (`wallSec ≥ 3600 && rankProducingSec ≥ 1800 && rankGained === 0`, per the Tests section) — **not**
  the raw `dutyCycle === 1 && rankGained === 0` pair, which this spec's own designed states produce
  legitimately. [code — Claude clears]
- **R1 — RAM in band** and `augfarmer.js` / `daemon.js` flat. [live]
- **V1 — L2's independent cross-check passes.** This is the phase's one non-negotiable criterion:
  **no rate produced by this engine may be quoted as evidence until V1 passes.** [live]
- **V2 — the two safety gates hold in code**, verified by grep as well as by test: `Overclock`
  appears in no purchase path reachable at or above `OVERCLOCK_HOLD_LEVEL`; and — per S5.1's
  structural split — `pickRankAction` has **exactly one call site**, whose argument is
  `applyStageGate(buildCandidates(ns), STAGE_B_ENABLED)`, and `computeCrossover`'s return value flows
  only into logging/state, never into `startAction`. Grepping two call sites is the check; no
  reasoning about scoring functions is required. [code]
- **V3 — C1 at 24 h**, with its full input vector logged, **including `postInstallSec / wallSec`**
  (S9a). [live]
- **V4 — C2 logged, or the ~2-week tripwire trips and the fallback conversation opens with
  evidence.** This is the phase's actual deliverable. ⚠️ If C2 fires while Stage B is still gated
  shut — **the expected case** — V4 is satisfied by the log, and the follow-on is S14.2's step 1
  (request a fresh go-ahead for the Q11 measurement), **not** a gate flip. [live]

**Ship gate:** T1/T2 self-cleared; **WI1 (telemetry) merges on R1 + V1** and nothing downstream is
trusted before it; WI2–WI6 merge on T1/T2/R1; C1/C2/C3 are close-out deliverables, not merge blockers
(precedent: Phase 35's V3, Phase 38's decision 9).

---

## Files touched

**New:** `bladeburner-attempts.json` (runtime artifact + `vite.config.ts` filter entry).

**Edited:** `src/bladeburnermanager.js` (substantially rebuilt), `src/dashboard.js` (panel line
re-pointed, no new rows), `vite.config.ts` (one line),
`test/bladeburnermanager.test.js`, `test/verify-bladeburner.test.js`,
`docs/bladeburner-reference.md`, `docs/bn6-playbook.md`, `docs/scripts.md`, `BACKLOG.md`,
`docs/phases/CHANGELOG.md`.

**Deliberately untouched:** `src/augfarmer.js` (its slot-hold contract is correct — confirmed by
source read 2026-08-02, lines 1886/1935), `src/installer.js` (no install freeze, S4a),
`src/backdoorfactions.js` (its `resolveBladeburnerHold` fix shipped 2026-08-02 9:15pm),
`src/daemon.js` (supervisor gating unchanged), the batcher core.

---

## Open questions carried forward

None of these is resolved by this spec. Each carries its default and its trigger, per CLAUDE.md's
"open decisions carry a default and a date" rule.

| # | Question | Default while unanswered | Trigger / owner |
|---|---|---|---|
| **Q10** | ❌ **UNRESOLVED** — is stamina spent per action or per second? Six attempts; the only run producing numbers was contaminated. Gates Overclock (16,908 rank) | **Overclock stays held at 17** (S4). `OBJECTIVE_MODE = "per-second"` (S8), both scores logged so the answer can be applied offline | Needs fresh diagnosis of the `startAction` no-op first. **Low priority** — gates only Overclock |
| **Q11** | ❌ **UNRESOLVED** — HP cost per failed operation. The bounded probe took zero HP risk and got zero data (Raid never started) | **Stage B gated shut** (S5); crossover computed and logged anyway | Before any tier switch. Blocked behind the same diagnosis. **A C2 fire is the trigger to request a fresh go-ahead for this measurement — see S14.2** |
| **Q12** | 🆕 **UNVERIFIED PREMISE** (raised by the cold review, blocker 11) — does `getActionEstimatedSuccessChance` already include the live stamina penalty, or is it pre-penalty? `docs/bladeburner-reference.md` §6 is silent and §5 lists the coupling as unexposed | **Engine applies no correction of its own** (S8) — the status-quo reading, conservative for the gated actions. **No unit test asserts either reading** | Settled offline from S7's ledger: regress logged `predicted.pMin` against `context.staminaFraction` for a fixed action/level. Needs **no** live probe. Do it once the ledger has samples spanning the sub-50% band |
| **Q10/Q11 blocker** | 🔴 Why does `startAction` silently no-op for Tracking and Raid but not Investigation? One unconfirmed lead: Investigation is the only action documented with **no HP loss on failure** | Engine detects, quarantines, and instruments it (S6/S7); the ledger is the diagnostic dataset | **Next live action requires a fresh go-ahead.** Read `bladeburner-attempts.json` first — the answer may already be in it |
| **Q4** | Marginal success-chance value per team member, and the loss rate | **Skip** — recruit only once Stage B opens (S10) | When `STAGE_B_ENABLED` flips |
| **Q5** | City rotation policy: (a) `switchCity`'s cost/travel/interruption, (b) per-city floors, (c) regeneration rate | **Do not rotate**; instrument only (S10/WI5). ⚠️ Note this is an *untested* policy at Stage B consumption rates, not a safe one | (a) needs a live measurement — future work, needs a go-ahead. (b)+(c) fall out of WI5's logs |
| **Q7** | Buy `The Blade's Simulacrum` ($1.029t, rep 1.25k already met) to free the player-action slot? | 🔴 Default flipped 2026-08-02 to **"revisit whenever income makes it plausible"** — with donation unavailable in BN6 (favor ~0 everywhere), it is the structural fix for D11a, not a luxury. Current money ~$262m | Standing. Price it against a rep-starved ratchet, not against rank |
| **Q8** | The Stage A → B crossover condition | **Computed live** (S5/WI3's `computeCrossover`), not a hardcoded rank | Continuous; it is C2 |
| **Q9** | Rest for HP, or accept hospitalisation as a paid instant full-HP reset (~$10.4m)? Arithmetic favours paying (~3× duty), HP is the binding constraint at ~6.2 HP/min vs 2/min regen | `HP_POLICY = "rest"`; the `"accept"` branch is implemented but **off** (S9) | ⚠️ **Narrowed by blocker 9's fix:** the hospitalisation count is *inferred*, not read, so the comparison needs **two CDP panel reads bracketing each policy period** (`Num Times Hospitalized` / `Money Lost From Hospitalizations`) against the state file's rate over the same window. Without those reads Q9 is **not answered by this phase** |
| **Q3′** | `Investigation`'s EV-optimal action level — its autolevel collapse (46 ✓ / 301 ✗) was the reason D4 was raised, and it was **never swept** (Q3 swept Tracking only) | Leave autolevel alone (S10); the ledger records levels | Only if Investigation becomes load-bearing — Stage A does not need it |
| **—** | Should the engine ever refuse to release a slice when augfarmer's deficit is urgent? *(carried from Phase 38 open question 2)* | S2 replaces this with bounded, budgeted grants — the engine now **reclaims** unconditionally. Revisit only if an install is observably delayed | Standing |
| **—** | Bonus time (`getBonusTime`, spends at up to 5×) is unmodelled; with sleep disabled it may never accrue *(carried from Phase 38 open question 4)* | Ignore | If a long offline window ever occurs |

---

## Explicitly out of scope

- Reviving the WD-gate hacking climb (decision B). The arithmetic stays in `docs/bn6-playbook.md` §1.
- Any Bladeburner-aug purchase plan, rep window, install freeze, or money-split arbitration (S4a
  closes all of these — do not rebuild them).
- Sleeve interop — needs SF10, which we do not hold.
- Any change to the batcher's internals beyond the already-decided retarget toward $/s.
- New live probe scripts or live experiments of any kind (session cap).
- BN7 planning. ⚠️ When it comes: `BladeburnerRank` **0.6** and `BladeburnerSkillCost` **2.0** there,
  and `joinBladeburnerDivision()` under SF7.3 **permanently locks out Stanek's Gift**.

## Logged dropped objections *(carried from features §7, plus one new)*

1. **The ~50× multiplier stack is entirely undemonstrated.** It is read off the game's own ceilings.
   Every prior Bladeburner projection in this node has been wrong in both directions.
2. **Rank 1,221 is 0.3% of 400,000** after roughly four days of nominal effort. The path is chosen on
   multiplier *potential*, not on any observed rate.
3. **NEW — this spec builds a controller for a mechanic with a live, undiagnosed game-level bug in
   its single most important call.** S6 makes that survivable and instrumented, not solved. If the
   ledger shows the no-op affecting most rank-producing actions rather than two of them, the correct
   response is to stop and diagnose, **not** to tune the controller around it.
