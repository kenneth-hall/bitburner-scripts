# Phase 21 — Grant SF4.3 via save edit (features / brainstorm)

**Stage:** Brainstorm (opus). Hands off to fable for the spec.
**Date:** 2026-07-12
**Goal of this phase:** Make Kenneth's current save reflect owning **Source-File 4 level 3**
(The Singularity, full RAM discount) *without* playing BN4 — a deliberate, eyes-open cheat —
so `ns.singularity.*` becomes available and the manual-UI-only constraint that gates a large
swath of backlog is permanently lifted.

This is a **save-file surgery** phase, nothing more. See the hard scope boundary below.

---

## Theory (what actually unlocks SF4)

Established by reading the parsed save (`bitburnerSave_1783857287_BN1x2.pretty.json`) and game
mechanics — **not** by reading engine source:

- Source files serialize inside the (stringified) `PlayerSave` as:
  `"sourceFiles":{"ctor":"JSONMap","data":[[1,1]]}` — a JSONMap of `[bitNodeNumber, level]`
  pairs, numeric keys. Current save owns **SF1 level 1** only.
- **SF4 availability gates solely on this map containing `[4, level]`.** Adding `[4,3]` grants it.
- **SF4 grants NO stat multipliers** (unlike SF1). Confirmed: the 31 `mults.*` keys are
  independent of SF4, so there is **no player-multiplier recompute** to do — this is why the edit
  is genuinely "only json work" and not a cascade.
- **SF4 level sets the RAM cost of every `ns.singularity.*` call:** level 1 → 16×, level 2 → 4×,
  **level 3 → 1× (full discount)**. Level 3 is required for the automation to be practical on
  `home`; that's why we grant 3, not 1 (1 = "beat BN4 once" literally, but nearly unusable).
- The `.gz` backup is **plain gzip of the raw JSON** — verified byte-identical decompress and a
  clean re-gzip round-trip. So the apply path is fully understood and low-risk:
  `Backup Save → gunzip → edit one substring → gzip → Import`.

### Resulting state (Decision: base state = keep current run)
Add `[4,3]` to the current BN1x2 save, **keeping all 13h of the current BN1.2 re-clear** (hacking,
augs, factions, money untouched). This is a state the game never produces naturally (you can't earn
SF4 without a reset), but nothing forbids "SF4 while mid-node" — it loads clean. Singularity becomes
usable *inside* the current BN1 run immediately, which is exactly what we want for automating the
Daedalus → Red Pill → backdoor-WD endgame.

---

## Decisions locked

1. **Grant SF4 level 3** (full 1× Singularity RAM). *Rationale:* the whole point is usable
   automation; 4.1's 16× RAM would make it impractical.
2. **Direct `sourceFiles` map edit** (Path A), not "play/fast-forward BN4 to natural completion"
   (Path B — rejected, see below).
3. **Base state = keep the current BN1 run** (Option 1). Fall back to a BitVerse-screen state only
   if a load-time validator rejects the impossible "SF4 mid-node" combo (open question).
4. **Minimal-substring edit as a safety invariant.** The only byte change in the ~1.88 MB file must
   be the literal insertion `,[4,3]` turning `[[1,1]]` into `[[1,1],[4,3]]`. Everything else stays
   byte-for-byte identical to the game's own export. This is verifiable (`cmp` / diff the two files;
   exactly one insertion) and is the core corruption guard.
5. **One-shot apply window.** Because re-importing overwrites live state, the sequence is: fresh
   Backup Save → edit → Import, done in one sitting with no play in between (otherwise the import
   rolls back progress).
