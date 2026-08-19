# Sleeves & Grafting — interface reference

**Gated the same way `bladeburner-reference.md` is: read this before designing against
`ns.sleeve.*` or `ns.grafting.*`.** Both mechanics are unlocked by **BN10 (Digital Carbon)**;
this document is the interface, not the strategy.

Sources, in order of authority: the **in-game Sleeves FAQ** (scraped 2026-08-16 — it documents
several mechanics the `markdown/` API files never mention), the `markdown/bitburner.sleeve.*` /
`bitburner.grafting.*` API docs, and live reads of the Sleeves panel in BN10.

Status when written: **BN10 entered 2026-08-16**, 1 sleeve held, SF10 **not yet owned** (so the
API is unavailable *outside* this node, but the mechanic is live *inside* it).

---

## 1. The two gates, and why they differ

| | In BN10 | Outside BN10 |
|---|---|---|
| **Sleeve mechanic** | ✅ live from entry (we start with 1) | needs **SF10** |
| **`ns.sleeve.*` API** | ✅ | needs **SF10** |
| **Buying sleeves / upgrading memory** | ✅ **only here** | ❌ **never** |
| **Grafting** | ✅ | needs **SF10** |

🔴 **Sleeve purchases and memory upgrades are BN10-exclusive.** The in-game guide is explicit:
*"You cannot buy Sleeves or upgrade them outside this BitNode."* Whatever you buy here is what you
carry; SF10 grants **+1 sleeve per level** on top.

---

## 2. Sleeve mechanics — the FAQ, which is the real documentation

⚠️ **The in-game FAQ (Sleeves → FAQ button) documents mechanics that appear NOWHERE in
`markdown/`.** Everything in this section came from it. This is the "game UI is part of the
interface" rule paying out again.

### The core loop
> *"Duplicate Sleeves are essentially clones. You can use them to perform any work type action…
> Having sleeves perform these tasks earns you money, experience, and reputation."*

> *"Sleeves are their own individuals, which means they each have their own experience and stats."*

### 🔑 Experience triples down — the single most important line
> *"When a sleeve earns experience, it earns experience for itself, the player's original
> 'consciousness', **as well as all of the player's other sleeves**."*

**One sleeve working feeds every sleeve plus the host.** With N sleeves the exp graph is
all-to-all, not parallel-independent — which is why sleeves compound rather than merely add.

### Sync — the exp transfer rate
> *"Let N be the sleeve's synchronization. When the sleeve earns experience, both the sleeve and
> the player's original host consciousness earn **N%** of the amount normally earned. All of the
> player's other sleeves earn **((N/100)² × 100)%**."*

- Range **1–100**. Raised by the **`Synchronize`** task.
- 📌 **The cross-sleeve term is QUADRATIC.** At sync 25 (our current value) other sleeves get
  **6.25%**; at sync 50, **25%**; at 100, **100%**. Sync is worth far more with a large stable of
  sleeves than with one, and early sync is nearly worthless cross-sleeve.

### Shock — an exp penalty that decays
> *"…a measure of how much trauma the sleeve has due to being placed in a new body. Between 0 and
> 99… **Shock affects the amount of experience earned**. Shock slowly decreases over time. You can
> further increase the rate by assigning sleeves to the **`Shock Recovery`** task."*

⚠️ **Shock 0 is a hard precondition for buying sleeve augmentations** (see §5).

### Memory — the only thing that survives a node change
> *"Sleeve memory dictates what a sleeve's synchronization will be when it's **reset by switching
> BitNodes**… if a sleeve has a memory of 25, its synchronization will initially be set to 25
> rather than 1. Memory can only be increased by purchasing upgrades from **The Covenant**. It is
> a **persistent stat**, never reset. Maximum **100**."*

🔑 **Memory is the sleeve analogue of a Source-File** — buy it in BN10, keep it forever. It sets
your *starting* sync in every future node, which given the quadratic cross-sleeve term is
compounding value.

