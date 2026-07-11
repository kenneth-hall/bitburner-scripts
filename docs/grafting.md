# Augmentation grafting

Reference for the grafting mechanic and — importantly — its **current unavailability** in
Kenneth's BitNode. Read before spending any effort on a grafting-based plan.

## What grafting is

Grafting applies an augmentation's effect **without an install/reset** — you keep your current
hacking level and progress. You pay money **and focused time** (hours per aug) and the aug's
multipliers take effect when the graft completes. This is the one mechanic that raises
multipliers without wiping your hacking level, which is why it looks attractive against the
"install resets hacking" wall.

It is **not** a shop or a faction-augmentation entry. In stock Bitburner it's a **city location**:
VitaLife, in **New Tokyo** — you travel there, enter VitaLife, and use a "Graft Augmentations"
clinic.

## The catch: Entropy

Every graft raises the player's **Entropy** (`ns.getPlayer().entropy`), and Entropy applies a
compounding **~2%-per-point debuff to *all* multipliers** until your next install clears it. So
grafting is self-limiting by design: graft ~5 augs and everything you own runs at roughly 0.90×.
It trades "no reset" for "a growing tax on every multiplier." Installing augmentations wipes
Entropy back to 0 (and gives bought augs their multipliers **clean**, with no Entropy at all).

## Scripting it needs Source-File 10

The `ns.grafting.*` API (`getGraftableAugmentations`, `getAugmentationGraftPrice` [3.75 GB /
call family], `getAugmentationGraftTime`, `graftAugmentation`, `waitForOngoingGrafting`)
**requires SF10**. Kenneth has **no Source-Files** (first BitNode — `getResetInfo().ownedSF`
is `{}`, confirmed 2026-07-11), so grafting can only ever be driven **manually via the UI**, not
scripted, until BN10 is completed. `getGraftableAugmentations()` lists augs you don't already own
(it does *not* check money or prerequisite augs).

## ⚠️ Observed: NOT available in this build's BN1 (2026-07-11)

Kenneth traveled to New Tokyo, entered VitaLife, and the grafting clinic **did not appear**. So
in this (heavily modified — `ns.cloud`, `ns.dnet`, v3.x) build, grafting is gated behind
something not yet unlocked; the **exact unlock condition is unconfirmed** and may differ from
stock Bitburner. Do not assume vanilla availability. Entropy is currently 0 (never grafted).

To investigate further would mean either reading the VitaLife UI live via the CDP driver (a
New-Tokyo trip that interrupts any active faction-work rep grind) or finding the unlock in the
allowed docs — the `markdown/` API docs only state the SF10 requirement for the *API*, not the
UI unlock.

## Strategic verdict for finishing BN1: not needed

Even if it were available, grafting doesn't help the BN1 finish:
- There is exactly **one unavoidable reset** ahead — installing **The Red Pill** (it can't be
  grafted; it must be installed to spawn `w0r1d_d43m0n`). Every multiplier aug you buy rides
  along in that same install **for free, no Entropy**. Grafting's whole value prop (avoid
  resets) is moot for augs you're installing anyway.
- The only niche where it could help: **after** the Red Pill install, grafting hacking-*skill*-mult
  augs to close a gap between your re-climbed level and the `w0r1d_d43m0n` requirement faster than
  grinding XP — worth it only if that gap is large (depends on the still-unconfirmed world-daemon
  hacking req) and only if grafting is even unlocked by then.

Grafting suits **camping a BitNode long-term without resetting**, not "finish and move on." See
[reputation-favor.md](reputation-favor.md) for the rep/donation path that *is* the BN1 lever.
