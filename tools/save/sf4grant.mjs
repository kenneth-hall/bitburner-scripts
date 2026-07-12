// CLI over savelib.mjs (Phase 21 -- grant SF4 level 3 via save edit).
//
// Examples:
//   node tools/save/sf4grant.mjs grant saves/bitburnerSave_1783857287_BN1x2.json.gz
//   node tools/save/sf4grant.mjs describe saves/bitburnerSave_1783857287_BN1x2.json.gz
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { gunzipSave, gzipSave, sha256, grantSf43, decodeSaveSummary } from './savelib.mjs';

const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

function isGzip(buf) {
  return buf.length >= 2 && buf[0] === GZIP_MAGIC[0] && buf[1] === GZIP_MAGIC[1];
}

function stemOf(inputPath) {
  const base = basename(inputPath);
  if (base.endsWith('.json.gz')) return base.slice(0, -'.json.gz'.length);
  if (base.endsWith('.json')) return base.slice(0, -'.json'.length);
  return base;
}

function summariesDifferOnlyInSfLevels(before, after) {
  return (
    before.bitNode === after.bitNode &&
    before.hacking === after.hacking &&
    before.money === after.money &&
    before.augCount === after.augCount &&
    JSON.stringify(before.sfLevels) !== JSON.stringify(after.sfLevels)
  );
}

function cmdGrant(inputPath) {
  const rawGz = readFileSync(inputPath);
  const raw = gunzipSave(rawGz);

  const before = decodeSaveSummary(raw);

  let edited;
  try {
    ({ edited } = grantSf43(raw));
  } catch (err) {
    console.error(`GUARD FAILED: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const after = decodeSaveSummary(edited);
  if (!summariesDifferOnlyInSfLevels(before, after)) {
    console.error(
      `GUARD FAILED: decoded summary differs outside sfLevels.\n  before=${JSON.stringify(before)}\n  after=${JSON.stringify(after)}`,
    );
    process.exitCode = 1;
    return;
  }

  const stem = stemOf(inputPath);
  const dir = dirname(inputPath);
  const outGzPath = join(dir, `${stem}.sf4.json.gz`);
  const outJsonPath = join(dir, `${stem}.sf4.json`);

  const editedGz = gzipSave(edited);

  try {
    writeFileSync(outGzPath, editedGz);
    writeFileSync(outJsonPath, edited);
  } catch (err) {
    // Best-effort cleanup of any partial output.
    for (const p of [outGzPath, outJsonPath]) {
      if (existsSync(p)) unlinkSync(p);
    }
    throw err;
  }

  const delta = edited.length - raw.length;

  console.log(`input:              ${inputPath}`);
  console.log(`input sha256 (gz):        ${sha256(rawGz)}`);
  console.log(`input sha256 (decompressed): ${sha256(raw)}`);
  console.log(`output:             ${outGzPath}`);
  console.log(`output:             ${outJsonPath}`);
  console.log(`output sha256 (gz):       ${sha256(editedGz)}`);
  console.log(`output sha256 (decompressed): ${sha256(edited)}`);
  console.log(`byte-length delta (decompressed): ${delta >= 0 ? '+' : ''}${delta}`);
  console.log(`summary before: ${JSON.stringify(before)}`);
  console.log(`summary after:  ${JSON.stringify(after)}`);
  console.log('ALL GUARDS PASSED');
}

function cmdDescribe(inputPath) {
  const fileBuf = readFileSync(inputPath);
  const raw = isGzip(fileBuf) ? gunzipSave(fileBuf) : fileBuf;
  const summary = decodeSaveSummary(raw);
  const fileHash = sha256(fileBuf);

  console.log(`file: ${basename(inputPath)}`);
  console.log(`BN: ${summary.bitNode}`);
  console.log(`ownedSF: ${JSON.stringify(summary.sfLevels)}`);
  console.log(`hacking: ${summary.hacking}`);
  console.log(`money: ${summary.money}`);
  console.log(`augs: ${summary.augCount}`);
  console.log(`sha256 (file): ${fileHash}`);
  console.log('');
  console.log('INDEX.md row (fill in role / captured (UTC) / note by hand):');
  console.log(
    `| ${basename(inputPath)} | <role> | <captured UTC> | ${summary.bitNode} | ${JSON.stringify(summary.sfLevels)} | ${summary.hacking} | ${summary.money} | ${summary.augCount} | ${fileHash} | <note> |`,
  );
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'grant' && arg) {
  cmdGrant(arg);
} else if (cmd === 'describe' && arg) {
  cmdDescribe(arg);
} else {
  console.error('usage: node tools/save/sf4grant.mjs grant <pre-edit.json.gz>');
  console.error('       node tools/save/sf4grant.mjs describe <save.json.gz|save.json>');
  process.exitCode = 1;
}
