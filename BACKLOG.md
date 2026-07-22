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

- **`daemon.js` floods the terminal with un-launchable companion retries** — 3 lines/minute,
  forever: `skipped augfarmer.js -- needs 64.10GB but only 0.90GB free on home`, same for
  `xpfarm.js` and `ratchetlog.js`. On a 32 GB home these can *never* fit, so the retry is pure
  noise, and it makes `read-terminal` nearly unusable for reading any script's output. This is the
  visible half of the "will never fit vs doesn't fit yet" supervisor bug below — that entry covers
  the retry logic; this one covers the observability damage. **Next:** log a permanent-skip once,
  then stay quiet.

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

- **`npm run verify:log`'s finance checker has its own reservation-key whitelist gap** — found while
  running the Phase 32 ship gate: `test/verify-finance.test.js`'s `KNOWN_RESERVATION_KEYS` doesn't
  include `next-aug`, which a real exported `finance-log.json` entry already carries. Unrelated to
  Phase 32 (no `resourcemanager.js`/`financestate.js` file was touched this phase) — flagged here
  rather than silently loosening that checker outside this phase's scope.

## Ideas

### Game / progression
- **Gang-specific open items (gate read, NFG-vs-rep pacing, ascension cadence, territory,
  wantedPenalty/ascension-accounting mysteries) moved to
  [`docs/gang-engine.md`](docs/gang-engine.md) §6-7, 2026-07-22.** Check there, not here, for
  anything gang-related.
- **Coding contracts** (Phase 19, brainstorm only — nothing decided). Blocking question is
  Kenneth's, not technical: who writes the solvers (demand-driven / Kenneth-solves /
  bulk-delegated). Also a candidate Daedalus-rep accelerator. **Next:** run the cheap RAM probe
  first — does `contract.submit()` dodge `attempt`'s 10 GB charge? — it can invalidate the
  single-script architecture. → `phase-19-contracts.features.md`.
- **⚠️ Share ran for ~7 hours on a factionless fresh node and cost us ALL income** — measured
  2026-07-18 in BN2. `ns.share()`'s rep multiplier only applies while doing faction work
  ([[reference_share_boost_needs_faction_work]]) and we were in **zero factions**, so its 25%
  carve (24 GB of a 100 GB fleet) was pure waste. Worse, it wasn't merely wasteful — it was
  *decisive*: with only 75 GB of batch budget the daemon couldn't place even a
  `MIN_HACK_FRACTION` batch for its top-scored target (pipeline 1,891 GB vs 75 GB budget), so it
  skipped every tick and earned **$0 for ~7 hours**. Dropping `share-off.txt` raised the budget to
  100 GB; the daemon immediately switched to an affordable target (n00dles) and money went
  $5,695 → $14,565 in 45 s.
  - **The rule that's missing:** share should be suppressed automatically whenever
    `ns.getPlayer().factions` is empty — it is *provably* worthless then, no heuristic needed.
    That's a stronger and simpler trigger than the fleet-size floor below, and it would have
    prevented this outright. **Still unbuilt** — the 2026-07-19 fix was manual (`share-off.txt`
    deleted on joining NiteSec; share went back on at 1.12 TB / 280k threads, fleet utilization
    6.4% → 27.6%). The next factionless start repeats the bug unless this lands.
  - Also worth flagging: the daemon reserved 1,891 GB for a target it could never afford and
    reported `floor: true` / `commitPct: 0` every tick without ever escalating. **A member that
    has been at 0% commitment for N consecutive ticks should be dropped for an affordable one**,
    which is what happened instantly once the budget rose. Silent permanent stall is the bug.

- **Auto-suppress share on small fleets** — a resource-manager rule to drop the 25% `share.js`
  carve below a fleet-size/income floor (today the only lever is the manual `share-off.txt`
  toggle, which competes hard with getting the batcher's pipeline started on a fresh post-reset
  fleet). Observed live 2026-07-09. No design yet.
- **Augment breadth-vs-depth, narrowed (Phase 25)** — the original v1 tension (shallow rep spread
  across many factions banking favor slower than concentrating on one) is now addressed: S4's camp
  commitment concentrates city-faction joining, and S6's generalized donation route lets a faction
  banking favor fast buy past a slow grind. What remains, if anything, is Daedalus-endgame-specific
  (still the manual runbook, `docs/reset-protocol.md`) — parked with that endgame, not a v1 concern.
- **Core-aware grow/weaken sizing** — SHELVED; `sampling.js` sizes grow/weaken at an implicit 1
  core, but it's a safe overshoot (grow's security bump is core-independent) and only ~1% of
  fleet RAM at home's 2 cores. **Revisit when** home cores get upgraded post-Singularity — now
  buildable (`installer.js`'s auto-mode `upgradeHomeCores()` calls, Phase 25 S10) but still gated
  on Kenneth flipping `ratchet-mode.txt` to `auto`; co-scope with core-weighted share placement. →
  `phase-17-home-cores.features.md`.
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
- **Per-target logging** — (a) realized income/efficiency per target over time, to sanity-check
  the ranking score against actual outcomes (today `batch` events log *expected* steal only); (b)
  prep-cycle duration (drift→prepped transition), currently invisible once a target is prepped.
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

### Repo & workflow hygiene
- **Repo decluttering** — root is the low-risk win (viteburner only watches `src/**`, so ~25 loose
  root items move freely into `docs/`/`reference/`/`saves/`; Phase 21 already consolidated
  `saves/`). A `src/` subfolder split is *not* light — it rewrites relative imports, the
  `WORKER_SCRIPTS`/`SHARE_SCRIPT` in-game-filename constants, and every script's in-game path
  (RAM gate + live daemon session). Zero-risk alternative that still fixes "tell what is what": a
  role-map (`src/README.md`) instead of moving anything. If a split ever happens, the seam is
  library-vs-entrypoint — fold it into a refactor, not a standalone tidy.
- **Comment sweep — `daemon.js`/`scheduler.js` only** — trim `Phase N` attribution from
  otherwise load-bearing comments (grep `Phase \d+` for the current list). Highest-value piece
  is a real fix, not a comment: `daemon.js:471`'s `tprintTs` prints "leftover Phase 1 worker
  file(s)" to the in-game terminal — reword to "legacy"; likewise `scheduler.js:1-3`/`:254`
  reference a vanished `allocator.js`/`pickBatchTarget`. Behavior-preserving, `npm test` is enough.
- **Brainstorm brief** (spec-review loop, optional Step 8) — have the opus brainstorm end by
  writing `phase-NN-slug.features.md` itself, so even the opus→fable handoff is a file, not a
  re-paste. Rest of the loop shipped (Phase 14).

## Reference (not backlog — mechanics captured for a future design pass)

- **Stock market** (`ns.stock`) — access doors, 4S data, progression locks: [docs/stock-market.md](docs/stock-market.md).
- **Darknet** (`ns.dnet`) — access chain, network volatility, three extraction paths: [docs/darknet.md](docs/darknet.md).

## Done

Completed phases and one-off changes move to the changelog (condensed there, full story in
each phase doc): **[docs/phases/CHANGELOG.md](docs/phases/CHANGELOG.md)**.
