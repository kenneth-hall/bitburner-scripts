# Phase 41 — BN10 entry: getting to Bladeburner

**Stage 1 (brainstorm).** Decisions, rejected alternatives, and open questions. No spec, no
implementation. Drafted 2026-08-16, the day BN10.1 was entered.

**Scope in one line:** everything between *node entry* and *`joinBladeburnerDivision()` returning
`true`*. The rank grind, the black-op ladder and sleeve×Bladeburner parallelism are explicitly
**out of scope** — they are a later phase, and one of them is not measurable until this one lands.

---

## 1. Why a phase at all — and the objection to it

**The objection, stated first:** the combat-100 gate is a *one-time event*. Building an engine for a
one-time event is normally waste, and this phase is mostly that.

**What defeats it:** BN9 is next on the node order and is also a Bladeburner node, and **rank and
skill points are node-local** — every Bladeburner node re-pays this gate *from zero*. So a
combat-gate driver is a reusable asset, not a BN10 fixture. That is the same "bank an engine"
logic that selected BN6, and it survives here.

**What does NOT survive it:** anything BN10-specific. Sleeve *purchasing* logic, memory-upgrade
logic, and grafting-price tables are all BN10-exclusive mechanics. Those get **decisions** in this
doc, not code.

---

## 2. Measured facts (all live, 2026-08-16, this session)

Every number below is measured in-node, not carried over. Sources are named so a later session can
re-run rather than re-argue.

| Fact | Value | Source |
|---|---|---|
| Sleeves held | **1** | `sleeverecon-1786924764649.json` |
| Cost of sleeve #2 | **$10.000t** | `getSleeveCost()` |
| Sleeve sync / shock / memory | **27.17 / 21.18 / 1** | same |
| Sleeve→player combat exp transfer | **REAL** | `sleevesyncprobe-1786924807153.json` |
| Player combat exp/sec, sleeve idle | **1.8432** (4 stats summed) | same |
| Player combat exp/sec, sleeve on Mug | **2.2609** | same |
| Grafting available in BN10 | **YES**, 98 graftable, 36 touch combat | `graftrecon-1786925861944.json` |
| Player entropy | **0** | same |
| Combat mult (base / effective) | **1.3824 / 0.5530** | live Stats panel + `sleeverecon` |
| Exp for combat 100 | **146,939/stat · 587,755 total** | derived, formula validated against BN6 |

⚠️ **The +22.7% sleeve figure is bonus-time-inflated and must not be quoted raw.** `storedCycles`
fell **360 → 4** across the treatment phase, so the sleeve ran accelerated for most of it. Steady
state is **~+12.6%**. 📌 This is the third instance this week of *a measured number whose regime
went unstated* — sibling to the combat-gate base-mult slip and to Q10's `Overclock` scope error.

### 2.1 BN10's multiplier table, and what it says about our engines

`logs/bitnodemults-1786922442524.json` (measured, not transcribed):

| Multiplier | BN10 | Consequence |
|---|---|---|
| `ServerMaxMoney` × `ScriptHackMoney` | 1.0 × 0.5 = **0.50** | Batcher is **3.3× better than BN6's 0.15** |
| `CloudServerSoftcap` | **1.1** | Fleet is cheap (BN6: 2.0) |
| `AugmentationMoneyCost` | **5×** | Aug ratchet is the *weakest* it has ever been |
| `AugmentationRepCost` | **2×** | …and the rep half is worse too |
| `HackingLevelMultiplier` | **0.35** | Hacking win-path dead, as expected |
| `StrengthLevelMultiplier` (all 4 combat) | **0.40** | This is the gate |
| `BladeburnerRank` / `SkillCost` | **0.8 / 1.0** | Rank accrues at 80%; redo-tax 1.25× confirmed |
| `HomeComputerRamCost` | **1.5×** | Home RAM upgrades cost more than we're used to |

🔑 **The alignment finding, which is the point of the phase:** money is *easy* in BN10 and
converting money→augs is *expensive*. Our engines are pointed the other way — `augfarmer.js` is
still chasing hacking multipliers from BN6, in a node where hacking is dead and combat is the gate.

---

## 3. The critical-path model

`joinBladeburnerDivision()` needs **all four** combat stats ≥ 100. Combat *level* is logarithmic in
exp, so required exp is dominated by the **multiplier**, not by grind rate:

```
exp(level, mult) = e^((level/mult + 200)/32) − 534.6      [validated: reproduces BN6's 21,668 exactly]
```

At the live effective mult 0.5530 → **146,939 exp/stat**, **587,755 total**.
At 1.84–2.08 exp/sec (Mug, unfocused, +1 sleeve) → **~79–89 hours ≈ 3.3–3.7 days, serial.**

### 3.1 Grafting collapses it — by ~3.5×, not the ~45× a naive read suggests

