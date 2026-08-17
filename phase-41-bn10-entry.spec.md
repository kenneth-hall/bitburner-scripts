# Phase 41 — BN10 entry: getting to Bladeburner (SPEC)

**Stage 2.** Implementable specification derived from
[`phase-41-bn10-entry.features.md`](phase-41-bn10-entry.features.md). Read that first — this
document does not restate its reasoning, only what gets built and how it is validated.

**Deliverable in one line:** an unattended engine that takes the run from *node entry* to
`joinBladeburnerDivision() === true` by sequencing grafts and combat grinding on the single
player-action slot, and then stands down.

---

## 1. Scope

### In scope
- Home-RAM unblock (features D6).
- A **graft planner** that computes the optimal graft ladder and writes it as a plan file.
- A **slot-owning entry engine** that executes graft → grind → join as a state machine.
- Quiescing `augfarmer.js` for the duration (features D3) and making `ratchet-mode.txt` an
  explicit BN10 decision (D3a).
- Registering grafting as the **fifth** player-action-slot claimant.

### Explicitly NOT in scope
- The Bladeburner rank grind, skill buying, or the black-op ladder. Existing scripts
  (`bladeburnermanager.js`, `bbskillbuy.js`, `bbblackop.js`) cover those and are untouched here.
- **The sleeve-parallelism probe** (BACKLOG top item). It becomes runnable the moment this phase
  succeeds, and it is the *next* phase's opening move — not this one's.
- Sleeve purchasing and memory upgrades (features D4, Q41-4).
- Retargeting `augfarmer.js`'s scoring function (features Q41-5, deferred past the join).
- Any change to `daemon.js`'s batcher logic. The economy is already adequate.

---

## 2. Architecture, and the constraint that forces it

### 2.1 RAM forces a planner/executor split

Home is **32.00 GB** with `HomeComputerRamCost` at 1.5×. A single script doing catalog reads,
price/time reads, grafting, crime, travel, sleeve management and the Bladeburner join would need:

| Call | RAM |
|---|---|
| `grafting.getGraftableAugmentations` | 5.00 |
| `grafting.getAugmentationGraftPrice` | 3.75 |
| `grafting.getAugmentationGraftTime` | 3.75 |
| `grafting.graftAugmentation` | 7.50 |
| `singularity.getAugmentationStats` | 5.00 |
| `singularity.commitCrime` | 5.00 |
| `singularity.travelToCity` | 2.00 |
| `bladeburner.joinBladeburnerDivision` | 4.00 |
| `sleeve.*` (≥3 methods) | ≥12.00 |
| | **≥48 GB — does not fit** |

**Decision A1 — split into a planner and an executor, communicating through a plan file.** The
planner pays the catalog/price/stats RAM **once**; the executor reads the plan and pays only the
acting RAM. This is the established repo pattern (companion scripts + JSON state files), not a new
idea.

- `graftplanner.js` — planner. ~20 GB. Runs on demand, writes `graft-plan.json`, exits.
- `bn10entry.js` — executor. ~20 GB. Long-running resident, reads the plan, owns the slot.

⚠️ **They must never run concurrently** (≈40 GB). The executor re-invokes the planner via
`ns.exec` only when it is itself idle, or the planner is run by hand.

### 2.2 The engine owns the player-action slot

Grafting defaults `focus: true` and blocks the crime grind, making it the **fifth** claimant of the
single slot alongside `bladeburnermanager.js`, `augfarmer.js`, `backdoorfactions.js` and
`backdoorwd.js`.

**Decision A2 — `bn10entry.js` claims `SLOT_HOLD_FILE` (`bladeburner-slot-hold.json`) for its entire
lifetime**, using the existing contract (`{ts, holder}`, written at
`bladeburnermanager.js:1710`, honoured by `augfarmer.js:2228` via `resolveSlotHold`). It releases in
an `ns.atExit`.

⚠️ **Known gap, accepted and logged rather than fixed here:** `backdoorfactions.js` and
`backdoorwd.js` honour the hold, but `bladeburnermanager.js` **writes** the file rather than reading
it. That is fine for this phase only because `bladeburnermanager.js` cannot run before the join —
which is precisely what this phase is trying to achieve. **It becomes a real conflict the moment
this phase succeeds**, so the follow-on phase must make the hold bidirectional. Recorded in
`BACKLOG.md`.

---

## 3. Work items

### WI1 — Home-RAM unblock

**Why:** home has 0.40 GB free; `augfarmer.js` (64.10 GB), `dashboard.js`, `xpfarm.js` and
`ratchetlog.js` have never started this node, and every probe this session required killing the
economy. The executor itself needs ~20 GB.

**Build:** no new code. Use the existing `upgradehomeramonce.js` (one tier, spend-capped).

