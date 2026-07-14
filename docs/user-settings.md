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

## Related idea (not yet built)

Because Suppress Messages makes new `.msg` arrive silently, the clean replacement for the CDP
story-popup auto-dismisser is a small daemon-companion **notifier**: diff `ns.ls("home",".msg")`
for new files and check `ns.singularity.checkFactionInvitations()` (SF4 — we have it; verify the
exact name in `markdown/` before building), then print/log a quiet terminal line instead of a
blocking modal. Turns "suppressed = silent" back into "suppressed = non-blocking heads-up."