### Reset semantics — read carefully, they are asymmetric
> *"Sleeves are **reset when switching BitNodes, but not when installing Augmentations**. However
> installing Augmentations on a sleeve **does** reset their stats."*

| Event | Sleeve stats | Sync | Memory |
|---|---|---|---|
| Augmentation install (normal) | ✅ kept | ✅ kept | ✅ kept |
| Installing an aug **on a sleeve** | 🔴 reset | — | ✅ kept |
| **BitNode switch** | 🔴 reset | 🔴 → **memory value** | ✅ kept |

### Other FAQ facts
- **One sleeve per company/faction.** *"Only one of your sleeves can work for a given
  company/faction at a time"* — different ones are fine, the same one is not. ⚠️ This includes
  **you**: plan rep grinds around it.
- **Bonus time.** *"Sleeves accumulate bonus time when they idle or when you open the game after
  being offline. They use bonus time to reduce the time requirement of their tasks."* Idle sleeves
  are not entirely wasted.
- **Sleeves have their own multiplier set** (Sleeves → *More Stats*): hacking/combat/charisma level
  and exp mults, faction & company rep, salary, crime money/success. All read **100.00%** on a
  fresh BN10 sleeve.

---

## 3. `ns.sleeve.*` — complete API surface

**Every method is 4 GB.** A naive poller over a handful of them is expensive; batch reads.

| Method | Notes |
|---|---|
| `getNumSleeves(): number` | |
| `getSleeve(n): SleevePerson` | extends `Person`; adds **`memory`**, **`shock`**, **`sync`**, **`storedCycles`** (bonus time) |
| `getTask(n): SleeveTask \| null` | union of 9 task shapes — see §4 |
| `setToIdle(n): void` | the only setter returning `void`, not `boolean` |
| `setToCommitCrime(n, crimeType)` | |
| `setToUniversityCourse(n, university, course)` | |
| `setToGymWorkout(n, gymName, stat)` | |
| `setToCompanyWork(n, companyName)` | |
| `setToFactionWork(n, faction, workType)` | |
| `setToShockRecovery(n)` | |
| `setToSynchronize(n)` | |
| `setToBladeburnerAction(n, action, contract?)` | **see §6** |
| `travel(n, city)` | sleeves have their own city |
| `getSleeveCost(): number` | price of the *next* sleeve |
| `purchaseSleeve(): Result` | ⚠️ returns `Result`, not `boolean` |
| `getMemoryUpgradeCost(n, amount)` / `upgradeMemory(n, amount)` | `upgradeMemory` returns `Result` |
| `getSleeveAugmentations(n): string[]` | already-installed |
| `getSleevePurchasableAugs(n): AugmentPair[]` | |
| `getSleeveAugmentationPrice(aug)` / `getSleeveAugmentationRepReq(aug)` | |
| `purchaseSleeveAug(n, augName): boolean` | |

⚠️ **Return-type inconsistency is a trap:** most setters give `boolean`, `setToIdle` gives `void`,
and `purchaseSleeve`/`upgradeMemory` give **`Result`**. Do not write one generic wrapper that
assumes a boolean. And per the standing rule, **verify with `getTask()` — never trust the return
value** (`bladeburner.startAction` is on record returning `true` while nothing ran).

---

## 4. Task types

**`SleeveTask` union (API):** `Bladeburner · Class · Company · Crime · Faction · Infiltrate ·
Recovery · Support · Synchro`.

**Live UI dropdown in fresh BN10 (2026-08-16):**
`Idle · Commit Crime · Take University Course · Workout at Gym · Shock Recovery · Synchronize`

🔑 **The UI list is CONTEXT-DEPENDENT and shorter than the API.** Company work, faction work and
Bladeburner actions are absent because their preconditions aren't met (no company, no faction, not
in a Bladeburner division). ⚠️ **Do not read the dropdown as the catalog** — that is the same
mistake as reading a method list as an interface.

---

## 5. Sleeve augmentations

- 🔴 **Shock must be exactly 0** before any aug can be bought for that sleeve. Confirmed live:
  *Manage Augmentations* is inert at shock 23.4. `sleevemanager.js` surfaces this as `augReady`.
