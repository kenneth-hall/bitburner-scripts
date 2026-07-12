# Phase 22 — auto-backdoor faction servers (surface invites, never join)

**Stage:** Brainstorm (opus). Output is decisions + rejected alternatives + open questions for the
spec stage. Nothing production is built. There is significant prior art: this feature was fully
built and `git revert`-ed twice (Phase 6) — its historical design record is
`docs/phases/phase-06-batcher-refactor.md`. That doc is *not* a resume point; several of its
premises changed (SF4 is now live, the RAM picture inverted). This doc re-derives from current
state and only borrows the decisions that still hold.

## Why this phase exists (the goal check)

Current goal: **re-enter BN1 and clear it once more for SF1.2**, where the *named binding constraint*
is **attended re-bootstrap time**, not money/rep (`project_bn1_install_reality`). Every fresh node
(and every install within a node that resets invite eligibility) currently requires a manual chore:
walk the network to each hacking-faction server, `connect`, `backdoor`, to make its invite appear.

This phase automates exactly that chore — root + walk + `installBackdoor()` the four hacking-faction
servers as soon as hacking level allows — and **stops there**, leaving the join decision manual. It
shaves attended steps off re-bootstrap on this node and every future one. That's the whole value.

**Honest scope of the value (the objection, up front):** the invite is the *cheap* step. Backdooring
surfaces a faction's aug **shop**; it buys nothing until rep is ground there, and rep is the real
cost. So this is not "get the augs I'm missing" — it's "remove an attended manual step from
re-bootstrap" plus minor early aug-shop visibility. A small, genuinely goal-aligned automation, not a
progression lever. Do not oversell it.

## The five backdoor-gated factions — and why v1 does four

Only server-backdoor-gated invites are in scope. City factions, Netburners (Hacknet-gated), and
Daedalus's real gates unlock on money/stats/augs/Hacknet, not a backdoor — out of scope by mechanic.

| Server | Faction | Req. hacking | In v1? |
|---|---|---|---|
| `CSEC` | CyberSec | 54 | ✅ |
| `avmnite-02h` | NiteSec | 202 | ✅ |
| `I.I.I.I` | The Black Hand | 351 | ✅ |
| `run4theh111z` | BitRunners | 542 | ✅ |
| `fulcrumassets` | Fulcrum Secret Technologies | high + **250k company rep** | ❌ deferred |
| `The-Cave` | Daedalus | 925 | ❌ (necessary-not-sufficient; separate endgame flow) |

**Fulcrum deferred:** its invite needs 250k *company* rep on top of the backdoor, so a blind backdoor
does nothing useful and the eligibility check is a different shape. Adding it later is a one-row
constant change if we ever want it. `The-Cave`/Daedalus stays owned by the endgame runbook.

Required hacking levels are re-derivable anytime from `serverlist.js`; treat the table as a caching
convenience, not a source of truth.

## Lifecycle — the `procureprograms` model (decided)

Mirror `src/procureprograms.js` exactly: a **self-terminating Singularity fulfiller**, launched by
`daemon.js` at startup via `launchDetached` (exec-by-filename, never imported — it's the only file
allowed Singularity calls, per the hot-path rule). It **stays resident polling on a slow cadence
while any target is still unmet, and exits only when all four are permanently done**, closing its own
tail on the way out (Phase 18 clean-exit convention).

**The nuance that must not be gotten wrong:** "has something to do" means *an unmet target still
exists*, **not** *an action is available this instant*. The four targets unlock across a long hacking
climb (54 → 542). If the script exited on the first lull — e.g. after backdooring CSEC at hacking 54,
with NiteSec not yet reachable — nothing would relaunch it (the daemon only launches companions at
startup), and the other three would never get done this node. So: resident until all-done, like
`procureprograms` waiting for cash, not exit-on-idle.

Per poll, per not-yet-done target (classification is a pure, unit-tested function — see phase-06's
`classifyTarget`, which still applies):

1. **Done (skip permanently):** `ns.getServer(target).backdoorInstalled === true` (optional field —
   treat `undefined` as false), OR the mapped faction is already in `ns.getPlayer().factions`.
2. **Eligible:** `ns.getHackingLevel() >= requiredHackingSkill` AND rooted (`hasRootAccess` or
   `tryRoot` succeeds now).
