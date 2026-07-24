// Real assertions for scheduler.js's pure math -- Phase 4's first runnable
// gate. Everything here has only ever been eyeball-verified in the game;
// these goldens pin the behavior down before sampling code moves around.
// Lives in test/ (not src/) so viteburner never syncs it into the game.
import { describe, it, expect } from 'vitest';
import {
  WORKER_SCRIPTS,
  SHARE_FRACTION,
  SHARE_SCRIPT,
  SPACING_MS,
  BATCH_INTERVAL_MS,
  DRIFT_SEC_EPSILON,
  DRIFT_MONEY_FRACTION,
  isPrepped,
  pipelineDepth,
  cappedPipelineDepth,
  memberReserveGb,
  diagnosePlacement,
  planBatch,
  batchRamCost,
  carveReservation,
  assignBatchHosts,
  planPrep,
  pickBatchSet,
  planShareTopUp,
} from '../src/scheduler.js';

describe('isPrepped', () => {
  const base = { minSecurityLevel: 5, maxMoney: 1_000_000 };

  it('accepts a target exactly at the drift margins (boundaries inclusive)', () => {
    expect(
      isPrepped({
        ...base,
        currentSecurity: 5 + DRIFT_SEC_EPSILON,
        currentMoney: 1_000_000 * DRIFT_MONEY_FRACTION,
      })
    ).toBe(true);
  });

  it('rejects security just past the epsilon', () => {
    expect(
      isPrepped({ ...base, currentSecurity: 5 + DRIFT_SEC_EPSILON + 0.001, currentMoney: 1_000_000 })
    ).toBe(false);
  });

  it('rejects money just under the fraction', () => {
    expect(isPrepped({ ...base, currentSecurity: 5, currentMoney: 899_999 })).toBe(false);
  });
});

describe('pipelineDepth', () => {
  it('is weakenTime over the batch interval, rounded up', () => {
    expect(pipelineDepth(4 * BATCH_INTERVAL_MS)).toBe(4);
    expect(pipelineDepth(4 * BATCH_INTERVAL_MS + 1)).toBe(5);
    expect(pipelineDepth(1)).toBe(1);
  });
});

describe('cappedPipelineDepth (Phase 15)', () => {
  it('is uncapped (equals pipelineDepth) when the full pipeline already fits the budget', () => {
    const weakenTimeMs = 4 * BATCH_INTERVAL_MS; // pipelineDepth = 4
    const ramCostGb = 10;
    expect(cappedPipelineDepth(weakenTimeMs, ramCostGb, 1000)).toBe(pipelineDepth(weakenTimeMs));
    expect(cappedPipelineDepth(weakenTimeMs, ramCostGb, 1000)).toBe(4);
  });

  it('caps to floor(budget / ramCost) when the full pipeline does not fit', () => {
    const weakenTimeMs = 20 * BATCH_INTERVAL_MS; // pipelineDepth = 20
    const ramCostGb = 100;
    // budget only affords 3 batches (300 / 100), far under the depth-20 ceiling.
    expect(cappedPipelineDepth(weakenTimeMs, ramCostGb, 300)).toBe(3);
  });

  it('clamps to 1 when even a single batch costs more than the budget', () => {
    const weakenTimeMs = 20 * BATCH_INTERVAL_MS;
    const ramCostGb = 1000;
    expect(cappedPipelineDepth(weakenTimeMs, ramCostGb, 300)).toBe(1);
  });

  it('exact-fit boundary: budget === depth x ramCost keeps the full depth', () => {
    const weakenTimeMs = 5 * BATCH_INTERVAL_MS; // pipelineDepth = 5
    const ramCostGb = 20;
    expect(cappedPipelineDepth(weakenTimeMs, ramCostGb, 100)).toBe(5); // 100 / 20 = 5, exact
  });
});