🔴 **A wrong number was produced and caught in-session; recording it so it is not re-derived.**
`graftrecon.js`'s `combatLevelFactor` multiplies the strength/defense/dexterity/agility mults of a
single aug **together**, which credits a one-stat aug as if it lifted all four. It reported "8
grafts → net combat ×2.848", implying a 45× exp collapse. **That is wrong.** The gate is bound by
the **worst** stat, so the model must be per-stat. Corrected, greedy by exp-reduction-per-dollar,
with the ~2%/graft entropy tax compounding against every multiplier:

| Grafts | Cumulative cost | Graft hours | Exp still needed | Grind hours @1.84/s | **Total** |
|---|---|---|---|---|---|
| 0 | $0 | 0 | 587,755 | 88.7 | **88.7 h** |
| 4 | $589m | 4.2 | 203,425 | 30.7 | **34.9 h** |
| 8 | $1.27b | 7.8 | 123,352 | 18.6 | **26.4 h** |
| 12 | $2.91b | 10.7 | 61,933 | 9.4 | **20.1 h** |

Greedy pick order: `HemoRecirculator · Wired Reflexes · Combat Rib I · Bionic Spine ·
LuminCloaking-V2 · Augmented Targeting II · Combat Rib II · BrachiBlades · …`

**Diminishing returns bite hard after k≈8** ($1.27b → $2.91b buys only 6 more hours). The knee is
around **k=6–8**.

### 3.2 Re-derived from the live position — *stamped 2026-08-17, recompute before quoting*

⚠️ **§3.1's table is from the ENTRY position (combat ~10) and is now stale for decisions.** Grafts
cut the exp *requirement*, so their value rises as banked exp accumulates. At the live state —
**combat 74/74/74/74, $228.8m, ~2.62 exp/sec observed** (faster than §3's 1.84–2.08 model, most
likely a focused rather than unfocused grind):

| Grafts | Cum. cost | Graft h | Exp remaining | Grind h | **Total** |
|---|---|---|---|---|---|
| 0 | $0 | 0 | 454,176 | 48.2 | **48.2 h** |
| 3 | **$214m** | 2.9 | 233,140 | 24.7 | **27.6 h** |
| 4 | $589m | 4.2 | 69,845 | 7.4 | **11.6 h** |
| **7** | **$919m** | 6.5 | 29,019 | 3.1 | **🏆 9.6 h** |
| 8 | $1.01b | 7.6 | 23,100 | 2.4 | 10.0 h |
| 10 | $1.56b | 10.6 | 8,802 | 0.9 | 11.5 h |

🔑 **Three things changed, and they revise D2:**
1. **The curve now has a true MINIMUM at k≈7 (~9.6 h), not just a knee.** Past it, graft *time*
   costs more than the grind time it saves — k=10 is strictly worse than k=7. In §3.1's
   entry-position model more grafts always helped; that is no longer true.
2. **`Bionic Spine` (k=4) is the single biggest step** — 27.6 h → 11.6 h on its own, because it
   lifts all four stats where most cheap grafts lift one or two.
3. **k=3 is affordable RIGHT NOW** ($214m vs $228.8m held) and takes 48.2 h → 27.6 h without
   waiting on the batcher.

**Revised D2 target: k≈7 (~$919m), starting with the k=3 set immediately** rather than waiting to
fund the whole ladder.

⚠️ Grafting is **focused** — it takes the same player-action slot the crime grind uses, so graft
hours and grind hours are **additive**, as modelled. The sleeve keeps grinding throughout (worth
~9k exp across a 10h graft run — real, small, and *not* included above, so the table is mildly
conservative).

---

## 4. Decisions

**D1 — The critical path is `batcher money → grafts → short grind → join`, not `grind → join`.**
Grafting cuts the gate from ~3.7 days to ~1.1 days at k=8. The binding constraint becomes **money**
($1.27b against $3.3m held), which is the thing BN10 is *good* at. This reframes the whole entry:
the first work item is economic, not athletic.

**D2 — Target k≈6–8 grafts, not the full ladder.** The knee is there; k=12 costs 2.3× the money for
1.3× the time saving. Re-derive against actual income when the money lands rather than committing
to a fixed k now.

**D3 — The aug ratchet is not a switch; it is three behaviours with three different answers.**
Framing it as "run it or not" was wrong (Kenneth, 2026-08-16). Decomposed against the code:

| Behaviour | Call site | BN10 answer |
|---|---|---|
| Faction work for rep | `workForFaction`, `augfarmer.js:2916` | ❌ **Harmful now** — takes the single player-action slot, which during entry *is* the critical path (crime grind, then focused grafting) |
| Buying augs | `purchaseAugmentation`, `:2968` | ❌ **Cannot do the job** — see below |
| Triggering installs | not in this file; `installer.js`, gated on `ratchet-mode.txt` | ⏸️ **Already off** (`observe`), but by inheritance, not decision |

