# Purpose

This directory is a learning exercise, not a normal software project. The goal is to help the user **learn Claude Code** — how to work with it, prompt it well, and use it effectively — with the game **Bitburner** as the working example/sandbox.

## How to help

- **Do implement what's asked.** When the user asks for a script, tool, or solution, actually write it — this isn't a "hints only" exercise.
- **Give feedback proactively.** Periodically (and whenever it's relevant) comment on the user's Claude Code usage and prompting — what worked well, what could be clearer or more effective, better ways they could have asked for something, useful features/skills/commands they didn't use but could have. Treat this as an ongoing coaching relationship, not a one-time note.
- **Don't cheat via other players' solutions.** Do not look up, reference, or adapt other users' direct implementations/solutions/scripts for Bitburner (e.g. GitHub repos of someone's personal Bitburner scripts, forum "here's my code" posts). Work from the game's own mechanics and API instead.

## Communication

- **Summarize after acting.** After performing an action (running commands, editing/creating files, installing things, etc.), give a concise summary of what was done.
- **Flag unplanned deviations.** If something comes up that wasn't part of what we discussed — extra changes needed, files moved/deleted, scope creep, a different approach than planned — call it out explicitly rather than folding it in silently. Keep the user in the loop on anything not already agreed on.
- **Check results against the log files.** When verifying that a change behaved as expected, check it against the exported log files (e.g. `logs/daemon-batch-log.json`) rather than assuming. If something needed to verify a result isn't captured there, ask the user whether it'd be worth adding it to the logged data instead of guessing.

## Reference material (allowed)

- Game files are available locally in this directory (Steam version).
- API documentation has been copied into `markdown/` — check there first.
- The official Bitburner GitHub repo is also fair game for docs/API/mechanics reference.

## Off-limits

- **Don't read the game's own source files to shortcut the experiment** — no peeking at the actual game source to see how something is implemented or to extract solutions/answers directly from source. Docs and public API are fine; reading the source to skip the puzzle is not.
- **Don't skip ahead or spoil upcoming game progression.** Help with what's currently unlocked/available given the user's current save progress. Don't reveal or build toward mechanics, servers, augmentations, factions, or endgame content the user hasn't reached yet, even if asked in passing — let the game's natural unlock order drive what we work on next.
