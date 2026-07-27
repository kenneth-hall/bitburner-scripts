# Batcher engine

Everything about the central-allocation HWGW (hack/grow/weaken) money-and-XP engine that isn't a
live TODO or a frozen phase record: the current architecture, how it behaves across installs/resets,
its strategy across BitNodes, and the standing open questions.

**Consolidated 2026-07-22** from `docs/scripts.md`'s core-script descriptions, the batcher-relevant
slivers of `docs/bn1-install-plan.md` and `docs/bn1-handoff.md` (both now archived — see §6), and
`docs/bitnodes.md`'s "mature batcher" next-node analysis. Those two BN1 docs are archived (superseded
for their batcher content, kept for their still-useful BN1-specific aug/faction detail) at
`docs/archive/`; `docs/bitnodes.md` stays untouched and is the original source for §3, not superseded
by it. The batcher-refactor phase docs (`docs/phases/phase-0{1-9}-batcher-refactor.md`) stay in
place — this doc pulls their durable conclusions forward without duplicating the blow-by-blow.

**What's deliberately NOT here:**
- Live TODOs / open bugs / standing tripwires beyond what's listed in §4 → check `BACKLOG.md` for
  anything not yet migrated.
- The full session-by-session narrative of any one phase → the phase's own doc (§5).
- Live numbers (current income rate, utilization, target list) → the dashboard `DAEMON`/`TARGETS`
  panels and `logs/`. A doc is a bad place for a number that changes every tick.
- Gang income/economics — the batcher is now a minority income source in BN2.1 (~4-6%, gang ~94-96%,
  measured by `moneysources.js`); that comparison and all gang-side numbers live in
  [`docs/gang-engine.md`](gang-engine.md) §4, not here.

---

## 1. Architecture — `daemon.js` and companions

