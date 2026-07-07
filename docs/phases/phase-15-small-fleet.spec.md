# Phase 15 spec: small-fleet batching floor — fix the zero-member income stall

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner
watcher that syncs into the game). Requirements: `phase-15-small-fleet.features.md` — read its
Diagnosis section first; this spec assumes it.

**Why now (live on the current save, 2026-07-06):** the daemon has launched zero workers and
earned $0 since the Jul 5 post-reset handoff (~27 hours). Root cause, confirmed against
exported logs: `pickBatchSet` admits a target only if its **full pipeline cost**
(`pipelineDepth(weakenTime) × batchRamCost`) fits the batch budget, and on the post-reset
940GB fleet (705GB after the share carve) no target's full pipeline fits — cheapest estimate
~721GB (n00dles), rest 6,000–1,200,000 GB. All four admission passes seat nobody, every tick,
forever; the bootstrap-shrink path that could fit a single smaller batch is unreachable
because it runs inside the member loop. The stall is also completely silent (`memberCount: 0`
snapshots and nothing else).

Two code changes fix it, one makes it loud:

1. **Cap admission depth by affordability** — a partial pipeline earns proportionally less
   but earns; full depth is a throughput ceiling, not a minimum viable unit.
2. **Floor rule in `pickBatchSet`** — a non-empty candidate list must always seat at least
   one member; the existing shrink machinery does the actual fitting.
3. **Observability** — `candidateCount` in snapshots, a WARN when the impossible state
   recurs, and a log-checker rule that fails on it.

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked
**[code]**. Kenneth does everything marked **[live]**. No [live] step requires editing code.

## Ground rules

- `CLAUDE.md` rules apply in full: verify NS API signatures/RAM costs against `markdown/`
  before use, no community solutions, no game-source reading, no spoilers beyond current
  progression.
- **No Singularity calls** (unchanged — this phase adds zero new ns calls of any kind).
- **Transactions log: N/A this phase** — nothing here spends money; no `recordTransaction`
  call sites. Stated so the omission is visibly deliberate.
