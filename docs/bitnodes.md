# BitNodes reference

General BitNode info for this build. Sources: the in-game **Documentation → BitNodes** page
(parsed live via CDP 2026-07-11) for the list below, and the in-game **BitNode selection
screen** for BN4's detailed multiplier table. This build has **15 BitNodes** (vanilla stops at
14; **BN15 is custom to this build**).

**API note:** `ns.getBitNodeMultipliers(n?, lvl?)` can return any node's multipliers
programmatically, but it **requires being in BitNode 5 or holding SF5** — we have neither, so
per-node multiplier tables must be hand-read off the BitNode selection screen until SF5.

**Singularity note:** `ns.singularity.*` is likewise **not scriptable for us right now** — it's
available only *in-node in BN4* (before SF4, at 16× RAM) or *anywhere with SF4*. We have neither
(we exited BN4 without clearing it), so all faction/company work, aug buy/install, program
creation, and backdoors remain **manual-UI / CDP-driven** until we clear BN4.

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

**The lens (two axes, not one — cold-review caveat):** a node can bench the batcher two different
ways: **economy** (Server Max Money nerfed to single digits → no money to steal) *or* **gate**
(WD difficulty / hacking-level nerf so high the climb is impractical). Don't conflate them:

| Batcher stays the star | Economy-nerfed (no $) | Money OK but gate-walled |
|---|---|---|
| BN1 (100% $, WD 3,000) · BN5 (100% $, WD 4,500) · BN10 (100% $, WD 6,000†) · BN12.1 (~96% $, WD ~3,060) | BN2 (8%) · BN3 (4%) · BN4 (11.25%) · BN9 (1%) · BN11 (1%) · BN13 (33%) | BN14 (70% $, WD 15,000) · BN15 (80% $, hacking 60% + puzzles) |

† BN10's *income* pools are full, but its purchased-server **fleet** is throttled (Base Cost 5.0,
Max RAM 50%, Server Limit 60%) — half the batcher's muscle.

**Strategy: snowball the batcher on low-difficulty friendly nodes while building the next
engine.**
1. **Low-difficulty clears — but NOT low-effort (see the fixed rep tax below):** **BN1→1.2** is
   the cheapest-ever clear (WD 3,000, full economy, known playbook) for **+8pp to *every*
   multiplier** (1.1's +16% → 1.2's +24%; the guide's "8 NFG levels"). Its real value (cold-review
   correction) is **not** a vague "broad tailwind" — it's that BN5's next gate (4,500) is
   *exponential* in level/mult, so +8pp on **both** the hacking-level *and* exp mult attacks that
   gate directly. **Decided 2026-07-11: clear to SF1.2 and STOP — not 1.3.** 1.2→1.3 is only +4pp
   for another *entire* Daedalus endgame (poor ROI at our full manual rep-tax); it won't
   meaningfully shrink BN5's grind. Revisit 1.3+ only after a rep-tax-killer (Sleeves/gang) makes
   re-farming BN1 cheap. **BN12.1** is a *new*-SF alternative (starts the uncapped free-
   NFG engine) but it's low *difficulty*, not low *effort* — it still costs a full Daedalus endgame
   for ~+1 NFG, and BN12 hardens each clear (short runway). These are also a non-hostile economy to
   validate a streamlined batcher against.
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

**Next *extending* node (after the BN1 warm-up): BN5 — re-priced by cold review.**
- **BN5** — the least-bad option under the "no new engine / no rough penalty" constraints. Durable
  reward is **+8% hacking mults**; its tooling (Formulas, `getBitNodeMultipliers()`, Intelligence)
  is weaker than it looks (see BN5 clearing notes — Formulas is buyable for $5b, the API is
  redundant with this doc, Intelligence is glacial for our playstyle). **Budget it as a 2–3
  install-cycle mult grind**, not a quick clear: the 4,500 gate is a mult problem, and BN5's
  200%-aug-cost / 15%-steal economy throttles the money that funds the mult. No BN10-style wall
  though (level mult full), so the ceiling is reachable.
