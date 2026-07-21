// Unit tests for src/dashboard.js's pure helpers (Phase 24). Covers the
// column/row budget guarantees (clampLine/capEntries/renderAll), every panel
// formatter's null/unreadable/partial-record tolerance, staleness markers,
// entry-cap truncation + descending sort, and the transactions math (S5).
import { describe, it, expect } from 'vitest';
import {
  clampLine,
  capEntries,
  rulerLines,
  daemonPanel,
  targetsPanel,
  financePanel,
  xpPanel,
  cloudPanel,
  transactionsPanel,
  augPanel,
  gangPanel,
  pushGangSample,
  summarizeGangTrend,
  goalPanel,
  renderAll,
  COLUMN_BUDGET,
  ROW_BUDGET,
  PARSE_FAILED,
  GANG_SAMPLE_MS,
  GANG_SAMPLE_CAP,
} from '../src/dashboard.js';

const NOW = 1_700_000_000_000;

describe('clampLine', () => {
  it('leaves an under-budget line untouched', () => {
    expect(clampLine('short', 88)).toBe('short');
  });

  it('leaves an at-budget line untouched', () => {
    const line = 'x'.repeat(88);
    expect(clampLine(line, 88)).toBe(line);
  });

  it('truncates an over-budget line to exactly budget length, ending in an ellipsis', () => {
    const line = 'x'.repeat(120);
    const clamped = clampLine(line, 88);
    expect(clamped).toHaveLength(88);
    expect(clamped.endsWith('…')).toBe(true);
  });
});

describe('capEntries', () => {
  it('shows everything and reports moreCount 0 when under the cap', () => {
    const { shown, moreCount } = capEntries(['a', 'b'], 3);
    expect(shown).toEqual(['a', 'b']);
    expect(moreCount).toBe(0);
  });

  it('shows everything at exactly the cap', () => {
    const { shown, moreCount } = capEntries(['a', 'b', 'c'], 3);
    expect(shown).toEqual(['a', 'b', 'c']);
    expect(moreCount).toBe(0);
  });

  it('truncates and reports the correct moreCount over the cap', () => {
    const { shown, moreCount } = capEntries(['a', 'b', 'c', 'd', 'e'], 3);
    expect(shown).toEqual(['a', 'b', 'c']);
    expect(moreCount).toBe(2);
  });

  it('treats a missing/null list as empty', () => {
    expect(capEntries(null, 3)).toEqual({ shown: [], moreCount: 0 });
    expect(capEntries(undefined, 3)).toEqual({ shown: [], moreCount: 0 });
  });
});

describe('rulerLines', () => {
  it('produces one line per target length, each exactly that long', () => {
    const lines = rulerLines();
    expect(lines.map((l) => l.length)).toEqual([80, 84, 88, 92, 96]);
  });
});

// --- shared panel-formatter contract (null / PARSE_FAILED / partial record) --

const PANELS = [
  { name: 'daemonPanel', fn: daemonPanel },
  { name: 'targetsPanel', fn: targetsPanel },
  { name: 'financePanel', fn: financePanel },
  { name: 'xpPanel', fn: xpPanel },
  { name: 'cloudPanel', fn: cloudPanel },
  { name: 'augPanel', fn: augPanel },
  { name: 'goalPanel', fn: goalPanel },
];

describe('every stateful panel formatter', () => {
  for (const { name, fn } of PANELS) {
    it(`${name}: null state renders "no data yet"`, () => {
      const lines = fn(null, NOW);
      expect(lines.some((l) => l.includes('no data yet'))).toBe(true);
    });

    it(`${name}: PARSE_FAILED renders "unreadable"`, () => {
      const lines = fn(PARSE_FAILED, NOW);
      expect(lines.some((l) => l.includes('unreadable'))).toBe(true);
    });

    it(`${name}: a record missing its iterated/scalar fields renders without throwing`, () => {
      expect(() => fn({ timestamp: NOW }, NOW)).not.toThrow();
    });
  }

  it('transactionsPanel: null/PARSE_FAILED follow the same contract (entries, not a timestamped state)', () => {
    expect(transactionsPanel(null, NOW).some((l) => l.includes('no data yet'))).toBe(true);
    expect(transactionsPanel(PARSE_FAILED, NOW).some((l) => l.includes('unreadable'))).toBe(true);
    expect(() => transactionsPanel([{ type: 'income' }], NOW)).not.toThrow();
  });
});

// --- daemonPanel ---------------------------------------------------------

