# Phase 25 — close-out handoff (2026-07-16)

**Read this first if you're picking up Phase 25 cold.** The spec
(`phase-25-faction-strategy.spec.md`) is the design record and its "Close-out (2026-07-15)"
section is the BN1.2-clear record. This doc is the *handoff*: where the phase actually
stands after 2026-07-16, and the one action left.

**Status:** shipped 2026-07-14 · cleared BN1.2 2026-07-15 · **S11's phase-close gate MET
2026-07-16** (see "S11" below) · **one item open: the Stage-2 first auto fire.**

---

## The next action (this is the whole checklist)

**Test:** L7 — the first auto fire. Nothing else is pending; everything else in this doc is
either done, or optional work that sits behind it.

**Wait for:** `logs/augfarmer-state.json` → `trigger.armed: true`.
Nothing to do until then — after an install the cycle needs to rebuild (0 augs queued ⇒
`gainArmed` false ⇒ the trigger cannot arm). Expect **~4-8h of awake time** per cycle; the
bottleneck is **rep**, which no amount of home RAM speeds up.

**Then:**
1. Take a save (`saves/`).
2. Write `auto` into `ratchet-mode.txt` (in-game, by hand — no code change flips it).
3. Watch the chain:
   - spend-down decision records + the fleet-freeze reservation
   - `ns.exec("installer.js")`
   - `home-ram-upgrade` transactions (proven) **and `home-cores-upgrade` (never run)**
   - the install itself
   - `bootstrap.js` relaunch via the `installAugmentations` cbScript
   - the `ratchet-log.json` `{pre, post}` boundary pair

**Abort levers (either one, any time):** set `ratchet-mode.txt` to anything but `auto`, or
create `augfarmer-pause.txt`. Any deviation from the chain above → demote to observe and
reopen the trigger design with the logged data.

**Do it mid-cycle, never on a run-ending install** — Kenneth's BN1.2 reasoning (don't combine
"first-ever test of an untested path" with "the install that ends the run"), still sound.

---

## Where the automation actually stands

The cycle repeats ~15-25× per BN1 clear. Steps 9-13 have **never executed, in any form**.

| # | Step | Owner | Status |
|---|------|-------|--------|
| 1 | Reset → cold start | `installAugmentations("bootstrap.js")` | **never run** |
| 2 | Fleet + batcher up | `bootstrap.js` → `daemon.js` | proven |
| 3 | CS-class kick (hacking 1 → climb) | `studybootstrap.js` | proven |
| 4 | Buy fleet | `cloudmanager.js` | proven |
| 5 | TOR + 5 port openers | `procureprograms.js` | proven |
| 6 | Backdoor faction servers | `backdoorfactions.js` | proven |
| 7 | Join, grind rep, buy augs + 1 NFG | `augfarmer.js` | proven |
| 8 | Trigger arms → fires | `evalTrigger` | **proven 2026-07-16** |
| 9 | Spend-down (NFG cap lifts, fleet freezes) | `augfarmer.js` auto branch | **never run** |
| 10 | `ns.exec("installer.js")` | `augfarmer.js` | **never run** |
| 11 | Max home RAM | `installer.js:64` | proven by hand 2026-07-16 |
| 12 | Max home cores | `installer.js:83` | **never run** |
| 13 | Install → back to 1 | `installer.js:113` | **never run** |

Endgame (once per clear) — Daedalus reserve → join → donate → The Red Pill → `backdoorwd.js`
— all fired live 2026-07-15, **one rep each**.

**Blast radius is smaller than it feels.** `installer.js` is 118 lines and refuses to act
unless `ratchet-mode.txt` reads exactly `auto`. `upgradeHomeCores` failing just breaks its
loop. The irreversible call is `installAugmentations("bootstrap.js")`, whose worst realistic
failure is the cbScript not firing — leaving you post-reset with nothing running, recovered
by `run bootstrap.js` by hand. A premature install is wasteful, not fatal (spend-down
converts money to mults first). You're doing 15-25 installs anyway.

---

## S11: the gate is met (and why it couldn't have been before)

The spec closed with S11 unmet: the trigger armed once but never sustained, and **no
`install-ready` fire was ever observed**. That was not bad luck — **the trigger was dead
code**, and every arm on record predates the fix that killed it.

- **Bug 1 (`aeeb632`).** `evalTrigger`'s grind horizon read `pickTarget`'s **head** target.
  Phase 25's own same-day `buyBlocked` fix (`9a6643c`) made NFG a permanent candidate — and
  the head is always NFG, rep-met at deficit 0 — so the horizon was always `0/rate = 0` and
  `phaseArmed` could never be true. `idle-plateau` was unreachable for the same reason (NFG
  is always a candidate; when none is reachable, `queuedCount` is 0 and `gainArmed` fails).
  **No arm was possible in any cycle** — `ratchet-mode.txt` → `auto` would have been a no-op.
