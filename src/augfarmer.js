// Phase 23 -- auto augmentation farmer: the join + grind + buy half of the
// BN1.2 aug-acquisition loop (Phase 22's backdoorfactions.js is the *unlock*
// half -- roots + backdoors the four hacking-faction servers, never joins).
// Always-on Singularity companion, exec'd by filename via daemon.js's
// launchDetached (never imported -- keeps every other script's RAM bundle
// free of this file's Singularity surface, per CLAUDE.md's hot-path rule).
//
// D11 authorization (docs/reset-protocol.md, phase-23-augfarmer.features.md):
// Kenneth durably authorizes this script to auto-join and auto-buy
// unattended, bounded to FACTION_SCOPE (built in main() below, 13 names --
// see S2), never anything that could bar Daedalus (nothing can -- Daedalus
// has no enemies, confirmed live), and NEVER installAugmentations -- install
// stays 100% Kenneth's (grep -r installAugmentations src/ must find
// nothing; this file doesn't call it).
//
// S8 slot etiquette: takes the single player-action slot only when idle, mid
// university class (studybootstrap.js's CS kick -- taking over IS the
// stop/handoff crossover that script's header explicitly parks as future
// work), or its own earlier faction-work assignment; yields to anything
// else (company work, crime, program creation, out-of-scope faction work).
// join/buy/reserve/travel still fire while yielded -- only "work" is
// slot-gated.
//
// RAM: derived ~53 GB at SF4.3's 1x multiplier (phase-23-augfarmer.spec.md
// S6's call-by-call derivation). Measured: TBD GB (ramcheck.js -- fill in
// post-live). No HOME_RESERVE_GB change -- companions launch before the
// batcher packs home, so this footprint is already inside usedRam. A
// mid-session `restart augfarmer.js` may not fit the 32 GB headroom --
// restart daemon.js instead (pre-authorized, see CLAUDE.md). Post-install
// INFO-skip (home too small right after a reset) is expected; the farmer
// joins the party at the first daemon restart after home RAM grows back.
//
// Task shape (S8's match rule) verified against markdown/bitburner.
// factionworktask.md / bitburner.studytask.md (type "FACTION"/"CLASS" +
// factionName/factionWorkType) -- not yet live-probed in this fork; watch
// item for the close-out per the spec's open questions.

import { tprintTs } from "./common.js";
import { recordTransaction } from "./translog.js";

export const NFG_NAME = "NeuroFlux Governor";
const POLL_MS = 10_000;
export const RESERVE_FILE = "augfarmer-reserve.json";
export const STATE_FILE = "augfarmer-state.json";
export const CATALOG_FILE = "augfarmer-catalog.json";
export const PAUSE_FILE = "augfarmer-pause.txt";
export const TRAVEL_COST = 200_000;
const DAEDALUS_AUG_GATE = 30;

// D2's filter set -- ten keys (charisma counts twice: skill + exp).
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

// D2 seed -- curated by aug *description* (getAugmentationStats reads every
// pure-utility aug as all-1.0, per augcheck.js's documented caveat), not by
// stats. NRMI is here because it removes this farmer's own unfocused-work
// penalty (D12) -- high value specifically because this script exists.
export const UTILITY_ALLOWLIST = ["Neuroreceptor Management Implant", "CashRoot Starter Kit", "The Blade's Simulacrum"];

/**
 * Pure (D2). Keeps a name iff it's on `allowlist`, or any MULT_FILTER_KEYS
 * stat differs from 1 (inclusive-OR -- a mixed hacking+combat aug is kept).
 * The Red Pill (all-1.0, not allow-listed) drops here by construction --
 * S2's stated property, not a special case.
 * @param {Record<string, Record<string, number>>} augStatsByName
 * @param {string[]} allowlist
 * @returns {Set<string>}
 */
export function filterAugs(augStatsByName, allowlist) {
  const allowSet = new Set(allowlist);
  const kept = new Set();
  for (const [name, stats] of Object.entries(augStatsByName)) {
    if (allowSet.has(name)) {
      kept.add(name);
      continue;
    }
    const relevant = MULT_FILTER_KEYS.some((k) => stats[k] !== undefined && stats[k] !== 1);
    if (relevant) kept.add(name);
  }
  return kept;
}

