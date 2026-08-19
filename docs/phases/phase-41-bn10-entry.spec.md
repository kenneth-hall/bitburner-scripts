# Phase 41 — BN10 entry: getting to Bladeburner (SPEC)

**Stage 2, revision 2** (cold-reviewed 2026-08-17; revision 1's blockers addressed — see §8 for the
changelog). Derived from [`phase-41-bn10-entry.features.md`](phase-41-bn10-entry.features.md); read
that first, this document does not restate its reasoning.

**Deliverable in one line:** an unattended engine that takes the run from *node entry* to
`joinBladeburnerDivision() === true` by sequencing grafts and combat grinding on the single
player-action slot, then stands down cleanly.

---

## 1. Scope

### In scope
- Home-RAM unblock (features D6).
- A **graft planner** computing the optimal ladder into a plan file.
- A **slot-owning entry engine** executing graft → grind → join as a state machine.
- Quiescing `augfarmer.js` (D3); making `ratchet-mode.txt` an explicit BN10 decision (D3a).
- Registering grafting as the **fifth** player-action-slot claimant.

### Explicitly NOT in scope
- The Bladeburner rank grind, skill buying, black-op ladder (existing scripts, untouched).
- **The sleeve-parallelism probe** — runnable the moment this phase succeeds; it is the *next*
  phase's opening move.
- Sleeve purchasing (D4).
- Retargeting `augfarmer.js`'s scoring function (Q41-5, deferred past the join).
- `daemon.js` batcher logic.

🔴 **Carried-forward commitment that must NOT be lost by being out of scope.** Q41-4 (sleeve
**memory** upgrades) is deferred, but its wake condition is *"expires at Bladeburner join, at which
point it must be priced explicitly rather than forgotten"* — and the join is **this phase's
deliverable**. Memory is the only **BN10-exclusive, permanent-across-all-future-nodes** purchase
available. **Acceptance Z1: the close-out must price it explicitly or restate the deferral with a
new date.** Deferring it silently is the failure mode this bullet exists to prevent.

---

## 2. Architecture

### 2.1 RAM forces a planner/executor split — re-derived post-WI1

