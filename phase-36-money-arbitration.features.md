# Phase 36 — Money arbitration: cloudmanager vs. the aug ratchet (brainstorm)

**Stage 1 of 3.** Decisions, rejected alternatives, open questions. No spec, no implementation.
**Date:** 2026-07-27. **Node:** BN5.1, ~4 days in, M = 1.6029 against a 9.7 gate, income $664M/s.

---

## 1. Why this phase exists

BN5 broke out of its bootstrap trough on 2026-07-27. In ten hours income went
**$1M/s → $275M/s**, roughly doubling hourly, and the fleet went **4,780 GB → 4.59 PB**. That part
is working.

**M did not move.** It has been flat at 1.6029 since ~03:20, and `goal-state.json`'s GP2 tripwire
has read `STALLED` for 12h+ while money poured in. Money is emphatically not scarce — and M still
will not climb.

### The measurement

Over an 11.5h window (`logs/transactions-2026-07-27.json`, 246 records):

| Sink | Txns | Total | Sustained |
|---|---|---|---|
| `auto-cloud-upgrade` | **210** | **$3,391.0b** | **$82.0M/s** |
| `auto-aug` | 6 | $110.9b | $2.7M/s |
| `auto-cloud-purchase` | 24 | $2.8b | $0.1M/s |
| `auto-port-opener` | 3 | $0.3b | — |

**cloudmanager is taking 30.6× what the aug ratchet gets.** Individual upgrades run **$74.99b**, and
one landed at **$179.97b**. Cash on hand went **$53.25b → $5.95b in ~40 minutes**.

And it is buying RAM the batcher does not use: before `ns.share()` was enabled this session, fleet
utilization was **14.0% of 4.59 PB** — the batcher draws ~643 TB and cloudmanager kept buying past
it. (Utilization now reads 72.8%, but that is share filling idle RAM, not batcher demand. See D2 —
this makes raw utilization a *broken* signal going forward.)

### 2. The mechanism — a race, not a deadlock

The aug ratchet's install trigger requires `totalGain >= MIN_TOTAL_GAIN` (1.1). `totalGain` is
dominated by `projectedNfgFactor` — how many NeuroFlux levels the spend-down could buy — and
`nfgBoundBy` reads **`"money"`**. So `totalGain` is a direct function of **cash on hand at the
moment the trigger samples**.

Observed across ~50 minutes of polling, with no code change in between:

| Time | `totalGain` | `nfgLevelsProjected` | Cash |
|---|---|---|---|
| 18:15 | 1.0829 | 8 | $53.25b |
| ~18:56 | **1.1046** ✅ | 9 | — |
| 19:06 | 1.0510 | 4 | $5.95b |

**It crosses the threshold and falls back, because cloudmanager spends the balance before the
trigger can act on it.** And `TRIGGER_SUSTAIN_MS` requires the trigger to stay armed for **10
continuous minutes** — while cloudmanager fires every ~1–3 minutes. The trigger is structurally
unable to sustain: it is sampling a quantity another process is actively draining.

> Two consumers, one wallet, **no arbitration**. cloudmanager wins by default — not because it is
> prioritised, but because it spends continuously in medium lumps while the ratchet needs a large
> balance to *persist* for ten minutes.

**This is a known issue that has now come true.** `CLAUDE.md` carries it: *"the finance reserve
never covers the NFG spend-down batch, so cloudmanager can starve a deep NFG tail. Re-check before
BN5's endgame."* It is worse than predicted — it is not starving the tail, it is **preventing
installs outright**.

### 2b. ⚠️ Correction — recorded so it is not inherited

Earlier today I committed a `BACKLOG.md` entry (`f26cf15`) claiming the blocker was **the D3
one-NFG-per-cycle cap** deadlocking the trigger. **That is wrong and the entry must be fixed.**
`spendDownPlan` (`augfarmer.js:1503`) runs *after* the trigger fires and buys an NFG **ladder**, not
one level — the cap applies to normal phases only and is explicitly lifted for spend-down. The
trigger already projects 4–9 laddered levels.

The error came from reading `nfg.cappedThisCycle: true` and stopping there instead of following
`nfgLevelsProjected` / `nfgBoundBy` to their source. **The cap is real but it is not the blocker;
money arbitration is.** Two conclusions worth keeping: a state flag named `capped` invited the
assumption that something was capped, and one poll of an oscillating quantity looks exactly like a
deadlock.