6. **Add matching achievement records (cosmetic fidelity — Kenneth wants it).** Append
   `SF4.1`, `SF4.2`, `SF4.3` achievement entries to the `achievements` array, mirroring the exact
   shape of the existing `SF1.1` record already in the save (`{"ID":"SF4.1","unlockedOn":<epoch-ms>}`),
   so the achievements page reads as a legit level-3 BN4 clear. *This is still json-only and additive —
   it does not affect the SF4 unlock, which gates on the map.* Spec must **confirm the exact IDs** and
   whether a separate destroyed-BitNode achievement also applies (the SFx.y pattern is confirmed by
   analogy to the owned `SF1.1` record; treat unverified IDs as spec-to-confirm, don't guess-write them).
   Use plausible `unlockedOn` timestamps (e.g. just before the current `lastAugReset`).

---

## Hard scope boundary (pushback #1 — anti-balloon)

This phase is **only**: edit the save to grant SF4.3, apply it, and **verify Singularity is live.**

It is **NOT** any of the now-unblocked automation. Explicitly out of scope, each its own later
phase: auto-backdoor, aug-planner execution, TOR ladder, rep watchers, and any `ns.singularity.*`
tooling. Do not let "while we're here" pull those in.

---

## Safety rails (pushback #2 — one live save)

- **The pre-edit `.gz` is the rollback and must stay untouched.** Keep the exact file the game
  exported; never edit in place.
- **Minimal-substring invariant** (Decision 4) — the diff proves we changed nothing but the SF entry.
- **Verify before trusting** — do not delete the backup or resume play until verification passes.
- **Do this over CDP / manual UI import**, not by poking the live checkout — this touches game
  progression, so per CLAUDE.md the actual in-game Import is a confirmed action Kenneth performs
  (or explicitly authorizes).

---

## Rejected alternatives

- **Path B — enter BN4 and fast-forward to natural completion.** Rejected. Strictly *more* editing
  and risk for only cosmetic fidelity: reaching a natural destroy requires editing hacking to ~9000,
  WD backdoor, money/augs — many more fields with cross-consistency to maintain — and the
  destroy-node event fires from the terminal `backdoor` **action**, not from a saved flag, so a save
  edit won't "trigger it naturally" anyway. SF4 has no mult side-effects, so Path A yields a
  functionally identical result. Dominated.
- **`bitNodeOptions.sourceFileOverrides`** (the empty JSONMap already in the save). This is the
  game's *intended* per-run "pretend you have these SF levels" feature for challenge/testing runs —
  but it's per-run and flags the run as modified (suppresses earning/achievements). Wrong tool for a
  permanent grant. Edit the real `sourceFiles` map instead.
- **CDP `Runtime.evaluate` to poke the live `Player` object.** Avoids the file round-trip, but the
  production Steam build may not expose engine internals, and the gzip round-trip is already *proven*
  lossless. Prefer the proven path; keep CDP as a fallback only if import misbehaves.
- **Grant SF4 level 1 or 2.** Rejected per Decision 1 — RAM tax makes the API impractical.
- **Skip the cosmetic achievements.** Rejected — Kenneth wants the achievements page to read as a
  legit clear (Decision 6). Kept additive and json-only so it carries no functional risk.

---

## Open questions for fable / spec

1. **Importer acceptance:** does the in-game Import require a `.gz`, or also accept a plain `.json`?
   Does the filename matter? (We can produce either; confirm the exact expected input.)
2. **Verification criterion:** confirm SF4 is registered *and* the API is live. Proposed: a tiny
   throwaway script logging `[...ns.getResetInfo().ownedSF]` (expect `[[1,1],[4,3]]`) **and** a cheap
   no-op singularity call (e.g. `ns.singularity.getOwnedAugmentations()`) that must not throw. Confirm
   `getResetInfo()` exposes `ownedSF` in this build (`auginfo.js` already uses `getResetInfo().ownedAugs`,
   so the call is available — confirm the SF field name/shape).
3. **Load-time validation:** does the engine recompute/validate/normalize `sourceFiles` on load in a
   way that could drop or reject an "impossible" (SF4 without reset) entry? If yes, fall back to base
   state Option 2 (BitVerse screen). Believed no — confirm by loading and re-exporting, then checking
   the map survived.
4. **Edit method:** targeted substring replace on the raw file (safest — preserves the minimal-diff
   invariant) vs. full parse → mutate `PlayerSave` → re-serialize. Recommend substring; call it out so
   the spec doesn't reach for a JSON round-trip that could reflow unrelated bytes.
5. **Achievement IDs:** confirm the exact strings for `SF4.1/4.2/4.3` (and any destroyed-BitNode
   achievement) against `markdown/` or the in-game achievements reference before writing them —
   don't ship guessed IDs. (The pattern is confirmed by the owned `SF1.1` record; the specific SF4
   strings are not yet verified in-hand.)
6. **Save-dir location & git policy:** where `saves/` lives and whether the bulk `.gz` files are
   gitignored vs. committed (see bookkeeping section — spec to finalize the recommendation).

---

## Save-file protection & bookkeeping (Kenneth's ask — make this first-class)

The single live save is the irreplaceable asset here; the SF4 edit is trivial next to *not losing
it*. The spec must define, not hand-wave, how we track saves before/after and keep them organized.

