# Phase 32 — BN2.1 progress tracker (dashboard "goal section")

**Stage:** brainstorm (features) · **Started:** 2026-07-21 · **Author:** opus w/ Kenneth

## Why

We could not answer *"are we progressing toward ending BN2.1?"* from a glance. The loudest
metrics (gang respect 425× over goal, faction rep saturated) are **solved subgoals** — watching
them is false confidence. The metric that actually gates the win — the installed hacking
multiplier `M` climbing toward the `w0r1d_d43m0n` gate — lives nowhere as a standing readout; its
inputs are scattered across three log files.

This phase adds a **"goal section" to `dashboard.js`** surfacing the small set of KPIs that
genuinely indicate progress to the end of the node. Space for it was approved deliberately (the
dashboard is a fixed-budget, no-wrap, single-instance surface — this brainstorm is the gate the
observability convention requires).

## The win, restated (so the KPIs trace to it)

Win = backdoor `w0r1d_d43m0n` at hacking level ~15,000 (Difficulty 500%, an **~85% inference** —
unreadable until The Red Pill installs; see the standing checkpoint in `CLAUDE.md`). Level is
gated by the installed hacking multiplier `M`: level = `M` × baseLevel(exp), and exp is cheap
(XP farm). So **`M` is the north-star**; money is the leading indicator that buys the augs that
raise `M`. Everything below traces to that chain.

Target `M`: **~16.7** (NiteSec core catalog, ~$149b, the achievable floor) → **~29** (add QLink,
+$25t, comfortable). We are at **1.51 installed** (live `auginfo`, 2026-07-21 12:15).

## KPIs (decided)

Three progress KPIs. RAM utilization, gang respect, rep — **explicitly excluded** as progress
signals (they're engine diagnostics or solved subgoals; only reached for *after* a KPI flags a
stall).

### KPI 1 — `M` progress %
- **Display:** `M: 1.51 / 16.7 (~9%)` — the % is the point (Kenneth: "I'll remember 5% vs 7% a
  lot better than 1.26 vs 1.31").
- **Denominator:** `16.7` (core-catalog floor). Target is **labeled** in the readout so a switch
  to 29 (QLink) is transparent, not silent.
- **Numerator:** *installed* `M` (`ns.getPlayer().mults.hacking`). Queued-but-not-installed augs
  are **not** counted — they aren't real until install.
- **Honesty note:** raw `M`/target is *linear on a multiplicative quantity* — the bar sits low
  then accelerates. This is accepted and understood; the number is a morale/direction gauge, not
  a literal "% to win." The `~` prefix signals approximate.

### KPI 2 — income rate `$/sec` + smoothed trend
- **Display:** `$/sec: 2.1b ↑` (value + direction arrow from a smoothed window).
- **Rate, not bank** — bank sawtooths (drops the instant augfarmer buys); the rate is the pulse.
- **Smoothed, not instantaneous** — raw `$/sec` dips after *every* install (level resets to ~264,
  income recovers as level climbs). An instantaneous delta would cry "declining!" every cycle.
  The trend is computed over a window so the sawtooth doesn't trigger false alarms.
- **Source — gang-dominated, measured 2026-07-21.** Live `moneysources.js` probe this cycle:
  **gang +$16.25b (~96% of positive income), hacking +$700m (~4%)**. The batcher is throttled
  early-cycle (level reset to ~264), the gang carries income and does **not** reset on install.
  So the sampler must track **gang + hacking with gang foregrounded** — `transactionsmonitor.js`
  diffs only `.hacking`, which would show ~4% of reality.
- **Rate is an empirical diff of cumulative `getMoneySources().sinceInstall` (gang + hacking) over
  the interval** — NOT the gang's `moneyGainRate` field (its unit doesn't reconcile with the
  cumulative: $503.9k/tick vs $16.25b banked). Diffing the cumulative is unit-agnostic and correct.
- **Note:** this inverts CLAUDE.md's "the batcher dominates the money curve" (flagged for
  correction, not patched here). Consequence for the sawtooth guard above: post-install income
  dips *less* than feared, because gang income is install-invariant — the smoothing window still
  matters but the alarm risk is lower.

### KPI 3 — `$` to next aug + elapsed "awaiting-money" timer (in the goal section)
- **Display:** `next: Cranial Sig Proc V — $15.4b · waiting 12m`.
- **Value:** augfarmer already tracks `$`-to-next-aug (`augfarmer-state.json` → `target.livePrice`,
  `phase: "awaiting-money"`).
- **Timer is ELAPSED, not a countdown ETA.** A countdown divides by the sawtoothing `$/sec` and
  swings wildly. Elapsed "time spent in `awaiting-money`" is honest *and* doubles as the
  bottleneck signal (long elapsed → stuck; short/cyclic → healthy sawtooth).

## Work order (phased)