---

## 3. Decisions

### D1 — The arbitration primitive: reserve, not a toggle. **Decided.**

`resourcemanager.js` already has the mechanism: a keyed reservation list, and cloudmanager already
gates on `finance-state.available`. augfarmer already reserves `next-aug` this way. So the fix is to
**reserve the projected NFG ladder cost** under its own key, which drops `available` and stops
cloudmanager without cloudmanager needing to know the ratchet exists.

Chosen because it adds no new coupling and reuses a path that is already load-bearing and tested.

### D2 — cloudmanager needs a demand signal, and raw utilization is now broken. **Decided in principle, threshold open.**

Buying RAM at 14% batcher utilization is close to burning money. cloudmanager should not upgrade
when the batcher is not RAM-hungry.

**The catch, and it is load-bearing:** enabling `ns.share()` this session moved
`fleet.utilizationPct` from 14.0% → 72.8% **without the batcher wanting a single additional byte**.
Share is designed to soak idle RAM, so it will *always* report the fleet as busy. Any rule written
against `utilizationPct` is therefore self-defeating from day one.

The signal must be **batcher-only demand** — `batchBudgetGb` minus the share pool, or better, a
direct measure like member `commitmentPct` / whether any member is RAM-blocked. Naming the right
field is spec work; the point here is that the obvious field is a trap.

### D3 — The `price-DESC`-before-`score` selection bug is **out of scope**. **Decided.**

Real, expensive, and already logged (`BACKLOG.md`) — this cycle bought **$83.62b for +1.0% M**, with
**$78.19b of it on Neuralstimulator (`hackingMult: 1`)**. It deserves its own phase.

Excluded because it is an independent defect in a different function, and shipping two engine
changes to the money path at once doubles the blast radius on a live node with $664M/s flowing
through it. Arbitration is the one that unblocks M; selection is the one that stops waste. Fix the
blocker first.

### D4 — Do **not** lower `MIN_TOTAL_GAIN`. **Decided.**

Dropping the 1.1 bar would let installs fire — and is the wrong fix twice over. It treats a symptom,
and a lower bar means *more* installs, each costing **~9–10h of $0 income** (measured in BN5,
Phase 35). Cheaper installs are not the goal; installs that carry real gain are.

### D5 — The CyberSec favor/donation push is **out of scope**, but log the number. **Decided.**

CyberSec sits at **105.31 favor** and needs **124,145 more rep** to reach the 150 donation gate —
3× closer than any other faction and ~3.1× faster per second (2.05× favor multiplier × the 1.52
`sharePower` enabled this session). Worth roughly two hours of directed faction work.

Deferred because it is a third subsystem (work-target selection), and because it mainly unlocks
NFG-by-donation, which only pays off once arbitration lets installs fire at all. **Revisit
immediately after this phase ships.**

---

## 4. Rejected alternatives

- **Turn cloudmanager off** (the BN2-era `cloud-upgrade-off.txt` approach). Rejected: fleet growth is
  precisely what produced the 10-hour income breakout. A blunt off-switch would have prevented the
  thing that is working. The problem is unbounded appetite, not the appetite.
- **Give the ratchet unconditional priority.** Rejected: symmetric failure. The ratchet would hold
  cash indefinitely while the fleet stagnates, and in a node where the batcher is the only earner
  that is how the trough returns.
- **Raise `TRIGGER_SUSTAIN_MS` / make the trigger latch on first crossing.** Rejected as the primary
  fix: it papers over the race by catching a lucky sample rather than removing the contention. Worth
  revisiting *after* arbitration, as a robustness measure — see Q3.
- **Cap cloudmanager to a fixed fraction of income.** Rejected: a static split is wrong at both ends
  of the node — too generous in the endgame, too stingy during a bootstrap where RAM genuinely is the
  binding constraint. Demand-driven (D2) dominates a fixed ratio.

---

## 5. Open questions

1. **Circularity in the reserve (the sharp one).** `nfgLevelsProjected` is computed *from available
   money*. If we reserve based on projected levels, and projected levels depend on money, the
   reserve feeds itself: more reserve → more projected levels → more reserve. Does the reserve need
   to be computed against a *fixed* ladder depth, or a money figure snapshotted before the
   reservation applies? **This must be resolved before the spec — it is the likeliest way a naive
   implementation deadlocks the whole money path.**
