# Phase 35 spec: the install boundary (telemetry, recovery levers, liveness logging)

**Stage:** spec (drafted fable 2026-07-26, from `phase-35-install-boundary.features.md`).
**Model flow:** brainstorm opus → this spec (fable) → cold review by `spec-reviewer` → implement (sonnet).
**Scope:** shrink the measured ~9–10h $0 window after every install and make its failures legible.
Eight work items across `bootstrap.js` / `daemon.js` / `cloudmanager.js` / `resourcemanager.js` /
`goallog.js` / `dashboard.js`, plus two analysis deliverables. **No external alerting or
OS-level automation** — Kenneth held that off at spec review (decision 10); the liveness verdict
is logged and rendered, not pushed. No `augfarmer.js` changes (F3's fix is measured here, built
later — decision 11).

## Context

The features doc's finding chain, in one paragraph: an install costs ~9–10h of exactly $0 income
(measured from `goal-log.json`'s 60s series), recurring ~8–12× this node ≈ 20–30% of BN5's wall
clock (§1). F1 pinned the cause: **money starvation, not prep** — the first post-install purchase
of any kind landed exactly 10h after the install, and recovery is a serial ladder
(money → opener → root → fleet → more money). F2 found the window has **no retained telemetry**
(the batch log FIFO-evicts and restarts truncate it), so the first action inverts: instrument the
boundary, then optimize. The healthy batcher measured **~$412k/s** (Q1 resolved), making fleet
size the node's dominant lever — which promotes the growth-buy inversion (D3/D9) and the
opener-reservation fix (D11/§3) to the phase's center. Detection of stalls already works
(GP2 wrote `STALLED` for 21.7h); delivery to a human does not (D5/D12).

**Two corrections to the features doc, found at spec stage (both narrow scope, neither reverses
a decision):**

1. **D4/D10 (pre-install home-RAM sweep / 128 GB floor) are already implemented.**
   `installer.js:63–99` walks `upgradeHomeRam()` then `upgradeHomeCores()` tiers in a
   `while (money >= cost)` loop **before every auto install**, logging each tier via
   `recordTransaction`. Residual cash at install time is already converted; what remains unspent
   is sub-tier remainder, which no design can capture (tiers are discrete). D10's 128 GB floor is
   additionally moot if home is already ≥256 GB (F5). Both close as **verify-and-document**
   (work item 8), zero new code. Kenneth's instinct was right and the code already agrees with it.
2. **D5's delivery mechanism premise is wrong in one particular.** A `/schedule` cloud routine
   survives session death, but it runs in a **cloud clone of the GitHub repo** — it cannot read
   the live `logs/` directory on Kenneth's machine, where every signal this phase cares about
   lands (none of `logs/` is pushed continuously). The thing that both survives sessions *and*
   sees the data is the **OS scheduler on the always-on machine** (sleep is disabled —
   [[reference_sleep_not_grind]]). That mechanism finding stands, but **building the reader is
   deferred by Kenneth's call at spec review (2026-07-26)** — no external alerting or OS-level
   automation this phase (decision 10). The correction is recorded in `BACKLOG.md`'s
   liveness-watch entry at ship, so the deferred delivery work starts from the right mechanism
   ("only a `/schedule` routine survives it" was half-right: session tools do die overnight,
   but a cloud routine can't see the data either).

## Ground rules

- **RAM must measure unchanged for every touched in-game script** (`daemon.js`,
  `cloudmanager.js`, `resourcemanager.js`, `goallog.js`, `dashboard.js`, `bootstrap.js`) —
  every addition is `ns.read`/`ns.write`/`ns.fileExists` (0 GB) or pure logic;
  `daemon.js` already pays `ns.getPlayer()` (L1557), so the share-suppress's `factions` read
  is free. Any surprise `ramcheck.js` reading is checked against the identifier-hygiene bug
  class first.
- **Identifier hygiene:** new identifiers are `boundaryStartMs`, `BOUNDARY_WINDOW_MS`,
  `BOUNDARY_LOG_MAX`, `BOUNDARY_LOG_FILE`, `BOUNDARY_START_FILE`, `hackJobGb`, `pickGrowthRam`,
  `growthRamGb`, `GROWTH_RAM_FALLBACK`, `GROWTH_RAM_MIN`, `GROWTH_RAM_MAX`, `perSec24h`,
  `trailingIncomePerSec`, `CHEAP_OPENER_FLOOR`, `OPENER_ACTIVATION_FRACTION`,
  `OPENER_INCOME_HORIZON_MS`, `OPENER_FAST_FUND_MS`, `prevOpenerActive`,
  `FLOOR_SEED_MAX_AGE_MS`, `evalStuck`, `liveness`, `STUCK_WINDOW_MS`, `STUCK_INCOME_FLOOR`,
  `BOUNDARY_GRACE_MS`, `stuckSince` — none exactly matches an `ns.*` method/property reachable
  from any namespace; keep it that way (no `ls`/`ps`/`share`/`exec`/`kill`-class short names,
  and never a bare `hack`/`grow`/`weaken` local).
- **Dashboard gate satisfied:** the features doc (D12, "Dashboard note") explicitly decided one
  new line on the existing GOAL panel — no new panel, no popup. `ROW_BUDGET` moves +1 **with
  its paired `DASHBOARD_H` bump** — the two move together per the file's own invariant
  (precedent: the 58→60 bump when GOAL gained its gate line, `dashboard.js:44–51`).
- **No new log file *for alerting*** (D12): the liveness verdict goes into `goal-state.json`.
  The boundary slice (work item 1) **is** a new file, and that is not a contradiction — D12
  rejected a *pre-digested copy of data we already retain*; work item 1 retains data we
  currently **lose** (FIFO eviction + restart truncation). Different purpose, and the features
  doc's F2 explicitly calls for it ("a non-evicting install-boundary slice").
- Every spend keeps its `recordTransaction` call site; this phase adds no new spend paths
  (it re-times existing ones).
- Tests: vitest units for every pure-function change; `npm run verify:log` stays green;
  live steps marked **[live]**. All numbers from our own logs/API reads; no game-source reading.
- **Existing-test policy** (Phase 34 decision 8's precedent, extended for a policy-change
  phase): *shape-extension* edits (new fields in `toEqual` maps) are expected and cite this
  spec. *Behavioral* edits split in two: tests pinning the **old growth-buy gate and old
  opener-reservation rule** are deliberately superseded — rewrite them against the new policy,
  each citing this spec (the policy change is the phase's point, not collateral). Any other
  expected-value change in an existing fixture is the stop-and-re-derive signal.

## Spec-stage decisions

1. **Sequencing: telemetry ships first, in the same branch, and nothing waits on a measured
   compressibility number (Q3 resolved by restructuring, not by answering).** F2 proved Q3
   ("is 9h compressible?") unanswerable from existing logs, and the features' own standing rule
   (`docs/batcher-engine.md:205`) forbids theorizing a number. But the recovery levers in this
   phase do **not** depend on that number — each is justified independently by F1's
   money-starvation reading: growth buys make the ladder's fleet rungs 2.4× cheaper per GB
   (measured, `BACKLOG.md:48`), and the opener fix un-pins `available` during exactly the
   window F1 showed is cash-bound. So work item 1 (telemetry) ships alongside the levers, and
   the *measured* before/after comparison is a close-out deliverable across the next 2–3 real
   boundaries — not a gate on shipping. Q3's answer becomes an output of this phase instead of
   an input.
2. **Boundary telemetry: `bootstrap.js` stamps the boundary, `daemon.js` mirrors its own log
   events into a per-boundary slice file.** `bootstrap.js` is the one script that runs at
   *every* boundary (it is `installAugmentations`' cbScript, and the manual entry point at node
   entry), so it writes `boundary-start.json` `{timestamp, time}` unconditionally at startup —
   overwriting the previous boundary's marker. `daemon.js` reads the marker at startup (one
   `ns.read`) and, while `now − boundaryStartMs < BOUNDARY_WINDOW_MS` (**16h** — comfortably
   past the observed ~10h), mirrors every log record into `boundary-log.json` (append, no FIFO
   eviction, hard-capped at `BOUNDARY_LOG_MAX = 5000` entries with a final `boundary-cap`
   record so truncation is explicit, not silent).
   **Mirroring hooks BOTH record producers (cold-review blocker 2):** `appendLogEvent` is
   *not* the single choke point — `recordSkipEvent` (`daemon.js:486–521`) pushes onto the ring
   directly and never calls it, and skip records carry the `diagnosis` block that is the
   *primary* evidence F2/Q3/L4 need. Both sites push **the same record object by reference**
   onto the boundary array (no deep copy): skip coalescing mutates the open record in place,
   and a shared reference means the boundary file's flush always serializes the record's
   *current* state — exactly the semantics the main log has — while `trimLog`'s eviction from
   the ring never touches the boundary array's reference. Flush semantics: the boundary file
   joins only the **lazy** flush cadence (never the immediate mode/enter/exit flushes), is
   written compact (no pretty-print, unlike the main log), and only when records were
   mirrored/mutated since the last write — bounding the added in-game write and export-bridge
   cost (cold-review major 5); L2 includes a no-jank check.
   On daemon restart inside the window, the mirror reads the existing slice and appends iff
   its `boundary-begin` stamp matches the current marker — restarts no longer truncate the
   record (each restart is itself visible as a `mode` event). One boundary per file,
   overwritten when the next boundary stamps a new marker: with an ~daily install cadence and
   near-daily sessions reading it, one retained boundary is enough; if two installs ever land
   before an analysis, the older slice is gone — accepted, logged as open question 2. Event
   volume is lowest exactly when the window is dead (few batches → few
   events), so the cap protects the tail without losing the starvation story. A manual
   `bootstrap.js` re-run mid-node restarts the window — acceptable (a cold restart is worth
   observing) and rare.
3. **Growth-buy policy inverts: growth buys take priority whenever one is affordable; the
   upgrade ladder remains the cold-start fallback (D3/D9 adopted; `GROWTH_RAM = 16` retired;
   cold-review blocker 1 resolved).** `cloudmanager.js`'s per-poll order becomes: bootstrap
   buy (unchanged) → **growth buys** while a slot is free AND `availableCash` covers a server
   at the derived size (loop, multiple per poll, bounded by `serverLimit` and cash) → **the
   upgrade loop runs only when no growth buy was possible this poll** (no free slot, no known
   size, or — the load-bearing case — the derived size is unaffordable). Why the fallback
   must survive: post-install the fleet is one 2 GB bootstrap server and cash is ~$110k;
   the derived growth size costs $3.5M+ — F1's own transaction evidence shows recovery
   starting with the $110k/$220k/$440k *upgrade* tiers, and a hard `slots-full-only` upgrade
   gate would delete the only affordable rung and lengthen the exact window this phase
   attacks. So: when growth is affordable it always wins (1× vs 2× $/GB, 2.4× measured live;
   BN5's `CloudServerSoftcapCost 1.2` penalizes big hosts; 207/207 skip diagnoses blocked by
   `total-ram`, never `per-host`); when it isn't, the doubling ladder spends what little
   there is, exactly as today. Accepted residual: small change trickles into 2× $/GB laggard
   upgrades while saving toward a growth buy — bounded by the growth cost itself and
   self-terminating once income covers hack-fit buys. Sub-hack-fit servers already owned are
   not special-cased — their RAM serves split grow/weaken jobs, and the upgrade phase levels
   them once slots fill (`planNextUpgrade` unchanged — the "then upgrade uniformly" half of
   D9).
4. **Growth-buy size is derived from the hack job, not a constant (F4's trap closed).**
   `daemon.js` publishes `hackJobGb` per ranking entry in `targets-ranking.json`
   (nominal full-`HACK_FRACTION` `t.hackThreads × ramCosts[hack]` — `hackThreads` comes from
   the `CYCLE_MS`-refreshed target plan, so the figure is refresh-cadence stale by up to one
   cycle; acceptable for *sizing a purchase*, noted so nobody treats it as live. Pre-shrink
   deliberately, so sizing is conservative; computed from values the daemon already holds, no
   new `ns` calls). `cloudmanager.js` reads the ranking file (0 GB) and buys at
   `pickGrowthRam(ranking, nowMs, ramLimit)` — `ranking` is the parsed file (staleness judged
   from its own `timestamp` field, the one `buildTargetsRanking` stamps) — returning the
   smallest power of two ≥ the **max `hackJobGb` across the top 3 ranked targets**, clamped to
   `[GROWTH_RAM_MIN = 64, min(GROWTH_RAM_MAX = 1024, ns.cloud.getRamLimit())]` (cold-review
   major 10: never above the node's cloud RAM limit). Top-3 because those are the targets a
   multi-member fleet actually seats; the max (not head-only) so a second member's larger hack
   job can't be orphaned. Clamp rationale: 64 floors out fresh-node n00dles-class jobs without
   manufacturing F4's fragmentation trap at 16 GB; 1024 caps a single buy so one whale target
   can't convert the whole bankroll into one host (the upgrade phase adds depth later, and the
   softcap makes giant single buys the worst $/GB in BN5). Ranking file missing/stale
   (>5 min by its `timestamp`) or `hackJobGb` absent → `GROWTH_RAM_FALLBACK = 512` (sized to
   F4's measured ~350–380 GB harakiri-class hack job, the worst real case observed). **F4's
   own caveat stands: this is a measurement, not a model** — ship this one tier policy, then
   read the next boundary's skip diagnoses; if `per-host` blockers appear, that is the reopen
   signal (live procedure L3). `HACK_FRACTION` is untouched this phase.
5. **Opener reservation: cheap floor + eligibility gate + late activation (D11/F1/§3/Q7
   resolved as one rule).** `computeReservations` gains `trailingIncomePerSec` (nullable) and
   the `next-port-opener` rule becomes:
   - **cost ≤ `CHEAP_OPENER_FLOOR = $5M`** (BruteSSH/FTPCrack/relaySMTP): always reserved in
     full — the ladder's first rungs are never blocked (F1: they *end* the $0 window).
   - **cost > floor** (HTTPWorm $30M, SQLInject $250M): reserved **only when both** hold —
     *eligibility*: `cost ≤ OPENER_INCOME_HORIZON_MS (8h) × trailingIncomePerSec` (Kenneth's
     D11 rule, measured against the trailing-**24h** window so the post-install $0 stretch
     can't zero the estimator — F1's flaw fix); and *activation* (either clause):
     `money ≥ OPENER_ACTIVATION_FRACTION (0.5) × cost`, **or**
     `cost ≤ trailingIncomePerSec × OPENER_FAST_FUND_MS (30 min)` — the second clause is
     what makes the bound below real (cold-review blocker 6): without it, other spenders
     (cloudmanager's growth loop, augfarmer) can hold cash below half-price indefinitely and
     the opener is never funded. With it, a healthy income activates the reservation
     immediately and the accumulation runs start-to-finish in ≤ ~30 min of income.
   - **Pin bound, honestly stated:** once *activated*, the reservation exists, `available`
     drops, cloudmanager stops spending, and money accumulates monotonically at ~income —
     so the `available = $0` stretch is bounded by ~`cost/income` from activation
     (≤ ~30 min when income-activated; ≤ ~`cost/(2×income)` when money-activated). *Below*
     activation there is no reservation and no pin at all — that deletes §3's live pathology
     ($250M reserved against $5.3M cash). The residual case — eligible but never activated
     because income is weak and cash never accumulates — is a *deliberate deferral* (weak
     income is exactly when fleet compounding beats a $250M opener), is self-ending (fleet
     growth raises income until the fast-fund clause fires), and gets a row in decision 12's
     audit table naming that argument rather than a silent assumption.
   - **Hysteresis (cold-review M3):** both gates get bands so the reservation can't
     flap at the 2 s poll — activation releases only below `0.35 × cost` (augfarmer buys can
     legitimately drop cash after activation), and an eligible opener stays eligible until
     `cost > 8h × income × 1.25`. Implemented purely: `computeReservations` takes a
     `prevOpenerActive` boolean (caller threads last poll's value), keeping the function
     unit-testable. This protects `finance-log.json` (500-entry FIFO) from churn and —
     load-bearing — keeps decision 7's `since` age stable, which the `reservation-pin`
     liveness branch depends on.
   - `trailingIncomePerSec` null (missing/stale signal, or a fresh node's cleared series) →
     floor-only mode: cheap openers reserved, expensive ones not — conservative toward fleet
     growth, self-correcting as the series warms. Purchasing is untouched:
     `procureprograms.js` still buys on live cash; this rule only re-times what the
     *reservation* fences off from other spenders. Rejected alternatives (full pin = §3's
     deadlock; no reservation ever = the opener fund starves; income-proportional half-split
     = stateful ratchet for marginal gain) noted here for the record.
6. **Trailing income signal: `goallog.js` publishes `perSec24h`.** One line in
   `buildSnapshot`: `perSec24h = computeRateRange(list, nowMs − 24h, nowMs, "total")` (the
   ring holds 48h — ample). `resourcemanager.js` reads `goal-state.json` per poll (`ns.read`,
   0 GB; it is a small snapshot, not the ring), takes `income.perSec24h`, and treats a
   missing/unparseable/stale (>5 min by its own `timestamp`) snapshot as null. The node-entry
   reset guard already clears the series at hard resets, so a fresh node genuinely reads null →
   floor-only, which is correct there.
7. **Reservations carry an age (Q7's second half).** `resourcemanager.js`'s main loop keeps a
   `key → firstSeenMs` map (in-memory; reset on restart is fine — the map re-seeds within one
   poll and installs restart the process anyway) and stamps each reservation entry in
   `finance-state.json` with `since`. Additive field; consumers read tolerantly. This is what
   makes "reservation held while `available` is $0 for N hours" a detectable state (decision 9's
   predicate uses it) instead of a silent one.
8. **Share suppress: factionless ⇒ share fraction 0 (D8a, the cheap-90% version).** In
   `daemon.js`'s per-tick share block (L798–807): `effectiveShareFraction = (shareOff ||
   ns.getPlayer().factions.length === 0) ? 0 : SHARE_FRACTION`. The transition prints one INFO
   line and fires `recordModeEvent()` exactly like the marker toggle (reuse the existing
   change-detection seam; the mode event's `shareOff` field is joined by a `factionless`
   boolean so logs distinguish the two suppressions). The honest version (joined-but-not-
   working) stays unbuilt — it needs the ratchet's live work state and the cheap version
   covers both recorded incidents (both were zero-faction node entries); logged as a
   `batcher-engine.md` §4 residual with its wake condition.
9. **Liveness predicate: `evalStuck` in `goallog.js`, verdict beside GP2 (D6/D12).** Pure
   exported function:
   `evalStuck({series, daemonStatus, financeState, boundaryStartMs, nowMs})` →
   `{status, reason}` with `status ∈ {"OK","STUCK","WARMING","BOUNDARY"}`. Rules, in order
   (first match wins):
   - series span < 2h → `WARMING` (mirrors GP2's warming stance; a fresh node isn't judged).
   - `boundaryStartMs` present (null/absent ⇒ this rule is skipped entirely — the marker
     doesn't exist until the first post-deploy boundary; cold-review major 1) and
     `nowMs − boundaryStartMs < BOUNDARY_GRACE_MS = 4h` → `BOUNDARY` (a boundary window is
     *expected* to look dead; alerting inside it is noise).
   - `daemonStatus` null or its timestamp > 10 min old → `STUCK` / `"daemon-dead"` (goallog
     runs in-game reading in-game files, so staleness here is genuine daemon death, not the
     export bridge).
   - trailing-2h income (`computeRateRange`, `STUCK_WINDOW_MS = 2h`): a **null** return
     (sparse series, gap, reset) is treated as *no measurement*, never as below-floor —
     `null < floor` coerces true in JS and would turn every series gap into a STUCK alert
     (cold-review major 2); null income → `OK` with no dead-signature evaluation. A real
     number < `STUCK_INCOME_FLOOR = $1/s` **and** one of, checked in order:
     `warns.skipServers` non-empty ∧ `utilizationPct < 5` → `"starved"` (the floor-carve
     shape); `available === 0` ∧ some reservation's `since` age > 2h → `"reservation-pin"`
     (the fundBlocked/§3 shape); `batchesInFlight === 0` ∧ `utilizationPct < 5` → `"idle"`
     (catch-all dead) — except: if `boundaryStartMs` is within `BOUNDARY_WINDOW_MS` (16h) but
     past grace, the reason is reported as **`"boundary-overrun"`** instead of the signature
     name (cold-review major 4: a dead engine 4h+ into a boundary is a *true* alarm by this
     phase's own thesis — today's window runs ~10h and the phase exists to shrink it — and
     naming it distinctly is what lets L4 score verdicts: `boundary-overrun` during a boundary
     is expected/true, a signature-named STUCK outside one is either real or a tuning bug).
     Else `OK`.
   - Legit multi-hour prep windows don't fire: prep is grow/weaken holding RAM, so
     `utilizationPct` is high and no dead signature matches (D6's tolerance requirement,
     pinned by a unit fixture).
   Wiring (cold-review major 8): `main()` does the two extra file reads
   (`daemon-status.json`, `finance-state.json` — `ns.read`, 0 GB) plus the boundary marker,
   calls `evalStuck`, tracks `stuckSince` (first sample of the current non-OK status; reset on
   status change) in a local, and passes the assembled block to `buildSnapshot` as a **fourth
   optional parameter** (`buildSnapshot(series, augState, nowMs, liveness = null)`) — additive,
   so existing three-arg callers/tests are untouched and new fixtures can assert on
   `buildSnapshot` output directly. Snapshot shape:
   `liveness: {status, reason, sinceMs, boundaryStartMs}` beside `tripwire` — `sinceMs` feeds
   the dashboard's STUCK elapsed figure, `boundaryStartMs` its boundary-elapsed figure, so the
   exact-string panel tests have a pinned derivation. GP2 itself is untouched (features
   correction: it is not broken).
10. **Delivery is DEFERRED — the verdict is logged and rendered, never pushed (Kenneth's
    call at spec review, 2026-07-26).** The features' D5 asked for one delivery path for
    detectors that already fire; the drafted version was a Windows scheduled task POSTing to
    ntfy.sh, and Kenneth held it off: *no noisy alerting, no external automation this phase —
    logging the discrepancy is fine.* So what ships is the detection-and-logging half only:
    `evalStuck`'s verdict in `goal-state.json` (decision 9) and the one GOAL-panel line —
    visible at a glance in-session and in the exported log, written nowhere else.
    **Accepted consequence, stated plainly:** an overnight STUCK is still only *seen* at the
    next session open. This phase shrinks time-to-**diagnosis** (the verdict is one glance
    instead of a multi-file log dig — the 21.7h-of-unread-`STALLED` failure becomes a one-line
    read), not time-to-**notice**. The unattended-gap reader stays open in `BACKLOG.md`'s
    liveness-watch entry, updated at ship with (a) the spec-stage mechanism correction
    (Context correction 2 — a `/schedule` cloud routine cannot read local `logs/`; an
    OS-scheduler job on the always-on machine is the viable shape), and (b) its wake
    conditions: another stall that sits unread across a no-session gap, or Kenneth opting in.
    Per the dropped-objections rule, the objection on record: both prior incidents (11h and
    53h) were overnight/no-session windows that in-session surfaces cannot cover — if a third
    such window eats a day, that is the predicted failure occurring, and the entry says so.
11. **F3 (Phase 34's install-bias bug) gets its measurement here, not its fix.** The
    boundary slice + `goal-log.json` + the daily transactions log are exactly the inputs the
    recovery-cost term needs (`income lost during recovery`, a node-structural quantity — the
    BACKLOG entry's analysis of why a constant bump was wrong and got reverted stands). After
    the first fully-instrumented boundary, the close-out computes the measured recovery cost
    and updates the BACKLOG entry with the number and the recommended term shape.
    `decideInstall` itself is untouched this phase: it is live, load-bearing, test-covered
    code whose fix has a designed-but-unmeasured input, and changing it pre-measurement is
    the exact antipattern the reverted constant bump already demonstrated. Accepted cost:
    the install trigger stays optimistic for the 1–2 cycles until the measurement lands —
    bounded (~10h per extra install) and smaller than a wrong fix.
12. **The interlock audit (D7) is an enumeration with a completeness rule, not a refactor.**
    Deliverable: a table in the phase close-out listing **every state that can hold
    `available` at $0 (or the fleet at 0 growth) indefinitely**, each row = trigger, bound or
    escape, and status (fixed this phase / already bounded / BACKLOG entry with wake
    condition). Seed list from evidence in hand: the opener reservation (fixed, decision 5),
    `formulas` $5b reservation (can't fire in BN5 — `hasFormulas` is true; unbounded by
    design elsewhere, row documents it), `manual-extra` (manual by contract), `next-aug`
    reservation (stale-guarded at 60s), augfarmer `fundBlocked` (fixed 07-25), floor-reserve
    carve (fixed 07-24), share carve (fixed, decision 8), cloudmanager pre-install fleet
    spend (money burned buying fleet the install wipes — adjacent to the cloudmanager-
    aug-reserve BACKLOG entry, gets a row pointing there, not a fix). Completeness rule:
    grep every `reservations.push` site and every `available`-consumer; any hold found
    without a bound gets a row. No `augfarmer.js` state-machine rewrite (R5 stands).

## Design

### Work item 1 — boundary telemetry [code]

`bootstrap.js`: at the top of `main()`, write `BOUNDARY_START_FILE = "boundary-start.json"`
with `{timestamp: Date.now(), time: …}` (one `ns.write`, 0 GB).
`daemon.js`: at startup, `ns.read` the marker into `boundaryStartMs` (0/absent → no mirroring);
read `BOUNDARY_LOG_FILE = "boundary-log.json"` and keep its parsed array in memory iff its
`boundary-begin` stamp matches the current marker (else start a fresh array stamped with a
`boundary-begin` record `{boundaryStartMs, daemonStartMs}`). Mirroring per decision 2: **both**
`appendLogEvent` and `recordSkipEvent` push the same record object **by reference** onto the
boundary array while `Date.now() − boundaryStartMs < BOUNDARY_WINDOW_MS = 16h` (skip
coalescing's in-place mutations flow through to the next flush automatically); cap at
`BOUNDARY_LOG_MAX = 5000` (append one `boundary-cap` record, then stop mirroring). Flush:
lazy cadence only, compact JSON, skip the write when nothing was mirrored or mutated since
the last one. `vite.config.ts` gains export lines for `boundary-log.json` and
`boundary-start.json`.

### Work item 2 — growth-buy inversion [code]

`daemon.js`: add `hackJobGb` to each `targets-ranking.json` entry (L1423–1431 block):
`t.hackThreads * ramCosts[WORKER_SCRIPTS.hack]`, null-tolerant, staleness noted per decision 4.
`cloudmanager.js`: new pure `pickGrowthRam(ranking, nowMs, ramLimit)` per decision 4
(top-3 max, next-pow-2, clamp [64, min(1024, ramLimit)], fallback 512 on missing/stale).
Replace `shouldBuyGrowthServer`'s `fleet.every(ram >= ramLimit)` gate with a slots-free check
(keep the empty-fleet-never-growth-buys guard — bootstrap's job). Poll order per decision 3:
bootstrap → growth loop (multiple buys per poll while slot free + size known + cash covers the
derived size; each buy logs `recordTransaction` `auto-cloud-purchase` exactly as today) →
upgrade loop **only when this poll placed no growth buy and none is affordable** (the
cold-start fallback).
**`cloud-state.json` emit condition changes (cold-review blocker 3):** today the `growth`
block is only written when `!nextPlan`, which the new policy makes permanently false — it
becomes unconditional: `growth: {status, ramGb, source: "ranking"|"fallback"}` whenever a
slot is free (`status` ∈ bought/waiting/failing/available as today), `{status: "at-limit"}`
when full. `dashboard.js`'s cloud panel renders the growth line **in preference to** the
next-upgrade line while slots are free (they were mutually exclusive before; keeping them so
means no cloud-panel row-count change). The retired constant `GROWTH_RAM = 16` is deleted,
not left dead.

### Work item 3 — opener reservation + income signal + ages [code]

`goallog.js`: `buildSnapshot` adds `income.perSec24h` (decision 6).
`resourcemanager.js`: `computeReservations` gains `trailingIncomePerSec` and implements
decision 5's three-branch opener rule (constants exported beside `PORT_OPENER_COSTS`);
`main()` reads `goal-state.json` per poll with a 5-min staleness check, and stamps `since`
per decision 7. `finance-log.json` records are unchanged in shape (the reservation list
entries just carry the extra field).

### Work item 4 — share factionless suppress [code]

`daemon.js` per decision 8: fold `ns.getPlayer().factions.length === 0` into the per-tick
share-fraction computation, INFO once per transition, `factionless` added to the mode event.

### Work item 5 — floor-reserve cold-start seed [code]

`daemon.js` startup: one additional read (of `daemon-batch-log.json` — a *different* file
from work item 1's `boundary-log.json`; two new startup reads total, the daemon currently
reads neither): take the **newest skip record per server** and seed `lastKnownFloorBatchGb`
with its `diagnosis.batchCostGb` (tolerant of absent file/fields).
**Freshness guard (cold-review blocker 5):** only records whose timestamp is within
`FLOOR_SEED_MAX_AGE_MS = 30 min` of daemon start are eligible. The batch log *survives an
install while the fleet does not* — an unguarded seed would carry a pre-install 545–1083 GB
figure into a 2 GB post-install fleet, and `memberReserveGb`'s uncapped
`max(0, floor − inFlight)` would zero the waterfall on tick 1: the exact 11h deadlock
(`batcher-engine.md:129`) this item cites. The 30-min window covers the case the seed exists
for (a daemon *restart* on a live fleet, where records are seconds old) and excludes
boundary-crossing records by construction (post-install, the log's newest entries predate
the install by hours). A pinned unit fixture feeds a pre-install-aged record and asserts no
seed. Closes `docs/batcher-engine.md:217`'s open item: tick 1 of a restart no longer
reserves 0 and hands the fleet to a multi-minute prep.

### Work item 6 — liveness verdict + GOAL line [code]

`goallog.js`: `evalStuck` per decision 9 (pure, exported, unit-tested); `main()` reads
`daemon-status.json` + `finance-state.json` + the boundary marker, tracks `stuckSince`, and
passes the `liveness` block as `buildSnapshot`'s new fourth optional parameter (decision 9's
wiring).
`dashboard.js`: `goalPanel` renders exactly one new line, forms pinned for exact-string tests
(elapsed figures derived from `sinceMs` / `boundaryStartMs`, 1 decimal):
`liveness: OK` / `liveness: warming up` / `liveness: boundary window (2.1h)` /
`WARN: liveness STUCK 3.2h -- reservation-pin`. **`ROW_BUDGET` +1 (60 → 61) and
`DASHBOARD_H` bumped in the same edit** — the file's own invariant says the two move together
or the no-scroll guarantee breaks (`dashboard.js:44–51`; cold-review blocker 4); the pixel
delta is the per-row step derivable from the 58→60 precedent commit, and headroom exists
(bottom 1327 vs 1392 usable).

### Work item 7 — interlock audit [code-stage analysis]

Per decision 12: the grep-driven enumeration, table in the close-out, BACKLOG rows for
anything unbounded and unfixed. No behavior change beyond what other work items already make.

### Work item 8 — verifications, docs, BACKLOG [code + live]

- **[live]** One-line home-RAM read (`ns.getServerMaxRam("home")` via a throwaway probe logged
  to `logs/` per the one-off convention, or the CDP terminal) + grep
  `logs/transactions-2026-07-26.json` for `home-ram-upgrade` records at the 05:17 install →
  closes D4/D10 as already-implemented (Context correction 1); result recorded in
  `docs/reset-protocol.md` (the "money is burned at install" line gets the installer-sweep
  caveat) and the close-out.
- Docs: `docs/batcher-engine.md` §2/§4 updates (boundary telemetry exists; share suppress
  shipped, honest-version residual; floor-seed closed), `BACKLOG.md` — the growth-buy entry
  resolves into a CHANGELOG line at ship; the **liveness-watch entry stays open, rewritten**
  per decision 10 (detection/logging half shipped, delivery half deferred by Kenneth's call,
  the `/schedule`-can't-read-`logs/` mechanism correction, and the wake conditions); the
  Phase 34 bug entry gets decision 11's measurement plan. Phase docs graduate to
  `docs/phases/` with the ship commit.

## Tests [code]

- **`cloudmanager`**: `pickGrowthRam` units (top-3 max, pow-2 rounding, clamps both ends
  including the `ramLimit` ceiling, fallback on stale/missing/absent-field); policy units —
  growth buy wins when affordable, upgrade loop runs when growth is unaffordable (the
  cold-start fixture: 2 GB fleet, $110k cash → upgrade path taken), upgrades-only when slots
  full, empty fleet still never growth-buys; `growth` block emitted with a free slot even
  while `nextPlan` is non-null (blocker-3 pin); old-policy tests rewritten citing this spec
  (ground-rules policy).
- **`resourcemanager`**: `computeReservations` opener-rule units — cheap floor always
  reserved; expensive opener absent below activation (the §3 fixture: SQLInject $250M,
  money $5.3M, stale/low income → **no** `next-port-opener` reservation, `available` > 0);
  present via the money clause (≥ 0.5×cost) and separately via the fast-fund clause
  (income × 30 min ≥ cost at low cash — the healthy-income $412k/s fixture); absent when
  ineligible (8h × income < cost); null income → floor-only; hysteresis pins (active stays
  active at 0.4×cost, releases below 0.35; eligibility persists to 1.25× the threshold);
  boundary values pinned (activation exactly at 0.5×cost arms — `>=`). `since` stamping unit
  (stable across polls and across hysteresis-held states, resets when a key disappears and
  returns).
- **`goallog`**: `perSec24h` unit; `evalStuck` fixtures — one per rule branch (warming,
  boundary grace, daemon-dead, starved, reservation-pin, idle, boundary-overrun, OK), plus
  the three must-not-fire fixtures: a synthetic prep window (high utilization, $0 income →
  OK), the boundary window inside grace, and **null-income-from-a-series-gap → OK, never
  STUCK** (major-2 pin) — plus null `boundaryStartMs` → boundary rules skipped (major-1
  pin). `buildSnapshot` four-arg passthrough + three-arg back-compat (`liveness: null`).
  Fixture shapes mirror real exported records.
- **`dashboard`**: `goalPanel` exact-string cases for all four liveness forms; ROW_BUDGET/
  DASHBOARD_H assertions updated together (shape-extension); cloud panel growth-line
  precedence case.
- **`daemon`/`scheduler`**: `hackJobGb` presence in the ranking entry builder's output; the
  floor-seed helper extracted pure and tested — fresh record seeds, pre-install-aged record
  does **not** (blocker-5 pin); boundary-mirror helper unit (mirrors from both event kinds,
  respects window + cap, shared-reference semantics asserted by mutating a skip record after
  mirror and observing the mirrored copy).
- `npm run verify:log`: additive-field tolerance verified at implementation for
  `finance-state`/`goal-state`/`cloud-state`/ranking checkers; if any checker whitelists
  keys, extend it citing this spec. **`test/verify-finance.test.js`'s
  `KNOWN_RESERVATION_KEYS` gains `next-aug` in this phase** (cold-review major 9): the
  BACKLOG entry's stated reason for deferring — "no `resourcemanager.js` file was touched
  this phase" — no longer applies, and T2 is not honestly assertable while a real exported
  log fails the checker; the BACKLOG entry resolves with it.

## Live procedure [live]

- **L1 (immediate, after deploy + `restart daemon.js`, `restart cloudmanager.js`,
  `restart resourcemanager.js`, `restart goallog.js`, `restart dashboard.js`):**
  `targets-ranking.json` entries carry `hackJobGb`; `goal-state.json` carries
  `income.perSec24h` + a populated `liveness` block; `finance-state.json` reservations carry
  `since` and — given current cash ≪ half of SQLInject — **no** `next-port-opener` $250M
  reservation (`available` > 0 for the first time in days); GOAL panel shows the liveness
  line; no RUNTIME ERROR popup (CDP check per CLAUDE.md).
- **L2 (within ~an hour):** `cloud-state.json`/transactions show growth buys landing at the
  ranking-derived size (expect 512 GB against today's harakiri-class head target), slots
  filling; fleet total GB climbing at ~2.4× the prior $/GB; no in-game jank/perceptible hitch
  from the boundary flush (decision 2's write-cost check — Kenneth's read on feel, plus no
  new WARN lines).
- **L3 (next install boundary — the phase's real test):** `boundary-log.json` spans from
  bootstrap hand-off through recovery across any daemon restarts; the close-out computes the
  window's breakdown (F2 deliverable), the measured recovery cost for the Phase 34 entry
  (decision 11), a fresh steady-state $/s (Q1's re-measure caveat), and the before/after dead-
  window duration. **Reopen signal:** `per-host` blockers appearing in skip diagnoses after
  the growth-buy change (F4's trap surfacing) — that reopens decision 4's sizing, per the
  features' "try one tier, measure" stance.
- **L4 (soak, ~3 boundaries):** dead-window duration trend across installs recorded in the
  close-out. Verdict scoring per decision 9's reason vocabulary (verdicts are read from
  `goal-state.json`/the GOAL panel — nothing is pushed, per decision 10): a
  `boundary-overrun` STUCK during an install boundary is an **expected true positive** (the
  window still exceeds grace — the phase's own thesis); a signature-named STUCK
  (`starved`/`reservation-pin`/`idle`) outside a boundary is either a real incident (act on
  it) or a predicate-tuning bug (fix constants first, redesign only after two failed tunings
  per the three-invalidations rule). A STUCK during a *legitimate prep window* is always a
  false positive.

## Acceptance criteria

Test-gated (Claude clears): **T1** `npm test` green including every unit above, existing-test
policy applied; **T2** `npm run verify:log` green post-deploy against real logs.

RAM-gated [live]: **R1** all six touched in-game scripts measure unchanged vs their current
`ramcheck.js` baselines; surprises checked against identifier-hygiene first.

Live-gated [live]: **V1** = L1 (new fields + un-pinned `available` + clean restarts);
**V2** = L2 (growth buys at derived size, no flush jank); **V3** = L3 (one fully-instrumented
boundary with its analysis in the close-out — this is the criterion that discharges F2 and
prices Q3/F3). L4 spans days — lands in the close-out like Phase 34's V2, with L3's reopen
signal as its failure handler.

Ship gate per CLAUDE.md: T1/T2 self-cleared; R1/V1–V2 wait on Kenneth's in-game run;
then merge + push without further sign-off. V3 is a close-out deliverable, not a merge blocker
(the next install can be days out and the telemetry must be live *before* it to capture it).

## Files touched

- `src/bootstrap.js` — boundary marker write
- `src/daemon.js` — boundary mirror + startup seed read, `hackJobGb` publish, share
  factionless suppress
- `src/cloudmanager.js` — growth-buy inversion, `pickGrowthRam`, poll reorder
- `src/resourcemanager.js` — opener reservation rule, `trailingIncomePerSec`, `since` ages
- `src/goallog.js` — `perSec24h`, `evalStuck`, `liveness` snapshot block
- `src/dashboard.js` — GOAL liveness line, ROW_BUDGET +1
- `vite.config.ts` — boundary file exports
- `test/` — units per the Tests section
- `BACKLOG.md`, `docs/batcher-engine.md`, `docs/reset-protocol.md` (+ CHANGELOG/doc
  graduation at ship)

## Open questions (log, don't block)

1. **Every liveness/opener constant is provisional** (`STUCK_WINDOW_MS` 2h, grace 4h,
   activation 0.5, floor $5M, horizon 8h, clamp [64, 1024], fallback 512). Each rides in an
   observable file; tune on evidence, redesign only after two failed tunings (the
   three-invalidations rule).
2. **Single retained boundary slice.** Two installs before an analysis lose the older one;
   accepted for v1 (near-daily session cadence makes it unlikely). Revisit if it actually
   bites.
3. **The honest share suppress** (joined-but-not-working) stays unbuilt until a node entry
   where the cheap version's gap shows — logged in `batcher-engine.md` §4 with that wake
   condition.
4. **Deferred delivery (decision 10).** Not an open *design* question — the mechanism is
   settled (OS scheduler, not `/schedule`) — but the deferral carries its wake conditions in
   the BACKLOG liveness-watch entry: a third unread overnight stall, or Kenneth opting in.
