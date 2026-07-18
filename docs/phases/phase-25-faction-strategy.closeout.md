# Phase 25 — close-out handoff (2026-07-16, L7 closed 2026-07-17, gap 7 found 2026-07-18)

**Read this first if you're picking up Phase 25 cold.** The spec
(`phase-25-faction-strategy.spec.md`) is the design record and its "Close-out (2026-07-15)"
section is the BN1.2-clear record. This doc is the *handoff*.

**Status:** shipped 2026-07-14 · cleared BN1.2 2026-07-15 · S11's gate met 2026-07-16 ·
L7 passed 2026-07-17 — every step of the cycle has executed at least once. Reading L7's logs
turned up two bugs (gaps 5 and 6); both fixed the same day, and the NFG price ladder they
exposed is now measured (2.166) and the projection corrected.

**Then the cycle stalled.** After install #8 (2026-07-17 9:45), the auto ratchet sat **25
hours in `phase: "grinding"` doing nothing** — `gainArmed: true`, gain 2.36, $3.3q idle,
`phaseArmed: false` permanently. That is **gap 7**, found and fixed 2026-07-18. Three gaps are
open — 3, 4 and 7's follow-on — and the earlier "the phase has no open tests" line was
retracted with it.

**Read this before trusting the "proven" column below: proven ≠ repeatable.** Every step had
executed at least once, and the cycle still could not run itself a third time unattended. The
table records coverage, not reliability.

---

## L7 — the first auto fire (2026-07-17, install #6)

Ran end-to-end, unmodified, on the first attempt. **`auto` is still set** — the next fire
comes when the cycle rebuilds (~4-8h).

Sequence, all inside 11 seconds:

```
6:09:00  trigger-fire      sustained 600.9s/600s, gain 1.173, 7 queued, 15 NFG projected
6:09:00  spend-down-start  buys Synaptic Enhancement Implant + 11 NFG levels
6:09:10  installer-exec    pid 1766424
6:09:10  install           ramTiers 0 (already maxed), coreTiers 3 -> 4 cores, $485.6b
6:09:11  install fires     mult.hacking 1.632 -> 1.839, level 857 -> 1, 7 augs activated
6:09:11  bootstrap.js relaunched via cbScript -- studybootstrap/procureprograms/cloudmanager up
```

What install #6 bought:

| | pre (6:08:43) | post (6:09:11) | |
|---|---|---|---|
| `mults.hacking` | 1.632 | **1.839** | +12.7% |
| `mults.hacking_exp` | 1.704 | **2.823** | +65.7% |
| `mults.faction_rep` | 1.491 | **2.125** | +42.5% |
| augs installed | 8 | **15** | Daedalus gate 15/30 |
| home cores | 1 | **4** | step 12's first-ever run |

**Recovery was clean and fast.** Within 5 minutes: 7 factions rejoined, hacking 1 → 494,
`phase: grinding`. The **post-install false arm did not recur** (`gainArmed: false`, 0
queued) — the main auto-mode risk carried out of the BN1.2 clear, now settled on real data.

**Two predictions confirmed:** the observe-mode flap is real and ran at a **10:21 cadence**
(`would install now` at 5:27:36 / 5:37:57 / 5:48:18 / 5:58:39) right up until the flip; and
the latch works as specced — `evalTrigger` checks `priorState.fired && mode === "auto"`
*before* recomputing, so flipping to `auto` with sustain already complete fired immediately
and the flap could not abort it.

---

## Where the automation actually stands

The cycle repeats ~15-25× per BN1 clear. **Every step is now proven.**

| # | Step | Owner | Status |
|---|------|-------|--------|
| 1 | Reset → cold start | `installAugmentations("bootstrap.js")` | **proven 2026-07-17** |
| 2 | Fleet + batcher up | `bootstrap.js` → `daemon.js` | proven |
| 3 | CS-class kick (hacking 1 → climb) | `studybootstrap.js` | proven |
| 4 | Buy fleet | `cloudmanager.js` | proven |
| 5 | TOR + 5 port openers | `procureprograms.js` | proven |
| 6 | Backdoor faction servers | `backdoorfactions.js` | proven |
| 7 | Join, grind rep, buy augs + 1 NFG | `augfarmer.js` | proven |
| 8 | Trigger arms → fires | `evalTrigger` | proven 2026-07-16 |
| 9 | Spend-down (NFG cap lifts, fleet freezes) | `augfarmer.js` auto branch | **proven 2026-07-17** |
| 10 | `ns.exec("installer.js")` | `augfarmer.js` | **proven 2026-07-17** |
| 11 | Max home RAM | `installer.js:64` | proven by hand 2026-07-16 (no-op at 64 TB) |
| 12 | Max home cores | `installer.js:83` | **proven 2026-07-17** (1 → 4) |
| 13 | Install → back to 1 | `installer.js:113` | **proven 2026-07-17** |