**`daemon.js`** — central-allocation HWGW batcher. Runs forever on home; also drives prep cycles and
`ns.share()`. Headless (Phase 24) — publishes `daemon-status.json` for `dashboard.js`. Phase 26 B1:
every `SUPERVISOR_CHECK_MS` (60s) diffs `ns.ps("home")` against `RESIDENT_COMPANIONS` and relaunches
any missing one (backoff-bounded; a missing-but-doesn't-fit-yet companion waits instead of
relaunch-storming) — this supervisor role covers every daemon-launched companion, not just batcher
workers (e.g. `gangmanager.js` sits in the priority slot right after `cloudmanager.js`, the RAM
census's designated winner, since Phase 27). Restart via `tools/bb/cli.mjs restart daemon.js`.
- **The supervised set is gang-gated (2026-07-26).** `supervisedResidents()` drops
  `GANG_GATED_COMPANIONS` (`gangmanager.js`) from the diff whenever `ns.gang.inGang()` is false, and
  the startup block skips launching `gangmanager.js`/`gangratelog.js` in the same case (one INFO
  line instead). Without this, a gangless node relaunched a script whose only behavior is
  ERROR-and-exit every `SUPERVISOR_RETRY_MS` forever — 2 terminal lines / 5 min, 110 attempts over
  9.1h in BN5 before it was gated. The gate is **re-read every check**, not cached from startup
  (`inGang()` is 0 GB), so a mid-session `gangcreate.js` restores supervision within 60s with no
  daemon restart; the gated names' `missingSince`/attempt/backoff bookkeeping is cleared while
  suspended so that relaunch starts from a clean slate.

**Imported (pure logic, no standalone RAM footprint of their own beyond what they cost `daemon.js`):**
- **`scheduler.js`** — batch math: threads, `additionalMsec` timing, RAM bin-packing. No `ns`.
- **`targets.js`** — decides **what to attack**, ranked by efficiency score.
- **`hosts.js`** — discovers **where workers run** (rooting + purchased servers).
- **`sampling.js`** — Formulas-or-legacy sampling seam (server growth/security math).

**Workers (scp'd to hosts, import-free by design):**
- **`hack.js` / `grow.js` / `weaken.js`** — one-shot batch workers; `daemon.js` sets threads + timing
  per launch.
- **`bootloop.js`** — self-contained cold-start worker (retargets via a re-scp'd control file) —
  used by `bootstrap.js` to get a first worker running before `daemon.js` itself fits.

**Companions (`exec`'d by `daemon.js`, restart via `tools/bb/cli.mjs restart <name>`):**
- **`targetsmonitor.js`** — live re-rank/re-plan analysis of every eligible hack target; publishes
  `targets-ranking.json`.
- **`launchmonitor.js`** — live worker-launch history (watches `ns.ps()`).

**Adjacent but deliberately separate engines** (interact with the batcher over shared fleet RAM, not
part of it): `xpfarm.js`/`xphack.js`/`xpweaken.js` (Phase 20's hack-saturation XP engine — fills
whatever RAM the batcher/share leave unclaimed; distinct worker filenames keep the batcher's
in-flight sweep blind to them) and `share.js` (one-cycle faction-share worker, hard-carves
`SHARE_FRACTION` of allocatable RAM). Full descriptions of both: `docs/scripts.md`.

---

## 2. Lifecycle — behavior across installs & resets

Durable facts about how the batcher behaves around an augmentation install (soft reset) or a fresh
BitNode entry (hard reset) — pulled forward from the now-archived `bn1-install-plan.md`/
`bn1-handoff.md` since they're general batcher behavior, not BN1-specific:

- **Fresh/reset node: do nothing manually at first — the batcher self-funds and self-climbs.** A
  reset node is broke and low-level; `daemon.js` earns money and hacking climbs on its own before any
  manual aug/faction action is needed or useful.
- **The batcher over-funds money relative to the aug-buying rate.** Money is consistently the
  non-binding resource once the fleet is running — `hacking_money`/`_grow`/`_chance`/`_speed`-only
  augs are noise for any level/exp-focused goal, since the batcher already produces more money than
  those mults would meaningfully accelerate spending.
- **Recovery after an install is `bootstrap.js`, one command.** It rebuilds the fleet and relaunches
  `daemon.js`; the batcher then both re-climbs hacking (via XP from batch cycles) and earns money
  unattended. This is what turns an install from a babysat evening into ~2 minutes of attention.
- **The batcher and `xpfarm.js` are mutually exclusive priorities for the same RAM, not simultaneous
  partners.** "The batcher running" and "xpfarm running" are different fleet-allocation modes — flip
  to xpfarm only in a pure hacking-climb window where money no longer matters, since it trades money
  for XP rate. Confusing "the money batcher is running" for "xpfarm is running" was a live source of a
  slower-than-expected re-climb during the BN1 endgame.
- **Home RAM/cores persist across a soft reset; the batcher's purchased fleet does not.** Buying home
  RAM immediately before an install is free upside (it survives; money doesn't) and directly grows
  the batcher's post-install rebuild ceiling.
- **`share.js` competes with the batcher for RAM and is worthless without faction membership.**
  Measured live 2026-07-18 in BN2: `ns.share()`'s rep multiplier only applies while doing faction work
  ([[reference_share_boost_needs_faction_work]]); on a factionless fresh node its 25% carve starved
  the batcher's own budget below what its top-scored target needed, causing **$0 income for ~7 hours**
  — not merely wasteful, but decisive. See §4 for the still-open fix.
- **The engine assumes a WARM start, and a BitNode entry is a cold one.** Three separate bugs found
  on 2026-07-24 share this single root: the floor-reserve carve deadlock, the unconditional 25%
  share carve, and the floor reserve's own empty cache on restart. An install preserves home RAM
  (524 GB free at the BN2 handoff) and leaves a mature purchased fleet; a **node entry** drops home
  to ~32 GB with 18 small rooted servers and nothing bought. Every assumption that holds in the
  first case fails in the second. **Before blaming a fresh node's symptoms on strategy, check
  whether the engine has simply never met a fleet this small.**
- **A floor-seated member used to reserve its whole unaffordable pipeline, deadlocking cold starts.**
  Fixed 2026-07-24 (`memberReserveGb`); kept here because the *shape* recurs. `pickBatchSet`'s floor
  rule seats the top-scored candidate even when nothing fits, and the aggregate carve then fenced off
  its full nominal pipeline — on a small fleet that carve exceeded the fleet, zeroing the waterfall so
  **no other target ever got prepped**, so no affordable candidate ever appeared to replace it. Live
  cost: **11 hours at ~$0.77/sec entering BN5.** Tell-tale in `daemon-status.json` — a member with
  `floor: true` + `commitPct: 0` while `waterfall.availableGb` is `0` and `skipServers` names that
  same member. **A new-BitNode entry, not a post-install reset, is what exposes this**: an install
  preserves home RAM (524 GB free at the BN2 handoff), a BitNode entry drops it to ~32 GB with no
  purchased fleet, so the engine had never actually met a genuinely tiny fleet before.
  **CLOSED across a daemon *restart* too, 2026-07-26 (Phase 35 WI5):** the fix above only protected
  a cold *node entry* (a fresh `lastKnownFloorBatchGb` Map starts empty and repopulates within a few
  ticks). A `daemon.js` **restart** on an already-running node hit the same empty-cache gap for real
  — tick 1 after a restart reserved 0 for every floor-seated member regardless of how expensive its
  batch actually was, handing the fleet to a multi-minute prep exactly like the original deadlock's
  shape. `seedFloorReserve` now reads the PREVIOUS session's persisted `daemon-batch-log.json` at
  startup and seeds the reserve from each server's newest skip diagnosis, freshness-guarded to
  `FLOOR_SEED_MAX_AGE_MS` (30 min) so a post-install restart doesn't carry a stale pre-install-scale
  figure into a 2 GB fleet.
- **Post-install boundary telemetry now exists — the previously-lost ~9-10h dead window is
  retained, not just the batcher's ordinary ring log.** Phase 35 WI1 (2026-07-26): `bootstrap.js`
  stamps `boundary-start.json` unconditionally at every boundary (install callback + manual node
  entry); `daemon.js` mirrors every batch/skip/mode/enter/exit/snapshot event by reference into
  `boundary-log.json` for 16h past the marker (5000-entry cap, explicit `boundary-cap` record on
  truncation) — a **non-evicting** slice, unlike `daemon-batch-log.json`'s 2000-entry FIFO ring
  which a restart truncates entirely. Read this file, not the ring log, when analyzing an install
  boundary; it survives daemon restarts inside the window (matched by the marker's own timestamp).
  One retained slice at a time — a second boundary before the first is read loses the older one
  (accepted for v1, near-daily session cadence makes it unlikely).
- **Factionless share suppress shipped (Phase 35 WI4/D8a, 2026-07-26) — the CHEAP version only.**
  `daemon.js`'s per-tick share fraction now folds in `ns.getPlayer().factions.length === 0`, so a
  fresh node with no faction membership carves 0% for share instead of the full `SHARE_FRACTION`
  (fixes the specific pathology recorded above: 25% starving the batcher's own budget for ~7h with
  no faction to even benefit). **The "honest" version stays unbuilt** — a player who has JOINED a
  faction but isn't actively grinding faction work also gets zero rep benefit from share
  (`[[reference_share_boost_needs_faction_work]]`), and that gap needs the aug-ratchet's live
  work-state to detect, which doesn't exist yet. **Wake condition:** a node entry where the cheap
  fix's gap actually shows (joined-but-idle stretch with share still allocating).

---

## 3. Strategy across BitNodes

Condensed from `docs/bitnodes.md`'s "Our next-node plan (mature batcher)" section (2026-07-11,
untouched at the source — re-read it there for the full per-node multiplier tables and reasoning;
this is the durable summary).

**The lens (two axes, not one):** a node can bench the batcher two different ways — **economy**
(Server Max Money nerfed to single digits → no money to steal) *or* **gate** (a hacking-level wall
the batcher's money can't buy past without a mult-source it doesn't have). Some nodes hit neither
(friendly to "snowball the batcher while building the next engine"); some hit one; a few hit both.

**BN2.1 (current node) hits the economy axis directly:** Server Max Money capped at 8%, which benches
the batcher's own money output — the gang income stream (~94-96% of total, per `gang-engine.md` §4)
is what actually carries the node, with the batcher contributing the remaining ~4-6%. This is the
concrete instance of "economy-nerfed" from the lens above; full numbers and the gang-vs-batcher
income-share measurement live in [`docs/gang-engine.md`](gang-engine.md) §1/§4/§5, not duplicated
here.

**BN10** is the other captured case: its purchased-server **fleet** is throttled (Base Cost 5.0, Max
RAM 50%, Server Limit 60%) even though its income *pools* are full — so "batcher-friendly" can
overstate a node where the muscle (fleet size) is halved even while the economy itself isn't nerfed.

**General strategy while no second engine exists:** snowball the batcher on low-difficulty
economy-friendly nodes while building whatever's next (gang, in BN2.1's case). Streamlining
throughput itself (not just letting it snowball) was the trigger behind Phase 20's XP-farm engine —
resumed whenever a fresh node's XP re-climb becomes the binding constraint again.

---

## 4. Open questions & standing tripwires

Batcher-specific open items now live here (moved from `BACKLOG.md` 2026-07-22, so they sit next to
the architecture/history they depend on). `BACKLOG.md` keeps only non-batcher-specific bugs/ideas —
check there for everything else.

- **~~`tryRoot` withheld the fleet's above-level RAM~~ — FIXED 2026-07-26 (`src/hosts.js`).** Kept
  here as a landmine warning, because the failure mode was *silent* and the class of it recurs.
  `tryRoot` bailed on `reqLevel > myHackLevel`, conflating **"can I hack this"** with **"can I root
  this"**. They are not the same question: `markdown/bitburner.ns.nuke.md` states outright that
  *"the server's required hacking level is not a requirement of nuking — you can nuke a server as
  long as you open enough ports, regardless of your hacking level."* Rooting an unhackable server is
  pure upside: it joins the fleet as a **worker host**, and whether it is ever *attacked* was already
  decided independently — and far more strictly — by `targets.js`'s `isEligibleTarget`
  (`reqLevel < level/2`). The guard therefore protected nothing and only suppressed RAM.
  - **Measured impact, BN5, 2026-07-26.** At hacking 309 the fleet read **1,068 GB / 21 hosts**, and
    the batcher could only afford the pipeline of the *3rd*-ranked target (harakiri-sushi, $100M max
    money, 1,068 GB) — the top two (phantasy $600M / 1,530 GB, max-hardware $250M / 1,360 GB) cost
    more than the entire fleet. Removing the one condition took the fleet to **4,780 GB / 71 hosts
    (4.5×)** and the batcher immediately promoted itself to **phantasy**, the top-ranked target.
  - **The expensive part: it would have silently voided a $250M purchase.** Every 5-port server in
    this node requires hacking **819+**. `procureprograms.js` bought **SQLInject.exe for $250M** at
    8:06 PM — the last rung of the opener ladder, saved for over hours by the Phase 35 opener
    reservation — and the old guard would have refused to root **all 29** of the servers it unlocked
    (2.85 TB), returning `false` on every one. The reservation system worked perfectly and the
    rooting bug would have thrown away 100% of what it bought, with no error and no log line.
  - **Generalised lesson worth carrying:** a precondition copied from a *related* API is still an
    unverified assumption. The fork's own docs contradicted this one in a single explicit sentence —
    the same "read the whole interface" failure as Phase 27, at one-line scale. When a guard blocks
    a resource, check that the guard is the API's requirement and not a plausible-sounding neighbour.

- **~~Auto-suppress `share.js` on small/factionless fleets~~ — the CHEAP (90%) version SHIPPED
  2026-07-26 (Phase 35 WI4/D8a); the honest version below is still unbuilt.** Measured 2026-07-18 in
  BN2: with zero joined factions, `ns.share()`'s rep multiplier is *provably* worthless
  ([[reference_share_boost_needs_faction_work]]), yet its 25% `SHARE_FRACTION` carve (24 GB of a
  100 GB fleet) still starved the batcher's own budget below what its top-scored target needed
  (pipeline 1,891 GB vs. 75 GB budget) — the daemon skipped every tick and earned **$0 for ~7
  hours**. Dropping `share-off.txt` raised the budget to 100 GB and money went $5,695 → $14,565 in
  45s. **The fix that would have prevented it outright:** suppress `share.js` automatically
  whenever `ns.getPlayer().factions` is empty — stronger and simpler than any fleet-size-floor
  heuristic, no design work needed. Was manual as of 2026-07-22 (`share-off.txt` toggled by hand);
  `daemon.js`'s per-tick share fraction now folds this check in directly, transition logged via the
  existing mode-event seam (`factionless` field joined to `shareOff`).
  - **⚠️ It bit a second time entering BN5, 2026-07-24 — this is now a repeat, not an anecdote.**
    96 GB of a 396 GB cold-start fleet went to share while zero faction work was running (the
    ratchet couldn't even launch). **Correction to the BN2 reading, though: share was NOT decisive
    here.** Dropping `share-off.txt` by hand returned all 96 GB and the daemon still launched
    nothing — utilization went 24.2% → **0%**. The deadlock was the floor-reserve carve below; share
    was pure waste layered on top. So "share starved the batcher" generalises less than 2026-07-18
    concluded: treat it as *wasted RAM that is always worth reclaiming*, and don't reach for it as
    the explanation when a fleet is idle.
  - **Escalation, not just a re-log:** the auto-suppress was called "no design work needed" on
    2026-07-18 and has now cost two of the last two node entries. The cheap 90% version is the
    empty-`factions` check already specified above; the honest version also covers *joined but not
    working* (BN5's case — nine factions would be joined post-install yet nothing is grinding rep),
    which means gating on the ratchet's live work state, not membership alone.
- **~~Floor-seated members reserve their whole unaffordable pipeline~~ — FIXED 2026-07-24, in two
  passes.** `memberReserveGb` (`scheduler.js`) reserves **one shrunk batch's worth**
  (`floorBatchCostGb`, read from the skip diagnosis) once `pipelineCostGb > budgetGb`.
  **Both extremes deadlock, and we shipped each in turn before landing on the middle:**
  - *Full nominal pipeline* (original): the carve exceeded the fleet (1,684.9 GB vs 396 GB), zeroed
    the waterfall, nothing ever got prepped. 11h at ~$0/s.
  - *Nothing at all* (first fix): the waterfall then took the whole fleet for prep, leaving 7.75 GB
    free against a 99.75 GB shrunk batch. The member still never launched. The reasoning in that
    commit — "members launch before the waterfall each tick, so it keeps first refusal" — is
    **wrong and worth remembering**: prep is grow/weaken, it holds RAM for *minutes* across many
    ticks, so first refusal on an already-committed fleet buys nothing.
  - *One shrunk batch* (current): reserves exactly what the member can demonstrably spend, minus
    what's already in flight. Cached per server so a tick without a diagnosis doesn't drop the
    reserve to zero and hand the RAM back to a multi-minute prep job.
  **Still open (the other half of the original item):** nothing *escalates* — a member at
  `commitPct: 0` for N consecutive ticks is held rather than dropped for an affordable target. Now
  survivable rather than fatal, so it's no longer urgent.
- **~~A batch job had to fit whole on ONE host~~ — FIXED 2026-07-24.** `assignBatchHosts` now splits
  `grow`/`weaken` across hosts (as `planPrep` always has); `hack` is deliberately never split,
  because `inFlightByTarget` counts batches by the proxy *"one `hack.js` process per target per
  batch"* (`sampling.js:213`) and fragmenting it would corrupt `batchesInFlight` → `allowShrink` →
  the reserve above. **This was the last thing holding BN5 at $0/s:** a 99.75 GB batch could not
  place against 105.75 GB of free fleet because the 35 GB grow found no single host with more than
  28.5 GB left after earlier jobs took theirs. **Short by 6.5 GB.** Splitting is safe — every
  fragment keeps the same `additionalMsec`, so all threads of a job still land together; thread
  effects are additive; and `sampling.js` sizes grow/weaken assuming 1 core (deliberate overshoot),
  so spreading onto 1-core hosts can't under-deliver.
- **Skip records now carry a placement diagnosis (`diagnosePlacement`, 2026-07-24) — use it before
  theorising.** Every `skip` in `daemon-batch-log.json` reports `blockedBy` (`total-ram` |
  `per-host`), `batchCostGb`, `totalFreeGb`, `failedJobIndex`/`failedJobGb`, `largestHostFreeGb` and
  `shortfallGb`, refreshed each tick of a coalesced run. It exists because four confident hypotheses
  were formed from indirect signals that day and **all four were wrong** (leftover workers squatting
  RAM; seating the cheapest target would help; the fleet was 3× too small; a zero reserve was safe).
  The daemon had computed the real answer every second and discarded it.
  ⚠️ **It must MIRROR `assignBatchHosts`, not approximate it.** The first version compared the single
  largest job to the single largest host and returned `null` — "it fits" — on a batch failing every
  tick, which is worse than no diagnosis because it points away from the cause. It now walks jobs in
  order against a deducted pool, with tests pinning it to `assignBatchHosts`' ground truth in both
  directions. Any future change to placement must change both.
- **~~Cold-start hole in the floor reserve~~ — CLOSED 2026-07-26 (Phase 35 WI5).** A freshly
  restarted daemon used to have an empty `lastKnownFloorBatchGb`, so tick 1 reserved 0 and the
  waterfall claimed the fleet for multi-minute prep before the reserve re-established. `daemon.js`
  now reads the PREVIOUS session's persisted `daemon-batch-log.json` at startup and seeds the
  reserve from each server's newest skip diagnosis (`seedFloorReserve`) — guarded to
  `FLOOR_SEED_MAX_AGE_MS` (30 min) so an install-crossing restart doesn't carry a stale
  pre-install-scale figure (545-1083 GB) into a 2 GB post-install fleet and zero the waterfall the
  same way the original 2026-07-24 deadlock did. Was the **third "warm start assumed" bug found on
  2026-07-24**, alongside the carve deadlock and the share carve — see the cold-start hardening
  entry in `BACKLOG.md`.
- **Core-aware grow/weaken sizing — SHELVED, not a live bug.** `sampling.js` sizes grow/weaken at an
  implicit 1 core; this is a safe overshoot (grow's security bump is core-independent) and was only
  ~1% of fleet RAM at home's 2 cores when last checked. **Revisit when** home cores get upgraded
  further post-Singularity (buildable via `installer.js`'s auto-mode `upgradeHomeCores()`, but still
  gated on `ratchet-mode.txt` reading `auto`) — co-scope with core-weighted `share.js` placement if
  that's ever revisited too. → `phase-17-home-cores.features.md`.
- **Per-target logging (two related gaps, both open):**
  (a) **Realized income/efficiency per target isn't tracked over time** — today a `batch` event only
  logs *expected* steal, so there's no way to sanity-check the ranking score (`targets.js`) against
  actual outcomes.
  (b) **Prep-cycle duration is invisible** — the drift→prepped transition for a target isn't logged
  anywhere, so how long prep takes (and whether it's degrading) can't be seen without live
  observation.
- **Comment sweep — `daemon.js`/`scheduler.js` only, cosmetic, not urgent.** Trim `Phase N`
  attribution from otherwise load-bearing comments (grep `Phase \d+` for the current list). The one
  piece worth fixing as a real bug rather than a comment: `daemon.js:471`'s `tprintTs` prints
  "leftover Phase 1 worker file(s)" to the in-game terminal — reword to "legacy"; likewise
  `scheduler.js:1-3`/`:254` reference a vanished `allocator.js`/`pickBatchTarget` that no longer
  exists. Behavior-preserving; `npm test` is enough to validate.

---

## 5. Build history

Shipped, in build order: Phases 1-3 (pipeline reservation waterfall, efficiency-score ranking, shrink
gating) → Phase 4 (Formulas.exe math with legacy fallback) → Phase 5 (daily transactions log,
`translog.js`/`transactionsmonitor.js`) → Phase 7 (multi-target batching with natural exit,
`pickBatchSet`) → Phase 8 (faction-share RAM carve, `SHARE_FRACTION`) → Phase 9 (Phase 8 close-out,
fixed `pickBatchSet`'s pass-3/pass-4 bug, resolved a 2.4GB phantom-RAM anomaly) → Phase 20 (XP-farm,
the adjacent hack-saturation engine described in §1).

---

## 6. Further reading

- **Phase docs (full narrative, left in place):** `docs/phases/phase-01-batcher-refactor.md` …
  `phase-09-batcher-refactor.md` (the core batcher build), `docs/phases/phase-20-xpfarm.*.md` (the
  adjacent XP engine), `docs/phases/phase-17-home-cores.features.md` (core-aware sizing background).
- **Archived (batcher content superseded by this doc; BN1-specific aug/faction detail kept for
  history):** `docs/archive/bn1-install-plan.md`, `docs/archive/bn1-handoff.md`.
- **`docs/bitnodes.md`** — general BitNode reference (all 15 nodes). Left untouched, including its
  own "mature batcher" next-node analysis — §3 of this doc was compiled from it, but `bitnodes.md`
  stays the original source, not superseded.
- **`docs/gang-engine.md`** — BN2.1's income-share numbers (batcher ~4-6%, gang ~94-96%) and why the
  gang, not the batcher, is the node's current economic engine.
- **`docs/scripts.md`** — full script index; the batcher's core scripts are listed there with a
  pointer back to this doc for detail.