- **BN10 — deferred, corrected reasoning.** Its Sleeves+Grafting rewards *do* kill our two worst
  pains (rep grind, reset wipe), but its **×0.35 hacking-level wall** violates the "no rough
  penalty" constraint. Deferral is correct — but the fix is **in-node Grafting + the biggest SF1
  stack you carry in, NOT SF5** (+8% is noise against ×0.35). Do it after banking SF1 levels, not
  "after SF5."

**⚠️ Constraint tension (cold-review meta-point) — decide consciously.** Our two constraints
exclude **all three** in-game rep-tax killers: gang Red Pill (BN2), Sleeves (BN10), darknet Red
Pill (BN15). So this plan *accepts paying the full Daedalus 2.5m-rep tax on every clear
indefinitely*. Gang especially is a *small* script (far less than corp/bladeburner) and the game's
designed answer to that exact tax — excluding it is a legitimate choice, but a choice, not a law.
**Open question: is "no new engine" worth a permanent recurring rep tax?**

**Deferred:** BN4 and every economy-nerfed node — revisit once a second engine exists. BN4
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

## General clearing order — the counter map (analysis 2026-07-18)

**Question:** is there a general optimal order that "negates" each node's penalties by
sequencing boons? **Answer: yes, mostly — because almost every node's dominant penalty has a
designed counter that is another node's Source-File.** The optimal order is a topological sort
of "acquire the counter before entering the node it counters."

**Framing correction first — what ordering can and can't negate.** Ordering negates
**cross-node problems** (the Daedalus rep tax, the install wipe, hacking-gate walls) because
those are countered by carried-in tools. It does **not** negate **in-node economy nerfs** —
BN9's 1% max money is 1% regardless of what you carry in. What the right order buys there is a
*different engine* (gang income, Bladeburner win path, corp money) so the nerf stops being on
the critical path. The operating principle: **never enter a node whose main penalty targets
your only engine** — not "stack multipliers until penalties cancel."

### Penalty → counter map (from the panel tables above)

| Penalty class | Nodes that punish it | Counter SF |
|---|---|---|
| Daedalus 2.5m-rep tax / aug-count gate | every clear, everywhere | **SF2** (gang sells Red Pill) · **SF15.1** (darknet Red Pill, all nodes except BN8) · SF10 (sleeves grind rep in parallel) |
| Install wipes progress | BN8 especially (market capital); every install-cycle grind | **SF10** (grafting = augs with no reset) |
| Hacking-level walls (BN6/7 ×0.35, BN9 ×0.5, BN10 ×0.35, BN13 ×0.25, BN14 ×0.4) | the whole back half | **SF6/7** (Bladeburner alt-destroy — the hacking gate becomes optional) + grafting + a big SF1 stack |
| Slow karma for gangs | using SF2 outside BN2 | **SF10** sleeves |
| Money starvation | BN2/3/9/11/13 economies | **SF3** corp or SF2 gang income (engines that ignore server money) |
| RAM-tight fresh starts | every node entry | **SF9.2** (128GB home start) |
| Manual-play tax | everywhere | **SF4** (held: 4.3 via Phase 21 grant) |
| Everything, a little | — | SF1 · SF5 · SF12's free NFG |

### The order that falls out

