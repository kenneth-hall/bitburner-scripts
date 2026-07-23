// Pure-function tests for the Phase 30 survivor respect-rate sampler
// (src/gangratelog.js). Both functions under test are ns-free by design --
// main() is thin ns.read/ns.write plumbing around them.
import { describe, it, expect } from 'vitest';
import { summarizeSample, appendCapped, RING_CAP, MAX_STATE_AGE_MS } from '../src/gangratelog.js';

const stateFixture = (overrides = {}) => ({
  timestamp: 1000,
  respect: 25_000_000,
  respectGainRate: 624.4,
  moneyGainRate: 468_849,
  wantedLevel: 1,
  wantedPenalty: 0.9999,
  netWantedRate: -0.135,
  territory: 0.1428,
  memberCount: 3,
  members: [
    { name: 'a', hackAscMult: 79.8 },
    { name: 'b', hackAscMult: 6.9 },
    { name: 'c', hackAscMult: 79.4 },
  ],
  ...overrides,
});

describe('summarizeSample', () => {
  it('distils the fields the series needs and stamps state age', () => {
    const s = summarizeSample(stateFixture(), 6000);
    expect(s.t).toBe(6000);
    expect(s.stateAgeMs).toBe(5000); // 6000 - timestamp(1000)
    expect(s.respectGainRate).toBe(624.4);
    expect(s.wantedPenalty).toBe(0.9999);
    expect(s.territory).toBe(0.1428);
    expect(s.memberCount).toBe(3);
  });

  it('computes aggregate hack ascension mult (mean/min/max)', () => {
    const s = summarizeSample(stateFixture(), 6000);
    expect(s.ascHackMin).toBe(6.9);
    expect(s.ascHackMax).toBe(79.8);
    expect(s.ascHackMean).toBeCloseTo((79.8 + 6.9 + 79.4) / 3, 6);
  });

  it('returns null when there are no members (nothing meaningful to sample)', () => {
    expect(summarizeSample(stateFixture({ members: [] }), 6000)).toBeNull();
    expect(summarizeSample(null, 6000)).toBeNull();
    expect(summarizeSample({}, 6000)).toBeNull();
  });

  it('tolerates members missing hackAscMult without crashing', () => {
    const s = summarizeSample(
      stateFixture({ members: [{ name: 'a' }, { name: 'b', hackAscMult: 5 }] }),
      6000,
    );
    expect(s.ascHackMean).toBe(5); // only the numeric one counts
    expect(s.memberCount).toBe(3); // preserved from state.memberCount
  });

  it('leaves ascension mults null when no member reports one', () => {
    const s = summarizeSample(stateFixture({ members: [{ name: 'a' }] }), 6000);
    expect(s.ascHackMean).toBeNull();
    expect(s.ascHackMin).toBeNull();
    expect(s.ascHackMax).toBeNull();
  });

  it('reports null state age when timestamp is absent', () => {
    const s = summarizeSample(stateFixture({ timestamp: undefined }), 6000);
    expect(s.stateAgeMs).toBeNull();
  });

  // Staleness cutoff (2026-07-23): entering a gang-less node left this resident
  // replaying the previous node's frozen gang state into the 14-day series.
  it('drops a sample staler than MAX_STATE_AGE_MS -- a dead node, not a stalled writer', () => {
    const nowMs = 1000 + MAX_STATE_AGE_MS + 1; // timestamp(1000) + one ms past the cutoff
    expect(summarizeSample(stateFixture(), nowMs)).toBeNull();
  });

  it('keeps a sample exactly AT the cutoff (strict >, so the boundary still records)', () => {
    const nowMs = 1000 + MAX_STATE_AGE_MS;
    const s = summarizeSample(stateFixture(), nowMs);
    expect(s).not.toBeNull();
    expect(s.stateAgeMs).toBe(MAX_STATE_AGE_MS);
  });

  it('still records a moderately stale writer -- a real stall stays visible as growing age', () => {
    const s = summarizeSample(stateFixture(), 1000 + 10 * 60_000); // 10 min stale
    expect(s).not.toBeNull();
    expect(s.stateAgeMs).toBe(10 * 60_000);
  });

  it('honours an explicit maxStateAgeMs override', () => {
    expect(summarizeSample(stateFixture(), 6000, 4000)).toBeNull(); // age 5000 > 4000
    expect(summarizeSample(stateFixture(), 6000, 5000)).not.toBeNull(); // age 5000, not >
  });

  it('never drops on age alone when the timestamp is absent -- unknown age is not a dead gang', () => {
    const s = summarizeSample(stateFixture({ timestamp: undefined }), 999_999_999, 1);
    expect(s).not.toBeNull();
    expect(s.stateAgeMs).toBeNull();
  });
});

describe('appendCapped', () => {
  it('appends newest to the end', () => {
    expect(appendCapped([1, 2], 3, 10)).toEqual([1, 2, 3]);
  });

  it('drops the oldest samples past the cap', () => {
    expect(appendCapped([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });

  it('starts a fresh series from non-array input', () => {
    expect(appendCapped(null, 1, 10)).toEqual([1]);
    expect(appendCapped(undefined, 1, 10)).toEqual([1]);
  });

  it('does not mutate the input array', () => {
    const src = [1, 2, 3];
    appendCapped(src, 4, 3);
    expect(src).toEqual([1, 2, 3]);
  });

  it('holds exactly RING_CAP samples under sustained appends', () => {
    let series = [];
    for (let i = 0; i < RING_CAP + 500; i++) series = appendCapped(series, i, RING_CAP);
    expect(series.length).toBe(RING_CAP);
    expect(series[series.length - 1]).toBe(RING_CAP + 499); // newest kept
    expect(series[0]).toBe(500); // oldest 500 dropped
  });
});