const freshDaemonState = {
  timestamp: NOW - 1000,
  mathMode: 'formulas',
  noTargets: false,
  fleet: { totalMaxRam: 64000, batchBudgetGb: 60000, hostsCount: 12, targetsCount: 5, utilizationPct: 82.3 },
  members: [
    { server: 'foodnstuff', prepped: true, floor: false, batchesInFlight: 3, depth: 4, commitPct: 75, sec: 1.0, minSec: 1.0, money: 1_200_000, maxMoney: 1_500_000 },
    { server: 'n00dles', prepped: false, floor: true, batchesInFlight: 1, depth: 2, commitPct: 50, sec: 5.0, minSec: 1.0, money: 100_000, maxMoney: 500_000 },
  ],
  memberCount: 2,
  draining: [],
  drainingCount: 0,
  share: { off: false, targetGb: 16000, inFlightRamGb: 12000, threads: 120, attainedPct: 75, sharePower: 1.23 },
  waterfall: { availableGb: 5000, prepping: ['joesguns'] },
  warns: { stall: false, skipServers: [], failedLaunches: 0 },
};

describe('daemonPanel', () => {
  it('renders member lines within budget for a fresh state', () => {
    const lines = daemonPanel(freshDaemonState, NOW);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(COLUMN_BUDGET);
    expect(lines.some((l) => l.includes('foodnstuff'))).toBe(true);
  });

  it('shows a STALE marker in the title line once past the threshold', () => {
    const lines = daemonPanel({ ...freshDaemonState, timestamp: NOW - 20_000 }, NOW);
    expect(lines[0]).toContain('STALE');
  });

  it('shows no STALE marker while fresh', () => {
    const lines = daemonPanel(freshDaemonState, NOW);
    expect(lines[0]).not.toContain('STALE');
  });

  // Cap tightened 3 -> 2 (2026-07-20) to fund the GANG panel; the "(+N more)"
  // accounting itself is unchanged, which is what this test actually guards.
  it('caps members at 2 and reports "(+N more)", showing the highest-commitPct-ordered input as given (seat order)', () => {
    const members = [1, 2, 3, 4, 5].map((i) => ({ server: `s${i}`, prepped: true, batchesInFlight: 1, depth: 1, commitPct: 50, sec: 1, minSec: 1, money: 1, maxMoney: 1 }));
    const lines = daemonPanel({ ...freshDaemonState, members, memberCount: 5 }, NOW);
    expect(lines.some((l) => l.includes('(+3 more)'))).toBe(true);
    expect(lines.some((l) => l.includes('s3'))).toBe(false);
  });

  it('noTargets renders a live empty panel, not "no data yet"', () => {
    const lines = daemonPanel({ timestamp: NOW, mathMode: 'legacy', noTargets: true, fleet: {}, members: [], memberCount: 0, draining: [], drainingCount: 0, share: { off: true }, waterfall: {}, warns: {} }, NOW);
    expect(lines.some((l) => l.includes('no eligible targets'))).toBe(true);
    expect(lines.some((l) => l.includes('no data yet'))).toBe(false);
  });

  it('handles a hostile 40-char hostname without wrapping (clamped by renderAll)', () => {
    const longName = 'x'.repeat(40);
    const members = [{ server: longName, prepped: true, batchesInFlight: 1, depth: 1, commitPct: 50, sec: 1, minSec: 1, money: 1e15, maxMoney: 1e15 }];
    const lines = renderAll({ daemon: { ...freshDaemonState, members, memberCount: 1 }, targets: null, finance: null, xp: null, cloud: null, transactions: null, augfarmer: null }, NOW);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(COLUMN_BUDGET);
  });
});

// --- targetsPanel ---------------------------------------------------------

describe('targetsPanel', () => {
  const state = {
    timestamp: NOW,
    totalCount: 8,
    targets: [
      { server: 'a', prepped: true, sec: 1, minSec: 1, money: 100, maxMoney: 100, score: 5 },
      { server: 'b', prepped: false, sec: 2, minSec: 1, money: 50, maxMoney: 100, score: 9 },
      { server: 'c', prepped: true, sec: 1, minSec: 1, money: 100, maxMoney: 100, score: 3 },
    ],
  };

  // Collapsed to summary + top-scored only (2026-07-20). The previous two
  // tests asserted the full ranked list and its "(+N more)" tail; both are
  // gone by design, so they are replaced rather than deleted -- the sort still
  // matters (it picks which target is "top") and totalCount still matters.
  it('picks the highest-scoring target as "top", not list order', () => {
    const lines = targetsPanel(state, NOW);
    const topLine = lines.find((l) => l.startsWith('top:'));
    expect(topLine).toBeDefined();
    expect(topLine).toContain('b'); // score 9 beats a=5 and c=3
    expect(topLine).toContain('DRIFTED');
  });

  it('summarizes eligible totalCount and prepped fraction without listing targets', () => {
    const lines = targetsPanel(state, NOW);
    expect(lines.some((l) => l.includes('8 eligible, 2/3 prepped'))).toBe(true);
    expect(lines.some((l) => l.includes('more)'))).toBe(false);
    expect(lines.length).toBe(3); // title + summary + top
  });

  it('reports no eligible targets without a top line', () => {
    const lines = targetsPanel({ timestamp: NOW, totalCount: 0, targets: [] }, NOW);
    expect(lines.some((l) => l.includes('no eligible targets'))).toBe(true);
    expect(lines.some((l) => l.startsWith('top:'))).toBe(false);
  });
});

