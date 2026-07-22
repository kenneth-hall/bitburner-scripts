# Phase 29 spec: gang scaling — equipment + ascension + ladder re-open (`gangmanager.js`)

## Context

Work in `C:\Users\admin\bitburner-scripts`. Requirements: `phase-29-gang-scaling.features.md` —
read it first; this spec assumes it, including: Tiers 2+3 specced as one phase (ascension wipes
gear but not member augs, so purchase policy depends on ascension policy), the two-class equipment
split (rootkits cheap/disposable, member augs expensive/permanent), ascend-aggressively (settled by
the live probe: **faction rep tracks the respect gain rate, not the total** — ascension claws back
nothing), re-opening the task ladder as the success measure, and money being a non-constraint
except for the member-aug tier. Foundation docs: `docs/archive/gang-api.md`,
`logs/gangprobe-1784562548352.json` (full task + equipment tables with cost/type),
`logs/ascendrecon-1784568236075.json` (rep-tracks-rate probe + all-member ascension previews),
`docs/phases/phase-28-gang-rep-pivot.md` (why the ladder is pinned and what re-opening must not
repeat).

Game state this spec was drafted against (2026-07-20):

| Fact | Value | Source |
|---|---|---|
| Gang | NiteSec, 8 members, respect ~4.4k, territory 14.3% | ascendrecon log |
| Respect rate | **0.127/tick** (~45 rep/hr) — the ×10 baseline | ascendrecon log / features |
| Ladder | pinned `["Ransomware"]`, sink duty 0% | Phase 28, confirmed in features |
| Formulas.exe | **owned** (bought 2026-07-20, `formulasAvailable: true`) | features |
| Home RAM | **128 GB** (64→128 hand-bought 2026-07-20, deadlock break) | BACKLOG / commit `1edfcc6`-adjacent |
| Aug-ratchet | **awake** — `augfarmer.js` (64.10 GB) resident, chasing Neurotrainer I (~20h at current rep rate) | BACKLOG |
| Batcher income | ~$3.3b/hr | features |
| First-ascension previews | ×3.08 (top 3) … ×1.88; `nite-07` **already ascended once** by the recon's `--commit` (`hackAscMult` 1.517); `nite-08` below the ascension floor (no result) | ascendrecon log |
| Rootkit tier | 5 items, ×1.711 hack, **$203.58m/member** | gangprobe log |
| Member-aug tier | 3 items, ×1.328 hack, **$20.82b/member** | gangprobe log |

**Prominent flag 1 — the promotion probe is replaced, not re-rung'd.** The features file says this
phase "re-adds rungs when member strength supports them; it does not rebuild the climbing logic,"
and separately leaves Q4 ("what re-opens the ladder, mechanically?") to this spec. Those two pull
apart, and this spec resolves them in favor of Q4's "live check" option: **the empirical
baseline/probe state machine (`evalPromotion`) is deleted and replaced with an exact,
Formulas-based ladder mover** (S2). Three reasons, in order of force: (a) the probe's metric is
`moneyGain`, which is *wrong* for a respect ladder — three of the new rungs (DDoS, Plant Virus,
Cyberterrorism) earn $0, so the probe would demote off them unconditionally; (b) a metric-swapped
probe still cannot see heat — it would re-create exactly the Phase 27/28 thrash (promote on
higher respect, overwhelm the sink, watchdog-dump, repeat) at rungs generating up to 750× more
wanted; (c) Phase 27's own spec pre-authorized this: its open question 4 says "formulas would
replace probing with exact evaluation — a Tier 2+ co-scope, not a patch." This is that co-scope.
The rung/ladder/`planAssignments`/sink-watchdog machinery all survive; what dies is the
probe-and-compare experiment inside `evalPromotion`, which Formulas.exe makes obsolete.

**Prominent flag 2 — home RAM is a prerequisite again, and the reserve moves with it.**
`gangmanager.js` grows ~+12.1 GB of `ns.gang` surface (S6). At 128 GB home with `augfarmer.js`
(64.10) now resident, that displaces `xpfarm.js`/`backdoorfactions.js` and risks the supervisor
RAM-racing the ratchet — the two scripts this whole BN2 plan runs on. L1 therefore buys **exactly
one home tier (128 → 256 GB) via `src/upgradehomeramonce.js`** (one-tier, spend-capped — built for
exactly this) and `HOME_RESERVE_GB` goes 100 → 160 so the enlarged home stays companion territory
instead of leaking to the batcher (whose home contribution is noise against a 33 TB fleet).

**Prominent flag 3 — Formulas.exe does not survive installs, and the ratchet is awake.** Installs
wipe purchased programs ([[reference_install_resets_programs_tor]]); `procureformulas.js` re-buys
at hacking > 400 and $5b held, which post-install (money ~$1k) can take hours. The ladder mover is
the only Formulas consumer, so it **suspends** (freeze rungs, keep observing) while
`formulasAvailable` is false rather than crashing or guessing (S2). Ascension previews
(`getAscensionResult`) and equipment logic are plain `ns.gang` calls and keep running.

