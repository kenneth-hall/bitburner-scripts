# BN6 go/no-go — should we continue, or retreat and regroup?

**Written 2026-08-06 (evening). Cold-readable: assumes no memory of the conversation that produced it.**

**Question asked:** *"BN6 feels like the slowest node so far. I'm at 8.4% of the Bladeburner rank goal
after 8 days. I can't tell if we're making progress or if we're going to hit a logarithmic wall.
Should I continue, or retreat and grind up previous BitNodes to regroup?"*

This document is an analysis, not a plan change. It touched no game state and no other file. Every
number below is sourced; anything that is an estimate rather than a measurement is flagged 🚩 per the
repo's standing method rule (*"an ESTIMATE is not a MEASUREMENT"* — any `ns.bladeburner` value whose
name contains `Estimated` returns a **range**, and a single-point read of one is not evidence).

---

## 0. Bottom line up front

| | |
|---|---|
| **Reconciled standing** | **rank 33,730 / 400,000 = 8.43%** — Kenneth's number is right, `CLAUDE.md`'s 19,571 / 4.9% is **23 hours stale** |
| **Linear or logarithmic?** | **Neither — it is measurably SUPERLINEAR.** Rank ≈ quadratic in time. Rate is *rising* ~0.056 rank/s per day |
| **Time to 400,000** | **9–25 days**, central ~14. The whole width is one unmeasured question (§4.1) |
| **Recommendation** | **Continue Bladeburner-primary in BN6** (full statement + costs in §7) |
| **Biggest risk** | Tracking is at action **level 99** and **no level cap has ever been measured**. If levels cap at 100, the acceleration dies within a day |

**Kenneth's premise is half right and it matters which half.** BN6 *is* the slowest node — 8 days in
with ~14 to go projects **~22 days**, against BN2's 5 and BN5's ~6. That feeling is accurate and
should not be argued away. But "slowest" and "walling" are different claims, and the second one is
false: the rank curve is accelerating, not decaying.

---

## 1. Reconciling 4.9% vs 8.4% — Kenneth is right

`CLAUDE.md` records *"Current standing 2026-08-05 (re-checked live, 9:15pm): rank ~19,571 / 400,000
(4.9%)"*. Kenneth reports 8.4%. Both are correct; they are 23 hours apart, and the rate rose in
between.

| Source | Reading | Timestamp |
|---|---|---|
| `logs/goal-log.json` hourly bucket | 19,414 | 2026-08-05 21:57 ET |
| `CLAUDE.md` | ~19,571 | 2026-08-05 21:15 ET — ✅ accurate when written |
| `logs/bladeburner-state.json` | 33,633.00 | 2026-08-06 20:23 ET |
| `logs/goal-state.json` | 33,729.67 (**8.4%**) | 2026-08-06 20:33 ET |
| `node tools/bb/cli.mjs stats` (live, CDP up) | corroborating — Hack 93, Dex 155, Agi 154 | 2026-08-06 20:2x ET |

**19,571 → 33,730 in ~23.3 h = 14,159 rank = 0.169 rank/wall-sec.**

That is not a data error and it is not a doubling of anything real — it is one day of progress at a
rate that is now **23% higher than the 0.1371 rank/s `CLAUDE.md` records**. Two figures in `CLAUDE.md`
are therefore stale and should not be quoted:

- 🚩 **"rank ~19,571 / 4.9%"** → actual 33,730 / 8.43%
- 🚩 **"0.1371 rank/wall-sec (24h) → 32–38 days"** → last-24h measured **0.1688 rank/s**; and a frozen-rate
  projection is the wrong model anyway (§2)

Also stale: `CLAUDE.md` records skill points **4,033** and skills *Blade's Intuition 25 / Digital
Observer 25 / Tracer 25 / Overclock 17*. Live state reads **8,819 SP** and adds **Reaper 6 / Evasive
System 6**.

### 1.1 The reframe that actually answers the worry

Rank is not 8.4% after 8 days of Bladeburner. It is 8.4% after **3.5 days** of Bladeburner.

`logs/bladeburner-attempts.json` starts 2026-08-03 13:22 UTC at rank **3,038**. The current engine
(`bladeburnermanager.js`, Phase 39) has been running 84.0 hours.

- **Days 1–5 (node entry 07-29 → 08-03):** 0 → 3,038 rank = **9.9% of current rank**
- **Days 5.5–8 (08-03 → 08-06):** 3,038 → 33,730 = **90.1% of current rank**

Those first five days were the combat-gate grind, the Bladeburner join, the failed trial, and the
two win-path reversals. They are sunk and they are not representative of anything. **Judging the
engine on an 8-day denominator understates it by 2.3×.**

---

## 2. Linear or logarithmic? — Measured: superlinear, ~quadratic

**Verdict: d(rank)/dt is RISING, monotonically, and the mechanism is understood and formula-clean.**
This is a measurement with three independent confirmations, not an opinion.

### 2.1 Evidence 1 — the raw hourly rate series (`logs/goal-log.json`, 2,880 samples @ 60 s, 44.4 h)

| Window | Measured rate |
|---|---|
| First 24 h of window | **0.1203** rank/s |
| Last 24 h | **0.1688** rank/s |
| Last 12 h | 0.1700 rank/s |
| Last 6 h | 0.1647 rank/s |

Hourly buckets climb 0.1025 → 0.1945 across the window. There are dips (0.082, 0.086, 0.131) and
every one of them coincides with a logged install or yield event — noise around a rising trend, not
decay.

### 2.2 Evidence 2 — curve fits

| Model | Fit quality | Days to 400,000 from now |
|---|---|---|
| Linear (`rank = 0.1483·t + b`) | r² = 0.99129 | 28.6 |
| **Quadratic** (`rank = 3.257e-7·t² + 0.0985·t + 10135`) | **r² = 0.99949** | **9.2** |
| Power law, free virtual origin (k = 2.70) | r² = 0.99964 | 7.5 — 🚩 **discard, the free origin overfits** |

Quadratic beats linear decisively (residual variance cut 17×). The fitted acceleration is
**+6.515e-7 rank/s² = +0.0563 rank/s per day**, which independently reproduces the observed
0.1203 → 0.1688 climb.

Note what is *absent*: a logarithmic or saturating model is not merely a worse fit, it has the wrong
sign. Nothing in 44 hours of data bends downward.

### 2.3 Evidence 3 — the mechanism (this is the strong one; it is not curve-fitting)

From `logs/bladeburner-attempts.json`, per-action values pulled straight from the API. **Critically,
these are `getActionRankGain` and `getActionTime` (`bladeburnermanager.js:296-315`) — neither
contains `Estimated`, so neither is a range.** The only `Estimated` value in the engine is `pMin`,
and it affects action *choice*, not this fit.

Tracking, levels 43 → 99 (56 consecutive levels, autolevel on):

| Quantity | Scaling per action level | Fit |
|---|---|---|
| **rank gained per action** | **× 1.0410** | exact — identical ratio at all 56 levels, zero noise |
| action time | × 1.01958 | r² = 0.9971 |
| ⇒ **rank per second** | **× 1.0210** | derived |
| time to gain one more level | × 1.02003 | r² = 0.38 (noisy) |

The reward-per-action grows at **4.10%/level** while its time cost grows at only **1.96%/level**. That
surplus is why there is no wall.

And the load-bearing coincidence: **time-to-gain-a-level (1.02003) ≈ action-time growth (1.01958)** —
because leveling takes a roughly fixed *number* of successes, so the level treadmill slows at exactly
the rate actions lengthen. Therefore:

```
d(rate)/dt  ∝  (1.0210 / 1.02003)^level  =  1.00096^level  ≈  constant
```

