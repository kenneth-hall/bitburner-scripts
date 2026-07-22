# Changelog — completed work

Condensed record of finished phases and one-off changes, newest first. Each entry is a
one-or-two-line summary; the full design/validation story lives in the linked phase doc
(and in git history). Active work lives in [`BACKLOG.md`](../../BACKLOG.md).

---

## 2026-07-22

- **Stock docs consolidated into [`docs/stock-engine.md`](../stock-engine.md)** (research/prep, no
  engine code). Full `ns.stock` API surface + in-game mechanics doc captured; costs measured live via
  new `stockprobe.js` (all access flags `false` in BN2.1 — BN1's TIX wiped by node entry; WSE $200m /
  TIX $5b / 4S-TIX $25b, commission $100k, 6s ticks, TicksPerCycle 75). Shorts/limit-stop resolved as
  BN8-or-SF8.2/8.3 gates → current-save engine is long-only. Old `docs/stock-market.md` archived.
  Side finds: `getBonusTime()` throws without TIX (0 GB ≠ no precondition, gang-API class); viteburner
  never uploads brand-new files (silent `pending` — wget-seed workaround in `docs/dev-server.md`).
- **Gang engine adversarial audit + territory-deferral rationale CORRECTED.** A cold-context fable
  re-review (findings given as claims, methods withheld → independent re-derivation) confirmed the
  headline finding and corrected the record. **Territory income is ~territory^2.5 → ~124× money at
  100% (10.2× at 50%), not the ~20× Phase 30 recorded** — that was a `gangreward.js` bug (its
  "vs-current" column used the respect ratio for both axes; **fixed** to print money- and
  respect-multipliers separately). Phase 30's three deferral grounds were all wrong (the "80% combat
  / from-scratch build" mismatch ignores that power weights stat *magnitudes* — 0.15 × ~90k hack ≈
  13.5k vs rival powers 3.3k–16.5k, so a hacking gang is plausibly power-viable with zero combat
  training; "$25t catalog / below batcher" was stale; "permanent" assumed a static rival field that
  compounds ~+75%/day). **The operational call still holds** — territory is moot for BN2.1 because
  money isn't the binding constraint and saturates first (~$806b/day income meets the ~$310–400b need
  in ~½ day, vs ≥3–6 days to build meaningful territory) — but "PERMANENTLY deferred" is re-scoped to
  "deferred for this node"; future gang nodes must re-price. Two of the auditor's own sub-findings
  were **refuted** by the review and closed so they aren't re-worked: the 3-of-11 gang-aug "under-buy"
  (skipped 8 are pure-combat, no cha aug exists — the 3 are correct) and `ASCEND_MIN_FACTOR` (unvalidated
  but self-obsoleting, leave alone). Records: `phase-30-gang-territory.features.md` VERDICT,
  `BACKLOG.md` Tier 4, `src/gangreward.js`. No `gangmanager.js` change — audit only.

- **GOAL panel shows projected (post-install) M from queued augs.** Installed M sits flat through
  an entire buy cycle and only steps at install, so the GP2 tripwire reads "STALLED 12h" during
  normal money-paced buying — the flat installed-M gave no sign the queued augs are climbing.
  `augfarmer.js` now publishes `queuedGain` (product of the purchased-but-uninstalled augs' hacking
  mults) + `queuedCount`; `goallog.js`'s snapshot projects `queuedValue = installed M × queuedGain`
  + `queuedPct`; `dashboard.js` renders a `+queued: M 3.42 ~20% (9 augs pending install)` line under
  the M line (only when augs are pending). Purchased-only — excludes the speculative NFG tail
  (`trigger.totalGain`). Live-verified (M 1.51→3.42 queued, 9 pending). `npm test` 866/866; no RAM
  change (object-field reads only, no new `ns` surface).

## 2026-07-21

- **Gang money pivot — gang income ~7× ($598k/s → $4.2M/s), 8 members on Money Laundering.**
  The gang was optimizing RESPECT (rep-saturated: all NiteSec augs unlocked at 2.5m req, gang
  respect well over it) while MONEY is the only open BN2.1 gate. Two changes that only work
  together: `evalLadderMove` now optimizes money (promote by money gain, heat-demote worst
  money-per-heat, efficiency-demote a rung earning less than the one below; `gainsFor` adds
  `ns.formulas.gang.moneyGain`), and `TASK_LADDER` is money-ordered with the zero-money
  pure-respect tasks (DDoS/Plant Virus/Cyberterrorism) dropped (`LADDER_VERSION` 4→5). Measured
  prize: a Money-Laundering member earns ~40× a Ransomware member of equal stats.
  **Two live regressions preceded the fix and are the lesson:** (1) reordering the ladder alone
  regressed money ($598k→$138k/s) — the respect mover heat-demoted the top-money task; (2) turning
  formulas on with the respect ladder crashed it ($0.05M/s) — the mover climbed every high-stat
  member to Cyberterrorism (max respect, zero money) and the heat gate never stopped it (our stats
  make even that low-heat). The real lever throughout was that Formulas.exe was OFF (hacking 325 <
  400), which suspends the mover entirely. `npm test` 848/848; live-validated to steady state
  ($4.21M/s, netWanted −0.27, respect 7.9m). RAM unaffected (`formulas.gang` already charged).
- **Formulas.exe autobuy is now gang-aware.** The hacking>400 gate on the autobuy is a batcher
  tuning; a gang needs Formulas at any level (its mover suspends without it). `planFormulasPurchase`
  gains a `gangExists` input (from `gang-state.json` presence — 0 GB `ns.fileExists`, no gang-API
  import-bleed) that bypasses the level gate while still respecting TOR/stale/cash. Prevents the
  gang sitting un-optimized through the post-install hacking re-climb every cycle. +3 tests.
- **Gang log survives restarts.** `gangmanager.js` initialized its log buffer to `[]` and wrote in
  `"w"` mode, so every restart silently wiped all prior ascend/recruit/equip-buy events. New pure
  `seedGangLog` seeds from the persisted file (fallback `[]` on missing/malformed/non-array,
  ring-trimmed). Forward-only — history already lost is unrecoverable. +6 tests, live-validated.
- **Dashboard GANG panel shows the member task split.** New `tasks: Ransomware 9 | …` line, most-
  populous first, capped at `PANEL_ENTRY_CAP` with a `+N distinct more` suffix. Previously only
  visible via a manual `gang-state.json` read. Row/column budgets hold; +6 tests, live-confirmed.

- **Phase 33 (Workstreams A + C) — escalation-aware buy ordering + utility must-buys shipped.**
  `augfarmer.js` was overpaying its aug-purchase escalation structurally: every purchase raises the
  price of everything bought after it by ×1.9, but `pickTarget` sorted rep-met candidates
  cheapest-first — the exact worst order (measured: $58.17b paid vs $18.15b optimal on one basket).
  Fix: a tiered, price-DESC sort (tier 0 buyable discretes, tier 1 NFG, tier 2 fundBlocked
  discretes, tier 3 buyBlocked NFG) plus a fundability guard (`fundCap = money + income×4h`) that
  retires a live pathological case — the farmer had been reserving $325.8t for QLink, frozen, for
  90+ minutes. A must-buy hold (`evalTrigger`) + must-buy-first spend-down order
  (`spendDownPlan`) guarantee the three allow-listed utility augs (CashRoot, Neuroreceptor, Red
  Pill) actually get bought before an install, closing a starvation bug where they'd never won
  their score race. `npm test` 834/834 (261 in `augfarmer.test.js`, up from 232); `verify:log`
  carries two pre-existing, unrelated failures (already in `BACKLOG.md`). RAM held exactly at
  64.10 GB; the WD-gate probe (`worldprobe.js`, reused instead of writing a duplicate — its
  export was also silently broken and is now fixed) measured 1.8 GB. Live-validated same session:
  the head flipped off QLink onto a fundable aug within one poll of restart, and the live
  must-buy-cost arithmetic ($10.263b) matched the spec's hand-worked example ($10.27b) almost
  exactly. Buy-order-across-a-real-cycle and 24h-soak checks are logged as follow-ups, not
  blockers (spec's own stated gate).
  → [phase-33-money-throughput.closeout.md](phase-33-money-throughput.closeout.md)

- **Phase 32 — BN2.1 progress tracker shipped.** Dashboard couldn't answer "are we progressing
  toward ending BN2.1?" — the loud metrics (gang respect, faction rep) are solved subgoals, while
  the metric that actually gates the win (installed hacking mult `M` toward the `w0r1d_d43m0n`
  gate) had no readout. Step 1: `transactionsmonitor.js` now tracks gang income alongside hacking
  (gang was ~96% of income this cycle, previously untracked — `translog.js` gained a per-source
  `coalesceIndexForSource` helper so two sources landing in the same poll each fold correctly).
  Step 2: new resident `goallog.js` (60s cadence, ~3.1 GB) samples `M` + a smoothed gang+hacking
  $/sec + trend into a 48h ring, feeding a new `GOAL` panel — first in `dashboard.js`'s layout,
  zero added RAM (unchanged 2.6 GB). `augfarmer.js` gained an `awaitingMoneySince` stamp
  (restart-persisted) for the panel's elapsed awaiting-money timer. `npm test` 805/805 (28 new
  units); `verify:log` clean against real exported logs aside from two pre-existing, unrelated
  gaps (logged in `BACKLOG.md`). Live-validated end to end: gang income records confirmed
  post-restart, the L2 gang-equip/`sinceInstall` reconciliation agreed to within ~25%, the GOAL
  panel rendered correctly with no wrap/scroll, and the awaiting-money timer grew live. RAM gates
  held exactly at their pre-change baselines (`dashboard.js` 2.6 GB, `augfarmer.js` 64.1 GB,
  `transactionsmonitor.js` 2.6 GB, `daemon.js` 16.3 GB); `goallog.js` measured 3.1 GB against a
  ≤4.0 GB gate. Surfaced (logged, not fixed): a dead OR-term in `augfarmer.js`'s state-write gate,
  and an unrelated `verify-finance.test.js` whitelist gap.
  → [phase-32-bn2-progress-tracker.spec.md](phase-32-bn2-progress-tracker.spec.md)

