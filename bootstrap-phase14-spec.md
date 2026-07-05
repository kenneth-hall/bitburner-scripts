# Phase 14 spec: cold-start bootstrap — 8GB home → daemon.js handoff

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner
watcher that syncs into the game). Requirements: `bootstrap-phase14-features.md`.

**Why now (live on the current save, 2026-07-05):** the hard reset left an 8GB home, hacking
level ~1, no TOR/port openers, no purchased servers. `daemon.js` measures 16.30GB and cannot
load until home reaches the 32GB tier (16.3 > 16 rules out the 16GB tier too), so the entire
automated income pipeline is offline. This phase adds a two-script bootstrap ladder — a
home-resident deployer (`bootstrap.js`) plus a self-contained remote worker (`bootloop.js`) —
that earns money on rooted network servers' RAM until the daemon fits on home, then execs
`daemon.js` and exits. Zero code changes to the existing pipeline.

**Handoff arithmetic the design rests on:** `daemon.js` needs ~19.3GB free at startup —
16.30GB for itself plus ~3.0GB for `killscripts.js`, which `runAndWait` runs *alongside* it
(other companions degrade gracefully via `launchDetached`'s INFO-skip; killscripts must fit
for a clean start). At a 32GB home with bootstrap resident (~6.0GB predicted), free ≈ 26GB ≥
19.3 — the handoff check passes at the 32GB tier with margin. `HOME_RESERVE_GB = 32` means a
32GB-home daemon runs entirely on rooted network servers' RAM — exactly the pool the
bootstrap has already warmed up. The handoff predicate uses live `getScriptRam` reads, so
these numbers are narrative, not constants baked into code.

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked
**[code]**. Kenneth does everything marked **[live]**. No [live] step requires editing code.

## Ground rules

