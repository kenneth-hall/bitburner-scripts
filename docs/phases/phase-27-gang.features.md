# Phase 27 features: Gang manager (brainstorm)

**Stage:** Stage 1 (brainstorm) of the three-stage workflow in `CLAUDE.md`. No spec exists yet.

**Status:** Scope is decided (build the gang manager; don't touch the batcher). The RAM-conflict
question that opened this session is **decided**. Task-assignment policy, territory-warfare
policy, and one mechanics unknown (aug-install vs. gang stats) are **open questions** for the
next session — resolve #1 before drafting the spec, since it changes whether the manager can run
alongside the aug-ratchet at all.

---

## Why this phase was raised

BN2 commitment closed 2026-07-19 (hacking gang via NiteSec, `isHacking: true`, permanent — see
CLAUDE.md "Current goal"). The gang exists; nothing is running it. Gang state at handoff:
respect 1, territory 14.3%, **zero members recruited, nothing running.**

A first Phase 27 attempt was drafted and invalidated twice before this one: it assumed every
gang threshold was empirical ("observe first, derive later"). That premise was **false** —
`docs/gang-api.md` (full-surface read, 2026-07-18) shows `GangTaskStats` exposes exact base
yields + per-stat weights, and `ns.formulas.gang.*` computes yields outright once Formulas.exe is
affordable. This doc starts from that corrected foundation.

## Goal

**Scope for Phase 27 is Tier 1 only: recruit + task-assign.** Ship a gang-manager script that
recruits members and assigns tasks (money ladder + wanted-sink balance) as a daemon-launched
companion, following the RAM approach decided below. Equipment, ascension, and territory are
**deferred to later phases** (see "Build order / phase breakpoint"), not milestones inside this
one — Tier 1 is independently shippable and doesn't share a blocking dependency with the rest.
Not in scope for this phase: the batcher/XP-farm engine itself, which stays untouched.

## Decided

- **RAM approach: reserve, don't disable.** Phase 20's XP-farm deliberately saturates 100% of
  surplus fleet RAM, so a new resident script genuinely has nowhere to land today — the instinct
  that raised this was correct. But the gang manager's own footprint is small (per
  `docs/gang-api.md`: `setMemberTask`/`purchaseEquipment`/`ascendMember` are 2-4 GB each,
  `nextUpdate` is 0 GB, task assignment is a ~7×20 brute-force eval) — nothing like the one-off
  29 GB `gangaugs.js` sweep. Disabling a large slice of the batcher would throw away Phase 20's
  measured income/XP value and open a money gap during the gang's ramp-up (0 members today, so 0
  gang income today). **Decision: carve a small fixed RAM slot for the gang manager (home or one
  fleet server); the Phase 20 saturation logic in `scheduler.js`/`hosts.js` skips that
  reservation.** Batcher stays fully on, framework/conventions untouched. Confirmed by Kenneth
  2026-07-19 ("reserve is fine").
- Gang type is fixed forever: NiteSec, hacking gang, no `leaveGang()`.
- **Recruitment pace: greedy.** Recruit whenever `canRecruitMember()` is true. Founding members
  are free; later recruits are gated by `respectForNextRecruit()`, which is the game's own
  throttle — no separate manual pacing needed.
- **Max gang members isn't a design question.** Undocumented cap, discover it empirically
  (`canRecruitMember()` going `false`) as a loop condition — not something to resolve up front.
- **Dashboard: log-only for Tier 1, no panel yet.** Per the Phase 24 observability convention,
  dashboard space needs an explicit brainstorm decision, not a silent add. Lean: respect/money/
  member count/wanted level go to a log file (same pattern as `gangprobe.js`); revisit dashboard
  space once gang income is a meaningful share of net worth, not on day one.
- **RAM: no new mechanism needed — reuse `hosts.js`'s existing `HOME_RESERVE_GB`.** Live check
  2026-07-19 (`logs/daemon-batch-log.json`, 8:35 PM snapshot): fleet budget 33,196 GB (batcher
  24,897 GB, share pool ~8,296 GB, XP farm 0 threads); free/unclaimed fleet-wide ~52 GB but
  volatile cycle-to-cycle. `hosts.js` already carves a static `HOME_RESERVE_GB = 80` out of home
  that the batcher can't touch — the exact bucket a permanent companion script belongs in (same
  class as `cloudmanager.js`/`dashboard.js`). A Tier 1 gang manager's static `ns.gang.*` footprint
  is ~13 GB of calls + ~1.6 GB script base ≈ **~15 GB**; fully built through Tier 4 (+ equipment +
  ascension calls) tops out around ~30 GB. **Decision: bump `HOME_RESERVE_GB` 80 → 100**, run
  `gangmanager.js` as a daemon-launched companion inside that reserve. Fleet-side batcher behavior
  is unaffected — this never touches the volatile waterfall pool.

## Build order / phase breakpoint

The full gang manager splits into 4 tiers by information-readiness and risk, not equal effort.
**Phase 27 ships Tier 1 only** — the rest are future phases, not milestones inside this one:

1. **Tier 1 — recruit + task-assign (this phase).** Everything needed is already known: full task
   table measured (`docs/gang-api.md`), wanted-sink logic identified (Ethical Hacking dominates
   Vigilante Justice). No blocking open question. Gets respect/money flowing.
2. **Tier 2 — equipment (future phase).** Blocked on the `gangprobe.js` cost/type fix (open
   question #2 below).
3. **Tier 3 — ascension (future phase).** Blocked on open question #1 (install-degrade recon,
   above) — don't design ascension policy until that's answered.
