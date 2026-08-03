# Phase 39 — Bladeburner as the primary win path (Stage 1: brainstorm)

**Status:** Stage 1 (features/decisions). No spec, no code yet.
**Branch:** `phase-38-slice-b` (dev server is watching this checkout — no branch switches).
**Supersedes:** Phase 38's *architecture*. Reuses its telemetry/dashboard plumbing.

**Read first:** [`docs/bladeburner-reference.md`](docs/bladeburner-reference.md) (the interface —
§5's 2026-08-02 sweep is the factual basis for everything here) and
[`docs/bn6-playbook.md`](docs/bn6-playbook.md) §1.0 (the decision and its trail).

---

## 0. Context — what changed on 2026-08-02

Kenneth flipped the win path to **Bladeburner-primary, batcher as its economy**. Three decisions
were taken up front and are **settled, not open**:

| # | Decision |
|---|---|
| **A** | **Install policy: "rep window, then one install."** Ratchet installs freely until a trigger, then freezes while Bladeburner grinds the aug rep tier; buy the tier in one purchase; install once; resume. |
| **B** | **Batcher = funding engine only.** The WD-gate hacking climb is dropped as a goal. Optimise for $/s. |
| **C** | **New Phase 39 engine**, reusing Phase 38's telemetry. Phase 38's stand-down architecture is the inverse of what primary needs. |

⚠️ **Phase 38's measurements are not evidence.** Its stamina floor is not enforced (state says
`floor: 0.5`; the event log shows `stamina hit 0` three times in an hour) and its telemetry reports
`rankGained: 0` / `dutyCycle: 1` while rank visibly moved 1,217 → 1,221. **We have never measured a
correctly-tuned Bladeburner engine.** That is the honest baseline.

---

## 1. The central finding: contracts cannot win, so this is a two-stage bootstrap

This is the most important thing the 2026-08-02 sweep produced, and it reshapes the whole phase.

🧮 **Ceiling analysis to rank 400,000** (from live probe numbers, 100% duty assumed throughout):

| Regime | rank/s | Days |
|---|---|---|
| Tracking as it runs today (54.9% success, 13s) | 0.0307 | **150.5** |
| Tracking at a *perfect* 100% success | 0.0558 | **82.6** |
| Tracking perfect **+ Overclock 90** | 0.4636 | 10.0 |
| Raid as it runs today (5.3% success, 64s) | 0.0125 | 368.4 |
| Raid at 50% success | 0.6005 | **7.7** |
| Raid at 90% success | 1.1267 | 4.1 |
| Raid at 90% **+ Overclock 90** | 9.3525 | **0.5** |

🔑 **Contracts are a dead end even when perfected.** 82.6 days at a success rate we cannot exceed.
Every viable path runs through **operations**, whose per-success rank payout is ~110× a contract's
(Raid 80.5 vs Tracking 0.73). Operations currently land 5.3% of the time.

**Therefore the plan is a deliberate two-stage bootstrap, not a single grind loop:**

```
STAGE A — bootstrap on CONTRACTS               STAGE B — tier-switch to OPERATIONS
· contracts have ZERO rank loss on failure  →  · Raid/Assassination pay 80.5 / 44.0 per success
· only cost is HP                              · rank compounds fast enough to reach 400,000
· purpose: bank RANK → SKILL POINTS            · purpose: actually clear the node
· exit when operation success chance clears
  the EV crossover
```

Stage A is not the win path; it is **the financing round for Stage B**. Naming that explicitly is
what stops the engine from optimising Stage A's rank rate as if it were the goal — which is exactly
what Phase 38 did.

---

## 2. The design thesis

**The bottleneck is not action selection. It is that every multiplier sits at zero investment.**

| Lever | Now | Ceiling |
|---|---|---|
| Overclock | 17 / 90 (×0.83 action time) | 90 / 90 (×0.10) — **8.3× throughput** |
| Stamina duty cycle | ~30% | ~95% |
| Stamina success penalty | 49.9% | 0% |
| Team size | **0** | Operations/BlackOps only |
| `bladeburner_*` aug mults | all **1.00** | 12.5k–62.5k rep tier |
| Skill points banked | **0** (407 earned, all spent, diffusely) | 1 SP per 3 ranks |

