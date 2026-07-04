import { defineConfig, configDefaults } from 'vitest/config';

// This file exists for three reasons (see batcher-refactor-phase4.md):
// 1. Without it, vitest auto-loads vite.config.ts -- which boots the
//    viteburner plugin and its stdin-keypress export timer. A dedicated
//    vitest config keeps `npm test` fully game-independent.
// 2. The test/verify-*.test.js log checkers (daemon log, transactions log)
//    each need a real exported game log, so they're excluded from the
//    default run and invoked via their own `npm run verify:log` script
//    instead.
// 3. Claude Code worktree sessions land under .claude/worktrees/ -- nested
//    inside this repo's own tree -- and configDefaults.exclude doesn't cover
//    that path, so a leftover worktree gets walked too, duplicating every
//    suite (confirmed 2026-07-04: a merged-but-not-yet-removed worktree
//    doubled up every test file, and its nested verify-*.test.js copy
//    evaded the glob above since its path doesn't start with `test/`).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'test/verify-*.test.js', '.claude/worktrees/**'],
  },
});
