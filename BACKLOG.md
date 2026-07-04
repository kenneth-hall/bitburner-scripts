# Backlog

Tracks feature work and goals across sessions. Update when starting/finishing something;
move finished items to Done with a date instead of deleting them.

## In Progress

_(nothing in progress from this session)_

## Next Up

- **Fix `pickBatchSet`'s pass-3/pass-4 self-contradiction bug** (found live 2026-07-04, during
  Phase 8 verification — see Done below). `scheduler.js`'s `pickBatchSet` (Phase 7 code,
  untouched by Phase 8) can evict an incumbent in pass 3 (displacement) and then immediately
  re-admit that *same* server via pass 4's refill walk, within the same call, if the eviction
  freed more budget than the challenger needed and the evicted server's own cost fits in the
  leftover. The result is self-contradictory: the server appears in both `result.exits`
  (reason `"displaced"`) and `result.members` simultaneously. Downstream in `daemon.js` this
  means a real "exit" gets logged and a `drainDeadline` gets set, but the server never actually
  stops being a batched member (no matching "enter" ever logs either, since `previousMemberSet`
  already contained it) — not a functional/gameplay bug (the member loop still launches real,
  correct batches against it), but it corrupts the exit/enter log pairing and fails the
  natural-exit invariant `verify:log` check. Minimal repro (3 candidates, one call to
  `pickBatchSet`) confirmed the mechanism exactly:
  ```js
  const candidates = [
    { server: 'challenger', score: 300, pipelineCostGb: 12, prepped: true },
    { server: 'mid', score: 70, pipelineCostGb: 30, prepped: true },
    { server: 'n00dles', score: 60, pipelineCostGb: 5, prepped: true },
  ];
  pickBatchSet(candidates, ['mid', 'n00dles'], 35, 1.25);
  // -> result.exits has n00dles (displaced) AND result.members has n00dles -- both true
  ```
  Fix direction (not yet implemented): pass 4's refill walk needs to exclude servers this same
  tick's pass 3 just evicted (e.g. track a `justEvicted` set alongside `seatedServers` and skip
  it in the refill loop), or accept displaced servers as ineligible for refill entirely this
  tick. A calmer Phase-7-only session apparently never triggered this; Phase 8's share-fraction
  toggle causing a large simultaneous budget swing is what exposed it. Needs its own unit test
  in `test/scheduler.test.js` (the repro above, asserting a server never appears in both
  `exits` and `members`) before/alongside the fix.

- **Phase 8 tuning follow-up: get a clean A/B/A' session** (2026-07-04). This session's data had
  two real quality problems (see Done below): window A ran only ~5 min (spec wants >=10), and
  the income comparison was dominated by natural hacking-level growth over the ~30-minute
  session rather than share's actual cost. A properly-timed re-run (all three windows >=10 min,
  ideally over a shorter wall-clock span to reduce level-growth confound, or with the confound
  explicitly tracked via `ns.getHackingLevel()` readings at each boundary) would make the
  income-side number trustworthy enough to actually revisit `SHARE_FRACTION`. The rep-side
  comparison (see Done below) is already solid and doesn't need re-doing.

