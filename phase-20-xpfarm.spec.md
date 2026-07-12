# Phase 20 spec: XP engine — hack-saturation of surplus fleet RAM

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner
watcher that syncs into the game). Requirements: `phase-20-xpfarm.features.md` — read it first;
this spec assumes it, including the prototype's measured pivot (weaken-fill got only ~1.4×
because XP is granted per operation *completion*, not per GB occupied) and the scope shift to a
**durable BN2+ tool that coexists with an active money economy**, not a one-shot 2500 sprint.

What ships: a production rewrite of `src/xpfarm.js` — an always-on companion that fills the
fleet's *surplus* RAM (whatever the money batcher and share pool leave unclaimed) with
fire-and-forget `hack` workers against the highest-difficulty eligible servers, holding those
servers at minimum security with a minority weaken allocation. Two new one-shot worker files
(`xphack.js`/`xpweaken.js` — see S1), an `xpPool` metric in the daemon's snapshot events, and an
engine-side log export are the observability.

**Regime update (2026-07-12, pre-implementation):** this spec was drafted 2026-07-11 in the
*old* node's idle-fleet endgame (~26.5 PB, ~98% idle, money dead). The BitNode has since been
destroyed and re-entered — we are now **early in the BN1.2 run**, exactly the fresh-node
regime the "durable BN2+ tool" scope was designed for, and the resume trigger fired as
predicted (the XP re-climb is the binding constraint — see CLAUDE.md's current-goal line).
Consequences threaded through this spec where marked: the weaken prototype is **no longer
running** (node destruction killed every process; `src/xpfarm.js` survives only as a dormant
file, so the rewrite-in-place is uncomplicated and there is no live cutover to choreograph),
and the live-validation section's testability notes are inverted — fresh-node coexistence is
now the directly observable case, the idle-endgame extreme is the deferred one.

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked **[code]**.
Kenneth does everything marked **[live]**. No [live] step requires editing code; a failed [live]
check loops back to a [code] fix (constants tuning is a [code] change), as in prior phases.

## Ground rules

- `CLAUDE.md` rules apply in full: NS API signatures/RAM costs verified against `markdown/`, no
  community solutions, no game-source reading, no spoilers.
- **No Singularity calls anywhere in this phase.** (Unchanged by Phase 21's SF4 grant — the
  engine needs nothing Singularity offers; keep it Singularity-free per the hot-path rule.)
- **Transactions log: N/A** — nothing here spends money. Stated so the omission is visibly
  deliberate. (The engine *drains* target servers' money as a side effect of hacking; that is
  not a player spend and records nothing.)
- **The money batcher's behavior is untouched.** `daemon.js` gains one companion-launch line,
  two `getScriptRam` reads into its existing `ramCosts` map, and one additive snapshot field;
  `sampling.js` gains an `xpPool` accumulator that filters XP workers *out* of `byTarget`.
  No change to scheduling, prep, share, skip/shrink, or timing logic. `scheduler.js` gains one
  exported constant. Nothing else in the batcher's import graph changes.
- **Log schema changes are additive only**: `snapshot` events gain `xpPool`; no existing field
  is renamed, removed, or reshaped. `npm run verify:log` gains an `xpPool` shape assertion and
  must otherwise stay green with zero checker-rule changes. **Known pre-existing failure
  (BACKLOG bug, confirmed 2026-07-12):** `test/verify-log.test.js:77`'s `validTypes` set
  lacks `'rooted'`, so any log containing the daemon's existing `rooted` events fails the
  format check — and early-BN1.2 logs *will* contain them (rooting is ongoing on a fresh
  node). Fold the one-line `'rooted'` addition into this phase's `verify-log.test.js` edit
  (work item 8) as a named pre-existing-bug fix — it is a test-file correction for an event
  the daemon already emits, not a rule change.
- **Identifier hygiene (Phase 9/11's lesson):** no new identifier, export, or object key may
  exactly match an ns function/method name. Names this spec assigns — `XP_SCRIPTS`,
  `planXpJobs`, `latestBatcherClaim`, `xpPool`, `XP_RESERVE_FRAC`, `HOLD_WEAKEN_FRAC`,
  `CRUSH_SEC_GAP`, `XP_TOP_N`, `XP_OFF_MARKER`, `XP_LOG_FILE` — are pre-checked clean against
  `NetscriptDefinitions.d.ts`; re-check anything the implementer adds beyond them, and re-run
  the `mem`-trace hunt if the RAM gate surprises (Phase 11's `.exec(` regex collision shows
  method-name collisions count too).
- Pure logic lives in exported ns-free functions, unit-tested per existing patterns
  (`test/*.test.js` house style); ns-touching code stays in `xpfarm.js`'s main loop.
- Branch `phase20-xpfarm` off `master` in this checkout; merge/push only after the full gate
  set per the ship gate. **Kill+restart the dev server at the start of the RAM-gate step**
  (standing rule), byte-check `dist/src/*` before trusting any reading.

## Spec-stage decisions

- **S1 — Dedicated worker filenames `xphack.js`/`xpweaken.js`, overriding features decision 4
  ("reuse existing workers").** The features file marked its decisions "proposed, for spec
  confirmation"; this one doesn't survive contact with `sampling.js`. `inFlightByTarget`
  (`src/sampling.js:188`) uses `ramCosts[proc.filename]` as its membership filter and counts
  **every `hack.js` process as one in-flight batch** against `proc.args[0]`. XP workers reusing
  the batcher's filenames therefore corrupt the batcher's accounting: XP targets appear as
  phantom perpetual "draining" entries, and if an XP target ever coincides with a batch member
  (plausible mid-node, when high-difficulty servers are also good money targets), the member's
  `batchesInFlight`/`commitmentPct` inflate and the skip logic starves it — the prototype does
  this today and only gets away with it because its target isn't currently a member. Distinct
  filenames make the batcher structurally blind to XP workers (unknown filenames are skipped by
  the `ramCosts` filter) and make the `xpPool` metric computable by filename exactly like
  `sharePool`. Cost: two ~10-line files whose per-thread RAM is **identical** to
  `hack.js`/`weaken.js` (same single ns call each — the RAM gate asserts equality), so the
  *intent* of decision 4 (no new RAM) is preserved; only the filename-reuse part is overridden.
- **S2 — "Surplus" is defined mechanically: live free RAM minus a per-host reserve minus the
  batcher's published claim (features decision 1, made concrete).** Three layers, senior to
  junior: (a) whatever is already running (the batcher's and share's in-flight workers are
  simply not free RAM); (b) a per-host reserve `XP_RESERVE_FRAC = 0.05` of maxRam (the
  prototype-proven headroom so the batcher's next-tick launches always have room; home
  additionally keeps `HOME_RESERVE_GB` via `listHosts`, unchanged); (c) the batcher's **unmet
  forward claim**, read from the latest `snapshot` event in `daemon-batch-log.json` (on home,
  `ns.read` is 0 GB): `sum(members[].reserveGb)` (pipeline RAM the batcher intends to commit
  but hasn't launched yet) plus `max(0, sharePool.targetGb − sharePool.inFlightRamGb)` (share's
  top-up gap). **Order and plumbing are binding (reviewer blocker B1):** the per-host reserve
  (b) is applied *first* — each host's pool entry becomes `{ hostname, freeRam: max(0,
  freeRam − XP_RESERVE_FRAC × maxRam) }` — and the claim (c) is then carved from those
  already-netted slices, largest-hosts-first, by reusing `carveReservation` from
  `scheduler.js` (pure — imports from it are RAM-free; its output carries `{ hostname,
  freeRam }` only, which is fine because the reserve was applied before the carve, so
  `planXpJobs` never needs `maxRam`). Reserve-first means the claim can never eat a host's 5%
  headroom. A snapshot older than `SNAPSHOT_STALE_MS = 60_000` or a missing/malformed log
  means the daemon isn't running (or just started): claim = 0, no exclusions. A **valid
  snapshot without a `draining` field is the normal steady state, not malformed** — the
  daemon only attaches `draining` when non-empty (`daemon.js:1052`); absent means empty, and
  the claim still computes from `members[]` + share gap (reviewer blocker B2). This makes
  "the batcher keeps first
  claim" a mechanism, not a hope, and it self-scales exactly as the features doc requires:
  busy fleet → big claim + little free RAM → near-zero farming; idle endgame fleet → claim ≈ 0
  → farming takes ~everything.
  **Accepted trade-off, stated loudly:** the XP engine is *senior to the batcher's waterfall*
  (opportunistic prep of non-member targets) — the claim covers members and share only. In a
  fresh node this can slow the money ramp by starving speculative prep. Deliberate: an idle GB
  spent completing hacks is the phase's whole point, member pipelines (the actual income) are
  protected, and `xp-off.txt` is the escape hatch. **Directly observable now** (regime update:
  we are early in a fresh node, the case this trade-off was written for — see live validation
  step 7, rewritten accordingly). That
  observation explicitly includes **fragmentation**: whole-host XP fills can leave no
  single host with a slice big enough for one batcher grow job (`assignBatchHosts` needs one
  host per job) even when the fleet-total budget is fine — the 5% per-host reserve is the
  mitigation, and whether it suffices on a small fleet is part of what this run's coexistence
  observation answers.
- **S3 — Target selection (features Q3): top `XP_TOP_N = 3` by required hacking level, refreshed
  every pass, whole-host round-robin assignment.** Eligibility: rooted, `requiredHackingLevel ≤
  player level` (hack — unlike the prototype's weaken — needs the level), `maxMoney > 0`
  (Q1's money-independence was measured on a *drained* money server; structurally money-less
  servers are unverified, so they're conservatively excluded), and **not batcher-claimed**
  (not in the latest fresh snapshot's `members[]` or `draining[]` — the same snapshot read as
  S2). N = 3 diversifies completion cadence and spreads the weaken-hold load per the features
  doc's reasoning; it's a tunable constant, confirmed/tuned in live validation. Each pass
  assigns each usable host wholly to one target, round-robin — coarse but even at fleet scale,
  avoids sub-splitting hosts, and keeps the planner trivially testable. Re-selection every pass
  is safe because workers are fire-and-forget: a target set change strands nothing, in-flight
  ops just complete. If the eligible list is empty (small early-game fleet where everything
  hackable is batcher-claimed), the engine idles that pass — correct coexistence behavior, not
  an error. Batcher-side friction is accepted and documented: the engine drains money on
  servers the batcher may *later* adopt (it then pays a re-prep), and the exclusion only covers
  the batcher's *current* claim.
- **S4 — Security hold (features Q2): `HOLD_WEAKEN_FRAC = 0.16` of each host's XP allocation
  goes to weaken, with a crush mode for hot targets.** Steady-state balance from the mechanics
  (hack +0.002 sec/thread per completion at duration T; weaken −0.05/thread at 4T; RAM 1.70 vs
  1.75 GB/thread) gives weaken ≈ 14.1% of XP RAM; 16% is that plus deliberate margin, since
  over-weakening is a harmless no-op and the whole 3× speed win of min security rides on the
  hold not slipping. When a target's current security exceeds `min + CRUSH_SEC_GAP` (= 5), that
  target's entire allocation this pass is weaken ("crush") until it's back under the gap — a
  cold or drifted target gets driven to min fast instead of grinding 456-second hacks at high
  sec. The *equilibrium* an untimed fire-and-forget mix actually settles at is the features
  doc's declared live unknown — validated (and the constant tuned) in live step 3, not
  re-litigated here.
- **S5 — Instrumentation (features decision 7): `xpPool` in the daemon snapshot via
  `sampling.js`, plus an engine-side `xpfarm-log.json`; the daemon's tail display is
  unchanged.** `inFlightByTarget` gains an XP branch (checked before the `byTarget` bucketing,
  mirroring the `SHARE_SCRIPT` branch): processes whose filename matches `XP_SCRIPTS.hack`/
  `XP_SCRIPTS.weaken` accumulate into `xpPool = { hackThreads, weakenThreads, inFlightRamGb }`
  and never touch `byTarget`. The daemon's snapshot event carries `xpPool` from the existing
  post-launch sweep (no third sweep — Phase 7's two-sweeps-per-tick property holds). Unlike
  `sharePool` there is no `targetGb`/`attainedPct` — the engine is opportunistic, there is no
  target to attain. The engine additionally writes `xpfarm-log.json` (home, ring-trimmed,
  exported via a `vite.config.ts` filter line): one record per pass with per-target security
  vs min, mode (crush/hold), threads launched, plus `usableGb`, `claimGb`, and
  `hackingLevel` — the evidence for the equilibrium validation. exp/sec itself is **not**
  duplicated into the engine's log: the daemon's existing `hacking-progress-log.json` (3-min
  cadence, restart-surviving) is the single exp series and the A/B measurement source; the
  engine doesn't call `ns.getPlayer()` at all (saves 0.5 GB, avoids two competing exp series).
- **S6 — Lifecycle: daemon-launched companion, `xp-off.txt` manual toggle (features decisions
  2/6, Q4/Q7).** One `launchDetached(ns, "xpfarm.js")` line in `daemon.js`'s companion block
  (exec-by-filename — daemon RAM flat). Known limit of that pattern, accepted as-is: if home
  free RAM can't fit the engine at daemon startup, `fitsOnHome` prints an INFO skip and
  nothing retries until the next daemon restart — same behavior as every existing companion,
  and self-correcting in practice since restarts are frequent. On daemon restart,
  `killscripts.js` sweeps the engine
  *and* its fleet-wide workers (it already killalls every network + purchased server); the
  relaunched engine simply refills — idempotent, nothing to add. The engine opens its own tail
  and gets a `MANAGED_TAILS` entry in `tailmanager.js` (`script: "xpfarm.js"`, title `xp farm`,
  default 560×200) so its window is restored/persisted like the other standing dashboards.
  `XP_OFF_MARKER = "xp-off.txt"` on home, checked every pass (`ns.fileExists`, 0 GB): present →
  launch nothing, print `xp: OFF (xp-off.txt)`; in-flight workers decay naturally (bounded by
  one weaken duration on the current top target — ~10 min on the old node's endgame targets,
  shorter on early-node ones; no kill sweep, matching share's decay-not-kill pattern). No
  auto-off at 2500 (features Q7, decided there).
- **S7 — Ship-gate multiple: engine-on exp/sec ≥ 3× engine-off, same session (features Q6
  answered by measurement, not guessed).** The features doc requires "a live run showing
  exp/sec rose by the claimed multiple"; this spec claims **≥ 3×** the batcher-only rate as
  the acceptance floor. Basis: the weaken stopgap's farm contribution (~76 k exp/sec on ~91% of
  the fleet) scales by roughly hack-vs-weaken completion efficiency (4× duration × ~3× min-sec
  speedup, less hackChance and equilibrium losses), so the honest projection is a wide 3–9×
  band — 3× is the floor that clearly beats the stopgap's 1.4× and proves the completions-over-
  occupancy pivot, without hanging acceptance on the band's optimistic end. Both windows are
  measured from `logs/hacking-progress-log.json` in the same session (procedure in live step 4);
  the measured multiple is recorded in the CHANGELOG entry regardless. **Anything below 3× is
  a phase-outcome discussion with Kenneth, not a silent merge** — between 1.4× and 3× the
  engine beat the stopgap but missed the claim (tuning vs re-scope call); **below 1.4× it
  underperforms the weaken stopgap it replaced** (equilibrium failed badly) — the stopgap is
  trivially restorable (git holds the prototype), and the features doc's fallback (re-scoring
  the money batcher) comes to the table.
  **Regime caveat (2026-07-12):** the 3× floor and the 1.4× stopgap reference were both
  measured in the old node's idle-fleet endgame; the stopgap is no longer running and the A/B
  now runs on a young BN1.2 fleet where *both* windows differ (B's batcher-only exp/sec is a
  small young-fleet number, and A's surplus is whatever that fleet leaves free). The floor
  stands as written — the outcome ladder already routes any sub-3× reading to a discussion
  rather than a fail — but interpret a surprising multiple against the changed regime (claim
  size, surplus GB in `xpfarm-log.json`) before blaming the equilibrium.

## Design

### Work item 1 — `src/xphack.js`, `src/xpweaken.js`: XP workers [code]

Two new one-shot workers, deliberately minimal (header comment: XP-engine counterparts of
`hack.js`/`weaken.js`; distinct filenames so the money batcher's in-flight sweep never counts
them — see S1):

- `xphack.js`: `await ns.hack(String(ns.args[0]))` — no `additionalMsec` (the engine has no
  batch timing to offset).
- `xpweaken.js`: `await ns.weaken(String(ns.args[0]))`.
- Both take `ns.args[1]` as an ignored, monotonically increasing launch uid (same
  duplicate-filename+args exec-restriction workaround as `share.js`'s counter arg).

RAM must gate-check equal to `hack.js` (1.70 GB) / `weaken.js` (1.75 GB) exactly.

### Work item 2 — `src/scheduler.js`: the `XP_SCRIPTS` constant [code]

```js
export const XP_SCRIPTS = { hack: "xphack.js", weaken: "xpweaken.js" };
```

placed next to `WORKER_SCRIPTS`/`SHARE_SCRIPT` with a comment marking it the XP engine's
worker set (kept out of `WORKER_SCRIPTS` on purpose — that name means "the three targeted
batch workers" and `workerRamCosts`/`inFlightByTarget` depend on that meaning). Object-literal
keys `hack`/`weaken` are confirmed safe (Phase 13's probe: keys are not phantom-charged).
`scheduler.js` stays pure; importers pay nothing.

### Work item 3 — `src/xpfarm.js`: the production engine [code]

Full rewrite in place (the file header notes it replaces the Phase 20 MVP prototype; the
prototype's findings live in the features doc). Constants:

```js
const LOOP_MS = 10_000;
const XP_RESERVE_FRAC = 0.05;      // per-host headroom for the batcher's next-tick launches
const HOLD_WEAKEN_FRAC = 0.16;     // weaken share of each XP allocation (S4; ~14.1% analytic + margin)
const CRUSH_SEC_GAP = 5;           // sec above min beyond which a target's whole allocation is weaken
const XP_TOP_N = 3;                // simultaneous targets (S3)
const SNAPSHOT_STALE_MS = 60_000;  // batcher snapshot older than this => daemon not running, claim 0
const XP_OFF_MARKER = "xp-off.txt";
const XP_LOG_FILE = "xpfarm-log.json";
const XP_LOG_MAX_ENTRIES = 2000;
```

Exported pure functions (unit-tested, no ns):

- `latestBatcherClaim(raw, now)` — parses a `daemon-batch-log.json` string; returns
  `{ claimGb, claimedServers }` from the newest `snapshot` event: `claimGb =
  sum(members[].reserveGb) + max(0, sharePool.targetGb − sharePool.inFlightRamGb)`,
  `claimedServers = members[].server ∪ draining[].server`. **`draining` is optional — absent
  (the daemon omits it whenever nothing is draining, i.e. the normal steady state) means
  empty, and the claim still computes from `members[]` + the share gap.** Missing file
  content, malformed JSON, no snapshot event, or `now − snapshot.timestamp >
  SNAPSHOT_STALE_MS` → `{ claimGb: 0, claimedServers: [] }`.
- `applyXpReserve(hosts, reserveFrac)` — maps `listHosts` records to
  `{ hostname, freeRam: max(0, freeRam − reserveFrac × maxRam) }` — the per-host reserve,
  applied *before* the claim carve (S2's binding order) so downstream functions need only
  `freeRam`.
- `pickXpTargets(candidates, claimedServers, topN)` — pure filter+sort over caller-built
  candidate records `{ server, reqLevel, maxMoney, rooted }` (plus the caller passes player
  level): keeps rooted, `reqLevel ≤ playerLevel`, `maxMoney > 0`, not claimed; sorts by
  `reqLevel` descending; returns the top `topN`. (Signature detail — playerLevel as a param —
  implementer's call; behavior above is the requirement.)
- `planXpJobs(hosts, targets, ramCosts, opts)` — the allocator. `hosts` is the
  reserve-netted, claim-carved pool (`{ hostname, freeRam }` — reserve and claim were already
  taken by the caller); `targets` carry `{ server, sec, minSec }`, attached by the caller
  from its per-target security reads (main-loop step 5). Per host (skipping any whose
  `freeRam` is under one weaken thread): assign the host round-robin to a target; if that
  target's `sec > minSec + CRUSH_SEC_GAP`, the host's whole slice is weaken threads (crush);
  otherwise split the slice `HOLD_WEAKEN_FRAC` weaken / remainder hack (floor to whole
  threads, weaken sized first, each ≥ 1 thread or dropped). Returns `{ jobs: [{ hostname,
  script, threads, target }], hackThreads, weakenThreads }`. Deterministic; no ns.

Main loop (every `LOOP_MS`):

1. `ns.fileExists(XP_OFF_MARKER, "home")` → if present: `ns.print` the OFF status, append a
   log record with `off: true`, sleep, continue (no launches; in-flight decays naturally).
2. `latestBatcherClaim(ns.read(DAEMON_LOG_FILE string), Date.now())`.
3. Build candidates from `scanNetwork(ns)` (rooted check, `getServerRequiredHackingLevel`,
   `getServerMaxMoney`); `pickXpTargets(...)` with `ns.getHackingLevel()`. Empty → print
   "no eligible XP target", log, sleep, continue.
4. `hosts = listHosts(ns)` (free RAM already net of everything in flight, home reserve held);
   `applyXpReserve(hosts, XP_RESERVE_FRAC)` then `carveReservation(reserved, claimGb)`
   (imported from `scheduler.js` — the same largest-hosts-first carve the daemon itself
   uses). Reserve first, claim second — S2's binding order.
5. Read each target's `getServerSecurityLevel`/`getServerMinSecurityLevel` and attach them to
   the target records as `{ sec, minSec }`; `planXpJobs(carvedPool, targets, ...)`;
   `ns.scp([XP_SCRIPTS.hack, XP_SCRIPTS.weaken], host, "home")` for each host receiving jobs;
   `ns.exec(job.script, job.hostname, job.threads, job.target, uid++)` per job (pid 0 →
   count, don't retry this pass).
6. Tail print (one status line + one line per target: server, req level, crush/hold, sec vs
   min, +H/+W launched this pass) and append the `xpfarm-log.json` record
   `{ timestamp, time, off: false, usableGb, claimGb, hackingLevel, targets: [{ server,
   reqLevel, mode, sec, minSec, hackThreadsLaunched, weakenThreadsLaunched }] }`; ring-trim to
   `XP_LOG_MAX_ENTRIES`, `ns.write(..., "w")`.

ns surface (all non-Singularity, verified against `markdown/` at implementation):
`scan`-via-`scanNetwork`, `hasRootAccess`, `getServerRequiredHackingLevel`, `getServerMaxMoney`,
`getServerSecurityLevel`, `getServerMinSecurityLevel`, `getHackingLevel`, `listHosts`'s calls
(`cloud.getServerNames`, `getServerMaxRam`, `getServerUsedRam`), `fileExists`, `read`, `write`,
`getScriptRam`, `scp`, `exec`, `sleep`, `print`/`clearLog`/`ui.openTail`. No `getPlayer` (S5).

### Work item 4 — `src/sampling.js`: `xpPool` accumulator [code]

In `inFlightByTarget`, before the `byTarget` bucketing (and after the `ramCosts` membership
check — the XP filenames must therefore be present in the `ramCosts` map the daemon passes,
see work item 5): a branch mirroring the `SHARE_SCRIPT` one —

```js
if (proc.filename === XP_SCRIPTS.hack || proc.filename === XP_SCRIPTS.weaken) {
  xpPool.inFlightRamGb += ramPerThread * proc.threads;
  if (proc.filename === XP_SCRIPTS.hack) xpPool.hackThreads += proc.threads;
  else xpPool.weakenThreads += proc.threads;
  continue;
}
```

Return shape gains `xpPool` (always present, zero-defaulted, like `sharePool`). `XP_SCRIPTS`
imported from `scheduler.js` alongside the existing imports. Doc comment updated: three
buckets now (byTarget / sharePool / xpPool), and the "ramCosts doubles as the membership
filter" note gains the XP filenames.

### Work item 5 — `src/daemon.js`: ramCosts, snapshot field, companion launch [code]

Three additive edits:

- `refreshCycle`'s `ramCosts` line adds the two XP scripts:
  `[XP_SCRIPTS.hack]: ns.getScriptRam(XP_SCRIPTS.hack, "home")` (and weaken) — needed so
  `inFlightByTarget` can price them; `XP_SCRIPTS` joins the existing `scheduler.js` import
  list (pure — no RAM).
- The snapshot record gains `xpPool: postLaunchInFlight.xpPool` (the existing second sweep —
  no third sweep, no arithmetic tracking needed since the daemon doesn't launch XP work).
- One `launchDetached(ns, "xpfarm.js");` line in the companion block, with a one-line comment
  (Phase 20: XP engine — fills surplus RAM with hack workers; self-suppresses when the fleet
  is busy).

The daemon's tail display is deliberately unchanged (S5): the engine has its own tail, and
Phase 18 fought for the daemon window's height. **Note for the log reader, stated here so
it isn't re-litigated:** `snapshot.utilizationPct` will read ~95%+ with the engine running —
it counts XP RAM as used, which is now the intended steady state, not an anomaly.

### Work item 6 — `src/tailmanager.js`: manage the engine's tail [code]

One `MANAGED_TAILS` entry: `{ script: "xpfarm.js", title: "xp farm", defaultW: 560,
defaultH: 200 }`. Nothing else — the manager's reconcile loop handles the rest.

### Work item 7 — `vite.config.ts`: export the engine log [code]

`if (file === 'xpfarm-log.json') return 'logs/xpfarm-log.json';` in the download filter, with
a one-line comment (Phase 20 — security-equilibrium + launch evidence for the XP engine).

### Work item 8 — tests [code]

- **New `test/xpfarm.test.js`** (pure, mock-free): `latestBatcherClaim` — happy path (members'
  reserveGb summed, share gap added, claimed servers include draining), **valid snapshot with
  no `draining` field → claim computed from members + share gap alone, no throw (blocker B2's
  regression case — this is the steady state)**, zero share gap when over-attained, stale
  snapshot → zero claim, malformed/empty/no-snapshot raw → zero claim.
  `applyXpReserve` — nets each host by `reserveFrac × maxRam`, clamps at 0, preserves order.
  `pickXpTargets` — sorts by reqLevel desc, applies all four eligibility filters, respects
  topN, empty result on all-claimed. `planXpJobs` — round-robin coverage of N targets, hold
  split ≈ 84/16 in threads (weaken first, both ≥ 1), crush mode sends a hot target's whole
  slice to weaken, sub-thread slices dropped, empty hosts/targets → no jobs.
- **`test/sampling.test.js` additions:** XP processes accumulate into `xpPool` by filename
  (hack vs weaken thread split, RAM total) and never touch `byTarget`; zero-default when none
  run; share and XP buckets coexist in one sweep.
- **`test/verify-log.test.js`:** snapshot schema assertion gains
  `xpPool: { hackThreads, weakenThreads, inFlightRamGb }` (all `expect.any(Number)`), plus an
  informational console line (min/avg/max `xpPool.inFlightRamGb`) beside the share summaries.
  Also add `'rooted'` to the `validTypes` set (line 77) — the pre-existing BACKLOG bug called
  out in the ground rules; without it live step 8 fails on any fresh-node log. One line,
  named in the commit as a pre-existing-bug fix.
  No checker-rule (`verify-log-checks.js`) changes — the share/budget/stall/exit invariants
  are untouched by design.

### Work item 9 — BACKLOG / CHANGELOG bookkeeping [code]

- `BACKLOG.md`: **policy changed since drafting (2026-07-12 de-bloat)** — BACKLOG no longer
  carries In-Progress entries; it holds ideas/bugs only. On close-out, delete the "XP-farm
  engine (Phase 20, SHELVED)" idea entry and the `rooted`-validTypes bug entry (fixed in work
  item 8), and move a dated, condensed entry (including the measured multiple, per S7) to
  `docs/phases/CHANGELOG.md`; graduate both phase docs to `docs/phases/`.
- `git rm src/xpprobe.js` at close-out — one-shot probe, job done (Phase 13 precedent); its
  findings are recorded in the features doc.
- Staged in the same commits as the work they describe.

## RAM gate [live, via `ramcheck.js` → `logs/ramcheck-result.json`]

Kill+restart the dev server first; byte-check `dist/src/*`. Baseline before the branch's
changes, re-run after:

`run ramcheck.js daemon.js xpfarm.js xphack.js xpweaken.js hack.js weaken.js`

| script | expected | why |
|---|---|---|
| `daemon.js` | **flat** vs the fresh baseline run (16.30 GB when drafted; daemon edits since — Phases 21–22 companions, print trims — should not have moved it, the baseline run confirms) | `getScriptRam`/`exec` already charged; `XP_SCRIPTS` import is pure; snapshot field is data |
| `xpfarm.js` | **record actual**; bust if > prototype baseline + 0.3 GB | same ns surface as the prototype ± small deltas (adds `getServerMaxMoney` +0.1, `fileExists` +0.1; drops nothing that was charged) |
| `xphack.js` | **exactly `hack.js`'s reading** (1.70 GB) | 1.6 base + 0.1 `ns.hack` — S1's no-new-RAM invariant |
| `xpweaken.js` | **exactly `weaken.js`'s reading** (1.75 GB) | 1.6 base + 0.15 `ns.weaken` |
| `hack.js` / `weaken.js` | flat | untouched; listed as the equality reference |

Any surprise → identifier-hygiene hunt (`mem`-trace per Phase 9/11) before proceeding.

## Live validation [live]

`npm run dev` running (restarted at the gate step above). Sequencing note (updated
2026-07-12): the weaken prototype is **not running** — the BN1.2 node reset killed it — so
step 1's daemon restart is a plain launch, not a cutover; nothing needs sweeping first.

1. **First fill:** restart `daemon.js`. The `xp farm` tail opens (and is placed by
   `tailmanager.js`); within a few passes it shows up to 3 targets and nonzero +H/+W launches.
   `logs/xpfarm-log.json` starts accumulating records. Fleet utilization in the daemon
   snapshot rises to near-full — the *level* depends on the young fleet's batcher claim; what
   matters is `usableGb` in `xpfarm-log.json` being consumed, not a specific percentage.
2. **Coexistence:** over ≥ 15 min, `logs/daemon-batch-log.json` snapshots show the batcher's
   members still batching — `commitmentPct` in its normal range, no sustained empty-pipeline
   WARN skips that started at cutover — and the `draining` list contains **no XP-only targets**
   (the S1 pollution fix, directly observable). `xpPool` is present and nonzero in snapshots.
3. **Security equilibrium (features Q2's live unknown):** after ≥ 15 min of steady running,
   each active target's `sec` in `logs/xpfarm-log.json` holds within ~2 of `minSec` (crush
   entries excluded). If a target ratchets upward instead, that's the fire-and-forget
   equilibrium failing → [code] retune `HOLD_WEAKEN_FRAC` (or `CRUSH_SEC_GAP`) and repeat.
   Record the settled values.
4. **The A/B exp/sec measurement (ship gate, S7):** with the engine running ≥ 30 min beyond
   step 3 (window A), then `nano xp-off.txt` (any content), wait ~10 min for in-flight decay,
   then ≥ 30 min batcher-only (window B), then delete the marker. From
   `logs/hacking-progress-log.json` (3-min samples; ≥ 10 per window): exp/sec = Δexp/Δt per
   window. **Pass: A ≥ 3× B.** Ordering deliberately favors B (higher level → faster ops), so
   the test is conservative. Record both rates and the multiple. Below 3× → stop and discuss
   per S7's outcome ladder, don't merge.
5. **Money-independence + failed-hack exp in vivo (Q1/Q2 residue):** during window A, targets'
   money drains to ~0 (visible in-game or via the engine's targets' state) while the
   progress-log exp rate holds steady rather than sagging as they drain — confirming drained
   and sub-100%-hackChance hacks keep granting exp at the design rate.
6. **Toggle behavior:** step 4's `xp-off.txt` interlude doubles as the toggle test — the
   engine tail flips to `xp: OFF (xp-off.txt)` within one pass, `xpfarm-log.json` records
   `off: true` with zero launches, and `xpPool` in daemon snapshots decays toward zero within
   ~10 min; deleting the marker refills within a pass or two.
7. **Fresh-node coexistence — now the live case (regime flip, 2026-07-12).** The durable-tool
   premise (busy fleet → the claim throttles farming; waterfall trade-off acceptable in
   practice) is directly observable in this early-BN1.2 run: step 2's coexistence window *is*
   the fresh-node test, and `claimGb` in `xpfarm-log.json` should read nonzero while the
   batcher is money-constrained. Watch specifically for the S2 waterfall/fragmentation
   trade-off (slowed money ramp, grow jobs failing to place) and record what's seen. The
   *opposite* extreme — idle endgame fleet, claim ≈ 0, farm takes ~everything — is what's no
   longer observable this early; record it as **observe-late-node**, not a sign-off blocker
   (the claim mechanism's endgame limit is unit-tested in work item 8).
8. `npm run verify:log` against a fresh export — green, with the `xpPool` schema assertion
   active and zero checker-rule changes.

## Acceptance criteria

- `npm test` green: all pre-existing suites plus work item 8's additions. (Implementer runs
  and clears this.)
- RAM gate per table: `daemon.js`/`hack.js`/`weaken.js` flat, `xphack.js`/`xpweaken.js` exactly
  equal to their counterparts, `xpfarm.js` recorded and within +0.3 GB of the prototype
  baseline; all byte-verified against `dist/src/*`, results in `logs/ramcheck-result.json`.
- Live steps 1–6 and 8 pass as described; step 7's fresh-node coexistence observations
  recorded (the idle-endgame extreme recorded as observe-late-node).
- Ship gate (S7): measured exp/sec multiple ≥ 3× from `logs/hacking-progress-log.json`, both
  windows ≥ 30 min, recorded in the CHANGELOG entry with the settled tuning constants.
- `logs/xpfarm-log.json` demonstrates the equilibrium (step 3) and the toggle (step 6).
- BACKLOG/CHANGELOG updated and `src/xpprobe.js` removed per work item 9, staged with the work.

## Files touched

**New:** `src/xphack.js`, `src/xpweaken.js`, `test/xpfarm.test.js`.

**Rewritten:** `src/xpfarm.js` (prototype → production engine, name kept).

**Edited (src):** `src/scheduler.js` (one exported constant), `src/sampling.js` (`xpPool`
bucket in `inFlightByTarget`), `src/daemon.js` (ramCosts + snapshot field + one companion
launch line), `src/tailmanager.js` (one `MANAGED_TAILS` entry).

**Edited (test):** `test/sampling.test.js`, `test/verify-log.test.js` (additive schema
assertion + info line only).

**Edited (config):** `vite.config.ts` (one download-filter line).

**Deleted at close-out:** `src/xpprobe.js`.

**Docs:** `BACKLOG.md`, `docs/phases/CHANGELOG.md`, plus this spec and
`phase-20-xpfarm.features.md` at repo root until graduation.

**Deliberately untouched:** `scheduler.js`'s planning/selection logic, `targets.js`,
`share.js`/share planning, all existing workers (`hack.js`/`grow.js`/`weaken.js`),
`killscripts.js` (its fleet-wide sweep already covers XP workers), `translog.js` (no spend),
`test/verify-log-checks.js` (no invariant touches XP state), the daemon's tail display.

## Session checkpoint (2026-07-12, paused mid-live-validation)

**Status: all [code] work items shipped and tested; live validation stopped before step 3
because of a live finding below. Resume here.**

### What's done

- All work items 1-7 implemented on branch `phase20-xpfarm` (2 commits: `555f182` "feat(phase-20):
  XP engine production rewrite", `786486e` "docs(backlog): note phase-20 implementation status +
  live burst observation"). **Not merged to `master`** -- waiting on live validation per the ship
  gate.
- `npm test`: 381/381 green, including work item 8's new suites (`test/xpfarm.test.js`,
  `sampling.test.js`/`verify-log.test.js` additions) and the pre-existing `rooted`-validTypes bug
  fix.
- RAM gate run live (dev server killed+restarted first, byte-checked against `dist/src/*`,
  `logs/ramcheck-result.json` written): `daemon.js` flat 16.3GB, `hack.js`/`weaken.js` flat,
  `xphack.js`/`xpweaken.js` exactly match their counterparts (1.70/1.75GB) — clean pass.
  `xpfarm.js` recorded at **5.8GB**, ~0.5GB over the spec's RAM-gate-table estimate of "+0.3GB
  over prototype baseline". Traced with the in-game `mem xpfarm.js` breakdown (see below) --
  every charge is a real, intentional call; the spec's own delta estimate just didn't account for
  S4's `getServerSecurityLevel`/`getServerMinSecurityLevel` reads, which the design requires. No
  identifier collision found. Treat 5.8GB as the correct recorded baseline going forward, not a
  bug to chase.
  ```
  xpfarm.js: 5.80GB total
    1.60 baseCost | 1.30 exec | 1.05 cloud.getServerNames | 0.60 scp | 0.20 scan
    0.15 weaken | 0.10 hack   (^ these two are inherited from xphack.js/xpweaken.js's own bodies --
                                 this build's RAM analyzer traces through ns.exec(job.script, ...)
                                 into the exec'd file's own ns-call surface, same as daemon.js
                                 already does for WORKER_SCRIPTS -- confirmed via mem daemon.js)
    0.10 getScriptRam | 0.10 fileExists | 0.10 getServerRequiredHackingLevel | 0.10 getServerMaxMoney
    0.10 getServerSecurityLevel | 0.10 getServerMinSecurityLevel
    0.05 getHackingLevel | 0.05 hasRootAccess | 0.05 getServerMaxRam | 0.05 getServerUsedRam
  ```

### Live finding: uncapped single-pass burst (the reason we paused)

Restarted `daemon.js` for the RAM gate at ~6:21:5x PM. Within the first 10s pass, `xpfarm.js` saw
a huge one-tick surplus (batcher's claim hadn't ramped up yet post-restart) and, per `planXpJobs`'
current design, committed **all of it in one pass**: ~6.9PB as ~3.9M weaken threads, crush mode,
split across only 3 targets (`syscore` req591, `alpha-ent` req588, `rho-construction` req499 --
all freshly drifted to 3x+ their min security after the restart).

That single-pass commitment then self-stalled: `usableGb` read exactly `0` on every subsequent
10s pass for 15+ minutes straight (checked `logs/xpfarm-log.json`), because the weaken threads it
launched are still in flight, occupying the RAM `listHosts` reports as "used." Confirmed the
reason via the in-game terminal `analyze` on `syscore` (backdoored path: `home -> harakiri-sushi
-> zer0 -> neo-net -> avmnite-02h -> syscore`): at its current security (65, vs min 22),
`hackTime` is **9m21s**, so `weakenTime` (~4x hack) is **~37 minutes**. The burst launched ~6:21
PM won't land until roughly **6:58-6:59 PM**.

**Not a correctness bug.** The batcher stayed fully healthy throughout (checked
`daemon-batch-log.json`: 1293+ batch events, 0 skips, memberCount == candidateCount every
snapshot, income flowing $142.5m -> $7.45b over the observation window). The claim mechanism (S2)
correctly protected the batcher's own reserve the whole time -- XP just ate everything *outside*
that reserve in one shot instead of ramping into it.

**Why it matters beyond today's measurement:** this isn't a one-off startup fluke. It'll recur on
**every `daemon.js` restart** (frequent, per your own workflow) -- each restart briefly reopens a
big surplus before the batcher's claim re-establishes, and `planXpJobs` has no per-pass ceiling to
stop it from spending all of that surplus at once on whatever 3 targets are currently most
drifted. Once the current burst lands, security on all 3 targets will crater far below min (3.9M
threads is massive overkill for a ~3x-above-min gap), which will very likely trigger a second,
similar-sized hold-mode burst (84/16 hack/weaken) before things settle into genuine small
steady-state top-ups.

### Decision (2026-07-12, made right before pausing)

Presented three options (wait it out / kill the stuck processes and observe / add a per-pass
cap). **Kenneth chose: add a per-pass cap to `xpfarm.js` now**, before resuming live validation --
not just to unstick today's measurement, but because the restart-triggered burst pattern would
otherwise recur every time the daemon restarts.

**No cap has been designed or implemented yet** -- this is the next work item. Rough shape to
evaluate on resume (not yet vetted against the spec's S2/S3/S4 language, so treat as a starting
point, not a decision): cap `planXpJobs`' total per-pass commitment to some bound (a flat GB
ceiling, or a fraction of `usableGb`, or a per-target thread ceiling) so a reopened surplus ramps
in over several passes instead of landing in one shot. Whatever shape it takes, it's a real design
change to S3/S4 (the spec as written has no such cap), so it probably wants at least a quick
spec-amendment note (new S-decision or an addendum) before/alongside implementing, per the
project's normal spec-then-code discipline -- don't just patch it silently.

### State the live game was left in

- `npm run dev` is running (I restarted it for the RAM gate at the start of this session).
- `daemon.js` and `xpfarm.js` are both running in-game, left as-is (not turned off). The stuck
  burst will land on its own around 6:58-6:59 PM regardless of whether anyone's watching --
  no action needed to "unstick" it if the cap work takes a while.
- `xp-off.txt` was **not** created -- the engine is live, mid-burst, when this session paused.
- Branch `phase20-xpfarm` (2 commits, not merged) has everything through work item 9 except the
  BACKLOG/CHANGELOG close-out and `git rm src/xpprobe.js`, both explicitly deferred to after the
  ship-gate multiple is measured (spec's work item 9).

### Resume checklist

1. Implement the per-pass cap (design note above), re-run `npm test` + a fresh RAM gate for
   `xpfarm.js` (expect a small delta from whatever mechanism is added).
2. Kill+restart the dev server and `daemon.js` again, confirm the cap actually smooths the
   restart-burst (watch `logs/xpfarm-log.json` for a ramp instead of a one-shot 0-forever).
3. Resume live validation at spec step 2 (coexistence) -- step 1 (first fill) was already
   observed working during this session, modulo the burst finding above.
4. Steps 3-8 as written (security equilibrium, the ≥3x exp/sec A/B via `xp-off.txt`,
   money-independence, toggle behavior, fresh-node coexistence observations, `npm run verify:log`).
5. Close-out: BACKLOG/CHANGELOG entries + `git rm src/xpprobe.js`, per work item 9.