describe('diagnosePlacement', () => {
  const ramCosts = { 'hack.js': 1, 'grow.js': 1, 'weaken.js': 1 };
  const jobs = [
    { script: 'hack.js', threads: 10 }, // 10 GB
    { script: 'grow.js', threads: 60 }, // 60 GB -- the largest job
    { script: 'weaken.js', threads: 20 }, // 20 GB
  ]; // batch total 90 GB

  it('returns null when the batch fits', () => {
    expect(diagnosePlacement(jobs, [{ hostname: 'a', freeRam: 100 }], ramCosts)).toBe(null);
  });

  it('reports total-ram when the whole fleet is short', () => {
    const d = diagnosePlacement(jobs, [{ hostname: 'a', freeRam: 40 }, { hostname: 'b', freeRam: 30 }], ramCosts);
    expect(d.blockedBy).toBe('total-ram');
    expect(d.batchCostGb).toBe(90);
    expect(d.totalFreeGb).toBe(70);
    expect(d.shortfallGb).toBe(20);
  });

  it('reports per-host when the fleet has the RAM but no single host does', () => {
    // 150 GB free in aggregate, but the 60 GB grow job needs one 60 GB host.
    const d = diagnosePlacement(jobs, [{ hostname: 'a', freeRam: 50 }, { hostname: 'b', freeRam: 50 }, { hostname: 'c', freeRam: 50 }], ramCosts);
    expect(d.blockedBy).toBe('per-host');
    expect(d.largestJobGb).toBe(60);
    expect(d.largestHostFreeGb).toBe(50);
    expect(d.shortfallGb).toBe(10); // splitting, or 10 GB more on one host
  });

  it('prefers total-ram when both are true (fleet growth is the only fix)', () => {
    const d = diagnosePlacement(jobs, [{ hostname: 'a', freeRam: 5 }], ramCosts);
    expect(d.blockedBy).toBe('total-ram');
  });

  it('handles an empty job list and an empty fleet without throwing', () => {
    expect(diagnosePlacement([], [{ hostname: 'a', freeRam: 10 }], ramCosts)).toBe(null);
    expect(diagnosePlacement(jobs, [], ramCosts).blockedBy).toBe('total-ram');
  });

  it('catches sequential exhaustion: largest job fits the largest host, batch still fails', () => {
    // The bug the first version had. Jobs 60/20/10 = 90 GB total against 100 GB
    // free, and the 60 GB job fits the 60 GB host -- so a
    // largest-job-vs-largest-host check says "fits". But job 1 CONSUMES that
    // host, and the 20 GB job then has only 15+15+10 left: no single host
    // holds it. assignBatchHosts returns null; the diagnosis must agree.
    const ordered = [
      { script: 'grow.js', threads: 60 },
      { script: 'weaken.js', threads: 20 },
      { script: 'hack.js', threads: 10 },
    ];
    const fleet = [
      { hostname: 'big', freeRam: 60 },
      { hostname: 'a', freeRam: 15 },
      { hostname: 'b', freeRam: 15 },
      { hostname: 'c', freeRam: 10 },
    ];
    expect(assignBatchHosts(ordered, fleet, ramCosts)).toBe(null); // ground truth
    const d = diagnosePlacement(ordered, fleet, ramCosts);
    expect(d).not.toBe(null);
    expect(d.blockedBy).toBe('per-host');
    expect(d.failedJobIndex).toBe(1); // the 20 GB weaken, not the 60 GB grow
    expect(d.failedJobGb).toBe(20);
    expect(d.largestHostFreeGb).toBe(15); // fleet AFTER the grow took 'big'
    expect(d.shortfallGb).toBe(5);
  });

  it('agrees with assignBatchHosts on a batch that genuinely places', () => {
    // 70 GB host absorbs the 10 GB hack AND the 60 GB grow; 'b' takes the
    // weaken. (A 60 GB first host would NOT do -- the hack lands there first
    // and leaves 50, starving the grow. That is the sequential effect this
    // whole function exists to model.)
    const fleet = [{ hostname: 'a', freeRam: 70 }, { hostname: 'b', freeRam: 40 }];
    expect(assignBatchHosts(jobs, fleet, ramCosts)).not.toBe(null);
    expect(diagnosePlacement(jobs, fleet, ramCosts)).toBe(null);
  });
});

describe('memberReserveGb', () => {
  it('reserves the unfilled remainder of an affordable pipeline', () => {
    expect(memberReserveGb(300, 120, 1000)).toBe(180);
  });

  it('reserves nothing once an affordable pipeline is fully in flight', () => {
    expect(memberReserveGb(300, 300, 1000)).toBe(0);
    expect(memberReserveGb(300, 340, 1000)).toBe(0); // over-committed, never negative
  });

  it('exact-fit boundary: cost === budget is affordable, so it still reserves', () => {
    expect(memberReserveGb(300, 0, 300)).toBe(300);
  });

  it('reserves ONE shrunk batch for a floor-seated member, not the full pipeline', () => {
    // The BN5 cold-start deadlock: a 1,684.9GB pipeline carved against a 297GB
    // budget zeroed the waterfall, so no other target ever got prepped. The
    // reserve is the shrunk batch's real cost instead.
    expect(memberReserveGb(1684.9, 0, 297, 99.75)).toBe(99.75);
  });

  it('reserves nothing extra once the floor member has its batch in flight', () => {
    expect(memberReserveGb(1684.9, 99.75, 297, 99.75)).toBe(0);
    expect(memberReserveGb(1684.9, 120, 297, 99.75)).toBe(0); // never negative
  });

  it('reserves nothing for a floor member with no known batch cost yet', () => {
    // No diagnosis cached (first tick, or the sample came back null) -- better
    // to let prep use the RAM than to fence off a number we do not have.
    expect(memberReserveGb(1684.9, 0, 297)).toBe(0);
  });

  it('ignores floorBatchCostGb entirely for an affordable member', () => {
    expect(memberReserveGb(300, 120, 1000, 99.75)).toBe(180);
  });
});

