# Phase 21 spec: Grant SF4.3 via save edit

## Context

Work in `C:\Users\admin\bitburner-scripts`. Requirements: `phase-21-sf4-grant.features.md` —
read it first; this spec assumes it, including the established save-format theory (SF map
serialization, gzip round-trip proven lossless, SF4 has no multiplier side-effects) and the
hard scope boundary (grant SF4.3 + verify Singularity is live; **none** of the now-unblocked
automation ships in this phase).

What ships: a pure save-transform tool (`tools/save/`), its vitest suite (Layer 1), a tiny
in-game verify script (`src/sf4check.js`), the consolidated `saves/` directory with a
committed `INDEX.md`, and the one-sitting live apply/verify procedure. The only byte change
to the save is the single insertion `,[4,3]` turning the escaped `\"data\":[[1,1]]` of the
`sourceFiles` JSONMap into `\"data\":[[1,1],[4,3]]`.

**Audience note:** the implementer does everything marked **[code]**. Kenneth does everything
marked **[live]**. No [live] step requires editing code; a failed [live] check loops back to a
[code] fix or to the documented rollback.

## Ground rules

- `CLAUDE.md` rules apply. **Source-reading disclosure:** this spec confirmed the SF
  achievement IDs and their grant condition from the official repo's static
  `AchievementData.json` / achievement table (allowed source; static-data carve-out — IDs and
  conditions are lookup-table facts, not progression puzzle-solving). No other engine source
  was read; the save-format theory comes from the parsed save itself, per the features file.
- **Transactions log: N/A** — nothing here spends money. Stated so the omission is visibly
  deliberate.
- **Singularity isolation:** `src/sf4check.js` is a standalone one-shot run manually from the
  terminal. It is never imported by, nor `exec`'d from, `daemon.js` or any hot-path module —
  the daemon's RAM footprint is untouched.
- **No `src/` behavior changes.** The batcher, daemon, companions, tests, and log schemas are
  all untouched. New files only (`sf4check.js`) plus one `vite.config.ts` download-filter line.
- **The transform tool lives in `tools/save/`, never `src/`** — viteburner watches `src/**`
  and would push a Node-only tool into the game.
- **Identifier hygiene:** new identifiers (`sf4check`, `grantSf43`, `decodeSaveSummary`,
  `SF_NEEDLE`, `SF_REPLACEMENT`, …) are pre-checked clean against ns function/method names;
  re-check anything added beyond them. Inside `sf4check.js`, don't alias singularity method
  names into standalone identifiers (Phase 9/11's collision mechanism).
- **One-shot apply window (features Decision 5):** the entire [live] section runs in one
  sitting — fresh backup → edit → import → verify — because importing rolls live state back
  to the backup moment. Minutes of daemon progress between backup and import are lost;
  acceptable, keep the window tight.
- **The pre-edit backup is sacred (features safety rail):** never edited in place, never
  deleted; its recorded sha256 is re-verified immediately before import (Layer 3).
- Branch `phase21-sf4grant` off `master`. `npm test` the implementer runs and clears; the
  live layers are Kenneth's. Docs/index bookkeeping commits ride the same branch.

## Spec-stage decisions

- **S1 — Achievements: write NOTHING; the engine self-grants (overrides features Decision 6's
  mechanism, preserves its intent — Kenneth signed off on this override, and on the source
  read behind it, 2026-07-12, resolving the cold review's blocker).** Confirmed from the
  official repo's static achievement table: there is exactly **one** SF achievement per
  BitNode — `SF4.1` — and **no SF4.2/SF4.3 achievements exist** (the features file's
  three-record plan was based on a wrong guess the file itself flagged as spec-to-confirm),
  so Decision 6 as written is unimplementable regardless of mechanism. `SF4.1`'s grant
  condition is "owns SF4 at level ≥ 1", evaluated live by the game's periodic achievement
  check — so once the imported save's map contains `[4,3]`, the game grants `SF4.1` **by
  itself, with a genuine timestamp**. Kenneth's stated intent (achievements page reads as a
  legit clear) is satisfied *better* than hand-written records (no forged timestamps to
  invent), and the edit shrinks to exactly one insertion, strengthening the minimal-diff
  invariant. The self-grant is verified in live step L6. **Fallback if it hasn't appeared by
  end of sitting (accepted by Kenneth):** a follow-up mini-edit appending the one `SF4.1`
  record with this phase's own tooling (same substring technique against a fresh backup, its
  own tiny sitting) — cosmetic, non-blocking, and the capability to do it is exactly what
  this phase builds. The SF4 unlock itself gates on the map, not the achievement (features
  theory).
