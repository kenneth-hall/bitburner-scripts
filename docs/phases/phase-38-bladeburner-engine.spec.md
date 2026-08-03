# Phase 38 spec: the Bladeburner engine

**Stage:** spec (drafted 2026-07-31 from `phase-38-bladeburner-engine.features.md`; **revised once**
against a cold `spec-reviewer` pass that returned **9 blockers**).
**Model flow:** brainstorm opus → this spec (⚠️ **also opus, not fable** — deviation flagged and
accepted) → cold review ×1 → implement (sonnet).
**Scope:** a `bladeburnermanager.js` resident that plays Bladeburner unattended and instruments its
own rank curve, the narrow `augfarmer.js` cooperative slot hold that makes it possible, and
supervisor gating. **Deliverable is a decision** — is the counter-map's back-half Bladeburner
premise real? — not a BN6 clear. Hacking remains the BN6 win path.

**✅ Slice A (WI1) shipped and live-green 2026-07-31.** `resolveSlotHold` + the `planPass`
`slotHold` suppression sites landed on `phase-38-bladeburner-engine` (35 new tests, `npm test`
1060/1060, `npm run verify:log`'s 3 failures pre-existing/unrelated — confirmed via `git stash`).
Ship gate T1/T2/R1/V1/V2 all cleared:
- **R1** — `mem augfarmer.js` re-measured live at **64.10 GB**, byte-identical to the pre-change
  baseline. No RAM drift from the marker read (0 GB `ns.read`) or the new identifiers.
- **V1/V2** — exercised live with a throwaway stand-in harness (`slotholdtest.js`, deleted after
  the run per its own header — not committed) that played bladeburnermanager's role: stopped the
  player's action, wrote/refreshed the marker for 40s, then stopped refreshing and watched for
  30s+. Transcript (abridged): marker written → `augfarmer.js: INFO: slot held by slotholdtest --
  rep work suppressed` within one poll; `getCurrentWork()` stayed `null` for the full 40s hold
  while `phase` stayed `"grinding"` throughout (never leaked, decision 1 confirmed); refresh
  stopped → ~32s later `augfarmer.js: INFO: slot hold released -- rep work resuming`, work
  resumed with a fresh `cyclesWorked` count, no operator action. Matches decision 5's ~30s
  self-healing bound and blocker B8's prompt-write-gate intent exactly.
- **Known cosmetic gap, not a correctness issue:** `augfarmer-state.json`'s `slotHold.holdAgeMs`
  does not tick upward during a sustained hold — it's only rewritten on `slotHoldChanged` (a
  transition edge) or the 5-min heartbeat, the same precedent as `awaitingMoneySinceChanged`/
  `triggerArmChanged`. The live-observed ground truth (`getCurrentWork()`, the log lines) is what
  was actually tested; a consumer reading `holdAgeMs` mid-hold sees a stale-but-not-wrong age.

