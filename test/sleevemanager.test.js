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
