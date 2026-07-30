/**
 * bladeburnerprobe.js - read-only Bladeburner availability + BitNode-multiplier probe.
 *
 * Answers two things a BN6 plan cannot be written without:
 *  1. WHICH ns.bladeburner.* calls actually work right now. The API doc says access needs
 *     "employed in the Bladeburner division AND BN6/7 or SF6/7" - two gates, and we are
 *     in BN6 but NOT employed (joining needs all combat stats >= 100, we are at 1).
 *     Per CLAUDE.md's corollary, documented RAM cost tells you nothing about
 *     preconditions, so this verifies empirically instead of trusting the doc.
 *  2. BN6's REAL multiplier table via ns.getBitNodeMultipliers() - now permanently
 *     callable since SF5 level 1 landed with the BN5.1 clear. Every per-node table in
 *     docs/bitnodes.md is a hand-read transcription off the BitVerse panel on a FORK;
 *     this is the first chance to check one against the engine.
 *
 * Read-only: no startAction, no joinBladeburnerDivision, no upgradeSkill, nothing that
 * mutates game state.
 *
 * RAM: 16.40 GB (fits a 32 GB fresh-node home). Two footguns hit while writing this,
 * both worth keeping:
 *  - Bracket-notation dynamic dispatch (ns.bladeburner[name]()) defeats the static RAM
 *    analyzer, so the engine kills the script at runtime with an UNCATCHABLE RAM error
 *    rather than a catchable throw. The first version swept 14 getters that way and died
 *    silently with no log and no error modal. All calls here are static dot-notation.
 *  - A local helper named `probe` was billed 0.20 GB for ns.dnet.probe on the NAME alone
 *    (CLAUDE.md's identifier-shadowing rule, confirmed live in `mem` output). Renamed to
 *    `tryCall`.
 *
 * Writes bladeburnerprobe-<epoch>.json (synced to logs/ by the vite.config.ts filter).
 */

