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

  // Pass 3: displacement -- gated, at most one entrant per tick. Only seated
  // incumbents are evictable here (never a pass-2 entrant). evictionOrder is
  // ascending by score (lowest-scored seat first): once one incumbent fails
  // the hysteresis gate in this ascending walk, every subsequent
  // (higher-scored) incumbent needs an even bigger clearance, so all the
  // rest necessarily fail too -- safe to stop early.
  let displacement = null;
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
  // next tick. Only meaningful after an actual displacement.
  if (displacement) {
    for (const candidate of candidates) {
      if (seatedServers.has(candidate.server)) continue;
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
