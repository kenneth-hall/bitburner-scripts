# Bladeburner reference (API surface + mechanics)

The durable, factual reference for this fork's Bladeburner mechanic: the access model, the
complete static catalog, every method's semantics, and — explicitly — what is **not** knowable
yet. Strategy lives in [`bn6-playbook.md`](bn6-playbook.md); this file is the interface.

**Split rationale:** the API surface is immutable (it's a property of the fork), while strategy
changes with every measurement. Keeping them apart means this file should almost never need
editing, and the playbook can churn freely. That's a deliberate departure from
[`gang-engine.md`](gang-engine.md), which fused both into one doc.

**Sources:** `markdown/bitburner.bladeburner.*.md` (41 method files) + the bladeburner type/enum
files, the in-game **Documentation → Bladeburner** page (read via CDP 2026-07-29), and two live
read-only probes (`src/bladeburnerprobe.js`, `src/combatgateprobe.js`). This build is a **fork** —
these local files are authoritative and upstream/online NS docs will mislead you.

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
2. **Bladeburner faction rep resets on install AND can only be earned through Bladeburner actions.**
   No `workForFaction` path, no donation path. So Bladeburner *augs* are expensive in a way the
   ratchet's usual rep machinery cannot shortcut, while *rank* is cheap in a way nothing else is.

### What the mechanics docs do NOT cover — anywhere

Not in the API docs, not in-game, and not computable from `formulas.bladeburner` (which has
exactly **one** method):

- What **chaos** does, its scale, or how to reduce it (`Diplomacy` is the obvious lever by name only).
- How **Synthoid population** estimation works, or why success chance is a **range**. The API
  states min/max but gives **no reason** — "the estimate narrows as you scout" is a plausible
  inference, *not documented*.
- What an action **level** does. The only documented coupling is that `getActionRankGain` /
  `getActionRankLoss` / `getActionRepGain` accept a `level` argument. Nothing ties level to time,
  success chance, or reward, and nothing states autolevel's increment rule.
- **Stamina**'s effect on success chance, or its regeneration rate.
- What each of the **12 skills** actually does, or its cost curve.
- **Rank gain rates**, and the **rank requirement of any black op**.

**This is the mirror image of the gang situation, and it flips the design conclusion.** For gangs,
`GangTaskStats` + `ns.formulas.gang.*` exposed every yield, which is precisely why Phase 27's
"build an observer and derive the thresholds empirically" premise was *false* and got that
brainstorm invalidated three times. Here, the formulas module has one method and the in-game doc is
three paragraphs — so **an observe-and-measure approach is genuinely correct for Bladeburner
yields**. Do not carry the gang lesson over as "always read, never measure"; the lesson was *read
the interface first, then you know which of the two you need*. Read first — we did — and the answer
came back "measure."

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
| `startAction(type, name): boolean` | 4 | `true` if started. **The docs never enumerate why it fails** (rank? count? stamina?) — one opaque boolean. |
| `stopBladeburnerAction(): void` | 2 | No return, no failure signal. |
| `getCurrentAction(): BladeburnerCurAction \| null` | 1 | `null` when idle. ⚠️ Returns `{name: string, type: string}` as **plain strings**, not the branded types the other methods demand. |
| `getActionCurrentTime(): number` | 4 | **Milliseconds** already spent on the current action. Undefined behavior when idle. |
| `getActionTime(type, name): number` | 4 | **Milliseconds** to complete. No documented error case. |
| `getActionEstimatedSuccessChance(type, name, sleeveNumber?): [number, number]` | 4 | `[MIN, MAX]` chance, **in 0–1 not percent** (docs shout: "return 0.8, NOT 80"). Why it's a range is undocumented. |
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
`switchCity(city): boolean` (nothing documented about cost, travel time, or whether it interrupts
the current action) · `getCityChaos(city)` · `getCityEstimatedPopulation(city)` (explicitly an
*estimate*) · `getCityCommunities(city)` (also an estimate).

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

---

## 8. Not knowable until we join — the honest gap

**Updated 2026-07-30 — division joined, first re-probe done.** Two items below are now answered;
the rest still need Stage 2's action-level instrumentation (the current probe only reads
reachability + rank + the black-op ladder, not per-action yields).

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
- **❓ Still open — rank gain per action**, and therefore any time estimate to rank 25 (faction) or
  to rank 400,000 (final black op). This is the input the Stage-1 objection's flip condition (§1)
  actually needs, and it isn't in this probe.
- **❓ Still open — action times, success chances, counts** for all 15 contracts/operations/general
  actions.
- **❓ Still open — the 12 skills' effects and cost curves** — `getSkillUpgradeCost` needs a real
  skill name + level now that we're employed; not yet run. `skillMaxUpgradeCount` was reachable
  even pre-join but needs real `level`/`skillPoints` args to be meaningful.
- **❓ Still open — chaos and population dynamics**, and whether `Field Analysis` / `Diplomacy` do
  what their names suggest.
- **❓ Still open — stamina drain and regen**, and its coupling to success chance.
- **❓ Still open — whether `switchCity` interrupts the current action or costs anything.**

---

## 9. Probes — re-run these, don't rewrite them

| Script | RAM | What it captures |
|---|---|---|
| `src/bladeburnerprobe.js` | 19.20 GB (measured 2026-07-30 live; earlier 16.20/16.40 GB figures were stale) | API reachability map (per-method throw text), the combat-100 join gate, `getResetInfo` (node + owned SF + `disableBladeburner`), **live `getBitNodeMultipliers()` for the current node and BN7**, the Bladeburner faction invite requirement, Intelligence, and `formulas.bladeburner`'s method list. Staged breadcrumb writes → survives a mid-run death. Needs a companion (e.g. `augfarmer.js`, 64.10 GB) killed temporarily on a RAM-tight home — it does not fit alongside the full companion stack even on a 128 GB home. |
| `src/combatgateprobe.js` | small | Exp needed per combat stat for level 100 at the current mult, plus the exp-vs-mult curve. |
| `src/joinbladeburner.js` | 7.60 GB | One-shot: stops the current player action, calls `joinBladeburnerDivision()`, logs before/after state. Not idempotent-dangerous — safe to re-run (both join calls return `true` for an existing member). |

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
  figure to the measured 19.20 GB. Rank-gain-per-action and all action/skill yields remain
  unmeasured — Stage 2's real remaining work.
