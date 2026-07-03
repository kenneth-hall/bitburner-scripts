import { defineConfig } from 'viteburner';
import { resolve } from 'path';
import type { Plugin } from 'vite';

const AUTO_EXPORT_INTERVAL_MS = 5 * 60 * 1000;

// Fires the same "d" keypress that manually triggers a download, so
// daemon-batch-log.json -- the only file download.location below lets
// through -- gets pulled to logs/ on a timer instead of needing someone at
// the dev terminal to press it.
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
      // server back to disk -- scope it to just the daemon's own exported
      // log so it doesn't re-download every script into src/ each time.
      location: (file) => (file === 'daemon-batch-log.json' ? 'logs/daemon-batch-log.json' : null),
    },
  },
});