🔑 **The blocker is structural, not a tuning knob.** `scoreAug` (`:330`) reads **only** `hacking`,
`hacking_exp`, `faction_rep`, `hacking_money`, `hacking_speed`; `filterAugs` (`:363`) keeps a name
**iff `scoreAug(...) > 0`**. A pure combat aug touches none of those keys, scores **exactly 0**, and
is dropped **by construction**. So the ratchet cannot buy Combat Rib / Bionic Spine / Wired
Reflexes *even if pointed directly at a combat faction*. Retargeting it means changing the scoring
function, not a constant.

🔑 **And the deeper point: `scoreAug` encodes a win condition BN10 does not have.** The ratchet
exists to raise the hacking multiplier toward a `w0r1d_d43m0n` gate. We are not clearing BN10 by
hacking (R3). So its objective function is not merely mis-tuned here — it is aimed at a target that
does not exist in this node.

**Decision:** leave `augfarmer.js` **off for entry** — but record that the reason is the scoring
function's objective, not a preference about aug-buying. Whether it comes back at all is Q41-5, and
it is a *strategy* question about what the ratchet is for in a Bladeburner node, not an on/off flag.

**D3a — `ratchet-mode.txt` must become a BN10 decision, not inherited BN6 state.** It currently
reads `observe` because of the 2026-08-06 install-cadence stop, a decision made about a different
node for reasons (installs costing 5.4% of Bladeburner wall-time) that have not been re-checked
here. ⚠️ Note the recorded landmine: that file is **gitignored and pushed from the repo**, so an
in-game edit silently reverts — edit the repo copy and verify with `run setratchetmode.js`.

**D4 — Sleeve purchasing is OUT of scope.** At $10.000t it is a batcher milestone, not a feature.
Revisit only if income crosses ~$1t/day.

**D5 — Keep the sleeve on `Synchronize` for now, and make the switch a measured decision, not a
default.** Sync 27.17 governs the transfer rate (linear to the player, quadratic cross-sleeve).
With n=1 the quadratic term is irrelevant, so the only question is whether raising sync pays back
inside this node's remaining grind — an arithmetic question, resolvable once the graft plan fixes
how many grind-hours remain. Do not silently leave it on `SYNCHRO` by inertia; that is what it was
already doing when we arrived.

**D6 — Home RAM is a gating purchase and belongs in this phase.** Home is 32 GB with **0.40 GB
free**; `augfarmer.js` (64.10 GB), `dashboard.js`, `xpfarm.js` and `ratchetlog.js` have never
started, and every probe this session required killing the economy to run. At `HomeComputerRamCost`
1.5× this is a real spend, and it blocks observability, not just features.

---

## 5. Rejected alternatives

**R1 — Grind to 100 with no grafts.** 3.7 days serial, and the sleeve only shaves ~12.6%. Rejected
against D1's ~1.1 days. *Cost if D1 is wrong:* we spend ~$1.27b that the node's economy replaces
easily.

