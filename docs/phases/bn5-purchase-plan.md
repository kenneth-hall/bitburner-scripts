# BN5.1 capital allocation — home RAM vs. cloudmanager's fleet (2026-07-24)

**Question:** how much home RAM to buy, and when, versus letting cloudmanager spend the same
money on purchased-server fleet, in early BN5.1 (entered ~2026-07-23 23:00; hacking 246,
~$45k, home 32 GB, fleet 398 GB rooted + one 2 GB cloud-0, income unblocked ~1h ago by the
floor-reserve deadlock fix — see CHANGELOG 2026-07-24).

---

## Recommendation (the plan)

**Buy home to exactly 128 GB — two tiers, $41.95M total — as soon as liquid money allows,
and not one tier more mid-cycle.** Everything above 128 GB comes free at install time via
`installer.js`'s residual sweep; everything below 128 GB leaves the aug ratchet (the node's
win condition) unable to start. Concretely:

1. **Now → first ~$20M available: cloudmanager gets everything.** TOR + port-opener
   reservations ($30.2M standing now, SQLInject's $250M later) already outrank fleet and
   must keep doing so — openers expand the *free* rooted fleet, the best $/GB in the game.
   Do not pre-reserve for home RAM in the trough; fleet compounding is what ends the trough.
2. **Trigger A (arm) — when `cloud-state.json`'s `available` first exceeds $20M:** write
   `finance-reserve-extra.txt` = `42000000`. This stops cloudmanager racing the money away
   between its 10s polls (its later upgrade bites are $28–68M each — without the marker,
   liquid may never sit still long enough to buy).
3. **Trigger B (fire) — when money ≥ standing reservations + $42M:** run
   `run upgradehomeramonce.js` **twice** from a fleet/rooted server with free RAM (it is
   deliberately runnable off-home; home is saturated). Expected prints/spends:
   **$10,083,073** (32→64) then **$31,862,510** (64→128). Then **delete
   `finance-reserve-extra.txt`** — fleet resumes taking every marginal dollar.
   The script prints the live cost before buying and refuses over its $500M default cap, so
   a fork/Intelligence surprise in the price is caught before money moves.
4. **After that, nothing:** `augfarmer.js` self-launches on the daemon's supervisor retry
   (≤60s check cadence), the ratchet runs, and at install #1 `installer.js` sweeps all
   residual money into further home tiers + cores for free (money is wiped by the install
   anyway). Cycles 2–3 inherit that home and never revisit this question.
5. **Home cores: leave entirely to the install-time sweep.** First core is $7.5B (measured
   2026-07-17/22, ×7.5 per core), `sampling.js` assumes 1 core (`docs/batcher-engine.md` §4,
   Phase 17 shelved), and home contributes ~0 batcher RAM below `HOME_RESERVE_GB` = 160
   anyway. Cores never compete for mid-cycle dollars.

**If this line is never revisited, the default is: home stops at 128 GB until install #1.**

---

## Why 128 GB exactly — the companion ladder

Home-only by construction: every companion is `ns.exec(script, "home", 1, …)`
(`daemon.js:175`), launched in `RESIDENT_COMPANIONS` order (`daemon.js:115`).

| Launch order | Script | GB | Fits at 32? | at 64? | at 128? |
|---|---|---|---|---|---|
| — | daemon.js | 16.50 | ✓ | ✓ | ✓ |
| 1 | transactionsmonitor.js | 2.60 | ✓ | ✓ | ✓ |
| 2 | resourcemanager.js | 3.35 | ✓ | ✓ | ✓ |
| 3 | cloudmanager.js | 6.25 | ✓ | ✓ | ✓ |
| 4 | gangmanager.js | 24.80 | ✗ | (transient) | (transient) |
| 5 | **augfarmer.js** | **64.10** | ✗ | **✗** | **✓** |
| 6 | dashboard.js | 2.60 | ✓ | ✓ | ✓ |
| 7 | xpfarm.js | 5.85 | ✗ | ✓ | ✓ |
| 8 | ratchetlog.js | 10.10 | ✗ | ✓ | ✓ |
| 9 | gangratelog.js | ~1.60 | ✗ | ✓ | ✓ |
| 10 | goallog.js | 3.10 | ✗ | ✓ | ✓ |
| | **Census total (excl. gangmanager)** | **116.05** | | | |

- **At 32 GB (now):** core four + dashboard = 31.30 GB; augfarmer/xpfarm/ratchetlog/
  gangratelog/goallog all `waitingRam`. Matches the live saturated home.
- **At 64 GB:** everything fits *except* augfarmer (35.3 GB free after the core four
  < 64.10). One tier unlocks nothing that matters — the unlock is binary at 128.
- **At 128 GB:** full census 116.05 GB fits with ~12 GB headroom. Launch-order race is
  safe: when augfarmer's exec fires, worst case gangmanager's 24.8 GB is still transiently
  resident → 74.5 GB free ≥ 64.10 ✓. ratchetlog may wait one 60s supervisor cycle for
  gangmanager's transient to release; harmless.

**The gangmanager suspicion (checked, settled): it does NOT squat.** `gangmanager.js:458`
— `if (!ns.gang.inGang()) { tprint ERROR; return; }` — it exits immediately in gangless
BN5. Its slot ahead of augfarmer costs a transient 24.8 GB at launch/retry moments only;
after the census fills 128 GB, supervisor retries of it fail `fitsOnHome` and go to
`waitingRam` (an INFO line, no crash). No change to the answer above.

## The circularity this $42M breaks

`installer.js` is the **only automatic buyer** of home RAM, and it runs only during an
install — which `augfarmer.js` triggers — which needs a 128 GB home. So the loop that buys
home RAM is gated behind the RAM it would buy. This is not hypothetical: **BN2 sat with a
dormant ratchet for ~2 days on exactly this deadlock** (BACKLOG "aug-ratchet can deadlock
on home RAM", root-caused 2026-07-20; broken by hand-buying 64→128 for $31.862M). Nothing
auto-detects it (still-open BACKLOG item), so this node it gets broken by plan instead of
by autopsy. While augfarmer is down, *nothing* joins factions, accrues aug targets, queues
augs, or installs — money piles up but the M-grind clock does not move.

## The cost curves (ground truth)

**Home RAM** — measured across BN1 and BN2 transaction logs (`home-ram-upgrade`); the two
nodes' prices are byte-identical per tier, and BN5's Home RAM Cost is also baseline (100%,
`docs/bitnodes.md` BN5 table), so these carry over. Per-tier ratio is exactly ×3.16:

| Tier | Cost | Cumulative from 32 GB | $/GB (increment) | Source |
|---|---|---|---|---|
| 32→64 | $10.083M | $10.08M | $315k | measured (CHANGELOG Phase 27, BN2) |
| 64→128 | $31.863M | $41.95M | $498k | measured (BACKLOG 2026-07-22, BN2) |
| 128→256 | $100.69M | $142.63M | $787k | ×3.16 chain (all 15 measured points fit exactly) |
| 256→512 | $318.16M | $460.79M | $1.24M | measured (transactions 07-21) |
| 512→1024 | $1.0054B | $1.466B | $1.96M | measured (transactions 07-21) |

**Fleet (BN5)** — formula pinned by ground truth in two nodes:
`cost(ram) = 55,000 × ram × softcap^max(0, log2(ram)−6)`, upgrade cost = full-cost
difference between tiers. Verified exactly against BN1 logs (softcap 1.0: every doubling
is 2×) and BN2 logs (softcap 1.3: 64→128 = $5,632,000 = 55000·128·1.3 − 3,520,000 ✓, and
every tier above ✓). **BN5 softcap = 1.200, base cost 100%** (`docs/bitnodes.md:397`);
today's cloud-0 buy at $110,000 = 55000×2 confirms base cost live.

| Per-server (BN5, s=1.2) | New-buy cost | Upgrade-to cost | $/GB (new) |
|---|---|---|---|
| 16 GB | $880k | — | $55k |
| 64 GB | $3.52M | — | $55k |
| 128 GB | $8.45M | $4.93M | $66k |
| 256 GB | $20.28M | $11.83M | $79k |
| 512 GB | $48.66M | $28.39M | $95k |
| 1 TB | $116.8M | $68.12M | $114k |

**Comparison:** home RAM runs **5–9× worse $/GB** than same-tier fleet (e.g. $498k vs
$66–79k around the 128–256 band). As pure batcher GB, home is a bad buy at every tier —
even credited with 3-cycle persistence vs 3× fleet rebuilds, it's roughly break-even at
128 and strictly worse above. **The $42M is not a throughput investment; it is an unlock
purchase for the ratchet.** That is also why the plan stops at 128: above the census,
home GB *is* just expensive fleet GB (and below `HOME_RESERVE_GB` = 160, home contributes
0 batcher budget anyway — `src/hosts.js:40`).

**The persistence asymmetry, quantified where it actually pays:** home survives installs,
fleet doesn't — but the repo's own mechanism already monetises that for free.
`installer.js` (S1: max RAM tiers → S2: max cores → install) converts the entire residual
bankroll into permanent home hardware at the exact moment money is about to be wiped —
zero opportunity cost. BN2's logs show home riding this sweep from 128 GB to 512 TB across
installs without a single contested mid-cycle dollar. The asymmetry argument therefore
justifies *timing* (get to 128 before install #1 can exist), never mid-cycle tiers beyond it.

## Trigger sizing rationale

- **$20M arm / $42M+reservations fire:** at the fire point the home buy takes at most
  ~half the war chest once, cloudmanager keeps the other half plus all future income, and
  the standing reservations (openers → free rooted RAM) are never invaded. Earlier would
  tax the trough where fleet compounding is the only way out; later burns ratchet-dead
  hours for no gain — every fleet tier bought while augfarmer is down is income toward a
  bankroll that has nothing to spend itself on (BN2 proved this: $3.08B idle at the
  deadlock break).
- Both triggers are **money-conditioned, not time-conditioned**, deliberately: BN5's
  economy (15% stolen money, 50% starting money) makes time-to-$42M unmodellable from repo
  data. If the fire condition hasn't been met by the **2026-07-26 tripwire check**
  (CLAUDE.md), that is the batcher-income tripwire's territory, not this plan's — reopen
  there.

## Mechanism gap + recommended durable fix (not implemented here)

`computeReservations` (`src/resourcemanager.js:123`) has keys for bootstrap-server /
tor-router / next-port-opener / formulas / manual-extra / next-aug — **no `home-ram` key**
— and `cloudmanager.js:155` spends everything above `totalReserved`. So home RAM loses
every race by default; the manual-extra marker in Trigger A is the sanctioned stopgap.

**Recommendation:** add a `home-ram` reservation — condition `getServerMaxRam("home") <
128`, amount from a static two-entry table (`10_083_073`, `31_862_510`), keeping
resourcemanager Singularity-free per its charter — **plus** a self-terminating fulfiller
(the `procureprograms.js` pattern) that execs `upgradehomeramonce.js` when the reserved
amount is covered and exits once home ≥ 128. Reservation without a buyer only freezes
money; the BACKLOG item ("nothing detects or breaks this deadlock automatically") wants
both halves. **Urgency: low for this node** (this plan hand-breaks it; installs preserve
home) — it pays at the *next* fresh node entry. File it with that BACKLOG entry.

**SF5 note (confirmed live):** Formulas.exe is permanently owned in BN5 — today's
`daemon-status.json` reads `mathMode: "formulas"` at hacking 246 with no $5B purchase —
so the `formulas` reservation's `!hasFormulas` condition can never fire here. No code
change needed (it self-discharges); $5B of reservation pressure that BN2 planning carried
simply doesn't exist in BN5. `procureformulas.js` is a no-op self-terminating fulfiller
here, absent from `RESIDENT_COMPANIONS`, zero standing cost.

## What would falsify this plan

1. **The 32→64 tier prints ≠ $10.083M** when `upgradehomeramonce.js` runs (Intelligence —
   new in BN5 — or a fork change discounting/raising home RAM cost). The tool prints
   before buying, so this is caught pre-spend; re-tabulate and re-size triggers if so.
2. **Available money stalls below the fire threshold past 2026-07-26** — that's the
   CLAUDE.md batcher tripwire firing, a bigger problem than allocation; this plan yields
   to that analysis.
3. **The census outgrows 128 GB** (any companion's measured RAM rises, or a new resident
   lands). Current sum 116.05 GB leaves 11.95 GB margin; a >12 GB growth moves the unlock
   tier to 256 GB ($100.7M more) and the triggers scale accordingly.
4. **BN5's hand-read multiplier table is wrong** (softcap ≠ 1.2 or a hidden home-RAM
   mult). SF5's `getBitNodeMultipliers()` — already BN5 task #1 in CLAUDE.md — verifies
   this programmatically; the first fleet upgrade past 64 GB/server also reveals the real
   softcap in `transactions-*.json`.
5. **installer.js's sweep fails to fire at install #1** (ratchet bug): then mid-cycle home
   buys beyond 128 would need reconsidering for cycle 2. Watch for `home-ram-upgrade`
   records at the first install, as BACKLOG's cores-validation item already prescribes.

## Verification ledger

Measured/ground truth: home tiers 256→512 up (BN1+BN2 logs, byte-identical across nodes);
32→64 and 64→128 (BN2 live buys, CHANGELOG/BACKLOG); ×3.16 tier ratio (fits all 15 logged
tiers exactly); fleet formula (BN1 s=1.0 and BN2 s=1.3 logs, exact); BN5 base cost
($110k cloud-0 today); cores $7.5B/×7.5 (logs 07-17/22); augfarmer 64.10 GB
(`logs/ramcheck-result.json`); gangmanager immediate exit (`src/gangmanager.js:458`);
Formulas owned live (`daemon-status.json` mathMode); reservations $30.2M live
(`cloud-state.json`).

Derived, not directly measured: **cloudmanager.js 6.25 GB** (Phase 27's measured 14.80 GB
four-script aggregate minus transactionsmonitor 2.60 + resourcemanager 3.35 + dashboard
2.60; equals the Phase 11 prediction exactly); **gangratelog.js ~1.6 GB** (goallog.js
header: "entire ns surface is 0 GB" → script base only); **128→256 tier $100.69M**
(×3.16 chain, no direct log); **daemon.js 16.50** (live figure; recorded baseline 16.30).
Unverifiable from repo: whether Intelligence discounts home RAM in this fork (self-checks
at buy time, falsifier 1), and BN5 time-to-$42M (deliberately not estimated — the
triggers are money-conditioned instead).