- **Gang respect-rate sampler shipped (`src/gangratelog.js`).** The Phase 30 survivor slice:
  persists a durable `respectGainRate` / `wantedPenalty` / aggregate-hack-ascension-mult series
  that `gang-state.json`'s overwrite-in-place snapshot can't keep. Built as a thin consumer of
  `gang-state.json` (pure `ns.read`/`ns.write`, ~0 gang-API RAM, no coupling to `gangmanager.js`)
  rather than a second gang-API reader. Resident + daemon-supervised (survives restarts/installs);
  5-min samples, ring-capped 14 days → `logs/gang-rate-log.json`. 11 unit tests, live-validated.
  Closes BACKLOG item 1 of the Gang-Tier-4 survivor set; the cadence-count check (item 2) remains
  open. Gang Tier 4 (territory) stays deferred permanently.

- **Phase 31 (stall-arming) shipped — the money-blocked auto-install deadlock is fixed.** Adds a
  fourth install-trigger arming reason, `stallArmed`: the symmetric counterpart to the rep-side grind
  horizon, so a cycle stuck in `awaiting-money` past the adaptive stall threshold (12–48h, 24h
  fallback) now installs on its own instead of waiting forever (observed live: a 71.4h stall broken
  only by a manual `installer.js`). Arms on either the queued mult-gain gate or a new
  `STALL_QUEUE_FLOOR`=5 purchase-count floor (covers pure-padding queues), gated off during a
  productive grind. Pure-logic change — RAM unchanged at 64.1 GB; `npm test` 752/752 (10 new units +
  `reasons` regression handling). The spec's "next-day live gate" was re-priced at ship and met by
  inspection of `augfarmer-state.json` (the only untested link — the live `stalled` computation and
  its threading into `reasons` — confirmed directly) rather than by a passive 24h wait.
  → [phase-31-stall-arming.spec.md](phase-31-stall-arming.spec.md)
- **Phase 29 observation window closed early (day 1 of 7); `gangmanager.js` unfrozen.** Goal
  metric `respectGainRate ≥ 1.27/tick` was overshot ~425× (live 539.6) with 19h of clean
  autonomous soak, so the window was retired by decision rather than run to ~2026-07-27. Phase 29
  docs graduated to `docs/phases/`. Surfaced gap carried to Tier 4 brainstorm: no persisted
  `respectGainRate` series exists (`gang-state.json` is overwritten each tick).
  `docs/phases/phase-29-gang-scaling.spec.md` → Close-out.

## 2026-07-20

- **Gang rep pivot — the task ladder is pinned to Ransomware.** Tier 1's ladder was ordered by
  money and its promotion test asked only "did money go up?", so members climbed into tasks costing
  750× more wanted for 2× the respect. The gang overwhelmed its own cooling and spent **71.6% of
  4.3h** in the sink, where respect gain — which is what buys faction rep — is exactly 0. We are
  rep-gated, not money-gated ($4.128b held; the target aug costs $4m but needs 1,000 NiteSec rep
  against ~41), and gang money is ~0.003% of income. Pinned to one rung; climbing machinery left
  intact and quiet behind its existing top-rung early exit. Caught pre-ship: persisted rungs of 2
  would have resolved to `undefined` and silently idled the whole gang — now clamped, with a
  regression test. 704 tests. Acceptance (duty cycle, respect/hr, rep/hr) pending a few hours of
  live observation. → [phase-28-gang-rep-pivot.md](phase-28-gang-rep-pivot.md)
- **Aug-ratchet unblocked — it had been dormant since BN2 entry (~2 days) on a home-RAM deadlock.**
  Probe (prompted by "is `augfarmer.js` splittable?") found the standing diagnosis wrong on both
  counts: the script needs no split, and it has no home-only dependency — `installAugmentations`
  lives in `installer.js`, and every home reference passes an explicit host arg. The real deadlock:
  `installer.js` is the only thing that buys home RAM and only runs during an install, which the
  ratchet couldn't reach while home was too small to host the 64.10 GB farmer. Broken by buying one
  tier (64 → 128 GB, $31.862m against $3.076b held); `augfarmer.js` self-launched on the daemon's
  next retry and resumed (joined Chongqing + Tian Di Hui, targeting Neurotrainer I). New
  `src/upgradehomeramonce.js` — one tier, spend-capped — is the safe sibling to
  `upgradehomeram.js`'s full-bankroll drain. The deadlock is *not* auto-detected; see `BACKLOG.md`.
- **Phase 27 Tier 1 shipped — gang manager (recruit + task-assign).** `gangmanager.js` runs as a
  home-resident daemon companion: greedy recruitment, a measured money-ladder climb (probe-and-
  compare against `moneyGain` actuals, no Formulas.exe needed), and a wanted-level watchdog with
  enter/exit hysteresis. Equipment/ascension/territory (Tiers 2-4) are explicitly out of scope,
  grep-rail-enforced. Live-deployed: home RAM bought 32 → 64 GB ($10.083m, one tier);
  `gangmanager.js` measured 12.7 GB, landed in its priority slot; full resident census 59.1 GB
  against a 63.5 GB gate.
- **Live bug found and fixed same session: the wanted-sink baseline froze at tick zero.** A fresh
  gang starts *at* its wanted floor, so a "strictly new minimum `wantedLevel`" recalibration
  condition could mathematically never re-fire — the gang sat parked on the low-value sink task
  for 8.5+ hours before the fix landed. Corrected to "at or below" the lowest `wantedLevel` seen;
  redeployed live, confirmed recovery within a minute (first promotion of the run followed
  immediately). Full record: `docs/phases/phase-27-gang.closeout.md`.

## 2026-07-19

- **BN2 COMMITTED — the gang exists.** NiteSec, `isHacking: true`, fixed permanently. Sequence run
  live: backdoor `avmnite-02h` (BruteSSH + FTPCrack sufficed) → join NiteSec → `createGang`. This
  ended four days of circling: the gang API had been **entirely inert** until this call, so no gang
  work of any kind was possible before it. `gangprobe.js` now returns 15 tasks / 32 equipment /
  `errors: []`. Gang at handoff: respect 1, territory 14.3%, zero members, nothing running.
  Kenneth's closing argument, recorded because it generalizes: **a BitNode restart is cheap when
  the node holds no progress** — in-node permanence is bounded by restart cost, not infinite.
- **`gangaugs.js` — aug-catalog sweep across factions** (read-only, works pre-gang, no membership
  needed). Corrected the check that had blocked the BN2 decision on two counts: its "once in the
  gang faction" precondition was **false**, and it was aimed at the **wrong factions**. Measured:
  the five pure-criminal gang factions union to hacking **×1.061**, while the 17 non-gang factions
  union to **×23.121** — so a gang is worth ~+6% M, and its real value to BN2 is the money/rep
  engine that funds the megacorp catalog, not the augs it sells.
- **`share-off.txt` retired** on joining NiteSec — share back on at 1.12 TB / 280k threads, fleet
  utilization 6.4% → 27.6%. The auto-suppress-when-factionless rule that would prevent a repeat is
  still unbuilt (`BACKLOG.md`).
- **Convergence rules added to `CLAUDE.md`.** The "Working with Kenneth" section had six-plus rules
  telling Claude to *open* questions and none to *close* them; four days of circling was that
  imbalance executing as written. Every new rule constrains *that* a conclusion is reached, never
  *which* — the test Kenneth's yes-man concern produced. Diagnosis:
  `docs/metareference/divergence-without-convergence.md`.
- **`tools/bb`: new `join "<Faction>"` verb + `goto` badge fix.** `goto` used `exact: true`, but a
  pending invite renames the nav button to "1 Factions", breaking it precisely when it's needed.
  The `join` verb pairs each `Join!` button with its heading by DOM order and throws rather than
  clicking the wrong one — a naive first-match click would have joined Sector-12 and permanently
  foreclosed five city factions. Caveat learned the hard way: a click fired from inside
  `page.evaluate()` is untrusted and MUI ignores it *while reporting success*.

## 2026-07-18

- **BN1.3 CLEARED.** `w0r1d_d43m0n` backdoored ~10:41 AM, confirmed via the BitVerse-selection
  screen (`bb-shot.png`). Sequence: install #10 (Phase 26 A2's gate-release fire, unattended) →
  install #11 (manual, banked Daedalus favor via the donation shortcut in
  `docs/reputation-favor.md` — the automated ratchet has no path to this once `endgameHold`
  latches permanently) → auto-donate fired on its own → Red Pill bought → install #12 (manual,
  activates the Red Pill — owning it isn't enough, `w0r1d_d43m0n` needs it installed) →
  `backdoorwd.js` fired unattended. Full story, including the two automation gaps this exposed:
  `docs/phases/phase-26-ratchet-autonomy.closeout.md`. What's next is undecided — see
  `CLAUDE.md`'s "Current goal" line.
