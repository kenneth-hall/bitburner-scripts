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

> 🔴 **Strengthened 2026-07-31 — the gap is wider than this section originally argued.** After
> Kenneth pointed out the **in-game Bladeburner panel** (never opened before that), the 7/30 model
> turns out to contradict documented mechanics rather than merely under-sample them: action time is
> reducible **10×** (`Overclock`, max 90), skill points accrue at **1 per 3 ranks** (~133,000 over
> the climb, vs 13 measured), teams were at **size 0** the whole time, and action levels rise with
> success (Tracking now **8/8 at 100%**). A live re-read after chaos decayed shows success chances
> roughly **double** the trial's. **This phase is no longer "test whether the verdict was
> premature" — the verdict is already known to be unsound. The phase is now: find out what the real
> curve is.**

Specifically untested, every one of which plausibly bends the rate:

> ⚠️ **Rewritten 2026-07-31.** The original column was headed *"why it plausibly matters"* and was
> speculation. Reading the **in-game Bladeburner panel** (never opened until Kenneth asked) turned
> most of it into documented fact — and made the case materially **stronger** than drafted. Source
> text: `bladeburner-reference.md` §5.

| Untested lever | Status after reading the in-game panel |
|---|---|
| **`Overclock` — action speed** | 🔴 **The biggest term, and it wasn't even on the original list.** −1% action time per level, **max level 90 ⇒ actions at 10% of base time**. The 7/30 projection held action time constant, so it understates throughput by up to **10×** on this term alone. |
| **Skill investment at scale** | ✅ **Confirmed decisive.** Panel states **1 skill point per 3 ranks** ⇒ rank 400,000 banks **~133,000 SP** against the trial's **13**. Effects are additive within a skill and **multiplicative across skills**. The trial measured the lowest-investment regime that exists and extrapolated it flat. |
| **City rotation** | ✅ **Confirmed city-scoped by the game's own words**, not inferred: `Diplomacy` *"will reduce the chaos level of your current city"*; `Stealth Retirement Operation` also decreases it. ⚠️ New wrinkle: **chaos also rises spontaneously from world events** (riot entries in the event log), so rotation alone isn't sufficient — active suppression is part of steady state. |
| **Teams / `Recruitment`** | ✅ **Confirmed relevant, confirmed never used.** *"Having a larger team will improve your chances of success"* (Operations/BlackOps only). **Team Size was 0 for the entire trial**; our `Recruitment` success chance reads **100%**. Free upside, never taken. |
| **Action levels / autolevel** | ✅ **Confirmed to compound.** Levels unlock by completing an action successfully and *"grant more rank, experience, and money."* Live proof: **Tracking is now level 8/8 at 100% success in 12s** vs the probe's level-1 84.8% at 11s. |
| **Contract count regeneration** | ✅ **Answered:** `Incite Violence` *"will generate additional contracts and operations"* (cost: chaos in **all** cities). Counts also read far healthier than feared (Tracking 496, Raid 268 remaining). Inventory is not the binding constraint. |
| **Stamina management** | ✅ Not currently binding — panel shows **Stamina Penalty 0.0%**. Levers if it ever does: `Hyperbolic Regeneration Chamber`, `Cyber's Edge` (+2% max stamina/level). |
| **Hospitalization cost** | 🔴 **New, and previously uncounted anywhere.** Panel tracks **22 hospitalizations / $229.5m lost**, nearly all from the trial's 2-success/22-failure Raid grinding. Failed operations cost **HP *and* rank**; `Investigation` is the only action with no HP loss on failure. **An engine must weigh failure cost, not just expected rank** — the trial's action picker did not. |
| **Bonus time** | Still untested. `getBonusTime()` banks while the game is inactive, spends at up to **5×**; with sleep disabled and 24/7 uptime it may never meaningfully accrue. |

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

**D2 — Bladeburner never wins a resource conflict with the hacking path. Proposed; action-slot
clause rewritten 2026-07-31 after the blocker resolved.**
Hacking is the BN6 win path (7/30, unchanged). Where the two compete, Bladeburner yields:
- **RAM:** ✅ **no longer a real constraint** — home was upgraded to **512 GB** on 2026-07-30
  (~162 GB free at measurement). D5's original 13 GB squeeze is obsolete; the engine can afford
  4 GB getters without contortions, though the cheap-call discipline is still good practice.
