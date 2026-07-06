# Backlog

Tracks active feature work and goals across sessions (In Progress / Next Up / Ideas). When
something finishes, move a dated, condensed entry to [docs/phases/CHANGELOG.md](docs/phases/CHANGELOG.md)
instead of deleting it — don't let history pile up here.

## In Progress

(none)

## Next Up

- **Investigate `git worktree` for parallel multi-agent sessions** (2026-07-05, high priority):
  Kenneth runs multiple Claude Code instances against this repo at once and suspects they're
  giving each other false signals by sharing one working directory (uncommitted changes,
  git status/index collisions). Investigate how `git worktree` actually works — isolated
  working directory + branch per instance, sharing one `.git` object store — and whether
  adopting it resolves the collision problem without the overhead of a full clone per
  instance. Known wrinkle to fold in: there's only one live Bitburner game instance and one
  `npm run dev` connection to it, so separate worktrees help with parallel editing/`npm test`
  but RAM-gate/live-validation steps still serialize to whichever worktree currently holds the
  dev-server connection. No code changes expected — scope is understanding the mechanic and
  deciding whether/how to adopt it for this project's workflow.

- **Priority order — remaining phases (agreed with Kenneth 2026-07-05, post-Phase-11):** work in
  this sequence, chosen for compounding benefit. (The `/spec` command that was first in this list
  shipped 2026-07-05 — see CHANGELOG — leaving these two.)
  1. **Consistency consolidation (`src/common.js`)** — behavior-preserving; mints the
     `scanNetwork`/`findPath` (`common.js`) and `tryRoot` (`hosts.js`) helpers the auto-backdoor
     and darknet phases both depend on, so it must precede both. Brainstorm + spec done
     (2026-07-05): `phase-13-consolidation.features.md` + `phase-13-consolidation.spec.md` (root;
     one spec-review round, 3 blockers fixed — notably `sharecurve.js`'s fourth `scanNetwork`
     copy folded into scope).
     **Implementation done (2026-07-05), merged to `master` as a deliberate exception (see
     `HANDOFF.md`), live validation still owed:** `npm test` green (250/250 — 231 pre-existing +
     19 new in `test/common.test.js`/`test/hosts.test.js`).
     **Update (2026-07-05, post-handoff): the RAM-gate discrepancy was diagnosed** — the gate's
     after-runs measured stale pre-phase-13 code (a `git checkout` under the live viteburner
     watcher pushed old files in-game at 20:46; dump forensics in
     `phase-13-consolidation.closeout.md`). **That doc supersedes the checklist that used to
     live here and HANDOFF.md's "What's left"** — execute its Parts 2–6: self-verifying
     ramcheck, one verified gate run (expect `launchmonitor.js` −0.65, `sharecurve.js` +0.05
     after all), the ≥15-min daemon session + smoke runs, then cleanup/graduation/CHANGELOG.
  2. **`upgradehomeram.js` → resource-manager customer** — the "Future finance-manager customers"
     sub-item under "Phase 10 follow-ups" (Ideas). Rides the warm Phase 11 budget-authority
     architecture (same reservation-gated `available`-cash customer pattern as `cloudmanager.js`)
     and closes the money→RAM→income flywheel: more home RAM feeds the whole batcher.
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
  with the same E-matrix technique (`docs/phases/phase-09-batcher-refactor.md`'s fallback diagnostic plan) —
  object keys, not standalone identifiers, so worth confirming object-literal-key charging
  specifically before assuming it applies. Renaming `WORKER_SCRIPTS`' keys is a wider refactor
  than this phase's scope (touches every `WORKER_SCRIPTS[...]` call site across `scheduler.js`,
  `daemon.js`, `sampling.js`) — not started.
  - **Confirmation probe added, reading pending (2026-07-05, Phase 13):** throwaway
    `src/ramprobe-workerkeys.js` rides Phase 13's RAM gate (`phase-13-consolidation.spec.md`
    work item 8/S3) — **1.60GB** reading means object-literal keys aren't charged (phantom
    theory dead for keys); **2.00GB** confirms the `hack`/`grow`/`weaken` key phantom. Record
    the actual reading here once Kenneth's live ramcheck run reports it, then delete the probe.
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
    `docs/phases/phase-06-batcher-refactor.md` (`common.js`, `eventlog.js`, `factionwatcher.js`,
    `backdoorfactions.js`, plus the `hosts.js`/`connect.js`/`daemon.js` wiring described
    below), then fully reverted the same day at the user's request — they judged it not
    worth further development right now after realizing they'd misunderstood some of the
    underlying game mechanics (notably: they don't currently have Singularity access
    unlocked, and had assumed some factions could be safely auto-joined with no downside).
    None of this is implemented; treat every item on this backlog entry as still to do.
    Reverted via `git revert` (history preserved, not rewritten) — see
    `docs/phases/phase-06-batcher-refactor.md`'s status note for the full file/commit list before
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