/**
 * Pure (D6). Walks `candidateName`'s prereq chain against `catalog.augs`
 * (each entry `{prereqs, sellers, ...}`), returning the ordered unowned
 * chain deepest-first, ending in candidateName itself (a no-prereq aug
 * yields a one-element chain). Prereqs bypass the D2 filter by design --
 * this never consults passesFilter. Returns null if any link (including
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
  return { joinable, onlyCityGap, gapCity: onlyCityGap ? unmet[0].req.city : undefined };
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
 * Pure (S1/S4/D5/D6). The whole targeting decision for one pass: expands
 * every unowned, filter-passing, reachable-seller aug to its actionable
 * (deepest-unowned) link, dedupes shared prereqs, sorts by S1's deficit key,
 * and returns the head -- or null on plateau (nothing reachable/affordable
 * left this cycle).
 *
 * `catalog` is {augs: {[name]: {repReq, price, prereqs, sellers, passesFilter,
 * isNFG}}, factions: {[faction]: {enemies, inviteReqs, workTypes}}}.
 * `playerFacts` extends evaluateInviteReqs's shape with `invites` (Set) and
 * `factionRep` ({[faction]: number}).
 * @returns {{aug: string, faction: string, repReq: number, deficit: number,
 *   wantedFor: string|undefined, status: string, gapCity: string|undefined,
 *   workTypes: string[]}|null}
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

  const wantedNames = Object.keys(catalog.augs).filter((name) => {
    const info = catalog.augs[name];
    if (!info.passesFilter) return false;
    if (ownedSet.has(name)) return false;
    if (info.isNFG && nfgCapped) return false;
    return true;
  });

  const actionableByName = new Map();
  for (const wanted of wantedNames) {
    const chain = expandPrereqs(wanted, catalog, ownedSet);
    if (chain === null) continue; // no reachable seller somewhere in the chain
    const actionable = chain[0];
    if (actionableByName.has(actionable)) continue; // shared-prereq dedupe

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
    });
  }

  const candidates = [...actionableByName.values()];
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.deficit !== b.deficit) return a.deficit - b.deficit;
    if (a.repReq !== b.repReq) return a.repReq - b.repReq;
    if (a.price !== b.price) return a.price - b.price;
    return a.aug < b.aug ? -1 : a.aug > b.aug ? 1 : 0;
  });

  const top = candidates[0];
  return {
    aug: top.aug,
    faction: top.faction,
    repReq: top.repReq,
    deficit: top.deficit,
    wantedFor: top.wantedFor,
    status: top.status,
    gapCity: top.gapCity,
    workTypes: top.workTypes,
  };
}

/**
 * Pure. The whole per-pass decision, given a pre-picked `target` (pickTarget's
 * output or null) and this pass's live facts. Returns {actions, reserve, phase}.
 * `actions` entries: {type: "travel"|"join"|"work"|"reserve"|"buy"|"idle"|"yield", ...}.
 * `reserve` is the amount the caller should publish to RESERVE_FILE this pass
 * (0 when nothing rep-met is being bought toward).
 */
