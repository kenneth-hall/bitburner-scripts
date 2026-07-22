# Darknet exploitation (`ns.dnet`) — mechanics reference

Mechanics captured for a future design pass — **no architecture decided, no code written.**
This is a reference to design against later (from docs in `markdown/bitburner.darknet*.md` +
discussion), not a spec. If/when darknet work becomes real, it gets its own backlog idea +
phase docs.

## Access / lifecycle chain
`probe(returnByIP)` / `isDarknetServer(host)` / `getServerDetails(host)` to discover and
inspect; `heartbleed(host)` to read logs and diagnose failed auth; `authenticate(host,
password)` (direct-connect only) or `connectToSession(host, password)` (any distance, once
already authenticated) to get a session; `setStasisLink(true)` / `freezeServer(host)` to hold
a foothold against churn (`getStasisLinkLimit()` caps how many links can be active globally at
once).

## Network volatility (the mechanic normal-network scripts don't have to deal with)
`nextMutation()` ticks the whole darknet on its own clock — each cycle, some servers can move
(breaks/reforms connections only, script likely survives), go offline (usually permanent,
script and access gone), restart (kills all running scripts on that server), or a new server
can appear. `getDarknetInstability()` is a cost/budget gate tied to backdooring activity —
**open question, not yet checked in-game: is this global or per-server?** Matters for whether
"throw more workers at it" has a hidden ceiling.

## Three extraction paths, not mutually exclusive
1. **RAM** — `getBlockedRam(host)` (free, 0 GB) to check upside, then `memoryReallocation(host)`
   (needs auth + direct connection) to free usable RAM, scales with charisma/threads.
2. **Money** — `phishingAttack()` (must run *on* the darknet server, no target arg), scales
   with threads/charisma/crime success rate, very occasionally drops a `.cache` file as a
   bonus; `openCache(filename)` cashes it in (2 GB, costs karma). Caches are **not** a standing
   resource to seek out directly — the docs only describe them dropping from phishing, so this
   is "grab it when it appears," not a plannable target.
3. **Stock** — `promoteStock(sym)` needs no server access at all, just a symbol; raises a
   stock's *volatility* (not its forecast), decays without reapplication, and is only useful if
   paired with actual trading (see [stock-engine.md](stock-engine.md) — no stock access owned
   yet, so `promoteStock` has no trading strategy to pair with today).

## Karma
`CrimeStats.karma` and `CacheReward.karmaLoss` both use "loss" terminology, and documented
faction karma requirements are negative thresholds (e.g. `{ "type": "karma", "karma": -90 }`
meaning karma must be ≤ -90) — read together, this suggests both crime and cache-opening push
karma the same (more negative) direction that low-karma faction eligibility wants, i.e. no real
tension between "open caches freely" and "keep karma low enough for some factions." **Not yet
confirmed empirically** — cheap to verify with `ns.getPlayer().karma` before/after opening one
cache.

## Prerequisite work — done (Phase 13)
The consistency consolidation (`scanNetwork`/`findPath` in `src/common.js`, `tryRoot` in
`src/hosts.js`) has shipped — darknet scripts can reuse those helpers instead of re-deriving
BFS/rooting logic.

## Still undecided (needs a real design pass before any code)
Scheduling model for volatile/moving targets (very different from the normal-network batcher's
static-topology assumption); which of the three extraction paths to prioritize per
server/situation; how to represent/react to `nextMutation()` events; and whether/how this
integrates with or runs alongside `daemon.js`.
