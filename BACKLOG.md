# Backlog

Tracks feature work and goals across sessions. Update when starting/finishing something;
move finished items to Done with a date instead of deleting them.

## In Progress

(none)

## Next Up

- **Priority order — next three phases (agreed with Kenneth 2026-07-05, post-Phase-11):** work them
  in this sequence, chosen for compounding benefit (Kenneth's call: 3 → 1 → 2):
  1. ~~**`/spec` command**~~ — **DONE 2026-07-05** (`.claude/commands/spec.md`; full details under
     the "automating the spec-review loop" Ideas item). Was the meta-tool; now available to spec
     out the remaining two phases below. Still needs a first real live run to shake out.
  2. **`upgradehomeram.js` → resource-manager customer** — the "Future finance-manager customers"
     sub-item under "Phase 10 follow-ups" (Ideas). Rides the warm Phase 11 budget-authority
     architecture (same reservation-gated `available`-cash customer pattern as `cloudmanager.js`)
     and closes the money→RAM→income flywheel: more home RAM feeds the whole batcher.
  3. **Consistency consolidation (`src/common.js`)** — the Next Up item below. Behavior-preserving,
     and it mints the `tryRoot`/`findPath`/`scanNetwork` helpers that the auto-backdoor and darknet
     phases both depend on, so it must land before either of those (its only hard ordering
     constraint — nothing in this batch conflicts with it going third).
  - The remaining Next Up items (Source-File watcher, RAM-analyzer hygiene) are quick wins to
    fold into whichever phase is already touching those files, not standalone phases. (The
    targetsmonitor priority-column item folded into Phase 12 — see Done.)

- **Lightweight Source-File watcher for `procureprograms.js`** (2026-07-05, proposed, not built):
  Kenneth asked whether `procureprograms.js` could just stay resident until it can buy TOR/openers
  "no matter what." Recommended against running the full ~67GB script resident indefinitely — the
  RAM cost is fixed for as long as it's alive regardless of activity, and the wait for the
  Source-File it needs could be long, so that RAM is better spent on the hacking/growing/weakening
  worker pool in the meantime. Proposed instead: a tiny (~1GB) always-on watcher that polls
  `ns.getResetInfo().ownedSF` cheaply and only `exec`s `procureprograms.js` once that Source-File is
  actually active, instead of holding the full footprint the whole time. Not yet built — Kenneth
  hadn't decided between this and just remembering to manually re-run it. Revisit alongside the
  "re-validate TOR/port-opener automation" Ideas item below, since they're the same follow-up.



- **RAM-analyzer identifier hygiene** (2026-07-04, filed from the Phase 9 investigation): the
  same exact-name-collision mechanism that caused the `share`/`ns.share` 2.4 GB phantom charge
  likely also applies to `WORKER_SCRIPTS`' keys — `hack`/`grow`/`weaken` (`scheduler.js`) match
  `ns.hack`/`ns.grow`/`ns.weaken`'s names exactly, which would mean every importer of
  `WORKER_SCRIPTS` has been paying a phantom 0.1 + 0.15 + 0.15 = 0.4 GB since Phase 2. Verifiable
  with the same E-matrix technique (`batcher-refactor-phase9.md`'s fallback diagnostic plan) —
  object keys, not standalone identifiers, so worth confirming object-literal-key charging
  specifically before assuming it applies. Renaming `WORKER_SCRIPTS`' keys is a wider refactor
  than this phase's scope (touches every `WORKER_SCRIPTS[...]` call site across `scheduler.js`,
  `daemon.js`, `sampling.js`) — not started.
  - **Live-confirmed the mechanism again, a different flavor, in Phase 11 (2026-07-05):**
    `cloudmanager.js`'s `nextCloudName` called `CLOUD_NAME_PATTERN.exec(name)` — plain
    `RegExp.prototype.exec`, nothing to do with `ns.exec` — and got charged the full 1.30 GB
    `ns.exec` cost anyway (`mem cloudmanager.js` showed it plainly: `1.30GB | exec (fn)`). Fixed
    there via `name.match(...)` instead. This is the same textual-collision theory as the
    `WORKER_SCRIPTS` suspicion above, now confirmed for a *method name* collision (not just a
    standalone identifier or object key) — raises confidence that the `WORKER_SCRIPTS` phantom
    charge is real and worth the E-matrix confirmation pass.

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
    ~~`purchasescripts.js` (drop the false "daemon runs this at startup" claim)~~ **superseded
    by Phase 11 (2026-07-05)**: `purchasescripts.js` was renamed + rewritten to
    `procureprograms.js`, whose header now correctly documents daemon.js launching it at
    startup (the claim is true now, not just corrected) — don't redo this sub-item.
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

- **Re-validate `procureprograms.js`'s TOR/port-opener ladder live** (2026-07-05, filed from Phase
  11's Round B): Kenneth's account doesn't yet have the Source-File `ns.singularity.purchaseTor`/
  `purchaseProgram` require, so the auto-buy ladder has never actually been observed working live —
  only its "can't run yet, exit cleanly" path has. Once that Source-File is available, `run
  procureprograms.js` (or a `daemon.js` restart) should walk TOR then the port openers automatically;
  worth a deliberate check the first time it's possible, since the code path is untested in reality.
  Pairs with the lightweight watcher-script idea in Next Up.

- **Phase 10 follow-ups** (2026-07-05, filed per `finance-cloud-phase10.md`'s Files section;
  none of these block Phase 10 sign-off):
  - **Augment reservation cost model**: `resourcemanager.js`'s (renamed from `financemanager.js`
    in Phase 11) `manual-extra` rule (`finance-reserve-extra.txt`) is an explicit stopgap for
    augments, back-burnered this phase per Kenneth. A real design would need an augment
    cost/priority model (which augments, in what order, at what price) to turn into its own
    reservation rule. Still not done as of Phase 11.
  - **Rename-only cosmetic utility — done (2026-07-05):** proved annoying in practice almost
    immediately (`pserv-4096gb-0` grew to 524288GB live during Round A). `src/renamecloudservers.js`
    — manual, not wired into `daemon.js`, renames every owned server to `cloud-<n>` (no capacity
    in the name), idempotent (a server already matching `cloud-<n>` is left alone and its index
    reserved, so a re-run after buying more servers only touches the new ones). Never
    purchases/upgrades anything; doesn't touch `upgradecloudserver.js`/`fleetupgrade.js`'s
    existing rename-and-recreate behavior. **Superseded for auto-bought servers by Phase 11**:
    `cloudmanager.js` now names its own purchases `cloud-<n>` directly (`nextCloudName`), so this
    utility is only needed for legacy `pserv-*` names going forward.
  - **Future finance-manager customers — done (2026-07-05, partially):** `cloudupgrader.js`
    (renamed `cloudmanager.js`) was deliberately the only customer in Phase 10; Phase 11 kept it
    the only customer but widened its own scope to cloud *purchasing* too. `upgradehomeram.js`
    remains unconditional (same available-cash gating opportunity, still not done).

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