export async function main(ns) {
  const out = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    note: "read-only probe: bladeburner API reachability + live BitNode mults",
  };
  // Breadcrumb: if the run dies partway, the last stage reached is still on disk.
  out.stage = "start";
  const emit = (label) => {
    out.stage = label;
    try {
      ns.write("bladeburnerprobe-" + out.ts + ".json", safeJson(out), "w");
    } catch (e) {
      ns.tprint("bladeburnerprobe: WRITE FAILED at " + label + ": " + String(e));
    }
  };
  emit("opened");

  // --- 1. player state: the combat-stat gate on joinBladeburnerDivision() ---
  try {
    const p = ns.getPlayer();
    const sk = p.skills;
    out.player = {
      strength: sk.strength,
      defense: sk.defense,
      dexterity: sk.dexterity,
      agility: sk.agility,
      hacking: sk.hacking,
      charisma: sk.charisma,
      money: ns.getServerMoneyAvailable("home"),
      city: p.city,
    };
    // joinBladeburnerDivision requires ALL FOUR combat stats >= 100.
    const combat = [sk.strength, sk.defense, sk.dexterity, sk.agility];
    out.joinGate = {
      requirement: "all combat stats >= 100",
      lowest: Math.min(...combat),
      allMet: combat.every((v) => v >= 100),
      deficitEach: combat.map((v) => Math.max(0, 100 - v)),
    };
  } catch (err) {
    out.playerError = String(err);
  }
  emit("player");

  // --- 2. reset / bitnode context ---
  try {
    const info = ns.getResetInfo();
    out.resetInfo = {
      currentNode: info.currentNode,
      lastAugReset: info.lastAugReset,
      lastNodeReset: info.lastNodeReset,
      ownedSF: info.ownedSF ? Object.fromEntries(info.ownedSF) : undefined,
      bitNodeOptions: info.bitNodeOptions,
    };
  } catch (err) {
    out.resetInfoError = String(err);
  }
  emit("resetInfo");

  // --- 3. the reachability map: which getters work, which throw, and how ---
  // Every call is STATIC dot-notation on purpose. Bracket-notation dynamic dispatch
  // defeats the static RAM analyzer, so the engine kills the script at runtime with an
  // uncatchable RAM error instead of throwing a catchable exception (learned the hard
  // way on this very probe's first run -- it died silently mid-sweep). Static calls
  // get their RAM allocated up front, so a precondition failure is a normal throw.
  const reach = {};
  const tryCall = (label, fn) => {
    try {
      reach[label] = { ok: true, value: summarize(fn()) };
    } catch (err) {
      reach[label] = { ok: false, threw: String(err).slice(0, 400) };
    }
  };

  // 0 GB tier -- the interesting one. Gangs taught us 0 GB does NOT imply "no
  // precondition" (getTaskNames/getEquipmentNames were 0 GB and threw pre-createGang).
  tryCall("inBladeburner", () => ns.bladeburner.inBladeburner());
  tryCall("getContractNames", () => ns.bladeburner.getContractNames());
  tryCall("getOperationNames", () => ns.bladeburner.getOperationNames());
  tryCall("getBlackOpNames", () => ns.bladeburner.getBlackOpNames());
  tryCall("getGeneralActionNames", () => ns.bladeburner.getGeneralActionNames());
  tryCall("getSkillNames", () => ns.bladeburner.getSkillNames());
  tryCall("getBonusTime", () => ns.bladeburner.getBonusTime());
  // Paid tier -- confirms whether the gate is uniform or per-method.
  tryCall("getCurrentAction", () => ns.bladeburner.getCurrentAction());
  tryCall("getNextBlackOp", () => ns.bladeburner.getNextBlackOp());
  tryCall("getRank", () => ns.bladeburner.getRank());

  // If the black-op list came back, read each op's rank requirement -- that IS the
  // BN6 win condition ladder (final black op destroys the node).
  if (reach.getBlackOpNames && reach.getBlackOpNames.ok && Array.isArray(reach.getBlackOpNames.value)) {
    const ranks = {};
    for (const opName of reach.getBlackOpNames.value) {
      try {
        ranks[opName] = ns.bladeburner.getBlackOpRank(opName);
      } catch (err) {
        ranks[opName] = "threw: " + String(err).slice(0, 120);
        break;
      }
    }
    out.blackOpRanks = ranks;
  }

  out.reachability = reach;
  out.reachabilitySummary = {
    worked: Object.keys(reach).filter((k) => reach[k].ok),
    threw: Object.keys(reach).filter((k) => !reach[k].ok),
  };
  emit("reachability");

  // --- 4. live BN6 multipliers (SF5 level 1 makes this permanent, any node) ---
  // Flattened through a plain-object copy: the raw return may not be JSON-safe.
  try {
    out.bitNodeMultipliers = plain(ns.getBitNodeMultipliers());
  } catch (err) {
    out.bitNodeMultipliersError = String(err);
  }
  emit("bnMults");
  // Cross-node read: prove the n/lvl args work, and capture BN7 for the next step.
  try {
    out.bn7Multipliers = plain(ns.getBitNodeMultipliers(7, 1));
  } catch (err) {
    out.bn7MultipliersError = String(err);
  }
  emit("bn7Mults");

  // --- 4b. the Bladeburners FACTION invite requirement (SF4.3, authoritative) ---
  // The in-game Bladeburner doc says the faction invites agents who "put in the work to
  // gain a small amount of rank" but never states the number. This reads it exactly.
  try {
    out.bladeburnerFactionReqs = ns.singularity.getFactionInviteRequirements("Bladeburners");
  } catch (err) {
    out.bladeburnerFactionReqsError = String(err);
  }
  emit("factionReqs");

  // --- 4c. Intelligence: SF5 made it visible; it persists across nodes ---
  try {
    const pl = ns.getPlayer();
    out.intelligence = pl.skills.intelligence;
    out.intelligenceExp = pl.exp ? pl.exp.intelligence : undefined;
  } catch (err) {
    out.intelligenceError = String(err);
  }

  // --- 5. is the bladeburner formulas module reachable without API access? ---
  try {
    const bf = ns.formulas.bladeburner;
    out.formulasBladeburner = {
      present: !!bf,
      methods: bf ? Object.keys(bf) : [],
    };
  } catch (err) {
    out.formulasBladeburnerError = String(err);
  }

  out.stage = "complete";
  const file = "bladeburnerprobe-" + out.ts + ".json";
  ns.write(file, safeJson(out), "w");

  const s = out.reachabilitySummary || { worked: [], threw: [] };
  ns.tprint("bladeburnerprobe: worked=" + s.worked.length + " threw=" + s.threw.length);
  ns.tprint("  worked: " + s.worked.join(", "));
  ns.tprint("  combat gate: lowest=" + (out.joinGate ? out.joinGate.lowest : "?") +
    " need 100  allMet=" + (out.joinGate ? out.joinGate.allMet : "?"));
  ns.tprint("  bitnode mults: " + (out.bitNodeMultipliers ? "READ OK" : "FAILED " + out.bitNodeMultipliersError));
  ns.tprint("  -> " + file);
}

// Keep the JSON readable: arrays/objects can be large, values can be functions.
function summarize(v) {
  if (v === null || v === undefined) return v === null ? null : "undefined";
  if (typeof v === "function") return "[function]";
  if (Array.isArray(v)) return v;
  if (typeof v === "object") return plain(v);
  return v;
}

// Copy own enumerable scalar-ish keys into a bare object. Guards against the
// engine handing back a class instance / getter-backed object that JSON.stringify
// chokes on or silently serializes as {}.
function plain(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  const o = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const t = typeof v;
    if (t === "function") continue;
    if (t === "bigint") { o[k] = String(v); continue; }
    o[k] = (v !== null && t === "object") ? plain(v) : v;
  }
  return o;
}

// JSON.stringify that can never be the thing that kills the run.
function safeJson(obj) {
  try {
    return JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? String(v) : v), 2);
  } catch (e) {
    return JSON.stringify({ stringifyError: String(e), stage: obj && obj.stage }, null, 2);
  }
}
