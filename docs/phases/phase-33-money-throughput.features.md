# Phase 33 features: money-throughput acceleration (BN2.1)

**Stage:** Brainstorm (opus). Output: decisions, rejected alternatives, open questions. Not a
spec — the spec (fable) + `spec-reviewer` pass come next.

**Decisions (2026-07-21):**
- **Sequence: A first, then B.** Spec + ship purchase-ordering (certain, software-only) before
  touching the riskier gang optimization; then build the money-at-task probe and spec B.
- **Install-time home-RAM sweep: already handled — dropped from scope.** Verified `installer.js`
  (L9-13, L65-98) already runs max home RAM → max home cores → `installAugmentations`, each tier
  logged via `recordTransaction`. The durable-fleet lever is live; nothing to build.

**Working dir:** `C:\Users\admin\bitburner-scripts`. `gangmanager.js` is **unfrozen** (Phase 29
observation window closed early). Foundation reads: `src/augfarmer.js` (`pickTarget` +
`planActions`), `src/gangmanager.js` (`evalLadderMove` + `TASK_LADDER`), `docs/archive/gang-api.md`
(task weights / Formulas surface), `logs/gangtaskcompare-1784562548352.json` (base task yields).

---

## The one fact that governs this phase

**Money throughput is the sole blocker to clearing BN2.1, and it is FLAT.** Everything else is
retired: rep is saturated (~425× over goal), the gang is at its 12-member cap and
equipment-saturated, territory (Tier 4) is measured-infeasible and permanently deferred
(`phase-30-gang-territory.features.md`). The win is `M ≈ 16.7` (core NiteSec catalog ~$149B + NFG
tail); we are at **M = 1.51 (9%)** with income **FLAT at $2.92M/s** (gang 94% / batcher 6%).

