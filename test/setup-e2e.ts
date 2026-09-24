/**
 * Guards the e2e suite against being pointed at a real database.
 *
 * These tests truncate every table. That is fine against a disposable test
 * database and catastrophic against anything else, so the suite refuses to run
 * unless NODE_ENV is `test` and the connection string names a database whose
 * name says it is for tests.
 */
const databaseUrl = process.env.DATABASE_URL ?? '';

if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    'e2e tests require NODE_ENV=test. Run them via `npm run test:e2e`, which ' +
      'loads .env.test.',
  );
}

if (!/test/i.test(databaseUrl)) {
  throw new Error(
    'Refusing to run: DATABASE_URL does not look like a test database. These ' +
      'tests TRUNCATE every table. Point DATABASE_URL at a disposable database ' +
      'whose name contains "test".',
  );
}

jest.setTimeout(60_000);
