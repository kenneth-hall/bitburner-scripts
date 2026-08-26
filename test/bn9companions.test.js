// Tests for Phase 43 WI-E's src/bn9companions.js (spec acceptance criteria WE1/WE5).
import { describe, it, expect } from 'vitest';
import {
  main,
  shouldLaunch,
  SLEEVE_SCRIPT,
  BLADEBURNER_SCRIPT,
  SYNC_THRESHOLD_ARG,
  STATE_FILE,
} from '../src/bn9companions.js';

describe('shouldLaunch (WE1: all four boolean combinations)', () => {
  it('gate closed, not running -> false (nothing to do)', () => {
    expect(shouldLaunch(false, false)).toBe(false);
  });
  it('gate closed, already running -> false (gate closing does not stop it, this fn only starts)', () => {
    expect(shouldLaunch(true, false)).toBe(false);
  });
  it('gate open, already running -> false (no double-launch)', () => {
    expect(shouldLaunch(true, true)).toBe(false);
  });
  it('gate open, not running -> true (launch)', () => {
    expect(shouldLaunch(false, true)).toBe(true);
  });
});

describe('shouldLaunch applied to both companion targets (WE1: two call sites, one function)', () => {
  it('sleeve gate is always-true: launches whenever not running, regardless of any other state', () => {
    expect(shouldLaunch(false, true)).toBe(true); // sleeve's own gateOpen is a literal `true`
  });
  it('bladeburner gate is conditional: does not launch while inBladeburner() reads false', () => {
    expect(shouldLaunch(false, false)).toBe(false);
  });
  it('bladeburner gate opening (false -> true) with the target not yet running -> launch', () => {
    expect(shouldLaunch(false, true)).toBe(true);
  });
});

describe('main() (fake ns integration)', () => {
  function makeFakeNs({ sleeveRunning = false, inBladeburnerThrows = false, inBladeburner = false, bladeburnerRunning = false, maxIterations = 1 } = {}) {
    const written = {};
    const execCalls = [];
    let iterations = 0;
    let currentSleeveRunning = sleeveRunning;
    let currentBladeburnerRunning = bladeburnerRunning;
    return {
      disableLog: () => {},
      scriptRunning: (script) => {
        if (script === SLEEVE_SCRIPT) return currentSleeveRunning;
        if (script === BLADEBURNER_SCRIPT) return currentBladeburnerRunning;
        return false;
      },
      exec: (script, host, threads, ...args) => {
        execCalls.push({ script, host, threads, args });
        if (script === SLEEVE_SCRIPT) currentSleeveRunning = true;
        if (script === BLADEBURNER_SCRIPT) currentBladeburnerRunning = true;
        return 1;
      },
      bladeburner: {
        inBladeburner: () => {
          if (inBladeburnerThrows) throw new Error('not joined');
          return inBladeburner;
        },
      },
      write: (file, content) => { written[file] = content; },
      sleep: async () => {
        iterations += 1;
        if (iterations >= maxIterations) throw new Error('__STOP__');
      },
      _written: written,
      _execCalls: execCalls,
    };
  }

  async function runOnePoll(fakeNs) {
    try {
      await main(fakeNs);
    } catch (err) {
      if (err.message !== '__STOP__') throw err;
    }
  }

  it('WE1 (via main): sleevemanager.js is launched with the syncThreshold arg when not running', async () => {
    const fakeNs = makeFakeNs({ sleeveRunning: false });
    await runOnePoll(fakeNs);
    const sleeveCall = fakeNs._execCalls.find((c) => c.script === SLEEVE_SCRIPT);
    expect(sleeveCall).toBeDefined();
    expect(sleeveCall.args).toEqual([SYNC_THRESHOLD_ARG]);
  });

  it('does not re-launch sleevemanager.js when already running', async () => {
    const fakeNs = makeFakeNs({ sleeveRunning: true });
    await runOnePoll(fakeNs);
    expect(fakeNs._execCalls.some((c) => c.script === SLEEVE_SCRIPT)).toBe(false);
  });

  it('does not launch bladeburnermanager.js while inBladeburner() reads false', async () => {
    const fakeNs = makeFakeNs({ inBladeburner: false });
    await runOnePoll(fakeNs);
    expect(fakeNs._execCalls.some((c) => c.script === BLADEBURNER_SCRIPT)).toBe(false);
  });

  it('launches bladeburnermanager.js once inBladeburner() reads true', async () => {
    const fakeNs = makeFakeNs({ inBladeburner: true });
    await runOnePoll(fakeNs);
    expect(fakeNs._execCalls.some((c) => c.script === BLADEBURNER_SCRIPT)).toBe(true);
  });

  it('a thrown inBladeburner() call is treated as gate-closed, not a crash', async () => {
    const fakeNs = makeFakeNs({ inBladeburnerThrows: true });
    await runOnePoll(fakeNs);
    expect(fakeNs._execCalls.some((c) => c.script === BLADEBURNER_SCRIPT)).toBe(false);
  });

  it('WE5-adjacent: writes bn9companions-state.json with running/gated status for both targets', async () => {
    const fakeNs = makeFakeNs({ sleeveRunning: false, inBladeburner: true });
    await runOnePoll(fakeNs);
    const state = JSON.parse(fakeNs._written[STATE_FILE]);
    expect(state.sleeve.gateOpen).toBe(true);
    expect(state.sleeve.running).toBe(true); // launched this same tick, then re-read
    expect(state.bladeburner.gateOpen).toBe(true);
    expect(state.bladeburner.running).toBe(true);
    expect(typeof state.ts).toBe('number');
  });

  it('WE3-adjacent: a companion that comes back within the next poll is re-launched (idempotent per-poll check, no restart of this script needed)', async () => {
    const fakeNs = makeFakeNs({ sleeveRunning: true, maxIterations: 2 });
    // Simulate the sleeve dying between polls by flipping scriptRunning to false after the
    // first sleep tick.
    let pollCount = 0;
    const originalScriptRunning = fakeNs.scriptRunning;
    fakeNs.scriptRunning = (script) => {
      if (script === SLEEVE_SCRIPT && pollCount >= 1) return false;
      return originalScriptRunning(script);
    };
    const originalSleep = fakeNs.sleep;
    fakeNs.sleep = async () => {
      pollCount += 1;
      return originalSleep();
    };
    await runOnePoll(fakeNs);
    expect(fakeNs._execCalls.some((c) => c.script === SLEEVE_SCRIPT)).toBe(true);
  });
});
