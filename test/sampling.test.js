// Legacy-parity net for Phase 4's code move (spec: migration step (a)/(b)),
// plus the formulas-branch tests added in migration step (c).
//
// The mock ns does NOT imitate game formulas -- it returns canned,
// deterministic numbers chosen so every ceil() lands far from a float
// boundary. Parity means "same code path, same outputs," not "matches the
// game." Goldens below are hand-computed from the canned values.
import { describe, it, expect } from 'vitest';
import {
  sampleBatchFields,
  samplePrepFields,
  countInFlightThreads,
  inFlightByTarget,
  steadyStatePlan,
  hasFormulas,
  isForcedLegacy,
  crossCheckFormulas,
} from '../src/sampling.js';
import { SHARE_SCRIPT } from '../src/scheduler.js';

// --- mock ns -----------------------------------------------------------

/**
 * Builds a mock ns with canned analysis returns, recording call arguments
 * so tests can assert what the samplers passed (e.g. that the legacy branch
 * passes the server to hackAnalyzeSecurity -- behavior frozen per spec).
 *
 * The formulas-branch surface (getServer/getPlayer/formulas.hacking.*) is
 * present even in legacy-mode tests, with its own canned values distinct
 * from the legacy mocks' -- this lets the airtight-gate tests assert it was
 * never touched when useFormulas is false, and lets formulas-branch tests
 * prove the right branch ran by checking for its distinct output.
 */
function makeMockNs(overrides = {}) {
  const calls = {
    hackAnalyzeSecurity: [],
    growthAnalyze: [],
    growthAnalyzeSecurity: [],
    hackPercent: [],
    formulasGrowThreads: [],
    formulasWeakenTime: [],
    formulasHackChance: [],
    getServer: [],
    getPlayer: [],
  };
  const ns = {
    calls,
    hackAnalyze: () => 0.02, // fraction stolen per thread
    hackAnalyzeSecurity: (threads, server) => {
      calls.hackAnalyzeSecurity.push([threads, server]);
      return threads * 0.002;
    },
    // Canned constant (not a function of multiplier): keeps the golden
    // grow-thread ceil() away from float dust; the multiplier itself is
    // asserted via calls.growthAnalyze.
    growthAnalyze: (server, multiplier) => {
      calls.growthAnalyze.push([server, multiplier]);
      return 38;
    },
    growthAnalyzeSecurity: (threads, server) => {
      calls.growthAnalyzeSecurity.push([threads, server]);
      return threads * 0.004;
    },
    weakenAnalyze: (threads) => threads * 0.5,
    getHackTime: () => 1000,
    getGrowTime: () => 3200,
    getWeakenTime: () => 4000,
    getServerSecurityLevel: () => 8,
    getServerMoneyAvailable: () => 250_000,
    hackAnalyzeChance: () => 0.75,
    ps: () => [],
    getServer: () => {
      calls.getServer.push(true);
      return { hackDifficulty: 8, minDifficulty: 5, moneyAvailable: 250_000, moneyMax: 1_000_000 };
    },
    getPlayer: () => {
      calls.getPlayer.push(true);
      return {};
    },
    fileExists: () => false,
    formulas: {
      hacking: {
        hackPercent: (server, player) => {
          calls.hackPercent.push([server, player]);
          return 0.06;
        },
        growThreads: (server, player, targetMoney) => {
          calls.formulasGrowThreads.push([server, player, targetMoney]);
          return 60;
        },
        weakenTime: (server, player) => {
          calls.formulasWeakenTime.push([server, player]);
          return 5000;
        },
        hackChance: (server, player) => {
          calls.formulasHackChance.push([server, player]);
          return 0.95;
        },
      },
    },
    ...overrides,
  };
  return ns;
}

const HOSTS = [{ hostname: 'home' }, { hostname: 'pserv-0' }];

