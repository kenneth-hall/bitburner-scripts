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
- **`verify-log.test.js` doesn't recognize the `rooted` event type** — `npm run verify:log` fails
  "log format > every event has a valid event type" on any `daemon-batch-log.json` containing a
  `rooted` event (`hosts.js`'s `getHosts` newlyRooted → daemon logs one "rooted" event per newly
  rooted batch, an existing feature). The checker's `validTypes` set in
  `test/verify-log.test.js` was never updated to include it. Pre-existing on `master` (confirmed
  via `git stash` during Phase 22's live validation, 2026-07-12) — unrelated to that phase, not
  fixed there to keep scope clean. **Next:** add `'rooted'` to `validTypes` (one-line fix).

## Ideas

### Game / progression
- **Coding contracts** (Phase 19, brainstorm only — nothing decided). Blocking question is
  Kenneth's, not technical: who writes the solvers (demand-driven / Kenneth-solves /
  bulk-delegated). Also a candidate Daedalus-rep accelerator. **Next:** run the cheap RAM probe
  first — does `contract.submit()` dodge `attempt`'s 10 GB charge? — it can invalidate the
  single-script architecture. → `phase-19-contracts.features.md`.
- **Auto-backdoor Tier-2 validation: fresh-node end-to-end** (Phase 22 shipped Tier 1 —
  `src/backdoorfactions.js` live-validated mid-run: CSEC/avmnite-02h/I.I.I.I all backdoored
  automatically, zero auto-joins, RAM 11 GB). Tier 2 (reset → climb from level 1 → invite
  appears on a *brand-new* node) is structurally deferred — can't run before the next
  install/reset on this node. **Trigger:** the next install/reset on this BitNode.
- **Install-order calculator** (`tools/install-calc.mjs`, offline node) — the by-eye half
  shipped as `docs/bn1-install-plan.md`; catalog assembled (`docs/aug-catalog*`). Remaining is
  only the thin calc for the one "install-now vs one-more-cycle / how-many-NFG-levels" call.
  **Build only if** the install cadence proves fiddly by eye.
- **Focus-penalty / NRMI** — parked. Plan: priority-buy **Neuroreceptor Management Implant**
  (Tian Di Hui, 75k rep, $550m, no prereq) early, work unfocused after, no interlock. Verify
  before relying on it: (a) NRMI actually *zeroes* the penalty (non-mult effect — read the
  in-game aug description), (b) whether unfocused daemon work blocks Kenneth's own manual
  player-actions or only yields the screen. **Revisit when** a Singularity rep-grinder is
  actually built. → `[[reference_focus_penalty_and_slot]]`.
- **XP-farm engine** (Phase 20 — **trigger fired 2026-07-12**; production rewrite implemented
  2026-07-12 on branch `phase20-xpfarm`, `npm test` green (381/381), RAM gate clean, live-run
  smoke-checked (no crashes, batcher unaffected, engine computing correctly) — full A/B
  ship-gate validation (≥3× exp/sec, security equilibrium tuning) still needs Kenneth's live
  session). Dedicated hack-saturation XP engine that coexists with the money batcher on surplus
  fleet RAM (self-scales: ~0 early, dominant once the fleet outgrows money needs). **Live
  observation to watch during validation:** on this large (~7.4PB) fleet, a fresh restart's
  first pass saw a huge one-tick surplus and committed nearly all of it as crush-mode weaken
  against 3 very-high-difficulty targets in a single burst — with no per-pass RAM cap, that
  burst's own long weakenTime (security-dependent) then held ~6.9PB hostage for an extended
  stretch with zero further XP launches until it landed. Not a correctness bug (batcher stayed
  healthy throughout, 0 skips), but worth deciding whether it needs a per-pass thread/RAM cap
  before calling the equilibrium (S4) settled. Entry leaves this file at close-out. →
  `phase-20-xpfarm.spec.md`.
- **Auto-suppress share on small fleets** — a resource-manager rule to drop the 25% `share.js`
  carve below a fleet-size/income floor (today the only lever is the manual `share-off.txt`
  toggle, which competes hard with getting the batcher's pipeline started on a fresh post-reset
  fleet). Observed live 2026-07-09. No design yet.
- **Augment reservation cost model** — `resourcemanager.js`'s `manual-extra` rule
  (`finance-reserve-extra.txt`) is a stopgap; a real design needs an aug cost/priority model
  (which augs, in what order, at what price) to become its own reservation rule. This is also the
  seam the procureprograms close-out flagged — the reservation model coordinates spends but
  protects only the *immediate-next* one.
- **Core-aware grow/weaken sizing** — SHELVED; `sampling.js` sizes grow/weaken at an implicit 1
  core, but it's a safe overshoot (grow's security bump is core-independent) and only ~1% of
  fleet RAM at home's 2 cores. **Revisit when** home cores get upgraded post-Singularity (needs
  `upgradeHomeCores()`); co-scope with core-weighted share placement. → `phase-17-home-cores.features.md`.

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
- **Validate `upgradeHomeRam` Singularity call** — the `home-ram-upgrade` buy path has never been
  watched end-to-end (home RAM was UI-bought). Confirm it live opportunistically next time home
  RAM is script-bought. (from the 2026-07-12 procureprograms close-out.)
- **`saves/index.mjs` generator** — scan `saves/`, decode each file's BN/SF/hacking/money via
  `tools/save/savelib.mjs`, regenerate `saves/INDEX.md`. Parked; hand-maintaining ~8 rows is
  fine. **Revisit when** the save count grows enough that manual upkeep hurts.
- **Single condensed dashboard window** (Phase 18 Layer 3) — a `dashboard.js` renderer reading the
  other companions' on-disk state, replacing five tail windows. **Revisit only if** five tidy
  windows still feel like too many. → `phase-18-dashboards.features.md`.

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
