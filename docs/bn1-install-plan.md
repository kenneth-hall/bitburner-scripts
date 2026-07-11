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

## The recipe (read this one)

The whole node in plain steps. The idea in one line: **buy augs to raise your hacking multiplier,
install to switch them on, climb higher, repeat ~4 times, then finish.** Installing feels like a
reset but it's the *payoff* — it's the only thing that lifts the multiplier, and the multiplier is
the only way past the level wall.

1. **Do nothing at first — let the batcher cook.** Fresh node: you're broke and low-level. The
   daemon earns money and your hacking climbs on its own. Early levels are cheap, so hacking shoots
   up fast. There's no manual move until you can afford augs.

2. **Unlock the hacking factions as you pass their level.** As hacking climbs, root + backdoor each
   server and accept the invite: **CSEC** (level 55) → **avmnite-02h** (210) → **I.I.I.I** (351) →
   **run4theh111z** (542). These four are safe to join — no downside.

3. **Join the eastern cities — and ONLY those.** Travel to **Chongqing, New Tokyo, Ishima** and join
   all three (costs a bit of cash + being there). Chongqing sells **Neuregen**, a big cheap
   experience booster. ⚠️ **Never join Sector-12, Aevum, or Volhaven** — that permanently locks you
   out of Chongqing for the rest of the node.

4. **Grind faction reputation — the slow part.** Pick a faction, do its **Hacking Contracts** work in
   the UI. This is the main time sink of the whole node. Turn **share ON** while working (it boosts
   rep). Grind until you can afford the augs you want from the shopping list below.

5. **Shop: buy every hacking aug you can afford, then dump leftover cash into NeuroFlux.** Order among
   the real augs doesn't matter — but buy **NeuroFlux Governor LAST**, as many levels as your
   remaining money buys (each level is +1% to everything and also counts toward Daedalus's 30-aug
   gate).

6. **Install.** This wipes money, hacking level, and faction membership — but switches the augs ON,
   so your multiplier jumps and the next climb goes far higher. **Before you click install:** buy up
   your **home RAM** — it survives the install, your money doesn't.

7. **Repeat steps 4–6 until hacking crosses 2500.** Usually **2 rounds**. Each round you're in more
   factions and can afford deeper augs, so each install lifts the multiplier more than the last.

8. **At 2500, join Daedalus.** By now you'll also have 30+ augs and $100b (both happen naturally).
   Backdoor **The-Cave** and accept the invite.

9. **The endgame — 2 more installs:**
   - **a.** Grind ~465k Daedalus rep. That banks **150 favor** → **install** (this permanently
     unlocks *donating* for rep).
   - **b.** Re-climb to 2500, rejoin Daedalus, earn ~$1.5t, and **donate** — that instantly buys the
     full **2.5m rep**. Then buy **The Red Pill**.
   - **c.** **Install** the Red Pill. Re-climb to **3000**, walk the network to **w0r1d_d43m0n**, and
     run `backdoor`. Node done.

That's **~4 installs total**: 2 to reach 2500, then 2 for the endgame. (Details on why, and the
"install now vs. grind one more round" judgment call, are in the sections below.)

## Shopping list (the augs worth buying)

Only augs that raise **level-mult** (skill) or **exp-mult** (climb speed) — everything else is
skipped. Reputation is a *threshold*: to buy several augs from one faction you only need enough rep
for the single most expensive one you want.

**Cheap — grab these first (rep up to 50k):**
- **Neurotrainer I** — +10% exp — CyberSec — 1k rep
- **BitWire** — +5% level — CyberSec/NiteSec — 3.75k
- **Artificial Synaptic Potentiation** — +5% exp — NiteSec — 6.25k
- **Cranial Signal Processors Gen 1** — +5% level — CyberSec/NiteSec — 10k *(start of the "Cranial" chain — each Gen needs the one before it)*
- **Neurotrainer II** — +15% exp — NiteSec — 10k
- **Embedded Netburner Module (ENM)** — +8% level — NiteSec — 15k *(buy early — it unlocks the ENM upgrade chain used later)*
- **Cranial Signal Processors Gen 2** — +7% level — NiteSec — 18.75k
- **Neural-Retention Enhancement** — +25% exp — NiteSec — 20k
- **Neuregen Gene Modification** — +40% exp — **Chongqing** — 37.5k *(the big cheap one — the reason you joined the cities)*
- **CRTX42-AA** — +8% level **and** +15% exp — NiteSec — 45k *(best all-rounder)*
- **Cranial Signal Processors Gen 3** — +9% level — NiteSec — 50k
- **Neuralstimulator** — +12% exp — The Black Hand — 50k

**Mid — second round, mostly from BitRunners (rep 100k–275k):**
- **Enhanced Myelin Sheathing** — +8% level, +10% exp — BitRunners — 100k
- **The Black Hand** — +10% level — The Black Hand — 100k
- **ENM Core Implant** — +7% level, +7% exp — BitRunners — 175k *(needs ENM)*
- **Neural Accelerator** — +10% level, +15% exp — BitRunners — 200k
- **Cranial Signal Processors Gen 5** — **+30% level** — BitRunners — 250k *(biggest single jump; needs Gen 4 first, which is 125k and money-only)*
- **Artificial Bio-neural Network** — +12% level — BitRunners — 275k

**Deep — only if a round needs more to reach 2500, or while grinding Daedalus (rep 875k+):**
- **BitRunners Neurolink** — +15% level, +20% exp — BitRunners — 875k
- **ENM Core V2** — +8% level, +15% exp — BitRunners — 1m
- **ENM Core V3** — +10% level, +25% exp — **Daedalus** — 1.75m
- **The Red Pill** — the exit aug (finishes the node) — **Daedalus** — 2.5m

**Always:** **NeuroFlux Governor** — +1% to everything per level — any faction — cheap. Buy it **last**, in bulk, with leftover cash.

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

- **CyberSec** — backdoor `CSEC` at hacking **55** — entry augs, cheap early mult.
- **NiteSec** — backdoor `avmnite-02h` at **210** — the densest cheap hacking-aug shop (CRTX42-AA, Neural-Retention, ENM).
- **The Black Hand** — backdoor `I.I.I.I` at **351** — The Black Hand aug, Myelin; shares ENM/Cranial augs.
- **BitRunners** — backdoor `run4theh111z` at **542** — the deep hacking augs (Cranial Gen 5, Neural Accelerator, Neurolink, ENM chain).
- **Daedalus** — backdoor `The-Cave` at **925** — endgame only, and needs 30 augs / $100b / **hacking 2500** on top of the backdoor.

## How rep and prereqs work (the mechanics behind the shopping list)

Reputation is a **threshold, not a currency**: to buy several augs from one faction you only need rep
≥ the single most expensive one you want, so grinding a faction up to a tier unlocks everything
cheaper it sells for free. **Prereq chains:** the Cranial Signal Processors go Gen 1 → 2 → 3 → 4 → 5
(each needs the one before), and the ENM upgrades (Core Implant → Core V2 → Core V3) all need the
base ENM first — so buy ENM and Cranial Gen 1 early even though they're small.

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