**Constant d(rate)/dt ⇒ rate linear in t ⇒ rank quadratic in t.** The mechanism predicts exponent
**2.05**; the curve fit measured **~2**. Two independent derivations agree.

### 2.4 The two candidate decay mechanisms — checked, both negative

The brief asked specifically whether a falling **action rate** or falling **success** could produce a
log wall. Both were checked:

- **Success (`pMin`): no decay.** 1,123 attempts with predictions; 947 read exactly `1.0000`. Tracking
  held `pMin = 1.0` continuously from level 48 to level 99.
- **Action rate: falls far slower than action time rises** — see §2.5, this is the good news, not the bad.

The one dramatic-looking `pMin` collapse is a trap, and it is the *same* trap the repo already
retracted a conclusion over. At 2026-08-07 00:40 UTC, Tracking level 99 read `pMin = 0.0526`, then
recovered 0.19 → 0.28 → 0.44 → 0.76 → 0.96 → 0.9995 over ~40 minutes. **A real success chance cannot
climb monotonically like that in 40 minutes.** That is an *estimate re-converging* as chaos was
worked off — Ishima chaos warned at 16.13 at exactly 00:40. 🚩 **Do not record this as a success-rate
collapse.** It is, however, a real engine defect — see §5.5.

### 2.5 Bonus: this partly answers open question Q13, and the answer is favourable

Q13 asks whether per-action stamina cost is **flat** or **proportional to action time**. It is listed
as the cheap high-leverage next measurement. Existing data already constrains it.

Deriving true completed actions as `(rank gained per hour) ÷ (rank per action at that level)` over
Tracking-pure hours:

| Hours | Mean action time | Mean actions/hour |
|---|---|---|
| 0–11 (levels 75–83) | 38.9 s | **57.9** |
| 24–35 (levels 90–96) | 51.1 s | **52.7** |

Action time rose **+31.4%**; actions/hour fell only **−9.0%**.

- Pure **proportional** cost predicts −23.9%.
- Pure **flat** cost predicts −0%.
- Observed −9.0% ⇒ **roughly 62% flat, 38% time-proportional.**

**Independent cross-validation:** Q10 measured 55.8 sustainable actions/hour at a 51 s action time
(`src/q10probe.js`, 593 samples). This derivation gives **52.7 at 51.1 s** — agreement within 6%, from
a completely different data path. That agreement also validates the `getActionRankGain` chain that
§2.3 rests on.

**Q13 leans FLAT.** That is the deeper reason the acceleration is real: rising action level buys
4.1%/level more rank for a stamina cost that is mostly *not* paid in proportion to the longer action.

### 2.6 Projection — an honest band, not a number

| Scenario | Assumption | Days to 400,000 |
|---|---|---|
| **Pessimistic** | acceleration stops today; rate frozen at measured 0.1688 | **25.1** |
| **Central** | measured acceleration persists (quadratic fit) | **9.2** |
| Mechanistic cross-check | `rank ∝ t²` from virtual origin 2026-08-01 23:00 | 12.4 |

**Honest answer: 9–25 days, central ~14.** Refusing to narrow it further is deliberate — the spread is
not statistical noise, it is one binary unmeasured fact (§4.1). The 28.6-day linear-fit figure is
**not** a legitimate third scenario: it averages the slower past into the forecast and is therefore
*worse* than the frozen-current-rate bound, which is incoherent as a lower bound on performance.

---

## 3. Pricing the three options

### (A) Continue Bladeburner-primary in BN6 — **9–25 days, central ~14**

Levers ranked by measured or best-estimable payoff:

| # | Lever | Payoff | Confidence | Cost/risk |
|---|---|---|---|---|
| 1 | **Actually stop installs** | **≥4.0% of wall time**, plus an uncounted stamina crater | ✅ measured | zero — a file edit |
| 2 | **Measure the action-level cap** | resolves the entire 9↔25-day spread | — | ~5 min, read-only |
| 3 | **Flip `objectiveMode` to per-action** | up to **2.09×** on action choice | 🔵 partly measured (§2.5) | code edit; needs #4 to pay fully |
| 4 | **Answer Q11 → unlock Stage B** | Raid scores **1.83× per-sec / 2.09× per-action** vs Tracking | 🚩 score is an `Estimated`-derived figure | HP risk; Q14 also open |
| 5 | **Chaos management** | recovers ~1,066 rank per bad episode | ✅ measured | budget already exists, unused |
| 6 | **Re-examine the code skill caps** | 8,819 SP sit idle | ❓ unknown | needs a fresh look at Reaper / Evasive System |
| — | ~~Overclock~~ | **dead — Q10 measured, do not revisit** | ✅ | — |

**On lever 1 — installs are still firing.** `logs/ratchet-log.json` records **install #43 at 2026-08-06
19:40:12 ET**, i.e. *after* `CLAUDE.md` records the cadence as stopped. `src/ratchet-mode.txt` in the
repo now reads `observe`, so the repo side is correct, but this is exactly the landmine `CLAUDE.md`
already documents (the file is gitignored *and* pushed by viteburner). The measured cost:

- `postInstallSec` = 10,504 s of 263,438 s wall = **4.0%** (direct, counted)
- **`staminaMax` cratered 136.50 → 76.85** at that install — a **44% cut to the stamina pool**, which is
  the actual throughput limiter. This is *not* counted in the 4.0%, so the true install tax is
  materially above the recorded 5.4%. History shows the same crater repeatedly: 110.5 → **49.98**,
  105.6 → **8.28**, 92.2 → **9.62**, 116.8 → **22.34**.

**On lever 6 — the caps are hard-coded, not adaptive.** `bladeburnermanager.js:141-148` sets
`SKILL_LEVEL_CAP` = Blade's Intuition 25 / Digital Observer 25 / Tracer 25 / Overclock 17 / Reaper 6 /
Evasive System 6. Skill buying stopped **2026-08-04 19:17** and 8,819 SP have been idle since. Overclock's
hold is correct and settled. But Reaper and Evasive System are capped at **6** and touch combat stats —
which drive `staminaMax`, which is the binding constraint. That cap has not been revisited since Q10
reframed stamina as the limiter.

**Efficiency headroom (measured, `logs/bladeburner-state.json`):**

```
rankProducingSec 167,574   (63.6%)
overheadSec       90,963   (34.5%)   <- stamina regeneration + engine overhead
yieldedSec         4,293    (1.6%)
idleSec              609    (0.2%)
```

**36.4% of wall clock produces no rank.** Note this contradicts the engine's own self-reported
`dutyCycle` of 0.98 — `dutyCycle` counts regeneration as on-duty. 🚩 **Do not quote `dutyCycle` as an
efficiency measure.** (`restarts: 17` is also worth a look, separately.)

### (B) Flip to batcher-primary in BN6 — **the "10–20 days" estimate is dead**

This is the single largest correction in this document.

`docs/bn6-playbook.md:82-84` says *"Honest estimate: **10–20 days**, versus ~5 for BN5."* 🚩 **No
arithmetic for that figure exists anywhere in the repo** — it is a qualitative anchor to BN5's clear,
written 2026-08-02. It is now contradicted by measurement:

| Source | Measured | Days to M = 30 |
|---|---|---|
| `logs/goal-state.json` `forecast.daysToGate` (44.5 h basis) | M/day = 0.1272 | **219.3** |
| `logs/ratchet-log.json`, last 7 installs over 5.46 d | M/day = 0.0931 | **300** |

Current **M = 2.096 of ~30 needed = 7.0%**. Peak hacking level reached in BN6 is **228** against a
**6,000** gate. Per-install mult gain is *decaying*: #37 +0.205, #38 +0.164, #39 +0.108, #40 +0.037,
#41 +0.038, #42 +0.039.

