# BN3.1 playbook — Corporatocracy

**Status:** 🟢 live node. Entered **2026-09-18**. Created **2026-09-19**.

**What this doc is:** the BN3-specific strategy — the win path and the two routes rejected, what
BN3's multiplier table actually does to us, the funding model, and the Corporation mechanic we are
deliberately not using. It is the sibling of [`bn6-playbook.md`](bn6-playbook.md), written the same
way and for the same job.

**What this doc is NOT, and where those facts live instead.** This doc was opened over a standing
objection: a fourth place to write the same number is a fourth place for it to go stale, and this
repo has a long log of exactly that failure. So it **links rather than restates**, and the routing
below is load-bearing — if you are about to add a fact here, check this table first.

| Fact you want | Lives in | Never copy it here |
|---|---|---|
| Live state: rank, stats, money, what's running, the current blocker | `CLAUDE.md` § "Current goal" | It is stamped and recomputed there; a copy here would be a second, unstamped truth |
| Bladeburner **interface** — access model, catalog, per-method semantics, RAM, gotchas | [`bladeburner-reference.md`](bladeburner-reference.md) | Node-independent. BN3 changes none of it |
| Bladeburner **mechanics** — chaos, stamina, skills, action levels, the estimator's failure modes | [`bladeburner-reference.md`](bladeburner-reference.md) §5, §7 | Measured in BN6/BN9/BN10 and carries forward |
| The cross-node ordering, redo-tax and ETA tables | [`bitnodes.md`](bitnodes.md) § "Remaining sequence" | That is where the comparison lives |
| Grafting, sleeves, the batcher, gangs | `grafting-reference.md`, `sleeve-grafting-reference.md`, `batcher-engine.md`, `gang-engine.md` | Subsystem docs, not node docs |
| BN6's win-path argument and its four flips | [`bn6-playbook.md`](bn6-playbook.md) §1 | Closed history. Its *mechanics* generalise; its numbers do not |

⚠️ **BN3 has no phase doc and needs none so far** — it is being cleared with existing, proven
tooling. If that changes, open `phase-NN-*.features.md`; do not let a phase's worth of churn
accrete into this file or the goal block.

---

## 1. The decision: Bladeburner black ops. Both alternatives are closed.

**BN3 clears by running all 21 black ops in order, ending at `Operation Daedalus`** — the exact
route already proven in BN6.1, BN10.1, and attempted in BN9. Nothing about BN3 requires a new
engine, which is most of why it was picked.

🔑 **The thesis that makes BN3 a good node for this route, in one line: BN3's clear is essentially
money-independent, and money is the only thing BN3 takes away.** Rank comes from time, skill points
come from rank (at exactly `rank/3`), and combat is unpenalised. The node's brutal economy
(§2) lands almost entirely on levers this route does not pull.

### 1.1 Hacking — CLOSED 2026-09-19 by calculation

