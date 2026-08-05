# BN6.1 playbook (Bladeburners)

The strategy guide for this node: which win path, why, in what order, and what we've decided
versus what we're still waiting to measure. The **interface** it's built on is
[`bladeburner-reference.md`](bladeburner-reference.md) — read that first if you're about to write
code. This file is the one that churns; that one shouldn't.

**Entered BN6.1 on 2026-07-29**, straight off the BN5.1 clear. Owned SF: `{1:3, 2:1, 4:3, 5:1}`.

> **Epistemic status, stated up front because it's load-bearing.** As of **2026-08-02** the win
> path is **Bladeburner-primary** (third and current position — see §1.0). The *direction* is well
> supported: BN6's multipliers penalise hacking four ways and Bladeburner zero ways, and that's now
> measured, not argued. The *timeline* is **not** established — but it has **improved, and the old
> figure should not be quoted unchecked**: as of 2026-08-04 the engine's own
> `rates.cumulative.rankPerWallSec` reads **0.0664 at 99% duty → ≈68 days linear** (1h window:
> 0.0876 → ≈52 days), against the **~150 days** this block previously asserted from the 0.0307
> rank/s Tracking measurement. ⚠️ That is again *the engine measuring itself*, so treat it as a
> promising unconfirmed reading, not a settled number (see §6's independent cross-check and §8's
> 2026-08-04 entry). The ~50× multiplier stack that makes the path viable is
> **entirely undemonstrated** — every factor in it is a ceiling read off the game's own numbers, not
> an observed rate. ⚠️ **Worse, the engine that produced our recent rank data has known bugs** (Phase
> 38's stamina floor isn't enforced; its telemetry reports zero rank gained while rank moves), so the
> honest state is *"we have not yet measured a correctly-tuned Bladeburner engine."* Every number
> below is labelled ✅ verified, 🧮 computed, or ❓ unknown. **Do not let a ❓ get quietly promoted to
> a planning assumption** — that's the Phase 27 failure mode, and it cost most of a session.

---

## 1.0 CURRENT DECISION (2026-08-02) — Bladeburner-primary, batcher as its economy

**This supersedes both §1 (2026-07-29, Bladeburner-primary) and the 2026-07-30 flip to
hacking-primary. Read this subsection first; the rest of §1 is retained for its arithmetic.**

Three positions have been held on this question. Each flip was driven by new evidence, which is the
bar for reopening a settled call — record it that way, not as vacillation:

| Date | Position | What moved it |
|---|---|---|
| 2026-07-29 | Bladeburner-primary | Interface read; rank/SP persist across installs |
| 2026-07-30 | Hacking-primary | Live trial measured 0.0144 rank/s → ~10.5 months |
| **2026-07-31** | *(trial marked UNSOUND)* | In-game panel read: the trial's model was wrong on four counts |
| **2026-08-02** | **Bladeburner-primary** | **BN6's multipliers measured: hacking penalised 4×, Bladeburner 0×** |

### Why the flip is justified — measured, not argued

BN6's multiplier table is a deliberate anti-hacking design, and it leaves Bladeburner untouched:

| Axis | BN6 multiplier |
|---|---|
| `HackExpGain` | **0.25** |
| `HackingLevelMultiplier` | **0.35** |
| `ServerMaxMoney` | **0.20** |
| `CloudServerSoftcap` | **2.0** |
| `BladeburnerRank` | **1.0** |
| `BladeburnerSkillCost` | **1.0** |
| combat exp | **no penalty at all** |

✅ **Live observation.** Install #37 reset everything to base. **26 hours later: hacking 1 → 167,
combat 1 → 171/171/202/195.** The combat climb was *free* — entirely Bladeburner action exp — so the
combat-100 gate is a one-time cost, not a per-install tax. **That part is solid.**

🔴 **Correction 2026-08-02 — do not repeat the comparison this originally carried.** The first draft
set the 167 against "the same engine reached hacking 4,867 post-install in BN5." **That is not
apples-to-apples**: 4,867 was install #35's *pre*-install level, taken late in BN5 at M = 6.43 with a
mature fleet, against BN6's *first* install at M = 1.59 with a fresh one. The direction survives; the
magnitude was inflated, and it was the headline evidence for the flip, so the inflation mattered.

**The clean comparison is the multiplier table**, not the anecdote:

| | BN5 (cleared in ~5 days) | BN6 |
|---|---|---|
| `w0r1d_d43m0n` gate | 4,500 (150%) | **6,000** (200%) |
| `HackingLevelMultiplier` | **1.00** | **0.35** |
| `HackExpGain` | 0.50 | **0.25** |
| `ServerMaxMoney` | 1.00 | 0.20 |
| Aug money cost | **200%** | **100%** ← BN6 is *better* |
| `CloudServerSoftcap` | 1.20 | 2.00 |

