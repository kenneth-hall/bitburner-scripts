# Phase 35 — The install boundary (brainstorm)

**Stage 1 of 3.** Decisions, rejected alternatives, open questions. No spec, no implementation.
**Date:** 2026-07-26. **Node:** BN5.1, ~72h in, M = 1.4126 against a 9.7 gate.

---

## 1. Why this phase exists — the measurement that reframed it

This phase was originally scoped as *"unattended survivability"* (a liveness watcher + an interlock
audit). That framing survived about ten minutes of contact with the data.

`logs/goal-log.json` carries a 2,313-point series of `{t, hackingCum, mHacking}` sampled every
~60s. It had never been read as a time series. Broken into hourly buckets across the most recent
install (which landed 11.2h before the reading):

| Hours ago | $/sec | Earned | M |
|---|---|---|---|
| 26 → 13 | **$5,444/s** (flat, thirteen straight hours) | ~$19.6M/h | 1.280 |
| 13 → 12 | $10,888/s | $39.2M | 1.280 |
| **12 → 11** | **$197,883/s** | **$703.9M** | 1.413 ← **install** |
| **11 → 2** | **$0/s** | **$0.0M** — *nine consecutive hours* | 1.413 |
| 2 → 1 | $4,849/s | $17.7M | 1.413 |
| 1 → 0 | $7,782/s | $27.5M | 1.413 |

**The finding: an install costs ~9 hours of exactly zero income, and that is current behavior, not
a bug that was already fixed.** Every deadlock named in the 07-24/25 CHANGELOG entries was
repaired before this window. This is the engine working as designed.

**Scaled against the node:** `CLAUDE.md` budgets **~8–12 installs** for BN5 and **~1.5–3 weeks**
(≈250–500h) of wall-clock. At ~9h each:

> **8–12 installs × ~9h = 72–108 hours of $0 — roughly 20–30% of the entire node, by design.**

That is larger than every bug fixed this week combined (~64h, one-time) and it recurs on a
schedule. It is the single biggest identified cost in BN5 and nothing in the backlog targets it.

**Corroborating detail:** `docs/reset-protocol.md:17` lists *"Money, purchased servers | reset |
reset"* — the fleet is wiped at every install, so each install re-runs a from-zero fleet rebuild.
The recovery is not incidental; it is structural.

### 1b. The secondary finding — detection already works, delivery does not

The same series settles what was previously an assumption. M sat at exactly **1.280** from
2026-07-24T19:33Z until 2026-07-26T05:17Z — **33.7 hours flat**. `goallog.js`'s GP2 tripwire
(`FLAT_WINDOW_MS` = 12h, `src/goallog.js:63`) reports `STALLED` when M has not risen across the
window, so it was writing **`STALLED` for ~21.7 consecutive hours** into `goal-state.json`, once a
minute, onto the dashboard GOAL panel — through the tail of the 53h `fundBlocked` deadlock.

