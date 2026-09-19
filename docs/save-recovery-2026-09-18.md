# Save loss and rebuild — 2026-09-18

Record of a total save loss and the rebuild that followed. Kept because three of its findings
are reusable and one of them is a landmine that will bite anyone who edits a save again.

## What happened

An **unclean shutdown at 2026-09-08 07:24:53** (System log `Kernel-Power 41`, then
`EventLog 6008` — *"The previous system shutdown at 7:24:53 AM on 9/8/2026 was unexpected"*).
NTFS recovered file **metadata** but lost the data blocks still sitting unflushed in cache, so
affected files came back **correct-sized and zero-filled**.

Damage:

| Artifact | State |
|---|---|
| IndexedDB save blob | 2,717,609 bytes, **0.00% nonzero** |
| `logs/*.json` | **245 of 305** whitespace/zero-filled |
| Surviving logs | everything dated **2026-07-20 or earlier** |
| Disks | all three report **Healthy** — a power event, not failing hardware |

The game reported `Save data exists, but its type is invalid.` and entered RECOVERY MODE, whose
only controls are Export save file / Export crash report / Soft Reset / Delete Save. **There is
no import option in recovery mode** — Soft Reset did not clear it, so Delete Save was required
before the game would accept an import.

## Why the save was unrecoverable (verified, not assumed)

The leveldb store held **1,272 `bitburnerSave` records**, which looks like 1,272 chances at
recovery. It is not. Every record is **~985 bytes of metadata pointing at the external blob**,
and the blob is the part that was zeroed. The **longest nonzero run in the entire 1.2 MB log
file is 31 bytes**. There is no inline payload at any version.

Other avenues checked and closed:

- **Steam Cloud** (`userdata/44506712/1812820/remote/`) — holds a save, but from **2026-07-04**,
  older than the local backups.
- **Volume Shadow Copies** — `vssadmin` needs elevation; not attempted. Still the only untried
  avenue if a byte-exact pre-crash save is ever needed.
- The `bitburner-save-recovery-2026-09-08` folder made on the day of the crash copied the
  **already-dead** blob, so it added nothing.

Corrupt artifacts archived to `bitburner-save-recovery-2026-09-18/corrupt-indexeddb/`.

## The rebuild

Base: `saves/bitburnerSave_1786895766_BN6x1.json.gz` (2026-08-16 10:56), the newest intact
export — **33 days** before the crash. It holds SF1.3 / SF4.3 / SF2.1 / SF5.1, in BN6.

| Gap | Handling |
|---|---|
| SF6.1 (BN6 cleared 2026-08-16) | **earned** — granted by an in-game clear |
| SF10.1 (BN10 cleared 2026-08-25) | **injected** — restoration of a documented clear |
| SF9.1 (BN9 **never finished**, ~1 day short) | **granted** — a make-good, Kenneth's call, not a restoration |
| Intelligence | **extrapolated**, see below |

### Intelligence extrapolation

Intelligence is one of the few things that survives a node change, so it had to be reconstructed
rather than reset. Old saves give a clean series (it reads 0 through BN1/BN2 — it unlocks on
entering BN5):

```
2026-07-25   2,018 exp   lvl 51
2026-08-16   8,552 exp   lvl 91      -> 296.1 exp/day over 22.07 d
```

Applied across the 33.33-day dark window: **8,552 + 296.1 x 33.33 = 18,422 exp -> level 115**.

The formula validates exactly against the save: `lvl = floor(32*ln(exp+534.6) - 200)` predicts
348 hacking where the save reads 348, and 91 intelligence where the save reads 91.

Two reasons to trust the central estimate over a conservative one: the measured window is
Bladeburner grinding in BN6, structurally the same as the dark window (BN10 + BN9); and the
measured window had **no grafting** (SF10 arrived 2026-08-25) where the dark window had 10+
grafts, which also pays Intelligence. So 296.1/day is more likely low than high. Level is
logarithmic in exp, so the whole plausible range 109-121 is only +-6 levels.

## Method: let the game perform its own prestige

A BitNode reset rewrites servers, factions, augmentations, programs and skills **together**.
Hand-synthesizing a fresh-node state is how a save gets subtly broken, so the rebuild did not
try. Instead it satisfied the documented precondition for the game's own clear —

> "You must have the special augment installed and the required hacking level OR Completed the
> final black op." — `markdown/bitburner.singularity.destroyw0r1dd43m0n.md`