- `CLAUDE.md` rules apply in full: verify every NS API signature/RAM cost against `markdown/`
  before use (do not trust this spec's numbers), no community solutions, don't read game
  source, no spoilers beyond current progression.
- **No Singularity calls anywhere in this phase** (the save has no SF4 — Phase 11 Round B
  confirmed purchase calls *throw*). Purchases stay manual; the nudge feature (S6) is
  tprint-only.
- **Transactions log: N/A this phase** — nothing here spends money, so no `recordTransaction`
  call sites and no `VALID_EXPENSE_SOURCES` change. Stated so the omission is visibly
  deliberate, not forgotten (features Decision 9).
- **Identifier hygiene (Phase 9's lesson):** no new identifier, property name, or object-literal
  key may exactly match an NS API function name unless it is a real `ns` call. This phase's
  danger zone is `bootloop.js`'s action dispatch — the action names must exist only as *string
  values* (`"weaken"` etc., which the analyzer doesn't charge) and real `ns.weaken/grow/hack`
  calls, never as object keys or identifiers. Check every new exported name
  (`chooseBootAction`, `pickBootstrapTarget`, `planBootDeployment`, `nextPurchaseNudge`,
  `parseBootControl`, `shouldHandOff`, `buildBootControl`) against `NetscriptDefinitions.d.ts`.
- Pure decision logic lives in exported ns-free functions, unit-tested mock-free in `test/`
  (vitest), following `test/`'s existing patterns. `bootloop.js` is import-free but still
  *exports* its pure helpers — exporting costs nothing and keeps them testable.
- Worktree/branch conventions as prior phases (suggest `worktree-phase14-bootstrap`);
  local-first, push/merge after live validation per the standing git authorization. Commit
  this spec + the features file with the code (push-phase-docs convention).
- **Kill+restart the dev server at the start of the RAM-gate step** (standing
  stale-connection workaround) rather than diagnosing a stale export reactively.

## Spec-stage decisions

The features file delegated these to the spec stage. Resolved here; the reviewer should
treat them as decided-with-rationale:

- **S1 — names: `bootstrap.js` + `bootloop.js`** (Kenneth's call, 2026-07-05, at the spec
  clarify gate). The collision with `resourcemanager.js`'s `bootstrap-server` reservation
  label was judged mild — one is a filename, the other a reservation key; they never share a
  UI. Matches the phase name, `bootstrap-log.json`, and BACKLOG's existing description.
- **S2 — target eligibility: `targets.js`'s level/2 heuristic first, plain `≤ level`
  fallback.** Candidates are the non-home hosts `getHosts` returns (all rooted by
  construction — the Phase 12 lesson baked in) with `maxMoney > 0` (which alone excludes
  purchased servers and home, both 0-max-money). Primary filter:
  `requiredHackingLevel < myHackLevel / 2` — the same strict-`<` semantics as `targets.js`'s
  `isEligibleTarget`, so the bootstrap ranks targets the way the pipeline it hands off to
  does. When the primary set is empty (level 1 at cold start: n00dles' req 1 fails
  `1 < 0.5`), fall back to `requiredHackingLevel ≤ myHackLevel`. Pick highest `maxMoney`
  within whichever tier applied (features Decision 6). Rationale: hack chance at req≈level is
  poor, but the fallback tier only exists for the first minutes of a cold start, when the
  loop is mostly weakening/growing anyway (both work regardless of hack chance and level
  climbs fast); the deployer re-picks each poll, so picks migrate into the primary tier
  quickly. Implemented as a self-contained pure `pickBootstrapTarget` in `bootstrap.js`
  rather than importing `isEligibleTarget` — the two-tier logic differs, and the
  rooted/purchased checks arrive with the candidate list, not inside the predicate.
- **S3 — bootloop thresholds: reuse the pipeline's drift constants.** The control file
  carries `securityEpsilon` and `moneyFraction`; `bootstrap.js` fills them by importing
  `DRIFT_SEC_EPSILON` (1) and `DRIFT_MONEY_FRACTION` (0.9) from `scheduler.js` (pure-math
  module, zero ns surface — importing constants is free under the reachability-based
  charging Phase 9 confirmed live). These are the exact boundaries the daemon treats as
  "prepped enough to hack", so the bootloop's weaken/grow/hack pivots match the batcher's
  notion of prepped. Tunable without redeploying code, per features Decision 3: a threshold
  change is a `bootstrap.js` edit (or a `scheduler.js` constant change) that flows to running
  loops through the next control-file re-scp — `bootloop.js` and the deployed processes are
  never touched.
- **S4 — control file: `bootstrap-control.json`, re-scp'd every poll.** Shape:
  `{ target, minSecurityLevel, maxMoney, securityEpsilon, moneyFraction }` (all keys checked:
  none exactly match an ns function name; `minSecurityLevel`/`maxMoney` already appear as
  object keys in `targets.js`). `bootstrap.js` `ns.write`s it locally (0GB) and `scp`s it
  with `bootloop.js` to every host in the deploy plan every poll — unconditionally, because
  scp is idempotent, already in the RAM budget, and "did content change" bookkeeping buys
  nothing. Running loops `ns.read` it fresh each iteration (0GB), so a target switch lands
  within one action-duration with no kill/redeploy (features Decision 3). A missing/corrupt
  read (pre-first-scp race, hand-deleted file) makes `bootloop.js` sleep ~5s and retry, never
  crash. Not added to `vite.config.ts`'s download filter — it's internal plumbing, not
  evidence; the log (S7) is the exported artifact.
- **S5 — deployment: top-up exec with a uniqueness arg.** Per poll, per host:
  `threads = floor(freeRam / bootloopRam)`; skip hosts where that's 0 (this covers home
  automatically — `getHosts` holds `HOME_RESERVE_GB = 32` back, so home reports 0 free below
  a 32GB home; no special case needed). Because running bootloops already occupy their RAM,
  the same formula naturally tops up only the *new* free RAM each poll — saturation emerges
  without tracking deployed state. **Each `exec` must pass a unique argument** (e.g.
  `Date.now()`): Bitburner refuses to start a second process with an identical
  script+host+args tuple, so an argless top-up exec would silently fail (pid 0) against the
  previous poll's instance. `bootloop.js` ignores its args. `bootloopRam` is read once at
  startup via `getScriptRam("bootloop.js")`.
- **S6 — purchase nudge: TOR first, then the cheapest unowned opener, each announced once.**
  Pure `nextPurchaseNudge({ money, hasTor, ownedProgramFiles })` returns the first
  crossed-affordability item in ladder order — `{ key: "tor-router", cost: TOR_ROUTER_COST }`
  while TOR is unowned, else the cheapest unowned entry of `PORT_OPENER_COSTS` — or `null`.
  **The opener nudge's `key` is the opener's `.file`** (e.g. `"BruteSSH.exe"`), *not* a
  constant `"next-port-opener"` like `resourcemanager.js`'s reservation key — a constant key
  would make the announced-once `Set` suppress every rung after the first, and live step 4
  requires the ladder to announce each rung once as ownership grows.
  Prices are **imported from `resourcemanager.js`** (verified at spec: `TOR_ROUTER_COST` and
  `PORT_OPENER_COSTS` are exported pure constants; importing them reaches no ns call, so the
  charge is zero under reachability-based charging — the RAM gate is the backstop, and the
  documented fallback is duplicating the values with a provenance comment, per features
  Decision 8). `main` tprints each nudge key at most once per session (a `Set` of announced
  keys) when cash first crosses the cost. Inputs cost: `getServerMoneyAvailable("home")`
  +0.10, `hasTorRouter` +0.05, ownership via `fileExists` (already charged through
  `getHosts`). Home RAM upgrade costs stay un-nudged — reading them is Singularity-gated; the
  in-game UI shows them.
- **S7 — exported log: `bootstrap-log.json`, ring-buffered, event-driven.** FIFO push+trim at
  500 entries (same shape as `resourcemanager.js`'s `appendFinanceLog`), `ns.write`n (0GB)
  only when an event fires — not per poll. Event kinds: `startup` (config echo: thresholds,
  bootloopRam), `new-hosts` (hostname-set diff vs. the previous poll — captures rooting
  pickups), `target-switch` (from, to, hacking level at switch), `deploy` (per poll that
  execs anything: `[{ host, threads }]`, target, total threads), `nudge` (key, cost),
  `handoff-blocked` (daemon exec returned pid 0 — see S8), `handoff` (freeRam at check,
  daemon pid). Every entry carries `timestamp`/`time` like the finance log.
  `vite.config.ts` gains one download-filter line
  (`if (file === 'bootstrap-log.json') return 'logs/bootstrap-log.json';`) plus a one-line
  comment slotting it into the ring-buffered family.
- **S8 — handoff: check first each poll, exec, exit; pid-0 keeps polling.** Poll order is
  handoff-check → (pass: hand off and exit) → deploy cycle, so a bootstrap started when the
  daemon already fits hands off on its first poll without deploying anything (features
  Decision 7's idempotency). Predicate: pure
  `shouldHandOff({ daemonRam, killscriptsRam, homeFreeRam })` →
  `daemonRam + killscriptsRam <= homeFreeRam`, fed by live
  `getScriptRam("daemon.js") + getScriptRam("killscripts.js")` against **raw** home free RAM
  (`getServerMaxRam("home") - getServerUsedRam("home")` — *not* `getHosts`'s home entry,
  whose freeRam has the 32GB reserve held back and would never pass). On pass:
  `exec("daemon.js", "home", 1)`; pid > 0 → log `handoff`, tprint, `return` (the daemon's
  killscripts sweep then clears every bootstrap remnant on home and killalls every remote —
  read at spec, confirmed). pid === 0 → tprint a loud WARN **including the hint that
  `daemon.js` may already be running** (exec refuses duplicate script+args tuples — the
  likeliest cause besides a RAM race), log `handoff-blocked`, keep polling (features'
  notify-only rejected-alternative surviving as the failure branch).
- **S9 — home leftover bootloop thread: dropped, not deferred.** Predicted numbers already
  miss (8 − 6.0 = 2.0 < 2.2), `getHosts` reports home free as 0 below a 32GB home so it
  would need a special case, and the gain is one ~2.2GB loop against a remote pool of
  hundreds of GB. Decision: `bootstrap.js` deploys to no host `getHosts` reports 0 free on,
  period. If the measured RAM gate surprises to the low side, treat a home thread as a
  post-phase idea, not a reopened work item.
- **Poll cadence: `POLL_MS = 10_000`**, matching the daemon's `CYCLE_MS` per the features
  file. Empty candidate list → the null-pick path in work item 2's `main` (skip
  deploy/logging for that poll, retry next poll — the handoff check still runs first).

## Design

### Work item 1 — `src/bootloop.js` [code]

Self-contained remote worker, **import-free by design** (it gets `scp`'d to hosts where
imports don't follow — same reason as `hack.js`/`grow.js`/`weaken.js`). Predicted 2.20GB:
base 1.6 + hack 0.1 + grow 0.15 + weaken 0.15 + getServerSecurityLevel 0.1 +
getServerMoneyAvailable 0.1 + read 0 + sleep 0.

- Exported pure `parseBootControl(raw)` → `{ ok: true, config }` for a well-formed control
  file (all five fields present, target a non-empty string, numbers finite), else
  `{ ok: false }` — missing file (`ns.read` returns `""`), garbage JSON, and
  wrong-shape JSON all land in the same retry path.
- Exported pure `chooseBootAction({ currentSecurity, minSecurityLevel, currentMoney,
  maxMoney, securityEpsilon, moneyFraction })` → `"weaken"` when
  `currentSecurity > minSecurityLevel + securityEpsilon`, else `"grow"` when
  `currentMoney < maxMoney * moneyFraction`, else `"hack"` — the same boundary semantics as
  the daemon's drift checks. Returns string values only; the dispatch in `main` is
  if/else over real `await ns.weaken/grow/hack(config.target)` calls (identifier hygiene —
  no action-name object keys).
- `main`: forever loop — read + parse `bootstrap-control.json`; on `ok: false`,
  `await ns.sleep(5000)` and retry; else read the target's live security/money, choose, act.
  Ignores `ns.args` (the exec uniqueness arg, S5).

### Work item 2 — `src/bootstrap.js` [code]

Home-resident deployer. Predicted 6.00GB: base 1.6 + `getHosts` surface 2.05 (scan 0.2,
fileExists 0.1, cloud.getServerNames 1.05, getHackingLevel 0.05, hasRootAccess 0.05,
getServerRequiredHackingLevel 0.1, getServerNumPortsRequired 0.1, five openers 0.25, nuke
0.05, getServerMaxRam/UsedRam 0.1) + scp 0.6 + exec 1.3 + getScriptRam 0.1 +
getServerMaxMoney 0.1 + getServerMinSecurityLevel 0.1 + getServerMoneyAvailable 0.1 +
hasTorRouter 0.05. Hard ceiling 8.0 (it must load on the 8GB home); re-verify each cost
against `markdown/` at implementation.

Imports (all reaching zero ns calls, per S3/S6): `getHosts` from `./hosts.js`;
`DRIFT_SEC_EPSILON`, `DRIFT_MONEY_FRACTION` from `./scheduler.js`; `TOR_ROUTER_COST`,
`PORT_OPENER_COSTS` from `./resourcemanager.js`.

Exported pure helpers (each unit-tested, work item 4):

- `pickBootstrapTarget(candidates, myHackLevel)` — per S2. `candidates`:
  `[{ hostname, maxMoney, requiredHackingLevel }]`, already rooted/money-filtered by the
  caller. Returns the picked candidate or `null`.
- `planBootDeployment(hosts, bootloopRam)` — `[{ hostname, threads }]` with
  `threads = floor(freeRam / bootloopRam)`, zero-thread hosts dropped (S5).
- `buildBootControl({ target, minSecurityLevel, maxMoney })` — folds in the imported drift
  constants, returns the S4 object (serialization is the caller's `JSON.stringify`).
- `nextPurchaseNudge({ money, hasTor, ownedProgramFiles })` — per S6.
- `shouldHandOff({ daemonRam, killscriptsRam, homeFreeRam })` — per S8 (`<=`, so
  exactly-fitting passes).
- `appendBootLog(entries, record)` — FIFO push+trim at 500, same shape as
  `resourcemanager.js`'s helper.

`main` (per ~10s poll): handoff check per S8 (exec daemon + exit on pass) → `getHosts()`
(rooting included — new hosts show up and get nuked here, nowhere else) → diff hostname set,
log `new-hosts` → build candidates: for every non-home host read `getServerMaxMoney` (keep
`> 0`) **and `getServerRequiredHackingLevel`** — the pick needs the level for *all*
candidates to decide the S2 tier, and once-per-name charging makes the extra calls free;
`getServerMinSecurityLevel` is read only for the picked target (the control file is the sole
consumer) → `pickBootstrapTarget`. **When the pick is `null`** (empty candidate list —
shouldn't happen given the 0-port set, but defensive): skip the control-write/scp/deploy and
the `target-switch` log entirely for this poll and just sleep (the handoff check already ran
at the top). Otherwise: on target change log `target-switch` → write + scp control file and
`bootloop.js` to every planned host, exec per S5, log `deploy` when anything launched →
nudge check per S6 → tail-popup status print (`ns.print`, 0GB: target, tier
(primary/fallback), total threads, host count, last nudge, handoff headroom) → sleep.
`ns.disableLog("ALL")` + `ns.ui.openTail()` at startup like the other daemons.

### Work item 3 — `vite.config.ts` export wiring [code]

The one-line download-filter entry + comment per S7. No other build/config changes
(`vitest.verify.config.ts`'s `test/verify-*.test.js` glob picks up work item 5's checker
automatically — verified at spec).

### Work item 4 — unit tests [code]

`test/bootloop.test.js` (imports from `../src/bootloop.js` — import-free module, trivially
ns-free at import time) and `test/bootstrap.test.js` (imports from `../src/bootstrap.js`,
whose own imports are ns-free at import time, same as existing suites):

- `chooseBootAction`: weaken above the epsilon boundary; **exactly at
  `minSecurityLevel + securityEpsilon` → not weaken** (strict `>`); grow below the money
  fraction; **exactly at `maxMoney * moneyFraction` → hack** (strict `<` for grow); the
  prepped state → hack.
- `parseBootControl`: well-formed round-trip; empty string (missing file); garbage JSON;
  valid JSON missing a field; non-finite number → all `ok: false`.
- `pickBootstrapTarget`: primary tier picked by maxMoney; **level-1 cold start → fallback
  tier returns n00dles-class candidate** (the phase's motivating case); primary non-empty →
  fallback candidates ignored even with higher maxMoney; boundary
  `requiredHackingLevel === myHackLevel / 2` exactly → fallback tier (strict `<` matches
  `isEligibleTarget`); empty candidates → `null`.
- `planBootDeployment`: floor math; zero-free host dropped; exact-multiple free RAM;
  bootloopRam bigger than every host → empty plan.
- `nextPurchaseNudge`: TOR unowned + affordable → tor-router; TOR unowned + unaffordable →
  null; TOR owned → cheapest unowned opener; ladder walks as `ownedProgramFiles` grows —
  **asserting two successive cheapest-unowned openers yield distinct `key`s** (the S6
  dedup-key fix); all owned → null; **exact-cost boundary** (money === cost → nudge fires,
  `>=`).
- `shouldHandOff`: under/over/**exactly equal** (passes).
- `appendBootLog`: trim at 500, FIFO order.

Existing suites untouched and green (`npm test`, 190 passing pre-phase).

### Work item 5 — `test/verify-bootstrap.test.js` log checker [code]

Same skip-clean pattern as `verify-finance.test.js` (built and confirmed against synthetic
fixtures before a real log exists): if `logs/bootstrap-log.json` is absent, skip cleanly;
if present, validate — every entry has a known `event` kind and `timestamp`; timestamps
non-decreasing; at most one `handoff` entry and, if present, nothing after it; `deploy`
entries carry a non-empty host list with positive integer threads; `target-switch` entries
have `from !== to`. Fixture tests for the checker itself in the existing
`test/checker-fixtures.test.js` style (pass, each violation class, skip). Runs under
`npm run verify:log` via the existing glob.

### Work item 6 — BACKLOG bookkeeping [code]

- Update the Phase 14 In Progress entry: spec stage done (dated), link this file, note the
  S1 naming decision.
- At implementation close-out (not now): move to Done with RAM-gate numbers and live
  results, and record the handoff as a pending live-validation milestone until it happens.

## RAM gate [code, via `ramcheck.js` → `logs/ramcheck-result.json`]

Kill+restart the dev server first (stale-connection workaround), then
`run ramcheck.js bootstrap.js bootloop.js daemon.js killscripts.js`:

| script | predicted | gate |
|---|---|---|
| `bootstrap.js` | **6.00 GB** | hard ceiling **< 8.00** (must load on the 8GB home with nothing else running); > 6.1 → identifier-hygiene hunt (Phase 9/11's `mem`-trace method) before proceeding |
| `bootloop.js` | **2.20 GB** | > 2.2 → hygiene hunt; every 0.05 here multiplies across the whole remote pool |
| `daemon.js` | **16.30 GB (flat)** | any delta is a bust — this phase touches nothing the daemon imports |
| `killscripts.js` | **3.00 GB** | first recorded baseline (features asked for this measurement); informational — the handoff predicate self-adjusts via live `getScriptRam`, so a miss here changes narrative numbers, not code |

A `bootstrap.js` bust that survives the hygiene hunt reopens features Decision 5 (lean
private `getHosts` copy, −1.05GB by dropping `cloud.getServerNames`) and, if the import of
`resourcemanager.js`/`scheduler.js` constants turns out to be charged despite Phase 9's
reachability finding, falls back to duplicating those constants with provenance comments.

## Live validation [live]

On the actual reset save, `npm run dev` running (auto-reconnect enabled; quick check after
restart).

1. **Pre-check:** `ls home` in-game — record which darkweb `.exe` files (if any) survived the
   hard reset (features open question; affects the initially rootable set, not the design).
   Report the list back for the phase record.
2. `run bootstrap.js`. Expect: tail popup opens; `INFO: rooted new host ...` tprints for the
   0-port set; loops visible on rooted servers (in-game `ps` on e.g. n00dles, or the log's
   `deploy` events); money and hacking level climbing within minutes.
3. `logs/bootstrap-log.json` appears and grows: `startup`, `new-hosts`, `deploy` events;
   `target-switch` events arrive as hacking level rises (fallback tier → primary tier within
   the first minutes is the expected shape).
4. **Nudges:** when cash first crosses $200k with no TOR, exactly one tor-router nudge
   tprint; after hand-buying TOR + an opener, the next nudge names the cheapest *unowned*
   opener and newly-rootable servers get picked up within one poll (`new-hosts` in the log).
5. `npm run verify:log` green — the new bootstrap checker validates the real log; daemon and
   transactions checkers skip or pass as their logs allow (no daemon log exists pre-handoff;
   skip-clean is the designed behavior).
6. **Handoff milestone (recorded, not merge-gating):** the day home reaches 32GB — bootstrap
   tprints the handoff, `daemon.js` comes up, killscripts sweeps every bootloop (in-game `ps`
   on a couple of remotes shows only daemon workers), `bootstrap-log.json`'s final entry is
   the `handoff` event. Until then this is an explicitly waived live check, same convention
   as the fleetupgrade waiver — say so in the close-out rather than claiming coverage.

## Acceptance criteria

- `npm test` green: all 190 pre-existing tests plus work item 4's new cases.
- `npm run verify:log` green with the new checker in the run (skip-clean before a real log
  exists; validating once one does).
- RAM gate table recorded in `logs/ramcheck-result.json` with `bootstrap.js` < 8.00,
  `bootloop.js` ≤ 2.20, `daemon.js` exactly flat at 16.30.
- Live steps 1–5 pass as described; step 6 recorded as the standing milestone.
- BACKLOG updated per work item 6.

## Files touched

`src/bootstrap.js` (new), `src/bootloop.js` (new), `vite.config.ts` (one filter line),
`test/bootstrap.test.js` (new), `test/bootloop.test.js` (new),
`test/verify-bootstrap.test.js` (new), `test/checker-fixtures.test.js` (new fixtures),
`BACKLOG.md`, plus this spec and `bootstrap-phase14-features.md` at repo root.

**Deliberately untouched:** `daemon.js`, `hosts.js`, `targets.js`, `scheduler.js`,
`sampling.js`, all workers, `killscripts.js`, `resourcemanager.js` /
`procureprograms.js` / `cloudmanager.js` (bootstrap only *imports* exported constants),
`translog.js` and the transactions checker (nothing spends — features Decision 9),
`package.json` / `vitest*.config.ts` (the verify glob already matches the new checker).
`daemon.js` does not launch or know about bootstrap (features Decision 11 — one-way ladder;
"daemon dies later" is handled by re-running the daemon, not bootstrap supervision).
