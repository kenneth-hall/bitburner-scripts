# Phase 20 — XP farm (convert idle fleet RAM into hacking XP)

**Stage:** Brainstorm (opus). Output is decisions + rejected alternatives + open questions for
the spec stage. Nothing here is built.

## Why this phase exists (the goal check)

Sole current goal: **hacking skill ≥ 2500** (the last Daedalus gate). Measured 2026-07-11 post-install:

- Skill-mult (`mults.hacking`) 4.721 sets the wall at **~7.97 B exp** to reach 2500. Remaining ~7.89 B.
- Measured throughput ~**70 k exp/sec** → ETA **~31 h of active play**.
- **The fleet is ~98% idle.** After `share-off.txt`, `daemon-batch-log.json` snapshots read
  utilization ~**2%**, `waterfallFreeGb` ~**22.9 PB** free of a ~26.5 PB fleet. The money batcher
  structurally cannot fill this fleet — at this size, profitable money-work is a rounding error
  against capacity.

So the binding constraint on the 2500 ETA is now **throughput**, and ~98% of the throughput
capacity is sitting unused. Converting that idle RAM to XP is the single highest-leverage action
available: a 4–6× exp/sec gain plausibly takes the ETA from ~31 h to **~6–10 h**.

**This reverses the backlog's standing "do not build XP-max mode" verdict — deliberately.** That
verdict was correct in its regime: against the pre-install ~5,300 h multiplier wall, even 10×
throughput was hopeless, so the multiplier was the only lever worth chasing. The install collapsed
the wall ~170×. In the new regime the multiplier lever is spent (further resets don't amortize this
close to the gate — see rejected alternatives), ETA scales *linearly* with exp/sec, and the fleet is
almost entirely idle. Different regime, opposite conclusion.

## Core approach

**Fill the idle fleet RAM with `weaken` workers aimed at a high-XP target — architecturally a clone
of the existing share manager.** The share allocator already solves the exact shape of this problem:

- `SHARE_FRACTION` carves a slice of fleet RAM; `planShareTopUp` / `launchShareJobs` top that slice
  up with `share.js` workers every tick, placed against each host's tracked `freeRam`; `sharePool`
  reports in-flight RAM/threads in the snapshot; `share-off.txt` toggles it.
- The XP farm is **the same machinery with `weaken.js` instead of `share.js` and a target argument**.
  `weaken.js` is already a trivial, import-free one-shot (`ns.weaken(target, {additionalMsec})`), so
  there is no new worker and no new worker RAM. Since share is off, the XP farm even occupies the
  same "non-batch fill" niche in the fleet.

**Why `weaken` specifically:** it is the only operation that is *coexistence-safe* with the money
batcher. Weaken only ever *lowers* security; over-weakening a server past its minimum is a harmless
no-op for money but still grants hacking XP. `grow`/`hack` mutate the money/security state the
batcher's HWGW timing depends on, so an XP farm using them could desync live batches. Weaken can't
corrupt anything.

**Target:** the highest-XP server we can affect — XP per operation scales with server difficulty, so
the best target is the **highest-required-level rooted server**, re-selected as our level climbs.
Many such high-level servers (req 900+) are rooted but never money-batched (not prepped / not
profitable), so weaken-farming them doesn't compete with the batcher for targets at all.

## Key decisions (proposed, for spec confirmation)

1. **MVP first, productionize second — because the entire deliverable is *time*.** A ~30-line
   throwaway `xpfarm.js` that grabs currently-free fleet RAM and `weaken`-spams the best target can
   start farming **today** and capture most of the gain while the proper phase is specced. At ~2%
   batch utilization the risk of an uncoordinated RAM grab racing the batcher is negligible. **Ship
   the MVP now; let it run; measure the real exp/sec multiple; then build the coordinated version.**
   This is the most important decision in the doc — don't let a polished phase delay a 20-hour save.

