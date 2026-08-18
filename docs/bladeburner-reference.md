# Bladeburner reference (API surface + mechanics)

The durable, factual reference for this fork's Bladeburner mechanic: the access model, the
complete static catalog, every method's semantics, and — explicitly — what is **not** knowable
yet. Strategy lives in [`bn6-playbook.md`](bn6-playbook.md); this file is the interface.

**Split rationale:** the API surface is immutable (it's a property of the fork), while strategy
changes with every measurement. Keeping them apart means this file should almost never need
editing, and the playbook can churn freely. That's a deliberate departure from
[`gang-engine.md`](gang-engine.md), which fused both into one doc.

**Sources:** `markdown/bitburner.bladeburner.*.md` (41 method files) + the bladeburner type/enum
files, the in-game **Documentation → Bladeburner** page (read via CDP 2026-07-29), live read-only
probes (`src/bladeburnerprobe.js`, `src/bladeburneractionprobe.js`, `src/bladeburnerskillprobe.js`,
`src/combatgateprobe.js`), one live trial (`src/bladeburnertrial.js`), and — **added 2026-07-31,
after being missed entirely** — the **in-game Bladeburner panel itself** (World → Bladeburner, five
tabs). This build is a **fork** — these local files are authoritative and upstream/online NS docs
will mislead you.

⚠️ **Read the in-game panel before claiming any mechanic is undocumented** (§5). The first version
of this doc listed chaos, action levels, stamina, teams and all 12 skill effects as "not covered
anywhere"; every one of them is stated in that panel, which had never been opened.

**Written 2026-07-29, in BN6.1, at combat stats 1 and NOT employed by Bladeburner.** That state
is why §3's reachability table reads the way it does.

---

## 1. The two gates — both verified live

Bladeburner has **two separate memberships**, commonly conflated. They gate different things.

| | Call | Requirement | Verified |
|---|---|---|---|
| **Division** (the mechanic/employer) | `joinBladeburnerDivision()` | **All four combat stats ≥ 100** | API doc, verbatim |
| **Faction** (rep + augs) | `joinBladeburnerFaction()` | **Bladeburner rank ≥ 25** (+ BN6/7 or SF6/7) | `getFactionInviteRequirements("Bladeburners")`, live |

The faction requirement was read authoritatively via SF4.3 Singularity rather than assumed — the
in-game doc only says the faction invites agents who *"put in the work to gain a small amount of
rank"* and never states the number. Live return:

```json
[ { "type": "someCondition", "conditions": [
      { "conditions": [ {"type":"bitNodeN","bitNodeN":6}, {"type":"sourceFile","sourceFile":6} ] },
      { "conditions": [ {"type":"bitNodeN","bitNodeN":7}, {"type":"sourceFile","sourceFile":7} ] } ] },
  { "type": "bladeburnerRank", "bladeburnerRank": 25 } ]
```

Both join calls return `true` if you are **already a member**, so both are safe to call
idempotently as check-and-join.

⚠️ **`joinBladeburnerDivision()` can permanently cost you Stanek's Gift.** Verbatim from the API
doc: *"If you have SF 7.3, you will immediately receive "The Blade's Simulacrum" augmentation and
won't be able to accept Stanek's Gift after joining. If you want to accept Stanek's Gift, you must
do that before calling this API."* We hold SF7 level 0, so this does not bind today — it will the
moment SF7.3 exists. Related: Stanek's Gift is already an aug-free-fresh-node-only commitment.

### Sizing the combat-100 gate — it is cheap

Measured live (`logs/combatgateprobe-1785371660239.json`), via `ns.formulas.skills.calculateExp`:

| Combat mult | Exp per stat for level 100 |
|---|---|
| **1.28** (SF1.3 floor, no augs — our state) | **5,417** |
| 2 | 1,937 |
| 3 | 933 |
| 5 | 433 |
| 8 | 231 |

**Total across all four stats at our mult: 21,668 exp.** For scale, the BN2 clear banked **13.9
billion** hacking exp. This gate is rounding error by comparison — it is a short gym trip, not a
grind. This directly retires the *"~2–6h of gym training"* figure carried in the retired BN5 gang
tripwire; that estimate was for a karma grind, and it was never measured.

---

## 2. Access model

Interface-level precondition, verbatim from `bitburner.bladeburner.md`:

> You have to be employed in the Bladeburner division **and** be in BitNode 6/7 or have
> Source-File 6/7 in order to use this API.

Two conditions, ANDed. A BitNode can additionally disable the mechanic outright via
`BitNodeBooleanOptions.disableBladeburner` — **live-checked `false` in BN6.1**, so it is enabled
here.

`inBladeburner()` is the **only** documented exception ("Does not require API access"), and it is
0 GB. It is the correct probe before touching anything else.

---

## 3. Reachability, measured — 0 GB does NOT mean callable

Live sweep at combat stats 1 / not employed (`logs/bladeburnerprobe-1785371565371.json`):
**1 method worked, 9 threw.**

| Method | RAM | Result pre-employment |
|---|---|---|
| `inBladeburner()` | 0 GB | ✅ returned `false` |
| `getContractNames()` | 0 GB | ❌ threw |
| `getOperationNames()` | 0 GB | ❌ threw |
| `getBlackOpNames()` | 0 GB | ❌ threw |
| `getGeneralActionNames()` | 0 GB | ❌ threw |
| `getSkillNames()` | 0 GB | ❌ threw |
| `getBonusTime()` | 0 GB | ❌ threw |
| `getCurrentAction()` | 1 GB | ❌ threw |
| `getNextBlackOp()` | 2 GB | ❌ threw |
| `getRank()` | 4 GB | ❌ threw |

**✅ Post-join re-sweep, 2026-07-30 (`logs/bladeburnerprobe-1785411469942.json`): all 10/10 worked,
0 threw.** Same uniform-gate behavior confirmed from the other side — nothing partial, nothing
still locked at rank 0. `getRank()` read `0` (fresh join, no actions run yet); `getCurrentAction()`
read `null`; `getNextBlackOp()` read `{name: "Operation Typhoon", rank: 2500}`.

Every failure (pre-join) is the same message:

```
bladeburner.<method>: You must be a member of the Bladeburner division to use this API.
```

**This is the gang lesson repeating exactly.** `getTaskNames`/`getEquipmentNames` were 0 GB and
still threw before `createGang()`; here six 0 GB methods throw before joining the division. CLAUDE.md's
corollary holds: **documented RAM cost tells you nothing about preconditions.** The gate is uniform
across the API — it is not per-method, and it is not tiered by RAM cost.

### Two footguns found while writing the probe — both worth keeping

1. **Bracket-notation dynamic dispatch defeats the RAM analyzer, and the engine then kills your
   script uncatchably.** The probe's first version swept 14 getters via `ns.bladeburner[name]()`
   to keep RAM near zero. The static analyzer cannot resolve those, so it allocated nothing, and
   at runtime the engine killed the script with a RAM error that **no `try/catch` could catch** —
   producing no log, no `tprint`, and *no error modal*. Symptom: script appears in `ps` for an
   instant, exits, writes nothing. **Use static dot-notation for anything you need to catch**, and
   budget the real RAM. (The staged-breadcrumb write that diagnosed this is worth copying: write
   the output file after every stage, so a mid-run death still leaves the last-reached stage on
   disk.)
2. **A local helper named `probe` was billed 0.20 GB for `ns.dnet.probe`** on the name alone —
   CLAUDE.md's identifier-shadowing rule, confirmed live in `mem` output (16.40 GB → 16.20 GB on
   rename to `tryCall`). Add `probe` to the mental list of dangerous names alongside `ls`, `share`,
   `exec`, `hack`.

---

## 4. The static catalog — recovered from the type definitions

The live API refuses to list these, but the **enum types spell them out in full**. This is the
"read the whole interface — the types *are* the interface" rule paying for itself: we have the
complete catalog without joining anything.

**Action types** (`BladeburnerActionEnumType`) — note the type strings are **plural**:
`"General"` · `"Contracts"` · `"Operations"` · `"Black Operations"`

**Contracts (3):** `Tracking` · `Bounty Hunter` · `Retirement`

**Operations (6):** `Investigation` · `Undercover Operation` · `Sting Operation` · `Raid` ·
`Stealth Retirement Operation` · `Assassination`

**General actions (6):** `Training` · `Field Analysis` · `Recruitment` · `Diplomacy` ·
`Hyperbolic Regeneration Chamber` · `Incite Violence`

**Skills (12):** `Blade's Intuition` · `Cloak` · `Short-Circuit` · `Digital Observer` · `Tracer` ·
`Overclock` · `Reaper` · `Evasive System` · `Datamancer` · `Cyber's Edge` · `Hands of Midas` ·
`Hyperdrive`

**Black Operations (21, in enum order):**
`Operation Typhoon` · `Operation Zero` · `Operation X` · `Operation Titan` · `Operation Ares` ·
`Operation Archangel` · `Operation Juggernaut` · `Operation Red Dragon` · `Operation K` ·
`Operation Deckard` · `Operation Tyrell` · `Operation Wallace` · `Operation Shoulder of Orion` ·
`Operation Hyron` · `Operation Morpheus` · `Operation Ion Storm` · `Operation Annihilus` ·
`Operation Ultron` · `Operation Centurion` · `Operation Vindictus` · **`Operation Daedalus`**

⚠️ **Enum *keys* are not valid inputs — the *values* are.** `BladesIntuition` is the key;
`"Blade's Intuition"` is what the API accepts. Skill and city names are documented
**case-sensitive, exact match**. The docs do **not** state that `getBlackOpNames()` returns
rank-sorted order — only "the names of all Bladeburner Black Ops".

**`Operation Daedalus` is the last black op**, and completing the final black op is the
alt-destroy path for the BitNode. See the playbook.

---

## 5. Mechanics — everything the in-game doc actually says

The in-game **Documentation → Bladeburner** page is **three paragraphs**. Reproduced in full
substance because it is short and two of its claims are strategically load-bearing:

- **Purpose:** Bladeburner divisions monitor/"manage" rogue Synthoids; working for them "gives
  access to powerful enhancements and **a goal of destroying BitNodes** by operating against
  increasingly strong Synthoid opposition."
- **Skills:** "Bladeburner skills add a **persistent bonus while in the BitNode where they were
  purchased**. Bladeburner skills are purchased with Bladeburner **skill points, not money**."
- **Faction and Rank:** "While **Bladeburner rank and skill points persist after any augmentation
  installs**, faction reputation **will be reset**. Bladeburner faction reputation can only be
  gained through Bladeburner actions."

### 🔑 The two facts that matter most

1. **Rank and skill points SURVIVE augmentation installs.** Directly opposite to gang faction rep
   (measured 2026-07-23: NiteSec rep 21.5m → 3.8m across an install) and to hacking level. Progress
   toward the black-op ladder is therefore **monotonic across the whole node** — installs cost you
   money, hacking level and fleet, but not rank.
   - 🔴 **BUT NOT ACROSS A NODE CHANGE — do not let this fact stand in for the bigger one.** The
     scope word is **"installs."** Per the Skills bullet above, *"Bladeburner skills add a persistent
     bonus **while in the BitNode where they were purchased**,"* and destroying a node persists only
     **Source-Files, scripts on home, and Intelligence** (`bitnodes.md`). BN6's ~463,000 rank and
     ~150,000 SP **did not carry forward.** Every node entry re-grinds rank from **0**.
   - 📌 **Why this went unnoticed for a day (2026-08-16, found by cold audit):** the install-survival
     claim is *adjacent, true, and repeated everywhere*, so it reads as answering the node-change
     question without ever being checked against it. **A true neighbouring claim is the easiest way
     to not check the one that matters.** The planning consequence — node order should be chosen by
     **redo-tax `(1/BladeburnerRank) × BladeburnerSkillCost`**, not by "where does progress persist"
     — is in `bitnodes.md` § "Node order, re-derived after actually running Bladeburner".