// ps fixture: 10 weaken threads and 5 grow threads in flight against
// joesguns (split across hosts), plus decoys that must NOT be counted
// (other target, hack.js, unrelated script).
function inFlightPs(hostname) {
  const byHost = {
    home: [
      { filename: 'weaken.js', args: ['joesguns'], threads: 6 },
      { filename: 'grow.js', args: ['joesguns'], threads: 5 },
      { filename: 'weaken.js', args: ['n00dles'], threads: 99 }, // wrong target
      { filename: 'daemon.js', args: [], threads: 1 }, // unrelated
    ],
    'pserv-0': [
      { filename: 'weaken.js', args: ['joesguns'], threads: 4 },
      { filename: 'hack.js', args: ['joesguns'], threads: 7 }, // wrong script
    ],
  };
  return byHost[hostname] ?? [];
}

// 2 weaken / 5 grow in flight against joesguns, home only -- used by the
// samplePrepFields goldens below (both legacy and formulas).
function prepInFlightPs(hostname) {
  return hostname === 'home'
    ? [
        { filename: 'weaken.js', args: ['joesguns'], threads: 2 },
        { filename: 'grow.js', args: ['joesguns'], threads: 5 },
      ]
    : [];
}

// --- countInFlightThreads ----------------------------------------------

describe('countInFlightThreads', () => {
  it('sums threads across hosts, filtered by script and target', () => {
    const ns = makeMockNs({ ps: inFlightPs });
    expect(countInFlightThreads(ns, HOSTS, 'joesguns', 'weaken.js')).toBe(10);
    expect(countInFlightThreads(ns, HOSTS, 'joesguns', 'grow.js')).toBe(5);
    expect(countInFlightThreads(ns, HOSTS, 'joesguns', 'hack.js')).toBe(7);
    expect(countInFlightThreads(ns, HOSTS, 'nowhere', 'weaken.js')).toBe(0);
  });
});

// --- inFlightByTarget ----------------------------------------------------