**This is the actual logarithmic wall — and it is in option B, not option A.** The batcher ratchet is
decelerating while Bladeburner accelerates. The two measurements point the same direction.

**Blocker: option B is 219–300 days by measurement vs 14 by measurement.** The recorded tradeoff
("batcher is probably the faster bet, Bladeburner is chosen for engine value") is **no longer true and
should be retired.** Bladeburner is now faster *and* banks the engine. 🚩 `CLAUDE.md`'s standing
instruction — *"Never restate this as 'Bladeburner is faster'"* — was correct on 2026-08-02 evidence and
is **falsified by 2026-08-06 evidence**; this is a legitimate reopen under the "new evidence" clause,
and it is the *third* thing in this doc that turns on a number nobody had re-measured.

*Caveat, stated at lower weight:* the 219-day figure is a linear projection of a compounding process,
so it is pessimistic in principle. But the per-install deltas are falling, not rising, so the
compounding is not currently visible. It would need to improve **15×** to match option A.

### (C) Retreat to previously-cleared BitNodes — **buys nothing, costs everything**

| Source-File | Held | Available from a retreat |
|---|---|---|
| SF1 (BN1) | **3 / 3 — MAXED** | **nothing at all** |
| SF2 (BN2) | 1 / 3 | +12pp crime success / crime money / charisma |
| SF5 (BN5) | 1 / 3 | +4pp **hacking** mults |
| SF4 | 3 / 3 (save-edit grant) | — |
| SF6 (Bladeburner) | **0 / 3** | only by *clearing BN6* |

