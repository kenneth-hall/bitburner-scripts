// Unit tests for src/hosts.js's tryRoot: the rooting block extracted out of
// getHosts, covering already-rooted, successfully-rootable, level-too-high,
// and not-enough-ports cases.
import { describe, it, expect } from 'vitest';
import { tryRoot } from '../src/hosts.js';

function makeMockNs({
  hasRootAccess = false,
  ownedFiles = [],
  requiredHackingLevel = 1,
  numPortsRequired = 0,
  hackingLevel = 1,
} = {}) {
  const calls = { open: [], nuke: [], tprint: [] };
  return {
    calls,
    hasRootAccess: () => hasRootAccess,
    fileExists: (file) => ownedFiles.includes(file),
    getServerRequiredHackingLevel: () => requiredHackingLevel,
    getServerNumPortsRequired: () => numPortsRequired,
    getHackingLevel: () => hackingLevel,
    brutessh: (host) => calls.open.push(['brutessh', host]),
    ftpcrack: (host) => calls.open.push(['ftpcrack', host]),
    relaysmtp: (host) => calls.open.push(['relaysmtp', host]),
    httpworm: (host) => calls.open.push(['httpworm', host]),
    sqlinject: (host) => calls.open.push(['sqlinject', host]),
    nuke: (host) => calls.nuke.push(host),
    tprint: (msg) => calls.tprint.push(msg),
  };
}

describe('tryRoot', () => {
  it('returns true immediately for an already-rooted server, no side effects', () => {
    const ns = makeMockNs({ hasRootAccess: true });
    expect(tryRoot(ns, 'n00dles')).toBe(true);
    expect(ns.calls.open).toEqual([]);
    expect(ns.calls.nuke).toEqual([]);
  });

  it('opens every owned port program and nukes when rootable', () => {
    const ns = makeMockNs({
      hasRootAccess: false,
      ownedFiles: ['BruteSSH.exe', 'FTPCrack.exe'],
      requiredHackingLevel: 5,
      numPortsRequired: 2,
      hackingLevel: 10,
    });
    expect(tryRoot(ns, 'joesguns')).toBe(true);
    expect(ns.calls.open).toEqual([
      ['brutessh', 'joesguns'],
      ['ftpcrack', 'joesguns'],
    ]);
    expect(ns.calls.nuke).toEqual(['joesguns']);
    expect(ns.calls.tprint).toHaveLength(1);
    expect(ns.calls.tprint[0]).toMatch(/rooted new host joesguns/);
  });

  it('returns false without nuking when required hacking level is too high', () => {
    const ns = makeMockNs({
      hasRootAccess: false,
      ownedFiles: ['BruteSSH.exe'],
      requiredHackingLevel: 500,
      numPortsRequired: 1,
      hackingLevel: 10,
    });
    expect(tryRoot(ns, 'foodnstuff')).toBe(false);
    expect(ns.calls.nuke).toEqual([]);
  });

  it('returns false without nuking when not enough port openers are owned', () => {
    const ns = makeMockNs({
      hasRootAccess: false,
      ownedFiles: ['BruteSSH.exe'],
      requiredHackingLevel: 5,
      numPortsRequired: 3,
      hackingLevel: 10,
    });
    expect(tryRoot(ns, 'harakiri-sushi')).toBe(false);
    expect(ns.calls.open).toEqual([]);
    expect(ns.calls.nuke).toEqual([]);
  });
});
