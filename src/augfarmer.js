// Phase 23/25 -- auto augmentation farmer: the join + grind + buy + (Phase 25)
// score-aware targeting + camp commitment + donation + install-trigger half
// of the BN1.2 aug-acquisition loop (Phase 22's backdoorfactions.js is the
// *unlock* half -- roots + backdoors the four hacking-faction servers, never
// joins). Always-on Singularity companion, exec'd by filename via daemon.js's
// launchDetached (never imported -- keeps every other script's RAM bundle
// free of this file's Singularity surface, per CLAUDE.md's hot-path rule).
//
// D11 authorization, UPDATED Phase 25 (docs/reset-protocol.md,
// phase-25-faction-strategy.spec.md S1/S2): Kenneth durably authorizes this
// script to auto-join and auto-buy unattended, bounded to FACTION_SCOPE (13
// names -- see below), never anything that could bar Daedalus (nothing can --
// Daedalus has no enemies, confirmed live). The **install rail is relaxed,
// not removed**: this file itself still never calls installAugmentations
// (grep -r installAugmentations src/ must find it only in installer.js) --
// the call is isolated to a dedicated, mode-gated companion. Default
// (RATCHET_MODE_FILE missing or containing anything but exactly "auto") is
// **observe mode: no install, no spend-down, ever.** Auto mode is Kenneth
// writing "auto" into ratchet-mode.txt by hand, in-game, after reviewing
// observe-mode evidence -- no code change flips it. See S7/S10 below for the
// trigger + execution shape.
//
// S8 slot etiquette: takes the single player-action slot only when idle, mid
// university class (studybootstrap.js's CS kick -- taking over IS the
// stop/handoff crossover that script's header explicitly parks as future
// work), or its own earlier faction-work assignment; yields to anything
// else (company work, crime, program creation, out-of-scope faction work).
// join/buy/reserve/travel/donate still fire while yielded -- only "work" is
// slot-gated.
//
// Phase 25 trigger summary (S7, explicitly provisional -- see the decision
// log, ratchet-decisions.json, which carries every constant in force on
// every record so observe-mode data can re-derive better ones offline):
// armed := (projected total mult gain clears MIN_TOTAL_GAIN, at least one aug
// queued, not paused, not endgame hold, and either nothing left to buy
// (idle-plateau) or the current grind's rep horizon exceeds
// GRIND_HORIZON_MS) OR gateArmed. fired := armed continuously for
// TRIGGER_SUSTAIN_MS. In auto mode fired is a latch (evalTrigger's own
// shortcut) that only Kenneth's two abort levers (mode file / pause file)
// clear. Endgame hold (S8): joined(Daedalus) || hacking >= 2500 -- the
// trigger can't arm there UNLESS gateArmed (Phase 26 A2): endgameHold means
// "stop ratcheting, go for Daedalus" generally, but when the only thing
// blocking Daedalus (or another FACTION_SCOPE count-gated faction) is an
// aug count the already-queued purchases would close on install, holding is
// precisely wrong -- so the trigger, not the hold itself, learns the one
// exception, guarded by gateRelease.closedByQueue (computeGateRelease below)
// so an install that would not actually move the gate can never arm this
// way. Otherwise the manual Daedalus runbook (docs/reset-protocol.md)
// stands untouched.
//
// RAM: derived ~60 GB at SF4.3's 1x multiplier (phase-25 spec S12 -- Phase
// 23's measured 52.7 GB + donateToFaction/getFactionFavor/getFavorToDonate/
// ns.exec/formulas.reputation.donationForRep). Acceptance band 55-70 GB;
// measured 64.1 GB (ramcheck.js, 2026-07-14, logs/ramcheck-result.json) --
// lands inside the band (S12 gate: a ~4x reading means stop and check for
// an identifier-hygiene false charge, not "multiplier live"). No
// HOME_RESERVE_GB change -- companions launch before
// the batcher packs home. A mid-session `restart augfarmer.js` may not fit
// the headroom -- restart daemon.js instead (pre-authorized, see CLAUDE.md).
//
// Task shape (S8's match rule) verified against markdown/bitburner.
// factionworktask.md / bitburner.studytask.md (type "FACTION"/"CLASS" +
// factionName/factionWorkType) and confirmed live 2026-07-13: joined 4
// factions and began unfocused faction work without error on the first
// restart.
//
// S10's open question -- whether getOwnedAugmentations(true) represents
// multiple queued NFG levels as duplicate entries -- ANSWERED live at
// install #5 (2026-07-16, logs/ratchet-log.json): **yes while queued, no
// once installed.** Six hand-bought NFG levels took the queue from 8 to 14
// (so `true` does duplicate queued levels, and augsActivated read 14), but
// post-install getOwnedAugmentations(false) returned 8 and the NFG count in
// `true` collapsed to 1 -- installed NFG is a single entry whose level lives
// outside the aug list.
//
// The lastAugReset-keyed buy cap still doesn't depend on this (as predicted).
// Two things do:
//   - `nfg.level` (state record) counts list entries, so it reads 1 forever
//     regardless of real level. Misreport, cosmetic -- see BACKLOG.
//   - `daedalusGate.installed` counts ownedInstalled.length, i.e. distinct
//     augs. Whether Daedalus's real 30-aug gate counts NFG levels
//     individually is NOT established -- if it does, we undercount and
//     over-grind. Confirm against the in-game requirement before this shapes
//     a plan. See BACKLOG.

import { tprintTs } from "./common.js";
import { recordTransaction } from "./translog.js";

export const NFG_NAME = "NeuroFlux Governor";
const POLL_MS = 10_000;
export const RESERVE_FILE = "augfarmer-reserve.json";
export const STATE_FILE = "augfarmer-state.json";
export const CATALOG_FILE = "augfarmer-catalog.json";
// Phase 26 B2: ratchetlog.js's append-only ring (its own LOG_FILE constant,
// not exported/imported -- read-only from here, the writer is unchanged).
const RATCHET_LOG_FILE = "ratchet-log.json";
export const PAUSE_FILE = "augfarmer-pause.txt";
export const TRAVEL_COST = 200_000;
const DAEDALUS_AUG_GATE = 30;

// Phase 25 constants (spec S1/work item 1). Every one of these rides into
// every decision record (buildDecisionRecord) so observe-mode data can
// re-derive better values offline -- they are declared provisional by
// design (open question (d)).
export const RATCHET_MODE_FILE = "ratchet-mode.txt";
export const DECISIONS_FILE = "ratchet-decisions.json";
export const DECISIONS_CAP = 500;
export const SCORE_W_EXP = 0.5;
export const SCORE_W_REP = 0.5;
export const SCORE_W_MONEY = 0.15;
export const SCORE_W_SPEED = 0.15;
export const ALLOWLIST_SCORE = 0.25;
export const MIN_TOTAL_GAIN = 1.1;
export const GRIND_HORIZON_MS = 8 * 3600_000;
export const TRIGGER_SUSTAIN_MS = 600_000;
export const RATE_MIN_SAMPLES = 30;
export const RATE_EWMA_ALPHA = 0.2;
export const DONATION_BUFFER = 1.2;
export const ENDGAME_HACK_LEVEL = 2500;
export const SPEND_DOWN_BUY_CAP = 50;
// NeuroFlux Governor's per-level price multiplier. MEASURED 2026-07-17 from
// install #8's 11-level spend-down run (The Black Hand): the paid-price ratio
// was a dead-constant 2.166 across every level (logs/transactions-2026-07-17.json,
// which carries paid vs projected since the gap-5 fix). The prior 1.9 was an
// eyeball estimate and ran ~14% low, which compounds -- it under-logged and
// under-projected every level past the first. If a future node re-prices NFG,
// re-measure the same way.
export const NFG_PRICE_LADDER = 2.166;

// NeuroFlux Governor's REP requirement escalates per level too -- ×1.14, the
// same shape as its base price. Measured across install #9 (2026-07-18):
// repReq 122,736 -> 998,737 over exactly 16 levels bought, ratio 8.137 =
// 1.14^16 to four figures.
//
// This corrects a claim the phase-25 close-out carried as checked fact ("NFG's
// rep requirement does not climb with level" -- it read 10,181 before AND after
// install #6, which we now believe was a catalog that had not rebuilt yet).
// It matters because rep resets to zero on every install: each cycle must
// re-earn the CURRENT requirement from scratch, and that requirement has gone
// 10k -> 123k -> 999k in three installs. Rep, not money, becomes the binding
// constraint on the NFG tail -- and the tail is where most of a cycle's gain
// comes from (16 levels vs 6 discrete augs at install #9).
// -> docs/neuroflux.md
export const NFG_REP_LADDER = 1.14;
export const PASSIVE_REP_FACTIONS = new Set(["CyberSec", "NiteSec", "The Black Hand", "BitRunners"]);
export const RED_PILL_NAME = "The Red Pill";

// Phase 26 B2 (S4). Stall-age thresholds -- explicitly provisional, same as
// every Phase 25 constant, and ride into every ratchet-decisions.json record.
// Observed cycles run 4-8h, so STALL_CYCLE_FACTOR x median lands 12-24h in
// steady state; the MIN/MAX clamp keeps a much faster or slower future node
// from false-positiving or never-firing while the interval sample is thin.
export const STALL_CYCLE_FACTOR = 3;
export const STALL_MIN_MS = 12 * 3600_000;
export const STALL_MAX_MS = 48 * 3600_000;
export const STALL_FALLBACK_MS = 24 * 3600_000;
export const STALL_REWARN_MS = 6 * 3600_000;

// Kept for the fixture helper in test/augfarmer.test.js (statsAllOnes) --
// scoreAug itself only reads hacking/hacking_exp/faction_rep.
export const MULT_FILTER_KEYS = [
  "hacking",
  "hacking_exp",
  "hacking_speed",
  "hacking_chance",
  "hacking_grow",
  "hacking_money",
  "faction_rep",
  "company_rep",
  "charisma",
  "charisma_exp",
];

// S3: shrunk to the one utility aug that directly raises this farmer's own
// unfocused rep rate. The Blade's Simulacrum stays dropped -- the 30-aug
// Daedalus gate is already met, so a zero-score aug only delays the
// plateau signal S7's trigger feeds on (flagged change). CashRoot Starter
// Kit re-added 2026-07-15 (Kenneth's ask, "utility augs that contribute to
// our build") -- its stats read all-1.0 like any pure-utility aug
// (augcheck.js's documented caveat), but its real effect ($1M + BruteSSH.exe
// granted on every future install, confirmed live via augcheck.js) speeds
// up post-install bootstrap recovery every single cycle, unlike the combat/
// charisma/company-only augs this allowlist deliberately excludes.
//
// The Red Pill added 2026-07-15 (Kenneth's explicit ask, after being told
// this REVERSES the S2/S3 "drops by construction" property that every
// prior phase preserved deliberately). No longer a special case: once
// Daedalus rep clears 2.5m (donated automatically per the S6-generalized
// Daedalus route, also added this session), it's just another allow-listed
// $0 buy that fires through the normal pipeline.
export const UTILITY_ALLOWLIST = ["Neuroreceptor Management Implant", "CashRoot Starter Kit", "The Red Pill"];

/**
 * Pure (S3, amended 2026-07-15 at Kenneth's request). `(hacking-1) +
 * SCORE_W_EXP*(hacking_exp-1) + SCORE_W_REP*(faction_rep-1) +
 * SCORE_W_MONEY*(hacking_money-1) + SCORE_W_SPEED*(hacking_speed-1)`,
 * except allow-listed names return ALLOWLIST_SCORE flat -- the name
 * parameter exists for exactly this override, since stats alone can't see
 * the allowlist (a pure-utility aug reads all-1.0 either way).
 * money/speed are weighted well below exp/rep -- they don't move hack
 * *level* (this strategy's bottleneck) at all, only income rate, which
 * only helps indirectly (faster NFG/donation funding). hacking_chance and
 * hacking_grow remain unweighted (0 toward score) -- Kenneth's ask was
 * specifically money/speed, not the full ten-key set D2 originally used.
 * @param {string} name
 * @param {Record<string, number>} stats
 * @param {Set<string>} allowSet
 */
export function scoreAug(name, stats, allowSet) {
  if (allowSet?.has(name)) return ALLOWLIST_SCORE;
  const hacking = stats?.hacking ?? 1;
  const hackingExp = stats?.hacking_exp ?? 1;
  const factionRep = stats?.faction_rep ?? 1;
  const hackingMoney = stats?.hacking_money ?? 1;
  const hackingSpeed = stats?.hacking_speed ?? 1;
  return (
    hacking -
    1 +
    SCORE_W_EXP * (hackingExp - 1) +
    SCORE_W_REP * (factionRep - 1) +
    SCORE_W_MONEY * (hackingMoney - 1) +
    SCORE_W_SPEED * (hackingSpeed - 1)
  );
}

/**
 * Pure (S3, reshaped from D2's ten-key filter). Keeps a name iff
 * scoreAug(...) > 0 -- allow-listed names always score ALLOWLIST_SCORE > 0,
 * so no separate allowlist branch is needed. Any other all-1.0 utility aug
 * not on UTILITY_ALLOWLIST still drops here by construction (The Red Pill
 * used to be the canonical example of this until it was allow-listed
 * 2026-07-15 -- see that constant's header).
 * @param {Record<string, Record<string, number>>} augStatsByName
 * @param {string[]} allowlist
 * @returns {Set<string>}
 */
