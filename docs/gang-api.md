# Gang mechanics & API reference (this build)

Complete surface of `ns.gang.*` and `ns.formulas.gang.*`, read systematically from `markdown/`
2026-07-18. Written because a Phase 27 design was drafted off the *method list alone* and its
premise was invalidated twice by facts sitting in these files. **Read this before designing
against gangs.**

Availability: **in BN2, or anywhere with SF2.** We are in BN2.1.

---

## The precondition that shapes everything

**Only `inGang()` works before a gang exists.** Every other call — including the two documented
at **0 GB** (`getTaskNames`, `getEquipmentNames`) — throws
`API ACCESS ERROR: Must have joined gang`. Measured live (`src/gangprobe.js`, `src/gangreach.js`):

```
OK    inGang
FAIL  getGangInformation / getMemberNames / getAllGangInformation
FAIL  getTaskNames / getEquipmentNames
```

**0 GB RAM cost does not imply "no precondition"** — the docs state the gang requirement nowhere.
Consequence: nothing about gangs is measurable until `createGang()`, which is irreversible (gang
type fixed by faction, no `leaveGang()`). See [[reference_gang_api_requires_joined_gang]].

---

## Gameplay mechanics (from the in-game Documentation → Gang page, read via CDP 2026-07-18)

The API tells you what you can *call*; this is what the numbers *mean*. Captured verbatim-ish
because none of it appears in `markdown/`.

**Creation.** Outside BN2 you need karma ≤ −54000. **In BN2 there is no karma gate** — only
membership in a gang-capable faction. "Creating a Gang in other BitNodes will offer more
Augmentations than other Factions, **but they will not be a way to destroy the BitNode alone**"
— i.e. the gang-sells-The-Red-Pill route appears to be BN2-specific.

