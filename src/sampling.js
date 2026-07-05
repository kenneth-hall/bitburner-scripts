// Formulas-or-legacy sampling seam (Phase 4). This is the one module that
// decides "formulas or legacy?" per calculation -- daemon.js and targets.js
// call these functions and never branch on mode themselves.

import { WORKER_SCRIPTS, SHARE_SCRIPT, HACK_FRACTION, GROW_BUFFER, WEAKEN_BUFFER, DRIFT_SEC_EPSILON, DRIFT_MONEY_FRACTION } from "./scheduler.js";

// Forced-legacy override: while this 0.1 GB marker file exists on home,
// hasFormulas reports false even with Formulas.exe owned. Deleting it flips
// to formulas through the exact seam a real purchase would hit, so it
// doubles as the runnable stand-in for both the >=15-minute legacy session
// and the mid-run upgrade test (nothing else is left to buy once owned).
const LEGACY_MODE_MARKER = "legacy-mode.txt";

/** Re-checked every call -- buying Formulas.exe or toggling the marker takes effect with no restart. */
export function hasFormulas(ns) {
  if (ns.fileExists(LEGACY_MODE_MARKER, "home")) return false;
  return ns.fileExists("Formulas.exe", "home");
}

/** For the status block only, so a forced session's log can't be mistaken for a real fallback. */
export function isForcedLegacy(ns) {
  return ns.fileExists(LEGACY_MODE_MARKER, "home");
}

/**
 * Shared prepped-state hack+grow thread math for the formulas branch --
 * hack `hackFraction` of max money, then grow back to max. Used by both
 * sampleBatchFields (real batch sizing) and steadyStatePlan (ranking
 * estimate) so the two don't drift out of sync; each caller applies its own
 * buffering (or none, for ranking) on top of the raw counts returned here.
 * Returns null when the target is unhackable at the prepped state.
 */
function formulasHackGrowPlan(ns, target, hackFraction, player) {
  // Real server copy with security/money overridden to the prepped state
  // (exact field names per bitburner.server.md) -- carries the growth/level
  // fields correctly, unlike ns.formulas.mockServer().
  const preppedServer = {
    ...ns.getServer(target.server),
    hackDifficulty: target.minSecurityLevel,
    moneyAvailable: target.maxMoney,
  };

  const hackPercent = ns.formulas.hacking.hackPercent(preppedServer, player);
  if (hackPercent <= 0) return null; // unhackable this tick -- mirrors the legacy guard
  const hackThreads = Math.max(1, Math.ceil(hackFraction / hackPercent));
  // No host arg (review finding): passing one caps the result by the
  // server's CURRENT state, turning thread-math into state-math -- exactly
  // the distortion prepped-state sizing exists to remove.
  const hackSecurityAdded = ns.hackAnalyzeSecurity(hackThreads);

  // Grow lands after weaken1 (H -> W1 -> G -> W2), so security is already
  // back at min (preppedServer already reflects that); money is what the
  // CEIL'D hack threads actually leave behind, since the overshoot steals
  // slightly more than the raw fraction. Clamped (review finding): a large
  // per-thread steal can otherwise push this to ~$0, and the doc is silent
  // on zero starting money.
  const postHackMoney = Math.max(1, target.maxMoney * (1 - hackThreads * hackPercent));
  const growLandingState = { ...preppedServer, moneyAvailable: postHackMoney };
  const rawGrowThreads = ns.formulas.hacking.growThreads(growLandingState, player, target.maxMoney);
  // Two accuracy caveats, no behavior change: (i) exact for 1 core only --
  // host-core effects (e.g. upgraded home cores) aren't modeled, and
  // over-sizing grow/weaken from here is the safe direction; (ii) isPrepped
  // admits launches down to DRIFT_MONEY_FRACTION money, where max-money
  // sizing undersizes grow slightly -- a caller-applied buffer covers that
  // band too.
  return { preppedServer, hackThreads, hackSecurityAdded, rawGrowThreads };
}

