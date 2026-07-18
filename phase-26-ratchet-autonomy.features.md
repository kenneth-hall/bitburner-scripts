# Phase 26 — Ratchet autonomy: goals and supervision (features / brainstorm)

**Status:** brainstorm, opened 2026-07-18. Stage 1 of the three-stage workflow — decisions,
rejected alternatives, open questions. No spec yet, no code yet.

**Predecessor:** Phase 25 was **frozen** 2026-07-18 (`docs/phases/phase-25-faction-strategy.closeout.md`).
Its own defects are all closed. Everything below is what *couldn't* be closed there, because none
of it is a Phase 25 defect — each is a design question its spec never asked.

---

## The thesis

Phase 25 built an aug-ratchet that installs itself. Running it for three days produced **six
separate bugs that are all the same bug**:

> Code names a faction or an aug without being clear **which question it is answering** —
> *what do we buy* / *what are we waiting on* / *what should the work slot do* / *what unlocks a
> gate*.

| # | Instance | Fix that shipped |
|---|---|---|
| 1 | Horizon read the rep-met head → trigger was dead code | route through `pickWorkFaction` |
| 2 | `pickWorkFaction` skips passive factions → still dead | `pickHorizonGrind` |
| 3 | Dashboard showed head, not the worked faction | show both |
| 4 (gap 6) | NFG seller picked by catalog order, not rep | `pickNfgSeller` |
| 5 (gap 7) | "No faction owed rep" read as "don't arm" — a plateau mislabelled | arm on it |
| 6 (gap 9) | Head outranks the aug that unlocks the endgame — **live deadlock** | *unfixed* |

Fixes 1, 2 and 4 all widened *which* faction gets picked. **None asked what it means when the
right answer is "none" (5) or "something the scorer values at zero" (6).**

The root cause: **`score` is one number doing four jobs, and the engine has no representation of
what it is currently trying to achieve.** It always answers "which aug is worth the most stats,"
even when the actual question is "which aug gets us un-stuck."

The same absence explains the supervision gaps: nothing can detect "we stopped making progress"
because nothing knows what progress *was*.

**Phase 26 = give the ratchet (a) an explicit goal, and (b) a check that it's still achieving it.**

---

## Scope

Deliberately split, because these have different urgency and different failure modes if rushed.

### Track A — immediate, the live state is expiring

**A1. Gate-aware buying (gap 9). Blocking the BN1.3 clear right now.**

The engine cannot reach 30 distinct augs. `endgameHold` blocks arming → no spend-down → only the
*head* target is ever bought → head is NFG forever → NFG doesn't raise the distinct count → grind
998,737 rep → buy a level → repReq ×1.14 → repeat. Meanwhile **Wired Reflexes costs 1,250 rep and
$0.004b against $288t on hand**, and closes the gate instantly. The engine can't see it: it scores
0 on hacking.

Proposed rule (deliberately narrow):

> When a faction's `numAugmentations` requirement is the **only** unmet one, **and** no
> filter-passing aug is currently rep-met and affordable, buy the **cheapest** unowned rep-met aug
> regardless of filter status — one per pass, re-evaluating each time, until the count is met.
> N and the target both read live from `inviteReqs`.

**Why this shape** (each clause earns its place):
- *"No passing aug is buyable"* not *"only NFG left"* — the latter is **false today** (Embedded
  Netburner Module Analyze Engine is unowned and passing, just rep-blocked at 625k) yet we're
  still stuck. It under-fires in the exact case that motivated it.
- *Cheapest by money* — every purchase imposes the same ~1.9× tax on the rest of the cycle
  (`docs/neuroflux.md`), so price is the *only* differentiator between two count-fillers.
- *N and 30 from `inviteReqs`* — the engine already reads that structure for
  `daedalusInviteReserve`. Hardcoding 30 is the naive version Kenneth vetoed.
