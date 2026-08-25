# Changelog — completed work

Condensed record of finished phases and one-off changes, newest first. Each entry is a
one-or-two-line summary; the full design/validation story lives in the linked phase doc
(and in git history). Active work lives in [`BACKLOG.md`](../../BACKLOG.md).

---

## 2026-08-25

- **✅ BN10.1 (Digital Carbon) CLEARED — all 21 black ops, then `destroyW0r1dD43m0n(9)`.**
  **Operation Daedalus completed first try, zero failed attempts**, at `p[1.0000, 1.0000]`,
  713s, rank **2,031,352 → 2,062,551**. `getNextBlackOp()` read `null`, `destroybn.js 9 confirm`
  fired. Landed in **BN9.1 (Hacktocracy)**; **SF10 (Sleeves + Grafting) banked**.
  - 🔑 **The SP bank was the free lever.** 535,869 idle skill points are **node-local** and
    would have been destroyed anyway; spending them (Blade's Intuition **250 → 756**) moved
    Daedalus from **p[0.5164, 1.0000] → p[1.0000, 1.0000]**. The 2026-08-15 projection that the
    ladder would land ~1,000–1,500 rank **short** of its gate never materialised — rank ran 5x
    over the gate well before the last three ops.
  - 🔴 **Defect found and logged: `bbskillbuy.js` spends greedily in list order.** It put the
    whole bank into Blade's Intuition, left Digital Observer at 250, and reported `[ok]`. The
    multiplier is a **product**, so that cost ~**1.8x** at equal spend (x260 realised vs ~x475
    balanced). Harmless here; **expected to bite in BN9**, where the bank re-grinds from 0
    against a 1.33x redo-tax. → `BACKLOG.md`.
  - 📌 **The "four claimants" landmine showed up again and was a false alarm.** `augfarmer.js`
    flapped in and out of the slot every ~60s during acquisition, which looks exactly like the
    failure that defeated four measurements on 2026-08-02. It settled on its own once the pause
    file landed; the live panel (`Black Operations: Operation Daedalus`) was what settled it,
    **not** the log. Sibling to "an engine that measures itself must be validated against an
    independent source".

---

## 2026-08-18

- **🔴 SLEEVE-PARALLELISM CLOSED ON EVIDENCE — the BN10 order's weakest plank does not hold.**
  Two probes (`src/sleevepoolprobe.js`) measured one sleeve on Tracking draining the **same**
  `countRemaining` pool at **0.308/min** and **~0.34/min** against **0.499/min** regeneration —
  **62–68% of its entire regrowth.** Sleeves **compete** for Bladeburner contract supply; they do
  not parallelise it. **BN10-next is unaffected** (it stands on the 1.25× redo-tax alone), and
  nothing is actionable in-node — this closes a *claim*, not a plan.
  - ⚠️ **The rank half was never tested; the earlier "zero player rank" reading is WITHDRAWN.**
    `rankDelta` is 0 in the **idle control phase too** (engine paused, so rank could not move in
    either phase); the probe self-reports `INCONCLUSIVE` with `taskHeldSamples: 0` of 36.
  - 📌 **Method rule earned: A CONTROL THAT CANNOT MOVE IS NOT A CONTROL.** And separately:
    **designer guidance is a prior, not a measurement** — the in-game guide's two "sleeves help
    Bladeburner" lines were read as mutual corroboration when they are one source saying one thing.
  - **Sleeve memory DROPPED** (was deferred to 2026-08-25, now retired not renewed): $1.000t for +1
    at 47.8× the bankroll, and sync self-capped 27.17 → 100 with shock → 0 during the graft ladder,
    so the head start it buys is free with idle time.
- **🧹 BACKLOG drift swept (5 stale entries + 1 corrupted).** Three Bugs resolved by Phase 41's
  close were deleted (grafting-as-fifth-slot-claimant — the doc table was updated 2026-08-17; the
  "nothing has run live" entry — the join is verified; the "$454m more / three grafts" entry — the
  gate cleared on two). The graft-vs-fleet budget gap moved to **Ideas** with a wake-up trigger.
  ⚠️ **A sixth issue nobody flagged: the `Recruitment` Bug had lost its title line** when the
  2026-08-17 graft entries were spliced in — it began mid-sentence for a day. Header recovered from
  `ac75d14`. `augfarmer-pause.txt` re-justified: the graft reason is spent, but it stays paused
  because faction work steals the slot the rank grind needs.

- **✅ PHASE 41 SHIPPED AND CLOSED — BN10 entry gate cleared, Bladeburner joined.** Combat
  **91 → 109** on **two** grafts; `joinBladeburnerDivision()` verified via a subsequent
  `getRank()`. Docs graduated to `docs/phases/`. Full done-vs-left record in that spec's
  **Close-out** section.
  - 🔴 **The engine the phase built never ran.** `bn10entry.js` is complete and unit-tested, but
    the gate was cleared **by hand** with `graftone.js` — deliberately, because grafting charges up
    front and accrues irreversible Entropy while the engine's live loop had never executed. Its
    value is **BN9 reuse**, which is what §1 argued; record it as a *deferred* payoff, and treat
    `bn10entry.js` as **unvalidated until a live loop runs**.
  - 🔑 **What actually paid off was measurement, and one result overturns prior planning:**
    **graft price = 0.600 × purchase price, constant across all 97 augs, with ZERO reputation** —
    grafting is the *cheap* route, not the expensive one this phase assumed while planning.
    Also: **`getPlayer().mults` already includes the Entropy debuff** (a live double-counting
    defect in `graftplanner.js`, found by measuring), and **`getAugmentationGraftTime` is reliable
    when focused** (ratio 1.001 twice) despite the API doc saying otherwise.
  - **New durable asset: [`docs/grafting-reference.md`](../grafting-reference.md)** — authoritative
    for the mechanic, incl. the graft-vs-install framework, the Entropy model, and the in-game rule
    that graft prerequisites need only be *queued*, not installed.
  - **Re-planning beat planning:** at combat 96 the remaining ladder collapsed from 3 grafts to 1
    (saving ~$79m, ~1.5 h and two Entropy points). Grafts change the *requirement*, so re-derive
    after each one.
  - New scripts: `graftrecon.js`, `graftvsbuy.js`, `graftone.js`, `graftplanner.js`,
    `bn10entry.js`, `sleeverecon.js`, `sleevesyncprobe.js`, `sleevememprobe.js`,
    `sleevebbprobe.js`, `sleevepoolprobe.js`. 1450 tests green.

---

## 2026-08-17

- **Phase 41 (BN10 entry) WI2/WI3 IMPLEMENTED — `npm test` green (1406 → 1450, zero
  regressions), but NOT yet live-validated.** `src/graftplanner.js` (the graft-ladder planner:
  `expForLevel`/`remainingExp`/`planGraftLadder`, pure, unit-tested against a live BN10 fixture
  and BN6's measured combat-gate cost) and `src/bn10entry.js` (the slot-owning entry engine:
  `decideEntryAction`'s `hold > join > replan > graft > grind` precedence, `grind` as the sole
  fallthrough, the graft-cancels-work hazard handled via the `hold` branch outranking `join`).
  Full spec: `phase-41-bn10-entry.spec.md`.
  - **B1 golden test corrected the features doc, on the escape hatch it named itself.**
    Prerequisite filtering (Augmented Targeting II now correctly requires Augmented Targeting I)
    reroutes the back half of the ladder — the true `totalHours` minimum moved from the
    features doc's unfiltered k=7/$919m/9.6h to **k=9/$1.061b/9.91h**. The k=0..4 prefix
    (HemoRecirculator, Wired Reflexes, Combat Rib I, Bionic Spine) matches the doc exactly.
  - **NOT DONE, deliberately out of scope for this pass:** WI1 (buy the home-RAM tier live) and
    WI4 (pause `augfarmer.js`, flip `ratchet-mode.txt`, add grafting to
    `docs/bladeburner-reference.md`'s slot-claimant table) are operational/doc steps for Kenneth,
    not code. **None of the spec's L1-L4 live gates have run** — this is unvalidated against the
    real game. R2a's fleet-vs-grafter budget race is an accepted risk, not mitigated (see
    BACKLOG.md). See the phase spec's own acceptance-criteria table for the full B/C-series
    coverage map.

## 2026-08-16

- **🏆 BN6.1 CLEARED — via the Bladeburner black-op ladder, all 21 ops, final rank 513,931.**
  Confirmed live: Stats reads *"BitNode 10: Digital Carbon (Level 1)"*, Augmentations reads
  **Source-File 6: Bladeburners — Level 1 / 3**. Entered 2026-07-29 → cleared 2026-08-16 = **18
  days** (~4 of them on the wrong path, so ~14 on Bladeburner). Now in **BN10**.
  - 🔴 **Two things nearly stopped the run at the finish line, both invisible until hit.**
    (1) **Rank 400,000 is a GATE, not the goal** — `bladeburnermanager.js` had no black-op stage,
    and would have ground `Tracking` forever at "121% of target." (2) **Completing the final black
    op does NOT destroy the node.** `getNextBlackOp()` went `null`, the BlackOps tab rendered empty,
    and the game carried on. The real trigger is `ns.singularity.destroyW0r1dD43m0n(nextBN)`.
    ⚠️ **`nextBN` is MANDATORY here despite `markdown/` documenting it as optional** — omitting it
    throws. **Even the bundled API docs can be wrong about this fork; optionality is not a
    guarantee, verify by calling.**
  - **New scripts:** `bbskillbuy.js` (spend banked SP — success multiplier ×3.5 → ×100.3),
    `bbblackop.js` (ladder runner, slot discipline, rank-floor + loss-budget guards, hard Daedalus
    rail), `destroybn.js` (precondition-checked node destroy).
  - 🔑 **The mid-run lesson that cost 24,000 rank:** the first ladder runner bounded *attempts* (40)
    but never bounded *rank*, and a failed black op costs ~30% of its reward. Five Centurion
    failures drained 382,418 → 358,443 before it was killed by hand. **Bounding the wrong quantity
    is not a guard.**
  - **New `docs/estimation-calibration.md`** — every stamped BN6 ETA scored. Measured estimates ran
    **systematically pessimistic** (2–40×) because they froze a rate that was doubling every ~3
    days; the one **underived** estimate ran **15–30× optimistic** and nearly picked the wrong win
    path. And the headline was *accidentally* right (10–20 predicted, 18 actual) off two
    compensating errors — **when a forecast verifies, check the reasoning survived.**
  - **Node order re-derived** (`bitnodes.md`): **BN10 → BN9 → BN13/BN14 → BN7 (deferred) → BN8 →
    BN12 (late) → BN15 → BN11**, on the discovery that **Bladeburner rank/SP are node-local** — so
    the question is "where is redoing this grind cheapest," scored by
    **redo-tax = (1/BladeburnerRank) × BladeburnerSkillCost**. BN12-first was considered (fastest at
    ~5.5d, the only node where hacking beats Bladeburner) and **rejected on the in-game guide's
    advice** — optimising for speed instead of value.

## 2026-08-15

- **🚨 Found the reason BN6 was never going to clear, and fixed it** (`3ab8396`). Every stamped
  snapshot tracked rank against 400,000 and read *on track*. The number was real and the engine was
  healthy — and the run still could not finish. **Rank 400,000 is only the gate on the LAST black
  op**; the node clears by completing all **21 in order**, and `getNextBlackOp()` read
  **`Operation Typhoon`** — the *first* — with **zero done**. `bladeburnermanager.js` has **no
  black-op stage at all** (`BLACKOPS_DAEDALUS_RANK` is only the constant defining its target), and
  Stage 4 had sat SHELVED since 2026-07-30 behind a hacking-primary decision reversed on 2026-08-02.
  - 📌 **Durable lesson: A PROGRESS TARGET IS NOT A WIN CONDITION.** No amount of telemetry could
    have surfaced this — the missing step was never instrumented. **When a metric stands in for a
    goal, periodically re-derive the goal and check the metric still reaches it.**
  - **`src/bbskillbuy.js` (new)** spent the **~114,000 SP** the engine had banked and never used
    (Stage A runs `Tracking` at 100% realised success, so success skills bought nothing *there*).
    91,460 SP → success multiplier **×3.50 → ×63.00**, action time **×0.83 → ×0.10**.
  - 🔑 **The measured effect was stronger than a lifted lower bound: every one of the 21 ops' `pMax`
    went to `1.0000`.** The back half had *falling upper bounds* — Daedalus `[0.0062, 0.0670]`, a
    **real 6.7% ceiling** by the pair-reading rule, not an intel gap. After: `[0.1746, 1.0000]`, with
    ops 1–9 **converged at `[1.0000, 1.0000]`**. Ladder serial time **16.56h → 1.88h**.
  - 🔴 **Retracted: `Overclock` "closed permanently" (Q10, 2026-08-06) — the measurement was right,
    its SCOPE was wrong.** Stamina is per-action, so action time cancels *only while stamina binds* —
    true for 13–150s contracts, false for **185–7,377s** black ops running ~0.5/hour against a
    55.8/hour ceiling. Bought to 90 for 5,636 SP. 📌 **A MEASUREMENT INHERITS THE REGIME IT WAS TAKEN
    IN — when recording a "closed permanently," record what would have to change to reopen it.**
  - **`src/bbblackop.js` (new)** runs the ladder with a hard rail **refusing `Operation Daedalus`**
    without an explicit argument (completing it destroys the BitNode). Pauses all four slot
    claimants, verifies starts against `getCurrentAction()`, detects completion by `getNextBlackOp()`
    advancing rather than by a timer.
  - 🔑 **The ladder pays its own gate:** black-op rank rewards total **~73,400**, taking ~350k to
    **~424k** — so the last 50k needed no `Tracking` grind at all. The ladder was faster than the
    thing that was waiting on it.
  - **New bug logged:** `Recruitment` is gated on `stageBEnabled` (`bladeburnermanager.js:669`),
    which is permanently `false` — so `teamSize` has been **0** all run. Correct for Stage A (teams
    help Operations/BlackOps only, and Stage A runs a *Contract*), wrong now, because **black ops are
    neither stage**. Not blocking; ops complete first-try at ×63.
  - `npm test` **1406 green**.

## 2026-08-13

- **🔴 Caught and fixed a projected run-killer ~1.2 days before it would have fired** (`3d4a013`).
  Selection was on track to abandon **`Tracking`** — 100% realised success, **100.4% of the entire
  rank rate** — because the estimator it scores on had decayed below a worthless alternative, with
  the clear still ~3 days out and the run about to go unattended.
  - 🔑 **The cause was LOST INTEL, not decline, and the tell was in the data all along:** the
    estimate's **upper** bound never moved off **`1.0000`** while the lower bound collapsed
    0.89 → 0.25. A **widening** `[pMin, pMax]` means *"less sure"*, not *"worse"* — and since
    scoring reads the pessimistic bound, the two are **indistinguishable at the call site**.
    📌 New durable rule: **read `getActionEstimatedSuccessChance` as a PAIR.**
  - **Measured** (`src/fieldanalysisprobe.js`, new; 30 samples / 15 min): `Field Analysis` restores
    `pMin` at **+0.684/hour**, monotonic, **while city chaos stayed flat at 274.8** — intel, not a
    chaos lever. `Tracking` **0.2507 → 0.4444**, range width **0.749 → 0.556**. Decay is 0.158/day,
    so steady state costs **~14 min/day (~1%)**. ⚠️ It lifts *every* action's estimate including
    worthless ones — it restores **precision, not accuracy**.
  - **Shipped (S-RF):** `pickRankAction` takes `max(estimated, realised)` for actions with ≥50
    attempts at a proven level and ≥90% realised success, reading Phase 40's ledger. Strictly
    one-directional; identical to old behaviour with no ledger passed.
  - 🔑 **Caught before shipping — keying the floor on the *current* level is a self-locking
    deadlock.** On level-up `byLevel[new]` is empty → floor `null` → selection falls back to the
    very estimator being bypassed → the action never runs → never earns the attempts that re-arm
    the floor. Fixed by falling back to the highest proven level **at or below** current
    (conservative: yield grows +4.03%/level). **Found by walking the level-up path instead of the
    steady state** — the steady-state design was correct and would still have failed.
  - **Sanity check on the rest of the pool:** nothing worth switching to. `Bounty Hunter` predicted
    a *converged* `pMin 1.0000` and delivered **0/20**; `Investigation` the same, delivering 0.01
    rank/action over 1,695 attempts — the **third and fourth** instances of the estimator asserting
    certainty and being wrong. 1406 tests green.

---

## 2026-08-11

- **✅ Phase 40 — autolevel governor SHIPPED, and its verdict is that its own premise was false.**
  ([`phase-40-autolevel-governor.spec.md`](phase-40-autolevel-governor.spec.md) · WI1+WI2 `52cb17e`,
  WI3 activation `7ac604f` after one revert `8c2cd99` + fix `5b259d2` · 1395 tests green.) The engine
  now manages action levels, which it never did before. **What it found is worth more than what it
  built:** the dose-response curve that justified the phase put `Investigation`'s peak at **L26–29
  ≈ 9–10 rank/action**; driven there and measured, it reads **L29 0/20 · L25 0/20 · L33 0/258 ·
  L21 2/682**. The peak is absent where predicted — `Investigation` is not rescuable by levelling.
  Logged dropped-objection #1 landing. 🔴 **The rate did roughly double, and none of it is the
  governor's:** that is `Tracking`'s *ungoverned* autolevel (L110→130, 19.77→47.56 realised
  rank/action); the governor's own effect is `Investigation` 0.00→0.061 rank/action, i.e. 0.13% of
  rank. Tracked open as **Q40-17**.
- **Four dated Phase 40 questions answered off the ledger, no probe run** (`b09a0a9`). **Q40-6**
  keep the band (`Tracking` 725 attempts / 7 levels, yield monotone 37.53→47.56 at 100% success, so
  band and hill-climb agree — but only over a monotone span, no peak seen through L127). **Q40-7**
  3 real forced restarts cost nothing measurable (duty 1.0). **Q40-14** `Tracking` settled 723/725 =
  99.72%, phantom contamination ≤0.28% vs a forecast 1–2%. **Q40-8 VOID** — three of
  `Investigation`'s four sampled levels have `rankSum` exactly 0, so there is no Operations payout
  slope to measure. Q40-13's trigger fired but the drop budget is not the binding problem, so it is
  held rather than retuned.
- **🔴 Stage B CLOSED on measurement, four days before its default expired — and C2 is void as
  evidence, not merely suspect.** `getActionEstimatedSuccessChance` was caught predicting **`pMin`
  1.0000** — a *converged* `[1.0, 1.0]`, maximum confidence — for `Investigation` against a realised
  **2/682**. Wrong by ~135× while reporting certainty, and **on an Operation** — the same action
  class as `Raid`, whose 47.03 rank/action is Stage B's entire case and would spend a city
  irreversibly. The error is also **not sign-stable** (~10% *cold* on `Tracking`, where 08-08
  measured 17% hot), so it cannot be corrected for. **Q14 is moot; no probe needed.**

---

## 2026-08-10

- **🔴 FIXED — settlement starved whenever the engine parked on one action, and the attribution
  was wrong.** Filed as *"`LEVEL_GOVERNOR_MODE = "active"` parks the engine"*; **activation was not
  the cause.** `LEVEL_GOVERNOR_MODE` is read in three places, and with **zero applied decisions**
  the active and shadow paths are identical — so the park had to be something else. It was: the
  engine stopped calling `startAction`, which is **correct** (`shouldStartAction` must never restart
  what is already running), so one `Tracking` auto-repeated. But settlement's gate read
  `trackable = verified && intendedAction && …` — keyed off **the engine's own intent**, set only
  when a start fires. Intent went stale, the gate closed, and settlement stopped for 15+ minutes:
  **408 governor decisions all reading `samples: 0`** while rank climbed normally at ~1,150/h. The
  `SETTLE_MAX_MS` fallback written *precisely* for the single-action regime sat behind the **same
  flag**, so it could never fire in the one regime it exists to serve.
  🔑 **This is Phase 39's own rule broken one layer up** — *no field may be derived from the
  engine's own intent* — and the test surface shows exactly how it hid: `settleActionRun` (the
  arithmetic) had **6** unit tests; the gate deciding whether it was ever *reached* had **0**,
  because it lived loop-inline. *A tested function is not a tested mechanism*, again.
  **Fix:** new pure `planSettlementStep`, keyed off `getCurrentAction()` — the game's answer, which
  stays correct across auto-repeats, parks and missed starts — with **7 tests including a replay of
  the measured park** (30 min, no starts, one action repeating) asserting ~6 timeout settlements
  instead of zero. Validated live in shadow: settlements resumed, `Tracking` 4/4, `Investigation`
  0/1, duty 1.000. 1395 tests green.

