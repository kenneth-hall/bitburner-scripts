# Phase 27 spec: gang manager Tier 1 — recruit + task-assign (`gangmanager.js`)

## Context

Work in `C:\Users\admin\bitburner-scripts`. Requirements: `phase-27-gang.features.md` — read it
first; this spec assumes it, including the scope decision (**Tier 1 only**: recruit + task-assign;
equipment/ascension/territory are future phases), the RAM decisions (reserve-don't-disable;
`HOME_RESERVE_GB` 80 → 100; run `gangmanager.js` as a daemon-launched home companion), greedy
recruitment, and log-only observability (no dashboard panel — Phase 24 gate, decided in the
brainstorm). Foundation docs: `docs/archive/gang-api.md` (full API surface + measured task table) and
`logs/gangprobe-1784473065811.json` (live static dump, `errors: []`).

Game state this spec was drafted against (measured 2026-07-19, ~8:45 PM):

| Fact | Value | Source |
|---|---|---|
| Gang | NiteSec, `isHacking: true`, respect 1, territory 14.3%, **0 members** | features file / gangcreate log |
| Home RAM | **32.00 GB total, 0.90 GB free** | live `free` over CDP |
| Fleet | 33,196 GB total (one 32 TB cloud server dominates) | `logs/daemon-status.json` |
| Money | $4.738b | live `stats` over CDP |
| Hacking | 357 | live `stats` over CDP |
| Formulas.exe | not owned — $5b cost, `procureformulas.js` buys at hacking > 400 | `resourcemanager.js` constants |
| Aug-ratchet | **dormant** — `augfarmer.js` (64.10 GB) can't fit, no installs happening in BN2 | daemon INFO skips, BACKLOG |

**Prominent flag 1 — the features' RAM decision has an unstated live prerequisite.** "Run
`gangmanager.js` inside the home reserve" cannot execute on today's home: 32 GB total, 0.90 GB
free. No reserve constant fixes that — the reserve is a *batcher hold-back*, not a RAM source, and
home max (32) is already below even the old reserve (80). A ~13 GB resident needs a **home RAM
purchase first** (L1). This is a deviation from the features file's implicit "just bump the
constant and launch," flagged here per CLAUDE.md rather than folded in silently.

**Prominent flag 2 — the home-RAM tier choice is strategic, and 64 GB is chosen deliberately.**
At ≥128 GB home, `augfarmer.js` (64.10 GB) starts fitting, and the aug-ratchet **wakes up in
BN2**: it immediately starts spending free money on NiteSec-catalog augs and, on trigger, installs
— wiping the money pile that is currently $270m short of Formulas.exe ($5b), which is itself the
gang manager's own most valuable future input (exact yield formulas). Waking the ratchet in BN2 is
a real strategic decision Kenneth has not made. **This spec buys exactly one tier (32 → 64 GB),
which fits the Tier 1 priority set — at the cost of displacing the lowest-value residents,
decided explicitly in S6's census — while keeping `augfarmer.js` unlaunchable by
construction** (it needs 64.10 GB *free*; a 64 GB home can never provide that). The ratchet-wake
decision is logged as open question 2 with a default and a date — not made here.

**Audience note:** the implementer does everything marked **[code]**. Kenneth does everything
marked **[live]** — except daemon/companion restarts, story-popup dismissal, and (per the
game-progression pre-authorization) the home-RAM purchase, all of which Claude may do over CDP.
No [live] step requires editing code.

## Ground rules

- `CLAUDE.md` rules apply. **New `ns` surface is confined to `gangmanager.js`** — `daemon.js`
  gains one array string + one `launchDetached` call-site (no new `ns` calls; RAM stays
  **16.30 GB** flat), `hosts.js` changes one constant. Any daemon/hosts RAM movement ⇒ stop and
  run the identifier-hygiene audit first, not "cost of the feature."
- **No imports in `gangmanager.js`** — the import-bleed rule (a `tprintTs` import from
  `common.js` would charge its whole `ns` surface). Local few-line `ts()` and ring-trim
  helpers instead, mirroring `xpfarm.js`'s local-copy precedent.
- **No Singularity calls anywhere in this phase** (`ns.gang.*` is not Singularity). No change to
  the isolation story.
- **Transactions log: Tier 1 has no spend paths, so no `recordTransaction` sites.**
  `recruitMember` costs respect (not money), `setMemberTask` is free. The Tier boundary doubles
  as a rail: `gangmanager.js` must contain **zero** references to `purchaseEquipment` /
  `ascendMember` / `setTerritoryWarfare` (grep-checkable; those are Tiers 2–4 and each carries
  its own RAM cost the analyzer would bill on mere mention). The one-way `recruitMember` warning
  from the features file (no fire/remove call exists) is restated at the point of use in the
  script header.