**R2 — Buy combat augs from factions instead of grafting.** Cheaper in raw money (5× node cost vs
grafting's effective ~15×) and carries **no entropy tax**. Rejected for entry because it needs
(a) faction invites gated on karma/combat/city, (b) a rep grind that competes for the *same player
slot*, and (c) an **install to apply**, which wipes money and fleet at exactly the moment we are
accumulating both. ⚠️ **Not rejected permanently** — it becomes the better route *after* the first
install, and entropy is cleared by that install. Logged as a live option, not a closed one.

**R3 — Chase hacking to clear the node.** `HackingLevelMultiplier` 0.35 with a 2× daemon difficulty.
BN6 measured this exact combination at **240–323 days**. Closed.

**R4 — Buy sleeves to parallelise the gate.** $10t. See D4.

**R5 — Treat "sleeves parallelise `Tracking`" as an established plank.** 🚨 It is the assumption at
the top of `BACKLOG.md` and part of why BN10 was chosen — and it silently assumed a *stable* of
sleeves. With **n=1** at **$10t** for the second, the parallelism upside is bounded by one actor
regardless of whether the mechanic works. **This weakens the BN10-first case but does not overturn
it** (the ordering also rests on the 1.25× redo-tax and the irreversible sleeve/memory window). It
should be corrected in `BACKLOG.md` and `docs/bitnodes.md` rather than left to be rediscovered.

---

## 6. Open questions — each with a default and a date

**Q41-1 — Does grafting's entropy tax meaningfully slow the batcher, creating a circular
dependency?** Entropy debuffs *all* multipliers ~2%/graft; at k=8 everything runs at **0.851**,
including the hacking mults funding the grafts. **Default:** accept it — the gate collapse is worth
far more than a 15% income haircut. **Expires 2026-08-20**; revisit only if measured income falls
faster than the graft plan gains.

**Q41-2 — Is `Mug` still the best exp source, or does gym/another crime beat it now that we have
money?** BN6 measured Mug at 0.179 exp/sec/stat with **$0 banked**; that constraint is gone.
**Default:** keep Mug (it is measured, and it also drives karma negative, which unlocks the combat
factions R2 needs). **Expires 2026-08-19.**

**Q41-3 — Should the sleeve be on `Synchronize`, `Shock Recovery`, or `Mug`?** Shock 21.18 is an
active exp penalty and gates sleeve augs at 0; sync 27.17 governs transfer. Three-way, and the
answer depends on remaining grind hours. **Default:** leave on `Synchronize` until the graft plan
is fixed, then re-derive. **Expires when D2's k is chosen.**

**Q41-4 — How much memory to buy, and when?** Memory is **BN10-exclusive and permanent across all
future nodes** (it sets starting sync everywhere). It is the one purchase here that can never be
made again. Currently **1**. **Default:** defer until the node is *safely* clearing — an
irreversible-window purchase should not compete with the clear itself. **Expires at Bladeburner
join**, at which point it must be priced explicitly rather than forgotten.

**Q41-5 — What is the aug ratchet FOR in a Bladeburner node?** (Reframed from "does it run" —
that was the wrong shape, per D3.) The ratchet's objective function targets a hacking gate that
BN10 does not have, so "point it at combat augs" is not a smaller version of its old job — it is a
different job, and it needs an objective before it needs code. Three candidate objectives, none
obviously right:
- **(a) Combat multipliers, to collapse the entry gate.** Directly on the critical path — but
  grafting already does this *without* faction rep, an install, or the player slot (§3.1). The
  ratchet would be a slower second route to a thing already solved.
- **(b) Bladeburner-relevant multipliers, for the rank grind.** ⚠️ BN6 measured this tier **inert**
  — every Bladeburner aug multiplies success chance, stamina or analysis, and we ran at 100%
  success / 99.9% duty. That measurement was taken in BN6's regime; per the `Overclock` lesson, ask
  what would have to change to reopen it (here: running at *less* than 100% success, which BN10's
  0.8× rank and fresh skill tree could plausibly produce).
- **(c) Nothing — retire it for this node.** Honest if (a) is dominated by grafting and (b) stays
  inert. Costs nothing but the temptation to keep a working engine busy.

**Default: (c), retire it for entry**, on the strength of D3's structural finding — but this is
explicitly a *deferred strategy question*, not a closed one, and it should be answered **after** the
Bladeburner join, when (b) becomes measurable rather than argued. **Expires at Bladeburner join.**

⚠️ **Do not restate the old framing** ("off until it has a combat-mult target"). It implied a
constant tweak would fix it; the scoring function is the fix.

**Q41-6 — Does a sleeve parallelise Bladeburner *rank*?** The original BN10 thesis. Not measurable
until `joinBladeburnerDivision()` succeeds, so it is **out of scope by construction** and moves to
the follow-on phase. Recorded here only so it is not lost between phases.

---

## 7. Proposed work items

1. **Economy first** — get the batcher to $1.27b. Nothing else on the critical path can start
   without it. Mostly a matter of letting existing engines run, plus D6's home RAM.
2. **Combat-gate driver** — a managed, instrumented replacement for the current *unattended manual
   crime loop*: crime selection, graft sequencing, sleeve assignment, and a live ETA against the
   587,755-exp target. This is the reusable-in-BN9 deliverable.
3. **Graft executor** — buy the D2 ladder in greedy order, respecting the focused-slot contention
   with the grind and with the four other slot claimants.
4. **Engine alignment** — D3 (quiesce `augfarmer.js` for entry; its *objective* is Q41-5, deferred
   to after the join), D3a (make `ratchet-mode.txt` a BN10 decision) and D6 (home RAM), plus adding the
   *fifth* claimant (grafting) to the player-action-slot hazard list in `BACKLOG.md`.

---

## 8. Anti-claims — things NOT to restate from this doc

- ❌ **"8 grafts give ×2.848 combat."** That was the per-aug product across four different stats.
  Per-stat, the correct figure is the §3.1 table.
- ❌ **"One sleeve gives +22.7% combat exp."** Bonus-time inflated; steady state **~+12.6%**.
- ❌ **"Sleeves parallelise the grind."** With n=1 at $10t, they add ~12.6%, not a second actor.
- ❌ **"Grafting is 45× faster."** ~3.5× on total wall-clock to the gate (88.7 h → 26.4 h at k=8).
- ⚠️ Every ETA here freezes a **rising** rate (mult climbs as grafts land) and is therefore
  **conservative** — the documented direction of every measured BN6 estimate. Read
  `docs/estimation-calibration.md` before quoting any of them.
