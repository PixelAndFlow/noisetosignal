import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    testTimeout: 15000,
    hookTimeout: 15000,
    // All test files share one local Postgres DB via truncate-based reset —
    // running files in parallel would let them stomp on each other's data.
    fileParallelism: false,
  },
});
