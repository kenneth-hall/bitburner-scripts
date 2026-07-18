# Phase 26 spec: ratchet autonomy — A2 (install the queue) + B2 (stall-age) + B1 (supervision)

## Context

Work in `C:\Users\admin\bitburner-scripts`. Requirements:
`phase-26-ratchet-autonomy.features.md` — read it first; this spec assumes it, including the
thesis (six-then-seven instances of one confusion: code naming a faction/aug without knowing
which question it answers), the current-game-state table (BN1.3, install #9, 29/30 distinct
augs, 10 queued, `endgameHold: true`, totalGain 1.020), decisions **D1–D12 (settled, not
relitigated here)**, and A1's shipped runaway write-up. **A1 shipped (`5ad32a3`) and is not
modified here.** Scope per the features handoff: **A2 + B2 + B1**. B3 and B4 stay out (their
wake-up conditions are in the features file); the scope-creep list is honored.

What ships:

- **A2 — gate-release arming.** `evalTrigger` gains a third arming reason: when an install
  would convert A1's queued gate-buys into an installed count that closes a faction's
  aug-count gate, the trigger may arm *despite* `endgameHold` and *despite* `MIN_TOTAL_GAIN`.
  This is the missing link between "the queue holds the key" and "the door opens" — and, with
  every other endgame step already proven live, the last unproven link in a fully unattended
  BN1 clear.
- **B2 — stall-age detection.** In auto mode, augfarmer self-reports "hours since
  `lastAugReset` far exceed the observed cycle time and no install has happened" — a decision
  record + terminal WARN + state-file block. Progress-watching, not process-watching: it would
  have caught gaps 7 and 9 without knowing either existed.
- **B1 — companion supervision + `HOME_RESERVE_GB` bump.** daemon.js's main loop checks the
  resident companions every 60s via the `ns.ps("home")` surface it already carries, and
  relaunches any that died (with backoff). `HOME_RESERVE_GB` goes 32 → 80 so a relaunched
  `augfarmer.js` (64.1 GB) actually fits — the features' "supervisor + bump together, or
  neither."

**Prominent flag — the ten-minute fuse.** The moment A2's code is live in the *running*
augfarmer (i.e. after the merge **and** a deliberate restart — a push alone doesn't touch the
running process), the live deadlock state arms the trigger, and ~10 minutes of sustain later
install #10 fires. From there the endgame chain — hacking re-climb, $100b re-earn, Daedalus
invite + join, auto-donation, Red Pill, `backdoorwd.js` — runs unattended to the end of
BN1.3. Every link of that chain is individually proven live (2026-07-15/17); A2's install is
the only unproven one. This is intended (D11: let the engine close the gate), but the restart
is the arming action and is a deliberate [live]-gated step, not a side effect of merging.

**Audience note:** the implementer does everything marked **[code]**. Kenneth does everything
marked **[live]** — except daemon/companion restarts and story-popup dismissal, which
CLAUDE.md pre-authorizes Claude to do over CDP. No [live] step requires editing code.

## Ground rules

