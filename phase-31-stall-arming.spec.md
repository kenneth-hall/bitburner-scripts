# Phase 31 — Stall-arming: let a stalled auto-cycle install instead of waiting forever

**Stage:** implemented, on branch `phase31-stall-arming` (not yet merged to `master`).
**Model:** drafted opus, cold-review by `spec-reviewer` before implement; implemented sonnet.
**Scope:** one pure-function change + wiring + unit tests in `src/augfarmer.js`. Not a full phase.

**Implementation status (2026-07-21):** all code + the 10 acceptance-criteria unit tests are in
(`npm test` green, 752/752, incl. the `reasons` regression-handling requirement). Live-verified:
`augfarmer.js` restarted clean over CDP (no runtime error popup), `ramcheck.js` reads 64.1 GB —
matches the 64.10 GB pre-change baseline, confirming the pure-logic-only claim. **Still open:** the
ship gate's live confirmation (a subsequent stalled money-blocked cycle arms and installs
unattended) can't fire before the `STALL_MIN_MS` 12h floor elapses — next-day check, not
same-session. Do not merge to `master` until that's confirmed.

## Problem

`augfarmer.js`'s install trigger can never fire while the buyer is money-blocked. The buyer sits in
the `awaiting-money` phase saving for the next reachable aug; that phase sets `phaseArmed = false`,
so `armed = (gainArmed && phaseArmed) || gateArmed` short-circuits to false regardless of how much
value is queued or how long the wait is.

**Observed live (2026-07-21):** the cycle sat in `awaiting-money` for **71.4h** (adaptive threshold
24.0h) with `gainArmed:true, phaseArmed:false, gateArmed:false` — 7 augs queued at `queuedGain 1.18`
(>the 1.1 gate) and a steeply-escalated price ladder inflating every further purchase (the per-purchase
base is `~2.166` as measured for NFG in `NFG_PRICE_LADDER`; the generic-aug base is *unmeasured* in
this fork — a live probe used `1.9`, so treat the exact multiple as approximate). The stall detector
(Phase 26 B2) **already warned** about this for 3 days; it just has no action wired to it. The
deadlock was only broken by a manual `run installer.js` (install #14, `mult.hacking 1.280 → 1.510`).

### Root cause: an asymmetry

The trigger already has two phase-independent escape hatches:
- **rep grind horizon** — if earning the needed rep will take `> GRIND_HORIZON_MS` (8h), it arms.
- **`gateArmed`** — if the queued augs would close a faction aug-count gate, it arms.

There is **no equivalent for money-blocked**. Rep-blocked-too-long installs; money-blocked-too-long
waits indefinitely. This fix adds the missing symmetric hatch.

## Fix

Add a fourth arming reason, `stallArmed`, that reuses the *existing* adaptive stall threshold:

```
stalled     = (nowMs - lastAugReset) > computeStallThreshold(cycleIntervalsMs)
              // recomputed raw here from lastAugReset/cycleIntervalsMs — NOT reused from evalStall's
              // output, which is gated off during installSeqActive/paused/observe and computed later
stallArmed  = stalled && queuedCount >= 1 && !paused && !endgameHold
              && phase !== "grinding"                              // never override a productive grind
              && (gainArmed || queuedCount >= STALL_QUEUE_FLOOR)

armed       = (gainArmed && phaseArmed) || gateArmed || stallArmed
```

`stallArmed` becomes a fourth key in `evalTrigger`'s returned `reasons` object (alongside
`gainArmed`, `phaseArmed`, `gateArmed`). `stalled` is passed into `evalTrigger` as a new input with
an explicit `= false` default in the destructure (file convention: explicit defaults).

Note (telemetry, not a bug): the raw `stalled` fed to `evalTrigger` is computed regardless of `mode`,
whereas `evalStall` reports `stalled:false` in observe mode ("stalled has no meaning there"). So
`augfarmer-state.json` can legitimately show `stall.stalled:false` next to `reasons.stallArmed`
reflecting the raw value — the same benign mode-dependent split `gainArmed` already has. `stallArmed`
still can't *act* in observe mode: the whole install sequence is gated on `mode === "auto"` downstream.

Everything downstream (`TRIGGER_SUSTAIN_MS` sustain, the auto-mode latch, the abort levers) applies
to `stallArmed` unchanged, exactly as it does to `gateArmed`.

### Why this shape

- **No new time constant.** `computeStallThreshold` (3× median cycle, clamped [12h,48h], fallback
  24h) is already the "you've been stalled too long" signal driving the WARN. Arming on the same
  signal keeps one source of truth; the threshold stays adaptive and tightens as real BN2 cycle
  intervals accumulate.
