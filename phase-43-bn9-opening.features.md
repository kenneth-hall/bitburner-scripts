# Phase 43 — BN9 opening: the Hacknet economy and the Bladeburner entry gate

**Stage 1 (brainstorm). Decisions, rejected alternatives, open questions. No spec yet.**

Author: Claude · Date: 2026-08-25 · Node: **BN9.1 (Hacktocracy)**, entered 2026-08-25T12:09:04Z

> Every number in this doc is either **measured live today** (`logs/hacknetprobe-1787699918752.json`,
> `logs/bn9econprobe-1787700319698.json`, `logs/bitnodemults-1786922442524.json`) or **derived from
> those files with the arithmetic shown**. Nothing is transcribed from prose. Two probes shipped as
> part of this brainstorm: `src/hacknetprobe.js`, `src/bn9econprobe.js` — both read-only, both
> re-runnable.

---

## 0. 🔴 First: `CLAUDE.md`'s BN9 status block is stale, in the direction that matters

It says: *"🔴 **NOT YET DONE — the node is idle.** Nothing is running: no daemon, no bootstrap, no
Bladeburner… home RAM is SF1's 32GB."*

**Measured 2026-08-25 23:18–23:25 UTC, 11.3 hours into the node:**

| Claim in `CLAUDE.md` | Live reading |
|---|---|
| all stats 1, money $1.26k | combat still **1/1/1/1**; **hacking 103**; money **$774m** |
| nothing running | **10 processes on home** (`resourcemanager`, `cloudmanager`, `augfarmer`, `backdoorfactions`, `backdoorwd`, `dashboard`, `goallog`, `ratchetlog`, `gatewatch`, `transactionsmonitor`) |
| home RAM is 32 GB | **512 GB** |
| — | **1 Hacknet *Server* already online at level 100 / 10 cores**, producing 0.3584 hashes/s |
| — | it has earned **$3,379,627,520** — the node's **entire** income |

Two things that *are* still true, and they are why this phase exists: **Bladeburner has not been
joined** (`getRank()` throws), and **combat is 1/1/1/1** — the entry gate is untouched.

One correction the status block should carry: **`daemon.js` is not running.** `ps` lists ten
processes and the batcher is not among them; its companions are orphaned. The last entry in
`logs/daemon-batch-log.json` is timestamped **1787659733666 = 10.6 seconds *before* the node
reset** — i.e. it is BN10's last batch. **The batcher has produced zero batches in BN9, and
`moneySources.hacking` reads exactly `0`.** Whether that was deliberate or a crash is unknown
(§7 Q2); §2 argues it should stay that way regardless.

---

## 1. What BN9 actually does to us (measured multipliers, not the prose table)

From `logs/bitnodemults-1786922442524.json`, BN9 against the nodes we have engines for:

| Multiplier | BN1 | BN6 | BN10 | **BN9** |
|---|---|---|---|---|
| `ServerMaxMoney` | 1.0 | 0.20 | 1.0 | **0.01** |
| `ScriptHackMoney` | 1.0 | 0.75 | 0.5 | **0.10** |
| `HackExpGain` | 1.0 | 0.25 | 1.0 | **0.05** |
| `HackingLevelMultiplier` | 1.0 | 0.35 | 0.35 | **0.50** |
| `CloudServerLimit` | 1.0 | 1.0 | 0.6 | **0.00** |
| `HomeComputerRamCost` | 1.0 | 1.0 | 1.5 | **5.0** |
| `ServerStartingSecurity` | 1.0 | 1.5 | 1.0 | **2.5** |
| `HacknetNodeMoney` | 1.0 | 0.20 | 0.5 | **1.00** |
| `AugmentationMoneyCost` | 1.0 | 1.0 | **5.0** | **1.00** |
| `AugmentationRepCost` | 1.0 | 1.0 | 2.0 | **1.00** |
| `BladeburnerRank` | 1.0 | 1.0 | 0.8 | **0.90** |
| `BladeburnerSkillCost` | 1.0 | 1.0 | 1.0 | **1.20** |
| combat / charisma level mults | 1.0 | 1.0 | 0.4 | **0.45** |
| `WorldDaemonDifficulty` | 1.0 | 2.0 | 2.0 | **2.00** |

Read that column as three separate statements, because they point in different directions:

