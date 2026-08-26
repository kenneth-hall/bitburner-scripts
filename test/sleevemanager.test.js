// Pure-function tests for sleevemanager.js's decideSleeveAction. The whole point of the
// script is that it is CONSERVATIVE: it only ever treats IDLE as a fault, and never
// overrides a task a human deliberately set. These tests pin that boundary, because the
// failure mode of getting it wrong is silent -- the script would fight the operator.
import { describe, it, expect } from 'vitest';
import { decideSleeveAction } from '../src/sleevemanager.js';

describe('decideSleeveAction', () => {
  it('assigns crime when the task is null -- the exact state a finished probe leaves behind', () => {
    // sleevepoolprobe.js restored originalTask: null on 2026-08-19 and the sleeve idled
    // unnoticed. This is the regression that motivated the whole script.
    const d = decideSleeveAction(null);
    expect(d.act).toBe('crime');
    expect(d.why).toMatch(/idle/);
  });

  it('assigns crime when the task is undefined', () => {
    expect(decideSleeveAction(undefined).act).toBe('crime');
  });

  it('leaves an existing crime alone', () => {
    const d = decideSleeveAction({ type: 'CRIME', crimeType: 'Mug' });
    expect(d.act).toBe('none');
  });

  it('does NOT re-assign a different crime -- Homicide over Mug is a choice, not a fault', () => {
    const d = decideSleeveAction({ type: 'CRIME', crimeType: 'Homicide' });
    expect(d.act).toBe('none');
    expect(d.why).toMatch(/Homicide/);
  });

  it('never overrides Shock Recovery -- shock 0 gates sleeve augs, so parking there is deliberate', () => {
    const d = decideSleeveAction({ type: 'RECOVERY' });
    expect(d.act).toBe('none');
    expect(d.why).toMatch(/deliberate/);
  });

  it('never overrides Synchronize', () => {
    expect(decideSleeveAction({ type: 'SYNCHRO' }).act).toBe('none');
  });

  it('never assigns over a Bladeburner task, even though we would not choose one', () => {
    // Sleeve contracts were measured competing for the player's supply pool, so this script
    // never SETS a Bladeburner task -- but if an operator sets one, that is theirs to undo.
    const d = decideSleeveAction({ type: 'BLADEBURNER', actionName: 'Take on contracts' });
    expect(d.act).toBe('none');
  });

  it('leaves class, company, faction, infiltrate and support tasks alone', () => {
    for (const type of ['CLASS', 'COMPANY', 'FACTION', 'INFILTRATE', 'SUPPORT']) {
      expect(decideSleeveAction({ type }).act).toBe('none');
    }
  });
});

// Phase 43 WI-F: the syncThreshold active-policy mode, additive and opt-in.
describe('decideSleeveAction -- syncThreshold mode (Phase 43 WI-F)', () => {
  // WF1: non-regression -- decideSleeveAction(taskNow, sync, undefined) is byte-identical to
  // the pre-existing function for every case its current tests already cover.
  describe('WF1: syncThreshold undefined is byte-identical to the legacy default', () => {
    it('idle -> crime, same as before', () => {
      expect(decideSleeveAction(null, 50, undefined)).toEqual(decideSleeveAction(null));
    });
    it('already on crime -> none, same as before', () => {
      const task = { type: 'CRIME', crimeType: 'Mug' };
      expect(decideSleeveAction(task, 50, undefined)).toEqual(decideSleeveAction(task));
    });
    it('already synchronizing -> none (deference), same as before -- the legacy mode never touches Synchro', () => {
      const task = { type: 'SYNCHRO' };
      expect(decideSleeveAction(task, 99, undefined)).toEqual(decideSleeveAction(task));
    });
    it('every other deliberate task -> none, same as before', () => {
      for (const type of ['RECOVERY', 'CLASS', 'COMPANY', 'FACTION', 'BLADEBURNER', 'INFILTRATE', 'SUPPORT']) {
        const task = { type };
        expect(decideSleeveAction(task, 10, undefined)).toEqual(decideSleeveAction(task));
      }
    });
  });

  // WF2: decideSleeveAction(taskNow, sync, 50) across every listed case.
  describe('WF2: threshold mode across idle/synchronizing/other-task boundaries', () => {
    const THRESHOLD = 50;

    it('idle + low sync -> synchronize', () => {
      const d = decideSleeveAction(null, 10, THRESHOLD);
      expect(d.act).toBe('synchronize');
    });

    it('idle + high sync -> crime', () => {
      const d = decideSleeveAction(null, 80, THRESHOLD);
      expect(d.act).toBe('crime');
    });

    it('idle + sync EXACTLY at threshold -> crime (>=, not >)', () => {
      const d = decideSleeveAction(null, THRESHOLD, THRESHOLD);
      expect(d.act).toBe('crime');
    });

    it('already-synchronizing + sync crossed threshold -> crime', () => {
      const d = decideSleeveAction({ type: 'SYNCHRO' }, 51, THRESHOLD);
      expect(d.act).toBe('crime');
    });

    it('already-synchronizing + still below -> none', () => {
      const d = decideSleeveAction({ type: 'SYNCHRO' }, 49, THRESHOLD);
      expect(d.act).toBe('none');
      expect(d.why).toMatch(/synchronizing/);
    });

    it('already on crime -> none, at any sync (mirrors the default mode\'s crime deference)', () => {
      expect(decideSleeveAction({ type: 'CRIME', crimeType: 'Mug' }, 10, THRESHOLD).act).toBe('none');
      expect(decideSleeveAction({ type: 'CRIME', crimeType: 'Mug' }, 90, THRESHOLD).act).toBe('none');
    });

    it('any other deliberate task at any sync -> none (unchanged deference -- this mode only arbitrates Synchronize vs Crime)', () => {
      for (const type of ['RECOVERY', 'CLASS', 'COMPANY', 'FACTION', 'BLADEBURNER', 'INFILTRATE', 'SUPPORT']) {
        expect(decideSleeveAction({ type }, 10, THRESHOLD).act).toBe('none');
        expect(decideSleeveAction({ type }, 90, THRESHOLD).act).toBe('none');
      }
    });
  });
});
