# Phase 25 — close-out handoff (2026-07-16, L7 closed 2026-07-17)

**Read this first if you're picking up Phase 25 cold.** The spec
(`phase-25-faction-strategy.spec.md`) is the design record and its "Close-out (2026-07-15)"
section is the BN1.2-clear record. This doc is the *handoff*.

**Status:** shipped 2026-07-14 · cleared BN1.2 2026-07-15 · S11's gate met 2026-07-16 ·
**L7 PASSED 2026-07-17 — the last open item. Every step of the cycle has now executed at
least once.** The phase has no open tests. What remains is two logged bugs (below), neither
of which blocked the run.

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

## Open gaps

All tracked in `BACKLOG.md`; listed here so the handoff is self-contained. **(5) and (6) were
found by reading L7's logs and are now FIXED (2026-07-17, `4b80da4`) — neither blocked the run.
Their descriptions are kept below because they're the record of what the fix is for.**

**Fix status:** 584 tests pass (6 new `pickNfgSeller` cases, incl. install #6's exact shape as a
regression fixture). `augfarmer.js` RAM **unchanged at 64.10 GB** (`getAugmentationPrice` was
already charged). Shipped live mid-cycle via `restart daemon.js` — necessary, because the
spend-down that (6) protects runs in the *currently-running* augfarmer, so waiting for the next
install's relaunch would have meant the next fire used the buggy code. **(5) is validated live**
(`auto-aug` records now carry `projected` beside `amount`). **(6) is not yet exercised** —
`pickNfgSeller` only runs during spend-down, so it stays unproven until the next fire.