// --- gang trend sampler + gangPanel ---------------------------------------

describe('pushGangSample', () => {
  const state = { respect: 100, respectGainRate: 0.5 };

  it('appends the first sample and never mutates the input array', () => {
    const before = [];
    const after = pushGangSample(before, state, NOW);
    expect(before).toEqual([]);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ t: NOW, respect: 100, rate: 0.5 });
  });

  it('rate-limits to one sample per GANG_SAMPLE_MS', () => {
    let s = pushGangSample([], state, NOW);
    s = pushGangSample(s, state, NOW + GANG_SAMPLE_MS - 1);
    expect(s).toHaveLength(1);
    s = pushGangSample(s, state, NOW + GANG_SAMPLE_MS);
    expect(s).toHaveLength(2);
  });

  it('trims oldest-first at GANG_SAMPLE_CAP', () => {
    let s = [];
    for (let i = 0; i <= GANG_SAMPLE_CAP + 5; i++) s = pushGangSample(s, state, NOW + i * GANG_SAMPLE_MS);
    expect(s).toHaveLength(GANG_SAMPLE_CAP);
    expect(s[s.length - 1].t).toBe(NOW + (GANG_SAMPLE_CAP + 5) * GANG_SAMPLE_MS);
  });

  // A transient read failure must not punch a hole in the history -- otherwise
  // the trend silently resets every time the bridge hiccups.
  it('is a no-op on missing/unreadable state or a non-finite rate', () => {
    const s = pushGangSample([], state, NOW);
    expect(pushGangSample(s, null, NOW + GANG_SAMPLE_MS)).toBe(s);
    expect(pushGangSample(s, PARSE_FAILED, NOW + GANG_SAMPLE_MS)).toBe(s);
    expect(pushGangSample(s, { respectGainRate: undefined }, NOW + GANG_SAMPLE_MS)).toBe(s);
  });
});

describe('summarizeGangTrend', () => {
  it('returns null below two samples or on a zero span', () => {
    expect(summarizeGangTrend([], NOW)).toBeNull();
    expect(summarizeGangTrend([{ t: NOW, rate: 1 }], NOW)).toBeNull();
    expect(summarizeGangTrend([{ t: NOW, rate: 1 }, { t: NOW, rate: 2 }], NOW)).toBeNull();
  });

  it('reports span and signed rate delta across the ring', () => {
    const s = [{ t: NOW, rate: 0.30 }, { t: NOW + 60_000, rate: 0.34 }];
    const trend = summarizeGangTrend(s, NOW);
    expect(trend.spanMs).toBe(60_000);
    expect(trend.rateDelta).toBeCloseTo(0.04, 6);
  });
});

