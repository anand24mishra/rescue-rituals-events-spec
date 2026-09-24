import { loadConfig } from './configuration';

/**
 * Configuration is validated once at startup, so these tests are the guarantee
 * that a bad deployment fails loudly at boot rather than quietly at 3am.
 */
describe('loadConfig', () => {
  const baseEnv = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user@localhost:5432/db',
    JWT_SECRET: 'a-secret-that-is-definitely-long-enough-32',
  };

  let saved: NodeJS.ProcessEnv;

  beforeEach(() => {
    saved = process.env;
    process.env = { ...baseEnv };
  });

  afterEach(() => {
    process.env = saved;
  });

  it('applies documented defaults', () => {
    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.jwt.expiresIn).toBe('1h');
    expect(config.throttle.default.limit).toBe(120);
    expect(config.throttle.auth.limit).toBe(10);
    expect(config.throttle.rsvp.limit).toBe(30);
    expect(config.trustProxy).toBe(false);
  });

  it('requires DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow(/DATABASE_URL is required/);
  });

  it('requires JWT_SECRET', () => {
    delete process.env.JWT_SECRET;
    expect(() => loadConfig()).toThrow(/JWT_SECRET is required/);
  });

  it('rejects a JWT secret short enough to be guessable', () => {
    process.env.JWT_SECRET = 'too-short';
    expect(() => loadConfig()).toThrow(/at least 32 characters/);
  });

  it('reports every problem at once rather than one per restart', () => {
    delete process.env.DATABASE_URL;
    process.env.JWT_SECRET = 'short';
    process.env.PORT = 'not-a-number';

    let message = '';
    try {
      loadConfig();
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('JWT_SECRET');
    expect(message).toContain('PORT');
  });

  it('refuses a wildcard CORS origin in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com,*';

    expect(() => loadConfig()).toThrow(/must not contain "\*"/);
  });

  it('permits a wildcard CORS origin outside production, for local tooling', () => {
    process.env.NODE_ENV = 'development';
    process.env.CORS_ORIGIN = '*';

    expect(loadConfig().corsOrigins).toEqual(['*']);
  });

  it('parses and trims a comma-separated origin list', () => {
    process.env.CORS_ORIGIN = ' https://a.example.com , https://b.example.com ';
    expect(loadConfig().corsOrigins).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('rejects a non-positive port', () => {
    process.env.PORT = '0';
    expect(() => loadConfig()).toThrow(/positive integer/);
  });

  it('rejects an unrecognised NODE_ENV instead of guessing', () => {
    process.env.NODE_ENV = 'staging';
    expect(() => loadConfig()).toThrow(
      /must be development, test or production/,
    );
  });

  it('accepts the documented boolean spellings', () => {
    for (const value of ['true', '1', 'yes']) {
      process.env.TRUST_PROXY = value;
      expect(loadConfig().trustProxy).toBe(true);
    }
    for (const value of ['false', '0', 'no']) {
      process.env.TRUST_PROXY = value;
      expect(loadConfig().trustProxy).toBe(false);
    }
  });

  it('rejects a non-boolean TRUST_PROXY', () => {
    process.env.TRUST_PROXY = 'maybe';
    expect(() => loadConfig()).toThrow(/must be a boolean/);
  });

  it('defaults the log level by environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com';
    expect(loadConfig().logLevel).toBe('info');

    process.env.NODE_ENV = 'development';
    expect(loadConfig().logLevel).toBe('debug');
  });
});