describe('inFlightByTarget', () => {
  // 3 hosts (one idle), multiple real targets, a weaken-only target (proves
  // batches:0 with no hack.js present), and a non-worker decoy process.
  const MULTI_TARGET_HOSTS = [{ hostname: 'home' }, { hostname: 'pserv-0' }, { hostname: 'pserv-1' }];
  function multiTargetPs(hostname) {
    const byHost = {
      home: [
        { filename: 'hack.js', args: ['joesguns'], threads: 3 },
        { filename: 'grow.js', args: ['joesguns'], threads: 2 },
        { filename: 'weaken.js', args: ['n00dles'], threads: 5 },
        { filename: 'daemon.js', args: [], threads: 1 }, // non-worker decoy -- must be fully ignored
      ],
      'pserv-0': [
        { filename: 'hack.js', args: ['harakiri-sushi'], threads: 4 },
        { filename: 'weaken.js', args: ['harakiri-sushi'], threads: 6 },
        { filename: 'grow.js', args: ['joesguns'], threads: 1 },
      ],
      'pserv-1': [], // idle host
    };
    return byHost[hostname] ?? [];
  }
  const RAM_COSTS = { 'hack.js': 1.6, 'grow.js': 1.75, 'weaken.js': 1.75 };

  it('attributes RAM by filename x threads across hosts, per target', () => {
    const ns = makeMockNs({ ps: multiTargetPs });
    const result = inFlightByTarget(ns, MULTI_TARGET_HOSTS, RAM_COSTS);
    // joesguns: hack.js(home,3)=4.8 + grow.js(home,2)=3.5 + grow.js(pserv-0,1)=1.75
    expect(result.byTarget.joesguns.ramGb).toBeCloseTo(10.05);
    // harakiri-sushi: hack.js(pserv-0,4)=6.4 + weaken.js(pserv-0,6)=10.5
    expect(result.byTarget['harakiri-sushi'].ramGb).toBeCloseTo(16.9);
    // n00dles: weaken.js(home,5)=8.75
    expect(result.byTarget.n00dles.ramGb).toBeCloseTo(8.75);
  });

  it('counts batches via hack.js occurrences only', () => {
    const ns = makeMockNs({ ps: multiTargetPs });
    const result = inFlightByTarget(ns, MULTI_TARGET_HOSTS, RAM_COSTS);
    expect(result.byTarget.joesguns.batches).toBe(1);
    expect(result.byTarget['harakiri-sushi'].batches).toBe(1);
    expect(result.byTarget.n00dles.batches).toBe(0); // weaken-only, no hack.js present
  });

  it('ignores non-worker filenames entirely (no stray key, no RAM contribution)', () => {
    const ns = makeMockNs({ ps: multiTargetPs });
    const result = inFlightByTarget(ns, MULTI_TARGET_HOSTS, RAM_COSTS);
    expect(result.byTarget.undefined).toBeUndefined();
    expect(Object.keys(result.byTarget).sort()).toEqual(['harakiri-sushi', 'joesguns', 'n00dles']);
  });

  it('a target with no processes anywhere is absent from byTarget', () => {
    const ns = makeMockNs({ ps: multiTargetPs });
    const result = inFlightByTarget(ns, MULTI_TARGET_HOSTS, RAM_COSTS);
    expect(result.byTarget['nectar-net']).toBeUndefined();
  });

  it('an idle host contributes nothing (goldens above already exclude pserv-1)', () => {
    const ns = makeMockNs({ ps: multiTargetPs });
    const withIdleHost = inFlightByTarget(ns, MULTI_TARGET_HOSTS, RAM_COSTS);
    const withoutIdleHost = inFlightByTarget(ns, [{ hostname: 'home' }, { hostname: 'pserv-0' }], RAM_COSTS);
    expect(withIdleHost).toEqual(withoutIdleHost);
  });

  // --- Phase 8: share bucket ---------------------------------------------

  it('accumulates share processes into `sharePool` by filename, with thread and RAM totals, never touching byTarget', () => {
    const RAM_COSTS_WITH_SHARE = { ...RAM_COSTS, [SHARE_SCRIPT]: 4 };
    function shareAndBatchPs(hostname) {
      const byHost = {
        home: [
          { filename: 'hack.js', args: ['joesguns'], threads: 3 },
          { filename: SHARE_SCRIPT, args: [1], threads: 5 }, // args[0] is the ignored launch counter, not a target
        ],
        'pserv-0': [{ filename: SHARE_SCRIPT, args: [2], threads: 2 }],
      };
      return byHost[hostname] ?? [];
    }
    const ns = makeMockNs({ ps: shareAndBatchPs });
    const result = inFlightByTarget(ns, MULTI_TARGET_HOSTS, RAM_COSTS_WITH_SHARE);
    expect(result.sharePool).toEqual({ threads: 7, ramGb: 28 }); // (5+2) threads * 4 GB
    expect(Object.keys(result.byTarget)).toEqual(['joesguns']); // share never creates a byTarget entry
  });

  it('yields {threads: 0, ramGb: 0} for sharePool when no share processes are running', () => {
    const RAM_COSTS_WITH_SHARE = { ...RAM_COSTS, [SHARE_SCRIPT]: 4 };
    const ns = makeMockNs({ ps: multiTargetPs }); // no share.js processes present
    const result = inFlightByTarget(ns, MULTI_TARGET_HOSTS, RAM_COSTS_WITH_SHARE);
    expect(result.sharePool).toEqual({ threads: 0, ramGb: 0 });
  });
});

// --- hasFormulas / isForcedLegacy ---------------------------------------

describe('hasFormulas', () => {
  it('is true when Formulas.exe is owned and no legacy marker is present', () => {
    const ns = { fileExists: (filename) => filename === 'Formulas.exe' };
    expect(hasFormulas(ns)).toBe(true);
  });

  it('is false when the legacy-mode.txt marker is present, even with Formulas.exe owned', () => {
    const ns = { fileExists: () => true }; // both Formulas.exe and the marker "exist"
    expect(hasFormulas(ns)).toBe(false);
  });

  it('is false when neither Formulas.exe nor the marker exists', () => {
    const ns = { fileExists: () => false };
    expect(hasFormulas(ns)).toBe(false);
  });
});

describe('isForcedLegacy', () => {
  it('reflects only the marker file, independent of Formulas.exe', () => {
    expect(isForcedLegacy({ fileExists: (f) => f === 'legacy-mode.txt' })).toBe(true);
    expect(isForcedLegacy({ fileExists: () => false })).toBe(false);
  });
});

