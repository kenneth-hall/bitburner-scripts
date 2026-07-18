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

## Current game state (2026-07-18 07:22, install #9 + ~75 min)

The state Track A must be built against — it expires when we clear.

| | |
|---|---|
| BitNode | **BN1.3** · `mode: auto` · `phase: grinding` · **`endgameHold: true`** |
| Hacking | **4,435** (Daedalus needs 2,500 ✓) |
| Money | **$1,571t** (needs $100b ✓) |
| Distinct augs | **29 / 30** ✗ — *the only unmet requirement* |
| Queued | 1 (an NFG level — **does not raise the distinct count**) |
| Mults | hacking **8.376** · hacking_exp **12.351** · faction_rep **3.011** |
| NFG | level 2, `cappedThisCycle: true`, repReq **1,138,560**, next level **$3.24b** |
| Trigger | `armed: false`, `gainArmed: false`, totalGain 1.020 — cannot arm under `endgameHold` |

Faction rep / favor: Chongqing 1,357,600 / 187.4 · BitRunners 168,054 / 256.9 · The Black Hand
132,506 / 181.4 · CyberSec 131,546 / 179.4 · Tian Di Hui 126,787 / 167.9 · NiteSec 123,297 / 161.9
· New Tokyo 75,801 / 79.5 · Ishima 75,643 / 79.5.

### The deadlock is circular, not slow — sharper than first diagnosed

**Every unowned aug that passes the filter is sold ONLY by Daedalus / The Covenant / Illuminati:**
EMBA Analyze Engine (625k rep), EMBA Direct Memory Access (1.0m), SPTN-97 (1.25m), EMBA Core V3
(1.75m), QLink (1.875m), The Red Pill (2.5m). Those are the three endgame factions — unjoinable
until the 30-aug count is met.

**Every aug we CAN buy is filter-dropped, score 0.00** — 11 of them, all rep-met right now:

| aug | rep | price | seller (joined) |
|---|---|---|---|
| **Wired Reflexes** | 1,250 | **$2.5m** | Tian Di Hui / Ishima |
| NutriGen Implant | 6,250 | $2.5m | New Tokyo |
| Neural Wit Amplifier | 5,000 | $10m | BitRunners |
| Speech Enhancement | 2,500 | $12.5m | Tian Di Hui |
| …7 more | | ≤$250m | |

So: **the augs we're willing to buy are sold only by the faction that requires the augs we won't
buy.** Nothing to fall through to, no rep to wait for, no amount of money that helps. The engine
cannot close this gate in any amount of time.

**This kills an alternative fix worth recording as rejected:** *make head-selection skip the
`buyBlocked` NFG and fall through to the next candidate.* Cleaner than a gate rule, fixes the same
confusion — and useless here, because the fall-through set is empty.

**And it generalizes.** Once the non-endgame factions' passing augs are exhausted, the count gate
**can only ever be closed by a zero-score aug**. That is structural to the progression, so A1 is a
permanent capability, not a workaround for today.

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
- *"No passing aug is buyable"* not *"only NFG left"* — the latter is **false today** (six passing
  augs are unowned) yet we're still stuck, because all six are sold only by the endgame factions
  we can't join. It under-fires in the exact case that motivated it.
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

## Decisions taken 2026-07-18 (branching questions closed while context is fresh)

**D1. A1 is a permanent capability, not a workaround.** Settled by the state above: the count gate
can only ever be closed by a filter-dropped aug once the non-endgame factions are exhausted. It
recurs every node clear. Build it as a real rule, document it as a mechanic.

**D2. A1's trigger is GENERAL, not `endgameHold`-scoped — reversing the earlier lean.** Condition:
*an in-scope faction we have not joined has `numAugmentations` as its **only** unmet requirement.*
Rationale for the reversal: `endgameHold` is a Daedalus-specific flag, so keying on it would need
rewriting the moment The Covenant (20 augs) or Illuminati (30) matter — both are already in
`FACTION_SCOPE` and both sell the augs we're locked out of. The general form is *the same amount of
code*, and the "only unmet requirement" clause is what actually provides safety: in a fresh node
we hold neither $100b nor hacking 2500, so it **cannot** fire during early game.