**Step 1 — Complete the income ledger (PREREQUISITE, do first).** Today `transactionsmonitor.js`
logs only `.hacking` income while the transactions log records gang *expenses* (`gang-equip`) but
**not gang income** — so the ledger captures ~4% of actual income (gang is ~96%). Extend
`transactionsmonitor.js` to also diff `getMoneySources().sinceStart.gang` and write it as
`source: "gang"` income, symmetric with the existing hacking path. This is the trustworthy
foundation KPI 2's rate stands on — the rate is meaningless until total income is actually
captured. Respect the file's concurrency discipline (no `await` between the `ns.read` and
`ns.write`; the same known startup-baseline gap applies to the gang baseline). One-time check at
impl: confirm logged `gang-equip` expenses reconcile with `sinceInstall.gang_expenses`.

**Step 2 — Sampler + dashboard goal section** (the KPIs above). Depends on Step 1's complete
ledger.

## Architecture (recommended)

**One durable progress sampler + dashboard as a pure reader** — mirrors the existing
`gangratelog.js` ⇒ `gang-state.json` ⇒ dashboard-gang-panel pattern exactly.

- **New resident sampler** (`bn2progresslog.js` or similar), daemon-supervised
  (`RESIDENT_COMPANIONS`), surviving restarts/installs like `gangratelog.js`. Each interval it
  writes a small **progress-state file** with: installed `M`, target + %, smoothed `$/sec`,
  trend direction, and echoes `$`-to-next-aug + `awaiting-since` from `augfarmer-state.json`.
- It also keeps a **ring-capped series** (for the smoothed trend and for later reasoning), same
  ring/`appendCapped` shape as `gangratelog.js`.
- **`dashboard.js` reads the one progress-state file and renders the goal section** — pure
  `ns.read`, **zero added `ns` RAM**. Critically, sampling `M` in the sampler (not the dashboard)
  keeps `getPlayer()` off the dashboard's tight RAM budget.

## Rejected alternatives

- **Bank-vs-target progress bar (`$X / $149b saved`)** — rejected. The bank *never* holds $149b:
  aug prices escalate ~1.9× per aug within a cycle, installing resets the escalation, so the
  catalog is bought cumulatively across many cycles. A "saved toward target" bar would be wrong
  by construction.
- **Earned-progress normalization for KPI 1** `(M−1.28)/(16.7−1.28)` — rejected. Makes a fresh
  install read 0% (more motivating), but 1.28 is real permanent multiplier we hold (SF1.3), and
  the extra arithmetic fights the "memorable number" goal.
- **Countdown ETA timer for KPI 3** — rejected (see KPI 3): divides by a noisy rate.
- **Dashboard computes the metrics itself** — rejected: `getPlayer()`/history don't fit the
  dashboard's RAM budget or its snapshot-only nature; history would reset every restart.
- **Piggyback KPI 2 on the daily transactions log** — rejected: it's per-day (resets at
  rollover), coalesced records not a rate series, and its `$/min` is a cumulative average, not a
  smoothed *recent* rate.

## Open questions (for spec stage / Kenneth)

1. **Unified vs. money-specific sampler.** `gangratelog.js` already samples gang money rate.
   Do we (a) add a *separate* `bn2progresslog.js`, or (b) extend/rename the existing sampler into
   a general "progress" sampler? (a) is lower-coupling and matches the one-file-one-job norm;
   (b) avoids two residents reading overlapping state. Leaning (a).
2. **Sample interval.** `gangratelog.js` uses 5 min (14-day ring). A `$/sec` smoothing window
   wants finer resolution than 5 min or the trend arrow lags badly. Probably a shorter interval
   (30–60 s) with a smaller ring, or two cadences. Spec-stage detail.
3. **`awaiting-since` timestamp.** `augfarmer-state.json` has `phase: "awaiting-money"` but **no
   phase-entry timestamp** — augfarmer needs a one-line change to stamp when it *enters*
   awaiting-money (and clear it on buy). Confirm this is in scope for the phase (it's a small
   augfarmer edit, not just dashboard work).
4. **Per-cycle money projection (KPI candidate #4, deferred).** Kenneth raised "total $ needed for
   this install cycle." We install *greedily* (no budget projection exists). Building the
   projection = summing remaining targeted augs' escalated prices. **Parked** for this phase —
   decide after the three core KPIs land whether it earns its complexity.
5. **Goal-section placement & exact glyphs** in the fixed-budget dashboard layout — spec/impl
   detail, not a brainstorm decision.

## Scope / non-goals

- **In:** (Step 1) complete the income ledger — add gang income to `transactionsmonitor.js`;
  (Step 2) dashboard goal section; the three KPIs above; the progress sampler; the small augfarmer
  `awaiting-since` stamp.
- **Confirmed already tracked:** gang *equipment* expenses (`gangmanager.js:582`, `gang-equip`) and
  all other spend (augs/servers/RAM/programs) via `recordTransaction`. The only ledger gap is gang
  *income* (Step 1).
- **Out:** per-cycle money projection (parked, OQ4); any change to *how* we buy/install (this is
  pure observability); RAM/target/scheduler diagnostics (reached for only when a KPI flags a
  stall, not surfaced standing).
