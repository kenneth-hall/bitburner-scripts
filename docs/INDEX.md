# docs/ — on-demand reference

Task-specific detail pulled out of CLAUDE.md. CLAUDE.md holds the standing *rules*; these
files hold the *how*, read only when the relevant task comes up.

| Topic | File | Read when |
|---|---|---|
| Script library: what every `src/` script does, grouped (diagnostics/probes, fleet utilities, daemon loop, workers, companions) | [scripts.md](scripts.md) | **Before hand-doing any network/scan/path/aug/rep/backdoor task, or writing a new one-off — check if a script already exists** (e.g. `connect.js` for a path to a server) |
| Game ↔ repo bridge: the RFA is the only external channel, egress is files-only, live state needs an in-game actor | [game-bridge.md](game-bridge.md) | Designing anything that "talks to the game" (MCP, live-state tooling); understanding why egress is file-mediated |
| Reset protocol (soft install / new BitNode) bootstrap: faction-unlock sequence, backdoor→faction servers, Daedalus/Netburners gates, auto-unlock-not-join rule | [reset-protocol.md](reset-protocol.md) | After an augment install / new BitNode; anything about unlocking factions or the auto-backdoor task |
| Faction reputation, favor & donation: rep via faction work + `ns.share()`, favor mechanics, the money→rep donation shortcut (measured numbers) | [reputation-favor.md](reputation-favor.md) | Planning a rep grind, install timing, or the Daedalus 2.5m-rep → Red Pill path |
| NeuroFlux Governor mechanics: the two escalation ladders (price ×2.166, **rep requirement ×1.14**), rep-resets-but-requirement-doesn't, counting quirks, seller/buy rules | [neuroflux.md](neuroflux.md) | Any aug-ratchet / spend-down / NFG projection work; before assuming anything about how many levels a cycle can buy |
| Augmentation grafting: aug effects without a reset, Entropy tax, SF10-gated API, observed unavailable in this build's BN1 | [grafting.md](grafting.md) | Anyone proposes a grafting-based plan (short answer: it doesn't help the BN1 finish) |
| BN1 endgame runbook: click-by-click favor-install → donate → buy → install → rebuild → re-climb → backdoor | [endgame-runbook.md](endgame-runbook.md) | Executing the finish once Daedalus rep clears ~465k |
| BitNodes reference: all 15 nodes + Source-File effects, how-to-destroy, BN4's live-read multiplier table | [bitnodes.md](bitnodes.md) | Choosing a next BitNode; anything about a node's mechanics / Source-File / SF4 / `ns.singularity.*` |
| Gang engine: API/mechanics reference, full decision history, economics, `gangmanager.js` architecture, territory status — everything gang-related in one place | [gang-engine.md](gang-engine.md) | **Before designing or recommending anything gang-related** — a Phase 27 draft written off the method list alone had its premise invalidated twice by facts now in this file; also the place to check "was this strategy already tried" before proposing a change |
| Batcher engine: `daemon.js`/`scheduler.js`/`targets.js`/`hosts.js`/`sampling.js` architecture, lifecycle behavior across installs, strategy across BitNodes, open tripwires — everything batcher-related in one place | [batcher-engine.md](batcher-engine.md) | **Before designing or recommending anything batcher-related** (targeting, scheduling, RAM allocation, worker sizing) |
| Stock market mechanics: two access doors (WSE / TIX API), 4S data add-on, progression locks | [stock-market.md](stock-market.md) | Any future stock-market design pass (no code exists yet) |
| Darknet (`ns.dnet`) mechanics: access chain, network volatility, three extraction paths | [darknet.md](darknet.md) | Any future darknet design pass (no code exists yet) |
| Exported log patterns (ring-buffer / timestamped / daily-rotating), `vite.config.ts` filter | [logging.md](logging.md) | Adding or reading back an exported log; debugging money (transactions file) |
| Dev server: Remote API auto-reconnect, stale-connection kill+restart workaround | [dev-server.md](dev-server.md) | Restarting `npm run dev`; a file/log isn't syncing to the game; before a RAM-gate/live run |
