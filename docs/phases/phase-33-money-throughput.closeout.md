# Phase 33 — close-out (2026-07-21)

**Read this first if picking up Phase 33 cold.** The spec (`phase-33-money-throughput.spec.md`)
is the design record; the features doc is the brainstorm/decision log. This is the *handoff* —
what shipped, what the same-session live run proved, and what's left as a follow-up rather than a
blocker.

**Status:** Workstreams A (escalation-aware buy ordering) + C (utility must-buys) shipped in one
commit to `master`. **T1 (`npm test`) and the RAM/live gates the spec designated as ship-blocking
(R1, R2, V1) are all confirmed** — see the table below. V2/V4/V5 need real cycle time (hours to a
day) the session couldn't wait for; they're logged as open follow-ups, consistent with the spec's
own stated ship gate ("the merge waits only on R1/R2 + V1 ... reverting the sort is a one-commit
rollback if V4 shows wrong order").

---

## Acceptance criteria — final check

| Criterion | Result |
|---|---|
| T1: `npm test` green, incl. every work-item-7 unit | ✅ 834/834 (261 in `augfarmer.test.js`, up from 232) |
| T2: `npm run verify:log` green post-deploy | ⚠️ 2 pre-existing, unrelated failures (see below) — same two BACKLOG already tracked before this phase touched anything |
| R1: `augfarmer.js` unchanged at 64.10 GB | ✅ `logs/ramcheck-result.json`, live-read after restart |
| R2: WD-gate probe ≤ 2.0 GB | ✅ 1.8 GB (`worldprobe.js`, reused — see deviation below) |
| V1: de-stall — head no longer QLink-with-$325t-reserve within one poll of restart | ✅ **immediate**: head flipped to SPTN-97 Gene Modification ($63.53b, `fundCapSource: "income"`), `finance-state.json` confirmed the reservation dropped from $325.802t to $63.531b |
| V2: spend-down buys Neuroreceptor → CashRoot → Red Pill first | ⏳ not yet observed — no install has fired this session; live `mustBuyCost` ($10.263b) matched the spec's hand-worked example ($10.27b) almost exactly, which is strong indirect evidence the arithmetic is right, but the actual buy-order sequence is unobserved |
| V3: WD gate reading | ℹ️ informational only, as the spec says. `w0r1d_d43m0n` doesn't exist yet (pre-Red-Pill, expected) — but the probe now works AND its output actually reaches `logs/` for the first time (see deviation below), so the checkpoint is ready to fire the moment Red Pill installs |
| V4: buy-order arithmetic across a full post-install cycle | ⏳ needs a real cycle |
| V5: 24h unattended soak | ⏳ needs real wall-clock time |

**T2 detail:** the two `verify:log` failures (`verify-finance.test.js`'s `next-aug` reservation-key
gap, `verify-transactions.test.js`'s $0 Red Pill amount) both predate this phase — confirmed by
running the exact same suite against a `git stash` of this phase's changes, which reproduces both
identically. Already tracked in `BACKLOG.md`; not touched here, per the same "flag rather than
silently loosen the checker" convention Phase 26 used.

---

## The live sequence (same session, 2026-07-21)

```
15:34:27  npm run dev restarted (picks up the new vite.config.ts download filter)
15:35:03  augfarmer.js restarted -- new code live
15:35:03  TARGET: SPTN-97 Gene Modification (NiteSec)   <- was QLink before restart
15:35:05  FINANCE: released next-aug (QLink) -- now reserving $63.531b for SPTN-97 Gene Modification
```

`augfarmer-state.json` immediately after: `target.fundBlocked: false`, `target.fundCap:
70,693,985,841`, `target.fundCapSource: "income"`, `target.livePrice: 63,531,487,500` — the
fundability guard picked the biggest live-price rep-met aug still under the 4h income lookahead,
exactly as V1 specifies. `trigger.mustBuyCost: 10,262,778,750`, `trigger.mustBuyCap:
67,463,849,204`, `trigger.mustBuyHold: false` (money — $26.07b per `finance-state.json` — already
clears `mustBuyCost`, so no cycle-end hold was needed this time; the hold path itself is unit-
tested but not yet observed live).

No `target-capped` decision record fired — correctly: the head was never QLink to begin with once
the tiered sort ran (SPTN-97 sorts into tier 0, QLink into tier 2), so the "head becomes
fundBlocked" edge condition that record exists for didn't occur. QLink is simply buried in the
candidate list's tier 2 now, unreachable until income × 4h clears ~$25t (the settled deferral,
now enforced by code instead of by convention).

---

## Deviation from the spec: work item 6 reused an existing script

The spec called for a new `src/wdgate.js`. `docs/scripts.md` already listed `worldprobe.js`
(pre-BN2, from the BN1.3 close-out) doing exactly what work item 6 asked for —
`getServerRequiredHackingLevel` + `hasRootAccess` + hacking level, read-only, logged. Writing a
second file identical in purpose would have violated CLAUDE.md's "check the script library before
writing a one-off" rule, so `worldprobe.js` was reused and fixed instead of duplicated:

1. **Its export was silently broken.** It wrote to `logs/worldprobe-*.json` directly (the literal
   string as the in-game filename) instead of the bare-filename + `vite.config.ts`-filter
   convention every other one-shot probe uses. Since no filter existed for either form, its output
   had **never** actually synced to disk since it was written — confirmed by grepping
   `vite.config.ts` (no match) and the `download` log's `(ignored)` entries for every past
   `worldprobe-*.json`. Fixed: bare filename in the script, a new filter line added.
2. **RAM measured 3.8 GB against the ≤2.0 GB gate** — the extra `ns.getServer(host)` call (for
   `backdoorInstalled`/`numOpenPortsRequired`, neither of which this checkpoint needs) was the
   whole excess. Dropped; re-measured at 1.8 GB.

Both fixes are logged in `worldprobe.js`'s own header. Net effect: the WD-gate checkpoint is
cheaper AND, for the first time, actually reaches `logs/` — verified live by running it (server
doesn't exist yet, gracefully reported, and the resulting file appeared in `logs/` within the
next auto-export cycle).

---

## What's next

1. **V2/V4/V5** are pure observation — no code is expected to change unless V4 shows the buy
   order coming out wrong (spec's own stated rollback: revert the sort, one commit). Check
   `transactions-*.json` after the next install for the Neuroreceptor → CashRoot → Red Pill
   sequence, and `ratchet-decisions.json` for any `mustbuy-hold` / `mustbuy-hold-waived` /
   `target-capped` records that accumulate over the next cycle or two.
2. **Workstream B (gang money-objective retargeting)** is Phase 34, unstarted — its own
   features doc begins with the Formulas money-at-task probe (features OQ2).
3. **BACKLOG.md** gained two notes (NFG-tail entry: spend-down now has a must-buy head; gang
   Tier-4 survivor entry: the ascension-cadence check gains urgency from decision 8's expected
   cadence speedup) — no new entries, just cross-references.

## Pointers

- Design record: `phase-33-money-throughput.spec.md`. Brainstorm/decisions: same-named
  `.features.md`.
- Condensed history: `docs/phases/CHANGELOG.md` (2026-07-21 entry).
- Raw evidence: `logs/augfarmer-state.json` (post-restart target flip), `logs/finance-state.json`
  (reservation drop), `logs/ramcheck-result.json` (R1/R2), `logs/worldprobe-*.json` (the probe's
  first-ever successfully-synced output).
