# Reset protocol — augment install & new BitNode bootstrap

When you install augmentations (a soft reset) or enter a new BitNode, hacking level, faction
membership, and faction rep reset — you re-earn progression from scratch. This is the playbook for
getting back to where we were, focused on the **faction-unlock sequence** and its gates. Living
doc — expand as we learn. (The *economic* rebuild — money/RAM/batcher — is handled by the existing
`bootstrap.js` / `daemon.js` + companions, not this doc.)

## Soft reset vs. hard reset — what actually persists

Two different "resets," and they keep different things. This matters because it decides what you're
bootstrapping *from*:

| | **Install augmentations** (soft reset) | **Enter a new BitNode** (hard reset) |
|---|---|---|
| Money, purchased servers | reset | reset |
| **Home RAM & cores** | **kept** ✅ | reset ❌ |
| Skills + XP (hacking, combat, etc.) | reset | reset |
| Faction membership & rep | reset | reset |
| Created programs, in-game scripts | reset* | reset* |
| **Installed augmentations** | **kept** ✅ | **lost** ❌ |
| **Source-Files** | — (not earned by installing) | **gained/kept** ✅ (permanent, all future BitNodes) |

\* In-game copies are wiped, but our scripts survive in the git repo and re-push via the dev server,
so a rebuild is instant.

- **Soft reset** (this doc's usual case): keeps your augmentations — that's the whole point — and
  loses everything else above. You re-run the faction-unlock sequence below to re-buy the *next*
  batch of augs.
- **Hard reset** (destroying / entering a new BitNode): also wipes **installed augmentations**, so
  you start the aug ladder from zero. What you carry forward is **Source-Files** — permanent
  multipliers that apply in every future BitNode (e.g. SF4 = Singularity, the API we keep hitting as
  unavailable). A sliver of the **Intelligence** stat is believed to persist too (unconfirmed — don't
  bank on it). So a hard reset isn't "start equal to run 1" — it's start-over-with-a-permanent-tailwind.
- **Implication for this playbook:** after a *soft* reset you keep augs, so the goal is just faction
  re-unlock. After a *hard* reset you also re-climb the aug count — relevant because Daedalus gates on
  **≥30 installed augs** (see below), and a fresh BitNode is also the only way to reach zero augs, which
  is what **Stanek's Gift** requires (Church of the Machine God accepts only aug-free players).

## Before a soft reset (install): spend down while rich — FIRST STEP

Money resets to ~$1k on install, but **home RAM & cores persist** (see table). So the moment you're
richest — right before installing — is the *only* good time to buy expensive permanent home upgrades.
Do this **first**, before clicking Install:
1. **Max out home RAM and cores you can afford.** They carry through the install; your money won't.
   (Home RAM has only a handful of tiers, so this is quick and may already be near-capped.)
2. **Buy every augmentation you intend to take this cycle first** — the price of each queued aug rises
   with each one already queued, but they all reset on install, so batching the purchases in one cycle
   is fine; just don't install until the buy list is complete.
3. *Then* install. Everything else (money, servers, skills, rep) is about to reset anyway, so there's
   no downside to draining the balance into what survives.

Why it matters for the current goal: installing is the **fast path** to the hacking-2500 Daedalus gate,
not a setback — activating queued hacking-multiplier augs cuts the XP wall super-linearly (a level-mult
bump of 3.55×→3.83× cut the XP-to-2500 ~5× in the 2026-07-11 measurement), so the reset-to-zero re-climb
reaches *higher* than grinding the un-installed run ever would. Don't hoard levels; install to raise the
multiplier, then re-climb.

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

Backdooring `The-Cave` alone will **not** invite you. The authoritative, SF-free check is
**`run fl1ght.exe`** on `home` — the game prints a live checklist of Daedalus's gates for the
current BitNode (its own hint, so these numbers are confirmed, not guessed):

- **Installed augmentations ≥ 30** (`BitNodeMultipliers.DaedalusAugsRequirement` scales this per BitNode).
- **Money ≥ $100b** (`MoneyRequirement`).
- **Hacking skill ≥ 2500** — OR all combat stats ≥ 1500 (`SkillsRequirement`; `fl1ght.exe` tracks the hacking path).

**Status 2026-07-10 (`run fl1ght.exe`):** augmentations **39/30 ✅**, money **✅** (trillions vs $100b),
hacking **~1567/2500 ❌**. So **hacking skill is the only remaining gate** — combat stats are 1, so the
2500-hacking path is the route. (`ns.singularity.getFactionInviteRequirements("Daedalus")` would also
report this, but needs SF4 we don't have; `fl1ght.exe` is the SF-free equivalent.)

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