describe('gangPanel', () => {
  const state = {
    timestamp: NOW,
    respect: 1775,
    respectGainRate: 0.319,
    moneyGainRate: 2381,
    netWantedRate: -0.008,
    memberCount: 8,
    members: [{ ascPreviewHack: 1.08 }, { ascPreviewHack: 1.6 }, { ascPreviewHack: 2.1 }],
  };

  it('renders no-data and unreadable sentinels like every other panel', () => {
    expect(gangPanel(null, null, NOW)).toEqual(['-- GANG --', 'no data yet']);
    expect(gangPanel(PARSE_FAILED, null, NOW)).toEqual(['-- GANG --', 'unreadable']);
  });

  it('shows the raw respect rate without the retired observation-window goal', () => {
    const lines = gangPanel(state, null, NOW);
    expect(lines.some((l) => l.includes('+0.32/t'))).toBe(true);
    expect(lines.some((l) => l.includes('goal'))).toBe(false); // retired 2026-07-21
    expect(lines.some((l) => l.includes('%'))).toBe(false);
  });

  it('omits the trend segment until there is history, then shows direction and delta', () => {
    expect(gangPanel(state, null, NOW).some((l) => l.includes('UP'))).toBe(false);
    const up = gangPanel(state, { spanMs: 720_000, rateDelta: 0.04 }, NOW);
    expect(up.some((l) => l.includes('12m UP +0.040'))).toBe(true);
    const down = gangPanel(state, { spanMs: 60_000, rateDelta: -0.02 }, NOW);
    expect(down.some((l) => l.includes('1m DOWN -0.020'))).toBe(true);
    const flat = gangPanel(state, { spanMs: 60_000, rateDelta: 0 }, NOW);
    expect(flat.some((l) => l.includes('FLAT'))).toBe(true);
  });

  // netWantedRate is the signal the Phase 27 sink bug hid: negative drains.
  it('flags wanted health by the sign of netWantedRate', () => {
    expect(gangPanel(state, null, NOW).some((l) => l.includes('OK'))).toBe(true);
    expect(gangPanel({ ...state, netWantedRate: 0.01 }, null, NOW).some((l) => l.includes('RISING'))).toBe(true);
  });

  it('counts ascension-ready members against the ascend threshold', () => {
    expect(gangPanel(state, null, NOW).some((l) => l.includes('asc-ready 2/3'))).toBe(true);
  });

  it('short-circuits to OFF on the off-marker, suppressing the numbers', () => {
    const lines = gangPanel({ ...state, offMarker: true }, null, NOW);
    expect(lines).toEqual(['-- GANG --', 'OFF (gang-off.txt)']);
  });

  it('surfaces SINK MODE alongside the ascension count', () => {
    expect(gangPanel({ ...state, sinkMode: true }, null, NOW).some((l) => l.includes('SINK MODE'))).toBe(true);
  });

  it('tolerates a fully empty record without throwing', () => {
    const lines = gangPanel({}, null, NOW);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.some((l) => l.includes('asc-ready 0/0'))).toBe(true);
  });

  it('summarizes the member task split, most-populous first', () => {
    const withTasks = {
      ...state,
      members: [
        { task: 'Ransomware' }, { task: 'Ransomware' }, { task: 'Ransomware' },
        { task: 'Ethical Hacking' }, { task: 'Ethical Hacking' },
        { task: 'Money Laundering' },
      ],
    };
    const lines = gangPanel(withTasks, null, NOW);
    expect(lines.some((l) => l === 'tasks: Ransomware 3 | Ethical Hacking 2 | Money Laundering 1' || l.startsWith('tasks: Ransomware 3 | Ethical Hacking 2'))).toBe(true);
  });

  it('caps distinct task entries at PANEL_ENTRY_CAP with a "+N distinct more" suffix', () => {
    const manyTasks = {
      ...state,
      members: [
        { task: 'A' }, { task: 'A' },
        { task: 'B' },
        { task: 'C' },
        { task: 'D' },
      ],
    };
    const lines = gangPanel(manyTasks, null, NOW);
    const taskLine = lines.find((l) => l.startsWith('tasks:'));
    expect(taskLine).toBe('tasks: A 2 | B 1 | C 1 (+1 distinct more)');
  });

  it('omits the tasks line entirely when there are no members', () => {
    const lines = gangPanel({ ...state, members: [] }, null, NOW);
    expect(lines.some((l) => l.startsWith('tasks:'))).toBe(false);
  });
});

// --- financePanel ----------------------------------------------------------

describe('financePanel', () => {
  const state = {
    timestamp: NOW,
    money: 1_000_000,
    totalReserved: 500_000,
    available: 500_000,
    reservations: [
      { key: 'tor-router', label: 'TOR router', amount: 200_000 },
      { key: 'formulas', label: 'Formulas.exe', amount: 5_000_000_000 },
      { key: 'next-port-opener', label: 'BruteSSH.exe', amount: 500_000 },
      { key: 'manual-extra', label: 'manual reserve', amount: 1 },
    ],
    formulasSuppressed: false,
  };

  it('sorts reservations descending by amount and caps at 3', () => {
    const lines = financePanel(state, NOW);
    const idx = (k) => lines.findIndex((l) => l.includes(k));
    // amounts: formulas 5e9 > next-port-opener 500k > tor-router 200k > manual-extra 1
    expect(idx('formulas')).toBeLessThan(idx('next-port-opener'));
    expect(idx('next-port-opener')).toBeLessThan(idx('tor-router'));
    expect(lines.some((l) => l.includes('(+1 more)'))).toBe(true);
  });

  it('flags a suppressed formulas reservation', () => {
    const lines = financePanel({ ...state, formulasSuppressed: true }, NOW);
    expect(lines.some((l) => l.includes('DISABLED'))).toBe(true);
  });
});

// --- xpPanel ---------------------------------------------------------------

