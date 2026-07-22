# Stock engine (prep — no engine built yet)

**Status (2026-07-22): research phase.** No stock code exists beyond `src/stockprobe.js`
(read-only access/constants probe). No access is owned in the current BN2.1 save — WSE
account, TIX API, and both 4S feeds all read `false` (BN1's TIX purchase did **not**
survive BitNode entry; probe `logs/stockprobe-1784755786874.json`). This doc is the
single authoritative reference for stock-market mechanics, the full `ns.stock` API
surface, gates/costs, and the design considerations a future engine phase starts from —
the same role `gang-engine.md` and `batcher-engine.md` play for their engines.

Sources: this build's API docs (`markdown/bitburner.stock*.md` + related), the in-game
**Documentation → Basic Mechanics → Stock market** page (captured over CDP 2026-07-22,
v3.0.1), a live probe of `getConstants()`, and per-node multiplier tables copied from
[`bitnodes.md`](bitnodes.md). The retired pre-consolidation notes are archived at
[`archive/stock-market.md`](archive/stock-market.md).

## 1. Where this fits strategically

- **Not needed for BN2.1.** The gang funds the aug catalog faster than the shop can absorb
  it; adding a stock engine now advances nothing on the current goal.
- **It IS a buildable second engine today.** The standing "prototype a second engine"
  thread has listed only IPvGO and darknet as buildable-now (gang/corp/bladeburner/sleeves
  being node-locked) — **stock belongs on that list too.** It is available in every node,
  needs no Source-File, and its full scripted stack costs ~$30.2b — pocket change against
  the gang's income. It is also one of the "rep-tax killer"-adjacent income engines that
  work when hacking income is nerfed (BN8 zeroes almost everything else).
- **BN8 ("Ghost of Wall Street") is the node that *forces* this engine.** All non-stock
  income is zeroed there (confirmed numerically in `bitnodes.md`): script hack money 0%,
  crime/darknet/infiltration/company/hacknet/contract money 0%, gang softcap 0, corp and
  bladeburner disabled. You start with $250m + WSE/TIX granted, and shorts + limit/stop
  orders work in-node. A pre-4S-capable script is the standard preparation (4S costs
  scale per-node; see §3 cost table). Hack/grow against a stock's server still moves its
  price there — the batcher survives as a *market-manipulation* tool, not an income tool.
- **SF8 levels change what's usable outside BN8:** L1 permanent WSE+TIX everywhere,
  L2 shorts everywhere, L3 limit/stop orders everywhere (+hack-growth mults 12/18/21%).
  We own **SF8 level 0**, so today, outside BN8: no shorts, no limit/stop orders, ever —
  **a current-save engine is long-only, market-order-only.** This resolves the API docs'
  vague "unlocked later in the game" phrasing: the unlock is BN8 (in-node) or SF8.2/8.3
  (everywhere).

## 2. Access model — two independent doors, plus a premium add-on per door

The doors gate **method** (UI vs script), not action (read vs trade). Each door covers
both reading and trading for its own method; you can hold either without the other.

| Purchase | Gates | Prereq | Cost (base; BN2 = baseline) |
|---|---|---|---|
| **WSE account** (`purchaseWseAccount`) | Manual trading via the Stock Market UI (City tab, any city) | none | $200m |
| **TIX API access** (`purchaseTixApi`) | Scripted trading via `ns.stock.*` | none (explicitly does not need WSE) | $5b |
| **4S Market Data** (`purchase4SMarketData`) | Forecast/volatility columns in the UI only | WSE account | $1b |
| **4S Market Data TIX API** (`purchase4SMarketDataTixApi`) | `getForecast()` / `getVolatility()` via script | TIX API access | $25b |

Costs measured live via `getConstants()` 2026-07-22 (BN2 has no Stock Market multiplier
row → base values). Commission is **$100k flat per transaction** (same constant). The two
4S purchases are fully independent of each other — buying the UI one does nothing for
scripts and vice versa.

**Per-node cost scaling:** several nodes multiply 4S costs ("Market Data Cost" scales
`MarketData4SCost`, "Market Data API Cost" scales `MarketDataTixApi4SCost`) — BN7
200%/200%, BN9 500%/400%, BN10 400%/400%, BN12ish 102%/102%, one node 1000%/1000% —
per-node rows live in [`bitnodes.md`](bitnodes.md), which stays the reference for those
tables.

### Reset behavior

- **BitNode entry wipes all four flags — confirmed.** TIX API was owned in BN1
  (2026-07-04); the 2026-07-22 BN2.1 probe reads all four `false`. Only SF8.1 makes
  WSE+TIX permanent across nodes.
