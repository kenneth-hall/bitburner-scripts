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

## Key API / formula references (all in `markdown/`)

- `ns.formulas.reputation.calculateFavorToRep(favor)` / `calculateRepToFavor(rep)`
- `ns.formulas.reputation.repFromDonation(amount, player)` / `donationForRep(rep, player)`
- `ns.formulas.reputation.sharePower(threads, cpuCores)`
- Owned-side mults baseline: `run auginfo.js` (`mults.faction_rep`, `mults.hacking`, …).
