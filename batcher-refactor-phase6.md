# Spec: post-reset auto-backdoor + persistent events log (Phase 6)

Status: REVERTED (2026-07-04) — implemented same day, then fully reverted at the user's
request: they misunderstood some of the underlying game mechanics this spec assumed
(notably around faction auto-join and current Singularity access), and judged it not worth
further development at this time. All code from this spec (`common.js`, `eventlog.js`,
`factionwatcher.js`, `backdoorfactions.js`, the `hosts.js`/`connect.js`/`daemon.js` edits,
new tests, and the `vite.config.ts`/`CLAUDE.md` wiring) was reverted via `git revert` (not
rewritten history — the commits and this revert are both visible in `git log`). None of it
is implemented. The underlying BACKLOG items (post-reset auto-backdoor, and the
`tryRoot`/`findPath` extraction from the consolidation item) are back in Next Up as
plain to-do items — see `BACKLOG.md`. Treat this document as historical design record only;
do not resume from it without re-confirming the settled decisions still hold.

## Context

Work in `C:\Users\admin\bitburner-scripts` (edit `src/`; `npm run dev` runs the viteburner watcher that syncs into the game). Phase 5 (see `batcher-refactor-phase5.md`) is complete and live-verified; `npm test` was last green at 78/78.

This phase implements BACKLOG's **post-reset auto-backdoor** item plus one new piece of infrastructure it feeds: a **persistent events log** spanning the whole playthrough. A `backdoorfactions.js` was previously implemented and then deliberately reverted (2026-07-04, mid-testing); the design decisions from that attempt are preserved in BACKLOG and restated here as binding. Implement fresh from this spec — do not resurrect the reverted code from git history; where history and this spec differ, this spec wins.

BACKLOG sequences the consistency-consolidation item before this one because the backdoor script needs `tryRoot` and `findPath`. **Settled 2026-07-04:** this phase does a *minimal* extraction of exactly what it needs (Item 1), placed where the consolidation item already planned them to live, so the later full consolidation builds on it instead of re-shuffling. The rest of the consolidation item stays in Next Up, untouched.

The scheduler/daemon/sampling core is healthy — **do not change any batching math, thread sizing, timing, reservation, or ranking behavior anywhere in this phase.** If an edit would change what the daemon launches, when, or how big, it's out of scope.

## Ground rules

Same as Phases 1–5, in full:

- Verify every NS API call signature against the docs in `markdown\` before using it. Do not rely on memorized signatures. Do not search the web or reference community implementations.
- `scheduler.js` stays pure; worker scripts untouched; no changes to `sampling.js` math, `HACK_FRACTION`, buffers, hysteresis, or drift thresholds.
- Tests run through vitest only (`npm test`); keep the existing mock-ns style.
- **Singularity RAM warning:** without SF4, every `ns.singularity.*` call costs its base × 16 (e.g. `connect`/`installBackdoor`/`getCurrentServer` are 2 GB base → 32 GB each). **No Singularity call may appear in `daemon.js` or anything `daemon.js` imports.** `daemon.js` imports `hosts.js`, and after this phase `hosts.js` imports `common.js` — so `common.js` and `hosts.js` must stay Singularity-free permanently; state this in `common.js`'s header charter. `eventlog.js` must also stay Singularity-free (it's in `factionwatcher.js`'s bundle). Only `backdoorfactions.js` itself may call Singularity functions, and it must never be imported by anything.
- RAM is charged per script bundle (whole import tree), not per imported function. Every touched or new script gets a before/after `getScriptRam` measurement in-game, reported at handoff. Expected deltas are stated per item below; investigate anything beyond them.
- `BACKLOG.md`: move the backdoor item to In Progress when starting, Done (with date) when finished, per `CLAUDE.md`.

Phase-specific:

- **Scope guard (spoiler rule):** faction-server targets are exactly `CSEC` and `avmnite-02h`. Do not add other servers, do not enumerate or probe future factions/servers, do not build config for content not yet reached. Adding a target later should be a one-line constant change.
- **No auto-join.** The script installs backdoors only. Joining a faction stays a manual player decision.

---

## Item 1: minimal shared-helper extraction

**New `src/common.js`.** Header charter: ns-dependent helpers shared by multiple scripts; no policy decisions, no batching math; keep the ns surface minimal and cheap; **never any Singularity or `ns.cloud.*` call** (this file ends up in `daemon.js`'s bundle). This phase it contains exactly two exports (the consolidation item adds more later):

- `findPath(ns, target, start = "home")` — moved from `connect.js` and generalized to take a start host. BFS parent-chain walk, returns the hop list from `start` to `target` inclusive (`[start]` when `start === target`), or `null` if unreachable. Rewire `connect.js` to import it; `connect.js`'s behavior is otherwise unchanged (still print-only).
- `tprintTs(ns, message)` — same 3-line implementation as `daemon.js`'s private copy. **Leave `daemon.js`'s own copy untouched** — rewiring daemon internals is the consolidation item's job; this export exists so the two new companions don't add a third and fourth copy.

**`hosts.js`:** extract the rooting block inside `getHosts` into an exported `tryRoot(ns, server)` — returns `true` if the server ends up rooted (already rooted, or newly nuked here), `false` otherwise (level too high or not enough port openers owned). It owns the `PORT_OPENERS` check/open/nuke sequence and the existing `INFO: rooted new host` tprint. `getHosts` calls it; observable behavior of `getHosts` must be byte-identical (same servers rooted, same hosts returned, same prints). Do **not** do the rest of the consolidation item's hosts.js restructure (`listHosts`, `HOME_RESERVE_GB` export, launchmonitor switch) — that stays in BACKLOG. Note `tryRoot` may recompute the owned-openers list per call where `getHosts` computed it once per scan; that costs a few extra 0-GB-relevant `fileExists` calls per cycle and is fine.

RAM expectations: `hosts.js`, `daemon.js`, `launchmonitor.js`, `targetsmonitor.js`, `targets.js`, `killscripts.js` all ~flat (pure reshuffles of ns functions already in their bundles). `connect.js` gains `common.js`'s surface — `scan` and `tprint` are already in its bundle, so ~flat too.

## Item 2: persistent events log

A single continuous log for the **entire playthrough** — unlike every existing log (ring-buffered daemon log, per-run targets summaries, daily transactions files), this one is never rotated, trimmed, or reset. It exists so rare, high-signal milestones (faction joins, backdoor installs) are permanently traceable and debuggable across resets.

**Persistence mechanism:** files on `home` survive an augmentation install, so the file simply carries forward; nothing to migrate. The viteburner export (below) keeps an off-game copy in `logs/` as backup. Confirming survival across a real reset is a live-validation follow-up (it can't be tested before the next reset — record it in BACKLOG like the waived fleetupgrade test).

**Reset identification (settled):** every record carries `resetId` = `ns.getResetInfo().lastAugReset` — the epoch-ms timestamp of when the current reset began. All events within one reset share the value; a new reset produces a new value automatically. No counter file to maintain or migrate, and `new Date(resetId)` is human-readable. (`getResetInfo` is 1 GB — verify in `markdown\bitburner.ns.getresetinfo.md`.)

**`src/eventlog.js` — shared write helper**, patterned directly on `translog.js`:

- `EVENTS_FILE = "events-log.json"` (named like `daemon-batch-log.json`; distinct from all three existing filename patterns).
- `recordEvent(ns, record)` — synchronous read-modify-write append: `ns.read` (empty/missing → `[]`), push, `ns.write(..., "w")`. **No `await` between the read and the write** — same multi-writer invariant as `translog.js`; copy that header's explanation. `recordEvent` stamps the common fields itself so no caller can forget them: `time` (locale string), `timestamp` (epoch ms), `resetId` (as above). Callers supply `type` plus type-specific fields.
- Header must state the file's charter: **rare events only** (this playthrough should produce dozens of records, not thousands). The full-array rewrite per append is only acceptable at that volume; a future high-frequency stream gets its own file, never this one.

**Record types this phase** (a `type` enum the verify checker asserts against):

- `{ type: "faction-joined", faction }` — written by `factionwatcher.js`. Optional `late: true` flag (see reconciliation below).
- `{ type: "backdoor-installed", server }` — written by `backdoorfactions.js`. Beyond the letter of the faction-join requirement, but it's exactly the debugging breadcrumb this feature needs; flag it at handoff as a scope addition.

**`src/factionwatcher.js` — always-on companion** (settled: a dedicated watcher, not the backdoor script, owns join detection — the backdoor script exits when its targets are done and would miss later joins):

- Launched by `daemon.js` at startup via `launchDetached`, alongside the two existing monitors. Never calls `ns.exec`; writes nothing but events.
- Poll `ns.getPlayer().factions` every `POLL_MS = 10_000` (joins are rare; 1 s adds nothing). Baseline on first poll; on any subsequent poll, each name present now but not before → `recordEvent({ type: "faction-joined", faction })` + a `tprintTs` announcement.
- **Startup reconciliation (closes the downtime gap):** joins that happen while the watcher is down (daemon-restart gap, crash) would otherwise be lost. On startup, read `events-log.json`, collect factions with a `faction-joined` record whose `resetId` matches the current reset, and diff against current `ns.getPlayer().factions`: any current membership with no record this reset gets logged immediately with `late: true` (its `timestamp` is discovery time, not join time — that's what the flag means; say so in the header). This also gives the feature a useful day-one behavior: the first-ever run records the current save's existing memberships.
- Extract the two decisions as pure functions for unit tests: `newlyJoined(previousFactions, currentFactions)` and `missingJoinEvents(currentFactions, events, resetId)`.
- No tail window — unlike the other monitors there's nothing to watch minute-to-minute; `tprintTs` on each recorded event is the whole UI. Note this deliberate deviation from the monitor pattern in the header.
- Expected RAM ≈ 3.1 GB (1.6 base + 0.5 `getPlayer` + 1.0 `getResetInfo` via eventlog) — measure and report.

## Item 3: `src/backdoorfactions.js` + daemon wiring

Post-reset companion: after an augmentation install resets hacking level (and invite eligibility), watch the named faction servers and install their backdoors as soon as we qualify. Standalone script launched by `daemon.js` (same companion pattern as the monitors), **never imported by anything**, and the only file allowed Singularity calls.

Constants at top: `TARGETS` — exactly `CSEC` and `avmnite-02h`, each mapped to its faction name for the joined-check (use `ns.enums.FactionName` rather than string literals if available — verify in `markdown\`; 0 GB). `POLL_MS = 60_000`.

Per target, each poll:

1. **Done conditions (skip permanently, tprint the reason once):** `ns.getServer(target).backdoorInstalled === true` (field verified in `markdown\bitburner.server.md`; it's optional — treat `undefined` as false), or the mapped faction is already in `ns.getPlayer().factions`.
2. **Eligibility:** `ns.getHackingLevel() >= ns.getServer(target).requiredHackingSkill` (also an optional field — these two servers always define it, but don't crash on `undefined`), and rooted — `ns.hasRootAccess(target)` or `tryRoot(ns, target)` succeeds now.
3. **Action (settled: save & restore the terminal).** All terminal movement goes through one testable helper, `walkTo(ns, destination) → boolean`:
   - `walkTo` reads `current = ns.singularity.getCurrentServer()` fresh (never trusts a caller-remembered position — a stranded half-walk self-corrects on the next call). If `current === destination`, return `true` with **zero** `connect` calls. Otherwise take `findPath(ns, destination, current)` and call `ns.singularity.connect` on **each element after the first** — the path is start-inclusive, and element 0 is the server the player is already on; connecting to it is the off-by-one this rule exists to prevent. `connect` only reaches **neighbors** (verified in `markdown\bitburner.singularity.connect.md`), which is why the path starts from the player's *current* server, never assumes home. On any `connect` returning `false`, stop and return `false`.
   - The attempt: `origin = ns.singularity.getCurrentServer()`; `walkTo(ns, target)` — on `false`, `tprintTs` a WARN, best-effort `walkTo(ns, origin)`, retry next poll.
   - Sanity-check `getCurrentServer() === target`, then `await ns.singularity.installBackdoor()`.
   - On success: `tprintTs` it, `recordEvent({ type: "backdoor-installed", server: target })`, then restore via `walkTo(ns, origin)`. A failed restore walk is a WARN, never a reason to treat the install as failed.
   - Document the residual terminal-hijack window in the header: the install itself takes real time during which the player's terminal sits on the target, and a player moving the terminal between the sanity check and the install is an accepted race.
4. **Exit when every target is done** — frees the Singularity-sized RAM. `killscripts.js` sweeps it on daemon restart (no changes needed there); relaunch is idempotent because every action re-checks state first.

Extract the per-target classification as a pure function for unit tests: `classifyTarget({ backdoorInstalled, factionJoined, hackingLevel, requiredLevel, rooted })` → `"done-backdoored" | "done-joined" | "waiting" | "ready"`. tprint on classification *changes* only, not every poll — a 60 s cadence must not spam the terminal.

**Daemon wiring — launch retry (settled):** post-reset home RAM is smallest exactly when this script matters most, so a single startup attempt could miss by days. `launchDetached` gets a boolean return (`true` iff `exec` returned a pid; existing callers ignore it). `daemon.js` keeps a per-companion launched-flag; on each `CYCLE_MS` refresh, any companion not yet successfully launched is re-attempted, silently (the existing one-time INFO-skip at startup already says it's waiting; `tprintTs` on eventual success). Retry stops at the first successful launch — no marker files, no `ns.scriptRunning`, no new daemon RAM. If the companion later exits (backdoorfactions exiting when done) it is *not* relaunched until the next daemon restart, which is correct — relaunch-on-restart is the idempotent re-check. **Apply the retry uniformly to all four companions** (`targetsmonitor`, `transactionsmonitor`, `factionwatcher`, `backdoorfactions`) — one mechanism, no special cases. For the two existing monitors this is a small behavior improvement (a RAM-skipped monitor now eventually launches); flag it at handoff as this phase's behavior addition to existing scripts.

Expected RAM: ~100 GB without SF4 (three 32 GB Singularity functions + 2 GB `getServer` + `hosts.js`'s and `common.js`'s surfaces + eventlog's 1 GB `getResetInfo`). Measure, report, and record the figure in the file header — it documents why the launch-retry mechanism exists. `daemon.js` expected flat.

## Wiring and docs

- `vite.config.ts`: add a fourth download-filter entry — `if (file === 'events-log.json') return 'logs/events-log.json';` — and extend the comment above it: a **continuous playthrough-long** file, never rotated, carries `resetId` per record.
- `CLAUDE.md`, Communication section: add the events log to the exported-log bullet — continuous across resets, one record per milestone event (faction joins, backdoor installs), `resetId` field identifies the reset — **the first place to look when debugging anything faction- or backdoor-related.**
- `BACKLOG.md`: backdoor item → Done (with date, and the live-validation follow-up recorded); annotate the consolidation item that `findPath`/`tprintTs`/`tryRoot` shipped early via Phase 6 so its remaining scope is accurate.

## Verification

- Unit tests, mock-ns style: `findPath` (start≠home, start===target, unreachable → null); `tryRoot` (already rooted; rootable → opens+nukes; level too high; ports short); `eventlog.recordEvent` (empty file → one record; append preserves existing; common fields stamped, `resetId` from mocked `getResetInfo`); `newlyJoined` / `missingJoinEvents`; `classifyTarget` (all four outcomes, including backdoored-but-not-joined and joined-but-not-backdoored).
- **`walkTo` unit tests (required — this is the only pre-reset verification the walk gets):** mock `getCurrentServer`/`connect`/`scan` over a canned adjacency map, then assert: already-at-destination → `true` with zero `connect` calls; multi-hop walk → `connect` called once per path element *after* the first, in path order, never for the start element; mid-walk `connect` → `false` → helper stops connecting and returns `false`. The live acceptance below short-circuits at the done-conditions on the current save, so a wrong walk would otherwise ship green and only surface at the next reset — these tests are what closes that gap.
- Log checker `test/verify-events.test.js` (auto-included by the existing `test/verify-*.test.js` glob — confirm): file parses as a JSON array; every record has a known `type`, positive `timestamp`, positive `resetId`; `faction-joined` records carry a non-empty `faction`, `backdoor-installed` a non-empty `server`; `timestamp` monotone non-decreasing in append order; every record's `resetId` is ≤ its `timestamp`. Soft report: record count per reset and per type.
- **Live acceptance (runnable now, current save):** restart the daemon; confirm both new companions launch (or retry-launch) cleanly. `factionwatcher.js` writes `late: true` reconciliation records for the save's existing factions and `events-log.json` lands in `logs/` via auto-export. `backdoorfactions.js` tprints its per-target classification once (confirm the save's actual CSEC/avmnite-02h state first — likely already done) and, if all targets are done, exits cleanly. ≥ 15-minute daemon session after: `npm run verify:log` green (now three checkers), batch log healthy, transactions log income unchanged in character.
- **Structurally deferred (record in BACKLOG as live-validation follow-up):** the real end-to-end — reset → file survives → level up → root → walk → backdoor → event logged → manual join → join logged, all under the new `resetId` — cannot run before the next reset.

## Acceptance summary

1. `npm test` green throughout, ending ≥ 78 plus the new tests.
2. `npm run verify:log` green post-phase, now covering daemon, transactions, and events logs.
3. Live acceptance above passed; deferred end-to-end recorded in BACKLOG.
4. RAM report for every touched/new script: `hosts.js`, `connect.js`, `daemon.js`, `launchmonitor.js`, `targetsmonitor.js`, `targets.js`, `killscripts.js` (~flat), `factionwatcher.js` (~3.1 GB), `backdoorfactions.js` (~100 GB, exact figure recorded in its header).
5. Handoff flags per `CLAUDE.md`'s deviation rule: the uniform companion launch-retry (touches existing monitor behavior), and `backdoor-installed` events (scope addition beyond the required faction joins).
6. `vite.config.ts`, `CLAUDE.md`, `BACKLOG.md` updated as above.

## Settled decisions (2026-07-04, binding) and open questions

Settled with Kenneth: daemon-side launch retry (over a manual-run skip message); save-and-restore the terminal (over accept-and-document); a dedicated always-on `factionwatcher.js` owns join logging (over the backdoor script or transactionsmonitor); helper placement per BACKLOG's consolidation end-state (minimal extraction, decided by the spec author on Kenneth's delegation).

Peer-reviewed 2026-07-04 (cold-context review against the requirements): one blocking issue — the terminal walk was ambiguous over `findPath`'s start-inclusive return (a literal reading connects to the current server, looping forever when `origin === target`) and had no pre-reset test coverage. Addressed by the `walkTo` helper contract (skip-first rule, fresh `getCurrentServer` per call) and its required unit tests.

Open questions: none currently.
