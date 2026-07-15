# Faction reputation, favor & donation

Reference for earning faction reputation and converting money → rep. This is the **active BN1
lever** (Daedalus 2.5m rep → The Red Pill). All measured values are from Kenneth's save on
2026-07-11 (hacking ~2,600, `faction_rep` mult 1.697, Daedalus favor 0). Formulas are exposed by
`ns.formulas.reputation.*` — **Formulas.exe is on home**, so numbers here are authoritative, not
estimated (probe: `src/favorprobe.js`).

## Two ways to earn rep (no Singularity → both are manual UI)

Kenneth has no Source-Files, so `ns.singularity.workForFaction` / `donateToFaction` **cannot be
scripted** — both paths are driven by hand in the game UI.

### 1. Faction work

Click the faction → a work type. **Hacking Contracts** scales with **hacking level** (not
charisma), so it's the right choice for a hacking build; the rate rises with hacking level,
`faction_rep` mult, and the faction favor mult (`1 + favor/100`).

- Measured Daedalus Hacking Contracts, focused, hacking ~2,600, favor 0: **22.827 rep/sec**.
- At that rate 2.5m rep ≈ **30 h** of active focused work.
- Grind rep **while hacking is high** — post-install (hacking reset) the rate collapses.

### 2. `ns.share()` — multiplies faction-work rep

`ns.share()` boosts the rep gain rate of **all** faction work. The daemon already runs a share
pool (Phase 8, `SHARE_FRACTION = 0.25`), toggled off by a `share-off.txt` marker on home.

- **The boost only applies while actively doing faction work.** Idle share threads read
  `sharePower 1.00`; the instant faction work starts it jumps. (This resolved the old
  2026-07-06 "sharePower stuck at 1.00" question.)
- Measured 2026-07-11: turning share on mid-grind → 1.66M threads, `sharePower 1.573`, rep/sec
  **22.827 → 35.924** (exactly ×1.573). 2.5m rep ≈ **19 h**.
- Share power is **logarithmic in threads** — the 25% carve already captures most of it; going to
  100% of a huge idle fleet adds only a few percent. Don't raise `SHARE_FRACTION` for a grind
  without measuring.

## Favor & the donation shortcut (the big one)

**Favor** is a per-faction stat earned **when you install augmentations**, based on the rep you
accumulated with that faction. At **150 favor**, donating money for rep unlocks. Measured:

| Quantity | Value | Source |
|---|---|---|
| Rep to reach 150 favor (donation unlock) | **462,500** | `calculateFavorToRep(150)` |
| Favor granted by installing at 462.5k rep | 150 | `calculateRepToFavor` |
| Favor granted by installing at 2.5m rep | 233 | `calculateRepToFavor(2.5e6)` |
| $ to buy the full 2.5m rep once unlocked | **$1.47t** | `donationForRep(2.5e6, player)` |
| Rep that Kenneth's whole $481t would buy | 817M | `repFromDonation(4.8e14, player)` |

**Implication — don't hand-grind the full 2.5m.** 150 favor needs only ~1/5 the rep of the Red
Pill, and once unlocked the donation is trivial ($1.5t of a $481t pile). Recommended sequence:

1. Grind ~500k Daedalus rep **now** while hacking is high (~3.5 h at the share-boosted rate).
2. Fold it into the planned **multiplier install** — banks 150 Daedalus favor as a side effect.
3. **Re-climb hacking to 2500 and rejoin Daedalus** — the install drops you out of the faction
   (membership resets, only favor persists), so you can't donate until you re-earn the invite. This is
   a ~6–9 h re-climb, *not* an instant step. See [reset-protocol.md](reset-protocol.md).
4. Once rejoined, **donate ~$1.5t → instant 2.5m rep** → buy The Red Pill.

**Sequencing catch (corrected):** The Red Pill needs its **own** install (to spawn `w0r1d_d43m0n`).
An earlier draft claimed keeping the two installs back-to-back costs only **one** hacking re-climb —
that's **wrong**, because the mult install drops you out of Daedalus and donating requires membership,
so you must re-climb to **2500 to rejoin before you can donate at all**. The unavoidable shape is: mult
install → re-climb 2500 → rejoin → donate → buy Red Pill + ENM augs → Red-Pill install → re-climb 3000
→ backdoor. **Two** re-climbs, not one. (This means grinding the full 2.5m rep pre-install to skip the
donation buys you nothing on re-climbs either — you'd still re-climb to 2500 after the mult install to
rejoin. The donation shortcut still wins because it saves the *rep grind*, not a re-climb.) See
[reset-protocol.md](reset-protocol.md).

