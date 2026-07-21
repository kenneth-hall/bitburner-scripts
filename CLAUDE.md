# Purpose

Learning exercise, not a normal project: help the user **learn Claude Code** —
prompting, workflow, effective use — with **Bitburner** as the sandbox. Implement
what's asked (not hints-only). **Proactively coach** on Claude Code usage/prompting
as an ongoing relationship. Don't cheat by reading/adapting other players' Bitburner
solutions — work from game mechanics and the API.

## Working with Kenneth (read at session start)
Act as a collaborator who pushes back, not a service that complies. These fire on triggers, not
on request — hold to them even when the moment is uncomfortable.
- **Current goal (keep this line current):** **IN BN2.1 as of 2026-07-18** (BN1.3 cleared the
  same day — `w0r1d_d43m0n` backdoored, confirmed via BitVerse screenshot `bb-shot.png`; close-out
  with two surfaced design gaps: `docs/phases/phase-26-ratchet-autonomy.closeout.md`).
  - **✅ DECIDED 2026-07-19 — COMMITTED TO BN2, hacking gang via NiteSec.** The gang exists
    (`isHacking: true`, fixed permanently). Everything below this bullet is the *history* of that
    decision, kept because the measured numbers still bound the plan — it is no longer open.
    Kenneth's closing argument, which is the reusable part: **a BitNode restart is cheap when the
    node holds no progress**, so "permanent" was mispriced as a blocker. In-node permanence is
    bounded by restart cost, not infinite. Deciding wrong and restarting beats deliberating for
    five more sessions.
    - **✅ Phase 27 Tier 1 SHIPPED 2026-07-20 — gang manager (recruit + task-assign) is live.**
      `gangmanager.js` runs as a home-resident daemon companion; a live bug (wanted-sink baseline
      froze at tick zero) was found and fixed same session. Full record:
      `docs/phases/phase-27-gang.closeout.md`.
    - **✅ Phase 29 (Tiers 2-3: equipment + ascension + 8-rung ladder re-open) SHIPPED
      2026-07-20 — merged to `master`, live-deployed over CDP.** RAM gate measured 24.8 GB
      (band ≤28.0). Initial live behavior confirmed within ~90s of restart: rootkits auto-bought
      with matching transaction records, five members promoted off the sink, `netWantedRate`
      staying negative. Spec (graduated): `docs/phases/phase-29-gang-scaling.spec.md`.
      **✅ Observation window CLOSED EARLY 2026-07-21 (day 1 of 7).** Goal metric
      `respectGainRate >= 1.27/tick` was overshot **~425×** (live 539.6), plus 19h of clean
      autonomous soak — sustainability was no longer a live question, so the window was retired
      by decision with Kenneth rather than run to ~2026-07-27. Rationale logged in the spec's
      Close-out. **`gangmanager.js` is UNFROZEN** — edits no longer confound a measurement.
      **Carried gap:** no persisted `respectGainRate` series exists (`gang-state.json` is
      overwritten each tick) — a periodic sampler is a required input to any Tier 4 rate/decay
      reasoning; see `BACKLOG.md`'s "Gang manager Tier 4" entry. Tier 4 (territory) is now clear
      to brainstorm.
  - *(historical — the decision above closed this)* **commit to BN2 or abort?** BN2 was locked for its gang engine (SF2 kills the
    recurring Daedalus rep tax); same-day in-node analysis then found its `w0r1d_d43m0n` gate is
    **15,000** (Difficulty 500%) — realistically needing hacking mult **M ≈ 30–35** against our
    demonstrated **10.077**, ~2× BN4's ask. Grinding can't substitute (level is logarithmic in
    XP). **BN5's requirement (M ≈ 9.73) we have already exceeded.**
    - **Verdict after an independent fable review: "plausible but unverified, ~60–70%, 4–10
      weeks"** — *not* "unreachable," which an earlier pass here overstated on two counts (a stale
      9.16 multiplier, and treating our BN1 aug catalog as a ceiling when it was a ratchet
      stopping point at M≈6.5; the untouched megacorp tier is worth ~×5 more).
    - **Two cheap checks settle it, in this order:** (1) run `augcheck.js faction "<gang faction>"`
      — that one file answers whether the catalog reaches ~25-before-NFG; (2) read
      `getServerRequiredHackingLevel("w0r1d_d43m0n")` the moment Red Pill installs — the 15,000
      figure is an *inference* (~85% confidence), unreadable until then.
      - **Correction 2026-07-19:** check (1) previously read "*once in the gang faction*" — that
        precondition is **false**, verified live. `singularity.getAugmentationsFromFaction` does
        **not** require membership; `augcheck.js faction "NiteSec"` returned the full catalog with
        zero factions joined and no gang created. The check is available *now*, with nothing
        irreversible spent, which makes the whole BN2 decision cheaper than it has been priced.
        (It needs 29.10 GB, so it won't fit a crowded 32 GB home — run it from a fleet server.)
      - **…and check (1) was aimed at the wrong factions.** Measured 2026-07-19 via the new
        `src/gangaugs.js` catalog sweep (read-only, pre-gang): the union of all five *pure-criminal*
        gang factions (Slum Snakes / Tetrads / Speakers / Dark Army / Syndicate) is **hacking
        ×1.061** across 33 augs — they share one hacking aug between them. NiteSec ×1.515 and
        The Black Hand ×1.511 are the only gang-capable factions with real hacking catalogs, and
        **both are reachable without a gang.** So a gang buys ~**+6%** M that nothing else offers.
        The catalog was never going to reach ~25 from gang factions.
      - **The real ceiling, measured the same way:** union of the 17 non-gang factions
        (megacorps + BitRunners + endgame) = **hacking ×23.121** across 69 distinct augs, NFG
        counted once. Against a demonstrated 10.077 and a needed ~30–35, that puts the target
        inside reach *only* with a substantial NFG tail on top (~×1.3–1.5, i.e. ~26–38 levels)
        **and** with essentially the whole catalog bought — whose union price is dominated by
        Illuminati at ~$25t. **This reframes the gang's role: its value to BN2 is the money/rep
        engine that makes that catalog affordable, not the augs it sells.** Raw sweep output:
        `logs/gangaugs-*.json` (in-game FS; `scp … home` to sync).
      - **⚠️ CORRECTION 2026-07-21 — the two bullets above are OBSOLETE; they rest on a *pre-gang*
        catalog read.** Verified against the post-`createGang` sweep
        (`logs/gangaugs-1784565947624.json`, checked against the raw JSON): **NiteSec — our own gang
        faction — now sells 98 augs at hacking ×22.89**, `maxRepReq` 2.5m, **including The Red Pill
        (free) and QLink.** The vanilla "your gang faction sells nearly the whole catalog" mechanic
        is live in this fork; the pre-gang ×1.515 reading no longer applies. Confirmed real, not a
        phantom read — `augfarmer.js` is live-buying from it (7 augs this cycle). Consequences:
        - "The catalog was never going to reach ~25 from gang factions" is **false** — NiteSec alone
          carries ×22.89 (÷1.75 QLink = ×13.08 for everything else).
        - "$25t across 17 factions, gang = money engine not aug source" is **false** — it's ONE
          faction, ONE rep track, and rep is **saturated** (2.5m max req vs ~18.3m banked respect,
          rate 425× over goal). The exact lever BN2's nerfs attack (rep) is a non-issue.
        - **Corrected bar — money is the only open resource:** core catalog (all but QLink) =
          **$149b → M≈16.7** (with SF1.3 ×1.28) + a ~50–65-level NFG tail; OR add **QLink ($25t) →
          M≈29** with a short tail. The batcher dominates the money curve; gang *type* is immaterial
          to the win (a combat gang gets the identical expansion). **So BN2.1 is now assessed CLEARLY
          REACHABLE (~3–6 weeks), not "plausible ~60–70%"** — the two scary unknowns (rep grind,
          catalog access) are both retired. Full analysis: `docs/bn2-gang-type-analysis.md`
          (fable, cold-context, 2026-07-21). Standing checkpoint still open: read
          `getServerRequiredHackingLevel("w0r1d_d43m0n")` the moment Red Pill installs to confirm
          the 15,000 gate inference.
    - Full arithmetic: `docs/bitnodes.md` → BN2 clearing notes (⚠️ also predates the 2026-07-21
      correction above — its $25t/17-faction framing is superseded by the single-faction picture).
  - *(historical — superseded by the ✅ Phase 27 Tier 1 SHIPPED bullet above)* an early Phase 27
    draft ("gang observer") was blocked on the gang API being entirely inert pre-`createGang()`;
    once the gang existed that blocker dissolved, and Tier 1 shipped from a from-scratch spec that
    read the full API surface first (`docs/gang-api.md`) — see "Read the whole interface before
    designing against it" below for why the observer framing itself was wrong, not just blocked.
  - **How it cleared — Phase 26 (A2 gate-release arming + B2 stall detection + B1 companion
    supervisor) shipped and live-validated 2026-07-18**, closing the 29/30 aug-count deadlock A1's
    runaway had uncovered (`docs/phases/phase-26-ratchet-autonomy.spec.md`). The gate-release fire
    (install #10) needed no manual help; two further installs did (#11 to bank Daedalus favor
    early, #12 to activate the already-bought Red Pill) — both are recorded as open automation
    gaps in the close-out, not fixed in-flight, since fixing them is real design surface, not a
    patch.
  - **NEXT ACTION: decide what comes after BN1.3.** Nothing is scheduled — this needs an actual
    conversation with Kenneth, not an assumption either way.
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
  - **[Reopened 2026-07-18 — was superseded, now a live candidate again, still not decided]** The
    pre-1.3 plan was to **stop at 1.2** and make **BN5** the next *extending* node — reasoning: 1.2→1.3
    is only +4pp for another entire endgame (poor ROI at full manual rep-tax); BN5 re-priced by cold
    review as a 2–3-install mult grind, least-bad under a "no new engine" constraint; BN10 deferred
    (×0.35 hacking-level wall needs in-node Grafting); BN4 + economy-nerfed nodes deferred until a
    second engine exists. That reasoning was written pre-1.3-clear and hasn't been re-checked
    against what Phase 26 now proves (unattended clears are cheaper than assumed) — worth
    revisiting, not assuming still holds. Full prior reasoning + all 15 nodes' multiplier tables
    lives in `docs/bitnodes.md` → "Our next-node plan (mature batcher)" and in git history.
  - **In parallel:** (a) **Phase 20 XP-farm engine shipped 2026-07-13** (`docs/phases/phase-20-xpfarm.spec.md`)
    — hack-saturation of surplus fleet RAM, S7 ON/OFF A/B gate measured 5.15× exp/sec; (b) **prototype
    a second engine** — only **IPvGO** (`ns.go` / CIA Sector-12) or **darknet** (DarkscapeNavigator +
    TOR) are buildable now; gang/corp/bladeburner/sleeves are node-locked.
  - **Open strategic Q (surfaced by cold review, not yet decided):** our "no new engine" constraint
    excludes all three rep-tax killers (gang/sleeves/darknet), so we accept paying the full Daedalus
    tax every clear. Gang (BN2) is a *small* script and the game's designed answer — worth
    reconsidering once the tax bites across multiple clears.
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
files (see `docs/gang-api.md`, which that read produced). Cost of skipping it: most of a session.

Corollary: **documented RAM cost tells you nothing about preconditions.** `getTaskNames` and
`getEquipmentNames` are 0 GB and still throw without a gang. Verify availability empirically with
a read-only probe before assuming a call is usable.

**Building a read-only probe or check to collect data is pre-authorized — don't ask, just build it.**
This covers both a throwaway probe you write *and* running an existing check script (`augcheck.js`,
`auginfo.js`, `ramcheck.js`, and the like). If the next useful step is "write a throwaway script to
read game state and get the actual numbers," or "run the check script that already reads them," the
answer is always yes. Go down that side path *before* finishing the prompt response — a measured
number beats a hedged answer, and probing is exactly how the "read the interface first" rule gets
enforced. **Fence: ≤10 min of work**, and **read-only only** — touches nothing in the Gang API's
action group (or any other mutating/irreversible call). A probe or check that would *change* game
state, even reversibly (a temporary task reassignment, a test purchase), is not covered here and
still gets flagged first. Log the output to a file per the one-off-scripts convention; don't make Kenneth
paste results back.

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