- **Augmentation installs: persistence UNVERIFIED in this fork.** Vanilla folklore says
  stock access survives installs (unlike TOR/programs, which we've confirmed do reset),
  but nothing here has tested it. **Verify at the first install after purchasing** —
  `stockprobe.js` before and after. Until verified, an engine design must not assume the
  $30b access stack survives the aug-ratchet's auto-installs.
- **Open positions across an install are a live capital-loss risk.** Money hard-resets to
  ~$1k on install; whether held shares are auto-liquidated (and to where) or vaporized is
  unknown. In a node running the aug-ratchet/installer autonomously, an engine holding
  positions when an install fires could lose its whole float. Any real engine phase needs
  a **liquidate-before-install** hook (installer.js / ratchet integration) or a proven
  answer that positions convert to money pre-reset. This is the single biggest lifecycle
  design constraint carried out of this research pass.

## 3. Market mechanics (in-game Documentation page, v3.0.1)

### Ticks and offline behavior
- Prices update every **~6s** (`msPerStockUpdate` 6000). The market does **not** process
  while the game is closed; it accumulates bonus time instead, and runs **50% faster**
  (4s ticks, `msPerStockUpdateMin` 4000) until bonus time drains. `getBonusTime()`
  reports the accumulated ms. `nextUpdate()` resolves after each tick (always reports
  6000 ms of market time processed).
- `TicksPerCycle` = **75** — internal constant governing when a stock's forecast flips.
  With 6s ticks that's a ~7.5-minute cycle granularity; treat forecast regimes as
  stable-for-minutes, not per-tick noise.

### Prices, spread, and what you actually pay
- Each stock has a **bid** (highest buyer) and **ask** (lowest seller); ask > bid always;
  "price" = their average. **Long buys execute at ask, long sells at bid; shorts are
  reversed** (short entry at bid, short exit at ask). The spread is a built-in round-trip
  cost on top of the $100k commission.
- `getPurchaseCost`/`getSaleGain` fold in spread, commission, **and** the price impact of
  large transactions — use them rather than shares×price arithmetic.
- Each stock has a **max shares** cap (`getMaxShares`, long+short combined) and a soft
  price cap ("maximum price" — a hidden per-stock property, not a hard limit).

### Forecast and second-order forecast
- **Forecast** = P(price increases next tick), 0–1. Visible only with 4S (UI column with
  4S UI; `getForecast()` with 4S TIX).
- **Second-order forecast** = the value the forecast itself trends toward over time
  (RNG-driven, may never arrive). **Always hidden** — no purchase reveals it; it can only
  be inferred from forecast drift.
- Hidden per-stock properties beyond these: volatility (max %-move per tick — 4S reveals
  it), transaction-influence susceptibility, spread %, soft price cap.

### Things that move the market
- **Your own transactions**: buying/selling in size moves the forecast (and, much more
  weakly, the second-order forecast) in the direction of your trade. Magnitude scales
  with share count. This is both a cost (your entry moves price against you — visible in
  `getPurchaseCost`) and a lever.
- **Hacking a server with a corresponding stock** (e.g. `foodnstuff` ↔ FoodNStuff) with
  `{ stock: true }` in `BasicHGWOptions`: chance (∝ fraction of server money stolen) to
  push the **second-order forecast down**. Continuous hacking = sustained downward trend.
- **Growing** with `{ stock: true }`: same mechanism, second-order forecast **up**.
- **Working for a company** with a corresponding stock: second-order forecast up, potency
  ∝ work effectiveness.
- **`ns.dnet.promoteStock(sym)`** (this fork's darknet API, 2 GB): raises a stock's
  **volatility** (not forecast — bigger per-tick swings, direction unchanged), scales
  with charisma + threads, decays if not reapplied, needs no server access. Only useful
  paired with an actual trading edge (see [`darknet.md`](darknet.md)).
- Full server↔stock / company↔stock mapping is enumerable post-TIX via `getSymbols()` +
  `getOrganization()` — not yet captured (needs the $5b purchase). Symbol count in this
  fork also unverified until then.

### Positions
- **Long**: buy low sell high; limited downside, unlimited upside.
- **Short**: profit on decline; margin = sale proceeds + current stock value; **limited
  upside, unlimited downside — a deep-underwater short can drive money negative.**
  Locked outside BN8 without SF8.2 (see §1).
- The in-game doc's own headline warning: flat commission ⇒ **high-frequency trading is
  not a good strategy.**

### Order types (locked outside BN8 without SF8.3)
Market orders execute immediately. Limit/stop orders (via `placeOrder`) execute
conditionally:

| Order | Long | Short |
|---|---|---|
| Limit **buy** | price ≤ order | price ≥ order |
| Limit **sell** | price ≥ order | price ≤ order |
| Stop **buy** | price ≥ order | price ≤ order |
| Stop **sell** | price ≤ order | price ≥ order |

## 4. API reference — `ns.stock.*`

RAM costs from this build's `markdown/` docs. **Gate** = what must be owned before the
call works at runtime (RAM cost is static regardless).

| Method | RAM | Gate | Notes |
|---|---|---|---|
| `hasWseAccount()` / `hasTixApiAccess()` / `has4SData()` / `has4SDataTixApi()` | 0.05 ea | none | The four access flags. Verified callable with nothing owned. |
| `getConstants()` | 0 | none (verified live) | Returns `StockMarketConstants` (see below). |
| `getBonusTime()` | 0 | **TIX (verified live — throws without it)** | 0 GB ≠ no precondition, same trap class as the gang API. |
| `nextUpdate()` | 0 | TIX (assumed, untested) | `await` = sleep until next tick; the engine's main-loop primitive. |
| `getSymbols()` | 2 | TIX | All tradable symbols. |
| `getPrice(sym)` | 2 | doc says **WSE + TIX** (see open Q) | avg of bid/ask. |
| `getAskPrice(sym)` / `getBidPrice(sym)` | 2 ea | TIX (no WSE mentioned) | The real transaction prices. |
| `getOrganization(sym)` | 2 | doc says **WSE + TIX** (see open Q) | Company name behind a symbol — builds the server↔stock map. |
| `getMaxShares(sym)` | 2 | TIX | Long+short combined cap. |
| `getPosition(sym)` | 2 | TIX | `[sharesLong, avgLongPrice, sharesShort, avgShortPrice]`. |
| `getPurchaseCost(sym, n, pos)` / `getSaleGain(sym, n, pos)` | 2 ea | TIX | Include spread + commission + own price impact. |
| `buyStock(sym, n)` / `sellStock(sym, n)` | 2.5 ea | TIX | Market orders. Return execution price per share, 0 on failure. Sell of more than owned sells all. Sell profit is credited to the script's stats. |
| `buyShort(sym, n)` / `sellShort(sym, n)` | 2.5 ea | TIX + BN8-or-SF8.2 | Same return convention. |
| `placeOrder(sym, n, price, type, pos)` | 2.5 | TIX + BN8-or-SF8.3 | Limit/stop only. Boolean. |
| `cancelOrder(...)` (same args) | 2.5 | TIX + BN8-or-SF8.3 | void. |
| `getOrders()` | 2.5 | TIX + BN8-or-SF8.3 | `Record<sym, StockOrder[]>`; only symbols with live orders appear. |
| `purchaseWseAccount()` / `purchaseTixApi()` | 2.5 ea | money | True if bought or already owned. |
| `purchase4SMarketData()` | 2.5 | WSE + money | UI columns only. |
| `purchase4SMarketDataTixApi()` | 2.5 | TIX + money | Unlocks the two calls below. |
| `getForecast(sym)` | 2.5 | 4S TIX | P(rise next tick), 0–1. **The** trading signal. |
| `getVolatility(sym)` | 2.5 | 4S TIX | Max %-move per tick, 0–1. |

### Data structures & enums

- **`StockMarketConstants`** (from `getConstants()`, measured 2026-07-22):
  `msPerStockUpdate` 6000 · `msPerStockUpdateMin` 4000 · `TicksPerCycle` 75 ·
  `WseAccountCost` 200e6 · `TixApiCost` 5e9 · `MarketData4SCost` 1e9 ·
  `MarketDataTixApi4SCost` 25e9 · `StockMarketCommission` 100e3.
- **`StockOrder`**: `{ shares, price, type: OrderType, position: PositionType }`.
- **`PositionType`** (`ns.enums.PositionType`): `Long: "L"`, `Short: "S"`.
- **`OrderType`** (`ns.enums.OrderType`): `LimitBuy/LimitSell/StopBuy/StopSell` →
  `"Limit Buy Order"` etc.
- **Related surfaces elsewhere in `ns`:**
  - `BasicHGWOptions.stock?: boolean` — the hack/grow market-influence flag (§3).
  - `MoneySource.stock: number` — cumulative stock P/L in the money-sources breakdown
    (how an engine's lifetime profit gets audited).
  - `ns.dnet.promoteStock(sym)` — volatility pump (§3).

### Fork/gotcha notes

- **0 GB does not mean callable** — `getBonusTime()` throws without TIX (verified). Probe
  with `has*` flags first; assume `nextUpdate()` is gated the same way.
- **RAM identifier hygiene**: the analyzer bills property/variable *names* that match
  `ns` methods. `stock` itself is a 0 GB namespace so `{ stock: true }` literals are
  safe, but locals named e.g. `getPrice`/`buyStock`-style, or short names shadowing other
  `ns` methods, still trip it (see CLAUDE.md's rule; `ls`/`ps` class).
- The API-doc examples reference symbols like `FSIG`/`ECP`/`NVMD`/`SYSC` — fork's real
  list unverified until `getSymbols()` runs.

## 5. Engine design considerations (for the future brainstorm — not decisions)

- **Cost of entry for a scripted engine: $30b** (TIX $5b + 4S TIX $25b). At current gang
  income (~$10m/s ⇒ ~$36b/hr) that's under an hour of income; trivially affordable
  whenever a stock phase starts. WSE + 4S UI (+$1.2b) are optional but cheap
  observability for Kenneth's own screen.
- **Pre-4S operation is possible without buying anything extra**: forecast is P(up), so
  an observer can estimate it per-stock from tick up/down frequency over a window
  (`nextUpdate()` loop + price history). This is the standard prep for BN8, where 4S
  costs may be scaled. Expect estimates to lag real forecast flips by ~tens of ticks —
  the `TicksPerCycle`=75 regime length is what makes estimation workable at all.
- **Economics of a trade**: edge must clear flat $100k commission ×2 + spread + own price
  impact. Pushes toward few, large, long-held positions in high-|forecast| stocks —
  matching the in-game doc's anti-HFT warning.
- **Long-only reality (this save, non-BN8)**: only forecast > 0.5 stocks are tradeable;
  bear regimes are sit-out time. Roughly halves the exploitable signal vs BN8/SF8.2.
- **Batcher synergy**: workers already hammer servers with hack/grow; flipping
  `{ stock: true }` on targets that have stocks turns the batcher into a forecast bias
  the trader can front-run (grow-heavy prep pushes second-order forecast up while
  holding long). Zero extra RAM. Needs the server↔stock map (§3) and coordination so
  hack-phases don't fight held positions.
- **Capital custody vs the finance manager**: a stock engine parks money *outside* the
  cash balance that `resourcemanager`/`augfarmer` budget against. Reserved-money
  accounting, and the install-liquidation problem (§2), are the two integration points
  with the existing toolchain; both need explicit design, not defaults.
- **Loop shape**: `await ns.stock.nextUpdate()` (0 GB) beats `sleep(6000)` polling — tick
  alignment for free, and it stretches correctly under bonus-time 4s ticks.

## 6. Measured state (2026-07-22, BN2.1)

`logs/stockprobe-1784755786874.json` (`run stockprobe.js`, repeatable any time):
all four access flags `false`; constants as in §4. Player net worth at probe time
~$397b cash (fully reserved by augfarmer) — access is affordability-trivial but buying
it now serves no BN2.1 goal, so nothing was purchased.

## 7. Open questions (carry defaults, revisit when a stock phase opens)

1. **Do access flags survive an aug install in this fork?** Default assumption for
   planning: *yes* (vanilla behavior) but **unverified** — run `stockprobe.js` across the
   next install boundary (free to do: installs happen constantly in BN2.1, the probe
   needs no access). Cheapest possible resolution, worth doing opportunistically.
2. **Do open positions convert to cash on install, or vaporize?** No default — treat as
   *engine-blocking* until answered (testable only after TIX purchase, with a minimal
   position across a planned install).
3. **`getPrice`/`getOrganization` doc claim of needing WSE even via script** contradicts
   `purchaseTixApi`'s "TIX without WSE" note and every sibling call's docs. Test with TIX
   only (carried over from the 2026-07-04 notes; unresolvable until TIX is bought).
   Fallback either way: `getAskPrice`/`getBidPrice` carry no WSE claim and reconstruct
   price exactly.
4. **Symbol list / server↔stock map in this fork** — enumerate post-TIX
   (`getSymbols` × `getOrganization` × server list).

## 8. Further reading

- [`bitnodes.md`](bitnodes.md) — BN8's full multiplier table, SF8 grant ladder, per-node
  4S cost scaling (general reference; data was copied out, file stays authoritative for
  all nodes).
- [`darknet.md`](darknet.md) — `promoteStock` in its darknet context.
- [`batcher-engine.md`](batcher-engine.md) — the engine the `stock: true` flag piggybacks
  on.
- [`archive/stock-market.md`](archive/stock-market.md) — the retired 2026-07-04 notes
  this doc absorbed (kept for history; superseded in full).
- `markdown/bitburner.stock.md` + per-method files — raw API docs for this build.
