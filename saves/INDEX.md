# saves/ — index

One row per kept save file. `sha256` is the on-disk file's hash (`Get-FileHash`
in PowerShell, or `node tools/save/sf4grant.mjs describe <file>`) — pairs with
the minimal-diff invariant (phase-21-sf4-grant.spec.md S2) to *prove* a file
is untouched and to catch silent corruption.

Only the `.json.gz` files are committed (see `.gitignore`: `saves/*.json` and
`saves/*.pretty.json` are ignored — regenerable). To regenerate a decompressed
or pretty copy from a committed `.gz`:

```
node tools/save/sf4grant.mjs describe saves/<file>.json.gz   # summary + sha256
node -e "require('fs').writeFileSync('out.json', require('zlib').gunzipSync(require('fs').readFileSync('saves/<file>.json.gz')))"
```

## Kept saves

| file | role | captured (UTC) | BN | ownedSF | hacking | money | augs | sha256 (file) | note |
|---|---|---|---|---|---|---|---|---|---|
| `bitburnerSave_1783725264_BN1x1.json.gz` | bn1x1-archive | 2026-07-10T23:14:24Z | 1 | `[]` | 1318 | 17622527652.665 | 39 | `57fb3f9700b6c3b70dddd7fc793c8f8df241d4f11e1eb81c3f4b8afa7d1db64a` | Historical reference from the BN1.1 clear run, predates Phase 21. `ownedSF: []` is expected — the SF grant fires on the destroy-BitNode event, not stored mid-run, so this capture (pre-completion) shows no owned SFs yet. |
| `bitburnerSave_1783857287_BN1x2.json.gz` | bn1x2-reference | 2026-07-12T11:54:47Z | 1 | `[[1,1]]` | 73 | 486748.6266666666 | 4 | `f8570730dd37d8eadae462875195d124b2383ea86683dd9662bf602d1c1f0453` | Snapshot of the ongoing BN1.2 re-clear, captured before Phase 21's implementation work. **Not** the phase-21 `pre-edit-backup` — that's a *fresh* export taken at the start of the live sitting (L1), since importing rolls back to whatever moment the backup was taken and any progress since this snapshot must not be discarded needlessly. |

## Phase 21 sitting artifacts (added live, one row per step as each file is captured)

Role tags per phase-21-sf4-grant.spec.md S6 / features file:

- `pre-edit-backup` — the exact export the edit is based on; the rollback. Never modified.
- `edited-import` — the file actually imported (pre-edit + the `,[4,3]` insertion).
- `post-import-reexport` — export taken after a clean import, proving the SF4 entry survived a real load/save cycle.

| file | role | captured (UTC) | BN | ownedSF | hacking | money | augs | sha256 (file) | note |
|---|---|---|---|---|---|---|---|---|---|
| _(added during the live sitting — see phase-21-sf4-grant.spec.md "Live procedure")_ | | | | | | | | | |

## Downloads — not yet consolidated

`~/Downloads` holds additional historical saves (2022-era `BN1x0`/`BN1x1` `.json`,
a `BN1x3` and a second `BN1x2` `.gz`) that spec S6 leaves as Kenneth's call at
the live sitting — not moved or decided here.
