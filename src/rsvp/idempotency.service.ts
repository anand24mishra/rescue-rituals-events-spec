import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IdempotencyKeyReusedException } from '../common/errors/domain.exception';
import { PrismaService, PrismaTransaction } from '../prisma/prisma.service';

export interface IdempotencyContext {
  /** Client-supplied opaque key. */
  key: string;
  /** Authenticated caller. Scoping to the user means one client's key can
   *  never return another client's stored response. */
  userId: string;
  /** Logical operation, e.g. `POST:/events/:id/rsvp`. */
  scope: string;
  /** The request's meaningful inputs, hashed for the reuse check. */
  fingerprint: string;
}

export interface StoredOutcome {
  statusCode: number;
  body: unknown;
}

/**
 * Replay protection for mutating requests.
 *
 * The problem this solves: a client POSTs an RSVP, the response is lost to a
 * dropped connection, and the client retries. Without a key the retry is
 * indistinguishable from a deliberate second request, and the user sees a
 * confusing 409 for an operation that actually succeeded.
 *
 * The key property of this implementation is that the record is written *inside*
 * the same transaction as the mutation it describes. That makes "the side effect
 * happened" and "we remembered it happened" atomic — there is no window in which
 * an RSVP exists without its idempotency record, or vice versa. Two concurrent
 * requests with the same key therefore race on the unique index, and the loser
 * is rolled back entirely and served the winner's stored response.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  static fingerprint(parts: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  }

  /**
   * Returns the stored outcome for this key, or null if it is unused.
   *
   * Throws when the key was used for a *different* request: silently returning
   * the unrelated stored response would be worse than an error, because the
   * client would act on a result that does not describe what it just asked for.
   */
  async findStoredOutcome(
    context: IdempotencyContext,
  ): Promise<StoredOutcome | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        userId_scope_key: {
          userId: context.userId,
          scope: context.scope,
          key: context.key,
        },
      },
    });

    if (record === null) return null;

    if (record.requestHash !== context.fingerprint) {
      throw new IdempotencyKeyReusedException();
    }

    this.logger.log(
      { userId: context.userId, scope: context.scope },
      'Replayed stored response for repeated Idempotency-Key',
    );

    return { statusCode: record.statusCode, body: record.responseBody };
  }

  /**
   * Records the outcome. Must be called with the transaction that performed the
   * mutation, so the two commit together.
   */
  async record(
    tx: PrismaTransaction,
    context: IdempotencyContext,
    outcome: StoredOutcome,
  ): Promise<void> {
    await tx.idempotencyRecord.create({
      data: {
        key: context.key,
        userId: context.userId,
        scope: context.scope,
        requestHash: context.fingerprint,
        statusCode: outcome.statusCode,
        responseBody: outcome.body as object,
      },
    });
  }
}
