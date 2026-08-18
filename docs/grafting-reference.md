# Grafting — mechanic reference

**Gated the same way `batcher-engine.md` and `bladeburner-reference.md` are: read this before
writing any `ns.grafting.*` code or planning around grafting.**

Sources, in order of authority: **live measurement in BN10** (`src/graftone.js`,
`src/graftvsbuy.js`, `src/graftrecon.js` — logs cited inline), the **in-game Grafting tab**
(scraped 2026-08-18, and it documents mechanics the API files omit), and
`markdown/bitburner.grafting*.md`.

⚠️ **Supersedes [`docs/grafting.md`](grafting.md)**, which is BN1-era, pre-SF10, and records the
clinic as *not appearing at all*. That file is kept only for its historical observation.

---

## 1. What it is, and the two gates

Grafting applies an augmentation's effect **without an install/reset**. You keep hacking level,
money, fleet, factions and progress. You pay **money**, **focused time**, and **Entropy**.

| | In BN10 | Outside BN10 |
|---|---|---|
| Grafting mechanic | ✅ live from entry | needs **SF10** |
| `ns.grafting.*` API | ✅ | needs **SF10** |

**Where:** the **Grafting** nav tab, physically **VitaLife, New Tokyo**. `graftAugmentation`
**errors outside New Tokyo** — travel first.

In-game framing, verbatim:

> *"The scientist explains that they've been studying augmentation grafting, the process of
> applying augmentations without requiring a body reset… in exchange for both a hefty sum of money,
> and being a lab rat."*

---

## 2. 🔑 The economics — grafting is CHEAPER than buying, and needs NO reputation

**Measured 2026-08-18 across all 97 graftable augs** (`src/graftvsbuy.js`,
`logs/graftvsbuy-1787056031746.json`):

> **`graftPrice / purchasePrice` = 0.600 for every single aug** — min 0.600, median 0.600,
> max 0.600. A **constant ratio**, not a per-aug quirk.

| | Buy + install | Graft |
|---|---|---|
| Money | 1.00× | **0.60×** |
| Reputation | **Required** (BN10: `AugmentationRepCost` **2×**) | **NONE** |
| Reset | **Required** — wipes money, fleet, hacking, faction membership | **No** |
| Application | all at once, in **parallel** | **serial**, one focused graft at a time |
| Entropy | none — an install **clears** it | **+1 per graft, permanent until an install** |
| Price escalation | ×1.9 per aug within a purchase batch | **none observed** |

🔴 **This corrects a claim made repeatedly during Phase 41 planning:** that grafting's effective
cost was *"~15× base"* against a faction aug's *"5×"*, making grafting the expensive route.
**Backwards.** Grafting is **40% cheaper in money** and skips reputation entirely — e.g.
`Synthetic Heart` grafts for **$8.625b with zero rep**, versus **$14.375b plus 1.5m reputation** to
buy. 📌 *The error came from reasoning about multiplier stacks instead of reading two prices.*

**What grafting actually costs is Entropy and serial time — not money, and not reputation.**

---

## 3. Entropy — the real price

In-game text, verbatim (Grafting tab, at Entropy strength 1):

> **Entropy strength: 1** · *"All multipliers decreased by: **2.000% (multiplicative)**"*
>
> *"When installed on an unconscious individual, augmentations are scanned by the body on
> awakening, eliminating hidden malware. However, grafted augmentations do not provide this
> security measure."*

- **Exactly `0.98^k`**, across **every** multiplier — combat, hacking, charisma, company, faction
  rep, crime, hacknet. Confirmed by measurement, not merely by the label (§4).
- **Cleared only by an augmentation install.** Nothing else reduces it.
- It taxes the very stat being grafted for, so a graft ladder must carry `0.98^k` **inside** its
  arithmetic rather than mention it in a footnote.

| k grafts | All multipliers run at | k grafts | All multipliers run at |
|---|---|---|---|
| 1 | 98.0% | 10 | 81.7% |
| 4 | 92.2% | 20 | 66.8% |
| 7 | 86.8% | 35 | 49.3% |

---

## 4. 🔴 `ns.getPlayer().mults` ALREADY INCLUDES the Entropy debuff

**Measured 2026-08-17** (`logs/graftone-1787021054487.json`). `HemoRecirculator` is a raw **×1.08**
per combat stat. Grafted at entropy 0→1, the observed multiplier delta was **×1.0584** — and
`1.08 × 0.98 = 1.0584` exactly.

⚠️ **This is the easiest way to get grafting arithmetic wrong.** Any planner that reads live mults
*and* applies its own `0.98^k` on top **double-counts** — harmlessly at entropy 0 (`0.98^0 = 1`),
then silently and compoundingly on every recalculation after the first graft.
`src/graftplanner.js` shipped with exactly that bug; it now divides the applied factor back out.

📌 **The reason this was caught in ten minutes rather than never: the file's header had written the
assumption down as *"if this is wrong, this file double-counts entropy."*** Recording an assumption
converts it into a cheap check.

---

## 5. Measured behaviour vs the API docs

