# Phase 30 features: gang territory (Tier 4) — observability-first

> **VERDICT 2026-07-21 — TIER 4 WARFARE DEFERRED PERMANENTLY. Stage-1c experiment SKIPPED.**
> The mechanic is 80% combat (str/def/dex/agi weight 20 each vs hack 15); we built a pure-hacking
> gang (combat stats = 1, combat ascension mults = 1.0), so warfare needs a from-scratch second
> build. Measured floor confirms it: our power 1.000 vs rivals 1,455–9,442 (weakest *and* climbing),
> win-odds ~0%, Black Hand holds 85.7% of the map. The 1c build-rate experiment was **not run** —
> the outcome doesn't change the call. **The reward is NOT marginal** (an earlier draft wrongly said
> so): `gangreward.js` measured territory at **~20× on respect/money** from 14.3%→100% (we run
> heavily *suppressed* down at 14.3%). Defer holds on three corrected grounds: (1) all takeable
> territory sits behind the **strongest** rival — Black Hand holds 85.7%, the other five hold **0%**
> (nothing to take), so growth means out-powering 9,442-and-climbing, not the 1,455 weakling; (2)
> capturing it still needs the from-scratch combat rebuild with the engine offline and members dying
> at ~0% odds; (3) the ~20× lands on respect (not our constraint, 425× over) and gang money
> (×20 ≈ $20m/s, still minor vs the $25t catalog and below the batcher). Big prize, wrong axis,
> hardest opponent — dispositive without extrapolation. Building hacking-only was the *correct* optimization for the
> gang's real job (respect/money → rep → augs); territory is a side subsystem rewarding a build we
> rightly declined. **What survives:** a slimmed respect-engine observability slice (durable
> respect-rate sampler + wantedPenalty magnitude + aggregate ascension mult) — the warfare-specific
> instruments (power/win-odds/rival panel) are dropped since we'll never act on them. Everything
> below is the brainstorm that reached this verdict; kept for the reasoning and the measured table.

**Stage:** Brainstorm (opus). Output of this doc: decisions, rejected alternatives, open
questions. Not a spec — the spec (fable) comes next and only after the Stage-1 gate below is
understood.

**Working dir:** `C:\Users\admin\bitburner-scripts`. Foundation read: `docs/gang-api.md`
(territory/power/clash surface + task weights), `logs/gangprobe-1784562548352.json` (raw
`GangTaskStats`), `logs/gang-state.json` (live member stats). `gangmanager.js` is **unfrozen** as
of 2026-07-21 (Phase 29 observation window closed early — `docs/phases/phase-29-gang-scaling.spec.md`
→ Close-out).

---

## The one fact that governs this phase

Territory Warfare builds `power`. Power is a weighted sum of member stats, and the raw weights
(measured, `gangprobe-1784562548352.json`) are:

| stat | hack | str | def | dex | agi | cha |
|---|---|---|---|---|---|---|
| Territory Warfare weight | **15** | 20 | 20 | 20 | 20 | 5 |

Combat (str+def+dex+agi) is **80 of the 100 weight**. Our gang is pure-hacking: every member has
**hack ~20k–34k but str/def/dex/agi = 1**, and their combat *ascension* multipliers are 1.0 too
(we have never trained or ascended combat — `docs/gang-api.md` open Q1). So **80% of the
power-building engine is inert for us.** Only the 15% hack term does any work.

Clash outcome is `ourPower / (ourPower + theirPower)`, exposed exactly by
`getChanceToWinClash(rival)`. ⚠️ **Members can die in clashes even when we win, and no API exposes
the per-clash death probability** (`docs/gang-api.md` open Q5). Low power → low win chance → our
members die. For a hacking gang this is the whole risk.

### MEASURED 2026-07-21 (`gangterritory.js` read-only probe → `logs/gangterritory-1784643114199.json`)

| gang | power | territory | our win-odds |
|---|---|---|---|
| **US (NiteSec)** | **1.000** | **14.3%** | — |
| Speakers for the Dead | 1,455 | 0% | **0.1%** |
| The Dark Army | 2,330 | 0% | 0.0% |
| The Syndicate | 2,385 | 0% | 0.0% |
| Tetrads | 2,402 | 0% | 0.0% |
| Slum Snakes | 2,546 | 0% | 0.0% |
| **The Black Hand** | **9,442** | **85.7%** | 0.0% |