- **Player action slot:** ✅ **resolved — cooperative marker (option (a)), decided by Kenneth
  2026-07-31.** The two mutually preempt over one slot that `getCurrentWork()` cannot see (§5), so
  "the engine yields" is not achievable by the engine alone. `augfarmer.js` gains a narrow,
  marker-based hold-off so it can decline the slot deliberately instead of blindly re-grabbing it.
  **Full contract in D9.** ⚠️ Yielding is now *cooperative*, which means it can **fail unsafely** —
  D9's staleness guard is what keeps that from silently stalling the win path.
- **Money:** the engine spends nothing. Skill points are its only currency and they aren't money.

**D3 — ~~City rotation is the first hypothesis~~ → SUPERSEDED 2026-07-31: skill compounding is,
and `Overclock` specifically. Revised.**

The original draft made city rotation the centrepiece because it was the lever that looked like it
explained the 7/30 decay. Reading the panel reorders the priorities decisively — **the throughput
terms dwarf the chaos term**:

1. **`Overclock` → up to 10× throughput** (−1%/level, max 90). Nothing else in the tree is close.
2. **Skill compounding generally** — ~133,000 SP across the climb at 1 SP / 3 ranks, additive
   within a skill and **multiplicative across skills**.
3. **Action levelling** — unlocks by success, grants more rank/exp/money, and is already visible
   (Tracking at level 8/8, 100%, 12s).
4. **Teams** — free success-chance upside, never used (size 0 all trial).
5. **Chaos management** — still real, but now demoted to *hygiene*: keep it suppressed via
   `Diplomacy`/`Stealth Retirement` and rotation, rather than treating rotation as the main play.

⚠️ **Chaos is not purely self-inflicted** — it rises from world events regardless of what we do, so
"just don't grind one city" was never going to be a complete answer. Rotation stays in the design;
it stops being *the* design. **Still to measure:** whether `switchCity` interrupts the running
action or costs anything (reference §8).

**Design implication (unchanged in shape, changed in emphasis):** the control loop stays city-aware
and logs per-city chaos, but the **skill-spend policy is the primary object of tuning**, and the
engine's first job is to drive `Overclock` and the success-chance skills up as fast as SP allows.

**D4 — Skill spending must be targeted, not round-robin-cheapest. Proposed; sharpened 2026-07-31
now that every skill's effect is known.**

The trial bought the cheapest available skill each time, ending with 10 skills at level 1 and no
concentration — fine for "does investment do anything at all," wrong for "does investment compound."
⚠️ The original text said *"skill effects are undocumented — measure marginal effect."* **They are
documented** (reference §5); the engine should spend against known effects and *verify*, not
discover from scratch. Proposed priority, derived from the published effects:

| Priority | Skill | Why |
|---|---|---|
| **1** | **`Overclock`** | −1% action time/level, **max 90 ⇒ 10× throughput**. Multiplies every other gain and is hard-capped, so there is a finite, knowable amount to buy. |
| **2** | `Blade's Intuition` | +3%/level success across **all** action classes — the broadest success term. |
| **3** | `Digital Observer` / `Tracer` | +4%/level for Operations+BlackOps / Contracts respectively — pick per the action mix actually being run. |
| **4** | `Reaper`, `Evasive System` | +2% combat / +4% dex+agi per level. Matter more later: BlackOps success is *"significantly affected by combat stats."* |
| **5** | `Cloak`, `Short-Circuit` | +5.5%/level but **narrow** (stealth / retirement actions only) — high value *if* the mix leans that way. |
| skip | `Hands of Midas`, `Hyperdrive`, `Cyber's Edge`, `Datamancer` | money / exp / stamina / estimate-accuracy. None move rank throughput, which is the metric this phase exists to answer. |

**Still to verify empirically** (the panel gives effects, not the cost curve): the SP cost growth
per level, so the engine can decide *how deep* to push `Overclock` before diverting. Observed so
far: 1–3 SP at level 0, 4–5 SP at levels 1–3. **Log the counterfactual** (`getSkillUpgradeCost` for
alternatives) so the policy stays auditable.

