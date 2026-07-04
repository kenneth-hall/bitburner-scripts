# Backlog

Tracks feature work and goals across sessions. Update when starting/finishing something;
move finished items to Done with a date instead of deleting them.

## In Progress

_(nothing in progress from this session)_

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
  - Verification: run `targetsmonitor.js` and `targets.js` in-game, eyeball both against a
    `targets-summary` export; `npm test` stays green (no unit-tested code changes).

- **Consistency consolidation** (from the 2026-07-04 code audit; was item 3 of the original
  Phase 5 draft — full-consolidation depth chosen explicitly; behavior-preserving throughout,
  with the RAM gate and a before/after daemon session as the safety net).
  - **Shipped early via Phase 6 (2026-07-04)**: `src/common.js` now exists with `findPath`
    (generalized from `connect.js`, takes an explicit `start` param) and `tprintTs` (copied
    from `daemon.js`'s private one — `daemon.js`'s own copy is untouched); `hosts.js` now
    exports `tryRoot`. Remaining scope below is unchanged except those three pieces are done.
  - **New shared module `src/common.js`** — charter (state it in the header): ns-dependent
    helpers shared by multiple scripts; no policy decisions, no batching math; keep the ns
    surface minimal and cheap (`scan`, `tprint`, `getScriptRam` — every importer's bundle
    pays for all of it; nothing `ns.cloud.*` or Singularity). Remaining contents to add:
    `scanNetwork(ns)` (BFS copy-pasted identically in `hosts.js`/`targets.js`/`killscripts.js`
    — move verbatim, rewire all three); `workerRamCosts(ns)` (the three-script `getScriptRam`
    map built in both `daemon.js`'s `refreshCycle` and `targets.js`'s `getTargets`; takes
    `WORKER_SCRIPTS` from `scheduler.js`). Also still to do: use `tprintTs` for `hosts.js`'s
    rooted-host notification, which currently fires mid-daemon-run with no timestamp.
  - **`hosts.js` restructure**: export `HOME_RESERVE_GB` (`daemon.js` imports it, deletes its
    private copy). Split the remaining non-rooting listing logic out of `getHosts` into
    `listHosts(ns)` (pure listing, no rooting side effects — `tryRoot` already shipped, see
    above); `getHosts` composes the two, exact current behavior. Switch
    `launchmonitor.js` to `listHosts` — its "fully read-only" header is false today because
    `getHosts` nukes newly-rootable servers from inside a monitor, racing the daemon's
    refresh; after the switch, update the header to say it deliberately uses the non-rooting
    variant. (Correctness fix, not a RAM fix — bundle charging means it already paid.)
  - **`daemon.js` internal cleanup**: factor the identical 10-line free-RAM-check preamble
    out of `launchDetached`/`runAndWait` into one local helper (make the skip message
    call-site-neutral). Fix `runAndWait`'s docstring — it narrates
    `purchasescripts.js`/`upgradehomeram.js` but its only call site is `killscripts.js`.
    Move `sumInFlightRam`/`countBatchesInFlight` into `sampling.js` next to their sibling
    `countInFlightThreads`, with unit tests in `test/sampling.test.js` reusing the
    `inFlightPs` fixture style.
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

## Ideas / Backlog