Two hard facts fall out:
- **Our power is 1.000 — the floor.** No member has ever run Territory Warfare, so power has never
  been built. This is *not* proof a hacking gang can't build power; it means power-build rate
  (Stage 1c) is the one thing still genuinely unknown.
- **The territory map is not the default even split.** The Black Hand holds **85.7%**, we hold
  **14.3%**, the other five rivals are squeezed to **0%**. Growing means out-powering gangs at
  1,455 (weakest) to 9,442 (Black Hand, which holds all the territory worth taking). Even the
  *weakest* rival out-powers us ~1,455×; current win-odds against the whole field are ~0%.

**Remaining unknown (Q1/Q3):** can a combat-starved hacking gang build power fast enough — at 15%
weight, combat stats at 1 — to reach the low thousands, and is the earning time it costs worth the
territory multiplier? That needs the Stage 1c build-rate experiment (a *reversible task
reassignment* — flagged, not covered by the read-only probe authorization).

---

## Thesis: observability-first, and the gate is real

We do **not** build warfare logic first. We build the instruments, read the numbers, and let the
measurement decide whether Stage 2 exists at all. This is not caution for its own sake — it is the
cheapest way to answer a question (can a hacking gang win a clash?) that could kill the phase, and
the instruments have standalone value regardless of the answer because they close the KPI gaps we
already found on the dashboard.

**Stage 1 ships and is validated before any Stage 2 code exists. Stage 2 is conditional on a
measured go/no-go, not assumed.**

---

## Stage 1 — observability slice (unconditional; this is the phase's floor)

Everything here is read-only or a bounded, reversible experiment. Clashes stay OFF throughout.

### 1a. Surface the missing KPIs (pure reads)
Add to the dashboard GANG panel / a durable log:
- **Territory %** (ours) — `GangGenInfo.territory`. The headline number that appears *nowhere*
  today. We hold 14.3% — the rest is The Black Hand's 85.7% (measured; not an even split).
- **Our power** + **each rival's power and territory** — `GangGenInfo.power` +
  `getAllGangInformation()` (NOT `getOtherGangInformation` — removed in this 3.0.0 fork). Told us
  instantly we are outclassed ~1,455×–9,442× (see MEASURED table above).
- **Clash win-odds vs each rival** — `getChanceToWinClash(rival)`. The single most important
  safety instrument; if these sit near 0, Stage 2 is dead on arrival.
- **wantedPenalty magnitude** — `GangGenInfo.wantedPenalty` (the actual productivity multiplier,
  ~1.0 now). Cheap one-liner; we currently show only wanted *direction*, not cost.
- **Aggregate hack ascension multiplier** across members — the compounding KPI the BN2 thesis
  rests on, and the number the BACKLOG ascension-vs-install cadence question needs. Logged, not
  just event-counted.