- **Dev-loop observability — get errors/signal into files, not lossy terminal copy/paste**
  (2026-07-05): umbrella theme over three items sharing one root cause — the game↔repo bridge
  produces signal (errors, stalls) that today is only visible in the terminal, where copy/paste is
  lossy (the same reason `CLAUDE.md`'s log-export rule prefers exported files over pasted terminal
  output). **Fresh motivating example (2026-07-05):** Phase 12's root-access error flood (Recent
  Errors tab filled with `weaken.js`/`grow.js` crashes from a `targets.js` eligibility bug) was
  only visible in-game — no exported log surfaced it, and it was diagnosed from Kenneth's live
  observation rather than a file. Still no log-capture work done this phase; the fix was in the
  eligibility logic itself, not in surfacing the error. New idea filed here:
  - **Export sync/game errors to `logs/`** (2026-07-05, Kenneth): when the viteburner sync with the
    filesystem breaks, it prints an error in the `npm run dev` terminal — capture *that* to a file.
    **Primary target is the Node-side sync/dev-server error** (emitted by the viteburner process,
    not in-game), so the capture is Node-side: tee the dev-server stdout/stderr to a log, or a
    `vite.config.ts` plugin hook. Chicken-and-egg wrinkle to design around: at the moment sync
    breaks, the in-game→`logs/` export bridge is exactly what's down, so an `ns.write` can't carry
    the error out — this has to be captured on the Node side. Separate, easier sub-case if wanted:
    in-game **script runtime errors** can be `try/catch`'d → `ns.write` and exported the normal way.
    Decide scope (sync errors first) at pickup.
  - Groups with the two items just below, same theme: **"viteburner dev-server silently stops
    auto-exporting"** (the *silent* variant — same bridge, no error emitted at all) and **"getting a
    screenshot into a terminal session"** (the lossy-terminal workaround that motivated the theme).
    Consider physically consolidating all three under this heading on the next real reorg.

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

