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
      // targets-summary-<epoch ms>.json is one file PER RUN of targets.js (a
      // one-shot script, no ring buffer), so repeated runs (e.g. a
      // before/after comparison) each land as their own file in logs/
      // instead of overwriting each other; transactions-YYYY-MM-DD.json
      // (src/translog.js) is daily-rotating -- one file per calendar day,
      // written live as income/expenses happen, rotating at the day
      // boundary; events-log.json (src/eventlog.js) is continuous across
      // the WHOLE playthrough -- never rotated or reset, one record per
      // milestone event (faction joins, backdoor installs), each carrying a
      // resetId field identifying which reset it happened in.
      location: (file) => {
        if (file === 'daemon-batch-log.json') return 'logs/daemon-batch-log.json';
        if (/^targets-summary-\d+\.json$/.test(file)) return `logs/${file}`;
        if (/^transactions-\d{4}-\d{2}-\d{2}\.json$/.test(file)) return `logs/${file}`;
        if (file === 'events-log.json') return 'logs/events-log.json';
        return null;
      },
    },
  },
});
