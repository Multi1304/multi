import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60000,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
});