**Respect** is the central currency. Earned as members complete tasks. It drives:
- gang productivity,
- **your Faction Reputation** — which is how you buy augs from the gang faction (this is the
  rep-tax-killer mechanism, and it bypasses BN2's Work Reputation 50% / Passive Rep 0% nerfs),
- the number of members you can recruit.

A member's respect is **lost when they Ascend, or if they are killed in a clash**.

**Install-immunity.** "While in a BitNode, your gang and gang member stats will not reset if you
install augmentations." This is the only asset we own that survives the ratchet's install cycle.
⚠️ But see open question 1 — `GangMemberInstall` suggests ascension multipliers are *reduced*
on install. Reduce ≠ reset, so both statements can hold; unverified.

**Ascension.** A permanent boost to a member's stat multipliers, at the cost of resetting their
base stats **and equipment** to 0, and reducing Gang Reputation by the respect that member earned
since their last ascension. So ascension is a respect-for-multiplier trade with an equipment
write-off.

**Equipment.** Boosts stats until the member ascends or dies, "at which point most equipment will
reset." **Augmentations installed on gang members do NOT reset on ascension** — so member augs are
strictly better than gear for anyone you intend to ascend repeatedly. Member earnings scale with
current stats × equipment × ascension effects.

**Wanted level** "can make tasks much less productive," and is driven by which tasks members are
assigned. Two named tasks lower it: **"Ethical Hacking"** and **"Vigilante Justice"**. This is the
classic silent-income-killer; `GangGenInfo.wantedPenalty` exposes it directly.

**Territory.** **"Territory Warfare"** is a task that builds `power`. If territory clashes are
enabled (`setTerritoryWarfare`), members can win or lose territory against rival gangs. **The %
of territory controlled affects most aspects of gang productivity** — which is why `GangTaskStats`
carries a `territory` weight per task. ⚠️ **Members can die during clashes even when the gang
wins.**

## Methods

### Lifecycle
| Call | RAM | Notes |
|---|---|---|
| `inGang(): boolean` | 0 | Only pre-gang call |
| `createGang(faction: FactionName): boolean` | 1 | `false` if faction disallows → **safe probe**. Outside BN2 needs karma ≤ −54000; **in BN2 no karma gate** |
| `canRecruitMember(): boolean` | 1 | Founding members are free immediately after `createGang`; later recruits cost respect |
| `recruitMember(name: string): boolean` | 2 | Fails if at max members or name taken |
| `getRecruitsAvailable(): number` | 1 | |
| `respectForNextRecruit(): number` | 1 | |
| `renameMember(memberName, newName): boolean` | 0 | Cosmetic |

### State
| Call | RAM | Returns |
|---|---|---|
| `getGangInformation()` | 2 | `GangGenInfo` |
| `getMemberNames()` | 1 | `string[]` |
| `getMemberInformation(name)` | 2 | `GangMemberInfo` |
| `getAllGangInformation()` | 2 | `Record<string, GangOtherInfoObject>` — rivals |

### Actions (only four that change anything)
| Call | RAM | Notes |
|---|---|---|
| `setMemberTask(member, task): boolean` | 2 | **Invalid task name silently sets "Unassigned"** (idle) — validate against `getTaskNames()` |
| `purchaseEquipment(member, equip): boolean` | 4 | |
| `ascendMember(member): GangMemberAscension \| undefined` | 4 | |
| `setTerritoryWarfare(engage: boolean): void` | 2 | |

### Previews / reference (all read-only)
| Call | RAM | Notes |
|---|---|---|
| `getTaskNames()` | 0 | |
| `getTaskStats(name)` | 1 | `GangTaskStats` — "typically used to evaluate which action should be executed next" |
| `getEquipmentNames()` | 0 | **Includes Augmentations**, not just gear |
| `getEquipmentStats(name)` | 2 | `EquipmentStats` |
| `getEquipmentCost(name)` | 2 | **Already applies `equipmentCostMult`** — don't double-apply. Returns `Infinity` if invalid |
| `getEquipmentType(name)` | 2 | Weapon / Armor / Vehicle / Rootkit / Augmentation |
| `getAscensionResult(member)` | 2 | Preview without ascending |
| `getInstallResult(member)` | 2 | `GangMemberInstall` — ⚠️ see open question 1 |
| `getChanceToWinClash(gangName)` | 4 | 0–1 |

### Loop control
| Call | RAM | Notes |
|---|---|---|
| `await nextUpdate(): Promise<number>` | 0 | Resolves to ms of gang-time processed (2000–5000). **The game's own tick — don't invent a polling interval** |
| `getBonusTime(): number` | 0 | Accumulated ms of bonus time |

**Bonus time is a big deal:** accrues while the game is offline or the browser tab is inactive,
and makes the gang progress **up to 25× normal speed**. This is the one mechanic we've seen that
*rewards* the computer being idle — it partially inverts [[reference_sleep_not_grind]] for gangs
specifically. Any throughput model must account for it or it will badly mispredict.

---

## Data structures

### `GangGenInfo` — `getGangInformation()`
`faction` · `isHacking` (**read-only, fixed at creation, permanent**) · `respect` ·
`respectGainRate` · `respectForNextRecruit` · `moneyGainRate` · `power` · `territory` (0–1) ·
`territoryClashChance` · `territoryWarfareEngaged` · `wantedLevel` · `wantedLevelGainRate`
(negative when falling) · `wantedPenalty` · `equipmentCostMult`

### `GangMemberInfo` — `getMemberInformation(name)`
Per stat in {hack, str, def, dex, agi, cha}: `x` (level) · `x_exp` · `x_mult` (from **equipment**)
· `x_asc_mult` (from **ascensions**) · `x_asc_points`.
Plus: `name` · `task` · `earnedRespect` (since last ascension) · `respectGain` · `moneyGain` ·
`wantedLevelGain` · `expGain` (`GangMemberExpGain | null` — **null when the member has no task**)
· `upgrades[]` (non-aug equipment) · `augmentations[]`

### `GangTaskStats` — `getTaskStats(name)` ← **the optimizer's entire input**
`name` · `desc` · `isHacking` · `isCombat` · `baseRespect` · `baseMoney` · `baseWanted` ·
`hackWeight` / `strWeight` / `defWeight` / `dexWeight` / `agiWeight` / `chaWeight` ("skill impact
on task scaling") · `difficulty` · `territory` ("territory impact on task scaling")

A complete linear-ish model per task: base yields, per-stat weights, difficulty, territory term.

### `GangMemberAscension` — `ascendMember()` / `getAscensionResult()`
`hack`/`str`/`def`/`dex`/`agi`/`cha` = factor by which that ascension multiplier **increased**
(newMult / oldMult) · `respect` = **amount of respect LOST** by ascending.

### `GangMemberInstall` — `getInstallResult()`
Same six stat fields, but **decreased** (newMult / oldMult). No `respect` field.

### `GangOtherInfoObject` — rivals
`power` · `territory` (0–1)

### `EquipmentStats`
`hack`/`str`/`def`/`dex`/`agi`/`cha` — flat multipliers.

---

## Formulas — `ns.formulas.gang.*`

```ts
respectGain(gang: GangGenInfo, member: GangMemberInfo, task: GangTaskStats): number
moneyGain(gang, member, task): number
wantedLevelGain(gang, member, task): number
wantedPenalty(gang: GangGenInfo): number
ascensionMultiplier(points: number): number
ascensionPointsGain(exp: number): number
```

**Requires Formulas.exe on home ($5b).** We hold $5,695 — so this is a *later* capability, not a
day-one one.

---

## What this means for design (corrects two earlier mistakes)

**With Formulas.exe, almost nothing needs to be measured.** Task assignment is a brute-force over
members × tasks calling `respectGain`/`moneyGain`/`wantedLevelGain` — exact, ~7×20 evaluations,
trivial compute. Ascension timing is exact via `getAscensionResult`. Clash odds are exact via
`getChanceToWinClash`. Equipment is exact via cost + stats.

So the Phase 27 premise — *"every threshold is empirical, so observe first"* — **was wrong**. It
was written from the method list without reading `GangTaskStats` or the formulas signatures.

**Without Formulas.exe** (our actual near-term state) the *inputs* are all still exposed, but the
functional form combining them is not. Two honest options: reconstruct the model from the weights
and validate it against observed `respectGain`/`moneyGain` fields on `GangMemberInfo` (which
report actuals per member), or defer optimization until Formulas is affordable. **Note this makes
observation genuinely useful again — but as model *validation*, not as threshold discovery.**

`GangMemberInfo.respectGain` / `.moneyGain` / `.wantedLevelGain` are per-member actuals, so a
predicted-vs-actual check is available for free without Formulas.exe. That is the cheapest path
to a trustworthy model.

---

## Open questions — verify, don't assume

1. **⚠️ Does a player aug install degrade gang members?** `GangMemberInstall`'s fields read
   "factor by which the X ascension multiplier was **decreased**", yet the in-game Gang doc says
   "your gang and gang member stats will **not reset** if you install augmentations." Reduce ≠
   reset, so both can be true — but if installs degrade the gang, that collides directly with our
   aug-ratchet, which installs constantly. **Resolve before running the ratchet alongside a gang.**
2. **`createGang`'s karma text.** API doc says "karma must be less than or equal to 54000"; the
   in-game doc says "−54000 karma or lower". Almost certainly a sign typo in the API doc. Moot in
   BN2 (no karma gate) but matters for using gangs in other nodes.
3. **Which factions allow gang creation** — not exposed by any API and not in any documentation
   (checked in-game docs, `faction_list.md`, `gang.md`). Only in game source, which is off-limits
   by CLAUDE.md. **`createGang` returning `false` is a safe empirical probe** once a member of a
   candidate faction.
4. **Max gang members** — `canRecruitMember` mentions a maximum; the number isn't documented.
5. **Territory-warfare death risk** — the in-game doc warns members can die in clashes even when
   winning. No API exposes the per-clash death probability.

## Related in-repo

`src/gangprobe.js` (static task/equipment dump — works the moment a gang exists) ·
`src/gangreach.js` (pre-gang reachability probe; question permanently answered, safe to delete) ·
`docs/bitnodes.md` → BN2 clearing notes (the 15,000 gate).