**D5 — Architecture: `gangmanager.js`'s mould, and RAM is the binding constraint. Proposed.**
Headless resident, `RESIDENT_COMPANIONS` slot, `bladeburner-state.json` (overwrite-in-place) +
`bladeburner-log.json` (ring-capped), an off-marker file, and **supervisor-gated on
`inBladeburner()`** exactly as `gangmanager.js` is gated on `inGang()` via `GANG_GATED_COMPANIONS`
(`daemon.js:158`) — that gate exists specifically because an ungated always-exiting resident
relaunch-storms (9.1h of it observed in BN5).

✅ **RAM is no longer the binding constraint — superseded 2026-07-30.** This decision was drafted
against a 128 GB home with ~13 GB headroom, where the 7/30 trial's 46.6 GB only fit because
`augfarmer.js` (64.10 GB) was killed. **Home is now 512 GB** (~162 GB free, measured 2026-07-31),
so the engine no longer has to contort around 4 GB getters and the short-lived-`exec`-sampler
workaround is unnecessary. The cheap-call discipline from the reference (0 GB: `nextUpdate` /
`getBonusTime` / `inBladeburner` / the five name-listers; 1 GB `getCurrentAction`; 2 GB
`stopBladeburnerAction` / `getBlackOpRank` / `getNextBlackOp`) is still worth following for a
resident poll loop, but as good practice rather than as a survival requirement. **The binding
constraint moved to the player action slot instead — see §5.**

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
- **Duty cycle and its price (D10):** fraction of held slot time spent on rank-producing actions vs
  zero-rank overhead, and the running **rep foregone** (`contested slot seconds × ~1.214 rep/sec`).
  Without this the engine's rate reads better than it is *and* the cost to the win path stays
  invisible — the two failure modes that produced the 7/30 verdict in the first place.

**D9 — The slot-hold marker contract. Decided 2026-07-31 (Kenneth chose option (a)).**

The engine claims the player action slot by writing a marker; `augfarmer.js` reads it and declines
to take the slot rather than blindly re-grabbing it. Design points that belong in the brainstorm
rather than the spec, because they're about *safety and scope*, not implementation:

- **🔴 The marker MUST be heartbeat-stamped, and `augfarmer.js` MUST ignore it when stale.
  Non-negotiable.** This is the single most dangerous thing this phase adds. A plain
  presence-checked file (the `cloud-upgrade-off.txt` / `gang-off.txt` shape) is **wrong here**,
  because those are hand-placed by an operator who knows they placed them. This marker is written
  by a *program that can crash*, and if it dies holding the slot, `augfarmer.js` stops grinding rep
  **forever, silently** — stalling the actual BN6 win path with no error and no obvious cause.
  This codebase has been burned by exactly this failure shape repeatedly (the 53h `fundBlocked`
  reserve deadlock, the 11h floor-reserve carve, the 21.7h unread `STALLED`). **Precedent to copy:
  `resourcemanager.js` already does this correctly** — *"`augfarmer-reserve.json` is stale —
  treating as no reservation until it recovers"*. Same rule, same shape: stale marker ⇒ hold is
  void ⇒ augfarmer resumes normally.
- **Holds are bounded, never indefinite.** The engine requests the slot in *slices* and must
  re-assert to keep it. Combined with the staleness guard, the worst case for a crashed engine is
  one slice of lost rep-grinding, not an unbounded stall.
- **Holds are phase-aware (D10).** Before claiming a contested slice the engine reads
  `augfarmer-state.json`; when augfarmer has no rep deficit to grind it can take the slot freely,
  and when it does, the engine spends that scarce time on **rank-producing actions only**, never on
  zero-rank overhead. The hold's *cost* is `slice seconds × ~1.214 rep/sec` — the spec should log
  that figure so the price of the experiment is visible rather than implicit.
- **augfarmer stays in charge of its own critical work.** The hold is advisory for *rep grinding*
  only — it must not block buying, targeting, the install trigger, spend-down, or anything else
  augfarmer does. Narrowest possible cut into win-path code.
- **The state must be legible.** A distinct phase (e.g. `"slot-held"`, alongside the existing
  `"yielded"`) so the dashboard/state file shows *why* rep work paused. An invisible hold is how
  this becomes a multi-hour mystery later — and per the Phase 24 observability convention, the
  GOAL/AUG-FARMER panel surfacing is a brainstorm decision, not a silent addition.
- **Open for spec:** slice length, whether augfarmer can *refuse* a hold when a rep deficit is
  urgent (e.g. close to an install boundary), and whether the engine should voluntarily release on
  reading a critical augfarmer phase. All tuning; none of them change the contract's shape.

