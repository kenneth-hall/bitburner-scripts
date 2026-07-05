# Phase 11 features: resource manager — active procurement

**Stage:** Brainstorm (opus). This is the design-decisions handoff for the spec stage, not a
spec. It captures what's decided, what was rejected and why, and what's still open — per
`CLAUDE.md`'s Development workflow. The fable spec stage turns this into
`phase-11-resource-manager.spec.md`.

## Goal

Continue the Phase 10 money-management workstream (`phase-10-finance-cloud.md`). Phase 10 built a
budget authority (`financemanager.js`) that *reserves* cash for upcoming hand-purchases, and one
discretionary customer (`cloudupgrader.js`) that spends the leftover *available* cash upgrading
cloud servers. The reserved purchases — TOR router, port openers, the first cloud server — are
still bought **by hand** today; the reservations only stop the upgrader from spending money
earmarked for them.

Phase 11 closes that loop: **automate the purchases the reservations were protecting**, so that
from a fresh reset onward the fleet bootstraps itself with no hand-buys. Concretely, add
automated purchasing of (1) the TOR router, (2) port-opener programs, and (3) new cloud servers,
while keeping the Phase 10 budget-authority / discretionary-customer split intact.

Kenneth's framing: a "resource-manager" that budgets wallet and spending now, and RAM later. RAM
budgeting is explicitly **future / out of scope** this phase — but the architecture is named and
shaped so it can slot in without a rewrite (see Out of scope).

## Grounded facts (verified this session)

- **Singularity calls already work on this save**, at the no-SF4 RAM multiplier.
  `purchasescripts.js` already calls `ns.singularity.purchaseProgram` / `getDarkwebPrograms` /
  `getDarkwebProgramCost` and is wired into `daemon.js` startup. So automating TOR + port-opener
  buys is a known-working path, not a new unlock. (The earlier Singularity *hesitation* in
  BACKLOG was about the backdoor/`connect` workstream and faction mechanics, not about darkweb
  purchasing, which is in active use.)
- **API signatures / RAM costs** (checked against `markdown/`):
  - `ns.singularity.purchaseTor(): boolean` — "True if successful **or if you already own it**."
    RAM `2 GB × 16/4/1` → **32 GB** without SF4.
  - `ns.singularity.purchaseProgram(programName): boolean` — "True if purchased **or already
    owned**." **Requires TOR.** RAM `2 GB × 16` → **32 GB** without SF4.
  - `ns.cloud.purchaseServer(hostname, ram): string` — returns new hostname, `""` on failure.
    RAM **2.25 GB** (not Singularity). RAM must be a power of 2, max `2^20` (1048576).
  - Existing cheap cloud reads already in use: `getServerNames` (1.05), `getServerLimit`,
    `getServerCost`, `getRamLimit`, `getServerUpgradeCost`, `upgradeServer`.
- **`ns.hasTorRouter()`** (0.05) and **`ns.fileExists`** (0.1) already give ownership detection
  without Singularity — the budget authority stays Singularity-free.
