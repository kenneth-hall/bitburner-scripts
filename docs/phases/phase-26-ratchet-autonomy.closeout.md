# Phase 26 — close-out (2026-07-18, BN1.3 cleared same day)

**Read this first if picking up Phase 26 cold.** The spec (`phase-26-ratchet-autonomy.spec.md`)
is the design record; the features doc is the brainstorm/decision log. This is the *handoff* —
what shipped, what the live run proved, and two things the spec didn't anticipate that the clear
itself surfaced.

**Status:** A2 + B2 shipped and merged (`9ac35c6`), B1 shipped and merged (`1619b2a`), both
live-validated the same session. **BN1.3 cleared 2026-07-18, ~10:41 AM** — `w0r1d_d43m0n`
backdoored, landed on the BitVerse/BitNode-selection screen. This is the first time this ratchet
has ever run an install-to-BN-clear sequence start to finish, and it needed **two manual
installs beyond what the spec's automated path covers** to get there — both are design gaps
worth carrying into whatever comes next, not just a footnote.

---

## The live sequence

### Install #10 — the gate-release fire (A2's validation)

```
8:46:07  trigger-arm    gateArmed: true, totalGain 1.094 (< MIN_TOTAL_GAIN 1.1)
8:56:08  trigger-fire   sustained 600.3s/600s
8:56:08  spend-down-start
8:56:18  installer-exec  pid 1018692
8:56:18  install         augs 29 -> 38 installed, mult.hacking 8.376 -> 9.161
```

