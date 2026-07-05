# Phase 14 features: cold-start bootstrap — 8GB home → daemon.js handoff

**Stage:** requirements handoff for the spec stage, per `CLAUDE.md`'s Development workflow.
Like Phase 12, this jumps the agreed priority queue (Phase 13 consolidation has a features file
but no spec/implementation yet): after the 2026-07-05 hard reset the entire automated income
pipeline is offline, so nothing else in the backlog matters until it restarts. The spec stage
turns this into `bootstrap-phase14-spec.md` (note `/spec` with no argument globs the highest
phase number — it will correctly pick this file).

## Goal

Get from a hard-reset save (8GB home, no augmentations, hacking level ~1, no TOR/port openers,
no purchased servers) back to a running `daemon.js` with zero code changes to the existing
pipeline. `daemon.js` measures 16.30GB and cannot load on an 8GB home; the 16GB tier doesn't
help either (16.3 > 16), so the first useful home tier for the daemon is 32GB. The bridge is a
new two-script bootstrap ladder that earns money on remote servers' RAM until home RAM fits the
daemon, then hands off automatically and gets out of the way.

## Current-state facts the design rests on

- **`daemon.js` needs ~19.3GB free at startup, not 16.3**: its `runAndWait(killscripts.js)`
  runs *alongside* it (killscripts predicted ~3.0GB: 1.6 base + scan 0.2 + ps 0.2 + kill 0.5 +
  killall 0.5 — measure at spec). Other companions degrade gracefully (`launchDetached` skips
  with INFO), but killscripts must fit for a clean start.