- **Home RAM persists through augmentation installs**, so a Singularity-heavy companion always
  fits post-reset (Kenneth's 16 TB point). This removes RAM *absolute-cost* as a constraint, but
  not the `CLAUDE.md` isolation convention (below).

## Decisions (confirmed with Kenneth, 2026-07-05)

1. **Architecture: budget authority stays cheap; Singularity purchasing is isolated in a
   relaunched one-shot; cheap cloud purchasing folds into the cloud customer.** Not one merged
   always-on script. Rationale: `CLAUDE.md`'s standing convention — "keep Singularity calls out of
   hot/always-on paths; isolate them in dedicated daemon-launched companion scripts and exec by
   filename." TOR + port openers are *buy-once-per-reset*; a self-terminating companion buys them
   and exits, freeing the ~64 GB, instead of a 2-second poll loop holding it forever. "Ignore the
   RAM penalty" settles the absolute GB (16 TB home), not the isolation discipline.
2. **Automate the first cloud server too — drop the hand-buy.** The `bootstrap-server`
   reservation stops being a hand-buy earmark and becomes something the automation fulfills.
   Fully hands-off from reset onward.
3. **New-server buy trigger:** buy another cloud server **only when every owned server is at the
   RAM limit AND a purchase slot is free**, one at a time, new servers starting at the **16 GB**
   floor (matches `purchasecloudservers.js`). Availability gating is the throttle; no
   fancier "competing purchases" optimization this phase (Kenneth: ignore prioritization for now).
4. **First auto-bought server is 2 GB** ($110 k) — fast post-reset foothold; the upgrader climbs
   it. Only *growth* servers (trigger above) are 16 GB.
5. **Competing-purchase order:** foothold guard + cheapest-first. Procurement won't spend below
   the active `bootstrap-server` reservation (the $110 k foothold is protected); every other buy
   races cheapest-first. No fuller arbiter this phase.
6. **Rename the scripts to role-accurate names** (accepted the churn): `financemanager.js` →
   `resourcemanager.js`, `cloudupgrader.js` → `cloudmanager.js`, `purchasescripts.js` →
   `procureprograms.js`. Touches `daemon.js`'s `launchDetached` calls, `killscripts.js`'s sweep
   list (if it enumerates by name), `vite.config.ts`, every `test/` reference, and the state-file
   reader constants. Do the rename + behavior-widening in one coherent change per file; keep the
   `finance-*.json` / `finance-state.json` / `finance-reserve-extra.txt` **file** names as-is
   (renaming on-disk artifacts would break live saves mid-reset for no benefit) unless the spec
   finds a clean reason to migrate them.
7. **Procurement companion exits when done** (TOR + all openers owned), freeing the ~64 GB; only
   relaunches on daemon restart. No defensive daemon re-exec.

## Proposed architecture

Three long-running-or-relaunched companions, all launched from `daemon.js` startup (same slot as
the Phase 10 pair), coordinating through `finance-state.json` — no new coupling between them.

### Component A — budget authority: `resourcemanager.js` (rename of `financemanager.js`)

Unchanged charter and cost model from Phase 10: Singularity-free, `POLL_MS = 2000`, publishes
`finance-state.json` (heartbeat + `totalReserved` + `reservations`) and `finance-log.json`
(change-only ring buffer). The reservation *rules* barely change — what changes is who **fulfills**
each reservation (see Reservation model). Reservation labels update from "(hand-buy)" wording to
reflect that automation now buys them.

This is the "resource-manager" concept's money component; the rename makes the charter explicit
and leaves room for the future RAM dimension (see Out of scope).

### Component B — program procurement: `procureprograms.js` (rename of `purchasescripts.js`) — Singularity, self-terminating

The Singularity-heavy fulfiller for **TOR + port openers**. Evolves the existing
`purchasescripts.js`:

- **Self-terminating acquisition loop**, launched by `daemon.js` at startup. Slow poll
  (`~30–60 s`). Each pass: if `!hasTorRouter()` buy TOR first (unblocks `purchaseProgram`, which
  requires TOR); then buy the **cheapest unowned** port opener it can afford (one per pass).
  **Exits once TOR + all five openers are owned**, freeing the ~64 GB Singularity surface until
  the next daemon restart (i.e. next reset). This is the isolation win over an always-on loop.
- **Records every purchase** via `translog.js` (`recordTransaction`) — new source strings, e.g.
  `auto-tor` / `auto-port-opener`, added to `VALID_EXPENSE_SOURCES` in the same commit
  (Phase 5's whitelist-gap lesson).
- Today's `purchasescripts.js` is single-pass and errors out if TOR isn't owned; this evolution
  makes it buy TOR itself and persist until done. Its manual-run usage stays intact.

### Component C — cloud fleet manager: `cloudmanager.js` (rename of `cloudupgrader.js`) — cheap `ns.cloud`, always-on

Absorbs cloud *purchasing* alongside the Phase 10 upgrading. Always-on (`POLL_MS = 10_000`),
reads `finance-state.json`, keeps the staleness fail-safe and the `cloud-upgrade-off.txt` off
switch. Per poll, in order:

1. **Bootstrap buy** — if `getServerNames().length === 0`, buy the first server (fulfiller of the
   `bootstrap-server` reservation; see Reservation model for the funding rule and the
   2 GB-vs-16 GB size question).
2. **Upgrade** — existing Phase 10 behavior: lowest-RAM server first, one power-of-2 tier per
   action, spending only fully-`available` cash, up to `getRamLimit()`.
3. **Growth buy** — if **every** owned server is at `getRamLimit()` and a purchase slot is free
   (`getServerNames().length < getServerLimit()`), buy one new 16 GB server from `available`
   cash. (Discretionary — gated on `available`, not a reservation.)

`recordTransaction` for both new buys (`auto-cloud-purchase`), boolean-return-checked like the
upgrade path. **No server renames, ever** (Phase 7's rename-churn hazard) — cosmetic stale names
accepted, `upgradecloudserver.js` / `fleetupgrade.js` stay the manual rename paths.

### Data flow

```
resourcemanager.js --finance-state.json-->  { cloudmanager.js, procureprograms.js }
   (reservations)                                 (fulfillers spend; read totalReserved)
        ^                                                     |
        |------------------ ownership flips detected next poll <
```

The authority never calls a purchase function; fulfillers never compute reservations. Ownership
changes made by a fulfiller show up in the authority's next 2 s poll and drop the matching
reservation — the same loose, file-mediated coupling Phase 10 already proved.

## Reservation model

The Phase 10 rules stay (bootstrap-server, tor-router, next-port-opener, formulas, manual-extra).
The change is the **fulfiller assignment** and the **"fulfiller ignores its own reservation"**
principle (inherited from Phase 10's note that `purchasescripts.js` is the fulfiller of the
port-opener reservations, so gating it on them would be circular):

| reservation | fulfiller (Phase 11) | funds it spends against |
|---|---|---|
| `bootstrap-server` | cloud fleet manager (C) | live `money` (ignores its own reservation) |
| `tor-router` | program procurement (B) | live `money` |
| `next-port-opener` | program procurement (B) | live `money` |
| `formulas` | **nobody** (stays reservation-only) | — hand-buy, $5 B |
| `manual-extra` | **nobody** (stopgap earmark) | — |

**Reservations still gate only the discretionary spender** (the fleet manager's *upgrade* and
*growth-buy* steps spend `available = money − totalReserved`). Fulfillers buy their own item
against live money in a fixed cheapest-first order. This preserves the Phase 10 safety property
(the discretionary path can't drain money earmarked for a pending procurement) while letting the
procurements actually happen.

**Coordination caveat (default chosen, fuller arbitration deferred):** post-reset, cash is scarce
and two fulfillers (B buying TOR/openers, C buying the first server) could both reach for it.
Default rule for now: **the first-server foothold is the priority** — the program procurement
companion (B) respects the `bootstrap-server` reservation specifically (won't spend below it while
it's active), so the cheap $110 k foothold is never starved by a $500 k port-opener buy. Beyond
that one guard, purchases race in cheapest-first order. A full competing-purchase arbiter is an
explicit non-goal this phase (Kenneth: ignore for now) — see Open questions.

## RAM / Singularity handling

- Budget authority (A): unchanged ~3.35 GB, Singularity-free.
- Cloud fleet manager (C): Phase 10's ~3.7 GB + `purchaseServer` (2.25) + `getServerLimit` ≈ **~6 GB**,
  still cheap, still always-on. (Exact number is the spec/RAM-gate stage's job.)
- Program procurement (B): carries `purchaseTor` (32) + `purchaseProgram` (32) + darkweb reads ≈
  **~65+ GB**, but **only while acquiring**, then exits. Held on 16 TB home, transient per reset.
- `daemon.js`: still exec-by-filename only → **+0.00 GB**, RAM gate must confirm the Phase 9/10
  16.30 GB baseline is unchanged.
- **Identifier hygiene (Phase 9 lesson) still applies** to any new script/state/log field names —
  check against `NetscriptDefinitions.d.ts`; don't name anything to collide with an `ns` fn.

## Rejected alternatives

- **One merged always-on `resource-manager.js`** (budget + all purchasing + upgrading in one
  process): rejected. Cleanest mental model, but the 2 s poll loop would permanently hold ~64 GB
  of Singularity surface it needs only a few times per reset — breaks `CLAUDE.md`'s isolation
  convention for no benefit (16 TB home isn't the issue; hot-path hygiene is).
- **Merged-but-relaunched single script**: rejected. Frees Singularity RAM between runs, but
  couples the fast (2 s) budget heartbeat to the slow purchase cadence — the state-file heartbeat
  consumers rely on would stall between relaunches.
- **First server bought discretionarily (from `available`) by the fleet manager**: rejected as
  the *funding* model — post-reset the TOR/opener reservations can push `available` to $0, so a
  discretionary-only first buy could deadlock the bootstrap. Hence bootstrap is a
  fulfiller-against-`money` buy, protected by its reservation.
- **Automating Formulas.exe / augment purchases**: out of scope. Formulas stays a reservation-only
  earmark (big, deliberate, hand-bought); augments remain the `manual-extra` stopgap pending a
  real cost model (already a BACKLOG item).

## Open questions

All brainstorm-stage forks are resolved (see Decisions 1–7). Remaining items are deferred *future*
work, not blockers for the spec:

- **Competing-purchase arbitration** beyond the one bootstrap foothold guard (Decision 5): stays
  cheapest-first for now. If post-reset ordering proves annoying in live validation, revisit with
  an explicit priority list or a reservation-aware budget for every fulfiller — the successor to
  Phase 10's back-burnered augment-cost model.
- **`finance-*` on-disk artifact names** kept as-is under the rename (Decision 6); a clean
  migration is the spec stage's call only if it finds a reason.

## Out of scope (this phase)

- **RAM budgeting** — the "future RAM" half of the resource-manager vision. Not built. When added,
  it likely extends the budget authority (A) with a second resource dimension, or rides alongside
  it; the state-file interface generalizes to it. Named/shaped for it, not implemented.
- Competing-purchase optimization / arbiter (Open question 2).
- Formulas.exe and augmentation purchase automation; a real augment cost model.
- Any Singularity call in the always-on scripts (A, C); any batching/share math change; dashboards;
  server renames from automation.

## Validation sketch (detail is the spec stage's job)

- Unit-test the new pure logic (new-server-when-maxed predicate, bootstrap trigger, cheapest-unowned
  selection, any new budget arithmetic) mock-free in `test/`, Phase 10 style.
- `npm run verify:log` extensions for the new transaction sources; `VALID_EXPENSE_SOURCES` updated
  in the same commit as each new writer.
- RAM gate: `daemon.js` unchanged at 16.30 GB; record B and C's new totals; identifier-hygiene hunt
  if either surprises.
- Live: mostly reset-gated (the bootstrap ladder is the whole point), so plan around the same
  "≤2 resets, aim 1" budget as Phase 10 — the no-reset manual-override gate test still exercises the
  discretionary path today.
```
