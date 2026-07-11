# Backlog

Tracks active feature work and goals across sessions (In Progress / Next Up / Ideas). When
something finishes, move a dated, condensed entry to [docs/phases/CHANGELOG.md](docs/phases/CHANGELOG.md)
instead of deleting it — don't let history pile up here.

## In Progress

- **Phase 20 — XP farm** (2026-07-11, brainstorm stage → `phase-20-xpfarm.features.md`):
  Convert the ~98% idle fleet into hacking XP to cut the 2500 ETA (measured after `share-off.txt`:
  util ~2%, ~22.9 PB free of ~26.5 PB — money batcher structurally can't fill the fleet; money is a
  dead resource). **Prototype (`src/xpfarm.js`) run live and it pivoted the design:** weaken-fill of
  idle RAM filled the fleet to 95% util but only got **~1.4×** (194k→270k exp/sec), because **XP is
  per operation *completion*, not per GB** — weaken is the slowest op, and the batcher's HWGW on
  prepped targets is ~50–60× more exp-efficient per GB. **New direction (in features doc):** a
  dedicated XP engine that *saturates the fleet with the fastest exp op (hack) on the highest-
  difficulty targets held at min security, abandoning money entirely* — simpler than the money
  batcher, not a variant of it. Critical open question to settle first: does hack still grant full exp
  once a server's money is drained (decides hack-spam vs grow-based). Prototype stays running as a free
  stopgap. **Reverses the "do not build XP-max mode" verdict below**
  — right against the pre-install ~5,300 h wall, wrong now that the install collapsed it ~170× and ETA
  scales linearly with throughput.
  - **Decision 2026-07-11: build the full phase, scoped as a durable BN2+ tool (NOT the 2500 sprint).**
    The weaken stopgap is closing 2500 on its own (~3 h ETA and falling, rate ~428k exp/sec) — faster
    than the engine could ship, so no immediate payoff. Justified by the **next re-climb**: every future
    BitNode resets hacking to 1. This reframed the design — a fresh node has an *active* money economy
    and a *busy* fleet, so the engine **coexists with the money batcher and takes only surplus RAM**
    (self-scales: ~0 early, dominant once the fleet outgrows money needs), not the endgame-only "abandon
    money / seize the fleet." Q1 verified (hack exp is money-independent → hack-saturation, no grow);
    features doc decisions finalized. **Next: spec stage (fable) → `phase-20-xpfarm.spec.md` + spec-reviewer.**