`bitnodes.md` parked this as its one open BN3 question ("revisit only if BN3 is reached and a cheap
iso-exp check says otherwise"). BN3 was reached; the check ran. **Hacking loses by roughly three
orders of magnitude.**

The tempting part is real: BN3's `HackingLevelMultiplier` is **0.80** against BN6's 0.35, so the
`w0r1d_d43m0n` gate of 6,000 needs only **M ≈ 14–19** rather than BN6's 28–37.

| exp stack | M needed for level 6,000 |
|---|---|
| 1e8 | 19.3 |
| 1e9 | 16.2 |
| 1e10 | 14.0 |

Against `level = nodeMult × M × (32·ln(exp + 534.6) − 200)`, `6000/0.80 = 7,500` raw versus BN6's
`6000/0.35 = 17,143` — **BN3's hacking gate is 2.3× cheaper than BN6's.**

**And it does not matter, because BN3 starves the ratchet that raises M:**

- effective steal = `ServerMaxMoney 0.04 × StolenMoneyFromHack 0.20` = **0.008**, against BN6's
  `0.20 × 0.75` = **0.15** → **18.75× worse**;
- `AugmentationMoneyCost` **300%** on top ⇒ aug-buying power ≈ **56× worse than BN6**;
- `AugmentationRepCost` is **300%** as well, so the rep side is squeezed independently;
- BN6 measured its ratchet at **~0.0045 M/hour** — flat across installs #37–43 — and still
  projected **240–323 days** to M 28–37. Scaled by 1/56, M≈16 is unreachable.

⚠️ **Honest framing: this is a computed estimate, not a measurement.** BN6's 0.0045 M/hour came off
a mature fleet and is being scaled by a money ratio — the kind of step this repo's own rules warn
about. It is quoted because **the margin survives being wrong by a factor of 100**, not because the
arithmetic deserves two significant figures.

🔴 **Do not reopen this on the 0.80 multiplier alone.** That number was never the binding
constraint, and it is the one most likely to tempt a future session into re-deriving this from
scratch. What *would* reopen it: a measured money source that changes the ratchet rate by ~50×
(see §5.2 — coding contracts are the only candidate, and they are not that big).

### 1.2 Corporation — CLOSED, and it was never open

See §6 for the mechanic. The short version: **Corp is a money engine, and the clear is not money-
bound.** Even granting the in-game guide's "effectively limitless wealth," it would buy a faster
route to something we do not need, at the price of a days-to-weeks scripting project against a
56-method API nobody here has read.

⚠️ **The in-game guide's BN3 warning — "very tough mechanic to automate," "scripts take days or
weeks," "blindly = worst mechanic" — is scoped to the Corporation mechanic specifically.** It is a
real warning about a thing we are not doing. Do not let it be quoted as a warning about BN3's
difficulty in general; the node's *clear* is the cheapest on the board.

---

## 2. Node facts — BN3's multiplier table, and what each line does to us

⚠️ **Source caveat.** These come from `docs/bitnodes.md` § BN3, which derived them from
`logs/bitnodemults-1786922442524.json` — **that log was destroyed by the 2026-09-08 power event**
(blank-filled, correct-sized). The 2026-08-16 sweep verified all 15 hand-transcribed tables against
the engine with zero discrepancies, so the numbers are trustworthy but **no longer backed by a
readable artifact**. Re-run `bitnodemults.js` (6.60 GB, read-only) when home RAM allows; see
`BACKLOG.md`.

### Helps, or is simply untouched

| Multiplier | Value | Why it matters here |
|---|---|---|
| `BladeburnerRank` | **1.00** | The grind runs at full speed — identical to BN6, which cleared in a realised 14 days |
| `BladeburnerSkillCost` | **1.00** | Skill points buy full value. **Redo-tax `(1/Rank) × SkillCost` = 1.00×, tied cheapest in the game** |
| Combat level mults | **1.00** | The entry gate is a short grind, not BN9's wall. No grafting detour needed |
| Hacking **exp** | baseline | Unpenalised. The batcher still levels hacking fine — it just cannot turn that into money |
| `CloudServerLimit` | **1.00** | Private servers are **not** disabled (unlike BN9) |
| Coding Contract Reward | **baseline** | 🔑 **The only unnerfed money source in the node.** See §5.2 |
| `FavorToDonate` | **50%** | Donation unlocks at **75 favor**, not 150 — the cheapest this has ever been |
| Gang | Softcap **0.900**, Unique Augs 50% | Gangs are **not** disabled, and SF2 is held. See §5.3 |

### Hurts

| Multiplier | Value | Consequence |
|---|---|---|
| `ServerMaxMoney` | **4%** | With `StolenMoneyFromHack` 20%, effective steal is **0.008** — the batcher is a fleet-and-openers funder, nothing more |
| `StolenMoneyFromHack` | **20%** | ” |
| `ServerGrowthRate` | **20%** | Prep is slow; batches are shallow |
| `ServerStartingMoney` | **20%** | Slow cold start |
| `AugmentationMoneyCost` | **300%** | Every aug is 3× — and see §5.1, almost none are worth buying here anyway |
| `AugmentationRepCost` | **300%** | Rep requirements tripled. `The Blade's Simulacrum` goes 1.25k → **3.75k rep** |
| **Home RAM Cost** | **150%** | 🚨 Directly causes the current blocker. See §4.1 |
| Cloud Base Cost / Softcap | **2.00 / 1.30** | Fleet is ~2× pricier in a node with 4% money |
| Crime Money | **25%** | Crime is an exp source here, not an income source |
| Company Work Money | **25%** | ” |
| Darknet Money | **40%** | Port openers cost the same but are harder to afford |
| Hacknet Production | **25%** | 🔴 **Do not port BN9's Hacknet economy.** See §7 |
| `WorldDaemonDifficulty` | **200%** | Hacking gate 6,000 — moot, we are not taking that route |
| Stanek's Gift | Power 75%, Size **−2.00** | Not in play; we hold augs already |

---

## 3. Win condition

**Complete all 21 black ops in order, ending at `Operation Daedalus`.** Then, and only then,
`destroyW0r1dD43m0n(nextBN)`.

🚨 **Rank 400,000 is the GATE on the last op, not the win condition.** This is BN6's hardest-won
lesson and it nearly cost that node — the engine had no black-op stage at all and would have ground
`Tracking` forever while every dashboard read "on track." Restated here because the failure mode is
*invisible*: a progress proxy that reads 100% while the run cannot finish.

⚠️ **Completing `Operation Daedalus` does NOT destroy the node.** That takes
`ns.singularity.destroyW0r1dD43m0n(nextBN)`, and **`nextBN` is MANDATORY in this build** despite the
bundled docs calling it optional. `src/destroybn.js` wraps it and aborts on its own unless
`getNextBlackOp()` reads `null`.

---

## 4. Staged plan — cold start

🔴 **This is the cold-start sequence. It is not BN9's list.** BN9's four-step list was written
mid-ladder at rank 408,388 with ops 1–10 already done; every step of it assumes state a fresh node
does not have. That list is preserved in `CLAUDE.md`'s BN9 block, marked as never-finished.

| # | Step | Tool | Notes |
|---|---|---|---|
| 1 | Combat 1 → 100 | crime (see §4.1) | **17,729 exp total**, 4,432 per stat at player mult 1.3824. ~1–2h |
| 2 | Join the division | `joinbladeburner.js` (7.60 GB) | Verify with a `getRank()` read, **never** the boolean — `startAction` returning `true` has been measured lying |
| 3 | Grind rank → 400,000 | `bladeburnermanager.js` | Auto-launches once `inBladeburner()` is true |
| 4 | Spend the SP bank | `bbskillbuy.js <target>` | SP accrues at **rank/3**. Node-local and destroyed on the clear, so spending is **free** |
| 5 | Ops 1–20 | `bbblackop.js 20` | Hard rail: refuses `Operation Daedalus` without an explicit argument |
| 6 | **Re-spend the SP the ladder earned** | `bbskillbuy.js <target>` | 🔑 Do not skip. The ladder's own rank rewards refill the bank mid-run; this is the BN10 lever that made Daedalus first-try |
| 7 | Op 21 | `bbblackop.js 1 daedalus` | Completing it does **not** destroy the node |
| 8 | **Irreversible** | `destroybn.js <nextBN> confirm` | Aborts unless `getNextBlackOp()` reads `null` |

**ETA ~10 days, range 7–14** (`bitnodes.md` § "ETA table"). ⚠️ Scaled from BN6's single comparable
clear, not measured — read [`estimation-calibration.md`](estimation-calibration.md) before quoting
it. BN6's one directly comparable prediction ran **40% high on the point with the range correct**.

### 4.1 The opening blocker: home RAM, not money

🚨 **Home is 32 GB and the resident stack alone fills it.** `daemon.js` + `resourcemanager.js` +
`cloudmanager.js` + `transactionsmonitor.js` + `dashboard.js` = **31.65 / 32.00 GB**. So
`combatgrind.js` (**8.70 GB**) cannot start, and the daemon logs ten companions as skipped for RAM
(`goallog.js`, `procureprograms.js`, `backdoorfactions.js`, `procureformulas.js`,
`studybootstrap.js`, `augfarmer.js`, `xpfarm.js`, `ratchetlog.js`, `backdoorwd.js`, `gatewatch.js`).

- ⚠️ **The batcher is not the squatter.** `HOME_RESERVE_GB` is **160** against a 32 GB home, so
  `hosts.js` reports 0 allocatable home RAM to the batcher. The residents are the whole cost.
- ⚠️ **SF9.1 does not grant the 128 GB home start** — that is SF9 **level 2**. BN3 started at 32 GB
  like any other node, and BN3 charges **150% Home RAM Cost** to grow it.

🔑 **Recommended unblock: route around it, don't fix it.** The combat gate needs no automation —
**commit a crime from the in-game UI and it auto-repeats**, at zero RAM, using a player-action slot
that is currently free. `combatgrind.js` is a convenience. Free home RAM later, when the batcher has
paid for an upgrade, for `joinbladeburner.js` and the ladder scripts.

⚠️ **Second-order consequence worth knowing:** the scripts that would refresh `goal-log.json` and
`backdoor-status.json` are among the ones that do not fit, so **those files still serve BN9's last
readings** (`hackingLevel: 6338`, `rank: 459,980`) under today's mtime. A stale log with a fresh
mtime is worse than a missing one.

### 4.2 The player-action slot — five claimants, and one is new here

`bladeburnermanager.js`, `augfarmer.js`, `backdoorfactions.js`, `backdoorwd.js` and
`ns.grafting.graftAugmentation` all contend for the single player-action slot. In BN3 the **crime
grind is a sixth claimant** during step 1, and it is the one that matters, because nothing else can
run while combat is being raised.

Currently most claimants are RAM-starved and therefore quiet — **that is luck, not design.** The
moment home RAM frees, `backdoorfactions.js` launches and will contend. Quiesce deliberately before
any measurement; see `bladeburner-reference.md` §8 for the full claimant table and the identical
symptoms they produce from different causes.

---

## 5. The economy — what money is actually for in BN3

### 5.1 The honest answer: almost nothing

Walk the list of things money buys on this route:

| Want | Cost in BN3 | Verdict |
|---|---|---|
| Bladeburner **skills** | 0 — bought with SP, which comes from rank | **Free.** The main lever is not money at all |
| Bladeburner **faction augs** | 3× money, 3× rep | **Worthless**, and this was measured in BN6: every aug in the tier multiplies success chance, stamina or analysis, and the engine runs at ~100% success. The tier is *inert* |
| `The Blade's Simulacrum` | $1.029t × 3 = **~$3.09t**; rep 1.25k × 3 = **3.75k** | **Nice-to-have, not needed.** It removes the single-slot restriction — but Bladeburner actions regenerate their own combat prerequisite, so slot contention is not a recurring tax |
| Fleet / cloud servers | Base 2.00, softcap 1.30 | Wanted early for the batcher, cheap in absolute terms |
| TOR + port openers | Darknet 40% | Required. ~$200k + the opener ladder. **The real early-game money need** |
| Home RAM | 150% | Wanted, see §4.1 |
| Augmentation ratchet | 3× money, 3× rep | **Not a goal here.** That is the hacking route, which §1.1 closed |

🔑 **So: the money BN3 actually needs is the early-game bootstrap — TOR, five port openers, a small
fleet, and one home upgrade.** That is a five-to-six-figure problem, not a trillion-dollar one, and
the crippled batcher can cover it. Everything past that is optional.

📌 **This is why a money-starved node was a *good* pick for this route**, and it is the single most
important thing to not forget when BN3's economy looks alarming.

### 5.2 🔑 Coding contracts are the only unnerfed money source — and we have no tooling

BN3's table lists no `CodingContractMoney` entry, and `bitnodes.md`'s convention is "rest baseline"
— so **coding contracts pay 100% in a node where server money is 4%, crime is 25%, company work is
25%, darknet is 40% and Hacknet is 25%.** For contrast, BN10 nerfed them to 50%, BN9 to 25%, BN4 to
40%, and BN8 to 0%.

🔴 **`src/` contains no coding-contract solver. Zero files reference `codingcontract`.** This is the
largest unexploited lever in the node and the only one the multiplier table actively favours.

- API is present and cheap to drive: `getContractTypes()`, `getContract(file, host)`,
  `getContractType`, `getData`, `getNumTriesRemaining`, `attempt(answer, file, host)`.
- ⚠️ **Magnitude is UNMEASURED.** Do not plan around contracts until someone counts the `.cct` files
  on the network and reads one reward. It is plausible this is worth a few hundred million early
  and irrelevant later — which would make it a *bootstrap* lever, exactly where BN3 hurts most.
- ⚠️ Contracts also award **faction reputation** instead of money for some instances, which under
  `AugmentationRepCost` 300% is worth less here than usual.

→ Open question **Q3-2** (§8).

### 5.3 Gangs are available — and probably still the wrong build

SF2 is held and BN3 does not disable gangs (`GangSoftcap` 0.900, Unique Augs 50%). Gang income is
crime-derived, so `CrimeMoney` 25% applies — still far better than the batcher's 0.008 effective
steal on its own base.

**Default: no gang.** Not because it would fail, but because §5.1 says the clear does not need the
money, and `createGang()` is **irreversible**. Building a money engine to fund a route that is not
money-bound is the "tooling that doesn't advance the goal" trap.

**What would reopen it:** the early bootstrap (TOR + openers + fleet) genuinely stalling for more
than ~2 days on the crippled batcher. Read [`gang-engine.md`](gang-engine.md) first — the
hacking-vs-combat decision, the catalog corrections and the two respect↔money reversals are all
recorded there and must not be re-derived.

---

## 6. The Corporation mechanic — what it is, why we skip it, what SF3 buys

**We are not using Corp to clear BN3.** This section exists so nobody re-litigates that from
scratch, and so the reward we are playing for is understood.

### 6.1 Access and the one genuinely BN3-exclusive fact

- Creating a corp requires **SF3 or being in BN3** (the API's own check enum has
  `NoSf3OrDisabled`), plus `CorporationSoftcap ≥ 0.15`. BN3's softcap is baseline, so this passes.
- 🔑 **`createCorporation(name, selfFund)` — `selfFund: false` (seed money) works ONLY in BN3.** The
  check enum literally has a `UseSeedMoneyOutsideBN3` failure case. Everywhere else, with SF3, you
  must fund the corp out of your own pocket. **This is the one thing BN3 offers that no later node
  can**, and it is the strongest argument anyone will ever make for standing up a corp here.
- `canCreateCorporation(selfFund)` is **0 GB and does not require API access** — a free precondition
  check. `createCorporation` itself is **20 GB**, which does not fit a 32 GB home with residents.
- ⚠️ **Not verified: whether the full `ns.corporation` API is callable in BN3 at SF3 level 0.**
  `bitnodes.md` records that **SF3 level 3** unlocks the full Corp API, which raises the obvious
  question of what levels 0–2 grant. The Bladeburner precedent (SF6 = mechanic, and the API works
  in-node) suggests in-node access is fine, but that is an inference. → **Q3-1** (§8).

### 6.2 Why it loses anyway

1. **The clear is not money-bound** (§5.1). Corp's output is money. A faster route to a resource we
   have enough of is worth zero days.
2. **Cost is days-to-weeks of scripting** against a 56-method API extending `WarehouseAPI` and
   `OfficeAPI`, none of which has been read here. Against a **~10-day total clear estimate**, the
   tooling costs more than the node.
3. **It does not touch rank**, which is the only quantity on the critical path.
4. The one thing it *could* buy — `The Blade's Simulacrum` at ~$3.09t — is explicitly a
   nice-to-have (§5.1).

**What would reopen it:** a decision to clear BN3 **three times** for SF3.3 (the full Corp API),
where the corp is the *reward* rather than the tool. That is a different project with a different
justification, and it should be argued on the value of a third money engine for BN13/BN15, not
smuggled in as a BN3 clearing tactic.

### 6.3 What SF3 actually buys

**SF3: create corporations in other BitNodes** (some nodes disable it), **+charisma and company-
salary mults at L1 8% / L2 12% / L3 14%**, and **L3 unlocks the full Corp API elsewhere**.

⚠️ **This is the reward that justified picking BN3 over BN11** (same 1.00× redo-tax, no unowned
reward). Worth being precise about what level 1 delivers: the *mechanic* elsewhere, the small
charisma/salary bump, and **not** the scriptable API. Whether "corporations in other nodes" is worth
much at level 1 without the API is genuinely arguable — it means manual UI play in a mechanic the
in-game guide calls the worst one to play blindly.

📌 **Recorded as a dropped objection, per the rules:** BN3's reward at level 1 may be thinner than
the "third money engine" framing in `bitnodes.md` § "Remaining sequence" implies, because that
framing does not distinguish mechanic from API. **It does not change the pick** — BN3 ties for
cheapest on the board at 1.00×, so it is near-free regardless of reward, and BN11 (the alternative
at the same price) has no unowned reward at all. Logged so the objection can return as evidence if
BN3 is ever considered for a second or third clear.

---

## 7. What transfers from BN6/BN9/BN10 — and what does not

### Transfers unchanged

- **The whole Bladeburner interface and its mechanics** — `bladeburner-reference.md` is
  node-independent.
- **Rank 400,000 is a gate, not a win condition.** Restated every node for a reason.
- **The SP bank is free money.** SP is node-local and destroyed on the clear; spending it costs
  nothing, and in BN10 it took Daedalus from `p[0.5164, 1.0000]` to `p[1.0000, 1.0000]`.
- **`bbskillbuy.js` spends the success pair by marginal value** (`89372cb`), fixing BN10's
  list-order starvation of `Digital Observer`.
- **`bbblackop.js` gates every attempt on stamina** (`709623c`) — the stamina spiral is what killed
  the BN9 run.
- **Read `getActionEstimatedSuccessChance` as a PAIR.** A widening `[pMin, pMax]` is an intelligence
  problem; only a falling `pMax` is a real decline. The estimator has been caught claiming certainty
  and being wrong by ~135×.
- **`Diplomacy` is proportional, not absolute** — ~7.3 chaos/run holding a controlled city near
  target, versus 645 removed in one run against ~717 standing chaos.

### Does NOT transfer

- 🔴 **BN9's Hacknet economy.** BN3's Hacknet Production is **25%**, and there are no Hacknet
  *Servers* without SF9.2 (we hold SF9.**1**). The hash-exchange findings — including "+100 rank
  flat" and the $250,000/hash auto-sell constant — describe a mechanic that does not exist here.
- 🔴 **BN9's Q7 rail, "never install an augmentation."** That was an argument about resetting Hacknet
  Servers. It has **no force in BN3**. (Installing is still not obviously useful here — see §5.1 —
  but it is not forbidden.)
- 🔴 **BN9's graft-first entry-gate strategy.** That was forced by BN9's 0.45 combat mult putting the
  gate at ~78,300 exp/stat. BN3's combat mult is **1.00** and the gate is **4,432 exp/stat**. Grafting
  here would cost Entropy for nothing.
- 🔴 **BN6's batcher-as-funding-engine.** At 0.008 effective steal it funds a bootstrap, not a
  ratchet.
- ⚠️ **Any rank rate, ETA or chaos number from a previous node.** `BladeburnerRank` is 1.00 here as
  in BN6, so BN6's figures are the *closest* available analogue — but they are still another node's.

### The state-inheritance trap, already guarded

🔑 `logs/bladeburner-state.json` lives on `home`, and **home files survive a BitNode switch** — so a
fresh node silently inherits the previous node's cumulative totals and per-level ledger. This
measurably broke BN10's viability tripwire (it reported `met: true` off BN6's lifetime rank). It is
**fixed**: the blob is stamped with `bitNode` and rejected whole on mismatch.