- **Hacking is destroyed** — four independent penalties, each worse than or equal to BN6's.
- **The Hacknet is untouched** — `HacknetNodeMoney` **1.00**, the only node in the table where it
  is not nerfed, in the node that turns Hacknet Nodes into Hacknet **Servers**.
- **Augmentations carry no penalty at all** — `AugmentationMoneyCost` and `AugmentationRepCost`
  both **1.00**, where BN10 charged 5× and 2×. Grafting (0.60× purchase price, zero rep) is
  therefore **cheaper here than in the node we just used it in.**

Redo-tax check: `(1 / 0.90) × 1.20 =` **1.333** ✓ — matches the 2026-08-16 derivation that put BN9
second-cheapest. Nothing about the node order changes.

---

## 2. Decision D1 — **the batcher is retired in BN9. Not tuned, not throttled. Retired.**

`CLAUDE.md` says "the batcher economy that funded BN6/BN10 largely does not exist here." That is
right, and it understates it by three orders of magnitude. Two terms:

**Steal per hack** = `ServerMaxMoney × ScriptHackMoney`:

| | BN1 | BN5 / BN6 | BN10 | **BN9** |
|---|---|---|---|---|
| effective steal | 1.000 | 0.150 | 0.500 | **0.001** |

**RAM to run it on** — `CloudServerLimit` is **0**, so `ns.cloud.purchaseServer` cannot succeed at
all (confirmed twice: `cloud.limit: 0`, and `cloudmanager.js` logging
`purchaseServer(cloud-0, 2) returned empty string`). A full network census
(`bn9econprobe.networkRam`) finds **71 servers, 2,877 GB total, 941 GB rooted — 512 GB of which is
home.** BN10's last batcher snapshot ran against `budgetGb: 7,344,292`.

> **941 GB against 7.34 PB is a 7,800× RAM cut, stacked on a 500× steal cut. Combined: ~3.9 million×.**

And the exp axis is gone too. `HackExpGain` **0.05** is **five times worse than BN6**, the node
where the batcher path to the WD gate was measured at **240–323 days**. BN9's gate is the same
6,000 at a *better* level mult (0.50 vs 0.35) — which does not come close to covering a 5× exp
penalty on top of a 150× money penalty on top of no fleet.

**Decision: no batcher, no fleet, no XP farm. `daemon.js` stays down.**

**🔴 Strongest objection, and what it costs.** The batcher is not only money — it is *hacking
level*, which gates faction-server backdoors, which gate faction invites, which gate augmentations.
Killing it forfeits that, and 512 GB of home RAM sits idle either way, so the marginal cost of
running it looks like zero.

**Why the objection loses, and this part is new since BN6/BN10 planning:** we now hold **SF10**, so
**grafting works from node entry, and grafting needs no reputation and no faction membership at
all** (`docs/grafting-reference.md` §2, measured across all 97 graftable augs). Faction rep was the
only thing hacking level was really buying. With grafting live, the augmentation path is
**money-only** — and money comes from the Hacknet. Hacking level drops to a convenience for a
handful of backdoors, which `backdoorfactions.js` is already picking off unattended at level 103.

**Cost accepted if this is wrong:** we lose the deepest faction servers and whatever augs are
graft-ineligible. **Reopens on:** finding a combat-multiplier aug that materially helps the ladder
and is *not* in the graft catalog (→ Q4).

---

## 3. The replacement engine, priced exactly

### 3.1 The Hacknet is the whole economy, and it is already running unattended

`moneySources` since node entry: `hacknet: $3,379,627,520` · `hacking: 0` · everything else `0`.

One Hacknet Server (`hacknet-server-0`, **level 100 / 1 GB RAM / 10 cores / cache 5**) at **0.3584
hashes/s**, hash storage pinned at **1024 / 1024**, and **every hash upgrade at level 0**. Hashes
are at cap and nothing is spending them — yet money arrives anyway.

**🔑 The mechanism, confirmed by arithmetic to within 0.1%: overflow hashes auto-sell at exactly
$250,000 each.**

```
totalProduction          14,398.79 hashes    (read 23:18:38Z)
  − held in cache          −1,024.00
  + 401 s × 0.3584 h/s       +143.72         (the gap to the 23:25:19Z money read)
  = sold                   13,518.51 hashes

$3,379,627,520 / 13,518.51 = $250,000.4 per hash        ✓
```

That constant is the most useful thing measured today, because it converts **every** hash decision
into dollars (§3.3).