1. **BN1 (repeat)** — no penalties, broad buff. *Done: SF1.3 held.*
2. **BN2 (gang)** — highest-leverage early pick: SF2 removes the recurring cost every
   subsequent clear pays (Red Pill from your own gang, no Daedalus grind). ~~Its own penalties
   (80% hack level, 8% max money) are mild; gang income routes around the economy nerf.~~
   **⚠️ CORRECTED TWICE 2026-07-18 — read both corrections, the first overshot.**
   (a) "Mild" was wrong: that reading skipped the General row — `w0r1d_d43m0n` Difficulty
   **500%** → gate **15,000**, realistically needing **M ≈ 30–35** against our demonstrated
   10.077. BN2 is unambiguously the hardest gate on the board.
   (b) But the follow-up correction — "so BN2 is a hacking-level wall whose counter is SF6/7,
   and this table argues against placing it second" — **also overshot, and is wrong.** BN2 is a
   *starter* node in the in-game guide, recommended before SF6/7 can exist; its designed counter
   is **in-node** (the gang faction's broad aug catalog), not a carried-in Source-File. The
   counter-map's own principle still holds; BN2 is simply a node whose counter is native rather
   than imported. **Net: placement stands, difficulty was understated, and clearability hinges on
   one verifiable unknown (the gang catalog) rather than on a missing Source-File.** Full
   arithmetic in BN2's clearing notes above.
3. **BN5** — hacking mults + Formulas; modest penalties; compounds everything after.
4. **BN4 → SF4.3** — automation. *Already held via the Phase 21 save-edit grant — skip.*
5. **BN6 then BN7** — the Bladeburner alt-win path; the key that defangs the harsh back half.
   Their own ×0.35 hacking nerf doesn't matter because Bladeburner *is* the in-node path.
6. **BN10** — sleeves + grafting. After SF1 is stacked (its ×0.35 wall is countered by in-node
   grafting); sleeves retroactively supercharge gang karma and Bladeburner ops.
7. **Harsh nodes, now defanged:** BN9 + BN13 via Bladeburner (the guide says this explicitly),
   **BN8 only after BN10.1** (graft instead of installing — never liquidate market positions),
   BN3 (corp optional — beatable with the stack), BN14, BN15.
8. **BN12** — anytime after all mechanics exist, repeatedly, as a background NFG ratchet.
9. **BN11** — last; the one node whose reward counters nothing.

**Hard sequencing constraints (explicit in the in-game guide):** BN10.1 before BN8 · accept
Stanek's Gift before joining Bladeburner once SF7.3 is held · don't create a gang too early
in-node (income/territory timing) · chronological 1→2→3→… is the classic mistake (it puts
BN3 — a weeks-long scripting project in a starved economy — third).

### Implication for our plan (unresolved — feeds the open question above)

This analysis doesn't stay neutral: the general order puts **BN2 next, not BN5**. That's the
same conclusion as the open strategic question in "Our next-node plan" — the "no new engine"
constraint excludes all three rep-tax killers, while the game's designed order picks one up
*second*. BN5's case was "least-bad under the no-new-engine constraint"; the constraint itself
is what the general order rejects. BN5-before-BN2 orders the +8% ahead of the tool that makes
every later clear cheaper.

**The honest counterargument:** BN2's 8% max money benches the batcher for the whole node
(gang carries it), while BN5 keeps the batcher the star — so BN2 is the bigger playstyle
departure. If the goal is "keep improving the batcher," BN2 delays it; if the goal is "clear
the BitVerse efficiently," BN2 comes first. That's the actual decision — a priorities call,
not a math one.

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

**⚠️ Clearing notes — the 15,000 gate (analysis 2026-07-18, in-node). READ BEFORE PLANNING A BN2
CLEAR.** Two prior analyses (the original next-node plan, and the 2026-07-18 counter-map) both
described BN2's penalties as "mild" by reading the **Skills** row (Hacking Level 80%) and the
**Hacking** row (Max Money 8%) while skipping the **General** row directly above them:
`w0r1d_d43m0n` Difficulty **500%** → required hacking level **15,000**, vs BN1's 3,000. The gang
selling The Red Pill removes the *Daedalus rep* tax; it does **not** remove the *level* gate —
WD still has to be backdoored.

**Model.** `level = mult × (32·ln(exp) − 200)`, validated against our own BN1.3 endgame dump
(`logs/auginfo-1784388910541.json`: level 4,234, exp 9.73e8, hacking mult 9.161) to **0.02%
error**. BN2 applies its 80% Hacking Level mult on top.

**Multiplier required to reach each node's gate, by XP budget** (our BN1.3 stack peaked at
**M = 10.077** — 42 augs incl. NeuroFlux 67. ⚠️ An earlier pass here used **9.16**, which is the
`auginfo` dump from 10:35:10, *one minute before* install #12 took it to 10.077; see
`phase-26-ratchet-autonomy.closeout.md` line 74. Caught by an independent fable review
2026-07-18. Corrected below — it changes BN5's verdict materially):

| XP budget | BN1 (3,000) | BN5 (4,500) | BN4 (9,000) | **BN2 (15,000)** |
|---|---|---|---|---|
| our BN1.3 actual (9.7e8) | 6.5 | 9.7 | 19.5 | **40.6** |
| 10× | 5.6 | 8.4 | 16.8 | **35.0** |
| 100× | 4.9 | 7.4 | 14.8 | **30.8** |
| 1,000× | 4.4 | 6.6 | 13.2 | **27.4** |
| 10,000× | 4.0 | 5.9 | 11.9 | **24.8** |

**The realistic bar is ~30–35, not 40.6.** The 10,000× column is decorative: at the ≈1.35e5 exp/s
a mature BN1 fleet demonstrated, 10× base exp ≈ a day, 100× ≈ a week-plus, 1,000× ≈ months,
10,000× ≈ years. So BN2 realistically asks **M ≈ 30–35** against our demonstrated **10.077** —
about **3× short**, and still ~2× BN4's ask. Grinding genuinely cannot substitute (level is
logarithmic in exp: a 10,000× XP increase buys only −39% on the required multiplier). Dropping
our BN1.3 stack straight into BN2 reaches level ~3,400 against a 15,000 gate.

