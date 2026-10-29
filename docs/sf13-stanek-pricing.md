# SF13 / Stanek's Gift: pricing the reward (2026-10-28)

> ⚠️ **Read with two caveats (added on review, 2026-10-28).** (1) Grid size, fragment power and the charge
> formula are **inferred from general game knowledge, not `markdown/`**. Treat every speed-up figure as a
> guess, possibly off by 2×. (2) The "zero augs costs ~nothing on our route" premise came from
> **inherited state**: `ratchet-mode = observe` was a BN6 decision that carried forward. It was
> checked the same day for BN7 (see `bitnodes.md` → "Aug policy on the Bladeburner route"), but that
> answer was about a ~1-day remaining grind. For a ~22-day node it is **still open**. Re-price it at BN13 entry.

Read-only analysis. No repo files edited, no game state changed. Live read used: `node tools/bb/cli.mjs stats`.

## Recommendation (lead)

**Swap BN13 ahead of BN14: order after BN7 becomes BN13 → BN14 → BN8 → BN15 → BN12.** Take SF13.1 only.
Do not repeat BN13 for SF13.2/.3.

- **Use the Gift in:** BN13 (home node, power 2.0), BN14 (power 0.5, grid 5x5 with SF13.1), BN15 (power 0.7,
  grid 5x4), BN12 (power/size 1.02 at L1, hacking route, as a background ratchet).
- **Skip it in:** BN8 (size modifier −99, and Bladeburner is disabled there anyway).
- **Why the swap is close to free:** BN13 and BN14 are both must-clear, and neither one's reward (SF14 =
  IPvGO, which we don't use) speeds up the other. So their order only matters through cross-benefits. SF13
  gives BN14/15/12 a Gift. SF14 gives BN13 nothing. If the Gift turns out worthless, the swap costs ~0 days.
  If it works, BN14 gains an inferred ~0.5–2.5 days and BN15 gains the same either way.

**The finding that changes the question:** the "zero augs for the whole node" price is close to zero *for our
route*. The Bladeburner-route nodes already run on essentially no augs:
- `src/ratchet-mode.txt` = `observe`, so there are no auto installs.
- `logs/ratchet-log.json` install #46 (the BN11→BN7 boundary) shows `augsInstalled: 0` post-entry, and mults
  sit at the SF1.3 floor (hacking 1.3824, faction_rep 1.28).
- `docs/bladeburner-reference.md` §aug-shop: the Bladeburner aug tier is inert (contracts run at 100% success),
  and Phase 39's S4a decision was "no aug chase".

So the trade is not "Gift vs our aug stack". It is "Gift vs nothing", minus the execution cost of keeping
`augfarmer` from buying anything.

## 1. API surface (markdown/, read in full)

- `ns.stanek`: `acceptGift` (2 GB), `activeFragments` (5 GB), `canPlaceFragment`, `chargeFragment` (0.4 GB,
  async, "lasts until the charge action is over"), `clearGift`, `fragmentDefinitions` (0 GB), `getFragment`,
  `giftWidth`/`giftHeight` (0.4 GB), `placeFragment`, `removeFragment`.
- **Acceptance rule (verbatim):** "The church only accepts those who have not purchased or installed any
  augmentations. 'NeuroFlux Governor' augmentation is the only exception." ⚠️ **Purchased counts, not just
  installed.** `augfarmer` bought an aug within hours of BN11 entry (`docs/bitnode-history.md` ~L86). One
  queued aug forfeits the Gift for the whole node.
- `Fragment` = {id, shape: boolean[][], type, power, limit, effect}. `ActiveFragment` adds `highestCharge`,
  `numCharge`, `chargedEffect` (a raw multiplier, inverted for cost-reducing types; boosters read 1 and only
  boost neighbours).
- **FragmentEnumType:** HackingSpeed, HackingMoney, HackingGrow, Hacking, **Strength, Defense, Dexterity,
  Agility**, Charisma, HacknetMoney, HacknetCost, Rep, WorkMoney, Crime, **Bladeburner**, **Booster**.
- `BitNodeMultipliers.StaneksGiftExtraSize` / `StaneksGiftPowerMultiplier`: "influences size/power". No
  formula is given.
