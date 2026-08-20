// Unit tests for src/daemon.js's trimLog (Phase 16, F2 -- fixes the
// pinned-branch off-by-one that left the ring buffer at MAX + 1 while a
// `mode` event was pinned) and buildDaemonStatus (Phase 24, S2 -- the
// dashboard.js status-snapshot builder). trimLog/DAEMON_LOG_MAX_ENTRIES are
// exported for this test only -- no other behavior change.
import { describe, it, expect } from 'vitest';
import {
  trimLog,
  DAEMON_LOG_MAX_ENTRIES,
  buildDaemonStatus,
  planRelaunches,
  RESIDENT_COMPANIONS,
  COMPLETION_GATED_COMPANIONS,
  SUPERVISOR_RETRY_MS,
  supervisedResidents,
  GANG_GATED_COMPANIONS,
  BLADEBURNER_GATED_COMPANIONS,
  loadBoundaryLog,
  mirrorBoundaryRecord,
  seedFloorReserve,
  buildRankingEntry,
  BOUNDARY_WINDOW_MS,
  BOUNDARY_LOG_MAX,
  FLOOR_SEED_MAX_AGE_MS,
} from '../src/daemon.js';

/** Builds MAX + extra plain entries, no `mode` event -- non-pinned case. */
function buildPlainEntries(count) {
  return Array.from({ length: count }, (_, i) => ({ event: 'batch', i }));
}

describe('trimLog', () => {
  it('no-ops when entries are already within the cap', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES - 1);
    expect(trimLog(entries, new Map())).toBe(entries);
  });

  it('non-pinned overflow trims to exactly DAEMON_LOG_MAX_ENTRIES via plain FIFO', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    const trimmed = trimLog(entries, new Map());
    expect(trimmed).toHaveLength(DAEMON_LOG_MAX_ENTRIES);
    expect(trimmed[0]).toBe(entries[5]);
  });

  it('pinned overflow trims to exactly DAEMON_LOG_MAX_ENTRIES, not MAX + 1 (F2 regression)', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    entries[2] = { event: 'mode', hackFraction: 0.5 }; // inside the overflow region -> pinned
    const trimmed = trimLog(entries, new Map());
    expect(trimmed).toHaveLength(DAEMON_LOG_MAX_ENTRIES);
  });

  it('the pinned mode event is at index 0', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    const modeEvent = { event: 'mode', hackFraction: 0.5 };
    entries[2] = modeEvent;
    const trimmed = trimLog(entries, new Map());
    expect(trimmed[0]).toBe(modeEvent);
  });

  it('a skip record dropped only by the widened slice triggers its openSkipRecords deletion', () => {
    // overflow = 5 for a MAX+5 array; the widened slice (overflow + 1 = 6)
    // drops one more real entry than the un-widened slice would have --
    // put the skip record at that exact boundary index (5) so this test
    // fails against the pre-fix (overflow-only) slice width.
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    entries[0] = { event: 'mode', hackFraction: 0.5 }; // pinned, index 0 < overflow (5)
    const skipRecord = { event: 'skip', batchTarget: 'n00dles' };
    entries[5] = skipRecord; // boundary entry only dropped by the widened (overflow+1) slice
    const openSkipRecords = new Map([['n00dles', skipRecord]]);

    trimLog(entries, openSkipRecords);

    expect(openSkipRecords.has('n00dles')).toBe(false);
  });

  it('does not clean up an openSkipRecords entry whose record survives (not dropped)', () => {
    const entries = buildPlainEntries(DAEMON_LOG_MAX_ENTRIES + 5);
    const skipRecord = { event: 'skip', batchTarget: 'n00dles' };
    entries[DAEMON_LOG_MAX_ENTRIES] = skipRecord; // well within the kept tail
    const openSkipRecords = new Map([['n00dles', skipRecord]]);

    trimLog(entries, openSkipRecords);

    expect(openSkipRecords.has('n00dles')).toBe(true);
  });
});

