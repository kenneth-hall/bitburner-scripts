# Changelog — completed work

Condensed record of finished phases and one-off changes, newest first. Each entry is a
one-or-two-line summary; the full design/validation story lives in the linked phase doc
(and in git history). Active work lives in [`BACKLOG.md`](../../BACKLOG.md).

---

## 2026-07-13

- **Phase 20 — XP-farm engine, close-out** → `phase-20-xpfarm.features.md`,
  `phase-20-xpfarm.spec.md`. Dedicated hack-saturation XP engine (`src/xpfarm.js`,
  `src/xphack.js`, `src/xpweaken.js`) that fills the fleet's surplus RAM — whatever the money
  batcher and share pool leave unclaimed — with fire-and-forget hack workers against the
  highest-difficulty eligible servers, self-scaling from ~0 on a busy young fleet to
  near-total on an idle endgame one. Two amendments landed after the initial ship attempt
  surfaced live bugs: **S8** (sized, cooldown-gated crush volleys, replacing an unbounded
  single-pass burst that locked the fleet up on restart) and **S9** (demand-driven packing —
  volleys → wave-sized held weaken streams → capped 2,500-thread hack waves → an overflow
  absorber on the highest-reqLevel target — replacing whole-host round-robin, which let
  per-target hack waves grow unbounded and pinned high-req targets at security 100
  indefinitely, and a RAM-fraction weaken split that over-delivered security reduction
  ~4.6×). `npm test` 390/390 green; RAM gate flat 5.85GB (byte-verified, no new ns surface).
  **Live-confirmed over a multi-hour unattended run:** zero hack-wave-cap violations across
  1,104+ target-records; D2's weaken/hack ratio measured at 0.0503 (target ~0.05, was 0.185
  pre-fix); all held targets converged to tight sawtooths around their own min security;
  money-independence of hack exp confirmed analytically via `Formulas.exe`. **Ship gate
  (S7, ON/OFF A/B, `xp-off.txt` toggle, ≥30 min/window): engine-on 260,523 exp/sec vs
  engine-off 50,620 exp/sec — 5.15× (pass, ≥3× required).** `src/xpprobe.js` (brainstorm
  probe) removed, its findings folded into the features doc.

## 2026-07-12

- **Auto-buy Formulas.exe (`src/procureformulas.js`) — fulfill the standing reservation SF4
  unblocked.** `resourcemanager.js` has reserved $5b for Formulas.exe since Phase 11 but nothing
  ever bought it (kept hand-buy-only under the then-live "zero Singularity" constraint), leaving
  $5b earmarked-but-idle every run. With SF4 now granted, a new resident Singularity companion
  (the `backdoorfactions.js` model, `launchDetached` from `daemon.js` startup) buys Formulas once
  hacking clears the same `>400` gate `resourcemanager.js` uses for the reservation and it's
  affordable above the bootstrap holdback, then exits; `daemon.js` already re-checks the file each
  cycle and flips legacy→formulas math live, no restart. Resident (not self-terminating like
  `procureprograms.js`) because `>400` is reached long after the openers are bought, so a one-shot
  would exit before eligibility. Vetoable via the existing `finance-disable-formulas.txt` flag.
  Pure `planFormulasPurchase` decision (13 unit tests); fail-safes mirror `procureprograms.js`
  (stale finance state → buy nothing; `purchaseProgram` throw → print once + exit). Note: programs
  don't persist across installs, so this re-pays $5b per install — accepted as an explicit choice
  (option 1 of the three-way fork), the `>400` gate keeping it from firing during the fragile
  post-install ramp.