**Acceptance:**
- A1. Home RAM ≥ 64 GB, confirmed by `ns.getServerMaxRam("home")`.
- A2. `bn10entry.js` and the daemon's companion set coexist without a `waiting-ram` log line for
  `dashboard.js`.
- A3. The purchase is recorded via `recordTransaction` (existing call site inside
  `upgradehomeramonce.js` — verify it exists; if it does not, add it, per the standing convention
  that every purchase is logged).

---

### WI2 — `graftplanner.js` (the planner)

**Build:** a script that reads the graft catalog and writes `graft-plan.json`.

**Pure core (must be exported and unit-tested):**

```js
export function expForLevel(level, effectiveMult)      // e^((level/mult + 200)/32) − 534.6
export function remainingExp(mults, bankedExpPerStat, nodeMult, targetLevel)
export function planGraftLadder(candidates, currentMults, bankedExpPerStat, opts)
```

`planGraftLadder` returns an **ordered** ladder plus a per-step projection
`{k, aug, price, graftHours, cumCost, cumGraftHours, remainingExp, grindHours, totalHours}`, chosen
**greedily by exp-reduction-per-dollar**, with entropy compounding at `ENTROPY_PER_GRAFT = 0.98`
against every multiplier.

**🔑 It must select `k` at the MINIMUM of `totalHours`, not the maximum affordable.** The features
doc's §3.2 re-derivation shows the curve now has a true minimum (k≈7 at ~9.6 h) after which graft
*time* exceeds the grind time it saves — k=10 is strictly worse than k=7. A planner that buys
everything affordable is wrong.

**🔴 The per-stat rule, which is where the first attempt went wrong.** The gate binds on the
**worst** of the four combat stats, so an aug's value is its effect on
`sum over stats of max(0, expNeeded(stat) − banked(stat))`. **Never** multiply the four stats'
multipliers into one scalar — `graftrecon.js`'s `combatLevelFactor` does exactly that and overstated
the ladder by ~13× (45× vs the true ~3.5×). That field is **deprecated**; the planner must not read
it.

**Acceptance:**
- B1. Reproduces the features doc §3.2 table (k=0 → 48.2 h, k=3 → 27.6 h, k=4 → 11.6 h,
  k=7 → 9.6 h) to within 2% when fed the same inputs. Committed as a fixture test.
- B2. `expForLevel` reproduces BN6's **measured 21,668** four-stat total at mult 1.0 / level 100
  (`5,417 × 4`). This is the formula's only independent validation and must be a test.
- B3. Selects the `totalHours` **minimum**, proven by a fixture where a cheaper-but-slower tail
  exists.
- B4. Emits `graft-plan.json` with a schema version and the inputs it was computed from
  (mults, banked exp, rate, money) so a stale plan is detectable.
- B5. Never emits an aug already owned or already grafted.

---

### WI3 — `bn10entry.js` (the executor)

A resident state machine that owns the slot.

**States:** `ASSESS → GRAFT | GRIND → JOIN → DONE`, with `WAIT` for the money-blocked case.

**Pure core (exported, unit-tested):**

```js
export function decideEntryAction(ctx)  // -> {kind:"graft"|"grind"|"join"|"wait"|"replan", reason}
```

`ctx` carries combat levels, money, plan, plan freshness, HP, current action, and slot state. **The
decision function performs no `ns` calls** — same rule as `decideInstall`, and the reason Phase 40's
pure functions were testable while its live loop was not.

**Behaviour:**
1. **`join` wins over everything** once all four combat stats ≥ 100 — check *before* starting any
   new graft, so a completed gate is never delayed by a queued purchase.
2. **`graft`** when the next ladder step is affordable and the plan is fresh. Travel to the graft
   city first; verify arrival before calling `graftAugmentation`.
3. **`grind`** otherwise — `commitCrime` with the configured crime.
4. **`replan`** when the plan's recorded inputs drift materially from live state (default: combat
   level moved ≥ 5, or money crossed the next step's price).

**Safety rails (all mandatory):**
- **R1 — a hard graft budget.** `MAX_GRAFT_SPEND` (default **$1.5b**) and `MAX_GRAFTS` (default
  **8**), both checked *before* each purchase. Entropy is only cleared by an install, so an
  unbounded grafter degrades every multiplier permanently for the node.
- **R2 — never graft below a money floor.** `MONEY_FLOOR` (default **$50m**) preserved so the
  batcher/fleet is not starved.
- **R3 — verify, never trust the return value.** After `graftAugmentation`, confirm via
  `getPlayer().entropy` incrementing or `getCurrentWork()`. This is the standing rule and
  `bladeburner.startAction` is the precedent for why.
- **R4 — release the slot in `ns.atExit`.**
- **R5 — stand down entirely if `bn10entry-off.txt` exists**, mirroring `bladeburner-off.txt`.

**Acceptance:**
- C1. `decideEntryAction` returns `join` whenever all four stats ≥ 100, regardless of plan state or
  affordability. Tested.