// --- sampleBatchFields (legacy golden) -----------------------------------

describe('sampleBatchFields', () => {
  const target = { server: 'joesguns', minSecurityLevel: 5, maxMoney: 1_000_000 };

  it('golden: thread counts and durations from the canned mock', () => {
    // Hand-computed from the mock:
    //   hackThreads   = ceil(0.25 / 0.02)            = 13
    //   hackSecAdded  = 13 * 0.002                   = 0.026
    //   growMult      = 1 / (1 - 0.25)               = 4/3 (asserted below)
    //   rawGrow       = 38 (canned)
    //   growThreads   = ceil(38 * GROW_BUFFER 1.25)  = 48
    //   growSecAdded  = 48 * 0.004                   = 0.192
    //   weaken1       = ceil(0.026 * 1.1 / 0.5)      = 1
    //   weaken2       = ceil(0.192 * 1.1 / 0.5)      = 1  -> 0.4224 rounds up
    //   steadyWeakenTime = weakenTime (copied, legacy branch)
    const ns = makeMockNs();
    expect(sampleBatchFields(ns, target, 0.25)).toEqual({
      server: 'joesguns',
      hackThreads: 13,
      growThreads: 48,
      weaken1Threads: 1,
      weaken2Threads: 1,
      hackTime: 1000,
      growTime: 3200,
      weakenTime: 4000,
      steadyWeakenTime: 4000,
    });
  });

  it('legacy branch passes the server to hackAnalyzeSecurity (behavior frozen)', () => {
    const ns = makeMockNs();
    sampleBatchFields(ns, target, 0.25);
    expect(ns.calls.hackAnalyzeSecurity).toEqual([[13, 'joesguns']]);
  });

  it('derives the grow multiplier from the requested fraction, not the ceiled threads', () => {
    const ns = makeMockNs();
    sampleBatchFields(ns, target, 0.25);
    expect(ns.calls.growthAnalyze).toHaveLength(1);
    expect(ns.calls.growthAnalyze[0][0]).toBe('joesguns');
    expect(ns.calls.growthAnalyze[0][1]).toBeCloseTo(4 / 3, 12);
  });

  it('sizes weaken2 off the BUFFERED grow count', () => {
    const ns = makeMockNs();
    sampleBatchFields(ns, target, 0.25);
    expect(ns.calls.growthAnalyzeSecurity).toEqual([[48, 'joesguns']]);
  });

  it('returns null when the target is unhackable this tick', () => {
    const ns = makeMockNs({ hackAnalyze: () => 0 });
    expect(sampleBatchFields(ns, target, 0.25)).toBeNull();
  });

  it('never touches the formulas surface when useFormulas is false (airtight gate)', () => {
    const ns = makeMockNs();
    sampleBatchFields(ns, target, 0.25, false);
    expect(ns.calls.hackPercent).toHaveLength(0);
    expect(ns.calls.formulasGrowThreads).toHaveLength(0);
    expect(ns.calls.formulasWeakenTime).toHaveLength(0);
    expect(ns.calls.getServer).toHaveLength(0);
    expect(ns.calls.getPlayer).toHaveLength(0);
  });

  it('defaults to legacy when useFormulas is omitted', () => {
    const ns = makeMockNs();
    expect(sampleBatchFields(ns, target, 0.25)).toEqual(sampleBatchFields(makeMockNs(), target, 0.25, false));
  });
});

// --- sampleBatchFields (formulas golden) ----------------------------------

