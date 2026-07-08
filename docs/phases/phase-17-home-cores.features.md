# Phase 17 features: home-core-aware grow/weaken sizing

**Stage:** brainstorm → **investigated → SHELVED (2026-07-08)**. No code shipped. This doc
records the design space, the measurement that settled it, and the trigger to revisit.

## Outcome — SHELVED after measurement (2026-07-08)

A throwaway in-game probe (`src/coreprobe.js`, since removed; evidence in
`logs/coreprobe-1783550870612.json`) answered the two gating questions:

- **Q1 — grow security is core-INDEPENDENT.** `growthAnalyzeSecurity(1000, undefined, cores)`
  returned `4` for cores ∈ {1,2,4,8,16}. So the BACKLOG entry's original **correctness-drift
  claim was wrong** — there is no bug. Everything sized at cores=1 is a safe overshoot
  (over-grow clamps at max money, over-weaken clamps at min security). This is a pure
  efficiency question. ✅ de-risked.
- **Q2 — home was 19.4% of allocatable RAM** at probe time (4,064 GB of 20,972 GB), *not* the
  <1% predicted — but only because the fleet was in a **small post-reset state** (purchased
  servers wiped, Formulas off). That share decays back toward negligible as purchased servers
  are rebought.
- **Core factor (measured):** weaken at home's 2 cores removes `53.125` vs `50` per 1000
  threads → **5.9% fewer threads** on home; grow follows the same `1+(cores-1)/16` law.

**Impact ≈ `homeShare × (grow+weaken batch share ~85%) × coreSavings`:** ~**1%** of fleet RAM
today (2 cores), rising to ~5% at 8 cores / ~8% at 16 — but home cores are stuck at 2
(no Singularity unlock → `upgradeHomeCores()` not automatable; manual + money-gated), and the
19.4% share is transient. So today's real prize is ~1% of RAM during the early-reset window
only, against a fix that reorders the batcher hot path (RAM gate + live validation).

**Decision (Kenneth, 2026-07-08): not worth it now — shelved.** **Revisit trigger:** home cores
get upgraded (post-Singularity), which is what flips the impact from ~1% to 5–8%. The design
options below are kept intact for that revisit.

---

_Original brainstorm (pre-measurement) follows; the correctness framing in it is superseded by
Q1 above._

## Problem

Every grow/weaken thread-count call in `src/sampling.js` — both the **legacy** branch
(`ns.growthAnalyze`, `ns.growthAnalyzeSecurity`, `ns.weakenAnalyze`) and the **formulas**
branch (`ns.formulas.hacking.growThreads`; note formulas-mode weaken sizing still calls plain
`ns.weakenAnalyze(1)`) — omits the optional `cores` argument, so it implicitly assumes **1
core** for whichever host actually runs the job.

But `home` is a real worker host. `hosts.js`'s `listHosts()` puts it in the same pool as
every other server (minus `HOME_RESERVE_GB`), and it is **not** 1 core: the last
`sharecurve.js` export (`logs/sharecurve-1783196400697.json`) already recorded
`homeCpuCores: 2`, and `ns.singularity.upgradeHomeCores()` can push it higher.
`assignBatchHosts` / `planPrep` then place each job (hack/weaken1/grow/weaken2) on whatever
host has room, with **no core-awareness** — so a job sized for 1 core can land on a 2-core
home and behave differently than modeled.

Which calls are core-sensitive at all (from `markdown/`):

| Call | `cores` param? | Core effect |
|---|---|---|
| `growthAnalyze` / `formulas.hacking.growThreads` / `growPercent` / `growAmount` | yes | more cores → each grow thread multiplies money by more (fewer threads needed) |
| `growthAnalyzeSecurity` | yes | **ambiguous** — see open question Q1; param appears tied to the host-thread-cap, not per-thread security |
| `weakenAnalyze` / `formulas.hacking.weakenEffect` | yes | explicit: `1 + (cores-1)/16` — more cores → each thread removes more security |
| `hackAnalyze` / `hackAnalyzeSecurity` / `hackPercent` | **none** | hack is entirely core-independent |

## The reframing: this is (almost certainly) efficiency, not correctness

The original BACKLOG entry (2026-07-08) claimed a **correctness drift bug** — grow landing on
home would add more security than a cores=1-sized weaken2 removes, leaving the batch above min
security. On closer reading of the API docs, **that claim is probably wrong**, and this doc
supersedes it pending Q1.

If grow's *security add* is core-**independent** (Q1 — what the docs suggest), then everything
sized at cores=1 is a **conservative overshoot** whenever the job lands on a >1-core host, in
every direction:

- **grow money**: cores=1 sizing → home over-restores money → clamps at `moneyMax`. Safe.
- **weaken (both)**: cores=1 per-thread effect (`weakenAnalyze(1)` = 0.05) is the *weakest*
  case; on more cores each thread removes *more* → over-corrects → clamps at min security. Safe.
- **grow security to counter**: fixed amount (core-independent), so weaken2's target doesn't
  move with grow's host. Safe.

Neither over-grow nor over-weaken can overshoot into a *bad* state (money clamps at max,
security clamps at min). **So at cores=1 sizing there is no correctness bug — only wasted
threads on home-hosted jobs.** That makes this an efficiency / RAM-reclamation feature.

