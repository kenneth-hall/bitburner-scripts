// Phase 2 batch scheduler: pure functions over plain data, no `ns` calls
// anywhere in this file. This is exactly the module Phase 1's allocator.js
// was designed to be swapped for -- daemon.js does all the ns.* sampling
// (hackAnalyzeThreads, growthAnalyze, security/time analysis) and hands this
// module plain numbers; this module only does arithmetic (thread buffering,
// additionalMsec timing offsets, RAM bin-packing).

export const HACK_FRACTION = 0.25;
export const SPACING_MS = 200;
export const BATCH_INTERVAL_MS = 1000; // >= 4 * SPACING_MS so consecutive batches' landings never interleave
export const GROW_BUFFER = 1.25;
export const WEAKEN_BUFFER = 1.1;
export const DRIFT_SEC_EPSILON = 1;
export const DRIFT_MONEY_FRACTION = 0.9;

// Not named in the spec's tunable list; bounds the RAM-shrink retry loop in
// daemon.js so it can't halve the hack fraction forever when nothing fits.
export const MIN_HACK_FRACTION = 0.01;

// How much better a challenger's efficiency score must be, as a multiplier,
// to displace the incumbent batch target. Current-security sampling means a
// target's score can crater the instant it drifts (a level-up breaks
// in-flight batches) -- without this, the daemon would rank-flip away from a
// target mid-re-prep, orphaning the investment stage 1 just made and slamming
// the reservation to full depth against a cold target.
export const RANK_HYSTERESIS = 1.25;

export const WORKER_SCRIPTS = {
  hack: "hack.js",
  grow: "grow.js",
  weaken: "weaken.js",
};

// Phase 8: faction share allocation. Deliberately not folded into
// WORKER_SCRIPTS -- everything that iterates WORKER_SCRIPTS (scp loops,
// ramCosts maps, in-flight target bucketing) means "the three targeted batch
// workers", and share has no target argument.
export const SHARE_FRACTION = 0.25;
export const SHARE_SCRIPT = "share.js";

// Phase 20: the XP engine's own worker set, distinct filenames from
// WORKER_SCRIPTS.hack/weaken so the batcher's inFlightByTarget membership
// filter (keyed by filename) never counts XP workers as batch activity --
// see phase-20-xpfarm.spec.md S1. Kept out of WORKER_SCRIPTS on purpose --
// that name means "the three targeted batch workers" and
// workerRamCosts/inFlightByTarget depend on that meaning.
export const XP_SCRIPTS = { hack: "xphack.js", weaken: "xpweaken.js" };

/**
 * A target counts as prepped once it's within these margins of min
 * security / max money; only prepped targets get hack-containing batches.
 * @param {{currentSecurity: number, minSecurityLevel: number, currentMoney: number, maxMoney: number}} target
 */
export function isPrepped(target) {
  return (
    target.currentSecurity <= target.minSecurityLevel + DRIFT_SEC_EPSILON &&
    target.currentMoney >= target.maxMoney * DRIFT_MONEY_FRACTION
  );
}

/** Halves the hack fraction for the next RAM-fit retry. */
export function shrinkHackFraction(fraction) {
  return fraction / 2;
}

/**
 * How many batches must be in flight at once to keep the pipeline full:
 * steady state wants one launched per BATCH_INTERVAL_MS until the first
 * lands weakenTime later.
 * @param {number} weakenTimeMs
 */
export function pipelineDepth(weakenTimeMs) {
  return Math.ceil(weakenTimeMs / BATCH_INTERVAL_MS);
}

/**
 * Phase 15: affordability-capped admission depth. `pipelineDepth` is a
 * throughput ceiling (how deep a pipeline COULD run); on a fleet too small to
 * ever afford that ceiling for any target, admission gated on the full depth
 * seats nobody, forever (the zero-member stall this phase fixes). A partial
 * pipeline still earns proportionally -- so admission/reservation should use
 * whichever is smaller, clamped to at least 1 (a single batch still prices
 * honestly as unaffordable when even that doesn't fit `budgetGb`; seating it
 * anyway is pickBatchSet's floor rule, not this function's job).
 * Assumes `ramCostGb > 0` (every batch has >= 1 thread per job).
 * @param {number} weakenTimeMs
 * @param {number} ramCostGb per-batch RAM cost
 * @param {number} budgetGb
 */
