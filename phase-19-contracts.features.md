# Phase 19 — Coding Contracts (brainstorm)

**Status: NOTHING IS DECIDED.** This is a mid-brainstorm capture, written 2026-07-09 at
Kenneth's request when we stopped for the day. Every architecture sketch below is a
*candidate*, every preference is a *lean*, and several "findings" rest on doc reading that
has not been checked against the live game. Nothing here has been agreed, specced, or
implemented. Do not treat any section as settled input to a spec — the next session should
resume the discussion, not build from this.

Stage 1 (brainstorm) of the three-stage workflow in `CLAUDE.md`. No spec exists.

---

## Why this phase was raised

Asked for fresh ideas, surveyed the repo, and found it is **100% batcher**: `ns.codingcontract`,
`ns.hacknet`, `ns.stock`, and `ns.dnet` appear in zero of the 33 files in `src/`. Contracts
stood out because they need no Source-File (playable today, unlike Singularity), and because
they are the only mechanic in the game that is meaningfully unit-testable.

Two other candidates were raised and are *not* being pursued right now, recorded so they
aren't rediscovered from scratch:

- **Post-reset bootstrap ramp.** `logs/finance-log.json` and the 17:55 snapshot on 2026-07-09
  show a live rebuild: one batch member (`phantasy`), a `bootstrap-server` reservation for a
  *first* cloud server, and the port-opener ladder walking FTPCrack → HTTPWorm → SQLInject as
  money climbed $801K → $90M in twelve minutes. In the same snapshot the share pool held
  **1,156 GB of a 4,638 GB budget (25%)** while fleet utilization was 44% and the single batch
  member had committed 7.5%. That is live evidence for the backlog's *Auto-suppress share below
  a fleet-size/income floor* item, which until now was filed on theory. Worth capturing before
  the state passes.
- **Stock market without 4S.** TIX API is already purchased. Forecast could be estimated from
  sampled price history rather than bought, and the existing batcher's `hack`/`grow` already
  accept `{ stock: true }` — the machine that moves prices is already built.

## Kenneth's stated reservation (drives the whole design)

> "they are a bunch of little programming puzzles and i dont want to tell claude to go solve
> 30 different problems"

Taken seriously, not worked around. Two things follow, and they are the reason the design
below is shaped the way it is:

1. The puzzles are commodity content. They are standard algorithm problems that Claude knows
   from training, which also sits awkwardly against this project's "work from game mechanics,
   don't adapt other players' solutions" rule — not violating it, but making the solving hollow.
2. Therefore the phase is **a harness, not a puzzle set**. The engineering is discovery,
   submission safety, RAM, and accounting. Solver count should be an implementation detail.

**Unresolved, and the single most important open question**: who writes the solvers, and when.
See Open Questions Q1.

---

## Mechanics reference (from `markdown/`, believed accurate)