export function planPass({ target, currentWork, factionScope, money, livePrice, paused }) {
  if (paused) return { actions: [], reserve: 0, phase: "paused" };
  if (!target) return { actions: [{ type: "idle" }], reserve: 0, phase: "idle-plateau" };

  // D11 defense-in-depth: every join/work/travel site routes through the
  // FACTION_SCOPE check, not just the catalog construction that (today)
  // guarantees pickTarget never returns an out-of-scope faction -- a second
  // rail is cheap and makes this invariant directly testable here.
  if (!factionScope.has(target.faction)) return { actions: [], reserve: 0, phase: "awaiting-invite" };

  if (target.status === "city-gap") {
    return { actions: [{ type: "travel", city: target.gapCity, faction: target.faction }], reserve: 0, phase: "awaiting-invite" };
  }
  if (target.status === "awaiting-invite") {
    return { actions: [], reserve: 0, phase: "awaiting-invite" };
  }
  if (target.status === "invite-pending") {
    return { actions: [{ type: "join", faction: target.faction }], reserve: 0, phase: "grinding" };
  }

  // status === "joined"
  const repMet = target.deficit <= 0;
  if (repMet) {
    const actions = [{ type: "reserve", amount: livePrice, aug: target.aug, faction: target.faction }];
    if (money >= livePrice) {
      actions.push({ type: "buy", aug: target.aug, faction: target.faction, price: livePrice });
      return { actions, reserve: livePrice, phase: "grinding" };
    }
    return { actions, reserve: livePrice, phase: "awaiting-money" };
  }

  const slot = slotAvailable(currentWork, factionScope);
  if (!slot.available) return { actions: [{ type: "yield" }], reserve: 0, phase: "yielded" };

  const workType = pickWorkType(target.workTypes);
  const alreadyWorking =
    currentWork?.type === "FACTION" && currentWork.factionName === target.faction && currentWork.factionWorkType === workType;
  const actions = alreadyWorking ? [] : [{ type: "work", faction: target.faction, workType }];
  return { actions, reserve: 0, phase: "grinding" };
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

/** Reads FACTION_SCOPE + augs/factions live and builds the static catalog (S5). */
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

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

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
  if (savedState && savedState.lastAugReset === lastAugReset) {
    nfgBoughtThisCycle = savedState.nfgBoughtThisCycle ?? false;
    boughtThisCycle = savedState.boughtThisCycle ?? [];
  }

  let lastFailureKey = null;
  let previousPhase = null;
  let previousTargetAug = null;
  let launchedSummary = false;
  let lastStateWrite = 0;

  while (true) {
    const nowMs = Date.now();
    const timeLabel = new Date(nowMs).toLocaleTimeString();
    const paused = ns.fileExists(PAUSE_FILE, "home");

    const resetInfo = ns.getResetInfo();
    if (resetInfo.lastAugReset !== lastAugReset) {
      lastAugReset = resetInfo.lastAugReset;
      nfgBoughtThisCycle = false;
      boughtThisCycle = [];
      catalog = null;
      previousJoinedKey = null;
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
    try {
      for (const f of FACTION_SCOPE) {
        if (joined.has(f)) factionRep[f] = ns.singularity.getFactionRep(f);
      }
      singularityProven = true;
    } catch (e) {
      if (!singularityProven) {
        exitSingularityUnavailable(ns, "getFactionRep", e);
        return;
      }
      tprintTs(ns, `WARN: getFactionRep threw (${e?.message ?? e}) -- retrying next poll`);
    }

    const playerFacts = {
      city: player.city,
      money: player.money,
      skills: player.skills,
      karma: player.karma,
      jobs: new Set(Object.keys(player.jobs ?? {})),
      backdoored: new Set(),
      invites,
      factionRep,
    };

    const target = pickTarget(catalog, playerFacts, joined, ownedSet, nfgBoughtThisCycle);

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

    const plan = planPass({ target, currentWork, factionScope: FACTION_SCOPE_SET, money: player.money, livePrice, paused });

    let boughtThisPass = null;
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
        } else if (action.type === "buy") {
          const ok = ns.singularity.purchaseAugmentation(action.faction, action.aug);
          singularityProven = true;
          if (ok) {
            recordTransaction(ns, {
              type: "expense",
              source: "auto-aug",
              aug: action.aug,
              faction: action.faction,
              amount: action.price,
              timestamp: Date.now(),
              time: new Date().toLocaleTimeString(),
            });
            tprintTs(ns, `BUY: ${action.aug} from ${action.faction} for $${ns.format.number(action.price)}`);
            boughtThisPass = { aug: action.aug, price: action.price, faction: action.faction };
            if (action.aug === NFG_NAME) nfgBoughtThisCycle = true;
            boughtThisCycle.push({ aug: action.aug, price: action.price, faction: action.faction, timestamp: Date.now() });
            lastFailureKey = null;
          } else {
            const key = `buy:${action.faction}:${action.aug}`;
            if (key !== lastFailureKey) tprintTs(ns, `WARN: purchaseAugmentation(${action.faction}, ${action.aug}) returned false -- retrying next poll`);
            lastFailureKey = key;
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
    // re-reserved for another poll (cold review's finding 4).
    const reserveAmount = boughtThisPass ? 0 : (plan.reserve ?? 0);
    const reserveTarget = boughtThisPass ? null : target;
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
        target: target ? { aug: target.aug, faction: target.faction, repReq: target.repReq, deficit: target.deficit, livePrice } : null,
        joinedFactions: [...joined].filter((f) => FACTION_SCOPE_SET.has(f)),
        campLocksInForce: FACTION_SCOPE.filter((f) => !joined.has(f) && campBlocked(f, Object.fromEntries(FACTION_SCOPE.map((ff) => [ff, catalog.factions[ff]?.enemies ?? []])), joined)),
        boughtThisCycle,
        nfg: { level: ownedTrueRaw.filter((a) => a === NFG_NAME).length, cappedThisCycle: nfgBoughtThisCycle },
        daedalusGate: { installed: ownedInstalled.length, queued: ownedTrueRaw.length - ownedInstalled.length, target: DAEDALUS_AUG_GATE },
        lastAugReset,
        nfgBoughtThisCycle,
      };
      ns.write(STATE_FILE, JSON.stringify(stateRecord, null, 2), "w");
      lastStateWrite = nowMs;
    }

    if (!launchedSummary) {
      tprintTs(ns, `LAUNCH: augfarmer running -- ${joined.size} faction(s) joined, ${target ? `targeting ${target.aug} (${target.faction})` : "no target yet"}`);
      launchedSummary = true;
    }

    ns.clearLog();
    ns.print(`===== aug farmer @ ${timeLabel} =====`);
    ns.print(`phase: ${plan.phase}${paused ? " (PAUSED)" : ""}`);
    if (target) {
      ns.print(`target: ${target.aug} via ${target.faction} -- rep ${target.repReq} (deficit ${Math.round(target.deficit)}) | price $${livePrice !== null ? ns.format.number(livePrice) : "?"}`);
    } else {
      ns.print("target: none (plateau)");
    }
    ns.print(`bought this cycle: ${boughtThisCycle.length} | joined: ${joined.size}/${FACTION_SCOPE.length}`);

    await ns.sleep(POLL_MS);
  }
}