/**
 * Samples fresh per-batch thread counts and durations for a prepped target.
 * GROW_BUFFER is applied to the grow thread count BEFORE growthAnalyzeSecurity
 * is called on it -- growth is exponential in threads, so buffering the
 * security-added value computed from the raw count would undersize weaken2.
 *
 * Thread counts and cost basis (formulas branch) are evaluated at the
 * *prepped* state -- min security, max money -- since batches only launch
 * against prepped targets, so the plan matches launch reality. Durations for
 * real job timing stay current-state on BOTH branches: a job's actual
 * duration is fixed by server state at exec time, and isPrepped tolerates
 * launches up to min+DRIFT_SEC_EPSILON security -- planning at exactly-min
 * while launching at min+eps would shift each landing by eps-factor times
 * its own duration (weaken's shift is 4x hack's).
 */
export function sampleBatchFields(ns, target, hackFraction, useFormulas = false) {
  let hackThreads, hackSecurityAdded, growThreads, growSecurityAdded, steadyWeakenTime;

  if (useFormulas) {
    const player = ns.getPlayer();
    const plan = formulasHackGrowPlan(ns, target, hackFraction, player);
    if (plan === null) return null;
    hackThreads = plan.hackThreads;
    hackSecurityAdded = plan.hackSecurityAdded;
    // GROW_BUFFER applied here (not inside the shared helper): this is the
    // one caller-specific buffering the accuracy caveats above call for.
    growThreads = Math.max(1, Math.ceil(plan.rawGrowThreads * GROW_BUFFER));
    growSecurityAdded = ns.growthAnalyzeSecurity(growThreads, target.server);

    // Cost-basis-only duration (see steadyWeakenTime below): exact at the
    // prepped state the pipeline will actually run at post-re-prep.
    steadyWeakenTime = ns.formulas.hacking.weakenTime(plan.preppedServer, player);
  } else {
    // Money-independent sizing: hackAnalyzeThreads(server, maxMoney * fraction)
    // returns -1 whenever the server currently holds less than that absolute
    // amount, which the old max(1, ceil(...)) guard silently collapsed to a
    // single thread -- a drained target would get a near-zero batch and, later,
    // a wildly under-reserved pipeline. Sizing off ns.hackAnalyze (money stolen
    // per thread, current-state) instead is strictly more correct too: hacking
    // fraction f of CURRENT money is exactly what the 1/(1-f) grow multiplier
    // below is built to restore.
    const hackPerThread = ns.hackAnalyze(target.server);
    if (hackPerThread <= 0) return null; // unhackable this tick -- shouldn't happen for an eligible target; avoids dividing into Infinity threads
    hackThreads = Math.max(1, Math.ceil(hackFraction / hackPerThread));
    hackSecurityAdded = ns.hackAnalyzeSecurity(hackThreads, target.server);

    const growMultiplier = 1 / (1 - hackFraction);
    const rawGrowThreads = ns.growthAnalyze(target.server, growMultiplier);
    growThreads = Math.max(1, Math.ceil(rawGrowThreads * GROW_BUFFER));
    growSecurityAdded = ns.growthAnalyzeSecurity(growThreads, target.server);

    steadyWeakenTime = ns.getWeakenTime(target.server); // cost-basis copy -- legacy behavior unchanged
  }

  const weakenPerThread = ns.weakenAnalyze(1);
  const weaken1Threads = Math.max(1, Math.ceil((hackSecurityAdded * WEAKEN_BUFFER) / weakenPerThread));
  const weaken2Threads = Math.max(1, Math.ceil((growSecurityAdded * WEAKEN_BUFFER) / weakenPerThread));

  return {
    server: target.server,
    hackThreads,
    growThreads,
    weaken1Threads,
    weaken2Threads,
    hackTime: ns.getHackTime(target.server),
    growTime: ns.getGrowTime(target.server),
    weakenTime: ns.getWeakenTime(target.server),
    steadyWeakenTime,
  };
}

/** Sums threads of a given script already running against a target, across all known hosts. */
export function countInFlightThreads(ns, hosts, server, script) {
  let threads = 0;
  for (const host of hosts) {
    for (const proc of ns.ps(host.hostname)) {
      if (proc.filename === script && String(proc.args[0]) === server) threads += proc.threads;
    }
  }
  return threads;
}

