# BitNodes reference

General BitNode info for this build. Sources: the in-game **Documentation → BitNodes** page
(parsed live via CDP 2026-07-11) for the list below, and the in-game **BitNode selection
screen** for BN4's detailed multiplier table. This build has **15 BitNodes** (vanilla stops at
14; **BN15 is custom to this build**).

**API note:** `ns.getBitNodeMultipliers(n?, lvl?)` can return any node's multipliers
programmatically, but it **requires being in BitNode 5 or holding SF5** — we have neither, so
per-node multiplier tables must be hand-read off the BitNode selection screen until SF5.

## How BitNodes work (from the doc page)
- Destroying a BitNode resets most progress but grants a persistent **Source-File** (different
  node → different SF). **Persists across destruction:** Source-Files, scripts on home, Intelligence.
- **Standard destroy path:** join Daedalus → buy **The Red Pill** aug (rep-gated, $0) → install
  it → manually `hack` the server **`w0r1d_d43m0n`** (hacking **3000**, sometimes more). A second
  destroy method unlocks after destroying BN6 or BN7 (Bladeburners).
- Each SF maxes at **level 3** (except **SF12**, unlimited). Re-destroying a node upgrades its SF.

## Our next-node plan (mature batcher — decided 2026-07-11)

**State:** SF1 level 1 only; a mature hacking batcher; no gang/corp/bladeburner/sleeve/stock
tooling. Backed out of BN4 (too grindy at SF1.1).

**The lens:** Server Max Money is the batcher's oxygen. A node either lets the batcher stay the
protagonist, or nerfs money to single digits and forces you to win via a mechanic we haven't
built. Straight from the panels:

| Batcher stays the star | Money-nerfed → batcher benched |
|---|---|
| BN1 (100% $, WD 3,000) · BN5 (100% $, WD 4,500, 15% steal) · BN10 (100% $, WD 6,000, 50% steal, full exp) · BN12.1 (~96% $, WD ~3,060) | BN2 (8%) · BN3 (4%) · BN4 (11.25%) · BN9 (1%) · BN11 (1%) · BN13 (33%). BN14/BN15 keep money but gate WD at 15,000 / behind puzzles. |

