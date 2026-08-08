# Phase 36 — Install cadence: converting money into M (brainstorm)

**Stage 1 of 3.** Decisions, rejected alternatives, open questions. No spec, no implementation.
**Date:** 2026-07-28. **Node:** BN5.1, ~5 days in, M = 1.6029 against a 9.7 gate, income $533M/s.

> **Supersedes the 2026-07-27 draft of this phase** (`phase-36-money-arbitration.features.md`, same
> file before `git mv`). That draft diagnosed a money race between `cloudmanager.js` and
> `augfarmer.js`. **That race is over** — cloudmanager hit the node's hard fleet ceiling and can
> never spend again. M stayed flat anyway, which is how we learned the race was a symptom and not
> the disease. The old draft's §1/§2 measurements are preserved in git because they are still
> correct *about 2026-07-27*; its decisions D1/D2 are shelved, not rejected. Full reasoning in §2.

---

## 1. The drift check that rewrote this phase

The superseded draft closed with an instruction to itself: *"If M has moved since 2026-07-27, the
race in §2 may have resolved itself by luck — re-run R2 before assuming the phase is still needed."*
Run 2026-07-28 19:03. **M had not moved — but everything underneath it had.**

| | Draft (7/27) | Live (7/28 19:03) | Source |
|---|---|---|---|
| Fleet | 7.08 PB, growing fast | **26.2 PB, `growth: "at-limit"`** | `cloud-state.json` |
| Cloud servers | 25/25, upgrading | 25/25, **all at `ramLimit` 1,048,576 GB** | `cloud-state.json` |
| Last cloud spend | every 1–3 min | **14.4h ago** ($431.9b, 04:38) | `cloud-state.json` `lastUpgrade` |
| Cash on hand | $5.95b, drained hourly | **$38,725,441,548,481** | `finance-state.json` |
| Reservations | contested | `totalReserved: 0`, `reservations: []` | `finance-state.json` |
| M | 1.6029 | 1.6029 — flat **45.5h** | `goal-state.json`, `ratchet-log.json` |
| Income | $664M/s | $533M/s (24h $626M/s) | `goal-state.json` |
| Trigger blocker | the `totalGain` race | **`gainPhase: "horizon-under-bound"`** | `augfarmer-state.json` |

**cloudmanager is finished for the rest of BN5.** `serverLimit` 25 and `ramLimit` 1,048,576 GB are
node-level caps, not budget limits — there is nothing left for it to buy at any price. The wallet
now has exactly one consumer.

**And installs still are not firing.** Last install was **#25 on 2026-07-26 21:33** (M 1.4126 →
1.6029). Nothing since. $38.7t sits idle while the one metric that matters does not move.

### The lesson worth keeping

The draft's diagnosis was *correct and load-bearing* on 7/27 — the race was real and measured. It
was also **not the binding constraint**, and there was no way to know that while cloudmanager was
masking the second blocker by draining the balance. Removing a real blocker revealed a realer one.

**A phase premised on a live measurement needs a re-measure gate before the spec, not just before
the implementation.** The draft had one (§7a) and it fired correctly — that instruction is the
reason this doc exists instead of a spec for a fix nobody needed. Keep writing them.

---

## 2. The live diagnosis — the horizon treadmill

Trigger state, `augfarmer-state.json`, 2026-07-28 19:01:

```
totalGain: 1.2292          nfgLevelsProjected: 12      nfgBoundBy: "money"
reasons:  { gainArmed: true, phaseArmed: false, gateArmed: false,
            stallArmed: false, escalationArmed: false }
blockers: { gainPhase: "horizon-under-bound", stall: "not-stalled",
            escalation: "phase-not-awaiting-money", gate: "no-gate-release" }
horizonMs: 6,632,906  (1.84h)      escalation.escalationFactor: 613.1
```

**The gain bar is already cleared** — 1.2292 against `MIN_TOTAL_GAIN` 1.1. What blocks the install
is `phaseArmed`: the grind path arms only when the rep horizon *exceeds* `GRIND_HORIZON_MS` (8h),
i.e. *"the next aug is only 1.8h of rep away — wait and buy it first."*

