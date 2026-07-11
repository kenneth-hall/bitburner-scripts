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

---

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
- 2026-07-11 — Added the in-game "Which BitNode next" recommendation guide (parsed via CDP).