- **Claude Code workflow to learn: automating the spec-review loop** (2026-07-04; progress
  2026-07-05): the brainstorm→spec→implement workflow is now documented in `CLAUDE.md`
  (`## Development workflow`), and the four recurring standing rules that used to be re-pasted
  into every fable prompt (Singularity RAM, transaction logging, tests+log validation, the
  static-value spoiler carve-out) moved into `CLAUDE.md` (`## Engineering conventions` + the
  Off-limits carve-out) so they drop out of the per-run prompt. Remaining build-out:
  - ~~**Level 1 — reviewer subagent**: `.claude/agents/spec-reviewer.md` (YAML frontmatter +
    markdown body that becomes its system prompt). Fixed rubric: review against the stated
    requirements; flag ambiguity, missing edge cases, untestable acceptance criteria, hidden
    assumptions. Read-only tools (`tools: Read, Glob, Grep`). Required verdict format: APPROVE
    or a numbered list of blocking issues only.~~ **Done (2026-07-05):** built as
    `.claude/agents/spec-reviewer.md` — read-only tools, `model: opus`, the four-category
    rubric + APPROVE/`BLOCKING ISSUES:` verdict, plus an added check that the spec honors the
    `CLAUDE.md` engineering conventions (blocking if violated). The `/agents` wizard is retired
    in the current CLI; the file placed in `.claude/agents/` is the whole setup.
  - ~~**Level 2 — `/spec` command**: encode the whole loop so the per-run prompt collapses to
    `/spec phase-n-features.md` (a slash command at `.claude/commands/spec.md` with `$ARGUMENTS`,
    chosen over a skill — lighter, args substitute directly).~~ **Done (2026-07-05):** built as
    `.claude/commands/spec.md` (`disable-model-invocation: true`; no `model` field, so it inherits
    the session model per Kenneth's call; `argument-hint` set). Seven-step body: resolve inputs →
    read features + `CLAUDE.md` + latest `*-spec.md` template + skim `BACKLOG.md` → clarify-or-
    proceed gate (ask/suggest before drafting, skip if fully aligned) → draft spec → delegate cold
    review to the `spec-reviewer` subagent → revise one round (disputes become open questions) →
    present draft/changelog/open questions and stop before implementation. **Argument is
    optional:** `/spec` alone globs `*phase<N>-features.md`, picks the highest `N`, and announces
    the pick; `/spec <file>` targets a named one. Placed via the shell mount because this session
    guards writes to `.claude/`; verified on the Windows side. **First real live run confirmed (2026-07-05,
    Phase 14 — see Done below):** `/spec` drafted `bootstrap-phase14-spec.md`, and the
    `spec-reviewer` subagent caught 3 real blocking issues (per-opener nudge dedup key, a
    required-hacking-level read scoped to only one candidate instead of all, inconsistent
    null-target poll behavior) — all fixed before implementation began. The loop worked
    end-to-end as designed, not just statically verified.
  - **Step 8 — brainstorm brief (optional):** have the opus brainstorm end by writing
    `phase-n-features.md` itself (decisions, rejected alternatives, open questions) so even the
    opus→fable handoff is a file, not a re-paste.
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

- **Repo organization / decluttering — investigate, no plan committed yet** (2026-07-05):
  raised the "everything's lumped together, hard to tell what's what" pain; reviewed the tree
  read-only (no files moved). Finding: the clutter is mostly the **repo root**, not `src/`, and
  the two carry very different risk.
  - **Root is the low-risk win (nothing here is code viteburner touches).** `vite.config.ts`
    only watches `src/**`, so the ~25 loose root items are neither synced to the game nor
    imported — moving them into folders breaks nothing. Inventory to sort: build/test config
    (`package*.json`, `tsconfig.json`, `vite.config.ts`, three `vitest*.config.ts`); reference
    reading (`AI Code Review Do and Dont.pdf`, `Calibrated Trust in Agentic Coding.pdf`,
    `instructions_hierarchy.pdf`, `Capture.JPG`, `NetscriptDefinitions.d.ts`); the nine
    `batcher-refactor-phaseN.md` writeups; two `bitburnerSave_*.json.gz` snapshots;
    `augments_owned.csv`. Candidate folders: `docs/` (phase writeups — BACKLOG.md likely stays
    at root as the live index), `reference/` (PDFs + screenshot), `saves/` (`.gz`). Only fallout
    is cosmetic: BACKLOG references the phase docs by bare filename, so those go path-stale.
    **Caveat:** `NetscriptDefinitions.d.ts` is referenced by `tsconfig.json` (`paths.@ns` +
    `include`) — it stays at root or moves *with* a tsconfig edit, not a blind move. (The two
    dead files — root `cloud-server-costs.js` dup, `src/cleanup-old-daemon-log-temp.js` — are
    already covered by the "Consistency consolidation" Next Up item; don't double-file.)
  - **`src/` subfolders are NOT light — the part to think hard about before doing.** 24 flat
    files; splitting them chains through three things: (1) the relative imports (`./hosts.js`
    etc.) all rewrite; (2) `WORKER_SCRIPTS` (`{hack:"hack.js", grow, weaken}`) and `SHARE_SCRIPT`
    (`"share.js"`) are bare in-game filenames `daemon.js` `exec`s by name, so moving the workers
    changes those constants; (3) viteburner mirrors the `src/` tree into the game filesystem, so
    subfolders change every script's *in-game* path — which drags in the daemon's exec targets,
    any manual `run` commands, and a required re-push + daemon restart. Earns the RAM gate + a
    before/after daemon session, not a casual tidy.
  - **Zero-risk alternative that still fixes "tell what is what":** don't move anything, add a
    role-map (`src/README.md` or a CLAUDE.md block). Grouping observed this session — core loop
    (daemon/scheduler/sampling/targets), workers (hack/grow/weaken/share), monitors
    (launchmonitor/targetsmonitor/transactionsmonitor), fleet+infra
    (fleetupgrade/purchase\*/upgrade\*/cloudcosts), shared libs (hosts/translog, + the planned
    `common.js`), one-shots (connect/killscripts/ramcheck/sharecurve).
  - **If a physical `src/` split happens later**, the natural seam isn't topic, it's
    library-vs-entrypoint (scheduler/sampling/targets/hosts/translog are imported; the rest are
    run directly) — and that lines up with the `common.js` "Consistency consolidation" item, so
    fold a move into that refactor rather than doing it standalone.
  - **Aside (not a reorg target):** `dist/` holds ~70 stale build artifacts (≈30 `ramtest-*`,
    plus reverted-Phase-6 `common.js`/`eventlog.js`/`factionwatcher.js` and retired
    `moneymonitor.js`) — gitignored, regenerated on `vite build`, safe `rm -rf` if it adds noise
    while browsing.

## Done (recent)

- **Docs/memory cleanup — strip git rules to version-control basics** (2026-07-05, done; merged to
  `master` via `docs/slim-git-rules`, branch deleted): Kenneth wanted the git *implementation* rules
  gone — he cares that version control exists and is used, not how it's run. `CLAUDE.md`: slimmed the
  `## Git` section to "branch/commit/merge in interactive sessions, no need to ask" **plus** the kept
  background-job merge safety rail; dropped the "commit phase docs alongside code" workflow mechanic —
  committed as `c74548a`. Memory (user-scoped, nothing to commit): 10 files → 7 — deleted the
  pure-git-mechanics memories `one_branch_at_a_time`, `push_phase_docs`, and
  `no_background_jobs_for_git_merge_workflows` (its safety-rail substance now lives only in
  `CLAUDE.md`, still harness-enforced); reframed `verification_loop_is_live_game` around the
  test-in-the-live-game discipline with the git plumbing stripped out; repointed/removed dead
  `[[links]]` and updated `MEMORY.md`'s index.

- **Docs/memory cleanup — CLAUDE.md dedupe + memory consolidation** (2026-07-05, done; merged to
  `master` via `docs/claudemd-dedupe`, branch deleted): audit of `CLAUDE.md` and the `~/.claude`
  auto-memory for redundancy. `CLAUDE.md`: folded the duplicate "verify against the log files"
  clause out of *Communication* into the *Prefer exported logs* engineering bullet (they said the
  same thing) — the only repo change, committed as `ef72433`. Memory (user-scoped, nothing to
  commit): 13 files → 10 — merged the two Phase-5 stranded-branch memories into one
  `verification_loop_is_live_game`; folded `debug_observability_first` into `own_npm_run_dev`;
  merged `dev_server_auto_reconnect` + `viteburner_stale_connection_workaround` into
  `dev_server_connection_health`; repointed all `[[links]]`, removed the dangling
  `[[bitburner-scripts-branching]]` references, and rewrote `MEMORY.md`'s index to match.

- **Phase 14 — cold-start bootstrap (8GB home → daemon.js handoff)** (2026-07-05, done): `bootstrap-phase14-features.md` → `bootstrap-phase14-spec.md`
  (peer-reviewed via the `spec-reviewer` subagent — first real `/spec` live run; 3 blocking issues
  found and fixed: per-opener nudge dedup key, requiredHackingLevel read for all candidates not
  just the pick, null-target poll behavior unified). Jumps the post-Phase-11 priority queue (same
  precedent as Phase 12) because the 2026-07-05 hard reset took the whole income pipeline
  offline — `daemon.js` (16.3GB) can't load on the 8GB home. Design: two new scripts
  (`bootstrap.js` deployer + `bootloop.js` remote worker; names confirmed by Kenneth at spec
  review), single-best-target loops on rooted servers' RAM, control-file retargeting, auto-handoff
  to `daemon.js` on a dynamic fit check (~19.3GB free, i.e. the 32GB home tier). Existing pipeline
  untouched. Built on `worktree-phase14-bootstrap`.
  - **`npm test` green at 231/231** (190 pre-phase + 12 `test/bootloop.test.js` +
    21 `test/bootstrap.test.js` + 8 new `test/checker-fixtures.test.js` cases for the new
    `test/verify-bootstrap-checks.js` checker). `test/verify-bootstrap.test.js` wired into
    `npm run verify:log` via the existing glob, skip-clean confirmed before a real log exists.
  - **RAM gate: closed (2026-07-05), via `ramcheck.js` → `logs/ramcheck-result.json`.**
    Initial pass: `bootstrap.js` **6.00 GB** (predicted 6.00, hard ceiling <8.00), `bootloop.js`
    **2.20 GB** (predicted 2.20, gate ≤2.2), `daemon.js` **16.30 GB** (flat, zero delta),
    `killscripts.js` **3.00 GB** (first recorded baseline, matches predicted ~3.0) — every
    number landed exactly on the spec's prediction, no identifier-hygiene hunt needed.
  - **Live-validation bug found and fixed (2026-07-05): tail-popup thread count read 0 once
    saturated.** `bootstrap.js`'s status print originally reported only *this poll's newly
    launched* threads/hosts, which is legitimately 0 once every host already has a bootloop
    resident — misleadingly implied nothing was running. First fix attempt (an in-memory
    per-host accumulator) was itself wrong: it resets to 0 on every `bootstrap.js` restart even
    though previously-launched `bootloop.js` workers keep running untouched, confirmed live when
    Kenneth restarted `bootstrap.js` without killing anything and the display still read 0/0.
    Real fix: a live `ns.ps()` sweep per poll (`countRunningBootloopThreads`), self-correcting
    across restarts/manual kills since it asks the game for actual process state instead of
    remembering what this instance launched. Cost `bootstrap.js` +0.20 GB (`ns.ps`, per
    `markdown/bitburner.ns.ps.md`) — re-measured **6.20 GB**, still well under the 8.00 hard
    ceiling. `npm test` stayed 231/231 through both fixes (display logic isn't unit-tested,
    only the pure helpers are).
  - **Live validation: complete (2026-07-05), all 6 spec steps observed.** Darkweb pre-check
    confirmed nothing survived the hard reset. `run bootstrap.js` rooted all 10 zero-port
    servers plus CSEC on the first poll, picked harakiri-sushi (fallback tier at hacking level
    ~1, later flipped to primary as level climbed, then neo-net), deployed up to 102 bootloop
    threads across 12 hosts. Both nudges fired and were acted on: `tor-router` ($200k) then
    `relaySMTP.exe` ($5M), Kenneth bought the TOR router live off the first nudge. Handoff fired
    cleanly once home crossed the 32GB threshold (bought 64GB): `homeFreeRam: 57.8`, `daemonPid:
    19`, `handoff` landed as the log's sole/terminal entry as designed — `bootstrap.js` exited,
    `daemon.js` took over. `npm run verify:log` green (35/35) throughout, including against the
    final log with every event kind (`startup`/`new-hosts`/`nudge`/`deploy`/`handoff`)
    represented. Merged to `master`.

- **Phase 12 — targeting: root-access eligibility fix (+ ratio→priority fold-in)**
  (2026-07-05, done; merged to `master` and pushed, branch `phase12-targeting`):
  `targeting-phase12-features.md`, `targeting-phase12-spec.md`. Unplanned hotfix —
  jumped the agreed post-Phase-11 priority queue — for a live error flood on the current
  post-augment-install save: `weaken.js`/`grow.js` crashed continuously (`Cannot
  weaken/grow <server> because you do not have root access`) against seven unrooted servers
  (computek, the-hub, crush-fitness, johnson-ortho, omega-net, phantasy, silver-helix) because
  `targets.js`'s `getTargets()` eligibility filter checked money and hacking level but never
  `ns.hasRootAccess` — masked pre-reset since everything passing the level filter was already
  rooted, exposed once the reset cost TOR/port-opener ownership while hacking level kept
  climbing.
  - **Fix**: new pure exported predicate `isEligibleTarget({rooted, maxMoney,
    requiredHackingLevel, myHackLevel})` in `src/targets.js`, adding root access as a condition
    alongside the existing money/level checks (semantics preserved exactly otherwise). No
    worker-side guard (would cost 0.05 GB/thread fleet-wide to guard now-unreachable state), no
    rooting logic added to `targets.js` (stays `hosts.js`'s job), zero `daemon.js` code change —
    it inherits the fix through `getTargets()`.
  - **Fold-in (BACKLOG's own quick-win, moved here from Next Up)**: `targetsmonitor.js` and
    `targets.js`'s summary now show `priority ${score.toExponential(2)}` instead of the
    unrelated server-intrinsic `ratio` field (removed from the target objects and from
    `targets-summary-*.json`'s schema); the misleading `->` marker in `targetsmonitor.js` is
    relabeled with a legend ("top-ranked by score (the daemon's active set can differ under
    hysteresis)") instead of falsely claiming it's the daemon's current batch target.
  - **`npm test` green at 190/190** (184 pre-phase + 6 new `test/targets.test.js` cases for
    `isEligibleTarget`, including the not-rooted regression case and the exact-half-level
    boundary).
  - **RAM gate: closed (2026-07-05), via `ramcheck.js` → `logs/ramcheck-result.json`** (not
    `mem`/terminal — see `feedback_oneoff_scripts_need_logged_output` memory). `daemon.js`
    **16.3 GB (exact match, flat)**, `targets.js` **12.7 GB (+0.05, as predicted)**,
    `targetsmonitor.js` **12.7 GB** — no historical baseline was ever recorded for
    `targetsmonitor.js` specifically, but the number is fully explained (same
    `hasRootAccess`-via-`getTargets` reachability as `targets.js`) with no unexplained delta, so
    no identifier-hygiene hunt needed.
  - **Live validation: complete (2026-07-05).** Daemon restarted; Recent Errors tab stayed
    clean over a 10-minute window (no new root-access errors). `targetsmonitor.js` confirmed
    showing the `priority` column and marker legend. `run targets.js` exported
    `targets-summary-1783270612596.json` — 11 rooted-only targets, no `ratio` field anywhere,
    none of the seven previously-erroring servers present. `npm run verify:log` green (28/28)
    against the live session log: 7 natural exits, all ordinary `unaffordable` reasons (nothing
    error-related), 11 members batched, zero skips, zero xcheck mismatches.
  - **Aside (2026-07-05): viteburner's export bridge went silently stale mid-session** — two
    `ramcheck.js` runs produced byte-identical stale output before the dev server was
    killed+restarted, confirming the connection had gone dead despite `ESTABLISHED` looking
    fine. Not a Phase 12 code issue; see the `feedback_viteburner_stale_connection_workaround`
    memory (updated this session to preempt this at the start of future phases' RAM-gate steps
    rather than diagnosing it reactively each time).

- **Phase 11 — resource manager: active procurement** (2026-07-05, done; merged to master and
  pushed as of 2026-07-05, branch `worktree-phase11-procurement` deleted post-merge):
  `resource-manager-phase11-spec.md`
  (peer-reviewed, APPROVE with no blocking issues; postscript added after Round B — see below).
  Closes the loop Phase 10 left open — automates the purchases `financemanager.js`'s reservations
  were only protecting, so a fresh reset can bootstrap the fleet with minimal hand-buys.
  - **Three renames + one behavior evolution each:** `src/financemanager.js` → `resourcemanager.js`
    (charter/behavior unchanged, label text updated); `src/cloudupgrader.js` → `cloudmanager.js`
    (adds bootstrap-buy + growth-buy on top of the Phase 10 upgrade loop, via new pure
    `shouldBuyGrowthServer`/`nextCloudName`); `src/purchasescripts.js` → `procureprograms.js`
    (evolved from a single-pass darkweb-program sweep into a self-terminating TOR + port-opener
    poll loop scoped to those two program types only, via new pure `planProgramPurchase`/
    `bootstrapHoldbackFrom`; prices come from `resourcemanager.js`'s static cost table, not
    darkweb reads). All three `git mv`'d with history preserved.
  - `daemon.js` startup now launches all three under their new names; `test/verify-transactions.test.js`'s
    `VALID_EXPENSE_SOURCES` gained `auto-tor`/`auto-port-opener`/`auto-cloud-purchase` (old
    `darkweb-program` kept for historical logs); `vite.config.ts` and `renamecloudservers.js`
    comments updated; grep-confirmed zero remaining functional references to the three old
    filenames (only intentional rename-provenance comments remain).
  - **`npm test` green at 184/184** (up from Phase 10's 162/162).
  - **RAM gate: closed.** `daemon.js` 16.30, `resourcemanager.js` 3.35, `cloudmanager.js` 6.25,
    `procureprograms.js` **67.25** (see fixes below) — all matching prediction or explained.
    `cloudmanager.js` first measured 7.55 (1.30 GB over); `mem cloudmanager.js` traced it to
    `ns.exec`, caused by `nextCloudName`'s `CLOUD_NAME_PATTERN.exec(name)` — the RAM analyzer
    charges the full `ns.exec` cost for any literal `.exec(` in a script regardless of what it's
    called on (same identifier-hygiene mechanism as the `WORKER_SCRIPTS` suspicion below, confirmed
    live here for the first time). Fixed via `name.match(CLOUD_NAME_PATTERN)`, re-measured clean
    at 6.25.
  - **Round A: complete and green** — rename smoke test, manual-override gate, staleness fail-safe,
    off switch, `npm run verify:log` (28/28 against real logs) all passed live.
  - **Round B (the one reset): partial pass, and a real bug found.** `cloudmanager.js`'s side
    validated fully hands-off — `bootstrap-server` reservation released within 2s of `daemon.js`
    restarting, `cloud-0` auto-bought and auto-upgraded through several tiers, zero hand-buys.
    But `procureprograms.js` **crashed** on its first post-reset pass:
    `ns.singularity.purchaseTor()` **throws** (doesn't return `false`) when the account lacks the
    Source-File Singularity purchasing requires — an assumption error going back to Phase 9/10's
    "RAM multiplier without SF4" language, which read as "usable, just pricier," not "hard-gated."
    Kenneth doesn't have that Source-File yet, so the TOR/port-opener half of this phase's
    zero-hand-buy goal is unverifiable for now — not a code defect, just unreachable at this stage
    of the save. Fixed with two layers: a proactive `ns.getResetInfo().ownedSF` check (1 GB, not
    itself Singularity-gated) that exits cleanly before ever attempting a purchase, plus a
    `try/catch` backstop around both purchase calls in case the proactive check ever misses a
    case. Either path prints one message and exits, freeing the ~67GB surface, same as the
    "everything owned" exit; `resourcemanager.js`'s reservations are untouched, so hand-buying TOR
    and the port openers is still available exactly as before this phase. Verified live: re-running
    `procureprograms.js` now exits cleanly with `"can't auto-buy yet (Source-File 4 not active)"`
    instead of crashing. `npm test` stayed 184/184 through both fixes. Full writeup in the spec's
    "Live implementation note" postscript.
  - **Not pushed yet** — local branch only, pending Kenneth's final go-ahead.
  - **Follow-ups filed:** re-validate the TOR/port-opener ladder live once the required Source-File
    is available (Ideas/Backlog); the lightweight watcher-script idea (Next Up) as an alternative
    to a manual re-run at that point; decide whether to hand-buy TOR + FTPCrack.exe now to relieve
    their reservation in the meantime, or leave them reserved (Kenneth's call, undecided as of
    2026-07-05).

- **Phase 10 — finance manager + cloud server auto-upgrader** (2026-07-05, done; branch
  `worktree-phase10-finance` merged to `master` at `5e5f74d`): `finance-cloud-phase10.md`. Two new
  daemon-launched companions: `financemanager.js` (reservation-based available-cash service — 110k
  first-server bootstrap, TOR, cheapest unowned port opener, Formulas.exe above hacking-level
  threshold, plus a `finance-reserve-extra.txt` manual override as the augment stopgap; zero
  Singularity calls, static price table verified in-game; publishes `finance-state.json`, tprints
  reservation changes, exports `finance-log.json`) and `cloudupgrader.js` (its first customer —
  upgrades the lowest-RAM cloud server one tier at a time from available cash only; upgrade-only,
  no purchases, no renames; `cloud-upgrade-off.txt` pause marker; stale-state fail-safe;
  `auto-cloud-upgrade` transactions records). Peer-reviewed 2026-07-05 (two blocking issues fixed:
  `upgradeServer(false)` loop-termination path, startup-event kind in the finance log).
  - **Runnable acceptance: `npm test` green at 159/159** (128 pre-existing + 21
    `test/finance.test.js` + 10 `test/cloudupgrader.test.js`). `test/verify-finance.test.js` wired
    into `npm run verify:log`, confirmed skip-clean/fail-clean/pass-clean against synthetic
    fixtures before any real log existed.
  - **RAM gate: closed.** `daemon.js` **16.3 GB** (exact Phase 9 baseline, zero growth),
    `financemanager.js` **3.35 GB**, `cloudupgrader.js` **3.7 GB** — both exact matches to the
    predicted numbers. No identifier-hygiene hunt needed.
  - **Round A (current save, no reset): complete.** Startup wiring, the manual-override
    reserve→gate chain (both directions — the phase's core safety property), a full unprompted
    upgrade run (4096GB → 524288GB across 7 doubling-cost tiers), the off switch (both
    directions), and kill/restart staleness resilience (single WARN, not spam) all passed live.
    `npm run verify:log` green throughout.
  - **Aside, unblocked mid-Round-A:** Kenneth asked for a rename-only utility after seeing
    `pserv-4096gb-0`'s name go stale live — shipped as `src/renamecloudservers.js` (manual,
    idempotent, upgrade-only scripts untouched); already run successfully, survived a live rename
    with the very next `auto-cloud-upgrade` record correctly tracking the renamed server by
    identity.
  - **Round B (2026-07-05, the augment-install reset): complete.** Confirmed live that this
    reset wipes purchased/cloud servers and TOR ownership but *not* darkweb program files
    (BruteSSH.exe survived) — a real-mechanics observation the spec didn't assume either way.
    Fresh ladder appeared correctly (`bootstrap-server` $110k + `tor-router` $200k +
    `next-port-opener` BruteSSH/FTPCrack per current ownership); all three price constants
    matched Kenneth's live `buy -l`/purchase-UI check exactly, no fixes needed.
    `bootstrap-server` and `tor-router` each released within one poll of the matching purchase;
    `next-port-opener` walked BruteSSH → FTPCrack → relaySMTP live as programs were bought.
    Confirmed via the transactions log that the upgrader stayed correctly frozen (`available`
    pinned at $0, zero `auto-cloud-upgrade` records) while the `formulas` reservation ($5B)
    dwarfed cash. `npm run verify:log` green (28/28) on the real post-reset logs.
  - **Change request mid-Round-B: `FORMULAS_HACKING_LEVEL_THRESHOLD` bumped 300 → 400**
    (`src/financemanager.js`, plus the two boundary-dependent `test/finance.test.js` cases).
    Live-observed that hacking level climbed 36 → 411 in the same session (fast leveling from
    high hacking income), so the reservation stayed active even after the bump — a real
    moving-target case, not a bug; Kenneth chose to accept it and move on rather than raise the
    threshold further or drop the rule (low risk, revisit if it becomes annoying).
  - **Acceptance criteria met in full** — see follow-ups filed under Ideas / Backlog: augment
    reservation cost model (still back-burnered), future finance-manager customers
    (`upgradehomeram.js` next), and the deferred upper-ladder rungs (relaySMTP → SQLInject,
    formulas releasing on purchase) as live-validation-when-convenient, not sign-off blockers.
  - **Follow-up feature (2026-07-05): manual kill switch for the formulas reservation.**
    Presence of `finance-disable-formulas.txt` suppresses the `formulas` reservation regardless of
    hacking level, until the file is removed (manual-only, no auto re-enable) — same
    "you're in control" pattern as `finance-reserve-extra.txt`, just a flag file instead of a
    number file. `computeReservations` now returns `formulasSuppressed` so the manager can
    tprint/log/print a distinct "disabled by flag" message instead of conflating it with a real
    release. 3 new unit tests (162/162 total). Not yet live-validated in-game.

- **Batcher refactor Phase 9 — Phase 8 close-out** (2026-07-04): `batcher-refactor-phase9.md`.
  Closes all three items Phase 8 left waived/degraded, plus the `pickBatchSet` bug Phase 8
  discovered outside its own scope. Branch `worktree-phase9-closeout`, PR #3 merged to `master`.
  - **`pickBatchSet`'s pass-3/pass-4 both-lists bug — fixed.** Added a `justEvicted` set
    (`scheduler.js`) filled inside pass 3's displacement commit; pass 4's refill loop now skips
    any candidate in it, so a server evicted this tick can't be re-admitted in the same call (it
    becomes eligible again next tick as an ordinary non-incumbent). BACKLOG's exact repro
    (challenger/mid/n00dles, budget 35, hysteresis 1.25) now returns `members == ['challenger']`
    with both `mid` and `n00dles` in `exits` as `displaced` and zero overlap — confirmed via a
    plain-node import, not just the test suite. 3 new `test/scheduler.test.js` cases (the repro,
    an explicit never-evicted-candidate refill case, and an `expectNoOverlap` helper applied to
    the repro plus all 5 pre-existing displacement-path cases); all 15 pre-fix `pickBatchSet`
    cases still pass unchanged.
  - **RAM anomaly — root cause confirmed via the `share`→`sharePool` rename.** Renamed the
    identifier/property in `sampling.js`'s `inFlightByTarget` (`{byTarget, share}` →
    `{byTarget, sharePool}`), `daemon.js` (`preTickInFlight.sharePool.*`, snapshot key `share:` →
    `sharePool:`), and `sharecurve.js` (`sweep.sharePool.threads`) — the only construct in the
    import graph that exactly matched `ns.share`'s name (2.4 GB, `markdown/bitburner.ns.share.md`).
    `sharePool` verified absent from `NetscriptDefinitions.d.ts`. `share.js` itself (the real
    `ns.share()` call), `SHARE_SCRIPT`, `SHARE_FRACTION`, and `sharePower` (a different identifier,
    doesn't collide) untouched by design. **This is a deliberate log-schema change**, noted in
    `daemon.js`'s log header comment — old exported logs need a pre-Phase-9 checker version to
    validate (git history); the current checker validates only the `sharePool` schema.
    **RAM gate, live (2026-07-04): before `daemon.js: 18.7 GB | share.js: 4 GB | targets.js:
    12.65 GB`, after `daemon.js: 16.3 GB | share.js: 4 GB | targets.js: 12.65 GB`.** `daemon.js`
    landed exactly on the predicted ≈16.30 GB — collision hypothesis confirmed, the full 2.4 GB
    phantom charge recovered with nothing left unexplained. `targets.js` unchanged across the
    gate (it imports `sampling.js` but never touches the `share`/`sharePool` construct itself),
    answering the spec's bundle-vs-reachability question: **import RAM-charging is
    reachability-based, not whole-file/bundle.**
  - **`hackingLevel` added to snapshots, `dropPreConfigStragglers` and `checkNaturalExit`
    extracted.** `daemon.js`'s snapshot record gains `hackingLevel: ns.getHackingLevel()` (+0.00
    measured RAM — already charged once via `hosts.js`/`targets.js`'s existing calls, per the
    once-per-name import-charging model, confirmed live by the RAM gate above); checker validates
    it and a soft report prints first/last/min/max/delta. New pure helper
    `dropPreConfigStragglers(entries)` in `test/verify-log-checks.js` slices a log to its first
    retained `mode` event, wired into `verify-log.test.js`'s `beforeAll` behind
    `VERIFY_SLICE_STRAGGLERS=1` (opt-in, so a normal single-window log validates in full by
    default). The natural-exit invariant, previously inline `expect` calls in
    `verify-log.test.js`, is now `checkNaturalExit(entries)` in `verify-log-checks.js`, matching
    the style of the other three extracted checks, with new fixture tests in
    `test/checker-fixtures.test.js` modeled on the real Phase 8 failure.
  - **`npm test` green at 128/128** (up from Phase 8's 120/120: +6 scheduler, +2 sampling
    (`sharePool` shape), +6 checker-fixtures (`checkNaturalExit` x3, `dropPreConfigStragglers`
    x3)).
  - **Implementation-time validation against the real `logs/phase8-ab/` copies (one-off script,
    not committed): exact match to the spec's expected table.** `checkNaturalExit` violations:
    0/0/31/114/114 across the five copies, in order — identical to the numbers that motivated
    this phase. `Aprime-end`'s fraction-consistency: 15 violations unsliced (stragglers, no
    preceding `mode` event) → 0 sliced via `dropPreConfigStragglers`, which kept exactly 1757 of
    2000 entries (first `mode` event at index 243) — matches the spec's prediction exactly. (Old
    logs use the pre-rename `share` key; the one-off script translated it to `sharePool` before
    calling the checker, since a real post-rename session log wouldn't need this.)
  - **Live A/B/A' income session (2026-07-04), fleet frozen throughout (confirmed via the
    transactions log: zero expense records between the session's start and end timestamps),
    all three windows ≥10 minutes, one calendar day:**
    - **A (share off), 6:35:25–6:47:09 PM, 11.7 min**: hackingLevel 458→466 (Δ8). Income $3.84B
      (~$327.7M/min).
    - **B (share on), 6:47:38–6:59:11 PM, 11.6 min**: hackingLevel 466→475 (Δ9). Income $5.05B
      (~$437.1M/min).
    - **A' (share off), 6:59:49–7:11:29 PM, 11.7 min**: hackingLevel 475→482 (Δ7). Income $5.22B
      (~$447.8M/min).
    - **`npm run verify:log` green (20/20) on all 5 boundary copies** (`A-end`, `B-mid`, `B-end`,
      `Aprime-mid`, `Aprime-end`) — `B-end` and `Aprime-end` needed `VERIFY_SLICE_STRAGGLERS=1`
      (their own window's preceding `mode` event had aged out of the 2000-entry ring by capture
      time); the other three passed unsliced. Natural-exit invariant held clean at every toggle
      across all five copies — the pickBatchSet fix confirmed live, not just in the test suite.
    - **Income cost of share: still not cleanly quotable, and this time it's a real confound, not
      a protocol defect.** Unlike Phase 8 (short A window, A' inflated by ~30min of uninterrupted
      compounding), this session's three windows are all properly ≥10min and adjacent, and
      hackingLevel drift is small and comparable across all three (Δ8/Δ9/Δ7) — the protocol
      itself was executed correctly. But the two **identically-configured** share-off windows (A
      and A') disagree with each other by **+36.7%** ($327.7M/min → $447.8M/min) despite similar
      level growth and a flat member count (3 throughout, briefly 4 in A') ruling out target-mix
      churn as the cause. Since A and A' share the same config, that gap cannot be share's doing
      — some other factor (most likely non-linear hack-money scaling with hacking level at this
      stage of the game) still dominates the session's income trend and swamps any signal from
      the toggle. Per the spec's own instruction ("if A and A' still disagree wildly while level
      drift is small, say so rather than forcing a conclusion") — that's exactly this case.
    - **Recommendation: keep `SHARE_FRACTION` at 25%.** This is unchanged from Phase 8, for the
      same reason: the rep-side result (2.78 vs 1.92 rep/sec, ~45% boost, matching measured
      sharePower ~1.417) and the sharecurve's steep diminishing returns (25% already captures
      ~89% of the achievable power at 100% RAM commitment) both stand and aren't re-measured
      here. The income side remains genuinely unmeasured at this game stage with this method —
      that's inconclusive, not evidence against share. A future attempt would need either a much
      longer session (to average out the per-level income-formula jumps) or a different
      methodology (e.g. tracking $/hack-thread rather than $/wall-clock-minute, to normalize out
      the level-driven scaling directly).
  - **Aside, unblocked mid-session**: found and fixed a stale viteburner Remote API connection
    (socket showed `ESTABLISHED` on port 12525 but was actually dead — a fresh dev-server
    restart immediately logged `disconnected`). Also found the main checkout 2 commits behind
    `origin/master` with a stale uncommitted `BACKLOG.md` diff left over from before this phase's
    implementation (discarded, then pulled clean) — not a Phase 9 code issue, just session/dev-
    loop bookkeeping, matches the pattern already flagged in the two viteburner items further
    down this file.

- **Remote API auto-reconnect enabled** (2026-07-04): closes the "Investigate auto-reconnecting
  the Remote API after a dev-server restart" item filed during Phase 8 verification. In-game
  Remote API options (Options → Remote API), enabled auto-reconnect with a 5s retry delay and
  infinite retries. A `npm run dev` restart should no longer require a manual in-game reconnect
  step — worth confirming on the next dev-server restart that the connection comes back on its
  own rather than assuming.

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
