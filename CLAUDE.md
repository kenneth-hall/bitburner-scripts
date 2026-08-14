# Purpose

Learning exercise, not a normal project: help the user **learn Claude Code** —
prompting, workflow, effective use — with **Bitburner** as the sandbox. Implement
what's asked (not hints-only). **Proactively coach** on Claude Code usage/prompting
as an ongoing relationship. Don't cheat by reading/adapting other players' Bitburner
solutions — work from game mechanics and the API.

## Working with Kenneth (read at session start)
Act as a collaborator who pushes back, not a service that complies. These fire on triggers, not
on request — hold to them even when the moment is uncomfortable.
- **Current goal (keep this line current):** **IN BN6.1 as of 2026-07-29** — entered straight off
  the BN5.1 clear. **🔵 WIN PATH FLIPPED BACK TO BLADEBURNER-PRIMARY 2026-08-02, on Kenneth's call,
  with measured support.** Bladeburner is now **the win condition**; the batcher is **its economy,
  not a second win path**. This is the third position on this question — the trail is
  `docs/bn6-playbook.md` §1; read it before reopening, and note the two prior flips were each driven
  by new evidence, as is this one.
  - **The evidence that justifies it (measured 2026-08-02, not argued).** BN6's multiplier table
    penalises hacking **four ways** (`HackExpGain` 0.25 · `HackingLevelMultiplier` 0.35 ·
    `ServerMaxMoney` 0.20 · `CloudServerSoftcap` 2.0) and Bladeburner **zero ways**
    (`BladeburnerRank` 1.0 · `BladeburnerSkillCost` 1.0 · **no combat-exp penalty at all**). Live
    proof in one window: **26h after install #37, hacking climbed 1 → 167 while combat climbed
    1 → 171/171/202/195** — and the combat climb came free, purely from Bladeburner actions. 🔴
    **Corrected same day:** an earlier draft set that 167 against "BN5 reached 4,867 post-install,"
    which is **not apples-to-apples** (4,867 was a *late*-BN5 install at M=6.43 with a mature fleet,
    vs BN6's *first* install at M=1.59). The clean comparison is the table: **BN6
    `HackingLevelMultiplier` 0.35 vs BN5's 1.00**, gate 6,000 vs 4,500 → BN6 needs ~**5× the mult BN5
    cleared at**. ⚠️ **But BN6's ratchet economics are BETTER than BN5's** (no aug-cost penalty), so
    **the batcher path is slower, not foreclosed** ~~— estimate 10–20 days.~~ (that estimate is
    retracted, see the next bullet).
  - **🔴 RETRACTED 2026-08-06 — "the batcher is probably the faster bet" is FALSE, by measurement.**
    ~~On raw time-to-clear the batcher is probably the faster bet (10–20 days vs a Bladeburner path
    measured at ~570 days for contracts alone, needing a 40–70× undemonstrated improvement).~~
    ~~**Never restate this as "Bladeburner is faster."**~~ Both halves rested on numbers nobody had
    re-measured. Measured 2026-08-06 (`docs/bn6-go-no-go.md`): **Bladeburner ~9–25 days** vs
    **batcher ~240–323 days** to the M≈28–37 gate. The batcher figure is per-install
    `deltaMultHacking` normalised by elapsed wall time — **~0.0045 M/hour, flat** across installs
    #37–43 — against `mHacking` **2.10 → 28–37 needed**; the retracted "10–20 days" had **no
    derivation anywhere in the repo**. Bladeburner is now **faster *and* banks the engine**, so the
    engine-value argument for the flip still stands — it is simply no longer a sacrifice. That
    argument, unchanged: BN7 is next and the hacking-walled back half (BN9/10/13/14) needs an
    alt-destroy engine; clearing BN6 by hacking banks nothing new. ⚠️ This is the **fourth** position
    on this question and reopens under the "new evidence" clause; trail in `docs/bn6-playbook.md` §1.
    ~~Hard tripwire: if
    the Stage B operation crossover isn't reached within **~2 weeks**, revert to batcher-primary.~~
    **✅ TRIPWIRE RETIRED 2026-08-05 — do NOT revert to batcher.** C2 fired 2026-08-03 (crossover
    reached, so it never triggered), and the premise behind it is now dead anyway: it assumed Stage A
    was a ~570-day path, but **Stage A alone measures in days, not months** (~32–38 at the time;
    re-measured **~9–25 on 2026-08-06** — quote the stamped snapshot below, not either of these).
    ~~Stage B is separately closed permanently (Raid destroys cities irreversibly…).~~ 🔴 **That
    Stage B closure is RETRACTED** — see the Stage B bullet below; it was never measured. Full
    record: `docs/bn6-playbook.md` §1.1.
  - **✅ DISSOLVED 2026-08-05 — the install↔rep deadlock is no longer a constraint, and no "rep
    window / install freeze" is needed.** It only ever bit because the 12.5k–62.5k-rep aug tier was
    the prize; that tier measured **inert** (every Bladeburner aug multiplies success chance, stamina
    or analysis — and we run at **100% success / 99.9% duty**, so all of it buys nothing). With the
    tier worthless, faction rep resetting on every install costs **nothing**. Phase 39's **S4a
    decision — "no aug chase, no install freeze" — stands, and this is now its durable reason.**
    ⚠️ **Do not reopen it on rep-rate grounds:** the rate did improve ~11× (0.086 → ~0.95 rep/s), that
    was checked, and rep was simply never the binding variable. Full record: `bn6-playbook.md` §1.1 +
    `bladeburner-reference.md` §7.
  - **Second structural constraint: there is ONE player-action slot.** Bladeburner actions block
    gym/crime/faction work. `The Blade's Simulacrum` removes exactly this (rep req 1.25k — we
    already qualify; price **$1.029t**). So "fund combat stats at the gym" is never free — it costs
    rank time. Mitigated by the finding above: **Bladeburner actions regenerate their own combat-stat
    prerequisite**, so the post-install combat grind is not a recurring tax.
  - **Batcher's new job: funding engine only** (decided 2026-08-02). The WD-gate hacking climb is
    **dropped as a goal** — optimise for $/s to pay for Bladeburner augs and fleet. Do not re-derive
    the M≈28–37 / 35-aug Daedalus plan as if it were still the target.
  - **✅ Phase 38 CLOSED 2026-08-02 — shipped, but superseded before it delivered its verdict.** All
    four work items shipped; the deliverable was a *decision* and **neither checkpoint ever fired**.
    Docs graduated to `docs/phases/`, CHANGELOG entry written, all open items carried forward
    explicitly — full done-vs-left record in that spec's **Close-out** section. 🔑 **Its durable
    lesson, worth more than the phase:** *an engine that measures itself must be validated against an
    independent source before its numbers are trusted.* Every defect was invisible in
    `bladeburner-state.json` and obvious in the in-game panel. ⚠️ **Do not treat any rank rate
    produced by Phase 38 as evidence** — the engine was mis-tuned three separate ways and the
    objective function it optimised (rank/second) is itself now in question.
  - **✅ PHASE 40 SHIPPED 2026-08-11 — all three work items landed and live-validated. Its verdict
    is a FALSIFICATION, and that is worth more than the feature.** WI1 (Revision 3 instrument), WI2
    (governor) and **WI3 (activation, `7ac604f`)** are all on `master`; `npm test` **1395 green**.
    Docs graduated to `docs/phases/`.
    - 🔴 **WHAT IT ACTUALLY DELIVERED — the premise it was built on is FALSE. Do not re-derive the
      phase's own pitch as if it were still true.** The dose-response curve that justified Phase 40
      put `Investigation`'s peak at **L26–29 ≈ 9–10 rank/action**. The governor drove it there and
      measured: **L29 → 0/20 · L25 → 0/20 · L33 → 0/258 · L21 → 2/682**. The peak is *absent where
      it was predicted*. `Investigation` is **not rescuable by levelling** at any level tested. This
      is logged dropped-objection #1 landing ("the phase rests on a curve reconstructed from a broken
      instrument"). Tracked as **Q40-17**, open, Kenneth's call.
    - 🔴 **DO NOT CREDIT THE RATE CLIMB TO THIS PHASE** (the spec's own Rev 3 anti-claim list forbids
      it, and it is the easiest mistake to make here). The rate did roughly double, but that is
      `Tracking`'s **ungoverned autolevel** (L110→L130, **19.77 → 47.56** realised rank/action). The
      governor's *own* measured effect is `Investigation` **0.00 → 0.061 rank/action** — real, and
      immaterial (0.13% of rank). ⚠️ The phase's pitched "+34%, ETA ~20 → ~15 days" was an
      extrapolation off the false curve; **never restate it**.
    - 🔑 **THE DURABLE LESSON, and it is why features ship inert:** WI2's shadow mode proved its own
      design broken **in production, on real data, at zero risk** — and then the *replacement* got
      its premise falsified the same way. A phase that shipped "active" on either would have found
      this by damaging the run. ⚠️ Sibling lesson from WI1's death: **the implementation matched the
      spec and no unit test could have caught it** — `detectActionBoundary` bailed on `!sameAction`
      while the engine alternates on **99.3%** of consecutive starts, so the pure functions passed
      and the live loop never fed them. **A mechanism can be wrong while the code is right.**
    - **Left running deliberately:** the governor will walk `Investigation` to `LEVEL_FLOOR = 1` at
      ≤12 levels/24h, finding nothing. Harmless, and it completes the **L33→L1 sweep** that settles
      Q40-17 by measurement rather than argument.
    - ✅ **TWO CALLS — RULED BY KENNETH 2026-08-08. Shipped as specced; do NOT reopen either.**
      (1) **Q40-12** — the governor **never automatically releases ownership**; once it takes an
      action, autolevel stays off permanently. Rationale: handing autolevel back re-arms the exact
      loop being fixed, with no self-exit. The *danger* is addressed instead, via the cohort guard +
      a ≤12-levels-per-24h drop budget; the *stickiness* is accepted. Cost accepted: on a healthy
      action the governor climbs slower than autolevel would. (2) **S2.3** — with only one action
      sampled, the cohort guard is **overridden** and a level drop proceeds with a warn, because
      holding would disable the phase entirely whenever the pool narrows to one. Cost accepted: a
      wrongly-lowered healthy action in a rare degraded state. **Both are bounded and reversible,
      both carry expiry dates, and both are Kenneth's call — not the spec author's default.**
    - ⚠️ **WI3 activation was reverted once (`8c2cd99`) and re-landed (`7ac604f`) — know which state
      you are reading.** The revert was because active mode **parked the engine on one action**;
      `5b259d2` fixed the settlement starvation underneath it. Re-landed on live evidence: duty cycle
      **1.0** (24h 0.99999997), **50/50 alternation** over 300 starts, 3 forced `setActionLevel`
      restarts costing nothing measurable. 🔴 **Landmine that caused the confusion and will again:**
      viteburner pushes the **working tree**, so `active` ran live in the game for over a day while
      `master` still said `shadow`. **Git and the running game can disagree silently — check
      `git status`, not just the log, before believing either.**
  - **✅ Phase 39 SHIPPED 2026-08-03** (`docs/phases/phase-39-bladeburner-primary.spec.md` — spec
    drafted, cold review, implemented, live-validated, 1246 tests green; commits 36e788f/7fe288e).
    Its go/no-go deliverable **C2 fired 2026-08-03**. ✅ Docs graduated to `docs/phases/` 2026-08-08.
    🔴 **This bullet used to say the 2026-08-05 branch "closed Stage B permanently" — that is
    RETRACTED** (see the Stage B bullet below; the closure was never measured). ⚠️ And **C2 itself
    is now suspect**: it fired on `getActionEstimatedSuccessChance`, which was measured on
    2026-08-08 to be biased **high** at its lower bound — see `bn6-go-no-go.md` §11.5.
  - **🔴 LANDMINE — FOUR scripts contend for the single player-action slot.**
    `bladeburnermanager.js`, `augfarmer.js` (faction work), `backdoorfactions.js` and
    `backdoorwd.js` (`installBackdoor`) all claim it. Any probe or feature needing the slot must
    quiesce **all four**, not just the obvious one. This defeated four attempts at a single
    measurement on 2026-08-02, and each claimant produced an **identical** symptom from a **different**
    cause — which is exactly why it took four tries. ⚠️ Related API trap: **`startAction` returning
    `true` does NOT mean the action is running** (confirmed live: `true` returned while
    `getCurrentAction()` read `null` across 60 samples). Verify with `getCurrentAction()`, never the
    boolean. Full table of claimants and failure modes: `docs/bladeburner-reference.md` §8.
  - **📊 Current standing — this is a SNAPSHOT, not a fact. Recompute before quoting it.**
    🔴 **Never quote a percentage, a rank rate, or an ETA out of this file.** They stale within a
    day and have caused two wrong answers already: "4.9%" written 08-05 read **8.4%** on 08-06, and
    a rate recorded here as "0.1371/wall-sec" was ~24% low within a day. **Every number below is
    stamped; if the stamp isn't today's, go get the live one** — `node tools/bb/cli.mjs stats`, or
    the last entry of `logs/goal-log.json` (`rank` field, 60s samples, ~2 days deep). *Durable*
    facts, safe to quote: the goal is **rank 400,000** (`Operation Daedalus`), and rank and skill
    points **survive installs**. 🔴 **"The rank rate has been rising, not decaying" was listed here
    as durable and is now FALSE — do not restate it** (measured flat over 35 clean hours, §11.2).
    What is still rising is the **action level**, which is a different claim.
    - *Stamped 2026-08-06 ~01:40 UTC:* rank **33,793** · skill points **8,819** banked · Blade's
      Intuition / Digital Observer / Tracer **25** each · team size **0** · city **Ishima** ·
      running **Tracking**, at 100% success.
    - *Stamped 2026-08-07 ~02:08 UTC:* rank **34,083** · skill points **8,912** · Ishima chaos
      **15.68** (the *cleanest* city — Sector-12 1,491 / Chongqing 651 / Aevum 108).
    - *Stamped 2026-08-07 ~12:20 UTC:* rank **41,271** · `Tracking` **103 / 103** ·
      `Investigation` **29 / 29** · ⚠️ **its rate figures are SUPERSEDED, do not quote:**
      ~~"0.2161 and still climbing (0.1743 → 0.2161 monotonically over 11h; latest 5-min window
      0.2798) · ETA ~15–19 days"~~ — that was an 11h read that did not persist (§11.2).
    - *Stamped 2026-08-08 ~13:42 UTC* — fit on a **clean 35h window** (install #43 fired
      2026-08-07T00:40:12Z; that window + 2h recovery excluded), full record `bn6-go-no-go.md` §11:
      rank **59,008** · skill points **17,259** idle · `Tracking` **110** (still climbing ~1 level /
      3.5h, **no cap observed through 110**) · `Investigation` **33** · Ishima chaos **66.34**
      (**4.2× in 35h**, was 15.68) · duty cycle **99.4%** · rate **0.1952 rank/s = 703 rank/h,
      FLAT** (hourly buckets 625–806, no trend) · ETA **~20.2 days**.
    - *Stamped 2026-08-11 ~12:25 UTC* (`logs/bladeburner-state.json`, 12 s old at read): rank
      **132,077** / 400,000 · skill points **41,615** idle · `Tracking` **L127** · `Investigation`
      **L21** (governed down from 33) · duty cycle **1.0** (24h 0.99999997) · rate **0.3986
      rank/wall-sec = 1,435 rank/h** (1h; 24h reads 0.3818). 🔴 **Do NOT credit the doubling since
      08-08 to Phase 40's governor** — it is `Tracking`'s **ungoverned autolevel** climb
      (L110→L127, realised **19.77 → 47.56 rank/action**), which is exactly the attribution the
      spec's Rev 3 anti-claim list forbids. The governor's own measured effect is `Investigation`
      **0.00 → 0.061 rank/action**: real, and immaterial.
    - 🔑 **The model still closes, and the closure is now damning: `Tracking` alone accounts for
      100.4% of the measured rate.** `Tracking` 30.3 starts/h × 47.56 = **1,441 rank/h** vs **1,435
      measured**. `Investigation` runs the *other half of every action the engine takes* (30.3
      starts/h, a 50/50 alternation) and contributes **1.8 rank/h — 0.13%**. ⚠️ Still **not** an
      argument to drop it (§11.4's supply cap holds — `Tracking` is dry at 30.3/h of ~60/h
      capacity); it is an argument that the **filler slot is unpriced**. `Bounty Hunter` estimates
      **1.25 rank/action** and has **never been run once** (0 attempts, ever) — 20× `Investigation`'s
      realised, worth ~**+2.5%** of rate. Small in rank; the reason it matters is *why* the engine
      picks `Investigation` — see the estimator finding below.
    - 🔑 **The trajectory is SELF-IMPROVING, and the ETA is therefore conservative** (measured
      2026-08-11, `logs/bladeburner-attempts.json`). Two rates govern everything:
      · `Tracking` **yield** grows **+4.03%/level** (multiplicative, L121→127).
      · `Tracking` **action time** grows **~1.78 s/level, linear** (84 s @ L121 → 100 s @ L130).
      Multiplicative beats linear, so **rank/hour rises ~2.2%/level and accelerates**. There is no
      cliff ahead. ⚠️ **`Tracking` is supply-capped for real** — `countRemaining` is **pinned at
      1.00** (never above 1.01, n=200) against `Investigation`'s ~4,600 banked, so it is
      *regeneration*-limited at **~30 actions/h** and cannot simply be run more.
    - **Predicted, not yet observed — worth recognising rather than re-diagnosing when it happens:**
      at ~30 actions/h, `Tracking` currently consumes **83%** of the hour (100 s × 30). It fills
      **100%** at ~**120 s ⇒ ~L141** (~1.6 days at the observed ~6.7 levels/day). At that point
      `Investigation` is **squeezed out naturally, with no code change** — the filler slot closes
      itself. Past L141 `Tracking` becomes *time*-capped rather than supply-capped and actions/h
      starts falling, but yield still outruns it. **Do not read the disappearance of `Investigation`
      as a governor action or a bug.**
    - ⚠️ *Data note:* `Tracking` L123 reads a 300 s median action time against smooth 86 s/89 s
      neighbours — that is the 2026-08-10 settlement park, not a level effect. Exclude it.
    - 🔑 **The throughput model now CLOSES (§11.4), and it changes what the levers are.** Measured
      realised rank/action: `Tracking` **19.77** (n=965, zero failures) vs `Investigation` **4.27**
      (n=960, median **0.00**, 68.9% pay nothing, and **decaying — 9.75 → 0.88** across the window).
      `Tracking` is **supply-capped at ~30 actions/h** (count pinned at 1.13, regen +0.008/h) while
      stamina permits ~56/h, so `30×19.77 + 26×4.27 = 704` vs 703 measured. ⚠️ **Therefore "just
      drop Investigation" is WRONG — it is filler on capacity Tracking cannot supply.** The two
      actions moving in opposite directions is *why* the aggregate looks flat.
    - 🔴 **The estimator's LOWER bound is biased HIGH, not merely uncertain (§11.5).**
      `Investigation` predicted `evPerAction` **14.23** at pMin **0.764**; realised **0.88** →
      true success ~**7%**. Even the *converged* pMin-1.0 case (`Tracking`) runs **17% hot**.
      ⚠️ **Checkpoint C2 ("operations lead contracts", fired 2026-08-03) and `Raid`'s 45.72/action
      both come from this same estimator and have NEVER been realised.** Do not quote 45.72 as a
      measurement; it is the strongest lever on the table *and* the least trustworthy number.
    - 🔴 **SUPERSEDED 2026-08-11 — "biased high" was too kind, and "17% hot on `Tracking`" has
      REVERSED SIGN. Do not quote either.** The estimator's error is neither small nor
      signed-consistent, so it **cannot be corrected for**:
      · `Investigation` L21 predicts **`pMin` 1.0000** — a *converged* `[1.0, 1.0]`, maximum
      confidence — and realises **2/270 = 0.74%**. Wrong by ~**135×**, while reporting certainty.
      · `Tracking` L127 predicts **42.85** rank/action and realises **47.56** — now ~**10% COLD**,
      where 08-08 measured it 17% *hot*.
      🔑 **The consequence that matters: the failure is on an OPERATION.** `Investigation` and
      `Raid` are the same action class, so `Raid`'s **47.03 rank/action** is not "an estimate to
      treat with caution" — it is output from a function caught, live, claiming certainty about a
      sibling Operation it had wrong by two orders of magnitude. **C2 is void as evidence**, not
      merely suspect. This is what closes Stage B on measurement (see the Stage B bullet).
      ⚠️ **And it is a live selection defect, not just a reporting one:** the engine picks
      `Investigation` (est. **8.51**/action, realised **0.061**) over `Bounty Hunter` (est. **1.25**,
      never run) — because selection reads the estimator while Phase 40's ledger now holds the
      *realised* number and is not consulted for it. → Q40-17 / the `objectiveMode` phase.
    - 🚨 **THE SELECTION DEFECT NOW HAS A DATE, AND IT LANDS BEFORE THE CLEAR (measured
      2026-08-13).** This is no longer a latent design smell — it is a projected run-killer inside
      the ETA window. `Tracking`'s **estimated** `pMin` is collapsing while its **realised** success
      stays **100%**: `pMin` 0.8884 @ L126 → **0.2505 @ L136** (n=1,250), against 723/725 realised
      and rising yield. Selection (`pickRankAction`, `bladeburnermanager.js:452`) takes the **strict
      max** of the estimator's score and **drops any candidate scoring `<= 0`** (line 460). Fitting
      the decay at **−0.0268 `pMin`/level**:
      · **~L143 (~1.2 days):** `Tracking`'s est. `evPerSec` (0.048) falls **below `Investigation`'s**
        (0.058) → the engine switches to the action realising **0.061 rank/action** over the one
        realising **68.14**. Rate collapse ~99%.
      · **~L145.5 (~1.7 days):** `pMin` reaches 0 → `Tracking` is **dropped from the pool entirely**.
      ⚠️ **The clear needs ~3.2 days, so both dates land inside the window.** ⚠️ **Do not "fix" this
      by flipping `objectiveMode` to `per-action`** — `evPerAction` decays too (17.06 → 0); the
      per-second/per-action axis is orthogonal to this failure.
      ✅ **CONFOUND RESOLVED SAME DAY (2026-08-13) — BOTH are real drivers, and `level` is NOT
      established as one.** Two *independent* interventions each moved `pMin` while holding the
      other variable still, which is exactly what the correlations could not do:
      · **Field Analysis** — chaos held **flat** (274.8 → 274.7), level held 136, `pMin`
        **0.2507 → 0.4444** ⇒ **intel is a driver.**
      · **Diplomacy** — chaos **717 → 72.8**, level *rose* 136 → 139 (which should have *lowered*
        `pMin`), `pMin` **0.4444 → 1.0000** ⇒ **chaos is a driver.**
      🔴 **`pMin` rose while level increased, twice — so the "level-driven decay" reading is not
      supported.** Read the paragraph below as the superseded reasoning, kept for the method.
      ⚠️ **The cliff is currently GONE, not deferred** (`pMin` reads a converged **1.0000** against
      100% realised). But **chaos regrows at 3.22%/h**, so it returns to ~700 in **~3.0 days**
      against a **~3.3-day** clear — i.e. right at the finish. S-RF is the backstop for that.
      🔑 **Method note worth keeping: two collinear candidates were separated by INTERVENING on each
      in turn, not by more observation.** The correlations (−0.95 vs −0.97) were never going to
      settle it; one 15-minute probe and one accidental `Diplomacy` run did.

      [SUPERSEDED 2026-08-13 — kept for the method, not the conclusion]
      🔑 **Driver is CONFOUNDED and I could not separate it — do not assert either cause.** Ishima
      chaos rose **278% in 42h** (72.8 → 274.9, doubling every ~21.9h) while `Tracking` climbed
      L126→L136. The two are collinear, so both fit: `corr(pMin, level) = −0.95`,
      `corr(pMin, log chaos) = −0.97`. It matters only for *which* fix applies (Diplomacy vs a level
      ceiling); the risk is identical either way. ⚠️ Note chaos is **falsified as a driver of
      *realised* yield** (2026-08-08) — so this is an estimate-only effect, which is exactly why it
      is dangerous: **nothing is actually wrong with `Tracking`.**
      ⚠️ **Diplomacy still cannot fire** (chaos 274.9 vs `CHAOS_TARGET` 50, `runs: 0`): 24h
      `rankProducingSec == actionSec` (85,607 == 85,607), so `pickRankAction` never returns `null`
      and `pickOverheadAction` is never reached. The starvation documented 2026-08-08 is unchanged.
    - **✅ CAUSE FOUND AND FIXED, SAME DAY (2026-08-13) — it was LOST INTEL, not decline, and the
      tell was sitting in the data the whole time.** 🔑 **The estimate's UPPER bound never moved off
      `1.0000`** while the lower bound collapsed 0.89 → 0.25. The range was **widening**, not
      shifting down — the game was reporting *"I am less sure"*, never *"this got worse"*, and the
      truth (100%) sat inside the range at the top the entire time. Because scoring reads the
      **pessimistic** bound, "uncertain" and "bad" are **indistinguishable at the call site**.
      📌 **Durable rule: read `getActionEstimatedSuccessChance` as a PAIR. A widening `[pMin, pMax]`
      is an intelligence problem; only a falling `pMax` is a real decline.**
      - **Measured counter** (`src/fieldanalysisprobe.js`, `logs/fieldanalysisprobe-*.json`):
        `Field Analysis` restores `pMin` at **+0.684/hour**, monotonic over 8 min with zero
        reversals, **while city chaos stayed pinned at 274.8** — so it rebuilds the population
        estimate and is **not** a chaos lever. Decay is **0.158/day**, so steady state costs
        **~14 min/day (~1% of wall time)**; a full 0.25 → 0.89 restore takes **~1 hour**.
      - ⚠️ **It raises EVERY action's estimate, including worthless ones** (`Investigation` gained
        *more* `pMin` than `Tracking`). It only nets out because `Tracking`'s `rankGain` is ~50×
        larger. **Field Analysis restores PRECISION, not ACCURACY** — it does not make the
        estimator trustworthy.
      - ⚠️ **S-RF IS ARMED BUT NOT YET LOAD-BEARING — do not claim it "is holding the run."**
        Checked 2026-08-13: it *is* supplying the score in use (floor **0.6649** > estimator
        **0.6453** evPerSec), but the estimator alone would make the **same** pick — `Tracking`
        0.6453 vs `Investigation` 0.0604, a 10× margin — because `Diplomacy` + `Field Analysis`
        restored `pMin` to **1.0000**. It is **insurance that has not been called on**. Its live
        proof so far is narrower and worth stating exactly: it survived **four `Tracking` level-ups
        (L136→L140)** without the deadlock its first draft would have hit.
      - **✅ SHIPPED — S-RF, the realised-evidence floor.** `pickRankAction` now takes
        `max(estimated, realised)` for any action with **≥50 attempts at its current level and ≥90%
        realised success**, reading Phase 40's ledger. **Strictly one-directional**: it can only
        *raise* a proven action, never lowers anything, never promotes an unproven one, and with no
        ledger passed it is byte-for-byte the old behaviour. This makes selection immune to the
        estimator in **both** its failure directions. 9 tests, incl. a replay of the measured cliff.
      - 🔴 **STILL OPEN — the engine cannot self-heal its intel.** `Field Analysis` is *still* not in
        the action pool, so `pMin` keeps decaying; S-RF makes selection immune, but nothing restores
        the estimate on its own. Wiring it in is a **spec question** (trigger threshold, duty
        budget), not a constant tweak. → `BACKLOG.md`.
    - 🔴 **ENGINE DEFECT, real — but CORRECTED 2026-08-08 (evening): `Diplomacy` HAS run, and
      `effect.runs: 0` is NOT a cumulative count.** ~~"`Diplomacy` has never run … `effect.runs: 0`
      cumulative"~~ was wrong on both halves. `bladeburner-log.json` holds **two** `diplomacy-effect`
      records (both 2026-08-03), and `diplomacyEffect` is an **in-memory accumulator reset to
      `emptyDiplomacyEffect()` on every process start** — with **17 restarts** logged and the last
      startup at 2026-08-07T00:40Z, `runs: 0` means *"none since the last restart,"* never *"never."*
      ⚠️ **Fifth instance of the same pattern: a counter was read as cumulative without checking
      whether anything persists it.**
      - **The defect underneath is real, and it is a DIFFERENT mechanism than the one fixed
        2026-08-03.** That fix made the chaos branch *reachable*; it is now **starved of slack**.
        `pickOverheadAction` is only called when `pickRankAction` returns `null`
        (`bladeburnermanager.js:1592`), and the engine now runs **24h `dutyCycle` 0.9998 with
        `rankProducingSec == actionSec`** — `Investigation` always backfills, so overhead is never
        picked at all. Every guard on the branch itself currently *passes* (Ishima chaos **69.02** >
        `CHAOS_TARGET` 50, `budgetRemainingMs` 720,000 > 0, `hpFraction` 1, stamina 0.986 not
        recovering) — it is simply never reached.
      - 🔴 **Diplomacy's strength is UNMEASURED — do not quote 174 chaos/run.** Of the two records,
        the second was correctly **discarded** (`city changed Volhaven -> Ishima`) and the first
        (`removed: 174.15`, Sector-12 177.5 → 3.39) **predates the same-city guard** — it carries no
        `cityName` field, and it is precisely the contaminated sample
        `bladeburnermanager.js:1671-1674` was written to catch ("makes it look ~50× stronger than it
        is"). One clean sample has never been taken.
      - **✅ FIRST CLEAN SAMPLE TAKEN 2026-08-13 — `Diplomacy` removed `645.03` chaos in ONE run**
        (Ishima ~717 → 72.8, same city throughout, so it passed the `cityName` guard rather than
        predating it). It fired **on its own**, unprompted: the overhead branch documented as
        permanently starved *did* reach `pickOverheadAction`. ⚠️ **Do not read 645 as a per-run
        constant** — it removed ~90% of the standing chaos, so one sample cannot distinguish an
        absolute effect from a proportional one. What it does settle: **the branch works, and the
        lever is far stronger than the retracted 174 figure.**
      - 🔴 **AND THE LEVER IS AIMED AT THE WRONG TARGET — chaos is FALSIFIED as `Investigation`'s
        cause (2026-08-08 evening).** Chaos is **city-scoped**, so `Tracking` is a free control: over
        the same window, same city, while chaos rose **7.2×** (9.3 → 66.5), `Tracking`'s zero-rate
        stayed at **0–1%** and its yield *rose* (29.92 → 24.52 rank/action, level 99 → 112) while
        `Investigation` collapsed 5.81 → **0.23** (8% → **99%** zero). Whatever is killing
        `Investigation` is **action-specific**, and chaos cannot be. ⚠️ **Do not quote
        `bn6-go-no-go.md` §11.8's "+230 rank/h from fixing Diplomacy"** — its premise is contradicted.
      - 🔑 **The real cause is the action's own LEVEL, and the engine has never managed it.**
        `Investigation` yield by level is a clean dose-response: rises to a **peak at L26–29 (~9–10
        rank/action)**, then cliffs — L30 6.67, L31 4.77, L32 1.33, **L33 0.21 (99% zero)**. It is
        **stuck at L33**: `autolevel` only advances on success, so it locked itself at a level it
        cannot clear. `bladeburnermanager.js` **never calls `setActionAutolevel`/`setActionLevel`** —
        `autolevel: true` is the game default, ungoverned. Install #43 is ruled out as the driver:
        the by-level curve runs **smooth and monotonic straight through** the install boundary (L21
        pre 21% zero → L22 post 23%). → **Phase 40**, `phase-40-autolevel-governor.features.md`.
      - *Stamped 2026-08-08 ~18:20 UTC:* Ishima chaos **69.02** (15.68 on 08-07 → 66.34 on 08-08
        13:42 → 69.02) — still climbing, and now **not known to be costing anything**.
    - 🔴 **RETRACTED 2026-08-07 — "the action level caps at 100 / the acceleration is over / ~25
      days" was WRONG.** `Tracking` read 100/100, then **103/103** fourteen hours later — `maxLevel`
      keeps growing. The honest statement is **"no cap observed through level 103,"** not "no cap."
      ⚠️ **How it went wrong, because it is the fourth instance of one pattern:** `current == max` is
      the *normal* state for every action (the doc said so and reasoned around it anyway), 100 being
      round was coincidence, and the "rate stopped climbing" reading was **taken across install
      #43's recovery window**. 🔑 **New rule, sibling to "an estimate is not a measurement":
      A TREND READ ACROSS A KNOWN DISTURBANCE IS NOT A TREND** — installs are timestamped in
      `ratchet-log.json`; exclude those windows before fitting anything. And **two weak signals
      agreeing is not evidence when both derive from the same uninformed reading.** Full record:
      `docs/bn6-go-no-go.md` §10.
    - **Overclock 17/90 — do NOT buy more, it is measured DEAD** (stamina is per-action, so action
      time is irrelevant to sustainable throughput). ⚠️ The "×0.10 ceiling = 8.3× throughput" claim
      this bullet used to carry was wrong; never restate it.
    - ⚠️ Also obsolete, do not quote: "150 days / 0.0307 rank/s / ~50× stack", and "32–38 days /
      0.1371 rank/s" — both superseded by the stamped figures above.
  - **🚨 STAGE B REOPENED 2026-08-06 (evening) — the "Raid permanently kills a city" finding is
    RETRACTED. It was never measured.** Volhaven's population `0` and its actions scoring `0` both
    mean **"unknown," not "zero"**: `getActionEstimatedSuccessChance` returns a **[MIN, MAX]** range,
    and in Volhaven every one of the nine contracts/operations reads **`[0.0000, 1.0000]`** (maximum
    uncertainty) vs Ishima's **`[1.0000, 1.0000]`** (converged). The engine scores on **`pMin`**
    (`bladeburnermanager.js:304`), so an **unscouted city is indistinguishable from a dead one**.
    Volhaven's inventory is intact: 2,727 Raids · 3,496 Undercover · 1,432 Assassinations.
    ⚠️ **`Field Analysis` is not in the engine's pool**, so it can never rebuild lost intel — it reads
    a fixable intelligence problem as a permanent loss. **Raid's true city cost is UNKNOWN**;
    Stage B is gated on Q11 + new **Q14** (does scouting restore a drained city?).
    - **DEFAULT + DATE (set 2026-08-08, per the "open decisions carry a default and a date" rule —
      this gate had neither for two days): Stage B stays CLOSED, expiring 2026-08-15.** If Q14 is
      not run by then, Stage B is closed for the rest of BN6 and Stage A carries the clear alone.
      **Why closed is the right default even though Raid is the biggest number on the table:** the
      45.72 rank/action that makes Stage B attractive comes from `getActionEstimatedSuccessChance`,
      and that estimator's **lower** bound was measured biased *high* on 2026-08-08 (§11.5) — so the
      lever's headline figure is the least trustworthy number we hold. Q11 is separately moot in
      Ishima (commit `fff3849`). **What it costs if wrong:** we forgo the largest single lever for a
      week against a ~20-day Stage A ETA. **What reopens it early:** a positive Q14 (see the Ideas
      entry in `BACKLOG.md`), nothing else.
    - **✅ RESOLVED EARLY 2026-08-11 — Stage B closes on MEASUREMENT, not on the default expiring.**
      The 08-15 date can simply pass; nothing needs to be run, and **Q14 is moot** (we do not need
      Volhaven). The estimator that produces Raid's headline number was measured live against the
      only Operation the engine actually runs, and it did not merely read high — **it reported
      certainty and was wrong by ~135×**: `Investigation` at L21 predicts **`pMin` 1.0000**
      (a converged `[1.0, 1.0]`, maximum confidence) and realises **2 successes in 270 attempts
      (0.74%)**. 🔑 **Same action class.** `Investigation` and `Raid` are both Operations, so this is
      not a generic caveat about estimates — it is a same-class, live falsification of the exact
      function whose output (`Raid` **47.03 rank/action**) is Stage B's entire case, and Raid spends
      a city **irreversibly** on that say-so. ⚠️ Note the bias is **not a consistent direction** and
      so cannot be corrected for: on `Tracking` the same estimator reads **~10% cold** (predicts
      42.85, realises 47.56). 🔴 **By the same argument, checkpoint C2 — which fired 2026-08-03 on
      `operationLeadsPerAction` — is void as evidence, not merely suspect.** It is still reading
      `true` today, computed from `Raid` 47.03 vs a `bestContract` that reads **1.25** whenever
      `Tracking`'s supply is dry.
  - **📌 The method rule this cost three commits to learn: an ESTIMATE is not a MEASUREMENT.** Any
    `ns.bladeburner` value whose name contains `Estimated` must be read as a **range**; a
    single-point read of one is not evidence. Three successive wrong conclusions were each
    "confirmed" by re-reading the same uninformed number through a different lens.
  - **🔴 Q10 ANSWERED 2026-08-06: stamina is spent PER ACTION → `Overclock` is DEAD.** *(Unaffected by
    the retraction above — this probe timed real stamina deltas against a wall clock, no estimate in
    the chain.)* Measured
    (`src/q10probe.js`, 593 samples): stamina fell exactly **9 times in 449 producing seconds**, every
    drop precisely **2.162**, every one on a rank tick, spaced at the 51s action time; regen is
    continuous at 0.03352/s. Sustainable actions/hour = `regen × 3600 / cost` = **55.8, independent of
    action time** — Overclock 90 would permit 585.9/hour by the clock and change nothing. ⚠️ **Never
    quote the "×8.3 → ~4 days" figure again**; the ~4,000 banked SP were correctly *not* spent.
  - **🔴 RE-CLOSED 2026-08-06 (measured) — the aug tier is inert after all, and `Cyber's Edge` is
    worthless. Buy neither; the ~8,912 SP stay parked.** ~~We are stamina-limited, which partly
    REOPENS the aug tier … `bladeburner_stamina_gain` multiplies the rank rate directly.~~ That
    reopening rested on an assumption nobody had measured. `src/leverprobe.js` measured regen at
    **0.03274/s at `staminaMax` 88.96** vs Q10's **0.03352/s at ~136.5** — max moved ~35%, regen
    moved **2.3%**. **Stamina regen is FLAT, independent of max.** So sustainable actions/hour is
    `regen × 3600 / cost` = **55.0** and *nothing* about max stamina can raise it. ⚠️ `Cyber's Edge`
    is **neutral-to-harmful**, not merely useless: the guards are *fractions* of max
    (`STAMINA_FLOOR_FRACTION` 0.5 / `STAMINA_RESUME_FRACTION` 0.55) while regen is a flat *absolute*
    rate, so raising max only makes each rest **longer** in wall-clock. Success-chance augs remain
    worthless (100% success). Full record: `docs/bn6-go-no-go.md` §8.2.
  - **🔑 The correct objective is rank-PER-ACTION, and the engine uses the wrong one.** Follows
    directly from the above: `rank/sec = 55/hour × rank-per-action / 3600`, and **actions/hour is
    fixed by arithmetic regardless of action time**. `bladeburnermanager.js` runs
    `objectiveMode: "per-second"`, which systematically prefers *short* actions — exactly backwards
    when time is free and stamina is the currency. ⚠️ **This is a diagnosis, not a shipped fix** —
    it needs a phase branch + the 1246-test suite, and the size of the gain is **not** established
    (operation scores derive from `Estimated` ranges). `docs/bn6-go-no-go.md` §8.3.
  - **➡️ Q13 is partly ANSWERED and no longer the next measurement.** Per-action stamina cost
    measures **~62% flat / 38% time-proportional** (`bn6-go-no-go.md` §2.5), cross-validated by
    Q10's 55.8 actions/hour vs an independently derived 52.7. **The open question is now whether
    operations actually pay more rank-per-action than a capped `Tracking`** — that is what gates
    the `objectiveMode` flip and Stage B.
  - **⚠️ Install cadence STOPPED 2026-08-06** (`src/ratchet-mode.txt` → `observe`; installs cost a
    measured **5.4%** of Bladeburner wall-time). 🔴 **That file is pushed from the repo by viteburner
    AND is gitignored** — an in-game write alone silently reverts on the next dev-server restart, and
    did: it re-enabled installs and #43 fired 7 min later, killing a running probe. Edit the repo
    copy, then verify with `run setratchetmode.js`.
  - **✅ BN2.1 CLEARED 2026-07-23** — `w0r1d_d43m0n` backdoored (`backdoorwd.js` auto-fired once
    hacking crossed the gate), confirmed on the BitVerse screen (`bb-shot.png`). **Cleared at
    M≈34.3, NOT the M≈45 target**: the exp stack overshot (13.9B exp) and put the level at
    **15,019 ≥ the 15,000 gate** first. Full record + retrospective in
    [`docs/gang-engine.md`](docs/gang-engine.md).
  - **✅ BN5.1 CLEARED 2026-07-29** — `w0r1d_d43m0n` backdoored, confirmed live: BitVerse selection
    screen (`bb-shot.png`), `logs/ratchet-log.json` install #35 (3:16:01 PM), and a fresh in-node
    `auginfo.js` run reading `mults.hacking: 1.3824` = `1.28 × 1.08` — exactly SF5 level 1's +8% on
    the 1.28 SF1.3 floor (SF2 L1's +24% crime/charisma also confirmed still intact). Full record:
    `docs/bitnodes.md`'s BN5 section.
    - **The armed tripwire never fired — resolved by outcome, not by checking the date.** The
      2026-07-23 decision was: build a gang if sustained batcher income stayed under ~$15M/s past
      2026-08-02. BN5 cleared first. **Batcher-only was sufficient for BN5, end to end** — real
      evidence for the next node's version of this same question, not just an expired clock.
    - **Left undone, still open:** the `getBitNodeMultipliers()` live-signature verification never
      ran before the clear. Not a missed window — SF5 persists across nodes, so it's still doable
      from BN6 or anywhere, whenever it's worth the ~10-minute detour.
  - **📕 ALL THINGS BN6 LIVE IN TWO DOCS — read them before planning or coding anything here.**
    - **[`docs/bladeburner-reference.md`](docs/bladeburner-reference.md)** — the interface: access
      model, complete static catalog, every method's semantics + RAM, gotchas, and an explicit
      "not knowable until we join" list. Gated the same way `batcher-engine.md` is: read it before
      designing against the Bladeburner API.
    - **[`docs/bn6-playbook.md`](docs/bn6-playbook.md)** — the strategy: the win-path decision and
      its arithmetic, node facts, the staged plan, and the open questions with defaults/dates.
    - **✅ FIRST TASK DONE 2026-07-29 — the full interface read happened before any design.** Both
      docs above are its output. Key results: the **entire `ns.bladeburner` API throws until you
      join the division** (uniform error; even six 0 GB methods throw — the gang lesson repeating),
      but the **complete static catalog was recovered from the enum types anyway** (3 contracts, 6
      operations, **21 black ops ending at `Operation Daedalus`**, 6 general actions, 12 skills).
      Two gates verified live: **combat stats ≥ 100** for the division, **rank ≥ 25** for the
      faction. `src/bladeburnerprobe.js` + `src/combatgateprobe.js` are the reusable probes.
    - **🔑 Two facts that drive everything:** **Bladeburner rank and skill points SURVIVE
      augmentation installs** (faction rep does not, and can only be earned via Bladeburner
      actions) — the only monotonic progress axis we've ever had. And **combat 1→100 is only
      21,668 exp** (measured), so the prerequisite is a gym trip, not a grind.
    - **⚠️ Unlike gangs, measuring IS correct here.** `formulas.bladeburner` has exactly **one**
      method and the in-game doc is three paragraphs, so action yields/skill effects/chaos/stamina
      are genuinely empirical — the opposite of Phase 27, where the formulas module already had the
      answers. The lesson was *read the interface first, then find out which you need*; we read, and
      the answer came back "measure."
  - **✅ STAGE 1 DONE 2026-07-30 — combat gate cleared (overshot to 172/172/172/172, target was
    100), Bladeburner division joined.** Route measured, not assumed: Iron Gym priced out ($120/s
    per stat, one stat at a time, vs ~$3.9k banked at $0/s income); crime (Mug) measured at
    **0.179 exp/sec/stat**, settling the failed-crime-exp question empirically (neither of the
    predicted bounds). `combatgrind.js` died mid-run (its own documented RAM-contention risk) but
    the `commitCrime` player action it started kept running unattended past the gate with nothing
    alive to stop it — harmless overshoot, ~90 min of pointless Mug. New `src/joinbladeburner.js`
    stopped the action and called `joinBladeburnerDivision()` → `true`.
  - **[SUPERSEDED 2026-08-02 by the Bladeburner-primary flip at the top of this section — kept for
    the trial numbers and the lesson, not the conclusion]
    🔴 DECISION FLIPPED 2026-07-30 — HACKING IS NOW THE PRIMARY PATH, NOT BLADEBURNER.** The
    ~3-week flip condition set at Stage 1 (see the superseded reasoning below) was re-checked live
    and failed decisively. `bladeburnerprobe.js` + two sibling probes first found a bad *predicted*
    rate at zero investment (~5–6 months to the rank-400,000 `Operation Daedalus` gate, ~8x past
    the bar). A ~75-minute, 3-version live trial (`src/bladeburnertrial.js`, Kenneth's go-ahead)
    then tested every lever that could plausibly close that gap — `Field Analysis` scouting
    (confirmed real, but only narrows uncertainty, not the rate), skill investment (13 SP across 10
    skills — a one-time step, not a trend change), and a `Diplomacy` chaos-countermeasure (a small,
    consistent bump, 2–3x smaller than the decay it was fighting). **All three were insufficient
    against a steady, undocumented decay in success chance** that hit regardless of which action
    ran or how many skills were bought — almost certainly the game's chaos mechanic, city-scoped
    and never mitigated by anything tested. **The actual achieved rate (real rank gained ÷ real
    elapsed time, not the pre-action prediction) was 0.0144 rank/sec — projecting ~10.5 months, a
    number *worse* than the original naive zero-investment estimate.** Every mitigation tried made
    the outcome worse than doing nothing, not better — this is off the 3-week bar by roughly two
    orders of magnitude, not one, and is a load-bearing result, not a hedge.
    **Bladeburner rank/skills are not wasted** — they persist across installs (the fact that made
    trying this worth it) — but building the Stage 3 engine is no longer justified by what's
    measured, so it's shelved, not scheduled. **One untested lever is logged, not closed:** city
    rotation (every cycle ran in one city) — revisit only if the hacking path also stalls badly, or
    on request for one more cheap experiment. Full record: `docs/bladeburner-reference.md`
    §3/§6/§8/§9/§10, `docs/bn6-playbook.md` §1 (has the actual rate math + the full trial log
    trail) and its 2026-07-30 changelog entries.
  - **⚠️ CORRECTION 2026-07-31, propagated here 2026-08-01 — the "non-viable" verdict just above is
    UNSOUND, not a closed verdict.** `bladeburnertrial.js`'s model had four real flaws
    (`docs/bladeburner-reference.md` §5, found by reading the in-game panel the original trial never
    opened): fixed action time (misses `Overclock`'s up-to-10× cut), 13 SP tested against ~133,000
    banked by rank 400,000, zero team size, and ignored that action success levels — and their rank
    payout — grow with use. Hacking-primary is **not** reversed by this (BN2/BN5's 5–6-day
    same-engine precedents independently support it as fast and proven), but treating Bladeburner as
    *closed* was wrong. **Phase 38** (`phase-38-bladeburner-engine.spec.md`,
    `src/bladeburnermanager.js`, branch `phase-38-slice-b`) exists to re-measure it properly:
    opportunistic slack-time grinding only, unconditional stand-down for
    `backdoorwd.js`/`backdoorfactions.js`/`studybootstrap.js`, two real checkpoints (24h smoke @
    0.043 rank/held-sec, 1-week viability @ 0.1543 rank/held-sec). **As of 2026-08-01: zero data
    yet**, stood down for `backdoorfactions.js` since it started — expected, not forced early, per
    the spec. An adversarial cold-review agent independently re-confirmed all of this from raw logs
    2026-08-01 after Kenneth flagged the "skipping Bladeburner in the Bladeburner node" framing as
    off. Full trail: `docs/bn6-playbook.md` §1's correction block and its 2026-07-31/2026-08-01
    changelog entries.
  - **[SUPERSEDED 2026-08-02 — do not do this]** The old "next action: re-derive the hacking-path
    plan using the M≈28–37 / +35-aug-Daedalus math" is retired with the batcher's demotion to
    funding engine. The math itself is still correct and still in `docs/bn6-playbook.md` §1 if the
    fallback ever needs reviving; it is simply no longer the plan.
  - **[SUPERSEDED 2026-07-30 by the flip above — kept for the numbers, not the conclusion]
    Original decision: clear BN6 via the Bladeburner black-op path, not hacking** (2026-07-29, high
    confidence on ordering *at the time* — the flip condition this section itself set was then
    triggered by the live re-check). The hacking path is **not** the cheap option: computed
    **M ≈ 28–37** (WD gate 6,000 at Hacking Level mult 0.35) — squarely BN2 territory — **plus 35
    augs** for the Daedalus invite. And clearing by hacking would forfeit the whole reason BN6 is
    next: banking a working alt-destroy **engine** for the hacking-walled back half
    (BN9/BN10/BN13/BN14). SF6 drops either way; the engine is the actual deliverable. Full argument
    + the flip condition (now triggered) in the playbook.
  - **🧮 BN6 is economically *better* than BN5 for the mult ratchet** — a computed result worth not
    re-deriving: effective steal is `ServerMaxMoney × ScriptHackMoney` = 0.2 × 0.75 = **0.15,
    identical to BN5's** 1.0 × 0.15, and BN6 has **no aug-cost penalty** where BN5 carried 200% →
    **2× the aug-buying power at equal income**. The real regressions are exp (**0.25**, 2× slower
    than BN5) and fleet cost (`CloudServerSoftcap` **2.0** vs 1.2), so ⚠️ **post-install re-climbs
    are worse than BN5's 1–4h** and "rank survives installs" does *not* rescue the batcher's climb.
  - **This is the counter-map's predicted next step, not a fresh decision.** `docs/bitnodes.md`'s
    2026-07-18 counter-map order was BN1→BN2→BN5→BN4(held)→**BN6→BN7**→BN10→harsh nodes→BN12→BN11
    — we're on it. **BN7 is the expected follow-on once BN6 clears**, not a separately-decided fork
    — revisiting that needs new evidence, per the "don't re-argue a settled call" rule, not just
    discomfort with a new engine. ⚠️ **In BN7, `joinBladeburnerDivision()` under SF7.3 permanently
    locks out Stanek's Gift** — restate at execution time.
  - **⚠️ Ordering lesson carried out of BN2 — don't repeat it.** The counter-map put BN2 before BN5
    because "the gang is a rep-tax killer." But in BN2 **rep saturated and was a non-issue**; the
    binding constraint was money→mult. Worse, BN2's gate is *mult*-gated while BN5's reward is **+8%
    hacking mult**, so BN5-first would have made BN2 cheaper — we did it in the harder order.
    **Before committing to a node order, check which constraint actually binds in the target node**
    rather than trusting the general map.
  - **Reusable decision lesson from the BN2 commit (kept — it generalises):** a BitNode restart is
    cheap when the node holds no progress, so "permanent/irreversible" was mispriced as a blocker —
    deciding wrong and restarting beats deliberating for five more sessions.
  - **Gang history is closed but not deleted:** why hacking-not-combat, the catalog corrections, the
    two respect↔money reversals, the QLink-trap math, territory's deferral, and `gangmanager.js`'s
    architecture all live in [`docs/gang-engine.md`](docs/gang-engine.md). Read it before any future
    gang work (a BN2.2 repeat, or a Sleeves-backed gang elsewhere) so it isn't re-derived from
    scratch.
  - **Phase 25's aug-ratchet controller is the reusable asset going forward** (Phase 25 L7 passed
    2026-07-17; supervision/stall-detection/gate-release all added by Phase 26). Whatever node
    comes next that still fits BN1-shaped mechanics can reuse this toolchain largely unchanged —
    see `docs/phases/phase-25-faction-strategy.closeout.md` for that phase's own record.
  - **BN1.2 was cleared 2026-07-15** — `w0r1d_d43m0n` backdoored (confirmed live via a
    BitVerse-selection-screen screenshot; SF1.2 grant itself not yet independently re-verified via a
    save/aug-info read, but the backdoor firing + landing back on the BitVerse screen is strong
    evidence it landed). That clear was the live debut of Phase 25's aug-ratchet controller
    (`docs/phases/phase-25-faction-strategy.spec.md`) plus same-day extensions Kenneth authorized
    live: auto-donate to Daedalus, auto-buy The Red Pill, and a new `src/backdoorwd.js` that
    auto-backdoors WD — see that spec's "Close-out (2026-07-15)" section for the full done-vs-left
    record (auto-*install* specifically is still unexercised, deliberately skipped for that run's
    final install).
  - **[CLOSED 2026-07-29 — superseded by outcome]** The old pre-1.3 "stop at BN1.2, make BN5 the
    next extending node" plan, and the node-order deliberation that followed it, are moot: the
    counter-map order actually ran (BN1→BN2→BN5→BN6, see `docs/bitnodes.md`), not this line's
    reasoning. Kept only so the superseded reasoning isn't re-derived from scratch; the batcher
    engine itself (architecture/lifecycle/strategy) is still `docs/batcher-engine.md`.
  - **(a) Phase 20 XP-farm engine shipped 2026-07-13** (`docs/phases/phase-20-xpfarm.spec.md`) —
    hack-saturation of surplus fleet RAM, S7 ON/OFF A/B gate measured 5.15× exp/sec.
  - **Open strategic Q — RESOLVED BY ACTION, 2026-07-29.** The "no new engine" constraint that
    picked BN5 over BN2's rep-tax-killer tradeoff is now explicitly abandoned: **entering BN6 means
    building Bladeburner, a genuinely new engine**, precisely because it's the counter-map's next
    rep-tax/hacking-wall killer. Not a silent drift — the counter-map already named this tradeoff on
    2026-07-18, and BN6 is the node where it's finally paid down rather than deferred again. IPvGO/
    darknet remain available as *other* second-engine options later, just no longer the only ones.
  - **Note on Singularity — UPDATED 2026-07-12:** `ns.singularity.*` is now available. Phase 21
    granted SF4 level 3 via a deliberate save edit (`docs/phases/phase-21-sf4-grant.spec.md`) — a
    permanent grant on the current save, not tied to this BN1.2 run, so it persists across future
    installs/resets. The 1× RAM discount is live (confirmed via `sf4check.js` + `ramcheck.js`, ≈7.65
    GB). The previously-parked SF4-gated backlog items (auto-backdoor, aug-planner execution, TOR
    ladder, rep watchers) are now buildable — each is still its own future phase, not automatically
    in scope.
- **Before agreeing with a plan, lead with its strongest objection and what it costs** — not just the
  upside. Frictionless agreement is a cue to poke harder, not to proceed.
- **Before building tooling/polish, check it against the goal.** If it doesn't advance the goal, say
  so and name the cost — don't build it just because it was asked or because it's interesting.
- **Raise problems Kenneth didn't ask about, and disagree when you disagree.** Treat his praise-worthy
  work as a peer's draft to critique, not a product to accept.

### …and then converge (added 2026-07-19)

Everything above this line tells Claude to *open* things; nothing told it to *close* them. Four days
circling the gang decision was that imbalance working as written — full diagnosis in
`docs/metareference/divergence-without-convergence.md`. These rules constrain **that** a conclusion
gets reached, never **which**
conclusion; none of them says agree, soften, shorten, or stop objecting. If a future edit here starts
specifying a direction, that's the yes-man failure mode and it should be reverted.
- **Separate blockers from considerations.** A blocker stops work — say so plainly. Everything else
  is a consideration: state it once, at visibly lower weight, and keep moving. Presenting both at
  equal weight *buries* the blocker. (Concrete failure 2026-07-19: one real blocker — the gang API
  is inert until `createGang()` — was mixed with four considerations at equal billing, and Kenneth
  had to dig it out.)
- **Recommend, don't enumerate.** When surfacing options, name the pick, say what it costs if it's
  wrong, and act on it. "Here are three approaches" without a bet is an evasion — an option-list is
  where Claude hides from being wrong, not where rigor lives.
- **Open decisions carry a default and a date.** No expiry means the decision renews itself every
  session. The default may be "abort"; this rule sets no direction.
- **Don't re-argue a settled call — but reopen it on new information.** Once Kenneth has heard an
  objection and decided, stop repeating it. Three things legitimately reopen it: new evidence he
  didn't have, the predicted failure actually occurring, or the stakes changing. Name which one
  applies when reopening. Rationale for the rule at all: objecting at equal volume about everything
  trains Kenneth to discount all of it, including the one that mattered — **rarity is what makes an
  objection legible.**
- **Dropped objections get logged, not erased.** Record it in the phase doc or `BACKLOG.md` before
  executing, so a bad call leaves an artifact instead of a memory — and so it can return later as
  *evidence* rather than as repetition.
- **Never suppress an irreversibility or data-loss warning under any of the above.** Restate it at
  the point of execution, every time. "Raise once" governs *I think A beats B*; it never governs
  *this is one-way*.

## Read the whole interface before designing against it

**Before writing a features/spec doc for work against an unfamiliar API, read that API's
*complete* surface first — methods, return types, field definitions, preconditions, and any
formulas module.** A method list with one-line descriptions is not the interface; the types are.

This is a recorded failure, not a hypothetical (2026-07-18, Phase 27/gangs): a brainstorm doc was
drafted after reading only `bitburner.gang.md`'s method list. Its central premise — "every
strategic threshold is empirical, so build an observer first and derive them from logs" — was
**false**, and provably so from files sitting unread in `markdown/`: `GangTaskStats` exposes each
task's base yields *and* per-stat weights, and `ns.formulas.gang.*` computes exact yields. The
doc was invalidated twice more before the gap was noticed, and each time it got *patched* rather
than reconsidered. **Three invalidations of one document means the foundation is wrong — stop
patching and re-read the source material.**

Cost of doing it right: the full read here was ~10 minutes of bulk `grep` over ~30 meaningful
files (see `docs/gang-engine.md`'s API reference, which that read produced). Cost of skipping it:
most of a session.

Corollary: **documented RAM cost tells you nothing about preconditions.** `getTaskNames` and
`getEquipmentNames` are 0 GB and still throw without a gang. Verify availability empirically with
a read-only probe before assuming a call is usable.

**Gathering data to strengthen an analysis is STANDING pre-authorized — just do it, then present
the stronger answer. Do not spend a round asking "want me to run it?"** This covers, as one blanket
grant: writing a throwaway probe, running an existing check script (`augcheck.js`, `auginfo.js`,
`ramcheck.js`, and the like), reading exported logs, **and running the calculations/modelling those
numbers feed** (cost curves, break-even math, timeline projections, "is path A cheaper than path B").
If the next useful step is *measure it, compute it, then reason from the result*, the answer is
**always yes** — the permission is assumed, asking for it wastes a turn. Kenneth's standing position:
"of course I'll allow you to gather data and give me a stronger thesis — making me say 'yes go ahead'
first is pure latency." So collect the numbers and run the math *before* finishing the response, and
lead with the grounded conclusion, not a hedge or an offer. A measured/computed number beats a hedged
one, and probing is how the "read the interface first" rule gets enforced.

Be **agentic** about this: when a claim in your own answer would be sharper with a real number, that
is a trigger to go get the number in the same turn, not to caveat around its absence. The bias is
toward doing the work and showing the result.

**Fences (the grant is broad but bounded):** **read-only only** — touches nothing in the Gang API's
action group or any other mutating/irreversible call; a probe/check/experiment that would *change*
game state, even reversibly (a temporary task reassignment, a test purchase), is NOT covered and
still gets flagged first. Keep any single side-quest to **≤10 min of work**. Log probe output to a
file per the one-off-scripts convention; don't make Kenneth paste results back. (Calculations from
already-gathered numbers have no such fence — just run them.)

## Development workflow
Feature work runs in three stages, each handing off a **file**, not chat. Name phase docs
`phase-NN-slug.<stage>.md` — zero-padded number first so they sort chronologically (e.g.
`phase-15-homeram.features.md`, `phase-15-homeram.spec.md`). The active phase's docs live in
the repo root during the work; when it ships, they graduate to `docs/phases/` and a condensed,
dated entry goes in `docs/phases/CHANGELOG.md`.
1. **Brainstorm (opus)** → `phase-NN-slug.features.md` (decisions, rejected alternatives, open questions).
2. **Spec + review (fable)** → `phase-NN-slug.spec.md`, then a cold-context review by the
   `spec-reviewer` subagent; address blockers, log disagreements as open questions.
   Present final draft + changelog + open questions before implementing.
3. **Implement (sonnet)** on a branch/worktree, with the tests / RAM gate /
   `npm run verify:log` / live validation the spec calls for.

Conventions below apply at every stage (spec-reviewer enforces them).

## Engineering conventions
- **Keep Singularity calls out of hot paths** — heavy RAM multiplier. Isolate in
  daemon-launched companion scripts `exec`'d by filename (like `purchasescripts.js`),
  never imported into `daemon.js`.
- **Log every purchase** via `recordTransaction` (`src/translog.js`) on success — see
  existing call sites. A failed spend records nothing.
- **Test + validate against logs** — vitest where practical, check exported logs, wire
  into `npm run verify:log`. For live-only behavior, do a live run and say so.
- **Prefer exported logs over pasted terminal output** (game copy/paste is lossy). Verify
  against the log files, not assumption. If a result isn't logged, add an `ns.write(...)`
  export (+ `vite.config.ts` filter) instead of asking for a paste — or ask whether to log
  it. → `docs/logging.md` for the file-naming patterns.
- **Never `git checkout`/switch branches in the dev-server-watched checkout while the game
  is connected**, unless the push is intended — viteburner pushes on every working-tree
  change, so a checkout mid-merge silently overwrites the in-game code with whatever the old
  branch held (caused Phase 13's phantom RAM bug: three "confirmed" gate re-runs all measured
  stale reverted files). Stop `npm run dev` first for merge choreography. Any RAM-gate reading
  is only trustworthy if it's checked against `dist/src/*`'s byte-faithful record of what was
  actually last pushed (`ramcheck.js` records each script's in-game byte length for exactly
  this).
- **Only Claude working in `bitburner-scripts` (this checkout) may stop `npm run dev`.** It's
  the one running the live dev server pushing to the game. A Claude session in a different
  worktree (e.g. `bitburner-scripts2`) must never stop/restart it — that server isn't visible
  or under that session's control, and killing another session's process out from under it
  breaks the user's in-game sync without warning.
- **Dev-server connection auto-heals on session start.** The game/daemon survives the
  computer sleeping fine (scripts keep running), but `npm run dev`'s WebSocket connection
  to it (port 12525) doesn't reconnect cleanly, so exported logs silently go stale. A
  `SessionStart` hook (`.claude/hooks/dev-server-autoheal.sh`, wired in the gitignored
  `.claude/settings.local.json` — never `bitburner-scripts2`) checks
  `logs/daemon-batch-log.json`'s mtime every session start; past 60s stale (or the dev
  server isn't running at all) it kills+restarts `npm run dev` automatically and reports
  one line. No manual "is my computer asleep" debugging should be needed anymore.
- **Observability convention (Phase 24).** New features emit observations to a **log file**
  by default — non-lossy and Claude-readable via the viteburner bridge without a paste.
  **Dashboard space is gated:** a panel, indicator, or status line is added to `dashboard.js`
  only via a brainstorm decision ("do we get value from surfacing this?"), never silently —
  the window is a fixed-budget, no-wrap, single-instance surface, so ad-hoc writes would break
  the very guarantees it exists to provide. Spawning a **new standalone popup** is the
  anti-pattern this replaces. (A throwaway `tprint` probe during development is fine — it's
  ephemeral debugging, not a feature emitting observations.) Crisp form: **"use dashboard or
  logs."**

## Script writing rules (this is a custom Bitburner build)

This build is **not vanilla** — it's a 3.0.0+ fork that **removes/renames some `ns` API**. Coding
an `ns.*` call from memory of upstream Bitburner will compile and then crash at runtime with a
**REMOVED FUNCTION ERROR** popup (see the CDP section — the terminal won't show it). Before using
an `ns` function you haven't used in this repo, check `markdown/` or grep `src/` for a real call
site rather than trusting recall.
- **Number/RAM formatting:** `ns.formatNumber(x)` / `ns.formatRam(x)` are **removed** → use
  **`ns.format.number(x)`** / **`ns.format.ram(x)`** (grep `src/` for live examples).
- **Purchased servers:** vanilla `ns.getPurchasedServers()` / `ns.purchaseServer()` etc. are
  **removed** → use **`ns.cloud.*`** (see `cloudmanager.js`).
- When in doubt, the authoritative signatures for *this* build are in `markdown/bitburner.*.md`;
  the online NS docs describe upstream and will mislead you.
- **Identifier hygiene — the RAM analyzer misreads names, not just calls.** This build's static
  RAM calculator isn't purely call-graph-based: a **property access** whose name exactly matches
  a real, non-zero-cost `ns` method — e.g. `state.share` — gets charged as if it were `ns.share()`
  (2.4 GB), even when the receiver is plainly unrelated to `ns` and the method is never called.
  (Earlier-known variant: a literal `.exec(` substring anywhere charges `ns.exec`'s 1.30 GB
  regardless of receiver — `cloudmanager.js`'s `String.match` lesson.) Confirmed live 2026-07-14:
  `dashboard.js`'s `daemonPanel` read a JSON field via `state.share` and silently carried a false
  +2.4 GB (5 GB measured vs. 2.6 GB expected) until switched to bracket notation
  (`state["share"]`), which the analyzer doesn't flag. **Rule:** before naming a local variable,
  object key, or destructured property, check it isn't a real `ns.*` method/property name reachable
  from *anywhere* in the script's namespace (`ns`, `ns.ui`, `ns.cloud`, `ns.singularity`, …); if a
  field name must match one for schema/readability reasons, access it via bracket notation
  (`obj["share"]`) rather than dot notation. Always confirm any surprising `ramcheck.js` reading
  against this class of bug before assuming it's a real cost. **Local variables count too**
  (confirmed 2026-07-18): `const ls = liveStates.get(...)` in `daemon.js` silently billed
  `ns.ls`'s 0.20 GB on the *name alone* — 16.50 GB measured vs 16.30 expected — and renaming to
  `live` recovered it exactly. Short, innocuous-looking names are the dangerous ones: `ls`, `ps`,
  `rm`, `mv`, `run`, `kill`, `read`, `write`, `scan`, `hack`, `grow`, `share`, `exec`, `tail`.
  **The collision isn't limited to `ns.*` names — it reaches the browser global namespace too.**
  Confirmed live 2026-07-31: `bladeburnermanager.js` (phase-38 Slice B) named a local `window`
  (`const window = classifyWindow(...)`) and was silently billed **+25 GB** for the DOM `window`
  object (86.00 GB measured vs. 61.00 GB expected) — renaming to `windowKind` recovered it exactly.
  Add `window` (and by the same logic, other DOM/Node globals: `document`, `location`, `navigator`,
  `history`, `self`, `top`, `parent`, `global`, `process`) to the mental danger list alongside the
  `ns.*` names above.
- **Import bleed — importing a pure helper charges the whole module's `ns` surface.** The
  analyzer bills an imported module's *entire* `ns` footprint, not just the symbol you named.
  Confirmed 2026-07-18: `targetsmonitor.js` imported the four-line, zero-`ns` `isPrepped` from
  `scheduler.js` and was charged 0.60 GB for `hack`/`grow`/`weaken`/`getScriptRam`/`fileExists` —
  functions it never called (visible in `mem` as a bare `hack (fn)` line on a read-only script,
  which is the tell). **Rule:** keep pure helpers in a pure/cheap module (`common.js`) rather than
  importing them out of `ns`-heavy ones; when a script's `mem` breakdown lists a function its own
  source never mentions, suspect an import, not a bug in your code.

## Driving the live game (CDP)

Claude can reach **inside the running game** — not just push files to it. The Steam/Electron
build exposes the Chrome DevTools Protocol on `--remote-debugging-port=9222` (set as a Steam
launch option: `%command% --remote-debugging-port=9222`), and `tools/bb/` attaches over CDP to
**read and drive the rendered UI like a human**: read the terminal / menus / tail windows,
take screenshots, run terminal commands, click, type. This is **UI automation of the
front-end**, distinct from the RFA file bridge (which only moves files) — see
`docs/game-bridge.md` and `tools/bb/README.md`. It needs no engine changes.

- **How to use it:** `node tools/bb/cli.mjs <cmd>` — reads (`stats`, `read-terminal`,
  `read-tail`, `aria`, `body`, `locations`, `shot`) and writes that drive the live session
  (`terminal`, `goto`, `location`, `restart`, `close-tail`). Full verb list + args in
  `tools/bb/README.md`; `driver.mjs` holds the reusable helpers, `cli.mjs` is a thin dispatch.
  Selector rule of thumb: reach elements by accessible attribute (role/name, or `aria-label`
  for City-map glyphs), not screenshot coordinates.
- **Requires:** the game running **and** launched with the debug flag (the port is only open
  while the game runs). If `curl http://localhost:9222/json/version` fails, the capability is
  unavailable — say so, don't guess.
- **Read-only by default.** `read-*` / `stats` / `aria` / `locations` / `shot` are safe.
  `terminal`, `goto`, and `location` **drive the live session** (navigate / type), moving the
  player off their screen — use writes deliberately.
- **`run`ning a script needs to be on `home`.** The terminal's connected server is wherever
  the player/daemon last left it (often `darkweb` or a target) — a `run foo.js` there fails with
  "does not exist on &lt;host&gt;". Before running a check script, either send `home` first, or
  read the prompt (`read-terminal` / the `[host /]>` prefix) to confirm you're already home. Home
  can also be RAM-saturated by the daemon — if a `run` fails on RAM, that's a separate problem
  (free RAM / run elsewhere), not a wrong-server problem.
- **A script can fail *after* it starts, via an error popup the terminal doesn't show.** `run foo.js`
  printing "Running script..." only means it launched — a runtime exception surfaces as an in-game
  **RUNTIME ERROR modal**, not terminal text, so a `read-terminal` that looks fine can be hiding a
  crash. If a script doesn't produce its expected output (no log file, missing tprint lines), check
  the game for an error popup (`shot` / `aria`, or ask Kenneth) before assuming it worked or
  re-running blindly.
- **`cat <file>.txt` opens a blocking modal viewer, not terminal text** — so a `read-terminal`
  after a `cat` shows the file content *nowhere* (it renders in a popup the terminal capture can't
  see) and, worse, the modal blocks subsequent clicks/commands until dismissed (`cli.mjs dismiss`).
  Don't `cat` a file to verify its contents over CDP — it looks empty and wedges the UI. To read a
  synced file, read the repo copy (or its `dist/` mirror) directly; to confirm what actually
  reached the game, have a script `ns.read` it and `tprint`, or take a `shot`.
- **Installing augmentations throws a blocking popup that must be dismissed.** After an install
  fires (`installer.js`, or a manual `installAugmentations`), the game overlays a popup that swallows
  clicks until cleared — the same shape as a story popup, so `cli.mjs dismiss` clears it. Do it
  before any further CDP drive (a `read-terminal`/`goto` afterward will otherwise time out on the
  intercepted click). The install itself still succeeds regardless — confirm via the `ratchetlog`
  install line / a fresh `auginfo.js`, not the popup.

### Story popups — Claude clears them, no permission needed

A narrative toast (faction-recruit text, "Message received" notifications, lore interludes)
periodically overlays the whole UI and swallows every click until cleared — it has no named
"Close" button, so `dismissModal` doesn't catch it; Kenneth normally clears it by clicking
anywhere on it. **Claude clears these itself** via `node tools/bb/cli.mjs dismiss` (or
automatically — `goto`/`terminal`/`restart` call `dismissStoryPopup` before navigating, per
`tools/bb/driver.mjs`) — don't ask Kenneth to do it. Pre-authorized because the detector is
narrowly guarded, not a blind click: it only fires when the *entire* accessible tree is exactly
one nameless button plus narrative text and nothing else. A real confirm/buy/install dialog
always exposes multiple/named controls, and a normal game screen always has named nav buttons —
neither ever collapses to that shape, so the guard can't misfire onto a consequential action
(buying/installing/joining still requires the general confirmation rule below). If `dismiss`
reports "no modal/popup found" and a click still times out, that's a different, unhandled
overlay — stop and ask, don't guess at a wider click.

### Auto-restart changed scripts — no permission needed

When Claude edits a `src/` script and the change only takes effect after the in-game script is
restarted, **Claude restarts it automatically over the CDP terminal — without asking.** This
is pre-authorized; don't checkpoint for it.

- **Companion scripts** (`exec`'d by `daemon.js` — e.g. `cloudmanager.js`, `purchasescripts.js`):
  `node tools/bb/cli.mjs restart <script>` — kills it, closes any orphaned tail, then relaunches.
  As of Phase 24 every companion is headless (nothing to re-dock — `dashboard.js` is the only
  standing tail, and it self-closes its own tail via `ns.atExit` on every death the game runs
  callbacks for); this command still matters for the close-orphan step on scripts that can leave a
  tail behind — the short-lived self-tailers (`bootstrap.js`, `procureprograms.js`,
  `launchmonitor.js`) and headless residents whose prior/crashed instance may have orphaned one
  (`backdoorfactions.js`, `procureformulas.js` — both headless as of Phase 24, they never open a
  tail themselves). Prefer this over a raw `kill; run` for exactly that reason.
- **Core loop / imported libraries** (`daemon.js`, `scheduler.js`, `sampling.js`, `targets.js`,
  `hosts.js`, …): `node tools/bb/cli.mjs restart daemon.js` — same clean kill/close/relaunch; the
  daemon re-execs the loop on startup (it takes no launch args). Don't hand-restart the batcher's
  `hack`/`grow`/`weaken` workers — the daemon manages those.
- **Sequencing:** the edit must sync to the game first (viteburner push — the dev server must
  be running/connected), *then* restart. viteburner polls fast, so it's usually immediate; if a
  restart loads stale behavior, the push hadn't landed — restart again.

## Tracking work
Check `BACKLOG.md` before starting; keep it current. ⚠️ **Its only two entry kinds are `Bugs` and
`Ideas`** — this line used to say "In Progress / Next Up / Ideas" and was **stale by 8 days**
(BACKLOG deliberately dropped the driver/calendar role in 169bc93, 2026-07-12; corrected here
2026-08-08). **Do not add In Progress / Next Up sections back** — what to work on next lives in
this file's "Current goal" line, and active feature work lives in its phase docs. On
completion, move a dated, condensed entry to `docs/phases/CHANGELOG.md` — keep history out
of BACKLOG (**resolved entries are deleted there, not annotated in place**; git history is the
trail). **Update as part of the work, not after** — stage the BACKLOG/CHANGELOG edit in
the same commit as the change it describes, so it doesn't become a separate git cycle.

**Keep the engine reference docs current *without being asked*.** The gated references —
[`docs/gang-engine.md`](docs/gang-engine.md), [`docs/batcher-engine.md`](docs/batcher-engine.md),
[`docs/stock-engine.md`](docs/stock-engine.md), and (added 2026-07-29)
[`docs/bladeburner-reference.md`](docs/bladeburner-reference.md) +
[`docs/bn6-playbook.md`](docs/bn6-playbook.md) — are the durable homes for each subsystem's
architecture, strategy, and open questions, and the thing future sessions read to answer "what's
the plan / was this already tried." The Bladeburner pair is deliberately **split** where the others
are fused: `bladeburner-reference.md` is the immutable interface (should rarely change),
`bn6-playbook.md` is the churning strategy — so keep edits in the right one rather than merging them. When a feature or bug changes what one of them asserts — a
number that was an inference and is now measured, an open question that got answered, a target that
got superseded, a new landmine worth warning the next session about — **take the initiative to
update the affected doc in the same commit**, the same way BACKLOG/CHANGELOG get staged with the
change. Don't wait to be prompted, and don't assume "it's in the CHANGELOG" is enough — the
CHANGELOG records *that* something shipped; these docs carry the *current* state of the plan.
(Concrete miss, 2026-07-23: `gang-engine.md`'s BN2 clear-plan section was stale on four fronts at
once — the WD gate still called "an inference" after it read live at 15,000, the
"does rep survive an install" question still open after it was answered *no*, the M-bar still
"35–37" after it was re-derived to 45, and an `endgameHold` freeze that had deadlocked the ratchet
unmentioned — none caught until Kenneth asked whether it had been captured.)

## Communication
- **Summarize after acting.**
- **Flag unplanned deviations** (extra changes, moved/deleted files, scope creep, a
  different approach) — don't fold them in silently.

## Worktrees
`bitburner-scripts2` (sibling folder, branch `worktree-docs`) is a second worktree for
brainstorming, `BACKLOG.md`/docs edits, and phase-doc drafting — work there when you want to
touch documentation without risking the live checkout. It has no dev server of its own; it
must never start or stop `npm run dev` (see the engineering-conventions rule above).

**Merge `worktree-docs` back to `master` at the end of any session that committed to it** —
not the vague "when the docs work is ready," which never fires. Leaving commits on the branch
across sessions is how they orphan (three doc commits sat stranded off `master` until a manual
sweep found them, 2026-07-12). The live worktree (`bitburner-scripts`) performs the merge, on a
**clean** working tree, since `master` is only ever checked out there.

**Catch orphaned worktree commits early.** At session start (either worktree), run
`git log --oneline master..worktree-docs`. Any output is docs work stranded off `master` — merge
it back before it accumulates. This is the net that stops commits piling up unnoticed between
sessions; run it rather than assuming the branches are level.

**Sync from `master` before touching anything phase work might have changed.** Phase work
(fixes, close-outs) lands directly on `master` in the main worktree — `worktree-docs` never sees
it automatically, only via merge. Before reading or editing `BACKLOG.md` or any doc that phase
work might touch, run `git merge master` in this worktree first — not just once at session start,
since phase work can land on `master` mid-session too. Use `git merge`, **not `git fetch`**: the
worktrees share one local `.git`, so `master`'s ref is already current here — there is nothing to
fetch, and fetch only downloads commits, it never updates your working files (the stale thing).
Merge is what rewrites the files you're about to read. This worktree normally carries no commits
of its own that `master` doesn't already have, so it's a clean fast-forward, not a real merge.
Skipping this risks brainstorming/planning against stale state — e.g. re-flagging a bug that
already shipped a fix.

**This checkout (`bitburner-scripts`) needs the same check in reverse.** Worktrees share one
`.git` object database and branch refs, but not working-tree state — a commit `worktree-docs`
makes straight to `master` (valid whenever `master` isn't checked out here, e.g. mid-phase-branch
work) updates this checkout's `master` ref immediately, yet stays invisible until `master` is
actually checked out again. Before merging a finished phase branch back to `master`, run
`git log master` (or `git log HEAD..master` from the branch) to check for anything that landed
there from `worktree-docs` since the branch was cut — a normal `git merge` folds it in safely
either way, this is just so a docs-only commit from the other worktree doesn't go unnoticed.

## Git
Use version control: branch off `master`, commit, and merge your own work in interactive
sessions — no need to ask.
- **Ship gate:** a change with nothing to validate (docs, comments, text) can be
  committed/pushed/merged freely. A change whose spec/request carries a testable requirement
  (`npm test`, a RAM gate, `npm run verify:log`, a live run) ships only after that validation
  passes — then no further sign-off is needed. RAM/log/live checks depend on Kenneth's in-game
  run, so those changes wait on his validation; `npm test` I can run and clear myself.
- **Safety rail:** background/autonomous job sessions can't push or merge to `master` (enforced by
  execution mode) — prep the branch/PR and let Kenneth merge.

## Off-limits & sources
- Allowed sources: local game files, API docs in `markdown/` (**check first**), the
  official Bitburner GitHub repo.
- **Don't read game source to shortcut the puzzle** — docs/API fine, source-diving not.
- **Don't skip ahead or spoil progression** — help only with what's currently unlocked.
  **Carve-out:** static numbers/tables (costs, RAM, prices) are fine to look up.

## Task-specific detail
See `docs/INDEX.md` for on-demand references (logging patterns, dev-server / Remote API).
**All things batcher engine — `daemon.js`/`scheduler.js`/`targets.js`/`hosts.js`/`sampling.js`
architecture, lifecycle behavior across installs, strategy across BitNodes, open tripwires — live
in [`docs/batcher-engine.md`](docs/batcher-engine.md).** Read it before designing or recommending
anything batcher-related, the same way `docs/gang-engine.md` gates gang-related work.

**All things Bladeburner — the API surface/semantics/gotchas and what's still unmeasured live in
[`docs/bladeburner-reference.md`](docs/bladeburner-reference.md); the BN6 win-path decision, staged
plan, and open questions live in [`docs/bn6-playbook.md`](docs/bn6-playbook.md).** Read the
reference before writing any `ns.bladeburner` code (the whole API throws pre-join, and two
RAM-analyzer footguns are recorded there), and the playbook before proposing anything about how BN6
gets cleared.

**Check the script library before hand-doing a task or writing a one-off.** `docs/scripts.md`
indexes every `src/` script. A network/scan/**path**/aug/rep/backdoor task, or anything that
smells like a one-off, almost certainly has a script already — reach for it first. (Concrete
miss this exists to prevent: hand-walking a `connect` chain to `w0r1d_d43m0n` when `connect.js`
prints the path.)

**Owned augs + aggregate mults (no Singularity)** — `run auginfo.js` dumps the current owned-
augmentation stack (incl. NeuroFlux Governor level) and the aggregate player multipliers to a
timestamped `logs/auginfo-<epoch>.json` (+ a terminal summary). Reads `ns.getResetInfo().ownedAugs`
and `ns.getPlayer().mults` — both base-cost, no SF4 needed. `mults.hacking` is the level-mult /
`mults.hacking_exp` the exp-mult the Daedalus-2500 plan tracks. One file per run, so run it
before and after an install to diff.

**Aug SHOP lookup (SF4/Singularity)** — `run augcheck.js "Aug Name"` or `run augcheck.js faction
"Faction Name"` dumps the shop side `auginfo.js` can't see: rep requirement, price/base price,
selling factions, prereq chain, and stat mults, to `logs/augcheck-<epoch>.txt` + a terminal
summary. Use this instead of re-writing a throwaway Singularity query (or reading the in-game UI)
whenever you need aug prices/reqs. **Caveat:** `getAugmentationStats` returns numeric mults only —
pure-utility augs (focus-penalty removal, etc.) read all `1.0`, so non-mult effects need the
in-game aug description, not this. (Runs on `home`; Singularity RAM at SF4.3 is 1×.)

**Post-reset / augment-install recovery** — the faction-unlock sequence (backdoor→faction server
map, Daedalus/Netburners gates, and the **auto-unlock-not-auto-join** rule) is kept in
`docs/reset-protocol.md`. Read it before any faction-unlock or post-reset bootstrap work.

**Faction reputation, favor & donation** — the active BN1 lever (Daedalus 2.5m rep → The Red
Pill): how rep is earned (manual faction work + `ns.share()`), and the **donation shortcut**
(150 favor ≈ 462.5k rep + an install → then ~$1.5t buys the full 2.5m rep). Measured numbers +
sequencing catch in `docs/reputation-favor.md`. Read before any rep-grind or install-timing plan.

**Augmentation grafting** — `docs/grafting.md`. Grafting applies aug effects without a reset but
carries a compounding Entropy tax; the API needs SF10 (Kenneth has no Source-Files → manual UI
only), and it was **observed NOT available** at VitaLife/New Tokyo in this build's BN1
(2026-07-11, unlock condition unconfirmed). Read before proposing any grafting-based plan — the
short version is it doesn't help the BN1 finish.

**In-game settings state** — `docs/user-settings.md` is the single source of truth for the
non-default game **Options** toggles Kenneth has changed *that alter what Claude should expect
or do* (e.g. **Suppress Messages**, which makes story `.msg` arrive silently — no popup/terminal
line — though the file still lands on `home`). That file, not this line, holds the current
on/off state — read it before assuming a popup will fire or telling Kenneth to "watch for" an
in-game notification, since a suppressed event has to be *polled* for, not waited on.

**Docs layout:** `docs/` — Bitburner project/task references · `docs/metareference/` —
non-Bitburner learning material (Claude Code / AI-workflow docs) · `docs/phases/` — archived
shipped phase docs (index: `CHANGELOG.md`).
