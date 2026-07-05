# Refactor spec: distributed hacking daemon (Phase 1 of 2)

## Context

Work in `C:\Users\admin\bitburner-scripts`. The existing scripts and the API documentation (`markdown\` subfolder) are there.

The current scripts (`main.js`, `getclients.js`, `getstealtargets.js`, `worker.js`, `killscripts.js`, `purchasescripts.js`) implement a run-once deploy model: `main.js` kills everything, roots what it can, and starts a self-targeting looping `worker.js` on every hacked server. Each worker attacks the server it runs on, chosen by crude thresholds (weaken if security > min+5, grow if money < 75% of max, else hack).

We are refactoring toward a batcher in two phases. **This spec covers Phase 1 only**: a central-allocation daemon with dedicated-action workers. Phase 2 (precisely timed HWGW batches) comes later; Phase 1 must be shaped so Phase 2 replaces the scheduler, not the whole codebase.

## Ground rules

- Verify every NS API call against the docs in `C:\Users\admin\bitburner-scripts\markdown\` (files named `bitburner.ns.<function>.md` etc.). Do not rely on memorized API signatures — this version differs from older ones (e.g. purchased servers are under `ns.cloud.*`, number formatting is `ns.format.number`). Match the conventions already used in the existing scripts, and check the docs when unsure.
- Do not search the web or reference community batcher implementations. Design from the API docs and this spec.
- Worker scripts must stay tiny. Script RAM cost is determined by which NS functions the file references — workers should contain almost nothing beyond their single action. No shared imports into worker files.
- Check the per-thread semantics of hack/grow/weaken in the docs before writing the math (e.g. whether splitting grow threads across multiple processes changes total effect). Note any such caveats in code comments.
- Handle failure paths: `ns.exec` returning pid 0, hosts with less free RAM than expected, zero eligible targets.

## Target architecture

Two concepts the old code conflated, now separated:

- **Hosts** — anything rooted with RAM we can run workers on: every nukeable network server *including ones with $0 max money*, all purchased servers, and `home` (minus a reserved amount so the daemon and manual scripts can still run).
- **Targets** — servers with money worth stealing, ranked and given an exact thread plan.

### Files

**`hosts.js`** (replaces `getclients.js`)
Exports a function that scans the network, opens ports and nukes everything newly nukeable (regardless of money), and returns the full host list — network servers, purchased servers via `ns.cloud`, and `home` — each with hostname, max RAM, and currently free RAM. Home's reported free RAM subtracts `HOME_RESERVE_GB` (const, default 32). No deployment logic in this file. Keep a runnable `main` for manual inspection that prints a summary.

**`targets.js`** (replaces `getstealtargets.js`)
Keeps the existing eligibility filter (has money, required hacking level < half the player's) and ranking (maxMoney / minSecurityLevel). Adds an exact per-target thread plan for steady state at min security / max money:

- hack threads to steal `HACK_FRACTION` (const, default 0.25) of max money — use the hack-analysis functions from the docs;
- grow threads to regrow from (1 − HACK_FRACTION) back to max;
- weaken threads to counteract the security added by both the hack and grow threads, plus enough to hold at min security.

Return for each target: the ranking fields plus `{hackThreads, growThreads, weakenThreads, totalThreads}`. Also report each target's *current* security/money vs min/max so the daemon can see prep state. Keep a runnable `main` that prints the plan table.

**`hackloop.js`, `growloop.js`, `weakenloop.js`** (replace `worker.js`)
Three minimal scripts. Each takes a target hostname as its first argument and runs its single action against that target in an infinite loop. No decision logic inside — the daemon decides the mix. Also accept an optional second argument reserved for Phase 2 (e.g. a run-once flag or start delay); in Phase 1 it may be ignored, but the argument slot should exist so Phase 2 doesn't change the exec signature.

**`daemon.js`** (replaces `main.js`)
Runs forever on `home`. Each cycle (const `CYCLE_MS`, default 10000):

1. Refresh hosts (roots newly nukeable servers automatically as hack level rises, picks up newly purchased servers).
2. Refresh targets and thread plans.
3. Compute desired allocation: walk targets in rank order; give each its full thread plan before moving to the next; stop when host RAM is exhausted. Threads for one action may be split across multiple hosts (subject to the per-thread-semantics check above). If a target's current state is far from min-sec/max-money, weight its allocation toward weaken/grow until it approaches steady state — keep this heuristic simple and clearly separated, since Phase 2 replaces it with a real prep phase.
4. Diff desired allocation against what is actually running (`ns.ps` per host, matching script name + target arg + thread count) and only kill/launch the differences. Do not kill-all every cycle.
5. Log a compact status via `ns.print` (targets, threads allocated vs desired, total RAM utilization %). Use `ns.tprint` only for rare events (new server rooted, target added/dropped). Open the tail window on startup.

Keep the allocation math (steps 3–4) in its own module or clearly separated functions — this is the part Phase 2 swaps out for a batch scheduler.

**`killscripts.js`** — keep as-is: a manual utility. The daemon may call it once at startup for a clean slate, never per cycle.

**`purchasescripts.js`** — unchanged; daemon may run it once at startup.

## Acceptance criteria

- After a few cycles at steady state, overall RAM utilization across hosts is high (roughly ≥90% of allocatable RAM) whenever there is at least one eligible target that can absorb it.
- Top-ranked targets sit near min security / max money once prepped.
- Rooting a new server, buying a server, or a hack-level increase is picked up within one cycle without restarting the daemon.
- Daemon survives scarcity: few hosts, tiny RAM, zero targets — no crashes, sensible logs.
- Each of `hosts.js` and `targets.js` runs standalone and prints a useful summary.

## Tunables (top-of-file consts)

`HACK_FRACTION = 0.25`, `HOME_RESERVE_GB = 32`, `CYCLE_MS = 10000`, plus any epsilon thresholds the prep heuristic needs.

## Out of scope (Phase 2)

Timed HWGW batching: converting loops to one-shot delayed actions, batch interval math from hack/grow/weaken durations, an explicit prep phase, in-flight job tracking. Do not implement any timing logic now, but do not make design choices that would block it (the reserved worker argument and the isolated scheduler module are what keep the door open).
