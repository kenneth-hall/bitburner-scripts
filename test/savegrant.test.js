// Layer 1 (phase-21-sf4-grant.spec.md work item 3): hermetic tests over a
// synthetic in-code fixture built to the real save's serialization shape
// (escaped quotes, JSONMap ctor, achievements array) -- no binary blobs in
// test/. The CLI re-runs this same guard+diff validator suite against the
// real ~1.88 MB save at apply time (S7); this file is what proves the
// logic correct beforehand.
import { describe, it, expect } from 'vitest';
import {
  SF_NEEDLE,
  gunzipSave,
  gzipSave,
  grantSf43,
  structuredDiff,
  decodeSaveSummary,
} from '../tools/save/savelib.mjs';

function buildFixture({ sfData = [[1, 1]], achievements } = {}) {
  const player = {
    ctor: 'PlayerObject',
    data: {
      bitNodeN: 1,
      money: 486748.6266666666,
      skills: { hacking: 73, strength: 1, defense: 1, dexterity: 1, agility: 1, charisma: 1, intelligence: 0 },
      augmentations: [
        { level: 1, name: 'Cranial Signal Processors - Gen I' },
        { level: 1, name: 'BitWire' },
      ],
      sourceFiles: { ctor: 'JSONMap', data: sfData },
      achievements: achievements ?? [{ ID: 'NS2', unlockedOn: 1783273384891 }],
    },
  };
  const outer = {
    ctor: 'BitburnerSaveObject',
    data: {
      PlayerSave: JSON.stringify(player),
      AllServersSave: { ctor: 'AllServersMap', data: [] },
      VersionSave: { ctor: 'PlayerOwnedAugmentation', data: '2.8.1' },
    },
  };
  return Buffer.from(JSON.stringify(outer), 'utf8');
}

describe('gzip round-trip', () => {
  it('is lossless', () => {
    const fixture = buildFixture();
    expect(gunzipSave(gzipSave(fixture)).equals(fixture)).toBe(true);
  });
});

describe('grantSf43 happy path', () => {
  it('produces a +6 byte edit that parses and deep-equals expected', () => {
    const fixture = buildFixture();
    const { edited } = grantSf43(fixture);

    expect(edited.length - fixture.length).toBe(6);
    expect(() => JSON.parse(edited.toString('utf8'))).not.toThrow();

    const outer = JSON.parse(edited.toString('utf8'));
    const player = JSON.parse(outer.data.PlayerSave);
    expect(player.data.sourceFiles.data).toEqual([
      [1, 1],
      [4, 3],
    ]);
    expect(player.data.achievements).toEqual([{ ID: 'NS2', unlockedOn: 1783273384891 }]);

    expect(() => structuredDiff(fixture, edited)).not.toThrow();
  });
});

describe('grantSf43 guards refuse', () => {
  it('throws when an unexpected extra SF is present', () => {
    const fixture = buildFixture({
      sfData: [
        [1, 1],
        [5, 1],
      ],
    });
    expect(() => grantSf43(fixture)).toThrow();
  });

  it('throws when SF1 is at an unexpected level', () => {
    const fixture = buildFixture({ sfData: [[1, 2]] });
    expect(() => grantSf43(fixture)).toThrow();
  });

  it('throws when the needle is missing entirely', () => {
    const fixture = buildFixture({ sfData: [[2, 1]] });
    expect(() => grantSf43(fixture)).toThrow();
  });

  it('throws when the needle occurs twice', () => {
    const fixture = buildFixture();
    const text = fixture.toString('utf8');
    const idx = text.indexOf(SF_NEEDLE);
    expect(idx).toBeGreaterThanOrEqual(0);
    const doubledText = text.slice(0, idx) + SF_NEEDLE + text.slice(idx);
    const doubled = Buffer.from(doubledText, 'utf8');
    expect(() => grantSf43(doubled)).toThrow();
  });
});

describe('structuredDiff catches corruption', () => {
  it('rejects an edit with an extra unrelated byte flip', () => {
    const fixture = buildFixture();
    const { edited } = grantSf43(fixture);

    // Flip an unrelated field (money) in the already-edited buffer.
    const corruptedText = edited.toString('utf8').replace('486748.6266666666', '486748.6266666667');
    const corrupted = Buffer.from(corruptedText, 'utf8');

    expect(() => structuredDiff(fixture, corrupted)).toThrow();
  });

  it('rejects a double-edited buffer (sourceFiles.data mutated twice)', () => {
    const fixture = buildFixture();
    const { edited } = grantSf43(fixture);

    const doubleEditedText = edited.toString('utf8').replace('[[1,1],[4,3]]', '[[1,1],[4,3],[5,1]]');
    const doubleEdited = Buffer.from(doubleEditedText, 'utf8');

    expect(() => structuredDiff(fixture, doubleEdited)).toThrow();
  });
});

describe('decodeSaveSummary', () => {
  it('returns the fixture known values', () => {
    const fixture = buildFixture();
    expect(decodeSaveSummary(fixture)).toEqual({
      bitNode: 1,
      sfLevels: [[1, 1]],
      hacking: 73,
      money: 486748.6266666666,
      augCount: 2,
    });
  });
});
