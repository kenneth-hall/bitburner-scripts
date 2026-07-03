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
 * Chooses the batch target for this tick, applying RANK_HYSTERESIS so a
 * transient score drop (e.g. current-security sampling tanking a score right
 * after a level-up drift) can't rank-flip the daemon away from a target
 * mid-re-prep. `targets` must already be sorted descending by score (as
 * getTargets returns it), so targets[0] is the only possible challenger --
 * if it doesn't beat the incumbent by the hysteresis factor, nothing does.
 * @param {{server: string, score: number}[]} targets
 * @param {string | null} incumbentServer
 * @param {number} hysteresis
 */
export function pickBatchTarget(targets, incumbentServer, hysteresis) {
  const incumbent = targets.find((t) => t.server === incumbentServer);
  if (!incumbent) return targets[0];

  const top = targets[0];
  if (top.server === incumbent.server) return incumbent;
  return top.score >= incumbent.score * hysteresis ? top : incumbent;
}
