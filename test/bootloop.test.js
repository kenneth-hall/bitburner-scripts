// Unit tests for src/bootloop.js's pure logic (parseBootControl,
// chooseBootAction). bootloop.js is import-free by design but still exports
// its pure helpers, so this imports directly from it like any other suite.
import { describe, it, expect } from 'vitest';
import { parseBootControl, chooseBootAction } from '../src/bootloop.js';

const VALID = { target: 'n00dles', minSecurityLevel: 1, maxMoney: 1_000_000, securityEpsilon: 1, moneyFraction: 0.9 };

describe('parseBootControl', () => {
  it('round-trips a well-formed control file', () => {
    const result = parseBootControl(JSON.stringify(VALID));
    expect(result).toEqual({ ok: true, config: VALID });
  });

  it('treats an empty string (missing file) as not ok', () => {
    expect(parseBootControl('')).toEqual({ ok: false });
  });

  it('treats garbage JSON as not ok', () => {
    expect(parseBootControl('{not valid json')).toEqual({ ok: false });
  });

  it('treats valid JSON missing a field as not ok', () => {
    const { moneyFraction, ...missingField } = VALID;
    expect(parseBootControl(JSON.stringify(missingField))).toEqual({ ok: false });
  });

  it('treats a non-finite number field as not ok', () => {
    expect(parseBootControl(JSON.stringify({ ...VALID, securityEpsilon: NaN }))).toEqual({ ok: false });
    expect(parseBootControl(JSON.stringify({ ...VALID, maxMoney: Infinity }))).toEqual({ ok: false });
  });

  it('treats an empty-string target as not ok', () => {
    expect(parseBootControl(JSON.stringify({ ...VALID, target: '' }))).toEqual({ ok: false });
  });

  it('treats a non-string target as not ok', () => {
    expect(parseBootControl(JSON.stringify({ ...VALID, target: 123 }))).toEqual({ ok: false });
  });
});

describe('chooseBootAction', () => {
  const base = { currentSecurity: 1, minSecurityLevel: 1, currentMoney: 900, maxMoney: 1000, securityEpsilon: 1, moneyFraction: 0.9 };

  it('weakens when security is above the epsilon boundary', () => {
    expect(chooseBootAction({ ...base, currentSecurity: 2.01 })).toBe('weaken');
  });

  it('does not weaken exactly at minSecurityLevel + securityEpsilon (strict >)', () => {
    expect(chooseBootAction({ ...base, currentSecurity: 2 })).not.toBe('weaken');
  });

  it('grows when money is below the fraction boundary', () => {
    expect(chooseBootAction({ ...base, currentMoney: 800 })).toBe('grow');
  });

  it('hacks exactly at maxMoney * moneyFraction (strict < for grow)', () => {
    expect(chooseBootAction({ ...base, currentMoney: 900 })).toBe('hack');
  });

  it('hacks when prepped (security at min, money at max)', () => {
    expect(chooseBootAction({ ...base, currentSecurity: 1, currentMoney: 1000 })).toBe('hack');
  });
});
