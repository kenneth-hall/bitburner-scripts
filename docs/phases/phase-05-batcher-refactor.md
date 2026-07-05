# Refactor spec: daily transactions log (Phase 5)

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner watcher that syncs into the game). Phase 4 (see `phase-04-batcher-refactor.md`) is complete: formulas math with legacy fallback, verified live — 0 flips and constant pipeline depth in formulas mode vs. 9 flips and 31→209 depth swings in the same-session legacy segment. `npm test` was last green at 65/65.

**Re-scoped 2026-07-04 (post-review):** this spec originally bundled four items from the 2026-07-04 code audit. After review it was trimmed to one — the daily transactions log — so the phase has a single live-acceptance gate and fits one session. The other three items (ratio → priority display, consistency consolidation, `backdoorfactions.js`) moved back to `BACKLOG.md`'s Next Up with all their settled decisions preserved; BACKLOG is their single source of truth again. The build-first rationale survives the re-scope: every future phase gets to use the transactions log as a debugging/verification resource for anything money-related. Once it exists, prefer reading it over asking for terminal pastes — same principle as `CLAUDE.md`'s existing log rules.

The scheduler/daemon/sampling core is healthy — **do not change any batching math, thread sizing, timing, reservation, or ranking behavior anywhere in this phase.** If an edit would change what the daemon launches, when, or how big, it's out of scope.

## Ground rules

Same as Phases 1–4, in full:

