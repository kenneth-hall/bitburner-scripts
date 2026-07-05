# Phase 12 spec: targeting — root-access eligibility fix (+ ratio→priority fold-in)

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner
watcher that syncs into the game). Requirements: `targeting-phase12-features.md`.

**The bug this phase fixes (live on the current save, 2026-07-05):** after a fresh
augmentation install (no TOR router, no augments purchased, only the port-opener programs that
survived the reset), the game's Recent Errors tab floods with runtime errors from `weaken.js`
and `grow.js` (`L11@main`, the `ns.weaken`/`ns.grow` call): `Cannot weaken <server> because
you do not have root access`, and the grow equivalent — observed against computek, the-hub,
crush-fitness, johnson-ortho, omega-net, phantasy, and silver-helix, with per-server counts in
the tens-to-hundreds.

**Root cause:** `targets.js`'s `getTargets()` eligibility filter checks "not purchased", "has
money", and "`requiredHackingLevel < myHackLevel / 2`" — but never `ns.hasRootAccess(server)`.
Post-reset, hacking level outruns port-opener ownership: servers needing more openers than we
own pass the level filter, `hosts.js` can't nuke them, they enter the target list, and
`daemon.js` prep-dispatches grow/weaken at them every tick. Each worker crashes at its `ns`
call and is re-dispatched next tick — error counts climb continuously and the crashed workers'
RAM is wasted instead of feeding real targets. Pre-reset the bug was masked: everything that
passed the level filter was already rooted. (No `hack.js` errors appear because an unrooted
target never reaches the prepped state — only prep jobs fire at it. That detail confirms the
diagnosis.)

**Fold-in:** BACKLOG's "targetsmonitor ratio column → actual priority metric" quick-win is
fully decided there and explicitly earmarked for "whichever phase is already touching those
files" — that's this phase (work item 2).

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked **[code]**.
Kenneth does everything marked **[live]**. No [live] step requires editing code. No reset is
required for any validation in this phase.

## Ground rules

