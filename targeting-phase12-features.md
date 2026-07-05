# Phase 12 features: targeting — root-access eligibility fix (+ ratio→priority fold-in)

**Stage:** requirements handoff for the spec stage, per `CLAUDE.md`'s Development workflow.
This phase is an unplanned hotfix (it jumps the agreed post-Phase-11 priority queue) driven by
a live error flood on the current save; the fold-in item rides along per BACKLOG's own guidance.
The spec stage turns this into `targeting-phase12-spec.md`.

## Goal

Stop the daemon from dispatching workers at servers we don't have root access on, which is
currently flooding the game's Recent Errors tab and wasting worker RAM every tick on a fresh
post-augment-install save. Fold in the already-decided BACKLOG quick-win for the same files
(targetsmonitor "ratio" column → actual priority metric), since BACKLOG explicitly says that
item should ride whichever phase touches `targets.js`/`targetsmonitor.js`.

## The bug (observed live, 2026-07-05)

- **Symptom:** after a fresh augmentation install (no TOR router purchased, no augments bought,
  only the port-opener programs that survived the reset), the game's Recent Errors tab fills with
  runtime errors from `weaken.js` and `grow.js` (both at `L11@main`, the `ns.weaken`/`ns.grow`
  call): `Cannot weaken <server> because you do not have root access`, and the grow equivalent.
  Observed against computek, the-hub, crush-fitness, johnson-ortho, omega-net, phantasy, and
  silver-helix, with per-server counts in the tens-to-hundreds (each error is one crashed
  worker; the daemon re-dispatches prep every tick, so counts climb continuously).
- **Root cause:** `targets.js`'s `getTargets()` eligibility filter checks only
  "not a purchased server", "has money", and "`requiredHackingLevel < myHackLevel / 2`" — it
  **never checks `ns.hasRootAccess(server)`**. Hacking level climbs fast post-reset, so servers
  requiring more port openers than we currently own pass the level filter, `hosts.js`'s rooting
  scan can't nuke them, and they enter the target list anyway. `daemon.js` then prep-dispatches
  grow/weaken at them (they're never "prepped": base security > min), and every worker crashes
  at its `ns` call.
- **Why it never showed before:** pre-reset, everything that passed the level filter was already
  rooted (all five openers owned), so root was never the binding constraint. The check has been
  missing since the eligibility filter was written; the post-install program/TOR loss exposed it.
- **Consistent detail:** no `hack.js` errors appear — an unrooted target never reaches the
  prepped state, so only prep jobs (grow/weaken) ever fire at it.

## Decisions

1. **Fix belongs in `getTargets()` eligibility, not in the workers and not in the daemon.**
   Add root access as an eligibility condition. Every consumer (`daemon.js` member selection,
   prep waterfall, `targetsmonitor.js`) inherits the fix upstream.
2. **No worker-side defensive guard.** Adding `ns.hasRootAccess` to `weaken.js`/`grow.js`/
   `hack.js` costs 0.05 GB **per thread** across the entire fleet (script RAM is charged per
   thread) to guard a condition the upstream fix makes unreachable — rejected. Workers stay
   minimal by design (their header says so).
3. **No rooting side effects in `targets.js`.** `hosts.js` owns rooting (the charter split both
   headers document: hosts = where to run + rooting, targets = what to attack). `daemon.js`'s
   `refreshCycle()` already calls `getHosts()` (which nukes anything newly rootable) before
   `getTargets()`, so within a daemon cycle the new filter sees post-rooting state. A standalone
   `run targets.js` sees current root state, which may lag one daemon cycle for a
   newly-rootable server — acceptable, document it.
4. **Root access is monotonic within a session** (only a reset removes it, and a reset kills all
   scripts), so a target that passes the filter can't lose root mid-cycle — no staleness window
   to handle beyond the existing CYCLE_MS refresh.
5. **Extract the eligibility test as a pure exported predicate and unit-test it** (house style:
   pure decision logic exported, tested mock-free in `test/`). The purchased-server exclusion
   stays outside the predicate (it's set-membership context); the predicate covers
   root/money/level.
6. **Fold in the BACKLOG "targetsmonitor ratio column → actual priority metric" item as decided
   there** (all three sub-decisions: show `score` as `priority` using `toExponential(2)` in both
   `targetsmonitor.js` and `targets.js`'s own summary; remove the `ratio` field from the target
   objects, noting the `targets-summary-*.json` schema change; fix the misleading `->` marker
   with the post-Phase-7 "active *set* can differ" legend wording). Consumers of `ratio` were
   grep-confirmed 2026-07-04 as exactly `targetsmonitor.js:57` and `targets.js:147`; re-grep at
   implementation, and if a third consumer turned up since, keep the field and flag it instead.

## Rejected alternatives

- **Worker-side root check** — per-thread RAM cost fleet-wide (Decision 2).
- **Rooting from `targets.js`** — violates the hosts/targets charter split (Decision 3).
- **Daemon-side filter (filter targets in `daemon.js` instead of `targets.js`)** — leaves
  `targetsmonitor.js` and standalone `targets.js` runs showing unrootable "targets"; the
  eligibility definition belongs where eligibility is defined.

## Open questions

None at the features stage; anything the spec stage resolves it should record as a spec-stage
decision.

## Out of scope

- Auto-buying TOR/openers post-reset (`procureprograms.js` correctly exits on this save —
  Source-File-gated; the BACKLOG watcher idea and the re-validate-ladder item stay where they
  are). Hand-buying openers remains Kenneth's manual step; the existing `hosts.js` rooting scan
  picks up the new capability within one cycle without changes.
- Surfacing in-game runtime errors into exported logs (the dev-loop observability umbrella in
  BACKLOG — this bug is a fresh motivating example for it, but no log-capture work this phase).
- Any batching/scheduling math change; any change to `hosts.js`.

## Validation sketch (detail is the spec stage's job)

- Unit tests for the new pure eligibility predicate (including the not-rooted regression case).
- RAM gate on `targets.js`, `daemon.js`, `targetsmonitor.js` (expected: +0.05 GB where
  `hasRootAccess` is newly reachable, daemon flat at 16.30 — it already reaches
  `ns.hasRootAccess` via `hosts.js`, and Phase 9 confirmed once-per-name charging).
- Live: daemon restart on the current save, Recent Errors stays clean over an observation
  window, target list shrinks to rooted servers only (the seven named servers disappear),
  `npm run verify:log` green on the session's log. No reset required for any of it.
