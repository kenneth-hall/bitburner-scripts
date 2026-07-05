# Phase 10 spec: finance manager + cloud server auto-upgrader

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner watcher that syncs into the game). Phases 1–9 (`batcher-refactor-phase1.md` … `phase9.md`) built the batching daemon and its logging/verification infrastructure; this phase starts a new workstream on top of it: **automated money management**. Two new long-running companion scripts:

1. **`financemanager.js`** — decides how much cash is *available* for scripts to spend, by holding reservations for upcoming player purchases (first cloud server, TOR router, port openers, Formulas.exe, and a manual override). Intent: cash is either earmarked for a known upcoming hand-purchase or actively deployed — never idle by accident.
2. **`cloudupgrader.js`** — the finance manager's first (and for now only) customer. Spends *available* cash upgrading owned cloud servers, one power-of-2 tier at a time. **Upgrade only — it never purchases new servers.**

Both are wired into `daemon.js`'s startup the same way `targetsmonitor.js`/`transactionsmonitor.js` are (confirmed with Kenneth 2026-07-05), with a marker-file off switch for the upgrader's spending.

**Hard constraint from Kenneth: minimize Singularity RAM costs.** Without SF4, Singularity calls carry a 16x multiplier (`getDarkwebProgramCost` alone is 8 GB; `purchaseTor` is 32 GB). The design below achieves **zero Singularity calls in both new scripts**: ownership is detected via `ns.fileExists` (0.1 GB) / `ns.hasTorRouter` (0.05 GB), and prices come from a static table verified once in-game (see Cost table). Do not add any `ns.singularity.*` call to either new script.

**Testing constraint:** live resets are rationed (~1/hour at best). Plan for **at most 2 full-reset validation rounds, aiming for 1**. Everything that can be validated without a reset (unit tests, log verification, the manual-override spending-block test, upgrader behavior on the current save) must be; the reservation *ladder* itself gets one scripted post-reset observation pass, and anything that structurally can't be reached in that window (high-tier ladder rungs) is recorded as a live-validation follow-up in BACKLOG, not a sign-off blocker — same convention as Phase 4's waived fleetupgrade test.

**Audience note:** the implementer (Sonnet, via Claude Code) does everything marked **[code]**. Kenneth does everything marked **[live]** — in-game runs, purchases, measurements, the reset. Nothing in a [live] step should require editing code (fixing a wrong price constant is the one allowed exception, see Cost table).

## Ground rules