- **Phase 26 B1 shipped — companion supervisor + `HOME_RESERVE_GB` bump** (`phase26-b1`, held
  unmerged until after install #10 per the phase spec's S7 staging). `daemon.js`'s main loop now
  diffs `ns.ps("home")` against `RESIDENT_COMPANIONS` every 60s and relaunches any missing one via
  the existing `launchDetached`, with a 5-minute per-script backoff so an instantly-re-crashing
  script produces a bounded WARN cadence rather than a relaunch storm. A missing-but-doesn't-fit
  companion (normal for `augfarmer.js`'s 64.1 GB in a fresh node's early hours) gets its own
  `waiting-ram` state — one INFO line on entry, then silence — instead of a spurious WARN loop.
  `HOME_RESERVE_GB` 32 → 80 ships together (never separately): a relaunched `augfarmer.js` needs
  the headroom to actually fit. Self-terminating fulfillers (`procureprograms.js` and siblings)
  are deliberately unsupervised — their absence is success, not failure. New pure `planRelaunches`;
  `hosts.test.js`'s two `HOME_RESERVE_GB`-dependent fixtures updated as an intended change, plus a
  new case locking the 64→0 GB flip at the new reserve. Full suite green; daemon.js RAM flat at
  16.3 GB (already charged via `sampling.js`'s `ns.ps`). Merged 2026-07-18 after Phase 26 A2's
  install #10 completed live (confirmed via `ratchet-decisions.json`). **Live-validated same day
  (L4/L5):** `daemon.js` restart brought every companion back with state intact; killed
  `transactionsmonitor.js` and (separately, mid-`grinding`) `augfarmer.js` over CDP — both
  relaunched within one 60s supervisor tick, `augfarmer.js`'s cycle state (lastAugReset,
  boughtThisCycle, trigger) survived cleanly with no spurious re-fire. Found in the process (not
  fixed, see BACKLOG): `companion-relaunch` log events get FIFO-evicted from
  `daemon-batch-log.json` within minutes on a busy fleet — `trimLog` only pins the latest `mode`
  event, not this one.
- **Phase 26 A2 + B2 shipped — the endgame gate-release exception + stall-age detection**
  (`phase26-a2-b2`). A2: `evalTrigger` gains a third arming reason — `gateArmed`, true when
  currently-queued augs would close an in-scope faction's aug-count gate (`computeGateRelease`'s
  two-step check: does an installed-count gate exist, and does the SAME faction's requirement
  close on the owned-including-queued count) — deliberately independent of `endgameHold` and
  `MIN_TOTAL_GAIN`, guarded only by `closedByQueue` so an install that would not actually move the
  gate can never fire this way. This is the fix for A2, the deadlock A1's runaway uncovered: queued
  augs alone never install, so the gate never closed and Daedalus never invited. B2: augfarmer
  self-reports a stalled auto cycle — age since `lastAugReset` exceeding an adaptive threshold
  (3× the median observed cycle interval, clamped 12–48h) with no install in progress — as a
  `stall-warning` decision record + terminal WARN, re-warning every 6h while stalled. Deliberately
  NOT suppressed by `endgameHold` (gap 9's exact shape: healthy processes, zero progress,
  indefinitely). D9 lands alongside: `evalTrigger` now also names the NFG tail's binding
  constraint (`nfgBoundBy: "money"|"rep"|"none"`) on every record. Full suite (656 tests) green;
  RAM flat at 64.10 GB. **Live-validated 2026-07-18:** restarted `augfarmer.js` live, arming
  recorded within one poll (`trigger-arm`, `reasons.gateArmed: true`, `gateRelease` naming
  Daedalus, `totalGain` exactly 1 — no gain-side arming at all), fired at the full
  `TRIGGER_SUSTAIN_MS`, and install #10 landed via `installer.js` — the first unattended endgame
  install this ratchet has ever completed.
- **Phase 26 A1 shipped — gate-aware buying breaks the 29/30 deadlock** (`5ad32a3`). Every unowned
  filter-passing aug was sold only by Daedalus/Covenant/Illuminati, the factions the aug-count gate
  locks us out of, while every buyable aug scored 0.00 and was dropped — circular, unbreakable by
  time, money or rep. Adds `numAugmentations` to `evaluateRequirement` (it had been falling through
  to `default: return false`, so the requirement read unmet forever), `onlyAugCountGap` mirroring
  the existing `onlyCityGap`, plus `findAugCountGate` / `pickGateFiller` and a `gate-fill` branch.
  627 tests. **Shipped with a runaway, caught live in 90 seconds:** the gate was keyed on
  *installed* augs but buying only *queues* them, so the gap never closed and it re-fired every
  tick — 9 buys, $4.8m → $16.1b, ~$24.9b total. Seventh instance of the "what we have vs. what we
  will have" confusion, written in the session that documented the other six. Damage bounded
  (0.009% of cash, inflation resets on install, all 9 augs count toward the gate). **Process note:
  the decision to skip the spec stage for A1 (D12) did not pay off** — a cold reviewer asked for
  failure modes would plausibly have caught both the runaway and A2. → Phase 26 features doc.
- **Phase 26 A2 identified — nothing installs the queued augs.** `endgameHold` blocks arming, so no
  trigger fires, so no install, so the installed count stays 29 and Daedalus never invites, so the
  hold never clears. A1 solved "the engine won't buy the aug"; it did not solve "nothing installs
  it." Spec target — it edits an endgame path that has never run unattended.
- **Phase 25 FROZEN; Phase 26 opened.** The close-out had drifted into a live bug tracker —
  archived in `docs/phases/` yet still absorbing production bugs three days after shipping (gaps
  7, 8 and 9 all landed 2026-07-18). Phase 25's own defects are now all closed; the remaining
  items aren't its defects but design questions its spec never asked, so they moved to
  **`phase-26-ratchet-autonomy.features.md`** (repo root while active): supervision (gap 4),
  stall-age detection (gap 7's follow-on), NFG rep as a planned expense (gap 8's strategy half),
  and gate-aware buying (gap 9). Phase 26's thesis is the root cause all four share — **`score` is
  one number doing four jobs, and the engine has no representation of what it is currently trying
  to achieve**; six separate Phase 25 bugs were that same absence surfacing somewhere new.
- **Phase 25 gap 3 CLOSED — the Daedalus gate counts DISTINCT augs**, settled by our own position
  rather than a test: 29 distinct + ~50 NFG levels, every *other* requirement met (`$288t` ≥
  $100b, hacking 4251 ≥ 2500), and **no invite**. Prior evidence was consistent with both readings;
  what settled it was a state where they predict *different observable outcomes*.
- **Phase 25 gap 9 found — a hard deadlock now blocking the BN1.3 clear.** At 29/30 augs with
  `endgameHold` on, arming is blocked → no spend-down → only the *head* target is bought → the head
  is NFG forever → NFG never raises the distinct count. Wired Reflexes would close the gate for
  1,250 rep / $0.004b against $288t on hand, but scores 0 on hacking so the engine can't see it.
  Surfaced by a request to weight `company_rep`, which was **rejected** — it admits 4 zero-hacking
  augs and misses the actually-cheapest exit (a combat aug). → Phase 26 track A1.
- **`docs/neuroflux.md` — the ladder decomposes: 2.166 = 1.14 × 1.9.** The second factor is this
  build's **per-purchase aug cost multiplier**, which applies to *every* aug, not just NFG, and
  resets on install. So a $4m junk aug and a $25b real aug impose the same tax on everything bought
  after them — 1 buy ≈ 0.8 NFG levels, 4 ≈ 3.3, 18 ≈ cycle destroyed. This is the number that
  prices any "should we buy this?" decision, and it's why gate-buying must be tightly gated.

- **Phase 25 gap 8 — NFG's rep requirement climbs ×1.14/level; the close-out had recorded that it
  doesn't.** Install #9 measured repReq 122,736 → 998,737 over exactly 16 levels (= 1.14¹⁶). The
  original "checked" reading compared a before/after that spanned a catalog which hadn't rebuilt —
  the lesson being that a cross-install comparison is only as good as the rebuild between them.
  Load-bearing because rep resets to zero every install while the requirement doesn't: each cycle
  re-earns a compounding target (10k → 123k → 999k over three installs) on roughly linear rep
  income, so **rep is about to replace money as the binding constraint on the NFG tail and then
  shrink it every cycle** — and the tail is most of a cycle's gain (16 NFG levels vs 6 discrete
  augs at #9). Fixed: `NFG_REP_LADDER` + `nfgLevelsByRep`, with `spendDownPlan`'s buy loop and
  `evalTrigger`'s projection now bounded by **both** ladders (the projection was money-only, an
  optimism that inflates the `totalGain` `MIN_TOTAL_GAIN` gates on). 601 tests pass. New mechanics
  reference **`docs/neuroflux.md`** (+ `INDEX.md` row) — both ladders, the counting quirks, the
  seller rule. **Left open:** nothing plans NFG rep as an expense; donation is the only rep lever
  that scales with our surplus and isn't aimed at NFG. → close-out "Open gaps" (8).

- **Phase 25 gap 7 — the trigger could not arm at a rep-complete plateau; the auto cycle sat 25
  hours doing nothing.** After install #8 every one of the 38 reachable augs was rep-met, so
  `pickHorizonGrind` correctly returned no faction — and `evalTrigger` read "no horizon" as "don't
  arm" when it means "nothing left to wait on." `idle-plateau` couldn't catch it either: NFG's
  per-cycle cap keeps the action list non-empty, so `planActions` stays in `grinding`. Result:
  `gainArmed: true`, gain 2.36, **$3.3q idle, 25h stalled, every process healthy**. Fixed —
  `grinding` + nothing owed rep now arms (money-blocked stays excluded; that's `awaiting-money`).
  590 tests pass (7 new, incl. the live shape as a fixture and a guard against the money-blocked
  overreach); two older tests whose "does not arm" control *was* this state rewritten to assert
  their real intent. Validated live: armed 10s after the reload, `phaseArmed: true` /
  `horizonMs: null`. **Fifth instance of the phase's faction-identity confusion — and the first
  where the answer was "no faction at all"; the two prior fixes both only widened which faction
  gets picked.** It also failed with gap 4's exact signature (silent permanent stop, all processes
  alive), which is now a design constraint on gap 4: **the supervisor must watch progress, not
  processes.** → `docs/phases/phase-25-faction-strategy.closeout.md`, "Open gaps" (7).

## 2026-07-17