- **Phase 8 RAM anomaly: root cause still unknown, waived** (2026-07-04, decided by Kenneth
  after an extensive live bisection — see Done below for the full investigation trail).
  `daemon.js` measures 18.7 GB with Phase 8's changes vs. an expected ~16.3 GB (16.10 GB
  Phase-7 baseline + `ns.getSharePower`'s documented 0.2 GB) -- a genuine +2.6 GB unexplained
  delta, confirmed reproducible via ~20 live `getScriptRam` measurements, not a stale-baseline
  artifact. Real-file slicing narrowed the trigger to daemon.js's own steps 1-2 (`refreshCycle`
  + the pre-tick sweep), but every manual reconstruction of that same code (flat function
  calls, real `ramCosts` via `ns.scp`+`ns.getScriptRam`, loop-vs-flat placement, every pairwise
  and full-combination test of daemon.js's imports) measured the expected linear cost instead
  — meaning the actual trigger is some structural detail of the real file that wasn't isolated
  before time was called on the investigation. Not a functional defect (every tested variant
  only differs in the RAM number, never in behavior) -- explicitly waived as an acceptance
  criterion for this phase. Revisit with fresh eyes: candidate next step would be bisecting the
  *real* `daemon.js` file itself top-to-bottom via `git show`+splice (the technique that
  reliably reproduced it every time) rather than reconstructing scenarios from scratch (which
  never once reproduced it, across ~10 attempts).

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

- **Stock market — no design yet, mechanics straightened out for future design pass**
  (2026-07-04): No architecture decided; this is a mechanics reference to design against
  later, not a spec. Current save state: TIX API access purchased, no WSE account, no 4S
  data (matches [[bitburner_stock_market_progress]] memory).
  - **Two independent access doors, not a read/write split**: WSE account gates *manual*
    trading via the in-game Stock Market UI; TIX API access gates *scripted* trading via
    `ns.stock`. Each door covers both reading and trading for its own method — it's method
    (UI vs script) that's gated, not action (read vs buy/sell). You can hold either without
    the other, which is why scripted trading should already work despite no WSE account.
  - **4S Market Data is a premium add-on layered on top of whichever method you use**:
    `getForecast`/`getVolatility` return per-stock probability-of-rise and max per-tick
    swing — the actual trading edge. Gated by its own purchase: `purchase4SMarketDataTixApi()`
    for scripts (needs TIX API access, not WSE — a money gate, affordable now) vs.
    `purchase4SMarketData()` for the UI (needs WSE account). Separate from the base
    read/trade doors above.
  - **Progression-locked, not purchasable at all yet**: `placeOrder`/`cancelOrder`/`getOrders`
    (limit/stop orders) and `buyShort`/`sellShort` (short selling) — their docs say "unlocked
    later in the game," no purchase function exists for them.
  - **Doc inconsistency flagged, not yet resolved empirically**: `getPrice()` and
    `getOrganization()`'s docs list "WSE Account" as a requirement even for the scripted
    call, which contradicts `purchaseTixApi()`'s own doc ("you can buy TIX API access
    without a WSE account") and the fact that other read/trade calls (`getSymbols`,
    `buyStock`, `sellStock`, etc.) don't mention any WSE requirement. Worth testing directly
    in-game (e.g. `ns.stock.getPrice(ns.stock.getSymbols()[0])`) next time stock market work
    picks up, since it decides whether scripted reads already work today.
  - **Not yet decided, needs a real design pass before any code**: any actual trading
    strategy/script — nothing built yet, this entry is purely the access-mechanics
    reference gathered via docs + discussion this session.

