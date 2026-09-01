import { defineConfig } from 'viteburner';
import { resolve } from 'path';
import type { Plugin } from 'vite';

const AUTO_EXPORT_INTERVAL_MS = 10 * 1000;

// Fires the same "d" keypress that manually triggers a download, so
// daemon-batch-log.json -- the only file download.location below lets
// through -- gets pulled to logs/ on a timer instead of needing someone at
// the dev terminal to press it. There's no push channel from the game back
// to viteburner (downloads are always Node-initiated request/response), so
// polling is the only way to approximate "pulled right after every batch" --
// 10s keeps it feeling near-live against a batch cadence of tens of seconds
// to minutes, without toggling the file watcher on/off every single tick.
function autoExportDaemonLog(): Plugin {
  return {
    name: 'auto-export-daemon-batch-log',
    configureServer() {
      setInterval(() => {
        process.stdin.emit('keypress', 'd', { name: 'd', ctrl: false, meta: false, shift: false, sequence: 'd' });
      }, AUTO_EXPORT_INTERVAL_MS);
    },
  };
}

export default defineConfig({
  plugins: [autoExportDaemonLog()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '/src': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
  },
  viteburner: {
    watch: [{ pattern: 'src/**/*.{js,ts,jsx,tsx}', transform: true }, { pattern: 'src/**/*.{script,txt}' }],
    sourcemap: 'inline',
    usePolling: true,
    dumpFiles: 'dist',
    download: {
      server: ['home'],
      // Pressing "d" in the dev terminal normally pulls every file on the
      // server back to disk -- scope it to just the exported logs so it
      // doesn't re-download every script into src/ each time. Prefer this
      // over copy-pasted terminal output whenever a script's result needs to
      // be read back. Three patterns: daemon-batch-log.json is the daemon's
      // own ring-buffered history (one file, overwritten in place);
      // targets-summary-<epoch ms>.json / sharecurve-<epoch ms>.json are one
      // file PER RUN of targets.js / sharecurve.js (one-shot scripts, no ring
      // buffer), so repeated runs (e.g. a before/after comparison) each land
      // as their own file in logs/ instead of overwriting each other;
      // transactions-YYYY-MM-DD.json (src/translog.js) is daily-rotating --
      // one file per calendar day, written live as income/expenses happen,
      // rotating at the day boundary. finance-log.json (src/resourcemanager.js,
      // renamed from financemanager.js in Phase 11; file name kept as-is) is
      // a ring-buffered history like daemon-batch-log.json. bootstrap-log.json
      // (src/bootstrap.js, Phase 14) is another ring-buffered history in the
      // same family, event-driven like finance-log.json rather than a
      // fixed-cadence write.
      //
      // Phase 24: dashboard.js is now the only standing tail, and its
      // acceptance criterion ("each panel is validated against its exported
      // file") needs every renderer source on disk -- daemon-status.json,
      // targets-ranking.json, cloud-state.json, and xpfarm-state.json are new;
      // finance-state.json is a precedent reversal (previously unexported as
      // "already visible live in the tail" -- that tail is gone). tail-layout.json
      // is retired along with tailmanager.js (Phase 18's geometry-persistence
      // system has nothing left to manage with one hardcoded, self-asserting
      // window).
      location: (file) => {
        if (file === 'daemon-batch-log.json') return 'logs/daemon-batch-log.json';
        if (file === 'hacking-progress-log.json') return 'logs/hacking-progress-log.json'; // sparse level/XP series for the Daedalus-2500 ETA
        if (file === 'xpfarm-log.json') return 'logs/xpfarm-log.json'; // Phase 20 -- security-equilibrium + launch evidence for the XP engine

        if (/^targets-summary-\d+\.json$/.test(file)) return `logs/${file}`;
        if (/^sharecurve-\d+\.json$/.test(file)) return `logs/${file}`;
        if (/^auginfo-\d+\.json$/.test(file)) return `logs/${file}`; // owned-aug + mults dump (src/auginfo.js), one file per run for pre/post-install diffs
        if (/^sf4check-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 21 -- SF/Singularity liveness check, one file per run
        if (/^gangprobe-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 27 -- BN2 static gang task/equipment tables, one file per run
        if (/^gangreach-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 27 -- BN2 gang API pre-gang reachability probe, one file per run
        if (/^gangaugs-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 27 -- gang-faction aug catalog sweep (pre-gang, read-only), one file per run
        if (/^gangcreate-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 27 -- gang creation record (faction + permanent isHacking), one file per run
        if (/^ascendrecon-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 29 -- ascension preview + the rep-tracks-rate probe, one file per run
        if (/^bn2probe-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 29 -- player mults / faction rep / owned-aug recon, one file per run
        if (/^gangtaskcompare-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 29 -- hacking-vs-combat gang task yield comparison, one file per run
        if (/^worldprobe-\d+\.json$/.test(file)) return `logs/${file}`;
        if (/^stockprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/stockprobe.js -- stock access flags + StockMarketConstants, one file per run (stock-engine prep) // src/worldprobe.js -- w0r1d_d43m0n gate probe, one file per run; Phase 33's WD-gate checkpoint (was never wired in before -- see that script's header)
        if (/^stockrecon-\d+\.json$/.test(file)) return `logs/${file}`; // src/stockrecon.js -- post-TIX read-only harvest (symbols, org/forecast/nextUpdate gates, per-symbol prices + round-trip friction), one file per run
        if (/^stockpostest-(buy|check)-\d+\.json$/.test(file)) return `logs/${file}`; // src/stockpostest.js -- OQ2 install-boundary experiment (position + money before/after an install), one file per run
        if (/^worktypeprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/worktypeprobe.js -- which joined factions offer faction work, one file per run (root-caused augfarmer's NiteSec workForFaction throw: gang factions offer none)
        if (file === 'gang-state.json') return 'logs/gang-state.json'; // Phase 27 Tier 1 -- gangmanager.js overwrite-in-place snapshot + restart-persistence source
        if (file === 'gang-log.json') return 'logs/gang-log.json'; // Phase 27 Tier 1 -- gangmanager.js ring-capped event log (recruit/promote/demote/sink/startup/off-marker)
        if (file === 'bladeburner-state.json') return 'logs/bladeburner-state.json'; // Phase 38 Slice B -- bladeburnermanager.js overwrite-in-place snapshot
        if (file === 'sleeve-state.json') return 'logs/sleeve-state.json'; // src/sleevemanager.js -- overwrite-in-place sleeve snapshot (task/sync/shock/stats/augReady), the watcher that catches an idled sleeve
        if (file === 'bladeburner-log.json') return 'logs/bladeburner-log.json'; // Phase 39 -- bladeburnermanager.js ring-capped event log (startup/off-marker/yield-grant/yield-reclaim/quarantine/crossover/checkpoint/warn/skill-buy)
        if (file === 'bladeburner-attempts.json') return 'logs/bladeburner-attempts.json'; // Phase 39 (S7) -- bladeburnermanager.js per-attempt diagnostic ledger (startAction call + verification outcome, predicted vs realised EV)
        if (/^switchbbcity-\d+\.json$/.test(file)) return `logs/${file}`; // src/switchbbcity.js -- one-off Bladeburner city move + the Q5 switchCity cost measurement, one file per run
        if (file === 'gang-rate-log.json') return 'logs/gang-rate-log.json'; // Phase 30 survivor -- gangratelog.js durable respect-rate/ascension-mult series (ring-capped, 5min samples)
        if (file === 'hacknet-state.json') return 'logs/hacknet-state.json'; // dashboard.js's HACKNET panel source -- BN9's entire economy, written by goallog.js
        if (file === 'goal-state.json') return 'logs/goal-state.json'; // Phase 32 -- goallog.js overwrite-in-place snapshot, dashboard.js's GOAL panel source
        if (file === 'goal-log.json') return 'logs/goal-log.json'; // Phase 32 -- goallog.js ring-capped cumulative series (gangCum/hackingCum/mHacking, 60s samples)
        if (file === 'gatewatch-log.json') return 'logs/gatewatch-log.json'; // GP1 watcher (gatewatch.js) -- ring-capped rep/M/gate series across the Red-Pill install boundary
        if (file === 'gatewatch-result.json') return 'logs/gatewatch-result.json'; // GP1 watcher -- the durable one-shot capture (true WD gate + rep-survives verdict) written when Red Pill installs
        if (file === 'boundary-start.json') return 'logs/boundary-start.json'; // Phase 35 WI1 -- bootstrap.js's per-boundary marker (overwritten every boundary)
        if (file === 'boundary-log.json') return 'logs/boundary-log.json'; // Phase 35 WI1 -- daemon.js's non-evicting per-boundary telemetry slice (mirrors the batch log across the post-install dead window)

        if (file === 'backdoor-status.json') return 'logs/backdoor-status.json'; // Phase 22 -- faction-backdoor status snapshot, overwritten in place, written on classification change only
        if (file === 'augfarmer-state.json') return 'logs/augfarmer-state.json'; // Phase 23 -- overwrite-in-place, written on change + a low-frequency heartbeat
        if (file === 'augfarmer-catalog.json') return 'logs/augfarmer-catalog.json'; // Phase 23 -- static per-node catalog, rewritten on rebuild (startup + faction-membership change)
        if (file === 'ramcheck-result.json') return 'logs/ramcheck-result.json';
        if (/^bn9econprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/bn9econprobe.js -- BN9 recon: money sources, hacknet-server gain/cost curves (Formulas.exe), network RAM census, one file per run
        if (/^graftprereqprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/graftprereqprobe.js -- real getAugmentationPrereq chain for the graft catalog, the field graftrecon.js never read
        if (/^hacknetboost-\d+\.json$/.test(file)) return `logs/${file}`; // src/hacknetboost.js -- one-off cheap Hacknet headroom buy (cores + RAM), one file per run
        if (/^hacknetprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/hacknetprobe.js -- BN9 recon: hacknet-server economics, hash-upgrade catalog + costs, and the node's damage report, one file per run
        if (/^hashexchangeprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/hashexchangeprobe.js -- Q1: measured rank/SP granted per Exchange for Bladeburner purchase, one file per run
        if (/^homeramprobe-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 35 WI8 -- one-off D4/D10 verification probe, one file per run
        if (/^combatgateprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/combatgateprobe.js -- one-off: exp needed for combat level 100 (BN6 bladeburner join gate)
        if (file === 'combatgrind-log.json') return 'logs/combatgrind-log.json'; // src/combatgrind.js -- ring-capped combat-grind progress samples (BN6 bladeburner join gate)
        if (file === 'bladeburnertrial-log.json') return 'logs/bladeburnertrial-log.json'; // src/bladeburnertrial.js -- ring-capped live Bladeburner scouting/skill-investment trial
        if (/^combatrouteprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/combatrouteprobe.js -- one-off: crime-vs-gym route comparison for the combat 1->100 gate
        if (/^bladeburnerprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/bladeburnerprobe.js -- BN6 bladeburner API reachability + live getBitNodeMultipliers() read, one file per run
        if (/^bladeburneractionprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/bladeburneractionprobe.js -- per-action yield sweep (time/success/rank gain-loss/rep/count), one file per run
        if (/^bladeburnerskillprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/bladeburnerskillprobe.js -- per-skill cost/level sweep, one file per run
        if (/^slotconflictprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/slotconflictprobe.js -- Phase 38 blocker: does a bladeburner action occupy augfarmer's player-work slot, one file per run
        if (/^q10probe-\d+\.json$/.test(file)) return `logs/${file}`; // src/q10probe.js -- Q10: is stamina spent per action or per second (gates Overclock), one file per run
        if (/^fieldanalysisprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/fieldanalysisprobe.js -- full action inventory + does Field Analysis reopen a collapsed estimate range, one file per run
        if (/^leverprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/leverprobe.js -- action-level cap + stamina-regen scaling (gates Cyber's Edge) + chaos, one file per run
        if (/^bbskillbuy-\d+\.json$/.test(file)) return `logs/${file}`; // src/bbskillbuy.js -- banked-SP spend ahead of the black-op ladder (BI/DO/Overclock/Reaper), one file per run
        if (/^bbblackop-\d+\.json$/.test(file)) return `logs/${file}`; // src/bbblackop.js -- black-op ladder runner (per-op result, retry evidence, slot discipline), one file per run
        if (/^bitnodemults-\d+\.json$/.test(file)) return `logs/${file}`; // src/bitnodemults.js -- exact BitNode multipliers for any node/level (SF5), + derived redo-tax table, one file per run
        if (/^graftone-\d+\.json$/.test(file)) return `logs/${file}`; // src/graftone.js -- single controlled graft with L2 before/after capture (entropy delta, realised vs projected price and duration), one file per run
        if (/^graftvsbuy-\d+\.json$/.test(file)) return `logs/${file}`; // src/graftvsbuy.js -- purchase price vs graft price vs rep req per graftable aug (the graft-vs-install premium), one file per run
        if (/^sleevememprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/sleevememprobe.js -- Z1: prices the BN10-exclusive permanent sleeve memory upgrade, one file per run
        if (/^sleevebbprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/sleevebbprobe.js -- THE sleeve-parallelism A/B the BN10-next ordering rests on (per-actor vs per-city contract pool), one file per run
        if (/^sleevepoolprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/sleevepoolprobe.js -- DIRECT pool observation (does a sleeve completion decrement countRemaining), replaces the noisy rate A/B, one file per run
        if (/^graftrecon-\d+\.json$/.test(file)) return `logs/${file}`; // src/graftrecon.js -- is grafting live in BN10, which grafts move the combat mult, with the entropy tax carried, one file per run
        if (/^graftladder-\d+\.json$/.test(file)) return `logs/${file}`; // src/graftladder.js -- unattended BN10 combat graft ladder: resolved plan, per-step realised price/duration/entropy/level deltas, one file per run
        if (/^portlock-\d+\.json$/.test(file)) return `logs/${file}`; // src/portlock.js -- network value locked behind unbought port openers, split by whether hacking level also blocks it, one file per run
        if (/^ladderstatus-\d+\.json$/.test(file)) return `logs/${file}`; // src/ladderstatus.js -- LIVE re-derivation of the black-op win condition (next op, per-op rank requirement, done count), one file per run
        if (/^sleeverecon-\d+\.json$/.test(file)) return `logs/${file}`; // src/sleeverecon.js -- BN10 sleeve census (sync/shock/memory/prices/tasks), one file per run
        if (/^sleeveaugbuy-\d+\.json$/.test(file)) return `logs/${file}`; // src/sleeveaugbuy.js -- sleeve aug purchase record (offered/prices/repReqs, and the stat reset the install causes), one file per run
        if (/^tracksweep-\d+\.json$/.test(file)) return `logs/${file}`; // src/tracksweep.js -- Tracking success + rank/action vs action LEVEL, the curve the governor band needs, one file per run
        if (/^sleevesyncprobe-\d+\.json$/.test(file)) return `logs/${file}`; // src/sleevesyncprobe.js -- A/B measurement of how much sleeve exp actually reaches the player, one file per run
        if (file === 'graft-plan.json') return 'logs/graft-plan.json'; // Phase 41 WI2 -- src/graftplanner.js's computed graft ladder, overwritten in place each run; carries schemaVersion + every input it was computed from (staleness detection, spec B4)
        if (file === 'bn10entry-log.json') return 'logs/bn10entry-log.json'; // Phase 41 WI3 -- src/bn10entry.js's ring-capped per-poll decision log (exp/levels/money/entropy/action/decision+reason, spec C4)
        if (/^hacknetramonce-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 43 WI-A -- src/hacknetramonce.js's one-shot RAM-upgrade record (before/after hash production, cost, verification mismatch finding), one file per run
        if (file === 'bn9entry-log.json') return 'logs/bn9entry-log.json'; // Phase 43 WI-D -- src/bn9entry.js's ring-capped per-poll decision log (exp/levels/money/entropy/action/decision+reason/rate-source, spec WD4)
        if (file === 'bn9companions-state.json') return 'logs/bn9companions-state.json'; // Phase 43 WI-E -- src/bn9companions.js's overwrite-in-place supervision snapshot (last check/launch per target, running/gated status)
        if (/^srfcheck-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 43 WI-E -- src/srfcheck.js's machine-checked S-RF re-verification (dominant rank-producing action's realised success rate), one file per run
        if (/^transactions-\d{4}-\d{2}-\d{2}\.json$/.test(file)) return `logs/${file}`;
        if (file === 'finance-log.json') return 'logs/finance-log.json';
        if (file === 'bootstrap-log.json') return 'logs/bootstrap-log.json';

        // Phase 24 renderer sources -- overwrite-in-place, dashboard.js's
        // panels are validated against these.
        if (file === 'daemon-status.json') return 'logs/daemon-status.json';
        if (file === 'targets-ranking.json') return 'logs/targets-ranking.json';
        if (file === 'cloud-state.json') return 'logs/cloud-state.json';
        if (file === 'xpfarm-state.json') return 'logs/xpfarm-state.json';
        if (file === 'finance-state.json') return 'logs/finance-state.json'; // precedent reversal -- see comment above
        if (file === 'ratchet-log.json') return 'logs/ratchet-log.json'; // Phase 25 Slice 0 -- {pre,post} install-cycle records for the aug-ratchet trigger dataset
        if (file === 'ratchet-last.json') return 'logs/ratchet-last.json'; // Phase 25 Slice 0 -- rolling latest snapshot (install-survival state; also handy live view)
        if (file === 'ratchet-decisions.json') return 'logs/ratchet-decisions.json'; // Phase 25 -- trigger/action audit trail, ring-capped
        return null;
      },
    },
  },
});
