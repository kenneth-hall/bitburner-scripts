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
  goes to weaken, with a crush mode for hot targets.** *(Crush as written here is superseded by
  **amendment S8** at the bottom of this spec — live validation showed uncapped crush commits the
  whole surplus into one 37-minute burst; S8 replaces it with a sized, cooldown-gated volley. The
  hold split below is unchanged.)* Steady-state balance from the mechanics
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

*(Shipped as written; **amendment S8** then modifies the crush path — sized volleys, cooldown
ledger, crush-wait mode. Read S8 before touching `planXpJobs` or the main loop.)*

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
drifted. Once the current burst lands, the massive overkill (3.9M
threads against a gap needing ~860: (65−22)/0.05) is pure wasted RAM-time — security floors at
`minSec`, it can't crater below — and the freed surplus will very likely trigger a second,
similar-sized hold-mode burst (84/16 hack/weaken) before things settle into genuine small
steady-state top-ups. *(Correction on resume review, 2026-07-12: the original text here said
sec would "crater far below min" — mechanically impossible; the follow-on cost is the giant
hold re-burst and the wasted RAM, restated above.)* A second live observation from the same
window sharpens the diagnosis: at 6:46:45 PM a ~5TB sliver of RAM freed mid-burst and the very
next pass spent it as 2,871 *more* weaken threads at the same still-drifted target — the engine
re-crushes the same gap every time RAM appears, because it has no awareness of its own
in-flight work.

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