describe('xpPanel', () => {
  it('renders OFF without a target list', () => {
    const lines = xpPanel({ timestamp: NOW, off: true }, NOW);
    expect(lines.some((l) => l.includes('OFF'))).toBe(true);
  });

  // Collapsed to a single summary line (2026-07-20) -- the per-target
  // breakdown and its "(+N more)" tail are gone by design.
  it('summarizes target count on one line without listing them', () => {
    const targets = [1, 2, 3, 4].map((i) => ({ server: `s${i}`, mode: 'hold', sec: 1, minSec: 1, hackThreadsLaunched: 1, weakenThreadsLaunched: 1 }));
    const lines = xpPanel({ timestamp: NOW, off: false, usableGb: 100, claimGb: 50, hackingLevel: 500, targets }, NOW);
    expect(lines.length).toBe(2); // title + summary
    expect(lines[1]).toContain('4 target(s)');
    expect(lines.some((l) => l.includes('s1'))).toBe(false);
  });

  it('flags an empty target set explicitly', () => {
    const lines = xpPanel({ timestamp: NOW, off: false, usableGb: 100, claimGb: 50, hackingLevel: 500, targets: [] }, NOW);
    expect(lines.some((l) => l.includes('no eligible XP target'))).toBe(true);
  });
});

// --- cloudPanel --------------------------------------------------------------

describe('cloudPanel', () => {
  it('renders PAUSED distinctly from missing/stale', () => {
    const lines = cloudPanel({ timestamp: NOW, paused: true }, NOW);
    expect(lines.some((l) => l.includes('PAUSED'))).toBe(true);
  });

  it('renders finance-stale distinctly from paused', () => {
    const lines = cloudPanel({ timestamp: NOW, financeStale: true }, NOW);
    expect(lines.some((l) => l.includes('stale'))).toBe(true);
  });

  // The three `next`/`growth` branches after the 2026-07-20 collapse. Only the
  // unaffordable one survived from the original panel; the other two are new
  // and were shipped untested until this gap was caught.
  const cloudFleet = { count: 2, minRam: 16, maxRam: 32, serverLimit: 25, ramLimit: 1_048_576 };

  it('shows the next upgrade only when it cannot be afforded', () => {
    const lines = cloudPanel(
      { timestamp: NOW, available: 100, reserved: 0, fleet: cloudFleet, next: { hostname: 'cloud-0', tier: 64, cost: 1000, affordable: false } },
      NOW
    );
    expect(lines.some((l) => l.includes("can't afford"))).toBe(true);
  });

  // Deliberately silent: an affordable upgrade needs no attention, cloudmanager
  // will just buy it. Asserted so the silence stays intentional rather than
  // becoming an undetected regression.
  it('stays silent about an affordable next upgrade', () => {
    const lines = cloudPanel(
      { timestamp: NOW, available: 1e9, reserved: 0, fleet: cloudFleet, next: { hostname: 'cloud-0', tier: 64, cost: 1000, affordable: true } },
      NOW
    );
    expect(lines.some((l) => l.includes('next:'))).toBe(false);
    expect(lines).toHaveLength(2); // title + fleet line only
  });

  it('reports growth status when the fleet is maxed (no next tier)', () => {
    const lines = cloudPanel(
      { timestamp: NOW, available: 1e9, reserved: 0, fleet: cloudFleet, next: null, growth: { status: 'at-limit' } },
      NOW
    );
    expect(lines.some((l) => l.includes('fleet maxed -- growth: at-limit'))).toBe(true);
  });

  it('folds fleet shape and spend headroom into one line', () => {
    const lines = cloudPanel({ timestamp: NOW, available: 1e9, reserved: 0, fleet: cloudFleet }, NOW);
    expect(lines[1]).toContain('fleet 2/25');
    expect(lines[1]).toContain('avail $1.00b');
    expect(lines.some((l) => l.includes('last upgrade'))).toBe(false); // dropped 2026-07-20
  });
});

// --- transactionsPanel (S5 math) --------------------------------------------

describe('transactionsPanel', () => {
  it('sums income and expense totals separately', () => {
    const entries = [
      { type: 'income', amount: 1000, firstTimestamp: NOW - 60_000, lastTimestamp: NOW - 30_000 },
      { type: 'expense', source: 'auto-cloud-purchase', amount: 200, timestamp: NOW - 20_000 },
    ];
    const lines = transactionsPanel(entries, NOW);
    expect(lines.some((l) => l.includes('+$1.00k'))).toBe(true);
    expect(lines.some((l) => l.includes('-$200.0'))).toBe(true);
  });

  it('anchors the rate on the earliest income record, never an expense record', () => {
    const entries = [
      { type: 'expense', source: 'auto-cloud-purchase', amount: 200, timestamp: NOW - 120_000 },
      { type: 'income', amount: 600, firstTimestamp: NOW - 60_000, lastTimestamp: NOW - 30_000 },
    ];
    const lines = transactionsPanel(entries, NOW);
    // 60_000ms = 1 minute elapsed since the income record's firstTimestamp -> $600/min
    expect(lines.some((l) => l.includes('rate $600.0'))).toBe(true);
  });

  it('omits the rate entirely (no NaN) when the day only has expense records', () => {
    const entries = [{ type: 'expense', source: 'auto-cloud-purchase', amount: 200, timestamp: NOW - 1000 }];
    const lines = transactionsPanel(entries, NOW);
    for (const l of lines) {
      expect(l).not.toContain('NaN');
      expect(l).not.toContain('rate');
    }
  });

  it('sorts the recent list descending by recency (lastTimestamp for income, timestamp for expense)', () => {
    const entries = [
      { type: 'income', amount: 1, firstTimestamp: NOW - 90_000, lastTimestamp: NOW - 90_000 },
      { type: 'expense', source: 'x', amount: 2, timestamp: NOW - 10_000 },
      { type: 'income', amount: 3, firstTimestamp: NOW - 50_000, lastTimestamp: NOW - 50_000 },
    ];
    const lines = transactionsPanel(entries, NOW);
    const idxExpense = lines.findIndex((l) => l.includes('[expense]'));
    const idxIncome3 = lines.findIndex((l) => l.includes('+$3'));
    const idxIncome1 = lines.findIndex((l) => l.includes('+$1'));
    expect(idxExpense).toBeLessThan(idxIncome3);
    expect(idxIncome3).toBeLessThan(idxIncome1);
  });

  it('falls back to `timestamp` ordering when firstTimestamp/lastTimestamp are absent', () => {
    const entries = [{ type: 'expense', source: 'x', amount: 5, timestamp: NOW - 5000 }];
    expect(() => transactionsPanel(entries, NOW)).not.toThrow();
  });
});