4. **Tier 4 — territory warfare (future phase, lowest priority).** Least understood mechanic
   (undocumented death-on-clash odds) and lowest value for a hacking gang whose payoff is
   money/rep, not territory. May end up deferred indefinitely rather than built.

## Open questions (resume here)

1. **⚠️ Does installing an augmentation degrade gang members?** `GangMemberInstall`'s fields read
   as a *decrease* to ascension multipliers, but the in-game doc says gang stats "will not reset"
   on install. Reduce ≠ reset, so both could be true — unverified. **Resolve before drafting the
   spec**: the aug-ratchet installs on every cycle, so if installs degrade the gang, the two
   systems fight each other and the manager needs to account for it (e.g. re-ascend/re-equip
   after every install) rather than assuming install-immunity.

   **Terminology note (easy to blur):** Ascension (`ascendMember`) and aug install are two
   separate mechanics on two separate actors. Ascension is a **gang-member**-level action we
   trigger deliberately — permanently boosts that member's stat mults, at the cost of wiping
   their base stats/equipment and burning earned respect. Aug install is a **player**-level reset
   (the ratchet's normal cycle) — unrelated trigger, unrelated actor. This question is
   specifically whether action B (install) erases progress from action A (ascension) — the test
   below needs both steps, in that order, or there's nothing to observe a degradation *of*.

   **Recon plan (not implementation — same class as `gangprobe.js`/`gangaugs.js`):**
   1. Recruit 1 founding member (free — no respect cost). ⚠️ No `removeMember`/`fireMember` call
      exists anywhere in the gang API, only `renameMember` — recruiting is one-way, same as
      `createGang`. Not a real cost here (we want members anyway), but stating it before acting
      on it.
   2. Assign them a task, let them ascend once via `ascendMember` so `*_asc_mult` moves off 1.0.
   3. Snapshot `getMemberInformation` to a log file.
   4. Force an install via `installer.js`'s manual trigger (bypasses the ratchet's normal
      trigger conditions — see `docs/reset-protocol.md` / prior phase notes).
   5. Snapshot `getMemberInformation` again, diff against step 3.
   - Write this as a small logged probe script (extend `gangprobe.js` or a new
     `gangascendprobe.js`), not ad hoc CDP terminal commands — keeps the result citable for Fable
     rather than a paraphrase of what was watched happening live.
   - This blocks Tier 3 (ascension), not Tier 1 — can run in parallel with Tier 1 spec/implement,
     doesn't have to finish first.
2. **`gangprobe.js` is missing `cost`/`type` per equipment item** (only captures `name` + `mults`).
   No purchase logic can be written until it also calls `getEquipmentCost`/`getEquipmentType`.
   Fix the probe before the spec depends on it.
3. **Task-assignment policy — the central design tension, and the one real open item left for
   Tier 1.** Money ladder tops out at Money Laundering (360/tick, 8× the next best). Respect
   comes almost solely from Cyberterrorism (0.01, 10× Money Laundering) at a brutal 6 wanted.
   Only two wanted-sinks exist (Ethical Hacking, Vigilante Justice; Ethical Hacking dominates —
   same reduction, more money, higher hack weight). **Default direction to hand to the spec
   stage** (not a full answer — exact thresholds need the weight-table math, that's Fable's job):
   solo money-ladder climb per member, gated by a stat-readiness check so nobody's assigned a
   task above their level; a wanted-level watchdog switches any member to Ethical Hacking once
   wanted crosses a threshold (TBD via `wantedPenalty`). **Cyberterrorism/respect-maximizing is
   out of Tier 1 entirely** — it only pays off once recruiting more members matters, and 6 wanted
   is a steep price for a v1.
4. **No Formulas.exe yet** ($5,695 held vs. $5b needed). Near-term manager must reconstruct yield
   from the weight table and validate against `GangMemberInfo`'s per-member actuals
   (`respectGain`/`moneyGain`/`wantedLevelGain`) rather than call `ns.formulas.gang.*` directly.
   Revisit once affordable.
5. **Territory warfare on/off.** Territory affects most productivity stats (`GangTaskStats`
   carries a `territory` weight per task) and `getChanceToWinClash` gives exact odds — but the
   in-game doc warns members can die in a clash even when the gang wins, and no API exposes the
   death probability. Needs a policy, not just a toggle. (Tier 4, deferred.)
6. ~~RAM reservation specifics~~ **RESOLVED 2026-07-19 — see Decided.**

## Rejected framings

- **"Observe first, derive thresholds later"** — the original Phase 27 draft's premise, invalidated
  twice by facts sitting unread in `markdown/`: `GangTaskStats` + `ns.formulas.gang.*` make almost
  everything computable, not empirical (see `docs/gang-api.md` → "What this means for design").
- **"Disable a lot of the old engine for RAM"** — Kenneth's opening framing this session, revised
  in conversation: the RAM conflict is real (Phase 20 saturates 100% of surplus fleet RAM by
  design) but the gang manager's actual footprint doesn't justify disabling the batcher. Replaced
  by the RAM-reservation decision above.

## Related in-repo

- `docs/gang-api.md` — full API surface + measured task/equipment tables; read before drafting
  the spec.
- `logs/gangprobe-1784473065811.json` — live static dump (15 tasks, 32 equipment, `errors: []`).
- `src/gangprobe.js` (needs the cost/type fix, #2 above) · `src/gangcreate.js` · `src/gangaugs.js`
  · `src/gangreach.js`.
- `BACKLOG.md` → "Gang manager" entry (Game / progression section).
- CLAUDE.md → "Current goal" block for the BN2 commitment history.