— by injecting **The Red Pill** and **hacking 6,338** (BN6's WD gate is 6,000), both of which
the prestige then wipes. `destroybn.js` cannot be used for this: it hard-refuses unless
`getNextBlackOp()` reads `null`, i.e. all 21 black ops are done. `src/recoverbn.js` exists to
reach the same call by the hacking route.

The recovery script was **injected directly into the save's `home` filesystem** rather than
pushed through viteburner, sidestepping the new-file upload bug entirely. Schema, for reuse:

```
AllServersSave -> home -> data -> scripts -> {ctor: "JSONMap", data: [[filename, {
  ctor: "Script",
  data: { code, filename, server: "home",
          metadata: {ctor: "FileMetadata", data: {atime, mtime, btime}} }}], ...]}
```

Clocks (`lastSave`, `lastUpdate`) were stamped to the import time so the game would not process
33 days of offline production.

## 🔴 The landmine: `w0r1d_d43m0n` is an orphan until The Red Pill is installed *in play*

**In every save, WD carries `serversOnNetwork: []` and no server links to it.** Installing The
Red Pill is what wires it to `home`. Injecting the augmentation into a save grants the aug but
**skips the wiring**, leaving the server unreachable. Consequences, in the order they appeared:

- `ns.getServer("w0r1d_d43m0n")` throws **`Invalid host`**.
- **`ns.singularity.destroyW0r1dD43m0n(n)` fails SILENTLY** — no error, no modal, no effect. It
  prints its own "DESTROYING" line and simply returns, because its internal WD lookup fails.
- The terminal still *knows the name* (`connect w0r1d_d43m0n` gives "Cannot directly connect…"
  where a nonsense host gives "Invalid hostname"), because `connect` special-cases the constant.
  **That difference is what proves the server is absent rather than merely unreachable**, and it
  is the fastest way to diagnose this.

Fix — two edits to `AllServersSave`:

```python
home["serversOnNetwork"].append("w0r1d_d43m0n")
wd["serversOnNetwork"] = ["home"]
wd["hasAdminRights"] = True          # so the terminal `backdoor` route also works
```

📌 Sibling to the repo's existing *"a script can fail after it starts"* rule: here the **API call
itself** failed after starting, with no modal at all. An `ns` call returning without error is not
evidence it did anything.

## ⚠️ A restored save brings its automation back up, live

The clear was ultimately fired by **`backdoorwd.js`**, not by `recoverbn.js`. Once WD was wired
and rooted, the resident script noticed hacking 6,338 cleared the 6,000 gate, backdoored WD on
its own within seconds, and the BitVerse appeared. Expect the **whole fleet** (`gatewatch.js`,
`augfarmer.js`, `backdoorfactions.js`, the batcher) to resume and *act* the moment a save loads.

## Outcome

Landed in **BN3.1** on 2026-09-18, verified live:

- Source-Files **1 · 2 · 4 · 5 · 6 · 9 · 10** on the Augmentations screen
- Intelligence **115 (18.7k exp)** carried through the prestige
- Fresh-node state otherwise — $1.262k, all stats 1, no augmentations

Verification trick worth keeping: on the **BitVerse**, node markers are colour-coded —
**blue = SF at max level 3**, **red = SF owned below max**, **yellow = not owned**. Checking the
four already-known Source-Files (SF1.3 and SF4.3 blue; SF2.1 and SF5.1 red) validates the key,
after which the remaining colours are trustworthy evidence. Markers carry the node name only in
`aria-label`; their visible text is a bare `O`, so text matching cannot reach them.

## The lesson that actually cost something

**The last export was 33 days old.** Source-Files and Intelligence were reconstructable from
documentation and arithmetic; the BN9 grind was not. `ns.singularity.getSaveData()` exists
(1 GB, returns `Promise<Uint8Array>`) and a periodic auto-export into `logs/` would ride the
viteburner download bridge into git, making the next power cut a non-event. **Not yet built.**

⚠️ **Export cannot be driven over CDP.** The Options → Export Game button opens a native
Save-As dialog that CDP cannot see or drive; clicking it produces no file. Byte-level backups of
`%APPDATA%/bitburner/IndexedDB/` work as a cold copy (one taken at BN3 entry is in
`bitburner-save-recovery-2026-09-18/healthy-indexeddb-BN3-entry/`, 99.65% nonzero), but a real
`.json.gz` export needs a human click.
