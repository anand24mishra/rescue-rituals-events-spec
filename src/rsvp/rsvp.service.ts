import { Injectable, Logger } from '@nestjs/common';
import { EventStatus, Prisma, RsvpStatus } from '@prisma/client';
import type { Event, Rsvp } from '@prisma/client';
import {
  buildPaginatedResponse,
  PaginatedDto,
} from '../common/dto/paginated-response.dto';
import {
  EventAtCapacityException,
  EventNotFoundException,
  EventNotOpenForRsvpException,
  RsvpAlreadyExistsException,
  RsvpNotFoundException,
} from '../common/errors/domain.exception';
import { lockEventRow } from '../events/event-lock';
import type { ViewerRsvpDto } from '../events/dto/event-response.dto';
import { toEventResponse } from '../events/dto/event-response.dto';
import { PrismaService, PrismaTransaction } from '../prisma/prisma.service';
import type {
  AttendeeResponseDto,
  ListAttendeesQueryDto,
} from './dto/attendee-response.dto';
import type { RsvpResponseDto } from './dto/rsvp-response.dto';
import type {
  ListMyRsvpsQueryDto,
  MyRsvpResponseDto,
} from './dto/my-rsvp-response.dto';
import { IdempotencyContext, IdempotencyService } from './idempotency.service';
import { runRsvpTransaction } from './rsvp-transaction';

/**
 * Waitlist queue order.
 *
 * `queuedAt` is the real ordering key; `id` is the tie-breaker that makes the
 * order total. Without the tie-breaker two people queued in the same
 * millisecond would have an order the database is free to change between
 * queries, and "who gets promoted" would stop being deterministic.
 *
 * The index rsvps(event_id, status, queued_at, id) exists to serve exactly this.
 */
const QUEUE_ORDER = [{ queuedAt: 'asc' as const }, { id: 'asc' as const }];

