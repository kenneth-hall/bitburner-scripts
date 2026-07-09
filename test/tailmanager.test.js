// Unit tests for src/tailmanager.js's pure helpers (Phase 18).
import { describe, it, expect } from 'vitest';
import { computeDefaultLayout, parseLayoutFile, reconcileTick, MANAGED_TAILS, GEOMETRY_EPSILON_PX } from '../src/tailmanager.js';

describe('computeDefaultLayout', () => {
  it('tiles all five managed windows without overlap inside a 1920x1080 frame', () => {
    const layout = computeDefaultLayout(1920, 1080, MANAGED_TAILS);
    const keys = Object.keys(layout);
    expect(keys).toHaveLength(MANAGED_TAILS.length);

    // No two windows overlap: for every pair, one is fully to the left/right
    // or fully above/below the other.
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = layout[keys[i]];
        const b = layout[keys[j]];
        const separatedX = a.x + a.width <= b.x || b.x + b.width <= a.x;
        const separatedY = a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(separatedX || separatedY).toBe(true);
      }
    }
  });

  it('keeps every window inside the frame horizontally', () => {
    const layout = computeDefaultLayout(1920, 1080, MANAGED_TAILS);
    for (const key of Object.keys(layout)) {
      expect(layout[key].x).toBeGreaterThanOrEqual(0);
      expect(layout[key].x + layout[key].width).toBeLessThanOrEqual(1920);
    }
  });

  it('starts a second column when the first would overflow gameH', () => {
    // Small height forces every window past the first to overflow.
    const entries = [
      { script: 'a.js', defaultW: 100, defaultH: 100 },
      { script: 'b.js', defaultW: 100, defaultH: 100 },
    ];
    const layout = computeDefaultLayout(1000, 150, entries);
    expect(layout['a.js'].y).toBe(8);
    // b.js's y + height (8 + 100 + 100 = 208) would exceed gameH=150 -> new column.
    expect(layout['b.js'].y).toBe(8);
    expect(layout['b.js'].x).toBeLessThan(layout['a.js'].x);
  });

  it('is deterministic', () => {
    const a = computeDefaultLayout(1920, 1080, MANAGED_TAILS);
    const b = computeDefaultLayout(1920, 1080, MANAGED_TAILS);
    expect(a).toEqual(b);
  });

  it('returns {} for an empty entry list', () => {
    expect(computeDefaultLayout(1920, 1080, [])).toEqual({});
  });
});

describe('parseLayoutFile', () => {
  it('round-trips a saved layout', () => {
    const saved = { 'daemon.js': { x: 10, y: 20, width: 800, height: 400, fontSize: 14, minimized: false } };
    expect(parseLayoutFile(JSON.stringify(saved))).toEqual(saved);
  });

  it('returns {} for an empty string (missing file)', () => {
    expect(parseLayoutFile('')).toEqual({});
  });

  it('returns {} for malformed JSON', () => {
    expect(parseLayoutFile('not json')).toEqual({});
  });

  it('returns {} for non-object JSON (array)', () => {
    expect(parseLayoutFile('[]')).toEqual({});
  });

  it('returns {} for non-object JSON (number)', () => {
    expect(parseLayoutFile('3')).toEqual({});
  });

  it('returns {} for JSON null', () => {
    expect(parseLayoutFile('null')).toEqual({});
  });

  it('preserves partial per-window fields', () => {
    const saved = { 'daemon.js': { x: 10, y: 20 } };
    expect(parseLayoutFile(JSON.stringify(saved))).toEqual(saved);
  });
});