- **Backdoor/auto-join live-validation follow-up** (Phase 6, 2026-07-04): the real end-to-end
  (reset → hacking level up → root → connect-walk → backdoor installed → event logged →
  CyberSec/Netburners auto-joined → event logged, all under the new reset's `resetId`) is
  structurally deferred to the next reset — can't be exercised before then. Same waived-test
  pattern as the fleetupgrade-while-running item below. When it happens, confirm:
  `events-log.json` survives the reset unmodified in place; `factionwatcher.js`'s startup
  reconciliation doesn't re-log anything already recorded under the new `resetId` (it
  shouldn't, since reconciliation keys on `resetId`, but this is the first real test of that);
  `backdoorfactions.js` actually walks/backdoors/exits correctly against live hacking-level
  gating, not just the mocked `walkTo` unit tests.

- **Share-with-factions RAM interaction**: concern raised (2026-07-04) — once a script
  dedicates RAM to `ns.share()` (boosts faction rep-gain rate; no such script exists in
  `src/` yet), will `daemon.js` correctly notice the reduced free RAM? Investigated:
  **confirmed fine already** — `daemon.js`'s `refreshFreeRam()` and `hosts.js`'s
  `getHosts()` both compute free RAM fresh every cycle from live `ns.getServerMaxRam`/
  `ns.getServerUsedRam`, which reflect *any* running process, not just daemon's own workers
  — no change needed for RAM accounting to adapt.
  - **Real gotcha found, not yet fixed**: `killscripts.js` (run once by `daemon.js` on every
    startup) kills every process on `home` except its own pid and the caller's pid, plus
    `killall`s every other scanned server — a future share script isn't protected, so it
    would get killed on every daemon restart unless explicitly excluded (e.g. by filename),
    the same way `daemon.js` already protects itself by pid.
  - Blocked on: no share script exists yet — revisit the `killscripts.js` protection once
    one is actually built.

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
  - **RAM utilization time series**: `utilization` is computed every tick in `daemon.js` but
    only displayed, never logged as its own series — needed for a dashboard chart.
  - **Per-target income/efficiency log**: `batch` events log expected steal but nothing
    closes the loop on realized money per target over time, to sanity-check the ranking
    score against real outcomes.
  - **Prep-cycle duration log**: how long each drift→prepped transition actually takes;
    currently only visible live in the popup's prep-dispatched lines and lost once prepped.

## Done (recent)

- **Batcher refactor Phase 6 — post-reset auto-backdoor + persistent events log** (2026-07-04):
  `batcher-refactor-phase6.md`. New `src/common.js` (`findPath` generalized with an explicit
  `start` param, `tprintTs`), `hosts.js`'s `tryRoot` extraction (behavior-preserving,
  `connect.js` rewired to import `findPath`). New `src/eventlog.js` (`recordEvent`, patterned
  on `translog.js`) writing the persistent, whole-playthrough `events-log.json` — never
  rotated, `resetId` per record from `ns.getResetInfo().lastAugReset`. New
  `src/factionwatcher.js` (always-on companion, no tail window, startup reconciliation against
  the events log) and `src/backdoorfactions.js` (post-reset backdoor installer for `CSEC`/
  `avmnite-02h`, the only file allowed Singularity calls). `daemon.js`'s `launchDetached` now
  returns a boolean and retries any of its four companions (`targetsmonitor.js`,
  `transactionsmonitor.js`, `factionwatcher.js`, `backdoorfactions.js`) every `CYCLE_MS` until
  each launches once — applies uniformly, so the two pre-existing monitors get the retry too.
  `npm test` green at 107/107 (78 existing + 29 new: `common`, `hosts`, `eventlog`,
  `factionwatcher`, `backdoorfactions`, plus `verify-events.test.js` added to the
  `verify:log` glob).
  - **Scope addition beyond the spec, decided by the user mid-session**: `backdoorfactions.js`
    also auto-accepts invitations for **CyberSec** and **Netburners** (`AUTO_JOIN_FACTIONS`)
    the moment they appear, independent of the per-server backdoor loop — the user judged
    these two have no downside to joining automatically, unlike the project's normal
    "backdoor only, no auto-join" default. **NiteSec is NOT auto-joined** — stays backdoor-only,
    manual join, per the original spec. This adds `ns.singularity.checkFactionInvitations()`
    (3 GB base) and `ns.singularity.joinFaction()` (3 GB base) to `backdoorfactions.js`'s
    RAM cost on top of the spec's own estimate — expect a noticeably higher figure than the
    spec's ~100 GB projection; measure and record at live verification.
  - **Also used plain string literals** (`"CyberSec"`, `"NiteSec"`, `"Netburners"`) instead of
    `ns.enums.FactionName` as the spec suggested — the enum's only doc file is explicitly
    spoiler-labeled (lists every faction in the game), and a two/three-entry constant map gets
    nothing from importing it. Confirmed with the user.
  - **Not yet done**: live `getScriptRam` measurements for every touched/new script (this
    pass is implementation + unit tests only, no running game session from here); the live
    daemon-restart acceptance check; the real end-to-end reset validation (see the
    live-validation follow-up in Ideas above). Branch merged locally into the main checkout's
    `master` (not pushed) so `npm run dev` can pick it up for in-game testing.

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
  - **All acceptance items closed.** Remaining before this phase is fully "shipped": push
    local `master` to `origin` (currently 4 commits ahead, held back per the user's
    test-locally-first preference) and delete the now-superseded
    `origin/worktree-batcher-phase5-translog` branch.
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