- 🔑 **TIMING CONSEQUENCE, measured 2026-08-19: buy sleeve augs EARLY or not at all.** Because
  installing one **resets the sleeve's stats**, the reset cost grows with every hour the sleeve
  works. A sleeve on bonus time climbed **26 → 43 combat in ~20 minutes**; the same aug bought a
  day later throws away far more. **The cheapest moment to buy is the first moment shock hits 0.**
- ⚠️ **Shock is not monotonic — it can RISE.** Observed 0 at 2026-08-18T13:50Z, **5.384** at
  00:42Z, then back to **0** by 01:03Z while committing crime. Cause unconfirmed (hospitalisation
  is the obvious candidate — HP read 2/12 throughout). §9's open-question list treats shock decay
  as the only direction; that is incomplete.
- **Excluded outright:** *"Bladeburners-specific ones and NeuroFlux Governor are not available for
  sleeves."* ⚠️ **Directly relevant to us** — the Bladeburner aug catalog cannot be bought for
  sleeves, so the ×1.92 stack measured in BN6 does not transfer to them.
- You need **current reputation** with a faction offering the aug.
- Installing an aug on a sleeve **resets that sleeve's stats** (§2).

---

## 6. Sleeves × Bladeburner — the reason BN10 was chosen

`setToBladeburnerAction(n, action, contract?)` accepts **`BladeburnerGeneralActionName`** plus
three sleeve-only specials (`SpecialBladeburnerActionEnumTypeForSleeve`):

| Value | String |
|---|---|
| `TakeOnContracts` | `"Take on contracts"` |
| `InfiltrateSynthoids` | `"Infiltrate Synthoids"` |
| `SupportMainSleeve` | `"Support main sleeve"` |

- 🔴 **Sleeves cannot run Operations or BlackOps** — Contracts and General actions only.
- **`"Support main sleeve"` is undocumented beyond its name.** Unknown mechanic, plausibly a
  direct buff to the host's Bladeburner actions. **Worth measuring before designing around it.**
- The in-game guide says *"Contract/op generation is slow → **Sleeves help**"* and sleeves are
  *"great with Gang/Bladeburner"*.

### 🔴 ANSWERED 2026-08-18 — THEY COMPETE. Do not put a sleeve on contracts.

**Measured** (`src/sleevepoolprobe.js`, `logs/sleevepoolprobe-*.json`, engine paused for clean
attribution): a single sleeve on Tracking drained the **same** `countRemaining` pool at
**0.308/min** and **~0.34/min** across two runs, against a measured **0.499/min** regeneration —
**62–68% of the pool's entire regrowth consumed by one actor.** Sleeve contracts **compete for
supply; they do not add throughput.** `src/sleevemanager.js` therefore never sets a Bladeburner
task, by design.
- ⚠️ **The rank half was never tested.** `rankDelta` reads 0 in the **idle control phase too** —
  the engine was paused, so player rank could not move in either phase — and the probe self-reports
  `INCONCLUSIVE` (`taskHeldSamples: 0` of 36). **The drain is the only real signal.**
- 📌 **A CONTROL THAT CANNOT MOVE IS NOT A CONTROL.** Check the baseline could have shown the
  effect before treating its absence as a result.
- ⚠️ **`getTask` read `null` on all 36 samples while the counter drained** — the instrument cannot
  currently observe a sleeve's Bladeburner task at all. Any re-test needs that fixed first, plus a
  **live** engine.

[SUPERSEDED — the question as it stood]
**Do sleeve contracts ADD rank throughput, or COMPETE for the same supply?** BN6 measured
`Tracking` **supply-capped at ~30 actions/hour** (`countRemaining` pinned at 1.00), and `Tracking`
was **~100% of all rank earned**. If contract regeneration is a **per-city pool** rather than
per-actor, a sleeve on `"Take on contracts"` in the same city adds ≈0.