**🟡 Slice B (WI2-4) implemented and partially live-validated 2026-07-31 — on branch
`phase-38-slice-b`, NOT YET merged.** All ten spec-listed pure functions (`expectedRankPerSec`,
`pickRankAction`, `planSkillBuy`, `shouldRotateCity`, `classifyWindow`, `higherPriorityClaimant`,
`computeRealizedRates`, `computeDutyCycle`, `computeRepForegone`, `projectRankEta`) plus
`estimateRepRatePerSec` (a RAM-free `repForegone` input, derived from two `augfarmer-state.json`
reads rather than adding a Singularity call). `bladeburnermanager.js` main loop, WI3 instrumentation
(`bladeburner-state.json`/`bladeburner-log.json` + `vite.config.ts` filters), WI4 daemon supervisor
gating (`BLADEBURNER_GATED_COMPANIONS`, `supervisedResidents`'s third param, `inBladeburnerSafe`).
87 new tests, `npm test` 1117/1117 green, `npm run verify:log`'s same 3 pre-existing failures
(confirmed via `git stash`).
- **RAM, measured live:** `bladeburnermanager.js` **61.00 GB** — but only after finding and fixing a
  **`window` identifier collision with the DOM global** mid-measurement (false **+25 GB**, first
  reading 86.00 GB). Same bug class as CLAUDE.md's `share`/`ls`/`exec` list; `window` wasn't
  previously on it and is now worth adding. `daemon.js` re-measured at **16.30 GB** with no
  `bladeburner.*` line in the breakdown — `inBladeburner()`'s documented 0 GB held live (**R2**).
- **V3 (L4), partial:** daemon restart auto-launched `bladeburnermanager.js`; `backdoorfactions.js`
  happened to already be running, and the engine logged a **stand-down within ~300ms of startup**,
  released the slot-hold marker (confirmed absent via `ls --grep`), and `backdoorfactions.js`
  completed a backdoor (CSEC) uncontended while stood down — **decision 3 confirmed live**, the
  harder/riskier direction to get right.
  ⚠️ **Not yet confirmed live: the normal (non-stand-down) operating path** — acquire the marker,
  `startAction`, refresh independent of progress, accrue `repForegone`, write
  `bladeburner-state.json`. `backdoorfactions.js` has occupied the higher-priority slot
  continuously since the engine started (hacking 154 vs NiteSec's ~202 gate — a real, possibly
  multi-hour wait, not a bug) — a 600s log-file watch never saw a `stand-down-clear` event, and
  `bladeburner-state.json` has never been written this run (only the off-marker/stand-down branches
  have fired). **L5** (kill mid-action, confirm `atExit` cleanup) is blocked on the same thing —
  there's no action to kill mid-flight yet. Left running; will self-resolve once `backdoorfactions.js`
  clears (naturally, or check back next session) — revisit then, not by killing it early to force
  the test.
- **Not merged to master pending the rest of V3.** Decision 9's checkpoints A (24h)/B (1wk) are
  explicitly "not a merge blocker" (precedent: Phase 35's V3) and are a separate, longer-horizon
  concern from shipping the code — but V3 (the wiring actually working end-to-end) is not optional.

## Context

Two of the features doc's conclusions were overturned by its own process, and the spec inherits the
corrected versions:

- **2026-07-30** — a 75-minute trial measured 0.0144 rank/sec ⇒ ~10.5 months to the rank-400,000
  `Operation Daedalus` gate; Bladeburner was shelved.
- **2026-07-31 (a)** — the slot blocker resolved **against** the design: Bladeburner and
  `singularity` player-work share one exclusive slot that `getCurrentWork()` **cannot see**, so
  `augfarmer.js` re-grabs it ~4s after any Bladeburner action starts and kills it.
- **2026-07-31 (b)** — the **in-game Bladeburner panel had never been opened**, and it contradicts
  the 7/30 model: action time is reducible **10×** (`Overclock`, max 90), skill points accrue at
  **1 per 3 ranks** (~133,000 across the climb vs the 13 measured), team size was **0**, and action
  levels rise with success.

**This spec is not "test whether the verdict was premature." The verdict is known unsound. This
builds the instrument that finds the real curve, and bounds what it costs the win path.**

### Review changelog (what the cold pass changed)

| # | Finding | Resolution |
|---|---|---|
| B1 | Marker contract entirely unspecified, yet L2 asks Kenneth to hand-write one | **§ "The marker contract"** added — filename, schema, tolerance, ordering, ownership |
| B2 | `HOLD_SLICE_MS`/duty cycle undefined; `RATE_MIN_SAMPLES = 30` starvation could silently disable the ratchet's arming path | Constants pinned (decision 4); starvation **dissolved** by B3's fix (holds now produce samples) |
| B3 | Decision 2's reasoning factually wrong (`pickHorizonGrind` reads no rates) and its call-site edit ambiguous | **Old decision 2 deleted.** Sample normally; bound the duty cycle; name and log the residual bias |
| B4 | `backdoorwd.js` (the node-clear executor) and `backdoorfactions.js` also own the slot; engine preempts unconditionally | **New decision 3** — engine stands down while any higher-priority slot claimant runs |
| B5 | Bars derived in wall-clock, measured per held-second — over-reports by 1/dutyCycle | **Decision 8** defines one denominator and reports ETA at both current and 100% duty |
| B6 | Checkpoint B's "fitted trend" unadjudicable | Clause **deleted**; single hard bar + stated default |
| B7 | Realized-rate math loop-inline (violates own ground rule); `verify:log` vacuous | Three pure functions exported + tested; verify-log assertions added |
| B8 | `slotHold` not in the state write gate (5-min lag); `classifyWindow` unbounded/underspecified | Write-gate term added; staleness bound, conservative default, case per phase |
| B9 | Off-marker "honours" ambiguous — the exit reading recreates the 9.1h relaunch storm | Specified idle-in-loop + stop action + delete marker |
| S1 | Decision 6's justification wrong — an orphaned action self-heals in ≤10s | Corrected; `atExit` demoted to hygiene, decision 5 named as the real backstop |
| S3/S4 | Two code-citation errors in decision 1 | Both corrected |
| S5 | "Free windows" aren't free (deficit 0 still accrues rep) | Classification tightened |

---

## Ground rules

- **`augfarmer.js` RAM must measure unchanged** against its live `ramcheck.js` baseline. Additions
  are `ns.read` (**0 GB**) of one new file plus pure arithmetic; augfarmer already calls
  `ns.fileExists` (`:2115`) and `ns.read`. Any delta is checked against the identifier-hygiene bug
  class **first**.
- **`daemon.js` RAM must be re-measured, not assumed.** WI4 adds `ns.bladeburner.inBladeburner()`
  (documented 0 GB), but documented RAM has already proved a poor guide in this API.
- **Identifier hygiene.** New identifiers: `resolveSlotHold`, `SLOT_HOLD_FILE`,
  `SLOT_HOLD_MAX_AGE_MS`, `SLOT_HOLD_FUTURE_TOLERANCE_MS`, `slotHold`, `slotHoldChanged`,
  `holdActive`, `holdAgeMs`, `holdReason`, `holderName`, `pickRankAction`, `expectedRankPerSec`,
  `planSkillBuy`, `skillLevels`, `shouldRotateCity`, `cityName`, `chaosByCity`, `classifyWindow`,
  `computeRealizedRates`, `computeDutyCycle`, `computeRepForegone`, `projectRankEta`,
  `higherPriorityClaimant`, `dutyCycle`, `overheadSec`, `rankSec`, `repForegone`,
  `BLADEBURNER_OFF_MARKER`, `BLADEBURNER_GATED_COMPANIONS`, `HOLD_SLICE_MS`,
  `MAX_CONTESTED_DUTY`, `BB_POLL_MS`, `AUG_STATE_FRESH_MS`.
  ⚠️ **Deliberately avoided:** `skills` (shadows `ns.formulas.skills`) → `skillLevels`; `city` →
  `cityName`; `probe` (shadows `ns.dnet.probe` — cost 0.20 GB on the name alone in
  `bladeburnerprobe.js`); and the standing short-name list (`ls`/`ps`/`rm`/`run`/`kill`/`read`/
  `write`/`scan`/`hack`/`grow`/`weaken`/`share`/`exec`/`tail`). `ns.ps()` **is called** (decision 3)
  but no identifier is named `ps`.
- **The engine spends no money via any API.** ⚠️ It *does* lose money indirectly through
  hospitalization (22 events / **$229.5m** in a 75-minute trial), which decision 7 must bound.
- **No dashboard change this phase [UPDATED 2026-08-01 — superseded, see open question 3]:**
  the Phase 24 gate held until Kenneth explicitly asked for a panel; one shipped that day.
  Observability is `bladeburner-state.json` + `bladeburner-log.json`, now also surfaced (minimally)
  on the dashboard itself.
- **Loop-inline code is not testable** — `test/augfarmer.test.js` exercises exported pure functions
  only. **Every behaviour an acceptance criterion depends on must be an exported pure function.**
- **Existing-test policy.** Shape-extension edits are expected and cite this spec. **No behavioural
  supersession.** Any change to an existing fixture's *expected value* is stop-and-re-derive.

---

## The marker contract *(blocker B1)*

The interface between Slice A and Slice B. Pinned here because Slice A ships and is hand-tested
**before** the engine exists.

- **File:** `bladeburner-slot-hold.json`, on `home`.
- **Schema:** `{ "ts": <epoch ms, number>, "holder": <string> }`. `ts` is the write time, refreshed
  every `BB_POLL_MS`. `holder` is informational (`"bladeburnermanager"`), surfaced in state for
  legibility; it is **never** used to decide whether the hold is honoured.
- **Ownership:** the engine is the sole writer and deleter. **`augfarmer.js` never writes or deletes
  it** — it only reads. This keeps the win-path script free of any responsibility for the
  experiment's lifecycle.
- **Deletion:** on slice release, on off-marker, and in `ns.atExit`. A *deleted* marker and a
  *stale* marker are equivalent in effect (both ⇒ not held); deletion is the fast path, staleness is
  the crash backstop.
- **⚠️ Write ordering is load-bearing:** the engine **writes/refreshes the marker BEFORE calling
  `startAction`**, never after. Reversed, augfarmer's next poll (≤10s) reads the slot as idle and
  kills the action — precisely the 7/31 probe result this whole phase is built on.
- **`SLOT_HOLD_FUTURE_TOLERANCE_MS = 5_000`.** Both processes share one `Date.now()`, so a future
  `ts` means a corrupt/hand-edited file. 5s makes the guard deterministic to test without being
  loose enough to matter.

---

## Spec-stage decisions

### 1. 🔴 The hold must NOT introduce a new `phase` string — this overrides features D9

`plan.phase` is not a display field; `decideInstall`/`evalTrigger` switch on it:

| Site | Test | Effect of a new `"slot-held"` string |
|---|---|---|
| `:1114` | `phase !== "grinding"` gates **`stallArmed`** | **passes** ⇒ stall trigger becomes eligible during holds |
| `:1124` | `else if (phase === "grinding")` | blocker attribution silently changes |
| `:1074/1076` | `idle-plateau` / `grinding` branches | falls through both ⇒ `phaseBlocker = "phase:slot-held"` |
| `:1138` | `phase === "awaiting-money"` gates escalation | ⚠️ **corrected (S3):** the donation-eligible/money-blocked path sets `phase = "awaiting-money"` at `:1870` and **falls through** to the slot logic at `:1873`, so a new string would have **replaced** it and suppressed escalation arming. The earlier draft called this "unaffected" — that was wrong. |

A Bladeburner slice of minutes must not make the ratchet more willing to install; early installs
cost a smaller buy-set plus a full re-climb, expensive under BN6's `HackExpGain 0.25` /
`CloudServerSoftcap 2.0`. In-file precedent: `:~1800` forces `phase: "grinding"` specifically so a
slot outcome can't leak into `evalTrigger`.

**Decision: the hold suppresses the `work` *action* and leaves `phase` exactly as it would have
been.** Legibility comes from a sibling `slotHold` field, never from overloading `phase`.

### 2. Rep-rate sampling proceeds normally — the slower rate is *true* *(replaces the old decision 2, blocker B3)*

The first draft skipped `updateRepRates` across hold windows. **That was wrong on three counts**, all
caught in review:

1. Its stated rationale — "horizons feed `pickHorizonGrind`" — is **false**. `pickHorizonGrind`
   (`:934-942`) takes `(sortedCandidates, joinedSet, donationClosableSet)` and never reads a rate.
2. **The "distortion" is the measurement.** While the engine holds the slot, rep genuinely accrues
   more slowly. Carrying pre-hold rates forward makes `decideInstall`'s `horizonMs = deficit / rate`
   (`:1084`) a *counterfactual* — "how long if nobody were stealing the slot" — so it does not
   remove bias, it **reverses its sign** and hides it.
3. The edit was ambiguous at `:2251-2260`, where `prevFactionRep`/`lastRateUpdate` advance
   unconditionally; skipping the block instead of the call would divide a two-interval rep delta by
   a one-interval `dt` — reproducing the very deflation it aimed to prevent. And "hold active for
   *part* of the interval" is unobservable from two polled reads.

**Decision: do not touch the rate-sampling path at all.** Sample normally.

- **Direction of the residual bias, stated explicitly:** holding depresses measured rep/sec ⇒
  `horizonMs` lengthens ⇒ the grind arm (which fires when the horizon *exceeds* `GRIND_HORIZON_MS`)
  becomes **more** likely ⇒ installs land **slightly earlier**. Bounded by `MAX_CONTESTED_DUTY`
  (decision 4).
- **It also dissolves blocker B2's second half:** because held passes still produce samples,
  `RATE_MIN_SAMPLES = 30` (`:145`, required at `:1083`) can never be starved by holding. Skipping
  would have risked leaving `phaseBlocker = "no-rate-sample"` set indefinitely and silently
  disabling the ratchet's primary arming path.
- **Auditability:** the engine logs `heldFraction` per window, so the uncorrected rate can be
  recovered after the fact. No correction is applied in-line.

### 3. 🔴 The engine stands down for higher-priority slot claimants *(new — blocker B4)*

The features doc treated this as a two-party contract. **It is not.** Other scripts occupy the same
player-action slot and read no marker:

| Script | Call | Why it outranks the engine |
|---|---|---|
| `backdoorwd.js:125` | `installBackdoor()` on `w0r1d_d43m0n` | ⚠️ **the literal node-clear executor.** Preempting it can block the win condition outright. |
| `backdoorfactions.js:224` | `installBackdoor()` on faction servers | re-runs **every install cycle**; gates faction unlocks |
| `studybootstrap.js:75` | `universityCourse` | post-install bootstrap |

`startAction` cancels whatever the player is doing. A slice boundary landing during a WD backdoor —
retried on a slow poll while the engine re-asserts every 10s — could prevent the node clear with no
error and no criterion that would catch it.

**Decision:** `higherPriorityClaimant(processList)` — a pure function over `ns.ps("home")` output
(0.2 GB) — returns the name of any running `backdoorwd.js` / `backdoorfactions.js` /
`studybootstrap.js`. When one is present the engine **releases its hold, stops its action, and does
not re-acquire** until the claimant exits. Checked every `BB_POLL_MS`, and **before** every
`startAction`. Verified live at **L4**.

**⚠️ AMENDED 2026-08-01 — presence-only was starving the engine almost completely, not just being
conservative.** Raised by Kenneth after `bbstartprobe.js` (a live throwaway probe, since deleted)
proved a manually-called `startAction("General","Training")` got killed by this engine's own
stand-down branch within ~450ms of a real `bladeburner-log.json` showing **all 3 recorded
startups since Phase 38 began immediately stood down for `backdoorfactions.js`, zero held-seconds
ever accumulated.** Root cause: `backdoorfactions.js` (and `backdoorwd.js`) are **residents**, not
one-shots — `backdoorfactions.js`'s own header says it "stays resident... while any of
[4 targets] is still unmet" (potentially most of the hacking climb, currently 1/4 done per
`backdoor-status.json`), sleeping 59+ of every 60 seconds. `higherPriorityClaimant` can't see that
distinction — presence alone triggers full stand-down for the ENTIRE residency, not just the brief
`installBackdoor()` windows that actually need the slot. The checkpoints don't hang in this
state (`uptimeMs` is wall-clock, unconditional) — they fire on schedule and cleanly **FAIL at
`rankPerHeldSec = 0.00000`**, measuring "did the engine ever get a turn" rather than "is
Bladeburner viable."

**Fix, scoped to `backdoorfactions.js` only:** it now writes `backdoorfactions-activity.json`
(`{active, timestamp}`) bracketing its ready-target handling block (walk + `installBackdoor()` —
a little wider than the strict minimum, on purpose, for simplicity) via `writeActivity`, with a
steady-state `active:false` refresh every poll so the timestamp never goes stale. New pure
`classifyBackdoorActivity(activity, nowMs)` in `bladeburnermanager.js` reads it and returns
`"idle"` only for an explicit `active:false` with a timestamp fresher than
`BACKDOOR_ACTIVITY_FRESH_MS` (180s = 3x the 60s writer cadence, same shape as `classifyWindow`'s
`AUG_STATE_FRESH_MS`) — missing/malformed/`active:true`/stale all fail toward `"busy"`, mirroring
`classifyWindow`'s own fail-conservative shape. When `higherPriorityClaimant` returns
`"backdoorfactions.js"` specifically, the main loop now additionally consults this classification
before treating it as a real stand-down.

**`backdoorwd.js` and `studybootstrap.js` deliberately NOT touched:** `backdoorwd.js`'s single
action is the literal, irreversible node-clear executor (docs/bladeburner-reference.md) — the
stakes of a false "idle" reading there are categorically higher than a delayed faction invite, and
it hasn't been the active blocker this session (WD doesn't exist yet). `studybootstrap.js` is
one-shot (`main()` returns after a single `universityCourse` call, no loop) — never resident, so
it doesn't have this problem at all.