- **Phase 25's last open item closed: the first auto fire (L7) passed — install #6.** The
  aug-ratchet installed itself, unmodified, on the first attempt. Three steps that had never run
  in any form all fired: spend-down (bought 1 aug + 11 NFG levels), `ns.exec("installer.js")`,
  and `installAugmentations("bootstrap.js")` itself — plus home-cores 1 → 4 ($485.6b). Fire to
  reset took 11 seconds; `mults.hacking` 1.632 → 1.839, `hacking_exp` 1.704 → 2.823,
  `faction_rep` 1.491 → 2.125, Daedalus gate 8 → 15/30. Recovery via the cbScript was clean —
  7 factions rejoined and hacking 1 → 494 within 5 minutes — and the post-install false arm did
  **not** recur, settling the main risk carried out of the BN1.2 clear. Two predictions held:
  the observe-mode flap is real (10:21 cadence) and the `auto` latch pre-empts it. **Every step
  of the cycle is now proven; the phase has no open tests.** Reading L7's logs turned up two new
  bugs, neither blocking: spend-down logs *projected* prices rather than actual (~5-6×
  under-logged), and the NFG seller is picked by catalog order rather than by rep (worked by
  luck). → `phase-25-faction-strategy.closeout.md`.
- **Both L7 bugs fixed the same day (`4b80da4`).** `pickNfgSeller()` replaces `sellers[0]`: NFG's
  rep requirement is identical whoever sells it, so the joined faction with the *most* rep is
  strictly best — it's the only pick that can't suppress the whole NFG tail, and rep is what caps
  how many levels a spend-down takes. (Rep resets to 0 on install, so the old catalog-order pick
  was a coin-flip re-tossed every cycle; losing it wastes the entire bank.) The buy path now logs
  the live price read immediately before purchase, keeping the 1.9-ladder projection alongside as
  `projected` — so the next spend-down *measures* the real ladder instead of us inferring it. 584
  tests pass (6 new, incl. install #6's shape as a regression fixture); augfarmer RAM unchanged at
  64.10 GB; shipped live mid-cycle via `restart daemon.js`, since the spend-down the fix protects
  runs in the already-running augfarmer.
- **NFG price ladder measured and the projection corrected (`fix/nfg-ladder-measured`).** With
  gap 5 logging paid-vs-projected, installs #7-#8 ran unattended and install #8's 11-level
  spend-down revealed the true ladder: a dead-constant **2.166** (the old 1.9 was an eyeball
  estimate ~14% low, compounding). `NFG_PRICE_LADDER` set to 2.166. Bumping it alone would have
  been wrong: `evalTrigger`'s `nfgLevelsProjected` is the geometric closed form
  `k = floor(log(1 + money*(L-1)/p) / log L)`, but the `(L-1)` factor had been written as the
  literal 0.9 — exactly `1.9 - 1`, silently coupled to the old ladder — so it's now
  `(NFG_PRICE_LADDER - 1)` and both track together. Validated against reality: predicts 11 levels
  for install #8, matching what spend-down bought (old formula over-projected 13); the live
  projection dropped 17 → 14 on the restart. This was gap 1's root cause — the over-projection
  inflated `totalGain`, making `MIN_TOTAL_GAIN` less conservative than it read; it's now honest.
  Also confirmed gap 6 live: installs #7/#8 bought NFG from NiteSec / The Black Hand (highest
  rep), not CyberSec. 584 tests; shipped mid-cycle via `restart daemon.js`.

## 2026-07-16

- **Install trigger revived — it had been structurally dead, and S11's gate is now MET.** Two
  wiring bugs, both variants of one confusion: `evalTrigger`'s grind horizon answered "what do we
  buy next" instead of "how long until the next aug is reachable". (1) The horizon read
  `pickTarget`'s **head**, but Phase 25's own same-day `buyBlocked` fix (`9a6643c`) made NFG a
  permanent candidate — and the head is always NFG, rep-met at deficit 0 — so the horizon was
  always `0/rate = 0` and `phaseArmed` could never be true. `idle-plateau` was unreachable for the
  same reason. **No arm was possible in any cycle**; `ratchet-mode.txt` → `auto` would have been a
  no-op. (2) Routing it through `pickWorkFaction` fixed only the actively-worked case — that skips
  PASSIVE_REP_FACTIONS and falls back to the rep-met head, so a passive-only plateau still could
  not arm. `pickHorizonGrind` now takes the sorted candidates and returns the highest-priority one
  still owed rep: `pickWorkFaction`'s filter minus the passive skip, no head fallback.
  **Live result:** first arm ever via the horizon path (22:32:14Z, horizon 55.47h vs the 8h
  threshold, gain 1.370, 8 augs queued, ~$1.47T idle) and the **first `install-ready` fire ever
  observed** (22:42:14Z, a clean 600s sustain). Kenneth judged the timing **"about right"** —
  which is exactly S11's validation datum, never collected until now. Also: `dashboard.js` now
  shows the work faction alongside the head target (the panel had read "grinding for NFG at
  CyberSec" while the slot ground Sector-12 — Kenneth spotted it, and it is how the dead trigger
  stayed invisible). → `aeeb632`, `b5b654d`, `3feb4b4`; **handoff + all open items:**
  [`phase-25-faction-strategy.closeout.md`](phase-25-faction-strategy.closeout.md).

## 2026-07-15

- **Phase 25 close-out — BN1.2 CLEARED, live-debugged in one continuous session** →
  `docs/phases/phase-25-faction-strategy.spec.md`'s "Close-out (2026-07-15)" section has the
  full record. The aug-ratchet controller shipped 2026-07-14 got its first real live use this
  session and found two genuine bugs same-day: NFG dropped out of targeting entirely once any
  level was owned (repeatable augs need different "owned" handling than discrete ones), and
  separately the one-NFG-per-cycle buy cap was also blocking *grinding* toward it (fixed via a
  `buyBlocked` flag that decouples "can't buy this cycle" from "stop targeting"). Live use also
  drove three amendments beyond the original spec: `scoreAug` gained `SCORE_W_MONEY`/
  `SCORE_W_SPEED` (ENM Analyze Engine/DMA Upgrade were scoring 0 despite real income value);
  `UTILITY_ALLOWLIST` gained CashRoot Starter Kit (speeds up post-install bootstrap) and — the
  big one — **The Red Pill**, reversing three phases' worth of "drops by construction" by
  Kenneth's explicit same-day authorization; a new Daedalus-endgame $ reservation
  (`daedalusInviteReserve`/`daedalusDonationReserve`) protects the $100b invite gate and then
  the live, shrinking donation cost, after cloud-fleet growth was found actively delaying the
  Daedalus rejoin. Kenneth then explicitly asked to "remove all" remaining manual endgame
  gates: auto-donate to Daedalus (`shouldDonateToDaedalus`, extends S6's route to Daedalus,
  previously excluded), and a new `src/backdoorwd.js` that auto-backdoors `w0r1d_d43m0n` once
  it exists and hacking clears its requirement (deliberately its own file, not folded into
  `backdoorfactions.js` — the single most consequential automated action in the project, ends
  the BitNode). The full chain fired unattended and correctly on the first attempt: Red Pill
  auto-bought, Kenneth installed manually (auto-*install* itself deliberately left untested for
  the run-ending install), hacking re-climbed, `backdoorwd.js` backdoored WD — confirmed live
  via a BitVerse-selection-screen screenshot. `npm test` 568/568 green throughout. **Left open,
  carries to the next node/cycle:** auto-install has never fired in any form; the trigger armed
  once but never sustained long enough to fire; `backdoorwd.js` has exactly one live data
  point. `CLAUDE.md`'s current-goal line updated — BN1.2 done, next-node choice (BN5 per the
  existing plan) awaits reconfirmation.

## 2026-07-14 (2)

