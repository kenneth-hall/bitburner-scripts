# Gang handoff — loose ends

**⚠️ THIS FILE IS DISPOSABLE. Delete it once every item below is resolved.** It is not reference
material — the durable content lives in `docs/gang-api.md`, `docs/bitnodes.md`, and `BACKLOG.md`.
This file exists only so a handful of dangling items from the 2026-07-18 BN2-entry session don't
get lost between sessions.

---

## 1. `src/share-off.txt` — DELETE THE MOMENT WE JOIN ANY FACTION ⏰

**Highest-consequence item here.** A 0-byte marker file that forces the daemon's share fraction
to 0.

**Why it exists:** on the factionless BN2 start, `ns.share()` held **24 GB of a 100 GB fleet for
zero benefit** — its reputation multiplier only applies while doing faction work
([[reference_share_boost_needs_faction_work]]) and we were in no factions. That cut batch budget
to 75 GB, below the 1,891 GB minimum pipeline of the top-scored target, so the daemon skipped
every tick and earned **$0 for ~7 hours**. Removing it restored income immediately
($5,695 → $14,565 in 45 s).

**Trigger:** `ns.getPlayer().factions` is non-empty. From then on the marker is pure loss — we'd
be forgoing the rep bonus exactly when rep starts mattering.

**Action — two steps, and the second is easy to forget:**
```
git rm src/share-off.txt          # 1. remove from repo
# 2. viteburner does NOT propagate deletions -- the in-game copy survives.
#    Remove it in-game too, or share stays off:
node tools/bb/cli.mjs terminal "home"
node tools/bb/cli.mjs terminal "rm share-off.txt"
```
(This deletion-doesn't-propagate behaviour was confirmed today when `targetsmonitor.js` lingered
in `dist/` and in-game after `git rm`.)

**Verify:** daemon prints `INFO: share ON (25%)`, and `logs/daemon-status.json` shows
`share.off === false`.

**Proper fix, so this never recurs:** auto-suppress share whenever `ns.getPlayer().factions` is
empty — provable, not heuristic. Recorded in `BACKLOG.md` under Bugs.

---

## 2. `src/gangreach.js` — dead code, safe to delete anytime

Answered its question permanently: **only `inGang()` works before a gang exists**; every other
call, including the 0 GB ones, throws `Must have joined gang`. That finding is recorded in
`docs/gang-api.md` and in memory, so the script has no remaining purpose.

**Keep `src/gangprobe.js`.** It dumps the static task/equipment tables and will work correctly the
moment a gang exists — it is the first thing to run post-`createGang`.

---

## 3. Untracked files in the repo root

`bb-shot.png` plus four `saves/bitburnerSave_*.json.gz` (~2 MB total) have been untracked all
session. They were deliberately left alone — they're Kenneth's, and one was nearly swept into a
commit by a careless `git add -A`. Decide: commit, `.gitignore`, or move out of the repo.

---

## Context needed to act on the above

- **We are in BN2.1, committed** (decision made 2026-07-18).
- **No factions joined yet.** CyberSec is reachable right now (backdoor CSEC, needs hacking 51;
  we're at ~159) — joining it both retires item 1's trigger and gives a free `createGang` probe,
  since `createGang` returns `false` harmlessly if a faction can't host a gang.
- **`augfarmer.js` needs 64.10 GB and cannot run on a 32 GB home** — our aug-acquisition engine is
  offline in BN2. Tracked in `BACKLOG.md`; not a loose end so much as an open phase.
- **No gang features doc exists.** The previous one was deleted rather than patched a fourth time;
  `docs/gang-api.md` is the reference that should precede writing a new one.

---

**When items 1–3 are done, delete this file.**
