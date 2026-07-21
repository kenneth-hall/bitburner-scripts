# Phase 29 — gang scaling (equipment + ascension)

**Stage:** brainstorm (opus). Successor doc: `phase-29-gang-scaling.spec.md` (fable + `spec-reviewer`).

**One-line thesis:** Phase 28 pinned the task ladder to its bottom rung because the gang couldn't
afford the heat of climbing. That was right, and it bought ~15×. But the bottom rung is **200×
below the top rung on respect**, and respect is the only thing that moves the gate we actually
need. Tiers 2+3 exist to make climbing affordable again — the gear is the means, the ladder is
the payoff.

---

## Why this phase was raised

Two findings landed the same morning (2026-07-20), and together they change what BN2 is.

### 1. The gang faction sells almost the entire augmentation catalog

`gangaugs.js`'s original sweep ran **pre-gang** and measured NiteSec at 20 augs / hacking ×1.515.
Re-run post-gang:

| | pre-gang (2026-07-19) | **post-gang (2026-07-20)** |
|---|---|---|
| NiteSec augs | 20 | **98** |
| NiteSec hacking mult | ×1.515 | **×22.892** |
| The Red Pill | not offered | **offered — 2.5m rep, $0** |
| NiteSec total catalog price | — | $27.65t |

NiteSec now carries **98 of the 99 augs in the all-faction union** — everything except NeuroFlux
Governor, which matches `docs/bitnodes.md:167` ("in BN2 the gang offers The Red Pill → only need 1
more faction for NFG"). Raw output: `logs/gangaugs-1784565947624.json`.

**Why it matters:** CLAUDE.md's BN2 plan assumed we had to join ~17 factions and grind megacorp rep
to assemble a ×23.121 catalog. We don't. It is **one rep pool**. Our current base is ×1.280
(SF1.3, zero augs owned), so NiteSec's catalog alone yields **×29.3** against the ~30–35 the
15,000 `w0r1d_d43m0n` gate needs, with the NFG tail bridging the remainder.

**Correction to record:** the ×1.061-vs-×1.515 gang-faction comparison in CLAUDE.md is invalid —
it measured a pre-gang catalog. See "Dropped objections" below.

### 2. Phase 28's pin worked, and exposed the real ceiling

Phase 28 (`docs/phases/phase-28-gang-rep-pivot.md`) pinned `TASK_LADDER` to `["Ransomware"]` on the
grounds that we are rep-gated, not money-gated. Its acceptance was left explicitly unconfirmed.
**Confirmed here, 2026-07-20 12:15 CDT:**

| Check | Baseline | Measured | Verdict |
|---|---|---|---|
| Sink duty cycle | 71.6% | **0%** over 38 min (one `sink-exit` 11:37, no `sink-enter` since) | ✅ |
| `respectGainRate` non-zero | ~0.00020/tick | **0.12663/tick**, sustained | ✅ |
| NiteSec rep climbing | ~41 rep | **67.86** rep | ✅ |

Rep rate went **~2.9/hr → ~45/hr (~15×)**. The pin is validated; the doc's fallback suspect (the
watchdog thresholds) is not needed.

**And that is the problem.** At 45 rep/hr, The Red Pill's **2.5m** gate is **~6.3 years**. A 15×
win leaves us roughly three orders of magnitude short.

---

## Goal

**Scope: Tier 2 (equipment) + Tier 3 (ascension), specced together.** Ship the member-scaling
half of the gang manager so that member power rises far enough to re-open the task ladder.

**Explicitly *not* the goal: "buy gear."** The goal is *respect throughput*. Gear and ascension are
instruments; the measurable outcome is rep/hr. The phase succeeds if rep/hr rises by an order of
magnitude, not if purchases execute cleanly.

Not in scope: territory (Tier 4), the batcher/XP-farm, the aug ratchet's own behavior.

## The arithmetic that sets the target

Respect per tick scales with member stats. The levers available, and their rough headroom:

| Lever | Now | Ceiling | Multiple |
|---|---|---|---|
| Task rung | Ransomware (`baseRespect` 0.00005) | Cyberterrorism (0.01) | **×200** |
| Equipment (hack) | none | rootkits ×1.711 → +augs ×2.272 | ×1.7–2.3 |
| Ascension | none | compounding, unbounded in principle | ×10–50? (unmeasured) |
| Members | 8 | undocumented cap | ×1.5? |
| Territory | 14.3% | 100% | (Tier 4, out of scope) |

