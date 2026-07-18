# Phase 27 — Gang engine, stage 1: the observer (`gangwatch`)

**Stage:** Brainstorm (opus). Output of a design conversation with Kenneth, 2026-07-18.
Next stage: spec + `spec-reviewer` cold review.

**Node decision: BN2 is LOCKED** (2026-07-18, Kenneth). Supersedes the "BN5 next" line in
`docs/bitnodes.md` → "Our next-node plan". See "Why BN2" below for the reasoning that
displaced it; that doc's plan section needs updating to match.

## Goal

Build the **observation half** of a gang engine, and only that: a headless resident that reads
gang state every tick and writes it to a log, making **no strategic decisions**. The optimizer
comes later, in a separate phase, driven by what this thing measures.

Why staged this way: we do not know gang strategy, and we are deliberately not looking it up
(CLAUDE.md's no-other-players'-solutions rule — gang is the mechanic with the most solved,
most-published meta, so it's the one where importing an answer would most thoroughly defeat the
exercise). Every threshold an optimizer needs — when to ascend, when to engage territory, which
task beats which — is an empirical question we can answer from our own logs in-node. Guessing
them now would produce confident-sounding fiction that then gets specced and implemented.

## Why BN2 (the decision this phase rests on)

Displaces BN5, which `docs/bitnodes.md` picked as *"the least-bad option under the constraints"* —
a plan that then deflated every one of BN5's own rewards. Three reasons BN2 wins:

- **The no-new-engine constraint is running out of nodes.** Per the economy/gate table in
  `docs/bitnodes.md`, our single hacking engine can meaningfully play BN1 (done, 3×), BN5, BN10
  (fleet-throttled + ×0.35 level wall), and BN12.1 (hardens each clear). That's the whole board.
- **The rep tax is recurring; the engine is one-time.** `docs/bitnodes.md` line 85 flagged the
  open question and it was never answered: our constraints exclude all three rep-tax killers.
  Gang is the game's designed answer to that exact tax, and it's a small script (see RAM budget).
- **Gang assets survive install/soft-reset.** Our entire pain profile is reset-driven — money,
  factions, fleet, and programs all wipe every cycle
  ([[reference_install_resets_money]], [[reference_install_resets_faction_membership]],
  [[reference_install_resets_programs_tor]]). A gang would be the first asset we own that doesn't.

**Accepted cost, stated plainly:** BN2 is hostile to the engine we're actually good at — Server
Max Money **8%**, Work Reputation **50%**, Passive Rep **0%**. If the gang engine underperforms,
the batcher cannot cover for it. This is a real bet, not a free upgrade.

## The core constraint shaping this phase

**MEASURED 2026-07-18, in-node — supersedes this section's original "written blind before
entry" framing.** Kenneth entered BN2.1 the same day, so the API is live and developable. But
recon (`gangprobe.js` / `gangreach.js`, both read-only) found a sharper constraint underneath:

**Only `inGang()` works before a gang exists. 1 of 4 calls reachable.**

```
OK    inGang
FAIL  getGangInformation     -- API ACCESS ERROR: Must have joined gang
FAIL  getMemberNames         -- API ACCESS ERROR: Must have joined gang
FAIL  getAllGangInformation  -- API ACCESS ERROR: Must have joined gang
FAIL  getTaskNames           -- API ACCESS ERROR: Must have joined gang
FAIL  getEquipmentNames      -- API ACCESS ERROR: Must have joined gang
```

`getTaskNames` and `getEquipmentNames` are documented at **0 GB** and still throw. So "0 GB RAM
cost" does not imply "no gang required" — the docs don't state the gang precondition anywhere.

### What this does to the phase

- **D5 (static table dump before a gang) is dead.** Not deferred — impossible.
- **Nothing about gangs is measurable before `createGang()`.** And `createGang` is the single
  irreversible decision in the mechanic: gang type (`GangGenInfo.isHacking`) is fixed forever by
  which faction you pick, with no `leaveGang()` to undo it.