- **Phase 10 follow-ups** (2026-07-05, filed per `docs/phases/phase-10-finance-cloud.md`'s Files section;
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

- **Claude Code workflow — spec-review loop (mostly shipped 2026-07-05; see CHANGELOG).** The
  brainstorm→spec→implement workflow, the four standing rules moved into `CLAUDE.md`, the
  `spec-reviewer` subagent, and the `/spec` command are all built and live-proven (Phase 14). One
  optional enhancement remains:
  - **Step 8 — brainstorm brief (optional):** have the opus brainstorm end by writing
    `phase-NN-slug.features.md` itself (decisions, rejected alternatives, open questions) so even the
    opus→fable handoff is a file, not a re-paste.

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

- **Comment sweep — narrow, `daemon.js`/`scheduler.js` only (2026-07-05, filed from a comment-quality
  discussion, not started):** project-wide comment density tracks actual complexity well (simple
  one-shot scripts stay lean, the batcher core is dense because it has genuinely non-obvious
  invariants) — no broad sweep warranted. The one recurring pattern worth trimming: inline
  `Phase N` attribution mixed into otherwise load-bearing comments. Most of the substance earns its
  keep; the phase numbers specifically are archive metadata that belongs in
  `docs/phases/CHANGELOG.md`, not living permanently in the hot files. Concrete candidates found by
  grepping both files for `Phase \d+`:
  - **Easy, no-loss trims** (phase number adds nothing once removed): `daemon.js:9` ("same split
    Phase 1 had"), `daemon.js:355`/`:361` (section-divider labels "Phase 8 share-allocation state"
    / "Phase 7 multi-member state" — keep `:361`'s "(replaces the old single incumbentServer)"
    clause, drop the phase-number label), `daemon.js:82`/`:331` (drop the "Phase 8:"/"Phase 11:"
    prefix, keep the rest of each comment as-is), `scheduler.js:34` (drop "Phase 8:" prefix).
  - **Stale references, worth fixing (not just trimming):** `scheduler.js:1-3` says this module "is
    exactly the module Phase 1's allocator.js was designed to be swapped for" — `src/allocator.js`
    no longer exists in the repo, confirmed via `test -f`. `scheduler.js:254` says it's "replacing
    pickBatchTarget's single incumbent" — `pickBatchTarget` doesn't exist anywhere else in `src/`
    either. Both read fine today but would send a future reader grepping for a file/function that's
    gone; reword to describe the current shape without naming the vanished predecessor (the
    predecessor's story already lives in the phase docs if anyone needs it).
  - **Separate, higher-value fix (not a comment at all):** `daemon.js:471`'s user-facing
    `tprintTs` message literally prints `` leftover Phase 1 worker file(s) `` to the in-game
    terminal at runtime — internal phase numbering leaking into player-visible output. Reword to
    something like "leftover legacy worker file(s)" regardless of what happens with the comment
    sweep.
  - **Leave alone** (phase number is incidental to a comment whose real value is the invariant/race
    it documents, not worth reworking the sentence just to drop one parenthetical):
    `daemon.js:60-64` (Phase 9 schema/`sharePool` rename rationale), `daemon.js:66`
    (`DAEMON_LOG_MAX_ENTRIES` sizing), `daemon.js:69-73` (`OLD_WORKER_FILES` rationale),
    `daemon.js:504` (fleetupgrade race guard), `daemon.js:558-559` (two-sweeps-per-tick
    load-bearing note), `daemon.js:589` (legacy-mode gate convention), `daemon.js:608-609`
    (`budgetGb` vs `totalMaxRam` correctness note).
  - Scope check before starting: behavior-preserving, comment/string text only — no RAM gate or
    live validation needed, `npm test` (if it touches any string a test asserts on) is enough.

## Done

Completed phases and one-off changes move to the changelog (condensed there, full story in
each phase doc): **[docs/phases/CHANGELOG.md](docs/phases/CHANGELOG.md)**.
