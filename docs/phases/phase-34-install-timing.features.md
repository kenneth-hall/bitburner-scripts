# Phase 34 — install timing: escalation-aware arming

**Stage:** brainstorm (opus). **Opened:** 2026-07-23.
**Trigger:** a 21.8h flat-M stall caught live 2026-07-23 (BACKLOG entry, same date).
**Status:** decisions proposed, three open questions for Kenneth before spec.

---

## 1. The problem in one paragraph

Augmentation prices escalate ×1.9 per aug bought within a cycle and reset on install
(`AUG_PRICE_LADDER`). The aug ratchet has four ways to decide "install now"; none of them
looks at that escalation. So when the ratchet is money-blocked on an expensive target it
waits — even when the *only* reason the target is expensive is the queue that an install
would clear. On 2026-07-23 it had 11 augs queued (escalation 1.9¹¹ ≈ **1,180×**) and was
waiting 2.2 more hours to afford **FocusWire at $1.048t**, an aug whose base price is
~$888m. A forced install repriced it to ~$888m and the ratchet bought **three augs for
$1.53b within 130 seconds**. Measured install overhead: **~80s** to first purchase.

## 2. Evidence

| Fact | Value | Source |
|---|---|---|
| Time M was flat | 21.8h | `goal-state.json`, `tripwire: STALLED` |
| Queued augs / `totalGain` | 11 / 2.118 | `augfarmer-state.json` |
| Escalation at stall | 1.9¹¹ ≈ 1,180× | `AUG_PRICE_LADDER`, `queuedCount` |
| Target price / base | $1.048t / ~$888m | `state.target.livePrice` |
| Remaining wait | ~2.2h | `(livePrice − money)/income` |
| Install → first aug | **+80.3s** | `transactions-2026-07-23.json` |
| First 130s post-install | 3 augs, $1.53b total | same |
| M banked by install | 3.42 → 6.763 (20% → 40%) | `goal-state.json` |

**Recent install intervals (this node):** 0.14h, 34.91h, 37.39h, 24.17h, 21.86h.

**The ×1.9 ladder is now exactly confirmed.** Phase 31's spec called the generic-aug
multiple *"unmeasured in this fork … treat the exact multiple as approximate"*. Post-install
2026-07-23, Neuregen Gene Modification priced at **$712.5m** at `queuedCount 1` against a
$375m base — `375 × 1.9 = 712.5` to the dollar. **Caveat for the spec:** that data point
requires the immediately-preceding NeuroFlux purchase (+80.3s) to have incremented the same
counter as discrete augs. That is consistent with the observation but not independently
proven, and §6 leans on `queuedCount` being the correct exponent. **Worth one confirming
read before the formula is built on it.**

## 3. Why nothing fired — the four arming reasons

`armed = (gainArmed && phaseArmed && !mustBuyHold) || gateArmed || (stallArmed && !mustBuyHold)`

| Reason | State | Why it didn't fire |
|---|---|---|
| `gainArmed && phaseArmed` | `gainArmed: true` (2.118 ≥ 1.1) | `phaseArmed` requires `idle-plateau` or `grinding`. Phase was **`awaiting-money`**, which never arms. |
| `gateArmed` | false | Red Pill gate not closable by the queue. Correct. |
| `stallArmed` | false | `stall.ageMs` 78.4M vs `thresholdMs` **172.8M (48h)**. See §4. |
| `mustBuyHold` | false (`mustBuyCost: 0`) | FocusWire is not on `UTILITY_ALLOWLIST`. Did not contribute — but see OQ3. |

## 4. The second defect: the stall threshold calibrates off the pathology

`computeStallThreshold` = `STALL_CYCLE_FACTOR (3) × median(last 5 intervals)`, clamped to
`[STALL_MIN_MS 12h, STALL_MAX_MS 48h]`. Median of the five intervals above is 24.17h →
×3 = 72.5h → **clamped to the 48h ceiling**, i.e. the adaptive half is saturated at its
worst permitted value.

The constant's own comment reads *"Observed cycles run 4-8h, so 3× median lands 12-24h in
steady state."* That premise is dead: cycles now run 22-37h. And the reason they run long
is the §1 defect — **so slow cycles raise the threshold, which tolerates slower cycles.**
The detector's input is contaminated by what it is meant to detect. Intervals #13/#14
(34.9h, 37.4h) mean this had been running for days uncaught.

## 4.5. This is Phase 31's fix failing to hold — not a new gap

**Phase 31 (shipped 2026-07-21, `32dd529`) exists to fix exactly this deadlock.** Its spec
records the same shape observed live 2026-07-21: `phase:"awaiting-money"`,
`gainArmed:true, phaseArmed:false, gateArmed:false`, broken only by a manual
`run installer.js`. It sat **71.4h** that time. Two days later it recurred at 21.8h and
again needed a manual install.