Sourced from local API docs plus the official
[codingcontracts.rst](https://github.com/bitburner-official/bitburner-beta/blob/master/doc/source/basicgameplay/codingcontracts.rst).
This section is reference material, not design.

### API surface and RAM cost

| Call | RAM | Returns |
|---|---|---|
| `getContractTypes()` | 0 GB | all 30 type names |
| `ns.ls(host, ".cct")` | 0.2 GB | filenames on a server |
| `ns.fileExists(file, host)` | 0.1 GB | bool |
| `ns.rm(file, host)` | 0.6 GB | delete a file |
| `createDummyContract(type, host)` | 2 GB | filename, or `null` |
| `getNumTriesRemaining(file, host)` | 2 GB | attempts left |
| `getContractType(file, host)` | 5 GB | type name |
| `getData(file, host)` | 5 GB | puzzle input |
| `getDescription(file, host)` | 5 GB | prose statement |
| `attempt(answer, file, host)` | 10 GB | reward string, or `""` |
| `getContract(file, host)` | 15 GB | object: type, data, description, `difficulty`, `submit()`, `numTriesRemaining()` |
| `ns.getMoneySources()` | 1.0 GB | per-source income, incl. a `codingcontract` field |

Every contract call takes an optional `host`. **No `scp` or script distribution is needed** —
one script on `home` can read and solve contracts anywhere on the network. (The official docs
note `scp` refuses to copy `.cct` files at all, so this is the only way.)

### Lifecycle

- Randomly generated over time, scattered across servers. Official doc says any server
  **except purchased servers**. Whether `home` is eligible is unconfirmed.
- Plain `.cct` files, so discovery is an `ns.ls` sweep with a `".cct"` substring filter.
- Limited attempts each. A wrong answer burns one. **Exhaust them and the contract
  self-destructs — file deleted, reward gone permanently.** No partial credit, no recovery.
  This failure mode is asymmetric in a way nothing else in this repo is: a solver bug does not
  merely fail to earn, it destroys the thing it was meant to earn from.
- Four reward types: money, company reputation, reputation with one specific faction, or
  reputation with **every faction you have joined**.
- `createDummyContract(type, host)` generates a **reward-free** contract of any named type on
  demand. Returns `null` if the generated filename collides or the host is offline.

### The 30 types

`markdown/bitburner.codingcontractsignatures.md` maps each type to a typed `[input, answer]`
tuple, so the whole problem set is statically typed and enumerable. `getContractTypes()`
enumerates the names at runtime for 0 GB.

Notable: **`Square Root` uses `bigint` for both input and answer.** `JSON.stringify` throws
outright on a BigInt, which collides with this project's log-export convention.

---

## Findings that would shape a design (each still unverified where noted)

### F1. The game can grade the solvers — no human review of solutions

Dummy contracts are reward-free and the game validates submissions authoritatively. Combined
with a per-type gate (below), this means solver correctness never needs to be *read* to be
trusted. This is the direct answer to Kenneth's reservation: the objection is to reviewing
thirty solutions, and this removes the reviewing, not the solutions.

### F2. The reward string is the wrong success signal; the file is the right one

`attempt()` returns the reward string on success and `""` on failure — but a dummy contract has
**no reward**, so a successful dummy submit may return `""` too, indistinguishable from failure.
**UNVERIFIED — this is an inference from two doc sentences, and the whole dummy-gate idea
depends on it. Check live first.**

Robust alternative: solving a contract removes the file, so `ns.fileExists` (0.1 GB) reports the
verdict. One ambiguity — exhausting attempts *also* removes the file — which
`getNumTriesRemaining` (2 GB) resolves completely:

> **If tries ≥ 2 before submitting, a single wrong answer cannot destroy the contract, so the
> file's absence afterward means "solved" and nothing else.**

Cheap, type-agnostic, and independent of any undocumented string format.

### F3. A per-type validation gate would make a wrong solver harmless

Sketch, **not decided**:

> Before submitting a real contract of type *T*, generate *k* dummies of type *T*, solve and
> submit each, confirm via the F2 oracle. Only if all *k* pass may the manager touch a real
> contract of that type. On any failure: skip *T* entirely, `ns.rm` the litter, log it.

A wrong solver becomes structurally incapable of destroying a real contract — it fails against
free dummies and gets benched. Dummy instances are randomized, so *k* trials give genuine
statistical confidence; curated cases and property tests in vitest would cover the dev-time side.

Wrinkles:
- `createDummyContract` takes a `host`, and purchased servers can never hold real contracts, so
  **creating dummies on `cloud-0` gives zero chance of confusing a dummy with a real contract.**
  Needs a fallback (track returned filenames on `home`) for the post-reset state where no cloud
  server exists — which is exactly the state the save is in right now.
- Validation costs time, and a one-shot loses memory on exit, so results need persisting, keyed
  by a solver-version hash, in a state file (`financestate.js` is the existing pattern).
  Otherwise every sweep re-validates from scratch forever.

### F4. Reward accounting has an exact answer; no string parsing needed

`ns.getMoneySources()` (1.0 GB) exposes a **`codingcontract`** field in both `sinceInstall` and
`sinceStart`. Delta across the sweep gives precise money earned — no prose parsing, and no noisy
`getPlayer().money` diffing against a batcher crediting hacks asynchronously.

That covers one of four reward types. The other three are reputation and are not money, so they
do not belong in `recordTransaction`. **Lean, not decided:** record the money exactly, log the
reward string verbatim, and do *not* parse it — the format is undocumented and parsing it is a
silent-breakage risk on the next game update.

### F5. There is no RAM reservation component, and none is needed

Checked directly, correcting a wrong assumption raised in discussion:

- `resourcemanager.js` reserves **money** only (`bootstrap-server`, `next-port-opener`,
  `manual-extra`). Contracts *earn*, so nothing there applies.
- RAM headroom is one constant and one check. `HOME_RESERVE_GB = 32` (`hosts.js:7`) is
  subtracted from home's *advertised* free RAM at `hosts.js:111`, so the waterfall never
  allocates home's last 32 GB. Because `usedRam` already counts running companions, that 32 GB
  floats *on top of* actual usage — a genuinely free cushion at steady state, not a budget the
  companions sit inside. Resident companions currently measure **43.10 GB** total
  (`logs/ramcheck-result.json`: `daemon.js` 16.3, `targetsmonitor.js` 12.7, `cloudmanager.js`
  6.25, `resourcemanager.js` 3.35, `transactionsmonitor.js` 2.6, `tailmanager.js` 1.9), above
  the reserve, which is correct by design.
- `fitsOnHome()` (`daemon.js:99`) is a launch-time free-RAM check with an INFO skip. A
  check-then-exec, not a reservation — nothing holds RAM.

So the real question is not "how do we reserve RAM" but **"can a ~23 GB script fit in the 32 GB
cushion, and how long must it hold it."**

### F6. The RAM budget is tight enough that it must be measured before solvers are written

Candidate total: base 1.6 + `getContract` 15 + `createDummyContract` 2 +
`getNumTriesRemaining` 2 + `getMoneySources` 1.0 + `rm` 0.6 + `ls` 0.2 + `scan` 0.2 +
`fileExists` 0.1 ≈ **22.7 GB**, comfortably inside the cushion.

**This assumes `contract.submit(answer)` is not charged `attempt`'s 10 GB.** If the analyzer
charges it anyway, the script is **32.7 GB** and no longer fits the cushion at all. The
alternative path (`getContractType` + `getData` + `attempt` = 20 GB) buys strictly less
information and lands in the same place.

Given this project's history of the analyzer defying everyone's mental model — Phase 9's
`share`, Phase 11's `.exec`, Phase 13's closures-as-data — **measure, do not predict.** A
five-line throwaway probe comparing `getContract` + `submit()` against `getData` + `attempt()`
should run before any solver is written. Same shape as the since-deleted
`src/ramprobe-workerkeys.js`.

### F7. Phantom-charge hazard is unusually severe here

Phase 11 confirmed a *method-name* collision charges full cost (`CLOUD_NAME_PATTERN.exec(name)`
cost the full 1.30 GB of `ns.exec`). Phase 13 confirmed object-literal *keys* are safe, so a
solver registry keyed by contract name is fine.

But a solver loop's most natural identifiers are exactly the expensive ones:

| Identifier | Phantom cost if used as a bare name |
|---|---|
| `attempt` | **10 GB** |
| `getData` | 5 GB |
| `getDescription` | 5 GB |
| `getContractType` | 5 GB |

`submit` is not an `ns` method name and should be safe. This is the most likely way the phase
re-lives Phase 9's debugging session.

### F8. The sweep set is not `listHosts()`

`listHosts()` returns rooted hosts only. Contracts spawn regardless of root, skipping purchased
servers. So the sweep is likely `scanNetwork()` minus `ns.cloud.getServerNames()`.

**UNVERIFIED:** whether `getContract` works on an *unrooted* server. This decides whether the
sweep covers the whole network or only the rooted part. One cheap live check.

---

## Candidate architecture (SKETCH — not agreed)

Three files, mirroring the established Singularity-isolation pattern:

- **`contracts.js`** — the manager. Sweeps, reads, dispatches to a solver, submits, logs, exits.
  ~23 GB held only during a sweep. `exec`'d by filename via `launchDetached`, never imported
  into `daemon.js`.
- **`solvers.js`** — pure `data → answer` functions, no `ns` parameter anywhere. The file vitest
  covers completely, and the reason `npm test` could be this phase's real gate rather than a
  live run — which would be a first for this project.
- **`daemon.js`** — one cadence check plus a `launchDetached`. No new RAM.

### Resident poller vs. periodic one-shot

**Leaning hard toward periodic one-shot**, not decided. Contracts spawn rarely and (unverified)
never expire, so solving one *sooner* is worth almost nothing. A resident poller would hold
~23 GB of the 32 GB cushion permanently to wait for an event that happens a few times an hour.
A one-shot holds it for seconds and returns it to the worker pool.

**Side effect worth noting:** `fitsOnHome`'s INFO skip is a permanent loss for a
startup-launched companion — miss the window on a small post-reset home and the script never
runs until the next daemon restart. That is precisely the "launch-retry gap" open decision in
the backlog's auto-backdoor item. A periodic re-exec makes the skip **self-healing**. If that
holds, it also resolves the `procureprograms.js` Source-File watcher debate stuck in Next Up:
not a tiny resident watcher, just a periodic re-exec of the real script. **Three backlog items
may share one answer** — worth confirming rather than assuming.

---

## Open questions

**Q1. Who writes the solvers, and when?** *The blocking question.* Asked and not answered.
Options as framed:
   - **Demand-driven (Claude solves).** Ship the harness with 0–3 trivial solvers; it logs every
     unsupported type it encounters as a work queue; write each solver only when that type
     actually spawns. Realistically ~8–10 types ever, not 30.
   - **Harness only (Kenneth solves).** Claude never writes a solver; the harness scaffolds a
     stub plus a failing vitest case seeded from a dummy contract. Keeps the puzzles as puzzles.
   - **All 30, delegated to subagents,** with the dummy gate as acceptance criterion.
   - Note: F3's gate removes the *safety* argument against bulk generation. What remains is
     purely whether Kenneth wants the puzzles as puzzles. That is his call, not a technical one.

**Q2.** Does a successful submit on a *reward-free dummy* return `""`? (F2 depends on it.)

**Q3.** Does `getContract` work on an unrooted server? (Decides the sweep set, F8.)

**Q4.** Can real contracts spawn on `home`? (Decides whether dummy/real disambiguation is
needed there at all.)

**Q5.** Do contracts really never expire? Assumed throughout — nothing in the docs mentions
expiry — but never confirmed. Cadence and the demand-driven option both lean on it.

**Q6.** Is `contract.submit()` free of `attempt`'s 10 GB charge? (F6. Probe before building.)

**Q7.** Cadence — every how many daemon ticks? Free parameter if Q5 holds; anything from 3 to
15 minutes is defensible.

**Q8.** `bigint` handling for `Square Root`, in both the `logs/` export and any state file.
`JSON.stringify` throws on it.

**Q9.** How many dummy trials *k* per type before trusting a solver? Trades runtime against
confidence.

**Q10.** Reward accounting shape: money via `getMoneySources` delta into `recordTransaction`,
and reputation rewards as… what? `recordTransaction` is a purchase log; income and rep may not
fit its schema.

---

## Leaning against (argued, NOT rejected — no decision taken)

- **Resident poller.** Holds ~23 GB indefinitely for a rare event. See above.
- **Parsing the reward string.** Undocumented format, silent breakage on game update. `F4`'s
  `getMoneySources` delta is exact for the money case.
- **`getData` + `attempt` submission path.** 20 GB for less information than `getContract`'s 15.
- **Reward string as the dummy-gate success signal.** Superseded by the `fileExists` +
  `tries ≥ 2` oracle (F2), *if* Q2 confirms.

---

## Before any implementation

Live checks, all cheap, none started:

1. RAM probe: `getContract` + `submit()` vs `getData` + `attempt()` (Q6, F6). **Do this first** —
   it can invalidate the whole single-script architecture.
2. Dummy submit return value on success (Q2).
3. `getContract` against an unrooted server (Q3).
4. `ns.ls` sweep for existing `.cct` files, including `home` (Q4) — also tells us what types are
   actually sitting in the save right now, which directly informs Q1's demand-driven option.

## Where we stopped

Mid-brainstorm, 2026-07-09. Design threads still unpulled, in the order they were offered:
the validation-gate details, the daemon cadence and how `contracts.js` gets its trigger, and
the `solvers.js` module shape and how vitest sees it. Q1 remains the blocker; everything
downstream of it is sketch.