/**
 * One-pass in-flight sweep across every worker process on every known host,
 * bucketed by target (proc.args[0]). Replaces daemon.js's per-target
 * sumInFlightRam/countBatchesInFlight (each scanned ns.ps once PER TARGET --
 * with N active members that was N full sweeps every tick). Called at most
 * twice per tick (pre-launch, and post-launch for the reserve's re-measure)
 * regardless of member count -- this is load-bearing (see Phase 8's daemon
 * comment), so share info is folded into this same pass rather than adding a
 * third sweep.
 *
 * `ramCosts` (keyed by filename: hack.js/grow.js/weaken.js/share.js) doubles
 * as the worker-script membership filter -- checking `ramCosts[proc.filename]
 * !== undefined` naturally restricts the sum to those scripts without a
 * separate WORKER_SCRIPTS/SHARE_SCRIPT membership check.
 *
 * Share processes (filename === SHARE_SCRIPT) have no target argument --
 * proc.args[0] is share.js's ignored launch counter, not a server name -- so
 * they're accumulated into the separate `sharePool` bucket and never touch
 * `byTarget`.
 *
 * A server with zero matching processes anywhere is simply absent from
 * `byTarget` -- callers must default-fill (`result.byTarget[server] ??
 * {batches: 0, ramGb: 0}`) rather than assume every known server has a key.
 * `sharePool` is always present, defaulting to `{threads: 0, ramGb: 0}`.
 * (Named `sharePool`, not `share` -- Phase 9: `share` collides with
 * `ns.share`'s exact name and gets charged its 2.4 GB RAM cost even though
 * nothing here calls it; see docs/phases/phase-09-batcher-refactor.md.)
 * @param {NS} ns
 * @param {{hostname: string}[]} hosts
 * @param {Record<string, number>} ramCosts
 * @returns {{byTarget: Record<string, {batches: number, ramGb: number}>, sharePool: {threads: number, ramGb: number}}}
 */
export function inFlightByTarget(ns, hosts, ramCosts) {
  const byTarget = {};
  const sharePool = { threads: 0, ramGb: 0 };
  for (const host of hosts) {
    for (const proc of ns.ps(host.hostname)) {
      const ramPerThread = ramCosts[proc.filename];
      if (ramPerThread === undefined) continue;
      if (proc.filename === SHARE_SCRIPT) {
        sharePool.threads += proc.threads;
        sharePool.ramGb += ramPerThread * proc.threads;
        continue;
      }
      const server = String(proc.args[0]);
      if (!byTarget[server]) byTarget[server] = { batches: 0, ramGb: 0 };
      byTarget[server].ramGb += ramPerThread * proc.threads;
      // Each batch has exactly one hack.js job against its target -- the
      // same proxy countBatchesInFlight used.
      if (proc.filename === WORKER_SCRIPTS.hack) byTarget[server].batches += 1;
    }
  }
  return { byTarget, sharePool };
}

/**
 * Samples live prep thread counts for a target that isn't prepped. Reuses
 * the CYCLE_MS-cached growTime/weakenTime from targets.js -- prep needs no
 * sub-second timing precision, unlike the batch path.
 *
 * Discounts whatever's already in flight against this target before sizing
 * this tick's request -- without this, a target that's still far from
 * prepped gets a fresh full-size weaken/grow request every tick on top of
 * whatever previous ticks already launched (which can take minutes to land),
 * quickly pinning RAM with redundant, stacked copies of the same job.
 * ns.ps can't tell a weaken.js process launched for the security-gap purpose
 * apart from one launched to counter a grow's security increase (same script,
 * same args), so in-flight weaken threads are credited to the gap first
 * (the more concrete, already-measured need), with any leftover credited to
 * the grow's counter-weaken. This discounting logic is orthogonal to the
 * math and stays identical on both branches -- only the raw grow-thread
 * estimate below is mode-dependent.
 */