- **Phase 25 — autonomous aug-ratchet / faction strategy, implementation landed (live validation
  pending)** → `docs/phases/phase-25-faction-strategy.features.md`,
  `docs/phases/phase-25-faction-strategy.spec.md`. Upgrades `src/augfarmer.js` (Phase 23's naive
  cheapest-rep-deficit farmer) into a score-based ratchet controller, and adds `src/installer.js` —
  **the one file now authorized to call `installAugmentations`**, reversing Phase 23's hard "never"
  rail (`docs/reset-protocol.md`'s Core rule rewritten, not just relaxed): the call is isolated to
  `installer.js`, exec'd only from `augfarmer.js`'s auto-mode branch, reachable only when Kenneth
  hand-writes `auto` into `ratchet-mode.txt` — default (file missing/anything else) is **observe
  mode: no install, no spend-down, ever.** Landed this pass: S3's score-based aug targeting
  (`scoreAug` — hacking weight 1, `hacking_exp`/`faction_rep` at a discounted 0.5, replacing D2's
  10-key filter; `UTILITY_ALLOWLIST` trimmed to just NRMI, dropping CashRoot Starter Kit and The
  Blade's Simulacrum since the 30-aug Daedalus gate is already met); S4's proactive multi-join +
  camp commitment (`pickCamp`/`computeCamps` derive the three camps from the live enemy graph's
  ally-relation connected components, not hard-coded city names — regression-locked by a shuffled-
  graph unit test); S5's work-slot allocation around `PASSIVE_REP_FACTIONS`; S6's generalized
  donation route (favor-threshold gated, `Formulas.exe`-guarded, `DONATION_BUFFER`-buffered,
  Daedalus excluded via the endgame hold); S7's install trigger (`evalTrigger` — a projected-mult
  gain floor, a 10-minute sustain window, and an auto-mode latch that only Kenneth's two abort
  levers, the mode file or the pause file, can clear); S8's endgame hold
  (`joined(Daedalus) || hacking>=2500`); S9's `ratchet-decisions.json` append-only audit-trail
  ring; S10's auto-mode spend-down (lifts the one-NFG-per-cycle cap, freezes the full-money
  reserve) + `installer.js` handoff (max home RAM, then cores, then `installAugmentations(
  "bootstrap.js")`). `npm test` 550/550 green including 115 tests in the rewritten
  `test/augfarmer.test.js` and the new `test/verify-ratchet.test.js`; `npm run verify:log` green.
  **Live smoke-test (same session, Claude-driven over CDP, L1–L3 of the spec's procedure):**
  restarted `daemon.js`; `ramcheck.js` measured **augfarmer.js 64.1 GB** and **installer.js
  18.15 GB** (both inside S12's 55–70/12–22 GB bands; `daemon.js` flat at 16.3 GB, confirming no
  leak into the batcher core) — recorded in both files' headers. Within the first poll: two
  proactive joins fired in one pass (Sector-12, The Black Hand), a proactive travel landed, and
  `campChoice` read `{Aevum, Sector-12}` via the reality rule (Aevum already joined this cycle) —
  `campLocksInForce` correctly listed the other camp as blocked. `ratchet-decisions.json` exported
  correctly after a dev-server restart (needed to pick up the new `vite.config.ts` line) with
  well-formed `endgame-hold`/`camp-choice` records carrying the full constants block.
  `augfarmer-state.json` showed a sane `trigger` object (`gainArmed: true, phaseArmed: false` —
  correctly not yet armed, since `RATE_MIN_SAMPLES` hadn't accumulated on a freshly restarted
  farmer) and `workFaction` correctly falling back to the head target per S5 (every grindable
  candidate that pass was in `PASSIVE_REP_FACTIONS`). `dashboard.js`'s AUG FARMER panel rendered
  the new phase/state with zero wrap, confirming the "no dashboard changes needed" design bet.
  **Explicitly not closed by this entry** — S11's phase-close gate still needs a real observe-mode
  `install-ready` fire Kenneth judges, plus one manual install cycle's audit trail verified from
  exported logs (L4–L6 of the live procedure, plus a longer L6 soak). BACKLOG gained an S11
  "Stage-2 first auto-fire" entry (parked on Kenneth writing `auto`) and resolved/narrowed the
  install-order-calculator, augment-breadth-vs-depth, and `upgradeHomeRam`-validation entries this
  phase subsumed.

## 2026-07-14

- **Phase 24 — single condensed dashboard window (`src/dashboard.js`), shipped** →
  `docs/phases/phase-24-dashboard.features.md`, `docs/phases/phase-24-dashboard.spec.md`.
  Phase 18 Layer 3: collapses the seven standing companion tails (`daemon`, `targetsmonitor`,
  `transactionsmonitor`, `cloudmanager`, `resourcemanager`, `xpfarm`, `augfarmer`) into one
  hardcoded-geometry renderer (891×1262, font 16, re-asserted every poll) reading seven on-disk
  state files; every companion goes headless (keeps its print block for manual `tail`).
  `tailmanager.js` + `tail-layout.json` retired in full — nothing left for Phase 18's
  geometry-persistence system to manage with one self-asserting window. New project convention
  landed in `CLAUDE.md`: **"use dashboard or logs"** (dashboard space is brainstorm-gated, never
  ad-hoc). Notable spec-stage/implementation deviations: S6 gave `xpfarm.js` a state-file snapshot
  beyond the features table's "headless only" (parse-per-poll of its ring log was the alternative);
  S13 reversed the Phase 11 precedent and exported `finance-state.json` (its live tail is gone, so
  the panel needed offline evidence); S10's `tailProperties.minimized` fallback was never needed —
  confirmed live that `resizeTail` does not fight the native collapse in this build. `npm test`
  488/488 green including new `test/dashboard.test.js`, `test/targetsmonitor.test.js`,
  `test/verify-dashboard-state.test.js`; `npm run verify:log` green (5 files, 42 checks) against
  real exported state.
  **Live validation (same session):** L1 — restart via CDP, exactly one `dashboard.js` tail at the
  correct geometry; a genuine orphan surfaced and confirmed the bug class the spec anticipated (a
  leftover `daemon`-titled tail from the now-deleted `tailmanager.js`'s last retitling, pre-existing
  the deletion — closed by hand once, structurally impossible going forward since nothing retitles
  anymore). L2 — column budget measured precisely via the ruler (JetBrainsMono 9.6001 px/char at
  font 16, Paper clientWidth 890px) at **92 chars**, not the features doc's provisional ~88;
  `COLUMN_BUDGET` updated and re-verified with zero wrap. L3 — dragged the window via CDP mouse
  events: position persisted across polls (not reasserted, as designed); clicked native
  minimize/restore: stayed collapsed across 2+ polls, confirming the `tailProperties.minimized`
  fallback is unnecessary. L4 — two consecutive `restart daemon.js` calls and a manual
  `kill dashboard.js` (testing the `ns.atExit` self-close directly) both left exactly one window,
  correctly positioned. L5 — killed `cloudmanager.js` and confirmed its panel alone showed
  `STALE 53s` in its title line while all six other panels kept rendering live data; relaunched via
  daemon restart. RAM gate: `dashboard.js` measured 2.6 GB (within the 2–4 GB band) after fixing a
  **new identifier-hygiene finding** — a `state.share` property access (not a variable
  declaration) was misread by this build's RAM analyzer as `ns.share()` (a false +2.4 GB, 5 GB
  measured before the fix); switched to bracket notation (`state["share"]`); daemon.js (16.3 GB)
  and augfarmer.js (52.7 GB) confirmed flat against their documented baselines. `CLAUDE.md`'s
  script-writing rules gained a generalized version of this lesson (property-name collisions, not
  just the previously-known `.exec(` substring case). L3's resize-handle drag was confirmed by
  Kenneth in-game (snaps back to 891×1262). L6 — a 4-check, ~32 min unattended soak (background
  script polling window count/geometry/overflow every ~8 min) confirmed the same PIDs running
  throughout (zero restarts), exactly one window every check, longest rendered line 78-80 chars
  (comfortably under the 92-char budget), and no vertical overflow at any check -- no wrap/scroll
  creep. Every acceptance criterion closed. Merged to `master` and pushed.

## 2026-07-13

- **Phase 23 — auto augmentation farmer (`src/augfarmer.js`), shipped** →
  `docs/phases/phase-23-augfarmer.features.md`, `docs/phases/phase-23-augfarmer.spec.md`.
  Always-on Singularity companion that joins factions within a 13-name D11-authorized
  `FACTION_SCOPE`, grinds rep, and buys the next cheapest-rep-deficit augmentation forever —
  composes with Phase 22's `backdoorfactions.js` (unlock half); install stays 100% Kenneth's
  (`installAugmentations` never called, grep-checked). New `next-aug` reservation rule in
  `resourcemanager.js` (Singularity-free). Notable spec-stage calls: S1 reinterpreted D1's
  "lowest rep requirement" as rep *deficit* (so an already-rep-met aug in a joined faction always
  sorts first); S9 added a pause file (`augfarmer-pause.txt`, beyond the features doc); the
  pre-existing `auto-formulas` verify-transactions gap (BACKLOG) was folded into this phase's ship
  gate rather than fixed separately. Phase 22's grep-for-`joinFaction` rail is retired (replaced by
  the `FACTION_SCOPE`-routed rail, both grep/test-checked) — `docs/reset-protocol.md` updated.
  `npm test` 452/452 green. **Live validation (same session, ~35 min):** RAM measured 52.7 GB
  (S6's 45–60 GB band), `daemon.js` flat at 16.3 GB; catalog-exported camp graph matches the
  features table exactly (camps A/B/C) with Daedalus enemy-free; auto-joined 5 factions total
  (4 on launch + a live mid-run `Tian Di Hui` join once its rep target came up) and 3 augs bought
  unattended (Magnetism Amplifier $250m, Neural Wit Amplifier $19m, Speech Enhancement $45.125m —
  `auto-aug` transactions match each state-file target exactly); a live `travelToCity` fired for a
  city-gap target (`auto-travel`, Chongqing); the ≥30 min soak (L6) passed with zero WARNs/per-poll
  spam; `npm run verify:log` green throughout, including the new
  `auto-aug`/`auto-travel`/`auto-formulas` sources. **`next-aug` reservation, explained rather
  than observed positive:** it never showed a nonzero amount this session — with the batcher
  running ~$10b+/min income, every rep-met target was instantly affordable, so the buy always
  landed in the same pass the reservation would have been written, clearing it (S7 finding 4)
  before `resourcemanager.js`'s next 2s poll could ever see it positive. The mechanism itself
  (`parseAugReserve`, the reserve/buy gating in `planPass`) is fully unit-tested; the "awaiting
  money" state it guards just never arose on this money-rich save, which is D8's rationale working
  as designed, not a gap. Merged to `master` and pushed.

- **Auto-backdoor Tier-2 validation, closed** — `src/backdoorfactions.js` confirmed live on a
  genuinely fresh reset (BN1.2 install): all four backdoor targets (CSEC, avmnite-02h, I.I.I.I,
  run4theh111z) auto-backdoored correctly during the climb from hacking level 1, with zero
  auto-joins (verified no `joinFaction`/`workForFaction` call exists in `src/`). `logs/backdoor-
  status.json` shows `allDone: true` at hacking 537. Tier 1 (mid-run backdooring) had already
  shipped; this closes the deferred fresh-node case.
- **Phase 20 — XP-farm engine, close-out** → `phase-20-xpfarm.features.md`,
  `phase-20-xpfarm.spec.md`. Dedicated hack-saturation XP engine (`src/xpfarm.js`,
  `src/xphack.js`, `src/xpweaken.js`) that fills the fleet's surplus RAM — whatever the money
  batcher and share pool leave unclaimed — with fire-and-forget hack workers against the
  highest-difficulty eligible servers, self-scaling from ~0 on a busy young fleet to
  near-total on an idle endgame one. Two amendments landed after the initial ship attempt
  surfaced live bugs: **S8** (sized, cooldown-gated crush volleys, replacing an unbounded
  single-pass burst that locked the fleet up on restart) and **S9** (demand-driven packing —
  volleys → wave-sized held weaken streams → capped 2,500-thread hack waves → an overflow
  absorber on the highest-reqLevel target — replacing whole-host round-robin, which let
  per-target hack waves grow unbounded and pinned high-req targets at security 100
  indefinitely, and a RAM-fraction weaken split that over-delivered security reduction
  ~4.6×). `npm test` 390/390 green; RAM gate flat 5.85GB (byte-verified, no new ns surface).
  **Live-confirmed over a multi-hour unattended run:** zero hack-wave-cap violations across
  1,104+ target-records; D2's weaken/hack ratio measured at 0.0503 (target ~0.05, was 0.185
  pre-fix); all held targets converged to tight sawtooths around their own min security;
  money-independence of hack exp confirmed analytically via `Formulas.exe`. **Ship gate
  (S7, ON/OFF A/B, `xp-off.txt` toggle, ≥30 min/window): engine-on 260,523 exp/sec vs
  engine-off 50,620 exp/sec — 5.15× (pass, ≥3× required).** `src/xpprobe.js` (brainstorm
  probe) removed, its findings folded into the features doc.

