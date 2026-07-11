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
node tools/bb/cli.mjs restart cloudmanager.js # kill + close orphaned tail + relaunch
node tools/bb/cli.mjs close-tail cloudmanager.js # close a stray/orphaned tail window
node tools/bb/cli.mjs dismiss                 # close a blocking error/dialog modal
node tools/bb/cli.mjs read-tail daemon      # text of the "daemon" tail window
node tools/bb/cli.mjs aria                   # structured outline of clickable UI
node tools/bb/cli.mjs locations              # names of every location on the open City map
node tools/bb/cli.mjs location "Central Intelligence Agency" # open a City-map location by name
node tools/bb/cli.mjs shot out/screen.png    # screenshot
```

`read-*` / `stats` / `aria` / `locations` / `shot` are read-only. `terminal`, `goto`, `location`,
`restart`, and `close-tail` **drive your live session** (navigate / type / kill / relaunch) — they
move you off whatever screen you're on. Default to reads; use writes deliberately.

**City-map navigation.** The map markers render as bare glyphs (`G`/`?`/`$`) with no role and no
visible name, so `goto`/`click`-by-text can't reach them — but each carries an `aria-label` with
the real location name. `location "<name>"` clicks by that aria-label (stable across resolutions,
unlike screenshot coordinates); run `locations` first to get exact spellings for the open city.

`restart` exists because Bitburner leaves a killed script's tail window open (an orphan that
reverts to the filename title); `restart` closes it between kill and relaunch so repeated
restarts don't pile up stray popups. `tailmanager.js` then re-docks the fresh window.

**Gotcha — error modals block navigation.** A script runtime error (or any Bitburner dialog)
pops a modal that overlays the whole UI and intercepts clicks, so `goto`/`click`/`restart` time
out with `waiting for getByRole('button', { name: 'Terminal' })`. Reads (`read-terminal`, `body`,
`read-tail`, `shot`) still work through it — so read the modal's text to get the error, then
`dismiss` it. `runCommand` now auto-`dismiss`es before navigating, so `terminal`/`restart`
self-heal; a bare `goto`/`click` still needs a manual `dismiss` first if a modal is up.

## Design note

`driver.mjs` holds the connect boilerplate + game-aware helpers; `cli.mjs` is a thin dispatch.
This split is deliberate: the same helpers are what a future **MCP server** would wrap to
expose these as native Claude tools (usable without the Bash indirection). Build the MCP by
importing `driver.mjs`, not by rewriting it.