🧮 BN6 needs roughly **5× the hacking mult BN5 cleared at** (M ≈ 28–37 vs BN5's achieved 6.43).
⚠️ **But note the counter-pressure, which cuts against this section's own thesis:** BN6's *ratchet
economics are better than BN5's* — no aug-cost penalty where BN5 carried 200%, and identical
effective steal (§2). **The batcher path in BN6 is real, not blocked.** Honest estimate: **10–20
days**, versus ~5 for BN5. It is slower, not foreclosed — and that is the fact §1.2 has to reckon
with.

## 1.1 So is the batcher actually the better bet? — the honest answer

**On raw expected time-to-clear BN6, probably yes.** Batcher ≈ **10–20 days** against a
Bladeburner path measured at **~570 days** for contracts alone, needing a 40–70× improvement that is
real on paper and **entirely undemonstrated**. Anyone reading §1.0 as "Bladeburner is faster" has
read it wrong. Three things justify taking it anyway:

1. **The two engines are complements, not substitutes, and the dependency runs one way.** Every
   Bladeburner multiplier is bought with money — augs ($1.375b–$27.5b base), fleet, and
   hospitalisation costs ($837m burned so far). **There is no version of Bladeburner-primary that
   does not need a strong batcher. The reverse is not true.** So "batcher secondary" understates its
   role: it is on the critical path either way, and near-term it deserves *more* attention, not less.
2. **The real question is what we own afterwards, not which clears faster.** The counter-map placed
   BN6 here *specifically to build the Bladeburner engine*, because BN7 follows and the
   hacking-walled back half (BN9/BN10/BN13/BN14) needs a working alt-destroy engine. **Clearing BN6
   by hacking yields SF6 and banks nothing new.** This is a strategic-value argument, not a speed
   argument, and it should be made as one rather than dressed up as a timeline claim.
3. **Duty cycle self-improves.** Max stamina and regen both scale with agility, and Bladeburner
   actions grow agility for free (dex/agi already lead str/def: 202/195 vs 171/171). The measured 26%
   is a floor, not a constant.

⚠️ **Because this is knowingly the slower expected path, it carries a hard tripwire:** if the Stage B
operation crossover (§5 C2) is not reached within **~2 weeks**, revert to batcher-primary. Default is
revert, not extend. Logged so a bad call leaves an artifact rather than a memory.

🚩 **C2 FIRED 2026-08-03 7:34:34 PM — the tripwire above is NOT triggered; the crossover was
reached.** `Raid` overtook `Tracking` per-second **0.2550 vs 0.0854 (3.0×)** and has held (3.1×).
It was caused by moving Sector-12 → Volhaven: Raid was suppressed by Sector-12's 177 chaos and 21
communities (it requires a Synthoid community), versus Volhaven's 3.4 chaos and 75. **The Stage-B
gate correctly stayed shut** — EV is not a safety property, and Q11 (HP cost per failed operation)
is still unanswered. **Next step is S14.2 step 1: request a fresh go-ahead for a bounded live Q11
measurement.** Until that is answered the engine keeps running Stage A, and if it comes back
unmeasurable a third time the ~2-week revert-to-batcher default still applies.

**Phase 39 (`phase-39-bladeburner-primary.spec.md`) is the engine that implements this** — telemetry
rebuilt from wall-clock (S1), bounded slot yields (S2), the two structural safety gates (S4 Overclock
held, S5 Stage B gated shut), and `computeCrossover` computing C2's evidence continuously **even
while Stage B stays gated shut** (S5.1) — the phase's real deliverable is reachable without ever
risking HP on an unmeasured operation. ⚠️ **What happens when C2 fires is a node-level branch, spelled
out in the spec's S14.2, not a Bladeburner-engine detail:** C2 firing does **not** open the gate by
itself. The required next step is (1) request a fresh go-ahead for the Q11 HP-cost measurement — C2
firing is the trigger to *ask*, with evidence in hand, per the standing "one round of live testing,
then ask again" limit — then (2) if the go-ahead is declined, or Q11 comes back unmeasurable again,
**the gate stays shut and this same ~2-week tripwire applies**: revert to batcher-primary. Only a
recorded Q11 answer opens a path past this.

### The strongest objection — and it is not resolved, only scheduled

**The install↔rep deadlock.** Bladeburner faction rep resets on every install and can *only* be
earned by Bladeburner actions (no donation, no `workForFaction`). The success-chance augs sit at
**12.5k–62.5k rep**; rep accrues at a measured **0.086 rep/s** → **8.4 days at 100% duty, ~28 days at
the ~30% duty stamina currently allows**. The ratchet installs roughly daily. These are directly
incompatible.

**[SUPERSEDED 2026-08-03 by Phase 39 S4a — kept for the trail, not the conclusion] Decision taken
2026-08-02: "rep window, then one install."** The ratchet installs freely until a trigger fires, then
**freezes** while Bladeburner grinds the rep tier uninterrupted; buy the whole tier in one purchase;
install once; resume. Phase 39 was to own specifying that trigger.

**🔴 Phase 39 did NOT build this — it dissolved the question instead (S4a, "no aug chase, no install
freeze").** Skills beat the entire Bladeburner aug tree by **~2× on effect** (Blade's Intuition +
Digital Observer to L25 = ×2.47 total success multiplier for 3,915 rank) at a fraction of the
install-freeze cost, and in a currency (skill points, banked rank) installs don't reset — unlike
faction rep, which resets on every install and is exactly what the frozen-window plan was protecting.
So: **the engine publishes no `repWindowActive` flag, no install-freeze signal, and no money claim.**
`augfarmer.js`/`installer.js` are not modified to honour any Bladeburner freeze, and the engine does
not target or reason about Bladeburner faction rep beyond logging it as an observation. The
install↔rep deadlock below is therefore **accepted, not solved** — the aug tier stays a standing,
unfunded objective, revisited only if income ever makes it trivially affordable *and* a natural
no-install stretch appears (a manual call, not engine behaviour). Cost if this default is wrong: the
Bladeburner aug tier (12.5k–62.5k rep, meaningful success-chance multipliers) never gets bought in
this run.

**Second constraint: one player-action slot.** Bladeburner actions block gym/crime/faction work.
`The Blade's Simulacrum` removes exactly this (rep 1.25k — already met; **$150b base / $1.029t at
current escalation**). So combat stats cannot be bought at the gym while grinding rank.

### The batcher's new job: funding engine only

**The WD-gate hacking climb is dropped as a goal** (decided 2026-08-02). Optimise the batcher for
**$/s** to fund Bladeburner augs and fleet. The M≈28–37 / 35-aug Daedalus arithmetic in §1 below is
still *correct* and preserved for a fallback revival — it is simply no longer the plan. Do not
re-derive it as if it were.

### What the bet actually is, stated as a bet

🧮 Best measured action (Tracking, **0.0307 rank/s**) projects **150 days at 100% duty** to rank
400,000 — and real duty is ~30%. The path is viable only if the multiplier stack compounds:

| Lever | Now | Ceiling | Factor |
|---|---|---|---|
| Overclock | 17/90 (×0.83 time) | 90/90 (×0.10) | **8.3×** |
| Stamina duty cycle | ~30% | ~95% | **3.2×** |
| Stamina success penalty | 49.9% | 0% | **~2×** |
| Action tier (Tracking 0.73 → Raid 80.5 rank/success) | contracts | operations | **~20×** if success lands |
| `bladeburner_*` aug mults | all **1.00** | ~1.5–2× stacked | **~1.5–2×** |
| Team size | **0** | ? | ops/blackops only |

Conservatively 8.3 × 3.2 × 2 ≈ **50×** before any tier switch → ~3 days at 100% duty. **The ceiling
is real and read off the game's own numbers. None of it is demonstrated.** ⚠️ Do not let this table
become a planning assumption — it is the hypothesis Phase 39 exists to test.

---

## 1. The decision: clear via Bladeburner, not via hacking
*(2026-07-29 original — superseded in its conclusion by §1.0 above, which reaches the same place by a
different and better-evidenced route. Retained for the hacking-path arithmetic, which is unchanged
and still the reference if the fallback is ever revived.)*

**Recommendation: take the Bladeburner black-op path.** Grind combat stats to 100, join the
division, build an engine, and clear the node by completing the final black op
(**`Operation Daedalus`**). Treat the hacking/Red-Pill path as a fallback we do not intend to use.

Confidence: **high on the ordering, medium on the timeline** (timeline depends on ❓ rank rates).

### The strongest objection first, and what it costs

**The objection: this is the most new-code-per-clear node we've ever taken, and the hacking path is
already automated.** We have a mature, install-hardened batcher plus a 36-install aug ratchet that
cleared two nodes unattended. Bladeburner is *zero* lines of existing code, and the honest bill is
~a week of dev across brainstorm → spec → implement for a mechanic whose yields we can't even read
yet. The hacking path, by contrast, needs no new engine at all.

**Why I still recommend Bladeburner, and what would change my mind:**

1. **The hacking path is not the cheap option here — it's a full BN2-scale endgame.** 🧮 The WD gate
   is **6,000** (base 3,000 × Difficulty 200%, and 200%→6,000 follows the linearity confirmed live
   at BN2's 500%→15,000). With `HackingLevelMultiplier` at **0.35** (✅ live), the level formula
   `level = 0.35 · M · (32·ln(exp + 534.6) − 200)` needs:

   | Banked hacking exp | M required for level 6,000 |
   |---|---|
   | 1B | 37.0 |
   | 5B | 33.3 |
   | **13.9B** (what the BN2 clear actually banked) | **31.3** |
   | 50B | 29.1 |
   | 100B | 28.1 |

   *(Formula validated against the BN2 clear: it predicts 15,020 for M=34.3 at 13.9B exp; the
   actual level was 15,019.)*

   So the hacking path costs **M ≈ 28–37 — squarely BN2 territory (34.3 achieved)** — while banking
   exp **2× slower than BN5** (`HackExpGain` 0.25 ✅). And it *additionally* needs **35 augmentations
   for the Daedalus invite** (✅ `DaedalusAugsRequirement: 35`, up from the usual 30). That is not a
   shortcut; it's the expensive path wearing a familiar face.

2. **Clearing via hacking would forfeit the entire reason BN6 is next.** The counter-map
   (`bitnodes.md`, 2026-07-18) puts BN6→BN7 here for exactly one purpose: **bank the Bladeburner
   alt-destroy path so the hacking-level walls in the back half stop mattering** (BN9 ×0.5, BN10
   ×0.35, BN13 ×0.25, BN14 ×0.4). SF6 drops either way — but arriving at BN9 holding SF6 and *no
   Bladeburner engine* means re-deriving the whole mechanic there, in a far harsher node, under
   pressure. **The engine is the deliverable; SF6 is the receipt.**

3. **Rank survives installs — this is the single best structural fact in the node.** ✅ In-game doc,
   verbatim: *"While Bladeburner rank and skill points persist after any augmentation installs,
   faction reputation will be reset."* Every other progress axis we've ever tracked resets:
   hacking level, money, fleet, faction rep (gang respect→rep measured 21.5m → 3.8m across a BN2
   install). Bladeburner rank is **monotonic across the entire node**. That inverts the usual
   install calculus — installs stop throwing away win-condition progress.

4. **The prerequisite is nearly free.** 🧮 Combat 1→100 is **21,668 exp total** (5,417 per stat at
   our 1.28 mult, ✅ measured via `formulas.skills.calculateExp`). The BN2 clear banked 13.9 *billion*
   hacking exp. This is a gym trip, not a grind — and it retires the unmeasured "~2–6h of gym
   training" figure that the old BN5 gang tripwire carried.

**What would flip this to the hacking path:** black-op rank requirements coming back so steep that
🧮 a projected rank-25→final-op climb exceeds ~3 weeks, *or* discovering the black-op ladder is
gated on something we can't supply (team size, a stat wall, an aug we can't afford). Both are
readable the moment we join — so this decision gets **one cheap re-check at Stage 2**, not an
open-ended deliberation. Logged per the dropped-objections rule.

**✅ Half the re-check is done (2026-07-30): the ladder itself is sane.** All 21 black ops are
flat-rate rank gates (2,500 → 400,000, no team/stat/aug preconditions surfaced by the API) — no
sign of the "gated on something we can't supply" failure mode.

**⚠️ The other half — the rate — came back BAD, and this is now the strongest live objection to
the whole decision.** `src/bladeburneractionprobe.js` measured every action's yield at our actual
post-join state (rank 0, combat 172, **zero Bladeburner skill points spent — all 12 skills level
0, because skill points come from rank and we have none yet**). Expected rank/sec (success chance
× rank gain − failure chance × rank loss), best case:

| Action | Expected rank/sec (at min success chance) |
|---|---|
| **Raid** (best) | **0.0277** |
| Tracking | 0.0211 |
| Retirement | 0.0172 |
| Bounty Hunter | 0.0167 |
| Undercover Operation | 0.0068 |
| Investigation | 0.0059 |
| Sting Operation | ~0 |
| Stealth Retirement Operation | **negative** |
| Assassination | **negative** |

🧮 **At Raid's rate, rank 400,000 is ~4,000 hours away — ~5–6 months, not ~3 weeks.** Even at the
optimistic end of Raid's success-chance range (9.68% vs the 7.53% used above), it's still ~3.3
months. **Every black op itself is currently a losing bet** — e.g. Operation Typhoon (the first,
rank 2,500) has a 2.8–3.1% success chance with a 10 rank *loss* on failure, deeply negative
expected value at rank 0. This is squarely the flip condition's ~3-week bar, missed by roughly an
order of magnitude on the numbers we can currently measure.

**Why this is NOT yet a verdict — two real unknowns still stand between this and a decision:**
1. **Skill investment is completely untested, and is probably the whole point of the tree.**
   `Blade's Intuition` (first level: 3 SP), and most other skills, are priced for ~1-3 SP at level
   1 — cheap — but we hold **zero skill points** (rank 0 ⇒ nothing to spend yet) and the
   rank→skill-point conversion rate is undocumented (`docs/bladeburner-reference.md` §8). If
   skills compound success chance/rank gain even moderately, the naive flat-rate extrapolation
   above is wrong by construction — it assumes the rate measured at zero investment holds for the
   whole climb, which is exactly the kind of assumption that's usually false in this codebase's
   other compounding systems (NFG's ladder, the aug ratchet).
2. **The in-game doc's unverified claim that "the estimate narrows as you scout"** (§5 of the
   reference) is *consistent* with what we measured: near-zero success chance before any `Field
   Analysis` (100%-success, always-available) has been run. A real engine's first move is
   plausibly scouting, not grinding Raid cold — untested here.

> 🔴 **READ THIS FIRST — the verdict below is UNSOUND as of 2026-07-31.** Everything in this
> subsection was computed before the **in-game Bladeburner panel** was ever opened. That panel
> (see `bladeburner-reference.md` §5) documents mechanics the projection assumed away, and at least
> four of its load-bearing assumptions are now known false:
> 1. **Action time is not constant.** `Overclock` cuts it 1%/level to **max level 90 ⇒ 10× faster**.
> 2. **Skill investment does not stay at 13 SP.** The game grants **1 SP per 3 ranks**, so the
>    400,000-rank climb banks **~133,000 SP**. The trial measured the lowest-investment regime that
>    exists and extrapolated it linearly across the whole curve.
> 3. **Team size was 0 throughout**, and teams (via `Recruitment`, 100% success for us) explicitly
>    improve Operation/BlackOp success.
> 4. **Action levels rise with success** and grant more rank/exp/money — Tracking has since reached
>    **level 8/8, 100% success, 12s**.
>
> Live re-read on 2026-07-31, after chaos decayed to 0.271 and 13 SP went in, shows success chances
> roughly **double** the trial's: Investigation 27.9–68.3%, Raid 10.6–25.8%. **The ~10.5-month
> figure should be treated as a worst-case floor for naive play, not as this node's answer.**
> The flip to hacking as BN6's *primary* path is not being reversed on this alone — hacking is
> working and needs no new engine — but **the claim that Bladeburner is non-viable, including for
> the counter-map's back half, does not survive.** Phase 38 exists to settle it properly.

**RE-CHECK AS CONCLUDED 2026-07-30 (superseded — kept for the measurements, not the conclusion).**
Full live trial (`src/bladeburnertrial.js`, Kenneth's go-ahead), ~75 minutes end to end, three
versions:

- **v1 (accidental, 23 min stuck): scouting is real, but only narrows uncertainty.** A
  control-loop bug (`startAction` auto-repeats like `commitCrime` — `getCurrentAction()` never
  returns `null` between reps, so a naive wait-for-null loop never exits) accidentally ran ~50
  `Field Analysis` reps unattended. Raid's success-chance *range* collapsed from a spread
  (`[0.075, 0.097]` pre-trial) to a single point estimate, `0.0901` — confirms the in-game doc's
  "estimate narrows as you scout" line, but the central value barely moved.
- **v2 (fixed, 22 real grind cycles): skill investment gives a one-time step, not a trend change.**
  A lucky success at cycle 11 funded 9 skills to level 1 each. Chance jumped from 0.0757 to 0.0872
  (~15% relative) — real, but flat afterward, not compounding.
- **v2's bigger finding: success chance DECAYS every cycle, independent of rank/skills** — same
  decline slope with 0 skills spent as with 9 spent, just from a different starting point. By
  cycle 22, `predictedExpectedPerSec` (0.0252) had already fallen *below* the zero-investment
  baseline (0.0277).
- **v3 (23 more cycles, testing `Diplomacy` as a chaos-mitigation lever): insufficient.** Run every
  5 cycles, Diplomacy gave a small, consistent bump each time (~+0.003 to Raid's min chance) — but
  the decay *between* Diplomacy runs was 2–3× larger than that bump. Net effect: still declining,
  just slightly slower. `predictedExpectedPerSec` fell to **0.0112** by the trial's end (action 45)
  — under half the original baseline. The decay tracked together across both Raid (the probed
  reference) and Tracking (the action actually being run from cycle 25 on, after `bestAction()`
  adaptively switched away from Raid as its EV fell) — this is a **global** effect, not specific to
  one action, consistent with city-wide chaos rather than an action-specific cost.

**🧮 The number that closes the re-check: actual achieved rate over the v3 window (real rank
gained ÷ real elapsed time, not the pre-action prediction) was rank 90.72 → 105.12 in 998.7s =
`0.01443 rank/sec`.** Extrapolated to the 400,000 gate: **~321 days (~10.5 months)** — *worse*
than the original naive zero-investment estimate (~5–6 months), despite active scouting, 13 skill
points spent across 10 different skills, and Diplomacy run every 5 cycles. **Every lever tried
made the outcome worse than doing nothing, not better** — this is not "unclear," it's a load-bearing
result: whatever generates the decay outpaces every mitigation tested. Against the flip
condition's ~3-week bar, this is off by roughly two orders of magnitude, not one.

**Decision: hacking is now the primary path; Bladeburner is a background side-quest, not the
plan.** Rank (105+ at trial's end) and the 10 skill levels bought are **not wasted** — rank/skill
points persist across installs (§5 of the reference, the one fact that made trying this worth it),
so idle rank accumulation via `nextUpdate` bonus time or occasional actions remains free value. But
committing further session time to a dedicated Bladeburner engine (Stage 3) is not justified by
what's measured. **Re-derive the hacking path's M-target plan next**, using `docs/bitnodes.md`'s
BN2 precedent (§1 above already has the formula: M≈28–37, +35-aug Daedalus gate).

**Dropped, not closed — logged per the dropped-objections rule:** city rotation was never tested.
Every cycle of this trial ran in one city; if chaos is genuinely city-scoped (plausible, given
`getCityChaos(city)` exists per-city in the API), rotating between cities before each city's chaos
saturates could change this verdict substantially. **Wake condition:** revisit if the hacking path
also stalls badly, or specifically if Kenneth wants one more cheap experiment before fully
shelving Bladeburner — city rotation is the obvious next lever, untested, and cheap to check
(`switchCity` is 4 GB, already cataloged in the reference's §6).

---

## 2. Node facts — live-verified

All 20 non-baseline multipliers read via `ns.getBitNodeMultipliers()` and **matched the hand-read
BitVerse panel 20/20** (see `bladeburner-reference.md` §10 — this was the first live validation of
any per-node table in `bitnodes.md`, and it vindicates the whole hand-read corpus).

| Axis | BN6 | Consequence |
|---|---|---|
| `WorldDaemonDifficulty` | **2.0** | 🧮 hacking gate 6,000 |
| `HackingLevelMultiplier` | **0.35** | The wall. Makes the hacking path an M≈30 project. |
| `DaedalusAugsRequirement` | **35** | +5 augs vs standard, only matters on the hacking path |
| `HackExpGain` | **0.25** | Exp banks 2× slower than BN5, 4× slower than BN1/BN2 |
| `ServerMaxMoney` | **0.2** | Looks brutal — see the surprise below |
| `ScriptHackMoney` | **0.75** | Generous compared to BN5's 0.15 |
| `ServerStartingMoney` / `ServerStartingSecurity` | 0.5 / 1.5 | Slower prep, standard shape |
| `CloudServerSoftcap` | **2.0** | Harshest fleet-cost softcap we've seen (BN5 was 1.2) — fleet scaling will hurt |
| `HacknetNodeMoney` | 0.2 | Hacknet not an income route |
| `CrimeMoney` / `InfiltrationMoney` / `CompanyWorkMoney` | 0.75 / 0.75 / 0.5 | Mildly nerfed |
| `GangSoftcap` / `GangUniqueAugs` | 0.7 / 0.2 | Gang income possible but softcapped |
| Corp / Stanek | 0.2 val, 0.8 div, 0.9 softcap / 0.5 power, +2 size | Not our engines |
| **Aug money cost** | **1.0 (not nerfed)** | 🔑 see below |
| `BladeburnerRank` / `BladeburnerSkillCost` | **1.0 / 1.0 (neutral)** | BN6 is the cheap Bladeburner node. BN7 reads **0.6 / 2.0** (40% slower rank, 2× skill cost) — restate this at BN7 entry, it compounds with BN7's Stanek's-Gift lockout. |

### 🔑 The economic surprise: BN6 is *better* for the mult ratchet than BN5 was

🧮 Effective money stolen per hack is `ServerMaxMoney × ScriptHackMoney`:

- **BN5:** 1.00 × 0.15 = **0.15**
- **BN6:** 0.20 × 0.75 = **0.15**

**Identical.** The scary-looking 20% max money is exactly cancelled by the generous 75% steal
fraction. And BN6 has **no augmentation cost penalty** (1.0) where BN5 carried **200%** — so at
equal income, **BN6 has 2× BN5's aug-buying power.** Since BN5's binding constraint was money→mult,
and we cleared it anyway, the mult ratchet should run *better* here.

The genuine regressions vs BN5 are **exp (2× slower)** and **fleet cost (softcap 2.0 vs 1.2)**.
⚠️ Post-install re-climbs will therefore be **worse than BN5's 1–4h** — plan install cadence
accordingly, and note this is the one place where "rank survives installs" does *not* rescue us:
the batcher still has to climb back every time.

---

## 3. Win condition

Two routes to destroying the node:

1. **Bladeburner (chosen):** complete all 21 black ops, ending at **`Operation Daedalus`**. The
   in-game doc frames Bladeburner as having *"a goal of destroying BitNodes by operating against
   increasingly strong Synthoid opposition."* Each black op is rank-gated (❓ requirements unknown);
   `getNextBlackOp()` returns `null` once none remain.
2. **Hacking (fallback):** 35 augs → Daedalus → Red Pill → backdoor `w0r1d_d43m0n` at level 6,000,
   needing 🧮 M≈28–37. Fully automated already by the aug ratchet + `backdoorwd.js`.

Note the ratchet keeps working regardless — money and augs still buy hacking mults, and we still
want home RAM and a fleet for the batcher. **These paths share infrastructure; only the finish line
differs.** Nothing about choosing Bladeburner means turning the batcher off — the batcher is what
*funds* everything, and it's still the only income engine.

---

## 4. Staged plan

**Stage 0 — bootstrap, no new code.** ✅ *Done — home RAM cleared the deadlock.* Standard
fresh-node recovery: batcher up, fleet growing, hacking climbing, ratchet running. Home reached
**128 GB** by 2026-07-30 (started at 32 GB, `augfarmer.js` needs 64.10 GB), so the home-RAM
deadlock this section warned about is resolved — `augfarmer.js` runs continuously now, alongside
the full companion stack (a one-off probe like `bladeburnerprobe.js` at 19.20 GB still needs a
companion killed temporarily to fit, see the reference's §9).

**Stage 1 — combat 1→100, join the division. ✅ DONE 2026-07-30.** Combat stats reached
172/172/172/172 (target 100, overshot — see below). `src/joinbladeburner.js` stopped the crime
action and called `joinBladeburnerDivision()` → `true`; `inBladeburner()` → `true`. No Stanek's
Gift side-effect (SF7 level 0, as expected).
⚠️ **What actually happened, worth recording:** `combatgrind.js` died mid-run (its own documented
RAM-contention risk), but the `commitCrime` player action it started kept running unattended with
nothing alive to detect gate-met and call `stopAction()` — so combat overshot to 172 before anyone
intervened. Cost was zero (no overshoot penalty) plus ~90 min of a pointless Mug loop. Not a
process failure to fix — this is exactly the "the grind survives unattended, the script is a
measurement harness not the thing doing the work" behavior `combatgrind.js`'s docstring predicted;
the only gap is nothing was left alive to *stop* it exactly at the gate, which cost nothing here.
⚠️ Restated for the record even though it didn't bind this time: **under SF7.3,
`joinBladeburnerDivision()` permanently locks out Stanek's Gift.** This warning stays here for the
BN7 repeat, where it *will* bind.

**Stage 2 — measure, then decide, then spec. 🔨 IN PROGRESS, and it just produced the pivotal
number.** `src/bladeburnerprobe.js` re-run 2026-07-30 immediately after the join
(`docs/bladeburner-reference.md` §3/§8/§10) — filled in the reachability map (10/10 now work) and
the **full 21-black-op rank ladder** (final gate: rank **400,000** at `Operation Daedalus`). Two
new sibling probes followed same-day: `src/bladeburneractionprobe.js` (per-action time/success/
rank-gain/rank-loss/rep sweep across all 36 actions) and `src/bladeburnerskillprobe.js` (per-skill
cost/level). **Result: at zero skill investment (0 SP available, rank 0), the best grindable
action's expected rank/sec projects to ~5–6 months to rank 400,000 — far past the §1 flip bar of
~3 weeks.** See §1 for the full number and the two open unknowns (skill scaling, scouting) that
keep this from being a final verdict. **Still needed:** whether skill investment or `Field
Analysis` scouting change the rate — unmeasurable without running an actual action, which is a
deliberate small live trial, not another read-only probe.

**🚫 Stage 3 — build the engine. SHELVED 2026-07-30 as a *win-path* build — UNSHELVED 2026-07-31
as a *measurement* build (see §1's correction, §8's 2026-08-01 entry).** The design sketch below
(headless resident, `bladeburner-state.json` + `bladeburner-log.json`, off-marker file, supervisor
gate on `inBladeburner()`) is exactly what got built as **Phase 38**
(`phase-38-bladeburner-engine.spec.md`, `src/bladeburnermanager.js`, branch `phase-38-slice-b`,
not yet merged to `master`). It does **not** reopen "build toward the black op" — it opportunistically
grinds rank only in slack time the hacking path (`augfarmer.js`) isn't using, and stands down
unconditionally for `backdoorwd.js`/`backdoorfactions.js`/`studybootstrap.js` so it can never
compete with the actual win path. Two checkpoints (24h smoke @ 0.043 rank/held-sec, 1-week
viability @ 0.1543 rank/held-sec) will produce the real verdict the 2026-07-30 trial couldn't.
**Status 2026-08-01: implemented, live, zero data yet** — stood down for `backdoorfactions.js`
since it started; not forced early, per the spec.

**🚫 Stage 4 — rank ladder → black ops → `Operation Daedalus`. SHELVED 2026-07-30** along with
Stage 3 — this was the win condition the engine existed to reach, and the node is now being cleared
via hacking instead (§1). Retained facts, still true and still relevant if Bladeburner is ever
revisited: rank 25 unlocks the Bladeburner faction, and ⚠️ **Bladeburner faction rep resets every
install and can only be earned through Bladeburner actions** — no donation shortcut, no
`workForFaction`, so its augs are structurally expensive in a way the ratchet cannot fix and should
not be assumed into any plan.

**➡️ The live plan is now the hacking path** — M≈28–37 to the WD gate 6,000, plus 35 augs for the
Daedalus invite (§1/§3). That runs on existing machinery (batcher + aug ratchet), which is why it
needs no Stage-3-equivalent build: **the "no new engine" property that made it look boring on
2026-07-29 is exactly what makes it the surviving option.**

---

## 5. Open questions, with defaults and dates

Per the convergence rules: each carries a default so it can't renew itself silently.

- **⚠️ Black-op rank ladder feasibility — SUPERSEDED, now tracked by Phase 38's checkpoints, not
  this bullet.** (Kept for the history: the trial this bullet called for did run, 2026-07-30,
  landed on 0.0144 rank/sec / ~10.5mo, and got marked UNSOUND the next day — §1's correction, §8's
  2026-07-31/2026-08-01 entries.) Current status: `bladeburnermanager.js` (Phase 38) is live and
  will answer this with real data via its 24h/1-week checkpoints once `backdoorfactions.js` stops
  occupying the player-action slot. **Default unchanged:** if the 1-week checkpoint (bar 0.1543
  rank/held-sec) isn't met, treat Bladeburner as an income/rank side-quest, hacking stays primary.
- **❓ Does a Bladeburner engine need a team, and does `Recruitment` gate the black ops?** Teams
  apply only to Operations/BlackOps; the `Recruitment`→team-members link is **inferred from the
  action's name and is not documented anywhere**. *Resolve at Stage 2.* **Default:** assume a team
  is required for late black ops and budget `Recruitment` time.
- **🎯 Gang as an income engine — DEFERRED, and cheaper here than it has ever been.**
  A non-BN2 gang **cannot destroy the node** (in-game doc, and the reason the BN5 tripwire deferred
  it), so this is purely about income. But note the ordering accident: **Stage 1 takes combat stats
  to 100 anyway**, and "all combat stats at 1 is the worst possible starting point for a karma
  grind" was the *central* objection in the BN5 analysis. That objection substantially dissolves
  here — homicide at combat 100 is a different proposition, and `GangSoftcap 0.7`/`GangUniqueAugs
  0.2` mean it's viable-but-taxed.
  **CHECK AT: Stage 3 start, and only if a valid income measurement exists** (the BN5 lesson: a
  tripwire needs a validity precondition, not just a date — `daemon-status.json` must show batches
  actually launching, `warns.skipServers` empty). **Build it only if** batcher income is the thing
  blocking the black-op ladder, i.e. we're waiting on money rather than on rank.
  **Default if never revisited: no gang. Batcher-only, as in BN5.**
- **❓ Does Intelligence 80 do anything for Bladeburner?** ✅ We hold Int 80 (exp 5,836), newly
  visible via SF5. Undocumented interaction. **Default: assume nothing.** Worth a cheap look at
  Stage 2 since success-chance ranges are the obvious candidate.
- **❓ Install cadence under "rank survives".** Rank being monotonic argues for *more* installs;
  25% exp gain and softcap-2.0 fleet costs argue for *fewer*. Phase 36's install-cadence work and
  BACKLOG's "Phase 34 install trigger is optimistic" entry both land right on this. **Resolve
  after the first BN6 install boundary**, using the Phase 35 telemetry already shipped.
  **Default: leave the trigger as-is** — it's optimistic but bounded, and we now know the recovery
  cost is node-dependent, so guessing a constant is the documented antipattern.

---

## 6. Instrumentation: what the GOAL panel means in BN6

**Retargeted 2026-07-29** (BN5 → BN6), then **retargeted again 2026-08-04** (M → rank) to catch the
panel up to the 2026-08-02 Bladeburner-primary flip. It matters because this is the surface liveness
and tripwires are read off.

**The panel now reads (live shape, 2026-08-04):**

```
-- GOAL (BN6.1) --
rank 8.88k/400.00k (Op Daedalus) ~2.2% | 68d @ 0.0664/s
goalposts: ON TRACK (rank climbing)
income $192.61k/s DOWN (10m)
M 1.86 (funds rank; not this node's gate)
liveness: OK
next: NeuroFlux Governor $10.17m
```

- **`rank x/400k (Op Daedalus) ~x.x% | Nd @ r/s`** — the win condition, now *leading* the panel. The
  2026-07-29 retarget left M in the lead slot with a `(fallback)` label, on the reasoning that a
  label was enough to stop it being misread as the plan. After the flip that was no longer true:
  the panel's headline number was a path we had explicitly dropped, and the metric that actually
  clears the node had **no target, no %, and no ETA anywhere on the dashboard** — while
  `rankTarget: 400000` sat unused in `bladeburner-state.json`. The pct carries **one decimal** on
  purpose: rank sits in low single-digit percent for most of the node, so integer rounding would
  read a flat `~2%` for days and look like a stall.
  - ⚠️ **The ETA is a linear projection, not a date.** It is *pessimistic* — `Overclock` is held at
    17/90 against a ×8.3 ceiling, Stage B is shut, team size is 0, and action success levels (and
    their rank payout) grow with use. It is simultaneously *optimistic* — the black-op ladder has
    per-op rank requirements, not one 400,000 wall. Read it as "months or years?", never as a date.
  - 🔑 **Derived from `goallog.js`'s own ring, deliberately NOT copied from `bladeburner-state.json`'s
    `rates` block.** Phase 38's durable lesson was that an engine measuring itself must be validated
    against an independent source. Two independently-derived rank rates on one screen — GOAL's
    `@ r/s` and BLADEBURNER's `/ws` — *are* that check. A divergence between them is a signal worth
    seeing, not a redundancy to unify away.
- **`goalposts: … (rank climbing)`** — `evalTripwire` was **retargeted from M to rank** and retuned
  **12h/11h → 4h/3h**. Three reasons, in severity order:
  1. **Wrong axis.** It tested the ratchet, no longer the win path. Worse: the standing
     "rep window, then one install" decision has the ratchet *deliberately* freezing while
     Bladeburner grinds a rep tier — so under the intended policy a flat M is the **correct** state,
     and the alarm would have screamed loudest exactly when things were going to plan.
  2. **Dead calibration.** 12h was BN2's install cadence. BN6's measured cadence is 15–68h
     (installs #37/#38/#39), so the window sat *below* the signal it sampled and read STALLED most
     of the time.
  3. **It fired falsely.** Confirmed live 2026-08-04 19:30: `WARN: goalposts STALLED -- M flat 12h
     (ratchet stuck?)` while the ratchet was healthy and **~1 minute from install #39** (trigger
     armed, deficit 0, `fundBlocked: false`). A permanently-lit WARN trains you to ignore the panel
     — the exact failure mode CLAUDE.md's *"rarity is what makes an objection legible"* rule exists
     to prevent.

  Rank is a **better** fit for a flat-window test than M ever was: M is a step function that only
  moves at an install, whereas rank accrues continuously *and* survives installs — monotonic and
  smooth. At ~0.066 rank/wall-sec even one hour carries ~240 rank of signal, so 4h is generous:
  wide enough to ride out a legitimate stand-down (the engine yields the slot to
  `backdoorfactions.js`/`backdoorwd.js`, and trains post-install), far tighter than the 12h it
  replaces. A genuinely flat 4h means the engine is dead, permanently yielded, or stamina-pinned.
- **`M x (funds rank; not this node's gate)`** — M is **demoted, not retired**, and sits *below*
  income deliberately: the flip made the batcher a funding engine, so **$/s is its objective and M
  is only the lever that moves $/s**. Reading M as progress-toward-a-gate is the exact misread this
  ordering prevents. The `~%`, the overshoot line, and the `+queued` projection are **gone** — all
  three divided by the fallback path's gate and implied we were walking it.
  - `M_TARGET` / `computeForecast` / `mProgress` are **unchanged in code**, so the fallback becomes
    the real gate again with no code change if the ladder proves infeasible (§5's first open
    question). And **when `rankProgress.value` is null** (division unjoined, or a future
    non-Bladeburner node) the panel *reverts to leading with M and its full target/%* — on a
    hacking-path node the fallback IS the plan, and the formatter follows the node rather than
    hardcoding BN6.
- **Row-neutral by construction** — the retarget added one line and removed two, so the panel's
  worst case went **8 → 7 rows** (measured, not assumed). Not optional politeness: `DASHBOARD_H`'s
  own comment records the window's bottom edge is already **1px past** the measured 1392px screen
  ceiling, so a net row gain would silently break the no-scroll guarantee.
- **`next: n/a (augfarmer stale)`** — new. `augfarmer-state.json` is only trustworthy while the
  farmer is alive (it heartbeats every 5 min); past 3 missed beats `nextAug` is withheld rather than
  shown. **This was a live bug on entry:** the panel reported *"NeuroFlux Governor / Tian Di Hui /
  $8.5b, awaiting-money 4.6h"* — every field left over from the BN5.1 install, because
  `augfarmer.js` needs 64.10 GB and a fresh home is 32 GB, so it had never run in BN6 at all.
  Stale-but-plausible is worse than absent: it invites planning against a target that doesn't exist.
  `next: none` (nothing to buy) and `next: n/a` (nobody's looking) are now different strings.
- ⚠️ **Still node-stale by design:** the `GOAL (BN6.1)` title, `M_TARGET`, and now `RANK_TARGET` /
  `RANK_TARGET_LABEL` are hand-set constants. **Bump all of them on every node entry** —
  `goallog.js`'s `M_TARGET` and `RANK_TARGET` blocks, and `dashboard.js`'s `goalPanel` title.

## 7. What carries over unchanged

- **The batcher** (`daemon.js` et al.) — still the only income engine, still the thing that funds
  everything. `docs/batcher-engine.md`.
- **The aug ratchet** (`augfarmer.js`, `installer.js`) — 36 installs across two nodes; still the
  mult lever, and 🧮 *better funded* here than in BN5 thanks to the absent aug-cost penalty.
- **`gangmanager.js` stays correctly inert** — gated on `inGang()`, filtered out of the supervisor,
  so it costs nothing and needs no re-enabling if the gang question ever flips.
- **Formulas.exe is permanent** (SF5) — no `procureformulas.js` purchase, and the $5b `formulas`
  reservation can never fire, exactly as established in BN5.

---

## 8. Changelog

- **2026-07-29** — Created on BN6.1 entry. Decision: Bladeburner black-op path over hacking, with
  the hacking-path cost computed (🧮 M≈28–37, +35-aug Daedalus gate) rather than asserted. BN6
  multipliers live-verified 20/20. Found that BN6's effective hack income equals BN5's exactly
  (0.15) while aug-buying power is 2× better. Combat-100 gate sized at 21,668 exp. Recorded that
  rank/skill points survive installs but faction rep does not.
- **2026-07-30** — Stage 1 done: combat overshot to 172 (unattended grind ran past the 100 gate,
  harmless), division joined via `src/joinbladeburner.js`. Stage 2: `bladeburnerprobe.js` re-run
  recovered the full 21-black-op rank ladder (final gate rank 400,000, no hidden precondition —
  half the §1 flip-condition re-check closed). Two new sibling probes
  (`bladeburneractionprobe.js`, `bladeburnerskillprobe.js`) measured the other half — the rate —
  and it came back bad: ~5–6 months to rank 400,000 at zero skill investment, ~8x past the
  3-week flip bar. Not treated as a verdict: skill-point scaling and `Field Analysis` scouting are
  both untested and both plausibly change the rate, neither resolvable without running an actual
  action. Home RAM hit 128 GB, closing the Stage 0 deadlock. Surfaced BN6's neutral
  `BladeburnerRank`/`BladeburnerSkillCost` (1.0/1.0) against BN7's worse 0.6/2.0. Also found and
  fixed a `vite.config.ts` gap — new probe filenames need an explicit sync-filter entry or their
  output never reaches `logs/` (silent, not an error).
- **2026-07-30 (later same day) — Stage 2's re-check concluded: FLIP TO HACKING AS PRIMARY.** A
  ~75-minute live trial (`src/bladeburnertrial.js`, 3 versions) tested every lever that could
  plausibly close the rate gap — scouting, skill investment, and a `Diplomacy` chaos-mitigation
  attempt — and all three were insufficient against a steady, undocumented decay in success chance
  that hit regardless of which action ran (Raid or Tracking) or how many skills were bought.
  Actual achieved rate (real rank gained ÷ real elapsed time, not the pre-action prediction):
  0.0144 rank/sec — projecting **~10.5 months** to rank 400,000, *worse* than the original
  zero-investment naive estimate (~5–6 months). Bladeburner rank/skills persist across installs
  (not wasted) but are no longer the primary win-condition plan; Stage 3 (the dedicated engine) is
  not being built. City rotation (never tested — every cycle ran in one city) is logged as the one
  cheap, untested lever left, with a wake condition if the hacking path also stalls.
- **2026-07-31 — the 2026-07-30 "non-viable" verdict marked UNSOUND.** Kenneth asked whether the
  in-game Bladeburner panel had ever actually been read for this decision — it hadn't.
  `bladeburner-reference.md` §5's read found four load-bearing assumptions in `bladeburnertrial.js`
  that don't hold (fixed action time vs. `Overclock`'s up-to-10× cut; 13 SP tested vs. ~133,000
  banked by rank 400,000; zero team size; action success levels — and their rank payout — grow with
  use, never modeled). A live re-read the same day, after chaos decayed and 13 SP went in, showed
  success chances roughly double the trial's. See §1's correction block for the full text. Hacking
  stays primary (it's proven, not just cheap) — what changed is that Bladeburner is no longer
  *closed*. This is the trigger for Phase 38.
- **2026-08-01 — Phase 38 (`bladeburnermanager.js`) implemented (Slices A+B), independently
  audited, one real bug found and fixed.** Kenneth pushed back on the "skipped Bladeburner in the
  Bladeburner node" framing; a cold-context adversarial review agent (given raw log access, no
  access to prior reasoning, explicitly told to try to disprove the shelving call) independently
  re-parsed `logs/bladeburnertrial-log.json` and confirmed the 0.0144 rank/sec arithmetic is
  correct but drawn from one noisy ~1000s slice of the 73-minute trial — other honest slices of the
  *same* log read 0.024–0.062 rank/sec (a 1.7–4.3× spread), i.e. the number was never as settled as
  the flip made it sound. It also independently checked the hacking-path timeline against real
  precedent (not just the M≈28–37 formula): BN2 cleared in 5 real days at a *harder* gate
  (hacking 15,000 vs. BN6's 6,000), BN5 in ~6, both via this same automated engine — good evidence
  hacking-primary is fast and proven on its own merits, not just "the fallback." **Live bug found:**
  `bladeburnermanager.js`'s stand-down branch (decision 3, yielding to
  `backdoorwd.js`/`backdoorfactions.js`/`studybootstrap.js`) never wrote `bladeburner-state.json`,
  unlike the off-marker branch it was modeled on — so the engine had been alive over a day across
  two daemon restarts with **zero external visibility**, entirely because `backdoorfactions.js` has
  occupied the player-action slot since the engine started (expected/correct per the spec, not a
  bug in itself). Fixed same-day: the stand-down branch now writes a rate-limited state snapshot
  (`holdReason: "stand-down"`, `standDownFor: <claimant>`) mirroring the off-marker one. **Status:
  the engine still has zero rank-grinding data** — both 24h-smoke (bar 0.043 rank/held-sec) and
  1-week-viability (bar 0.1543 rank/held-sec) checkpoint clocks are still waiting on
  `backdoorfactions.js` to clear. Per the spec's own instruction, this is not being forced early.
  `CLAUDE.md`'s "Current goal" one-liner was found to be 11 days stale against this file's own
  2026-07-31 correction (never propagated up) and was fixed in the same pass.
- **2026-08-02 — the engine finally ran, and its instrumentation could not have produced a verdict.**
  `backdoorfactions.js` released the slot 2026-08-01 5:07 PM, so the engine grind-tested for the
  first time (~16.7h held by the next morning). A routine game-state check found three defects, one
  of them fatal to the phase's purpose:
  - **🔴 Both checkpoints were structurally unreachable.** The per-tick sample array was trimmed to a
    fixed **10,000 entries** while every rate window is expressed in *wall time*; `nextUpdate()`
    resolves ~1×/sec, so the buffer held **~2h47m**. `"24h"` and `cumulative` both silently meant
    "the last 2h47m", and because the checkpoint trigger summed uptime from that same buffer it could
    never reach 24h — let alone a week. The engine had been up 27h reporting `checkpointA: null`,
    correctly per the code and uselessly per the spec. **Fixed:** `cumulative` and checkpoint uptime
    now come from a never-pruned `totals` accumulator that is **persisted and re-seeded across
    restarts** — load-bearing, because augfarmer's installs killed and relaunched this engine 6 times
    in its first 27h. Pruning is now by timestamp against the widest finite window.
  - **🧮 The rate it reported was wrong in the dangerous direction.** It read **0.00508
    rank/held-sec**; absolute rank endpoints (106.3 on 7/30 → 1217.8 on 8/02, 16.7h held) give
    **0.0185**, and a 272s spot sample during firing read **0.0387** — against checkpoint A's 0.043
    bar. Given decision 9's "default if never revisited: non-viable", a 3.6× pessimistic error is
    exactly the error that would have retired Bladeburner *and* the counter-map's back half on a
    measurement artifact. **This is the second time in three days that a Bladeburner non-viability
    number turned out to be an artifact of its own measurement harness** (the first: the 7/31
    correction to the 7/30 trial). The pattern is worth naming — every measured-bad Bladeburner
    result so far has had a broken instrument behind it, so the next one gets the harness audited
    before the verdict is believed.
  - **⚠️ A permanent stall existed, and would have reported as 100% productive.** In a contested
    window with inventory exhausted, `pickRankAction` returns `null` and the code fell back to a
    hardcoded `Hyperbolic Regeneration Chamber` — zero rank, and no way to regenerate contract/op
    inventory. The 2026-08-01 `Incite Violence` fix for precisely this lived only in
    `pickOverheadAction`, reachable only from the *free* branch — which live duty data showed had
    been entered **zero times in 2h47m**. Both paths now route through `pickOverheadAction`. Separately,
    per-tick `kind` now follows the chosen *action* rather than the *window*, so zero-rank fallback
    time lands in `overheadSec` instead of masquerading as `rankSec` (the rate denominators were
    never wrong — decision 8 includes overhead deliberately — but the diagnostic split was).
  - **🔴 And two more, found by following the numbers instead of stopping at the fix.** After the
    above landed, the live cumulative rate went **negative** (−0.00958 rank/held-sec). Reading the
    in-game Bladeburner panel — the interface the original trial never opened, same lesson as the
    7/31 correction — gave the cause in one screen:
    - **`Stamina Penalty: 89.5%`** at stamina 4.371/83.555 (5.2%), vs `0.0%` at full stamina on
      7/31. The game log showed **"Your Bladeburner action was cancelled because your stamina hit
      0"** twice in one hour, amid a steady run of `Investigation failed! Lost 0.343 rank.` The
      engine had no stamina guard at all — `stamina` was instrumented on 2026-08-01 as
      *"visibility only … no action reacts to this yet"*, justified on the grounds that the one
      prior data point came from the stamina-full 7/30 trial. A continuous run made it the
      **dominant** term. **Fixed:** `updateStaminaRecovering`, a hysteresis latch (trip < 50%,
      release ≥ 80% — one threshold would resume firing at the level that just failed) that routes
      to `Hyperbolic Regeneration Chamber` until stamina recovers.
    - **🔴 Worst of the five: the engine sat idle while billing the time as rank-earning.**
      `startAction` auto-repeats, so the loop only restarted an action when *its own intent*
      changed, reasoning that "there is no completion boundary this loop needs to detect." **The
      game can cancel a running action** — and when it did (stamina 0), intent hadn't changed, so
      the engine never restarted and never noticed. `getCurrentAction()` probed **`null`** at a
      moment `bladeburner-state.json` claimed `holdActive: true, dutyCycle: 1`. **Fixed:** ask the
      game, not our own intent — deliberately an `idle`/`null` check rather than an equality test on
      the live action, because `getCurrentAction()`'s `type` strings are undocumented (gotcha 10) and
      a never-matching comparison would restart every tick and complete nothing, which is worse than
      the bug. Costs +1 GB, as cataloged.
  - **Status:** 1178 tests pass (+45 new, incl. regression tests that a 24h/1-tick-per-sec run
    survives pruning and reaches the checkpoint threshold, and a full stamina drain-and-refill
    cycle); RAM **69 → 70 GB**, the documented cost of `getCurrentAction()` and nothing hidden;
    live-verified `totals` persisting across a restart (`restarts: 1`, held seconds carried),
    `stamina.recovering: true` tripping at 5.8%, and HRC time landing in `overheadSec` instead of
    `rankSec`. **The 24h smoke clock starts from zero at 2026-08-02 10:12 AM** — `bladeburner-state.json`
    was deliberately deleted to discard the 544 held-seconds accumulated under the broken tagging, so
    the checkpoint-A verdict is measured entirely post-fix rather than mostly post-fix.
  - **⚠️ The pattern, stated once so the next session doesn't relearn it:** three separate
    Bladeburner "bad rate" readings (7/30 trial, 8/01 engine, 8/02 engine) have now each turned out
    to be an artifact of the harness measuring them, not of the mechanic. **Audit the instrument
    before believing the next verdict** — and note that decision 9's "default if never revisited:
    non-viable" makes pessimistic instrument errors the ones that silently win.

- **2026-08-04 — GOAL panel retargeted from M to rank (§6 rewritten).** The dashboard's headline
  goalpost was still the fallback hacking path 2 days after the Bladeburner-primary flip:
  `M 1.75/30 (fallback) ~6%` led the panel, plus a `+queued` line, while **rank → 400,000 had no
  target, no %, and no ETA anywhere on the dashboard** despite `rankTarget: 400000` already sitting
  unused in `bladeburner-state.json`. Rank now leads; `evalTripwire` retargeted M → rank and retuned
  12h/11h → 4h/3h; M demoted below income to `M x (funds rank; not this node's gate)`; overshoot and
  `+queued` lines removed. Row-neutral by construction — worst case **8 → 7 rows**, measured
  (`DASHBOARD_H` is already 1px past the screen ceiling, so a net gain would break no-scroll). Full
  rationale and the fallback-degradation behaviour in §6. Tests: 1315 pass (+17 new). ⚠️ RAM
  unchanged *by inspection* — `goallog.js` added one `ns.read` (0 GB) and `dashboard.js` added no
  `ns` calls — **but this has not been confirmed by an in-game `ramcheck.js` run yet.**
  - **The trigger was a live false alarm, worth recording as evidence not anecdote.** At 19:30 the
    panel read `WARN: goalposts STALLED -- M flat 12h (ratchet stuck?)` while the ratchet was
    healthy and **~1 minute from install #39** (trigger armed, `sustainedMs` 300s, deficit 0,
    `fundBlocked: false`). The 12h window was BN2's install cadence; BN6's measured cadence is
    **15–68h** (#37 → #38 → #39), so the tripwire sat below the signal it sampled and read STALLED
    most of the time. Under the standing "rep window, then one install" policy a flat M is the
    *intended* state, so the alarm would have screamed loudest when things were going to plan.
  - 🧮 **Rank rate is materially better than this doc's standing figure — recompute before quoting
    150 days again.** `bladeburner-state.json` at 19:30 reads `rates.cumulative.rankPerWallSec`
    **0.0664** over 87,538 wall-sec at **99.1% duty** (1h window: **0.0876**). Against rank 8,876 of
    400,000 that projects **≈68 days** linear, or ≈52 days at the 1h rate — versus the **150 days**
    §1/CLAUDE.md still carry from the 0.0307 rank/s Tracking measurement. That is a **~2.2×**
    improvement and it is Phase 39's engine, not Phase 38's. ⚠️ **Do not promote this to a settled
    number yet:** per the "audit the instrument before believing the verdict" pattern immediately
    above, this is once again *the engine measuring itself*. The GOAL panel's independently-derived
    `@ r/s` (from `goallog.js`'s own ring) now provides the cross-check, but it needs ≥6h of
    post-deploy history before it reports, and an in-game-panel confirmation is still owed.
  - 🔴 **Found while investigating, NOT fixed — the rep-window trigger is structurally unable to
    fire.** `augfarmer.js`'s `FACTION_SCOPE` (`src/augfarmer.js:2120`) lists 14 factions and
    **`Bladeburners` is not one of them**, so the farmer can never target a Bladeburner aug →
    `repStarvation` can never see a deficit (it currently reports
    `worth.reason: "no-deficit"`, `repForegone: 0`) → the "rep window, then one install" freeze has
    nothing to trip it. The exclusion is *correct* for the code that owns it (Bladeburner rep cannot
    be earned via `workForFaction`, so adding it would grind work that yields nothing while
    contending for the action slot), which is exactly why this is **not a one-line fix** and belongs
    in Phase 39's trigger spec. Cost so far, estimated: #38 → #39 was 15.2h at ~99% duty ≈ **4,700
    Bladeburner rep destroyed, ~38% of the way to the cheapest 12.5k success-chance aug tier** —
    third time in 3.5 days, and we still own **zero** `bladeburner_*` augs.
