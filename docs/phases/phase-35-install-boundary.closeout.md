# Phase 35 close-out: the install boundary

**Stage:** implementation complete (sonnet, 2026-07-26), on branch `phase-35-install-boundary`.
T1 (`npm test`, 1013 tests) green. R1 and V1/V2 were also cleared this session, live, via the CDP
tooling (see below) — all three touched-script pairs (RAM figures, exported state shapes, in-game
behavior) checked out clean, so this closes out to merge-ready per the ship gate. V3/L4 (a real
instrumented install boundary + multi-boundary soak) are close-out deliverables, not merge
blockers, and land here once the node crosses its next boundary.

## R1 -- RAM gate: CLOSED, zero regression

Measured live via `ramcheck.js` (2026-07-26, `logs/ramcheck-result.json`) against each script's
documented baseline (daemon.js/resourcemanager.js/cloudmanager.js/bootstrap.js from the Phase 11
close-out commit history; goallog.js from `docs/scripts.md`; dashboard.js from its own header
comment) -- every one landed EXACTLY at baseline despite each carrying new functionality:

| Script | Measured | Baseline | Delta |
|---|---|---|---|
| `daemon.js` | 16.3 GB | 16.30 GB | 0 |
| `cloudmanager.js` | 6.25 GB | 6.25 GB | 0 |
| `resourcemanager.js` | 3.35 GB | 3.35 GB | 0 |
| `goallog.js` | 3.1 GB | ~3.1 GB | 0 |
| `dashboard.js` | 2.6 GB | 2.6 GB | 0 |
| `bootstrap.js` | 6.2 GB | 6.20 GB | 0 |

Confirms the spec's identifier-hygiene ground rule held: every addition really was `ns.read`/
`ns.write`/pure logic, with zero new billed `ns.*` surface anywhere across all six files.

## V1/V2 -- live smoke: CLEAN

Restarted all six touched scripts live (`daemon.js`, `cloudmanager.js`, `resourcemanager.js`,
`goallog.js`, `dashboard.js`; `bootstrap.js` is not restarted mid-session -- it only runs at a
boundary) and confirmed via screenshots + exported state:

- No RUNTIME ERROR popup on any restart.
- `targets-ranking.json` entries carry `hackJobGb` (confirmed: phantasy 878.9, max-hardware
  770.1, harakiri-sushi 649.4, ...).
