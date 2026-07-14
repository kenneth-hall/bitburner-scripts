# Phase 23 spec: auto augmentation farmer (`augfarmer.js`)

## Context

Work in `C:\Users\admin\bitburner-scripts`. Requirements: `phase-23-augfarmer.features.md` —
read it first; this spec assumes it, including the locked decisions D1–D12, the resolved
former-open questions (no latch, idle-and-report plateau, no money ceiling), and the D11
standing authorization (auto-join + auto-buy unattended, within the D4 faction allow-list,
install never automated). Composition: Phase 22's `backdoorfactions.js` is the *unlock* half
(root + backdoor, never join); this farmer is the *join + grind + buy* half.

What ships: one new always-on companion `src/augfarmer.js` (the only new file allowed
Singularity calls), a fifth reservation rule in `resourcemanager.js` (Singularity-free — it
reads a number from a file), one `launchDetached` line in `daemon.js`, one `MANAGED_TAILS`
row in `tailmanager.js`, two `vite.config.ts` filter lines, the vitest coverage for every
pure decision function, and the doc reconciliations the features file's ship-time list
tracks (`studybootstrap.js` header, `reset-protocol.md` ×2, `docs/scripts.md`,
BACKLOG/CHANGELOG).

**Audience note:** the implementer does everything marked **[code]**. Kenneth does
everything marked **[live]** — except daemon restarts, which CLAUDE.md pre-authorizes
Claude to do over CDP. No [live] step requires editing code; the one post-live [code] step
(recording the measured RAM figure in the header) is a comment edit.

## Ground rules