describe('buildDaemonStatus', () => {
  it('every key is present with defaults when called with only the scalars the no-targets branch has', () => {
    const status = buildDaemonStatus({ now: 1000, useFormulas: false, forcedLegacy: false, noTargets: true, hostsCount: 5, shareOff: true, sharePower: 1 });
    expect(status).toMatchObject({
      timestamp: 1000,
      noTargets: true,
      mathMode: 'legacy',
      fleet: { totalMaxRam: 0, batchBudgetGb: 0, hostsCount: 5, targetsCount: 0, utilizationPct: 0 },
      members: [],
      memberCount: 0,
      draining: [],
      drainingCount: 0,
      share: { off: true, targetGb: 0, inFlightRamGb: 0, threads: 0, attainedPct: null, sharePower: 1 },
      waterfall: { availableGb: 0, prepping: [] },
      warns: { stall: false, skipServers: [], failedLaunches: 0 },
    });
  });

  it('mathMode reflects formulas/legacy/legacy-forced', () => {
    expect(buildDaemonStatus({ now: 1, useFormulas: true, forcedLegacy: false }).mathMode).toBe('formulas');
    expect(buildDaemonStatus({ now: 1, useFormulas: false, forcedLegacy: false }).mathMode).toBe('legacy');
    expect(buildDaemonStatus({ now: 1, useFormulas: false, forcedLegacy: true }).mathMode).toBe('legacy-forced');
  });

  it('carries every seated member, not just the display-capped set', () => {
    const members = Array.from({ length: 17 }, (_, i) => ({ server: `s${i}` }));
    const status = buildDaemonStatus({ now: 1, useFormulas: true, forcedLegacy: false, members });
    expect(status.members).toHaveLength(17);
    expect(status.memberCount).toBe(17);
  });
});

