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
node tools/bb/cli.mjs dismiss                 # close a blocking error modal or story popup
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
restarts don't pile up stray popups. Since Phase 24, every companion is headless (nothing to
re-dock) except `dashboard.js`, the single standing tail, which self-closes via `ns.atExit`.

**Gotcha — error modals and story popups block navigation.** A script runtime error (any
Bitburner dialog) or a narrative toast (faction-recruit text, "Message received" notifications)
overlays the whole UI and intercepts clicks, so `goto`/`click`/`restart` time out with `waiting
for getByRole('button', { name: 'Terminal' })`. Reads (`read-terminal`, `body`, `read-tail`,
`shot`) still work through it. `goto` (and therefore `terminal`/`restart`, which call it)
auto-dismisses both kinds before navigating, so this self-heals without a separate step — a bare
`click`-by-text is the one path that still needs a manual `dismiss` first if something's up.

**Gotcha — native OS dialogs are invisible, and clicking their trigger strands the game.**
CDP attaches to the game's *renderer*; a Windows file picker is not in the DOM. **Backup Save /
Export Game / Import Game open a native picker that Claude cannot see, fill, or cancel** — and
clicking one leaves a modal dialog blocking the whole game with no way to clear it from here.
Taking or restoring a save is **Kenneth's step**; ask, don't click. (The same reasoning says
prefer clicking a button over sending an accelerator like Ctrl+S: if the app didn't capture the
keystroke, Electron may raise a native dialog with the same result.)

**Gotcha — accessible name ≠ visible text when `aria-label` is set.** The script editor's Save
button reads "Save" on screen but carries `aria-label="Ctrl + S or ⊞ + S"`, which *overrides*
its accessible name — so `getByRole('button', {name: 'Save'})` times out forever. `aria` output
shows the accessible name, so a button can be plainly visible and still unreachable by the name
you can see. When a by-name click times out on an element that obviously exists, dump the
element's `aria-label` before assuming the click is blocked; match on visible text
(`page.locator('button').filter({ hasText: /^Save$/ })`) instead.

**Gotcha — `cat <file>.txt` prints nothing.** In this build `cat` on a `.txt` produces *no
terminal output at all* — no error, no modal, no content, even when the file exists and is
non-empty. It is indistinguishable from an empty file and will send you chasing a phantom
write bug (it did, 2026-07-17). To prove a file exists use `ls --grep <name>`; to prove its
*content*, read the consuming script's own exported state rather than the terminal.

Error modals close via a named "Close" button (`dismissModal`). Story popups have no such
button — the whole toast is one nameless click-to-dismiss surface — so they're detected by shape
instead (`dismissStoryPopup`): it only fires when the *entire* accessible tree is exactly one
nameless button plus narrative text, nothing else. A real confirm/buy/install dialog always
exposes multiple/named controls, and a normal game screen always has named nav buttons, so
neither ever collapses to that shape — the detector can't misfire onto a consequential click.

## Design note

`driver.mjs` holds the connect boilerplate + game-aware helpers; `cli.mjs` is a thin dispatch.
This split is deliberate: the same helpers are what a future **MCP server** would wrap to
expose these as native Claude tools (usable without the Bash indirection). Build the MCP by
importing `driver.mjs`, not by rewriting it.