- **`gainArmed OR queuedCount ≥ floor`, not `gainArmed` alone.** The 10% gate (`MIN_TOTAL_GAIN`)
  measures *hacking-mult gain* only. The escalation reset — the actual reason to install a stalled
  queue — is a *cost* reduction the gain metric can't see. A cycle spent buying Daedalus count-gate
  padding (all `hacking = 1.0`, so `queuedGain ≈ 1.0`, `gainArmed` false) would inflate the price
  ladder yet never arm. A second sub-condition covers that case. It's expressed as a **plain integer
  `queuedCount` threshold**, not an escalation-power formula: since escalation is monotonic in
  purchase count, `escalation ≥ X` is just `queuedCount ≥ N`, and writing it as `1.9^N` both
  collides with this file's *measured* ladder constant (`NFG_PRICE_LADDER = 2.166`, whose header
  notes the old `1.9` ran ~14% low) and invites a rounded-literal boundary bug. `queuedCount` here
  is the **raw** count (`queuedNames.length`), which includes each queued NFG *level* as a separate
  entry — that is correct, because escalation applies per *purchase*, and an NFG level is a purchase
  that raises the ladder exactly like a distinct aug does. `STALL_QUEUE_FLOOR` is the one new
  constant (default below).
- **`phase !== "grinding"` — do not override a productive grind (cold review, fable).** `stallArmed`
  is otherwise phase-blind, and the trigger already has a *correct* handler for a too-long grind: the
  `phaseArmed` grind-horizon (arm iff the remaining rep will take `> GRIND_HORIZON_MS` = 8h). A
  `grinding` cycle whose horizon is *under* 8h is deliberately waited out because it's about to
  finish. Without this gate, a cycle merely older than the (24h-fallback) stall threshold would
  install mid-grind and throw away a near-complete rep track — turning the stall threshold into a
  de-facto max cycle length. Excluding `grinding` leaves the two states `stallArmed` actually exists
  for: `awaiting-money` (the money-blocked deadlock, no horizon logic at all) and `idle-plateau` (the
  sub-10%-gain padding queue). Grinding that genuinely *should* install is already covered — long
  horizon or no-faction-owed both set `phaseArmed = true` via the existing path, and a count-gate
  grind arms via `gateArmed`; none of those needs `stallArmed`. A grind can't deadlock here either:
  it's actively buying/earning, and when it runs out of reachable augs it flips to `idle-plateau`,
  where `stallArmed` *does* apply.
- **No circular dependency.** `stalled` uses only `nowMs`, `lastAugReset`, `cycleIntervalsMs` — none
  of which depend on `installSeq`. Compute it before `evalTrigger` and pass it in; `evalStall` (the
  WARN path, which *is* gated on `installSeqActive`) still runs afterward and recomputes/​reuses the
  same threshold. No reordering hazard.
- **Self-limiting against thrash.** After an install, `lastAugReset` changes → `ageMs ≈ 0` →
  `stalled = false`; the loop already resets `installSeq`/`stallState` on that boundary. The queue
  also empties (`queuedGain → 1.0`) and escalation resets (`1.9^0 = 1`), so neither sub-condition of
  `stallArmed` can re-fire until a fresh queue has both re-accumulated *and* re-stalled past the
  (12h+) threshold. This is the anti-impatience guard Kenneth asked for; it needs no extra logic.

## New constant (provisional)

