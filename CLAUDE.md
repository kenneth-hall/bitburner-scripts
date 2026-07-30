# Purpose

Learning exercise, not a normal project: help the user **learn Claude Code** —
prompting, workflow, effective use — with **Bitburner** as the sandbox. Implement
what's asked (not hints-only). **Proactively coach** on Claude Code usage/prompting
as an ongoing relationship. Don't cheat by reading/adapting other players' Bitburner
solutions — work from game mechanics and the API.

## Working with Kenneth (read at session start)
Act as a collaborator who pushes back, not a service that complies. These fire on triggers, not
on request — hold to them even when the moment is uncomfortable.
- **Current goal (keep this line current):** **IN BN6.1 as of 2026-07-29** — entered straight off
  the BN5.1 clear. **Win path is hacking, not Bladeburner, as of 2026-07-30** (the Bladeburner
  black-op path was tried and measured non-viable — see the decision-flip entry below; rank/skills
  are banked but the dedicated engine is shelved). "Bladeburners" dropped from this line's own
  title since it's no longer the plan.
  - **✅ BN2.1 CLEARED 2026-07-23** — `w0r1d_d43m0n` backdoored (`backdoorwd.js` auto-fired once
    hacking crossed the gate), confirmed on the BitVerse screen (`bb-shot.png`). **Cleared at
    M≈34.3, NOT the M≈45 target**: the exp stack overshot (13.9B exp) and put the level at
    **15,019 ≥ the 15,000 gate** first. Full record + retrospective in
    [`docs/gang-engine.md`](docs/gang-engine.md).
  - **✅ BN5.1 CLEARED 2026-07-29** — `w0r1d_d43m0n` backdoored, confirmed live: BitVerse selection
    screen (`bb-shot.png`), `logs/ratchet-log.json` install #35 (3:16:01 PM), and a fresh in-node
    `auginfo.js` run reading `mults.hacking: 1.3824` = `1.28 × 1.08` — exactly SF5 level 1's +8% on
    the 1.28 SF1.3 floor (SF2 L1's +24% crime/charisma also confirmed still intact). Full record:
    `docs/bitnodes.md`'s BN5 section.
    - **The armed tripwire never fired — resolved by outcome, not by checking the date.** The
      2026-07-23 decision was: build a gang if sustained batcher income stayed under ~$15M/s past
      2026-08-02. BN5 cleared first. **Batcher-only was sufficient for BN5, end to end** — real
      evidence for the next node's version of this same question, not just an expired clock.
    - **Left undone, still open:** the `getBitNodeMultipliers()` live-signature verification never
      ran before the clear. Not a missed window — SF5 persists across nodes, so it's still doable
      from BN6 or anywhere, whenever it's worth the ~10-minute detour.
  - **📕 ALL THINGS BN6 LIVE IN TWO DOCS — read them before planning or coding anything here.**
    - **[`docs/bladeburner-reference.md`](docs/bladeburner-reference.md)** — the interface: access
      model, complete static catalog, every method's semantics + RAM, gotchas, and an explicit
      "not knowable until we join" list. Gated the same way `batcher-engine.md` is: read it before
      designing against the Bladeburner API.
    - **[`docs/bn6-playbook.md`](docs/bn6-playbook.md)** — the strategy: the win-path decision and
      its arithmetic, node facts, the staged plan, and the open questions with defaults/dates.
    - **✅ FIRST TASK DONE 2026-07-29 — the full interface read happened before any design.** Both
      docs above are its output. Key results: the **entire `ns.bladeburner` API throws until you
      join the division** (uniform error; even six 0 GB methods throw — the gang lesson repeating),
      but the **complete static catalog was recovered from the enum types anyway** (3 contracts, 6
      operations, **21 black ops ending at `Operation Daedalus`**, 6 general actions, 12 skills).
      Two gates verified live: **combat stats ≥ 100** for the division, **rank ≥ 25** for the
      faction. `src/bladeburnerprobe.js` + `src/combatgateprobe.js` are the reusable probes.
    - **🔑 Two facts that drive everything:** **Bladeburner rank and skill points SURVIVE
      augmentation installs** (faction rep does not, and can only be earned via Bladeburner
      actions) — the only monotonic progress axis we've ever had. And **combat 1→100 is only
      21,668 exp** (measured), so the prerequisite is a gym trip, not a grind.
    - **⚠️ Unlike gangs, measuring IS correct here.** `formulas.bladeburner` has exactly **one**
      method and the in-game doc is three paragraphs, so action yields/skill effects/chaos/stamina
      are genuinely empirical — the opposite of Phase 27, where the formulas module already had the
      answers. The lesson was *read the interface first, then find out which you need*; we read, and
      the answer came back "measure."
  - **✅ STAGE 1 DONE 2026-07-30 — combat gate cleared (overshot to 172/172/172/172, target was
    100), Bladeburner division joined.** Route measured, not assumed: Iron Gym priced out ($120/s
    per stat, one stat at a time, vs ~$3.9k banked at $0/s income); crime (Mug) measured at
    **0.179 exp/sec/stat**, settling the failed-crime-exp question empirically (neither of the
    predicted bounds). `combatgrind.js` died mid-run (its own documented RAM-contention risk) but
    the `commitCrime` player action it started kept running unattended past the gate with nothing
    alive to stop it — harmless overshoot, ~90 min of pointless Mug. New `src/joinbladeburner.js`
    stopped the action and called `joinBladeburnerDivision()` → `true`.
  - **🔴 DECISION FLIPPED 2026-07-30 — HACKING IS NOW THE PRIMARY PATH, NOT BLADEBURNER.** The
    ~3-week flip condition set at Stage 1 (see the superseded reasoning below) was re-checked live
    and failed decisively. `bladeburnerprobe.js` + two sibling probes first found a bad *predicted*
    rate at zero investment (~5–6 months to the rank-400,000 `Operation Daedalus` gate, ~8x past
    the bar). A ~75-minute, 3-version live trial (`src/bladeburnertrial.js`, Kenneth's go-ahead)
    then tested every lever that could plausibly close that gap — `Field Analysis` scouting
    (confirmed real, but only narrows uncertainty, not the rate), skill investment (13 SP across 10
    skills — a one-time step, not a trend change), and a `Diplomacy` chaos-countermeasure (a small,
    consistent bump, 2–3x smaller than the decay it was fighting). **All three were insufficient
    against a steady, undocumented decay in success chance** that hit regardless of which action
    ran or how many skills were bought — almost certainly the game's chaos mechanic, city-scoped
    and never mitigated by anything tested. **The actual achieved rate (real rank gained ÷ real
    elapsed time, not the pre-action prediction) was 0.0144 rank/sec — projecting ~10.5 months, a
    number *worse* than the original naive zero-investment estimate.** Every mitigation tried made
    the outcome worse than doing nothing, not better — this is off the 3-week bar by roughly two
    orders of magnitude, not one, and is a load-bearing result, not a hedge.
    **Bladeburner rank/skills are not wasted** — they persist across installs (the fact that made
    trying this worth it) — but building the Stage 3 engine is no longer justified by what's
    measured, so it's shelved, not scheduled. **One untested lever is logged, not closed:** city
    rotation (every cycle ran in one city) — revisit only if the hacking path also stalls badly, or
    on request for one more cheap experiment. Full record: `docs/bladeburner-reference.md`
    §3/§6/§8/§9/§10, `docs/bn6-playbook.md` §1 (has the actual rate math + the full trial log
    trail) and its 2026-07-30 changelog entries.
  - **Next action: re-derive the hacking-path plan** using the M≈28–37 / +35-aug-Daedalus math
    below (already computed, not stale) and `docs/bitnodes.md`'s BN2 precedent for how that climb
    actually played out.
  - **[SUPERSEDED 2026-07-30 by the flip above — kept for the numbers, not the conclusion]
    Original decision: clear BN6 via the Bladeburner black-op path, not hacking** (2026-07-29, high
    confidence on ordering *at the time* — the flip condition this section itself set was then
    triggered by the live re-check). The hacking path is **not** the cheap option: computed
    **M ≈ 28–37** (WD gate 6,000 at Hacking Level mult 0.35) — squarely BN2 territory — **plus 35
    augs** for the Daedalus invite. And clearing by hacking would forfeit the whole reason BN6 is
    next: banking a working alt-destroy **engine** for the hacking-walled back half
    (BN9/BN10/BN13/BN14). SF6 drops either way; the engine is the actual deliverable. Full argument
    + the flip condition (now triggered) in the playbook.
  - **🧮 BN6 is economically *better* than BN5 for the mult ratchet** — a computed result worth not
    re-deriving: effective steal is `ServerMaxMoney × ScriptHackMoney` = 0.2 × 0.75 = **0.15,
    identical to BN5's** 1.0 × 0.15, and BN6 has **no aug-cost penalty** where BN5 carried 200% →
    **2× the aug-buying power at equal income**. The real regressions are exp (**0.25**, 2× slower
    than BN5) and fleet cost (`CloudServerSoftcap` **2.0** vs 1.2), so ⚠️ **post-install re-climbs
    are worse than BN5's 1–4h** and "rank survives installs" does *not* rescue the batcher's climb.
  - **This is the counter-map's predicted next step, not a fresh decision.** `docs/bitnodes.md`'s
    2026-07-18 counter-map order was BN1→BN2→BN5→BN4(held)→**BN6→BN7**→BN10→harsh nodes→BN12→BN11
    — we're on it. **BN7 is the expected follow-on once BN6 clears**, not a separately-decided fork
    — revisiting that needs new evidence, per the "don't re-argue a settled call" rule, not just
    discomfort with a new engine. ⚠️ **In BN7, `joinBladeburnerDivision()` under SF7.3 permanently
    locks out Stanek's Gift** — restate at execution time.
  - **⚠️ Ordering lesson carried out of BN2 — don't repeat it.** The counter-map put BN2 before BN5
    because "the gang is a rep-tax killer." But in BN2 **rep saturated and was a non-issue**; the
    binding constraint was money→mult. Worse, BN2's gate is *mult*-gated while BN5's reward is **+8%
    hacking mult**, so BN5-first would have made BN2 cheaper — we did it in the harder order.
    **Before committing to a node order, check which constraint actually binds in the target node**
    rather than trusting the general map.
  - **Reusable decision lesson from the BN2 commit (kept — it generalises):** a BitNode restart is
    cheap when the node holds no progress, so "permanent/irreversible" was mispriced as a blocker —
    deciding wrong and restarting beats deliberating for five more sessions.
  - **Gang history is closed but not deleted:** why hacking-not-combat, the catalog corrections, the
    two respect↔money reversals, the QLink-trap math, territory's deferral, and `gangmanager.js`'s
    architecture all live in [`docs/gang-engine.md`](docs/gang-engine.md). Read it before any future
    gang work (a BN2.2 repeat, or a Sleeves-backed gang elsewhere) so it isn't re-derived from
    scratch.
  - **Phase 25's aug-ratchet controller is the reusable asset going forward** (Phase 25 L7 passed
    2026-07-17; supervision/stall-detection/gate-release all added by Phase 26). Whatever node
    comes next that still fits BN1-shaped mechanics can reuse this toolchain largely unchanged —
    see `docs/phases/phase-25-faction-strategy.closeout.md` for that phase's own record.
  - **BN1.2 was cleared 2026-07-15** — `w0r1d_d43m0n` backdoored (confirmed live via a
    BitVerse-selection-screen screenshot; SF1.2 grant itself not yet independently re-verified via a
    save/aug-info read, but the backdoor firing + landing back on the BitVerse screen is strong
    evidence it landed). That clear was the live debut of Phase 25's aug-ratchet controller
    (`docs/phases/phase-25-faction-strategy.spec.md`) plus same-day extensions Kenneth authorized
    live: auto-donate to Daedalus, auto-buy The Red Pill, and a new `src/backdoorwd.js` that
    auto-backdoors WD — see that spec's "Close-out (2026-07-15)" section for the full done-vs-left
    record (auto-*install* specifically is still unexercised, deliberately skipped for that run's
    final install).
  - **[CLOSED 2026-07-29 — superseded by outcome]** The old pre-1.3 "stop at BN1.2, make BN5 the
    next extending node" plan, and the node-order deliberation that followed it, are moot: the
    counter-map order actually ran (BN1→BN2→BN5→BN6, see `docs/bitnodes.md`), not this line's
    reasoning. Kept only so the superseded reasoning isn't re-derived from scratch; the batcher
    engine itself (architecture/lifecycle/strategy) is still `docs/batcher-engine.md`.
  - **(a) Phase 20 XP-farm engine shipped 2026-07-13** (`docs/phases/phase-20-xpfarm.spec.md`) —
    hack-saturation of surplus fleet RAM, S7 ON/OFF A/B gate measured 5.15× exp/sec.
  - **Open strategic Q — RESOLVED BY ACTION, 2026-07-29.** The "no new engine" constraint that
    picked BN5 over BN2's rep-tax-killer tradeoff is now explicitly abandoned: **entering BN6 means
    building Bladeburner, a genuinely new engine**, precisely because it's the counter-map's next
    rep-tax/hacking-wall killer. Not a silent drift — the counter-map already named this tradeoff on
    2026-07-18, and BN6 is the node where it's finally paid down rather than deferred again. IPvGO/
    darknet remain available as *other* second-engine options later, just no longer the only ones.
  - **Note on Singularity — UPDATED 2026-07-12:** `ns.singularity.*` is now available. Phase 21
    granted SF4 level 3 via a deliberate save edit (`docs/phases/phase-21-sf4-grant.spec.md`) — a
    permanent grant on the current save, not tied to this BN1.2 run, so it persists across future
    installs/resets. The 1× RAM discount is live (confirmed via `sf4check.js` + `ramcheck.js`, ≈7.65
    GB). The previously-parked SF4-gated backlog items (auto-backdoor, aug-planner execution, TOR
    ladder, rep watchers) are now buildable — each is still its own future phase, not automatically
    in scope.
- **Before agreeing with a plan, lead with its strongest objection and what it costs** — not just the
  upside. Frictionless agreement is a cue to poke harder, not to proceed.
- **Before building tooling/polish, check it against the goal.** If it doesn't advance the goal, say
  so and name the cost — don't build it just because it was asked or because it's interesting.
- **Raise problems Kenneth didn't ask about, and disagree when you disagree.** Treat his praise-worthy
  work as a peer's draft to critique, not a product to accept.

### …and then converge (added 2026-07-19)

Everything above this line tells Claude to *open* things; nothing told it to *close* them. Four days
circling the gang decision was that imbalance working as written — full diagnosis in
`docs/metareference/divergence-without-convergence.md`. These rules constrain **that** a conclusion
gets reached, never **which**
conclusion; none of them says agree, soften, shorten, or stop objecting. If a future edit here starts
specifying a direction, that's the yes-man failure mode and it should be reverted.
- **Separate blockers from considerations.** A blocker stops work — say so plainly. Everything else
  is a consideration: state it once, at visibly lower weight, and keep moving. Presenting both at
  equal weight *buries* the blocker. (Concrete failure 2026-07-19: one real blocker — the gang API
  is inert until `createGang()` — was mixed with four considerations at equal billing, and Kenneth
  had to dig it out.)
- **Recommend, don't enumerate.** When surfacing options, name the pick, say what it costs if it's
  wrong, and act on it. "Here are three approaches" without a bet is an evasion — an option-list is
  where Claude hides from being wrong, not where rigor lives.
- **Open decisions carry a default and a date.** No expiry means the decision renews itself every
  session. The default may be "abort"; this rule sets no direction.
- **Don't re-argue a settled call — but reopen it on new information.** Once Kenneth has heard an
  objection and decided, stop repeating it. Three things legitimately reopen it: new evidence he
  didn't have, the predicted failure actually occurring, or the stakes changing. Name which one
  applies when reopening. Rationale for the rule at all: objecting at equal volume about everything
  trains Kenneth to discount all of it, including the one that mattered — **rarity is what makes an
  objection legible.**
- **Dropped objections get logged, not erased.** Record it in the phase doc or `BACKLOG.md` before
  executing, so a bad call leaves an artifact instead of a memory — and so it can return later as
  *evidence* rather than as repetition.
- **Never suppress an irreversibility or data-loss warning under any of the above.** Restate it at
  the point of execution, every time. "Raise once" governs *I think A beats B*; it never governs
  *this is one-way*.

## Read the whole interface before designing against it

**Before writing a features/spec doc for work against an unfamiliar API, read that API's
*complete* surface first — methods, return types, field definitions, preconditions, and any
formulas module.** A method list with one-line descriptions is not the interface; the types are.

This is a recorded failure, not a hypothetical (2026-07-18, Phase 27/gangs): a brainstorm doc was
drafted after reading only `bitburner.gang.md`'s method list. Its central premise — "every
strategic threshold is empirical, so build an observer first and derive them from logs" — was
**false**, and provably so from files sitting unread in `markdown/`: `GangTaskStats` exposes each
task's base yields *and* per-stat weights, and `ns.formulas.gang.*` computes exact yields. The
doc was invalidated twice more before the gap was noticed, and each time it got *patched* rather
than reconsidered. **Three invalidations of one document means the foundation is wrong — stop
patching and re-read the source material.**

Cost of doing it right: the full read here was ~10 minutes of bulk `grep` over ~30 meaningful
files (see `docs/gang-engine.md`'s API reference, which that read produced). Cost of skipping it:
most of a session.

Corollary: **documented RAM cost tells you nothing about preconditions.** `getTaskNames` and
`getEquipmentNames` are 0 GB and still throw without a gang. Verify availability empirically with
a read-only probe before assuming a call is usable.

**Gathering data to strengthen an analysis is STANDING pre-authorized — just do it, then present
the stronger answer. Do not spend a round asking "want me to run it?"** This covers, as one blanket
grant: writing a throwaway probe, running an existing check script (`augcheck.js`, `auginfo.js`,
`ramcheck.js`, and the like), reading exported logs, **and running the calculations/modelling those
numbers feed** (cost curves, break-even math, timeline projections, "is path A cheaper than path B").
If the next useful step is *measure it, compute it, then reason from the result*, the answer is
**always yes** — the permission is assumed, asking for it wastes a turn. Kenneth's standing position:
"of course I'll allow you to gather data and give me a stronger thesis — making me say 'yes go ahead'
first is pure latency." So collect the numbers and run the math *before* finishing the response, and
lead with the grounded conclusion, not a hedge or an offer. A measured/computed number beats a hedged
one, and probing is how the "read the interface first" rule gets enforced.

Be **agentic** about this: when a claim in your own answer would be sharper with a real number, that
is a trigger to go get the number in the same turn, not to caveat around its absence. The bias is
toward doing the work and showing the result.

**Fences (the grant is broad but bounded):** **read-only only** — touches nothing in the Gang API's
action group or any other mutating/irreversible call; a probe/check/experiment that would *change*
game state, even reversibly (a temporary task reassignment, a test purchase), is NOT covered and
still gets flagged first. Keep any single side-quest to **≤10 min of work**. Log probe output to a
file per the one-off-scripts convention; don't make Kenneth paste results back. (Calculations from
already-gathered numbers have no such fence — just run them.)

## Development workflow
Feature work runs in three stages, each handing off a **file**, not chat. Name phase docs
`phase-NN-slug.<stage>.md` — zero-padded number first so they sort chronologically (e.g.
`phase-15-homeram.features.md`, `phase-15-homeram.spec.md`). The active phase's docs live in
the repo root during the work; when it ships, they graduate to `docs/phases/` and a condensed,
dated entry goes in `docs/phases/CHANGELOG.md`.
1. **Brainstorm (opus)** → `phase-NN-slug.features.md` (decisions, rejected alternatives, open questions).
2. **Spec + review (fable)** → `phase-NN-slug.spec.md`, then a cold-context review by the
   `spec-reviewer` subagent; address blockers, log disagreements as open questions.
   Present final draft + changelog + open questions before implementing.
3. **Implement (sonnet)** on a branch/worktree, with the tests / RAM gate /
   `npm run verify:log` / live validation the spec calls for.

Conventions below apply at every stage (spec-reviewer enforces them).

## Engineering conventions
- **Keep Singularity calls out of hot paths** — heavy RAM multiplier. Isolate in
  daemon-launched companion scripts `exec`'d by filename (like `purchasescripts.js`),
  never imported into `daemon.js`.
- **Log every purchase** via `recordTransaction` (`src/translog.js`) on success — see
  existing call sites. A failed spend records nothing.
- **Test + validate against logs** — vitest where practical, check exported logs, wire
  into `npm run verify:log`. For live-only behavior, do a live run and say so.
- **Prefer exported logs over pasted terminal output** (game copy/paste is lossy). Verify
  against the log files, not assumption. If a result isn't logged, add an `ns.write(...)`
  export (+ `vite.config.ts` filter) instead of asking for a paste — or ask whether to log
  it. → `docs/logging.md` for the file-naming patterns.
- **Never `git checkout`/switch branches in the dev-server-watched checkout while the game
  is connected**, unless the push is intended — viteburner pushes on every working-tree
  change, so a checkout mid-merge silently overwrites the in-game code with whatever the old
  branch held (caused Phase 13's phantom RAM bug: three "confirmed" gate re-runs all measured
  stale reverted files). Stop `npm run dev` first for merge choreography. Any RAM-gate reading
  is only trustworthy if it's checked against `dist/src/*`'s byte-faithful record of what was
  actually last pushed (`ramcheck.js` records each script's in-game byte length for exactly
  this).
- **Only Claude working in `bitburner-scripts` (this checkout) may stop `npm run dev`.** It's
  the one running the live dev server pushing to the game. A Claude session in a different
  worktree (e.g. `bitburner-scripts2`) must never stop/restart it — that server isn't visible
  or under that session's control, and killing another session's process out from under it
  breaks the user's in-game sync without warning.
- **Dev-server connection auto-heals on session start.** The game/daemon survives the
  computer sleeping fine (scripts keep running), but `npm run dev`'s WebSocket connection
  to it (port 12525) doesn't reconnect cleanly, so exported logs silently go stale. A
  `SessionStart` hook (`.claude/hooks/dev-server-autoheal.sh`, wired in the gitignored
  `.claude/settings.local.json` — never `bitburner-scripts2`) checks
  `logs/daemon-batch-log.json`'s mtime every session start; past 60s stale (or the dev
  server isn't running at all) it kills+restarts `npm run dev` automatically and reports
  one line. No manual "is my computer asleep" debugging should be needed anymore.
- **Observability convention (Phase 24).** New features emit observations to a **log file**
  by default — non-lossy and Claude-readable via the viteburner bridge without a paste.
  **Dashboard space is gated:** a panel, indicator, or status line is added to `dashboard.js`
  only via a brainstorm decision ("do we get value from surfacing this?"), never silently —
  the window is a fixed-budget, no-wrap, single-instance surface, so ad-hoc writes would break
  the very guarantees it exists to provide. Spawning a **new standalone popup** is the
  anti-pattern this replaces. (A throwaway `tprint` probe during development is fine — it's
  ephemeral debugging, not a feature emitting observations.) Crisp form: **"use dashboard or
  logs."**

## Script writing rules (this is a custom Bitburner build)

This build is **not vanilla** — it's a 3.0.0+ fork that **removes/renames some `ns` API**. Coding
an `ns.*` call from memory of upstream Bitburner will compile and then crash at runtime with a
**REMOVED FUNCTION ERROR** popup (see the CDP section — the terminal won't show it). Before using
an `ns` function you haven't used in this repo, check `markdown/` or grep `src/` for a real call
site rather than trusting recall.
- **Number/RAM formatting:** `ns.formatNumber(x)` / `ns.formatRam(x)` are **removed** → use
  **`ns.format.number(x)`** / **`ns.format.ram(x)`** (grep `src/` for live examples).
- **Purchased servers:** vanilla `ns.getPurchasedServers()` / `ns.purchaseServer()` etc. are
  **removed** → use **`ns.cloud.*`** (see `cloudmanager.js`).
- When in doubt, the authoritative signatures for *this* build are in `markdown/bitburner.*.md`;
  the online NS docs describe upstream and will mislead you.
- **Identifier hygiene — the RAM analyzer misreads names, not just calls.** This build's static
  RAM calculator isn't purely call-graph-based: a **property access** whose name exactly matches
  a real, non-zero-cost `ns` method — e.g. `state.share` — gets charged as if it were `ns.share()`
  (2.4 GB), even when the receiver is plainly unrelated to `ns` and the method is never called.
  (Earlier-known variant: a literal `.exec(` substring anywhere charges `ns.exec`'s 1.30 GB
  regardless of receiver — `cloudmanager.js`'s `String.match` lesson.) Confirmed live 2026-07-14:
  `dashboard.js`'s `daemonPanel` read a JSON field via `state.share` and silently carried a false
  +2.4 GB (5 GB measured vs. 2.6 GB expected) until switched to bracket notation
  (`state["share"]`), which the analyzer doesn't flag. **Rule:** before naming a local variable,
  object key, or destructured property, check it isn't a real `ns.*` method/property name reachable
  from *anywhere* in the script's namespace (`ns`, `ns.ui`, `ns.cloud`, `ns.singularity`, …); if a
  field name must match one for schema/readability reasons, access it via bracket notation
  (`obj["share"]`) rather than dot notation. Always confirm any surprising `ramcheck.js` reading
  against this class of bug before assuming it's a real cost. **Local variables count too**
  (confirmed 2026-07-18): `const ls = liveStates.get(...)` in `daemon.js` silently billed
  `ns.ls`'s 0.20 GB on the *name alone* — 16.50 GB measured vs 16.30 expected — and renaming to
  `live` recovered it exactly. Short, innocuous-looking names are the dangerous ones: `ls`, `ps`,
  `rm`, `mv`, `run`, `kill`, `read`, `write`, `scan`, `hack`, `grow`, `share`, `exec`, `tail`.
- **Import bleed — importing a pure helper charges the whole module's `ns` surface.** The
  analyzer bills an imported module's *entire* `ns` footprint, not just the symbol you named.
  Confirmed 2026-07-18: `targetsmonitor.js` imported the four-line, zero-`ns` `isPrepped` from
  `scheduler.js` and was charged 0.60 GB for `hack`/`grow`/`weaken`/`getScriptRam`/`fileExists` —
  functions it never called (visible in `mem` as a bare `hack (fn)` line on a read-only script,
  which is the tell). **Rule:** keep pure helpers in a pure/cheap module (`common.js`) rather than
  importing them out of `ns`-heavy ones; when a script's `mem` breakdown lists a function its own
  source never mentions, suspect an import, not a bug in your code.

## Driving the live game (CDP)

Claude can reach **inside the running game** — not just push files to it. The Steam/Electron
build exposes the Chrome DevTools Protocol on `--remote-debugging-port=9222` (set as a Steam
launch option: `%command% --remote-debugging-port=9222`), and `tools/bb/` attaches over CDP to
**read and drive the rendered UI like a human**: read the terminal / menus / tail windows,
take screenshots, run terminal commands, click, type. This is **UI automation of the
front-end**, distinct from the RFA file bridge (which only moves files) — see
`docs/game-bridge.md` and `tools/bb/README.md`. It needs no engine changes.

- **How to use it:** `node tools/bb/cli.mjs <cmd>` — reads (`stats`, `read-terminal`,
  `read-tail`, `aria`, `body`, `locations`, `shot`) and writes that drive the live session
  (`terminal`, `goto`, `location`, `restart`, `close-tail`). Full verb list + args in
  `tools/bb/README.md`; `driver.mjs` holds the reusable helpers, `cli.mjs` is a thin dispatch.
  Selector rule of thumb: reach elements by accessible attribute (role/name, or `aria-label`
  for City-map glyphs), not screenshot coordinates.
- **Requires:** the game running **and** launched with the debug flag (the port is only open
  while the game runs). If `curl http://localhost:9222/json/version` fails, the capability is
  unavailable — say so, don't guess.
- **Read-only by default.** `read-*` / `stats` / `aria` / `locations` / `shot` are safe.
  `terminal`, `goto`, and `location` **drive the live session** (navigate / type), moving the
  player off their screen — use writes deliberately.
- **`run`ning a script needs to be on `home`.** The terminal's connected server is wherever
  the player/daemon last left it (often `darkweb` or a target) — a `run foo.js` there fails with
  "does not exist on &lt;host&gt;". Before running a check script, either send `home` first, or
  read the prompt (`read-terminal` / the `[host /]>` prefix) to confirm you're already home. Home
  can also be RAM-saturated by the daemon — if a `run` fails on RAM, that's a separate problem
  (free RAM / run elsewhere), not a wrong-server problem.
- **A script can fail *after* it starts, via an error popup the terminal doesn't show.** `run foo.js`
  printing "Running script..." only means it launched — a runtime exception surfaces as an in-game
  **RUNTIME ERROR modal**, not terminal text, so a `read-terminal` that looks fine can be hiding a
  crash. If a script doesn't produce its expected output (no log file, missing tprint lines), check
  the game for an error popup (`shot` / `aria`, or ask Kenneth) before assuming it worked or
  re-running blindly.
- **`cat <file>.txt` opens a blocking modal viewer, not terminal text** — so a `read-terminal`
  after a `cat` shows the file content *nowhere* (it renders in a popup the terminal capture can't
  see) and, worse, the modal blocks subsequent clicks/commands until dismissed (`cli.mjs dismiss`).
  Don't `cat` a file to verify its contents over CDP — it looks empty and wedges the UI. To read a
  synced file, read the repo copy (or its `dist/` mirror) directly; to confirm what actually
  reached the game, have a script `ns.read` it and `tprint`, or take a `shot`.
- **Installing augmentations throws a blocking popup that must be dismissed.** After an install
  fires (`installer.js`, or a manual `installAugmentations`), the game overlays a popup that swallows
  clicks until cleared — the same shape as a story popup, so `cli.mjs dismiss` clears it. Do it
  before any further CDP drive (a `read-terminal`/`goto` afterward will otherwise time out on the
  intercepted click). The install itself still succeeds regardless — confirm via the `ratchetlog`
  install line / a fresh `auginfo.js`, not the popup.

### Story popups — Claude clears them, no permission needed

A narrative toast (faction-recruit text, "Message received" notifications, lore interludes)
periodically overlays the whole UI and swallows every click until cleared — it has no named
"Close" button, so `dismissModal` doesn't catch it; Kenneth normally clears it by clicking
anywhere on it. **Claude clears these itself** via `node tools/bb/cli.mjs dismiss` (or
automatically — `goto`/`terminal`/`restart` call `dismissStoryPopup` before navigating, per
`tools/bb/driver.mjs`) — don't ask Kenneth to do it. Pre-authorized because the detector is
narrowly guarded, not a blind click: it only fires when the *entire* accessible tree is exactly
one nameless button plus narrative text and nothing else. A real confirm/buy/install dialog
always exposes multiple/named controls, and a normal game screen always has named nav buttons —
neither ever collapses to that shape, so the guard can't misfire onto a consequential action
(buying/installing/joining still requires the general confirmation rule below). If `dismiss`
reports "no modal/popup found" and a click still times out, that's a different, unhandled
overlay — stop and ask, don't guess at a wider click.

### Auto-restart changed scripts — no permission needed

When Claude edits a `src/` script and the change only takes effect after the in-game script is
restarted, **Claude restarts it automatically over the CDP terminal — without asking.** This
is pre-authorized; don't checkpoint for it.

- **Companion scripts** (`exec`'d by `daemon.js` — e.g. `cloudmanager.js`, `purchasescripts.js`):
  `node tools/bb/cli.mjs restart <script>` — kills it, closes any orphaned tail, then relaunches.
  As of Phase 24 every companion is headless (nothing to re-dock — `dashboard.js` is the only
  standing tail, and it self-closes its own tail via `ns.atExit` on every death the game runs
  callbacks for); this command still matters for the close-orphan step on scripts that can leave a
  tail behind — the short-lived self-tailers (`bootstrap.js`, `procureprograms.js`,
  `launchmonitor.js`) and headless residents whose prior/crashed instance may have orphaned one
  (`backdoorfactions.js`, `procureformulas.js` — both headless as of Phase 24, they never open a
  tail themselves). Prefer this over a raw `kill; run` for exactly that reason.
- **Core loop / imported libraries** (`daemon.js`, `scheduler.js`, `sampling.js`, `targets.js`,
  `hosts.js`, …): `node tools/bb/cli.mjs restart daemon.js` — same clean kill/close/relaunch; the
  daemon re-execs the loop on startup (it takes no launch args). Don't hand-restart the batcher's
  `hack`/`grow`/`weaken` workers — the daemon manages those.
- **Sequencing:** the edit must sync to the game first (viteburner push — the dev server must
  be running/connected), *then* restart. viteburner polls fast, so it's usually immediate; if a
  restart loads stale behavior, the push hadn't landed — restart again.

## Tracking work
Check `BACKLOG.md` before starting; keep it current (In Progress / Next Up / Ideas). On
completion, move a dated, condensed entry to `docs/phases/CHANGELOG.md` — keep history out
of BACKLOG. **Update as part of the work, not after** — stage the BACKLOG/CHANGELOG edit in
the same commit as the change it describes, so it doesn't become a separate git cycle.

**Keep the engine reference docs current *without being asked*.** The gated references —
[`docs/gang-engine.md`](docs/gang-engine.md), [`docs/batcher-engine.md`](docs/batcher-engine.md),
[`docs/stock-engine.md`](docs/stock-engine.md), and (added 2026-07-29)
[`docs/bladeburner-reference.md`](docs/bladeburner-reference.md) +
[`docs/bn6-playbook.md`](docs/bn6-playbook.md) — are the durable homes for each subsystem's
architecture, strategy, and open questions, and the thing future sessions read to answer "what's
the plan / was this already tried." The Bladeburner pair is deliberately **split** where the others
are fused: `bladeburner-reference.md` is the immutable interface (should rarely change),
`bn6-playbook.md` is the churning strategy — so keep edits in the right one rather than merging them. When a feature or bug changes what one of them asserts — a
number that was an inference and is now measured, an open question that got answered, a target that
got superseded, a new landmine worth warning the next session about — **take the initiative to
update the affected doc in the same commit**, the same way BACKLOG/CHANGELOG get staged with the
change. Don't wait to be prompted, and don't assume "it's in the CHANGELOG" is enough — the
CHANGELOG records *that* something shipped; these docs carry the *current* state of the plan.
(Concrete miss, 2026-07-23: `gang-engine.md`'s BN2 clear-plan section was stale on four fronts at
once — the WD gate still called "an inference" after it read live at 15,000, the
"does rep survive an install" question still open after it was answered *no*, the M-bar still
"35–37" after it was re-derived to 45, and an `endgameHold` freeze that had deadlocked the ratchet
unmentioned — none caught until Kenneth asked whether it had been captured.)

## Communication
- **Summarize after acting.**
- **Flag unplanned deviations** (extra changes, moved/deleted files, scope creep, a
  different approach) — don't fold them in silently.

## Worktrees
`bitburner-scripts2` (sibling folder, branch `worktree-docs`) is a second worktree for
brainstorming, `BACKLOG.md`/docs edits, and phase-doc drafting — work there when you want to
touch documentation without risking the live checkout. It has no dev server of its own; it
must never start or stop `npm run dev` (see the engineering-conventions rule above).

**Merge `worktree-docs` back to `master` at the end of any session that committed to it** —
not the vague "when the docs work is ready," which never fires. Leaving commits on the branch
across sessions is how they orphan (three doc commits sat stranded off `master` until a manual
sweep found them, 2026-07-12). The live worktree (`bitburner-scripts`) performs the merge, on a
**clean** working tree, since `master` is only ever checked out there.

**Catch orphaned worktree commits early.** At session start (either worktree), run
`git log --oneline master..worktree-docs`. Any output is docs work stranded off `master` — merge
it back before it accumulates. This is the net that stops commits piling up unnoticed between
sessions; run it rather than assuming the branches are level.

**Sync from `master` before touching anything phase work might have changed.** Phase work
(fixes, close-outs) lands directly on `master` in the main worktree — `worktree-docs` never sees
it automatically, only via merge. Before reading or editing `BACKLOG.md` or any doc that phase
work might touch, run `git merge master` in this worktree first — not just once at session start,
since phase work can land on `master` mid-session too. Use `git merge`, **not `git fetch`**: the
worktrees share one local `.git`, so `master`'s ref is already current here — there is nothing to
fetch, and fetch only downloads commits, it never updates your working files (the stale thing).
Merge is what rewrites the files you're about to read. This worktree normally carries no commits
of its own that `master` doesn't already have, so it's a clean fast-forward, not a real merge.
Skipping this risks brainstorming/planning against stale state — e.g. re-flagging a bug that
already shipped a fix.

**This checkout (`bitburner-scripts`) needs the same check in reverse.** Worktrees share one
`.git` object database and branch refs, but not working-tree state — a commit `worktree-docs`
makes straight to `master` (valid whenever `master` isn't checked out here, e.g. mid-phase-branch
work) updates this checkout's `master` ref immediately, yet stays invisible until `master` is
actually checked out again. Before merging a finished phase branch back to `master`, run
`git log master` (or `git log HEAD..master` from the branch) to check for anything that landed
there from `worktree-docs` since the branch was cut — a normal `git merge` folds it in safely
either way, this is just so a docs-only commit from the other worktree doesn't go unnoticed.

## Git
Use version control: branch off `master`, commit, and merge your own work in interactive
sessions — no need to ask.
- **Ship gate:** a change with nothing to validate (docs, comments, text) can be
  committed/pushed/merged freely. A change whose spec/request carries a testable requirement
  (`npm test`, a RAM gate, `npm run verify:log`, a live run) ships only after that validation
  passes — then no further sign-off is needed. RAM/log/live checks depend on Kenneth's in-game
  run, so those changes wait on his validation; `npm test` I can run and clear myself.
- **Safety rail:** background/autonomous job sessions can't push or merge to `master` (enforced by
  execution mode) — prep the branch/PR and let Kenneth merge.

## Off-limits & sources
- Allowed sources: local game files, API docs in `markdown/` (**check first**), the
  official Bitburner GitHub repo.
- **Don't read game source to shortcut the puzzle** — docs/API fine, source-diving not.
- **Don't skip ahead or spoil progression** — help only with what's currently unlocked.
  **Carve-out:** static numbers/tables (costs, RAM, prices) are fine to look up.

## Task-specific detail
See `docs/INDEX.md` for on-demand references (logging patterns, dev-server / Remote API).
**All things batcher engine — `daemon.js`/`scheduler.js`/`targets.js`/`hosts.js`/`sampling.js`
architecture, lifecycle behavior across installs, strategy across BitNodes, open tripwires — live
in [`docs/batcher-engine.md`](docs/batcher-engine.md).** Read it before designing or recommending
anything batcher-related, the same way `docs/gang-engine.md` gates gang-related work.

**All things Bladeburner — the API surface/semantics/gotchas and what's still unmeasured live in
[`docs/bladeburner-reference.md`](docs/bladeburner-reference.md); the BN6 win-path decision, staged
plan, and open questions live in [`docs/bn6-playbook.md`](docs/bn6-playbook.md).** Read the
reference before writing any `ns.bladeburner` code (the whole API throws pre-join, and two
RAM-analyzer footguns are recorded there), and the playbook before proposing anything about how BN6
gets cleared.

**Check the script library before hand-doing a task or writing a one-off.** `docs/scripts.md`
indexes every `src/` script. A network/scan/**path**/aug/rep/backdoor task, or anything that
smells like a one-off, almost certainly has a script already — reach for it first. (Concrete
miss this exists to prevent: hand-walking a `connect` chain to `w0r1d_d43m0n` when `connect.js`
prints the path.)

**Owned augs + aggregate mults (no Singularity)** — `run auginfo.js` dumps the current owned-
augmentation stack (incl. NeuroFlux Governor level) and the aggregate player multipliers to a
timestamped `logs/auginfo-<epoch>.json` (+ a terminal summary). Reads `ns.getResetInfo().ownedAugs`
and `ns.getPlayer().mults` — both base-cost, no SF4 needed. `mults.hacking` is the level-mult /
`mults.hacking_exp` the exp-mult the Daedalus-2500 plan tracks. One file per run, so run it
before and after an install to diff.

**Aug SHOP lookup (SF4/Singularity)** — `run augcheck.js "Aug Name"` or `run augcheck.js faction
"Faction Name"` dumps the shop side `auginfo.js` can't see: rep requirement, price/base price,
selling factions, prereq chain, and stat mults, to `logs/augcheck-<epoch>.txt` + a terminal
summary. Use this instead of re-writing a throwaway Singularity query (or reading the in-game UI)
whenever you need aug prices/reqs. **Caveat:** `getAugmentationStats` returns numeric mults only —
pure-utility augs (focus-penalty removal, etc.) read all `1.0`, so non-mult effects need the
in-game aug description, not this. (Runs on `home`; Singularity RAM at SF4.3 is 1×.)

**Post-reset / augment-install recovery** — the faction-unlock sequence (backdoor→faction server
map, Daedalus/Netburners gates, and the **auto-unlock-not-auto-join** rule) is kept in
`docs/reset-protocol.md`. Read it before any faction-unlock or post-reset bootstrap work.

**Faction reputation, favor & donation** — the active BN1 lever (Daedalus 2.5m rep → The Red
Pill): how rep is earned (manual faction work + `ns.share()`), and the **donation shortcut**
(150 favor ≈ 462.5k rep + an install → then ~$1.5t buys the full 2.5m rep). Measured numbers +
sequencing catch in `docs/reputation-favor.md`. Read before any rep-grind or install-timing plan.

**Augmentation grafting** — `docs/grafting.md`. Grafting applies aug effects without a reset but
carries a compounding Entropy tax; the API needs SF10 (Kenneth has no Source-Files → manual UI
only), and it was **observed NOT available** at VitaLife/New Tokyo in this build's BN1
(2026-07-11, unlock condition unconfirmed). Read before proposing any grafting-based plan — the
short version is it doesn't help the BN1 finish.

**In-game settings state** — `docs/user-settings.md` is the single source of truth for the
non-default game **Options** toggles Kenneth has changed *that alter what Claude should expect
or do* (e.g. **Suppress Messages**, which makes story `.msg` arrive silently — no popup/terminal
line — though the file still lands on `home`). That file, not this line, holds the current
on/off state — read it before assuming a popup will fire or telling Kenneth to "watch for" an
in-game notification, since a suppressed event has to be *polled* for, not waited on.

**Docs layout:** `docs/` — Bitburner project/task references · `docs/metareference/` —
non-Bitburner learning material (Claude Code / AI-workflow docs) · `docs/phases/` — archived
shipped phase docs (index: `CHANGELOG.md`).