export function filterAugs(augStatsByName, allowlist) {
  const allowSet = new Set(allowlist);
  const kept = new Set();
  for (const [name, stats] of Object.entries(augStatsByName)) {
    if (scoreAug(name, stats, allowSet) > 0) kept.add(name);
  }
  return kept;
}

/**
 * Pure (D6). Walks `candidateName`'s prereq chain against `catalog.augs`
 * (each entry `{prereqs, sellers, ...}`), returning the ordered unowned
 * chain deepest-first, ending in candidateName itself (a no-prereq aug
 * yields a one-element chain). Prereqs bypass the S3 score filter by design
 * -- this never consults passesFilter. Returns null if any link (including
 * candidateName) has no in-scope seller -- "no reachable seller" the caller
 * can't work around this cycle.
 * @param {string} candidateName
 * @param {{augs: Record<string, {prereqs: string[], sellers: string[]}>}} catalog
 * @param {Set<string>} ownedSet
 * @returns {string[]|null}
 */
export function expandPrereqs(candidateName, catalog, ownedSet) {
  const chain = [];

  function visit(name) {
    if (ownedSet.has(name)) return true;
    const info = catalog.augs[name];
    if (!info || info.sellers.length === 0) return false;
    for (const prereq of info.prereqs) {
      if (!visit(prereq)) return false;
    }
    if (!chain.includes(name)) chain.push(name);
    return true;
  }

  return visit(candidateName) ? chain : null;
}

/** Pure (S3/D5). True iff any of `faction`'s live-read enemies is already joined this cycle. */
export function campBlocked(faction, enemiesByFaction, joinedSet) {
  const enemies = enemiesByFaction[faction] ?? [];
  return enemies.some((e) => joinedSet.has(e));
}

/**
 * Pure (S4). The set of "city" factions in `catalog.factions` -- derived
 * from the live enemy graph, not hard-coded: any faction with a non-empty
 * enemies list, plus any faction that appears in another's enemies list
 * (defensive, in case the graph is asymmetric). The 8 non-conflicting
 * in-scope factions (4 hacking + Tian Di Hui + Daedalus/Covenant/
 * Illuminati) have empty enemies both ways and never appear here.
 * @param {{factions: Record<string, {enemies: string[]}>}} catalog
 * @returns {string[]}
 */
export function cityFactionNames(catalog) {
  const names = new Set();
  for (const [f, info] of Object.entries(catalog.factions)) {
    if ((info.enemies ?? []).length > 0) names.add(f);
    for (const e of info.enemies ?? []) names.add(e);
  }
  return [...names].sort();
}

/**
 * Pure (S4). The connected components of the ALLY (non-enemy) relation
 * among `cityNames` -- the complement of the enemy graph, which is what
 * actually partitions the cities into camps (the enemy graph itself
 * connects all six into one component -- the wrong answer, cold review B1).
 * @param {string[]} cityNames
 * @param {{factions: Record<string, {enemies: string[]}>}} catalog
 * @returns {string[][]} each component sorted, components in first-seen order
 */
export function computeCamps(cityNames, catalog) {
  const enemySets = new Map(cityNames.map((f) => [f, new Set(catalog.factions[f]?.enemies ?? [])]));
  const visited = new Set();
  const components = [];

  for (const start of cityNames) {
    if (visited.has(start)) continue;
    const comp = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const cur = queue.shift();
      comp.push(cur);
      for (const other of cityNames) {
        if (visited.has(other)) continue;
        const enemies = enemySets.get(cur).has(other) || enemySets.get(other).has(cur);
        if (!enemies) {
          visited.add(other);
          queue.push(other);
        }
      }
    }
    components.push(comp.sort());
  }
  return components;
}

/**
 * Pure (S4). Picks the camp to commit to this cycle. Reality rule: if any
 * city faction is already joined, the camp is that faction's component --
 * commitment can't flip once a city faction is joined. Otherwise scores
 * each camp by summing scoreAug over unowned, filter-passing (score>0)
 * augs whose entire in-scope seller set lies inside that camp (an aug also
 * sold by a non-city faction discriminates nothing, per S4). Ties break by
 * camp size descending, then first (alphabetical) member name.
 * @param {{augs: Record<string, {sellers: string[], score: number}>, factions: Record<string, {enemies: string[]}>}} catalog
 * @param {Set<string>} ownedSet
 * @param {Set<string>} joinedSet
 * @returns {{camp: string[], reason: "reality"|"scored", score?: number}|null}
 */
export function pickCamp(catalog, ownedSet, joinedSet) {
  const cityNames = cityFactionNames(catalog);
  if (cityNames.length === 0) return null;
  const components = computeCamps(cityNames, catalog);

  const joinedCity = cityNames.find((f) => joinedSet.has(f));
  if (joinedCity) {
    const comp = components.find((c) => c.includes(joinedCity));
    return { camp: comp, reason: "reality" };
  }

  const scored = components.map((camp) => {
    const campSet = new Set(camp);
    let score = 0;
    for (const [name, info] of Object.entries(catalog.augs)) {
      if (ownedSet.has(name)) continue;
      if (!(info.score > 0)) continue;
      const sellers = info.sellers ?? [];
      if (sellers.length === 0) continue;
      if (sellers.every((s) => campSet.has(s))) score += info.score;
    }
    return { camp, score };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.camp.length !== b.camp.length) return b.camp.length - a.camp.length;
    return a.camp[0] < b.camp[0] ? -1 : a.camp[0] > b.camp[0] ? 1 : 0;
  });

  return { camp: scored[0].camp, reason: "scored", score: scored[0].score };
}

/**
 * Pure (S4). This pass's join set: every invite-pending, in-scope faction
 * that isn't already joined and, if it's a city faction, is inside
 * `campChoice`'s camp. Out-of-scope names (not present in catalog.factions)
 * never appear -- the rail preserved from D11.
 * @param {{factions: Record<string, unknown>}} catalog
 * @param {Set<string>|string[]} invites
 * @param {Set<string>} joinedSet
 * @param {{camp: string[]}|null} campChoice
 * @returns {string[]}
 */
export function planJoins(catalog, invites, joinedSet, campChoice) {
  const campSet = new Set(campChoice?.camp ?? []);
  const cityNames = new Set(cityFactionNames(catalog));
  const joins = [];
  for (const faction of invites) {
    if (!catalog.factions[faction]) continue;
    if (joinedSet.has(faction)) continue;
    if (cityNames.has(faction) && !campSet.has(faction)) continue;
    joins.push(faction);
  }
  return joins;
}

/**
 * Pure. Evaluates one PlayerRequirement node against `facts`
 * ({city, money, skills, karma, jobs}-shaped). Unknown/unhandled types
 * return false (unmet) -- conservative: the faction just waits for its
 * invite to surface organically rather than being force-joined on a
 * misread requirement.
 */
function evaluateRequirement(req, facts) {
  switch (req.type) {
    case "city":
      return facts.city === req.city;
    case "money":
      return facts.money >= req.money;
    case "skills":
      return Object.entries(req.skills).every(([skill, level]) => (facts.skills?.[skill] ?? 0) >= level);
    case "karma":
      return (facts.karma ?? 0) <= req.karma;
    case "numAugmentations":
      // Phase 26 A1 precondition (2026-07-18). Was falling through to
      // `default: return false`, so this requirement read UNMET forever --
      // even at 30 augs -- and any logic keyed on it could never fire. The
      // count is DISTINCT augs: NFG is one entry however many levels it holds
      // (Phase 25 gap 3, settled live). Third instance this session of a
      // silent false/zero default standing in for "unknown"; the `default`
      // arm below is the same hazard for every type still unhandled.
      return (facts.augCount ?? 0) >= req.numAugmentations;
    case "employedBy":
      return facts.jobs?.has(req.company) ?? false;
    case "backdoorInstalled":
      return facts.backdoored?.has(req.server) ?? false;
    case "not":
      return !evaluateRequirement(req.condition, facts);
    case "someCondition":
      return req.conditions.some((c) => evaluateRequirement(c, facts));
    case "every":
      return req.conditions.every((c) => evaluateRequirement(c, facts));
    default:
      return false;
  }
}

/**
 * Pure (S4). `reqs` is a PlayerRequirement[] (AND across the top level, per
 * the game's own contract). Returns {joinable, onlyCityGap, gapCity} --
 * onlyCityGap is true iff every requirement is met except exactly one
 * top-level `city` requirement (travel closes it; gapCity names the target).
 * @param {object[]} reqs
 * @param {object} playerFacts
 */
export function evaluateInviteReqs(reqs, playerFacts) {
  const evaluated = reqs.map((req) => ({ req, met: evaluateRequirement(req, playerFacts) }));
  const unmet = evaluated.filter((e) => !e.met);
  const joinable = unmet.length === 0;
  const onlyCityGap = !joinable && unmet.length === 1 && unmet[0].req.type === "city";
  // Phase 26 A1: the aug-count analogue of onlyCityGap. Travel closes a city
  // gap; buying any unowned aug closes this one. `augCountGap` is how many
  // more DISTINCT augs are needed.
  const onlyAugCountGap = !joinable && unmet.length === 1 && unmet[0].req.type === "numAugmentations";
  return {
    joinable,
    onlyCityGap,
    gapCity: onlyCityGap ? unmet[0].req.city : undefined,
    onlyAugCountGap,
    augCountGap: onlyAugCountGap ? Math.max(0, unmet[0].req.numAugmentations - (playerFacts.augCount ?? 0)) : 0,
  };
}

/**
 * Pure (Phase 26 A1, 2026-07-18). Is an aug-COUNT gate the only thing between
 * us and a faction we're not in? Returns the shortest such gap across in-scope
 * unjoined factions, or null.
 *
 * WHY THIS EXISTS -- the deadlock it breaks, observed live at 29/30 augs:
 * every unowned aug that passes the score filter is sold ONLY by Daedalus /
 * The Covenant / Illuminati, and those factions are exactly what the count
 * gate locks us out of. Meanwhile every aug we CAN buy scores 0.00 and is
 * dropped. So the augs the engine will buy are sold only by the faction
 * requiring the augs it won't buy: circular, unbreakable by time, money or
 * rep. And it is structural -- once the non-endgame factions' passing augs are
 * exhausted, the count gate can ONLY ever be closed by a zero-score aug. This
 * recurs on every node clear.
 *
 * Deliberately general rather than keyed on `endgameHold` (D2): that flag is
 * Daedalus-specific, while The Covenant (20 augs) and Illuminati (30) have the
 * same shape and sell the same locked-out augs. Safety comes from "the count
 * is the ONLY unmet requirement" -- a fresh node holds neither $100b nor
 * hacking 2500, so this cannot fire during early game.
 * @param {{factions: Record<string, {inviteReqs: object[]}>}} catalog
 * @param {object} playerFacts must include `augCount`
 * @param {Set<string>} joinedSet
 * @param {Set<string>} factionScope
 * @returns {{faction: string, gap: number}|null}
 */
export function findAugCountGate(catalog, playerFacts, joinedSet, factionScope) {
  let best = null;
  for (const [faction, info] of Object.entries(catalog?.factions ?? {})) {
    if (joinedSet?.has(faction)) continue;
    if (factionScope && !factionScope.has(faction)) continue;
    const { onlyAugCountGap, augCountGap } = evaluateInviteReqs(info?.inviteReqs ?? [], playerFacts);
    if (!onlyAugCountGap || !(augCountGap > 0)) continue;
    if (!best || augCountGap < best.gap) best = { faction, gap: augCountGap };
  }
  return best;
}

/**
 * Pure (Phase 26 A2, S2). Does an in-scope faction's aug-COUNT gate close the
 * moment the currently-queued augs finish installing? Two explicit steps, not
 * a second findAugCountGate call (cold review blocker 1: that function
 * returns only the single shortest-gap faction, so a second call could name a
 * different faction -- or null -- whenever some OTHER in-scope faction still
 * has an open count gate against the owned count, and the two implementations
 * would then silently diverge):
 *   1. Which faction (if any) has the count as its ONLY unmet requirement,
 *      against `playerFactsInstalled.augCount` (distinct INSTALLED augs).
 *   2. For THAT SAME faction, re-evaluate its inviteReqs with the count
 *      swapped to `augCountOwned` (distinct owned INCLUDING queued).
 *      `closedByQueue` is exact, not a proxy: step 1 already established the
 *      count as the only unmet requirement against current facts, so
 *      re-evaluating with the owned count flips `joinable` iff the count
 *      requirement itself closes.
 * Returns null when no count gate exists on the installed count.
 * @param {{factions: Record<string, {inviteReqs: object[]}>}} catalog
 * @param {object} playerFactsInstalled must include augCount = distinct INSTALLED augs
 * @param {number} augCountOwned distinct owned augs INCLUDING queued
 * @param {Set<string>} joinedSet
 * @param {Set<string>} factionScope
 * @returns {{faction: string, gap: number, closedByQueue: boolean}|null}
 */
export function computeGateRelease(catalog, playerFactsInstalled, augCountOwned, joinedSet, factionScope) {
  const gate = findAugCountGate(catalog, playerFactsInstalled, joinedSet, factionScope);
  if (!gate) return null;
  const inviteReqs = catalog?.factions?.[gate.faction]?.inviteReqs ?? [];
  const reEval = evaluateInviteReqs(inviteReqs, { ...playerFactsInstalled, augCount: augCountOwned });
  return { faction: gate.faction, gap: gate.gap, closedByQueue: reEval.joinable };
}

