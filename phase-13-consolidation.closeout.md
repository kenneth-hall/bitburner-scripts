# Phase 13 close-out — root cause of the RAM-gate discrepancy + remaining steps

**Date:** 2026-07-05 (written the same evening as `HANDOFF.md`, after a forensic review of it).
**Supersedes:** `HANDOFF.md`'s "Where we're stuck" / "What's left" sections and BACKLOG's
Phase-13 live-validation checklist. This document is the single list to execute.
**Audience:** the next session. **[code]** = implementer does it; **[live]** = Kenneth in-game.

---

## Part 1 — Root cause: the RAM gate measured stale code, not an analyzer mystery

### The reported bug

`launchmonitor.js` measured −0.40GB vs the predicted −0.65; `sharecurve.js` +0.30 vs the
predicted +0.05 — both off by exactly the five port openers (5 × 0.05 = 0.25GB). Two
code-shape fixes (`d74fd45`, `efcb0a2`) produced bit-identical readings, three runs in a row.
The session concluded (tentatively) that Bitburner's analyzer can't prune the openers out of
`hosts.js`'s importers, and stopped.

### Finding 1 — hard evidence: the game was served stale code during this session

`vite.config.ts` sets `dumpFiles: 'dist'`, so `dist/src/*` is a byte-faithful record of the
**last content viteburner actually pushed to the game**, per file. Inspecting it (all times
2026-07-05, local):

| artifact | dump mtime | content |
|---|---|---|
| `dist/src/common.js`, `ramprobe-workerkeys.js`, `ramcheck.js` | 20:38:36–37 | **Phase-13** versions (new-in-phase files) |
| `dist/src/hosts.js`, `launchmonitor.js`, `sharecurve.js`, `daemon.js`, `targets.js`, `connect.js`, `killscripts.js` | **20:46:02** | **pre-Phase-13** versions — old monolithic `getHosts`, old `launchmonitor.js` importing `getHosts`, old `sharecurve.js` with its local `listHosts` |

Cross-referenced with git commit times, the 20:46 event is explained exactly:

- 20:45:55 — handoff commit `1c5524d` lands on the branch.
- **~20:46:02 — `git checkout master` (pre-merge master = pre-Phase-13 content) in this
  checkout, in preparation for the merge. viteburner was watching and instantly pushed the
  reverted files into the game.**
- 20:46:14 — merge commit `05b9cf3` restores Phase-13 content in the working tree — but **no
  re-push ever happened** (no dump entry after 20:46:02; the game side had presumably
  disconnected as the session wound down).

Two consequences:

1. **The in-game state right now is pre-Phase-13** for every file the phase modified, plus
   orphaned Phase-13-only files (`common.js`, the probe). `HANDOFF.md`'s claim that the dev
   server is "currently serving master's post-merge code" is wrong. The in-game daemon is
   running the old (previously validated) code — harmless, but nothing about Phase 13 is
   currently live.