- **Identifier hygiene, pre-checked for planned names:** `MONEY_LADDER`, `SINK_TASK`,
  `SINK_ENTER_DEVIATION`, `SINK_EXIT_DEVIATION`, `EVAL_TICKS`, `PROBE_TICKS`,
  `RETRY_STAT_GROWTH`, `STATE_WRITE_TICKS`, `GANG_STATE_FILE`, `GANG_LOG_FILE`,
  `GANG_LOG_MAX_ENTRIES`, `GANG_OFF_MARKER`, `planAssignments`, `evalPromotion`, `evalSink`,
  `nextRecruitName`, `weightedStat`, `sinkMode`, `baselinePenalty`, `probeState`, `desiredTask`,
  `bonusMs` — none collides with an `ns.*` method/property reachable from any namespace.
  **Mandatory bracket notation for the six member/gang stat fields** — `GangMemberInfo` exposes
  literal fields named `hack`, `str`, `def`, `dex`, `agi`, `cha`, and `hack` *is* a real
  charged `ns` method (0.10 GB): every access is `m["hack"]`-style, all six for uniformity, plus
  any other field whose name shadows an `ns` method. The implementer re-runs the check on any
  name added during implementation. Known-dangerous short names (`ls`, `ps`, `rm`, `run`,
  `kill`, `read`, `write`, `scan`, `hack`, `grow`, `share`, `exec`, `tail`) stay out of locals.
- **Observability: logs only, no dashboard edits** (features decision). Two new exported files
  (S8) ⇒ two new `vite.config.ts` `download.location` lines — an authorized exception to "no
  export changes," since Tier 1's entire observability story is these files. `dashboard.js`
  untouched.
- **This build's API only:** every `ns.gang.*` signature used is verified against
  `markdown/bitburner.gang.md` / `docs/archive/gang-api.md` at implementation time, not recalled from
  upstream. Formatting via `ns.format.*` if needed (not `ns.formatNumber`).
- One branch (`phase27-gang-tier1`) — unlike Phase 26 there is no endgame fuse to sequence
  around; the reserve bump is inert below an 80 GB home and the new companion is additive.
  `npm test` the implementer runs and clears; RAM readings and live observation ride Kenneth's
  session (restarts are Claude-over-CDP). BACKLOG/CHANGELOG edits ride the same branch. Before
  merge, the CLAUDE.md worktree checks (`git log HEAD..master`).

## Spec-stage decisions

- **S1 — Task policy: measured ladder-climb, not a computed stat-readiness threshold.** This
  resolves features open question 3. The features' default direction ("stat-readiness check…
  exact thresholds need the weight-table math") turns out to be **unresolvable as stated**:
  without Formulas.exe the *functional form* combining weights, difficulty, and stats into yield
  is unknown (docs/archive/gang-api.md, "Without Formulas.exe"), so any absolute readiness constant
  (e.g. "weightedStat ≥ k × difficulty") would be an invented number — exactly the class of
  fabricated threshold the gang-api doc warns against. What IS exact without Formulas is the
  per-member **actuals**: `GangMemberInfo.moneyGain` / `.respectGain` / `.wantedLevelGain` report
  the member's current true rates. So the policy measures instead of predicts:
  - `MONEY_LADDER = ["Ransomware", "Phishing", "Identity Theft", "Fraud & Counterfeiting",
    "Money Laundering"]` — the five money-earning tasks in measured difficulty order.
    Excluded, with reasons: DDoS Attacks / Plant Virus (zero money — respect-only, and Tier 1's
    respect budget is a byproduct, not a target), Cyberterrorism (features decision: out of
    Tier 1 entirely), Train Hacking / Charisma / Combat (zero yield, exp function unknown; the
    ladder tasks all produce `expGain` anyway — see open question 5's wake-up), Territory
    Warfare (Tier 4), Unassigned (the failure state, never assigned).
  - **New member → Ransomware** (rung 0). If recruited during sink mode (S2) → `SINK_TASK`
    until sink exits, then Ransomware.
  - **Promotion probe (per member):** every `EVAL_TICKS` (30 ticks; a tick = one
    `nextUpdate` resolution, 2–5s gang-time) with sink mode off, take the member's baseline =
    mean of the last `PROBE_TICKS` (5) `moneyGain` reads on the current rung, assign rung + 1,
    read `moneyGain` for `PROBE_TICKS` ticks, and keep the higher: **strictly better mean ⇒
    promoted; else revert** and record the member's `weightedStat` for that rung (Σ task-weight
    × stat / 100, weights read live from `getTaskStats` at startup — the one use the weight
    table has without Formulas: a *relative* growth meter, never an absolute threshold).
  - **Demotion cooldown:** a failed probe at rung i+1 is not retried until the member's
    `weightedStat` for that task has grown to `RETRY_STAT_GROWTH` (1.25×) the value recorded at
    the failure — growth-gated, not time-gated, so bonus-time acceleration and slow periods both
    behave. All three constants (`EVAL_TICKS`, `PROBE_TICKS`, `RETRY_STAT_GROWTH`) are
    provisional by design and ride into every promote/demote log event, per the Phase 25
    convention.
  - Probe comparisons happen within a ≤10-tick window, so `wantedPenalty` drift across the
    comparison is negligible by construction; probes are additionally suppressed whenever the
    sink hysteresis (S2) is outside its healthy band.
