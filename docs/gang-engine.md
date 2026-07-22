# Gang engine (BN2.1)

Everything about the NiteSec hacking gang that isn't a live TODO or a frozen phase record: the
current strategy, the full decision history (so a fresh session can check "was this already tried"
before re-deriving it), the API/mechanics reference, the economics, and `gangmanager.js`'s design.

**Consolidated 2026-07-22** from `docs/gang-api.md`, `docs/bn2-gang-type-analysis.md`,
`docs/bitnodes.md`'s BN2 clearing notes, `CLAUDE.md`'s gang decision history, and the closeout/
features docs of Phases 27-30/32-33. Those two standalone docs are archived (superseded, not
deleted) at `docs/archive/`; the phase docs stay where they are (`docs/phases/`, or repo root for
Phase 30 which is still unshipped) — this doc pulls their *durable* conclusions forward without
duplicating their blow-by-blow.

**What's deliberately NOT here:**
- Live TODOs / open bugs / standing tripwires → `BACKLOG.md` (search "gang" / "Tier 4" / "NFG").
  This doc points at them, doesn't duplicate them, since BACKLOG is the thing that's supposed to
  stay current.
- The full session-by-session narrative of any one phase (what broke, what got tried, exact test
  counts) → the phase's own `.features.md`/`.spec.md`/`.closeout.md`. This doc keeps only the
  conclusion and the one-line reason.
- Live numbers (current M, income rate, respect) → the dashboard GOAL/GANG panels and `logs/`.
  A doc is a bad place for a number that changes hourly.

---

## 1. Current strategy (read this first)

As of **2026-07-22**:

| Axis | Current answer | Since | Why (one line) |
|---|---|---|---|
| Gang / faction | NiteSec, hacking gang, committed & permanent | 2026-07-19 | Only gang-capable faction reachable pre-gang with a real hacking catalog; irreversible (`isHacking` fixed, no `leaveGang()`) |
| Task-ladder objective | **Money** | 2026-07-21 (pivot) | Respect is saturated (recruiting capped at 12/12, faction rep 2.5m cap already 425× exceeded) — money is the only thing still gated |
| Ascension | Aggressive — ascend whenever preview clears **×1.5** | 2026-07-20 | Respect *lost* on ascension never touches faction rep (only the respect ledger); the only real cost is a transient rate dip |
| Equipment | Rootkits bought broadly/early (cheap, ascension-disposable); member augs staged onto ascension-rotation members only (expensive, ascension-permanent) | 2026-07-20 | Ascension wipes ordinary gear but not member augs — the split follows directly from that mechanic |
| Territory (Tier 4) | **Deferred for this node** (not permanently) | 2026-07-21, rationale corrected 2026-07-22 | Money saturates the remaining need (~½ day) faster than meaningful territory can be built (≥3–6 days) — moot for BN2.1, re-price for any future gang node |
| Faction rep | Saturated, non-issue | confirmed 2026-07-20/21 | 98-aug catalog tops out at 2.5m rep req; gang holds ~18m+ banked respect |
| Catalog access | Solved — NiteSec sells 98 of 99 augs (×22.89 hacking), incl. free Red Pill | 2026-07-20/21 | Post-`createGang` sweep; pre-gang reading (×1.515) was stale and is superseded everywhere |

**BN2.1 clear goalposts** (the live tripwire table, mirrored in `CLAUDE.md` — that copy is the one
to keep current; GP1 is auto-captured by `gatewatch.js`):

| # | Milestone | Signal | Tripwire → intervene |
|---|---|---|---|
| 1 | **Gate read** (pivotal) | Red Pill installs → read `getServerRequiredHackingLevel("w0r1d_d43m0n")` + `getFactionRep("NiteSec")` pre/post | no install in 2 days |
| 2 | Core catalog, M≈16.7 | `goal-state` `mProgress.pct` → 100% | pct flat >12h |
| 3 | NFG tail, M≈35–37 (NFG ~76–80) | `neurofluxLevel` climbs | NFG stalls deep → rep-paced |
| 4 | Terminal XP grind → gate | player `hackingLevel` | exp low → pivot fleet RAM to XP |
| 5 | Backdoor WD → CLEAR | BitVerse | — |