- **Darknet exploitation — no architecture yet, mechanics captured for future design pass**
  (2026-07-04): Kenneth has a working mental model of how the darknet (`ns.dnet`) behaves,
  from discussion + docs in `markdown/bitburner.darknet*.md`, but no design/architecture
  decided. This entry is a mechanics reference to design against later, not a spec.
  - **Access/lifecycle chain**: `probe(returnByIP)` / `isDarknetServer(host)` /
    `getServerDetails(host)` to discover and inspect; `heartbleed(host)` to read logs and
    diagnose failed auth; `authenticate(host, password)` (direct-connect only) or
    `connectToSession(host, password)` (any distance, once already authenticated) to get a
    session; `setStasisLink(true)` / `freezeServer(host)` to hold a foothold against churn
    (`getStasisLinkLimit()` caps how many links can be active globally at once).
  - **Network volatility (the mechanic normal-network scripts don't have to deal with)**:
    `nextMutation()` ticks the whole darknet on its own clock — each cycle, some servers can
    move (breaks/reforms connections only, script likely survives), go offline (usually
    permanent, script and access gone), restart (kills all running scripts on that server), or
    a new server can appear. `getDarknetInstability()` is a cost/budget gate tied to
    backdooring activity — **open question, not yet checked in-game: is this global or
    per-server?** Matters for whether "throw more workers at it" has a hidden ceiling.
  - **Three extraction paths, not mutually exclusive**: (1) RAM — `getBlockedRam(host)` (free,
    0 GB) to check upside, then `memoryReallocation(host)` (needs auth + direct connection) to
    free usable RAM, scales with charisma/threads. (2) Money — `phishingAttack()` (must run
    *on* the darknet server, no target arg), scales with threads/charisma/crime success rate,
    very occasionally drops a `.cache` file as a bonus; `openCache(filename)` cashes it in
    (2 GB, costs karma). Caches are **not** a standing resource to seek out directly — the docs
    only describe them dropping from phishing, so this is "grab it when it appears," not a
    plannable target. (3) Stock — `promoteStock(sym)` needs no server access at all, just a
    symbol; raises a stock's *volatility* (not its forecast), decays without reapplication, and
    is only useful if paired with actual trading (see stock market unlock state in
    [[bitburner_stock_market_progress]] memory — 4S Market Data feed not active yet, blocked on
    WSE Account, so `promoteStock` has no trading strategy to pair with today).
  - **Karma**: `CrimeStats.karma` and `CacheReward.karmaLoss` both use "loss" terminology, and
    documented faction karma requirements are negative thresholds (e.g. `{ "type": "karma",
    "karma": -90 }` meaning karma must be ≤ -90) — read together, this suggests both crime and
    cache-opening push karma the same (more negative) direction that low-karma faction
    eligibility wants, i.e. no real tension between "open caches freely" and "keep karma low
    enough for some factions." **Not yet confirmed empirically** — cheap to verify with
    `ns.getPlayer().karma` before/after opening one cache.
  - **Prerequisite work**: the "Consistency consolidation" item above (new `src/common.js` with
    `scanNetwork`/`findPath`/`tryRoot`/etc.) should land first so darknet scripts can reuse
    those helpers instead of re-deriving BFS/rooting logic a second time.
  - **Not yet decided, needs a real design pass before any code**: scheduling model for
    volatile/moving targets (very different from the normal-network batcher's static-topology
    assumption), which of the three extraction paths to prioritize per server/situation, how to
    represent/react to `nextMutation()` events, and whether/how this integrates with or runs
    alongside `daemon.js`.

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

- **Batcher refactor Phase 8 — faction share allocation** (2026-07-04): `batcher-refactor-phase8.md`.
  Builds the "`ns.share()` script + dedicated RAM allocation" item into a hard carve:
  `SHARE_FRACTION = 0.25` (untuned by design, see spec) of `totalAllocatableRam` is
  unconditionally reserved for `share.js` (a one-cycle `ns.share()` worker, topped up every
  tick by `planShareTopUp` in `scheduler.js`, smallest-free-RAM-first — opposite end from
  `carveReservation`'s largest-first, so share consumes fragments and leaves contiguous blocks
  for batching's grow jobs); the batch admission budget becomes `(1 - SHARE_FRACTION) x
  totalAllocatableRam`. Zero `ns.kill` call sites (natural-exit philosophy, matching Phase 7) —
  scaling down just means stopping the top-up and letting the pool decay over ~10s. Runtime
  toggle: a 0-byte `share-off.txt` marker on home forces the fraction to 0 for same-session A/B
  measurement. `sampling.js`'s `inFlightByTarget` gained a breaking shape change
  (`{byTarget, share}`) to fold share's sweep into the existing two-sweeps-per-tick budget
  rather than adding a third. New manual tuning script `src/sharecurve.js` (formulas-gated)
  predicts the sharePower curve across candidate fractions, exported to
  `logs/sharecurve-<epoch ms>.json`. Branch `worktree-phase8-share`, draft PR #1, not yet
  merged (pending a merge decision, not blocked on anything technical).
  - **Runnable: `npm test` green at 120/120** (8 new `planShareTopUp` cases,
    `inFlightByTarget`'s 5 existing cases updated for the new shape plus 2 new share cases, 8
    checker-fixture cases for the 3 new `verify-log` hard assertions run via synthetic fixtures
    against extracted pure functions in `test/verify-log-checks.js`, 13 cases for the new
    `test/windowed-rate.js` helper). `npm run verify:log` validated against real boundary-copied
    logs from the live session below (see Ring-buffer note) — all pass 13/13 once each copy is
    read as its own self-contained window.
  - **Two bugs found and fixed along the way, unrelated to the phase's own core logic**:
    `test/windowed-rate.js`'s income-window helper originally required a record be *fully
    contained* in a window to count it — found live that income records coalesce on their own
    rolling ~5min cadence independent of the A/B toggle boundaries, so straddling is the common
    case, not a rare edge; the strict filter silently dropped almost every record near every
    boundary. Rewritten to prorate by time-overlap instead. Separately,
    `verify-transactions.test.js`'s `VALID_EXPENSE_SOURCES` whitelist was missing
    `upgradecloudserver.js`'s `'single-server-upgrade'` source (a gap since that script's own
    phase, unrelated to Phase 8) — added.
  - **Ring-buffer eviction, observed exactly as the spec warned**: a log copy taken well after
    a toggle can contain leftover entries from the *previous* window whose own `mode` event has
    since aged out of the 2000-entry ring (only the single most recent `mode` event is pinned).
    `verify-log`'s `latestConfigAsOf`-style checks then have no config to validate those
    stragglers against — a real, false-positive-looking failure that isn't a code defect, just
    a consequence of validating a mixed-window copy as if it were one window. Confirmed by
    slicing the log from its own `mode` event onward (dropping the stragglers): all 13 checks
    pass clean. Lesson for the next A/B session: take boundary copies *more* frequently than
    just at the toggle moments, or always slice from the latest `mode` event before validating.
  - **Live A/B/A' session, NiteSec hacking-type faction work throughout (2026-07-04)**:
    - **A (share OFF), 3:12:20–3:17:23 PM, ~5min — short of the >=10min target**, flagged live
      and accepted as a known limitation (redoing the whole ~35min protocol wasn't worth it
      this session). Rep 15.612k→15.8k (thin data, not a reliable full-window rate).
    - **B (share ON), 3:17:23–3:28:28 PM, 11min 5sec** — meets the target. Rep 15.8k→17.65k
      (**2.78 rep/sec average**).
    - **A' (share OFF again), 3:28:28–3:39:33 PM, 11min 5sec** — meets the target. Rep
      17.65k→18.926k (**1.92 rep/sec average**).
    - **B-vs-A' is the trustworthy comparison** (both full >=10min windows, temporally
      adjacent, so much less exposed to session-long hacking-level drift than A is): **rep/sec
      was ~45% higher under share** (2.78 vs 1.92). This lines up well with the measured
      `sharePower` of 1.417 (a ~42% multiplier) — independent confirmation that share is doing
      what it's supposed to, for hacking-type faction work.
    - **Income (windowed, overlap-prorated)**: A ~$805M/min, B ~$494M/min, A' ~$2.25B/min.
      A-vs-B alone would suggest share cuts income roughly in half (plausible, matches the
      spec's accepted RAM/XP tradeoff), but A''s number is 4-5x everything else and is almost
      certainly dominated by natural hacking-level growth compounding over the ~30-minute
      session, not a share effect — **not clean enough to quote an income cost from this
      session** (see the Next Up follow-up item for a cleaner re-run).
    - **`sharecurve.js` run once during window B**: capacity 1.06 PB, 65,662 threads actually in
      flight (vs. the 25% target's theoretical 66,102 — the expected one-cycle-worker
      undershoot), measured `sharePower` 1.417. Curve: 5%→1.380, 10%→1.407, 15%→1.424,
      25%→1.444, 40%→1.463, 50%→1.472, 75%→1.488, 100%→1.499 (steep diminishing returns already
      visible — 25% already captures ~89% of the theoretical max power at 100% RAM commitment).
      Decision-rule check: predicted power at the actual 65,662 threads (interpolated) = 1.4437
      vs. measured 1.417 — a 1.85% gap, comfortably inside the 2x defect bound. **Pass, no
      defect.**
    - **Recommendation on `SHARE_FRACTION`: keep at 25% for now.** The curve's steep diminishing
      returns mean 25% already captures most of the achievable rep boost (raising it further
      buys little more power for a lot more batching RAM given the curve's shape), and this
      session's income-cost data isn't clean enough to justify either raising or lowering it
      with confidence. Revisit once the cleaner re-run (see Next Up) gives a trustworthy
      income-cost number.
  - **RAM gate: `share.js` closed at exactly 4.00 GB as expected (1.6 base + 2.4 `ns.share`).
    `daemon.js` measured 18.7 GB against an expected ~16.3 GB — unexplained +2.6 GB delta,
    waived as an acceptance criterion after an extensive live bisection failed to pin the exact
    cause** (see the two Next Up follow-up items for the full investigation trail and the
    accepted path forward).
  - A real, pre-existing Phase 7 bug in `pickBatchSet` was discovered during this session's log
    validation (natural-exit invariant failure) — not fixed here (out of this phase's stated
    scope, which explicitly excludes touching `pickBatchSet`'s internals); see the dedicated
    Next Up item for the full mechanism and a minimal repro.
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
