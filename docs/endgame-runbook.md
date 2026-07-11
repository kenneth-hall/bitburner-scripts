# BN1 endgame runbook — the install sequence

Click-by-click procedure for the hands-on sitting that finishes BitNode 1, once the passive
Daedalus grind has reached the favor floor. Everything here is **irreversible / progression-
altering** — it's Kenneth's to execute, not an autonomous task. Rationale + mechanics live in
[reputation-favor.md](reputation-favor.md); this is just the ordered checklist.

## Precondition
- **Daedalus rep ≥ ~465k** (converts to ≥150 favor — the donation unlock, verified live on the
  Daedalus page: "Unlock donations at 150.000 favor"). Overshooting is fine. At ~36 rep/sec with
  share on, this is the only wait.
- Do the whole sequence **in one sitting** — installs 1 and 2 must be back-to-back with no
  hacking re-climb between them, or you pay for two re-climbs.

## Step 1 — Install #1 (bank the favor)
1. (Optional) Export a backup save first.
2. Augmentations → **Install Augmentations**. Your 2 already-queued augs (NutriGen Implant,
   Neuregen Gene Modification) are enough to enable it — no throwaway purchase needed.
3. This **resets hacking to ~1** and **wipes the cloud fleet**. Expected. Daedalus rep → 0,
   **favor → 150** (donation now unlocked).

## Step 2 — Donate for rep
4. Factions → Daedalus → **Details**. A **Donate** section should now be present (was gated at
   150 favor). If it isn't, STOP — the assumption failed; fall back to re-climbing hacking then
   grinding Daedalus rep the slow way (do not thrash).
5. Donate enough to reach **~7–10M rep** (~$4–6t of your $1.1q+) — more than the 2.5m the Red
   Pill needs, because the extra funds a deeper NeuroFlux stack. Donation at 150 favor is cheaper
   than the favor-0 estimate, so err high; money is not the constraint here.

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