**Blocker 1 — nothing on offer touches Bladeburner.** Rank gain is driven by action level, combat
stats, stamina and chaos. SF2 is crime success/money/charisma (**not crime exp**); SF5 is hacking mults.
Neither touches any Bladeburner input. The only SFs that do are **SF6** (+8/12/14% combat level & exp —
BN6's own reward) and **SF7**.

**Blocker 2 — you cannot play Bladeburner in a cleared node at all.** Division access requires being in
BN6/BN7 *or* holding SF6/SF7, and both read **0** (`docs/bladeburner-reference.md:36,55`). A retreat means
Bladeburner progress is **exactly zero** for its entire duration — against an option-A clock of ~14 days.

**Blocker 3 — the 33,730 rank and 8,819 SP are probably forfeit.** 🚩 **This is an inference, not a
measurement, and must not be recorded as one.** What the repo actually asserts: rank and SP survive
*augmentation installs* — that qualifier is explicit and is **not** a claim about node changes. The
in-game BitNodes doc's persistence list is exhaustive and excludes rank: *"Persists across destruction:
Source-Files, scripts on home, Intelligence."* Skills are separately documented as scoped to *"the
BitNode where they were purchased."* Nobody has ever changed nodes holding rank, so this is untested —
but the asymmetry is decisive: **upside zero (blockers 1–2), downside possibly total.** It does not need
to be measured to be rejected.

**Blocker 4 — SF1 is already 3/3.** BN1 grants literally nothing.

**Honest read: option C is motivational, not mathematical.** There is no version of it that returns to
BN6 faster than not leaving. If the real driver is fatigue rather than throughput, that is a legitimate
reason to take a break — but it should be named as that, and it should not be dressed up as a
strategy, because the arithmetic does not support one.

---

## 4. Where this analysis could be wrong

### 4.1 🔴 The load-bearing unknown: is there an action-level cap?

Everything in §2.3 assumes action level keeps rising. **Tracking is at level 99. No level cap has ever
been measured, and 99 is one below a suspiciously round number.**

- If levels continue: **~9–12 days**.
- If they cap at 100: the acceleration dies within ~24 h and the timeline reverts to the frozen-rate
  **~25 days** — possibly worse, because action time would stay long while reward stopped growing.

**This single unmeasured bit is the entire 9↔25-day spread**, and it is read-only and cheap to settle.
It should be the next measurement — **ahead of Q13, which §2.5 has already partly answered.** That is
a direct amendment to `CLAUDE.md`'s *"➡️ Next measurement is Q13, and it is cheap"*.

Suggestive but not conclusive: the engine began alternating into Investigation at 2026-08-06 16:36 UTC,
right as Tracking passed 97. That is more likely crossover scoring than a cap, but it has not been
checked.

### 4.2 Contract depletion — unquantified

Ishima holds 11,005 contracts and 14,990 operations (regenerating — the counts are fractional). At
~53 actions/hour over 14 days that is ~17,800 actions, which is the **same order** as supply. Not
modelled here; no time series of `contractCount` is logged. **Consideration, not a blocker** — supply
regenerates and city rotation is available.

### 4.3 Chaos is rising in the working city

Ishima chaos: 6.45 (08-05) → 8.36 (08-06 04:45) → **15.87** (now). 407 `city-breach-chaos` warnings
logged. The `diplomacy` budget is **completely unused** (`runsThisHour: 0`, `budgetRemainingMs: 720000`).
Other cities are far worse (Sector-12 **1,491**, Chongqing **651**), which constrains rotation.

### 4.4 Numbers I inherited that did not survive checking

| Figure | Recorded as | Actually |
|---|---|---|
| "rank 19,571 / 4.9%" | current standing | 23 h stale → 33,730 / 8.43% |
| "0.1371 rank/s → 32–38 days" | measured | superseded → 0.1688 and rising |
| "batcher 10–20 days" | 🚩 estimate, no derivation | measured 219–300 days |
| "batcher is probably the faster bet" | standing instruction | falsified — Bladeburner is ~15× faster |
| "install cadence STOPPED 2026-08-06" | done | **#43 fired 19:40 ET that day** |
| "installs cost a measured 5.4%" | measured | 4.0% counted **+ an uncounted 44% stamina-pool crater** |
| "skill points 4,033" | current | 8,819 |
| `dutyCycle` 0.98/0.999 | efficiency | **true rank-producing fraction 63.6%** |
| "stamina regen scales with agility" | asserted in an argument list | 🚩 unsourced; still unmeasured |

### 4.5 What is *not* in doubt

The acceleration finding does not rest on any `Estimated` API value. It uses `getActionRankGain` and
`getActionTime` (exact), plus the raw measured rank series, and is cross-validated by Q10's
independently-measured 55.8 actions/hour. The one estimate in the system — `pMin` from
`getActionEstimatedSuccessChance` — affects only which action the engine picks (§5.5), not the trend.

---

## 5. Engine defects found along the way

Recorded because they were found, not because this doc proposes fixing them. **No file was modified.**

1. **Installs still firing** — #43 at 2026-08-06 19:40 ET. Highest-value, lowest-cost fix. (§3A)
2. **Objective function likely wrong.** Engine runs `objectiveMode: "per-second"` while the system is
   stamina-limited (36.4% non-producing) and stamina cost measures ~62% flat. Under per-action scoring
   the last crossover reads Tracking 15.39 vs Raid **32.20**.
3. **8,819 skill points idle since 2026-08-04**, hard-capped in code (`bladeburnermanager.js:141-148`).
   Reaper and Evasive System capped at 6 have not been revisited since stamina became the known limiter.
4. **Diplomacy budget entirely unused** while Ishima chaos rose 2.5× in two days.
5. **`pMin`-based scoring conflates uncertainty with failure.** `bladeburnermanager.js:304` reads
   `getActionEstimatedSuccessChance(...)[0]` — the **minimum** of a range. High chaos widens the range,
   which drops `pMin` without any real change in success, and the engine then flees to a worse action.
   Measured cost of one such episode: the Investigation stint (2026-08-06 16:36 → 08-07 01:33) ran at a
   mean 0.1531 rank/s against Tracking's 0.2749 available, forfeiting **~1,066 rank over 2.4 action-hours**;
   the achieved rate fell 0.1890 → 0.1610. **This is the same `[MIN, MAX]` trap that produced the
   retracted "Raid kills a city" finding, now showing up in the live scoring path.**
6. `restarts: 17`, 16 `livelock-suspected` warnings.

---

## 6. What would change this recommendation

Named triggers with defaults, so this does not quietly renew itself:

| Trigger | Reopen |
|---|---|
| Action level confirmed capped **and** rate flat for 48 h | Re-run §2 on the post-cap data. Do **not** flip to batcher — 25 days still beats 219 |
| Measured rate falls below **0.12 rank/s** sustained 48 h | The acceleration thesis is dead; reopen |
| Rank still under **80,000 on 2026-08-13** (7 days) | Central case has failed; escalate levers 3–4 |
| Contract supply in Ishima trends toward exhaustion | City rotation, not a strategy change |

**Default if none fires: continue, and re-read this doc at 2026-08-13.**

---

## 7. Recommendation

### Continue Bladeburner-primary in BN6. Do not retreat, and do not flip to the batcher.

**Lead with the strongest objection, because it is a real one:** the entire case rests on the action
level continuing to rise past 99, and **that has never been measured**. `rankGain` scales at exactly
1.0410 per level with zero noise — a formula that clean usually has a bound somewhere, and level 99 is
one step from a round number. If that bound is 100, the acceleration stops within a day and the honest
projection reverts from ~14 days to ~25. **Settle this first — it is read-only, ~5 minutes, and it
resolves the entire forecast spread.** It should displace Q13 as the next measurement, since §2.5 has
already partly answered Q13.

**Why continue anyway, even if the cap turns out to be real:**

1. **The wall Kenneth is worried about is not there.** Rank is quadratic in time by three independent
   methods, with the mechanism understood: reward-per-action grows 4.10%/level against a 1.96%/level
   time cost. Success has not decayed once — `pMin` held 1.0 from level 48 to 99.
2. **The denominator is wrong.** 90% of all rank was earned in the last 3.5 days, not spread over 8.
3. **The alternatives are worse by an order of magnitude, by measurement.** Option B is 219–300 days
   against a "10–20 day" estimate that has no derivation anywhere in the repo. Option C is a strict
   loss: SF1 is maxed, no reachable SF touches Bladeburner, the division cannot be entered without
   SF6/SF7, and the 33,730 rank is probably forfeit.
4. **Even the pessimistic branch wins.** 25 days beats 219.
5. **There is uncollected headroom.** 36.4% of wall time produces no rank; installs are still firing
   and cratering the stamina pool 44%; 8,819 skill points are idle; the diplomacy budget is untouched;
   and the objective function is probably the wrong one. None of that is priced into the 9–25 day band.

**Immediate order of operations:** (1) verify installs are actually stopped in-game, (2) measure the
action-level cap, (3) then reconsider `objectiveMode` and the skill caps.

### What this recommendation costs if it is wrong

**If the action level caps at 100 and the other levers deliver nothing**, the cost is roughly
**11 extra days** (25 vs 14) — BN6 finishes around day 33 instead of day 22. That is real, and it is
about two full prior-node clears. But it is not a wasted 11 days: rank is monotonic, it survives
installs, and the only alternative that recovers the time (option B) measures **219–300 days**, so
there is no faster path to fall back to.

**The genuinely bad branch is narrower than that**: action level caps **and** contract supply binds
**and** chaos keeps climbing, which together could push the rate *below* 0.12 rank/s and past 40 days.
§6 has a tripwire for exactly this at 0.12 rank/s sustained over 48 hours.

**What it costs if the retreat option is wrongly rejected:** essentially nothing measurable. There is
no arithmetic under which option C returns to BN6 sooner than not leaving. The only real cost of
rejecting it is **motivational** — if the true constraint is fatigue rather than throughput, then a
break is a legitimate call that this document cannot make, and it should be named as a break rather
than justified as a strategy.

---

### Sources

Measured: `logs/goal-log.json` (2,880 samples @ 60 s, 44.4 h) · `logs/goal-state.json` ·
`logs/bladeburner-state.json` · `logs/bladeburner-attempts.json` (1,825 entries, 84.0 h) ·
`logs/bladeburner-log.json` (2,000 entries) · `logs/ratchet-log.json` (43 installs) ·
`src/bladeburnermanager.js` · `src/ratchet-mode.txt` · live `node tools/bb/cli.mjs stats`.

Read for context: `CLAUDE.md` · `docs/bn6-playbook.md` · `docs/bladeburner-reference.md` ·
`docs/bitnodes.md` · `docs/gang-engine.md` · `docs/batcher-engine.md`.

No game state was modified. No probe was run. No other file was changed.

---

## 8. MEASURED FOLLOW-UP — 2026-08-06 21:07 CDT (`src/leverprobe.js`, read-only)

`logs/leverprobe-1786067728150.json` — 300 stamina samples over 302 s, plus direct
`getActionMaxLevel` reads. This settles the two questions §7 left open and **falsifies this
document's own central case**.

### 8.1 🔴 The action level DOES cap at 100. The ~14-day central case is dead.

`Tracking` reads **100 / 100**. It has sat there for hours without advancing.

| Action | current / max |
|---|---|
| **Tracking** | **100 / 100** |
| Investigation | 22 / 22 |
| Raid | 7 / 7 |
| Bounty Hunter | 5 / 5 |
| Retirement · Undercover · Sting · Stealth Retirement · Assassination | 1 / 1 |

⚠️ **`current == max` is the normal state for every action** (the engine always operates at the
highest unlocked level), so "at cap" *by itself* proves nothing. The cap conclusion rests on three
things together: the value is exactly **100** where every other action sits at an unround number
still visibly growing (22, 7, 5); Tracking has not moved past it in hours; and the hourly rank rate
**stopped climbing at the same time**.

**The rate confirms it.** Hourly, UTC: peaked **0.1952 at 15:08**, then
`0.1738 → 0.1521 → 0.1541 → 0.1614 → 0.1671 → 0.1686 → 0.1791 → 0.1802` — oscillating in a band,
never again exceeding the 15:08 peak. §2's superlinear fit was **real but is now historical**;
the compounding it measured has ended.

🔑 **This also explains the unexplained 16:40 UTC drop** flagged when this doc's numbers were
first checked (0.2022 → 0.1461). That was not noise and not the install — it was Tracking topping
out, and the engine beginning to alternate into Investigation. §4.1 called that "more likely
crossover scoring than a cap." **It was the cap.**

**Revised projection at rank 34,083 and a plateaued ~0.17 rank/s: ~25 days.** The pessimistic
branch of §7 is now the operative one. (A 302 s window during the probe read 0.1356, but that is
five minutes of a noisy series overlapping install #43's recovery — the hourly series is the
honest source. Do not quote 0.1356.)

### 8.2 🔴 [FALSIFIED 2026-08-21 — regen is NOT flat; see the verdict table] Stamina regen is FLAT — `Cyber's Edge` is worthless. Do not spend the SP.

Measured **0.03274 / s** at `staminaMax` **88.96**, against Q10's **0.03352 / s** at a max of
~136.5. Max moved ~35%; regen moved **2.3%**. **Regen does not scale with max stamina.**

This closes `CLAUDE.md`'s open *"whether `max_stamina` helps hinges on an unmeasured question
(does regen scale with max?)"* — **it does not help.**

- Sustainable actions/hour = `0.03274 × 3600 / 2.1434` = **55.0** — matching Q10's 55.8 and §2.5's
  derived 52.7 from a third data path.
- **`Cyber's Edge` is neutral-to-harmful, not merely useless.** The guard thresholds are
  *fractions* of max (`STAMINA_FLOOR_FRACTION` 0.5 / `STAMINA_RESUME_FRACTION` 0.55), while regen
  is a flat *absolute* rate. Raising max widens the 0.05×max recovery band in absolute stamina, so
  each rest gets **longer** in wall-clock. Throughput is unchanged; the duty pattern just gets
  lumpier. **8,912 SP stay parked. The `bladeburner_stamina_gain` aug argument in `CLAUDE.md`
  dies with it.**

### 8.3 🔑 The objective function is provably wrong — this is now the top lever

Actions/hour is **fixed at ~55 by arithmetic** (flat regen ÷ flat per-action cost), *independent of
action time*. Therefore:

```
rank/sec  =  55/hour  x  rank-per-action  /  3600
```

**Actions/hour cannot be raised by anything.** The only remaining term is **rank per action** — so
the correct objective is **rank-per-action**, and the engine runs `objectiveMode: "per-second"`
(`bladeburnermanager.js`). A per-second objective systematically prefers *short* actions, which is
exactly backwards when time is free and stamina is the currency.

At 0.17 rank/s and 55 actions/hour we are earning **~11.1 rank/action**. Tracking is capped; the
higher-yield operations are not. ⚠️ Their scores derive from `Estimated` ranges, so the size of the
gain is **not** established here — only that the objective is measuring the wrong thing.

### 8.4 Diplomacy starvation — behaviour confirmed, value NOT established

Action mix over the 302 s window: **Tracking 122 s · HRC 120 s · Investigation 58 s · Diplomacy 0 s**,
with Ishima chaos at **15.68** — far above `CHAOS_DIPLOMACY_THRESHOLD` (1.0). The
`staminaRecovering → HRC` return at `bladeburnermanager.js:547` sits above both Diplomacy branches,
so ~40% of wall time is spent on HRC while chaos management never runs. **The hypothesis is
confirmed as behaviour.**

Two corrections to how tempting that looks:

1. **That 40% is not recoverable as rank.** It is the forced idle the 55 actions/hour ceiling
   implies — HRC is not *costing* throughput, it is what "waiting for stamina" looks like. Regen
   measured identical across a window mixing HRC, Tracking and Investigation, so regen is
   **action-independent**: the idle is free, but filling it cannot buy actions.
2. **Chaos may not be binding at all.** `pMin` has held **1.0** from level 48 to 99 — success has
   never degraded. Ishima at 15.68 is the *cleanest* city on the board (Sector-12 **1,491**,
   Chongqing **651**, Aevum **108**).

So the correct read is: Diplomacy is **free to run** in idle time, not **valuable** to run.
Considerations, not a blocker.

### 8.5 Revised lever table

| # | Lever | Status after measurement |
|---|---|---|
| 1 | Stop installs | ✅ **DONE** — verified in-game, `setratchetmode.js` reads `observe` |
| 2 | Action-level cap | ✅ **ANSWERED — capped at 100.** ~14 days → **~25 days** |
| 3 | `objectiveMode` → per-action | 🔼 **now the top lever**, and §8.3 proves the current one wrong |
| 4 | Q11 / Stage B | unchanged — still gated on an `Estimated`-derived score |
| 5 | Chaos / Diplomacy | 🔽 **downgraded** — free but probably not valuable (§8.4) |
| 6 | Spend the 8,912 SP | ❌ **CLOSED for stamina** — `Cyber's Edge` measured inert (§8.2) |

### 8.6 Does the recommendation survive?

**Yes, but on a weaker margin, and for a different reason than §7 gave.** ~25 days still beats
option B's 240–323 by an order of magnitude, and option C is unchanged. But the *acceleration
thesis* that made continuing feel obvious is **spent** — §7's argument 1 ("the wall is not there")
is now only half true: there was no wall for the first 44 h, and there is one now.

**What has NOT changed:** rank is monotonic, survives installs, and no alternative is closer.
**What HAS changed:** the forecast is ~25 days, not ~14, and the next gain must come from
rank-per-action, not from waiting.

⚠️ §6's tripwire *"rank still under 80,000 on 2026-08-13"* was calibrated against the ~14-day
central case. At a plateaued 0.17 rank/s the honest 7-day expectation is ~137,000 — **the tripwire
is now too loose to fire on anything and should be re-derived, not trusted.**

**Open and unmeasured:** whether operations actually pay more rank-per-action than a capped
Tracking (§8.3's premise), and whether any action's max level exceeds 100.

---

## 9. INTEL PASS — 2026-08-07 (`run leverprobe.js intel`, read-only, no travel)

`logs/leverprobe-1786101340885.json`. Answers **Q11**, materially resolves the **Volhaven
retraction**, and surfaces a constraint §4.2 filed as "unquantified" that has **already fired**.

### 9.1 ✅ Q11 is MOOT in Ishima — it cannot gate Stage B here

Q11 asks *"what is the HP cost per FAILED operation?"* Measured success ranges in Ishima:

| Action | [pMin, pMax] | count remaining |
|---|---|---|
| Tracking | [1, 1] | 🔴 **0** |
| Bounty Hunter | [1, 1] | 5,751 |
| Retirement | [1, 1] | 5,844 |
| Investigation | [1, 1] | 2,757 |
| Undercover Operation | [1, 1] | 3,683 |
| Sting Operation | [1, 1] | 3,219 |
| **Raid** | **[1, 1]** | **2,883** |
| Stealth Retirement | [1, 1] | 1,593 |
| Assassination | [0.99761, 1] | 1,511 |

**`Raid` reads [1, 1] — converged at certainty. We never fail it, so the HP cost of failing it is
never paid.** `bladeburner-state.json`'s `stageBBlockedBy: "Q11"` is satisfied *in this city*.

⚠️ These are `Estimated` ranges, read correctly as ranges. **[1, 1] is converged-certain**
(distinct from Volhaven's uninformed [0, 1] — the distinction the retraction turned on). Note the
range is city-scoped: `getActionEstimatedSuccessChance` takes no city argument, so this says
nothing about Raid anywhere else.

### 9.2 🔴 NEW BLOCKER — `Tracking` is EXHAUSTED (count 0), and this is a second cause of the plateau

**`Tracking` has 0 contracts remaining.** §4.2 filed contract depletion as "unquantified…
consideration, not a blocker." It is now measured, and it is a blocker: the engine's highest-scoring
contract (per-action **17.36**) has run dry.

Cross-validated against an independent source — summing the probe's per-action counts against
`bladeburner-state.json`'s aggregate:

- contracts: probe **11,595.86** vs state **11,597.29** → Tracking contributes **1.43**
- operations: probe **15,649.03** vs state **15,649.33** → exact

🔑 **§8.1 attributed the rate plateau entirely to the level cap. That was half the story.** There
are **two** causes: `Tracking` capped at level 100 *and* `Tracking` depleted to zero supply. The
engine has been alternating into Investigation because its preferred action is unavailable, not only
because Investigation out-scores it. **Fixing the cap is impossible; fixing supply is not.**

⚠️ The remaining well-supplied contracts are much weaker — `Bounty Hunter` scores **1.247**
per-action against Tracking's 17.36, a **14× drop**. Falling back to contracts is not a fix.

### 9.3 🟡 Volhaven — the retraction holds; "dead" remains unsupported

| City | est. population | communities | chaos |
|---|---|---|---|
| Ishima | 5.581e9 | 47 | **18.49** |
| Chongqing | 1.465e9 | 158 | 1,089 |
| New Tokyo | 1.085e9 | 16 | 507 |
| Sector-12 | 6.207e8 | 22 | 2,408 |
| Aevum | 5.691e8 | 57 | 157 |
| **Volhaven** | **0** | **77** | **0.00** |

**The chaos column is the tell.** Raids *raise* chaos. A city drained by raiding would read high
chaos; Volhaven reads **0.00 — the lowest on the board** — with **77 communities intact** (second
highest) and a full action inventory. That is the signature of a city **never worked**, not one
destroyed.

⚠️ Stated at its true strength: this is **consistent with** unscouted and **inconsistent with**
drained-by-raiding, but population is itself an `Estimated` value where 0 means *unknown*. It does
not prove Raid is safe. **Q14 (does scouting restore a drained city) remains open**, and so does
Raid's actual per-use city cost — which is the thing that was retracted for never having been
measured, and is still not measured.

### 9.4 Where this leaves Stage B

The stated blocker (Q11) is answered and does not bind in Ishima. `Raid` is the only action that is
simultaneously **high-value** (per-action 97.44 = 5.6× Tracking), **well-supplied** (2,883), and
**certain** ([1, 1]) — while the incumbent is capped *and* exhausted.

🔴 **IRREVERSIBILITY WARNING, restated at the point of decision:** enabling Raid is a one-way action
against **Ishima specifically — our best city** (highest population by 3.8×, lowest chaos by 8.5×).
**Raid's per-use cost to a city has never been measured.** The prior "Raid permanently kills a city"
finding was retracted for being an inference off an uninformed estimate; **retraction is not
exoneration** — it moved the question from *answered wrongly* to *unanswered*. Nothing in §9 measures
what Raid costs. This is a decision for Kenneth, not a conclusion this document draws.

**Cheapest way to de-risk it:** Raid a *different* city first and watch its population/communities/
chaos move. That converts an unmeasured irreversibility into a measured one, at the cost of a city
we are not using.

---

## 10. 🔴 RETRACTION — §8.1's "the action level caps at 100" is FALSE

**`Tracking` reads 103 / 103** (2026-08-07 ~12:20 UTC, `leverprobe.js`). It read **100 / 100**
fourteen hours earlier. **`maxLevel` keeps growing. There is no cap at 100.** `Investigation` moved
**22 → 29** over the same span. §8.1 is withdrawn in full, and with it §8.6's "the acceleration is
spent" and the ~25-day forecast.

**Current state:** rank **41,271**, hourly rate **0.2161** and climbing monotonically for 11 hours
(0.1743 → 0.2161); the most recent 5-minute window read **0.2798**. Projection at 0.22–0.28:
**~15–19 days**, i.e. back at or better than §7's original central case.

### 10.1 How the wrong conclusion was reached — this is the same trap, a fourth time

§8.1 rested on three legs and **every one was weak**:

1. **"`Tracking` is at 100/100."** §8.1 *itself* wrote: *"`current == max` is the normal state for
   every action … so 'at cap' by itself proves nothing."* That warning was correct and was then
   reasoned around anyway.
2. **"100 is a round number."** Coincidence. It is now 103.
3. **"The rate stopped climbing."** Measured **across install #43's recovery window**. The dip was
   the install, not a ceiling. Removing that window, the series never stopped rising.

🔑 **The generalisable rule, and it is a sibling of the one already in `CLAUDE.md`:** *an estimate is
not a measurement* — **and a trend read across a known disturbance is not a trend.** Install #43 was
a recorded, timestamped event sitting in `ratchet-log.json`; the rate window overlapping it should
have been excluded before any conclusion was drawn from its shape.

⚠️ Note the exact shape of the repeat: **a weak signal was "confirmed" by a second weak signal, and
the agreement was mistaken for evidence.** `CLAUDE.md` already records this failure verbatim —
*"Three successive wrong conclusions were each 'confirmed' by re-reading the same uninformed number
through a different lens."* This is the fourth. **Two weak confirmations of the same hypothesis are
not independent evidence when both derive from the same uninformed reading.**

### 10.2 What survives from §8 and §9

| Claim | Status |
|---|---|
| Action level caps at 100 | 🔴 **RETRACTED** — Tracking is 103 and climbing |
| Acceleration is over / ~25 days | 🔴 **RETRACTED** — 0.2161 and rising, ~15–19 days |
| Stamina regen is FLAT (0.03274/s at max 88.96 vs 0.03352 at ~136.5) | 🔴 **FALSIFIED 2026-08-21** — 0.08026/s at max 335.3 (BN10, after the combat graft ladder): **max 3.77×, regen 2.45×**. The measurement was sound; its SCOPE was not — both original samples sat in an 88.96–136.5 band where the effect is invisible. Direct measurement with no estimate in the chain is still not proof of a *law*. |
| `Cyber's Edge` worthless; 8,912 SP stay parked | ✅ **STANDS** — follows from flat regen |
| Actions/hour fixed ~55; objective should be rank-per-action | ✅ **STANDS** — arithmetic, not inference |
| Q11 moot in Ishima (Raid [1,1]) | ✅ **STANDS** — converged range, read directly |
| `Tracking` supply pinned at ~0 (0.6 → 0.9, net +0.46/h) | ✅ **STANDS**, but ⚠️ **reweighted** — see below |
| Volhaven never-worked, not drained | ✅ **STANDS** — chaos 0.00 with inventory intact |

**§9.2's "NEW BLOCKER" framing was overstated.** Tracking's supply *is* pinned near zero, but
contracts regenerate at a uniform **~29.8/hour** (Bounty Hunter +29.79, Retirement +29.80 — near
identical, and Tracking's net +0.46 is that same gross minus full consumption). Tracking therefore
supplies ~30 of the ~55 actions/hour the stamina ceiling permits and `Investigation` absorbs the
rest. **Aggregate supply is not binding; the engine already routes around it.** `Raid` regenerates
**+15.9/hour** entirely unused, so supply would never gate Stage B either.

### 10.3 Consequences for the recommendation

**Continue — now on the strongest evidence yet, not the weakest.** ~15–19 days against option B's
240–323. §8.6's "weaker margin" caveat is withdrawn along with §8.1.

⚠️ **Do not treat the level as unbounded.** Nothing here measures a ceiling — it measures that 100
is not one. The honest statement is **"no cap observed through level 103."**

⚠️ **§6's tripwire and §8.6's revision of it are both now miscalibrated** (one against ~14 days, one
against ~25). At 0.22–0.28 rank/s the 7-day expectation from rank 41,271 is **~170,000–210,000**.
Re-derive before trusting either.

**Standing measurement, no probe needed:** `bn6watch.js` is sampling counts/rank/chaos every 60 s
for 12 h to `logs/leverprobe-<epoch>.json`. Re-fit the rate from `goal-log.json` — **excluding any
window containing an install** — before drawing a curve through it.

---

## 11. RE-STAMP + THROUGHPUT DECOMPOSITION — 2026-08-08 ~13:42 UTC

Read-only, no probe run: `logs/goal-log.json` (2,880 samples), `logs/bladeburner-attempts.json`
(3,911 entries, carries `context.rank` at every action start), `logs/bladeburner-state.json`,
`logs/leverprobe-1786145430950.json` (the 12 h `bn6watch.js` run §10 asked for), and
`node tools/bb/cli.mjs stats`.

**Window discipline, per §10's rule.** Install **#43 fired 2026-08-07T00:40:12Z** and is the last
install (`ratchet-log.json`, 43 entries; cadence stopped). Everything below is fit on
**2026-08-07T02:40Z → 2026-08-08T13:40Z — 35.0 clean hours**, install + 2 h recovery excluded.

### 11.1 Live standing

| | |
|---|---|
| rank | **59,008** (34,409 at window start) |
| skill points | **17,259**, idle |
| skills | Blade's Intuition / Digital Observer / Tracer **25** · Overclock **17** · Reaper **6** · Evasive System **6** |
| `Tracking` level | **110** — was 103 on 08-07 |
| `Investigation` level | **33** — was 29 on 08-07 |
| city | Ishima · chaos **66.34** (was 15.68 on 08-07 02:08 — **4.2x in 35 h**) |
| stamina | 155.0 / 155.0 · duty cycle **99.4 %** (24 h) |
| rank rate | **0.1952 rank/wall-s = 703 rank/h** (engine's own `rates.24h` agrees: 0.19286, 694/h) |
| ETA to 400,000 | **~20.2 days** at that rate |

### 11.2 🔴 The rate is FLAT, not climbing — §10's "0.2161 and rising, ~15–19 days" is superseded

35 clean hours in 1-hour buckets run **625 – 806 rank/h with no trend** (peak at hour 9, trough at
hour 21, back to ~710 by the end). The 08-07 reading was an 11 h window; it has not persisted.

⚠️ **Do not restate "the rank rate has been rising, not decaying."** ✅ What *is* still rising is the
**action level** (110, ~1 level / 3.5 h, no cap observed) — §10's core retraction stands.

### 11.3 🔑 Why flat: the two actions move in opposite directions, and they cancel

Realised rank/action, measured by differencing `context.rank` between consecutive action starts
(pairs 40–90 s apart only), across the clean window in five buckets:

| bucket (UTC) | `Tracking` | `Investigation` |
|---|---|---|
| 08-07 02:41 | 16.61 | 9.75 |
| 08-07 09:42 | 17.93 | 8.34 |
| 08-07 16:43 | 19.43 | 3.54 |
| 08-07 23:44 | 21.03 | 0.86 |
| 08-08 06:45 | **22.80** | **0.88** |
| whole window | **19.77** (n=965, median 19.70, **0** failures) | **4.27** (n=960, median **0.00**, **68.9 % pay nothing**) |

`Tracking` **+37 %**, `Investigation` **−91 %**, aggregate flat. The engine splits actions almost
exactly 50/50 between them (last 400 starts: 199 / 201).

### 11.4 ✅ The throughput model now closes to within 0.2 %

| term | measured | source |
|---|---|---|
| `Tracking` supply | **~29.9 contracts/h** gross; count pinned at **1.13**, net **+0.008/h** | `leverprobe-1786145430950` (12 h) |
| stamina ceiling | ~55.8 actions/h | Q10 |
| observed cadence | median inter-start gap **64.4 s** (p10 49.4, p90 67.0) → **~56 actions/h**; **no restart churn** (1 gap < 30 s in 703) | attempts log |

`30 x 19.77  +  26 x 4.27  =  593 + 111 =` **704 rank/h** vs **703 measured**.

🔑 **So `Investigation` is not a mistake — it is filler on capacity `Tracking` cannot supply.**
Tracking is consumed as fast as it regenerates (~30/h) while stamina permits ~56/h; the other ~26
actions/h would otherwise be idle. ⚠️ **This kills the obvious "just drop Investigation" reading:
all-Tracking is not supply-feasible.** The filler slot is worth **~111 rank/h today and decaying
toward ~23**.

### 11.5 🔴 The engine's predictions run hot, and worst exactly where it matters

| action | predicted `evPerAction` | realised | error |
|---|---|---|---|
| `Tracking` (pMin **1.000**, converged) | 23.95 | 19.77 | **−17 %** |
| `Investigation` (pMin **0.764**, a range floor) | 14.23 | **0.88** (latest bucket) | **−94 %** |

Investigation's realised payout implies a **true success rate of ~7 %** against a predicted floor of
**76 %**. ⚠️ **`getActionEstimatedSuccessChance` is not merely *uncertain* here — its lower bound is
biased HIGH.** That is a stronger and worse statement than "read it as a range," and it lands on a
third consequence:

⚠️ **Checkpoint C2 — "operations lead contracts," fired 2026-08-03 — rests on this same predicted
number.** The engine currently scores `Raid` at **45.72/action** and `Bounty Hunter` at 1.25/action;
the Raid figure has **never been realised**, only predicted. Even the *converged* pMin 1.0 case runs
17 % hot. **Do not treat 45.72 as a measurement.**

### 11.6 Candidate causes for Investigation's collapse — NOT distinguished, do not pick one yet

1. **Chaos.** Ishima 15.68 → 66.34 over the same window. Chaos raises difficulty; `Tracking` at level
   110 has success headroom (pMin 1.0) and absorbs it, `Investigation` at level 33 does not.
2. **Autolevel self-harm.** `autolevel: true`; `Investigation` climbed 22 → 33 in the same window.
   Action level raises reward **and difficulty** — it may have levelled itself past its own success
   chance, which would make the engine's own autolevel the cause.

Supply is **not** a candidate — Investigation count 3,076 with +17.2/h regen against ~26/h use is
falling but nowhere near empty.

### 11.7 🔴 ENGINE DEFECT — `Diplomacy` is configured against exactly this and cannot run

🔴 **CORRECTED 2026-08-08 (evening). The original heading and claim — "*and has never run* … fired
**zero times — ever** (`effect.runs` is cumulative)" — were WRONG on both counts, and are struck.**

`effect.runs` is **not cumulative**. `diplomacyEffect` is initialised to `emptyDiplomacyEffect()` at
loop start (`bladeburnermanager.js:1180`) and lives only in memory; with **17 restarts** logged and
the last startup at 2026-08-07T00:40Z, `runs: 0` means *"none since the last process start."*
`bladeburner-log.json` in fact holds **two** `diplomacy-effect` records, both 2026-08-03. ⚠️ This is
the **fifth** instance of one pattern: a counter was read as cumulative without checking whether
anything persists it. Sibling rule to "an estimate is not a measurement" and "a trend read across a
known disturbance is not a trend": **a counter is not cumulative until you find the code that
persists it.**

**The defect is real, and it is a different mechanism than §8.4's.** `pickOverheadAction` is only
called when `pickRankAction` returns `null` (`bladeburnermanager.js:1592`). The engine now holds
**24h `dutyCycle` 0.9998 with `rankProducingSec == actionSec`** — `Investigation` backfills every bit
of capacity `Tracking` cannot supply (§11.4), so overhead is **never selected at all**. §8.4's
finding (HRC out-prioritising Diplomacy *within* the overhead ladder) has been overtaken: there is no
longer any overhead time to prioritise within. Every guard on the chaos branch currently passes —
`bladeburner-state.json` at 2026-08-08 ~18:20 UTC reads Ishima chaos **69.02** > `CHAOS_TARGET` 50,
`budgetRemainingMs` **720,000**, `hpFraction` **1**, stamina **0.986** and not recovering. The branch
is live code that is structurally unreachable in this regime.

**Consequence for the fix:** it is *not* a reordering of `pickOverheadAction`'s ladder. Chaos
suppression has to **pre-empt a rank action**, which is a policy change (what chaos threshold
justifies displacing rank, and how it interacts with the existing `MAX_DIPLOMACY_DUTY` 20%/hour cap)
— spec-level, not a constant tweak.

🔴 **And `Diplomacy`'s strength is UNMEASURED — do not quote 174 chaos/run.** Of the two records, the
second is correctly `discarded` (`city changed Volhaven -> Ishima`); the first (`removed: 174.15`,
Sector-12 177.5 → 3.39) **predates the same-city guard** — it carries no `cityName` field, and it is
precisely the contaminated sample `bladeburnermanager.js:1671-1674` was written to catch ("makes it
look ~50× stronger than it is"). The policy's justification is that it self-measures; it has not yet
returned one usable number. **So the +230 rank/h in §11.8's table below is a hypothesis with an
unmeasured multiplier at both ends** — it assumes chaos is Investigation's cause *and* that Diplomacy
can move chaos materially. Neither is established.

### 11.8 The lever table this produces

| lever | est. gain | reversible? | status |
|---|---|---|---|
| ~~Fix `Diplomacy` (11.7) — if chaos is the cause, restores Investigation ~0.88 → ~9.75/action~~ | ~~**+~230 rank/h (~+33 %)**~~ | ✅ yes | 🔴 **FALSIFIED 2026-08-08 — see §12. Do not quote the +230.** Chaos is city-scoped and `Tracking` took no damage at 66.5. The starvation defect is real; its *payoff* was not. |
| **Govern `Investigation`'s autolevel** — cause (2), now CONFIRMED (§12) | **+~244 rank/h (~+34 %)**, ETA 19.8 → 14.8 days — ⚠️ extrapolated from per-level yields, not measured | ✅ yes (single API call with an inverse) | → **Phase 40** |
| Swap filler to `Bounty Hunter`/`Retirement` (regen ~30/h each, stock ~6.5k) | **~+10 rank/h** — predicted 1.25/action; near worthless | ✅ yes | measured-poor |
| **`Raid` in the filler slot** (regen 15.7/h, stock 3,265, Ishima pMin 1.0) | **potentially +~600 rank/h — roughly doubles the rate** | 🔴 **NO** | **Stage B — gated, see below** |

🔴 **IRREVERSIBILITY, restated at the point of decision.** `Raid` is the one-way door. Its true cost
to a city is **still UNKNOWN** (§9.3 / the Stage B reopening: pop `0` in Volhaven means *unknown*,
not *zero*), Q11 + Q14 are unanswered, and its 45.72 score is a **prediction from the same estimator
just measured to be 16x hot on `Investigation`**. This is not a "the numbers say do it" situation.

**Note:** a `raidtest.js` probe ran today at 13:15 UTC (`logs/leverprobe-1786194909909.json`,
untracked `src/raidtest.js`) — it travelled to **Aevum**, read Raid success `[0.0208, 1]`,
**aborted without raiding** on its own `pMin < 0.9` guard, and returned to Ishima. `raidsCompleted:
0`. **No city was raided; nothing irreversible happened.**

### 11.9 Corrections to §10.2's table

| Claim | Was | Now |
|---|---|---|
| Acceleration / ~15–19 days | 🔴 retracted → "0.2161 and rising" | 🔴 **that replacement is ALSO superseded** — flat 0.1952, **~20.2 days** |
| Action level caps at 100 | retracted at 103 | ✅ holds — **no cap observed through 110** |
| "`Investigation` absorbs the rest" (framed as neutral) | neutral filler | ⚠️ **reweighted** — worth 111 rank/h and **decaying to ~23** |
| Actions/hour ~55; objective should be rank-per-action | ✅ stands | ✅ **confirmed independently** — 56/h measured from inter-start gaps |

---

## 12. 🔴 CHAOS FALSIFIED, AUTOLEVEL CONFIRMED — 2026-08-08 evening (log rebuild, read-only)

Rebuilt from `bladeburner-attempts.json` (n = 4,487, 2026-08-03 → 08-08) by **differencing
consecutive `context.rank`** — not from `observed.rankDelta`, which is broken (§12.4). This is the
same method §11.4 used; it is re-stated here because it is a workaround, not the intended path.

### 12.1 Chaos is falsified by its own control

§11.7 proposed chaos as the cause of `Investigation`'s collapse. **Chaos is city-scoped**, so
`Tracking` is a free control — same city, same window, same chaos.

| window | Ishima chaos | `Tracking` rank/act | zero | `Investigation` rank/act | zero |
|---|---|---|---|---|---|
| 08-06 PM | 9.3 | 29.92 (L99, n=216) | 0% | 5.81 (L21, n=190) | 8% |
| 08-07 AM | 16.0 | 19.78 (L102, n=298) | 1% | 8.66 (L29, n=275) | 23% |
| 08-07 PM | — | 19.49 (L106, n=350) | 1% | 4.84 (L32, n=347) | 70% |
| 08-08 AM | — | 21.71 (L109, n=360) | 0% | 0.95 (L33, n=359) | 95% |
| 08-08 PM | 66.5 | 24.52 (L112, n=341) | 0% | 0.23 (L33, n=342) | 99% |

Chaos rose **7.2×**. `Tracking` took **zero damage** — 0–1% failure throughout, yield rising. The
collapse is **action-specific**; chaos cannot be. 🔴 **§11.8's +230 rank/h Diplomacy gain is
withdrawn.** The starvation defect in §11.7 is still real — its *payoff* was never there.

Chaos series is from timestamped `leverprobe-*.json` / `switchbbcity-*.json` point samples (Ishima
3.49 on 08-04 → 9.27 on 08-06 → 15.98 on 08-07 → 66.50 on 08-08). ⚠️ **No chaos time series is
logged anywhere** — see §12.4.

### 12.2 The cause is the action's own level

`Investigation` by level: rises to a **peak at L26–29 (~9.02–10.44 rank/action)**, then cliffs —
L30 **6.67** (58% zero), L31 **4.77** (72%), L32 **1.33** (93%), L33 **0.21** (99%). It is **stuck at
L33**: `autolevel` advances only on success, so it has locked itself at a level it cannot clear.

🔑 **`bladeburnermanager.js` never calls `setActionAutolevel`/`setActionLevel`** (grep-confirmed; only
`bladeburneractionprobe.js` does, and it restores). `autolevel: true` is the **game default, entirely
ungoverned** — the engine has no view of the succeed → level-up → harder → fail loop.

### 12.3 Install #43 ruled out, not assumed away

Install #43 (2026-08-07T00:40:12Z) resets combat stats to 1 — a real rival explanation. Split at the
install: **before** n=207, mean 5.96, 9% zero (L10→21); **after** n=1,307, mean 3.33, 75% zero
(L21→33). But the **by-level curve runs smooth and monotonic straight through the boundary** (L21 pre
21% zero → L22 post 23%) — no step change. **Level explains it; the install does not.** Per §10's
rule, the disturbance was located first and the fit re-run against level rather than time.

⚠️ Combat stats *are* still regrowing, so the clearable level is a **moving target** — a design input
for Phase 40, not a defect in this finding. It does mean §11.8's +34% is extrapolated from L26–29
yields recorded at a *different* stat level. **Estimate, not measurement.**

### 12.4 🔴 THE ATTEMPTS LEDGER IS LARGELY DEAD — and it has been silently blocking an open bug

Phase 39 S6/S7 built `bladeburner-attempts.json` so `startAction` failures and per-action yields
could be diagnosed **by log read rather than live experiment**. Measured across all 4,487 records:

| field | state |
|---|---|
| `observed.rankDelta` | **0 on 4,487 / 4,487** — including `Tracking`, known to realise ~20–25 |
| `observed.successDelta` | **0 on 4,487 / 4,487** |
| `context.cityChaos` | **null on all** — hardcoded at `bladeburnermanager.js:1653` |
| `context.countRemaining` / `skillLevelsHash` / `teamSize` | **null on all** — same line |
| `context.rank` / `stamina*` / `hpFraction` / `cityName` | ✅ real |
| `predicted.*` | ✅ real, and wrong (§11.5) |

Line 1653 declares the four correlates as literal `null` placeholders never wired up. All four are
cheaply available a few lines earlier (`:1597`/`:1599`), inside the `else` branch.

🔴 **The open `BACKLOG` bug "`startAction` silently no-ops for Tracking and Raid" carries the next
action *"the diagnosis is now a log read — check whether the ledger's context fields correlate with
which attempts fail."* That is not executable — those fields are null.** The bug has been waiting on
evidence the instrument never recorded.

⚠️ **Sixth instance of one pattern**, and it earns the general form: **a field that exists is not a
field that is populated — check a real record before building on it.** (Siblings: an estimate is not
a measurement · a trend read across a known disturbance is not a trend · a counter is not cumulative
until you find the code that persists it.)