- **`HOME_RESERVE_GB = 32`** (`hosts.js` + `daemon.js`'s private copy): home contributes zero
  worker RAM until home exceeds 32GB. So a 32GB-home daemon runs entirely on rooted network
  servers' RAM — exactly the pool the bootstrap will already have warmed up.
- **No Singularity on this save** (no SF4 — confirmed live in Phase 11 Round B: purchase calls
  *throw*, they don't return false). TOR, port openers, and home RAM upgrades are all manual
  in-game purchases. `procureprograms.js` already exits cleanly on this state;
  `upgradehomeram.js` is not launched by the daemon (its mention in `runAndWait`'s docstring is
  stale — BACKLOG already notes killscripts is the only call site).
- **Several 0-port servers near home** (n00dles, foodnstuff, and friends) are rootable at
  hacking level 1 with `ns.nuke` alone and carry their own RAM — the initial worker pool.
  Exact stats read live, not hard-coded.
- **`killscripts.js` at daemon startup killalls every remote host and kills everything on home
  except the daemon's own pid** — leftover bootstrap processes are swept for free at handoff.

## Decisions

1. **Bootstrap ladder; existing pipeline untouched.** Two new scripts, no changes to
   `daemon.js`/`hosts.js`/`targets.js`/workers. Chosen over shrinking the daemon (would need to
   cut 8.3GB+ of ns surface — a rewrite into a weaker program) and over a manual-only playbook.
2. **`src/bootloop.js` — self-contained remote worker, predicted 2.2GB** (base 1.6 + hack 0.1 +
   grow 0.15 + weaken 0.15 + getServerSecurityLevel 0.1 + getServerMoneyAvailable 0.1 +
   read 0 — the current-state reads are unavoidable for the action choice; the control file
   only saves the *static* getters). Import-free by design, same reason as
   `hack.js`/`grow.js`/`weaken.js`: it gets `scp`'d to hosts where imports don't follow.
   Forever-loop: weaken if security above threshold, grow if money below threshold, else hack.
3. **Retargeting via a 0GB file read, not exec args.** Each iteration, bootloop `ns.read`s a
   small JSON control file (target + its minSecurity/maxMoney/thresholds) that the deployer
   `scp`s alongside it. A target switch is just rewriting + re-`scp`ing the file — running
   loops pick it up within one iteration, no kill/redeploy. Rejected: target-as-exec-arg, which
   forces kill+redeploy churn on every target switch and adds ~0.7GB (`ps` 0.2 + `kill` 0.5) to
   the deployer. Accepted trade: a switch takes effect lazily (up to one weaken-time), fine for
   bootstrap-grade optimization.
4. **`src/bootstrap.js` — home-resident deployer, predicted ~5.9GB.** Per poll (~10s, matching
   CYCLE_MS): call `hosts.js`'s `getHosts` (rooting included), pick the target, write/`scp` the
   control file + bootloop to any host not yet saturated, `exec` max threads into free RAM,
   check the handoff condition. Budget: base 1.6 + getHosts surface 2.05 (scan 0.2, fileExists
   0.1, cloud.getServerNames 1.05, getHackingLevel 0.05, hasRootAccess 0.05,
   getServerRequiredHackingLevel 0.1, getServerNumPortsRequired 0.1, five openers 0.25, nuke
   0.05, getServerMaxRam/UsedRam 0.1) + scp 0.6 + exec 1.3 + getScriptRam 0.1 +
   getServerMaxMoney 0.1 + getServerMinSecurityLevel 0.1 ≈ 5.85GB. All per-function costs
   verified against `markdown/` docs 2026-07-05.
5. **Reuse `hosts.js`'s `getHosts` rather than a lean private copy.** Costs ~1.2GB more
   (mostly `ns.cloud.getServerNames` at 1.05) but reuses the exact rooting behavior the daemon
   has, picks up manually-bought openers within one poll, and avoids minting yet another BFS
   copy while Phase 13's consolidation is still pending. Revisit only if the measured RAM gate
   busts the 8GB budget.
6. **Single best target, all loops.** Highest `maxMoney` among rooted servers hackable at the
   current level. Deployer re-picks each poll; the control-file mechanism makes switches cheap.
   Rejected: self-farm (each host attacks itself) — splits grow/weaken effort across weak
   targets and n00dles-class servers cap out fast.
7. **Handoff: auto-exec on a dynamic fit check.** When
   `getScriptRam("daemon.js") + getScriptRam("killscripts.js") ≤ home free RAM`, exec
   `daemon.js` and exit; the daemon's killscripts sweep then clears every bootstrap remnant
   (protects only the daemon's pid). Self-adjusting as daemon RAM moves between phases (it was
   18.7 before Phase 9). At 32GB home with bootstrap resident (~5.9), free ≈ 26GB ≥ 19.3
   needed — the check passes at the 32GB tier with margin, no
   self-sacrifice tricks needed. Idempotent: started when the daemon already fits, it hands off
   on the first poll.
8. **Purchase nudges, minimal.** Purchases stay manual (no Singularity), but the deployer can
   tprint a one-time nudge when cash first crosses TOR/next-opener cost, reusing
   `resourcemanager.js`'s static price table (pure constants — verify it's importable at spec,
   else duplicate the values with a provenance comment; static-value carve-out applies). Home
   RAM cost can't be nudged — reading it is Singularity-gated; the in-game UI shows it.
9. **No spends, no translog call sites** — the convention is satisfied vacuously; the spec
   should state this rather than silently omit logging.
10. **Small exported log, per the log-export rule.** `bootstrap-log.json` (ring-buffered like
    the daemon's): deploy events, target switches, rooting pickups, the handoff. Plus a
    `vite.config.ts` download-filter entry. Terminal copy/paste stays out of the loop.
11. **One-way ladder.** `daemon.js` does not launch or know about bootstrap. Bootstrap is
    started manually once per cold start (`run bootstrap.js`); the failure mode "daemon dies
    later" is handled by re-running the daemon, not by bootstrap supervision.

## Rejected alternatives

- **Shrink `daemon.js` under 8GB** — see Decision 1.
- **Manual playbook only** — no code, but repeats every reset; the ladder is reusable.
- **Lite-daemon variant sharing `scheduler.js` math** — batching precision is wasted when the
  binding constraint is a ~100GB remote pool; the analyze-family calls (~1GB each) blow the
  budget for no early-game gain. Dumb loops saturate small RAM fine.
- **Target-as-exec-arg + kill/redeploy** — see Decision 3.
- **Notify-only handoff** — auto-exec chosen; the notify path survives as the failure branch
  (if the daemon exec returns pid 0, tprint loudly and keep polling).
- **Running `resourcemanager.js` (3.35GB) alongside bootstrap** — 5.85 + 3.35 > 8. The nudge
  feature (Decision 8) covers the useful part of it at zero RAM.

## Open questions

- **Target eligibility rule:** plain `requiredHackingLevel ≤ level`, or `targets.js`'s
  `level/2` heuristic with a fallback when nothing passes? Early on, hack chance at
  req≈level is poor, but grow/weaken still work. Spec should pick one and say why.
- **Bootloop thresholds** (security-above-min epsilon, money-below-max fraction): spec picks
  constants; they live in the control file so they're tunable without redeploying code.
- **Home leftover thread:** ~2.15GB free on home after the deployer vs. a 2.2GB bootloop —
  just misses on predicted numbers. Only viable if the measured RAM gate comes in under
  prediction or a call gets trimmed; decide after measurement, don't design for it.
- **Naming:** `bootstrap.js` risks confusion with `resourcemanager.js`'s `bootstrap-server`
  reservation label. Alternative: `starter.js`/`startloop.js`. Kenneth's call at spec review.
- **Did the hard reset leave any darkweb programs?** Phase 10 Round B showed an aug-install
  reset preserves them; a hard reset presumably doesn't. `ls home` in-game settles it; affects
  the initial rootable set, not the design.

## Out of scope

- Any change to `daemon.js`, `hosts.js`, `targets.js`, workers, or the Phase 13 consolidation
  (bootstrap imports `hosts.js` as-is; re-point it at `common.js` when Phase 13 lands).
- Auto-purchasing anything (Singularity-gated on this save). The BACKLOG Source-File watcher
  and re-validate-ladder items stay where they are.
- Cloud servers pre-daemon (`cloudmanager.js` starts with the daemon, as today).
- Post-handoff supervision, alerting, or dashboards.

## Validation sketch (detail is the spec stage's job)

- Unit tests for the pure decision logic (house style — exported, mock-free): target pick,
  per-host thread-count math, handoff predicate, control-file (de)serialization.
- RAM gate via `ramcheck.js` → `logs/ramcheck-result.json` (not `mem`/terminal): predictions
  are bootstrap.js ≈ 5.85GB (hard ceiling 8.0 minus margin), bootloop.js ≈ 2.2GB. A bust on
  either number reopens Decisions 5 and the home-thread open question.
- Live, on the actual reset save: `run bootstrap.js` roots the 0-port set, deploys loops,
  money and hacking level climb, target switches happen as level rises (all visible in
  `bootstrap-log.json`). The handoff itself validates live the day home hits 32GB — record it
  as a live-validation milestone rather than claiming coverage before then, same convention as
  the fleetupgrade waiver.