At $2.9M/s a single $37B aug is ~3.6h and prices escalate ×1.9/purchase. Three things attack
throughput: **(A) make each dollar buy more aug** (stop overpaying the escalation), **(B) earn more
dollars from the 94% engine** (retarget the gang from respect, worthless at the margin, to money),
and **(C) stop starving cheap utility/bootstrap augs** (allow-listed but never acquired — we lose
CashRoot's per-install BruteSSH + $1M every cycle).

Live snapshot (2026-07-21, exported): money $11.87B · income $2.92M/s FLAT (gang $2.75M/s,
batcher $0.18M/s) · next aug OmniTek InfoLoad $37.47B, rep-met, money-blocked ~1h · fleet 1×512GB
frozen (available $0, aug reservation) · gang 12/12 saturated, wantedLevel 1, territory 14.3%.

---

## Workstream A — aug purchase ordering (stop overpaying the escalation)

### The mechanic
Every aug purchased in a reset raises the price of every subsequent aug by ×1.9 (discrete augs;
NFG measured ×2.166, see `NFG_PRICE_LADDER`). The Nth aug bought costs `base_N × 1.9^(N-1)`. Total
cycle spend `Σ base_k × 1.9^(k-1)` is minimized by assigning the **largest base price to the
smallest exponent** — i.e. **buy most-expensive-first, cheap count-fillers last**.

### What we do today (the bug)
`pickTarget` (`src/augfarmer.js` ~L707) sorts rep-met candidates **score-DESC, then price-ASC**,
and the A1 gate-filler path is explicitly **cheapest-first**. Neither is escalation-aware. This
cycle's actual buys ran ascending price: $250M → $1.045B → $3.971B → $15.43B → ($37.47B pending)
— the exact worst order. The fable memo's rough arithmetic put this cycle at **~$58B paid vs
~$27B optimal (~2.2×)**; verify the multiplier and magnitude at spec stage before quoting a
number, but the *direction* is certain.

### Key insight: decouple "which" from "what order"
- **Which augs** to buy in a cycle stays goal-driven (all reachable score-positive augs + the
  count-fillers the Daedalus gate needs). Unchanged.
- **What order** to buy that fixed set in should be **price-descending**, independent of score.
  Since the whole set gets bought eventually and the *benefit lands at install* (queued augs), the
  intra-cycle order affects only total cost, never when the M gain arrives. Expensive-first is
  therefore strictly cheaper with no downside to timing.

### Design questions for the spec
1. `pickTarget` returns one target per pass and the farmer saves up for it. Does A become "target
   the most-expensive reachable aug first" (changing the sort key), or a separate
   cycle-ordering pass? Leaning: change the rep-met sort to **price-DESC primary** (score becomes
   a tie-break), keep fillers strictly last.
2. Interaction with the NFG tail: NFG is bought during spend-down at the end of a cycle already
   (`planActions` spend-down phase). Confirm NFG stays last (it's the cheap-per-level tail) and
   isn't reordered ahead of discrete augs.
3. Does buying the expensive aug first meaningfully delay the *first* queued aug (raising the risk
   an install triggers with fewer augs queued)? Probably negligible — quantify against the trigger
   logic. Log the change as a flagged deviation if it moves install cadence.
4. Escalation multiplier is per-reset and applies across *all* aug purchases including the gang's?
   No — gang equipment is a separate price track (`ns.gang.getEquipmentCost`), unaffected. Confirm.

**Certainty:** highest of anything in this phase. Pure software, no live-state dependency, testable
in vitest against a synthetic basket. Ship-gate is `npm test` + a live cycle confirming lower paid
total.

---

## Workstream B — gang money-objective retargeting

### Current state (measured)
The ladder is dynamic (`evalLadderMove` every `PLAN_TICKS`=5), but **respect-objective end to
end** — promote picks largest respect gain, heat-demote picks lowest respect-per-heat,
efficiency-demote picks respect regression. `TASK_LADDER` is a static respect-ordered constant.
Money is in no ranking. Result: 88% of gang money ($487.7k/t) comes from the single member the
respect-ladder happened to climb to Money Laundering (nite-07, rung 6); another member burns heat
budget on pure respect (nite-05, Cyberterrorism, $0/t); the other 10 sit at Ransomware (rung 1).

### Why now (the reopen)
Respect had two uses; both are exhausted, which is the state change that reopens the deferral:
recruiting (12/12 hard cap) and faction rep (~425× over goal, saturated). Money is the sole
blocker. "Not far enough into the game" (the prior stop) was true when respect still bought
members + rep; it no longer does.

### Base task table (`logs/gangtaskcompare-...json`, hacking tasks)
| task | baseMoney | baseWanted | $/heat |
|---|--:|--:|--:|
| Ethical Hacking | 3 | **−0.001** | (heat sink) |
| Ransomware | 3 | 0.0001 | 30,000 |
| Phishing | 7.5 | 0.003 | 2,500 |
| Identity Theft | 18 | 0.075 | 240 |
| Money Laundering | **360** | 1.25 | 288 |
| Cyberterrorism | 0 | 6 | 0 (pure respect) |

The tension the fix must resolve: **absolute money** (Money Laundering, base 360 — 120× Ransomware)
vs **money-per-heat efficiency** (Ransomware, 30,000 — best ratio but tiny absolute). Real
per-member money = `baseMoney × member-hack-stat × territory-mult × (1 − wantedPenalty)`, so this
is a constrained portfolio optimization, not a single climbable ladder:
- a few high-absolute-money / high-heat earners (Money Laundering),
- balanced by heat suppressors (Ethical Hacking / Vigilante Justice, negative wanted),
- with the remainder on high-$/heat-efficiency tasks (Ransomware).

### Fix direction (candidate)
Swap the objective from respect to **money** throughout `evalLadderMove`, and reorder/re-derive the
ladder around money. The existing heat-constrained promote/demote machinery may largely survive if
we substitute money-at-rung for respect-at-rung (Formulas already computes per-member yields —
`ns.formulas.gang.*`). Whether the linear-ladder abstraction survives, or must become an explicit
portfolio allocator (N earners + M suppressors solved against the wanted constraint), is the
central open question.

### Design questions for the spec
1. **Objective:** maximize total gang money s.t. `netWanted ≤ 0` (or wantedLevel bounded)? Or
   maximize money-per-heat? These give different allocations — the first pushes members onto
   Money Laundering until heat binds; the second favors Ransomware. Need a Formulas model to
   decide, ideally validated against nite-07's live $487.7k/t.
2. **Ladder vs portfolio:** does a money-reordered `TASK_LADDER` + heat-demote naturally produce
   the earner/suppressor split, or do we need a distinct allocator? Prefer the minimal change that
   the numbers justify.
3. **Ceiling:** what's the realistic total-money multiple? Bounded by wanted-penalty; estimate
   2–4× on the 94% stream (NOT territory's ~20×). Confirm with a model before promising it.
4. **Respect floor:** is any respect still needed (sink/wanted mechanics, or a future
   currently-unseen use)? Default: weight respect ~0, keep only the Ethical-Hacking heat sink,
   which the existing rung-0 machinery already provides.
5. **`wantedPenalty` non-monotonicity** (BACKLOG open item) — the money model divides by
   `(1 − wantedPenalty)`; if that field is noisy, the optimizer could thrash. Guard/measure.
6. **Ascension interaction:** aggressive ascension resets rungs to `FRESH_RECRUIT_RUNG` and strips
   rootkits; a money-objective ladder must not fight the ascension stagger (a freshly-ascended
   member is temporarily weak). Keep the two policies coherent.

**Certainty:** high value, medium design risk. This is real optimization surface, not a mechanical
edit — expect the spec to carry a measurement step (Formulas money-at-task probe) before the
allocator design is fixed.

---

## Workstream C — utility/bootstrap aug acquisition (added 2026-07-21)

### The problem (measured)
Allow-listing an aug sets a **flat score 0.25**, which is *lower than nearly every hacking aug*, so
`pickTarget`'s score-DESC sort buries utility augs at the bottom of a money-starved queue that
installs before reaching them. **Live proof: after 7 augs this cycle, all 3 allow-listed utility
augs are UNOWNED** (`auginfo` latest): CashRoot Starter Kit, Neuroreceptor Management Implant, The
Red Pill. We have been silently losing CashRoot's per-install **BruteSSH.exe + $1M** (faster
bootstrap recovery) every cycle.

Root cause is structural: **scoring is mult-only** (`getAugmentationStats` returns numeric mults;
pure-utility augs read all-1.0 → score 0 → dropped). Any aug whose value is a *non-mult effect*
(grants a program, removes focus penalty) is invisible to the scorer and only survives via the
manual `UTILITY_ALLOWLIST` — and even then only as an eligible-but-starved 0.25.

### Fix direction (candidate)
Treat allow-listed utility augs as a **must-buy set** (like Daedalus count-fillers): acquired every
cycle, **guaranteed bought before the install fires**, not left to lose a score race. Interacts
with Workstream A's escalation ordering: utility augs are cheap, so escalation-optimal order puts
them *last* — but "last" must still be *before install*, so the spend-down/trigger must ensure the
must-buy set is cleared. Reconcile the two: cheap must-buys go late in the buy order but are a
precondition for allowing the install trigger to fire.

### Design questions for the spec
1. Which augs are "must-buy"? Start with the current allowlist; **review the dropped-aug list for
   others with real non-mult value** (program grants, Formulas.exe) — needs per-aug in-game
   descriptions (stats can't show it). Combat/charisma/hacknet dropped augs stay dropped.
2. Should must-buy utility augs block the install trigger until acquired, or just get first claim
   on money each cycle? (Leaning: first-claim, since they're cheap — a $1M CashRoot shouldn't wait
   behind a $37B aug, and buying it early barely moves escalation on a tiny base.)
3. Does CashRoot's value (grants BruteSSH each install) actually compound, or is it moot once other
   port-opener sourcing is fast? Quantify the per-cycle bootstrap-time saving before over-weighting.
4. Weighting vs allowlist: keep the flat-0.25 allowlist but add a **must-buy tier** above the score
   sort, or raise utility scores? Prefer an explicit must-buy tier — scoring is the wrong lever
   (it's mult-based and these have no mult).

### Settled here (do not re-investigate)
- **No player aug boosts the gang.** Verified: player `mults` has **no `gang` key** (full set:
  hacking_*, combat, charisma, hacknet_*, company/faction_rep, crime_*, bladeburner_*, dnet). Gang
  yields depend on member stat + ascension + gang equipment (`ns.gang.purchaseEquipment`, separate
  system, already fully owned). **No gang-helper aug belongs on the augfarmer player-aug list.**
  Name-collision caveat: "BitWire" is both a player aug (owned, hacking mult) and a gang-equipment
  aug (owned, per-member) — same name, two systems.

**Certainty:** medium. The starvation is a confirmed bug; the fix is small (a must-buy tier). The
open work is auditing the dropped list for additional worthy utility augs (per-aug descriptions).

## Adjacent levers — noted, scoped OUT of this phase (don't lose them)

- **Spender coordination policy** (fable memo Q4): the three spenders are uncoordinated; the aug
  reservation freezes the fleet to $0. Recommendation from this session: **leave the fleet frozen,
  skip a "fleet tithe," and instead do an install-time home-RAM/cores sweep** (home persists;
  cloud servers wipe every install). Small, separable — its own phase or folded into A.
- **24/7 uptime** — sleep earns ~18% credit; running is a free ~2× on wall clock. A settings/ops
  decision, not code. Kenneth's call.
- **Batcher recovery** — recovers on its own as installs compound M and hacking level rebuilds;
  don't divert real money to the fleet until the batcher is ≥25% of income.

## Rejected / already-settled
- **Territory warfare (Tier 4):** measured-infeasible (power 1.0 vs 1,455–9,442, ~0% win odds),
  permanently deferred. Not reopened here.
- **A cloud "fleet tithe" to unfreeze fleet spending:** rejected this session — buys RAM that dies
  every install for a 6% throttled slice; adds coupling for a rounding-error gain. Home RAM at
  install time is the only durable fleet channel.
- **QLink ($25t) now:** deferred; core+NFG (M≈16.7) is the near-term target. Revisit at peak
  income if it materializes.

## Open questions to resolve before spec
1. A and B are independent subsystems — one spec or two? (Lean: two specs, one shared strategic
   header; A first — it's the highest-certainty, lowest-risk win.)
2. B needs a Formulas money-at-task measurement pass — build a read-only probe (pre-authorized)
   to rank tasks by real per-member money and validate the wanted-penalty model, before the
   allocator design is committed.
3. Does the install-time home-RAM sweep belong in this phase or its own?
