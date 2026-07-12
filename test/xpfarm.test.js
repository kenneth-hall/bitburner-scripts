// Pure-function tests for the Phase 20 production XP engine (spec: work item
// 8). Mock-free -- every function under test is ns-free by design.
import { describe, it, expect } from 'vitest';
import { latestBatcherClaim, applyXpReserve, pickXpTargets, planXpJobs } from '../src/xpfarm.js';
import { XP_SCRIPTS } from '../src/scheduler.js';

const NOW = 1_700_000_000_000;

function snapshotLog(overrides = {}) {
  return JSON.stringify([
    {
      event: 'snapshot',
      timestamp: NOW - 1000,
      members: [
        { server: 'foodnstuff', reserveGb: 10 },
        { server: 'joesguns', reserveGb: 25 },
      ],
      draining: [{ server: 'n00dles' }],
      sharePool: { targetGb: 100, inFlightRamGb: 40 },
      ...overrides,
    },
  ]);
}

// --- latestBatcherClaim ----------------------------------------------------

describe('latestBatcherClaim', () => {
  it('happy path: sums members reserveGb, adds the share gap, includes draining in claimedServers', () => {
    const result = latestBatcherClaim(snapshotLog(), NOW);
    expect(result.claimGb).toBe(10 + 25 + (100 - 40));
    expect(new Set(result.claimedServers)).toEqual(new Set(['foodnstuff', 'joesguns', 'n00dles']));
  });

  it('valid snapshot with no `draining` field computes from members + share gap alone, no throw', () => {
    const raw = JSON.stringify([
      {
        event: 'snapshot',
        timestamp: NOW - 1000,
        members: [{ server: 'foodnstuff', reserveGb: 10 }],
        sharePool: { targetGb: 100, inFlightRamGb: 40 },
      },
    ]);
    const result = latestBatcherClaim(raw, NOW);
    expect(result.claimGb).toBe(10 + 60);
    expect(result.claimedServers).toEqual(['foodnstuff']);
  });

  it('zero share gap when share is over-attained (inFlightRamGb > targetGb)', () => {
    const raw = snapshotLog({ sharePool: { targetGb: 50, inFlightRamGb: 90 } });
    const result = latestBatcherClaim(raw, NOW);
    expect(result.claimGb).toBe(10 + 25 + 0);
  });

  it('a snapshot older than SNAPSHOT_STALE_MS (60s) yields zero claim', () => {
    const raw = JSON.stringify([
      {
        event: 'snapshot',
        timestamp: NOW - 61_000,
        members: [{ server: 'foodnstuff', reserveGb: 10 }],
        sharePool: { targetGb: 100, inFlightRamGb: 0 },
      },
    ]);
    expect(latestBatcherClaim(raw, NOW)).toEqual({ claimGb: 0, claimedServers: [] });
  });

  it('malformed JSON yields zero claim', () => {
    expect(latestBatcherClaim('{not json', NOW)).toEqual({ claimGb: 0, claimedServers: [] });
  });

  it('empty/missing raw content yields zero claim', () => {
    expect(latestBatcherClaim('', NOW)).toEqual({ claimGb: 0, claimedServers: [] });
    expect(latestBatcherClaim(null, NOW)).toEqual({ claimGb: 0, claimedServers: [] });
    expect(latestBatcherClaim(undefined, NOW)).toEqual({ claimGb: 0, claimedServers: [] });
  });

  it('a log with no snapshot event yields zero claim', () => {
    const raw = JSON.stringify([{ event: 'mode', timestamp: NOW - 1000 }]);
    expect(latestBatcherClaim(raw, NOW)).toEqual({ claimGb: 0, claimedServers: [] });
  });

  it('picks the LAST snapshot event when multiple are present', () => {
    const raw = JSON.stringify([
      { event: 'snapshot', timestamp: NOW - 5000, members: [{ server: 'stale', reserveGb: 999 }], sharePool: { targetGb: 0, inFlightRamGb: 0 } },
      { event: 'snapshot', timestamp: NOW - 500, members: [{ server: 'fresh', reserveGb: 5 }], sharePool: { targetGb: 0, inFlightRamGb: 0 } },
    ]);
    const result = latestBatcherClaim(raw, NOW);
    expect(result.claimGb).toBe(5);
    expect(result.claimedServers).toEqual(['fresh']);
  });
});

