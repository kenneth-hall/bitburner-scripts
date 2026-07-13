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
  const HACK_SEC_PER_THREAD = 0.002;
  const HOLD_HACK_WAVE = Math.floor(5 / HACK_SEC_PER_THREAD); // 2500
  const OPTS = {
    crushSecGap: 5,
    weakenSecPerThread: 0.05,
    crushOversize: 1.1,
    hackSecPerThread: HACK_SEC_PER_THREAD,
    holdOversize: 1.25,
    holdHackWave: HOLD_HACK_WAVE,
    overflowEnabled: true,
  };
  const EMPTY_RESULT = { jobs: [], hackThreads: 0, weakenThreads: 0, volleyThreads: 0, overflowHackThreads: 0 };

  it('a slice too small to afford even one thread of either kind is dropped (host skipped entirely)', () => {
    const hosts = [{ hostname: 'tiny', freeRam: 1 }]; // under both hackRam (1.7) and weakenRam (1.75)
    const targets = [{ server: 'a', sec: 10, minSec: 10, crushOk: true }];
    const { jobs } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(jobs).toEqual([]);
  });

  it('empty hosts or empty targets yields no jobs', () => {
    const targets = [{ server: 'a', sec: 10, minSec: 10, crushOk: true }];
    const hosts = [{ hostname: 'h1', freeRam: 1000 }];
    expect(planXpJobs([], targets, RAM_COSTS, OPTS)).toEqual(EMPTY_RESULT);
    expect(planXpJobs(hosts, [], RAM_COSTS, OPTS)).toEqual(EMPTY_RESULT);
  });

  // --- S8: sized, cooldown-gated crush volley -----------------------------

  it('volley is sized to the gap: ceil((sec - minSec) / weakenSecPerThread * crushOversize)', () => {
    const hosts = [{ hostname: 'h1', freeRam: 100_000 }]; // plenty of RAM -- volley is capacity-unconstrained here
    const targets = [{ server: 'hot', sec: 65, minSec: 22, crushOk: true }]; // gap 43
    const { jobs, volleyThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    const expectedVolleyThreads = Math.ceil(((65 - 22) / 0.05) * 1.1); // 946
    expect(volleyThreads).toBe(expectedVolleyThreads);
    const volleyJob = jobs.find((j) => j.kind === 'volley');
    expect(volleyJob.threads).toBe(expectedVolleyThreads);
    expect(volleyJob.script).toBe(XP_SCRIPTS.weaken);
  });

  it('greedy fill-first-host packing: the first host assigned to a target absorbs as much of the volley as it can afford before the next host contributes', () => {
    const weakenRam = RAM_COSTS[XP_SCRIPTS.weaken];
    const volleyNeeded = Math.ceil((30 / 0.05) * 1.1); // gap 30 -> 660 threads
    const firstHostThreads = 100; // affordable by h1, less than the full volley
    const hosts = [
      { hostname: 'h1', freeRam: firstHostThreads * weakenRam }, // exactly enough for 100 volley threads, nothing left over
      { hostname: 'h2', freeRam: 100_000 }, // absorbs the volley remainder, then holds on the rest
    ];
    const targets = [{ server: 'hot', sec: 40, minSec: 10, crushOk: true }]; // gap 30
    const { jobs, volleyThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(volleyThreads).toBe(volleyNeeded);
    const h1Volley = jobs.find((j) => j.hostname === 'h1' && j.kind === 'volley');
    const h2Volley = jobs.find((j) => j.hostname === 'h2' && j.kind === 'volley');
    expect(h1Volley.threads).toBe(firstHostThreads);
    expect(h2Volley.threads).toBe(volleyNeeded - firstHostThreads);
    // h1 had nothing left over for hold; h2 does (its volley slice was a small fraction of 100_000 GB)
    expect(jobs.some((j) => j.hostname === 'h1' && j.kind === 'hold')).toBe(false);
    expect(jobs.some((j) => j.hostname === 'h2' && j.kind === 'hold')).toBe(true);
    expect(jobs.some((j) => j.hostname === 'h2' && j.script === XP_SCRIPTS.hack)).toBe(true);
  });

  it('a crush-wait target (crushOk: false) over the gap gets no volley, a full-wave-sized stream, no hack wave (its capacity falls through to overflow)', () => {
    const hosts = [{ hostname: 'h1', freeRam: 1000 }];
    const targets = [{ server: 'hot', sec: 50, minSec: 10, crushOk: false }]; // gap 40, but cooling down
    const { jobs, volleyThreads, weakenThreads, hackThreads, overflowHackThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(volleyThreads).toBe(0);
    expect(jobs.every((j) => j.kind !== 'volley')).toBe(true);
    // stream sized to the FULL wave (2500), not peeked -- over-gap targets get no hack wave this pass
    const expectedStream = Math.ceil(HOLD_HACK_WAVE * 0.05); // 125
    expect(weakenThreads).toBe(expectedStream);
    expect(jobs.some((j) => j.kind === 'hold' && j.script === XP_SCRIPTS.weaken)).toBe(true);
    expect(jobs.some((j) => j.script === XP_SCRIPTS.hack && j.kind !== 'overflow')).toBe(false);
    // this target is also targets[0] -- its capped capacity falls through to overflow
    expect(overflowHackThreads).toBeGreaterThan(0);
    expect(hackThreads).toBe(overflowHackThreads); // no capped-wave hack, only overflow
  });

  it('a partial volley launches what fits when the fleet cannot cover the full sized volley', () => {
    const weakenRam = RAM_COSTS[XP_SCRIPTS.weaken];
    const volleyNeeded = Math.ceil((30 / 0.05) * 1.1); // 660 threads
    const hosts = [{ hostname: 'h1', freeRam: 50 * weakenRam }]; // only affords 50 -- far short of 660
    const targets = [{ server: 'hot', sec: 40, minSec: 10, crushOk: true }];
    const { jobs, volleyThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(volleyThreads).toBe(50);
    expect(volleyThreads).toBeLessThan(volleyNeeded);
    expect(jobs).toEqual([{ hostname: 'h1', script: XP_SCRIPTS.weaken, threads: 50, target: 'hot', kind: 'volley' }]);
  });

  it('volley and hold coexist on the volley host\'s leftover slice (leftover falls through to this lone target\'s overflow)', () => {
    const weakenRam = RAM_COSTS[XP_SCRIPTS.weaken];
    const volleyNeeded = Math.ceil((6 / 0.05) * 1.1); // gap 6 (just over crushSecGap 5) -> 132 threads
    const hosts = [{ hostname: 'h1', freeRam: volleyNeeded * weakenRam + 1000 }]; // volley fits with plenty left over
    const targets = [{ server: 'hot', sec: 16, minSec: 10, crushOk: true }];
    const { jobs, volleyThreads, hackThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(volleyThreads).toBe(volleyNeeded);
    expect(jobs.some((j) => j.kind === 'volley')).toBe(true);
    expect(jobs.some((j) => j.kind === 'hold' && j.script === XP_SCRIPTS.weaken)).toBe(true);
    expect(hackThreads).toBeGreaterThan(0);
  });

  // --- S9: bounded held waves, wave-sized streams, overflow absorber -----

  const OPTS_NO_OVERFLOW = { ...OPTS, overflowEnabled: false };

  it('cross-host wave cap: a huge host + a second host still sum to <= holdHackWave (2500) hack threads for one target per pass', () => {
    const hackRam = RAM_COSTS[XP_SCRIPTS.hack];
    const hosts = [
      { hostname: 'h1', freeRam: 1500 * hackRam }, // affords 1500 of the 2500-thread wave -- forces spillover
      { hostname: 'h2', freeRam: 1_000_000 }, // absorbs the rest
    ];
    const targets = [{ server: 't', sec: 10, minSec: 10, crushOk: true }]; // gap 0
    const { jobs, hackThreads, weakenThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS_NO_OVERFLOW);
    expect(hackThreads).toBe(HOLD_HACK_WAVE);
    expect(weakenThreads).toBe(Math.ceil(HOLD_HACK_WAVE * 0.05)); // stream sized to the full wave (abundant pool)
    const hackJobs = jobs.filter((j) => j.script === XP_SCRIPTS.hack);
    expect(hackJobs.reduce((sum, j) => sum + j.threads, 0)).toBe(HOLD_HACK_WAVE);
    expect(new Set(hackJobs.map((j) => j.hostname))).toEqual(new Set(['h1', 'h2'])); // spans both hosts
  });

  it('stream sizing for a RAM-starved partial wave is based on the wave PLANNED before the stream consumes anything (point 3), not the final landed count', () => {
    const hackRam = RAM_COSTS[XP_SCRIPTS.hack];
    const hosts = [{ hostname: 'h1', freeRam: 1000 * hackRam }]; // caps the peeked wave at exactly 1000, well under 2500
    const targets = [{ server: 't', sec: 10, minSec: 10, crushOk: true }];
    const { hackThreads, weakenThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS_NO_OVERFLOW);
    expect(weakenThreads).toBe(Math.ceil(1000 * 0.05)); // 50, sized to the 1000-thread peek
    expect(hackThreads).toBeLessThan(1000); // the stream's own footprint shaves a few threads off the peek
    expect(hackThreads).toBeGreaterThan(900);
  });

  it('an over-gap target in mode "crush" (volley firing this very pass) gets zero hack threads (reviewer B2)', () => {
    const hosts = [{ hostname: 'h1', freeRam: 1_000_000 }];
    const targets = [{ server: 'hot', sec: 50, minSec: 10, crushOk: true }]; // gap 40 -- volley fires
    const { jobs, volleyThreads, hackThreads, weakenThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS_NO_OVERFLOW);
    const expectedVolley = Math.ceil((40 / 0.05) * 1.1); // 880
    expect(volleyThreads).toBe(expectedVolley);
    expect(hackThreads).toBe(0);
    expect(weakenThreads).toBe(expectedVolley + Math.ceil(HOLD_HACK_WAVE * 0.05)); // volley + full-wave-sized stream
    expect(jobs.every((j) => j.script !== XP_SCRIPTS.hack)).toBe(true);
  });

  it('overflow absorbs the full remainder as pure hack on targets[0] only, tagged kind "overflow"; other held targets never see it', () => {
    const hosts = [{ hostname: 'h1', freeRam: 10_000_000 }];
    const targets = [
      { server: 'top', sec: 10, minSec: 10, crushOk: true },
      { server: 'second', sec: 10, minSec: 10, crushOk: true },
    ];
    const { jobs, hackThreads, overflowHackThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    const overflowJobs = jobs.filter((j) => j.kind === 'overflow');
    expect(overflowJobs.length).toBeGreaterThan(0);
    expect(overflowJobs.every((j) => j.target === 'top')).toBe(true);
    expect(jobs.some((j) => j.target === 'second' && j.kind === 'overflow')).toBe(false);
    expect(overflowHackThreads).toBeGreaterThan(0);
    expect(hackThreads).toBe(2 * HOLD_HACK_WAVE + overflowHackThreads); // both targets' capped waves + overflow
  });

  it('overflowEnabled: false leaves the remainder unspent -- exactly the two capped waves, nothing more', () => {
    const hosts = [{ hostname: 'h1', freeRam: 10_000_000 }];
    const targets = [
      { server: 'top', sec: 10, minSec: 10, crushOk: true },
      { server: 'second', sec: 10, minSec: 10, crushOk: true },
    ];
    const { jobs, hackThreads, overflowHackThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS_NO_OVERFLOW);
    expect(overflowHackThreads).toBe(0);
    expect(jobs.some((j) => j.kind === 'overflow')).toBe(false);
    expect(hackThreads).toBe(2 * HOLD_HACK_WAVE);
  });

  it('small-pool degenerate case: held demand consumes the pool exactly, overflow is 0', () => {
    const hackRam = RAM_COSTS[XP_SCRIPTS.hack];
    const weakenRam = RAM_COSTS[XP_SCRIPTS.weaken];
    const streamThreads = Math.ceil(HOLD_HACK_WAVE * 0.05); // 125
    const hosts = [{ hostname: 'h1', freeRam: streamThreads * weakenRam + HOLD_HACK_WAVE * hackRam }]; // exact fit
    const targets = [{ server: 't', sec: 10, minSec: 10, crushOk: true }];
    const { hackThreads, weakenThreads, overflowHackThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(hackThreads).toBe(HOLD_HACK_WAVE);
    expect(weakenThreads).toBe(streamThreads);
    expect(overflowHackThreads).toBe(0);
  });

  it('single-eligible-target case: it is both the absorber and its own held demand -- no special-casing needed', () => {
    const hosts = [{ hostname: 'h1', freeRam: 1_000_000 }];
    const targets = [{ server: 'solo', sec: 10, minSec: 10, crushOk: true }];
    const { jobs, weakenThreads, overflowHackThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    const cappedHackThreads = jobs.filter((j) => j.script === XP_SCRIPTS.hack && j.kind !== 'overflow').reduce((sum, j) => sum + j.threads, 0);
    expect(cappedHackThreads).toBe(HOLD_HACK_WAVE);
    expect(weakenThreads).toBe(Math.ceil(HOLD_HACK_WAVE * 0.05));
    expect(overflowHackThreads).toBeGreaterThan(0);
    expect(jobs.filter((j) => j.kind === 'overflow').every((j) => j.target === 'solo')).toBe(true);
  });

  it('volley takes precedence over stream/wave/overflow on a tight host sized exactly for the volley', () => {
    const weakenRam = RAM_COSTS[XP_SCRIPTS.weaken];
    const volleyNeeded = Math.ceil((30 / 0.05) * 1.1); // 660 threads, gap 30
    const hosts = [{ hostname: 'h1', freeRam: volleyNeeded * weakenRam }]; // exactly enough for the volley, nothing more
    const targets = [{ server: 'hot', sec: 40, minSec: 10, crushOk: true }];
    const { jobs, volleyThreads, weakenThreads, hackThreads, overflowHackThreads } = planXpJobs(hosts, targets, RAM_COSTS, OPTS);
    expect(jobs).toEqual([{ hostname: 'h1', script: XP_SCRIPTS.weaken, threads: volleyNeeded, target: 'hot', kind: 'volley' }]);
    expect(volleyThreads).toBe(volleyNeeded);
    expect(weakenThreads).toBe(volleyNeeded);
    expect(hackThreads).toBe(0);
    expect(overflowHackThreads).toBe(0);
  });
});