- **✅ RESOLVED — the dashboard's "no-scroll guarantee looks broken" bug. It was never sizing.**
  The cause is the in-game **Options → "Netscript log size"** setting, which caps a script's tail
  log and evicts the **oldest** entries. At the default **50**, `dashboard.js` emitted 54 lines per
  render, so the first 4 were deleted every cycle — the entire top of the GOAL panel: its title, the
  `rank .../400.00k (Op Daedalus)` **win-condition line**, and `goalposts:`. The single most
  important readout in the window had been invisible for weeks, and the filed symptom
  ("`ROW_BUDGET` is 63 but only ~42 rows surface") sent every prior look hunting a wrap/height
  problem. Proven over CDP: there is **no scrollable element in the tail at all**, and the blank
  space above the content is the same bug's other half — the tail bottom-anchors, so a window sized
  for 63 rows showing 41 leaves the rest empty. Setting raised to **200** (recorded in
  [`docs/user-settings.md`](../user-settings.md) with the tell, since the default returns on any
  fresh install). Also shipped: `panelAbsent` skips a panel whose subsystem has been silent >1h, so
  the **GANG** panel — rendering `STALE 1573108s` (**18.2 days**) in BN6 — is gone until a node
  actually has a gang; blank separators removed for good after screenshots proved `ns.print("")`
  renders at **zero height** (a log entry spent for no visible gap); and `DASHBOARD_H`/`ROW_BUDGET`
  re-derived 1372/63 → **1133/52**, the measured worst case `renderAll` can emit, so the window is
  sized to what the code produces instead of to an aspirational budget. 1388 tests green.
  🔑 **Method note:** the first two diagnoses this session ("clipped by scrolling", "hard 41-row tail
  cap") were both wrong and both were *reasoned*; the answer came from measuring the DOM and then
  reading the game's own Options screen — the "game UI is part of the interface" rule again.

## 2026-08-08

- **🔴 CORRECTION — "`Diplomacy` has never run" was WRONG, and the real defect is a different one.**
  The same-day entry below recorded `effect.runs: 0` as a cumulative count; it is an **in-memory
  accumulator reset on every process start** (17 restarts logged), and `bladeburner-log.json` holds
  two `diplomacy-effect` records from 2026-08-03. Fifth instance of the same pattern — a counter read
  as cumulative without checking whether anything persists it. **The defect underneath is real but
  distinct from the 2026-08-03 fix:** that fix made the chaos branch *reachable*; it is now **starved
  of slack**, because `pickOverheadAction` only runs when `pickRankAction` returns `null` and the
  engine holds 24h `dutyCycle` **0.9998** (`Investigation` backfills everything). Every guard on the
  branch passes; it is never reached. Also established: **`Diplomacy`'s strength is unmeasured** —
  one sample was discarded for a city change, the other predates the same-city guard and is exactly
  the contamination that guard exists to catch, so **174 chaos/run must not be quoted**. Three
  entries filed in `BACKLOG.md`.
- **✅ RESOLVED 2026-08-03 (filed to CHANGELOG 2026-08-08) — chaos climbed unbounded because
  `Diplomacy` was unreachable.** Two causes. (1) `pickOverheadAction`'s call site passed
  `hpRecovering ? 0 : hpFraction`, forcing the HP branch and making the chaos branch dead code; it
  now passes the real `hpFraction` plus the latch separately, bounded by `MAX_DIPLOMACY_DUTY`
  (20%/hour), target-seeking on `CHAOS_TARGET` (50), and self-measuring via the `diplomacy-effect`
  log. (2) 🔑 **The bigger win was moving city** — sampling all six showed Sector-12 at chaos 177.5 /
  pop 620.7m vs Volhaven at 3.4 / 1170.6m, strictly dominant; `src/switchbbcity.js` took Tracking's
  EV/sec **0.0084 → 0.0854 (10.2×) for $0 and 0 rank**. Autonomous rotation stays off — re-filed as
  an open Ideas entry.
- **🧹 Phase 36 filed dormant.** Its `.features` + `.spec` moved from the repo root to
  `docs/phases/unshipped/` — 1 of 4 work items shipped, live gates VOID, and its two premises
  (install cadence, batcher as a win path) both removed by later decisions, so the root was
  advertising active work that nothing was driving. `unshipped/README.md` amended: it is the first
  entry there that is partially shipped rather than untouched.
- **📌 Stage B's gate given a default and a date** (it had neither for two days, against
  `CLAUDE.md`'s own "open decisions carry a default and a date" rule): **closed, expiring
  2026-08-15**, reopened early only by a positive Q14. Rationale: Raid's headline 45.72 rank/action
  comes from the estimator measured biased-high the same day.
- **📊 BN6 re-stamp + the throughput model closed.** Rank **59,008**; rate re-fit on a clean 35h
  window (install #43 excluded) at **0.1952 rank/s = 703 rank/h, FLAT** → ETA **~20.2 days**. The
  08-07 "0.2161 and still climbing / ~15–19 days" was an 11h read that did not persist. Measured
  realised rank/action from `context.rank` deltas: `Tracking` **19.77** and rising with its level
  (110, no cap observed) vs `Investigation` **4.27** and collapsing (9.75 → 0.88; 68.9% of its
  actions pay zero) — they cancel, which is *why* the aggregate looks flat. Model closes to 0.2%:
  `Tracking` is supply-capped at ~30 actions/h against a ~56/h stamina ceiling, so `Investigation`
  is filler on capacity that would otherwise idle — **"just drop it" is wrong.** Worst finding:
  `getActionEstimatedSuccessChance`'s **lower** bound is biased high (pMin 0.764 vs ~7% realised),
  which puts checkpoint C2 and `Raid`'s 45.72/action in doubt. Also logged: `Diplomacy` has **never
  fired** despite chaos 66.34 vs its own target 50. → [`docs/bn6-go-no-go.md`](../bn6-go-no-go.md) §11.
- **✅ RESOLVED (dissolved, not fixed) — the "rep window, then one install" freeze that could never
  fire.** `augfarmer.js`'s `FACTION_SCOPE` genuinely excludes `Bladeburners`, so the freeze had no
  trigger — but the prize it protected measured **inert** (the 12.5k–62.5k-rep tier only multiplies
  success chance / stamina / analysis, and we run at 100% success / 99.9% duty), so rep resetting on
  install costs nothing. Verified live 2026-08-08: `repStarvation` now reads a 13,601-rep deficit and
  correctly declines it (`reason: "deficit-too-expensive"`). Doubly moot — installs stopped 08-06.
- **🧹 Phase-doc filing.** Phase 39 (`.features` + `.spec`) and Phase 34's orphaned `.features`
  graduated to `docs/phases/`; Phase 36's void live gates struck (see its spec's banner) and its
  work-item count corrected to **1 of 4 shipped**. `BACKLOG.md`'s Bugs/Ideas structure confirmed
  deliberate (169bc93, 2026-07-12) and `CLAUDE.md`'s stale "In Progress / Next Up" instruction
  updated to match.

## 2026-08-06

- **✅ Q10 ANSWERED — stamina is spent PER ACTION, so `Overclock` is dead and the ×8.3 was a mirage.**
  New `src/q10probe.js` (read-only, 1 Hz): across **449 rank-producing seconds** stamina fell exactly
  **9 times**, every drop precisely **2.162**, every one on a rank tick, spaced at the 51s action
  time; regen is continuous at **0.03352/s**. Sustainable actions/hour = `regen × 3600 / cost` =
  **55.8 — independent of action time**, against the 585.9/hour Overclock 90 would allow by the
  clock. Rank-producing fraction is already **68.5%**. The ~4,000 banked SP were correctly not spent.
- **🔴 Two corrections to the 2026-08-05 entry, both from the same root cause — reading an instrument
  without first checking what it measures.**
  1. **The aug tier is NOT wholly inert.** "Stamina augs do nothing because duty is 99.9%" was wrong:
     `dutyCycle` counts regeneration as on-duty. The binding metric is the 68.5% rank-producing
     fraction, and Q10 proves it is stamina-throttled — so `bladeburner_stamina_gain` multiplies the
     rank rate directly. Success-chance augs remain genuinely worthless (100% success).
  2. **The Stage B closure was right, but its evidence was invalid.** "Four unworked cities frozen to
     14 decimal places" proved nothing — `getCityEstimatedPopulation` **only refreshes for the
     occupied city** (proved by chaos moving in all six while population stayed byte-identical).
     Re-confirmed behaviourally instead: in-city, Volhaven scored `Tracking` at **exactly 0** and its
     best operation at **−0.0111**. Real mechanism: the occupied city grows **~+3.8%/hour
     proportionally** (Ishima 1,134m → 2,581m in 22h) — **and zero cannot grow**, which is why a
     drained city never returns.
- **⚠️ Install cadence stopped** (`src/ratchet-mode.txt` → `observe`); installs cost a measured
  **5.4%** of Bladeburner wall-time. 🔴 **Trap discovered the hard way:** that file is pushed from the
  repo by viteburner *and* is gitignored (6a0dc63), so an in-game write silently reverts on the next
  dev-server restart — which is exactly what re-enabled installs and let **#43** fire, killing a
  running probe. Documented in `setratchetmode.js` + `docs/scripts.md`.
- **➡️ Q13 opened (cheap, no irreversible spend):** is per-action stamina cost **flat** or
  proportional to action **time**? Only `Tracking` was measured. If flat, the correct objective
  becomes **rank-per-action** (engine runs `objectiveMode: "per-second"`), `Assassination` pays
  **2.6× Tracking**, and Stage B reopens *for Assassination only* — never Raid.
- New scripts: `src/q10probe.js`, `src/setratchetmode.js` (+ `vite.config.ts` download filter).
- **🚨 LATER THE SAME DAY — the Stage B closure above is RETRACTED. "Raid permanently kills a city"
  was never measured.** Kenneth asked whether we were missing a way to regrow a city; checking rather
  than defending the conclusion overturned it. `getActionEstimatedSuccessChance` returns a
  **[MIN, MAX]** range, and in Volhaven every one of the nine contracts/operations reads
  **`[0.0000, 1.0000]`** — *maximum uncertainty* — against Ishima's **`[1.0000, 1.0000]`**. Volhaven's
  inventory is intact (2,727 Raids · 3,496 Undercover · 1,432 Assassinations). The engine scores on
  **`pMin`** (`bladeburnermanager.js:304`), so an **unscouted city is arithmetically identical to a
  dead one**. The 2026-08-03 stall was **lost intelligence, not a dead city** — and the engine cannot
  fix it because **`Field Analysis` is not in its action pool**.
  - Also retracted with it: the "occupied city grows ~+3.8%/hour proportionally" mechanism published
    hours earlier. Ishima was occupied continuously for three days and moved **+1m in two days, then
    +1,447m in one** — the jump coinciding exactly with the engine switching to `Investigation`. That
    was **estimate refinement, not growth**.
  - **Now OPEN:** Raid's true city cost · whether population regenerates · Stage B (gated on Q11 and
    new **Q14**, does scouting restore a drained city). **Unaffected:** Q10 — that probe timed real
    stamina deltas against a wall clock with no estimate in the chain.
  - 📌 **Method rule extracted, at the cost of three commits: an ESTIMATE is not a MEASUREMENT.** Any
    `ns.bladeburner` value containing `Estimated` must be read as a **range**; a single-point read of
    one is not evidence. Each wrong conclusion was "confirmed" by re-reading the same uninformed
    number through a different lens — including one explicitly billed as *independent behavioural
    confirmation*, which was circular.

## 2026-08-05

- **🔴 STAGE B CLOSED PERMANENTLY — and the Q11 go-ahead was never spent.** Kenneth approved the
  bounded live Q11 HP probe; a cheaper measurement settled the branch first. **Population never
  regenerates:** Volhaven, drained to 0 by Raid on 2026-08-03, still read **exactly 0** 47.6h later —
  confirmed *from inside the city* via a `switchbbcity.js` round trip (40s, $0, zero rank lost) so a
  stale estimate couldn't fake it, with the four unworked cities frozen to **14 decimal places**
  across the same window. Raid therefore harvests ~585 rank per city and permanently destroys an asset
  paying **18,900 rank/day** — Ishima repays the whole harvest in 45 minutes. Re-measured net of
  `rankLoss`, Raid was also the *only* operation worth the gate (Assassination 1.27×, Stealth
  Retirement 1.08×, everything else *below* Tracking), so **Stage B has no surviving candidate.**
  Q11 is closed as **moot, not answered** — do not reopen it.
