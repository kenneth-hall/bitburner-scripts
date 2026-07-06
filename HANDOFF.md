# Session handoff — Phase 13 (consistency consolidation), stopped mid-live-validation

**Date:** 2026-07-05
**Branch:** `worktree-phase13-consolidation`, merged into `master` this session (see below).
**Nature:** Bitburner code change (`src/`) — code + unit tests done and merged; **live RAM-gate
validation is incomplete**, stopped deliberately at Kenneth's request rather than continuing to
chase an unexplained RAM discrepancy. Spec: `phase-13-consolidation.spec.md` (repo root, not yet
graduated to `docs/phases/` — see "What's left").

---

## What's done

All nine code work items from `phase-13-consolidation.spec.md` are implemented, committed, and
merged to `master`:

- **`src/common.js`** (new): `scanNetwork`, `findPath`, `tprintTs`, `workerRamCosts(ns)`.
- **`src/hosts.js`** restructured: `tryRoot(ns, server)` + `listHosts(ns)`, composed by `getHosts`;
  exports `HOME_RESERVE_GB`. Went through two extra RAM-hygiene fixes mid-gate (see "Where we're
  stuck").
- **`targets.js`/`killscripts.js`/`connect.js`/`sharecurve.js`** rewired onto the shared helpers.
  `sharecurve.js` also picked up a real bug fix (S11): its local `listHosts` was double-counting
  every purchased server in the capacity report; now imports the shared, correct one.
- **`daemon.js`**: dropped private `tprintTs`/`HOME_RESERVE_GB`/ramCosts-builder duplicates,
  added a shared `fitsOnHome` helper, fixed `runAndWait`'s stale doc comment.
- **`launchmonitor.js`**: switched to the non-rooting `listHosts` (was nuking servers from inside
  a "read-only" monitor before).
- **`cloudcosts.js`** exports pure `standardSizes(ramLimit)`, reused by `purchasecloudservers.js`.
- Deleted two dead files (`src/cleanup-old-daemon-log-temp.js`, root `cloud-server-costs.js`).
- Added throwaway `src/ramprobe-workerkeys.js` for the `WORKER_SCRIPTS`-key RAM-phantom probe
  (work item 8) — **still on the branch/master, not yet removed** (see "What's left").
- `test/common.test.js` + `test/hosts.test.js` (new): 19 new tests.

**`npm test`: 250/250 green** (231 pre-existing + 19 new) at every commit along the way.

**Commits** (on `worktree-phase13-consolidation`, now merged to `master`):
1. `2f5f9da` — main Phase 13 implementation.
2. `d74fd45` — first RAM-hygiene fix attempt (scope `PORT_OPENERS` inside `tryRoot`). **Had no
   measurable effect** — see below.
3. `efcb0a2` — second RAM-hygiene fix attempt (replace closures-in-array with a named
   `openPort(ns, file, host)` switch function). **Also had no measurable effect.**

### RAM-gate results captured so far (`logs/` — gitignored, local only; key numbers copied here so
nothing is lost if those files get cleared)

Baseline on `master`, before Phase 13 synced in (two independent captures agree exactly):
```
hosts.js 3.65 | targets.js 12.7 | killscripts.js 3 | connect.js 2 | launchmonitor.js 3.85 |
daemon.js 16.3 | cloudcosts.js 3.65 | purchasecloudservers.js 5.75 | targetsmonitor.js 12.7 |
bootstrap.js 6.2 | sharecurve.js 5.65
```
(saved: `logs/ramcheck-baseline-phase13.json`, `logs/ramcheck-result-baseline-master-phase13.json`)

After Phase 13, on the branch (confirmed via three separate fresh runs, including after both
RAM-hygiene fixes — **identical every time**):
```
hosts.js 3.65 (flat) | targets.js 12.7 (flat) | killscripts.js 3 (flat) | connect.js 2 (flat) |
launchmonitor.js 3.45 (−0.40, predicted −0.65) | daemon.js 16.3 (flat) | cloudcosts.js 3.65 (flat) |
purchasecloudservers.js 5.75 (flat) | targetsmonitor.js 12.7 (flat) | bootstrap.js 6.2 (flat,
< 8.00 ceiling holds) | sharecurve.js 5.95 (+0.30, predicted +0.05) | ramprobe-workerkeys.js 1.6
```
(saved: `logs/ramcheck-result-phase13-first-attempt.json`, `-second-attempt.json`, and the current
`logs/ramcheck-result.json`)

**Good news buried in this:** every flat row is genuinely flat (no S10 `+0.40GB` phantom-charge
contingency fired), and the probe's **1.60GB** reading settles the BACKLOG "RAM-analyzer
identifier hygiene" open question — `WORKER_SCRIPTS`' `hack`/`grow`/`weaken` keys are **not**
phantom-charged. Both are real, useful, confirmed results from this session.

---

## Where we're stuck

Two rows are off from the spec's predicted delta, by the exact same magnitude (0.25GB) in both
directions:
- `launchmonitor.js`: **−0.40GB** actual vs. **−0.65GB** predicted (still an improvement, just
  smaller than expected).
