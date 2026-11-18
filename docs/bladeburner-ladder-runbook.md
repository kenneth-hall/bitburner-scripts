# Bladeburner ladder runbook (the proven node-clear procedure)

Proven in BN6, BN10, BN3 and BN11 (BN11: entry 2026-10-03 → clear 2026-10-16). Node-agnostic;
numbers (rates, SP totals, ETAs) are per-node — the evidence is in `docs/bitnode-history.md`.
Interface/mechanics: `docs/bladeburner-reference.md`. Estimates: `docs/estimation-calibration.md`.

## Sequence (fresh node)
1. **Combat to ≥100** on all four stats (the division gate). `Mug` is free but slow; the gym costs
   money and one stat at a time. Fund it with `Rob Store` if broke. Combat exp needed scales with the
   node's player mult — recompute, don't reuse another node's figure.
2. `run joinbladeburner.js`; verify with a `getRank()` read, never the boolean.
3. `bladeburnermanager.js` (99 GB) needs a host. **On `home`**: buy home RAM to 256 GB (so logs land in
   `logs/` and `bbblackop.js` shares the host). With `daemon.js` running, a fresh cloud server is
   filled by workers within seconds, so it can't be the host. Home must keep ≥160 GB reserved
   from workers (`hosts.js` `HOME_RESERVE_GB`).