- **✅ The revert-to-batcher tripwire is retired, not triggered.** Its premise (Stage A ≈ 570 days)
  is dead: Stage A alone measures **32–38 days** — 0.1371 rank/s (engine, 24h) vs 0.1156 rank/s
  (`goal-log.js`'s independent ring, 25.1h), two separately-sourced numbers agreeing within 19%.
- **✅ The Bladeburner aug tier measured INERT — and the install↔rep deadlock dissolved with it.**
  All 18 augs multiply exactly one of success chance / max stamina / stamina gain / analysis;
  **none** touches rank-per-action or action time. We run at **100% success** and **99.9% duty**, so
  the reachable ~$36.5b tier buys a ×1.49 multiplier on a capped stat. Phase 39's **S4a stands**, now
  on a durable reason rather than a cost argument. 🔴 Self-correction recorded: the ~11× rep-rate
  improvement (0.086 → ~0.95 rep/s) was real but the wrong variable — rep never bound this decision.
- **➡️ Next lever identified: `Overclock` 17/90 (×8.3 unclaimed → ~4–5 days), gated on Q10.**
  Live-testing budget recommended to move from Q11 to Q10 — stamina accounting, not HP.
- Docs updated in the same pass: `docs/bladeburner-reference.md` (§5 population permanence + fresh
  net-EV action table; §7 full aug-multiplier table + verdict), `docs/bn6-playbook.md` §1.1,
  `CLAUDE.md` goal block (standing figures were stale by 4.5×), `BACKLOG.md` (Q10 next action +
  the logged dropped objection on Assassination/Stealth Retirement).

## 2026-08-03

- **🚩 C2 FIRED — Phase 39's actual go/no-go deliverable, reached the same day the phase shipped.**
  At 7:34:34 PM, the exact moment of the Sector-12 → Volhaven move, `Raid` overtook `Tracking` on
  the per-second score: **0.2550 vs 0.0854 rank/sec (3.0×)**, and it has held (currently 0.2648 vs
  0.0844, 3.1×). The crossover was *caused by* the city move — Raid sat at 1.9–5.5% success under
  Sector-12's 177 chaos with 21 communities, versus Volhaven's 3.4 chaos and 75 communities (Raid
  additionally requires a Synthoid community, so both terms moved in its favour).
  ✅ **The Stage-B gate correctly did NOT open.** `stageBEnabled` stays `false`, `applyStageGate`
  still removes Raid from the candidate pool entirely, and the engine keeps running Tracking —
  exactly S5.1's structural guarantee that a scoring swing cannot open a gate that exists to stop
  unmeasured HP loss. **EV is not a safety property; Q11 is about HP.**
  ⏭️ **Required next step is S14.2's step 1, and it needs Kenneth:** request a fresh go-ahead for a
  bounded live Q11 measurement (HP cost per failed operation). C2 firing is the trigger to *ask*
  with evidence in hand, not a licence to proceed. If declined, or if Q11 comes back unmeasurable a
  third time, the gate stays shut and `docs/bn6-playbook.md` §1.1's ~2-week tripwire applies.
- **Rep yield cut 0.15 → 0 (Kenneth's call, option (a)) — reversing the spec's D11a default,
  on measurement.** The single player-action slot is Bladeburner rank OR faction rep, never both,
  and 0.15 was the spec's own admitted guess ("a defensible default, not a measurement", S16.9).
  Checking what that 15% actually bought: `augfarmer.js`'s `scoreAug` picks augs by
  `hacking / hacking_exp / faction_rep` — leftover targeting from the M-climb win path dropped on
  2026-08-02 — and the live rep target `Neuregen Gene Modification` reads **`hacking_exp: 1.4` with
  `1.0` on every combat stat and every `bladeburner_*` mult** (augcheck.js). Against rank 400,000
  that is worth **exactly zero**, as is every other Chongqing aug (hacking_money, hacking_chance,
  charisma, company_rep). There was no trade-off to balance — 15% of the win path was being paid
  for nothing.
  ⚠️ **This does not freeze the ratchet, which is why it is safe:** its next purchase is NeuroFlux
  Governor, whose rep requirement (1.854k) is **already met** (`deficit: 0`). NFG is *money*-gated,
  money comes from the batcher at zero slot cost, and NFG grants +1%/level to **all** mults
  including str/def/dex/agi — which feed max HP (`10 + defense/10`) and max stamina, i.e. duty
  cycle, the actual binding constraint. The ratchet keeps contributing to rank without the slot.
  The starvation detector still *runs* (its status is real telemetry) but no longer *requests* the
  slot — guarded so a permanently-fired detector cannot spam `yield-refused` every tick and flood
  the ring, plus a defensive rate-limit on that log for any future non-zero cap. The slice
  mechanism stays under test via an injectable `maxRepYieldDuty` so it cannot rot before option (b).
  **Not taken — option (b):** retargeting `scoreAug` at combat/`bladeburner_*` mults. None of the
  joined factions (Chongqing, Ishima, New Tokyo, Tian Di Hui, CyberSec) sell combat augs, so it also
  means joining different ones — a strategy change, and probably not worth it given combat stats
  already grow free from Bladeburner actions (1 → 171 in 26h measured).
- **🔑 Chaos fix — and the answer turned out not to be Diplomacy at all: we were grinding in the
  worst city in the game.** The reported symptom was chaos compounding unchecked (Sector-12 69 → 178
  in 10.6h, Tracking's EV/sec collapsing 2.5× over the same span) with `Diplomacy` never running.
  **Two causes, both fixed.** (1) *Diplomacy was structurally dead code*: `pickOverheadAction` is
  only reached when `pickRankAction` returns null (while recovering), and the call site passed
  `hpRecovering ? 0 : hpFraction`, forcing the HP branch before the chaos branch could evaluate. Now
  passes the real `hpFraction` plus the latch separately, so suppression runs inside the HP
  hysteresis band — where it is provably safe — while the hard HP floor and stamina recovery are
  never traded away. Bounded (`MAX_DIPLOMACY_DUTY` 20%/hour), target-seeking (`CHAOS_TARGET` 50, so
  it stops on its own), and self-measuring. That last part was deliberate: the 2026-07-30 trial had
  measured Diplomacy as **2–3× too weak** to outpace the decay it fought, so rather than bet on it,
  the engine now logs each run's chaos delta and answers its own open question.
  (2) 🔑 **Sampling all six cities — free, since those getters were already charged for our own city
  — revealed Sector-12 was the worst on _every_ axis simultaneously**: chaos 177.5 (next worst 60.2),
  population 620.7m, 21 communities, versus **Volhaven's 3.4 / 1170.6m / 75**. No trade-off to weigh.
  The engine had never known this because it only ever sampled its own city. A new one-off
  `src/switchbbcity.js` moved the division and **measured the move**, closing **Q5(a), open since
  2026-07-30**: `switchCity` costs **$0, 0 rank, no travel time** (completes in one tick) and its
  only cost is interrupting the running action. 🧮 **Payoff: Tracking's EV/sec 0.0084 → 0.0854
  (10.2×), also 4.0× better than the morning's 0.0211 baseline. One free call beat ~15 hours of
  duty-capped Diplomacy.**
  ⚠️ **Deliberately NOT done: autonomous rotation.** `CITY_ROTATION_ENABLED` stays `false` — the
  *mechanic* is now measured and cheap, but the *policy* (when to move, anti-thrash hysteresis,
  whether Chongqing's 2.4× population beats Volhaven's lower chaos once chaos is controlled) is a
  spec-level decision and is left for one.
  Also caught and fixed a false-attribution bug in the new measurement itself: the first live sample
  recorded "174 chaos removed by one Diplomacy run", which was entirely the city move — chaos is
  per-city, so a cross-city delta is meaningless. Samples spanning a city change are now discarded
  and logged as such; left in, it would have told the next session Diplomacy is ~50× stronger than
  it is.
- **🔴 Phase 39 follow-up: fixed a 10.5-hour zero-rank park found on the first real unattended run.**
  The engine ran 10.5h at a healthy-looking **100% duty cycle and gained exactly zero rank** —
  `rankProducingSec: 0`, three `startAction` calls in the whole window. Cause was a one-line logic
  error in the (loop-inline, therefore untested) start rule:
  `isIdleRead && (changed || !isGeneral || debounceElapsed)` AND-ed observed idleness over every
  other reason to act. But `startAction` auto-repeats and `getCurrentAction()` stays **non-null
  across reps** (reference gotcha 13), so once any action was running the engine could never switch
  to a different one — the `changed` term was computed and permanently gated shut. The HP floor
  tripped, the ladder correctly picked `Hyperbolic Regeneration Chamber`, and the engine sat in it
  long after HP hit full. **Fixed by extracting the rule to a pure, tested `shouldStartAction`**
  (the spec's own ground rules say behaviour must live in exported pure functions — this bug is
  exactly why) and inverting its priority: the only reason *not* to start is that the game is already
  running precisely the action we want. 10 new tests including a liveness property; **verified the
  tests genuinely catch it by re-injecting the old rule (3 failed) before restoring the fix.**
  Live-confirmed after deploy: rank 3052.788 → 3054.347, `rankProducingSec` 0 → 19, and the ladder
  performing a Tracking→HRC transition that was structurally impossible before.
  **Also added the watchdog whose absence let this hide for 10.5 hours:** `detectOverheadStall` +
  an `overheadStall` state field + a `verify:log` assertion for "hours of wall time, zero
  rank-producing seconds". The existing broken-telemetry assertion could never have caught this — it
  requires `rankProducingSec >= 1800` and this failure mode has it at **0**. Both are qualified
  against the three states that legitimately produce zero rank time (all-quarantined, post-install
  `Training`, long yields). The new assertion was verified to **fail against the real contaminated
  state file** before that state was reset. The 10.5h of bug data was discarded rather than left to
  contaminate C1 at 24h — averaging a bug window into the phase's deliverable is the Phase 38 mistake.
  ⚠️ Two further problems found and logged to `BACKLOG.md`, not fixed here: **chaos climbs unbounded**
  (69 → 178 in 10.6h, with Tracking's EV/sec collapsing 2.5× over the same span) because the overhead
  ladder ranks the HP guard above `Diplomacy` and HP is the binding constraint — the fix is a
  spec-level objective-function change, not a hot patch; and **`cli.mjs restart` races `daemon.js`'s
  supervisor** and left two engine instances fighting over the single action slot.
- **Phase 39 (Bladeburner-primary engine) implemented and live-validated — `npm test` green (1246
  tests), R1 measured (with a caveat) and V1 passed live; V3/V4 (C1/C2 checkpoints) still pending
  their real-time thresholds.** `src/bladeburnermanager.js` substantially rebuilt per
  [`phase-39-bladeburner-primary.spec.md`](phase-39-bladeburner-primary.spec.md): telemetry
  derived only from `getRank()`/verified `getCurrentAction()` time, never engine intent (S1 — the
  rule that would have caught every Phase 38 telemetry bug); the engine now HOLDS the player-action
  slot continuously and grants bounded, budgeted, escalating yields instead of Phase 38's
  unconditional stand-down (S2); a rep-starvation detector arbitrates `augfarmer.js`'s faction-rep
  work under a 15%-of-hour duty cap (S3); two structural, two-key safety gates with no runtime lift
  path — Overclock held at level 17 (Q10 unresolved) and Stage B (the five risky Operations) excluded
  from the candidate pool entirely, not just deprioritised (Q11 unresolved) — while `computeCrossover`
  scores the full ungated pool every cycle so C2 (the real go/no-go) is reachable without risking HP
  (S5.1); every `startAction` call is verified against `getCurrentAction()` the next tick and
  quarantined after 3 consecutive failures, surviving the game's own undiagnosed no-op bug rather than
  assuming it away (S6); a new per-attempt diagnostic ledger, `bladeburner-attempts.json`, makes the
  Q10/Q11 diagnosis a log read instead of a live probe (S7); a post-install regime (collapsed max
  HP/stamina right after an install) is detected and accounted for without excluding it from the
  checkpoints (S9a). `dashboard.js`'s `BLADEBURNER` panel re-pointed at the new fields (no new rows);
  `vite.config.ts` gained one filter entry. Full done-vs-left record, the reviewer-blocker-fix index,
  and the carried-forward open questions (Q10/Q11/Q12 + five more) are in the spec itself.
  **Three real bugs found and fixed during the live restart, not caught by `npm test`** (all three
  are in the non-pure main loop, which unit tests don't exercise): (1) a schema-migration bug —
  `seedTotals` partially adopted a Phase-38-shaped `totals` blob because `rankGained`/`overheadSec`
  happened to share field names across the two shapes, producing a `rankPerWallSec` of ~12–29
  instead of ~0.02–0.03 until enough new `wallSec` diluted it; fixed by gating adoption on the
  presence of the new-schema-only `wallSec` key, rejecting the whole blob otherwise (regression test
  added). (2) `getActionSuccesses` throws for General-type actions ("not levelable") — was called
  unconditionally in the attempt-ledger bookkeeping; guarded to Contracts/Operations only. (3) the
  `crossover` and city-breach `warn` log entries were being appended **every tick** (~1/sec),
  flooding the 2000-entry ring within minutes and evicting every other event kind; changed to
  edge-triggered (log on a state change) plus a 5-minute heartbeat for `crossover`.
  **R1 (RAM) measured 90.00 GB — outside the spec's stated 65–85 GB band, but fully explained**: 5
  new legitimate `ns.bladeburner`/city calls required by S7's ledger (`getActionCurrentLevel`,
  `getActionAutolevel`, `getActionSuccesses`) and S10's city stock (`getCityEstimatedPopulation`,
  `getCityCommunities`) add exactly 20 GB to Phase 38's 70 GB baseline — not an identifier-hygiene
  bug. Home has 162 GB free; accepted as correct rather than cutting the ledger/city-stock fields to
  force-fit the original estimate. `daemon.js`/`augfarmer.js` confirmed flat.
  **V1 (independent panel cross-check) passed**: rank, stamina (exact to 3 decimals), city, Synthoid
  population, communities, and skill points all matched the in-game panel exactly at the same
  moment. **One expected mismatch, per S9's own anticipated fallback**: the hospitalization
  *inference* read 0 against the panel's 158 — the inference rule is now known not to fire in
  practice (see `BACKLOG.md`); the panel remains the sole authoritative source, exactly as S9
  designed for this outcome.
  **Next:** C1 (24h) and C2 (whenever the crossover trips) are close-out deliverables, not merge
  blockers — the engine is live and accumulating real wall-clock time toward both.

## 2026-08-02

- **Phase 38 (Bladeburner engine) CLOSED — shipped, but superseded before it delivered its verdict.**
  All four work items shipped and the engine runs unattended; the phase's actual deliverable was a
  *decision* ("is the back-half Bladeburner premise real?") and **neither checkpoint ever fired**.
  Three compounding causes: it spent its first days stood down by design; its measurements were
  invalid (stamina floor unenforced, hospitalization cost charged per-failure rather than
  per-hospitalization — a ~9× overcharge that made it grind the 4×-worse action for hours, and an HP
  "guard" that was really a trap); and ⚠️ **its telemetry reported `rankGained: 0` / `dutyCycle: 1`
  while rank visibly moved**, so a checkpoint would have rendered a confident verdict on the *bug*.
  🔑 Durable lesson: **an engine that measures itself must be validated against an independent source
  before its numbers are trusted** — every defect was invisible in its own state file and obvious in
  the in-game panel. Full done-vs-left record + carried-forward items:
  [`phase-38-bladeburner-engine.spec.md`](phase-38-bladeburner-engine.spec.md) close-out.
- **BN6 win path FLIPPED again — Bladeburner-primary, batcher as its economy** (Kenneth's call).
  Supported by measurement rather than argument: BN6 penalises hacking four ways (`HackExpGain` 0.25,
  `HackingLevelMultiplier` 0.35, `ServerMaxMoney` 0.20, `CloudServerSoftcap` 2.0) and Bladeburner
  **zero** ways, with no combat-exp penalty at all. Stated honestly as the *slower expected* path
  chosen for engine value ahead of BN7 and the hacking-walled back half, with a 2-week tripwire.
  Phase 39 (`phase-39-bladeburner-primary.features.md`) is the Stage-1 successor.
- **Bladeburner mechanics: three findings that change how the engine must be built.** (1) The
  **stamina penalty solved in closed form** — `successMultiplier = min(1, (stamina/max)/0.5)`, three
  live points fitting exactly ⇒ zero benefit above 50% stamina, linear cliff below. (2) The **skill
  cost curve measured** — Blade's Intuition + Digital Observer both to L25 = **3,915 rank** for
  **×3.50** operation success, which **beats the entire Bladeburner aug tree** (×1.28 for ~$250b plus
  62.5k faction rep that resets on every install) ⇒ the install↔rep deadlock dissolved, no install
  freeze needed. (3) **Four scripts contend for the single player-action slot**
  (`bladeburnermanager`, `augfarmer`, `backdoorfactions`, `backdoorwd`), each producing an identical
  "zero drain" symptom from a different cause; and **`startAction` returning `true` does not mean the
  action is running** (`true` returned while `getCurrentAction()` read `null` across 60 samples).
  A per-action-vs-per-second stamina claim was briefly published and then **withdrawn as
  contaminated** — recorded in `docs/bladeburner-reference.md` §8 so it is not re-derived as evidence.

---

## 2026-07-30

- **BN6 win path FLIPPED from Bladeburner black-ops to hacking** — the 2026-07-29 decision's own
  ~3-week flip condition was re-checked live and failed by ~2 orders of magnitude. Sequence:
  combat gate cleared (overshot to 172/172/172/172 — an unattended `commitCrime` grind ran past
  the 100 gate with no harness alive to stop it), division joined (`src/joinbladeburner.js`),
  then `bladeburnerprobe.js` re-run post-join unlocked all 10 previously-throwing calls and
  recovered the **full 21-black-op rank ladder (final gate: rank 400,000 at `Operation
  Daedalus`)**. Two new probes (`bladeburneractionprobe.js`, `bladeburnerskillprobe.js`) measured
  a bad *predicted* rate (~5–6 months), then a ~75-minute 3-version live trial
  (`src/bladeburnertrial.js`) tested every lever that could close it: **scouting** (real, but only
  narrows the estimate's range, not the rate), **skill investment** (13 SP over 10 skills — a
  one-time ~15% step, not a compounding trend), and **`Diplomacy`** as a chaos countermeasure (a
  consistent bump, 2–3× smaller than the decay it fought). **Measured achieved rate — real rank
  gained ÷ real elapsed time, not the prediction — was 0.0144 rank/sec ⇒ ~10.5 months, WORSE than
  the naive zero-investment estimate.** Every mitigation made it worse than doing nothing.
  Bladeburner rank/skills persist across installs so they're banked, not wasted, but **Stage 3 (the
  engine) was shelved without a line of code written** — the "don't spec before Stage 2 completes"
  gate working as designed. One lever logged untested: **city rotation**. Full record:
  [`docs/bn6-playbook.md`](../bn6-playbook.md) §1, [`docs/bladeburner-reference.md`](../bladeburner-reference.md) §3/§8/§9/§10.
- **New permanent API gotcha recorded:** `ns.bladeburner.startAction` is **not one-shot — it
  auto-repeats** like `ns.singularity.commitCrime`, so `getCurrentAction()` never returns `null`
  between reps and a wait-for-null control loop hangs forever. Detect completion via
  `getActionCurrentTime()` wrapping instead. Cost 23 min of a stuck script before it was caught
  (which incidentally produced the ~50-rep scouting sample that answered the scouting question).
- **`vite.config.ts` sync-filter gap found and fixed** — a new script's output file needs an
  explicit filter entry or it **silently never reaches `logs/`**: the in-game write succeeds, `run`
  reports success, and every other file keeps exporting normally, so it presents as a bridge stall
  rather than a missing line. Added entries for the three new Bladeburner probes/trial.
- **`cloudmanager.js` paused (`cloud-upgrade-off.txt`) to unstick the aug ratchet** — per-host
  upgrades ($675.84m/tier) were absorbing essentially all income, holding `totalGain` (1.0615)
  under the ~1.1 install-trigger threshold for **24h+** (`nfgBoundBy: "money"`), while fleet
  utilization sat at **49.1%**. This is the known cloud-vs-ratchet wallet race from `BACKLOG.md`,
  resurfacing under BN6's harsher `CloudServerSoftcap` (2.0 vs BN5's 1.2) and mattering more now
  that the win path is hacking, i.e. M-growth-bound. Confirmed live: `cloud-state.json`
  `paused: true`. ⚠️ **Remove the marker once the ratchet fires** or once utilization climbs.

## 2026-07-29

- **BN5.1 CLEARED**, entered BN6.1 straight off it. `w0r1d_d43m0n` backdoored, confirmed live
  (BitVerse selection screen + `logs/ratchet-log.json` install #35 + a fresh `auginfo.js` reading
  `mults.hacking: 1.3824` = exactly SF5 L1's +8%). Cleared via **batcher-only — the armed gang
  tripwire never fired**, resolving that open question by outcome rather than by its 2026-08-02
  check date. Full record: `docs/bitnodes.md`'s BN5 section; retrospective in `CLAUDE.md`.
- **BN6 reference pair shipped**: [`docs/bladeburner-reference.md`](../bladeburner-reference.md)
  (the interface — full API surface extracted from 41 method files + type enums, both join gates
  verified live, two RAM-analyzer footguns recorded) and
  [`docs/bn6-playbook.md`](../bn6-playbook.md) (the strategy — Bladeburner black-op path chosen
  over hacking, with the hacking path's cost computed rather than assumed: M≈28–37 plus a 35-aug
  Daedalus gate). `getBitNodeMultipliers()` (permanent via SF5) matched the hand-read BitVerse panel
  20/20 — first live validation of that corpus.
- **GOAL panel retargeted to BN6** (`goallog.js`/`dashboard.js`) — `M_TARGET` was still BN5's 9.7;
  now 30 (BN6's fallback hacking gate) labelled `"fallback"` since M isn't this node's win condition.
  Fixed a live bug in the same pass: `nextAug` was showing a 4.6h-stale BN5 target as current because
  `augfarmer.js` (64.10 GB) has never fit on a fresh 32 GB home — added an `AUG_STATE_STALE_MS`
  guard so a dead farmer reads as `"n/a (augfarmer stale)"`, not as live data. 1026 tests pass.
- **Combat 1→100 route measured, not assumed**, for the `joinBladeburnerDivision()` gate. Iron Gym
  priced out ($120/s per stat, one stat at a time, vs ~$3.9k banked at $0/s income). Crime (Mug)
  measured at 0.179 exp/sec/stat — neither of the two predicted bounds (30.4h success-only vs 1.57h
  all-attempts) for the failed-crime-exp question, settling it empirically. `combatrouteprobe.js` +
  `combatgrind.js` are the reusable scripts; also surfaced that `commitCrime` sets a player action
  that survives the script dying (verified: crime kept running with no script alive).
- **Phase 36 F-B shipped** (of 4 work items; see `BACKLOG.md` for the other three's status).
  `trigger-clear` disarm logging is no longer gated on `mode !== "auto"` — the mode we actually run
  had zero recorded disarms across 17 recorded arms. Added `lostSustainedMs` (the previous pass's
  `sustainedMs`) and a rate-limited `shouldLogClear` (60s) with a carried `suppressedCount`. 1029
  tests pass; `augfarmer.js` RAM unchanged at 64.10 GB.
- **Phase 36 F-A shipped** (2 of 4 work items now done). The install-trigger's arm survives a
  restart: new pure `resolveArmResume` resumes a **start time** (never a fired state — `armed` is
  still recomputed fresh every pass, so a resume can only shorten a wait for a currently-true
  condition) from `augfarmer-state.json`, gated on four ordered guards
  (`no-state`/`cycle-mismatch`/`not-armed`/`stale`, 15 min bound). Fixes the case that made an
  install arithmetically impossible under any restart cadence under ~15 min. A `trigger-resume`
  decision record fires once at startup; `triggerArmChanged` joins the state-write gate on the exact
  precedent of `awaitingMoneySinceChanged` so a just-armed stamp is never lost to the 5-min
  heartbeat. 11 new tests, 1040 total pass; `augfarmer.js` RAM unchanged at 64.10 GB. Only the
  buy-set filter remains, deliberately deferred pending real BN6 income data.

## 2026-07-26

- **Fleet-RAM fix — `tryRoot` no longer refuses to root above-level servers (`src/hosts.js`).**
  The guard `reqLevel > myHackLevel` conflated "can I hack this" with "can I root this"; per
  `markdown/bitburner.ns.nuke.md`, required hacking level is **not** a nuke requirement — only ports
  are. Rooting an unhackable server is pure upside (it becomes a worker host; `targets.js`'s
  `isEligibleTarget` independently and more strictly gates what gets *attacked*). Live in BN5 at
  hacking 309: fleet **1,068 GB / 21 hosts → 4,780 GB / 71 hosts (4.5×)**, and the batcher promoted
  from the 3rd-ranked target (harakiri-sushi, $100M — the only pipeline it could afford) to the
  top-ranked **phantasy** ($600M). Critically, it also rescued the **$250M SQLInject.exe** purchase
  made minutes earlier: all 29 servers it unlocks require hacking 819+, so the old guard would have
  refused every one and voided the entire spend silently. `serverlist.js` gained a RAM column plus
  an unrooted-RAM-by-port-requirement summary (the diagnostic that found it); 1013/1013 tests pass,
  with the old test rewritten as the regression guard. Detail + generalised lesson in
  [`docs/batcher-engine.md`](../batcher-engine.md) §4.
- **Phase 35 — the install boundary: telemetry + five recovery-lever fixes.** Six work items
  across `bootstrap.js`/`daemon.js`/`cloudmanager.js`/`resourcemanager.js`/`goallog.js`/
  `dashboard.js`, closing three previously-open bugs and shipping the instrument for a fourth.
  **(1) Boundary telemetry:** `bootstrap.js` stamps a marker at every boundary; `daemon.js` mirrors
  every log event into a non-evicting `boundary-log.json` slice (16h window, 5000-entry cap) —
  retains exactly the data the ~9-10h post-install dead window's F2 finding said was being lost to
  ring-buffer eviction and restart truncation. **(2) Growth-buy inversion (fixes the "never buys a
  second server until 1 PB" bug):** `cloudmanager.js` now buys ranking-derived-size growth servers
  (`pickGrowthRam`, `hackJobGb` published by `daemon.js`) whenever a slot is free, 1× $/GB vs the
  old 2× doubling-ladder default; the ladder survives as the cold-start fallback. **(3) Opener
  reservation fix (fixes the "$250M reserved against $5.3M cash" pathology):** `resourcemanager.js`
  gates expensive openers (HTTPWorm/SQLInject) on eligibility + activation against a new
  trailing-24h income signal (`goallog.js`), with hysteresis so it can't flap at the 2s poll; cheap
  openers still always reserve in full. **(4) Factionless share suppress (cheap version):**
  `daemon.js` zeroes the share carve when no faction is joined. **(5) Floor-reserve restart seed:**
  `daemon.js` seeds the floor-seated reserve from the previous session's persisted batch log at
  startup, freshness-guarded, closing the last member of the 2026-07-24 cold-start-hardening class.
  **(6) Liveness verdict:** `goallog.js`'s `evalStuck` (8 branches: warming/boundary/daemon-dead/
  starved/reservation-pin/idle/boundary-overrun/OK) plus one GOAL-panel line — the 21.7h-unread-
  STALLED failure becomes a one-glance read; delivery (pushing an alert) stays deliberately
  unbuilt per Kenneth's call at spec review. A genuine 1000x units bug in the opener-eligibility
  formula (multiplying a millisecond constant directly against a $/second rate) was caught by the
  test suite before it shipped. 1013 tests pass; RAM gate closed with **zero delta on all six
  touched scripts** (each measured exactly at its documented baseline); live-verified via CDP
  (no RUNTIME ERROR, the SQLInject-over-reservation pathology confirmed gone, `liveness: OK`
  rendering on the live tail) — a stale dev-server connection was also found and fixed as part of
  that verification. → [`phase-35-install-boundary.spec.md`](phase-35-install-boundary.spec.md),
  [`phase-35-install-boundary.closeout.md`](phase-35-install-boundary.closeout.md). The
  interlock audit (D7) and F3's measurement plan (Phase 34's install-bias bug) are recorded in the
  close-out and `BACKLOG.md` respectively, not repeated here.

- **Outside-observer review: five stale claims discharged in `docs/bitnodes.md`, one overclaim
  corrected, and the gang tripwire actually evaluated on its due date.** All resolved with
  measurements already sitting in `logs/`, unread. (a) The `getBitNodeMultipliers` "we have
  neither" note — we have been *in* BN5 since 07-23, and the API doc's precondition is
  *"requires you to be in BitNode 5 or have Source-File 5"* (4 GB); the per-node tables are still
  hand-read and now say so. (b) The WD-gate "**INFERENCE**, ~85% confidence" block — discharged by
  `logs/gatewatch-result.json`, which captured `gateRequirement: **15000**` live on 07-23 with
  `redPill: true`; 500% × 3,000 = 15,000 confirms **both** the 3,000 base constant and linearity,
  promoting BN5's 4,500 from assumption to derived-from-measured. Same capture also answers a
  standing open question: `repSurvivesInstall` = **21,506,614 → 0**, rep does not survive. (c) The
  `ns.singularity.*` "not scriptable for us" note, obsolete since Phase 21's SF4.3 grant
  (2026-07-12). (d) `SF1 level 1 / 3` → **3 / 3**, proven by an `augCount: 0` dump reading every
  multiplier at exactly **1.28**. (e) `SF2 level 0 / 3 (not cleared)` → **1 / 3**, cleared 07-23.
  **Plus an overclaim nobody had flagged:** "BN5's requirement is already MET… BN5 is cleared
  territory" — M does not cross a node boundary (only Source-Files, home scripts and Intelligence
  do), so the real ask is **×7.6 from the 1.28 floor** under `AugmentationMoneyCost` 200% +
  `ScriptHackMoney` 15% ≈ **13× worse aug-buying power** than the BN1 run that produced 10.077.
  Live check folded in: M **1.4126** at ~72h, which is **1.6%** of the earned distance, not the
  15% a raw `M/target` ratio reports.
  **Gang tripwire (`CLAUDE.md`), due today: CHECKED → do not build the gang.** Both firing clauses
  had triggered and the stated threshold fires overwhelmingly ($0.77/s → $5.4k/s → $0/s vs
  $15M/s; $333 banked vs a $2–4t budget) — but ~64 of the first ~72h in-node were spent inside
  engine deadlocks, so **it fires on a bug, not on BN5's economy**, and there is still no valid
  measurement of what this node's batcher earns. Re-armed for **2026-08-02 with a validity
  precondition** (≥24h of actual batch placement) — the durable lesson being that a threshold on a
  measured quantity silently assumes the instrument works. `BACKLOG.md`'s cold-start-hardening
  trigger corrected from "the next BitNode entry" to **now** for the same reason: the class was
  correctly root-caused on 07-24 and then rediscovered one member at a time (53h + 9.1h) instead of
  swept. Docs + `.gitignore` only (`bb-shot.png` → `bb-*.png`); no code touched.

- **Gang companions are gang-gated — the supervisor no longer relaunches an ERROR-and-exit script
  forever in a gangless node.** BN5 has no gang, so `gangmanager.js` hit its
  `if (!ns.gang.inGang())` guard (`gangmanager.js:458`) and exited at once, the supervisor saw it
  missing, and the pair repeated every `SUPERVISOR_RETRY_MS` — **110 attempts over 9.1h** of two
  terminal lines per 5 min, the same terminal-flood class as the `fitsOnHome` spam fixed 2026-07-24
  (which had buried a backdoor confirmation). Fix in `daemon.js`: new pure
  `supervisedResidents(residents, hasGang)` filters `GANG_GATED_COMPANIONS` (`gangmanager.js`) out
  of the supervisor diff, and the startup block skips launching `gangmanager.js`/`gangratelog.js`,
  printing one INFO line instead. `RESIDENT_COMPANIONS` is unchanged — the gate is **dynamic**, and
  `ns.gang.inGang()` (0 GB, the only gang call that works pre-gang) is re-read every check, so a
  mid-node `createGang()` restores supervision within 60s with no daemon restart; the gated names'
  `missingSince`/attempt/backoff state is cleared while suspended so the eventual relaunch doesn't
  inherit a multi-hour missing-since. Side benefit: `gangmanager.js`'s transient 24.8 GB is gone
  from the home-RAM census, removing its launch-order race with `augfarmer.js`
  (`docs/phases/bn5-purchase-plan.md` updated). 924 tests pass; `daemon.js` RAM re-measured at
  **16.3 GB** — unchanged, no analyzer surprise. Live-confirmed on restart: the INFO line printed,
  no gang lines across the following supervisor cycles.

## 2026-07-25

- **Ratchet deadlock fixed — a `fundBlocked` head reserved 100% of the balance behind an
  unreachable aug and starved the fleet for 53 hours.** Found live in BN5.1 at **$5.4k/s** with
  **zero progress since the 2026-07-23 entry**: the aug ladder (4 queued → **13.03×**) put
  Neuralstimulator at **$78.2b** against a $119M fund cap, and Phase 33 decision 4's `fundBlocked`
  branch (`augfarmer.js:1741`) reserved the WHOLE $41M balance on the premise that it belonged to an
  *imminent* spend-down. No install was imminent, or possible — **all four triggers were blocked at
  once**: gain 1.0711 < `MIN_TOTAL_GAIN` 1.1, queue 4 < `STALL_QUEUE_FLOOR` 5, gate 4/30, and both
  `escalation` and `stall` disqualified by the phase `"grinding"` *that same branch forces*
  (`:1115`, `:1101`). So the hold was permanent, not pre-install: `available` sat at **$0**,
  cloudmanager never bought, the fleet froze at **780 GB**, the batcher fell back to **n00dles
  ($1.75M max money)** because the cheapest real pipeline (phantasy, 1,516 GB) didn't fit, and the
  low income kept every aug unaffordable. Fix: the `fundBlocked` branch reserves **0** — the head is
  unbuyable by definition, so the reserve protects no reachable purchase, and the genuine
  pre-install hold is the `spend-down` branch, which already reserves `money` and only runs when a
  sequence really is active. Self-correcting by construction: released cash buys fleet → fleet
  raises income → income raises `fundCap` → the head stops being `fundBlocked` → the normal
  `repMet` branch resumes reserving `livePrice`. Live-validated on restart: `FINANCE: released
  next-aug`, cloudmanager bought the 512 GB tier **4 seconds later** ($28.4M), fleet 780 → **1,036
  GB**. 920 tests pass. Notably the escalation trigger had *already computed the right answer* —
  wait 165 days vs install-and-rebuy 12.7 days — and was fenced out by the phase interlock.
  **Ordering note:** fleet before install was the deliberate call — an install wipes money *and*
  purchased servers, so installing first would have burned the $41M and restarted from hacking 1.

## 2026-07-24

- **Cold-start deadlock fixed — a floor-seated member reserved a pipeline it could never buy, and
  starved every other target's prep.** Found live 11 hours into BN5 with the node earning
  **~$0.77/sec** and **zero batches launched since entry**: `pickBatchSet`'s floor rule seated
  phantasy (top-scored, pipeline **1,684.9 GB**) against a 297 GB budget, the daemon's shrink loop
  couldn't place even `MIN_HACK_FRACTION` (`assignBatchHosts` needs each job whole on one host, and
  the cold fleet was 18 small servers), and the aggregate carve then fenced off the full 1,684.9 GB
  against a **396 GB fleet** — zeroing `waterfallAvailableGb`, so none of the 11 cheaper targets ever
  got prepped, so no affordable candidate ever appeared for passes 1–2 to seat. Self-sustaining: no
  income → cloudmanager stuck at $0 available → fleet never grows → repeat. Fix: new pure
  `memberReserveGb(pipelineCostGb, inFlightRamGb, budgetGb)` in `scheduler.js` returns **0** for a
  floor-seated member (cost > budget), since that remainder is unspendable by construction; safe
  because member launches (step 5) precede the carve and the waterfall (step 7), so the floor member
  keeps first refusal on the whole fleet each tick. Live-validated on restart: `reserveGb` 1,684.9 →
  **0**, `waterfallAvailableGb` 0 → 7.5, utilization **0% → 98.1%** in one tick with prep finally
  running. 908 tests pass (5 new). **Exposed by a BitNode *entry*, not an install** — an install
  preserves home RAM (524 GB free at the BN2 handoff), an entry drops it to ~32 GB with no purchased
  fleet, so the engine had never met a genuinely tiny fleet. Both halves of this were already logged
  as open items on 2026-07-18 (`batcher-engine.md` §4) and left unbuilt.

## 2026-07-23

- **`endgameHold` freeze fixed — a BN1 constant that deadlocked the BN2 ratchet at hacking 2500.**
  `endgameHold = joined(Daedalus) || hacking >= 2500` (no node guard) is BN1's "stop ratcheting, go
  for the Daedalus→Red Pill endgame" signal. In BN2 (WD gate 15,000, Red Pill already installed) both
  clauses trip at ~17% of the way, and every install rule carries `!endgameHold` while the only exempt
  path (gateArmed) had already fired — so the moment hacking crossed 2500 the ratchet hard-froze at
  M 9.73 with 11 augs stuck queued (M flat 90 min; it only limped before because installs kept
  resetting hacking <2500, a race high BN2 income finally outran). Fix: extracted a tested pure
  `computeEndgameHold(currentNode, joinedDaedalus, hacking)` returning false in any node but BN1;
  added `currentNode` to the `endgame-hold` decision telemetry. Consumer check cleared all five
  `endgameHold` uses (install trigger, stall, donation, spend-down, the Daedalus invite/donation
  reservation at `:2240` — the last is dead BN1 choreography in BN2). No RAM change (`getResetInfo`
  already called). Correction found mid-fix: disabling `endgameHold` **alone** is sufficient — the
  Phase 26 gap-7 path (`pickHorizonGrind` → `faction: undefined` when no rep owed → `phaseArmed`)
  already handles the rep-met plateau, so no QLink exclusion was needed (and whether to permanently
  drop QLink stays the M_TARGET≈29 strategy call). **Live-validated autonomously**: at hacking >2500
  with `endgameHold: false`, the trigger armed itself via gap-7, sustained the full 10-min
  `TRIGGER_SUSTAIN_MS`, and fired install #20 with no manual trigger. 285 augfarmer / 894 total tests
  pass. `docs/gang-engine.md` clear-plan section updated (gate confirmed 15,000, rep-does-not-survive
  resolved, M-bar 35–37 → 45 from the 0.8 skill-curve correction).

- **GP1 capture unblocked, and the M gate target re-sized off it (36 → 45).** `gatewatch.js` read
  `RED_PILL in owned`, but `ns.getResetInfo().ownedAugs` is a **`Map`** — `in` checks the Map
  object's own properties, so `redPill` was **always `false`** and the milestone-1 capture silently
  never fired through the entire Red-Pill install. Extracted a tested `ownsAug()` helper (Map branch
  + object fallback). `repSurvivesVerdict()` now baselines on the **peak** pre-install rep instead of
  the most recent one: every sample the Map bug persisted reads `redPill: false`, including
  post-install ones, so a "last pre-install sample" baseline would have picked a post-reset sample
  and compared rep against itself → a false `survived: true`. Live-validated: GP1 fired on restart —
  **gate = hacking level 15,000**, NiteSec rep does **not** survive an install (21.5m → 3.8m).
  With the gate finally read, the BN2 skill curve was fit to four `auginfo` dumps (<0.5% error):
  `level = floor(0.8 * M * (32*ln(exp + 534.6) - 200))` — the **0.8 is BN2's hacking-level
  multiplier**, so the upstream formula overstates level by 25% here. Inverted, exp needed for
  15,000 collapses super-exponentially in M (M=36 → 6.1B, M=45 → 234M, M=48.5 → 91M ≈ exp on hand),
  i.e. every +3 on M divides the terminal XP grind by ~5 — so `M_GATE_TARGET` moved 36 → 45, since
  NFG is money-gated (rep req a trivial 1.6k; the wall is the ×1.14 × ×1.9 = ×2.166 per-purchase
  escalation an install resets) and the extra ~9 M is a couple of install cycles against a
  multi-billion-exp grind. 890 tests pass; both residents restarted and confirmed live.

- **Phase 34 — escalation-aware install timing (`decideInstall` restructure).** Fixes the
  `awaiting-money`-is-escalation-blind deadlock: a money-blocked cycle with a deep queue waited on
  prices the queue's own escalation (`AUG_PRICE_LADDER` per queued buy) had inflated, and Phase 31's
  `stallArmed` backstop had gone blind too (its 48h adaptive threshold got dragged to the ceiling by
  the slow cycles the defect itself causes). Extracted `evalTrigger`'s inline five-way arming block
  into a new pure `decideInstall(ctx)`, adding a fifth reason (`escalation`): armed when
  `waitMs` (afford at the live, escalated price) strictly exceeds `INSTALL_OVERHEAD_MS + afterMs`
  (afford at the recovered base price post-install, `basePrice = livePrice / AUG_PRICE_LADDER **
  queuedCount`). Excludes NFG targets (different ladder, tail designed to run long) and carries no
  `mustBuyHold` conjunct (same exemption `gateArmed` already gets). Every rule now reports its first
  failing guard (`trigger.blockers`), so "why didn't it arm" is a one-line state-file read instead of
  re-deriving the arithmetic by hand. Live-validated same day: restarted clean, RAM unchanged at
  64.1 GB, and within the first heartbeat the escalation rule armed on a real `awaiting-money` cycle
  (`reason: "escalation"`, `waitMs` ≈14.6min dominant over ≈10.5min overhead+afterMs) — L1/V1 both
  confirmed live via CDP, opportunistic L2 evidence captured too. → `phase-34-install-timing.spec.md`.
  V2 (median install interval + `stall.thresholdMs` recovering off the 48h ceiling) is a ~1-week soak,
  not a merge blocker.

## 2026-07-22

- **Stock docs consolidated into [`docs/stock-engine.md`](../stock-engine.md)** (research/prep, no
  engine code). Full `ns.stock` API surface + in-game mechanics doc captured; costs measured live via
  new `stockprobe.js` (all access flags `false` in BN2.1 — BN1's TIX wiped by node entry; WSE $200m /
  TIX $5b / 4S-TIX $25b, commission $100k, 6s ticks, TicksPerCycle 75). Shorts/limit-stop resolved as
  BN8-or-SF8.2/8.3 gates → current-save engine is long-only. Old `docs/stock-market.md` archived.
  Side finds: `getBonusTime()` throws without TIX (0 GB ≠ no precondition, gang-API class); viteburner
  never uploads brand-new files (silent `pending` — wget-seed workaround in `docs/dev-server.md`).
- **Gang engine adversarial audit + territory-deferral rationale CORRECTED.** A cold-context fable
  re-review (findings given as claims, methods withheld → independent re-derivation) confirmed the
  headline finding and corrected the record. **Territory income is ~territory^2.5 → ~124× money at
  100% (10.2× at 50%), not the ~20× Phase 30 recorded** — that was a `gangreward.js` bug (its
  "vs-current" column used the respect ratio for both axes; **fixed** to print money- and
  respect-multipliers separately). Phase 30's three deferral grounds were all wrong (the "80% combat
  / from-scratch build" mismatch ignores that power weights stat *magnitudes* — 0.15 × ~90k hack ≈
  13.5k vs rival powers 3.3k–16.5k, so a hacking gang is plausibly power-viable with zero combat
  training; "$25t catalog / below batcher" was stale; "permanent" assumed a static rival field that
  compounds ~+75%/day). **The operational call still holds** — territory is moot for BN2.1 because
  money isn't the binding constraint and saturates first (~$806b/day income meets the ~$310–400b need
  in ~½ day, vs ≥3–6 days to build meaningful territory) — but "PERMANENTLY deferred" is re-scoped to
  "deferred for this node"; future gang nodes must re-price. Two of the auditor's own sub-findings
  were **refuted** by the review and closed so they aren't re-worked: the 3-of-11 gang-aug "under-buy"
  (skipped 8 are pure-combat, no cha aug exists — the 3 are correct) and `ASCEND_MIN_FACTOR` (unvalidated
  but self-obsoleting, leave alone). Records: `phase-30-gang-territory.features.md` VERDICT,
  `BACKLOG.md` Tier 4, `src/gangreward.js`. No `gangmanager.js` change — audit only.

