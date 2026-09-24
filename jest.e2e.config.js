/**
 * Integration / e2e tests against a real PostgreSQL database.
 *
 * These run with `--runInBand` (see package.json) because the suites share one
 * database and truncate it between files; running them in parallel workers
 * would have one suite delete another's fixtures mid-test.
 *
 * The concurrency suite intentionally takes longer than the Jest default, so
 * the timeout is raised here rather than per-test.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testEnvironment: 'node',
  testTimeout: 60000,
  setupFilesAfterEnv: ['<rootDir>/test/setup-e2e.ts'],
  clearMocks: true,
};