describe('planBatch', () => {
  const target = {
    server: 'joesguns',
    hackThreads: 10,
    growThreads: 20,
    weaken1Threads: 2,
    weaken2Threads: 3,
    hackTime: 1000,
    growTime: 3200,
    weakenTime: 4000,
  };

  it('emits hack, weaken1, grow, weaken2 in order with the right scripts and threads', () => {
    const jobs = planBatch(target);
    expect(jobs.map((j) => j.script)).toEqual([
      WORKER_SCRIPTS.hack,
      WORKER_SCRIPTS.weaken,
      WORKER_SCRIPTS.grow,
      WORKER_SCRIPTS.weaken,
    ]);
    expect(jobs.map((j) => j.threads)).toEqual([10, 2, 20, 3]);
    expect(jobs.every((j) => j.target === 'joesguns')).toBe(true);
  });

  it('times every job to land at referenceTime + its landing offset', () => {
    // The spec's landing invariant: additionalMsec + own duration ===
    // referenceTime + k * SPACING_MS, k = 0..3 in launch order.
    const jobs = planBatch(target);
    const durations = [target.hackTime, target.weakenTime, target.growTime, target.weakenTime];
    const referenceTime = Math.max(target.hackTime, target.growTime, target.weakenTime);
    jobs.forEach((job, k) => {
      expect(job.additionalMsec + durations[k]).toBe(referenceTime + k * SPACING_MS);
    });
  });

  it('uses the max duration as reference even when grow outlasts weaken', () => {
    const odd = { ...target, growTime: 5000 };
    const jobs = planBatch(odd);
    // hack's landing = referenceTime + 0 -- so its additionalMsec reveals
    // the reference directly.
    expect(jobs[0].additionalMsec + odd.hackTime).toBe(5000);
  });
});

describe('batchRamCost', () => {
  it('sums ramCosts[script] * threads across jobs', () => {
    const ramCosts = { [WORKER_SCRIPTS.hack]: 2, [WORKER_SCRIPTS.grow]: 4 };
    const jobs = [
      { script: WORKER_SCRIPTS.hack, threads: 10 },
      { script: WORKER_SCRIPTS.grow, threads: 5 },
    ];
    expect(batchRamCost(jobs, ramCosts)).toBe(40);
  });
});

describe('carveReservation', () => {
  const hosts = [
    { hostname: 'a', freeRam: 10 },
    { hostname: 'b', freeRam: 30 },
    { hostname: 'c', freeRam: 20 },
  ];

  it('carves largest-first, zeroing a host before moving to the next', () => {
    const pool = carveReservation(hosts, 35);
    expect(pool).toEqual([
      { hostname: 'b', freeRam: 0 },
      { hostname: 'c', freeRam: 15 },
      { hostname: 'a', freeRam: 10 },
    ]);
  });

  it('zeroes the whole pool when the reserve exceeds total free RAM', () => {
    const pool = carveReservation(hosts, 100);
    expect(pool.every((h) => h.freeRam === 0)).toBe(true);
  });

  it('leaves the pool intact (sorted) at zero reserve', () => {
    const pool = carveReservation(hosts, 0);
    expect(pool.map((h) => h.freeRam)).toEqual([30, 20, 10]);
  });

  it('does not mutate the input', () => {
    carveReservation(hosts, 35);
    expect(hosts).toEqual([
      { hostname: 'a', freeRam: 10 },
      { hostname: 'b', freeRam: 30 },
      { hostname: 'c', freeRam: 20 },
    ]);
  });
});

describe('assignBatchHosts', () => {
  const ramCosts = { [WORKER_SCRIPTS.hack]: 2, [WORKER_SCRIPTS.grow]: 2, [WORKER_SCRIPTS.weaken]: 2 };

  it('places each job whole on the first host that fits, depleting as it goes', () => {
    const jobs = [
      { script: WORKER_SCRIPTS.hack, target: 't', threads: 3, additionalMsec: 0 }, // 6 GB
      { script: WORKER_SCRIPTS.grow, target: 't', threads: 5, additionalMsec: 0 }, // 10 GB
    ];
    const hosts = [
      { hostname: 'small', freeRam: 8 },
      { hostname: 'big', freeRam: 12 },
    ];
    const assigned = assignBatchHosts(jobs, hosts, ramCosts);
    expect(assigned.map((j) => j.hostname)).toEqual(['small', 'big']);
    // Input pool untouched (works on a copy).
    expect(hosts[0].freeRam).toBe(8);
  });

  it('returns null (never splits) when any single job fits nowhere', () => {
    const jobs = [{ script: WORKER_SCRIPTS.grow, target: 't', threads: 10, additionalMsec: 0 }]; // 20 GB
    const hosts = [
      { hostname: 'a', freeRam: 12 },
      { hostname: 'b', freeRam: 12 },
    ];
    expect(assignBatchHosts(jobs, hosts, ramCosts)).toBeNull();
  });
});