- `CLAUDE.md` rules apply. **No new `ns` surface anywhere in this phase.** A2 is pure logic
  plus main-loop wiring over reads augfarmer already does. B2 adds one `ns.read` of
  `ratchet-log.json` (0 GB; `ns.read` is already in augfarmer's cost set via the mode file).
  B1 uses `ns.ps("home")` and `ns.exec` — both already charged in daemon.js (`launchDetached`,
  the in-flight sweeps). Consequently the RAM gate is **flat**: `augfarmer.js` stays at its
  measured **64.10 GB**, `daemon.js` at **16.3 GB**. Any movement ⇒ stop and check the
  identifier-hygiene class first (the `state.share` lesson), not "cost of the feature."
- **Identifier hygiene, pre-checked for planned names:** `gateRelease`, `gateArmed`,
  `closedByQueue`, `augCountInstalled`, `augCountOwned`, `evalStall`, `stallState`,
  `STALL_CYCLE_FACTOR`, `STALL_MIN_MS`, `STALL_MAX_MS`, `STALL_FALLBACK_MS`,
  `STALL_REWARN_MS`, `planRelaunches`, `RESIDENT_COMPANIONS`, `SUPERVISOR_CHECK_MS`,
  `SUPERVISOR_RETRY_MS` — none collides with an `ns.*` method/property reachable from any
  namespace. The implementer re-runs this check on any name added during implementation, and
  keeps state-file/JSON field access to these names or bracket notation.
- **Transactions log:** unchanged — this phase adds **no new spend paths**. A2's spend-down
  and installer records ride the existing Phase 25 machinery; B1 relaunches and B2 warnings
  are not spends.
- **Singularity isolation:** unchanged. daemon.js gains zero Singularity calls (B1 relaunches
  by filename via the existing `launchDetached`). `installAugmentations` remains only in
  `installer.js` — A2 changes *when the trigger arms*, never who installs.
- **Observability: logs only, no dashboard edits.** New signals go to `ratchet-decisions.json`
  (augfarmer) and the daemon's existing log ring + `tprintTs` (daemon). The Phase 24 gate
  stands: the brainstorm left B2's surface as "dashboard or log" without deciding a panel, so
  a dashboard line is **not** in scope — but B2's state-file block means adding one later is a
  rendering-only change behind its own brainstorm decision. `dashboard.js` untouched
  (`augPanel` renders `phase` opaquely, so no new phase values break it — Phase 25 verified).
- **No new exported log files** — no `vite.config.ts` change. `stall-warning` records ride the
  already-exported decisions file; `companion-relaunch` events ride the already-exported
  daemon log.
- Branches per S7 (two, sequenced). `npm test` the implementer runs and clears; RAM readings
  and live observation are Kenneth's (restarts are Claude-over-CDP). BACKLOG/CHANGELOG edits
  ride the same branch as the change they describe. Before each merge back, run the CLAUDE.md
  worktree checks (`git log HEAD..master`).

## Spec-stage decisions

- **S1 — A2's mechanism: a third arming reason inside `evalTrigger`, NOT a release of
  `endgameHold`.** The features file left three candidates open; this resolves it.
  - **Rejected: "give `endgameHold` the queued-inclusive count so the hold releases
    itself."** `endgameHold` gates more than arming: it excludes Daedalus from the donation
    route, switches on the Daedalus invite/donation reservations, and marks "stop ratcheting,
    go for Daedalus" generally. Releasing the flag to permit one install would silently
    reopen *all* of that — a bigger behavior change than the problem needs, and exactly the
    kind of implicit coupling this phase's thesis indicts. The hold stays true and means what
    it means; the *trigger* learns the one exception.
  - **Rejected: "manual once, spec properly after"** — per D11's own logic: the live deadlock
    is A2's only validation opportunity and the state is gone once we clear. An untested
    endgame-install path carried into the next node is the A1-runaway lesson ignored.
  - **Chosen shape:** `armed := (gainArmed && phaseArmed) || gateArmed`. `gateArmed` is
    deliberately *not* gated on `endgameHold` (the exception's whole point), *not* on
    `MIN_TOTAL_GAIN` (this install is justified by the unlock, not the mult gain — the live
    state's totalGain is 1.020 and is structurally unable to reach 1.10: the queue is
    zero-score gate-fillers and the NFG tail is rep-capped at ~2 levels), and *not* on the
    `grinding`/`idle-plateau` phase labels (gap 7 showed those labels lie at plateaus).
    Everything downstream is unchanged: `fired` still requires `TRIGGER_SUSTAIN_MS` of
    continuous arming, auto mode still latches, observe mode still only tprints
    `install-ready`, the pause/mode abort levers still work, and the spend-down →
    `installer.js` path runs exactly as proven on installs #6–#9.
- **S2 — The two counts are named, computed once, and passed explicitly** (the constraint
  open question 0 attached after the A1 runaway: "whichever number it uses must be named as a
  choice, not inherited by accident").
  - `augCountInstalled` — distinct installed augs (`ownedInstalled.length`, what the game's
    invite check reads). This is what `playerFacts.augCount` already carries; unchanged.
  - `augCountOwned` — distinct owned **including queued** (`ownedSet.size`, what
    `augCountInstalled` becomes the moment an install lands). This is what A1's gate-fill
    check already uses to stop buying.
  - The main loop computes a `gateRelease` input for `evalTrigger` in two explicit steps —
    **not** by comparing two `findAugCountGate` calls (cold review blocker 1: that function
    returns only the single shortest-gap faction, so "did the second call return null" and
    "did *this* faction's gate close" diverge whenever a different in-scope faction still has
    an open count gate on the owned count — e.g. the queue closes Daedalus's 30 but not some
    other faction's — and the live BN1.3 state can't tell the two implementations apart):
    1. `findAugCountGate(catalog, {…, augCount: augCountInstalled}, …)` — "does a count gate
       exist right now, and for whom?"
    2. For **that returned faction specifically**, re-run `evaluateInviteReqs(inviteReqs,
       {…, augCount: augCountOwned})` — `closedByQueue := reEval.joinable`. This is exact,
       not a proxy: step 1 established the count as the *only* unmet requirement against
       current facts, so swapping in the owned count flips `joinable` iff the count
       requirement itself closes. (Post-install the *character's* hacking/money reset and the
       faction may not invite immediately — expected; the invite arrives when the re-climb
       re-meets them, and the gate itself is permanently closed.)
    `gateRelease = {faction, gap, closedByQueue}`. `evalTrigger` stays pure; it receives the
    result, never the catalog.
  - `gateArmed := gateRelease?.closedByQueue && queuedCount >= 1 && !paused`. The
    `closedByQueue` clause is the anti-runaway symmetry the features demand: **an install that
    would not move the gate to closed can never arm** (A1 needed the queued count to stop
    buying; A2 needs the installed count to certify the install will actually change it).
    `queuedCount >= 1` is implied by a closable gap but asserted anyway —
    `installAugmentations` no-ops on an empty queue, so firing without one would be a silent
    dead end.
  - **Once-per-gate is structural, not a counter:** post-install the faction's count
    requirement reads met (or its other requirements — hacking 2500, $100b — read unmet on
    the reset character), so `onlyAugCountGap` is false either way and `gateArmed` cannot
    re-fire. Combined with the existing `queuedCount === 0` post-install state, no install
    loop is possible. A unit test locks this (S10).
  - Per D2's generality this is **not** Daedalus-scoped: The Covenant (20 augs) and
    Illuminati (30) are in `FACTION_SCOPE` and have the same shape. A gate-release install
    for those is a feature, not a hazard — same "only unmet requirement" safety, same
    structural once-per-gate bound. Open question 4 (deficit > 1 pricing) stays open with its
    wake-up condition; D4's one-per-pass bounds it meanwhile.
- **S3 — Spend-down under a gate-release fire is unchanged — including spending through the
  Daedalus reservations.** The install wipes money to ~$1k regardless
  (`docs/reset-protocol.md`; the install-resets-money lesson), so every dollar unspent at the
  fire — the $100b invite reserve included — is *destroyed*, not preserved. Converting all of
  it to NFG levels + home hardware is strictly correct; the $100b and hacking 2500 re-earn
  post-install (measured: minutes-to-hours at mults 8.4/12.4), at which point `endgameHold`
  re-engages and the reservation machinery resumes protecting the re-earned pile. Expected
  live shape for install #10: ~2 NFG levels (rep-bound at Chongqing, 1,357,600 vs an
  escalating ~1.14× requirement), zero discrete buys (all 10 already queued), home
  RAM/cores already maxed → a short spend-down, then `installer.js`.
- **S4 — B2 lives in augfarmer, as a pure evaluator + self-report.** Not in daemon: B2 is the
  *progress* watch and augfarmer owns every input (mode, `lastAugReset`, `installSeq`);
  daemon's B1 is the *process* watch and covers the one case self-reporting can't (augfarmer
  dead). Together they're the supervision story; neither pretends to be the other.
  - Pure `evalStall({nowMs, lastAugReset, mode, installSeqActive, paused, cycleIntervalsMs},
    priorStall)` → `{stalled, ageMs, thresholdMs, warnDue}`.
  - **Threshold: adaptive with clamps.** `thresholdMs = clamp(STALL_CYCLE_FACTOR (3) ×
    median(cycleIntervalsMs), STALL_MIN_MS (12h), STALL_MAX_MS (48h))`; fewer than 2 measured
    intervals ⇒ `STALL_FALLBACK_MS (24h)`. Rationale: observed cycles run 4–8h, so 3× median
    lands 12–24h — it would have caught the real 25h stall mid-morning instead of never — and
    the clamp + fallback keep a slow future node (BN4-class) from false-positives while the
    sample is thin. All four constants are provisional by design and ride into every
    `stall-warning` record, per the Phase 25 convention.
  - **Interval source:** the last ≤5 install-to-install deltas from `ratchet-log.json`
    (`ns.read` + parse — ratchetlog.js already persists exactly these boundaries and survives
    installs), **bounded to the current node** via `ns.getResetInfo().lastNodeReset` so a
    previous node's cadence can't leak in (implementer verifies the field name in `markdown/`
    before use — it's read from the `getResetInfo()` call augfarmer already makes; if this
    build lacks it, drop the bound and rely on the clamp + fallback, noting it in the header).
  - **Gating:** evaluates only when `mode === "auto"`, `!paused`, and `installSeq === null`
    (a running spend-down/install is the opposite of a stall; the pause file is a deliberate
    hold; observe mode never installs *by design*). Deliberately **not** suppressed by
    `endgameHold` — a stalled endgame is precisely the class gap 9 was, and post-A2 a healthy
    endgame hold resolves itself.
  - **Emission:** on the false→true crossing, one `stall-warning` decision record + one
    `tprintTs` WARN naming age, threshold, phase, and the trigger's current `reasons`; while
    stalled, re-warn every `STALL_REWARN_MS (6h)` (the `warnDue` output). The state file gains
    a `stall` block `{stalled, ageMs, thresholdMs, lastWarnMs}` every write — `lastWarnMs`
    included so the re-warn cadence survives a B1 relaunch (restored the same way the cycle
    caps are, keyed on `lastAugReset`; without it a mid-stall relaunch double-warns).
    Report-only: B2 takes no action, by D7.
- **S5 — B1 lives in daemon.js's main loop; supervises the resident set only.**
  - `RESIDENT_COMPANIONS = [targetsmonitor.js, transactionsmonitor.js, resourcemanager.js,
    cloudmanager.js, augfarmer.js, dashboard.js, xpfarm.js, ratchetlog.js]` — the always-on
    companions. The self-terminating ones (`procureprograms.js`, `procureformulas.js`,
    `studybootstrap.js`, `backdoorfactions.js`, `backdoorwd.js`) are **explicitly not
    supervised**: absence is their success state, and a supervisor can't tell "done" from
    "died early" without owning each script's completion predicate. A crash-before-done there
    heals at the next daemon restart — recorded as a limitation with its wake-up condition
    (open question iii).
  - Every `SUPERVISOR_CHECK_MS (60s)` (time-gated inside the existing `while (true)` tick,
    like the share-marker check), read `ns.ps("home")` once, diff filenames against the
    resident list, and relaunch each missing script via the existing `launchDetached` —
    subject to a per-script backoff of `SUPERVISOR_RETRY_MS (5 min)`, so a script that
    instantly re-crashes (a real bug) produces a bounded WARN cadence, not a relaunch storm.
    Each attempt: one `tprintTs` WARN (`SUPERVISOR: <script> not running -- relaunching`) and
    one `companion-relaunch` event in the daemon's existing log ring. (This `ns.ps("home")`
    read is a companion-name diff only — it never feeds the worker in-flight accounting, so
    daemon.js's documented two-sweeps-per-tick property at ~line 724 is untouched; the
    implementer keeps it that way.)
  - **Missing ≠ died: the can't-fit case is its own state, not a relaunch** (cold review
    blocker 2). A resident that is absent *and* doesn't fit on home (`fitsOnHome` false —
    normal for augfarmer's 64.1 GB across a fresh node's early hours) is in state
    `waiting-ram`: **no WARN, no `companion-relaunch` event, no attempt recorded** — one INFO
    line + one log event on *entering* the state, then silence until it either fits (normal
    relaunch proceeds, backoff clock fresh) or shows up. Without this, the supervisor would
    WARN every 5 minutes for hours in exactly the fresh-node window B1 exists to protect,
    and L4's "zero spurious" acceptance would be unverifiable there. "Spurious" in L4/L6 is
    defined against **fits-but-absent** only.
  - Pure planner for tests: `planRelaunches(runningNames, residents, unfitNames,
    lastAttemptMs, nowMs)` → `{launch: [...], waitingRam: [...]}` for this check, updating
    attempt times only for actual launch attempts. Lives in daemon.js as a plain-data export,
    mirroring the other pure exports; the caller derives `unfitNames` from the same
    `fitsOnHome` check `launchDetached` uses.
  - **Known accepted limitation:** a relaunched augfarmer loses in-memory trigger state
    (sustain clock, latch, `installSeq`); the state file restores the cycle-keyed caps
    (`nfgBoughtThisCycle`, `boughtThisCycle`) as already shipped. A death mid-spend-down
    therefore re-arms and re-fires ~10 min later *if the arming conditions still hold*; if a
    partial spend-down dropped `totalGain` below the floor they may not — and that residual
    stall is exactly what B2 reports. Recorded in the header, not fixed here.
  - **Non-goal, recorded:** nothing in-game supervises `daemon.js` itself — the root process
    can't self-supervise, and a watcher-of-the-watcher regresses infinitely. The outer net
    stays Kenneth's dashboard + the dev-server autoheal layer.
