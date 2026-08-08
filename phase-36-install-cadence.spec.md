# Phase 36 spec: install cadence — converting money into M

**Stage:** spec (drafted 2026-07-28 from `phase-36-install-cadence.features.md`; revised twice the
same day against cold reviews by `spec-reviewer`).
**Model flow:** brainstorm opus → this spec → cold review ×2 → implement (sonnet).
**Scope:** make the aug ratchet end a cycle when continuing it is negative-M, stop buying augs that
cannot pay their own ladder cost, and make the trigger's arm survive a restart and its disarms
legible. Four work items, all in `augfarmer.js`. No `scheduler.js`/`daemon.js` changes (Phase 37).

## Context

The features doc diagnosed a **horizon treadmill**: the grind arm fires only when the rep horizon
*exceeds* `GRIND_HORIZON_MS`, and a queue with any depth keeps producing sub-bound horizons
indefinitely, so `$38.7t` sat idle at a **613× price ladder** for 45.5h. It shipped a stopgap
(`GRIND_HORIZON_MS` 8h → 1h, D5) and delegated three questions to this stage.

### R0 (2026-07-28 19:22–19:46) — the drift gate, and what it found

**The stopgap fired an install mid-drafting, and it worked.** Install **#26 at 19:43:01**,
unattended: M **1.6029 → 1.9703** (+22.9%), `tripwire.status` `STALLED` → `ON TRACK`, spend-down
bought **12 NFG levels for $39.317t** — exactly `nfgLevelsProjected: 12`, with the realised M ratio
(1.229190) matching projected `totalGain` (1.229182) to five digits. The 45.5h stall is over and the
bank is spent. Per the features doc's §7f instruction this spec is written against the
**post-install** state: the phase is no longer urgent, and its job is now **preventing the
recurrence**, not rescuing a melting bank.

**Three findings the features doc could not have had.** All three change what this spec contains:

- **F-A — a restart silently voids the arm, and one did.** `armedSinceMs` lives only in the loop's
  in-memory `triggerState` (`augfarmer.js:1296-1297`) and `previousPhase` initialises to `null`
  (`:2006`), so the first pass after any start evaluates `phase:null` → disarmed, and the next
  ~5 min report `no-rate-sample` (`RATE_MIN_SAMPLES` 30 × `POLL_MS` 10s) before a horizon can even
  be computed. The 19:16:24 arm reached **300s of its required 600s** and then died: the game
  restarted at **19:28:01** (`daemon-batch-log.json` opens with a fresh `mode` event and a full
  member re-`enter` set at that timestamp; `ratchet-decisions.json` carries two start-shaped
  `endgame-hold`/`camp-choice` pairs at 19:28:00 and 19:28:01). **Any restart cadence under
  ~15 min makes firing arithmetically impossible**, independent of every predicate this phase
  otherwise changes. The install that did fire came from an arm that got 10 uninterrupted minutes
  on its third attempt.
- **F-B — disarms are invisible in the mode we actually run.** `trigger-clear` is appended only when
  `mode !== "auto"` (`:2514`). The record therefore shows **17 `trigger-arm` events between
  2026-07-27 19:01 and 22:24 with horizons of 16–21h — far over the then-8h bound — and zero
  fires**, with nothing saying why any of them ended. That is the same window the *superseded* draft
  diagnosed as a cloudmanager money race (`mustBuyHold` flapping as the balance oscillated). Two
  consecutive brainstorms each sampled one snapshot of an oscillating system and named a different
  single cause; this is the instrument that ends that.
- **F-C — the ladder, not the cash, is what the zero-M augs cost.** Measured below.

### The measurements the open questions asked for (§5 Q3/Q4)

From `augfarmer-catalog.json` + the completed cycle's `boughtThisCycle`:

| # | Aug | score | `hackingMult` | paid |
|---|---|---|---|---|
| 0 | NeuroFlux Governor | 0.023 | 1.01000262 | $3.3M |
| 1 | ADR-V1 Pheromone Gene | 0.050 | **1** | $0.07b |
| 2 | Social Negotiation Assistant | 0.075 | **1** | $0.22b |
| 3 | Neuregen Gene Modification | 0.200 | **1** | $5.14b |
| 4 | Neuralstimulator | 0.063 | **1** | **$78.19b** |
| 5 | Neuroreceptor Management Implant | 0.250 (allowlist) | **1** | $27.24b |
| 6 | DataJack | 0.038 | **1** | $42.34b |
| 7 | Artificial Synaptic Potentiation | 0.028 | **1** | $14.30b |
| 8 | Neurotrainer II | 0.075 | **1** | $15.29b |
| 9 | Embedded Netburner Module | 0.080 | **1.08** | $161.34b |

**Nine of ten buys moved M by exactly nothing** — $182.8b, 53% of the cycle's $344.1b spend.
`queuedGain` is the product of these mults (1.0908, matching the live field exactly), so **the
trigger's own gain metric already scores those nine at 1.0.**

**The ladder premise, derived from constants in the file rather than asserted:**
`NFG_PRICE_LADDER` **2.166 = `AUG_PRICE_LADDER` 1.9 × `NFG_REP_LADDER` 1.14** — exactly, and the
three constants were measured *independently* (`:135-142`, `:144-149`, `:167-181`), so the identity
is a cross-check rather than a definition. It is the proof: NFG level *j*, bought after *d* discrete
augs, costs `p · 1.14^j · 1.9^(d+j) = (p · 1.9^d) · 2.166^j`. So **each discrete purchase multiplies
the NFG tail's effective start price by 1.9**, and the tail keeps its measured 2.166 ladder. One
extra purchase therefore costs `ln(1.9)/ln(2.166) = 0.830` NFG levels ≈ **−0.83% M**, so a discrete
aug is worth its ladder step only at **`hackingMult ≳ 1.0083`**. (`catalog.augs[x].price` is
`ns.singularity.getAugmentationPrice` (`:1880`) and therefore already carries `1.9^d`, which is why
`p · AUG_PRICE_LADDER` is the correct post-purchase start price.)

