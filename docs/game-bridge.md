# Game ↔ repo bridge: how anything reaches the game engine

The single architectural fact under the dev server, the logging conventions, and any future
"talk to the game" tooling (e.g. an MCP server): **Bitburner is a sandbox that speaks only
files to the outside world, and only the host can pull them.** Everything below follows from
that.

## The one external channel: the Remote File API (RFA)

Bitburner exposes exactly one programmatic channel to the outside: the **Remote API** — a
WebSocket that the *game* opens outward to a server you run (`npm run dev` / viteburner hosts
it on port `12525`). Its method set is **file-oriented**: get / push / delete / list files,
plus `calculateRam` and `getDefinitionFile`. The authoritative list lives in Bitburner's
Remote API docs — the point here is what it does *not* have: **there is no "eval this" or
"give me the player object" method, and you can't add one** (the game side of the protocol is
fixed).

## Egress is the bottleneck (game → outside)

In-game scripts cannot open sockets or `fetch`. So the **only** way state leaves the game is:
a script writes a file, and the RFA host **pulls** it (request/response, host-initiated).
There is no push channel from the game back to the host — confirmed in our own
`vite.config.ts` (the `autoExportDaemonLog` plugin polls on a 10s timer *because* the game
can't push). This is why:

- exported logs (`logs/*.json`) are how script results get read back, not terminal paste;
- a stale RFA socket silently starves those logs with no error (see `dev-server.md`);
- anything wanting *live* state has to have an in-game script already running that reads
  `ns` and writes it out — the host can't reach in and ask.

## Ingress has two paths (outside → game)

1. **RFA `pushFile`** — what viteburner uses to sync `src/**` into the game on every
   working-tree change.
2. **`ns.wget(url, target)`** — a script pulls a file from an HTTP URL you serve (0 GB RAM,
   `.js`/`.txt`/`.json` only, CORS-limited). A second way *in*, but it does not change the
   egress bottleneck above.

Manual/human channels (the in-game terminal; the browser devtools console) exist but are not
automation channels — and poking the React/engine internals via devtools is source-diving,
which this project doesn't do.

## Corollary: any "richer" tooling needs an in-game actor

Because the RFA can only move files, **anything beyond file sync requires a script running
inside the game** that does the actual `ns` work and communicates via files. An MCP server,
for example, could not reach into the engine directly — it would push command files (RFA or
`wget`), an always-on in-game bridge script would execute them and write response files, and
the MCP server would pull those responses. The round-trip is always file-mediated; the only
latency lever is that the *host* can pull on demand rather than waiting on a passive timer.
(Recent Bitburner reportedly allows multiple simultaneous RFA connections, which would let
such a server coexist with viteburner on a second port — **verify against the installed game
version before relying on it.**)

## A separate front-end path: UI automation over CDP

Everything above is about the **running game's engine channel** (the RFA), and its "egress is
files-only" rule still holds there. But there's a distinct path that doesn't touch the engine
at all: because the game is an Electron/Chromium app, launching it with
`--remote-debugging-port=9222` exposes the Chrome DevTools Protocol, and a browser-automation
driver (Playwright over CDP) can then **read the rendered DOM and drive the UI like a human** —
terminal text, menus, tail-window contents, screenshots, clicks, keystrokes. This is *not* an
engine RPC (it sees the front-end, not `Player`/engine internals) and needs no game-side code.
Confirmed working on the Steam build (Bitburner v3.0.1). Toolkit + setup:
[`tools/bb/README.md`](../tools/bb/README.md).

See also: [dev-server.md](dev-server.md) (operating the RFA connection; stale-socket
workaround) · [logging.md](logging.md) (the file conventions egress rides on) ·
[`tools/bb/README.md`](../tools/bb/README.md) (the CDP UI-automation driver).