- *One per pass* — if rep crosses 625k mid-way, the normal pipeline takes the real aug and the
  gate rule simply stops firing. No "prefer useful augs" logic needed; it falls out.
- *Self-disabling* the moment the count is met.

**Why now, ahead of everything else:** the deadlock state (endgameHold on, count-blocked,
money-rich) occurs **once per node clear, at the very end.** After we clear we don't see it again
for a day-plus. Building it now means the first run is validated against the genuine article, the
way gap 7 and the L7 fire were. This is the *only* item whose cost goes up if we defer.

**Rejected: weight `company_rep` in `scoreAug`.** The request that surfaced all this. It admits 4
zero-hacking augs, **misses the actually-cheapest exit** (Wired Reflexes is a *combat* aug), and
permanently values a stat we never earn — we do faction work exclusively; company rep only matters
via megacorp invites, which need a company-work engine we don't have and which would compete for
the single shared player-action slot that currently grinds faction rep.

**Rejected: buy the aug by hand and move on.** It unblocks the clear but tests nothing, and the
state we'd need to build against is gone afterward. Closing this BN is explicitly secondary.

### Track B — design, deliberately NOT rushed

**B1. Supervision (gap 4). The actual prize.**

Companions launch once at `daemon.js:415-455`, before the loop at 626. Nothing monitors or
relaunches them, so any companion death is a **silent permanent stop**. `augfarmer.js` can't be
relaunched standalone either: the batcher pins free home RAM at 32 GB while it needs 64.1. Home
went 2 TB → 64 TB and free RAM went *down* — structural, so "buy more RAM" is not a fix. **Fix is
supervisor + `HOME_RESERVE_GB` bump together, or neither.**

**Hard requirement discovered by gap 7: it must watch *progress*, not processes.** The 25-hour
stall had every process alive and healthy the whole time. A supervisor checking liveness would
have reported all-green throughout. Gap 9 is the same signature again — healthy processes, zero
progress, indefinitely.