**Why the fix stopped working.** Phase 31 wired its new arming reason to
`computeStallThreshold`. At ship time that returned **24h** (`STALL_FALLBACK_MS` — the node
had fewer than 2 measured intervals). Since then the node accumulated intervals, the median
computation took over, and the threshold **doubled to the 48h ceiling**. Phase 31's rule is
still behaving exactly as specified; **the trigger it depends on receded underneath it.**

This is the strongest argument for §7's restructure. Phase 31 was itself a fourth `||` term
bolted onto this expression, it shipped with 10 unit tests, and it still failed in
production within 48 hours — because the failure was in the *coupling* between two rules,
which per-rule unit tests cannot see. A fifth term risks the same outcome.

## 5. Why the obvious fix is wrong

**Rejected: "add a money horizon symmetric to `GRIND_HORIZON_MS`."** The rep side installs
when the rep-deficit horizon exceeds 8h; the natural symmetry is to install when the
money-deficit horizon exceeds some bound. **It would not have fired here** — the remaining
wait was 2.2h, comfortably under any sane bound. The defect is not that the wait was long;
it is that the wait was *unnecessary*. Absolute-duration rules cannot express that.

**Rejected: "arm whenever phase is `awaiting-money`."** Waiting for money is often correct.
Installing wipes faction rep, so an aug with expensive rep already banked but unbought is
worth waiting for. A blanket rule throws that away — see §6's rep term.

**Rejected: "just lower `STALL_MAX_MS`."** Treats the symptom. If §6 lands, cycles shorten
and the median self-corrects. Kept as a fallback, not a primary. → OQ2.

## 6. Proposed decision — an escalation dominance rule

Install when installing is *strictly cheaper than waiting*, comparing like for like:

```
waitMs        = (livePrice − money) / incomePerSec
afterMs       = (livePrice / AUG_PRICE_LADDER**queuedCount) / incomePerSec
escalationArmed :=
     phase === "awaiting-money"
  && gainArmed                                   // the queue is worth banking
  && waitMs > INSTALL_OVERHEAD_MS + afterMs      // install strictly dominates
  && repCostAcceptable                           // §6.1
```

Every input already exists: `livePrice`, `money`, `queuedCount` and `AUG_PRICE_LADDER` are
in scope; `incomePerSec` is already computed in `main()` for `computeFundCap` and needs
only to be **passed into `evalTrigger` as an input** (keeping that function pure — it reads
no wall-clock or live state itself, by design).

`INSTALL_OVERHEAD_MS`: measured 80.3s once (2026-07-23). Propose a conservative constant
well above the measurement rather than a tuned one — the rule is insensitive to it (today:
2.2h vs 89s, a ~90× margin). → OQ4.

### 6.1 The rep term — why this isn't just about money

Installing wipes faction reputation. The legitimate case for waiting is an aug whose rep
was expensive to earn and would have to be re-earned. **In this save that cost collapses**:
NiteSec favor is 303 with `Formulas.exe` on home, so rep is *purchasable* via the S6
donation route — a money cost, not a time cost. A rule that ignores rep would still be
right here but would misfire in a node without donation access.

Proposed: `repCostAcceptable := donationEligible || repReEarnMs < REP_REGRIND_TOLERANCE_MS`,
reusing `planActions`'s existing `donationEligible` derivation rather than re-deriving it.
→ OQ1 (whether this ships in v1 at all).

## 7. Structural recommendation — replace the boolean, don't extend it

`armed` is already four OR'd reasons crossed with two suppressors (`mustBuyHold`,
`endgameHold`) plus `paused`. `evalTrigger`'s own header documents *"the fifth instance of
this file's recurring faction-identity confusion,"* and gap 7's comment records a 25-hour
stall caused by misreading one branch of exactly this expression. **Adding a fifth `||`
term to it is how we get a sixth instance.**

Propose instead: an ordered `decideInstall(inputs) -> {armed, reason, detail}` — same
semantics, one rule per clause, each unit-testable in isolation, and **the winning (or
blocking) reason is persisted to `augfarmer-state.json`.** Today's diagnosis took ~an hour
of reading code to answer "which condition should have fired"; a `reason` field makes that
a one-line read. This is deliberate scope growth over a one-line fix — flagged, not hidden.
→ OQ1.

## 8. Decisions (1-3 settled by Kenneth 2026-07-23) and open questions

**DECIDED 1 — restructure, don't extend.** Replace the `armed` boolean with an ordered
`decideInstall()` returning `{armed, reason, detail}`, persisted to `augfarmer-state.json`.
Accepted cost: a larger diff in this file's most bug-prone function, requiring full unit
re-coverage of all existing arming paths. §4.5 is the justification — a fifth `||` term has
already been tried (Phase 31) and failed in 48h.