**It has been saying that for 45.5 hours.** `escalationFactor` 613 = 1.9^10 — ten augs bought in
that window. Each one closed a short horizon, and the *next* candidate's horizon opened equally
short. That is a treadmill, and it is structural rather than unlucky: the horizon is measured
against whichever faction is nearest, so a queue with any depth at all keeps producing sub-8h
horizons indefinitely.

**Three arms exist and none of them can catch this:**

| Arm | Why it does not fire |
|---|---|
| `phaseArmed` (grind horizon) | 1.84h < 8h — the treadmill above |
| `stallArmed` (Phase 31) | explicitly excludes `phase === "grinding"`, to protect *"a sub-8h grind about to finish."* This grind has been about to finish for 45.5h |
| `escalationArmed` (Phase 34) | requires `phase === "awaiting-money"`. We are the opposite of money-blocked |

**Phase 34 already built exactly the comparison this needs** — `waitMs` (time to afford at the
laddered price) vs `afterMs + overheadMs` (time to afford at base price after an install wipes
money). It was scoped to the money-blocked quadrant because that was the failure in hand. The live
failure is a quadrant nobody has designed for:

> **money-rich, ladder-deep, rep-close.** Waiting is cheap in *time* and ruinous in *purchasing
> power*, and every arm we own measures time.

### 2a. The arithmetic

`AUG_PRICE_LADDER` is 1.9^(buys this cycle) and **resets when the queue empties at install**. So the
613× is not a fixed tax — it is a tax on *continuing this cycle*, and installing is what clears it.

| | M outcome | Cost |
|---|---|---|
| **Install now** | 1.6029 → **~1.970** (+22.9%; this is what `totalGain` 1.2292 *is*: 1.7485/1.6029 queued × 1.1268 projected NFG) | ~9–10h at $0 ≈ **$19t** forgone, plus the re-climb |
| **Keep waiting** | $38.7t buys **12** NFG levels at 613×. Another 10h of income (+$19t) at a deeper ladder buys perhaps 2–3 more levels | +2–3% M |

Installing wins by roughly an order of magnitude. **The bank is not an asset at 613× — it is a
melting one**, and the only operation that restores its value is the install.

### 2b. Sanity check on the node's viability

The `forecast.daysToGate: 85` in `goal-state.json` is an artifact of the stall, not a verdict on
BN5. It extrapolates `dollarsPerMPoint` ($302t) from a 48h window in which M moved 0.19 *and 45.5h
of which were flat*, while most of the spend went to a fleet that is now permanently finished.