Current run-rate: `0.3584 h/s × $250,000` = **$89,600/s ≈ $7.7b/day**, entirely unattended.

### 3.2 Decision D2 — **build the Hacknet to ~$42m and then stop. Do not build the empire.**

This is the non-obvious call, and it is the opposite of what the node's theme invites. The cost
curves (`bn9econprobe.upgradeLadders`, `hsConstants`) are savage:

| Lever | Effect on production | Price now | Verdict |
|---|---|---|---|
| **RAM** | `1.07 ^ log2(ram)` — **+7% per doubling** | $156k, ×2.8 per doubling; **1 → 64 GB = $41.7m for 1.50×** | ✅ **buy, to 64 GB** |
| Cores | `(cores + 5) / 6` | 10 → 16 = **$943m for 1.40×**; 32 → 33 alone = $621b | ⚠️ only if money ever idles |
| **Level** | linear, `level × 0.001` | **100 → 101 = $5.38b for +1%**, then ×1.1 per level | 🔴 **dead** |
| Cache | hash *capacity* only | 5 → 6 = $117m | 🔴 **dead** (see below) |
| **New servers** | #2 costs only $125k… | …but a fresh server is **level 1 = 0.00128 h/s, 1/280th of server-0**, and levelling it 1 → 100 costs **~$54 billion** | 🔴 **dead** |

The last row settles it. `UpgradeLevelMult` is **1.1** and `levelUpgradeCost(1,1)` is $429,687, so
the cumulative 1 → 100 ladder is `429,687 × (1.1⁹⁹ − 1) / 0.1 ≈ $54.1b` **per server**.
`PurchaseMult` is **3.2**, so server #11 is $4.4b and server #20 is **$154.7 trillion**. Buying
servers is cheap and pointless; making them produce is unaffordable.

> **The Hacknet's realistic ceiling in BN9 is roughly $135k–$200k/s (~$12–17b/day), and it does not
> compound.** Levels cost 1.1× more for 1% more output — a losing race against its own income,
> forever.

**So: spend ~$41.7m of a $774m bankroll taking server-0's RAM 1 → 64 GB (a 1.50× step, 5% of the
bankroll), and put every remaining dollar into grafts and the ladder.**

**🔴 Strongest objection:** $15b/day is a rounding error next to BN10, which finished holding
$195b. If money turns out to bind, we will have deliberately capped it.
**Why it still holds:** in BN10, money bought grafts (~$589m for four) and home RAM. Bladeburner
rank comes from *actions* and skill points come from *rank* — **neither is purchasable at any
meaningful rate** (§3.3). At $7.7b/day we can afford BN10's entire graft ladder in **under two
hours**. Money is not the binding constraint in this node; **rank-grind wall-clock is.**
**Reopens on:** a costed plan that needs more than ~$50b, or grafts pricing materially above BN10's.

### 3.3 Decision D3 — **do not build a hash→Bladeburner exchange. It is off by ~2 orders of magnitude.**

BN9 dangles exactly the lever a Bladeburner node would want. From `hashUpgrades`, the *k*-th
purchase of any escalating upgrade costs `base × k` — verified: `Exchange for Bladeburner Rank`
reads 250 / 13,750 / 1,262,500 for counts 1 / 10 / 100, and `250 × Σ₁..₁₀₀ k = 250 × 5050 =
1,262,500` ✓. Cumulative cost is therefore **quadratic**.

Priced in dollars at the §3.1 constant:

| Hash upgrade (base cost) | 1st purchase | 10th | cumulative to 100 |
|---|---|---|---|
| Sell for Money (4, **non-escalating**) | $1m per 4 hashes | — | *the numeraire* |
| Generate Coding Contract (25) | **$6.25m** | $62.5m | $31.6b |
| Improve Gym Training (50) | **$12.5m** | $125m | $63.1b |
| Increase Maximum Money (50) | $12.5m | $125m | $63.1b |
| **Exchange for Bladeburner Rank (250)** | **$62.5m** | **$625m** | **$315b** |
| **Exchange for Bladeburner SP (250)** | **$62.5m** | **$625m** | **$315b** |

BN6 measured a mature `Tracking` grind at **~1,435 rank/hour**; BN9's `BladeburnerRank` 0.9 puts
that near **1,290 rank/h**. Rank-per-purchase is unmeasured (Q1), so state the **break-even**
instead of guessing:

> Purchase #1 costs **$62.5m**. The grind and the Hacknet run **in parallel**, so the exchange buys
> no *time* at all — it only converts money. Against grafts at ~$147m for a permanent combat
> multiplier that raises **every** action's success chance for the **whole node**, the exchange has
> to clear a bar it almost certainly cannot: even at an implausible **+1,000 rank per purchase**,
> purchase #10 costs $625m for roughly 28 minutes of grinding.

**Decision: no hash-spender feature for Bladeburner. Measure the rate once on join day for the
record (Q1), then close it.**

**Corollary — cache upgrades are worthless.** A banked hash and an auto-sold hash are worth the
same $250,000. Cache buys only the *option* to make a lumpy hash purchase, and we have just decided
every lumpy hash purchase is a bad trade. $117m for cache 5 → 6 buys nothing. **Do not upgrade
cache.**

---

## 4. Decision D4 — the entry gate: **graft the multiplier first, then grind. Not the reverse.**

The gate is combat **100 in all four stats**; we sit at **1/1/1/1** with essentially no exp. BN10's
gate was cleared starting from combat **91**, so this is a materially harder start than Phase 41
faced.

**✅ Q4 ANSWERED 2026-08-25 — grafting is LIVE in BN9** (`logs/graftrecon-1787701791849.json`):
`graftingAvailable: true`, **98 graftable augs**, **36 of them combat**, entropy currently **0**.
D4's load-bearing assumption holds, so the table below is a real ladder, not a hypothetical.

BN9 combat level mult **0.45** × current player mult **1.3824** = **0.6221 effective**. Using the
measured `combatgateprobe` baseline and the standard level curve
`level = 32·ln(exp + 534.6) − 200`, against `graftrecon`'s cumulative ladder (which already carries
`0.98^k` **inside** `netCombatFactor`) and Mug at the measured **0.179 exp/s/stat**:

| grafts *k* | net combat ×  | effective mult | exp needed **/stat** | grind | graft (serial) | **total** | cum. cost |
|---|---|---|---|---|---|---|---|
| **0** | 1.000 | 0.622 | 78,171 | 121.3 h | 0 | **121.3 h** | $0 |
| 4 | 1.421 | 0.884 | 17,225 | 26.7 h | 2.8 h | **29.6 h** | $139m |
| 6 | 1.817 | 1.130 | 7,692 | 11.9 h | 5.1 h | **17.1 h** | $319m |
| 8 | 2.848 | 1.772 | 2,487 | 3.9 h | 6.9 h | **10.7 h** | $581m |
| **9** | **3.908** | **2.431** | **1,339** | **2.1 h** | **7.7 h** | **⭐ 9.8 h** | **$731m** |
| 10 | 4.977 | 3.096 | 887 | 1.4 h | 8.5 h | **9.9 h** | $926m |
| 12 | 6.954 | 4.326 | 532 | 0.8 h | 10.8 h | **11.7 h** | $1,421m |