2. **This proves the sync pipeline silently served stale code during this very session** —
   the same failure class already on record twice (BACKLOG: "viteburner dev-server silently
   stops auto-exporting"; memory: "an ESTABLISHED socket isn't proof sync works").

### Finding 2 — the three "identical" after-readings cannot be trusted

The after-run timestamps (in-game clock) vs the fix commits:

| event | time |
|---|---|
| after-run 1 (3.45 / 5.95) | 20:21:55 |
| fix 1 `d74fd45` committed | 20:26:57 |
| after-run 2 (identical) | 20:33:03 |
| fix 2 `efcb0a2` committed | 20:38:16 |
| full re-push event (dev-server restart) | 20:38:36 |
| after-run 3 (identical) | 20:39:49 |

The timing *permits* the fixes having synced — but given Finding 1 (a proven stale push in
the same session) and the known silent-stall mode, none of the three runs verified what code
the game actually held when `ns.getScriptRam` was called. Three bit-identical readings across
three different `hosts.js` shapes is exactly what "the game kept analyzing the same old file"
looks like.

### Finding 3 — clean counterevidence that the analyzer prunes fine

`sampling.js` contains `formulasHackGrowPlan` — a **non-exported, top-level named helper
called only by exported siblings**, structurally identical to `hosts.js`'s `openPort` — and
it contains `ns.getServer` (2GB) and `ns.hackAnalyzeSecurity` (**1GB**, verified against
`markdown/`). If non-exported helpers leaked into every importer, `sharecurve.js` (which
imports only `hasFormulas` + `inFlightByTarget` from `sampling.js`) would carry that phantom
1GB. Its absolute readings (5.65 baseline, 5.95 after) leave no room for it — a full
manual accounting of sharecurve's reachable ns set lands within 0.10GB *without* any
sampling.js leak, and would miss by ~1GB with it. Likewise `connect.js` = 2.00 exactly
(base 1.6 + `scan` 0.2 + `ls` 0.2) — no leakage from `common.js`'s unused exports.

So the theory the two fix commits were chasing ("the analyzer can't prune closures-as-data /
non-exported helpers out of importers") is contradicted by clean data **from the same
session** for the non-exported-helper case.

### Finding 4 — the measured numbers match the *original* implementation shape exactly

The first Phase-13 implementation (`2f5f9da`) still had the five opener closures in a
**module-top-level const array** (`{ file, open: (ns, host) => ns.brutessh(host) }`).
Function values stored in top-level data structures are not call-graph-prunable — every
importer pays them. That shape legitimately costs `listHosts`-only importers +0.25:

- `launchmonitor.js`: 3.20 (perfectly pruned) + 0.25 = **3.45** — the measured value.
- `sharecurve.js`: 5.70 (predicted) + 0.25 = **5.95** — the measured value.

And the −0.40 that *did* materialize for launchmonitor is exactly `tryRoot`'s direct-body
calls (`fileExists` 0.1 + `getServerRequiredHackingLevel` 0.1 + `getServerNumPortsRequired`
0.1 + `getHackingLevel` 0.05 + `nuke` 0.05) — pruning working correctly on everything that
sat in the exported function's own body.

### Verdict

**Most probable (call it H-sync):** all three after-runs measured `2f5f9da`'s `hosts.js`;
the two fixes never reached the game. The "0.25GB mystery" is a measurement artifact of a
stale sync, and either fix (probably both) actually works. The spec's original predictions
(−0.65 / +0.05) are likely correct and simply never got a fair measurement.

**Residual possibility (H-analyzer):** fix 2 did sync (after-run 3 followed a dev-server
restart) and `openPort` genuinely leaks despite Finding 3's counterexample. Kept alive only
because we can't retroactively verify what was in-game; the same re-run that closes the
phase discriminates the two at no extra cost.

**Either way:** the long doc comment now in `src/hosts.js` (above `tryRoot`) asserts the
closures-as-data theory as "confirmed live" — it is not confirmed; it was inferred from
compromised measurements. It must be rewritten at close-out (Part 4).

---

## Part 2 — Make the RAM gate self-verifying first **[code]**

The gate must never again depend on *assuming* the sync worked. Extend `src/ramcheck.js` to
also report each script's in-game byte length (`ns.read` is 0GB), so every future gate run
carries its own staleness proof:

```js
export async function main(ns) {
  const names = ns.args.length > 0 ? ns.args.map(String) : ["daemon.js", "share.js"];
  const result = {
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
    scripts: {},
    bytes: {}, // in-game source length per file -- compare against dist/src/* on disk
  };
  for (const name of names) {
    result.scripts[name] = ns.getScriptRam(name, "home");
    result.bytes[name] = ns.read(name).length;
  }
  ns.tprint(Object.entries(result.scripts).map(([n, r]) => `${n}: ${r} GB`).join(" | "));
  ns.write("ramcheck-result.json", JSON.stringify(result, null, 2), "w");
}
```

Verification after each run — compare against the dump (what viteburner last pushed):

```bash
node -e "const r=require('./logs/ramcheck-result.json'),fs=require('fs');
for(const[f,b]of Object.entries(r.bytes)){const d=fs.statSync('dist/src/'+f).size;
console.log(f, b===d?'OK':'STALE  game='+b+'  pushed='+d);}"
```

Every row must print `OK` before any reading from that run counts. (`ns.read` returns the
transformed source the game holds; the dump is byte-identical to what was pushed, so equal
lengths ⇒ fresh.)

Also in this commit:

- `git rm src/ramprobe-workerkeys.js` — its job is done. The **1.60GB** reading is valid
  despite the sync mess: the probe was a new file (nothing stale to shadow it) pushed at
  20:38:37, and its only import (`scheduler.js`) was untouched by Phase 13, so identical
  in-game regardless. Conclusion stands: `WORKER_SCRIPTS`' `hack`/`grow`/`weaken` object
  keys are **not** phantom-charged.
- `npm test` — expect 250/250 (nothing tests ramcheck or the probe).

## Part 3 — One verified RAM gate run **[live]**

1. **Kill + restart `npm run dev`** (standing rule; it's been up since before the 20:46
   stale push). It's currently PIDs 14584/16868 or whatever `npm run dev` shows. On restart
   it full-pushes the watched tree — now post-merge master.
2. Sanity-check the push actually happened: `grep -c openPort dist/src/hosts.js` → must be
   ≥ 1 (the dump now holds Phase-13 content).
3. In-game cleanup before measuring: `ls home` then `rm ramprobe-workerkeys.js` and
   `rm cleanup-old-daemon-log-temp.js` (viteburner never deletes).
4. Run the gate (no probe in the list anymore):
   `run ramcheck.js hosts.js targets.js killscripts.js connect.js launchmonitor.js daemon.js cloudcosts.js purchasecloudservers.js targetsmonitor.js bootstrap.js sharecurve.js`
5. Run the byte-verification one-liner (Part 2). All rows `OK` or the run is void.

**Expected against the recorded baseline** (`logs/ramcheck-baseline-phase13.json`, numbers
also preserved in `HANDOFF.md`):

| script | baseline | expected | meaning |
|---|---|---|---|
| `launchmonitor.js` | 3.85 | **3.20 (−0.65)** | H-sync confirmed; spec's S8 met |
| `sharecurve.js` | 5.65 | **5.70 (+0.05)** | spec's S11 met |
| `hosts.js` | 3.65 | 3.65 flat | |
| `daemon.js` | 16.30 | **16.30 exactly flat** | tripwire — see below |
| `bootstrap.js` | 6.20 | **6.20 exactly flat**, < 8.00 | tripwire — see below |
| `targets.js` / `killscripts.js` / `connect.js` / `cloudcosts.js` / `purchasecloudservers.js` / `targetsmonitor.js` | 12.7 / 3.00 / 2.00 / 3.65 / 5.75 / 12.7 | all exactly flat | |

**Tripwire (do not ship past it):** `daemon.js` and `bootstrap.js` import `getHosts`, which
really calls `tryRoot` — they must keep paying the openers. If either *drops* by ~0.25, the
analyzer stopped statically charging the openers through that chain, and the next newly
rootable server would kill the daemon with a dynamic-RAM error. Investigate before merging
anything further.

**Decision tree on `launchmonitor.js`:**

- **3.20** → H-sync confirmed. The mystery dissolves; the openers were only ever charged by
  `2f5f9da`'s top-level closure array; fix 2 (current master) prunes correctly. Go to Part 4.
- **3.45 with all byte-checks `OK`** → H-analyzer is real (first trustworthy measurement of
  it). Apply the last shape change — inline the switch into `tryRoot`'s own body, the one
  shape empirically proven to prune (Finding 4's −0.40), deleting `openPort` entirely:

  ```js
  for (const file of owned) {
    switch (file) {
      case "BruteSSH.exe": ns.brutessh(server); break;
      case "FTPCrack.exe": ns.ftpcrack(server); break;
      case "relaySMTP.exe": ns.relaysmtp(server); break;
      case "HTTPWorm.exe": ns.httpworm(server); break;
      case "SQLInject.exe": ns.sqlinject(server); break;
    }
  }
  ```

  (`npm test` stays green — `test/hosts.test.js` is behavior-level and never imports
  `openPort`.) Commit, **verified** re-sync, re-run the gate. 3.20 → close out, and record
  in BACKLOG's RAM-analyzer item that non-exported helpers leak in `hosts.js` while
  `sampling.js`'s `formulasHackGrowPlan` doesn't — an unresolved analyzer question, parked.
  Still 3.45 → accept the actuals (handoff's Option A): update the spec's gate table with
  real numbers and document the open mystery in BACKLOG's RAM-analyzer item. Correctness
  ships either way — the launchmonitor read-only fix and sharecurve double-count fix are
  real regardless of the 0.25.
- **Anything else** (e.g. 3.85, or byte-checks `STALE`) → the sync is still broken; fix the
  environment before drawing any conclusion.

## Part 4 — Remaining live validation **[live]** (spec live steps 4–6, unchanged)

1. Restart `daemon.js`; run ≥ 15 minutes. `npm run verify:log` green; transactions log
   income unchanged in character.
2. Smoke runs: `run launchmonitor.js` (populates via non-rooting `listHosts`),
   `run connect.js` (CSEC path prints), `run cloudcosts.js` (size table prints),
   `run sharecurve.js` only if Formulas.exe is owned (capacity now excludes the
   purchased-server double-count). Do **not** standalone-run `killscripts.js` mid-session.
3. Rooted-host timestamp: next `INFO: rooted new host …` should carry the `[HH:MM:SS]`
   prefix; if none occurs in the window, record as observe-when-it-happens.

## Part 5 — Docs, backlog, and hygiene **[code]** (after Parts 3–4 pass)

1. **Rewrite the `tryRoot` doc comment in `src/hosts.js`** (the "PORT_OPENERS and openPort
   are scoped…" paragraph). If H-sync was confirmed, replace with the corrected story:

   > The opener ns calls must not live in function values stored in data structures
   > (object/array literals at module top level) — that shape charges all five openers'
   > 0.25GB to every importer of this file (measured live, Phase 13: the original
   > implementation's top-level closure array did exactly that). Function-scoped code in
   > exported functions call-graph-prunes correctly. Note: Phase 13's two mid-gate "fix"
   > commits were measured against a stale in-game copy (see
   > docs/phases/phase-13-consolidation.closeout.md) — the leak was only ever the
   > top-level-array shape.

   If H-analyzer was confirmed instead, state what was actually measured (inline-only
   pruning) without the disproven closures-as-data claim.
2. **Spec:** update `phase-13-consolidation.spec.md`'s RAM-gate table with the verified
   actuals and a one-line pointer to this document's diagnosis.
3. **BACKLOG:**
   - "RAM-analyzer identifier hygiene": record the probe's **1.60GB** reading — object-key
     phantom theory dead; keys are safe. Note the renaming refactor is therefore unnecessary.
   - Replace the Phase-13 live-validation checklist under "Priority order" with a pointer to
     this doc, then (on completion) move the whole Consistency-consolidation entry to a dated
     `docs/phases/CHANGELOG.md` entry; mark priority item 1 of 2 done. The CHANGELOG entry
     should mention the stale-sync incident — it's the phase's most reusable lesson.
   - The "viteburner dev-server silently stops auto-exporting" idea item: add the confirmed
     2026-07-05 20:46:02 incident (checkout-for-merge pushed stale code; dump forensics in
     this doc) as concrete evidence.
4. **Graduate** `phase-13-consolidation.features.md`, `.spec.md`, and this file to
   `docs/phases/`; **delete `HANDOFF.md`** (superseded — its numbers are preserved here and
   in the spec).
5. **New standing rule** (add to CLAUDE.md's engineering conventions, and worth a memory):
   never run `git checkout` / branch switches in the dev-server-watched checkout while the
   game is connected unless you *intend* to push that tree — viteburner pushes on every
   working-tree change. Stop the dev server (or close the game) before merge choreography.
   And every future RAM gate reads are valid only with the Part-2 byte-check `OK`.

## Part 6 — Ship gate

`npm test` after every [code] step (expect 250/250 plus nothing new). The phase closes —
merge of any close-out commits to `master` — only after Part 3's verified gate and Part 4's
daemon session pass, per CLAUDE.md's ship gate. The Phase-13 code itself is already on
`master` (deliberate exception, see `HANDOFF.md`); nothing new rides to `master` without the
validation above.