**The ×200 is the prize; everything else is what buys access to it.** Ransomware was chosen in
Phase 28 not because it earns well but because it generates almost no heat (wanted 0.0001). Climbing
is blocked by *cooling capacity*, and cooling capacity is a function of member strength. So Tiers
2+3 are not parallel to the ladder — they are its precondition.

This also sets the honest bar: gear alone (×2.3) does not get us to 2.5m rep. **If ascension does
not deliver a large compounding multiple, this phase does not reach its goal and BN2 needs a
different plan.** That is the phase's real risk, and it is measurable early (see recon).

## Decided

- **Spec Tiers 2 and 3 as one phase.** They are not separable: ascension **wipes ordinary
  equipment** but **not member augmentations** (`docs/gang-api.md:58-60`). So what gear is worth
  buying depends entirely on the ascension policy. Speccing Tier 2 alone would design purchase
  logic against assumptions Tier 3 then invalidates.
- **Equipment splits into two classes, and they get different policies.** Of 32 items, only 8 carry
  a `hack` mult (`logs/gangprobe-1784562548352.json`):
  - **Rootkits** — 5 items, hack **×1.711**, **$203.58m/member** (~$1.63b for 8). Cheap,
    ascension-disposable.
  - **Member augmentations** — 3 items, hack **×1.328**, **$20.82b/member**. Expensive,
    ascension-permanent.
  - The other 24 (weapon/armor/vehicle) are combat-only — irrelevant to a hacking gang.
  Policy shape: **rootkits broadly and early; augs staged, and only on members in the ascension
  rotation** (where permanence pays for the price).
- **Formulas.exe is live** (`formulasAvailable: true`, bought 2026-07-20). Ascension timing is
  therefore **exact** via `getAscensionResult` / `ns.formulas.gang.*` — no empirical threshold
  hunting. This is the difference between this phase and Phase 27's original (invalidated)
  "observe first" premise.
- **Re-opening the ladder is in scope as the success measure, not as new machinery.** Phase 28 left
  `evalPromotion` intact and switched off via a one-entry ladder. This phase re-adds rungs when
  member strength supports them; it does not rebuild the climbing logic.
- **Money is not a constraint worth modelling.** Batcher income ~$3.3b/hr against $1.63b for
  full rootkit coverage. Gear is affordable almost immediately; the aug tier ($20.82b/member) is
  the only real spend decision.

## Recon

### ✅ 1. RESOLVED — faction rep tracks the respect *gain rate*, not the total

**Measured live 2026-07-20 12:23 CDT** via `src/ascendrecon.js --commit`, ascending `nite-07` (the
cheapest valid candidate). Raw: `logs/ascendrecon-1784568236075.json`.

| | factionRep | respect | respectGainRate |
|---|---|---|---|
| before | 75.723 | 4437.90 | 0.12776 |
| +0 (immediately after ascend) | **75.723** | **4107.76** (−330.14) | 0.12776 |
| +1 … +5 ticks | 75.743 → **75.820**, monotonic | climbing | 0.11359 |

**Respect fell by exactly the previewed 330.14; faction rep did not move at all, then resumed
climbing.** So the doc's "reducing Gang Reputation" means gang *respect*, not faction reputation —
accumulated rep is never clawed back.

**Consequence — Tier 3 policy is settled: ascend aggressively.** The only cost is a transient dip
in respect *rate* while the ascended member's base stats regrow (0.12776 → 0.11359, −11% from one
of eight members), against a permanent multiplier gain.

**Structural fact the spec should build on:** rep gain is proportional to respect gain
(≈ Δrespect/59 in this sample, one measurement — treat the constant as indicative, the
proportionality as solid). **So rep/hr scales linearly with respect/tick, and every lever in the
table above multiplies straight through to the gate.**

### ✅ Ascension is powerful — first-ascension previews, all 8 members

`getAscensionResult` before committing:

| member | hack | → ascension mult | respect cost |
|---|---|---|---|
| nite-01/02/03 | 117 | **×3.0789** | 858.83 each |
| nite-04 | 96 | ×2.1090 | 516.12 |
| nite-05 | 95 | ×2.0994 | 511.07 |
| nite-06 | 89 | ×1.8751 | 450.16 |
| nite-07 | 79 | ×1.5170 | 330.14 (spent) |
| nite-08 | 27 | **no result** — below the ascension threshold | — |

**×3.08 for a first ascension, compounding on repeat.** Combined with equipment (×2.27) and the
ladder (×200), the ~1,000× we need is in plausible range — which is the first time that has been
true. The spec should model this properly with Formulas rather than lean on this back-of-envelope.

Note `nite-08` returning no result: there is a **minimum-strength threshold** for ascension the
docs don't specify. The spec needs a policy for members below it.

