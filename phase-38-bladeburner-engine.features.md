# Phase 38 features: the Bladeburner engine

**Stage:** brainstorm (opus), drafted 2026-07-31.
**Phase number:** 38 — **37 is already earmarked** for the member-reserve / prep-waterfall
`scheduler.js` work (`phase-36-install-cadence.features.md` D6), so this takes the next free slot.
**Status:** decisions below are proposals for Kenneth, not commitments. Nothing is spec'd or built.

---

## 1. Why this is being reopened one day after being shelved

On 2026-07-30 the BN6 win path was flipped from Bladeburner to hacking, and Stage 3 (this engine)
was shelved without a line of code. **That flip is not being re-argued** — hacking stays the BN6
win path either way, and nothing here proposes changing it. What is being reopened is a narrower
and more consequential claim that got written into the docs alongside it.

### The verdict was overstated, and that is the new information

What the trial **measured**: naive **single-city** grinding, at **13 skill points**, over a
**~17-minute** window, with a control loop that adaptively picked the best of 9 contracts/
operations. Achieved 0.0144 rank/sec ⇒ ~10.5 months to the rank-400,000 `Operation Daedalus` gate.

What the docs then **claimed**: Bladeburner is non-viable.

Those are different statements, and the gap between them is the entire content of this phase. The
honest version of the finding is **"naive single-city grinding with minimal skill investment is
non-viable"** — which is unsurprising, and says much less than it appeared to.

Specifically untested, every one of which plausibly bends the rate:

| Untested lever | Why it plausibly matters |
|---|---|
| **City rotation** | `getCityChaos(city)` / `switchCity(city)` are **per-city**, so the chaos decay that dominated the trial is almost certainly city-scoped. 6 cities ⇒ each can recover while the others are worked. This was logged as the wake condition on 7/30 and never tested. |
| **Skill investment at scale** | The trial peaked at **13 SP**. A 400,000-rank climb banks SP orders of magnitude beyond that. `Overclock` (action speed) and `Blade's Intuition` (success chance) are exactly the shapes that compound. Extrapolating linearly from the most under-invested regime possible is weak evidence. |
| **Action levels / autolevel** | `setActionLevel`/`getActionAutolevel` were never touched. Level's coupling to time/reward/success is undocumented (reference §5). |
| **Teams / `Recruitment`** | Teams apply to Operations and BlackOps. Never recruited, never sized. Black-op success may be team-gated. |
| **Contract count regeneration** | `countRemaining` was finite and consumable (117 Tracking, 66 Raid). Regeneration rate is unmeasured; it changes whether a steady state even exists. |
| **Stamina management** | `Hyperbolic Regeneration Chamber` exists and was never run. Trial ran at full stamina throughout, so stamina wasn't the cause of the low chances — but it was also never *used* as a lever. |
| **Bonus time** | `getBonusTime()` banks while the game is inactive and spends at up to **5×**. Untested interaction with an unattended engine. |

### The reason this is worth more than BN6

**`docs/bitnodes.md`'s counter-map bets the entire back half of the game on this mechanic.** Its
node order exists because *"BN6 then BN7 — the Bladeburner alt-win path; the key that defangs the
harsh back half,"* and it explicitly routes **BN9 and BN13** through Bladeburner. Four nodes'
strategy rests on a premise we now have exactly one adverse data point against.

So the live question is not *"can Bladeburner clear BN6"* — hacking is doing that. It is:

> **Is the counter-map's back-half plan real?** And if it isn't, we want to know now, not after
> committing BN7 → BN9 → BN13 to it.

🔑 **And BN6 is the best possible place to answer it.** BN6's `BladeburnerRank` / `BladeburnerSkillCost`
are **1.0 / 1.0** — neutral. BN7's are **0.6 / 2.0** (40% slower rank, double skill cost). BN6 is
the most favorable Bladeburner environment we will ever measure in. **A negative result here
generalizes forward with confidence; a negative result in BN7 would not have told us whether the
mechanic or the node was at fault.** This window closes when BN6 does.

---

## 2. The central reframe — instrument, not win condition