(If Q1 comes back the other way — grow security *does* scale with cores — then the original
correctness concern is real and this becomes a bug fix. That's why Q1 is the gating question.)

## The value question: how much home RAM is there to reclaim?

The payoff is proportional to **home's share of total allocatable worker RAM**, because
core-aware sizing only changes the thread count of jobs that actually land on home.

Back-of-envelope from the last `sharecurve` export: total capacity **1,057,636 GB**; home max
RAM is a few TB at most against a **petabyte-scale** fleet — plausibly **well under 1%**. A
2-core weaken saves only `1 − 1/(1+1/16)` ≈ **6%** of that job's threads, and only on the
home-hosted fraction. 6% of <1% is noise. The prize only becomes real when **both** hold:
home cores are upgraded well past 2 (Singularity), **and** home is a meaningful RAM share
(early game / small post-reset fleet — though those are exactly when home cores are still low).

Meanwhile the refactor is **not** cheap: sizing currently runs *before* host assignment
(`sampleBatchFields` → `assignBatchHosts`), so core-aware sizing requires knowing the host
first — reordering that boundary, not a drive-by edit.

## Recommended shape: measure-first, with an explicit decision gate

**Decision (proposed): do not refactor sizing blind. Gate the phase on a measurement.**

1. **Throwaway probe** (~1 GB, same pattern as `sharecurve.js` / the retired `ramprobe-*`
   scripts, exported to `logs/` per the log-over-paste rule): report (a) home's current
   `cpuCores`, (b) home's max RAM as a **fraction of `totalAllocatableRam(listHosts(ns))`**,
   and (c) an empirical answer to Q1 — compare `ns.growthAnalyzeSecurity(N)` against
   `ns.growthAnalyzeSecurity(N, "home")` and, if feasible, an observed real grow's security
   delta on home vs. a 1-core host.
2. **Gate:** if home is a trivial RAM share (say < ~2–3%) *and* cores ≤ 2 → write up
   "measured, not worth it", close the phase, leave the BACKLOG idea as documented-and-declined
   (precedent: the `upgradehomeram` automation demotion, `docs/phases/phase-10` follow-ups). If
   it clears the gate *or* Q1 reveals a real correctness bug → proceed to the sizing refactor.

This mirrors Phase 8's deferred "core-weighted share placement" open question
(`docs/phases/phase-08-batcher-refactor.md:164`, `sharecurve.js:33-35`) — same mechanic, this
is its hack/grow/weaken-batcher sibling.

## Design options if it clears the gate (not yet chosen)

- **Option A — host-first core-aware sizing (general).** Assign each job to a host first,
  then size grow/weaken with that host's real `cpuCores` (both branches — legacy
  `growthAnalyze`/`weakenAnalyze` and formulas `growThreads`/`weakenEffect` all take `cores`).
  Correct and complete; works for any multi-core host, not just home. Cost: reorders the
  sizing↔assignment boundary and the per-tick shrink-retry loop has to re-fit after resizing.
- **Option B — home-only, formulas-only.** Only recompute a job's threads when it's assigned
  to `home`, only in the formulas branch. Smaller blast radius; leaves legacy and the fleet
  untouched. Cost: special-cases one host; still needs host-known-before-sizing.
- **Option C — bias placement, keep cores=1 sizing.** Don't touch sizing math (keep the safe
  overshoot); just prefer routing grow/weaken to home so its cores become extra safety margin.
  Zero correctness risk, minimal code — but reclaims **no** RAM, so it only helps if Q1 turns
  this into a correctness fix. Likely the wrong lever if the goal is efficiency.

**Leaning:** Option A if the gate clears (do it once, properly, for all hosts), with the probe
deciding whether we get that far at all.

## Open questions

- **Q1 (gating): does grow's per-thread security increase depend on cores?** Decides
  bug-vs-optimization. Docs are ambiguous; the `growthAnalyzeSecurity` `cores` param reads as
  tied to the host-thread-cap, not per-thread security, which would mean core-independent (→
  no correctness bug). Verify empirically in the probe before designing. Do **not** read game
  source to resolve this (CLAUDE.md off-limits rule) — API docs + an in-game probe only.
- **Q2:** is the RAM prize big enough to justify the sizing↔assignment reorder? Answered by
  the probe's home-RAM-share number.
- **Q3:** if we proceed, does `steadyStatePlan` (ranking) also need core-awareness, or only the
  two dispatch paths (`sampleBatchFields`, `samplePrepFields`)? Ranking only compares targets
  relative to each other, so a uniform cores assumption may be fine there — decide at spec time.
- **Q4:** interaction with Phase 8's deferred core-weighted *share* placement — if we build
  host-core plumbing here, does share placement get it for free / should the two be co-scoped?

## Validation expectations (for the spec stage to make concrete)

- Probe output is an **exported log file**, not pasted terminal text.
- If the refactor proceeds: unit tests for the resized thread math (vitest, formulas-branch
  goldens like the existing `sampling` tests), a **RAM gate** run (touches `sampling.js` /
  `scheduler.js` — core batcher hot path), `npm run verify:log`, and a **live** daemon session
  confirming batches still land clean (no residual security drift, no under-grow) — the RAM/log/
  live checks depend on Kenneth's in-game run.