export function cappedPipelineDepth(weakenTimeMs, ramCostGb, budgetGb) {
  return Math.max(1, Math.min(pipelineDepth(weakenTimeMs), Math.floor(budgetGb / ramCostGb)));
}

/**
 * How much RAM daemon.js's aggregate carve should fence off for one batch
 * member: normally the unfilled remainder of its pipeline (cost minus what's
 * already in flight), so the waterfall can't spend RAM the member is about to
 * need to reach depth.
 *
 * A FLOOR-SEATED member is the exception and reserves nothing beyond what it
 * already holds. pickBatchSet's floor rule seats it precisely BECAUSE its cost
 * exceeds the whole budget, so the remainder is unspendable by construction --
 * no quantity of held RAM lets it reach a depth the budget can't buy. On a
 * small fleet the carve then exceeds the fleet itself, zeroing the waterfall's
 * available RAM and starving prep of every OTHER target -- which is a
 * self-sustaining deadlock, not a slow tick: with no cheap target ever
 * prepped, no affordable candidate ever appears for passes 1-2 to seat, so the
 * floor member keeps its seat forever and the fleet earns nothing.
 *
 * Observed live 2026-07-24, 11h into a BN5 cold start on a 396GB fleet:
 * phantasy floor-seated at 1,684.9GB pipeline vs a 297GB budget, 12,750
 * consecutive skips, waterfallAvailableGb 0, income ~$0.77/sec.
 *
 * Dropping the reserve doesn't cost the floor member its shot: daemon.js
 * launches members (step 5) BEFORE this carve and before the waterfall (step
 * 7), so it still gets first refusal on the whole fleet every tick. In-flight
 * RAM is already deducted from the host pool, which is the only protection an
 * unaffordable pipeline can actually use.
 * @param {number} pipelineCostGb
 * @param {number} inFlightRamGb
 * @param {number} budgetGb the same batch budget pickBatchSet's floor rule compared against
 */
export function memberReserveGb(pipelineCostGb, inFlightRamGb, budgetGb, floorBatchCostGb = 0) {
  if (pipelineCostGb > budgetGb) {
    // Floor-seated: reserve what ONE shrunk batch actually costs, not the full
    // nominal pipeline and not nothing. BOTH extremes deadlock, in opposite
    // directions, and we hit each of them in turn on 2026-07-24:
    //
    //   full pipeline -> the carve exceeded the fleet (1,684.9GB vs 396GB),
    //     zeroed the waterfall, and nothing ever got prepped. 11h at ~$0/s.
    //   nothing -> the waterfall took the whole fleet for long-running prep
    //     jobs, leaving 7.75GB free against a 99.75GB shrunk batch. The member
    //     never launched. (My first fix. "Members launch before the waterfall
    //     each tick" is NOT a defence: prep is grow/weaken, it holds RAM for
    //     MINUTES across many ticks, so first refusal on an already-committed
    //     fleet buys nothing.)
    //
    // floorBatchCostGb comes from the skip diagnosis -- the real cost of the
    // batch the shrink loop last tried to place, so this reserves exactly what
    // the member can demonstrably spend and leaves the rest to prep.
    return Math.max(0, floorBatchCostGb - inFlightRamGb);
  }
  return Math.max(0, pipelineCostGb - inFlightRamGb);
}

/**
 * Builds the four one-shot jobs for one batch: hack +0, weaken1 +1*SPACING_MS,
 * grow +2*SPACING_MS, weaken2 +3*SPACING_MS, each timed via additionalMsec so
 * all four land that many milliseconds apart despite launching together.
 *
 * `target` must already carry final, live-sampled thread counts and
 * durations (daemon.js's sampler has already applied GROW_BUFFER/
 * WEAKEN_BUFFER by this point) -- this function only computes timing offsets.
 * @param {{server: string, hackThreads: number, growThreads: number, weaken1Threads: number, weaken2Threads: number, hackTime: number, growTime: number, weakenTime: number}} target
 */