/**
 * Pure (Phase 26 A1, 2026-07-18). The cheapest aug we can buy RIGHT NOW purely
 * to raise the distinct-aug count -- ignoring `passesFilter` entirely, because
 * the point is the count, not the stats.
 *
 * Cheapest by PRICE is the whole rule: every aug purchase inflates the rest of
 * the cycle by the same ~1.9x (docs/neuroflux.md), so price is the only thing
 * separating two count-fillers. A $2.5m junk aug and a $25b real one cost the
 * same tax.
 *
 * Excludes augs with unowned prereqs: chains (Combat Rib I->II->III) would each
 * carry their own 1.9x tax, and we need +1, not a chain. Excludes NFG, which is
 * already owned as a single entry and so never raises the distinct count -- the
 * exact reason the deadlock is permanent.
 * @param {Record<string, {price: number, repReq: number, sellers: string[], prereqs: string[], isNFG: boolean}>} augs
 * @param {Set<string>} ownedSet
 * @param {Record<string, number>} factionRep rep by joined faction
 * @returns {{aug: string, faction: string, price: number}|null}
 */
export function pickGateFiller(augs, ownedSet, factionRep) {
  let best = null;
  for (const [name, info] of Object.entries(augs ?? {})) {
    if (info?.isNFG) continue;
    if (ownedSet?.has(name)) continue;
    if ((info?.prereqs ?? []).some((p) => !ownedSet?.has(p))) continue;
    // Cheapest rep-met seller we're actually in; rep is a threshold, not a
    // cost -- buying does not deduct it.
    const seller = (info?.sellers ?? []).find((f) => (factionRep?.[f] ?? -1) >= info.repReq);
    if (!seller) continue;
    if (!(info.price >= 0)) continue;
    if (!best || info.price < best.price) best = { aug: name, faction: seller, price: info.price };
  }
  return best;
}

/** Pure. hacking > field > security, per S8; falls back to whatever's offered. */
export function pickWorkType(workTypes) {
  const types = workTypes ?? [];
  if (types.includes("hacking")) return "hacking";
  if (types.includes("field")) return "field";
  if (types.includes("security")) return "security";
  return types[0];
}

/**
 * Pure (S8). null/CLASS/own-scope-FACTION work leaves the slot ours; anything
 * else (company, crime, program creation, out-of-scope faction work) yields.
 * @param {object|null} currentWork
 * @param {Set<string>} factionScope
 */
export function slotAvailable(currentWork, factionScope) {
  if (!currentWork) return { available: true, reason: "idle" };
  if (currentWork.type === "CLASS") return { available: true, reason: "university" };
  if (currentWork.type === "FACTION" && factionScope.has(currentWork.factionName)) {
    return { available: true, reason: "own-faction-work" };
  }
  return { available: false, reason: currentWork.type };
}

/**
 * Pure (S1/S3/S4/D5/D6). The whole targeting decision for one pass: expands
 * every unowned, score-positive (or prereq-linked), reachable-seller aug to
 * its actionable (deepest-unowned) link, dedupes shared prereqs (keeping the
 * max inheriting score), and sorts by S3's key: rep-met targets first (score
 * descending, then price ascending), then deficit>0 targets by
 * score/deficit descending (tie-break deficit asc, price asc, name asc).
 * Returns the head target's fields spread at the top level (back-compat with
 * Phase 23 call sites/tests) plus `candidates`, the full sorted list S5's
 * pickWorkFaction needs -- or null on plateau.
 *
 * `catalog` is {augs: {[name]: {repReq, price, prereqs, sellers, passesFilter,
 * isNFG, score, hackingMult}}, factions: {[faction]: {enemies, inviteReqs, workTypes}}}.
 * `playerFacts` extends evaluateInviteReqs's shape with `invites` (Set) and
 * `factionRep` ({[faction]: number}).
 */
export function pickTarget(catalog, playerFacts, joinedSet, ownedSet, nfgCapped) {
  const invites = playerFacts.invites ?? new Set();
  const factionRep = playerFacts.factionRep ?? {};
  const enemiesByFaction = Object.fromEntries(Object.entries(catalog.factions).map(([f, v]) => [f, v.enemies]));

  function factionReachability(faction) {
    if (joinedSet.has(faction)) return { status: "joined" };
    if (campBlocked(faction, enemiesByFaction, joinedSet)) return { status: "camp-blocked" };
    if (invites.has(faction)) return { status: "invite-pending" };
    const info = catalog.factions[faction];
    const { joinable, onlyCityGap, gapCity } = evaluateInviteReqs(info?.inviteReqs ?? [], playerFacts);
    if (joinable) return { status: "awaiting-invite" };
    if (onlyCityGap) return { status: "city-gap", gapCity };
    return { status: "unreachable" };
  }

  // NFG is repeatable -- owning a level (installed from a prior cycle, or
  // queued this one) must NOT drop it out of "wanted" the way owning a
  // discrete aug does. nfgCapped (the D3 one-per-cycle cap in normal
  // phases; lifted during S10 spend-down) does NOT exclude it from
  // wantedNames either -- that would stop rep grinding, not just buying,
  // and rep costs nothing while money is almost always NFG's real ceiling
  // (reset-protocol.md's ~17-18 levels/install figure). It's instead
  // recorded per-candidate below as `buyBlocked`, so grinding continues
  // (repReq live-refreshes to the next level's higher requirement the
  // moment a purchase lands, so this banks rep ahead for the next cycle's
  // spend-down) while the purchase itself stays suppressed.
  const wantedNames = Object.keys(catalog.augs).filter((name) => {
    const info = catalog.augs[name];
    if (!info.passesFilter) return false;
    if (!info.isNFG && ownedSet.has(name)) return false;
    return true;
  });

  const actionableByName = new Map();
  for (const wanted of wantedNames) {
    // NFG has no prereqs and, per the above, may already be in ownedSet --
    // expandPrereqs' owned-shortcut would treat it as already-satisfied and
    // return an empty chain, so it's resolved directly instead.
    const chain = catalog.augs[wanted]?.isNFG ? [wanted] : expandPrereqs(wanted, catalog, ownedSet);
    if (chain === null) continue; // no reachable seller somewhere in the chain
    const actionable = chain[0];
    const wantedScore = catalog.augs[wanted]?.score ?? 0;

    const existing = actionableByName.get(actionable);
    if (existing && existing.score >= wantedScore) continue; // shared-prereq dedupe: max score wins

    const info = catalog.augs[actionable];
    const reachableSellers = info.sellers
      .map((faction) => ({ faction, reach: factionReachability(faction) }))
      .filter((r) => r.reach.status !== "camp-blocked" && r.reach.status !== "unreachable");
    if (reachableSellers.length === 0) continue; // D5: skip, don't stall

    let chosen = reachableSellers[0];
    let bestRep = factionRep[chosen.faction] ?? 0;
    for (const r of reachableSellers.slice(1)) {
      const rep = factionRep[r.faction] ?? 0;
      if (rep > bestRep || (rep === bestRep && r.faction < chosen.faction)) {
        chosen = r;
        bestRep = rep;
      }
    }

    actionableByName.set(actionable, {
      aug: actionable,
      faction: chosen.faction,
      repReq: info.repReq,
      price: info.price,
      deficit: Math.max(0, info.repReq - bestRep),
      wantedFor: wanted === actionable ? undefined : wanted,
      status: chosen.reach.status,
      gapCity: chosen.reach.gapCity,
      workTypes: catalog.factions[chosen.faction]?.workTypes ?? [],
      score: wantedScore,
      buyBlocked: info.isNFG && nfgCapped,
    });
  }

  const candidates = [...actionableByName.values()];
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aMet = a.deficit <= 0;
    const bMet = b.deficit <= 0;
    if (aMet !== bMet) return aMet ? -1 : 1;
    if (aMet) {
      if (a.score !== b.score) return b.score - a.score;
      if (a.price !== b.price) return a.price - b.price;
      return a.aug < b.aug ? -1 : a.aug > b.aug ? 1 : 0;
    }
    const aRatio = a.score / a.deficit;
    const bRatio = b.score / b.deficit;
    if (aRatio !== bRatio) return bRatio - aRatio;
    if (a.deficit !== b.deficit) return a.deficit - b.deficit;
    if (a.price !== b.price) return a.price - b.price;
    return a.aug < b.aug ? -1 : a.aug > b.aug ? 1 : 0;
  });

  const top = candidates[0];
  return { ...top, candidates };
}

/**
 * Pure (S5). PASSIVE_REP_FACTIONS accrue rep for free (backdoored hacking
 * factions) -- the single active-work slot should go to the first sorted
 * candidate whose faction is joined, still needs grinding (deficit>0), isn't
 * donation-closable (money closes it, not the slot), and isn't passive. If
 * every grindable candidate's faction is passive, falls back to the head
 * candidate (today's behavior) -- returns the whole candidate object so the
 * caller has workTypes without a second lookup, or null if there are none.
 * @param {object[]} sortedCandidates
 * @param {Set<string>} joinedSet
 * @param {Set<string>} passiveSet
 * @param {Set<string>} donationClosableSet
 */
export function pickWorkFaction(sortedCandidates, joinedSet, passiveSet, donationClosableSet) {
  for (const c of sortedCandidates) {
    if (!joinedSet.has(c.faction)) continue;
    if (c.deficit <= 0) continue;
    if (donationClosableSet?.has(c.faction)) continue;
    if (passiveSet.has(c.faction)) continue;
    return c;
  }
  return sortedCandidates[0] ?? null;
}

/**
 * Pure (S7, added 2026-07-16, reshaped same day). The grind-horizon input for
 * evalTrigger: the highest-priority candidate whose rep we are still waiting
 * on. Deliberately the same filter as pickWorkFaction -- joined, deficit > 0,
 * not donation-closable (money closes those, not time) -- **minus the passive
 * skip, and with no fallback to the head**.
 *
 * That one difference is the whole point, and it is not an oversight in
 * either direction. pickWorkFaction skips PASSIVE_REP_FACTIONS because the
 * single action slot must not be spent on rep that accrues for free; it then
 * falls back to the head so the slot always has *somewhere* to go. But
 * passive rep still takes *time*, so a passive faction has a perfectly real
 * horizon -- and the head is always rep-met (deficit 0), so a fallback would
 * report a zero-length one. "What should the slot work" and "how long until
 * the next aug is reachable" are different questions.
 *
 * Two live bugs came from conflating them. First the call site passed
 * pickTarget's *head*: once the buyBlocked decoupling made NFG a permanent
 * candidate the head was always NFG (rep-met, deficit 0), the horizon was
 * always 0, and the trigger was structurally dead. Then routing it through
 * pickWorkFaction fixed only the actively-worked case -- observed live
 * 2026-07-16 with every remaining grind on passive factions (NiteSec/The
 * Black Hand/BitRunners), so the pick fell back to the rep-met head and the
 * trigger still could not arm, while $1.47T sat idle at a real plateau.
 * @param {object[]} sortedCandidates pickTarget's `candidates`
 * @param {Set<string>} joinedSet
 * @param {Set<string>} donationClosableSet
 * @returns {{faction: string|undefined, deficit: number}}
 */
export function pickHorizonGrind(sortedCandidates, joinedSet, donationClosableSet) {
  for (const c of sortedCandidates ?? []) {
    if (!joinedSet?.has(c.faction)) continue;
    if (!(c.deficit > 0)) continue;
    if (donationClosableSet?.has(c.faction)) continue;
    return { faction: c.faction, deficit: c.deficit };
  }
  return { faction: undefined, deficit: 0 };
}

/**
 * Pure (S7). EWMA (alpha=RATE_EWMA_ALPHA) tracker of Δrep/Δt per faction.
 * A faction with no prior rep sample bootstraps quietly (no rate yet --
 * needs two samples to derive one delta); a faction absent from `reps` this
 * pass (not currently joined/read) is left untouched in the output.
 * @param {Record<string, number>} prevRates
 * @param {Record<string, number>} prevReps
 * @param {Record<string, number>} reps
 * @param {number} dtMs
 */
export function updateRepRates(prevRates, prevReps, reps, dtMs) {
  const nextRates = { ...prevRates };
  if (!(dtMs > 0)) return nextRates;
  for (const [faction, rep] of Object.entries(reps)) {
    const prevRep = prevReps?.[faction];
    if (prevRep === undefined) continue; // first sample for this faction -- bootstrap next pass
    const instRate = (rep - prevRep) / dtMs;
    const prevRate = prevRates?.[faction];
    nextRates[faction] = prevRate === undefined ? instRate : RATE_EWMA_ALPHA * instRate + (1 - RATE_EWMA_ALPHA) * prevRate;
  }
  return nextRates;
}