**Confirmed against the completed install, not just projected:** the spend-down bought **12** levels
with $39.317t at the 613×-laddered start price of $2.301b. At the unladdered base of $3.753M the
same money buys **21**. The nine zero-M augs cost **~9 NFG levels ≈ −8.6% M** — while their cash was
$182.8b, **0.45% of the bank**. The ladder was ~95% of their true cost, and this cycle only Embedded
Netburner Module (1.08) cleared the bar.

**Q4 is answered and is a non-issue.** `mustBuyNames` is selected **by name** from
`UTILITY_ALLOWLIST` (`:2412-2414`) and `spendDownPlan` plans must-buys **first** (`:1515-1518`), so
`mustBuyCost` is computed over the allowlist set alone. A filter that removes non-allowlist
candidates cannot change it, and cannot disturb the price-DESC order the `mustBuyTotal` guarantee
depends on.

**Q3 is answered by Kenneth's spec-stage call: the marginal-M rule, allowlist exempt** — not a score
floor. Score mixes exp/rep/money/speed and demonstrably cannot separate the one +8% M aug (score
0.080) from a $78b zero-M aug (0.063). Crediting exp does not change the verdict: at M ≈ 1.6 against
a 4,500 level gate, a +40% `hacking_exp` aug is worth roughly `32·ln(1.4)·M ≈ 17` levels ≈ **+0.38%
M-equivalent**, under the 0.83% ladder cost it would pay. An estimate, not a proof — open question 3.

**Q1 dissolves rather than resolves.** It asked how to model the rep-side asymmetry (the grind
horizon does not vanish at install, it *resets longer* because rep is wiped) for an EV comparison.
This spec never makes that comparison: the arm does not claim *installing is faster than waiting*, it
claims **waiting cannot help** — everything still buyable is negative-M at this ladder depth. No
post-install rep model is needed for that. The crux the features doc flagged as unmodelled is removed
rather than approximated.

## Ground rules