describe('sampleBatchFields (formulas branch)', () => {
  const target = { server: 'joesguns', minSecurityLevel: 5, maxMoney: 1_000_000 };

  it('golden: thread counts and durations from distinct canned formulas.hacking values', () => {
    // Hand-computed from the mock (hackPercent 0.06, formulas growThreads 60,
    // formulas weakenTime 5000 -- all distinct from the legacy mock's
    // hackAnalyze 0.02 / growthAnalyze 38 / getWeakenTime 4000):
    //   hackThreads      = ceil(0.25 / 0.06)              = 5
    //   hackSecAdded     = hackAnalyzeSecurity(5)         = 0.01 (no host arg)
    //   postHackMoney    = max(1, 1e6 * (1 - 5*0.06))     = 700,000
    //   rawGrow          = 60 (canned)
    //   growThreads      = ceil(60 * GROW_BUFFER 1.25)    = 75
    //   growSecAdded     = growthAnalyzeSecurity(75, ...) = 0.3
    //   weaken1          = ceil(0.01 * 1.1 / 0.5)         = 1
    //   weaken2          = ceil(0.3 * 1.1 / 0.5)          = 1  -> 0.66 rounds up
    //   steadyWeakenTime = formulas.hacking.weakenTime(...)= 5000
    const ns = makeMockNs();
    expect(sampleBatchFields(ns, target, 0.25, true)).toEqual({
      server: 'joesguns',
      hackThreads: 5,
      growThreads: 75,
      weaken1Threads: 1,
      weaken2Threads: 1,
      hackTime: 1000,
      growTime: 3200,
      weakenTime: 4000,
      steadyWeakenTime: 5000,
    });
  });

  it('omits the host arg from hackAnalyzeSecurity (review finding: thread-math, not state-math)', () => {
    const ns = makeMockNs();
    sampleBatchFields(ns, target, 0.25, true);
    expect(ns.calls.hackAnalyzeSecurity).toEqual([[5, undefined]]);
  });

  it('still passes the host to growthAnalyzeSecurity (unchanged, no formulas branch for this call)', () => {
    const ns = makeMockNs();
    sampleBatchFields(ns, target, 0.25, true);
    expect(ns.calls.growthAnalyzeSecurity).toEqual([[75, 'joesguns']]);
  });

  it('builds the prepped-state server at min security / max money for hackPercent and steadyWeakenTime', () => {
    const ns = makeMockNs();
    sampleBatchFields(ns, target, 0.25, true);
    const preppedServer = { hackDifficulty: 5, minDifficulty: 5, moneyAvailable: 1_000_000, moneyMax: 1_000_000 };
    expect(ns.calls.hackPercent[0][0]).toEqual(preppedServer);
    expect(ns.calls.formulasWeakenTime[0][0]).toEqual(preppedServer);
  });

  it('builds the grow-landing state at min security / post-hack money, targeting maxMoney', () => {
    const ns = makeMockNs();
    sampleBatchFields(ns, target, 0.25, true);
    expect(ns.calls.formulasGrowThreads[0][0]).toEqual({
      hackDifficulty: 5,
      minDifficulty: 5,
      moneyAvailable: 700_000, // maxMoney * (1 - hackThreads(5) * hackPercent(0.06))
      moneyMax: 1_000_000,
    });
    expect(ns.calls.formulasGrowThreads[0][2]).toBe(1_000_000); // targetMoney = maxMoney
  });

  it('clamps postHackMoney at $1 for an extreme per-thread steal (review finding)', () => {
    const ns = makeMockNs({
      formulas: {
        hacking: {
          hackPercent: () => 1.5, // canned extreme: threads(1) * percent(1.5) > 1
          growThreads: (server) => {
            expect(server.moneyAvailable).toBe(1); // clamped, not negative
            return 60;
          },
          weakenTime: () => 5000,
        },
      },
    });
    expect(sampleBatchFields(ns, target, 0.25, true)).not.toBeNull();
  });

  it('returns null when hackPercent is 0 (unhackable this tick)', () => {
    const ns = makeMockNs({
      formulas: { hacking: { hackPercent: () => 0, growThreads: () => 60, weakenTime: () => 5000 } },
    });
    expect(sampleBatchFields(ns, target, 0.25, true)).toBeNull();
  });
});

// --- samplePrepFields (legacy golden) ------------------------------------

