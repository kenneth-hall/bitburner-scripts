# `tools/bb` — drive the live game over CDP

Lets a shell (and Claude, via Bash) **see and operate the running Bitburner game** — read
the terminal/menus/tail windows, take screenshots, run terminal commands — by attaching to
the game's Chrome DevTools Protocol endpoint. No engine changes; it drives the front-end like
a human. Background: [`docs/game-bridge.md`](../../docs/game-bridge.md) (this is the
UI-automation path, distinct from the RFA file bridge).

## One-time setup

1. Steam → Bitburner → **Properties → Launch Options**: `%command% --remote-debugging-port=9222`
2. Launch the game. Verify: `curl http://localhost:9222/json/version` returns JSON.
3. Dep is already installed: `playwright-core` (devDependency). Uses the game's own Chromium
   over CDP, so no browser download.

The debug port is only open while the game runs, and only on `localhost` — don't expose 9222.

## Usage

```
node tools/bb/cli.mjs stats                 # character overview (money, hack, ...)
node tools/bb/cli.mjs terminal "home; scan" # run a terminal command, print its output
node tools/bb/cli.mjs read-tail daemon      # text of the "daemon" tail window
node tools/bb/cli.mjs aria                   # structured outline of clickable UI
node tools/bb/cli.mjs shot out/screen.png    # screenshot
```

`read-*` / `stats` / `aria` / `shot` are read-only. `terminal` and `goto` **drive your live
session** (navigate / type) — they move you off whatever screen you're on. Default to reads;
use writes deliberately.

## Design note

`driver.mjs` holds the connect boilerplate + game-aware helpers; `cli.mjs` is a thin dispatch.
This split is deliberate: the same helpers are what a future **MCP server** would wrap to
expose these as native Claude tools (usable without the Bash indirection). Build the MCP by
importing `driver.mjs`, not by rewriting it.