- **RAM must measure unchanged** for `augfarmer.js` (live `ramcheck.js` baseline is the gate; the
  64.1 GB figure in `daemon.js:240`'s comment is indicative only). Every addition is pure arithmetic
  over values the loop already holds, plus `ns.read`/`ns.write` (0 GB) on files it already reads and
  writes. Any delta is checked against the identifier-hygiene bug class **first**.
- **Identifier hygiene:** new identifiers are `nfgLevelsExact`, `nfgLevelsByMoney`,
  `augIsWorthLadder`, `ladderCountsFrom`, `resolveArmResume`, `shouldLogClear`, `marginalCtx`,
  `marginalBlocked`, `ladderExempt`, `bestWantedMult`, `blockedCount`, `worthyCount`,
  `ladderCounts`, `ladderArmed`, `ladderBlocker`, `LADDER_FILTER_MIN_MULT`,
  `ARM_RESUME_MAX_AGE_MS`, `CLEAR_LOG_MIN_INTERVAL_MS`, `resumedArmSinceMs`, `triggerArmChanged`,
  `lastClearLogMs`, `lostSustainedMs`, `suppressedCount`. None matches an `ns.*` method or property
  reachable from any namespace (`ns`, `ns.ui`, `ns.cloud`, `ns.singularity`, `ns.format`, …); no
  short `ls`/`ps`/`rm`/`run`/`kill`/`read`/`write`/`scan`/`hack`/`grow`/`weaken`/`share`/`exec`/
  `tail` names, and no object key named for one (bracket notation if that ever becomes necessary).
- **No new spend paths, and no newly *enabled* ones.** This phase only suppresses purchases and
  re-times an install. The second clause is load-bearing: cold review 2 found that a mechanical
  patch to `normalBuyAvailable` would have *opened* the gate-fill purchase path in exactly the state
  this phase creates (work item 2).
- **No new log file, no dashboard change.** Work item 4 extends existing decision records in an
  existing file; the arm's persisted fields extend an existing state file. The dashboard gate is not
  engaged.
- **Loop-inline code is not testable here** — every existing test in `test/augfarmer.test.js`
  exercises exported pure functions only, and `main()`'s `while (true)` loop is unreachable from
  vitest. Any new behaviour an acceptance criterion depends on **must be an exported pure function**
  with the loop reduced to a call site. Named extractions: **`nfgLevelsExact`, `augIsWorthLadder`,
  `ladderCountsFrom`, `resolveArmResume`, `shouldLogClear`** — five, not four. `ladderCountsFrom` is
  on the list because it is the *wiring* between `pickTarget`'s marking and `decideInstall`'s arm,
  and this file has already shipped two live bugs in exactly that seam while the unit tests either
  side stayed green (`test/augfarmer.test.js:864`'s own comment).
- **Existing-test policy.** *Shape-extension* edits (new fields in `toEqual` maps) are expected and
  cite this spec. **No behavioural supersession is authorised.** The first draft claimed one
  (rewriting 1h → 8h fixtures); both cold reviews confirm `test/augfarmer.test.js:18` imports
  `GRIND_HORIZON_MS` symbolically and no fixture depends on its absolute value (the nearest,
  `:863-899`, derives a ~13.1h horizon), so the revert needs no fixture edit. **Any expected-value
  change in an existing fixture is the stop-and-re-derive signal.**

## Spec-stage decisions

1. **The ladder cost must be charged CONTINUOUSLY, not from the floored level count.** This is the
   defect cold review 2 found in the first revision, and it is the one that would have shipped a
   no-op. `nfgLevelsByMoney` floors (`:1234-1239`), so a difference of two floored counts is 0 or 1
   — never the 0.830 the rule depends on. On the live numbers ($40.6t, p = $2.301b, Neuralstimulator
   at $78.19b) the unfloored terms are **12.8502 and 12.0173** (difference **0.8329**, threshold
   **1.008324** → correctly blocked), but floored they are **12 and 12** (difference 0, threshold
   **1.000000** → **not** blocked, contradicting this spec's own fixture). Swept across bank
   positions the floored difference is 0 for **18.6%** of them, and the bank moves through them
   continuously — so the filter would silently no-op on roughly a fifth of polls, `blockedCount`
   would read 0 while a zero-M head was buyable, and that in turn disarms the ladder clause.
   **Two functions, and the spec says which is used where:**
   - **`nfgLevelsExact(money, price)`** — `log(1 + money·(L−1)/price) / log(L)`, unfloored, 0 for
     insufficient inputs. Used by `augIsWorthLadder`.
   - **`nfgLevelsByMoney(money, price)`** — `max(0, floor(nfgLevelsExact(...)))`. Used by
     `evalTrigger`, replacing its inline copy (`:1234-1239`) with identical behaviour.

   The marginal test, for a candidate at live (already-laddered) price `P` with mult `hackingMult`,
   against NFG start price `p`, bank `money`, per-level mult `nfgHackingMult`:

   > **buy iff** `hackingMult ≥ nfgHackingMult ^ ( nfgLevelsExact(money, p) −
   > nfgLevelsExact(money − P, p · AUG_PRICE_LADDER) )`

   i.e. *the aug's M gain must exceed the M of the NFG levels its purchase displaces*, charging both
   the cash `P` and the **one** ladder step it adds. When `P ≪ money` it reduces to the 0.83-levels
   rule; when `P` is a large fraction of the bank it correctly rejects augs the constant rule would
   wave through. **Exactly one ladder step is charged, always** — the decision being made is "buy
   *this* actionable aug now". Prereq chains are handled by `bestWantedMult` (decision 4), never by
   charging `chainLen` steps: the first draft charged one aug's price against a chain's ladder cost,
   which is neither quantity. `LADDER_FILTER_MIN_MULT = 1.0` is a floor guard: `hackingMult < 1` (a
   downgrade) is blocked regardless of arithmetic.

2. **One rule, two uses — the filter and the arm read the same marking.** `augIsWorthLadder(...)`
   decides *may we buy this*; `pickTarget` records the verdict per candidate as `marginalBlocked`;
   `ladderCountsFrom(candidates)` reduces that array to the two integers the arm reads. This is why
   the features doc's Q1 needs no rep model, and it gives the phase a single tunable surface instead
   of two that can disagree.

3. **The arm fires on candidate-set counts, never on the head — this is what escapes the deadlock
   cold review 1 found.** The first draft demoted blocked candidates to a new lowest sort tier *and*
   had `ladderArmed` evaluate the head. Those two are fatally incompatible: `pickTarget`'s NFG
   candidate always exists and always outranks a bottom tier (`repMetTier`, `:835-838` — NFG is
   tier 1 unblocked / tier 3 `buyBlocked`), so once every discrete is demoted the head becomes the
   `buyBlocked` NFG, which the arm exempts by construction → `target-exempt` forever, while
   `planPass`'s `repMet` check (`:1784`) refuses to buy it. No buys, no arm: a strictly worse version
   of the 45.5h stall this phase exists to end.

   **Resolution — keep the demotion, arm on counts.** `ladderCountsFrom(candidates)` returns:
   - `blockedCount` = candidates with `marginalBlocked === true`
   - `worthyCount` = candidates that are **not** `marginalBlocked` and **not** `ladderExempt`
     (i.e. real discrete augs still worth pursuing, rep-met or not)

   ```
   ladderArmed = gainArmed && !mustBuyHold
              && nfgBoundBy === "money"          // evalTrigger's OWN current-pass value (:1263-1271)
              && ladderCounts != null            // absent ⇒ never arms (decision 5)
              && ladderCounts.blockedCount > 0   // something was actually suppressed
              && ladderCounts.worthyCount === 0  // and nothing worth pursuing remains
   ```

   `gainArmed` already implies `!paused && !endgameHold && queuedCount >= 1` (`:1052`), so those are
   not repeated. The demotion is retained because it does real work: it keeps a blocked expensive aug
   from outranking a cheaper worthy one under the price-DESC sort. The arm no longer cares what the
   head is.

   **`nfgBoundBy` is stated once, here, and read from `evalTrigger`'s own current-pass computation**
   (cold review 2): the first revision required it in three places with three different meanings, and
   its instruction to "forward `nfgBoundBy` into the `decideInstall` ctx" was unimplementable —
   `evalTrigger` already declares `let nfgBoundBy` at `:1264`, so an input of that name in the same
   scope is a `SyntaxError`. **Only `ladderCounts` is forwarded from the loop.** The consequence is
   deliberate: the filter marks on the *prior* pass's `nfgBoundBy` while the arm tests the *current*
   pass's, which decision 7 enumerates as a permitted one-poll disagreement.

4. **Exemption is NFG and `UTILITY_ALLOWLIST` only; prereq chains are handled by `bestWantedMult`,
   not by a second exemption.** The first revision added "any actionable that is a prereq for a
   passing wanted" to the exempt set — and cold review 2 showed that breaks the arm: `pickTarget`
   keys candidates on `chain[0]` (`:781-788`), so a wanted aug with unowned prereqs appears in
   `candidates` **only** as that prereq; exempting it drops it from `worthyCount`, so the arm reads
   "nothing worth pursuing remains" while a +8% aug is one purchase away.
   **The clause is deleted, and nothing is lost, because `bestWantedMult` already covers the case.**
   `pickTarget`'s shared-prereq dedupe keeps the max-**score** wanted (`:792`) and the candidate
   record carries no mult at all (`:811-826`), so the implementation adds **`bestWantedMult` = the
   maximum `hackingMult` across every wanted aug this actionable serves**, tracked alongside the
   existing max-score dedupe rather than replacing it (score does not track `hackingMult` — this
   spec's own Context is the argument). `augIsWorthLadder` tests `bestWantedMult`, so a cheap zero-M
   prereq of a +8% wanted passes on the wanted's mult, is therefore **not blocked**, and — being
   un-exempt — **is counted in `worthyCount`**, which is exactly the behaviour the arm needs.
   *Accepted approximation:* the test charges the prereq's own price against the chain's best mult,
   which is optimistic (both augs must be bought). It errs permissive, and the wanted aug is
   re-evaluated on its own merits once it becomes actionable.

5. **The marginal context is read from the previous pass's trigger state; absent context disables the
   filter *and* the arm.** `pickTarget` runs at `:2208`, `evalTrigger` at `:2468`, so the current
   pass's `nfgBoundBy`/`gainArmed` do not exist yet. The loop passes
   `marginalCtx = {money, nfgPrice, nfgHackingMult, nfgBoundBy, gainArmed}` — **`money` (`:2084`),
   `nfgPrice` (`:2384`) and `nfgHackingMult` (`:2385`) are live for the current pass; only
   `nfgBoundBy` and `gainArmed` carry one poll (10s) of lag**, on quantities that move on hour
   scales. **`marginalCtx = null` disables filtering, and `ladderCounts` is then passed as `null` so
   the arm cannot fire either.** Without that pairing the first pass after every restart would both
   buy the zero-M head (money-rich ⇒ `repMet` buys immediately) *and* arm on it — the phase's own
   failure mode firing on startup, at a cadence F-A documents as recurring. `pickTarget`'s new
   parameter is optional and last, so existing call sites and tests are untouched.

6. **Filter and arm both require `nfgBoundBy === "money"`, and the rep-bound regime is deliberately
   left as it is today.** If the NFG tail is rep-bound, an extra ladder step costs no *levels* (rep,
   not money, is what runs out), so the filter's premise is void and more grinding genuinely does add
   M — waiting is correct, and the treadmill is not a bug there. **This is a real limit, not a solved
   case:** `evalTrigger` reports `"rep"` whenever `repLevels <= moneyLevels` (`:1265-1271`), and this
   file's own header (`:167-181`) records that rep increasingly binds, so a future cycle can leave
   the regime this phase governs and stall exactly as before. Logged with a wake condition as open
   question 2; V2/V4 record `nfgBoundBy` at judgement time so a rep-bound observation window is read
   as **no measurement**, never as a failure of the arm.

7. **The invariant is a one-directional safety property, not an equivalence.** The first draft
   claimed filter-blocks ⟺ arm-can-fire. False in three ways: the arm carries `!mustBuyHold` and the
   filter does not; the filter reads the prior pass's `nfgBoundBy`/`gainArmed` while `decideInstall`
   recomputes them; and a null context disabled only the filter. Decision 5 fixes the third; the
   remaining two are **bounded, self-clearing exceptions**, and what is asserted instead is:

   > **No reachable state both suppresses every purchase and cannot arm**, except while
   > `mustBuyHold` is true — which is money-bound, self-clears as income accumulates, and is already
   > the documented behaviour of the gain-phase and stall clauses.

   `T-INV` asserts exactly that, with `mustBuyHold` enumerated as the permitted exception carrying
   its escape. A one-pass disagreement on a transition sample is not a violation: the arm requires 10
   continuous minutes, so a single stale sample cannot fire anything. The `paused`/`endgameHold`/
   empty-queue deadlock classes are unreachable by construction — the filter is gated on the prior
   pass's `gainArmed`, which already implies all three (`:1052`).

8. **`GRIND_HORIZON_MS` reverts to 8h in the same commit that ships the arm — with a dated
   fallback.** The features doc's §6 requires the revert for attribution: with the stopgap left in,
   part 1's effect is indistinguishable from the stopgap's, and the stopgap has now *demonstrably*
   satisfied the features doc's success condition on its own (install #26). **Fallback, because
   removing a working stopgap for a rule that has never fired is the risk this phase actually
   carries:** if **no install at all has occurred within 24h of deploy**, restore `GRIND_HORIZON_MS`
   to 1h and reopen. **Who checks:** Kenneth at the next session open, from `goal-state.json`
   (`tripwire.status`) and `ratchet-decisions.json` (`trigger-clear` records now name the blocker —
   F-B's instrument is what makes this a 30-second read). **Default if never checked: the 1h stopgap
   is the safe state**, so a missed check should end with the fallback applied, not with 8h left
   standing. `MIN_TOTAL_GAIN` stays 1.1 (D9, unchanged).

9. **Arm persistence resumes a *start time*, never a *fired state*.** Startup reads
   `augfarmer-state.json` (the loop already reads it at `:2000` for `awaitingMoneySince`) and
   `resolveArmResume` accepts the saved `armedSinceMs` iff **all** of: the state parses,
   `trigger.armed` was true, `lastAugReset` matches the current `ns.getResetInfo().lastAugReset`
   (same cycle — an install in between invalidates it), and `nowMs − timestamp ≤
   ARM_RESUME_MAX_AGE_MS = 15 min`. `evalTrigger` takes `resumedArmSinceMs` and uses
   `armedSinceMs = armed ? (wasArmedSince ?? resumedArmSinceMs ?? now) : null`.
   **Clearing:** the first draft cleared it "on the first pass where `armed` is false" — which is
   *every* first pass after a restart by construction (`phase:null`, then ~5 min of
   `no-rate-sample`), making the whole feature dead code and V3 unpassable. It is instead cleared
   **only** on consumption (the first pass where `armed` is true) or when
   `nowMs − savedTimestamp > ARM_RESUME_MAX_AGE_MS`, whichever comes first.
   **The safety argument, stated plainly:** `fired = armed && sustainedMs ≥ TRIGGER_SUSTAIN_MS` and
   `armed` is recomputed live every pass, so a resumed start time can only ever *shorten a wait for a
   condition that is true right now* — it can never fire on a lapsed one. The unobserved gap (bounded
   at 15 min) is treated as armed; that is the accepted risk, and the right side to err on when the
   live failure is *never firing at all*.
   **This is also why no rep-rate persistence is needed:** the 5-min `no-rate-sample` warm-up is
   *covered* by inheritance — a process that re-arms 5 min in, inheriting a start time from 5 min
   before the restart, fires immediately rather than waiting a fresh 10.

10. **Prompt persistence: `triggerArmChanged` joins the state-write condition.** State is written on
    `heartbeatDue` (5 min), `boughtThisPass`, or `awaitingMoneySinceChanged` — `stateChanged` is a
    first-pass-only latch (`:2008`/`:2837`). Without a new term, a restart could inherit an
    `armedSinceMs` up to 5 min stale or miss one entirely. `triggerArmChanged` (armed-ness or
    `armedSinceMs` differs from the last written record) is added on the exact precedent of
    `awaitingMoneySinceChanged`, whose header says it exists for this reason. The known-dead
    `plan.phase !== previousPhase` term is left alone (out of scope, per its comment).

11. **Disarm and resume logging.** The `mode !== "auto"` guard at `:2514` is deleted. The
    `trigger-clear` record gains `lostSustainedMs` (the `sustainedMs` the *previous* pass held — the
    single field that would have diagnosed the 19:28 failure in one read) alongside the existing
    trigger snapshot with its `reasons`/`blockers`/`horizonMs`. **Rate limit:** at most one per
    `CLEAR_LOG_MIN_INTERVAL_MS = 60_000` via the pure `shouldLogClear`; suppressed disarms increment
    a `suppressedCount` carried on the next emitted record, so a flapping trigger is *visible as
    flapping* without evicting install history from the 500-entry `DECISIONS_CAP` ring (07-27's 17
    arms in 3.5h would emit ~17 records — legible, not a flood). Startup additionally appends one
    `trigger-resume` record per process start carrying `{resumed, reason, savedArmedSinceMs,
    savedAgeMs}`, `reason` naming which guard rejected a resume (`stale` / `cycle-mismatch` /
    `not-armed` / `no-state`) — without it the restart itself stays invisible and F-A remains
    inferable only by correlating three log files, which is exactly what R0 had to do.

12. **No changes to `installer.js`, `cloudmanager.js`, or the spend-down execution sequence.** The
    features doc's D5 warning stands and is restated at the point of execution: **do not force an
    install with `run installer.js`** — spend-down is driven by augfarmer's own `installSeq`
    (`:2530`), and `installer.js` only calls `installAugmentations`, which would install **and wipe
    the bank unspent**. Nothing here changes that; the live procedure never uses it.

## Design

### Work item 1 — the marginal rule [code]

**`nfgLevelsExact(money, price)`** and **`nfgLevelsByMoney(money, price)`** — new exported pure
functions per decision 1. The floored one replaces `evalTrigger`'s inline copy (`:1234-1239`);
behaviour there is identical and pinned by the existing `moneyLevels` fixtures. Extracting rather
than duplicating matters: that formula has already gone stale once as a copied literal (its own
comment, `:1230`).

**`augIsWorthLadder({hackingMult, price, money, nfgPrice, nfgHackingMult})`** — new exported pure
function implementing decision 1's inequality over `nfgLevelsExact` (one ladder step, no `chainLen`).
Returns `true` (permissive) whenever inputs are insufficient to judge (`nfgPrice` absent or
non-positive, `nfgHackingMult ≤ 1`, `money ≤ price`), so a missing signal never suppresses a
purchase. Returns `false` when `hackingMult < LADDER_FILTER_MIN_MULT`.

**`pickTarget(catalog, playerFacts, joined, ownedSet, nfgBoughtThisCycle, fundCap, marginalCtx = null)`**
— per decisions 4/5. Each candidate gains **`bestWantedMult`** (max `hackingMult` across all wanted
augs this actionable serves, tracked alongside the existing max-score dedupe at `:792`),
**`ladderExempt`** (NFG or `UTILITY_ALLOWLIST` — nothing else), and **`marginalBlocked`**, set iff
`marginalCtx` is non-null, `marginalCtx.nfgBoundBy === "money"`, `marginalCtx.gainArmed`, the
candidate is not `ladderExempt`, and
`augIsWorthLadder({hackingMult: bestWantedMult, price: c.price, …})` returns false — **regardless of
deficit** (the marking governs buying *and* feeds the arm's counts, so a rep-unmet candidate we would
not buy on arrival must be markable).
Sort: `repMetTier` gains tier **4** for `marginalBlocked`, below `buyBlocked` NFG's 3 (decision 3
explains why this is safe now the arm reads counts).

**`ladderCountsFrom(candidates)`** → `{blockedCount, worthyCount}` — new exported pure function per
decision 3, so the `pickTarget` → `decideInstall` seam is unit-testable rather than re-implemented
inside each test.

**The loop** (`:2208`) builds `marginalCtx` per decision 5, calls `ladderCountsFrom`, and threads the
result into `evalTrigger`.

### Work item 2 — buy suppression [code]

Four purchase sites, and **two of them are deliberately left alone**:

- **Grind path** (`:1784` `repMet` branch): a `marginalBlocked` head takes the same shape as today's
  `fundBlocked` branch (`:1767-1778`) — work-slot logic runs, `actions` gets no `buy` and **no
  `reserve`**, and the branch returns `phase: "grinding"`. Reserving nothing is deliberate and
  carries the same justification the `fundBlocked` branch's comment already gives at length: a
  purchase we have decided not to make protects no reachable spend.
- **`spendDownPlan`:** `rest` filters out `c.marginalBlocked`. `mustBuys` is untouched — selected by
  allowlist name, and those are `ladderExempt`, so `mustBuyCost`'s exactness guarantee is preserved
  by construction rather than by care.
- **`normalBuyAvailable` (`:2596-2597`) is NOT changed** — reversing the first revision, which had
  it gain `!marginalBlocked`. It has exactly **one** consumer: the gate-fill guard at `:2599`
  (`if (!paused && !normalBuyAvailable)`). Making a suppressed head flip it false would therefore
  *enable* `pickGateFiller` to buy the cheapest unowned aug at a 613× ladder — the precise pathology
  D4 exists to stop, via a mechanism whose own comment (`:2606-2607`) records it buying five augs in
  fifty seconds when its gating went wrong. **Leaving it true while the head is blocked defers the
  count-gate purchase to after the install**, where the ladder has reset and the same filler costs a
  fraction; the count gate survives installs (installed count only grows), so nothing is lost by
  waiting. No deadlock: a blocked head requires `gainArmed` (decision 5), which is the arm's own
  precondition, so blocked-with-nothing-worthy always has the install as its escape.
- **Gate-fill** (`:1710-1719`) is likewise untouched and **exempt from the filter**.
  `pickGateFiller` exists to buy a cheap zero-score aug purely to clear a faction *count* gate, in
  the state where `endgameHold` blocks spend-down entirely (its own header, `:1700-1709`). Blocking
  it would re-create the deadlock it was built to break. L3/V4's "no zero-M purchase" criterion
  **carves out gate-fill buys explicitly**, so a correct gate-fill cannot fail the criterion.

### Work item 3 — ladder-aware arming [code]

`decideInstall` gains one optional input, **`ladderCounts`** (nothing else — `nfgBoundBy` is
`evalTrigger`'s own current-pass value per decision 3, and `evalTrigger` passes it into the ctx it
already builds at `:1275-1293` under its existing local name), and the fifth arming clause of
decision 3.

`reason` precedence: `gate` → `gain-phase` → `stall` → `escalation` → **`ladder`** (last: newest and
least-exercised, so an install attributable to an older rule should say so). `blockers.ladder` names
the first failing conjunct: `gain-not-armed` / `no-counts` / `nfg-not-money-bound` /
`nothing-blocked` / `worthy-remain` / `mustbuy-hold`. `!mustBuyHold` is carried — unlike Phase 34's
escalation clause, which omits it — because this clause's premise is a money-rich bank, in which the
hold is false anyway; keeping it costs nothing in the regime the clause fires in and preserves the
cheap-must-buy invariant if income collapses (decision 7 records it as the one permitted asymmetry).

**`GRIND_HORIZON_MS` reverts 1h → 8h** in the same commit, and the temporary comment at `:120`/`:127`
is deleted. No test fixture changes (ground rules).

### Work item 4 — arm persistence + disarm/resume logging [code]

- **`resolveArmResume(savedState, currentLastAugReset, nowMs)`** → `{resumed, armedSinceMs, reason}`
  — exported pure function implementing decision 9's four guards. The loop calls it at startup, holds
  `resumedArmSinceMs`, clears it per decision 9's corrected rule, and appends the `trigger-resume`
  record from its return.
- **`shouldLogClear(lastClearLogMs, nowMs)`** → boolean — exported pure function for decision 11's
  rate limit; the loop keeps `lastClearLogMs`/`suppressedCount` and calls it.
- **`evalTrigger`** takes `resumedArmSinceMs` as an optional input and uses decision 9's line.
- **Persistence** (decision 10): `triggerArmChanged` joins the write condition; the state record's
  `trigger` block is unchanged in shape (it already carries `armed`/`armedSinceMs`/`sustainedMs`).
- **Disarm logging** (decision 11): the `mode !== "auto"` guard is deleted; the record gains
  `lostSustainedMs` and `suppressedCount`.

## Tests [code]

- **`nfgLevelsExact` / `nfgLevelsByMoney`**: floored parity with the current inline computation
  across the existing `moneyLevels` fixtures (the extraction must be behaviour-preserving);
  zero/negative/absent price; the install-#8 case the original comment cites (predicts 11); **the
  live install-#26 case — $39.317t at p $2.301b ⇒ 12 floored, and at the $3.753M base ⇒ 21** (the
  Context's measured claim, pinned).
- **`augIsWorthLadder`**: **the quantisation regression, pinned first** — $40.6t bank, p $2.301b,
  Neuralstimulator ($78.19b, mult 1.0) ⇒ **false (blocked)**, asserting the threshold is ~1.00832 and
  not 1.0 (the floored form returns 12−12=0 and would pass this aug; decision 1). Embedded Netburner
  Module (1.08, $161b) ⇒ **true**; 1.005 ⇒ **false** and 1.02 ⇒ **true** (brackets the break-even);
  a bank position where the *floored* difference is 0 but the exact one is 0.83 ⇒ still **false**
  (the 18.6%-of-positions case); `P` a large fraction of the bank flips a marginal aug to false;
  every insufficient-input case returns true; `hackingMult < 1` ⇒ false.
- **`pickTarget`**: `marginalCtx = null` ⇒ nothing blocked (back-compat and the post-restart path);
  `nfgBoundBy: "rep"` ⇒ nothing blocked; `gainArmed: false` ⇒ nothing blocked; NFG and each
  `UTILITY_ALLOWLIST` name never blocked even when the arithmetic says otherwise; **a zero-M prereq
  of a high-M wanted is not blocked AND is counted in `worthyCount`**, including the adversarial case
  where a *different*, zero-mult wanted outscores the high-M one (the `bestWantedMult` pin —
  decision 4, and the case cold review 2 found the first revision got backwards); blocked candidates
  present in `candidates` and demoted to tier 4; a blocked expensive aug never outranks an unblocked
  cheaper one.
- **`ladderCountsFrom`**: counts over a mixed array; exempt candidates excluded from `worthyCount`;
  a prereq-of-passing candidate **included** in `worthyCount`; empty array ⇒ `{0, 0}`.
- **`spendDownPlan`**: blocked candidates absent from the plan; an allowlist must-buy still planned
  first and `mustBuyTotal` over the plan's must-buys **unchanged as an equality** when blocked
  non-must-buys are removed (the Q4 pin).
- **`decideInstall`**: `ladderArmed` fires on `{blockedCount > 0, worthyCount: 0}`; does **not** fire
  with `worthyCount > 0`, nor `blockedCount: 0`, nor `ladderCounts: null`, nor `nfgBoundBy: "rep"`,
  nor `gainArmed: false`, nor under `mustBuyHold`; **the deadlock regression — every discrete demoted
  to tier 4 and the head therefore a `buyBlocked` NFG still arms** (cold review 1's blocker, pinned
  as the case that must never regress); `reason` precedence across all five clauses; each
  `blockers.ladder` string.
- **`T-INV`** (decision 7): over a grid of `{nfgBoundBy, gainArmed, hackingMult, price, money,
  mustBuyHold}`, **composing the real `pickTarget` → `ladderCountsFrom` → `decideInstall` chain**
  (not a re-implementation of the counting — that is the seam this file has shipped two live bugs in),
  assert no case both suppresses every purchase and cannot arm, with `mustBuyHold: true` enumerated
  as the permitted exception.
- **`evalTrigger`**: `resumedArmSinceMs` shortens the wait (armed now + resumed start 8 min ago ⇒
  fires past 10 min); **never fires while `armed` is false** (decision 9's safety property);
  consumed-once semantics; `ladderCounts` forwarded into `decideInstall`.
- **`resolveArmResume`**: each of the four guards rejects with its own `reason` (`stale` at >15 min,
  `cycle-mismatch`, `not-armed`, `no-state`); accepts the happy path; **the post-restart sequence —
  saved armed 5 min ago, first pass `armed: false` (`phase:null`), resume survives to the pass that
  re-arms** (pinned as the case the first draft got wrong).
- **`shouldLogClear`**: suppresses within 60s, permits after, and the `suppressedCount` accounting.
- `npm run verify:log` green against real logs after deploy.

## Live procedure [live]

> 🔴 **VOID as written — struck 2026-08-08. These are NOT overdue commitments; do not schedule them.**
> Only **work item 4** ever shipped (as F-A + F-B). Work items **1–3 are unbuilt** — none of
> `augIsWorthLadder` / `marginalBlocked` / `LADDER_FILTER_MIN_MULT` / `ladderCountsFrom` /
> `ladderArmed` appears in `src/augfarmer.js`. Consequences for each gate below:
> - **L2 can never fire.** Its bar is `trigger.reason === "ladder"`; the running code's only reasons
>   are `gain-phase` / `escalation` / `stall` (124 live `trigger-fire` records, zero `ladder`). Its
>   2026-07-29 deadline was a deadline on unwritten code. Its own fallback (`GRIND_HORIZON_MS` → 1h)
>   is **already the shipped state** — `augfarmer.js:163` reads `1 * 3600_000`, and it shipped as a
>   stopgap *before* this phase.
> - **L1 is mis-specified.** It expects `GRIND_HORIZON_MS` to read `28800000` (8h); that was never
>   the shipped value.
> - **L3 depends on L2**, so it inherits the same void.
> - **L4 (the restart drill) is the only one that tests shipped code** — it covers work item 4's
>   `resolveArmResume`. It was never recorded as run. Re-runnable in principle, but see below.
> - **All of them need installs, and installs are OFF.** `src/ratchet-mode.txt` = `observe` (repo
>   *and* `dist/`); install #43 on 2026-08-07 was the last, and it fired *against* the 2026-08-06
>   stop decision via the gitignored-file revert (CLAUDE.md's ratchet landmine).
>
> **If the buy-set filter is ever built, re-derive these gates from BN6 numbers — do not revive them
> as written.** BN6 has no aug-cost penalty where BN5 had 200%, so the 613× ladder they are tuned
> against does not exist here. Status tracked in `BACKLOG.md`.

- **L1 (immediately after deploy + `node tools/bb/cli.mjs restart augfarmer.js`):** a
  `trigger-resume` record appears in `ratchet-decisions.json` with a populated `reason`; the trigger
  re-arms within ~5 min; **no RUNTIME ERROR popup** (CDP check per CLAUDE.md — a script that
  "started" can still be dead). `GRIND_HORIZON_MS` reads `28800000` in the decisions log's
  `constants` block, which is where the live value is observable without a paste.
- **L2 (the phase's real test, next cycle — deadline 24h per decision 8):** an install fires with
  `trigger.reason === "ladder"`. Record `escalationFactor` and **`nfgBoundBy`** at fire time. **If no
  install fires within 24h, apply decision 8's fallback** (`GRIND_HORIZON_MS` → 1h) and reopen; read
  `trigger-clear`'s `blockers.ladder` first — it names the failing conjunct.
- **L3 (the cycle after that):** `escalationFactor` at install time is **below the 613 this cycle
  reached**, and no purchase in `logs/transactions-*.json` went to an aug whose catalog `hackingMult`
  is 1, excluding `UTILITY_ALLOWLIST` names **and gate-fill buys** (work item 2). Both are greppable
  from files we already export.
- **L4 (restart drill — the F-A regression):** with the trigger armed and ≥5 min sustained,
  `node tools/bb/cli.mjs restart augfarmer.js`, then confirm the resumed arm fires without waiting a
  fresh 10 minutes. **[live]** because the failure it covers only exists in a real process lifecycle.
- **Reopen signals:** a `ladder` install lands and M *falls* (the marginal test's sign is wrong —
  stop and re-derive, do not tune); or `trigger-clear` records show the arm dying to a cause this
  spec did not anticipate (that is F-B's instrument doing its job — read it before designing).

## Acceptance criteria

> 🔴 **V1–V4 are VOID with L1–L4 — struck 2026-08-08, see the banner under "Live procedure".** V2's
> bar cannot be met by the running code, V1's "8h constant" was never shipped, and every one of them
> needs installs, which are off. **T1 / T2 / R1 still hold** for whatever ships next here.

Test-gated (Claude clears): **T1** `npm test` green including every unit above and `T-INV`, with no
existing fixture's expected value changed; **T2** `npm run verify:log` green post-deploy.

RAM-gated [live]: **R1** `augfarmer.js` measures unchanged vs its current `ramcheck.js` baseline; any
delta is checked against identifier hygiene before being accepted as real.

Live-gated [live]: **V1** = L1 (clean restart, resume record, 8h constant live);
**V2** = L2 (an install fires with `reason: "ladder"` within 24h, no stopgap in force) — **judged
invalid, not failed, if `nfgBoundBy` left `"money"` during the window** (decision 6);
**V3** = L4 (the restart drill resumes the arm);
**V4** = L3 (lower `escalationFactor`, zero non-exempt zero-M purchases) — spans a full cycle, so it
lands in the close-out like Phase 35's V3, not as a merge blocker.

The features doc's success condition ("an install fires and M rises at least once within 12h") is
**already satisfied by the stopgap alone** — install #26 proved it — which is why V2 replaces it with
the attribution-safe form the features doc itself asked for (§6, "Note the stopgap muddies
attribution").

Ship gate per CLAUDE.md: T1/T2 self-cleared; R1/V1 wait on Kenneth's in-game run; then merge + push
without further sign-off. V2–V4 are close-out deliverables, with V2 carrying decision 8's dated
fallback rather than sitting open indefinitely.

## Files touched

- `src/augfarmer.js` — `nfgLevelsExact`/`nfgLevelsByMoney`, `augIsWorthLadder`, `ladderCountsFrom`,
  `resolveArmResume`, `shouldLogClear`, `pickTarget` marginal context +
  `bestWantedMult`/`ladderExempt`/`marginalBlocked` + tier 4, two-site buy suppression,
  `ladderArmed`, `GRIND_HORIZON_MS` revert, arm resume/persistence, `trigger-clear`/`trigger-resume`
  records
- `test/augfarmer.test.js` — units per the Tests section
- `BACKLOG.md` (D2's shelved reservation entry gains this phase's outcome; open question 6's
  boundary-log finding), `docs/batcher-engine.md` (the shelved demand-signal half, per features D2),
  CHANGELOG + phase-doc graduation at ship

## Open questions (log, don't block)

1. **`ARM_RESUME_MAX_AGE_MS` (15 min), `CLEAR_LOG_MIN_INTERVAL_MS` (60s) and
   `LADDER_FILTER_MIN_MULT` (1.0) are provisional.** All ride in observable files; tune on evidence,
   redesign only after two failed tunings (the three-invalidations rule).
2. **The rep-bound regime is unfixed by design (decision 6).** When `nfgBoundBy` flips to `"rep"`,
   both filter and arm switch off and the horizon treadmill returns — correct while grinding really
   does add M, but the file's own header says rep increasingly binds as money grows. **Wake
   condition: a cycle where `nfgBoundBy` reads `"rep"` and `tripwire.status` reaches `STALLED`.**
   That is the evidence that would justify a rep-side term — the one Q1 deliberately avoided
   modelling.
3. **The exp-credit dismissal is an estimate, not a measurement.** The ~+0.38% M-equivalent for a
   +40% `hacking_exp` aug uses the BN2-shaped level formula at M ≈ 1.6; the BN5 exponent has not been
   re-derived and Hacking Exp is nerfed to 50% here. Comfortably under the 0.83% threshold, so the
   verdict is robust to a fair-sized error — but if a high-exp, zero-`hackingMult` aug ever sits near
   the boundary, derive it properly rather than reusing this figure.
4. **The marginal rule assumes the NFG tail is the alternative use of money.** True while
   `nfgBoundBy === "money"` and the fleet is `at-limit` (BN5 now). In a node where cloudmanager can
   still spend, fleet RAM competes for the same dollars and the comparison needs a third term —
   exactly the shelved D2 arbitration work. **Wake condition: the first node where
   `cloud-state.json` `growth.status` is not `at-limit`.**
5. **Why the game restarted at 19:28 is unknown.** R0 established *that* it did (F-A) and this phase
   makes the arm survive it, but the cause is unexamined. Not blocking; worth a glance if restarts
   recur in the `trigger-resume` record.
6. **`boundary-log.json` hit `BOUNDARY_LOG_MAX` (5000) in ~4h of a 16h window**, dominated by
   `snapshot` events (found incidentally during R0 — Phase 35's telemetry caps long before its window
   closes, so install #26's boundary is only partly captured). Not this phase's file; belongs in
   `BACKLOG.md` against Phase 35's open question 2.
