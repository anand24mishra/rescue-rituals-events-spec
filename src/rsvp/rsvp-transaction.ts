import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ServiceBusyException } from '../common/errors/domain.exception';
import type {
  PrismaService,
  PrismaTransaction,
} from '../prisma/prisma.service';
import { PrismaErrorCode } from '../prisma/prisma.service';

/**
 * Transaction settings for the RSVP path.
 *
 * Every RSVP for one event serialises behind that event's row lock, so during a
 * burst most requests spend their time waiting rather than working. Prisma's
 * defaults (2s to acquire a connection, 5s to finish) are tuned for
 * uncontended writes and would abort a large fraction of a realistic spike —
 * which would look like a capacity bug and is really a timeout.
 *
 * These values are generous enough that a queue of a few hundred waiters
 * drains, and short enough that a genuinely stuck transaction does not pin a
 * connection indefinitely.
 */
const TRANSACTION_OPTIONS = {
  /** How long to wait for a free connection from the pool. */
  maxWait: 15_000,
  /** How long the transaction itself may run once started. */
  timeout: 20_000,
} as const;

/** Total attempts, including the first. */
const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 25;

/** PostgreSQL SQLSTATEs that mean "this transaction lost a race; retry it". */
const RETRYABLE_SQL_STATES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

function isRetryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (
      error.code === PrismaErrorCode.TransactionTimeout ||
      error.code === PrismaErrorCode.ConnectionPoolTimeout
    ) {
      return true;
    }
    const sqlState = (error.meta as { code?: string } | undefined)?.code;
    return sqlState !== undefined && RETRYABLE_SQL_STATES.has(sqlState);
  }

  // A transaction that was rolled back by the engine surfaces as an unknown
  // request error; retrying once is cheaper than failing the user's request.
  return error instanceof Prisma.PrismaClientUnknownRequestError;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `work` inside a transaction sized for contended RSVP traffic, retrying
 * the whole transaction on contention and surfacing exhaustion as a retryable
 * 503 rather than a 500.
 *
 * `work` must be side-effect-free outside the transaction, because it can run
 * more than once.
 */
export async function runRsvpTransaction<T>(
  prisma: PrismaService,
  logger: Logger,
  work: (tx: PrismaTransaction) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, TRANSACTION_OPTIONS);
    } catch (error) {
      if (!isRetryable(error)) throw error;

      lastError = error;
      logger.warn(
        { attempt, maxAttempts: MAX_ATTEMPTS },
        'RSVP transaction hit contention; retrying',
      );

      if (attempt < MAX_ATTEMPTS) {
        // Exponential backoff with jitter, so a burst of retries does not
        // re-collide in lockstep.
        const backoff = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
        await sleep(backoff + Math.random() * backoff);
      }
    }
  }

  logger.error({ err: lastError }, 'RSVP transaction exhausted retries');
  throw new ServiceBusyException();
}