**D1 — The engine's deliverable is a decision, not a clear. Proposed.**

Scope it as: *an unattended engine that plays Bladeburner correctly enough, for long enough, to
either produce a viable rank curve or prove there isn't one.* Explicitly **not**: "the thing that
clears BN6."

Consequences of taking this framing seriously:
- **Success is a defensible answer either way.** A well-instrumented "this mechanic cannot clear a
  node on our timescales, here is the curve" is a *win* for this phase — it retires a four-node
  strategic assumption for the cost of one engine.
- It sets a **stopping condition** (D8), which a "build the win engine" framing never would have.
- It keeps the engine **subordinate to the hacking path** on every resource conflict (D3).
- It means the engine must be **honest about its own measurements** — the 7/30 lesson is precisely
  that a short window in an unrepresentative regime produced a confident wrong-shaped claim.

**Why not just run more hand-trials instead of building an engine?** Because the question is about
behavior over days-to-weeks with compounding skill investment, and hand-trials cap out at what
someone will babysit — the 7/30 trial died at 75 minutes and its central flaw was extrapolating
from too short a window in too poor a regime. **The engine is the only instrument that can reach
the regime the question is actually about.** That is the argument for building it, and it is also
why "just do another trial" is rejected (§4).

---

## 3. Proposed decisions

**D2 — Bladeburner never wins a resource conflict with the hacking path. Proposed.**
Hacking is the BN6 win path (7/30, unchanged). Where the two compete, Bladeburner yields:
- **RAM:** the engine must fit in the *residual* home budget, not displace a companion (see D5).
- **Player action slot:** see the blocker in §5 — if Bladeburner occupies the same slot
  `augfarmer.js` uses for rep-grinding, the engine must yield to the ratchet, not the reverse.
- **Money:** the engine spends nothing. Skill points are its only currency and they aren't money.

**D3 — City rotation is the first hypothesis, and the engine is built around it. Proposed.**
It is the top untested lever, it is cheap, and it directly targets the mechanism that killed the
7/30 run. Design implication: the control loop is **city-aware from the start** — track per-city
chaos, rotate on a chaos threshold rather than a fixed cadence, and log the chaos curve per city so
the rotation policy can be tuned from data instead of guessed. ⚠️ `switchCity`'s cost and whether
it interrupts the current action are **undocumented** (reference §8) — measure before relying on it.

**D4 — Skill spending must be targeted, not round-robin-cheapest. Proposed.**
The trial bought the cheapest available skill each time, which is how it ended up with 10 skills at
level 1 and no concentration. That was fine for "does investment do anything at all" and wrong for
"does investment compound." Proposal: concentrate on the success-chance / action-speed skills
(`Blade's Intuition`, `Overclock`, plus whichever of `Cloak`/`Digital Observer`/`Reaper` prove to
matter for the chosen action mix), and **log the counterfactual** (`getSkillUpgradeCost` for the
alternatives) so the policy is auditable. ⚠️ Skill *effects* are undocumented — the engine should
measure marginal effect per level rather than assume the names mean what they suggest.

**D5 — Architecture: `gangmanager.js`'s mould, and RAM is the binding constraint. Proposed.**
Headless resident, `RESIDENT_COMPANIONS` slot, `bladeburner-state.json` (overwrite-in-place) +
`bladeburner-log.json` (ring-capped), an off-marker file, and **supervisor-gated on
`inBladeburner()`** exactly as `gangmanager.js` is gated on `inGang()` via `GANG_GATED_COMPANIONS`
(`daemon.js:158`) — that gate exists specifically because an ungated always-exiting resident
relaunch-storms (9.1h of it observed in BN5).

