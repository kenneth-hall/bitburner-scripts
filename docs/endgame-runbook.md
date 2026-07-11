# BN1 endgame runbook — the install sequence

Click-by-click procedure for the hands-on sitting that finishes BitNode 1, once the passive
Daedalus grind has reached the favor floor. Everything here is **irreversible / progression-
altering** — it's Kenneth's to execute, not an autonomous task. Rationale + mechanics live in
[reputation-favor.md](reputation-favor.md); this is just the ordered checklist.

## Precondition
- **Daedalus rep ≥ ~465k** (converts to ≥150 favor — the donation unlock, verified live on the
  Daedalus page: "Unlock donations at 150.000 favor"). Overshooting is fine. At ~36 rep/sec with
  share on, this is the only wait.
- **Two hacking re-climbs are unavoidable** (this corrects an earlier "back-to-back installs = one
  re-climb" plan): install #1 drops you out of Daedalus, so you must re-climb to **2500** to rejoin
  before you can donate/buy; then install #2 (Red Pill) resets you again and you re-climb to **3000**
  to backdoor `w0r1d_d43m0n`. There is no ordering that avoids the 2500 re-climb — donating requires
  Daedalus membership, and membership requires the hacking gate. See
  [reset-protocol.md](reset-protocol.md) for why.

## Step 1 — Install #1 (bank the favor)
1. (Optional) Export a backup save first.
2. Augmentations → **Install Augmentations**. Your 2 already-queued augs (NutriGen Implant,
   Neuregen Gene Modification) are enough to enable it — no throwaway purchase needed.
3. This **resets hacking to ~1** and **wipes the cloud fleet**. Expected. Daedalus rep → 0,
   **favor → 150** (donation now unlocked).

## ⚠️ Step 1.5 — Rebuild money FIRST (installing reset it to ~$1k)
**Installing augmentations RESETS money** (to ~$1k), not just hacking + fleet. So the money that
funds the donation must be **earned after install #1** — the pre-install pile is gone. Restart the
bootstrap/daemon ([reset-protocol.md](reset-protocol.md)) and let the batcher rebuild the fleet and
earn back **~$1t** (donation + ENM augs + NFG). This is the new critical-path wait (~1–3 h), not the
instant step earlier drafts assumed. Hacking re-climbs as a side effect here — it gets reset again by
install #2, that's fine.

## ⚠️ Step 1.6 — Re-climb hacking to 2500 and REJOIN Daedalus (installing kicked you out)
**Installing removes you from every faction** — membership, not just rep (verified live after install #1:
Factions page read "You have not yet joined any Factions"). Favor is banked, but you **cannot donate,
buy augs, or work for Daedalus until you rejoin.** The 30-augs and $100b invite gates still pass; the
one that reset is **hacking → ~1**, so you must re-climb to **2500** to get re-invited.
- Let the daemon grind hacking XP to 2500. Since money is already done, point the fleet at XP not $/sec
  and turn share **off** (`share-off.txt`) — you're in no faction, so the share boost buys nothing.
- At mult ~4.72 this is ~7.7B exp from level ~1985 (~6–9 h at ~250–330k exp/sec, back-loaded).
- When the **Daedalus** invitation reappears on the Factions screen, click **Join!**. Only now is the
  Donate section reachable.

## Step 2 — Donate for rep (once REJOINED and money is rebuilt)
4. Factions → Daedalus → **Details**. A **Donate** section should be present (favor ≥150 persists
   from install #1, and you rejoined in Step 1.6). If it isn't, STOP — fall back to grinding Daedalus
   rep the slow way.
5. Donate enough to reach **2.5m+ rep** (the Red Pill req), plus headroom for NFG. Cost is on the
   order of **$0.5–1.5t** — the favor bonus (~160 favor) discounts it below the favor-0 estimate;
   read the exact rate off the Donate UI, don't assume.

## Step 3 — Buy, in this order (order matters for price)
Each purchase multiplies the next aug's price by ~1.9×, so buy **most-expensive-base first**:
6. The **3 Embedded Netburner Module** hacking augs: **Core V3 Upgrade** (1.75m rep), **DMA
   Upgrade** (1.0m), **Analyze Engine** (625k). (Prereqs already owned.)
7. **NeuroFlux Governor** — buy levels one at a time **until you run out of money** (the ~1.9×/aug
   escalation caps this at ~17–18 levels even with $1.1q; that's the ceiling, take it). This is the
   main mult lever and there's no downside to maxing it — it's the last repeatable aug you have.
8. **The Red Pill** (2.5m rep, **$0**) — free, so buy it anytime in this step.

## Step 4 — Install #2 (apply the stack)
9. Augmentations → **Install Augmentations** again. Hacking resets again (to ~1, now at the higher
   mult). **You cannot preview the post-install mult** — it only shows after this install.

## Step 5 — Rebuild + read the mult
10. Soft reset kills all scripts. **Restart the bootstrap/daemon** per
    [reset-protocol.md](reset-protocol.md) — don't wing it; the fleet must rebuild.
11. `run auginfo.js` and check `mults.hacking`. Decision:
    - **≥ ~7:** good — the re-climb to 3000 is ~30 min–~1h. Proceed.
    - **~6:** acceptable — re-climb ~2h. Proceed or top up NFG in another cycle, your call.
    - **< ~5.5:** reaching 3000 is impractical this cycle. Since all non-NFG augs are exhausted,
      the only lever is another **NFG-only install cycle** (grind/donate rep → buy NFG → install).
      Not stuck, just multi-cycle.

## Step 6 — Re-climb and finish
12. Let the daemon grind hacking XP up to **3000** (`w0r1d_d43m0n`'s requirement; can't be read
    live until it spawns — standard BN1 value). Turn share **off** during this phase
    (`share-off.txt` on home) — it only helps while faction-working, which you're not.
13. Once hacking ≥ 3000: `w0r1d_d43m0n` should be reachable in the network (not connected to home
    — walk to it). Connect hop-by-hop and run the manual terminal **`backdoor`** (no Singularity
    needed). That completes BitNode 1.

## Fallbacks (nothing here bricks the run)
- Donation absent (step 4): grind Daedalus rep the slow way; favor still persists.
- Mult too low (step 11): extra NFG-only install cycles.
- Either way the cost is time, not a dead run.
