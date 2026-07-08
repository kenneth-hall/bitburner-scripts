// Unit tests for src/cloudcosts.js's standardSizes (Phase 16, F7 backfill).
import { describe, it, expect } from 'vitest';
import { standardSizes } from '../src/cloudcosts.js';

describe('standardSizes', () => {
  it('builds powers of two from 16 up to the limit, inclusive', () => {
    expect(standardSizes(256)).toEqual([16, 32, 64, 128, 256]);
  });

  it('excludes sizes above the limit', () => {
    expect(standardSizes(200)).toEqual([16, 32, 64, 128]);
  });

  it('returns just the floor size when the limit is below the next tier', () => {
    expect(standardSizes(16)).toEqual([16]);
  });

  it('returns an empty list when the limit is below the starting size', () => {
    expect(standardSizes(8)).toEqual([]);
  });
});