Endgame (once per clear) — Daedalus reserve → join → donate → The Red Pill → `backdoorwd.js`
— all fired live 2026-07-15, **one rep each**.

**Blast radius was as estimated.** `installer.js` refuses to act unless `ratchet-mode.txt`
reads exactly `auto`; the cbScript fired; nothing needed a hand-recovery.

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
should the slot work."** Expect this to keep biting; it has now bitten **four** times — gap
(6) below is the same shape again (*"who sells it" ≠ "who we have rep with"*), found
2026-07-17. Whenever this code names a faction, ask which of these four questions it is
actually answering.

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

## Open gaps — two left

All tracked in `BACKLOG.md`; repeated here so the handoff is self-contained. **Gap numbers are
stable IDs** (`BACKLOG.md`, `CHANGELOG.md` and CLAUDE.md all cite them), so they keep their
original numbers and the list reads out of order. Everything else is under "Closed" below.

8. **~~NFG's rep requirement was recorded as not climbing with level. It climbs ×1.14.~~ Fixed
   2026-07-18 — but the *strategic* consequence is open and is the ratchet's next real problem.**
   Full mechanics now in **`docs/neuroflux.md`**; this is the phase-local record.
   - **The false fact.** Gap 6's write-up asserted, as checked, that NFG's rep requirement doesn't
     climb. Install #9 disproves it: repReq **122,736 → 998,737 over exactly 16 levels** = 8.137 =
     **1.14¹⁶**. The original check compared a before/after that spanned a catalog which hadn't
     rebuilt. *A before/after across an install is only as good as the rebuild between them* —
     check the catalog's timestamp moved, not just its values.
   - **Why it's load-bearing.** Rep resets to zero on every install; the requirement doesn't.
     Each cycle re-earns, from scratch, a requirement that only grows: **10k → 123k → 999k** over
     three installs. Money bound the tail for installs #6-#9, so this stayed invisible — but rep
     income is roughly linear per cycle while the requirement compounds, so **rep takes over as
     the binding constraint and then shrinks the tail every cycle.** The tail is most of the gain
     (16 NFG levels vs 6 discrete augs at #9), so **per-cycle gain will decay toward the discrete
     augs alone.**
   - **Fixed in code:** `NFG_REP_LADDER` + `nfgLevelsByRep`; `spendDownPlan`'s tail and
     `evalTrigger`'s projection are now bounded by **both** ladders. Previously the projection was
     money-only — documented as "accepted optimism ... NFG's rep requirement may bind first",
     which was fine while it never did. It inflates `totalGain`, which is what `MIN_TOTAL_GAIN`
     gates on, so this would have started firing installs on gains that couldn't be realized.
   - **Open — the strategy, not the arithmetic.** Nothing plans NFG rep as an *expense*. The two
     counters are donation (money → rep, the only lever that scales with our surplus) and rising
     `faction_rep` mults. Both exist in the engine; neither is aimed at NFG. Decide before the
     decay shows up as a mysteriously falling `totalGain`.
7. **~~The trigger cannot arm at a rep-complete plateau.~~ FIXED 2026-07-18 — but read the
   lesson, it is the important part.** After install #8 the cycle sat **25 hours** in
   `phase: "grinding"` with nothing to do:
   ```
   trigger: { armed: false, horizonMs: null,
              reasons: { gainArmed: true, phaseArmed: false } }
   totalGain 2.356 · nfgLevelsProjected 16 · money $3,336t · 6 augs queued
   ```
   **Mechanism.** Of the 38 augs reachable from our 8 joined factions, **zero still owed rep**,
   so `pickHorizonGrind` correctly returned `{faction: undefined}` — and `evalTrigger` read
   that as "no horizon measured, don't arm" when it actually means "**nothing left to wait
   on**", which is arming evidence. The `idle-plateau` path that should have caught it is
   unreachable: NFG's per-cycle cap (`buyBlocked`) keeps the head target non-rep-met, so
   `planActions` takes the grind branch (`augfarmer.js:1004`) and the action list is never
   empty. A real plateau wearing the `grinding` label.
   - **Fixed** in `evalTrigger`: `grinding` + no faction owed rep ⇒ `phaseArmed = true`.
     Money-blocked is deliberately excluded — that state is `awaiting-money`, which still never
     arms, so the plateau read only fires when *rep* has run out of things to buy.
   - **Fifth instance of this doc's recurring confusion.** Bugs 1 and 2 were the same state —
     everything rep-met, horizon undefined — and **both fixes only widened *which* faction gets
     picked. Neither handled "correctly picks none."** Three fixes in, the null case had still
     never been tested. When this code names a faction, also ask what it means when it names
     *nothing*.
   - **It failed exactly the way gap 4 predicts a companion death would:** silent permanent
     stop, indistinguishable from healthy at a glance, invisible until someone read the logs.
     Different cause, identical signature. **So gap 4's supervisor must watch progress
     liveness, not process liveness** — every process here was alive and healthy for 25 hours.
     That is a design constraint on gap 4, discovered by gap 7.
   - **Follow-on, still open:** nothing detects "auto mode, hours elapsed, no install." A
     stall-age check is the cheap general net that would have caught this class on day one.
4. **No supervision — the Level-2 gap. THE ONE THAT MATTERS.** Companions launch at
   `daemon.js:415-455`, **before** the `while (true)` at 626. They launch once; nothing monitors
   or relaunches them. Any companion death is a **silent permanent stop**. And `augfarmer.js`
   can't be relaunched on its own: the batcher fills home to `maxRam - HOME_RESERVE_GB`, so free
   RAM is pinned at 32 GB while it needs 64.1. Confirmed structural — home went **2 TB → 64 TB**
   and free RAM went *down* (34.75 GB → 32.00 GB), so "buy more RAM" is not a fix.
   - It did not block L7 (Kenneth was watching; `restart daemon.js` recovers — and that's
     exactly how the gap 5/6 fixes shipped mid-cycle).
   - It *does* block genuinely-unattended running, which is the actual prize (sleep ≈ no
     progress; 24/7 is a free ~2× lever). **With L7 closed, this is the only thing blocking it.**
   - **Fix is supervisor + reserve bump together, or neither.** The bump alone only helps a
     *human* relaunch. A supervisor alone would detect the death and then fail on RAM. Note
     Phase 25 deliberately declined the bump ("companions launch before the batcher packs
     home — restart daemon.js instead"), which was correct for the problem it addressed; the
     unattended-death case is what it didn't weigh.
3. **NFG counting / `daedalusGate`.** Install #5 answered S10's open question: queued NFG
   levels duplicate in `getOwnedAugmentations(true)` (queue 8 → 14), installed ones collapse
   to one entry. So `nfg.level` reads 1 forever (cosmetic), and `daedalusGate.installed`
   counts distinct augs. **Unverified:** whether Daedalus's real 30-aug gate counts NFG
   levels individually. If it does we undercount and over-grind. Confirm against the in-game
   requirement before it shapes the BN1.3 plan — the 2026-07-15 clear reaching Daedalus at 33
   distinct installed is consistent with *both* readings and settles nothing. (Install #6 is
   another instance of the same ambiguity, not a tiebreak: 12 NFG levels went in and the
   distinct count moved 8 → 15, i.e. +7 discrete augs and no new NFG entry.)

---

## Closed

### Gaps 5 and 6 — found by reading L7's logs, fixed the same day (`4b80da4`)

584 tests pass (6 new `pickNfgSeller` cases, incl. install #6's exact shape as a regression
fixture). `augfarmer.js` RAM **unchanged at 64.10 GB** (`getAugmentationPrice` was already
charged). Shipped live mid-cycle via `restart daemon.js` — necessary, because the spend-down
gap 6 protects runs in the *already-running* augfarmer, so waiting for the next install's
relaunch would have meant the next fire using the buggy code. **Both are now validated live:**
gap 5 by the `projected` field appearing on every `auto-aug` record, and gap 6 by installs #7
and #8 buying NFG from NiteSec and The Black Hand (highest rep) rather than CyberSec — see
"Done", below.

5. ~~**`recordTransaction` logged the PROJECTED price, not the price actually paid.**~~ The buy
   path recorded `amount: action.price`, which came from `spendDownPlan`'s own
   `price *= NFG_PRICE_LADDER` (1.9) projection rather than from the game. The real escalation
   is steeper (**since measured at 2.166**, see "Done" below), so **every NFG level after the
   first was under-logged, and the error compounded**: install #6's 11 levels logged **$417.7b**
   against a real spend of roughly **$2.2-2.7t**, a ~5-6× understatement. Money left the account
   correctly — only the *record* was wrong — but it silently corrupted `transactions-*.json`, the
   file the conventions say to validate against. **Fixed** by reading the live price immediately
   before the buy and logging that, keeping the projection alongside as `projected` — and it's
   exactly that `projected`-vs-`amount` pair that let the next fire measure the true ladder.
6. ~~**`nfgState.faction` picked `sellers[0]`, not the faction we hold the most rep with.**~~
   It took `catalog.augs[NFG].sellers[0]` — catalog order, i.e. CyberSec. NFG's rep requirement
   is the same whoever sells it, so the right pick is the joined faction with the **highest**
   rep. At install #6 that was **Chongqing (226,822)** but it bought from **CyberSec (54,690)**.
   It worked *that time* only because CyberSec's rep happened to clear NFG's 10,181 requirement —
   had it not, `repMet` would have been false, the entire NFG tail suppressed, and the whole
   $5.5t bank wasted on an install. **It worked by luck.** Fourth instance of this doc's
   recurring confusion — *"who sells it" ≠ "who we have rep with"*. **Fixed** by `pickNfgSeller`.
   - **It was a fresh coin-flip every cycle, not a one-off.** Installing resets faction rep to
     zero, so CyberSec had to *re-earn* 10,181 before every fire for the NFG tail to work at all.
     Fire early in a cycle, or in a cycle whose grind doesn't route through CyberSec, and the
     bank converts to nothing. The highest-rep faction is the camp one being actively worked, so
     picking by rep both removes the failure mode and buys more levels.
   - ~~Checked and **not** a factor: NFG's rep requirement does *not* climb with level. The
     catalog read 10,181 both before install #6 and after (fresh rebuild at 06:21:48), despite
     12 levels going in — so this was unguarded rather than worsening.~~ **WRONG — corrected
     2026-07-18, see gap 8.** It climbs **×1.14 per level**. That before/after read was a
     catalog that hadn't actually rebuilt. (NFG's *price* does scale: the catalog's base moved
     ~×4.23 ≈ 1.14¹¹ across the same install — which should have been the tell that its rep
     moves the same way.)

### Resolved by L7 itself

1. ~~**`MIN_TOTAL_GAIN` (1.1) is an unproven degenerate-loop guard.**~~ Still not stress-tested
   at the boundary, but its root cause is **fixed**. install #6 armed at 1.173 and delivered
   1.127 actual (1.632 → 1.839): the projection over-estimated because `nfgLevelsProjected`
   used a stale 1.9 ladder (and a `(L-1)` factor pinned to it), projecting 15 levels where 11
   were purchasable. Now that the ladder is measured (2.166) and the factor tracks it, the
   projection is honest — so `totalGain` no longer overstates a fire, and 1.1 means what it
   says. The remaining boundary question (does the guard actually stop a degenerate loop) still
   wants a real low-gain arm to exercise it, but that's a smaller open item than it was.
2. ~~**Observe-mode trigger flap.**~~ Confirmed live at a **10:21 cadence** and confirmed
   harmless under `auto` (the latch pre-empts it). Still degrades observe-mode evidence; the
   cheap fix is to treat `install-ready` as an arming phase in observe.

**Also settled — the stranded money is inherent, not a bug.** The install wiped **$2.455t**
unspent, which looks alarming and isn't: spend-down stops when the next NFG level costs more
than the remaining bank (live price had escalated past $2.94t), and every discrete aug left
had `deficit > 0` (rep not met), so there was genuinely nothing to buy. An exponential ladder
always strands up to one level's price. **Do not "fix" this.**

---

## What to do next

Gaps 5, 6 and 7 are fixed. **Gap 4 is still the prize, and gap 7 has now specified part of it.**

1. **Gap 4 — the supervisor + reserve bump.** The big one, and the main thing between here and
   unattended 24/7 running (the actual prize; sleep ≈ no progress, 24/7 is a free ~2×). Fix is
   supervisor + reserve bump together or neither — see the gap-4 write-up above. **Gap 7 adds a
   requirement: it must watch *progress*, not processes.** A supervisor that only checks "is
   `augfarmer.js` running" would have reported all-green through the entire 25-hour stall.
2. **Gap 7's follow-on — a stall-age check.** Cheapest possible version: in auto mode, if
   `now - lastAugReset` exceeds some multiple of the observed cycle time with no install, say so
   (dashboard or log). Catches this whole class, including causes not yet imagined. Arguably
   this is gap 4's first increment rather than a separate item.
3. **Gap 8's open half — plan NFG rep as an expense.** The arithmetic is fixed; the strategy
   isn't. The NFG tail is most of each cycle's gain and it is on track to shrink every cycle. See
   `docs/neuroflux.md`. This is the ratchet's next *design* question, not a bug.
4. **Gap 3 — confirm Daedalus's 30-aug gate counts NFG levels.** Cheap, and it shapes the
   BN1.3 endgame timing. Do it before the gate matters. Note gap 8 raises the stakes: if the gate
   counts levels, the same ×1.14 rep ladder is also pacing our approach to Daedalus.

**Abort levers, unchanged:** set `ratchet-mode.txt` to anything but `auto`, or create
`augfarmer-pause.txt`.

### Done since the first fire (2026-07-17 afternoon, installs #7-#8)

- **Two more auto-installs ran unattended, clean.** `mult.hacking` 1.839 → 2.482 (#7) → 3.555
  (#8); gate 15 → 24/30. Both fixes exercised: gap 6 bought NFG from **NiteSec** (#7) and **The
  Black Hand** (#8), not CyberSec — proving it now tracks the highest-rep faction cycle to cycle.
- **NFG ladder measured and set (`NFG_PRICE_LADDER` 1.9 → 2.166).** Install #8's 11-level run
  logged a dead-constant paid ratio of 2.166. The gap-5 fix's `projected` field made this a
  direct read: level 11 had been under-logged 3.71× (paid $2,150b vs projected $580b).
- **`nfgLevelsProjected` corrected (gap 1's root cause).** The projection's `(L-1)` numerator
  factor was the literal 0.9 — silently coupled to the old 1.9 ladder — so bumping the constant
  alone would have mis-projected; it's now `(NFG_PRICE_LADDER - 1)`. Validated: predicts 11 for
  install #8, matching reality (old formula said 13). Live projection dropped 17 → 14 on the
  restart, confirming the over-projection is gone. This makes `totalGain` honest, which makes
  `MIN_TOTAL_GAIN` behave as intended. Shipped mid-cycle via `restart daemon.js`; 584 tests pass.

## Pointers

- Design record + BN1.2 close-out → `phase-25-faction-strategy.spec.md` (the S11 correction is
  in its close-out; its "Live validation" section holds the original L7 checklist, now passed).
- Condensed history → `CHANGELOG.md` (2026-07-17).
- Live bugs/ideas → `BACKLOG.md`.
- Commits: `aeeb632` (horizon ← head), `b5b654d` (dashboard work line), `3feb4b4` (horizon
  counts passive), `902849a` (S11 record), `eb2a853` (reserve gap structural), `1e6d793`
  (NFG counting), `4b80da4` (gaps 5+6 fixed), `3439434` (NFG ladder measured 2.166 + projection
  fix).
- L7's raw evidence, install #6: `logs/ratchet-log.json` (last record — the `{pre, post}`
  pair), `logs/ratchet-decisions.json` (the `trigger-fire` → `install` chain),
  `logs/transactions-2026-07-17.json` (the 11 NFG buys).
  - **Reading that transaction file correctly matters.** Records written *before* 6:29 on
    2026-07-17 carry gap 5's bug — their `amount` is a projection, so install #6's NFG buys
    understate what was really paid by ~5-6×. Records from 6:29 onward carry a `projected`
    field beside `amount`; those are trustworthy, and the presence of that field is how you
    tell the two apart. Don't sum the file across that boundary and expect a real number.
  - The buys land in `transactions-*.json`, **not** in `ratchet-decisions.json` — decisions
    only record `spend-down-start`. Reading decisions alone makes a working spend-down look
    like it bought nothing; that misread cost this session a while.

## Tooling notes from the L7 sitting (2026-07-17)

Three things cost time here; none are obvious from the outside.

- **`cat <file>.txt` prints nothing in this build.** Not an error, not a modal — silently no
  output, even for a file with content. It reads exactly like an empty file and sent this
  session chasing a nonexistent save bug. Use `ls --grep <name>` to prove existence, and the
  consuming script's own state export to prove content.
- **The editor's Save button can't be reached by name.** It carries
  `aria-label="Ctrl + S or ⊞ + S"`, which *overrides* its accessible name, so
  `getByRole('button', {name: 'Save'})` never matches despite the visible text reading "Save".
  Match on visible text instead. (Prefer clicking it over sending Ctrl+S: if the app didn't
  capture the keystroke, Electron could raise a native save dialog, which CDP cannot see or
  dismiss — see the next point.)
- **Native OS dialogs are invisible to CDP.** Backup Save / Export Game open a Windows file
  picker, which is not in the DOM. Claude cannot see, fill, or cancel it — and clicking the
  button would leave a modal dialog blocking the game with no way to clear it. **Taking a save
  is Kenneth's step, not Claude's.**