- `CLAUDE.md` rules apply in full: verify every NS API signature/RAM cost against `markdown/` before use (do not trust this spec's numbers or memory), no community solutions, don't read game source.
- **Identifier hygiene (Phase 9's lesson):** no identifier, property name, or object-literal key in `src/` may exactly match an NS API function name unless it is a real `ns` call — the static RAM analyzer charges by name. Check candidate names against `NetscriptDefinitions.d.ts` (e.g. `reserve`, `available`, `reservations` are safe; do not name anything `share`, `scan`, `kill`, `read`, `write`, `exec`, `purchaseServer`, `upgradeServer`, `renameServer`, `getServerNames`, …). This applies to the state/log record shapes too, since they're object literals in source.
- Pure decision logic lives in exported ns-free functions, unit-tested with vitest in `test/` at repo root, existing mock-free style (same split as `scheduler.js` vs `daemon.js`). New verify-time checks go in `test/verify-*.test.js` files so the existing `verify-*` glob picks them up under `npm run verify:log`.
- `logs/` is untracked: nothing under `logs/` may be an `npm test` dependency; real-log validation runs under `npm run verify:log` only.
- Transactions-log discipline (`translog.js` header): every writer goes through `recordTransaction`, and **no `await` between any `ns.read` and its paired `ns.write`** — this is the entire multi-writer concurrency story.
- Same worktree/branch conventions as prior phases (e.g. `worktree-phase10-finance`); local-first, no push until live verification per the standing git authorization.

## Design

### Work item 1 — `financemanager.js` (new) [code]

Long-running companion, launched by `daemon.js` at startup (work item 3), also runnable by hand. Opens its own tail window (`ns.ui.openTail()`, `ns.disableLog("ALL")`). Poll loop, `POLL_MS = 2_000`.

**Per poll:** gather state via cheap calls only —

| input | call | RAM |
|---|---|---|
| player money | `ns.getPlayer().money` | 0.5 GB |
| cloud server count | `ns.cloud.getServerNames().length` | 1.05 GB |
| TOR owned | `ns.hasTorRouter()` | 0.05 GB |
| each program owned | `ns.fileExists("<name>", "home")` | 0.1 GB (one charge) |
| hacking level | `ns.getHackingLevel()` | 0.05 GB |
| manual override | `ns.read("finance-reserve-extra.txt")` | 0 GB |

Estimated script RAM ≈ 3.35 GB + base adjustments — verify each cost against `markdown/` at implementation time and record the measured total in the handoff summary.

**Reservation rules** (all active reservations are additive; each is `{key, label, amount}`):

1. `bootstrap-server` — **$110,000 flat** while `cloud.getServerNames().length === 0`. This is deliberately the 2 GB-server price, *not* `purchasecloudservers.js`'s 16 GB floor: Kenneth hand-buys the first foothold server in the game UI without terminal commands (confirmed 2026-07-05). Constant, no cloud-cost API call.
2. `tor-router` — TOR price while `!ns.hasTorRouter()`.
3. `next-port-opener` — the price of the **cheapest unowned** port opener (ownership via `fileExists` on home; the five names/order as in `hosts.js`'s `PORT_OPENERS`) while any is unowned. One at a time by design — as each is bought, the reservation moves to the next.
4. `formulas` — Formulas.exe price while `ns.getHackingLevel() > 300` (strictly greater, per Kenneth's wording) and `!ns.fileExists("Formulas.exe", "home")`.
5. `manual-extra` — the number parsed from `finance-reserve-extra.txt` on home, if the file exists and parses to a finite value > 0; otherwise ignored with a one-time WARN (once per bad-content change, not per poll). **This is the augment answer for now**: no augment cost model this phase (explicitly back-burnered), but Kenneth can park any amount by hand — `write finance-reserve-extra.txt 2500000000` in-game — and every customer respects it. It doubles as the no-reset live test hook (see Live validation A3).

Derived: `totalReserved = Σ amounts`, `available = max(0, money - totalReserved)`. Note reservations may exceed money (e.g. formulas at $5b) — that's the design working, not an error state.

**Cost table** — static constants in `financemanager.js`, exported for tests:

```
TOR router          200,000
BruteSSH.exe        500,000
FTPCrack.exe      1,500,000
relaySMTP.exe     5,000,000
HTTPWorm.exe     30,000,000
SQLInject.exe   250,000,000
Formulas.exe  5,000,000,000
```

Seeded from the standard table; the observed in-game data is consistent with standard pricing (16 GB cloud server = $880k = 55k/GB in `logs/transactions-2026-07-04.json`), but **treat these as unverified until Live validation step A1**, where Kenneth reads the real prices off the in-game `buy -l` listing and the TOR vendor. A wrong constant is a config fix (edit the number), never a design change. Kenneth explicitly authorized looking up static price tables — this does not extend to looking up other players' scripts.

**Interface to customers** — a state file on home, `finance-state.json`, **overwritten every poll** (0 GB `ns.write`; every-poll writes give consumers a fresh heartbeat timestamp for staleness detection):

```json
{
  "timestamp": 1783300000000,
  "time": "7:12:01 AM",
  "money": 123456789,
  "totalReserved": 810000,
  "available": 122646789,
  "reservations": [
    { "key": "bootstrap-server", "label": "first cloud server (hand-buy)", "amount": 110000 },
    { "key": "tor-router", "label": "TOR router", "amount": 200000 },
    { "key": "next-port-opener", "label": "BruteSSH.exe", "amount": 500000 }
  ]
}
```

Customers read it with `ns.read` (0 GB) and **recompute availability against their own live money read** (`available = max(0, liveMoney - totalReserved)`) — the file's `money`/`available` fields are informational/debugging; only `totalReserved` and `timestamp` are load-bearing for customers. Rationale: reservations change on the seconds scale (ownership flips), money changes constantly — splitting it this way makes staleness in the fast-moving half impossible.

**Reservation-update messages** (the requirement): on every poll, diff the new reservation list against the previous poll's (pure helper, unit-tested). For each added / removed / amount-changed reservation, `tprint` a timestamped line (reuse the `tprintTs` pattern from `daemon.js`):

```
[7:12:01 AM] FINANCE: reserved $500.000k -- next-port-opener (BruteSSH.exe)
[7:14:33 AM] FINANCE: released next-port-opener (BruteSSH.exe) -- now reserving $1.500m for FTPCrack.exe
[7:20:02 AM] FINANCE: released tor-router (TOR router owned)
```

Exact wording is implementer's choice; requirements: timestamp, key, amount, and a reason a human can read. The startup poll prints the full initial reservation set once (or "no active reservations").

**Event log for verification** — `finance-log.json` on home, a FIFO ring buffer (cap 500 entries, plain trim — no pinning needed), appended **only when the reservation diff is non-empty** (plus one startup event), flushed immediately on append. Two entry kinds (review finding — the checker must be able to tell them apart offline): the startup entry is `{event: "startup", ...}` and may legitimately carry an empty `changed` (e.g. a fully-owned save with no active reservations); every subsequent entry is `{event: "reservations", ...}` and exists only because something changed. Shared fields: `{timestamp, time, money, totalReserved, available, reservations, changed: [keys...]}`. This is the exported-log answer to "validate with available log files" (CLAUDE.md's log-export rule): `vite.config.ts` gets a download-filter line for it (work item 4), and `test/verify-finance.test.js` validates it offline.

**Tail display** (redrawn each poll): money, each active reservation with label+amount, totalReserved, available, and the timestamp of the last change.

### Work item 2 — `cloudupgrader.js` (new) [code]

Long-running companion, launched by `daemon.js` at startup, also runnable by hand. Own tail window. Poll loop, `POLL_MS = 10_000` (spending decisions don't need to be faster than the daemon's own `CYCLE_MS`).

**Per poll:**

1. **Off switch:** if `cloud-upgrade-off.txt` exists on home (`ns.fileExists`, 0 GB for the check — verify; the file is a 0-byte marker, same pattern as `share-off.txt`/`legacy-mode.txt`) → display "PAUSED", spend nothing this poll.
2. **Read finance state:** `ns.read("finance-state.json")`. If missing, unparseable, or `timestamp` older than `STALE_MS = 15_000` (>7 finance-manager polls) → treat reservations as unknown: **spend nothing**, display "finance state stale/missing", and WARN via tprint **once per transition into the stale state** (not every poll). This is the fail-safe: no finance manager, no spending.
3. **Compute** `availableCash = max(0, ns.getPlayer().money - state.totalReserved)` — live money, file's reserve total.
4. **Upgrade loop** (within the poll, until nothing affordable):
   - `owned = ns.cloud.getServerNames()`; if empty → idle (purchases are out of scope; the finance manager is already reserving the hand-buy money).
   - **Priority (decided): lowest current RAM first**, ties broken by list order. Rationale: it's the cheapest single move (upgrade cost scales with the target tier), it levels the fleet toward uniform host sizes (which the batcher's job-per-single-host assignment likes), and it matches `fleetupgrade.js`'s laggard-first philosophy.
   - `nextTier = currentRam * 2`; skip servers already at `ns.cloud.getRamLimit()`. **Ceiling (decided): upgrade all the way to the RAM limit**, one tier per action — availability gating is the only throttle. All servers at the limit → display "fleet maxed", keep idling (stay resident; a hand-bought server later gets picked up without a daemon restart).
   - `cost = ns.cloud.getServerUpgradeCost(host, nextTier)`; a negative return → WARN once and skip that server this poll (matches existing scripts' handling).
   - If `cost <= availableCash` **and** `cost <= ns.getPlayer().money` (fresh read — money may have moved): `ns.cloud.upgradeServer(host, nextTier)`, **check the boolean** (Phase 5's lesson: a `false` return must not report or log as success). On success: `recordTransaction` (translog) with `{type: "expense", source: "auto-cloud-upgrade", hostname, detail: "<X>GB -> <Y>GB", amount: cost, timestamp, time}`, tprint a timestamped line, deduct from `availableCash`, and continue the loop (re-picking the new lowest server).
   - **On `upgradeServer` returning `false` (review finding): WARN once and break out of this poll's upgrade loop entirely** — do not re-pick and retry within the poll. An affordable-looking `false` means the world disagrees with our inputs (cost moved, server state changed); retrying the same pick synchronously would be an unbounded loop in a no-`await` section, i.e. a game-freezing hang. The next poll re-derives everything fresh and retries naturally.
   - Loop terminates naturally: every iteration either spends (strictly shrinking `availableCash` against strictly growing next-tier costs), breaks on unaffordability, or breaks on the `false` path above.
5. **No renames — ever.** Phase 7's live session recorded `upgradecloudserver.js`'s rename/recreate disrupting the daemon (mass drift, exit/re-entry cycling); an auto-upgrader doing that continuously would make it chronic. Hostnames like `pserv-16gb-0` will go cosmetically stale as sizes grow — accepted and documented in the file header. `upgradecloudserver.js` and `fleetupgrade.js` remain the manual paths that fix names. (The daemon picks up the RAM increase itself on its next `CYCLE_MS` refresh; no rename means no `serverExists` churn.)

**Tail display:** paused/stale/active status, availableCash vs totalReserved, fleet summary (count, min/max RAM), next planned upgrade + its cost, last completed upgrade.

**Pure logic exported for tests:** `planNextUpgrade(fleet, ramLimit)` → `{hostname, nextTier} | null` where `fleet = [{hostname, ram}]` (lowest-first + tie-break + limit handling), and the staleness predicate `isStateStale(stateTimestamp, now, staleMs)`. The affordability check stays in the ns glue (it's two comparisons).

### Work item 3 — daemon wiring + off switch [code]

`daemon.js` startup, immediately after the existing two `launchDetached` calls:

```js
launchDetached(ns, "financemanager.js");
launchDetached(ns, "cloudupgrader.js");
```

Order matters (finance manager first, so the state file usually exists by the upgrader's first poll — though the upgrader's stale/missing guard makes this a nicety, not a correctness requirement). No new `ns` surface in `daemon.js` (exec-by-filename only) → expected RAM delta **+0.00**, confirmed by the RAM gate. `killscripts.js` sweeps both on daemon restart, and relaunch is idempotent (both scripts derive all state fresh from the world; `finance-state.json`/`finance-log.json` survive on disk harmlessly).

Post-reset reality check: home RAM is small right after an install, and `launchDetached` already handles "doesn't fit" with an INFO skip. Both scripts are small (~3–4 GB) so they should usually fit where the daemon itself fits; if one is skipped, running it by hand later is the documented recovery (same as the existing monitors).

### Work item 4 — plumbing [code]

- **`vite.config.ts`**: add `if (file === 'finance-log.json') return 'logs/finance-log.json';` to the download filter (state file deliberately not exported — it's a heartbeat snapshot, visible live in the tail; the log is the offline evidence).
- **`test/verify-transactions.test.js`**: add `'auto-cloud-upgrade'` to `VALID_EXPENSE_SOURCES` **in the same commit that creates the writer** — don't repeat the `single-server-upgrade` whitelist gap.
- **Deliberately untouched:** `purchasecloudservers.js`, `upgradecloudserver.js`, `fleetupgrade.js`, `upgradehomeram.js`, `purchasescripts.js` (decided: manual scripts represent deliberate player action and do **not** consult reservations — `purchasescripts.js` in particular is the *fulfiller* of the port-opener reservations, so gating it on them would be circular). Also untouched: `hosts.js`, `scheduler.js`, `sampling.js`, `targets.js`, `translog.js` (the upgrader only imports `recordTransaction`), all workers and monitors.

## Testing [code]

**Unit tests (`npm test`, new files `test/finance.test.js` + `test/cloudupgrader.test.js`):**

- `computeReservations` matrix: fresh-post-reset state (0 servers, no TOR, nothing owned, level 1) → exactly `bootstrap-server` + `tor-router` + `next-port-opener`(BruteSSH) totaling $810k with the seed table; each ownership flag flips its reservation off; port-opener reservation walks the ladder (own BruteSSH → next is FTPCrack, …, own all five → no reservation); formulas boundary (level 300 → off, 301 → on; owned → off regardless of level); manual-extra (valid number adds a reservation; missing file, garbage, `-5`, `0`, `NaN`, `Infinity` all add nothing); totals/`available` arithmetic including the `available` clamp at 0 when reservations exceed money.
- Reservation diff helper: add / remove / amount-change / no-change cases, and that `changed` keys match.
- `planNextUpgrade`: picks lowest RAM; tie → list order; skips at-limit servers; all-at-limit → null; empty fleet → null; nextTier is exactly a doubling.
- `isStateStale`: fresh, boundary, stale, and missing (`null` timestamp) cases.

**Log verification (`npm run verify:log`, new `test/verify-finance.test.js`, glob-matched automatically):**

- `logs/finance-log.json` parses to an array; every entry's `event` is `"startup"` or `"reservations"` and carries the shared schema above; `timestamp`s non-decreasing; every entry's `totalReserved` equals the sum of its `reservations` amounts; `available === max(0, money - totalReserved)`; every reservation `key` is from the known set; **every `"reservations"` entry has a non-empty `changed`** (`"startup"` entries are exempt — identifiable by their own `event` value).
- Soft report: current (last-entry) reservation state, and a cross-log listing of each `auto-cloud-upgrade` expense from the transactions log next to the nearest preceding finance entry's `available` (soft because the two logs sample at different moments — inform, don't gate).
- Skip-with-message (not fail) when `logs/finance-log.json` doesn't exist yet, mirroring how a missing day-file is handled — but note in the handoff that the file existing is itself a Live-A acceptance item.

## RAM gate [live]

Before sync: `run ramcheck.js daemon.js` → expect the Phase 9 baseline 16.30 GB. After sync + daemon restart: `run ramcheck.js daemon.js financemanager.js cloudupgrader.js` → `daemon.js` must be **unchanged at 16.30** (launch-by-filename adds no surface); record the two new scripts' totals and check against the implementer's predicted numbers from the markdown-verified per-call costs (ballpark ~3–4 GB each; a large surprise means an identifier-hygiene violation — hunt it with the Phase 9 technique before accepting).

## Live validation [live]

### Round A — current save, no reset needed

1. **Price verification (before anything else):** in-game `buy -l` (TOR is owned on this save, so the listing shows every program price even though they read $0/owned — verify the listed prices for unowned display or cross-check the table against what the UI shows) and note the TOR price from the vendor screen if visible. Any constant that differs from the seed table → fix the constant, re-sync, note it in the handoff. If prices can't be read for already-owned items, record that the table remains provisionally standard-valued and let Round B's fresh state verify them for real.
2. **Startup wiring:** restart `daemon.js` → both new tails open; finance manager prints its initial reservation set — on the current save (everything owned, servers exist) expect **"no active reservations"** and `available ≈ money`; `finance-log.json` gains its startup entry and auto-exports to `logs/`.
3. **The reservation→gate chain, no reset required:** `write finance-reserve-extra.txt <huge number>` in-game → within one finance poll the manager tprints the manual-extra add and the upgrader's tail drops to `available $0` and stops spending; `rm finance-reserve-extra.txt` → reservation released (tprint), spending resumes. This exercises the entire pipeline (rule → reservation → state file → customer gate) live, today.
4. **Upgrader spending run:** with real available cash, watch it take the lowest server up tiers; confirm per-upgrade tprints, `auto-cloud-upgrade` records in the transactions log with correct amounts, daemon picks up grown hosts on its next refresh with **no** vanished-host warnings (no renames), and no batching disruption in the daemon tail.
5. **Off switch:** `write cloud-upgrade-off.txt` (0-byte) → PAUSED within a poll; remove → resumes.
6. **Kill/restart resilience:** kill `financemanager.js` only → within `STALE_MS` the upgrader flags stale state and stops spending (one WARN, not spam); relaunch → resumes.
7. `npm run verify:log` green across daemon log, transactions log, and the new finance log.

### Round B — the one reset (piggyback on the next natural augment install; budget ≤2, aim 1)

After install + daemon start (manual `run` steps included if home RAM forces skips):

1. Finance manager announces the fresh ladder: `bootstrap-server $110k` + `tor-router` + `next-port-opener BruteSSH` (formulas absent below level 301). Confirm the amounts against the now-visible real prices; fix constants if any differ.
2. Hand-buy the 2 GB server in the UI → `bootstrap-server` released within a poll (tprint + log event).
3. Buy TOR in the UI → `tor-router` released; `buy -l` now shows live unowned prices — the real table verification. Run `purchasescripts.js` (or hand-buy BruteSSH) → `next-port-opener` walks to FTPCrack.
4. Confirm the upgrader stayed correctly frozen while reservations exceeded cash, and starts spending only once money clears `totalReserved`.
5. Copy `logs/finance-log.json`; `npm run verify:log` green on it.

### Deferred past sign-off (BACKLOG follow-ups, not blockers)

The upper ladder rungs in real time (relaySMTP → SQLInject walking as purchases land over hours/days; formulas reservation appearing live at level 301 and releasing on purchase). Structurally slow, verified by the same tprint+log mechanics already proven on the lower rungs.

## Files

- **New:** `src/financemanager.js`, `src/cloudupgrader.js`, `test/finance.test.js`, `test/cloudupgrader.test.js`, `test/verify-finance.test.js`.
- **Modified:** `src/daemon.js` (+2 `launchDetached` lines, nothing else), `vite.config.ts` (+1 filter line), `test/verify-transactions.test.js` (+1 whitelist entry).
- **Untouched:** everything listed in work item 4, plus workers/monitors/`ramcheck.js`.
- **`BACKLOG.md`** on completion: move this phase to Done with date; file follow-ups: (a) deferred ladder observations above, (b) *augment reservation cost model* (the real design Kenneth back-burnered — manual-extra is the stopgap), (c) *rename-only cosmetic utility* idea if stale `pserv-` names prove annoying, (d) future finance-manager customers (`upgradehomeram.js` is the obvious next one).

## Acceptance criteria

**Runnable (green before handoff):**

- `npm test` green: full suites above, all pre-existing tests untouched and passing.
- `npm run verify:log` behavior verified against a synthetic `logs/finance-log.json` fixture placed locally (then removed): schema checks fail on a malformed entry and pass on a well-formed one. (Real-log verification is Round A/B's job.)
- RAM predictions for both new scripts computed from markdown-verified per-call costs and stated in the handoff summary.

**Observed (Kenneth, in order):**

- RAM gate: `daemon.js` unchanged at 16.30 GB; both new scripts within ~0.5 GB of prediction (else identifier-hygiene hunt).
- Round A items 2–7 all pass; in particular A3 (manual-reserve gate) and A6 (staleness fail-safe) — these two are the phase's core safety properties.
- Round B ladder observed on one reset: every release tprinted + logged within one poll of the purchase; upgrader frozen until cash cleared reservations; price table confirmed (or corrected) against the live `buy -l`.
- Transactions log carries correct `auto-cloud-upgrade` records; all `verify:log` assertions green on the exported real logs.
- BACKLOG updated per Files.

## Out of scope

New-server purchasing (reserved-for, never automated here); gating manual utilities on reservations; `upgradehomeram.js` or any second customer; a real augment cost model (manual-extra is the stopgap); renaming servers from the auto-upgrader; any Singularity call in either new script; any batching/share math change; dashboards.

## Peer review record (2026-07-05)

A cold-context reviewer (given only this file and the raw requirements) verified requirements coverage, spot-checked the spec's factual claims against `markdown/` docs, `hosts.js`'s `PORT_OPENERS` order, `verify-transactions.test.js`'s whitelist/shape, `vite.config.ts`, and the live daemon log, and raised two blocking issues — both accepted and folded in above:

1. **`upgradeServer(false)` was an unspecified path that broke the loop-termination guarantee** — an implementer re-picking the same still-affordable server after a `false` return would produce an unbounded synchronous loop (a game-freezing hang in the core spending path). Now specified: WARN once and break the poll's upgrade loop; the next poll retries fresh.
2. **The "non-empty `changed` except startup entries" checker assertion was unimplementable** — with a single `event: "reservations"` kind, the offline checker had no way to identify startup entries. Now specified: startup entries carry `event: "startup"` and are exempt; every `"reservations"` entry must have a non-empty `changed`.

Non-blocking observations noted by the reviewer: the off-switch `ns.fileExists` check costs 0.1 GB, not 0 (already covered by the spec's own "verify against markdown" instruction — and it's a single charge shared with the other `fileExists` uses in the same script), and the `write <file>` terminal steps in Round A/B follow the already-proven `share-off.txt` marker pattern.

## Open questions

None. The two review findings were accepted outright, and the delegated decisions (interface shape, upgrade priority, upgrade ceiling, no-rename policy, untouched manual scripts) are recorded with rationale above; the 110k semantics (hand-buy in UI) and daemon wiring (launched + marker off switch) were confirmed with Kenneth 2026-07-05.
