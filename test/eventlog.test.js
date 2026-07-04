// Unit tests for src/eventlog.js's recordEvent: synchronous read-modify-write
// append to the persistent, whole-playthrough events log, patterned on
// test/translog.test.js's recordTransaction tests.
import { describe, it, expect } from 'vitest';
import { recordEvent, EVENTS_FILE } from '../src/eventlog.js';

const RESET_ID = 1_720_000_000_000;

function makeMockNs({ readReturn = '' } = {}) {
  const calls = { sequence: [], read: [], write: [] };
  return {
    calls,
    read: (filename) => {
      calls.sequence.push('read');
      calls.read.push([filename]);
      return readReturn;
    },
    write: (filename, data, mode) => {
      calls.sequence.push('write');
      calls.write.push([filename, data, mode]);
    },
    getResetInfo: () => ({ lastAugReset: RESET_ID }),
  };
}

describe('recordEvent', () => {
  it('starts a fresh one-element array when the file is missing/empty', () => {
    const ns = makeMockNs({ readReturn: '' });
    recordEvent(ns, { type: 'faction-joined', faction: 'CyberSec' });

    expect(ns.calls.read[0]).toEqual([EVENTS_FILE]);
    const [filename, data, mode] = ns.calls.write[0];
    expect(filename).toBe(EVENTS_FILE);
    expect(mode).toBe('w');
    const entries = JSON.parse(data);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('faction-joined');
    expect(entries[0].faction).toBe('CyberSec');
  });

  it('appends to an existing array, preserving prior entries', () => {
    const existing = [{ type: 'faction-joined', faction: 'CyberSec', time: 'x', timestamp: 1, resetId: RESET_ID }];
    const ns = makeMockNs({ readReturn: JSON.stringify(existing) });

    recordEvent(ns, { type: 'backdoor-installed', server: 'CSEC' });

    const [, data] = ns.calls.write[0];
    const entries = JSON.parse(data);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(existing[0]);
    expect(entries[1].type).toBe('backdoor-installed');
    expect(entries[1].server).toBe('CSEC');
  });

  it('stamps time, timestamp, and resetId from getResetInfo, overriding any caller-supplied values', () => {
    const ns = makeMockNs({ readReturn: '' });
    recordEvent(ns, { type: 'backdoor-installed', server: 'avmnite-02h', resetId: 999, timestamp: 1 });

    const [, data] = ns.calls.write[0];
    const [entry] = JSON.parse(data);
    expect(entry.resetId).toBe(RESET_ID);
    expect(typeof entry.timestamp).toBe('number');
    expect(entry.timestamp).not.toBe(1);
    expect(typeof entry.time).toBe('string');
  });

  it('reads before it writes, with no call in between', () => {
    const ns = makeMockNs({ readReturn: '' });
    recordEvent(ns, { type: 'faction-joined', faction: 'Netburners' });
    expect(ns.calls.sequence).toEqual(['read', 'write']);
  });
});