2. **Bladeburner faction rep resets on install AND can only be earned through Bladeburner actions.**
   No `workForFaction` path, no donation path. So Bladeburner *augs* are expensive in a way the
   ratchet's usual rep machinery cannot shortcut, while *rank* is cheap in a way nothing else is.

### 🔴 CORRECTION 2026-07-31 — the in-game Bladeburner UI documents nearly all of this

**The section that used to sit here listed chaos, population estimation, action levels, stamina,
and all 12 skill effects as "not covered anywhere." That was wrong.** Every one of them is stated
plainly in the **in-game Bladeburner panel** (World → Bladeburner), which had never been opened —
all prior work came from the 41 `markdown/` API files plus the three-paragraph *Documentation →
Bladeburner* page. Kenneth noticed the panel existed on 2026-07-30 and asked whether it had been
read; it had not.

⚠️ **The generalised lesson, and it is sharper than CLAUDE.md's existing rule.** "Read the whole
interface before designing against it" was followed *for the API* — exhaustively — and still
produced a badly wrong model, because **the rendered game UI is also part of the interface**, and
in this build it is where the mechanics are actually documented. A method list plus a types file is
not the whole interface when the game ships an explanatory panel. **Check the in-game UI for a
mechanic before declaring anything about it undocumented.** Cost of skipping it here: a shelving
verdict (`bn6-playbook.md`) built on assumptions the game explicitly contradicts.

**Read via CDP:** `cli.mjs goto Bladeburner`, then `cli.mjs click "<tab>"` + `cli.mjs body` per tab.
Five tabs: **General · Contracts · Operations · BlackOps · Skills**. `body` beats `shot` here — the
panel scrolls, and `body` captures the whole DOM text including off-screen content.

### The 12 skills — full effects, from the Skills tab

**🔑 `Skill Points: you gain one skill point every 3 ranks.`** Verbatim from the panel. This is the
rank→SP conversion that was previously called unmeasured, and it is the single most important
number for any long-horizon projection: **rank 400,000 ⇒ ~133,000 skill points banked.**

**Stacking rule, verbatim:** *"the benefit for that skill is additive. However, the effects of
different skills with each other is multiplicative."*

| Skill | Effect **per level** | Notes |
|---|---|---|
| **Overclock** | **−1% action time** | ⚠️ **Max Level 90** ⇒ actions at **10% of base time, a 10× throughput multiplier.** The highest-leverage skill in the tree by a wide margin. |
| Blade's Intuition | +3% success, **all** Contracts/Operations/BlackOps | the broad one |
| Cloak | +5.5% success, **stealth**-related | |
| Short-Circuit | +5.5% success, **retirement**-related | |
| Digital Observer | +4% success, all **Operations + BlackOps** | |
| Tracer | +4% success, all **Contracts** | |
| Reaper | +2% **effective combat stats** for Bladeburner actions | compounds with BlackOps' combat-stat sensitivity |
| Evasive System | +4% effective **dexterity and agility** | |
| Datamancer | +5% effectiveness in **population analysis/investigation** | improves estimate-accuracy actions |
| Cyber's Edge | +2% **max stamina** | |
| Hands of Midas | +10% **money from Contracts** | economy only, not rank |
| Hyperdrive | +10% **experience** from actions | |

Observed SP cost for the *next* level (2026-07-31, at levels 1–3): **4 SP** for most, **5 SP** for
Blade's Intuition (lvl 1), Cloak (lvl 3), Hands of Midas (lvl 1). Costs escalate with level; the
level-0 costs were 1–3 SP (`bladeburnerskillprobe`), so the curve is shallow early.

#### ✅ MEASURED 2026-08-15 — the success skills are MULTIPLICATIVE, and they clear the black-op ladder outright

Success multiplier for Operations/BlackOps is
**`(1 + 0.03 × Blade's Intuition) × (1 + 0.04 × Digital Observer)`** — a *product*, so balanced
levels beat a lopsided stack at equal spend (marginal returns at 200/200 are 0.00429 vs 0.00444,
near-identical). Bought live via `src/bbskillbuy.js`:

| | Before | After | Cost |
|---|---|---|---|
| Blade's Intuition · Digital Observer | 25 · 25 | **200 · 200** | 83,195 SP |
| Success multiplier | ×3.50 | **×63.00** | |
| `Overclock` | 17 | **90** | 5,636 SP |
| Action-time multiplier | ×0.83 | **×0.10** | |

🔑 **The result that matters, and it is stronger than a lifted lower bound: EVERY black op's `pMax`
went to `1.0000`.** Before, the back half of the ladder had *falling upper bounds* — Daedalus read
`[0.0062, 0.0670]`, i.e. a **real ceiling** of 6.7%, which by this doc's own pair-reading rule is a
genuine decline and not an intel gap. After: `[0.1746, 1.0000]`, and ops 1–9 read a **converged
`[1.0000, 1.0000]`**. The ceilings were not narrowed, they were *removed* — skills act on the
underlying chance, not on the estimate's confidence.
- ⚠️ **This does not make the estimator trustworthy** (it reported `[1.0, 1.0]` on `Investigation`
  and realised 0.74%). It is corroborated by outcome instead: ops fired first-try, in order.
- ⚠️ **~114,000 SP sat idle for weeks because Stage A never needed them** — `Tracking` runs at 100%
  realised success, so success skills bought nothing *there*. The pile was not waste, but the engine
  has no mechanism that ever notices a banked resource becoming useful; that judgement is external.

The Skills tab also displays **live aggregate multipliers**, which is the cleanest way to read
current standing: `Total Success Chance`, `Stealth/Retirement/Operation/Contract Success Chance`,
`Action Time`, `Effective Strength/Defense/Dexterity/Agility`, `Synthoid Data Estimate`, `Stamina`,
`Contract Money`, `Experience Gain`.

### Chaos, population, teams and levels — all documented in-panel

