# docs/ — on-demand reference

Task-specific detail pulled out of CLAUDE.md. CLAUDE.md holds the standing *rules*; these
files hold the *how*, read only when the relevant task comes up.

| Topic | File | Read when |
|---|---|---|
| Script library: what every `src/` script does, grouped (diagnostics/probes, fleet utilities, daemon loop, workers, companions) | [scripts.md](scripts.md) | **Before hand-doing any network/scan/path/aug/rep/backdoor task, or writing a new one-off — check if a script already exists** (e.g. `connect.js` for a path to a server) |
| Game ↔ repo bridge: the RFA is the only external channel, egress is files-only, live state needs an in-game actor | [game-bridge.md](game-bridge.md) | Designing anything that "talks to the game" (MCP, live-state tooling); understanding why egress is file-mediated |
| Reset protocol (soft install / new BitNode) bootstrap: faction-unlock sequence, backdoor→faction servers, Daedalus/Netburners gates, auto-unlock-not-join rule | [reset-protocol.md](reset-protocol.md) | After an augment install / new BitNode; anything about unlocking factions or the auto-backdoor task |
| Faction reputation, favor & donation: rep via faction work + `ns.share()`, favor mechanics, the money→rep donation shortcut (measured numbers) | [reputation-favor.md](reputation-favor.md) | Planning a rep grind, install timing, or the Daedalus 2.5m-rep → Red Pill path |
| Augmentation grafting: aug effects without a reset, Entropy tax, SF10-gated API, observed unavailable in this build's BN1 | [grafting.md](grafting.md) | Anyone proposes a grafting-based plan (short answer: it doesn't help the BN1 finish) |
| BN1 endgame runbook: click-by-click favor-install → donate → buy → install → rebuild → re-climb → backdoor | [endgame-runbook.md](endgame-runbook.md) | Executing the finish once Daedalus rep clears ~465k |
| BN1 handoff: live state + verified mechanics + locked sequence with current position marked | [bn1-handoff.md](bn1-handoff.md) | **Resuming the BN1 endgame** in any new session — read this first |
| BN4 (The Singularity) planning notes: scaffold, why SF4 matters, open questions | [bn4.md](bn4.md) | Planning "what's next" after BN1; anything about SF4 / `ns.singularity.*` |
| Exported log patterns (ring-buffer / timestamped / daily-rotating), `vite.config.ts` filter | [logging.md](logging.md) | Adding or reading back an exported log; debugging money (transactions file) |
| Dev server: Remote API auto-reconnect, stale-connection kill+restart workaround | [dev-server.md](dev-server.md) | Restarting `npm run dev`; a file/log isn't syncing to the game; before a RAM-gate/live run |