⚠️ **RAM is the hard design constraint, and it is tight.** Home is 128 GB with **~114 GB already
committed** — roughly **13 GB of headroom**. The 7/30 trial script alone was **46.6 GB** and only
existed because `augfarmer.js` (64.10 GB) was killed for its duration. **An engine that requires
killing the aug ratchet to run is a non-starter under D2.** The reference's own guidance applies:
build the control loop on the **cheap** calls — `nextUpdate` / `getBonusTime` / `inBladeburner` /
the five name-listers are **0 GB**, `getCurrentAction` is 1 GB, `stopBladeburnerAction` /
`getBlackOpRank` / `getNextBlackOp` are 2 GB — and treat every 4 GB getter as a budgeted purchase.
**Open design question:** whether the expensive per-action getters can be sampled by a short-lived
`exec`'d companion that writes a file and exits (the `purchasescripts.js` pattern), keeping the
resident loop cheap. That is the difference between an engine that fits and one that doesn't.

**D6 — `startAction`'s auto-repeat is load-bearing, not a bug to work around. Proposed.**
Confirmed 7/30 (reference §6/§7 gotcha 13): `startAction` auto-repeats like `commitCrime`, and the
action **outlives the script**. The combat grind already exploited this — the crime kept running
with no script alive. For this engine that means: **the expensive per-cycle re-decision may be
unnecessary.** Set an action, let it repeat, and poll cheaply to decide *when to intervene* (chaos
threshold, city rotation, skill spend, action exhausted). This is both the RAM answer and a
robustness property — the engine keeps earning across daemon restarts.

**D7 — What the engine must emit to actually answer the question. Proposed.**
The 7/30 failure was measuring the wrong window, so instrumentation is a first-class requirement,
not a nice-to-have:
- **Realized** rank/sec over rolling windows (hour / day / cumulative) — *realized*, not the
  pre-action prediction. The 7/30 verdict only became clear when realized rank ÷ realized time was
  computed; the predictions were rosier throughout.
