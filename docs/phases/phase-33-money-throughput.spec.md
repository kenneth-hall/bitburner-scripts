# Phase 33 spec: aug purchase ordering + utility must-buys (Workstreams A + C)

**Stage:** spec (drafted fable 2026-07-21, from `phase-33-money-throughput.features.md`).
**Model flow:** brainstorm opus → this spec (fable) → cold review by `spec-reviewer` → implement (sonnet).
**Scope split (features OQ1, resolved):** this spec covers **Workstream A** (escalation-aware buy
ordering) **and Workstream C** (utility must-buy acquisition) — they are one subsystem
(`augfarmer.js`'s target/spend-down machinery) and C's fix is meaningless without A's ordering.
**Workstream B** (gang money-objective retargeting) is deferred to **phase 34**, whose features
work starts with the Formulas money-at-task probe (features OQ2); nothing here touches
`gangmanager.js`. Features OQ3 (install-time home-RAM sweep) was already resolved in the features
doc: dropped, `installer.js` handles it.

## Context

Money throughput is the sole blocker to BN2.1 (M = 1.51 of ≈16.7; income ~$3.1M/s flat), and the
aug buyer overpays structurally. Two facts were **measured at spec stage** (features asked for
verification before quoting numbers):

1. **The ×1.9 escalation is exact and confirmed live.** Every `auto-aug` `paid` in
   `logs/transactions-2026-07-20/21.json` equals vanilla base × 1.9^(buys so far this cycle) to
   the dollar (e.g. pending OmniTek $37.467b = $2.875b × 1.9⁴; the live QLink price
   $325.8025t = $25t × 1.9⁴). Escalation is uniform across the whole catalog, so **sorting by
   live price is identical to sorting by base price** — *for ordering*. Absolute thresholds
   (fundability, must-buy cost) are a different matter: `augfarmer.js` freezes discrete catalog
   prices per join-state (rebuild gate L1681; only NFG is re-read each pass, L1704), so this
   spec adds a per-pass price refresh (decision 11) — cold-review blocker resolved.
2. **Magnitude: worse than the memo's ~2.2×.** Both observed cycles ran perfectly
   ascending-base order (the exact worst case). This cycle's 5-aug basket: **$58.17b paid vs
   $18.15b optimal (3.2×)**. Prior cycle's 7-aug basket: **$8.18b vs $0.99b (8.3×)**.

**New live finding (this spec's third driver):** the farmer's current head target is **QLink at
$325.8t**, phase `awaiting-money` for 90+ minutes (`logs/augfarmer-state.json`,
`logs/goal-state.json`). The settled "QLink deferred" decision was never enforced in code —
score-DESC sorting picks it (score 0.75, the catalog's highest) the moment rep clears 1.875m.
At $3.1M/s that is a ~3.5-year save; the cycle only ends when Phase 31's stall-arming fires
(12–48h), and QLink's reservation is what has the fleet frozen at $0. A naive price-DESC flip
would make this *permanent* (QLink is always the most expensive rep-met aug), so Workstream A
must ship with a **fundability guard**, not just a new sort key.

Workstream C's starvation mechanism is now precise: all three `UTILITY_ALLOWLIST` augs are sold
by NiteSec and rep-met (`logs/gangaugs-1784565947624.json`: CashRoot 12.5k rep / Neuroreceptor
75k / Red Pill 2.5m, vs ~18m banked), but score 0.25 keeps them below every hacking aug, so they
are only reachable via spend-down — by which time escalation has multiplied their prices
(CashRoot ≈ $11b at ×1.9⁷) and install #14's spend-down bought **nothing at all**. Buying them
early instead is the worse trade: a purchase's ×1.9 applies to *everything after it*, so a cheap
aug bought first taxes the whole remaining basket (~0.9 × basket ≈ +$16b/aug at current basket
size). The optimal slot for cheap must-buys is **last among discretes, guaranteed before the
install** — which is what this spec builds.

## Ground rules

- **`augfarmer.js` RAM must measure unchanged (64.10 GB).** Every behavioral change is in pure
  exported functions or uses ns surface the file already pays for (`ns.read` via `readJSON` for
  the one new file read). Any surprise is checked against the identifier-hygiene bug class first.
- **Identifier hygiene:** new identifiers are `fundCap`, `fundCapSource`, `fundBlocked`,
  `mustBuyNames`, `mustBuyCost`, `mustBuyTotal`, `incomePerSec`, `lastCappedAug`,
  `holdWaivedLogged` — none collide with an `ns.*` method name; keep it that way in
  implementation (no `ls`/`ps`/`run`/`share`-class short names).
- No new Singularity call sites; no daemon/dashboard changes; **dashboard untouched** (Phase 24
  gate — observability for this phase goes to `augfarmer-state.json` and
  `ratchet-decisions.json`, both existing files with tolerant readers).
- Purchases keep flowing through the existing buy sites — `recordTransaction` call sites are
  unchanged (ordering changes *when*, never *whether/how* a spend is logged).
- Tests: vitest units for every pure-function change; `npm run verify:log` stays green
  (`verify-ratchet.test.js` has no decision-kind whitelist — verified — so new kinds need no
  checker edit); live validation steps marked **[live]**.
- No game-source reading; all numbers above come from our own exported logs and API reads.

## Spec-stage decisions

1. **Sort design (features A-Q1): tiered rep-met ordering, price-DESC primary.** `pickTarget`'s
   rep-met group becomes four tiers: **tier 0** — buyable discretes (non-NFG, not
   `buyBlocked`, not `fundBlocked`) sorted **price-DESC**, score-DESC tie-break, then name;
   **tier 1** — NFG when not `buyBlocked`; **tier 2** — `fundBlocked` discretes (price-DESC for
   determinism); **tier 3** — `buyBlocked` NFG. The deficit>0 group and its score/deficit sort
   are untouched. "Which augs" stays `passesFilter` + allowlist (unchanged); only order moves.
   Cheap must-buys (score 0.25, incl. the $0 Red Pill) land naturally at tier 0's *bottom* —
   bought last among discretes, which is the escalation-optimal slot.
2. **NFG stays last (features A-Q2, confirmed).** NFG never competes in tier 0's price battle;
   it heads the list only when every fundable discrete is bought (normal-phase D3 single buy),
   and spend-down keeps discretes-then-NFG. Rationale: NFG's per-level gain (~1%) never
   justifies paying ×1.9 on the remaining discrete basket.
3. **Fundability guard: `fundCap = money + lookahead`,** where `lookahead = incomePerSec ×
   FUNDING_HORIZON_MS/1000` when income is readable, else `FUND_CAP_FALLBACK = 500e9`. The
   fallback is **additive to money**, preserving the invariant `fundCap ≥ money` — an
   already-affordable aug can never be fundBlocked (cold-review minor 3). A **rep-met**
   (`deficit ≤ 0`) non-NFG candidate with live `price > fundCap` is marked `fundBlocked`;
   deficit>0 candidates are never marked (their group and its rep-grind semantics are untouched
   — cold-review minor 4). Income comes from `goal-state.json`'s `income.perSec` (Phase 32's
   sampler — a **standing daemon-supervised resident** (`RESIDENT_COMPANIONS`), not tied to the
   dashboard being open), read with the existing tolerant `readJSON`; snapshot older than
   `GOAL_STALE_MS = 600_000` or unreadable → fallback, recorded as `fundCapSource:
   "income"|"fallback"` in the state file so the silent-fallback mode is observable
   (cold-review minor 6). **`FUNDING_HORIZON_MS = 4 * 3600_000` (4h), provisional:** long enough that a
   fresh cycle's biggest base aug ($7.5b ≈ 40 min at measured income — features A-Q3's
   "first-buy delay", quantified: negligible) is always fundable; short enough that a
   deep-escalated aug defers to next cycle's reset price instead of pinning an hours-long dead
   save (deferring is a ~1.9^k discount, so deferral is almost always right past k≈2). This
   guard is also what *enforces the settled QLink deferral*: QLink re-enters automatically only
   if income × 4h ever reaches ~$25t, and Kenneth can revisit sooner by editing one constant.
4. **`planPass` gains an explicit fundBlocked-head branch.** When the head target is
   `fundBlocked`: no buy, no reserve-for-target, **no donation** (donating rep toward an
   unfundable aug is dead spend), fall through to the normal work-slot logic, phase
   **`"grinding"`** — deliberately, so evalTrigger's existing gap-7 path (`grinding` + no
   rep-owed faction → `phaseArmed`) lets gain-arming end the cycle; a new phase label would
   need new trigger plumbing for zero benefit. The branch **emits `reserve = money`** (the
   spend-down-fuel freeze): end-of-cycle money belongs to the imminent spend-down (must-buys +
   NFG tail), and releasing it would let `cloudmanager` buy fleet RAM the install is about to
   wipe. This matches the features' adjacent-lever decision ("leave the fleet frozen") while
   killing the pathological $325t reservation. `normalBuyAvailable` (the gate-fill precondition)
   gains `&& !target.fundBlocked`.
