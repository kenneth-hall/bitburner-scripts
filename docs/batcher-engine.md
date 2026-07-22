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

- **Auto-suppress `share.js` on small/factionless fleets — still unbuilt.** Measured 2026-07-18 in
  BN2: with zero joined factions, `ns.share()`'s rep multiplier is *provably* worthless
  ([[reference_share_boost_needs_faction_work]]), yet its 25% `SHARE_FRACTION` carve (24 GB of a
  100 GB fleet) still starved the batcher's own budget below what its top-scored target needed
  (pipeline 1,891 GB vs. 75 GB budget) — the daemon skipped every tick and earned **$0 for ~7
  hours**. Dropping `share-off.txt` raised the budget to 100 GB and money went $5,695 → $14,565 in
  45s. **The fix that would have prevented it outright:** suppress `share.js` automatically
  whenever `ns.getPlayer().factions` is empty — stronger and simpler than any fleet-size-floor
  heuristic, no design work needed. Still manual as of 2026-07-22 (`share-off.txt` toggled by
  hand). **Related, also open:** the daemon reserved RAM for a target reporting `floor: true` /
  `commitPct: 0` every tick without ever escalating — a member at 0% commitment for N consecutive
  ticks should be dropped for an affordable one instead of reserved for silently, forever.
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