**Strategy: snowball the batcher on low-difficulty friendly nodes while building the next
engine.**
1. **Low-difficulty clears — but NOT low-effort (see the fixed rep tax below):** **BN1→1.2** is
   the strongest per-clear reward here — **+8pp to *every* multiplier** (1.1's +16% → 1.2's +24%;
   the guide's "8 NFG levels"), which is a real bank given how dear each mult point was in the BN1
   climb. **BN12.1** is the alternative: only ~+1 free NFG (small power) but a *new* SF + starts
   the permanent uncapped-NFG engine, same trivial ~3,060 gate. So: **BN1.2 for power, BN12.1 for
   a new SF / progression.** **BN12's runway is short** — it hardens each clear, low-hanging for
   ~1–2 levels only. These are also a non-hostile economy to validate a streamlined batcher against.
   - ⚠️ **The fixed cost every clear pays:** favor/rep/augs do **not** persist across destroying a
     node — only Source-Files, scripts, and Intelligence do (BitNodes doc, captured above). So
     *every* clear means re-grinding the full **Daedalus 2.5m rep → Red Pill → backdoor WD**
     endgame from a fresh start (no banked favor to shortcut it), unless we've built the gang or
     bladeburner alt-destroy path. "Low difficulty" = low WD gate + friendly economy (fast climb),
     **not** a quick clear. This makes the rep grind the real recurring cost — and a reason to
     value clears that attack it (e.g. BN10 Sleeves working Daedalus rep in parallel).
2. **Streamline the batcher (throughput):** this is the **Phase 20 XP-farm resume trigger** — the
   backlog shelved it "until a fresh node's XP re-climb is the binding constraint," which a new
   node now is. Validate throughput against BN5/BN10 (real climbs), *not* BN1/BN12 (already trivial).
3. **Build a second engine — only IPvGO or darknet are buildable now.** Gang/corp/bladeburner/
   sleeves are **node-locked** (can't prototype until inside their node). The only mechanics
   playable outside their node are **IPvGO** (CIA, Sector-12 / `ns.go`) and **darknet**
   (DarkscapeNavigator.exe + TOR). Those two are also what crack the WD-gated money-ok nodes
   (BN14, BN15).

**Next *extending* node (after the warm-up + tooling): BN10 or BN5.**
- **BN10** — batcher-friendly (100% money, full exp, 50% steal), and its rewards kill our two
  worst BN1 pains: **Sleeves** parallelize the manual rep grind, **Grafting** installs augs with
  *no reset* (deletes the money/membership wipe). Cost: WD 6,000, aug cost 500%, Sleeves' best
  synergy (karma-farming) needs mechanics we lack — but Grafting alone is a universal reset-killer.
- **BN5** — banks *tooling* instead: `getBitNodeMultipliers()` (script-read every node's mults —
  fixes the exact wall that forced hand-copying these panels), permanent Formulas.exe, Intelligence.
  Friendly to clear (100% money) but you run a 15%-steal (nerfed-income) batcher to get it.

**Deferred:** BN4 and every money-nerfed node — revisit once a second engine exists. BN4
specifically: come back with real multipliers and grind straight to **SF4.3** (needed for cheap
Singularity elsewhere anyway).

## BitNode list (Source-File effect = headline)

| BN | Name | New content | Source-File effect |
|----|------|-------------|--------------------|
| 1 | Source Genesis | — (baseline) | Start 32GB home RAM; **+all mults** L1 16% / L2 24% / L3 28% |
| 2 | Rise of the Underworld | **Gangs**; gang faction offers The Red Pill | Form gangs in other nodes (karma-gated); +crime success/money/charisma L1 24 / L2 36 / L3 42% |
| 3 | Corporatocracy | **Corporations** | Corps in other nodes; **L3 unlocks full Corp API**; +charisma/company salary L1 8 / L2 12 / L3 14% |
| 4 | The Singularity | **Singularity API** (faction/company work, aug buy/install, program creation) | Singularity in other nodes; **RAM cost L1 16× → L2 4× → L3 1×** |
| 5 | Artificial Intelligence | — | **Intelligence stat** (permanent, never resets); unlocks **`getBitNodeMultipliers()`**, permanent Formulas.exe, BitNode-mult info on Stats page; +hacking mults L1 8 / L2 12 / L3 14% |
| 6 | Bladeburners | **Bladeburner** division | Bladeburner in other nodes; +combat level & exp gain L1 8 / L2 12 / L3 14% |
| 7 | Bladeburners 2079 | Bladeburner | Bladeburner in other nodes; +bladeburner mults L1 8 / L2 12 / L3 14%; **L3 also grants "The Blade's Simulacrum" aug** on joining Bladeburner |
| 8 | Ghost of Wall Street | Start **$250m** + WSE/TIX; **shorts + limit/stop orders** | L1 permanent WSE+TIX; L2 shorts elsewhere; L3 limit/stop elsewhere; +hack-growth mults L1 12 / L2 18 / L3 21% |
| 9 | Hacktocracy | **Hacknet Servers** (generate hashes) | L1 Hacknet Server elsewhere; L2 start 128GB home RAM; L3 pre-upgraded Hacknet Server on new-node entry; +hacknet production / −costs L1 12 / L2 18 / L3 21% (L3 entry-only, not on install) |
| 10 | Digital Carbon | **Sleeves + Grafting** (Grafting via VitaLife, New Tokyo) | Sleeve + Grafting API elsewhere; **+1 Sleeve per level** |
| 11 | The Big Crash | — (financial-crisis economy) | Company favor boosts **both salary and rep** (+1%/favor); +company salary/rep mults L1 32 / L2 48 / L3 56%; **−aug price increase** L1 4 / L2 6 / L3 7% |
| 12 | The Recursion | Gets harder each destroy | **Unlimited SF levels**; start any node with **NeuroFlux Governor = SF12 level** |
| 13 | They're lunatics | **Church of the Machine God** (Stanek's Gift); Allison "Mother" Stanek in Chongqing | Church appears in other nodes; **+Stanek's Gift size** per level (note: SF7.3 → must accept Stanek before joining Bladeburner) |
| 14 | IPvGO Subnet Takeover | IPvGO subnet combat | L1 +100% Node-Power stat mults; L2 unlock `go.cheat` API; L3 +25% cheat success; also raises winstreak favor caps (200k/300k/400k rep-equiv) and rep→favor conversion (1000/1500/2000) |
| 15 | The Secrets of the Dark Net | **Darknet** (shifting/unreliable servers; Red Pill not yet monopolized by Daedalus) | L1 start with TOR + DarkscapeNavigator.exe, unlock full darknet everywhere; L2 charisma → salary/rep + faster auth (+20%); L3 charisma → faction rep + `.cache` xp/money +50% |

## Which BitNode next (in-game recommendation guide, parsed via CDP)

Order is not forced — pick freely; "best" varies by player. From the in-game guide:

**tl;dr**
- **BN1, BN2, BN5** are great starters.
- **BN4, BN6/BN7** are also good early if their mechanics appeal.
- **BN10** has interesting mechanics if you can generate lots of money.
- **BN9, BN13, BN14, BN15** are tough but have interesting new mechanics.
- **BN3** has a very tough mechanic to automate but gives unparalleled power.
- **BN8, BN11** are tough but offer little benefit to new players.
- **BN12** is easy to start but quickly ramps up in difficulty.

**Good early**
- **BN1** — no difficulty modifiers; SF1 raises *all* multipliers a lot. BN1.2/BN1.3 are natural first repeats.
- **BN2** — Gang: good income + a large aug supply from one faction. Using gangs elsewhere needs low karma (big time sink, or Sleeves).
- **BN5** — Intelligence (persists between nodes) + strong hacking SF bonuses + Formulas.exe. Worth getting early.

**Depends on your priorities**
- **BN4** — Singularity API (automate player actions). **Strongly recommended to complete BN4.3 before using Singularity in other nodes** (RAM cost).
- **BN6** — Bladeburner: an alternative win path not reliant on money/hacking. Sleeves help but aren't required.
- **BN7** — like BN6 but a bit harder; more Bladeburner-specific rewards (incl. the simultaneous-action aug).
- **BN10** — Sleeves + Grafting. Both very useful but money-hungry; +1 sleeve per SF level, up to 5 more purchasable (this node only).

**Tough but new mechanics**
- **BN3** — Corporations: effectively limitless wealth + rep, but very complex/doc-dependent; using elsewhere needs $150b starting wealth. Advanced.
- **BN9** — Hacknet Servers (hashes, not money). BN9.2's 128GiB home-RAM start helps RAM-tight openings.
- **BN13** — Stanek's Gift (versatile bonuses) but not enough to offset the node's own difficulty.
- **BN14** — IPvGO focus; automating it is challenging; wide variety of bonuses.
- **BN15** — expands the darknet (DarkscapeNavigator.exe); practical distributed-scripting problems + password puzzles that deepen with darknet level.

**Save for later**
- **BN8** — stock market is the *only* income; complete ≥BN10.1 first (Grafting) so you don't have to install augs and lose market gains.
- **BN11** — no real new mechanic beyond mild work-income bonus; cheaper bulk augs but not worth going out of your way; hard for little return.
- **BN12** — BN1 but harder each completion, forever; SF is relatively weak for the rising effort.

## Comprehensive recommendation guide (in-game, parsed via CDP)

**Framing:** there is no perfect order; it depends on playstyle. **Chronological order
(BN1→2→3→…) is a classic mistake — don't.** Per node, weigh: does it unlock a mechanic? is it
*gameplay* or *utility*? how does it interact with others? peculiarities to know first? how harsh
are its multipliers? (See a node's mults on the BitVerse selection screen; SF5 exposes them
in-node via UI + API.)

**Mechanic classification**
- *New gameplay:* Gang (BN2, simple/useful) · Corporation (BN3, extremely complicated/powerful/fast) · Bladeburner (BN6/7, simple/slow/rarely nerfed).
- *Utility:* Singularity (BN4) · Intelligence + Formulas.exe (BN5) · Hacknet Server (BN9) · Sleeves+Grafting (BN10) · Stanek's Gift (BN13).
- *Other:* BN8 stock · BN11 mild rewards · BN12 free NFG · BN14 IPvGO · BN15 darknet.

**Per-node notes + peculiarities**
- **BN1** — easiest, huge all-mult SF buff; repeat it.
- **BN2 (Gang)** — benefits survive install/soft-reset; good income; access to *most* augs (in BN2 the gang offers The Red Pill → only need 1 more faction for NFG). Gang unlocks at **karma ≤ 54000** (constant everywhere); karma farming is slow, **Sleeves speed it hugely**. ⚠️ Don't create the gang *too soon* (income matters early); **territory clashes** — enabling too early loses all territory, too late is also bad. Balance.
- **BN3 (Corporation)** — limitless wealth+rep, speedruns most nodes IF you have a good script; writing one takes **days/weeks**. Read the first 4 in-game Corp doc sections. Blindly = worst mechanic.
- **BN4 (Singularity)** — automate manual actions. Outside BN4 without **SF4.2/4.3** the RAM cost is **×4 / ×16** → to use elsewhere you must **complete it three times in one go (→ SF4.3)**. Mults are harsh, especially with only SF1. If you don't mind manual play, SF4 isn't really important.
- **BN5 (Intelligence)** — permanent stat; unlocks BitNode-mult data in UI + NS API; **permanent Formulas.exe**; buffs hacking mults. High value, get early.
- **BN6 / BN7 (Bladeburner)** — alt WD-destroy path (finish last Black Op); slow but rarely/mildly nerfed → good for very hard nodes (BN9, BN13). **BN6**: no penalty modifiers, buffs combat stats. **BN7**: has penalty modifiers, buffs bladeburner mults, **SF7.3 grants "The Blade's Simulacrum"** (removes the can't-multitask restriction). Contract/op generation is slow → Sleeves help. Watch chaos + Synthoid population.
- **BN8 (Stock)** — disables most normal income; needs a good **pre-4S** stock script; hack/grow on a stock's server still moves its price. **Grafting (do ≥BN10.1 first)** avoids losing capital to resets.
- **BN9 (Hacknet Server)** — hashes → money/upgrades. **Extremely harsh**; disables private servers + raises home RAM cost + nerfs hacking mults. SF9.2 = 128GB home start; SF9.3 = pre-upgraded Hacknet Server on new-node entry (**you get the 9.3 effect in-node even before owning it** — a key starting asset).
- **BN10 (Sleeves + Grafting)** — Sleeves = copies doing tasks in parallel (great with Gang/Bladeburner); buy up to 5 from **The Covenant** (last costs **100q** → need a batcher/corp), +1 per SF level. Grafting installs augs with **no reset, rep ignored, immediate**, but a multiplier debuff (removable via a special aug). Can't buy sleeves/memory outside this node.
- **BN11** — no new mechanic; company favor→salary+rep, cheaper bulk augs. Harsh mults, mediocre rewards.
- **BN12 (Recursion)** — mults *and* rewards scale with SF level, **no upper limit** (complete 100× → SF12.100); grants free NFG per level. Constantly re-strategize as it hardens; unlock all mechanics before high levels.
- **BN13 (Stanek's Gift)** — fragment grid boosting many mechanics; **−10% many mults** (Church offers 2 augs to remove). **Must accept the Gift before buying ANY aug (NFG excepted)**; with SF7.3, accept it before joining Bladeburner. Extremely harsh — Gift bonuses are crucial.
- **BN14 (IPvGO)** — SF buffs Node-Power mults + unlocks `ns.go.cheat`; raises winstreak favor cap (→ reach 150 faction favor faster). IPvGO isn't locked here — play it now via CIA (Sector-12) / `ns.go`.
- **BN15 (Darknet)** — bigger/deeper darknet → more caches + RAM for `phishingAttack`/`promoteStock`. SF unlocks TOR + DarkscapeNavigator everywhere; **SF15.1 lets you get The Red Pill from the final darknet lab in all nodes except BN8** (sometimes faster than Daedalus). Complex puzzles — experiment with the base mechanic elsewhere first.

**Order advice**
- **First choice: repeat BN1.** No penalties (best place to improve scripts); the buff is huge (SF1.1→1.2 ≈ 8 NFG levels). Repeat ≥once for SF1.2; most go straight to SF1.3.
- **Early:** BN2 (Gang) and/or BN5 (Intelligence + Formulas).
- **Situational/hard:** BN4 (only if you want automation — and get SF4.3), BN6/7 (Bladeburner; ideally both, BN6 easier), BN10 (Sleeves+Grafting), BN14 (IPvGO, playable now), then the very hard BN9 / BN13 (prepare first), BN15 (darknet, playable now).
- **Challenging (no fixed priority):** BN3 (Corp — love/hate; can beat it *without* Corp), BN8 (forced stock market).
- **Special:** BN12 (do after unlocking all mechanics).
- **Bad:** BN11 (do last, for completion).

---

## BitVerse selection panels (live-read, per node)

Captured from the in-game BitVerse node-selection panels — including the per-node multiplier
tables `getBitNodeMultipliers()` can't reach without SF5. Grows as nodes are inspected. Also
records our **owned Source-File level** shown on each panel.

### BN1: Source Genesis — owned **SF1 level 1 / 3**
"The original BitNode." No modifiers — baseline, all multipliers 100% (no table shown). SF1:
start 32GB home RAM, +all mults L1 16% / L2 24% / L3 28%. Panel offers *Advanced options* and
*Enter BN1.2* (repeat for SF1.2). Current holding: **SF1.1** (BN1 cleared once).

### BN2: Rise of the Underworld — owned **SF2 level 0 / 3** (not cleared)
SF2: form gangs in other nodes (karma-gated) + crime success/money/charisma L1 24 / L2 36 / L3 42%.
Only listed multipliers differ from BN1 (100%); the rest are baseline. Multiplier table:
- **General** — `w0r1d_d43m0n` Difficulty: **500%** (backdoor-hack gate ≈ hacking 15000 — but BN2's gang offers The Red Pill, the intended path)
- **Skills** — Hacking Level: **80%**
- **Faction** — Work Reputation: **50%** · Passive Rep: **0%**
- **Hacking** — Server Growth Rate: **80%** · Server Max Money: **8%** · Server Starting Money: **40%**
- **Cloud Servers** — Softcap Cost: **1.300**
- **Crime** — Crime Money: **300%**
- **Infiltration** — Infiltration Money: **300%**
- **Corporation** — Corporation Softcap: **0.900** · Division limit: **90%**
- **Stanek's Gift** — Gift Power: **200%** · Base Size Modifier: **−6.00000**

### BN3: Corporatocracy — owned **SF3 level 0 / 3** (not cleared)
SF3: create corporations in other nodes (some disable it), **L3 unlocks full Corp API** + charisma/company-salary L1 8 / L2 12 / L3 14%. Multiplier table (rest baseline):
- **General** — `w0r1d_d43m0n` Difficulty: **200%** · Hacknet Production: **25%**
- **Skills** — Hacking Level: **80%**
- **Faction** — Favor to Donate: **50%**
- **Augmentations** — Money Cost: **300%** · Reputation Cost: **300%**
- **Hacking** — Server Growth Rate: **20%** · Server Max Money: **4%** · Server Starting Money: **20%** · Stolen Money From Hack: **20%**
- **Cloud Servers** — Base Cost: **2.000** · Softcap Cost: **1.300** · Home RAM Cost: **150%**
- **Crime** — Crime Money: **25%**
- **Darknet** — Darknet Money: **40%**
- **Company** — Work Money: **25%**
- **Gang** — Gang Softcap: **0.900** · Unique Augmentations: **50%**
- **Stanek's Gift** — Gift Power: **75%** · Base Size Modifier: **−2.00000**

### BN4: The Singularity — owned **SF4 level 0 / 3** (entered, backed out — not cleared)
Full multiplier table is the **detailed BN4 section below** — re-verified against this live panel
(all values match: WD 300%, hacking exp 40%, server max money 11.25%, gift power 150%, etc.).

### BN5: Artificial Intelligence — owned **SF5 level 0 / 3** (not cleared)
SF5: **Intelligence stat** (permanent, never resets to 1) + `getBitNodeMultipliers()` +
permanent Formulas.exe + BitNode-mult info on Stats page; +hacking mults L1 8 / L2 12 / L3 14%.
Multiplier table (rest baseline):
- **General** — `w0r1d_d43m0n` Difficulty: **150%** · Hacknet Production: **20%**
- **Augmentations** — Money Cost: **200%**
- **Hacking** — Hacking Exp: **50%** · Server Starting Money: **50%** · Server Starting Security: **200%** · Stolen Money From Hack: **15%**
- **Cloud Servers** — Softcap Cost: **1.200**
- **Crime** — Crime Money: **50%**
- **Darknet** — Darknet Money: **70%**
- **Infiltration** — Infiltration Money: **150%** · Infiltration Reputation: **150%**
- **Gang** — Unique Augmentations: **50%**
- **Corporation** — Valuation: **75%** · Division limit: **75%**
- **Stanek's Gift** — Gift Power: **130%**

### BN6: Bladeburners — owned **SF6 level 0 / 3** (not cleared)
SF6: Bladeburner in other nodes; +combat level & exp gain L1 8 / L2 12 / L3 14%. Multiplier
table (rest baseline):
- **General** — `w0r1d_d43m0n` Difficulty: **200%** · **Daedalus Augs Requirement: 35** (vs BN1's
  30 — first node seen with a non-% field; the Red Pill's aug-count gate is harder here) ·
  Hacknet Production: **20%**
- **Skills** — Hacking Level: **35%**
- **Hacking** — Hacking Exp: **25%** · Server Max Money: **20%** · Server Starting Money: **50%** · Server Starting Security: **150%** · Stolen Money From Hack: **75%**
- **Cloud Servers** — Softcap Cost: **2.000**
- **Crime** — Crime Money: **75%**
- **Infiltration** — Infiltration Money: **75%**
- **Company** — Work Money: **50%**
- **Gang** — Gang Softcap: **0.700** · Unique Augmentations: **20%**
- **Corporation** — Corporation Softcap: **0.900** · Valuation: **20%** · Division limit: **80%**
- **Stanek's Gift** — Gift Power: **50%** · Base Size Modifier: **+2.00000**

### BN7: Bladeburners 2079 — owned **SF7 level 0 / 3** (not cleared)
SF7: Bladeburner in other nodes; +bladeburner mults L1 8 / L2 12 / L3 14%; **L3 also grants
"The Blade's Simulacrum"** aug on joining Bladeburner. Multiplier table (rest baseline) —
identical to BN6 on shared fields, plus its own Augmentations/Stock Market/Bladeburner rows:
- **General** — `w0r1d_d43m0n` Difficulty: **200%** · Daedalus Augs Requirement: **35** · Hacknet Production: **20%**
- **Skills** — Hacking Level: **35%**
- **Augmentations** — Money Cost: **300%**
- **Hacking** — Hacking Exp: **25%** · Server Max Money: **20%** · Server Starting Money: **50%** · Server Starting Security: **150%** · Stolen Money From Hack: **50%** (vs BN6's 75%)
- **Cloud Servers** — Softcap Cost: **2.000**
- **Stock Market** — Market Data Cost: **200%** · Market Data API Cost: **200%**
- **Crime** — Crime Money: **75%**
- **Infiltration** — Infiltration Money: **75%**
- **Company** — Work Money: **50%**
- **Gang** — Gang Softcap: **0.700** · Unique Augmentations: **20%**
- **Corporation** — Corporation Softcap: **0.900** · Valuation: **20%** · Division limit: **80%**
- **Bladeburner** — Rank Gain: **60%** · Skill Cost: **200%**
- **Stanek's Gift** — Gift Power: **90%** · Base Size Modifier: **−1.00000**

### BN8: Ghost of Wall Street — owned **SF8 level 0 / 3** (not cleared)
Start **$250m** + WSE/TIX; shorts + limit/stop orders. SF8: L1 permanent WSE+TIX, L2 shorts
elsewhere, L3 limit/stop elsewhere; +hacking-growth mults L1 12 / L2 18 / L3 21%. **Most
non-stock income is zeroed outright** — the "forced into the stock market" design, confirmed
numerically. Also the first panel with **no `w0r1d_d43m0n` Difficulty row at all** (every prior
node listed one). Multiplier table:
- **General** — Hacknet Production: **0%** · Coding Contract Reward: **0%**
- **Faction** — Favor to Donate: **0%**
- **Hacking** — Money Gained From Manual Hack: **0%** · Stolen Money From Hack: **30%** · Money Gained From Script Hack: **0%**
- **Cloud Servers** — Softcap Cost: **4.000**
- **Crime** — Crime Money: **0%**
- **Darknet** — Darknet Money: **0%**
- **Infiltration** — Infiltration Money: **0%**
- **Company** — Work Money: **0%**
- **Gang** — Gang Softcap: **0.000** · Unique Augmentations: **0%**
- **Corporation** — **Disabled**
- **Bladeburner** — **Disabled**
- **Stanek's Gift** — Base Size Modifier: **−99.00000** (no Gift Power row — effectively unusable)

### BN9: Hacktocracy — owned **SF9 level 0 / 3** (not cleared)
Hacknet Server replaces Hacknet Node. SF9: L1 permanent Hacknet Server elsewhere, L2 start
128GB home RAM, L3 pre-upgraded Hacknet Server on new-node entry (entry-only, not on aug
install); +hacknet production / −costs L1 12 / L2 18 / L3 21%. **Confirmed the harshest node
seen so far** — every non-combat stat nerfed, and **Server Limit: 0%** confirms private/cloud
servers are disabled outright (matches the comprehensive guide's warning). Multiplier table:
- **General** — `w0r1d_d43m0n` Difficulty: **200%**
- **Skills** — Hacking Level: **50%** · Strength/Defense/Dexterity/Agility/Charisma Level: **45%** each
- **Hacking** — Hacking Exp: **5%** · Server Max Money: **1%** · Server Starting Money: **10%** · Server Starting Security: **250%** · Stolen Money From Hack: **10%**
- **Cloud Servers** — Server Limit: **0%** (private servers disabled) · Home RAM Cost: **500%**
- **Stock Market** — Market Data Cost: **500%** · Market Data API Cost: **400%**
- **Crime** — Crime Money: **50%**
- **Darknet** — Darknet Money: **5%**
- **Gang** — Gang Softcap: **0.800** · Unique Augmentations: **25%**
- **Corporation** — Corporation Softcap: **0.750** · Valuation: **50%** · Division limit: **80%**
- **Bladeburner** — Rank Gain: **90%** · Skill Cost: **120%**
- **Stanek's Gift** — Gift Power: **50%** · Base Size Modifier: **+2.00000**

### BN10: Digital Carbon — owned **SF10 level 0 / 3** (not cleared)
Unlocks Sleeves + Grafting (Grafting via VitaLife, New Tokyo). SF10: Sleeve + Grafting API
elsewhere; **+1 Sleeve per level**. Multiplier table:
- **General** — `w0r1d_d43m0n` Difficulty: **200%** · Hacknet Production: **50%** · Coding Contract Reward: **50%**
- **Skills** — Hacking Level: **35%** · Strength/Defense/Dexterity/Agility/Charisma Level: **40%** each
- **Augmentations** — Money Cost: **500%** · Reputation Cost: **200%**
- **Hacking** — Money Gained From Manual Hack: **50%** · Stolen Money From Hack: **50%**
- **Cloud Servers** — Base Cost: **5.000** · Softcap Cost: **1.100** · Server Limit: **60%** · Max RAM: **50%** · Home RAM Cost: **150%**
- **Crime** — Crime Money: **50%**
- **Darknet** — Darknet Money: **40%**
- **Infiltration** — Infiltration Money: **50%**
- **Company** — Work Money: **50%**
- **Gang** — Gang Softcap: **0.900** · Unique Augmentations: **25%**
- **Corporation** — Corporation Softcap: **0.900** · Valuation: **50%** · Division limit: **90%**
- **Bladeburner** — Rank Gain: **80%**
- **Stanek's Gift** — Gift Power: **75%** · Base Size Modifier: **−3.00000**

**Clearing notes — the hacking penalty & its counter.** The rough hit is **Hacking Level ×0.35**
(Hacking *Exp* is full 100% — the throttle is on XP→level conversion, not XP gain). That's a
*reachability wall* on the WD ~6,000 gate, not a speed problem: level is logarithmic in XP, so
raw grinding can't overcome ×0.35, and **augs don't persist across node entry** — you *start* at
roughly `SF1.2 (1.24) × 0.35 ≈ 0.43×`, below 1×. **The designed counter is BN10's own Grafting:**
install hacking-multiplier augs **rep-free and reset-free** to rebuild the multiplier toward
~5–7×, at which point 6,000 is reachable. Costs an Entropy debuff (removable via a specific aug)
+ 500% aug money — money isn't the blocker (100% Server Max Money batcher). Bank **SF1.2 / SF5**
hacking mults *before* entering to pre-offset the 0.35; use **Sleeves** to fund/parallelize.
Throughput / the XP farm is only a *secondary* lever here — it doesn't fix a multiplier wall.

### BN11: The Big Crash — owned **SF11 level 0 / 3** (not cleared)
No new mechanic. SF11: company favor → **both** salary and rep gain (+1%/favor); +company
salary/rep mults L1 32 / L2 48 / L3 56%; −aug price increase L1 4 / L2 6 / L3 7%. Multiplier
table (matches "harsh mults, mediocre reward" from the guide):
- **General** — `w0r1d_d43m0n` Difficulty: **150%** · Hacknet Production: **10%** · Coding Contract Reward: **25%**
- **Skills** — Hacking Level: **60%**
- **Augmentations** — Money Cost: **200%**
- **Hacking** — Hacking Exp: **50%** · Server Growth Rate: **20%** · Server Max Money: **1%** · Server Starting Money: **10%** · Server Weaken Rate: **200%**
- **Cloud Servers** — Softcap Cost: **2.000**
- **Stock Market** — Market Data Cost: **400%** · Market Data API Cost: **400%**
- **Crime** — Crime Money: **300%**
- **Infiltration** — Infiltration Money: **250%** · Infiltration Reputation: **250%**
- **Company** — Work Money: **50%**
- **Gang** — Unique Augmentations: **75%**
- **Corporation** — Corporation Softcap: **0.900** · Valuation: **10%** · Division limit: **90%**

### BN12: The Recursion — owned **SF12 level 0 / ∞** (only node with no level cap)
Gets harder every completion; SF12 grants free NeuroFlux Governor levels = SF12's own level.
Multiplier table below is the **level-0/1 preview** — nearly every value sits within ~2% of
baseline (98.039% or 102%), confirming the guide's "easy at first, ramps up" — this is what
the *first* completion looks like, not the endgame-harsh version:
- **General** — `w0r1d_d43m0n` Difficulty: **102%** · Daedalus Augs Requirement: **31** · Hacknet Production: **98.039%** · Coding Contract Reward: **98.039%** · Class/Gym Exp: **98.039%**
- **Skills** — Hacking/Strength/Defense/Dexterity/Agility/Charisma Level: **98.039%** each
- **Faction** — Favor to Donate: **102%** · Work Reputation: **98.039%** · Work Exp: **98.039%** · Passive Rep: **98.039%**
- **Augmentations** — Money Cost: **102%** · Reputation Cost: **102%**
- **Hacking** — Hacking Exp: **98.039%** · Server Growth Rate: **98.039%** · Server Max Money: **96.117%** · Server Starting Money: **98.039%** · Server Starting Security: **150%** · Server Weaken Rate: **98.039%** · Money Gained From Manual Hack: **98.039%** · Stolen Money From Hack: **98.039%**
- **Cloud Servers** — Base Cost: **1.020** · Softcap Cost: **1.020** · Server Limit: **98.039%** · Max RAM: **98.039%** · Home RAM Cost: **102%**
- **Stock Market** — Market Data Cost: **102%** · Market Data API Cost: **102%**
- **Crime** — Crime Exp: **98.039%** · Crime Money: **98.039%**
- **Darknet** — Darknet Money: **98.039%**
- **Infiltration** — Infiltration Money: **98.039%** · Infiltration Reputation: **98.039%**
- **Company** — Work Money: **98.039%** · Work Exp: **98.039%**
- **Gang** — Gang Softcap: **0.800** · Unique Augmentations: **98.039%**
- **Corporation** — Corporation Softcap: **0.800** · Valuation: **98.039%** · Division limit: **50%**
- **Bladeburner** — Rank Gain: **98.039%** · Skill Cost: **102%**
- **Stanek's Gift** — Gift Power: **102%** · Base Size Modifier: **+1.02000**

### BN13: They're lunatics — owned **SF13 level 0 / 3** (not cleared)
Unlocks Stanek's Gift (Church of the Machine God, Allison "Mother" Stanek in Chongqing). SF13:
Church appears in other nodes; +Stanek's Gift size per level. **Confirmed extremely harsh** —
Hacking Exp **10%**, Corp Valuation **0.1%**, Market Data Cost **1000%**. The one buff: **Gift
Power 200%** (matches the guide — utilizing the Gift is crucial to offset the difficulty).
Multiplier table:
- **General** — `w0r1d_d43m0n` Difficulty: **300%** · Hacknet Production: **40%** · Coding Contract Reward: **40%** · Class/Gym Exp: **50%**
- **Skills** — Hacking Level: **25%** · Strength/Defense/Dexterity/Agility Level: **70%** each
- **Faction** — Work Reputation: **60%** · Work Exp: **50%**
- **Hacking** — Hacking Exp: **10%** · Server Max Money: **33.75%** · Server Starting Money: **75%** · Server Starting Security: **300%** · Stolen Money From Hack: **20%**
- **Cloud Servers** — Softcap Cost: **1.600**
- **Stock Market** — Market Data Cost: **1000%** · Market Data API Cost: **1000%**
- **Crime** — Crime Exp: **50%** · Crime Money: **40%**
- **Darknet** — Darknet Money: **10%**
- **Company** — Work Money: **40%** · Work Exp: **50%**
- **Gang** — Gang Softcap: **0.300** · Unique Augmentations: **10%**
- **Corporation** — Corporation Softcap: **0.400** · Valuation: **0.1%** · Division limit: **40%**
- **Bladeburner** — Rank Gain: **45%** · Skill Cost: **200%**
- **Stanek's Gift** — Gift Power: **200%** · Base Size Modifier: **+1.00000**

### BN14: IPvGO Subnet Takeover — owned **SF14 level 0 / 3** (not cleared)
SF14: L1 +100% Node-Power stat mults, L2 unlock `go.cheat`, L3 +25% cheat success; raises
winstreak favor caps (200k/300k/400k rep-equiv) and rep→favor for 2-in-a-row wins
(1000/1500/2000). **Confirms the guide's "IPvGO mults buffed significantly"** — its own
category has a **400% Node Power bonus**. Also the first panel with **Hacking Speed** (not
Hacking Exp) and Company **Work Reputation** (not Work Money) as the tracked fields. Multiplier
table:
- **General** — `w0r1d_d43m0n` Difficulty: **500%** · Hacknet Production: **25%**
- **Skills** — Hacking Level: **40%** · Strength/Defense/Dexterity/Agility Level: **50%** each
- **Faction** — Work Reputation: **20%**
- **Augmentations** — Money Cost: **150%**
- **Hacking** — Hacking Speed: **30%** · Server Max Money: **70%** · Server Starting Money: **50%** · Server Starting Security: **150%** · Stolen Money From Hack: **30%**
- **Crime** — Crime Money: **75%** · Crime Success Rate: **40%**
- **Infiltration** — Infiltration Money: **75%**
- **Company** — Work Reputation: **20%**
- **Gang** — Gang Softcap: **0.700** · Unique Augmentations: **40%**
- **Corporation** — Corporation Softcap: **0.900** · Valuation: **40%** · Division limit: **80%**
- **Bladeburner** — Rank Gain: **60%** · Skill Cost: **200%**
- **Stanek's Gift** — Gift Power: **50%** · Base Size Modifier: **−1.00000**
- **IPvGO Subnet Takeover** — Node Power bonus: **400%**

### BN15: The Secrets of the Dark Net — owned **SF15 level 0 / 3** (not cleared)
Bigger/deeper darknet. SF15: L1 start with TOR + DarkscapeNavigator, unlock full dark web
everywhere; L2 charisma→salary/rep + auth speed +20%; L3 charisma→faction rep + `.cache`
xp/money +50%. **Daedalus Augs Requirement: 20** — *lower* than BN1's 30, consistent with the
lore that Daedalus hasn't monopolized the Red Pill here yet (the darknet route is the intended
path instead). Multiplier table:
- **General** — `w0r1d_d43m0n` Difficulty: **200%** · Daedalus Augs Requirement: **20**
- **Skills** — Hacking Level: **60%** · Strength/Defense/Dexterity/Agility Level: **70%** each · Charisma Level: **110%** (the one stat buffed above baseline)
- **Augmentations** — Money Cost: **300%**
- **Hacking** — Hacking Speed: **60%** · Server Max Money: **80%** · Server Starting Money: **50%** · Server Starting Security: **150%**
- **Gang** — Unique Augmentations: **30%**
- **Corporation** — Corporation Softcap: **0.400** · Valuation: **20%** · Division limit: **40%**
- **Bladeburner** — Rank Gain: **20%** · Skill Cost: **300%**
- **Stanek's Gift** — Gift Power: **70%** · Base Size Modifier: **−2.00000**

**All 15 BitVerse selection panels now captured (BN1–BN15).**

## BN4 — The Singularity (detailed, live-read from the BitNode selection screen)

BN1 is cleared (Red Pill installed, `w0r1d_d43m0n` backdoored → SF1). We entered BN4 and then
stepped back out. Confirmed key mechanic: `ns.singularity.*` is usable **in-node** before SF4,
at the 16× RAM tier — the manual-UI-only constraint lifts the moment you're inside BN4.

### BitNode multipliers (BN4 — % of BN1 baseline; 100% = same as BN1)
**General**
- `w0r1d_d43m0n` Difficulty: **300%** ⚠️ → backdoor gate ≈ hacking **9000** (3× BN1)
- Hacknet Production: **5%** · Class/Gym Exp: 50%

**Faction** — Work Reputation: 75% · Work Exp: 50%

**Hacking** — Hacking Exp: **40%** · Server Max Money: **11.25%** · Server Starting Money: 75% ·
Stolen Money From Hack: **20%**

**Cloud Servers** — Softcap Cost: 1.200

**Crime** — Crime Exp: 50% · Crime Money: **20%**

**Darknet** — Darknet Money: 40%

**Company** — Work Money: **10%** · Work Exp: 50%

**Gang** — Unique Augmentations: 50%

**Stanek's Gift** — Gift Power: **150%** (the one buff)

### Why BN4 is a long node
Hacking Exp **40%** + Server Max Money **11.25%** + `w0r1d_d43m0n` at **300%** difficulty
(hacking ~9000, not 3000) → both the XP climb and the money to fund augs/servers are far slower
than BN1. Budget it as a long node, not a quick SF4 grab.

## Open questions (BN4, fill in on play)
- Does the daemon/batcher port cleanly, or does 11.25% max-money demand different target
  selection / more share-farming for rep?
- Early SF4 has 16× RAM cost — which Singularity calls are worth it at that price before home
  RAM scales? (keep them out of hot paths regardless — CLAUDE.md rule)
- Best route to first SF4: rush `w0r1d_d43m0n` on a lean hacking build, or build economy first
  given the money nerfs?

## Sources
- In-game **Documentation → BitNodes** page (parsed via CDP) for the list; in-game **BitNode
  selection screen** for BN4's multiplier table. `markdown/` API docs for Singularity fns.
- Do not source-dive to shortcut mechanics; static tables/costs fine.

## Log
- 2026-07-11 — BN4 unlocked; recorded BitNode screen (SF4 tiers + full multiplier table).
- 2026-07-11 — BN1 cleared (SF1 earned); entered BN4, confirmed in-node Singularity, then
  stepped back out.
- 2026-07-11 — Repurposed from `bn4.md` to a general BitNodes reference; added the full 15-node
  list parsed from the in-game Documentation page.
- 2026-07-11 — Added the in-game "Which BitNode next" (short) recommendation guide (parsed via CDP).
- 2026-07-11 — Added the in-game Comprehensive recommendation guide (per-node peculiarities +
  order advice), parsed via CDP.
- 2026-07-11 — Started per-node BitVerse selection-panel captures: BN1 (owned SF1 level 1/3).
- 2026-07-11 — Captured BN2 selection panel + full multiplier table (SF2 not yet owned).
- 2026-07-11 — Captured BN3 selection panel + full multiplier table (SF3 not yet owned).
- 2026-07-11 — BN4 selection panel (SF4 0/3) re-verified against the detailed BN4 table — all match.
- 2026-07-11 — Captured BN5 selection panel + full multiplier table (SF5 not yet owned).
- 2026-07-11 — Captured BN6 selection panel + full multiplier table (SF6 not yet owned); first
  node with a non-% "Daedalus Augs Requirement" field (35, vs BN1's 30).
- 2026-07-11 — Captured BN7 selection panel + full multiplier table (SF7 not yet owned);
  shares BN6's core fields but adds Bladeburner rank/skill-cost + Stock Market cost rows.
- 2026-07-11 — Captured BN8 selection panel + full multiplier table (SF8 not yet owned); nearly
  all non-stock income zeroed, Corp/Bladeburner disabled, no `w0r1d_d43m0n` row at all.
- 2026-07-11 — Captured BN9 selection panel + full multiplier table (SF9 not yet owned); Server
  Limit 0% confirms private servers disabled, hacking exp 5%/max money 1% confirm "extremely harsh".
- 2026-07-11 — Captured BN10 selection panel + full multiplier table (SF10 not yet owned).
- 2026-07-11 — Captured BN11 selection panel + full multiplier table (SF11 not yet owned).
- 2026-07-11 — Captured BN12 selection panel + multiplier table (SF12 0/∞, uncapped level).
- 2026-07-11 — Captured BN13 selection panel + full multiplier table (SF13 not yet owned).
- 2026-07-11 — Captured BN14 selection panel + full multiplier table (SF14 not yet owned); its
  own IPvGO Node Power bonus category (400%), Hacking Speed field instead of Hacking Exp.
- 2026-07-11 — Captured BN15 selection panel + full multiplier table (SF15 not yet owned);
  Daedalus Augs Requirement 20 (lower than BN1's 30). **All 15 nodes' panels now captured.**
- 2026-07-11 — Added "Our next-node plan (mature batcher)": snowball batcher on BN1.2/BN12.1
  while streamlining throughput (Phase 20 resume) + building an IPvGO/darknet engine; BN10/BN5
  as the next extending node; BN4 + money-nerfed nodes deferred.
