# Phase 13 features: consistency consolidation — shared helpers (`src/common.js`)

**Stage:** requirements handoff for the spec stage, per `CLAUDE.md`'s Development workflow.
The spec stage turns this into `phase-13-consolidation.spec.md` and delegates a cold-context
`spec-reviewer` pass before implementation. This is a **behavior-preserving refactor** — no new
game behavior, no batching/scheduling/finance math change — so the safety net is the RAM gate
plus a before/after daemon session, not new features.

> **Phase number is provisional (see Open questions #1).** This is `#3` of the agreed
> post-Phase-11 batch. `#2` (`upgradehomeram.js` → resource-manager customer) is expected to be
> built first; whichever ships first takes the next free number. Holds `phase-13` here as the
> current lowest free slot (Phase 14 already shipped as bootstrap); rename if `#2` lands first.

## Goal

Kill the accumulated copy-paste across the batcher's utility layer by minting one shared module
(`src/common.js`) for the ns-dependent helpers that several scripts currently each re-implement,
and split `hosts.js`'s overloaded `getHosts` into composable pieces. Two payoffs: (1) it removes
the specific duplication a 2026-07-04 audit catalogued, and (2) it mints the `scanNetwork` /
`findPath` (and, from `hosts.js`, `tryRoot` / `listHosts`) helpers the not-yet-built auto-backdoor
and darknet phases both depend on — this phase is their **hard prerequisite**. Nothing else in the
current batch conflicts with it, so it can slot anywhere in the batch as long as it precedes those
two later phases.

## What's duplicated / wrong today (verified against `src/` on 2026-07-05)

- **`scanNetwork(ns)` — three byte-identical copies.** The same BFS-from-`home` appears verbatim
  in `hosts.js` (lines 15–32), `targets.js` (8–25), and `killscripts.js` (5–22).
- **`findPath(ns, target)` — one copy, in `connect.js` (7–29).** BFS parent-chain walk that
  returns the hop list. Only `connect.js` uses it today; the backdoor phase will want it too.
- **`tprintTs(ns, message)` — one copy, in `daemon.js` (92–94).** Timestamp-prefixed `ns.tprint`.
  Meanwhile `hosts.js`'s own rooted-host notice (`getHosts`, line 59) fires
  `ns.tprint("INFO: rooted new host …")` **without** a timestamp — and it fires mid-daemon-run
  (the daemon calls `getHosts` every cycle), exactly the unpredictable-timing case `tprintTs`
  exists for.
- **worker `getScriptRam` map — two builds that overlap but aren't identical.** `targets.js`
  (70–74) builds a **3-script** map (`hack`/`grow`/`weaken`); `daemon.js`'s `refreshCycle`
  (422–427) builds the same three **plus `SHARE_SCRIPT`** (a 4th key). Same construction, different
  key set — this asymmetry drives Decision 4.
- **`HOME_RESERVE_GB = 32` — two copies.** In `hosts.js` (5, the source of truth) and re-declared
  private in `daemon.js` (80), with a comment (75–79) that explicitly *justifies* the duplication
  by citing the `scanNetwork` triple-copy as house precedent — i.e. it leans on exactly the
  pattern this phase removes.
- **free-RAM-check preamble — two copies inside `daemon.js`.** `launchDetached` (102–110) and
  `runAndWait` (122–130) open with an identical ~9-line "get script RAM, get home free RAM, skip
  with a message if it won't fit" block.
- **`runAndWait`'s doc comment is misleading.** Its header (117–121) narrates
  `procureprograms.js`/`upgradehomeram.js` as its customers, but its **only call site** is
  `runAndWait(ns, "killscripts.js", ns.pid)` (323) — a cheap non-Singularity script. The
  Singularity-doesn't-fit reasoning belongs on the detached-launch path, not here.
- **`getHosts` conflates two jobs.** It both **mutates** (nukes anything newly rootable, lines
  52–60) and **lists** (returns the host/RAM records). `launchmonitor.js` imports and calls it
  (15, 29, 42) while its own header (10) claims a "read-only pattern" — a live falsehood: the
  monitor nukes newly-rootable servers from inside a read-only-labelled loop, racing the daemon's
  refresh.
- **`standardSizes` power-of-2 builder — two copies.** `cloudcosts.js` (10–11) and
  `purchasecloudservers.js` (14–16) each write `for (let size = 16; size <= ramLimit; size *= 2)`.
- **Two dead files.** `src/cleanup-old-daemon-log-temp.js` (run-once, job long done) and the
  root-level `cloud-server-costs.js` (older duplicate of `src/cloudcosts.js`, never synced by
  viteburner — `vite.config.ts` only watches `src/**`).

## The enabling fact (why this whole refactor is RAM-safe)

Phase 9 established live that **Netscript RAM charging is reachability-based, not
whole-file/bundle** (BACKLOG "Done", the `share`→`sharePool` rename result: `daemon.js` dropped the
full 2.4 GB phantom once the *reachable* collision was renamed, and `targets.js` — which imports
the same module but never calls the construct — stayed flat). Consequence for this phase:
**co-locating helpers in `common.js` does not cross-charge importers for helpers they don't call.**
`connect.js` importing `findPath` from `common.js` pays for `ns.scan` (which `findPath` reaches)
but **not** for `getScriptRam` (which `workerRamCosts`, sitting in the same file, reaches) — because
`connect.js` never calls `workerRamCosts`. Every RAM prediction below rests on this; the RAM gate
re-confirms it.

## Decisions

1. **New module `src/common.js`, charter stated in its header.** Charter: *ns-dependent helpers
   shared by 2+ scripts; no policy decisions, no batching/finance math; keep the ns surface
   minimal and cheap.* The only ns calls its helpers reach are `ns.scan` (`scanNetwork`,
   `findPath`), `ns.tprint` (`tprintTs`), and `ns.getScriptRam` (`workerRamCosts`). Explicitly
   **nothing `ns.cloud.*` and nothing Singularity** — those stay in their owning modules so
   `common.js` importers never risk reaching them.

2. **Contents of `common.js`: `scanNetwork`, `findPath`, `tprintTs`, `workerRamCosts`.** Move the
   three `scanNetwork` copies verbatim and rewire `hosts.js`/`targets.js`/`killscripts.js` to
   import it; move `findPath` from `connect.js`; move `tprintTs` from `daemon.js` **and** adopt it
   for `hosts.js`'s rooted-host notice (fixing the missing timestamp); add `workerRamCosts(ns)`
   (Decision 4). `workerRamCosts` imports `WORKER_SCRIPTS` from `scheduler.js` (pure, ns-free, no
   cycle: `common → scheduler` is one-way).

3. **`tryRoot` lives in `hosts.js`, not `common.js` — resolving a contradiction inside BACKLOG.**
   BACKLOG's priority-order note says `common.js` "mints the `tryRoot`/`findPath`/`scanNetwork`
   helpers," but its own `hosts.js`-restructure section puts `tryRoot` in `hosts.js`. These can't
   both hold. **Resolution: `hosts.js`.** `tryRoot` needs `PORT_OPENERS` and calls `ns.nuke` +ns
   the five opener programs — it has real side effects and a heavier ns surface, both of which
   violate `common.js`'s "no side effects / minimal cheap surface" charter. `hosts.js` already
   owns `PORT_OPENERS` and the nuke logic; keeping `tryRoot` there is its natural home. The
   backdoor phase imports `tryRoot` **from `hosts.js`** — reachability charging means it pays only
   for `tryRoot`'s calls, not for `getHosts`'s `ns.cloud.getServerNames`, so there's no RAM reason
   to hoist it into `common.js`.

4. **`workerRamCosts(ns)` returns the three batch workers; the daemon augments it with share.**
   The helper mirrors `scheduler.js`'s deliberate definition — `WORKER_SCRIPTS` is *the three
   targeted batch workers*, and `SHARE_SCRIPT` is intentionally kept out of it (scheduler.js
   comment, 34–37). So `workerRamCosts(ns)` returns `{hack, grow, weaken}` costs; `targets.js`
   uses it as-is; `daemon.js` spreads and adds the share key:
   `{ ...workerRamCosts(ns), [SHARE_SCRIPT]: ns.getScriptRam(SHARE_SCRIPT, "home") }`.
   *(Branch: rejected a `workerRamCosts(ns, {includeShare})` flag — it would drag `share`
   semantics into a module whose charter says "batch workers only," and the spread is a one-liner
   at the single call site that needs share.)*

5. **Split `getHosts` into `tryRoot(ns, server)` + `listHosts(ns)`; `getHosts` composes them
   (exact current behavior). Export `HOME_RESERVE_GB`; `daemon.js` imports it and deletes its
   private copy + the now-obsolete justifying comment.**
   - `tryRoot(ns, server)`: the PORT_OPENERS/nuke block (57–60), returns whether the server ended
     up rooted; emits the rooted-host notice via `tprintTs`.
   - `listHosts(ns)`: pure listing, no rooting side effect — the network/purchased/home host+RAM
     records, with `HOME_RESERVE_GB` held back for home.
   - `getHosts(ns)`: `listHosts` with `tryRoot` applied to each not-yet-rooted candidate first —
     byte-for-byte the behavior today's callers (daemon) rely on.
   - `HOME_RESERVE_GB` stays *defined* in `hosts.js` (it's a host-listing policy value, and
     `common.js`'s charter bars policy) but becomes an **export**; `daemon.js`'s duplicate const
     and its 75–79 comment go away. Net dependency change for the daemon: none — it already
     imports `getHosts` from `hosts.js`.

6. **`launchmonitor.js` switches to `listHosts`, and its header is corrected — and this is a RAM
   *decrease*, not flat (correcting BACKLOG's stale note).** BACKLOG calls this "a correctness
   fix, not a RAM fix — bundle charging means it already paid." That parenthetical predates the
   Phase 9 reachability finding. Under reachability charging, once `launchmonitor.js` calls
   `listHosts` (no rooting) instead of `getHosts`, it **stops reaching** `ns.nuke` and the five
   opener programs, so its RAM should **drop**. The RAM gate for this file should therefore expect
   a decrease and quantify it, not assert flat. Header rewritten to say it deliberately uses the
   non-rooting `listHosts` so the "read-only" claim becomes true.

7. **`daemon.js` internal cleanup (local, not `common.js`).** Factor the identical free-RAM-check
   preamble out of `launchDetached`/`runAndWait` into one **daemon-local** helper (it depends on
   the daemon-local `tprintTs` import and is daemon-internal — no reason to export it). Make the
   skip message call-site-neutral. Fix `runAndWait`'s doc comment: describe its real sole customer
   (`killscripts.js`) and move the Singularity-doesn't-fit reasoning to the detached-launch path
   where `procureprograms.js`/`upgradehomeram.js` actually run.
   *(Superseded sub-item, do not redo: the `sumInFlightRam`/`countBatchesInFlight` move BACKLOG
   lists here already shipped as Phase 7's `inFlightByTarget`.)*

8. **`cloudcosts.js` exports the `standardSizes` builder; `purchasecloudservers.js` imports it.**
   Lives in `cloudcosts.js`, **not** `common.js`, because it calls `ns.cloud.getRamLimit()` and
   the charter keeps `ns.cloud.*` out of `common.js`. `purchasecloudservers.js` already imports
   `translog.js`, so adding a `cloudcosts.js` import is routine; both already reach `ns.cloud`, so
   RAM stays flat on both.

9. **Delete both dead files, including their in-game copies.** `rm` `src/cleanup-old-daemon-log-temp.js`
   and root `cloud-server-costs.js`; also remove the in-game copies where they exist (viteburner
   won't delete them on its own).

10. **`killscripts.js` header needs no change — BACKLOG's fix for it is already done.** BACKLOG
    lists a `killscripts.js` header fix ("daemon doesn't kill in steady state"). The current
    header (1–3) already states exactly that ("runs this once at startup … never per cycle — the
    daemon's own kill/launch diffing handles steady-state churn"). No-op this item; recorded so the
    spec stage doesn't chase a phantom.

## Rejected alternatives

- **Put `tryRoot` in `common.js`** (per BACKLOG's priority-order wording) — rejected, Decision 3:
  side-effecting + heavy ns surface vs. the module's "pure/cheap" charter; `hosts.js` already owns
  the openers and nuke.
- **`workerRamCosts(ns, {includeShare})` flag** — rejected, Decision 4: pushes share semantics
  into a batch-workers-only helper; the daemon's one-line spread is cheaper and keeps the charter
  clean.
- **Zero-move, README-only "role map"** (BACKLOG's zero-risk alternative for the *repo-org* pain) —
  a good idea but a **different** item; it documents structure without deduping code. This phase is
  the dedup; the role map can still happen later independently.
- **Physically split `src/` into subfolders as part of this** — explicitly out (BACKLOG flags it as
  the heavy, exec-path-touching change). This phase is flat-directory dedup only.
- **Fold in the `WORKER_SCRIPTS`-key phantom-charge fix** (the RAM-analyzer-hygiene BACKLOG item) —
  kept out of the default scope (wider rename across every `WORKER_SCRIPTS[...]` call site), but
  see Open questions #3: this phase's RAM gate is a cheap opportunity to *confirm* the mechanism.

## Open questions (for the spec stage / Kenneth)

1. **Phase number 13 vs 14** — pin it once the `upgradehomeram.js` phase's number is known
   (Decision-block note at top). Trivial `git mv`.
2. **Home for `HOME_RESERVE_GB`.** Decision 5 keeps it in `hosts.js` (policy value; `common.js`
   charter bars policy). Minor alternative: a `common.js` constant, since the daemon would import
   `common.js` anyway. Flagged, not blocking — default is `hosts.js`.
3. **Run the `WORKER_SCRIPTS`-key E-matrix confirmation during this phase's RAM gate?** We're
   already measuring `daemon.js`/`targets.js`/`scheduler.js` importers before/after; confirming
   whether object-literal keys (`hack`/`grow`/`weaken`) collide with `ns.hack`/`grow`/`weaken`
   names (the suspected 0.4 GB phantom) is nearly free here. Confirm-only — the actual key rename
   stays a separate phase.
4. **Exact RAM-gate file set.** Definitely: `common.js` (new), `hosts.js`, `targets.js`,
   `killscripts.js`, `connect.js`, `launchmonitor.js` (expect ↓), `daemon.js`, `cloudcosts.js`,
   `purchasecloudservers.js`. Spec stage should grep for any other importer of a changed export
   (e.g. `targetsmonitor.js`) and add it if reachability changed.

## Out of scope

- Any new game behavior; any batching/scheduling/finance/targeting math change.
- The physical `src/` subfolder split and the standalone role-map README (separate BACKLOG items).
- The `WORKER_SCRIPTS`-key **rename** (confirm-only is Open question #3; the rename is its own
  phase).
- `upgradehomeram.js`'s resource-manager conversion (the sibling `#2` phase).

## Validation sketch (the spec stage fills in detail)

- **Tests:** `npm test` green, including relocated helpers. Add/keep unit coverage for the pure
  pieces — `scanNetwork`, `findPath`, and the `tryRoot`/`listHosts` split (mock-free where
  possible, house style). No test should change behavior, only import paths.
- **RAM gate (`ramcheck.js` → `logs/ramcheck-result.json`, per the logged-output convention — not
  `mem`/terminal):** before/after on the file set in Open question #4. Expect **flat** on
  `daemon.js`, `targets.js`, `hosts.js`, `killscripts.js`, `connect.js`, `cloudcosts.js`,
  `purchasecloudservers.js`; expect a **decrease** on `launchmonitor.js` (Decision 6). Any
  unexplained delta → run the identifier-hygiene check before sign-off. **Refresh the viteburner
  dev-server connection before measuring** (the known stale-export gotcha), so the gate isn't read
  off a dead bridge.
- **Live:** a ≥15-minute daemon session after the change, `npm run verify:log` green with the same
  character as prior acceptance runs; the transactions log (Phase 5) should show income unchanged
  in character (this is behavior-preserving, so the bar is "nothing moved," not "improved").
- **Rooted-host notice:** confirm `hosts.js`'s "rooted new host" line now carries a `tprintTs`
  timestamp when a server is newly rooted mid-session (or note it as observe-when-it-happens if no
  new root occurs in the window).
