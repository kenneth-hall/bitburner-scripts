# NeuroFlux Governor — mechanics reference

NFG is the aug-ratchet's main engine: it's repeatable, so a spend-down converts an arbitrary
money pile into hacking multiplier, while discrete augs run out. Install #9 (2026-07-18) bought
**16 NFG levels vs 6 discrete augs** — the tail is most of a cycle's gain.

Everything here is **measured in this build**, not read from upstream docs. Where a number came
from one observation, it says so.

## The two ladders

Both of NFG's requirements escalate per level, at **different rates**:

| | per level | measured | notes |
|---|---|---|---|
| **Price** (what you pay) | **×2.166** | install #8, 11-level run, dead-constant paid ratio | `NFG_PRICE_LADDER` in `src/augfarmer.js` |
| **Rep requirement** | **×1.14** | install #9: 122,736 → 998,737 over exactly 16 levels (8.137 = 1.14¹⁶) | `NFG_REP_LADDER` |

The catalog's *base* price also moves ~×1.14/level (observed ≈×4.23 ≈ 1.14¹¹ across install #6);
the ×2.166 figure is the **paid** escalation within a single spend-down, which is what a buy loop
needs. Don't mix them up: the 2.166 is the one that predicts affordability.

### The 2.166 decomposes — and the other half applies to EVERY aug

```
2.166  =  1.14  ×  1.9
           │        └── this build's per-purchase AUG COST MULTIPLIER
           └────────── NFG's own per-level base-price scaling
```

**Every augmentation bought in a cycle multiplies the price of every subsequent aug that cycle by
~1.9**, NFG or not; the multiplier resets on install. So our empirically-measured NFG ladder was
never an NFG-specific fact — it's NFG's level scaling riding on a global purchase tax.

This is the number that prices *any* "should we buy this?" question:

| buys | subsequent-price inflation | cost at the NFG tail |
|---|---|---|
| 1 | 1.9× | ≈ 0.8 NFG levels |
| 4 | ≈ 13× | ≈ 3.3 NFG levels |
| 18 | ≈ 110,000× | cycle destroyed |

Two consequences worth stating outright:

- **A cheap aug is not a cheap purchase.** A $4m junk aug and a $25b real aug impose the *same*
  1.9× tax on everything after them. Price is therefore the only thing that distinguishes them —
  which is why "buy the cheapest one" is the right rule when you need an aug for its *count*
  rather than its stats (→ Phase 26, gap 9).
- **Buy order matters.** Inflation hits everything *after* a purchase, so any low-value buy
  should come last in a cycle, after the augs whose price you care about.

**Both ladders bound the tail, and either can bind first.** Price escalates far faster, so money
was the binding constraint for installs #6-#9. That's changing — see below.

## Rep resets; the requirement does not

This is the mechanic with strategic consequences, and it was **misrecorded until 2026-07-18**.

Installing augs [resets faction rep to zero](reset-protocol.md) and drops you from every faction.
NFG's rep requirement does **not** reset — it reflects your cumulative NFG level, which survives.
So every cycle must **re-earn, from zero, a requirement that only ever grows**:

```
NFG repReq observed:   10,181  →  122,736  →  998,737
                    (install #6)  (pre-#9)     (post-#9)
```

At ~1m rep and climbing ×1.14 per level bought, the tail becomes **rep-bound rather than
money-bound**, and then shrinks: each cycle buys fewer levels than the last unless rep income
grows at least as fast as 1.14^(levels bought). It doesn't — rep income is roughly linear in a
cycle's length while the requirement compounds.

**Implication for the ratchet:** per-cycle gain will decay toward the discrete augs alone. The
counters are (a) [donation](reputation-favor.md) — money → rep directly, which is the only lever
that scales with our actual surplus, and (b) higher `faction_rep` multipliers from installs. Both
are already in the engine; what's missing is treating NFG rep as a *planned* expense rather than a
byproduct of whatever grind the cycle happened to do.

### A correction worth remembering

`phase-25-faction-strategy.closeout.md` carried "**NFG's rep requirement does not climb with
level**" as a *checked* fact — the catalog read 10,181 both before and after install #6. That
reading was almost certainly a catalog that hadn't rebuilt yet. The check was real; the freshness
of the data wasn't. **A before/after comparison across an install is only as good as the rebuild
between them** — verify the catalog's own timestamp moved, not just its values.

## Two counting quirks

- **`getOwnedAugmentations(true)` duplicates *queued* NFG levels** (queue of 8 read as 14) but
  **collapses installed ones to a single entry**. So a "distinct owned augs" count is stable
  across NFG purchases, and `nfg.level` in `augfarmer-state.json` reads **1 forever** (cosmetic).
- **Unverified and load-bearing:** whether Daedalus's 30-aug gate counts NFG levels individually
  or as one. We currently assume distinct-augs (`daedalusGate.installed`). If the game counts
  levels, we undercount and over-grind. The 2026-07-15 clear reaching Daedalus at 33 distinct is
  consistent with both readings. → close-out doc, "Open gaps" (3).

## Buying rules the engine relies on

- **The rep requirement is the same whoever sells it** (14 sellers). So the right seller is the
  joined faction with the **most rep** — `pickNfgSeller`. Picking by catalog order shipped as a
  bug (gap 6) and worked only by luck.
- **Rep doesn't grow during a spend-down** (seconds long, no faction work in flight), so the
  level count rep allows can be bounded once, up front: `nfgLevelsByRep`.
- **An exponential ladder always strands up to one level's price.** Spend-down stopping with money
  left is correct behavior, not a leak — do not "fix" it.

## Where this lives in code

`src/augfarmer.js`: `NFG_PRICE_LADDER`, `NFG_REP_LADDER`, `nfgLevelsByRep`, `pickNfgSeller`,
`spendDownPlan` (buy loop, bounded by both ladders), `evalTrigger` (the projection feeding
`totalGain` / `MIN_TOTAL_GAIN`). NFG's price and repReq are re-read live every pass rather than
trusted from the catalog, precisely because both move independently of catalog rebuilds.