export function planBatch(target) {
  // Landing offsets are measured from a shared reference completion time so
  // every job finishes at referenceTime + its landing offset, regardless of
  // how long its own action takes. Docs don't explicitly guarantee weaken is
  // always the longest action, so take the max of all three rather than
  // assuming weakenTime is the reference.
  const referenceTime = Math.max(target.hackTime, target.growTime, target.weakenTime);
  const additionalMsecFor = (duration, landingOffset) => Math.round(referenceTime - duration + landingOffset);

  return [
    {
      script: WORKER_SCRIPTS.hack,
      target: target.server,
      threads: target.hackThreads,
      additionalMsec: additionalMsecFor(target.hackTime, 0),
    },
    {
      script: WORKER_SCRIPTS.weaken,
      target: target.server,
      threads: target.weaken1Threads,
      additionalMsec: additionalMsecFor(target.weakenTime, 1 * SPACING_MS),
    },
    {
      script: WORKER_SCRIPTS.grow,
      target: target.server,
      threads: target.growThreads,
      additionalMsec: additionalMsecFor(target.growTime, 2 * SPACING_MS),
    },
    {
      script: WORKER_SCRIPTS.weaken,
      target: target.server,
      threads: target.weaken2Threads,
      additionalMsec: additionalMsecFor(target.weakenTime, 3 * SPACING_MS),
    },
  ];
}

/**
 * Total RAM (GB) a set of jobs occupies, summed as ramCosts[script] * threads
 * per job. Works for planBatch's four-job output just as well as a
 * steady-state plan's three-job (hack/grow/weaken) summary -- both are just
 * {script, threads} arrays.
 * @param {{script: string, threads: number}[]} jobs
 * @param {Record<string, number>} ramCosts
 */
export function batchRamCost(jobs, ramCosts) {
  return jobs.reduce((sum, job) => sum + ramCosts[job.script] * job.threads, 0);
}

/**
 * Deducts reserveGb from a host pool, largest-free-RAM-first, so the biggest
 * contiguous blocks -- the only places a batch's grow job can land -- are
 * what's protected. A host can be reduced to 0 free RAM; carving then moves
 * on to the next-largest until the reserve is satisfied or the pool runs out
 * (in which case the returned pool is entirely zeroed). Returns a new pool;
 * does not mutate the input.
 * @param {{hostname: string, freeRam: number}[]} hosts
 * @param {number} reserveGb
 */
export function carveReservation(hosts, reserveGb) {
  const pool = hosts
    .map((h) => ({ hostname: h.hostname, freeRam: h.freeRam }))
    .sort((a, b) => b.freeRam - a.freeRam);

  let remaining = reserveGb;
  for (const host of pool) {
    if (remaining <= 0) break;
    const taken = Math.min(host.freeRam, remaining);
    host.freeRam -= taken;
    remaining -= taken;
  }

  return pool;
}

/**
 * Assigns each batch job to a single host, as a single process -- never
 * splitting a job's threads across hosts (protects against per-thread
 * splitting caveats and keeps batch timing uniform). Returns null if any job
 * can't fit on any single host, signalling the caller to shrink the batch
 * (smaller hack fraction) and retry rather than split.
 * @param {{script: string, threads: number}[]} jobs
 * @param {{hostname: string, freeRam: number}[]} hosts
 * @param {Record<string, number>} ramCosts
 */
export function assignBatchHosts(jobs, hosts, ramCosts) {
  const pool = hosts.map((h) => ({ hostname: h.hostname, freeRam: h.freeRam }));
  const assigned = [];

  for (const job of jobs) {
    const ramNeeded = ramCosts[job.script] * job.threads;
    const host = pool.find((h) => h.freeRam >= ramNeeded);
    if (!host) return null;
    host.freeRam -= ramNeeded;
    assigned.push({ ...job, hostname: host.hostname });
  }

  return assigned;
}

/**
 * Pure. Explains WHY a batch could not be placed, from the same inputs
 * assignBatchHosts just rejected.
 *
 * assignBatchHosts requires each job whole on ONE host (unlike planPrep, which
 * splits freely), so there are two distinct failure modes that look identical
 * in a skip record and have completely different fixes:
 *
 *   "total-ram"  the batch costs more than the entire free fleet. Only fleet
 *                growth helps. Splitting jobs would change nothing.
 *   "per-host"   the fleet HAS the RAM in aggregate, but no single host can
 *                hold the biggest job. Splitting that job across hosts would
 *                place the batch immediately, at zero cost.
 *
 * Returns null when the batch actually fits (nothing to diagnose). Reported
 * every skip so "the batcher is busy" and "the batcher is wedged" stop looking
 * the same from the outside -- the daemon already computes all of this at the
 * moment of failure and used to discard it.
 * @param {{script: string, threads: number}[]} jobs
 * @param {{hostname: string, freeRam: number}[]} hosts
 * @param {Record<string, number>} ramCosts
 */