2. **Reuse `weaken.js`; no new worker.** Exec it with `(target, 0)` — no timing offset needed
   (there's no batch to land against). Zero new worker RAM, zero new files on the fleet.

3. **Opportunistic fill, not a fixed carve.** Mirror share's per-tick top-up: each cycle, after the
   batcher places its (tiny) batches, fill the remaining free RAM with weaken threads up to a target
   fraction. Because the batcher uses ~2%, the fraction can be large (≥80%, or "all free"). A fixed
   carve would either waste RAM or need constant retuning as the fleet grows.

4. **Toggle + goal-scoping via `xp-off.txt`** (mirrors `share-off.txt`). The farm is a goal-specific
   tool; it's pointless once 2500 is hit. Open question below on whether to auto-disable at 2500 vs
   leave it manual.

5. **Instrument exp/sec.** Add an `xpPool` field to the snapshot (parallel to `sharePool`) and lean
   on the existing `hacking-progress-log.json` for the before/after rate. Live validation of the
   exp/sec multiple **is** the ship gate for this phase — the whole justification is a measured
   throughput gain, so it must be measured, not assumed.

## Rejected alternatives

- **Neuregen Gene Modification (+40% hacking exp) / any aug reset.** It's an *exp-mult* (throughput)
  lever, not a *skill-mult* (wall) lever, so it only ×1.40s exp/sec — smaller than the farm — and it
  only applies on **install**, forcing a reset that wipes the very fleet the farm depends on. Bundling
  it nets ~1–2 h while hobbling the farm during rebuild. Buying it without resetting is dead money
  (lost on BitNode exit). Rejected.
- **More NFG install cycles.** The strongest lever *in principle* (a mult bump collapses the wall
  super-linearly), but post-reset faction rep is zero and ~15 NFG levels need millions of re-grinded
  rep plus a hacking re-climb to re-unlock factions — tens of hours to save ~28. Reset cycles only
  amortize when far from the gate; at ~1 day out we've crossed the break-even. Rejected.
- **Re-score the money batcher for exp/sec instead of $/sec.** A larger, riskier rewrite that
  destabilizes proven HWGW timing and abandons income, when a non-invasive idle-RAM fill gets the
  same XP while leaving the batcher untouched. Rejected in favor of the fill approach.
- **`grow`/`hack`-based farming.** Higher exp/sec/thread than weaken, but corrupts the batcher's
  money/security state (needs prep, depletes money). Not coexistence-safe. Rejected for the fill
  design; revisit only if a *dedicated, batcher-excluded* target set is ever carved out.
- **Home-core optimization (Phase 17).** ~1% at 2 cores, only meaningful at 8–16, and only for
  home's slice. Negligible next to the fleet-wide fill. Out of scope.

## Open questions (resolve at spec / by measurement)

1. **Which operation actually maximizes exp/sec/thread?** Weaken is the coexistence-safe default and
   the MVP choice, but it's the *longest* op (4× hack time), so it may be the *lowest* exp/sec/thread.
   Measure weaken vs grow vs a dedicated-target mini-HWGW before committing the production design.
   (Does weaken still grant XP at minimum security? Believed yes — verify.)
2. **Does exp/sec scale ~linearly as we fill 22.9 PB?** The 4–6× upside assumes near-linear. Each
   weaken thread grants XP independently, so it should — but confirm there's no per-server thread
   cap or client-side performance wall at ~10M+ threads (22.9 PB / ~1.75 GB per weaken thread).
3. **Architecture: extend the in-daemon share slot, or a standalone companion?** The share machinery
   is *in* daemon.js and proven, which argues for generalizing it into a "fill pool" (share OR xp).
   CLAUDE.md's isolation preference argues for a companion `xpfarm.js` that grabs free RAM itself.
   The companion duplicates host/free-RAM accounting and races the batcher; the in-daemon path
   touches the hot loop. MVP is a companion by nature; production likely wants the in-daemon slot.
4. **Target selection specifics.** Highest required-level rooted server — but confirm XP scales with
   `baseDifficulty` vs `requiredHackingSkill`, whether to single-target or spread across the top-N
   high-level servers, and the re-selection cadence as level climbs.
5. **Coexistence proof.** Confirm weaken-farming servers outside the active batch set leaves the
   batcher's realized income unchanged (check `finance-log` / batch events before vs after).
6. **Share ↔ XP interaction.** Both draw from idle RAM. Today share is off (no rep needed) so XP
   takes all. If a future reset-prep needs rep again, do they split the idle pool or stay
   mutually-exclusive toggles? (Probably: both can run, split by fraction — but not needed now.)
7. **Auto-disable at 2500?** Goal-specific tool. Auto-off at level 2500 vs manual `xp-off.txt`.

## Ship gate

Behavior-adjacent (adds RAM load, doesn't change batcher logic if the fill approach holds), but the
justification is a *measured* throughput gain, so this phase ships only after: `npm test` green, and
a **live run showing exp/sec rose by the claimed multiple** in `hacking-progress-log.json` with the
batcher's realized income unchanged. The MVP's live measurement doubles as the design input for the
production version.