- **Chaos is per-city and has explicit levers.** `Diplomacy` — *"reduce the chaos level of your
  current city"* (city-scoping confirmed by the game, not inferred). `Stealth Retirement Operation`
  — *"will DECREASE the chaos level of your current city."* Raising it: `Bounty Hunter`,
  `Retirement`, `Sting Operation`, `Raid`, and `Incite Violence` (*"increasing the chaos level of
  **all** cities"*).
- ⚠️ **Chaos also rises on its own, from world events.** The panel's event log shows unprompted
  `Tensions between Synthoids and humans lead to riots in <city>! Chaos increased` — so chaos is not
  purely self-inflicted, and a steady state requires active suppression, not just restraint.
  - 🧮 **Quantified 2026-08-03, and the drift is large: ~10 chaos/hour with the engine running NO
    contracts or operations at all.** Sector-12 went **69.1 → 177.7 over 10.6 hours** during which
    `bladeburnermanager.js` was parked in `Hyperbolic Regeneration Chamber` the entire time (an
    engine bug — see that day's CHANGELOG entry — which made the window an accidental but clean
    natural experiment: chaos drift with the player contributing nothing). **The cost is measured,
    not theoretical: Tracking's EV/sec fell 0.0211 → 0.0084 (2.5×) over exactly that span.**
    ⚠️ Two caveats on this number: it is a **single** window with no mid-points sampled (only the two
    endpoints), and chaos was roughly *flat* during the preceding hour of actual Tracking, which is
    the opposite of what "contracts raise chaos" predicts — so treat the ~10/hour as an order of
    magnitude, and do not infer a mechanism from it. **The design implication is solid regardless:
    an engine that never runs `Diplomacy` will bleed success chance indefinitely, no matter how
    restrained its action choice is.**
- **Population migrates between cities continuously** (`Intelligence indicates that a large number
  of Synthoids migrated from X…`), so per-city desirability drifts on its own.
- **`Incite Violence` regenerates inventory** — *"generate additional contracts and operations"* —
  answering how contract/operation counts are replenished.
- **Teams:** recruited via `Recruitment`, usable on **Operations and BlackOps only**, and *"having a
  larger team will improve your chances of success."* `Set Team Size` is exposed per-action.
- **Action levels:** *"You can unlock higher-level contracts by successfully completing them.
  Higher-level contracts are more difficult, but grant more rank, experience, and money."* Same text
  for operations. This is the autolevel progression the API's `level` argument refers to.
- **Failure costs:** contracts cost **HP** (→ hospitalization); operations cost **HP and rank**;
  black ops incur *"heavy HP and rank losses."* **`Investigation` is the exception — no HP loss on
  failure.** The panel tracks `Num Times Hospitalized` and `Money Lost From Hospitalizations`
  (read 22 / **$229.5m** on 2026-07-31 — hospitalization is a real, uncounted cost of grinding).
  ⚠️ **No `ns.bladeburner.*` getter exposes either counter** — confirmed by exhaustive read of §6's
  API surface. `bladeburnermanager.js` (Phase 39, S9) therefore *infers* a hospitalization from a
  single-tick transition where `hp.current` jumps to `hp.max` from a prior sample below max, while
  the engine's own chosen action on the prior tick was **not** `Hyperbolic Regeneration Chamber`
  (which restores ~2 HP/min — too slow to produce a full-heal jump in ~1s). This inferred count
  (`hospitalizationsInferred`) is **explicitly second-class**: the panel's own counter, read over
  CDP, is the authoritative figure, and a mismatch between the two retires the inference as
  untrustworthy rather than averaging the two.
- **BlackOps, verbatim:** *"Black Ops success significantly affected by combat stats. Many Ops
  benefit from Hacking skill. Unaffected by Charisma."*
- 🔴 **`Raid` CONSUMES the city, and a drained city stalls EVERYTHING — measured 2026-08-03, and
  this is the single most important Stage-B constraint found so far.** Two 200-second Raid windows
  (~6 attempts, 4 confirmed successes) took **Volhaven from 1,170.6m Synthoid population and 75
  communities to 0 population and 71 communities.** At zero population the success chance of **every
  action collapses to 0 — contracts included**: `Tracking` scored *exactly* 0.0, every operation went
  negative, `pickRankAction` returned `null` on every tick, and the engine sat in overhead with rank
  flat until the city was changed. Moving to Ishima restored Tracking to 0.0879 instantly.
  - 🧮 **The arithmetic that matters for the win path:** ~6 Raids drained one city. Six cities ⇒
    roughly **36 Raids** before all are exhausted, at 97.44 rank/success ≈ **3,500 rank — 0.9% of the
    400,000 gate.** So **Raid cannot clear the node by itself**; it is a *consumable*, not an engine,
    unless population regenerates.
  - # 🚨 RETRACTED IN FULL 2026-08-06 (evening) — EVERYTHING FROM HERE TO THE END OF THIS BULLET IS WITHDRAWN
    **The claim "Raid permanently kills a city" was never measured. Do not cite any of it.** The one
    reading it all rested on — `getCityEstimatedPopulation` = 0 for Volhaven, and every action there
    scoring 0 — turns out to mean **"unknown," not "zero."**

    **The measurement that overturns it** (`bladeburneractionprobe.js`, run while occupying Volhaven,
    2026-08-06): `getActionEstimatedSuccessChance` returns a **[MIN, MAX] range**, and for *every one
    of the nine* contracts/operations in Volhaven it reads **`[0.0000, 1.0000]`** — maximum
    uncertainty. Ishima, worked continuously, reads **`[1.0000, 1.0000]`** — converged. Volhaven's
    action inventory is also **intact and large** (2,727 Raids · 3,496 Undercover · 1,432
    Assassinations remaining), which a destroyed city would not have.

    🔑 **Why this fooled us three times: `bladeburnermanager.js:304` scores on `pMin`** — the
    *minimum* of that range. An unscouted city and a genuinely dead city therefore produce an
    **identical** `scorePerSec: 0`. The "behavioural confirmation" logged below was not independent
    evidence at all; it was the same uninformed estimate read through its most pessimistic bound.

    ⚠️ **Compounding gap — `Field Analysis` is NOT in the engine's action pool.** It is the documented
    counter (*"will improve the accuracy of your Synthoid population estimated in the current city"*,
    and proven 2026-07-30 to collapse Raid's range from `[0.075, 0.097]` to a point value). Because
    the engine cannot scout, it can never recover intel on a city it has lost track of — it sees
    `pMin = 0` forever and mistakes a **fixable intelligence problem for a dead city**.

    **Status of everything downstream:** Raid's true cost to a city is **UNKNOWN**; whether population
    regenerates is **UNKNOWN**; the Stage B closure that rested on city-consumption is **REOPENED**
    (see Q11/Q14 in §10). What survives untouched is only what was measured *directly*: Raid does
    consume Synthoid population per its in-game description, and on 2026-08-03 the engine did stall
    in Volhaven — but that stall is now explained by lost intel, not a dead city.

    📌 **The lesson, which cost three separate commits to learn: an ESTIMATE is not a MEASUREMENT.**
    The `[min, max]` range was available from the first minute and would have shown this immediately.
    Any `ns.bladeburner` value whose name contains `Estimated` must be read as a range, and any
    conclusion drawn from a single-point read of one is not evidence. The original text follows,
    struck through, only so the reasoning error stays legible.

  - ~~🔴 **✅ ANSWERED 2026-08-05 — POPULATION DOES NOT REGENERATE. The drain is PERMANENT.**~~ Volhaven
    was drained to 0 on 2026-08-03 ~9:14pm; re-read **47.6 hours later** it is still **exactly 0**.
    Verified two ways so a stale estimate couldn't fake it: (1) the engine's own six-city sample
    (`chaosByCity`, resampled live every cycle) and (2) a deliberate `switchbbcity.js` round trip
    (Ishima → Volhaven → Ishima, 40s, $0, zero rank lost) so the reading was taken **from inside the
    city**. Both read 0.
    - 🔴 **CORRECTED 2026-08-06 — the "frozen to 14 decimal places" evidence below was INVALID, and
      the conclusion it supported was right only by luck. Do not reuse this reasoning.**
      The original argument was: the four unworked cities read identical to 14 decimals across 47.6h
      (Aevum 569,114,813.6538942 · Chongqing 1,465,421,806.969731 · Sector-12 620,691,613 · New Tokyo
      1,085,215,120.659082), therefore population is static everywhere. **That inference is wrong.**
      `getCityEstimatedPopulation` is *explicitly an estimate*, and it **only refreshes for the city
      you currently occupy.** Proof, 2026-08-06 over ~22h: those same four cities were *still* byte-
      identical while **chaos moved in every one of them** (Sector-12 633 → 1,492, Chongqing 271 →
      651, Aevum 49 → 91) — so `getCityChaos` is live everywhere and `getCityEstimatedPopulation`
      is not. **A frozen population reading is the instrument idling, not the world holding still.**
      ⚠️ **Never compare `getCityEstimatedPopulation` across cities or across time unless you
      occupied each city at each reading.** (This also dissolves the apparent contradiction with the
      in-panel "population migrates between cities continuously" line — the panel was never wrong;
      the estimate just wasn't watching.)
    - 🧮 **What actually happens: the OCCUPIED city's population GROWS, and grows proportionally.**
      Ishima went **1,134,484,224 → 2,580,846,305 in ~22.2h** while being worked — ×2.28, or about
      **+3.8%/hour compounding** (independently re-sampled 25 min later at 2,548m → 2,581m, ≈+77m/h,
      consistent). The earlier "+1.73m over 48h" figure was the same stale-estimate artifact.
    - 🔑 **Proportional growth is the MECHANISM that makes a drained city permanent — and it is
      tidier than a special rule: zero cannot grow.** `0 × 1.038 = 0`, forever. That single fact
      explains both observations at once (Volhaven pinned at exactly 0, Ishima more than doubling)
      without needing population to be "static."
    - Communities *do* recover (Volhaven 71 → 77, Ishima 39 → 44 over the same window). **Population
      does not.** Communities gate whether Raid is *possible*; population is what drives success
      chance — so the recovering quantity is not the one that matters.
    - ~~✅ **Re-confirmed BEHAVIOURALLY 2026-08-06** … Scores derive from success chance, which is
      computed from **true** population rather than the estimate — so this is the world reporting the
      city is dead, not the instrument idling.~~
      🚨 **FALSE, and this specific sentence is the error that made a retraction necessary.** Scores
      do **not** derive from true population — `bladeburnermanager.js:304` reads `pMin` from
      `getActionEstimatedSuccessChance`, i.e. the pessimistic bound of *the same estimate*. The
      "independent behavioural confirmation" was circular.
    - 🔑 **Therefore `Raid` is disqualified permanently, and Stage B with it** (Raid was the only
      operation worth opening the gate for — see the net-EV table in §5). The trade is: ~585 rank
      harvested per city, against a city that pays **18,900 rank/day** via Tracking. **Ishima repays
      the entire Raid harvest in 45 minutes.** Q11's literal question (HP per failed Raid) is now
      moot — the answer is "never run it," reached without ever spending HP to find out.
  - ⚠️ **Implication for Stage B:** opening it as a continuous Raid grind would drain the current
    city in minutes and then stall the whole engine, contracts and all. Any Stage-B policy needs a
    **population floor** plus city rotation, not just an HP guard. `bladeburnermanager.js`'s
    `updateCityStock` now raises a `population-drained` breach below `MIN_CITY_POPULATION` (1m) so
    this failure mode is detected rather than rediscovered.
- **`Raid` has a precondition:** *"there must be an existing Synthoid community in your current city
  in order for this Operation to be successful"* — so `Synthoid Communities` (panel stat) gates it.

### Second full five-tab sweep, 2026-08-02 — what the first one missed

The 2026-07-31 read was taken at rank ~0 with almost nothing invested. This one was taken at
**rank 1,221** with 49 skill levels bought, and it exposes mechanics that only become visible once
the engine has been running. Raw captures: five `cli.mjs body` dumps, one per tab.

**🔑 Contracts carry NO rank loss on failure — only operations do.** Live probe
(`bladeburneractionprobe-1785682107595.json`): `rankLoss: 0` for all three contracts, and the event
log corroborates (`Tracking contract failed! Took 3 damage.` — no rank line), versus
`Investigation failed! Lost 0.343 rank.` for operations. **Contracts are therefore strictly
downside-bounded**: the only failure cost is HP. This is the single most important asymmetry for a
low-success-chance engine and it was not previously recorded.

**⚠️ Autolevel drives actions to max level and can collapse net EV.** Action level raises rank/exp/
money per success *and* raises difficulty. With autolevel left on, observed 2026-08-02:

| Action | Level | Success chance | Record |
|---|---|---|---|
| Tracking (contract) | **23 / 23** | 20.1% ~ 58.8% | 321 ✓ / 36 ✗ |
| Investigation (operation) | **8 / 8** | 5.3% ~ 15.5% | 46 ✓ / **301 ✗** |
| Raid (operation) | 5 / 5 | 1.9% ~ 5.5% | 18 ✓ / 79 ✗ |

**There is an EV optimum in action level and it is not necessarily max.** `setActionLevel` +
`setActionAutolevel` exist precisely to control this; nothing had ever used them.

**🔑 The payout ratio across action tiers is enormous, and success chance is the only gate.**
Measured rank-per-success at current levels: **Tracking 0.73 · Bounty Hunter 0.90 · Investigation
3.53 · Undercover 4.40 · Sting 5.50 · Stealth Retirement 22.0 · Assassination 44.0 · Raid 80.5.**
Raid pays **110× Tracking per success** but currently lands 5.3% of the time. Expected rank/sec at
present:

| Action | Time | Success (mid) | EV rank/s |
|---|---|---|---|
| **Tracking** | 13s | 54.9% | **0.0307** |
| Bounty Hunter | 17s | 35.3% | 0.0187 |
| Retirement | 14s | 42.9% | 0.0184 |
| Raid | 64s | 5.3% | 0.0126 |
| Undercover Operation | 34s | 15.4% | 0.0100 |
| Investigation | 33s | 14.9% | 0.0077 |
| Sting Operation | 44s | 9.5% | 0.0016 |
| Stealth Retirement | 67s | 6.2% | **−0.0077** |
| Assassination | 100s | 3.9% | **−0.0211** |

⚠️ **Two actions are net-negative on rank right now.** An engine that picks by rank-per-success
rather than by EV will happily grind backwards.

#### 🔄 Re-measured 2026-08-05 at rank 19,571 — the table above is OBSOLETE, keep it only for the shape

The 2026-08-02 numbers were taken at rank ~1,221 with 49 skill levels. After Phase 39's engine ran
(Blade's Intuition **25**, Digital Observer **25**, Tracer **25**), success chances are transformed —
contracts are now *capped*. Fresh sweep (`bladeburneractionprobe.js`, Ishima, chaos 9.3), with EV
computed **net of `rankLoss` on failure**, which the older table ignored:

| Action | Tier | Time | Success | Rank/action | **Net EV rank/s** | vs Tracking |
|---|---|---|---|---|---|---|
| **Tracking** | contract | 47s | **100%** | 10.30 | **0.2191** | 1.00× |
| **Raid** | operation | 68s | 66.7% | 97.44 | **0.9337** | **4.26×** ⛔ city-killer |
| Assassination | operation | 97s | 64.5% | 44.0 | 0.2778 | 1.27× |
| Stealth Retirement | operation | 65s | 72.6% | 22.0 | 0.2372 | 1.08× |
| Undercover Operation | operation | 33s | 100% | 4.40 | 0.1333 | 0.61× |
| Investigation | operation | 34s | 100% | 4.04 | 0.1190 | 0.54× |
| Sting Operation | operation | 42s | 84.2% | 5.50 | 0.1083 | 0.49× |
| Bounty Hunter | contract | 19s | 100% | 1.25 | 0.0656 | 0.30× |
| Retirement | contract | 13s | 100% | 0.60 | 0.0462 | 0.21× |

🔑 **Three findings that reorder the whole strategy:**
1. **Raid is the *only* operation that meaningfully beats contracts** — and it permanently destroys
   the city (§ above). Every other operation is either **worse than Tracking** (Investigation,
   Undercover, Sting) or beats it by so little (Assassination 1.27×, Stealth Retirement 1.08×) that
   it cannot justify introducing failure/HP risk into a working 100%-success grind. **Stage B has no
   surviving candidate.**
2. **Contracts are at 100% success.** Success chance has stopped being the binding constraint —
   which retires the premise behind the entire Bladeburner aug tier (see the aug table below).
3. ~~**The remaining levers are rank-per-action and action time, not success.** … **`Overclock` the
   only large multiplier left** (×8.3 still on the table).~~ 🔴 **RETRACTED 2026-08-06 by the Q10
   measurement below — Overclock buys NOTHING. Do not quote the ×8.3.**

#### ✅ Q10 ANSWERED 2026-08-06 — stamina is spent **PER ACTION**, and that kills `Overclock`

Measured by `src/q10probe.js` (read-only, 1 Hz, 593 samples, Overclock 17, Tracking at 51.0s). Across
**449 rank-producing seconds** stamina fell **exactly 9 times**:

- every drop **precisely 2.162** — identical, not noisy
- every drop landed on a **rank tick** (action completion)
- drops spaced at t = 41, 91, 143, 194, 245, … **≈51s apart = exactly the action time**
- stamina **rose** on 583 of 592 intervals ⇒ regeneration is **continuous at 0.03352/s**

So cost is a fixed lump charged at completion, not an accrual per second. The consequence is
arithmetic:

```
spend while acting continuously = 2.162 / 51s = 0.04239 /s
regeneration                    =              0.03352 /s   -> ALREADY stamina-limited
sustainable actions/hour = regen x 3600 / cost = 55.8   <-- INDEPENDENT OF ACTION TIME
```

`Overclock` 90 would permit **585.9** actions/hour by the clock; stamina caps us at **55.8**
regardless. Live corroboration: the engine's rank-producing fraction is already **68.5%** — roughly a
third of every hour is spent regenerating. ~~**`Overclock` is closed permanently, and the ~4,000 banked
SP were NOT spent on it.**~~

🔴 **"CLOSED PERMANENTLY" IS RETRACTED 2026-08-15 — the measurement is right, its SCOPE was wrong,
and `Overclock` was bought to 90.** Everything above this line still holds *for the contract grind*:
stamina is per-action, so sustainable actions/hour is `regen × 3600 / cost` and action time cancels
out. **That argument depends on stamina being the binding constraint, and it only binds when actions
are short.** Black ops run **185s–7,377s** each — ~0.5 actions/hour at the long end, **two orders of
magnitude under the 55.8/hour stamina ceiling**. There, nothing is competing for stamina and the
binding constraint is plain wall-clock time, which is exactly what `Overclock` cuts.
- **Measured 2026-08-15** (`src/bbskillbuy.js`, `logs/bbskillbuy-*.json`): `Overclock` 17 → **90**
  for **5,636 SP**, action-time multiplier **0.83 → 0.10**. Whole 21-op ladder serial time
  **16.56h → 1.88h**.
- 📌 **The durable lesson, and it is a sibling of "an estimate is not a measurement": A MEASUREMENT
  INHERITS THE REGIME IT WAS TAKEN IN.** Q10 measured a real invariant under a hidden precondition
  (*stamina binds*), the precondition was never written into the conclusion, and the conclusion then
  read as universal for nine days. **When recording a "closed permanently," record what would have to
  change for it to reopen.** Here it was one word: *short* actions.

🔑 **The reordering this forces — flagged in the pre-measurement note as the thing that would change
if Q10 came back per-action, and it did:** when stamina is the binding constraint and each action
costs the same, the correct objective function is **rank per ACTION**, not rank per second. The
engine currently runs `objectiveMode: "per-second"`. Net-of-`rankLoss` rank per action:

| Action | Rank/action (net of failure) | vs Tracking |
|---|---|---|
| Raid | 65.0 | 6.3× ⛔ city-killer |
| **Assassination** | **26.96** | **2.6×** |
| Stealth Retirement | 15.42 | 1.5× |
| **Tracking** (current) | **10.30** | 1.00× |
| Sting / Undercover / Investigation | 4.55 / 4.40 / 4.04 | <1× |

⚠️ **DO NOT act on that table yet — it rests on an unverified premise.** The 2.162 cost was measured
for `Tracking` **only**. If stamina cost is **flat per action**, Assassination is genuinely ~2.6×
better and Stage B should reopen *for Assassination* (never Raid). If cost instead scales with action
**time**, Assassination's 97s vs Tracking's 51s cancels the gain and nothing changes. **New open
question Q13: is per-action stamina cost flat, or proportional to action time?** It is cheap to
settle — run `q10probe.js` while a different-duration action is active and compare the drop size.

**⚠️ There is ONE player-action slot — Bladeburner actions block gym, crime, and faction work.**
This is why `The Blade's Simulacrum` exists: *"allows you to perform Bladeburner actions and other
actions (such as working, committing crimes, etc.) at the same time."* Consequence: **you cannot
buy combat stats at the gym while grinding rank.** Rep req is only **1.25k** (trivially met) but the
price is **$150b base / $1.029t at current aug-count escalation**.

**🔑 Bladeburner actions regenerate their own combat-stat prerequisite, for free.** Install #37
(`ratchet-log.json`) reset `hackLevel 165 → 1` and, with it, all combat stats. **26 hours later:
hacking 167, combat 171/171/202/195** — the combat climb came entirely from Bladeburner action exp
(dex/agi ran ahead of str/def, matching which stats the actions exercise). So the combat-100 join
gate is a **one-time** cost, not a per-install tax. `Hyperdrive` (+10% exp/level) accelerates it.

**Faction membership survives an install; faction rep does not.** Install #37's pre/post snapshots
both list `Bladeburners` in `factions` while every other faction is dropped — consistent with rank
(which persists) being the membership gate. Rep read `0` on both sides and has since climbed to
**3,869**.

**Max HP is defense-derived and very small.** `maxHp = 10 + floor(defense/10)` → **27** at defense
171. Failed contracts cost 3 HP, so **9 failures = hospitalisation**. Counter read **81
hospitalisations / $837.4m lost** on 2026-08-02 (up from 22 / $229.5m on 2026-07-31). Hospitalisation
is a real and fast-growing money sink, and it scales *down* with defense investment.

### The Bladeburner aug shop — rep gates and prices

Read live 2026-08-02 via `augcheck.js faction "Bladeburners"`. **Prices shown are at that moment's
aug-count escalation (~6.86× base); base prices are the stable number.** ⚠️ **Rep resets on every
install and can only be re-earned through Bladeburner actions** — this is the binding constraint on
the whole tier, not the money.

| Aug | Rep req | Base price | Why it matters |
|---|---|---|---|
| The Blade's Simulacrum | 1.25k | $150b | **Frees the player-action slot** (act + Bladeburn simultaneously) |
| EsperTech Bladeburner Eyewear | 1.25k | $165m | cheapest entry |
| EMS-4 Recombination | 2.5k | $275m | |
| ORION-MKIV Shoulder | 6.25k | $550m | |
| BLADE-51b Tesla Armor | 12.5k | $1.375b | gateway to the whole Tesla chain |
| Hyperion Plasma Cannon V1 | 12.5k | $2.75b | |
| BLADE-51b …: IPU Upgrade | 15.0k | $1.1b | `bladeburner_analysis` ×1.15 |
| Vangelis Virus | 18.75k | $2.75b | |
| BLADE-51b …: Power Cells | 18.75k | $2.75b | |
| Blade's Runners | 20.0k | $8.25b | |
| BLADE-51b …: Energy Shielding | 21.25k | $5.5b | `bladeburner_success_chance` ×1.06 |
| Hyperion Plasma Cannon V2 | 25.0k | $5.5b | |
| I.N.T.E.R.L.I.N.K.E.D | 25.0k | $5.5b | |
| GOLEM Serum | 31.25k | $11b | |
| BLADE-51b …: Unibeam | 31.25k | $16.5b | `bladeburner_success_chance` ×1.08 |
| Vangelis Virus 3.0 | 37.5k | $11b | |
| Glibness Enhancement | 40.5k | $2.5b | |
| **BLADE-51b …: Omnibeam** | **62.5k** | $27.5b | `bladeburner_success_chance` ×1.10 — top of the tree |

🧮 **Rep timeline at the measured 0.086 rep/s (Tracking):** 12.5k rep = **1.7 days** at 100% duty
(~5.6 days at 30%); 62.5k rep = **8.4 days** at 100% duty (~28 days at 30%). All four
`bladeburner_*` player mults read **1.00** as of 2026-08-02 — the entire tier is uninvested.

#### 🔴 VERDICT 2026-08-05 — the entire tier is worthless to this engine. Do not buy it.

Full `augcheck.js faction Bladeburners` sweep of all 18 augs' `bladeburner_*` multipliers:

| Aug | success | max stamina | stamina gain | analysis |
|---|---|---|---|---|
| EsperTech Bladeburner Eyewear | ×1.03 | — | — | — |
| EMS-4 Recombination | ×1.03 | — | ×1.02 | ×1.05 |
| ORION-MKIV Shoulder | ×1.04 | — | — | — |
| Hyperion Plasma Cannon V1 / V2 | ×1.06 / ×1.08 | — | — | — |
| BLADE-51b Tesla Armor | ×1.03 | — | ×1.02 | — |
| …: Power Cells / Energy Shielding | ×1.05 / ×1.06 | ×1.05 / — | ×1.02 / — | — |
| …: Unibeam / Omnibeam | ×1.08 / ×1.10 | — | — | — |
| …: IPU Upgrade | ×1.02 | — | — | ×1.15 |
| Vangelis Virus / 3.0 | ×1.04 / ×1.05 | — | — | ×1.10 / ×1.15 |
| I.N.T.E.R.L.I.N.K.E.D | — | ×1.10 | — | — |
| Blade's Runners | — | ×1.05 | ×1.05 | — |
| GOLEM Serum | — | — | ×1.05 | — |
| Glibness Enhancement | — | — | — | — |
| The Blade's Simulacrum | — | — | — | — |

🔑 **Every aug in the tree multiplies exactly one of four things: success chance, max stamina,
stamina gain, or analysis. NOT ONE increases rank-per-action or reduces action time.** That structural
fact is still true — but the 2026-08-05 conclusion drawn from it ("the entire tier is worthless") was
**half wrong**, and the corrections are inline below:

- **Contracts run at 100% success** → every `bladeburner_success_chance` aug does *literally
  nothing*. The full reachable success stack (~×1.49 combined) multiplies a capped stat.
  **This half of the verdict stands.**
- ~~**Duty cycle is 99.9%** → stamina augs buy no additional uptime.~~ 🔴 **WRONG — CORRECTED
  2026-08-06.** `dutyCycle` counts **regeneration as on-duty**, so 99.9% never meant what it was used
  to mean here. The metric that binds is the **rank-producing fraction, measured at 68.5%**, and Q10
  proved it is throttled by *exactly* what these augs boost. Sustainable throughput is
  `staminaRegen x 3600 / costPerAction`, so **`bladeburner_stamina_gain` multiplies the rank rate
  directly**, and `bladeburner_max_stamina` does too if regen scales with max. Candidates now back in
  play: **I.N.T.E.R.L.I.N.K.E.D** (max ×1.10), **Blade's Runners** (max ×1.05, gain ×1.05),
  **GOLEM Serum** (gain ×1.05), **Power Cells** (max ×1.05, gain ×1.02).
  ⚠️ **Still unproven: does regen scale with max stamina, or is it flat?** An attempt to answer it
  from `bladeburner-attempts.json` was too noisy to call (buckets disagreed and the largest bucket
  was an order of magnitude off), and the natural experiment set up to settle it died with install
  #43. Until measured, only `stamina_gain` is *known* to help. **Do not buy the max-stamina augs on
  the strength of this paragraph alone.**
- **`bladeburner_analysis` improves *population-estimate accuracy*** (§5) — it narrows uncertainty,
  not the rate. Irrelevant when the action is already at its success ceiling.
- Cost of the reachable tier (≤26.5k rep) is **~$36.5b at base prices**, and far more in practice
  because per-purchase price escalation compounds within a cycle.

⚠️ **The one aug that is still worth something is `The Blade's Simulacrum`** — its value is
structural (frees the player-action slot), not a multiplier, which is exactly why it reads all-1.00
here. Price, not rep, is its wall ($150b base).

**Corollary — the install↔rep deadlock is DISSOLVED, not solved.** The deadlock only mattered
because the aug tier was the prize. With the tier inert, faction rep resetting on every install
costs **nothing**, and no "rep window / install freeze" mechanism is needed. Phase 39's S4a decision
("no aug chase, no install freeze") was correct — and this is the durable reason, replacing the
cost-based one it was originally argued from.

### What the API genuinely doesn't expose (the honest, much shorter list)

- Exact **formulas** behind success chance, rank gain, chaos accumulation/decay rates.
- The **skill cost curve** in closed form (`getSkillUpgradeCost` gives point values; the growth law
  isn't stated).
- **Stamina**'s precise coupling to success chance (the panel shows a `Stamina Penalty:` percentage,
  so the effect is at least *observable* live). ⚠️ Two panel reads (2026-08-02, rank ~1,221 session,
  §11's changelog entry) fit a **closed form**, `min(1, fraction/0.5)` — zero penalty at/above 50%
  stamina, a linear cliff below it. **This is fit from panel reads, not confirmed against
  `getActionEstimatedSuccessChance`'s return value** — whether that API call already bakes the
  penalty in or reports a pre-penalty number is unverified (Phase 39 Q12, §6's row above). The
  *consequence* is solid either way: resting stamina back up past 50% is provably wasted wall-clock,
  which is why `bladeburnermanager.js`'s `STAMINA_RESUME_FRACTION` moved from Phase 38's 0.8 down to
  **0.55** (Phase 39 S16.4) — every second spent recovering above the 50% floor buys nothing.

### 🔑 The in-game Bladeburner CONSOLE is ground truth — and there is NO API to read it (2026-08-09)

The Bladeburner screen carries a **console panel** that logs every completed action, and it is the
single most authoritative outcome source in the whole subsystem — better than anything the API
returns, because it reports the **realised** result rather than an estimate:

```
[2026-08-09 06:03:48] Player: Tracking contract successfully completed! Gained 27.328 rank and $26.836m.
```

Per-line: timestamp · action · type · outcome · **exact rank** · money. It also carries world events
(Synthoid migrations, "riots in <city>! Chaos increased", population changes).

🔴 **It cannot be read from a script. Verified four ways, do not re-derive:** (1) the complete local
`ns.bladeburner` surface is **41 methods** with nothing log-related; (2) `ns.ui`/UserInterface is
tails/themes/`clearTerminal` only — all writes or cosmetics; (3) `ns`'s log methods
(`getScriptLogs`, `getRecentScripts`, `isLogEnabled`, `toast`) are scoped to *script* logs and
`toast` only writes; (4) the **official upstream repo lists the identical 41 methods** — so this is
not something our fork removed, it has never existed. Upstream changelog entries treat console text
as display polish ("Log info for field analysis now displays actual rank gained"), i.e. a UX surface,
never an API one.

⚠️ **`ns.bladeburner.nextUpdate()` does NOT report what happened** — it returns only a *number*, the
ms of Bladeburner time processed in the last update (1000–5000, more under bonus time). 0 GB. Useful
as a tick source, useless as an outcome source.

**So the correct posture is:** read the console over CDP (`cli.mjs goto "Bladeburner"` → `body`) as
an **independent validation instrument**, and derive the same signal in-script from
**`getActionSuccesses` deltas against the engine's own start count** (`successRate = Δsuccesses ÷
Δstarts`) — per-action, already charged, immune to bonus time. Validated 2026-08-09: 82 console
completions over 2.69 h gave **29.79 rank/completion · 30.5 completions/h · 909 rank/h**, against a
`context.rank`-differencing reconstruction of **28.21** and the engine's own `rates['1h']` of
**902 rank/h** — three independent instruments agreeing, and an exact match to §11.4's predicted
"`Tracking` is supply-capped at ~30 actions/h."

⚠️ **Only successes appear.** Across 2.69 h there were **zero** `Investigation` lines and **zero**
failure lines, while `Investigation` was demonstrably being started every ~77 s. Either failures are
not logged at all or operation logging is off; **unresolved**, and it is why the failure rate must
come from subtraction rather than from counting console lines.

🔴 **The buffer is a hard 100-entry FIFO ring, and scrolling reveals NOTHING more.** Measured
2026-08-09 with a read-only scroll probe: the panel *is* scrollable (`scrollHeight` 2416 vs
`clientHeight` 844), but after scrolling fully to the top the DOM still held **exactly 100 lines with
the same first entry** — no virtualisation, no lazy-load. `body` already returns the entire buffer.
**Don't re-test this.**

⚠️ **Retention is entry-count based, so the window SHRINKS as the engine gets faster.** At the
2026-08-09 rate (~30.5 completions/h + ~6.7 world events/h ≈ **37 entries/h**) 100 entries ≈
**2.7 h** — the model predicted 2.69 h and the observed span was 2.69 h. Restore `Investigation` to
~26 completions/h and the window falls to **~1.6 h**. **Snapshot before you need it**; there is no
way back. Two line classes only: player action completions, and world events (Synthoid
migration/population, chaos riots by city).

**Tooling recipe** (`cli.mjs goto "Bladeburner"` → `body` → `grep -E '^\[20'`) and the operational
caveats live in [`tools/bb/README.md`](../tools/bb/README.md) — keep the two in step.

**Revised design conclusion — the gang comparison was drawn wrongly.** The old text argued that,
unlike gangs (where `GangTaskStats` + `ns.formulas.gang.*` exposed every yield), Bladeburner was
genuinely empirical and so "observe-and-measure" was correct. **That framing survives only in part.**
The mechanics *are* documented — just in the UI rather than in `markdown/` — so the correct posture
is the same as it always was: **read everything first, and "everything" includes the game's own
screens.** Measurement is still needed for exact yield formulas, but not for what the levers are or
what they do.

---

## 6. API reference

RAM is lumpy and matters: **0 GB** — `nextUpdate`, `getBonusTime`, `inBladeburner`, and all five
name-listers. **1 GB** — `getCurrentAction`. **2 GB** — `stopBladeburnerAction`, `getBlackOpRank`,
`getNextBlackOp`. **Everything else is 4 GB.** A naive poller touching a dozen 4 GB getters costs
~50 GB before any logic — on a fresh 32 GB home that is the whole budget. Build control loops on
the cheap calls.

### Lifecycle

| Method | RAM | Semantics |
|---|---|---|
| `inBladeburner(): boolean` | 0 | Only API-access-free call. The probe. |
| `joinBladeburnerDivision(): boolean` | 4 | Combat stats ≥ 100. `true` if joined **or already member**. SF7.3 → grants The Blade's Simulacrum, locks out Stanek's Gift. |
| `joinBladeburnerFaction(): boolean` | 4 | Rank ≥ 25. `true` if joined **or already member**. No documented Stanek side-effect. |

### Rank & black ops

| Method | RAM | Semantics |
|---|---|---|
| `getRank(): number` | 4 | Player's Bladeburner rank. Scaled by `BitNodeMultipliers.BladeburnerRank` ("how quickly the player can gain rank"). |
| `getBlackOpNames(): BladeburnerBlackOpName[]` | 0 | All 21 names. **Not documented as rank-sorted.** |
| `getBlackOpRank(name): number` | 2 | Rank required. **`-1` if invalid action.** |
| `getNextBlackOp(): {name, rank} \| null` | 2 | Next **uncompleted** op + its rank gate. **`null` when none remain in the node.** Does *not* imply your rank meets it. |

`BladeburnerRankRequirement` is the discriminated-union member used in faction/aug requirements:
`{ bladeburnerRank: number; type: "bladeburnerRank" }`.

### Actions — run & inspect

| Method | RAM | Semantics |
|---|---|---|
| `startAction(type, name): boolean` | 4 | `true` if started. **The docs never enumerate why it fails** (rank? count? stamina?) — one opaque boolean. ⚠️ **Confirmed live 2026-07-30: NOT one-shot — the action auto-repeats indefinitely**, exactly like `ns.singularity.commitCrime` (docs/bladeburner-reference.md's own combat-grind precedent). `getCurrentAction()` never returns `null` between reps; a control loop waiting on that will hang forever mid-first-rep (cost `src/bladeburnertrial.js` v1 23 real minutes, harmlessly, before the bug was caught). **Detect one completed rep via `getActionCurrentTime()` wrapping** (drops from near the action's full time back to ~0), not via `getCurrentAction()` going `null`. Calling `startAction` with a *different* action appears to preempt the repeat (observed, not documented). |
| `stopBladeburnerAction(): void` | 2 | No return, no failure signal. |
| `getCurrentAction(): BladeburnerCurAction \| null` | 1 | `null` when idle. ⚠️ Returns `{name: string, type: string}` as **plain strings**, not the branded types the other methods demand. |
| `getActionCurrentTime(): number` | 4 | **Milliseconds** already spent on the current action. Undefined behavior when idle. |
| `getActionTime(type, name): number` | 4 | **Milliseconds** to complete. No documented error case. |
| `getActionEstimatedSuccessChance(type, name, sleeveNumber?): [number, number]` | 4 | `[MIN, MAX]` chance, **in 0–1 not percent** (docs shout: "return 0.8, NOT 80"). Why it's a range is undocumented. ⚠️ **Unknown whether this is pre- or post- the stamina penalty** (Phase 39 Q12, raised by the phase-39-bladeburner-primary.spec.md cold review) — this row is silent on stamina and §5's closed-form penalty note is derived from *panel* readings, never connected to this API's return value. Settled offline from `bladeburnermanager.js`'s attempt ledger (`bladeburner-attempts.json`): regress logged `predicted.pMin` against `context.staminaFraction` for a fixed action/level. No live probe needed. |
| `getActionCountRemaining(type, name): number` | 4 | **Float** for Contracts/Operations (UI rounds down) → gate on `>= 1`, not `> 0`. `Infinity` for General. `1` for uncompleted BlackOps **"regardless of whether the player has the required rank"** — so count is *not* a proxy for attemptable. |
| `getActionSuccesses(type, name): number` | 4 | Success count. No error case documented. |
| `getActionRankGain(type, name, level?): number` | 4 | **Average** rank gain on success; actual varies. `level` defaults to the action's current level. |
| `getActionRankLoss(type, name, level?): number` | 4 | **Average** rank loss on **failure**. |
| `getActionRepGain(type, name, level?): number` | 4 | **Average** rep gain. Docs don't say which faction (Bladeburner implied, unstated). |

### Action levels

| Method | RAM | Semantics |
|---|---|---|
| `getActionCurrentLevel(type, name): number` | 4 | **`-1` if invalid.** |
| `getActionMaxLevel(type, name): number` | 4 | **`-1` if invalid.** |
| `setActionLevel(type, name, level): void` | 4 | **No success signal.** Remarks are one bare sentence — no clamping, no failure, no autolevel interaction documented. Read back to confirm. |
| `getActionAutolevel(type, name): boolean` | 4 | ⚠️ **`false` for an invalid action too** — indistinguishable from legitimately-off. |
| `setActionAutolevel(type, name, autoLevel): void` | 4 | **No success signal**, no documented default state. |

### Skills

| Method | RAM | Semantics |
|---|---|---|
| `getSkillNames(): BladeburnerSkillName[]` | 0 | All 12. |
| `getSkillLevel(skillName): number` | 4 | **`-1` if invalid name.** Case-sensitive exact match. |
| `getSkillPoints(): number` | 4 | Unspent skill points. |
| `getSkillUpgradeCost(skillName, count?): number` | 4 | **Cumulative** cost for `count` successive upgrades from the current level (`count` defaults to 1). Returns **`Infinity`** if level+count exceeds max — guard on this. Returns `0` only in `MAX_SAFE_INTEGER`/float-precision territory. |
| `upgradeSkill(skillName, count?): boolean` | 4 | One boolean. ⚠️ Docs never say whether an unaffordable `count` partially applies — compute affordability first. |
| `ns.formulas.bladeburner.skillMaxUpgradeCount(name, level, skillPoints)` | (undocumented) | The **inverse** of `getSkillUpgradeCost`. **Formulas.exe-gated** — we hold it permanently via SF5. Takes `level` as an *argument*, so it's pure/hypothetical → usable for planning. **The only method on `BladeburnerFormulas`.** Confirmed reachable pre-employment (probe: `{present: true, methods: ["skillMaxUpgradeCount"]}`). |

Skill cost is scaled by `BitNodeMultipliers.BladeburnerSkillCost`.

### City / chaos / population

All 4 GB, all case-sensitive, all return **`-1` on an invalid city**:
`getCity(): CityName` (the Bladeburner-internal city, distinct from the player's travel location) ·
`switchCity(city): boolean` · `getCityChaos(city)` · `getCityEstimatedPopulation(city)` (explicitly an
*estimate*) · `getCityCommunities(city)` (also an estimate).

🔑 **`switchCity` MEASURED 2026-08-03 — this closes Q5(a), open since 2026-07-30.** Run via
`src/switchbbcity.js` (Sector-12 → Volhaven), which records both sides of the call:

| Question | Answer |
|---|---|
| Money cost | **$0** |
| Rank cost | **0** |
| Travel time | **None** — completes inside one `nextUpdate()` tick |
| Interrupts the running action? | **YES** — `getCurrentAction()` changed across the call |
| Return value | `true` on success |

So the only cost is the interrupted action, which a control loop restarts on its next tick. **City
rotation is therefore essentially free**, and the old "cost/travel/interruption are all undocumented
and unmeasured" caveat that gated `CITY_ROTATION_ENABLED` no longer applies to (a) — what remains
open is the *policy* (when to move, anti-thrash hysteresis), not the mechanic.

🔴 **And the per-city spread is enormous — city choice dominates every other chaos lever.** All six
sampled in one read (free: `getCityChaos`/`getCityEstimatedPopulation`/`getCityCommunities` are
already charged, so the extra five cities cost no RAM):

| City | Chaos | Est. population | Communities |
|---|---|---|---|
| **Sector-12** | **177.5** | 620.7m | 21 |
| Chongqing | 60.2 | 1465.4m | 149 |
| Aevum | 16.9 | 569.1m | 49 |
| New Tokyo | 16.0 | 1085.2m | 16 |
| Ishima | 3.5 | 1132.7m | 40 |
| **Volhaven** | **3.4** | 1170.6m | 75 |

⚠️ **The engine had been grinding in Sector-12, which was the worst city on *every* axis at once** —
and nobody knew, because it only ever sampled its own city. Volhaven strictly dominates it: **52×
less chaos, 1.9× the population, 3.6× the communities**, with no trade-off to weigh.
🧮 **Measured payoff of the move: Tracking's EV/sec went 0.0084 → 0.0854, a 10.2× improvement** — and
4.0× better than the 0.0211 baseline recorded earlier the same day at chaos 69. **One `switchCity`
beat ~15 hours of duty-capped `Diplomacy`, for free.** Sample all six cities before assuming the
current one is worth suppressing chaos in.

### Team

| Method | RAM | Semantics |
|---|---|---|
| `getTeamSize(type?, name?): number` | 4 | **Both params optional, and the two forms mean different things:** no args → **available** team members; with args → members **assigned to** that action. Returns **`0`** for General/Contract actions. |
| `setTeamSize(type, name, size): number` | 4 | Returns the size **actually set** (may differ from your request — clamping rule undocumented), or **`-1` on failure**. |

**Teams apply only to Operations and BlackOps** — a fact that lives in `getTeamSize`'s Remarks, not
`setTeamSize`'s. Team members presumably come from the `Recruitment` general action; **that link is
inferred from the name and is not documented.**

### Timing

| Method | RAM | Semantics |
|---|---|---|
| `nextUpdate(): Promise<number>` | 0 | Resolves to **milliseconds of *simulated* Bladeburner time** processed in the previous update (**1000–5000**). Real sleep is ~1 s. **This is the correct control-loop tick** — 0 GB, and it wakes on the engine's own update boundary instead of polling. |
| `getBonusTime(): number` | 0 | Accumulated bonus time in **milliseconds**. Banked while the game is offline/inactive; spends at up to **5× normal speed**. |

⚠️ `nextUpdate()`'s resolve value is simulated ms, **not wall-clock elapsed** — don't use it to
measure real time.

### Sleeve interop (not usable yet — needs SF10)

```typescript
Sleeve.setToBladeburnerAction(sleeveNumber, action: BladeburnerActionTypeForSleeve,
                              contract?: BladeburnerContractName): boolean   // 4 GB
```

Sleeves take a **flat name union, not a `(type, name)` pair**, and a narrower vocabulary: any
General action **except `Incite Violence`**, plus three sleeve-only pseudo-actions —
`Infiltrate Synthoids`, `Support main sleeve`, `Take on contracts` (the last taking the specific
contract as the third arg). **Sleeves cannot run Operations or BlackOps.** Recorded now because the
in-game guide names Sleeves as Bladeburner's main accelerator; it needs SF10, which we don't hold.

### Player & BitNode multipliers touching Bladeburner

`Multipliers.bladeburner_max_stamina` · `bladeburner_stamina_gain` (rate) ·
`bladeburner_analysis` (Field Analysis effectiveness) · `bladeburner_success_chance` (contracts/
operations). All four read **1.0** in BN6.1 at zero augs
(`logs/auginfo-1785369135460.json`) — no SF or aug contribution yet.
`BitNodeMultipliers.BladeburnerRank` · `BladeburnerSkillCost` · `BitNodeBooleanOptions.disableBladeburner`.

⚠️ **`BladeburnerRank`/`BladeburnerSkillCost` are both neutral (1.0) in BN6, but worse in BN7** —
live-read via `getBitNodeMultipliers(7, 1)` in the same probe, no SF7 needed: **`BladeburnerRank:
0.6`** (rank gains 40% slower) and **`BladeburnerSkillCost: 2`** (skills cost double). BN7 also
disables Stanek's Gift the moment `joinBladeburnerDivision()` fires under SF7.3 (§1). Neither of
these is new data — `getBitNodeMultipliers()` doesn't require employment — but it went unsurfaced
in prose until this update; the playbook's BN7-repeat warnings should account for a slower, pricier
grind, not just the Stanek loss.

---

## 7. Gotchas — the implementer's list

1. **Two tuples, two opposite conventions.** `getActionEstimatedSuccessChance` → `[MIN, MAX]`;
   `getStamina` → `[current, max]`. Don't pattern-match one onto the other.
2. **Success chance is 0–1, not percent.**
3. **`getActionCountRemaining` is a float** → gate on `>= 1`. `Infinity` for General; `1` for
   uncompleted BlackOps regardless of rank.
4. **`-1` is the error sentinel, but only on *some* calls.** Documented: `getBlackOpRank`,
   `getActionCurrentLevel`, `getActionMaxLevel`, `getSkillLevel`, `getCityChaos`,
   `getCityCommunities`, `getCityEstimatedPopulation`, `setTeamSize`. **Not** documented for
   `getActionTime`, the three `getAction*Gain/Loss`, `getActionSuccesses`, `getSkillUpgradeCost`.
5. **`getActionAutolevel` returns `false` for an invalid action** — validate names separately.
6. **Both level setters return `void`** — no success signal at all. Read back to confirm.
7. **`getTeamSize()` vs `getTeamSize(type, name)` are different quantities.** Teams are
   Operations/BlackOps only.
8. **`getSkillUpgradeCost` is cumulative and can return `Infinity`.**
9. **Action type strings are plural** (`"Contracts"`, `"Operations"`, `"Black Operations"`) while
   individual operation names are singular. Enum keys aren't inputs; values are. Exact match,
   case-sensitive.
10. **`getCurrentAction()` returns plain `string`s and `null` when idle** — null-guard, and cast if
    feeding back into a typed call.
11. **The whole API throws one uniform error until you join the division** — including six 0 GB
    methods. There is no partial access tier.
12. **Static dot-notation only** for calls you intend to `try/catch` (see §3 footgun 1).
13. **`startAction` auto-repeats — it is not one-shot.** Confirmed live 2026-07-30 (§6's Lifecycle
    table). `getCurrentAction()` stays non-`null` across reps, so a control loop must detect
    completion via `getActionCurrentTime()` wrapping, not via waiting for `null`. Same shape as
    `ns.singularity.commitCrime`.
14. **`startAction`'s boolean return does NOT mean the action is running — confirmed live, cause
    unknown.** `startAction("Contracts","Tracking")` and `startAction("Operations","Raid")` have both
    returned `true` while `getCurrentAction()` read `null` for the entire observation window and zero
    successes accrued (60 consecutive samples in one run). `startAction("Operations","Investigation")`
    does **not** show this — ran clean for a full 100s in the same session, with the slot fully
    quiesced. One unconfirmed lead: Investigation is the only action with no HP loss on failure. Not a
    clean Contracts-vs-Operations split (Tracking is a Contract, Raid an Operation, both affected).
    **Always verify with `getCurrentAction()` on the next tick, never trust the boolean** — this is
    the whole reason `bladeburnermanager.js`'s S6 verification step exists (Phase 39). §8/BACKLOG.md
    carry the live debugging trail; `bladeburner-attempts.json` (S7) is the standing diagnostic
    instrument going forward — the difference between Investigation (works) and Tracking/Raid
    (no-op) is either in that ledger's per-attempt context fields or is not in the API at all, and
    that's now a log-read question, not a live-probe one.

---

## 8. Open questions — mostly closed now

**Updated 2026-07-31.** This section was originally "not knowable until we join." Joining answered
some; **reading the in-game UI (§5) answered most of the rest**, including several items previously
asserted to be undocumented anywhere. What remains is genuinely narrow: exact formulas, not
mechanics.

- **✅ ANSWERED — rank requirement of all 21 black ops**, read live via `getBlackOpRank`
  (`logs/bladeburnerprobe-1785411469942.json`):

  | Op | Rank | Op | Rank | Op | Rank |
  |---|---|---|---|---|---|
  | Typhoon | 2,500 | Red Dragon | 25,000 | Ion Storm | 175,000 |
  | Zero | 5,000 | K | 30,000 | Annihilus | 200,000 |
  | X | 7,500 | Deckard | 40,000 | Ultron | 250,000 |
  | Titan | 10,000 | Tyrell | 50,000 | Centurion | 300,000 |
  | Ares | 12,500 | Wallace | 75,000 | Vindictus | 350,000 |
  | Archangel | 15,000 | Shoulder of Orion | 100,000 | **Daedalus** | **400,000** |
  | Juggernaut | 20,000 | Hyron | 125,000 | | |
  | | | Morpheus | 150,000 | | |

  **The final gate is rank 400,000** — this is the number Stage 2's "is the ladder feasible"
  re-check needs a rank-gain-rate against. Still unmeasured: rank gained per action, so no time
  estimate yet.
- **✅ ANSWERED — `getBlackOpNames()` returns rank-sorted (ascending) order.** The list above reads
  strictly increasing in the enum's own order — not documented, but now empirically confirmed, not
  assumed.
- **✅ ANSWERED (badly) — rank gain per action**, via `src/bladeburneractionprobe.js`
  (`logs/bladeburneractionprobe-1785412426030.json`). At rank 0 / zero skill investment, the best
  grindable action (Raid: 66s, 7.5–9.7% success, +55/-2.5 rank) nets an expected **0.0277–0.0465
  rank/sec** — projecting **~5–6 months** to rank 400,000. Every black op is currently
  strongly-negative expected value (e.g. Operation Typhoon: 2.8–3.1% success, +50/-10 rank). Full
  per-action table and the strategic read: `bn6-playbook.md` §1. **This is a snapshot, not a
  verdict** — see the two open items directly below, both of which could change it substantially.
- **✅ ANSWERED — the 12 skills' cost curves**, via `src/bladeburnerskillprobe.js`
  (`logs/bladeburnerskillprobe-1785412431533.json`). All 12 at level 0 (fresh join). First-level
  costs are cheap (1–3 SP): `Cyber's Edge`/`Hyperdrive` 1, most others 2–3, none above 3.
  **`getSkillPoints()` reads 0** at rank 0 — **the rank→skill-point conversion rate is still
  unmeasured**, so "cheap in SP" doesn't yet mean "reachable soon."
- **✅ ANSWERED 2026-07-31 (UI) — rank→skill-point rate: ONE SKILL POINT PER 3 RANKS.** Verbatim
  from the Skills tab. Previously called "still unmeasured" directly above, which is now
  superseded. ⚠️ **This is the number that breaks the 7/30 extrapolation**: rank 400,000 banks
  **~133,000 SP**, against the **13 SP** the trial actually spent. Any projection built on
  low-SP-regime rates is measuring a different game than the one being played at scale.
- **✅ ANSWERED 2026-07-31 (UI) — what every skill does** (full table in §5). ⚠️ **`Overclock`:
  −1% action time per level, max level 90 ⇒ 10× throughput.** The 7/30 model held action time
  constant, which alone invalidates it.
- **✅ ANSWERED 2026-07-30 — `Field Analysis` scouting narrows the success-chance estimate.**
  Confirmed live via `src/bladeburnertrial.js` (an accidental ~50-rep sample — see the `startAction`
  gotcha in §6/§7): Raid's `[MIN, MAX]` range collapsed from `[0.075, 0.097]` (pre-scout) to a
  single point value `0.0901` (post ~50 reps). The UI corroborates the mechanism: Field Analysis
  *"will improve the accuracy of your Synthoid population estimated in the current city."*
  **Caveat: it narrows *uncertainty*, not obviously the *rate*.**
- **✅ QUANTIFIED 2026-08-13 — Field Analysis restores a collapsed `pMin` at ~+0.684/hour, and the
  effect is pure INTEL, not chaos.** (`src/fieldanalysisprobe.js`, 17+ samples at 30 s over a 15-min
  run; `logs/fieldanalysisprobe-1786589727034.json`.) `Tracking`'s `pMin` climbed **monotonically
  0.2556 → 0.3468 in 8.0 min** with **zero** reversals, while **city chaos stayed pinned at 274.8
  for the entire run** — so the mechanism is rebuilding the population estimate, and chaos is *not*
  the lever being pulled. `Investigation`'s `pMin` rose in parallel (0.6828 → 0.9264, faster in
  absolute terms).
  - 🔑 **The signature that identifies this condition, and it is worth recognising anywhere:** the
    estimate's **upper** bound never moved off **1.0000** while the lower bound collapsed
    0.89 → 0.25. A *widening* range is **lost intel**; a *falling* range would be a real decline.
    Since scoring reads the pessimistic bound, the two are indistinguishable at the call site —
    read `[pMin, pMax]` as a pair, never `pMin` alone.
  - **Maintenance arithmetic:** `pMin` decays **0.0268/level × 5.9 levels/day ≈ 0.158/day**, and
    restores at **0.684/hour** ⇒ steady state costs **~14 min/day (~0.96% of wall time)**. Restoring
    a fully-collapsed 0.25 → 0.89 takes **~1 hour**.
  - ⚠️ **It lifts every action's estimate, including worthless ones** — `Investigation` (realised
    ~0 rank/action) gained *more* `pMin` than `Tracking` did. It is only a net win because
    `Tracking`'s `rankGain` is ~50× larger, so the same `pMin` multiplier moves its absolute score
    far more. **Do not treat Field Analysis as a way to make the estimator trustworthy** — it
    restores *precision*, not *accuracy*, and the estimator was separately measured wrong in both
    directions (§ the `pMin 1.0000` cases).
- **✅ ANSWERED 2026-07-31 (UI) — chaos dynamics.** Per-city; `Diplomacy` and `Stealth Retirement
  Operation` reduce it; `Incite Violence` raises it everywhere; several contracts/ops raise it
  locally; and ⚠️ **it also rises spontaneously from world events** (riot messages in the event
  log). Population migrates between cities on its own. Full detail in §5.
- **✅ ANSWERED 2026-07-31 (UI) — teams.** `Recruitment` (4m22s, success chance shown per-attempt —
  read **100%** for us) yields team members; usable on **Operations and BlackOps only**; larger team
  ⇒ better success. `Team Size` was **0** for the entire 7/30 trial, i.e. every operation was run
  with the team bonus at zero.
- **✅ ANSWERED 2026-07-31 (UI) — action levels.** Higher levels unlock **by completing an action
  successfully**, and *"grant more rank, experience, and money."* Observed live: **Tracking reached
  Level 8/8 with 100.0% success at 12s** — versus the probe's level-1 reading of 84.8% at 11s.
- **⚠️ Superseded context for the "rank gain per action" entry above.** Those figures were taken at
  rank 0, 0 SP, team size 0, action level 1, and elevated chaos. Live re-read on 2026-07-31 after
  chaos decayed (City Chaos 0.271) and 13 SP were spent shows roughly **double** the success
  chances: Investigation 27.9–68.3% (was 16.4–21.1%), Undercover 23.4–57.3% (was 14.1–18.2%),
  Sting 14.6–35.8% (was 8.7–11.2%), Raid 10.6–25.8% (was 7.5–9.7%). **Treat the probe's table as a
  worst-case floor, not a steady state.**
- **✅ ANSWERED 2026-07-31 (UI) — hospitalization is a real cost.** Panel tracks it directly:
  **22 hospitalizations, $229.5m lost** as of 2026-07-31, almost entirely from the 7/30 trial's
  failed Raids (2 successes / 22 failures). Failed contracts cost HP; failed operations cost HP
  **and rank**; black ops incur heavy losses of both. `Investigation` is the only listed action with
  no HP loss on failure.
- **❓ Still open — exact formulas** for success chance, rank gain, and chaos accumulation/decay
  rates. The levers and their directions are documented; the closed-form math is not.
- **✅ ANSWERED 2026-08-02 — the stamina penalty is SOLVED IN CLOSED FORM.** A third live read
  (`20.926 / 83.555` → penalty `49.9%`) pinned the curve that the previous two points only bracketed:

  ```
  successMultiplier = min(1, (stamina / maxStamina) / 0.5)
  staminaPenalty    = 1 − successMultiplier
  ```

  | stamina | fraction | predicted penalty | observed | date |
  |---|---|---|---|---|
  | full | 1.0000 | 0.0% | **0.0%** | 2026-07-31 |
  | 20.926 / 83.555 | 0.2504 | 49.92% | **49.9%** | 2026-08-02 |
  | 4.371 / 83.555 | 0.0523 | 89.54% | **89.5%** | 2026-08-02 |

  All three fit exactly. 🔑 **Two design consequences, both immediate:**
  1. **There is ZERO benefit to stamina above 50% of max** — the multiplier clamps at 1. Resting
     past the halfway mark is pure wasted wall-clock.
  2. **Below 50% the falloff is linear and brutal** — at 25% stamina every action is rolling at half
     its nominal success chance. The optimal control policy is to **hover at ~50%, never dip below**,
     not to drain-and-recover.

  Stamina was full throughout the 7/30 trial, so it was **not** the cause of the low chances there —
  but under continuous fire it is the dominant term, not a footnote. Two further behaviours confirmed
  live the same day, both load-bearing for any control loop:
  - **The game cancels a running action at stamina 0** — the in-game log line is `Your Bladeburner
    action was cancelled because your stamina hit 0`, and `getCurrentAction()` then returns **`null`**.
    An engine that tracks only its own intent will sit idle indefinitely (Phase 38 did, for most of an
    hour, while reporting 100% duty). **Poll `getCurrentAction()` for `null`; do not assume an action
    you started is still running.**
  - **Failed actions cost rank** (`Investigation failed! Lost 0.343 rank.` repeating), so a
    stamina-starved engine goes **net negative** on rank, not merely slow. Measured: −0.00958
    rank/held-sec cumulative.
  - **❌ UNRESOLVED — is stamina spent per ACTION or per SECOND?** ⚠️ **An earlier version of this
    entry claimed "✅ ANSWERED — PER ACTION" with a numbers table. That claim was WITHDRAWN the same
    day: the only run that produced numbers was contaminated by action-slot contention, and three
    subsequent attempts to reproduce it cleanly all failed.** The withdrawn figures (Tracking 14s →
    0.769/attempt, Investigation 34s → 0.806/attempt) are recorded here only so nobody re-derives
    them and mistakes them for evidence.

    **Why it matters:** per-second ⇒ `Overclock`'s 8.3× speedup is a real 8.3× on sustainable rank
    rate. Per-action ⇒ faster actions burn stamina proportionally faster,
    `staminaRegen / staminaPerAction` is unchanged, and Overclock's 16,908 rank buys nothing
    sustained. It would also change the correct objective function from rank/second to rank/action,
    which reorders the entire action table.

    **🔑 The real lesson, and it generalises beyond this measurement: FOUR different scripts contend
    for the single player-action slot**, and each one produced an *identical* symptom — zero stamina
    drain, `start === end` — from a different cause:

    | # | Claimant | How it broke the measurement |
    |---|---|---|
    | 1 | `bladeburnermanager.js` | Its off-marker branch called `stopBladeburnerAction()` **every ~1s tick**, so "paused" meant "cancel whatever is running, forever". *(Fixed — it now stops once on entry.)* |
    | 2 | `augfarmer.js` | Pausing the manager makes it **release** the slot-hold marker; augfarmer watches for that and starts faction work within seconds (`slot hold released -- rep work resuming`). *(Fixed — the probe now claims the slot itself and refreshes inside `SLOT_HOLD_MAX_AGE_MS`.)* |
    | 3–4 | `backdoorfactions.js` / `backdoorwd.js` | `installBackdoor` occupies the player slot too. Both were resident during the third attempt: `startAction` returned **`true`** while `getCurrentAction()` read **`null`** on all 60 samples. *(Not fixed.)* |
    | 5 | **`ns.grafting.graftAugmentation`** (added 2026-08-17, BN10) | 🔴 **FIFTH claimant — "quiesce all four" above is now STALE.** `focus` defaults to **`true`**, and the API doc is explicit that *"when you call this API, the current work (grafting or other actions) **will be canceled**"* — so a graft both takes the slot *and* silently cancels whatever held it. Worse in one way than the other four: it also blocks the **combat grind**, which is the BN10 entry critical path, and money is charged **up front**, so a cancelled graft is money burned. → `phase-41-bn10-entry.spec.md` A3/A3a. |

    ⚠️ **`startAction` returning `true` does NOT mean the action is running.** Confirmed live: it
    returned `true` in a window where `getCurrentAction()` was `null` throughout and zero actions
    completed. **Always verify with `getCurrentAction()`, never trust the boolean.** This belongs
    alongside §7's gotchas.

    **To retry:** quiesce *all four* claimants, not just the manager. `bladeburneractionprobe.js
    stamina` now records `valid` / `startActionReturned` / `preemptedSamples` per window, so a
    contaminated run fails loudly instead of silently producing plausible numbers. **Low priority** —
    it only gates Overclock, which is ~16,908 rank away.
  - **❓ Still open:** whether any General action consumes stamina — `Hyperbolic Regeneration
    Chamber` is assumed safe for recovery, the rest are unmeasured (`BACKLOG.md` has the cheap
    experiment). *(The curve-shape question that used to sit here is closed — see the formula
    above.)*
  - **🧮 Measured regen rate 2026-08-02:** with `Hyperbolic Regeneration Chamber` running, stamina
    went `8.691 → 20.423` in 5 minutes = **~2.35 stamina/min**, of which the HRC log line accounts
    for **0.836/min** (so passive regen is ~1.5/min and HRC is roughly a +55% boost, not a
    replacement). HRC also restores **2 HP/min**. At 2.35/min, climbing from 0 to the 50% useful
    ceiling (41.8) takes **~18 minutes** — which is the real cost of ever letting stamina bottom out.
- **❓ Still open — whether `switchCity` interrupts the current action or costs anything.**

---

## 9. Probes — re-run these, don't rewrite them

| Script | RAM | What it captures |
|---|---|---|
| `src/bladeburnerprobe.js` | 19.20 GB (measured 2026-07-30 live; earlier 16.20/16.40 GB figures were stale) | API reachability map (per-method throw text), the combat-100 join gate, `getResetInfo` (node + owned SF + `disableBladeburner`), **live `getBitNodeMultipliers()` for the current node and BN7**, the Bladeburner faction invite requirement, Intelligence, and `formulas.bladeburner`'s method list. Staged breadcrumb writes → survives a mid-run death. Needs a companion (e.g. `augfarmer.js`, 64.10 GB) killed temporarily on a RAM-tight home — it does not fit alongside the full companion stack even on a 128 GB home. |
| `src/combatgateprobe.js` | small | Exp needed per combat stat for level 100 at the current mult, plus the exp-vs-mult curve. |
| `src/joinbladeburner.js` | 7.60 GB | One-shot: stops the current player action, calls `joinBladeburnerDivision()`, logs before/after state. Not idempotent-dangerous — safe to re-run (both join calls return `true` for an existing member). |
| `src/bladeburneractionprobe.js` | 33.60 GB | Post-employment-only. Per-action `getActionTime`/`getActionEstimatedSuccessChance`/`getActionCountRemaining`/`getActionRankGain`/`getActionRankLoss`/`getActionRepGain` across all 36 actions (3 contracts, 6 operations, 6 general, 21 black ops), plus rank/stamina and a derived expected-rank/sec summary for contracts+operations. Sibling to `bladeburnerprobe.js`, not a rewrite — keeps that one's reachability record stable. |
| `src/bladeburnerskillprobe.js` | 13.60 GB | Post-employment-only. Per-skill `getSkillLevel`/`getSkillUpgradeCost`(1 and 5)/`skillMaxUpgradeCount` across all 12 skills, plus `getSkillPoints()`. |
| `src/bladeburnertrial.js` | 46.60 GB | **Not a probe — a real engine trial.** Calls `startAction`/`upgradeSkill`, both state-mutating. Runs an adaptive grind loop (best-EV contract/operation each cycle) and auto-spends skill points, logging every completion to `bladeburnertrial-log.json` (ring-capped, unbounded run — check the log, don't wait for it to end). Only run with an explicit go-ahead, per this file's own "measure vs. play the mechanic" line in §8. |
| `src/bladeburnerdiag.js` | ~10.6 GB | Throwaway spot-check: rank, current action + elapsed time, skill points, Raid's live success chance. Useful for confirming a resident script (like the trial) is actually progressing rather than stuck. |

⚠️ **New probe output files need a `vite.config.ts` sync-filter entry, or they never reach
`logs/`.** Found live 2026-07-30: both new probes above ran and wrote their file in-game (`mem`/
`run` confirmed success), but nothing appeared in `logs/` for ~40s because the filter regex list
(`vite.config.ts`) is an explicit allowlist by filename pattern — a new probe's filename doesn't
match any existing entry until one is added. Silent, not an error: the in-game write succeeds,
`ps`/`run` report success, and the dev server keeps exporting every *other* file normally, so it
looks like a sync stall rather than a missing filter line. Add the regex, then restart
`npm run dev` (config changes need a restart, not just a hot-reload) before assuming the bridge
itself is broken.

**Already re-run after joining the division (2026-07-30)** — see §3, §8, §10 for the results. The
reachability table is now a real before/after record.

Outputs land in `logs/bladeburnerprobe-<epoch>.json` / `logs/combatgateprobe-<epoch>.json` (filters
wired in `vite.config.ts`). One file per run, so before/after diffs are free.

---

## 10. Live BN6.1 state at time of writing

State at doc creation (2026-07-29, pre-grind):

- **Node:** BN6.1. **Owned SF:** `{1: 3, 2: 1, 4: 3, 5: 1}` — SF6 not yet held.
  `disableBladeburner: false`.
- **Combat stats:** all **1**. Hacking 4→30 and climbing. Money ~$1.9k. City Sector-12.
- **Intelligence: 80** (exp 5,836.65) — newly *visible* thanks to SF5, and it persists across
  nodes. Note this contradicts the tone of `bitnodes.md`'s "Intelligence accrues glacially for a
  scripted playstyle": it had been accumulating invisibly all along and 80 is not nothing. Its
  actual effect on Bladeburner (if any) is undocumented.
- **BN6 multipliers: live-verified against the hand-read BitVerse panel — 20/20 fields match
  exactly.** This is the first time any per-node table in `bitnodes.md` has been checked against
  `getBitNodeMultipliers()`, and it **validates the whole hand-read corpus**. That discharges the
  standing ⚠️ "treat them as transcriptions, not authority" warning at the top of that doc.

### ✅ Update 2026-07-30 — combat gate cleared, division joined

- **Combat stats: 172/172/172/172** (target was 100 — overshot by 72). The grind ran via
  `combatgrind.js`'s documented failure mode: the harness script died mid-run (the predicted
  32 GB-home RAM-contention risk, though home was later upgraded to 128 GB), but `commitCrime`'s
  player action survived and kept running unattended with nothing alive to detect gate-met and
  call `stopAction()` — confirmed by `ps` (no `combatgrind.js` process) and the live UI still
  showing "Attempting to Mug" at 172. Cost: zero (no penalty for combat overshoot), plus ~90 min of
  a pointless-but-harmless Mug loop. `src/joinbladeburner.js` (new) called `stopAction()` before
  joining.
- **`joinBladeburnerDivision()` → `true`. `inBladeburner()` → `true`.** Division joined, no
  Stanek's Gift side-effect (SF7 still level 0, as expected).
- **`getRank()` → `0`** (fresh join, zero actions run). **`getNextBlackOp()` →
  `{name: "Operation Typhoon", rank: 2500}`.**
- **Hacking 115→116, money ~$110.6m, city Aevum** — the batcher/aug-ratchet kept running the whole
  time (unrelated engine, still the only income source).
- **Full black-op rank ladder now known** (§8) — final gate **rank 400,000** at `Operation
  Daedalus`.

---

## 11. Changelog

- **2026-07-29** — Created, in BN6.1 at combat stats 1. Full API surface extracted from 41 method
  files + type enums; static catalog recovered from enum types despite the live API being inert;
  both gates verified live (combat 100 / rank 25); combat-100 gate sized at 21,668 exp total;
  BN6 multipliers validated 20/20 against the hand-read panel; two RAM-analyzer footguns recorded.
- **2026-07-30** — Combat grind cleared (172/172/172/172, target overshot), division joined via new
  `src/joinbladeburner.js`, `bladeburnerprobe.js` re-run post-join: all 10 previously-throwing calls
  now work, full 21-black-op rank ladder recovered (final gate rank 400,000 at Operation Daedalus),
  `getBlackOpNames()` order confirmed rank-ascending. Surfaced the previously-buried
  `BladeburnerRank`/`BladeburnerSkillCost` BN6-vs-BN7 comparison (1.0/1.0 vs 0.6/2.0 — BN7 is a
  slower, pricier Bladeburner grind, not just the Stanek's Gift loss). Corrected the probe's RAM
  figure to the measured 19.20 GB.
- **2026-07-30 (same day, later)** — Two new sibling probes (`bladeburneractionprobe.js`,
  `bladeburnerskillprobe.js`) measured the rest of §8: per-action yields for all 36 actions, and
  per-skill costs for all 12 skills. Result: at zero skill investment, the best grind rate
  projects ~5–6 months to rank 400,000, ~8x past the playbook's 3-week flip bar — a live yellow
  flag against the black-op path, but explicitly not a verdict (skill-point scaling and `Field
  Analysis` scouting are both untested and both plausibly change the rate). Found and fixed a
  `vite.config.ts` sync-filter gap that silently dropped both probes' first outputs.
- **2026-07-31 — 🔴 MAJOR CORRECTION: the in-game Bladeburner panel was never read, and it
  documents nearly everything this doc called unknown.** Prompted by Kenneth noticing the panel
  exists. Newly recorded as fact rather than inference: **1 skill point per 3 ranks** (⇒ ~133,000 SP
  at rank 400,000, vs the 13 the trial spent); **all 12 skill effects**, including **`Overclock`
  −1% action time per level to max 90 ⇒ 10× throughput**; chaos is per-city with explicit up/down
  levers *and* rises spontaneously from world events; `Incite Violence` regenerates contract/op
  inventory; teams come from `Recruitment` (100% success chance for us) and were **size 0** for the
  entire trial; action levels unlock by success and grant more rank/exp/money (Tracking observed at
  **level 8/8, 100% success, 12s**); hospitalization is a tracked cost (**22 times, $229.5m**).
  Live re-read after chaos decayed shows success chances roughly **double** the probe's figures.
  **Net: the 7/30 shelving verdict rests on a model the game contradicts** — constant action time,
  constant success chance, no teams, no level progression, extrapolated from the lowest-investment
  regime. Also records the generalised lesson: *the rendered game UI is part of the interface*, and
  reading 41 API files exhaustively is not a substitute for opening the panel.
- **2026-08-02 — second full five-tab sweep, taken at rank 1,221 instead of ~0.** New in §5: the
  **stamina penalty solved in closed form** (`min(1, fraction/0.5)`, three points fitting exactly —
  zero benefit above 50% stamina, linear cliff below); **contracts carry no rank loss on failure**
  while operations do; **autolevel had pushed Tracking to 23/23 and Investigation to 8/8**, collapsing
  success chance (Investigation 46 ✓ / 301 ✗); a full **EV rank/sec table** showing two actions
  currently **net-negative**; the **one-player-action-slot** constraint and what `The Blade's
  Simulacrum` actually buys; **Bladeburner actions regenerate their own combat-stat prerequisite**
  (install #37: combat 1 → 171/171/202/195 in 26h, versus hacking 1 → 167); faction **membership**
  survives an install while **rep** does not; **max HP = 10 + defense/10 = 27**, so 9 failed contracts
  hospitalise (81 times / **$837.4m** to date); measured stamina regen **~2.35/min** with HRC; and the
  **full Bladeburner aug shop** with rep gates (12.5k–62.5k) and base prices. Also flags that **Phase
  38's own measurements are untrustworthy** — its stamina floor is not enforced and its telemetry
  reports `rankGained: 0` while rank moves.