- `CLAUDE.md` rules apply. All `ns` signatures below were verified against `markdown/`
  during spec drafting (this build's docs, not upstream):
  `singularity.getAugmentationsFromFaction(faction) → string[]` (5 GB),
  `getAugmentationRepReq(aug) → number` (2.5), `getAugmentationPrice(aug) → number` (2.5,
  live/inflated), `getAugmentationPrereq(aug) → string[]` (5),
  `getAugmentationStats(aug) → Multipliers` (5), `getFactionEnemies(faction) → string[]`
  (3),
  `getFactionInviteRequirements(faction) → PlayerRequirement[]` (3),
  `checkFactionInvitations() → FactionName[]` (3), `joinFaction(faction) → boolean` (3),
  `workForFaction(faction, workType, focus) → boolean` (3; cancels any current work —
  covers the features' "preempting universityCourse behaves cleanly" verify item),
  `getFactionWorkTypes(faction) → FactionWorkType[]` (1), `getFactionRep(faction) → number`
  (1), `getOwnedAugmentations(purchased?) → string[]` (5),
  `purchaseAugmentation(faction, aug) → boolean` (5), `travelToCity(city) → boolean` (2),
  `getCurrentWork() → Task | null` (0.5). All × 1 at SF4.3. Enum members confirmed in
  `markdown/bitburner.factionnameenumtype.md`: `CyberSec`, `NiteSec`, `TheBlackHand`,
  `BitRunners`, `TianDiHui`, `Sector12`, `Aevum`, `Chongqing`, `NewTokyo`, `Ishima`,
  `Volhaven`, `Daedalus`, `TheCovenant`, `Illuminati`. `FactionWorkEnumType` members:
  `hacking`, `field`, `security`. Multipliers keys for the D2 filter all exist in
  `markdown/bitburner.multipliers.md`. The implementer re-verifies anything added beyond
  this list, and verifies the `Task` shape returned by `getCurrentWork` (S8) before
  relying on its fields.
- **D11 authorization bounds, restated as enforceable rules:** the farmer may join only
  factions on `FACTION_SCOPE` (S2's 13 names — a hard allow-list constant, not a filter);
  it never calls `installAugmentations` (grep-checked, like Phase 22's `joinFaction` rail —
  note that rail is deliberately *retired* this phase, see work item 7); nothing it can do
  bars Daedalus (Daedalus has no enemies — confirmed live from `getFactionEnemies` at
  validation, not recalled).
- **Transactions log:** every successful spend records via `recordTransaction` — aug
  purchases (`source: "auto-aug"`, with `aug`, `faction`, `amount`) and travel
  (`source: "auto-travel"`, with `city`, `amount`). A failed spend records nothing.
  `test/verify-transactions.test.js`'s `VALID_EXPENSE_SOURCES` gains both new sources
  **plus `'auto-formulas'`** — the latter is BACKLOG's known one-line bug, folded in here
  deliberately (flagged as a scope addition) because this phase's acceptance requires
  `npm run verify:log` green and that bug currently fails it.
- **Singularity isolation:** `augfarmer.js` is `exec`'d by filename via `launchDetached`,
  never imported by anything. It imports only Singularity-free modules (`common.js`,
  `translog.js`, `financestate.js`). `resourcemanager.js` stays Singularity-free: the
  farmer owns every Singularity read and publishes a plain number+timestamp file.
- **Identifier hygiene:** no standalone identifier may alias an ns method name. Pre-checked
  clean: `FACTION_SCOPE`, `UTILITY_ALLOWLIST`, `RESERVE_FILE`, `STATE_FILE`, `CATALOG_FILE`,
  `PAUSE_FILE`, `buildCatalog`, `filterAugs`, `expandPrereqs`, `pickTarget`, `campBlocked`,
  `evaluateInviteReqs`, `slotAvailable`, `planPass`, `nfgKey`. Singularity methods are
  called as `ns.singularity.*` inline, never destructured.
- **No batcher changes.** `daemon.js` gains exactly one `launchDetached` line;
  scheduler/sampling/targets/workers and `HOME_RESERVE_GB` untouched (see S6 for why no
  reserve bump is needed).
- Branch `phase23-augfarmer` off `master`. `npm test` the implementer runs and clears; RAM
  reading and live observation are Kenneth's (daemon restart is Claude-over-CDP,
  pre-authorized). BACKLOG/CHANGELOG edits ride the same branch.

## Spec-stage decisions

- **S1 — Sort key: outstanding rep *deficit*, not raw rep requirement (interpretation of
  D1, flagged).** Key = `max(0, repReq − bestCurrentRep)` where `bestCurrentRep` is the
  player's highest rep among reachable factions selling the aug; tie-break by raw `repReq`
  ascending, then live price ascending, then name (determinism for tests). Rationale: D1's
  intent is "rep is the binding resource — minimize grind." Raw-repreq ordering would let
  the farmer grind a fresh faction while an *already-rep-met* aug in a joined faction sits
  unbought — plainly against the features' own step 6 ("when the target's rep is met:
  buy"). Deficit ordering makes rep-met augs sort to the front at key 0, which is exactly
  the intended behavior.
- **S2 — `FACTION_SCOPE` (D4's list, made concrete): 13 names via `ns.enums.FactionName`.**
  Story: `CyberSec`, `NiteSec`, `TheBlackHand`, `BitRunners`. Location: `TianDiHui`. City:
  `Sector12`, `Aevum`, `Chongqing`, `NewTokyo`, `Ishima`, `Volhaven`. Endgame: `Daedalus`,
  `TheCovenant`, `Illuminati` ("as they unlock" costs nothing to encode — the joinability
  evaluator simply never activates them until their requirements are met; The Covenant's
  combat-stat requirements mean it likely never activates in this run, which is correct,
  not a bug). Excluded: megacorps, crime/gang, Netburners (its augs are hacknet-only and
  would be filtered by D2 anyway). **The Red Pill stays manual for free:** it has all-1.0
  stats and is not allow-listed, so D2's filter drops it — the farmer feeds the Daedalus
  gate but Kenneth makes the endgame commit. Stated so it's a verified property (unit
  test), not luck.
- **S3 — Camp exclusion graph and invite requirements are live-read, never hard-coded
  (resolves D5's "verify at spec time" and Kenneth's 2026-07-13 caution).** At catalog
  build, the farmer reads `getFactionEnemies(f)` and `getFactionInviteRequirements(f)` for
  every faction in `FACTION_SCOPE` and persists both into the catalog export. The features
  file's camp table (A: Sector-12/Aevum · B: Chongqing/New Tokyo/Ishima · C: Volhaven)
  becomes *documentation cross-checked at validation* (L2 inspects the exported graph),
  not code. The D5 guard is generic: faction `f` is enemy-blocked iff
  `enemies(f) ∩ joinedFactions ≠ ∅` — no city-faction special-casing, so a fork that
  shuffled the camps can't break us.
- **S4 — Joinability and the travel rule: plan on requirements, join only on invites
  (cold review's finding 2).** `joinFaction` succeeds only for a faction in
  `checkFactionInvitations` — meeting requirements is not the same state as holding an
  invite. So the two are used for different things. **Planning** (candidate inclusion in
  `pickTarget`): a faction counts as *reachable* iff an invite is pending, **or** its
  cached invite requirements all evaluate met against live player state, **or** they
  evaluate met except exactly one `city` requirement (travel closes it). **Acting:** the
  `join` action fires only when the invite is actually pending; a reachable-by-reqs
  target whose invite hasn't surfaced yet reports phase `awaiting-invite` and just polls
  (the game surfaces invites promptly once requirements hold — no WARN, no join
  attempts). The requirement evaluator handles the documented `PlayerRequirement`
  variants (`someCondition` = OR, `not`, `city`, `money`, `skills`, `karma`,
  `employedBy`, `backdoorInstalled`-style server conditions if present) and treats **any
  unknown type as unmet** — conservative: the faction waits until its invite appears
  organically, which the invite-pending branch still catches. Travel fires only when the
  *current target's* faction is unjoined, not invite-pending, enemy-clear, and its
  evaluation is "met except city"; at most one `travelToCity` per pass; recorded via
  `recordTransaction`. No travel for any other reason (no reflexive city-joining — the
  features' Sector-12 note).
- **S5 — Single script; catalog built in-memory and exported, no second cache script.**
  The features' "cache once per node, persist to JSON" is honored as: build the static
  catalog (per-aug repReq/prereqs/sellers/stats/filter-verdict, per-faction
  enemies/inviteReqs) once at startup and rebuild on membership change; `ns.write` it to
  `augfarmer-catalog.json` (mode `"w"`) for inspection/validation each rebuild. It is
  **not read back** as state — on restart the farmer rebuilds from the API (the API is
  the source of truth; a stale file can't mislead). The **seller map is built by
  inverting `getAugmentationsFromFaction` over `FACTION_SCOPE`** — out-of-scope sellers
  are unusable anyway, so `getAugmentationFactions` is deliberately not used (saves 5 GB
  and one function of surface; a prereq sold only outside the scope correctly reads
  "no reachable seller"). Rationale for one script instead of a dumper+reader split: at
  SF4.3's 1× the whole surface is ~53 GB (S6) and RAM is charged per-function
  statically, so splitting saves nothing that matters while adding exec choreography and
  a real staleness surface. NFG's rep requirement and every price are live reads (they
  move); everything cached is genuinely static per node.
- **S6 — RAM: derived ≈ 53 GB at 1×; no `HOME_RESERVE_GB` change; launch rides the
  existing startup order.** Derivation from the final call set (cold review corrected
  the first draft's arithmetic; the figure below reflects S5's drop of
  `getAugmentationFactions`): 1.6 base + 5 GB × 5 (`getAugmentationsFromFaction`,
  `getAugmentationPrereq`, `getAugmentationStats`, `getOwnedAugmentations`,
  `purchaseAugmentation`) + 3 GB × 5 (`getFactionEnemies`,
  `getFactionInviteRequirements`, `checkFactionInvitations`, `joinFaction`,
  `workForFaction`) + 2.5 GB × 2 (`getAugmentationPrice`, `getAugmentationRepReq`) +
  2 (`travelToCity`) + 1 × 2 (`getFactionRep`, `getFactionWorkTypes`) + 0.5
  (`getCurrentWork`) + `getPlayer` 0.5 + `getResetInfo` 1 + `getHackingLevel` 0.05 +
  0-GB read/write/format = **52.65 GB**; the implementer re-derives from the actual
  final call set; acceptance band **45–60 GB** (a ~4× reading ≈ 210 GB is
  stop-and-investigate). Why no reserve bump:
  `HOME_RESERVE_GB` is *headroom the batcher leaves free*, not a companion budget —
  companions launch at daemon startup before the batcher packs home, so their footprint
  is already counted in `usedRam`. Consequences accepted and documented in the header:
  (a) a mid-session `restart augfarmer.js` may not fit in the 32 GB headroom — restart
  `daemon.js` instead (pre-authorized); (b) on a small post-install home the launch
  INFO-skips (existing `launchDetached` behavior) and the farmer joins the party at the
  first daemon restart after home RAM grows — harmless, since no faction is joinable
  before CSEC at hack ~55 anyway (features D12's own argument).
- **S7 — Reservation file: `augfarmer-reserve.json`, JSON with staleness (extends D7/D8).**
  Shape `{ amount, aug, faction, timestamp, time }`. The reserved amount is always the
  **actionable target's** live price — `pickTarget` only ever yields a single directly
  purchasable aug, so a prereq chain reserves one link at a time (D8's one-aug bound
  holds by construction). The farmer writes it **every poll while a reservation is
  active** (rep-met target, D8) with the *fresh* live price, and
  writes `{ amount: 0, ... }` when no reservation is active (explicit zero beats a
  missing file — distinguishes "farmer says nothing reserved" from "farmer dead").
  `resourcemanager.js` gains one rule: parse the file (pure function, mirrors
  `parseManualExtra`'s tolerance — missing/empty = quiet zero, malformed = WARN once per
  distinct bad value), and treat `timestamp` older than `AUGFARMER_STALE_MS = 60_000` as
  zero with a WARN once per stale-transition (a crashed farmer must not freeze fleet
  growth forever; 60 s = 6 farmer polls). Reservation key `"next-aug"`, label carries the
  aug name. `cloudmanager.js` and `procureprograms.js` untouched — tier 3 already spends
  only `available`, tier 1 already ignores reservations (D7).
- **S8 — Action-slot etiquette (extends D12): never preempt anything that isn't ours or
  studybootstrap's.** Per pass the farmer computes `slotAvailable` from
  `getCurrentWork()`: take/keep the slot iff current work is `null`, a university class
  (studybootstrap's CS kick — taking over *is* the handoff crossover the features file
  wants closed), or faction work (any faction in `FACTION_SCOPE` — reassigning our own
  earlier assignment is fine). Anything else — company work, crime, program creation,
  faction work for an out-of-scope faction Kenneth chose manually — is Kenneth's: the
  farmer leaves the slot alone, reports "yielding to manual work" in its tail/state (one
  tprint per transition, not per poll), and still does everything slot-free (join, buy,
  reserve, travel). `workForFaction` is re-issued only when current work isn't already
  the wanted (faction, workType) pair — no per-poll restart churn. Work type: prefer
  `hacking` if in `getFactionWorkTypes(faction)`, else `field`, else `security` (rep
  yield for a hacking build follows that order; live data beats recall about which
  factions offer contracts). `focus: false` per D12.
- **S9 — Pause flag: `augfarmer-pause.txt` (addition beyond the features file, flagged).**
  Presence suppresses all *actions* (join/work/buy/travel/reserve — reservation drops to
  zero so the fleet isn't held hostage by a paused farmer) while the loop keeps computing
  and reporting. Same "you're in control" philosophy as `finance-disable-formulas.txt`,
  and the natural lever before an install (stop the farmer committing a new camp while
  Kenneth is hand-managing the endgame). No auto-re-enable; remove the file to resume.
- **S10 — NFG cap state survives restarts via `lastAugReset`.** The D3 one-per-cycle cap
  needs "bought this cycle" to survive a farmer/daemon restart mid-cycle. The state file
  (S11) persists `{ lastAugReset, nfgBoughtThisCycle, boughtThisCycle: [...] }`; at
  startup the farmer compares `ns.getResetInfo().lastAugReset` — equal ⇒ restore the
  counters, different ⇒ new install cycle, reset them. This is the only state read back
  from disk (everything else rebuilds from the API). NFG enters the S1 sort with its
  *live* `getAugmentationRepReq` value and is excluded once `nfgBoughtThisCycle ≥ 1`.
- **S11 — State/plateau export: `augfarmer-state.json`, overwrite-in-place, written on
  change + a low-frequency heartbeat.** Contents: timestamp/time, phase
  (`grinding | awaiting-money | awaiting-invite | idle-plateau | paused | yielded`),
  current target
  (aug/faction/repReq/deficit/livePrice), joined factions, joined-this-cycle, camp locks
  in force, boughtThisCycle (with prices), NFG level+cap state, Daedalus-gate progress
  (installed count and queued count vs 30), and the S10 persistence fields. Written on
  every state *change* and at most once per 5 minutes otherwise (heartbeat proves
  liveness without churning the auto-export). Plateau (Q2): entering `idle-plateau`
  writes the summary + one `tprintTs` line; no further terminal output until state
  changes. This file + the catalog export + the transactions log are the phase's
  log-verifiable record.
- **S12 — Poll cadence: 10 s.** Faster than `procureprograms`' 30 s because the
  reservation must track a live (inflating) price and release quickly after a buy so
  fleet growth resumes; slow enough that a 60 s staleness window (S7) tolerates five
  missed polls. Nothing else here is latency-sensitive.
- **S13 — Startup sentinel, then never exit.** First pass wraps its first
  `ns.singularity.*` call in the Phase 22 two-tier rule: a throw before Singularity is
  proven ⇒ one WARN + `ns.ui.closeTail()` + exit (can't-happen at SF4.3, but the
  procureprograms-shaped backstop is nearly free); any throw after ⇒ per-pass WARN +
  retry next poll, never exit (an always-on companion that exits on a lull never comes
  back until the next daemon restart — Phase 22's lesson). No proactive
  `hasSourceFile4` pre-check for the same reason Phase 22 dropped it, **except** it
  keeps `getResetInfo` anyway for S10 — so the 1 GB is already paid and the cheap
  pre-check comes free: use it.

## Design

### Work item 1 — `src/augfarmer.js` [code]

Header states: purpose (the aug-acquisition half of the BN1.2 loop; installs stay
Kenneth's — D10); the D11 authorization and its bounds; the S6 RAM story (measured figure
added post-live; restart-via-daemon note; post-install INFO-skip is expected); the S8
etiquette rule; exec-by-filename, never imported.

Constants: `FACTION_SCOPE` (S2, built from `ns.enums.FactionName` inside `main` so pure
exports stay `ns`-free), `UTILITY_ALLOWLIST = ["Neuroreceptor Management Implant",
"CashRoot Starter Kit", "The Blade's Simulacrum"]` (D2 seed; curated by description, per
the `augcheck.js` caveat), `NFG_NAME = "NeuroFlux Governor"` (matches `auginfo.js`),
`POLL_MS = 10_000`, `RESERVE_FILE = "augfarmer-reserve.json"`,
`STATE_FILE = "augfarmer-state.json"`, `CATALOG_FILE = "augfarmer-catalog.json"`,
`PAUSE_FILE = "augfarmer-pause.txt"`, `TRAVEL_COST = 200_000`, `MULT_FILTER_KEYS` (D2's
nine: `hacking`, `hacking_exp`, `hacking_speed`, `hacking_chance`, `hacking_grow`,
`hacking_money`, `faction_rep`, `company_rep`, `charisma`, `charisma_exp` — ten keys,
charisma counts two).

Pure exports (unit-tested; all take plain data, no `ns`):

- `filterAugs(augStatsByName, allowlist)` — D2: keep iff any `MULT_FILTER_KEYS` value ≠ 1
  or name allow-listed. (The Red Pill's all-1.0 profile drops here — S2's property.)
- `expandPrereqs(candidateName, catalog, ownedSet)` — D6: returns the ordered unowned
  prereq chain (deepest first) ending in the candidate; prereqs bypass the D2 filter by
  design; if any link is sold by no in-scope faction (per S5's inverted seller map), the
  whole candidate is unreachable (returns null).
- `campBlocked(faction, enemiesByFaction, joinedSet)` — S3's generic guard.
- `evaluateInviteReqs(reqs, playerFacts)` — S4's evaluator over
  `{ city, money, skills, karma, jobs, backdoored }`-shaped facts; unknown type ⇒ unmet;
  returns `{ joinable, onlyCityGap }`.
- `pickTarget(catalog, playerFacts, joinedSet, ownedSet, nfgCapped)` — **the targeting
  unit is always a single directly-purchasable aug** (cold review's blocker, resolved):
  for each wanted aug (D2-filtered, unowned, from reachable factions per S4), expand its
  chain; the *actionable target* is the *deepest unowned link* — the wanted aug itself
  when its prereqs are owned. Each actionable target carries its **own** selling faction
  (best reachable seller by S1's deficit), repReq, deficit, and live price — so grind,
  reservation (D8/S7), rep-met gate, and buy all apply to that one link, never to a
  chain in aggregate. Shared prereqs dedupe (two wanted augs pointing at the same
  unowned prereq yield one candidate). Reachability, camp guard, and NFG cap apply to
  the actionable target's faction/name. Sort by S1's key over actionable targets; return
  the head (`{ aug, faction, repReq, deficit, wantedFor, needsJoin, needsTravel }`, where
  `wantedFor` names the filtered aug that motivated a category-exempt prereq buy) or
  null (plateau). After a link is bought, the next pass re-expands and the next link up
  becomes its own target, sorted on its own merits.
- `planPass(...)` — the whole per-pass decision as one testable function returning an
  action list (`join`, `travel`, `work`, `reserve`, `buy`, `idle`, `yield`), so the main
  loop is a thin executor. Includes S8's `slotAvailable` logic given a `currentWork`
  summary.
- Reservation/state record builders (shape-tested).

Main loop (per S12 poll): read player facts (`getPlayer`, `getHackingLevel`,
`getOwnedAugmentations(true)` for owned+queued, `getOwnedAugmentations(false)` for the
Daedalus installed count, `checkFactionInvitations`, `getFactionRep` per scope faction,
`getCurrentWork`, pause-file presence) → `planPass` → execute actions with each
`ns.singularity.*` call inside S13's two-tier try/catch → write reserve file (S7, every
poll) → write state file on change/heartbeat (S11) → `ns.clearLog()` + `ns.print` status
block → sleep. Catalog rebuild (S5) at startup and whenever the joined-faction set
changes. Buys are **affordability-gated** (cold review's finding 5): `purchaseAugmentation`
is attempted only when `money ≥` the target's live price re-read this pass — below that
the pass is a quiet `awaiting-money`, never a WARN. On `true`: `recordTransaction` +
`tprintTs` + **clear the in-memory reservation immediately, before the end-of-pass
reserve write** (finding 4 — the just-bought aug must not be re-reserved for another
poll; the file gets `{ amount: 0 }` until the next pass picks a new target). On `false`
at met gates: WARN once per distinct failure and re-plan next pass (a hand-bought aug or
price race resolves itself — owned/queued is re-read every pass). Terminal output on
events only: launch summary, join, travel, buy, target change, plateau enter,
yield/resume transitions.

### Work item 2 — `resourcemanager.js`: `next-aug` reservation rule [code]

New pure function `parseAugReserve(raw, now, staleMs)` → `{ amount, aug, badContent,
stale }` (missing/empty ⇒ quiet zero; malformed JSON / non-finite / negative amount ⇒
`badContent`; `now − timestamp > staleMs` ⇒ `stale`, amount forced 0).
`computeReservations` gains an `augReserve` input and pushes
`{ key: "next-aug", label: "next aug: <name> (augfarmer)", amount }` when positive. Main
loop reads `RESERVE_FILE` each poll (0 GB `ns.read`), WARNs once per distinct bad value
(mirroring `lastBadManualExtraRaw`) and once per stale-transition. The script stays
Singularity-free — it never learns where the number came from.

### Work item 3 — `daemon.js`: one launch line [code]

`launchDetached(ns, "augfarmer.js");` beside the other companions, comment in the
existing style (always-on Singularity aug farmer; ~53 GB so post-install INFO-skips are
expected until home RAM grows — see script header).

### Work item 4 — `tailmanager.js`: one `MANAGED_TAILS` row [code]

`{ script: "augfarmer.js", title: "aug farmer", defaultW: 560, defaultH: 220 }` — an
always-on companion with a live status block is exactly what the managed-tail system is
for (unlike Phase 22's transient watcher).

### Work item 5 — `vite.config.ts`: two filter lines [code]

`augfarmer-state.json` and `augfarmer-catalog.json` → `logs/…`, comments in the existing
style (Phase 23 — overwrite-in-place; state on change + heartbeat, catalog on rebuild).
The reserve file is deliberately **not** exported (heartbeat visible live in the tail,
same reasoning as `finance-state.json`).

### Work item 6 — tests [code]

Vitest, existing mock-data style, `test/augfarmer.test.js` plus extensions:

- **`filterAugs`:** hacking-mult aug kept; combat-only dropped; mixed hacking+combat kept
  (inclusive-OR); charisma-only kept; all-1.0 dropped; all-1.0 allow-listed kept;
  **The Red Pill (all-1.0, not allow-listed) dropped** (S2's property, by name).
- **`expandPrereqs`:** no-prereq passthrough; unowned chain ordered deepest-first;
  owned-prereq skipped; skip-category prereq still bought (D6); unsellable link ⇒ null.
- **`campBlocked`:** camp-mate allowed, cross-camp blocked, non-city faction with empty
  enemies never blocked — over a fixture enemy graph shaped like the features table.
- **`evaluateInviteReqs`:** city/money/skills met+unmet; `someCondition` OR;
  `not`+`employedBy`; unknown type ⇒ unmet; city-only gap flagged `onlyCityGap`.
- **`pickTarget`:** S1 deficit ordering incl. rep-met-sorts-first and the tie-breaks; NFG
  included uncapped / excluded capped; camp-blocked candidate skipped and next taken
  (D5's "skip, don't stall"); reachable via invite vs via reqs vs via travel; **chain
  targeting:** a wanted aug with an unowned prereq yields the *prereq* as the actionable
  target with the prereq's own faction/repReq/deficit driving sort, join, and
  reservation; a prereq whose only seller is out of scope makes the wanted aug drop out
  entirely (and the plateau fire if nothing else remains); two wanted augs sharing a
  prereq dedupe to one candidate; plateau ⇒ null.
- **join gating:** `planPass` emits `join` only when the invite is pending — a
  reachable-by-reqs faction without an invite yields `awaiting-invite`, zero join
  actions (S4).
- **buy gating:** no `buy` action below the live price (`awaiting-money`, no WARN); a
  successful buy clears the reservation in the same pass (record-builder test on the
  post-buy reserve write being `{ amount: 0 }`).
- **`planPass` / `slotAvailable`:** yields on manual company/crime/out-of-scope work;
  takes over `null`/university/in-scope faction work; no re-issue when current work
  already matches; paused ⇒ report-only actions and zero reservation.
- **`resourcemanager`:** `parseAugReserve` all branches; `computeReservations` with
  `augReserve` positive/zero/stale; existing tests untouched otherwise.
- **`verify-transactions`:** `auto-aug`, `auto-travel`, `auto-formulas` accepted as
  expense sources (fixture records).

### Work item 7 — doc reconciliations [code]

- `studybootstrap.js` header: "nothing else contends for [the slot] post-install" →
  points at the farmer's S8 rule as the deliberate stop/handoff closure.
- `docs/reset-protocol.md`: rewrite the "auto-UNLOCK, never auto-JOIN" core rule to name
  the D11 bounded authorization (farmer joins within `FACTION_SCOPE`, camp guard replaces
  the manual stand-in; install still manual). **This retires Phase 22's
  grep-for-`joinFaction` rail** — the CHANGELOG entry says so explicitly, and the rail's
  replacement is the S2 scope constant + the never-`installAugmentations` grep. Also add
  TOR + port openers by name to the persistence table's "created programs: reset" row.
- `docs/scripts.md`: `augfarmer.js` companion row.
- `BACKLOG.md`: delete the now-fixed `verify-transactions` bug entry; resolve the
  "Focus-penalty / NRMI" idea (its "revisit when a Singularity rep-grinder is built"
  trigger fires — NRMI is allow-listed here; its two verify caveats move into this
  phase's L-steps, see L5); trim the "Augment reservation cost model" idea to point at
  the shipped `next-aug` rule (the priority-model half is done; delete or narrow the
  entry to what remains). Dated close-out entry in `docs/phases/CHANGELOG.md` (notes: S1
  reinterpretation, S9 pause file, the verify-transactions fold-in, the retired Phase 22
  rail, measured RAM, which live tier ran). Graduate both phase docs. Staged with the
  work.

## Live procedure [live]

Pre-step: items 1–7 merged locally, `npm test` green, dev server healthy,
`dist/src/augfarmer.js` present (standing byte-check rule).

- **L1 — Launch + RAM.** Claude restarts `daemon.js` over CDP. Confirm: farmer running
  (`ps` on home / managed tail appears), launch summary tprint,
  `logs/augfarmer-state.json` and `logs/augfarmer-catalog.json` exported.
  `run ramcheck.js augfarmer.js` → reading in S6's 45–60 GB band (≈210 GB ⇒ stop:
  multiplier live). Figure recorded in the header ([code] comment edit).
- **L2 — Camp graph audit (Kenneth's caution, made a gate).** Open
  `logs/augfarmer-catalog.json`; check the six city factions' live-read enemy lists form
  the expected three mutually-exclusive camps (A: Sector-12+Aevum, B: Chongqing+New
  Tokyo+Ishima, C: Volhaven) **and that Daedalus's enemy list is empty**. Any deviation
  from the features table is a finding to reconcile before enabling joins is trusted —
  the code doesn't care (S3 is generic), but the plan reasoning does.
- **L3 — First join + grind.** Watch the farmer pick its first target (state file:
  target + deficit), auto-join the faction (join tprint; in-game faction list), and
  start unfocused faction work (state `grinding`; share boost visible in daemon logs).
  Confirm no join outside `FACTION_SCOPE` and no city faction joined while a camp-mate's
  enemy is already joined this cycle.
- **L4 — First buy (the close-out gate).** When the target's rep lands: reservation
  appears in `finance-state.json` (`next-aug`, live price), cloudmanager keeps buying
  only above it, then the purchase: transactions log gains the `auto-aug` record, state
  file moves to the next target, reservation drops. This lands on the grind's schedule,
  not the sitting's — the phase stays open until it has. NFG cap and plateau behavior
  are observed opportunistically over the run, non-blocking.
- **L5 — Etiquette + NRMI checks (opportunistic, non-blocking).** (a) While the farmer
  is grinding, Kenneth starts any manual work — next pass the farmer yields (one
  transition tprint, state `yielded`) and does not steal the slot back until the manual
  work ends. (b) Touch `augfarmer-pause.txt` — actions stop, reservation zeroes, state
  `paused`; remove to resume. (c) When NRMI is eventually bought+installed: read its
  in-game description to confirm it zeroes the unfocused penalty (BACKLOG's parked
  caveat, retired here or re-parked with evidence).
- **L6 — Soak.** ≥30 min of daemon uptime: no per-poll terminal output; `npm run
  verify:log` green (now including the new expense sources); reserve-file staleness
  never WARNs while the farmer is alive.

## Acceptance criteria

- **`npm test` green** including work item 6's full list. [code, implementer clears]
- **Never-install rail:** `grep -r installAugmentations src/` finds nothing. Join calls
  exist only in `augfarmer.js`, and every join site routes through the `FACTION_SCOPE`
  check (asserted by test on `planPass`: no `join` action for an out-of-scope faction
  even when invited). [code]
- **RAM recorded:** `logs/ramcheck-result.json` shows `augfarmer.js` in the 45–60 GB
  band; figure in the header; `daemon.js` flat vs. its header figure. [live artifact +
  code comment]
- **Catalog exported and audited:** `logs/augfarmer-catalog.json` carries all 13 scope
  factions with live-read enemies + invite requirements; L2's camp audit passed (or its
  finding documented). [live, from the exported file]
- **Reservation integration:** `finance-state.json` shows the `next-aug` reservation
  while a rep-met target awaits money, and it disappears ≤2 resource-manager polls after
  the buy; `parseAugReserve` staleness proven by test, not live crash. [live + code]
- **First join and first buy observed** (L3/L4): join tprint + state record;
  `transactions-<date>.json` gains the `auto-aug` record matching the state file's
  target; zero out-of-scope joins over the soak. The close-out CHANGELOG entry waits on
  L4. [live]
- **`npm run verify:log` green** with `auto-aug`/`auto-travel`/`auto-formulas` records
  present or absent as the run dictates (the checker accepts them; the previously-known
  `auto-formulas` failure is gone). [live]
- **Doc reconciliations landed:** studybootstrap header updated; `reset-protocol.md`'s
  core rule rewritten + persistence row named; `docs/scripts.md` row added; BACKLOG
  entries resolved as listed in work item 7. [code, checkable by reading the files]

## Files touched

**New:** `src/augfarmer.js`, `test/augfarmer.test.js`.

**Edited:** `src/resourcemanager.js` (+ its test file), `src/daemon.js` (one line),
`src/tailmanager.js` (one row), `vite.config.ts` (two filter lines),
`test/verify-transactions.test.js` (three sources), `src/studybootstrap.js` (header
comment only), `docs/reset-protocol.md`, `docs/scripts.md`, `BACKLOG.md`,
`docs/phases/CHANGELOG.md`.

**Deliberately untouched:** `cloudmanager.js` and `procureprograms.js` (D7: tiers 1 and 3
already behave correctly), `hosts.js`/`scheduler.js`/`sampling.js`/`targets.js`/workers
(no batcher changes; `HOME_RESERVE_GB` stays 32 per S6), `backdoorfactions.js` (the
unlock half keeps running unchanged), `translog.js` (new callers, no new code).

## Open questions

None blocking. Two watch-items logged for the implementer/live run rather than resolved
by fiat: (a) the exact `Task` shape from `getCurrentWork` in this fork (verify in
`markdown/` or one live probe before wiring S8's match rule); (b) whether
`getOwnedAugmentations(true)` represents multiple queued NFG levels as duplicate entries
— S10's `lastAugReset` counter avoids depending on the answer, but the implementer should
note what they observe in the close-out.