4. Sleeve on `Infiltrate Synthoids` (set in the Sleeves UI; adds a flat +0.4987/min regen to every
   action's count — keeps `Tracking` alive).
5. **Early SP spend:** `run bbskillbuy.js 25` = Reaper + Overclock only (needs 21.6 GB free; kill
   `backdoorwd.js` first). In BN11 this lifted the grind 954 → ~9,700 rank/h. Do it **early** (rank
   ~25k), not at 79k like BN11.
6. Grind to **rank 400,000** (gate on the last op, not the win condition).
7. `bbskillbuy.js 400` (spend everything) → `bbblackop.js 20` (ops 1–20) → re-spend (SP refills from
   the ladder's rank) → `bbblackop.js 1 daedalus` → 🔴 `destroybn.js <nextBN> confirm`
   (**irreversible: restate at execution**; `nextBN` is mandatory; it aborts unless
   `getNextBlackOp()` is `null`).
   **Unattended form (2026-10-29): `run bnclear.js <nextBN> confirm`** does all of step 7, frees home RAM
   itself, and writes `aug-buy-off.txt` first (remove it after `acceptGift()` in a Stanek node).

## Landmines (all recurred)
- `bbblackop.js` refuses every op below rank 400,000 (`RANK_FLOOR`). Rank-eligible ≠ worth firing:
  early ops have the worst reward-to-failure ratio. Waiting is free.
- First op waits for stamina ≥ 0.80 (up to ~30 min); later ops rest 1–4 min.
- pMin is not pessimistic on the back half: Centurion failed 7× (BN3), Vindictus cost ~15.9k rank and
  $575b→$95b (BN11). Failures hospitalise. Budget for them; rank above the floor is the buffer.
- **`bbblackop.js` must run on `home`** (marker files are host-scoped) and needs `backdoorwd.js` dead
  (27.8 GB). `destroybn.js` needs **40.6 GB free on home**: kill `daemon.js` FIRST (its supervisor
  relaunches anything else), then the residents.
- **`bladeburner-off.txt` survives node changes on `home`** and silently holds the engine OFF (healthy
  `ps`, `off: true`, rank 0). Check it first when the engine is silent; it is gitignored, so
  viteburner never re-pushes or removes it.
- Manager off `home`: `ns.write` is host-scoped, logs never reach `logs/`; `scp` them home and wait
  for the repo mtime to change before reading.
- The manager's state file can stop updating after the `bbblackop` pause while grinding continues:
  read rank live via `run ladderstatus.js` (14.6 GB).
- Player-action slot has multiple claimants (`bladeburnermanager`, `augfarmer`, `backdoorfactions`,
  `backdoorwd`, grafting). Suspect `augfarmer` first if rank stalls.
- `cli.mjs dismiss` does NOT catch the Source-File popup after a destroy: press Escape via Playwright.
- While a focused player action runs the left nav is hidden and CDP `terminal`/`goto` time out;
  collapse the character overview, then unfocus.
- BN7 only: `joinBladeburnerDivision()` with SF7.3 held locks out Stanek's Gift (SF7.3 not held).

## BN7 live experiment — Reaper-only intervention (2026-10-23)
Step 5 (early SP spend) split to separate collinear causes: bought **Reaper L6→43 only** (`run bbskillbuy.js 25 reaper`; the
`reaper` arg is new). **Baseline:** rank 26,164.8 at epoch 1792799351 (~18:49 CDT), measured wall rate 0.135–0.151 rank/s
(~544/h) over the prior 24h. **Next:** re-read rank ~2h later, compare rate; then buy Overclock (17→54) the same way.
Overclock stays unbought until then (Q10: dead on stamina-bound short contracts).
**The 2h re-read never happened.** By 2026-10-27 the rank was 129,853 (epoch 1793146508), i.e. ~0.30 rank/s (~1,075/h)
averaged over 4 days. That is ~2× the baseline, but it can't be credited to Reaper: rank level and stat growth stack on it.
**Overclock L17→90 bought 2026-10-27** (`run bbskillbuy.js 25 overclock`, 11,271 SP, 23,374 SP left; action time
×0.83→×0.10). **Baseline:** rank 129,931.7 at epoch 1793146635. No clean 2h pre-buy window was taken, so compare against the
~1,075/h 4-day average. **Next:** re-read rank (`run ladderstatus.js`) after ≥2h. A rate near 1,075/h means stamina-bound
(Q10 confirmed); a multiple of it means the time cut is landing.
**Re-read 2026-10-27 21:23 CDT** (`logs/ladderstatus-1793154198825.json`): rank 136,841.6, i.e. +6,910 in 2.10 h =
**~3,289 rank/h, ~3.1× the 4-day average**. The time cut is landing, so Q10 ("Overclock is dead") doesn't hold here.
Caveat: the comparison point is a 4-day average, not a matched pre-buy window, so the true multiple may be somewhat lower.
ETA to rank 400k at this rate: ~80 h (~3.3 d), still 0/21 ops done. Recompute with `run ladderstatus.js`; don't quote this.
**2026-10-28 07:40 CDT: second early spend.** Rate before the spend: ~4,815 rank/h over 10.3 h (`ladderstatus-1793191182959.json`,
rank 186,313.0 at epoch 1793191183). `run bbskillbuy.js` (target 200) spent 42,142 SP: BI 25→101, DO 25→104, Reaper
43→44 (short: see BACKLOG bbskillbuy ordering bug). Success mult ×3.5→×20.8. **Next:** re-read after ≥2h and compare
with 4,815/h. Since the rate was already climbing on its own, only a clear jump counts as an effect.
**Re-read 2026-10-28 09:47 CDT** (`logs/ladderstatus-1793198837215.json`): rank 204,790.2, i.e. +18,477 in 2.13 h =
**~8,690 rank/h, ~1.8× the pre-spend 4,815/h**. That counts as a clear jump: the drift alone took ~10 h to go ×1.46
(3,289→4,815/h), and this went ×1.8 in 2 h. The BI/DO spend is landing. ETA to 400k: ~22.5 h. Recompute, don't quote.
Lesson for future nodes: spend success-chance SP early, not just Reaper/Overclock.
**2026-10-28 18:20 CDT: third spend** (`logs/bbskillbuy-1793229592352.json`; pre-spend rank 296,643 at epoch 1793229565,
~10,760 rank/h): 36,663 SP → BI 101→136, DO 104→141, success ×20.8→×33.7. Reaper is still 44: this ran the OLD order,
because the dev server had stopped pushing (it was still pulling logs) and the fix hadn't synced. After a dev-server
restart the fix is live. Check `dist/src/<file>` before trusting a run of freshly edited code.

## Stanek's Gift (BN13, 2026-11-13)
Biggest single lever found in BN13. Gift board 6x5; layout (`stanekplace.js`, offline exhaustive search,
full tiling) = Str/Def/Dex/Agi/Bladeburner fragments + boosters 100 and 105.
- **Effect law (fitted live, within 0.1%):** `chargedEffect - 1 ∝ ln(highestCharge + 1) × numCharge^0.07`.
  `highestCharge` is the largest single `chargeFragment` call's thread count → **one big host beats many
  small ones**. Raising highestCharge appears to rescale numCharge down (3,327 → 130 when hc 57 → 2048),
  but net effect still rose.
- Measured: fleet-only (biggest worker 38 threads) → stats ×1.44–1.49, BB ×1.09; adding a 4 TB cloud
  server (2,048-thread worker, $3.78b) → stats ×1.70–1.77, BB ×1.14. Combat ~175 → ~300.
- RAM sources: `xp-off.txt` + `share-off.txt` (`run marker.js on <file>`) free ~2.7 TB of fleet that
  only fed hacking XP / faction share — both dead weight on the BB route.
- Scripts: `stanekprobe.js` (read-only), `stanekplace.js` (refuses a non-empty board without `force`),
  `stanekcharger.js` (resident, ~11 GB on home, fills ≤85% of non-home fleet, writes
  `logs/stanek-state.json`; `run stanekcharger.js stop` kills workers), `stanekbuy.js <ram> [name]`
  (buys a cloud server and fills it with a worker before the batcher can).
- Offline time shows as "Bonus time" on the Gift page and speeds charging.
- Not daemon-launched: restart `stanekcharger.js` by hand after a game restart.

### BN13 early SP spend (2026-11-14 12:34 CST) — overdue, done at rank 93.8k not 25k
Pre-spend baseline (`logs/bladeburner-state.json`): rank 93,769, rate **5,178 rank/h (1h)** / 3,608 (24h).
`run bbskillbuy.js` (default target) spent 26.3k SP: Overclock 17→90, Reaper 6→50, BI→52, DO→56
(success ×3.50→×8.29, action time ×0.83→×0.10). Needed `kill backdoorwd.js` **and** `kill xpfarm.js`
(xpfarm is switched off by `xp-off.txt` anyway) to clear 21.6 GB on home. **Next:** re-read the 1h rate
after ≥2h; only a clear jump over 5,178/h counts (the rate was already rising as Gift charge grew).
Gift state at spend: stat fragments ×2.15–2.27, Bladeburner ×1.23; combat 443–577.
**2026-11-14 12:36: 32 TB `stanek-1` bought** ($123.8b, one 16,384-thread worker; money $177b → $54b).
First read: a fragment's numCharge rescales on a new highestCharge (157k → 19.7k), so the effect steps up
only partly at first (Str ×2.15 → ×2.27) and keeps rising as numCharge rebuilds. Fit-law ceiling at equal
numCharge: ×1.27 on the bonus part (Str → ~×2.47). Check `logs/stanek-state.json` rather than quoting this.

### BN13 clear (2026-11-18)
Found rank 1.85M / 585k SP idle, ~3 days past the 400k gate: the dashboard GOAL panel reads `REACHED`
but nothing acts on it, and the manager grinds on indefinitely. Pre-spend rates (`logs/bladeburner-state.json`): 7.2 rank/s (1h), 6.4 (24h).
`run bnclear.js 14 dry` (`logs/bnclear-1795045425035.json`): `bbskillbuy.js 400` took success
×8.29→×197.48 on 585k SP. Dry mode stops at "DRY - stopping before Daedalus"; finish with
`run bnclear.js 14 confirm` (🔴 irreversible). The miss was a process gap, not a tooling one: the
signal existed. Fix is the session-start habit (compare rank to the gate), not another indicator.