**Shipped, in build order:** Phase 27 Tier 1 (recruit + task-assign) → Phase 29 Tiers 2-3
(equipment + ascension) → `gangratelog.js` (durable respect-rate sampler) → money pivot
(task-ladder objective flipped to money) → Phase 33 (`augfarmer.js` escalation-aware buy order +
utility must-buys) → `goallog.js`/dashboard GOAL panel (M-progress tracking) → 2026-07-22 territory
audit (corrected the Tier-4 deferral's *reasoning*, not its verdict).

**Don't buy QLink for the gate.** Its ×1.75 hacking mult costs $25t; the equivalent ~56 NFG levels
cost ~$8b base (~$100–150b with real escalation) — 200–3000× cheaper for the same gate contribution.
QLink's money/speed mults only help the batcher (~4-6% of income), not the level gate. See §4.

**Don't stop the ladder at M≈29.** Overshoot to **M≈35–37** (NFG ~76–80) — the terminal XP grind to
15,000 is brutally M-sensitive (M=29 → 7–36 days; M=35–37 → hours), and the NFG overshoot only
costs ~$100–150b more. See §4.

---

## 2. Decision log

The point of this section: every reversal below has a **stated reason tied to a state change**,
not the same question re-asked. Read this before recommending a strategy change — if the change
isn't justified by *new* evidence, a failure occurring, or stakes changing, it's probably already
been tried.

| Date | Decision | Reason | What would reopen it |
|---|---|---|---|
| 2026-07-18 | `docs/gang-api.md` written from a full read of the API surface | A brainstorm draft's premise ("every threshold is empirical") was false and had been invalidated twice already — see `CLAUDE.md`'s "Read the whole interface" rule | — |
| 2026-07-19 | **Committed to BN2, NiteSec hacking gang.** Permanent. | SF2 kills the recurring Daedalus rep tax; restart is cheap when a node holds no progress (Kenneth's closing argument) | N/A — irreversible, no `leaveGang()` |
| 2026-07-19 | Pre-gang catalog reading: gang factions only add ~+6% M (×1.061 union of criminal factions) | Measured via `gangaugs.js` sweep run *before* `createGang()` | **Superseded 2026-07-20** — see next row |
| 2026-07-20 | Phase 27 Tier 1 ships: task ladder ordered by **money** | Initial build; no data yet on the wanted-level cost of climbing | **Reversed same day** — see next row |
| 2026-07-20 | **Phase 28 reverses the ladder to money's opposite — pins to Ransomware (near-zero heat)** | The money ladder caused a wanted-level death spiral (Ransomware→Identity Theft ×750 wanted vs ×2 respect); gang was rep-gated, not money-gated, at the time (Neurotrainer I needed 1,000 rep vs ~41 held, while $4.1b sat banked) | Reopened 2026-07-21 once rep saturated — see below |
| 2026-07-20 | **Post-gang catalog re-sweep: NiteSec sells 98/99 augs at ×22.89**, not ×1.515 | Pre-gang sweep (07-19) measured before the gang existed; re-run after `createGang()` shows the "your gang faction sells nearly everything" mechanic is live in this fork | Confirmed catalog access is solved — money is the only open resource (below) |
| 2026-07-20 | Phase 29 ships Tiers 2-3 (equipment + ascension), ladder re-opened up to 8 rungs | Phase 28's pin worked (validated: sink duty cycle 71.6%→0%, respect rate ×15) but exposed a 200× gap to the top (respect) rung that gear+ascension exist to close | Observation window closed early 2026-07-21 — goal overshot 425× |
| 2026-07-21 | **Gang-type analysis: keep the hacking gang, don't restart for combat** (~85% confidence) | Combat's ~20×-territory case rests on a stream (money ×20) that's ~$8.5m/s marginal vs the batcher, and forfeits a rep-complete 12-member gang to rebuild from 3; catalog access is gang-type-independent either way | Direct evidence combat task money ≥10× hacking's at equal development (only obtainable by restarting) |
| 2026-07-21 | **Rep confirmed saturated → money identified as the sole open resource.** This is the state change that reopens Phase 28's respect-pin. | Recruiting capped at 12/12; faction rep 425× over the 2.5m catalog ceiling. "Not far enough into the game" (Phase 28's reason to stay on respect) was true when respect still bought members+rep — it no longer does | — |
| 2026-07-21 | **Money pivot ships: task-ladder objective flips from respect to money.** Income ~7× ($598k/s → $4.2M/s, later steady-state $8.7M/s). | Direct consequence of the row above — a *new* state, not a re-argued old one. Two live regressions caught same session (see §5) before it stabilized | Soak-validated 2026-07-22 over 20.5h (below) |
| 2026-07-21 | Phase 33 ships: `augfarmer.js` buys expensive-first (escalation-aware) + utility must-buys | Cheapest-first buying was ~2.2× overpaying the ×1.9/purchase escalation; utility augs (CashRoot etc.) were losing every score race and never getting bought | V2/V4/V5 (buy-order-across-a-real-cycle, 24h soak) still open follow-ups, not blockers |
| 2026-07-21 | Phase 30 brainstorm: **territory (Tier 4) deferred for BN2.1** | Original reasoning: 80%-combat-weight handicap makes a hacking gang structurally non-viable at territory, ~20× reward not worth it, "permanent" | **Reasoning wrong, verdict right — corrected next row** |
| 2026-07-22 | **Cold-context audit corrects the Tier-4 rationale; deferral verdict stands, rescoped from "permanent" to "for this node."** | All three original grounds were wrong: territory income is ~territory^2.5 (~124× at 100%, not ~20% — a `gangreward.js` bug conflated the money and respect axes); power weights stat *magnitude*, so a pure-hacking gang is plausibly power-viable at zero combat training; rivals compound (~+75%/day) so waiting only gets more expensive. **The real reason to defer:** money saturates the remaining need (~½ day) faster than territory can be built (≥3–6 days) | Any future gang-capable node — re-price from scratch, don't assume this verdict transfers |
| 2026-07-22 | Soak-validated the money pivot over 20.5h (247 samples) | Steady-state $8.74M/s (13% spread, not oscillating), `netWantedRate > 0` in 0/247 samples, ascension mults net-positive (41.9→93.1 across ~1/20h installs) | A future install showing the crew NOT re-parking on Money Laundering, or income oscillating/wanted creeping over hours |

**Reading the table as an answer to "are we going in circles":** two real reversals on the
task-ladder objective (money→respect Phase 28, respect→money 2026-07-21), each triggered by a
state change (a death-spiral bug found, then rep saturating), not by re-litigating the same
question. Territory is a *separate* axis (territory/power, not the per-member task objective) that
has never recommended switching to respect — its one "correction" (2026-07-22) reaffirmed the same
deferred verdict with fixed math. If a future recommendation to "point the gang at rep" shows up,
check first whether it's actually about territory (this axis) before treating it as a reopened
task-ladder debate.

---

## 3. Gang API & mechanics reference

Complete surface of `ns.gang.*` and `ns.formulas.gang.*`, read systematically from `markdown/`
2026-07-18. Written because a Phase 27 design was drafted off the *method list alone* and its
premise was invalidated twice by facts sitting in these files — **read this before designing
against gangs.** Availability: in BN2, or anywhere with SF2. We are in BN2.1.

### The precondition that shapes everything

**Only `inGang()` works before a gang exists.** Every other call — including the two documented at
**0 GB** (`getTaskNames`, `getEquipmentNames`) — throws `API ACCESS ERROR: Must have joined gang`.
**0 GB RAM cost does not imply "no precondition."** Nothing about gangs is measurable until
`createGang()`, which is irreversible (gang type fixed by faction, no `leaveGang()`).

### Gameplay mechanics (from the in-game Documentation → Gang page)

- **Creation.** In BN2 there is no karma gate — only membership in a gang-capable faction.
  Outside BN2, karma ≤ −54000 is required.
- **Respect** is the central currency: drives gang productivity, **faction reputation** (the
  rep-tax-killer mechanism — bypasses BN2's Work Rep 50% / Passive Rep 0% nerfs), and how many
  members you can recruit. Lost when a member Ascends or is killed in a clash.
- **Install-immunity.** Gang and member stats do not reset on aug install — the one asset that
  survives the install ratchet. (But see the ascension-multiplier degradation below — reduce ≠
  reset, both hold simultaneously.)
- **Ascension.** Permanent boost to a member's stat *multipliers*, at the cost of resetting base
  stats + equipment to 0 and reducing **gang respect** (not faction rep) by what that member earned
  since their last ascension.
- **Equipment.** Boosts stats until ascension/death, at which point ordinary gear resets.
  **Member augmentations do NOT reset on ascension** — strictly better than gear for anyone
  ascended repeatedly.
- **Wanted level** can make tasks much less productive. Two tasks reduce it: Ethical Hacking and
  Vigilante Justice.
- **Territory.** Territory Warfare builds `power`; territory % affects most of gang productivity.
  Members can die during clashes even when the gang wins, and no API exposes the per-clash death
  probability.
- **Bonus time** accrues while offline/tab-inactive, up to **25× normal gang speed** — one of the
  few mechanics that *rewards* idling; any gang throughput model must account for it.

### Methods (RAM cost in GB)

| Group | Calls |
|---|---|
| Lifecycle | `inGang()` 0 · `createGang(faction)` 1 — `false` if faction disallows, safe probe · `canRecruitMember()` 1 · `recruitMember(name)` 2 · `getRecruitsAvailable()` 1 · `respectForNextRecruit()` 1 · `renameMember` 0 |
| State | `getGangInformation()` 2 → `GangGenInfo` · `getMemberNames()` 1 · `getMemberInformation(name)` 2 → `GangMemberInfo` · `getAllGangInformation()` 2 → rivals |
| Actions (the only 4 that change anything) | `setMemberTask(member, task)` 2 — **invalid task name silently sets "Unassigned"** · `purchaseEquipment` 4 · `ascendMember` 4 · `setTerritoryWarfare(bool)` 2 |
| Previews / reference (read-only) | `getTaskNames()` 0 · `getTaskStats(name)` 1 → `GangTaskStats` · `getEquipmentNames()` 0 (includes augs) · `getEquipmentStats` 2 · `getEquipmentCost` 2 (already applies cost mult) · `getEquipmentType` 2 · `getAscensionResult(member)` 2 · `getInstallResult(member)` 2 → `GangMemberInstall` · `getChanceToWinClash(gangName)` 4 |
| Loop control | `await nextUpdate()` 0 — the game's own tick (2000–5000ms), don't invent a polling interval · `getBonusTime()` 0 |

### Data structures

- **`GangGenInfo`** — `faction` · `isHacking` (fixed, permanent) · `respect` · `respectGainRate` ·
  `moneyGainRate` · `power` · `territory` (0-1) · `territoryClashChance` ·
  `territoryWarfareEngaged` · `wantedLevel` · `wantedLevelGainRate` · `wantedPenalty` ·
  `equipmentCostMult`
- **`GangMemberInfo`** — per stat {hack,str,def,dex,agi,cha}: `x`/`x_exp`/`x_mult`
  (equipment)/`x_asc_mult`/`x_asc_points`. Plus `task`, `earnedRespect`, `respectGain`,
  `moneyGain`, `wantedLevelGain`, `expGain`, `upgrades[]`, `augmentations[]`
- **`GangTaskStats`** (← the optimizer's entire input) — `baseRespect`/`baseMoney`/`baseWanted`,
  per-stat weights, `difficulty`, `territory` impact
- **`GangMemberAscension`** — per-stat multiplier *increase* factor + `respect` lost
- **`GangMemberInstall`** — per-stat multiplier *decrease* factor, no respect field
- **`EquipmentStats`** — flat per-stat multipliers

### Formulas — `ns.formulas.gang.*` (requires Formulas.exe, $5b — we own it)

```ts
respectGain(gang, member, task): number
moneyGain(gang, member, task): number
wantedLevelGain(gang, member, task): number
wantedPenalty(gang): number
ascensionMultiplier(points): number
ascensionPointsGain(exp): number
```
With Formulas, almost nothing needs empirical observation: task assignment is a brute-force
member×task evaluation (~7×20, trivial), ascension timing is exact, clash odds are exact via
`getChanceToWinClash`. **Without Formulas** the inputs are still exposed but the functional form
isn't — reconstruct from weights and validate against `GangMemberInfo`'s per-member actuals, or
defer.

### Measured: our task menu (NiteSec hacking gang, 15 tasks)

| Task | money | respect | wanted | diff | hack/cha weight |
|---|---|---|---|---|---|
| Ransomware | 3 | 0.00005 | 0.0001 | 1 | 100/0 |
| Phishing | 7.5 | 0.00008 | 0.003 | 3.5 | 85/15 |
| Identity Theft | 18 | 0.0001 | 0.075 | 5 | 80/20 |
| DDoS Attacks | 0 | 0.0004 | 0.2 | 8 | 100/0 |
| Plant Virus | 0 | 0.0006 | 0.4 | 12 | 100/0 |
| Fraud & Counterfeiting | 45 | 0.0004 | 0.3 | 20 | 80/20 |
| **Money Laundering** | **360** | 0.001 | 1.25 | 25 | 75/25 |
| **Cyberterrorism** | 0 | **0.01** | **6** | 36 | 80/20 |
| Ethical Hacking (sink) | 3 | 0 | **−0.001** | 1 | 90/10 |
| Vigilante Justice (sink) | 0 | 0 | −0.001 | 1 | 20/0 |
| Territory Warfare | 0 | 0 | 0 | 5 | 15/5 (str/def/dex/agi each 20) |

Money ladder is strictly ordered by difficulty (Ransomware → … → Money Laundering, 8× the next
best). Respect comes almost solely from Cyberterrorism (10× Money Laundering) at a brutal 6
wanted — the central tension the whole design is built around. Only two wanted sinks exist, both
−0.001; Ethical Hacking dominates Vigilante Justice for a hacking gang (same reduction, more money,
higher hack weight).

**Equipment:** 32 items, only 8 carry a hack mult. **Rootkits** (5 items, ×1.711 combined,
$203.58m/member) are cheap and ascension-disposable. **Member augmentations** (3 items — BitWire,
DataJack, Neuralstimulator, ×1.328 combined, $20.82b/member) are expensive and ascension-permanent.
The other 24 (weapon/armor/vehicle) are pure-combat, irrelevant to a hacking gang — confirmed this
is not an under-buy: no charisma augmentation exists in the catalog at all.

### Resolved questions (kept for the "don't re-measure this" record)

1. **Does a player aug install degrade gang members? Yes — `hack` × 0.9747 per install, flat,
   floors at 1.0.** A constant ratio across widely different ascension mults is the signature of a
   power-law mult-from-points curve with the reduction applied to *points*. Cost: `0.9747^20 ≈
   0.60` (~40% of hack ascension mult gone over 20 installs). Break-even: one ×1.5 ascension pays
   for ~16 installs — `ASCEND_MIN_FACTOR = 1.5` already only fires on large gains, the right shape,
   but if ×1.5 ascensions arrive slower than ~1/16 installs, hack mults decay net-negative
   (cadence, not policy, is the open risk — see BACKLOG).
2. **Faction rep tracks the respect *gain rate*, not the total.** Ascending drops respect by
   exactly the preview; faction rep doesn't move, then resumes climbing at the new rate. Ascension
   claws back nothing from faction rep — **ascend aggressively** is the settled policy.
3. **`getAscensionResult` has an undocumented minimum-strength floor** — below it, returns
   `undefined` (not a zero result). Policy: skip silently, the member crosses the floor on its own.
4. **Which factions allow gang creation** isn't documented anywhere; confirmed NiteSec does
   (`createGang` returning `false` is a safe empirical probe). Other candidates are now unreachable
   (no `leaveGang()`).
5. **Territory clash death risk** has no exposed probability — the in-game doc only warns it can
   happen even on a win. Stayed unmeasured (territory is deferred).

---

## 4. Economics — the money arithmetic

### The gate: why BN2's `w0r1d_d43m0n` needs M ≈ 30–35

`w0r1d_d43m0n` Difficulty is **500%** (vs BN1's baseline) → required hacking level **15,000**
(⚠️ still an *inference*, ~85% confidence — unreadable until The Red Pill installs; the standing
checkpoint is GP1 above). Model: `level = mult × (32·ln(exp) − 200)`, validated to 0.02% error
against our own BN1.3 endgame dump.

| XP budget | BN1 gate (3,000) | BN5 (4,500) | BN4 (9,000) | **BN2 (15,000)** |
|---|---|---|---|---|
| our demonstrated actual (9.7e8 exp) | 6.5 | 9.7 | 19.5 | **40.6** |
| 100× | 4.9 | 7.4 | 14.8 | **30.8** |
| 1,000× | 4.4 | 6.6 | 13.2 | **27.4** |

Grinding can't substitute — level is logarithmic in exp (10,000× more XP only buys −39% on the
required multiplier). **Realistic bar: M ≈ 30–35.** Our BN1.3 stack demonstrated M = 10.077; the
gap is closed almost entirely by the gang's aug catalog, not by exp.

### The catalog: solved, and cheap

Post-`createGang` sweep: **NiteSec sells 98 of 99 augs in the whole game at hacking ×22.89**
(essentially the full non-gang-faction union, ×23.121), max rep requirement 2.5m — trivial against
our banked respect. Catalog splits into three tiers:

| Purchase | Price | Hacking mult | Verdict |
|---|---|---|---|
| 96 discrete augs (everything but QLink/Hydroflame) | **$149b** | **×13.08** | Affordable in ~days at current income |
| Hydroflame Left Arm | $2.5t | ×1.00 | Skip — irrelevant to the gate |
| QLink | **$25t** | ×1.75 | Optional, and a trap — see below |

- **No-QLink path:** ×13.08 × SF1.3 (×1.28) ≈ **M ≈ 16.7**, needs an NFG tail of ×1.8–2.1
  (~50–65 levels) to reach the 30-35 bar.
- **QLink path:** ×22.89 × 1.28 ≈ **M ≈ 29**, needs only ~5–15 NFG levels, but costs $25t for it.

**QLink is a trap for the gate.** Its ×1.75 hacking mult ≈ 56 NFG levels. NFG is +1%/level, base
$750k, escalating only ×1.14/level — so those 56 levels cost roughly **$8b base / ~$100–150b with
real escalation**, against QLink's **$25t** — **200–3000× cheaper** for the same gate
contribution. QLink's other mults (money ×4, speed ×2) only help the batcher, which is ~4-6% of
income — not the level mult that gates WD. **Verdict: never buy QLink for this node.**

**Don't stop the ladder at M≈29 either way — overshoot to M≈35–37 (NFG ~76–80).** The reason is
the *terminal XP grind*, not the aug math: every install wipes XP, only the final cycle's grind to
15,000 counts, and that grind is brutally M-sensitive (M=29 → 7–36 days of grinding; M=35–37 →
hours). The NFG overshoot to buy that headroom costs only ~$100–150b more — cheap relative to what
it saves. Buy NFG in variable batches (fat early while levels cost millions, taper to 1–3/install
past ~level 65 where each costs $5–25b) — ~$160–250b total for ~75 levels.

### Why the hacking gang, not a combat restart (~85% confidence, 2026-07-21)

Steel-manned case for combat: territory multiplies gang income ~territory^2.5 (~124× at 100%,
corrected 2026-07-22 from an earlier buggy ~20× reading), and only a combat build can realistically
win territory (80% of the power-weighting is combat stats). **Rejected because:**

1. The multiplier lands on the wrong axis at the wrong time — money isn't binding once catalog
   money exists, it saturates in ~½ day; territory takes ≥3–6 days to build meaningfully. The
   marginal gain arrives after the need is already gone.
2. The catalog gain is exactly zero — NiteSec's 98-aug catalog expansion is **gang-type
   independent**; a combat gang's own faction gets the identical expansion.
3. Restarting forfeits a rep-complete 12-member gang (18m+ respect, all requirements met including
   The Red Pill) to rebuild from 3 members at stat 1, run a territory war from scratch against a
   compounding rival field (Black Hand ~+75%/day), before the multiplier even exists.
4. The batcher dominates the money curve in both worlds regardless of gang type — the gang's
   irreplaceable contributions (catalog access, saturated rep, free Red Pill) are delivered
   identically by either type.

**Rough timelines:** stay ≈ 3-6 weeks mostly unattended; restart ≈ 5-9 weeks with new death-risk
surface, strictly more variance. Asymmetry favors staying. What would flip it: direct evidence
combat task money is ≥10× hacking's at equal development (only obtainable by actually restarting),
or the 15,000 gate reading coming back ≥30,000-class (would force QLink + deep NFG, re-weighting
the calculus).

### Money-throughput fixes (Phase 33, 2026-07-21)

Two structural bugs were quietly taxing every cycle before the fix:
- **Cheapest-first buying** (`pickTarget`'s original score-DESC-then-price-ASC sort) was
  overpaying the ×1.9/purchase escalation — the Nth aug costs `base_N × 1.9^(N-1)`, so buying the
  largest base price against the smallest exponent minimizes total spend. Fixed to price-DESC
  primary (escalation-optimal), NFG still bought last in spend-down.
- **Utility augs were starved.** Allow-listed utility augs (CashRoot Starter Kit, Neuroreceptor
  Management Implant, The Red Pill) score a flat 0.25 — lower than nearly every hacking aug — so
  they lost every score race and went unbought cycle after cycle (confirmed: 7 augs bought one
  cycle, all 3 utility augs still unowned). Fixed with a must-buy tier that guarantees them before
  the install trigger fires.

Live-confirmed same session: the head flipped off a $325.8t QLink reservation onto a fundable
$63.5b aug the instant the new code loaded; must-buy arithmetic matched the hand-worked spec
example almost exactly ($10.26b live vs $10.27b calculated).

### The money pivot (2026-07-21) — numbers

Gang income ~7× ($598k/s → $4.2M/s at ship, **$8.7-9.3M/s at 2026-07-22 steady state**, 20.5h soak,
13% spread — not oscillating). A Money-Laundering member earns **~40×** a Ransomware member of
equal stats. `netWantedRate` stayed negative/zero across the whole soak window (0/247 samples
positive) — heat is not creeping.

---

## 5. Architecture — `gangmanager.js` and companions

**`gangmanager.js`** (headless daemon companion, `RESIDENT_COMPANIONS` priority slot) — recruits
greedily, assigns tasks via the ladder, buys equipment, ascends members. `gang-off.txt` on home
suppresses all actions while it keeps observing/logging.

### Task ladder history

`TASK_LADDER` has been reordered twice (see §2's decision log for *why*):
1. Phase 27: money-ordered 5-rung ladder (Ransomware → … → Money Laundering), promote/demote asked
   only "did money go up?" — caused a wanted-level death spiral.
2. Phase 28: pinned to `["Ransomware"]` (renamed from `MONEY_LADDER`) — the climbing machinery was
   left intact, not deleted, so re-adding rungs switches it back on. `evalPromotion`'s "top rung,
   nothing to probe" early exit made a one-entry ladder go quiet with one line changed.
3. Phase 29: re-opened to an 8-rung respect-ordered ladder once equipment + ascension gave members
   enough strength to afford the heat of climbing.
4. 2026-07-21 money pivot: `evalLadderMove` reworked to optimize **money** — promote by money
   gain, heat-demote worst money-per-heat, efficiency-demote a rung earning less than the one
   below (`gainsFor` added `ns.formulas.gang.moneyGain`). `TASK_LADDER` re-ordered by money with
   the zero-money pure-respect tasks (DDoS/Plant Virus/Cyberterrorism) dropped
   (`LADDER_VERSION` 4→5).
   - **Two live regressions preceded the working version, same session:** (a) reordering the
     ladder alone *regressed* money ($598k→$138k/s) because the still-respect-objective mover
     heat-demoted the top-money task; (b) turning Formulas on with the old respect-objective mover
     crashed money to $0.05M/s — it climbed every high-stat member to Cyberterrorism (max respect,
     zero money) since our stats made even that task read as low-heat. The actual root cause both
     times was that Formulas.exe was OFF (hacking < 400 at ship), which suspends the mover
     entirely — fixed by making the Formulas-exe autobuy gang-aware (see below).

### Equipment policy

Rootkits (5 items, ×1.711, ~$204m/member) bought broadly and early — cheap, ascension-disposable.
Member augs (3 items, ×1.328, ~$20.8b/member — BitWire, DataJack, Neuralstimulator) staged onto
ascension-rotation members only, since ascension wipes ordinary gear but not member augs. The other
24 equipment items are pure-combat and correctly never bought (confirmed: no charisma aug exists in
the catalog either, so the hardcoded 3-aug list is complete for a hacking gang, not an under-buy).

### Ascension policy

`ASCEND_MIN_FACTOR = 1.5` — only ascend on previews clearing ×1.5, staggered one member per
cooldown window. Settled aggressive-ascend policy (§3, resolved question 2) makes this a
throughput lever, not a caution; the one open thread is cadence (does a ×1.5 ascension arrive
often enough relative to the 16-install break-even from the player-install-degradation tax — see
§7).

**`ASCEND_MIN_FACTOR = 1.5` is a hand-set, unvalidated heuristic — audited 2026-07-22, left
alone.** It's confirmed low-stakes and self-obsoleting: it fires cleanly (all 27 logged ascensions
at the time were at preview ≈1.5), ascension mults compounded ×2.2 and income ×20 over a 21h
window with no rebuild-churn collapse, and the whole question dissolves once money saturates
(~½ day). Not worth measuring further for this node. **Low-priority open thread:** post-ascension
members rebuild on low-difficulty ladder rungs where `Train Hacking` (difficulty 45, no
respect/money) might rebuild strength faster than earning rungs do — plausible, unmeasured, not
blocking.

### Companion scripts

- **`gangratelog.js`** — durable `respectGainRate` series + `wantedPenalty` magnitude + aggregate
  ascension mult, sampled from `gang-state.json` (not a second gang-API reader — near-zero RAM,
  zero coupling to `gangmanager.js`). Survives restarts/installs. Built when Phase 29's window
  closed early and nothing persisted the rate series.
- **`gangreward.js`** — territory reward-multiplier probe (money-x / respect-x, now printed as
  separate columns after the 2026-07-22 bug fix).
- **`ascendrecon.js`** — ascension previews for every member (read-only) + a `--commit` mode that
  ascends one member and tracks the rep-vs-respect mechanic.
- **`gangprobe.js`** — static task/equipment dump (name/mults/cost/type), works the moment a gang
  exists.
- **`gangaugs.js`** — aug-catalog sweep across factions (works pre-gang too, no membership needed).
- **`gangcreate.js`** — one-shot creator + safe faction probe (`createGang` returning `false`).
- **`gangtaskcompare.js`** — pulls the *combat* task table via `getTaskStats` (which accepts
  arbitrary names) for the gang-type comparison in §4.
- **`gangterritory.js`** — read-only territory/power/win-odds probe (Tier 4 recon, clashes off).
- **`goallog.js`** — BN2.1 progress sampler (installed M vs target, smoothed $/sec, $-to-next-aug)
  feeding the dashboard GOAL panel. Not gang-specific machinery, but gang income is ~94-96% of
  what it tracks.
- **`gatewatch.js`** — auto-captures GP1 (the gate read) the moment it becomes available.
- **Formulas.exe autobuy is gang-aware** — `planFormulasPurchase` bypasses the hacking>400 buy
  gate whenever a gang exists (via `gang-state.json` presence, 0 GB), since the mover suspends
  entirely without Formulas and would otherwise sit dark through every post-install hacking
  re-climb.

### Known quirks / bugs (fixed, but worth knowing the shape of)

- **Wanted-sink baseline froze at tick zero (Phase 27, fixed same session).** `evalSink`
  recalibrated its baseline only on a *strictly new minimum* wantedLevel; a fresh gang starts at
  its floor on tick one, so that condition could never fire again once first touched. Fixed to
  "at or below" the lowest seen. Lesson: a "new minimum" baseline is a trap when the metric starts
  at its floor.
- **`GangGenInfo.wantedPenalty` is not simply monotonic in `wantedLevel`** — observed live
  2026-07-19/20: `wantedPenalty` kept drifting upward over ~8.5h while `wantedLevel` sat exactly at
  its floor (1) the entire time. Caused the wanted-sink baseline bug above (fixed — the fix works
  regardless of cause). The drift's underlying cause itself is still unexplained (respect?
  territory? gang size? all looked roughly constant while it happened) — worth understanding
  before Tier 2+ machinery tries to model `wantedPenalty` more precisely, or before assuming any
  other `GangGenInfo` field behaves the way its name suggests.
- **Gang log didn't survive restarts** until fixed 2026-07-21 (`seedGangLog`) — `gangmanager.js`
  used to initialize its event log to `[]` and write in `"w"` mode every restart, silently
  discarding all prior ascend/recruit/equip history.
- **Ascension respect-accounting doesn't fully reconcile.** The two big logged ascensions claim
  ~24.7m respect destroyed (`nite-04` −12.0m, `nite-05` −12.7m) yet the pool never went near that
  low, and a third (`nite-07` −2.66m, 2026-07-21) dropped it to 1.59m then it recovered to 7.9m
  within minutes. The gang-respect ↔ NiteSec-faction-rep coupling and how `respectLost` maps to
  the pool aren't understood. Matters only for the "keep respect ≥ 2.5m aug floor" guardrail under
  aggressive ascension — low priority; revisit if an ascension ever visibly re-locks an aug.

---

## 6. Territory (Tier 4) — status

**Deferred for this node, not permanently.** See §2 for the corrected-reasoning history. The one
fact that governs this axis: Territory Warfare power is a weighted sum of member stat
*magnitudes* — hack weight 15, but 0.15 × our ~90k hack ≈ 13.5k weighted power/member, comparable
to rival gang powers of 3.3k–16.5k. So a pure-hacking gang is plausibly power-viable with **zero**
combat training — the original "structural combat mismatch" objection doesn't hold. What actually
settles it for BN2.1: money saturates the remaining need (~½ day at current income) faster than
territory can be meaningfully built (≥3–6 days + ~$1.5-3t forgone income), so a ~124× multiplier
that unlocks slower than the node clears is moot here.

Measured 2026-07-21 (clashes off, read-only): our power is 1.000 (the floor — never assigned a
member to Territory Warfare), territory 14.3%; The Black Hand holds 85.7% at power 9,442; the
other five rivals sit at power 1,455-2,546 with 0% territory. Win-odds against the whole field are
~0% from a standing start.

**What survives regardless:** `gangreward.js` (money-x/respect-x territory multiplier probe, fixed
2026-07-22) and `gangratelog.js`'s respect-rate series. The warfare-specific instruments
(power/win-odds/rival panel) were dropped — a `phase-30-gang-territory.features.md` deliverable —
since we'll never act on them for this node.

**For any future gang-capable node: re-price from scratch.** The income curve is enormous, a
hacking gang is probably power-viable, and earlier is cheaper since rivals compound. The cheapest
settling measurement: one member on Territory Warfare (clashes off, zero death risk) for ~15 min,
sample `power`, restore. Full record: `phase-30-gang-territory.features.md` (repo root — unshipped,
Stage 2 is conditional on a gate this node never needed to clear).

---

## 7. Open questions & standing tripwires

Gang-specific open items now live here (moved from `BACKLOG.md` 2026-07-22, so they sit next to
the economics/history they depend on). `BACKLOG.md` keeps only non-gang-specific bugs/ideas —
check there for everything else.

- **[SCHEDULE — the gate read is THE next BN2.1 milestone] Confirm the `w0r1d_d43m0n` requirement
  the moment The Red Pill installs.** The 15,000 hacking-level gate is an ~85% inference and it's
  the whole clear-plan's linear scale factor (at 7,500 the catalog alone nearly clears; at 30,000
  the plan is infeasible). Red Pill is free + a Phase 33 must-buy, so it installs on its own — read
  `getServerRequiredHackingLevel("w0r1d_d43m0n")` (and the true M needed) that cycle. Every number
  in §1/§4 is provisional until this lands. **Next action:** watch for the Red Pill install; run
  the read then. (Auto-captured by `gatewatch.js`.)
- **[MEASURE — decides deep-NFG pacing] Does NiteSec faction rep survive an install?**
  Unestablished. NFG rep-req grows (0.7m@L56 → 8.1m@L75 → 26.4m@L84) and the money pivot cut
  respect-gain-rate ~2.4× (539.6 → ~220/tick at the time). If faction rep resets each install, the
  deep ladder (level ~69+) is rep-paced (waits ~0.5–1 day on re-accrual per late install), not
  money-paced — which would favor bigger late NFG batches. **Next action:** one
  `getFactionRep("NiteSec")` read immediately after the next install (compare to pre-install).
- **NFG tail batching policy** (from the 2026-07-21 fable review, numbers in §4). One-NFG-per-install
  over-optimizes money that doesn't matter; variable batches (fat early while levels cost millions,
  taper to 1–3 per install past ~level 65) get ~75 levels for ~$160–250b vs $99b/$2.17t at the
  extremes. **Revisit when** the ratchet actually reaches the NFG tail (M≈16.7, catalog done) —
  check whether `augfarmer.js`'s escalation-aware ordering already approximates this or needs a
  per-install NFG cap. Not actionable until the catalog is bought.
- **Ascension cadence** — does a ×1.5 ascension arrive faster than ~1 per 16 installs? Needed to
  keep the install-degradation tax (§3, resolved question 1) from net-negative-ing hack ascension
  mults over the node. **Next:** count `ascend` events in the gang log against install count over
  the same stretch — no code change needed. Gains urgency from Phase 33's expensive-first buy
  order, which is expected to speed up installs.
- **`wantedPenalty` non-monotonicity** and **ascension respect-accounting** — both open mysteries,
  neither blocking. See §5 for the full detail.

---

## 8. Further reading

- **Phase docs (full narrative, left in place):** `docs/phases/phase-27-gang.*.md` (Tier 1),
  `docs/phases/phase-28-gang-rep-pivot.md` (first reversal), `docs/phases/phase-29-gang-scaling.*.md`
  (Tiers 2-3), `phase-30-gang-territory.features.md` (repo root, unshipped),
  `docs/phases/phase-32-bn2-progress-tracker.*.md` (dashboard GOAL panel),
  `docs/phases/phase-33-money-throughput.*.md` (buy-order fixes).
- **Archived (superseded by this doc, kept for history):** `docs/archive/gang-api.md`,
  `docs/archive/bn2-gang-type-analysis.md`.
- **`docs/bitnodes.md`** — general BitNode reference (all 15 nodes, scraped from in-game
  descriptions/panels). Left untouched, including its own BN2 clearing-notes analysis — §4 of
  this doc was compiled from it plus later corrections, but `bitnodes.md` stays the original
  source, not superseded.
- **`docs/scripts.md`** — full script index, including every gang script listed in §5.