describe('planPrep', () => {
  const ramCosts = { [WORKER_SCRIPTS.grow]: 2, [WORKER_SCRIPTS.weaken]: 2 };
  const target = {
    server: 'joesguns',
    growThreads: 10,
    weakenThreadsForGap: 5,
    weakenThreadsForGrow: 3,
    growTime: 3200,
    weakenTime: 4000,
  };

  it('splits across hosts and silently short-changes threads when RAM runs out', () => {
    const hosts = [
      { hostname: 'h1', freeRam: 8 }, // 4 threads
      { hostname: 'h2', freeRam: 6 }, // 3 threads
      { hostname: 'h3', freeRam: 4 }, // 2 threads
    ];
    const { jobs, schedule } = planPrep(target, hosts, ramCosts);

    // weaken-for-gap (5t): h1 takes 4, h2 takes 1 -- split across hosts.
    const gapJobs = jobs.filter((j) => j.script === WORKER_SCRIPTS.weaken && j.additionalMsec === schedule[0].additionalMsec);
    expect(gapJobs.map((j) => [j.hostname, j.threads])).toEqual([
      ['h1', 4],
      ['h2', 1],
    ]);

    // schedule bookkeeping: requested vs actually launched per sub-job.
    expect(schedule.map((s) => [s.action, s.requestedThreads, s.launchedThreads])).toEqual([
      ['weaken', 5, 5],
      ['grow', 10, 4], // RAM-starved: only 4 of 10 fit
      ['weaken', 3, 0], // nothing left at all
    ]);
  });

  it('keeps the weaken -> grow -> weaken landing order via SPACING_MS offsets', () => {
    const hosts = [{ hostname: 'big', freeRam: 1000 }];
    const { schedule } = planPrep(target, hosts, ramCosts);
    const referenceTime = Math.max(target.growTime, target.weakenTime);
    schedule.forEach((s, k) => {
      expect(s.additionalMsec + s.duration).toBe(referenceTime + k * SPACING_MS);
    });
  });

  it('returns empty jobs/schedule for a target needing nothing', () => {
    const idle = { ...target, growThreads: 0, weakenThreadsForGap: 0, weakenThreadsForGrow: 0 };
    const { jobs, schedule } = planPrep(idle, [{ hostname: 'h1', freeRam: 8 }], ramCosts);
    expect(jobs).toEqual([]);
    expect(schedule).toEqual([]);
  });
});

