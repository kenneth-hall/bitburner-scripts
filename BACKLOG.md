# Backlog

Tracks feature work and goals across sessions. Update when starting/finishing something;
move finished items to Done with a date instead of deleting them.

## In Progress

- **Batcher refactor Phase 8 — faction share allocation** (2026-07-04): `batcher-refactor-phase8.md`.
  Builds the "`ns.share()` script + dedicated RAM allocation" item below into a hard carve:
  `SHARE_FRACTION = 0.25` (untuned by design, see spec) of `totalAllocatableRam` is
  unconditionally reserved for `share.js` (a one-cycle `ns.share()` worker, topped up every
  tick by `planShareTopUp` in `scheduler.js`, smallest-free-RAM-first — opposite end from
  `carveReservation`'s largest-first, so share consumes fragments and leaves contiguous blocks
  for batching's grow jobs); the batch admission budget becomes `(1 - SHARE_FRACTION) x
  totalAllocatableRam`. Zero `ns.kill` call sites (natural-exit philosophy, matching Phase 7)
  — scaling down just means stopping the top-up and letting the pool decay over ~10s.
  Runtime toggle: a 0-byte `share-off.txt` marker on home forces the fraction to 0 for
  same-session A/B measurement. `sampling.js`'s `inFlightByTarget` gained a breaking shape
  change (`{byTarget, share}`) to fold share's sweep into the existing two-sweeps-per-tick
  budget rather than adding a third. New manual tuning script `src/sharecurve.js`
  (formulas-gated) predicts the sharePower curve across candidate fractions, exported to
  `logs/sharecurve-<epoch ms>.json`.
  - **Runnable, verified (2026-07-04): `npm test` green at 115/115** (8 new `planShareTopUp`
    cases, `inFlightByTarget`'s 5 existing cases updated for the new shape plus 2 new share
    cases, 8 checker-fixture cases for the 3 new `verify-log` hard assertions run via synthetic
    fixtures against extracted pure functions in `test/verify-log-checks.js`, 8 cases for the
    new `test/windowed-rate.js` helper). `npm run verify:log` sanity-checked against a
    synthetic Phase-8-shaped fixture log (not a real session) — all 13 checks pass, including
    the share-cap invariant (with its 30s zero-target grace window), the updated budget
    invariant (`batchBudgetGb`, not raw `budgetGb`), and fraction consistency; soft reports
    extended with share target-attainment/sharePower min-avg-max and a share-excluded
    batch-side utilization figure. `test/verify-transactions.test.js` gained a
    `VERIFY_WINDOWS`-driven windowed $/min report for the A/B/A' income comparison, sanity
    checked against a synthetic transactions fixture.
  - **Not yet done — needs a live game session (this is the phase's actual acceptance
    criterion, not optional)**: the A (share off) → B (share on) → A' (share off) protocol,
    each window >= 10 min, same calendar day, with faction work running throughout so rep/sec
    has something to multiply. Requires manually recording the faction rep number from the
    game UI at each of the 4 window boundaries (no Singularity-free way to read it
    programmatically), running `sharecurve.js` once during window B, and copying
    `logs/daemon-batch-log.json` at each boundary (2000-entry ring only holds the last
    ~4-6 minutes at high member counts). The resulting `BACKLOG.md` entry — measured
    income/rep for A/B/A', measured vs. predicted share power, and a keep/raise/lower
    recommendation on `SHARE_FRACTION` — is a required output of this phase, not yet written.
  - **RAM gate: not yet measured live.** Expected `daemon.js` 16.10 -> ~16.30 GB
    (+`ns.getSharePower` 0.2 GB); `share.js` ~4.00 GB (1.6 base + 2.4 `ns.share`) — confirm
    both with `mem` in-game; flag anything over ~0.5 GB unexplained.
  - Shipped on branch `worktree-phase8-share`, not yet merged — this whole phase (especially
    the daemon.js RAM-carve change) needs the user's live in-game verification before merging,
    per this project's usual rule for daemon-touching changes.

## Next Up

- **targetsmonitor "ratio" column → actual priority metric**: Investigated a suspected bug
  (2026-07-04) — "ratio" numbers looked suspiciously round/inconsistent, hypothesis was that
  purchased-but-uninstalled augmentations were leaking in. No bug found: `ratio`
  (`targets.js:92`, `maxMoney / minSecurityLevel`) is purely server-intrinsic, fixed at
  world-gen, with no player-derived input in the formula at all — confirmed against the code
  and against `installAugmentations`'s docs (aug effects apply only on install/reset, never
  on purchase), so neither a hacking level-up nor an uninstalled aug can move it. The real
  driver of "these numbers changed": `getTargets()` sorts by `score` (money-per-GB-second,
  the actual ranking metric) while the display only ever showed the unrelated `ratio` field
  — a level-up reshuffles which targets appear/rank, moving rows around even though no
  individual server's ratio value changes.
  - **Decided**: stop displaying `ratio`; show `t.score` instead, labeled `priority`, using
    the `toExponential(2)` rendering `targets.js` already uses for score so the two displays
    read consistently. Apply to both `targetsmonitor.js`'s live dashboard (replace the
    `ratio` column) and `targets.js`'s own `main()` summary (drop the `(ratio ...)`
    parenthetical — score is already printed first).
  - **Also decided (from the withdrawn Phase 5 draft)**: remove the `ratio` field from the
    target objects `getTargets` builds. Grep confirmed (2026-07-04) its only consumers are
    `targetsmonitor.js:57` and `targets.js:147` (`sampling.js:330`'s `ratio` is an unrelated
    local; the daemon log and verify-log never touch the field). This changes the
    `targets-summary-*.json` schema — note it in the file's comment. If a third consumer
    turns up at implementation, keep the field and flag it instead.
  - **Also decided**: fix the misleading `->` marker in `targetsmonitor.js` — it claims the
    top-ranked entry is `daemon.js`'s current batch target, which is wrong under
    `RANK_HYSTERESIS` (the incumbent can sit below rank 0 — `daemon.js`'s own `lowerTargets`
    comment documents this exact trap). The monitor can't see the daemon's incumbent without
    coupling to it, so make the display honest: relabel the marker "top-ranked by score" and
    add a one-line legend noting the daemon's actual target can differ under hysteresis.
    **Post-Phase-7 update (2026-07-04)**: there's no longer a single "incumbent" — the legend
    text should say "the daemon's active *set* can differ" instead of "the daemon's actual
    target can differ." Leave the actual text edit for this item's own implementation.
  - Verification: run `targetsmonitor.js` and `targets.js` in-game, eyeball both against a
    `targets-summary` export; `npm test` stays green (no unit-tested code changes).

- **Consistency consolidation** (from the 2026-07-04 code audit; was item 3 of the original
  Phase 5 draft — full-consolidation depth chosen explicitly; behavior-preserving throughout,
  with the RAM gate and a before/after daemon session as the safety net). Do this *before*
  the backdoor item below — it extracts `tryRoot` and `findPath`, which the backdoor script
  imports.
  - **New shared module `src/common.js`** — charter (state it in the header): ns-dependent
    helpers shared by multiple scripts; no policy decisions, no batching math; keep the ns
    surface minimal and cheap (`scan`, `tprint`, `getScriptRam` — every importer's bundle
    pays for all of it; nothing `ns.cloud.*` or Singularity). Contents: `scanNetwork(ns)`
    (BFS copy-pasted identically in `hosts.js`/`targets.js`/`killscripts.js` — move verbatim,
    rewire all three); `findPath(ns, target)` (BFS parent-chain walk from `connect.js`);
    `tprintTs(ns, message)` (from `daemon.js`; also use it for `hosts.js`'s rooted-host
    notification, which currently fires mid-daemon-run with no timestamp); `workerRamCosts(ns)`
    (the three-script `getScriptRam` map built in both `daemon.js`'s `refreshCycle` and
    `targets.js`'s `getTargets`; takes `WORKER_SCRIPTS` from `scheduler.js`).
  - **`hosts.js` restructure**: export `HOME_RESERVE_GB` (`daemon.js` imports it, deletes its
    private copy). Split `getHosts` into `tryRoot(ns, server)` (the PORT_OPENERS/nuke block,
    returns whether the server ended up rooted) and `listHosts(ns)` (pure listing, no rooting
    side effects); `getHosts` composes the two, exact current behavior. Switch
    `launchmonitor.js` to `listHosts` — its "fully read-only" header is false today because
    `getHosts` nukes newly-rootable servers from inside a monitor, racing the daemon's
    refresh; after the switch, update the header to say it deliberately uses the non-rooting
    variant. (Correctness fix, not a RAM fix — bundle charging means it already paid.)
  - **`daemon.js` internal cleanup**: factor the identical 10-line free-RAM-check preamble
    out of `launchDetached`/`runAndWait` into one local helper (make the skip message
    call-site-neutral). Fix `runAndWait`'s docstring — it narrates
    `purchasescripts.js`/`upgradehomeram.js` but its only call site is `killscripts.js`.
    ~~Move `sumInFlightRam`/`countBatchesInFlight` into `sampling.js` next to their sibling
    `countInFlightThreads`, with unit tests in `test/sampling.test.js` reusing the
    `inFlightPs` fixture style.~~ **Superseded by Phase 7 (2026-07-04, see Done below)**:
    shipped as `inFlightByTarget`, a single combined `ns.ps` sweep rather than a straight
    move of the two separate functions — don't redo this sub-item.
  - **Small consolidations and comment fixes**: `cloudcosts.js` exports the power-of-2
    `standardSizes` builder, `purchasecloudservers.js` imports it (lives in cloudcosts, not
    common.js, to keep `ns.cloud.*` out of common importers' bundles). Header fixes:
    `purchasescripts.js` (drop the false "daemon runs this at startup" claim),
    `killscripts.js` (daemon doesn't kill in steady state — one-shot workers exit on their
    own). (`fleetupgrade.js`'s header reclassification shipped early with Phase 5, since that
    phase made it a permanent transactions-log call site — see Done below.)
  - **Dead files (decided: delete both)**: `src/cleanup-old-daemon-log-temp.js` (run-once,
    job done) and the root-level `cloud-server-costs.js` (older duplicate of
    `src/cloudcosts.js`, never synced by viteburner). Also `rm` in-game copies where
    applicable — viteburner won't delete them.
  - Verification: `npm test` green including the new in-flight-scanner tests; RAM gate
    (`getScriptRam` before/after) for `daemon.js`, `targets.js`, `hosts.js`,
    `killscripts.js`, `connect.js`, `launchmonitor.js`, `targetsmonitor.js` — expect ~flat;
    ≥15-minute daemon session after, `npm run verify:log` green, same character as Phase 4's
    acceptance runs; the transactions log (Phase 5) should show income unchanged in
    character too.

- **Post-reset auto-backdoor for joinable factions**: after an augmentation install (which
  resets hacking level and, per the user, the eligibility state for these invites), auto-check
  which faction-invite backdoor targets we now qualify for (not yet joined that faction, and
  hacking level high enough to reach/root their server) and install the backdoor as soon as
  eligible. Named targets so far: CyberSec (`CSEC`) and NiteSec (`avmnite-02h`) — scoped to
  exactly these two for now, more can be added later without spoiling anything not yet reached.
  Clarified (2026-07-04): runs standalone *after* a reset (not pre-reset prep); backdoor only,
  no auto-`joinFaction`; should be wired in as a companion process launched from `daemon.js`'s
  startup (same pattern as `targetsmonitor.js`/`transactionsmonitor.js`), not inlined into
  `daemon.js`'s own file — its Singularity calls (`connect`/`installBackdoor`/`getCurrentServer`)
  carry the same RAM multiplier without SF4 that `daemon.js` already avoids for
  `purchasescripts.js`/`upgradehomeram.js`.
  - **Reverted 2026-07-04**: a `backdoorfactions.js` companion was implemented and wired into
    `daemon.js`, then reverted at the user's request — mid-testing, this chat is for request
    tracking only, not implementation. Design above reflects what was decided/built before the
    revert, kept here so a future implementation doesn't have to re-derive it.
  - **Implemented and reverted again, 2026-07-04**: a full implementation shipped as
    `batcher-refactor-phase6.md` (`common.js`, `eventlog.js`, `factionwatcher.js`,
    `backdoorfactions.js`, plus the `hosts.js`/`connect.js`/`daemon.js` wiring described
    below), then fully reverted the same day at the user's request — they judged it not
    worth further development right now after realizing they'd misunderstood some of the
    underlying game mechanics (notably: they don't currently have Singularity access
    unlocked, and had assumed some factions could be safely auto-joined with no downside).
    None of this is implemented; treat every item on this backlog entry as still to do.
    Reverted via `git revert` (history preserved, not rewritten) — see
    `batcher-refactor-phase6.md`'s status note for the full file/commit list before
    resuming, and re-confirm the settled decisions below still hold given the
    Singularity-access correction.
  - Existing scaffolding to reuse: `connect.js` already BFS-pathfinds to a target (its
    `DEFAULT_TARGET` is already `"CSEC"`) but only prints the path — needs adapting to actually
    drive `ns.singularity.connect()` hop by hop. `hosts.js`'s `PORT_OPENERS`/nuke logic can be
    reused to root the target first if it isn't already. **Depends on the consolidation item
    above** for the `tryRoot` and `findPath` extractions.
  - **Behavior (from the withdrawn Phase 5 draft, settled)**: per target on a
    `POLL_MS = 60_000` loop — done conditions that skip permanently (backdoor already
    installed, check the server object's backdoor field, verify exact name in
    `markdown\bitburner.server.md`; or faction already joined via `ns.getPlayer().factions`);
    eligibility (hacking level ≥ required, root available or `tryRoot` succeeds); action
    (root if needed, walk `findPath` hop by hop via `ns.singularity.connect` — verify its
    adjacency semantics — sanity-check location with `getCurrentServer` before
    `await ns.singularity.installBackdoor()`, `tprintTs` each install); **exit when every
    target is done**, freeing its Singularity-sized RAM. `killscripts.js` sweeps it on daemon
    restart; relaunch is idempotent because every action re-checks state first.
  - **Open decisions from the 2026-07-04 spec review, settle at implementation**:
    (a) *Launch-retry gap* — post-reset home RAM is smallest exactly when this script matters
    most, so `launchDetached`'s INFO-skip could mean it never launches until the next daemon
    restart, days later. Decide: slow daemon-side relaunch retry (exec-by-filename adds no
    RAM to the daemon) vs. a skip message that explicitly tells the user to run it manually
    once RAM allows. (b) *Terminal hijack* — `singularity.connect` moves the player's
    terminal connection; a background loop that yanks you off a server mid-manual-session and
    dumps you at `home` is a live-play irritant. Decide: save `getCurrentServer` at loop
    start and restore *that* after installing, or accept and document.
  - Verification: runnable now against the current save (targets likely already
    joined/backdoored — confirm actual save state first; it must tprint its skip reasoning
    once per target and exit cleanly, with daemon startup wiring undisturbed and
    `npm run verify:log` green). The real end-to-end (level up → root → connect-walk →
    backdoor → exit) is structurally deferred to the next reset — record as a
    live-validation follow-up when built, same as the waived fleetupgrade test.

## Ideas / Backlog

- **viteburner dev-server silently stops auto-exporting** (2026-07-04): during Phase 5 live
  verification, the `npm run dev` process had been running continuously for 2+ hours (no
  crash, no error output) but stopped producing fresh downloads to `logs/` at some point —
  `daemon-batch-log.json` and the transactions file both stopped updating even though
  `daemon.js` kept running and writing in-game. A full restart of the dev server fixed it
  (clean reconnect, full re-sync). Root cause not confirmed — one candidate: this process's
  stdin isn't a TTY ("`current stdin is not a TTY. Keypress events may not work`" at startup),
  and the auto-export mechanism (`vite.config.ts`'s `autoExportDaemonLog` plugin) works by
  synthetically emitting a `keypress` event on `process.stdin`, which may not survive a
  websocket reconnect cleanly in a non-TTY process. Not investigated further this session —
  worth digging into if it recurs, since a restart is an easy workaround but an unnoticed
  stall could look like "no income landing" when it's actually "not exporting."

- **Investigate auto-reconnecting the Remote API after a dev-server restart** (2026-07-04):
  confirmed live during Phase 8 verification — recovering from the auto-export stall above
  requires killing and restarting `npm run dev`, which always drops the game's Remote API
  connection; nothing re-syncs (and `daemon.js` can't be picked up with new code) until it's
  manually reconnected in-game (Options → Remote API). Worth checking whether viteburner or
  the underlying Remote API protocol supports a reconnect-on-restart or keep-alive mode, so a
  dev-server restart doesn't cost a manual in-game step every time. Distinct from the item
  above: that one is the export-polling mechanism silently dying while the connection stays
  up; this one is the connection itself needing a human to re-establish it after any restart.

- **Claude Code workflow blocker: getting a screenshot into a terminal session** (2026-07-04):
  when debugging a live in-game error, copy/pasting the terminal text came through garbled/
  incomplete (same lossiness `CLAUDE.md`'s log-export rule already calls out for terminal
  copy/paste in general), so we fell back to a screenshot — but `Ctrl+V`-pasting a Snip &
  Sketch capture directly into the Claude Code terminal input didn't attach anything, and a
  saved file at a guessed path (Desktop/Downloads/Pictures/the worktree) wasn't found either.
  Not a Bitburner item — revisit once we land on a reliable method (probably: save the file,
  then hand Claude the exact path so it reads it directly) and write the steps down so future
  sessions aren't rediscovering this each time.

- **Claude Code workflow to learn: automating the spec-review loop** (2026-07-04): designed in
  chat; using the prompt-only version for now (main session writes the spec since it holds the
  requirements context, a cold-context subagent peer-reviews it, main session addresses blocking
  issues and presents final draft + changelog + open questions for approval). Two automation
  levels to build/learn when ready:
  - **Level 1 — reviewer subagent**: `.claude/agents/spec-reviewer.md` (YAML frontmatter +
    markdown body that becomes its system prompt). Fixed rubric: review against the stated
    requirements; flag ambiguity, missing edge cases, untestable acceptance criteria, hidden
    assumptions. Read-only tools (`tools: Read, Glob, Grep`). Required verdict format: APPROVE
    or a numbered list of blocking issues only.
  - **Level 2 — `/spec` skill**: `.claude/skills/spec/SKILL.md` encoding the whole loop (write
    spec to `specs/<name>.md` → delegate review to spec-reviewer → address blocking issues,
    anything disputed becomes an open question → present draft/changelog/open questions → wait
    for approval before implementing).
  - Deliberately rejected: multi-round author↔reviewer convergence (no natural stopping point;
    rubber-stamp and invented-nitpick failure modes). One review round; a manually requested
    second pass is the escalation valve, and unresolved disagreements go to Kenneth as open
    questions rather than forced consensus.

- **Monitor cleanup + more meaningful logging**: `daemon.js`'s tail popup is very verbose
  and some numbers look stale or reset next cycle — concretely: the `durations:` line reads
  `batchTarget.hackTime/growTime/weakenTime`, only refreshed in `refreshCycle()` (up to
  `CYCLE_MS`/10s stale vs. the rest of the popup's `BATCH_INTERVAL_MS` redraw); and the
  `batch #N` block always shows `lastBatch`, which persists from whenever the last real
  launch happened, with no cue when it's not this tick's launch. Wants an out-of-game
  (maybe live) dashboard. Candidate logs discussed (2026-07-04) — the $ transactions log
  idea has since shipped as Phase 5 (see Done below); remaining open ideas:
  - ~~**RAM utilization time series**: `utilization` is computed every tick in `daemon.js` but
    only displayed, never logged as its own series — needed for a dashboard chart.~~
    **Shipped by Phase 7 (2026-07-04, see Done below)** as `snapshot` log events
    (`utilizationPct`, `memberCount`, per-member breakdown, once per `CYCLE_MS`) — the
    verbosity half of this item is also addressed by Phase 7's tail-popup redesign; the
    out-of-game dashboard half stays open here.
  - **Per-target income/efficiency log**: `batch` events log expected steal but nothing
    closes the loop on realized money per target over time, to sanity-check the ranking
    score against real outcomes.
  - **Prep-cycle duration log**: how long each drift→prepped transition actually takes;
    currently only visible live in the popup's prep-dispatched lines and lost once prepped.

## Done (recent)

- **Batcher refactor Phase 7 — multi-target batching with natural exit** (2026-07-04):
  `batcher-refactor-phase7.md`. Replaced the single hysteresis-protected incumbent with a
  RAM-bounded, score-greedy member set: `pickBatchSet` (scheduler.js, 4-pass admission/
  displacement/refill, replaces `pickBatchTarget`), `inFlightByTarget` (sampling.js, one
  combined `ns.ps` sweep replacing daemon.js's per-target `sumInFlightRam`/
  `countBatchesInFlight`), and a full daemon.js rewrite around a per-tick member loop
  (aggregate reserve carve, `enter`/`exit`/`snapshot` log events replacing `flip`, pinned
  `mode` event against ring-buffer eviction, per-target skip coalescing, redesigned tail
  display). `npm test` green at 88/88 (13 new `pickBatchSet` cases, 5 new `inFlightByTarget`
  cases, `pickBatchTarget`'s old suite removed).
  - **Live-verified same day (2026-07-04)**: ~34-minute formulas-mode session.
    `npm run verify:log` green (11/11, including all three new hard assertions —
    natural-exit invariant, budget invariant, enter/exit sanity). **Up to 10 targets batched
    concurrently** (member count: min 4 / avg 7.5 / max 10 across 110 retained snapshots) vs.
    exactly 1 before. **Utilization: min 6.9% / avg 20.3% / max 40.1%**, well above the
    pre-Phase-7 baseline of ~6.3%. **7 natural exits observed**, all organic (no forced
    `legacy-mode.txt` trick needed), reasons `unaffordable`/`displaced`; every exited server
    that had in-flight work drained and re-entered cleanly. Confirmed via
    `grep -rn "ns.kill\|killall" src/daemon.js`: zero call sites — natural exit is
    scheduling-only, exactly as designed.
  - **Real stress test, not synthetic**: mid-session, `upgradecloudserver.js` was run a
    couple of times, renaming/recreating a purchased host and silently killing whatever
    worker processes were running on it. This caused a mass simultaneous drift across
    nearly every active member and repeated rapid exit/re-entry cycling for the
    lowest-scored member (`n00dles`: 5 of the session's 7 exits, some only 8 seconds apart).
    Confirmed **not a Phase 7 defect** — an external fleet-operations confound any daemon
    design would be exposed to — but a good real-world robustness signal: all 11
    `verify-log` hard assertions still passed through it, including the natural-exit
    invariant holding across `n00dles`'s rapid cycling. Worth a future BACKLOG item on
    `upgradecloudserver.js` sharing `fleetupgrade.js`'s known rename-hazard, not filed yet.
  - **RAM gate: closed (2026-07-04).** `daemon.js` 16.10GB in-game — exact match to Phase 5's
    recorded 16.10GB baseline, zero growth (expected: no new `ns` API surface added).
  - **Income comparison: inconclusive, not concerning.** Session-window rate (~$587M/min)
    came in ~12.5% under Phase 5's baseline (~$671M/min), but the comparison is confounded
    by two factors unrelated to Phase 7's correctness: the highest-scored target (`phantasy`,
    score 2541 vs. next-highest 1850) sat mid-prep for the entire session without producing
    income, and the `upgradecloudserver.js` disruption above. Not treated as a regression;
    a clean uninterrupted re-run would be needed for a tight number, not done.
  - **Pushed to `origin/master` (2026-07-04).**
  - One open question from the spec stays open: evidence-window size vs. per-type log
    retention (all event types share one 2000-entry ring, so high-member-count sessions only
    retain the last several minutes for offline review) — deferred, not decided.
- **Batcher refactor Phase 5 — daily transactions log** (2026-07-04): `batcher-refactor-phase5.md`.
  Retired `moneymonitor.js` in favor of `src/translog.js` (shared write helper:
  `transactionsFileName`, `recordTransaction`, `shouldCoalesce`) and `src/transactionsmonitor.js`
  (income companion, replaces `moneymonitor.js`'s `launchDetached` slot, redraws its tail popup
  every poll rather than only on report events). Instrumented all four purchase call sites
  (`purchasescripts.js`, `upgradehomeram.js`, `purchasecloudservers.js`, `fleetupgrade.js`) to
  write an expense record on success. `npm test` green at 78/78 (65 existing + 13 new
  `test/translog.test.js` cases). Added `test/verify-transactions.test.js` alongside
  `test/verify-log.test.js`, both wired into `vitest.verify.config.ts`/`vitest.config.ts` via a
  `test/verify-*.test.js` glob — `npm run verify:log` now runs both, confirmed failing cleanly
  pre-session (no exported log yet) rather than silently passing.
  - **The phase's one behavior addition**: `fleetupgrade.js`'s two upgrade loops previously
    ignored `ns.cloud.upgradeServer`'s boolean return, so a failed upgrade silently reported
    (and would have logged) as a success. Added return-checks: failures now `tprint` a WARN
    per host and are excluded from both the terminal report and the transactions record; if
    zero hosts in a batch succeed, no record is written at all. Also reclassified the file's
    header (ONE-OFF → permanent manual utility), since it's now a permanent log call site.
  - **Live-verified same day (2026-07-04), post-merge**: daemon restarted with the merged
    code, `transactionsmonitor.js` confirmed running (tail popup showing correct running
    total/rate), `moneymonitor.js` deleted in-game. `transactions-2026-07-04.json`
    auto-exported to `logs/` after a viteburner dev-server hiccup was diagnosed and fixed
    (the process had been alive for 2+ hours but silently stopped producing fresh
    downloads — restarting it forced a clean reconnect and re-sync of everything,
    including the day file). `npm run verify:log` green (14/14) against the real file:
    two well-formed coalesced income records, $7.18B/10.7min in the soft report, zero
    hard-assertion failures.
  - **RAM gate: closed (2026-07-04).** `daemon.js` 16.1GB — exact match to Phase 4's recorded
    16.10GB baseline, zero growth (expected: `daemon.js` never imports `translog.js`, only
    swaps a filename string). `transactionsmonitor.js` 2.6GB — base(1.6) + `getMoneySources`
    (1.0) + `translog.js`'s 0GB `ns.read`/`ns.write`, actually *lighter* than the 3.10GB Phase
    4 recorded for old `moneymonitor.js` (this version never calls `ns.getPlayer()`, which the
    old total-balance line used and the new hacking-income-only design dropped).
    `upgradehomeram.js` 74.15GB matches its own header's "~74GB" almost exactly. No historical
    baseline on file for `purchasescripts.js` (50.15GB), `purchasecloudservers.js` (5.75GB),
    `fleetupgrade.js` (3.6GB) specifically, but the 0GB pattern held everywhere it was
    checkable, so no reason to expect growth there either.
  - **Purchase-during-income check: closed (2026-07-04), via an accidental live test.** A
    `purchasecloudservers.js` run with a mixed-up count argument bought 21 servers
    (`pserv-16gb-0`..`pserv-16gb-20`) in one burst; all 21 landed as correctly-shaped
    `cloud-purchase` expense records, sandwiched cleanly between two income records
    (10:31:15 AM and 10:32:57 AM) with no clobbering or dropped writes — exactly the
    multi-writer scenario the spec flagged as the real risk. All acceptance items for this
    phase are now closed. (The 21 servers were a mistake, not intentional — cleaned up with
    a throwaway `ns.cloud.deleteServer` script, unrelated to Phase 5 itself.)
  - **All acceptance items closed.** Since pushed to `origin/master` in an earlier session.
    Still remaining: delete the now-superseded `origin/worktree-batcher-phase5-translog`
    branch.
- **Batcher refactor Phase 4 — Formulas.exe math with legacy fallback** (2026-07-04): all
  runnable and observed acceptance criteria satisfied. Direct same-session comparison showed
  the churn fix (0 flips/16min formulas vs. 9/16min legacy) and reserve-ballooning fix
  (`depth` constant at 111-112 in formulas vs. swinging 31→209 in legacy) working exactly as
  designed. See `batcher-refactor-phase4.md`'s handoff section for full details.
  - **Waived, not done**: fleetupgrade-while-running live test (cash constraint) — revisit
    after next game reset. The guard's motivating failure (crash on a stale renamed host) was
    confirmed live against an unpatched daemon; the patched daemon's actual survival wasn't.
- Phase 1–3 of the batcher refactor (pipeline reservation waterfall, efficiency-score
  ranking, shrink gating) — see `batcher-refactor-phase1.md` through `phase3.md`.