- C2. Returns `wait`, never `graft`, when the purchase would breach R1 or R2. Tested at the exact
  boundary.
- C3. Returns `replan` on stale-plan inputs. Tested.
- C4. Emits every decision to `bn10entry-log.json` with the reason. Non-negotiable — features Q41-2
  (is Mug still best?) is answerable **only** from a realised exp-rate log, and the observed 2.62
  exp/sec vs modelled 1.84–2.08 discrepancy is currently unexplained.
- C5. RAM ≤ 24 GB, measured via `mem bn10entry.js`.

---

### WI4 — Engine alignment

**Build:**
- D-a. Quiesce `augfarmer.js` for the duration — it should not be launched by the daemon's
  supervisor while `bn10entry.js` holds the slot. Prefer the existing pause marker
  (`augfarmer-pause.txt`, already honoured by `bbblackop.js`) over a code change.
- D-b. Make `ratchet-mode.txt` an explicit BN10 decision. It currently reads `observe` as inherited
  BN6 state. ⚠️ **Edit the repo copy, not the in-game file** — it is gitignored *and* pushed by
  viteburner, so an in-game write silently reverts (this cost a killed probe on 2026-08-06). Verify
  with `run setratchetmode.js`.
- D-c. Add grafting to the player-action-slot claimant table in `docs/bladeburner-reference.md` §8
  and `BACKLOG.md` — it is the fifth, and the only one that blocks the combat grind.

**Acceptance:** D1. `docs/scripts.md`, `BACKLOG.md` and `docs/phases/CHANGELOG.md` are updated **in
the same commits** as the code, per the standing convention.

---

## 4. Test plan

- **Unit (vitest)** — `planGraftLadder`, `expForLevel`, `remainingExp`, `decideEntryAction`. All
  pure, no `ns`. Target: the full existing suite (**1395 green** at last run) plus the new cases,
  with **zero regressions**.
- **Fixture** — the §3.2 table committed as a golden test (B1), so a future refactor cannot silently
  change the ladder economics.
- **RAM gate** — `mem graftplanner.js` ≤ 24 GB, `mem bn10entry.js` ≤ 24 GB, and the two never
  resident simultaneously.
- **`npm run verify:log`** — extend to `bn10entry-log.json`. ⚠️ Two **pre-existing** failures in that
  suite (`verify-ratchet`, `verify-transactions`) are unrelated and must not be "fixed" by loosening
  assertions; see `BACKLOG.md`.

### Live validation gates
- **L1** — home RAM ≥ 64 GB, companion set fully resident (WI1).
- **L2** — **the first graft is the real gate.** One graft completes; `getPlayer().entropy`
  increments by exactly 1; the affected combat multiplier rises; and the *measured* new
  `remainingExp` matches the plan's projection within **10%**. 🔑 **If L2's projection misses, stop
  and re-derive — do not proceed up the ladder.** The entropy tax and the per-stat model are both
  unvalidated against reality until this fires.
- **L3** — combat 100/100/100/100 and `joinBladeburnerDivision()` returns `true`, verified by a
  subsequent `ns.bladeburner.getRank()` succeeding rather than by the boolean.
- **L4** — no slot theft: across the whole run, no `augfarmer.js` faction-work record overlaps a
  graft window in the logs.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Entropy tax is worse than the assumed 2%/graft | L2 measures it on graft #1 before committing to the ladder |
| Graft time estimates are wrong (`getAugmentationGraftTime` unvalidated) | L2 compares projected vs realised; R1 bounds the exposure |
| Money spent on grafts starves the fleet | R2's `MONEY_FLOOR`; the batcher's income is already measured adequate |
| A better route exists (faction combat augs post-install) | Features R2 keeps it open; entropy is cleared by an install, so this phase does not foreclose it |
| The 2.62 exp/sec observation is wrong and the grind is slower | C4's log makes it measurable; the ladder's value **rises** if the grind is slower, so the error is in the safe direction |

**Rollback:** delete `graft-plan.json`, touch `bn10entry-off.txt`, resume the manual grind. Grafts
already applied are **not** reversible — this is the one-way component, and R1 is what bounds it.

---

## 6. Open questions carried into implementation

- **S-1.** Which crime does `grind` use? Features Q41-2's default is `Mug` (measured in BN6, and it
  drives karma negative for the R2 faction route). **Not** re-derived here — the log from C4 settles
  it empirically.
- **S-2.** Focused or unfocused grind? The live 2.62 exp/sec suggests focused. Focused is ~25%
  faster but blocks CDP reads, which cost this session three economy restarts. **Default: focused**,
  with the executor unfocusing on demand via a marker file.
- **S-3.** Does the sleeve switch off `Synchronize` during entry (features D5/Q41-3)? **Default: no
  change this phase** — it is a ~12.6% effect on the grind term only, and D5 wants it decided by
  arithmetic once the ladder fixes the remaining grind hours.