> **Required exp collapses super-exponentially in the multiplier**, and grafting time is roughly
> linear — so total wall-clock is U-shaped with a **shallow basin at k = 8–11 (~10–11 h)** and a
> minimum at **k = 9, ~9.8 h**. Grind-only is **121 h — twelve times longer.** This is the BN2
> gate-math lesson (*raise M, don't grind exp*) reappearing in a completely different subsystem.

**Decision: graft to k ≈ 9 (~$731m, ~7.7 h serial) *before* starting the stat grind**, funded from
the Hacknet, with the sleeve grinding in parallel. We already hold **$920m**, so the ladder is
affordable *today* without waiting on income. `CLAUDE.md`'s "~0.5–2.9 days" estimate is **only
reachable on the graft-first ordering**; grind-first is a **5.05-day** path.

**⚠️ What k = 9 costs, permanently: Entropy 0.8337 on EVERY multiplier for the rest of the node.**
That is the honest price and it is not only combat — it hits `bladeburner_success_chance`,
`bladeburner_max_stamina`, `bladeburner_analysis`, `bladeburner_stamina_gain` (all currently at a
bare 1.000, so Entropy pushes them **below baseline**) and Hacknet production (−$1.3b/day, which
D2 says does not matter). **The specific risk worth naming: BN10's `Tracking` realised 80% success
and that is what tripped S-RF's `0.9` floor and created Phase 42.** A 17% haircut on the
Bladeburner mults is a plausible way to land in that regime again — offset, probably more than
offset, by a **3.9× combat-stat multiplier**, since stats drive action success far harder than the
mults do. **Not resolvable in advance; watch it at WI5.**

**Rejected: "Improve Gym Training" hashes.** Ten purchases cost **$687m** (§3.3) and multiply the
gym *rate* — a linear lever on the slow variable. The same money buys four or five grafts, which
multiply the *stat*, shrink the exp requirement super-exponentially per the table above, **and keep
paying for the rest of the node** by raising every Bladeburner action's success chance. Not close.

**⚠️ Restate at execution time:** `graftAugmentation` **cancels whatever work is running while
charging up front**, and is the **fifth claimant on the single player-action slot**
(`docs/grafting-reference.md` §7). Grafting, gym, crime, faction work and Bladeburner all contend.
The graft ladder and the stat grind are **strictly serial for the player**; only the sleeve runs
alongside. `augfarmer.js` is currently *running* and holds that slot — it will have to be paused,
exactly as in Phase 41.

---

## 5. Decision D5 — scope of this phase

**In scope:** get BN9 from "one unattended Hacknet Server" to "Bladeburner joined and the rank
engine running."

| # | Work item | Why |
|---|---|---|
| WI1 | Hacknet: RAM 1 → 64 GB on server-0, then stand down | $41.7m for 1.50× income; a one-shot, not a manager |
| WI2 | Stand `cloudmanager.js` down when `getServerLimit() === 0` | it is retrying an impossible purchase on a poll loop |
| WI3 | Graft ladder for combat multipliers (reuse `graftladder.js` / `graftplanner.js`) | D4 — the ordering that turns ~5 days into ~1 |
| WI4 | Combat grind to 100×4 (player + the one sleeve), then `joinbladeburner.js` | the gate |
| WI5 | Bring `bladeburnermanager.js` up; re-verify S-RF and the Field Analysis gap (§6) | the rank engine |

**Explicitly out of scope**, named so it does not creep in: the black-op ladder itself
(`bbblackop.js` exists and works); `bbskillbuy.js`'s greedy-spend bug (BACKLOG — it cannot bite
until there is an SP bank); any Hacknet *manager* script; any hash-spender; the batcher;
corporations; the stock market (§6).

---

## 6. Carried-forward hazards this phase must not rediscover the hard way

- **🔴 Phase 42 (`phase-42-field-analysis.features.md`) is an unshipped stage-1 doc sitting in the
  repo root, and its premise is node-local.** It was written because BN10's `Tracking` realised
  **80%** success, below S-RF's `REALISED_FLOOR_MIN_SUCCESS = 0.9`, leaving selection exposed to a
  `pMin` that had decayed to ~500× wrong. **BN9's realised success rate is unknown and will be
  whatever BN9's combat mults make it.** Decide at WI5 whether Phase 42 is revived, rewritten, or
  graduated to `docs/phases/unshipped/` — do not leave it ambiguous in the root for a third node.
- **The estimator is untrustworthy in both directions.** Read `getActionEstimatedSuccessChance` as a
  **pair**: a widening `[pMin, pMax]` is an *intelligence* problem; only a falling `pMax` is real
  decline.
- **Rank 400,000 is a gate, not a win condition.** The node clears on all 21 black ops via
  `getNextBlackOp()` → `null` → `destroybn.js <next> confirm`. `ladderstatus.js` reads the real
  condition from the game.
- **The SP bank is node-local and must be spent before Daedalus**, balanced across Blade's Intuition
  and Digital Observer — the multiplier is a **product**, and `bbskillbuy.js` will not balance it
  for you (BACKLOG).
- **🔴 IRREVERSIBILITY — DO NOT INSTALL AUGMENTATIONS IN BN9, and do not flip the ratchet to
  `auto`.** An install is the **only** thing that clears Entropy, so it will look attractive once
  the graft ladder has taxed everything to 83%. But `docs/reset-protocol.md`'s soft-reset table
  puts *"Money, purchased servers"* in the **reset** column and **does not say what happens to
  Hacknet Servers** — and `hacknet-server-0` is **the node's entire economy**, at a level that
  `bn9econprobe` prices at **~$54b to rebuild** and which we did not pay for (Q3). If an install
  wipes it, BN9 has no income and no way back. **The only way to test that is to do it, which is
  exactly why we don't.**
  - ✅ **Verified safe right now:** `src/ratchet-mode.txt` **and** its `dist/` mirror both read
    `observe`, and `installer.js` refuses to act unless the file reads exactly `auto`. Nothing can
    fire an install on its own. **Re-verify before any dev-server restart** (next bullet).
  - **Consequence:** the Phase 25 aug-ratchet, `installer.js` and `augfarmer.js` have **no job in
    BN9** — grafting replaces buying, and buying needs an install. `augfarmer.js` is nonetheless
    *running and holding the single player-action slot* (faction work in Aevum). **It gets paused
    for the node** via `augfarmer-pause.txt`, exactly as in Phase 41, at WI3.