export function diagnosePlacement(jobs, hosts, ramCosts) {
  if (jobs.length === 0) return null;
  const jobCosts = jobs.map((job) => ramCosts[job.script] * job.threads);
  const batchCostGb = jobCosts.reduce((sum, c) => sum + c, 0);
  const largestJobGb = Math.max(...jobCosts);
  const freeRams = hosts.map((h) => h.freeRam);
  const totalFreeGb = freeRams.reduce((sum, r) => sum + r, 0);
  const largestHostFreeGb = freeRams.length > 0 ? Math.max(...freeRams) : 0;

  let blockedBy = null;
  if (batchCostGb > totalFreeGb) blockedBy = "total-ram";
  else if (largestJobGb > largestHostFreeGb) blockedBy = "per-host";
  if (blockedBy === null) return null;

  return {
    blockedBy,
    batchCostGb,
    largestJobGb,
    largestHostFreeGb,
    totalFreeGb,
    // What the fleet is short by, in the units that matter for the named fix.
    shortfallGb: blockedBy === "total-ram" ? batchCostGb - totalFreeGb : largestJobGb - largestHostFreeGb,
  };
}

/**
 * Builds and host-assigns the prep jobs (weaken toward min security, grow
 * toward max money, counter-weaken the grow's security) for a target that
 * isn't yet prepped. Unlike batch jobs, prep jobs may split across multiple
 * hosts and may come back short of the requested thread count if RAM runs
 * out -- that's how "capped by available RAM" is satisfied, no extra logic
 * needed. Reuses the same additionalMsec timing technique as planBatch (at
 * SPACING_MS granularity) so weaken-before-grow-before-weaken landing order
 * is still guaranteed, even though prep doesn't need batch-level precision.
 *
 * `target` must carry live-sampled fields: server, growThreads,
 * weakenThreadsForGap, weakenThreadsForGrow, growTime, weakenTime. A field
 * of 0 means that sub-job isn't needed this tick (e.g. already at max money).
 * @param {{server: string, growThreads: number, weakenThreadsForGap: number, weakenThreadsForGrow: number, growTime: number, weakenTime: number}} target
 * @param {{hostname: string, freeRam: number}[]} hosts
 * @param {Record<string, number>} ramCosts
 * @returns {{
 *   jobs: {script: string, target: string, threads: number, additionalMsec: number, hostname: string}[],
 *   hosts: {hostname: string, freeRam: number}[],
 *   schedule: {action: string, requestedThreads: number, launchedThreads: number, additionalMsec: number, duration: number}[]
 * }}
 */
export function planPrep(target, hosts, ramCosts) {
  const wanted = [];
  if (target.weakenThreadsForGap > 0) {
    wanted.push({ action: "weaken", threads: target.weakenThreadsForGap, duration: target.weakenTime, order: 0 });
  }
  if (target.growThreads > 0) {
    wanted.push({ action: "grow", threads: target.growThreads, duration: target.growTime, order: 1 });
    wanted.push({ action: "weaken", threads: target.weakenThreadsForGrow, duration: target.weakenTime, order: 2 });
  }

  const pool = hosts.map((h) => ({ hostname: h.hostname, freeRam: h.freeRam })).filter((h) => h.freeRam > 0);

  if (wanted.length === 0) {
    return { jobs: [], hosts: pool, schedule: [] };
  }

  const referenceTime = Math.max(...wanted.map((w) => w.duration));
  const jobs = [];
  const schedule = [];

  for (const want of wanted) {
    const script = WORKER_SCRIPTS[want.action];
    const additionalMsec = Math.round(referenceTime - want.duration + want.order * SPACING_MS);
    const ramPerThread = ramCosts[script];
    let remaining = want.threads;
    let launched = 0;

    for (const host of pool) {
      if (remaining <= 0) break;
      const affordable = Math.floor(host.freeRam / ramPerThread);
      if (affordable <= 0) continue;
      const threads = Math.min(remaining, affordable);
      host.freeRam -= threads * ramPerThread;
      remaining -= threads;
      launched += threads;
      jobs.push({ script, target: target.server, threads, additionalMsec, hostname: host.hostname });
    }

    // requestedThreads/launchedThreads distinguish weaken-for-security-gap
    // from weaken-for-grow's-security even though both use weaken.js -- the
    // jobs array alone can't tell them apart by script name.
    schedule.push({
      action: want.action,
      requestedThreads: want.threads,
      launchedThreads: launched,
      additionalMsec,
      duration: want.duration,
    });
  }

  return { jobs, hosts: pool.map((h) => ({ hostname: h.hostname, freeRam: h.freeRam })), schedule };
}

