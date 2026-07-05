# Refactor spec: timed HWGW batcher (Phase 2 of 2)

## Context

Work in `C:\Users\admin\bitburner-scripts`. Phase 1 (see `phase-01-batcher-refactor.md`) built a central-allocation daemon: `daemon.js` + `hosts.js` + `targets.js` + `allocator.js`, with looping single-action workers (`hackloop.js`, `growloop.js`, `weakenloop.js`). It works, but loop workers waste effect: hacks land against elevated security, grows land against partial money, and the three actions constantly disturb each other.

**Phase 2 replaces the loops with precisely timed one-shot batches.** A batch is four one-shot jobs fired at a *prepped* target (min security, max money), timed so they land milliseconds apart in a fixed order:

1. **hack** lands — steals a fraction of max money, raises security
2. **weaken 1** lands — removes the hack's security increase
3. **grow** lands — restores the stolen money, raises security
4. **weaken 2** lands — removes the grow's security increase

Every hack and grow therefore lands against min security and (for hack) max money — maximum effect per thread. Batches are launched continuously so many are in flight at once.

Phase 1 was shaped for this: `allocator.js` is the module that gets replaced (by a batch scheduler), the workers' second argument slot was reserved (it becomes the timing delay), and `daemon.js`'s exec/kill plumbing, `hosts.js`, and `targets.js` largely survive.

## Ground rules

