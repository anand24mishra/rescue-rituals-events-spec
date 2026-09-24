import type { Event } from '@prisma/client';
import { EventNotFoundException } from '../common/errors/domain.exception';
import type { PrismaTransaction } from '../prisma/prisma.service';

/**
 * Acquires a PostgreSQL row-level lock on one event and returns the locked row.
 *
 * This is the serialization point for every decision that depends on
 * `confirmed_count` — RSVP creation, RSVP cancellation with waitlist
 * promotion, and lowering an event's capacity. Two transactions holding this
 * lock cannot interleave, so "read the count, then decide, then write" is safe
 * inside it and unsafe outside it.
 *
 * Implementation note: the lock is taken with raw SQL because Prisma has no
 * `FOR UPDATE` API, but the row is then re-read through the typed client. A
 * `$queryRaw` result carries the database's snake_case column names and no
 * Prisma type mapping, so using it directly as an `Event` would silently read
 * `undefined` from `confirmedCount`. The lock is held for the rest of the
 * transaction either way, so the second read costs one round trip and buys
 * type safety.
 *
 * Must only be called inside a transaction; a lock taken outside one is
 * released immediately and protects nothing.
 */
export async function lockEventRow(
  tx: PrismaTransaction,
  eventId: string,
): Promise<Event> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "events" WHERE "id" = ${eventId}::uuid FOR UPDATE
  `;

  if (locked.length === 0) throw new EventNotFoundException(eventId);

  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (event === null) throw new EventNotFoundException(eventId);

  return event;
}
