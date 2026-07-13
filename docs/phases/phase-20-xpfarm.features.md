# Phase 20 — XP farm (turn the idle fleet into hacking XP)

**Stage:** Brainstorm (opus). Output is decisions + rejected alternatives + open questions for the
spec stage. A throwaway prototype (`src/xpfarm.js`) has been run live to settle the core mechanics —
its result reshaped this doc (see "What the prototype proved"). Nothing production is built.

> **Status update (2026-07-12, pre-implementation — read before the body).** This doc's
> snapshot-in-time framing is stale in three ways; the decisions themselves stand. (1) The BitNode
> was destroyed and re-entered — we are now **early in BN1.2**, so "the 2500 gate" / "idle
> endgame fleet" context below describes the *old* node; the phase now ships in exactly the
> fresh-node coexistence regime the scope shift anticipated, and the shelving trigger ("a fresh
> node's XP re-climb becomes the binding constraint") has fired. (2) The **weaken prototype is no
> longer running** (node destruction killed all processes; `src/xpfarm.js` remains as a dormant
> file) — decision 5's "keep it running until the engine ships" is moot, and its 1.4× stopgap
> baseline is historical. (3) **SF4/Singularity is now available** (Phase 21 save-grant) — this
> changes nothing here (the engine is deliberately Singularity-free), noted only so the doc's
> implicit no-Singularity backdrop isn't read as still-binding context. Live-validation deltas are
> threaded through the spec (`phase-20-xpfarm.spec.md`, regime update in its Context section).

## Why this phase exists (the goal check)

Sole current goal: **hacking skill ≥ 2500** (the last Daedalus gate). Measured 2026-07-11 post-install:

- Skill-mult (`mults.hacking`) 4.721 sets the wall at **~7.97 B exp** to reach 2500.
- **The fleet is almost entirely idle.** After `share-off.txt`, snapshots read ~2% utilization,
  ~22.9 PB free of a ~26.5 PB fleet. The money batcher structurally cannot fill this fleet — at this
  size, profitable money-work is a rounding error against capacity, and **money is a dead resource**
  (>$40 T, ~400× the $100 B gate).

So the binding constraint on the 2500 ETA is **throughput**, and ~98% of the throughput capacity is
unused. This phase converts that capacity into hacking XP.

**This reverses the backlog's standing "do not build XP-max mode" verdict — deliberately.** That was
correct against the pre-install ~5,300 h multiplier wall (throughput was a rounding error vs the
multiplier). The install collapsed the wall ~170×; the multiplier lever is now spent (resets don't
amortize this close to the gate — see rejected alternatives), ETA scales *linearly* with exp/sec, and
the fleet is idle. Different regime, opposite conclusion.

**Scope shift (2026-07-11): this ships as a durable BN2+ tool, not a 2500 sprint.** The weaken
prototype is already closing the current 2500 gate (~3 h ETA and falling) — faster than this phase
could ship, so the *immediate* payoff is gone. What justifies building it is the **next re-climb**:
every future BitNode (post-Red-Pill, and each after) resets hacking to 1 and re-earns the level grind
from scratch, so a reusable "surplus RAM → hacking XP" layer pays off on every node. **This reframes
the premise:** in a fresh node money is *not* dead and the fleet is *not* idle, so the engine must
**coexist with an active money economy** rather than seize the whole fleet (see Core approach).

## What the prototype proved (2026-07-11) — the pivot

The first instinct was "fill idle RAM with `weaken` (coexistence-safe) on the highest-difficulty
server." The prototype did exactly that and was measured live:

- Fleet utilization **3.4% → 95%** (a 5% reserve for the batcher held cleanly), yet exp/sec only
  **~194 k → ~270 k (~1.4×)** — *not* the projected 4–6×.

The lesson that reshapes the design: **XP is granted per operation *completion*, not per GB
occupied.** Weaken is the *slowest* op (4× hack time), so filling 91% of the fleet with weakens on a
high-req server buys a huge in-flight pile that completes rarely. The batcher's ~3.5% of the fleet
out-produces the farm's ~91% because tight HWGW cycles on *prepped* targets complete constantly — the
batcher is **~50–60× more exp-efficient per GB.**

**⇒ "occupy idle RAM" is the wrong objective. "Maximize completions/sec of the highest-exp op" is the
right one.** The prototype stays running as a stopgap (its 1.4× is a free ~3.5 h off the ETA), but the
production design below is a different architecture.

## Core approach

**Opportunistically fill the fleet's *surplus* RAM — whatever the money batcher leaves free — by
saturating the highest-difficulty target(s) with the *fastest* exp op (hack), holding those targets at
minimum security.** The money batcher keeps first claim; the XP engine takes only the surplus. This
one rule self-scales across a node's whole life: near-zero XP farming early (a small fleet is fully
spent on money), dominant late (the fleet outgrows money needs — today's ~98%-idle endgame). No mode
switch, no "money is dead" assumption baked in — the batcher's own RAM appetite decides the split.

Reasoning from the mechanics:

- exp per op ∝ the server's base difficulty (same for hack/grow/weaken on a given server) → prefer
  **high-difficulty targets**.
- exp/sec/thread = exp-per-op ÷ op-time, and **hack is the shortest op** (hack 1× < grow 3.2× <
  weaken 4×) → prefer **hack**.
- op-time shrinks at **minimum security** (and hackChance is highest there) → keep the target at min
  sec with a small weaken allocation; hack raises security +0.002/thread, weaken lowers it
  −0.05/thread, so a fraction of threads must be weaken to hold the line.
- **the XP engine itself ignores money** — the money batcher owns the economy; the engine only spends
  *surplus* RAM, so there's no prep-to-max-money and no HWGW landing-order timing *inside the engine*.
  Each hack independently grants exp on completion; it doesn't matter what it steals or that it drains
  a surplus-RAM target. **This makes the XP engine simpler than the money batcher, not a variant of
  it** — and lets it ride on top of an active economy in a fresh node instead of replacing it.

Net shape: pick the best target(s), spend a minority of threads on weaken to pin min security, and
throw the rest of the *surplus* RAM at hack. Fire-and-forget workers (reuse `hack.js`/`weaken.js`); no
batch interleaving.

## Key decisions (proposed, for spec confirmation)

1. **Coexist with the money batcher; take only surplus RAM (DECIDED — was "abandon money").** The
   money batcher keeps first claim on the fleet each cycle; the XP engine fills whatever it leaves free
   (down to a small reserve). This self-scales across a node's life and works in a fresh BitNode where
   money still matters — no "money is dead" assumption baked in. (Replaces the endgame-only "abandon
   money / take the whole fleet" framing, which was correct only for today's idle-fleet state.)
2. **Dedicated XP engine, not a money-batcher objective-swap.** Evolve the prototype into a small
   standalone saturator rather than re-scoring `daemon.js`. The batcher's complexity (HWGW timing,
   prep, money tracking) is exactly what an XP engine *doesn't* need, and swapping its objective risks
   a proven system. Isolation (CLAUDE.md) + simplicity both favor a companion.
3. **Hack-heavy — VERIFIED (open-Q1, `xpprobe.js`).** Hack exp is money-independent, so hack (the
   fastest op) saturates surplus RAM and its targets' money drains harmlessly. No grow needed.
4. **Reuse existing workers** (`hack.js`, `weaken.js`) — no new worker files/RAM.
5. **Keep the weaken prototype running until the hack engine ships** (free 1.4% stopgap), then retire
   it.
6. **Toggle + goal-scoping via `xp-off.txt`** (mirrors `share-off.txt`); open question on auto-off at
   2500.
7. **Instrument exp/sec** — the justification *is* a measured throughput gain, so the engine must log
   its rate (snapshot `xpPool` field parallel to `sharePool`, plus the existing
   `hacking-progress-log.json`). Live measurement is the ship gate.

## Rejected alternatives

- **Weaken-fill the idle RAM (the prototype).** Measured ~1.4× — the slowest op, so RAM-heavy but
  completion-poor. Rejected *as the architecture*; kept running only as a zero-cost stopgap until the
  hack engine replaces it.
- **Re-score the money batcher for exp/sec (objective-swap `daemon.js`).** Reuses timing/prep
  machinery the XP engine doesn't need and risks destabilizing proven money code. A viable fallback if
  a dedicated engine can't reach the batcher's per-GB efficiency, but not the first choice.
- **Neuregen Gene Modification (+40% hacking exp) / any aug reset.** An *exp-mult* lever (×1.40),
  smaller than this phase, and it only applies on **install** — forcing a reset that wipes the fleet
  the engine runs on. Buying it without resetting is dead money (lost on BitNode exit). Rejected.
- **More NFG install cycles.** Strongest lever *in principle*, but post-reset rep is zero and ~15 NFG
  levels need millions of re-grinded rep plus a hacking re-climb — tens of hours to save ~28. Reset
  cycles only amortize far from the gate; we've crossed the break-even. Rejected.
- **Home-core optimization (Phase 17).** ~1% at 2 cores, only meaningful at 8–16, only for home's
  slice. Negligible. Out of scope.

## Open questions (resolve at spec / by measurement)

1. **~~CRITICAL — does hack grant full exp when money is drained?~~ ANSWERED (2026-07-11, `xpprobe.js`
   via Formulas.exe).** `hackExp(fulcrumassets)` = **162.59 at full money === 162.59 at zero money**
   (money-independent), and it doesn't track current security either — hack exp is a flat per-server
   constant (base difficulty). **⇒ pure hack-saturation is viable: money drains harmlessly, exp keeps
   flowing at full rate, no grow needed.** The engine is hack + a weaken-hold, full stop.
2. **Hack/weaken ratio to hold min security + per-target thread ceiling. Partially answered.** Probe
   (Formulas): `hackTime` = **152.5 s at min sec vs 456.2 s at current sec (3× faster at min)** — since
   exp/op is constant, holding min sec ~triples exp/sec, so the weaken allocation is for *speed*, not
   exp. Analytic hold ratio: hack +0.002/thread, weaken −0.05/thread at 4× duration → steady-state
   balance ≈ **84% hack / 16% weaken**, independent of absolute scale. **Still needs a LIVE test:** the
   *equilibrium* security a fire-and-forget (untimed) hack+weaken mix actually settles at — if lands
   arrive jumbled, security can hover above min and erode the 3× speed. That, plus hackChance (74.8% at
   min sec on fulcrumassets — confirm failed hacks still grant exp), is **deferred to implementation's
   first validation step** — it's tuning, not a fork (Q1 was the fork), so it doesn't block the spec.
3. **Single best target vs spread across the top-N.** Concentrating on the highest-difficulty server
   maximizes exp/thread but hits the per-target security ceiling (#2) and one server's op-time sets
   the whole cadence. Spreading across several high-difficulty targets diversifies cadence and spreads
   the weaken-hold load. Likely multi-target; confirm the N and the re-selection cadence during
   implementation validation (couples to #2's equilibrium result).
4. **~~Architecture: companion vs daemon-integrated?~~ DECIDED — dedicated companion.** Evolve the
   prototype; discovers hosts + free RAM via `listHosts` (already does). Rationale in decision 2.
5. **~~Batcher off, or on with a reserve?~~ DECIDED — on, coexist; XP takes surplus only.** The BN2+
   scope settles this: money isn't dead in a fresh node, so the engine must ride on top of an active
   batcher (decision 1), not turn it off. Endgame idle-fleet just makes "surplus" ≈ the whole fleet.
6. **exp/sec scaling ceiling (deferred to impl validation, with #2).** Whether throughput is
   RAM-bound or target/security-bound sets the real multiple — measured with #2, not guessed now.
7. **~~Auto-disable at 2500?~~ DECIDED — manual `xp-off.txt` only.** No auto-off: it's a per-node
   reusable tool now (not a one-shot 2500 sprint), and it self-suppresses in a busy fleet anyway
   (no surplus → no farming). A manual toggle mirroring `share-off.txt` is enough.

## Ship gate

The justification is a *measured* throughput gain, so this ships only after: `npm test` green, and a
**live run showing exp/sec rose by the claimed multiple** in `hacking-progress-log.json`. The
prototype's live measurements (weaken baseline, and the hack-exp-on-drained-money test in open-Q1) are
the design inputs the spec builds on.