- ⚠️ **NOT in markdown/:** the charge→effect formula, per-fragment `power` values, the base grid size and how
  SF13 level feeds it, and the charge duration. All of those are below as **inferences from general game
  knowledge, unverified in this build.** The first thing to do in BN13 is a read-only probe
  (`fragmentDefinitions()`, `giftWidth/Height()`, then `activeFragments()[i].chargedEffect` after a test
  charge) to replace them.

## 2. Per-node Gift multipliers (MEASURED, `logs/bitnodemults-1789920276346.json` matrix; no node varies by SF level except BN12)

| Node | Gift power | Size mod | Use? | Other relevant (same log) |
|---|---|---|---|---|
| BN7 (now) | 0.9 | −1 | n/a (SF13=0) | rank 0.6, skill 2 |
| **BN13** | **2.0** | **+1** | yes | rank 0.45, skill 2, combat 0.7, hack 0.25 |
| BN14 | 0.5 | −1 | yes, weak | rank 0.6, skill 2, combat 0.5 |
| BN8 | 1.0 | **−99** | **no** | Bladeburner rank 0 (disabled) |
| BN15 | 0.7 | −2 | yes | rank 0.2, skill 3, combat 0.7 |
| BN12 (L1) | 1.02 | +1.02 | background | ramps with level |

## 3. Grid size (INFERRED formula)

Inferred: `base = 9 + StaneksGiftExtraSize + SF13level`, `width = max(2, floor(base/2 + 1))`,
`height = max(3, floor(base/2 + 0.6))`, capped at 25.

| Node | SF13.0 (in BN13) | SF13.1 | SF13.3 |
|---|---|---|---|
| BN13 | 10 → **6x5 = 30** | (n/a, the node grants it) | — |
| BN14 | — | 9 → **5x5 = 25** | 11 → 6x6 = 36 |
| BN15 | — | 8 → **5x4 = 20** | 10 → 6x5 = 30 |
| BN8 | — | ≤ 2x3 = 6, useless | useless |

Fragments are 4–5 cells (inferred), so 25–30 cells hold roughly the four combat fragments plus Bladeburner
plus 0–2 boosters. 20 cells drops one or two of those.

## 4. Fragment value (INFERRED, range given)

Inferred effect: `1 + ln(T+1)/60 × ((N+1)/5)^0.07 × fragPower × boost × GiftPower`. Here T = threads on the
charge script (~2 GB/thread) and N = accumulated charge count. Inferred power: combat-stat fragments ~2,
Bladeburner ~0.4, booster ×1.1 per adjacent booster.