⚠️ **The file on disk right now still holds BN9's data** — rank 286,183, Sector-12, chaos 49.7. It is
intact and readable, which makes it *more* dangerous than a corrupt one. Expect
`stateMatchesNode` to reject it the moment `bladeburnermanager.js` starts in BN3, and **do not quote
it as BN3 state in the meantime.**

📌 The durable rule: **state that outlives the thing it measures will be read as if it didn't.** When
persisting a measurement, stamp it with the scope it is valid in.

---

## 8. Open questions — each with a default and a date

Per the repo rule: no expiry means the decision renews itself every session. Defaults here are
mostly "no action," so a lapse costs nothing.

| ID | Question | Default | Expires |
|---|---|---|---|
| **Q3-1** | Is the full `ns.corporation` API callable in BN3 at SF3 level 0, or is it SF3.3-gated even in-node? | **No action.** We are not using Corp (§6.2), so this is reward-framing only | **2026-10-19.** Cheap to answer whenever ~2 GB of home RAM frees: `canCreateCorporation(false)` is 0 GB and `hasCorporation()` needs no API access, so a ~1.7 GB probe settles it |
| **Q3-2** | How much money do coding contracts actually pay in BN3, and how many are on the network? | **No action**, but this is the one with real upside — the only unnerfed money source (§5.2) | **2026-10-03.** Revive early if the TOR/opener bootstrap stalls. Needs a `.cct` census, not a solver, to answer |
| **Q3-3** | Should `bitnodemults.js` be re-run to restore the destroyed multiplier logs? | **Yes, opportunistically** — tracked in `BACKLOG.md`. Blocked on home RAM (6.60 GB) | No expiry — it is a chore, not a decision |
| **Q3-4** | Should the resident set shed a script on a small home so the observability companions win the RAM race? | **No action.** The daemon degrades gracefully and relaunches on fit | **2026-10-03.** Reopen if a stale log causes a second wrong answer (it has caused one; see §4.1) |
| **Q3-5** | Build a gang for the bootstrap? | **No.** `createGang()` is irreversible and the clear is not money-bound (§5.3) | Trigger, not a date: the bootstrap stalling >2 days |

**Standing rail, no expiry:** ⚠️ **`destroybn.js` is the only irreversible step in this node, and
`nextBN` is mandatory.** Restate that at the point of execution, every time — "raise once" governs
opinions, never one-way doors.

---

## 9. Changelog

- **2026-09-19** — Created. Opened at Kenneth's request over a standing objection that a fourth doc
  is a fourth place for facts to rot; mitigated with the routing table at the top. Content:
  §1.1 closes the hacking route by calculation (the open question `bitnodes.md` parked for exactly
  this moment); §1.2/§6 close Corporation; §5.2 records that **coding contracts are BN3's only
  unnerfed money source and `src/` has no solver** — the largest unexploited lever found while
  writing this; §5.1 establishes the central thesis that **BN3's clear is money-independent**;
  §6.1 records the BN3-exclusive seed-money mechanic; §7 separates what carries from BN6/BN9/BN10
  from what actively misleads. Five open questions logged with defaults and dates.