- `sharecurve.js`: **+0.30GB** actual vs. **+0.05GB** predicted (the capacity-report bug fix still
  ships correctly; it just costs more RAM than expected).

Both discrepancies trace to the same 0.25GB — exactly the cost of the five port-opener functions
(`ns.brutessh`/`ftpcrack`/`relaysmtp`/`httpworm`/`sqlinject`, 5×0.05GB) that live inside
`hosts.js`'s `tryRoot`. The theory was that these were leaking into every importer of `hosts.js`
regardless of whether they actually call `tryRoot`. **Two different code-shape fixes were tried
and neither changed the number at all** (confirmed via fresh dev-server restarts + full resyncs
each time, not stale-cache artifacts):

1. Moved the `PORT_OPENERS` array from module-top-level into a local `const` inside `tryRoot`
   (commit `d74fd45`) — no change.
2. Replaced the closures-in-an-array pattern (`{ file, open: (ns, host) => ns.brutessh(host) }`)
   with a plain string array + a named `openPort(ns, file, host)` switch function (commit
   `efcb0a2`) — no change.

**What was ruled out along the way:** a side-by-side manual RAM accounting (every `ns` call in
`launchmonitor.js`'s old/new code paths, costs verified against `markdown/*.md`, not assumed) fully
explains the *old* 3.85GB and the *predicted* 3.20GB-minimum for a perfectly-pruned `listHosts`-only
import — but not the actual 3.45GB. A comparison against `connect.js` importing `findPath` from
`common.js` (which sits alongside an unused sibling export, `workerRamCosts`, referencing
`ns.getScriptRam`) shows `connect.js` does **NOT** pick up that unused sibling's cost — so "some
exports leak, some don't" is empirically real, but *why* `hosts.js`'s case differs from
`common.js`'s case is not understood. Digging further would mean reading Bitburner's actual RAM
static-analysis source, which `CLAUDE.md` rules out ("don't read game source to shortcut the
puzzle").

**Decision (Kenneth, this session): stop here rather than attempt a third fix.** This is a RAM
*prediction* accuracy issue, not a correctness bug — every actual behavior fix (`launchmonitor.js`'s
read-only correctness, `sharecurve.js`'s double-count fix) works and ships either way.

---

## What's left

1. **Decide how to close the RAM-discrepancy question** (not decided yet — pick up next session):
   - Option A: accept the actual numbers, update `phase-13-consolidation.spec.md`'s RAM-gate table
     and BACKLOG's "RAM-analyzer identifier hygiene" item with the real deltas + the two failed
     theories as a documented open mystery, and move on.
   - Option B: one more diagnostic — e.g. moving `tryRoot`/`openPort` into a wholly separate file
     from `listHosts` (not just a different scope within the same file), to test whether the leak
     is truly per-*file*, not per-scope. No guarantee it resolves it; would be a third attempt.
2. **Live validation, still not run** (needs Kenneth's in-game session, `npm run dev` currently
   running and connected to the branch's — now `master`'s, post-merge — code):
   - ≥15-minute `daemon.js` session, `npm run verify:log` green, transactions log income unchanged
     in character.
   - Smoke-run `launchmonitor.js`/`connect.js`/`cloudcosts.js`/`sharecurve.js` (last one only if
     Formulas.exe is owned).
   - Confirm the rooted-host notice now carries a `[HH:MM:SS]` timestamp prefix, next time a
     server becomes newly rootable.
3. **Close-out cleanup**, once the above is settled:
   - In-game: `rm cleanup-old-daemon-log-temp.js` (check `ls home` first), `rm
     ramprobe-workerkeys.js`.
   - Remove `src/ramprobe-workerkeys.js` from the repo (`git rm`) — its job (the E-matrix probe)
     is done; the 1.60GB reading is already recorded above.
   - Graduate `phase-13-consolidation.features.md` + `phase-13-consolidation.spec.md` from the
     repo root to `docs/phases/`.
   - Move BACKLOG's "Consistency consolidation" entry to a dated `docs/phases/CHANGELOG.md` entry;
     update the priority-order note (item 1 of 2 done); correct the stale "(Correctness fix, not a
     RAM fix...)" parenthetical if it survives the move.
   - Record the settled RAM-discrepancy decision (Option A or B above) in BACKLOG's RAM-analyzer
     item.

## State at handoff

- `master`: Phase 13's three commits merged in, pushed to `origin/master` (confirm before
  resuming — see below), tree clean.
- `npm run dev` running, connected, currently serving `master`'s post-merge code (which is
  identical to the branch's final state).
- `npm test`: 250/250 green.
- **Do not treat this phase as shipped** — the ship gate (`CLAUDE.md`) requires the RAM gate and
  a live daemon session to pass before merge is normally allowed; this merge happened as a
  deliberate exception at Kenneth's explicit instruction, to reach a stopping point, not because
  validation passed. Finish "What's left" above before calling Phase 13 done.