describe('planRelaunches — Phase 26 B1 (S5/S10)', () => {
  const residents = ['a.js', 'b.js', 'c.js'];

  it('a missing resident is queued for launch, with its attempt time recorded', () => {
    const running = new Set(['b.js', 'c.js']);
    const r = planRelaunches(running, residents, new Set(), {}, 1000);
    expect(r.launch).toEqual(['a.js']);
    expect(r.waitingRam).toEqual([]);
    expect(r.lastAttemptMs['a.js']).toBe(1000);
  });

  it('a running resident needs nothing', () => {
    const running = new Set(residents);
    const r = planRelaunches(running, residents, new Set(), {}, 1000);
    expect(r.launch).toEqual([]);
    expect(r.waitingRam).toEqual([]);
  });

  it('backoff: missing again within SUPERVISOR_RETRY_MS is not relaunched; after it is', () => {
    const running = new Set(['b.js', 'c.js']);
    const priorAttempts = { 'a.js': 1000 };
    const stillWithin = planRelaunches(running, residents, new Set(), priorAttempts, 1000 + SUPERVISOR_RETRY_MS - 1);
    expect(stillWithin.launch).toEqual([]);
    expect(stillWithin.lastAttemptMs['a.js']).toBe(1000); // untouched -- no attempt was made

    const afterBackoff = planRelaunches(running, residents, new Set(), priorAttempts, 1000 + SUPERVISOR_RETRY_MS);
    expect(afterBackoff.launch).toEqual(['a.js']);
    expect(afterBackoff.lastAttemptMs['a.js']).toBe(1000 + SUPERVISOR_RETRY_MS);
  });

  it('missing + unfit => waitingRam, no launch, no attempt-time update', () => {
    const running = new Set(['b.js', 'c.js']);
    const r = planRelaunches(running, residents, new Set(['a.js']), {}, 1000);
    expect(r.launch).toEqual([]);
    expect(r.waitingRam).toEqual(['a.js']);
    expect(r.lastAttemptMs['a.js']).toBeUndefined();
  });

  it('unfit -> fit transition launches immediately -- no backoff accrued while waiting', () => {
    const running = new Set(['b.js', 'c.js']);
    // Missing and unfit for a long stretch -- no attempt time was ever set.
    const waiting = planRelaunches(running, residents, new Set(['a.js']), {}, 1000);
    expect(waiting.lastAttemptMs['a.js']).toBeUndefined();
    // Now it fits: must launch immediately, not wait out SUPERVISOR_RETRY_MS.
    const nowFits = planRelaunches(running, residents, new Set(), waiting.lastAttemptMs, 1000 + 1);
    expect(nowFits.launch).toEqual(['a.js']);
  });

  it('self-terminating scripts are never relaunched once done -- list membership is the rail', () => {
    expect(RESIDENT_COMPANIONS).not.toContain('procureformulas.js');
    expect(RESIDENT_COMPANIONS).not.toContain('studybootstrap.js');
    expect(RESIDENT_COMPANIONS).not.toContain('backdoorfactions.js');
    expect(RESIDENT_COMPANIONS).not.toContain('backdoorwd.js');
  });

  // procureprograms.js is the one exception, added 2026-08-20. It IS in the list, but gated on
  // its own completion predicate rather than on its absence -- so the safety property the rail
  // protects (never relaunch a fulfiller that has finished) still holds, by a different
  // mechanism. The old list-exclusion let it stall silently: it was not running, we owned 1 of
  // 5 openers, and $1.5m of FTPCrack.exe sat reserved-but-unbought for 3.5 days against $48b.
  it('procureprograms.js is supervised ONLY while an opener is still missing', () => {
    expect(RESIDENT_COMPANIONS).toContain('procureprograms.js');
    expect(COMPLETION_GATED_COMPANIONS).toContain('procureprograms.js');
    // work done -> not supervised, so a finished fulfiller is never relaunched
    expect(supervisedResidents(RESIDENT_COMPANIONS, true, true, false)).not.toContain('procureprograms.js');
    // work outstanding -> supervised, so a crash-before-done is healed within one check
    expect(supervisedResidents(RESIDENT_COMPANIONS, true, true, true)).toContain('procureprograms.js');
  });

  it('the workOutstanding arg defaults to false, so pre-existing three-arg call sites are unchanged', () => {
    expect(supervisedResidents(RESIDENT_COMPANIONS, true, true)).not.toContain('procureprograms.js');
  });

  it('Phase 27: gangmanager.js is resident, in the priority slot right after cloudmanager.js', () => {
    expect(RESIDENT_COMPANIONS).toContain('gangmanager.js');
    const cloudIdx = RESIDENT_COMPANIONS.indexOf('cloudmanager.js');
    expect(RESIDENT_COMPANIONS[cloudIdx + 1]).toBe('gangmanager.js');
  });

  it('Phase 38 Slice B: bladeburnermanager.js is resident, right after gangmanager.js', () => {
    expect(RESIDENT_COMPANIONS).toContain('bladeburnermanager.js');
    const gangIdx = RESIDENT_COMPANIONS.indexOf('gangmanager.js');
    expect(RESIDENT_COMPANIONS[gangIdx + 1]).toBe('bladeburnermanager.js');
  });

  it('multiple missing residents are all handled in one pass', () => {
    const r = planRelaunches(new Set(), residents, new Set(), {}, 1000);
    expect(r.launch.sort()).toEqual(['a.js', 'b.js', 'c.js']);
  });

  describe('supervisedResidents -- gang gate', () => {
    it('with a gang, the set is the full resident list unchanged', () => {
      expect(supervisedResidents(RESIDENT_COMPANIONS, true, true, true)).toEqual(RESIDENT_COMPANIONS);
    });

    it('without a gang, gangmanager.js is dropped and nothing else is', () => {
      const gated = supervisedResidents(RESIDENT_COMPANIONS, false, true, true);
      expect(gated).not.toContain('gangmanager.js');
      expect(gated).toEqual(RESIDENT_COMPANIONS.filter((s) => s !== 'gangmanager.js'));
    });

    it('every gang-gated name is actually a resident -- a typo would silently gate nothing', () => {
      for (const script of GANG_GATED_COMPANIONS) expect(RESIDENT_COMPANIONS).toContain(script);
    });

    it('a gangless gate means no relaunch is ever planned for gangmanager.js', () => {
      const gated = supervisedResidents(RESIDENT_COMPANIONS, false, true, true);
      const r = planRelaunches(new Set(), gated, new Set(), {}, 1000);
      expect(r.launch).not.toContain('gangmanager.js');
      expect(r.lastAttemptMs['gangmanager.js']).toBeUndefined();
      // ...and the gate is the only thing suppressing it: with a gang it plans.
      const withGang = planRelaunches(new Set(), supervisedResidents(RESIDENT_COMPANIONS, true, true, true), new Set(), {}, 1000);
      expect(withGang.launch).toContain('gangmanager.js');
    });
  });

  describe('supervisedResidents -- Phase 38 Slice B: Bladeburner gate (third param)', () => {
    it('two-arg call sites are behaviour-identical -- hasBladeburner defaults to true', () => {
      expect(supervisedResidents(RESIDENT_COMPANIONS, true, true, true)).toEqual(RESIDENT_COMPANIONS);
      const gated = supervisedResidents(RESIDENT_COMPANIONS, false, true, true);
      expect(gated).toContain('bladeburnermanager.js');
      expect(gated).toEqual(RESIDENT_COMPANIONS.filter((s) => s !== 'gangmanager.js'));
    });

    it('without Bladeburner access, bladeburnermanager.js is dropped and nothing else is', () => {
      const gated = supervisedResidents(RESIDENT_COMPANIONS, true, false, true);
      expect(gated).not.toContain('bladeburnermanager.js');
      expect(gated).toEqual(RESIDENT_COMPANIONS.filter((s) => s !== 'bladeburnermanager.js'));
    });

    it('both gates compose -- no gang AND no Bladeburner drops both, only both', () => {
      const gated = supervisedResidents(RESIDENT_COMPANIONS, false, false, true);
      expect(gated).toEqual(RESIDENT_COMPANIONS.filter((s) => s !== 'gangmanager.js' && s !== 'bladeburnermanager.js'));
    });

    it('every Bladeburner-gated name is actually a resident -- a typo would silently gate nothing', () => {
      for (const script of BLADEBURNER_GATED_COMPANIONS) expect(RESIDENT_COMPANIONS).toContain(script);
    });

    it('a Bladeburner-less gate means no relaunch is ever planned for bladeburnermanager.js', () => {
      const gated = supervisedResidents(RESIDENT_COMPANIONS, true, false);
      const r = planRelaunches(new Set(), gated, new Set(), {}, 1000);
      expect(r.launch).not.toContain('bladeburnermanager.js');
      expect(r.lastAttemptMs['bladeburnermanager.js']).toBeUndefined();
      // ...and the gate is the only thing suppressing it: with access it plans.
      const withAccess = planRelaunches(new Set(), supervisedResidents(RESIDENT_COMPANIONS, true, true), new Set(), {}, 1000);
      expect(withAccess.launch).toContain('bladeburnermanager.js');
    });
  });
});