**D10 — General actions are zero-rank overhead, and that overhead is billed to `augfarmer.js`.
Proposed 2026-07-31 (Kenneth's prompt: how do Training / Field Analysis fit against augfarmer?).**

The draft treated "the engine holds the slot" as if slot time converted to rank. **It doesn't —
most of it can't.** Measured yields (`logs/bladeburneractionprobe-1785412426030.json`):

| General action | Time | Rank | What it actually buys |
|---|---|---|---|
| `Recruitment` | **291s** | **0** | team members (Ops/BlackOps success) |
| `Diplomacy` | 60s | **0** | chaos ↓ in current city |
| `Hyperbolic Regeneration Chamber` | 60s | **0** | HP + stamina recovery |
| `Incite Violence` | 60s | **0** | contract/op inventory (chaos ↑ everywhere) |
| `Training` | 30s | **0** | combat exp + max stamina |
| `Field Analysis` | 30s | 0.1 | population-estimate accuracy |

Against the best rank producers — `Raid` 0.83 rank/s raw, `Assassination` 0.36, `Stealth
Retirement` 0.27 (raw = on success, before failure/chaos discounting).

**So the engine's real rate is rank ÷ *total* slot time including overhead, and every second of
that total is charged to augfarmer at its observed ~1.214 rep/sec.** Concretely: one `Recruitment`
attempt = **291s = ~353 faction rep foregone**, for zero rank. A five-member team is ~24 minutes of
slot time and ~1,760 rep. That cost appears nowhere in the 7/30 analysis or in this doc's earlier
drafts, and it is not small.

⚠️ **The overhead is not optional either** — chaos rises on its own (world events), HP loss is real
(22 hospitalizations, $229.5m), and teams/inventory need building. A steady-state engine has a
**duty cycle**, and the spec must model it explicitly: *fraction of slot time producing rank* is a
first-class output, not an afterthought.

### 🔑 The asymmetry that should drive the policy: what survives an install

- **Bladeburner rank and skill points SURVIVE augmentation installs** (reference §5) — they
  compound across the whole node, monotonically.
- **Combat stats and stamina do NOT** — they're player skills, reset to 1 by every install, exactly
  like hacking level.

**Therefore `Training` is the weakest use of contested slot time**: it's the one overhead action
whose entire product is wiped at the next install boundary, while the same seconds spent on a
contract would have produced permanent rank. It only earns its place immediately before a BlackOp
attempt (where *"success significantly affected by combat stats"* applies) and when no install is
imminent. **Proposal: the engine does not run `Training` as routine upkeep** — combat is already
175+ from the crime grind, and `Reaper`/`Evasive System` raise *effective* combat stats through
skill points, which **do** survive installs. Buying combat via SP rather than via slot time is
strictly better under this asymmetry.

Same lens on the rest: `Diplomacy` / `Hyperbolic Regeneration Chamber` / `Incite Violence` /
`Recruitment` are **protective or enabling** — their product (low chaos, health, inventory, team)
persists within the cycle and is genuinely needed, so they stay. `Field Analysis` is near-worthless
per §1's finding (narrows the estimate, barely moves the central value) and should be rare, not the
~50 reps the trial accidentally ran.

### When the slot is actually free — prefer these windows

augfarmer only needs the slot while it has a **rep deficit to grind**. It does not during
`spend-down`, `installing`, the post-install window before factions are rejoined, `idle-plateau`,
or any pass where the target is already rep-met and it's purely money-blocked. **Proposal: the
engine reads `augfarmer-state.json`'s phase/`workTarget.deficit` and preferentially schedules its
zero-rank overhead (Recruitment, Diplomacy, HRC) into those windows**, spending contested
slot time on rank-producing actions only. That converts much of the overhead from "billed to the
win path" to "free," and it needs no extra coordination beyond the state file augfarmer already
writes. ⚠️ Tuning belongs in the spec; the *principle* — **overhead goes in the gaps, rank goes in
the contested time** — is the decision here.

**D8 — A stopping condition, set in advance. Proposed.**
Per the convergence rules, this phase carries its own kill switch so it can't renew itself:
> **If, after the engine has run unattended for ~1 week with city rotation and concentrated skill
> investment, the projected ETA to rank 400,000 has not improved by at least ~10× over the 7/30
> baseline (~10.5 months ⇒ ~1 month or better), Bladeburner is declared non-viable as a
> node-clearing path — for BN6 and for the counter-map's back half — and `docs/bitnodes.md`'s node
> order is re-derived without it.**

⚠️ **Recalibration note, 2026-07-31.** `Overclock` alone is worth up to **10×** on action time, so
the ~10× bar above is now roughly *"does the single biggest documented lever actually land."* That
makes it a **weaker** test than intended — it could be cleared while the climb is still far too
slow overall. **The spec should re-derive this threshold** from the published mechanics (throughput
× success × rank-per-action at realistic skill levels) rather than inheriting a bar set against a
model now known to be wrong. Keeping the ~10× figure as a placeholder floor, explicitly not as the
final bar.

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

### 🔴 Blocker — RESOLVED 2026-07-31, and the answer is bad: **mutual preemption**

**There IS a conflict, and it is a worse shape than either predicted answer.** Measured live with
`src/slotconflictprobe.js` (`logs/slotconflictprobe-1785462422976.json`), with `augfarmer.js`
running and actively rep-grinding (PCMatrix @ Aevum, 94.8k deficit):

| Moment | `getCurrentWork()` | `getCurrentAction()` (BB) |
|---|---|---|
| before | `FACTION`/Aevum, **cyclesWorked 7989** | `null` |
| immediately after `startAction("General","Field Analysis")` | **`null`** | `Field Analysis` |
| +25s | `FACTION`/Aevum, **cyclesWorked 105** | **`null`** |

Reading the three transitions:
1. **Starting a Bladeburner action cancels in-progress faction work** — 7,989 accumulated cycles
   went to `work: null` instantly.
2. **`singularity.getCurrentWork()` is BLIND to Bladeburner** — it returns `null` during an active
   Bladeburner action, not a Bladeburner-shaped work object.
3. **So `augfarmer.js` reads the slot as `idle` / *available*** (`slotAvailable(null, …)` →
   `{available: true, reason: "idle"}`, `augfarmer.js:712`), immediately re-grabs it with
   `workForFaction`, **and that kills the Bladeburner action.** `cyclesWorked` restarting at 105
   (≈21s of fresh work at the observed ~5 cycles/s) dates the re-grab to ~4s after the action
   started — i.e. augfarmer's very next poll.

🔑 **The core problem: augfarmer cannot yield to something it cannot see.** The existing
`slotAvailable()` guard — which correctly yields to crime, university, and other factions' work —
is structurally unable to detect Bladeburner, because Bladeburner doesn't surface in the API that
guard reads. Left alone, the two would **thrash**: engine starts action → faction work dies →
augfarmer polls (~10s) → work restarts → action dies → repeat, with neither making progress and
the rep-work session resetting every cycle.

⚠️ **This directly contradicts D2 in its current form.** "Bladeburner yields on conflict" is not
implementable by the engine alone: yielding requires *augfarmer* to stop grabbing the slot, and
augfarmer is win-path code this phase said it wouldn't touch (§6). The options, none free:
- **(a) Duty-cycle via a coordination marker** — the engine writes a marker; `augfarmer.js` learns
  to treat it like the existing off-marker pattern and holds off. Small, well-precedented change,
  but it *is* a change to win-path code.
- **(b) Engine runs only in augfarmer's slot-free phases** (`awaiting-money`, `idle-plateau`,
  `install-ready`), read from `augfarmer-state.json`. Touches nothing — but ⚠️ **augfarmer is in
  `grinding` most of the time**, so the engine would get very little slot time, which directly
  worsens the rank rate that is already this phase's central problem. **Naming the cost honestly:
  this option may reduce the engine to a rounding error.**