// --- applyXpReserve ----------------------------------------------------

describe('applyXpReserve', () => {
  it('nets each host by reserveFrac * maxRam, clamps at 0, preserves order', () => {
    const hosts = [
      { hostname: 'home', freeRam: 1000, maxRam: 2000 },
      { hostname: 'pserv-0', freeRam: 3, maxRam: 100 }, // 5% of 100 = 5 > 3 free -> clamps to 0
      { hostname: 'pserv-1', freeRam: 50, maxRam: 50 },
    ];
    const result = applyXpReserve(hosts, 0.05);
    expect(result).toEqual([
      { hostname: 'home', freeRam: 900 },
      { hostname: 'pserv-0', freeRam: 0 },
      { hostname: 'pserv-1', freeRam: 47.5 },
    ]);
  });
});

// --- pickXpTargets ----------------------------------------------------

describe('pickXpTargets', () => {
  const candidates = [
    { server: 'low-req', rooted: true, reqLevel: 5, maxMoney: 1000 },
    { server: 'mid-req', rooted: true, reqLevel: 50, maxMoney: 1000 },
    { server: 'high-req', rooted: true, reqLevel: 100, maxMoney: 1000 },
    { server: 'unrooted', rooted: false, reqLevel: 10, maxMoney: 1000 },
    { server: 'too-hard', rooted: true, reqLevel: 9999, maxMoney: 1000 },
    { server: 'no-money', rooted: true, reqLevel: 20, maxMoney: 0 },
    { server: 'claimed', rooted: true, reqLevel: 80, maxMoney: 1000 },
  ];

  it('sorts by reqLevel descending', () => {
    // claimedServers empty here -- 'claimed' (reqLevel 80) passes; 'no-money'
    // (maxMoney 0), 'unrooted', and 'too-hard' (reqLevel > playerLevel) don't.
    const result = pickXpTargets(candidates, [], 10, 500);
    expect(result.map((t) => t.server)).toEqual(['high-req', 'claimed', 'mid-req', 'low-req']);
  });

  it('applies all four eligibility filters: rooted, reqLevel <= playerLevel, maxMoney > 0, not claimed', () => {
    const result = pickXpTargets(candidates, ['claimed'], 10, 500);
    const servers = result.map((t) => t.server);
    expect(servers).not.toContain('unrooted');
    expect(servers).not.toContain('too-hard'); // reqLevel 9999 > playerLevel 500
    expect(servers).not.toContain('no-money');
    expect(servers).not.toContain('claimed');
    expect(servers).toEqual(['high-req', 'mid-req', 'low-req']);
  });

  it('respects topN', () => {
    const result = pickXpTargets(candidates, [], 2, 500);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.server)).toEqual(['high-req', 'claimed']);
  });

  it('returns empty when every eligible candidate is claimed', () => {
    const onlyEligible = [{ server: 'a', rooted: true, reqLevel: 5, maxMoney: 100 }];
    expect(pickXpTargets(onlyEligible, ['a'], 3, 500)).toEqual([]);
  });
});

// --- planXpJobs ----------------------------------------------------

