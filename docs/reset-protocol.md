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
| Created/bought programs (TOR router, port-opener `.exe`s) | reset* | reset* |
| **In-game scripts (`.js` on home)** | **kept** ✅ | **kept** ✅ |
| **Installed augmentations** | **kept** ✅ | **lost** ❌ |
| **Source-Files** | — (not earned by installing) | **gained/kept** ✅ (permanent, all future BitNodes) |

\* **Correction 2026-07-14 (Phase 25 spec review):** earlier drafts lumped scripts and created
programs into one wiped row — wrong. **Scripts on home survive both reset types** (Kenneth
confirmed the install case 2026-07-14; the hard-reset case is demonstrated by this BN1.2 re-entry
running the same library) — which matters beyond convenience: it's what makes
`installAugmentations(cbScript)`-style post-install relaunch possible. (The git repo + dev-server
re-push would make a wipe recoverable anyway, but survival means recovery needs no re-push at
all.) What *does* reset every cycle is this row: **TOR router + the five port openers**
(BruteSSH.exe, FTPCrack.exe, relaySMTP.exe, HTTPWorm.exe, SQLInject.exe) — `procureprograms.js`
re-buys the whole ladder every cycle (top spend priority). Faction reachability stages with
opener acquisition, since the openers gate the backdoor half of the faction-unlock sequence.
See [[reference_install_resets_programs_tor]].

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

## ⚠️ The two reset consequences that keep breaking the endgame plan

Both are in the table above, but as bare rows they get read past; the *derived plans* (handoff,
runbook, reputation-favor) have twice been written as if these didn't apply. Read them as rules, not
trivia. Both are **live-verified in this build's BN1, 2026-07-11** — don't re-assert from stock memory.

1. **Money → ~$1k on install.** Not just the fleet — your whole cash balance. So a big accumulated
   pile is **not** spendable on the post-install donation; the donation must be funded by money earned
   *after* the install. (Corollary: spend down into what survives — home RAM/cores — *before* clicking
   Install. See "Before a soft reset" below.) Verified: $1.745q → ~$1k on install #1. Detail +
   consequence: [[reference_install_resets_money]].

2. **You are removed from EVERY faction on install** — membership, not just rep. Favor is banked
   (persists), but you are no longer *in* the faction, so you **cannot donate to it, buy its augs, or
   work for it until you re-earn its invitation and re-join.** For Daedalus that means the invite gates
   apply again: **≥30 augs ✅ and ≥$100b ✅ persist, but hacking resets to ~1, so you must re-climb to
   2500 to get re-invited, accept, and only THEN can you donate** (favor is already ≥150, so donation
   unlocks the instant you rejoin). Verified after install #1: the Factions page read *"You have not yet
   joined any Factions,"* and Daedalus was absent even from the Rumors list, at hacking ~1,950.
   Consequence for the plan: [[reference_install_resets_faction_membership]].

**Net rule for the BN1 endgame:** every augmentation install inserts a **full hacking re-climb before
you can act on that faction again.** The mult-install → donate → buy → Red-Pill-install sequence
therefore contains **two** re-climbs, not zero: one to 2500 (to rejoin Daedalus after the mult install),
one to 3000 (to backdoor `w0r1d_d43m0n` after the Red-Pill install). Money is never the endgame gate;
the re-climbs are.

## Before a soft reset (install): spend down while rich — FIRST STEP

Money resets to ~$1k on install, but **home RAM & cores persist** (see table). So the moment you're
richest — right before installing — is the *only* good time to buy expensive permanent home upgrades.
Do this **first**, before clicking Install:

**Automated (Phase 25, auto mode only):** `installer.js`'s spend-down sequence implements exactly
these two steps in this order — max home RAM, then max home cores, then the install call — before
ever touching `installAugmentations`. `augfarmer.js`'s own spend-down phase (run immediately before
handing off to `installer.js`) finishes the queued aug buy-list first, including lifting the
one-NFG-per-cycle cap so the money-capped NFG tail described below gets bought out. Manual runs still
follow the checklist below by hand.
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

## Core rule: auto-UNLOCK always; auto-JOIN and (bounded, mode-gated) auto-INSTALL within a
## D11-authorized scope