- **Identifier hygiene (Phase 9's lesson):** new exported names (`cappedPipelineDepth`) and
  new object keys (`candidateCount`) checked against `NetscriptDefinitions.d.ts` — neither
  matches an ns function name. Re-check any name the implementer adds beyond this spec.
- Pure decision logic lives in exported ns-free functions in `scheduler.js`, unit-tested in
  `test/scheduler.test.js` per existing patterns. `daemon.js` changes are plumbing only.
- Worktree/branch conventions as prior phases (suggest branch `phase15-small-fleet`);
  local-first, merge/push only after live validation per the ship gate (this phase has a
  RAM gate and a live step, so Kenneth's in-game validation gates the merge). Commit this
  spec + the features file with the code.
- **Kill+restart the dev server at the start of the RAM-gate step** (standing
  stale-connection workaround), and byte-check `dist/src/*` against the pushed files before
  trusting any gate reading.

## Spec-stage decisions

The features file left four open questions; resolved here — the reviewer should treat them
as decided-with-rationale:

- **S1 — no headroom carve-out on the depth cap.** The cap is
  `floor(batchBudgetGb / ramCost)`, full budget, no 90% discount. Rationale: on a starved
  fleet the lone member *is* the priority; reserve-vs-prep contention is already a
  documented, self-correcting Phase 7 transition dynamic; and the share carve plus
  `HOME_RESERVE_GB` already hold real headroom out of this budget. A discount constant would
  be a tunable nobody has evidence for yet.
- **S2 — floor rule picks by score order, with incumbent stickiness under the existing
  hysteresis.** No "prefer the candidate whose single batch fits" refinement: the score
  formula (`$ × chance / (ramCost × weakenSec)`) already penalizes monstrous batches, and a
  hypothetical mis-pick still makes progress via the shrink loop (down to
  `MIN_HACK_FRACTION`). The stickiness half is load-bearing, not optional — without it the
  floor member flips on every small score jitter (legacy scoring moves as money dips
  mid-batch), abandoning in-flight pipelines; see work item 2 for exact semantics.
- **S3 — `sharePower: 1.00` with 58 live share threads: out of scope, recorded.** Logged as
  a BACKLOG Idea (work item 6), not investigated here. It doesn't interact with the fix:
  share's carve is driven by `SHARE_FRACTION`, not measured power.
- **S4 — automatic share suppression on small fleets: out of scope, recorded.** BACKLOG Idea
  (resource-manager territory). The manual `share-off.txt` marker remains the operational
  lever, and this phase's fix works with the carve in place (the depth cap adapts to
  whatever `batchBudgetGb` is).

## Design

### Work item 1 — `cappedPipelineDepth` in `src/scheduler.js` [code]

New exported pure function next to `pipelineDepth`:

```js
cappedPipelineDepth(weakenTimeMs, ramCostGb, budgetGb)
  = Math.max(1, Math.min(pipelineDepth(weakenTimeMs), Math.floor(budgetGb / ramCostGb)))
```

- `ramCostGb` is always > 0 in practice (every batch has ≥ 1 thread per job); no divide
  guard beyond that assumption, but document it in the doc comment.
- The `max(1, …)` floor means a candidate whose single batch exceeds the budget still prices
  **one** full batch (cost > budget) — it stays honest and unseatable by passes 1–4; seating
  it is work item 2's job, and the shrink loop is what makes it launchable.
- Doc comment states the intent: full `pipelineDepth` is the throughput ceiling; this is the
  affordability-capped admission depth (Phase 15).

`daemon.js` step 4 (candidate construction) switches from
`pipelineDepth(sample.steadyWeakenTime)` to
`cappedPipelineDepth(sample.steadyWeakenTime, ramCost, batchBudgetGb)` — one line. The capped
`depth` then flows unchanged into `pipelineCostGb`, admission, the reserve carve,
`member.depth` display, and snapshot fields, all of which read the same candidate object.
Known approximation (comment at the call site): the cap is computed against the full batch
budget, not the remaining budget at seat time — the passes' remaining-budget walk still
bounds the aggregate, and skip-and-continue handles mid-list misfits, same spirit as Phase
7's fleet-total-vs-single-host note.

### Work item 2 — floor rule in `pickBatchSet` (`src/scheduler.js`) [code]

New pass between pass 2 and pass 3, active only when `seated.length === 0 &&
candidates.length > 0` (with the work-item-1 cap in place upstream, that means not even one
full-fraction batch fits the budget). Semantics, exactly:

1. Let `incumbentFloor` = the highest-scored candidate in `incumbentSet` (candidates are
   already score-sorted, so: first match), or null.
2. Let `challenger` = `candidates[0]` (highest-scored overall).
3. Seat `incumbentFloor` **unless** `challenger` differs from it, is `prepped`, and
   `challenger.score >= incumbentFloor.score * hysteresis` — the same two displacement gates
   as pass 3 (prepped gate + hysteresis), applied to the one floor seat. No incumbent
   candidate at all → seat `challenger`.
4. Bookkeeping invariant — **no server may appear in both `members` and `exits`**:
   - The floor-seated server's pass-1 `"unaffordable"` exit entry (pushed before the floor
     pass ran) is removed from `exits`.
   - If the challenger displaced `incumbentFloor`, `incumbentFloor`'s pass-1
     `"unaffordable"` entry is **replaced** by reason `"displaced"`, and
     `displacement = { entrant: challenger.server, displaced: [incumbentFloor.server] }`
     is set (pass 3's one-per-tick displacement slot; the floor pass and pass 3 are
     mutually exclusive by construction — pass 3 requires a seated incumbent to evict and
     can't fire from an empty seating, and once the floor seats someone, `remaining` has
     gone negative so pass 3's fit checks can't seat a second member).
   - Other unaffordable incumbents' exits stand unchanged.
5. `remaining -= pick.pipelineCostGb` (goes negative; nothing downstream reads `remaining`
   after the passes, but keep the arithmetic consistent).

Implementation notes the reviewer flagged as regression-prone (address exactly):

- **`displacement` scoping:** `let displacement = null` currently sits below where the
  floor pass goes (`scheduler.js:330`). Hoist that declaration above the floor pass; both
  the floor pass and pass 3 *assign* to it — no redeclaration. Work item 4 asserts a
  floor-pass displacement survives into the returned result.
- **Pass 4 interaction:** after a floor-pass displacement, `displacement` is non-null so
  the pass-4 refill runs, and the floor-displaced incumbent is *not* in `justEvicted`.
  That is safe only because `remaining` has gone negative (nothing can re-seat) — state
  this in a comment at the floor pass, and pin it with a unit assertion that the displaced
  server is not re-seated.

Downstream `daemon.js` behavior needs **no changes** for the floor member: prepped → the
existing empty-pipeline `allowShrink` path halves the hack fraction until a batch fits some
host; unprepped → the existing stage-1 prep path. The reserve carve with an over-budget
`pipelineCostGb` zeroes the waterfall pool — acceptable and self-limiting (on a fleet this
starved there is nothing better for the waterfall to do; the carve recomputes every tick).

### Work item 3 — observability (`src/daemon.js`, `src/scheduler.js` untouched) [code]

- **`snapshot` events gain `candidateCount`** (the step-4 `candidates.length`), placed next
  to `memberCount`. Additive schema change; the daemon rewrites the whole log file on flush,
  so post-restart logs are uniformly new-schema (same convention as the Phase 9 rename —
  note it in the log header comment).
