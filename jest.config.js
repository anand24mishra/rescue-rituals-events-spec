/**
 * Unit tests: fast, no database, no network.
 *
 * Anything that needs a real PostgreSQL transaction lives in `test/` and runs
 * under jest.e2e.config.js instead — mocks cannot prove row locking or
 * constraint behaviour, so those paths are deliberately not unit tested.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coveragePathIgnorePatterns: ['\\.module\\.ts$', 'main\\.ts$', '\\.dto\\.ts$'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  clearMocks: true,
};