describe('samplePrepFields', () => {
  const target = {
    server: 'joesguns',
    minSecurityLevel: 5,
    maxMoney: 1_000_000,
    growTime: 3200,
    weakenTime: 4000,
  };

  it('golden: drifted target with in-flight discounts', () => {
    // Mock state: security 8 (gap 3), money 250k of 1M. In flight: 2 weaken,
    // 5 grow.
    //   rawWeakenForGap  = ceil(3 / 0.5)   = 6
    //   weakenForGap     = 6 - 2 in flight = 4
    //   growMult         = 1M / 250k       = 4 (asserted below)
    //   rawGrow          = ceil(mult * 10) = 40   (canned: mult * 10)
    //   growThreads      = 40 - 5 in flight = 35
    //   growSecAdded     = 35 * 0.004      = 0.14
    //   leftover weaken  = max(0, 2 - 6)   = 0
    //   weakenForGrow    = ceil(0.14 / 0.5) = 1
    const ns = makeMockNs({
      growthAnalyze: (server, multiplier) => multiplier * 10,
      ps: prepInFlightPs,
    });
    expect(samplePrepFields(ns, HOSTS, target)).toEqual({
      server: 'joesguns',
      growThreads: 35,
      weakenThreadsForGap: 4,
      weakenThreadsForGrow: 1,
      growTime: 3200,
      weakenTime: 4000,
      currentSecurity: 8,
      currentMoney: 250_000,
    });
  });

  it('credits surplus in-flight weaken to the grow counter-weaken', () => {
    // 10 weaken in flight vs 6 needed for the gap: gap goes to 0 and the
    // leftover 4 swallows the grow counter-weaken (needs only 1).
    const ns = makeMockNs({
      growthAnalyze: (server, multiplier) => multiplier * 10,
      ps: (hostname) => (hostname === 'home' ? [{ filename: 'weaken.js', args: ['joesguns'], threads: 10 }] : []),
    });
    const fields = samplePrepFields(ns, HOSTS, target);
    expect(fields.weakenThreadsForGap).toBe(0);
    expect(fields.weakenThreadsForGrow).toBe(0);
    expect(fields.growThreads).toBe(40); // no grow in flight this time -- full 40
  });

  it('returns all zeros for a prepped target', () => {
    const ns = makeMockNs({
      getServerSecurityLevel: () => 5,
      getServerMoneyAvailable: () => 1_000_000,
    });
    const fields = samplePrepFields(ns, HOSTS, target);
    expect(fields.growThreads).toBe(0);
    expect(fields.weakenThreadsForGap).toBe(0);
    expect(fields.weakenThreadsForGrow).toBe(0);
  });

  it('floors current money at $1 so a drained target gets a finite multiplier', () => {
    const ns = makeMockNs({
      getServerMoneyAvailable: () => 0,
      growthAnalyze: (server, multiplier) => {
        ns.calls.growthAnalyze.push([server, multiplier]);
        return 100;
      },
    });
    samplePrepFields(ns, HOSTS, target);
    // Without the floor this would be Infinity; with it, exactly 1M / 1.
    expect(ns.calls.growthAnalyze).toEqual([['joesguns', 1_000_000]]);
  });

  it('never touches the formulas surface when useFormulas is false (airtight gate)', () => {
    const ns = makeMockNs({ ps: prepInFlightPs });
    samplePrepFields(ns, HOSTS, target, false);
    expect(ns.calls.formulasGrowThreads).toHaveLength(0);
    expect(ns.calls.getServer).toHaveLength(0);
    expect(ns.calls.getPlayer).toHaveLength(0);
  });
});

// --- samplePrepFields (formulas golden) -----------------------------------