describe('reconcileTick', () => {
  const saved = { x: 100, y: 100, width: 800, height: 400 };

  it('is a no-op and resets to RESTORING when the window is closed', () => {
    const result = reconcileTick(saved, null, { x: 100, y: 100, width: 800, height: 400, fontSize: 14, minimized: false }, 'TRACKING');
    expect(result).toEqual({ apply: null, save: null, nextMode: 'RESTORING' });
  });

  it('RESTORING pushes apply every poll until live matches saved', () => {
    const live = { x: 0, y: 0, width: 500, height: 300, fontSize: 14, minimized: false };
    const result = reconcileTick(saved, live, null, 'RESTORING');
    expect(result.apply).toEqual(saved);
    expect(result.save).toBeNull();
    expect(result.nextMode).toBe('RESTORING');
  });

  it('RESTORING transitions to TRACKING once live matches saved within epsilon', () => {
    const live = { x: 101, y: 99, width: 800, height: 400, fontSize: 14, minimized: false }; // within epsilon (2px)
    const result = reconcileTick(saved, live, null, 'RESTORING');
    expect(result).toEqual({ apply: null, save: null, nextMode: 'TRACKING' });
  });

  it('RESTORING stays RESTORING when live is just past the epsilon boundary', () => {
    const live = { x: saved.x + GEOMETRY_EPSILON_PX, y: saved.y, width: saved.width, height: saved.height, fontSize: 14, minimized: false };
    const result = reconcileTick(saved, live, null, 'RESTORING');
    expect(result.nextMode).toBe('RESTORING');
    expect(result.apply).toEqual(saved);
  });

  it('TRACKING: sub-epsilon drift never saves', () => {
    const live = { x: saved.x + 1, y: saved.y, width: saved.width, height: saved.height, fontSize: 14, minimized: false };
    const result = reconcileTick(saved, live, live, 'TRACKING');
    expect(result).toEqual({ apply: null, save: null, nextMode: 'TRACKING' });
  });

  it('TRACKING: a settled move (live matches prevLive, differs from saved) saves exactly the live geometry', () => {
    const moved = { x: 300, y: 250, width: 900, height: 500, fontSize: 16, minimized: false };
    const result = reconcileTick(saved, moved, moved, 'TRACKING');
    expect(result.apply).toBeNull();
    expect(result.save).toEqual(moved);
    expect(result.nextMode).toBe('TRACKING');
  });

  it('TRACKING: an unsettled (still-moving) drag neither saves nor applies', () => {
    const live = { x: 300, y: 250, width: 900, height: 500, fontSize: 16, minimized: false };
    const prevLive = { x: 280, y: 240, width: 900, height: 500, fontSize: 16, minimized: false }; // different from live -> still dragging
    const result = reconcileTick(saved, live, prevLive, 'TRACKING');
    expect(result).toEqual({ apply: null, save: null, nextMode: 'TRACKING' });
  });

  it('TRACKING: no snap-back after a save (caller folds save into saved for the next call)', () => {
    const moved = { x: 300, y: 250, width: 900, height: 500, fontSize: 16, minimized: false };
    const first = reconcileTick(saved, moved, moved, 'TRACKING');
    expect(first.save).toEqual(moved);
    // Caller adopts first.save as the new `saved` before the next poll.
    const second = reconcileTick(first.save, moved, moved, first.nextMode);
    expect(second).toEqual({ apply: null, save: null, nextMode: 'TRACKING' });
  });

  it('minimized guard: ignores x/y/w/h diffs while minimized, in RESTORING', () => {
    const live = { x: 0, y: 0, width: 10, height: 10, fontSize: 14, minimized: true };
    const result = reconcileTick(saved, live, null, 'RESTORING');
    expect(result.apply).toBeNull();
    expect(result.nextMode).toBe('RESTORING');
  });

  it('minimized guard: ignores x/y/w/h diffs while minimized, in TRACKING (minimized flag already agrees)', () => {
    const savedMinimized = { ...saved, minimized: true };
    const live = { x: 0, y: 0, width: 10, height: 10, fontSize: 14, minimized: true };
    const result = reconcileTick(savedMinimized, live, live, 'TRACKING');
    expect(result.apply).toBeNull();
    expect(result.save).toBeNull();
    expect(result.nextMode).toBe('TRACKING');
  });

  it('minimized guard: still tracks the minimized flag itself when it changes', () => {
    const savedExpanded = { ...saved, minimized: false };
    const live = { x: 0, y: 0, width: 10, height: 10, fontSize: 14, minimized: true };
    const result = reconcileTick(savedExpanded, live, live, 'TRACKING');
    expect(result.apply).toBeNull();
    expect(result.save).toEqual({ ...savedExpanded, minimized: true });
  });

  it('minimized guard: no save when the minimized flag already matches', () => {
    const savedMinimized = { ...saved, minimized: true };
    const live = { x: 0, y: 0, width: 10, height: 10, fontSize: 14, minimized: true };
    const result = reconcileTick(savedMinimized, live, live, 'TRACKING');
    expect(result.save).toBeNull();
  });
});