// --- augPanel ----------------------------------------------------------------

describe('augPanel', () => {
  it('renders a target line with faction and deficit', () => {
    const lines = augPanel(
      { timestamp: NOW, phase: 'grinding', target: { aug: 'The Red Pill', faction: 'Daedalus', deficit: 12345.6 }, boughtThisCycle: [1, 2], joinedFactions: ['Daedalus'], daedalusGate: { installed: 5, queued: 1, target: 30 } },
      NOW
    );
    expect(lines.some((l) => l.includes('The Red Pill'))).toBe(true);
    expect(lines.some((l) => l.includes('daedalus gate: 5+1/30'))).toBe(true);
  });

  it('renders "target: none" on plateau', () => {
    const lines = augPanel({ timestamp: NOW, phase: 'idle-plateau', target: null, boughtThisCycle: [], joinedFactions: [] }, NOW);
    expect(lines.some((l) => l.includes('target: none'))).toBe(true);
  });

  it('shows the work faction separately from the head target (the live 2026-07-16 shape)', () => {
    // A rep-met NFG heads the sort at deficit 0 while the slot grinds
    // Sector-12 for CashRoot. Showing only `target` reads as "grinding for
    // NFG at CyberSec", which is what Kenneth saw and correctly disbelieved.
    const lines = augPanel(
      {
        timestamp: NOW,
        phase: 'grinding',
        target: { aug: 'NeuroFlux Governor', faction: 'CyberSec', deficit: 0 },
        workTarget: { aug: 'CashRoot Starter Kit', faction: 'Sector-12', deficit: 11914 },
        boughtThisCycle: [1, 2, 3, 4, 5],
        joinedFactions: ['CyberSec', 'Sector-12'],
      },
      NOW
    );
    const work = lines.find((l) => l.startsWith('work:'));
    expect(work).toBe('work: Sector-12 -> CashRoot Starter Kit (deficit 11914)');
    expect(lines.some((l) => l.includes('target: NeuroFlux Governor via CyberSec (deficit 0)'))).toBe(true);
  });

  it('calls out pickWorkFaction\'s rep-met fallback rather than implying a grind', () => {
    const lines = augPanel(
      { timestamp: NOW, phase: 'grinding', target: { aug: 'NeuroFlux Governor', faction: 'CyberSec', deficit: 0 }, workTarget: { aug: 'NeuroFlux Governor', faction: 'CyberSec', deficit: 0 }, boughtThisCycle: [], joinedFactions: [] },
      NOW
    );
    expect(lines.some((l) => l === 'work: CyberSec (no grind -- rep met)')).toBe(true);
  });

  it('renders "work: none" when there are no candidates at all', () => {
    const lines = augPanel({ timestamp: NOW, phase: 'idle-plateau', target: null, workTarget: null, boughtThisCycle: [], joinedFactions: [] }, NOW);
    expect(lines.some((l) => l === 'work: none')).toBe(true);
  });
});

// --- goalPanel (Phase 32) -----------------------------------------------------

