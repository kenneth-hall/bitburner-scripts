# Augment-install / reset bootstrap protocol

When you install augmentations (a soft reset) or enter a new BitNode, hacking level, faction
membership, and faction rep reset — you re-earn progression from scratch. This is the playbook for
getting back to where we were, focused on the **faction-unlock sequence** and its gates. Living
doc — expand as we learn. (The *economic* rebuild — money/RAM/batcher — is handled by the existing
`bootstrap.js` / `daemon.js` + companions, not this doc.)

## Core rule: auto-UNLOCK, never auto-JOIN

- **Unlock** = make a faction's invitation *available*. For backdoor factions that means: root the
  server, then install its backdoor — the invite then appears on the Factions screen.
- **Do NOT auto-join** (don't click "Join!"). Joining can permanently **lock you out of
  mutually-exclusive factions you still need augmentations from** (the city factions are mutually
  exclusive; some faction pairs are enemies). Kenneth decides which invites to actually accept.
- So any automation here roots + backdoors the eligible faction servers and **stops** — leaving
  every join decision manual. This is the BACKLOG item *"Post-reset auto-backdoor for joinable
  factions"* (must: backdoor only, never `joinFaction`; re-check state each run; be idempotent).

## Backdoor-unlocked factions

Installing the backdoor on these servers surfaces the faction invite. Required hacking levels are
from `serverlist.js`'s scan (re-run it anytime to refresh: `node tools/bb/cli.mjs terminal "run serverlist.js"`).
They're the `$0`-money "special" servers.

| Server | Faction | Req hack lvl | Notes |
|---|---|---|---|
| `CSEC` | CyberSec | 55 | |
| `avmnite-02h` | NiteSec | 210 | |
| `I.I.I.I` | The Black Hand | 351 | |
| `run4theh111z` | BitRunners | 542 | |
| `The-Cave` | Daedalus | 925 | backdoor is **necessary but not sufficient** — see gates below |

## Daedalus — extra gates beyond the backdoor

Backdooring `The-Cave` alone will **not** invite you. What the **API actually documents** (gate
*types* only) — and what it does **not**:

- **Installed augmentations ≥ a threshold.** Confirmed by `BitNodeMultipliers.DaedalusAugsRequirement`
  ("influences how many Augmentations you need to get invited to Daedalus") — so the count is
  **BitNode-modifiable**. The API does **not** state the base number.
- **Money ≥ a threshold** (`MoneyRequirement` type exists). Amount not published.
- **Skills ≥ a threshold** (`SkillsRequirement` type — a hacking OR combat gate). Values not published.

The widely-known vanilla values are roughly **30 installed augs, ~$100b, and 2500 hacking OR 1500 in
each combat stat** — but these are **NOT from an allowed source** (not in `markdown/`), are
BitNode-modifiable, and should be treated as indicative only. Authoritative check:
`ns.singularity.getFactionInviteRequirements("Daedalus")` — but that needs **SF4**, which we don't
have, so confirm in-game instead.

## Netburners — Hacknet-gated, no server

**Not** a backdoor faction; there is no Netburners server. It's gated on **Hacknet** progress — the
API confirms the requirement categories (`HacknetLevelsRequirement` / RAM / cores, "must have at
least this many total levels"), but the specific Netburners thresholds are **not** in `markdown/`
(only the FactionName enum mentions it) and would need SF4's `getFactionInviteRequirements` or
in-game discovery — don't fabricate them. Practical unlock: buy a Hacknet node and level it until the
invite appears (cheap; Hacknet isn't worth it for income, but the unlock is trivial).

## Automation status

Not built yet. When built, the auto-unlock companion roots + backdoors the eligible faction servers
post-reset and never joins. Netburners and Daedalus's non-backdoor gates are out of its scope (no
server / needs money+stats+augs Kenneth accrues through normal play).