## 2026-07-12

- **Auto-buy Formulas.exe (`src/procureformulas.js`) — fulfill the standing reservation SF4
  unblocked.** `resourcemanager.js` has reserved $5b for Formulas.exe since Phase 11 but nothing
  ever bought it (kept hand-buy-only under the then-live "zero Singularity" constraint), leaving
  $5b earmarked-but-idle every run. With SF4 now granted, a new resident Singularity companion
  (the `backdoorfactions.js` model, `launchDetached` from `daemon.js` startup) buys Formulas once
  hacking clears the same `>400` gate `resourcemanager.js` uses for the reservation and it's
  affordable above the bootstrap holdback, then exits; `daemon.js` already re-checks the file each
  cycle and flips legacy→formulas math live, no restart. Resident (not self-terminating like
  `procureprograms.js`) because `>400` is reached long after the openers are bought, so a one-shot
  would exit before eligibility. Vetoable via the existing `finance-disable-formulas.txt` flag.
  Pure `planFormulasPurchase` decision (13 unit tests); fail-safes mirror `procureprograms.js`
  (stale finance state → buy nothing; `purchaseProgram` throw → print once + exit). Note: programs
  don't persist across installs, so this re-pays $5b per install — accepted as an explicit choice
  (option 1 of the three-way fork), the `>400` gate keeping it from firing during the fragile
  post-install ramp.
- **Post-install study kick (`src/studybootstrap.js`) — convert post-install dead time to
  hacking XP.** After an augment install the character idles at hacking ~1 with a wiped fleet
  and no port openers, so the batcher/`xpfarm.js` produce ~no XP and the level can sit at 1 for
  hours (observed live). New one-shot Singularity companion (the `procureprograms.js` isolation
  model, `launchDetached` from `daemon.js` startup): if `hack < 10`, start Rothman University
  Computer Science unfocused (`focus:false`), then exit — no stop/handoff (explicitly scoped out
  as future work). Trigger is `< 10` not `== 1` so a stray bootloop weaken bumping you to 2-3
  can't make it miss the post-install window. Guards: SF4 active (`getResetInfo().ownedSF`) +
  try/catch backstop for the Singularity throw, and in-Sector-12 (no `travelToCity` spend — you
  land there post-install; Rothman is local). Validated: `npm test` (346 pass), live standalone
  run + live daemon-startup auto-launch both clean-skip at hacking 545; the actual study trigger
  (`hack < 10`) is inherently live-only, deferred to next install.
- **Phase 22 — auto-backdoor the four hacking-faction servers, live-validated end-to-end.**
  New self-terminating Singularity fulfiller (`src/backdoorfactions.js`, the
  `procureprograms.js` model): roots + walks + `installBackdoor()`s CSEC/`avmnite-02h`/
  `I.I.I.I`/`run4theh111z` as hacking level allows, never calls anything that joins a
  faction (hard rail enforced by grep in acceptance — the join-verb string appears nowhere
  in `src/`). Spec-stage addition beyond the features file: a `backdoor-status.json`
  overwrite-in-place snapshot (`vite.config.ts` filter added), since CLAUDE.md's
  log-over-paste convention needs *some* export and the features file's events-log
  infrastructure stayed deliberately deleted. `common.js`'s `findPath` gained a `start`
  parameter (default `"home"`, byte-identical for the existing `connect.js` call site) so
  the walk can path from wherever the terminal currently sits, not just from home.
  **Live validation ran Tier 1 for real, not just mocked** (hacking level had already
  climbed to 371 by the live pass): CSEC, `avmnite-02h`, and `I.I.I.I` all backdoored
  automatically within the run, each surfacing its faction invite with zero auto-joins
  (all three "Decide later"'d); `run4theh111z` (542) still pending. RAM measured **11 GB**
  at SF4.3's 1× multiplier (spec's derived ~9–13 GB band), `daemon.js` flat at 16.3 GB.
  Tier 2 (fresh-node reset → climb → invite from scratch) stays deferred to the next
  install/reset (tracked in BACKLOG). **Unrelated finding surfaced, not fixed here:**
  `npm run verify:log`'s event-type checker doesn't recognize the pre-existing `rooted`
  event type (`hosts.js`) — confirmed pre-existing on `master` via `git stash`, logged as
  its own BACKLOG bug rather than folded into this phase's diff.
  `phase-22-autobackdoor.features.md` / `.spec.md`.

- **procureprograms.js — TOR/port-opener auto-buy validated live (backlog close-out, no code change).**
  With SF4 now permanent (Phase 21), the Singularity buy path that had only ever exercised its
  "SF4 missing → exit cleanly" branch was finally watched end-to-end. Triggered by an aug install
  (a 1-level NeuroFlux, chosen as the cheap validation vehicle Kenneth accepted the re-climb for),
  which wipes all six programs → watched the re-buy during re-bootstrap. **Confirmed live this
  cycle:** launches past the SF4 guard with no runtime-error popup; sees 0 owned; respects the
  $110k bootstrap holdback ("waiting for cash"); buys **TOR first** (`auto-tor` $200k @ 09:55:27 —
  first-ever logged capture of that call); walks openers **cheapest-first** (BruteSSH $500k →
  FTPCrack $1.5m); reservations release in `finance-log.json` as each is bought. **Self-termination
  taken on evidence, not re-observed this cycle** — today's log already held a full completed-and-
  exited cycle (4 openers bought earlier, tail closed at session start = the summary→`closeTail`→exit
  after-state), and the exit is 3 trivially-correct lines; forcing it via a `.txt` flag was rejected
  as a permanent test-hook in a hot script for near-zero risk (decision: close on evidence). The
  ladder itself parked at 6/9 mid-validation — **not a bug**: income plateaued below relaySMTP's $5m
  reservation (`available = money − reserved = 0`), the reservation model correctly protecting the
  opener cash from cloudmanager. Closes the *"Re-validate procureprograms TOR/opener ladder live"*
  backlog item and moots the *"Lightweight Source-File watcher"* item (SF4 permanent + daemon
  launches it at startup → no wait-for-SF scenario). **Open follow-ups surfaced, not closed:**
  `upgradeHomeRam` Singularity call still unvalidated (home RAM was UI-bought, no `home-ram-upgrade`
  log); the fleet ran ~90% idle on ~1TB persisted home RAM (income plateau) — feeds Phase 20 and the
  finance-manager brainstorm; and the reservation model demonstrably coordinates cloud-vs-program
  spends but protects only the *immediate-next* opener — the exact priority seam a future aug
  purchaser would expose.