5. **`recordTransaction` logs the PROJECTED price, not the price actually paid.**
   `augfarmer.js:1633` records `amount: action.price`, but `action.price` comes from
   `spendDownPlan`'s own `price *= NFG_PRICE_LADDER` (1.9) projection — not from the game.
   The real escalation is steeper (~2.28×, since each queued aug raises subsequent aug prices
   *and* NFG's own level multiplier compounds on top), so **every NFG level after the first is
   under-logged, and the error compounds.** Install #6's 11 levels logged **$417.7b** against
   a real spend of roughly **$2.2-2.7t** — a ~5-6× understatement. Money left the account
   correctly; only the *record* is wrong, so this is a log-integrity bug, not a gameplay one —
   but it silently corrupts `transactions-*.json`, which is the thing the conventions say to
   validate against. Fix: record the live price (read before the buy), or reconcile
   `getPlayer().money` across the call. The exact real ladder is inferred from a money delta,
   not measured — measure it as part of the fix.
6. **`nfgState.faction` picks `sellers[0]`, not the faction we have the most rep with.**
   `augfarmer.js:1526` takes `catalog.augs[NFG].sellers[0]`, which is catalog order — CyberSec.
   NFG's rep requirement is the same whoever sells it, so the right pick is the joined faction
   with the **highest** rep. At install #6 that was **Chongqing (226,822 rep)** but it bought
   from **CyberSec (54,690)**. It worked *this time* only because CyberSec's rep happened to
   clear NFG's 10,180 requirement — had it not, `repMet` would have been false and the entire
   NFG tail suppressed, wasting the whole $5.5t bank on an install. **Low impact, high
   variance: it worked by luck.** This is a fourth instance of the doc's own recurring
   confusion — *"who sells it" ≠ "who we have rep with"*.
   - **It's a fresh coin-flip every cycle, not a one-off.** Installing resets faction rep to
     zero, so CyberSec must *re-earn* 10,181 rep before every fire for the NFG tail to work at
     all. Fire early in a cycle, or in any cycle where the grind doesn't route through CyberSec,
     and the whole bank converts to nothing. The highest-rep faction is the camp one being
     actively worked (Chongqing: 226,822 vs CyberSec's 54,690 at install #6), so picking by rep
     both removes the failure mode and buys more levels.
   - Checked and **not** a factor: NFG's rep requirement does *not* climb with level. The
     catalog read 10,181 both before install #6 and after (fresh rebuild at 06:21:48), despite
     12 levels going in — so this doesn't get worse each cycle, it's just unguarded. (NFG's
     *price* does scale: the catalog's base went ~×4.23 ≈ 1.14¹¹ across the same install.)

3. **NFG counting / `daedalusGate`.** — see below, unchanged by L7.
4. **No supervision — the Level-2 gap.** — see below. **Now the phase's most important open
   item:** L7 removed the last reason to sit and watch, so the only thing still standing
   between here and genuinely-unattended running is companion supervision.

**Resolved by L7:**

1. ~~**`MIN_TOTAL_GAIN` (1.1) is an unproven degenerate-loop guard.**~~ Still not stress-tested
   at the boundary, but the premise it rested on is now **confirmed**: install #6 armed at
   1.173 and delivered 1.127 actual (1.632 → 1.839). The projection **over-estimates** —
   `nfgLevelsProjected` (15) is money-only and ignores that each NFG level's price escalates
   ~2.28×, so 15 was never purchasable; 11 was. A fire is therefore *less* productive than the
   gain figure claims, which makes 1.1 **less** conservative than it reads. Worth revisiting
   with (5) fixed, since (5) is why the projection is wrong.
2. ~~**Observe-mode trigger flap.**~~ Confirmed live at a **10:21 cadence** and confirmed
   harmless under `auto` (the latch pre-empts it). Still degrades observe-mode evidence; the
   cheap fix is to treat `install-ready` as an arming phase in observe.

**Also settled — the stranded money is inherent, not a bug.** The install wiped **$2.455t**
unspent, which looks alarming and isn't: spend-down stops when the next NFG level costs more
than the remaining bank (live price had escalated past $2.94t), and every discrete aug left
had `deficit > 0` (rep not met), so there was genuinely nothing to buy. An exponential ladder
always strands up to one level's price. **Do not "fix" this.**

---

## The two open gaps in full

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
   - It did not block L7 (Kenneth was watching; `restart daemon.js` recovers).
   - It *does* block genuinely-unattended running, which is the actual prize (sleep ≈ no
     progress; 24/7 is a free ~2× lever) — **and with L7 closed, this is now the only thing
     blocking it.**
   - **Fix is supervisor + reserve bump together, or neither.** The bump alone only helps a
     *human* relaunch. A supervisor alone would detect the death and then fail on RAM. Note
     Phase 25 deliberately declined the bump ("companions launch before the batcher packs
     home — restart daemon.js instead"), which was correct for the problem it addressed; the
     unattended-death case is what it didn't weigh.

---

## What to do next

Phase 25 has no open tests, and gaps (5) and (6) are fixed. What's left:

1. **Watch the next fire (~4-8h) — it's the first run of the gap 5/6 fixes.** `auto` is **on**.
   Two things to read out of it, both from `logs/transactions-2026-07-17.json`:
   - **The real NFG ladder, finally measured.** Each `auto-aug` record now carries `amount`
     (actually paid) beside `projected` (`NFG_PRICE_LADDER`'s 1.9 guess). The ratio across a
     spend-down's NFG run *is* the answer to "what is the true ladder" — take it and set
     `NFG_PRICE_LADDER` from data rather than the current ~2.28 inference.
   - **Which faction NFG got bought from.** Should be the camp faction being actively worked
     (highest rep), not CyberSec.
2. **Fix `nfgLevelsProjected` once the ladder is known.** It's money-only and ignores price
   escalation entirely, which is why install #6 projected 15 levels and bought 11. That
   over-projection is what makes `MIN_TOTAL_GAIN` less conservative than it reads (gap 1).
3. **Gap (4), the supervisor + reserve bump** — the big one, and now the **only** thing between
   here and unattended 24/7 running, which is the actual prize.

**Abort levers, unchanged:** set `ratchet-mode.txt` to anything but `auto`, or create
`augfarmer-pause.txt`.

## Pointers

- Design record + BN1.2 close-out → `phase-25-faction-strategy.spec.md` (the S11 correction is
  in its close-out; its "Live validation" section holds the original L7 checklist, now passed).
- Condensed history → `CHANGELOG.md` (2026-07-17).
- Live bugs/ideas → `BACKLOG.md`.
- Commits: `aeeb632` (horizon ← head), `b5b654d` (dashboard work line), `3feb4b4` (horizon
  counts passive), `902849a` (S11 record), `eb2a853` (reserve gap structural), `1e6d793`
  (NFG counting).
- L7's raw evidence, install #6: `logs/ratchet-log.json` (last record — the `{pre, post}`
  pair), `logs/ratchet-decisions.json` (the `trigger-fire` → `install` chain),
  `logs/transactions-2026-07-17.json` (the 11 NFG buys — with gap (5)'s caveat that the
  amounts are projections).

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