A single script covering catalog reads, prerequisite checks, grafting, crime, travel and the join
needs ≥53 GB (see §5's itemisation). WI1 raises home to **64 GB**, which still cannot host that
alongside `daemon.js` (~16.5 GB) and its companions. **The split stands after WI1, not just before
it.**

**A1 — planner and executor are separate scripts communicating through `graft-plan.json`.**
- `graftplanner.js` — pays catalog/price/time/stats/prereq RAM once, writes the plan, **exits**.
- `bn10entry.js` — resident, reads the plan, owns the slot, never reads the catalog.

**A1a — 🔴 WITHDRAWN 2026-08-17 (measured RAM failure).** ~~The planner runs on the FLEET, not home.~~
It cost **3.05 GB** in the executor and was already cold-review blocker 9 ("never run concurrently"
is unachievable when the executor is a resident holding its RAM whether idle or not). **Replaced by
a request file:** the executor writes `graft-replan-request.txt` and keeps running its existing
plan; `graftplanner.js` is launched separately (by hand or by `daemon.js`'s supervisor), which makes
"never concurrent" true **by construction** rather than by an unenforceable rule.

[SUPERSEDED] **A1a — the planner runs on the FLEET, not home.** Singularity and Grafting calls carry no
home-only requirement (`upgradehomeramonce.js`'s header records this). The executor `exec`s it to a
fleet host with enough free RAM. ⚠️ Revision 1 said "exec when idle"; a resident holds its RAM
whether idle or not, so that was unachievable. If no fleet host fits, the executor logs
`planner-no-host` and continues on the existing plan rather than failing.

### 2.2 Slot ownership

**A2 — `bn10entry.js` claims `SLOT_HOLD_FILE` (`bladeburner-slot-hold.json`) and REFRESHES it every
≤10 s.** `SLOT_HOLD_MAX_AGE_MS` is **30_000** (`bladeburnermanager.js:48`) and every consumer
**fails open** on a stale marker (`augfarmer.js:768`, `backdoorfactions.js:89`); existing holders
refresh at `HOLD_REFRESH_MS = 10_000` (`bbblackop.js:47`). A single write leaves a multi-hour graft
unprotected after 30 seconds.

**A2a — `waitForOngoingGrafting()` is FORBIDDEN.** It blocks, so it cannot refresh the hold. Poll
`getCurrentWork()` on the main loop cadence instead.

⚠️ **Logged gap:** `bladeburnermanager.js` *writes* the hold rather than reading it. Survivable only
because it cannot run before the join — i.e. **it becomes a real conflict the moment this phase
succeeds**. The follow-on phase must make the hold bidirectional. → `BACKLOG.md`.

### 2.3 🔴 Grafting cancels in-flight work — the central hazard

`markdown/bitburner.grafting.graftaugmentation.md`, verbatim: *"You must be in New Tokyo to use
this. **When you call this API, the current work (grafting or other actions) will be canceled.**"*
Money is charged **up front**.

**A3 — a `GRAFTING` state, gated on `singularity.getCurrentWork()`, is mandatory.** While a graft is
in flight, the executor must issue **no** work-cancelling call. That prohibition covers *all* of:
- re-issuing `graftAugmentation` (would forfeit the payment and pay again),
- `commitCrime` (the `grind` branch),
- `travelToCity`,
- releasing the slot in `ns.atExit`,
- the R5 stand-down path.

**A3a — stand-down and exit LET AN IN-FLIGHT GRAFT FINISH.** `bn10entry-off.txt` and process exit
stop the engine from starting *new* work; neither cancels a paid graft. (A hard-kill is outside our
control and is accepted.)

---

## 3. Work items

### WI1 — Home-RAM unblock

**Build:** no new code — use `upgradehomeramonce.js` (one tier, spend-capped, and it already calls
`recordTransaction` at `:46`, verified).

⚠️ **Its `MAX_SPEND` default is `$500e6` and it silently prints `REFUSED` and returns above that.**

**Ordering rule:** WI1 runs **before** the first graft, from the same wallet. Rationale: the
executor needs ~22 GB and cannot run at all otherwise.

**Acceptance:**
- A1. `ns.getServerMaxRam("home") >= 64`.
- A2. Expected resident set fits and is observed live via `ps`: `daemon.js`, `resourcemanager.js`,
  `cloudmanager.js`, `transactionsmonitor.js`, `goallog.js`, `dashboard.js`, `bn10entry.js`.
  ⚠️ `augfarmer.js` (64.10 GB alone) is **excluded by design** — WI4 pauses it. Revision 1's "no
  `waiting-ram` log line" criterion is **withdrawn**: those events are FIFO-evicted from
  `daemon-batch-log.json` within minutes, so absence is not evidence.
- A3. A `transactions-*.json` record exists with the home-RAM upgrade's source tag and a non-zero
  amount.
- A4. If the tier price exceeds `MAX_SPEND`, the run raises the cap **explicitly and logs it** —
  the `REFUSED` path must not be mistaken for "already upgraded".

---

### WI2 — `graftplanner.js`

**Exported pure core (unit-tested, no `ns` calls):**

```js
/** @typedef {{strength:number,defense:number,dexterity:number,agility:number}} CombatQuad */

export function expForLevel(level: number, effectiveMult: number): number
// e^((level/effectiveMult + 200)/32) − 534.6

export function remainingExp(
  mults: CombatQuad,            // BASE mults, entropy NOT applied
  banked: CombatQuad,           // per-stat banked exp -- PER STAT, never a scalar
  opts: {nodeMult: number, targetLevel: number}
): number

export function planGraftLadder(
  candidates: Array<{name, price, graftHours, mults: CombatQuad, prereqs: string[]}>,
  currentMults: CombatQuad,
  banked: CombatQuad,
  opts: {nodeMult, targetLevel, grindExpPerSec, entropyPerGraft, owned: Set<string>,
         maxSpend, moneyAvailable}
): {ladder: Array<Step>, chosenK: number, projections: Array<Step>}
```

**Typing rules that are the point, not decoration** (revision 1 under-specified exactly where the
first attempt failed):
- `banked` and `currentMults` are **4-tuples, never scalars**. The gate binds on the **worst** stat.
- `currentMults` are **base** mults with entropy applied by the planner as `entropyPerGraft^k`.
  ⚠️ **`ns.getPlayer().mults` may already include the entropy debuff.** WI2 must **determine this
  empirically before shipping** (read `mults` at entropy 0 vs after graft #1) and record the answer
  in the header. Double-counting on every `replan` is otherwise silent and compounding.
- `nodeMult` is an explicit `opts` field, not implicit.

**Selection rule:** greedily by **exp-reduction-per-dollar**, choosing `chosenK` at the **MINIMUM of
`totalHours`**, not the maximum affordable — the curve turns (features §3.2: k≈7 at 9.6 h, k=10 at
11.5 h).

**🔴 Never collapse the four stats into one scalar.** `graftrecon.js`'s `combatLevelFactor` does
exactly that and overstated the ladder ~13×. **That field is deprecated; the planner must not read
it, and `graftrecon.js`'s header must say so.**

**Prerequisite filtering (mandatory).** `getGraftableAugmentations` checks **neither money nor
prerequisites** (`sleeve-grafting-reference.md` §7) — and the features doc's own greedy order
contains `Augmented Targeting II` **without** `Augmented Targeting I`. A ladder with unbuyable steps
invalidates every downstream projection. Use `singularity.getAugmentationPrereq`; a step is
admissible only if its prereqs are owned/grafted or appear **earlier** in the same ladder.

**Acceptance:**
- B1. Reproduces features §3.2 (k=0 → 48.2 h, k=3 → 27.6 h, k=4 → 11.6 h, k=7 → 9.6 h) within 2%,
  as a committed golden test. **Fixture inputs, now sourced:** per-aug price/time/mults from
  `logs/graftrecon-1786925861944.json`; `banked` = `expForLevel(74, 1.3824 × 0.40)` ≈ **33,395/stat**;
  `grindExpPerSec` **2.62**; `nodeMult` **0.40**; `entropyPerGraft` **0.98**.
  ⚠️ Post-prerequisite-filtering the ladder **may legitimately differ** from §3.2, which was computed
  without that filter. If it does, the fixture records the **corrected** ladder and the features doc
  §3.2 is annotated as superseded — do **not** bend the filter to reproduce a known-unfiltered table.
- B2. `expForLevel(100, 1.28)` = **5,417/stat**, ×4 = **21,668** — BN6's measured combat-gate cost.
  🔴 **Revision 1 stated this at mult 1.0, which is arithmetically false** (that yields 11,255/stat,
  45,021 total). **1.28 is BN6's SF1.3 base-multiplier floor**, recorded in `CLAUDE.md`. This is the
  formula's only independent validation; getting it wrong would have had an implementer "fix" the
  formula all of WI2's economics rest on.
- B3. Selects the `totalHours` **minimum**, proven by a fixture containing a cheaper-but-slower tail.
- B4. Emits `graft-plan.json` with `schemaVersion` and every input it was computed from (mults,
  banked, `grindExpPerSec`, money, entropy, timestamp) so staleness is detectable.
- B5. Emits no aug already owned or grafted, and none whose prerequisites are unmet.
- B6. RAM ≤ **30 GB**, measured by `mem graftplanner.js`. (Revision 1's ≤24 GB was set before
  prerequisite filtering added 5 GB.)

---

### WI3 — `bn10entry.js`

**States:** `ASSESS → GRAFTING | GRAFT_START | GRIND | JOIN → DONE`.

```js
export function decideEntryAction(ctx): {kind: "graft"|"grind"|"join"|"replan"|"hold", reason: string}
```

**No `ns` calls inside `decideEntryAction`** — same rule as `decideInstall`, and the reason Phase
40's pure functions stayed testable while its live loop did not.

**Precedence (strict order):**
1. **`hold`** if a graft is in flight (`ctx.currentWork.type === "GRAFTING"`). Nothing preempts it —
   see A3.
2. **`join`** if all four combat stats ≥ 100.
3. **`replan`** if plan inputs have drifted (below).
4. **`graft`** if the next admissible step is affordable within all budgets.
5. **`grind`** otherwise. 🔴 **This is the only fallthrough — there is no idle state.** Revision 1's
   `wait` on budget exhaustion was a **terminal deadlock**: the gate is reachable by grinding alone
   (48.2 h at k=0), so budget exhaustion must grind, never idle.

**Replan triggers** (each stated with its direction): any combat stat's level rose ≥ **5** since the
plan was computed; **or** money rose past the next step's price (a fall cannot make a step
admissible); **or** `entropy` differs from the plan's recorded value; **or** plan age > **6 h**.

**Safety rails:**
- **R1 — bound the PERSISTENT one-way quantity, not a per-process counter.** 🔴 Revision 1 bounded
  in-memory counters, which reset on every restart — and `BACKLOG.md` records `cli.mjs restart`
  racing the supervisor and leaving **two live instances** (two PIDs, observed). Two executors × 8
  grafts ⇒ entropy `0.98^16 = 0.72` on every multiplier, permanently for the node. Bound instead on:
  - `MAX_ENTROPY` (default **8**) read **live** from `ns.getPlayer().entropy` before every graft —
    an absolute ceiling, restart-proof;
  - `MAX_GRAFT_SPEND` (default **$1.5b**) computed from the **persisted transaction ledger**
    (R3), not a counter;
  - **a single-instance guard**: on startup, abort if another `bn10entry.js` PID exists.
- **R2 — `MONEY_FLOOR`** (default **$50m**) preserved so the fleet is not starved.
- **R2a — reserve the graft budget.** `cloudmanager.js` is documented spending **$5.08t in ~2.5 min**
  against `totalReserved: 0`. R2 protects the fleet from the grafter; **nothing protects the grafter
  from the fleet**, on a phase whose binding constraint is money. Register the next step's price via
  the existing `resourcemanager.js` reservation chain, or record an explicit accepted-risk decision.
- **R3 — every graft is logged via `recordTransaction`** (`src/translog.js`), on success only.
  Standing convention, and the ledger is what makes R1's cumulative bound checkable.
- **R4 — verify, never trust the return value.** `getCurrentWork()` is the **start** check
  (entropy increments only on *completion*, so it cannot verify a start — revision 1 offered these
  as interchangeable, and one of them cannot work).
- **R5 — stand down if `bn10entry-off.txt` exists**, per A3a (finish an in-flight graft, start
  nothing new). ⚠️ Markers under `src/` are pushed by viteburner, so an in-game deletion silently
  reverts — same landmine as `ratchet-mode.txt`.
- **R6 — reconcile pre-existing work at `ASSESS`.** BN6 precedent: `combatgrind.js` died and its
  `commitCrime` ran unattended for ~90 min with nothing alive to stop it. The current state *is*
  such a loop. Adopt it if it matches the intended crime; otherwise replace it.

**Acceptance:**
- C1. Returns `hold` whenever a graft is in flight, **outranking `join`** — tested at the exact case
  where stats cross 100 mid-graft.
- C2. Returns `grind` — never an idle state — when R1/R2 binds. Tested at each boundary.
- C3. Returns `replan` for each trigger. Tested per trigger.
- C4. `bn10entry-log.json` records, per sample: timestamp, four combat exp values, four levels,
  money, entropy, current action kind, decision + reason. 🔑 **Exp-vs-elapsed is the required
  content** — revision 1 asked only for "decisions with reasons", which could pass while leaving
  Q41-2 (is Mug best?) and the 2.62-vs-1.84 exp/sec discrepancy unanswerable.
- C5. RAM ≤ **26 GB** (`mem bn10entry.js`), itemised in §5. 🔴 **Re-derived 2026-08-17 from a live
  measurement, and the reason matters.** The first build measured **28.85 GB** against revision 2's
  ≤24 GB. Both causes were **spec** defects, not implementation ones: §5's table never counted
  `bladeburner.getRank` (4.00 GB) which **C6 itself requires**, and **A1a** cost 3.05 GB across
  `cloud.getServerNames` + `getServerMaxRam` + `getServerUsedRam` + `scp` + `exec`. A1a is now
  **withdrawn** (below); the rebuilt script measures **25.80 GB**. ⚠ The gate is re-derived from the
  measurement *and its purpose* — fitting on home beside `daemon.js` and companions at 160 GB — not
  bent to whatever the code happened to need. Had the code merely been over budget with no design
  change, the correct move would have been cutting the code.
- C6. `joinBladeburnerDivision()` returning `false` is retried on a bounded cadence and logged
  distinctly from a thrown call; success is confirmed by a subsequent `getRank()`, not the boolean.

---

### WI4 — Engine alignment

- D-a. Pause `augfarmer.js` via the existing `augfarmer-pause.txt` marker (already honoured by
  `bbblackop.js`) — no code change.
- D-b. Make `ratchet-mode.txt` an explicit BN10 decision (currently `observe`, inherited from BN6).
  ⚠️ **Edit the repo copy** — gitignored *and* pushed by viteburner, so an in-game write silently
  reverts (cost a killed probe 2026-08-06). Verify with `run setratchetmode.js`.
- D-c. Add grafting as the fifth slot claimant in `docs/bladeburner-reference.md` §8 and
  `BACKLOG.md`; deprecate `combatLevelFactor` in `graftrecon.js`'s header.

**Acceptance:** D1. `docs/scripts.md`, `BACKLOG.md`, `docs/phases/CHANGELOG.md` updated **in the same
commits** as the code.

---

## 4. Test plan

- **Unit (vitest):** `expForLevel`, `remainingExp`, `planGraftLadder`, `decideEntryAction`.
- **Golden fixture:** B1, inputs sourced above.
- **Baseline: 1406 tests green** (measured 2026-08-17). Gate is **zero regressions against the
  branch point**, not a frozen number — revision 1 cited a stale 1395.
- **RAM gates:** B6 (≤30 GB), C5 (≤24 GB).
- **`npm run verify:log`:** extend to `bn10entry-log.json`. ⚠️ Two **pre-existing** failures
  (`verify-ratchet`, `verify-transactions`) are unrelated; do **not** "fix" them by loosening
  assertions.

### Live gates
- **L1** — home RAM ≥ 64 GB; the A2 resident set observed via `ps`.
- **L2** — **the model's only reality check, and it must be enforced in CODE.** After graft #1,
  the executor **halts** (writes `bn10entry-hold.txt`, keeps grinding, starts no further graft)
  until the marker is cleared by hand. It records: entropy delta (expect exactly **+1**), realised
  vs projected **`remainingExp`** (±10%), realised vs projected **graft duration**, and realised vs
  projected **price**.
  🔴 **Why duration is measured:** `markdown/bitburner.grafting.md` says *"Do not use this value to
  determine when the ongoing grafting finishes — affected by current intelligence level and focus
  bonus."* `chosenK` sits at the `totalHours` minimum, whose location depends entirely on graft time.
  The bonuses listed make realised time **shorter** than reported, which pushes the true minimum to a
  **higher** k — so the error direction is knowable, but the magnitude is not, and L2 measures it.
  🔴 **Why price is measured:** the ladder sums independent `getAugmentationGraftPrice` reads.
  Whether graft price escalates with grafts already taken (as purchased-aug price does, ×1.9) is
  **unasserted**. If it does, every `cumCost` row is wrong.
  Revision 1 wrote "stop and re-derive" as prose on an unattended engine, which could gate nothing.
- **L3** — combat 100/100/100/100 and `joinBladeburnerDivision()` verified by a subsequent
  `getRank()`.
- **L4** — **no `backdoorfactions.js` slot theft** across the run: no `installBackdoor` activity
  overlaps a graft window. 🔴 Revision 1 tested `augfarmer.js`, which WI4 pauses and which cannot fit
  in 64 GB anyway — a **vacuous** gate against the wrong claimant. `backdoorfactions.js` is the
  documented live thief (confirmed via `ps` during the failed Q10 attempts).

---

## 5. RAM itemisation

| `graftplanner.js` | GB | | `bn10entry.js` | GB |
|---|---|---|---|---|
| `getGraftableAugmentations` | 5.00 | | `graftAugmentation` | 7.50 |
| `getAugmentationGraftPrice` | 3.75 | | `commitCrime` | 5.00 |
| `getAugmentationGraftTime` | 3.75 | | `travelToCity` | 2.00 |
| `getAugmentationStats` | 5.00 | | `joinBladeburnerDivision` | 4.00 |
| `getAugmentationPrereq` | 5.00 | | `getCurrentWork` | 0.50 |
| `getOwnedAugmentations` | 5.00 | | `exec` + base + file IO | ~2.60 |
| base + file IO | ~1.60 | | | |
| **≈29.1 (gate 30)** | | | **≈21.6 (gate 24)** | |

⚠️ **Identifier hygiene is load-bearing here.** `bladeburnermanager.js` was silently billed **+25 GB**
for naming a local `window`. Avoid `travel`, `graft`, `work`, `exec`, `share`, `read`, `write`,
`kill`, `run`, `ls`, `ps` as local/property names; use bracket notation if a field name must collide.

⚠️ **Both scripts are brand-new `src/` files** and the recorded viteburner bug is that new files
never upload (silent pending) until seeded once via in-game `wget` — **ASCII only**.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Entropy tax worse than assumed | L2 measures on graft #1 behind a code-enforced halt |
| `getAugmentationGraftTime` ≠ realised | L2 measures duration; error direction is knowable (shorter ⇒ higher k) |
| Graft price escalates | L2 measures realised price |
| Double-instance ⇒ double grafts | R1's live-entropy ceiling + single-instance guard |
| In-flight graft cancelled, money forfeit | A3's `hold` precedence + A3a |
| Fleet outspends the graft budget | R2a reservation |
| 2.62 exp/sec wrong | C4's log; a slower grind **raises** the ladder's value — error is in the safe direction |

**Rollback:** delete `graft-plan.json`, create `bn10entry-off.txt`, resume the manual grind. **Grafts
already applied are irreversible within the node** (entropy clears only on install) — R1 is what
bounds that exposure.

---

## 7. Open questions — defaults **and dates**, per the standing rule

- **S-1. Which crime does `grind` use?** Default `Mug` (measured in BN6; drives karma negative,
  which the features-R2 faction route needs). Settled empirically from C4's log. **Expires
  2026-08-19** (inherited from Q41-2).
- **S-2. Focused or unfocused?** Default **focused** — confirmed live 2026-08-17 (the "Do something
  else simultaneously" button is present, and the observed 2.62 exp/sec exceeds the 1.84 unfocused
  measurement). Cost: focused blocks CDP reads, which cost three economy restarts this session.
  Mitigation: an `bn10entry-unfocus.txt` marker the engine polls. **Expires 2026-08-19.**
- **S-3. Sleeve task during entry.** ⚠️ **Flagged as a DEPARTURE from features D5**, which said
  *"make the switch a measured decision, not a default … do not silently leave it on `SYNCHRO` by
  inertia."* Default here **is** no change — the departure is deliberate (it is a ~12.6% effect on
  the grind term alone, and WI2 produces the `grindHours` the decision needs as a by-product).
  **Expires at L2**, when `grindHours` is known. Cost if wrong: ~12.6% of the remaining grind.
- **S-4. Q41-1 (entropy vs batcher income).** Carried forward from the features doc, dropped by
  revision 1. Default: accept the debuff. **Expires 2026-08-20.**

---

## 7b. Z1 DISCHARGED 2026-08-18 — sleeve memory priced, and deferred with a date

The acceptance criterion was *"price it explicitly or restate the deferral with a new date"*.
Priced (`src/sleevememprobe.js`, `logs/sleevememprobe-1787061022037.json`), at the Bladeburner join:

| Memory | Cost | vs $20.932b held |
|---|---|---|
| **+1** (1 -> 2) | **$1.000t** | **47.8x short** |
| +10 | $10.950t | 523x |
| +50 | $84.579t | 4,040x |
| +99 (-> 100, the cap) | **$305.130t** | 14,577x |
| *(next sleeve, for scale)* | $10.000t | 478x |

**Decision: DEFER, expires 2026-08-25.** It is BN10-exclusive and permanent across every future
node, so it is genuinely valuable — but +1 memory costs ~48x our entire bankroll *at the moment the
gate cleared*, and memory only sets a sleeve's **starting sync** in later nodes. With **one** sleeve,
the cross-sleeve term (quadratic) is irrelevant, so the benefit is one actor starting a future node
at sync N instead of sync 1 — recoverable in-node by running `Synchronize`, which is exactly what
just took this sleeve from 27.17 to **100.0** unattended.

🔑 **That last point is the real finding and it lowers memory's value considerably:** sync reached
the cap **on its own during the graft ladder**, and shock decayed **21.18 -> 0.0** alongside it. So
the thing memory buys — a head start on sync — is obtainable free with idle time. Memory is worth
buying only if a future node is so short that the `Synchronize` ramp cannot be paid, or once there
are enough sleeves for the quadratic cross-term to bite.

**Re-evaluate when:** bankroll passes ~$1t (making +1 a real option), or a second sleeve is bought.

---

## 7a. Post-join sequence -- ORDER MATTERS, and two steps are easy to forget

Written 2026-08-17 during execution, after finding that `bladeburnermanager.js` is a **supervised
resident companion gated on division membership** (`daemon.js` `BLADEBURNER_GATED_COMPANIONS`). It
auto-launches the instant `joinBladeburnerDivision()` succeeds, claims the player-action slot, and
starts grinding `Tracking`. That is desirable -- it is the win-condition engine -- but it makes the
ordering load-bearing.

1. 🔴 **Finish ALL grafts before joining.** A graft in flight when `bladeburnermanager.js` starts is
   cancelled, and money is charged **up front**, so the loss is dollars, not just time. This is safe
   by construction only because the ladder reaches combat 100 on grafts alone (k=4 leaves 0 exp to
   grind) -- do not join early to "get started".
2. **Join**, and verify with a subsequent `getRank()` rather than the boolean (C6).
3. 🔴 **DELETE `src/cloud-upgrade-off.txt`.** It pauses all fleet growth, which IS this node`s
   income. A forgotten pause is silent -- nothing alarms on it. (Created during the ladder because
   R2a fired: the fleet ate $1.65b of graft budget in an hour.)
4. **DELETE `src/augfarmer-pause.txt`** -- or consciously leave it, per Q41-5. Leaving it is
   defensible (its scoring function targets a hacking win condition BN10 does not have); forgetting
   it is not. Decide, do not drift.
5. 🔴 **Z1 -- price the sleeve MEMORY upgrade (Q41-4).** Its wake condition is exactly this moment.
   Memory is the only **BN10-exclusive, permanent-across-all-future-nodes** purchase in the game.
   Either buy, or restate the deferral **with a new date**. Silently skipping it is the failure this
   criterion exists to prevent.
6. **Run the sleeve-parallelism probe** (`BACKLOG.md` top item) -- the assumption the whole BN10-next
   ordering partly rests on, and it becomes measurable only now. One sleeve on `Take on contracts`
   in the main character`s city; compare realised Tracking rank/h against the solo baseline.
7. **Make the slot hold bidirectional.** `bladeburnermanager.js` *writes* `bladeburner-slot-hold.json`
   but never reads it (spec 2.2`s logged gap). Survivable only pre-join; from here it is a live
   conflict with every other claimant.

---

## 8. Revision changelog

**Rev 2 (2026-08-17)** — cold review returned **15 blocking issues**; all addressed, none disputed.
The five that would have caused real damage:
1. **B2 was arithmetically false** (mult 1.0 → 45,021, not 21,668). An implementer would have
   "fixed" `expForLevel` and silently corrupted every projection. Corrected to **1.28**, sourced.
2. **R1 bounded per-process counters, not the persistent one-way quantity** — the exact
   `MAX_ATTEMPTS` shape the review was asked to hunt. Now bounds live `entropy` + a persisted ledger
   + a single-instance guard.
3. **No `GRAFTING` state**, while `graftAugmentation` cancels current work and charges up front —
   four separate code paths would each have forfeited a paid graft. Now A3/A3a.
4. **The slot hold was never refreshed** against a 30 s expiry that fails open. Now ≤10 s, and
   `waitForOngoingGrafting()` is forbidden.
5. **C2 specified a terminal deadlock** (idle forever on budget exhaustion, on a phase whose gate is
   reachable by grinding alone). Now grind is the sole fallthrough.

Also: graft `recordTransaction` (convention violation); prerequisite filtering (the ladder contained
an unbuyable step); planner moved to the fleet (the "never concurrent" rule was unachievable); graft
budget reservation; B1's fixture inputs sourced; pure-function types pinned to 4-tuples; L2 made
code-enforced and extended to duration and price; L4 retargeted from a vacuous claimant to the real
one; dates restored to every open question.

---

## 9. Close-out — 2026-08-18

**Deliverable MET.** `joinBladeburnerDivision()` returned `joined=true inBladeburner=true`, verified
by a subsequent `getRank()` succeeding. Combat **91 → 109** (gate 100) on **two** grafts.

### Done vs left

| Work item | Status |
|---|---|
| WI1 home RAM | ✅ home reached 160 GB; full companion set resident |
| WI2 `graftplanner.js` | ✅ shipped, and it **independently reproduced the hand-computed ladder to the dollar** |
| WI3 `bn10entry.js` | ⚠️ **shipped but never ran live** — see below |
| WI4 engine alignment | ✅ `augfarmer` paused, `cloudmanager` paused/unpaused around the ladder, grafting registered as the fifth slot claimant |
| Z1 sleeve memory | ✅ priced and deferred with a date (§7b) |
| L2 measurement gate | ✅ all three questions answered, one defect found |

### 🔴 The honest result: the engine this phase built was not used to clear the gate

`bn10entry.js` is complete and unit-tested, but the gate was cleared **by hand** with
`graftone.js` before it ever ran. Two reasons, both deliberate:
1. Grafting charges **up front** and accumulates irreversible Entropy, and the engine's *live loop*
   had never executed. Phase 40's lesson — *a mechanism can be wrong while the code is right* — made
   a hand-driven, instrumented first graft the right call.
2. **Re-planning after each graft collapsed the remaining work faster than the engine could have
   consumed it.** At combat 96 the ladder went from 3 grafts to **1**.

**So the phase's own §1 objection was correct:** this was mostly a one-time event, and the engine's
value is **BN9 reuse**, not BN10. That is not waste — BN9 is a Bladeburner node and rank is
node-local, so the gate recurs from zero — but it should be recorded as a *deferred* payoff, not a
realised one. ⚠️ **`bn10entry.js` has never executed a live loop. Treat it as unvalidated until it
does.**

### What actually paid off: the measurements

- **Graft price = 0.600 × purchase price, constant across all 97 augs, with zero reputation.**
  Grafting is the *cheap* route — the opposite of what this phase assumed while planning.
- **`getPlayer().mults` already includes the Entropy debuff** — found by measurement, and it was a
  live double-counting defect in `graftplanner.js`.
- **`getAugmentationGraftTime` is reliable when focused** (ratio 1.001 on both grafts), despite the
  API doc's explicit warning. The k-selection minimum rests on it, so this mattered.
- All of it is now in **[`docs/grafting-reference.md`](../grafting-reference.md)**, the durable asset.

### Carried forward
- **Q41-5** (what the aug ratchet is *for*) — default moved to "retire unless breadth is needed", on
  the price evidence. Still open.
- **Q41-1** (Entropy vs batcher income) — never bit; entropy stopped at 2. Expires 2026-08-20.
- **S-3** (sleeve task) — resolved by accident: sync reached its **100 cap** and shock hit **0**
  unattended during the ladder.
- **The slot hold is still one-directional** (`bladeburnermanager.js` writes but never reads it).
  Pre-join this was harmless; it is now live. → `BACKLOG.md`.
