# Phase 40 — Autolevel governor (brainstorm)

**Stage 1 of 3.** Decisions, rejected alternatives, open questions. No spec, no code.
**Raised** 2026-08-08. **Goal context:** BN6.1, Bladeburner-primary, rank 400,000 (`Operation
Daedalus`). Stage A ETA ~20 days at the measured 703 rank/h.

> ⚠️ **This phase was opened to fix `Diplomacy`, and the measurement moved it.** The go-ahead was
> given for a Diplomacy pre-emption policy on the strength of `bn6-go-no-go.md` §11.7/§11.8's
> "+230 rank/h if chaos is the cause." **The data falsifies chaos as the cause** (§1). Flagging the
> pivot explicitly rather than folding it in, per `CLAUDE.md`'s "flag unplanned deviations."

---

## 1. The finding that redirected the phase

### 1.1 The chaos hypothesis is falsified by its own control

`bn6-go-no-go.md` §11.7 proposed that Ishima's rising chaos is what collapsed `Investigation`'s
realised yield (9.75 → 0.88 rank/action). **Chaos is city-scoped — it applies to every action in the
city equally.** So `Tracking` is a free control: same city, same window, same chaos.

Rebuilt from `bladeburner-attempts.json` by differencing consecutive `context.rank` (see §1.3 for why
not `observed.rankDelta`), n = 4,487 over 2026-08-03 → 08-08:

| window | Ishima chaos | `Tracking` mean rank/act | zero-rate | `Investigation` mean rank/act | zero-rate |
|---|---|---|---|---|---|
| 08-06 PM | 9.3 | 29.92 (L99, n=216) | 0% | 5.81 (L21, n=190) | 8% |
| 08-07 AM | 16.0 | 19.78 (L102, n=298) | 1% | 8.66 (L29, n=275) | 23% |
| 08-07 PM | — | 19.49 (L106, n=350) | 1% | 4.84 (L32, n=347) | 70% |
| 08-08 AM | — | 21.71 (L109, n=360) | 0% | 0.95 (L33, n=359) | 95% |
| 08-08 PM | 66.5 | 24.52 (L112, n=341) | 0% | 0.23 (L33, n=342) | 99% |

Chaos rose **7.2×** across this span. `Tracking`'s failure rate stayed at **0–1%** and its yield
**rose**. Whatever is killing `Investigation` is **action-specific**, and chaos cannot be
action-specific. 🔴 **Therefore §11.8's "+230 rank/h from fixing Diplomacy" rests on a premise the
data contradicts, and must not be quoted as a projected gain.**

(Chaos series is from timestamped `leverprobe-*.json` / `switchbbcity-*.json` point samples —
Ishima 3.49 on 08-04 → 9.27 on 08-06 → 15.98 on 08-07 → 66.50 on 08-08. **No chaos time series is
logged anywhere**; see §4.)

### 1.2 The actual cause is the action's own level, and the dose-response curve is clean

Same rebuild, `Investigation` bucketed by `level` at attempt time:

| level | n | mean rank/act | zero-rate |
|---|---|---|---|
| 10–19 | 153 | 4.40 → 6.85 | 0–14% |
| 20–25 | 178 | 7.21 → 8.68 | 9–23% |
| **26–29** | **160** | **9.02 → 10.44** ← peak | 13–37% |
| 30 | 74 | 6.67 | 58% |
| 31 | 118 | 4.77 | 72% |
| 32 | 447 | 1.33 | 93% |
| 33 | 371 | 0.21 | 99% |

Monotonic rise to a **peak at L26–29 (~9–10 rank/action)**, then a cliff. `Investigation` is now
**stuck at L33**: `autolevel` only advances on success, and it succeeds ~1% of the time, so it has
locked itself at a level it cannot clear. **The engine never manages autolevel** — `grep` confirms
`bladeburnermanager.js` never calls `setActionAutolevel`/`setActionLevel`; `autolevel: true` is the
game default and nothing has ever governed it. Success → level up → harder → fail is a self-defeating
loop the engine has no view of.

### 1.3 The install confounder is ruled out, not assumed away

Install #43 fired 2026-08-07T00:40:12Z and resets combat stats to 1 — a real candidate explanation
(weaker player, same level, more failures). It is not the driver:

- Split at the install: **before** n=207, mean 5.96, 9% zero (L10→21); **after** n=1,307, mean 3.33,
  75% zero (L21→33).
- But the **by-level curve is smooth and monotonic straight through the boundary** — L21
  (pre-install) 21% zero, L22 (post-install) 23% zero. No step change at the install; a continuous
  ramp against level.

Per `CLAUDE.md`'s "a trend read across a known disturbance is not a trend," the disturbance was
located first and the fit re-run against level rather than time. **Level explains the curve; the
install does not.** ⚠️ Combat stats *are* still regrowing, which means the clearable level is a
**moving target** — that is a design input (§2.2), not a confounder to the finding.

### 1.4 Computed gain