- **Bug 2 (`3feb4b4`).** Routing the horizon through `pickWorkFaction` fixed only the
  actively-worked case: it skips PASSIVE_REP_FACTIONS and falls back to the rep-met head, so
  a passive-only plateau still couldn't arm. Observed live with every remaining grind on
  NiteSec/The Black Hand/BitRunners while $1.47T sat idle. `pickHorizonGrind` now takes the
  sorted candidates and returns the highest-priority one still owed rep — `pickWorkFaction`'s
  filter **minus the passive skip, no head fallback**.
- **Bug 3 (`b5b654d`).** `dashboard.js` showed `target` (the head) and omitted the work
  faction, so it read "grinding for NFG at CyberSec" while the slot ground Sector-12. Kenneth
  spotted it; that panel is how the dead trigger stayed invisible for a day.

All three are one confusion: **"what do we buy next" ≠ "what are we waiting on" ≠ "what
should the slot work."** Expect this to keep biting; it has three times.

**The datum, finally collected:**

```
trigger-arm    2026-07-16T22:32:14Z   horizon 55.47h (threshold 8h), gain 1.370,
                                      8 augs queued, ~$1.47T idle, nothing buyable
trigger-fire   2026-07-16T22:42:14Z   clean 600s sustain → phase: install-ready
```

Kenneth's verdict on the timing: **"about right."** That is S11's validation datum.

Also settled: the **post-install false arm does not recur.** Install #5's post state shows
`armed: false`, `gainArmed: false`, gain 1.000 — `queuedCount` 0 blocks it as designed. That
was the main auto-mode risk carried out of the BN1.2 clear.

---

## Open gaps (none block L7)

All tracked in `BACKLOG.md`; listed here so the handoff is self-contained.

1. **`MIN_TOTAL_GAIN` (1.1) is an unproven degenerate-loop guard.** The only real arm that
   ever touched it cleared at **1.116**. `nfgHackingMult` is 1.01, so ~$1.8b with a single
   queued aug projects ~10 NFG levels ≈ 1.105 gain — over the floor on *money alone*.
   Mitigating: spend-down converts money to mults before installing, so a premature fire is
   wasteful, not catastrophic. **Needs arm data, which only now exists.**
2. **Observe-mode trigger flap.** A fire sets `phase: "install-ready"`, which is not an
   arming phase, so the next poll clears it → re-arms → re-fires every ~10 min. **Auto masks
   it** (`evalTrigger`'s latch is gated on `mode === "auto"`), so it cannot affect L7 — but it
   degrades exactly the observe evidence gap (1) depends on.
3. **NFG counting / `daedalusGate`.** Install #5 answered S10's open question: queued NFG
   levels duplicate in `getOwnedAugmentations(true)` (queue 8 → 14), installed ones collapse
   to one entry. So `nfg.level` reads 1 forever (cosmetic), and `daedalusGate.installed`
   counts distinct augs (8/30). **Unverified:** whether Daedalus's real 30-aug gate counts NFG
   levels individually. If it does we undercount and over-grind. Confirm against the in-game
   requirement before it shapes the BN1.3 plan — the 2026-07-15 clear reaching Daedalus at 33
   distinct installed is consistent with *both* readings and settles nothing.
4. **No supervision — the Level-2 gap.** Companions launch at `daemon.js:415-455`, **before**
   the `while (true)` at 626. They launch once; nothing monitors or relaunches them. Any
   companion death is a **silent permanent stop**. And `augfarmer.js` can't be relaunched at
   all: the batcher fills home to `maxRam - HOME_RESERVE_GB`, so free RAM is pinned at 32 GB
   while it needs 64.1. Confirmed structural — home went **2 TB → 64 TB** and free RAM went
   *down* (34.75 GB → 32.00 GB), so "buy more RAM" is not a fix.
   - **This does not block L7** (you're watching; `restart daemon.js` recovers).
   - It *does* block genuinely-unattended running, which is the actual prize (sleep ≈ no
     progress; 24/7 is a free ~2× lever).
   - **Fix is supervisor + reserve bump together, or neither.** The bump alone only helps a
     *human* relaunch. A supervisor alone would detect the death and then fail on RAM. Note
     Phase 25 deliberately declined the bump ("companions launch before the batcher packs
     home — restart daemon.js instead"), which was correct for the problem it addressed; the
     unattended-death case is what it didn't weigh.

---

## Pointers

- Design record + BN1.2 close-out → `phase-25-faction-strategy.spec.md` (L7 checklist lives
  in its "Live validation" section; the S11 correction is in its close-out).
- Condensed history → `CHANGELOG.md` (2026-07-16).
- Live bugs/ideas → `BACKLOG.md`.
- Commits: `aeeb632` (horizon ← head), `b5b654d` (dashboard work line), `3feb4b4` (horizon
  counts passive), `902849a` (S11 record), `eb2a853` (reserve gap structural), `1e6d793`
  (NFG counting).
