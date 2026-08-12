import { defineConfig } from 'vitest/config';

/**
 * Integration and e2e suites run against a real PostgreSQL test database.
 * Override with TEST_DATABASE_URL (e.g. in CI) — see backend/README.md.
 */
const defaultTestDatabaseUrl = 'postgresql://todo:todo@localhost:5432/todo_test';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl,
      LOG_LEVEL: 'silent',
    },
    pool: 'forks',
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/server.ts'],
    },
  },
});