@Injectable()
export class RsvpService {
  private readonly logger = new Logger(RsvpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Creates or re-activates the caller's RSVP for an event.
   *
   * The whole decision happens inside one transaction that begins by locking
   * the event row. That lock is what makes the sequence
   *
   *   read confirmed_count -> compare with capacity -> insert -> increment
   *
   * safe: concurrent callers queue behind it instead of all reading the same
   * stale count and all deciding there is room. The
   * events_confirmed_count_within_capacity_check constraint and the
   * UNIQUE(event_id, user_id) index sit underneath as guarantees that survive a
   * bug in this method.
   */
  async createRsvp(
    eventId: string,
    userId: string,
    idempotency?: IdempotencyContext,
  ): Promise<RsvpResponseDto> {
    if (idempotency !== undefined) {
      const stored = await this.idempotency.findStoredOutcome(idempotency);
      if (stored !== null) return stored.body as RsvpResponseDto;
    }

    try {
      return await this.performRsvp(eventId, userId, idempotency);
    } catch (error) {
      if (idempotency === undefined) throw error;

      // The request lost a race against a concurrent attempt carrying the same
      // key. The failure can arrive two ways: as a unique-index violation on
      // idempotency_records, or — more often — as a plain RSVP_ALREADY_EXISTS
      // conflict, because by the time this attempt took the event lock the
      // winner's RSVP row was already committed.
      //
      // Both are handled by simply looking again. The stored outcome commits in
      // the same transaction as the RSVP it describes, so if this attempt could
      // observe the winner's effect at all, the record describing it is there
      // too. Returning it turns "your retry collided" into "here is what your
      // original request did", which is the entire point of the header.
      const stored = await this.idempotency.findStoredOutcome(idempotency);
      if (stored !== null) return stored.body as RsvpResponseDto;

      throw error;
    }
  }

  private async performRsvp(
    eventId: string,
    userId: string,
    idempotency?: IdempotencyContext,
  ): Promise<RsvpResponseDto> {
    return runRsvpTransaction(this.prisma, this.logger, async (tx) => {
      const event = await lockEventRow(tx, eventId);
      this.assertEventAcceptsRsvps(event);

      const existing = await tx.rsvp.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });

      if (existing !== null && existing.status !== RsvpStatus.CANCELLED) {
        throw new RsvpAlreadyExistsException(existing.status);
      }

      const hasRoom =
        event.capacity === null || event.confirmedCount < event.capacity;

      if (!hasRoom && !event.waitlistEnabled) {
        // `capacity` is non-null here: an unlimited event always has room.
        throw new EventAtCapacityException(event.capacity as number);
      }

      const status = hasRoom ? RsvpStatus.CONFIRMED : RsvpStatus.WAITLISTED;
      const now = new Date();

      // A previously cancelled RSVP is transitioned rather than re-inserted, so
      // UNIQUE(event_id, user_id) can stay absolute. Re-joining resets
      // `queuedAt`, which means a user who cancels does not keep their old place
      // in the queue.
      const rsvp =
        existing === null
          ? await tx.rsvp.create({
              data: {
                eventId,
                userId,
                status,
                queuedAt: status === RsvpStatus.WAITLISTED ? now : null,
              },
            })
          : await tx.rsvp.update({
              where: { id: existing.id },
              data: {
                status,
                queuedAt: status === RsvpStatus.WAITLISTED ? now : null,
              },
            });

      let confirmedCount = event.confirmedCount;
      if (status === RsvpStatus.CONFIRMED) {
        const updated = await tx.event.update({
          where: { id: eventId },
          data: { confirmedCount: { increment: 1 } },
          select: { confirmedCount: true },
        });
        confirmedCount = updated.confirmedCount;
      }

      const response = await this.toRsvpResponse(
        rsvp,
        event.capacity,
        confirmedCount,
        tx,
      );

      if (idempotency !== undefined) {
        // Written in this transaction so the stored outcome and the RSVP it
        // describes commit or roll back together.
        await this.idempotency.record(tx, idempotency, {
          statusCode: 201,
          body: response,
        });
      }

      this.logger.log(
        { eventId, userId, status, confirmedCount },
        'RSVP recorded',
      );

      return response;
    });
  }

  /**
   * Cancels the caller's RSVP and, when that freed a confirmed place, promotes
   * the first person in the queue — in the same transaction.
   *
   * Doing the promotion here rather than in a background job is deliberate: a
   * freed place that is only filled "eventually" is a place that can be
   * double-allocated in the meantime.
   */
  async cancelRsvp(eventId: string, userId: string): Promise<void> {
    await runRsvpTransaction(this.prisma, this.logger, async (tx) => {
      const event = await lockEventRow(tx, eventId);

      const existing = await tx.rsvp.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });

      if (existing === null || existing.status === RsvpStatus.CANCELLED) {
        throw new RsvpNotFoundException();
      }

      const wasConfirmed = existing.status === RsvpStatus.CONFIRMED;

      await tx.rsvp.update({
        where: { id: existing.id },
        data: { status: RsvpStatus.CANCELLED, queuedAt: null },
      });

      if (!wasConfirmed) {
        // Leaving the queue frees nothing, so there is nothing to promote and
        // the counter does not move.
        this.logger.log({ eventId, userId }, 'Waitlisted RSVP withdrawn');
        return;
      }

      await tx.event.update({
        where: { id: eventId },
        data: { confirmedCount: { decrement: 1 } },
      });

      const promoted = await this.promoteNextWaitlisted(tx, event);
      this.logger.log(
        { eventId, userId, promotedUserId: promoted?.userId ?? null },
        'Confirmed RSVP cancelled',
      );
    });
  }

  async listAttendees(
    eventId: string,
    query: ListAttendeesQueryDto,
  ): Promise<PaginatedDto<AttendeeResponseDto>> {
    const status = query.status ?? RsvpStatus.CONFIRMED;
    const where = { eventId, status };

    const [rsvps, total] = await this.prisma.$transaction([
      this.prisma.rsvp.findMany({
        where,
        select: {
          id: true,
          userId: true,
          status: true,
          queuedAt: true,
          updatedAt: true,
          user: { select: { name: true } },
        },
        orderBy:
          status === RsvpStatus.WAITLISTED
            ? QUEUE_ORDER
            : [{ updatedAt: 'asc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.rsvp.count({ where }),
    ]);

    // Positions are derived from the page offset rather than one count query
    // per row, which keeps this endpoint at two queries regardless of page size.
    const data = rsvps.map((rsvp, index) => ({
      userId: rsvp.userId,
      name: rsvp.user.name,
      status: rsvp.status,
      rsvpedAt: rsvp.updatedAt.toISOString(),
      waitlistPosition:
        status === RsvpStatus.WAITLISTED ? query.skip + index + 1 : null,
    }));

    return buildPaginatedResponse(data, total, query.page, query.limit);
  }

  /**
   * Every event the caller is currently attending or queued for.
   *
   * Exists as its own endpoint because the alternative — fetching the event
   * list and checking `viewerRsvp` on each — cannot answer "what am I going
   * to" without walking every event in the system.
   */
  async listMyRsvps(
    userId: string,
    query: ListMyRsvpsQueryDto,
  ): Promise<PaginatedDto<MyRsvpResponseDto>> {
    const now = new Date();
    const where = {
      userId,
      // Cancelled RSVPs are retained for the state machine, not shown back to
      // the person who cancelled them.
      status: { in: [RsvpStatus.CONFIRMED, RsvpStatus.WAITLISTED] },
      event:
        query.upcoming === false
          ? { endsAt: { lt: now } }
          : { endsAt: { gte: now } },
    } satisfies Prisma.RsvpWhereInput;

    const [rsvps, total] = await this.prisma.$transaction([
      this.prisma.rsvp.findMany({
        where,
        include: {
          event: {
            include: { createdBy: { select: { id: true, name: true } } },
          },
        },
        // Soonest first when looking forward, most recent first when looking
        // back: in both cases the most relevant row is at the top.
        orderBy:
          query.upcoming === false
            ? [{ event: { startsAt: 'desc' } }, { id: 'asc' }]
            : [{ event: { startsAt: 'asc' } }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.rsvp.count({ where }),
    ]);

    const data = await Promise.all(
      rsvps.map(async (rsvp) => ({
        event: toEventResponse(rsvp.event),
        status: rsvp.status,
        waitlistPosition:
          rsvp.status === RsvpStatus.WAITLISTED && rsvp.queuedAt !== null
            ? await this.waitlistPositionOf(this.prisma, rsvp)
            : null,
        rsvpedAt: rsvp.updatedAt.toISOString(),
      })),
    );

    return buildPaginatedResponse(data, total, query.page, query.limit);
  }

  /**
   * The caller's own RSVP state for an event, or null if they have none.
   *
   * Lives here rather than in EventsService so waitlist position is computed in
   * exactly one place and cannot disagree between the event detail response and
   * the RSVP response.
   */
  async getViewerRsvp(
    eventId: string,
    userId: string,
  ): Promise<ViewerRsvpDto | null> {
    const rsvp = await this.prisma.rsvp.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    if (rsvp === null || rsvp.status === RsvpStatus.CANCELLED) return null;

    return {
      status: rsvp.status,
      waitlistPosition:
        rsvp.status === RsvpStatus.WAITLISTED && rsvp.queuedAt !== null
          ? await this.waitlistPositionOf(this.prisma, rsvp)
          : null,
    };
  }

  /**
   * Promotes the longest-waiting queued participant into the place just freed.
   *
   * Runs inside the caller's transaction and under the caller's event lock, so
   * the place cannot be handed to a concurrent RSVP at the same time.
   */
  private async promoteNextWaitlisted(
    tx: PrismaTransaction,
    event: Event,
  ): Promise<Rsvp | null> {
    if (event.capacity === null) return null;

    const next = await tx.rsvp.findFirst({
      where: { eventId: event.id, status: RsvpStatus.WAITLISTED },
      orderBy: QUEUE_ORDER,
    });

    if (next === null) return null;

    const promoted = await tx.rsvp.update({
      where: { id: next.id },
      data: { status: RsvpStatus.CONFIRMED, queuedAt: null },
    });

    await tx.event.update({
      where: { id: event.id },
      data: { confirmedCount: { increment: 1 } },
    });

    this.logger.log(
      { eventId: event.id, userId: promoted.userId },
      'Waitlisted attendee promoted to confirmed',
    );

    return promoted;
  }

  /**
   * An event accepts RSVPs only while it is published and has not ended.
   *
   * Checked inside the transaction, under the lock, so an organiser cancelling
   * an event cannot interleave with an RSVP being accepted for it.
   */
  private assertEventAcceptsRsvps(event: Event): void {
    if (event.status === EventStatus.DRAFT) {
      // A draft is not publicly visible, so its existence is not confirmed here.
      throw new EventNotFoundException(event.id);
    }

    if (event.status === EventStatus.CANCELLED) {
      throw new EventNotOpenForRsvpException(
        'This event has been cancelled and is not accepting RSVPs',
        { status: event.status },
      );
    }

    if (event.status === EventStatus.COMPLETED) {
      throw new EventNotOpenForRsvpException(
        'This event has already taken place',
        { status: event.status },
      );
    }

    if (event.endsAt.getTime() <= Date.now()) {
      throw new EventNotOpenForRsvpException('This event has already ended', {
        endsAt: event.endsAt.toISOString(),
      });
    }
  }

  private async toRsvpResponse(
    rsvp: Rsvp,
    capacity: number | null,
    confirmedCount: number,
    client: PrismaTransaction | PrismaService,
  ): Promise<RsvpResponseDto> {
    return {
      eventId: rsvp.eventId,
      userId: rsvp.userId,
      status: rsvp.status,
      confirmedCount,
      capacity,
      waitlistPosition:
        rsvp.status === RsvpStatus.WAITLISTED && rsvp.queuedAt !== null
          ? await this.waitlistPositionOf(client, rsvp)
          : null,
      createdAt: rsvp.createdAt.toISOString(),
      updatedAt: rsvp.updatedAt.toISOString(),
    };
  }

  /**
   * 1-based queue position, counted rather than stored.
   *
   * Storing it would mean renumbering every row behind the leaver on every
   * cancellation — unbounded writes under the event lock the RSVP path is
   * already contending for. One indexed count cannot drift from the queue it
   * describes.
   */
  private async waitlistPositionOf(
    client: PrismaTransaction | PrismaService,
    rsvp: Rsvp,
  ): Promise<number> {
    const ahead = await client.rsvp.count({
      where: {
        eventId: rsvp.eventId,
        status: RsvpStatus.WAITLISTED,
        OR: [
          { queuedAt: { lt: rsvp.queuedAt as Date } },
          { queuedAt: rsvp.queuedAt, id: { lt: rsvp.id } },
        ],
      },
    });
    return ahead + 1;
  }
}