**Audience note:** the implementer does everything marked **[code]**. Kenneth does everything
marked **[live]** — except companion restarts, story-popup dismissal, and (per the
game-progression pre-authorization) the home-RAM purchase, all of which Claude may do over CDP. No
[live] step requires editing code.

## Ground rules

- `CLAUDE.md` rules apply. **All new `ns` surface lands in `gangmanager.js`** — `daemon.js`
  untouched (gangmanager is already a resident companion in the priority slot), `hosts.js` changes
  one constant + comment. Any daemon RAM movement ⇒ identifier-hygiene audit, not "cost of the
  feature."
- **One import is added: `recordTransaction` from `translog.js`** — the CLAUDE.md purchase-logging
  convention, same call-site pattern as `cloudmanager.js`. This is a deliberate, bounded exception
  to Phase 27's no-imports rule: `translog.js`'s entire `ns` surface is `read`/`write`, both 0 GB,
  so import-bleed charges nothing — **verified by the RAM gate**, not assumed (a surprise reading
  ⇒ suspect this first). No other imports.
- **No Singularity calls** (`ns.gang.*` and `ns.formulas.*` are not Singularity).
- **Transactions:** every successful `purchaseEquipment` records
  `{type: "expense", source: "gang-equip", ...}` via `recordTransaction`. A failed spend records
  nothing. `ascendMember` and `setMemberTask` cost no money — no records.
- **Tier rail updated, not removed:** `setTerritoryWarfare` (Tier 4) must not appear in
  `src/gangmanager.js` (grep-checkable). `purchaseEquipment`/`ascendMember` move from forbidden to
  in-scope — the Phase 27 header text and grep criterion are rewritten accordingly.
- **Identifier hygiene, pre-checked for planned names:** `LADDER_VERSION`, `PLAN_TICKS`,
  `BUY_TICKS`, `ASCEND_MIN_FACTOR`, `ASCEND_COOLDOWN_TICKS`, `PROMOTE_COOLDOWN_TICKS`,
  `ROOTKITS`, `MEMBER_AUGS`, `ROOTKIT_MONEY_FLOOR`, `MEMBER_AUG_MONEY_FLOOR`, `evalLadderMove`,
  `evalAscension`, `planEquipmentBuys`, `netWanted`, `gainsFor`, `ascPreview`, `lastAscendTick`,
  `promoteCooldowns`, `buyOps` — none collides with an `ns.*` method/property reachable from any
  namespace. **Bracket notation is mandatory** on: the six member stat fields (unchanged),
  `GangMemberAscension`'s six factor fields (**`result["hack"]`** — `hack` is a charged `ns`
  method), and any new `GangGenInfo`/`GangMemberInfo` field whose name shadows an `ns` method.
  `hack_asc_mult` / `upgrades` / `augmentations` / `earnedRespect` collide with nothing — dot
  access fine. Known-dangerous short names stay out of locals. Re-run the check on any name added
  during implementation.
- **This build's API only:** every `ns.gang.*` / `ns.formulas.gang.*` signature verified against
  `markdown/` at implementation time. `ns.formulas.gang.*` RAM is expected 0 GB but is **not
  documented in the API-Documenter pages** — the RAM gate is the authority; if formulas calls turn
  out to carry a charge, stop and re-run the S6 arithmetic before shipping.
- **Observability: logs only, no dashboard edits, and — new this phase — no `vite.config.ts`
  edits either**: everything rides the existing `gang-state.json` / `gang-log.json` exports and
  the existing `transactions-*.json` filter.
- One branch (`phase29-gang-scaling`). `npm test` the implementer runs and clears; RAM readings
  and live observation ride Kenneth's session (restarts + the RAM purchase are Claude-over-CDP).
  BACKLOG/CHANGELOG edits ride the same branch. Before merge: `git log HEAD..master` (worktree
  check) and dev-server health (`logs/daemon-batch-log.json` mtime < 60s) before any live step.

## Spec-stage decisions

- **S1 — Ladder re-opened: respect-ordered, 8 rungs, with the sink as rung 0.** Resolves the
  features' "re-add rungs" direction concretely:

  ```
  TASK_LADDER = ["Ethical Hacking", "Ransomware", "Phishing", "Identity Theft",
                 "DDoS Attacks", "Plant Virus", "Money Laundering", "Cyberterrorism"]
  ```

  Ordered strictly by `baseRespect` (0 → 0.00005 → 0.00008 → 0.0001 → 0.0004 → 0.0006 → 0.001 →
  0.01), which is also strictly ordered by `baseWanted` (−0.001 → … → 6) — every promotion is
  more respect for more heat, which is exactly the trade the mover (S2) prices. Placing
  **Ethical Hacking at rung 0** makes standing sink capacity *emerge from the existing rung
  machinery*: a member heat-demoted to rung 0 is a dedicated cooler, no new concept needed —
  this is how the "mixed per-member assignment" Phase 27's open question 5 anticipated actually
  lands. Exclusions, with reasons: **Fraud & Counterfeiting** (0.0004 respect — tied with DDoS
  at more wanted (0.3 vs 0.2) and more difficulty (20 vs 8); dominated for a respect engine),
  **Vigilante Justice** (dominated by Ethical Hacking, unchanged), **Train ***/Territory
  Warfare/Unassigned (zero respect, unchanged reasons). `SINK_TASK` stays `"Ethical Hacking"`
  and now equals `TASK_LADDER[0]` — the emergency watchdog (S4) and rung 0 deliberately share
  it. Gang money output becomes whatever the respect-optimal mix pays — measured at ~0.003% of
  batcher income, it is not a design input.