describe('loadBoundaryLog (Phase 35 WI1)', () => {
  it('inactive when boundaryStartMs is null/absent -- no marker written yet', () => {
    expect(loadBoundaryLog(null, null, 1000)).toEqual({ entries: [], active: false, capped: false, dirty: false });
    expect(loadBoundaryLog('[]', undefined, 1000)).toEqual({ entries: [], active: false, capped: false, dirty: false });
  });

  it('starts fresh, stamped with a boundary-begin record, when no persisted file exists', () => {
    const state = loadBoundaryLog(null, 5000, 5001);
    expect(state.active).toBe(true);
    expect(state.capped).toBe(false);
    expect(state.dirty).toBe(true);
    expect(state.entries).toEqual([{ event: 'boundary-begin', boundaryStartMs: 5000, daemonStartMs: 5001 }]);
  });

  it('starts fresh on a NEW boundary even if a persisted file exists (stale marker mismatch)', () => {
    const persisted = JSON.stringify([
      { event: 'boundary-begin', boundaryStartMs: 1000, daemonStartMs: 1000 },
      { event: 'batch', batchTarget: 'n00dles' },
    ]);
    const state = loadBoundaryLog(persisted, 9999, 9999);
    expect(state.entries).toEqual([{ event: 'boundary-begin', boundaryStartMs: 9999, daemonStartMs: 9999 }]);
    expect(state.dirty).toBe(true);
  });

  it('continues the persisted array when the boundary-begin stamp matches -- a same-boundary daemon restart', () => {
    const persisted = JSON.stringify([
      { event: 'boundary-begin', boundaryStartMs: 5000, daemonStartMs: 5001 },
      { event: 'batch', batchTarget: 'n00dles' },
    ]);
    const state = loadBoundaryLog(persisted, 5000, 6000);
    expect(state.entries).toHaveLength(2);
    expect(state.entries[1]).toEqual({ event: 'batch', batchTarget: 'n00dles' });
    expect(state.dirty).toBe(false); // continuing, not freshly stamped -- nothing new to flush yet
  });

  it('detects an already-capped persisted slice', () => {
    const persisted = JSON.stringify([
      { event: 'boundary-begin', boundaryStartMs: 5000, daemonStartMs: 5001 },
      { event: 'boundary-cap', timestamp: 5555 },
    ]);
    const state = loadBoundaryLog(persisted, 5000, 6000);
    expect(state.capped).toBe(true);
  });

  it('malformed persisted JSON is treated as absent -- starts fresh, does not throw', () => {
    const state = loadBoundaryLog('{not json', 5000, 6000);
    expect(state.active).toBe(true);
    expect(state.entries[0].event).toBe('boundary-begin');
  });
});