/**
 * Pure (S7). The install trigger, explicitly provisional. `inputs`:
 * {queuedGain, queuedCount, nfgPrice, nfgHackingMult, money, phase,
 * targetFaction, deficit, repRates, rateSamples, paused, endgameHold, mode,
 * now}. `priorState` is the previous call's return (or null).
 *
 * totalGain = queuedGain (product of stats.hacking over queued-but-
 * uninstalled augs) x projectedNfgFactor (money-only projection of
 * additional NFG levels beyond what's already queued, from the live NFG
 * price and the observed x1.9 ladder -- NFG's rep requirement may bind
 * first and cut the real count; accepted optimism, logged so observe data
 * shows the error). armed requires totalGain >= MIN_TOTAL_GAIN, at least
 * one aug queued, not paused, not endgame-held, and either idle-plateau, or
 * grinding with EITHER no faction still owed rep at all (gap 7: a plateau
 * wearing the "grinding" label, because NFG's cycle cap keeps the action
 * list non-empty) OR a measured (>=RATE_MIN_SAMPLES) rep rate whose deficit
 * horizon exceeds GRIND_HORIZON_MS. fired := armed continuously for
 * TRIGGER_SUSTAIN_MS, recomputed fresh each call from priorState's
 * armedSinceMs -- so in observe mode a lapsed condition naturally clears
 * fired next call.
 *
 * Auto-mode latch (cold review C3): once fired while mode is "auto" and not
 * paused, subsequent calls short-circuit to the same fired/armed state
 * without re-deriving it from (by-then-irrelevant) spend-down/installing
 * phase inputs -- the spend-down phases don't satisfy the arming conditions
 * and must not self-abort an in-progress install. Only Kenneth's two levers
 * clear it: changing ratchet-mode.txt away from "auto" (mode stops being
 * "auto", shortcut no longer applies) or creating the pause file (paused
 * flows into the shortcut's guard too).
 *
 * Phase 26 A2 (S1/S2): `gateRelease` is computeGateRelease's result (or
 * null), passed in rather than derived here -- this function stays pure and
 * never sees the catalog. `gateArmed := gateRelease?.closedByQueue &&
 * queuedCount >= 1 && !paused`, deliberately NOT gated on `endgameHold` (the
 * whole point of the exception), MIN_TOTAL_GAIN, or the phase label -- an
 * install this narrow is justified by the unlock itself. `armed := (gainArmed
 * && phaseArmed) || gateArmed`; everything downstream (sustain, the auto-mode
 * latch, the abort levers) is unchanged and applies to a gate-armed state
 * exactly as it does to a gain-armed one.
 */
export function evalTrigger(inputs, priorState) {
  const {
    queuedGain = 1,
    queuedCount = 0,
    nfgPrice = 0,
    nfgHackingMult = 1,
    nfgRep = 0,
    nfgRepReq = 0,
    money = 0,
    phase,
    targetFaction,
    deficit = 0,
    repRates = {},
    rateSamples = {},
    paused = false,
    endgameHold = false,
    mode = "observe",
    gateRelease = null,
    now,
  } = inputs;

  if (priorState?.fired && mode === "auto" && !paused) {
    return { ...priorState, latched: true };
  }

  // How many NFG levels `money` can buy when each costs NFG_PRICE_LADDER (L)
  // times the previous, starting from nfgPrice (p). Geometric closed form:
  // sum_{i=0}^{k-1} p*L^i <= money  =>  k = floor(log(1 + money*(L-1)/p) / log L).
  // The (L-1) numerator factor MUST track the ladder -- it was previously the
  // literal 0.9, which was exactly (1.9 - 1) and silently went stale when a
  // real 2.166 ladder was measured (2026-07-17). Validated against install #8:
  // predicts 11, which is what spend-down actually bought.
  let moneyLevels = 0;
  const hasMoneyInfo = nfgPrice > 0;
  if (hasMoneyInfo) {
    const ratio = 1 + (money * (NFG_PRICE_LADDER - 1)) / nfgPrice;
    if (ratio > 1) moneyLevels = Math.max(0, Math.floor(Math.log(ratio) / Math.log(NFG_PRICE_LADDER)));
  }
  // Rep bounds the tail too, and increasingly does the binding (2026-07-18):
  // NFG's repReq escalates x1.14 per level while rep resets to zero every
  // install, so each cycle re-earns a requirement that has grown 10k -> 123k ->
  // 999k over three installs. The old money-only projection was documented as
  // "accepted optimism ... NFG's rep requirement may bind first"; that
  // optimism is now the common case, and it inflates totalGain -- which is
  // exactly what MIN_TOTAL_GAIN gates on.
  //
  // The supplied-ness test is `nfgRepReq > 0` ALONE, deliberately. Gating on
  // `nfgRep > 0` too cannot distinguish "caller supplied no rep info" from
  // "supplied it, and we hold zero usable rep" -- and the second is the case
  // this exists for: when no joined seller clears repReq, spendDownPlan
  // suppresses the whole tail, so the honest projection is 0, not money-only.
  // Caught live 2026-07-18 with repReq 998,737 against ~180k rep: the tail was
  // suppressed while the projection still claimed 14 levels and a 1.1495
  // totalGain, already over MIN_TOTAL_GAIN. Only queuedCount 0 was holding the
  // trigger down.
  //
  // Phase 26 D9: `nfgBoundBy` names WHICH ladder actually cut the projection
  // -- "money" | "rep" | "none" (no price info supplied at all, so no tail was
  // even attempted). Rep is credited whenever it supplies a tighter (or
  // equally tight) bound than money, INCLUDING when that bound is 0 -- rep
  // being the reason the tail is zero is still a rep-bound record, not "none".
  let nfgLevelsProjected = moneyLevels;
  let nfgBoundBy = hasMoneyInfo ? "money" : "none";
  if (nfgRepReq > 0) {
    const repLevels = nfgLevelsByRep(nfgRep, nfgRepReq);
    if (!hasMoneyInfo || repLevels <= moneyLevels) {
      nfgLevelsProjected = repLevels;
      nfgBoundBy = "rep";
    }
  }
  const projectedNfgFactor = Math.pow(nfgHackingMult, nfgLevelsProjected);
  const totalGain = queuedGain * projectedNfgFactor;

  const gainArmed = totalGain >= MIN_TOTAL_GAIN && queuedCount >= 1 && !paused && !endgameHold;

  let horizonMs = null;
  let phaseArmed = false;
  if (gainArmed) {
    if (phase === "idle-plateau") {
      phaseArmed = true;
    } else if (phase === "grinding") {
      if (!targetFaction) {
        // Gap 7 (2026-07-18). `pickHorizonGrind` returning no faction means
        // NO reachable aug still owes rep -- there is nothing left to wait
        // on, which is a plateau however the phase is labelled. It is NOT
        // "keep grinding": planActions labels this "grinding" only because
        // NFG's per-cycle cap (buyBlocked) keeps the head target non-rep-met
        // and so keeps the action list non-empty, never reaching the
        // "idle-plateau" label. Reading undefined as "no horizon, don't arm"
        // stalled the auto cycle for 25h with $3.3q idle and gain 2.36.
        //
        // Money-blocked is deliberately NOT this case: planActions returns
        // "awaiting-money" there (see the repMet branch), and that phase
        // never arms -- so this only fires when rep, not cash, is what has
        // run out of things to buy.
        //
        // This is the fifth instance of this file's recurring faction-identity
        // confusion (see phase-25-faction-strategy.closeout.md): the previous
        // two fixes both widened *which* faction gets picked and neither
        // handled "correctly picks none".
        phaseArmed = true;
      } else {
        const rate = repRates[targetFaction];
        const samples = rateSamples[targetFaction] ?? 0;
        if (rate > 0 && samples >= RATE_MIN_SAMPLES) {
          horizonMs = deficit / rate;
          phaseArmed = horizonMs > GRIND_HORIZON_MS;
        }
      }
    }
  }

  // Phase 26 A2 (S1/S2): the third arming reason. Deliberately independent of
  // endgameHold/MIN_TOTAL_GAIN/phase -- see this function's header and
  // computeGateRelease's for the full "why". Safety is entirely
  // gateRelease.closedByQueue: an install that would not actually move the
  // gate can never arm this way.
  const gateArmed = !!(gateRelease?.closedByQueue && queuedCount >= 1 && !paused);

  const armed = (gainArmed && phaseArmed) || gateArmed;
  const wasArmedSince = priorState?.armed ? priorState.armedSinceMs : null;
  const armedSinceMs = armed ? (wasArmedSince ?? now) : null;
  const sustainedMs = armed ? now - armedSinceMs : 0;
  const fired = armed && sustainedMs >= TRIGGER_SUSTAIN_MS;

  return {
    armed,
    fired,
    latched: false,
    armedSinceMs,
    sustainedMs,
    totalGain,
    projectedNfgFactor,
    nfgLevelsProjected,
    nfgBoundBy,
    horizonMs,
    gateRelease,
    reasons: { gainArmed, phaseArmed, gateArmed },
  };
}

/**
 * Pure (Phase 26 B2, S4). Adaptive stall-age threshold: STALL_CYCLE_FACTOR x
 * the median of `cycleIntervalsMs`, clamped to [STALL_MIN_MS, STALL_MAX_MS].
 * Fewer than 2 measured intervals (can't derive a meaningful median from 0 or
 * 1 points) falls back to STALL_FALLBACK_MS. Observed cycles run 4-8h, so 3x
 * median lands 12-24h in steady state -- inside the clamp, which exists only
 * to protect a thin early sample (or a much slower future node) from a false
 * positive or a threshold so loose it never fires.
 * @param {number[]} cycleIntervalsMs install-to-install deltas, most-recent-first or not (order doesn't matter)
 */
export function computeStallThreshold(cycleIntervalsMs) {
  const valid = (cycleIntervalsMs ?? []).filter((v) => v > 0);
  if (valid.length < 2) return STALL_FALLBACK_MS;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.min(STALL_MAX_MS, Math.max(STALL_MIN_MS, STALL_CYCLE_FACTOR * median));
}

/**
 * Pure (Phase 26 B2, S4). Up to the last 5 install-to-install deltas (ms)
 * derivable from ratchetlog.js's persisted {installTime} records, bounded to
 * the CURRENT node (installTime >= nodeResetMs) so a previous node's cadence
 * can't leak into a fresh node's thin sample.
 * @param {{installTime: number}[]} records ratchet-log.json's parsed array
 * @param {number} nodeResetMs ns.getResetInfo().lastNodeReset
 * @returns {number[]}
 */
export function recentCycleIntervals(records, nodeResetMs) {
  const inNode = (records ?? [])
    .filter((r) => (r?.installTime ?? -Infinity) >= (nodeResetMs ?? 0))
    .map((r) => r.installTime)
    .sort((a, b) => a - b);
  const deltas = [];
  for (let i = 1; i < inNode.length; i++) deltas.push(inNode[i] - inNode[i - 1]);
  return deltas.slice(-5);
}

/**
 * Pure (Phase 26 B2, S4). "We stopped making progress" -- watches age since
 * `lastAugReset` against computeStallThreshold's adaptive bound, independent
 * of what the phase label claims (gap 7 and gap 9 both had every process
 * healthy and a non-"idle-plateau" phase label throughout). Deliberately NOT
 * suppressed by `endgameHold` -- a stalled endgame is exactly gap 9's shape,
 * and a healthy post-A2 endgame hold resolves itself, so suppressing here
 * would hide the one case this exists to catch.
 *
 * Gated OFF (reports `stalled: false`, no warn) when `mode !== "auto"`
 * (observe mode never installs, so "stalled" has no meaning), `paused`
 * (a deliberate hold), or `installSeqActive` (a running spend-down/install is
 * the opposite of a stall). `lastWarnMs` carries across calls (and across a
 * B1 relaunch, via the state file) so the re-warn cadence survives a restart
 * mid-stall instead of re-warning immediately.
 * @param {{nowMs: number, lastAugReset: number, mode: string, installSeqActive?: boolean,
 *   paused?: boolean, cycleIntervalsMs?: number[]}} inputs
 * @param {{stalled: boolean, lastWarnMs: number|null}|null} priorStall
 * @returns {{stalled: boolean, ageMs: number, thresholdMs: number, warnDue: boolean, lastWarnMs: number|null}}
 */
export function evalStall(inputs, priorStall) {
  const { nowMs, lastAugReset, mode, installSeqActive = false, paused = false, cycleIntervalsMs = [] } = inputs;

  const thresholdMs = computeStallThreshold(cycleIntervalsMs);
  const ageMs = nowMs - lastAugReset;
  const gated = mode === "auto" && !paused && !installSeqActive;

  if (!gated) {
    return { stalled: false, ageMs, thresholdMs, warnDue: false, lastWarnMs: priorStall?.lastWarnMs ?? null };
  }

  const stalled = ageMs > thresholdMs;
  const wasStalled = !!priorStall?.stalled;
  let lastWarnMs = priorStall?.lastWarnMs ?? null;
  let warnDue = false;

  if (stalled && !wasStalled) {
    warnDue = true; // false -> true crossing
    lastWarnMs = nowMs;
  } else if (stalled && wasStalled) {
    if (lastWarnMs == null || nowMs - lastWarnMs >= STALL_REWARN_MS) {
      warnDue = true;
      lastWarnMs = nowMs;
    }
  } else {
    lastWarnMs = null; // not stalled -- next stall re-arms the crossing fresh
  }

  return { stalled, ageMs, thresholdMs, warnDue, lastWarnMs };
}

/**
 * Pure (Phase 25 gap 6, 2026-07-17). Which faction to buy NeuroFlux Governor
 * from: the JOINED seller we hold the most rep with, or null if none of them
 * clears `repReq`.
 *
 * NFG's rep requirement is identical whoever sells it -- you just need that
 * much rep with whoever you buy from -- so the most-rep seller is strictly
 * best: it's the only pick that can't suppress the NFG tail, and rep is what
 * caps how many levels a spend-down can take.
 *
 * This replaces `sellers[0]`, which answered "who sells it" (catalog order)
 * rather than "who can we actually buy from" -- the fourth instance of the
 * faction-identity confusion tracked in phase-25-faction-strategy.closeout.md.
 * It mattered: install #6 bought from CyberSec (54,690 rep) while Chongqing
 * sat at 226,822, and only worked because CyberSec happened to clear the
 * requirement. Since installing resets rep to 0, that's a fresh coin-flip
 * every cycle, and losing it wastes the entire bank on an install.
 *
 * `factionRep` holds joined factions only, so an absent key means not joined.
 * @param {string[]} sellers factions selling NFG, in catalog order
 * @param {Record<string, number>} factionRep rep by JOINED faction
 * @param {number} repReq NFG's current rep requirement
 * @returns {string|null}
 */