- `STALL_QUEUE_FLOOR` — proposed **`5`** (integer). Arm a stalled cycle once ≥5 purchases are queued
  even if their mult gain is under 10%. Rationale: at the measured `2.166` ladder, 5 queued
  purchases is ≈47× escalation — clearly worth resetting; below that a stalled cycle with sub-10%
  gain is genuinely marginal and can keep waiting. Plain integer (not `2.166^5`) so the boundary is
  unambiguous and the constant doesn't drift if the ladder is re-measured. Marked provisional — same
  status as `MIN_TOTAL_GAIN` and the STALL_* constants. The first few BN2 install cadences (starting
  with the in-flight #14 re-bootstrap measurement) will show whether 5 is right; tuning it is a
  constant edit, not a redesign.

## Wiring note (implementation)

`stalled` must be computed *before* the `evalTrigger(` call (currently ~line 1943), which means the
`cycleIntervalsMs` derivation (`recentCycleIntervals(readJSON(RATCHET_LOG_FILE), resetInfo.lastNodeReset)`,
currently ~line 2023, feeding `evalStall`) is **hoisted above** `evalTrigger`. `resetInfo`/`lastAugReset`
are already available earlier in the loop, so the hoist is mechanical. `evalStall` (the WARN path) then
consumes the same already-derived `cycleIntervalsMs` — no double read.

## Acceptance criteria (testable — `evalTrigger` is a pure function)

New unit tests in the existing augfarmer test file (`test/augfarmer.test.js`), all against `evalTrigger`:
1. **stalled + gain, money-blocked** → `stalled:true`, `phase:"awaiting-money"`, `queuedGain 1.18`
   (totalGain ≥1.1), `queuedCount` below floor → `armed:true`, `reasons.stallArmed:true`. *Models the
   live 71h deadlock's gain branch (the live queue was 7, above floor — this isolates the gain path).*
2. **stalled + padding queue, plateaued** → `stalled:true`, `phase:"idle-plateau"`, `queuedGain 1.0`
   (totalGain <1.1), `queuedCount 5` (≥ `STALL_QUEUE_FLOOR`) → `armed:true` via the queue-floor
   branch, `reasons.stallArmed:true`.
3. **stalled + tiny queue** → `stalled:true`, `phase:"idle-plateau"`, `queuedGain 1.0`, `queuedCount 2`
   (< floor) → `armed:false`, `reasons.stallArmed:false` (neither sub-condition met — keep waiting).
4. **boundary** → `stalled:true`, `phase:"idle-plateau"`, `queuedGain 1.0`, `queuedCount ===
   STALL_QUEUE_FLOOR` (5) → `armed:true` (pins the `>=` boundary so it can't regress to `>`).
5. **stalled + productive grind (fable's blocker)** → `stalled:true`, `phase:"grinding"`, a *short*
   rep horizon so `phaseArmed:false`, `gainArmed:true` → `armed:false`, `reasons.stallArmed:false`.
   This pins that `stallArmed` never overrides a sub-8h grind; without the `phase !== "grinding"`
   gate this case would wrongly install.
6. **grinding, long horizon** (regression) → `stalled:true`, `phase:"grinding"`, horizon > 8h,
   `gainArmed:true` → `armed:true` via the *existing* `phaseArmed` path (not `stallArmed`);
   `reasons.stallArmed:false`, `reasons.phaseArmed:true` — confirms the grind-horizon path is intact.
7. **not stalled** → `stalled:false`, otherwise identical to case 1's inputs → `armed:false`,
   `reasons.stallArmed:false` (no regression for non-stalled money-blocked cycles).
8. **paused / endgameHold** with an otherwise-arming stalled state → `armed:false` (guards honored).
9. **default** → `stalled` omitted from inputs → behaves as `stalled:false` (explicit-default check).
10. **sustain + latch** → parity with `gateArmed`'s existing coverage (test lines ~1271–1295): a
    `stallArmed` state sustains to `fired` only after `TRIGGER_SUSTAIN_MS`, and once `fired` in auto
    mode it latches across a subsequent call whose inputs would no longer arm.

Regression handling (blocker from cold review): adding `stallArmed` to `reasons` **will** break the
existing exact-match `expect(t.reasons).toEqual({...})` assertions (e.g. `test/augfarmer.test.js:1104`).
The ship gate is therefore *not* "existing tests pass unchanged" — it is: **every existing `reasons`
`toEqual` assertion is updated to include `stallArmed: false`**, and each of the legacy
`gainArmed`/`gateArmed`/rep-horizon cases explicitly asserts `stallArmed: false`. That last point is
load-bearing: without it, a future `gainArmed` regression in a shared fixture could be masked by
`stallArmed` firing instead. All other (non-`reasons`) existing assertions stay unchanged.

Ship gate: `npm test` green (updated existing + new), then a live confirmation that a subsequent
stalled money-blocked cycle arms and installs on its own (no manual `installer.js`). **That live
check cannot fire before the `STALL_MIN_MS` 12h floor elapses** — it is a next-day validation, not a
same-session one; `npm test` is the same-session gate. RAM: pure-logic change, no new `ns` surface —
`ramcheck.js` should show `augfarmer.js` unchanged (assert this, don't assume).

## Open questions (log, don't block)

1. **`endgameHold` interaction — deferral confirmed safe (cold review).** `stallArmed` gates OFF on
   `endgameHold`, and that is the *correct* default, not just a can't-bite-yet punt: an install during
   the Daedalus push resets faction membership and rep (per `docs/reset-protocol.md`), so arming a
   stalled endgame cycle would throw away the exact progress endgame is grinding for. The one case
   where an endgame install *is* wanted — closing a count-gate to unlock Daedalus — is already handled
   by `gateArmed`, which is deliberately un-gated on `endgameHold`. (We're also at hacking 1
   post-install, far from the 2500 gate, so it can't bite this cycle regardless.)
2. **Escalation-scaled threshold (Kenneth's "rewards the resetting cycle").** v1 reuses the flat
   12–48h stall threshold and delivers only the *binary* form of requirement 3 (a sub-10%-gain
   padding queue can now install *at all*). The stronger reading — the *time* threshold shrinking as
   escalation rises, so a heavily-escalated queue installs *sooner* — is deferred as a v2 refinement.
   v1's "install eventually" already dominates the current "install never"; confirm the binary form
   is accepted for v1 rather than assumed.
3. **Is the `queuedCount ≥ floor` branch even load-bearing, or does `gainArmed` alone suffice?**
   If real cycles never queue enough pure-padding to matter, the branch is dead code. Keep it (cheap
   insurance, and the Daedalus 30-gate does force padding augs), but flag for removal if telemetry
   shows it never fires.

## Why no brainstorm act

Root cause is a single identified asymmetry with an existing symmetric precedent (`gateArmed`, the
rep horizon) to copy; there are no rejected-alternative architectures worth a brainstorm doc. The
one genuine design choice — reuse the existing stall threshold vs. invent a money horizon — is
resolved above (reuse). Kenneth and Claude agreed to the half-phase (spec + test + review, skip
brainstorm) before drafting. The cold-context `spec-reviewer` pass is retained precisely because
this file has a logged history of under-thought edits to exactly this arming logic.