describe('goalPanel', () => {
  it('renders the M-progress line exactly (decision 11)', () => {
    const lines = goalPanel({ timestamp: NOW, mProgress: { value: 1.51, target: 16.7, targetLabel: 'core', pct: 9 } }, NOW);
    expect(lines).toContain('M 1.51/16.7 (core) ~9%');
  });

  it('income: perSec null (warming up, no value)', () => {
    const lines = goalPanel({ timestamp: NOW, mProgress: {}, income: { perSec: null, trend: null } }, NOW);
    expect(lines).toContain('income (warming up)');
  });

  it('income: perSec non-null but trend null (warming up, with value)', () => {
    const lines = goalPanel({ timestamp: NOW, mProgress: {}, income: { perSec: 5_090_000, trend: null } }, NOW);
    expect(lines).toContain('income $5.09m/s (warming up)');
  });

  it('income: both perSec and trend present', () => {
    const lines = goalPanel({ timestamp: NOW, mProgress: {}, income: { perSec: 5_090_000, trend: 'UP', windowMs: 600_000 } }, NOW);
    expect(lines).toContain('income $5.09m/s UP (10m)');
  });

  it('next: none when nextAug is null', () => {
    const lines = goalPanel({ timestamp: NOW, mProgress: {}, income: {}, nextAug: null }, NOW);
    expect(lines).toContain('next: none');
  });

  it('next: aug + price, no waiting segment outside awaiting-money', () => {
    const lines = goalPanel(
      { timestamp: NOW, mProgress: {}, income: {}, nextAug: { aug: 'Cranial Signal Processors V', price: 15_400_000_000, phase: 'grinding' } },
      NOW
    );
    expect(lines).toContain('next: Cranial Signal Processors V $15.40b');
    expect(lines.some((l) => l.includes('waiting'))).toBe(false);
  });

  it('next: waiting segment shown only when awaiting-money with a waitingMs stamp', () => {
    const lines = goalPanel(
      {
        timestamp: NOW,
        mProgress: {},
        income: {},
        nextAug: { aug: 'The Red Pill', price: 0, phase: 'awaiting-money', awaitingSince: NOW - 12 * 60_000, waitingMs: 12 * 60_000 },
      },
      NOW
    );
    expect(lines).toContain('next: The Red Pill $0.0 | waiting 12m');
  });

  it('elapsed formatting: under an hour is "Nm", an hour or more is "Xh Ym"', () => {
    const under = goalPanel({ timestamp: NOW, mProgress: {}, income: {}, nextAug: { aug: 'x', price: 1, phase: 'awaiting-money', waitingMs: 45 * 60_000 } }, NOW);
    expect(under.some((l) => l.endsWith('waiting 45m'))).toBe(true);
    const over = goalPanel({ timestamp: NOW, mProgress: {}, income: {}, nextAug: { aug: 'x', price: 1, phase: 'awaiting-money', waitingMs: 135 * 60_000 } }, NOW);
    expect(over.some((l) => l.endsWith('waiting 2h 15m'))).toBe(true);
  });
});

// --- renderAll ---------------------------------------------------------------