- **S6 — `HOME_RESERVE_GB` 32 → 80, shipped with S5 (together or neither).** 80 = augfarmer's
  measured 64.1 GB + headroom for a concurrent small-companion relaunch (dashboard ~2–4 GB,
  the monitors less). Costs, quantified: at the current 64 TB home the extra 48 GB held back
  is 0.075% — noise. The real cost window is a fresh node's first cycle (home resets small on
  node entry; installer maxes it at the first install): while home max RAM is between ~32 GB
  and a few hundred GB, the batcher loses up to 48 GB of home workers it would have had. In
  exactly that window augfarmer (64.1 GB) can't fit anyway, the fleet + xpfarm carry
  throughput, and the window closes at the first install — accepted. **Rejected: a dynamic
  reserve** (e.g. scale with home max RAM): `HOME_RESERVE_GB` is consumed at three sites
  (`hosts.js` ×2, `daemon.js`), its constancy is assumed by `bootstrap.js`'s handoff comment,
  and a conditional reserve is a second moving part in exactly the RAM accounting that
  produced Phase 13's phantom-RAM hunt. A constant that's trivially auditable wins.
  `bootstrap.js`'s 32 GB comment updates to match.
- **S7 — Deploy staging: two branches, merged in sequence, with the endgame between them.**
  - **Branch 1 `phase26-a2-b2`** — augfarmer.js + tests + its doc lines. Merged, pushed, and
    made live first (Claude restarts augfarmer over CDP as the deliberate arming action —
    see the fuse flag above). Its live validation *is* the BN1.3 endgame: install #10 fires
    from a gate-release arm, then the proven chain clears the node. B2 rides this branch
    because a report-only evaluator cannot disrupt the endgame, and its records document the
    run.
  - **Branch 2 `phase26-b1`** — daemon.js + hosts.js + bootstrap.js comment + tests + doc
    lines. Cut immediately but **merged only after install #10 has completed** (the clear
    needn't have finished — the risk window is the one-shot install sequence). Rationale is
    Kenneth's own 2026-07-15 precedent: never combine a first-ever-live-test (a supervisor
    that can kill/relaunch-storm, a reserve change in the RAM accounting) with a run-ending
    sequence. B1 then gets its live shakedown in calm post-clear/fresh-node state — which is
    exactly the state it exists to protect.
  - Working-tree discipline: viteburner pushes the *checked-out* tree on change, so branch 2
    is developed and held **unmerged** (or in the `bitburner-scripts2` worktree) while branch
    1's endgame runs — never checked out in the live checkout mid-endgame (the Phase 13
    lesson).