**Accepted residual risk:** this narrows, but does not eliminate, decision 3's original race. The
window is now the gap between `bladeburnermanager.js`'s read of a fresh `active:false` and its own
`startAction` call in the same tick — both scripts are single-threaded and cooperative, so the only
way this collides is genuine interleaving between two independent script loops at the exact wrong
instant. Judged acceptable: categorically smaller than "stood down for the whole climb," and the
consequence of a collision (a missed/retried faction backdoor) is recoverable, unlike WD.

Tests: 7 new (`classifyBackdoorActivity`, mirroring `classifyWindow`'s null/malformed/stale/exact-
boundary shape), 1133 total pass. `writeActivity` itself is untested directly (impure, ns-touching,
same convention as `writeStatus`).

### 4. Duty cycle and slice length are pinned, not left to the implementer *(blocker B2)*

These decide whether the experiment costs the win path 5% or 80% of its rep throughput:

- **`HOLD_SLICE_MS = 60_000`** — one-minute contested slices. Long enough to complete the fast
  rank-producing contracts (Tracking 12s, Retirement 17s, Bounty Hunter 21s), short enough that a
  released slice returns the slot promptly.
- **`MAX_CONTESTED_DUTY = 0.25`** — over any rolling hour the engine holds at most 25% of
  *contested* wall-time. Free-window holding (decision 6) is **not** capped.