- **CDP game-driver toolkit** (2026-07-10, primitives validated live): `tools/bb/` attaches to
  the Steam/Electron game over the Chrome DevTools Protocol (launch with
  `--remote-debugging-port=9222`) and gives a shell — and Claude via the Bash tool — read+act
  access to the **live UI**: `stats`, `read-tail <name>`, `terminal <cmd>` (runs a command,
  returns output), `aria` (clickable-UI outline), `body`, `read-terminal`, `goto`, `shot`
  (screenshot). All core primitives proven end-to-end against the running game (connect → read
  exact DOM text → screenshot → navigate → type via real keystrokes → read result). This is the
  **UI-automation** path (drives the rendered front-end like a human), distinct from the RFA
  file bridge and needing no engine changes — see `docs/game-bridge.md` and `tools/bb/README.md`.
  `driver.mjs` holds the reusable helpers; `cli.mjs` is a thin dispatch. Posture: read-only by
  default; `terminal`/`goto` drive the live session, so gate writes deliberately. Dep added:
  `playwright-core` (devDependency; uses the game's own Chromium over CDP, no browser download).
  - **Decision (2026-07-10): keep the Bash CLI for now; MCP deferred (below).** The CLI already
    delivers the whole capability this session, so an MCP is a pure ergonomics upgrade, not a
    prerequisite.
  - **Deferred: wrap `driver.mjs` in an MCP server** so the helpers become native Claude tools.
    - *Pros:* no `node tools/bb/cli.mjs …` Bash indirection — direct tool calls, cleaner and
      faster (no ~1s node-startup + reconnect per call); nicer arg/result typing; discoverable
      in the tool palette; parallelizable with other tool calls.
    - *Cons:* upfront build (small — it wraps `driver.mjs`, doesn't rewrite it) + registration in
      `.mcp.json`/settings; an MCP server loads at Claude Code **startup**, so it's usable *next*
      session, never retroactively in the one that adds it; one more moving part to keep healthy
      (its own connection to the CDP endpoint, same stale-socket risk family as the dev server).
    - *When to build it:* when the Bash-call friction starts to bite in practice. Build by
      importing `driver.mjs`; don't fork the helper logic.

- **Phase 19 — Coding contracts** (2026-07-09, brainstorm stage, **nothing decided**):
  `phase-19-contracts.features.md` captures a mid-brainstorm state — mechanics reference, seven
  findings, ten open questions, no agreed architecture. Blocking question is Q1 (who writes the
  solvers: demand-driven / Kenneth-solves / bulk-delegated), which is Kenneth's call, not a
  technical one. Four cheap live checks are listed and none are done; the RAM probe (does
  `contract.submit()` dodge `attempt`'s 10 GB charge?) should run first because it can invalidate
  the single-script architecture. No spec, no code. Resume the discussion, don't build from the doc.

## Next Up

- **Reach the Daedalus hacking-2500 gate — multiplier stacking via install cycles** (2026-07-11,
  plan corrected; supersedes the 2026-07-10 "XP-max batcher" framing below):
  The endgame (finish BitNode 1 → Red Pill → Source-File) is gated on **Daedalus**, and per
  `run fl1ght.exe` the *only* unmet gate is **hacking skill ≥ 2500** (augs 39/30 ✅, money ✅; combat
  1/1/1/1 so the 1500-combat alt-path is a non-starter — see rejected-combat note). **The lever is the
  hacking multiplier, NOT XP throughput.**
  - **The measurement that settled it (2026-07-11, from `hacking-progress-log.json`, 34 samples):**
    hacking skill is *logarithmic* in XP (fit `level ≈ 113.5·ln(exp) − 709`, matches the game curve;
    implies level-mult ~3.55×). At ~98k exp/sec that puts **2500 ≈ 5,300 h of active play** — raw
    throughput cannot brute-force it, and an XP-max batcher (even a 10× throughput win) barely dents it.
    (Also: overnight ran only 1.6 h of the 9 h span — the box slept; sleep ≠ grind.)
  - **What actually moves it:** `level = mult × (32·ln(exp) − 200)`, so small multiplier gains collapse
    the XP wall *super-linearly*. Aug page (2026-07-11) confirms: level-mult **3.55× now → 3.83×** after
    installing the 2 queued augs, exp-mult **3.51× → 4.03×** — that one install cuts XP-to-2500 **~5×**
    (5,300 h → ~930 h). Reaching a ~50 h single-run climb needs level-mult **~4.5×**.
  - **Plan — install cycles (pre-install checklist now in `docs/reset-protocol.md`):** each
    cycle, while rich, max home RAM/cores (they persist) + buy all this cycle's augs + NFG levels, then
    install (level→0 but mult up), re-climb higher than before, unlock new factions for fresh hacking
    augs. Repeat until a run crests 2500. **Installing is the fast path, not a setback** — the reset-and-
    re-climb reaches higher than grinding the un-installed run ever would; don't hoard levels.
  - **Open holes / risks (2026-07-11 adversarial review — read before acting):**
    1. **Fleet wipes on install.** Cloud servers are purchased servers → reset on soft install, so
       post-install exp/sec crashes to ~0 until `bootstrap.js` rebuilds the fleet. The ~930 h re-climb
       estimate ignores that rebuild ramp — it's optimistic. Home RAM persisting mitigates, not erases.
    2. **Favor few, big install batches — don't install now with only 2 queued.** Each install pays the
       full fleet-rebuild + rep-regrind overhead, so maximize the aug haul *first* (unlock reachable
       factions → grind rep → buy their hacking augs) and install *once*. → the faction/aug inventory is
       a **prerequisite to installing**, not a follow-up.
    3. **Rep resets every cycle.** Faction rep zeroes on install; re-grinding it (~17/sec; PCMatrix was
       100k rep = hours) is a real per-cycle time cost the timeline must include.
  - **Next step:** pull the **faction/aug inventory** — which factions are unlockable, which sell hacking
    exp/skill-mult augs not yet owned — to build the maximal pre-install buy-list. Ties to the
    "Post-reset auto-backdoor" auto-unlock item below (unlocking factions is now the primary mult lever).
    - **Owned-side + baseline: `run auginfo.js` (2026-07-11).** Dumps owned augs (39, NFG lvl 1) +
      aggregate mults to `logs/auginfo-<epoch>.json`, one file per run for pre/post-install diffs.
      Confirmed live: level-mult (`mults.hacking`) 3.547, exp-mult (`mults.hacking_exp`) 3.508 — matches
      the aug-page figures. This is the scriptable half; the **shop** half (prices/rep/what's for sale)
      is Singularity-gated, so read that from the in-game UI / CDP driver. Documented in CLAUDE.md.
  - **Rejected: the combat path to Daedalus.** Structurally worse — combat starts at ~1 on all four
    stats, the 39 augs are hacking-flavored (no combat mult tailwind), and hacking XP accrues passively
    while combat needs active gym/crime time. Confident on structure, not exact rates; asymmetry too large to flip.
  - **Un-superseded 2026-07-11 → now Phase 20 (In Progress).** The "XP-max batcher mode" idea below was
    shelved because throughput was a rounding error against the pre-install multiplier wall. After the
    install collapsed that wall ~170× (mult 3.55→4.72, ETA 5,300 h→~31 h), the multiplier lever is spent
    and throughput scales the ETA linearly — and the fleet turned out ~98% idle. So the XP-farm idea is
    now live as Phase 20 (In Progress above), though as a *fill on idle RAM* rather than reallocating the
    money batcher itself. Original shelved note kept below for the reasoning trail.
  - **Superseded — "XP-max batcher mode" (2026-07-10):** reallocating batcher RAM from $/sec to XP/sec.
    Correct that money is a dead resource (56× the $100b gate, fleet was maxed), but the 2026-07-11
    measurement shows throughput is a rounding error against the multiplier — **do not build XP-max mode.**
    The `hacking-progress-log.json` instrumentation (c12a3d5) it produced stays useful as the ETA baseline.

- **Static aug/faction install-order planner (one-time best-case calc)** (2026-07-11, decided,
  not started): a *one-time* calculator that outputs the optimal **faction join-set + hacking-mult
  aug buy-list** to maximize level-mult/exp-mult toward the Daedalus-2500 gate. Its real job is
  settling the **irreversible mutually-exclusive faction-join decisions** (a wrong city-faction pick
  locks you out of another's hacking augs and wastes a whole cycle's rep grind) *before* you commit —
  a static decision that needs no current rep. Execute the plan by eye afterward (glance at your own
  in-game rep bar). Supports the install-cycle strategy in the Daedalus item above and
  `docs/reset-protocol.md`; supersedes the vaguer "Augment reservation cost model" Phase 10 follow-up
  for the *ordering* question.
  - **NOT SF4-gated — buildable now.** Inputs: owned state (base `ns`, already dumped by `auginfo.js`)
    + the **aug catalog**. Current *rep* is the only SF4-blocked input and the planner doesn't need it
    (it uses each aug's static rep *requirement*, not your live rep). Purchase/install execution is
    explicitly **out of scope** (that's the SF4-gated acting half).
  - **Next step / the actual work: assemble the aug catalog** as a static data file — every aug's
    selling faction(s), price, rep requirement, prereq chain, and hacking-mult stats. Not sourceable
    via game APIs available to us: `ns.singularity.getAugmentation*` is SF4-locked, and CDP only reads
    shops of *already-joined* factions (fatal blind spot for a join-order planner). Comes from **static
    lookup** (the CLAUDE.md carve-out permits costs/prices/tables). The planner *logic* is easy; the
    catalog *data* is where the effort lives.
  - **Open question, Kenneth's call — the spoiler boundary.** The planner's whole value is foresight
    into augs in factions not yet joined, which brushes the anti-spoiler rule. How much of the
    un-unlocked catalog to pull in decides how strong (full-foresight) vs. weak (reachable-now-only)
    the tool is. Settle this before assembling the catalog.
  - **Moot post-SF4, NOT a deferred todo — the live "best-case-for-right-now" watcher.** Rejected as a
    build target on three counts: (1) SF4-gated (needs live `getFactionRep`; CDP workaround sees only
    joined factions), (2) *redundant* — its job is reading back a rep number already on your screen, so
    low-value even *with* SF4, and (3) obsoleted by SF4 — once you have Singularity you'd build the full
    join/buy/install pipeline through `ns.singularity`, not resurrect this watcher. File as a non-item,
    not "todo after BN4."

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
  - **Confirmed live (2026-07-05, Phase 13): 1.60GB.** Throwaway `src/ramprobe-workerkeys.js`
    (`phase-13-consolidation.spec.md` work item 8/S3) read 1.60GB — object-literal keys are
    **not** phantom-charged (the theory is dead for keys specifically; Phase 9/11's confirmed
    mechanism is standalone-identifier/method-name collisions, not object-literal keys).
    `WORKER_SCRIPTS`' `hack`/`grow`/`weaken` keys are safe as-is; the rename refactor this
    item once proposed is unnecessary and won't be done. Probe deleted from the repo
    (`git rm`, Phase 13 close-out) — its job is done.
  - **Live-confirmed the mechanism again, a different flavor, in Phase 11 (2026-07-05):**
    `cloudmanager.js`'s `nextCloudName` called `CLOUD_NAME_PATTERN.exec(name)` — plain
    `RegExp.prototype.exec`, nothing to do with `ns.exec` — and got charged the full 1.30 GB
    `ns.exec` cost anyway (`mem cloudmanager.js` showed it plainly: `1.30GB | exec (fn)`). Fixed
    there via `name.match(...)` instead. This is the same textual-collision theory as the
    `WORKER_SCRIPTS` suspicion above, now confirmed for a *method name* collision (not just a
    standalone identifier or object key) — raises confidence that the `WORKER_SCRIPTS` phantom
    charge is real and worth the E-matrix confirmation pass.

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
    reused to root the target first if it isn't already. The `tryRoot`/`findPath` extractions
    this once depended on already shipped in Phase 13 (`src/hosts.js`, `src/common.js`) — no
    longer a blocker.
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

- **Single condensed dashboard window (Phase 18's deferred Layer 3)** (2026-07-08, deferred
  per Kenneth — "a maybe, at the end"; not started): after Phase 18's Layers 1–2 (self-placing
  windows, trimmed content), revisit only if five tidy windows still feel like too many. Not a
  formatting change — needs a `dashboard.js` renderer reading the others' on-disk state
  (`finance-state.json`, `daemon-batch-log.json` snapshots, the daily transactions file), with
  `transactionsmonitor.js` (the income *writer*) and `targetsmonitor.js` (runs `getTargets`
  analysis) split into headless workers that drop their own tails. Phase 18's centralized
  `tailmanager.js` is a natural stepping stone. See `docs/phases/phase-18-dashboards.features.md`
  for the full design-space notes.

- **Core-aware grow/weaken sizing (home cores are not 1)** — **investigated + SHELVED
  2026-07-08** (full story: `docs/phases/phase-17-home-cores.features.md`, condensed in
  `docs/phases/CHANGELOG.md`). `sampling.js` sizes every grow/weaken call at an implicit 1 core,
  but `home` is a real worker host with >1 core. A throwaway in-game probe settled the two
  gating questions: (1) grow's per-thread security increase is **core-independent** (measured
  flat at 4 across cores 1–16), so the correctness-drift bug this entry originally claimed **does
  not exist** — cores=1 sizing is a safe overshoot everywhere; this is pure efficiency. (2) home
  was **19.4% of allocatable RAM** at probe time — but only because the fleet was in a small
  post-reset state; that share decays as purchased servers are rebought. At home's current 2
  cores the reclaim is **~1% of fleet RAM** (grow/weaken save 5.9%/thread at 2 cores per the
  `1+(cores-1)/16` law), rising to ~5–8% only at 8–16 cores — which needs Singularity-gated
  `upgradeHomeCores()` we can't yet automate. Not worth reordering the batcher hot path
  (sizing runs before host assignment) for ~1% transient gain. **Revisit trigger:** home cores
  get upgraded post-Singularity. Same deferred question as Phase 8's core-weighted *share*
  placement (`sharecurve.js:33-35`) — co-scope the two if either is revived.

- **Investigate `sharePower` reading 1.00 with live share threads in flight** (2026-07-06,
  filed from Phase 15's diagnosis, S3, out of scope for that phase): the exported
  `daemon-batch-log.json` showed `sharePower: 1.00` for a full hour with 58 share threads
  continuously in flight and `attainedPct` near 99% — expected `sharePower` to read above
  1.00 given live threads. Possibly a game mechanic (e.g. the bonus only accrues while
  actively doing faction work, not just running `share()`) rather than a bug — not
  confirmed either way. Doesn't affect Phase 15's fix (the share carve is driven by
  `SHARE_FRACTION`, not measured power).

- **Auto-suppress share below a fleet-size/income floor** (2026-07-06, filed from Phase 15's
  diagnosis, S4, resource-manager territory): today the only lever for the Phase 8 share
  carve is the manual `share-off.txt` marker. On a small post-reset fleet, share's 25%
  carve competes hard with getting the batcher's own pipeline started at all — worth a
  resource-manager rule that suppresses share automatically below some fleet-size or
  income threshold, rather than requiring Kenneth to remember the manual toggle. No design
  done yet.
  - **Observed live for the first time, 2026-07-09 17:55** (previously filed on theory only):
    `logs/daemon-batch-log.json`'s snapshot shows the share pool holding **1,156 GB of a
    4,638 GB budget (25%)** while fleet utilization sat at 44%, `memberCount` was 1
    (`phantasy`), and that single member had committed 7.5%. Same snapshot, `finance-log.json`
    shows a `bootstrap-server` reservation for a *first* cloud server — i.e. a fresh post-reset
    fleet. This is exactly the scenario the item predicts: the 25% carve competing with getting
    the pipeline started at all. Evidence captured before the state passes.

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
    **Demoted to low priority (2026-07-06, Kenneth):** home RAM only has a handful of upgrade
    tiers total (unlike cloud servers, which scale open-endedly) and the RAM persists across
    augmentation installs, so this isn't a recurring per-reset task worth automating — running
    `upgradehomeram.js` manually the few times it's ever needed is fine. No longer the agreed
    "next phase"; revisit only if that changes.

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
  - **Prerequisite work — done (Phase 13, 2026-07-05):** the consistency consolidation
    (`scanNetwork`/`findPath` in `src/common.js`, `tryRoot` in `src/hosts.js`) has shipped —
    darknet scripts can reuse those helpers instead of re-deriving BFS/rooting logic.
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
  - **A related-but-distinct failure confirmed live, 2026-07-05 20:46:02 (Phase 13):** not a
    silent stop, but a silent *wrong* push — a `git checkout master` (prep for merging the
    Phase 13 branch) run in this checkout while `npm run dev` was still watching it caused
    viteburner to instantly push the pre-Phase-13 (reverted) file contents into the game.
    The merge commit right after restored the correct content in the working tree, but
    nothing re-triggered a push, so the game silently held stale code for the rest of the
    session — three RAM-gate re-runs that session all measured that stale code, initially
    misread as an analyzer limitation (full forensic timeline, from `dist/`'s byte-faithful
    dump vs. commit times, in `docs/phases/phase-13-consolidation.closeout.md`). New standing
    rule from this (`CLAUDE.md`): never `git checkout`/switch branches in a dev-server-watched
    checkout while the game is connected unless the push is intended — stop the dev server
    first. `ramcheck.js` also now records each script's in-game byte length so any future gate
    reading can be checked against the `dist/` dump before being trusted.

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

- **Monitor cleanup + more meaningful logging** — verbosity half **closed by Phase 18**
  (2026-07-08, see CHANGELOG): the popup-verbosity complaint this item was originally filed for
  (a stale `durations:` line, a `lastBatch` block with no "is this tick's launch?" cue) is now
  moot — Phase 18's content pass removed the last-launch line entirely and demoted the rest of
  the per-tick spam to `daemon-batch-log.json`, which the popup was always meant to be a summary
  of. The **out-of-game dashboard** half (wanted since 2026-07-04) stays open, along with two
  still-unbuilt logging ideas:
  - ~~**RAM utilization time series**~~ **Shipped by Phase 7** as `snapshot` log events
    (`utilizationPct`, `memberCount`, per-member breakdown, once per `CYCLE_MS`).
  - **Per-target income/efficiency log**: `batch` events log expected steal but nothing
    closes the loop on realized money per target over time, to sanity-check the ranking
    score against real outcomes.
  - **Prep-cycle duration log**: how long each drift→prepped transition actually takes;
    currently only visible live in the popup's prep-dispatched lines and lost once prepped
    (Phase 18 dropped the live prep-dispatched lines from the tail; the underlying `snapshot`
    events still carry per-member state, but no dedicated duration log exists yet).

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
    dead files — root `cloud-server-costs.js` dup, `src/cleanup-old-daemon-log-temp.js` — were
    deleted by Phase 13; confirmed gone 2026-07-06.)
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
    (fleetupgrade/purchase\*/upgrade\*/cloudcosts), shared libs (hosts/translog/`common.js` —
    the latter shipped in Phase 13), one-shots (connect/killscripts/ramcheck/sharecurve).
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