| Claim | Source | Measured |
|---|---|---|
| Graft time is **not** the finish time — *"affected by current intelligence level and focus bonus"* | `markdown/bitburner.grafting.md` | 🟢 **Held anyway**: projected 1.380 h, realised **1.381 h** (ratio **1.001**) at **Intelligence 93**, focused. Treat `getAugmentationGraftTime` as reliable **when focused**; the warning presumably bites unfocused. |
| Entropy increments per graft | in-game | 🟢 Exactly **+1** |
| Price as quoted | — | 🟢 $135.0m quoted, **$134.1m** paid |
| Price escalates with grafts taken | — | 🟢 **No escalation** observed |

---

## 6. 🔑 Prerequisites work differently than for buying

In-game text, verbatim:

> *"Some augmentations have prerequisites. You normally must **install** the prerequisites before
> being able to buy and install those augmentations. **With grafting, you only need to buy
> ("queue") those prerequisites. You can also graft the prerequisites.**"*

A prerequisite is satisfied by being **queued (purchased, uninstalled)** *or* grafted — it does
**not** need to be installed.

⚠️ **`getGraftableAugmentations()` checks neither money nor prerequisites.** It returns
`Augmented Targeting II` with no `Augmented Targeting I` anywhere. **Filter yourself** via
`singularity.getAugmentationPrereq`. A ladder built without that filter contains steps that cannot
execute, and every downstream cost/time projection is then computed over an impossible set.

---

## 7. API surface

| Method | RAM | Notes |
|---|---|---|
| `getGraftableAugmentations(): string[]` | 5.00 | ⚠️ no money/prereq filtering (§6) |
| `getAugmentationGraftPrice(aug)` | 3.75 | = **0.60 × `singularity.getAugmentationPrice`** (§2) |
| `getAugmentationGraftTime(aug)` | 3.75 | reliable when focused (§5) |
| `graftAugmentation(aug, focus?)` | 7.50 | `focus` defaults **`true`**; **errors outside New Tokyo** |
| `waitForOngoingGrafting()` | **0.00** | ⚠️ **blocks** — see §8 |

---

## 8. Landmines

1. 🔴 **`graftAugmentation` CANCELS current work, and charges money UP FRONT.** Verbatim: *"When you
   call this API, the current work (grafting or other actions) **will be canceled**."* So a second
   call, a `commitCrime`, a `travelToCity` — anything taking the player-action slot — **forfeits a
   paid graft**. The loss is money, not just time.
2. 🔴 **Grafting is the FIFTH player-action-slot claimant** (alongside `bladeburnermanager.js`,
   `augfarmer.js`, `backdoorfactions.js`, `backdoorwd.js`) — and the only one that also blocks the
   **combat grind**. Any standing "quiesce all four" instruction is stale.
3. ⚠️ **`waitForOngoingGrafting()` blocks**, so a script holding `bladeburner-slot-hold.json` cannot
   refresh it (`SLOT_HOLD_MAX_AGE_MS` is **30 s**, and every consumer *fails open* on a stale
   marker). Poll `getCurrentWork()` instead.
4. ⚠️ **Verify with `getCurrentWork()`, never the return value** — the standing rule, with
   `bladeburner.startAction` as precedent (it returned `true` while nothing ran).
5. ⚠️ **Focused grafting hides the nav bar**, so CDP `terminal`/`goto` time out while a graft runs.
   Read state with `body`/`aria`, or unfocus deliberately.

---

## 9. Graft or install? — the decision framework

Grafting wins on **money (0.6×)**, **reputation (none)** and **no reset**. It loses on **serial
time** and **Entropy**. So the crossover is not about price at all.

**Graft when:**
- you need a **small number** of augs — Entropy stays cheap (≤ ~7 keeps everything above 86%);
- you **lack the reputation**, and earning it costs more time than the grafts do;
- a **reset is expensive right now** — mature fleet, high hacking level, money still needed;
- the target is on the **critical path** and an install's rebuild would blow the window.

**Install when:**
- you want **many** augs — Entropy compounds, and an install applies them all in **parallel** with
  **no** tax;
- you **already hold the reputation**;
- you are **resetting anyway**, or hold little that a reset destroys;
- **Entropy needs clearing** — an install is the only thing that clears it.

**Worked example — BN10 entry, 2026-08-17/18.** Combat 91 → 100 against a 0.553 effective
multiplier: **~25 h** of grinding, or **4 grafts / $589m / 4.2 h**. Faction augs were rejected
because the rep grind competes for *the same player-action slot* the gate needs, and the install
would have wiped the money being accumulated to pay for it.

🔑 **Re-planning after each graft mattered more than the original plan.** At combat 96 the remaining
ladder collapsed from 3 grafts to **1** (`Bionic Spine`, $375m, 1.3 h) — saving ~$79m, ~1.5 h, and
**two Entropy points**, i.e. every multiplier stayed 4% higher. **Grafts change the requirement, so
re-derive after each one rather than executing a ladder computed once.**

📌 **Rule of thumb: grafting buys TIME and skips REPUTATION; installing buys BREADTH and clears
ENTROPY.**

---

## 10. Open questions

- **Does the graft-time warning bite when unfocused?** §5 measured only the focused case
  (Intelligence 93, ratio 1.001). Unmeasured otherwise.
- **Does Entropy affect Bladeburner rank gain**, or only the multipliers in `getPlayer().mults`?
  Unmeasured, and it matters for any BN10/BN9 plan that grafts before a Bladeburner grind.
- **Is the 0.60 ratio universal or BN10-specific?** Measured only in BN10, where
  `AugmentationMoneyCost` is 5×. Re-measure in the next node before relying on it.