- **S8 — Records and reasons.** `evalTrigger`'s return gains `reasons.gateArmed` and echoes
  `gateRelease` (faction, gap, closedByQueue); trigger-arm/fire decision records therefore
  carry it with zero extra wiring. New decision kind: `stall-warning` (S4's fields + the four
  stall constants). New daemon log event: `companion-relaunch` `{script, attempt, sinceMs}`.
  No new files, no export changes.
  - **D9 lands here (deliberate scope addition, flagged):** the features doc settled "log the
    NFG tail's binding constraint on every spend-down" but the handoff scope didn't assign it
    an owner, and it doesn't exist in code — left unshipped it orphans, and its first
    `rep`-bound datum is B3's wake-up trigger. It's one derived field: `evalTrigger` already
    computes both bounds (the money projection and `nfgLevelsByRep`), so its return gains
    `nfgBoundBy: "money" | "rep" | "none"` (whichever cut `nfgLevelsProjected`; `"none"` when
    no tail projects), which then rides every trigger/spend-down decision record for free.
    One unit test per value.
- **S9 — RAM gates are flat by construction** (ground rule): augfarmer.js **64.10 GB**
  exactly, daemon.js **16.3 GB** exactly, verified via `ramcheck.js` against `dist/src/`'s
  byte record. Movement ⇒ identifier-hygiene audit before anything else.