- **`ratchet-mode.txt` is gitignored *and* pushed by viteburner.** An in-game write silently reverts
  on the next dev-server restart.
- **viteburner pushes the working tree, so git and the running game can disagree silently.**
- **Estimates in this repo run high.** BN10 was projected at ~18 days and cleared in ~9. Read
  `CLAUDE.md`'s "~16 days (12–23)" for BN9 alongside `docs/estimation-calibration.md` — **~8–12 days
  is the calibrated read**, and this doc does not improve on that until the gate is cleared.

**Logged dropped objection** (per the "dropped objections get logged, not erased" rule): *the stock
market is untouched by BN9's multiplier table, and `docs/stock-engine.md` already exists.* It is
excluded from D2 and §5 without ever being measured. If §3.2's ~$15b/day ceiling ever binds, TIX is
the first place to look — not more Hacknet levels.

---

## 7. Open questions — each with a default and a date

| # | Question | Default if unanswered | Expires |
|---|---|---|---|
| **Q1** | Rank and SP granted per `Exchange for Bladeburner …` purchase | **Marginal; feature not built** (§3.3). Measure once on join day, for the record only. | 2026-09-05 |
| **Q2** | Was `daemon.js` stopped deliberately, or did it crash on the empty fleet? | **Stays down either way** (§2). If it crashed, `cloudmanager`'s impossible-purchase loop is the prime suspect and WI2 removes it. | 2026-08-28 |
| **Q3** | Where did `hacknet-server-0` come from? `hacknet_expenses` reads **0**, yet it is level 100 — a ladder costing **~$54b**, against $3.38b ever earned. `timeOnline` (40,175 s) ≈ node age (40,575 s). | **Hypothesis: BN9 grants a pre-levelled Hacknet Server at entry.** ⚠️ **Upgraded from trivia to load-bearing by §6:** if the grant is *on node entry*, an install does **not** restore it, which is the argument for never installing. | 2026-09-01 |
| ~~**Q4**~~ | ~~Is the graft catalog intact in BN9?~~ | ✅ **ANSWERED 2026-08-25** — `graftingAvailable: true`, **98 graftable augs, 36 combat**, entropy 0 (`logs/graftrecon-1787701791849.json`). D4 stands. | closed |
| **Q7** | Does an augmentation install reset Hacknet **Servers**? `reset-protocol.md` is silent on it. | **Assume YES, and never install in BN9** (§6). Not testable without doing it. | no expiry — this is a standing rail, not a decision awaiting data |
| **Q5** | `w0r1d_d43m0n` is **not a valid host** (`getServer` throws), where it existed in BN6. When does it appear, and are `backdoorwd.js` / `gatewatch.js` degrading cleanly against a missing host? | **Assume it appears later and both scripts are harmless.** Check their logs once. | 2026-09-01 |
| **Q6** | Does $250,000/hash hold as production scales, or is it a per-*purchase* price that escalates once `Sell for Money` leaves level 0? | **Assume flat** — `Sell for Money` is the one upgrade whose cost does **not** escalate (4 / 40 / 400 for 1 / 10 / 100), which is exactly what a flat exchange rate looks like. | 2026-09-05 |

---

## 8. What this doc deliberately does **not** decide

- **The win path.** It is the Bladeburner black-op ladder, decided 2026-08-16 and unchanged; §1's
  redo-tax check reconfirms it. Not reopened.
- **Anything past the gate.** The ladder, the skill buys and `destroybn.js` all exist and have
  worked twice.
- **How much Hacknet build-out is *optimal*.** D2 takes the cheap 1.50× step and stops, on the
  argument that money does not bind. If money is later shown to bind, that is a new decision, not a
  revision of this one.

**Next stage:** spec (`phase-43-bn9-opening.spec.md`) + `spec-reviewer` — **not started, and not
authorized by this doc.**
