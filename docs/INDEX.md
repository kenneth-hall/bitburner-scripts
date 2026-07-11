# docs/ — on-demand reference

Task-specific detail pulled out of CLAUDE.md. CLAUDE.md holds the standing *rules*; these
files hold the *how*, read only when the relevant task comes up.

| Topic | File | Read when |
|---|---|---|
| Game ↔ repo bridge: the RFA is the only external channel, egress is files-only, live state needs an in-game actor | [game-bridge.md](game-bridge.md) | Designing anything that "talks to the game" (MCP, live-state tooling); understanding why egress is file-mediated |
| Reset protocol (soft install / new BitNode) bootstrap: faction-unlock sequence, backdoor→faction servers, Daedalus/Netburners gates, auto-unlock-not-join rule | [reset-protocol.md](reset-protocol.md) | After an augment install / new BitNode; anything about unlocking factions or the auto-backdoor task |
| Exported log patterns (ring-buffer / timestamped / daily-rotating), `vite.config.ts` filter | [logging.md](logging.md) | Adding or reading back an exported log; debugging money (transactions file) |
| Dev server: Remote API auto-reconnect, stale-connection kill+restart workaround | [dev-server.md](dev-server.md) | Restarting `npm run dev`; a file/log isn't syncing to the game; before a RAM-gate/live run |
