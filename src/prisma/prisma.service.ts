import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Transaction client type. Service methods that must run inside a caller's
 * transaction accept this rather than the full `PrismaService`, which makes it
 * impossible to accidentally escape the transaction by using the wrong client.
 */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Declared as a const so the same value can type the client and be passed to
 * it — that is what makes `$on('warn', …)` type-check, since Prisma derives the
 * available event names from this configuration.
 */
type PrismaLogConfig = [
  { emit: 'event'; level: 'warn' },
  { emit: 'event'; level: 'error' },
];

const PRISMA_LOG_CONFIG: PrismaLogConfig = [
  { emit: 'event', level: 'warn' },
  { emit: 'event', level: 'error' },
];

@Injectable()
export class PrismaService
  extends PrismaClient<{ log: PrismaLogConfig }>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: PRISMA_LOG_CONFIG });
  }

  async onModuleInit(): Promise<void> {
    // Connect eagerly so a bad DATABASE_URL fails at boot — and therefore
    // fails the platform's health check — rather than on the first request.
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');

    // Database warnings and errors are logged, but the query log is not
    // enabled: query text can contain user data, and this is the layer where
    // it would leak into log aggregation.
    this.$on('warn', (event) => this.logger.warn(event.message));
    this.$on('error', (event) => this.logger.error(event.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Deletes every row, in foreign-key-safe order. Test-support only: it throws
   * outside NODE_ENV=test so it can never be reached from a running API.
   */
  async truncateAllTables(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        'truncateAllTables() is only available when NODE_ENV=test',
      );
    }

    await this.$executeRaw`
      TRUNCATE TABLE "idempotency_records", "rsvps", "events", "users"
      RESTART IDENTITY CASCADE
    `;
  }
}

/** Prisma error codes this application handles explicitly. */
export const PrismaErrorCode = {
  /** Unique constraint violation. */
  UniqueConstraintViolation: 'P2002',
  /** Foreign key constraint violation. */
  ForeignKeyConstraintViolation: 'P2003',
  /** A required record was not found (e.g. update/delete on a missing row). */
  RecordNotFound: 'P2025',
  /** Transaction could not be started within `maxWait`. */
  TransactionTimeout: 'P2028',
  /** Connection pool timeout — every connection was busy. */
  ConnectionPoolTimeout: 'P2024',
} as const;

export function isPrismaKnownError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