- **S10 — Test plan (vitest, all pure-function level).**
  - `evalTrigger` gate-release: arms under `endgameHold` with `closedByQueue` true; does
    **not** arm when the gate exists but the queue doesn't close it (the A2-runaway-analog
    guard — installed-only gap open ⇒ no fire); does not arm at `queuedCount 0` or paused;
    ignores `MIN_TOTAL_GAIN` (fixture with totalGain 1.02 — the live state, used as a
    regression fixture verbatim); sustain still required (no instant fire); auto-latch and
    abort levers unchanged (existing tests re-asserted over a gateArmed-latched state);
    post-install fixture (gate reads met on installed count, queue empty) cannot re-arm.
  - `gateRelease` computation: the two-step evaluation — gate on installed + closed on owned
    ⇒ `closedByQueue: true`; gate on installed + still open on owned ⇒ false; no gate on
    installed ⇒ null. Fixtures reuse A1's catalog shapes, **plus the two-faction fixture the
    cold review demanded**: faction X's gate closed by the queue while faction Y (larger
    requirement) still has an open count gate on the owned count — `closedByQueue` must read
    true for X (the null-ness-of-a-second-`findAugCountGate` implementation reads false and
    must fail this test).
  - `evalStall`: below/above threshold; median + clamp arithmetic (thin samples ⇒ fallback;
    fast cycles clamp to `STALL_MIN_MS`; slow to `STALL_MAX_MS`); suppressed under observe
    mode / pause / active installSeq; re-warn cadence (`warnDue` true at crossing, false
    until `STALL_REWARN_MS` elapses, true again after); the gap-7 25h fixture (cycles ~4–8h,
    age 25h ⇒ stalled) and the gap-9 shape (endgameHold true, still reports).
  - `planRelaunches`: missing resident ⇒ relaunch; running ⇒ none; backoff (missing again
    within `SUPERVISOR_RETRY_MS` ⇒ not relaunched, after ⇒ relaunched); **missing + unfit ⇒
    `waitingRam`, no launch, no attempt-time update; unfit → fit transition ⇒ immediate
    launch (backoff must not have accumulated while waiting)**; self-terminating scripts
    never appear (list membership is the rail); multiple missing handled in one pass.
  - `hosts.test.js` — **updated as an intended change, not a regression** (cold review
    blocker 3): the `HOME_RESERVE_GB` `toBe(32)` assertion (line 136) becomes `toBe(80)`,
    and the `totalAllocatableRam` fixture (line 154) is reworked for the new constant —
    its `Math.max(0, …)` branch flips at 80, so the expected values are recomputed, and a
    new case locks the clamp behavior (home smaller than the reserve contributes 0, not
    negative).
  - Regression: full existing `augfarmer.test.js` + `daemon.test.js` suites stay green —
    in particular A1's gate-fill tests and the Phase 25 rail test (observe mode emits no
    spend-down/exec/install action) re-asserted unchanged.

