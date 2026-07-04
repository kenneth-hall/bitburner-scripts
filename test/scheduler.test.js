// Real assertions for scheduler.js's pure math -- Phase 4's first runnable
// gate. Everything here has only ever been eyeball-verified in the game;
// these goldens pin the behavior down before sampling code moves around.
// Lives in test/ (not src/) so viteburner never syncs it into the game.
import { describe, it, expect } from 'vitest';
import {
  WORKER_SCRIPTS,
  SPACING_MS,
  BATCH_INTERVAL_MS,
  DRIFT_SEC_EPSILON,
  DRIFT_MONEY_FRACTION,
  isPrepped,
  pipelineDepth,
  planBatch,
  batchRamCost,
  carveReservation,
  assignBatchHosts,
  planPrep,
  pickBatchTarget,
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

describe('pickBatchTarget', () => {
  const targets = [
    { server: 'top', score: 124.99 },
    { server: 'mid', score: 100 },
    { server: 'low', score: 50 },
  ];

  it('holds the incumbent when the challenger is just under the hysteresis factor', () => {
    // incumbent 100 * 1.25 = 125; top at 124.99 does not clear it.
    expect(pickBatchTarget(targets, 'mid', 1.25).server).toBe('mid');
  });

  it('flips when the challenger meets the factor exactly (>=)', () => {
    const flipped = [{ server: 'top', score: 125 }, ...targets.slice(1)];
    expect(pickBatchTarget(flipped, 'mid', 1.25).server).toBe('top');
  });

  it('keeps the incumbent when it is itself the top target', () => {
    expect(pickBatchTarget(targets, 'top', 1.25).server).toBe('top');
  });

  it('falls back to targets[0] when the incumbent vanished from the list', () => {
    expect(pickBatchTarget(targets, 'gone', 1.25).server).toBe('top');
  });

  it('picks targets[0] with no incumbent at all', () => {
    expect(pickBatchTarget(targets, null, 1.25).server).toBe('top');
  });

  it('does not flip an over-threshold challenger when challengerPrepped is false', () => {
    const flipped = [{ server: 'top', score: 125 }, ...targets.slice(1)];
    expect(pickBatchTarget(flipped, 'mid', 1.25, false).server).toBe('mid');
  });

  it('flips an over-threshold challenger when challengerPrepped is true', () => {
    const flipped = [{ server: 'top', score: 125 }, ...targets.slice(1)];
    expect(pickBatchTarget(flipped, 'mid', 1.25, true).server).toBe('top');
  });

  it('defaults challengerPrepped to true, preserving old call sites', () => {
    const flipped = [{ server: 'top', score: 125 }, ...targets.slice(1)];
    expect(pickBatchTarget(flipped, 'mid', 1.25).server).toBe('top');
  });

  it('ignores challengerPrepped when the incumbent is itself the top target', () => {
    expect(pickBatchTarget(targets, 'top', 1.25, false).server).toBe('top');
  });

  it('ignores challengerPrepped when the incumbent vanished from the list', () => {
    expect(pickBatchTarget(targets, 'gone', 1.25, false).server).toBe('top');
  });
});