- Same as Phase 1: verify every NS API call against the docs in `markdown\` (e.g. purchased servers are `ns.cloud.*`, number formatting is `ns.format.number`). Do not rely on memorized signatures. Do not search the web or reference community batcher implementations — design from the API docs and this spec.
- **No Formulas.exe.** Do not use `ns.formulas` anywhere. All thread/duration math comes from the basic analysis functions (`hackAnalyze`, `growthAnalyze`, `hackAnalyzeSecurity`, `growthAnalyzeSecurity`, `weakenAnalyze`, `getHackTime`/`getGrowTime`/`getWeakenTime`) evaluated against *current* state, padded with the safety buffers below. Predictions will be wrong when the player levels up mid-flight — the design must tolerate that (see drift handling), not try to prevent it.
- Worker scripts stay tiny: nothing beyond their single action, no shared imports.
- Check the docs for per-action caveats before writing math: whether splitting grow threads across processes changes total effect, whether hacks can fail (`hackAnalyzeChance`) and what a failed hack does to security. Note findings in code comments.
- Handle failure paths: `ns.exec` returning pid 0, no host large enough for a batch job, zero eligible targets, zero prepped targets.

## Batch timing mechanism

`ns.hack`/`ns.grow`/`ns.weaken` accept an options object (`BasicHGWOptions`, see `markdown\bitburner.basichgwoptions.md`) with `additionalMsec`: extra milliseconds added to the action's duration. This is the timing tool — **workers never sleep manually**.

All four jobs of a batch are launched back-to-back in the same cycle. Each job's completion time is `launch + baseDuration + additionalMsec`, so to make them land in order:

- Sample `hackTime`, `growTime`, `weakenTime` once, together, at launch (weaken is the longest — verify in docs).
- Landing offsets: hack +0, weaken 1 +1×`SPACING_MS`, grow +2×`SPACING_MS`, weaken 2 +3×`SPACING_MS`.
- Each job's `additionalMsec = (weakenTime − ownDuration) + landingOffset`.

Launch a new batch every `BATCH_INTERVAL_MS` (must be ≥ 4×`SPACING_MS` so consecutive batches' landings never interleave). Maximum useful batches in flight ≈ `weakenTime / BATCH_INTERVAL_MS`; RAM may cap it lower.

## Files

**`hack.js`, `grow.js`, `weaken.js`** (replace `hackloop.js`, `growloop.js`, `weakenloop.js`)
One-shot workers. `args[0]` = target hostname, `args[1]` = additionalMsec (the slot Phase 1 reserved). Perform the single action once with `{ additionalMsec }` and exit. No loop, no decision logic, minimal RAM.

**`targets.js`** — extend, don't restructure
Keep eligibility, ranking, thread plans, and current-state reporting as-is. Add per-target durations (`hackTime`, `growTime`, `weakenTime`). Still runnable standalone with a useful summary table.

**`hosts.js`** — unchanged.

**`scheduler.js`** (replaces `allocator.js`)
Pure functions over plain data, like `allocator.js` was — no `ns` calls inside the planning math. Responsibilities:

- **`planBatch(target, ramCosts)`** — the four jobs for one batch: script, threads, additionalMsec each. Thread math per batch (recomputed at every launch from current durations/analysis, since state shifts):
  - hack threads to steal `HACK_FRACTION` of max money at min security;
  - grow threads to regrow from (1 − `HACK_FRACTION`), multiplied by `GROW_BUFFER` — the pad that absorbs a mid-flight level-up making the hack steal more than planned;
  - weaken 1 sized to the hack's security increase, weaken 2 to the grow's, both multiplied by `WEAKEN_BUFFER`.
- **`planPrep(target, hosts, ramCosts)`** — one-shot weaken (then grow, then the grow's counter-weaken) jobs sized to move an unprepped target to min security / max money, capped by available RAM. This replaces Phase 1's prep heuristic with an explicit prep phase built from the same one-shot workers (`additionalMsec` 0 or small — prep needs no precise ordering beyond weaken-before-grow-before-weaken landing order).
- **Host assignment.** Each of a batch's four jobs runs as a *single process on a single host* — never split a batch job across hosts (protects against the grow-splitting caveat and keeps timing uniform). If no host can fit a job, scale the whole batch down (recompute with a smaller hack fraction) rather than splitting; if even a minimal batch doesn't fit, skip batching this cycle and log it. Prep jobs *may* split across hosts, subject to the per-thread caveats checked above.

**`daemon.js`** — same skeleton, new cycle
Still runs forever on home; keep the startup (`killscripts.js` once, `purchasescripts.js` once, tail window), the scp of worker files to hosts, and the tprint-on-rare-events convention. The loop changes:

1. Refresh hosts and targets every `CYCLE_MS` as before (rooting, new purchases, level-ups picked up automatically).
2. Pick the top-ranked target as **the batch target**. Read its *live* security/money each iteration:
   - within `DRIFT_SEC_EPSILON` of min security and above `DRIFT_MONEY_FRACTION` of max money → **prepped**: keep the batch pipeline full, launching one batch per `BATCH_INTERVAL_MS`;
   - otherwise → **drifted** (or never prepped): launch no hack-containing batches; dispatch prep jobs instead. In-flight jobs are never killed — they finish on their own and drift detection absorbs whatever they do.
3. Spend leftover RAM (after the batch target's pipeline is full) prepping the next targets in rank order, so they're ready if rankings shift.
4. The daemon's inner sleep is `BATCH_INTERVAL_MS`, not `CYCLE_MS` — batches launch far more often than hosts/targets refresh.
5. RAM accounting is now trivial: one-shot jobs occupy RAM only while running, so live free RAM is the truth. Phase 1's `reclaimRam`/`diffAllocation` machinery dies with the loops — remove it, don't port it.
6. Log per iteration: batch target, prepped/drifted status, batches in flight (count via `ns.ps` matching worker script + target), RAM utilization %, and batches skipped for RAM.

**`killscripts.js`, `purchasescripts.js`, `upgradehomeram.js`, `connect.js`** — unchanged.

## Acceptance criteria

- With the batch target prepped and RAM available, the daemon sustains a continuous stream of batches, and the target's live security/money (read just before each launch) stay inside the drift thresholds the large majority of iterations.
- After a hack-skill level-up causes drift, the daemon stops hacking, re-preps, and resumes batching — automatically, within a few iterations, no restart.
- Leftover RAM demonstrably preps lower-ranked targets while the batch target is being farmed.
- In-flight one-shot jobs are never killed by the daemon; there is no kill-all per cycle.
- Scarcity survival: tiny RAM (no batch fits → prep-only), zero eligible targets, zero prepped targets — sensible logs, no crashes.
- `hosts.js` and `targets.js` still run standalone with useful summaries; `scheduler.js`'s planning functions remain pure and separated from exec plumbing.

## Tunables (top-of-file consts)

`HACK_FRACTION = 0.25`, `SPACING_MS = 200`, `BATCH_INTERVAL_MS = 1000`, `GROW_BUFFER = 1.25`, `WEAKEN_BUFFER = 1.1`, `DRIFT_SEC_EPSILON = 1`, `DRIFT_MONEY_FRACTION = 0.9`, `HOME_RESERVE_GB = 32`, `CYCLE_MS = 10000`.

## Out of scope (later phases)

Port-based job tracking (workers reporting completion, a per-job ledger, cancelling broken batches), Formulas.exe-based exact math, and batching multiple targets simultaneously. Do not build any of these now, but keep the door open: the scheduler stays a pure isolated module, and workers stay dumb enough that adding a "report to port on exit" line later touches nothing else.
