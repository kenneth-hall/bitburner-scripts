# Exported logs

**Rule (in CLAUDE.md):** prefer an exported log over copy/pasted terminal output. Game
copy/paste is lossy (dropped line breaks, truncated scrollback, garbled merges). When a
script's result needs to be read back and isn't already logged, add an `ns.write(...)`
export (plus a `vite.config.ts` download-filter entry) instead of asking for a paste.

This file is the *how*. Before adding a new log, read `vite.config.ts` +
`src/daemon.js`/`src/targets.js` for the current cadence/cap values and follow the
matching shape.

## Three export patterns (by script lifetime)

- **Long-running daemon** — one file, overwritten in place. Example:
  `daemon-batch-log.json` from `daemon.js`. A bounded ring buffer written via
  `ns.write(..., "w")`, capped by count of a meaningful event (not by tick/time) so the
  file never grows unbounded. Rewritten wholesale each update.
- **One-shot script** — a fresh timestamped file per run. Example:
  `targets-summary-<epoch ms>.json` from `targets.js`. Filename embeds `Date.now()` so
  repeated runs (e.g. a before/after comparison) each land as their own file — no
  overwrite, no fresh prompt after every run — and sort chronologically as plain strings.
- **Daily-rotating** — one file per calendar day, updated live. Example:
  `transactions-YYYY-MM-DD.json` from `src/translog.js`. Rotates at the day boundary and
  is written as income/expenses happen. **First place to look when debugging anything
  money-related.**

## Wiring a new log into the download

`vite.config.ts`'s `viteburner.download.location` filters the download to just the
relevant filename(s), so pulling a log doesn't re-download every script:

- Exact match for a ring-buffer file (e.g. `daemon-batch-log.json`).
- A regex for a timestamped pattern (e.g. `/^targets-summary-\d+\.json$/`).

There's no push channel from the game back to the dev server, so a small custom Vite
plugin (`configureServer` + `setInterval`) synthesizes the same `d` keypress viteburner's
manual download uses — polling is the only option.

> `vite.config.ts` changes (unlike `src/` file changes) need a full dev-server restart to
> take effect. See [dev-server.md](dev-server.md).