- **Post-install study kick (`src/studybootstrap.js`) — convert post-install dead time to
  hacking XP.** After an augment install the character idles at hacking ~1 with a wiped fleet
  and no port openers, so the batcher/`xpfarm.js` produce ~no XP and the level can sit at 1 for
  hours (observed live). New one-shot Singularity companion (the `procureprograms.js` isolation
  model, `launchDetached` from `daemon.js` startup): if `hack < 10`, start Rothman University
  Computer Science unfocused (`focus:false`), then exit — no stop/handoff (explicitly scoped out
  as future work). Trigger is `< 10` not `== 1` so a stray bootloop weaken bumping you to 2-3
  can't make it miss the post-install window. Guards: SF4 active (`getResetInfo().ownedSF`) +
  try/catch backstop for the Singularity throw, and in-Sector-12 (no `travelToCity` spend — you
  land there post-install; Rothman is local). Validated: `npm test` (346 pass), live standalone
  run + live daemon-startup auto-launch both clean-skip at hacking 545; the actual study trigger
  (`hack < 10`) is inherently live-only, deferred to next install.
- **Phase 22 — auto-backdoor the four hacking-faction servers, live-validated end-to-end.**
  New self-terminating Singularity fulfiller (`src/backdoorfactions.js`, the
  `procureprograms.js` model): roots + walks + `installBackdoor()`s CSEC/`avmnite-02h`/
  `I.I.I.I`/`run4theh111z` as hacking level allows, never calls anything that joins a
  faction (hard rail enforced by grep in acceptance — the join-verb string appears nowhere
  in `src/`). Spec-stage addition beyond the features file: a `backdoor-status.json`
  overwrite-in-place snapshot (`vite.config.ts` filter added), since CLAUDE.md's
  log-over-paste convention needs *some* export and the features file's events-log
  infrastructure stayed deliberately deleted. `common.js`'s `findPath` gained a `start`
  parameter (default `"home"`, byte-identical for the existing `connect.js` call site) so
  the walk can path from wherever the terminal currently sits, not just from home.
  **Live validation ran Tier 1 for real, not just mocked** (hacking level had already
  climbed to 371 by the live pass): CSEC, `avmnite-02h`, and `I.I.I.I` all backdoored
  automatically within the run, each surfacing its faction invite with zero auto-joins
  (all three "Decide later"'d); `run4theh111z` (542) still pending. RAM measured **11 GB**
  at SF4.3's 1× multiplier (spec's derived ~9–13 GB band), `daemon.js` flat at 16.3 GB.
  Tier 2 (fresh-node reset → climb → invite from scratch) stays deferred to the next
  install/reset (tracked in BACKLOG). **Unrelated finding surfaced, not fixed here:**
  `npm run verify:log`'s event-type checker doesn't recognize the pre-existing `rooted`
  event type (`hosts.js`) — confirmed pre-existing on `master` via `git stash`, logged as
  its own BACKLOG bug rather than folded into this phase's diff.
  `phase-22-autobackdoor.features.md` / `.spec.md`.

- **procureprograms.js — TOR/port-opener auto-buy validated live (backlog close-out, no code change).**
  With SF4 now permanent (Phase 21), the Singularity buy path that had only ever exercised its
  "SF4 missing → exit cleanly" branch was finally watched end-to-end. Triggered by an aug install
  (a 1-level NeuroFlux, chosen as the cheap validation vehicle Kenneth accepted the re-climb for),
  which wipes all six programs → watched the re-buy during re-bootstrap. **Confirmed live this
  cycle:** launches past the SF4 guard with no runtime-error popup; sees 0 owned; respects the
  $110k bootstrap holdback ("waiting for cash"); buys **TOR first** (`auto-tor` $200k @ 09:55:27 —
  first-ever logged capture of that call); walks openers **cheapest-first** (BruteSSH $500k →
  FTPCrack $1.5m); reservations release in `finance-log.json` as each is bought. **Self-termination
  taken on evidence, not re-observed this cycle** — today's log already held a full completed-and-
  exited cycle (4 openers bought earlier, tail closed at session start = the summary→`closeTail`→exit
  after-state), and the exit is 3 trivially-correct lines; forcing it via a `.txt` flag was rejected
  as a permanent test-hook in a hot script for near-zero risk (decision: close on evidence). The
  ladder itself parked at 6/9 mid-validation — **not a bug**: income plateaued below relaySMTP's $5m
  reservation (`available = money − reserved = 0`), the reservation model correctly protecting the
  opener cash from cloudmanager. Closes the *"Re-validate procureprograms TOR/opener ladder live"*
  backlog item and moots the *"Lightweight Source-File watcher"* item (SF4 permanent + daemon
  launches it at startup → no wait-for-SF scenario). **Open follow-ups surfaced, not closed:**
  `upgradeHomeRam` Singularity call still unvalidated (home RAM was UI-bought, no `home-ram-upgrade`
  log); the fleet ran ~90% idle on ~1TB persisted home RAM (income plateau) — feeds Phase 20 and the
  finance-manager brainstorm; and the reservation model demonstrably coordinates cloud-vs-program
  spends but protects only the *immediate-next* opener — the exact priority seam a future aug
  purchaser would expose.

