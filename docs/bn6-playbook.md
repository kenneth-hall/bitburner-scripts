# BN6.1 playbook (Bladeburners)

The strategy guide for this node: which win path, why, in what order, and what we've decided
versus what we're still waiting to measure. The **interface** it's built on is
[`bladeburner-reference.md`](bladeburner-reference.md) — read that first if you're about to write
code. This file is the one that churns; that one shouldn't.

**Entered BN6.1 on 2026-07-29**, straight off the BN5.1 clear. Owned SF: `{1:3, 2:1, 4:3, 5:1}`.

> **Epistemic status, stated up front because it's load-bearing.** The strategic *shape* of this
> node is settled and grounded in verified numbers. The division is joined and action yields are
> now measured too (2026-07-30) — and the result is a live yellow flag: **the best measured
> grind rate projects ~5–6 months to the final black op, ~8x slower than the ~3-week flip bar**,
> at zero skill investment. Whether skill points or scouting change that is still genuinely
> unknown (see §1) — **do not read the current rate as a final verdict, and do not read "the
> ladder is measured" as "feasibility is settled."** Every number below is labelled ✅ verified,
> 🧮 computed, or ❓ unknown. **Do not let a ❓ get quietly promoted to a planning assumption** —
> that's the Phase 27 failure mode, and it cost most of a session.

---

## 1. The decision: clear via Bladeburner, not via hacking

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

**Retargeted 2026-07-29.** The tracker was still aimed at BN5 on entry, which mattered because it's
the surface liveness and tripwires are read off.

- **`M x/30 (fallback)`** — `M_TARGET` is now BN6's *fallback* hacking gate, and the label says
  "fallback" precisely so it can't be misread as the plan. 🔑 **M is not this node's win condition**;
  the black-op rank ladder is. M is kept because (a) `evalTripwire`'s "M flat ⇒ ratchet stuck" test
  is valid under either win path, and (b) if the black-op ladder turns out infeasible this becomes
  the real gate again with no code change. `forecast.daysToGate` likewise projects the fallback path.
- **`next: n/a (augfarmer stale)`** — new. `augfarmer-state.json` is only trustworthy while the
  farmer is alive (it heartbeats every 5 min); past 3 missed beats `nextAug` is withheld rather than
  shown. **This was a live bug on entry:** the panel reported *"NeuroFlux Governor / Tian Di Hui /
  $8.5b, awaiting-money 4.6h"* — every field left over from the BN5.1 install, because
  `augfarmer.js` needs 64.10 GB and a fresh home is 32 GB, so it had never run in BN6 at all.
  Stale-but-plausible is worse than absent: it invites planning against a target that doesn't exist.
  `next: none` (nothing to buy) and `next: n/a` (nobody's looking) are now different strings.
- ⚠️ **Still node-stale by design:** the `GOAL (BN6.1)` title and `M_TARGET` are hand-set constants.
  **Bump both on every node entry** — `goallog.js`'s `M_TARGET` block and `dashboard.js`'s
  `goalPanel` title.

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
