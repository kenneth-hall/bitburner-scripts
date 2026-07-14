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
      // a ring-buffered history like daemon-batch-log.json -- finance-state.json
      // is deliberately NOT exported here, since it's a heartbeat snapshot
      // already visible live in the tail; the log is the offline evidence.
      // bootstrap-log.json (src/bootstrap.js, Phase 14) is another
      // ring-buffered history in the same family, event-driven like
      // finance-log.json rather than a fixed-cadence write.
      location: (file) => {
        if (file === 'daemon-batch-log.json') return 'logs/daemon-batch-log.json';
        if (file === 'hacking-progress-log.json') return 'logs/hacking-progress-log.json'; // sparse level/XP series for the Daedalus-2500 ETA
        if (file === 'xpfarm-log.json') return 'logs/xpfarm-log.json'; // Phase 20 -- security-equilibrium + launch evidence for the XP engine

        if (/^targets-summary-\d+\.json$/.test(file)) return `logs/${file}`;
        if (/^sharecurve-\d+\.json$/.test(file)) return `logs/${file}`;
        if (/^auginfo-\d+\.json$/.test(file)) return `logs/${file}`; // owned-aug + mults dump (src/auginfo.js), one file per run for pre/post-install diffs
        if (/^sf4check-\d+\.json$/.test(file)) return `logs/${file}`; // Phase 21 -- SF/Singularity liveness check, one file per run

        if (file === 'tail-layout.json') return 'logs/tail-layout.json'; // Phase 18 -- persistence is the feature under test, so export it (unlike finance-state.json's heartbeat, which is already visible live)
        if (file === 'backdoor-status.json') return 'logs/backdoor-status.json'; // Phase 22 -- faction-backdoor status snapshot, overwritten in place, written on classification change only
        if (file === 'augfarmer-state.json') return 'logs/augfarmer-state.json'; // Phase 23 -- overwrite-in-place, written on change + a low-frequency heartbeat
        if (file === 'augfarmer-catalog.json') return 'logs/augfarmer-catalog.json'; // Phase 23 -- static per-node catalog, rewritten on rebuild (startup + faction-membership change)
        if (file === 'ramcheck-result.json') return 'logs/ramcheck-result.json';
        if (/^transactions-\d{4}-\d{2}-\d{2}\.json$/.test(file)) return `logs/${file}`;
        if (file === 'finance-log.json') return 'logs/finance-log.json';
        if (file === 'bootstrap-log.json') return 'logs/bootstrap-log.json';
        return null;
      },
    },
  },
});
