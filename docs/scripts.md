# Script library (`src/`)

**Read this before hand-doing a network/scan/path/aug/rep/backdoor task, or before writing a
new one-off — a script probably already exists.** (Trigger case: connecting to `w0r1d_d43m0n`
is `connect.js`, not a hand-walked `connect` chain.) Every script's own header comment is the
authoritative detail; this is the index. `run <name>.js` unless noted "imported".

## Read-only diagnostics & probes (safe, run by hand)
| Script | What it does |
|---|---|
| `connect.js [target]` | **BFS path from home to a server** + lists its files. Default `CSEC`. Read-only — prints the route, doesn't connect. Feed the route to terminal `connect` hops. |
| `allpaths.js` | BFS path to **every** reachable server (unbounded `scan-analyze`). |
| `serverlist.js` | Every non-owned server sorted by required hacking level — spotting backdoor / faction targets. |
| `auginfo.js` | Dump owned augs + aggregate player mults → timestamped `logs/auginfo-*.json`. Run before/after an install to diff. No Singularity. |
| `ramcheck.js [scripts...]` | RAM-gate check via `getScriptRam`, + records in-game byte length as a staleness proof. Defaults to `daemon.js`+`share.js`. |
| `cloudcosts.js` | Print cloud-server purchase + next-tier upgrade costs. |
| `sharecurve.js` | Predicted `sharePower` curve across share fractions (needs Formulas.exe). |
| `favorprobe.js` | Donation ↔ rep curve probe (Formulas-authoritative; favor is a hand-entered UI read). |
| `worldprobe.js` | Confirm `w0r1d_d43m0n` has spawned (post-Red-Pill) and read its live gates → log. |

## Manual fleet / money utilities (run by hand, log purchases)
| Script | What it does |
|---|---|
| `purchasecloudservers.js <sizeGB> [count]` | Buy cloud servers at a power-of-2 size (≥16GB). |
| `upgradecloudserver.js <hostname>` | Upgrade one cloud server tier-by-tier until unaffordable, then rename. |
| `fleetupgrade.js` | Rebalance + upgrade the **whole** fleet together, then rename `pserv-<sizeGB>gb-<i>`. |
| `renamecloudservers.js` | Rename owned cloud servers to the `cloud-<n>` scheme (rename only). |
| `upgradehomeram.js` | Buy home RAM (Singularity — needs ~74GB free just to launch). |
| `killscripts.js` | Kill everything (daemon runs it once at startup). |

## Core daemon loop (`daemon.js` orchestrates; most are imported, not run)
| Script | Role |
|---|---|
| `daemon.js` | Central-allocation HWGW batcher. Runs forever on home; also drives prep + `ns.share()`. Restart via `tools/bb/cli.mjs restart daemon.js`. |
| `scheduler.js` | *(imported)* Pure batch math — threads, `additionalMsec` timing, RAM bin-packing. No `ns`. |
| `targets.js` | *(imported)* Decides **what to attack**, ranked. |
| `hosts.js` | *(imported)* Discovers **where workers run** (rooting + purchased servers). |
| `sampling.js` | *(imported)* Formulas-or-legacy sampling seam. |
| `common.js` | *(imported)* Shared cheap `ns` helpers — incl. `findPath` / `findAllPaths` (the pathfinders `connect.js`/`allpaths.js` wrap). |
| `financestate.js` | *(imported)* `finance-state.json` shape + staleness rule. |
| `translog.js` | *(imported)* `recordTransaction` — the one write path for the transactions log. |

## Workers (scp'd to hosts, import-free by design)
| Script | Role |
|---|---|
| `hack.js` / `grow.js` / `weaken.js` | One-shot batch workers; daemon sets threads + timing. |
| `xphack.js` / `xpweaken.js` | Fire-and-forget XP-farm workers (distinct filenames keep the batcher's in-flight sweep blind to them). Launched by `xpfarm.js`. |
| `share.js` | One-cycle faction-share worker; daemon relaunches each tick. |
| `bootloop.js` | Self-contained cold-start worker (retargets via a re-scp'd control file). |

## Daemon companions (`exec`'d by `daemon.js` — restart via `tools/bb/cli.mjs restart <name>`)
| Script | Role |
|---|---|
| `resourcemanager.js` | Reservation-based available-cash service; publishes `finance-state.json`. Reserves, never spends. |
| `cloudmanager.js` | Always-on cloud fleet buy/upgrade (no rename, no Singularity). |
| `procureprograms.js` | Self-terminating Singularity fulfiller for TOR + the 5 port openers. |
| `bootstrap.js` | Cold-start deployer that runs `bootloop.js` on the network until home RAM fits `daemon.js`, then hands off. |
| `transactionsmonitor.js` | Income dashboard **and** the income-side writer of the transactions log. |
| `targetsmonitor.js` | Live dashboard of every eligible hack target. |
| `launchmonitor.js` | Live worker-launch history (watches `ns.ps()`). |
| `tailmanager.js` | Owns dashboard tail-window geometry (headless). |
| `xpfarm.js` | Hack-saturation XP engine — fills the fleet's surplus RAM (whatever the batcher/share leave unclaimed) with capped, held hack waves plus an overflow absorber; self-scales from ~0 to near-total. Toggle: `xp-off.txt` on home. |