**BN5's requirement is already MET, not merely approached: it needs M ≈ 9.73 at base exp and we
demonstrated 10.077.** BN5 is cleared territory for the existing toolchain.

**The one genuine unknown — and it is genuinely open, not rhetorically open — is BN2's gang aug
catalog.** Decomposing our 10.077: NeuroFlux 67 = ×1.948, SF1.3 = ×1.28, leaving **×3.67 from
discrete augs** (an earlier pass said ×4.7 by double-counting SF1.3 into the discrete term).

⚠️ **Do not read ×3.67 as a ceiling — it was a stopping point.** The aug-ratchet needed only
M ≈ 6.5 for BN1's gate and halted there by design. The BN1 stack omits the entire megacorp /
endgame hacking tier, which is worth roughly another ×5 on the discrete term (QLink, nextSENS,
OmniTek InfoLoad, Xanipher, the PC-DNI line, SPTN-97, Neuronal Densification — *from-memory
vanilla values, NOT verified against this fork; confirm with `augcheck.js` before relying on
them*). A near-complete catalog would be ≈×18–20 discrete → **≈25 before any NeuroFlux**, leaving
BN2's gate needing only ~19–47 NFG levels — below the 67 already demonstrated in BN1's *weaker*
economy. So the honest verdict is **"plausible, unverified,"** not "out of reach."

**✅ RESOLVED 2026-07-21 — the catalog is verified against this fork; the "unverified" caveat is
discharged.** Post-`createGang` sweep (`logs/gangaugs-1784565947624.json`, cross-checked against the
raw JSON): **NiteSec, our gang faction, sells 98 augs at hacking ×22.89** (essentially the full
non-gang union ×23.121), `maxRepReq` 2.5m, **including The Red Pill (free) and QLink ($25t, ×1.75).**
The "your gang faction sells nearly the whole catalog" mechanic is live; the from-memory megacorp
values (QLink, nextSENS, OmniTek, Xanipher, SPTN-97, Neuronal Densification) are confirmed present
and purchasable (`augfarmer.js` live-buying). **Corrected bar:** everything but QLink = **$149b →
×13.08 discrete → M≈16.7** (with SF1.3) + a ~50–65-level NFG tail; OR +QLink → **M≈29** with a short
tail. Rep is **saturated** (2.5m max req vs ~18.3m banked respect). Verdict upgrades from "plausible,
unverified" to **CLEARLY REACHABLE, money-gated only (~3–6 weeks)**; gang *type* is immaterial (a
combat gang gets the identical expansion). The 15,000-gate inference below remains the last open
checkpoint. Full analysis: `docs/archive/bn2-gang-type-analysis.md`.