- `CLAUDE.md` rules apply in full: verify every NS API signature/RAM cost against `markdown/`
  before use (do not trust this spec's numbers), no community solutions, don't read game
  source, no spoilers beyond current progression.
- **Identifier hygiene (Phase 9's lesson):** no new identifier, property name, or object-literal
  key may exactly match an NS API function name unless it is a real `ns` call. Check
  `isEligibleTarget`, `rooted`, and any other new name against `NetscriptDefinitions.d.ts`.
  (`ns.hasRootAccess` itself appears in `targets.js` only as the real call — that charge is the
  point, not a phantom.)
- Pure decision logic lives in exported ns-free functions, unit-tested mock-free in `test/`
  (vitest), following `test/`'s existing patterns.
- **Transactions log: N/A this phase** — nothing here spends money, so no `recordTransaction`
  call sites and no `VALID_EXPENSE_SOURCES` change. Stated so the omission is visibly
  deliberate, not forgotten.
- Same worktree/branch conventions as prior phases (suggest `worktree-phase12-targeting`);
  local-first, push/merge after live validation per the standing git authorization (or hand the
  branch to Kenneth if running as a background job, per `CLAUDE.md`'s exception).

## Spec-stage decisions

The features file left implementation shape to the spec. Resolved here; the reviewer should
treat these as decided-with-rationale:

- **S1 — pure predicate, purchased-check stays outside.** New exported ns-free predicate in
  `src/targets.js`:

  ```js
  export function isEligibleTarget({ rooted, maxMoney, requiredHackingLevel, myHackLevel })
  ```

  returning `rooted && maxMoney > 0 && requiredHackingLevel < myHackLevel / 2` — the existing
  money/level semantics preserved **exactly** (strict `<` against half the level, `> 0` money),
  with root as the one new condition. The purchased-server exclusion stays as the existing
  early `continue` in `getTargets` (set-membership context, not server-intrinsic eligibility).
  The param is named `rooted` (not `hasRootAccess`) for identifier hygiene.
- **S2 — no worker-side guard, no daemon-side filter, no rooting in `targets.js`** (features
  Decisions 2–3 and rejected alternatives). Workers stay minimal — script RAM is charged per
  thread, so +0.05 GB/thread fleet-wide to guard an unreachable condition is a real cost for
  nothing. The eligibility definition lives where eligibility is defined, so `daemon.js`,
  `targetsmonitor.js`, and standalone `targets.js` runs all inherit it with **zero `daemon.js`
  code change**.
- **S3 — standalone-run lag is accepted and documented.** `daemon.js`'s `refreshCycle()` calls
  `getHosts()` (which nukes anything newly rootable) before `getTargets()`, so the daemon
  always filters against post-rooting state. A standalone `run targets.js` sees current root
  state, which can lag one daemon cycle (≤ `CYCLE_MS` = 10 s) for a newly-rootable server.
  Root is monotonic within a session (only a reset removes it, and a reset kills all scripts),
  so there is no reverse window. One sentence in `getTargets`'s doc comment covers this.
- **S4 — the fold-in implements BACKLOG's three sub-decisions verbatim** (work item 2), with
  the post-Phase-7 legend wording ("the daemon's active *set* can differ"). The `ratio`-field
  consumer set was grep-confirmed 2026-07-04 (`targetsmonitor.js:57`, `targets.js:147` only;
  `sampling.js`'s sole other `ratio` is an unrelated local, ~line 385 — the reviewer
  re-verified this 2026-07-05); **re-grep at implementation** — if a
  third consumer has appeared since, keep the field, ship the display changes only, and flag
  it in the handoff.

## Design

### Work item 1 — root-access eligibility in `getTargets` [code]

`src/targets.js`:

- In the per-server loop, after the purchased-server `continue`, read
  `ns.hasRootAccess(server)`, `ns.getServerMaxMoney(server)`, and
  `ns.getServerRequiredHackingLevel(server)` into locals and replace the two existing inline
  checks with one `isEligibleTarget({...})` call (skip the server when false). `maxMoney` and
  `reqLevel` remain in scope for the plan/score math below, unchanged.
- Add `isEligibleTarget` per S1, with a doc comment stating the three conditions and why
  purchased-exclusion isn't part of it.
- Update `getTargets`'s doc comment: the eligibility description ("has money,
  RequiredHackingLevel under half the player's hacking level") gains "root access", plus S3's
  one-sentence ordering/lag note.

### Work item 2 — ratio → priority (BACKLOG fold-in) [code]

- `src/targetsmonitor.js`:
  - Replace the `ratio ${ns.format.number(t.ratio)}` column with
    `priority ${t.score.toExponential(2)}` (the same rendering `targets.js` already uses for
    score, so the two displays read consistently).
  - Fix the misleading `->` marker: update the inline comment, and print a one-line legend
    under the header, e.g. `-> = top-ranked by score (the daemon's active set can differ under
    hysteresis)`. Do not attempt to display the daemon's actual member set — the monitor can't
    see it without coupling to the daemon, which is the exact trap the BACKLOG entry rules out.
- `src/targets.js`:
  - `main()`: drop the `(ratio ...)` parenthetical from the summary line (score is already
    printed first).
  - `getTargets()`: remove the `ratio` field from the pushed target objects (subject to S4's
    re-grep). Note the schema change in the comment block above `targetsSummaryFile` — exported
    `targets-summary-*.json` files no longer carry `ratio` (Phase 12).

### Work item 3 — tests [code]

New `test/targets.test.js`, importing `isEligibleTarget` from `../src/targets.js` (the module's
other imports are ns-free at import time, same as existing suites):

- all conditions met → `true`;
- `rooted: false`, everything else eligible → `false` — **the Phase 12 regression case**;
- `maxMoney: 0` → `false`;
- boundary: `requiredHackingLevel === myHackLevel / 2` exactly → `false` (strict `<`
  preserved); just under half → `true`;
- documented edge: `myHackLevel: 1, requiredHackingLevel: 1` → `false` (the known
  "no eligible targets at level 1" behavior, encoded so it's visibly intentional).

Existing suites untouched and green (`npm test`, 184 passing pre-phase).

### Work item 4 — BACKLOG bookkeeping [code]

- Move the "targetsmonitor ratio column → actual priority metric" Next Up item to Done
  (folded into Phase 12, dated), per its own instructions.
- Add a Done entry for Phase 12 itself when complete (root cause, fix, validation results).
- Add the root-access bug as a dated note in the Done entry rather than a new Ideas item —
  it's fixed, not tracked. (The dev-loop observability umbrella in Ideas gains one sentence
  citing this incident as a motivating example, nothing more.)

## RAM gate [code, measured live via `mem` or `getScriptRam`]

Before/after on the same build, recorded in the handoff:

| script | baseline | expected after | why |
|---|---|---|---|
| `daemon.js` | 16.30 GB | **16.30 GB (flat)** | zero code change; already reaches `ns.hasRootAccess` via `hosts.js`, and Phase 9 confirmed once-per-name charging |
| `targets.js` | 12.65 GB | **12.70 GB (+0.05)** | newly reaches `ns.hasRootAccess` |
| `targetsmonitor.js` | measure first | **+0.05 vs its own baseline** | imports `targets.js`, which newly reaches `ns.hasRootAccess` |

Any other delta (especially on `daemon.js`) → stop and run the identifier-hygiene hunt before
proceeding (Phase 9/11's `mem`-trace method).

## Live validation [live]

On the current save, no reset needed. `npm run dev` running (Remote API auto-reconnects; quick
check after a restart, no manual reconnect expected).

1. Restart `daemon.js`. Note the Recent Errors tab's state at restart time.
2. **Error flood stops:** over a ≥10-minute window, zero new `Cannot weaken/grow ... root
   access` errors appear. (Existing entries may linger in the tab; only new ones count.)
3. **Target list is rooted-only:** the seven named servers no longer appear in
   `targetsmonitor.js`'s dashboard or `daemon.js`'s target count; the monitor shows the
   `priority` column and the new marker legend.
4. `run targets.js` once: the exported `targets-summary-<epoch>.json` lists only rooted
   servers, carries no `ratio` field, and its summary line has no `(ratio ...)` parenthetical.
5. `npm run verify:log` green against the session's exported daemon log (no daemon-log schema
   change this phase, so this is a regression check, not a new checker).
6. **Opportunistic, non-gating:** whenever Kenneth next hand-buys TOR/a port opener, confirm
   newly-rootable servers get rooted by the next daemon cycle and appear via the existing
   `INFO: new target <server>` tprint. This validates the filter opens back up as capability
   grows; it needs no code and no scheduled session.

## Acceptance criteria

- `npm test` green: all pre-existing tests plus the new `test/targets.test.js` cases.
- RAM gate table recorded with `daemon.js` exactly flat at 16.30 GB.
- Live steps 1–5 pass as described (step 6 is a follow-up observation, not a gate).
- BACKLOG updated per work item 4.

## Files touched

`src/targets.js`, `src/targetsmonitor.js`, `test/targets.test.js` (new), `BACKLOG.md`,
plus this spec and `targeting-phase12-features.md` at repo root.

**Deliberately untouched:** `daemon.js` (inherits the fix via `getTargets` with zero code
change — the RAM gate proves it), `hosts.js` (rooting behavior is correct and stays the sole
rooting owner), `scheduler.js`, `sampling.js`, all workers (`hack.js`/`grow.js`/`weaken.js`/
`share.js`), `procureprograms.js`/`resourcemanager.js`/`cloudmanager.js`, `translog.js` and
the transactions checker (nothing spends), `vite.config.ts` (no new exported files).
