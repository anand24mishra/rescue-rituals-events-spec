import { Injectable, Logger } from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import type { Event } from '@prisma/client';
import {
  buildPaginatedResponse,
  PaginatedDto,
} from '../common/dto/paginated-response.dto';
import {
  CapacityBelowConfirmedCountException,
  EventNotFoundException,
  InvalidTimeRangeException,
  NotEventOwnerException,
} from '../common/errors/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RsvpService } from '../rsvp/rsvp.service';
import { lockEventRow } from './event-lock';
import type { CreateEventDto } from './dto/create-event.dto';
import type { EventResponseDto } from './dto/event-response.dto';
import { toEventResponse } from './dto/event-response.dto';
import type { ListEventsQueryDto } from './dto/list-events-query.dto';
import type { UpdateEventDto } from './dto/update-event.dto';

const organiserSelect = {
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.EventInclude;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rsvp: RsvpService,
  ) {}

  async create(
    organiserId: string,
    dto: CreateEventDto,
  ): Promise<EventResponseDto> {
    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        eventType: dto.eventType,
        status: dto.status,
        location: dto.location,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        timezone: dto.timezone ?? null,
        capacity: dto.capacity ?? null,
        waitlistEnabled: dto.waitlistEnabled,
        // Ownership comes from the verified token, never from the payload.
        createdById: organiserId,
      },
      include: organiserSelect,
    });

    this.logger.log({ eventId: event.id, organiserId }, 'Event created');
    return toEventResponse(event);
  }

  async findMany(
    query: ListEventsQueryDto,
    viewerId?: string,
  ): Promise<PaginatedDto<EventResponseDto>> {
    const where = this.buildListFilter(query, viewerId);

    // One round trip for the page and one for the count. `confirmedCount` is
    // read straight off the event row, so no attendee rows are loaded here —
    // that is the whole point of maintaining the counter (ADR-007).
    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: organiserSelect,
        // `id` is the tie-breaker: without it, two events starting at the same
        // instant could swap places between pages and a client would see one
        // twice and another never.
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    return buildPaginatedResponse(
      events.map((event) => toEventResponse(event)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string, viewerId?: string): Promise<EventResponseDto> {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: organiserSelect,
    });

    if (event === null) throw new EventNotFoundException(id);

    // A draft is not yet public: it is visible only to the organiser.
    if (event.status === EventStatus.DRAFT && event.createdById !== viewerId) {
      throw new EventNotFoundException(id);
    }

    if (viewerId === undefined) return toEventResponse(event);

    const viewerRsvp = await this.rsvp.getViewerRsvp(id, viewerId);
    return toEventResponse(event, viewerRsvp);
  }

  /** Loads an event for a mutation, asserting the caller owns it. */
  async findOwnedOrThrow(id: string, callerId: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (event === null) throw new EventNotFoundException(id);
    if (event.createdById !== callerId) throw new NotEventOwnerException();
    return event;
  }

  async update(
    id: string,
    callerId: string,
    dto: UpdateEventDto,
  ): Promise<EventResponseDto> {
    await this.findOwnedOrThrow(id, callerId);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Re-read under a row lock. The capacity rule below is checked against
      // `confirmedCount`, which a concurrent RSVP can change; without the lock
      // an organiser could lower capacity to exactly the current count at the
      // same moment as an RSVP incremented it, and the write would then violate
      // the events_confirmed_count_within_capacity_check constraint.
      const current = await lockEventRow(tx, id);

      if (
        dto.capacity !== undefined &&
        dto.capacity !== null &&
        dto.capacity < current.confirmedCount
      ) {
        throw new CapacityBelowConfirmedCountException(
          dto.capacity,
          current.confirmedCount,
        );
      }

      this.assertCoherentTimeRange(dto, current);

      return tx.event.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          eventType: dto.eventType,
          status: dto.status,
          location: dto.location,
          startsAt:
            dto.startsAt === undefined ? undefined : new Date(dto.startsAt),
          endsAt: dto.endsAt === undefined ? undefined : new Date(dto.endsAt),
          timezone: dto.timezone,
          capacity: dto.capacity,
          waitlistEnabled: dto.waitlistEnabled,
        },
        include: organiserSelect,
      });
    });

    this.logger.log({ eventId: id, organiserId: callerId }, 'Event updated');
    return toEventResponse(updated);
  }

  async remove(id: string, callerId: string): Promise<void> {
    await this.findOwnedOrThrow(id, callerId);

    // RSVP rows are removed by the ON DELETE CASCADE on rsvps.event_id. Hard
    // deletion is offered because the assignment asks for it; a product that
    // needs attendance history should transition the event to CANCELLED
    // instead, which this API also supports.
    await this.prisma.event.delete({ where: { id } });
    this.logger.log({ eventId: id, organiserId: callerId }, 'Event deleted');
  }

  private buildListFilter(
    query: ListEventsQueryDto,
    viewerId?: string,
  ): Prisma.EventWhereInput {
    const where: Prisma.EventWhereInput = {};

    if (query.status === EventStatus.DRAFT) {
      // Drafts are private to their organiser. An anonymous caller asking for
      // drafts gets an empty page rather than an error, which keeps the filter
      // uniform for clients.
      where.status = EventStatus.DRAFT;
      where.createdById = viewerId ?? '00000000-0000-0000-0000-000000000000';
    } else {
      where.status = query.status ?? EventStatus.PUBLISHED;
    }

    if (query.upcoming !== false) {
      // "Upcoming" keys off the end time, not the start: an event already in
      // progress is still joinable and should stay in the feed.
      where.endsAt = { gte: new Date() };
    }

    if (query.location !== undefined) {
      where.location = { contains: query.location, mode: 'insensitive' };
    }

    if (query.search !== undefined) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    if (query.eventType !== undefined) where.eventType = query.eventType;

    if (query.createdById !== undefined) {
      where.createdById = query.createdById;
    }

    return where;
  }

  /**
   * A PATCH may move only one bound of the time range. class-validator can only
   * compare the two values inside the payload, so the missing side is compared
   * against the stored row here.
   */
  private assertCoherentTimeRange(dto: UpdateEventDto, current: Event): void {
    const startsAt =
      dto.startsAt === undefined ? current.startsAt : new Date(dto.startsAt);
    const endsAt =
      dto.endsAt === undefined ? current.endsAt : new Date(dto.endsAt);

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new InvalidTimeRangeException(startsAt, endsAt);
    }
  }
}