- **GOAL panel shows projected (post-install) M from queued augs.** Installed M sits flat through
  an entire buy cycle and only steps at install, so the GP2 tripwire reads "STALLED 12h" during
  normal money-paced buying — the flat installed-M gave no sign the queued augs are climbing.
  `augfarmer.js` now publishes `queuedGain` (product of the purchased-but-uninstalled augs' hacking
  mults) + `queuedCount`; `goallog.js`'s snapshot projects `queuedValue = installed M × queuedGain`
  + `queuedPct`; `dashboard.js` renders a `+queued: M 3.42 ~20% (9 augs pending install)` line under
  the M line (only when augs are pending). Purchased-only — excludes the speculative NFG tail
  (`trigger.totalGain`). Live-verified (M 1.51→3.42 queued, 9 pending). `npm test` 866/866; no RAM
  change (object-field reads only, no new `ns` surface).

## 2026-07-21

- **Gang money pivot — gang income ~7× ($598k/s → $4.2M/s), 8 members on Money Laundering.**
  The gang was optimizing RESPECT (rep-saturated: all NiteSec augs unlocked at 2.5m req, gang
  respect well over it) while MONEY is the only open BN2.1 gate. Two changes that only work
  together: `evalLadderMove` now optimizes money (promote by money gain, heat-demote worst
  money-per-heat, efficiency-demote a rung earning less than the one below; `gainsFor` adds
  `ns.formulas.gang.moneyGain`), and `TASK_LADDER` is money-ordered with the zero-money
  pure-respect tasks (DDoS/Plant Virus/Cyberterrorism) dropped (`LADDER_VERSION` 4→5). Measured
  prize: a Money-Laundering member earns ~40× a Ransomware member of equal stats.
  **Two live regressions preceded the fix and are the lesson:** (1) reordering the ladder alone
  regressed money ($598k→$138k/s) — the respect mover heat-demoted the top-money task; (2) turning
  formulas on with the respect ladder crashed it ($0.05M/s) — the mover climbed every high-stat
  member to Cyberterrorism (max respect, zero money) and the heat gate never stopped it (our stats
  make even that low-heat). The real lever throughout was that Formulas.exe was OFF (hacking 325 <
  400), which suspends the mover entirely. `npm test` 848/848; live-validated to steady state
  ($4.21M/s, netWanted −0.27, respect 7.9m). RAM unaffected (`formulas.gang` already charged).
