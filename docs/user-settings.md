# In-game settings state (Kenneth's non-default toggles)

Tracks the in-game **Options** settings Kenneth has changed from default **that alter what
Claude should expect or do** — not every toggle, just the behavior-relevant ones. Read this
before assuming a popup will appear, or before telling Kenneth to "watch for" an in-game
notification: a suppressed thing won't interrupt him, so the plan has to poll for it instead.

**Keep this file accurate — it's only useful if it matches the live game.** Update the entry
(and its date) whenever a setting here is flipped. State is *user-reported* unless a line says
it was verified via CDP.

## Suppress Messages — **ON** (user-reported, 2026-07-12)

Governs the `.msg` story/lore messages. With it on:
- **No popup and no terminal notification** when a message fires — arrival is *silent*.
- **The content is never lost.** The `.msg` file still lands on `home` every time; `cat` it
  whenever. So suppressing costs only the *notification*, not the *message*.
- **Implication for Claude:** don't expect message popups, and don't tell Kenneth to watch for
  one. To catch new story messages, diff `ns.ls("home", ".msg")` against a known set (or just
  `ls home`) — see the "in-game notifier" idea below.

## Suppress Faction Invitations — **ON** (user-reported, 2026-07-13)

A *separate* setting from Suppress Messages — it governs new-**faction** invite popups. Now on,
so a new invite no longer pops up or blocks the UI. Nothing is lost either way: outstanding
invites always persist on the **Factions** page (and via `checkFactionInvitations()`), and
`augfarmer.js` (Phase 23) already drives joins off that API, not the popup — so this toggle has
**no effect on the farmer's behavior**, only on what Kenneth sees manually. Implication for
Claude: don't expect an invite popup as a signal that a faction became reachable; read
`augfarmer-state.json` / `augfarmer-catalog.json` or the Factions page instead.

## Netscript log size — **200** (was the 50 default; changed 2026-08-10, verified via CDP)

Options → *Netscript log size*. Caps how many log entries **each script's tail window** retains;
past the cap it evicts the **oldest**, so a script printing more than the cap silently loses the
**top** of its output — no scroll, no wrap, no warning.

**Why it was raised.** At the default **50**, `dashboard.js` emitted 54 lines per render, so the
first 4 were evicted every cycle — which happened to be the entire top of the GOAL panel: its
title, the `rank .../400.00k (Op Daedalus)` win-condition line, and `goalposts:`. The single most
important readout in the window was invisible for weeks, and the symptom was misfiled as a
sizing/no-scroll bug ("`ROW_BUDGET` is 63 but only ~42 rows surface"). It was never sizing: the
window had ~478px of unused space the whole time, because the tail **bottom-anchors** its content.

**Implications for Claude:**
- **`dashboard.js`'s `ROW_BUDGET` (63) is only valid while this setting is ≥ ~63.** On a fresh
  install, another machine, or a settings reset, the default 50 silently truncates the GOAL panel
  again. `src/dashboard.js` carries `TAIL_LOG_SIZE_ASSUMED = 200` as the paired assumption.
- **The tell:** the top of the dashboard is missing and there is blank space above the content.
  Check this setting *first* — do not re-diagnose it as a wrap/height problem.
- It applies to **every** script's tail, not just the dashboard, so any long-printing script
  benefits. Cost is memory per script; 200 is modest and Kenneth has said he is willing to go
  higher if a future panel needs it.

## Related idea (not yet built)

Because Suppress Messages makes new `.msg` arrive silently, the clean replacement for the CDP
story-popup auto-dismisser is a small daemon-companion **notifier**: diff `ns.ls("home",".msg")`
for new files and check `ns.singularity.checkFactionInvitations()` (SF4 — we have it; verify the
exact name in `markdown/` before building), then print/log a quiet terminal line instead of a
blocking modal. Turns "suppressed = silent" back into "suppressed = non-blocking heads-up."
