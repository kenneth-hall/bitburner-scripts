import { defineConfig, configDefaults } from 'vitest/config';

// This file exists for two reasons (see batcher-refactor-phase4.md):
// 1. Without it, vitest auto-loads vite.config.ts -- which boots the
//    viteburner plugin and its stdin-keypress export timer. A dedicated
//    vitest config keeps `npm test` fully game-independent.
// 2. test/verify-log.test.js (the log checker) needs a real exported game
//    log, so it's excluded from the default run and invoked via its own
//    `npm run verify:log` script instead.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'test/verify-log.test.js'],
  },
});