### 1b. Durable respect-rate sampler (persist what already exists)
The dashboard **already samples `respectGainRate` once/minute, keeps 1h in memory** — it just
never writes it to disk (`dashboard.js` `GANG_SAMPLE_MS`). Stage 1 persists a rolling multi-hour
series to a log file so "is the gang trending up across the node?" is answerable. Cleanest form: a
standalone reader (or the dashboard's existing sampler taught to append), **not** a change to
`gangmanager.js`'s hot path.

### 1c. Power-build-rate experiment (bounded, reversible)
The only thing 1a can't read is *how fast we build power*. Measure it directly: assign a small
fixed subset (1–2 members) to Territory Warfare for a bounded window, sample `power` over time,
then restore their tasks. Clashes OFF the entire time (no death risk while merely building). One
number out: power/tick per member — which, combined with rival power, gives the honest answer to
"how long until we could win a clash, and at what earning cost?"

### Stage-1 exit gate (the decision that unlocks Stage 2)
After 1a–1c we know: our power, rival power, current win-odds, and our power-build rate. Proceed to
Stage 2 **only if** a realistic power-build path reaches a high win-margin against at least the
weakest rival **without** an unacceptable earning-time sacrifice. Otherwise: log the finding, keep
the instruments (they earned their place), and **defer Tier 4 permanently** — hold the default
14.28% and never contest. Either outcome is a legitimate phase result.

---

## Stage 2 — territory warfare logic (CONDITIONAL on the Stage-1 gate)

Only specced if Stage 1 clears the gate. Shape, subject to revision by the measurements:
- **Build phase:** assign a subset of members to Territory Warfare with clashes OFF — accumulate
  power at zero death risk, trading their respect/money earning for power.
- **Engage rule (zero-death posture):** flip `setTerritoryWarfare(true)` only when win-odds vs the
  target rival clear a high bar (≥ ~0.95), and drop back to OFF the moment any rival out-powers us
  or odds fall. Never clash on a coin-flip.
- **Earning/power split:** how many members build power vs keep earning — the genuine tuning knob,
  informed by 1c's rate and the territory→productivity multiplier magnitude.

---

## Decisions made (this brainstorm)

1. **Observability-first, with a real gate.** Stage 1 ships and validates before any Stage 2
   warfare code. Kenneth's call, 2026-07-21.
2. **Zero-death is the default risk posture** for any Stage 2 (only clash at very high win-odds).
   Settable, but that's the starting stance.
3. **The KPI slice (territory/power/win-odds + durable sampler + wantedPenalty + aggregate
   ascension mult) is Stage 1 scope and has standalone value** independent of whether Stage 2 ever
   happens — it closes gaps we found auditing the dashboard 2026-07-21.
4. **Go/no-go for Stage 2 is measured, not assumed.** "Defer Tier 4 permanently" is an acceptable
   and possibly likely outcome given the 80%-combat-weight handicap.

## Rejected alternatives

- **Jump straight to warfare logic.** Rejected: we cannot currently answer whether a hacking gang
  wins a clash, so this would risk members blind. The whole point of the phase is to not do this.
- **Train combat stats to make members viable at territory.** Rejected *for now* (parked as open
  Q4, not adopted): members start combat at 1 with 1.0 ascension mult, so this is a large
  off-earning investment with no compounding head start — only worth reconsidering if Stage 1
  shows pure-hack power is hopeless *and* the territory multiplier is large enough to pay for it.
- **Skip Tier 4 with no measurement.** Considered and defensible (the combat handicap is real), but
  rejected because the measurement is cheap, safe, and the instruments are worth building anyway.
  We measure, then decide.

## What Formulas.exe does and doesn't buy us

**We already own Formulas.exe** (`gang-state.json` `formulasAvailable: true`; daemon panel shows
`formulas`). The `gang-api.md` "we hold $5,695 — later capability" line is stale and there is **no
$5b buy decision** — it's a sunk capability. But the gang formulas are
`respectGain / moneyGain / wantedLevelGain / wantedPenalty / ascensionMultiplier /
ascensionPointsGain` — **none is a power or clash-power formula.** So Formulas makes task
assignment and the territory→yield multiplier *exact math*, but the pivotal power questions (Q1/Q2)
are still live reads + the 1c experiment. Formulas does not shortcut them.

## Open questions

1. **Does 15%-weight × ~30k hack yield competitive clash power?** The pivotal one. **Formulas does
   NOT help** — no power formula exists. → Stage 1a reads (our power + `getOtherGangInformation`) +
   Stage 1c build-rate experiment answer it.
2. **~~Rival power/territory right now?~~ ✅ ANSWERED 2026-07-21** — see MEASURED table. We're at
   power 1 vs 1,455–9,442; Black Hand holds 85.7% of the map; win-odds ~0% across the field.
3. **Is parking members on Territory Warfare worth the territory multiplier?** The
   territory→yield gain is now **exact** (Formulas' `respectGain`/`moneyGain` take gang territory
   as input — compute it, don't measure it). The remaining unknown is 1c's power-build rate, which
   sets how many members for how long. That product is the crux of Stage 2's split knob.
4. **Combat-training path — real option or trap?** Parked; revisit only if Q1 comes back hopeless.