- **S2 — Edit method (features Q4): raw-substring replace on the decompressed bytes, never a
  JSON round-trip.** The needle is the escaped-form literal
  `\"sourceFiles\":{\"ctor\":\"JSONMap\",\"data\":[[1,1]]}` (the PlayerSave is a stringified
  JSON inside the outer JSON, so quotes are backslash-escaped in the file's actual bytes) —
  verified to occur **exactly once** in the current BN1x2 save. The replacement is the same
  literal with `[[1,1]]` → `[[1,1],[4,3]]`; length delta exactly **+6 bytes** (`,[4,3]`).
  Guards (all hard-fail, features' impossible-input requirement): needle occurs exactly once
  in the source; output length = input length + 6; output parses (outer JSON *and* inner
  PlayerSave string); structured diff of parsed old-vs-new shows `sourceFiles.data` gaining
  `[4,3]` as the sole change with every other field deep-equal. A parse→mutate→re-serialize
  path is rejected: it would reflow unrelated bytes (key order, number formatting, escaping)
  and destroy the diff-provability that is the core corruption guard.
  **Stated assumption:** the needle hard-codes SF1 **level 1** — true of the current mid-BN1.2
  save, and the sitting is planned mid-run. If the save advances first (e.g. BN1.2 completes →
  `[[1,2]]`), the guard refuses — read a needle mismatch at L3 as "the save moved, update the
  needle constant [code] and re-run," not "the tool is broken." Fail-safe by design.
- **S3 — Round-trip invariant is on the *decompressed* bytes, not the .gz container.** Our
  gzip output will not be byte-identical to the game's own .gz (compressor settings differ);
  that's fine and expected. The invariants: `gunzip(ourGzip(x)) === x` (lossless container),
  and `gunzip(edited.gz)` differs from `gunzip(pre-edit.gz)` by exactly the S2 insertion.
  Hashes recorded in the INDEX are of the on-disk files (verifiable with `Get-FileHash`); the
  CLI report additionally records the decompressed-content sha256s, which are the stable
  content identities across recompression.
- **S4 — Importer format (features Q1): resolved empirically at apply time, cheaply — the CLI
  emits BOTH `.json.gz` and plain `.json` outputs**, so the sitting can't stall on a format
  surprise. Primary attempt imports the `.gz`; if the game's Import rejects it, import the
  `.json` (identical decompressed content, zero extra tooling). If *both* are rejected, the
  isolation step is importing the unedited round-tripped backup (distinguishes "importer
  rejects our container" from "importer rejects the edit") — see L4's failure ladder. No
  pre-flight import in the happy path: an accepted, cleanly-loading edited import proves
  everything the pre-flight would have.
- **S5 — Verification (features Q2): `src/sf4check.js`, one-shot, exports a log.** Confirmed
  against `markdown/`: `getResetInfo().ownedSF` exists in this build (`Map<number, number>`),
  and `singularity.getOwnedAugmentations()` costs **5 GB × 16/4/1** by SF4 level. The script
  logs `{ timestamp, ownedSF: [...ns.getResetInfo().ownedSF], singularityProbe: <count from
  ns.singularity.getOwnedAugmentations()>, hackingLevel }` to `sf4check-<epoch>.json` (one
  file per run, `auginfo.js` pattern; `vite.config.ts` filter line added) plus a terminal
  summary. **The primary level-3 proof is `ownedSF` containing `[4,3]`** (node 4, level 3 —
  read directly from the live player). The script's RAM reading is **corroboration that the
  1× discount is actually in effect**: from the call set as specced (1.6 base + 1.0
  `getResetInfo` + 0.05 `getHackingLevel` + 5 GB × mult) the derivation gives ≈ **7.65 GB**
  at 1× vs ≈ 22.65 GB at 4× and ≈ 82.65 GB at 16× — the implementer re-derives the exact
  expected value from the script's final call set (and confirms in `markdown/` that
  `getScriptRam` reflects the SF-level-adjusted singularity cost; if it turns out to report
  an unadjusted base cost, the RAM check is dropped as evidence, not treated as a failure —
  `ownedSF` remains the gate). The bands are far enough apart that "matches the 1×
  derivation, nowhere near the 4× one" is the check — not a hard-coded decimal. No RAM
  budget concern: ~8 GB fits mid-run home comfortably.
- **S6 — Save bookkeeping (features Q6): consolidate under `saves/`, commit the `.gz`
  keepers + `INDEX.md`, gitignore the bulky derived forms.** Sizes settled it: the .gz
  artifacts are 170–440 KB each — committing them IS the durability requirement (the
  rollback survives disk loss via git), and hash-only-in-index protects against corruption
  but not loss, so commit-the-file wins (features' own recommendation). Policy:
  - `.gitignore`: root-anchor the existing rule to `/bitburnerSave_*.json.gz` (game drops
    exports in the repo dir; those strays stay ignored until deliberately moved), and add
    `saves/*.json` + `saves/*.pretty.json` (decompressed/pretty forms are regenerable from
    the committed .gz — keep them on disk for convenience, out of git).
  - Move into `saves/`: the two repo-root `.gz` (BN1x1 clear-state, current BN1x2), the
    repo-root extraction dirs' contents become disposable (regenerable; delete the dirs),
    and the four historical `.gz`/`.json` saves in `~/Downloads` worth keeping (2022-era
    `.json` saves optional — Kenneth's call at apply time; list whatever is kept).
  - `saves/INDEX.md` columns: `file | role | captured (UTC) | BN | ownedSF | hacking |
    money | augs | sha256 (file) | note`. One row per kept save. The three phase artifacts
    carry the features file's role tags: `pre-edit-backup`, `edited-import`,
    `post-import-reexport`.
  - The optional `saves/index.mjs` generator is **deferred, not built** (features marked it
    optional-must-not-delay): the CLI's `describe` subcommand makes a row cheap to produce
    by hand, and hand-maintaining ~8 rows doesn't justify a generator yet. Filed to Ideas.
- **S7 — Layer-1 tests run on a synthetic in-test fixture; the real file is validated at
  apply time by the same code.** The vitest suite builds a miniature save in-code (outer
  JSON + stringified PlayerSave with the real serialization shape: escaped quotes, JSONMap
  ctor, achievements array) and gzips it with `node:zlib` — hermetic, no binary blobs in
  `test/`. The features file's "committed fixture" intent (confidence before the game is
  touched) is honored by design instead: the CLI **always runs the full guard+diff validator
  suite against the real files as part of the transform** and refuses to emit output on any
  failure — so the identical assertions the tests prove on the fixture are re-executed
  against the real 1.88 MB save before import, and their results land in the CLI's printed
  report (captured into the INDEX row's note / commit message).
- **S8 — Load-time validation contingency (features Q3): believed a non-issue; if wrong, the
  phase STOPS, not improvises.** The check is L7's re-export: if `[4,3]` didn't survive a
  real load/save cycle, roll back (import `pre-edit-backup`), record the observation, and
  end the sitting — falling back to base-state Option 2 (BitVerse screen) is a *replanned
  next attempt* (new decisions about timing vs the live run), not something to wing mid-
  sitting. This keeps the one-shot window honest.

## Design

### Work item 1 — `tools/save/savelib.mjs`: pure transform + validators [code]

ESM module, Node stdlib only (`node:zlib`, `node:crypto`). Exports (all pure, all
unit-tested):

- `SF_NEEDLE` / `SF_REPLACEMENT` — the S2 escaped-form literals, defined once here.
- `gunzipSave(buf)` / `gzipSave(buf)` — thin `zlib` wrappers (Buffers in/out).
- `grantSf43(rawBuf)` → `{ edited: Buffer }` — S2's substring replace over the decompressed
  bytes, running **every guard** (needle count === 1; length delta === +6; output re-parses;
  structured diff clean) and throwing a descriptive error on any failure. Never writes files.
- `parseSave(rawBuf)` → `{ outer, player }` — outer `JSON.parse` + inner PlayerSave parse
  (locating the stringified PlayerSave the same way the existing pretty-print scratch work
  did; implementer confirms the outer key name from the real save).
- `structuredDiff(origBuf, editedBuf)` → throws unless the parsed trees deep-equal
  everywhere except `sourceFiles.data` gaining exactly `[4,3]`.
- `decodeSaveSummary(rawBuf)` → `{ bitNode, sfLevels, hacking, money, augCount }` — the
  INDEX-row fields, read from the parsed player (implementer maps the exact field paths from
  the real save; the pretty.json already on disk documents them).
- `sha256(buf)` → hex string.

### Work item 2 — `tools/save/sf4grant.mjs`: the CLI [code]

Thin dispatch over savelib, two subcommands:

- `node tools/save/sf4grant.mjs grant <pre-edit.json.gz>` — gunzip → `grantSf43` →
  write `<stem>.sf4.json.gz` **and** `<stem>.sf4.json` (S4's both-formats output) next to
  the input; print a report: input/output file sha256s, decompressed-content sha256s,
  byte-length delta, `decodeSaveSummary` before/after (must differ **only** in `sfLevels`),
  and an explicit `ALL GUARDS PASSED` line. Any guard failure → non-zero exit, no output
  files (or partial files removed).
- `node tools/save/sf4grant.mjs describe <save.json.gz|save.json>` — print an INDEX-ready
  row: decoded summary + file sha256. Accepts gzipped or plain (sniff the gzip magic bytes).

No third-party deps; runs with the repo's existing Node.

### Work item 3 — `test/savegrant.test.js`: Layer 1 [code]

Vitest, auto-included by the default config (`test/*.test.js`), no game dependency. A
fixture-builder helper constructs the miniature save per S7 (parameterizable `sourceFiles`
data and achievements so guard tests can vary them). Assertions:

- **Round-trip lossless:** `gunzipSave(gzipSave(x)).equals(x)` for the fixture buffer.
- **Happy path:** `grantSf43` output is +6 bytes, parses, `structuredDiff` passes, resulting
  map data deep-equals `[[1,1],[4,3]]` with numeric elements, achievements array untouched.
- **Guards refuse:** source with `[[1,1],[5,1]]` (unexpected extra SF); source with `[[1,2]]`
  (unexpected level); source missing the needle entirely; source with the needle injected
  twice (e.g. inside a fake string field) — each throws, no silent output.
- **Diff detector catches corruption:** a deliberately double-edited / unrelated-byte-flipped
  buffer fails `structuredDiff`.
- **`decodeSaveSummary`** returns the fixture's known values.

### Work item 4 — `src/sf4check.js` + `vite.config.ts` filter [code]

Per S5. One-shot script: read `ns.getResetInfo().ownedSF`, call
`ns.singularity.getOwnedAugmentations()` inside a try/catch (a throw is *recorded in the
log*, not just splashed on the terminal — the log must be diagnostic on the failure path
too), `ns.write` the JSON to `sf4check-<epoch>.json`, `ns.tprint` a one-line summary.
`vite.config.ts` gains one filter line
(`/^sf4check-\d+\.json$/` → `logs/`, comment: Phase 21 — SF/Singularity liveness check,
one file per run). Header comment states the standing rule: manual one-shot, never
daemon-launched (Singularity RAM isolation). The script is kept after the phase — it's the
generic "what SFs do I own / is Singularity alive" checker for every future reset.

### Work item 5 — `saves/` consolidation + `INDEX.md` + `.gitignore` [code]

Per S6: create `saves/`, apply the `.gitignore` edits, move the keeper saves in (file moves
only — the two live-repo `.gz` now; Downloads keepers listed for Kenneth to confirm at the
sitting since they're outside the repo), delete the two repo-root extraction dirs and the
two root `.pretty.json` scratch files (regenerable via `describe`/gunzip from the committed
.gz — record the regeneration command in `INDEX.md`'s header so nothing feels lost), write
`INDEX.md` with rows for every kept file (using `describe`). The three phase-artifact rows
land during the [live] sitting as each file comes to exist.

### Work item 6 — BACKLOG / CHANGELOG / graduation [code]

Move Phase 21 through BACKLOG (Next Up → In Progress → close-out entry in
`docs/phases/CHANGELOG.md`, noting: the S1 achievements override, which checks were vitest
vs live, and the measured `sf4check` RAM reading). Graduate both phase docs to
`docs/phases/`. `saves/index.mjs` generator filed under Ideas. Staged with the work.

## Live procedure — one sitting [live]

Pre-sitting state: work items 1–5 merged locally, `npm test` green, dev server running and
healthy (`sf4check.js` synced — verify via `dist/src/sf4check.js` existing per the standing
byte-check rule).

- **L1 — Fresh backup.** In-game: Options → export/backup save. Move the new
  `bitburnerSave_*_BN1x2.json.gz` into `saves/`. This exact file is `pre-edit-backup`.
- **L2 — Index + Layer 3 rollback confidence.** `describe` it → add the INDEX row (role
  `pre-edit-backup`, sha256). Confirm it gunzips and parses cleanly (describe succeeding IS
  that check). Commit it — the rollback is now versioned before anything risky happens.
- **L3 — Transform.** `grant` on the pre-edit backup. Read the report: `ALL GUARDS PASSED`,
  +6 bytes, before/after summaries identical except `sfLevels` `[[1,1]]` → `[[1,1],[4,3]]`.
  Index the `.sf4.json.gz` as `edited-import`. Any guard failure → stop the sitting, hand
  the report to a [code] fix.
- **L4 — Import.** Re-verify the pre-edit backup's sha256 matches its INDEX row
  (`Get-FileHash`). Then in-game: Options → Import Save → the `.sf4.json.gz` → confirm.
  Failure ladder (S4): `.gz` rejected → import the `.sf4.json`; both rejected → import the
  *unedited* backup to isolate container-vs-edit, stop, [code] follow-up. Import reloads the
  game — expect the dev-server WebSocket to reconnect on its own (5s auto-reconnect).
- **L5 — Load + progress intact.** Game loads without error; spot-check via
  `node tools/bb/cli.mjs stats` (and the in-game screen) that hacking / money / owned-aug
  count **equal** the `pre-edit-backup` INDEX row — import restores that exact snapshot, so
  this is equality, not a tolerance band (the minutes of live play since the backup are
  simply discarded by the import, as Decision 5 accepts).
- **L6 — Singularity liveness.** `run sf4check.js` → exported `logs/sf4check-<epoch>.json`
  shows `ownedSF` containing `[4,3]` and `singularityProbe` a real aug count (no throw).
  **If `ownedSF` does NOT contain `[4,3]`** — the game loaded but normalized the entry away —
  that is S8's contingency by another route: import `pre-edit-backup`, record the
  observation, stop the sitting (no mid-sitting improvisation). Otherwise:
  `run ramcheck.js sf4check.js` → matches the 1× derivation (≈7.65 GB per S5), nowhere near
  the 4×/16× bands — corroborates the discount is live. Check the achievements page: `SF4.1`
  present (self-granted per S1; if the periodic check hasn't fired by end of sitting, note
  it — cosmetic, S1's fallback applies).
- **L7 — Survival round-trip.** Export the save again → `saves/`, role
  `post-import-reexport`; `describe` it → INDEX row; its summary must still show SF
  `[[1,1],[4,3]]` — proving the entry survived a real load/save cycle (features Q3 answered
  empirically). If it did NOT survive: S8's contingency — import `pre-edit-backup`, stop.
- **L8 — Rollback (only if needed at any point):** Options → Import Save →
  `pre-edit-backup`. Its integrity was proven in L2/L4.

## Acceptance criteria

- **`npm test` green** including `test/savegrant.test.js` (work item 3's full list) — no
  existing suite touched. [code, implementer clears]
- **CLI report on the real save:** `grant` run on `pre-edit-backup` printed
  `ALL GUARDS PASSED` with +6 bytes and summaries differing only in `sfLevels`; report
  content captured (INDEX note or commit message). [live artifact, checkable on disk]
- **Rollback protected:** `pre-edit-backup` committed in `saves/` with an INDEX row whose
  sha256 matches the on-disk file (`Get-FileHash` re-check recorded in L4). [live]
- **Unlock verified from exported logs, not paste:** `logs/sf4check-<epoch>.json` shows
  `ownedSF` ⊇ `[4,3]` (the level-3 gate) and a non-throwing singularity probe;
  `logs/ramcheck-result.json` shows `sf4check.js` matching the 1× derivation (≈7.65 GB per
  S5), nowhere near the 4×/16× bands — corroboration, dropped as evidence only if
  `getScriptRam` proves level-unadjusted per S5. [live]
- **State intact:** L5 spot-check passed (hacking/money/augs match the indexed pre-edit
  summary). [live]
- **Survived a load/save cycle:** `post-import-reexport` committed + indexed, its decoded
  summary still carrying `[4,3]`. [live]
- **Achievements:** `SF4.1` observed on the achievements page (self-granted) — recorded in
  the CHANGELOG; absence by end of sitting triggers S1's accepted fallback (follow-up
  mini-edit with this phase's tooling), not a blocker. [live]
- **Bookkeeping:** `saves/INDEX.md` rows for all kept saves incl. the three role-tagged
  artifacts; `.gitignore` policy per S6; BACKLOG/CHANGELOG updated and phase docs graduated,
  staged with the work. [code]

## Files touched

**New:** `tools/save/savelib.mjs`, `tools/save/sf4grant.mjs`, `test/savegrant.test.js`,
`src/sf4check.js`, `saves/INDEX.md`, `saves/*.json.gz` (moved/created artifacts).

**Edited:** `vite.config.ts` (one filter line), `.gitignore` (S6 policy),
`BACKLOG.md`, `docs/phases/CHANGELOG.md`.

**Deleted:** the two repo-root save extraction dirs + two root `*.pretty.json` scratch files
(regenerable from committed .gz; regeneration documented in `INDEX.md`).

**Deliberately untouched:** `daemon.js` and the entire batcher/companion graph, all existing
tests and log schemas, `translog.js` (no spend), `tools/bb/` (used read-only in L5).
