# Dev server (`npm run dev` / viteburner)

The `npm run dev` viteburner process is **Claude-owned** — start/stop/restart it directly
rather than asking the user to check a terminal they don't have open.

## Remote API auto-reconnect (enabled 2026-07-04)

The in-game Remote API options (Options → Remote API) have auto-reconnect on, with a 5s
retry delay and infinite retries. A `npm run dev` restart should reconnect on its own
without a manual in-game step. After a restart, tell the user once it's back up and do a
quick connection-status check — but don't assume a manual reconnect is required by
default; only flag it if it's still disconnected after a few seconds.

## Stale-connection workaround (pre-emptive)

The viteburner process can keep running with a `netstat`-visible `ESTABLISHED` socket on
its Remote API port (12525) while the actual file sync to the game is **silently dead** —
a file "isn't there in-game" or exported logs stop updating, with no crash and no error.
An `ESTABLISHED` socket is **not** evidence the connection works — treat it as
inconclusive. Root cause is unconfirmed (suspected: the process's stdin not being a TTY,
per viteburner's own startup warning); it has recurred across Phases 9, 10, and 12.

**Do this pre-emptively, not reactively.** At the start of any phase's RAM-gate or
live-validation step — the first time this session will ask the user to run something
whose result is read back via an exported `logs/` file — kill+restart the dev server
*before* asking for the first run. This turns a two-round-trip failure (stale result →
diagnose → restart → re-run) into a zero-round-trip one.

Procedure:

1. Find the process tree:
   `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'viteburner|npm run dev|npm-cli' }`
2. Kill the top of the tree: `taskkill /PID <pid> /T /F` — may take two passes, since an
   orphaned child can reparent to a session process instead of dying with its parent.
3. Restart with `npm run dev` in the background (so the startup log is visible), from the
   main checkout.
4. Confirm the startup log shows `conn connected` (not `disconnected` / `no connection`),
   *then* ask for the first in-game run. Auto-reconnect (above) should handle the game
   side; only ask the user to reconnect manually if it stays disconnected.

Related backlog items: "viteburner dev-server silently stops auto-exporting".