**Probe (~15 min, read-only on the host):** put one sleeve on `"Take on contracts"` in the **same
city** as the host; compare the host's realised `Tracking` rank/hour against its solo baseline.
Both at full rate ⇒ parallelism works. Host drops while the sleeve gains ⇒ shared pool.
→ `BACKLOG.md`, and `bitnodes.md`'s node-order section for why it matters.

---

## 7. Grafting -- MOVED

🔴 **This section is superseded by [`grafting-reference.md`](grafting-reference.md)**, which is the
authoritative grafting doc (measured economics, the Entropy model, the prereq rule, the landmines,
and the graft-vs-install framework). The stub below is kept only so old links resolve; **do not plan
from it** -- in particular its silence on price was read, wrongly, as grafting being expensive.

### [SUPERSEDED] Original section 7

Applies an augmentation's effect **with no install/reset** — you keep hacking level and progress.
You pay **money** and **focused time**. In stock Bitburner it is a **city location**: VitaLife, in
**New Tokyo**.

| Method | RAM | Notes |
|---|---|---|
| `getGraftableAugmentations(): string[]` | 5 GB | ⚠️ **Does NOT check money or prerequisites** — it returns "Augmented Targeting II" even without the money or "Augmented Targeting I". Filter yourself. |
| `getAugmentationGraftPrice(aug)` | 3.75 GB | |
| `getAugmentationGraftTime(aug)` | 3.75 GB | |
| `graftAugmentation(aug, focus?)` | 7.5 GB | `focus` defaults to **`true`** |
| `waitForOngoingGrafting()` | **0 GB** | |

### The Entropy tax
Every graft raises **`ns.getPlayer().entropy`**, applying a compounding **~2%-per-point debuff to
ALL multipliers** until the next install clears it. Graft ~5 augs and everything runs at ~0.90×.
Installing augs wipes Entropy to 0 and grants bought augs their multipliers **clean**.

### ⚠️ Carried-forward caveat, needs re-checking here
`docs/grafting.md` records that in **BN1 (2026-07-11)** Kenneth traveled to VitaLife/New Tokyo and
**the grafting clinic did not appear** — unlock condition unconfirmed in this fork. That
observation is from a different node under different conditions; **grafting should be available in
BN10, but verify before planning around it.** `docs/grafting.md` is otherwise BN1-era and
superseded by this file.

---

## 8. Driving the Sleeves UI over CDP — gotchas hit while writing this

- 🔴 **MUI ignores DOM-dispatched clicks.** `element.click()` via `page.evaluate` returns cleanly
  and does nothing. Use a **real mouse click at the element's coordinates**.
- 🔴 **Modals leave a stale backdrop that silently swallows every later click**, and `Escape`
  does **not** clear it. A **click at a far corner (50,50)** does. Symptom: every subsequent
  `getByRole(...).click()` times out with "locator resolved to …" — the element is found, the click
  never lands. Check `document.querySelectorAll('.MuiBackdrop-root').length` before assuming the
  page is broken.
- The **FAQ** opens a `[role="dialog"]`; **More Stats** and **Earnings** are *inline expanders*, not
  dialogs — reading `[role="dialog"]` for those returns nothing.
- `cli.mjs dismiss` reports "no modal/popup found" for the stale backdrop — it is not a story popup
  and has no named Close button.

---

## 9. Open questions

- ❓ **Do sleeve contracts add or compete for Bladeburner contract supply?** (§6) — **the one that
  matters most**; blocks nothing but validates the node order.
- ❓ **What does `"Support main sleeve"` actually do?** Name-only in the API.
- ❓ **What does `"Infiltrate Synthoids"` yield** — rank, chaos reduction, population intel?
- ❓ **Sleeve cost curve.** `getSleeveCost()` is the next price; the escalation law is undocumented.
  The in-game guide says up to **5** are purchasable from **The Covenant**, the last at **100q**.
- ❓ **Memory upgrade cost curve**, and whether memory is worth buying before or after sleeves.
- ❓ **Is grafting actually available in this fork's BN10?** (§7)
- ❓ **Shock decay rate**, idle vs the `Shock Recovery` task — gates when sleeve augs become buyable.