**B2. Stall-age detection (gap 7's follow-on).** Cheapest useful version of B1: in auto mode, if
time since `lastAugReset` exceeds some multiple of the observed cycle time with no install, say so
(dashboard or log). Catches the whole class *including causes not yet imagined* — it would have
caught gaps 7 **and** 9 without knowing either existed. Strong candidate for the first increment.

**B3. NFG rep as a planned expense (gap 8's strategy half).** NFG's rep requirement escalates
×1.14/level while rep resets to zero every install: 10k → 123k → 999k over three installs, on
roughly linear rep income. Money bound the tail through install #9, so this hasn't bitten yet —
but rep takes over as the binding constraint and then **shrinks the tail every cycle**, and the
tail is most of each cycle's gain (16 NFG levels vs 6 discrete augs at #9). Per-cycle gain decays
toward the discrete augs alone. Donation is the only rep lever that scales with our money surplus,
and nothing currently aims it at NFG. → `docs/neuroflux.md`.

**B4. The root-cause refactor.** Make the engine's current *goal* explicit, so selection can ask
"what serves the goal" instead of "what scores highest." Candidate goals: ratchet multipliers /
clear a faction gate / reach the endgame / recover post-install. A1 is a patch on the symptom; B4
is what would have prevented all six instances.

**Explicitly NOT in the window.** It doesn't need the live state, and shipping a selection-logic
refactor right before a day-long unattended run in a fresh node is how you land a subtle
regression you won't notice for hours.

---

## Relevant context a cold reader needs

- **The gate counts DISTINCT augs** (Phase 25 gap 3, closed 2026-07-18). NFG is one entry however
  many levels it holds. Settled by our own position — 29 distinct + ~50 NFG levels + every other
  Daedalus requirement met + **no invite**.
- **Every aug purchase taxes the rest of the cycle ~1.9×** (resets on install). Our measured NFG
  ladder 2.166 = 1.14 × 1.9 — NFG's level scaling riding a *global* purchase multiplier. 1 buy ≈
  0.8 NFG levels; 4 ≈ 3.3; 18 ≈ cycle destroyed. This is why the gate rule must be tightly gated
  and why it buys the cheapest, not the best.
- **Rep is a threshold, not a currency.** Buying an aug requires rep but does **not** deduct it.
  (I asserted the opposite earlier in the session and it made the gate-buy look far more expensive
  than it is. The real cost is money + the 1.9× tax, nothing else.)
- **`endgameHold` blocks arming** (`gainArmed` requires `!endgameHold`), which is *why* gap 9 is a
  permanent deadlock rather than a slow patch. Any gate-buy fix has to work in the grinding phase,
  not spend-down.
- **The allowlist is the current escape hatch and it doesn't scale.** `UTILITY_ALLOWLIST` exists
  because pure-utility augs read all-1.0 (`augcheck.js`'s documented caveat). CashRoot Starter Kit
  and The Red Pill were both added by name at Kenneth's ask — the Red Pill addition *deliberately
  reversed* the S2/S3 "drops by construction" property every prior phase preserved. Gap 9 is the
  proof that naming things one at a time isn't a model: nobody would have thought to allow-list
  Wired Reflexes.
- **Abort levers:** `ratchet-mode.txt` ≠ `auto`, or create `augfarmer-pause.txt`.

## Scope creep — named so it can be refused

- **`company_rep` in the filter** — the request that opened this. Reframed, then rejected (A1).
  The underlying need was real; the proposed mechanism would not have met it.
- **The megacorp-faction path** — company rep → megacorp invites → a much wider aug pool. Genuinely
  interesting given B3's rep decay, and genuinely a **new engine** (company work), which CLAUDE.md's
  standing constraint excludes. Park it; revive if B3's decay bites *and* donation proves
  insufficient.
- **Buying all 4 `company_rep` augs** — we need **one** aug, not four. 3.3 NFG levels vs 0.8.
- **Fixing the "stranded money" at spend-down** — an exponential ladder always strands up to one
  level's price. Settled in Phase 25: **do not "fix" this.**
- **Refactoring selection while the window is open** (B4) — the right idea at the wrong time.

## Open questions

1. **Does B2 (stall-age) subsume B1 (supervisor), or precede it?** It catches more classes for far
   less code, but can't *recover* — it only reports. Is "tell Kenneth" enough for now, or does
   unattended running require auto-recovery? (Bearing on the `HOME_RESERVE_GB` bump: a reporter
   doesn't need it; a relauncher does.)
2. **What is the goal model in B4, concretely?** An enum the controller sets? Derived from state
   each pass? The four jobs `score` conflates suggest at least: *acquire mults*, *clear a gate*,
   *bank rep*, *recover*. Needs a real design pass, not a guess here.
3. **Should A1 generalize past `endgameHold`?** Scoping it to the endgame keeps blast radius tiny
   and matches the only known case. A general "any faction gate" version is more principled and
   more likely to misfire in a fresh node's early game. Leaning narrow — YAGNI.
4. **Does B3 change install *timing*?** If NFG levels get rep-bound, the optimal cycle may be
   shorter (install sooner, re-earn cheaper early rep) rather than longer. That would move
   `MIN_TOTAL_GAIN` and `GRIND_HORIZON_MS`, both still provisional.
5. **Is the 1.9 purchase multiplier BitNode-dependent?** It's measured in BN1.2/1.3 only. If BN5
   or another node scales it, the gate rule's cost model shifts. Cheap to re-measure per node from
   the `projected`-vs-`amount` pair the gap-5 fix logs.

## Proposed sequence

1. Verify the gap-9 deadlock read against live behavior (traced through code; not yet watched fail).
2. Build + ship **A1**, validated against the live deadlock before it expires.
3. Let the clear proceed; **B2** next, since it would have caught both stalls that motivated it.
4. **B1** and **B3** as their own spec passes.
5. **B4** when there's no live state at risk — and revisit whether A1 should fold into it.