- **Stall WARN (tail window, every tick it holds):** when `result.members.length === 0 &&
  candidates.length > 0`, `ns.print` a WARN naming the cheapest candidate pipeline cost vs.
  `batchBudgetGb`. After work items 1–2 this state is unreachable, which is the point — any
  sighting is a regression alarm. (`ns.print`, 0GB; no tprint spam — it would fire every
  tick.)
- **`FLOOR` tag on the member display line** when `member.pipelineCostGb > batchBudgetGb`
  (true iff the member was floor-seated, since capped costs otherwise fit the budget) — so
  a live tail window shows the floor rule working without log spelunking.
- **`floor: boolean` on each snapshot member entry**, derived from the same predicate as
  the display tag (`pipelineCostGb > batchBudgetGb` — no scheduler API change, no input
  mutation). This makes the floor state self-describing in the log, which work item 5's
  amended budget invariant depends on. Additive schema change, noted in the log header
  comment alongside `candidateCount`.

### Work item 4 — unit tests (`test/scheduler.test.js`) [code]

- `cappedPipelineDepth`: uncapped when the full pipeline fits; capped to
  `floor(budget/ramCost)` when it doesn't; clamps to 1 when even one batch exceeds the
  budget; exact-fit boundary (`budget === depth × ramCost` → full depth).
- `pickBatchSet` floor cases (all asserting the members/exits-disjoint invariant):
  - nothing fits, no incumbents → exactly the top-scored candidate seated, `exits` empty,
    `displacement` null;
  - nothing fits, top candidate was the incumbent → stays seated, **no `"unaffordable"`
    exit for it**, lower incumbents (if any) still exit;
  - challenger above the incumbent but under hysteresis → incumbent keeps the floor seat;
  - prepped challenger at/over hysteresis → displaces; exit reason `"displaced"`;
    `displacement` populated **in the returned result** (pins the hoisted-declaration
    scoping) and the displaced server is **not re-seated by the pass-4 refill**;
  - unprepped challenger over hysteresis → incumbent keeps the seat (prepped gate);
  - floor never fires when any candidate fits (a fitting low-scored candidate seats via
    pass 2 and the over-budget high-scorer is simply not seated — existing behavior pinned);
  - empty candidates → unchanged existing behavior (all incumbents exit, no floor seat).
- Existing suite untouched and green: **250 tests pre-phase**; all still passing plus the
  new cases.

### Work item 5 — log-checker rules (`test/verify-log-checks.js` + fixtures) [code]

Two changes to the daemon-log checker family (reviewer BLOCKER: the second one is
mandatory, not optional — without it the floor rule firing live hard-fails the *existing*
checker and the "verify:log green" acceptance criterion contradicts the design):

- **New stall rule:** a violation for every `snapshot` where
  `candidateCount > 0 && memberCount === 0`, plus a schema check that `candidateCount` is a
  non-negative number ≥ `memberCount` on every snapshot (members are always drawn from
  candidates, floor rule included).
- **Amend the existing `checkBudgetInvariant`** (`verify-log-checks.js:69-82`, asserted via
  `verify-log.test.js`): members with `floor: true` are excluded from the
  `Σ pipelineCostGb ≤ batchBudgetGb` sum. Two new consistency violations replace the blind
  exemption: (a) a `floor: true` member coexisting with any other member in the same
  snapshot (the floor rule only ever fires into an empty seating, and negative `remaining`
  blocks further seats); (b) a `floor: true` member whose `pipelineCostGb ≤ batchBudgetGb`
  (flag inconsistent with the defining predicate).