5. **Must-buy set = `UTILITY_ALLOWLIST`, unchanged (features C-Q1/C-Q4 resolved).** The
   dropped-list audit: BitRunners Neurolink (grants FTPCrack + relaySMTP) already passes the
   score filter on its real hacking mults — no action needed; PCMatrix (believed
   QoL-program-grants only, no port opener) stays dropped — if Kenneth ever wants it, adding
   the name to `UTILITY_ALLOWLIST` is the entire change, which is exactly why the must-buy tier
   keys off the allowlist rather than a new list or a score change (scores stay mult-based;
   utility value is not a mult). C-Q3 (CashRoot compounding): its per-install value is $1M + a
   free BruteSSH at t=0 of every future bootstrap — modest, but the purchase is **once per
   node**, so any bounded price is amortized across every remaining cycle; no further
   quantification needed to justify a one-time buy.
6. **Must-buy guarantee = trigger hold + spend-down-first (features C-Q2, decided against the
   features' first-claim lean).** The features leaned "first claim on money each cycle (cheap,
   barely moves escalation)" — that lean is **arithmetically wrong**: escalation is a flat ×1.9
   per purchase regardless of the purchased aug's price, so buying a $125m aug early taxes the
   remaining basket ~0.9 × its total (+$10b's), while buying it last costs only its own
   escalated price (~$1.6b at this cycle's ×1.9⁴). Mechanism instead: (a) **evalTrigger hold** —
   new inputs `mustBuyCost` and `mustBuyCap`. `mustBuyCost` is the **sequential-escalation
   total** of the unowned, allow-listed, rep-met-candidate augs in their planned (price-DESC)
   order — `Σ price_i × 1.9^i` (0-indexed) over **live** prices, via a pure, unit-tested helper
   `mustBuyTotal(prices)` — because each must-buy escalates the next ×1.9, so a flat Σ
   understates the real spend and voids the guarantee (cold-review major 2). While
   `0 < mustBuyCost ≤ mustBuyCap` and `money < mustBuyCost`, suppress
   `gainArmed`-and-`stallArmed` arming (**`gateArmed` is exempt** — A2 unlock installs stay
   narrow and next cycle retries at reset prices). `mustBuyCap = incomePerSec ×
   MUSTBUY_HOLD_MAX_MS/1000` (`MUSTBUY_HOLD_MAX_MS = 6 * 3600_000`; fallback
   `MUSTBUY_HOLD_CAP_FALLBACK = 25e9`) bounds the worst-case install delay to ~6h so a
   deep-escalated must-buy can never deadlock stall-arming — over the cap, the hold is waived
   and logged. (b) **`spendDownPlan` plans must-buys FIRST** (among themselves price-DESC,
   Red Pill $0 last), then the other rep-met discretes in sorted order, then NFG. First — not
   last — because plan-time prices drift ×1.9 per executed buy and a last-place plan can fail
   at execution; first-place prices are exact, making the hold's `money ≥ mustBuyCost` a real
   guarantee. Cost: the one spend-down that still has unowned must-buys pays ×1.9^m on its
   remaining tail (m ≤ 3, ≈2.5 fewer NFG levels, **once per node**) — guarantee beats it.
   Current live arithmetic (sequential, at this cycle's ×1.9⁴ base escalation): Neuroreceptor
   $550m × 1.9⁴ = $7.17b, then CashRoot $125m × 1.9⁵ = $3.10b, then Red Pill $0 =
   **$10.27b ≤ money $11.9b — the hold is already satisfied**, so the first post-ship install
   buys all three.
7. **Gang equipment is a separate price track (features A-Q4, confirmed).** `docs/gang-api.md`:
   `getEquipmentCost` applies `equipmentCostMult` (a gang-side multiplier) — aug purchase count
   appears nowhere in it. No coupling; nothing in this phase touches gang spend.
8. **Install cadence will shorten — flagged deviation (features A-Q3's second half).**
   Expensive-first means `queuedGain` crosses `MIN_TOTAL_GAIN` (1.1) in fewer buys, so gain-fires
   come earlier and cycles get shorter/cheaper (escalation resets more often — that is the
   point). Coupling to watch, not redesign: each install decays gang hack-ascension mults
   ×0.9747 (BACKLOG's open cadence question); `MIN_TOTAL_GAIN` already floors per-install gain
   at ~10%, which keeps the trade positive. The BACKLOG cadence check (ascensions per install)
   becomes *more* worth running after this ships — noted there, not built here.
9. **Observability: three new `ratchet-decisions.json` kinds, state-file fields, no dashboard.**
   Kinds: `target-capped` (head became fundBlocked — logged on rising edge, tracked via a
   `lastCappedAug` local: log when the head is fundBlocked and differs from `lastCappedAug`,
   clear the local when the head isn't fundBlocked), `mustbuy-hold` (arming suppressed — logged
   on the hold state's rising edge, with mustBuyCost/money), `mustbuy-hold-waived` (cost over
   cap — logged once per cycle via a `holdWaivedLogged` boolean). All three locals reset in the
   existing `lastAugReset`-boundary block (the `nfgBoughtThisCycle` pattern) — cold-review
   minor 5. State target block gains `fundBlocked` (bool), the pass's `fundCap`, and
   `fundCapSource`; the `next-aug` finance reservation under a fundBlocked head reads
   `amount = money` (display consequence of decision 4, accepted).
10. **Red Pill install triggers the standing WD checkpoint (CLAUDE.md).** The first post-ship
    install queues The Red Pill (decision 6's arithmetic), so `w0r1d_d43m0n` becomes readable
    the moment it lands. A tiny read-only probe ships with this phase to answer the 15,000-gate
    inference immediately (pre-authorized probe rule; it is the cheapest information this phase
    can buy).
11. **Per-pass price refresh (cold-review blocker 1).** The catalog's discrete prices freeze at
    build time (rebuild only on join-state change; only NFG re-reads each pass), so mid-cycle
    they are stale by the cycle's full ×1.9^k — a literal "Σ catalog prices" for the must-buys
    would read ~$675m against a real ~$10.3b, releasing the hold ~13× early, and fundability
    would compare base-ish prices against `fundCap`, never deferring an escalated aug. Fix at
    the root: **each pass, before `pickTarget`, refresh `catalog.augs[name].price` for every
    unowned aug via `ns.singularity.getAugmentationPrice(name)`** (try/catch per name, keep the
    stale value + one WARN on failure — the NFG-refresh pattern at L1700, generalized).
    `getAugmentationPrice` is already in the file's paid RAM surface (L1854/L2250), so R1 is
    unaffected; ~90 extra 0-added-RAM calls per 10s pass is noise. Sort order was never at risk
    (escalation is uniform), but every absolute threshold in this spec — `fundCap` comparisons,
    `mustBuyCost`, spend-down affordability — now runs on live prices, and the head's
    `livePrice` can no longer disagree with its own catalog entry.

## Design

### Work item 1 — `pickTarget`: fundability + tiered sort [code]

New parameter `fundCap` (number, `Infinity` when the caller has no cap). Candidate records gain
`fundBlocked: !info.isNFG && deficit <= 0 && price > fundCap` (rep-met candidates only, per
decision 3 — the deficit>0 group is never marked). Replace the rep-met branch of the comparator with
the tier key from decision 1 (tier asc, then price-DESC / score-DESC / name inside tiers 0 and
2; tier 1/3 are singleton-NFG). Deficit branch unchanged. Pure; existing callers in tests pass
`Infinity` to preserve old grouping where the tier change isn't under test.

### Work item 2 — `planPass`: fundBlocked branch + gate-fill guard [code]

Per decision 4. Branch placement: after the D11 scope check and status checks, before the
`repMet` computation — `if (target.fundBlocked)` → push `{type: "reserve", amount: money, aug,
faction}`, run the existing slot/work logic, return `{actions, reserve: money, phase:
"grinding"}`. `normalBuyAvailable` in the main loop gains `&& !target.fundBlocked`.

### Work item 3 — `evalTrigger`: must-buy hold [code]

New inputs `mustBuyCost = 0`, `mustBuyCap = Infinity`. `const mustBuyHold = mustBuyCost > 0 &&
mustBuyCost <= mustBuyCap && money < mustBuyCost;` then
`armed = (gainArmed && phaseArmed && !mustBuyHold) || gateArmed || (stallArmed && !mustBuyHold)`.
Expose `mustBuyHold` (and the two inputs) in the returned state for logging/tests. Sustain,
latch, and abort logic untouched.

### Work item 4 — `spendDownPlan`: must-buys first [code]

New parameter `mustBuyNames` (Set, default empty). Plan order: (1) rep-met candidates whose
name is in `mustBuyNames`, price-DESC (Red Pill's $0 naturally last of them), (2) remaining
rep-met discretes in the caller's sorted order (skip already-planned names), (3) NFG tail
unchanged. Affordability (`price > remaining → skip`) and `SPEND_DOWN_BUY_CAP` apply throughout.

### Work item 5 — main-loop wiring [code]

- **Price refresh first (decision 11):** each pass, after the NFG live-read block, refresh
  `catalog.augs[name].price` for every unowned aug via `getAugmentationPrice` (per-name
  try/catch, stale-keep + single WARN on failure).
- Once per pass: read `goal-state.json` via `readJSON`; `incomePerSec` = its `income.perSec`
  when the snapshot's `timestamp` is within `GOAL_STALE_MS`, else null. `fundCap = money +
  (incomePerSec != null ? incomePerSec × FUNDING_HORIZON_MS/1000 : FUND_CAP_FALLBACK)` per
  decision 3; pass into `pickTarget`; record `fundCapSource`.
- `mustBuyNames` = `UTILITY_ALLOWLIST` members not in `ownedSet` whose candidate exists with
  `deficit <= 0`; `mustBuyCost = mustBuyTotal(their live prices sorted DESC)` (decision 6);
  `mustBuyCap` per decision 6. Feed both into `triggerInputs` and `mustBuyNames` into the
  `spendDownPlan` call.
- Decision records + per-cycle latches per decision 9 (`lastCappedAug`, hold rising edge,
  `holdWaivedLogged`; all reset in the `lastAugReset`-boundary block).
- State record: `fundBlocked`, `fundCap`, `fundCapSource` fields on the target block.
- New constants exported next to the existing ones: `FUNDING_HORIZON_MS`, `FUND_CAP_FALLBACK`,
  `GOAL_STALE_MS`, `MUSTBUY_HOLD_MAX_MS`, `MUSTBUY_HOLD_CAP_FALLBACK`; add all five to
  `buildDecisionRecord`'s `constants` block.

### Work item 6 — `src/wdgate.js`: WD gate probe (new, read-only) [code]

~15 lines: `ns.getServerRequiredHackingLevel("w0r1d_d43m0n")` (plus `hasRootAccess`/
`getHackingLevel` context) inside a try/catch (the server may not exist pre-Red-Pill — report
that, don't crash), written to `logs/wdgate-<epoch>.json` + a one-line `tprint`. Add the
download-filter line to `vite.config.ts` and a `docs/scripts.md` row. Base API only; expected
RAM ≈ 1.75 GB (gate ≤ 2.0).

### Work item 7 — tests [code]

- `test/augfarmer.test.js`: **pickTarget** — tier ordering (expensive-first head; NFG after
  discretes; fundBlocked sorts behind NFG; $0 utility aug last in tier 0; deficit group
  untouched), fundCap boundary (`price === fundCap` is fundable), `Infinity` cap preserves
  rep-met-before-deficit grouping. **planPass** — fundBlocked head: no buy/donate actions,
  `reserve === money`, phase `"grinding"`, work action still emitted; observe-mode rail
  untouched. **evalTrigger** — hold suppresses gain- and stall-armed but not gate-armed; hold
  releases when `money ≥ mustBuyCost`; cost-over-cap waives; defaults (no inputs) change
  nothing. **spendDownPlan** — must-buys planned first despite sort position; Red Pill $0 last
  among must-buys; NFG still last; budget/cap respected; empty `mustBuyNames` reproduces
  today's plans (regression pin). **mustBuyTotal** — sequential ×1.9 arithmetic pinned exactly
  (the decision-6 worked example as a fixture); empty list → 0. **fundCap invariant** — a unit
  on the wiring formula (extracted as a pure helper) pinning `fundCap ≥ money` under both
  income and fallback sources.
- Existing sort-order assertions that pin score-DESC/price-ASC get updated to the new tiers —
  each updated assertion cites this spec in its comment.
- `npm run verify:log` unchanged in shape; run against real logs post-deploy (T2).

### Work item 8 — docs [code]

`BACKLOG.md`: note under the gang Tier-4 survivor entry that the ascension-cadence check gains
urgency from decision 8; add a line to the NFG-tail entry that spend-down order now has a
must-buy head. `docs/scripts.md`: `wdgate.js` row. Phase docs graduate to `docs/phases/` +
condensed `CHANGELOG.md` entry staged with the ship commit.

## Live procedure [live]

- **L1 (de-stall, immediate):** after deploy + `node tools/bb/cli.mjs restart augfarmer.js`,
  within one poll `augfarmer-state.json` shows the target no longer QLink-with-$325t-reserve:
  either a fundable head (biggest live-price rep-met aug ≤ fundCap ≈ $57b at current income) in
  `awaiting-money`, or a `fundBlocked` head in `grinding` with `reserve = money`; a
  `target-capped` record appears in `ratchet-decisions.json`.
- **L2 (first install, expected within ~hours via gain- or stall-fire):** the spend-down's
  transaction records show **Neuroreceptor → CashRoot → The Red Pill first** (in that order),
  before any other `auto-aug`/NFG record of that spend-down; post-install `auginfo.js` shows all
  three owned. This closes C's 14-install starvation.
- **L3 (WD checkpoint, immediately after L2's install):** run `wdgate.js` from home over CDP;
  `logs/wdgate-*.json` records `w0r1d_d43m0n`'s required hacking level — resolving the 15,000
  inference (~85% → measured). Whatever the number, it goes into CLAUDE.md's goal line /
  `docs/bitnodes.md` as part of this phase's close-out.
- **L4 (ordering, across the first full post-install cycle):** the cycle's `auto-aug` `paid`
  sequence divided by 1.9^(position) is non-ascending — i.e. base prices descend (spot-check
  arithmetic against the transactions log, the same check that verified the escalation here).
- **L5 (soak):** one unattended day — no trigger flapping from fundCap noise (10-min smoothed
  income makes this unlikely; if a head flaps near the boundary, widening
  `FUNDING_HORIZON_MS` is the knob), stall warnings sane, `mustbuy-hold` records only while
  `money < mustBuyCost`.

## Acceptance criteria

Test-gated (Claude clears): **T1** `npm test` green including every work-item-7 unit; **T2**
`npm run verify:log` green post-deploy against real logs.

RAM-gated [live]: **R1** `augfarmer.js` unchanged at 64.10 GB (`ramcheck.js`); **R2**
`wdgate.js` ≤ 2.0 GB. Surprises checked against identifier-hygiene first.

Live-gated [live]: **V1** = L1; **V2** = L2; **V3** = L3 (the reading exists — its value is
information, not a pass/fail); **V4** = L4; **V5** = L5.

Ship gate per CLAUDE.md: T1/T2 self-cleared; R*/V* wait on Kenneth's in-game run; then merge +
push without further sign-off. L2/L4 span real cycles — V2/V4/V5 may land a day after the code
ships; the merge waits only on R1/R2 + V1 (the rest are follow-up checks logged in the
close-out, since reverting the sort is a one-commit rollback if V4 shows wrong order).

## Files touched

- `src/augfarmer.js` — pickTarget tiers + fundCap, planPass branch, evalTrigger hold,
  spendDownPlan must-buy head, main-loop wiring, five new constants
- `src/wdgate.js` — **new** read-only probe
- `vite.config.ts` — one filter line (`wdgate-*.json`)
- `test/augfarmer.test.js` — new/updated units per work item 7
- `BACKLOG.md`, `docs/scripts.md` (+ CHANGELOG/doc graduation at ship)

## Open questions (log, don't block)

1. **`FUNDING_HORIZON_MS`/`MUSTBUY_HOLD_MAX_MS` are provisional heuristics.** The economically
   exact rule ("defer aug X iff its escalation premium exceeds the value of owning it one
   install sooner") needs a value model for M-progress-per-day that doesn't exist yet; the
   horizon guard is the simple bound that captures ~all of the win. If live cycles show long
   dead saves or premature fundBlocked heads, tune the constants — redesign only if tuning
   fails twice (the "three invalidations" rule).
2. **QLink re-entry** is now governed by the fundability guard (income × 4h ≥ ~$25t) — it will
   effectively never self-lift in BN2.1, which matches the settled deferral; buying QLink, if
   ever, is a Kenneth decision executed by a one-constant edit or a manual purchase.
3. **PCMatrix / full dropped-list description audit** (features C-Q1's tail): believed
   QoL-only, skipped. If a future phase wants it, the audit method is reading NiteSec's aug
   descriptions in-game (CDP, read-only) — stats can't show non-mult effects.
4. **Cadence coupling** (decision 8): if installs come much faster post-ship, run BACKLOG's
   ascension-per-install cadence check before worrying — the data (`gang-rate-log.json`,
   `ratchet-log.json`) is already being collected.