export function pickNfgSeller(sellers, factionRep, repReq) {
  let best = null;
  let bestRep = -Infinity;
  for (const faction of sellers ?? []) {
    const rep = factionRep?.[faction];
    if (rep === undefined) continue; // not joined -- can't buy from them
    if (rep < repReq) continue; // rep gate not cleared
    if (rep > bestRep) {
      best = faction;
      bestRep = rep;
    }
  }
  return best;
}

/**
 * Pure (2026-07-18). How many NFG levels `rep` can clear, given the CURRENT
 * level's requirement and the ×NFG_REP_LADDER escalation: level i (0-indexed)
 * needs repReq * L^i, so the count is floor(log(rep/repReq)/log L) + 1, and 0
 * when rep can't even clear the first.
 *
 * Rep does not grow during a spend-down (it's seconds long, and the work slot
 * is not earning through an install), so a single up-front bound is exact --
 * no need to re-derive per level.
 * @param {number} rep rep with the chosen NFG seller
 * @param {number} repReq the current level's requirement
 */
export function nfgLevelsByRep(rep, repReq) {
  if (!(rep > 0) || !(repReq > 0) || rep < repReq) return 0;
  return Math.floor(Math.log(rep / repReq) / Math.log(NFG_REP_LADDER)) + 1;
}

/**
 * Pure (S10 step 1). One pass's spend-down buy list: rep-met discrete augs
 * first in S3's sorted order (skipping NFG, handled below), then repeated
 * NFG levels using the observed NFG_PRICE_LADDER escalation from
 * `nfgState.livePrice`, bounded by SPEND_DOWN_BUY_CAP. `nfgState` is
 * {livePrice, faction, repMet, rep, repReq} -- repMet false suppresses the NFG
 * tail (money-only affordability can't buy past its own rep requirement).
 *
 * The tail is bounded by BOTH ladders (2026-07-18): money escalates ×2.166 per
 * level and the rep requirement escalates ×1.14, so rep can run out first even
 * though it cleared level 1. Before this the tail was money-bounded only and
 * planned levels the game would refuse -- harmless at the buy site (a failed
 * spend records nothing) but it fed a `totalGain` that overstated the fire.
 * `rep`/`repReq` omitted => rep is not treated as binding, preserving the old
 * behavior for callers that don't supply them.
 * @param {object[]} sortedCandidates
 * @param {{augs: Record<string, {price: number}>}} catalog
 * @param {number} money
 * @param {{livePrice: number, faction: string, repMet: boolean}|null} nfgState
 */
export function spendDownPlan(sortedCandidates, catalog, money, nfgState) {
  const actions = [];
  let remaining = money;

  for (const c of sortedCandidates) {
    if (actions.length >= SPEND_DOWN_BUY_CAP) return actions;
    if (c.aug === NFG_NAME) continue;
    if (c.deficit > 0) continue;
    if (c.price > remaining) continue;
    actions.push({ type: "buy", aug: c.aug, faction: c.faction, price: c.price });
    remaining -= c.price;
  }

  if (nfgState?.repMet && nfgState.faction && nfgState.livePrice > 0) {
    // `repReq > 0` alone marks the info as supplied -- see evalTrigger's note:
    // rep of 0 is a real answer (cap 0), not a missing one.
    const repCap = nfgState.repReq > 0 ? nfgLevelsByRep(nfgState.rep ?? 0, nfgState.repReq) : Infinity;
    let price = nfgState.livePrice;
    let nfgLevels = 0;
    while (actions.length < SPEND_DOWN_BUY_CAP && price > 0 && price <= remaining && nfgLevels < repCap) {
      actions.push({ type: "buy", aug: NFG_NAME, faction: nfgState.faction, price });
      remaining -= price;
      price *= NFG_PRICE_LADDER;
      nfgLevels += 1;
    }
  }

  return actions;
}

/**
 * Pure (2026-07-15 amendment, Kenneth's ask). $ reservation protecting the
 * Daedalus INVITE'S own money gate -- read live from the catalog's
 * inviteReqs (not hard-coded), so it tracks this BitNode's actual
 * multiplier instead of assuming the vanilla $100b. Only meaningful once
 * not yet joined; the caller gates this on endgameHold (hack>=2500) so it
 * doesn't start protecting a huge sum from the very start of a fresh
 * cycle, which would stall cloud-fleet growth for the entire early climb
 * for no benefit -- the invite is unreachable until hack clears 2500
 * anyway, so nothing is lost by waiting for that same signal.
 * @param {{factions: Record<string, {inviteReqs: object[]}>}} catalog
 */
export function daedalusInviteReserve(catalog) {
  const reqs = catalog.factions?.Daedalus?.inviteReqs ?? [];
  const moneyReq = reqs.find((r) => r.type === "money");
  return moneyReq?.money ?? 0;
}

/**
 * Pure (2026-07-15 amendment). $ reservation for the Daedalus donation
 * buyout, once joined -- a moving target that shrinks as rep grinds toward
 * The Red Pill's own rep requirement (read live from the catalog, not
 * hard-coded to 2.5m). Zero whenever: the requirement is unreadable, rep
 * already clears it (Red Pill is $0 -- nothing left to reserve), favor
 * hasn't cleared the donate threshold yet (donating isn't actionable, so
 * nothing to protect), or Formulas.exe is absent (donationForRep throws
 * without it -- same guard as S6's generalized donation route).
 * `donationCost` is the caller's live `formulas.reputation.donationForRep(
 * deficit, player)` result for the CURRENT deficit -- needs ns.formulas,
 * so it's computed by the caller, not here.
 * @param {{redPillRepReq: number|null, daedalusRep: number, daedalusFavor: number,
 *   favorToDonate: number, hasFormulas: boolean, donationCost: number|null}} inputs
 */
export function daedalusDonationReserve({ redPillRepReq, daedalusRep, daedalusFavor, favorToDonate, hasFormulas, donationCost }) {
  if (redPillRepReq == null) return 0;
  const deficit = Math.max(0, redPillRepReq - (daedalusRep ?? 0));
  if (deficit <= 0) return 0;
  if (!hasFormulas || (daedalusFavor ?? 0) < (favorToDonate ?? Infinity)) return 0;
  return donationCost ?? 0;
}

/**
 * Pure (2026-07-15 amendment, Kenneth's ask: "auto donate to Daedalus for
 * the 2.5m rep"). True iff daedalusDonationReserve's amount is actionable
 * this pass -- same DONATION_BUFFER shape as S6's generalized route, just
 * no longer excluded for Daedalus. This only covers the donate call itself
 * -- buying The Red Pill (now allow-listed, see UTILITY_ALLOWLIST) flows
 * through the normal pickTarget/planPass buy pipeline once rep clears, and
 * installing is a separate concern gated behind ratchet-mode.txt.
 * @param {number} daedalusReserveAmount
 * @param {number} money
 */
export function shouldDonateToDaedalus(daedalusReserveAmount, money) {
  return daedalusReserveAmount > 0 && money >= DONATION_BUFFER * daedalusReserveAmount;
}

/** Pure (S9). One ratchet-decisions.json record; `inputs` carries whatever the caller has this pass. */
export function buildDecisionRecord(kind, inputs) {
  const now = inputs.now ?? Date.now();
  return {
    timestamp: now,
    time: new Date(now).toLocaleTimeString(),
    kind,
    mode: inputs.mode ?? null,
    phase: inputs.phase ?? null,
    trigger: inputs.trigger ?? null,
    target: inputs.target ? { aug: inputs.target.aug, faction: inputs.target.faction, deficit: inputs.target.deficit } : null,
    queuedCount: inputs.queuedCount ?? null,
    queuedGain: inputs.queuedGain ?? null,
    money: inputs.money ?? null,
    multsHacking: inputs.multsHacking ?? null,
    detail: inputs.detail ?? null,
    constants: {
      SCORE_W_EXP,
      SCORE_W_REP,
      ALLOWLIST_SCORE,
      MIN_TOTAL_GAIN,
      GRIND_HORIZON_MS,
      TRIGGER_SUSTAIN_MS,
      RATE_MIN_SAMPLES,
      DONATION_BUFFER,
      ENDGAME_HACK_LEVEL,
      SPEND_DOWN_BUY_CAP,
      STALL_CYCLE_FACTOR,
      STALL_MIN_MS,
      STALL_MAX_MS,
      STALL_FALLBACK_MS,
      STALL_REWARN_MS,
    },
  };
}

/**
 * Pure (S1/S4/S5/S6/S10). The whole per-pass decision.
 *
 * `target` is pickTarget's head (spread fields) or null. `joinFactions` is
 * S4's proactive join list (planJoins' output, independent of `target`).
 * `travel` is at most one {city, faction} candidate the caller resolved
 * (current target's city gap first, else any other scope faction's city
 * gap). `workTarget` is S5's pickWorkFaction result (may differ from
 * `target`). `favor`/`favorToDonate`/`hasFormulas`/`donationCost` are S6's
 * inputs for the head target's faction (donationCost is
 * formulas.reputation.donationForRep(target.deficit, player), precomputed
 * by the caller since it needs ns.formulas). `fired` is evalTrigger's
 * latched-or-fresh fired flag for this pass. `installSeq` drives S10's
 * auto-mode phases -- {phase: "spend-down", actions, execReady} or
 * {phase: "installing"} -- and is defense-in-depth cleared to null whenever
 * `mode !== "auto"` so a misused installSeq can never leak a spend-down/
 * exec/install action in observe mode (the rail test).
 */
export function planPass({
  target,
  joinFactions = [],
  travel,
  currentWork,
  factionScope,
  money,
  livePrice,
  paused,
  workTarget,
  favor,
  favorToDonate,
  hasFormulas,
  donationCost,
  endgameHold,
  mode,
  fired,
  installSeq,
  gateFill,
}) {
  if (paused) return { actions: [], reserve: 0, phase: "paused" };

  const seq = mode === "auto" ? installSeq : null;

  if (seq?.phase === "installing") {
    return { actions: [], reserve: money, phase: "installing" };
  }
  if (seq?.phase === "spend-down") {
    const actions = [...(seq.actions ?? [])];
    if (seq.execReady) actions.push({ type: "install-exec" });
    return { actions, reserve: money, phase: "spend-down" };
  }

  const actions = [];
  for (const faction of joinFactions) {
    if (!factionScope.has(faction)) continue; // D11 defense-in-depth, second rail alongside planJoins' own catalog check
    actions.push({ type: "join", faction });
  }
  if (travel) actions.push({ type: "travel", city: travel.city, faction: travel.faction });

  // Phase 26 A1. A count gate is the only thing between us and a faction, and
  // nothing the scorer likes is buyable -- so buy the cheapest aug that exists
  // purely to move the count. MUST live here in the grinding path, not in
  // spend-down: `endgameHold` blocks arming, so spend-down never runs in
  // exactly the state this exists to break (see findAugCountGate's header).
  //
  // Emitted LAST among buys (D5) -- purchase inflation hits everything bought
  // after it, so a zero-score aug must never precede one whose price matters.
  // Today nothing else is buyable, which is the whole problem, but the rule is
  // wrong without the ordering.
  if (gateFill) {
    actions.push({
      type: "buy",
      aug: gateFill.aug,
      faction: gateFill.faction,
      price: gateFill.price,
      gateFill: true,
    });
    return { actions, reserve: 0, phase: "gate-fill" };
  }

  if (fired) {
    return { actions, reserve: 0, phase: "install-ready" };
  }

  if (!target) {
    return { actions, reserve: 0, phase: actions.length > 0 ? "grinding" : "idle-plateau" };
  }

  // D11 defense-in-depth: every join/work/travel site routes through the
  // FACTION_SCOPE check, not just the catalog construction that (today)
  // guarantees pickTarget never returns an out-of-scope faction -- a second
  // rail is cheap and makes this invariant directly testable here.
  if (!factionScope.has(target.faction)) return { actions, reserve: 0, phase: "awaiting-invite" };

  if (target.status === "city-gap" || target.status === "awaiting-invite" || target.status === "invite-pending") {
    return { actions, reserve: 0, phase: target.status === "invite-pending" ? "grinding" : "awaiting-invite" };
  }

  // status === "joined". buyBlocked (NFG's D3 cap) forces the grind branch
  // even when this level's rep is already met -- no buy/reserve is emitted,
  // and repReq live-refreshes to the next level's requirement on the next
  // poll, so the work slot keeps banking rep ahead of the next spend-down.
  const repMet = target.deficit <= 0 && !target.buyBlocked;
  if (repMet) {
    actions.push({ type: "reserve", amount: livePrice, aug: target.aug, faction: target.faction });
    if (money >= livePrice) {
      actions.push({ type: "buy", aug: target.aug, faction: target.faction, price: livePrice });
      return { actions, reserve: livePrice, phase: "grinding" };
    }
    return { actions, reserve: livePrice, phase: "awaiting-money" };
  }

  // S6: the donation route, generalized -- eligible once this faction's
  // favor clears the donate threshold, Formulas.exe is on home, and endgame
  // hold isn't in force (Daedalus is excluded exactly by this last check
  // whenever it holds, per S6 -- no separate Daedalus special-case needed).
  const donationEligible = !endgameHold && hasFormulas && donationCost != null && (favor ?? 0) >= (favorToDonate ?? Infinity);
  let phase = "grinding";
  let reserveAmount = 0;
  if (donationEligible) {
    const totalCost = donationCost + livePrice;
    reserveAmount = totalCost;
    if (money >= DONATION_BUFFER * totalCost) {
      actions.push({ type: "donate", faction: target.faction, amount: donationCost, deficit: target.deficit });
      return { actions, reserve: reserveAmount, phase: "grinding" };
    }
    phase = "awaiting-money";
  }

  const slot = slotAvailable(currentWork, factionScope);
  if (!slot.available) {
    actions.push({ type: "yield" });
    return { actions, reserve: reserveAmount, phase: "yielded" };
  }

  if (workTarget?.faction) {
    const workType = pickWorkType(workTarget.workTypes);
    const alreadyWorking =
      currentWork?.type === "FACTION" && currentWork.factionName === workTarget.faction && currentWork.factionWorkType === workType;
    if (!alreadyWorking) actions.push({ type: "work", faction: workTarget.faction, workType });
  }
  return { actions, reserve: reserveAmount, phase };
}

