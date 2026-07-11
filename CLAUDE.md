# Purpose

Learning exercise, not a normal project: help the user **learn Claude Code** —
prompting, workflow, effective use — with **Bitburner** as the sandbox. Implement
what's asked (not hints-only). **Proactively coach** on Claude Code usage/prompting
as an ongoing relationship. Don't cheat by reading/adapting other players' Bitburner
solutions — work from game mechanics and the API.

## Working with Kenneth (read at session start)
Act as a collaborator who pushes back, not a service that complies. These fire on triggers, not
on request — hold to them even when the moment is uncomfortable.
- **Current goal (keep this line current):** finish BitNode 1. **Install #1 is done; money is rebuilt
  (~$2.0t); the live gate is a hacking re-climb to 2500 to REJOIN Daedalus.** Installing augs removes
  you from every faction (membership, not just rep — verified live 2026-07-11: "You have not yet joined
  any Factions"), so donation is *not* accessible until you re-climb hacking to 2500, accept the
  Daedalus re-invite, and rejoin (favor ~160 persists, so donation unlocks the instant you rejoin;
  30-augs/$100b gates still ✅). Currently ~1,985/2500, ~6–9 h at mult 4.72. Then: donate → 2.5m rep →
  buy 3 ENM augs + NFG + Red Pill → install #2 → re-climb to 3000 → backdoor `w0r1d_d43m0n`. Remaining
  gates: (1) 2500 re-climb + rejoin + 2.5m rep for The Red Pill, and (2) the 3000 re-climb to backdoor
  it after install #2. **Both reset mechanics (money→$1k, membership→must re-earn invite) are locked in
  `docs/reset-protocol.md`'s persistence table + gotchas callout — read it before any install-timing
  plan.** **Recommended path for (1) — don't hand-grind 2.5m:** grind ~500k Daedalus rep now,
  while hacking is high (share ON, measured **35.9 rep/sec**, ~3.5 h), bank 150 favor via the planned
  multiplier install, then **donate ~$1.5t for the rest** (`docs/reputation-favor.md`). The Red Pill
  needs its **own** install, so keep the mult-install and Red-Pill-install **back-to-back** to pay for
  only ONE hacking re-climb. All levers are manual UI (no Singularity) except **`ns.share()`**, an
  *already-built* daemon capability — no goal-specific daemon mode needed or wanted. Gate (2) target:
  `w0r1d_d43m0n` needs hacking **3000** (standard BN1 value = `3000 × WorldDaemonDifficulty` at mult
  1.0; server isn't queryable until Red Pill spawns it, so live-unconfirmable until then) — only ~14%
  above the current ~2,626, so the post-install re-climb is "restore position + a bit," not a new wall.
  **Aug inventory resolved (2026-07-11):** all unowned augs are in **Daedalus** (every other faction,
  joined or joinable, reads "No Augmentations left") — the 3 Embedded Netburner Module hacking-mult
  upgrades (Analyze Engine 625k rep, DMA 1.0m, Core V3 1.75m; ~$74b total), unlimited NeuroFlux levels,
  and The Red Pill (2.5m). So a mult install **is** justified.
  **⚠️ MONEY RESETS ON INSTALL (~$1k) — corrected 2026-07-11 after install #1.** Installing augs wipes
  money as well as hacking + fleet, so the accumulated pile (was $1.7q) is NOT donatable — the install
  that unlocks donation also wipes it. **Donation is funded by money earned AFTER install #1**, which
  makes it a rebuild-then-earn wait, not the instant step earlier drafts claimed. **⚠️ AND INSTALL
  REMOVES YOU FROM EVERY FACTION** (membership, not just rep — verified live after install #1: "You have
  not yet joined any Factions"), so donating needs you back *in* Daedalus, which needs the hacking-2500
  invite gate again. **Status (2026-07-11 ~2:27 PM):** install #1 done (banked ~160 favor); money
  **rebuilt (~$2.0t) — done**; **NOT in Daedalus**; hacking ~1,985 re-climbing toward **2500 to rejoin**
  (~6–9 h at mult 4.72). **Remaining:** re-climb 2500 → accept Daedalus re-invite + join → donate → 2.5m
  rep → buy 3 ENM augs + NFG-to-money-cap + Red Pill → install #2 (drops Daedalus again, but its augs are
  bought) → rebuild + re-climb to 3000 → `backdoor`. Donation **VERIFIED live** (Daedalus page: "Unlock
  donations at 150.000 favor"); at ~160 favor the rate is cheaper than the favor-0 $1.47t estimate
  (~$0.5–1.5t) — read the Donate UI, don't assume.
  **Raising mult is essential, not optional:** the exp curve is exponential in (level/mult), so
  re-climbing 2,627→3000 at the current mult 4.72 needs ~218B exp (infeasible, ~12× lifetime XP — the
  same log wall as 2500). BUT NFG stacking is **money-capped, not rep-capped**: the ~1.9×/aug price
  escalation (verified: "Price multiplier x3.610" = 1.9²) caps NFG at ~17–18 levels/install even with
  $1.13q, so realistic post-install mult is **~6–7 (not ~10)** → re-climb ~30 min–few hours, sensitive
  around mult 6. **Sideline risk:** if one install's mult lands < ~5.5–6, reaching 3000 is impractical
  and — all non-NFG augs exhausted — NFG-across-multiple-installs is the only lever left (recoverable,
  but multi-cycle). Exact NFG/ENM per-level effects assumed from stock; tune live when buying (no SF4 to
  script-read). Grafting ruled out (`docs/grafting.md`).
- **Before agreeing with a plan, lead with its strongest objection and what it costs** — not just the
  upside. Frictionless agreement is a cue to poke harder, not to proceed.
- **Before building tooling/polish, check it against the goal.** If it doesn't advance the goal, say
  so and name the cost — don't build it just because it was asked or because it's interesting.
- **Raise problems Kenneth didn't ask about, and disagree when you disagree.** Treat his praise-worthy
  work as a peer's draft to critique, not a product to accept.

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

### Auto-restart changed scripts — no permission needed

When Claude edits a `src/` script and the change only takes effect after the in-game script is
restarted, **Claude restarts it automatically over the CDP terminal — without asking.** This
is pre-authorized; don't checkpoint for it.

- **Companion scripts** (`exec`'d by `daemon.js` — e.g. `cloudmanager.js`, `purchasescripts.js`):
  `node tools/bb/cli.mjs restart <script>` — kills it, **closes the orphaned tail window**
  (Bitburner leaves a killed script's tail open, reverting its title to the filename), then
  relaunches; `tailmanager.js` re-docks the fresh window so the screen doesn't accumulate stray
  popups. Prefer this over a raw `kill; run` for exactly that reason.
- **Core loop / imported libraries** (`daemon.js`, `scheduler.js`, `sampling.js`, `targets.js`,
  `hosts.js`, …): `node tools/bb/cli.mjs restart daemon.js` — same clean kill/close/relaunch; the
  daemon re-execs the loop on startup (it takes no launch args). Don't hand-restart the batcher's
  `hack`/`grow`/`weaken` workers — the daemon manages those.
- **Sequencing:** the edit must sync to the game first (viteburner push — the dev server must
  be running/connected), *then* restart. viteburner polls fast, so it's usually immediate; if a
  restart loads stale behavior, the push hadn't landed — restart again.

**Scope:** this blanket authorization covers **restarting scripts Claude just changed**, nothing
more. Other consequential in-game writes — buying augmentations, donating/spending money,
installing augmentations, joining factions, anything that alters game progression — still
require confirmation per the general "confirm outward-facing actions" rule.

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
must never start or stop `npm run dev` (see the engineering-conventions rule above). Merge its
branch back to `master` like any other worktree when the docs work is ready.

**Sync from `master` before touching anything phase work might have changed.** Phase work
(fixes, close-outs) lands directly on `master` in the main worktree — `worktree-docs` never sees
it automatically, only via merge. Before reading or editing `BACKLOG.md` or any doc that phase
work might touch, run `git merge master` in this worktree first — not just once at session start,
since phase work can land on `master` mid-session too. This worktree normally carries no commits
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

**Owned augs + aggregate mults (no Singularity)** — `run auginfo.js` dumps the current owned-
augmentation stack (incl. NeuroFlux Governor level) and the aggregate player multipliers to a
timestamped `logs/auginfo-<epoch>.json` (+ a terminal summary). Reads `ns.getResetInfo().ownedAugs`
and `ns.getPlayer().mults` — both base-cost, no SF4 needed. `mults.hacking` is the level-mult /
`mults.hacking_exp` the exp-mult the Daedalus-2500 plan tracks. One file per run, so run it
before and after an install to diff. The aug **shop** (prices/rep/what's for sale) is Singularity-
gated and NOT covered — read that from the in-game UI / CDP driver.

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

**Docs layout:** `docs/` — Bitburner project/task references · `docs/metareference/` —
non-Bitburner learning material (Claude Code / AI-workflow docs) · `docs/phases/` — archived
shipped phase docs (index: `CHANGELOG.md`).