- **Formulas.exe autobuy is now gang-aware.** The hacking>400 gate on the autobuy is a batcher
  tuning; a gang needs Formulas at any level (its mover suspends without it). `planFormulasPurchase`
  gains a `gangExists` input (from `gang-state.json` presence — 0 GB `ns.fileExists`, no gang-API
  import-bleed) that bypasses the level gate while still respecting TOR/stale/cash. Prevents the
  gang sitting un-optimized through the post-install hacking re-climb every cycle. +3 tests.
- **Gang log survives restarts.** `gangmanager.js` initialized its log buffer to `[]` and wrote in
  `"w"` mode, so every restart silently wiped all prior ascend/recruit/equip-buy events. New pure
  `seedGangLog` seeds from the persisted file (fallback `[]` on missing/malformed/non-array,
  ring-trimmed). Forward-only — history already lost is unrecoverable. +6 tests, live-validated.
- **Dashboard GANG panel shows the member task split.** New `tasks: Ransomware 9 | …` line, most-
  populous first, capped at `PANEL_ENTRY_CAP` with a `+N distinct more` suffix. Previously only
  visible via a manual `gang-state.json` read. Row/column budgets hold; +6 tests, live-confirmed.

- **Phase 33 (Workstreams A + C) — escalation-aware buy ordering + utility must-buys shipped.**
  `augfarmer.js` was overpaying its aug-purchase escalation structurally: every purchase raises the
  price of everything bought after it by ×1.9, but `pickTarget` sorted rep-met candidates
  cheapest-first — the exact worst order (measured: $58.17b paid vs $18.15b optimal on one basket).
  Fix: a tiered, price-DESC sort (tier 0 buyable discretes, tier 1 NFG, tier 2 fundBlocked
  discretes, tier 3 buyBlocked NFG) plus a fundability guard (`fundCap = money + income×4h`) that
  retires a live pathological case — the farmer had been reserving $325.8t for QLink, frozen, for
  90+ minutes. A must-buy hold (`evalTrigger`) + must-buy-first spend-down order
  (`spendDownPlan`) guarantee the three allow-listed utility augs (CashRoot, Neuroreceptor, Red
  Pill) actually get bought before an install, closing a starvation bug where they'd never won
  their score race. `npm test` 834/834 (261 in `augfarmer.test.js`, up from 232); `verify:log`
  carries two pre-existing, unrelated failures (already in `BACKLOG.md`). RAM held exactly at
  64.10 GB; the WD-gate probe (`worldprobe.js`, reused instead of writing a duplicate — its
  export was also silently broken and is now fixed) measured 1.8 GB. Live-validated same session:
  the head flipped off QLink onto a fundable aug within one poll of restart, and the live
  must-buy-cost arithmetic ($10.263b) matched the spec's hand-worked example ($10.27b) almost
  exactly. Buy-order-across-a-real-cycle and 24h-soak checks are logged as follow-ups, not
  blockers (spec's own stated gate).
  → [phase-33-money-throughput.closeout.md](phase-33-money-throughput.closeout.md)

- **Phase 32 — BN2.1 progress tracker shipped.** Dashboard couldn't answer "are we progressing
  toward ending BN2.1?" — the loud metrics (gang respect, faction rep) are solved subgoals, while
  the metric that actually gates the win (installed hacking mult `M` toward the `w0r1d_d43m0n`
  gate) had no readout. Step 1: `transactionsmonitor.js` now tracks gang income alongside hacking
  (gang was ~96% of income this cycle, previously untracked — `translog.js` gained a per-source
  `coalesceIndexForSource` helper so two sources landing in the same poll each fold correctly).
  Step 2: new resident `goallog.js` (60s cadence, ~3.1 GB) samples `M` + a smoothed gang+hacking
  $/sec + trend into a 48h ring, feeding a new `GOAL` panel — first in `dashboard.js`'s layout,
  zero added RAM (unchanged 2.6 GB). `augfarmer.js` gained an `awaitingMoneySince` stamp
  (restart-persisted) for the panel's elapsed awaiting-money timer. `npm test` 805/805 (28 new
  units); `verify:log` clean against real exported logs aside from two pre-existing, unrelated
  gaps (logged in `BACKLOG.md`). Live-validated end to end: gang income records confirmed
  post-restart, the L2 gang-equip/`sinceInstall` reconciliation agreed to within ~25%, the GOAL
  panel rendered correctly with no wrap/scroll, and the awaiting-money timer grew live. RAM gates
  held exactly at their pre-change baselines (`dashboard.js` 2.6 GB, `augfarmer.js` 64.1 GB,
  `transactionsmonitor.js` 2.6 GB, `daemon.js` 16.3 GB); `goallog.js` measured 3.1 GB against a
  ≤4.0 GB gate. Surfaced (logged, not fixed): a dead OR-term in `augfarmer.js`'s state-write gate,
  and an unrelated `verify-finance.test.js` whitelist gap.
  → [phase-32-bn2-progress-tracker.spec.md](phase-32-bn2-progress-tracker.spec.md)

- **Gang respect-rate sampler shipped (`src/gangratelog.js`).** The Phase 30 survivor slice:
  persists a durable `respectGainRate` / `wantedPenalty` / aggregate-hack-ascension-mult series
  that `gang-state.json`'s overwrite-in-place snapshot can't keep. Built as a thin consumer of
  `gang-state.json` (pure `ns.read`/`ns.write`, ~0 gang-API RAM, no coupling to `gangmanager.js`)
  rather than a second gang-API reader. Resident + daemon-supervised (survives restarts/installs);
  5-min samples, ring-capped 14 days → `logs/gang-rate-log.json`. 11 unit tests, live-validated.
  Closes BACKLOG item 1 of the Gang-Tier-4 survivor set; the cadence-count check (item 2) remains
  open. Gang Tier 4 (territory) stays deferred permanently.

- **Phase 31 (stall-arming) shipped — the money-blocked auto-install deadlock is fixed.** Adds a
  fourth install-trigger arming reason, `stallArmed`: the symmetric counterpart to the rep-side grind
  horizon, so a cycle stuck in `awaiting-money` past the adaptive stall threshold (12–48h, 24h
  fallback) now installs on its own instead of waiting forever (observed live: a 71.4h stall broken
  only by a manual `installer.js`). Arms on either the queued mult-gain gate or a new
  `STALL_QUEUE_FLOOR`=5 purchase-count floor (covers pure-padding queues), gated off during a
  productive grind. Pure-logic change — RAM unchanged at 64.1 GB; `npm test` 752/752 (10 new units +
  `reasons` regression handling). The spec's "next-day live gate" was re-priced at ship and met by
  inspection of `augfarmer-state.json` (the only untested link — the live `stalled` computation and
  its threading into `reasons` — confirmed directly) rather than by a passive 24h wait.
  → [phase-31-stall-arming.spec.md](phase-31-stall-arming.spec.md)
- **Phase 29 observation window closed early (day 1 of 7); `gangmanager.js` unfrozen.** Goal
  metric `respectGainRate ≥ 1.27/tick` was overshot ~425× (live 539.6) with 19h of clean
  autonomous soak, so the window was retired by decision rather than run to ~2026-07-27. Phase 29
  docs graduated to `docs/phases/`. Surfaced gap carried to Tier 4 brainstorm: no persisted
  `respectGainRate` series exists (`gang-state.json` is overwritten each tick).
  `docs/phases/phase-29-gang-scaling.spec.md` → Close-out.

## 2026-07-20

- **Gang rep pivot — the task ladder is pinned to Ransomware.** Tier 1's ladder was ordered by
  money and its promotion test asked only "did money go up?", so members climbed into tasks costing
  750× more wanted for 2× the respect. The gang overwhelmed its own cooling and spent **71.6% of
  4.3h** in the sink, where respect gain — which is what buys faction rep — is exactly 0. We are
  rep-gated, not money-gated ($4.128b held; the target aug costs $4m but needs 1,000 NiteSec rep
  against ~41), and gang money is ~0.003% of income. Pinned to one rung; climbing machinery left
  intact and quiet behind its existing top-rung early exit. Caught pre-ship: persisted rungs of 2
  would have resolved to `undefined` and silently idled the whole gang — now clamped, with a
  regression test. 704 tests. Acceptance (duty cycle, respect/hr, rep/hr) pending a few hours of
  live observation. → [phase-28-gang-rep-pivot.md](phase-28-gang-rep-pivot.md)
- **Aug-ratchet unblocked — it had been dormant since BN2 entry (~2 days) on a home-RAM deadlock.**
  Probe (prompted by "is `augfarmer.js` splittable?") found the standing diagnosis wrong on both
  counts: the script needs no split, and it has no home-only dependency — `installAugmentations`
  lives in `installer.js`, and every home reference passes an explicit host arg. The real deadlock:
  `installer.js` is the only thing that buys home RAM and only runs during an install, which the
  ratchet couldn't reach while home was too small to host the 64.10 GB farmer. Broken by buying one
  tier (64 → 128 GB, $31.862m against $3.076b held); `augfarmer.js` self-launched on the daemon's
  next retry and resumed (joined Chongqing + Tian Di Hui, targeting Neurotrainer I). New
  `src/upgradehomeramonce.js` — one tier, spend-capped — is the safe sibling to
  `upgradehomeram.js`'s full-bankroll drain. The deadlock is *not* auto-detected; see `BACKLOG.md`.
- **Phase 27 Tier 1 shipped — gang manager (recruit + task-assign).** `gangmanager.js` runs as a
  home-resident daemon companion: greedy recruitment, a measured money-ladder climb (probe-and-
  compare against `moneyGain` actuals, no Formulas.exe needed), and a wanted-level watchdog with
  enter/exit hysteresis. Equipment/ascension/territory (Tiers 2-4) are explicitly out of scope,
  grep-rail-enforced. Live-deployed: home RAM bought 32 → 64 GB ($10.083m, one tier);
  `gangmanager.js` measured 12.7 GB, landed in its priority slot; full resident census 59.1 GB
  against a 63.5 GB gate.
- **Live bug found and fixed same session: the wanted-sink baseline froze at tick zero.** A fresh
  gang starts *at* its wanted floor, so a "strictly new minimum `wantedLevel`" recalibration
  condition could mathematically never re-fire — the gang sat parked on the low-value sink task
  for 8.5+ hours before the fix landed. Corrected to "at or below" the lowest `wantedLevel` seen;
  redeployed live, confirmed recovery within a minute (first promotion of the run followed
  immediately). Full record: `docs/phases/phase-27-gang.closeout.md`.

## 2026-07-19

- **BN2 COMMITTED — the gang exists.** NiteSec, `isHacking: true`, fixed permanently. Sequence run
  live: backdoor `avmnite-02h` (BruteSSH + FTPCrack sufficed) → join NiteSec → `createGang`. This
  ended four days of circling: the gang API had been **entirely inert** until this call, so no gang
  work of any kind was possible before it. `gangprobe.js` now returns 15 tasks / 32 equipment /
  `errors: []`. Gang at handoff: respect 1, territory 14.3%, zero members, nothing running.
  Kenneth's closing argument, recorded because it generalizes: **a BitNode restart is cheap when
  the node holds no progress** — in-node permanence is bounded by restart cost, not infinite.
- **`gangaugs.js` — aug-catalog sweep across factions** (read-only, works pre-gang, no membership
  needed). Corrected the check that had blocked the BN2 decision on two counts: its "once in the
  gang faction" precondition was **false**, and it was aimed at the **wrong factions**. Measured:
  the five pure-criminal gang factions union to hacking **×1.061**, while the 17 non-gang factions
  union to **×23.121** — so a gang is worth ~+6% M, and its real value to BN2 is the money/rep
  engine that funds the megacorp catalog, not the augs it sells.
- **`share-off.txt` retired** on joining NiteSec — share back on at 1.12 TB / 280k threads, fleet
  utilization 6.4% → 27.6%. The auto-suppress-when-factionless rule that would prevent a repeat is
  still unbuilt (`BACKLOG.md`).
- **Convergence rules added to `CLAUDE.md`.** The "Working with Kenneth" section had six-plus rules
  telling Claude to *open* questions and none to *close* them; four days of circling was that
  imbalance executing as written. Every new rule constrains *that* a conclusion is reached, never
  *which* — the test Kenneth's yes-man concern produced. Diagnosis:
  `docs/metareference/divergence-without-convergence.md`.
- **`tools/bb`: new `join "<Faction>"` verb + `goto` badge fix.** `goto` used `exact: true`, but a
  pending invite renames the nav button to "1 Factions", breaking it precisely when it's needed.
  The `join` verb pairs each `Join!` button with its heading by DOM order and throws rather than
  clicking the wrong one — a naive first-match click would have joined Sector-12 and permanently
  foreclosed five city factions. Caveat learned the hard way: a click fired from inside
  `page.evaluate()` is untrusted and MUI ignores it *while reporting success*.

## 2026-07-18

- **BN1.3 CLEARED.** `w0r1d_d43m0n` backdoored ~10:41 AM, confirmed via the BitVerse-selection
  screen (`bb-shot.png`). Sequence: install #10 (Phase 26 A2's gate-release fire, unattended) →
  install #11 (manual, banked Daedalus favor via the donation shortcut in
  `docs/reputation-favor.md` — the automated ratchet has no path to this once `endgameHold`
  latches permanently) → auto-donate fired on its own → Red Pill bought → install #12 (manual,
  activates the Red Pill — owning it isn't enough, `w0r1d_d43m0n` needs it installed) →
  `backdoorwd.js` fired unattended. Full story, including the two automation gaps this exposed:
  `docs/phases/phase-26-ratchet-autonomy.closeout.md`. What's next is undecided — see
  `CLAUDE.md`'s "Current goal" line.
- **Phase 26 B1 shipped — companion supervisor + `HOME_RESERVE_GB` bump** (`phase26-b1`, held
  unmerged until after install #10 per the phase spec's S7 staging). `daemon.js`'s main loop now
  diffs `ns.ps("home")` against `RESIDENT_COMPANIONS` every 60s and relaunches any missing one via
  the existing `launchDetached`, with a 5-minute per-script backoff so an instantly-re-crashing
  script produces a bounded WARN cadence rather than a relaunch storm. A missing-but-doesn't-fit
  companion (normal for `augfarmer.js`'s 64.1 GB in a fresh node's early hours) gets its own
  `waiting-ram` state — one INFO line on entry, then silence — instead of a spurious WARN loop.
  `HOME_RESERVE_GB` 32 → 80 ships together (never separately): a relaunched `augfarmer.js` needs
  the headroom to actually fit. Self-terminating fulfillers (`procureprograms.js` and siblings)
  are deliberately unsupervised — their absence is success, not failure. New pure `planRelaunches`;
  `hosts.test.js`'s two `HOME_RESERVE_GB`-dependent fixtures updated as an intended change, plus a
  new case locking the 64→0 GB flip at the new reserve. Full suite green; daemon.js RAM flat at
  16.3 GB (already charged via `sampling.js`'s `ns.ps`). Merged 2026-07-18 after Phase 26 A2's
  install #10 completed live (confirmed via `ratchet-decisions.json`). **Live-validated same day
  (L4/L5):** `daemon.js` restart brought every companion back with state intact; killed
  `transactionsmonitor.js` and (separately, mid-`grinding`) `augfarmer.js` over CDP — both
  relaunched within one 60s supervisor tick, `augfarmer.js`'s cycle state (lastAugReset,
  boughtThisCycle, trigger) survived cleanly with no spurious re-fire. Found in the process (not
  fixed, see BACKLOG): `companion-relaunch` log events get FIFO-evicted from
  `daemon-batch-log.json` within minutes on a busy fleet — `trimLog` only pins the latest `mode`
  event, not this one.
- **Phase 26 A2 + B2 shipped — the endgame gate-release exception + stall-age detection**
  (`phase26-a2-b2`). A2: `evalTrigger` gains a third arming reason — `gateArmed`, true when
  currently-queued augs would close an in-scope faction's aug-count gate (`computeGateRelease`'s
  two-step check: does an installed-count gate exist, and does the SAME faction's requirement
  close on the owned-including-queued count) — deliberately independent of `endgameHold` and
  `MIN_TOTAL_GAIN`, guarded only by `closedByQueue` so an install that would not actually move the
  gate can never fire this way. This is the fix for A2, the deadlock A1's runaway uncovered: queued
  augs alone never install, so the gate never closed and Daedalus never invited. B2: augfarmer
  self-reports a stalled auto cycle — age since `lastAugReset` exceeding an adaptive threshold
  (3× the median observed cycle interval, clamped 12–48h) with no install in progress — as a
  `stall-warning` decision record + terminal WARN, re-warning every 6h while stalled. Deliberately
  NOT suppressed by `endgameHold` (gap 9's exact shape: healthy processes, zero progress,
  indefinitely). D9 lands alongside: `evalTrigger` now also names the NFG tail's binding
  constraint (`nfgBoundBy: "money"|"rep"|"none"`) on every record. Full suite (656 tests) green;
  RAM flat at 64.10 GB. **Live-validated 2026-07-18:** restarted `augfarmer.js` live, arming
  recorded within one poll (`trigger-arm`, `reasons.gateArmed: true`, `gateRelease` naming
  Daedalus, `totalGain` exactly 1 — no gain-side arming at all), fired at the full
  `TRIGGER_SUSTAIN_MS`, and install #10 landed via `installer.js` — the first unattended endgame
  install this ratchet has ever completed.