/** Pure (S7). Shape {amount, aug, faction, timestamp, time}; amount<=0 clears aug/faction to null. */
export function buildReserveRecord(amount, target, now) {
  const positive = amount > 0;
  return {
    amount: positive ? amount : 0,
    aug: positive ? (target?.aug ?? null) : null,
    faction: positive ? (target?.faction ?? null) : null,
    timestamp: now,
    time: new Date(now).toLocaleTimeString(),
  };
}

/** Reads FACTION_SCOPE + augs/factions live and builds the static catalog (S5/S3). */
function buildCatalog(ns, factionScope, utilityAllowlist) {
  const factions = {};
  const sellersByAug = {};

  for (const faction of factionScope) {
    const enemies = ns.singularity.getFactionEnemies(faction);
    const inviteReqs = ns.singularity.getFactionInviteRequirements(faction);
    const workTypes = ns.singularity.getFactionWorkTypes(faction);
    factions[faction] = { enemies, inviteReqs, workTypes };

    for (const aug of ns.singularity.getAugmentationsFromFaction(faction)) {
      if (!sellersByAug[aug]) sellersByAug[aug] = [];
      sellersByAug[aug].push(faction);
    }
  }

  const statsByName = {};
  for (const name of Object.keys(sellersByAug)) {
    statsByName[name] = ns.singularity.getAugmentationStats(name);
  }
  const allowSet = new Set(utilityAllowlist);
  const keptSet = filterAugs(statsByName, utilityAllowlist);

  const augs = {};
  for (const name of Object.keys(sellersByAug)) {
    augs[name] = {
      prereqs: ns.singularity.getAugmentationPrereq(name),
      sellers: sellersByAug[name],
      repReq: ns.singularity.getAugmentationRepReq(name),
      price: ns.singularity.getAugmentationPrice(name),
      passesFilter: keptSet.has(name),
      isNFG: name === NFG_NAME,
      score: scoreAug(name, statsByName[name], allowSet),
      hackingMult: statsByName[name]?.hacking ?? 1,
    };
  }

  return { augs, factions };
}

/**
 * S13's two-tier throw handling (mirrors backdoorfactions.js/
 * procureprograms.js): a throw before the first successful Singularity call
 * is the no-SF4 sentinel (permanent this run -- WARN once, exit); any throw
 * after is transient game state, handled by each call site's own try/catch
 * and a per-pass WARN + retry instead.
 */
function exitSingularityUnavailable(ns, callLabel, error) {
  tprintTs(ns, `WARN: ${callLabel} threw -- Singularity unavailable right now (${error?.message ?? error})`);
  ns.tprint("===== augfarmer summary =====");
  ns.tprint("  can't auto-farm augs yet -- exiting.");
  ns.ui.closeTail();
}