Fixture tests in the existing `test/checker-fixtures.test.js` style: passing log (no
floor), passing log (floor member, over-budget, alone — the reconciled invariant's proof),
stall violation, member-exceeds-candidate violation, floor-with-sibling violation,
inconsistent-floor-flag violation, missing-field violation. Runs under `npm run verify:log`
via the existing wiring (confirm at implementation whether the new rule slots into
`verify-log.test.js`'s check list or needs its own export from `verify-log-checks.js`,
matching how the share-cap and budget invariants are registered).

### Work item 6 — BACKLOG/CHANGELOG bookkeeping [code]

- BACKLOG In Progress entry (already added 2026-07-06): update to "spec stage done" with a
  link to this file when this spec lands, then move a dated condensed entry to
  `docs/phases/CHANGELOG.md` at close-out, graduating both phase docs to `docs/phases/`.
- Add two BACKLOG Ideas per S3/S4: "investigate sharePower 1.00 with live share threads" and
  "auto-suppress share below a fleet-size/income floor (resource-manager customer)".

## RAM gate [code, via `ramcheck.js` → `logs/ramcheck-result.json`]

Kill+restart the dev server first, byte-check `dist/src/*` against the working tree, then
`run ramcheck.js daemon.js targets.js targetsmonitor.js bootstrap.js`:

| script | baseline (logs/ramcheck-result.json, 2026-07-06 05:51) | gate |
|---|---|---|
| `daemon.js` | 16.30 GB | **exactly flat** — this phase adds no ns calls (`candidates.length`, `ns.print` 0GB) |
| `targets.js` | 12.70 GB | exactly flat — imports `scheduler.js`; new pure export must charge nothing |
| `targetsmonitor.js` | 12.70 GB | exactly flat — same import-surface canary |
| `bootstrap.js` | 6.20 GB | exactly flat — imports `scheduler.js` constants |

Any delta is a bust → identifier-hygiene hunt (Phase 9/11's `mem`-trace method) before
proceeding; a surviving bust reopens work item 1's placement (move `cappedPipelineDepth`
into `daemon.js` as a private helper — losing direct unit-testability, so only as fallback).

## Live validation [live]

`npm run dev` running (restart it first per the standing workaround). Current save, 940GB
fleet, legacy math.

1. **(Optional, before the code lands — the features file's mitigation):**
   `nano share-off.txt`, save → confirms the share carve releases within a tick
   (`share: OFF` in the daemon tail). Independent of the fix; delete the marker afterward
   if the 25% share carve should resume, or keep it while `sharePower` reads 1.00.
2. After merge/push syncs: **note current player cash**, then restart `daemon.js` (kill +
   `run daemon.js`, or let `killscripts.js` handle the old instance via a plain
   `run daemon.js` — either is fine).
3. **Within ~2 ticks:** tail shows ≥ 1 member line (expected: a low-tier target at a capped
   depth; `FLOOR` tag only if not even one batch fits — not expected at 940GB with share
   off, plausible with share on). `INFO: <server> entering active set` tprints once.
   Expectation note: the immediate-batch shape below assumes the seated member is already
   prepped, which the diagnosis confirmed for the current save; a DRIFTED member preps
   first (displayed, not logged as an event) and batches follow within ~a weakenTime.
4. **Within a few minutes:** `last launch:` line advancing with `LANDED` statuses; player
   cash climbing (compare against the step-2 reading — this in-game observation is the
   primary income evidence; `batch` events' `money.current` is the *target server's*
   money, which oscillates by design and must not be used for this).
5. Export logs (the 5-minute auto-download, or press `d`): `logs/daemon-batch-log.json` now
   contains `enter` and `batch` events; snapshots show `memberCount ≥ 1` and carry
   `candidateCount`. Report the first post-restart snapshot's
   `memberCount`/`candidateCount`/`utilizationPct` back for the phase record.
6. `npm run verify:log` green against the exported log — including the amended budget
   invariant if the floor fired (a `floor: true` member in the snapshots), and the new
   stall rule passing on a real log with members. The proof that the stall rule *catches*
   the bug lives in work item 5's fixtures (the old stalled log lacks `candidateCount`
   entirely, per the schema convention — no manual old-log surgery).

## Acceptance criteria

- `npm test` green: 250 pre-existing + work item 4's new cases, zero failures.
- `npm run verify:log` green, with the new checker rule exercised by fixtures (stall
  violation fixture fails the rule; passing fixture passes it).
- RAM gate: all four scripts byte-verified against `dist/src/*` and **exactly flat** vs. the
  2026-07-06 baseline, recorded in `logs/ramcheck-result.json`.
- Live steps 2–6 pass as described; the exported post-fix log shows `memberCount ≥ 1`
  snapshots and ≥ 1 `batch` event (assumes the prepped-member state per live step 3's
  note), and player cash increased over the observation window per Kenneth's step-2/step-4
  before/after readings — the in-game reading is the income evidence; no daemon-log field
  measures player cash.
- BACKLOG/CHANGELOG updated per work item 6, staged in the same commits as the work.

## Files touched

`src/scheduler.js` (`cappedPipelineDepth` + floor pass in `pickBatchSet`, hoisted
`displacement` declaration), `src/daemon.js` (one-line depth call swap; `candidateCount` in
snapshots; `floor` flag on snapshot members; stall WARN; `FLOOR` display tag),
`test/scheduler.test.js` (new cases), `test/verify-log-checks.js` (new stall rule +
`checkBudgetInvariant` amendment) + its fixture/registration files, `BACKLOG.md`, plus this
spec and `phase-15-small-fleet.features.md` at repo root until graduation.

**Deliberately untouched:** `targets.js`, `sampling.js`, `hosts.js`, all workers,
`share.js`/share mechanics and `SHARE_FRACTION` (S4), `bootstrap.js`/`bootloop.js` (the
handoff design is sound — the daemon it hands off to just has to be viable at handoff
scale, which is this phase), `resourcemanager.js`, `translog.js` and the transactions
checker (nothing spends), `vite.config.ts` (`daemon-batch-log.json` is already wired),
`package.json`/`vitest*.config.ts`.
