# Phase 25 spec: autonomous aug-ratchet / faction strategy

## Context

Work in `C:\Users\admin\bitburner-scripts`. Requirements: `phase-25-faction-strategy.features.md`
— read it first; this spec assumes it, including the causal spine (`BN completion ← hack level ←
hacking-mult augs ← faction rep`), the two-regime structure, the F1 city decision ("aug access
picks the camp"), the F2 priority order (`mults.hacking` → NFG → `faction_rep`), the D11
relaxation (Kenneth authorized `installAugmentations()` 2026-07-14, behind guards + staged
rollout), and the staged closing plan for the open trigger hole. **Slice 0 already shipped**
(`src/ratchetlog.js`, commit 511cc50) — this spec builds on it and does not modify it.

What ships: a substantially upgraded `src/augfarmer.js` (proactive joining + camp commitment,
mult-per-rep targeting, work-slot allocation, donation route, the install-trigger evaluator, a
mode switch, and — auto mode only — spend-down + install delegation), one new small script
`src/installer.js` (the **only** file allowed to call `installAugmentations`), a new append-log
`ratchet-decisions.json` (+ its `vite.config.ts` export line + `verify:log` shape check), vitest
coverage for every new/changed pure function, and the doc reconciliations (the reset-protocol
never-install rail is rewritten, not just relaxed).

**Prominent flag (features' governance ask):** this phase reverses Phase 23's hard rail
"`grep -r installAugmentations src/` finds nothing." The replacement rail is narrower, not
absent: the call exists in exactly one file (`installer.js`), which is exec'd from exactly one
site (`augfarmer.js`'s auto-mode branch), which is reachable only when `ratchet-mode.txt` reads
`auto` — a file Kenneth creates by hand. Default (file missing) is **observe mode: no install,
no spend-down, ever.**

**Audience note:** the implementer does everything marked **[code]**. Kenneth does everything
marked **[live]** — except daemon restarts and story-popup dismissal, which CLAUDE.md
pre-authorizes Claude to do over CDP. No [live] step requires editing code.

## Ground rules

- `CLAUDE.md` rules apply. New `ns` surface, verified against `markdown/` during spec drafting:
  `singularity.installAugmentations(cbScript?) → void` (5 GB; "If you do not own any queued
  Augmentations then the game will not reset"; cbScript runs post-reset, 1 thread, no args, must
  exist on home), `singularity.donateToFaction(faction, amount) → boolean` (5 GB),
  `singularity.getFactionFavor(faction)` (live call site: `ratchetlog.js`),
  `ns.getFavorToDonate()` (root ns, per `markdown/bitburner.ns.getfavortodonate.md`),
  `singularity.getUpgradeHomeRamCost()` / `upgradeHomeRam()` (live call site:
  `upgradehomeram.js`), `singularity.getUpgradeHomeCoresCost()` / `upgradeHomeCores()`
  (markdown files present), `ns.formulas.reputation.donationForRep(rep, player)` (live call
  site: `favorprobe.js`; Formulas.exe is on home), `ns.exec` (1.3 GB). The implementer records
  each call's exact RAM figure from `markdown/` before deriving S12's bands — the figures above
  I verified only where stated; everything else is "file exists + live call site", not a cost.
- **Transactions log:** every successful spend records via `recordTransaction`. New sources:
  `auto-donation` (augfarmer; with `faction`, `rep`, `amount`) and `home-cores-upgrade`
  (installer; mirrors `home-ram-upgrade`'s record shape). `installer.js` reuses
  `home-ram-upgrade` for RAM tiers (same event, same source — one query key in the day files).
  `test/verify-transactions.test.js`'s `VALID_EXPENSE_SOURCES` gains the two new names.
- **Singularity isolation:** unchanged — `augfarmer.js` and `installer.js` are exec'd by
  filename, imported by nothing, and import only Singularity-free modules (`common.js`,
  `translog.js`). `installer.js` is exec'd via a raw `ns.exec("installer.js", "home", 1)` from
  `augfarmer.js` — never via an import of `daemon.js`'s `launchDetached` (importing `daemon.js`
  would pull its whole ns surface into augfarmer's static RAM).
- **Identifier hygiene:** pre-checked clean against the ns namespace: `scoreAug`, `pickCamp`,
  `planJoins`, `pickWorkFaction`, `evalTrigger`, `updateRepRates`, `buildDecisionRecord`,
  `RATCHET_MODE_FILE`, `DECISIONS_FILE`, `PASSIVE_REP_FACTIONS`, `SCORE_W_EXP`, `SCORE_W_REP`,
  `MIN_TOTAL_GAIN`, `GRIND_HORIZON_MS`, `TRIGGER_SUSTAIN_MS`, `spendDownPlan`, `campChoice`,
  `endgameHold`, `donationCost`, `queuedGain`. No state-record key may alias an ns method
  reachable from any namespace (the `state.share` +2.4 GB lesson) — in particular do **not**
  name a field `install`, `exec`, `hack`, `grow`, `weaken`, `share`, `kill`, or `scan`;
  `installAugmentations` appears as an identifier nowhere outside its one call site.
- **No batcher changes; no dashboard changes.** `daemon.js` already launches `augfarmer.js` and
  `ratchetlog.js`; no launch lines change. `dashboard.js`'s `augPanel` renders the state file's
  `phase` as an opaque string, so the new phase values flow through with zero edits (the
  implementer confirms `augPanel` doesn't enumerate phases; if it does, that's a bug to fix
  under this phase, flagged in the close-out).
- **`ratchetlog.js` untouched.** It is Slice 0's audit trail and F4(a)'s required per-install
  log; this phase adds the *decision* log beside it, not inside it.
- Branch `phase25-ratchet` off `master`. `npm test` the implementer runs and clears; RAM
  readings and live observation are Kenneth's (daemon restarts are Claude-over-CDP,
  pre-authorized). BACKLOG/CHANGELOG edits ride the same branch. Before merging back, run the
  CLAUDE.md worktree checks (`git log HEAD..master`).

## Spec-stage decisions

- **S1 — Architecture: the engine and trigger live in `augfarmer.js`; the install call is
  isolated in a new `installer.js`.** The farmer already computes every trigger input (targets,
  deficits, plateau, queued augs, boughtThisCycle, money) — a separate controller would either
  re-read all of it over Singularity (RAM + drift) or consume `augfarmer-state.json` and add a
  cross-script coordination surface (flag files, races) for no benefit. But the install call
  itself moves to a dedicated script for two reasons: (a) the replacement safety rail is
  grep-narrow ("`installAugmentations` appears only in `installer.js`") and the exec site is
  mode-gated, so the always-on farmer *cannot* install even if its trigger logic is buggy in
  observe mode; (b) RAM — the farmer doesn't carry install + home-upgrade surface (~+14 GB) all
  cycle for a call that fires at most once per cycle.
- **S2 — Mode switch: `ratchet-mode.txt`; missing/anything-else = observe, exact content
  `auto` = auto.** Stage 1 (observe) is the shipped default; Stage 2 is Kenneth writing the
  file in-game (`[live]`, no code change) after the trigger is validated per S11. The features'
  option (b) prep-and-notify is **parked as the features file parked it**: observe mode's
  fire-transition `tprintTs` + the `install-ready` phase in the state file *is* the
  notification; whether a stronger notify (or full-auto) is wanted gets decided on observe-mode
  evidence. No third mode value is reserved now — adding one later is a constant.
- **S3 — F2 targeting: score-based filter + value-per-rep sort, replacing D2's broad 10-key
  filter and S1(23)'s cheapest-deficit sort.**
  - `scoreAug(name, stats, allowSet) = (stats.hacking − 1) + SCORE_W_EXP·(stats.hacking_exp −
    1) + SCORE_W_REP·(stats.faction_rep − 1)`, except allow-listed names return
    `ALLOWLIST_SCORE` flat (the name parameter exists for exactly this override — stats alone
    can't see the allowlist). `SCORE_W_EXP = 0.5`, `SCORE_W_REP = 0.5`.
    Rationale: `hacking` is the linear level lever (weight 1 by definition); `faction_rep`
    compounds the loop's binding resource (features rank it in explicitly); `hacking_exp` is
    **added at a discount, a spec-stage judgment call beyond the features' explicit list** —
    the level formula is logarithmic in exp, but the phase's own cost model says we pay ~15–20
    re-climbs whose wall-clock scales ~linearly with exp rate, so exp augs earn a slot below
    pure-hacking augs. The weights are declared provisional; every decision record (S9) carries
    them so observe-mode data can re-rank offline. `hacking_money/speed/chance/grow`, charisma,
    and company mults contribute 0, per F2.
  - **Filter:** wanted iff `scoreAug(stats) > 0` or allow-listed. `UTILITY_ALLOWLIST` shrinks
    to `["Neuroreceptor Management Implant"]` (NRMI directly raises the farmer's own unfocused
    rep rate). CashRoot Starter Kit and The Blade's Simulacrum are **dropped** (flagged
    change): the 30-aug Daedalus gate is already met, so a zero-score aug only delays the
    plateau signal the trigger feeds on. Allow-listed augs sort with a fixed
    `ALLOWLIST_SCORE = 0.25`. The Red Pill still drops by construction (all-1.0, not
    allow-listed) — the existing unit test is kept and re-asserted.
  - **Sort over actionable targets:** rep-met targets (deficit 0) first, ordered by score
    descending, then live price ascending; then deficit>0 targets by `score / deficit`
    descending, tie-break deficit ascending, then price, then name. A prereq link (D6 —
    prereqs bypass the filter) **inherits the wanted aug's score** for ordering (the link's
    only value is the path) while keeping its own faction/repReq/deficit for grind, reserve,
    and buy; on shared-prereq dedupe the max inheriting score wins.
  - **NFG:** enters the sort with its live rep/price as today, scored by its own stats
    (its per-level hacking mult > 1, so it passes the filter naturally). The D3 one-per-cycle
    cap **stays for normal phases** (mid-cycle NFG dumping starves fleet compounding) and is
    **lifted only during S10's spend-down** — which is exactly the "money-capped NFG tail"
    behavior `reset-protocol.md` describes (~17–18 levels/install at peak money).
- **S4 — F1 proactive joining + camp commitment.**
  - Every pass, independent of the current target, the farmer joins **every** invite-pending
    faction in `FACTION_SCOPE` that passes the camp guard (`campBlocked`, unchanged) **and**
    the camp commitment below. Multiple joins per pass are fine (joining is instant and free).
  - `pickCamp(catalog, ownedSet, joinedSet)` — pure, computed at every catalog rebuild: if any
    city faction is already joined this cycle, the camp is *that faction's* camp (reality
    wins — this cycle Aevum is already joined, so camp = {Aevum, Sector-12} until the next
    install). Otherwise score each camp — where camps are derived from the live enemy graph,
    not hard-coded, as **the connected components of the ally (non-enemy) relation among city
    factions** (maximal sets of pairwise non-enemies; note this is the *complement* of the
    enemy relation — the enemy graph itself connects all six cities into one component, the
    wrong answer, per the cold review's B1) — as Σ `scoreAug` over unowned, filter-passing
    augs whose **entire** in-scope seller set
    lies inside that camp (an aug also sold by a non-city faction discriminates nothing);
    pick the max, tie-break by camp size descending then name. The choice is logged in the
    state file and a decision record; it re-computes each rebuild but **cannot flip once a
    city faction is joined** (the reality rule above) — "commit early" is achieved by joining
    the chosen camp's cities as soon as their invites can be closed, rather than waiting for
    an aug-need.
  - **Travel, extended:** at most one `travelToCity` per pass (unchanged), but the trigger for
    it generalizes: first priority is the current target's city gap (unchanged); if none, close
    the city gap of any unjoined, camp-allowed scope faction whose requirements are otherwise
    met (this is how Tian Di Hui and the camp cities get collected proactively). Recorded via
    `recordTransaction` as today.
- **S5 — F3 work allocation: `pickWorkFaction`.** `PASSIVE_REP_FACTIONS = {CyberSec, NiteSec,
  The Black Hand, BitRunners}` — constant, commented with the 2026-07-14 measurement (passive
  rep accrues only on the backdoored hacking factions; favor multiplies but can't create a
  base gain). The single active-work slot goes to the **first target in S3's sorted order
  whose faction is joined, needs grinding (deficit > 0, not donation-closable per S6), and is
  not in `PASSIVE_REP_FACTIONS`**; if every grindable target's faction is passive, the head
  target's faction is worked as today. The buy/reserve target stays the global head — work
  faction and buy target may differ, and the state file + tail block show both. S8(23)'s slot
  etiquette (yield to manual work) is unchanged and sits above this rule.
- **S6 — Donation route (F2's favor lever), generalized but endgame-excluded.** When the
  head target's faction is joined, `deficit > 0`, `getFactionFavor(faction) ≥
  ns.getFavorToDonate()`, S8's `endgameHold` is false, and **`Formulas.exe` is on home**
  (`ns.fileExists` guard — `donationForRep` throws without it, and in the post-install window
  before `procureformulas.js` re-buys it the route would otherwise burn silently into the
  two-tier catch; while absent, donation is suppressed and the target grinds normally — the
  cold review's C6): compute `donationCost =
  formulas.reputation.donationForRep(deficit, player)` (**exact, not conservative** —
  settled 2026-07-14 from upstream `bitburner-src` `donation.ts`, Kenneth-authorized:
  `donate()` credits `repFromDonation` with no favor term; favor only gates access.
  `docs/reputation-favor.md`'s lock-down section corrected accordingly. Residual check: the
  first live donation confirms the fork matches upstream — L4) and emit a
  `donate` action **only when `money ≥ DONATION_BUFFER × (donationCost + livePrice)`**
  (`DONATION_BUFFER = 1.2`) so the buy lands immediately after; below that the pass is
  `awaiting-money` with the reservation covering **both** (`reserve = donationCost +
  livePrice` — the existing reserve file/rule carries a bigger number, `resourcemanager.js`
  unchanged). On a successful `donateToFaction`: `recordTransaction` (`auto-donation`) +
  tprint; deficit re-reads ~0 next pass and the normal buy path fires. Donation-closable
  targets are skipped by S5's work allocation (money closes them, not the slot).
  **Daedalus is excluded** whenever `endgameHold` holds (S8) — the Daedalus
  donate→Red-Pill sequence is the manual endgame runbook, explicitly out of scope
  (features' decided-parked).
- **S7 — The install trigger (v1, explicitly provisional — the open hole, instrumented rather
  than solved).** All constants exported and embedded in every decision record so observe data
  can re-derive the trigger offline. Definitions, all pure in `evalTrigger(inputs, priorState)`:
  - `repRates`: per joined scope faction, an EWMA (α = 0.2) of `Δrep/Δt` sampled each poll
    from the `getFactionRep` reads the farmer already does — captures active + passive + share
    combined, whatever their mix.
  - `totalGain` — one combined product, defined once (the cold review's C2): `queuedGain ×
    projectedNfgFactor`. `queuedGain` = Π of `stats.hacking` over queued-but-uninstalled augs
    (from the catalog's stats and `getOwnedAugmentations(true) − (false)`) — this set already
    includes any NFG level queued under the normal one-per-cycle cap. `projectedNfgFactor`
    covers only **additional** spend-down NFG levels: from the **live** NFG price `p` (which
    already reflects every queued purchase, so no double count at the boundary), money `m`,
    and the observed ×1.9 price ladder, the affordable extra-level count
    `n = ⌊log₁.₉(1 + m·0.9/p)⌋` and factor `nfgStats.hacking^n` (money-only projection;
    NFG's rep requirement may bind first and cut `n` — accepted optimism, logged so observe
    data shows the error).
  - `armed` (instantaneous condition) := `totalGain ≥ MIN_TOTAL_GAIN (1.10)`
    **and** `queuedCount ≥ 1` **and not** paused **and not** `endgameHold` **and** (
    `phase == idle-plateau` **or** (`phase == grinding` and `deficit / repRates[targetFaction]
    > GRIND_HORIZON_MS (8 h)`, only when that rate has ≥ `RATE_MIN_SAMPLES (30)` samples this
    cycle — no horizon-fire on unmeasured rates)).
  - `fired` := armed continuously for `TRIGGER_SUSTAIN_MS (10 min)`.
  - Rationale for the gain floor on **both** paths: early-cycle plateaus are frequently
    *pending-reachability* artifacts (backdoor factions gate on hacking level; their augs
    vanish from the candidate set until `backdoorfactions.js` lands them), and an install at
    +2% mult pays a full re-bootstrap for nothing — the floor makes the degenerate
    install-at-level-60-forever loop structurally impossible while still firing on real
    NFG-tail cycles (17 NFG levels ≈ ×1.18 projected). `awaiting-money` never fires (rep is
    met; waiting to buy then install dominates installing without the aug).
  - Observe mode on `fired`: one `tprintTs` (`RATCHET: would install now — …` with the full
    input vector), phase `install-ready`, decision record. In **observe mode only**, fired
    state clears (with a record) when the condition lapses (e.g. a new faction opened up and
    produced a cheap target). In **auto mode**, `fired` is a **latch** (the cold review's
    C3): once the S10 sequence starts, `evalTrigger` is no longer consulted — the spend-down
    phases don't satisfy the arming conditions and must not self-abort the install. The only
    aborts are Kenneth's levers: deleting `ratchet-mode.txt` (or changing its content) or
    creating `augfarmer-pause.txt` drops the latch back to observe behavior, with a decision
    record.
- **S8 — Endgame hold: `endgameHold := joined(Daedalus) || hackingLevel ≥ 2500`.** While it
  holds: the trigger cannot arm and the donation route is disabled (S6); joining, grinding,
  buying, and reservations continue unchanged (queuing Daedalus mult augs helps the manual
  endgame). Rationale: the features hand off *to* the manual runbook at hack 2500, and an
  auto-install after the 2500 re-climb would torch a Daedalus rejoin (the exact
  two-re-climbs-not-zero lesson in `reset-protocol.md`). Transitions log a decision record +
  one tprint.
- **S9 — Decision log: `ratchet-decisions.json`, append-only ring (cap 500), exported.**
  A record on every: trigger arm, fire, clear; endgame-hold transition; camp choice; donation;
  spend-down start/step-summary/end; installer exec. Each record: timestamp/time, mode, phase,
  the full trigger input vector (queuedCount, queuedGain, projected NFG levels/factor, money,
  target {aug, faction, deficit}, repRate used, sustainMs), the S3/S7 constants in force, and
  `mults.hacking`. This — beside `ratchet-log.json` (Slice 0), `augfarmer-state.json`, and
  the transactions log — is F4(a)'s non-negotiable audit trail: augs bought (transactions),
  mult before/after (ratchet-log), why/when the trigger acted (this file). One
  `vite.config.ts` export line. **Durability across the reset (the cold review's C5):**
  belt-and-braces — home files survive the soft reset (open question a, resolved), *and* the
  dev-server bridge exports each write to `logs/` at write time, so the repo-side copy
  independently retains the trail up to and including `installer.js`'s final pre-install
  record. The L7 checklist verifies the exported trail explicitly for the first auto fire.
- **S10 — Auto-mode execution (dormant until Kenneth flips S2's file).** On `fired` in auto
  mode the farmer runs the cycle end-game as phases, all logged per S9:
  1. **`spend-down`:** lift the NFG cap; loop buys of rep-met, affordable targets — discrete
     augs first (S3 order), then NFG levels repeatedly until `purchaseAugmentation` fails or
     money is exhausted (bounded ≤ 50 buys/pass); donation route stays available (it can fund
     NFG rep where favor allows). During spend-down **and only in auto mode**, the reserve
     file publishes `amount = current money` refreshed each poll (label the aug name or
     `install spend-down`) — freezing `cloudmanager`/fleet purchases, because purchased
     servers die with the install while every dollar here converts to mult or home hardware.
     (Observe mode never freezes — whether to stop fleet growth pre-install is Kenneth's
     call in the manual runbook.)
  2. **Exec `installer.js`** when a spend-down pass completes with nothing further buyable:
     `ns.exec("installer.js", "home", 1)`. On a pid > 0 the farmer enters phase
     `installing` and **stops acting** — no further buys, donations, or execs; it keeps
     polling only to refresh the state file and the full-money reserve until the reset kills
     it (the cold review's C4: this both prevents the farmer spending concurrently with the
     installer's home-upgrade loop and makes the exec one-shot per fired latch, so `exec`
     returning 0 can only mean RAM, never already-running). If the exec returns 0, WARN once
     and retry next poll — late-cycle home is huge, so this is theoretical.
  3. **`installer.js` (the whole script):** re-verify mode file reads `auto` (defense in
     depth — it refuses to run otherwise, so a stray manual `run installer.js` in observe
     mode is a no-op WARN); max home RAM (`getUpgradeHomeRamCost`/`upgradeHomeRam` loop,
     `recordTransaction` per tier, source `home-ram-upgrade`), then cores (same shape,
     `home-cores-upgrade`) — hardware after augs because mult is the node-clearing lever and
     money at this point is otherwise about to vanish; append a final decision record; then
     `installAugmentations("bootstrap.js")`. `bootstrap.js` is the canonical cold-start
     entry (hands off to `daemon.js` when RAM fits — and home RAM/cores persist across the
     install, so the handoff is immediate). If control returns after the call (no queued
     augs — can't-happen given the farmer's `queuedCount ≥ 1` gate), WARN and exit.
  - Post-install, the relaunched daemon restarts every companion; `ratchetlog.js`'s persisted
    `ratchet-last.json` records the boundary it "missed" while dead (already shipped
    behavior); the farmer starts a fresh cycle (existing `lastAugReset` machinery).
- **S11 — Phase-close gate: Stage 1 validated; Stage 2 ships dormant.** The phase closes when
  observe mode has produced at least one `install-ready` fire whose decision record Kenneth
  reviewed against his own judgment, followed by one **manual** install cycle (his normal
  runbook) with the full audit trail verified (`ratchet-log.json` pair record + decision
  records + transactions coherent). **Explicit acceptance (the cold review's C7):** the fire
  is log-verifiable but the trigger's *correctness* is validated only by Kenneth's judgment
  at this stage — deliberately, because the features file frames the trigger as an open hole
  to instrument, not solve; objective validation is what the accumulating decision + ratchet
  logs exist to enable later. It does **not** wait for an auto-install to fire — that
  is gated on Kenneth flipping S2's file after the observe evidence convinces him, which may
  be days-to-weeks out and is his decision, not a deliverable. The first auto-fire gets a
  BACKLOG entry with its wake-up condition ("when Kenneth writes `auto` into
  `ratchet-mode.txt`") and a defined observation checklist (L7), so it doesn't dangle
  unwatched.
- **S12 — RAM: derived bands, implementer re-derives from the final call set.** `augfarmer.js`
  adds `donateToFaction` (5), `getFactionFavor`, `ns.getFavorToDonate`, `ns.exec` (1.3), and
  `formulas.reputation.donationForRep` to Phase 23's measured 52.7 GB → expect **~60 GB, band
  55–70 GB** (a ~4× reading ⇒ stop: multiplier live, or an identifier-hygiene false charge).
  `installer.js`: base 1.6 + `installAugmentations` 5 + RAM/cores upgrade set (~9) +
  `getPlayer` 0.5 + read/write 0 → **~16 GB, band 12–22 GB**. No `HOME_RESERVE_GB` change
  (companions launch before the batcher packs home — Phase 23's S6 reasoning holds;
  `installer.js` is transient and exec'd at peak-money moments when home is large).
- **S13 — Doc reconciliations (the rail rewrite is the load-bearing one).**
  - `docs/reset-protocol.md`: rewrite the "Core rule" section — install is no longer "100%
    manual"; state the new bounded authorization verbatim: *default observe (no install ever);
    `auto` only by Kenneth's hand-written mode file; `installAugmentations` exists only in
    `installer.js`; trigger guarded by queued≥1 + gain floor + sustain + endgame hold; every
    fire fully logged.* Also update the "Before a soft reset" section to note the automated
    spend-down implements it (and its aug-before-hardware order, which the section's own
    step 2 "first" already implies despite the list numbering).
  - `src/augfarmer.js` header: D11 text updated the same way.
  - `docs/scripts.md`: `installer.js` row; `augfarmer.js` row updated (scoring, camp, trigger,
    modes); `ratchet-decisions.json` noted.
  - `docs/reputation-favor.md`: one line under the donation section pointing at the S6
    generalized route.
  - `BACKLOG.md`: resolve "Install-order calculator" (this phase ships the data-driven
    version of exactly that call — delete, CHANGELOG notes it); narrow "Augment
    breadth-vs-depth" (S4's camp commitment + S6's donation route address the v1 tension;
    what remains, if anything, is Daedalus-endgame-specific and parked with the endgame);
    resolve "Validate `upgradeHomeRam` Singularity call" by pointing its verification at L5/L7
    (first observed installer or manual-assisted run). Add the S11 first-auto-fire entry.
  - `docs/phases/CHANGELOG.md`: dated close-out (notes: the rail reversal, S3's allowlist trim
    + exp-weight judgment call, S7's provisional constants, which live steps fired, measured
    RAM). Graduate both phase docs to `docs/phases/`. Staged with the work, not after.

## Design

### Work item 1 — `src/augfarmer.js` upgrade [code]

Header: rewrite the D11 paragraph per S13; add the mode-switch contract (S2), the trigger
summary + "provisional constants, see decision log" note (S7), the endgame hold (S8), and the
updated RAM figure (post-live).

New/changed constants: `RATCHET_MODE_FILE = "ratchet-mode.txt"`,
`DECISIONS_FILE = "ratchet-decisions.json"`, `DECISIONS_CAP = 500`, `SCORE_W_EXP = 0.5`,
`SCORE_W_REP = 0.5`, `ALLOWLIST_SCORE = 0.25`, `MIN_TOTAL_GAIN = 1.10`,
`GRIND_HORIZON_MS = 8 * 3600_000`, `TRIGGER_SUSTAIN_MS = 600_000`, `RATE_MIN_SAMPLES = 30`,
`DONATION_BUFFER = 1.2`, `ENDGAME_HACK_LEVEL = 2500`, `SPEND_DOWN_BUY_CAP = 50`,
`PASSIVE_REP_FACTIONS` (S5), `UTILITY_ALLOWLIST = ["Neuroreceptor Management Implant"]` (S3).

Pure exports (new or reshaped; all plain-data, no `ns`):

- `scoreAug(name, stats, allowSet)` — S3's score (allow-listed name ⇒ `ALLOWLIST_SCORE`).
- `filterAugs(...)` — reshaped to score-based (S3); Red-Pill-drops property preserved.
- `pickTarget(...)` — same actionable-link machinery; new candidate fields `score`
  (inherited for prereqs) and the S3 sort; returns the sorted candidate list too (S5 needs
  it), head = buy target.
- `pickCamp(catalog, ownedSet, joinedSet)` — S4 (camps from the live enemy graph's connected
  components; reality rule; exclusive-seller scoring).
- `planJoins(catalog, invites, joinedSet, campChoice)` — S4's join set for this pass.
- `pickWorkFaction(sortedCandidates, joinedSet, passiveSet, donationClosableSet)` — S5.
- `updateRepRates(prevRates, prevReps, reps, dtMs)` — S7's EWMA tracker.
- `evalTrigger(inputs, priorTriggerState)` — S7 (armed/fired/cleared + reasons; carries its
  constants into the returned record fields).
- `spendDownPlan(sortedCandidates, catalog, money, nfgState)` — S10 step 1's buy list for one
  pass (discrete-then-NFG, cap).
- `buildDecisionRecord(kind, inputs)` — S9's shape.
- `planPass(...)` — extended: `join[]` (proactive), `donate`, `work` carries the S5 faction,
  spend-down branch, `install-ready` + `installing` phases; reserve amount per S6/S10.

Main loop additions, in existing style (every new Singularity call inside the two-tier
try/catch): read mode file + favor per joined faction + `getFavorToDonate` once per pass;
update rep rates; evaluate trigger after `planPass`; append decision records on transitions
(ring-capped rewrite, same pattern as other ring logs); execute `donate` actions; in auto
mode run spend-down phases and the `installer.js` exec per S10. State file (S11(23) shape)
gains: `mode`, `campChoice`, `workFaction`, `favor` map, `trigger` {armed, firedAt,
sustainMs, queuedGain, projection, repRate}, `endgameHold`.

### Work item 2 — `src/installer.js` (new) [code]

Per S10 step 3. Header: purpose (the one file allowed `installAugmentations`; exec'd only by
augfarmer's auto-mode branch; refuses to act unless `ratchet-mode.txt` reads `auto`), the
D11-relaxation pointer, measured RAM (post-live). ~80 lines: mode re-check → home RAM loop →
cores loop (both with transactions) → final decision record append → tprint summary →
`installAugmentations("bootstrap.js")` → unreachable-WARN tail.

### Work item 3 — `vite.config.ts` [code]

One export line: `ratchet-decisions.json` → `logs/ratchet-decisions.json` (comment: Phase 25 —
trigger/action audit trail, ring-capped; beside Slice 0's two ratchet lines).

### Work item 4 — tests [code]

`test/augfarmer.test.js` extensions + `test/installer.test.js` if any logic is extractable
(the mode-gate check is: pure `shouldRun(modeRaw)` — test it):

- `scoreAug`: hacking-only, exp-only (discounted), rep-only, mixed, all-1.0 ⇒ 0, allowlist ⇒
  `ALLOWLIST_SCORE`.
- `filterAugs`: score-positive kept; money/speed/chance/grow/charisma/company-only dropped
  (the old 10-key set's members that no longer qualify — regression-locking F2); NRMI kept;
  CashRoot/Blade's Simulacrum dropped; **The Red Pill dropped** (preserved test).
- `pickTarget`: rep-met-first ordering by score; `score/deficit` ordering incl. tie-breaks;
  prereq score inheritance (a low-score prereq for a high-score aug outranks a mid-score
  direct aug at equal deficit); shared-prereq dedupe keeps max score; NFG cap in/out;
  full-sorted-list return.
- `pickCamp`: reality rule (joined city wins); exclusive-seller scoring picks the right camp
  over a fixture graph; tie-break; **camp derivation is the ally (non-enemy) relation's
  connected components** — the fixture asserts the three-camp partition
  ({Aevum, Sector-12} / {Chongqing, New Tokyo, Ishima} / {Volhaven}) arises from a
  features-table-shaped enemy graph, and a deliberately shuffled enemy graph re-partitions
  accordingly (shuffle-proof, name-independent; regression-locks the cold review's B1).
- `planJoins`: all invite-pending no-enemy factions joined; cross-camp city excluded;
  chosen-camp city included; out-of-scope never (rail test preserved).
- `pickWorkFaction`: skips passive factions; skips donation-closable; falls back to head;
  respects joined-only.
- `updateRepRates`: EWMA math; first-sample bootstrap; missing faction.
- `evalTrigger`: gain floor blocks both paths (the early-cycle-degenerate-loop case, by
  fixture); plateau-fire at gain ≥ floor; horizon-fire needs measured rate (sample floor);
  `awaiting-money` never arms; endgame hold blocks; sustain accumulates and resets; clear
  emits (observe mode); **auto-mode latch**: once fired, spend-down/installing phases don't
  clear it, and only the mode-file/pause-file abort levers do; NFG projection math (`n` from
  price ladder vs money, queued NFG counted once via the live price — S7's boundary rule).
- `planPass`: donate gating (favor threshold, buffer, both-costs reservation, endgame
  exclusion); spend-down ordering + cap + NFG-cap lift; observe vs auto (observe never emits
  spend-down/exec actions — **the rail test**); install-ready phase.
- `buildDecisionRecord` shape; ring cap behavior.
- `verify-transactions`: `auto-donation` + `home-cores-upgrade` accepted.
- New `test/verify-ratchet.test.js` in the `verify:log` family (skip-if-missing like its
  peers): `logs/ratchet-log.json` parses, records carry paired `pre`/`post` +
  `deltaMultHacking` finite; `logs/ratchet-decisions.json` parses, records carry
  kind/timestamp/mode/inputs, length ≤ cap.

### Work item 5 — doc reconciliations [code]

Per S13, staged with the work.

## Live procedure [live]

Pre-step: items 1–5 merged locally, `npm test` green, dev server healthy, `dist/src/` byte
check on both scripts.

- **L1 — Launch + RAM.** Claude restarts `daemon.js` over CDP. Farmer relaunches with the new
  header; `run ramcheck.js augfarmer.js installer.js` → S12 bands (55–70 / 12–22 GB); daemon
  flat. Figures recorded [code, comments]. `logs/ratchet-decisions.json` exporting.
- **L2 — Join spree + camp.** Within a few polls: every invite-available no-enemy scope
  faction joined (tprints + Factions page); `campChoice` in the state file reads
  {Aevum, Sector-12} (the reality rule — Aevum is already joined this cycle); zero cross-camp
  joins; a proactive travel (if any fires, e.g. Tian Di Hui) lands one `auto-travel`
  transaction and a join.
- **L3 — Targeting + work split.** State file: target ordered by the new score key (spot-check
  the top 3 against `augcheck.js` numbers); `workFaction` differs from the buy target's
  faction when the head target is a passive faction and a city/endgame target needs grinding.
- **L4 — Donation (opportunistic, non-blocking).** Fires only when a non-Daedalus faction
  crosses 150 favor with a deficit target — may not occur this cycle. If it does:
  `auto-donation` transaction, deficit collapses next pass, buy follows. Unit tests carry the
  logic either way; first live occurrence noted in CHANGELOG (sanity-check the credited rep
  equals `repFromDonation`'s prediction — the S6 fork-vs-upstream residual).
- **L5 — The observe-mode install cycle (the phase-close gate, S11).** On the trigger's first
  `install-ready`: Kenneth reads the tprint + decision record and judges it (too early / about
  right / too late — his judgment is the validation datum; log it in the close-out). Then he
  runs his normal manual install runbook. Post-install verify: `ratchet-log.json` gained the
  paired boundary record; decision log coherent; farmer reset cycle state; passively confirm
  `bootstrap.js` (and the library) is still on home post-install — expected, since open
  question (a) is resolved as "scripts survive"; this is a free spot-check, not a
  decision-bearing probe.
- **L6 — Soak.** ≥30 min: no per-poll terminal chatter; `npm run verify:log` green including
  `verify-ratchet` + the new expense sources; no out-of-scope join, no cross-camp join, no
  reservation staleness WARNs.
- **L7 — Stage-2 first fire (post-close-out, from the BACKLOG entry — not a phase gate).**
  When Kenneth writes `auto` into `ratchet-mode.txt`: observe the full chain once —
  spend-down records + fleet-freeze reservation, installer exec, home RAM/cores transactions,
  install fires, `bootstrap.js` relaunch via cbScript, ratchet-log boundary pair. Any
  deviation demotes the mode file back to observe and reopens the trigger design with the
  logged data.

## Acceptance criteria

- **`npm test` green** including work item 4's full list. [code, implementer clears]
- **Install rail (rewritten, verified):** `grep -rn installAugmentations src/` matches only
  `installer.js`'s single call site (+ comments); `installer.js` refuses to act outside auto
  mode (unit test on the mode gate); observe-mode `planPass` emits no spend-down/exec/install
  action on any fixture (the rail test). `joinFaction` still only in `augfarmer.js`. [code]
- **RAM recorded:** both scripts inside S12's bands in `logs/ramcheck-result.json`; figures in
  headers; daemon flat. [live artifact + code comments]
- **F1 observed:** L2's join spree, camp lock, zero cross-camp joins over the soak. [live]
- **F2/F3 observed:** L3's ordering spot-check + work/buy split. [live, from exported state]
- **Trigger validated at Stage 1:** ≥1 `install-ready` fire with a complete decision record;
  Kenneth's judgment on its timing logged; one manual install cycle's full audit trail
  (ratchet-log pair + decisions + transactions) verified from exported logs. [live — the
  phase-close gate]
- **`npm run verify:log` green** including `verify-ratchet` and the new expense sources.
  [live]
- **Doc reconciliations landed** per S13, including the reset-protocol rail rewrite. [code,
  checkable by reading the files]

## Files touched

**New:** `src/installer.js`, `test/verify-ratchet.test.js` (+ `test/installer.test.js` if the
mode gate is extracted pure).

**Edited:** `src/augfarmer.js` (+ `test/augfarmer.test.js`), `vite.config.ts` (one line),
`test/verify-transactions.test.js` (two sources), `docs/reset-protocol.md`,
`docs/reputation-favor.md` (one pointer), `docs/scripts.md`, `BACKLOG.md`,
`docs/phases/CHANGELOG.md`.

**Deliberately untouched (at spec-drafting time — see the 2026-07-15 close-out section for
what actually changed live that same day):** `src/ratchetlog.js` (Slice 0, shipped),
`src/dashboard.js` (phase strings flow through `augPanel`), `src/upgradehomeram.js` (stays
the manual utility; `installer.js` owns the automated path), the batcher core, `bootstrap.js`
(already the cold-start entry `cbScript` names).

## Open questions

- **(a) RESOLVED 2026-07-14 (Kenneth): home scripts survive the soft reset.**
  `reset-protocol.md`'s persistence table said wiped — corrected the same day (scripts kept
  across both reset types; only created/bought programs + TOR reset). Consequences stand as
  designed: `cbScript = "bootstrap.js"` delivers unattended recovery, Slice 0's
  `ratchet-last.json` boundary read works, and the in-game decision log persists (the
  `logs/` export was already the durable copy regardless — S9). L5 keeps a free passive
  spot-check only.
- **(b) RESOLVED 2026-07-14: favor does NOT multiply donation rep.** Read from upstream
  `bitburner-src` dev `src/Faction/formulas/donation.ts` (Kenneth-authorized): `donate()`
  credits exactly `repFromDonation` — divisor × `faction_rep` mult × BitNode mult, no favor
  term; favor only gates access at ≥150. So S6's `donationForRep(deficit)` is the exact
  cost, and `docs/reputation-favor.md`'s ×2.60-discount table was corrected to
  favor-independent costs (donate-to-20m now reads ~$11.8t, still trivial). Residual: L4
  sanity-checks the fork matches upstream on the first live donation.
- **(c) Full-auto vs prep-and-notify** — parked by the features file until observe-mode
  evidence exists (S2); observe's tprint + `install-ready` phase serves as the interim notify.
- **(d) S3's weights and S7's constants are provisional by design** — the decision log carries
  them precisely so the first cycles of data can re-derive better values offline; expect a
  small follow-up tuning change, not a redesign.

## Close-out (2026-07-15) — done vs. left

Everything below happened in one continuous live session, on the same BN1.2 save this spec
was designed for. **The clear succeeded** — `w0r1d_d43m0n` backdoored, confirmed via a
BitVerse-selection-screen screenshot. This section is the honest record of what actually
shipped and validated vs. what's still open, superseding the "Files touched" section's
`resourcemanager.js`/`daemon.js` "deliberately untouched" claim (both were touched, for
reasons below — that claim held at spec-drafting time, not by the end of the day).

### Done and live-validated

- **Everything in the original design** (S1–S13): score-based targeting, camp commitment
  (live-confirmed against the real six-city enemy graph), work-slot allocation, the
  generalized donation route, the install trigger (armed once for real — see "left" below),
  the endgame hold, the decision log, S12's RAM bands (augfarmer.js 64.1 GB, installer.js
  18.15 GB, both in-band; daemon.js flat at 16.3 GB).
- **Two real bugs found and fixed same-day**, both in `pickTarget`'s `wantedNames` filter:
  NFG was excluded from targeting entirely once any level was owned (it's repeatable, the
  filter didn't know that), and separately the one-NFG-per-cycle buy cap was also excluding
  it from *grinding* rep toward the next level (now decoupled via a `buyBlocked` flag —
  capped-for-buying no longer means capped-for-targeting). Both confirmed fixed live.
- **Scoring amendment**: `SCORE_W_MONEY`/`SCORE_W_SPEED` (0.15 each) added after ENM Analyze
  Engine/DMA Upgrade were found scoring 0 despite real income value — the original S3 design
  deliberately dropped `hacking_money`/`hacking_speed` entirely; Kenneth's live call was to
  weight them in at a discount, not drop them.
- **`UTILITY_ALLOWLIST` amendments**: CashRoot Starter Kit re-added (its $1M+BruteSSH.exe
  grant speeds up every future post-install bootstrap — a case S3's original trim didn't
  weigh); **The Red Pill added** — this is the big one, see "scope amendments" below.
- **A new Daedalus-endgame money reservation** (`daedalusInviteReserve`/
  `daedalusDonationReserve`, in `resourcemanager.js`'s `announceDiff` + `augfarmer.js`) —
  protects the $100b invite money gate before joining, then the live, shrinking donation
  cost after, without stalling early-cycle cloud growth (gated on `endgameHold`). Not in the
  original spec at all — added live when Kenneth found cloud-fleet growth was actively
  delaying the Daedalus rejoin.
- **`resourcemanager.js`'s reservation-change announce fixed** to stop spamming the terminal
  on amount-only drift (a moving-target reservation, which didn't exist before the Daedalus
  reservation, changes its dollar figure every poll by design — only label changes are a
  real transition worth a line).

### Scope amendments beyond the original spec (Kenneth's explicit, same-day authorization)

The original spec's "Decided-parked" section explicitly excluded Daedalus-endgame automation
("its own chunk, and we're not ready to test it"), and S3 explicitly preserved "The Red Pill
drops by construction" as a tested invariant across three phases. Both were reversed live,
in this order, each named individually before Kenneth authorized it:

1. **Auto-donate to Daedalus** (`shouldDonateToDaedalus`) — extends S6's already-live
   donation route to Daedalus specifically (previously excluded whenever `endgameHold`
   held). Confirmed live: fired autonomously the instant it was affordable ($914.3b).
2. **The Red Pill added to `UTILITY_ALLOWLIST`** — now auto-buys through the normal
   pipeline once rep clears, like any allow-listed aug. Confirmed live: bought for $0
   immediately after the donation landed.
3. **`src/backdoorwd.js` (new)** — auto-backdoors `w0r1d_d43m0n` once it exists and hacking
   clears its requirement, via the same `installBackdoor()` mechanism
   `backdoorfactions.js` already used for the four faction servers. Deliberately its own
   file (blast-radius isolation, same reasoning as splitting `installer.js` out of
   `augfarmer.js`) — this is the single most consequential automated action in the project,
   it ends the BitNode. Launched by `daemon.js` at startup. Confirmed live: fired
   unattended and ended the run correctly.

Auto-*install* (`ratchet-mode.txt` → `auto`, the spend-down + `installer.js` path) was
**deliberately left alone** for this run's final install — Kenneth installed manually, on
the reasoning that combining "first-ever live test of the untested auto-install path" with
"the run-ending install" was worse risk-adjusted than two separate manual installs already
proven to work. That path stays fully dormant and unexercised.

### Left — genuinely open, carries to the next BitNode/cycle

- **S11's phase-close gate, strictly read, is not fully met.** The trigger *armed* once
  (idle-plateau, gain 2.427×) but never sustained the full `TRIGGER_SUSTAIN_MS` (10 min)
  before Kenneth installed — it came within ~3 minutes. No `install-ready` *fire* was ever
  observed. Kenneth's manual timing judgment is the closest available substitute, informally
  captured in this session's conversation, not a decision record review as S11 specifies.
- **Auto-install (spend-down + `installer.js`) has never fired, at all, in any form.**
  Every other new/changed code path got at least one live rep today; this one didn't, by
  deliberate choice (see above). This is the standing open item for the next cycle.
- **`backdoorwd.js` has exactly one live data point** (this run) — correct on the first try,
  but "worked once" isn't the same confidence level as the rest of the controller, which
  found two bugs on its own first day.
- **S3/S7's constants remain provisional** (open question (d)) — one day of data, including
  today's amendments, isn't enough to re-derive them with confidence yet.

**Bottom line:** the phase is functionally complete and shipped a full, successful,
increasingly-automated BN1.2 clear — but calling S11's gate "met" would overstate what was
actually observed. Treat auto-install specifically as still unvalidated going into whatever
run comes next.