function readState(ns) {
  const raw = ns.read(STATE_FILE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readJSON(ns, file) {
  const raw = ns.read(file);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** S9's append-only ring, cap DECISIONS_CAP -- same FIFO-trim pattern as resourcemanager.js's finance log. */
function appendDecision(ns, kind, inputs) {
  const record = buildDecisionRecord(kind, inputs);
  const existing = readJSON(ns, DECISIONS_FILE) ?? [];
  existing.push(record);
  while (existing.length > DECISIONS_CAP) existing.shift();
  ns.write(DECISIONS_FILE, JSON.stringify(existing, null, 2), "w");
  return record;
}

/** Multiset difference: elements of `all` not matched by `subtract`'s counts -- the queued-augs computation (S7). */
function multisetDiff(all, subtract) {
  const counts = new Map();
  for (const n of subtract) counts.set(n, (counts.get(n) ?? 0) + 1);
  const remainder = [];
  for (const n of all) {
    const c = counts.get(n) ?? 0;
    if (c > 0) counts.set(n, c - 1);
    else remainder.push(n);
  }
  return remainder;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  const FactionName = ns.enums.FactionName;
  const FACTION_SCOPE = [
    FactionName.CyberSec,
    FactionName.NiteSec,
    FactionName.TheBlackHand,
    FactionName.BitRunners,
    FactionName.TianDiHui,
    FactionName.Sector12,
    FactionName.Aevum,
    FactionName.Chongqing,
    FactionName.NewTokyo,
    FactionName.Ishima,
    FactionName.Volhaven,
    FactionName.Daedalus,
    FactionName.TheCovenant,
    FactionName.Illuminati,
  ];
  const FACTION_SCOPE_SET = new Set(FACTION_SCOPE);

  let singularityProven = false;
  let catalog = null;
  let previousJoinedKey = null;

  const savedState = readState(ns);
  const resetInfoAtStartup = ns.getResetInfo();
  let lastAugReset = resetInfoAtStartup.lastAugReset;
  let nfgBoughtThisCycle = false;
  let boughtThisCycle = [];
  // Phase 26 B2: restored the same way, keyed on the same lastAugReset match --
  // without this a mid-stall B1 relaunch would lose lastWarnMs and immediately
  // re-warn instead of respecting the remaining STALL_REWARN_MS window.
  let stallState = null;
  if (savedState && savedState.lastAugReset === lastAugReset) {
    nfgBoughtThisCycle = savedState.nfgBoughtThisCycle ?? false;
    boughtThisCycle = savedState.boughtThisCycle ?? [];
    if (savedState.stall) {
      stallState = {
        stalled: savedState.stall.stalled ?? false,
        ageMs: savedState.stall.ageMs ?? 0,
        thresholdMs: savedState.stall.thresholdMs ?? STALL_FALLBACK_MS,
        lastWarnMs: savedState.stall.lastWarnMs ?? null,
      };
    }
  }

  let lastFailureKey = null;
  let previousPhase = null;
  let previousTargetAug = null;
  let launchedSummary = false;
  let lastStateWrite = 0;

  // Phase 25 loop-local state -- reset on every install-cycle boundary below.
  let prevFactionRep = {};
  let repRates = {};
  let rateSamples = {};
  let lastRateUpdate = 0;
  let triggerState = null;
  let installSeq = null;
  let previousCampKey = null;
  let previousEndgameHold = null;
  let installerExecWarned = false;

  while (true) {
    const nowMs = Date.now();
    const timeLabel = new Date(nowMs).toLocaleTimeString();
    const paused = ns.fileExists(PAUSE_FILE, "home");
    const modeRaw = ns.read(RATCHET_MODE_FILE);
    const mode = modeRaw?.trim() === "auto" ? "auto" : "observe";

    const resetInfo = ns.getResetInfo();
    if (resetInfo.lastAugReset !== lastAugReset) {
      lastAugReset = resetInfo.lastAugReset;
      nfgBoughtThisCycle = false;
      boughtThisCycle = [];
      catalog = null;
      previousJoinedKey = null;
      prevFactionRep = {};
      repRates = {};
      rateSamples = {};
      triggerState = null;
      installSeq = null;
      previousCampKey = null;
      stallState = null;
      tprintTs(ns, "INFO: new install cycle detected (lastAugReset changed) -- resetting NFG cap + bought-this-cycle tracking");
    }

    const player = ns.getPlayer();
    const joined = new Set(player.factions);
    const joinedKey = FACTION_SCOPE.filter((f) => joined.has(f)).sort().join(",");

    if (catalog === null || joinedKey !== previousJoinedKey) {
      try {
        catalog = buildCatalog(ns, FACTION_SCOPE, UTILITY_ALLOWLIST);
        singularityProven = true;
        previousJoinedKey = joinedKey;
        ns.write(CATALOG_FILE, JSON.stringify(catalog, null, 2), "w");
      } catch (e) {
        if (!singularityProven) {
          exitSingularityUnavailable(ns, "buildCatalog", e);
          return;
        }
        tprintTs(ns, `WARN: buildCatalog threw (${e?.message ?? e}) -- retrying next poll`);
        if (catalog === null) {
          await ns.sleep(POLL_MS);
          continue;
        }
      }
    }

    // NFG's repReq/price move independent of catalog rebuilds -- always re-read live.
    if (catalog.augs[NFG_NAME]) {
      try {
        catalog.augs[NFG_NAME].repReq = ns.singularity.getAugmentationRepReq(NFG_NAME);
        catalog.augs[NFG_NAME].price = ns.singularity.getAugmentationPrice(NFG_NAME);
        singularityProven = true;
      } catch (e) {
        if (!singularityProven) {
          exitSingularityUnavailable(ns, "getAugmentationRepReq(NFG)", e);
          return;
        }
        tprintTs(ns, `WARN: NFG live-read threw (${e?.message ?? e}) -- using stale catalog value`);
      }
    }

    let ownedTrueRaw;
    let ownedInstalled;
    try {
      ownedTrueRaw = ns.singularity.getOwnedAugmentations(true);
      ownedInstalled = ns.singularity.getOwnedAugmentations(false);
      singularityProven = true;
    } catch (e) {
      if (!singularityProven) {
        exitSingularityUnavailable(ns, "getOwnedAugmentations", e);
        return;
      }
      tprintTs(ns, `WARN: getOwnedAugmentations threw (${e?.message ?? e}) -- retrying next poll`);
      await ns.sleep(POLL_MS);
      continue;
    }
    const ownedSet = new Set(ownedTrueRaw);

    let invites;
    try {
      invites = new Set(ns.singularity.checkFactionInvitations());
      singularityProven = true;
    } catch (e) {
      if (!singularityProven) {
        exitSingularityUnavailable(ns, "checkFactionInvitations", e);
        return;
      }
      tprintTs(ns, `WARN: checkFactionInvitations threw (${e?.message ?? e}) -- retrying next poll`);
      invites = new Set();
    }

    const factionRep = {};
    const favor = {};
    try {
      for (const f of FACTION_SCOPE) {
        if (joined.has(f)) {
          factionRep[f] = ns.singularity.getFactionRep(f);
          favor[f] = ns.singularity.getFactionFavor(f);
        }
      }
      singularityProven = true;
    } catch (e) {
      if (!singularityProven) {
        exitSingularityUnavailable(ns, "getFactionRep", e);
        return;
      }
      tprintTs(ns, `WARN: getFactionRep/getFactionFavor threw (${e?.message ?? e}) -- retrying next poll`);
    }

    let favorToDonate = null;
    try {
      favorToDonate = ns.getFavorToDonate();
      singularityProven = true;
    } catch (e) {
      tprintTs(ns, `WARN: getFavorToDonate threw (${e?.message ?? e}) -- donation route suspended this pass`);
    }

    // S7's rep-rate EWMA -- updated once per pass from the factionRep read above.
    if (lastRateUpdate > 0) {
      const dt = nowMs - lastRateUpdate;
      repRates = updateRepRates(repRates, prevFactionRep, factionRep, dt);
      for (const f of Object.keys(factionRep)) {
        if (prevFactionRep[f] !== undefined) rateSamples[f] = (rateSamples[f] ?? 0) + 1;
      }
    }
    prevFactionRep = factionRep;
    lastRateUpdate = nowMs;

    const playerFacts = {
      city: player.city,
      money: player.money,
      skills: player.skills,
      karma: player.karma,
      jobs: new Set(Object.keys(player.jobs ?? {})),
      backdoored: new Set(),
      invites,
      factionRep,
      // Phase 26 A1: DISTINCT installed augs -- NFG is one entry however many
      // levels it holds (Phase 25 gap 3, settled live). Queued-but-uninstalled
      // augs are deliberately excluded: the game's gate counts what's actually
      // installed, and counting the queue would make the gate read closed a
      // whole cycle early.
      augCount: ownedInstalled.length,
    };

    const target = pickTarget(catalog, playerFacts, joined, ownedSet, nfgBoughtThisCycle);

    const endgameHold = joined.has(FactionName.Daedalus) || player.skills.hacking >= ENDGAME_HACK_LEVEL;
    if (endgameHold !== previousEndgameHold) {
      appendDecision(ns, "endgame-hold", { now: nowMs, mode, phase: previousPhase, money: player.money, detail: { endgameHold } });
      previousEndgameHold = endgameHold;
    }

    const campChoice = pickCamp(catalog, ownedSet, joined);
    const campKey = campChoice?.camp?.join(",") ?? null;
    if (campKey !== previousCampKey) {
      appendDecision(ns, "camp-choice", { now: nowMs, mode, phase: previousPhase, money: player.money, detail: campChoice });
      previousCampKey = campKey;
    }

    const joinFactions = planJoins(catalog, invites, joined, campChoice);

    let travel = null;
    if (target?.status === "city-gap") {
      travel = { city: target.gapCity, faction: target.faction };
    } else {
      const campSet = new Set(campChoice?.camp ?? []);
      const cityNames = new Set(cityFactionNames(catalog));
      for (const faction of FACTION_SCOPE) {
        if (joined.has(faction)) continue;
        if (cityNames.has(faction) && !campSet.has(faction)) continue;
        const info = catalog.factions[faction];
        const { onlyCityGap, gapCity } = evaluateInviteReqs(info?.inviteReqs ?? [], playerFacts);
        if (onlyCityGap) {
          travel = { city: gapCity, faction };
          break;
        }
      }
    }

    const donationClosableSet = new Set(
      FACTION_SCOPE.filter((f) => joined.has(f) && !endgameHold && (favor[f] ?? 0) >= (favorToDonate ?? Infinity)),
    );
    const workTarget = pickWorkFaction(target?.candidates ?? [], joined, PASSIVE_REP_FACTIONS, donationClosableSet);

    let currentWork = null;
    try {
      currentWork = ns.singularity.getCurrentWork();
      singularityProven = true;
    } catch (e) {
      if (!singularityProven) {
        exitSingularityUnavailable(ns, "getCurrentWork", e);
        return;
      }
      tprintTs(ns, `WARN: getCurrentWork threw (${e?.message ?? e}) -- retrying next poll`);
    }

    let livePrice = null;
    if (target) {
      try {
        livePrice = ns.singularity.getAugmentationPrice(target.aug);
        singularityProven = true;
      } catch (e) {
        if (!singularityProven) {
          exitSingularityUnavailable(ns, "getAugmentationPrice", e);
          return;
        }
        tprintTs(ns, `WARN: getAugmentationPrice threw (${e?.message ?? e}) -- using stale catalog price`);
        livePrice = catalog.augs[target.aug]?.price ?? null;
      }
    }

    // S6: the donation cost for the head target's faction (Formulas-exact,
    // per resolved open question (b) -- favor-independent). Guarded by
    // Formulas.exe's presence (donationForRep throws without it).
    const hasFormulas = ns.fileExists("Formulas.exe", "home");
    let donationCost = null;
    if (target && target.deficit > 0 && hasFormulas && !endgameHold && (favor[target.faction] ?? 0) >= (favorToDonate ?? Infinity)) {
      try {
        donationCost = ns.formulas.reputation.donationForRep(target.deficit, player);
        singularityProven = true;
      } catch (e) {
        tprintTs(ns, `WARN: donationForRep threw (${e?.message ?? e}) -- donation suspended this pass`);
      }
    }

    // 2026-07-15 amendment (Kenneth's ask): Daedalus-endgame $ reservation
    // -- protects the invite's money gate before joining, then the live
    // donation cost for the shrinking Red Pill rep deficit after joining.
    // Only active once endgameHold holds (hack>=2500) -- see
    // daedalusInviteReserve's header for why gating on that signal, not
    // "always", avoids stalling early-cycle cloud growth for nothing.
    let daedalusReserveAmount = 0;
    let daedalusReserveLabel = null;
    if (endgameHold) {
      if (!joined.has(FactionName.Daedalus)) {
        daedalusReserveAmount = daedalusInviteReserve(catalog);
        daedalusReserveLabel = "Daedalus invite ($ gate)";
      } else {
        const redPillRepReq = catalog.augs[RED_PILL_NAME]?.repReq ?? null;
        const daedalusRep = factionRep[FactionName.Daedalus] ?? 0;
        const daedalusFavor = favor[FactionName.Daedalus] ?? 0;
        const daedalusDeficit = redPillRepReq != null ? Math.max(0, redPillRepReq - daedalusRep) : 0;
        let daedalusDonationCost = null;
        if (daedalusDeficit > 0 && hasFormulas && daedalusFavor >= (favorToDonate ?? Infinity)) {
          try {
            daedalusDonationCost = ns.formulas.reputation.donationForRep(daedalusDeficit, player);
            singularityProven = true;
          } catch (e) {
            tprintTs(ns, `WARN: donationForRep(Daedalus) threw (${e?.message ?? e}) -- reservation suspended this pass`);
          }
        }
        daedalusReserveAmount = daedalusDonationReserve({
          redPillRepReq,
          daedalusRep,
          daedalusFavor,
          favorToDonate,
          hasFormulas,
          donationCost: daedalusDonationCost,
        });
        daedalusReserveLabel = "Daedalus donation buyout";
      }
    }

    // 2026-07-15 amendment (Kenneth's ask): auto-donate to Daedalus once
    // affordable -- same DONATION_BUFFER-gated shape as S6's generalized
    // route, just no longer excluded for Daedalus. Fires unconditional of
    // mode (same as every other faction's donation route) but respects
    // the pause file. On success the reservation is zeroed immediately
    // (S7's cold-review fix: a landed spend must not still be reserved for
    // another poll) before the final reserve write below.
    if (!paused && daedalusReserveLabel === "Daedalus donation buyout" && shouldDonateToDaedalus(daedalusReserveAmount, player.money)) {
      try {
        const ok = ns.singularity.donateToFaction(FactionName.Daedalus, daedalusReserveAmount);
        singularityProven = true;
        if (ok) {
          recordTransaction(ns, {
            type: "expense",
            source: "auto-donation",
            faction: FactionName.Daedalus,
            rep: catalog.augs[RED_PILL_NAME]?.repReq ?? null,
            amount: daedalusReserveAmount,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString(),
          });
          tprintTs(ns, `DONATE: $${ns.format.number(daedalusReserveAmount)} to Daedalus -- clears the Red Pill's rep requirement`);
          appendDecision(ns, "donation", {
            now: nowMs,
            mode,
            phase: previousPhase,
            money: player.money,
            detail: { faction: "Daedalus", amount: daedalusReserveAmount },
          });
          daedalusReserveAmount = 0; // spent -- don't re-reserve it this same pass
        } else {
          tprintTs(ns, "WARN: donateToFaction(Daedalus) returned false -- retrying next poll");
        }
      } catch (e) {
        tprintTs(ns, `WARN: donateToFaction(Daedalus) threw (${e?.message ?? e}) -- retrying next poll`);
      }
    }

    // S7's trigger inputs.
    const queuedNames = multisetDiff(ownedTrueRaw, ownedInstalled);
    const queuedGain = queuedNames.reduce((p, n) => p * (catalog.augs[n]?.hackingMult ?? 1), 1);
    const nfgPrice = catalog.augs[NFG_NAME]?.price ?? 0;
    const nfgHackingMult = catalog.augs[NFG_NAME]?.hackingMult ?? 1;
    // Project the tail against the seller spend-down will actually use (the
    // most-rep joined seller, gap 6) -- projecting against any other faction's
    // rep would bound the wrong thing.
    const nfgRepReq = catalog.augs[NFG_NAME]?.repReq ?? 0;
    const nfgProjectedSeller = pickNfgSeller(catalog.augs[NFG_NAME]?.sellers, factionRep, nfgRepReq || Infinity);
    const nfgRep = nfgProjectedSeller ? (factionRep[nfgProjectedSeller] ?? 0) : 0;

    // The horizon measures the best candidate we're still waiting on rep for
    // -- NOT pickTarget's head (always rep-met, deficit 0) and NOT
    // workTarget (skips passive factions, then falls back to that same
    // rep-met head). See pickHorizonGrind's header: both mistakes shipped.
    const horizonGrind = pickHorizonGrind(target?.candidates ?? [], joined, donationClosableSet);

    // Phase 26 A2 (S2). Step 1 (installed count) + step 2 (owned-including-
    // queued, re-evaluated for the SAME faction step 1 named) live inside
    // computeGateRelease -- see its header for why a second findAugCountGate
    // call would be wrong here. `playerFacts.augCount` is already the
    // installed-only count (unchanged from A1); `ownedSet.size` is owned
    // including queued.
    const gateRelease = computeGateRelease(catalog, playerFacts, ownedSet.size, joined, FACTION_SCOPE_SET);

    const triggerInputs = {
      queuedGain,
      queuedCount: queuedNames.length,
      nfgPrice,
      nfgHackingMult,
      nfgRep,
      nfgRepReq,
      money: player.money,
      phase: previousPhase,
      targetFaction: horizonGrind.faction,
      deficit: horizonGrind.deficit,
      repRates,
      rateSamples,
      paused,
      endgameHold,
      mode,
      gateRelease,
      now: nowMs,
    };
    const prevTrigger = triggerState;
    triggerState = evalTrigger(triggerInputs, triggerState);

    if (triggerState.armed && !prevTrigger?.armed) {
      appendDecision(ns, "trigger-arm", {
        now: nowMs,
        mode,
        phase: previousPhase,
        trigger: triggerState,
        target,
        queuedCount: queuedNames.length,
        queuedGain,
        money: player.money,
        multsHacking: player.mults.hacking,
      });
    }
    if (triggerState.fired && !prevTrigger?.fired) {
      appendDecision(ns, "trigger-fire", {
        now: nowMs,
        mode,
        phase: previousPhase,
        trigger: triggerState,
        target,
        queuedCount: queuedNames.length,
        queuedGain,
        money: player.money,
        multsHacking: player.mults.hacking,
      });
      tprintTs(
        ns,
        `RATCHET: would install now -- totalGain ${triggerState.totalGain.toFixed(3)}, ${queuedNames.length} queued, ` +
          `${triggerState.nfgLevelsProjected} projected NFG level(s) (mode: ${mode})`,
      );
    }
    if (!triggerState.armed && prevTrigger?.armed && mode !== "auto") {
      appendDecision(ns, "trigger-clear", { now: nowMs, mode, phase: previousPhase, trigger: triggerState, money: player.money });
    }

    // S10: (re)build/advance the auto-mode install sequence. Aborts (mode
    // left auto, or paused) drop it back to null with a decision record --
    // Kenneth's two levers.
    if ((mode !== "auto" || paused) && installSeq !== null) {
      appendDecision(ns, "install-abort", { now: nowMs, mode, phase: previousPhase, money: player.money, detail: { paused } });
      installSeq = null;
      installerExecWarned = false;
    }
    if (mode === "auto" && !paused && triggerState.fired && installSeq === null) {
      installSeq = { phase: "spend-down", actions: [], execReady: false };
      appendDecision(ns, "spend-down-start", {
        now: nowMs,
        mode,
        phase: previousPhase,
        trigger: triggerState,
        money: player.money,
        multsHacking: player.mults.hacking,
      });
    }
    if (installSeq?.phase === "spend-down") {
      // Buy NFG from the joined faction we have the MOST rep with, not from
      // catalog order -- pickNfgSeller's docblock has the why (gap 6).
      const nfgSeller = pickNfgSeller(
        catalog.augs[NFG_NAME]?.sellers,
        factionRep,
        catalog.augs[NFG_NAME]?.repReq ?? Infinity
      );
      const nfgState = {
        livePrice: nfgPrice,
        faction: nfgSeller,
        repMet: nfgSeller !== null,
        rep: nfgSeller ? (factionRep[nfgSeller] ?? 0) : 0,
        repReq: catalog.augs[NFG_NAME]?.repReq ?? 0,
      };
      installSeq.actions = spendDownPlan(target?.candidates ?? [], catalog, player.money, nfgState);
      installSeq.execReady = installSeq.actions.length === 0;
    }

    // Phase 26 B2 (S4). Progress-watch, evaluated after installSeq is current
    // for this pass so a running spend-down/install correctly gates it off.
    // Cycle intervals: the last <=5 install-to-install deltas from
    // ratchet-log.json, bounded to the CURRENT node (lastNodeReset) so a
    // previous node's cadence can't leak into this node's thin sample.
    const ratchetLogRecords = readJSON(ns, RATCHET_LOG_FILE) ?? [];
    const cycleIntervalsMs = recentCycleIntervals(ratchetLogRecords, resetInfo.lastNodeReset ?? 0);
    const priorStall = stallState;
    stallState = evalStall(
      { nowMs, lastAugReset, mode, installSeqActive: installSeq !== null, paused, cycleIntervalsMs },
      priorStall,
    );
    if (stallState.warnDue) {
      tprintTs(
        ns,
        `WARN: stall -- ${(stallState.ageMs / 3600_000).toFixed(1)}h since last install ` +
          `(threshold ${(stallState.thresholdMs / 3600_000).toFixed(1)}h), phase ${previousPhase}, ` +
          `reasons ${JSON.stringify(triggerState.reasons)}`,
      );
      appendDecision(ns, "stall-warning", {
        now: nowMs,
        mode,
        phase: previousPhase,
        money: player.money,
        detail: { ageMs: stallState.ageMs, thresholdMs: stallState.thresholdMs, reasons: triggerState.reasons },
      });
    }

    // Phase 26 A1. Only consider a gate-fill when the normal pipeline has
    // nothing to buy -- i.e. no rep-met, affordable, score-positive target.
    // "No passing aug is buyable" is the correct condition, NOT "only NFG
    // left": six passing augs were unowned during the live deadlock, all sold
    // exclusively by the endgame factions the gate locks us out of.
    const normalBuyAvailable =
      !!target && target.deficit <= 0 && !target.buyBlocked && livePrice !== null && player.money >= livePrice;
    let gateFill = null;
    if (!paused && !normalBuyAvailable) {
      // The gate check must count distinct augs INCLUDING QUEUED ones, which
      // is NOT what joinability counts. Buying an aug queues it; the installed
      // count cannot move until an install happens. Feeding the installed
      // count here means the gap never closes, so the rule re-fires every pass
      // and buys the entire catalog at 1.9x each.
      //
      // That is not hypothetical -- it ran live 2026-07-18 07:39, five buys in
      // fifty seconds ($4.75m -> $371m, gap stuck at 1) before being killed.
      // SEVENTH instance of this file's recurring confusion, written while
      // documenting the other six: "what we have" vs "what we will have after
      // the install" are different questions and need different numbers.
      // playerFacts.augCount stays INSTALLED-only because that is what the
      // game's invite check actually reads.
      const gateFacts = { ...playerFacts, augCount: ownedSet.size };
      const gate = findAugCountGate(catalog, gateFacts, joined, FACTION_SCOPE_SET);
      if (gate) {
        const filler = pickGateFiller(catalog.augs, ownedSet, factionRep);
        // One per pass (D4): the next pass re-derives everything, so if the
        // gate closes or a real aug becomes reachable, this simply stops.
        if (filler && player.money >= filler.price) gateFill = { ...filler, gateFaction: gate.faction, gap: gate.gap };
      }
    }

    const plan = planPass({
      target,
      gateFill,
      joinFactions,
      travel,
      currentWork,
      factionScope: FACTION_SCOPE_SET,
      money: player.money,
      livePrice,
      paused,
      workTarget,
      favor: target ? favor[target.faction] : undefined,
      favorToDonate,
      hasFormulas,
      donationCost,
      endgameHold,
      mode,
      fired: triggerState.fired,
      installSeq,
    });

    let boughtThisPass = false;
    for (const action of plan.actions) {
      try {
        if (action.type === "travel") {
          const ok = ns.singularity.travelToCity(action.city);
          singularityProven = true;
          if (ok) {
            recordTransaction(ns, {
              type: "expense",
              source: "auto-travel",
              city: action.city,
              amount: TRAVEL_COST,
              timestamp: Date.now(),
              time: new Date().toLocaleTimeString(),
            });
            tprintTs(ns, `TRAVEL: to ${action.city} for ${action.faction}`);
            lastFailureKey = null;
          } else {
            const key = `travel:${action.city}`;
            if (key !== lastFailureKey) tprintTs(ns, `WARN: travelToCity(${action.city}) returned false -- retrying next poll`);
            lastFailureKey = key;
          }
        } else if (action.type === "join") {
          const ok = ns.singularity.joinFaction(action.faction);
          singularityProven = true;
          if (ok) {
            tprintTs(ns, `JOIN: ${action.faction}`);
            lastFailureKey = null;
          } else {
            const key = `join:${action.faction}`;
            if (key !== lastFailureKey) tprintTs(ns, `WARN: joinFaction(${action.faction}) returned false -- retrying next poll`);
            lastFailureKey = key;
          }
        } else if (action.type === "work") {
          const ok = ns.singularity.workForFaction(action.faction, action.workType, false);
          singularityProven = true;
          if (!ok) {
            const key = `work:${action.faction}:${action.workType}`;
            if (key !== lastFailureKey) tprintTs(ns, `WARN: workForFaction(${action.faction}, ${action.workType}) returned false -- retrying next poll`);
            lastFailureKey = key;
          } else {
            lastFailureKey = null;
          }
        } else if (action.type === "donate") {
          const ok = ns.singularity.donateToFaction(action.faction, action.amount);
          singularityProven = true;
          if (ok) {
            recordTransaction(ns, {
              type: "expense",
              source: "auto-donation",
              faction: action.faction,
              rep: action.deficit,
              amount: action.amount,
              timestamp: Date.now(),
              time: new Date().toLocaleTimeString(),
            });
            tprintTs(ns, `DONATE: $${ns.format.number(action.amount)} to ${action.faction} for ~${Math.round(action.deficit)} rep`);
            appendDecision(ns, "donation", {
              now: nowMs,
              mode,
              phase: plan.phase,
              target,
              money: player.money,
              detail: { faction: action.faction, amount: action.amount, deficit: action.deficit },
            });
            lastFailureKey = null;
          } else {
            const key = `donate:${action.faction}`;
            if (key !== lastFailureKey) tprintTs(ns, `WARN: donateToFaction(${action.faction}) returned false -- retrying next poll`);
            lastFailureKey = key;
          }
        } else if (action.type === "buy") {
          // `action.price` is a PROJECTION -- spendDownPlan ladders NFG_PRICE_LADDER
          // (1.9) forward from one live read, but the game's own escalation is
          // steeper (~2.28x observed), so the projection drifts low and compounds
          // across a run of NFG levels. Logging it understated install #6's 11
          // levels ~5-6x ($417.7b logged vs ~$2.2-2.7t real). Read the live price
          // immediately before buying so the transaction log records what was
          // actually charged (Phase 25 gap 5). This is also how the real ladder
          // gets measured -- the log becomes the dataset.
          let paid = action.price;
          try {
            paid = ns.singularity.getAugmentationPrice(action.aug);
          } catch (e) {
            tprintTs(ns, `WARN: getAugmentationPrice(${action.aug}) threw (${e?.message ?? e}) -- logging the projection instead`);
          }
          const ok = ns.singularity.purchaseAugmentation(action.faction, action.aug);
          singularityProven = true;
          if (ok) {
            recordTransaction(ns, {
              type: "expense",
              source: action.gateFill ? "auto-aug-gate" : "auto-aug",
              aug: action.aug,
              faction: action.faction,
              amount: paid,
              projected: action.price,
              timestamp: Date.now(),
              time: new Date().toLocaleTimeString(),
            });
            if (action.gateFill) {
              // Phase 26 A1: logs only, no dashboard panel -- fires ~once per
              // node clear, which doesn't earn fixed-budget dashboard space.
              appendDecision(ns, "gate-buy", {
                now: nowMs,
                mode,
                phase: plan.phase,
                money: player.money,
                detail: { aug: action.aug, faction: action.faction, paid, gateFaction: gateFill?.gateFaction, gap: gateFill?.gap },
              });
              tprintTs(ns, `GATE: bought ${action.aug} ($${ns.format.number(paid)}) purely to close ${gateFill?.gateFaction ?? "a"}'s aug-count gate`);
            }
            tprintTs(ns, `BUY: ${action.aug} from ${action.faction} for $${ns.format.number(paid)}`);
            boughtThisPass = true;
            if (action.aug === NFG_NAME) nfgBoughtThisCycle = true;
            boughtThisCycle.push({ aug: action.aug, price: paid, faction: action.faction, timestamp: Date.now() });
            lastFailureKey = null;
          } else {
            const key = `buy:${action.faction}:${action.aug}`;
            if (key !== lastFailureKey) tprintTs(ns, `WARN: purchaseAugmentation(${action.faction}, ${action.aug}) returned false -- retrying next poll`);
            lastFailureKey = key;
          }
        } else if (action.type === "install-exec") {
          const pid = ns.exec("installer.js", "home", 1);
          if (pid > 0) {
            appendDecision(ns, "installer-exec", { now: nowMs, mode, phase: plan.phase, money: player.money, multsHacking: player.mults.hacking, detail: { pid } });
            tprintTs(ns, `RATCHET: exec'd installer.js (pid ${pid}) -- handing off the install`);
            installSeq = { phase: "installing" };
            installerExecWarned = false;
          } else if (!installerExecWarned) {
            tprintTs(ns, "WARN: ns.exec(installer.js) returned 0 (no free RAM?) -- retrying next poll");
            installerExecWarned = true;
          }
        }
      } catch (e) {
        if (!singularityProven) {
          exitSingularityUnavailable(ns, `action:${action.type}`, e);
          return;
        }
        tprintTs(ns, `WARN: action ${action.type} threw (${e?.message ?? e}) -- retrying next poll`);
      }
    }

    // S7: fresh reservation write every poll; a buy landing this pass clears
    // it immediately (before this write), so the just-bought aug is never
    // re-reserved for another poll (cold review's finding 4). S10: during
    // spend-down/installing, the reservation instead freezes the *whole*
    // balance (fleet/cloud purchases pause -- purchased servers die with
    // the install while every dollar here converts to mult or hardware).
    let reserveAmount;
    let reserveTarget;
    if (plan.phase === "spend-down" || plan.phase === "installing") {
      reserveAmount = player.money;
      reserveTarget = { aug: "install spend-down", faction: null };
    } else {
      reserveAmount = boughtThisPass ? 0 : (plan.reserve ?? 0);
      reserveTarget = boughtThisPass ? null : target;
    }
    // 2026-07-15 amendment: the Daedalus-endgame reservation always wins if
    // it's bigger -- it can't co-occur with spend-down/installing anyway
    // (S7's gainArmed requires !endgameHold), so this only ever raises the
    // normal per-target reserve, never overrides a real spend-down freeze.
    if (daedalusReserveAmount > reserveAmount) {
      reserveAmount = daedalusReserveAmount;
      reserveTarget = { aug: daedalusReserveLabel, faction: "Daedalus" };
    }
    ns.write(RESERVE_FILE, JSON.stringify(buildReserveRecord(reserveAmount, reserveTarget, Date.now())), "w");

    if (target?.aug !== previousTargetAug && !boughtThisPass) {
      // A target change caused by this pass's own buy is already announced
      // by the BUY line above -- this branch is for target changes the
      // *next* pass observes (prereq unlocked, camp status changed, etc.).
      if (previousTargetAug !== null || target) {
        tprintTs(ns, target ? `TARGET: ${target.aug} (${target.faction})${target.wantedFor ? ` [prereq for ${target.wantedFor}]` : ""}` : "TARGET: none");
      }
    }
    if (plan.phase === "idle-plateau" && previousPhase !== "idle-plateau") {
      tprintTs(ns, `PLATEAU: nothing reachable/affordable this cycle -- ${boughtThisCycle.length} aug(s) bought, waiting for install`);
    }
    if (plan.phase === "yielded" && previousPhase !== "yielded") {
      tprintTs(ns, "INFO: yielding the action slot to manual work");
    }
    if (previousPhase === "yielded" && plan.phase !== "yielded") {
      tprintTs(ns, "INFO: resuming -- action slot free");
    }
    previousPhase = plan.phase;
    previousTargetAug = target?.aug ?? null;

    const stateChanged = !launchedSummary;
    const heartbeatDue = nowMs - lastStateWrite >= 5 * 60_000;
    if (stateChanged || heartbeatDue || boughtThisPass || plan.phase !== previousPhase) {
      const stateRecord = {
        timestamp: nowMs,
        time: timeLabel,
        phase: plan.phase,
        mode,
        target: target ? { aug: target.aug, faction: target.faction, repReq: target.repReq, deficit: target.deficit, livePrice } : null,
        joinedFactions: [...joined].filter((f) => FACTION_SCOPE_SET.has(f)),
        campLocksInForce: FACTION_SCOPE.filter((f) => !joined.has(f) && campBlocked(f, Object.fromEntries(FACTION_SCOPE.map((ff) => [ff, catalog.factions[ff]?.enemies ?? []])), joined)),
        campChoice,
        // Replaces the bare `workFaction` string (2026-07-16): the head
        // `target` above answers "what do we buy next", which is NOT what the
        // work slot is grinding -- the head is routinely rep-met (NFG, deficit
        // 0) while the real grind is elsewhere. Publishing the aug + deficit
        // lets the dashboard say so instead of leaving the reader to infer
        // "grinding for <head>", which is how a dead trigger stayed invisible
        // for a day. deficit 0 means pickWorkFaction fell back to the head and
        // there is no real grind, even though the slot still works that faction.
        workTarget: workTarget ? { aug: workTarget.aug, faction: workTarget.faction, deficit: workTarget.deficit } : null,
        favor,
        boughtThisCycle,
        nfg: { level: ownedTrueRaw.filter((a) => a === NFG_NAME).length, cappedThisCycle: nfgBoughtThisCycle },
        daedalusGate: { installed: ownedInstalled.length, queued: ownedTrueRaw.length - ownedInstalled.length, target: DAEDALUS_AUG_GATE },
        trigger: triggerState,
        endgameHold,
        lastAugReset,
        nfgBoughtThisCycle,
        // Phase 26 B2: report-only progress watch, restored on a B1 relaunch
        // via lastAugReset matching (see the startup restore block).
        stall: { stalled: stallState.stalled, ageMs: stallState.ageMs, thresholdMs: stallState.thresholdMs, lastWarnMs: stallState.lastWarnMs },
      };
      ns.write(STATE_FILE, JSON.stringify(stateRecord, null, 2), "w");
      lastStateWrite = nowMs;
    }

    if (!launchedSummary) {
      tprintTs(ns, `LAUNCH: augfarmer running -- ${joined.size} faction(s) joined, mode ${mode}, ${target ? `targeting ${target.aug} (${target.faction})` : "no target yet"}`);
      launchedSummary = true;
    }

    ns.clearLog();
    ns.print(`===== aug farmer @ ${timeLabel} =====`);
    ns.print(`phase: ${plan.phase}${paused ? " (PAUSED)" : ""} | mode: ${mode}`);
    if (target) {
      ns.print(`target: ${target.aug} via ${target.faction} -- rep ${target.repReq} (deficit ${Math.round(target.deficit)}) | price $${livePrice !== null ? ns.format.number(livePrice) : "?"}`);
    } else {
      ns.print("target: none (plateau)");
    }
    ns.print(`bought this cycle: ${boughtThisCycle.length} | joined: ${joined.size}/${FACTION_SCOPE.length}`);
    ns.print(`trigger: armed=${triggerState.armed} fired=${triggerState.fired} gain=${triggerState.totalGain.toFixed(3)}`);

    await ns.sleep(POLL_MS);
  }
}