- **S2 — Wanted watchdog: global sink-mode hysteresis on `wantedPenalty` deviation, form-
  agnostic.** Resolves the features' "threshold TBD via `wantedPenalty`". `wantedPenalty`'s
  numeric form (multiplier vs. fraction; direction) is undocumented — so thresholds are defined
  against **deviation from a captured baseline**, which is correct under any form:
  - `baselinePenalty` := the `wantedPenalty` observed at the **lowest `wantedLevel` seen so
    far** — captured on the manager's first tick (a fresh gang sits at the wanted floor, so
    the initial capture is the true baseline) and **updated whenever a new minimum
    `wantedLevel` is observed**. Persisted in the state file (with its `wantedLevel`) and
    restored on restart, so a restart mid-high-wanted can't re-baseline against a degraded
    value; if the state file is missing/unreadable on a non-fresh gang, the startup capture
    is flagged with a `rebaseline` log event and **self-heals** as wanted drains to a new
    observed minimum (cold-review note addressed: the non-fresh fallback is defined, not
    undefined).
  - `deviation := |wantedPenalty − baselinePenalty| / max(|baselinePenalty|, 1)` — the
    denominator floor makes the ratio zero-safe (cold-review blocker 2): in multiplier-form
    (baseline ≈ 1) this is the relative deviation as before; in fraction-form (baseline ≈ 0,
    where the naive ratio divides by zero) it degrades to absolute deviation. Correct
    direction and no NaN/Infinity under either undocumented form.
  - **Sink ON** when `deviation ≥ SINK_ENTER_DEVIATION` (0.02, i.e. 2% productivity
    deviation): every member → `SINK_TASK = "Ethical Hacking"` (dominates Vigilante Justice —
    features/API doc: same −0.001 wanted, more money, higher hack weight).
  - **Sink OFF** when `deviation ≤ SINK_EXIT_DEVIATION` (0.005): members resume their prior
    ladder rungs (remembered in `probeState`, persisted per S7).
  - Hysteresis (0.02 in / 0.005 out) prevents flapping; both constants provisional, logged in
    every `sink-enter`/`sink-exit` event alongside raw `wantedLevel`, `wantedPenalty`, and
    `baselinePenalty` so the first live data can recalibrate them.
  - **Known asymmetry, accepted for v1:** the measured base rates are Money Laundering
    +1.25 wanted/tick vs Ethical Hacking −0.001 — if actual (post-scaling) rates keep that
    ratio, sink mode will be slow to drain and the duty cycle will show it. The logs measure
    exactly this; open question 5 carries the wake-up. No pre-emptive policy complexity.
- **S3 — Recruitment: greedy, tick-gated, deterministic names.** (Features-decided; mechanics
  set here.) Each tick, while `canRecruitMember()` is true: `recruitMember(nextRecruitName())`
  with names `nite-01`, `nite-02`, … derived from the existing `getMemberNames()` set; on a
  `false` return (name collision / cap race) advance the suffix and retry next tick — never
  spin. The undocumented member cap needs no handling beyond `canRecruitMember()` going false
  (features decision). Each success logs a `recruit` event. Recruiting is **one-way** (no
  remove/fire API) — restated in the header.
