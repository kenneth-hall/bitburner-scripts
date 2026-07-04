import { defineConfig } from 'vitest/config';

// Separate from vitest.config.ts because that config's `exclude` blocks
// test/verify-*.test.js even when named explicitly on the CLI (confirmed:
// `vitest run test/verify-log.test.js` against the default config reports
// "No test files found") -- this config has no exclude, so it's the only
// way to actually run the log checkers. Still skips vite.config.ts (the
// viteburner plugin) for the same game-independence reason as the main
// config. Covers both the daemon log checker and the transactions log
// checker -- `npm run verify:log` runs both.
export default defineConfig({
  test: {
    include: ['test/verify-*.test.js'],
  },
});
