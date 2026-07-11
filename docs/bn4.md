# BN4 — The Singularity ("The Man and the Machine")

BitNode-4 info, read live from the in-game BitNode screen (2026-07-11). **BN1 is cleared
(Red Pill installed, `w0r1d_d43m0n` backdoored → SF1); we are now IN BN4, goal is to clear
it.** This is now the active node, not forward planning.

## Why BN4 matters (the headline)
- **`ns.singularity.*` is available RIGHT NOW, in-node** — being inside BN4 grants the API
  without needing SF4 first (at the 16× RAM cost tier). Work for factions/companies, buy/
  install augs, create programs, backdoor servers — all scriptable *this node*. **The "manual
  UI only / no Singularity" constraint that shaped every BN1 plan is already dissolved.** Keep
  the calls out of daemon hot paths (16× RAM early → isolate in `exec`'d companion scripts).
- Completing BN4 grants **SF4**, making Singularity **permanent across all BitNodes** (not just
  while inside BN4).
- SF4 level maxes at **3** (destroy again to upgrade). Each level cuts the **RAM cost of
  Singularity functions** in *other* BitNodes:
  - Level 1: **16×** cost
  - Level 2: **4×** cost
  - Level 3: **1×** cost (full price relief)

## BitNode multipliers (BN4 — live-read)
Values are % of BN1 baseline (100% = same as BN1). BN4 is a Singularity/economy-focused
node, so the economy is heavily nerfed but hacking-XP-to-money is what stings.

**General**
- `w0r1d_d43m0n` Difficulty: **300%** ⚠️ (see below)
- Hacknet Production: **5%**
- Class/Gym Exp: 50%

**Faction**
- Work Reputation: 75%
- Work Exp: 50%

**Hacking**
- Hacking Exp: **40%**
- Server Max Money: **11.25%**
- Server Starting Money: 75%
- Stolen Money From Hack (*): **20%**

**Cloud Servers**
- Softcap Cost: 1.200

**Crime**
- Crime Exp: 50%
- Crime Money: **20%**

**Darknet**
- Darknet Money: 40%

**Company**
- Work Money: **10%**
- Work Exp: 50%

**Gang**
- Unique Augmentations: 50%

**Stanek's Gift**
- Gift Power: **150%** (the one buff — Stanek is stronger here; note Stanek needs an
  aug-free start, see [[reference_stanek_gift_fresh_bitnode]] / grafting doc)

## ⚠️ The w0r1d_d43m0n wall is 3× harder here
The BN1 finish target is hacking **3000 = 3000 × WorldDaemonDifficulty** at difficulty 1.0.
BN4 sets **WorldDaemonDifficulty = 3.0 (300%)**, so the backdoor gate is effectively
**hacking ~9000**, not 3000 — and with **Hacking Exp at 40%** and **Server Max Money at
11.25%**, both the XP climb and the money to fund augs/servers are far slower than BN1.
Budget BN4 as a long node, not a quick SF4 grab.

## Open questions (fill in on entry / play)
- Does the daemon/batcher port cleanly, or does 11.25% max-money demand different target
  selection / more share-farming for rep?
- Early SF4 has 16× RAM cost — which Singularity calls are worth it at that price before
  home RAM scales? (keep them out of hot paths regardless — CLAUDE.md rule)
- Best route to first SF4: rush `w0r1d_d43m0n` on a lean hacking build, or build economy
  first given the money nerfs?

## Sources
- Live in-game BitNode-4 screen (primary, above). `markdown/` API docs for Singularity fns.
- Do not source-dive to shortcut mechanics; static tables/costs fine.

## Log
- 2026-07-11 — BN4 unlocked; recorded BitNode screen (SF4 tiers + full multiplier table).
- 2026-07-11 — BN1 cleared (SF1 earned); **entered BN4, now the active node.** Confirmed the
  key mechanic: `ns.singularity.*` is usable in-node before SF4 — manual-UI-only constraint lifted.
