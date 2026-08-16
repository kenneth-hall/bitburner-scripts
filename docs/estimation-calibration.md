# Estimation calibration — how wrong were we, and in which direction?

**Purpose.** Every BitNode run produces a stream of stamped ETAs. This file scores them against
what actually happened, so the *next* set of estimates can be corrected rather than re-derived
with the same bias. Read it before quoting any time-to-clear figure.

**The one-line takeaway:** *measured* estimates were **systematically pessimistic** because they
froze a rising rate; the one *underived* estimate was **wildly optimistic**. Two opposite errors,
two different causes, and the dangerous one was the number nobody had derived.

---

## BN6.1 — the full scorecard (2026-07-29 → 2026-08-16)

**Actual: 18 days wall-clock from entry to the final black op.** ~4 of those ran the wrong path
(hacking-primary, 07-29 → 08-02), so the Bladeburner clear itself was **~14 days** — rank 0 →
400,000 plus the 21-op ladder.

| Date | Estimate | Actual outcome | Error |
|---|---|---|---|
| 07-29 (pre-entry) | **10–20 days** via batcher/hacking | that path later *measured* **240–323 days** | 🔴 **15–30× OPTIMISTIC** |
| 07-29 | ~5–6 months, Bladeburner at zero investment | 14 days | ~11× pessimistic |
| 07-30 | ~10.5 months, after the live trial | 14 days | ~22× pessimistic |
| 08-02 | ~570 days for contracts alone | 14 days | **~40× pessimistic** |
| 08-06 | **9–25 days, central ~14** | 10 days remained | central **40% high**, ✅ range correct |
| 08-07 | ~15–19 days | 9 days remained | ~2× pessimistic |
| 08-08 | ~20.2 days | 8 days remained | ~2.5× pessimistic |
| 08-11 | ~15–20 days (Phase 40 pitch) | 5 days remained | ~3–4× pessimistic |
| 08-13 | ~3.2 days | 3 days remained | ✅ accurate |

---

## Failure mode 1 — freezing a rising rate (systematic, predictable, recoverable)

Every measured ETA took the *current* rank rate and extrapolated it flat. But the rate was
**self-improving**: `Tracking` auto-levels on success, and rank/action grows multiplicatively with
level while action time grows only linearly. Measured hourly rates across the run:

`420 → 1,033 → 2,121 → 2,800 rank/hour` — roughly **doubling every ~3 days**.

📌 **That is why the error shrank monotonically as the clear approached.** Less remaining time means
less compounding left to under-count. The 40× miss at 08-02 and the perfect call at 08-13 come from
*the same method* applied at different distances — the method wasn't improving, the horizon was
shortening.

⚠️ **We even noticed this in flight** (08-11: *"the trajectory is SELF-IMPROVING, and the ETA is
therefore conservative"*) and still never went back to re-score the standing numbers. **Noticing a
bias is not the same as correcting for it.**

**Correction rule for next time:** before quoting an ETA off a rate, ask *"is this rate a constant
or a trajectory?"* If any mechanic makes it climb — action auto-levelling, compounding multipliers,
a ratchet — a flat extrapolation is an **upper bound**, not an estimate. Say so, or fit the trend.

---

## Failure mode 2 — the underived number (rare, invisible, and the dangerous one)

**"10–20 days" for the batcher path was written pre-entry and had no derivation anywhere in the
repo** — found only when `bn6-go-no-go.md` went looking for it. Measured, it was **240–323 days**.

The asymmetry matters: the pessimistic errors were *conservative* and cost nothing but confidence.
This one nearly picked the wrong win path for the entire node, and it did so while sounding exactly
as authoritative as the measured figures beside it.

📌 **Rule: an estimate with no derivation is not an estimate. Mark it, or delete it.** Sibling of the
standing rule *"an estimate is not a measurement."*

---

## The trap that makes all of this hard to notice

🔑 **The headline number was accidentally right.** Pre-entry: *"10–20 days."* Actual: **18 days.**
Looks like a hit — and is worthless as evidence:

- that estimate was for a path we **abandoned**, which was 15–30× wrong;
- the path we **actually took** was simultaneously being estimated at **5–6 months**;
- both components were badly wrong, in opposite directions, and the top-line landed in range by
  coincidence.

⚠️ **When a forecast "verifies," check whether the reasoning survived — not just the number.** A
correct total built from two compensating errors teaches nothing and validates a broken method.

---

## Corrections to apply to the current (2026-08-16) node estimates

The next-node figures in `bitnodes.md` anchor on BN6's **realised** curve, so they already embed the
self-improvement and should not repeat failure mode 1. Two live cautions:

- **Expect the central value to run ~40% high.** The only genuinely comparable prediction
  (08-06's "9–25 days, central ~14" against an actual 10) had its centre 40% over and its **range
  correct**. So read BN10's ~18 days as plausibly **13–15**, and trust the range over the point.
- **The Bladeburner scaling model rests on n=1.** BN6 at multiplier 1.0/1.0, linearly extrapolated
  to other nodes' 0.6–0.98. That is the same structural weakness that produced the 5–6 month and
  570-day figures: extrapolating a single measurement without knowing which way it bends.

---

## How to add a row

When a node clears, add its scorecard here in the same shape: every stamped ETA, what actually
happened, and the error with its **direction**. The direction is the reusable part — a consistent
sign means a correctable bias; random scatter means the model is simply unfit.