**→ Resolved on resume review (2026-07-12): amendment S8 below is that spec amendment.** The
flat-GB / fraction-of-usable shapes sketched above were evaluated and rejected there (they smooth
the launch but don't fix the 37-minute commitment lockup); the per-target thread ceiling survived,
sharpened into a gap-sized, cooldown-gated volley.

### State the live game was left in

- `npm run dev` is running (I restarted it for the RAM gate at the start of this session).
- `daemon.js` and `xpfarm.js` are both running in-game, left as-is (not turned off). The stuck
  burst will land on its own around 6:58-6:59 PM regardless of whether anyone's watching --
  no action needed to "unstick" it if the cap work takes a while.
- `xp-off.txt` was **not** created -- the engine is live, mid-burst, when this session paused.
- Branch `phase20-xpfarm` (2 commits, not merged) has everything through work item 9 except the
  BACKLOG/CHANGELOG close-out and `git rm src/xpprobe.js`, both explicitly deferred to after the
  ship-gate multiple is measured (spec's work item 9).

## Amendment S8 (2026-07-12, resume review) — the per-pass cap is a sized, cooldown-gated crush volley, not a blanket GB ramp

**Supersedes S4's crush paragraph and work item 3's `planXpJobs` crush path where they
conflict. Everything else — S2's claim mechanics, the hold split, target selection, lifecycle,
instrumentation — stands as written.**

### The decision

1. **Size the volley to the gap.** When a target reads `sec > minSec + CRUSH_SEC_GAP` and no
   volley is in flight for it, launch
   `ceil((sec − minSec) / WEAKEN_SEC_PER_THREAD × CRUSH_OVERSIZE)` weaken threads
   (`WEAKEN_SEC_PER_THREAD = 0.05`, `CRUSH_OVERSIZE = 1.1`), placed *before* any hold split.
   **Packing is pinned (reviewer Q4): greedy fill-first-host** — consume the volley starting
   from the target's first assigned host in round-robin order, spilling to its subsequent
   hosts only if the first can't fit it; the volley host's leftover slice and all the target's
   remaining hosts then get the hold split. (Even-spread would behave identically at the
   target — same total, same landing time — but the tests and the partial-volley path assume
   a deterministic consumption order, so it's fixed here.) Scale check from the live finding:
   syscore's 3×-min drift (sec 65, min 22) needs ~860 threads ≈ 1.5TB — the uncapped design
   spent ~1.3M threads ≈ 2.3PB on it.
2. **Cooldown ledger.** When a volley actually launches (≥ 1 thread with a nonzero exec pid),
   record `crushUntil[server] = now + ns.getWeakenTime(server) + LOOP_MS`. Until that passes,
   the target is in **crush-wait**: no further crush weakens no matter what `sec` reads — the
   in-flight volley's reduction isn't observable yet, and re-reading the same gap every 10s
   pass is exactly the re-crush pathology the live log caught (the 6:46:45 PM sliver). The
   ledger is a plain in-memory `Map`; an engine restart loses it, worst case one duplicate
   *sized* volley (thousands of threads, bounded) — and a daemon restart kills the workers and
   the engine together (killscripts sweep), so ledger and in-flight state always reset
   coherently.
3. **Hold runs everywhere else, at any security level.** All remaining capacity — the volley
   hosts' leftover slices, and every host assigned to a crush-wait target — gets the normal
   `HOLD_WEAKEN_FRAC` 84/16 split *at the elevated security*. This is the load-bearing insight:
   the hold balance is security-invariant — hack adds +0.002 sec/thread at duration T, weaken
   removes 0.05/thread at 4T, so the balance point (W/H = 0.002×4/0.05 = 0.16 **in threads**)
   has T cancel out and holds at any security level. Precision note (reviewer N5): the
   implemented `HOLD_WEAKEN_FRAC = 0.16` is a **RAM** fraction, which puts the thread ratio at
   ~0.185 — deliberately *above* the balance point, exactly S4's "14.1% analytic + margin"
   framing; above min the surplus slowly weakens the target downward, at min it's a no-op.
   So hold neither fights the volley nor waits for it. XP flows from the first pass — at a
   reduced rate (ops ~3× longer at drifted sec, hackChance lower), but ≫ the uncapped design's
   *zero completions for 37 minutes* — and the fleet's commitment horizon becomes hack-time
   (minutes) instead of weaken-at-drifted-sec (37+ min observed). Caveat (reviewer N6): the
   invariance argument is a *rate* argument; fire-and-forget launches land in synchronized
   waves (a pass's hacks all at ~T, its weakens at ~4T), so security can transiently
   over/undershoot during the first weaken duration. Where the untimed mix actually settles
   remains S4/features-Q2's declared live unknown — a convergence miss in live step 3 routes
   to `HOLD_WEAKEN_FRAC`/`CRUSH_SEC_GAP` tuning as that step already says, not to "S8 is
   broken"; the no-lockup claim doesn't ride on it (exp is granted per completion regardless
   of where security sits).
4. **Partial volleys converge.** If the target's hosts this pass can't fit the full volley,
   launch what fits and set the cooldown anyway; the residual gap is re-measured from live
   `sec` after the volley lands and re-volleyed next round. Multiple weaken rounds on a small
   fleet is correct behavior, not a failure.

### Why not the checkpoint's flat-GB / fraction-of-usable ramp

The observed harm was never batcher starvation — S2's claim held and the batcher stayed healthy
throughout the burst. The harm was (a) **overkill** (3.9M threads against an ~860-thread gap)
and (b) **lockup** (the whole surplus committed into 37-minute weakens; `usableGb` flatlined at
0; zero XP completions for the duration). A blanket GB-per-pass ramp fixes neither: it still
commits ~everything into long weakens within a few passes, just politely, and then taxes
steady-state throughput forever after. Sizing + cooldown caps the commitment in the dimension
that matters — **duration** — which is what answers the workflow concern that triggered the
pause: *every daemon restart and every aug install reopens a drifted-target state* (restarts
kill in-flight weakens and strand the drift; rising player level feeds in newly-eligible servers
that always arrive drifted), so post-reset time-to-steady-state is a recurring cost, not a
one-off. Under S8 that cost is: XP nonzero from pass 1, full min-sec rate within ~1 weaken
duration. Under the shipped code it was: ≥ 1 weaken duration of zero XP, then a likely re-burst.

Deliberately **not** added: any ramp protecting the batcher during the restart's first passes.
The live burst — worst case — didn't starve it (claim mechanism worked; 0 skips, income grew
throughout), and under S8 any transient over-grab returns on hack cadence anyway. If live
step 2 shows otherwise, that's a new finding, not a known gap.

### Mechanical deltas for the implementer

- **Constants added:** `WEAKEN_SEC_PER_THREAD = 0.05` (fleet hosts are 1-core; home's core
  bonus only makes weakens stronger — harmless over-delivery, so the constant needn't model
  cores), `CRUSH_OVERSIZE = 1.1`. Identifier hygiene per the ground rule: pre-check these plus
  `crushUntil` and the `"crush-wait"` mode string against `NetscriptDefinitions.d.ts` before
  the RAM gate.
- **`planXpJobs` stays pure.** The caller derives per-target `crushOk` from the ledger and
  passes it on the target records; the plan must let the caller distinguish volley weakens from
  hold weakens in its output (per-target volley thread counts, a job `kind` flag — implementer's
  call), because the cooldown is set only when ≥ 1 volley thread actually launched (exec pid
  ≠ 0). Behavior: `sec` over the gap + `crushOk` → sized volley first, hold split on all
  remaining capacity; over the gap + not `crushOk` → pure hold; under the gap → hold (unchanged).
- **ns surface / RAM:** adds `ns.getWeakenTime` (0.05GB, verified
  `markdown/bitburner.ns.getweakentime.md`). Expected `xpfarm.js` reading: **5.85GB** (the
  checkpoint's recorded 5.80 baseline + 0.05); anything else → identifier hunt per the gate.
- **Log/tail:** `targets[].mode` gains `"crush-wait"`; `"crush"` now means "volley launched
  this pass". **`targets[]` additionally gains `volleyThreadsLaunched` (reviewer B1):**
  `weakenThreadsLaunched` sums volley *and* hold weakens, and on any sizable fleet the hold
  share (16% of the leftover) dwarfs the ~gap/0.05 volley — without a distinct field, the
  volley-sizing live check below is unreadable from the log. Zero on non-crush passes.
  Engine-internal only — no daemon, sampling, or verify-log changes.
- **Tests (work item 8's `test/xpfarm.test.js` — extended AND corrected):** the shipped
  assertion "crush mode sends a hot target's whole slice to weaken" tests exactly the behavior
  S8 supersedes — **replace it** (reviewer B3), don't leave it alongside. New cases: volley
  sized to gap (ceil + oversize), greedy fill-first-host packing, crush-wait target gets pure
  hold at elevated sec, no volley when `crushOk` is false, partial volley when hosts can't fit
  it, volley + hold coexisting on the volley host's leftover slice, hold split unchanged below
  the gap.
- **Live step 3 reads under S8 as:** `"hold"` entries hold within ~2 of min (as written);
  a drifted target's `"crush-wait"` entries must *transition* to `"hold"` within ~1 weaken
  duration of its volley plus a couple passes — that transition is the new convergence check,
  and `hackThreadsLaunched` should be nonzero from the first post-restart passes (the
  no-more-lockup check). **`usableGb` reading ≈0 on early passes is expected, not the bug
  recurring (reviewer B2):** S8 adds no GB cap, so hold legitimately fills the surplus in
  pass 1. The two states are told apart by *recovery time*: fixed behavior recycles RAM on
  hack cadence (`usableGb` bounces back within ~1 drifted hackTime — single-digit minutes),
  the old bug held it flat-zero for ~1 drifted weakenTime (~37 min observed) with zero
  hack launches.

### Resume checklist (rewritten under S8)

1. **[code]** Implement S8 in `src/xpfarm.js` (pure functions + tests first, house style);
   `npm test` green.
2. **[code→live]** Fresh RAM gate for `xpfarm.js` (dev server kill+restart + `dist/src/*`
   byte-check per standing rule): expect 5.85GB.
3. **[live]** Restart `daemon.js`. In `logs/xpfarm-log.json` confirm the restart-burst is
   fixed: `volleyThreadsLaunched` in the thousands (≈ gap/0.05 — the dedicated field, since
   `weakenThreadsLaunched` also carries hold weakens), nonzero `hackThreadsLaunched` from the
   first passes, drifted targets walk crush → crush-wait → hold within ~1 weaken duration,
   and `usableGb` — which *will* read ≈0 early (hold fills the surplus by design) — recovers
   on hack cadence (~single-digit minutes), not weaken cadence (~37 min flat-zero was the
   bug). (Whatever the pre-S8 code left in flight is swept by the restart — no cleanup
   needed; the 6:21 PM burst self-resolved when it landed ~6:58 PM on 2026-07-12 regardless.)
4. **[live]** Resume live validation at step 2 (coexistence) — step 1 (first fill) was
   observed working before the pause; steps 3–8 as written, with step 3 read per the S8 note
   above.
5. **[code]** Close-out: BACKLOG/CHANGELOG entries + `git rm src/xpprobe.js` per work item 9;
   both phase docs (including this amendment) graduate to `docs/phases/`.

## Session checkpoint 2 (2026-07-12, paused after S8 live validation — new finding, pending fix decision)

**Status: resume checklist items 1–3 done and confirmed live; item 4 (live validation) stopped
partway through step 3 (security equilibrium) because of a new finding below, distinct from the
lockup S8 fixed. Not merged to `master`. Resume here after Kenneth reviews.**

### What's done this session

- **S8 implemented** in `src/xpfarm.js` (checklist item 1): sized volley
  (`ceil(gap / WEAKEN_SEC_PER_THREAD * CRUSH_OVERSIZE)`), greedy fill-first-host packing, the
  `crushUntil` in-memory cooldown ledger, `job.kind: "volley" | "hold"` tagging, hold running on
  all remaining capacity at whatever security the target currently reads, `"crush-wait"` mode,
  `volleyThreadsLaunched` per-target log field. `test/xpfarm.test.js`'s pre-S8 "crush sends whole
  slice" case replaced with five S8 cases (sized volley, greedy packing, crush-wait pure-hold, a
  too-small-to-cover partial volley, volley+hold coexisting on one host). `npm test`: **385/385
  green**. Committed: `eb9cf10` "feat(phase-20): implement amendment S8 -- sized, cooldown-gated
  crush volley" (branch `phase20-xpfarm`, not merged).
- **RAM gate re-run live** (checklist item 2): dev server killed and restarted fresh first
  (old PID from the prior session's 6:21 PM incident was still running — replaced with a clean
  process), byte-verified `dist/src/xpfarm.js`/`dist/src/daemon.js` against `ramcheck.js`'s
  recorded byte counts (15817 / 54271 bytes — exact match). Result: `xpfarm.js` **5.85GB**,
  matching S8's mechanical-delta prediction exactly (5.80 baseline + 0.05 `getWeakenTime`);
  `daemon.js` flat 16.3GB; `hack.js`/`weaken.js` flat; `xphack.js`/`xpweaken.js` exactly equal to
  their counterparts (1.70/1.75GB). Clean pass, `logs/ramcheck-result.json` written.
- **Restarted `daemon.js` live** (checklist item 3) via `node tools/bb/cli.mjs restart
  daemon.js`. Clean process list confirmed (`daemon.js`, `xpfarm.js`, all companions, worker
  processes). **The specific burst-fix claim is directly confirmed with live data** — multiple
  full crush cycles observed in `logs/xpfarm-log.json`, e.g.:
  - `rho-construction` (req499): gap 5.63 (sec 19.63/min 14.00) at 7:22:20 PM → sized volley of
    **124 threads** (formula: `ceil(5.63/0.05*1.1) = 124`, exact match) → `crush-wait` at
    7:22:30 PM → `hold` at 7:22:40 PM with sec back at exactly min (14.00). Full cycle in
    **20 seconds**, versus the pre-S8 bug's ~1.3M threads and 37-minute flat-zero lockup for a
    comparable gap.
  - `snap-fitness` (req678, newly rotated into the top-3): gap 39 (sec 58.00/min 19.00) → volley
    of **859 threads** (formula gives 858; +1 is floating-point rounding on `×1.1`, harmless) —
    hack threads kept launching every pass during the `crush-wait` window (no lockup).
  - `syscore` and `alpha-ent` also fired sized (not mega) volleys on their first crush — but see
    the new finding below for what happened to them *after* that.
- **Live validation step 2 (coexistence)** observed over a 20-minute window (~7:14–7:34 PM,
  polled via a background monitor, not manual sleeps): batcher held steady at **17 members**,
  **`draining` empty throughout** (S1's contamination fix directly confirmed — no XP-only
  targets ever appeared in `draining`), zero `skip` WARN events. `xpPool` present and large
  (~9.6M → ~11.6M GB in-flight over the window — this fleet is much larger than the "early
  BN1.2" framing implied; see the open question below). `claimGb` fluctuated 500K–750K GB,
  never zero — S2's claim mechanism visibly protecting the batcher's reserve throughout.

### New finding: hold-mode security equilibrium fails for high-req targets (distinct from the S8 lockup)

**Not the pathology S8 fixed — no lockup, exp keeps flowing — but a real miss of live step 3's
equilibrium acceptance criterion, discovered while checking it.**

`syscore` (req591) fired exactly **one** volley in the entire session (7:15:39 PM, sec 36.4/min
22.0, gap 14.4, 318 threads — correctly sized) and then sat in `crush-wait` **continuously for
20+ minutes** while its security climbed **unopposed from 22 to 100 (the server's apparent cap)**
and never came back down or re-crushed in the observed window. `alpha-ent` (req588) shows the
same pattern (34.8 → 77.3, still climbing at last observation). `rho-construction` (req499, much
shorter op time) converges cleanly by contrast: average gap over min 3.15, max 9.02, across 61
samples in the same window.

**Root cause, diagnosed and confirmed against the log data:** S3's "whole-host round-robin"
assignment hands an *entire host's* free-RAM slice to whichever single target it's rotated onto,
for one pass, uncapped. On this fleet (17 batcher members, PB-scale surplus, individual hosts
apparently very large), single passes launched **200,000–330,000+ hack threads at one target**
in observed samples (e.g. 274,820 threads at 7:18:39 PM, 324,365 at 7:20:19 PM, 275,104 at
7:21:09 PM, all against `syscore`). Those threads complete in a synchronized wave ~9+ minutes
later (`syscore`'s long op time at req591), each adding `+0.002` sec — a single wave of ~275K
threads adds ~550 sec-equivalents, instantly saturating the server at its 100 cap. Compounding
this: `ns.getWeakenTime(server)` "is increased by the security level of the target server"
(`markdown/bitburner.ns.getweakentime.md`), so the `crushUntil` cooldown — sized off the *modest*
gap (14.4) present when the one volley fired — is itself many minutes long for a req-591 server,
and hold-mode keeps running against the same crush-wait target throughout that entire cooldown
(S8 point 3: hold runs everywhere "at any security level"). The single 318-thread volley
(15.9 sec of correction) is negligible against a single hold-hack wave (~550 sec-equivalents of
drift) landing a few minutes later — hold's 16% weaken share, itself landing in its own
synchronized lump ~4× later, can't keep pace with hack lumps this size. **This is a genuinely
different mechanism than the one S8 targeted**: S8 fixed the crush path committing too much RAM
into one long weaken; this is the *hold* path committing too much RAM into one target's hack
allocation, upstream of where crush ever gets a chance to correct it.

**Consequence, measured:** not the S8 lockup (zero completions) — `hacking-progress-log.json`
shows **225,202 exp/sec over an 18-minute window spanning this finding** (level 670 → 686), so
the phase's core "completions over occupancy" thesis is intact and the ship-gate's ≥3× multiple
looks in no danger numerically. But S4's own stated rationale — "the whole 3× speed win of min
security rides on the hold not slipping" — is being forfeited specifically for `syscore` and
`alpha-ent`: they're paying full-security (up to sec-100) hack durations, not min-security ones,
for extended stretches. The measured exp/sec is apparently being carried by raw fleet thread
volume, not the intended min-sec speed multiplier, for these two targets. Kenneth's framing,
confirmed correct: **"we overcommit to 1 target"** — a single pass hands too much of one host's
capacity to one target without any per-target bound.

**Fix directions discussed, not yet decided or implemented:**

1. **(Proposed lead option) Cap hack threads committed to one target per pass**, extending S8's
   own "size the commitment to what's safe" philosophy to the *source* of drift instead of
   reacting after the fact: `maxHackThreadsPerTargetPerPass = floor(CRUSH_SEC_GAP /
   HACK_SEC_PER_THREAD)` (hack adds `0.002` sec/thread per S4's own mechanics derivation → 2,500
   threads at the current `CRUSH_SEC_GAP = 5`). A host that would overflow this cap on its
   assigned target spills the excess to weaken (extra holding power) or to the next target in
   rotation — implementer's call, not yet worked out. Directly bounds wave size below the crush
   threshold everywhere, not just for targets that happen to have short op times.
2. **Split each host's slice across all N targets instead of whole-host-per-target** — reduces
   wave size by roughly N× uniformly, but doesn't hard-bound it (a large enough host still
   overflows at N× the previous threshold) and is a bigger rework of S3's assignment model than
   option 1.

Neither is implemented. This needs its own short amendment (S9, mirroring how S8 was written up)
before coding, per the project's normal spec-then-code discipline — Kenneth asked to pause here
and pick a direction after reviewing this write-up, rather than have the next session guess.

**→ Resolved on second-round review (2026-07-12 evening): amendment S9 at the bottom of this
spec.** Option 1's cap survives as the *held-target* wave cap, but the review found it cannot
ship alone — on the now-16PB fleet a capped 3-target engine strands ~98% of the surplus (a
~10× exp/sec regression vs the measured 225K/s) — so S9 pairs it with a deliberate overflow
absorber, and adds a second, distinct fix (the hold weaken split over-accumulates 4.6× under
RAM recycling — confirmed live from `xpPool` thread ratios) that this checkpoint hadn't spotted.

### Open question surfaced, not investigated

The live fleet observed this session (17 batcher members, PB-scale surplus, `xpPool.inFlightRamGb`
in the 9.6M–11.6M GB range) is much larger than the "early BN1.2, small fleet" framing this
spec's regime-update section assumed when describing the resume trigger. Worth a sanity check
next session (not urgent, doesn't block the S9 fix decision) — confirm this is the expected state
of the current BN1.2 run's economy at this point in time, not a stale/leftover artifact from
somewhere else.

### State the live game was left in

- `npm run dev` is running (killed and restarted fresh at the start of this session, before the
  RAM gate, per the standing rule — PID changed from the prior session's leftover process).
- `daemon.js` and `xpfarm.js` are both running in-game with S8 live, left as-is (not turned off).
  No `xp-off.txt`. `syscore`/`alpha-ent` are likely still cycling near/at max security until
  their (long) cooldowns lapse and a subsequently larger volley fires — this is expected given
  the finding above, not a new problem to chase; no action needed before the next session.
- Branch `phase20-xpfarm`: `eb9cf10` (S8 implementation, this session) is the tip, on top of the
  prior session's `111b61c`. Not merged. This spec-doc checkpoint commit will follow.
- Live validation progress against the spec's numbered list: step 1 (first fill) and step 2
  (coexistence) observed and healthy; step 3 (equilibrium) **failed for `syscore`/`alpha-ent`,
  passed for `rho-construction`** — this is the finding above, not yet resolved; steps 4–8 (the
  A/B exp/sec ship-gate measurement, toggle test, money-independence, `verify:log`) **not
  started** — deliberately not begun with equilibrium unresolved, since a fix will change the
  log data those steps read.

### Resume checklist (next session, pending Kenneth's S9 direction) — SUPERSEDED by S9's own checklist below

1. **[discussion→spec]** Kenneth reviews this checkpoint, picks a fix direction (or a third
   option); write it up as amendment S9 (decision + mechanical deltas + tests, mirroring S8's
   format) before coding.
2. **[code]** Implement S9 in `src/xpfarm.js` + `test/xpfarm.test.js`; `npm test` green.
3. **[code→live]** Fresh RAM gate if S9 adds any ns calls (none of the options above obviously
   need one, but confirm).
4. **[live]** Restart `daemon.js`; re-run the security-equilibrium check (live step 3) — this
   time expect `syscore`/`alpha-ent` to also hold within ~2 of min like `rho-construction`
   already does, not just `rho-construction`.
5. **[live]** Resume live validation at step 4 (the A/B exp/sec ship-gate measurement — ≥30 min
   engine-on, toggle off, ~10 min decay, ≥30 min engine-off, ≥3× required), then steps 5–8 as
   written.
6. **[code]** Close-out per work item 9 (unchanged from before): BACKLOG/CHANGELOG entries +
   `git rm src/xpprobe.js`; both phase docs (including S8 and S9) graduate to `docs/phases/`.

## Amendment S9 (2026-07-12 evening, second-round review) — bounded held-target waves, wave-sized hold streams, and a deliberate overflow absorber

*(Cold-reviewed by the spec-reviewer subagent 2026-07-12; both blockers — B1: the per-pass
cap doesn't bound aggregate in-flight drift, criterion needed a transient carve-out; B2: the
no-hacks rule must key on the sec reading, not the crush/crush-wait mode split — plus Q3/Q4/Q5
decisions and N6/N7/N8 notes are folded in below, tagged inline.)*

**Supersedes, where they conflict: S3's whole-host round-robin assignment, S4's
`HOLD_WEAKEN_FRAC` RAM-fraction hold split (and S8 point 3's precision note N5 about it), and
S8 point 3's "hold runs everywhere" for crush-wait targets. Keeps everything else: S1's worker
filenames, S2's claim mechanics and reserve order, S3's eligibility filters and per-pass
re-selection, S8's sized volley + cooldown ledger + greedy packing + partial-volley
convergence.**

### What the live data shows — two distinct defects, not one

Checkpoint 2 diagnosed the first defect; reviewing its data surfaced a second.

**D1 — per-target hack waves are unbounded (checkpoint 2's finding, quantified).** Whole-host
round-robin hands one target an entire host's slice per pass with no ceiling. Observed single
passes committed 200,000–330,000 hack threads to one target (steady recycling still runs
11K–133K/pass/target). A pass's threads land as one synchronized wave: `+0.002 × N` sec
essentially at once, so anything above **2,500 threads exceeds the whole `CRUSH_SEC_GAP` in a
single landing** — and 275K threads is ~110× that. Result in `logs/xpfarm-log.json`:
`snap-fitness` pinned at sec 100 (the cap) for **176 of 177 samples** (avg gap 66.9);
`syscore` avg gap 19.2 (max 78); `alpha-ent` 14.2 (max 70.4); only short-op
`rho-construction` converged (avg 2.8). The sawtooth period is brutal at high req: weakens
launched against a sec-100 target ride ~40 min (observed: `snap-fitness`'s cohort launched
~7:15–7:25 PM landed ~8:00–8:01 PM, crashing it 100 → 21.6 for a couple of passes before
re-pinning). S4's "the whole 3× speed win of min security rides on the hold not slipping" is
forfeited exactly on the highest-value targets. S8's volley machinery never gets traction:
one gap-sized volley fires, the cooldown (weakenTime at *drifted* sec, so ~40 min) locks out
re-crushing, and hold-mode hack waves re-bury the target long before the volley lands.

**D2 — the hold weaken split over-accumulates ~4.6× under RAM recycling (new finding).**
`HOLD_WEAKEN_FRAC = 0.16` is applied to **each pass's launches**, but a weaken occupies its
RAM 4× longer than a hack. Under continuous recycling (RAM frees → is re-split 84/16 →
frees…), the **in-flight** weaken share therefore accumulates to ≈ 4× the launch share:
in-flight W/H thread ratio → 0.185 × 4 ≈ **0.74**, versus the **0.16 in-flight** ratio that
S4's own balance analytic (0.002×4/0.05) actually requires. S4's "14.1% of XP RAM" was always
an *in-flight* share; implementing it as a *per-launch* share over-delivers ~4.6×. (S8's
precision note N5 called the launch ratio "deliberately above the balance point" — it
conflated the two bases; corrected here.) **Live confirmation:** `xpPool`'s in-flight thread
ratio read W/H = 0.565 at 7:53 PM and 0.609 at 8:00 PM, climbing toward the predicted ~0.74
asymptote — i.e. ~38% of a ~13PB XP pool parked in weakens that deliver ~4.6× more
sec-reduction than the hacks need offset (floored at min = no-ops) while granting exp at the
slowest per-GB rate (same exp/op as hack, 4× the duration — features doc line "exp per op ∝
base difficulty, same for hack/grow/weaken"). Analytically that's ~30–40% of potential exp/sec
left on the table, independent of D1.

### Why checkpoint 2's option 1 cannot ship alone (the capacity arithmetic)

The proposed cap — `floor(CRUSH_SEC_GAP / 0.002) = 2,500` hack threads/target/pass — bounds a
held target's *in-flight* hacks to `2,500 × hackTime/LOOP_MS` threads. At `syscore`'s ~190s
min-sec hackTime that's ~48K threads ≈ **82TB per target; three targets ≈ 250TB. The live
surplus is ~13PB** — the cap employs ~2% of it. Option 1's two spill ideas both fail: "spill
to weaken" burns the other 98% on no-op weakens (worse than D2, not better); "spill to the
next target" exhausts all three capped targets almost immediately and then has no answer. Min
security buys a 3× op-speed win, but idling 98% of the pool costs ~40×: **strict min-sec
discipline at this scale is a ≥10× exp/sec regression (~17× by the raw arithmetic: 52× the
RAM ÷ the 3× speed win)** against the measured 225K exp/sec
(which, per checkpoint 2, is carried by raw volume). Checkpoint 2's option 2 (split each host
across N targets) softens waves by ~N× but bounds nothing — a bigger host or fleet re-breaks
it — and does nothing about D2. The fix has to bound per-target commitment **and** keep the
surplus employed.

### The decision

1. **Pick `XP_TOP_N = 4` targets (was 3); all get held-target mechanics.** Eligibility,
   sorting (reqLevel desc), and per-pass re-selection are unchanged from S3. What dies is
   whole-host round-robin: allocation becomes **demand-driven packing** (point 5).
2. **Held-target hack waves are capped: at most `HOLD_HACK_WAVE = floor(CRUSH_SEC_GAP /
   HACK_SEC_PER_THREAD)` = 2,500 hack threads per target per pass, summed across hosts** (a
   pass's multi-host jobs against one target land as one wave — the cap must bind the sum,
   not the per-host slice). **Precision (reviewer B1): the cap bounds each *landing wave* to
   ≤ `CRUSH_SEC_GAP`, not the aggregate in-flight drift** — roughly `hackTime/LOOP_MS` waves
   (~19 at a 190s hackTime) are in flight before the first one lands and moves the sec
   reading, so a held target *cold-adopted at min* can transiently accumulate ≈ +5 × 19 ≈
   +95 sec (pinning a syscore-class target at the 100 cap) before feedback engages.
   Convergence does **not** ride on the cap alone; it rides on the over-gap rule (point 4)
   halting further waves the moment the reading crosses the gap, plus the already-launched
   stream + volley landing — settling within ~1–2 weakenTimes, once, per cold-at-min
   adoption. That path is rare by construction: post-restart and newly-unlocked targets
   arrive *drifted* and take the volley/crush-wait path (stream prefills before any hack
   launches), which has no transient. Steady state per held target: one wave lands per pass
   (+5), stream lands ~−6.25/pass, net −1.25 → sec grinds to and holds min. Consecutive
   passes' waves land ≥ LOOP_MS apart (small bunching when durations shift is absorbed by
   the stream's margin and, at worst, an occasional small volley).
3. **The hold weaken stream is sized to the wave it must offset, not to RAM** (fixes D2,
   retires `HOLD_WEAKEN_FRAC`): per target per pass, `w = ceil(h ×
   HACK_SEC_PER_THREAD / WEAKEN_SEC_PER_THREAD × HOLD_OVERSIZE)` — at a full 2,500-thread
   wave, `ceil(2500 × 0.04 × 1.25) = 125` weaken threads. **Sizing base, pinned (reviewer
   Q4): for an under-gap target, `h` is the hack wave actually planned this pass** (a
   RAM-starved 1,000-thread wave gets `ceil(1000 × 0.05) = 50`); **for an over-gap target
   (which launches no hacks, point 4), the stream is sized to the full `HOLD_HACK_WAVE`**
   (= 125) so the weaken pipeline is established by the time hacking resumes. Steady state
   per held target: hack waves land ≤ +5, stream waves land ≈ −6.25/pass — sec sawtooths
   within ~gap of min, in-flight W/H ≈ 0.20 (0.16 balance × 1.25 margin), over-delivery
   floors harmlessly at min.
4. **Over-gap targets launch no hack waves** (supersedes S8 point 3 for this case). **The
   rule keys on the security reading — `sec > minSec + CRUSH_SEC_GAP` — not on the
   crush/crush-wait mode split (reviewer B2):** a target is denied hack waves in the very
   pass its volley fires (mode `"crush"`) *and* throughout the cooldown (mode
   `"crush-wait"`); `crushOk` gates only whether a volley also launches. An over-gap held
   target gets **stream weakens only** (full-wave-sized per point 3); its would-be hack
   capacity falls through to the overflow absorber. Rationale: checkpoint 2's data shows
   hold-hacking an over-gap target re-buries it faster than its one volley can correct
   (~550 sec-equivalents per wave vs a 318-thread volley), and S8 point 3's "XP flows from
   the first pass" rationale is now preserved *fleet-wide* by overflow instead of
   per-target. After the first crush-wait cycle the stream is continuous and the target
   rarely needs another volley in steady state; the cold-adoption transient is ~one-two
   weakenTimes, mirroring S8's partial-volley "converges over rounds" pattern.
5. **All remaining capacity — the true surplus after every held demand — goes to `targets[0]`
   (highest reqLevel = highest exp/op) as a pure-hack overflow, when `XP_OVERFLOW_ENABLED =
   true`.** Packing order per pass, greedy fill-first-host throughout (S8's packing rule, now
   global): (a) volleys (S8, unchanged, cooldown-gated), (b) held weaken streams, (c) held
   hack waves (skipping every over-gap target per point 4), (d) overflow hack on `targets[0]`
   with everything left. Packing mechanics, restated as requirements so the rewrite doesn't
   drop them (reviewer N7): every demand spills across hosts (consume the current host, move
   to the next); a demand the remaining pool can't fully fit launches partially (the volley
   precedent, now global); hosts whose slice is under one weaken thread are skipped, as the
   shipped code already does. The overflow deliberately ignores the cap, the crush-wait rule, and the equilibrium
   criterion: **`targets[0]` is expected to ride at/near sec 100 on a large fleet — that is
   the design, not the D1 bug recurring** (exp/op is security-independent per features Q1's
   probe; at 13PB the volume dwarfs the 3× speed loss by ~an order of magnitude, per the
   arithmetic above). The self-scaling story is preserved *within* the engine: on a small
   fleet the held demands consume everything and overflow is zero — pure min-sec farming, the
   durable-BN2+ case; overflow only exists when there is more surplus than min-sec discipline
   can physically employ. `targets[0]` still runs its held mechanics underneath (a 125-thread
   stream, occasional ≤ ~1,800-thread volleys — sized `ceil((100−min)/0.05 × 1.1)` at worst
   since sec caps at 100); against PB overflow they're negligible waste and deliberately left
   state-free rather than special-cased off.
   **Fewer than 4 eligible targets (reviewer Q3): the rule is uniform — whatever exists is
   picked, `targets[0]` is always the absorber, no special case.** The known corner is a
   *mid-to-large* fleet with exactly one eligible target: overflow saturates it at high sec
   where a capped-only engine would hold min at 3× speed — by the capacity arithmetic the
   dump still wins whenever surplus ≳ 3× one target's held capacity (~250TB), and the
   in-between band is accepted as rare (it needs the batcher to have claimed all but one
   hackable server *while* the fleet is large) and self-correcting as the level rises. On a
   small fleet a single eligible target self-scales correctly: its own held demand consumes
   the fleet, overflow ≈ 0.

**Made explicit, to be measured not assumed:** overflow rides at low hackChance, so its value
leans on failed hacks granting exp — features Q2's still-open live check. The strongest
current evidence says they do (225K exp/sec measured *while* `snap-fitness` sat pinned at 100
holding the largest allocation), but it is confounded, not decomposed. **Decision (reviewer
Q5, logged): ship with `XP_OVERFLOW_ENABLED = true`.** Confirming failed-hack exp *first*
would itself need a live session, and the very next live step (the post-restart signature,
then S7's A/B) measures the same thing with the fix already in place — a hollow overflow
can't sneak past the ≥3× gate unnoticed. If live validation undershoots, the diagnostic is
an A/B with `XP_OVERFLOW_ENABLED = false` (surplus idles, held targets only); a hollow
overflow reading routes to S7's outcome ladder as a re-scope discussion, not a silent
constant flip.

### Constants (identifier-hygiene pre-checked clean against `NetscriptDefinitions.d.ts`)

```js
const HACK_SEC_PER_THREAD = 0.002;  // hack's sec-add per thread per completion (S4 mechanics)
const HOLD_OVERSIZE = 1.25;         // stream margin over exact wave offset; floors at min harmlessly
const HOLD_HACK_WAVE = Math.floor(CRUSH_SEC_GAP / HACK_SEC_PER_THREAD); // 2,500 -- one wave <= one gap
const XP_OVERFLOW_ENABLED = true;   // surplus-beyond-held goes to targets[0] as pure hack
const XP_TOP_N = 4;                 // was 3: one overflow absorber + three fully-held targets
```

Retired: `HOLD_WEAKEN_FRAC` (delete the constant; nothing else may reference a RAM-fraction
split). Also pre-checked clean: `overflowHackThreadsLaunched`, `overflowGb`.

### Mechanical deltas for the implementer

- **`planXpJobs` stays pure but is restructured** from per-host round-robin to per-pass
  demand packing (order above). Requirements, not prescriptions: the per-target cap binds the
  cross-host sum; crush-wait ⇒ zero hack threads for that target but a full-wave-sized
  stream; overflow is a distinct job kind or flag (`kind: "overflow"` on hack jobs is
  suggested) so logging can separate it; deterministic for tests. The caller's `crushOk`
  ledger interface is unchanged.
- **No new ns calls.** The whole change is planner logic. `xpfarm.js` RAM gate expectation:
  **flat 5.85GB** (any movement ⇒ identifier hunt per the standing rule).
- **Log/tail:** per-target records gain `overflowHackThreadsLaunched` (nonzero only ever on
  `targets[0]`); `hackThreadsLaunched` now means *capped wave* hacks only, so the cap is
  directly assertable from the log (`hackThreadsLaunched ≤ 2500` on every record, every
  target). Top-level record gains `overflowGb` (RAM the overflow consumed this pass). Tail:
  `targets[0]`'s line gains an ` ovf <n>` suffix when overflow ran. Mode strings unchanged
  (`hold`/`crush`/`crush-wait`) — overflow is a field, not a mode. Engine-internal only; no
  daemon, sampling, or verify-log changes (`xpPool`'s schema is untouched).
- **Tests (`test/xpfarm.test.js`, extended AND corrected again):** S8's volley cases (sizing,
  cooldown gating, partial volley) survive with packing-model updates; the whole-host
  round-robin coverage case and the 84/16 RAM-split case test superseded behavior — **replace
  them**. New cases: cross-host wave cap (a huge host + a second host still sum ≤ 2,500 per
  target per pass); stream sizing bases per point 3 (`ceil(h × 0.05)` for an actual partial
  wave; full 125 for any over-gap target); **an over-gap target in mode `"crush"` — volley
  firing this very pass — gets zero hack threads** (reviewer B2's regression case), as does
  `"crush-wait"`, and its capacity reaches overflow; overflow absorbs the full remainder as
  pure hack on `targets[0]` and is tagged; `XP_OVERFLOW_ENABLED = false` leaves the remainder
  unspent; small-pool degenerate case (held demands consume everything, overflow = 0);
  single-eligible-target case (it is the absorber and its own held demand); volley precedence
  over stream/wave/overflow on a tight host; sub-weaken-thread hosts skipped.
- **Work items touched:** 3 (`xpfarm.js`) and 8 (tests) only.

### Live-validation deltas (step 3 and its S8 reading, rewritten under S9)

The expected post-restart signature, all from `logs/xpfarm-log.json` + snapshots:

1. **Cap holds:** every target record ever logged has `hackThreadsLaunched ≤ 2500`;
   `overflowHackThreadsLaunched` is large and only on `targets[0]`; `overflowGb` ≈ the pass's
   usable surplus on a big fleet.
2. **D1 fixed:** `targets[1..3]` — including high-req ones, the `syscore`/`alpha-ent`
   criterion that failed — hold within ~2 of min after their first crush-wait completes
   (~one weakenTime after adoption), and stay there. `targets[0]` is exempt whenever its
   overflow field is nonzero in the window. **Transient carve-out (reviewer B1): a held
   target may excurse — even pin at 100 — for up to ~1 hackTime + 1–2 weakenTimes after a
   cold-at-min adoption** (the in-flight waves launched before the first landing gave
   feedback; see decision point 2). The pass/fail distinguisher is **recovery**: a healthy
   target walks back to within ~2 of min within that window and then *stays*, with
   `hackThreadsLaunched = 0` on every over-gap pass; the D1 bug's signature was the
   opposite — hack waves continuing while over gap, and no recovery for as long as the
   allocation persisted (176 consecutive pinned samples). Post-restart adoptions arrive
   drifted and take the no-transient volley path, so the normal step-3 run shouldn't need
   the carve-out at all.
3. **D2 fixed — read it per-target from `xpfarm-log.json`, not from `xpPool` (reviewer N6):**
   on every under-gap held-target record, `(weakenThreadsLaunched − volleyThreadsLaunched) /
   hackThreadsLaunched ≈ 0.05` (was 0.185). `xpPool`'s aggregate in-flight W/H falling from
   ~0.6 toward ≲ 0.05 is the secondary, confounded corroboration (overflow's pure-hack bulk
   dominates it regardless of the stream fix); allow ~40–60 min after restart for the pre-S9
   weaken cohorts to decay out of it.
4. **Throughput:** exp/sec from `hacking-progress-log.json` should meet or beat the pre-S9
   measured **225,202 exp/sec** (analytic expectation: +30–40% from D2's weaken→hack
   conversion). Recorded, not gated — the ship gate remains S7's ≥ 3× A/B, unchanged.
5. **Step 4's window-B decay note:** in-flight decay is now dominated by overflow hacks at
   sec-100 durations (~10–15 min, longer than the old ~10-min estimate but far below 37-min
   weakens). Start window B when snapshots show `xpPool.inFlightRamGb` ≈ 0, not on a fixed
   timer.
6. **Fragmentation watch, re-scoped (reviewer N8):** overflow consumes ~100% of surplus every
   pass — a different fragmentation profile from the pre-S9 runs that live steps 1–2 already
   observed. Live step 7's S2 fragmentation watch (grow jobs failing to place) applies to the
   *post-S9* engine and should be re-observed, not carried over as already-passed.

### Checkpoint 2's open question (fleet size) — resolved

Confirmed live this session, not a stale artifact: the daemon tail read fleet 7.41PB at
6:21 PM, 11.02PB at 7:12 PM, and 16.00PB (50 hosts, util ~90%) at 8:11 PM —
`cloudmanager.js` is compounding ~$5b/min of hacking income into cloud upgrades ($7.2b
tiers) mid-session. The "early BN1.2, small fleet" framing is simply outdated; the economy
matured today. (The "util 2.3%" scare during this review was a dead daemon tail frozen at
6:21:51 PM — every `restart daemon.js` today orphaned its old tail because the close step
matches title `daemon.js` while `tailmanager.js` re-titles windows to `daemon`; ten stacked
orphans were closed live. Tooling bug filed in BACKLOG, out of this phase's scope.)

### Resume checklist (rewritten under S9 — replaces checkpoint 2's)

1. **[code]** Implement S9 in `src/xpfarm.js` + `test/xpfarm.test.js` per the deltas above;
   `npm test` green.
2. **[code→live]** RAM gate re-run (dev-server kill+restart + `dist/src/*` byte-check per
   standing rule): `xpfarm.js` expected **flat 5.85GB** (no new ns surface).
3. **[live]** Restart `daemon.js`; verify the five-point signature above, especially the
   `syscore`/`alpha-ent`-class convergence (live step 3's criterion, now scoped to
   `targets[1..3]`).
4. **[live]** Resume live validation at step 4 (A/B ship gate, with the revised window-B
   decay check), then steps 5–8 as written.
5. **[code]** Close-out per work item 9: BACKLOG/CHANGELOG entries + `git rm src/xpprobe.js`;
   all phase docs (S8 + S9 included) graduate to `docs/phases/`.