export function samplePrepFields(ns, hosts, target, useFormulas = false) {
  const server = target.server;
  const currentSecurity = ns.getServerSecurityLevel(server);
  const currentMoney = ns.getServerMoneyAvailable(server);
  const weakenPerThread = ns.weakenAnalyze(1);

  const inFlightWeaken = countInFlightThreads(ns, hosts, server, WORKER_SCRIPTS.weaken);
  const inFlightGrow = countInFlightThreads(ns, hosts, server, WORKER_SCRIPTS.grow);

  const securityGap = Math.max(0, currentSecurity - target.minSecurityLevel);
  const rawWeakenThreadsForGap = securityGap > DRIFT_SEC_EPSILON ? Math.max(1, Math.ceil(securityGap / weakenPerThread)) : 0;
  const weakenThreadsForGap = Math.max(0, rawWeakenThreadsForGap - inFlightWeaken);

  const needsGrow = currentMoney < target.maxMoney * DRIFT_MONEY_FRACTION;
  let growThreads = 0;
  let weakenThreadsForGrow = 0;
  if (needsGrow) {
    // Floor stays on both branches (resolved): the doc's linear-and-exponential
    // remark implies grow()'s additive $1/thread term is modeled, but it's
    // silent on zero starting money specifically, and the floor costs nothing.
    const safeCurrentMoney = Math.max(currentMoney, 1);
    let rawGrowThreads;
    if (useFormulas) {
      const player = ns.getPlayer();
      // Exact inverse from actual current money, not a current/max multiplier
      // estimate -- the floor above is applied to the copied server object's
      // moneyAvailable (resolved: same defensive style as the legacy floor).
      const currentServerState = { ...ns.getServer(server), moneyAvailable: safeCurrentMoney };
      rawGrowThreads = ns.formulas.hacking.growThreads(currentServerState, player, target.maxMoney);
    } else {
      // growthAnalyze ignores the $1/thread additive bonus grow() gets at very
      // low money (per docs), and a bare maxMoney/currentMoney blows up to
      // Infinity once a server's been emptied -- the floor above keeps the
      // multiplier finite; the additive bonus covers the rest in practice.
      const growMultiplier = target.maxMoney / safeCurrentMoney;
      rawGrowThreads = Math.max(1, Math.ceil(ns.growthAnalyze(server, growMultiplier)));
    }
    growThreads = Math.max(0, rawGrowThreads - inFlightGrow);

    if (growThreads > 0) {
      // Sized off the DISCOUNTED grow count -- this only needs to counter the
      // security this tick's new grow threads will add, not the in-flight
      // ones (those already got their own counter-weaken when they launched).
      const growSecurityAdded = ns.growthAnalyzeSecurity(growThreads, server);
      const leftoverInFlightWeaken = Math.max(0, inFlightWeaken - rawWeakenThreadsForGap);
      weakenThreadsForGrow = Math.max(0, Math.ceil(growSecurityAdded / weakenPerThread) - leftoverInFlightWeaken);
    }
  }

  return {
    server,
    growThreads,
    weakenThreadsForGap,
    weakenThreadsForGrow,
    growTime: target.growTime,
    weakenTime: target.weakenTime,
    currentSecurity,
    currentMoney,
  };
}

/**
 * Steady-state thread plan + score inputs for ranking (spec: "Structure"
 * section) -- hack HACK_FRACTION, grow back to max, weaken enough to hold
 * min security. This is a single unbuffered, combined-weaken estimate
 * purely for cross-target score comparison, not a real dispatch plan (that's
 * sampleBatchFields) -- GROW_BUFFER/WEAKEN_BUFFER don't apply here, matching
 * the legacy behavior this replaces.
 *
 * Formulas branch scores every target at its prepped state (min security,
 * max money), so a target's score stops moving as prep progresses or drift
 * happens -- hysteresis then only sees real changes (level-ups, unlocks).
 * The legacy branch scores at current state, which is pessimistic (a
 * draining/drifted target scores low) until the waterfall preps it back up.
 * Returns null when the target is unhackable this tick (mirrors
 * sampleBatchFields's identical guard).
 * @param {NS} ns
 * @param {{server: string, minSecurityLevel: number, maxMoney: number}} target
 * @param {boolean} [useFormulas]
 */