**Structural argument that cuts the same way:** the in-game guide (quoted above) calls BN2 a
*starter* node — recommended before SF6/7 exist. A 15,000 gate on a starter node only coheres if
the designed in-node path closes it, and BN2's unique mechanic is exactly a faction selling "most
augs." That is evidence the gang catalog is meant to bridge this.

**Also note:** neither *carried-in* rescue exists — grafting (SF10) and the Bladeburner
alt-destroy (SF6/7) are both unowned, so hacking WD is the only destroy route here. But see the
point above: BN2's intended counter is in-node, not carried in.

**⚠️ The 15,000 figure is an INFERENCE, not a reading.** `WorldDaemonDifficulty` is confirmed by
`markdown/bitburner.bitnodemultipliers.worlddaemondifficulty.md` to influence the required
backdoor level, but neither the base constant (3000) nor linearity is stated in any doc, and
`src/backdoorwd.js` shows `getServer("w0r1d_d43m0n")` throws until The Red Pill is installed — so
it cannot be read in-game yet. Call it ~85% confidence. **Required checkpoint: read
`getServerRequiredHackingLevel("w0r1d_d43m0n")` the moment Red Pill installs, before sizing any
NFG grind against 15,000.**

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

**Clearing notes — a mult grind, NOT a patience tax (corrected by cold review 2026-07-11).**
Good news first: Hacking **Level** mult and Server **Max Money** are full 100%, so there's **no
BN10-style reachability wall** and **no grafting required** — the ceiling is reachable. But the
earlier "50% exp is just ~2× patience that throughput cancels" was **wrong**: the WD gate is
**4,500** (vs BN1's 3,000), and by our own 218B-XP measurement, closing a higher gate is a
**multiplier problem, not an XP-throughput one** (level is logarithmic in XP). Worse, BN5's
penalties **compound onto the mult lever itself**: Aug Money Cost **200%** + steal **15%** +
Server Starting Money **50%** throttle the money that funds NFG/augs — and we proved in BN1 that
NFG is *money-capped*. So budget BN5 as a **2–3 install-cycle mult grind** (each cycle re-pays
the Daedalus endgame), not a quick clear. Throughput/XP-farm helps *accumulate* XP but is a
secondary lever; **mult is the binding constraint**, exactly as in the BN1 endgame.
**Reward, re-priced:** the durable win is **+8% hacking mults**. The tooling is weaker than it
looks — `getBitNodeMultipliers()` is largely *redundant with this very doc* (we hand-captured all
15 panels), Formulas.exe is buyable in-node for $5b anyway (SF5 just makes it free/permanent),
and Intelligence accrues glacially for a scripted no-Singularity playstyle. Pick BN5 *despite*
the tooling, not because of it.

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
+ 500% aug money — money isn't the blocker (100% Server Max Money batcher). Bank **SF1** levels
*before* entering to pre-offset the 0.35 (SF5's +8% is noise against ×0.35 — the fix is grafting +
the biggest SF1 stack you carry in, *not* SF5); use **Sleeves** to fund/parallelize.
Throughput / the XP farm is only a *secondary* lever here — it doesn't fix a multiplier wall.
**Caveat (cold review):** "batcher-friendly" overstates it — max money is 100% but the *fleet* is
throttled (Cloud Base Cost 5.0, Max RAM 50%, Server Limit 60%), so the batcher's muscle is halved
even where its income pools are full.

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

### BN4 timeline model (2026-07-11 analysis + fable cold review — read before re-modelling)
Worked the "how long is a BN4 clear" question hard; recording the findings + one **corrected error**
so we don't re-derive (or re-break) it.

- **The 9000 gate is a MULTIPLIER problem, not an exp problem.** Hacking level is
  `mult × (32·ln(exp) − 200)` (logarithmic in exp). Iso-exp identity: **9000 @ mult 18 needs the
  *same* exp as 3000 @ mult 6** (both → level/mult = 500 ≈ 3.16e9 exp). So once the mult is there,
  the climb to 9000 is **days even at BN4's nerfed rate**, not weeks. You cannot out-grind the gate;
  only the multiplier moves it (below ~mult 15 the required exp re-explodes; above ~18 it's flat).
- **⚠️ CORRECTED ERROR — NeuroFlux CANNOT bridge the multiplier.** A first pass modelled "stack ~129
  NFG levels from mult 5→18." **Impossible:** NFG caps at **~30–45 levels/node (~17–18/install)** —
  the ×1.9/aug in-cycle escalation compounding NFG's own ×1.14/level (already recorded in
  `docs/endgame-runbook.md` / [[reference_install_resets_money]]-adjacent notes; we ignored our own
  data). NFG is a **top-off lever (~×1.35–1.56 total), never a 5→18 bridge.**
- **The real mult bridge is FIXED augs in the corporate factions our catalog excludes** (OmniTek,
  NWO, Clarke, Fulcrum, ECorp, + Covenant) — ~×2 on the level-mult. Our 11-faction catalog's fixed
  level-mult product is only **~4.2× (×SF ≈ 5×)**, so **catalog-only BN4 looks INFEASIBLE**; the
  clearable path is corp-faction augs (→ base ~10) + ~30–45 NFG (→ ~15–16), landing on the feasible
  frontier. This is why in-node Singularity matters: it **scripts the corp company-work rep grinds**.
- **What actually drives the clock (in order):** (1) economy ramp under **~2.25% effective hack
  income** (11.25% max-money × 20% steal) — the true binding constraint, gates fleet size = the exp
  engine too; (2) scripted corp-faction rep ladder (~1–2 wk, unattended, overlaps 1); (3) ~6–10
  install cycles, **each paying a fleet-rebuild** (purchased servers wipe on install) at throttled
  income; (4) the repeated Daedalus endgame (30-aug gate — **BN4's DaedalusAugsRequirement not yet
  captured, verify on entry**; 150-favor→donation; membership resets per install) + the final
  ~2–10-day exp climb.
- **Estimate: ~4–8 weeks wall-clock, MOSTLY UNATTENDED (~days of actual attention).** In-node
  Singularity scripts the whole loop, so the cost is the computer's time, not yours. The "4–6 week"
  gut number was accidentally right; a precise-looking model built on the NFG-bridge was *worse* than
  the vibe. **Dominant remaining uncertainty = BN4 income rate** (bound it: BN1 $/hr × 0.0225).
- **SF4.1 is likely enough** (don't assume you need the 3-clear SF4.3): the tax-killing calls
  (join/buy/install/backdoor) are **low-frequency one-shots**, affordable even at 16× RAM as run-once
  companion scripts on a matured home — *this is fable's claim, verify the RAM budget before betting.*
- **Decision framing:** the efficiency picture has converged (BN4 ≈ weeks-unattended regardless of
  detail), so **go/no-go is a fun/motivation call** — "build the automation, then let it grind
  unattended for a month" — not a math one. And a *trustworthy* timeline needs the **widened aug
  catalog** (corp/Covenant factions), which is a **Kenneth anti-spoiler decision**, not Claude's.

## Open questions (BN4, fill in on play)
- **Widen the aug catalog** to the corp/Covenant/Illuminati factions before trusting any BN4 timeline
  (anti-spoiler: Kenneth's call). Capture **BN4's DaedalusAugsRequirement** (the 30-aug gate varies
  per node — BN12/13/15 showed 35/31/20).
- **Measure BN4 income** to firm the estimate: BN1 $/hr × 0.0225 → the economy-ramp + NFG-topoff clock.
- Does the daemon/batcher port cleanly, or does 11.25% max-money demand different target
  selection / more share-farming for rep? (Mechanic: hack *exp* is money-independent, so the batcher
  doesn't stall on XP — it just earns ~2.25%; fleet size, hence exp throughput, is what's throttled.)
- Verify SF4.1's 16× RAM actually covers the install/endgame companion calls on a fresh-node home.

## Sources
- In-game **Documentation → BitNodes** page (parsed via CDP) for the list; in-game **BitNode
  selection screen** for BN4's multiplier table. `markdown/` API docs for Singularity fns.
- Do not source-dive to shortcut mechanics; static tables/costs fine.

## Log
- 2026-07-11 — BN4 unlocked; recorded BitNode screen (SF4 tiers + full multiplier table).
- 2026-07-11 — BN1 cleared (SF1 earned); entered BN4, confirmed in-node Singularity, then
  stepped back out.
- 2026-07-11 — BN4 timeline model worked + fable cold-reviewed (see "BN4 timeline model" above).
  Key correction: NFG can't bridge the mult (caps ~30–45/node); corp factions are the real bridge;
  exp climb is days not the wall; ~4–8 wk mostly-unattended; go/no-go is a motivation call. Topic
  parked for the day.
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
- 2026-07-11 — Cold review (fable) corrections: BN5 re-priced as a 2–3 install-cycle mult grind
  (not "throughput-cancelled patience"); its tooling reward deflated; BN1.2's value reframed as
  attacking BN5's exponential gate (+ open Q: push to SF1.3?); batcher lens split into economy-vs-gate
  axes; BN10 fleet-throttle noted + its deferral reason fixed (grafting, not SF5); constraint tension
  surfaced (our constraints exclude all 3 rep-tax killers — open Q: is "no new engine" worth it?).
- 2026-07-11 — **Locked the near-term goal: clear BN1 once more → SF1.2, then BN5.** Resolved the
  SF1.3 open question → **stop at 1.2** (1.2→1.3 is +4pp for a whole extra endgame; revisit after a
  rep-tax-killer). Mirrored into CLAUDE.md's goal line. Added the Singularity-availability note above.
- 2026-07-18 — Added "General clearing order — the counter map": penalty→counter-SF table, the
  topological order it implies, hard sequencing constraints, and the implication that the general
  order puts BN2 (gang) ahead of BN5 — feeding the still-open next-node decision post-BN1.3.
- 2026-07-18 — **BN1.3 cleared; entered BN2.1.** Then, in-node, ran the 15,000-gate arithmetic
  nobody had done: BN2's `w0r1d_d43m0n` Difficulty 500% needs **M ≈ 40.6** vs our best-ever
  **9.16** (~2× BN4's requirement, a node already judged catalog-only-infeasible). Level model
  validated to 0.02% against `logs/auginfo-1784388910541.json`. Two prior analyses — the original
  next-node plan and the same-day counter-map — both called BN2 "mild" by reading the Skills row
  and skipping the General row; both corrected in place above. **BN5 by contrast needs M ≈ 9.7,
  which we have already achieved.** Open decision for Kenneth: stay in BN2 for the gang mechanic
  knowing a clear may be out of reach, or re-target. See BN2 clearing notes.
- 2026-07-18 — **Independent fable review of the BN2 analysis above.** Reproduced every required-
  mult figure exactly, and found three corrections, all folded in: (1) our peak multiplier was
  **10.077**, not 9.16 — the auginfo dump used predates install #12 by one minute — which flips
  BN5 from "roughly reachable" to **requirement already exceeded**; (2) the pessimistic read
  overshot: our BN1 discrete-aug product (×3.67, not ×4.7 — the earlier figure double-counted
  SF1.3) was a *ratchet stopping point at M≈6.5*, not a catalog ceiling, and the untouched
  megacorp/endgame tier is worth roughly another ×5, putting M≈25-before-NFG plausibly in reach;
  (3) the "BN2 is a hacking wall needing SF6/7" correction was itself wrong — BN2 is a starter
  node, so its designed counter is the in-node gang catalog. Net verdict moves from "BN2 is not
  clearable" to **"plausible but unverified, ~60–70%, 4–10 weeks"**. Two cheap decisive checks
  named: `augcheck.js faction "<gang faction>"` once joined settles the catalog question, and
  reading WD's required level the moment Red Pill installs settles the 15,000 inference.
