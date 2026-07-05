# Changelog — completed work

Condensed record of finished phases and one-off changes, newest first. Each entry is a
one-or-two-line summary; the full design/validation story lives in the linked phase doc
(and in git history). Active work lives in [`BACKLOG.md`](../../BACKLOG.md).

---

## 2026-07-05

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