- Per-city chaos curve + rotation events, so D3's policy is tunable from data.
- Skill level vs. marginal measured effect on success chance/rank gain (D4's audit trail).
- Rank curve vs. the black-op ladder — **is it linear, or does it bend?** The whole verdict turns
  on this and a linear extrapolation is the thing that burned us.
- Projected ETA to rank 400,000 recomputed continuously, with its own confidence trend.

**D8 — A stopping condition, set in advance. Proposed.**
Per the convergence rules, this phase carries its own kill switch so it can't renew itself:
> **If, after the engine has run unattended for ~1 week with city rotation and concentrated skill
> investment, the projected ETA to rank 400,000 has not improved by at least ~10× over the 7/30
> baseline (~10.5 months ⇒ ~1 month or better), Bladeburner is declared non-viable as a
> node-clearing path — for BN6 and for the counter-map's back half — and `docs/bitnodes.md`'s node
> order is re-derived without it.**

That is a real, falsifiable bar set before the data arrives. ~1 month is still not *good*, but it's
the threshold where the mechanic becomes a plausible node-clearer at all; anything less means the
counter-map's premise is dead and four nodes need re-planning. **Default if never revisited:
non-viable** — the engine keeps rank accruing in the background but stops being a strategic input.

---

## 4. Rejected alternatives

- **Build nothing; stay hacking-only.** *Rejected, narrowly.* It's the cheapest option and it's
  what 7/30 decided — but it leaves the counter-map's four-node back-half premise resting on a
  single 17-minute adverse measurement taken in the worst regime. The cost of being wrong here is
  not "BN6 is slower," it's "BN7/BN9/BN13's plan is fiction and we find out three nodes later."
- **Run more hand-trials instead.** *Rejected.* The question is about compounding behavior over
  days; hand-trials cap at babysitting tolerance (75 min on 7/30) and that short window is exactly
  what produced the overstated verdict. Building the instrument *is* the fix.
- **Wait for SF10 / sleeves to make Bladeburner cheap.** *Rejected as a blocker, noted as an
  accelerant.* Sleeves are named in the in-game guide as Bladeburner's main accelerator, and
  `setToBladeburnerAction` exists — but SF10 is unowned, BN10 is *later* in the counter-map than
  BN6/BN7, and the ordering only makes sense if Bladeburner works first. Circular; can't wait on it.
- **Defer to BN7 and build it there.** *Rejected on the numbers.* BN7 is strictly worse for this
  measurement (rank 0.6, skill cost 2.0 vs BN6's 1.0/1.0). Measuring in the harsher node first
  confounds "the mechanic is bad" with "the node is bad." **BN6 is the clean experiment and the
  window closes when the node does.**
- **Make the engine try to clear BN6.** *Rejected* — that's D1. Hacking is already doing it, the
  measured rate doesn't support it, and the "win engine" framing is what removes the stopping
  condition.

---

## 5. Open questions

### 🔴 Blocker — must be answered before this phase can be spec'd

- **Does a Bladeburner action occupy the same player-action slot `augfarmer.js` uses for faction
  rep work?** `slotAvailable()` (`augfarmer.js:711`) yields on *any* `getCurrentWork()` type that
  isn't `CLASS` or own-faction `FACTION`. If a running Bladeburner action surfaces there, the aug
  ratchet **permanently yields** → rep grind stops → the hacking path's aug→M pipeline stalls. That
  would put this engine in direct conflict with the BN6 win path and force a duty-cycling design
  (or kill the concurrent-run idea entirely).
  **Status:** genuinely unknown. Circumstantial only: during the trial the in-game Overview showed
  `Bladeburner: General: Field Analysis` in the same region that later showed `Working for
  Sector-12`, which is suggestive but not proof — and `augfarmer.js` was killed for RAM throughout,
  so the interaction was never observed.
  **Cost to resolve: ~2 minutes** — start any Bladeburner action with `augfarmer.js` running and
  read `singularity.getCurrentWork()` + augfarmer's phase. ⚠️ **Mutating** (starts an action), so
  it needs an explicit go-ahead rather than the standing read-only data-gathering grant. **This
  should be the first thing done if this phase proceeds** — it can invalidate the whole design.

### Considerations — real, but none of them stop the phase

- **Is chaos actually city-scoped?** Strongly implied by `getCityChaos(city)`'s per-city signature,
  never confirmed. D3's entire rotation premise rests on it.
- **Does `switchCity` interrupt the running action, and does it cost anything?** Undocumented
  (reference §8). Affects rotation cadence design.
- **What do the 12 skills actually do, and what is the rank→skill-point conversion rate?** Both
  undocumented. D4's targeting is a hypothesis until measured.
- **Does the rank curve bend?** Higher rank may unlock better actions / higher action levels /
  bigger teams. If the curve is superlinear, the 7/30 linear extrapolation is simply invalid — and
  that's the single most likely way the shelving verdict was wrong.
- **Contract/operation count regeneration rate.** Determines whether a sustainable steady state
  exists or whether the engine exhausts its inventory and stalls.
- **Bonus time interaction.** Sleep is disabled on this machine (24/7 uptime), so bonus time may
  never meaningfully accrue — worth confirming rather than designing around.
- **Does `Training` (General) meaningfully feed success chance via combat stats?** Combat is at
  ~175 and success chances were still ~7–9%; the coupling is unmeasured.

---

## 6. What this phase explicitly does not touch

- **The BN6 win path.** Hacking remains primary (7/30). Nothing here changes `augfarmer.js`,
  `daemon.js`'s batcher, or the M-target plan — beyond the one `RESIDENT_COMPANIONS`/gating entry
  the new companion needs.
- **`cloud-upgrade-off.txt`.** Currently pausing `cloudmanager.js` to unstick the aug ratchet
  (2026-07-30). Unrelated, and **still needs removing once the ratchet fires** — flagged here only
  so it isn't forgotten while attention is on this phase.
- **Phase 37** (member reserve / prep waterfall, `scheduler.js`). Independent.

---

## 7. Recommendation

**Proceed — but resolve the §5 blocker first, and treat D8's stopping condition as binding.**

The case rests on one asymmetry: the cost of building is bounded (~a week, one companion, reusing
an established mould), while the cost of *not* knowing is four nodes of strategy resting on a
single adverse 17-minute measurement taken in the worst possible regime — in the one node where the
experiment is clean. Rank and skill points **persist across installs**, so nothing the engine earns
is ever wasted even if the verdict comes back negative.

**The honest framing of what's being bought: not a faster BN6 clear — a decision about BN7, BN9,
BN10 and BN13, made now instead of three nodes from now.**