describe('mirrorBoundaryRecord (Phase 35 WI1)', () => {
  function activeState() {
    return { entries: [{ event: 'boundary-begin', boundaryStartMs: 0 }], active: true, capped: false, dirty: false };
  }

  it('no-ops when the state is inactive', () => {
    const state = { entries: [], active: false, capped: false, dirty: false };
    expect(mirrorBoundaryRecord(state, { event: 'batch' }, 1000, 0)).toBe(false);
    expect(state.entries).toEqual([]);
  });

  it('no-ops when already capped', () => {
    const state = { entries: [], active: true, capped: true, dirty: false };
    expect(mirrorBoundaryRecord(state, { event: 'batch' }, 1000, 0)).toBe(false);
  });

  it('no-ops once BOUNDARY_WINDOW_MS has elapsed since boundaryStartMs', () => {
    const state = activeState();
    expect(mirrorBoundaryRecord(state, { event: 'batch' }, BOUNDARY_WINDOW_MS, 0)).toBe(false);
    expect(mirrorBoundaryRecord(state, { event: 'batch' }, BOUNDARY_WINDOW_MS - 1, 0)).toBe(true);
  });

  it('mirrors an appendLogEvent-shaped record by reference -- mutating it later shows in the mirrored copy', () => {
    const state = activeState();
    const record = { event: 'mode', shareFraction: 0.5 };
    mirrorBoundaryRecord(state, record, 1000, 0);
    expect(state.entries[1]).toBe(record); // same reference, not a copy
    record.shareFraction = 0.9;
    expect(state.entries[1].shareFraction).toBe(0.9);
    expect(state.dirty).toBe(true);
  });

  it('mirrors a recordSkipEvent-shaped (skip) record the same way', () => {
    const state = activeState();
    const skip = { event: 'skip', batchTarget: 'n00dles', count: 1 };
    mirrorBoundaryRecord(state, skip, 1000, 0);
    expect(state.entries[1]).toBe(skip);
    skip.count = 2; // simulates coalescing mutating it in place
    expect(state.entries[1].count).toBe(2);
  });

  it('appends exactly one boundary-cap record on crossing maxEntries, then mirrors nothing further', () => {
    const state = activeState();
    for (let i = 0; i < 5; i++) mirrorBoundaryRecord(state, { event: 'batch', i }, 1000, 0, BOUNDARY_WINDOW_MS, 5);
    // begin + 5 records reaches maxEntries=5 on the 5th push -> cap appended.
    expect(state.capped).toBe(true);
    const capRecords = state.entries.filter((e) => e.event === 'boundary-cap');
    expect(capRecords).toHaveLength(1);
    const lengthAtCap = state.entries.length;
    expect(mirrorBoundaryRecord(state, { event: 'batch', i: 99 }, 1000, 0, BOUNDARY_WINDOW_MS, 5)).toBe(false);
    expect(state.entries).toHaveLength(lengthAtCap);
  });

  it('BOUNDARY_LOG_MAX default is 5000', () => {
    expect(BOUNDARY_LOG_MAX).toBe(5000);
  });
});