Forward-looking, with 100% of income going to augs: recent installs compounded ×1.135 (#25) and the
next projects ×1.229. At ~1.25×/install, 1.97 → 9.7 is **~7 installs**. If a cycle is ~24h (9–10h
install + re-climb, then earn/grind), that is **~1 week**, not 85 days.

**BN5 is not economically stuck. It is stuck on an arming policy.** That materially changes the
tripwire picture — see D7.

---

## 3. Decisions

### D1 — Retitle and rescope: this phase is **install cadence**, not money arbitration. **Decided.**

The subject is the conversion of money into M. Arbitration was one obstacle to that and is now moot;
arming and buy-set selection are the live ones. File renamed `phase-36-install-cadence.features.md`.

### D2 — Old D1 (the reservation) and old D2 (the cloud demand gate) are **SHELVED, not rejected**. **Decided.**

Both were correct diagnoses of 7/27. Neither can do anything in BN5: cloudmanager is at-limit, so
there is no competing spender to fence off and no upgrade to gate. Building either now would be
untestable — the success condition could not be distinguished from doing nothing.

**They come back the moment a node has a growing fleet again**, which is every future node. Carry
them to `docs/batcher-engine.md` (the demand-signal half, including the finding that
`fleet.utilizationPct` is permanently broken as a signal once `ns.share()` is on) and to
`BACKLOG.md` (the reservation half). **Do not let them evaporate** — the underlying `CLAUDE.md`
warning ("the finance reserve never covers the NFG spend-down batch") is still unfixed and still
true.

*Corollary:* old open questions **Q1 (reserve circularity)**, **Q2 (demand signal)** and **Q3
(reserve bound)** are shelved with them. Q1 also has an answer already sitting in the code, worth
recording so it is not re-derived: during spend-down `augfarmer.js:2787` reserves `money`
**wholesale**, not a ladder-derived figure — so the circularity the draft feared was never reachable
on that path.

### D3 — **Part 1: ladder-aware arming.** The primary fix. **Decided in principle; predicate is spec work.**

Extend Phase 34's escalation logic out of the `awaiting-money` quadrant so that a deep ladder plus
an idle balance can arm the trigger even when the rep horizon is short. The machinery
(`waitMs`/`afterMs`/`overheadMs`/`basePrice`/`escalationFactor`) already exists at
`augfarmer.js:1106–1153`; what is missing is a path that consults it while `phase === "grinding"`.

Chosen over raising/lowering constants because it removes the wrong *assumption* — that waiting's
only cost is time — rather than re-tuning a number that encodes it.

### D4 — **Part 2: the buy set, not the sort order.** **Decided — and this reverses the draft's framing.**

The draft called `augfarmer.js:849`'s `price DESC` a selection bug to be fixed by sorting on score
first. **That is wrong, and the code says so:** the line is commented *"escalation-optimal: price
DESC"* and it is correct. Because buy *i* is taxed 1.9^i, buying the expensive augs **first**
genuinely minimises total spend **for a fixed set**. Sorting score-first would break something
deliberate and make every multi-buy cycle more expensive.

**The real defect is upstream: nothing keeps zero-M augs out of the set.** Spending $78.19b on
Neuralstimulator (`hackingMult: 1`) was escalation-optimal *for a set that should never have
contained it*. The fix belongs in what becomes a candidate, not in how candidates are ordered —
a score floor, or an M-contribution filter, applied before the price-DESC sort inherits it.

This is why the draft's old D3 ("out of scope, its own phase") is reversed: at a 613× ladder, buy
*set* composition is not a polish item, it is the dominant term in dollars-per-M-point.

### D5 — **Stopgap shipped 2026-07-28: `GRIND_HORIZON_MS` 8h → 1h.** **Decided, and it MUST be reverted.**

Applied live (`src/augfarmer.js:120`) with a comment marking it temporary, 1022/1022 tests green,
`augfarmer.js` restarted in-game. Its only job is to let *this* cycle's install fire so the $38.7t
converts through the normal spend-down path before it melts further.

It is the blunt version of D3: it lowers the time bar rather than teaching the trigger about the
money cost, so it will also fire on short horizons where waiting *is* correct. **`MIN_TOTAL_GAIN`
(1.1) remains the backstop** that stops it degenerating into install-spam. **Revert to 8h when D3
ships** — a permanent 1h bound is not the design.

⚠️ **Do NOT force the install with `run installer.js` instead.** Spend-down is driven by augfarmer's
own `installSeq` (`augfarmer.js:2530`); `installer.js` only calls `installAugmentations`. Forcing it
directly would install **and wipe the $38.7t unspent** — the exact opposite of the goal.

### D6 — **Part 3 (member reserve / prep waterfall) splits to Phase 37.** **Decided.**

The draft's §2c defect is live and unchanged: `waterfall.availableGb: 0`, and 9 of 22 members sit at
0 batches / ~1% commit with security 2–4× minimum (omega-net 65 vs 17, iron-gym 83 vs 20, computek
49 vs 39). Members reserve RAM for batches that cannot launch → the reserve zeroes the prep
waterfall → targets stay unprepped. **With the fleet permanently capped, this is now the only
remaining income lever in BN5** — $533M/s is being earned off roughly a third of the fleet.

Split rather than bundled, despite a stated preference for one phase: it is a different file
(`scheduler.js`), a different metric (income, not M), and — decisively — **its cause is still
unresearched.** Bundling would hold the M-unblocker hostage to a measurement pass. That is precisely
the mistake the draft already made by parking D3/D5 behind D1, and it cost this phase a day.

### D7 — The 2026-08-02 gang tripwire: **note the precondition, do not re-decide.** **Decided.**

`CLAUDE.md`'s re-armed tripwire fires on sustained batcher income < ~$15M/s, gated on a validity
precondition: *"only valid on a window where `daemon-status.json` shows batches actually
launching."* Recording two facts for whoever checks it, without reopening the call:

1. **Income is $533M/s — 35× the threshold.** On the stated numbers it does not fire.
2. **The precondition is still only partly met.** `warns.skipServers` is empty and batches *are*
   launching, but 9 of 22 members are launching none (D6). The measurement is valid for "is the
   batcher earning" and understates the ceiling.

The draft's own lesson applies again: a threshold on a measured quantity assumes the instrument
works. Here it does — the reading is just conservative.

### D8 — CyberSec favor/donation (the draft's D5): **still out of scope, but promoted in priority.** **Decided.**

CyberSec at **105.31 favor**, **124,145 rep** from the 150 gate. The draft deferred it because it
"mainly unlocks NFG-by-donation, which only pays off once arbitration lets installs fire at all."
That reasoning is now half-obsolete: donation also **closes rep horizons with money**, and money is
free. It attacks the treadmill from the other side. Still out — it is a third subsystem
(work-target selection) — but **revisit immediately after this phase**, ahead of Phase 37.

### D9 — Do **not** lower `MIN_TOTAL_GAIN`. **Decided (unchanged from the draft's D4).**

Reaffirmed, and now for a stronger reason than the draft had: with D5's stopgap in force,
`MIN_TOTAL_GAIN` is the *only* remaining guard against install-spam. It was already not the blocker
— `gainArmed` has been true throughout — so changing it would trade away the backstop to fix
nothing.

---

## 4. Rejected alternatives

Carried forward from the draft (still rejected, reasoning unchanged):

- **Turn cloudmanager off.** Moot now, but the reasoning stands for future nodes: fleet growth
  produced the income breakout. The problem was unbounded appetite, not appetite.
- **Give the ratchet unconditional priority.** Symmetric failure — the fleet stagnates.
- **Cap cloudmanager to a fixed fraction of income.** A static split is wrong at both ends of a node.
- **Raise `TRIGGER_SUSTAIN_MS` / latch on first crossing.** Papers over a race by catching a lucky
  sample. Note this is now *fully* moot: with no competing spender the balance is stable, and the
  10-minute sustain is trivially satisfiable.

New to this draft:

- **Sort augs score-first instead of price-DESC.** Rejected — see D4. It would break a deliberate
  and correct escalation optimisation. The defect is set membership, not ordering.
- **Leave `GRIND_HORIZON_MS` at 8h and wait for the real fix.** Rejected: the bank is melting at
  613× and the fix is a full spec cycle away. The stopgap is reversible, tested, and its downside
  (occasional early install) is bounded by `MIN_TOTAL_GAIN`.
- **Make `GRIND_HORIZON_MS` permanently 1h and skip Phase 36 part 1.** Rejected: it encodes the same
  wrong assumption (waiting costs only time), just with a smaller number. It would misfire in the
  opposite direction early in a cycle, when the ladder is shallow and waiting genuinely is cheap.

---

## 5. Open questions

1. **What exactly should the ladder-aware arm compare?** Phase 34 supplies `waitMs`, `afterMs`,
   `overheadMs`, `basePrice`, `escalationFactor`. Candidates: a straight EV comparison
   (`afterMs + overheadMs < waitMs`, generalised to the rep-blocked case), or a simpler
   `escalationFactor` threshold. The EV form is principled but needs a rep-side term the money-side
   version does not have — the grind horizon does not vanish at install, it *resets to a longer one*
   because rep is wiped. **That asymmetry is the crux and it is not yet modelled.**
2. **Does the arm risk over-installing at 9–10h BN5 installs?** `MIN_TOTAL_GAIN` 1.1 is the backstop
   and was tuned when installs cost ~2 minutes. Not being changed (D9), but its adequacy under a
   more permissive arm is untested. Watch the first two cycles under the stopgap for evidence.
3. **What is the right membership filter for the buy set (D4)?** A hard score floor is simplest; a
   marginal-M-per-laddered-dollar test is more correct and more work. Needs the actual distribution
   of `score` across this cycle's 10 buys before choosing — measurable from
   `logs/ratchet-decisions.json`.
4. **Does filtering the buy set collide with `mustBuyTotal`?** `augfarmer.js:1462–1469` assumes a
   caller-sorted price-DESC list, and `spendDownPlan` plans must-buys **first** deliberately so that
   `evalTrigger`'s `money >= mustBuyCost` guarantee stays exact. A filter that changes set
   membership changes `mustBuyCost`. **Trace this before the spec** — it is the likeliest way part 2
   breaks something that currently works.
5. **Why does security sit 2–4× minimum on the stalled members?** Inherited from the draft, still
   unresolved, now Phase 37's blocker rather than this one's. **Reframed:** whatever *raised*
   security is an initial condition; the reserve→waterfall→prep deadlock is what prevents
   *recovery*, and that is directly observed rather than guessed. Phase 37 can fix recovery without
   knowing the cause — the cause only determines whether it recurs.

---

## 6. Scope

**In:** ladder-aware trigger arming (D3) · buy-set membership filtering (D4) · reverting D5's
stopgap when those land. Both are in `augfarmer.js`.

**Out:** the reservation + cloud demand gate (D2 — shelved to `BACKLOG.md` / `batcher-engine.md`) ·
member reserve / prep waterfall (D6 — Phase 37, `scheduler.js`) · CyberSec favor routing (D8) ·
`MIN_TOTAL_GAIN` retuning (D9) · anything batcher-internal.

**Success condition:** an install fires and **M rises at least once within 12h**, read from
`goal-state.json` (`mProgress.value`, `tripwire.status` leaving `STALLED`). Then, over the following
cycle: `escalationFactor` at install time is lower than this cycle's 613, and no purchase in
`logs/transactions-*.json` goes to an aug with no M contribution. No new instrumentation needed.

**Note the stopgap muddies attribution:** D5 alone should satisfy the first half of that condition.
The spec must state how part 1's effect is distinguished from the stopgap's — simplest is to revert
to 8h *as part of* shipping part 1, so the arm is the only thing that can fire.

---

## 7. Cold-session pickup

*Every number above is a 2026-07-28 snapshot and this node moves fast. **Do R0 first.***

### 7a. R0 — the drift gate (do this before acting on anything above)

The 7/27 draft died to drift; assume this one can too.

- `goal-state.json` → has `mProgress.value` moved off **1.6029**? Has `tripwire.status` left
  `STALLED`? If yes, **the stopgap (D5) worked** — check `ratchet-log.json` for an install past #25
  and re-derive the numbers before assuming part 1 is still needed as specified.
- `cloud-state.json` → is `growth.status` still `at-limit`? If a node change or an install altered
  the fleet cap, **D2's shelving is invalid** and the arbitration work comes back.
- `augfarmer-state.json` → `trigger.blockers`. If `gainPhase` is no longer `horizon-under-bound`,
  the treadmill in §2 has changed shape; re-read before designing.

### 7b. Live state when this doc was written

| Field | Value | Source |
|---|---|---|
| M / target | 1.6029 / 9.7 (queued 1.7485, 10 augs) | `goal-state.json` |
| Income | $533M/s (24h $626M/s) | `goal-state.json` |
| `tripwire.status` | `STALLED`, 12h+ | `goal-state.json` |
| Money / reserved | **$38.725t** / $0 | `finance-state.json` |
| Fleet | 26.2 PB, 25/25 at `ramLimit`, `at-limit` | `cloud-state.json` |
| Batch budget / share pool | 19.66 PB / 6.55 PB (25%) | `daemon-status.json` |
| `waterfall.availableGb` | **0** | `daemon-status.json` |
| Members | 22, 9 at zero batches | `daemon-status.json` |
| Last install | **#25, 2026-07-26 21:33**, M 1.4126 → 1.6029 | `ratchet-log.json` |
| `escalationFactor` | **613.1** (1.9^10) | `augfarmer-state.json` |

### 7c. Reproducing the numbers

- **R1 — spend by sink.** Unchanged from the draft; the one-liner is in git history
  (`phase-36-money-arbitration.features.md` §7b, R1). Expect it to now show ~zero
  `auto-cloud-upgrade` past 2026-07-28 04:38.
- **R2 — the trigger.** `augfarmer-state.json` → `trigger.reasons`, `trigger.blockers`,
  `trigger.horizonMs`, `trigger.escalation.escalationFactor`. One read suffices now that no other
  process moves the balance; the draft needed repeated polls only because of the race.
- **R3 — RAM accounting (Phase 37).** Newest `event === "snapshot"` in `logs/daemon-batch-log.json`:
  `budgetGb`, `waterfallFreeGb`, `sharePool.inFlightRamGb`, `xpPool.inFlightRamGb`, per-member
  `pipelineCostGb` / `inFlightRamGb` / `reserveGb`. ⚠️ Ring buffer dominated by `batch` events —
  holds only minutes. For history use `logs/goal-log.json` (48h; schema is `{t, gangCum,
  hackingCum, mHacking}`, *not* the `goal-state.json` shape).
- **R4 — prep state (Phase 37).** `daemon-status.json` `members[]`: signature is
  `batchesInFlight: 0`, `commitPct` ~1%, `sec` 2–4× `minSec`.

### 7d. Code inventory (verified 2026-07-28)

| What | Where |
|---|---|
| `MIN_TOTAL_GAIN = 1.1` | `augfarmer.js:119` |
| **`GRIND_HORIZON_MS` — D5's stopgap, 1h, REVERT TO 8h** | `augfarmer.js:120` |
| `TRIGGER_SUSTAIN_MS = 600_000`, `RATE_MIN_SAMPLES = 30`, `POLL_MS = 10_000` | `augfarmer.js:121`, `:122`, `:90` |
| **The grind-horizon arm — D3 takes effect here** | `augfarmer.js:1050–1071` |
| Phase 34 escalation machinery (reuse for D3) | `augfarmer.js:1106–1153` |
| `AUG_PRICE_LADDER = 1.9` | `augfarmer.js:142` |
| **Candidate sort — price-DESC is correct (D4); filter upstream** | `augfarmer.js:840–859` |
| `mustBuyTotal` — assumes price-DESC (open Q4) | `augfarmer.js:1462–1469` |
| NFG ladder buyer, cap lifted for spend-down | `augfarmer.js:1503` `spendDownPlan` |
| Spend-down reserves `money` wholesale (answers old Q1) | `augfarmer.js:2787` |
| Spend-down sequence start | `augfarmer.js:2530` |
| `installAugmentations` — **only** here, no spend-down | `installer.js` |
| Member reserve rule (**Phase 37**) | `scheduler.js:123` `memberReserveGb` |
| Member admission needs full pipeline to fit (**Phase 37**) | `scheduler.js:513` |
| `SHARE_FRACTION = 0.25` | `scheduler.js:38` |
| cloudmanager's gate (shelved D2) | `cloudmanager.js:220` |

### 7e. ⚠️ Live-game state not in git

- **`share-off.txt` was deleted from `home` (in-game) 2026-07-27.** Untracked, not in `src/` —
  exists only in the running game, nothing in the repo restores it. `ns.share()` takes 25% of fleet
  RAM (6.55 PB live) and raised `sharePower` to **1.576**. To revert: recreate an empty
  `share-off.txt` on `home`. Current state: `daemon-status.json` → `share.off` (live: `false`).
- **`augfarmer.js` was restarted in-game 2026-07-28 19:11** to load D5's stopgap. The restart resets
  the EWMA rep-rate samples, so the trigger reports `no-rate-sample` / `phase:null` for ~5 minutes
  (30 samples × 10s) before a horizon can be computed again. **Expected, not a fault** — but it
  means the first post-restart reads of `trigger.blockers` are not comparable to those in §2.

### 7f. Next step

Stage 2 — write `phase-36-install-cadence.spec.md` for parts 1 (D3) and 2 (D4), then a cold-context
review by the `spec-reviewer` subagent, blockers addressed, disagreements logged as open questions.
**Blocked on open questions 1, 3 and 4** (the arm's predicate and its rep-side asymmetry; the
buy-set filter's shape; the `mustBuyTotal` interaction). None should be decided inside the spec —
they change what the spec *is*.

**Before starting stage 2, run R0.** If the stopgap already fired an install, the phase is less
urgent and the spec should be written against the *post-install* numbers, not these.
