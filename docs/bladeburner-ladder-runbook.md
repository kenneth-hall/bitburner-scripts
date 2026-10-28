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