- Verify every NS API call signature against the docs in `markdown\` before using it (purchased servers are `ns.cloud.*`, formatting is `ns.format.*`, Singularity is `ns.singularity.*`). Do not rely on memorized signatures. Do not search the web or reference community implementations.
- `scheduler.js` stays pure — no `ns` calls in it, nothing moves into it this phase.
- Worker scripts (`hack.js`, `grow.js`, `weaken.js`) are untouched.
- Legacy/formulas behavior is untouched: no changes to `sampling.js`'s math, `HACK_FRACTION`, buffers, hysteresis, or drift thresholds.
- Tests run through vitest only (`npm test`); plain `node` can't import `src/` (ESM-in-.js, no `"type": "module"` — don't add one). Keep the existing mock-ns style: canned returns chosen so every `ceil()` lands far from a float boundary.
- Singularity RAM warning: without SF4, every `ns.singularity.*` call carries a large RAM multiplier. **No Singularity call may appear in `daemon.js` or anything `daemon.js` imports.** Two of the instrumented purchase scripts (`purchasescripts.js`, `upgradehomeram.js`) are Singularity scripts — both manual utilities; the daemon execs *neither* (its only `runAndWait` call site is `killscripts.js`; `purchasescripts.js`'s own header claims otherwise, a claim BACKLOG's consolidation item already flags as false). `translog.js` gets imported *into* them, never the other way around, and `translog.js` itself must stay Singularity-free — a Singularity call in it would carry the multiplier into every non-Singularity importer's bundle (`purchasecloudservers.js`, `fleetupgrade.js`, `transactionsmonitor.js`).
- RAM is charged per script bundle (whole import tree), not per imported function — Phase 4 confirmed this. The `translog.js` import into four scripts must therefore end with a RAM gate: measure `getScriptRam` in-game for each affected script before and after, and report the numbers. Expect roughly zero growth; investigate anything that jumps.
- `BACKLOG.md`: move the item to In Progress when starting, Done (with date) when finished, per `CLAUDE.md`.

---

## The item: daily transactions log

Retires `moneymonitor.js` in favor of a per-day transactions file, per the decisions settled in BACKLOG (2026-07-04) and binding here: one file per calendar day (filename encodes the date, rotates at the day boundary); updated live as transactions happen, not on a 5-minute snapshot cadence; income is hacking only for now (delta of `ns.getMoneySources().sinceStart.hacking` — spend-proof, non-negative); expenses are script-driven purchases only, instrumented directly at the four purchase call sites.

### Files

**`src/translog.js` — shared write helper.** Exports:

- `transactionsFileName(date)` — pure. Returns `transactions-YYYY-MM-DD.json` built from **local** date parts (`getFullYear`/`getMonth`/`getDate` — not `toISOString`, which is UTC and would rotate the file at the wrong hour). Pure so it's unit-testable.
- `recordTransaction(ns, record)` — appends one record to today's file. Implementation is a synchronous read-modify-write: `ns.read` today's file, `JSON.parse` (empty/missing → `[]`), push, `ns.write(..., "w")`. **No `await` anywhere between the read and the write** — Bitburner scripts are single-threaded JS, so a synchronous read-modify-write can't interleave with another writer's. This is the whole concurrency story: multiple writers (the income companion plus any manually-run purchase script) are safe *only* because every writer goes through this helper and the helper never yields mid-update. Document that invariant in the file header. Day rotation needs no extra logic — the filename is derived from the clock at each write.
- `ns.read`/`ns.write` are 0 GB (verify in `markdown\`), so importing this into the purchase scripts is RAM-free in principle — confirm via the RAM gate anyway.

**Record shape.** Common fields on every record: `type` (`"income"` | `"expense"`), `source` (see below), `amount` (always positive), `time` (locale string). Expense records carry `timestamp` (epoch ms); income records carry `firstTimestamp`/`lastTimestamp` *instead* — no plain `timestamp`, mirroring the daemon log's coalesced skip records, which also drop it (a single timestamp on a folded record is ambiguous). Context fields per source:

- `{ type: "expense", source: "cloud-purchase", hostname, ram, amount }` — per server, from `purchasecloudservers.js`
- `{ type: "expense", source: "fleet-upgrade", detail, servers, amount }` — per move (one record per laggard-leveling batch, one per whole-fleet tier bump), from `fleetupgrade.js`
- `{ type: "expense", source: "darkweb-program", program, amount }` — per program, from `purchasescripts.js`
- `{ type: "expense", source: "home-ram-upgrade", newRamGb, amount }` — per upgrade, from `upgradehomeram.js`
- `{ type: "income", source: "hacking", amount, firstTimestamp, lastTimestamp }` — coalesced, from the companion below. The ordering caveat matches the daemon log's coalesced skips: order income records by `firstTimestamp`.

**Instrumentation per call site** — sample the cost *before* the purchase call and record only on success. Three of the four sites already have a clean success gate to hang the record on:

- `purchasescripts.js:29` — `if (ns.singularity.purchaseProgram(program))`, record inside the branch.
- `upgradehomeram.js:9-11` — cost sampled at line 9, `if (!ns.singularity.upgradeHomeRam()) break;` — record on the fall-through.
- `purchasecloudservers.js:46-48` — `if (!hostname) break;` after `ns.cloud.purchaseServer`; record once the hostname is known good.
- **`fleetupgrade.js` is the exception — it has no success check today.** Lines 42 and 60 fire `ns.cloud.upgradeServer(h, ...)` in bare loops; affordability is checked *before* each loop (lines 40/58), but the individual calls' returns are ignored. **Add return checks** (verify `upgradeServer`'s return type in `markdown\`): zip each host with its pre-sampled per-host cost (the `costs` arrays at lines 34/52 are already index-aligned with the host lists), sum only the successes into the record's `amount`, and `tprint` a WARN naming any host whose upgrade call failed. Partial-batch semantics: the record reflects what actually succeeded, never the planned total; **if no host succeeded, write no record at all** — the log checker requires `amount > 0`, and the WARNs already cover visibility. **This is the phase's one behavior addition to an otherwise-untouched script — flag it explicitly at handoff per `CLAUDE.md`'s deviation rule.** (The existing `report.push` lines should also switch to the succeeded-only totals so the terminal report and the log can't disagree. Also update the file header while here: it still says "ONE-OFF utility … run once by hand, then delete", which this phase makes false by turning the file into a permanent transactions-log call site — reclassify it as a permanent manual utility. This pulls one line of BACKLOG's consolidation item forward; noted there.)

**`src/transactionsmonitor.js` — income companion.** Launched by `daemon.js` at startup via `launchDetached`, exactly replacing `moneymonitor.js`'s slot. Behavior:

- Baseline `ns.getMoneySources().sinceStart.hacking` at startup. Poll every `POLL_MS = 1000`. When the delta since the last poll is > 0, record it.
- **Known limitation (document in the file header):** baseline-at-startup means income accrued while the monitor isn't running — the kill-to-relaunch gap on a daemon restart, or after a crash — is never recorded. Accepted for now; it's seconds per restart. Written down so a future reconciliation mismatch reads as this known gap, not a bug hunt.
- **Coalescing (resolves the BACKLOG spec's "live" wording against write volume):** with the pipeline saturated, hack landings arrive about once a second — a record per landing is ~86k records/day and a full-array rewrite per record goes quadratic. Instead, reuse the daemon log's proven coalescing pattern: if the day-file's last record is an income record whose `lastTimestamp` is within `INCOME_COALESCE_GAP_MS` (default 60 s) *and* whose **projected** window (`nowTimestamp - firstTimestamp`) stays under `INCOME_WINDOW_MAX_MS` (default 5 min), fold the new delta in (add to `amount`, advance `lastTimestamp`); otherwise append a fresh record. (Projected, not current: gating on the *existing* window would let the final fold stretch a 4:59 window past the max by up to the gap, and the log checker below asserts the hard `<= INCOME_WINDOW_MAX_MS` bound.) This caps steady-state volume at ~288 income records/day while a purchase or lull still breaks the window within a minute. (Note the cap is on *records*, not *writes* — the file is still read-modify-written up to once per second; that's fine because the array stays small.) Both constants are named tunables at the top of the file. The fold/append decision is a **pure function** (`shouldCoalesce(lastRecord, nowTimestamp)` or similar) so it's unit-testable.
- Coalescing writes go through the same synchronous read-modify-write discipline as `recordTransaction` (read fresh, modify, write, no `await` between) — never hold an in-memory mirror of the file, or a purchase script's append would get clobbered by the next flush.
- Keep a tail popup (this is what the user loses with moneymonitor): `ns.ui.openTail()`, **redraw every poll, not only on writes** — a write-tied redraw goes stale during income lulls and never reflects expense records other scripts append. The per-poll re-read is free (`ns.read` is 0 GB). Show the last ~20 records of the current day file, newest first, plus a running today-total income line and a derived $/min rate (today's income total over time elapsed since the day's first income record) — preserving the rate readout moneymonitor's popup gave. Never calls `ns.exec`; writes nothing but the income records above.

### Removals and wiring

- Delete `src/moneymonitor.js`. Remove its `launchDetached` call in `daemon.js` and add the `transactionsmonitor.js` one. Update the companion-dashboards comment above those calls (`daemon.js:316-318`): "both read-only" becomes false — `transactionsmonitor.js` writes the day file — while the part the daemon actually cares about (never calls `ns.exec`, zero effect on the worker-RAM pool) stays true; say that instead. Note: viteburner pushes new/changed files but won't delete the in-game copy — also run `rm moneymonitor.js` in the game terminal (flag this to the user at handoff if it can't be done from the tooling side).
- `vite.config.ts`: add a download-filter entry so the daily files land in `logs/` — alongside the existing two patterns:
  `if (/^transactions-\d{4}-\d{2}-\d{2}\.json$/.test(file)) return `logs/${file}`;`
- `CLAUDE.md`, Communication section: extend the exported-log bullet with the third pattern — a **daily-rotating** file (`transactions-YYYY-MM-DD.json`), distinct from the ring-buffered daemon log and the per-run targets summaries — and note it's the first place to look when debugging anything money-related.

### Verification

- Unit tests (`test/translog.test.js`): `transactionsFileName` goldens including a month/single-digit-day padding case; `shouldCoalesce` cases (fold within gap, break past gap, break past max window, non-income last record, empty file). Mock-ns test for `recordTransaction` (read returns existing array → new array written with record appended; read returns empty → array of one).
- Log checker (`test/verify-transactions.test.js`, run against real exported files like `verify-log`): every file parses as a JSON array; every record has a valid `type`/`source` from the enums above; `amount > 0` everywhere; income records have `firstTimestamp <= lastTimestamp` and windows no longer than `INCOME_WINDOW_MAX_MS`; records ordered by their ordering key (`firstTimestamp` for income, `timestamp` for expenses — append order guarantees the composite sequence is monotone, since a fold can't continue once another record lands behind it). Soft report: per-day income total, income/minute, expense total by source. Wire it into `vitest.verify.config.ts`'s `include` (the main `vitest.config.ts` `exclude` must cover it too — use a `test/verify-*.test.js` glob). Reuse the existing `npm run verify:log` script; it now runs both checkers.
- Live acceptance: run the daemon ≥ 15 minutes; confirm the day file appears in `logs/` via the auto-export; run one real purchase script during the window and confirm its expense record (right source, right amount) landed *without* disturbing the income coalescing around it; compare the session's summed income records against the `getMoneySources` delta over the same window. **Be honest about what this reconciliation tests:** every record is a slice of the same counter, so a match mostly proves the arithmetic — its real value is detecting *clobbered writes*, the riskiest part of the multi-writer design (the purchase-during-income case above is the scenario that matters). It cannot catch a wrong baseline or a missed window. Small tolerance for the final unflushed poll.

---

## Acceptance summary

1. `npm test` green throughout, ending ≥ the current 65 plus the new translog and coalescing tests.
2. `npm run verify:log` green post-phase (now covering both the daemon log and the transactions files).
3. Transactions log live-verified: income sums reconcile with `getMoneySources` (understood as a clobber check, per above), a real purchase lands as a correctly-shaped expense record, file auto-exports to `logs/`.
4. `moneymonitor.js` gone (repo and in-game).
5. RAM report before/after for every touched script: `daemon.js`, `transactionsmonitor.js` (vs. `moneymonitor.js`), `purchasecloudservers.js`, `fleetupgrade.js`, `purchasescripts.js`, `upgradehomeram.js`.
6. The `fleetupgrade.js` return-check addition flagged at handoff as the phase's one behavior change.
7. `BACKLOG.md` updated (this item → Done with date; items 2–4 remain in Next Up untouched by this phase).
8. `CLAUDE.md` Communication section mentions the transactions log as an available exported log and debugging resource.
