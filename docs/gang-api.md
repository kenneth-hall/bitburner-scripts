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

1. **~~⚠️ Does a player aug install degrade gang members?~~ — ✅ RESOLVED 2026-07-20. Yes: −2.53%
   hack ascension multiplier per install.** Measured live, read-only, via `getInstallResult()` for
   all 8 members (`run ascendrecon.js`, no `--commit`; raw:
   `logs/ascendrecon-1784572486984.json`). Result: **`hack` × 0.9746794344808963 — bit-identical
   across every member who has ascended at least once**, regardless of their current ascension
   mult (measured across mults 1.517 → 3.174). `str`/`def`/`dex`/`agi`/`cha` are all exactly
   `1.0` (we hold no ascension points in those). The one member who had never ascended
   (`hack_asc_mult` exactly 1.000) returns `1.0`, i.e. the reduction floors at 1.0 and cannot push
   a mult below baseline.
   - **The docs never actually contradicted each other** — they describe different quantities.
     The in-game text promises base **stats** survive an install; `GangMemberInstall` describes
     the **ascension multiplier**, a separate value. Both hold simultaneously.
   - **Why the factor is flat:** a constant ratio across widely different mults is the signature
     of a power-law mult-from-points curve (`mult ∝ points^k`) with the reduction applied to
     *points* — the mult ratio then comes out as `r^k`, independent of how many points you hold.
     Inferred from the data, not from game source.
   - **What it costs us:** the tax compounds against the aug-ratchet, which installs constantly.
     `0.9747^20 ≈ 0.60` (~40% of hack ascension mult gone over 20 installs); `0.9747^50 ≈ 0.28`.
     Break-even is `ln(F) / 0.02563` installs per ascension of factor `F` — so one **1.5×**
     ascension pays for ~**16** installs.
   - **Current policy already survives this, by luck rather than design.** `ASCEND_MIN_FACTOR =
     1.5` (`gangmanager.js:73`) means we only ascend on large gains, which is exactly the right
     shape — frequent small ascensions (our live previews run 1.005–1.212×) would *lose* the race
     outright. The open risk is cadence, not policy: if 1.5× ascensions arrive slower than ~1 per
     16 installs, the gang's hack mults decay net-negative. **That cadence is measurable from the
     existing `ascend` gang-log events — no new code needed.**
2. **`createGang`'s karma text.** API doc says "karma must be less than or equal to 54000"; the
   in-game doc says "−54000 karma or lower". Almost certainly a sign typo in the API doc. Moot in
   BN2 (no karma gate) but matters for using gangs in other nodes.
3. **Which factions allow gang creation** — not exposed by any API and not in any documentation
   (checked in-game docs, `faction_list.md`, `gang.md`). Only in game source, which is off-limits
   by CLAUDE.md. **`createGang` returning `false` is a safe empirical probe** once a member of a
   candidate faction. **Confirmed 2026-07-19: NiteSec allows it** (returned `true`, `isHacking`
   `true`). The other candidates remain untested and now unreachable — there is no `leaveGang()`.
4. **Max gang members** — `canRecruitMember` mentions a maximum; the number isn't documented.
5. **Territory-warfare death risk** — the in-game doc warns members can die in clashes even when
   winning. No API exposes the per-clash death probability.

## Measured: our actual task menu (2026-07-19, NiteSec hacking gang)

Dumped by `gangprobe.js` the moment the gang existed → `logs/gangprobe-1784473065811.json`
(`errors: []`, 15 tasks, 32 equipment). **`getTaskNames()` returns only the tasks available to
*our* gang type** — the combat-gang list (Mug People, Deal Drugs, Armed Robbery, Traffick Illegal
Arms, Human Trafficking, Terrorism, …) simply does not appear. These 15 are the whole menu:

| Task | money | respect | wanted | diff | hack/cha weight |
|---|---|---|---|---|---|
| Ransomware | 3 | 0.00005 | 0.0001 | 1 | 100 / 0 |
| Phishing | 7.5 | 0.00008 | 0.003 | 3.5 | 85 / 15 |
| Identity Theft | 18 | 0.0001 | 0.075 | 5 | 80 / 20 |
| DDoS Attacks | 0 | 0.0004 | 0.2 | 8 | 100 / 0 |
| Plant Virus | 0 | 0.0006 | 0.4 | 12 | 100 / 0 |
| Fraud & Counterfeiting | 45 | 0.0004 | 0.3 | 20 | 80 / 20 |
| **Money Laundering** | **360** | 0.001 | 1.25 | 25 | 75 / 25 |
| **Cyberterrorism** | 0 | **0.01** | **6** | 36 | 80 / 20 |
| Ethical Hacking | 3 | 0 | **−0.001** | 1 | 90 / 10 |
| Vigilante Justice | 0 | 0 | **−0.001** | 1 | 20 / 0 |
| Train Hacking / Charisma / Combat | 0 | 0 | 0 | 45 / 8 / 100 | — |
| Territory Warfare | 0 | 0 | 0 | 5 | 15 / 5 |
| Unassigned | 0 | 0 | 0 | 1 | — |

Shape of the problem, readable straight off the table — **no observation period needed**, which is
the premise three deleted features docs got wrong:
- **Money ladder** is strictly ordered by difficulty: Ransomware → Phishing → Identity Theft →
  Fraud → **Money Laundering (360, 8× the next best)**. Assignment is a stat-gated climb.
- **Respect** comes almost solely from **Cyberterrorism** (0.01, 10× Money Laundering) at a brutal
  **6 wanted** — the central tension in the whole design.
- **Only two wanted-level sinks exist**, both at −0.001: Ethical Hacking (which also earns 3) and
  Vigilante Justice (which earns nothing). Ethical Hacking dominates Vigilante Justice for a
  hacking gang — same wanted reduction, strictly more money, higher hack weight.

**Equipment:** 32 items, 8 carry a `hack` mult — Demon Rootkit / Jack the Ripper / Neuralstimulator
(×1.15), Hmap Node (×1.12), Soulstealer Rootkit / DataJack (×1.10), NUKE Rootkit / BitWire (×1.05).

⚠️ **`gangprobe.js` captures only `name` + `mults` per item — no `cost`, no `type`.** Any purchase
logic needs both (`getEquipmentCost` / `getEquipmentType`). Fix the probe before the spec depends
on it.

## Measured (Phase 29, 2026-07-20): two facts the earlier open questions left unresolved

- **Faction rep tracks the respect *gain rate*, not the total respect.** Measured live via
  `src/ascendrecon.js --commit`, ascending `nite-07`: respect dropped by exactly the previewed
  330.14 on ascension; faction rep did not move at all, then resumed climbing at the (temporarily
  lower) new rate. **Ascension claws back nothing from faction rep** — the "amount of Respect
  LOST by ascending" (`GangMemberAscension.respect`) is a respect-ledger cost, not a rep cost. This
  settles the Tier 3 policy question the ascension section above left open: ascend aggressively.
  Raw: `logs/ascendrecon-1784568236075.json`.
- **`getAscensionResult` has an undocumented minimum-strength floor.** All 8 members previewed;
  the 7 with `hack` ≥ 79 got a result (×1.517 to ×3.079), the 8th (`hack` 27) got `undefined` —
  not a zero-value result, no result at all. The floor's exact threshold is unmeasured (only one
  below-floor data point exists). Policy: skip silently, don't error — the member keeps earning
  and crosses the floor on its own. Same raw file as above.

## Related in-repo

`src/gangprobe.js` (static task/equipment dump — works the moment a gang exists; **missing
cost/type, see above**) · `src/gangcreate.js` (one-shot creator + safe faction probe) ·
`src/gangaugs.js` (aug-catalog sweep across factions; works pre-gang, no membership needed) ·
`docs/bitnodes.md` → BN2 clearing notes (the 15,000 gate).