**D3. Buy the cheapest rep-met unowned aug by PRICE, ignoring filter status.** Every purchase
imposes the same ~1.9× tax on the rest of the cycle (`docs/neuroflux.md`), so price is the only
thing separating two count-fillers. Today that is **Wired Reflexes, $2.5m / 1,250 rep, from Tian
Di Hui or Ishima** (both joined, both rep-met). Must respect existing reserves —
`daedalusInviteReserve`'s $100b is untouched at $2.5m.

**D4. One buy per pass, re-evaluated each time** — not N at once. If the gate closes early, or a
passing aug becomes reachable mid-way, the next pass simply stops firing. No separate
"prefer useful augs" logic needed; it falls out.

**D5. Gate-buys go LAST in a cycle's buy order.** Inflation hits everything purchased *after* a
buy, so a zero-score aug must never precede an aug whose price we care about. (Moot today — there
is nothing else to buy — but the rule is wrong without it.)

**D6. A1 is NOT mode-gated.** `mode` (`observe`/`auto`) gates *installs*, not purchases; augfarmer
already buys augs in either mode. Gate-buying is a purchase, so it follows that convention.
Flagging it explicitly because it means A1 will fire under `observe` too.

**D7. B2 precedes B1; it does not subsume it.** Ship stall-age detection standalone as the first
supervision increment. It would have caught gaps 7 **and** 9 without knowing either existed, it's
a fraction of the code, and — decisive — **a reporter does not need the `HOME_RESERVE_GB` bump**,
while a relauncher does. That keeps the coupled RAM change out of the first increment.

**D8. The 1.9 purchase multiplier is treated as per-node measured, not constant.** Re-derive on
entry to any new BitNode from the `projected`-vs-`amount` pair the gap-5 fix logs — free, since
the data is already written. Add it to the node-entry checklist rather than assuming BN1's value
travels.

**D9. Log the NFG tail's binding constraint (`money` vs `rep`) on every spend-down.** This is the
discriminator that answers B3's timing question on its own schedule, so nobody has to guess now.
Cheap to add, and the first `rep`-bound spend-down is precisely B3's wake-up trigger.

**D10. B4's acceptance criteria, fixed now even though the design isn't.** Any goal model must:
(a) answer the four conflated questions *separately*; (b) be **derived from state**, not hand-set
by a caller; (c) make gap 9's case fall out of the model rather than needing a special case — if
B4 still needs A1 bolted on beside it, B4 is wrong. This is a test the design must pass, not a
design.

**D11. Let the engine close the gate — do not hand-buy the aug.** The gate rule firing against the
real deadlock *is* A1's live validation, and the state is gone once we clear. Closing the BN is
explicitly secondary.

## Open questions — genuinely unresolved, with wake-up conditions

1. **What is the goal model in B4, concretely?** An enum the controller sets, or derived per pass?
   The four jobs `score` conflates suggest at least *acquire mults* / *clear a gate* / *bank rep* /
   *recover*. Needs a real design pass. **Wake-up:** after A1 and B2 ship, when no live state is at
   risk. Constrained but not answered by D10.
2. **Does B3 change install *timing*?** If the NFG tail becomes rep-bound, the optimal cycle may be
   *shorter* (install sooner, re-earn cheap early rep) rather than longer — which would move
   `MIN_TOTAL_GAIN` and `GRIND_HORIZON_MS`, both still provisional. **Wake-up:** the first
   spend-down that D9 logs as `rep`-bound.
3. **Does unattended running require auto-recovery, or is reporting enough?** D7 defers this rather
   than answering it: B2 reports, B1 recovers, and only B1 forces the `HOME_RESERVE_GB` bump whose
   blast radius Phase 25 deliberately declined. **Wake-up:** the first companion death that B2
   catches — at which point we'll know whether a report arrived in time to matter.
4. **Does the count gate ever need more than one aug at once?** Today it's 29/30. A node entered
   with a larger deficit (or The Covenant's 20 from a low base) would buy several, and 1.9ⁿ
   inflation compounds. D4's one-per-pass bounds the damage but doesn't price it. **Wake-up:** any
   gate rule firing with a deficit > 1.

## Proposed sequence

1. Verify the gap-9 deadlock read against live behavior (traced through code; not yet watched fail).
2. Build + ship **A1**, validated against the live deadlock before it expires.
3. Let the clear proceed; **B2** next, since it would have caught both stalls that motivated it.
4. **B1** and **B3** as their own spec passes.
5. **B4** when there's no live state at risk — and revisit whether A1 should fold into it.