/**
 * Rebuilds the active batch-member set every tick (Phase 7), replacing
 * pickBatchTarget's single incumbent. `candidates` must already be sorted
 * score-descending (as getTargets/the daemon's candidate list produces it)
 * and pre-filtered to drop any target whose sample came back null this tick
 * (unhackable) -- an incumbent missing from `candidates` for that reason
 * exits "ineligible".
 *
 * Runs four sequential passes, each walking score order with skip-and-continue
 * "fits" checks (never prefix-stop): a mid-list candidate that doesn't fit is
 * passed over, the walk continues to cheaper/lower-score ones.
 *
 * Known approximation (also comment this at the daemon.js call site): this is
 * a fleet-total GB budget check, but assignBatchHosts still requires each job
 * to land on a single host -- a pipeline can fit the aggregate budget while a
 * given tick's job doesn't fit any one host. Handled downstream by the
 * existing per-tick shrink/skip retry loop, not here.
 * @param {{server: string, score: number, pipelineCostGb: number, prepped: boolean}[]} candidates
 * @param {string[]} incumbentServers last tick's member list (order irrelevant -- only membership checked)
 * @param {number} budgetGb
 * @param {number} hysteresis
 * @returns {{
 *   members: {server: string, score: number, pipelineCostGb: number, prepped: boolean}[],
 *   exits: {server: string, reason: "unaffordable" | "ineligible" | "displaced"}[],
 *   displacement: {entrant: string, displaced: string[]} | null
 * }}
 */