export function steadyStatePlan(ns, target, useFormulas = false) {
  const weakenPerThread = ns.weakenAnalyze(1);
  let hackThreads, growThreads, securityAdded, weakenTime, hackChance;

  if (useFormulas) {
    const player = ns.getPlayer();
    const plan = formulasHackGrowPlan(ns, target, HACK_FRACTION, player);
    if (plan === null) return null;
    hackThreads = plan.hackThreads;
    // No GROW_BUFFER (unbuffered ranking estimate, legacy parity); formulas
    // growThreads already returns an integer, so no ceil needed either.
    growThreads = Math.max(1, plan.rawGrowThreads);
    const growSecurityAdded = ns.growthAnalyzeSecurity(growThreads, target.server);
    securityAdded = plan.hackSecurityAdded + growSecurityAdded;
    weakenTime = ns.formulas.hacking.weakenTime(plan.preppedServer, player);
    hackChance = ns.formulas.hacking.hackChance(plan.preppedServer, player);
  } else {
    const hackPerThread = ns.hackAnalyze(target.server);
    if (hackPerThread <= 0) return null; // unhackable -- avoids dividing into Infinity threads
    hackThreads = Math.max(1, Math.ceil(HACK_FRACTION / hackPerThread));
    growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target.server, 1 / (1 - HACK_FRACTION))));
    securityAdded = ns.hackAnalyzeSecurity(hackThreads, target.server) + ns.growthAnalyzeSecurity(growThreads, target.server);
    // hackAnalyzeChance and weakenTime are both sampled at *current*
    // security, so a high-security (unprepped/drifted) target scores
    // pessimistically here -- acceptable, since the score self-corrects as
    // prep progresses, but it means a great-but-unweakened target ranks low
    // until the waterfall gets around to prepping it.
    weakenTime = ns.getWeakenTime(target.server);
    hackChance = ns.hackAnalyzeChance(target.server);
  }

  const weakenThreads = Math.max(1, Math.ceil(securityAdded / weakenPerThread));
  return { hackThreads, growThreads, weakenThreads, weakenTime, hackChance };
}

const XCHECK_RELATIVE_TOLERANCE = 0.001; // ~0.1%, per spec

/**
 * Runtime canary (spec: "In-game cross-check"): compares formulas math
 * against legacy at the target's *current* state -- not the prepped state,
 * where the two branches only coincide if the target happens to be exactly
 * at min security / max money. Validates exactly what can silently break on
 * any tick (parameter order, Server/Person field names); the prepped-state
 * mock construction itself is covered by the unit tests' formulas-branch
 * goldens instead, not by this. Returns an array of mismatches (empty when
 * clean), each `{ field, legacy, formulas, soft }`.
 */
export function crossCheckFormulas(ns, target) {
  const player = ns.getPlayer();
  const realServer = ns.getServer(target.server);
  const mismatches = [];

  function checkRelative(field, legacyValue, formulasValue) {
    if (legacyValue === 0) return; // avoid a divide-by-zero false positive; not expected for time/percent/chance
    const relativeDiff = Math.abs(formulasValue - legacyValue) / Math.abs(legacyValue);
    if (relativeDiff > XCHECK_RELATIVE_TOLERANCE) {
      mismatches.push({ field, legacy: legacyValue, formulas: formulasValue, soft: false });
    }
  }

  checkRelative("hackTime", ns.getHackTime(target.server), ns.formulas.hacking.hackTime(realServer, player));
  checkRelative("growTime", ns.getGrowTime(target.server), ns.formulas.hacking.growTime(realServer, player));
  checkRelative("weakenTime", ns.getWeakenTime(target.server), ns.formulas.hacking.weakenTime(realServer, player));
  checkRelative("hackPercent", ns.hackAnalyze(target.server), ns.formulas.hacking.hackPercent(realServer, player));
  checkRelative("hackChance", ns.hackAnalyzeChance(target.server), ns.formulas.hacking.hackChance(realServer, player));

  const currentMoney = ns.getServerMoneyAvailable(target.server);
  if (currentMoney < target.maxMoney * DRIFT_MONEY_FRACTION) {
    // Soft (review finding): legacy growthAnalyze ignores the $1/thread
    // additive bonus grow() gets at very low money, so on a deeply drained
    // target the legitimate divergence can plausibly exceed 2x -- flagged
    // for visibility, not counted as a hard failure, until a real session's
    // data says the 2x bound is quiet in practice. A swapped growThreads
    // parameter order would land far outside 2x either way.
    const safeCurrentMoney = Math.max(currentMoney, 1);
    const legacyGrowThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target.server, target.maxMoney / safeCurrentMoney)));
    const formulasGrowThreads = ns.formulas.hacking.growThreads(
      { ...realServer, moneyAvailable: safeCurrentMoney },
      player,
      target.maxMoney
    );
    const ratio = formulasGrowThreads / legacyGrowThreads;
    if (ratio > 2 || ratio < 0.5) {
      mismatches.push({ field: "growThreads", legacy: legacyGrowThreads, formulas: formulasGrowThreads, soft: true });
    }
  }

  return mismatches;
}