Assume T = 1k–10k threads (2–20 TB of fleet RAM, which hacking can't use in these nodes anyway), so
ln(T+1)/60 = 0.115–0.153. Assume N after ~a week of continuous charging, so the N-factor is ~1.6–2.0.

| Node (power) | Combat-stat fragment (each of str/def/dex/agi) | Bladeburner fragment (success/stamina) |
|---|---|---|
| BN13 (2.0) | **×1.7 – ×2.5** | ×1.15 – ×1.25 |
| BN15 (0.7) | ×1.25 – ×1.45 | ×1.05 – ×1.09 |
| BN14 (0.5) | ×1.18 – ×1.33 | ×1.04 – ×1.06 |

**What our "usual aug stack" gives a Bladeburner run (MEASURED-ish):** ~×1.0 beyond SF1.3. The 12 augs queued
in BN11 never installed (install #46 post: `augsInstalled 0`), and the Bladeburner success augs (~×1.49 total)
multiply a stat already capped at 100% on contracts. Live combat stats in BN7 right now are str/def 349 and
dex/agi 353 (`cli.mjs stats`), all from exp at mult ~1.

**Translating to clear time (INFERRED, the weakest link):**
- **Combat stats** feed black-op and operation success. "Black Ops success significantly affected by combat
  stats" (reference L341). Reaper is the same lever (+2% effective combat per level). Reaper is at 44 (≈ ×1.88)
  and its next level costs 189 SP in BN7 (`logs/bbskillbuy-1793229592352.json`). A ×1.7–2.5 combat fragment
  layered on that is worth roughly 35–90 extra Reaper levels, ≈ **10k–35k SP**. That is ~5–20% of a 2× ladder's
  ~183k SP (`bitnodes.md` L736), which is the known binding risk for BN13/14/15. In BN14 (×1.2–1.3) it is
  ≈ 4k–8k SP, ~2–4%.
- **Success → rate is real and measured in BN7:** the success multiplier went ×3.5 → ×20.8 and the rank rate
  went ×1.8 in 2 h (runbook, 2026-10-28). So ops success binds mid-grind. Combat fragments push the same dial
  from a different input.
- **Bladeburner fragment:** if it lifts `stamina_gain`, it multiplies the stamina-bound rank rate directly
  (reference: throughput = regen × 3600 / cost). That would be +4–25% on rate, but only while the rate is
  stamina-bound. Post-Overclock it may be time-bound instead (unmeasured).
- **Combat-100 gate:** BN13's 0.7 combat mult (gate ~2–5 h) is mostly cancelled. That's worth hours, not days.
- **Net inferred speed-up:** BN13 ~10–25% of ~22 d (16–32 d range) → **~2–6 days**. BN14 ~3–10% of ~17 d →
  **~0.5–2.5 d**. BN15 ~5–15% of ~50 d → **~2.5–7 d** (reached under either order).

## 5. Costs of running a Gift node

1. **No aug purchases, NFG excepted.** This is near-zero for our route, as shown above. The one real loss is
   The Blade's Simulacrum (structural, $150b base), which is unreachable anyway because SF7.3 is not held.
   A BN7 clear gives SF7.1.
2. **Charge RAM.** The charging fleet competes with the batcher. Hacking is closed in BN13
   (HackingLevelMultiplier 0.25, HackExpGain 0.10), BN14 (0.4) and BN15, so the opportunity cost is small
   money income.
3. **The player-action slot:** inferred that `chargeFragment` is a script action, not player work. Verify.
4. **Build cost:** a placement/charge script (`stanekmanager.js`) plus a pre-entry kill-switch for
   `augfarmer`. This is new tooling, so it gets a phase doc. Inferred ≤1 session.
5. **Ordering trap (still binding):** with SF7.3, `joinBladeburnerDivision()` locks out the Gift. BN7 gives
   SF7.1 only, so this doesn't bite unless BN7 is repeated twice more. Keep the rule as written: accept the
   Gift before joining.

## 6. SF13.2 / SF13.3: not worth it

Each extra level is another BN13 clear (~22 d central, likely top of range per the SkillCost risk) for
+1 base size, i.e. roughly one more fragment cell row every 2 levels. That buys maybe +1 fragment in
BN14/BN15, a single-digit-% speed-up on ~67 days of remaining grind. That's ~1–4 days saved for ~22–44 days
spent. **Skip.**

## 7. Strongest objection to this pick, and what being wrong costs

**Objection:** every fragment number above comes from a formula, power values and grid constants that are
**not in markdown/** (inferred from general game knowledge). And success may already be saturating: early ops
read pMax 1 and BI/DO is at ×33.7, so combat fragments could add far less than the SP-equivalence suggests.
If the true effect is closer to the low end, BN14's gain is ~0.5 d and the Gift's main value is just inside
BN13, which it gets regardless of order.

**Cost if wrong:**
- If the Gift is near-useless in BN14, the swap costs ~0 days, since order between two independent must-clear
  nodes is time-neutral. The only real cost is the ~1 session building `stanekmanager.js`, which BN13 needs
  anyway.
- The asymmetric risk is **execution, not ordering**. If `augfarmer` (a resident `daemon.js` relaunches) buys
  one aug before `acceptGift()`, the node's Gift is gone for good. The defence is a kill-switch file set
  **before** `destroybn.js 13 confirm` fires in BN7, verified on BN13 entry before anything else runs.

**Open decision default + date:** default = swap (BN13 next after BN7). It expires at BN7's destroy. If
nobody revisits it by then, `destroybn.js` takes `nextBN` = 13.

## 8. Biggest unknowns (measure on BN13 entry, read-only)

1. The real `fragmentDefinitions()` powers/shapes, `giftWidth/Height()` at SF13.0, and `chargedEffect` vs T,N.
   These replace sections 3–4.
2. What the Bladeburner fragment multiplies (stamina_gain? success?), and whether the post-Overclock rate is
   stamina-bound or time-bound.
3. Whether combat-stat gains still move black-op success at ×30+ skill success. The A/B is one fragment
   charged vs not, read with `ladderstatus.js` `[pMin, pMax]`.
4. Whether `chargeFragment` occupies the player-action slot (it would be a sixth claimant).
5. BN13's guide-noted "−10% many mults" (bitnodes.md L186) is not visible in the multipliers log. Check
   `auginfo.js` at entry.
