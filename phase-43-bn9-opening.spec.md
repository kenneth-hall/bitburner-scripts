# Phase 43 — BN9 opening: the Hacknet economy and the Bladeburner entry gate (SPEC)

**Stage 2, revision 4.** Derived from
[`phase-43-bn9-opening.features.md`](phase-43-bn9-opening.features.md); read that first, this
document does not restate its measurements or arithmetic, only pins down how they get built. This
document is self-contained — an implementer needs nothing from any prior draft of this spec. §12
records the decision trail across three review passes for anyone who wants the history; everywhere
else states the current design directly.

**Deliverable in one line:** an unattended sequence that takes BN9 from *one unattended Hacknet
Server, combat 1/1/1/1* to *combat 100×4, `joinBladeburnerDivision()` verified,
`bladeburnermanager.js` live and supervised* — without touching the batcher, without installing an
augmentation, and without repeating the pooled-stat selection bug that made the first pass at the
graft ladder wrong.

---

## 0. The one thing this spec exists to fix

`graftplanner.js` (Phase 41, shipped and closed) selects grafts by **summed** exp-deficit
reduction across the four combat stats, scored **per dollar**. That is wrong: the gate is
`min(str,def,dex,agi) ≥ 100`, and a sum is not a minimum.

A greedy, one-candidate-at-a-time fix scored per graft-hour on a max-based `bottleneckHours` is
**also** wrong: from BN9's exact starting point (all four mults tied at 1.3824, stats tied at
1/1/1/1), any candidate that doesn't touch all four stats leaves `min()` unmoved while
`0.98^(k+1)` lowers every mult — a strictly negative score for every partial-coverage candidate.
Width-1 greedy can therefore only ever pick all-four-stat augs. Measured: **52.6 h at width 1 vs
21.17 h converged — greedy is 2.5× worse.**

**The fix is a beam search** — §5, verified converged at width ≥300.

---

## 1. Scope

### In scope — six work items

| Spec WI | Features WI | What it does |
|---|---|---|
| **WI-A** | WI1 (Hacknet RAM) | One new one-shot script, `hacknetramonce.js`: 1 → 64 GB on `hacknet-server-0` |
| **WI-B** | WI2 (stand `cloudmanager.js` down) | `cloudmanager.js` self-exits when `CloudServerLimit === 0`; `resourcemanager.js` stops reserving for a purchase that can never happen |
| **WI-C** | — (mechanism behind features WI3/D4) | The graft-selection beam search, in a new zero-`ns` module `graftmath.js`, consumed by `graftplanner.js` |
| **WI-D** | WI3 + WI4 merged | One resident state machine (`bn9entry.js`) owning grind-rate calibration, `augfarmer.js`'s pause, and the graft/grind/join sequence. Makes zero `ns.sleeve.*` calls. |
| **WI-E** | WI5 + the Phase-42 disposition | `bn9companions.js`: supervises `sleevemanager.js` and `bladeburnermanager.js`, launched early. Plus a machine-checked S-RF re-verification gate. |
| **WI-F** | (falls out of the sleeve correction, §8) | A small, additive `syncThreshold` policy mode added to the existing `src/sleevemanager.js` |

### Ordering

1. **WI-A runs first, standalone**, before `bn9entry.js` is ever launched — money binds the graft
   ladder (§6), and the Hacknet's 1.50× step is the cheapest, fastest lever available before
   anything else starts spending.
2. **WI-B ships independently** — it has no dependency on WI-A/C/D/E/F and no interaction with
   them beyond freeing `resourcemanager.js`'s reservation total, which every later work item reads
   as part of "available money." Order relative to WI-A does not matter; both should be live before
   `bn9entry.js` starts so its first `ASSESS` sees clean numbers.
3. **`bn9entry.js` (WI-D) starts once WI-A/B have landed.** Its own first action is
   `LAUNCH_COMPANIONS` (WI-E, which requires WI-F's `sleevemanager.js` extension to already be on
   disk, since it passes the new `syncThreshold` argument on first launch).
4. **WI-C (`graftmath.js`/beam search) is a dependency of WI-D**, not a separate runtime step — it
   must exist before `bn9entry.js`'s `CALIBRATE_GRIND` state can produce a real plan.

### Explicitly NOT in scope (carried verbatim from features §5)

The black-op ladder (`bbblackop.js` exists and works); `bbskillbuy.js`'s greedy-spend bug (BACKLOG
item); any Hacknet *manager* script (D2: build once, stop); any hash-spender (D3: closed); the
batcher (D1: retired); corporations; the stock market. Also: general companion re-supervision
beyond `bladeburnermanager.js`/`sleevemanager.js`; reviving Phase 42's content beyond its file
location and a machine-checked reopen trigger (§11); deriving the sync→host exp-transfer formula
from first principles — it is already documented verbatim in
`docs/sleeve-grafting-reference.md` (§8).

### Disposition of every features-doc item

