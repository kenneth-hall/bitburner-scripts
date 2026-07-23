# Phase 34 spec: escalation-aware install timing (`decideInstall` restructure)

**Stage:** spec (drafted fable 2026-07-23, from `phase-34-install-timing.features.md`).
**Model flow:** brainstorm opus → this spec (fable) → cold review by `spec-reviewer` → implement (sonnet).
**Scope:** `src/augfarmer.js`'s install-arming logic only — one new pure function, three new
`evalTrigger` inputs, one new constant, wiring, tests. No other script changes.

## Context

The aug ratchet's four arming reasons are all escalation-blind, so a money-blocked cycle waits
for prices the queue itself inflated. Caught live 2026-07-23: 21.8h of flat M with 11 augs queued
(escalation 1.9¹¹ ≈ 1,180×), waiting 2.2 more hours for FocusWire at $1.048t against a ~$888m
base; a forced install repriced it and bought three augs for $1.53b inside 130 seconds. This is
also **Phase 31's fix failing to hold**: its `stallArmed` backstop keys off
`computeStallThreshold`, whose adaptive median has been dragged to the 48h ceiling *by the slow
cycles the defect causes* — the trigger receded underneath the rule that depends on it
(features §4/§4.5). Full evidence table: features §2.

**Measured at spec stage — the features' §2 caveat is resolved.** The features asked for one
confirming read before building the formula on `queuedCount` as the escalation exponent.
`logs/transactions-2026-07-23.json`, post-install purchase sequence, each to the dollar:
NFG $750,000 (= base × 1.9⁰) → Neuregen $712,500,000 (= $375m × 1.9¹) → CRTX42-AA $812,250,000
(= $225m × 1.9²) → ADR-V2 $3,772,450,000 (= $550m × 1.9³) → HyperSight $35,838,275,000
(= $2.75b × 1.9⁴) → Unstable Circadian Modulator $123,804,950,000 (= $5b × 1.9⁵). Two facts
this pins: (a) an NFG level increments the **same** per-purchase counter as a discrete aug
(Neuregen's exponent is 1, not 0), and (b) the exponent is exactly the raw purchase count this
cycle — which is exactly `queuedCount` (`queuedNames.length` from
`multisetDiff(ownedTrueRaw, ownedInstalled)`, NFG levels as separate entries, the same raw-count
convention Phase 31 settled for `STALL_QUEUE_FLOOR`). So
`livePrice / AUG_PRICE_LADDER**queuedCount` recovers base price exactly.

Decisions 1–3 below were settled by Kenneth in the features doc (2026-07-23) and are restated
only as build requirements; decisions 4–8 resolve the features' brainstorm-stage positions
(§8 items 4–7) at spec stage.

## Ground rules

- **`augfarmer.js` RAM must measure unchanged (64.10 GB).** Pure-logic change: the three new
  `evalTrigger` inputs (`livePrice`, `incomePerSec`, `targetIsNFG`) are all derivable from
  locals already computed in `main()` (L2050, L1978, and `target.aug` — see the cold-review
  correction in decision 4); no new `ns` call sites anywhere. Any surprise reading is checked
  against the identifier-hygiene bug class first.
- **Identifier hygiene:** new identifiers are `decideInstall`, `escalationArmed`, `waitMs`,
  `afterMs`, `overheadMs`, `basePrice`, `blockers`, `gainPhase`, `escalationFactor`,
  `targetIsNFG`, `incomeAvailable`, `incomeWarnActive`, `INSTALL_OVERHEAD_MS` — none collide
  with an `ns.*` method/property name;
  keep it that way in implementation (no `ls`/`ps`/`run`/`share`/`kill`-class short names).
- No Singularity additions, no daemon/dashboard changes, **dashboard untouched** (Phase 24
  gate). Observability goes to `augfarmer-state.json` (via the existing `trigger` block) and
  `ratchet-decisions.json` (via the existing `trigger-arm`/`trigger-fire` records, which embed
  the whole trigger state) — both additive-field-only, both already read tolerantly.
- No spend/purchase paths are touched — this phase changes *when* an install arms, never how
  money is spent or logged (`recordTransaction` call sites unchanged).
- Tests: vitest units for every pure-function change; `npm run verify:log` stays green; live
  validation steps marked **[live]**.
- All numbers come from our own exported logs and API reads; no game-source reading.

## Spec-stage decisions

1. **Restructure, don't extend (features DECIDED 1 — build shape).** The five-way arming
   decision moves out of `evalTrigger`'s inline block (L1028–1095) into a new exported pure
   function `decideInstall(ctx)` that evaluates an **ordered rule list** — `gate`,
   `gain-phase`, `stall`, `escalation` — and returns `{armed, reason, blockers, reasons,
   mustBuyHold, horizonMs, escalation}`. `armed` is the OR of the rules (semantics of the
   existing expression preserved exactly, plus the new fourth rule); `reason` is the **first**
   armed rule's name in that order, `null` when none armed; `blockers` maps each non-armed rule
   to its first failing guard (vocabulary in work item 1) so "which condition should have fired
   and why didn't it" is a one-line read of `augfarmer-state.json`. `evalTrigger` keeps its
   public signature, its input destructure (three new inputs added, explicit defaults per file
   convention), the NFG projection/`totalGain` computation, and the sustain/latch/fired shell —
   it calls `decideInstall` where the inline block was and merges the result into its return.
   Rationale for the wrapper shape: every call site and every existing test targets
   `evalTrigger`; keeping it as the shell means the restructure is testable both directly
   (new `decideInstall` units per rule) and by passthrough (existing `evalTrigger` fixtures),
   which is the "full unit re-coverage of all existing arming paths" DECIDED 1 requires.
2. **The escalation rule (features §6, adopted with unit fixes).** In `decideInstall`:

   ```
   basePrice  = livePrice / AUG_PRICE_LADDER ** queuedCount
   waitMs     = (livePrice - money) / incomePerSec * 1000      // afford at current price, from current money
   afterMs    = basePrice / incomePerSec * 1000                // afford at reset price, from ~$0 (install wipes money)
   escalationArmed :=
        phase === "awaiting-money"
     && gainArmed                       // inherits !paused && !endgameHold && totalGain >= MIN_TOTAL_GAIN && queuedCount >= 1
     && !targetIsNFG                    // decision 5
     && livePrice != null && incomePerSec > 0
     && waitMs > INSTALL_OVERHEAD_MS + afterMs   // install strictly dominates waiting
   ```

   `afterMs` charges the post-install path the **full** base price because an install wipes
   money to ~$1k — the features' formula already accounted for this; the wiped bankroll isn't
   lost (spend-down converts it to queued augs) but it can't also fund the re-buy, so this is
   the honest-to-conservative accounting. Guards resolve in the order written; `incomePerSec`
   is $/sec (goal-state's `income.perSec`, 10-min smoothed), hence the `* 1000`. Two edge
   notes (cold-review minors 2/3): a numeric-zero income is a distinct blocker
   (`"zero-income"`, work item 1) so the staleness WARN can't misdiagnose it; and the
   deflation math assumes the **live** `getAugmentationPrice` read — the L2061
   stale-catalog fallback is itself an escalated price and stays approximately valid, but a
   catalog captured at a different `queuedCount` drifts the recovered base. Accepted:
   transient (Phase 33's per-pass refresh re-reads every unowned aug each 10s pass), and an
   error there only perturbs `afterMs`, the small term.
   `armed = (gainArmed && phaseArmed && !mustBuyHold) || gateArmed ||
   (stallArmed && !mustBuyHold) || escalationArmed` — the escalation term carries **no
   `!mustBuyHold`** (features DECIDED 3: at deep escalation the hold's cheap-must-buy premise
   fails; `gateArmed` sets the precedent for the exemption). Residual accepted cost: an
   escalation-armed install can fire with must-buys unaffordable and skip them that spend-down;
   next cycle they're at reset prices and the hold re-engages — documented, not guarded.
3. **`INSTALL_OVERHEAD_MS = 600_000` (10 min), fixed constant (features position 4, adopted).**
   Measured overhead was 80.3s once; 10 min is ~7.5× that, and the rule is insensitive to it
   (the live case's margin was 2.2h vs ~90s). Deliberately **not** adaptive: deriving it from
   `ratchet-log.json` the way `computeStallThreshold` derives its median would rebuild §4's
   self-calibrating-off-the-pathology failure mode inside the fix for it. Exported next to the
   STALL_* constants, added to `buildDecisionRecord`'s `constants` block (the Phase 25/33
   convention, so observe data can re-derive a better value offline).
4. **NFG targets are excluded (features position 5, adopted — with a factual correction).**
   `escalationArmed` requires `!targetIsNFG`. Three reasons, all from the features: NFG's
   ladder is 2.166 not 1.9 (the deflation term would be the wrong number), the NFG tail is
   *designed* to run long (arming on it would fight `spendDownPlan`'s ordering), and the
   proven failure case is a discrete aug (don't generalise past the evidence).
   **Cold-review blocker 1, resolved:** the features claimed `target.isNFG` "already exists on
   `pickTarget`'s output" — **false**. `pickTarget` returns `{...top, candidates}` (L796–797)
   and `top`'s fields (L746–761) carry no `isNFG` key (`info.isNFG` is consumed internally at
   L757/L760, never propagated), so `!!target?.isNFG` would be permanently `false` and the
   exclusion silently dead — an NFG target would then arm on the wrong ladder, the exact
   failure this decision prevents. Fix: the caller derives
   `targetIsNFG: !!target && target.aug === NFG_NAME` (`NFG_NAME` is already in scope
   throughout `main()`, e.g. L2158) — no `pickTarget` change, no new surface. Revisit trigger,
   logged in BACKLOG at ship: a cycle observed money-blocked on NFG longer than the stall
   threshold.
5. **v1 has no rep term; the extension point is specified here (features DECIDED 2).** The
   escalation rule as built assumes re-earning the target faction's rep after the install is
   cheap. **The dominance formula omits that cost entirely (cold-review major 1, accepted
   explicitly):** `afterMs` charges only the aug's reset money price — the post-install
   rep-re-earn (or its S6 donation buyout) is *not* folded in, so the rule carries a known
   optimistic bias toward installing. Accepted for v1 because in this save the bias is
   near-zero in practice: NiteSec rep re-accrues from gang respect without player work, and the
   2026-07-23 install re-bought rep-met NiteSec augs at +80s — the re-earn was already done
   before the first purchase; where a donation would be needed, NiteSec favor 303 with
   Formulas on home makes it a bounded money cost dwarfed by deep-escalation waits (the proven
   case's margin was ~90×). In a node without donation access the omission becomes unsafe —
   which is exactly the build trigger below. **Extension point:**
   a fifth conjunct `repCostAcceptable := donationEligible || repReEarnMs <
   REP_REGRIND_TOLERANCE_MS`, where `donationEligible` reuses `planActions`'s existing
   derivation (favor ≥ `getFavorToDonate()`), slots between `!targetIsNFG` and the dominance
   term. **Build trigger:** entering a node where the head target's faction cannot reach
   donation eligibility. Until then the clause does not exist in code — untested generality is
   how Phase 33's `mustBuyHold` coupling went unnoticed (features DECIDED 2's rationale).
6. **Missing income signal fails loud, not silent (features position 7, adopted).**
   `incomePerSec` is `null` whenever `goal-state.json` is stale (`goalFresh`, L1978) — both
   horizon terms are then uncomputable and the rule cannot arm, meaning a stale log file would
   silently disable this fix (§4's defect class). Mitigation, minimal per the features: the
   escalation rule's blocker reads `"no-income-signal"` in `blockers.escalation` (persisted via
   the state file's `trigger` block every write), and the main loop emits **one**
   `tprintTs` WARN on the rising edge of "escalation rule is blocked solely by missing income"
   (all other guards pass), tracked by an `incomeWarnActive` local, cleared when income returns
   or the phase moves on. Rising-edge-only because of the terminal-flood lesson (BACKLOG's
   `daemon.js` retry-spam entry). No new decision kind — the state file plus the WARN is the
   features' stated minimum, and `trigger-arm` records already capture the full context when it
   *does* arm. Accepted coupling, restated from the features: this fix depends on `goallog.js`'s
   log freshness, and BACKLOG carries an open bug that the log-download bridge stalls
   undetected — that bug's fix is not in this phase's scope, the WARN is the tripwire.
7. **`STALL_MAX_MS` and the stall machinery are untouched (features position 6, adopted).**
   The stall threshold's contamination (§4) is expected to self-correct: the escalation rule
   ends the pathological cycles, the median recovers, and `computeStallThreshold` comes off its
   48h ceiling. That recovery is **live acceptance criterion V2**, not an assumption — if after
   ~a week the median hasn't recovered, clamping `STALL_MAX_MS` down is the logged fallback
   (open question 2). `stallArmed` itself survives unchanged as the backstop for non-money
   stalls the escalation rule can't see.
8. **Existing-test policy — the features' §9 constraint, made precise.** The features suggested
   "if an existing `evalTrigger` test needs *editing* to stay green, treat it as a
   stop-and-re-derive signal." As literally written that is unsatisfiable: adding
   `escalationArmed` to the returned `reasons` map mechanically breaks every exact-match
   `expect(t.reasons).toEqual({...})` assertion, exactly as Phase 31's `stallArmed` did (its
   spec's "Regression handling" block is the precedent). Resolution: **shape-extension edits
   are expected and permitted** — adding `escalationArmed: false` to a `toEqual` map, adding
   the new return fields to whole-object assertions — and each such edit cites this spec in a
   comment. **Any change to an existing key's *expected value*, or any armed/fired flip in an
   existing fixture, is the stop-and-re-derive signal** — that's the evidence the extraction
   changed behaviour, and it gets re-derived, not patched green. Per Phase 31's load-bearing
   note, every legacy arming-path fixture asserts `escalationArmed: false` explicitly, so a
   future regression in a shared fixture can't be masked by the new rule firing instead.

## Design

### Work item 1 — `decideInstall` (new exported pure function) [code]

Extract L1028–1095's arming logic verbatim into `decideInstall(ctx)`;
`ctx = {totalGain, queuedCount, money, phase, targetFaction, deficit, repRates, rateSamples,
paused, endgameHold, gateRelease, stalled, mustBuyCost, mustBuyCap, livePrice, incomePerSec,
targetIsNFG}` (explicit defaults per file convention; the last three default `null`/`null`/
`false`). Internally it computes, in this order, each rule's armed flag and — when not armed —
its first failing guard:

- **`gate`**: unchanged semantics (`gateRelease?.closedByQueue && queuedCount >= 1 && !paused`).
  Blocker vocabulary: `"no-gate-release"`, `"no-queue"`, `"paused"`.
- **`gain-phase`**: unchanged semantics (`gainArmed && phaseArmed && !mustBuyHold`, with
  `horizonMs` computed as today). Blockers: `"paused"`, `"endgame-hold"`, `"no-queue"`,
  `"gain-below-min"`, `"phase:<label>"` (e.g. `"phase:awaiting-money"`), `"no-rate-sample"`,
  `"horizon-under-bound"`, `"mustbuy-hold"`.
- **`stall`**: unchanged semantics. Blockers: `"not-stalled"`, `"grinding"`,
  `"queue-below-floor"`, `"mustbuy-hold"` (plus the shared `"paused"`/`"endgame-hold"`/
  `"no-queue"`).
- **`escalation`**: decision 2's rule. Blockers, in guard order:
  `"phase-not-awaiting-money"`, `"gain-not-armed"`, `"nfg-target"`, `"no-live-price"`,
  `"no-income-signal"` (income `null` — stale/missing `goal-state.json`), `"zero-income"`
  (income supplied but ≤ 0 — decision 2's edge note; no staleness WARN),
  `"wait-not-dominant"`.

Returns `{armed, reason, blockers, reasons: {gainArmed, phaseArmed, gateArmed, stallArmed,
escalationArmed}, mustBuyHold, horizonMs, escalation}` where `escalation` is the diagnostic
detail `{waitMs, afterMs, overheadMs, basePrice, escalationFactor, incomeAvailable}` (numbers
`null` when uncomputable; `escalationFactor = AUG_PRICE_LADDER ** queuedCount`;
`incomeAvailable = incomePerSec > 0`). `blockers` keys are `{gate, gainPhase, stall,
escalation}` (a rule that armed maps to `null`); it is always computed (also when armed — it
then documents the non-winning rules), each entry the rule's **first** failing guard in that
rule's stated order, so the strings are deterministic and unit-testable. The reported `reason`
follows rule order `gate → gain-phase → stall → escalation` (most-specific first; order
affects reporting only, never `armed`).

### Work item 2 — `evalTrigger` becomes the shell [code]

Destructure gains `livePrice = null`, `incomePerSec = null`, `targetIsNFG = false`. The inline
arming block is replaced by a `decideInstall` call (passing `totalGain` and the relevant
inputs); sustain/latch/fired logic and the latch shortcut are untouched and operate on
`decideInstall`'s `armed`. Return object: all existing fields unchanged, `reasons` extended
with `escalationArmed`, plus the new `reason`, `blockers`, `escalation` fields — which then
flow into `augfarmer-state.json` (`trigger:` block, L2635) and the `trigger-arm`/`trigger-fire`
decision records with **zero extra wiring**, satisfying DECIDED 1's persistence requirement.
The doc-comment header gets the fifth-reason paragraph and a pointer to this spec.

### Work item 3 — main-loop wiring + income WARN [code]

`triggerInputs` (L2214) gains `livePrice` (the local from L2050), `incomePerSec` (the local
from L1978 — already in scope from Phase 33's fundCap wiring), and
`targetIsNFG: !!target && target.aug === NFG_NAME` (decision 4's corrected derivation — NOT
`target?.isNFG`, which doesn't exist on `pickTarget`'s output). All three are computed before the trigger block; no
reordering, no new reads, no new `ns` surface. After `evalTrigger` returns: decision 6's
rising-edge WARN — when `triggerState.blockers?.escalation === "no-income-signal"` and
`!incomeWarnActive`, `tprintTs` one WARN naming the stale `goal-state.json` dependency and set
the local; clear the local when the blocker is anything else or the rule arms.
`INSTALL_OVERHEAD_MS` exported next to the STALL_* constants and added to
`buildDecisionRecord`'s `constants` block.

### Work item 4 — tests [code]

`test/augfarmer.test.js`, all pure-function units:

- **`decideInstall` — escalation rule.** (a) **The 2026-07-23 live fixture must arm**:
  `phase "awaiting-money"`, `queuedCount 11`, `totalGain 2.118`, `livePrice 1.048e12`,
  `money 3.79e11`, `incomePerSec 8.5e7`, `targetIsNFG false` → `armed: true`,
  `reason: "escalation"`, `reasons.escalationArmed: true` (arithmetic check: waitMs ≈ 7.87e6 >
  6e5 + afterMs ≈ 1.04e4). (b) **Not a wait-duration rule**: same fixture with `money` raised
  so waitMs ≈ 20 min still arms (the wait is short but *unnecessary* — this pins the §5
  rejection of a money-horizon rule). (c) **Low escalation must not arm**: `queuedCount 1`,
  `livePrice` near base, `money` close enough that `waitMs <= overhead + afterMs` →
  `blockers.escalation: "wait-not-dominant"`. (d) **No income** (`incomePerSec: null`, all
  other guards passing) → not armed, `blockers.escalation: "no-income-signal"`,
  `escalation.incomeAvailable: false`. (e) **NFG target** (`targetIsNFG: true`) →
  `"nfg-target"`. (f) **Wrong phase** (`"grinding"`, `"idle-plateau"`) →
  `"phase-not-awaiting-money"`. (g) **mustBuyHold exemption pin (cold-review blocker 2,
  corrected):** fixture with `stalled: true`, `phase: "awaiting-money"`, `mustBuyHold` active
  (`0 < mustBuyCost ≤ mustBuyCap`, `money < mustBuyCost`), and a dominant escalation wait →
  `armed: true`, `reason: "escalation"`, `blockers.stall: "mustbuy-hold"` (the stall rule
  reaches its hold guard here), `blockers.gainPhase: "phase:awaiting-money"` (its **first**
  failing guard — NOT `"mustbuy-hold"`, which `gain-phase` can only report from an arming
  phase). Companion assertion: the same fixture with `targetIsNFG: true` → `armed: false` —
  pins that the exemption, not some other path, is what fires. (h) **paused / endgameHold** →
  not armed (inherited via `gainArmed`), blocker `"gain-not-armed"`. (i) **Strict boundary**:
  `waitMs === overhead + afterMs` exactly → not armed (pins strict `>`). (j) **Zero income**
  (`incomePerSec: 0`) → not armed, `blockers.escalation: "zero-income"` (distinct from (d)).
- **`decideInstall` — existing-path re-coverage (DECIDED 1).** Direct units per rule: gate
  arms regardless of endgameHold/mustBuyHold; gain-phase arms on `idle-plateau`, on gap-7's
  no-faction-owed `grinding`, and on a long horizon; stall arms via the gain branch and via
  the queue-floor branch, blocked by `"grinding"` and by `"mustbuy-hold"`. Each mirrors an
  existing `evalTrigger` fixture so the two layers cross-check.
- **`evalTrigger` passthrough.** (a) **Defaults regression**: omitting the three new inputs
  reproduces today's behaviour on the Phase 31 and gap-7 fixtures — `reason`/`blockers`
  present, `reasons.escalationArmed: false`, no armed/fired value changes. (b) Sustain + latch
  parity for an escalation-armed state (mirror of Phase 31's case 10: sustains to `fired`
  after `TRIGGER_SUSTAIN_MS`, latches in auto mode).
- **Existing assertions**: shape-extension edits only, per decision 8 (each cites this spec);
  any expected-value change is a stop signal.
- `npm run verify:log` unchanged in shape — **verified at spec stage (cold-review minor 4)**:
  `test/verify-ratchet.test.js` validates decision records via `toMatchObject` on
  `{timestamp, time, kind}` + a mode check only, no per-kind shape or key whitelist, so the
  additive `reason`/`blockers`/`escalation` fields inside embedded trigger state need no
  checker edits.

### Work item 5 — docs [code]

`BACKLOG.md`: the "awaiting-money is escalation-blind" bug entry is resolved by this phase —
on ship it leaves BACKLOG for a condensed dated `docs/phases/CHANGELOG.md` entry; its (b)
sub-gap (48h internal threshold vs CLAUDE.md's 12h tripwire) folds into V2's recovery check,
with the `STALL_MAX_MS` clamp-down as the logged fallback. Add the NFG revisit trigger
(decision 4) as a parked idea with its wake-up condition. Phase docs graduate to
`docs/phases/` with the ship commit.

## Live procedure [live]

- **L1 (immediate):** after deploy + `node tools/bb/cli.mjs restart augfarmer.js`, within one
  poll `augfarmer-state.json`'s `trigger` block carries `reason` and `blockers` (populated, not
  undefined) and `reasons.escalationArmed` exists. No RUNTIME ERROR popup (check per CLAUDE.md's
  CDP rule).
- **L2 (first occurrence, expected within ~a day given current cadence):** the next time a
  cycle enters `awaiting-money` with `gainArmed: true` and a dominant wait, the trigger arms
  with `reason: "escalation"` — visible as a `trigger-arm` record in `ratchet-decisions.json`
  whose embedded trigger state shows the escalation detail — and the install fires unattended
  (no manual `run installer.js`).
- **L3 (soak, ~1 week):** install intervals in `ratchet-log.json`: median cycle back under
  ~12h and `stall.thresholdMs` in `augfarmer-state.json` off the 48h ceiling
  (< 172,800,000 ms). **This is the real test** — §4's defect is only closed when the
  threshold stops being pinned.
- **Tripwire (reopen, don't patch):** a cycle exceeding 24h in `awaiting-money` with ≥4 augs
  queued after this ships means the fix failed the same way Phase 31's did — reopen the phase
  per features §9; §4.5 is why this is written down rather than assumed.

## Acceptance criteria

Test-gated (Claude clears): **T1** `npm test` green including every work-item-4 unit, with
decision 8's policy applied (no expected-value edits to existing fixtures); **T2**
`npm run verify:log` green post-deploy against real logs.

RAM-gated [live]: **R1** `augfarmer.js` unchanged at 64.10 GB (`ramcheck.js`); surprises
checked against identifier-hygiene first.

Live-gated [live]: **V1** = L1 (state file shows the new fields, clean restart); **V2** = L3
(median interval recovers and the stall threshold comes off its ceiling); L2 is opportunistic
evidence logged in the close-out when it occurs (same treatment as Phase 31's live gate —
contingent on game state, not a merge blocker).

Ship gate per CLAUDE.md: T1/T2 self-cleared; R1/V1 wait on Kenneth's in-game run; then merge +
push without further sign-off. V2 spans ~a week — it lands in the close-out, with the tripwire
above as its failure handler.

## Files touched

- `src/augfarmer.js` — `decideInstall` (new pure export), `evalTrigger` shell + three inputs,
  main-loop wiring + income WARN, `INSTALL_OVERHEAD_MS`
- `test/augfarmer.test.js` — new/updated units per work item 4
- `BACKLOG.md` (+ CHANGELOG/doc graduation at ship)

## Open questions (log, don't block)

1. **`INSTALL_OVERHEAD_MS = 600_000` is provisional** like every trigger constant. It rides in
   every decision record; if live data ever shows installs arming on thin margins (waitMs only
   slightly over the bound) with real overhead above 10 min, raise the constant — redesign only
   if tuning fails twice (the three-invalidations rule).
2. **If V2's median doesn't recover in ~a week**, clamp `STALL_MAX_MS` down (features §5 kept
   it as fallback, not primary) — a constant edit, logged in BACKLOG with the measurement that
   justified it.
3. **The rep term (decision 5)** stays spec-only until a no-donation node is entered; building
   it earlier adds an untestable branch (no rep-expensive case exists in this save).
4. **`blockers` when armed** documents the non-winning rules; if it proves noisy in the state
   file it can be narrowed to unarmed-only — display-shape change, not semantics.