- **S2 — Ladder movement: exact, Formulas-based, one move per cycle** (replaces `evalPromotion`
  — Prominent flag 1; resolves features Q4 with the "live sink-capacity check" option). Every
  `PLAN_TICKS` (5) ticks, a pure `evalLadderMove` returns **at most one** rung change:
  1. **Suppressed** when: emergency sink mode is on, the off-marker is set, or
     `formulasAvailable` is false (Prominent flag 3 — rungs freeze, a `formulas-missing` flag
     rides the state file).
  2. **Heat demote** — if `netWanted` (Σ of members' *actual* `wantedLevelGain` readings) > 0:
     demote one rung the member (rung ≥ 1) with the lowest marginal respect-per-heat, i.e.
     minimal `(r(rung) − r(rung−1)) / max(w(rung) − w(rung−1), 1e-9)` computed via
     `ns.formulas.gang.respectGain`/`wantedLevelGain`; that member's promote cooldown is set
     (`PROMOTE_COOLDOWN_TICKS`, 300). Event `demote`, `reason: "heat"`. **The denominator floor
     is load-bearing, not cosmetic** (cold-review blocker 2): the game's wanted formula can clamp
     to zero for a marginal member on adjacent hard rungs, so `Δw ≤ 0` is reachable — the floor
     keeps the ratio finite and ranks those members *last* (demoting them frees no heat, so they
     should be), while still leaving the selection total so some member is always picked and the
     gang walks down over successive cycles; the S4 watchdog remains the backstop if single
     demotions can't drain fast enough. Same guard class as `evalSink`'s deviation floor.
  3. **Efficiency demote** — else if some member's `r(rung−1) > r(rung)` (their stats no longer
     carry the rung — the post-ascension and fresh-recruit case): demote the member with the
     largest such gain. Event `demote`, `reason: "efficiency"`. No cooldown (this demotion is
     about them, not the budget).
  4. **Promote** — else among members with rung < top, no active cooldown, `r(rung+1) > r(rung)`,
     and **projected** `netWanted − w_actual(member) + w_pred(rung+1) ≤ 0`: promote the one with
     the largest respect gain. Event `promote`, carrying the projection. The subtraction uses the
     member's **actual** current `wantedLevelGain` reading, not the Formulas prediction of their
     current rung (cold-review note 1) — otherwise the model residual (actual − predicted) leaks
     into the safety margin, and the margin is the one thing that must stay honest.
  Actuals (`wantedLevelGain` sums) anchor the budget so model error can't silently cook the
  gang; Formulas prices the *candidate* moves exactly. One move per cycle keeps every
  projection computed against a state the previous move has actually reached; full convergence
  from scratch is ≤ 8 members × 7 rungs × 5 ticks ≈ 15–25 min, acceptable. The features' Q6
  ("does the ×200 rung survive its own heat?") is deliberately **not pre-answered**: the mover
  climbs exactly as high as the budget allows, and the logs report the sustained top rung —
  whatever the answer is, the design is already correct for it. Constants (`PLAN_TICKS`,
  `PROMOTE_COOLDOWN_TICKS`) are provisional and ride every promote/demote event.