- **(c) Explicit time-slicing** — e.g. N minutes Bladeburner / M minutes rep, negotiated through a
  shared file. Most controllable, most design surface.

**This is exactly what the blocker check existed to surface before speccing** — it invalidates the
"just run it concurrently" assumption the engine sketch was resting on, and it means D2 needs
rewriting before this phase can proceed to spec. **Recommend deciding (a)/(b)/(c) with Kenneth
first**, since (a) and (c) both cross into win-path code that §6 currently declares out of scope.

**Process note worth keeping:** the probe's own automated verdict said **"NO CONFLICT"** and was
**wrong**. It compared work *type* before-vs-during (`FACTION` → `FACTION`) and augfarmer's *phase*
(`grinding` → `grinding`) — both unchanged, because **the conflict resolves itself inside the
observation window**. Only the raw `cyclesWorked` reset and the nulled `bbAction` revealed it. The
verdict logic has been corrected in the script; the lesson generalises: *when a system
self-heals faster than you sample, steady-state comparisons show nothing — look for the scar
(a reset counter, a restarted session), not the wound.*

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

- **The BN6 win path.** Hacking remains primary (7/30). Nothing here changes `daemon.js`'s batcher
  or the M-target plan — beyond the one `RESIDENT_COMPANIONS`/gating entry the new companion needs.
  ⚠️ **Amended 2026-07-31: `augfarmer.js` IS now in scope, narrowly.** The marker hold-off (D9)
  requires it, per Kenneth's option-(a) decision. The cut is deliberately minimal — read a
  heartbeat-stamped marker, decline the work slot while it's fresh, expose a `"slot-held"` phase —
  and touches nothing about buying, targeting, the install trigger, or spend-down. **This is the
  one place this phase reaches into win-path code, and D9's staleness guard is the price of
  admission.**