- `goal-state.json` carries `income.perSec24h` (10,587.47) and a populated `liveness` block
  (`{status: "OK", reason: null, sinceMs, boundaryStartMs: null}` -- `boundaryStartMs` null is
  correct: no boundary has been crossed since this deploy, so the marker file doesn't exist yet).
- `finance-state.json`/dashboard's FINANCE panel: **the §3 pathology is gone live.** Before this
  phase, SQLInject ($250M) would have been reserved in full against ~$15M cash. With the new
  eligibility rule (8h * trailing income vs cost) and this node's income too low to qualify, the
  reservation correctly does NOT fire -- `available` is the full balance, not $0.
- `cloud-state.json`: `growth: {status: "waiting", ramGb: 1024, source: "ranking"}` present
  **alongside** a non-null `next` (upgrade plan) -- confirms the unconditional-growth-block fix
  (cold-review blocker 3) and the dashboard's growth-line precedence render correctly together.
  `ramGb: 1024` is the `GROWTH_RAM_MAX` clamp firing (the ranking's derived size exceeded it).
- GOAL panel renders `liveness: OK` in-session, first new line confirmed on the live tail.
- A stale local dev-server connection (found mid-session -- `logs/*.json` exports had frozen at
  16:59:30 while the in-game state kept moving, the documented "ESTABLISHED but not syncing"
  failure mode) was found and fixed as part of this verification, not left for Kenneth to
  rediscover.

## Work items shipped

1. **Boundary telemetry** -- `bootstrap.js` stamps `boundary-start.json` unconditionally at
   every boundary; `daemon.js` mirrors every `appendLogEvent`/`recordSkipEvent` record by
   reference into `boundary-log.json` (16h window, 5000-entry cap, lazy-only flush, compact).
2. **Growth-buy inversion** -- `cloudmanager.js`'s per-poll order is now bootstrap -> growth
   loop (ranking-derived size via `pickGrowthRam`, multiple buys/poll) -> upgrade loop (cold-start
   fallback only, via `growthPossible`). `daemon.js` publishes `hackJobGb` per ranking entry.
3. **Opener reservation fix** -- `resourcemanager.js`'s `next-port-opener` rule is now
   three-branch (cheap floor / eligibility+activation / hysteresis) via `computeOpenerActivation`;
   `goallog.js` publishes the trailing-24h income signal (`income.perSec24h`) it reads.
   Reservations now carry a `since` age (`stampReservationAges`).
4. **Factionless share suppress** -- `daemon.js`'s per-tick share fraction folds in
   `ns.getPlayer().factions.length === 0`.
5. **Floor-reserve cold-start seed** -- `daemon.js` seeds `lastKnownFloorBatchGb` from the
   previous session's persisted batch log at startup (`seedFloorReserve`, 30-min freshness guard).
6. **Liveness verdict** -- `goallog.js`'s `evalStuck` (8 branches) plus a GOAL-panel line
   (`dashboard.js`, `ROW_BUDGET` 60->61 / `DASHBOARD_H` 1306->1328 in lockstep).

A units bug was caught and fixed during test-writing: `computeOpenerActivation` initially
multiplied a millisecond constant (`OPENER_INCOME_HORIZON_MS`) directly against a $/SECOND
rate (`trailingIncomePerSec`), a 1000x error that would have made every income figure look
trivially sufficient to fund even SQLInject. Caught by a hysteresis-threading test
(`test/resourcemanager.test.js`), fixed by converting the ms constants to seconds before
multiplying.

## Work item 7 -- the interlock audit (D7)

Every state that can hold `available` at $0 (or the fleet at 0 growth) indefinitely, found by
grepping every `reservations.push`/`carveReservation` site and every `available`/`availableCash`
consumer in `src/`:

| State (trigger) | Bound or escape | Status |
|---|---|---|
| `next-port-opener` (expensive tier: HTTPWorm/SQLInject) | Bounded once *activated*: ~30 min (income-activated, fast-fund clause) or ~cost/(2*income) (money-activated). **Below activation there is no reservation and no pin at all** -- deletes the old pathology ($250M reserved against $5.3M cash). Residual: eligible-but-never-activated is a deliberate deferral (weak income is exactly when fleet compounding beats the opener); self-ending as fleet growth raises income. | **Fixed this phase** (decision 5) |
| `formulas` ($5b reservation) | Unbounded by design in nodes where it applies -- `hasFormulas` is `ns.fileExists("Formulas.exe","home")`, which is permanently `true` in BN5 (SF5 grant), so this reservation **can never fire here**. Elsewhere (BN1/BN2) it is a real, intentional $5b hold until the file lands. | Already bounded / moot in BN5 -- not touched |
| `manual-extra` | Manual by contract -- Kenneth controls `finance-reserve-extra.txt` directly; released the instant the file is removed/edited. | Already bounded -- not touched |
| `next-aug` (augfarmer's reservation) | Stale-guarded at `AUGFARMER_STALE_MS` (60s) -- a crashed/hung farmer's reservation self-clears within one minute rather than freezing fleet growth forever. | Already bounded -- not touched |
| `bootstrap-server` | Released the instant `cloudmanager.js` buys the first cloud server (one `ns.cloud.purchaseServer` call, no intermediate hold state). | Already bounded -- not touched |
| `tor-router` | Released once `procureprograms.js` (self-terminating fulfiller) buys TOR. | Already bounded -- not touched |
| augfarmer `fundBlocked` | A blocked purchase head previously reserved the WHOLE balance; now reserves only its own head's amount. | **Fixed 2026-07-25** (pre-Phase-35, referenced here for completeness) |
| floor-reserve carve (`memberReserveGb`) | A floor-seated member (pipeline cost > batch budget) reserves exactly one shrunk batch's cost, not the full pipeline (zeroes the waterfall) and not zero (starves the member) -- both extremes deadlocked live 2026-07-24. WI5 extends this fix across a daemon **restart**, where the reserve previously reset to 0 for a full multi-minute prep cycle. | **Fixed 2026-07-24, extended this phase** (WI5) |
| share carve (RAM, not money -- `SHARE_FRACTION` reservation) | The *factionless* pathology (share allocated with no faction to boost, at a fresh node entry) is fixed this phase. The "honest" pathology (joined a faction but not actively working it) stays unbuilt -- needs the ratchet's live-work state, which doesn't exist yet. | **Cheap version fixed this phase** (decision 8); honest version open, logged in `docs/batcher-engine.md` Sec4 |
| cloudmanager pre-install fleet spend | Money spent buying fleet RAM in the hours before an install gets wiped by that install -- cloudmanager has no concept of "an install is coming, stop buying fleet, save for the post-install NFG tail." | **Not fixed** -- adjacent to the existing `cloudmanager has no aug reserve` BACKLOG entry; this row exists so the gap is on record, not silently assumed away |
| `carveReservation` (xpfarm.js's RAM claim) | RAM only, not money; recomputed fresh every poll from `claim.claimGb` -- no persistent cross-tick hold beyond what's actively in-flight this tick. | Already bounded -- not touched |

**Completeness check:** every `reservations.push` call site in `src/resourcemanager.js` is
listed above (bootstrap-server, tor-router, next-port-opener x2 call sites/same key, formulas,
manual-extra, next-aug); both `carveReservation` call sites (`daemon.js`'s aggregate fleet
reserve, `xpfarm.js`'s claim) are RAM carves, not money holds, and are listed for completeness.
No `reservations.push` site or `available`/`availableCash` consumer was found without a row
above.

## Deferred / open

- **Delivery (decision 10):** the liveness verdict is logged and rendered, never pushed --
  Kenneth's explicit call at spec review. `BACKLOG.md`'s liveness-watch entry carries the
  mechanism correction (an OS-scheduler job on the always-on machine, not a `/schedule` cloud
  routine, which can't read local `logs/`) and its wake conditions.
- **F3 (Phase 34's install-bias bug):** measured, not fixed, this phase (decision 11) -- the
  boundary slice is exactly the instrument the recovery-cost term needs; `decideInstall` stays
  untouched until a real boundary produces a number.
- **V3/L4 (the phase's real test):** a fully-instrumented install boundary, and a multi-boundary
  soak, both require live play. Land the measured recovery cost + before/after dead-window
  duration here once available.
