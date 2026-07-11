# BN1 install plan — faction join order, hacking-aug buy-list, install cadence

The per-cycle decision sheet for the manual half of a BN1 clear: **which factions to join, which
augs to buy, in what order, and when to install.** Built from
[`aug-catalog-known-factions.json`](./aug-catalog-known-factions.json); pairs with the ordered
endgame in [`reset-protocol.md`](./reset-protocol.md) (this doc is the aug/faction detail that
checklist points at). **Not** an optimizer and **not** about servers/home-RAM (servers are
automated by `cloudmanager.js`; home RAM is the one-line "buy when rich, it persists" rule in
reset-protocol). Glance at it once per install cycle.

## Objective and the only two KPIs

Everything here serves one number: **hacking skill → 2500 (join Daedalus) → 3000 (backdoor
`w0r1d_d43m0n`).** On the exp curve `level = mult × (32·ln exp − 200)`, the lever is the
**multiplier**, so the KPIs are the two hacking mults augs move:

- **`hacking`** = level-mult (directly multiplies skill). **Primary.**
- **`hacking_exp`** = exp-gain-mult (climb *rate*). Secondary but compounding.

**Ignore** every combat / charisma / hacknet / crime aug (they don't touch these two) and every
`hacking_money`/`_chance`/`_grow`/`_speed`-only aug (batcher is already over-funded; money is
non-binding). Those are noise for this goal — the buy-list below is *only* level/exp movers.

## The one irreversible decision: city factions

Backdoor factions (below) are free of exclusivity — join them all. The trap is **city factions**:

- **Commit to the eastern trio — Chongqing, New Tokyo, Ishima.** They are mutually compatible
  (join all three) and carry the one cheap high-value exp aug we need (**Neuregen**, Chongqing).
  This is the proven clear-#1 path (we were members of Chongqing + New Tokyo).
- ⚠️ **Do NOT accept a Sector-12 / Aevum / Volhaven invite.** Those are enemies of the eastern trio
  — accepting one **permanently locks out Chongqing** (and Neuregen) for the whole node. This is the
  single choice that wastes a cycle if fumbled; everything else is recoverable.
- Joining the trio is money+travel gated (travel to the city, meet its cash threshold), not a rep
  grind. Cheap; do it once you can afford the hop. Their marginal value is **Neuregen + counting
  toward the 30-aug gate**, not the mult bulk — the backdoor factions carry that.

## Faction unlock order (backdoor gates)

Hacking rises *fast* through low levels (early levels are cheap on the log curve — you were 48→104
in minutes), so you'll blow past all four gates well before the 2500 wall. Unlock them by rooting +
backdooring the server (see reset-protocol's table); the invite then appears.

| Faction | Server | Hack gate | Why it matters here |
|---|---|---|---|
| CyberSec | `CSEC` | 55 | entry augs; cheap early mult |
| NiteSec | `avmnite-02h` | 210 | **densest cheap hacking-aug shop** (CRTX42-AA, Neural-Retention, ENM) |
| The Black Hand | `I.I.I.I` | 351 | The Black Hand aug, Myelin, shares ENM/CSP |
| BitRunners | `run4theh111z` | 542 | **the deep hacking augs** (CSP-V, Neural Accelerator, Neurolink, ENM chain) |
| Daedalus | `The-Cave` | 925 + gates | endgame only — needs 30 augs / $100b / **hacking 2500** on top of the backdoor |

## The buy-list (level/exp movers only), by rep tier

Rep is a **threshold, not a currency** — to buy N augs from a faction you only need rep ≥ the most
expensive one you want. So grinding one faction to a tier unlocks everything cheaper it sells for
free. Prereq chains are noted; you must *own* (installed or queued) the prereq to buy the child.

### Tier 1 — cheap, grab every cycle (rep ≤ 50k)
The backbone. All reachable at modest rep, big combined mult.

| Aug | `hacking` | `hacking_exp` | Rep | Faction(s) | Note |
|---|---|---|---|---|---|
| Neurotrainer I | — | 1.10 | 1.0k | CyberSec | trivial |
| BitWire | 1.05 | — | 3.75k | CyberSec, NiteSec | |
| Artificial Synaptic Potentiation | — | 1.05 | 6.25k | NiteSec, Black Hand | |
| Cranial Signal Processors G1 | 1.05 | — | 10k | CyberSec, NiteSec | **CSP chain root** |
| Neurotrainer II | — | 1.15 | 10k | NiteSec, BitRunners | |
| **Embedded Netburner Module (ENM)** | 1.08 | — | 15k | NiteSec, Black Hand, BitRunners | **buy early — gates the whole ENM/Daedalus chain** |
| Cranial Signal Processors G2 | 1.07 | — | 18.75k | CyberSec, NiteSec | needs CSP-G1 |
| Neural-Retention Enhancement | — | 1.25 | 20k | NiteSec | big exp, cheap |
| **Neuregen Gene Modification** | — | **1.40** | 37.5k | **Chongqing** | biggest cheap exp; the reason for the eastern trio |
| **CRTX42-AA** | 1.08 | 1.15 | 45k | NiteSec | best combined level+exp for the rep |
| Cranial Signal Processors G3 | 1.09 | — | 50k | NiteSec, Black Hand, BitRunners | needs CSP-G2,G1 |
| Neuralstimulator | — | 1.12 | 50k | Black Hand, cities | |

### Tier 2 — moderate, once BitRunners rep is up (100k–275k)
Where the level-mult really climbs. Grind BitRunners for these.

| Aug | `hacking` | `hacking_exp` | Rep | Faction(s) | Note |
|---|---|---|---|---|---|
| Enhanced Myelin Sheathing | 1.08 | 1.10 | 100k | BitRunners, Black Hand | |
| The Black Hand | 1.10 | — | 100k | Black Hand | |
| ENM Core Implant | 1.07 | 1.07 | 175k | BitRunners, Black Hand | needs ENM |
| Neural Accelerator | 1.10 | 1.15 | 200k | BitRunners | strong combined |
| **Cranial Signal Processors G5** | **1.30** | — | 250k | BitRunners | biggest single level-mult; needs CSP-G4→G3→G2→G1 (buy G4 too, rep 125k) |
| Artificial Bio-neural Network | 1.12 | — | 275k | BitRunners | |

### Tier 3 — deep, late cycles / Daedalus (875k+)
Diminishing returns per rep-hour. Only worth it if a cycle needs the extra mult to cross 2500, or
during the Daedalus endgame when you're grinding that rep anyway.

| Aug | `hacking` | `hacking_exp` | Rep | Faction | Note |
|---|---|---|---|---|---|
| BitRunners Neurolink | 1.15 | 1.20 | 875k | BitRunners | |
| ENM Core V2 Upgrade | 1.08 | 1.15 | 1.0m | BitRunners | needs ENM Core Implant |
| ENM Core V3 Upgrade | 1.10 | 1.25 | 1.75m | **Daedalus** | needs Core V2 chain; grab during the Daedalus grind |
| The Red Pill | — | — | 2.5m | **Daedalus** | exit aug — buying 2.5m rep clears everything cheaper Daedalus sells too |

## Purchase order within a cycle
Order is **irrelevant** (all reset on install; you need the rep *threshold*, not the sum) with **one
exception: buy NeuroFlux Governor LAST.** Every aug you queue raises the *next* aug's price ~1.9×,
and NFG is the one you buy in bulk — queue it after the fixed augs so the escalation lands on the
cheap repeatable, not on it inflating the fixed ones. (Also just buy each fixed aug once; there's no
ordering subtlety among them.)

## Install cadence — when to pull the trigger

The tension: installing raises mult (good — collapses the climb) but pays a fixed tax (fleet rebuild
+ rep re-grind from zero). So **batch, don't install piecemeal** — but don't over-hoard rep on
Tier-3 augs pre-Daedalus if a smaller haul already crosses the gate. Rule of thumb:

1. **Cycle 1:** climb cheaply to ~550 (unlocks all four backdoor factions). Grind Tier-1 rep across
   CyberSec/NiteSec/Black Hand + join the eastern trio for Neuregen. Buy all Tier-1 + ENM + NFG to
   the money cap. **Install.** Mult jumps off the ~1.16 floor.
2. **Re-climb** (much faster now) toward 2500 while grinding **BitRunners** rep in the background.
3. **Cycle 2 (if 2500 isn't in reach):** add Tier-2 (CSP chain → G5, Neural Accelerator, Myelin) +
   deeper NFG. **Install.** This is usually the one that crosses 2500 → **join Daedalus**.
4. **Daedalus endgame** (own doc): grind ~465k rep → 150 favor → install → donate → Red Pill →
   install → re-climb 3000 → backdoor. See reset-protocol's "BN1 endgame checklist."

**Signal to install now** (not later): you've bought every aug your *current* rep unlocks from every
*unlocked* faction, **and** the climb has gone slow at the current mult (you're on the log wall). If
you're still unlocking factions or rep is still climbing toward a Tier you want, keep grinding — one
fat install beats two thin ones.

## Two gates the cadence must respect
- **Daedalus needs ≥30 installed augs.** The Tier-1/2 hacking augs (~20) + **NFG levels each count as
  one aug**, so a couple of cycles with NFG-to-cap clears 30 naturally — don't grind combat augs to
  pad the count.
- **NFG is money-capped, ~17–18 levels/install** (the ~1.9× escalation), each +1% to all mults.
  **Watch the mult live after buying** — if a pre-Daedalus install lands the level-mult below ~4–5,
  reaching 2500 may need another NFG-only cycle rather than more fixed augs (they're getting
  exhausted). This "install-now-vs-one-more-cycle" call is the only place a thin calculator would
  help; eyeball it until it proves fiddly.
