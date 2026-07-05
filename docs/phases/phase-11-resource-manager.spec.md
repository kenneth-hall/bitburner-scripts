# Phase 11 spec: resource manager — active procurement

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner watcher that syncs into the game). Phase 10 (`phase-10-finance-cloud.md`) built a budget authority (`financemanager.js`) that *reserves* cash for upcoming hand-purchases and one discretionary customer (`cloudupgrader.js`) that spends leftover *available* cash on cloud-server upgrades. The reserved purchases — TOR router, port openers, the first cloud server — are still bought by hand; the reservations only protect their money.

Phase 11 closes that loop per `phase-11-resource-manager.features.md`: **automate the purchases the reservations were protecting**, so a fresh reset bootstraps the fleet with no hand-buys, while keeping the Phase 10 budget-authority / discretionary-customer split intact. Three components (Decisions 1–7 in the features file, all confirmed with Kenneth 2026-07-05):

1. **`resourcemanager.js`** (rename of `financemanager.js`) — the budget authority, charter unchanged. Singularity-free, publishes `finance-state.json` / `finance-log.json` under their existing on-disk names (Decision 6: no artifact migration).
2. **`procureprograms.js`** (rename + evolution of `purchasescripts.js`) — Singularity-heavy, **self-terminating** fulfiller for TOR + the five port openers. Launched by `daemon.js` at startup, exits when everything it owns-checks is owned, freeing its Singularity RAM until the next daemon restart.
3. **`cloudmanager.js`** (rename + extension of `cloudupgrader.js`) — cheap `ns.cloud`, always-on. Absorbs cloud *purchasing* (bootstrap first server + growth buys) alongside the Phase 10 upgrade behavior.

**Hard constraints carried forward:** `CLAUDE.md`'s Singularity isolation (no `ns.singularity.*` in `resourcemanager.js` or `cloudmanager.js`, ever); every purchase records through `src/translog.js`'s `recordTransaction` on success only; RAM cost of every call verified against `markdown/` at implementation time — do not trust this spec's numbers.

**Testing constraint:** live resets are rationed. Same budget as Phase 10: **at most 2 full-reset validation rounds, aiming for 1.** Everything validatable without a reset (unit tests, log verification, rename smoke test, current-save procurement behavior) must be validated that way; the hands-off bootstrap ladder gets one scripted post-reset observation pass; anything structurally unreachable in that window (growth buys need a maxed fleet) is a BACKLOG live-validation follow-up, not a sign-off blocker.

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked **[code]**. Kenneth does everything marked **[live]**. Nothing in a [live] step should require editing code (a wrong price constant is the one allowed exception, unchanged from Phase 10).

## Ground rules