### ⏳ 2. Still open — does a player aug install degrade gang ascension multipliers?

(`docs/gang-api.md` open
   question 1, still open.) `GangMemberInstall` reads as a *decrease*; the in-game doc says gang
   stats "will not reset" on install. Reduce ≠ reset. Was moot while the ratchet was dormant —
   **no longer moot**, because this phase's whole output is ascension multipliers and the ratchet
   will eventually wake in BN2. If installs degrade them, the ratchet and the gang are in direct
   conflict and that is a design input, not a footnote.

**Not a blocker for the spec.** Unlike Q1 (which would have inverted Tier 3's policy direction),
this is a *magnitude* question — it changes how much ascension is worth long-term, not whether to
do it. It is also untestable today: it needs an install, and the ratchet's current target
(Neurotrainer I) is ~20h away at present rep rate. **Spec should be robust to either answer**, and
the check folded into the phase's live-validation step whenever the first BN2 install fires.

## Open questions

3. **Ascension rotation shape** — ascend one member at a time (keeps earning steady, slow
   compounding) or in waves (deeper trough, faster compounding)? Now answerable by modelling, since
   Q1 established rep tracks the rate: the question is purely how much transient rate-dip to accept.
4. **What re-opens the ladder, mechanically?** A static stat threshold, or a live check that the
   sink can absorb rung N's wanted rate given current member strength? The latter is more correct
   and more complex; Phase 28's demote/promote machinery may already carry enough of it.
5. **Member cap** — still undocumented (`canRecruitMember()` going false). 8 now. Affects how much
   of the budget goes to per-member gear.
6. **Does the ×200 rung actually survive its own heat at scale?** Cyberterrorism is wanted 6.0 vs
   Ethical Hacking's −0.001 sink. Even strong members may never afford it, in which case the real
   target is a middle rung and the ×200 headline is fiction. **Worth checking with Formulas before
   committing the phase to it.**

## Dropped objections (logged, not erased)

- **A combat gang would have been a better engine, and we can't switch.** Measured 2026-07-20 via
  `src/gangtaskcompare.js`: peak respect is a **dead tie** (Cyberterrorism 0.01 = Terrorism 0.01,
  same wanted 6, same difficulty 36), but the money-tier task differs — **Human Trafficking 0.004
  respect vs Money Laundering 0.001 at identical money and wanted**, i.e. combat gets **4×** the
  respect in the mid-game. Gang type is permanent (`isHacking`, no `leaveGang()`).
  **Proceeding with hacking anyway** on the grounds that the endgame respect engine is identical
  and Tiers 2+3 compress the transition where the gap bites. Restart was considered and rejected —
  the node holds little (0 augs, ~$600m), but re-running the ramp to win a transitional advantage
  is a bad trade.
- **The faction choice was made on an invalid criterion.** NiteSec was selected because the
  *pre-gang* sweep showed it (×1.515) and The Black Hand (×1.511) as the only gang-capable
  factions with real hacking catalogs vs ×1.061 for the five criminal factions. Finding 1 above
  shows the gang faction inherits the full catalog regardless — so that gap evaporates at gang
  creation and the criterion never applied. **Assumption not closed:** that a criminal-faction
  gang would show the same 98-aug catalog is inferred, not measured, and is unmeasurable without a
  restart. Recorded as a known unknown.

## Provenance / new tooling

Created during this brainstorm (read-only recon, uncommitted at time of writing):
- `src/bn2probe.js` — player mults, faction rep, owned augs → `bn2probe-<ts>.json`.
- `src/gangtaskcompare.js` — pulls the **combat** task table via `getTaskStats` (which accepts
  arbitrary names, unlike `getTaskNames`) for the gang-type comparison above.
- `src/ascendrecon.js` — ascension previews for every member; `--commit` runs the rep-tracking
  probe. Preview mode is read-only and safe to re-run; `--commit` ascends one member.
- **`vite.config.ts`**: added download filters for `ascendrecon-`, `bn2probe-`, and
  `gangtaskcompare-` outputs. Required a dev-server restart to take effect — the restart log also
  confirmed the `gangaugs.js` bug directly (`@home:/logs/gangaugs-….json (ignored)` beside the bare
  filename `(done)`).
- **Fix** to `src/gangaugs.js`: it wrote to a `logs/`-prefixed in-game filename, which never matches
  `vite.config.ts`'s `^gangaugs-\d+\.json$` download filter — **no prior sweep ever reached the
  repo** despite the documented `scp` step. Now writes a bare filename.