So Phase 39's engine is an **investment controller**, not a scheduler. Its job is to decide *what to
buy with rank*, and only secondarily *what action to run*.

---

## 3. Proposed decisions

### D1 — Own the player-action slot; yield only on explicit, bounded request

Phase 38 stood down unconditionally for `backdoorwd.js`, `backdoorfactions.js`, `studybootstrap.js`.
Under primary that inverts. Proposed:

- `backdoorwd.js` — **no longer relevant** (decision B dropped the WD gate). Do not yield.
- `backdoorfactions.js` — still matters (faction unlocks feed the ratchet's aug buying). Yield, but
  only for a **bounded window with a hard timeout**, and log every yield as forgone rank.
- `studybootstrap.js` — yield during the post-install re-bootstrap only.

**Rejected:** keeping unconditional stand-down. It is what produced Phase 38's "zero data" state on
2026-08-01, and under primary it means the win path idles for a support script.

### D2 — Stamina band: hover at 50%, never below, never rest past it

Direct consequence of the closed-form penalty `successMultiplier = min(1, fraction / 0.5)`:

- **Run** while stamina ≥ 50% of max.
- **Rest** (Hyperbolic Regeneration Chamber) when below; **resume at ~55%**, not 80% and not 100%.
- **Never** allow stamina to reach 0 — the game cancels the action, `getCurrentAction()` returns
  `null`, and an engine tracking only its own intent sits idle indefinitely.

**Rejected:** drain-to-zero-then-recover (today's de-facto behaviour). Costs ~18 minutes of recovery
and runs the entire descent at up to 90% success penalty.
**Rejected:** rest to full. There is provably zero benefit above 50%.

### D3 — Choose actions by expected value, with a hard net-negative floor

Recompute each cycle: `EV = p·rankGain − (1−p)·rankLoss`, with `p` adjusted by the current stamina
multiplier. **Never start an action with EV ≤ 0** — two are net-negative right now (Stealth
Retirement, Assassination). Phase 38 ranked by rank-per-success, which is wrong in its own way, and
ran Investigation over Tracking for extended stretches.

### ❓ D3-OPEN — is the denominator TIME or ACTIONS? (unresolved, was briefly claimed as settled)

⚠️ **An earlier version of this section confidently "CORRECTED" D3 to score rank-per-ACTION, on the
strength of a stamina measurement that turned out to be contaminated. That correction is WITHDRAWN**
— see Q10. The question is genuinely open and it matters a lot:

- **If stamina is spent per SECOND** → score `EV / actionTime` (rank/sec). Current behaviour.
  Tracking (0.0306) leads; Raid is 5th.
- **If stamina is spent per ACTION** → score `EV` undivided, because the resource an action consumes
  is *one action* and sustainable throughput is `staminaRegen / staminaPerAction`, independent of
  duration. That **inverts the ranking**: Raid 0.807 vs Tracking 0.398 — Raid would be 2× better
  *at its current 5.3% success chance*, and the Stage A→B "crossover" would be behind us, not ahead.

🔑 **This is the highest-leverage open question in the phase** — bigger than Overclock, which was
merely the reason it got asked. It decides what the engine optimises for, and the two answers point
at opposite actions. **Do not let the rank/action table above be quoted as a finding**; it is the
consequence of an unverified premise.

⚠️ Even if per-action proves out, switching to Raid needs Q11 first: HP is a second consumable and
HP cost per failed *operation* is unmeasured.

### D4 — Take manual control of action level; stop trusting autolevel

Autolevel pushed Tracking to **23/23** and Investigation to **8/8**, collapsing success chance
(Investigation: 46 ✓ / 301 ✗). Level raises payout *and* difficulty, so there is an EV optimum that
is **not necessarily max**.

⚠️ **Implementation catch:** `getActionEstimatedSuccessChance(type, name, sleeveNumber?)` takes **no
level argument**, so hypothetical success at another level cannot be queried. It must be probed by
`setActionLevel` → read → restore. That is a *mutating* call, so the level search is engine
behaviour, not a read-only probe.

### D5 — Skill-point policy — ✅ Q1 MEASURED 2026-08-02, and it is good news

`bladeburnerskillprobe.js` was extended to sweep the real cost curve. **The earlier ~15,000 SP /
~45,000 rank extrapolation was roughly 4× too pessimistic in the range that matters.**

| Investment | Cost (rank) | Operation success multiplier |
|---|---|---|
| *(current: BI 6, DO 5)* | — | ×1.42 |
| BI + DO both **L10** | **477** | ×1.82 (1.29× better) |
| BI + DO both **L25** | **3,915** | ×3.50 (**2.47× better**) |
| BI + DO both **L50** | **15,945** | ×7.50 (5.30× better) |
| BI + DO both **L75** | **35,850** | ×13.00 (9.18× better) |
| **Overclock 17 → 90 (max)** | **16,908** | ×0.10 action time (8.3× throughput) |

🔑 **The early rungs are extraordinarily cheap.** 477 rank — which we earn in a few hours — buys a
29% success improvement. 3,915 rank buys **2.5×**. Against a 400,000-rank target these are rounding
errors, and unlike everything else in this phase **skills and rank survive installs**.

**Applied to Raid** (currently 5.3% success at the ×1.42 multiplier, so ~3.74% base): L25 → ~13%,
L50 → ~28%, L75 → ~49%. That is the Stage A→B crossover, and it is **~4,000–16,000 rank away, not
45,000**.

**Policy: success skills first (Blade's Intuition + Digital Observer + Tracer), in small increments,
starting immediately at L10 → L25.** Tracer is included because it lifts *contracts*, which is what
Stage A actually runs — the same 3,915-rank rung takes Tracking from 54.9% toward its ceiling.

⚠️ **Overclock is HELD at level 17 pending Q10, which is UNRESOLVED.** An earlier version of this
section said "Q10 ANSWERED — DO NOT BUY IT"; that was based on a contaminated measurement and is
**withdrawn**. The hold stands either way — spending 16,908 rank on a multiplier whose value is
unknown is not defensible — but the reason is *"we don't know yet"*, not *"we measured it and it's
worthless"*. `OVERCLOCK_HOLD_LEVEL` in `bladeburnermanager.js` carries the same caveat.

**Rejected:** today's diffuse spread across all 12 skills (49 levels, 407 SP). It bought ×1.18 total
success and ×0.83 action time — neither near a threshold that changes anything.
**Rejected:** Overclock-first. Cannot be justified until Q10 is answered.

### D5a — 🔴 DECISION REVERSED 2026-08-02: do NOT chase Bladeburner augs, do NOT freeze installs

**This supersedes Decision A (§0), D8, D10's ordering, and Q2.** Kenneth asked whether the install
freeze should be time-gated at 8h or 24h. **The right answer is neither — the premise is wrong**, and
the measurement above is what shows it.

| Lever | Buys | Costs |
|---|---|---|
| **Skills** — BI+DO to L25 | **×2.47** on operation success | **3,915 rank**, ~a day of grinding, **persists across installs** |
| **Augs** — the entire `bladeburner_success_chance` tree | **×1.28** | **~$250b+**, **62.5k faction rep ≈ 28 days**, and the rep **resets on every install** |

🔑 **Skills beat the entire Bladeburner aug tree by roughly 2× on effect, at a fraction of the cost,
in a currency that survives resets.** The augs are not worth a multi-day install freeze; they are
barely worth buying at all at this stage.

**Consequences — this dissolves the phase's biggest structural problem:**
- **The install↔rep deadlock is not a deadlock.** It only existed because we assumed we needed the
  aug tier. We don't.
- **The ratchet installs freely.** No freeze, no trigger, no time gate. Q2 is closed, not deferred.
- **D10's money split collapses** to "the ratchet keeps buying hacking augs for income compounding" —
  there is no Bladeburner claim on money worth arbitrating yet.
- **Installs become nearly free for Bladeburner**: rank and skill points persist, and combat stats
  regrow from Bladeburner actions on their own (measured: 1 → 171/171/202/195 in 26h).

⚠️ **What this does NOT dissolve: D11a's regular-faction-rep competition.** That one is about the
player-action slot, not about Bladeburner rep, and it is still live and still unaddressed.

**Revisit trigger:** if income ever makes the aug tier trivially affordable *and* a natural
no-install stretch appears, buy it opportunistically. Do not engineer a window for it.

### D6 — Recruit a team

`Recruitment` is 4m22s at **100% success** and has never been run. Teams apply to Operations and
BlackOps only — precisely the Stage B actions. Team members can be **lost** (the panel tracks it), so
this is a consumable, not a one-time purchase.

### D7 — HP / hospitalisation guard

`maxHp = 10 + floor(defense/10)` = **27** at defense 171. Failed contracts cost 3 HP → **9 failures
hospitalises**. Counter is at **81 hospitalisations / $837.4m lost**. Hospitalisation costs money and
interrupts the action. Guard on HP, rest in HRC (which restores 2 HP/min alongside stamina), and note
that **defense investment raises the ceiling**.

### D8 — Install coordination: the rep window (decision A)

The Bladeburner engine publishes a `repWindowActive` flag; `augfarmer.js` / `installer.js` honour a
freeze. **Entering the window is Q2.** ⚠️ Restate at execution time: freezing the ratchet stalls the
mult climb *and* the income curve that pays for the augs.

### D9 — Rebuild telemetry

Phase 38's rank accounting is broken, so this is not optional polish. Needs: rank/s over real
wall-clock, true duty cycle, a stamina histogram, per-action attempt/success counts, and **EV
predicted vs realised** (the one field that would show the model drifting). Log to file per the
observability convention; a dashboard panel already exists and can be re-pointed.

### D10 — Money-split arbitration between regular augs and Bladeburner augs

**Added 2026-08-02 — Kenneth flagged this as an unaddressed competition, and he was right.** Decision
B calls the batcher a "funding engine" but never says *what the funding is spent on*, and the ratchet
currently takes **everything**.

The competition is now real in a way it wasn't before. Hacking augs used to be **terminal** (they
were the win condition); under decision B they are **instrumental** — worth buying only insofar as
they compound income. Bladeburner augs are the ones that buy success chance and stamina, at
**$1.375b–$27.5b base** apiece.

**Proposed rule, in priority order:**

1. **Fleet + income-critical spend** — untouched. This is what generates everything else.
2. **Bladeburner augs, once the rep gate for a tier is met** — because rep is the scarce, non-buyable
   input (see D11's note on rep asymmetry); if rep is in hand and money isn't, the rep decays to
   nothing on the next install. **Money is recoverable; a burned rep window is not.**
3. **Hacking-mult augs / NeuroFlux** — with what's left, judged purely on income compounding, not on
   progress toward the (abandoned) WD gate.

**Rejected:** keeping the ratchet's current all-or-nothing claim. It optimises for a target we no
longer hold.
**Rejected:** a fixed percentage split. The rep gate is lumpy and time-boxed; a static split either
starves it at the wrong moment or idles capital.

⚠️ **Interaction with D8:** the rep window and the money split are the same decision seen twice — the
window is *when* to stop installing, the split is *what to buy while stopped*. Spec them together.

### D11 — Population and chaos sustainability; city rotation as the primary lever

**Added 2026-08-02 — Kenneth flagged this and it is the sharpest gap in the phase.**

🔑 **Grinding rank consumes the resource that enables grinding rank.** `Bounty Hunter`, `Retirement`,
`Sting Operation`, `Raid`, `Stealth Retirement Operation` and `Assassination` all **decrease Synthoid
population**; most **raise chaos**; and `Raid` outright **requires a community to exist** in the
current city. `Incite Violence` regenerates contract/operation inventory but raises chaos in **all**
cities. Chaos also rises spontaneously from world events, and population migrates between cities on
its own.

**We are currently fine by luck, not policy.** Sector-12 reads pop **847.7m**, **31** communities,
chaos **0.000**, with ~2,000+ contracts and 598–1,508 operations remaining. ⚠️ **Stage B is exactly
when consumption jumps** — operations consume more per action and are the whole point of the tier
switch.

**Proposed model:** treat per-city population/communities/chaos as a **depleting stock with
regeneration**, not a static property. The engine tracks all three per city and rotates out of a city
when any of: communities fall below the `Raid` threshold, chaos exceeds the Diplomacy-viable band, or
inventory runs low — then returns after the stock recovers.

**City rotation is the primary lever and it has never been tested** — every cycle since joining has
run in one city. It was logged as the one untested lever on 2026-07-30 and never revisited. It
plausibly addresses population depletion *and* chaos *and* inventory simultaneously, which is why it
outranks the per-symptom responses already in the engine (`Incite Violence` for inventory, `Diplomacy`
for chaos).

⚠️ **Unknown that gates the design:** `switchCity` has **no documented cost, travel time, or
interaction with the running action** (reference §6). Measure before building a rotation policy on
top of it — if it interrupts the action or carries a cooldown, the policy shape changes.

**Rejected:** staying in one city and absorbing depletion. That is today's implicit policy; it is
untested at Stage B consumption rates and has no failure signal.

### D11a — Regular faction rep IS a real competition (corrected 2026-08-02)

🔴 **This section originally claimed regular-faction rep was "money-buyable via the donation
shortcut, so it doesn't compete." Kenneth pushed back that donation is late-game, and he is right —
the claim is wrong for BN6's current state and it was an input to D10's priority ordering.**

**Why it's wrong:** donation requires **150 favor**, which needs roughly **462.5k rep plus an
install** with that faction. Live favor readings in BN6 (2026-08-02): Chongqing **0**, Ishima **0**,
New Tokyo **0**, Tian Di Hui **0**, Bladeburners **0**, CyberSec **7.10**. Favor does **not** carry
across a BitNode entry. **Donation is unavailable here and will be for a long time.**

**So the real picture:** regular faction rep in BN6 must come from `ns.singularity.workForFaction`
(`augfarmer.js:2873`) — which is a **player action**, and therefore competes with Bladeburner for
the single action slot, exactly as Kenneth suspected.

**Measured right now:** Bladeburner holds the slot **continuously** — the in-game event log shows an
unbroken contract cadence with no preemption gaps — so the ratchet is getting **~0 faction-work
time**. Regular rep is creeping at roughly **2.5 rep/min** (Chongqing 11,391 → 11,506 over 46 min),
which against 462.5k for favor is effectively zero.

⚠️ **It is not biting yet, but it is a fuse, not a non-issue.** The ratchet is still buying augs
(5 installed / 3 queued), so it has enough rep for its current tier. It will become blocking as
requirements climb, and **the failure mode is silent** — the ratchet just stops finding affordable
augs, and the batcher's income growth flattens, starving the very engine that funds Bladeburner.

**Consequences for the rest of the phase:**
- **D1's yield policy is more load-bearing than written.** It must include bounded yields for
  `workForFaction`, not just `backdoorfactions.js`.
- **D10's priority ordering needs a rep-starvation guard** — if the ratchet is rep-blocked, action-slot
  time is worth more to it than to Bladeburner, because it gates *all* future income.
- **This raises the value of `The Blade's Simulacrum`** (Q7), which removes the slot conflict outright.
  Its $1.029t price is still far out of reach, but it is no longer a luxury — it is the structural fix.
  **Q7's default flips from "no" to "revisit whenever income makes it plausible."**

**New instrumentation need (folds into D9):** log slot-time allocation — how much wall-clock each
claimant got, and how much rep the ratchet forwent. Without it this fuse burns invisibly.

---

## 4. Open questions — each with a default and a date

| # | Question | Default if unanswered | By |
|---|---|---|---|
| **Q1** | ✅ **ANSWERED 2026-08-02.** Overclock 17→90 = **5,636 SP / 16,908 rank**. BI+DO to L25 = **1,305 SP / 3,915 rank** (×3.50 op success); to L50 = **15,945 rank** (×7.50). Full ladder in D5. The earlier ~45,000-rank extrapolation was ~4× too pessimistic. | — | Done |
| **Q2** | ~~Rep-window trigger~~ 🔴 **CLOSED 2026-08-02 — question dissolved, see D5a.** Skills beat the entire Bladeburner aug tree ×2.47 vs ×1.28, cost 3,915 rank vs ~$250b + 28 days of resettable rep, and persist across installs. There is no reason to freeze installs, so there is no trigger to design. | **No freeze. Ratchet installs freely.** | Closed |
| **Q10** | ❌ **UNRESOLVED after SIX attempts (updated 2026-08-02, ~8pm) — was briefly and wrongly marked ANSWERED.** Is stamina spent per action or per second? The one run that produced numbers was contaminated by slot contention; five clean-retry attempts all failed the same way. **Root cause: FOUR scripts contend for the single player-action slot** — `bladeburnermanager.js` (stopped the action every ~1s while "paused"; fixed), `augfarmer.js` (grabs the slot the instant the manager releases it; fixed via the probe claiming the slot itself), and `backdoorfactions.js`/`backdoorwd.js` (`installBackdoor` takes the slot; **not** fixed). ⚠️ **Correction 2026-08-02 8:28pm:** live-checked `backdoorwd.js` directly — it is currently a no-op (WD doesn't exist yet under decision B, so it idle-polls with `active:false` and never touches the slot). It is **not** attempts 5/6's actual cause; those two show `startAction` returning `true` with `getCurrentAction()` reading `null` for all 30 samples and zero successes, same as before — the real culprit is still unidentified, and `backdoorfactions.js` (confirmed running via `ps` at the same time) is the more likely live contender, not `backdoorwd.js`. Also learned: **`startAction` returned `true` while `getCurrentAction()` read `null`** — the boolean is not proof the action runs. **Next cheap step, not yet done:** `slotconflictprobe.js`'s verdict logic was rewritten after its one run (2026-08-01) gave a wrong answer, but it has never been re-run since the fix — re-running it (~45s, self-cleaning, no rank/HP risk) would give a real current answer on whether Bladeburner actions and singularity player-work share a track, which bears directly on this question. | **Overclock stays held.** Retry only after quiescing all four claimants (and re-running `slotconflictprobe.js` first); the probe now emits `valid`/`startActionReturned`/`preemptedSamples` so a bad run fails loudly. **Low priority** — gates only Overclock, ~16,908 rank away. | Deferred |
| **Q11** | 🔴 **NEW — HP cost per failed OPERATION.** D3 now ranks Raid first on rank/action, but operations cost HP *and* rank on failure and the HP figure is unmeasured. Contracts are known (3 HP; max HP 27 ⇒ 9 failures hospitalise). For Tracking, HP already binds harder than stamina (~4.1 HP/min consumed vs 2 HP/min regen), so this could easily dominate. | **Do not switch the engine to Raid until measured.** Extend the same self-pausing probe: run Raid for a fixed window, record HP deltas per failure. | Before any tier switch |
| **Q3** | Is max action level EV-optimal, or lower? | Probe via `setActionLevel` sweep on Tracking first (zero rank downside). | During implementation |
| **Q4** | Marginal success-chance value per team member, and the loss rate. | Recruit to 5, measure, extrapolate. | During implementation |
| **Q5** | **[Rewritten 2026-08-02 — was "stay in Sector-12, revisit on trigger", which treated rotation as a chaos response rather than the sustainability mechanism it is (D11).]** What is the rotation policy? Specifically: (a) what does `switchCity` actually cost — travel time, money, does it interrupt the running action? (b) what are the per-city floors for communities / chaos / inventory that trigger a rotation out? (c) how fast does population and inventory regenerate in an abandoned city? | **Measure `switchCity`'s cost first** — it gates the whole design. Then rotate on the first floor breached, starting with the `Raid` community requirement. Do **not** default to staying put; that is an untested policy at Stage B consumption rates. | (a) before spec · (b)+(c) during implementation |
| **Q6** | Do General actions other than HRC consume stamina? | Assume they do; only HRC is trusted for recovery. | Cheap experiment |
| **Q7** | Buy `The Blade's Simulacrum` to free the player-action slot? Rep 1.25k (met), **$1.029t**. | 🔴 **Default flipped 2026-08-02 (was "No — the slot conflict is survivable").** D11a shows the conflict is *not* survivable indefinitely: with donation unavailable in BN6 (favor ~0 everywhere), regular faction rep needs `workForFaction`, which Bladeburner is currently starving to ~0. This aug is the structural fix, not a luxury. **Revisit whenever income makes it plausible**, and price it against the cost of a rep-starved ratchet rather than against rank. | Standing |
| **Q9** | **Rest for HP, or accept hospitalization as a paid instant full-HP reset?** HP regen is **2/min** (HRC) while sustaining ~55%-success Tracking costs **~6.2 HP/min**, so HP — not stamina — is now the binding constraint on duty. A hospitalization is an *instant* reset to full at ~**$10.4m**. | Rest (current behaviour, D7 + the hysteresis latch). ⚠️ But the arithmetic favours paying: hospitalization buys roughly **3× the duty cycle** for money we increasingly have, and Tracking itself earns ~$693k a contract. **Measure both policies before defaulting.** | During implementation |
| **Q8** | What is the actual Stage A → Stage B crossover condition? | Switch when operation EV exceeds best-contract EV, computed live — not a hardcoded rank. | In spec |

---

## 5. Checkpoints

Bars are stated against **wall-clock** rank/s, not held-sec — Phase 38's held-sec framing let a
0%-duty engine report a 100% duty cycle.

- **C1 — 24h smoke, with the corrected engine.** Sustained **≥ 0.007 rank/wall-s**.

  🔴 **Corrected 2026-08-02 — this bar was originally written as ≥ 0.05 rank/wall-s, which is
  unreachable and would have failed a correctly-working engine.** The error was assuming near-full
  duty. Measured: Tracking drains stamina at **~6.55/min net** while HRC regenerates at
  **~2.35/min**, so the sustainable **duty cycle is ~26%** and perfectly-tuned Tracking tops out at
  `0.0307 × 0.26 ≈ 0.008 rank/wall-s`. C1 therefore tests "the engine is not broken", nothing more.
  ⚠️ **Contracts alone at that rate are ~570 days** — which is the real reason C2, not C1, is the
  checkpoint that matters.

  🟢 **One genuine tailwind: duty cycle self-improves.** Max stamina and stamina regen both scale
  with agility, and Bladeburner actions grow agility for free — dex/agi already run ahead of str/def
  (202/195 vs 171/171) purely from action exp. The 26% is a floor, not a constant.
- **C2 — Stage B crossover reached.** Operation EV exceeds best-contract EV on live numbers. This is
  the real go/no-go: it is the moment the 82.6-day contract ceiling stops binding.
- **C3 — 1-week viability.** Sustained **≥ 0.35 rank/wall-s** (≈ 2 weeks to rank 400,000 from here).
  Below this, the node is a multi-month grind and the fallback conversation reopens with evidence.

⚠️ **If C2 is not reached, Phase 39 has failed regardless of what C1 reads** — a perfectly-tuned
contract grinder is still an 82.6-day path.

---

## 6. Explicitly out of scope

- Reviving the WD-gate hacking climb (decision B). The arithmetic stays in `bn6-playbook.md` §1.
- Sleeve interop — needs SF10, which we do not hold.
- Any change to the batcher's internals beyond retargeting the ratchet toward $/s.
- BN7 planning. ⚠️ When it comes: `BladeburnerRank` 0.6 and `BladeburnerSkillCost` 2.0 there, and
  `joinBladeburnerDivision()` under SF7.3 permanently locks out Stanek's Gift.

## 7. Logged dropped objections

Per CLAUDE.md, objections raised and overridden are recorded rather than erased:

1. **The install↔rep deadlock is scheduled, not solved** (§3 D8). Decision A picks a policy; the
   trigger (Q2) is undefined. If Q2 lands badly, the ratchet freezes on a stalled income curve.
2. **The ~50× multiplier stack is entirely undemonstrated.** It is read off the game's own ceilings.
   Every prior Bladeburner projection in this node has been wrong in both directions.
3. **Rank 1,221 is 0.3% of 400,000** after roughly four days of nominal effort. The path is being
   chosen on multiplier *potential*, not on any observed rate.