describe('pickBatchSet', () => {
  const memberServers = (result) => result.members.map((m) => m.server);
  // Phase 9: the exits/members lists must never share a server -- the
  // pass-3/pass-4 both-lists bug (a server evicted by pass 3 re-admitted by
  // pass 4's refill in the same call) is exactly a violation of this.
  const expectNoOverlap = (result) => {
    const memberSet = new Set(memberServers(result));
    const exitServers = result.exits.map((e) => e.server);
    for (const server of exitServers) {
      expect(memberSet.has(server), `${server} appears in both exits and members`).toBe(false);
    }
  };

  it('fills spare budget in score order, excluding whatever no longer fits', () => {
    const candidates = [
      { server: 'a', score: 300, pipelineCostGb: 40, prepped: true },
      { server: 'b', score: 200, pipelineCostGb: 30, prepped: true },
      { server: 'c', score: 100, pipelineCostGb: 50, prepped: true },
    ];
    const result = pickBatchSet(candidates, [], 100, 1.25);
    expect(memberServers(result)).toEqual(['a', 'b']);
    expect(result.exits).toEqual([]);
    expect(result.displacement).toBeNull();
  });

  describe('single-pipeline budget (degenerate case, mirrors old pickBatchTarget)', () => {
    const budget = 40; // exactly one pipeline's cost

    it('holds the incumbent when the challenger is just under the hysteresis factor', () => {
      // incumbent 100 * 1.25 = 125; top at 124.99 does not clear it.
      const candidates = [
        { server: 'top', score: 124.99, pipelineCostGb: 40, prepped: true },
        { server: 'mid', score: 100, pipelineCostGb: 40, prepped: true },
        { server: 'low', score: 50, pipelineCostGb: 40, prepped: true },
      ];
      const result = pickBatchSet(candidates, ['mid'], budget, 1.25);
      expect(memberServers(result)).toEqual(['mid']);
      expect(result.exits).toEqual([]);
      expect(result.displacement).toBeNull();
    });

    it('flips when the challenger meets the factor exactly (>=)', () => {
      const candidates = [
        { server: 'top', score: 125, pipelineCostGb: 40, prepped: true },
        { server: 'mid', score: 100, pipelineCostGb: 40, prepped: true },
        { server: 'low', score: 50, pipelineCostGb: 40, prepped: true },
      ];
      const result = pickBatchSet(candidates, ['mid'], budget, 1.25);
      expect(memberServers(result)).toEqual(['top']);
      expect(result.exits).toEqual([{ server: 'mid', reason: 'displaced' }]);
      expect(result.displacement).toEqual({ entrant: 'top', displaced: ['mid'] });
      expectNoOverlap(result);
    });

    it('gate blocks an unprepped challenger even when its score is over threshold', () => {
      const candidates = [
        { server: 'top', score: 125, pipelineCostGb: 40, prepped: false },
        { server: 'mid', score: 100, pipelineCostGb: 40, prepped: true },
        { server: 'low', score: 50, pipelineCostGb: 40, prepped: true },
      ];
      const result = pickBatchSet(candidates, ['mid'], budget, 1.25);
      expect(memberServers(result)).toEqual(['mid']);
      expect(result.exits).toEqual([]);
      expect(result.displacement).toBeNull();
    });

    it('deliberate divergence: an unprepped top-scored candidate no longer blocks a lower-scored, prepped challenger', () => {
      const candidates = [
        { server: 'top', score: 200, pipelineCostGb: 40, prepped: false },
        { server: 'second', score: 130, pipelineCostGb: 40, prepped: true },
        { server: 'mid', score: 100, pipelineCostGb: 40, prepped: true },
      ];
      const result = pickBatchSet(candidates, ['mid'], budget, 1.25);
      expect(memberServers(result)).toEqual(['second']);
      expect(result.exits).toEqual([{ server: 'mid', reason: 'displaced' }]);
      expect(result.displacement).toEqual({ entrant: 'second', displaced: ['mid'] });
      expectNoOverlap(result);
    });
  });

  it('skip-and-continue: a mid-list unaffordable incumbent does not stop cheaper, lower-scored incumbents from seating', () => {
    const candidates = [
      { server: 'a', score: 300, pipelineCostGb: 30, prepped: true },
      { server: 'b', score: 200, pipelineCostGb: 90, prepped: true },
      { server: 'c', score: 100, pipelineCostGb: 20, prepped: true },
    ];
    const result = pickBatchSet(candidates, ['a', 'b', 'c'], 100, 1.25);
    expect(memberServers(result)).toEqual(['a', 'c']);
    expect(result.exits).toEqual([{ server: 'b', reason: 'unaffordable' }]);
    expect(result.displacement).toBeNull();
  });

  it('an incumbent seats before a better-scored non-incumbent whose score does not clear hysteresis', () => {
    const candidates = [
      { server: 'nc', score: 110, pipelineCostGb: 40, prepped: true },
      { server: 'inc', score: 100, pipelineCostGb: 40, prepped: true },
    ];
    const result = pickBatchSet(candidates, ['inc'], 40, 1.25);
    expect(memberServers(result)).toEqual(['inc']);
    expect(result.exits).toEqual([]);
    expect(result.displacement).toBeNull();
  });

  it('spare-budget entry requires no prepped gate', () => {
    const candidates = [{ server: 'a', score: 100, pipelineCostGb: 30, prepped: false }];
    const result = pickBatchSet(candidates, [], 50, 1.25);
    expect(memberServers(result)).toEqual(['a']);
  });

  it('displacement evicts multiple lowest-scored seats, all listed in exits and displacement.displaced', () => {
    const candidates = [
      { server: 'challenger', score: 300, pipelineCostGb: 70, prepped: true },
      { server: 'inc3', score: 80, pipelineCostGb: 35, prepped: true },
      { server: 'inc2', score: 70, pipelineCostGb: 30, prepped: true },
      { server: 'inc1', score: 60, pipelineCostGb: 25, prepped: true },
    ];
    const result = pickBatchSet(candidates, ['inc1', 'inc2', 'inc3'], 90, 1.25);
    expect(memberServers(result)).toEqual(['challenger']);
    expect(result.exits).toEqual(
      expect.arrayContaining([
        { server: 'inc1', reason: 'displaced' },
        { server: 'inc2', reason: 'displaced' },
        { server: 'inc3', reason: 'displaced' },
      ])
    );
    expect(result.exits).toHaveLength(3);
    expect(result.displacement.entrant).toBe('challenger');
    expect(new Set(result.displacement.displaced)).toEqual(new Set(['inc1', 'inc2', 'inc3']));
    expectNoOverlap(result);
  });

  it('allows at most one displacement per tick even when two challengers qualify', () => {
    const candidates = [
      { server: 'chA', score: 300, pipelineCostGb: 50, prepped: true },
      { server: 'chB', score: 200, pipelineCostGb: 50, prepped: true },
      { server: 'inc', score: 100, pipelineCostGb: 50, prepped: true },
    ];
    const result = pickBatchSet(candidates, ['inc'], 50, 1.25);
    expect(memberServers(result)).toEqual(['chA']);
    expect(result.exits).toEqual([{ server: 'inc', reason: 'displaced' }]);
    expect(result.displacement.entrant).toBe('chA');
    expectNoOverlap(result);
  });

  it('rule-4 refill admits a small non-member into budget freed by a displacement', () => {
    const candidates = [
      { server: 'big', score: 300, pipelineCostGb: 50, prepped: true },
      { server: 'inc', score: 100, pipelineCostGb: 60, prepped: true },
      { server: 'small', score: 90, pipelineCostGb: 10, prepped: true },
    ];
    const result = pickBatchSet(candidates, ['inc'], 60, 1.25);
    expect(memberServers(result)).toEqual(['big', 'small']);
    expect(result.exits).toEqual([{ server: 'inc', reason: 'displaced' }]);
    expect(result.displacement).toEqual({ entrant: 'big', displaced: ['inc'] });
    expectNoOverlap(result);
  });

  it('Phase 9 BACKLOG repro: pass-4 refill must not re-admit a server pass 3 just evicted', () => {
    // Exact repro from docs/phases/phase-09-batcher-refactor.md: displacing both incumbents
    // frees 35 GB against a 12 GB entrant, leaving 23 GB of slack -- enough
    // for pass 4 to re-seat n00dles (cost 5) if it weren't excluded as
    // just-evicted. Before the fix this put n00dles in both `exits`
    // (displaced) and `members`, corrupting the daemon's exit/enter pairing.
    const candidates = [
      { server: 'challenger', score: 300, pipelineCostGb: 12, prepped: true },
      { server: 'mid', score: 70, pipelineCostGb: 30, prepped: true },
      { server: 'n00dles', score: 60, pipelineCostGb: 5, prepped: true },
    ];
    const result = pickBatchSet(candidates, ['mid', 'n00dles'], 35, 1.25);
    expect(memberServers(result)).toEqual(['challenger']);
    expect(result.exits).toEqual(
      expect.arrayContaining([
        { server: 'mid', reason: 'displaced' },
        { server: 'n00dles', reason: 'displaced' },
      ])
    );
    expect(result.exits).toHaveLength(2);
    expectNoOverlap(result);
  });

  it('refill still works: a never-evicted cheap candidate is admitted from budget a displacement freed', () => {
    // Same shape as the rule-4 refill case above, but stated explicitly as
    // the justEvicted guard's negative-space check: 'small' was never a
    // seated incumbent, so it must still be admitted in pass 4 even though
    // 'inc' was evicted in the same tick.
    const candidates = [
      { server: 'big', score: 300, pipelineCostGb: 50, prepped: true },
      { server: 'inc', score: 100, pipelineCostGb: 60, prepped: true },
      { server: 'small', score: 90, pipelineCostGb: 10, prepped: true },
    ];
    const result = pickBatchSet(candidates, ['inc'], 60, 1.25);
    expect(memberServers(result)).toContain('small');
    expectNoOverlap(result);
  });

  it('an incumbent missing from candidates exits "ineligible"', () => {
    const candidates = [{ server: 'other', score: 50, pipelineCostGb: 30, prepped: true }];
    const result = pickBatchSet(candidates, ['gone'], 100, 1.25);
    expect(memberServers(result)).toEqual(['other']);
    expect(result.exits).toEqual([{ server: 'gone', reason: 'ineligible' }]);
  });

  it('a budget shrink below an incumbent\'s sole cost floor-seats it instead of exiting (Phase 15)', () => {
    // Before Phase 15 this exited "unaffordable" with nobody seated -- the
    // exact zero-member-forever shape the floor rule exists to prevent.
    // With only one candidate (itself the incumbent), the floor pass keeps
    // it seated and its pass-1 "unaffordable" exit is retracted.
    const candidates = [{ server: 'inc', score: 100, pipelineCostGb: 80, prepped: true }];
    const result = pickBatchSet(candidates, ['inc'], 50, 1.25);
    expect(memberServers(result)).toEqual(['inc']);
    expect(result.exits).toEqual([]);
    expect(result.displacement).toBeNull();
  });

  it('empty candidates returns empty members, with every incumbent exiting "ineligible"', () => {
    const result = pickBatchSet([], ['x', 'y'], 100, 1.25);
    expect(result.members).toEqual([]);
    expect(result.exits).toEqual(
      expect.arrayContaining([
        { server: 'x', reason: 'ineligible' },
        { server: 'y', reason: 'ineligible' },
      ])
    );
    expect(result.exits).toHaveLength(2);
  });

  describe('floor rule (Phase 15): a non-empty candidate list always seats at least one member', () => {
    it('nothing fits, no incumbents -- seats exactly the top-scored candidate, no exits, no displacement', () => {
      const candidates = [
        { server: 'top', score: 300, pipelineCostGb: 500, prepped: true },
        { server: 'mid', score: 200, pipelineCostGb: 800, prepped: true },
      ];
      const result = pickBatchSet(candidates, [], 100, 1.25);
      expect(memberServers(result)).toEqual(['top']);
      expect(result.exits).toEqual([]);
      expect(result.displacement).toBeNull();
      expectNoOverlap(result);
    });

    it('nothing fits, top candidate was the incumbent -- stays seated with no "unaffordable" exit; lower incumbents still exit', () => {
      const candidates = [
        { server: 'top', score: 300, pipelineCostGb: 500, prepped: true },
        { server: 'mid', score: 200, pipelineCostGb: 800, prepped: true },
      ];
      const result = pickBatchSet(candidates, ['top', 'mid'], 100, 1.25);
      expect(memberServers(result)).toEqual(['top']);
      expect(result.exits).toEqual([{ server: 'mid', reason: 'unaffordable' }]);
      expect(result.displacement).toBeNull();
      expectNoOverlap(result);
    });

    it('challenger above the incumbent but under hysteresis -- incumbent keeps the floor seat', () => {
      // incumbent 100 * 1.25 = 125; challenger at 124.99 does not clear it.
      const candidates = [
        { server: 'top', score: 124.99, pipelineCostGb: 500, prepped: true },
        { server: 'inc', score: 100, pipelineCostGb: 500, prepped: true },
      ];
      const result = pickBatchSet(candidates, ['inc'], 100, 1.25);
      expect(memberServers(result)).toEqual(['inc']);
      expect(result.exits).toEqual([]);
      expect(result.displacement).toBeNull();
      expectNoOverlap(result);
    });

    it('prepped challenger at/over hysteresis displaces the incumbent floor seat -- displacement survives in the returned result, and pass 4 does not re-seat the displaced server', () => {
      const candidates = [
        { server: 'top', score: 125, pipelineCostGb: 500, prepped: true },
        { server: 'inc', score: 100, pipelineCostGb: 500, prepped: true },
      ];
      const result = pickBatchSet(candidates, ['inc'], 100, 1.25);
      expect(memberServers(result)).toEqual(['top']);
      expect(result.exits).toEqual([{ server: 'inc', reason: 'displaced' }]);
      expect(result.displacement).toEqual({ entrant: 'top', displaced: ['inc'] });
      expectNoOverlap(result);
    });

    it('unprepped challenger over hysteresis does not displace -- incumbent keeps the seat (prepped gate)', () => {
      const candidates = [
        { server: 'top', score: 200, pipelineCostGb: 500, prepped: false },
        { server: 'inc', score: 100, pipelineCostGb: 500, prepped: true },
      ];
      const result = pickBatchSet(candidates, ['inc'], 100, 1.25);
      expect(memberServers(result)).toEqual(['inc']);
      expect(result.exits).toEqual([]);
      expect(result.displacement).toBeNull();
      expectNoOverlap(result);
    });

    it('never fires when any candidate fits -- a fitting low-scored candidate seats via pass 2, the over-budget high-scorer is simply not seated', () => {
      const candidates = [
        { server: 'expensive', score: 300, pipelineCostGb: 500, prepped: true },
        { server: 'cheap', score: 100, pipelineCostGb: 50, prepped: true },
      ];
      const result = pickBatchSet(candidates, [], 100, 1.25);
      expect(memberServers(result)).toEqual(['cheap']);
      expect(result.exits).toEqual([]);
      expect(result.displacement).toBeNull();
      expectNoOverlap(result);
    });

    it('empty candidates -- unchanged existing behavior (all incumbents exit, no floor seat)', () => {
      const result = pickBatchSet([], ['a'], 100, 1.25);
      expect(result.members).toEqual([]);
      expect(result.exits).toEqual([{ server: 'a', reason: 'ineligible' }]);
      expect(result.displacement).toBeNull();
    });
  });

  it('does not mutate its input arrays', () => {
    const candidates = [
      { server: 'big', score: 300, pipelineCostGb: 50, prepped: true },
      { server: 'inc', score: 100, pipelineCostGb: 60, prepped: true },
      { server: 'small', score: 90, pipelineCostGb: 10, prepped: true },
    ];
    const incumbentServers = ['inc'];
    const candidatesSnapshot = JSON.parse(JSON.stringify(candidates));
    const incumbentSnapshot = JSON.parse(JSON.stringify(incumbentServers));

    pickBatchSet(candidates, incumbentServers, 60, 1.25);

    expect(candidates).toEqual(candidatesSnapshot);
    expect(incumbentServers).toEqual(incumbentSnapshot);
  });
});

