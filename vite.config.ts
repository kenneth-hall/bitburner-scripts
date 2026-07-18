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

        if (file === 'backdoor-status.json') return 'logs/backdoor-status.json'; // Phase 22 -- faction-backdoor status snapshot, overwritten in place, written on classification change only
        if (file === 'augfarmer-state.json') return 'logs/augfarmer-state.json'; // Phase 23 -- overwrite-in-place, written on change + a low-frequency heartbeat
        if (file === 'augfarmer-catalog.json') return 'logs/augfarmer-catalog.json'; // Phase 23 -- static per-node catalog, rewritten on rebuild (startup + faction-membership change)
        if (file === 'ramcheck-result.json') return 'logs/ramcheck-result.json';
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