export function pickBatchSet(candidates, incumbentServers, budgetGb, hysteresis) {
  const incumbentSet = new Set(incumbentServers);
  const byServer = new Map(candidates.map((c) => [c.server, c]));

  let remaining = budgetGb;
  const seated = [];
  const seatedServers = new Set();
  const exits = [];

  // Pass 1: incumbents keep their seats first, walked in score order.
  // Skip-and-continue: a higher-scored incumbent that doesn't fit does NOT
  // stop the walk -- a lower-scored, cheaper incumbent later in the same
  // walk still gets checked against the (unchanged) remaining budget and
  // keeps its seat if it fits. Evicting it just because a bigger sibling
  // didn't fit would waste an already-warm pipeline for no reason.
  for (const candidate of candidates) {
    if (!incumbentSet.has(candidate.server)) continue;
    if (candidate.pipelineCostGb <= remaining) {
      seated.push(candidate);
      seatedServers.add(candidate.server);
      remaining -= candidate.pipelineCostGb;
    } else {
      exits.push({ server: candidate.server, reason: "unaffordable" });
    }
  }
  // Incumbents absent from `candidates` entirely (dropped by eligibility or
  // a null sample this tick) -- nothing to fit-check, independent of the
  // budget walk above.
  for (const server of incumbentServers) {
    if (!byServer.has(server)) exits.push({ server, reason: "ineligible" });
  }

  // Pass 2: non-incumbents fill spare budget freely, score order. No prepped
  // gate here -- entering on spare budget displaces nothing, and stage 1
  // will prep a cold entrant exactly as the waterfall would have.
  for (const candidate of candidates) {
    if (seatedServers.has(candidate.server) || incumbentSet.has(candidate.server)) continue;
    if (candidate.pipelineCostGb <= remaining) {
      seated.push(candidate);
      seatedServers.add(candidate.server);
      remaining -= candidate.pipelineCostGb;
    }
  }

  // Hoisted (Phase 15) so the floor pass below and pass 3 share one slot --
  // both ASSIGN to these, neither redeclares. `justEvicted`: servers evicted
  // this tick (by either pass) that pass 4's refill must not re-seat even if
  // the freed budget and its own cost both fit -- otherwise a server ends up
  // in both `exits` (reason "displaced") and `members` from the same call:
  // daemon.js logs a real exit and sets a drainDeadline, but the server never
  // actually left previousMemberSet, so no matching `enter` ever fires --
  // corrupting the exit/enter pairing the natural-exit invariant depends on.
  // A displaced server becomes eligible again next tick, competing as an
  // ordinary non-incumbent (pass 2).
  let displacement = null;
  const justEvicted = new Set();

  // Pass 2.5 (Phase 15): floor -- a non-empty candidate list must always seat
  // at least one member, even when NO candidate's pipelineCostGb fits
  // budgetGb (every fleet-too-small-for-even-one-batch case; passes 1-2
  // above only seat a candidate whose cost already fits, so reaching here
  // with an empty `seated` means literally every candidate is unaffordable).
  // The seated member's over-budget cost stays honest (unaffordable to the
  // passes above and to any snapshot budget check); daemon.js's per-tick
  // empty-pipeline shrink loop is what actually makes it launchable, down to
  // MIN_HACK_FRACTION.
  //
  // incumbentFloor keeps the floor seat by default (stickiness): without
  // this, legacy scoring's tick-to-tick jitter (score moves as a member's own
  // batch drains money) would flip the floor member every tick, abandoning
  // whatever pipeline it just started to shrink into. It's displaced only by
  // a prepped challenger clearing the same two gates pass 3 uses (prepped +
  // hysteresis) against the SAME single seat.
  //
  // Mutually exclusive with pass 3 by construction, not by a separate guard:
  // pass 3 requires a seated incumbent to evict and this pass only runs from
  // an empty seating, so pass 3 can't fire first; and once this pass seats
  // someone, every OTHER candidate is still unaffordable by the same
  // reaching-here argument (its cost > budgetGb), so no combination of
  // evictions in pass 3 can ever free enough for a second seat -- `remaining`
  // caps out at budgetGb even after evicting the floor seat back out, and
  // every remaining challenger costs more than that.
  if (seated.length === 0 && candidates.length > 0) {
    const incumbentFloor = candidates.find((c) => incumbentSet.has(c.server)) ?? null;
    const challenger = candidates[0]; // highest-scored overall; candidates is score-sorted

    const displaces =
      incumbentFloor !== null &&
      challenger.server !== incumbentFloor.server &&
      challenger.prepped &&
      challenger.score >= incumbentFloor.score * hysteresis;

    const pick = incumbentFloor === null || displaces ? challenger : incumbentFloor;

    if (incumbentFloor !== null) {
      // Pass 1 already pushed an "unaffordable" exit for incumbentFloor
      // (every incumbent in `candidates` did, since reaching here means none
      // fit) -- resolve it one way or the other, never leaving both an exit
      // AND a seat for the same server.
      const exitIndex = exits.findIndex((e) => e.server === incumbentFloor.server);
      if (displaces) {
        exits[exitIndex] = { server: incumbentFloor.server, reason: "displaced" };
        displacement = { entrant: challenger.server, displaced: [incumbentFloor.server] };
        justEvicted.add(incumbentFloor.server);
      } else {
        exits.splice(exitIndex, 1); // kept the seat -- it never actually exited
      }
    }

    seated.push(pick);
    seatedServers.add(pick.server);
    remaining -= pick.pipelineCostGb;
  }

  // Pass 3: displacement -- gated, at most one entrant per tick. Only seated
  // incumbents are evictable here (never a pass-2 entrant, and never the
  // just-seated floor member for a SECOND displacement in the same tick --
  // see the floor pass's doc comment on why that can't succeed anyway).
  // evictionOrder is ascending by score (lowest-scored seat first): once one
  // incumbent fails the hysteresis gate in this ascending walk, every
  // subsequent (higher-scored) incumbent needs an even bigger clearance, so
  // all the rest necessarily fail too -- safe to stop early.
  const seatedIncumbents = seated.filter((m) => incumbentSet.has(m.server));
  const evictionOrder = [...seatedIncumbents].sort((a, b) => a.score - b.score);

  for (const challenger of candidates) {
    if (seatedServers.has(challenger.server)) continue;
    if (challenger.pipelineCostGb <= remaining) continue; // already fits -- not a displacement case
    if (!challenger.prepped) continue; // gate (b): a stone-cold challenger can clear hysteresis while still not ready to batch

    let freed = 0;
    const toEvict = [];
    for (const incumbent of evictionOrder) {
      if (!seatedServers.has(incumbent.server)) continue;
      // gate (a), per evicted incumbent individually:
      if (challenger.score < incumbent.score * hysteresis) break;
      toEvict.push(incumbent);
      freed += incumbent.pipelineCostGb;
      if (remaining + freed >= challenger.pipelineCostGb) break; // evict only as many seats as needed
    }

    if (toEvict.length > 0 && remaining + freed >= challenger.pipelineCostGb) {
      // Commit: this challenger is the single highest-scored qualifying one,
      // since candidates is walked top-down and we stop at the first hit.
      for (const evicted of toEvict) {
        seatedServers.delete(evicted.server);
        seated.splice(seated.indexOf(evicted), 1);
        exits.push({ server: evicted.server, reason: "displaced" });
        justEvicted.add(evicted.server);
      }
      remaining += freed;
      seated.push(challenger);
      seatedServers.add(challenger.server);
      remaining -= challenger.pipelineCostGb;
      displacement = { entrant: challenger.server, displaced: toEvict.map((e) => e.server) };
      break; // at most one displacement entry per tick
    }
    // Didn't qualify (gate failed, or no combination of evictable incumbents
    // frees enough budget) -- continue to the next (lower-scored) candidate.
    // This is the deliberate divergence from pickBatchTarget: an unprepped
    // top-scored candidate no longer blocks a lower-scored, prepped
    // candidate that individually clears the hysteresis bar.
  }

  // Pass 4: refill -- a displacement can free more budget than the entrant
  // consumed. Run one more rule-2-style pass so slack isn't stranded until
  // next tick. Only meaningful after an actual displacement. Excludes
  // justEvicted (see its declaration above): a server evicted this same tick
  // is ineligible for re-admission until next tick.
  if (displacement) {
    for (const candidate of candidates) {
      if (seatedServers.has(candidate.server) || justEvicted.has(candidate.server)) continue;
      if (candidate.pipelineCostGb <= remaining) {
        seated.push(candidate);
        seatedServers.add(candidate.server);
        remaining -= candidate.pipelineCostGb;
      }
    }
  }

  // Final order: always score-descending regardless of admission order --
  // callers rely on this for "highest-value pipeline gets first claim on
  // this tick's free RAM."
  seated.sort((a, b) => b.score - a.score);
  return { members: seated, exits, displacement };
}

