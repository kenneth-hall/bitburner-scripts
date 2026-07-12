// Pure save-transform + validators for Phase 21 (grant SF4 level 3 via a
// minimal-substring edit — see phase-21-sf4-grant.spec.md S2/S3). Node
// stdlib only, no game/network dependency, all functions pure (no file
// I/O) so they're fully unit-testable against an in-code fixture.
//
// The needle/replacement are the escaped-form literals as they actually
// appear in the decompressed save bytes: the save's outer JSON has a
// `PlayerSave` field whose VALUE is itself JSON text, so when the outer
// object is serialized, PlayerSave's embedded quotes get escaped once
// (`\"sourceFiles\":...`). Deriving them via JSON.stringify (rather than
// hand-typing backslashes) guarantees the escaping matches the real file
// exactly, since it's the same transform the game applies.
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export const SF_NEEDLE = JSON.stringify('"sourceFiles":{"ctor":"JSONMap","data":[[1,1]]}').slice(1, -1);
export const SF_REPLACEMENT = JSON.stringify('"sourceFiles":{"ctor":"JSONMap","data":[[1,1],[4,3]]}').slice(1, -1);

export function gunzipSave(buf) {
  return gunzipSync(buf);
}

export function gzipSave(buf) {
  return gzipSync(buf);
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// outer = { ctor: "BitburnerSaveObject", data: { PlayerSave: "<json text>", ... } }
// player = JSON.parse(outer.data.PlayerSave) = { ctor: "PlayerObject", data: {...} }
export function parseSave(rawBuf) {
  const outer = JSON.parse(rawBuf.toString('utf8'));
  const player = JSON.parse(outer.data.PlayerSave);
  return { outer, player };
}

// Recursively collects dotted paths where a and b differ. Arrays that
// differ in length are reported at their own path (not element-wise) --
// exactly what's needed to isolate "sourceFiles.data gained one entry" as
// a single diff path instead of a cascade of index diffs.
function collectDiffs(a, b, path, diffs) {
  if (a === b) return;
  if (typeof a !== typeof b || a === null || b === null) {
    diffs.push(path);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      diffs.push(path);
      return;
    }
    for (let i = 0; i < a.length; i++) collectDiffs(a[i], b[i], `${path}[${i}]`, diffs);
    return;
  }
  if (typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) collectDiffs(a[k], b[k], path ? `${path}.${k}` : k, diffs);
    return;
  }
  diffs.push(path);
}

const SOURCE_FILES_PATH = 'player.data.sourceFiles.data';

// Throws unless the parsed trees deep-equal everywhere except
// player.data.sourceFiles.data, which must gain exactly [4, 3] as its
// last entry with every prior entry unchanged.
export function structuredDiff(origBuf, editedBuf) {
  const orig = parseSave(origBuf);
  const edited = parseSave(editedBuf);

  const origOuterData = { ...orig.outer.data };
  const editedOuterData = { ...edited.outer.data };
  delete origOuterData.PlayerSave;
  delete editedOuterData.PlayerSave;

  const diffs = [];
  collectDiffs(
    { outerCtor: orig.outer.ctor, outerData: origOuterData, player: orig.player },
    { outerCtor: edited.outer.ctor, outerData: editedOuterData, player: edited.player },
    '',
    diffs,
  );

  const unexpected = diffs.filter((p) => p !== SOURCE_FILES_PATH);
  if (unexpected.length > 0) {
    throw new Error(`structuredDiff: unexpected diff outside sourceFiles.data: ${unexpected.join(', ')}`);
  }
  if (diffs.length === 0) {
    throw new Error('structuredDiff: expected sourceFiles.data to gain an entry but the trees are identical');
  }

  const origSF = orig.player.data.sourceFiles.data;
  const editedSF = edited.player.data.sourceFiles.data;
  const prefixMatches = origSF.every((entry, i) => JSON.stringify(entry) === JSON.stringify(editedSF[i]));
  const gained = editedSF.slice(origSF.length);
  const gainedIsSf43 = gained.length === 1 && JSON.stringify(gained[0]) === JSON.stringify([4, 3]);
  if (!prefixMatches || !gainedIsSf43) {
    throw new Error(
      `structuredDiff: sourceFiles.data changed unexpectedly (before=${JSON.stringify(origSF)}, after=${JSON.stringify(editedSF)})`,
    );
  }
}

// The core edit (S2): a single substring replace on the decompressed
// bytes, never a parse->mutate->re-serialize round trip (which would
// reflow unrelated bytes). Every guard hard-fails with a descriptive
// error; on any failure nothing is returned.
export function grantSf43(rawBuf) {
  const text = rawBuf.toString('utf8');

  const firstIdx = text.indexOf(SF_NEEDLE);
  if (firstIdx === -1) {
    throw new Error(
      'grantSf43: SF_NEEDLE not found in source. The save may have moved past sourceFiles=[[1,1]] ' +
        '(e.g. BN1.2 completed) or changed shape -- read this as "update the needle constant and re-run", not "the tool is broken".',
    );
  }
  const lastIdx = text.lastIndexOf(SF_NEEDLE);
  if (firstIdx !== lastIdx) {
    throw new Error('grantSf43: SF_NEEDLE occurs more than once in source -- refusing to guess which to edit.');
  }

  const edited = text.slice(0, firstIdx) + SF_REPLACEMENT + text.slice(firstIdx + SF_NEEDLE.length);
  const editedBuf = Buffer.from(edited, 'utf8');

  const expectedDelta = Buffer.byteLength(SF_REPLACEMENT, 'utf8') - Buffer.byteLength(SF_NEEDLE, 'utf8');
  const actualDelta = editedBuf.length - rawBuf.length;
  if (actualDelta !== 6 || actualDelta !== expectedDelta) {
    throw new Error(`grantSf43: unexpected byte-length delta ${actualDelta} (expected +6).`);
  }

  // Parse-integrity guard: throws if either side isn't valid JSON.
  parseSave(rawBuf);
  parseSave(editedBuf);

  // Corruption guard: throws unless the ONLY change is sourceFiles.data
  // gaining [4, 3].
  structuredDiff(rawBuf, editedBuf);

  return { edited: editedBuf };
}

// INDEX.md row fields, read from the parsed player.
export function decodeSaveSummary(rawBuf) {
  const { player } = parseSave(rawBuf);
  const d = player.data;
  return {
    bitNode: d.bitNodeN,
    sfLevels: d.sourceFiles.data,
    hacking: d.skills.hacking,
    money: d.money,
    augCount: d.augmentations.length,
  };
}
