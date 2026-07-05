# docs/ — on-demand reference

Task-specific detail pulled out of CLAUDE.md. CLAUDE.md holds the standing *rules*; these
files hold the *how*, read only when the relevant task comes up.

| Topic | File | Read when |
|---|---|---|
| Exported log patterns (ring-buffer / timestamped / daily-rotating), `vite.config.ts` filter | [logging.md](logging.md) | Adding or reading back an exported log; debugging money (transactions file) |
| Dev server: Remote API auto-reconnect, stale-connection kill+restart workaround | [dev-server.md](dev-server.md) | Restarting `npm run dev`; a file/log isn't syncing to the game; before a RAM-gate/live run |
