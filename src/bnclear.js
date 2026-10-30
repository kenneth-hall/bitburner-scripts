/**
 * bnclear.js - run runbook step 7 unattended: spend SP, run the black-op ladder,
 * finish Daedalus, then destroy the node into <nextBN>.
 *
 * IRREVERSIBLE at the end (destroybn.js). Requires an explicit node number AND the
 * literal `confirm`; with `dry` it does everything except the destroy and stops.
 *
 * Usage:
 *   run bnclear.js 13 confirm   -> full clear, destroy into BN13
 *   run bnclear.js 13 dry       -> ladder only, stop before the destroy
 *
 * Order of operations, and why:
 *  1. Writes aug-buy-off.txt on home FIRST. augfarmer.js honours it and the file
 *     survives the node change, so nothing can buy an aug in the next node before
 *     Stanek's Gift is accepted (BN13). Remove it by hand after acceptGift().
 *  2. Kills daemon.js first (it supervises and relaunches the residents), then every
 *     other home script except bladeburnermanager.js (grinds rank between rounds,
 *     the rank-floor buffer) and itself. bbblackop.js needs 27.8 GB on home.
 *  3. Rounds of: bbskillbuy.js 400 -> bbblackop.js 20. bbblackop guards the rank
 *     floor itself; if it stops early (floor, HP, attempt cap) we wait for the
 *     manager to grind and retry, bounded by MAX_ROUNDS.
 *  4. When the next op is Daedalus: bbskillbuy.js 400 -> bbblackop.js 1 daedalus,
 *     same bounded retry.
 *  5. getNextBlackOp() === null -> kill the manager + augfarmer (destroybn needs
 *     40.6 GB) -> exec destroybn.js <nextBN> confirm.
 *
 * Every step's result is judged by re-reading getNextBlackOp(), never by exit or
 * return values. Log: bnclear-<epoch>.json (vite.config.ts filter).
 *
 * ASCII-only (new-file wget seeding, docs/dev-server.md).
 */

const FINAL_OP = "Operation Daedalus";
const AUG_BUY_OFF_FILE = "aug-buy-off.txt"; // must match augfarmer.js
const KEEP = ["bladeburnermanager.js"];
const MAX_ROUNDS = 12;
const RETRY_WAIT_MS = 30 * 60_000;
const POLL_MS = 10_000;

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const nextBN = ns.args.map(Number).find((n) => Number.isInteger(n) && n >= 1 && n <= 15);
  const confirmed = ns.args.includes("confirm");
  const dry = ns.args.includes("dry");
  const started = Date.now();
  const logFile = `bnclear-${started}.json`;
  const events = [];
  const note = (msg, extra = {}) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    ns.tprint("bnclear: " + line);
    events.push({ t: Date.now(), msg, ...extra });
    ns.write(logFile, JSON.stringify({ started, nextBN, confirmed, dry, events }, null, 2), "w");
  };

  if (!nextBN || (!confirmed && !dry)) {
    ns.tprint("bnclear: usage: run bnclear.js <nextBN> confirm | run bnclear.js <nextBN> dry");
    return;
  }
  if (!ns.bladeburner.inBladeburner()) {
    note("ABORT - not in the Bladeburner division");
    return;
  }

  ns.write(AUG_BUY_OFF_FILE, `written by bnclear.js ${new Date().toISOString()} -- remove after acceptGift()`, "w");
  note(`aug purchases blocked (${AUG_BUY_OFF_FILE})`);

  freeHome(ns, note, KEEP);

  const nextOp = () => ns.bladeburner.getNextBlackOp();
  let rounds = 0;
  while (nextOp() !== null) {
    if (++rounds > MAX_ROUNDS) {
      note(`ABORT - ${MAX_ROUNDS} rounds without finishing the ladder`, { next: nextOp() });
      return;
    }
    const before = nextOp();
    const finalRound = before.name === FINAL_OP;
    await runAndWait(ns, note, "bbskillbuy.js", ["400"]);
    if (finalRound && dry) {
      note("DRY - stopping before Daedalus", { rank: ns.bladeburner.getRank() });
      return;
    }
    await runAndWait(ns, note, "bbblackop.js", finalRound ? ["1", "daedalus"] : ["20"]);
    const after = nextOp();
    note(`round ${rounds}: ${before.name} -> ${after ? after.name : "null (ladder complete)"}`, {
      rank: ns.bladeburner.getRank(),
    });
    if (after !== null && after.name === before.name) {
      note(`no progress this round; waiting ${RETRY_WAIT_MS / 60_000} min for the manager to grind`);
      await ns.sleep(RETRY_WAIT_MS);
    }
  }

  if (dry) {
    note("DRY - ladder complete, not destroying");
    return;
  }
  for (const s of ["bladeburnermanager.js", "augfarmer.js"]) ns.scriptKill(s, "home");
  await ns.sleep(2_000);
  note(`ladder complete; destroying into BN${nextBN}`);
  const pid = ns.exec("destroybn.js", "home", 1, String(nextBN), "confirm");
  if (pid === 0) note("ABORT - could not exec destroybn.js (RAM?)");
}

/** Kill daemon.js first (it relaunches residents), then everything else not kept. */
function freeHome(ns, note, keep) {
  ns.scriptKill("daemon.js", "home");
  const ownPid = ns.pid;
  const killed = [];
  for (const p of ns.ps("home")) {
    if (p.pid === ownPid || keep.includes(p.filename)) continue;
    if (ns.kill(p.pid)) killed.push(p.filename);
  }
  note(`freed home: killed daemon.js + ${killed.length} others`, { killed: [...new Set(killed)] });
}

async function runAndWait(ns, note, script, args) {
  const pid = ns.exec(script, "home", 1, ...args);
  if (pid === 0) {
    note(`could not exec ${script} ${args.join(" ")} (RAM?)`);
    return;
  }
  while (ns.isRunning(pid)) await ns.sleep(POLL_MS);
}
