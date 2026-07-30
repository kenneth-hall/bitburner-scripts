# BN6.1 playbook (Bladeburners)

The strategy guide for this node: which win path, why, in what order, and what we've decided
versus what we're still waiting to measure. The **interface** it's built on is
[`bladeburner-reference.md`](bladeburner-reference.md) — read that first if you're about to write
code. This file is the one that churns; that one shouldn't.

**Entered BN6.1 on 2026-07-29**, straight off the BN5.1 clear. Owned SF: `{1:3, 2:1, 4:3, 5:1}`.

> **Epistemic status, stated up front because it's load-bearing.** The strategic *shape* of this
> node is settled and grounded in verified numbers. The *tuning* is not, and cannot be: the entire
> `ns.bladeburner` API throws until we join the division, so black-op rank requirements, action
> yields, skill costs, and chaos/stamina behaviour are all **unmeasured** (see the reference's §8).
> Every number below is labelled ✅ verified, 🧮 computed, or ❓ unknown. **Do not let a ❓ get
> quietly promoted to a planning assumption** — that's the Phase 27 failure mode, and it cost most
> of a session.

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

**Stage 0 — bootstrap, no new code.** ✅ *In progress.* Standard fresh-node recovery: batcher up,
fleet growing, hacking climbing, ratchet running. Reuses everything unchanged. The cold-start
hardening from Phase 35 should make this unattended; **watch it anyway** — BACKLOG's "Cold-start
hardening" entry has a present-tense trigger and BN6 is its first exercise since. Note home is
32 GB and `augfarmer.js` needs 64.10 GB, so the known home-RAM deadlock applies until a tier is
bought (`upgradehomeramonce.js` is the safe lever).

**Stage 1 — combat 1→100, join the division.** 🧮 21,668 exp total. Gym in Sector-12 (we land
there, no travel needed). ⚠️ **This seizes the single player-action slot**, which is the same
serial resource the early faction-rep path needs — the exact conflict the BN5 gang analysis
identified. It's short here, but sequence it deliberately rather than fighting `augfarmer.js`'s
`workForFaction` re-assertion every poll (`src/augfarmer.js:2653`). Then
`joinBladeburnerDivision()` → returns `true`.
⚠️ Restated at point of execution: **under SF7.3 this call permanently locks out Stanek's Gift.**
We hold SF7 level 0 so it does not bind today — but this warning stays here for the BN7 repeat.

**Stage 2 — measure, then decide, then spec.** Re-run `src/bladeburnerprobe.js` the moment the
division join lands; it fills in most of the reference's §8 in one shot. **Then** do the cheap
re-check from §1 (are the black-op ranks sane?) **before** writing an engine spec. Deliverables:
the 21 black-op rank requirements, action times/yields/success ranges, the 12 skills' costs, and a
first look at chaos/population/stamina.

**Stage 3 — build the engine.** A `bladeburnermanager.js` companion in the established mould
(headless resident, `RESIDENT_COMPANIONS` slot, `bladeburner-state.json` + `bladeburner-log.json`,
an off-marker file, gated out of the supervisor when `inBladeburner()` is false exactly as
`gangmanager.js` is now). Control loop on **`await ns.bladeburner.nextUpdate()`** — 0 GB and it
wakes on the engine's own boundary. **Do not spec this before Stage 2 completes.** Full brainstorm →
spec → spec-reviewer → implement, per the three-stage workflow.

**Stage 4 — rank ladder → black ops → `Operation Daedalus`.** Rank 25 also unlocks the Bladeburner
faction; its augs are worth a look, but note ⚠️ **Bladeburner faction rep resets every install and
can only be earned through Bladeburner actions** — no donation shortcut, no `workForFaction`. So
Bladeburner augs are structurally expensive in a way the ratchet cannot fix, and should not be
assumed into any plan.

---

## 5. Open questions, with defaults and dates

Per the convergence rules: each carries a default so it can't renew itself silently.

- **❓ Black-op rank ladder feasibility.** *Resolve at Stage 2* (free — one probe re-run).
  **Default if it looks bad:** switch to the hacking path and treat Bladeburner as an income/rank
  side-quest, keeping SF6 as the reward.
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

## 6. What carries over unchanged

- **The batcher** (`daemon.js` et al.) — still the only income engine, still the thing that funds
  everything. `docs/batcher-engine.md`.
- **The aug ratchet** (`augfarmer.js`, `installer.js`) — 36 installs across two nodes; still the
  mult lever, and 🧮 *better funded* here than in BN5 thanks to the absent aug-cost penalty.
- **`gangmanager.js` stays correctly inert** — gated on `inGang()`, filtered out of the supervisor,
  so it costs nothing and needs no re-enabling if the gang question ever flips.
- **Formulas.exe is permanent** (SF5) — no `procureformulas.js` purchase, and the $5b `formulas`
  reservation can never fire, exactly as established in BN5.

---

## 7. Changelog

- **2026-07-29** — Created on BN6.1 entry. Decision: Bladeburner black-op path over hacking, with
  the hacking-path cost computed (🧮 M≈28–37, +35-aug Daedalus gate) rather than asserted. BN6
  multipliers live-verified 20/20. Found that BN6's effective hack income equals BN5's exactly
  (0.15) while aug-buying power is 2× better. Combat-100 gate sized at 21,668 exp. Recorded that
  rank/skill points survive installs but faction rep does not.