- **`cloud-upgrade-off.txt`.** Currently pausing `cloudmanager.js` to unstick the aug ratchet
  (2026-07-30). Unrelated, and **still needs removing once the ratchet fires** — flagged here only
  so it isn't forgotten while attention is on this phase.
- **Phase 37** (member reserve / prep waterfall, `scheduler.js`). Independent.

---

## 7. Recommendation

**Updated 2026-07-31, after the §5 blocker resolved against the design.**

The strategic case is unchanged and still good: the cost of building is bounded (~a week, one
companion, an established mould), while the cost of *not* knowing is four nodes of strategy resting
on a single adverse 17-minute measurement taken in the worst possible regime — in the one node
where the experiment is clean. Rank and skill points **persist across installs**, so nothing the
engine earns is wasted even on a negative verdict. Two things also got *better* since drafting:
RAM stopped being a constraint (512 GB home), and the blocker was caught **before** a spec was
written rather than after.

**But the blocker landed badly and it changes the shape of the ask.** Bladeburner and the aug
ratchet mutually preempt over one invisible shared slot, so the engine cannot simply coexist with
the win path — and the cheapest fix (option (b), run only in augfarmer's slot-free phases) may
starve the engine badly enough to make its measurement worthless, since `grinding` is augfarmer's
normal state. The options that actually give the engine meaningful slot time ((a) and (c)) both
require touching `augfarmer.js` — **win-path code this phase explicitly scoped out** (§6).

**✅ The fork is decided: Kenneth chose option (a), the cooperative marker, on 2026-07-31.**
`augfarmer.js` is in scope for a narrow, heartbeat-guarded hold-off (D9); D2 and §6 are rewritten
accordingly. **Stage 1 is complete — this doc is ready to hand to Stage 2 (spec).**

**⚠️ Amended 2026-07-31 — the case got stronger, and one prerequisite got added.** Reading the
in-game panel (§1) showed the shelving verdict contradicts documented mechanics, not merely
under-samples them, so the strategic argument for building the instrument is firmer than when this
was drafted. **Added prerequisite for the spec:** re-derive D8's threshold from published mechanics
(`Overclock` ×10 throughput, 1 SP/3 ranks, team bonuses, action levelling) instead of inheriting a
bar calibrated against the broken model. A phase whose exit criterion is wrong is worse than one
with no exit criterion, because it looks rigorous.

**What the spec must not lose:**
1. **D9's staleness guard is the phase's one safety-critical requirement.** A crashed engine
   holding a presence-only marker silently stalls the BN6 win path. It needs the
   `resourcemanager.js` stale-reservation treatment, and it needs a test.
2. **D8's stopping condition is binding**, and exists so this phase can conclude "non-viable"
   as a *success*. Don't let it quietly disappear into "the engine is running, so it's working."
3. **D1's framing** — instrument, not win condition. The moment this is spec'd as "the engine that
   clears BN6," the stopping condition stops making sense and the phase loses its exit.
4. **D7's realized-rate instrumentation.** The 7/30 verdict was only correct once realized rank ÷
   realized time was computed; every prediction along the way was rosier than reality.

**The honest framing of what's being bought remains: not a faster BN6 clear — a decision about BN7,
BN9, BN10 and BN13, made now instead of three nodes from now.**