- **`BB_POLL_MS = 10_000`** — matches augfarmer's `POLL_MS` and gives three refreshes inside
  `SLOT_HOLD_MAX_AGE_MS`.
- ⚠️ **The marker refresh must not be blocked by a long action.** `Recruitment` runs 291s — far
  longer than the 30s staleness bound — so the poll loop refreshes the marker on its own cadence,
  independent of action progress. A refresh that only fired between actions would let the hold go
  stale mid-`Recruitment` and hand the slot back, producing hold/re-grab thrash (review S1's genuinely
  uncovered risk).

### 5. `resolveSlotHold` is the safety boundary, and it fails OPEN

The marker is written by a program that can crash. **Every failure mode resolves to *not held*:**

| Input | Result | `holdReason` |
|---|---|---|
| file absent / empty | not held | `"no-marker"` |
| unparseable JSON | not held | `"unparseable"` |
| missing / non-numeric `ts` | not held | `"no-timestamp"` |
| `nowMs - ts > SLOT_HOLD_MAX_AGE_MS` | not held | `"stale"` |
| `ts - nowMs > SLOT_HOLD_FUTURE_TOLERANCE_MS` | not held | `"future-timestamp"` |
| fresh and well-formed | **held** | `"held"` |

**`SLOT_HOLD_MAX_AGE_MS = 30_000`** — three engine heartbeats and three augfarmer polls. Worst case
for a crashed engine: **≤30s of lost rep grinding**, self-healing, no operator action. This is the
`resourcemanager.js` stale-reservation pattern (*"treating as no reservation until it recovers"*) —
**not** the `cloud-upgrade-off.txt` presence check, which is hand-placed and has no writer to crash.
**This is the phase's one safety-critical requirement.**

### 6. Overhead goes in the gaps; contested time goes to rank *(features D10, tightened by S5)*

`classifyWindow(augState, nowMs)` returns `free` | `contested`:

- **`free`** only when augfarmer emits **no faction-work action at all**: `phase` ∈
  {`spend-down`, `installing`, `paused`, `idle-plateau`}.
- **`contested`** for everything else — **including `awaiting-money` with `workTarget.deficit === 0`**
  (⚠️ review S5: rep still accrues toward the head/NFG tail there, so calling it free would
  under-report `repForegone`, the exact failure D7/D10 exist to prevent) — and including
  `grinding`, `yielded`, `gate-fill`, `install-ready`, `awaiting-invite`, any unrecognised phase,
  and a missing/unparseable/stale state file.
- **`AUG_STATE_FRESH_MS = 60_000`.** Beyond that, classification is `contested` regardless of
  content. ⚠️ **Known limitation:** `augfarmer-state.json`'s write gate (`:2963-2973`) fires on
  first-launch / 5-min heartbeat / a buy / `awaitingMoneySinceChanged` / `triggerArmChanged`, and
  its `plan.phase !== previousPhase` term is a **documented dead OR-term** (BACKLOG), so phase
  transitions are *not* reliably persisted promptly. **Consequence: free windows will be
  under-detected, not over-detected.** That is the safe direction — the engine holds contested time
  it could have had for free, costing throughput, never the reverse. Fixing the dead term is
  explicitly out of scope (BACKLOG notes it changes write cadence for every consumer).

In free windows the engine runs zero-rank overhead (`Recruitment`, `Diplomacy`,
`Hyperbolic Regeneration Chamber`). In contested windows it runs **rank-producing actions only**.
**`Training` is never routine upkeep** (features D10: combat stats are wiped by every install while
rank and skill points survive; effective combat is bought via `Reaper`/`Evasive System` instead).
`Field Analysis` is rare, not the ~50 accidental reps of the 7/30 trial.

**⚠️ AMENDED 2026-08-02 — "contested windows run rank-producing actions only" had no exit.** Two
defects, both consequences of the under-detection this decision accepts as safe. Live duty data
showed the free branch had been entered **zero times in 2h47m of uptime** — so "under-detected" is in
practice "never detected", and anything reachable only from the free branch is dead code.

1. **The contested branch could stall permanently.** `buildCandidates` filters on
   `getActionCountRemaining < 1`; when contract/operation inventory runs dry it returns empty,
   `pickRankAction` returns `null`, and the contested branch fell back to a hardcoded
   `Hyperbolic Regeneration Chamber` — which pays no rank **and cannot regenerate inventory**. No
   path back. `Incite Violence` was added on 2026-08-01 for exactly this, but only inside
   `pickOverheadAction`, i.e. only in the branch never entered. **Fix:** both cases now route
   through `pickOverheadAction`, so the ladder that regenerates inventory (and suppresses chaos, and
   grows the team) is reachable from a contested window too. Not observed stalling — the guard is
   for a multi-day unattended run, which is what checkpoint B is.
2. **A stall would have reported as 100% productive duty.** The per-tick `kind` was tagged from the
   *window*, so contested-fallback HRC counted as `rankSec`. `heldSec` (the rate denominator) was
   never wrong — decision 8 deliberately includes overhead — but the split that exists to make that
   overhead *visible* was. **Fix:** `kind` now follows the **chosen action** (rank-paying vs
   zero-rank General), so `overheadSec` means what decision 8's diagnostic order-of-inspection
   ("duty cycle" first, on a checkpoint miss) needs it to mean.
