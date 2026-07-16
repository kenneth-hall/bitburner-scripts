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

- **`augfarmer.js` cannot be restarted once home saturates — `HOME_RESERVE_GB` (32) < its 64.1 GB**
  — `daemon.js:448` only launches it at startup, when home is empty and it fits. Afterwards the
  batcher fills home and the 32 GB reserve (`hosts.js:7`) cannot cover a 64.1 GB relaunch: `run
  augfarmer.js` fails with "requires 64.10GB of RAM". **Only recovery is a full `daemon.js`
  restart**, which interrupts the batcher. Hit live 2026-07-16 (a CDP restart killed it and lost the
  RAM race; augfarmer was down ~19 min).
  - **Confirmed STRUCTURAL 2026-07-16 — "buy more RAM" is not a fix.** Home went **2.05 TB → 65.54
    TB** (32×, $1.46T) and free RAM went *down*: 34.75 GB → **32.00 GB**, i.e. pinned to exactly
    `HOME_RESERVE_GB`. The batcher fills to `maxRam - HOME_RESERVE_GB` at any home size, so the
    64.1 GB relaunch never fits regardless of how much RAM is bought.
  - **Why it matters beyond the annoyance:** if augfarmer dies on its own mid-cycle, the aug ratchet
    stops **silently** and stays stopped — no self-heal. Poor property to carry into auto-install.
    Options (undecided): raise `HOME_RESERVE_GB` past augfarmer's RAM; have `daemon.js`
    detect-and-relaunch a dead augfarmer; or shrink augfarmer's footprint. `installer.js` (18.15 GB)
    does fit the reserve, so the auto-install `ns.exec` is not blocked — but it shares the fragility,
    and its call site already guards with a "no free RAM?" WARN.

- **Observe-mode trigger flap: a fire self-clears, then re-fires every ~10 min** — firing sets
  `phase: "install-ready"`, but that is not an arming phase (`evalTrigger` arms only on
  `idle-plateau`/`grinding`), so the next poll clears the fire, the phase reverts to `grinding`, and
  it re-arms → re-fires on a `TRIGGER_SUSTAIN_MS` loop. Observed live 2026-07-16: fire 22:42:14Z →
  clear 22:42:24Z → re-arm 22:42:34Z. **Auto mode masks it** — `evalTrigger`'s latch is gated on
  `mode === "auto"`, so a real install proceeds off the first fire. Impact is therefore observe-only:
  `install-ready` never sits still to be read, and the decision log fills with arm/fire/clear
  triples. Same `phase` overloading as the two wiring bugs (`3feb4b4`). **Fix candidate:** treat
  `install-ready` as arm-preserving, or latch on `fired` regardless of mode. Low priority — but it
  degrades exactly the observe-mode evidence the constants (open question (d)) need.

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

## Ideas

### Game / progression
- **Coding contracts** (Phase 19, brainstorm only — nothing decided). Blocking question is
  Kenneth's, not technical: who writes the solvers (demand-driven / Kenneth-solves /
  bulk-delegated). Also a candidate Daedalus-rep accelerator. **Next:** run the cheap RAM probe
  first — does `contract.submit()` dodge `attempt`'s 10 GB charge? — it can invalidate the
  single-script architecture. → `phase-19-contracts.features.md`.
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
- **Stage-2 first auto-fire (Phase 25 S11/S2)** — still fully dormant/unexercised as of the
  2026-07-15 BN1.2 clear (deliberately skipped for that run's final install — see the spec's
  close-out section). **No longer blocked by the trigger** (fixed + live-validated 2026-07-16;
  S11's timing datum collected — Kenneth judged the 55.47h/1.370-gain arm "about right"). What
  remains before flipping: (a) ~~hand-run `upgradehomeram.js`~~ **done 2026-07-16, validated**;
  (b) take a save immediately before the first flip; (c) first fire **mid-cycle, never on a
  run-ending install** (Kenneth's BN1.2 reasoning, still sound); (d) `MIN_TOTAL_GAIN` (1.1) is an
  unproven degenerate-loop guard — the one real arm that ever touched it cleared at 1.116;
  (e) `upgradeHomeCores` stays cold — no hand-run path exists, so the first auto fire is its
  first execution.
  Then Kenneth hand-writes `auto` into `ratchet-mode.txt` (not scheduled — his call).
  **When it fires:** watch the full
  chain per the spec's L7 checklist — spend-down records + fleet-freeze reservation,
  `installer.js` exec, home RAM/cores transactions, the install itself, `bootstrap.js` relaunch
  via the `installAugmentations` callback, the `ratchet-log.json` boundary pair. Any deviation
  demotes the mode file back to observe and reopens the trigger design with the logged data. →
  `docs/phases/phase-25-faction-strategy.spec.md`.

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