- **Phase 21 — Grant SF4.3 via save edit** → `phase-21-sf4-grant.features.md`,
  `phase-21-sf4-grant.spec.md`. Deliberate save-file cheat: own Source-File 4 level 3 (1×
  Singularity RAM) without playing BN4, unlocking `ns.singularity.*` inside the ongoing BN1.2
  run. Core edit is exactly one substring insertion (`sourceFiles.data` `[[1,1]]` →
  `[[1,1],[4,3]]`, +6 bytes), derived via `JSON.stringify` so the escaping always matches the
  save's own format rather than hand-typed backslashes. `tools/save/savelib.mjs` is the pure
  transform with four hard-fail guards (needle-count, byte-delta, parse-integrity, a structured
  diff that only permits `sourceFiles.data` to change); `tools/save/sf4grant.mjs` is the CLI
  (`grant`/`describe`); `src/sf4check.js` is the one-shot Singularity liveness probe, isolated
  from `daemon.js` per the RAM-isolation rule. `npm test` 330/330 (9 new in
  `test/savegrant.test.js`, hermetic against an in-code fixture) — the same guard/diff code
  path is re-run against the real save at apply time, so the fixture tests and the live
  transform share identical logic. **Spec-stage S1 override (Kenneth signed off):** the
  features doc's plan to hand-write `SF4.1`/`4.2`/`4.3` achievement records turned out
  unimplementable — only one SF achievement exists per BitNode (`SF4.1`), and the game
  self-grants it once the map holds `[4,3]`, confirmed live (achievements page showed `SF4.1`
  acquired at 8:21:46 AM, between the import and the first liveness check) — so the edit
  stayed exactly the one insertion, nothing achievement-related to write.
  `saves/` consolidated with a committed `INDEX.md` (two repo-root `.gz` moved in, extraction
  dirs + scratch `.pretty.json` deleted, `.gitignore` re-anchored to `/bitburnerSave_*.json.gz`
  so `saves/*.json.gz` is trackable while the bulky decompressed/pretty forms stay ignored).
  **Live sitting (L1–L7) run same day, all passed:** fresh Backup Save indexed + committed as
  `pre-edit-backup` before the transform touched anything; `grant` on the real save reported
  `ALL GUARDS PASSED`, +6 bytes, summary differing only in `sfLevels`; Import Save accepted the
  `.gz` cleanly (no fallback ladder needed); `sf4check.js`'s exported log showed
  `ownedSF: [[1,1],[4,3]]` and a non-throwing `singularityProbe: 4`; `ramcheck.js` measured
  **7.65 GB**, landing exactly on the 1× derivation (1.6 base + 1.0 `getResetInfo` + 0.05
  `getHackingLevel` + 5 GB singularity call), nowhere near the 4×/16× bands; a second Backup
  Save (`post-import-reexport`) confirmed `[4,3]` survives a real load/save cycle — S8's
  rollback contingency never triggered. **Same-sitting addendum (not originally spec'd):** a
  narrative toast popup blocked every CDP `goto`/`terminal` click mid-sitting; added
  `dismissStoryPopup` to `tools/bb/driver.mjs` (fires only when the entire accessible tree is
  one nameless button + narrative text — can't misfire onto a real confirm/buy/install dialog,
  which always exposes multiple/named controls) and pre-authorized it in `CLAUDE.md` so future
  story popups no longer need Kenneth to clear by hand. **Supersedes the SF4-gated backlog**
  (auto-backdoor, aug-planner execution, TOR ladder, rep watchers) — each becomes its own later
  phase, none folded into this one.

## 2026-07-08

- **Phase 18 — readable, self-placing dashboard windows** →
  `phase-18-dashboards.features.md`, `phase-18-dashboards.spec.md`. Fixed the five in-game
  tail windows' line-wrap (too narrow), header scrolling out of view (content taller than
  window), and manual re-dragging/resizing every aug install (nothing set geometry). New
  headless `src/tailmanager.js` companion centrally restores each window's saved
  position/size/font on launch and persists Kenneth's tweaks to `tail-layout.json` (one
  0.3GB `getRunningScript` cost total, not one per window; every `ns.ui.*` call used is
  0GB). Pure `reconcileTick` decision core with an explicit RESTORING/TRACKING mode per
  window (a spec-reviewer blocker caught the original 3-arg signature omitting that state,
  which would have snapped windows back against the user's own drag — fixed before
  implementation). Content pass across `daemon.js`/`targetsmonitor.js`/
  `transactionsmonitor.js`/`cloudmanager.js`/`resourcemanager.js` applying "status in
  popups, lists in logs": daemon's member+draining list capped at 12 (+N more); redundant
  log-duplicated lines (skip/shrunk counters, last-launch, prep-dispatch detail, saturated-
  skip INFO) dropped from the tail; targets shows top 5 + a pointer to the full-ranking
  export; transactions collapses to totals + last 3 with a filename footer; cloud/resource
  manager lines tightened. `logEvent` calls and the daemon-batch-log schema untouched;
  `transactionsmonitor.js`'s income-writer block untouched. Two same-session addendums
  (folded in during live validation, not originally spec'd): `killscripts.js` now closes
  each process's tail window in the same loop that kills it (`ns.kill()` doesn't auto-close
  a tail), and `procureprograms.js` closes its own tail at each of its four self-terminating
  exit points (a script finishing on its own doesn't auto-close it either) — both were
  leaving frozen orphan windows on every daemon restart / natural exit. `npm test` 317/317
  (24 new). **Live-confirmed same day**: RAM gate — `daemon.js`/`targetsmonitor.js`/
  `resourcemanager.js` flat against their recorded baselines (16.30/12.70/3.35 GB),
  `tailmanager.js` landed exactly on its predicted ~1.9GB, `cloudmanager.js`/
  `transactionsmonitor.js` flat (no recorded prior baseline, but pure string/format edits
  can't move reachability-based RAM); all five windows self-placed into the right-edge
  column on first run; two manually-dragged windows (`cloudmanager.js`/`resourcemanager.js`)
  persisted through a daemon restart and returned to their exact tweaked geometry; orphaned
  windows confirmed gone after the `killscripts.js` fix; `procureprograms.js` observed
  closing its own window on a natural exit; `npm run verify:log` 36/36 green against a fresh
  post-restart export. Layer 3 (single condensed window) deferred — filed in BACKLOG Ideas.

- **Phase 17 — home-core-aware grow/weaken sizing: investigated, measured, SHELVED** →
  `phase-17-home-cores.features.md`. `sampling.js` sizes all grow/weaken thread math at an
  implicit 1 core (both legacy and formulas branches), but `home` is a real worker host with
  >1 core. A throwaway in-game probe (`src/coreprobe.js`, since removed; evidence
  `logs/coreprobe-1783550870612.json`) answered both gating questions: **(Q1)** grow's
  per-thread security increase is **core-independent** (flat at 4 across cores 1–16), so the
  original "correctness drift bug" claim was **wrong** — cores=1 sizing is a safe overshoot,
  making this pure efficiency; **(Q2)** home was 19.4% of allocatable RAM at probe time
  (surprise — but only because the fleet was in a small post-reset state; the share decays as
  purchased servers are rebought). Measured core factor: 5.9%/thread saved at home's current 2
  cores (`1+(cores-1)/16`), so ~1% of fleet RAM reclaimed today, rising to ~5–8% only at 8–16
  cores — which needs Singularity-gated `upgradeHomeCores()` not yet automatable. Verdict
  (Kenneth): not worth reordering the batcher hot path (sizing runs before host assignment) for
  a ~1% transient gain; **revisit when home cores get upgraded**. No code shipped; probe + its
  `vite.config.ts` download filter removed. Co-scope with Phase 8's deferred core-weighted
  *share* placement if either is revived.

## 2026-07-07

- **Phase 16 — Fable audit cleanup (F2–F8)** → `phase-16-audit-cleanup.features.md`,
  `phase-16-audit-cleanup.spec.md`. Closed the remaining findings from the 2026-07-06
  full-repo audit (F1 shipped with Phase 15). Dedup: new `src/financestate.js` kills the
  triplicated finance-state client code (`readFinanceState`/`isStateStale`/the filename
  constant) across `resourcemanager.js`/`cloudmanager.js`/`procureprograms.js` and removes
  the `procureprograms.js → cloudmanager.js` import; the four stray `tprintTs` copies
  (`resourcemanager.js`/`cloudmanager.js`/`procureprograms.js`/`bootstrap.js`) now import the
  Phase 13 shared one from `common.js`, whose header was also corrected — it had been
  asserting the bundle-charging model Phase 9/13 already disproved; `totalAllocatableRam`
  moved from `daemon.js`/`sharecurve.js`'s byte-identical copies into `hosts.js`. Fixes:
  `daemon.js`'s `trimLog` had an off-by-one that left the ring buffer at `MAX + 1` entries
  while a `mode` event was pinned (widened the drop slice by one); `transactionsmonitor.js`'s
  running "today's hacking income" now resets at the day-rotation boundary via a new pure
  `dayRolledOver` helper; the daemon's ambiguous "budget" status label (colliding with the
  share line's distinct "batch budget") relabeled to "fleet". Backfilled tests for three
  previously-untested pure helpers (`standardSizes`, `nextIndex`, `nextInstanceNumber`).
  Behavior-preserving housekeeping — no batching/scheduling/finance math changes. `npm test`
  293/293 (18 files, 6 new). **Live-confirmed same day**: RAM gate exactly flat on all 8
  touched scripts (`daemon.js`/`sharecurve.js`/`hosts.js`/`bootstrap.js`/`cloudmanager.js`/
  `procureprograms.js`/`resourcemanager.js`/`transactionsmonitor.js`, before/after against a
  freshly captured `master` baseline, byte-verified against `dist/src/*`) — byte counts
  shifted in both directions as expected from the extractions, but reachability-based RAM
  cost held flat everywhere, confirming the `common.js` header fix. `npm run verify:log`
  36/36 green against a fresh post-restart export (14 members, 0 skips, no stall); the tail
  window showed `fleet 1.58PB` and `batch budget 1.18PB` as the intended two distinct labels.

## 2026-07-06

- **Phase 15 — small-fleet batching floor** → `phase-15-small-fleet.features.md`,
  `phase-15-small-fleet.spec.md`. Fixed the zero-member income stall live-confirmed the same
  day (see Phase 13's entry below): `pickBatchSet` only ever admitted a target whose *full*
  pipeline fit the batch budget, and on the post-reset 940GB fleet no target's full pipeline
  fit (cheapest ~721GB vs. a 705GB budget), so every admission pass seated nobody, forever —
  the daemon had launched zero workers and earned $0 since the Jul 5 handoff. Fix: a new
  `cappedPipelineDepth` (`scheduler.js`) caps admission depth by affordability instead of
  the raw throughput ceiling, and `pickBatchSet` gained a floor pass (incumbent-sticky under
  the existing hysteresis) guaranteeing at least one seat whenever candidates exist — the
  existing per-tick shrink loop does the actual fitting from there. `daemon.js` snapshots
  gained `candidateCount` + a per-member `floor` flag; a stall WARN and `FLOOR` tail tag make
  the (now-unreachable) old failure mode loud instead of silent. `verify-log-checks.js`'s
  `checkBudgetInvariant` was reconciled with a legitimate floor-seated over-budget member
  (own consistency checks added), plus a new `checkNoStall` rule hard-failing this exact bug
  signature (`candidateCount > 0 && memberCount === 0`). `npm test` 268/268 (250 + 18 new).
  **Live-confirmed same day**: RAM gate exactly flat (`daemon.js`/`targets.js`/
  `targetsmonitor.js`/`bootstrap.js` all matched the 2026-07-06 baseline, byte-verified fresh
  against `dist/src/*`); daemon restart immediately seated `phantasy` (`candidateCount: 12`,
  `memberCount: 1` across every snapshot) and launched a batch within the first tick;
  `npm run verify:log` 36/36 green against the fresh export, including the new stall and
  amended budget rules. Filed two follow-up Ideas (BACKLOG): the `sharePower: 1.00`-with-
  live-threads oddity, and auto-suppressing share on small fleets.

- **`git worktree` investigation — closed out.** Adopted: `bitburner-scripts2` (this repo,
  branch `worktree-docs`) runs as a second worktree for docs/BACKLOG/brainstorming work,
  isolated from the live `bitburner-scripts` checkout's working directory and index. Documented
  in `CLAUDE.md` — `bitburner-scripts2` has no dev server of its own and must never start/stop
  `npm run dev`; only the `bitburner-scripts` session may do that, since it's the one actually
  connected to the live game. Resolves the original worry (parallel Claude Code sessions
  colliding over shared `git status`/index state) without a full second clone.

- **Phase 13 — consistency consolidation, closed out** → `phase-13-consolidation.features.md`,
  `phase-13-consolidation.spec.md`, `phase-13-consolidation.closeout.md` (implemented
  2026-07-05, merged to `master` as a deliberate exception pending live validation; live
  validation completed 2026-07-06). New `src/common.js` (`scanNetwork`, `findPath`,
  `tprintTs`, `workerRamCosts`); `hosts.js`'s `getHosts` split into `tryRoot`/`listHosts`;
  `launchmonitor.js` switched to the non-rooting `listHosts` (real correctness fix — it was
  racing the daemon's rooting from inside a monitor); `sharecurve.js` picked up a real
  double-count fix in its capacity report along the way. `npm test` 250/250.
  **Most reusable lesson of the phase:** the RAM gate initially measured a spurious +0.25GB
  on `launchmonitor.js`/`sharecurve.js` that looked like an analyzer limitation (can't
  call-graph-prune closures-as-data) — two code-shape fix commits produced bit-identical
  readings across three runs, which briefly looked like confirmation. Forensic replay of
  `dist/src/*` (viteburner's byte-faithful dump of what it last actually pushed) found the
  real cause: a `git checkout` for the merge, done in this checkout while the dev-server
  watcher was live, pushed stale pre-refactor files into the game at 20:46:02 — all three
  "identical" after-runs had measured the *same stale file*, not three different code
  shapes. A verified re-run (`ramcheck.js` extended to also record each script's in-game
  source length, byte-checked against the `dist/` dump before trusting any reading) hit the
  originally-predicted numbers exactly: `launchmonitor.js` 3.20 (−0.65), `sharecurve.js` 5.70
  (+0.05), both tripwires (`daemon.js`/`bootstrap.js`) flat. New standing rule (`CLAUDE.md`):
  never `git checkout`/switch branches in a dev-server-watched checkout while the game is
  connected unless the push is intended — stop the dev server first. Live daemon session
  (~35 min) confirmed clean; separately surfaced (not a Phase-13 regression — confirmed
  pre-existing, `targets.js`'s diff across the merge is a verbatim move) a live batcher bug:
  `daemon.js` has run with zero batch members / zero hacking income since 2026-07-05, share
  pool only — filed as its own BACKLOG item for investigation.

## 2026-07-05

- **Docs reorganization — archive phases, trim BACKLOG, add metareference** (branch
  `docs/trim-backlog-naming`). Moved the 16 shipped phase docs into `docs/phases/` under a new
  `phase-NN-slug.<stage>.md` convention (history preserved via rename), trimming BACKLOG
  944→~420 lines by relocating completed history to this changelog. Added `docs/metareference/`
  (tracked AI-workflow reference PDFs) + a thin `docs/phases/README.md`; set the docs-layout and
  phase-naming conventions in `CLAUDE.md`; added `.gitattributes` (binary-safe PDFs); started
  tracking shared `.claude/` config; deleted/ignored root clutter.

- **Claude Code — spec-review loop automated** (started 2026-07-04). Documented the
  brainstorm→spec→implement workflow in `CLAUDE.md` and moved the four standing rules
  (Singularity RAM, transaction logging, tests+log validation, spoiler carve-out) out of the
  per-run fable prompt into `CLAUDE.md`. Built the **`spec-reviewer`** subagent
  (`.claude/agents/spec-reviewer.md` — read-only, `model: opus`, four-category rubric +
  APPROVE/`BLOCKING ISSUES:` verdict) and the **`/spec`** command (`.claude/commands/spec.md`,
  `disable-model-invocation`, seven-step loop: resolve → read → clarify-gate → draft → cold
  review → revise one round → present, stop before implementation). Chose one review round over
  multi-round convergence (no natural stopping point). First live run (Phase 14) caught 3 real
  blocking issues. Optional Step 8 (opus writes the features doc itself) still open — see BACKLOG.

- **Workflow — update BACKLOG in the same commit as the work.** After repeated "do work →
  commit → separately update BACKLOG → commit again" cycles, added a `CLAUDE.md` *Tracking
  work* rule to stage the BACKLOG edit in the same commit. Folded the redundant
  `backlog_bookkeeping` auto-memory.

- **Docs/memory cleanup — strip git rules to version-control basics** (branch
  `docs/slim-git-rules`, `c74548a`). Slimmed `CLAUDE.md`'s `## Git` to branch/commit/merge +
  the background-job safety rail; deleted three pure-git-mechanics memories (10→7).

- **Docs/memory cleanup — CLAUDE.md dedupe + memory consolidation** (branch
  `docs/claudemd-dedupe`, `ef72433`). Folded the duplicate "verify against the log files"
  clause; consolidated auto-memory 13→10 files.

- **Phase 14 — cold-start bootstrap (8GB home → daemon.js handoff)** →
  `phase-14-bootstrap.features.md`, `phase-14-bootstrap.spec.md`. New `bootstrap.js` deployer +
  `bootloop.js` worker to rebootstrap the fleet after the hard reset took `daemon.js` (16.3GB)
  offline; auto-hands off to `daemon.js` at the 32GB home tier. First real `/spec` run (3
  blockers fixed at review). `npm test` 231/231; RAM gate closed (`bootstrap.js` 6.20GB after a
  live `ns.ps` fix); all 6 live steps observed. Merged to `master`.

- **Phase 12 — targeting root-access eligibility fix (+ ratio→priority fold-in)** →
  `phase-12-targeting.features.md`, `phase-12-targeting.spec.md` (branch `phase12-targeting`).
  Unplanned hotfix for a live `weaken/grow … no root access` error flood: new pure
  `isEligibleTarget` predicate adds a rooted check in `src/targets.js`. Also swapped the
  misleading `ratio` display for `priority`. `npm test` 190/190; RAM gate closed; live-clean.

- **Phase 11 — resource manager: active procurement** → `phase-11-resource-manager.features.md`,
  `phase-11-resource-manager.spec.md` (branch `worktree-phase11-procurement`). Three renames +
  behavior evolution: `financemanager→resourcemanager`, `cloudupgrader→cloudmanager` (adds
  bootstrap/growth buys), `purchasescripts→procureprograms` (self-terminating TOR + port-opener
  loop). `npm test` 184/184. Found a real bug: `purchaseTor()` throws without Singularity SF —
  guarded with an `ownedSF` check + try/catch. TOR/port-opener ladder unverifiable until the SF
  is owned (follow-up filed).

- **Phase 10 — finance manager + cloud server auto-upgrader** → `phase-10-finance-cloud.md`
  (branch `worktree-phase10-finance`, `5e5f74d`). Two daemon companions: `financemanager.js`
  (reservation-based available-cash service) and `cloudupgrader.js` (its first customer,
  upgrade-only). `npm test` 162/162; RAM gate closed; validated live across a reset. Spun off
  `renamecloudservers.js`; bumped `FORMULAS_HACKING_LEVEL_THRESHOLD` 300→400; added a
  `finance-disable-formulas.txt` kill switch.

## 2026-07-04

- **Phase 9 — Phase 8 close-out** → `phase-09-batcher-refactor.md` (branch
  `worktree-phase9-closeout`, PR #3). Fixed `pickBatchSet`'s pass-3/pass-4 both-lists bug
  (`justEvicted` set). Confirmed the Phase 8 RAM anomaly via the `share→sharePool` rename —
  recovered the full 2.4GB phantom charge (`daemon.js` 18.7→16.3GB), proving import RAM-charging
  is reachability-based, not whole-bundle. Added `hackingLevel` to snapshots. `npm test`
  128/128. Live A/B/A' share session: rep boost confirmed (~45%), income cost still not cleanly
  quotable (A vs A' disagree +36.7% from level-driven scaling). Keep `SHARE_FRACTION` at 25%.

- **Remote API auto-reconnect enabled.** In-game Remote API set to auto-reconnect (5s retry,
  infinite) so a `npm run dev` restart no longer needs a manual in-game reconnect.

- **Phase 8 — faction share allocation** → `phase-08-batcher-refactor.md` (branch
  `worktree-phase8-share`, draft PR #1). Hard-carves `SHARE_FRACTION = 0.25` of allocatable RAM
  for `share.js`, topped up smallest-free-first; added `sharecurve.js` tuning script. `npm test`
  120/120. Live A/B/A': share ~45% rep boost (matches sharePower 1.417); income inconclusive.
  RAM gate: `share.js` 4.00GB exact; `daemon.js` +2.6GB anomaly waived (resolved in Phase 9).

- **Phase 7 — multi-target batching with natural exit** → `phase-07-batcher-refactor.md`.
  Replaced the single hysteresis incumbent with a RAM-bounded, score-greedy member set
  (`pickBatchSet`, `inFlightByTarget`, daemon rewrite; zero `ns.kill`). `npm test` 88/88. Live:
  up to 10 concurrent targets (was 1), utilization avg 20.3% (was ~6.3%), 7 clean natural exits.
  Pushed to `origin/master`.

- **Phase 5 — daily transactions log** → `phase-05-batcher-refactor.md`. Retired `moneymonitor.js`
  for `src/translog.js` + `transactionsmonitor.js`; instrumented all four purchase call sites.
  `npm test` 78/78; `verify:log` now runs transactions checks too. `fleetupgrade.js` now checks
  the upgrade return value (silent-failure fix). RAM gate closed. Pushed to `origin/master`.

- **Phase 4 — Formulas.exe math with legacy fallback** → `phase-04-batcher-refactor.md`. Churn
  fix (0 flips/16min formulas vs 9 legacy) and reserve-ballooning fix confirmed same-session.
  Waived: fleetupgrade-while-running live test (cash constraint).

## Earlier

- **Phases 1–3 — batcher refactor** → `phase-01-batcher-refactor.md` … `phase-03-batcher-refactor.md`:
  pipeline reservation waterfall, efficiency-score ranking, shrink gating.
