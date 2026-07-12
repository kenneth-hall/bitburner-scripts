# Stock market — mechanics reference

Mechanics straightened out for a future design pass — **no architecture decided, no code
written.** This is a reference to design against later, not a spec. If/when stock work
becomes real, it gets its own backlog idea + phase docs.

Current save state (as of 2026-07-04): TIX API access purchased, no WSE account, no 4S data
(matches the `bitburner_stock_market_progress` memory).

## Two independent access doors, not a read/write split
WSE account gates *manual* trading via the in-game Stock Market UI; TIX API access gates
*scripted* trading via `ns.stock`. Each door covers both reading and trading for its own
method — it's method (UI vs script) that's gated, not action (read vs buy/sell). You can hold
either without the other, which is why scripted trading should already work despite no WSE
account.

## 4S Market Data is a premium add-on on top of whichever method you use
`getForecast`/`getVolatility` return per-stock probability-of-rise and max per-tick swing —
the actual trading edge. Gated by its own purchase: `purchase4SMarketDataTixApi()` for scripts
(needs TIX API access, not WSE — a money gate, affordable now) vs. `purchase4SMarketData()`
for the UI (needs WSE account). Separate from the base read/trade doors above.

## Progression-locked, not purchasable at all yet
`placeOrder`/`cancelOrder`/`getOrders` (limit/stop orders) and `buyShort`/`sellShort` (short
selling) — their docs say "unlocked later in the game," no purchase function exists for them.

## Doc inconsistency flagged, not yet resolved empirically
`getPrice()` and `getOrganization()`'s docs list "WSE Account" as a requirement even for the
scripted call, which contradicts `purchaseTixApi()`'s own doc ("you can buy TIX API access
without a WSE account") and the fact that other read/trade calls (`getSymbols`, `buyStock`,
`sellStock`, etc.) don't mention any WSE requirement. Worth testing directly in-game (e.g.
`ns.stock.getPrice(ns.stock.getSymbols()[0])`) next time stock market work picks up, since it
decides whether scripted reads already work today.