- **Therefore the observe-first strategy has a hard floor.** The most consequential choice must
  be made with zero in-game data. Everything downstream of it can be measured; it cannot.

This inverts the doc's original sequencing and needs resolving before the spec — see revised
open question 1.

## API surface (read from `markdown/`, RAM costs confirmed)

| Group | Calls | RAM |
|---|---|---|
| Lifecycle | `inGang` 0 · `createGang` 1 · `canRecruitMember` 1 · `recruitMember` 2 · `getRecruitsAvailable` 1 · `respectForNextRecruit` 1 | 6 |
| State | `getGangInformation` 2 · `getMemberNames` 1 · `getMemberInformation` 2 · `getAllGangInformation` 2 | 7 |
| Actions | `setMemberTask` 2 · `purchaseEquipment` 4 · `ascendMember` 4 · `setTerritoryWarfare` 2 | 12 |
| Previews | `getAscensionResult` 2 · `getInstallResult` 2 · `getChanceToWinClash` 4 · `getTaskStats` 1 · `getEquipment{Cost,Stats,Type}` 2 each | 15 |
| Loop | `nextUpdate` 0 · `getBonusTime` 0 · `getTaskNames` 0 · `getEquipmentNames` 0 | 0 |

**Observer-only budget** (state + previews + loop, no action calls): **≈22 GB + base**. Fixed
cost, resident — nothing like the Singularity hot-path multiplier problem.

Two API properties that shape the design:

- **`await ns.gang.nextUpdate()` is 0 GB and returns the ms of gang-time processed.** The game
  hands us its own tick. No polling interval to pick, no drift, no guessed sleep. This is a
  cleaner control loop than the batcher's and we should not invent our own on top of it.
- **`getAscensionResult` / `getInstallResult` are pure previews.** So "should this member
  ascend?" is a pure function of `GangMemberInfo` → decision, **unit-testable in vitest with no
  game access**. Rare for this codebase; the optimizer phase should exploit it.

## Locked decisions

### D1 — Observer only. No writes to gang state, at all.
`gangwatch.js` calls nothing from the Actions row. Not `setMemberTask`, not even a "sensible
default." If members sit on their default task producing nothing, that is an acceptable and
*informative* first measurement.
- *Rejected:* "observer plus a safe default task assignment." There is no such thing as a safe
  default we can justify without data, and mixing one write into a read-only script destroys the
  clean baseline the whole phase exists to capture.

### D2 — Log file, not dashboard.
Per the Phase 24 observability convention ("use dashboard or logs"), this emits to a timestamped
log and nothing else. Dashboard space is gated behind its own brainstorm decision and this
mechanic hasn't earned a panel before we know what's worth showing.
- Follows the existing export pattern ([[reference_bitburner_log_export_pattern]]) — `ns.write`
  + a `vite.config.ts` filter so the log reaches the repo without a paste
  ([[feedback_oneoff_scripts_need_logged_output]]).

### D3 — Sample every tick, write on an interval.
Read state each `nextUpdate()`; flush a batched record periodically rather than writing per tick.
Ticks are 2000–5000 ms of gang time and bonus time can compress them heavily, so per-tick writes
risk a very large file fast.
- Exact flush cadence and retention: **spec decision**, needs a tick-rate measurement to set.

### D4 — Record rates *and* levels, per member and per gang.
The interesting quantities are derivatives — `respectGainRate`, `moneyGainRate`,
`wantedLevelGainRate`, and per-member `respectGain` / `moneyGain` / `wantedLevelGain` — attributed
to the **task currently assigned**. That attribution is the whole point: it's what turns the log
into a task→yield table the optimizer can be built from.
- Also capture `wantedPenalty` every sample. It's the classic silent income killer and it's
  directly exposed.

### D5 — Snapshot the static tables once at startup. ~~Pre-gang.~~ **REVISED**
`getTaskNames` + `getTaskStats` (each task) and `getEquipmentNames` + `getEquipmentStats/Cost/Type`
(each item) are static reference data. Dump once to a separate file rather than per-sample.
- **Original claim — "answers a large fraction of our strategy unknowns without any live
  measurement" — is FALSE and was falsified by recon the same day.** Both entry-point calls
  require an existing gang. The dump still belongs at observer startup; it just cannot happen
  before `createGang()`, so it informs nothing about the gang-type decision.
