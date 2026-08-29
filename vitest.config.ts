import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    // The sim is pure and has no DOM; keep the fast node environment.
    environment: 'node',
    globals: false,
  },
});