3. **🔴 The engine idled while billing the time as rank-earning — the largest of the five.**
   `startAction` auto-repeats, so the loop restarted an action only when *its own chosen action*
   changed, on the reasoning that "there is no completion boundary this loop needs to detect." **The
   game can cancel a running action**: the in-game log shows `Your Bladeburner action was cancelled
   because your stamina hit 0` twice in one hour, and `getCurrentAction()` probed **`null`** while
   `bladeburner-state.json` claimed `holdActive: true, dutyCycle: 1`. Intent hadn't changed, so the
   guard stayed shut and the engine never restarted. **Fix:** ask the game. Deliberately an
   `idle`/`null` check rather than an equality test against the live action — `getCurrentAction()`
   returns plain strings whose `type` values are undocumented (reference gotcha 10), so a
   never-matching comparison would call `startAction` every tick, reset action progress, and complete
   nothing: strictly worse than the bug. `null`-when-idle *is* documented and was confirmed live.
   **+1 GB (69 → 70), the cataloged cost of `getCurrentAction()`.**
4. **🔴 No stamina guard existed.** Live panel: **`Stamina Penalty: 89.5%`** at 5.2% stamina,
   against `0.0%` at full on 7/31, with `Investigation failed! Lost 0.343 rank.` repeating and a
   **negative** cumulative rate (−0.00958 rank/held-sec). The 2026-08-01 instrumentation comment
   called stamina *"visibility only … no action reacts to this yet"*, justified because the one prior
   data point came from the stamina-full 7/30 trial — a justification that a continuous run
   invalidates. **Fix:** `updateStaminaRecovering`, a hysteresis latch (trip < `STAMINA_FLOOR_FRACTION`
   0.5, release ≥ `STAMINA_RESUME_FRACTION` 0.8) that suppresses rank actions and routes to HRC. Two
   thresholds, not one: a single threshold resumes firing at exactly the level that just failed.
   Whether the *other* General actions are stamina-free (and so could do useful work during recovery)
   is unmeasured and logged in `BACKLOG.md`, not assumed.

### 7. Failure cost is priced, not hand-waved *(review S2)*

`pickRankAction` must not rank on expected rank alone — the 7/30 trial's Raid grinding was
**2 successes / 22 failures**, and hospitalization cost **$229.5m** against a node where money binds
the aug ratchet.

- **EV includes rank loss** (already in `expectedRankPerSec`).
- **Hard HP guard:** below `HP_FLOOR_FRACTION = 0.5` of max, the engine runs
  `Hyperbolic Regeneration Chamber` instead of any HP-risking action, in **either** window type.
  (`Investigation` is the only action documented to cost no HP on failure and is exempt.)
- **Money discount:** candidates are ranked on
  `expectedRankPerSec − (1 − pMin) × HOSPITALIZATION_COST_ESTIMATE / actionSeconds / RANK_MONEY_EXCHANGE`,
  with `HOSPITALIZATION_COST_ESTIMATE` seeded at **$10.4m** (the measured $229.5m ÷ 22) and refreshed
  live from the panel-equivalent API values. `RANK_MONEY_EXCHANGE` is a declared, logged constant so
  the trade-off is visible and tunable rather than implicit.

### 8. One denominator for "realized rate", and ETA reported two ways *(blocker B5)*

The bars are wall-clock; the naive measurement was per-held-second; those differ by `1/dutyCycle`.

**Definitions, fixed here:**
- `heldSec` — **all** engine-held slot seconds, including zero-rank overhead. (Excluding overhead
  would flatter the rate by exactly the amount features D10 says is material.)
- `rankPerHeldSec = rankGained / heldSec` — *efficiency*.
- `rankPerWallSec = rankGained / engineUptimeSec` — *actual throughput*.
- `etaCurrentDuty = (400000 − rank) / rankPerWallSec` — what the current co-existing deployment
  achieves.
- `etaFullDuty = (400000 − rank) / rankPerHeldSec` — what a **dedicated** deployment would achieve.

**Checkpoint bars apply to `etaFullDuty`**, because the phase's question is *"is the mechanic
viable"*, not *"is it viable while also running the ratchet at 75% priority."* Both numbers are
logged; the 7/30 baseline (0.0144) is restated as `rankPerHeldSec`, which is what it actually was
(the trial held the slot continuously).

**⚠️ AMENDED 2026-08-02 — the implementation measured a ring buffer, not the run.** The definitions
above are unchanged and were never wrong; the code implementing them was. Found by reading live state
during a routine game-state check, ~27h after the engine first started:

- `bladeburnermanager.js` trimmed its per-tick sample array to a fixed **10,000 entries**, while
  every window here is expressed in **wall time**. `nextUpdate()` resolves ~1×/sec, so the buffer
  held **~2h47m** — making `"24h"` and `cumulative` both silently mean *"the last 2h47m"*.
- **Worse, `uptimeMs` (the checkpoint trigger) was summed from that same buffer**, so it could never
  exceed ~2h47m against checkpoint A's 24h or B's 1 week. **Both checkpoints were structurally
  unreachable and would have stayed `null` forever** — the phase's entire deliverable, unobtainable
  by construction. It had been running 27h and reported `checkpointA: null`, correctly per the code
  and uselessly per the spec.
- The reported rate was wrong in the *pessimistic* direction, which is the dangerous one here given
  decision 9's "default if never revisited: non-viable": it read **0.00508 rank/held-sec** against
  **0.0185** computed from absolute rank endpoints (106.3 on 7/30 → 1217.8 on 8/02 over 16.7h held).
  That is the difference between "8.5× under the bar, abandon" and "2.3× under the bar, and better
  than the 7/30 baseline it was supposed to beat."

**Fix:** `cumulative` and the checkpoint uptime now come from a `totals` accumulator that is never
pruned and is **persisted into `bladeburner-state.json` and re-seeded on startup** (`seedTotals`).
Persistence is load-bearing, not a nicety — augfarmer's installs killed and relaunched this engine
**6 times in its first 27h**, so an in-memory-only total would reset well inside a 24h window, let
alone a 1-week one. `RATE_WINDOWS_MS` no longer contains an infinite window at all (a ring-buffered
array cannot express one), and sample pruning is now by **timestamp** against the widest finite
window, with a count cap kept only as a runaway backstop.

### 9. D8's stopping condition, re-derived *(blocker B6)*

- 400,000 rank ÷ 3 weeks (1.814×10⁶ s) ⇒ **0.2205 rank/held-sec**
- 400,000 rank ÷ 1 month (2.592×10⁶ s) ⇒ **0.1543 rank/held-sec**
- 7/30 baseline: **0.0144 rank/held-sec**

| Checkpoint | When | Bar | On a miss |
|---|---|---|---|
| **A — smoke test, NOT a viability test** | ~24h uptime | `rankPerHeldSec` ≥ **0.043** (3× baseline) | Stop and diagnose before burning a week. ⚠️ At 24h the engine has ~1,200 rank ⇒ ~400 SP, nowhere near `Overclock` 90, so this **cannot** measure viability. Inspect, in order: duty cycle, success rate, SP spend rate, hospitalization rate. |
| **B — the viability bar** | ~1 week | `etaFullDuty` ≤ **1 month** (i.e. `rankPerHeldSec` ≥ 0.1543) | **Declare Bladeburner non-viable** for BN6 *and* the counter-map's back half; re-derive `docs/bitnodes.md`'s node order without it. |