`Investigation` runs ~26 actions/h (§11.4's supply model: `Tracking` is capped at ~30/h against a
~56/h stamina ceiling, `Investigation` backfills). At the measured L28 yield of ~9.4 rank/action:

| state | contribution | total rate | ETA to rank 400,000 |
|---|---|---|---|
| now (L33, 0.23/act) | ~6 rank/h | 703 rank/h | **19.8 days** |
| restored to ~L28 | ~244 rank/h | ~941 rank/h | **14.8 days** |

**~5 days saved, ~+34%.** ⚠️ This is an *extrapolation from measured per-level yields*, not a
measurement of the fix — the L26–29 figures were recorded at a *different* combat-stat level
(pre-install #43). Treat it as the reason to build, not as a result. Estimate ≠ measurement.

---

## 2. Decisions

### D1 — Build an autolevel governor, not a Diplomacy policy. **Decided.**

Scope the phase to managing action **level** as a controlled variable. `setActionLevel` and
`setActionAutolevel` both exist in this build (`markdown/bitburner.bladeburner.*`), both are cheap,
and both are **reversible** — the failure mode is "set it back."

Rejected: Diplomacy pre-emption (§3.1), `objectiveMode` flip (§3.2). Both stay open.

### D2 — Closed-loop on realised success, not a static level cap. **Decided.**

A hardcoded `LEVEL_CAP.Investigation = 28` would be correct today and wrong next week: combat stats
regrow after every install, so the clearable level rises, and a static cap would silently forfeit the
payout gradient (the by-level table shows yield *rising* with level right up to the cliff — capping
too low costs real rank).

The controller should own `autolevel` (set it `false` so the game stops advancing the level behind
the engine's back) and drive the level itself off **realised** success rate, targeting the yield
peak rather than a fixed number.

⚠️ **The obvious cheap version — "freeze autolevel" alone — does not work here.** `Investigation` is
*already* stuck at L33 and cannot climb out; freezing preserves the broken state. The governor must
be able to **lower** the level, not just stop raising it.

### D3 — Do not score off `getActionEstimatedSuccessChance`. **Decided.**

The estimator's **lower** bound was measured biased *high* on 2026-08-08 (§11.5: `Investigation`
predicted pMin 0.764, realised ~7%). It is still predicting `pMin` 0.774 / `evPerAction` 14.44 for an
action realising **0.23**. A governor reading that number would conclude nothing is wrong.

**The controller's input must be realised outcomes from the attempts ledger**, which is the one
source that got this right. This is the same lesson as Phase 38's ("an engine that measures itself
must be validated against an independent source") applied one layer up.

### D4 — Fix the attempts ledger first; it is a prerequisite, not a nice-to-have. **Decided.**

The ledger cannot currently drive a controller — see §4. Its `observed.rankDelta` is **0 on all
4,487 records** and every `context` correlate is **hardcoded `null`**. This phase's own validation
also depends on it. Ledger repair is work item 1.

### D5 — Governor covers all levelable actions, not just `Investigation`. **Decided.**

The mechanism is generic: any Contract/Operation with `autolevel: true` can outrun the player.
`Tracking` is at L112 and 0% failure *today*, but it is on the identical loop and installs keep
resetting the stats underneath it. A per-action governor costs little more than a single-action
special case and removes the need for a Phase 41 when `Tracking` hits its own cliff.

⚠️ **`Tracking` is not to be touched while it reads 0% failure** — it is the load-bearing 30
actions/h. Governor applies, but its correction band must be a no-op on a converged action.

---

## 3. Rejected / deferred alternatives

### 3.1 Diplomacy pre-emption policy — **deferred, premise falsified**

The lever it was aimed at (chaos → `Investigation` collapse) is contradicted by §1.1. Two things
about it are still true and still filed in `BACKLOG.md`: the chaos branch **is** structurally starved
(24h `dutyCycle` 0.9998 → `pickOverheadAction` is never reached), and `Diplomacy`'s strength has
**never been cleanly measured**. Neither is worth 20% of duty on the evidence now in hand.

**Wake condition:** an action-*independent* degradation — i.e. `Tracking`'s zero-rate rising while
its level is held constant by this phase's governor. That would be the signature chaos should have
left and didn't. This phase makes that test possible for free, which is a better outcome than
spending duty on it now.

### 3.2 `objectiveMode` per-second → per-action — **deferred, unchanged reasoning**

Still diagnosed as the wrong objective (`CLAUDE.md`: actions/hour is fixed by stamina regen, so
preferring short actions is backwards). Not in scope because the scoring it would newly lean on comes
from the estimator D3 just disqualified — flipping now would make the engine prefer operations on
numbers measured wrong. The honest version scores on the realised ledger, which is exactly what D4
builds. **Wake condition:** ledger repaired and carrying ≥1 week of realised per-action yields.
Sequencing this *after* Phase 40 is the point, not an accident.

### 3.3 Drop `Investigation` from the pool — **rejected**

Superficially attractive at 0.23 rank/action. Wrong for the reason §11.4 already established:
`Investigation` is **filler on capacity `Tracking` cannot supply** (~26 of ~56 stamina-permitted
actions/h). Dropping it idles that capacity and gains nothing. The problem is its yield, not its
presence.

### 3.4 City rotation instead — **rejected for this phase**

Volhaven reads chaos 3.5 vs Ishima's 69.0 and is the standing `CITY_ROTATION_ENABLED` question. Out
of scope: it addresses chaos, which §1.1 just showed is not the binding problem, and Volhaven's
population reads 0/unscouted (Q14). Stays filed in `BACKLOG.md`.

---

## 4. The instrumentation defect this uncovered (work item 1)

`bladeburner-attempts.json` — 4,492 records, built by Phase 39 S6/S7 specifically so that
`startAction` failures and per-action yields could be diagnosed **by log read rather than live
experiment**. Measured 2026-08-08:

| field | state |
|---|---|
| `observed.rankDelta` | **0 on 4,487 / 4,487** — including `Tracking`, known to realise ~20–25 |
| `observed.successDelta` | **0 on 4,487 / 4,487** |
| `context.cityChaos` | **null on all** — hardcoded at `bladeburnermanager.js:1653` |
| `context.countRemaining` | **null on all** — same line |
| `context.skillLevelsHash` | **null on all** — same line |
| `context.teamSize` | **null on all** — same line |
| `context.rank` / `stamina*` / `hpFraction` / `cityName` | ✅ real |
| `predicted.*` | ✅ real (but see D3 — real and wrong) |

Line 1653 declares the four context correlates as literal `null` placeholders that were never wired.
All four are cheaply available in the loop (chaos and `teamSize` are already read a few lines up, at
`:1597`/`:1599`, though only inside the `else` branch — they need hoisting).

**Two consequences worth stating plainly:**

1. Every per-action yield figure in `bn6-go-no-go.md` §11.4 — and every figure in this document —
   had to be reconstructed by **differencing `context.rank` between consecutive records**. That
   works, but it is a workaround for a broken field, and it silently drops the last record and any
   record straddling an install.
2. 🔴 **The open `BACKLOG` bug "`startAction` silently no-ops for Tracking and Raid" carries the next
   action "the diagnosis is now a *log read* … check whether the ledger's context fields correlate
   with which attempts fail." That next action is not executable** — those fields are null. The bug
   has been waiting on evidence the instrument was never recording.

⚠️ **Sixth instance of one pattern** (siblings: "an estimate is not a measurement," "a trend read
across a known disturbance is not a trend," "a counter is not cumulative until you find the code that
persists it"). Candidate general form: **a field that exists is not a field that is populated — check
a real record before building on it.**

---

## 5. Open questions

| # | question | default if unanswered | date |
|---|---|---|---|
| Q40-1 | Can `setActionLevel` lower a level *below* the current one, or does the game clamp to a floor/`maxLevel`? Whole phase depends on it. | Verify with a read-only-then-restore probe before speccing — `bladeburneractionprobe.js:360-381` already does exactly this dance and can be reused | before spec |
| Q40-2 | Does lowering the level reduce the *payout* proportionally, or only the difficulty? The by-level table shows yield rising with level, so the peak may shift once success is restored. | Assume payout scales with level and target the **measured** peak, re-fit after the first week | at spec |
| Q40-3 | What does the governor do across an install, when combat stats reset to 1 and every clearable level drops at once? | Re-enter the post-install regime the engine already models (`inPostInstallRegime`) and re-converge from a low level | at spec |
| Q40-4 | Is the L26–29 peak still the peak at *current* combat stats? Those samples predate install #43. | Treat §1.4's +34% as unvalidated; the controller finds the peak empirically rather than being told it | at spec |
| Q40-5 | Should the governor write its own log, or extend the attempts ledger? | Extend the ledger (D4 is repairing it anyway) — one source, per the Phase 38 lesson | at spec |

---

## 6. Provisional work items (for the spec to confirm or reject)

1. **Repair `bladeburner-attempts.json`** — wire `observed.rankDelta`/`successDelta`, populate the
   four null `context` correlates. Prerequisite for everything else (D4). Unblocks the open
   `startAction` no-op bug as a side effect.
2. **Autolevel governor** — take ownership of `autolevel`, drive level off realised success from the
   ledger, per levelable action, no-op on converged actions (D2, D5).
3. **Live validation** — `Investigation` recovers from 0.23 toward its peak; `Tracking` unchanged;
   24h aggregate rank/h **rises** from the 703 baseline.

**Proposed tripwire:** revert if 24h rank/h drops below **630** (−10% on baseline). Both levers are
single API calls with an inverse, so revert is genuinely cheap.

---

## 7. What this phase does *not* claim

- It does not claim chaos is harmless — only that chaos **cannot** explain an action-specific
  collapse, and that `Tracking` shows no chaos damage at 66.5.
- It does not claim +34% — §1.4 is an extrapolation from per-level yields measured at a different
  combat-stat level (Q40-4).
- It does not resolve `Diplomacy`'s strength, `objectiveMode`, city rotation, or Stage B. All four
  stay filed with their own wake conditions.
