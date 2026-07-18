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

- **The NFG tail is on track to shrink every cycle — nothing plans for it** — NFG's rep
  requirement escalates **×1.14/level** (measured install #9: 122,736 → 998,737 over 16 levels;
  the close-out previously recorded it as *not* climbing, which was wrong). Rep resets to zero
  every install but the requirement doesn't, so each cycle re-earns a compounding target with
  roughly linear rep income. Money bound the tail through install #9 so it hasn't bitten yet.
  When it does, per-cycle gain decays toward the discrete augs alone — and the tail is most of
  the gain (16 NFG levels vs 6 discrete augs at #9). Arithmetic is fixed (both ladders now bound
  the buy loop and the projection); **the strategy is open**: donation is the only rep lever that
  scales with our money surplus, and nothing currently aims it at NFG.
  → [docs/neuroflux.md](docs/neuroflux.md), close-out "Open gaps" (8).

- **Nothing detects a stalled auto cycle** — gap 7's follow-on. The trigger sat 25h unarmed with
  $3.3q idle (2026-07-17 → 07-18) and nothing said a word; every process was alive and healthy the
  whole time. The arming bug itself is fixed, but the *class* isn't: in auto mode there is no check
  for "hours since `lastAugReset` >> observed cycle time, no install." Cheapest net: emit that as a
  dashboard line or log warning. Arguably the first increment of the supervisor below, since it
  proves the supervisor must watch **progress, not processes**. → close-out doc, "Open gaps" (7).

- **No supervision + `HOME_RESERVE_GB` (32) < augfarmer's 64.1 GB** — companions launch once at
  `daemon.js:415-455`, *before* the loop at 626; nothing monitors or relaunches them, so any
  companion death is a **silent permanent stop**, and `augfarmer.js` can't be relaunched at all
  (batcher fills home to `maxRam - reserve`, pinning free RAM at 32 GB). Confirmed **structural**:
  home 2 TB → 64 TB and free RAM went *down* (34.75 → 32.00 GB), so "buy more RAM" is not a fix.
  Recovery today is `restart daemon.js`. Doesn't block the first auto fire (you're watching); does
  block genuinely-unattended running, which is the real prize. **Fix is supervisor + reserve bump
  together, or neither.** Note Phase 25 deliberately declined the bump, correctly for the case it
  weighed. → close-out doc, "Open gaps" (4).

- **NFG counting: `nfg.level` misreports, `daedalusGate` may undercount** — install #5 answered
  S10's open question (queued NFG levels duplicate in `getOwnedAugmentations(true)`, installed ones
  collapse to one entry; annotated in `augfarmer.js`'s header). `nfg.level` reads 1 forever
  (cosmetic). **Unverified and load-bearing:** whether Daedalus's real 30-aug gate counts NFG levels
  individually — if it does we undercount (8/30 now) and over-grind. Confirm against the in-game
  requirement before it shapes the BN1.3 plan. → close-out doc, "Open gaps" (3).

- **Observe-mode trigger flap: a fire self-clears, then re-fires every ~10 min** — firing sets
  `phase: "install-ready"`, which is not an arming phase, so the next poll clears it → re-arms →
  re-fires on a `TRIGGER_SUSTAIN_MS` loop (observed 22:42:14Z fire → :24 clear → :34 re-arm).
  **Auto mode masks it** (the latch is gated on `mode === "auto"`), so it can't affect the first
  auto fire — but it degrades the observe-mode evidence the provisional constants need. Fix
  candidate: treat `install-ready` as arm-preserving, or latch on `fired` regardless of mode.
  → close-out doc, "Open gaps" (2).

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