The first draft's second clause ("a fitted trend crossing 0.2205 before rank 20,000") is **deleted**
— no estimator, window, or fit criterion was specified, so two reviewers would compute different
answers to a question that retires a four-node strategy. **Default if never revisited: non-viable.**
Checkpoint B is a close-out deliverable, not a merge blocker (precedent: Phase 35's V3).

### 10. Ship in two slices; Slice A validates before Slice B is written

WI1 touches the most safety-critical script in the repo for an experiment's benefit. **Slice A =
WI1. Slice B = WI2–WI4.** A failure in Slice A's live validation stops the phase with no engine code
written.

---

## Design

### Work item 1 — `augfarmer.js` cooperative slot hold [code] *(Slice A)*

**New exported pure function:**

```js
export function resolveSlotHold(raw, nowMs,
                                maxAgeMs = SLOT_HOLD_MAX_AGE_MS,
                                futureToleranceMs = SLOT_HOLD_FUTURE_TOLERANCE_MS)
// -> { holdActive: boolean, holdReason: string, holderName: string|null, holdAgeMs: number|null }
```
Per decision 5's table; fails open on every malformed input.

**`planPass` gains one destructured parameter**, `slotHold`, defaulting to `{ holdActive: false }`
so every existing call site and fixture is unaffected:

- **Fallthrough site (`:1873`)** — when `holdActive`, do **not** push the `work` action; return the
  phase the pass would otherwise have produced (decision 1). ⚠️ **The `yield` action is still
  emitted when the slot is genuinely unavailable** (`slotAvailable().available === false`); a hold
  and a foreign work type are independent conditions and both are reported.
- **`target.fundBlocked` branch (`:1829-1840`)** — same suppression. ⚠️ **Corrected (review S4):** the
  first draft called this "the rep-met/grind site". It is the **fundBlocked** branch. The actual
  rep-met branch (`:1846-1854`) emits no work action and needs no change.
- Everything else — `join`, `travel`, `buy`, `donate`, reserves, install sequencing — untouched.
  **The hold is advisory for rep grinding only.**

**Main loop:** read `SLOT_HOLD_FILE` via `ns.read` (0 GB) each pass; resolve; pass into `planPass`.
**Do not modify the rate-sampling block** (decision 2). Write
`slotHold: { holdActive, holderName, holdAgeMs, holdReason }` into `augfarmer-state.json`, and
**add `slotHoldChanged` to the write gate at `:2973`** — the exact precedent of
`awaitingMoneySinceChanged` and Phase 36's `triggerArmChanged`, both added because a 5-minute
heartbeat is too slow for a field a consumer depends on (blocker B8). Log transition-only lines on
acquire/release (the `"yielded"` precedent at `:2948-2953`), never per-poll.

### Work item 2 — `bladeburnermanager.js` [code] *(Slice B)*

Headless resident, `gangmanager.js` mould.

- **Gating:** exits immediately when `inBladeburner()` is false (supervisor-filtered, WI4).
- **Off-marker (`bladeburner-off.txt`) — blocker B9:** **idles in-loop**, matching
  `cloudmanager.js:195-202` / `gangmanager.js:525`; it does **not** exit, because the supervisor is
  gated only on `inBladeburner()` and an exiting script would be relaunched every
  `SUPERVISOR_RETRY_MS` forever — the 110-attempt / 9.1h flood WI4 exists to prevent. The off path
  **stops the Bladeburner action, deletes the hold marker**, and writes state with `off: true`.
- **`ns.atExit`** → `stopBladeburnerAction()` + delete the marker. ⚠️ **Corrected (review S1):** the
  first draft called this "the phase's second safety-critical requirement" and justified it by
  claiming an orphaned action "keeps stealing the slot with nothing alive to re-assert." **That was
  wrong** — augfarmer reads a running Bladeburner action as `slotAvailable(null,…) → available:true`
  (`:711-712`) and re-grabs within one poll, killing the orphan in ≤10s. `atExit` is **hygiene**
  (avoids thrash, keeps the measurement clean), and is unreliable on kill-all/install paths anyway;
  **decision 5's staleness guard is the real backstop.**

**Exported pure functions (the testable surface):**

| Function | Responsibility |
|---|---|
| `expectedRankPerSec(action)` | `(pMin·rankGain − (1−pMin)·rankLoss) / (timeMs/1000)` |
| `pickRankAction(candidates, opts)` | decision 7 — EV **minus** priced failure cost, with the HP guard |
| `planSkillBuy(skillLevels, points, costs, policy)` | `Overclock` → `Blade's Intuition` → `Digital Observer`/`Tracer` → `Reaper`/`Evasive System`; **never** `Hands of Midas`/`Hyperdrive`/`Cyber's Edge`/`Datamancer` |
| `shouldRotateCity(chaosByCity, cityName, threshold)` | rotation decision |
| `classifyWindow(augState, nowMs)` | decision 6, incl. staleness and conservative default |
| `higherPriorityClaimant(processList)` | decision 3 |
| `computeRealizedRates(samples, windows, nowMs)` | decision 8's four numbers *(blocker B7)* |
| `computeDutyCycle(samples, windows)` | rank-producing vs overhead vs unheld |
| `computeRepForegone(contestedHeldSec, repRatePerSec)` | the experiment's price |
| `projectRankEta(rankNow, target, ratePerSec)` | checkpoint arithmetic |

⚠️ The **SP cost curve is unpublished** (only point values via `getSkillUpgradeCost`), so
`planSkillBuy` takes live costs as an argument and applies a marginal rule rather than assuming a
closed form. The engine logs the full cost vector on every buy so the curve is recoverable.

**Loop:** `await ns.bladeburner.nextUpdate()` (0 GB) as the tick; marker refreshed every
`BB_POLL_MS` **independent of action progress** (decision 4); completion detected via
`getActionCurrentTime()` **wrapping**, never by waiting for `getCurrentAction()` to go `null`
(reference §6/§7 gotcha 13 — `startAction` auto-repeats).

### Work item 3 — instrumentation [code] *(Slice B)*

`bladeburner-state.json` (overwrite-in-place) + `bladeburner-log.json` (ring-capped), **plus
`vite.config.ts` filter entries for both** (⚠️ a missing entry silently strands output — the 7/30
finding).

Carries: `rankPerHeldSec` / `rankPerWallSec` / `etaCurrentDuty` / `etaFullDuty` over rolling
1h/24h/cumulative windows; per-city chaos series and rotation events; skill levels with the live
cost vector at each buy; duty cycle (rank vs overhead vs unheld); `repForegone`; hospitalization
count/cost deltas; `heldFraction` (decision 2's audit trail); and both checkpoint bars.

### Work item 4 — supervisor gating [code] *(Slice B)*

- `bladeburnermanager.js` added to `RESIDENT_COMPANIONS`, plus a startup `launchDetached` alongside
  the gang precedent (`daemon.js:739-747`) so it doesn't wait up to 60s for the first supervisor
  check *(review S6)*.
- **`BLADEBURNER_GATED_COMPANIONS`** mirroring `GANG_GATED_COMPANIONS` (`:158`).
- **`supervisedResidents` gains a third parameter** — `supervisedResidents(residents, hasGang,
  hasBladeburner = true)` — defaulting to `true` so the existing two-arg call sites and tests are
  behaviour-identical *(review S6, and the "no behavioural supersession" rule)*.
- ⚠️ **`inBladeburner()` is wrapped in try/catch** at the daemon call site *(review S7)*:
  `bladeburner-reference.md` gotcha 11 claims the whole API throws pre-join *including 0 GB
  methods*, while §6 records `inBladeburner()` returning `false` live pre-join. The reference
  contradicts itself and the supervisor loop is not where that should be discovered. Throw ⇒ treat
  as `false`.

---

## Tests [code]

**`test/augfarmer.test.js` (Slice A):**

- `resolveSlotHold`: one case per decision-5 row — absent, empty, unparseable, missing `ts`,
  non-numeric `ts`, exactly at `maxAgeMs`, one ms past, future beyond tolerance, future within
  tolerance, fresh-and-valid.
- **T-SAFE (the phase's safety test):** a marker `maxAgeMs + 1` old ⇒ `holdActive: false`. This
  assertion stands between a crashed engine and a stalled win path.
- `planPass` with `holdActive: true`: emits **no** `work` action, and **`phase` is asserted equal to
  the same fixture run with the hold absent** — equality against the no-hold run, never a hard-coded
  string, so the test cannot drift into blessing a phase change. ⚠️ **Fixtures must include** the
  donation-eligible/money-blocked path (`:1860-1871`, `awaiting-money` falling through to the slot
  logic) and a non-null `currentWork` case (the `yielded` branch, `:1874-1876`) *(review minor)*.
- `planPass` with a hold still emits `join`/`travel`/`buy`/`donate` and an identical `reserve`.
- `planPass` called **without** `slotHold` behaves exactly as before (default-parameter test).

**`test/bladeburnermanager.test.js` (Slice B, new):** `expectedRankPerSec` sign handling;
`pickRankAction` — prefers lower failure cost at equal EV, **and** respects the HP guard;
`planSkillBuy` — priority order, affordability, never buys the four excluded skills;
`classifyWindow` — a case per phase string **plus** stale, missing, and unparseable state, all
defaulting to `contested`; `higherPriorityClaimant` — each of the three scripts and the empty case;
`computeRealizedRates` / `computeDutyCycle` / `computeRepForegone` — including zero-held and
zero-uptime edge cases; `shouldRotateCity`; `projectRankEta` with zero/negative rate.

**`npm run verify:log` *(blocker B7)*:** add a `test/verify-bladeburner.test.js` asserting
`bladeburner-state.json` exists once the engine has run, carries the decision-8 fields, and that
`rankPerHeldSec`/`rankPerWallSec` are finite and non-negative. Without it T2 passes identically
whether the file holds correct numbers, wrong numbers, or does not exist.

## Live procedure [live]

**Slice A:** **L1** deploy WI1 with no engine and no marker — augfarmer behaves identically
(`slotHold.holdActive: false`, rep grinding continues, install trigger unaffected). **L2** hand-write
`bladeburner-slot-hold.json` per the marker contract with a fresh `ts`; confirm rep work stops,
`slotHold` populates **promptly** (the write-gate term), `phase` unchanged, `ramcheck.js` flat.
**L3** stop refreshing it; confirm rep work **auto-resumes within ~30s**, no operator action —
decision 5 proven live, not just in vitest.

**Slice B:** **L4** engine up; confirm slice acquire/release, augfarmer resumes between slices,
`repForegone` accrues, **and decision 3 holds — run `backdoorfactions.js` concurrently and confirm
the engine stands down** *(blocker B4)*. **L5** kill `bladeburnermanager.js` mid-action; confirm
`atExit` cleanup and augfarmer recovery. **L6** 24h → checkpoint A. **L7** ~1 week → checkpoint B
(close-out). ⚠️ **L4 also measures `switchCity`'s cost/interruption** (open question 1).

## Acceptance criteria

Test-gated (Claude clears): **T1** `npm test` green including T-SAFE, no existing fixture's expected
value changed. **T2** `npm run verify:log` green **including the new `verify-bladeburner` checks**.

RAM-gated [live]: **R1** `augfarmer.js` unchanged vs baseline. **R2** `daemon.js` re-measured, delta
explained.

Live-gated [live]: **V1** = L1+L2 (hold works, phase unchanged, `slotHold` prompt). **V2** = L3
(**staleness auto-recovery** — the safety criterion). **V3** = L4 (slices + **claimant stand-down**).
**V4** = L6 checkpoint A. **V5** = L7 checkpoint B — close-out deliverable carrying decision 9's
non-viable default.

**Ship gate:** T1/T2 self-cleared; **Slice A merges on R1+V1+V2**; **Slice B is not written until
Slice A is live-green** (decision 10).

## Files touched

- `src/augfarmer.js` — `resolveSlotHold`, `SLOT_HOLD_FILE`, `SLOT_HOLD_MAX_AGE_MS`,
  `SLOT_HOLD_FUTURE_TOLERANCE_MS`, `planPass` parameter + two suppression sites, `slotHold` state
  field, `slotHoldChanged` write-gate term, transition logging. **Rate-sampling block untouched.**
- `src/bladeburnermanager.js` (new); `bladeburner-off.txt` convention
- `src/daemon.js` — `RESIDENT_COMPANIONS`, `BLADEBURNER_GATED_COMPANIONS`, `supervisedResidents`
  third param, guarded `inBladeburner()`, startup launch
- `vite.config.ts` — filters for `bladeburner-state.json`, `bladeburner-log.json`
- `test/augfarmer.test.js`, `test/bladeburnermanager.test.js` (new),
  `test/verify-bladeburner.test.js` (new)
- `BACKLOG.md` / `docs/phases/CHANGELOG.md` / phase-doc graduation at ship;
  `docs/bladeburner-reference.md` gains newly measured mechanics (SP cost curve, `switchCity` cost)

## Open questions (log, don't block)

1. **`switchCity` cost/interruption unmeasured** (reference §8). `shouldRotateCity` is built in
   Slice B before the measurement lands at L4; if it interrupts the running action, rotation cadence
   needs rework. Logged risk, accepted.
2. **Should the engine ever refuse to release a slice** when augfarmer's deficit is urgent? Spec says
   no — augfarmer always wins on re-assert. Revisit if holds are observed to delay an install.
3. **✅ RESOLVED 2026-08-01 — dashboard panel built.** The brainstorm this item asked for happened
   (Kenneth: "what can we add to the dashboard for bladeburner stuff?"); `dashboard.js` gained a
   `BLADEBURNER` panel: one content line reading `<mode> | rank <N> <rate>/hs (cum) | 24h:<verdict>
   7d:<verdict>`, where mode is `OFF` / `STOOD DOWN (<claimant>)` / `held` and each checkpoint reads
   `--`/`PASS`/`FAIL`. Deliberately minimal (not the full hold/duty/hospitalizations/repForegone
   picture) — the window was already at its measured screen-height ceiling (1392px live-confirmed,
   unchanged since 2026-07-23), so this cost required trimming `TRANSACTIONS`'s entry cap 3→2
   (`TRANSACTIONS_ENTRY_CAP` in `dashboard.js`) to fit `ROW_BUDGET` 61→63 / `DASHBOARD_H` 1328→1372
   without exceeding it (net +2 rows, landing ~1px from the ceiling — see `dashboard.js`'s own
   `DASHBOARD_H` comment). Duty cycle / hospitalizations / rep-foregone stay log/state-file-only, per
   the "use dashboard or logs" convention. 6 new tests in `test/dashboard.test.js`, 1126 total pass;
   live RAM re-confirmed unchanged at 2.6 GB (`ramcheck.js dashboard.js`); live-rendered and
   screenshotted via CDP the same session.
4. **Bonus time** (`getBonusTime`, 5× spend) unmodelled; with sleep disabled it may never accrue.
5. **`repForegone` uses augfarmer's observed rep/sec**, which is itself depressed while held
   (decision 2). It is therefore a slight **under**-estimate of the true price. Noted so it isn't
   mistaken for exact.
6. **`augfarmer-state.json`'s dead `plan.phase !== previousPhase` write-gate term** (BACKLOG) is why
   free windows are under-detected (decision 6). Fixing it is out of scope here but would directly
   improve this engine's throughput — worth pairing with whatever phase finally addresses it.

---

## Close-out (2026-08-02) — SHIPPED, but superseded before it delivered its verdict

**Status: closed, not completed.** Every work item shipped and the engine runs unattended. The
phase's actual **deliverable was a decision** — *"is the counter-map's back-half Bladeburner premise
real?"* — and **that deliverable was never produced.** Neither checkpoint fired. Closing it now
rather than leaving it stranded (the Phase 36 pattern this repo has already been bitten by once).

### What shipped

| WI | Status |
|---|---|
| WI1 — `augfarmer.js` cooperative slot hold (Slice A) | ✅ shipped, live-green |
| WI2 — `src/bladeburnermanager.js` (Slice B) | ✅ shipped |
| WI3 — instrumentation (`bladeburner-state.json`/`-log.json`) | ✅ shipped, ⚠️ **partly untrustworthy** — see below |
| WI4 — supervisor gating in `daemon.js` | ✅ shipped |
| Dashboard `BLADEBURNER` panel | ✅ shipped 2026-08-01 (open question 3) |
| T1 `npm test` / T2 `verify:log` | ✅ green (1,188 tests at close) |
| V1/V2/V3 (hold, staleness recovery, stand-down) | ✅ live-validated |
| **V4 — checkpoint A (24h)** | ❌ **never fired** |
| **V5 — checkpoint B (1 week) — the close-out deliverable** | ❌ **never fired** |

### Why the checkpoints never fired, and why that is the phase's real lesson

Three compounding causes, all found on 2026-08-02 by reading the live game rather than the logs:

1. **The engine spent its first days stood down.** Decision 3's unconditional stand-down for
   `backdoorwd.js`/`backdoorfactions.js`/`studybootstrap.js` meant that as of 2026-08-01 it had
   **zero data** — working as designed, but it consumed the measurement window.
2. **The measurements it did produce were invalid.** Five defects (fixed in `2404474`) plus three
   more found later: the stamina floor was not enforced (`floor: 0.5` in state while the game logged
   `stamina hit 0` three times an hour); the hospitalization discount was charged **per failure**
   rather than per hospitalization (a ~9× overcharge that scored `Tracking` at −0.0316 against
   `Investigation`'s +0.0016, so the engine ground the **4× worse** action for hours); and the HP
   floor was a **trap** rather than a guard — below it the pool filtered to `Investigation`, which
   can never restore HP, so nothing could climb back out.
3. **⚠️ The telemetry reported success while doing nothing.** `rates.*.rankGained: 0` and
   `duty.*.dutyCycle: 1` were emitted while live rank visibly moved. **A checkpoint computed from
   those fields would have rendered a confident verdict on the mechanic that was really a verdict on
   the bug** — the exact failure mode decision 9 existed to prevent.

🔑 **Generalised lesson, and it is the durable output of this phase:** *an engine that measures
itself must be validated against an independent source before its numbers are trusted.* Every defect
above was invisible in `bladeburner-state.json` and obvious in the in-game Bladeburner panel. The
phase built careful checkpoint machinery on top of an instrument nobody had calibrated.

### Superseded by

**Phase 39** (`phase-39-bladeburner-primary.features.md`), after Kenneth flipped BN6 to
Bladeburner-primary on 2026-08-02. Phase 39 supersedes this phase's **architecture** — an
opportunistic slack-time grinder that stands down for everything is the inverse of what a primary
win path needs — while reusing its telemetry plumbing. Phase 38's D9 rebuild requirement is carried
forward as Phase 39 D9.

### Open items carried forward (nothing is dropped here)

| Item | Carried to |
|---|---|
| `switchCity` cost/interruption unmeasured (open question 1) | Phase 39 **Q5** — now load-bearing, since city rotation is the population-sustainability lever (D11) |
| Telemetry rebuild — wall-clock rates, real duty cycle, EV predicted vs realised | Phase 39 **D9** |
| Stand-down policy inversion under primary | Phase 39 **D1** |
| Should the engine refuse to release a slice (open question 2) | Still open; unchanged default (augfarmer always wins) |
| **NEW — four-way player-action-slot contention** | `docs/bladeburner-reference.md` §8 + `CLAUDE.md`. `bladeburnermanager.js`, `augfarmer.js`, `backdoorfactions.js`, `backdoorwd.js` all claim the single slot; each produced an identical "zero drain" symptom from a different cause, and defeated four attempts at one measurement. |
| **NEW — `startAction` returning `true` does not mean the action runs** | `docs/bladeburner-reference.md` §7/§8. Confirmed live: `true` returned while `getCurrentAction()` read `null` across 60 samples. |
| **NEW — stamina per action vs per second** | Phase 39 **Q10**, unresolved after four attempts |
| **NEW — HP cost per failed operation** | Phase 39 **Q11**, gates any tier switch to Raid |

### Final live state at close

Rank **1,445** (from 0 at join on 2026-07-30). Sustained **~0.0063 rank/wall-s** over a 9.5h clean
window — ⚠️ **below** even Phase 39's corrected C1 bar of 0.007, and far below this phase's
checkpoint A bar of 0.043 rank/held-sec. **On the numbers Phase 38 was built to produce, the answer
it would have given is "not viable" — but that verdict is NOT recorded as this phase's finding**,
because the engine that produced it was mis-tuned in three separate ways and the objective function
it optimised (rank/second) is itself now in question (Phase 39 D3-OPEN). **Re-measure under Phase 39
before treating any rate from this phase as evidence.**