- **S3 — Ascension: threshold-triggered, globally staggered** (resolves features Q3). Each tick
  (off-marker honored), preview every member via `getAscensionResult`; **ascend when
  `preview["hack"] ≥ ASCEND_MIN_FACTOR` (1.5)**, at most one member per `ASCEND_COOLDOWN_TICKS`
  (60 ticks ≈ 2–5 min) gang-wide. Rotation shape: threshold-staggering, not waves — rep tracks
  the *rate*, the measured per-member dip is ~−11%, and the cooldown bounds trough depth at one
  regrowing member per window while costing ≤ ~40 min of total stagger across 8 members —
  negligible against a weeks-scale phase. A member with **no preview result** (below the game's
  undocumented ascension floor — `nite-08` today) is skipped silently: they keep earning and
  cross the floor on their own; that *is* the below-threshold policy the features asked for. On
  ascension: log event `ascend` (previewed factors bracket-read, respect forfeited, constants),
  and **reset the member's rung to 1** (Ransomware) — their stats just went to ~0 and the exact
  mover would spend many cycles walking them down; resetting is deterministic and the ladder
  re-climbs them as they recover. Ascending during emergency sink mode stays allowed (respect
  rate is already zero then — it's the cheapest possible moment). `ascendMember`'s return is
  checked; only a truthy result logs. `earnedRespect`/previews are re-read fresh each tick,
  never cached across ticks.
- **S4 — Emergency sink watchdog: unchanged.** `evalSink`, the deviation baseline (with the
  at-or-below drift fix), hysteresis constants, and the all-members-to-`SINK_TASK` response all
  stay exactly as shipped. Under S2 the steady state keeps `netWanted ≤ 0`, so the watchdog
  should now be a true last resort — its firing rate becomes a *health metric* (L4) instead of
  a duty cycle.
- **S5 — Equipment: two classes, two policies** (features-decided shape; mechanics set here).
  Checked every `BUY_TICKS` (10) ticks, skipped entirely under the off-marker; money read once
  per cycle via `ns.getServerMoneyAvailable("home")`; every successful buy logs an `equip-buy`
  event *and* a transaction record (ground rules); prices always read live via
  `getEquipmentCost` (it already includes `equipmentCostMult` — never re-applied).
  - **Rootkits — broad and early.** `ROOTKITS = ["NUKE Rootkit", "Soulstealer Rootkit",
    "Hmap Node", "Demon Rootkit", "Jack the Ripper"]` (hardcoded; the probe log is the source
    of truth and S7's startup validation guards drift). For each member, buy every rootkit
    missing from `.upgrades` while `money ≥ cost + ROOTKIT_MONEY_FLOOR` ($1b). **Skip members
    whose current ascension preview ≥ `ASCEND_MIN_FACTOR`** — they ascend within one cooldown
    window and the gear would be wiped; the rebuy fires on the first `BUY_TICKS` cycle after
    their ascension. Ascension-disposability is priced in: ~$203.58m/member/cycle against
    ~$3.3b/hr income is noise.
  - **Member augmentations — staged, breadth-first, rotation members only.** `MEMBER_AUGS =
    ["Neuralstimulator", "DataJack", "BitWire"]` — descending ln(mult)/$ (0.0151, 0.0137,
    0.0105 per $b), so each dollar buys the most multiplier first. **Eligible: only members
    who have ascended at least once (`hack_asc_mult > 1`)** — the concrete, testable form of
    the features' "only on members in the ascension rotation" decision (cold-review blocker
    1): a first ascension is the proof a member is in the rotation, and until then the member
    gets rootkits only (strictly better anyway for a never-ascending member: ×1.711 for
    $203.58m, never wiped, vs ×1.328 for $20.82b). Today's below-floor `nite-08` is thereby
    excluded automatically and joins the aug queue the day it first ascends — no special case.
    Breadth-first across eligible members: tier k for all before any tier k+1 (maximizes total
    gang mult per dollar; also fair to the mover, which prices members against each other).
    Gate: `money ≥ cost + MEMBER_AUG_MONEY_FLOOR` ($15b). **No imminent-ascension skip** —
    member augs survive ascension, which is the entire reason this tier exists. Combat gear/armor/vehicles: never bought (combat stats are dead weight on
    every ladder task; vehicles' cha ×1.16 applies to a near-zero cha stat — considered,
    rejected).
  - Both floors are provisional constants, logged in every `equip-buy` event. They are crude
    arbitration against the two other wallet consumers (augfarmer's catalog buys,
    resourcemanager's fleet upgrades) — see open question 3.
- **S6 — RAM & placement.** New charges in `gangmanager.js`: `ascendMember` 4 +
  `purchaseEquipment` 4 + `getAscensionResult` 2 + `getEquipmentCost` 2 +
  `getServerMoneyAvailable` 0.1 + `ns.formulas.gang.*` 0 (expected — ground-rules caveat) =
  **+12.1 GB** on the Phase 27 predicted 12.7 ⇒ **predicted ~24.8 GB, acceptance band
  ≤ 28.0 GB**; a reading near 2× ⇒ identifier-hygiene audit before anything else. Deliberately
  *not* called: `getEquipmentNames`/`getEquipmentType`/`getEquipmentStats` (−4 GB — the item
  lists are static game data the probe verified live; S7 validates the hardcoded names cheaply
  via `getEquipmentCost` at startup) and `getInstallResult` (OQ1's answer comes free from
  state-file snapshots across an install, no 2 GB needed). Placement arithmetic at 128 GB home:
  daemon 16.30 + core companions 14.80 + augfarmer 64.10 + gangmanager ~24.8 = **~120 GB** —
  xpfarm (5.85) marginal, backdoorfactions (11) displaced, zero margin against the two scripts
  BN2 runs on. Hence **L1: one home tier, 128 → 256 GB, via `upgradehomeramonce.js`** (its
  spend cap + one-tier semantics are exactly the guard `upgradehomeram.js` lacks), and
  **`HOME_RESERVE_GB` 100 → 160** in `hosts.js` (full companion census incl. ratchetlog/
  backdoorwd ≈ 155 GB < 160). Precision on what the reserve buys (cold-review note 2):
  `hosts.js` computes home batch budget as `max(0, maxRam − usedRam − HOME_RESERVE_GB)`, so
  with ~155 GB of companions *running*, the batcher's home budget is ≈ 0, not 96 — which is
  the intent: home is companion territory, the batcher runs on the 33 TB fleet, and the
  reserve's actual job is to stop the batcher from claiming companion headroom in the window
  before a companion (re)launches. At 256 GB every companion fits — the Phase 27 displacee
  choreography retires.
- **S7 — Startup validation & persistence migration.** Startup keeps Phase 27's fail-loud
  checks and extends them: (a) every `TASK_LADDER` + `SINK_TASK` name ∈ `getTaskNames()` —
  unchanged guard against silent "Unassigned"; (b) **new:** every `ROOTKITS` + `MEMBER_AUGS`
  name must return a finite `getEquipmentCost` (the API returns `Infinity` for an invalid name)
  — same fail-loud principle for the hardcoded equipment lists; (c) `formulasAvailable` checked
  at startup and every state write (existing field) — gates only the mover, never exits.
  **Persistence: the state file gains `ladderVersion: 2`.** Persisted rungs are honored only on
  a version match; any mismatch (including the pre-phase file, which has no version) discards
  persisted rungs and rebuilds from live tasks — rung indices are ladder-relative and the
  ladder just re-numbered (old rung 0 = Ransomware is new rung 1; blind reuse would silently
  sink the whole gang). `rebuildRungs`'s task-match path maps the new ladder naturally
  (members found on "Ethical Hacking" → rung 0, "Ransomware" → rung 1, …); the unknown-task
  default moves from rung 0 to **rung 1** (a fresh recruit should earn, not cool). **The live
  recruit path changes to match** (cold-review blocker 3): the loop's recruit block currently
  sets `rungs[name] = 0`, which under the new ladder would park every new member on the sink —
  it must set **rung 1**, and the S9 tests pin this. Promote
  cooldowns and the ascension stagger clock stay in-memory-only — a restart costs at most one
  premature promotion attempt and one early ascension, both self-correcting (same acceptance
  Phase 27 gave probe cooldowns).
- **S8 — Observability: same two files, richer records.** No new exports, no dashboard change.
  - `gang-state.json` adds: `ladderVersion`, `netWantedRate` (the S2 actuals sum),
    `formulasSuspended` (mover frozen, Prominent flag 3), and per member: `hackAscMult`
    (`hack_asc_mult`), `ascPreviewHack` (bracket-read preview factor or null),
    `upgrades`, `augmentations`, and `predictedRespectGain` **+ `predictedWantedGain`**
    (Formulas at the member's current task; null while suspended) beside the existing actuals —
    the predicted-vs-actual pairs are the model-validation instrument `docs/archive/gang-api.md` calls
    the cheapest path to a trustworthy model, and L4 reads them. Wanted is validated as well as
    respect (cold-review note 1) because the promote budget — the phase's sole anti-thrash
    guard — trusts the *wanted* formula, not the respect one.
  - `gang-log.json` event kinds become: `startup`, `rebaseline`, `recruit`, `off-marker`,
    `sink-enter`, `sink-exit` (all unchanged), `promote`/`demote` (new shapes: rung, reason,
    netWanted, projections, constants), `ascend`, `equip-buy`, `formulas-suspend`/
    `formulas-resume` (mover state flips). Every policy event carries its provisional
    constants (Phase 25 convention).
  - Money spends additionally land in `transactions-YYYY-MM-DD.json` via `recordTransaction`
    (already exported).
- **S9 — Test plan (vitest; `test/gangmanager.test.js` rewrite + `test/verify-gang.test.js` +
  `test/hosts.test.js`).** The probe-machinery tests (`evalPromotion` state machine, probe
  fixtures, stat-growth cooldowns) are **deleted with the machinery they cover** — an intended
  removal, flagged here so the diff's negative lines read as design, not lost coverage. New
  coverage:
  - `evalLadderMove`: suppressed under sink/off-marker/no-formulas; heat-demote picks the
    lowest marginal r/w member and sets its cooldown; efficiency-demote fires on
    `r(rung−1) > r(rung)` and picks the largest gain; promote requires all four conditions and
    picks max Δr; **at most one op per call**; projected-budget boundary (a promote that lands
    Σw exactly at 0 is allowed; above 0 is not); cooldown blocks promotion and expires;
    rung-0 members are never heat-demoted further.
  - `evalAscension`: fires at factor ≥ 1.5, not at 1.49 (boundary); global cooldown enforces
    one-per-window; no-preview member skipped; off-marker suppresses; returns the rung-1 reset.
  - `planEquipmentBuys`: missing rootkits bought when money clears cost + floor; floor
    boundary exact; imminent-ascender skipped for rootkits but **not** for augs; aug staging
    is breadth-first across members in `MEMBER_AUGS` order; owned items never re-bought; empty
    op list under off-marker.
  - `rebuildRungs`: version mismatch discards persisted rungs; version match honors them
    (clamped); task-match maps sink task → 0 and ladder tasks → their index; unknown-task
    default is 1. A shared `FRESH_RECRUIT_RUNG = 1` constant backs both this default and the
    live recruit block (cold-review blocker 3), and the test asserts the constant so the two
    call sites can't drift apart.
  - `evalSink` suite: unchanged (no behavior change — assert that by leaving it green).
  - `test/hosts.test.js`: `HOME_RESERVE_GB` `toBe(100)` → `toBe(160)` + fixture recompute —
    intended changes, same treatment as the 80 → 100 bump.
  - `test/verify-gang.test.js` (skip-if-missing, under `npm run verify:log`): existing shape
    checks extended — `ladderVersion === 2`, `netWantedRate` finite, member `task` ∈ ladder ∪
    {"Unassigned"}, known event kinds now include the S8 additions, every `equip-buy` event's
    cost > 0, and **model validation** for both predicted-vs-actual pairs (respect *and*
    wanted): over qualifying member-readings, the median must satisfy
    `|predicted − actual| ≤ max(0.10 × |actual|, ABS_EPS)` — the combined relative/absolute
    tolerance (cold-review note 4) so near-zero actuals (a freshly-ascended member's
    `respectGain ≈ 0`, or a clamped-to-zero `wantedLevelGain`) can't blow up a ratio.
    **Qualifying** = snapshot has `formulasSuspended` false and `sinkMode` false; if no
    snapshot qualifies, the check **skips** (same skip-if-missing convention as the file
    itself), never errors on an empty set.
  - Regression: full remaining suites stay green (`npm test`, 704 baseline minus intended
    probe-test removals plus additions).

## Design

### Work item 1 — `src/gangmanager.js` [code]

Header rewritten: scope now Tiers 1–3 (recruit + task ladder + equipment + ascension), Tier 4
rail (`setTerritoryWarfare` forbidden, grep-checked), the one-way-recruit and silent-Unassigned
warnings kept, Formulas-suspension behavior (Prominent flag 3), predicted RAM ~24.8 GB.
Constants and pure exports per S1–S5, S7 (`evalLadderMove`, `evalAscension`,
`planEquipmentBuys`, `rebuildRungs`, `evalSink`, `planAssignments`, `nextRecruitName`,
`weightedStat` retired with the probe if nothing else uses it — check before deleting).
Loop order per tick: `await nextUpdate` → read gang + members (bracket-notation stat reads) →
off-marker check → recruit (unchanged) → **ascend (S3)** → **buy (S5, every BUY_TICKS)** →
emergency sink eval (S4, unchanged) → **ladder move (S2, every PLAN_TICKS)** →
`planAssignments` → apply diffs → state/log writes (S8). Ascend-before-buy inside one tick is
deliberate: a member never gets rootkits bought and wiped in the same tick.

### Work item 2 — tests [code]

Per S9: `test/gangmanager.test.js` rewrite, `test/verify-gang.test.js` extension,
`test/hosts.test.js` constant/fixture updates.

### Work item 3 — `src/hosts.js` [code]

`HOME_RESERVE_GB = 160` + comment carrying this phase's census rationale (S6). `bootstrap.js`'s
reserve comment updated if it names the old figure.

### Work item 4 — doc reconciliations [code]

- `docs/scripts.md`: `gangmanager.js` row updated (Tiers 1–3 scope, new events, spends money →
  transactions); `upgradehomeramonce.js` row gains "used by Phase 29 L1" note if not present.
- `docs/archive/gang-api.md`: append the two measured Phase 29 facts (rep tracks rate; ascension floor
  exists — `getAscensionResult` returns nothing below it) with log pointers — the reference doc
  should not go stale against its own open questions.
- `BACKLOG.md`: the "Gang manager Tiers 2-4" entry shrinks to Tier 4 only; Phase 29 lines move
  out (it's no longer an idea).
- `docs/phases/CHANGELOG.md`: dated condensed entry at phase close; both phase-29 docs graduate
  to `docs/phases/`. Staged with the work, not after.

## Live procedure [live]

- **L1 — Home RAM 128 → 256 GB (one tier).** Claude-over-CDP (pre-authorized): run
  `upgradehomeramonce.js` **from a fleet server, not home** (cold-review note 5 — home sits at
  ~8 GB free under the current census, and the script's own header says to run it from the
  fleet; it makes Singularity calls that need real headroom). Price guard: expected well under
  $500m (64→128 was $31.86m); the script's own spend cap enforces this — if it declines the
  buy, **stop and reassess**, don't hand-force. Record the paid price for the close-out.
  Bridge health first: `logs/daemon-batch-log.json` mtime < 60s.
- **L2 — Deploy + restart.** Merge lands, `npm test` green, dev server healthy,
  `dist/src/gangmanager.js` byte-check, `ramcheck.js`: gangmanager ≤ 28.0 GB, `daemon.js`
  16.30 flat, `hosts.js`-importing scripts unchanged beyond the constant. Claude restarts
  `gangmanager.js` over CDP (`restart gangmanager.js` — daemon restart not needed; daemon.js is
  untouched). Verify within ~2 min: `gangmanager.js` **and** `augfarmer.js` both in `ps` (the
  phase must not have displaced the ratchet); at 256 GB expect the full companion set resident.
- **L3 — First-hour validation, from exported logs only.** `gang-state.json`: `ladderVersion`
  2, `formulasSuspended` false, `netWantedRate` ≤ 0 in most snapshots, members' `upgrades`
  filling with rootkits, `ascPreviewHack` present. `gang-log.json`: `ascend` events arriving
  one per cooldown window — expect every member whose **live preview ≥ 1.5 at ship** to ascend
  within ~30 min (~6 today: `nite-07` already ascended during the recon and may sit below the
  threshold for its *second* ascension; `nite-08` is below the floor), `equip-buy`
  events with matching same-day `transactions-*.json` records (every equip-buy has its
  transaction — the pairing is the check), first `promote` events walking members up from
  Ransomware. Expect a **transient respect-rate trough** while early ascensions regrow — that
  is the policy working, not a regression; judge rate at L4, not here.
- **L4 — First-days validation.** From `gang-state.json` history + `gang-log.json`: (a)
  sustained climbing — members holding rungs > 1 with `netWantedRate` ≤ 0 and the sustained
  top rung visible (this empirically answers features Q6 about Cyberterrorism); (b) emergency
  watchdog quiet — `sink-enter` rare (< ~4/day) and short, no Phase 27-style thrash; (c)
  ascension cadence — repeat `ascend` events as members re-reach ×1.5, `hackAscMult`
  compounding member by member; (d) model validation — the S9 predicted-vs-actual median
  within 10%; (e) **the goal metric: `respectGainRate` ≥ 1.27/tick (10× the 0.127 baseline)
  sustained across snapshots within 7 days of ship.** If mechanisms (a)–(d) all hold and (e)
  still misses, the features' stated risk has fired — ascension compounding is too slow — and
  that goes to Kenneth as a phase-outcome finding, not silent tuning.
- **L5 — Install rider (opportunistic, not schedulable).** The ratchet is awake; when its
  first BN2 install fires (~Neurotrainer I, ~20h away at pre-phase rates — sooner as rep
  accelerates): diff `hackAscMult` per member across the install boundary from `gang-state.json`
  snapshots (ratchetlog.js marks the boundary). Unchanged ⇒ `docs/archive/gang-api.md` open question 1
  resolved benign; reduced ⇒ the ratchet-vs-gang conflict is real and goes straight to Kenneth
  with the measured magnitude. Also confirm `formulas-suspend` fires at the install and
  `formulas-resume` after `procureformulas.js` re-buys — Prominent flag 3's degradation path,
  validated for free.
- **L6 — Off-marker lever re-test.** Claude drops `gang-off.txt` (via `src/` sync), waits ~2
  min: state file keeps updating, zero recruit/ascend/equip-buy/task events; removes it,
  actions resume. The lever now guards three action classes, so it gets re-proven, not assumed.

## Acceptance criteria

- **`npm test` green** including S9's full list; probe-test removals accounted for in the diff.
  [code]
- **Tier rail:** `grep -n "setTerritoryWarfare" src/gangmanager.js` matches nothing;
  `grep -rn "installAugmentations" src/` still matches only `installer.js`. [code]
- **RAM:** `gangmanager.js` ≤ 28.0 GB and `daemon.js` = 16.30 GB in
  `logs/ramcheck-result.json`, cross-checked against `dist/src/` bytes. [live artifact]
- **Coexistence:** `gangmanager.js` and `augfarmer.js` both in `ps` at L2's check — the phase
  did not displace the ratchet. [live]
- **Equipment live:** every member's `upgrades` ⊇ `ROOTKITS` in a steady L3/L4 snapshot, and
  every `equip-buy` event has a matching `transactions-*.json` record (`source: "gang-equip"`,
  amount > 0). [live, from logs]
- **Ascension live:** every member whose live preview ≥ `ASCEND_MIN_FACTOR` at ship (~6 —
  cold-review note 3: `nite-07` pre-ascended in the recon, `nite-08` below the floor) has an
  `ascend` event in the first hour, with `hackAscMult` > 1 in subsequent snapshots; ≥ 1
  *repeat* ascension within the L4 window. [live, from logs]
- **Ladder re-opened:** ≥ 1 member sustained on a rung > 1 with `netWantedRate` ≤ 0 across
  consecutive snapshots. [live, from logs — the mechanism gate]
- **Heat safety:** `sink-enter` < ~4/day across L4's window and no snapshot shows the whole
  gang parked on the sink outside a watchdog episode. [live, from logs]
- **Model validity:** the S9 predicted-vs-actual criterion passes in `npm run verify:log`
  against real exported snapshots. [live]
- **Goal metric:** `respectGainRate` ≥ 1.27/tick sustained within 7 days — or the documented
  L4(e) finding goes to Kenneth. [live, from logs — the phase's primary gate]
- **Off-marker lever:** L6 observed with log evidence covering all three action classes. [live]
- **`npm run verify:log` green** end to end. [live]
- **Doc reconciliations landed** per work item 4. [code, checkable by reading]

## Files touched

`src/gangmanager.js` (major extension) · `src/hosts.js` (constant + comment) ·
`src/bootstrap.js` (comment only, if stale) · `test/gangmanager.test.js` (rewrite) ·
`test/verify-gang.test.js` · `test/hosts.test.js` · `docs/scripts.md` · `docs/archive/gang-api.md` ·
`BACKLOG.md` · `docs/phases/CHANGELOG.md`.

## Close-out — observation window closed EARLY, 2026-07-21

The 7-day window (opened 2026-07-20, scheduled close ~2026-07-27) is **closed early on day 1**,
by explicit decision with Kenneth. Rationale, logged so the dropped observation leaves an artifact
rather than a memory:

- **Goal metric overshot ~425×, not marginally met.** Window goal: `respectGainRate ≥ 1.27/tick`
  (10× the 0.127 baseline). Live snapshot 2026-07-21 08:23: **`respectGainRate = 539.6`** — 12/12
  members, `netWantedRate = -0.0044` (negative), wanted penalty ~1.0, money rate ~$905k/s. The
  window was sized to prove a marginal 10× outcome; sustainability is no longer a live question
  when even a catastrophic 100× decay still lands 4× over the bar.
- **Latent-bug soak is ~covered.** The window's secondary job — soak the shipped design for a
  slow-burn bug (cf. the Tier-1 wanted-sink-froze-at-tick-zero bug that only surfaced live) — has
  **19h of clean autonomous churn** in `gang-log.json`: 317 promotes, 80 ascends, 38 demotes, 457
  equip-buys, 0 error events. That is real soak, not a snapshot.

**Consequence: `gangmanager.js` is UNFROZEN** as of 2026-07-21 — edits no longer confound a
running measurement. Tier 4 (territory) is unblocked for brainstorm.

**Surfaced gap carried into Tier 4 brainstorm — `respectGainRate` is not persisted as a series.**
Acceptance criterion L4(e) reads "sustained **across snapshots** ... from `gang-state.json`
history," but `gang-state.json` is *overwritten* every tick — there is no persisted history. The
metric was validated on the **instantaneous** read only. If any future gang decision needs a
trajectory (decay detection, ascension-vs-install cadence per BACKLOG's open cadence question), a
periodic `respectGainRate` sampler must exist first. **This is a required input to the Tier 4
brainstorm — do not design against a rate history that isn't being recorded.**

**Deliberately untouched:** `src/daemon.js` (no new surface; gangmanager already resident in the
priority slot) · `vite.config.ts` (no new exports — S8) · `src/dashboard.js` (Phase 24 gate) ·
`src/augfarmer.js` + ratchet chain (its BN2 behavior is its own concern; this phase only
coexists with it) · `src/translog.js` (imported as-is) · the batcher core.

## Open questions

1. **Install-degrade (features Q2 / gang-api OQ1)** — folded into L5's rider; resolves itself
   at the first BN2 install, whichever way. If degraded: escalate with magnitude, don't tune.
2. **Member cap (features Q5)** — still unhandled beyond `canRecruitMember()` going false;
   recruit events + `respectForNextRecruit` in state snapshots will show the cap the day we
   hit it. No design contingent on the answer.
3. **Money arbitration between the gang and the ratchet** — the S5 floors are crude. Wake-up:
   logs showing member-aug buys starved for > ~3 days while money repeatedly clears $15b (floor
   too high), or augfarmer visibly delayed past a catalog target by gang spends (floor too
   low). Either reading reopens the floors with data.
4. **Mover constants** (`PLAN_TICKS` 5, `PROMOTE_COOLDOWN_TICKS` 300, `ASCEND_MIN_FACTOR` 1.5,
   `ASCEND_COOLDOWN_TICKS` 60) — all provisional, all logged in their events. Wake-up: L4's
   first-days logs; recalibrate from evidence, not taste.
5. **Does the ladder top out below Cyberterrorism? (features Q6)** — deliberately left to
   measurement (S2). If the sustained top rung plateaus mid-ladder for weeks, the ×200
   headline was fiction and the honest ceiling is whatever the logs show — feeds the L4(e)
   goal-metric conversation.
