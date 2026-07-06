// Unit tests for src/hosts.js's tryRoot/listHosts/getHosts split (Phase 13
// consolidation, S6/S7). Fake-ns style: plain objects exposing only the
// methods each helper touches, no mocking framework.
import { describe, it, expect } from 'vitest';
import { tryRoot, listHosts, getHosts, HOME_RESERVE_GB } from '../src/hosts.js';

const OPENER_FILES = ['BruteSSH.exe', 'FTPCrack.exe', 'relaySMTP.exe', 'HTTPWorm.exe', 'SQLInject.exe'];

/**
 * Builds a fake ns covering everything tryRoot/listHosts/getHosts touch.
 * `rooted` is a mutable Set the test can pre-seed and inspect after nuke().
 * `ownedFiles` controls which port openers ns.fileExists reports as owned.
 */
function makeHostsNs({ scanTable = {}, rooted = new Set(), ownedFiles = new Set(OPENER_FILES), hackLevel = 100, servers = {}, purchased = [] } = {}) {
  const calls = { openers: [], nuke: [], tprint: [] };
  const openerCall = (file) => (host) => calls.openers.push([file, host]);

  return {
    calls,
    rooted,
    scan: (host) => scanTable[host] ?? [],
    hasRootAccess: (host) => rooted.has(host),
    fileExists: (file) => ownedFiles.has(file),
    getHackingLevel: () => hackLevel,
    getServerRequiredHackingLevel: (host) => servers[host]?.reqLevel ?? 0,
    getServerNumPortsRequired: (host) => servers[host]?.reqPorts ?? 0,
    getServerMaxRam: (host) => servers[host]?.maxRam ?? 0,
    getServerUsedRam: (host) => servers[host]?.usedRam ?? 0,
    nuke: (host) => {
      calls.nuke.push(host);
      rooted.add(host);
    },
    brutessh: openerCall('BruteSSH.exe'),
    ftpcrack: openerCall('FTPCrack.exe'),
    relaysmtp: openerCall('relaySMTP.exe'),
    httpworm: openerCall('HTTPWorm.exe'),
    sqlinject: openerCall('SQLInject.exe'),
    tprint: (msg) => calls.tprint.push(msg),
    cloud: { getServerNames: () => purchased },
  };
}

describe('tryRoot', () => {
  it('returns true immediately for an already-rooted server, no side effects', () => {
    const ns = makeHostsNs({ rooted: new Set(['n00dles']) });
    expect(tryRoot(ns, 'n00dles')).toBe(true);
    expect(ns.calls.openers).toEqual([]);
    expect(ns.calls.nuke).toEqual([]);
  });

  it('roots a server when level and ports are satisfied, using only owned openers', () => {
    const ns = makeHostsNs({
      hackLevel: 50,
      ownedFiles: new Set(['BruteSSH.exe', 'FTPCrack.exe']),
      servers: { foodnstuff: { reqLevel: 10, reqPorts: 2 } },
    });
    expect(tryRoot(ns, 'foodnstuff')).toBe(true);
    expect(ns.calls.openers).toEqual([
      ['BruteSSH.exe', 'foodnstuff'],
      ['FTPCrack.exe', 'foodnstuff'],
    ]);
    expect(ns.calls.nuke).toEqual(['foodnstuff']);
    expect(ns.calls.tprint).toHaveLength(1);
    expect(ns.calls.tprint[0]).toMatch(/rooted new host foodnstuff/);
  });

  it('returns false without nuking when required level exceeds hacking level', () => {
    const ns = makeHostsNs({
      hackLevel: 5,
      servers: { 'the-hub': { reqLevel: 500, reqPorts: 1 } },
    });
    expect(tryRoot(ns, 'the-hub')).toBe(false);
    expect(ns.calls.nuke).toEqual([]);
  });

  it('returns false without nuking when required ports exceed owned openers', () => {
    const ns = makeHostsNs({
      ownedFiles: new Set(['BruteSSH.exe']),
      servers: { 'rho-construction': { reqLevel: 1, reqPorts: 3 } },
    });
    expect(tryRoot(ns, 'rho-construction')).toBe(false);
    expect(ns.calls.nuke).toEqual([]);
  });
});

describe('listHosts', () => {
  it('excludes an unrooted network host', () => {
    const ns = makeHostsNs({
      scanTable: { home: ['locked'] },
      servers: { locked: { maxRam: 32, usedRam: 0 } },
    });
    const hosts = listHosts(ns);
    expect(hosts.find((h) => h.hostname === 'locked')).toBeUndefined();
  });

  it('includes a rooted network host with max/free RAM', () => {
    const ns = makeHostsNs({
      scanTable: { home: ['n00dles'] },
      rooted: new Set(['n00dles']),
      servers: { n00dles: { maxRam: 16, usedRam: 4 } },
    });
    const hosts = listHosts(ns);
    const entry = hosts.find((h) => h.hostname === 'n00dles');
    expect(entry).toEqual({ hostname: 'n00dles', maxRam: 16, freeRam: 12 });
  });

  it('includes purchased servers unconditionally', () => {
    const ns = makeHostsNs({
      purchased: ['cloud-0'],
      servers: { 'cloud-0': { maxRam: 128, usedRam: 32 } },
    });
    const hosts = listHosts(ns);
    expect(hosts.find((h) => h.hostname === 'cloud-0')).toEqual({ hostname: 'cloud-0', maxRam: 128, freeRam: 96 });
  });

  it('a purchased server that also appears in the network scan appears exactly once (double-count regression)', () => {
    const ns = makeHostsNs({
      scanTable: { home: ['cloud-0'] },
      rooted: new Set(['cloud-0']), // purchased servers are always rooted, as they are live
      purchased: ['cloud-0'],
      servers: { 'cloud-0': { maxRam: 64, usedRam: 0 } },
    });
    const hosts = listHosts(ns);
    expect(hosts.filter((h) => h.hostname === 'cloud-0')).toHaveLength(1);
  });

  it('reports home with the reserve held back, clamped at 0 when used exceeds max minus reserve', () => {
    const ns = makeHostsNs({
      servers: { home: { maxRam: 8, usedRam: 8 } }, // used >= maxRam - HOME_RESERVE_GB
    });
    const homeEntry = listHosts(ns).find((h) => h.hostname === 'home');
    expect(homeEntry.freeRam).toBe(0);
    expect(HOME_RESERVE_GB).toBe(32);
  });
});

describe('getHosts composition', () => {
  it('roots a newly-rootable host, then includes it in the returned list', () => {
    const ns = makeHostsNs({
      scanTable: { home: ['foodnstuff'] },
      hackLevel: 50,
      ownedFiles: new Set(['BruteSSH.exe']),
      servers: { foodnstuff: { reqLevel: 1, reqPorts: 1, maxRam: 16, usedRam: 0 } },
    });
    const hosts = getHosts(ns);
    expect(ns.calls.nuke).toEqual(['foodnstuff']);
    expect(hosts.find((h) => h.hostname === 'foodnstuff')).toEqual({ hostname: 'foodnstuff', maxRam: 16, freeRam: 16 });
  });
});