- **Unlock** = make a faction's invitation *available*. For backdoor factions that means: root the
  server, then install its backdoor — the invite then appears on the Factions screen. This half is
  `backdoorfactions.js` (Phase 22) — roots + backdoors the four hacking-faction servers and **never**
  joins (its own hard rail, `joinFaction` doesn't appear in that file).
- **Historical rule (superseded 2026-07-13, Phase 23):** this doc used to say "never auto-join" full
  stop, because nothing enforced the mutually-exclusive-city-faction exclusion except Kenneth's own
  judgment. That's no longer true — **Kenneth has durably authorized `augfarmer.js` to auto-join and
  auto-buy unattended**, bounded to a 13-name `FACTION_SCOPE` allow-list (the four backdoor factions +
  Tian Di Hui + the six city factions + Daedalus/The Covenant/Illuminati "as they unlock"), with the
  exclusion now enforced *in code*: a live-read enemy-graph guard (`campBlocked`) skips joining any
  city faction whose enemy is already joined this cycle, replacing the manual stand-in this rule used
  to require.
- **Install rail — REVERSED 2026-07-14 (Phase 25), narrowed not removed.** Phase 23's rule here used
  to read "install stays 100% manual — `augfarmer.js` never calls `installAugmentations`," asserted by
  a hard `grep -r installAugmentations src/` rail. Kenneth authorized lifting that this session
  (`phase-25-faction-strategy.features.md`'s F4), conditioned on comprehensive per-install logging
  existing first (Slice 0, `ratchetlog.js`, shipped before the controller). The bounded authorization,
  verbatim from the phase-25 spec: **default is observe mode — no install, no spend-down, ever.**
  `auto` mode is Kenneth writing the literal string `auto` into `ratchet-mode.txt` by hand, in-game —
  no code change flips it, and any other file content (including missing) means observe. The
  `installAugmentations` call itself is isolated to exactly one file, `installer.js`, exec'd from
  exactly one site (`augfarmer.js`'s auto-mode branch), reachable only when the mode file reads
  `auto` — so the always-on farmer cannot install even if its trigger logic is buggy in observe mode.
  The trigger that decides *when* to fire is guarded by a queued-augs-plus-affordable-NFG gain floor,
  a minimum queued count, a 10-minute sustain window, and an endgame hold (`joined(Daedalus) ||
  hacking >= 2500`) that hands off to the manual Daedalus runbook below untouched. Every fire is
  logged to `ratchet-decisions.json` beside `ratchet-log.json`'s per-install audit trail. Full design:
  `docs/phases/phase-25-faction-strategy.spec.md`.
- **The endgame count-gate install — automated 2026-07-18 (Phase 26 A2), same bounded
  authorization.** The endgame hold above still means "stop ratcheting, go for Daedalus," but when
  the *only* thing blocking an in-scope faction (Daedalus, or The Covenant/Illuminati by the same
  shape) is an aug count that already-queued purchases would close on install, holding was exactly
  wrong — a live BN1.3 deadlock at 29/30 augs proved the trigger could never fire on its own. The
  trigger, not the hold, learned one exception: it also arms when the queued augs would close a
  faction's count gate (`gateArmed`, guarded by `closedByQueue` so an install that would not
  actually move the gate can never fire this way), independent of `endgameHold` and the usual
  multiplier-gain floor. The manual Daedalus runbook below remains the fallback for every other
  case — this only closes the one circular deadlock the ratchet couldn't otherwise escape.
- **What this retires:** Phase 22's grep-for-`joinFaction` rail (asserting `joinFaction` appears
  nowhere in `src/`) is retired — `augfarmer.js` is now the one script authorized to call it. The
  replacement rail is two-part: `joinFaction` calls exist only in `augfarmer.js`, and every join site
  there routes through the `FACTION_SCOPE` check (both grep/test-checked, see the phase's acceptance
  criteria). Phase 25 retires the *install* rail the same way: `installAugmentations` calls exist only
  in `installer.js`, gated by `ratchet-mode.txt` reading exactly `auto`.
- Anything **outside** `FACTION_SCOPE` (megacorps, crime/gang factions, Netburners) is still entirely
  manual — no script joins those.

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

## The BN1 endgame checklist (run this every clear)

Destroying BN1 wipes augs/rep/favor/money/fleet/home-RAM — only Source-Files + scripts + a sliver
of Intelligence carry over. So **every** BN1 clear re-pays the full Daedalus endgame from scratch;
this is the ordered playbook, distilled from clear #1's hard-won corrections. The **dominant cost is
the rep grind**, not money and not the XP climbs — sequence around unlocking the donation shortcut
early. The faction-join order + per-cycle hacking-aug buy-list this references lives in
[`bn1-install-plan.md`](./bn1-install-plan.md).

1. **Bootstrap + climb to 2500.** Let `bootstrap.js`/`daemon.js` rebuild the fleet; climb hacking to
   2500 to trigger the Daedalus invite (needs augs ≥30 ✅ persist? **no** — augs are wiped on a hard
   reset, so re-buy ≥30 augs this run too; money ≥$100b; hacking ≥2500). You carry **SF1.1's +16%**
   on both level- and exp-mult now, so this climb is faster than clear #1's.
2. **Join Daedalus.** Backdoor `The-Cave` (hack 925) is necessary-but-not-sufficient; the invite
   appears once all three gates (augs/money/2500) are met. `run fl1ght.exe` is the SF-free live check.
3. **Bank 150 favor via one install.** Grind only ~465k Daedalus rep (≈150 favor, ~1/5 of 2.5m), buy
   this cycle's hacking-mult augs + a deep NFG stack, then **install**. This is the mult-raising
   install — it also unlocks donation permanently (favor persists across installs).
   - ⚠️ The install drops you out of Daedalus (membership, not just rep) **and** zeroes money to ~$1k.
     So after it you must **re-climb to 2500 to rejoin** and **re-earn ~$1.5t** before you can donate.
     See [[reference_install_resets_faction_membership]], [[reference_install_resets_money]].
   - Before clicking Install: **max home RAM/cores** (persist) and finish the whole aug buy-list first
     (prices reset on install, so batch them) — see "Before a soft reset" above.
4. **Rejoin → donate → buy Red Pill.** Re-climb 2500, rejoin Daedalus, earn ~$1.5t, **donate** (150
   favor makes 2.5m rep cost ≤~$1.5t; donate more to also fund NFG), then buy **The Red Pill** (2.5m
   rep / $0) plus any remaining augs.
5. **Install Red Pill (2nd install) → re-climb 3000 → backdoor WD.** Keep installs 3 and 5
   back-to-back where possible so only one 3000 re-climb is paid. Then walk the network to
   `w0r1d_d43m0n` and run the manual terminal `backdoor` (hack 3000, no Singularity needed) to finish
   the node.

**Two re-climbs, not zero** (2500 to rejoin after the mult install; 3000 to backdoor after the Red
Pill install) — no ordering avoids the 2500 climb, because donating requires membership.
**Mult is the only lever for 3000:** `level = mult × (32·ln(exp) − 200)`, so raw grinding can't reach
3000 at low mult — raising the multiplier via the install is what collapses the XP wall. NFG stacking
is **money-capped** (~1.9×/aug price escalation → ~17–18 NFG levels/install), so watch the mult live
before committing to the Red Pill install; if it lands below ~5.5–6, add another NFG-only cycle.

**The one non-node-locked rep accelerator worth a look:** coding contracts can award *"reputation with
one specific faction"* or *"reputation with every faction you've joined"* (Phase 19). Once you're in
Daedalus, that's free rep toward the grind — but targetability/rate are unverified; test then, not now.

## Netburners — Hacknet-gated, no server

**Not** a backdoor faction; there is no Netburners server. It's gated on **Hacknet** progress — the
API confirms the requirement categories (`HacknetLevelsRequirement` / RAM / cores, "must have at
least this many total levels"), but the specific Netburners thresholds are **not** in `markdown/`
(only the FactionName enum mentions it) and would need SF4's `getFactionInviteRequirements` or
in-game discovery — don't fabricate them. Practical unlock: buy a Hacknet node and level it until the
invite appears (cheap; Hacknet isn't worth it for income, but the unlock is trivial).

## Automation status

Built, in three pieces (see "Core rule" above): **`backdoorfactions.js`** (Phase 22) roots + backdoors
the four hacking-faction servers post-reset, never joins. **`augfarmer.js`** (Phase 23, upgraded
Phase 25) proactively joins every reachable camp-allowed scope faction, targets augs by mult-per-rep
score, allocates the single work slot around passive-rep factions, donates once a faction's favor
clears the threshold, and evaluates the install trigger every pass — logging "would install now" in
observe mode (the default) or, in auto mode only, running the spend-down + `installer.js` handoff.
**`installer.js`** (Phase 25, new) is the one script authorized to call `installAugmentations` — maxes
home RAM/cores, then installs with `bootstrap.js` as the post-reset callback. All three are always-on
(or exec'd-once, for `installer.js`) Singularity companions launched by `daemon.js`/`augfarmer.js`.
Netburners and Daedalus's non-backdoor gates (money/hacking-skill/aug-count thresholds) are out of
scope for all three — no server to backdoor, and those thresholds are things Kenneth accrues through
normal play, not something any of these scripts drive directly. Daedalus's donate→Red-Pill→backdoor-WD
endgame stays the manual runbook above — Phase 25's endgame hold (`joined(Daedalus) || hacking >=
2500`) explicitly refuses to arm the trigger once that runbook starts.