/**
 * Whole-thread share top-up: computes the gap between a live target GB and
 * what's already in flight, then fills it from the host pool
 * smallest-free-RAM-first -- deliberately the opposite end from
 * carveReservation's largest-first, since big contiguous blocks are the only
 * places a batch's grow job can land; share consumes fragments first and
 * preserves them for batching.
 *
 * Never overshoots the target: total launched threads across all returned
 * jobs is bounded by floor(gap / ramPerThread), computed once up front, not
 * per host. Whatever of that bound the pool can't fit (too fragmented, or
 * genuinely too full this tick) comes back as shortfallGb -- informational
 * only; the caller retries next tick. Does not mutate hosts; returns jobs
 * only, same as the rest of this module -- the daemon adjusts its own live
 * pool copy after launching.
 * @param {number} targetGb
 * @param {number} inFlightShareGb
 * @param {number} ramPerThread
 * @param {{hostname: string, freeRam: number}[]} hosts
 * @returns {{jobs: {hostname: string, threads: number}[], shortfallGb: number}}
 */
export function planShareTopUp(targetGb, inFlightShareGb, ramPerThread, hosts) {
  const gapGb = targetGb - inFlightShareGb;
  if (gapGb <= 0) return { jobs: [], shortfallGb: 0 };

  const maxThreads = Math.floor(gapGb / ramPerThread);

  const pool = hosts
    .map((h) => ({ hostname: h.hostname, freeRam: h.freeRam }))
    .filter((h) => h.freeRam > 0)
    .sort((a, b) => a.freeRam - b.freeRam);

  const jobs = [];
  let remainingThreads = maxThreads;
  for (const host of pool) {
    if (remainingThreads <= 0) break;
    const affordable = Math.floor(host.freeRam / ramPerThread);
    if (affordable <= 0) continue;
    const threads = Math.min(remainingThreads, affordable);
    jobs.push({ hostname: host.hostname, threads });
    remainingThreads -= threads;
  }

  const placedThreads = maxThreads - remainingThreads;
  const shortfallGb = gapGb - placedThreads * ramPerThread;
  return { jobs, shortfallGb };
}