describe('buildRankingEntry (Phase 35 WI2 -- hackJobGb publish)', () => {
  const t = { server: 'n00dles', minSecurityLevel: 1, maxMoney: 1000, score: 5, hackThreads: 10 };
  const live = { currentSecurity: 1, currentMoney: 500, minSecurityLevel: 1, maxMoney: 1000 };

  it('carries hackJobGb as hackThreads * hackRamCost', () => {
    const entry = buildRankingEntry(t, live, 700, 1.75);
    expect(entry.hackJobGb).toBe(17.5);
  });

  it('hackJobGb is null when hackThreads is not a number (excluded-from-candidates tick)', () => {
    const entry = buildRankingEntry({ ...t, hackThreads: undefined }, live, null, 1.75);
    expect(entry.hackJobGb).toBeNull();
  });

  it('carries every other seatability field unchanged', () => {
    const entry = buildRankingEntry(t, live, 700, 1.75);
    expect(entry).toMatchObject({
      server: 'n00dles',
      sec: 1,
      minSec: 1,
      money: 500,
      maxMoney: 1000,
      score: 5,
      pipelineCostGb: 700,
    });
  });

  it('pipelineCostGb passes through null unchanged', () => {
    expect(buildRankingEntry(t, live, null, 1.75).pipelineCostGb).toBeNull();
  });
});

describe('seedFloorReserve (Phase 35 WI5)', () => {
  it('seeds from the newest fresh skip record per server', () => {
    const entries = [
      { event: 'skip', batchTarget: 'a', lastTimestamp: 900, diagnosis: { batchCostGb: 10 } },
      { event: 'skip', batchTarget: 'a', lastTimestamp: 950, diagnosis: { batchCostGb: 20 } }, // newer -> wins
      { event: 'skip', batchTarget: 'b', lastTimestamp: 800, diagnosis: { batchCostGb: 5 } },
    ];
    const seed = seedFloorReserve(entries, 1000);
    expect(seed.get('a')).toBe(20);
    expect(seed.get('b')).toBe(5);
  });

  it('excludes records older than maxAgeMs -- the pre-install-aged guard (blocker-5 pin)', () => {
    const nowMs = 10_000_000;
    const entries = [
      { event: 'skip', batchTarget: 'phantasy', lastTimestamp: nowMs - FLOOR_SEED_MAX_AGE_MS - 1, diagnosis: { batchCostGb: 1684.9 } },
    ];
    const seed = seedFloorReserve(entries, nowMs);
    expect(seed.has('phantasy')).toBe(false);
  });

  it('includes a record exactly at the age boundary', () => {
    const nowMs = 10_000_000;
    const entries = [
      { event: 'skip', batchTarget: 's', lastTimestamp: nowMs - FLOOR_SEED_MAX_AGE_MS, diagnosis: { batchCostGb: 7 } },
    ];
    expect(seedFloorReserve(entries, nowMs).get('s')).toBe(7);
  });

  it('ignores non-skip events and skip events without a diagnosis', () => {
    const entries = [
      { event: 'batch', batchTarget: 'a', timestamp: 999 },
      { event: 'skip', batchTarget: 'b', lastTimestamp: 999 }, // no diagnosis
    ];
    expect(seedFloorReserve(entries, 1000).size).toBe(0);
  });

  it('falls back to firstTimestamp when lastTimestamp is absent', () => {
    const entries = [{ event: 'skip', batchTarget: 'a', firstTimestamp: 950, diagnosis: { batchCostGb: 3 } }];
    expect(seedFloorReserve(entries, 1000).get('a')).toBe(3);
  });

  it('empty/malformed input returns an empty Map, does not throw', () => {
    expect(seedFloorReserve([], 1000).size).toBe(0);
    expect(seedFloorReserve(null, 1000).size).toBe(0);
    expect(seedFloorReserve(undefined, 1000).size).toBe(0);
  });
});