- **Phase 26 A1 shipped — gate-aware buying breaks the 29/30 deadlock** (`5ad32a3`). Every unowned
  filter-passing aug was sold only by Daedalus/Covenant/Illuminati, the factions the aug-count gate
  locks us out of, while every buyable aug scored 0.00 and was dropped — circular, unbreakable by
  time, money or rep. Adds `numAugmentations` to `evaluateRequirement` (it had been falling through
  to `default: return false`, so the requirement read unmet forever), `onlyAugCountGap` mirroring
  the existing `onlyCityGap`, plus `findAugCountGate` / `pickGateFiller` and a `gate-fill` branch.
  627 tests. **Shipped with a runaway, caught live in 90 seconds:** the gate was keyed on
  *installed* augs but buying only *queues* them, so the gap never closed and it re-fired every
  tick — 9 buys, $4.8m → $16.1b, ~$24.9b total. Seventh instance of the "what we have vs. what we
  will have" confusion, written in the session that documented the other six. Damage bounded
  (0.009% of cash, inflation resets on install, all 9 augs count toward the gate). **Process note:
  the decision to skip the spec stage for A1 (D12) did not pay off** — a cold reviewer asked for
  failure modes would plausibly have caught both the runaway and A2. → Phase 26 features doc.
- **Phase 26 A2 identified — nothing installs the queued augs.** `endgameHold` blocks arming, so no
  trigger fires, so no install, so the installed count stays 29 and Daedalus never invites, so the
  hold never clears. A1 solved "the engine won't buy the aug"; it did not solve "nothing installs
  it." Spec target — it edits an endgame path that has never run unattended.
- **Phase 25 FROZEN; Phase 26 opened.** The close-out had drifted into a live bug tracker —
  archived in `docs/phases/` yet still absorbing production bugs three days after shipping (gaps
  7, 8 and 9 all landed 2026-07-18). Phase 25's own defects are now all closed; the remaining
  items aren't its defects but design questions its spec never asked, so they moved to
  **`phase-26-ratchet-autonomy.features.md`** (repo root while active): supervision (gap 4),
  stall-age detection (gap 7's follow-on), NFG rep as a planned expense (gap 8's strategy half),
  and gate-aware buying (gap 9). Phase 26's thesis is the root cause all four share — **`score` is
  one number doing four jobs, and the engine has no representation of what it is currently trying
  to achieve**; six separate Phase 25 bugs were that same absence surfacing somewhere new.
- **Phase 25 gap 3 CLOSED — the Daedalus gate counts DISTINCT augs**, settled by our own position
  rather than a test: 29 distinct + ~50 NFG levels, every *other* requirement met (`$288t` ≥
  $100b, hacking 4251 ≥ 2500), and **no invite**. Prior evidence was consistent with both readings;
  what settled it was a state where they predict *different observable outcomes*.
- **Phase 25 gap 9 found — a hard deadlock now blocking the BN1.3 clear.** At 29/30 augs with
  `endgameHold` on, arming is blocked → no spend-down → only the *head* target is bought → the head
  is NFG forever → NFG never raises the distinct count. Wired Reflexes would close the gate for
  1,250 rep / $0.004b against $288t on hand, but scores 0 on hacking so the engine can't see it.
  Surfaced by a request to weight `company_rep`, which was **rejected** — it admits 4 zero-hacking
  augs and misses the actually-cheapest exit (a combat aug). → Phase 26 track A1.
- **`docs/neuroflux.md` — the ladder decomposes: 2.166 = 1.14 × 1.9.** The second factor is this
  build's **per-purchase aug cost multiplier**, which applies to *every* aug, not just NFG, and
  resets on install. So a $4m junk aug and a $25b real aug impose the same tax on everything bought
  after them — 1 buy ≈ 0.8 NFG levels, 4 ≈ 3.3, 18 ≈ cycle destroyed. This is the number that
  prices any "should we buy this?" decision, and it's why gate-buying must be tightly gated.

- **Phase 25 gap 8 — NFG's rep requirement climbs ×1.14/level; the close-out had recorded that it
  doesn't.** Install #9 measured repReq 122,736 → 998,737 over exactly 16 levels (= 1.14¹⁶). The
  original "checked" reading compared a before/after that spanned a catalog which hadn't rebuilt —
  the lesson being that a cross-install comparison is only as good as the rebuild between them.
  Load-bearing because rep resets to zero every install while the requirement doesn't: each cycle
  re-earns a compounding target (10k → 123k → 999k over three installs) on roughly linear rep
  income, so **rep is about to replace money as the binding constraint on the NFG tail and then
  shrink it every cycle** — and the tail is most of a cycle's gain (16 NFG levels vs 6 discrete
  augs at #9). Fixed: `NFG_REP_LADDER` + `nfgLevelsByRep`, with `spendDownPlan`'s buy loop and
  `evalTrigger`'s projection now bounded by **both** ladders (the projection was money-only, an
  optimism that inflates the `totalGain` `MIN_TOTAL_GAIN` gates on). 601 tests pass. New mechanics
  reference **`docs/neuroflux.md`** (+ `INDEX.md` row) — both ladders, the counting quirks, the
  seller rule. **Left open:** nothing plans NFG rep as an expense; donation is the only rep lever
  that scales with our surplus and isn't aimed at NFG. → close-out "Open gaps" (8).

- **Phase 25 gap 7 — the trigger could not arm at a rep-complete plateau; the auto cycle sat 25
  hours doing nothing.** After install #8 every one of the 38 reachable augs was rep-met, so
  `pickHorizonGrind` correctly returned no faction — and `evalTrigger` read "no horizon" as "don't
  arm" when it means "nothing left to wait on." `idle-plateau` couldn't catch it either: NFG's
  per-cycle cap keeps the action list non-empty, so `planActions` stays in `grinding`. Result:
  `gainArmed: true`, gain 2.36, **$3.3q idle, 25h stalled, every process healthy**. Fixed —
  `grinding` + nothing owed rep now arms (money-blocked stays excluded; that's `awaiting-money`).
  590 tests pass (7 new, incl. the live shape as a fixture and a guard against the money-blocked
  overreach); two older tests whose "does not arm" control *was* this state rewritten to assert
  their real intent. Validated live: armed 10s after the reload, `phaseArmed: true` /
  `horizonMs: null`. **Fifth instance of the phase's faction-identity confusion — and the first
  where the answer was "no faction at all"; the two prior fixes both only widened which faction
  gets picked.** It also failed with gap 4's exact signature (silent permanent stop, all processes
  alive), which is now a design constraint on gap 4: **the supervisor must watch progress, not
  processes.** → `docs/phases/phase-25-faction-strategy.closeout.md`, "Open gaps" (7).

## 2026-07-17

- **Phase 25's last open item closed: the first auto fire (L7) passed — install #6.** The
  aug-ratchet installed itself, unmodified, on the first attempt. Three steps that had never run
  in any form all fired: spend-down (bought 1 aug + 11 NFG levels), `ns.exec("installer.js")`,
  and `installAugmentations("bootstrap.js")` itself — plus home-cores 1 → 4 ($485.6b). Fire to
  reset took 11 seconds; `mults.hacking` 1.632 → 1.839, `hacking_exp` 1.704 → 2.823,
  `faction_rep` 1.491 → 2.125, Daedalus gate 8 → 15/30. Recovery via the cbScript was clean —
  7 factions rejoined and hacking 1 → 494 within 5 minutes — and the post-install false arm did
  **not** recur, settling the main risk carried out of the BN1.2 clear. Two predictions held:
  the observe-mode flap is real (10:21 cadence) and the `auto` latch pre-empts it. **Every step
  of the cycle is now proven; the phase has no open tests.** Reading L7's logs turned up two new
  bugs, neither blocking: spend-down logs *projected* prices rather than actual (~5-6×
  under-logged), and the NFG seller is picked by catalog order rather than by rep (worked by
  luck). → `phase-25-faction-strategy.closeout.md`.
- **Both L7 bugs fixed the same day (`4b80da4`).** `pickNfgSeller()` replaces `sellers[0]`: NFG's
  rep requirement is identical whoever sells it, so the joined faction with the *most* rep is
  strictly best — it's the only pick that can't suppress the whole NFG tail, and rep is what caps
  how many levels a spend-down takes. (Rep resets to 0 on install, so the old catalog-order pick
  was a coin-flip re-tossed every cycle; losing it wastes the entire bank.) The buy path now logs
  the live price read immediately before purchase, keeping the 1.9-ladder projection alongside as
  `projected` — so the next spend-down *measures* the real ladder instead of us inferring it. 584
  tests pass (6 new, incl. install #6's shape as a regression fixture); augfarmer RAM unchanged at
  64.10 GB; shipped live mid-cycle via `restart daemon.js`, since the spend-down the fix protects
  runs in the already-running augfarmer.
- **NFG price ladder measured and the projection corrected (`fix/nfg-ladder-measured`).** With
  gap 5 logging paid-vs-projected, installs #7-#8 ran unattended and install #8's 11-level
  spend-down revealed the true ladder: a dead-constant **2.166** (the old 1.9 was an eyeball
  estimate ~14% low, compounding). `NFG_PRICE_LADDER` set to 2.166. Bumping it alone would have
  been wrong: `evalTrigger`'s `nfgLevelsProjected` is the geometric closed form
  `k = floor(log(1 + money*(L-1)/p) / log L)`, but the `(L-1)` factor had been written as the
  literal 0.9 — exactly `1.9 - 1`, silently coupled to the old ladder — so it's now
  `(NFG_PRICE_LADDER - 1)` and both track together. Validated against reality: predicts 11 levels
  for install #8, matching what spend-down bought (old formula over-projected 13); the live
  projection dropped 17 → 14 on the restart. This was gap 1's root cause — the over-projection
  inflated `totalGain`, making `MIN_TOTAL_GAIN` less conservative than it read; it's now honest.
  Also confirmed gap 6 live: installs #7/#8 bought NFG from NiteSec / The Black Hand (highest
  rep), not CyberSec. 584 tests; shipped mid-cycle via `restart daemon.js`.

## 2026-07-16

- **Install trigger revived — it had been structurally dead, and S11's gate is now MET.** Two
  wiring bugs, both variants of one confusion: `evalTrigger`'s grind horizon answered "what do we
  buy next" instead of "how long until the next aug is reachable". (1) The horizon read
  `pickTarget`'s **head**, but Phase 25's own same-day `buyBlocked` fix (`9a6643c`) made NFG a
  permanent candidate — and the head is always NFG, rep-met at deficit 0 — so the horizon was
  always `0/rate = 0` and `phaseArmed` could never be true. `idle-plateau` was unreachable for the
  same reason. **No arm was possible in any cycle**; `ratchet-mode.txt` → `auto` would have been a
  no-op. (2) Routing it through `pickWorkFaction` fixed only the actively-worked case — that skips
  PASSIVE_REP_FACTIONS and falls back to the rep-met head, so a passive-only plateau still could
  not arm. `pickHorizonGrind` now takes the sorted candidates and returns the highest-priority one
  still owed rep: `pickWorkFaction`'s filter minus the passive skip, no head fallback.
  **Live result:** first arm ever via the horizon path (22:32:14Z, horizon 55.47h vs the 8h
  threshold, gain 1.370, 8 augs queued, ~$1.47T idle) and the **first `install-ready` fire ever
  observed** (22:42:14Z, a clean 600s sustain). Kenneth judged the timing **"about right"** —
  which is exactly S11's validation datum, never collected until now. Also: `dashboard.js` now
  shows the work faction alongside the head target (the panel had read "grinding for NFG at
  CyberSec" while the slot ground Sector-12 — Kenneth spotted it, and it is how the dead trigger
  stayed invisible). → `aeeb632`, `b5b654d`, `3feb4b4`; **handoff + all open items:**
  [`phase-25-faction-strategy.closeout.md`](phase-25-faction-strategy.closeout.md).

## 2026-07-15

- **Phase 25 close-out — BN1.2 CLEARED, live-debugged in one continuous session** →
  `docs/phases/phase-25-faction-strategy.spec.md`'s "Close-out (2026-07-15)" section has the
  full record. The aug-ratchet controller shipped 2026-07-14 got its first real live use this
  session and found two genuine bugs same-day: NFG dropped out of targeting entirely once any
  level was owned (repeatable augs need different "owned" handling than discrete ones), and
  separately the one-NFG-per-cycle buy cap was also blocking *grinding* toward it (fixed via a
  `buyBlocked` flag that decouples "can't buy this cycle" from "stop targeting"). Live use also
  drove three amendments beyond the original spec: `scoreAug` gained `SCORE_W_MONEY`/
  `SCORE_W_SPEED` (ENM Analyze Engine/DMA Upgrade were scoring 0 despite real income value);
  `UTILITY_ALLOWLIST` gained CashRoot Starter Kit (speeds up post-install bootstrap) and — the
  big one — **The Red Pill**, reversing three phases' worth of "drops by construction" by
  Kenneth's explicit same-day authorization; a new Daedalus-endgame $ reservation
  (`daedalusInviteReserve`/`daedalusDonationReserve`) protects the $100b invite gate and then
  the live, shrinking donation cost, after cloud-fleet growth was found actively delaying the
  Daedalus rejoin. Kenneth then explicitly asked to "remove all" remaining manual endgame
  gates: auto-donate to Daedalus (`shouldDonateToDaedalus`, extends S6's route to Daedalus,
  previously excluded), and a new `src/backdoorwd.js` that auto-backdoors `w0r1d_d43m0n` once
  it exists and hacking clears its requirement (deliberately its own file, not folded into
  `backdoorfactions.js` — the single most consequential automated action in the project, ends
  the BitNode). The full chain fired unattended and correctly on the first attempt: Red Pill
  auto-bought, Kenneth installed manually (auto-*install* itself deliberately left untested for
  the run-ending install), hacking re-climbed, `backdoorwd.js` backdoored WD — confirmed live
  via a BitVerse-selection-screen screenshot. `npm test` 568/568 green throughout. **Left open,
  carries to the next node/cycle:** auto-install has never fired in any form; the trigger armed
  once but never sustained long enough to fire; `backdoorwd.js` has exactly one live data
  point. `CLAUDE.md`'s current-goal line updated — BN1.2 done, next-node choice (BN5 per the
  existing plan) awaits reconfirmation.

## 2026-07-14 (2)

