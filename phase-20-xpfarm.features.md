# Phase 20 — XP farm (turn the idle fleet into hacking XP)

**Stage:** Brainstorm (opus). Output is decisions + rejected alternatives + open questions for the
spec stage. A throwaway prototype (`src/xpfarm.js`) has been run live to settle the core mechanics —
its result reshaped this doc (see "What the prototype proved"). Nothing production is built.

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

**Saturate the fleet with the *fastest* exp-granting operation on the highest-difficulty target(s),
holding those targets at minimum security — and abandon money entirely for the duration.**

Reasoning from the mechanics:

- exp per op ∝ the server's base difficulty (same for hack/grow/weaken on a given server) → prefer
  **high-difficulty targets**.
- exp/sec/thread = exp-per-op ÷ op-time, and **hack is the shortest op** (hack 1× < grow 3.2× <
  weaken 4×) → prefer **hack**.
- op-time shrinks at **minimum security** (and hackChance is highest there) → keep the target at min
  sec with a small weaken allocation; hack raises security +0.002/thread, weaken lowers it
  −0.05/thread, so a fraction of threads must be weaken to hold the line.
- **money is irrelevant**, so there is no prep-to-max-money and no HWGW landing-order timing. Each
  hack independently grants exp on completion; we don't care what it steals or that it drains the
  server. **This makes the XP engine simpler than the money batcher, not a variant of it.**

Net shape: pick the best target(s), spend a minority of threads on weaken to pin min security, and
throw the rest of the fleet at hack. Fire-and-forget workers (reuse `hack.js`/`weaken.js`); no batch
interleaving.

## Key decisions (proposed, for spec confirmation)

1. **Abandon money optimization for the duration.** Money is dead; optimizing for it is what leaves
   the fleet idle. The XP engine targets exp/sec only. (The money batcher can keep trickling on a
   small reserve, or be turned off entirely — see open questions.)
2. **Dedicated XP engine, not a money-batcher objective-swap.** Evolve the prototype into a small
   standalone saturator rather than re-scoring `daemon.js`. The batcher's complexity (HWGW timing,
   prep, money tracking) is exactly what an XP engine *doesn't* need, and swapping its objective risks
   a proven system. Isolation (CLAUDE.md) + simplicity both favor a companion.
3. **Hack-heavy, pending one verification.** Hack is the highest exp/sec/thread op *if* it still
   grants full exp once the server's money is drained — the critical open question below. If it
   doesn't, fall back to grow-based saturation (grow always completes on a moneyed server; 3.2× time).
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

1. **CRITICAL — does hack grant full exp when the server's money is drained (and on failed hacks)?**
   Decides everything: if yes, pure hack-saturation works and money drains harmlessly; if no, we need
   grow to keep money present (toward a grow+weaken saturator). Cheap to test with the prototype
   (point it at hack, watch exp/sec as the target drains). This is the first thing the spec should
   settle empirically.
2. **Hack/weaken ratio to hold minimum security, and the per-target thread ceiling.** hack +0.002,
   weaken −0.05, weaken 4× slower → roughly ~15–20% of a target's threads must be weaken to hold min
   sec. Above some hack rate a single server's security outruns the weaken hold and hackTime balloons
   (self-defeating). So: what split holds the line, and how many threads can one target absorb before
   it saturates?
3. **Single best target vs spread across the top-N.** Concentrating on the highest-difficulty server
   maximizes exp/thread but hits the per-target security ceiling (#2) and one server's op-time sets
   the whole cadence. Spreading across several high-difficulty targets diversifies cadence and spreads
   the weaken-hold load. Likely multi-target; confirm the N and the selection/re-selection cadence as
   level climbs.
4. **Architecture confirm: dedicated companion vs daemon-integrated.** Leaning dedicated (decision 2),
   but the companion must discover hosts + free RAM itself (the prototype already does, via
   `listHosts`) and decide how it coexists with the money batcher's RAM claims.
5. **Money batcher: leave running on a reserve, or turn off for the duration?** Off → 100% of the
   fleet to XP and no target contention; on → trickle income + keeps some servers prepped, at the cost
   of a coexistence reserve. Money being dead argues for off; simplest to decide once #1 is known.
6. **exp/sec scaling ceiling.** The 4–6× target assumes the fleet's hack throughput isn't capped by a
   per-server thread/security wall (#2) or a client-side limit at ~10 M+ threads. Measure the real
   multiple; it may be target-count-bound rather than RAM-bound.
7. **Auto-disable at 2500?** Goal-specific tool — auto-off at level 2500 vs manual `xp-off.txt`.

## Ship gate

The justification is a *measured* throughput gain, so this ships only after: `npm test` green, and a
**live run showing exp/sec rose by the claimed multiple** in `hacking-progress-log.json`. The
prototype's live measurements (weaken baseline, and the hack-exp-on-drained-money test in open-Q1) are
the design inputs the spec builds on.
