# Backlog

Tracks feature work and goals across sessions. Update when starting/finishing something;
move finished items to Done with a date instead of deleting them.

## In Progress

_(nothing in progress from this session)_

## Next Up

- **Post-reset auto-backdoor for joinable factions**: after an augmentation install (which
  resets hacking level and, per the user, the eligibility state for these invites), auto-check
  which faction-invite backdoor targets we now qualify for (not yet joined that faction, and
  hacking level high enough to reach/root their server) and install the backdoor as soon as
  eligible. Named targets so far: CyberSec (`CSEC`) and NiteSec (`avmnite-02h`) — scoped to
  exactly these two for now, more can be added later without spoiling anything not yet reached.
  Clarified (2026-07-04): runs standalone *after* a reset (not pre-reset prep); backdoor only,
  no auto-`joinFaction`; should be wired in as a companion process launched from `daemon.js`'s
  startup (same pattern as `targetsmonitor.js`/`moneymonitor.js`), not inlined into `daemon.js`'s
  own file — its Singularity calls (`connect`/`installBackdoor`/`getCurrentServer`) carry the
  same RAM multiplier without SF4 that `daemon.js` already avoids for
  `purchasescripts.js`/`upgradehomeram.js`.
  - **Reverted 2026-07-04**: a `backdoorfactions.js` companion was implemented and wired into
    `daemon.js`, then reverted at the user's request — mid-testing, this chat is for request
    tracking only, not implementation. Design above reflects what was decided/built before the
    revert, kept here so a future implementation doesn't have to re-derive it.
  - Existing scaffolding to reuse: `connect.js` already BFS-pathfinds to a target (its
    `DEFAULT_TARGET` is already `"CSEC"`) but only prints the path — needs adapting to actually
    drive `ns.singularity.connect()` hop by hop. `hosts.js`'s `PORT_OPENERS`/nuke logic can be
    reused to root the target first if it isn't already.

- **Replace moneymonitor.js with a daily transactions log**: retire `moneymonitor.js`
  (remove the file and its `launchDetached` call in `daemon.js`) in favor of a transactions
  log. Specified (2026-07-04):
  - **One file per day** — filename encodes the calendar date, rotates at day boundary,
    unlike `daemon-batch-log.json`'s single ring-buffered file.
  - **Updated live** — written as each transaction happens, not on a periodic
    snapshot/poll cadence like `moneymonitor.js`'s current 5-minute reports.
  - **Income: hacking only for now** — same technique `moneymonitor.js` already uses
    (delta `ns.getMoneySources().sinceStart.hacking`, spend-proof/non-negative).
  - **Expenses: script-driven purchases only for now** — instrument the purchase call
    sites directly (`fleetupgrade.js`, `purchasecloudservers.js`, `purchasescripts.js`,
    `upgradehomeram.js`) to write a record at the moment of purchase. This supersedes the
    earlier, broader idea of deriving expenses from `MoneySource`'s expense-shaped fields
    (`servers`, `hacknet_expenses`, etc.) — narrower scope, and sidesteps the unresolved
    question of whether those fields are pre-negated, since this iteration doesn't use them.
  - **Needs a `vite.config.ts` download-filter entry** — per `CLAUDE.md`'s own logging
    convention, the new daily filename pattern needs to be added to the `download.location`
    function alongside `daemon-batch-log.json`/`targets-summary-*.json`, or the file won't
    get pulled to `logs/` automatically.

- **targetsmonitor "ratio" column → actual priority metric**: Investigated a suspected bug
  (2026-07-04) — "ratio" numbers looked suspiciously round/inconsistent, hypothesis was that
  purchased-but-uninstalled augmentations were leaking in. No bug found: `ratio`
  (`targets.js:92`, `maxMoney / minSecurityLevel`) is purely server-intrinsic, fixed at
  world-gen, with no player-derived input in the formula at all — confirmed against the code
  and against `installAugmentations`'s docs (aug effects apply only on install/reset, never
  on purchase), so neither a hacking level-up nor an uninstalled aug can move it. The real
  driver of "these numbers changed": `getTargets()` sorts by `score` (money-per-GB-second,
  the actual ranking metric) while the display only ever showed the unrelated `ratio` field
  — a level-up reshuffles which targets appear/rank, moving rows around even though no
  individual server's ratio value changes.
  - **Decided**: stop displaying `ratio`; show `t.score` instead (labeled to reflect that
    it's what actually determines target priority — exact label TBD at implementation,
    e.g. "priority"). Apply to both `targetsmonitor.js`'s live dashboard and `targets.js`'s
    own `main()` summary for consistency.

## Ideas / Backlog

- **Monitor cleanup + more meaningful logging**: `daemon.js`'s tail popup is very verbose
  and some numbers look stale or reset next cycle — concretely: the `durations:` line reads
  `batchTarget.hackTime/growTime/weakenTime`, only refreshed in `refreshCycle()` (up to
  `CYCLE_MS`/10s stale vs. the rest of the popup's `BATCH_INTERVAL_MS` redraw); and the
  `batch #N` block always shows `lastBatch`, which persists from whenever the last real
  launch happened, with no cue when it's not this tick's launch. Wants an out-of-game
  (maybe live) dashboard. Candidate logs discussed (2026-07-04) — the $ transactions log
  idea has since been specified into its own item above ("Replace moneymonitor.js with a
  daily transactions log"); remaining open ideas:
  - **RAM utilization time series**: `utilization` is computed every tick in `daemon.js` but
    only displayed, never logged as its own series — needed for a dashboard chart.
  - **Per-target income/efficiency log**: `batch` events log expected steal but nothing
    closes the loop on realized money per target over time, to sanity-check the ranking
    score against real outcomes.
  - **Prep-cycle duration log**: how long each drift→prepped transition actually takes;
    currently only visible live in the popup's prep-dispatched lines and lost once prepped.

## Done (recent)

- **Batcher refactor Phase 4 — Formulas.exe math with legacy fallback** (2026-07-04): all
  runnable and observed acceptance criteria satisfied. Direct same-session comparison showed
  the churn fix (0 flips/16min formulas vs. 9/16min legacy) and reserve-ballooning fix
  (`depth` constant at 111-112 in formulas vs. swinging 31→209 in legacy) working exactly as
  designed. See `batcher-refactor-phase4.md`'s handoff section for full details.
  - **Waived, not done**: fleetupgrade-while-running live test (cash constraint) — revisit
    after next game reset. The guard's motivating failure (crash on a stale renamed host) was
    confirmed live against an unpatched daemon; the patched daemon's actual survival wasn't.
- Phase 1–3 of the batcher refactor (pipeline reservation waterfall, efficiency-score
  ranking, shrink gating) — see `batcher-refactor-phase1.md` through `phase3.md`.
