import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus, EventType, RsvpStatus } from '@prisma/client';
import type { Event } from '@prisma/client';

export class EventOrganiserDto {
  @ApiProperty({ format: 'uuid' }) id: string;

  @ApiProperty({
    example: 'Anand Mishra',
    description:
      "Display name only. An organiser's email is never exposed on a public " +
      'event, even though the event itself is public.',
  })
  name: string;
}

/** The caller's own RSVP state, present only on an authenticated read. */
export class ViewerRsvpDto {
  @ApiProperty({ enum: RsvpStatus, example: RsvpStatus.CONFIRMED })
  status: RsvpStatus;

  @ApiPropertyOptional({
    nullable: true,
    example: 4,
    description: '1-based queue position. Null unless status is WAITLISTED.',
  })
  waitlistPosition: number | null;
}

export class EventResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Brooklyn Rescue Adoption Fair' }) title: string;
  @ApiProperty() description: string;
  @ApiProperty({ enum: EventType }) eventType: EventType;
  @ApiProperty({ enum: EventStatus }) status: EventStatus;
  @ApiProperty({ example: 'Brooklyn, NY' }) location: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-10T14:00:00.000Z' })
  startsAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-10T18:00:00.000Z' })
  endsAt: string;

  @ApiProperty({ nullable: true, example: 'America/New_York' })
  timezone: string | null;

  @ApiProperty({
    nullable: true,
    example: 150,
    description: 'Null means unlimited.',
  })
  capacity: number | null;

  @ApiProperty({
    example: 71,
    description: 'Confirmed attendees. Waitlisted users are not counted here.',
  })
  confirmedCount: number;

  @ApiProperty({
    nullable: true,
    example: 79,
    description:
      'Convenience field: capacity minus confirmed attendees, or null when ' +
      'the event is unlimited. Derived, never stored.',
  })
  spotsRemaining: number | null;

  @ApiProperty({
    example: false,
    description: 'True when a capacity is set and has been reached.',
  })
  isFull: boolean;

  @ApiProperty({
    example: true,
    description:
      'Whether a full event queues further requests instead of refusing them.',
  })
  waitlistEnabled: boolean;

  @ApiProperty({ format: 'uuid' }) createdById: string;

  @ApiPropertyOptional({ type: EventOrganiserDto })
  organiser?: EventOrganiserDto;

  @ApiPropertyOptional({
    type: ViewerRsvpDto,
    nullable: true,
    description:
      "The authenticated caller's own RSVP, or null if they have none. " +
      'Omitted entirely for an anonymous request.',
  })
  viewerRsvp?: ViewerRsvpDto | null;

  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

type EventWithOptionalOrganiser = Event & {
  createdBy?: { id: string; name: string };
};

/**
 * Single mapper from database row to API representation.
 *
 * Centralised so a column added to `events` does not appear in API output until
 * someone deliberately adds it here.
 */
export function toEventResponse(
  event: EventWithOptionalOrganiser,
  viewerRsvp?: ViewerRsvpDto | null,
): EventResponseDto {
  const spotsRemaining =
    event.capacity === null
      ? null
      : Math.max(0, event.capacity - event.confirmedCount);

  const response: EventResponseDto = {
    id: event.id,
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    status: event.status,
    location: event.location,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timezone: event.timezone,
    capacity: event.capacity,
    confirmedCount: event.confirmedCount,
    spotsRemaining,
    isFull: event.capacity !== null && event.confirmedCount >= event.capacity,
    waitlistEnabled: event.waitlistEnabled,
    createdById: event.createdById,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };

  if (event.createdBy !== undefined) {
    response.organiser = { id: event.createdBy.id, name: event.createdBy.name };
  }

  // `undefined` means "anonymous caller, field omitted"; `null` means
  // "authenticated caller with no RSVP". The distinction lets a client tell
  // "you have not RSVP'd" apart from "we do not know who you are".
  if (viewerRsvp !== undefined) {
    response.viewerRsvp = viewerRsvp;
  }

  return response;
}