| Item | Disposition |
|---|---|
| D1 (batcher retired) | Upheld. `daemon.js` stays down for the whole phase. |
| D2 (Hacknet: build to 64 GB, stop) | Implemented as WI-A. |
| D3 (no hash→Bladeburner exchange) | Nothing built; Q1 (§13) measures it once, for the record only. |
| D4 (graft-first, binding-stat selection, stopping rule) | Implemented as WI-C (the beam search) + WI-D (the executor). |
| D5 (phase scope) | This section. |
| Features §6 hazards | Restated at point of execution throughout (§9's preflight rail, §12.2). |
| Q1 | Carried (§13); measured once on join day, no feature built. |
| Q2 (was `daemon.js` stopped deliberately?) | Carried (§13); moot for this spec's own decisions either way — `daemon.js` stays down regardless of the answer. |
| Q3 (`hacknet-server-0`'s origin) | Carried (§13); load-bearing for the no-install rail regardless. |
| Q4 | Already closed by the features doc (graft catalog confirmed live). |
| Q5 (`w0r1d_d43m0n` not yet a valid host) | Carried (§13). |
| Q6 ($250,000/hash flat?) | Carried (§13); WI-A's before/after production log is free supporting evidence either way. |
| Q7 (does an install reset Hacknet Servers?) | **Standing rail, no expiry** — never install in BN9 (§12.2's factual note, §13). |

---

## 2. Architecture

### A0 — Beam search, in `graftmath.js`: a genuinely zero-`ns` module

`src/common.js` — an existing, already-used shared module — calls `ns.scan` (×3), `ns.tprint`,
`ns.getScriptRam`, and imports `WORKER_SCRIPTS` from `scheduler.js`. Importing the graft-planning
surface from it would charge any importer roughly 0.9–1.0 GB via exactly the import-bleed pattern
`CLAUDE.md` documents by name (`targetsmonitor.js` importing a four-line pure helper out of
`scheduler.js` and being charged for `hack`/`grow`/`weaken`/`getScriptRam`/`fileExists` it never
called). `common.js`'s own header also states its scope as "no policy decisions, no
batching/finance math" — a graft-ladder beam search does not belong there on that ground alone.

**The shared pure planning surface lives in a new file, `src/graftmath.js`, with one hard rule
enforced by code review before every commit: it contains ZERO `ns.*` calls, and it imports NOTHING
that contains one** (never `common.js`, never `scheduler.js`, nothing `ns`-bearing). Every function
here takes live game state as plain-value parameters from its caller; none of them reads it itself.
This makes its RAM contribution to any importer **exactly 0 GB** — a property to be verified live
(WC7, §5), not merely asserted from its source containing no `ns.` text.

```js
// src/graftmath.js -- pure math only. Verify with `grep -n "ns\." src/graftmath.js` returning
// nothing outside comments before every commit.

export const NODE_CONFIGS = { 9: {...}, 10: {...} };
export function resolveNodeConfig(bitNodeN, overrides) {...}
export function statHoursRemaining(mult, banked, grindRateForStat, opts) {...}   // ONE stat, scalar rate
export function bottleneckHours(mults, banked, grindRatePerStat, opts) {...}     // max over 4 stats
export function moneyWaitHours(cumCost, moneyAvailable, incomeRatePerSecDollars) {...}
export function liveGrindRate(logSamples, nowMs, windowMs, minSamples) {...}
export function planGraftLadder(candidates, currentMults, banked, opts) {...}    // the beam search
```

### A1 — Planner/executor split

`graftplanner.js` pays the catalog RAM (`getGraftableAugmentations`, prices, times, stats, prereqs)
once per invocation and exits; `bn9entry.js` is the long-lived resident that reads its output
(`graft-plan.json`) and never touches the catalog itself. This keeps `bn9entry.js`'s own RAM well
clear of the ~29 GB catalog-read surface. `graftplanner.js` runs on **home** — BN9 has no fleet
worth using (`CloudServerLimit` 0, network census 941 GB total, mostly home already).

### A2 — Slot ownership

`bn9entry.js` claims `SLOT_HOLD_FILE` (`bladeburner-slot-hold.json`), refreshed every ≤10 s
(`SLOT_HOLD_MAX_AGE_MS` is 30 s and every consumer fails open on a stale marker — the same file,
same constant, and the same other claimants: `augfarmer.js`, `backdoorfactions.js`,
`backdoorwd.js`, `bladeburnermanager.js`). `waitForOngoingGrafting()` is forbidden (it blocks, so
it cannot refresh the hold); the executor polls `getCurrentWork()` on its own cadence instead.

### A3 — Grafting cancels in-flight work

`graftAugmentation` cancels current work and charges money up front (verbatim,
`docs/grafting-reference.md` §8.1). A `GRAFTING` hold state, gated on `singularity.getCurrentWork()`,
outranks every other decision **including `join`** — nothing may issue a work-cancelling call
(re-graft, `commitCrime`, `travelToCity`, a slot release) while a graft is in flight, because doing
so would forfeit money already spent.

### A4 — Companion-supervision gap: two companions, launched early

`daemon.js` stays down (D1) and has no supervise-only mode (it is one loop that both schedules the
batcher and launches `RESIDENT_COMPANIONS`; there is no `daemon-batcher-off.txt`-style switch to
run one half without the other). Something still has to keep `bladeburnermanager.js` and
`sleevemanager.js` alive, since **neither was ever in `daemon.js`'s `RESIDENT_COMPANIONS` list**,
even in BN10 — `sleevemanager.js` in particular has never been daemon-supervised in this repo's
history.

**`bn9companions.js` (WI-E) fills this gap for both:**
- **`sleevemanager.js`** — always launched (it already degrades cleanly with zero sleeves, via its
  own existing `getNumSleeves` try/catch), passed the BN9-specific `syncThreshold` argument (§8).
- **`bladeburnermanager.js`** — gated on `ns.bladeburner.inBladeburner()`; simply not launched
  until the join flips that true.

**Launched once, early — not at a post-join step.** `bn9entry.js` execs `bn9companions.js` as its
very first real action (`LAUNCH_COMPANIONS`, before `PAUSE_AUGFARMER`), because `sleevemanager.js`
needs to already be managing the sleeve **before** `CALIBRATE_GRIND` runs — the whole point of the
sleeve fix (§8) is that its contribution needs to be *inside* the calibrated rate, not layered on
after. `bladeburnermanager.js`'s gate simply stays closed until the join opens it; there is no cost
to `bn9companions.js` running the whole time waiting for that.

### A5 — Grind rate: measured live, per stat, through a mandatory calibration step

`CALIBRATE_GRIND` (§6) measures the player's own realised exp/sec/stat from a bounded live `Mug`
sample, rather than trusting a borrowed placeholder. Because `sleevemanager.js` is already running
by the time calibration happens (A4), the sleeve's contribution — fed to the player linearly scaled
by its `sync` (`docs/sleeve-grafting-reference.md`, verbatim: *"both the sleeve and the player's
original host consciousness earn N% of the amount normally earned"*) — is captured automatically in
that measurement, with no separate transfer-formula to model or get wrong.

---

## 3. WI-A — Hacknet RAM: 1 → 64 GB on `hacknet-server-0`, then exit

**New script: `hacknetramonce.js`.** Mirrors `upgradehomeramonce.js`'s shape (one-shot, capped
spend, `recordTransaction`, refuses above cap rather than silently doing nothing):

```
run hacknetramonce.js [maxSpendCap]
```

- Reads `ns.hacknet.getNodeStats(0)` for current RAM.
- `levelsNeeded = Math.round(Math.log2(64 / currentRam))` — refuses (logs, does not crash) if
  `currentRam` is not a power of two ≤ 64, or if the node already has ≥64 GB (idempotent re-run is
  a documented no-op, not an error).
- `cost = ns.hacknet.getRamUpgradeCost(0, levelsNeeded)`. Default cap **$55,000,000** (measured
  $41.7m + ~32% margin — Hacknet upgrade costs don't move on their own, so the margin exists only
  for "a different server index got renamed/rebuilt since the brainstorm," not price drift).
- If `cost > cap`: refuse, print both numbers, exit with no purchase made — same failure shape as
  `upgradehomeramonce.js`; "REFUSED" must never be mistaken for "already done."
- On success: `ns.hacknet.upgradeRam(0, levelsNeeded)`. **Verification reads
  `ns.getServer("hacknet-server-0").maxRam`**, not the return value of `upgradeRam` (house rule:
  verify, don't trust a boolean) and not `getNodeStats(0).ram` alone — both are read, and any
  mismatch between them is itself logged as a finding rather than silently resolved. Hash
  production before/after is read from `getNodeStats(0).production` — **not**
  `ns.formulas.hacknetServers.hashGainRate`, which would add an unnecessary `Formulas.exe`
  precondition this script has no other reason to carry.
- `recordTransaction(ns, {type: "expense", source: "hacknet-ram-upgrade", ...})` on success only.

**RAM:**

| `hacknetramonce.js` | GB |
|---|---|
| `hacknet.getNodeStats` | ~0.5 |
| `hacknet.getRamUpgradeCost` | 0.5 |
| `hacknet.upgradeRam` | 0.5 |
| `getServer` (verification read) | ~2.00 |
| base + file IO | ~0.5 |
| **≈4.0** | |

**Acceptance:**
- HA1. `ns.getServer("hacknet-server-0").maxRam === 64` after a successful run.
- HA2. A `transactions-*.json` record exists with `source: "hacknet-ram-upgrade"` and a non-zero
  amount, on success only.
- HA3. Idempotent: a second run against an already-64-GB node logs `"already at or above target"`,
  not `REFUSED` (that label is reserved for "can't afford it").
- HA4. Hash production before/after is logged in the run's own `hacknetramonce-<epoch>.json`, so
  the ~1.50× claim is checkable against reality instead of assumed.
- HA5. `hacknetramonce-<epoch>.json` is added to `vite.config.ts`'s filter list — without it, HA4
  never reaches `logs/` and is unverifiable from the repo side.

**Not built:** any recurring Hacknet manager. D2 stops here on purpose.

---

## 4. WI-B — `cloudmanager.js` stands itself down; `resourcemanager.js` stops reserving for a dead purchase

### Design

**`cloudmanager.js`.** `CloudServerLimit` is **0** in BN9 (confirmed live,
`logs/hacknetprobe-1787699918752.json`: `cloud.limit: 0`), so `ns.cloud.purchaseServer` can never
succeed — `cloudmanager.js`'s existing poll loop retries an impossible purchase forever. Add a
check immediately inside its `while (true)` loop, **before** the existing `OFF_MARKER` check (this
value is static per BitNode, so the check effectively fires once and the process exits — it does
not need re-checking every poll):

```js
const serverLimit = ns.cloud.getServerLimit();
if (serverLimit === 0) {
  ns.write(CLOUD_STATE_FILE, JSON.stringify(buildCloudState({
    now: Date.now(), disabled: true, disabledReason: "CloudServerLimit is 0 for this BitNode",
  })), "w");
  tprintTs(ns, "cloudmanager: CloudServerLimit is 0 -- nothing to manage, exiting.");
  return;
}
```

`buildCloudState` (existing pure function) gains `disabled`/`disabledReason` fields, defaulted
`false`/`null` in every other branch so nothing else changes shape.

**`resourcemanager.js`.** Its reservation-building pure function currently pushes a
`bootstrap-server` reservation unconditionally whenever `serverCount === 0`:

```js
if (serverCount === 0) {
  reservations.push({ key: "bootstrap-server", label: "first cloud server (cloudmanager auto-buy)", amount: BOOTSTRAP_SERVER_COST });
}
```

In BN9, `serverCount` is 0 forever — the purchase this reservation exists to fund can never
succeed — so it locks $110,000 out of every consumer of the reservation total, permanently, for
nothing. Immaterial against a multi-billion-dollar graft ladder, but real and cheap to close: thread
a `cloudServerLimit` parameter into the function (sourced from an `ns.cloud.getServerLimit()` read
already available in that script's own poll loop) and skip the push when it is 0:

```js
if (serverCount === 0 && cloudServerLimit !== 0) {
  reservations.push({ key: "bootstrap-server", ... });
}
```

RAM: unaffected in both files — `cloudmanager.js` already calls `ns.cloud.getServerLimit()`, and
`resourcemanager.js`'s new parameter is a plain value passed in by its caller, not a new `ns` call.

### Acceptance

- HB1. Unit test, `test/cloudmanager.test.js` (existing file, extended): `buildCloudState({disabled:
  true, disabledReason: "..."})` round-trips both new fields; every other call shape still defaults
  `disabled: false, disabledReason: null`.
- HB2. Live: a restarted `cloudmanager.js` (`cli.mjs restart cloudmanager.js`) prints the exit line
  once and is absent from `ps` on the next poll.
- HB3. **Regression case, `CloudServerLimit > 0`.** New case in `test/cloudmanager.test.js`: with a
  fixture value >0 (the file's existing BN6/BN10-shaped fixtures, unmodified), the new branch does
  not fire and the poll loop's bootstrap/growth/upgrade behaviour runs byte-identical to its
  pre-change output.
- HB4. Unit test, `test/resourcemanager.test.js` (existing file, extended): the reservation-building
  function called with `serverCount: 0, cloudServerLimit: 0` does **not** include a
  `bootstrap-server` entry; called with `serverCount: 0, cloudServerLimit: 2` (the BN6/BN10
  regression case) it **does** — proving the gate is conditional, not accidentally always-off.
- HB5. Live: `cloud-state.json` reads `disabled: true` after `cloudmanager.js` is restarted in BN9
  (L2, §14).

---

## 5. WI-C — the beam search

### Algorithm

**State:** a chosen candidate set, deduplicated by sorted name list (two orderings of the same set
are the same state), carrying `cumCost`, `cumGraftHours`, and the resulting `mults` before entropy
is applied for the next candidate under consideration.

**Score of a state** (lower is better):
```
score(state) = max(moneyWaitHours(state.cumCost, moneyAvailable, incomeRatePerSecDollars),
                    state.cumGraftHours)
             + bottleneckHours(state.mults, banked, grindRatePerStat, opts)
```
`moneyWaitHours` and `cumGraftHours` are `max()`-combined, not summed, because both proceed
**concurrently** — money accrues from the Hacknet in the background of a graft running, nothing
gates that. `grindHours` is added on top because grinding and grafting are **mutually exclusive**
on the single player-action slot (A3) and must run serially after every graft in the chosen set has
landed.

**Search:** breadth-first over depth (number of grafts chosen), beam width **300** (§5.1), max
depth **14**. At each depth, every state in the beam is expanded by every
admissible-and-affordable remaining candidate (prereqs owned or already in that state's set, total
cost ≤ `maxSpend`); resulting states are deduplicated by candidate-set key, kept only as their
best-scoring instance, and the top `beamWidth` by score carried to the next depth. **The best state
seen at ANY depth — not just the final one — is tracked separately and returned**, since the
optimum may sit shallower than the cap (this is what makes k=0, pure grinding, a legitimate
outcome: it is simply depth 0 of the same search, always present in the beam).

`entropyPerGraft` (0.98) is applied as `Math.pow(0.98, depth)` on top of `currentMults`, which
`graftplanner.js`'s `main()` has already divided the *already-applied* entropy back out of before
handing it to the search (unchanged Phase 41 logic: `ns.getPlayer().mults` already includes the
debuff, confirmed live 2026-08-17, `docs/grafting-reference.md` §4).

### 5.1 — Why width 300, measured

| beam width | total to gate | k | picks |
|---|---|---|---|
| 1 (pure greedy) | 52.6 h | 3 | all-four-stat augs only: SPTN-97, Bionic Spine, HemoRecirculator |
| 10 / 20 / 50 | 33.9 h | 11 | — |
| 100 | 33.7 h | 13 | — |
| **300** | **21.17 h** | **11** | the converged ladder (below) |
| 600 / 1200 / 2400 | 21.17 h | 11 | **identical to 300 — converged** |

The cliff sits between 100 and 300 — a beam smaller than 300 is not a cheaper approximation, it is a
materially wrong answer that looks plausible. 300 is specified as the floor; raising it costs search
time for zero measured benefit past this point (600–2400 are byte-identical to 300), so it is also
the ceiling in practice.

**Converged ladder (k=11, 21.17 h):** Bionic Legs, DermaForce Particle Barrier, Bionic Arms,
Augmented Targeting III, Nanofiber Weave, Bionic Spine, HemoRecirculator, Combat Rib III, Wired
Reflexes, LuminCloaking-V2, Augmented Targeting I.

### Acceptance criteria

- **WC1 (positive control).** `planGraftLadder` (`graftmath.js`) at `beamWidth: 300` against
  `logs/graftrecon-1787701791849.json` reproduces the 11-aug ladder above at `totalHours` **21.17 h**
  (2% tolerance).
- **WC2 (negative control — this is what makes WC1 a real test).** The *same* code, same fixture, at
  `beamWidth: 1` reproduces the degenerate result: `totalHours` **52.6 h**, `chosenK` **3**, picks
  limited to all-four-stat augs — this is, in fact, what a naive first implementation would produce.
- **WC3 (convergence).** Widths 300, 600, 1200, 2400 against the same fixture all return
  byte-identical `ladder`/`chosenK`/`totalHours`.
- **WC4 (entropy applied exactly once).** Two tests:
  1. Pure: at a fixture `currentMults` and `entropyPerGraft: 0.98`, a beam-search trial at depth *k*
     has effective mults equal to `currentMults[stat] × candidate-products × Math.pow(0.98, k)`,
     asserted directly.
  2. Seam: `graftplanner.js`'s `main()`, called a second time after 3 real grafts
     (`player.entropy === 3`), produces a plan whose depth-1 trial mult equals `(player.mults /
     0.98^3) × candidateProduct × 0.98^1` — exactly one additional factor of 0.98, neither
     double-applying the already-divided-out debuff nor under-counting it.
- **WC5.** `resolveNodeConfig(10, {})` reproduces Phase 41's exact BN10 constants; BN10's existing
  golden fixture (`graft-catalog-bn10.json`) passes unmodified through the new code path.
- **WC6.** RAM: `graftplanner.js` re-measured at **≤32 GB** after the move to `graftmath.js`.
  ✅ **MEASURED 2026-08-27: 30.60 GB.** 🔴 The original ≤30 gate was wrong, not the code: the
  itemisation priced `getResetInfo` at "~0 GB" (it is **1.00**) and omitted `getPlayer` (**0.50**)
  entirely. No wasted RAM was found — every charged call is genuinely used. 📌 Same class of defect
  as Phase 41's failed gate (`fb84e37`: *"BOTH causes were spec defects, not implementation
  defects"*), which this spec cited and then repeated.
- **WC7.** `graftmath.js` itself contributes **exactly 0 GB** to any importer — verified live via
  `mem` on a throwaway script that imports only `graftmath.js`, not merely asserted from its source
  containing no `ns.` text.

---

## 6. WI-D, part 1 — mandatory grind-rate calibration

### The sensitivity that makes this blocking, not optional

| assumed rate (exp/s/stat) | total to gate | k | **ladder cost** |
|---|---|---|---|
| 0.060 | 62.9 h | 10 | **$17.64b** |
| 0.090 | 46.5 h | 14 | $12.30b |
| 0.179 (BN6's borrowed `Mug` figure) | 21.2 h | 11 | $3.83b |
| 0.300 | 15.8 h | 9 | $3.39b |
| 0.500 | 12.2 h | 7 | $3.11b |

**A 3× error in this one constant swings irreversible spend 4.6×** ($3.83b → $17.64b). This table
is reproduced here specifically so the cost of skipping calibration is on the page.

### `CALIBRATE_GRIND` — a mandatory state, run after companions are up, before any real plan

```
ASSESS → LAUNCH_COMPANIONS → PAUSE_AUGFARMER → CALIBRATE_GRIND →
  (planner invoked with the measured rate) → GRAFTING | GRAFT_START | GRIND | JOIN → DONE
```

- **Crime: `Mug`.** Same crime as BN6/BN10 (all-four-stat, already the basis for the borrowed
  placeholder). Not re-derived from scratch — `combatrouteprobe.js`'s existing live crime-table
  sweep is available to re-rank crimes if `Mug` turns out not to be best in BN9's specific
  chance/exp tradeoff, but that is an optional refinement (Q10, §13), not a blocker.
- **Focus: `true`.** Carried from Phase 41's S-2 decision (BN10 measured focused exp/sec exceeding
  unfocused). Not re-measured for BN9 specifically — flagged as an assumption (Q11, §13).
- **Travel: none.** `commitCrime` does not require a specific city — `combatrouteprobe.js` computes
  its crime-rate table with zero `travelToCity` calls, the existing evidence this build behaves the
  same way. `travelToCity`'s RAM budget (§9) is for **grafting only** (New Tokyo), never for `Mug`.
- **Sleeve contribution: captured for free.** `bn9entry.js` makes **no `ns.sleeve.*` call of its
  own** (§8). It optionally reads `sleeve-state.json` (`ns.read`, 0 GB, the same file
  `sleevemanager.js` already writes) purely to log what the sleeve was doing during the calibration
  window — informational only, since the rate itself is measured from the player's own realised
  exp regardless of source.
- **Bounded duration:** ends at `attempts ≥ 20 AND elapsed ≥ 5 min`, OR a hard cap of **20 min**
  elapsed regardless of attempt count (guards against calibration itself running away). Per-stat
  exp deltas divided by elapsed seconds produce `grindRatePerStat`, passed to `graftplanner.js` as a
  CLI override.
- **Re-calibration:** `liveGrindRate` continues refining the estimate from `bn9entry-log.json`'s
  ongoing samples after the initial calibration; a >20% drift from the plan's recorded rate is a
  replan trigger (WD3, §7).

### Acceptance

- WD-CAL1. `CALIBRATE_GRIND` is unconditionally run before the **first** call to `graftplanner.js`
  used to select a real graft (a diagnostic/dry-run invocation does not count).
- WD-CAL2. The calibration window terminates on the stated bounds, tested at each boundary
  (attempts-only, time-only, hard-cap).
- WD-CAL3. `bn9entry-log.json` records which rate was in effect for every logged decision:
  `"calibration-pending"` (the `NODE_CONFIGS[9]` placeholder — should only appear before
  `CALIBRATE_GRIND` completes) / `"calibrated"` / `"live-refined"`.

---

## 7. WI-D, part 2 — the executor

**States:** `ASSESS → LAUNCH_COMPANIONS → PAUSE_AUGFARMER → CALIBRATE_GRIND → GRAFTING |
GRAFT_START | GRIND | JOIN → DONE`.

```js
export function decideEntryAction(ctx) {} // {kind: "graft"|"grind"|"join"|"replan"|"hold", reason}
```

**Precedence, strict order:**
1. **`hold`** if a graft is in flight (`ctx.currentWork.type === "GRAFTING"`) — outranks even
   `join` (A3).
2. **`join`** if all four combat stats ≥ 100.
3. **`replan`** if plan inputs have drifted (below).
4. **`graft`** if the next admissible-and-affordable step exists.
5. **`grind`** otherwise — **the sole fallthrough, never idle**, since the gate is reachable by
   grinding alone even at k=0.

**Replan triggers:** any combat stat's level rose ≥5 since the plan was computed; money rose past
the next step's price; entropy differs from the plan's recorded value; plan age >6 h; grind-rate
drift >20% from the plan's recorded rate (§6).

**`LAUNCH_COMPANIONS`** (the executor's first real action): `ns.exec("bn9companions.js", "home")`,
guarded by `ns.scriptRunning` for idempotency on a restart. This is the **only** place `bn9entry.js`
ever launches another resident — there is no second, post-join launch step; `bn9companions.js`
handles `bladeburnermanager.js`'s later gate opening on its own once the join succeeds.

**`PAUSE_AUGFARMER`:** writes `augfarmer-pause.txt` (the existing marker `augfarmer.js` already
honours — no change to that file), then verifies via `ns.scriptRunning("augfarmer.js", "home")`
polled to confirm it has actually released `SLOT_HOLD_FILE` (the same release-then-reacquire
handshake Phase 41's precedent documents for this exact marker) before `CALIBRATE_GRIND` proceeds.
`augfarmer.js` is confirmed live and holding the slot as of node entry (features doc §0), so this is
an executed step against a known starting state, not a defensive check against an anomaly.

**Preflight rail:** `ASSESS`'s first action, repeated on every `replan`, is a **scripted**
assertion: `ns.read("ratchet-mode.txt").trim() === "observe"`. Anything else halts immediately
(`bn9entry-hold.txt`, same mechanism as L3, §14), logs the observed value, and starts nothing —
grafting or grinding — until cleared by hand. This is defense in depth: `bn9entry.js` itself never
calls `installAugmentations` (verified by code review — no such call exists anywhere in
`bn9entry.js`/`bn9companions.js`/`hacknetramonce.js`), but `installer.js` is a **separate**,
already-existing resident that reads the same marker; if it were ever flipped to `auto` by anything
else, this preflight stops `bn9entry.js` from continuing to feed it a rising Entropy pile mid-ladder.

**Planner/executor handshake** — treats `graftplanner.js` as a request/response pair, not a
fire-and-forget exec:
1. Record `execStartMs = Date.now()` immediately before `ns.exec("graftplanner.js", "home", 1,
   ...args)`.
2. Poll `ns.scriptRunning("graftplanner.js", "home")` every 2 s.
3. On `false`, read `graft-plan.json`. Trusted **only if** `outRecord.ts >= execStartMs` — guards
   against reading a stale file from an unrelated prior invocation. Mid-write corruption is **not**
   a concern: `ns.write` is synchronous in this single-threaded runtime (the same invariant
   `translog.js`'s header documents and relies on for `recordTransaction`'s read-modify-write
   safety — there is no `await` between a script's write call and its return).
4. **Timeout:** 120 s. On timeout: log `planner-timeout`, retry once (re-exec). A second timeout:
   halt (`bn9entry-hold.txt`), log loudly, take **no further graft or replan action** until cleared
   by hand — this gates a multi-billion-dollar irreversible sequence.
5. **`{fatal: ...}` records** (no `ladder`/`chosenK` — `graftplanner.js`'s existing abort path):
   logged distinctly as `planner-fatal` with the message. `decideEntryAction` never reads
   `ladder`/`chosenK` off a record carrying `fatal` — the absence of a ladder is handled safely by
   construction (no admissible candidate ⇒ `grind`, the sole fallthrough) — but the fatal condition
   is still surfaced. Retried on the same backoff as a timeout (once, then hold).

**Every successful graft calls `recordTransaction`:** `recordTransaction(ns, {type: "expense",
source: "graft", detail: augName, amount: realisedPrice})`, on success only — mirroring
`graftladder.js`'s existing convention exactly.

### Acceptance

- WD1. `decideEntryAction` returns `hold` whenever a graft is in flight, outranking `join` — tested
  at the exact case where stats cross 100 mid-graft.
- WD2. Returns `grind` (never idle) when the entropy ceiling or money floor bind — tested at each
  boundary.
- WD3. Returns `replan` for each of the five triggers listed above, each with its own test.
- WD4. `bn9entry-log.json` records, per sample: timestamp, four combat exp values + levels, money,
  entropy, current action kind, decision + reason, and which grind-rate source is in effect.
- WD5. RAM ≤ **34 GB** (`mem bn9entry.js`), itemised §9, re-measured live.
- WD6. `joinBladeburnerDivision()`'s boolean is never trusted — success confirmed by a subsequent
  `getRank()` call, retried on a bounded cadence, logged distinctly from a thrown call.
- WD7. `LAUNCH_COMPANIONS` execs `bn9companions.js` exactly once per `bn9entry.js` lifetime —
  idempotency checked via `ns.scriptRunning` before the exec, so a restart after a crash does not
  spawn a second copy.
- WD8. `PAUSE_AUGFARMER` runs before any slot-claiming action; a live check confirms `augfarmer.js`
  actually released `SLOT_HOLD_FILE`, not merely that the marker file exists.
- WD9. The `ratchet-mode.txt` preflight halts on any value other than `observe`, tested at both the
  startup check and a mid-run replan-time check.
- WD10. The handshake's four failure paths (stale-plan rejection, single timeout+retry,
  double-timeout halt, `fatal`-record handling) are each unit-tested against a faked `ns`.
- WD11. Every successful graft calls `recordTransaction` with `source: "graft"`, on success only.
- WD-SL. `bn9entry-log.json` records the sleeve's task/sync **read from `sleeve-state.json`** (not
  a direct `ns.sleeve.*` call) alongside every `CALIBRATE_GRIND`/grind sample. If the file is
  absent or stale (`sleevemanager.js` not yet up), the field logs `null` rather than blocking —
  `bn9entry.js` has no runtime dependency on `sleevemanager.js`'s liveness beyond having launched
  it once.

---

## 8. WI-F — `sleevemanager.js` gains a `syncThreshold` policy mode

### Why the sleeve needed a design change at all

SF10 (held) grants the sleeve mechanic — including the base sleeve slot already purchased while in
BN10 — permanently; only *further* purchases (a second sleeve, memory upgrades) are gated to being
*made* inside BN10. A sleeve is confirmed present in BN9 (`logs/sleeve-state.json` shows 1).
`joinBladeburnerDivision()`'s combat gate reads the **player's** skills only — a sleeve's own stats
never satisfy it directly — but a working sleeve feeds the **host** exp too, linearly scaled by its
current `sync` (`docs/sleeve-grafting-reference.md`, verbatim: *"both the sleeve and the player's
original host consciousness earn N% of the amount normally earned"*). Since that exp lands in the
same `banked` pool `CALIBRATE_GRIND` measures (§6), the sleeve needs a task assignment for its
contribution to show up in the calibrated rate at all.

### Why the fix lives in `sleevemanager.js`, not `bn9entry.js`

`src/sleevemanager.js` **already exists** as a standalone resident doing almost this exact job:
measured live at **17.70 GB** (its own header: *"getNumSleeves 4 + getSleeve 4 + getTask 4 +
setToCommitCrime 4 = 16 GB + base"*), with an existing pause rail (`sleevemanager-pause.txt`) and an
existing pure decision function (`decideSleeveAction`, already unit-tested). Every `ns.sleeve.*`
method costs a flat 4 GB (confirmed against `markdown/bitburner.sleeve.*.md` for
`getNumSleeves`/`getSleeve`/`getTask`/`setToCommitCrime`/`setToSynchronize`). Building the same
capability again inside `bn9entry.js` would mean paying that RAM a second time in a second process
for nothing — `bn9entry.js` makes **zero `ns.sleeve.*` calls** in this design.

### The fix: one additive delta, gated behind an explicit opt-in

`sleevemanager.js`'s current philosophy is deliberately conservative: *"It does NOT override a
deliberate non-crime assignment... only IDLE is treated as a fault."* B9's needed policy — actively
switching the sleeve between `Synchronize` (below a sync threshold) and crime (at or above it) — is
a **different, more active** policy. Rather than changing the existing default (which other
contexts may rely on), the file gains an **opt-in mode**, off unless a threshold is passed:

```js
// New export shape, alongside the existing decideSleeveAction. Old callers (no threshold
// argument) get byte-identical behaviour -- this is additive, not a default change.
export function decideSleeveAction(taskNow, sync, syncThreshold) {
  if (syncThreshold === undefined) {
    // existing behaviour, UNCHANGED: fix idle only, respect every deliberate task.
    ...
  }
  // BN9 active-policy mode:
  //  - sync below threshold and not already Synchronizing -> synchronize
  //  - sync at/above threshold and currently idle OR Synchronizing -> crime
  //  - any OTHER deliberate task (Recovery, Company, Faction, Bladeburner, ...) is still
  //    left alone -- this mode only arbitrates between Synchronize and Crime, nothing else.
}
```

`main()` reads the threshold from `ns.args[0]` (absent = legacy default-off behaviour, preserving
every existing call site). `bn9companions.js` launches it with the BN9 value:
`ns.exec("sleevemanager.js", "home", 1, "50")` — threshold 50, chosen because sync's benefit
compounds, so raising it early pays off across the whole remaining grind (BN10 precedent: sync
climbed 27 → 100 unattended over a comparable wall-clock window while running `Synchronize`).

**RAM:** `setToSynchronize` (4 GB, confirmed) is a new reachable method name in this file, on top
of the existing 16 GB. **Estimated 21.70 GB** (17.70 GB measured baseline + 4.00 GB for the one new
method) — anchored to a real measurement, not a blind guess, but still pending live confirmation
(WF4, Q12 §13).

### Acceptance

- WF1. `decideSleeveAction(taskNow, sync, undefined)` is byte-identical to the pre-existing
  function for every case its current tests already cover — a straight non-regression check.
- WF2. `decideSleeveAction(taskNow, sync, 50)` is unit-tested across: idle+low-sync → synchronize;
  idle+high-sync → crime; already-synchronizing+sync-crossed-threshold → crime;
  already-synchronizing+still-below → none; any other deliberate task at any sync → none (unchanged
  deference).
- WF3. Live: `sleevemanager.js 50` running in BN9 is observed switching the sleeve from
  `Synchronize` to `Mug` once `getSleeve(0).sync` crosses 50 — one live observation, since the
  pure-function tests carry the real coverage.
- WF4. RAM re-measured live; if it lands materially above 21.70 GB, that is investigated before
  `bn9companions.js` is trusted to launch it unattended.
- WF5. `sleeve-state.json`'s existing shape gains the current `sync` value if it doesn't already
  carry one (check the existing file before assuming a new field is needed) — this is what WD-SL
  (§7) reads.

---

## 9. RAM itemisation

| `hacknetramonce.js` | GB |
|---|---|
| (§3's table) | **5.10 MEASURED 2026-08-27 (gate 6)** |

| `graftplanner.js` | GB |
|---|---|
| `getGraftableAugmentations` | 5.00 |
| `getAugmentationGraftPrice` | 3.75 |
| `getAugmentationGraftTime` | 3.75 |
| `getAugmentationStats` | 5.00 |
| `getAugmentationPrereq` | 5.00 |
| `getOwnedAugmentations` | 5.00 |
| `getResetInfo` (non-Singularity) | ~0 |
| `graftmath.js` import | **0.00 — verified live, not estimated (WC7)** |
| base + file IO | ~1.60 |
| **30.60 MEASURED 2026-08-27 (gate 32)** | |

| `bn9entry.js` | GB |
|---|---|
| `graftAugmentation` | 7.50 |
| `commitCrime` | 5.00 |
| `travelToCity` (graft only, never grind) | 2.00 |
| `joinBladeburnerDivision` | 4.00 |
| `getCurrentWork` | 0.50 |
| `getCrimeStats` (calibration fallback) | 5.00 |
| `bladeburner.getRank` | 4.00 |
| `bladeburner.inBladeburner` | ~0 |
| `exec` + `scriptRunning` (companions + handshake) + base + file IO | ~3.00 |
| `graftmath.js` import | 0.00 |
| `ns.sleeve.*` | **none — lives in `sleevemanager.js` (§8) instead** |
| **28.10 MEASURED 2026-08-27 (gate ≤34) ✅ PASS, 5.9 GB headroom** | |

| `sleevemanager.js` (existing file, extended) | GB |
|---|---|
| `getNumSleeves` | 4.00 |
| `getSleeve` | 4.00 |
| `getTask` | 4.00 |
| `setToCommitCrime` | 4.00 |
| `setToSynchronize` (new, WI-F) | 4.00 |
| base + file IO | ~1.70 (matches the existing 17.70 GB live measurement's implied base) |
| **≈21.70 estimated (17.70 GB measured baseline + 4.00 GB), re-measure live (WF4)** | |

| `bn9companions.js` | GB |
|---|---|
| `bladeburner.inBladeburner` | ~0 |
| `scriptRunning` | ~0.10 |
| `exec` | 1.30 |
| base + file IO | ~0.50 |
| **4.00 MEASURED 2026-08-27 (gate 6) ✅ PASS** | |

**Sanity check against home's 512 GB:** `bn9entry.js` (~31.0) + `bn9companions.js` (~1.9) +
`sleevemanager.js` (~21.7) + `bladeburnermanager.js` (unchanged, out of this phase's scope) sits
comfortably inside headroom even with `daemon.js` staying down and the rest of the already-running
companion set (`transactionsmonitor.js`, `resourcemanager.js`, `dashboard.js`, `goallog.js`,
`ratchetlog.js`, `gatewatch.js`, `backdoorfactions.js`, `backdoorwd.js`).

⚠️ **Identifier hygiene:** avoid `graft`, `work`, `exec`, `share`, `read`, `write`, `kill`, `run`,
`ls`, `ps`, `scan`, `hack`, `grow`, `tail`, `window`, `document`, `process` as local/property names
in every new/changed file.

⚠️ **New `src/` files need an in-game `wget` seed** (ASCII-only): `graftmath.js`, `bn9entry.js`,
`bn9companions.js`, `hacknetramonce.js`. `sleevemanager.js`, `cloudmanager.js`, `resourcemanager.js`
are **not** new — existing, already-synced files being extended, needing no seed step.

---

## 10. WI-E — `bn9companions.js` + machine-checked S-RF re-verification

`bn9companions.js` supervises **two** companions (§2's A4): `sleevemanager.js` (always, launched
with the BN9 `syncThreshold` argument) and `bladeburnermanager.js` (gated on
`ns.bladeburner.inBladeburner()`). `shouldLaunch(isRunning, gateOpen)` is a pure function called
once per companion per ~10 s poll:

```js
export function shouldLaunch(isRunning, gateOpen) {
  return gateOpen && !isRunning;
}
```

For `sleevemanager.js`, `gateOpen` is always `true`; for `bladeburnermanager.js`, it is
`ns.bladeburner.inBladeburner()`. Writes `bn9companions-state.json` (last check, last launch per
target, current running/gated status) so a dead supervisor loop is itself visible.

**Machine-checked S-RF re-verification.** A small read-only script (reusing `tracksweep.js`'s
existing realised-success computation against `bladeburnermanager.js`'s ledger if its shape
generalises to whichever action is dominant in BN9; otherwise a short new probe following that
pattern) computes `realisedSuccess` for the dominant rank-producing action once it has **≥100
attempts**. Its output file carries a numeric `realisedSuccess` and an explicit boolean
`srfProtected: realisedSuccess >= 0.90` — the branch decision (§11) is read from that file, not
eyeballed from a dashboard or asserted in prose.

**L3's clearing procedure** (referenced from §14): `bn9entry-hold.txt` is written by the running
`bn9entry.js` process directly into the in-game filesystem via `ns.write` — it has no local `src/`
counterpart and is invisible to `git status` or viteburner's watcher (only files that live under the
local `src/` folder on disk are pushed by viteburner; a marker a running script writes exists only
in-game). To clear it: delete it **from inside the game** — a terminal `rm bn9entry-hold.txt` (via
`node tools/bb/cli.mjs terminal "rm bn9entry-hold.txt"` or by hand), confirmed cleared on
`bn9entry.js`'s next poll.

### Acceptance

- WE1. `shouldLaunch` unit-tested against all four boolean combinations, applied to both companion
  targets (the sleeve gate is always-true, the Bladeburner gate is conditional — two call sites of
  the same pure function, not two functions).
- WE2. Live: both companions appear in `ps` within one poll interval of being eligible.
- WE3. Live: a killed `sleevemanager.js` or `bladeburnermanager.js` comes back within one poll
  interval, without restarting `bn9entry.js` or anything else.
- WE4. The S-RF re-verification output file exists, contains a numeric `realisedSuccess` and a
  boolean `srfProtected := realisedSuccess >= 0.90`, and the close-out changelog entry (§15) quotes
  those values rather than restating a judgement.
- WE5. RAM: `bn9companions.js` ≤6 GB (§9) — unaffected by supervising two targets instead of one,
  since `exec`/`scriptRunning` are the same method names regardless of argument.

---

## 11. Phase-42 disposition

- If `realisedSuccess ≥ 90%` (WE4): S-RF is protecting the dominant action as designed, matching
  BN6's regime. **File `phase-42-field-analysis.features.md` to `docs/phases/unshipped/`**
  (housekeeping only, no content change), noting BN9's measured rate and the date.
- If `realisedSuccess < 90%` (BN10's regime): Phase 42's premise re-applies verbatim. Move the file
  to `docs/phases/unshipped/`, then reopen it as a **new** phase number's stage-1 brainstorm per
  that folder's own "how to revive" convention (renumber, don't spec straight off the filed copy),
  citing BN9's fresh realised-rate numbers as the reopening evidence.

Neither branch is built as part of this phase — the second would be its own stage 1/2/3 cycle — but
the decision rule is pinned here so it is not left ambiguous the way the original hazard warned
against.

---

## 12. Objections and corrections — the decision trail

This section is deliberately historical — everywhere else in this document states the current
design directly; this is the record of what changed and why, kept because dropped objections and
corrected mistakes are supposed to leave an artifact, not a memory.

### 12.1 — WI3/WI4 merge, money-wait modelling

The features doc's table lists "graft ladder" and "combat grind to 100×4, then join" as separate
work items. This spec merges them into **one** state machine (`bn9entry.js`), because grafting and
grinding are mutually exclusive on the same player-action slot and must be arbitrated by a single
decision function — splitting them back into two scripts would reinvent a coordination problem
Phase 41 already solved (`docs/bladeburner-reference.md` §8's "four scripts contend for one slot"
failure class). Separately, this spec does not track a standalone "money-wait" state at
execution time — the executor's precedence rule (`graft` if affordable, else `grind`, never idle)
fills any affordability gap with productive grinding automatically. The beam search's own
`max(moneyWaitHours, cumGraftHours)` scoring term (§5) is a **planning-time** estimate used only to
rank candidate ladders; it does not need to match the executor's real-time behaviour exactly to be
useful for that ranking, and the two are not in tension.

### 12.2 — Markers are in-game-only, not pushed by viteburner (except `ratchet-mode.txt` itself)

An earlier draft of this spec claimed every `-off.txt`/`-hold.txt` marker created by this phase's
scripts lives under `src/` and is therefore pushed by viteburner. That is wrong for every marker
except `ratchet-mode.txt` itself. A marker a *running script* writes via `ns.write` lands only in
the in-game filesystem — there is no local `src/` file for it, nothing for viteburner to push, and
nothing for an in-game deletion to "revert to," because there is no on-disk source-of-truth copy to
revert from. `ratchet-mode.txt` is the one genuine repo file among these (it exists on disk at
`src/ratchet-mode.txt`, is gitignored, and **is** pushed by viteburner on every dev-server-connected
change) — that specific claim, and only that one, was correct. §10's clearing procedure states the
corrected version at the point it matters.

### 12.3 — `graftmath.js` vs extending `common.js`'s charter

An alternative to a new file would have been loosening `common.js`'s stated charter to allow graft
math and accepting its ~1 GB `ns.scan` footprint as a rounding error against a 30 GB gate. Rejected:
the charter comment exists on purpose ("no policy decisions, no batching/finance math"), and a 0 GB
number that is actually 0 GB is strictly better than a "small, acceptable" number that has to be
re-justified every time someone reads the file fresh. Cost if this call is wrong: one more file in
`src/` to seed via `wget` — negligible.

### 12.4 — Sleeve support: placed in `sleevemanager.js`, not `bn9entry.js`

An earlier draft modelled the sleeve's combat-exp contribution as new `ns.sleeve.*` calls inside
the entry executor (~16 GB, correctly estimated in isolation). That duplicated an existing resident
(`sleevemanager.js`, 17.70 GB measured, already doing this job) rather than extending it. Fixed by
adding one opt-in `syncThreshold` policy mode to the existing file instead (§8) — `bn9entry.js`
makes zero `ns.sleeve.*` calls, and `bn9companions.js`'s job expanded from "supervise
`bladeburnermanager.js`" to "supervise the two residents `daemon.js` would have launched and never
did," since `sleevemanager.js` was never in `RESIDENT_COMPANIONS` even in BN10.

---

## 13. Open questions — defaults and dates, per `CLAUDE.md`'s "open decisions carry a default and a date" rule

| # | Question | Default if unanswered | Expires |
|---|---|---|---|
| Q1 | Rank/SP granted per `Exchange for Bladeburner...` hash purchase | Marginal; no hash-spender feature is built (D3). WE4's script or a one-off measures it once on join day, for the record only. | 2026-09-05 |
| Q2 | Was `daemon.js` stopped deliberately, or did it crash (`cloudmanager.js`'s pre-WI-B retry loop is the prime suspect if so)? | **Moot for this spec** — `daemon.js` stays down regardless of the answer (D1). Worth a look only if the same crash class is suspected elsewhere. | 2026-08-28 |
| Q3 | Where did `hacknet-server-0` come from? (`hacknet_expenses` reads 0 at a level costing ~$54b to build.) | Assume a node-entry grant. Load-bearing for the no-install rail (Q7) regardless of the answer. | 2026-09-01 |
| Q5 | `w0r1d_d43m0n` is not yet a valid host — when does it appear, and do `backdoorwd.js`/`gatewatch.js` degrade cleanly against a missing host? | Assume it appears later and both scripts are harmless. Check their logs once during the phase's live gates. | 2026-09-01 |
| Q6 | Does the $250,000/hash auto-sell rate hold as Hacknet production scales, or does it escalate once `Sell for Money` leaves level 0? | Assume flat. WI-A's before/after production log is free supporting evidence either way. | 2026-09-05 |
| Q7 | Does an augmentation install reset Hacknet Servers? | **Standing rail, no expiry** — never install in BN9, regardless of the answer (§12.2, the no-install rail). Not testable without doing it, which is exactly why it is never tested. | no expiry |
| Q8 | Does the beam search's `incomeRatePerSecDollars` input need to reflect WI-A's post-upgrade Hacknet rate, or the pre-upgrade rate? | Use the **live, current** rate at the moment `CALIBRATE_GRIND`/replanning runs (read fresh each time, not cached from before WI-A) — since WI-A runs first (§1's Ordering), every real plan already sees the post-upgrade rate; this only matters for a diagnostic dry-run before WI-A lands. | Resolves itself once WI-A ships; no external date needed |
| Q9 | Does `dashboard.js`'s existing cloud panel render the new `disabled`/`disabledReason` cloud-state fields gracefully, or does it need its own change? | Assume it degrades gracefully (unknown fields are typically ignored). Check once live after WI-B ships; file a `BACKLOG.md` item if not — not a blocker for WI-B itself. | 2026-08-29 |
| Q10 | Is `Mug` actually the best available crime for BN9's specific chance/exp tradeoff, or would `combatrouteprobe.js`'s existing sweep pick a different one? | Use `Mug` (§6) — same crime as BN6/BN10, already the basis for the borrowed placeholder. Re-rank only if the calibrated rate (WD-CAL) comes back materially worse than the 0.179 exp/s/stat placeholder. | 2026-09-10 |
| Q11 | Is focused grinding still the higher-exp/sec choice specifically in BN9, or only in BN10 where it was measured (Phase 41's S-2)? | Assume focused (§6) — carried from BN10 precedent, not re-measured. `CALIBRATE_GRIND`'s own log makes an unfocused A/B cheap to run later if this is ever in doubt. | 2026-09-05 |
| Q12 | Is `sleevemanager.js`'s extended RAM cost genuinely ≈21.70 GB (17.70 GB measured baseline + 4.00 GB for `setToSynchronize`), or does the addition trigger a hidden second charge? | Assume 21.70 GB estimated; **WF4 requires a live `mem sleevemanager.js` remeasure before `bn9companions.js` is trusted to launch it unattended** — this is a blocking implementation-time check, not a soft default. | Resolves at WF4, before WI-E ships live |

---

## 14. Test plan

- **Unit (`graftmath.js`):** `statHoursRemaining`, `bottleneckHours`, `moneyWaitHours`,
  `liveGrindRate`, `resolveNodeConfig`, `planGraftLadder` (WC1–WC4).
- **Unit (`bn9entry.js`):** `decideEntryAction` (WD1–WD3), the handshake's four failure paths
  (WD10).
- **Unit (`sleevemanager.js`):** WF1 (non-regression on the existing `decideSleeveAction`), WF2 (the
  new `syncThreshold` mode) — in the file's existing test file if one exists, else
  `test/sleevemanager.test.js`.
- **Unit (`bn9companions.js`):** `shouldLaunch`, exercised for both companion targets.
- **Unit (`cloudmanager.js` / `resourcemanager.js`):** HB1/HB3 in `test/cloudmanager.test.js`,
  HB4 in `test/resourcemanager.test.js` (both existing files, extended).
- **Golden fixtures:** WC1/WC2/WC3, sourced from `logs/graftrecon-1787701791849.json`.
- **Baseline:** green `npm test` at whatever count it reads at branch time — zero regressions
  against the branch point, not a number copied from this document.
- **RAM gates:** WC6 (≤30 GB) + WC7 (exactly 0 GB), WD5 (≤34 GB), WF4 (~21.70 GB estimated,
  re-measure), WE5 (≤6 GB), HA (≤4 GB, no gate concern beyond spot-checking no `ns`-heavy import
  snuck in).
- **`npm run verify:log`:** extended to `bn9entry-log.json`, `bn9companions-state.json`,
  `hacknetramonce-<epoch>.json` — all three added to `vite.config.ts`'s filter list (precedent: the
  existing `graft-plan.json`/`bn10entry-log.json` entries near the bottom of that file's filter
  chain).

### Live gates

- **L1** — after WI-A: `ns.getServer("hacknet-server-0").maxRam === 64`; hash production before/after
  logged via `getNodeStats(0).production`, confirming the ~1.50× step rather than assuming it.
- **L2** — after WI-B: `cloudmanager.js` absent from `ps`; `cloud-state.json` reads `disabled:
  true`; `resourcemanager.js`'s reservation total no longer includes the $110k `bootstrap-server`
  line.
- **L3** — code-enforced halt after the **first** real graft: `bn9entry.js` writes
  `bn9entry-hold.txt`, keeps grinding, starts no further graft, until cleared. Records: entropy
  delta (expect exactly +1), realised vs projected price, realised vs projected duration, realised
  vs projected per-stat mult delta. Cleared per §10's procedure.
- **L4** — combat 100/100/100/100 confirmed live; `joinBladeburnerDivision()` verified by a
  subsequent `getRank()` call, never its boolean return.
- **L5** — no slot theft: `augfarmer.js` confirmed paused **by this phase** (WD8 — caused, not
  coincidentally already true) before any grind or graft; no `backdoorfactions.js`
  `installBackdoor` activity overlaps a graft window.
- **L6** — companion supervision: a killed `sleevemanager.js` **and** a killed
  `bladeburnermanager.js` each come back within one `bn9companions.js` poll interval.
- **L7** — WE4's machine-checked S-RF gate output file inspected; the §11 branch decision recorded
  against its `realisedSuccess`/`srfProtected` values.

---

## 15. Changelog entry draft (fill in at close-out, not now)

```
### Phase 43 -- BN9 opening (2026-08-2X)
- graftplanner.js's selection replaced twice: sum->max, then greedy->beam search after a width-1
  greedy walk was shown to only ever pick all-four-stat augs from a tied 1/1/1/1 start (52.6h vs
  21.17h converged, 2.5x worse). Beam width 300 verified converged to width 2400.
- The shared pure planning surface (NODE_CONFIGS, bottleneckHours, the beam search, liveGrindRate)
  lives in a new, genuinely zero-ns module, graftmath.js, verified live at exactly 0GB per
  importer -- an earlier draft placed it in common.js, which turned out to cost ~0.9-1.0GB via an
  ns.scan/scheduler.js import-bleed chain.
- New mandatory CALIBRATE_GRIND step: a bounded live Mug-grind sample runs before graft #1, because
  the borrowed BN6 grind-rate placeholder was shown to swing irreversible spend 4.6x if wrong
  ($3.83b at 0.179 exp/s/stat vs $17.64b at 0.060).
- Sleeve support for BN9's combat-exp contribution lives in a small, additive extension to the
  existing src/sleevemanager.js (a syncThreshold policy mode), not new code in the entry executor
  -- bn9entry.js makes zero ns.sleeve.* calls.
- bn9companions.js supervises the two residents daemon.js would have launched and never did
  (sleevemanager.js, bladeburnermanager.js), launched early rather than post-join.
- cloudmanager.js self-terminates when CloudServerLimit is 0; resourcemanager.js stops reserving
  $110k for a bootstrap-server purchase that can never succeed.
- [fill in: measured calibrated grind rate, actual chosenK/ladder/cost, entropy landed at, join
  timestamp, S-RF re-verification result and which Phase-42 branch was taken, all new/changed
  scripts' live-measured RAM against their gates]
```

---

**Next stage:** implement (sonnet), on a branch, per `CLAUDE.md`'s workflow — `npm test` green, RAM
gates measured live (especially `graftmath.js`'s claimed 0 GB and `sleevemanager.js`'s extended
~21.70 GB), `npm run verify:log` extended and passing against the newly-registered `vite.config.ts`
entries, live gates L1–L7 run in order. Not started by this document.