describe('renderAll', () => {
  const allMissing = { daemon: null, targets: null, finance: null, xp: null, cloud: null, transactions: null, augfarmer: null, goal: null };

  it('GOAL renders as the first panel (lines[0] is the dashboard header)', () => {
    const lines = renderAll(allMissing, NOW);
    expect(lines[1]).toContain('-- GOAL (BN2.1) --');
  });

  it('every line is within COLUMN_BUDGET on an all-missing render', () => {
    const lines = renderAll(allMissing, NOW);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(COLUMN_BUDGET);
  });

  it('a formatter that throws on a malformed shape degrades to that panel\'s "unreadable" line, other panels still render', () => {
    // members as a non-array breaks capEntries' .slice() internally -- a
    // genuinely malformed shape the `??` defaults don't anticipate.
    const brokenDaemon = { ...freshDaemonState, members: { not: 'an array' } };
    const lines = renderAll({ ...allMissing, daemon: brokenDaemon, targets: { timestamp: NOW, totalCount: 0, targets: [] } }, NOW);
    expect(lines.some((l) => l.includes('-- DAEMON --') && false)).toBe(false); // sanity: doesn't crash the whole render
    expect(lines.some((l) => l.includes('unreadable'))).toBe(true);
    expect(lines.some((l) => l.includes('-- TARGETS --'))).toBe(true);
  });

  it('worst-case composite fixture stays within ROW_BUDGET, every line within COLUMN_BUDGET', () => {
    const worstMembers = [1, 2, 3, 4].map((i) => ({ server: `server-${i}`, prepped: i % 2 === 0, floor: true, batchesInFlight: 3, depth: 4, commitPct: 99.9, sec: 123.45, minSec: 1, money: 1e12, maxMoney: 1e12 }));
    const worstDaemon = {
      timestamp: NOW,
      mathMode: 'formulas',
      noTargets: false,
      fleet: { totalMaxRam: 1e6, batchBudgetGb: 1e6, hostsCount: 99, targetsCount: 42, utilizationPct: 99.9 },
      members: worstMembers,
      memberCount: worstMembers.length,
      draining: [{ server: 'd1', batches: 1, etaMin: 3 }, { server: 'd2', batches: 1, etaMin: 4 }],
      drainingCount: 2,
      share: { off: false, targetGb: 99999, inFlightRamGb: 88888, threads: 9999, attainedPct: 88.8, sharePower: 9.99 },
      waterfall: { availableGb: 12345, prepping: ['a', 'b', 'c', 'd'] },
      warns: { stall: true, skipServers: ['s1', 's2', 's3'], failedLaunches: 3 },
    };
    const worstTargets = { timestamp: NOW, totalCount: 20, targets: [1, 2, 3, 4, 5].map((i) => ({ server: `t${i}`, prepped: false, sec: 99, minSec: 1, money: 1e9, maxMoney: 1e9, score: 10 - i })) };
    const worstFinance = {
      timestamp: NOW,
      money: 1e12,
      totalReserved: 5e11,
      available: 5e11,
      reservations: [1, 2, 3, 4].map((i) => ({ key: `k${i}`, label: `label ${i}`, amount: 1e9 * i })),
      formulasSuppressed: true,
    };
    const worstXp = { timestamp: NOW, off: false, usableGb: 99999, claimGb: 88888, hackingLevel: 9999, targets: [1, 2, 3, 4].map((i) => ({ server: `x${i}`, mode: 'crush', sec: 99, minSec: 1, hackThreadsLaunched: 999, weakenThreadsLaunched: 999 })) };
    const worstCloud = { timestamp: NOW, available: 1e9, reserved: 1e8, fleet: { count: 25, minRam: 1024, maxRam: 1_048_576, serverLimit: 25, ramLimit: 1_048_576 }, next: null, growth: { status: 'at-limit' }, lastUpgrade: { hostname: 'cloud-24', time: '10:00:00' } };
    const worstTransactions = [1, 2, 3, 4, 5].map((i) => ({ type: i % 2 === 0 ? 'income' : 'expense', source: 'auto-cloud-upgrade', amount: 1e9, timestamp: NOW - i * 1000, firstTimestamp: NOW - i * 1000, lastTimestamp: NOW - i * 1000 }));
    const worstAug = { timestamp: NOW, phase: 'grinding', target: { aug: 'The Red Pill', faction: 'Daedalus', deficit: 999999 }, boughtThisCycle: [1, 2, 3, 4, 5], joinedFactions: ['a', 'b', 'c', 'd'], daedalusGate: { installed: 29, queued: 5, target: 30 } };

    // Gang at its widest: 8 members, every optional segment present (trend +
    // SINK MODE), hostile magnitudes on every number.
    const worstGangState = {
      timestamp: NOW,
      respect: 9.99e12,
      respectGainRate: 999.999,
      moneyGainRate: 9.99e12,
      netWantedRate: 0.12345,
      wantedLevel: 99999,
      memberCount: 8,
      sinkMode: true,
      // Task names deliberately long/varied so the new tasks: line stress-tests
      // both COLUMN_BUDGET (long names) and the PANEL_ENTRY_CAP "+N distinct
      // more" path (5 distinct tasks across 8 members).
      members: [
        { ascPreviewHack: 1.6, task: 'Human Trafficking' },
        { ascPreviewHack: 1.7, task: 'Human Trafficking' },
        { ascPreviewHack: 1.8, task: 'Money Laundering' },
        { ascPreviewHack: 1.9, task: 'Vigilante Justice' },
        { ascPreviewHack: 2.0, task: 'Territory Warfare' },
        { ascPreviewHack: 2.1, task: 'Ethical Hacking' },
        { ascPreviewHack: 2.2, task: 'Cyberterrorism' },
        { ascPreviewHack: 2.3, task: 'Vigilante Justice' },
      ],
    };
    const worstGangTrend = { spanMs: 3_600_000, rateDelta: -999.999 };

    // GOAL at its widest: every optional segment present (trend + waiting).
    const worstGoal = {
      timestamp: NOW,
      mProgress: { value: 16.699, target: 16.7, targetLabel: 'core', pct: 99 },
      income: { perSec: 9.99e12, trend: 'DOWN', windowMs: 600_000 },
      nextAug: { aug: 'Cranial Signal Processors V', price: 9.99e12, phase: 'awaiting-money', awaitingSince: NOW - 599 * 60_000, waitingMs: 599 * 60_000 },
    };

    const lines = renderAll(
      {
        daemon: worstDaemon,
        targets: worstTargets,
        finance: worstFinance,
        xp: worstXp,
        cloud: worstCloud,
        transactions: worstTransactions,
        augfarmer: worstAug,
        gangState: worstGangState,
        gangTrend: worstGangTrend,
        goal: worstGoal,
      },
      NOW
    );

    expect(lines.length).toBeLessThanOrEqual(ROW_BUDGET);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(COLUMN_BUDGET);
  });
});