**DECIDED 2 — v1 is escalation-only; the rep term is specified but not built.** Correct in
this node (donation makes rep purchasable) and simpler. §6.1 stays in the spec as the
documented extension point with its trigger condition: *build it when a node without
donation access is entered.* Rationale: no test case exists for the rep-expensive branch
here, and untested generality is how the `mustBuyHold` coupling below went unnoticed.

**DECIDED 3 — the escalation rule is exempt from `mustBuyHold`,** the way `gateArmed`
already is. Phase 33's hold assumes the pending must-buy is *cheap*; at 1,180× escalation
that premise fails, and the hold would suppress the fix in precisely the case it exists
for. (Today `mustBuyCost` was 0 — FocusWire isn't allow-listed — so the coupling was latent,
not active.)

### Brainstorm-stage findings (positions for the spec to adopt or overturn)

4. **`INSTALL_OVERHEAD_MS` — use a fixed conservative constant, not an adaptive one.**
   Measured 80.3s once. *Position: hard-code something well above it* (order of ~10 min).
   The rule is insensitive — today's margin was 2.2h against ~90s — and **adaptive
   self-calibration is exactly what produced §4's defect.** Deriving this from
   `ratchet-log.json` the way `computeStallThreshold` derives its median would rebuild the
   same failure mode inside the fix meant to cure it.
5. **NFG interaction — RESOLVED: exclude NFG targets from the rule.** Three reasons:
   (a) NFG uses its own *measured* ladder, `NFG_PRICE_LADDER` **2.166**, not
   `AUG_PRICE_LADDER` 1.9 — the escalation term would simply be the wrong number for it;
   (b) the NFG tail is *designed* to run long within a cycle, so arming on NFG
   money-blocking would fight `spendDownPlan`'s intended ordering; (c) the proven failure
   case is a **discrete** aug, and v1 shouldn't generalise past its evidence (decision 2's
   reasoning applies identically). `target.isNFG` already exists on `pickTarget`'s output
   and is in scope at the call site, so the lever is free. **Revisit trigger:** a cycle
   observed money-blocked on NFG for longer than the stall threshold.
6. **Touch `STALL_MAX_MS`?** → §5. *Position: leave it*, re-measure intervals after a week
   of the new rule, and only clamp down if the median hasn't recovered.
7. **Missing income signal is a silent-failure risk — new, surfaced while working through
   §6.** `incomePerSec` comes from `goal-state.json` and is **`null` whenever that file is
   stale** (existing `goalFresh` check, `augfarmer.js:1978`). Both horizon terms are then
   uncomputable, so the rule can't arm — meaning **a stale log file silently disables the
   fix**, which is the same class of defect as §4. The spec needs an explicit answer:
   at minimum a `detail.incomeAvailable: false` marker and a warn line, so the failure is
   visible rather than inferred. Note the coupling this creates: the fix depends on a
   *different* subsystem's log freshness, and BACKLOG already carries an open bug that the
   log-download bridge stalls undetected mid-session.

## 9. Validation plan (sketch for the spec)

- **Unit:** the arming decision against the 2026-07-23 state as a fixture — 11 queued,
  `totalGain` 2.118, `livePrice` 1.048e12, `money` 3.79e11, `income` 8.5e7 — must arm. Plus
  the inverses: low escalation, no income signal, and NFG target must each **not** arm.
- **Regression:** all four existing arming reasons keep their current behaviour; gap 7's and
  Phase 31's fixtures must still pass. **Suggested constraint for the spec:** if an existing
  `evalTrigger` test needs *editing* to stay green, that's evidence the extraction changed
  behaviour — treat it as a stop-and-re-derive signal, not a test to update.
- **Live:** watch install intervals for ~a week. Success = median cycle back under ~12h and
  `computeStallThreshold` off its 48h ceiling. **This is the real test** — §4's defect is
  only closed when the threshold stops being pinned at its ceiling.
- **Tripwire:** if a cycle again exceeds 24h in `awaiting-money` with 4+ augs queued, this
  fix has failed the same way Phase 31's did — reopen rather than patch. §4.5 is the reason
  this tripwire is written down rather than assumed.
- **Observability:** the `reason` field in `augfarmer-state.json` (§7).

**Note on the ship gate:** the change should be pure logic with no new `ns` surface, so
`ramcheck.js` should read **64.10 GB** for `augfarmer.js`, unchanged — same
pure-logic-only confirmation Phase 31 used. If it doesn't, suspect CLAUDE.md's
identifier-hygiene footgun before assuming a real cost.

## 10. Not in scope

- The escalation-blindness of `pickTarget` itself (whether target *selection* should prefer
  cheap augs late in a cycle). Related, larger, separate.
- The NFG rep-requirement tail (existing BACKLOG entry).
- Anything stock-engine (`docs/stock-engine.md`) — unrelated, same-day only by coincidence.
