// Unit tests for src/factionwatcher.js's pure decision functions: newlyJoined
// (poll-to-poll diff) and missingJoinEvents (startup reconciliation against
// the events log).
import { describe, it, expect } from 'vitest';
import { newlyJoined, missingJoinEvents } from '../src/factionwatcher.js';

const RESET_A = 1_000;
const RESET_B = 2_000;

describe('newlyJoined', () => {
  it('returns names present now but not before', () => {
    expect(newlyJoined(['CyberSec'], ['CyberSec', 'Netburners'])).toEqual(['Netburners']);
  });

  it('returns empty when nothing changed', () => {
    expect(newlyJoined(['CyberSec'], ['CyberSec'])).toEqual([]);
  });

  it('returns empty when starting from no factions and staying at none', () => {
    expect(newlyJoined([], [])).toEqual([]);
  });

  it('does not report a name that disappeared (factions are never left)', () => {
    expect(newlyJoined(['CyberSec', 'Netburners'], ['Netburners'])).toEqual([]);
  });
});

describe('missingJoinEvents', () => {
  it('flags a current membership with no recorded event this reset', () => {
    const events = [];
    expect(missingJoinEvents(['CyberSec'], events, RESET_A)).toEqual(['CyberSec']);
  });

  it('does not flag a membership already recorded this reset', () => {
    const events = [{ type: 'faction-joined', faction: 'CyberSec', resetId: RESET_A }];
    expect(missingJoinEvents(['CyberSec'], events, RESET_A)).toEqual([]);
  });

  it('re-flags a membership recorded under a different (older) reset', () => {
    const events = [{ type: 'faction-joined', faction: 'CyberSec', resetId: RESET_A }];
    expect(missingJoinEvents(['CyberSec'], events, RESET_B)).toEqual(['CyberSec']);
  });

  it('ignores non-faction-joined event types when checking for a record', () => {
    const events = [{ type: 'backdoor-installed', server: 'CSEC', resetId: RESET_A }];
    expect(missingJoinEvents(['CyberSec'], events, RESET_A)).toEqual(['CyberSec']);
  });
});