describe('Phase 8 share constants', () => {
  it('are exported', () => {
    expect(SHARE_FRACTION).toBe(0.25);
    expect(SHARE_SCRIPT).toBe('share.js');
  });
});

describe('planShareTopUp', () => {
  const ramPerThread = 4; // GB/thread, matches share.js's expected 4.00 GB

  it('fills toward target smallest-host-first', () => {
    const hosts = [
      { hostname: 'big', freeRam: 100 },
      { hostname: 'small', freeRam: 20 },
      { hostname: 'mid', freeRam: 40 },
    ];
    // gap = 40 GB -> 10 threads. smallest-first: small(20->5t), mid(40->10t
    // but only 5 remain needed) -- so small takes 5, mid takes the last 5.
    const { jobs, shortfallGb } = planShareTopUp(40, 0, ramPerThread, hosts);
    expect(jobs).toEqual([
      { hostname: 'small', threads: 5 },
      { hostname: 'mid', threads: 5 },
    ]);
    expect(shortfallGb).toBe(0);
  });

  it('splits across hosts when one host cannot cover the whole gap', () => {
    const hosts = [
      { hostname: 'a', freeRam: 8 }, // 2t
      { hostname: 'b', freeRam: 12 }, // 3t
    ];
    const { jobs, shortfallGb } = planShareTopUp(20, 0, ramPerThread, hosts); // gap 20 -> 5 threads wanted
    expect(jobs).toEqual([
      { hostname: 'a', threads: 2 },
      { hostname: 'b', threads: 3 },
    ]);
    expect(shortfallGb).toBe(0); // exactly 5 threads placed (2+3), matching maxThreads
  });

  it('rounds down to whole threads only, per host', () => {
    const hosts = [{ hostname: 'a', freeRam: 9 }]; // floor(9/4) = 2 threads, 1 GB left over unusable
    const { jobs } = planShareTopUp(100, 0, ramPerThread, hosts);
    expect(jobs).toEqual([{ hostname: 'a', threads: 2 }]);
  });

  it('never overshoots the target even when the pool has room to spare', () => {
    const hosts = [{ hostname: 'huge', freeRam: 10_000 }];
    // gap = 10 GB -> exactly 2 threads (8 GB), even though the host could fit far more.
    const { jobs, shortfallGb } = planShareTopUp(10, 0, ramPerThread, hosts);
    expect(jobs).toEqual([{ hostname: 'huge', threads: 2 }]);
    expect(shortfallGb).toBe(2); // the 2 GB sub-thread remainder of the gap, unplaceable regardless of pool size
  });

  it('returns zero jobs at or above target, including targetGb = 0 (the marker case)', () => {
    const hosts = [{ hostname: 'a', freeRam: 100 }];
    expect(planShareTopUp(0, 0, ramPerThread, hosts)).toEqual({ jobs: [], shortfallGb: 0 });
    expect(planShareTopUp(50, 50, ramPerThread, hosts)).toEqual({ jobs: [], shortfallGb: 0 });
    expect(planShareTopUp(50, 80, ramPerThread, hosts)).toEqual({ jobs: [], shortfallGb: 0 }); // already over target
  });

  it('reports shortfallGb when the pool cannot fit the whole gap', () => {
    const hosts = [{ hostname: 'a', freeRam: 8 }]; // 2 threads = 8 GB
    // gap = 40 GB -> wants 10 threads, pool only fits 2 -> shortfall = 8 threads' worth = 32 GB
    const { jobs, shortfallGb } = planShareTopUp(40, 0, ramPerThread, hosts);
    expect(jobs).toEqual([{ hostname: 'a', threads: 2 }]);
    expect(shortfallGb).toBe(32);
  });

  it('skips zero-free hosts entirely', () => {
    const hosts = [
      { hostname: 'empty', freeRam: 0 },
      { hostname: 'ok', freeRam: 8 },
    ];
    const { jobs } = planShareTopUp(8, 0, ramPerThread, hosts);
    expect(jobs).toEqual([{ hostname: 'ok', threads: 2 }]);
  });

  it('does not mutate the input hosts array', () => {
    const hosts = [{ hostname: 'a', freeRam: 20 }];
    const snapshot = JSON.parse(JSON.stringify(hosts));
    planShareTopUp(20, 0, ramPerThread, hosts);
    expect(hosts).toEqual(snapshot);
  });
});