- `src/gangprobe.js` already implements this dump and is **retained** — it runs correctly the
  moment a gang exists. `src/gangreach.js` answered its question permanently and should be
  **deleted** at spec time rather than carried as dead weight.

## Open questions — resolve by measurement in-node, NOT by guessing

Explicitly parked. The spec should carry these as things the observer is *built to answer*, and
none of them should acquire a number before the log does.

1. **Gang type: hacking vs combat. — NOW THE BLOCKING DECISION, and it cannot be measured.**
   `GangGenInfo.isHacking` is read-only, fixed at `createGang` by which faction you pick, with no
   `leaveGang()`. Recon proved the API is fully closed until a gang exists, so **no amount of
   observation can inform this choice** — the observe-first strategy explicitly cannot help here.
   Needs: which factions offer a gang in this build, which are hacking, and their invite
   requirements. *Anti-spoiler note:* Kenneth's call to research or discover, not mine to import.
   **This is the one place the phase must accept deciding blind** — worth naming rather than
   pretending data will arrive.
2. **Faction invite prerequisites.** `createGang` requires existing membership in the faction.
   The karma ≤ 54000 gate is documented as applying *outside* BN2 only — but the faction's own
   invite requirement still applies in-node and we haven't captured it.
3. **Territory warfare trigger.** The one genuinely strategic call. `setTerritoryWarfare(true)`
   too early loses all territory; `getChanceToWinClash()` + `power` are the guard. Needs live
   clash-odds data before any threshold is written down.
4. **Ascension economics.** `getAscensionResult` previews the multiplier gain, but the cost is
   losing accumulated `earnedRespect`. The tradeoff curve is unmeasured.
5. **Tick rate under bonus time.** Sets D3's flush cadence and tells us how fast the node
   actually moves.
6. **~~Does the batcher still earn anything at 8% max money~~ — PARTLY ANSWERED, and it's worse
   than "competes for RAM": there is no RAM.** Measured on the fresh BN2 home 2026-07-18:
   `daemon.js` + `targetsmonitor` + `transactionsmonitor` = **31.60 / 32.00 GB** (the two monitors
   alone are **15.3 GB**). The daemon's supervisor log shows the *entire* companion suite failing
   to start for lack of RAM: `augfarmer` 64.10 GB (never fits on a 32 GB home), `ratchetlog`
   10.10, `cloudmanager` 6.25, `xpfarm` 5.85, `resourcemanager` 3.35, `dashboard` 2.60.
   - **The observer's ~22 GB budget has nowhere to live**, and BN2's 8% max money makes buying
     home RAM slower than in any node we've played. The spec must either fit `gangwatch` into a
     drastically smaller footprint, or make an explicit call about what it displaces.
   - Open sub-question this raises: **are the two monitors worth 15.3 GB on a fresh node?** That's
     ~48% of home spent on observability while six functional companions can't start. Possibly a
     bug-level finding for the existing toolchain, independent of gangs.
7. **The Red Pill via gang.** `docs/bitnodes.md` (in-game guide) says BN2's gang faction offers
   The Red Pill directly. If true it restructures the entire endgame — no Daedalus, no 2.5m rep,
   no 30-aug gate. Verify early; it's the single highest-leverage unknown on this list.

## Explicitly out of scope

- Any task-assignment, ascension, equipment, or territory logic (→ Phase 28, data-driven).
- Any change to `daemon.js` or the batcher.
- Entering BN2. That's Kenneth's action and a one-way door; this doc precedes it.

## Handoff

Spec stage should produce `phase-27-gang.spec.md` covering: the log schema (the real deliverable),
defensive-read requirements given the blind-development constraint, flush cadence, the startup
static-table dump, RAM gate target, and the vitest coverage for whatever pure parsing exists.
Then `spec-reviewer` cold review.