**Nobody read it.** This is the exact failure `BACKLOG.md:312` describes ("both times
`daemon-status.json` carried an unambiguous signature the whole time and simply had no reader").

**Consequence for scope:** the watcher shrinks from *"build detectors"* to *"build one delivery
path for detectors that already fire."* That is a much smaller piece of work than assumed, and it
is no longer the centre of the phase.

⚠️ **Correction to an earlier claim made in review, recorded so it isn't inherited.** The GOAL
panel's `ON TRACK` reading was called a broken indicator. It is not broken — it correctly reports
that M rose (the install raised it). The real defect is narrower: **GP2 measures ratchet progress
and nothing measures income liveness**, and the two sit adjacent on one panel where a reader
merges them. `ON TRACK` beside `perSec: 0` is a composition failure, not a logic bug.

---

## 2. Decisions taken

**D1 — The phase is the install boundary, not survivability in general.** Spine: *reduce the cost
of an install cycle, and make its failures legible.* Anything not serving that is out of scope.

**D2 — Shrinking the ~9h dead window is the primary workstream.** It has the largest measured
payback (72–108h), it recurs on a known schedule, and unlike throughput tuning it does not depend
on numbers we do not yet have.

**D3 — `cloudmanager`'s growth-buy policy is promoted from backlog curiosity to a lead candidate.**
`BACKLOG.md:48` records that `shouldBuyGrowthServer` requires `fleet.every(s => s.ram >= 1 PB)`, so
growth buys are unreachable in practice and all cash doubles a single host at **2× $/GB** versus
**1× $/GB** for a growth buy. Live on 07-25: **1 of 25 slots used**, next upgrade $68.1M for
+512 GB while a $14.2M 256 GB growth buy was affordable immediately. **This lands squarely on the
post-install rebuild** — the moment when the fleet is smallest, cash is thinnest, and RAM breadth
matters most. The backlog is right that it "wants a decision, not a drive-by patch"; this phase is
where that decision gets made.

**D4 — Home RAM before install is free upside and should be automatic.**
`docs/batcher-engine.md:93` already establishes home RAM/cores survive a soft reset while money
does not. Money at install time is otherwise burned. Nothing currently converts it.

**D5 — Build exactly one delivery path, not a monitoring platform.** Existing detectors
(`goal-state.json`'s GP2, `daemon-status.json`'s `warns.skipServers` / `utilizationPct`,
`finance-state.json`'s `available`) are sufficient. What is missing is something that reads them
while no session is open. Per `BACKLOG.md:312`, `/loop`, `Monitor` and `CronCreate` are
session-scoped and die at exactly the overnight window that caused both incidents; only a
`/schedule` cloud routine survives it.

**D6 — Add one income-liveness signal beside GP2, and do not touch GP2.** GP2 is correct for what
it measures. The gap is a separate boolean: *is the batcher converting fleet RAM into money right
now, or not.* Must tolerate legitimate multi-hour $0 stretches during prep.

**D7 — The interlock audit stays in scope, reduced.** Not a rewrite of `augfarmer.js`'s state
machine — an enumeration of every state that can hold `available` at $0 **indefinitely**, and a
requirement that each such hold be bounded or escapable. Motivated by a live instance, below.

**D8 — Fold in the two cheap pre-diagnosed fixes:** `share.js` factionless suppress
(`docs/batcher-engine.md:154`, "no design work needed" on 2026-07-18, has cost two consecutive node
entries) and the floor-reserve cold-start cache seed (`:217`). Both are install-boundary bugs and
both are already specified.

---

## 3. Live evidence for D7 — the same shape is running right now

`logs/finance-state.json`, read at 11:26 AM today:

```json
{"money": 5302749.83, "totalReserved": 250000000, "available": 0,
 "reservations": [{"key": "next-port-opener", "label": "SQLInject.exe", "amount": 250000000}]}
```

`computeAvailable` is `Math.max(0, money - totalReserved)` (`src/resourcemanager.js:163`). A
**$250M** reservation against **$5.3M** of cash pins `available` at **$0**, and `cloudmanager`
subtracts `totalReserved` before deciding whether it can buy. So fleet growth is currently fenced
off behind an item costing ~47× the entire balance, with no time bound.

This is structurally identical to the `fundBlocked` bug that cost **53 hours** — reserve 100% of
the balance for something unaffordable, for an unbounded period — and it survived that fix because
the fix was applied to one branch rather than to the pattern.

**Not asserting this is wrong.** SQLInject gates rooting, rooting grows the fleet, so the
reservation may well be correct policy. What is wrong is that it is **unbounded and invisible**:
nothing decides "fleet RAM now beats a port opener later," and nothing notices if that state
persists for two days. That is the decision D7 exists to force.

---

## 4. Rejected alternatives

**R1 — Throughput/money tuning as Phase 35.** Tempting: money is BN5's binding constraint. Rejected
because the install boundary is a *larger, better-measured* money lever than per-target tuning, and
because ~30% of the node being structurally idle should be fixed before optimising the ~70% that
runs.

**R2 — Fire the gang tripwire on the $5,444/s reading.** Rejected 2026-07-26; recorded in
`CLAUDE.md`. **Corrected the same day by Q1's resolution, and the correction matters:** $5,444/s
was the *deadlocked* rate, not a steady state. The healthy measured rate is **~$412k/s**, which is
**~36×** below the $15M/s threshold rather than ~2,750×. Rejecting the fire was still right — but
for a better reason than "the number came from a bug": a 36× gap is closable by fleet growth alone
(income scales with fleet, and the fleet was ~1 TB), so the batcher has not been shown to be
structurally inadequate here. Re-armed for 2026-08-02 behind a ≥24h-of-batch-placement
precondition, and it should be re-evaluated against $412k/s+, never against $5.4k/s.

**R3 — A general monitoring/alerting platform.** Rejected per D5. Detection is not the gap;
21.7h of unread `STALLED` proves it.

**R4 — Reduce the number of installs to avoid the 9h cost.** Rejected: installs *are* the mult
ratchet, and mult is what closes the 4,500 gate. Fewer installs is a slower clear. The cost to
attack is the per-install overhead, not the count.

**R5 — Rewrite `augfarmer.js`'s trigger state machine.** Rejected as disproportionate. 2,902 lines,
load-bearing, and the observed failures are all "a hold with no bound" rather than wrong logic. D7's
enumeration is the cheap 90%.

---

## 5. Open questions

**~~Q1 — Is the $197,883/s hour real?~~ — RESOLVED 2026-07-26, same session. It is real, and the
hourly bucket *understated* it.** `hackingCum` is `ns.getMoneySources().sinceStart.hacking`
(`src/goallog.js:218`) — the game's own hack-only accounting, so it cannot be a sale or a
spend-down. Re-sampled at the native 60s resolution across that hour, two distinct regimes appear:

- **t−68m → t−29m:** a smooth **$0.66M every single minute** ($10.9k/s), every sample, no gaps —
  the small-target drip while the fleet was still fenced in behind the deadlock.
- **t−28m → t+0m:** the shape changes completely — **~$74.7M arriving in one 60s sample, then 2–5
  minutes of exactly $0, then another ~$74.7M.** Nine clean payouts, remarkably consistent
  ($74.33M–$75.21M). That is textbook HWGW batch cadence: a batch lands its entire steal at once,
  the next takes minutes to cycle. Against harakiri-sushi's **$100M** max money at
  `moneyFraction: 0.9`, ~$74.7M per batch is exactly the expected drain.

**Measured over that 28-minute window: $691.66M / 1,680s = ~$412,000/sec** — on a **1,036 GB**
fleet against a single $100M target.

**Implications, and they are large:**
1. **The healthy batcher is ~$412k/s, not $5.4k/s.** The figure quoted all week (and written into
   the 07-25 CHANGELOG) was the *deadlocked* rate. Everything sized against $5.4k/s is wrong by
   ~76×.
2. **R2's arithmetic was wrong and is corrected below** — the gang tripwire's $15M/s threshold is
   **~36× away**, not ~2,750×. Still short, but that is a reachable gap given the fleet was barely
   1 TB, not a structural verdict on the node.
3. **Fleet size is the whole game.** At $412k/s, a $2–4t node budget takes **~56 days**; at a 10×
   fleet it takes **~5.6 days**. The node's timeline is a fleet-acquisition problem almost to the
   exclusion of everything else — which promotes **D3 and D4 from supporting items to the phase's
   real centre**, and makes §3's $250M reservation pinning `available` at $0 an active, ongoing
   cost rather than a tidiness concern.
4. **The 9h dead window is worth ~$13.3b per install** at the pre-install rate, and more each cycle
   as the fleet grows.

⚠️ **Caveat kept deliberately:** 28 minutes and nine payouts is a solid sample of *that* fleet
against *that* target, not a durable steady-state figure. It should be re-measured once the
current rebuild completes.

**Q2 — What is the 9h actually spent on?** Prep (grow/weaken produce $0 by definition) is the
presumed answer, and `daemon-status.json` showed `prepped: false` with `commitPct: 36.8%`
consistent with it. But 9h is long, and it is not yet distinguished from re-rooting, waiting on
cash, or floor-seating a target too expensive for a 524 GB fleet. **Note the standing lesson from
`docs/batcher-engine.md:205`: four confident hypotheses were formed from indirect signals on
2026-07-24 and all four were wrong.** Instrument the window before theorising about it.

**Q3 — Is 9h even compressible, and by how much?** D2 assumes it is. If most of it is irreducible
prep time on a fresh fleet, the phase's headline payback evaporates and D3/D4 become marginal
gains. **Needs a target number before the spec commits.**

**Q4 — Does the growth-buy inversion (D3) actually help post-install, or only at steady state?**
The arithmetic (1× vs 2× $/GB) is not in dispute. What is unknown is whether more, smaller hosts
shorten the dead window or lengthen it — `hack` must still fit whole on one host
(`docs/batcher-engine.md:196`), so a wide-and-shallow fleet could fail to place batches even while
holding more total RAM. This is the counter-argument the backlog flags, and it is a real one.

**Q5 — How much home RAM should D4 buy, and out of what budget?** It competes directly with the
aug ratchet for the same cash at the same moment. Unresolved: whether pre-install home RAM should
have a ceiling, a fixed fraction, or only spend residual cash the spend-down did not consume.

**Q6 — What is the alert channel for D5?** A `/schedule` routine can run, but where does the alert
land so it is seen while Kenneth is asleep or away? An unread alert file reproduces the exact
failure this phase exists to fix.

**Q7 — Should the port-opener reservation (§3) yield to fleet growth?** Needs a rule, not a
one-off. Related: whether reservations should carry an age, so "held at $0 for N hours" becomes a
detectable state rather than a silent one.

**Q8 — Does Phase 34's escalation-aware install timing already account for the 9h?**
`docs/phases/phase-34-install-timing.spec.md` shipped install-timing logic that weighs waiting
versus installing-and-rebuying. If its model omits the recovery cost, its decisions are
systematically biased toward installing too often. **Check before adding anything new.**

---

## 6. Not in this phase

- Gang creation (tripwire re-armed for 2026-08-02, default stay batcher-only).
- The SF5 live multiplier sweep (`CLAUDE.md` first-task item 1) — unrelated, still open.
- Per-target realized-income logging (`docs/batcher-engine.md:230`) — adjacent, deliberately
  deferred so this phase does not become a general observability project.
- The aug-scoring mult-per-dollar bug (`BACKLOG.md:65`) — real, but a ratchet-quality issue rather
  than an install-boundary one.

---

## 7. Next stage

Stage 2 is the spec (`phase-35-install-boundary.spec.md`) plus a cold-context `spec-reviewer` pass.
**Q1 blocks it** — the phase's headline number is wrong by 36× in one direction or the other until
that is resolved, and Q2/Q3 determine whether D2 survives as the primary workstream at all.
