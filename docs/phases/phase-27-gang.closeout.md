# Phase 27 Tier 1 — close-out (2026-07-20, gang manager live and stable)

**Read this first if picking up Phase 27 cold.** `phase-27-gang.spec.md` is the design record;
`phase-27-gang.features.md` is the brainstorm/decision log. This is the *handoff* — what shipped,
what the live run proved, and one real bug the live run found and fixed mid-session.

**Status:** Tier 1 (recruit + task-assign) shipped and merged. `gangmanager.js` has run
continuously since first launch (2026-07-19, ~9:31 PM) through this close-out (2026-07-20,
~10:06 AM) — 7 members, respect climbed 1 → 1,864.6, `moneyGainRate` up to ~1,586/tick, three
members holding rung 2 (Identity Theft) and the rest climbing behind them. Equipment, ascension,
and territory (Tiers 2-4) are explicitly out of scope for this phase — see Tier boundary rail
below.

---

## The live sequence

### Deploy (L1-L2)

Home RAM bought 32 → 64 GB for $10.083m (one tier, UI click, well under the spec's $500m guard).
`daemon.js` restarted; `gangmanager.js` landed in its priority slot on the first try. Measured RAM
matched prediction almost exactly: `gangmanager.js` 12.7 GB (predicted ~12.7), `daemon.js` flat at
16.3 GB. Full resident census (daemon + 6 companions + gangmanager, excluding the displaced
`xpfarm.js`) summed to 59.1 GB against the spec's 63.5 GB gate — comfortable margin, no fallback
needed.

### The live bug — wanted-sink baseline froze at tick zero

Within its first ~8.5 hours, the gang got permanently stuck running `Ethical Hacking` (the
wanted-reduction sink task) and never climbed the money ladder. Root cause: `evalSink`
recalibrated its `wantedPenalty` baseline only on a **strictly new minimum** `wantedLevel`. A
fresh gang starts *at* its wanted floor (1) on tick one, so that condition can mathematically
never fire again once first touched — the baseline stayed pinned to the pre-recruitment tick-zero
reading (`wantedPenalty` 0.5) forever, while the live `wantedPenalty` drifted upward with real
gang activity (apparently a function of gang growth, not of `wantedLevel`, which stayed pinned at
the floor throughout). Deviation from that stale baseline never dropped below the exit threshold.

Fix: compare "at or below" the lowest `wantedLevel` seen, not strictly below, so the baseline
keeps tracking `wantedPenalty` every tick the gang is calm (at its floor) instead of freezing the
instant the floor is first touched. Redeployed live; within a minute the gang climbed to Phishing
for the first time the whole run, and has kept climbing since. Full diagnosis in the fix commit
(`678bfbd`) and `evalSink`'s doc comment.

### L5 — the off-marker lever (mechanism correction)

The spec assumed `nano <file>` + a UI Save click to drop `gang-off.txt` over CDP. In practice this
build's terminal has no `write` command (confirmed by trying it), but `nano`+Save was never
actually exercised either — the faster, more reliable path Kenneth pointed out: write the marker
under `src/`, since viteburner already watches `src/**/*.txt` and pushes it straight to
`@home:/gang-off.txt` (same mechanism as `share-off.txt`/`xp-off.txt`, git history shows
`share-off.txt` was created this exact way before). Deletion synced automatically too — `rm
gang-off.txt` on the live terminal reported "File does not exist" because viteburner had already
propagated the local delete. Verified: `offMarker: true` reflected within one tick, zero `recruit`
events across the observation window, both toggle events logged (`off-marker` records at
06:36:47/06:39:11), and task reassignment resumed immediately on removal (one member reached
Identity Theft within the same tick the marker cleared).

---

## Acceptance criteria — final check

| Criterion | Result |
|---|---|
| `npm test` green (S10's full list) | ✅ 702 tests, 26 files |
| Tier rail: no `purchaseEquipment`/`ascendMember`/`setTerritoryWarfare` in `gangmanager.js` | ✅ `grep -n` confirms zero matches |
| RAM: `gangmanager.js` ≤ 14.0 GB, `daemon.js` = 16.30 GB flat | ✅ 12.7 GB / 16.3 GB measured |
| Census: resident sum ≤ 63.5 GB | ✅ 59.1 GB (xpfarm displaced, accepted per spec's own fallback — no escalation needed) |
| Resident, not waiting: `gangmanager.js` in `ps("home")`, no supervisor relaunch events | ✅ confirmed at L2 and again ~30 min later |
| Recruit + assign live | ✅ founding members recruited immediately, ladder-assigned |
| Promotion live: ≥1 `promote` event with baseline/probe means | ✅ 11 `promote` events across the run (post-fix) |
| Watchdog: healthy cycling, no member stuck "Unassigned" | ✅ 126 `sink-enter` / 127 `sink-exit`, no flapping, no stuck member (post-fix) |
| Ratchet still dormant | ✅ `augfarmer.js` absent from `ps("home")` throughout |
| Off-marker lever | ✅ L5, see above |
| `npm run verify:log` green | ✅ `verify-gang.test.js` passes against the real exported files |
| Doc reconciliations landed | ✅ `docs/scripts.md`, `BACKLOG.md`, this close-out, `CHANGELOG.md` |

**One real bug found and fixed live, not swept under the rug:** the wanted-sink baseline freeze
above. Not a spec defect in the sense of a missed requirement — S2 explicitly flagged its
constants as provisional and expected live recalibration — but the failure mode (permanent lock,
not just slow convergence) was worse than the spec's own risk note anticipated ("slow to drain,"
open question 5). Fixed same session, live-verified, committed separately (`678bfbd`).

---

## Gaps this phase's own live run surfaced (not spec defects — carry forward)

1. **`open question 5` (wanted-sink capacity asymmetry) is now the baseline-tracking bug above,
   not a separate concern** — closed by the fix, but keep watching the sink duty cycle
   (`sink-enter`/`sink-exit` counts in `gang-log.json`) for a real sustained >50% figure, which
   would indicate the underlying rate asymmetry (Money Laundering +1.25 wanted/tick vs. Ethical
   Hacking -0.001) is genuinely binding, not just a stale-baseline artifact.
2. **This build's terminal has no `write` command** — any future spec that assumes `write <file>`
   as a live step should assume `nano`+Save or the `src/*.txt` viteburner-sync path instead (see
   L5 above). Worth a one-line correction in `tools/bb/README.md` if this recurs.
3. **`wantedPenalty`'s relationship to `wantedLevel` is not simply monotonic** — observed
   `wantedPenalty` continuing to change even while `wantedLevel` sat exactly at its floor. Still
   unexplained (respect? territory? gang size? all held roughly constant during the observed
   drift). Doesn't block Tier 1 (the fix works regardless of the underlying cause), but worth
   knowing before Tier 2+ tries to model `wantedPenalty` more precisely.

None of these blocked the close-out. All are filed in `BACKLOG.md`.

---

## What's next

Tiers 2-4 (equipment, ascension, territory) are deferred, in that build order — see `BACKLOG.md`'s
"Gang manager Tiers 2-4" entry for each tier's blocker. None is scheduled; each needs its own
brainstorm before starting, per the project's three-stage workflow.

**Abort lever, unchanged and still valid:** `gang-off.txt` (create via `src/gang-off.txt` +
viteburner sync, or in-game `nano`+Save) suppresses all `gangmanager.js` actions while it keeps
observing/logging.

## Pointers

- Design record: `phase-27-gang.spec.md`. Brainstorm/decisions: `phase-27-gang.features.md`.
- Condensed history: `docs/phases/CHANGELOG.md` (2026-07-20 entry).
- Live bugs/ideas surfaced here: `BACKLOG.md`.
- Commits: `54725cc` (Tier 1 implementation), `678bfbd` (the baseline-freeze fix).
- Raw evidence: `logs/gang-state.json` (current snapshot), `logs/gang-log.json` (full event
  history — recruit/promote/demote/sink/off-marker), `logs/ramcheck-result.json` (RAM census).
