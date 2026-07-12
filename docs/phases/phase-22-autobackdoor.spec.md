# Phase 22 spec: auto-backdoor faction servers (surface invites, never join)

## Context

Work in `C:\Users\admin\bitburner-scripts`. Requirements: `phase-22-autobackdoor.features.md` —
read it first; this spec assumes it, including the scope boundary (four hacking-faction servers,
Fulcrum/Daedalus excluded), the honest value framing (removes an attended re-bootstrap chore;
not a progression lever), and the hard rail (auto-UNLOCK, never auto-JOIN). Prior art is
Phase 6's reverted `backdoorfactions.js` (`docs/phases/phase-06-batcher-refactor.md`) — the
features file already sorted which of its decisions still hold (keep: `walkTo` skip-first
contract, `classifyTarget`, save/restore terminal; drop: launch-retry, `factionwatcher.js`,
events log). Where phase-06's doc and this spec differ, this spec wins.

What ships: one new companion script `src/backdoorfactions.js` (the only new file allowed
Singularity calls), a `start`-parameter generalization of `common.js`'s `findPath`, one
`launchDetached` line in `daemon.js`, one `vite.config.ts` filter line for the new status log,
and the vitest coverage that is the only pre-reset verification the terminal walk gets.

**Audience note:** the implementer does everything marked **[code]**. Kenneth does everything
marked **[live]** — except daemon restarts, which CLAUDE.md pre-authorizes Claude to do over
CDP. No [live] step requires editing code; the one post-live [code] step (recording the
measured RAM figure in the header) is a comment edit.

## Ground rules

- `CLAUDE.md` rules apply. All `ns` signatures used here were verified against `markdown/`
  during spec drafting: `singularity.connect(host) → boolean` (neighbors only, 2 GB × mult),
  `singularity.installBackdoor() → Promise<void>` (2 GB × mult),
  `singularity.getCurrentServer() → string` (2 GB × mult), `ns.enums.FactionName` (exists in
  this build; members `CyberSec`, `NiteSec`, `TheBlackHand`, `BitRunners` confirmed in
  `markdown/bitburner.factionnameenumtype.md`). The implementer re-verifies anything added
  beyond this list.
