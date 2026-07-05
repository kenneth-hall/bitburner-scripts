# Purpose

This directory is a learning exercise, not a normal software project. The goal is to help the user **learn Claude Code** — how to work with it, prompt it well, and use it effectively — with the game **Bitburner** as the working example/sandbox.

## How to help

- **Do implement what's asked.** When the user asks for a script, tool, or solution, actually write it — this isn't a "hints only" exercise.
- **Give feedback proactively.** Periodically (and whenever it's relevant) comment on the user's Claude Code usage and prompting — what worked well, what could be clearer or more effective, better ways they could have asked for something, useful features/skills/commands they didn't use but could have. Treat this as an ongoing coaching relationship, not a one-time note.
- **Don't cheat via other players' solutions.** Do not look up, reference, or adapt other users' direct implementations/solutions/scripts for Bitburner (e.g. GitHub repos of someone's personal Bitburner scripts, forum "here's my code" posts). Work from the game's own mechanics and API instead.

## Tracking work

- **Check `BACKLOG.md` for current priorities before starting work**, and keep it up to date — move items between In Progress / Next Up / Ideas / Done as status changes, with a date when something finishes.

## Engineering conventions

- **Minimize the RAM cost of Singularity calls.** Singularity functions carry a heavy RAM
  multiplier, so keep them out of hot/always-on paths. Isolate them in dedicated
  daemon-launched companion scripts and `exec` by filename (the pattern already used for
  `purchasescripts.js`/`upgradehomeram.js`) rather than importing them into `daemon.js` or
  other long-running code, so the caller doesn't pay the multiplier.
- **Record every purchase in the transaction logger.** Any new script that spends money must
  write an expense record via `src/translog.js` (`recordTransaction`) on success, following the
  existing purchase call sites (`purchasescripts.js`, `purchasecloudservers.js`,
  `fleetupgrade.js`, `financemanager.js`/`cloudupgrader.js`). A failed spend records nothing.
- **Add tests and validate against logs when adding a feature.** Where practical, add automated
  tests (vitest, following `test/`'s patterns) and validate behavior against the exported log
  files, wiring log checks into `npm run verify:log` when it fits. Live-only game behavior isn't
  always unit-testable — for those, fall back to a live validation run and say so explicitly
  rather than claiming coverage you don't have.

## Git permissions

- **Full git ownership authorized (2026-07-04, Kenneth).** Branch off `master` for new feature
  work, commit, push, open/manage PRs, and merge back into `master` yourself — no need to stop
  and ask before merging in an interactive session. This is a standing authorization, not a
  one-time approval for a specific PR.
- **Exception: background/autonomous job sessions.** Some session types (background jobs) carry
  a fixed instruction that overrides project-level authorization and blocks pushing to
  `main`/`master`, force-pushing, or merging, regardless of what this file says — that's a
  property of the execution mode, not something this file can turn off. In that mode, get the
  branch/PR ready and ask Kenneth to do the actual merge.

## Communication

- **Summarize after acting.** After performing an action (running commands, editing/creating files, installing things, etc.), give a concise summary of what was done.
- **Flag unplanned deviations.** If something comes up that wasn't part of what we discussed — extra changes needed, files moved/deleted, scope creep, a different approach than planned — call it out explicitly rather than folding it in silently. Keep the user in the loop on anything not already agreed on.
- **Check results against the log files.** When verifying that a change behaved as expected, check it against the exported log files (e.g. `logs/daemon-batch-log.json`) rather than assuming. If something needed to verify a result isn't captured there, ask the user whether it'd be worth adding it to the logged data instead of guessing.
- **Remote API auto-reconnect is enabled (2026-07-04).** In-game Remote API options (Options →
  Remote API) have auto-reconnect on with a 5s retry delay and infinite retries. A `npm run dev`
  restart should reconnect on its own without a manual in-game step — still worth a quick check
  after a restart, but don't assume a manual reconnect is required by default anymore.
- **Prefer an exported log over copy/pasted terminal output.** Terminal copy/paste from the game is lossy (dropped line breaks, truncated scrollback, garbled merges) and burns the user's time re-pasting. When a script's result needs to be read back and isn't already logged, add a small `ns.write(...)` export for it (and a `vite.config.ts` download-filter entry) instead of asking for another paste. Three patterns depending on the script: a long-running daemon overwrites one ring-buffered file in place (`daemon-batch-log.json`); a one-shot script writes a new timestamped file per run (`targets-summary-<epoch ms>.json`) so repeated runs (e.g. a before/after comparison) don't overwrite each other and don't need a fresh prompt after every run; a daily-rotating file (`transactions-YYYY-MM-DD.json`, from `src/translog.js`) rotates at the calendar-day boundary and is updated live as income/expenses happen — it's the first place to look when debugging anything money-related.

## Reference material (allowed)

- Game files are available locally in this directory (Steam version).
- API documentation has been copied into `markdown/` — check there first.
- The official Bitburner GitHub repo is also fair game for docs/API/mechanics reference.

## Off-limits

- **Don't read the game's own source files to shortcut the experiment** — no peeking at the actual game source to see how something is implemented or to extract solutions/answers directly from source. Docs and public API are fine; reading the source to skip the puzzle is not.
- **Don't skip ahead or spoil upcoming game progression.** Help with what's currently unlocked/available given the user's current save progress. Don't reveal or build toward mechanics, servers, augmentations, factions, or endgame content the user hasn't reached yet, even if asked in passing — let the game's natural unlock order drive what we work on next.
  - **Carve-out — static values are fine.** Looking up a specific numeric cost, price, or a static data table (item/program costs, RAM costs, and similar) is allowed, since these values don't change and are already visible to Kenneth in-game. This exception covers concrete numbers/tables only — it is not license to reveal or build toward mechanics, content, or progression not yet reached.
