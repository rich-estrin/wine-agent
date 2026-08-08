import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node by default — most of what's tested is pure data logic. Files that
    // need a DOM opt in with a `@vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    // e2e/ is Playwright's; it must not be picked up by the unit runner.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },
});