3. **Act:** save current server, walk to target, sanity-check arrival, `await installBackdoor()`,
   walk back. Never `joinFaction`.

Exit + close tail once every target is classified done. Idempotent: a daemon restart relaunches it and
every action re-checks state first, so re-running is safe and cheap.

## What changed since Phase 6 — complexity we can now delete

1. **Drop the launch-retry mechanism.** Phase 6's `backdoorfactions.js` was ~100 GB (no SF4) and too
   fat to reliably fit, forcing a daemon-side launch-retry. SF4.3's 1× discount drops the Singularity
   surface to single-digit GB, so it just launches like any companion. **Open Q:** confirm the actual
   RAM figure in-game and record it in the header (est. well under 10 GB).
2. **Drop `factionwatcher.js` entirely.** Phase 6 carried an always-on watcher *only* to log
   faction-join events into a persistent events log. This feature surfaces invites; it does not log
   joins. No join-logging → no watcher → no events-log infrastructure (`eventlog.js`, the
   `vite.config.ts` filter, the verify-events test). One script, not three.
3. **Keep** the `walkTo(ns, destination) → boolean` helper and its skip-first contract (phase-06's
   cold review found the real bug here: `findPath` returns start-inclusive, so a naive walk connects
   to the current server and loops when `origin === target`). Fresh `getCurrentServer()` per call.

## The hard rail (unchanged, load-bearing): auto-UNLOCK, never auto-JOIN

The script installs backdoors only and **never calls `joinFaction`**. Joining can permanently lock you
out of mutually-exclusive factions you still need augs from (city factions conflict; some pairs are
enemies). Kenneth decides which invites to accept. This is the core rule of `docs/reset-protocol.md`
and it is not negotiable for any convenience gain. The four hacking factions don't conflict *with each
other*, but the rail is absolute regardless.

## Terminal-hijack race (accepted, documented)

`installBackdoor()` moves the player's terminal to the target and takes real time. Save-and-restore the
origin server around it (phase-06 decision, still holds). The residual race — the player manually
moving the terminal between the sanity check and the install — is accepted and documented in the
header, not engineered against. A slow poll (60 s) keeps this rare.

## Rejected alternatives

- **Exit-on-idle + external relauncher.** Rejected: no relaunch infra exists (daemon launches
  companions only at startup); building a periodic relauncher to enable a lazier exit is more
  machinery than just staying resident, which is now cheap (SF4).
- **Filter to "factions I don't have all the augs for"** (Kenneth's original framing). Rejected as a
  no-op that adds Singularity calls: on a fresh node you own zero augs, so the filter never excludes
  anything early; late-node, idempotency (`installBackdoor` no-ops once backdoored) already covers it.
  Backdoor every eligible server unconditionally — simpler and equivalent.
- **Include Fulcrum in v1.** Deferred — needs 250k company rep, so a blind backdoor is wasted and the
  eligibility check differs. One-row addition later if wanted.
- **Auto-join after backdoor.** Rejected — violates the auto-UNLOCK/never-JOIN rail; risks permanent
  faction lockout.
- **Log faction joins (revive `factionwatcher.js` / events log).** Rejected for v1 — out of this
  feature's scope; resurrect only if a separate need for milestone logging appears.

## Open questions for the spec stage

1. **Poll cadence.** Phase 6 used 60 s. Fine? (Joins/backdoors are rare; nothing is latency-sensitive.)
2. **Actual RAM figure** under SF4.3 — measure in-game, record in header. Confirms the launch-retry
   deletion is safe.
3. **Tail window: show one or not?** `procureprograms` opens a tail; this is even lower-signal (four
   rare events). Lean: minimal/no standing tail, `tprintTs` on classification *changes* only (never
   per-poll — a 60 s cadence must not spam the terminal). Confirm at spec.
4. **`ns.enums.FactionName` vs string literals** for the target→faction map — verify availability in
   `markdown/` (0 GB either way).
5. **Live validation is structurally deferred** — the real end-to-end (reset → climb → root → walk →
   backdoor → invite appears) can't run before the next reset/climb; record as a live-validation
   follow-up in BACKLOG, same as phase-06 planned.
