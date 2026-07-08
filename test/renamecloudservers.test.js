// Unit tests for src/renamecloudservers.js's nextIndex (Phase 16, F7 backfill
// -- module-private, exported for this test only).
import { describe, it, expect } from 'vitest';
import { nextIndex } from '../src/renamecloudservers.js';

describe('nextIndex', () => {
  it('starts at 0 for an empty set', () => {
    expect(nextIndex(new Set())).toBe(0);
  });

  it('picks the next index after a contiguous run', () => {
    expect(nextIndex(new Set([0, 1, 2]))).toBe(3);
  });

  it('fills a gap before extending the run', () => {
    expect(nextIndex(new Set([0, 2]))).toBe(1);
  });
});