- **Transactions log: N/A** — nothing here spends money (`tryRoot` nukes, it doesn't buy).
  Stated so the omission is visibly deliberate.
- **Singularity isolation:** `backdoorfactions.js` is `exec`'d by filename via
  `launchDetached`, never imported by anything. It imports only Singularity-free modules
  (`common.js`, `hosts.js`) — both are in `daemon.js`'s bundle and their charters stay intact
  (nothing Singularity moves into them). Reachability-based RAM charging (Phase 13/16) means
  `hosts.js`'s `ns.cloud.*` surface in `listHosts` doesn't charge this script, which only
  reaches `tryRoot`.
- **The hard rail is enforceable, not aspirational:** the string `joinFaction` must not appear
  anywhere in `src/` after this phase (it doesn't today). Acceptance checks it by grep.
- **Identifier hygiene:** new identifiers (`FACTION_TARGETS`, `STATUS_FILE`, `classifyTarget`,
  `walkTo`, `writeStatus`, `exitSingularityUnavailable` — module-scoped, deliberately the same
  name as `procureprograms.js`'s private copy) are pre-checked clean against ns
  function/method names; never alias a singularity method name (`connect`, `installBackdoor`,
  `getCurrentServer`) into a standalone identifier (Phase 9/11's collision mechanism) — call
  them as `ns.singularity.*` inline.
- **No batcher changes.** `daemon.js` gains exactly one `launchDetached` line; scheduler,
  sampling, targets, workers untouched. Daemon RAM expected exactly flat (exec-by-filename).
- Branch `phase22-autobackdoor` off `master`. `npm test` the implementer runs and clears; the
  RAM reading and live observation are Kenneth's (daemon restart itself is Claude-over-CDP,
  pre-authorized). BACKLOG/CHANGELOG edits ride the same branch.

## Spec-stage decisions

- **S1 — Poll cadence (features Q1): 60 s.** Nothing here is latency-sensitive — the
  bounding events (hacking level crossing a threshold, a manual join) happen on minutes-to-
  hours scales, and the slow poll is also what keeps the accepted terminal-hijack race rare.
  Phase 6 chose the same number for the same reasons; nothing has changed that input.
- **S2 — Tail (features Q3): no standing tail.** Four rare events over a whole node don't
  justify a window; this follows the features lean and phase-06's `factionwatcher` precedent
  (deliberate deviation from the monitor pattern, noted in the header). The script still
  `ns.print`s a full status block to its own script log each poll (`ns.clearLog()` +
  `ns.print`, `procureprograms` style) so a manually-opened tail is informative, and
  `tprintTs` fires **only on classification changes** (plus one launch summary and one exit
  summary) — never per-poll. On exit it calls `ns.ui.closeTail()` anyway (0 GB, no-op when no
  tail is open) so a manually-opened tail can't be left frozen (Phase 18 clean-exit rule).
- **S3 — Faction names (features Q4): use `ns.enums.FactionName`.** Confirmed available in
  this build (0 GB). The map is `CSEC → FactionName.CyberSec`, `avmnite-02h →
  FactionName.NiteSec`, `I.I.I.I → FactionName.TheBlackHand`, `run4theh111z →
  FactionName.BitRunners`. Enum members are read inside `main` (they need `ns`), so the
  module's pure exports stay `ns`-free for vitest.
- **S4 — RAM (features Q2): derived ≈ 10.9 GB at SF4.3's 1×; measured live and recorded in
  the header.** Derivation from the final call set: 1.6 base + 3 × 2 GB Singularity
  (`getCurrentServer`, `connect`, `installBackdoor`) + 2.0 `getServer` + 0.5 `getPlayer`
  + 0.05 `getHackingLevel` + 0.2 `scan` (via `findPath`) + ~0.55 `tryRoot`'s surface
  (`hasRootAccess`, `fileExists`, `getServerRequiredHackingLevel`,
  `getServerNumPortsRequired`, five openers, `nuke`). The implementer re-derives from the
  actual final call set; the live `ramcheck.js` reading is the recorded figure. Anything in
  the ~9–13 GB band confirms the features file's premise (launch-retry deletion safe: it fits
  under `HOME_RESERVE_GB = 32` even on a saturated home); a reading near ~29 GB would mean
  the 4× multiplier is somehow live and is a stop-and-investigate, not a header note.
- **S5 — `findPath` gains a `start` parameter (`findPath(ns, target, start = "home")`).**
  The walk must path from the player's *current* server, and `connect` only reaches
  neighbors, so a home-rooted path is useless mid-network. Generalizing the existing helper
  (phase-06 Item 1's surviving plan) beats a private copy: `common.js` stays Singularity-free
  (BFS over `ns.scan` only — charter intact), the default preserves the existing `connect.js`
  call site byte-for-byte, and the unreachable → `null` / `start === target` → `[start]`
  contracts get unit tests.
- **S6 — Log-verified via a status file: `backdoor-status.json`, overwrite-in-place — a
  spec-stage ADDITION beyond the features file, flagged here deliberately.** The features
  file pruned the events-log infrastructure (append-only playthrough history, watcher,
  verify-checker) and that pruning stands — this is a different, smaller thing: CLAUDE.md's
  validation convention requires results checkable from exported logs, not terminal paste,
  and without *some* export this phase's acceptance would rest entirely on tprints. The
  script `ns.write`s (mode `"w"`) a single current-state snapshot
  `{ timestamp, time, hackingLevel, targets: [{ server, faction, classification }], allDone }`
  at launch, on any classification change, and at exit — never per-poll, so the auto-export
  isn't churned. One `vite.config.ts` filter line routes it to `logs/`. **No
  `verify:log` checker** — that machinery guards recurring streams whose corruption is
  silent; a four-row snapshot is read directly at validation time, and re-adding a checker
  would recreate exactly the infrastructure the features file deleted.
- **S7 — Two-tier throw handling: an availability sentinel exits; transient throws retry
  (resolves the cold review's blocker).** `installBackdoor` returns `Promise<void>` — its
  *only* failure signal is a throw — so "any throw exits" and "failures retry next poll"
  cannot both be the rule. The rule: the script keeps a process-local flag,
  `singularityProven`, set true after the first `ns.singularity.*` call that returns without
  throwing. A throw while `singularityProven` is **false** is the no-SF4 sentinel
  (`procureprograms`'s discovered failure mode): print one WARN + summary, write the status
  file, `ns.ui.closeTail()`, exit — same shape as `exitSingularityUnavailable`. A throw while
  it is **true** is by definition transient game-state (terminal moved, player action
  conflict — SF4 can't be revoked mid-process): per-target WARN, best-effort origin restore,
  retry next poll; the script **never** exits on it, because exiting on a lull is exactly the
  failure the features file forbids (nothing relaunches until the next daemon restart). The
  proactive `hasSourceFile4` pre-check is deliberately dropped: SF4.3 is a permanent
  save-level grant (Phase 21), so it's dead code costing 1 GB (`getResetInfo`); the sentinel
  covers the can't-happen path.
- **S8 — Per-poll action batching: save origin once, act on every ready target, restore
  once.** More than one target can be ready in the same poll (e.g. first launch on an
  already-leveled save). Per pass: `origin = getCurrentServer()` once → for each ready
  target: `walkTo(target)` → sanity-check arrival → `await installBackdoor()` → next →
  finally best-effort `walkTo(origin)`. One restore instead of N halves the terminal churn;
  any mid-sequence failure WARNs, still attempts the origin restore, and leaves the remainder
  to the next poll (every action re-checks state first, so this is safe). The residual
  player-moves-terminal race stays accepted-and-documented per the features file.
- **S9 — Live validation is two-tier, and Tier 1 is guaranteed real (features Q5).**
  Verified live during spec drafting (CDP `stats`, 2026-07-12): current hacking level is
  **1**, so all four targets are pending on this save and the "everything already done at
  launch" branch cannot fire this phase. Tier 1 therefore exercises the real
  walk → sanity-check → `installBackdoor` → restore path, not just mocks: launch +
  classification + status export are checked at the L1 sitting, and **phase close-out gates
  on the first real backdoor landing** (CSEC at hacking 54 — hours away under the batcher),
  which proves the whole action path end-to-end. The remaining three targets are the same
  code path at higher thresholds, observed over the run as the climb crosses them — worth
  watching, not worth blocking on. Tier 2, the fresh-node end-to-end (reset → climb → invite
  appears on a *new* reset), stays structurally deferred and recorded in BACKLOG with its
  trigger (next install/reset on this node).

## Design

### Work item 1 — `common.js`: `findPath(ns, target, start = "home")` [code]

Third parameter with default; seed the BFS at `start` instead of the literal `"home"`.
Contracts (unit-tested): default call unchanged; `start === target` → `[start]`;
`start ≠ home` returns the start-inclusive hop list from `start`; unreachable → `null`.
`connect.js` untouched (default covers it). `scanNetwork`/`findAllPaths`/charter untouched.

### Work item 2 — `src/backdoorfactions.js` [code]

Header states: purpose; the auto-UNLOCK/never-JOIN rail; the accepted terminal-hijack race
(S8); no-standing-tail rationale (S2); the measured RAM figure (added post-live); the standing
rule that this file is exec'd by filename and never imported.

Constants: `FACTION_TARGETS = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z"]` (faction
mapping via `ns.enums.FactionName` inside `main`, per S3); `POLL_MS = 60_000`;
`STATUS_FILE = "backdoor-status.json"`.

Pure exports (unit-tested):

- `classifyTarget({ backdoorInstalled, factionJoined, hackingLevel, requiredLevel, rooted })`
  → `"done-backdoored" | "done-joined" | "waiting" | "ready"` — phase-06's contract:
  `backdoorInstalled === true` wins (undefined is false), then `factionJoined`, then
  eligibility (`Number.isFinite(requiredLevel) && hackingLevel >= requiredLevel && rooted` →
  `"ready"`, else `"waiting"`; a non-finite/missing `requiredLevel` can never be ready).

`walkTo(ns, destination) → boolean` (exported for tests, mock-ns style):

- Reads `current = ns.singularity.getCurrentServer()` fresh every call — never trusts a
  caller-remembered position (a stranded half-walk self-corrects next call).
- `current === destination` → `true` with **zero** `connect` calls.
- Else `path = findPath(ns, destination, current)`; `null` → `false`. Otherwise call
  `ns.singularity.connect` on **each element after the first** — the path is start-inclusive
  and element 0 is where the player already is; connecting to it is the off-by-one phase-06's
  cold review caught. Any `connect` returning `false` → stop, return `false`.

Main loop (per poll):

1. Read `hackingLevel` and `joined = new Set(ns.getPlayer().factions)` once per poll; per
   target read `ns.getServer(target)`, compute `factionJoined = joined.has(<mapped
   FactionName>)` and `rooted = ns.hasRootAccess(target) || tryRoot(ns, target)`
   (side-effectful rooting lives here in the caller, keeping `classifyTarget` pure); classify.
2. Any classification differing from the previous poll → `tprintTs` the change + `writeStatus`.
3. All four done (`done-*`) → final `tprintTs` summary, `writeStatus` (with `allDone: true`),
   `ns.ui.closeTail()`, exit.
4. Any `ready` targets → S8's batched act: origin saved once; per ready target `walkTo` →
   sanity-check `getCurrentServer() === target` → `await ns.singularity.installBackdoor()` →
   `tprintTs` success; failures (a `false` walk, a failed sanity check, **or a transient
   throw per S7**) WARN and retry next poll; one best-effort origin restore at the end (a
   failed restore is a WARN, never a reason to treat an install as failed).
5. `ns.clearLog()` + `ns.print` status block; `await ns.sleep(POLL_MS)`.

Every `ns.singularity.*` call site is inside try/catch implementing S7's two-tier rule:
throw before `singularityProven` → clean exit; throw after → WARN-and-retry. At launch:
one `tprintTs` summary line of all four initial classifications + initial `writeStatus`.
Idempotent by construction: `killscripts.js` sweeps it on daemon restart, relaunch re-checks
everything (no changes needed there).

### Work item 3 — `daemon.js`: one launch line [code]

`launchDetached(ns, "backdoorfactions.js");` next to the `procureprograms.js` line, with a
one-line comment in the existing style (Singularity-heavy self-terminating fulfiller;
resident until all four faction servers are done — exits across a level climb only when
finished, not on lulls). No launch-retry (features decision; S4 confirms it fits).

### Work item 4 — `vite.config.ts`: one filter line [code]

`backdoor-status.json` → `logs/backdoor-status.json`, matching the existing filter style;
comment: Phase 22 — faction-backdoor status snapshot, overwritten in place, written on change
only.

### Work item 5 — tests [code]

Vitest, existing mock-ns style, in `test/backdoorfactions.test.js` plus extensions to the
existing `common.js` coverage:

- **`findPath` start param:** default = old behavior (regression guard on an existing case);
  `start ≠ home`; `start === target` → `[start]`; unreachable from `start` → `null`.
- **`classifyTarget`:** all four outcomes, including backdoored-but-not-joined,
  joined-but-not-backdoored, `backdoorInstalled: undefined` → falsy, `requiredLevel:
  undefined` → never ready, unrooted-at-level → waiting.
- **`walkTo` (required — the only pre-reset verification the walk gets):** mocked
  `getCurrentServer`/`connect`/`scan` over a canned adjacency map: already-at-destination →
  `true`, zero `connect` calls; multi-hop → `connect` once per path element *after* the
  first, in order, never the start element; mid-walk `false` → stops connecting, returns
  `false`; unreachable destination → `false`, zero `connect` calls.

### Work item 6 — BACKLOG / CHANGELOG / graduation [code]

Delete BACKLOG's "Post-reset auto-backdoor" Ideas entry; add the Tier-2 follow-up as its own
Ideas line (fresh-node end-to-end validation — walk → backdoor → invite appears — **trigger:
the next install/reset on this node**). Dated close-out entry in `docs/phases/CHANGELOG.md`
noting: the S6 status-file addition beyond the features file, the measured RAM figure, and
which validation tier ran. Graduate both phase docs to `docs/phases/`. Staged with the work.

## Live procedure [live]

Pre-step: work items 1–5 merged locally, `npm test` green, dev server healthy and
`dist/src/backdoorfactions.js` present (standing byte-check rule).

- **L1 — Launch.** Claude restarts `daemon.js` over CDP (pre-authorized: changed script).
  Confirm: launch summary `tprintTs` with each target's current classification (all
  `waiting` if launched below hacking 54; a faster-than-expected climb making CSEC
  `ready`/done by then satisfies the intent, not fails it); `logs/backdoor-status.json`
  appears with four rows. **Heads-up for Kenneth:** if any target is `ready` at launch, the
  script will visibly move the terminal within ~60 s — that's the feature, not a bug.
- **L2 — RAM.** `run ramcheck.js backdoorfactions.js` → reading lands in
  `logs/ramcheck-result.json`; must sit in S4's ~9–13 GB band (a ~29 GB reading = 4× mult
  somehow live → stop, investigate). Figure goes into the script header ([code] comment edit).
- **L3 — First real backdoor (the close-out gate, per S9).** All four targets start
  `waiting` (hacking 1 at spec time). When the climb crosses 54: watch the CSEC
  classification-change tprint, the status file flipping its row to `done-backdoored`,
  `run serverlist.js` showing `bd Y`, and the CyberSec invite visible in-game **with no
  faction auto-joined**. This is not a one-sitting step — it lands whenever the climb does;
  the phase branch stays open (or the close-out entry stays pending) until it has. The
  remaining three targets are observed opportunistically over the run, non-blocking.
- **L4 — No-spam soak.** After ≥15 min of daemon uptime: terminal shows no per-poll output
  from this script (only launch/change/exit lines), and `npm run verify:log` still green
  (unchanged checkers — regression guard, not new coverage).

## Acceptance criteria

- **`npm test` green** including work item 5's full list; no existing test touched except the
  `findPath` extension. [code, implementer clears]
- **Never-join rail:** `grep -r joinFaction src/` finds nothing. [code]
- **RAM recorded:** `logs/ramcheck-result.json` shows `backdoorfactions.js` in the ~9–13 GB
  band; the figure is recorded in the script header; `daemon.js` reading flat vs. its current
  header figure. [live artifact + code comment]
- **Status log exported:** `logs/backdoor-status.json` present with exactly the four
  configured targets, each carrying a valid classification, `allDone` consistent with the
  rows. [live, checked from the exported file]
- **Live behavior:** L1 launch summary observed (each target's then-current
  classification); L3's first real backdoor landed — CSEC `done-backdoored` in the status file, `bd Y` in `serverlist.js`,
  invite surfaced, zero joins; L4 soak clean. The close-out CHANGELOG entry waits on L3
  even though it arrives on the climb's schedule, not the sitting's. [live]
- **Tier-2 deferral recorded:** BACKLOG carries the fresh-node end-to-end follow-up with its
  trigger; CHANGELOG entry notes which tier ran. [code]

## Files touched

**New:** `src/backdoorfactions.js`, `test/backdoorfactions.test.js`.

**Edited:** `src/common.js` (`findPath` start param), `src/daemon.js` (one launch line),
`vite.config.ts` (one filter line), the existing common-helpers test file, `BACKLOG.md`,
`docs/phases/CHANGELOG.md`.

**Deliberately untouched:** `hosts.js` (`tryRoot` already has the exact signature this phase
was promised), `connect.js`, scheduler/sampling/targets/workers, `translog.js` (no spend),
`killscripts.js` (already sweeps companions), `tailmanager.js` (no standing tail to manage).