describe('samplePrepFields (formulas branch)', () => {
  const target = {
    server: 'joesguns',
    minSecurityLevel: 5,
    maxMoney: 1_000_000,
    growTime: 3200,
    weakenTime: 4000,
  };

  it('golden: exact inverse from current money via formulas.hacking.growThreads', () => {
    // Same drifted state as the legacy golden (security 8, money 250k, 2
    // weaken / 5 grow in flight), but rawGrow comes from the canned formulas
    // mock (60) instead of legacy's multiplier*10 (40) -- proves the branch:
    //   growThreads      = 60 - 5 in flight = 55
    //   growSecAdded     = 55 * 0.004       = 0.22
    //   weakenForGrow    = ceil(0.22 / 0.5) = 1
    // weakenThreadsForGap is unaffected by mode (weaken math has no formulas
    // branch anywhere), so it matches the legacy golden's 4.
    const ns = makeMockNs({ ps: prepInFlightPs });
    expect(samplePrepFields(ns, HOSTS, target, true)).toEqual({
      server: 'joesguns',
      growThreads: 55,
      weakenThreadsForGap: 4,
      weakenThreadsForGrow: 1,
      growTime: 3200,
      weakenTime: 4000,
      currentSecurity: 8,
      currentMoney: 250_000,
    });
  });

  it('floors current money at $1 on the copied server object (resolved: same defensive style as legacy)', () => {
    const ns = makeMockNs({ getServerMoneyAvailable: () => 0, ps: prepInFlightPs });
    samplePrepFields(ns, HOSTS, target, true);
    // Without the floor this would be moneyAvailable: 0; with it, exactly $1.
    expect(ns.calls.formulasGrowThreads[0][0].moneyAvailable).toBe(1);
    expect(ns.calls.formulasGrowThreads[0][2]).toBe(1_000_000); // targetMoney = maxMoney
  });
});

// --- steadyStatePlan (ranking inputs, legacy golden) ----------------------

describe('steadyStatePlan', () => {
  const target = { server: 'joesguns', minSecurityLevel: 5, maxMoney: 1_000_000 };

  it('golden: unbuffered combined-weaken estimate from the canned mock', () => {
    // Hand-computed from the mock (HACK_FRACTION 0.25):
    //   hackThreads   = ceil(0.25 / 0.02)             = 13
    //   growThreads   = ceil(38)                      = 38   (no GROW_BUFFER -- ranking is unbuffered)
    //   securityAdded = 13*0.002 + 38*0.004           = 0.178
    //   weakenThreads = ceil(0.178 / 0.5)             = 1
    const ns = makeMockNs();
    expect(steadyStatePlan(ns, target)).toEqual({
      hackThreads: 13,
      growThreads: 38,
      weakenThreads: 1,
      weakenTime: 4000,
      hackChance: 0.75,
    });
  });

  it('returns null when the target is unhackable this tick', () => {
    const ns = makeMockNs({ hackAnalyze: () => 0 });
    expect(steadyStatePlan(ns, target)).toBeNull();
  });

  it('never touches the formulas surface when useFormulas is false (airtight gate)', () => {
    const ns = makeMockNs();
    steadyStatePlan(ns, target, false);
    expect(ns.calls.hackPercent).toHaveLength(0);
    expect(ns.calls.formulasGrowThreads).toHaveLength(0);
    expect(ns.calls.formulasWeakenTime).toHaveLength(0);
    expect(ns.calls.formulasHackChance).toHaveLength(0);
    expect(ns.calls.getServer).toHaveLength(0);
    expect(ns.calls.getPlayer).toHaveLength(0);
  });
});

// --- steadyStatePlan (ranking inputs, formulas golden) --------------------

describe('steadyStatePlan (formulas branch)', () => {
  const target = { server: 'joesguns', minSecurityLevel: 5, maxMoney: 1_000_000 };

  it('golden: scores the prepped state via distinct canned formulas.hacking values', () => {
    // Same hackThreads/hackSecAdded as sampleBatchFields's formulas golden
    // (hackPercent 0.06, HACK_FRACTION 0.25), but growThreads has no
    // GROW_BUFFER applied (unbuffered ranking estimate, legacy parity):
    //   hackThreads   = ceil(0.25 / 0.06)   = 5
    //   hackSecAdded  = hackAnalyzeSecurity(5) = 0.01 (no host arg)
    //   growThreads   = max(1, 60 canned)   = 60   (formulas growThreads already an integer)
    //   growSecAdded  = 60 * 0.004          = 0.24
    //   securityAdded = 0.01 + 0.24         = 0.25
    //   weakenThreads = ceil(0.25 / 0.5)    = 1
    const ns = makeMockNs();
    expect(steadyStatePlan(ns, target, true)).toEqual({
      hackThreads: 5,
      growThreads: 60,
      weakenThreads: 1,
      weakenTime: 5000,
      hackChance: 0.95,
    });
  });

  it('scores hackChance and weakenTime at the prepped (min security, max money) state', () => {
    const ns = makeMockNs();
    steadyStatePlan(ns, target, true);
    const preppedServer = { hackDifficulty: 5, minDifficulty: 5, moneyAvailable: 1_000_000, moneyMax: 1_000_000 };
    expect(ns.calls.formulasHackChance[0][0]).toEqual(preppedServer);
    expect(ns.calls.formulasWeakenTime[0][0]).toEqual(preppedServer);
  });

  it('returns null when hackPercent is 0 (unhackable this tick)', () => {
    const ns = makeMockNs({
      formulas: { hacking: { hackPercent: () => 0, growThreads: () => 60, weakenTime: () => 5000, hackChance: () => 0.95 } },
    });
    expect(steadyStatePlan(ns, target, true)).toBeNull();
  });
});

