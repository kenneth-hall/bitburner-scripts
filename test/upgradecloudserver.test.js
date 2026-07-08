// Unit tests for src/upgradecloudserver.js's nextInstanceNumber (Phase 16, F7
// backfill -- module-private, exported for this test only).
import { describe, it, expect } from 'vitest';
import { nextInstanceNumber } from '../src/upgradecloudserver.js';

describe('nextInstanceNumber', () => {
  it('starts at 0 when no other server owns this size', () => {
    expect(nextInstanceNumber([], 64)).toBe(0);
  });

  it('picks the next instance number for a size already in use', () => {
    expect(nextInstanceNumber(['pserv-64gb-0', 'pserv-64gb-1'], 64)).toBe(2);
  });

  it('fills a gap before extending the run', () => {
    expect(nextInstanceNumber(['pserv-64gb-0', 'pserv-64gb-2'], 64)).toBe(1);
  });

  it('ignores instance numbers used at a different size', () => {
    expect(nextInstanceNumber(['pserv-32gb-0', 'pserv-32gb-1'], 64)).toBe(0);
  });

  it('ignores names not matching the pserv-<size>gb-<n> pattern', () => {
    expect(nextInstanceNumber(['cloud-0', 'cloud-1'], 64)).toBe(0);
  });
});