- **Phase 25 — autonomous aug-ratchet / faction strategy, implementation landed (live validation
  pending)** → `docs/phases/phase-25-faction-strategy.features.md`,
  `docs/phases/phase-25-faction-strategy.spec.md`. Upgrades `src/augfarmer.js` (Phase 23's naive
  cheapest-rep-deficit farmer) into a score-based ratchet controller, and adds `src/installer.js` —
  **the one file now authorized to call `installAugmentations`**, reversing Phase 23's hard "never"
  rail (`docs/reset-protocol.md`'s Core rule rewritten, not just relaxed): the call is isolated to
  `installer.js`, exec'd only from `augfarmer.js`'s auto-mode branch, reachable only when Kenneth
  hand-writes `auto` into `ratchet-mode.txt` — default (file missing/anything else) is **observe
  mode: no install, no spend-down, ever.** Landed this pass: S3's score-based aug targeting
  (`scoreAug` — hacking weight 1, `hacking_exp`/`faction_rep` at a discounted 0.5, replacing D2's
  10-key filter; `UTILITY_ALLOWLIST` trimmed to just NRMI, dropping CashRoot Starter Kit and The
  Blade's Simulacrum since the 30-aug Daedalus gate is already met); S4's proactive multi-join +
  camp commitment (`pickCamp`/`computeCamps` derive the three camps from the live enemy graph's
  ally-relation connected components, not hard-coded city names — regression-locked by a shuffled-
  graph unit test); S5's work-slot allocation around `PASSIVE_REP_FACTIONS`; S6's generalized
  donation route (favor-threshold gated, `Formulas.exe`-guarded, `DONATION_BUFFER`-buffered,
  Daedalus excluded via the endgame hold); S7's install trigger (`evalTrigger` — a projected-mult
  gain floor, a 10-minute sustain window, and an auto-mode latch that only Kenneth's two abort
  levers, the mode file or the pause file, can clear); S8's endgame hold
  (`joined(Daedalus) || hacking>=2500`); S9's `ratchet-decisions.json` append-only audit-trail
  ring; S10's auto-mode spend-down (lifts the one-NFG-per-cycle cap, freezes the full-money
  reserve) + `installer.js` handoff (max home RAM, then cores, then `installAugmentations(
  "bootstrap.js")`). `npm test` 550/550 green including 115 tests in the rewritten
  `test/augfarmer.test.js` and the new `test/verify-ratchet.test.js`; `npm run verify:log` green.
  **Live smoke-test (same session, Claude-driven over CDP, L1–L3 of the spec's procedure):**
  restarted `daemon.js`; `ramcheck.js` measured **augfarmer.js 64.1 GB** and **installer.js
  18.15 GB** (both inside S12's 55–70/12–22 GB bands; `daemon.js` flat at 16.3 GB, confirming no
  leak into the batcher core) — recorded in both files' headers. Within the first poll: two
  proactive joins fired in one pass (Sector-12, The Black Hand), a proactive travel landed, and
  `campChoice` read `{Aevum, Sector-12}` via the reality rule (Aevum already joined this cycle) —
  `campLocksInForce` correctly listed the other camp as blocked. `ratchet-decisions.json` exported
  correctly after a dev-server restart (needed to pick up the new `vite.config.ts` line) with
  well-formed `endgame-hold`/`camp-choice` records carrying the full constants block.
  `augfarmer-state.json` showed a sane `trigger` object (`gainArmed: true, phaseArmed: false` —
  correctly not yet armed, since `RATE_MIN_SAMPLES` hadn't accumulated on a freshly restarted
  farmer) and `workFaction` correctly falling back to the head target per S5 (every grindable
  candidate that pass was in `PASSIVE_REP_FACTIONS`). `dashboard.js`'s AUG FARMER panel rendered
  the new phase/state with zero wrap, confirming the "no dashboard changes needed" design bet.
  **Explicitly not closed by this entry** — S11's phase-close gate still needs a real observe-mode
  `install-ready` fire Kenneth judges, plus one manual install cycle's audit trail verified from
  exported logs (L4–L6 of the live procedure, plus a longer L6 soak). BACKLOG gained an S11
  "Stage-2 first auto-fire" entry (parked on Kenneth writing `auto`) and resolved/narrowed the
  install-order-calculator, augment-breadth-vs-depth, and `upgradeHomeRam`-validation entries this
  phase subsumed.

## 2026-07-14

- **Phase 24 — single condensed dashboard window (`src/dashboard.js`), shipped** →
  `docs/phases/phase-24-dashboard.features.md`, `docs/phases/phase-24-dashboard.spec.md`.
  Phase 18 Layer 3: collapses the seven standing companion tails (`daemon`, `targetsmonitor`,
  `transactionsmonitor`, `cloudmanager`, `resourcemanager`, `xpfarm`, `augfarmer`) into one
  hardcoded-geometry renderer (891×1262, font 16, re-asserted every poll) reading seven on-disk
  state files; every companion goes headless (keeps its print block for manual `tail`).
  `tailmanager.js` + `tail-layout.json` retired in full — nothing left for Phase 18's
  geometry-persistence system to manage with one self-asserting window. New project convention
  landed in `CLAUDE.md`: **"use dashboard or logs"** (dashboard space is brainstorm-gated, never
  ad-hoc). Notable spec-stage/implementation deviations: S6 gave `xpfarm.js` a state-file snapshot
  beyond the features table's "headless only" (parse-per-poll of its ring log was the alternative);
  S13 reversed the Phase 11 precedent and exported `finance-state.json` (its live tail is gone, so
  the panel needed offline evidence); S10's `tailProperties.minimized` fallback was never needed —
  confirmed live that `resizeTail` does not fight the native collapse in this build. `npm test`
  488/488 green including new `test/dashboard.test.js`, `test/targetsmonitor.test.js`,
  `test/verify-dashboard-state.test.js`; `npm run verify:log` green (5 files, 42 checks) against
  real exported state.
  **Live validation (same session):** L1 — restart via CDP, exactly one `dashboard.js` tail at the
  correct geometry; a genuine orphan surfaced and confirmed the bug class the spec anticipated (a
  leftover `daemon`-titled tail from the now-deleted `tailmanager.js`'s last retitling, pre-existing
  the deletion — closed by hand once, structurally impossible going forward since nothing retitles
  anymore). L2 — column budget measured precisely via the ruler (JetBrainsMono 9.6001 px/char at
  font 16, Paper clientWidth 890px) at **92 chars**, not the features doc's provisional ~88;
  `COLUMN_BUDGET` updated and re-verified with zero wrap. L3 — dragged the window via CDP mouse
  events: position persisted across polls (not reasserted, as designed); clicked native
  minimize/restore: stayed collapsed across 2+ polls, confirming the `tailProperties.minimized`
  fallback is unnecessary. L4 — two consecutive `restart daemon.js` calls and a manual
  `kill dashboard.js` (testing the `ns.atExit` self-close directly) both left exactly one window,
  correctly positioned. L5 — killed `cloudmanager.js` and confirmed its panel alone showed
  `STALE 53s` in its title line while all six other panels kept rendering live data; relaunched via
  daemon restart. RAM gate: `dashboard.js` measured 2.6 GB (within the 2–4 GB band) after fixing a
  **new identifier-hygiene finding** — a `state.share` property access (not a variable
  declaration) was misread by this build's RAM analyzer as `ns.share()` (a false +2.4 GB, 5 GB
  measured before the fix); switched to bracket notation (`state["share"]`); daemon.js (16.3 GB)
  and augfarmer.js (52.7 GB) confirmed flat against their documented baselines. `CLAUDE.md`'s
  script-writing rules gained a generalized version of this lesson (property-name collisions, not
  just the previously-known `.exec(` substring case). L3's resize-handle drag was confirmed by
  Kenneth in-game (snaps back to 891×1262). L6 — a 4-check, ~32 min unattended soak (background
  script polling window count/geometry/overflow every ~8 min) confirmed the same PIDs running
  throughout (zero restarts), exactly one window every check, longest rendered line 78-80 chars
  (comfortably under the 92-char budget), and no vertical overflow at any check -- no wrap/scroll
  creep. Every acceptance criterion closed. Merged to `master` and pushed.

## 2026-07-13

- **Phase 23 — auto augmentation farmer (`src/augfarmer.js`), shipped** →
  `docs/phases/phase-23-augfarmer.features.md`, `docs/phases/phase-23-augfarmer.spec.md`.
  Always-on Singularity companion that joins factions within a 13-name D11-authorized
  `FACTION_SCOPE`, grinds rep, and buys the next cheapest-rep-deficit augmentation forever —
  composes with Phase 22's `backdoorfactions.js` (unlock half); install stays 100% Kenneth's
  (`installAugmentations` never called, grep-checked). New `next-aug` reservation rule in
  `resourcemanager.js` (Singularity-free). Notable spec-stage calls: S1 reinterpreted D1's
  "lowest rep requirement" as rep *deficit* (so an already-rep-met aug in a joined faction always
  sorts first); S9 added a pause file (`augfarmer-pause.txt`, beyond the features doc); the
  pre-existing `auto-formulas` verify-transactions gap (BACKLOG) was folded into this phase's ship
  gate rather than fixed separately. Phase 22's grep-for-`joinFaction` rail is retired (replaced by
  the `FACTION_SCOPE`-routed rail, both grep/test-checked) — `docs/reset-protocol.md` updated.
  `npm test` 452/452 green. **Live validation (same session, ~35 min):** RAM measured 52.7 GB
  (S6's 45–60 GB band), `daemon.js` flat at 16.3 GB; catalog-exported camp graph matches the
  features table exactly (camps A/B/C) with Daedalus enemy-free; auto-joined 5 factions total
  (4 on launch + a live mid-run `Tian Di Hui` join once its rep target came up) and 3 augs bought
  unattended (Magnetism Amplifier $250m, Neural Wit Amplifier $19m, Speech Enhancement $45.125m —
  `auto-aug` transactions match each state-file target exactly); a live `travelToCity` fired for a
  city-gap target (`auto-travel`, Chongqing); the ≥30 min soak (L6) passed with zero WARNs/per-poll
  spam; `npm run verify:log` green throughout, including the new
  `auto-aug`/`auto-travel`/`auto-formulas` sources. **`next-aug` reservation, explained rather
  than observed positive:** it never showed a nonzero amount this session — with the batcher
  running ~$10b+/min income, every rep-met target was instantly affordable, so the buy always
  landed in the same pass the reservation would have been written, clearing it (S7 finding 4)
  before `resourcemanager.js`'s next 2s poll could ever see it positive. The mechanism itself
  (`parseAugReserve`, the reserve/buy gating in `planPass`) is fully unit-tested; the "awaiting
  money" state it guards just never arose on this money-rich save, which is D8's rationale working
  as designed, not a gap. Merged to `master` and pushed.

- **Auto-backdoor Tier-2 validation, closed** — `src/backdoorfactions.js` confirmed live on a
  genuinely fresh reset (BN1.2 install): all four backdoor targets (CSEC, avmnite-02h, I.I.I.I,
  run4theh111z) auto-backdoored correctly during the climb from hacking level 1, with zero
  auto-joins (verified no `joinFaction`/`workForFaction` call exists in `src/`). `logs/backdoor-
  status.json` shows `allDone: true` at hacking 537. Tier 1 (mid-run backdooring) had already
  shipped; this closes the deferred fresh-node case.
- **Phase 20 — XP-farm engine, close-out** → `phase-20-xpfarm.features.md`,
  `phase-20-xpfarm.spec.md`. Dedicated hack-saturation XP engine (`src/xpfarm.js`,
  `src/xphack.js`, `src/xpweaken.js`) that fills the fleet's surplus RAM — whatever the money
  batcher and share pool leave unclaimed — with fire-and-forget hack workers against the
  highest-difficulty eligible servers, self-scaling from ~0 on a busy young fleet to
  near-total on an idle endgame one. Two amendments landed after the initial ship attempt
  surfaced live bugs: **S8** (sized, cooldown-gated crush volleys, replacing an unbounded
  single-pass burst that locked the fleet up on restart) and **S9** (demand-driven packing —
  volleys → wave-sized held weaken streams → capped 2,500-thread hack waves → an overflow
  absorber on the highest-reqLevel target — replacing whole-host round-robin, which let
  per-target hack waves grow unbounded and pinned high-req targets at security 100
  indefinitely, and a RAM-fraction weaken split that over-delivered security reduction
  ~4.6×). `npm test` 390/390 green; RAM gate flat 5.85GB (byte-verified, no new ns surface).
  **Live-confirmed over a multi-hour unattended run:** zero hack-wave-cap violations across
  1,104+ target-records; D2's weaken/hack ratio measured at 0.0503 (target ~0.05, was 0.185
  pre-fix); all held targets converged to tight sawtooths around their own min security;
  money-independence of hack exp confirmed analytically via `Formulas.exe`. **Ship gate
  (S7, ON/OFF A/B, `xp-off.txt` toggle, ≥30 min/window): engine-on 260,523 exp/sec vs
  engine-off 50,620 exp/sec — 5.15× (pass, ≥3× required).** `src/xpprobe.js` (brainstorm
  probe) removed, its findings folded into the features doc.

## 2026-07-12

- **Auto-buy Formulas.exe (`src/procureformulas.js`) — fulfill the standing reservation SF4
  unblocked.** `resourcemanager.js` has reserved $5b for Formulas.exe since Phase 11 but nothing
  ever bought it (kept hand-buy-only under the then-live "zero Singularity" constraint), leaving
  $5b earmarked-but-idle every run. With SF4 now granted, a new resident Singularity companion
  (the `backdoorfactions.js` model, `launchDetached` from `daemon.js` startup) buys Formulas once
  hacking clears the same `>400` gate `resourcemanager.js` uses for the reservation and it's
  affordable above the bootstrap holdback, then exits; `daemon.js` already re-checks the file each
  cycle and flips legacy→formulas math live, no restart. Resident (not self-terminating like
  `procureprograms.js`) because `>400` is reached long after the openers are bought, so a one-shot
  would exit before eligibility. Vetoable via the existing `finance-disable-formulas.txt` flag.
  Pure `planFormulasPurchase` decision (13 unit tests); fail-safes mirror `procureprograms.js`
  (stale finance state → buy nothing; `purchaseProgram` throw → print once + exit). Note: programs
  don't persist across installs, so this re-pays $5b per install — accepted as an explicit choice
  (option 1 of the three-way fork), the `>400` gate keeping it from firing during the fragile
  post-install ramp.
- **Post-install study kick (`src/studybootstrap.js`) — convert post-install dead time to
  hacking XP.** After an augment install the character idles at hacking ~1 with a wiped fleet
  and no port openers, so the batcher/`xpfarm.js` produce ~no XP and the level can sit at 1 for
  hours (observed live). New one-shot Singularity companion (the `procureprograms.js` isolation
  model, `launchDetached` from `daemon.js` startup): if `hack < 10`, start Rothman University
  Computer Science unfocused (`focus:false`), then exit — no stop/handoff (explicitly scoped out
  as future work). Trigger is `< 10` not `== 1` so a stray bootloop weaken bumping you to 2-3
  can't make it miss the post-install window. Guards: SF4 active (`getResetInfo().ownedSF`) +
  try/catch backstop for the Singularity throw, and in-Sector-12 (no `travelToCity` spend — you
  land there post-install; Rothman is local). Validated: `npm test` (346 pass), live standalone
  run + live daemon-startup auto-launch both clean-skip at hacking 545; the actual study trigger
  (`hack < 10`) is inherently live-only, deferred to next install.
- **Phase 22 — auto-backdoor the four hacking-faction servers, live-validated end-to-end.**
  New self-terminating Singularity fulfiller (`src/backdoorfactions.js`, the
  `procureprograms.js` model): roots + walks + `installBackdoor()`s CSEC/`avmnite-02h`/
  `I.I.I.I`/`run4theh111z` as hacking level allows, never calls anything that joins a
  faction (hard rail enforced by grep in acceptance — the join-verb string appears nowhere
  in `src/`). Spec-stage addition beyond the features file: a `backdoor-status.json`
  overwrite-in-place snapshot (`vite.config.ts` filter added), since CLAUDE.md's
  log-over-paste convention needs *some* export and the features file's events-log
  infrastructure stayed deliberately deleted. `common.js`'s `findPath` gained a `start`
  parameter (default `"home"`, byte-identical for the existing `connect.js` call site) so
  the walk can path from wherever the terminal currently sits, not just from home.
  **Live validation ran Tier 1 for real, not just mocked** (hacking level had already
  climbed to 371 by the live pass): CSEC, `avmnite-02h`, and `I.I.I.I` all backdoored
  automatically within the run, each surfacing its faction invite with zero auto-joins
  (all three "Decide later"'d); `run4theh111z` (542) still pending. RAM measured **11 GB**
  at SF4.3's 1× multiplier (spec's derived ~9–13 GB band), `daemon.js` flat at 16.3 GB.
  Tier 2 (fresh-node reset → climb → invite from scratch) stays deferred to the next
  install/reset (tracked in BACKLOG). **Unrelated finding surfaced, not fixed here:**
  `npm run verify:log`'s event-type checker doesn't recognize the pre-existing `rooted`
  event type (`hosts.js`) — confirmed pre-existing on `master` via `git stash`, logged as
  its own BACKLOG bug rather than folded into this phase's diff.
  `phase-22-autobackdoor.features.md` / `.spec.md`.

- **procureprograms.js — TOR/port-opener auto-buy validated live (backlog close-out, no code change).**
  With SF4 now permanent (Phase 21), the Singularity buy path that had only ever exercised its
  "SF4 missing → exit cleanly" branch was finally watched end-to-end. Triggered by an aug install
  (a 1-level NeuroFlux, chosen as the cheap validation vehicle Kenneth accepted the re-climb for),
  which wipes all six programs → watched the re-buy during re-bootstrap. **Confirmed live this
  cycle:** launches past the SF4 guard with no runtime-error popup; sees 0 owned; respects the
  $110k bootstrap holdback ("waiting for cash"); buys **TOR first** (`auto-tor` $200k @ 09:55:27 —
  first-ever logged capture of that call); walks openers **cheapest-first** (BruteSSH $500k →
  FTPCrack $1.5m); reservations release in `finance-log.json` as each is bought. **Self-termination
  taken on evidence, not re-observed this cycle** — today's log already held a full completed-and-
  exited cycle (4 openers bought earlier, tail closed at session start = the summary→`closeTail`→exit
  after-state), and the exit is 3 trivially-correct lines; forcing it via a `.txt` flag was rejected
  as a permanent test-hook in a hot script for near-zero risk (decision: close on evidence). The
  ladder itself parked at 6/9 mid-validation — **not a bug**: income plateaued below relaySMTP's $5m
  reservation (`available = money − reserved = 0`), the reservation model correctly protecting the
  opener cash from cloudmanager. Closes the *"Re-validate procureprograms TOR/opener ladder live"*
  backlog item and moots the *"Lightweight Source-File watcher"* item (SF4 permanent + daemon
  launches it at startup → no wait-for-SF scenario). **Open follow-ups surfaced, not closed:**
  `upgradeHomeRam` Singularity call still unvalidated (home RAM was UI-bought, no `home-ram-upgrade`
  log); the fleet ran ~90% idle on ~1TB persisted home RAM (income plateau) — feeds Phase 20 and the
  finance-manager brainstorm; and the reservation model demonstrably coordinates cloud-vs-program
  spends but protects only the *immediate-next* opener — the exact priority seam a future aug
  purchaser would expose.