- **Phase 21 — Grant SF4.3 via save edit** → `phase-21-sf4-grant.features.md`,
  `phase-21-sf4-grant.spec.md`. Deliberate save-file cheat: own Source-File 4 level 3 (1×
  Singularity RAM) without playing BN4, unlocking `ns.singularity.*` inside the ongoing BN1.2
  run. Core edit is exactly one substring insertion (`sourceFiles.data` `[[1,1]]` →
  `[[1,1],[4,3]]`, +6 bytes), derived via `JSON.stringify` so the escaping always matches the
  save's own format rather than hand-typed backslashes. `tools/save/savelib.mjs` is the pure
  transform with four hard-fail guards (needle-count, byte-delta, parse-integrity, a structured
  diff that only permits `sourceFiles.data` to change); `tools/save/sf4grant.mjs` is the CLI
  (`grant`/`describe`); `src/sf4check.js` is the one-shot Singularity liveness probe, isolated
  from `daemon.js` per the RAM-isolation rule. `npm test` 330/330 (9 new in
  `test/savegrant.test.js`, hermetic against an in-code fixture) — the same guard/diff code
  path is re-run against the real save at apply time, so the fixture tests and the live
  transform share identical logic. **Spec-stage S1 override (Kenneth signed off):** the
  features doc's plan to hand-write `SF4.1`/`4.2`/`4.3` achievement records turned out
  unimplementable — only one SF achievement exists per BitNode (`SF4.1`), and the game
  self-grants it once the map holds `[4,3]`, confirmed live (achievements page showed `SF4.1`
  acquired at 8:21:46 AM, between the import and the first liveness check) — so the edit
  stayed exactly the one insertion, nothing achievement-related to write.
  `saves/` consolidated with a committed `INDEX.md` (two repo-root `.gz` moved in, extraction
  dirs + scratch `.pretty.json` deleted, `.gitignore` re-anchored to `/bitburnerSave_*.json.gz`
  so `saves/*.json.gz` is trackable while the bulky decompressed/pretty forms stay ignored).
  **Live sitting (L1–L7) run same day, all passed:** fresh Backup Save indexed + committed as
  `pre-edit-backup` before the transform touched anything; `grant` on the real save reported
  `ALL GUARDS PASSED`, +6 bytes, summary differing only in `sfLevels`; Import Save accepted the
  `.gz` cleanly (no fallback ladder needed); `sf4check.js`'s exported log showed
  `ownedSF: [[1,1],[4,3]]` and a non-throwing `singularityProbe: 4`; `ramcheck.js` measured
  **7.65 GB**, landing exactly on the 1× derivation (1.6 base + 1.0 `getResetInfo` + 0.05
  `getHackingLevel` + 5 GB singularity call), nowhere near the 4×/16× bands; a second Backup
  Save (`post-import-reexport`) confirmed `[4,3]` survives a real load/save cycle — S8's
  rollback contingency never triggered. **Same-sitting addendum (not originally spec'd):** a
  narrative toast popup blocked every CDP `goto`/`terminal` click mid-sitting; added
  `dismissStoryPopup` to `tools/bb/driver.mjs` (fires only when the entire accessible tree is
  one nameless button + narrative text — can't misfire onto a real confirm/buy/install dialog,
  which always exposes multiple/named controls) and pre-authorized it in `CLAUDE.md` so future
  story popups no longer need Kenneth to clear by hand. **Supersedes the SF4-gated backlog**
  (auto-backdoor, aug-planner execution, TOR ladder, rep watchers) — each becomes its own later
  phase, none folded into this one.

## 2026-07-08

- **Phase 18 — readable, self-placing dashboard windows** →
  `phase-18-dashboards.features.md`, `phase-18-dashboards.spec.md`. Fixed the five in-game
  tail windows' line-wrap (too narrow), header scrolling out of view (content taller than
  window), and manual re-dragging/resizing every aug install (nothing set geometry). New
  headless `src/tailmanager.js` companion centrally restores each window's saved
  position/size/font on launch and persists Kenneth's tweaks to `tail-layout.json` (one
  0.3GB `getRunningScript` cost total, not one per window; every `ns.ui.*` call used is
  0GB). Pure `reconcileTick` decision core with an explicit RESTORING/TRACKING mode per
  window (a spec-reviewer blocker caught the original 3-arg signature omitting that state,
  which would have snapped windows back against the user's own drag — fixed before
  implementation). Content pass across `daemon.js`/`targetsmonitor.js`/
  `transactionsmonitor.js`/`cloudmanager.js`/`resourcemanager.js` applying "status in
  popups, lists in logs": daemon's member+draining list capped at 12 (+N more); redundant
  log-duplicated lines (skip/shrunk counters, last-launch, prep-dispatch detail, saturated-
  skip INFO) dropped from the tail; targets shows top 5 + a pointer to the full-ranking
  export; transactions collapses to totals + last 3 with a filename footer; cloud/resource
  manager lines tightened. `logEvent` calls and the daemon-batch-log schema untouched;
  `transactionsmonitor.js`'s income-writer block untouched. Two same-session addendums
  (folded in during live validation, not originally spec'd): `killscripts.js` now closes
  each process's tail window in the same loop that kills it (`ns.kill()` doesn't auto-close
  a tail), and `procureprograms.js` closes its own tail at each of its four self-terminating
  exit points (a script finishing on its own doesn't auto-close it either) — both were
  leaving frozen orphan windows on every daemon restart / natural exit. `npm test` 317/317
  (24 new). **Live-confirmed same day**: RAM gate — `daemon.js`/`targetsmonitor.js`/
  `resourcemanager.js` flat against their recorded baselines (16.30/12.70/3.35 GB),
  `tailmanager.js` landed exactly on its predicted ~1.9GB, `cloudmanager.js`/
  `transactionsmonitor.js` flat (no recorded prior baseline, but pure string/format edits
  can't move reachability-based RAM); all five windows self-placed into the right-edge
  column on first run; two manually-dragged windows (`cloudmanager.js`/`resourcemanager.js`)
  persisted through a daemon restart and returned to their exact tweaked geometry; orphaned
  windows confirmed gone after the `killscripts.js` fix; `procureprograms.js` observed
  closing its own window on a natural exit; `npm run verify:log` 36/36 green against a fresh
  post-restart export. Layer 3 (single condensed window) deferred — filed in BACKLOG Ideas.

- **Phase 17 — home-core-aware grow/weaken sizing: investigated, measured, SHELVED** →
  `phase-17-home-cores.features.md`. `sampling.js` sizes all grow/weaken thread math at an
  implicit 1 core (both legacy and formulas branches), but `home` is a real worker host with
  >1 core. A throwaway in-game probe (`src/coreprobe.js`, since removed; evidence
  `logs/coreprobe-1783550870612.json`) answered both gating questions: **(Q1)** grow's
  per-thread security increase is **core-independent** (flat at 4 across cores 1–16), so the
  original "correctness drift bug" claim was **wrong** — cores=1 sizing is a safe overshoot,
  making this pure efficiency; **(Q2)** home was 19.4% of allocatable RAM at probe time
  (surprise — but only because the fleet was in a small post-reset state; the share decays as
  purchased servers are rebought). Measured core factor: 5.9%/thread saved at home's current 2
  cores (`1+(cores-1)/16`), so ~1% of fleet RAM reclaimed today, rising to ~5–8% only at 8–16
  cores — which needs Singularity-gated `upgradeHomeCores()` not yet automatable. Verdict
  (Kenneth): not worth reordering the batcher hot path (sizing runs before host assignment) for
  a ~1% transient gain; **revisit when home cores get upgraded**. No code shipped; probe + its
  `vite.config.ts` download filter removed. Co-scope with Phase 8's deferred core-weighted
  *share* placement if either is revived.

## 2026-07-07

- **Phase 16 — Fable audit cleanup (F2–F8)** → `phase-16-audit-cleanup.features.md`,
  `phase-16-audit-cleanup.spec.md`. Closed the remaining findings from the 2026-07-06
  full-repo audit (F1 shipped with Phase 15). Dedup: new `src/financestate.js` kills the
  triplicated finance-state client code (`readFinanceState`/`isStateStale`/the filename
  constant) across `resourcemanager.js`/`cloudmanager.js`/`procureprograms.js` and removes
  the `procureprograms.js → cloudmanager.js` import; the four stray `tprintTs` copies
  (`resourcemanager.js`/`cloudmanager.js`/`procureprograms.js`/`bootstrap.js`) now import the
  Phase 13 shared one from `common.js`, whose header was also corrected — it had been
  asserting the bundle-charging model Phase 9/13 already disproved; `totalAllocatableRam`
  moved from `daemon.js`/`sharecurve.js`'s byte-identical copies into `hosts.js`. Fixes:
  `daemon.js`'s `trimLog` had an off-by-one that left the ring buffer at `MAX + 1` entries
  while a `mode` event was pinned (widened the drop slice by one); `transactionsmonitor.js`'s
  running "today's hacking income" now resets at the day-rotation boundary via a new pure
  `dayRolledOver` helper; the daemon's ambiguous "budget" status label (colliding with the
  share line's distinct "batch budget") relabeled to "fleet". Backfilled tests for three
  previously-untested pure helpers (`standardSizes`, `nextIndex`, `nextInstanceNumber`).
  Behavior-preserving housekeeping — no batching/scheduling/finance math changes. `npm test`
  293/293 (18 files, 6 new). **Live-confirmed same day**: RAM gate exactly flat on all 8
  touched scripts (`daemon.js`/`sharecurve.js`/`hosts.js`/`bootstrap.js`/`cloudmanager.js`/
  `procureprograms.js`/`resourcemanager.js`/`transactionsmonitor.js`, before/after against a
  freshly captured `master` baseline, byte-verified against `dist/src/*`) — byte counts
  shifted in both directions as expected from the extractions, but reachability-based RAM
  cost held flat everywhere, confirming the `common.js` header fix. `npm run verify:log`
  36/36 green against a fresh post-restart export (14 members, 0 skips, no stall); the tail
  window showed `fleet 1.58PB` and `batch budget 1.18PB` as the intended two distinct labels.

## 2026-07-06

- **Phase 15 — small-fleet batching floor** → `phase-15-small-fleet.features.md`,
  `phase-15-small-fleet.spec.md`. Fixed the zero-member income stall live-confirmed the same
  day (see Phase 13's entry below): `pickBatchSet` only ever admitted a target whose *full*
  pipeline fit the batch budget, and on the post-reset 940GB fleet no target's full pipeline
  fit (cheapest ~721GB vs. a 705GB budget), so every admission pass seated nobody, forever —
  the daemon had launched zero workers and earned $0 since the Jul 5 handoff. Fix: a new
  `cappedPipelineDepth` (`scheduler.js`) caps admission depth by affordability instead of
  the raw throughput ceiling, and `pickBatchSet` gained a floor pass (incumbent-sticky under
  the existing hysteresis) guaranteeing at least one seat whenever candidates exist — the
  existing per-tick shrink loop does the actual fitting from there. `daemon.js` snapshots
  gained `candidateCount` + a per-member `floor` flag; a stall WARN and `FLOOR` tail tag make
  the (now-unreachable) old failure mode loud instead of silent. `verify-log-checks.js`'s
  `checkBudgetInvariant` was reconciled with a legitimate floor-seated over-budget member
  (own consistency checks added), plus a new `checkNoStall` rule hard-failing this exact bug
  signature (`candidateCount > 0 && memberCount === 0`). `npm test` 268/268 (250 + 18 new).
  **Live-confirmed same day**: RAM gate exactly flat (`daemon.js`/`targets.js`/
  `targetsmonitor.js`/`bootstrap.js` all matched the 2026-07-06 baseline, byte-verified fresh
  against `dist/src/*`); daemon restart immediately seated `phantasy` (`candidateCount: 12`,
  `memberCount: 1` across every snapshot) and launched a batch within the first tick;
  `npm run verify:log` 36/36 green against the fresh export, including the new stall and
  amended budget rules. Filed two follow-up Ideas (BACKLOG): the `sharePower: 1.00`-with-
  live-threads oddity, and auto-suppressing share on small fleets.

- **`git worktree` investigation — closed out.** Adopted: `bitburner-scripts2` (this repo,
  branch `worktree-docs`) runs as a second worktree for docs/BACKLOG/brainstorming work,
  isolated from the live `bitburner-scripts` checkout's working directory and index. Documented
  in `CLAUDE.md` — `bitburner-scripts2` has no dev server of its own and must never start/stop
  `npm run dev`; only the `bitburner-scripts` session may do that, since it's the one actually
  connected to the live game. Resolves the original worry (parallel Claude Code sessions
  colliding over shared `git status`/index state) without a full second clone.

- **Phase 13 — consistency consolidation, closed out** → `phase-13-consolidation.features.md`,
  `phase-13-consolidation.spec.md`, `phase-13-consolidation.closeout.md` (implemented
  2026-07-05, merged to `master` as a deliberate exception pending live validation; live
  validation completed 2026-07-06). New `src/common.js` (`scanNetwork`, `findPath`,
  `tprintTs`, `workerRamCosts`); `hosts.js`'s `getHosts` split into `tryRoot`/`listHosts`;
  `launchmonitor.js` switched to the non-rooting `listHosts` (real correctness fix — it was
  racing the daemon's rooting from inside a monitor); `sharecurve.js` picked up a real
  double-count fix in its capacity report along the way. `npm test` 250/250.
  **Most reusable lesson of the phase:** the RAM gate initially measured a spurious +0.25GB
  on `launchmonitor.js`/`sharecurve.js` that looked like an analyzer limitation (can't
  call-graph-prune closures-as-data) — two code-shape fix commits produced bit-identical
  readings across three runs, which briefly looked like confirmation. Forensic replay of
  `dist/src/*` (viteburner's byte-faithful dump of what it last actually pushed) found the
  real cause: a `git checkout` for the merge, done in this checkout while the dev-server
  watcher was live, pushed stale pre-refactor files into the game at 20:46:02 — all three
  "identical" after-runs had measured the *same stale file*, not three different code
  shapes. A verified re-run (`ramcheck.js` extended to also record each script's in-game
  source length, byte-checked against the `dist/` dump before trusting any reading) hit the
  originally-predicted numbers exactly: `launchmonitor.js` 3.20 (−0.65), `sharecurve.js` 5.70
  (+0.05), both tripwires (`daemon.js`/`bootstrap.js`) flat. New standing rule (`CLAUDE.md`):
  never `git checkout`/switch branches in a dev-server-watched checkout while the game is
  connected unless the push is intended — stop the dev server first. Live daemon session
  (~35 min) confirmed clean; separately surfaced (not a Phase-13 regression — confirmed
  pre-existing, `targets.js`'s diff across the merge is a verbatim move) a live batcher bug:
  `daemon.js` has run with zero batch members / zero hacking income since 2026-07-05, share
  pool only — filed as its own BACKLOG item for investigation.

## 2026-07-05

- **Docs reorganization — archive phases, trim BACKLOG, add metareference** (branch
  `docs/trim-backlog-naming`). Moved the 16 shipped phase docs into `docs/phases/` under a new
  `phase-NN-slug.<stage>.md` convention (history preserved via rename), trimming BACKLOG
  944→~420 lines by relocating completed history to this changelog. Added `docs/metareference/`
  (tracked AI-workflow reference PDFs) + a thin `docs/phases/README.md`; set the docs-layout and
  phase-naming conventions in `CLAUDE.md`; added `.gitattributes` (binary-safe PDFs); started
  tracking shared `.claude/` config; deleted/ignored root clutter.

- **Claude Code — spec-review loop automated** (started 2026-07-04). Documented the
  brainstorm→spec→implement workflow in `CLAUDE.md` and moved the four standing rules
  (Singularity RAM, transaction logging, tests+log validation, spoiler carve-out) out of the
  per-run fable prompt into `CLAUDE.md`. Built the **`spec-reviewer`** subagent
  (`.claude/agents/spec-reviewer.md` — read-only, `model: opus`, four-category rubric +
  APPROVE/`BLOCKING ISSUES:` verdict) and the **`/spec`** command (`.claude/commands/spec.md`,
  `disable-model-invocation`, seven-step loop: resolve → read → clarify-gate → draft → cold
  review → revise one round → present, stop before implementation). Chose one review round over
  multi-round convergence (no natural stopping point). First live run (Phase 14) caught 3 real
  blocking issues. Optional Step 8 (opus writes the features doc itself) still open — see BACKLOG.

- **Workflow — update BACKLOG in the same commit as the work.** After repeated "do work →
  commit → separately update BACKLOG → commit again" cycles, added a `CLAUDE.md` *Tracking
  work* rule to stage the BACKLOG edit in the same commit. Folded the redundant
  `backlog_bookkeeping` auto-memory.

- **Docs/memory cleanup — strip git rules to version-control basics** (branch
  `docs/slim-git-rules`, `c74548a`). Slimmed `CLAUDE.md`'s `## Git` to branch/commit/merge +
  the background-job safety rail; deleted three pure-git-mechanics memories (10→7).

- **Docs/memory cleanup — CLAUDE.md dedupe + memory consolidation** (branch
  `docs/claudemd-dedupe`, `ef72433`). Folded the duplicate "verify against the log files"
  clause; consolidated auto-memory 13→10 files.

- **Phase 14 — cold-start bootstrap (8GB home → daemon.js handoff)** →
  `phase-14-bootstrap.features.md`, `phase-14-bootstrap.spec.md`. New `bootstrap.js` deployer +
  `bootloop.js` worker to rebootstrap the fleet after the hard reset took `daemon.js` (16.3GB)
  offline; auto-hands off to `daemon.js` at the 32GB home tier. First real `/spec` run (3
  blockers fixed at review). `npm test` 231/231; RAM gate closed (`bootstrap.js` 6.20GB after a
  live `ns.ps` fix); all 6 live steps observed. Merged to `master`.

- **Phase 12 — targeting root-access eligibility fix (+ ratio→priority fold-in)** →
  `phase-12-targeting.features.md`, `phase-12-targeting.spec.md` (branch `phase12-targeting`).
  Unplanned hotfix for a live `weaken/grow … no root access` error flood: new pure
  `isEligibleTarget` predicate adds a rooted check in `src/targets.js`. Also swapped the
  misleading `ratio` display for `priority`. `npm test` 190/190; RAM gate closed; live-clean.

- **Phase 11 — resource manager: active procurement** → `phase-11-resource-manager.features.md`,
  `phase-11-resource-manager.spec.md` (branch `worktree-phase11-procurement`). Three renames +
  behavior evolution: `financemanager→resourcemanager`, `cloudupgrader→cloudmanager` (adds
  bootstrap/growth buys), `purchasescripts→procureprograms` (self-terminating TOR + port-opener
  loop). `npm test` 184/184. Found a real bug: `purchaseTor()` throws without Singularity SF —
  guarded with an `ownedSF` check + try/catch. TOR/port-opener ladder unverifiable until the SF
  is owned (follow-up filed).

- **Phase 10 — finance manager + cloud server auto-upgrader** → `phase-10-finance-cloud.md`
  (branch `worktree-phase10-finance`, `5e5f74d`). Two daemon companions: `financemanager.js`
  (reservation-based available-cash service) and `cloudupgrader.js` (its first customer,
  upgrade-only). `npm test` 162/162; RAM gate closed; validated live across a reset. Spun off
  `renamecloudservers.js`; bumped `FORMULAS_HACKING_LEVEL_THRESHOLD` 300→400; added a
  `finance-disable-formulas.txt` kill switch.

## 2026-07-04

- **Phase 9 — Phase 8 close-out** → `phase-09-batcher-refactor.md` (branch
  `worktree-phase9-closeout`, PR #3). Fixed `pickBatchSet`'s pass-3/pass-4 both-lists bug
  (`justEvicted` set). Confirmed the Phase 8 RAM anomaly via the `share→sharePool` rename —
  recovered the full 2.4GB phantom charge (`daemon.js` 18.7→16.3GB), proving import RAM-charging
  is reachability-based, not whole-bundle. Added `hackingLevel` to snapshots. `npm test`
  128/128. Live A/B/A' share session: rep boost confirmed (~45%), income cost still not cleanly
  quotable (A vs A' disagree +36.7% from level-driven scaling). Keep `SHARE_FRACTION` at 25%.

- **Remote API auto-reconnect enabled.** In-game Remote API set to auto-reconnect (5s retry,
  infinite) so a `npm run dev` restart no longer needs a manual in-game reconnect.

- **Phase 8 — faction share allocation** → `phase-08-batcher-refactor.md` (branch
  `worktree-phase8-share`, draft PR #1). Hard-carves `SHARE_FRACTION = 0.25` of allocatable RAM
  for `share.js`, topped up smallest-free-first; added `sharecurve.js` tuning script. `npm test`
  120/120. Live A/B/A': share ~45% rep boost (matches sharePower 1.417); income inconclusive.
  RAM gate: `share.js` 4.00GB exact; `daemon.js` +2.6GB anomaly waived (resolved in Phase 9).

- **Phase 7 — multi-target batching with natural exit** → `phase-07-batcher-refactor.md`.
  Replaced the single hysteresis incumbent with a RAM-bounded, score-greedy member set
  (`pickBatchSet`, `inFlightByTarget`, daemon rewrite; zero `ns.kill`). `npm test` 88/88. Live:
  up to 10 concurrent targets (was 1), utilization avg 20.3% (was ~6.3%), 7 clean natural exits.
  Pushed to `origin/master`.

- **Phase 5 — daily transactions log** → `phase-05-batcher-refactor.md`. Retired `moneymonitor.js`
  for `src/translog.js` + `transactionsmonitor.js`; instrumented all four purchase call sites.
  `npm test` 78/78; `verify:log` now runs transactions checks too. `fleetupgrade.js` now checks
  the upgrade return value (silent-failure fix). RAM gate closed. Pushed to `origin/master`.

- **Phase 4 — Formulas.exe math with legacy fallback** → `phase-04-batcher-refactor.md`. Churn
  fix (0 flips/16min formulas vs 9 legacy) and reserve-ballooning fix confirmed same-session.
  Waived: fleetupgrade-while-running live test (cash constraint).

## Earlier

- **Phases 1–3 — batcher refactor** → `phase-01-batcher-refactor.md` … `phase-03-batcher-refactor.md`:
  pipeline reservation waterfall, efficiency-score ranking, shrink gating.
