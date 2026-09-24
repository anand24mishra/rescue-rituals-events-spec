/**
 * Environment loading and validation.
 *
 * The application validates its configuration once, at startup, and refuses to
 * boot on a bad value. The alternative — reading `process.env` lazily at the
 * call site — turns a deployment typo into a 500 on a user's request hours
 * later, which is strictly worse to operate.
 */

export type NodeEnv = 'development' | 'test' | 'production';

export interface ThrottleBucket {
  /** Window length in milliseconds. */
  ttlMs: number;
  /** Requests permitted per window, per tracked caller. */
  limit: number;
}

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  /** Explicit allow-list. Empty means "no browser origin is permitted". */
  corsOrigins: string[];
  logLevel: string;
  /**
   * Three independent rate-limit buckets. Auth and RSVP are separated from the
   * general limit because they need different numbers: auth is the endpoint an
   * attacker brute-forces, RSVP is the one a crowd hammers legitimately. Keeping
   * them in configuration rather than hardcoded in a decorator means they can be
   * tuned per environment — including relaxed in tests, so the suite does not
   * have to fight a production safeguard.
   */
  throttle: {
    default: ThrottleBucket;
    auth: ThrottleBucket;
    rsvp: ThrottleBucket;
  };
  trustProxy: boolean;
}

/** Below this length a secret is guessable enough to be worth refusing. */
const MIN_JWT_SECRET_LENGTH = 32;

class EnvError extends Error {}

function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    throw new EnvError(`${key} is required but was not set`);
  }
  return value.trim();
}

function optional(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function integer(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new EnvError(`${key} must be a positive integer, received "${raw}"`);
  }
  return parsed;
}

function boolean(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const normalised = raw.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalised)) return true;
  if (['false', '0', 'no'].includes(normalised)) return false;
  throw new EnvError(`${key} must be a boolean, received "${raw}"`);
}

function parseNodeEnv(): NodeEnv {
  const value = optional('NODE_ENV', 'development');
  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }
  throw new EnvError(
    `NODE_ENV must be development, test or production, received "${value}"`,
  );
}

function parseCorsOrigins(nodeEnv: NodeEnv): string[] {
  const raw = optional('CORS_ORIGIN', '');
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // A wildcard origin plus credentialed requests is the classic way to make a
  // token-bearing API readable by any site the user visits. Allow it only
  // outside production, where it is a convenience for local tooling.
  if (nodeEnv === 'production' && origins.includes('*')) {
    throw new EnvError(
      'CORS_ORIGIN must not contain "*" when NODE_ENV=production; ' +
        'list the deployed frontend origins explicitly',
    );
  }

  return origins;
}

export function loadConfig(): AppConfig {
  const errors: string[] = [];
  const collect = <T>(read: () => T, fallback: T): T => {
    try {
      return read();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return fallback;
    }
  };

  const nodeEnv = collect(parseNodeEnv, 'development');
  const databaseUrl = collect(() => required('DATABASE_URL'), '');
  const jwtSecret = collect(() => required('JWT_SECRET'), '');

  if (jwtSecret.length > 0 && jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters ` +
        `(received ${jwtSecret.length})`,
    );
  }

  const config: AppConfig = {
    nodeEnv,
    port: collect(() => integer('PORT', 3000), 3000),
    databaseUrl,
    jwt: {
      secret: jwtSecret,
      expiresIn: optional('JWT_EXPIRES_IN', '1h'),
    },
    corsOrigins: collect(() => parseCorsOrigins(nodeEnv), []),
    logLevel: optional(
      'LOG_LEVEL',
      nodeEnv === 'production' ? 'info' : 'debug',
    ),
    throttle: {
      default: {
        ttlMs: collect(() => integer('THROTTLE_TTL', 60_000), 60_000),
        limit: collect(() => integer('THROTTLE_LIMIT', 120), 120),
      },
      auth: {
        ttlMs: collect(() => integer('AUTH_THROTTLE_TTL', 60_000), 60_000),
        limit: collect(() => integer('AUTH_THROTTLE_LIMIT', 10), 10),
      },
      rsvp: {
        ttlMs: collect(() => integer('RSVP_THROTTLE_TTL', 60_000), 60_000),
        limit: collect(() => integer('RSVP_THROTTLE_LIMIT', 30), 30),
      },
    },
    trustProxy: collect(() => boolean('TRUST_PROXY', false), false),
  };

  if (errors.length > 0) {
    // Reported together so a misconfigured deployment can be fixed in one
    // pass instead of one restart per bad variable.
    throw new Error(
      `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`,
    );
  }

  return config;
}

/** Nest ConfigModule factory. Namespaced so `config.get('app')` is typed. */
export default () => ({ app: loadConfig() });