## Design

### Work item 1 — `src/augfarmer.js`: A2 gate-release arming [code] (branch 1)

Header: update the trigger summary (armed gains the gate-release clause; endgame hold is no
longer absolute — state the exception and its guard in one sentence) and note B2's stall
block. Constants added: `STALL_CYCLE_FACTOR = 3`, `STALL_MIN_MS`, `STALL_MAX_MS`,
`STALL_FALLBACK_MS`, `STALL_REWARN_MS` (values per S4, exported, provisional).

Main-loop wiring: compute `gateRelease` per S2 beside the existing A1 gate-fill block (same
`findAugCountGate`, run twice with the two named counts — comment each count choice, per open
question 0's constraint); pass it into `triggerInputs`. `evalTrigger` per S1/S2 — the change
is ~10 lines inside the arming derivation plus the echoed reason fields.

### Work item 2 — `src/augfarmer.js`: B2 stall evaluator [code] (branch 1)

`evalStall` pure export per S4; main-loop call after the trigger evaluation (it reads
`installSeq` post-update); cycle intervals read from `ratchet-log.json` once per pass (cheap:
parse of a small ring file; cache per catalog rebuild if the implementer prefers — either is
in spec); `stall-warning` decision records + WARN per S4; `stall` block added to the state
file write.

### Work item 3 — tests for items 1–2 [code] (branch 1)

Per S10, in `test/augfarmer.test.js`.

### Work item 4 — `src/daemon.js` + `src/hosts.js`: B1 supervisor + reserve [code] (branch 2)

`RESIDENT_COMPANIONS`, `SUPERVISOR_CHECK_MS`, `SUPERVISOR_RETRY_MS`, `planRelaunches` (pure
export), and the time-gated check + relaunch + log event per S5, placed in the main loop
beside the other every-tick marker checks. `hosts.js`: `HOME_RESERVE_GB = 80` with a comment
carrying S6's rationale and the 64.1 GB figure it protects; `bootstrap.js` comment updated.

### Work item 5 — tests for item 4 [code] (branch 2)

Per S10, in `test/daemon.test.js` (+ `test/hosts.test.js` if the reserve is asserted there).

### Work item 6 — doc reconciliations [code] (each on its branch)

- `docs/scripts.md`: augfarmer row (gate-release arm, stall watch); daemon row (supervisor).
- `docs/reset-protocol.md`: the endgame section gains one paragraph — the count-gate install
  is now automated under the same bounded authorization (trigger exception guarded by
  closedByQueue + sustain + the unchanged mode/pause levers); the manual runbook remains as
  the fallback.
- `BACKLOG.md`: delete the A2, stall-detection, and supervision bug entries (they ship here);
  dated condensed lines to `docs/phases/CHANGELOG.md` with the phase close-out. Staged with
  the work, not after.
- On phase close: both phase-26 ratchet docs graduate to `docs/phases/`.

## Live procedure [live]

- **L1 — Branch 1 goes live (the fuse).** Pre-checks: `npm test` green, dev server healthy,
  `dist/src/augfarmer.js` byte-check, `ramcheck.js` reads 64.10 GB. Then, with Kenneth aware
  it starts the fuse, Claude restarts `augfarmer.js` over CDP. Expected within ~1 poll:
  `trigger-arm` decision record with `reasons.gateArmed: true` and the `gateRelease` detail
  naming Daedalus. Expected at ~10 min: `trigger-fire`, `spend-down-start`, ~2 NFG buys,
  `installer-exec`, install #10.
- **L2 — The unattended endgame.** No action; observe. Expected over the following hours:
  bootstrap recovery, hacking re-climb through 2500 (`endgameHold` re-engages), $100b
  re-earned under the invite reservation, Daedalus join, auto-donation, Red Pill purchase,
  `backdoorwd.js` fires — BN1.3 ends on the BitVerse screen. Verify from exported logs
  (`ratchet-decisions.json` chain, `ratchet-log.json` boundary pair, transactions) + a
  BitVerse screenshot. Any deviation: the abort levers (`ratchet-mode.txt`, pause file)
  stand; diagnose from the decision log.
- **L3 — B2 negative check (rides L1/L2).** During the healthy pre-fire window and the fresh
  post-install cycle, no `stall-warning` fires and the state file's `stall` block shows a
  sane age/threshold. (A positive live stall can't be scheduled — the unit fixtures carry
  the positive case; the first real one validates it in production, which is the nature of a
  watchdog.)
- **L4 — Branch 2 goes live (post-install-#10).** Merge, `npm test` green, `ramcheck.js`:
  daemon 16.3 GB flat; Claude restarts `daemon.js`. Soak ≥30 min: no spurious relaunches
  (`companion-relaunch` count 0 while all residents live), batcher behavior unchanged at the
  new reserve.
- **L5 — B1 kill test.** Claude kills one cheap resident (`transactionsmonitor.js`) and —
  separately, while `phase: grinding`, not during a spend-down — `augfarmer.js`, over CDP.
  Expected within ~60s each: WARN + `companion-relaunch` event + the script back in
  `ns.ps("home")`; the augfarmer relaunch specifically proves the 80 GB reserve does its job
  under a packed batcher. State-file continuity: cycle caps restored, trigger re-derives.
- **L6 — Next node entry (deferred, not a phase gate).** The fresh node's first unattended
  day is B1/B2's real soak; the BACKLOG carries a watch entry ("first unattended stretch:
  check companion-relaunch events + stall block daily") so it doesn't dangle.

## Acceptance criteria

- **`npm test` green** including S10's full list, per branch. [code]
- **Rail re-verified:** `grep -rn installAugmentations src/` still matches only
  `installer.js`; the Phase 25 observe-mode rail test still passes untouched. [code]
- **RAM flat:** augfarmer.js 64.10 GB, daemon.js 16.3 GB in `logs/ramcheck-result.json`.
  [live artifact]
- **A2 validated:** install #10's decision-record chain shows `trigger-arm`/`trigger-fire`
  with `reasons.gateArmed: true` under `endgameHold: true` and totalGain < `MIN_TOTAL_GAIN`;
  the install lands; Daedalus subsequently invites (the gate actually opened). [live — the
  phase's primary gate]
- **The clear (secondary but expected):** BN1.3 ends via the unattended chain; evidence per
  L2. A chain failure past install #10 reopens the relevant Phase 25 component, not this
  spec. [live]
- **B2 validated at the negative:** zero false `stall-warning` across L1–L4's healthy
  windows; `stall` block present and sane in the exported state file. [live, from logs]
- **B1 validated:** L5's two kill-recoveries observed with their log events; L4's soak shows
  zero spurious relaunches. [live]
- **`npm run verify:log` green** (no shape changes expected — this asserts none regressed).
  [live]
- **Doc reconciliations landed** per work item 6. [code, checkable by reading]

## Files touched

**Branch 1 (`phase26-a2-b2`):** `src/augfarmer.js`, `test/augfarmer.test.js`,
`docs/scripts.md`, `docs/reset-protocol.md`, `BACKLOG.md`, `docs/phases/CHANGELOG.md`.

**Branch 2 (`phase26-b1`):** `src/daemon.js`, `src/hosts.js` (one constant + comment),
`src/bootstrap.js` (comment only), `test/daemon.test.js`, `test/hosts.test.js` (two
assertions updated as intended changes — S10), `docs/scripts.md`, `BACKLOG.md`,
`docs/phases/CHANGELOG.md`.

**Deliberately untouched:** `src/installer.js` (the rail), `src/dashboard.js` (Phase 24
gate), `vite.config.ts` (no new exports), `src/resourcemanager.js`, the batcher core,
`src/ratchetlog.js` (B2 reads its file; the writer is unchanged).

## Open questions

- **(i) B2 dashboard line** — deferred behind the Phase 24 observability gate; the
  state-file `stall` block makes it a rendering-only follow-up. Wake-up: the first real
  stall B2 catches (did the tprint + log suffice, or did it go unseen?). This is also open
  question 3's (report vs recover) evidence collector — B1 ships recovery for *process*
  death now, but whether *progress* stalls also need automated recovery waits on this datum.
- **(ii) Multi-aug gate deficits** (features open question 4) — unchanged, wake-up: any
  gate rule firing with gap > 1.
- **(iii) Self-terminating companions' crash-before-done** — unsupervised by S5's design.
  Wake-up: first observed instance (the daemon-restart heal is the interim answer).
- **(iv) B4 goal model / B3 NFG-rep strategy** — out of scope here, wake-up conditions in
  the features file (B3's is D9's first `rep`-bound spend-down log).
