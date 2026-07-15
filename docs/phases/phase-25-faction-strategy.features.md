# Phase 25 — Autonomous aug-ratchet / faction strategy (features · brainstorm)

**STATUS: brainstorm in progress (2026-07-14).** Feature-gathering stage — spec comes later.
Extends/replaces `augfarmer.js`'s naive "buy cheapest-rep-deficit aug" loop (Phase 23), and — new
as of this session — potentially **automates the whole buy→install→re-climb ratchet** now that
Kenneth has OK'd using `ns.singularity.installAugmentations()` (relaxes Phase 23's D11).

## Goal
Drive the BN1.2 clear faster and (optionally) unattended by making faction/aug/install decisions
principled instead of naive: maximize joined factions, buy the right multiplier augs, and time
installs to ratchet `mults.hacking` up to the hack-3000 backdoor gate with the least wall-clock and
least attention.

---

## THE CORE PUZZLE — the buy / install / grind-rep ratchet (read this first)

**Causal spine (agreed with Kenneth):**
`BN completion ← hack level ← hacking-mult augs installed ← faction rep (the gate).`

**Why it's a ratchet, not a one-shot.** `level = mult × (32·ln(exp) − 200)` (from
`reset-protocol.md`): **linear in the hacking-level mult, logarithmic in exp.** Raw exp grinding
tapers into a wall; the only lever that keeps raising the ceiling is `mults.hacking`. Installing
augments **resets level to 1 but keeps mult**, so you re-climb from 1 to a *higher* ceiling each
time. The clear is: buy mult augs → install → re-climb → repeat, until mult is high enough that
hack 3000 is reachable (mult must roughly **triple** from today's ~2.2).

**Why ~15-20 installs, not 4** (killing the old "4 installs" error, and its opposite — no magic
shortcut, Kenneth conceded 2026-07-14): discrete hacking-mult augs give big jumps but each faction
has a *finite* set; once bought, you're in the **NFG-only tail** where mult grows ~8%/cycle
(single data point: 3.55→3.83), rep+money capped. Tripling mult through that tail is inherently
many cycles. The install **count is the OUTPUT of the timing optimization**, and it lands ~15-20
regardless of cleverness (`project_bn1_install_reality`). The lever that actually *reduces* the
count is **aug selection** (mult-per-rep), not install timing.

**The install-timing trade (what the "trigger" really is):**
- Install **sooner** → lock in mult early; because mult **compounds**, every later re-climb and the
  batcher get faster. Bias is toward sooner (`reset-protocol.md`: "don't hoard levels").
- Install **later** → fewer re-climb overheads, but you grind at a lower mult for longer, *and*
  installing **tanks your rep rate** (rep scales with hacking level; level→1 until you re-climb) —
  so you never want to install mid-rep-grind.
- Net rule of thumb: **grind the reachable mult-aug rep while at high level → buy → install →
  re-climb → repeat.** The precise "how much to accumulate before installing" threshold is the one
  piece we can't set from first principles — see the open hole below.

**Two regimes (Kenneth's intuition, confirmed as real structure):**
1. **Early — discrete-aug regime:** simple grind→buy→install; big mult jumps, few cycles.
2. **Late — NFG-tail regime:** grind favor + NFG, and once a faction hits the donate threshold,
   **buy rep with cash (donation)** instead of grinding — the Daedalus endgame lever, generalized.

---

## Features (draft)

### F1 — Maximize factions joined, accounting for conflicts  *(Kenneth-requested)*
- Join **proactively** (every in-scope, invite-available faction), not reactively per target aug.
- **8 of 14 in-scope factions have no enemies** (4 hacking + Tian Di Hui + Daedalus/Covenant/
  Illuminati) → join freely.
- **Only the 6 cities conflict.** Camps (live graph): `{Aevum, Sector-12}`=2,
  `{Chongqing, New Tokyo, Ishima}`=3, `Volhaven`=loner.
- **DECIDED (Kenneth 2026-07-14): let aug access pick the city**, not raw membership count — the
  +1 stream from the 3-camp isn't worth losing a wanted aug's cheapest seller. Commit to a camp
  early (before an aug-need forces a bad one, as Aevum did this cycle).
- **Right-sized by testing (2026-07-14):** passive rep only accrues on the **4 backdoored hacking
  factions** (own their faction-server); city/endgame/Tian Di Hui give ~0 passive (favor is a
  *multiplier*, ×1.0 at favor 0 — it can't create a base gain). So broad joining is for **aug
  access + favor banking**, NOT free rep — the passive-rep case is already covered by the 4 we
  join via backdoor anyway.

### F2 — Mult-aware aug acquisition (replaces naive cheapest-rep-deficit buy)
- Sort by **hacking-mult-per-rep**, not cheapest rep: prioritize **`mults.hacking`** (the linear
  level lever) → **NFG** (lifts it) → **`faction_rep`** (compounds the whole rep loop); largely
  **drop** `hacking_money/speed/chance/grow`, charisma, company (≈0 toward hack level).
- **The 30-aug Daedalus gate is already met (33 installed)** → aug *count* buys nothing more; only
  mult does. This is the concrete change vs today's broad 10-key filter.
- Favor route: once a faction crosses `getFavorToDonate()` favor, **switch it to donation** for
  expensive augs. Never manufacture installs just to farm favor.

### F3 — Rep allocation (single active-work slot)
- Passive rep climbs the 4 backdoored hacking factions for free → spend the **one** active-work
  slot on factions passive won't cover in time (cities/endgame that sell a wanted mult aug).

### F4 — Autonomous ratchet controller (the install trigger + execution)  *(new — needs decision)*
- A controller runs the full cycle: acquire (F2) → spend-down (max home RAM/cores, finish buy-list)
  → **install** → let the existing re-bootstrap chain run → re-climb → repeat → hand off to the
  Daedalus endgame at hack 2500.
- **Install execution — two options to decide between:**
  - **(a) Full-auto:** call `ns.singularity.installAugmentations()`. Hands-off. **Hard requirement
    (Kenneth 2026-07-14): comprehensive per-install logging must be in place first** — he won't be
    around to watch, so the audit trail (augs bought, mult before/after, install fired, re-bootstrap
    + re-climb status) is non-negotiable. This is the *same* log as Slice 0's instrumentation.
  - **(b) Prep-and-notify:** automate everything up to the install click + auto spend-down, then
    ping Kenneth to click Install.
- **Game-state safety is NOT the gate (Kenneth 2026-07-14):** backups + save-editing exist, so a
  mis-timed install costs a wasted cycle, not anything unrecoverable. The reason to stage is **data**
  (validate the trigger), not fear of the reset.
- **Value framing (honest):** this makes the clear **hands-off, not faster** — same ~20 installs,
  same wall-clock, minus attention. Worth it *only* to the extent unattended matters.

---

## THE OPEN HOLE (must close before F4 ships)
The **numeric install trigger** ("how much to accumulate before installing") cannot be set from
first principles — needs **measured** mult-gain/cycle, rep-rate-vs-level, and re-climb wall-clock.
We have one data point. Building it from math alone = vibes-with-equations (the failure mode we're
avoiding).

**Closing plan — staged rollout (a DATA gate, not a safety gate — see F4):**
- **SLICE 0 — instrumentation, ship NOW (in parallel with the spec, Kenneth 2026-07-14):** a minimal
  per-install-cycle summary logger. augfarmer already detects the boundary (`lastAugReset` change),
  so on each boundary snapshot: hack level+exp, `mults.hacking` (before → next-cycle's after), augs
  bought, NFG level, per-faction rep+favor, money. Re-climb curve is derivable from the daemon's
  existing `hackProgress` series. **Rationale: install data compounds and can't be back-filled** —
  start the clock before the next install. This same log is F4(a)'s required auto-install audit trail.
- **Stage 1 — observe/recommend mode:** controller runs the full loop but **logs "would install
  now"** instead of installing, using Slice 0's data to validate the trigger.
- **Stage 2 — autonomous (or notify) mode:** flip to real install once the trigger's proven, behind
  preconditions. Full-auto (a) vs notify (b) decided *after* observe mode shows how painful the
  manual clicks are.

## Decisions / governance
- **D11 (Phase 23) relaxed:** Kenneth authorized `installAugmentations()` this session — auto-install
  moves from "never" to "allowed behind guards + staged rollout." This reverses a prior hard rail;
  flag prominently in the spec.
- Spend-down pattern + install-API usage = small mechanics, not blockers (Kenneth 2026-07-14).

## Non-goals (draft)
- Reducing the rep TAX itself (needs gang/sleeves — node-locked). This phase reduces *attention* and
  *wall-clock-per-cycle*, not the fundamental grind.
- A heavyweight predictive optimizer — prefer the simplest data-validated heuristic (proportion:
  uptime is ~2×, trigger tuning ~1.1×).

## Open questions parked
- Full-auto vs prep-and-notify install (decide after observe mode).
- Exact mult-per-rep ranking + whether any non-`hacking` aug earns its slot (e.g. `faction_rep`).

## Decided-parked
- **Endgame handoff automation (Daedalus donate → Red Pill → backdoor WD): OUT of Phase 25**
  (Kenneth 2026-07-14) — its own chunk, and we're not ready to test it. Phase 25 hands off *to* the
  existing manual endgame runbook at hack 2500.
