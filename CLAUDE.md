# Purpose

Learning exercise, not a normal project: help the user **learn Claude Code** —
prompting, workflow, effective use — with **Bitburner** as the sandbox. Implement
what's asked (not hints-only). **Proactively coach** on Claude Code usage/prompting
as an ongoing relationship. Don't cheat by reading/adapting other players' Bitburner
solutions — work from game mechanics and the API.

## Working with Kenneth (read at session start)
Act as a collaborator who pushes back, not a service that complies. These fire on triggers, not
on request — hold to them even when the moment is uncomfortable.
- **Current goal (keep this line current):** **re-enter BN1 and clear it once more to reach
  Source-File 1.2** (+8pp to *every* multiplier — the guide's "8 NFG levels" — a permanent, broad,
  cheapest-possible bank). BN1 is already **DONE once** (Red Pill installed, `w0r1d_d43m0n`
  backdoored → earned SF1.1); we have **re-entered BN1 and are early game in the 1.2 run** (as of
  2026-07-12 — no longer on the BitVerse selection screen). This
  is the locked near-term goal (decided 2026-07-11). The clear is *low difficulty* (WD 3,000, full
  economy, known playbook) but **not low effort** — favor/rep/augs don't persist across destroying a
  node (only Source-Files, scripts, Intelligence do), so it re-pays the full **Daedalus 2.5m-rep →
  Red Pill → backdoor WD** endgame. Full plan + all 15 nodes' multiplier tables + reasoning:
  **`docs/bitnodes.md` → "Our next-node plan (mature batcher)"** (read before any node choice).
  - **Why 1.2 and stop there (not 1.3):** 1.2→1.3 is only +4pp for another *entire* endgame — poor
    ROI at our full manual rep-tax. Revisit 1.3+ only after a rep-tax-killer (Sleeves/gang) makes
    re-farming BN1 cheap.
  - **After 1.2 — the next *extending* node is BN5** (re-priced by cold review: a **2–3 install
    mult grind**, not a quick clear — its 4,500 gate is a multiplier problem and its 200%-aug-cost /
    15%-steal economy throttles the mult lever; picked as the least-bad option under our "no new
    engine / no rough penalty" constraints, *despite* its overrated tooling). **BN10 deferred** (its
    ×0.35 hacking-level wall needs in-node Grafting). **BN4 + economy-nerfed nodes deferred** until a
    second engine exists.
  - **In parallel:** (a) **streamline batcher throughput** — the Phase 20 XP-farm resume trigger (a
    fresh node's XP re-climb is now the binding constraint); (b) **prototype a second engine** — only
    **IPvGO** (`ns.go` / CIA Sector-12) or **darknet** (DarkscapeNavigator + TOR) are buildable now;
    gang/corp/bladeburner/sleeves are node-locked.
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

**Docs layout:** `docs/` — Bitburner project/task references · `docs/metareference/` —
non-Bitburner learning material (Claude Code / AI-workflow docs) · `docs/phases/` — archived
shipped phase docs (index: `CHANGELOG.md`).
