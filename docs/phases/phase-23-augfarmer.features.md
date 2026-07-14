# Phase 23 — Auto augmentation farmer (`augfarmer`)

**Stage:** Brainstorm (opus). Output of a design conversation with Kenneth, 2026-07-13.
Next stage: spec + `spec-reviewer` cold review.

## Goal

An always-on Singularity companion that, unattended, drives the aug-acquisition half of the
BN1.2 loop: **grind faction rep → join factions → buy the next augmentation, cheapest-rep first,
forever — while Kenneth installs manually on his own schedule.** It automates everything *upstream*
of the install; it never installs.

Why it advances the locked goal: a BN1 clear is aug → install, many times ([[project_bn1_install_reality]]),
and the binding cost is attended re-bootstrap effort, not money/rep. This removes the attended
per-cycle aug-buying labor and steadily banks broad multipliers (incl. NFG, the +8pp BN1.2 target).
It also *feeds* the Daedalus ≥30-installed-augs gate rather than competing with it — so the earlier
"contends with the WD push" worry is moot until 30 augs exist, by which point the farmer built them.

## Core loop (conceptual)

Each pass:
1. Refresh the reachable universe (joined factions + in-scope joinable factions).
2. Compute the candidate aug list: filter → prereq-order → sort by rep requirement ascending.
3. Pick the **single lowest-rep unowned reachable aug** as the current target.
4. If the target's faction isn't joined and is joinable (and passes the exclusion guard): join it.
5. Grind that faction's rep (hacking-contract faction work + the daemon's `ns.share()` boost).
6. When the target's rep is met: publish a reservation for its **live (inflated) money price** so
   cloudmanager backs off; buy it as soon as money ≥ price; record via `recordTransaction`.
7. Target moves to the next-lowest-rep aug. Repeat. When nothing is reachable/affordable, idle.

## Locked decisions

### D1 — Sort key: lowest **rep requirement**, one aug at a time
Rep is the binding resource in BN1 (money is effectively infinite in a mature batcher; the endgame
"buyout" only arrives once favor unlocks donation). Buy the globally-cheapest-rep reachable aug,
reserve/buy it, then move on.
- *Rejected:* descending-money-price order (the money-optimal answer to the 1.9× price escalation).
  Correct only if money binds; it doesn't here. Revisit only under an economy-nerfed node.