- **Phase 21 — Grant SF4.3 via save edit** → `phase-21-sf4-grant.features.md`,
  `phase-21-sf4-grant.spec.md`. Deliberate save-file cheat: own Source-File 4 level 3 (1×
  Singularity RAM) without playing BN4, unlocking `ns.singularity.*` inside the ongoing BN1.2
  run. Core edit is exactly one substring insertion (`sourceFiles.data` `[[1,1]]` →
  `[[1,1],[4,3]]`, +6 bytes), derived via `JSON.stringify` so the escaping always matches the
  save's own format rather than hand-typed backslashes. `tools/save/savelib.mjs` is the pure
  transform with four hard-fail guards (needle-count, byte-delta, parse-integrity, a structured
  diff that only permits `sourceFiles.data` to change); `tools/save/sf4grant.mjs` is the CLI
  (`grant`/`describe`); `src/sf4check.js` is the one-shot Singularity liveness probe, isolated
  from `daemon.js` per the RAM-isolation rule. `npm test` 330/330 (9 new in
  `test/savegrant.test.js`, hermetic against an in-code fixture) — the same guard/diff code
  path is re-run against the real save at apply time, so the fixture tests and the live
  transform share identical logic. **Spec-stage S1 override (Kenneth signed off):** the
  features doc's plan to hand-write `SF4.1`/`4.2`/`4.3` achievement records turned out
  unimplementable — only one SF achievement exists per BitNode (`SF4.1`), and the game
  self-grants it once the map holds `[4,3]`, confirmed live (achievements page showed `SF4.1`
  acquired at 8:21:46 AM, between the import and the first liveness check) — so the edit
  stayed exactly the one insertion, nothing achievement-related to write.
  `saves/` consolidated with a committed `INDEX.md` (two repo-root `.gz` moved in, extraction
  dirs + scratch `.pretty.json` deleted, `.gitignore` re-anchored to `/bitburnerSave_*.json.gz`
  so `saves/*.json.gz` is trackable while the bulky decompressed/pretty forms stay ignored).
  **Live sitting (L1–L7) run same day, all passed:** fresh Backup Save indexed + committed as
  `pre-edit-backup` before the transform touched anything; `grant` on the real save reported
  `ALL GUARDS PASSED`, +6 bytes, summary differing only in `sfLevels`; Import Save accepted the
  `.gz` cleanly (no fallback ladder needed); `sf4check.js`'s exported log showed
  `ownedSF: [[1,1],[4,3]]` and a non-throwing `singularityProbe: 4`; `ramcheck.js` measured
  **7.65 GB**, landing exactly on the 1× derivation (1.6 base + 1.0 `getResetInfo` + 0.05
  `getHackingLevel` + 5 GB singularity call), nowhere near the 4×/16× bands; a second Backup
  Save (`post-import-reexport`) confirmed `[4,3]` survives a real load/save cycle — S8's
  rollback contingency never triggered. **Same-sitting addendum (not originally spec'd):** a
  narrative toast popup blocked every CDP `goto`/`terminal` click mid-sitting; added
  `dismissStoryPopup` to `tools/bb/driver.mjs` (fires only when the entire accessible tree is
  one nameless button + narrative text — can't misfire onto a real confirm/buy/install dialog,
  which always exposes multiple/named controls) and pre-authorized it in `CLAUDE.md` so future
  story popups no longer need Kenneth to clear by hand. **Supersedes the SF4-gated backlog**
  (auto-backdoor, aug-planner execution, TOR ladder, rep watchers) — each becomes its own later
  phase, none folded into this one.

## 2026-07-08

- **Phase 18 — readable, self-placing dashboard windows** →
  `phase-18-dashboards.features.md`, `phase-18-dashboards.spec.md`. Fixed the five in-game
  tail windows' line-wrap (too narrow), header scrolling out of view (content taller than
  window), and manual re-dragging/resizing every aug install (nothing set geometry). New
  headless `src/tailmanager.js` companion centrally restores each window's saved
  position/size/font on launch and persists Kenneth's tweaks to `tail-layout.json` (one
  0.3GB `getRunningScript` cost total, not one per window; every `ns.ui.*` call used is
  0GB). Pure `reconcileTick` decision core with an explicit RESTORING/TRACKING mode per
  window (a spec-reviewer blocker caught the original 3-arg signature omitting that state,
  which would have snapped windows back against the user's own drag — fixed before
  implementation). Content pass across `daemon.js`/`targetsmonitor.js`/
  `transactionsmonitor.js`/`cloudmanager.js`/`resourcemanager.js` applying "status in
  popups, lists in logs": daemon's member+draining list capped at 12 (+N more); redundant
  log-duplicated lines (skip/shrunk counters, last-launch, prep-dispatch detail, saturated-
  skip INFO) dropped from the tail; targets shows top 5 + a pointer to the full-ranking
  export; transactions collapses to totals + last 3 with a filename footer; cloud/resource
  manager lines tightened. `logEvent` calls and the daemon-batch-log schema untouched;
  `transactionsmonitor.js`'s income-writer block untouched. Two same-session addendums
  (folded in during live validation, not originally spec'd): `killscripts.js` now closes
  each process's tail window in the same loop that kills it (`ns.kill()` doesn't auto-close
  a tail), and `procureprograms.js` closes its own tail at each of its four self-terminating
  exit points (a script finishing on its own doesn't auto-close it either) — both were
  leaving frozen orphan windows on every daemon restart / natural exit. `npm test` 317/317
  (24 new). **Live-confirmed same day**: RAM gate — `daemon.js`/`targetsmonitor.js`/
  `resourcemanager.js` flat against their recorded baselines (16.30/12.70/3.35 GB),
  `tailmanager.js` landed exactly on its predicted ~1.9GB, `cloudmanager.js`/
  `transactionsmonitor.js` flat (no recorded prior baseline, but pure string/format edits
  can't move reachability-based RAM); all five windows self-placed into the right-edge
  column on first run; two manually-dragged windows (`cloudmanager.js`/`resourcemanager.js`)
  persisted through a daemon restart and returned to their exact tweaked geometry; orphaned
  windows confirmed gone after the `killscripts.js` fix; `procureprograms.js` observed
  closing its own window on a natural exit; `npm run verify:log` 36/36 green against a fresh
  post-restart export. Layer 3 (single condensed window) deferred — filed in BACKLOG Ideas.

- **Phase 17 — home-core-aware grow/weaken sizing: investigated, measured, SHELVED** →
  `phase-17-home-cores.features.md`. `sampling.js` sizes all grow/weaken thread math at an
  implicit 1 core (both legacy and formulas branches), but `home` is a real worker host with
  >1 core. A throwaway in-game probe (`src/coreprobe.js`, since removed; evidence
  `logs/coreprobe-1783550870612.json`) answered both gating questions: **(Q1)** grow's
  per-thread security increase is **core-independent** (flat at 4 across cores 1–16), so the
  original "correctness drift bug" claim was **wrong** — cores=1 sizing is a safe overshoot,
  making this pure efficiency; **(Q2)** home was 19.4% of allocatable RAM at probe time
  (surprise — but only because the fleet was in a small post-reset state; the share decays as
  purchased servers are rebought). Measured core factor: 5.9%/thread saved at home's current 2
  cores (`1+(cores-1)/16`), so ~1% of fleet RAM reclaimed today, rising to ~5–8% only at 8–16
  cores — which needs Singularity-gated `upgradeHomeCores()` not yet automatable. Verdict
  (Kenneth): not worth reordering the batcher hot path (sizing runs before host assignment) for
  a ~1% transient gain; **revisit when home cores get upgraded**. No code shipped; probe + its
  `vite.config.ts` download filter removed. Co-scope with Phase 8's deferred core-weighted
  *share* placement if either is revived.

## 2026-07-07

- **Phase 16 — Fable audit cleanup (F2–F8)** → `phase-16-audit-cleanup.features.md`,
  `phase-16-audit-cleanup.spec.md`. Closed the remaining findings from the 2026-07-06
  full-repo audit (F1 shipped with Phase 15). Dedup: new `src/financestate.js` kills the
  triplicated finance-state client code (`readFinanceState`/`isStateStale`/the filename
  constant) across `resourcemanager.js`/`cloudmanager.js`/`procureprograms.js` and removes
  the `procureprograms.js → cloudmanager.js` import; the four stray `tprintTs` copies
  (`resourcemanager.js`/`cloudmanager.js`/`procureprograms.js`/`bootstrap.js`) now import the
  Phase 13 shared one from `common.js`, whose header was also corrected — it had been
  asserting the bundle-charging model Phase 9/13 already disproved; `totalAllocatableRam`
  moved from `daemon.js`/`sharecurve.js`'s byte-identical copies into `hosts.js`. Fixes:
  `daemon.js`'s `trimLog` had an off-by-one that left the ring buffer at `MAX + 1` entries
  while a `mode` event was pinned (widened the drop slice by one); `transactionsmonitor.js`'s
  running "today's hacking income" now resets at the day-rotation boundary via a new pure
  `dayRolledOver` helper; the daemon's ambiguous "budget" status label (colliding with the
  share line's distinct "batch budget") relabeled to "fleet". Backfilled tests for three
  previously-untested pure helpers (`standardSizes`, `nextIndex`, `nextInstanceNumber`).
  Behavior-preserving housekeeping — no batching/scheduling/finance math changes. `npm test`
  293/293 (18 files, 6 new). **Live-confirmed same day**: RAM gate exactly flat on all 8
  touched scripts (`daemon.js`/`sharecurve.js`/`hosts.js`/`bootstrap.js`/`cloudmanager.js`/
  `procureprograms.js`/`resourcemanager.js`/`transactionsmonitor.js`, before/after against a
  freshly captured `master` baseline, byte-verified against `dist/src/*`) — byte counts
  shifted in both directions as expected from the extractions, but reachability-based RAM
  cost held flat everywhere, confirming the `common.js` header fix. `npm run verify:log`
  36/36 green against a fresh post-restart export (14 members, 0 skips, no stall); the tail
  window showed `fleet 1.58PB` and `batch budget 1.18PB` as the intended two distinct labels.

## 2026-07-06

- **Phase 15 — small-fleet batching floor** → `phase-15-small-fleet.features.md`,
  `phase-15-small-fleet.spec.md`. Fixed the zero-member income stall live-confirmed the same
  day (see Phase 13's entry below): `pickBatchSet` only ever admitted a target whose *full*
  pipeline fit the batch budget, and on the post-reset 940GB fleet no target's full pipeline
  fit (cheapest ~721GB vs. a 705GB budget), so every admission pass seated nobody, forever —
  the daemon had launched zero workers and earned $0 since the Jul 5 handoff. Fix: a new
  `cappedPipelineDepth` (`scheduler.js`) caps admission depth by affordability instead of
  the raw throughput ceiling, and `pickBatchSet` gained a floor pass (incumbent-sticky under
  the existing hysteresis) guaranteeing at least one seat whenever candidates exist — the
  existing per-tick shrink loop does the actual fitting from there. `daemon.js` snapshots
  gained `candidateCount` + a per-member `floor` flag; a stall WARN and `FLOOR` tail tag make
  the (now-unreachable) old failure mode loud instead of silent. `verify-log-checks.js`'s
  `checkBudgetInvariant` was reconciled with a legitimate floor-seated over-budget member
  (own consistency checks added), plus a new `checkNoStall` rule hard-failing this exact bug
  signature (`candidateCount > 0 && memberCount === 0`). `npm test` 268/268 (250 + 18 new).
  **Live-confirmed same day**: RAM gate exactly flat (`daemon.js`/`targets.js`/
  `targetsmonitor.js`/`bootstrap.js` all matched the 2026-07-06 baseline, byte-verified fresh
  against `dist/src/*`); daemon restart immediately seated `phantasy` (`candidateCount: 12`,
  `memberCount: 1` across every snapshot) and launched a batch within the first tick;
  `npm run verify:log` 36/36 green against the fresh export, including the new stall and
  amended budget rules. Filed two follow-up Ideas (BACKLOG): the `sharePower: 1.00`-with-
  live-threads oddity, and auto-suppressing share on small fleets.

- **`git worktree` investigation — closed out.** Adopted: `bitburner-scripts2` (this repo,
  branch `worktree-docs`) runs as a second worktree for docs/BACKLOG/brainstorming work,
  isolated from the live `bitburner-scripts` checkout's working directory and index. Documented
  in `CLAUDE.md` — `bitburner-scripts2` has no dev server of its own and must never start/stop
  `npm run dev`; only the `bitburner-scripts` session may do that, since it's the one actually
  connected to the live game. Resolves the original worry (parallel Claude Code sessions
  colliding over shared `git status`/index state) without a full second clone.

- **Phase 13 — consistency consolidation, closed out** → `phase-13-consolidation.features.md`,
  `phase-13-consolidation.spec.md`, `phase-13-consolidation.closeout.md` (implemented
  2026-07-05, merged to `master` as a deliberate exception pending live validation; live
  validation completed 2026-07-06). New `src/common.js` (`scanNetwork`, `findPath`,
  `tprintTs`, `workerRamCosts`); `hosts.js`'s `getHosts` split into `tryRoot`/`listHosts`;
  `launchmonitor.js` switched to the non-rooting `listHosts` (real correctness fix — it was
  racing the daemon's rooting from inside a monitor); `sharecurve.js` picked up a real
  double-count fix in its capacity report along the way. `npm test` 250/250.
  **Most reusable lesson of the phase:** the RAM gate initially measured a spurious +0.25GB
  on `launchmonitor.js`/`sharecurve.js` that looked like an analyzer limitation (can't
  call-graph-prune closures-as-data) — two code-shape fix commits produced bit-identical
  readings across three runs, which briefly looked like confirmation. Forensic replay of
  `dist/src/*` (viteburner's byte-faithful dump of what it last actually pushed) found the
  real cause: a `git checkout` for the merge, done in this checkout while the dev-server
  watcher was live, pushed stale pre-refactor files into the game at 20:46:02 — all three
  "identical" after-runs had measured the *same stale file*, not three different code
  shapes. A verified re-run (`ramcheck.js` extended to also record each script's in-game
  source length, byte-checked against the `dist/` dump before trusting any reading) hit the
  originally-predicted numbers exactly: `launchmonitor.js` 3.20 (−0.65), `sharecurve.js` 5.70
  (+0.05), both tripwires (`daemon.js`/`bootstrap.js`) flat. New standing rule (`CLAUDE.md`):
  never `git checkout`/switch branches in a dev-server-watched checkout while the game is
  connected unless the push is intended — stop the dev server first. Live daemon session
  (~35 min) confirmed clean; separately surfaced (not a Phase-13 regression — confirmed
  pre-existing, `targets.js`'s diff across the merge is a verbatim move) a live batcher bug:
  `daemon.js` has run with zero batch members / zero hacking income since 2026-07-05, share
  pool only — filed as its own BACKLOG item for investigation.

## 2026-07-05

- **Docs reorganization — archive phases, trim BACKLOG, add metareference** (branch
  `docs/trim-backlog-naming`). Moved the 16 shipped phase docs into `docs/phases/` under a new
  `phase-NN-slug.<stage>.md` convention (history preserved via rename), trimming BACKLOG
  944→~420 lines by relocating completed history to this changelog. Added `docs/metareference/`
  (tracked AI-workflow reference PDFs) + a thin `docs/phases/README.md`; set the docs-layout and
  phase-naming conventions in `CLAUDE.md`; added `.gitattributes` (binary-safe PDFs); started
  tracking shared `.claude/` config; deleted/ignored root clutter.

- **Claude Code — spec-review loop automated** (started 2026-07-04). Documented the
  brainstorm→spec→implement workflow in `CLAUDE.md` and moved the four standing rules
  (Singularity RAM, transaction logging, tests+log validation, spoiler carve-out) out of the
  per-run fable prompt into `CLAUDE.md`. Built the **`spec-reviewer`** subagent
  (`.claude/agents/spec-reviewer.md` — read-only, `model: opus`, four-category rubric +
  APPROVE/`BLOCKING ISSUES:` verdict) and the **`/spec`** command (`.claude/commands/spec.md`,
  `disable-model-invocation`, seven-step loop: resolve → read → clarify-gate → draft → cold
  review → revise one round → present, stop before implementation). Chose one review round over
  multi-round convergence (no natural stopping point). First live run (Phase 14) caught 3 real
  blocking issues. Optional Step 8 (opus writes the features doc itself) still open — see BACKLOG.

- **Workflow — update BACKLOG in the same commit as the work.** After repeated "do work →
  commit → separately update BACKLOG → commit again" cycles, added a `CLAUDE.md` *Tracking
  work* rule to stage the BACKLOG edit in the same commit. Folded the redundant
  `backlog_bookkeeping` auto-memory.

- **Docs/memory cleanup — strip git rules to version-control basics** (branch
  `docs/slim-git-rules`, `c74548a`). Slimmed `CLAUDE.md`'s `## Git` to branch/commit/merge +
  the background-job safety rail; deleted three pure-git-mechanics memories (10→7).

- **Docs/memory cleanup — CLAUDE.md dedupe + memory consolidation** (branch
  `docs/claudemd-dedupe`, `ef72433`). Folded the duplicate "verify against the log files"
  clause; consolidated auto-memory 13→10 files.

- **Phase 14 — cold-start bootstrap (8GB home → daemon.js handoff)** →
  `phase-14-bootstrap.features.md`, `phase-14-bootstrap.spec.md`. New `bootstrap.js` deployer +
  `bootloop.js` worker to rebootstrap the fleet after the hard reset took `daemon.js` (16.3GB)
  offline; auto-hands off to `daemon.js` at the 32GB home tier. First real `/spec` run (3
  blockers fixed at review). `npm test` 231/231; RAM gate closed (`bootstrap.js` 6.20GB after a
  live `ns.ps` fix); all 6 live steps observed. Merged to `master`.

- **Phase 12 — targeting root-access eligibility fix (+ ratio→priority fold-in)** →
  `phase-12-targeting.features.md`, `phase-12-targeting.spec.md` (branch `phase12-targeting`).
  Unplanned hotfix for a live `weaken/grow … no root access` error flood: new pure
  `isEligibleTarget` predicate adds a rooted check in `src/targets.js`. Also swapped the
  misleading `ratio` display for `priority`. `npm test` 190/190; RAM gate closed; live-clean.

- **Phase 11 — resource manager: active procurement** → `phase-11-resource-manager.features.md`,
  `phase-11-resource-manager.spec.md` (branch `worktree-phase11-procurement`). Three renames +
  behavior evolution: `financemanager→resourcemanager`, `cloudupgrader→cloudmanager` (adds
  bootstrap/growth buys), `purchasescripts→procureprograms` (self-terminating TOR + port-opener
  loop). `npm test` 184/184. Found a real bug: `purchaseTor()` throws without Singularity SF —
  guarded with an `ownedSF` check + try/catch. TOR/port-opener ladder unverifiable until the SF
  is owned (follow-up filed).

- **Phase 10 — finance manager + cloud server auto-upgrader** → `phase-10-finance-cloud.md`
  (branch `worktree-phase10-finance`, `5e5f74d`). Two daemon companions: `financemanager.js`
  (reservation-based available-cash service) and `cloudupgrader.js` (its first customer,
  upgrade-only). `npm test` 162/162; RAM gate closed; validated live across a reset. Spun off
  `renamecloudservers.js`; bumped `FORMULAS_HACKING_LEVEL_THRESHOLD` 300→400; added a
  `finance-disable-formulas.txt` kill switch.

## 2026-07-04

- **Phase 9 — Phase 8 close-out** → `phase-09-batcher-refactor.md` (branch
  `worktree-phase9-closeout`, PR #3). Fixed `pickBatchSet`'s pass-3/pass-4 both-lists bug
  (`justEvicted` set). Confirmed the Phase 8 RAM anomaly via the `share→sharePool` rename —
  recovered the full 2.4GB phantom charge (`daemon.js` 18.7→16.3GB), proving import RAM-charging
  is reachability-based, not whole-bundle. Added `hackingLevel` to snapshots. `npm test`
  128/128. Live A/B/A' share session: rep boost confirmed (~45%), income cost still not cleanly
  quotable (A vs A' disagree +36.7% from level-driven scaling). Keep `SHARE_FRACTION` at 25%.

- **Remote API auto-reconnect enabled.** In-game Remote API set to auto-reconnect (5s retry,
  infinite) so a `npm run dev` restart no longer needs a manual in-game reconnect.

- **Phase 8 — faction share allocation** → `phase-08-batcher-refactor.md` (branch
  `worktree-phase8-share`, draft PR #1). Hard-carves `SHARE_FRACTION = 0.25` of allocatable RAM
  for `share.js`, topped up smallest-free-first; added `sharecurve.js` tuning script. `npm test`
  120/120. Live A/B/A': share ~45% rep boost (matches sharePower 1.417); income inconclusive.
  RAM gate: `share.js` 4.00GB exact; `daemon.js` +2.6GB anomaly waived (resolved in Phase 9).

- **Phase 7 — multi-target batching with natural exit** → `phase-07-batcher-refactor.md`.
  Replaced the single hysteresis incumbent with a RAM-bounded, score-greedy member set
  (`pickBatchSet`, `inFlightByTarget`, daemon rewrite; zero `ns.kill`). `npm test` 88/88. Live:
  up to 10 concurrent targets (was 1), utilization avg 20.3% (was ~6.3%), 7 clean natural exits.
  Pushed to `origin/master`.

- **Phase 5 — daily transactions log** → `phase-05-batcher-refactor.md`. Retired `moneymonitor.js`
  for `src/translog.js` + `transactionsmonitor.js`; instrumented all four purchase call sites.
  `npm test` 78/78; `verify:log` now runs transactions checks too. `fleetupgrade.js` now checks
  the upgrade return value (silent-failure fix). RAM gate closed. Pushed to `origin/master`.

- **Phase 4 — Formulas.exe math with legacy fallback** → `phase-04-batcher-refactor.md`. Churn
  fix (0 flips/16min formulas vs 9 legacy) and reserve-ballooning fix confirmed same-session.
  Waived: fleetupgrade-while-running live test (cash constraint).

## Earlier

- **Phases 1–3 — batcher refactor** → `phase-01-batcher-refactor.md` … `phase-03-batcher-refactor.md`:
  pipeline reservation waterfall, efficiency-score ranking, shrink gating.