## Donation lock-down (computed 2026-07-11, `favorprobe.js` via Formulas.exe; favor question settled 2026-07-14)

Formulas.exe makes the money↔rep curve **authoritative**, and the favor question is now settled
from the game source (upstream `bitburner-src` dev branch, `src/Faction/formulas/donation.ts`,
read 2026-07-14 with Kenneth's authorization): **favor does NOT multiply donation rep.** `donate()`
credits exactly `repFromDonation(amt) = amt / DonateMoneyToRepDivisor × faction_rep mult ×
BitNode FactionWorkRepGain` — no favor term; favor's only donation role is the ≥150 access gate
(`favorNeededToDonate`), and the `1 + favor/100` multiplier applies to *work* rep only. An earlier
draft of this section assumed a ×2.60 favor discount — wrong; the baseline column is the real
cost. (Our fork could in principle diverge from upstream here — sanity-check the first live
donation's credited rep against `repFromDonation`, but expect baseline.) At `faction_rep`
mult 1.697:

| Rep target | $ cost (favor-independent) | Clears |
|---|---|---|
| 2.5m | $1.47t | Red Pill + all 3 ENM augs (≤1.75m) |
| 5m | $2.95t | + headroom |
| **20m** | **$11.8t** | **removes rep as an NFG constraint entirely** |
| 50m | $29.5t | overkill |

**Recommendation — over-donate to ~20m rep (~$11.8t; trivial vs. the ~$35t pile).** Rep is
*cheap* relative to money here, so brute-force it: at 20m
rep the NFG **rep** requirement stops binding at any level you'd reach, collapsing NFG to a pure **money
cap** (the constraint we understand). This dissolves the NFG-rep unknown without needing SF4.

**What this does NOT lock (still live-only, no SF4 — read at the Daedalus shop / post-install):**
- **NFG price per level** → how many levels the leftover money buys (the money cap). Read the buy-UI price.
- **NFG + ENM mult effect per level** → the resulting `mults.hacking`, which decides whether the 3000
  re-climb is one cycle or needs a second NFG pass. Only reads via `auginfo.js` *after* install #2 — this
  is the designed step-6 checkpoint (≥7 good / ~6 ok / <5.5 = another NFG cycle), not a closeable gap.

## Authoritative in-game formulas (transcribed from the favor/rep ⓘ tooltips, 2026-07-14)

The game's own closed forms, from the info tooltips on the faction Augmentations page —
authoritative, not derived. Both verified against this doc's numbers.

**Rep → favor** — the favor you'll have *after* an install, where `r` = total reputation
earned with this faction **across all resets** (not current rep):

```
favor = log_1.02(1 + r / 25000)
```

Verified: favor 150 ⇒ `r = 25000·(1.02^150 − 1) = 462,500`, matching `calculateFavorToRep(150)`
above. Favor is **logarithmic in lifetime rep** — early rep buys favor cheaply, later rep
barely moves it (why the "grind ~465k, then donate" split exists).

**Favor → rep-gain rate** — tooltip verbatim: *"Faction favor increases the rate at which you
earn reputation for this faction by 1% per favor. Faction favor is gained whenever you install
an Augmentation. The amount of favor you gain depends on the total amount of reputation you
earned with this faction across all resets."* Applied as a flat multiplier on **every** rep
gain for that faction:

```
Δr_effective = Δr × (100 + favor) / 100
```

i.e. the `1 + favor/100` mult referenced elsewhere in this doc. Because it scales *all* rep gain
for the faction, higher-favor factions accrue rep faster from the same source — including the
passive rep stream (measured 2026-07-14: joined factions gain rep with no active work and share
off; favor multiplies it but is not its source — a favor-0 faction still reads ×1.0, not ×0).

## Key API / formula references (all in `markdown/`)

- `ns.formulas.reputation.calculateFavorToRep(favor)` / `calculateRepToFavor(rep)`
- `ns.formulas.reputation.repFromDonation(amount, player)` / `donationForRep(rep, player)`
- `ns.formulas.reputation.sharePower(threads, cpuCores)`
- Owned-side mults baseline: `run auginfo.js` (`mults.faction_rep`, `mults.hacking`, …).
