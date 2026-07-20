# Phase 28 — gang rep pivot (2026-07-20)

**One-line:** the gang manager optimized for money; money is worthless to us and the money
ladder was destroying the thing that isn't (reputation). Ladder pinned to Ransomware.

Shipped without the full three-stage workflow — the code change is one array plus renames, and
it's reversible. This doc exists because it **reverses a decision that shipped three days ago**
(Phase 27 Tier 1), and that reasoning is the part worth keeping.

---

## What was wrong

Tier 1 built a five-rung ladder ordered by money, and a promote/demote experiment that asked one
question per rung: *did money go up?*

```
Ransomware -> Phishing -> Identity Theft -> Fraud & Counterfeiting -> Money Laundering
```

The ladder is sorted by money, so the answer was almost always yes. Nothing in the test asked what
a promotion cost in wanted level.

Measured from `logs/gangprobe-1784562548352.json`:

| task | respect | wanted | respect ÷ wanted |
|---|---|---|---|
| **Ransomware** | 0.00005 | **0.0001** | **0.50** |
| Phishing | 0.00008 | 0.003 | 0.027 |
| Identity Theft | 0.0001 | 0.075 | 0.0013 |
| Money Laundering | 0.001 | 1.25 | 0.0008 |
| Ethical Hacking (sink) | 0 | −0.001 | — |

Promoting Ransomware → Identity Theft **doubles respect and multiplies wanted by 750**. Sustaining
one member on Identity Theft (+0.075) needs ~75 members on the sink (−0.001) to offset. We have 7.

So the gang climbed, overwhelmed its own cooling, hit the watchdog, dumped all seven members onto
Ethical Hacking, cooled just under the exit line, and climbed again — **140 cycles in 4.3 hours,
71.6% of its life in the sink**, where `respectGainRate` is exactly 0.

## Why that mattered

We are **rep-gated, not money-gated.** Measured the same day: $4.128b held, and the augmentation
the ratchet is chasing (Neurotrainer I) costs **$4m** — but needs 1,000 NiteSec reputation against
~41 held.

Respect is what generates faction reputation (`docs/gang-api.md:42`, and it bypasses BN2's Work Rep
50% / Passive Rep 0% nerfs). Gang *money* is ~$918k/hr against a batcher funding $30b server
upgrades — about 0.003% of income, i.e. noise.

The gang was carefully optimized for the one output that doesn't matter, at the direct cost of the
one that does.

## The change

`TASK_LADDER = ["Ransomware"]` (renamed from `MONEY_LADDER`, which had become actively misleading).

The climbing machinery is **left intact, not deleted** — with a one-entry ladder `evalPromotion`
hits its existing "top rung, nothing to probe" early exit and goes quiet. Re-adding rungs switches
it back on.

Expected steady state: 7 members generate 0.0007 wanted/tick on Ransomware; one member on the sink
removes ~0.001/tick. The gang should run essentially all-earning with rare brief cooling.

### Decision: pin, don't make the yardstick adaptive

The considered alternative was keeping the experiment and changing its measure to respect-per-heat.
Rejected on Kenneth's reasoning: **that optimizes for a mechanic we haven't unlocked.** At 7
members and hack ~113 we are nowhere near the scale where climbing could pay, so adaptive machinery
would be guarding a decision that cannot currently change. Pinning is one line and one line back.

### Bug caught pre-ship

Pinning the ladder left real persisted rungs of `2` in `gang-state.json`. Unclamped,
`ladder[2]` is `undefined`, and `setMemberTask(name, undefined)` **silently idles the member**
rather than throwing — the whole gang would have gone Unassigned on restart. `rebuildRungs` and
`planAssignments` now clamp; regression test added.

## Validation

- `npm test` — 704 tests, 26 files (was 702; +2 for the clamp and the pin).
- Multi-rung machinery stays covered via an injected `FIXTURE_LADDER` in tests, so pinning the live
  ladder didn't quietly delete coverage.
- Live: `gangmanager.js` restarted (pid 299479), all 7 members converged to a single task within
  one tick, no member stranded on `Unassigned`.

**Acceptance is not yet confirmed** — at restart the gang was still carrying the old regime's heat
(wantedLevel 53.7, deviation 0.0126 vs the 0.005 exit threshold), so it is draining before it can
demonstrate the new steady state.

**Check in a few hours, against `logs/gang-log.json`:**
1. Sink duty cycle — baseline **71.6%**, target near zero. (`sink-enter`/`sink-exit` pairs.)
2. `respectGainRate` non-zero for the large majority of ticks — baseline ~0.00020 respect/tick.
3. NiteSec rep climbing — read `deficit` in `logs/augfarmer-state.json`; it was 958.9 of 1,000.

If duty cycle does *not* drop substantially, the pin is not the fix and this doc's premise is
wrong — the next suspect is the watchdog's own thresholds, which were calibrated in a regime
generating 750× more heat and were deliberately left untouched here rather than tuned blind.

## Not done here

Equipment (Tier 2), ascension (Tier 3), territory (Tier 4) remain deferred — see `BACKLOG.md`.
Tier 2 is now fully costed and unblocked (`gangprobe.js` captures cost + type as of `1edfcc6`):
5 hacking-relevant rootkits, **$203.58m/member for ~×1.71 hack, ~$1.43b for all seven.**

**Sequencing note:** Tier 2 was deliberately *not* bundled with this change. Equipment raises stats,
which would confound the duty-cycle measurement above and leave us unable to attribute any
improvement — or to know which change to back out if there isn't one.
