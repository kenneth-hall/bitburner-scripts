> **⚠️ ARCHIVED 2026-07-22 — BN1 was cleared 2026-07-15/18; this is a frozen status snapshot, not
> a live playbook. Its batcher-vs-xpfarm distinction was superseded/consolidated into
> [`docs/batcher-engine.md`](../batcher-engine.md) §2. Kept here verbatim for history.**

# BN1 handoff — finishing BitNode 1

**Start here to resume the endgame.** Consolidates the live state, the verified mechanics, and
the locked sequence. Full click-by-click is [endgame-runbook.md](../endgame-runbook.md); mechanics +
numbers are [reputation-favor.md](../reputation-favor.md); reasoning trail is `BACKLOG.md`.

## Status — 2026-07-11 (FINAL STEP: re-climb to 3000 → backdoor)

**Red Pill INSTALLED (install #2 done). Everything is de-risked — one re-climb left.** Every number
that was "unknowable until here" is now read live and favorable:
- **`mults.hacking` = 6.09** (post-install #2; NFG 22→38, +16 levels as predicted) — above the 5.5
  danger line, so **no second NFG cycle needed**.
- **`w0r1d_d43m0n` confirmed live** (`worldprobe.js`): exists, **requiredHackingSkill 3000** (the last
  assumption, now verified), **5 open ports required**, not yet rooted/backdoored.
- **Hacking ~2,455 / 3,000** and climbing (exp-mult now 10.2 → fast). Remaining ≈ **2.35B exp**; at the
  XP rate this is **~1–2 h** once the fleet finishes rebuilding. Money/fleet rebuilding via the
  auto-restarted daemon (money is irrelevant now).

**Remaining work (all manual UI, no Singularity):**
1. **Re-run `xpfarm.js` + `nano share-off.txt`** once the fleet is up — the soft reset killed xpfarm, so
   it's the money batcher running now; xpfarm maximizes XP/sec for the climb.
2. **Hand-buy the 5 port openers** from the darkweb (TOR → BruteSSH / FTPCrack / relaySMTP / HTTPWorm /
   SQLInject). `procureprograms` can't auto-buy them without SF4 — it only reserves the cash. Needed to
   root `w0r1d_d43m0n` (5 ports). No rush — do it during the climb.
3. **At hacking 3000:** walk the network to `w0r1d_d43m0n` (not connected to home), root it, run the
   terminal **`backdoor`** command. That completes BitNode 1.

Probes `worldprobe.js` / `favorprobe.js` are one-offs — delete after BN1.

## The goal

Finish BN1: **re-climb hacking to 3000 → manual `backdoor` of `w0r1d_d43m0n`**. No Singularity (0
Source-Files) — every faction/donate/buy/install/backdoor action is **manual UI**; the daemon only
earns money + XP and runs `ns.share()`. (Everything upstream — Daedalus 2.5m rep → Red Pill → install —
is **done**.)

## Verified facts — do NOT re-derive or re-assume

- **Money RESETS on install (~$1k)** — along with hacking + fleet. The accumulated pile is NOT
  donatable; donation is funded by money earned *after* the favor-unlocking install.
  ([[reference_install_resets_money]].)
- **Install removes you from EVERY faction** (membership, not just rep) — VERIFIED live after install #1
  (Factions page: "You have not yet joined any Factions"; Daedalus not even rumored). Favor is banked,
  but you must **re-earn each faction's invite and rejoin** before you can donate/buy/work. Each install
  therefore inserts a full hacking re-climb before you can act on that faction — the endgame had **two**
  re-climbs (2500 to rejoin Daedalus, 3000 to backdoor), never zero.
  ([[reference_install_resets_faction_membership]], [reset-protocol.md](../reset-protocol.md).)
- **Donation unlocks at 150 favor** — VERIFIED live ("Unlock donations at 150.000 favor"). Favor
  persists across installs; only money is transient. Donation curve computed authoritatively
  (`favorprobe.js`): rep is cheap vs. the pile, so over-donating removes the NFG rep-cap
  ([reputation-favor.md](../reputation-favor.md)).
- **`w0r1d_d43m0n` needs hacking 3000 + 5 open ports** — **CONFIRMED live** post-Red-Pill
  (`worldprobe.js`), no longer an assumption.
- **Post-install #2 `mults.hacking` = 6.09** — CONFIRMED via `auginfo.js`. NFG capped at +16 levels this
  install (money-capped as predicted). Enough to reach 3000 in one re-climb.
- **Grafting is out** — not available in this build's BN1, wouldn't help ([grafting.md](../grafting.md)).

## The sequence (▶ = current position)

1. ✅ Grind Daedalus ≥462.5k rep (150-favor floor). *Overshot to 619.9k.*
2. ✅ Install #1 (2 queued augs) → banked ~160 favor. Dropped us out of Daedalus.
3. ✅ Rebuild fleet + earn money. *Done.*
4. ✅ Re-climb hacking to 2500 → accept Daedalus re-invite → rejoin.
5. ✅ Donate → 2.5m+ rep (over-donated for NFG headroom).
6. ✅ Buy 3 ENM augs + NeuroFlux (22→38) + Red Pill.
7. ✅ Install #2 → applied the stack (`mults.hacking` → 6.09). Dropped us out of Daedalus again — fine,
   all its augs are now owned.
8. ▶ **Re-climb hacking to 3000.** ← we are here (~2,455/3,000). Re-run `xpfarm.js` + share off; hand-buy
   the 5 port openers during the climb.
9. **Root + `backdoor` `w0r1d_d43m0n`** — walk the network to it, run the terminal `backdoor`. Completes BN1.

## Open risks / where it could stretch

- **Re-climb duration** — mult 6.09 gives ~1–2 h, but XP rate depends on the fleet rebuilding and
  xpfarm being re-run. If it drags, confirm xpfarm is running (not just the money batcher) and share is
  off. (The old "mult < 5.5 → second NFG cycle" sideline is **resolved** — mult landed at 6.09.)
- **Port openers are a manual buy** — you need all 5 to root `w0r1d_d43m0n`; `procureprograms` reserves
  the cash but can't buy without SF4. Buy them by hand before you hit 3000 so the backdoor isn't blocked.
- **CDP nav flaky while the fleet is busy** — `stats`/`read-terminal`/`run <script>` work; `goto`/`scan`
  via the terminal time out. Retry when activity settles, or drive the UI by hand.

## Pointers

- [endgame-runbook.md](../endgame-runbook.md) — click-by-click for the install sequence (steps 4–9).
- [reputation-favor.md](../reputation-favor.md) — rep/favor/donation mechanics + the computed donation curve.
- [reset-protocol.md](../reset-protocol.md) — the two install-reset gotchas (money, faction membership).
- `BACKLOG.md` ("Grind 2.5m Daedalus rep" item) — full reasoning trail incl. the corrections.
- Memories: [[reference_install_resets_money]], [[reference_install_resets_faction_membership]],
  [[project_daedalus_donation_shortcut]], [[reference_share_boost_needs_faction_work]].

## Honesty note

Two mechanics burned the plan mid-course and were corrected live, not from stock memory: **money resets
on install** (the accumulated pile was never donatable), and **installing drops all faction membership**
(so donation needed a full re-climb to 2500 to rejoin Daedalus first — the doc had wrongly said "Daedalus
is joined"). Both are now locked in [reset-protocol.md](../reset-protocol.md). The lesson for the next
session: verify reset mechanics against the live game, don't assert them.