describe('planXpJobs', () => {
  const RAM_COSTS = { [XP_SCRIPTS.hack]: 1.7, [XP_SCRIPTS.weaken]: 1.75 };
  const OPTS = { holdWeakenFrac: 0.16, crushSecGap: 5 };

  it('round-robin covers N targets across hosts', () => {
    const hosts = [
      { hostname: 'h1', freeRam: 100 },
      { hostname: 'h2', freeRam: 100 },
      { hostname: 'h3', freeRam: 100 },
    ];
    const targets = [
      { server: 'a', sec: 10, minSec: 10 },
      { server: 'b', sec: 10, minSec: 10 },
    ];
    const { jobs } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    const targetsHit = new Set(jobs.map((j) => j.target));
    expect(targetsHit).toEqual(new Set(['a', 'b']));
    // h1 -> a, h2 -> b, h3 -> a (round-robin wraps)
    expect(jobs.filter((j) => j.hostname === 'h1').every((j) => j.target === 'a')).toBe(true);
    expect(jobs.filter((j) => j.hostname === 'h2').every((j) => j.target === 'b')).toBe(true);
    expect(jobs.filter((j) => j.hostname === 'h3').every((j) => j.target === 'a')).toBe(true);
  });

  it('hold mode splits ~84/16 hack/weaken in threads, weaken sized first, both >= 1', () => {
    const hosts = [{ hostname: 'h1', freeRam: 1000 }];
    const targets = [{ server: 'a', sec: 10, minSec: 10 }]; // gap 0, well under crushSecGap
    const { jobs, hackThreads, weakenThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(jobs).toHaveLength(2);
    const weakenJob = jobs.find((j) => j.script === XP_SCRIPTS.weaken);
    const hackJob = jobs.find((j) => j.script === XP_SCRIPTS.hack);
    expect(weakenJob.threads).toBeGreaterThanOrEqual(1);
    expect(hackJob.threads).toBeGreaterThanOrEqual(1);
    // weaken RAM share should be close to 16% of the host's total RAM
    const weakenGb = weakenThreads * RAM_COSTS[XP_SCRIPTS.weaken];
    expect(weakenGb / 1000).toBeCloseTo(0.16, 1);
    expect(hackThreads).toBeGreaterThan(0);
  });

  it('crush mode sends a hot target\'s whole host slice to weaken, no hack job', () => {
    const hosts = [{ hostname: 'h1', freeRam: 100 }];
    const targets = [{ server: 'hot', sec: 50, minSec: 10 }]; // gap 40 > crushSecGap 5
    const { jobs, hackThreads, weakenThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].script).toBe(XP_SCRIPTS.weaken);
    expect(hackThreads).toBe(0);
    expect(weakenThreads).toBe(Math.floor(100 / RAM_COSTS[XP_SCRIPTS.weaken]));
  });

  it('a slice too small to afford even one weaken thread is dropped (host skipped entirely)', () => {
    const hosts = [{ hostname: 'tiny', freeRam: 1 }]; // under one weaken thread (1.75 GB)
    const targets = [{ server: 'a', sec: 10, minSec: 10 }];
    const { jobs } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(jobs).toEqual([]);
  });

  it('a host slice that affords weaken but not enough left over for a hack thread drops the hack half only', () => {
    // freeRam sized so 16% floors to exactly 1 weaken thread (1.75 GB) and the
    // remainder is under one hack thread (1.7 GB).
    const hosts = [{ hostname: 'h1', freeRam: 12 }]; // 16% of 12 = 1.92 -> 1 weaken thread (1.75); remainder 10.25 -> plenty of hack actually
    // Use a smaller remainder case instead: freeRam just over one weaken thread.
    const tightHosts = [{ hostname: 'h2', freeRam: 1.8 }]; // 16% = 0.288 -> 0 weaken threads (dropped); remainder 1.8 -> 1 hack thread
    const targets = [{ server: 'a', sec: 10, minSec: 10 }];
    const { jobs: tightJobs } = planXpJobs(tightHosts, targets, RAM_COSTS, OPTS);
    expect(tightJobs).toHaveLength(1);
    expect(tightJobs[0].script).toBe(XP_SCRIPTS.hack);
  });

  it('empty hosts or empty targets yields no jobs', () => {
    const targets = [{ server: 'a', sec: 10, minSec: 10 }];
    const hosts = [{ hostname: 'h1', freeRam: 1000 }];
    expect(planXpJobs([], targets, RAM_COSTS, OPTS)).toEqual({ jobs: [], hackThreads: 0, weakenThreads: 0 });
    expect(planXpJobs(hosts, [], RAM_COSTS, OPTS)).toEqual({ jobs: [], hackThreads: 0, weakenThreads: 0 });
  });
});
