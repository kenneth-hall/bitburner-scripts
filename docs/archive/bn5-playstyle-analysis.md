# BN5.1 playstyle decision — gang, batcher, or mixed?

**RECOMMENDATION: Batcher-primary. Do NOT pay the −54,000 karma cost now. (~75–80% confidence.)**
BN5 is a batcher node the existing aug-ratchet toolchain has effectively already beaten (BN1's gate
at M≈6.5 vs BN5's M≈8.5–9.7, same 100% max-money economy), while the gang's two BN2 superpowers —
free Red Pill and a ~full catalog — are both stripped outside BN2. Arm one cheap tripwire (below)
that flips this to "build the gang mid-node" if the 15%-steal economy bites harder than modeled.

**Crossover condition (the checkable flip):** at **+72h in-node or end of the first install cycle**
(whichever is later), read smoothed batcher income from `goal-state`/`moneysources.js`. If sustained
income **< ~$15M/s** AND projected remaining spend ≥ **$2t** (i.e. >1.5 days of income at that rate),
the gang flips to worth building — at that income level a mature gang (~$5–9M/s, install-immune) is a
≥30% boost and its ~1–2-day karma cost amortizes over the (now-long) node. Independent second
trigger: any re-forecast putting node clear **beyond ~3 weeks**. Above $15M/s, the gang never
exceeds ~1/3 of income and the recommendation holds.

Analysis date 2026-07-23, fresh BN5.1 entry (live read: **$535, hacking 54, all combat stats 1**).

---

## 1. The load-bearing premise, verified — with two cracks

Kenneth's hypothesis: *gangs persist across installs, so a gang makes the repeated install grind
cheap, then buy The Red Pill that way.*

**What's TRUE (verified):**
- **Gang survives installs.** In-game gang doc via `docs/gang-engine.md` §3: "Install-immunity. Gang
  and member stats do not reset on aug install — the one asset that survives the install ratchet."
  Live-validated in BN2 across ~20 installs (soak 2026-07-22: ascension mults net-positive 41.9→93.1
  at ~1 install/20h; income $8.7M/s steady through them).
- Members, respect ledger (~18m banked survived every BN2 install), equipment, ascension multipliers:
  all survive installs. (Equipment resets on *ascension*, not install.)
- **Karma is a per-node one-time cost** — believed to survive installs (vanilla behavior; fork
  unverified, see §7), so the grind is paid once per node.

**What's FALSE or degraded (the cracks):**
1. **Gang-faction rep does NOT survive an install.** Live-measured at the BN2 gate read
   (`gang-engine.md` §1 GP1): NiteSec 21.5m → 3.8m across the install boundary. It *self-heals*
   passively from banked respect, so it's a delay, not a loss — but "faction rep from respect
   survives" as stated in the hypothesis is wrong.
2. **Installs actively tax the gang:** member hack ascension mult ×0.9747 per install, flat
   (`gang-engine.md` §3 resolved Q1) — ~40% of hack ascension mult gone over 20 installs unless
   ≥×1.5 ascensions outpace ~1 per 16 installs.
3. **The Red Pill purchase route is BN2-only — the hypothesis's payoff step dies here.** In-game
   gang doc, quoted in `gang-engine.md` §6: gangs in other BitNodes "will offer more Augmentations
   than other Factions, but **they will not be a way to destroy the BitNode alone**." A BN5 gang
   sells no Red Pill. The clear route is the standard Daedalus endgame (§4) regardless of gang.

So the surviving version of the hypothesis is only: *"a gang is an install-immune ~$5–9M/s income
stream plus a rep-free partial catalog."* That's what §5 prices — and it loses to the batcher here.

## 2. The karma grind, priced for a literally untrained player

Gate: karma ≤ −54,000 (`markdown/bitburner.gang.creategang.md`: "Outside BitNode 2, your karma must
be less than or equal to 54000" — sign quirk already logged in `gang-engine.md` §7). Live state:
**all combat stats 1**, crime mult from SF2.1 = +24% success.

Crime numbers below are **vanilla values, unverified in this fork** (`markdown/` exposes the
`CrimeStats` type — karma/time/weights fields exist — but not the constants; a 2-min read-only
`getCrimeStats`/`getCrimeChance` probe discharges this, see §7):

| Crime | Time | Karma | Karma/s @100% | Success weights |
|---|---|---|---|---|
| **Homicide** | 3s | −3 | **1.0** | str 2, def 2, dex 0.5, agi 0.5, difficulty 1 |
| Mug | 4s | −0.25 | 0.0625 | str/dex 1.5, def/agi 0.5 |
| Assassination | 300s | −10 | 0.033 | — |

Homicide dominates everything by ≥16× — the optimal crime is not in question. Success chance
(vanilla form) ≈ `Σ(weight×stat)/975/difficulty × 1.24 (SF2.1)`:

| Combat stats (each) | Homicide success | Karma/s (= 3p/3s) | −54,000 from here |
|---|---|---|---|
| 1 (now) | ~0.6% | 0.006 | ~100 days — non-starter |
| 40 | ~25% | 0.25 | 60h |
| 80 | ~51% | 0.51 | 29h |
| 157+ | 100% (cap) | 1.0 | 15h (floor) |

**Training is mandatory and must be priced separately** (per the corrected briefing): combat ~80
needs ~5,800 exp/stat ≈ 23k total at 1× mults (pure-hacker: no combat aug mults). Via Powerhouse
Gym (we land in Sector-12) and/or homicide's own exp on the way up: **~2–6h**. Note homicide
karma/s at even p=0.07 already beats Mug at p=1.0, so the grind switches to Homicide almost
immediately; the training phase mostly overlaps the early grind.

**Total: ~24–36h of continuous player-action-slot occupation; call it 1–2 days, worst case 3**
(fork constants, whether failed crimes grant exp — both unverified). Money cost ~nil (gym fees
trivial; homicide even pays ~$45k×0.5 per success).

**Automation:** yes — `ns.singularity.commitCrime` (5 GB at SF4.3), loop script, no batcher
conflict (scripts don't use the slot). But it **does** seize the single player action slot,
cancelling `augfarmer.js`'s `workForFaction` (`src/augfarmer.js:2653`) — and augfarmer re-asserts
work every poll, so a karma mode needs a suppression flag in augfarmer. Small but real new dev
(~half day), against §5's "the engine is free" framing.

## 3. What a BN5 gang actually sells

- **No Red Pill** (§1 crack 3). Red Pill route in BN5 = Daedalus: 30 augs / $100b / hacking 2500 →
  2.5m rep → **the donation shortcut fully applies** (BN5 has no faction-rep or favor nerfs;
  `docs/reputation-favor.md`: 462.5k rep → 150 favor → ~$1.47t buys 2.5m rep). This is the exact
  BN1 runbook the ratchet already automates end-to-end.
- **Gang Unique Augmentations 50%** (`docs/bitnodes.md` BN5 panel) — the BN2 miracle was 98/99 augs;
  a BN5 gang faction gets **~half the unique catalog**, composition unknown (which half matters a
  lot for hacking mults and is unverifiable pre-creation).
- What a gang *would* still deliver: respect→rep auto-saturation for that partial catalog, and
  install-immune income. But BN5's regular factions are un-nerfed (work rep 100%, passive rep
  normal), so `augfarmer.js`'s join/work/donate path covers the full catalog anyway — the gang's
  rep bypass solves a problem BN5 doesn't have. **In BN2 the gang was the designed counter to
  0% passive rep / 50% work rep / 8% max money. BN5 nerfs none of those.**

## 4. The node shape: what BN5 actually demands

- **Gate 4,500** — 150% × 3,000. BN2's live gate read (15,000 = 500% × 3,000, `gatewatch.js`)
  **validated the linear WD-difficulty model**, upgrading 4,500 from ~85% inference to ~95%+.
- **M needed ≈ 8.5–9.7** (level = M × (32·ln(exp+534.6) − 200), hacking-level mult 100% so no
  BN2-style 0.8 haircut; M 9.73 at 9.7e8 exp, 8.4 at 1e10). We start at **M = 1.28** (SF1.3;
  augs wiped on hard reset) → need ~×7 from discrete augs + NFG. BN1's ratchet did 1.16 → 10.077
  in ~2–3 days of installs in a full economy.
- **Money is the binding constraint** (per `bitnodes.md` BN5 clearing notes, confirmed shape):
  steal 15% × aug cost 200% ≈ **~13× worse aug-buying power than BN1**. Rough node budget:
  ~$0.3–0.8t discrete augs + NFG tail (200% prices) + **~$1.5–2t Daedalus donation** + fleet
  ≈ **$2–4t total**.
- Exp 50% + starting security 200% slow the early ramp and every post-install re-climb (BN1's
  ~2-min re-climbs likely become 1–4h mid-node here) — troughs are wider than BN1's. Expect the
  ratchet's usual many-small-installs cadence (~8–12), not literally "2–3 installs"; the
  `bitnodes.md` "2–3 install-cycle" budget reads best as 2–3 *Daedalus-endgame* cycles.
- Timeline: **~1.5–3 weeks** (vs BN1.3's ~3 days; the ÷13 money throttle is most of the gap).

## 5. Income comparison and install-cycle economics

Reference points (all measured): BN1.2 batcher accumulated $1.745q pre-install (~$5G/s-order
average at maturity, 100% steal/money); BN2 gang steady **$8.7–9.3M/s** (oscillating $5–25M/s);
BN2 batcher ~4–6% of income (~$0.4–1M/s at 8% max money). BN5 batcher ≈ BN1-equivalent × 0.15:

| Node phase | Batcher (est.) | Mature gang | Gang share |
|---|---|---|---|
| Day 1–2 (bootstrap, M≈1.3) | $0.5–5M/s | **doesn't exist** (karma grind runs d1–2) | — |
| Day 3–7 (M≈3–6, mid fleet) | $20–150M/s | ramping $0.5–5M/s (12 members takes days) | ≤10% |
| Late node (M≈8–10, lvl ~4,500) | $0.3–1.5G/s | $5–9M/s (plateau w/o territory) | **~1–2%** |

(BN5 gang income assumes Crime Money 50% does *not* apply to gang tasks — GangSoftcap is the gang
lever and BN5's is baseline. If Crime Money does apply, gang is ~$2.5–4.5M/s and everything below
strengthens.)

**The ordering problem is fatal to the hypothesis's best case.** The gang's payoff window is the
day-1–4 trough — exactly when it *cannot exist*: the karma grind is slowest at stats 1, takes
1–2 days, and the gang then ramps from 3 members for another 2–4 days. By gang maturity (~day 5–7)
the batcher is already 10–30× the gang and compounding. The windows don't overlap.

**Per-install carry (the honest steel-man):** each install zeroes money + fleet + level; a gang
sails through at full rate. Value ≈ gang rate × trough ≈ $5M/s × 2–4h ≈ **$36–72b/install**, ~$0.3–0.6t
over ~8–12 installs — real, but ~10–20% of one node budget, bought with 1–2 days of the player
slot **taken from the early faction-rep path, which is serial** (early discrete augs gate the first
ratchet cycles; money is parallel, rep is not). And the gang can't fund the endgame it was
hypothesized to buy: **$1.47t donation at $9M/s = ~45 hours; the late-node batcher does it in
~0.5–1.5h.**

**Crossover arithmetic:** karma cost ≈ 1–2 days slot + ~0.5 day dev. Gang pays back only where its
$5–9M/s is a material fraction of total income for the node's remaining life — i.e. batcher
sustained <$15–20M/s (≥30% boost, breakeven vs cost in ~2–4 days) or node life >~3 weeks. Hence the
tripwire at the top. The only world where a gang *beats* the BN5 batcher outright is a
territory-maxed one (~territory^2.5, ~124× → $0.6G/s-class) — a ≥1–2-week war build (`gang-engine.md`
§6) that's slower than the node and was already deferred once on exactly that logic.

## 6. What contradicts / updates existing docs (call-outs)

1. **`CLAUDE.md` current-goal block is stale**: still "IN BN2.1", BN2 tripwire table, "NEXT ACTION:
   decide what comes after BN1.3". BN2.1 cleared 2026-07-23 (`docs/gang-engine.md` §1); we are in
   BN5.1. Needs its keep-current edit.
2. **`docs/bitnodes.md:8-10`** ("`getBitNodeMultipliers` requires BN5 or SF5 — we have neither") is
   now false: we are *in* BN5, the API is live **right now**. First-day probe should dump it and
   retire the hand-read caveats for this node.
3. **`docs/bitnodes.md` ~lines 364–370** still calls the WD gate model "an INFERENCE... neither the
   base constant (3000) nor linearity is stated". BN2's live 15,000 read confirmed 500%×3,000 —
   linearity now has a measured point; BN5's 4,500 deserves the confidence upgrade in the doc.
4. **Briefing corrections** (for the record): gang-faction rep does NOT survive installs (it
   self-heals from respect — §1); the briefed combat stats (5/4/7/4) were end-of-BN2 values, live
   read is all 1s; `docs/archive/bn2-gang-type-analysis.md:93`'s "below the batcher" income claim
   was already corrected by `gang-engine.md` §4 (gang was 94–96% of BN2 income) — don't re-inherit it.

## 7. What I could not verify (assumptions on the table)

- **Fork crime constants** (karma/time/weights per crime, the 975 success divisor, whether failed
  crimes grant exp, focus penalty scope). Vanilla values used. **First-day read-only probe**
  (`getCrimeStats`/`getCrimeChance`/`getPlayer().karma` → log file) settles all of it in minutes.
- **Karma survives soft resets in this fork** (vanilla: yes; resets only on node entry). Cheap
  check: `ns.getPlayer().karma` before/after the first install. If it *doesn't* survive, the grind
  must complete within one cycle — inconvenient, not fatal.
- **Which factions allow `createGang` in BN5** (NiteSec confirmed empirically in BN2 only;
  assumed node-independent). `createGang` returning `false` is a safe probe — but only at −54k karma.
- **GangUniqueAugs 50% composition** — which half of the catalog a BN5 gang would sell. Unknowable
  pre-creation.
- **Whether Crime Money 50% touches gang task money** (assumed no — GangSoftcap governs).
- **BN5 Daedalus augs requirement = 30** (panel listed none → default assumed; `fl1ght.exe` or the
  now-live `getBitNodeMultipliers()` confirms).
- **All batcher income projections** are order-of-magnitude scalings from BN1/BN2 measurements, not
  BN5 measurements — which is exactly why the recommendation ships with a measured tripwire instead
  of standing unconditionally.

## 8. Next actions implied

1. Let `bootstrap.js`/the ratchet run BN5 exactly as BN1 (it is the reusable asset; `gangmanager.js`
   already no-ops cleanly without a gang — `src/gangmanager.js:458`).
2. Day-1 read-only probe: `getBitNodeMultipliers()` + crime table + karma → `logs/` (discharges
   most of §7; pre-authorized recon).
3. Arm the §0 tripwire at +72h / first install cycle: batcher income < $15M/s with ≥$2t to go, or
   forecast >3 weeks → open a karma-grind phase (crime loop companion + augfarmer slot-arbitration
   flag) and build the gang then. Karma is grindable mid-node with zero loss — deferring the
   decision costs nothing, which is itself a reason not to pre-pay it.
