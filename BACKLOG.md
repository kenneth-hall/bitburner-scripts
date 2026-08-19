# Backlog

**Purpose.** A holding pen for *ideas* and *bugs* — things worth doing that aren't
scheduled. This file is **not** the project's driver or calendar. What to work on next
lives in `CLAUDE.md`'s "Current goal" line; the story of active feature work lives in its
phase docs (`phase-NN-slug.*.md`); finished work is condensed into
[docs/phases/CHANGELOG.md](docs/phases/CHANGELOG.md). Backlog only answers: *what might we
do, and what's broken?*

**How to use it.**
- **Two kinds of entry: Bugs** (something's broken or wrong, not yet fixed) and **Ideas**
  (work worth considering). Nothing here is a commitment or a schedule.
- **Keep entries short** — what it is, why it matters, and the next concrete action. The
  full reasoning belongs in a phase/features doc; link to it instead of pasting it here.
- **If an idea is parked, state the trigger** that should revive it ("revisit when X").
  A deferred item without its wake-up condition is noise.
- **When something ships or is resolved, it leaves this file** — a condensed, dated line
  goes to [docs/phases/CHANGELOG.md](docs/phases/CHANGELOG.md) and the entry is deleted
  here. No "trail" copies; git history already has them.
- **Don't paste playbooks or mechanics references here.** Those are docs (`docs/…`) or
  memory — link to them.

## Bugs

- **🔴 NEW 2026-08-15 — `Recruitment` is wired to a flag we closed permanently, so the engine can
  never build a team — and teams only matter for the one thing the engine doesn't do.**
  `pickOverheadAction` (`bladeburnermanager.js:669`) reads
  `if (stageBEnabled && teamSize < TEAM_SIZE_TARGET)`. `stageBEnabled` is **`false`**
  (`stageBBlockedBy: "Q11"`), and Stage B was **closed permanently on measurement 2026-08-11**, so
  that branch is dead code. Live: `teamSize` **0**, and it has been 0 for the entire run.
  - **The gate was right when it was written and is wrong now.** Teams apply to **Operations and
    BlackOps only** (`getTeamSize` Remarks) — Stage A runs `Tracking`, a *Contract*, which teams
    cannot help, so spending 4m22s of slot time on `Recruitment` in Stage A was correctly refused.
    The bug is that **black ops are neither Stage A nor Stage B**: the engine has no black-op stage,
    so the one place a team pays off is the one place nothing can request one.
  - **Not currently blocking.** The ladder is running at a x63 success multiplier with `teamSize` 0
    and ops are completing first-try. Recruitment is a *lever we never priced*, not a live failure.
  - **Next concrete action:** if any late op stalls on retries, run `Recruitment` (4m22s, success
    read **100%** for us) a few times and re-read `getActionEstimatedSuccessChance` before/after —
    that also finally answers the playbook's open "does `Recruitment` gate the black ops?" question,
    whose standing default is *"assume a team is required for late black ops."*

- **🚨 PROJECTED RUN-KILLER, ~1.2 days out: selection will abandon `Tracking` on a number measured
  to be 4× wrong.** (Measured 2026-08-13; full record in `CLAUDE.md`'s standing-section estimator
  bullet.) `Tracking` realises **100% success / 68.14 rank/action** and is **100.4% of the measured
  rank rate**, but its *estimated* `pMin` is collapsing — **0.8884 @ L126 → 0.2505 @ L136**
  (n=1,250), decaying **−0.0268/level**. `pickRankAction` (`src/bladeburnermanager.js:452`) picks
  the **strict max** estimator score and **drops any candidate scoring `<= 0`** (line 460), so:
  **~L143 (~1.2 d)** `Tracking` scores below `Investigation` (0.048 vs 0.058) and the engine
  switches to the action realising **0.061 rank/action** → ~99% rate collapse; **~L145.5 (~1.7 d)**
  `Tracking` is dropped from the pool outright. **The clear needs ~3.2 days — both land inside the
  window.**
  - ⚠️ **`objectiveMode: "per-action"` is NOT the fix** — `evPerAction` decays to 0 as well. The
    fix is making selection consult Phase 40's **realised** ledger (which already holds the right
    number) instead of the estimator, i.e. the `objectiveMode` phase proper.
  - ⚠️ **Driver is confounded — do not assert a cause.** Chaos rose **278% in 42h** while the level
    climbed L126→L136; they are collinear (`corr(pMin, level) −0.95`, `corr(pMin, log chaos) −0.97`).
    Chaos is separately **falsified as a driver of realised yield**, so this is an *estimate-only*
    effect — nothing is actually wrong with `Tracking`, which is what makes it dangerous.
  - **Cheapest mitigations if it fires (unvalidated, in rising cost):** a `Tracking` level ceiling
    via the governor; a `Diplomacy` forcing path (currently unreachable — 24h
    `rankProducingSec == actionSec`, so `pickOverheadAction` is never called); city rotation.
  - **✅ CAUSE IDENTIFIED AND FIXED 2026-08-13 — it was lost INTEL, not a real decline, and the
    tell was in the data all along.** The estimate's **upper** bound never moved off **1.0000**
    while the lower bound collapsed 0.89 → 0.25. A *widening* range means the game is less **sure**,
    not that the action got worse — and since scoring reads the pessimistic bound, "uncertain" and
    "bad" are indistinguishable at the call site.
    - **Measured counter (`src/fieldanalysisprobe.js`):** `Field Analysis` restores `pMin` at
      **+0.684/hour**, monotonic, with **city chaos flat at 274.8 throughout** — so it rebuilds the
      population estimate and has nothing to do with chaos. Maintenance costs **~14 min/day
      (~1% of wall time)** against a **0.158/day** decay.
    - **Shipped fix (S-RF, `realisedFloorScore` + `pickRankAction`'s `ledger` opt):** selection now
      takes `max(estimated, realised)` for any action with **>=50 attempts at its current level and
      >=90% realised success**. Strictly one-directional — it can only *raise* a proven action,
      never lower anything, never promote an unproven one, and is byte-for-byte the old behaviour
      when no ledger is passed. 9 tests including a replay of the exact projected cliff.
  - **🟡 SIDE EFFECT OF S-RF, found 2026-08-13 — the success-rate INSTRUMENT is now contaminated,
    though nothing is currently mis-deciding.** Keeping `Tracking` selected lets it **auto-repeat**
    (`startAction` is not one-shot), so a single settlement now spans ~2.5 actions and the attempt
    count falls back to the `SETTLE_MAX_MS` estimate (`elapsed / getActionTime`). Measured on
    `Tracking`: estimated-settlement fraction **0.1% → 53.6%** across the S-RF restart.
    - **Consequence:** the *denominator* inflates, so measured success reads **low** — L136–L139
      read 92.6 → 84.5% while **realised success is 100%** (every completion pays; 1,371
      completions read 100% across every chaos band, including 500–900). L140 reading back at
      **100%** confirms it is an artifact, not a decline.
    - **Not currently dangerous:** the governor decides on `recentWindow`, which reads **1.00
      (`autolevel-healthy`)**, far from `LEVEL_LOWER_BAND` 0.6; and S-RF's own ≥90% gate simply
      skips a contaminated level and falls back to a proven one, which is the fallback working.
    - 🔴 **But Q40-15's guard cannot fire, by construction.** `estimated-fraction-high` is gated on
      the **cumulative** ratio (`estimatedSettlements / settlements` = **210/3,921 = 5.4%**), which
      thousands of clean historical settlements dilute below the 25% threshold **permanently**. A
      recent-window contamination of 53.6% is invisible to it. **The warn should be windowed, not
      cumulative.** Cheap fix, but it is instrument work, not a live-run fix.
    - **Next action:** window the warn; consider whether settlement should force a boundary when a
      run exceeds N actions. **Wake condition:** any governor decision citing a `successRate` below
      0.9, or the `recentWindow` reading dropping below 1.0 on `Tracking`.
  - **Still open (deliberately NOT done):** `Field Analysis` is still **not in the engine's pool**,
    so the estimate keeps decaying — S-RF makes selection immune to that, but the engine still
    cannot self-heal its own intel. Wiring it in with a `pMin`-threshold trigger is the follow-on,
    and it is a spec question (which action class, what trigger, what duty budget), not a constant
    tweak. **Wake condition:** any future work on `objectiveMode`, or a second action becoming
    rank-relevant.
- **🟡 Four-way player-action-slot contention has no arbiter.** `bladeburnermanager.js`,
  `augfarmer.js` (faction work), `backdoorfactions.js` and `backdoorwd.js` (`installBackdoor`) all
  claim the single player-action slot. Only the bladeburner<->augfarmer pair cooperates (via
  `bladeburner-slot-hold.json`); the two backdoor scripts are outside that contract entirely.
  Consequence: any probe or feature needing exclusive slot access must quiesce all four, and there
  is no way to do that today. Blocked six attempts at one measurement (four on 2026-08-02 daytime,
  two more the same evening ~8pm — Phase 39's Q10), and blocks Q5 (city rotation) and Q11 (operation
  HP cost) too. **Correction 2026-08-02 8:28pm:** live-checked `backdoorwd.js` — it's currently a
  no-op (WD doesn't exist yet under decision B, idle-polls with `active:false`, never touches the
  slot), so it is *not* the live cause of the two evening failures despite being named a claimant
  here; `backdoorfactions.js` (confirmed running via `ps` at the same time) is the more likely
  actual contender right now. `backdoorwd.js` stays on this list as a real hazard if it ever does
  fire. **✅ Re-ran `slotconflictprobe.js` 2026-08-02 9pm** (adapted it to pause
  `bladeburnermanager.js` first, since D1's continuous-duty policy meant the script's old
  idle-wait precondition never cleared on its own) — **the conflict MECHANISM is real and
  confirmed**: starting a Bladeburner action killed `augfarmer.js`'s in-progress `workForFaction`,
  and `augfarmer.js` killed the Bladeburner action right back within the observe window
  (`bbCancelledWork` and `augKilledBb` both `true`). This overturns the old buggy-verdict-logic
  "NO CONFLICT" result that was the only prior data point.
  **⚠️ Correction 2026-08-02 9:15pm — the "Next action" this entry previously carried (fix
  `augfarmer.js`) was wrong and has been removed.** That run's probe never claimed
  `SLOT_HOLD_FILE`, so `augfarmer.js` correctly saw an unclaimed slot and took it — reading its
  actual source (lines 1886, 1935) confirms both work-decision branches already check
  `slotHold.holdActive` and suppress work when set. The real gap, matching this entry's *original*
  framing before that wrong correction: **`backdoorfactions.js` never reads `SLOT_HOLD_FILE` at
  all** (confirmed by grep — only writes its own one-way `ACTIVITY_FILE`), and it was confirmed
  running via `ps` during the actual failed Q10 attempts. **Next action:** make
  `backdoorfactions.js` check `SLOT_HOLD_FILE` before its walk+`installBackdoor` block, mirroring
  the check `augfarmer.js` already has, then cover `backdoorwd.js` the same way as a hazard
  guard, or add a global quiesce marker.
  **✅ SHIPPED 2026-08-02 9:15pm** (`resolveBladeburnerHold`, 8 new tests, live-restarted, confirmed
  running under a fresh PID). **Re-verified 9:30pm: the fix works but is not sufficient** — see the
  new bug entry below. This entry is closed as far as `backdoorfactions.js`'s own gap goes;
  `backdoorwd.js`'s hazard-guard and the global-quiesce-marker items are still open, low priority
  (it's currently a no-op under decision B).
- **🔴 STILL OPEN, ROOT CAUSE UNDIAGNOSED — `startAction` silently no-ops for at least Tracking and
  Raid.** `ns.bladeburner.startAction("Contracts","Tracking")` and
  `ns.bladeburner.startAction("Operations","Raid")` can both return `true` while
  `getCurrentAction()` reads `null` for the whole observation window and zero successes accrue —
  the action never actually starts. **Investigation (also an Operation) does not show this.** One
  unconfirmed lead: Investigation is the only action documented with zero HP loss on failure.
  Blocks Phase 39's Q10 (stamina cost) and Q11 (HP cost per failed operation). **✅ Phase 39 (S6/S7)
  ships a survival strategy, not a fix**: the engine now verifies every `startAction` call against
  `getCurrentAction()` on the next tick, quarantines an action after 3 consecutive verification
  failures, and logs every attempt (predicted EV, verified outcome, full context) to the new
  `bladeburner-attempts.json` ledger. ~~**Next action:** the diagnosis is now a *log read*, not a live
  experiment — check whether the ledger's context fields (stamina/HP/city/level/autolevel) correlate
  with which attempts fail once enough samples accumulate.~~ 🔴 **THAT NEXT ACTION IS NOT EXECUTABLE
  — corrected 2026-08-08.** The ledger's correlate fields are **hardcoded `null`**
  (`bladeburnermanager.js:1653`) and `observed.rankDelta`/`successDelta` are **0 on all 4,487
  records**. This bug has been parked for five days waiting on evidence the instrument was never
  recording. **Real next action:** it is blocked on Phase 40 work item 1 (ledger repair); re-attempt
  the correlation once the fields carry real values. → `docs/bn6-go-no-go.md` §12.4.
- **✅ SHIPPED 2026-08-03 (Phase 39 WI1/S1) — `bladeburnermanager.js` telemetry rebuilt from
  wall-clock.** The old `rankPerHeldSec`/`dutyCycle` fields were derived from the engine's own
  intent (`heldSec` = "we called `startAction`") rather than from verified `getCurrentAction()` time,
  so a run where the game silently cancelled/never-started the action still read `dutyCycle: 1`. New
  fields (`rankPerWallSec`, `dutyCycle = actionSec/wallSec`, `rankProducingSec`) are derived only
  from `getRank()` deltas and verified action time — see the spec's S1 for the "no field may be
  derived from the engine's own intent" rule and `test/bladeburnermanager.test.js`'s `T-TEL`
  regression test.
- **🟡 UNDIAGNOSED, observed not confirmed — HP dipped to 12/28 (43%) during ordinary Tracking
  grinding 2026-08-02 ~8:40pm**, below `bladeburnermanager.js`'s own `HP_FLOOR_FRACTION` (0.5). The
  guard IS wired into the main loop (`pickOverheadAction`/`updateHpRecovering`, checked every
  `BB_POLL_MS`=10s), so this may just be normal lag between a burst of failures and the next poll
  rather than a real bug — not verified live either way this session. **Next action:** if HP dips
  below the floor again, check whether it's poll-cadence lag (expected, bounded) or the guard
  failing to trigger at all (a real bug) before assuming either.
- **🔴 NEW 2026-08-08 — the chaos branch is REACHABLE but STARVED; `Diplomacy` cannot run in the
  current regime.** Distinct from the 2026-08-03 fix (which made the branch reachable at all — that
  entry is closed, see CHANGELOG). `pickOverheadAction` is only called when `pickRankAction` returns
  `null` (`bladeburnermanager.js:1592`), and the engine now runs **24h `dutyCycle` 0.9998 with
  `rankProducingSec == actionSec`** — `Investigation` always backfills the capacity `Tracking` can't
  supply, so overhead is never selected. Every guard on the branch itself passes right now (Ishima
  chaos **69.02** > `CHAOS_TARGET` 50, `budgetRemainingMs` 720,000, `hpFraction` 1, stamina 0.986 not
  recovering); it is simply never reached. Chaos is climbing (15.68 on 08-07 → 69.02 on 08-08).
  🔴 **DOWNGRADED THE SAME DAY — chaos is FALSIFIED as `Investigation`'s cause, so this defect has no
  demonstrated cost.** ~~It was the leading hypothesis for `Investigation`'s collapse.~~ `Tracking` is
  a free control (chaos is city-scoped): across the same window it took **zero damage** — 0–1% failure
  while chaos rose **7.2×**. The real cause is the action's own **level** → **Phase 40**
  (`phase-40-autolevel-governor.features.md`). Full record: `docs/bn6-go-no-go.md` §12.1.
  **Next action:** none scheduled — a real defect whose fix buys an unknown, probably small amount.
  **Wake condition:** an action-*independent* degradation, i.e. `Tracking`'s zero-rate rising while
  Phase 40's governor holds its level constant. That is the signature chaos should have left and
  didn't, and Phase 40 makes the test free.
- **🟡 NEW 2026-08-08 — `diplomacyEffect` does not persist across restarts, so its counter reads as
  a cumulative one and isn't.** `diplomacyEffect` is initialised to `emptyDiplomacyEffect()` at loop
  start (`bladeburnermanager.js:1180`) and only ever lives in memory, while `runs`/`meanRemovedPerRun`
  are published into `bladeburner-state.json` where they read like lifetime totals. With **17
  restarts** logged, `runs: 0` means "none since the last process start." **This directly caused a
  wrong finding** — `runs: 0` was written into `CLAUDE.md` and `bn6-go-no-go.md` §11.7 as "`Diplomacy`
  has never run," when `bladeburner-log.json` holds two `diplomacy-effect` records. **Next action:**
  either seed it from the log ring at startup (same shape as `resumedTotals`, which already does
  exactly this for `totals`) or rename the fields to make the scope obvious.
- **🟡 NEW 2026-08-08 — `Diplomacy`'s strength has never been cleanly measured; one sample is
  contaminated and the other was discarded.** Of the two `diplomacy-effect` records, the second is
  correctly `discarded` (`city changed Volhaven -> Ishima`) and the first (`removed: 174.15`,
  Sector-12 177.5 → 3.39) **predates the same-city guard** — it carries no `cityName` field, and it
  is exactly the contamination `bladeburnermanager.js:1671-1674` was written to catch ("makes it look
  ~50× stronger than it is"). ⚠️ **Do not quote 174 chaos/run as Diplomacy's effect.** The policy's
  whole justification is that it self-measures, and it has not yet returned one usable number.
  **Next action:** falls out for free once the starvation entry above is fixed — the instrument
  already exists, it just never gets to run.
- **🟡 NEW 2026-08-03 — `cli.mjs restart <companion>` races the daemon's supervisor and can leave TWO
  instances running.** Observed live: `restart bladeburnermanager.js` killed it, `daemon.js`'s
  supervisor logged `bladeburnermanager.js not running -- relaunching (attempt 1, missing 0s)` and
  started one, then `restart`'s own `run` started a second — two engines fighting over the single
  player-action slot, both writing `bladeburner-state.json`. Confirmed by `ps` (PIDs 3383302 +
  3383347) and resolved by `kill <pid>`. **Next action:** either have `cli.mjs restart` re-check `ps`
  after its `run` and kill duplicates, or have it skip the `run` entirely for supervised companions
  and let the supervisor do the relaunch. Until then, **`ps` after every companion restart.**
- **🟡 NEW 2026-08-03 — two pre-existing `npm run verify:log` failures, unrelated to Phase 39.**
  (a) `verify-ratchet.test.js`: `ratchet-decisions.json` has records with `mode: null`, but the
  assertion requires `'observe'|'auto'`. (b) `verify-transactions.test.js`: a record fails the
  type/source field check and the always-positive-amount check. Neither touches
  `bladeburnermanager.js`; found while running the suite for Phase 39's T2. **Next action:** decide
  whether the logs are wrong (a real writer bug in `augfarmer.js`/`translog.js`) or the assertions
  are stale, then fix the correct side.
- **🟡 NEW 2026-08-03 (Phase 39 live validation, L2) — the hospitalization-inference rule (S9)
  never fires; the panel is the only working source.** Live cross-check: `bladeburner-state.json`
  read `hospitalizationsInferred: 0` while the in-game panel read `Num Times Hospitalized: 158` at
  the same moment, everything else (rank, stamina, city, population, communities, skill points)
  matching exactly. The inference rule assumes a hospitalization heals HP to exactly `max` in one
  tick — that assumption is apparently wrong (or the transition happens between polls in a way this
  engine's ~1s cadence never samples). **Not a blocker** — the spec's own S9/L2 anticipated this
  exact outcome ("a mismatch there does NOT stop the phase — it retires the inferred field as
  untrustworthy and makes the panel the sole source"), and Q9's resolution path already assumes
  bracketed CDP panel reads, not the inferred count. **Next action:** if the inferred count is ever
  worth fixing, needs a live session bracketing a known hospitalization event (watch the panel
  counter tick while sampling `getPlayer().hp` every tick) to see what actually happens to HP at
  that moment — not attempted yet, low priority since the panel already works.
- **🟡 [PARTIALLY SHIPPED 2026-07-29 · DORMANT 2026-08-06 · live gates VOID] Phase 36
  (`phase-36-install-cadence.spec.md`, twice cold-reviewed) is **1 of 4 work items shipped**.**
  ⚠️ **Read the count carefully — it has been misread twice.** Work item **4** shipped, delivered as
  the *two* pieces **F-A + F-B** below; **work items 1, 2 and 3 are all open**, bundled under the one
  name "the buy-set filter". Two deliverables of one item is what makes this read as 3-of-4.
  BN6.1 entry surfaced this as stranded — features + spec sat in the repo root, never in
  `docs/phases/CHANGELOG.md`, only the `GRIND_HORIZON_MS` stopgap (1h, was 8h) had shipped.
  - **🔴 The spec's live gates L1–L4 are VOID, not overdue** (checked 2026-08-08). L2's bar is an
    install with `trigger.reason === "ladder"`, but `ladderArmed` is *in the deferred bundle* — the
    running code's only trigger reasons are `gain-phase` / `escalation` / `stall` (124 live
    `trigger-fire` records, zero `ladder`), so the gate can never fire. L2's own fallback
    (`GRIND_HORIZON_MS` → 1h) is **already the shipped state**, and L1's expected `28800000` (8h)
    never was the shipped value. On top of that, installs are **off** (`src/ratchet-mode.txt` =
    `observe`; #43 on 08-07 was the last, and it fired *against* that decision via the gitignored
    revert). **Do not treat the 2026-07-29 L2 deadline as a live commitment** — re-derive the gates
    if and when the buy-set filter is actually built.
  - **✅ F-B shipped 2026-07-29** — disarms are no longer invisible in auto mode. Deleted the
    `mode !== "auto"` guard on `trigger-clear` logging; added `lostSustainedMs` (the previous pass's
    `sustainedMs` — the one field that would have diagnosed the 19:28 restart-voided-the-arm failure
    in one read) and rate-limited via the new pure `shouldLogClear` (`CLEAR_LOG_MIN_INTERVAL_MS` =
    60s) with a `suppressedCount` so a flapping trigger reads as flapping, not silence, without
    flooding the 500-entry `DECISIONS_CAP` ring. 3 new tests, 1029 total pass, `augfarmer.js` RAM
    unchanged at 64.10 GB (no new `ns` calls).
  - **✅ F-A shipped 2026-07-29** — the arm now survives a restart. New pure `resolveArmResume`
    (decision 9's four guards, checked in order: `no-state`/`cycle-mismatch`/`not-armed`/`stale`,
    bound at `ARM_RESUME_MAX_AGE_MS` = 15 min) reads `augfarmer-state.json` at startup and resumes a
    **start time**, never a fired state — `evalTrigger` still recomputes `armed` fresh every pass, so
    a resumed stamp can only shorten a wait for a condition true right now, never fire on a lapsed
    one. Held across passes (surviving an intermediate `armed:false` pass, the exact case the first
    draft got wrong per the spec) until consumed on the first `armed:true` pass or expired by
    wall-clock against the *original* save timestamp, whichever comes first. A `trigger-resume`
    decision record fires once at startup (`{resumed, reason, savedArmedSinceMs, savedAgeMs}`), and
    `triggerArmChanged` joins the state-write gate (decision 10, exact precedent of
    `awaitingMoneySinceChanged`) so a just-armed stamp is never lost to the 5-min heartbeat window.
    11 new tests, 1040 total pass, `augfarmer.js` RAM unchanged at 64.10 GB.
  - **Still open, deliberately deferred — the buy-set filter = work items 1 + 2 + 3**
    (`augIsWorthLadder`, `marginalBlocked`, `LADDER_FILTER_MIN_MULT`, `ladderCountsFrom`,
    `pickTarget` tier 4, `ladderArmed`, the T-INV grid). Verified 2026-08-08: **none of those
    identifiers exists in `src/augfarmer.js`** — this is genuinely unbuilt, not built-and-unvalidated.
    ~75% of the phase's test surface. Tuned to BN5's 613× price ladder and needs re-deriving against
    BN6 numbers (aug cost 1.0×, not BN5's 200%) — wait for real BN6 income data before touching it,
    per the "gathering data before analysis" standing grant. ⚠️ **Blocked harder than that now:**
    installs are stopped (08-06, a measured 5.4% of Bladeburner wall-time) and the batcher is a
    funding engine only (08-02), so there is no install cadence for this to tune.
  - Historical context below (why Phase 36 exists) is unchanged and still accurate:

- **🟡 [SUPERSEDED 2026-07-28 — the race is over, the stall was not caused by it] cloudmanager and
  the aug ratchet race for one wallet. → now `phase-36-install-cadence.features.md`.**
  **What changed:** cloudmanager hit BN5's hard fleet ceiling (25/25 servers, all at `ramLimit`
  1,048,576 GB; `cloud-state.json` `growth: "at-limit"`, last spend 2026-07-28 04:38) and **can
  never spend again this node.** Cash reached **$38.7t with `totalReserved: 0`** — and **M stayed
  flat anyway**, 45.5h since install #25. So the race was real but **not the binding constraint**;
  it was masking a second blocker (`gainPhase: "horizon-under-bound"` — the trigger waits out a
  ~1.8h rep horizon that keeps renewing, at a **613× price ladder**). Phase 36 was rescoped to that.
  - **The arbitration fix below is SHELVED, not rejected — it returns in the next node**, where the
    fleet grows again. Everything measured on 7/27 is still correct *about 7/27*; keep it.
  - **Answers the "reserve circularity" worry for whoever builds it:** during spend-down
    `augfarmer.js:2787` already reserves `money` **wholesale**, not a ladder-derived figure.
  - Measured over 11.5h on 2026-07-27: `auto-cloud-upgrade` took **$3,391.0b across 210 txns ($82.0M/s sustained,** individual
  upgrades $74.99b, one at $179.97b**)** against **$110.9b to augs — a 30.6:1 ratio.** Cash went
  **$53.25b → $5.95b in ~40 min.**
  - **The mechanism is a race, not a deadlock.** `totalGain` is dominated by `projectedNfgFactor`,
    and `nfgBoundBy` reads `"money"` — so it tracks cash on hand at sample time. Observed drifting
    **1.0829 → 1.1046 (over the 1.1 bar) → 1.0510** in ~50 minutes with no code change, because
    cloudmanager spends the balance between samples. `TRIGGER_SUSTAIN_MS` then demands **10
    continuous minutes** armed while cloudmanager fires every ~1–3 min, so the trigger can never
    sustain.
  - **This is `CLAUDE.md`'s own predicted failure, arrived:** *"the finance reserve never covers the
    NFG spend-down batch, so cloudmanager can starve a deep NFG tail."* Worse than predicted — it
    isn't starving the tail, it's **blocking installs outright**.
  - **It is also buying RAM nobody uses:** batcher utilization was **14.0% of 4.59 PB** before
    `ns.share()` was enabled. ⚠️ Share now soaks idle RAM, so `utilizationPct` reads 72.8% and is a
    **broken signal** for this — any demand gate needs batcher-only demand.
  - **⚠️ CORRECTS AN EARLIER ENTRY IN THIS FILE (commit `f26cf15`, same day).** That entry blamed
    the **D3 one-NFG-per-cycle cap**. It was wrong: `spendDownPlan` (`augfarmer.js:1503`) runs after
    the trigger fires and buys an NFG **ladder**, with the cap explicitly lifted for spend-down — the
    trigger already projects 4–9 levels. The error was reading `nfg.cappedThisCycle: true` and
    stopping there instead of following `nfgLevelsProjected`/`nfgBoundBy` to source. **Lesson worth
    keeping: one poll of an oscillating quantity is indistinguishable from a deadlock.**

- **Phase 34's install trigger is optimistic on two axes, and BN5 voids the justification for one
  of them.** Found 2026-07-26 during the Phase 35 brainstorm; this is live shipped code, not a
  future build item.
  - **(a) It never charges the post-install income recovery.** Measured in BN5.1: the first
    purchase of *any* kind after an install landed **exactly 10 hours later**
    (`logs/transactions-2026-07-26.json`), with $0 income throughout. `afterMs` charges only the
    aug's reset money price.
  - **(b) Its own spec already flags the second omission and names the condition that makes it
    unsafe** (`docs/phases/phase-34-install-timing.spec.md:128-140`): the post-install rep re-earn
    is omitted, *"so the rule carries a known optimistic bias toward installing,"* accepted only
    because *"NiteSec rep re-accrues from gang respect without player work"* and explicitly unsafe
    *"in a node without donation access."*
  - **Both escape hatches are absent in BN5.** No gang (tripwire deferred to 2026-08-02), and no
    donation access — CyberSec favor **99.76**, NiteSec **4.33**, against the 150 needed
    (`logs/augfarmer-state.json`). **The spec's own stated unsafe condition is met, and the rule
    has been running here since node entry.**
  - **⚠️ NOT a constant bump — attempted 2026-07-26 and reverted.** The obvious fix is
    `INSTALL_OVERHEAD_MS` 600_000 → 36_000_000 (`augfarmer.js:204`). It is one constant feeding one
    comparison (`:1127`), tests reference it symbolically, and it looked mechanical. **It broke 4
    tests, and the tests were right.**
  - **What the failure revealed: the overhead is node-dependent, not universal.** The live BN2
    fixture is `waitMs` ≈ **2.19h** against overhead + `afterMs` ≈ 10.6s. At a 10h overhead,
    waiting always beats installing, so the escalation trigger would **never fire again** — a
    behaviour deletion wearing a recalibration's clothes. And the old 80.3s figure was *correct for
    BN2*: **a gang keeps earning through an install** because its income does not depend on the
    purchased fleet, so BN2's true recovery cost really was near zero. BN5 has no non-fleet income,
    so the same event costs ~10h. Rewriting those 4 tests to match a BN5 number would have deleted
    the recorded BN2 evidence — the make-the-test-agree-with-the-code antipattern.
  - **So the real shape is:** the term should model **income lost during recovery**, which turns on
    a structural question (*does this node have an income source that survives a fleet wipe?*), not
    on a tuned scalar. That is a signature/design change — `decideInstall(ctx)` reads the module
    constant directly rather than taking it from `ctx`, so even making it injectable is not a
    drive-by. **Next:** size it inside Phase 35 alongside the boundary telemetry (F2), which is
    where the recovery number will actually be measured. Context:
    `phase-35-install-boundary.features.md` §9 F3.
  - **Measurement plan (Phase 35 decision 11, 2026-07-26):** the fix itself is deliberately NOT
    built this phase — `decideInstall` stays untouched because its designed fix has an unmeasured
    input, and changing it pre-measurement is the exact antipattern the reverted constant bump
    already demonstrated above. What Phase 35 ships instead is the instrument: the boundary
    telemetry slice (work item 1) + `goal-log.json` + the daily transactions log are exactly the
    inputs the recovery-cost term needs. **After the first fully-instrumented install boundary**
    (Phase 35's L3 live step), the close-out computes the measured recovery cost and this entry
    gets updated with the number and the recommended term shape. Accepted cost in the meantime: the
    install trigger stays optimistic for 1-2 more cycles (bounded, ~10h per extra install) — smaller
    than shipping a second wrong fix.

- **`cloudmanager.js` can starve the NFG spend-down — the finance reserve never covers the
  *batch*.** Found live 2026-07-23 (BN2 endgame): cloudmanager spent **$5.08t in ~2.5 min** walking
  fleet servers toward 1 PB while `finance-state.json` read `totalReserved: $0` and
  `augfarmer-reserve.json` was empty — so it treated the entire pile as free. The chain
  (`augfarmer.js` → `augfarmer-reserve.json` → `resourcemanager.js` "next-aug" reservation →
  cloudmanager subtracts `totalReserved`) *works intermittently*: it reserves at most the **single
  next aug**, and writes nothing at all during the grinding/accumulation phase — which is exactly
  when money should be protected for the coming spend-down. Interim mitigation was a
  `cloud-upgrade-off.txt` pause (now removed for BN5, where the batcher needs the fleet).
  **Impact scales with income** — harmless for most of BN2 (upgrades capped ~$28.8b), acute only
  once income hit tens of $b/s and fleet tiers cost $0.5–1.4t per doubling. **Next:** have augfarmer
  reserve the *projected spend-down total*, not the next single aug; consider a fleet-growth ceiling
  so cloud can't outbid the mult lever. **Revisit before BN5's endgame NFG tail** (money is BN5's
  binding constraint too). Context: `docs/gang-engine.md` "cloudmanager has no aug reserve".
  Also named in Phase 35's decision-12 interlock audit (`phase-35-install-boundary.closeout.md`) as
  the one un-fixed row on that table — money spent buying fleet RAM in the hours before an install
  gets wiped by that install, and nothing plans for it. Not fixed this phase either.
  - **Related, 2026-07-25 — the opposite failure fired first, and the fix moves this dial.** The
    `fundBlocked` branch used to reserve the *whole* balance and deadlocked BN5.1 for 53h; it now
    reserves 0 (see CHANGELOG 2026-07-25). That is under-protective in exactly the direction this
    bug describes, so the durable "reserve the projected spend-down total" fix is now the *only*
    thing standing between cloudmanager and the pile in a `fundBlocked` state. **Low risk today:**
    NFG heads are never marked `fundBlocked` (`augfarmer.js:818` excludes `isNFG`), so the endgame
    NFG tail — the case that actually burned $5.08t — is untouched. Flagging the interaction so it
    isn't rediscovered.

- **Aug scoring ranks by raw mult, not mult-per-dollar — QLink is blocked by name, not by logic.**
  `scoreAug` (`src/augfarmer.js`) scores on multipliers alone, and Phase 33's escalation-optimal sort
  buys **most-expensive-first** — so the single costliest aug in a catalog becomes the #1 buy target
  regardless of how bad its value-per-dollar is. Caught live 2026-07-23: QLink (score 1.35, **$47.5t**,
  rep-met, never `fundBlocked` at gang income) was the head target with money climbing toward it;
  it delivers the same gate contribution as ~56 NFG levels at 200–3000× the cost. Patched with
  `BUY_BLOCKLIST` (QLink + Hydroflame Left Arm → `passesFilter=false`, tested), which is a
  **name-based guard, not a fix** — any future node with a different overpriced-but-high-mult aug
  hits the same trap. **Next:** cost-aware scoring (mult per dollar, or a value floor gating the
  price-DESC sort). Its own phase, not a patch. **Revisit when** entering a node whose catalog we
  haven't hand-checked for trap augs.
  - **🔴 THE TRIGGER FIRED AT BN5 ENTRY AND WENT UNNOTICED — measured live 2026-07-26, and it is
    worse than the QLink shape the blocklist guards.** Head target was **CashRoot Starter Kit,
    $475M, `hackingMult: 1.0`** — *zero* gate contribution. It won because `augfarmer.js:842` sorts
    rep-met candidates **price-DESC before score**, so score is only a tiebreak on equal price and
    in practice **never consulted**. CashRoot is also allow-listed, so `scoreAug` returns a flat
    `ALLOWLIST_SCORE` (0.25) regardless of its all-1.0 stats — the blocklist cannot catch this
    variant, because the aug isn't overpriced-high-mult, it's **no-mult**.
  - **What it displaced, both verified unowned live** (`logs/auginfo-1785116881062.json`: BN5 owns
    only BitWire, NFG×5, Neurotrainer I, Synaptic Enhancement Implant) **and both rep-met** at
    CyberSec (rep 19,142): **Cranial Signal Processors Gen I — $270M, ×1.05**, and **Gen II —
    $470M, ×1.07**. The engine chose $475M for **+0%** over $270M for **+5%**, on a $5M price gap.
  - **⬆️ PROMOTED INTO SCOPE 2026-07-28 as Phase 36 part 2** (`phase-36-install-cadence.features.md`
    D4) — at BN5's live **613× price ladder**, buy-set composition is the dominant term in
    dollars-per-M-point, not a polish item. **Design note, so the obvious fix isn't attempted:**
    **do NOT re-sort score-first.** `augfarmer.js:849`'s price-DESC is commented *"escalation-optimal"*
    and is genuinely correct — buy *i* is taxed `1.9^i`, so buying expensive augs first minimises
    total spend **for a fixed set**. The defect is that nothing keeps zero-M augs *in* the set. Fix
    upstream (score floor / M-contribution filter), then let price-DESC inherit the filtered set.
    ⚠️ **Open:** a membership change also changes `mustBuyCost`, and `mustBuyTotal`
    (`augfarmer.js:1462–1469`) assumes a caller-sorted price-DESC list — trace before speccing.
  - **It is not just a lost aug — it is the head of the chain that has BN5 flat at ~$5k/s.** The
    $475M reservation zeroes `finance-state.available` → cloudmanager can't buy its $68.1M/1024GB
    server (`affordable: false`) → the fleet keeps **one** 512GB purchased host → the batcher's
    *unsplittable* hack job at fraction 0.25 needs **844.9GB** against `largestHostFreeGb: 223.25`
    → **1,576 skips vs 12 batches placed**, every batch shrunk to fraction 0.0625. That is a 4×
    haircut on every batch, on 1 of 13 eligible targets, at depth 1 of 3.
  - **The escalation rationale only justifies price-DESC for *ordering augs already committed to*,
    not for *choosing which aug to buy*.** Expensive-first saves ~0.3% on the ×1.9 ladder when you
    buy both; it costs 100% of the M gain when you can afford one. **Next:** rank the target by
    score (or score/price), keep price-DESC strictly as the intra-cycle purchase order.

- **`augfarmer.js` throws every poll trying to do faction work for NiteSec — our gang faction
  offers none.** Found 2026-07-23: `WARN: action work threw (TYPE ERROR ... singularity.workForFaction:
  factionWorkType expected to be a string. Is undefined) -- retrying next poll`, forever.
  Root cause: `pickWorkType()` (`src/augfarmer.js:626`) ends in `return types[0]`, which is
  `undefined` for an empty `workTypes` list, and that `undefined` goes straight into
  `workForFaction` at L2605. Confirmed empirically with `src/worktypeprobe.js`: of the nine joined
  factions, **NiteSec alone returns `[]`** — because it's the gang faction, and gang factions offer
  no faction work. NiteSec is also the *only* faction the core catalog is bought from, so the
  rep-grind action augfarmer emits for it can never land. **Impact is bounded, not a stalled clear:**
  NiteSec rep is generated by gang respect regardless (~750/s, climbing steadily), so the damage is
  terminal spam plus augfarmer believing it's grinding when it isn't. **Next:** treat an undefined
  `pickWorkType` as "this faction can't be worked for" and skip emitting the `work` action at both
  call sites (L1699-1702, L1745-1748) rather than guarding at the `workForFaction` call.

- **This build's terminal has no `write` command** — found 2026-07-20 attempting Phase 27's L5
  off-marker test (`write gang-off.txt` → "Command write not found"). The reliable path is either
  in-game `nano <file>` + a UI Save click, or (faster, used live) dropping the file under `src/` —
  viteburner already watches `src/**/*.txt` and syncs it straight to `@home:/<file>`, same
  mechanism `share-off.txt`/`xp-off.txt` used historically. Not a bug to fix, just a documentation
  gap: `tools/bb/README.md` should note this so a future session doesn't re-discover it the hard
  way. Low priority — cheap to rediscover, now recorded here and in
  `docs/phases/phase-27-gang.closeout.md`.

- **The log-download bridge silently stalls, and nothing detects it mid-session** — found
  2026-07-19: no file synced to `logs/` between 09:55 and 10:19 (24 min), so `gangaugs.js`'s and
  `gangprobe.js`'s output simply never appeared on disk while every in-game read looked healthy. A
  dev-server kill+restart fixed it instantly. The `SessionStart` autoheal hook only checks staleness
  **once, at session start** — it cannot catch a stall that begins mid-session, which is exactly
  what happened here (the stall began right after a manual restart). **Next:** either have the
  10 s auto-export plugin assert its own liveness (log when a pull returns nothing for N ticks), or
  give the daemon a heartbeat file whose mtime a check can compare against wall-clock on demand.
  Cheap tell in the meantime: `ls -la logs/daemon-batch-log.json` — more than ~60 s stale means the
  bridge is dead and any "the log doesn't show it" conclusion is unsound.

- **Cold-start hardening — the engine assumes a warm start, and a BitNode ENTRY is a cold one.**
  Filed 2026-07-24 after three separate bugs turned out to share one root. An install preserves home
  RAM and a mature fleet; a node entry gives you ~32 GB of home and 18 small rooted servers. Members:
  (a) the floor-reserve carve deadlock (**fixed**, cost 11h at ~$0/s); (b) share's unconditional 25%
  carve on a factionless node (**cheap version fixed 2026-07-26, Phase 35 WI4** — the honest
  joined-but-idle version is still unbuilt, see `docs/batcher-engine.md` §4); (c) the floor
  reserve's empty cache on daemon restart (**fixed 2026-07-26, Phase 35 WI5** — seeded from the
  previous session's persisted batch log, freshness-guarded).
  **All three members of this class are now closed or reduced to their honest residual** — the
  cheap share fix and the restart-seed fix both shipped in the same phase that built the
  telemetry to measure what they save.
  - **⚠️ TRIGGER CORRECTED 2026-07-26 — it was set one node too late, and that cost ~62h.** The
    entry originally read *"Trigger: the next BitNode entry… Deliberately NOT urgent mid-node; the
    fixed member was the only fatal one."* Both halves were wrong at the time of writing: we were
    **already inside** the node entry it was meant to protect, and two further bugs of this exact
    class shipped *after* the root cause was correctly diagnosed — the `fundBlocked` reserve (**53h**
    dead, fixed 07-25) and the gangmanager relaunch loop (**9.1h** of terminal flood, fixed 07-26).
    The diagnosis was right and was not converted into a sweep; the members were then rediscovered
    one at a time, live, at roughly a day each.
  - **Trigger is NOW, and the cheap member first:** `share.js`'s factionless carve is a
    one-condition guard that has cost **two consecutive node entries** and was called "no design
    work needed" on 2026-07-18. Ship that before anything larger.
  - **Standing lesson for this file:** when several bugs are found to share one root, the root gets
    a sweep with a *present-tense* trigger — filing the class with a future trigger converts a
    solved diagnosis back into an unsolved one.

- **~~`daemon.js` floods the terminal with un-launchable companion retries~~ — FIXED 2026-07-24.**
  `fitsOnHome` printed unconditionally, but the supervisor calls it as a pure PREDICATE every 60s for
  every missing companion, so a RAM-starved home produced ~5 terminal lines a minute forever. It is
  now silent unless the caller genuinely intended to launch (`launchDetached`/`runAndWait` pass
  `announce`); the supervisor's own waiting-ram announcement was already correctly gated to once per
  entry into the state. **Not cosmetic** — the flood buried the `Backdoor on 'CSEC' successful!`
  confirmation the same day and cost a diagnostic detour to recover. **Still open:** the retry-logic
  half below ("will never fit" vs "doesn't fit yet") is untouched — the supervisor still retries
  forever rather than escalating.

- **The aug-ratchet can deadlock on home RAM, and nothing automates the way out** — root-caused
  2026-07-20 (previously filed as "`augfarmer.js` needs 64.10 GB and can never start"). The
  premise was wrong: the script needs no split and has no home-only dependency. The actual
  deadlock is that **`installer.js` is the only thing that buys home RAM, and it only runs during
  an install — which the ratchet can't reach while home is too small to host `augfarmer.js`.**
  Broken live by hand-buying one tier (64 → 128 GB, $31.862m against $3.076b held); `augfarmer.js`
  self-launched on the daemon's next retry and resumed normally. New `src/upgradehomeramonce.js`
  is the safe lever (one tier, spend-capped) vs. `upgradehomeram.js`'s full-bankroll drain.
  **Still open:** nothing detects or breaks this deadlock automatically, so the next fresh node
  repeats it. Sub-problem (b) below is the other half. Related and now fixed: `targetsmonitor.js`
  was 12.70 GB for a file the daemon could write for free.
  - **(b) the supervisor treats "will never fit" and "doesn't fit yet" identically** — see the
    terminal-flood entry above; a permanent-skip needs logging once, and a *chronic* skip of a
    priority companion should arguably escalate (buy RAM / warn) rather than retry silently
    forever, which is exactly what hid this deadlock for two days.

- **`xpfarm.js` (5.85 GB) and `ratchetlog.js` (10.10 GB) still don't fit early** — same fresh-node
  RAM crunch, less severe. After retiring `targetsmonitor.js` (recovered 12.70 GB) the freed space
  went to `resourcemanager`/`cloudmanager`/`dashboard`; these two remain blocked until home RAM is
  bought up. In BN2 that's slow (8% max money). **Next:** decide whether the fresh-node companion
  set should be priority-ordered rather than launch-ordered.

- **The NFG tail is on track to shrink every cycle — nothing plans for it** — NFG's rep
  requirement escalates **×1.14/level** (measured install #9: 122,736 → 998,737 over 16 levels;
  the close-out previously recorded it as *not* climbing, which was wrong). Rep resets to zero
  every install but the requirement doesn't, so each cycle re-earns a compounding target with
  roughly linear rep income. Money bound the tail through install #9 so it hasn't bitten yet.
  When it does, per-cycle gain decays toward the discrete augs alone — and the tail is most of
  the gain (16 NFG levels vs 6 discrete augs at #9). Arithmetic is fixed (both ladders now bound
  the buy loop and the projection); **the strategy is open**: donation is the only rep lever that
  scales with our money surplus, and nothing currently aims it at NFG.
  → [docs/neuroflux.md](docs/neuroflux.md), **Phase 26 track B3**. **Phase 33** (`spendDownPlan`,
  decision 6b) added a must-buy head in front of this tail — the allow-listed utility augs plan
  first, then the rest of the discretes, then NFG unchanged — so any future NFG-strategy work
  should read spend-down order off that shape, not the pre-Phase-33 discretes-then-NFG one.

- **`npm run verify:log`'s "amount is always positive" hard assertion is too strict for a real,
  legitimate case** — found 2026-07-18 while checking Phase 26's acceptance criteria:
  `transactions-2026-07-15.json` has one `auto-aug` record for The Red Pill at `amount: 0`, which
  is correct (it's allow-listed and $0 once Daedalus rep clears 2.5m — see `UTILITY_ALLOWLIST`'s
  header in `augfarmer.js`), not a bug. Predates Phase 26 entirely (2026-07-15's BN1.2 clear) and
  is unrelated to this session's changes — flagged here rather than silently loosening the
  checker. Fix candidate: `toBeGreaterThanOrEqual(0)`, or special-case allow-listed $0 augs.

- **`companion-relaunch`/`companion-waiting-ram` events get FIFO-evicted from `daemon-batch-log.json`
  within minutes on a busy fleet** — discovered live 2026-07-18 during Phase 26 B1's L5 kill-test:
  a `transactionsmonitor.js` relaunch event was confirmed present, then gone ~5 min later (grep came
  up empty) while the relaunch itself worked fine (confirmed via `ps`/terminal WARN). `trimLog` only
  pins the single most recent `mode` event against ordinary FIFO eviction; on a large fleet the
  batch/skip event volume can churn through the full `DAEMON_LOG_MAX_ENTRIES` (2000) ring in a few
  minutes. Not a correctness bug — supervision itself is unaffected — but it means the audit trail
  for *why* a companion needed relaunching is unreliable on exactly the fleets where it matters
  most. Candidate fix: pin the latest `companion-relaunch` alongside `mode`, or give supervisor
  events their own small file (Phase 24's "log, not dashboard" convention, just a dedicated log).
  **Not fixed here** — outside Phase 26 B1's authorized scope; revisit before leaning on this log
  for automated alerting.

- **L6 next-node entry watch (Phase 26)** — the fresh node's first unattended day is B1/B2's real
  soak (small early fleet, thin `ratchet-log.json` sample so `evalStall`'s threshold runs on
  `STALL_FALLBACK_MS`/`STALL_MIN_MS`, augfarmer's 64.1 GB likely doesn't fit for a while so B1's
  `waiting-ram` state should be the only thing the supervisor logs). **Check daily during that
  stretch:** `companion-relaunch` event count (should track real deaths only) and the `stall` block
  in `augfarmer-state.json` (age/threshold should look sane, no false positives). → phase spec's L6.

- **Observe-mode trigger flap: a fire self-clears, then re-fires every ~10 min** — firing sets
  `phase: "install-ready"`, which is not an arming phase, so the next poll clears it → re-arms →
  re-fires on a `TRIGGER_SUSTAIN_MS` loop (observed 22:42:14Z fire → :24 clear → :34 re-arm).
  **Auto mode masks it** (the latch is gated on `mode === "auto"`), so it can't affect the first
  auto fire — but it degrades the observe-mode evidence the provisional constants need. Fix
  candidate: treat `install-ready` as arm-preserving, or latch on `fired` regardless of mode.
  → Phase 25 close-out (frozen), "Resolved by L7 itself" (2).

- **viteburner dev-server silently stops auto-exporting** — after hours of clean running (no
  crash, no error), `npm run dev` can stop producing fresh `logs/` downloads while `daemon.js`
  keeps writing in-game; a full dev-server restart fixes it. **Root cause corrected 2026-07-12**
  (viteburner 0.5.3 source read): it's a **connection-liveness problem** (a half-open socket that
  still reads `ESTABLISHED`/`connected`), **not** the auto-export keypress hack as previously
  suspected — and it **can't be cleanly fixed in-plugin** (the download API is bundle-internal and
  there's no native auto-export, so "make the export programmatic instead of a fake keypress" is a
  dead end). The restart *is* the right lever; the `SessionStart` autoheal hook mitigates it,
  gap being a mid-session stall. Full diagnosis + verdict + the only "real" fix (a standalone
  liveness-aware Remote API client, off the critical path): **`docs/dev-server.md` → "Root cause &
  why the fix is restart"**. Related confirmed-and-fixed variant (stale *push* from a `git checkout`
  under the live watcher) is closed — see `docs/phases/phase-13-consolidation.closeout.md`.

- **`augfarmer.js`'s state-write gate has a dead OR-term** — found while implementing Phase 32
  (decision 12): `previousPhase = plan.phase;` runs, THEN the write gate checks
  `plan.phase !== previousPhase` — always false, since `previousPhase` was just set to `plan.phase`
  two lines up. In practice the state file only updates on the other three OR-terms (first-launch,
  the 5-min heartbeat, or a buy this pass) — a phase flip with no buy persists only via the
  heartbeat, up to 5 min late. Phase 32 added a narrowly-scoped new OR-term
  (`awaitingMoneySinceChanged`) alongside the dead one rather than fixing it — reordering the two
  lines changes write cadence for every consumer of `augfarmer-state.json`, which is real design
  surface, not a one-line phase-32 fix. **Fix candidate:** move `previousPhase = plan.phase;` to
  after the state-write block (or capture `plan.phase !== previousPhase` into a local before the
  reassignment). Not fixed here — logged per CLAUDE.md's "dropped objections get logged" rule.

- **🟡 Whether Bladeburner General actions consume stamina is UNMEASURED — the stamina guard is
  conservative because of it.** The 2026-08-02 guard
  (`updateStaminaRecovering` → `Hyperbolic Regeneration Chamber`, see the phase-38 spec's amendment
  to decision 6) parks on HRC while stamina refills. If General actions are in fact free of stamina
  cost — which `docs/bladeburner-reference.md` neither confirms nor denies for *any* action — then
  recovery time could instead run the useful end of the overhead ladder (`Incite Violence` to
  regenerate contract/op inventory, `Diplomacy`, `Recruitment`) and get the refill for free.
  **Next action:** during the 24h smoke run, read `overheadSec` against `stamina.fraction` from
  `bladeburner-state.json`; if stamina climbs at the same rate under `Recruitment`/`Diplomacy` ticks
  as under HRC ticks, drop the `staminaRecovering` short-circuit in `pickOverheadAction` and let the
  normal ladder run. Cheap to settle, pure throughput upside, no risk to the checkpoint either way.
  **Do not settle it by reasoning from upstream Bitburner behaviour** — this is a 3.0.0+ fork.

## Ideas

### Game / progression
- **🟡 PARKED 2026-08-18 — a graft budget is still UNRESERVED against the fleet.**
  `resourcemanager.js` has no graft reservation source, so `cloudmanager.js` can spend money a
  committed graft needs. This BIT once (2026-08-17: ~$1.65b of a $2.784b bankroll went to the fleet
  inside an hour while a $135m graft ran) and was handled operationally with a
  `cloud-upgrade-off.txt` pause, not structurally. Harmless right now — the BN10 entry ladder is
  finished and nothing is grafting.
  - **Revisit when:** any future plan schedules grafts again. Then add a `bn10entry-reserve.json`
    reservation source to `resourcemanager.js`, mirroring `augfarmer-reserve.json` exactly.
  - 📌 **Lesson (kept, it generalises):** when two consumers share a wallet and one is on the
    critical path, pausing the other is part of *starting* the work, not a risk to monitor.

- **🚨 Q14: does scouting a drained city restore usable success chances? (Volhaven is the test case.)**
  Volhaven reads population `0` and every action `[0.0000, 1.0000]` — **maximum uncertainty, not
  zero** — while its inventory is intact (2,727 Raids · 3,496 Undercover · 1,432 Assassinations).
  `Field Analysis` is the documented counter and is already proven here (2026-07-30: collapsed Raid's
  range from `[0.075, 0.097]` to a point value). **Next action:** occupy Volhaven, run `Field
  Analysis` repeatedly, re-run `bladeburneractionprobe.js`, and watch whether the `[min, max]` range
  narrows off `[0, 1]`. If it does, Raid is **not** a city-killer, Stage B reopens on economics, and
  a whole city is recovered. ⚠️ Needs the action slot — note that standing the engine down *releases*
  `backdoorfactions.js`/`backdoorwd.js` to grab it (they yield to the engine's hold marker), so the
  naive quiesce is backwards.
  - **⛔ MOOT 2026-08-11 — do not run this probe.** It was only ever worth the action-slot cost as a
    gate on Stage B, and Stage B closed on measurement the same day: `Raid`'s 47.03 rank/action comes
    from an estimator caught predicting **`pMin` 1.0000** for `Investigation` — a *sibling Operation* —
    against a realised **2/270 (0.74%)**. Recovering Volhaven buys access to a lever whose only number
    is untrustworthy in the same action class. Keep the entry for the **mechanic** (scouting narrows a
    `[0,1]` spread — that is still true and still unproven here), not for the Stage B rationale.
- **The engine does not rotate cities autonomously — `CITY_ROTATION_ENABLED` is `false`, deliberately.**
  Re-filed 2026-08-08 from the resolved 2026-08-03 chaos entry, where it was the one open item buried
  in a closed bug. The *mechanic* is measured and cheap (the one-off `src/switchbbcity.js` move took
  Tracking's EV/sec 0.0084 → 0.0854, 10.2×, for $0 and 0 rank), but an automatic rotation *policy* —
  when to move, anti-thrash hysteresis, and whether to prefer Chongqing's larger population over a
  lower-chaos city once chaos is controlled — is a spec-level decision. **Wake condition:** whenever
  the chaos-suppression policy is specced, since "move city" and "run Diplomacy" are the two levers
  on the same variable and should be chosen against each other, not separately. Live chaos spread as
  of 2026-08-08: Volhaven **3.5** (pop 0, unscouted) · Ishima **69.0** (pop 9.99b) · New Tokyo
  **995** · Aevum **224** · Chongqing **5,462** · Sector-12 **6,999**. → `docs/bladeburner-reference.md`
  §6's switchCity table.
- **🔧 The engine cannot scout — `Field Analysis` is absent from its action pool.** Consequence: any
  city whose intel degrades looks permanently dead to it forever (`pMin = 0`), and it will rotate
  away rather than spend two minutes fixing it. **Next action:** decide whether scouting belongs in
  the engine as a maintenance action (with a trigger on a wide `[min, max]` spread) — that is a spec
  question, not a constant tweak. **Wake condition:** immediately, if Q14 comes back positive.
- **🔑 Q13: is per-action stamina cost FLAT, or proportional to action time?** Q10 came back
  **per-action** (2026-08-06), which makes stamina the binding constraint and — if cost is flat —
  makes **rank per action** the correct objective instead of the engine's `objectiveMode:
  "per-second"`. Net of `rankLoss`, `Assassination` pays **26.96/action vs Tracking's 10.30 (2.6×)`.
  Only `Tracking` (51s) was ever measured; if cost scales with time, Assassination's 97s cancels the
  gain and nothing changes. **Next action:** run `q10probe.js` while a different-duration action is
  live and compare the drop size to 2.162 — no new code, no irreversible spend. If flat, Stage B
  reopens *for Assassination only* (never Raid — it destroys the city permanently).
- **Measure whether Bladeburner stamina REGEN scales with max stamina.** Decides whether
  `bladeburner_max_stamina` augs (I.N.T.E.R.L.I.N.K.E.D ×1.10, Blade's Runners ×1.05, Power Cells
  ×1.05) do anything; `stamina_gain` is already known to help. An attempt from
  `bladeburner-attempts.json` was too noisy to call, and the natural experiment died with install
  #43. **Next action:** re-run `q10probe.js` after max stamina has drifted materially (combat stats
  grow continuously) and compare `regenPerRestingSec`. **Wake condition:** before any Bladeburner aug
  purchase — do not buy on the strength of the reasoning alone.
- **🔺 The dropped objection from 2026-08-05 has been REVIVED by Q10 — its wake condition fired.**
  `Assassination` and `Stealth Retirement` were rejected on a **per-second** comparison (1.27× and
  1.08× Tracking) as too small to justify their failure rates. Q10 came back **per-action**
  (2026-08-06), which is precisely the condition that entry named. On the objective that now applies,
  the margin is not marginal: **Assassination 26.96 rank/action vs Tracking 10.30 — 2.6×.** This is
  the logged-objection mechanism working as designed: it returned as *evidence*, not as repetition.
  Gated behind **Q13** above — if stamina cost scales with action time, the 2.6× evaporates.
- **Phase 34's NFG revisit trigger (decision 4, parked)** — `decideInstall`'s escalation rule
  deliberately excludes NFG targets (`!targetIsNFG`): its price ladder is 2.166 not 1.9, and its
  tail is designed to run long, so arming on it would fight `spendDownPlan`'s ordering. **Wake
  condition:** a cycle observed money-blocked on NFG longer than the stall threshold — that's the
  signal the exclusion is costing real wait time and the rule needs an NFG-aware variant. Until
  then, leave as-is. → `docs/phases/phase-34-install-timing.spec.md`.
- **Gang-specific open items (gate read, NFG-vs-rep pacing, ascension cadence, territory,
  wantedPenalty/ascension-accounting mysteries) moved to
  [`docs/gang-engine.md`](docs/gang-engine.md) §6-7, 2026-07-22.** Check there, not here, for
  anything gang-related.
- **Batcher-specific open items (share/RAM-competition auto-suppress, core-aware grow/weaken
  sizing, per-target realized-income/prep-duration logging, daemon.js/scheduler.js comment sweep)
  moved to [`docs/batcher-engine.md`](docs/batcher-engine.md) §4, 2026-07-22.** Check there, not
  here, for anything batcher-related.
- **Coding contracts** (Phase 19, brainstorm only — nothing decided). Blocking question is
  Kenneth's, not technical: who writes the solvers (demand-driven / Kenneth-solves /
  bulk-delegated). Also a candidate Daedalus-rep accelerator. **Next:** run the cheap RAM probe
  first — does `contract.submit()` dodge `attempt`'s 10 GB charge? — it can invalidate the
  single-script architecture. → `docs/phases/unshipped/phase-19-contracts.features.md`.
- **Augment breadth-vs-depth, narrowed (Phase 25)** — the original v1 tension (shallow rep spread
  across many factions banking favor slower than concentrating on one) is now addressed: S4's camp
  commitment concentrates city-faction joining, and S6's generalized donation route lets a faction
  banking favor fast buy past a slow grind. What remains, if anything, is Daedalus-endgame-specific
  (still the manual runbook, `docs/reset-protocol.md`) — parked with that endgame, not a v1 concern.
- **~~Stage-2 first auto-fire (Phase 25 S11/S2)~~ — DONE 2026-07-17, install #6.** Ran
  end-to-end unmodified on the first attempt; every step of the cycle is now proven, including
  the three that had never run in any form (spend-down, `installer.js` exec, the install itself)
  plus home-cores (1 → 4). `mults.hacking` 1.632 → 1.839, `hacking_exp` 1.704 → 2.823, Daedalus
  gate 8 → 15/30; recovery rejoined 7 factions and hit hacking 494 within 5 min. **`auto` is
  still ON** — it fires again every cycle (~4-8h) unattended; decide whether to leave it.
  → **[`docs/phases/phase-25-faction-strategy.closeout.md`](docs/phases/phase-25-faction-strategy.closeout.md)**.
- **~~Spend-down logs projected prices / NFG seller by catalog order (Phase 25 gaps 5+6)~~ — FIXED
  2026-07-17 (`4b80da4`).** `pickNfgSeller()` now picks the joined seller with the most rep, and
  the buy path logs the live price read immediately before purchase (keeping the projection as
  `projected`). 584 tests pass; augfarmer RAM unchanged at 64.10 GB; shipped live mid-cycle via
  `restart daemon.js`. (5) is validated live; **(6) is unproven until the next fire** — it only
  runs during spend-down.
- **~~Measure the real NFG price ladder, then fix `nfgLevelsProjected`~~ — DONE 2026-07-17
  (`fix/nfg-ladder-measured`).** Install #8's 11-level spend-down logged a dead-constant paid
  ratio of **2.166** (not the old eyeball 1.9, nor my ~2.28 guess); `NFG_PRICE_LADDER` is set to
  it. `nfgLevelsProjected`'s `(L-1)` numerator factor had been the literal 0.9 — coupled to the
  old ladder — so it now reads `(NFG_PRICE_LADDER - 1)` and both move together. Validated:
  predicts 11 for install #8 (old formula said 13); live projection dropped 17 → 14 on the
  restart. That was gap 1's root cause — `totalGain` is now honest, so `MIN_TOTAL_GAIN` behaves
  as intended. 584 tests; shipped live via `restart daemon.js`. (Boundary stress-test of the
  guard still wants a real low-gain arm, but that's all that's left of gap 1.)

### Tooling & infra
- **CDP driver → MCP server** — wrap `tools/bb/driver.mjs` in an MCP so the helpers become native
  tools (no `node tools/bb/cli.mjs …` Bash indirection, nicer typing, parallelizable). Pure
  ergonomics, not a prerequisite. **Build when** the Bash-call friction starts to bite; build by
  importing `driver.mjs` (don't fork it). An MCP loads at Claude Code startup → usable *next*
  session, never retroactively.
- **Export sync/game errors to `logs/`** — when viteburner sync breaks it prints to the `npm run
  dev` terminal, where copy/paste is lossy. Capture it Node-side (tee dev-server stdout/stderr,
  or a `vite.config.ts` hook) — the in-game→`logs/` bridge is exactly what's down at that moment,
  so an `ns.write` can't carry it out. Easier sub-case: `try/catch` in-game runtime errors →
  `ns.write` the normal way.
- **Validate `upgradeHomeCores` Singularity call — STILL OPEN** — `installer.js:86` is the **only**
  call site and it runs in auto mode only, so no hand-run shortcut exists (unlike RAM, there is no
  `upgradehomecores.js`). The first auto fire exercises it cold; watch for a `home-cores-upgrade`
  transaction on Phase 25's L7 checklist. Sibling `upgradeHomeRam` **validated 2026-07-16** — 5
  `home-ram-upgrade` records, $1.46T, home 2 TB → 64 TB, via a hand-run `upgradehomeram.js` during
  a manual spend-down (its no-reserve `while money >= cost` drain is harmless exactly there, since
  an install wipes money anyway — don't run it while the farmer is banking for a target).
- **`saves/index.mjs` generator** — scan `saves/`, decode each file's BN/SF/hacking/money via
  `tools/save/savelib.mjs`, regenerate `saves/INDEX.md`. Parked; hand-maintaining ~8 rows is
  fine. **Revisit when** the save count grows enough that manual upkeep hurts.

### Claude Code workflow (outside brainstorm, 2026-07-22)
Not sourced from a repo session — came out of a conversation elsewhere comparing what's
already built here (multi-model phase pipeline, `spec-reviewer` subagent, worktrees, the
SessionStart autoheal hook) against Claude Code capabilities that aren't in use yet. Flagged
for a future brainstorm pass, not scoped or spec'd.

- **Autonomous liveness watch — detection/logging half SHIPPED (Phase 35 WI6, 2026-07-26);
  delivery half still open.** Rewritten again per Phase 35 spec decision 10. `goallog.js`'s
  `evalStuck` now computes the verdict every poll (`daemon-dead`/`starved`/`reservation-pin`/
  `idle`/`boundary-overrun` signatures) and `goal-state.json` + the GOAL panel's one liveness line
  make it a one-glance read **in-session** — the 21.7h-of-unread-`STALLED` failure this entry
  describes becomes a one-line read instead of a multi-file log dig. **What's still missing:
  nothing PUSHES the verdict, and nothing reads it while no session is open** — an overnight STUCK
  is still only *seen* at the next session open. Kenneth explicitly held off building that at spec
  review 2026-07-26 ("no noisy alerting, no external automation this phase — logging the
  discrepancy is fine").
  - **Mechanism correction (supersedes the original "only a `/schedule` routine survives it"
    claim):** a `/schedule` cloud routine survives session death, but it runs in a **cloud clone of
    the GitHub repo** — it cannot read the live `logs/` directory on Kenneth's machine, where every
    signal this needs lands (none of `logs/` is pushed continuously). The mechanism that both
    survives sessions *and* sees the data is an **OS scheduler job on the always-on machine**
    (sleep is disabled — see the sleep-not-grind reference). The claim was half-right: in-session
    tooling does die overnight, but the proposed replacement couldn't have worked either.
  - **Wake conditions (unchanged bar):** another stall that sits unread across a no-session gap
    (the predicted failure recurring — both prior incidents, 11h and 53h, were exactly this shape),
    or Kenneth opting in.
  - **When this reopens:** build an OS-scheduler job that reads `goal-state.json`'s `liveness`
    block and pushes on `STUCK`/`boundary-overrun` (not `BOUNDARY`, which is expected). The
    detection logic already exists — this is a delivery mechanism only, not new analysis.
- **Hooks beyond SessionStart** — only one hook exists (`dev-server-autoheal.sh`). Two documented
  CLAUDE.md rules are currently enforced by attention, not tooling, and both are hook-shaped: (a)
  "never `git checkout`/switch while the game is connected" (PreToolUse block while `npm run dev`
  is confirmed running), (b) the RAM-analyzer identifier footgun (property/variable names that
  shadow real `ns.*` methods — `share`, `ls`, `exec`, etc.) — a PreToolUse grep on an Edit's diff
  could flag a risky name before it lands instead of after a surprising `ramcheck.js` reading.
- **Package the brainstorm→spec→review→implement loop as a Skill, not CLAUDE.md prose** — the
  three-stage workflow (`## Development workflow`) currently depends on Claude re-reading and
  correctly applying a paragraph in a long file each time. A `.claude/skills/phase-workflow/`
  skill makes it directly invocable and testable independent of whatever else is in context that
  session.
- **Workflow-tool fan-out before brainstorming, targeting the Phase 27 failure mode** — the "read
  the whole interface before designing against it" CLAUDE.md section documents a real cost: a
  brainstorm doc built on one partially-read API file, invalidated three times before anyone
  re-read the source. A multi-agent parallel read (one agent per relevant `markdown/`/`docs/`
  file, synthesized before the brainstorm starts) targets exactly that skim-and-assume failure
  mode structurally, rather than relying on the "read it all first" rule being followed by
  habit.
- **Adversarial review for solo deliberation, not just spec review** — `spec-reviewer` already
  does cold-context review before implementation; the same pattern (independent Claude instance,
  no prior context, poking holes) isn't currently used *during* open-ended deliberation — e.g.
  the four-day gang-decision circling that the "…and then converge" rules were added to fix
  after the fact. A second perspective spun up mid-deliberation, not just pre-ship, is the
  earlier-intervention version of the same fix.
- **`project-manager` agent — v1 SHIPPED 2026-08-04 (`/pm`); v2/v3 open.** Came out of a
  brainstorm on losing situational awareness as the repo grew. Diagnosis worth keeping: the
  reported symptom ("can't tell if we're on target") was **three** problems — (A) goal state
  buried in CLAUDE.md's 667 lines, (B) no visibility into what the game did while away, (C)
  ~4,800 lines of required reading before any session starts. The originally-proposed fix (a
  `projectmanager/` notes directory) was rejected because it makes (C) strictly worse and adds a
  fifth home for the fastest-rotting content in the repo. v1 is instead a **cold-context,
  read-only auditor** that reports contradictions between tracking artifacts — never advice —
  capped at ~25 lines, on a deliberately bounded read list.
  - **v2 — extract the goal state out of `CLAUDE.md` into a one-screen `docs/project-state.md`
    the agent owns.** Attacks (A) and (C) together; it's a *move*, not a new store. The blocker
    is deciding what in the "Working with Kenneth" section is current state vs. superseded
    decision trail that belongs in `docs/bn6-playbook.md` — that split is the actual work.
  - **v3 — feed it live telemetry so it answers (B), the thing Kenneth cares most about.**
    Deliberately deferred from v1 so the report format proves useful before anyone aggregates
    155 files in `logs/`. ⚠️ **Overlaps the autonomous-liveness-watch entry above and should be
    designed with it, not beside it** — both want "read live state while no session is open",
    and that entry already records the correction that a `/schedule` cloud routine *cannot* see
    the local `logs/` dir (it runs on a cloud clone of the repo). Same OS-scheduler conclusion
    applies here.
  - **Open questions (unresolved, no default set):** (1) **who fires it and when** — session
    start is likely too often since drift accrues over days, not turns; manual `/pm` plus phase
    boundaries is the instinct, but it wants a few runs of evidence first. (2) **Does it get
    authority to *delete*?** v1 is read-only, which sidesteps this — but half the value is
    closing stale bugs, graduating shipped phase docs, and cutting superseded decisions out of
    CLAUDE.md, and none of that happens without a write grant that is bigger than it sounds.
  - **Known weakening, accepted at build time:** the agent holds `Bash` (unlike `spec-reviewer`,
    which is `Read, Glob, Grep`) because `git log` drives the commit-vs-doc drift checks — half
    its value. So read-only is enforced by **instruction, not by tool restriction**. Revisit if
    a read-only git affordance appears.

### Repo & workflow hygiene
- **Repo decluttering** — root is the low-risk win (viteburner only watches `src/**`, so ~25 loose
  root items move freely into `docs/`/`reference/`/`saves/`; Phase 21 already consolidated
  `saves/`). A `src/` subfolder split is *not* light — it rewrites relative imports, the
  `WORKER_SCRIPTS`/`SHARE_SCRIPT` in-game-filename constants, and every script's in-game path
  (RAM gate + live daemon session). Zero-risk alternative that still fixes "tell what is what": a
  role-map (`src/README.md`) instead of moving anything. If a split ever happens, the seam is
  library-vs-entrypoint — fold it into a refactor, not a standalone tidy.
- **Brainstorm brief** (spec-review loop, optional Step 8) — have the opus brainstorm end by
  writing `phase-NN-slug.features.md` itself, so even the opus→fable handoff is a file, not a
  re-paste. Rest of the loop shipped (Phase 14).

## Reference (not backlog — mechanics captured for a future design pass)

- **Stock market** (`ns.stock`) — full API/mechanics/gates reference + engine design considerations: [docs/stock-engine.md](docs/stock-engine.md) (consolidated 2026-07-22; both remaining open questions resolved at an install boundary 2026-07-23 — access survives installs, **stock capital does not, by any route**).
- **Darknet** (`ns.dnet`) — access chain, network volatility, three extraction paths: [docs/darknet.md](docs/darknet.md).

## Done

Completed phases and one-off changes move to the changelog (condensed there, full story in
each phase doc): **[docs/phases/CHANGELOG.md](docs/phases/CHANGELOG.md)**.