Exactly what the spec's S1/S2 predicted: `gainArmed` false (the queue was zero-score
gate-fillers, `totalGain` never came close to the gain floor), `gateArmed` true (queued augs
closed Daedalus's count gate), and the fire happened on the gate-release reason alone. Recovery
was clean and fast — Daedalus rejoined within ~2 minutes (8:58:19), confirming the accumulated-
mult payoff: each install makes the next re-climb faster, and by install #10 that means minutes,
not the hours `docs/reputation-favor.md` measured back on 2026-07-11.

### Install #11 — banking Daedalus favor (not in the spec, a live strategic call)

Kenneth caught this mid-session: `docs/reputation-favor.md` already documents the shortcut
(462,500 rep banks 150 favor on install; 150 favor unlocks donation; donating a trivial amount
then buys the full 2.5m rep Red Pill requires, instead of grinding it organically). Daedalus rep
was at 644k — well past the threshold — but **`endgameHold` is now permanently true** (hacking
never drops below 2500 again this cycle) and there's no other faction gate left to release, so
the automated trigger has **no path to fire again on its own**. The ratchet would have just
ground the full remaining ~1.86m rep organically at `faction_rep` mult 3.293 — likely hours.

Fix: `run installer.js` manually. It only checks `ratchet-mode.txt == "auto"` (already true) —
it does **not** check whether the ratchet's own trigger fired, so a manual run works standalone
in auto mode (its own header comment says as much: "defense in depth against a stray manual `run
installer.js` in *observe* mode" — silently implying auto mode has no such guard). This banked
~166 favor from the 644k rep. Confirmed the payoff immediately: `augfarmer.js`'s existing S6
auto-donate route (unchanged, no new code) fired the instant Daedalus was rejoined and favor
cleared 150 — donated $750.25b for instant 2.5m rep, then bought EMBA Core V3 Upgrade, **The Red
Pill**, and EMBA DMA Upgrade in the same pass, all within ~10 minutes end to end.

### Install #12 — activating the Red Pill (a correction, caught mid-session)

Assumed (from `backdoorwd.js`'s header comment, loosely worded — "harmless before Red Pill is
**bought**") that owning the Red Pill would be enough for `w0r1d_d43m0n` to spawn. Wrong: the
file's own inline comments say **"Red Pill not installed"** / **"waiting for The Red Pill
install"** — it needs to be *installed*, not merely queued. `worldprobe.js` confirmed WD didn't
exist ~3 minutes after the buy, which is what caught this. `docs/reputation-favor.md`'s own
"Sequencing catch" section already said this correctly ("The Red Pill needs its **own** install
to spawn w0r1d_d43m0n") — it was read, then under-weighted in the moment. Ran `installer.js`
manually again to install the 3 queued augs (Core V3 Upgrade, DMA Upgrade, Red Pill);
`mults.hacking` 9.161 → 10.077. `backdoorwd.js` (already resident, hacking already far past its
requirement) fired on its own within the next poll — no further manual action.

```
10:27:36  install #11   augs 38 -> 39 (favor bank only, nothing new queued), mult unchanged
10:31:17  donation      $750.25b to Daedalus -> instant 2.5m rep
10:31:27  BUY  Embedded Netburner Module Core V3 Upgrade  $7.5b
10:31:37  BUY  The Red Pill                                $0
10:31:47  BUY  Embedded Netburner Module DMA Upgrade       $25.27b
10:36:16  install #12   augs 39 -> 42, mult.hacking 9.161 -> 10.077 (Red Pill activated)
~10:41    w0r1d_d43m0n backdoored -- BN1.3 cleared
```

---

## Acceptance criteria — final check

All from the spec's acceptance criteria list, verified directly rather than assumed:

| Criterion | Result |
|---|---|
| `npm test` green (S10's full list, per branch) | ✅ 656 (A2+B2) / 635 (B1) individually, 664 merged |
| Rail: `installAugmentations` only in `installer.js` | ✅ `grep -rn` confirms — one real call site, rest are comments |
| RAM flat: augfarmer.js 64.10 GB, daemon.js 16.3 GB | ✅ `logs/ramcheck-result.json`, live-read before each restart |
| A2 validated: `trigger-arm`/`trigger-fire` with `gateArmed: true` under `endgameHold: true`, `totalGain` < `MIN_TOTAL_GAIN`, install lands, Daedalus invites | ✅ exactly this shape, install #10 |
| The clear (secondary but expected) | ✅ **happened** — BN1.3 fully cleared, not just "expected" |
| B2 validated at the negative: zero false `stall-warning` | ✅ `ratchet-decisions.json` — 0 `stall-warning` records the whole session |
| B1 validated: L5's two kill-recoveries, L4's soak shows zero spurious relaunches | ✅ `transactionsmonitor.js` + `augfarmer.js` (mid-grinding) both relaunched within one 60s tick, state intact |
| `npm run verify:log` green | ✅ after fixing a real gap it surfaced (see below) |
| Doc reconciliations landed | ✅ `docs/scripts.md`, `docs/reset-protocol.md`, `BACKLOG.md`, `CHANGELOG.md` |

**One real gap `verify:log` caught, fixed same session:** A1's `auto-aug-gate` transaction source
was never added to the checker's whitelist, so the live gate-buy transaction failed the check.
Fixed (`test/verify-transactions.test.js`). A second failure (a legitimate $0 Red Pill record
from 2026-07-15, unrelated to this phase) was flagged in BACKLOG rather than silently loosening
the checker's strictness.

---

## Gaps this phase's own live run surfaced (not spec defects — carry forward)

1. **The automated ratchet has no path to the favor-donation shortcut.** Once `endgameHold`
   latches permanently (Daedalus joined or hacking ≥ 2500, and neither ever reverses within a
   cycle), and no other FACTION_SCOPE count-gate remains closable, the trigger simply cannot
   fire again — even though `docs/reputation-favor.md`'s shortcut is sitting right there and
   dramatically faster than the organic grind. This session's fix was a human (well, Claude)
   manually running `installer.js`. **Not automated. Should it be?** Candidate: a fourth arming
   reason — "Daedalus joined, rep ≥ `calculateFavorToRep(150)`, no aug queued this cycle worth
   waiting on" — but that's real design surface (when to stop banking rep vs. install), not a
   patch. Filed as an open question, not a bug.
2. **`backdoorwd.js`'s own header comment says "before Red Pill is bought" when the real
   condition is installed.** The file's *inline* comments (lines 52/59) already say the right
   thing; only the header summary is loose. One-line doc fix, not logic — the code was always
   correct, only the summary comment mismatched it. Worth fixing next time this file is touched,
   not urgent enough to reopen a branch for.
3. **`companion-relaunch` log events get FIFO-evicted from `daemon-batch-log.json` within
   minutes on a busy fleet** (found during L5, already in BACKLOG with its own entry — not
   repeated here).

None of these blocked the clear. All are filed in `BACKLOG.md`.

---

## What's next

BN1.3 is cleared. The BitVerse/BitNode-selection screen is up — **entering the next BitNode is
Kenneth's call, not automated, and not decided here.** `CLAUDE.md`'s "Current goal" line needs
updating to reflect this (done alongside this close-out) — the previously-superseded "stop at
1.2, go to BN5" plan is back on the table now that 1.3 is actually done, but re-deciding that is
a separate conversation, not a default.

**Abort levers, unchanged and still valid** (irrelevant now that the node is cleared, but
carries forward to whatever node comes next): `ratchet-mode.txt` ≠ `auto`, or
`augfarmer-pause.txt`.

## Pointers

- Design record: `phase-26-ratchet-autonomy.spec.md`. Brainstorm/decisions: same-named
  `.features.md`.
- Condensed history: `docs/phases/CHANGELOG.md` (2026-07-18 entries).
- Live bugs/ideas surfaced here: `BACKLOG.md`.
- Commits: `9ac35c6` (A2+B2), `1619b2a` (B1), `b24561f` (merge), `6552cc2` (L4/L5 doc record),
  `10dac56` (verify:log fix).
- Raw evidence: `logs/ratchet-log.json` (installs #10-12, `{pre,post}` pairs),
  `logs/ratchet-decisions.json` (the full `trigger-arm` → `install` chain for #10, the donation
  record for #11's payoff), `bb-shot.png` (the BitVerse screen).