- **S4 — Loop cadence: `await ns.gang.nextUpdate()` (0 GB), not a sleep interval.** The game's
  own tick, per docs/archive/gang-api.md ("don't invent a polling interval"). All policy windows
  (`EVAL_TICKS`, `PROBE_TICKS`, state-write cadence) count **ticks, not wall-clock**, so
  bonus-time acceleration (up to 25×) speeds the policy up in lockstep with the gang instead of
  desynchronizing it. `getBonusTime()` (0 GB) is read each tick and logged in the state file —
  rate anomalies in the logs must be attributable to bonus time without a live look.
- **S5 — No Formulas.exe dependency, but Formulas-readiness is logged.** (Features open
  question 4, resolved for this phase.) Tier 1 uses no `ns.formulas.*` call — the measured
  policy (S1) needs none, and adding formulas calls now would charge RAM for a file we don't
  own. But Formulas is *imminent*, not remote ($4.738b of $5b held; `procureformulas.js` buys
  automatically once hacking > 400, currently 357), so the state file carries
  `formulasAvailable` (`ns.fileExists("Formulas.exe")`, checked once per state write) — the
  logged flip is open question 4's wake-up datum, timestamped for free.
- **S6 — RAM & placement: home resident inside the reserve; `HOME_RESERVE_GB` 80 → 100; home
  bought to exactly 64 GB first.** The features decided the reserve mechanism and the 100
  figure; this decision adds the discovered prerequisite and the tier arithmetic:
  - **Predicted `gangmanager.js` footprint ~12.7 GB:** base 1.6 + `canRecruitMember` 1 +
    `recruitMember` 2 + `getGangInformation` 2 + `getMemberNames` 1 + `getMemberInformation` 2
    + `setMemberTask` 2 + `getTaskStats` 1 + `getTaskNames`/`nextUpdate`/`getBonusTime`/
    `inGang` 0 + `fileExists` 0.1. Dropped to stay lean: `respectForNextRecruit` and
    `getRecruitsAvailable` (redundant — `GangGenInfo` already carries the former;
    `canRecruitMember` is the only gate the loop needs).
  - **Fit arithmetic at 64 GB home — the full census, not just the visible residents** (cold
    review blocker 1: the scripts skipping today for lack of room also start consuming the
    enlarged home, including three Singularity companions the first draft omitted):

    | Script | GB | Basis | At 64 GB |
    |---|---|---|---|
    | daemon.js | 16.30 | measured (ramcheck 2026-07-19) | resident |
    | transactionsmonitor + resourcemanager + cloudmanager + dashboard | 14.80 | measured aggregate (31.10 live total − daemon) | resident |
    | gangmanager.js | ~12.7 | derived (this spec) | resident — **priority slot, see below** |
    | procureformulas.js | ~3 | derived from its `ns` surface | resident until Formulas bought — **required** (S5/OQ4's auto-buy path) |
    | xpfarm.js | 5.85 | header/daemon skip line | resident if the census holds |
    | backdoorfactions.js | 11 | measured (2026-07-12 ramcheck, its header) | resident until run4theh111z (~hacking 505) — likely fits, first designated displacee if not |
    | ratchetlog.js | 10.10 | daemon skip line | **intended skip** — zero value while the ratchet is dormant (records install boundaries; there are no installs) |
    | backdoorwd.js | ~8 | derived from its `ns` surface | **intended skip** — zero value until The Red Pill exists |
    | augfarmer.js | 64.10 | measured | **can never fit** (needs 64.10 *free*) — by design, Prominent flag 2 |

    Wanted-now sum (through backdoorfactions): **~63.7 of 64 — nominal fit, zero real
    margin.** The spec therefore does not pretend the whole set fits; it decides who wins:
    - **Priority placement:** `gangmanager.js` is inserted **directly after `cloudmanager.js`**
      in both the startup launch block **and** `RESIDENT_COMPANIONS` (supervisor relaunch
      contention follows list order) — the phase's primary gate cannot be the script that
      loses the RAM race. At its launch position ~27.6 GB is in use, so its own fit is
      guaranteed with wide margin. Launch order for everything else is unchanged
      (backdoorfactions keeps its early slot — reordering it would degrade fresh-node faction
      unlocks on every future node).
    - **Designated displacees, in order, all self-healing** (supervisor `waiting-ram` for
      residents; next-restart for the self-terminating class): `backdoorwd.js` and
      `ratchetlog.js` (both zero-value in current BN2 state, see table), then
      `backdoorfactions.js`, then `xpfarm.js` — each displacement is an INFO-level
      non-event, documented here so nobody debugs it as a bug. If even `xpfarm.js` is
      displaced, that costs the XP engine — acceptable short-term, but it feeds the census
      gate below.
    - **Census gate [code → live]:** at implementation end, run a `ramcheck.js` pass covering
      **every** companion in the table (extend its script list if needed) and record the
      planned-resident sum. The gate's number is the **full intended-resident sum** — daemon
      through backdoorfactions in the table, i.e. everything except the intended-skips
      (ratchetlog, backdoorwd, augfarmer). If that measured sum exceeds **63.5 GB**: first
      drop `getTaskStats` from `gangmanager.js` (hardcode the five ladder tasks' weights from
      the probe-validated `logs/gangprobe-1784473065811.json` — −1 GB, and the weights are
      static game data the probe already verified live); if it still exceeds, accept the
      xpfarm displacement and record it in the close-out. Only if the sum busts with xpfarm
      *and* backdoorfactions both displaced does this escalate to Kenneth (that would mean
      the estimates were badly wrong — stop, don't improvise).
    - **`gangmanager.js` acceptance band 10–14.0 GB** (predicted ~12.7, or ~11.7 without
      `getTaskStats`); a reading near 2× predicted ⇒ identifier-hygiene audit before
      anything else.
  - **Reserve 100 of a 64 GB home = the whole home is companion territory** — the batcher gets
    0 from home either way (it already does at 32/80), so batcher behavior is strictly
    unchanged by this phase; the 100 only starts mattering if home ever exceeds it (the
    ratchet-wake decision, open question 2). `hosts.js` comment updated with this phase's
    rationale; `bootstrap.js`'s "below an 80GB home" comment updated to 100.
  - **Do NOT use `upgradehomeram.js` for L1** — its `while money >= cost` drain is unbounded
    and would eat multiple doublings out of the $4.738b Formulas fund. The buy is one UI/CDP
    purchase of exactly one tier (32 → 64), with a price sanity guard in L1.
- **S7 — Restart/install resilience: rebuild from game state, persist only the baseline.** The
  manager will be killed by any future install and by daemon restarts; the gang itself survives
  installs (install-immunity, docs/archive/gang-api.md). On startup:
  - `inGang()` false ⇒ ERROR tprint + exit (can't happen with a permanent gang; fail loud, not
    silent).
  - **Validate** `MONEY_LADDER` + `SINK_TASK` ⊆ `getTaskNames()`; any miss ⇒ ERROR tprint +
    exit. This guards the API's nastiest foot-gun: an invalid name in `setMemberTask` silently
    sets "Unassigned" (docs/archive/gang-api.md) — fail loud at startup instead of idling members
    silently forever.
  - Read own `gang-state.json` if present: restore `baselinePenalty` (+ its `wantedLevel`,
    S2), `sinkMode`, and **each member's `rung`** (matched by name; unknown or new names fall
    through to the live rebuild). The rung restore matters most when the restart lands
    **during sink mode** (cold review blocker 3): every member is then on `SINK_TASK` — an
    off-policy task — and a rebuild-only rule would silently reset the whole gang to rung 0
    and force a full `EVAL_TICKS`-gated re-climb on every routine daemon restart. With the
    restore, sink-exit resumes the remembered rungs. The state file already carries all these
    fields (S8) — this is a read-back, not new machinery.
  - Live rebuild (no state file, or unmatched member): members on a known ladder task keep it
    as their rung; members "Unassigned" or on any off-policy task are assigned per policy at
    the first eval. Probe cooldowns (`probeState`'s failure markers) remain in-memory-only;
    their loss costs at most one redundant probe per member per restart — accepted.
  - **Manual-control lever:** `gang-off.txt` on home (checked per tick, mirrors `xp-off.txt`)
    suppresses ALL actions (recruit + setMemberTask) while the loop keeps observing and
    logging. This is also the sanctioned way for Kenneth to hand-drive members — the manager
    otherwise owns every member and reconciles off-policy tasks away (single-owner principle;
    two uncoordinated writers of `setMemberTask` is the alternative, and it's worse).
- **S8 — Observability: two files, Phase 24 pattern.**
  - `gang-state.json` — overwrite-in-place snapshot every `STATE_WRITE_TICKS` (10) and on any
    event: `{timestamp, time, respect, respectGainRate, moneyGainRate, wantedLevel,
    wantedPenalty, baselinePenalty, baselineWantedLevel, sinkMode, territory, memberCount,
    bonusMs, formulasAvailable, offMarker, members: [{name, task, desiredTask, rung, stats
    (bracket-read six), moneyGain, respectGain, wantedLevelGain}]}`. This file doubles as the
    restart-persistence source (S7 restores `baselinePenalty`/`baselineWantedLevel`,
    `sinkMode`, and per-member `rung` from it) — snapshot and persistence are deliberately one
    write, not two mechanisms.
  - `gang-log.json` — ring-capped (`GANG_LOG_MAX_ENTRIES` 2000, local trim helper) event log:
    `recruit`, `promote`, `demote` (failed probe), `sink-enter`, `sink-exit`, `startup`,
    `off-marker` (toggle observed). Every policy event carries the provisional constants that
    produced it (Phase 25 convention).
  - Both added to `vite.config.ts`'s `download.location` with Phase 27 comments. Dashboard: no
    change (decided in features; the state file makes a future panel a rendering-only
    follow-up behind its own brainstorm decision).
- **S9 — Daemon integration: resident companion in the priority slot.** `daemon.js`:
  `launchDetached(ns, "gangmanager.js")` inserted **directly after `cloudmanager.js`** in the
  startup block, and `"gangmanager.js"` inserted after `"cloudmanager.js"` in
  `RESIDENT_COMPANIONS` — both per S6's census (the phase gate takes the priority slot; the
  supervisor's relaunch contention follows list order, so both sites must agree). A short
  comment at the launch site carries the census rationale. All other launch lines keep their
  order. No new `ns` surface in daemon.js ⇒ RAM stays 16.30 GB flat.
- **S10 — Test plan (vitest, pure-function level, `test/gangmanager.test.js` + updates).**
  - `planAssignments`: fresh member ⇒ Ransomware; sink on ⇒ every member's desired task is
    `SINK_TASK`; sink off after sink ⇒ members resume remembered rungs; desired == current ⇒
    empty op list (no redundant `setMemberTask`); "Unassigned"/off-policy member ⇒ reconciled
    to policy; off-marker set ⇒ empty op list regardless; **restart-during-sink fixture:
    persisted `{sinkMode: true, rungs}` restored ⇒ members stay on `SINK_TASK` and sink-exit
    resumes the persisted rungs, not rung 0** (S7 / cold review blocker 3); persisted state
    naming a member that no longer exists ⇒ ignored, live rebuild for the rest.
  - `evalPromotion`: strictly-better probe mean ⇒ promote; equal or worse ⇒ revert + cooldown
    recorded; cooldown holds until `weightedStat` ≥ 1.25× recorded failure value, releases
    after; no probes while sink mode on; top rung ⇒ no probe; probe interrupted by sink-enter
    ⇒ member reverts to pre-probe rung (no stranded probes).
  - `evalSink`: enter at deviation ≥ 0.02, not at 0.019 (boundary); exit at ≤ 0.005, not at
    0.006; no flap across a healthy series; baseline restored from persisted state ⇒ same
    thresholds; **multiplier-form fixture (baseline ≈ 1) behaves as relative deviation and
    fraction-form fixture (baseline = 0) produces finite absolute-deviation values — the
    zero-baseline case must not yield NaN/Infinity** (the S2 denominator floor is the tested
    property); baseline updates on a new minimum `wantedLevel` and not otherwise; missing
    state file on a non-fresh fixture ⇒ `rebaseline` event emitted and later min-tracking
    lowers the baseline (the self-heal).
  - `nextRecruitName`: fills gaps deterministically, collision ⇒ next suffix, existing
    non-scheme names ignored.
  - Ring trim: cap respected, newest kept (mirror of the xpfarm/daemon trim tests).
  - `test/daemon.test.js`: `RESIDENT_COMPANIONS` contains `gangmanager.js` (intended change to
    the membership assertions); self-terminating exclusion test untouched.
  - `test/hosts.test.js`: `HOME_RESERVE_GB` `toBe(80)` → `toBe(100)` and the
    `totalAllocatableRam` fixtures recomputed — **intended changes, not regressions** (same
    treatment Phase 26 S10 gave the 32 → 80 bump).
  - `test/verify-gang.test.js` (runs under `npm run verify:log`, skip-if-missing per the
    verify-ratchet convention): `gang-state.json` parses, numeric fields finite, `sinkMode`
    boolean, every member's `task` ∈ ladder ∪ {SINK_TASK, "Unassigned"}; `gang-log.json` is an
    array ≤ 2000 with `{timestamp, time, kind}` records and known `kind` values.
  - Regression: full existing suites stay green.

## Design

### Work item 1 — `src/gangmanager.js` [code]

New file, no imports. Header: Tier 1 scope + the Tier 2–4 boundary rail, the one-way-recruit
warning, the invalid-task-name foot-gun, the off-marker, predicted RAM + measured-on-ship RAM.
Constants and pure exports per S1–S5, S7–S8 (`planAssignments`, `evalPromotion`, `evalSink`,
`nextRecruitName` exported for tests; the main loop is thin `ns` plumbing around them, same
pure/impure split as daemon/scheduler). Startup sequence per S7; loop per S1–S4: `await
nextUpdate` → read gang + members (bracket-notation stat reads) → off-marker check → recruit
(S3) → `evalSink` → `evalPromotion`/`planAssignments` → apply diffs → state/log writes (S8).

### Work item 2 — tests [code]

`test/gangmanager.test.js` per S10; `test/verify-gang.test.js` per S10.

### Work item 3 — `src/daemon.js` + `src/hosts.js` + `src/bootstrap.js` [code]

Per S9 (companion + resident list), S6 (`HOME_RESERVE_GB = 100` + comment), bootstrap comment
80 → 100. `test/daemon.test.js` + `test/hosts.test.js` updates per S10.

### Work item 4 — `vite.config.ts` [code]

Two `download.location` lines (`gang-state.json`, `gang-log.json`) per S8.

### Work item 5 — doc reconciliations [code]

- `docs/scripts.md`: `gangmanager.js` row (Tier 1 scope, off-marker, files it writes);
  `daemon.js` row note (new resident).
- `BACKLOG.md`: the "Gang manager" idea entry shrinks to the deferred Tiers 2–4 + their open
  questions (Tier 1 ships here); the gangprobe cost/type fix stays as Tier 2's first task.
- `docs/phases/CHANGELOG.md`: dated condensed entry at phase close; both phase-27 docs graduate
  to `docs/phases/`. Staged with the work, not after.

## Live procedure [live]

- **L1 — Home RAM 32 → 64 GB (one tier, the discovered prerequisite).** Kenneth or
  Claude-over-CDP (game-progression purchases are pre-authorized) buys **exactly one** home RAM
  upgrade at Alpha Enterprises (Sector-12). Guard: expected price well under $500m against the
  $4.738b held; if the UI shows more, **stop and reassess** — it would compete with the $5b
  Formulas fund. Do not use `upgradehomeram.js` (S6). Record the paid price in the phase
  close-out. Bridge health first (per BACKLOG): `logs/daemon-batch-log.json` mtime < 60s.
- **L2 — Deploy + restart.** Merge lands, `npm test` green, dev server healthy,
  `dist/src/gangmanager.js` byte-check, `ramcheck.js`: gangmanager ≤ 14.0 GB, daemon 16.30
  flat, **and the S6 census gate passed** (planned-resident sum recorded). Claude restarts
  `daemon.js` over CDP. Verify within ~2 min via `ps`/terminal, against the census table's
  expectations: `gangmanager.js` **and** `procureformulas.js` running (the priority slot and
  the Formulas path); `xpfarm.js` + `backdoorfactions.js` running if the census said they
  fit; `ratchetlog.js` + `backdoorwd.js` skipped — **intended** (S6 displacees);
  `augfarmer.js` skipping — **intended** (Prominent flag 2). Re-check at ~30 min:
  `gangmanager.js` still resident, not cycling through the supervisor's `waiting-ram` state
  (one `ps` read + zero `companion-relaunch`/`companion-waiting-ram` events naming it).
- **L3 — First-hour validation, from exported logs only.** `gang-state.json` syncing and sane:
  memberCount > 0 (founding recruits land immediately — greedy loop), every member on
  Ransomware (or briefly probing Phishing), respect/moneyGainRate > 0 and climbing,
  `wantedPenalty` ≈ `baselinePenalty`, `sinkMode` false. `gang-log.json`: `startup` +
  `recruit` events present.
- **L4 — First-day validation.** `promote` events appear with baseline/probe numbers as
  member stats grow; zero `sink-enter` while penalty deviation stays < 2% (the negative
  watchdog check — a positive sink test can't be scheduled; the unit fixtures carry it and the
  first real deviation validates it in production, the nature of a watchdog); no member sits
  "Unassigned" in any state snapshot.
- **L5 — Off-marker lever test.** Claude drops `gang-off.txt` over CDP, waits ~2 min: state
  file keeps updating with `offMarker: true`, zero recruit/task events; removes it, actions
  resume. This is also Kenneth's documented abort lever.

## Acceptance criteria

- **`npm test` green** including S10's full list. [code]
- **Tier rail:** `grep -n "purchaseEquipment\|ascendMember\|setTerritoryWarfare"
  src/gangmanager.js` matches nothing; `grep -rn "installAugmentations" src/` still matches
  only `installer.js`. [code]
- **RAM:** `gangmanager.js` ≤ 14.0 GB and `daemon.js` = 16.30 GB in
  `logs/ramcheck-result.json`, cross-checked against `dist/src/` bytes — **plus the S6 census
  artifact: a ramcheck pass covering every companion in the census table, with the
  planned-resident sum ≤ 63.5 GB (or the documented fallback applied).** [live artifact]
- **Resident, not waiting:** `gangmanager.js` (and `procureformulas.js`) present in
  `ns.ps("home")` at L2's ~30-min re-check, with zero supervisor events naming
  `gangmanager.js` — the priority-slot design did its job. [live]
- **Recruit + assign live:** L3's evidence — members recruited and on ladder tasks with
  positive gain rates, from `gang-state.json`/`gang-log.json`, not terminal paste. [live —
  the phase's primary gate]
- **Promotion live:** ≥1 `promote` event with its baseline/probe means logged within the first
  day (L4). [live, from logs]
- **Watchdog negative check:** zero `sink-enter` events across L3–L4's healthy window; no
  "Unassigned" member in any snapshot. [live, from logs]
- **Ratchet still dormant:** `augfarmer.js` absent from `ns.ps("home")` after L2's restart
  (daemon INFO skip visible). [live]
- **Off-marker lever:** L5 observed with its log evidence. [live]
- **`npm run verify:log` green**, including the new verify-gang shapes against the real
  exported files. [live]
- **Doc reconciliations landed** per work item 5. [code, checkable by reading]

## Files touched

`src/gangmanager.js` (new) · `src/daemon.js` (one launch line + one array string) ·
`src/hosts.js` (constant + comment) · `src/bootstrap.js` (comment only) ·
`test/gangmanager.test.js` (new) · `test/verify-gang.test.js` (new) · `test/daemon.test.js` ·
`test/hosts.test.js` · `vite.config.ts` (two download lines) · `docs/scripts.md` ·
`BACKLOG.md` · `docs/phases/CHANGELOG.md`.

**Deliberately untouched:** `src/augfarmer.js` + the whole ratchet chain (dormant by design —
open question 2), `src/dashboard.js` (Phase 24 gate), `src/gangprobe.js` (Tier 2's first task),
the batcher core, `src/scheduler.js`, `src/installer.js`.

## Open questions

1. **Install-degrade recon (features Q1)** — unchanged, blocks Tier 3 only. The forced-install
   probe is *more* deferred than the features assumed: no installs occur in BN2 while the
   ratchet is dormant, and forcing one now would wipe the $4.7b Formulas fund — the probe's
   cost went up, its urgency went down. Wake-up: before Tier 3's spec, or the first BN2
   install, whichever comes first.
2. **Waking the aug-ratchet in BN2** — surfaced by this spec's home-RAM sizing (Prominent
   flag 2), not decided here. Waking it = buying home past 128 GB and accepting that augfarmer
   starts spending free money on the NiteSec catalog and installing on trigger. **Default:
   stays dormant. Revisit when Formulas.exe is bought AND gang income is online — or on
   2026-08-02, whichever comes first.** It is ultimately the plan (the BN2 catalog math runs
   through installs), so this is sequencing, not direction.
3. **`gangprobe.js` cost/type fix (features Q2)** — Tier 2's first task, unchanged.
4. **Formulas-based assignment (features Q4)** — wake-up: the `formulasAvailable` flip in
   `gang-state.json` (S5), likely soon (hacking 357 → >400, $4.738b → $5b). The measured
   policy stays valid after the flip; formulas would replace probing with exact evaluation —
   a Tier 2+ co-scope, not a patch.
5. **Wanted-sink capacity asymmetry (S2)** — if sink-mode duty cycle exceeds ~50% in the first
   week of logs, the +1.25/−0.001 base-rate asymmetry is real at the actuals level and the
   policy needs rework (cap the ladder at Fraud & Counterfeiting, or mixed per-member
   assignment). The logs measure it for free; wake-up is that reading.
6. **Training tasks (S1 exclusion)** — if members plateau below Money Laundering for a long
   stretch (visible as stalled `promote` events + flat `weightedStat` growth in the logs),
   revisit Train Hacking in Tier 2. Wake-up: that log signature.