2. **What is the correct batcher-demand signal, concretely?** Candidates: `sum(member.reserveGb)`
   unmet, `commitmentPct` across members, count of members RAM-blocked in the skip diagnosis.
   Needs a measurement pass against live logs, not a guess.
3. **Should the reserve be bounded, and by what?** An unbounded ladder reserve at a deep NFG level
   could exceed any plausible balance and freeze cloudmanager permanently.
4. **~~Is the fleet already RAM-saturated for the batcher?~~ — MEASURED 2026-07-27, and the answer
   is neither hypothesis.** The fleet is **not** saturated: members want **3.798 PB** of pipeline and
   hold **1.141 PB**. But buying more RAM **cannot help**, for a reason that has nothing to do with
   totals. Exact accounting of the 7.081 PB fleet:

   | Slice | PB | % |
   |---|---|---|
   | share pool | 1.770 | 25.0% |
   | xpfarm in-flight (long-running jobs; xpfarm itself is self-suppressed, `usableGb: 0`) | 1.469 | 20.8% |
   | batcher **held** | 1.141 | 16.1% |
   | batcher **reserved** — fenced for batches that cannot launch | **2.657** | **37.5%** |
   | **prep waterfall free** — every prep job must fit here | **0.044** | **0.62%** |

   **13 of 17 members are unprepped, and 10 of those are already at >95% money — they need WEAKEN,
   not grow.** The only prepped members are the small targets; every large one
   (the-hub $4.80b, crush-fitness $1.26b, omega-net $1.68b, iron-gym $0.50b) sits at 100% money with
   security **2–4× minimum** and **zero batches in flight**, holding ~0.2% of its own pipeline.

   **This is a reserve/prep deadlock:** members reserve RAM for batches that cannot launch (target
   unprepped) → the reserve zeroes the waterfall → prep cannot run → targets stay unprepped. It is a
   recurrence of the failure `scheduler.js`'s `memberReserveGb` comment documents from
   2026-07-24 (11h at $0 on a 396 GB fleet), now at ~10,000× the scale. That fix only drops the
   reserve for **floor-seated** members (`pipelineCostGb > budgetGb`); here *no* member is
   floor-seated — each pipeline individually fits — so all 17 reserve in full and collectively
   starve prep.

   **Consequences for this phase:**
   - **D2's cloud gate is now strongly justified** — marginal RAM has ~zero value, and worse,
     *growth makes it worse*: a bigger fleet seats more members, each adding a full pipeline
     reserve, so the waterfall stays starved at any fleet size.
   - **D1 (the reserve) is still needed** — it addresses the money race, which is a separate defect.
   - **A new, probably larger item falls out of this:** the reserve rule itself. Logged as Q6 rather
     than absorbed here — see scope note below.

6. **NEW — should the member-reserve rule be part of this phase or its own?** Fixing it is what
   unblocks *income*; this phase's D1/D2 unblock *M*. Leaning to its own phase (different file,
   different failure, and this one is already touching the money path on a live node), but the two
   interact through D2 and the sequencing needs a call. **Not yet established:** *why* security sits
   2–4× minimum on those targets — candidates are BN5's 200% starting-security nerf on newly-eligible
   targets, historical xpfarm hack passes (its earlier target list did include the-hub /
   crush-fitness / omega-net), or batcher hack outpacing its own weaken. Worth pinning down before
   designing a fix, per the read-the-interface rule.
5. **Does `MIN_TOTAL_GAIN` = 1.1 still hold in BN5?** Not being changed here (D4), but it was tuned
   in a node with ~2-minute re-climbs. BN5's are 9–10h. Flagged, not opened.

---

## 6. Scope

**In:** money arbitration between `cloudmanager.js` and `augfarmer.js`, via `resourcemanager.js`'s
existing reservation path, plus a batcher-demand gate on cloud upgrades.

**Out:** aug selection order (D3) · favor/donation routing (D5) · `MIN_TOTAL_GAIN` retuning (D4) ·
the D3 one-NFG-per-cycle cap (§2b — not the blocker) · anything batcher-internal.

**Success condition:** the install trigger can hold `totalGain >= MIN_TOTAL_GAIN` for a full
`TRIGGER_SUSTAIN_MS` without cloudmanager draining the balance underneath it — and M resumes
climbing. Measurable directly from `goal-state.json`'s `forecast` / `tripwire` fields.