**Requirements the spec must satisfy:**
- **A single source of truth for "which save is what."** Today saves are scattered — extracted dir in
  the repo root, `.gz` files in `~/Downloads`, my `*.pretty.json` scratch copies. That sprawl is a
  liability. Consolidate into one **`saves/`** directory and stop trusting the game's opaque
  `bitburnerSave_<epoch>_BN<n>x<lvl>` filenames to convey meaning.
- **A committed `saves/INDEX.md`** — one row per save file we keep, recording: game filename, our
  **role tag**, capture timestamp, decoded state (BN, owned SF, hacking, money), **sha256**, and a
  one-line note. The hash is what lets us *prove* a file is the untouched original (pairs with the
  minimal-diff invariant) and detect silent corruption.
- **Explicit role tags for this phase's three artifacts:**
  1. `pre-edit-backup` — the exact export the edit is based on; the **rollback**. Never modified.
  2. `edited-import` — the file we import (pre-edit + `,[4,3]` + achievement records).
  3. `post-import-reexport` — an export taken *after* a clean import, to capture the confirmed-good
     state and prove the SF4 entry survived a real load/save cycle.
- **Durability for the rollback.** Recommendation: commit at least the `pre-edit-backup` `.gz` (or, if
  size is a concern, its sha256 in the index) so the rollback is versioned and survives a disk loss —
  the strongest form of "protect our save." Spec to decide commit-the-file vs. commit-the-hash and
  set the `.gitignore` policy for the bulk saves.
- **Optional nice-to-have (guard scope):** a small `saves/index.mjs` that scans `saves/`, decodes
  each file's BN/SF/hacking/money (reusing the deep-parse we already wrote), computes hashes, and
  regenerates `INDEX.md`. Useful long-term as we accumulate saves across nodes — but it's *tooling*,
  not the safety requirement, so it's explicitly optional and must not delay the core work.

---

## Testing plan (Kenneth's ask — this is NOT a live-only phase)

Key reframe: the risky artifact — the edited save — is **produced by a pure transform and is fully
testable *before* it ever touches the game.** Only the final unlock confirmation is live. Three
layers:

**Layer 1 — Out-of-game artifact tests (vitest, `npm test` — the bulk of confidence).**
The edit (`gunzip → insert into sourceFiles map → append achievement records → gzip`) and its
validators are pure functions over a fixture. Assert, against a committed fixture save:
- **gzip round-trip is lossless** — `gunzip(gzip(x)) === x` (already proven manually; lock it in a test).
- **minimal-diff invariant** — the edited raw JSON differs from the source by *exactly* the intended
  insertions and nothing else (structured diff: only `sourceFiles.data` gains `[4,3]` and
  `achievements` gains the SF4 records; every other field deep-equals the original).
- **parse integrity** — outer JSON parses; the stringified `PlayerSave` parses; the reconstructed
  `sourceFiles` map contains both `[1,1]` and `[4,3]` with numeric keys; achievement IDs are the
  confirmed strings.
- **impossible-input guards** — the transform refuses to run if the source doesn't already contain
  exactly `[[1,1]]` (so it can't silently corrupt an unexpected save shape).

**Layer 2 — In-game unlock verification (live, after import).**
- Game **loads without error**; current BN1 progress intact — spot-check hacking/money/aug-count
  equal the pre-edit decoded values from the index.
- Throwaway verify script: log `[...ns.getResetInfo().ownedSF]` (expect it to include `[4,3]`) **and**
  make a cheap real `ns.singularity.*` call that must return without throwing — this proves both the
  SF is registered *and* the 1× RAM is genuinely usable. **Export the result to a log file**
  (project convention — no terminal-paste reliance; wire the filename into `vite.config.ts` if needed).
- Achievements page shows SF4.1/4.2/4.3 (visual confirm).

**Layer 3 — Rollback confidence (before we commit to the import).**
- Before importing, confirm the `pre-edit-backup` sha256 recorded in `INDEX.md` matches the on-disk
  file and it parses cleanly — so we *know* the rollback artifact is good before we ever need it.

**Ship gate:** Layer 1 must pass (`npm test`) before the edited file is imported. Layers 2–3 are the
live validation Kenneth runs; the phase isn't done until all three pass and the `post-import-reexport`
is captured and indexed. Note in the changelog which parts were vitest vs. live.