- `CLAUDE.md` rules apply in full: verify every NS API signature/RAM cost against `markdown/` before use, no community solutions, don't read game source, no spoilers beyond current progression.
- **Identifier hygiene (Phase 9's lesson):** no identifier, property name, or object-literal key may exactly match an NS API function name unless it is a real `ns` call. Check every new name (`planProgramPurchase`, `bootstrapHoldbackFrom`, `shouldBuyGrowthServer`, `nextCloudName`, transaction-record fields, state fields) against `NetscriptDefinitions.d.ts`.
- Pure decision logic lives in exported ns-free functions, unit-tested mock-free in `test/` (vitest). New verify-time checks go in `test/verify-*.test.js` so the existing glob picks them up under `npm run verify:log`. Nothing under `logs/` may be an `npm test` dependency.
- Transactions-log discipline: every writer goes through `recordTransaction`; **no `await` between any `ns.read` and its paired `ns.write`**; a failed spend records nothing; new source strings enter `VALID_EXPENSE_SOURCES` in the same commit as their writer (Phase 5's whitelist-gap lesson).
- Same worktree/branch conventions as prior phases (suggest `worktree-phase11-procurement`); local-first, push after live verification per the standing git authorization.

## Spec-stage decisions (delegated by the features file, resolved here)

These were left to the spec stage; the reviewer should treat them as decided-with-rationale, not open:

- **S1 — `procureprograms.js` buys TOR + the five port openers only** (confirmed with Kenneth 2026-07-05). This *narrows* today's `purchasescripts.js`, which buys every affordable darkweb program. Utility programs (ServerProfiler.exe, DeepscanV1/V2.exe, AutoLink.exe) become hand-buys; Formulas.exe stays reservation-only (features: rejected alternative). Document the narrowing in the file header.
- **S2 — prices come from the static shared table, not darkweb reads** (confirmed with Kenneth 2026-07-05). `procureprograms.js` imports `PORT_OPENER_COSTS` / `TOR_ROUTER_COST` from `resourcemanager.js` — pure constants, 0 GB under Phase 9's confirmed reachability-based import charging — instead of calling `getDarkwebPrograms`/`getDarkwebProgramCost` (8 GB each ×16). Saves ~16 GB. Failure mode of a wrong constant is benign: `purchaseProgram` returns `false`, no record is written, the next pass retries. If the RAM gate shows the import charging anyway (it shouldn't), inline copies of the two constants are the fallback — note it in the handoff if taken.
- **S3 — `procureprograms.js` honors the staleness fail-safe.** The features file specifies the bootstrap-foothold guard but not what B does when `finance-state.json` is missing/stale. Decided: same rule as the Phase 10 customer — stale/missing state → buy nothing this pass (WARN once per transition into stale, not per pass), keep polling. Rationale: without fresh state B can't see the `bootstrap-server` reservation it is required to respect, and "no finance manager, no spending" is the established safety property. This only delays purchases until the manager recovers.
- **S4 — auto-bought servers are named `cloud-<n>`** (lowest free index, mirroring `renamecloudservers.js`'s idempotent scheme — indices claimed by existing `cloud-<n>` names are skipped; non-matching names like `pserv-*` claim nothing). Capacity-free names are the fix for the stale-name annoyance that motivated `renamecloudservers.js`; using the same pattern keeps a later manual rename run idempotent alongside auto-bought servers.
- **S5 — `cloud-upgrade-off.txt` pauses ALL of `cloudmanager.js`'s spending** — upgrades, bootstrap buy, and growth buys. One script, one off switch; the marker file keeps its Phase 10 name (on-disk artifact names are kept per Decision 6). Header documents the widened meaning.
- **S6 — `procureprograms.js` polls at `POLL_MS = 30_000`** (features: "~30–60 s"). Post-reset cash arrives fast; 30 s keeps the ladder responsive while staying far off the hot-path cadence.
- **S7 — no `finance-*` artifact migration.** State file, log file, manual-override file, formulas-disable flag, and the checker key set all keep their names. The features file allowed a migration only if the spec found a clean reason; there isn't one — `verify-finance.test.js` and `vite.config.ts`'s export filter continue to work untouched.

## Design

### Work item 1 — `resourcemanager.js` (rename of `financemanager.js`) [code]

Behavior unchanged: `POLL_MS = 2000`, Singularity-free, same reservation rules, same state/log publishing, same manual-extra and formulas-disable handling. Changes limited to:

- **File rename** `src/financemanager.js` → `src/resourcemanager.js`. Header comment updated to the resource-manager charter: budgets the money dimension now; named and shaped so a future RAM dimension can slot in (out of scope this phase, do not build toward it beyond the name).
- **Reservation labels** updated to reflect automated fulfillment; **keys unchanged** (the checker's known-key set and all diff/log mechanics stay valid):
  - `bootstrap-server`: label `"first cloud server (hand-buy)"` → `"first cloud server (cloudmanager auto-buy)"`.
  - `tor-router` / `next-port-opener` labels stay as-is (they're the item names) — but the header prose about hand-buys is rewritten.
- Exports unchanged (`computeReservations`, `diffReservations`, `parseManualExtra`, `computeAvailable`, cost constants) — `procureprograms.js` now imports the cost constants (S2).

Because label text participates in `diffReservations`, a label change would fire a `changed` event mid-run — but the rename forces a fresh process anyway, so the new label only ever appears via a normal startup entry. No churn.

### Work item 2 — `procureprograms.js` (rename + evolution of `purchasescripts.js`) [code]

Launched by `daemon.js` at startup (work item 4); also runnable by hand (same acquisition loop; it persists until done or killed). Poll loop, `POLL_MS = 30_000`, `STALE_MS = 15_000` (same constant value as `cloudmanager.js`).

Imports: `recordTransaction` from `./translog.js`; `PORT_OPENER_COSTS`, `TOR_ROUTER_COST` from `./resourcemanager.js` (S2); `isStateStale` from `./cloudmanager.js` (pure, 0 GB).

**Per pass, in order:**

1. **Exit check:** `ns.hasTorRouter()` and all five opener files exist on home (`ns.fileExists(file, "home")` over `PORT_OPENER_COSTS`) → tprint a summary of everything bought this run (or "nothing needed") and **exit**. This is the isolation win: the ~66 GB Singularity surface is held only while acquiring.
2. **Read `finance-state.json`** (`ns.read`, 0 GB). Missing/unparseable/stale per `isStateStale(state?.timestamp ?? null, Date.now(), STALE_MS)` → buy nothing this pass; WARN once per transition into stale; sleep and continue (S3).
3. **Bootstrap holdback:** `holdback = bootstrapHoldbackFrom(state)` — the `amount` of the reservation with `key === "bootstrap-server"` in `state.reservations`, else `0`. Pure, exported, unit-tested (absent key, present key, malformed reservations array → 0). This is the **only** reservation B respects (features' Reservation model): `manual-extra`, `formulas`, and B's own `tor-router`/`next-port-opener` reservations are deliberately ignored — B is their fulfiller, and beyond the foothold guard, purchases race cheapest-first by design. Document this in the header.
4. **TOR:** if `!ns.hasTorRouter()`: buy iff `ns.getPlayer().money - TOR_ROUTER_COST >= holdback`. On `ns.singularity.purchaseTor()` returning `true`: `recordTransaction` `{type: "expense", source: "auto-tor", amount: TOR_ROUTER_COST, timestamp, time}` and tprint. (`purchaseTor` returns true even if already owned — safe here because `hasTorRouter()` was checked synchronously just before, with no `await` between; a `false` return → WARN, no record, retry next pass.) If TOR can't be afforded under the holdback, skip to sleep — `purchaseProgram` requires TOR, so there's nothing else to do this pass.
5. **One opener:** with TOR owned, pick the **cheapest unowned** opener from `PORT_OPENER_COSTS` (ownership via `fileExists`; the table is already cost-ascending but select by minimum cost, don't assume order). Buy iff `money - cost >= holdback` (fresh money read). On `ns.singularity.purchaseProgram(file)` returning `true`: `recordTransaction` `{type: "expense", source: "auto-port-opener", program: file, amount: cost, timestamp, time}` and tprint. `false` → WARN, no record. **At most one opener per pass** (features: one per pass) — TOR in step 4 does not consume the pass's opener buy.
6. Sleep `POLL_MS`.

**Pure logic exported for tests:** `planProgramPurchase({hasTor, ownedFiles, money, holdback})` → `{action: "done"} | {action: "buy-tor"} | {action: "buy-program", file, cost} | {action: "wait"}` — the whole steps 1/4/5 decision in one testable function; the ns glue just executes the returned action. And `bootstrapHoldbackFrom(state)` per step 3.

**Header rewrite:** the current header's "daemon.js runs this once at startup" claim is false today (BACKLOG's consistency item flags it) — this phase makes it true, via `launchDetached`, so rewrite the header to the new reality: daemon-launched self-terminating acquisition companion, port-openers + TOR only (S1's narrowing stated explicitly), manual run supported, Singularity RAM freed on exit. Note in BACKLOG that this sub-item of the consistency entry is superseded.

**Transaction sources:** `auto-tor`, `auto-port-opener` — added to `VALID_EXPENSE_SOURCES` in the same commit (work item 5). The old `darkweb-program` source stops being written but **stays in the whitelist**: historical day-files contain it and `verify:log` validates whatever files exist.

### Work item 3 — `cloudmanager.js` (rename + extension of `cloudupgrader.js`) [code]

Always-on, `POLL_MS = 10_000`, `STALE_MS = 15_000`, off marker `cloud-upgrade-off.txt` (now pausing all spending, S5), staleness fail-safe — all Phase 10 mechanics retained. **Per poll, after the off-switch and staleness gates, in order:**

1. **Bootstrap buy** — if `ns.cloud.getServerNames().length === 0`: `cost = ns.cloud.getServerCost(2)`; buy iff `ns.getPlayer().money >= cost` — **live money, ignoring reservations entirely** (its own `bootstrap-server` reservation covers exactly this purchase; the features' rejected-alternatives section explains why funding it from `available` could deadlock post-reset). `hostname = ns.cloud.purchaseServer(nextCloudName(owned), 2)`; empty-string return → WARN (once per transition into the failing state, not per poll) and retry next poll; non-empty → `recordTransaction` `{type: "expense", source: "auto-cloud-purchase", hostname, ram: 2, amount: cost, timestamp, time}` + tprint. The 2 GB size is Decision 4 (fast $110k foothold; the upgrade path climbs it); expected price $110k but always pay `getServerCost(2)`'s live answer.
2. **Upgrade loop** — Phase 10 behavior verbatim: lowest-RAM-first, one power-of-2 tier per action, spend only `availableCash = max(0, liveMoney - state.totalReserved)` (decremented per upgrade), `upgradeServer` boolean checked, `false` → WARN + break the poll's loop, `auto-cloud-upgrade` records unchanged.
3. **Growth buy** — if `shouldBuyGrowthServer(fleet, ramLimit, serverLimit)` — fleet non-empty, **every** owned server at `ns.cloud.getRamLimit()`, and `fleet.length < ns.cloud.getServerLimit()`: `cost = ns.cloud.getServerCost(16)`; buy iff `cost <= availableCash` (the remainder after step 2) **and** `cost <= ns.getPlayer().money` (fresh read). **At most one growth buy per poll** — the new 16 GB server is below the limit, so the trigger goes false until the upgrade path maxes it; availability gating is the only throttle (Decision 3). Same `purchaseServer` empty-string handling and `auto-cloud-purchase` record (with `ram: 16`) as step 1. Discretionary: gated on `available`, not a reservation.

**Naming (S4):** `nextCloudName(ownedNames)` — pure, exported: collect indices from names matching `/^cloud-(\d+)$/`, return `cloud-<lowest free index>`. Never rename anything, ever (Phase 7's hazard; `renamecloudservers.js` stays the manual path for legacy `pserv-*` names).

**Pure logic exported for tests:** existing `planNextUpgrade` + `isStateStale` unchanged; new `shouldBuyGrowthServer(fleet, ramLimit, serverLimit)` and `nextCloudName(ownedNames)`.

**Tail display additions:** bootstrap status while the fleet is empty (waiting-for-cash vs buying), growth-buy status when the fleet is maxed (slot availability + affordability), plus the existing paused/stale/fleet/next-upgrade/last-upgrade lines. Header updated: "upgrade only, never purchases" is no longer true — it purchases, it still never renames.

### Work item 4 — daemon wiring [code]

`daemon.js` startup block: update the two filename strings and add the third companion —

```js
launchDetached(ns, "resourcemanager.js");
launchDetached(ns, "cloudmanager.js");
launchDetached(ns, "procureprograms.js");
```

Resource manager first so the state file usually exists by its consumers' first polls (a nicety — both consumers' stale/missing guards make it safe regardless). Update `runAndWait`'s comment that still narrates `purchasescripts.js` (BACKLOG's consistency item also flags this docstring; touch only the stale filename reference here, the fuller docstring fix stays with that item). Exec-by-filename only → expected `daemon.js` RAM delta **+0.00**. `killscripts.js` needs no change — it sweeps by pid, not filename. Relaunch is idempotent: all three derive state fresh from the world; `procureprograms.js` exits immediately on a fully-owned save.

Post-reset reality: `procureprograms.js` is ~66 GB. On this save home RAM persists through installs (16 TB), so it fits; `launchDetached`'s INFO-skip plus a manual `run` is the documented recovery if it ever doesn't.

### Work item 5 — plumbing [code]

- **`test/verify-transactions.test.js`**: `VALID_EXPENSE_SOURCES` += `'auto-tor'`, `'auto-port-opener'`, `'auto-cloud-purchase'` (same commit as the writers). Keep `'darkweb-program'` (historical logs).
- **`vite.config.ts`**: comment updates only (`financemanager.js` reference → `resourcemanager.js`). The download filter is untouched — `finance-log.json` keeps its name (S7).
- **Stale-reference sweep**: `renamecloudservers.js`'s header mentions `cloudupgrader.js`; update. Grep for any remaining `financemanager|cloudupgrader|purchasescripts` references in `src/` and `test/` after the renames — the set found pre-implementation: `daemon.js` (launch strings + `runAndWait` comment), `cloudupgrader.js` header self-references, `renamecloudservers.js` comment, the two unit-test imports.
- **Deliberately untouched:** `purchasecloudservers.js`, `upgradecloudserver.js`, `fleetupgrade.js`, `upgradehomeram.js`, `renamecloudservers.js` (beyond the comment), `hosts.js`, `scheduler.js`, `sampling.js`, `targets.js`, `translog.js`, all workers and monitors, `test/verify-finance.test.js` (artifact names and key set unchanged).

## Testing [code]

**Unit tests (`npm test`):**

- `test/finance.test.js` → **rename to `test/resourcemanager.test.js`**, import path updated. The reviewer confirmed no existing case asserts the `bootstrap-server` label string, so no content changes are expected — every case passes unchanged (behavior is unchanged). If an assertion on label wording does turn up, updating it is in scope.
- `test/cloudupgrader.test.js` → **rename to `test/cloudmanager.test.js`**, import path updated; existing `planNextUpgrade`/`isStateStale` cases unchanged. New cases:
  - `shouldBuyGrowthServer`: all-at-limit + free slot → true; one server below limit → false; at server limit → false; empty fleet → false; boundary (`fleet.length === serverLimit - 1` → true).
  - `nextCloudName`: empty list → `cloud-0`; `[cloud-0, cloud-1]` → `cloud-2`; gap `[cloud-0, cloud-2]` → `cloud-1`; `pserv-*` names ignored; mixed.
- New `test/procureprograms.test.js`:
  - `planProgramPurchase` matrix: everything owned → done; no TOR + affordable over holdback → buy-tor; no TOR + not affordable → wait; no TOR + affordable only by dipping below holdback → wait (boundary: `money - cost === holdback` → buy); TOR owned + cheapest-unowned selection walks the ladder as `ownedFiles` grows; TOR owned + nothing affordable → wait; holdback 0 behaves as plain affordability.
  - `bootstrapHoldbackFrom`: reservation present → its amount; absent → 0; empty/missing/malformed `reservations` → 0.

**Log verification (`npm run verify:log`):** no new checker file needed. Re-verify against synthetic fixtures (Phase 10 style, placed locally then removed) that `verify-transactions` **passes** records with the three new sources and still **fails** an unknown source; `verify-finance` continues green with the new label text (labels are asserted as `any(String)` — confirm nothing asserts exact label wording).

## RAM gate [live]

Before sync: `run ramcheck.js daemon.js financemanager.js cloudupgrader.js purchasescripts.js` to re-record the Phase 10 baselines (16.30 / 3.35 / 3.70 / 50.15 expected). After sync + daemon restart: `run ramcheck.js daemon.js resourcemanager.js cloudmanager.js procureprograms.js` —

- `daemon.js`: **unchanged at 16.30** (exec-by-filename only).
- `resourcemanager.js`: **3.35** (rename + label text only; any growth is a defect).
- `cloudmanager.js`: predicted **6.25** = Phase 10's 3.70 + `purchaseServer` 2.25 + `getServerCost` 0.25 + `getServerLimit` 0.05 (verify each against `markdown/`).
- `procureprograms.js`: predicted **66.25** = base 1.6 + `purchaseTor` 32 + `purchaseProgram` 32 + `hasTorRouter` 0.05 + `getPlayer` 0.5 + `fileExists` 0.1 (no darkweb reads under S2; down from 50.15 + the old script's `getDarkwebPrograms`/`getDarkwebProgramCost` surface). A large surprise here specifically means either an identifier-hygiene violation or the S2 import charging after all — hunt with the Phase 9 technique; the S2 fallback (inline constants) is the escape hatch.

Record all four measured totals in the handoff summary.

## Live validation [live]

### Round A — current save, no reset

1. **Rename smoke test:** after sync, `rm financemanager.js`, `rm cloudupgrader.js`, `rm purchasescripts.js` in-game (viteburner never deletes), then restart `daemon.js`. All three companions launch under their new names; `killscripts.js`'s pid sweep cleans the old processes; both tails render with the Phase 10 information intact.
2. **`procureprograms.js` on the current save:** TOR is owned; whichever openers are still unowned (BACKLOG: relaySMTP → SQLInject were the deferred upper rungs) get bought for real, cheapest-first, one per 30 s pass, with `auto-port-opener` records — then the script tprints its summary and **exits** (confirm the process is gone via `ps`). If everything is already owned it must exit on the first pass with a "nothing needed" summary. Either outcome passes; record which, and the `next-port-opener` reservation walk it triggers in `resourcemanager.js`'s tprints.
3. **Manual-override gate still holds:** `write finance-reserve-extra.txt <huge>` → `cloudmanager.js`'s upgrade/growth spending freezes (`available` → $0) within a poll; remove → resumes. (B ignores `manual-extra` by design — if it's still running during this test, it may legitimately keep buying openers; that's the documented cheapest-first race, not a bug.)
4. **Staleness fail-safe:** kill `resourcemanager.js` → `cloudmanager.js` flags stale and stops spending (one WARN); if `procureprograms.js` is still resident it must also stop buying (S3). Relaunch → both resume.
5. **Off switch (widened, S5):** `write cloud-upgrade-off.txt` → `cloudmanager.js` shows PAUSED and performs no upgrades *or* purchases; remove → resumes.
6. `npm run verify:log` green across daemon, transactions, and finance logs.

### Round B — the one reset (piggyback on the next natural augment install; budget ≤2, aim 1)

The headline acceptance: **from install to a running fleet with zero hand-buys.**

1. After install + daemon start: `resourcemanager.js` announces the fresh ladder (`bootstrap-server` $110k + `tor-router` $200k + `next-port-opener` BruteSSH $500k); `procureprograms.js` launches and waits (or buys, if cash allows).
2. `cloudmanager.js` buys `cloud-0` (2 GB, ~$110k) as soon as live money covers it — **no UI purchase**. `bootstrap-server` releases within a poll (tprint + log event); the `auto-cloud-purchase` record lands with `ram: 2`.
3. `procureprograms.js` buys TOR, then walks the openers cheapest-first as cash allows. Verify the foothold guard if the timing exposes it: while `bootstrap-server` was still active, B must not have spent below $110k (check the transactions log timestamps against the finance log's release event). `auto-tor` + `auto-port-opener` records land; each release tprints within a poll.
4. `cloudmanager.js` upgrades `cloud-0` upward from `available` cash alongside — the Phase 10 behavior, now starting from an auto-bought foothold.
5. Confirm `procureprograms.js` exits once TOR + all five openers are owned (this may take the session, depending on income; SQLInject at $250m is the long pole — if it's still resident at session end, that's the design working, note it and let it finish in real time).
6. Copy logs; `npm run verify:log` green on the real post-reset files.

### Deferred past sign-off (BACKLOG follow-ups, not blockers)

- **Growth buys live**: needs every server at `getRamLimit()` + a free slot — structurally late-game. The predicate is unit-tested; the live observation lands whenever the fleet first maxes.
- Upper-rung procurement in real time if Round B's session ends before SQLInject (same convention as Phase 10's deferred rungs).

## Files

- **Renamed:** `src/financemanager.js` → `src/resourcemanager.js`, `src/cloudupgrader.js` → `src/cloudmanager.js`, `src/purchasescripts.js` → `src/procureprograms.js`, `test/finance.test.js` → `test/resourcemanager.test.js`, `test/cloudupgrader.test.js` → `test/cloudmanager.test.js`. Use `git mv` so history follows.
- **New:** `test/procureprograms.test.js`.
- **Modified:** `src/daemon.js` (launch strings + 1 new `launchDetached` + stale comment), `test/verify-transactions.test.js` (+3 whitelist entries), `vite.config.ts` (comment only), `src/renamecloudservers.js` (comment only).
- **Untouched:** everything in work item 5's list; `finance-state.json` / `finance-log.json` / `finance-reserve-extra.txt` / `finance-disable-formulas.txt` / `cloud-upgrade-off.txt` on-disk names all kept (S5/S7).
- **`BACKLOG.md`** on completion: move this phase to Done with date; annotate the consistency-consolidation item (the `purchasescripts.js` header sub-item is superseded by this phase's header rewrite); file follow-ups: (a) the two deferred live observations above, (b) competing-purchase arbitration beyond the foothold guard (features' open question — revisit only if post-reset ordering proves annoying live), (c) utility-program purchases (ServerProfiler/Deepscan/AutoLink) are now nobody's job — decide later whether they deserve a rule or stay hand-buys.

## Acceptance criteria

**Runnable (green before handoff):**

- `npm test` green: renamed suites passing, new `procureprograms`/growth/naming cases in, all pre-existing tests untouched-or-renamed and passing.
- Synthetic-fixture confirmation that `verify-transactions` accepts the three new sources and still rejects unknowns.
- RAM predictions for all three companions computed from markdown-verified per-call costs and stated in the handoff summary.
- A grep showing zero remaining references to the three old filenames in `src/` + `test/`.

**Observed (Kenneth, in order):**

- RAM gate: `daemon.js` 16.30 unchanged; `resourcemanager.js` 3.35 unchanged; the other two within ~0.5 GB of prediction (else the identifier-hygiene / S2-fallback hunt).
- Round A items 1–6 pass; in particular A2 (self-termination observed via `ps`) and A4 (fail-safe extends to B) — the phase's new safety properties.
- Round B: the fresh ladder fulfilled hands-off — first server auto-bought (`ram: 2` record + reservation release), TOR + at least the affordable openers auto-bought with correct records, upgrader climbing from `available` — **zero hand-buys from reset onward**.
- All `verify:log` assertions green on the real exported logs.
- BACKLOG updated per Files.

## Out of scope

RAM budgeting (the resource-manager name is the only concession to it); competing-purchase arbitration beyond the bootstrap foothold guard; Formulas.exe / augmentation / utility-program automation; any Singularity call in `resourcemanager.js` or `cloudmanager.js`; server renames from automation; `finance-*` artifact renames; any batching/share math change; dashboards; gating manual utilities on reservations.

## Peer review record (2026-07-05)

A cold-context reviewer (given only this file, `phase-11-resource-manager.features.md`, `CLAUDE.md`, and `BACKLOG.md`) verified requirements coverage and spot-checked the spec's factual claims against the codebase and `markdown/` docs. Verdict: **APPROVE, no blocking issues** — the first phase spec to pass review clean. Specifically confirmed:

- Every cited RAM cost matches `markdown/` (`purchaseTor` 32, `purchaseProgram` 32, `purchaseServer` 2.25, `getServerCost` 0.25, `getServerLimit` 0.05, `hasTorRouter` 0.05, `fileExists` 0.1, `getPlayer` 0.5), and both predicted totals (6.25 / 66.25) compute correctly.
- Return-value semantics (`purchaseTor` true-if-owned, `purchaseProgram` requires-TOR, `purchaseServer` empty-string-on-failure) match the spec's race handling in work item 2 steps 4–5.
- `isStateStale` is exported and importable; `killscripts.js` sweeps by pid (no change needed); the stale-reference sweep list matches an actual grep; `nextCloudName` mirrors `renamecloudservers.js` faithfully; `verify-finance.test.js` asserts labels only as `any(String)`, so the label change is safe; the B/C coordination has no deadlock (holdback clears within a poll of the bootstrap purchase).
- Conventions honored: Singularity isolation, `recordTransaction` + same-commit whitelist entries, no-await read/write discipline, tests + log validation, reset budget, no spoilers.

One non-blocking wording fix folded in above (the `test/finance.test.js` label-assertion sentence — no such assertion exists, confirmed).

## Open questions

None. S1–S7 record the spec-stage decisions with rationale; the features file's Decisions 1–7 were confirmed with Kenneth 2026-07-05; S1 (port-openers-only scope) and S2 (static price table) were re-confirmed with Kenneth at spec time (2026-07-05); the review raised no disputes to record.

## Live implementation note (2026-07-05, discovered during Round B)

This spec (and Phase 9/10 before it) assumed "Singularity RAM multiplier without SF4" meant the
calls were usable without that Source-File, just at a higher RAM cost. That assumption was wrong:
`purchaseTor`/`purchaseProgram` **throw a runtime error** (killing the whole script) when the
account lacks the Source-File that Singularity purchasing requires — there is no graceful `false`
return for that case, only for the ordinary failure modes (not enough money, already owned) this
spec anticipated. Discovered live when `procureprograms.js` crashed on the first post-reset run.

Fixed in `procureprograms.js` with two layers: (1) a proactive check via `ns.getResetInfo()`
(1 GB, not itself Singularity-gated) that reads `ownedSF` and exits cleanly before ever attempting
a purchase if the required Source-File isn't active; (2) a `try/catch` around both purchase calls
as a backstop, in case the proactive check ever misses a case. Either path prints one message and
exits (freeing the ~67 GB Singularity surface) rather than crashing — `resourcemanager.js`'s
reservations are untouched, so hand-buying stays available exactly as it did before this phase.
RAM gate updated: `procureprograms.js` is **67.25 GB** (66.25 + `getResetInfo`'s 1 GB), not 66.25.

Round B (the one reset) validated the cloud-server side fully hands-off (bootstrap buy + upgrades,
zero hand-buys) but could not validate the TOR/port-opener ladder at all — Kenneth's account
doesn't have the required Source-File yet, so that half of this phase's headline acceptance
criterion is unverifiable until it does. Not a code defect; filed as a BACKLOG follow-up.