### D2 — Filter: keep anything hack/rep-relevant OR on a utility allow-list
INCLUDE if the aug has any of: `hacking`, `hacking_exp`, `hacking_speed`, `hacking_chance`,
`hacking_grow`, `hacking_money`, `faction_rep`, `company_rep`, `charisma`(+exp) — **OR** it's on a
hand-curated utility allow-list. SKIP only if its *entire* useful surface is combat
(str/def/dex/agi ±exp), crime, hacknet, or bladeburner and it's not allow-listed.
- Inclusive-OR: a mixed hacking+combat aug is kept.
- **Charisma is included** (Kenneth's call): cha raises faction/company *work* rep rate, so it mildly
  speeds the grinder itself. Combat stats do not affect hacking or rep — safe to skip.
- **Utility allow-list is required** because `getAugmentationStats` returns numeric mults only, so
  pure-utility augs read as all-`1.0` and a mult filter would wrongly drop them. Seed entries:
  **Neuroreceptor Management Implant** (removes the unfocused-work penalty → directly speeds this
  farmer's own rep grind — high value here), CashRoot Starter Kit, The Blade's Simulacrum. Allow-list
  is curated by aug *description*, not stats (the `augcheck.js` caveat).

### D3 — NFG: at most 1 level per install cycle, only when it's the lowest-rep candidate
NFG participates in the ordinary lowest-rep sort but is capped at one purchase per cycle so it can't
fixate the loop. Its level climbs permanently across installs — one level per cycle is exactly the
BN1.2 "+8pp over N installs" mechanism. Past a point a fresh faction's cheap aug beats the next NFG
level on rep-per-mult, so letting it fall out of the sort (capped) self-regulates.
- *Rejected:* uncapped NFG (fixates the loop) and NFG-only end-of-cycle dumping (over-invests rep in
  one faction vs cheaper breadth).

### D4 — v1 faction scope: easy-join only (backdoor / hacking-level / location)
Include the backdoor/hacking story factions (CyberSec, NiteSec, The Black Hand, BitRunners), Tian Di
Hui, the endgame factions as they unlock, **and city factions**. Exclude **megacorps** (require a
separate company-rep work grind — a hidden join cost the rep-sort can't see) and **crime/gang
factions** (karma + their own exclusion sets). This keeps the join universe cheap and, apart from city
factions, exclusion-free.

### D5 — City-faction exclusion: handled by an in-cycle compat guard, not deferral
City factions form three mutually-hostile camps:

| Camp | Factions | Excludes |
|---|---|---|
| A | Sector-12, Aevum | B, C |
| B | Chongqing, New Tokyo, Ishima | A, C |
| C | Volhaven (alone) | everyone |

The exclusion is **not a loss** — it *serializes across installs*: once camp A's augs are owned they
drop from the candidate list, so next cycle camp B's augs are the cheapest and get joined, etc. Every
camp drains eventually, lowest-rep-first, nothing stranded (Kenneth's insight).
- **Guard (the only logic needed):** when about to join a city faction, check compatibility with city
  factions already joined *this cycle*; if incompatible, **skip that aug** (defer to a future cycle)
  and move to the next candidate. A compat check on join — not camp-value optimization.
- Accepted minor inefficiency: if the farmer commits to a camp for one cheap aug and the next-cheapest
  reachable augs are all in locked camps, it grinds slightly-costlier rep this cycle. Self-heals next
  install. This is the faction-jumping efficiency hit Kenneth already accepted.
- *To verify at spec time:* the enemy graph against the game's own data before shipping camp logic
  (don't trust recall).

### D6 — Prereqs: buy the prereq regardless of category
Pure rep ordering can target an aug whose prereq isn't owned → `purchaseAugmentation` fails. Respect
prereq topology; if a wanted aug's prereq is itself a skip-category aug, **buy it anyway** (cheap means
to unlock the target, money is infinite). Never attempt a purchase whose prereq isn't owned.

### D7 — Priority / money model: reuse the existing reservation system unchanged
The three-tier priority Kenneth wanted is **already how the system works**; only tier 2 is new:
- **Tier 1 — TOR + port openers** (`procureprograms.js`): already top priority — spends down to the
  $110k bootstrap holdback, ignoring all reservations. No change. (Note: TOR + openers are re-bought
  every cycle — they don't survive an install: [[reference_install_resets_programs_tor]].)
- **Tier 2 — next aug (NEW):** the farmer writes its target's **live inflated price** to a state file;
  `resourcemanager.js` folds it into `totalReserved` exactly like it already reads
  `finance-reserve-extra.txt`. Keeps `resourcemanager.js` **Singularity-free** — the farmer owns the
  Singularity price read, resourcemanager just reads a number.
- **Tier 3 — cloud fleet** (`cloudmanager.js`): already spends only `available = money − totalReserved`
  — leftovers-only, no reservation of its own. No change.

### D8 — Reservation gated on **rep-met**, one aug at a time
The farmer only reserves a target once its rep is satisfied (buy-ready), never a distant target.
- **Prevents the post-install starvation deadlock:** on a fresh cycle rep is 0 for everything → nothing
  reserved → cloudmanager rebuilds the wiped fleet freely (fleet + money reset on install:
  [[reference_install_resets_money]]). The rep grind takes real time on the single slot, so the fleet
  rebuilds in parallel; by the time a reservation appears the economy is recovering.
- Low-rep augs are also low-*money* early game, so the first reservations are small — can't strangle
  the rebuild even if rep lands fast.
- Reserve one aug at a time → bounds how long cloudmanager's growth is paused.

### D9 — No hysteresis, no fleet checkpoint, (probably) no latch
- **No port-opener checkpoint:** opener count measures faction *reachability*, not economic health —
  wrong proxy. Reachability is already staged organically (a faction is unjoinable until its
  backdoor's opener is bought).
- **No hysteresis:** the reservation is a hard *floor* (`max(0, money − reserved)`), not a threshold
  both sides race around — cloudmanager can only spend money *above* the reserved price, so it can't
  nibble the farmer below buy-ability. The on/off driver (rep) is monotonic and slow; toggling only
  pauses fleet *growth* with zero teardown cost. Hysteresis damps costly repeated transitions; there's
  no cost here to damp.
- **Latch:** OPEN (see Q1) — a one-way per-cycle "don't spend on augs until fleet non-empty" latch is
  cheap if we want the rebuild-first guarantee in writing, but timing likely makes it unnecessary.

### D10 — Install stays 100% manual (the safety boundary)
The farmer does only the **reversible** subset: join (resets every install) and buy/queue augs (no
progression effect until installed). Clicking **Install** — the one irreversible progression commit —
stays entirely Kenneth's. This is the line that makes the automation safe to run unattended.

### D11 — Authorization supersedes the "never auto-join" rule (bounded)
Kenneth durably authorizes the farmer to auto-join and auto-buy unattended, superseding
`reset-protocol.md`'s "Core rule: auto-UNLOCK, never auto-JOIN" (that rule was the manual stand-in for
the exclusion logic D5 now provides) and satisfying the general confirm-before-outward-action rule via
standing authorization. Precedent: `procureprograms.js` already spends money unattended under a bounded
charter. **Bounds to write into the spec:** faction allow-list (D4), never join/act on anything that
could bar Daedalus (nothing can — Daedalus has no enemies — but state it), install never automated (D10).
- Housekeeping: update `reset-protocol.md`'s never-join section so shipped code doesn't contradict a
  standing doc rule (one-line doc edit, part of the phase).

## Post-install starting state (the farmer's assumptions on a fresh cycle)

Confirmed with Kenneth 2026-07-13:
- **Physically in Sector-12** ([[reference_post_install_landing_city]]) — no travel needed for
  studybootstrap's Rothman University. Interaction with D5: Sector-12 is city-faction **Camp A**, so
  it's the zero-travel city option, but joining it commits Camp A for the cycle — don't join a city
  faction reflexively just because we're standing in its city.
- **In zero factions** ([[reference_install_resets_faction_membership]]) — every invite must be
  re-earned. So on a fresh cycle there is nothing to grind rep for until autobackdoor/level/location
  surfaces the first invite.
- Hacking ~1, money ~$1k, fleet wiped, no TOR/openers ([[reference_install_resets_money]],
  [[reference_install_resets_programs_tor]]).

### D12 — Faction work is unfocused (`focus:false`); farmer yields the action slot to studybootstrap
`workForFaction(faction, focus=false)` — ~80% rep but no UI hijack (Kenneth's call, and it matches
`studybootstrap.js`'s existing `focus:false` convention: "a background kick, not an action Kenneth is
watching"). NRMI (allow-listed, D2) removes the unfocused penalty once owned.

**Player-action-slot contention with `studybootstrap.js` (must reconcile — its header assumes "nothing
else contends for it post-install," which this farmer breaks):**
- studybootstrap fires on `hack < 10` and then studies **indefinitely** (no stop/handoff — explicitly
  its "future work").
- Rule: **the farmer takes the action slot only when it has a concrete rep target** — i.e. a joined (or
  joinable-this-pass) faction holding an unowned, reachable, buy-list aug. Until then it leaves the slot
  alone, so studybootstrap keeps climbing hacking. This naturally avoids the low-level window: the first
  joinable faction (CyberSec) needs its CSEC backdoor at hack ~55, well past studybootstrap's 10, so the
  farmer won't want the slot until long after the study kick has served its purpose.
- Bonus: when the farmer *does* take over for faction work, it becomes the stop/handoff crossover
  studybootstrap left unbuilt. Worth stating in the spec so it's a deliberate closure, not an accident.
- *Verify at spec time:* studybootstrap's `HACK_THRESHOLD` (currently 10) and that preempting a running
  `universityCourse` with `workForFaction` behaves cleanly (no stuck state).

## Rep-earning mechanism

- Faction work via Singularity (hacking-contract type — best rep for a high-hacking player, no combat
  stats needed), unfocused per D12, boosted by the daemon's existing `ns.share()` (share's rep
  multiplier only applies *during* faction work — [[reference_share_boost_needs_faction_work]], so this
  is the one context it helps). Single shared player-action slot ([[reference_focus_penalty_and_slot]])
  — contention with studybootstrap handled in D12.
- Composition with shipped work: **auto-backdoor (Phase 22)** is the *unlock* half (roots + backdoors
  faction servers, never joins); this farmer is the *join + buy* half. The farmer depends on invites
  being surfaced — either autobackdoor has run, or the faction is location/level-gated.

## Master list / caching

- **Cache once per node (static):** rep requirement, prereq chain, selling factions, stat mults,
  city-camp exclusion graph. Persist to a JSON file.
- **Evaluate live (dynamic):** money price (inflates 1.9×/purchase — the reservation uses the *live*
  price, not base), current affordability, current rep per faction, and the reachable set (joining a
  new faction unlocks new augs → refresh the candidate list on membership change, not truly "once").

## Architecture / lifecycle

- Standalone always-on companion `exec`'d by `daemon.js` at startup (Singularity RAM isolated out of
  the daemon hot path per engineering conventions — like `procureprograms.js`/`cloudmanager.js`, never
  imported into `daemon.js`). Restart via `tools/bb/cli.mjs restart augfarmer.js`.
- SF4.3 is active → Singularity RAM is 1× ([[reference_bn4_singularity]] context / Phase 21 grant), so
  the RAM surface is affordable; still confirm the actual footprint at spec time.
- Pure decision functions (filter, sort, prereq-order, camp-compat, reservation amount, target-pick)
  factored out for **vitest** unit tests; the Singularity side effects (join/work/buy) are live-only
  and validated by a live run + `recordTransaction` log + the reservation state file. Wire logs into
  `npm run verify:log` where practical.

## Resolved decisions (were open — Kenneth accepted the recs 2026-07-13)

- **Q1 — Latch: NO.** No fleet-rebuild-first latch; trust that the rep grind is reliably slower than
  the fleet rebuild. Add one only if a live cycle actually shows starvation.
- **Q2 — Plateau behavior: idle-and-report, no ping.** When no reachable/affordable aug remains, write
  a summary (augs bought, mult gained, Daedalus-gate progress) to a log + one terminal line and idle,
  waiting for Kenneth to install. No active notification.
- **Q3 — Money ceiling/floor: NONE in v1.** Money is rep-gated, not the constraint, and the augs are
  wanted. Revisit only under an economy-nerfed node.
- **(Former) faction-work focus: `focus:false`** — see D12.

## Ship-time deliverables & doc reconciliations (don't lose these)

Tracked here rather than edited now, because they only become true/correct when `augfarmer.js` ships:
- **`studybootstrap.js` header:** its line *"the single player-action slot, which nothing else contends
  for it post-install"* becomes false once the farmer exists — correct it to point at the farmer's
  D12 yield rule. (Kept as-is until ship: it's accurate today, and a forward-reference to a
  not-yet-existing script would be worse.)
- **`reset-protocol.md`** "Core rule: auto-UNLOCK, never auto-JOIN" section — update so the shipped
  farmer's authorized auto-join (D11) doesn't contradict a standing doc rule.
- **`reset-protocol.md`** persistence table — name TOR + port openers explicitly under the "created
  programs: reset" row (per [[reference_install_resets_programs_tor]]).
- **`BACKLOG.md` / `docs/phases/CHANGELOG.md`** — staged in the same commit as the code per conventions.
- **`docs/scripts.md`** — add the `augfarmer.js` companion row.

## API surface to verify at spec time (this is a non-vanilla 3.0.0+ fork)

Confirm real call sites / signatures in `markdown/` before use — coding from upstream memory crashes
at runtime (REMOVED FUNCTION ERROR). Expected surface: `ns.singularity.getAugmentationsFromFaction`,
`getAugmentationRepReq`, `getAugmentationPrice`, `getAugmentationPrereq`, `getAugmentationStats`,
`purchaseAugmentation`, `joinFaction`, `workForFaction`, `checkFactionInvitations`,
`getFactionRep`/`getPlayer().factions`. Reservation file plumbing mirrors `resourcemanager.js`'s
existing `finance-reserve-extra.txt` read (0 GB `ns.read`).

## Explicitly out of scope (v1)

- Megacorp + crime/gang factions (D4).
- Any automated install (D10).
- Money-optimal (descending-price) buy ordering (D1).
- Favor breadth-vs-depth optimization for the eventual Daedalus donation buyout — noted as a *later*
  tension (shallow rep across many factions banks favor slowly per-faction), not a v1 concern.