// --- crossCheckFormulas (runtime canary) ----------------------------------

describe('crossCheckFormulas', () => {
  const target = { server: 'joesguns', minSecurityLevel: 5, maxMoney: 1_000_000 };

  // Deliberately real-looking (not prepped) current state, with legacy and
  // formulas mocks agreeing by default -- individual tests override one
  // side to prove a specific mismatch gets caught. Money at 500k (50% of
  // max) sits below DRIFT_MONEY_FRACTION (90%), so needsGrow is true and the
  // soft grow comparison runs by default too.
  function makeCrossCheckNs(formulasOverrides = {}) {
    return {
      getPlayer: () => ({}),
      getServer: () => ({ hackDifficulty: 30, minDifficulty: 5, moneyAvailable: 500_000, moneyMax: 1_000_000 }),
      getServerMoneyAvailable: () => 500_000,
      getHackTime: () => 1000,
      getGrowTime: () => 3200,
      getWeakenTime: () => 4000,
      hackAnalyze: () => 0.02,
      hackAnalyzeChance: () => 0.75,
      growthAnalyze: () => 38,
      formulas: {
        hacking: {
          hackTime: () => 1000,
          growTime: () => 3200,
          weakenTime: () => 4000,
          hackPercent: () => 0.02,
          hackChance: () => 0.75,
          growThreads: () => 38,
          ...formulasOverrides,
        },
      },
    };
  }

  it('returns no mismatches when formulas agrees with legacy within tolerance', () => {
    const ns = makeCrossCheckNs();
    expect(crossCheckFormulas(ns, target)).toEqual([]);
  });

  it('flags a hard mismatch when a formulas duration diverges beyond ~0.1%', () => {
    const ns = makeCrossCheckNs({ hackTime: () => 2000 });
    expect(crossCheckFormulas(ns, target)).toEqual([{ field: 'hackTime', legacy: 1000, formulas: 2000, soft: false }]);
  });

  it('flags a hard mismatch on hackPercent/hackChance divergence too', () => {
    const ns = makeCrossCheckNs({ hackPercent: () => 0.05, hackChance: () => 0.9 });
    const mismatches = crossCheckFormulas(ns, target);
    expect(mismatches).toContainEqual({ field: 'hackPercent', legacy: 0.02, formulas: 0.05, soft: false });
    expect(mismatches).toContainEqual({ field: 'hackChance', legacy: 0.75, formulas: 0.9, soft: false });
  });

  it('flags a soft growThreads mismatch past the 2x bound (review finding)', () => {
    const ns = makeCrossCheckNs({ growThreads: () => 100 }); // 100/38 ~2.6x
    expect(crossCheckFormulas(ns, target)).toEqual([{ field: 'growThreads', legacy: 38, formulas: 100, soft: true }]);
  });

  it('does not flag growThreads within the 2x bound', () => {
    const ns = makeCrossCheckNs({ growThreads: () => 50 }); // 50/38 ~1.3x
    expect(crossCheckFormulas(ns, target)).toEqual([]);
  });

  it('skips the grow check entirely when the target does not need grow', () => {
    const ns = makeCrossCheckNs({ growThreads: () => 9999 }); // would be a huge mismatch if checked
    ns.getServerMoneyAvailable = () => 1_000_000; // fully grown -- needsGrow false
    expect(crossCheckFormulas(ns, target)).toEqual([]);
  });
});
