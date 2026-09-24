import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus, EventType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { IsAfterProperty } from '../../common/validators/is-after.validator';
import { IsIanaTimeZone } from '../../common/validators/is-iana-time-zone.validator';

/**
 * An upper bound on capacity. Not a database limit — a sanity limit, so a typo
 * of `100000000` is caught at the boundary rather than becoming an event that
 * can never fill.
 */
export const MAX_EVENT_CAPACITY = 100_000;

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class CreateEventDto {
  @ApiProperty({ example: 'Brooklyn Rescue Adoption Fair', maxLength: 160 })
  @IsString()
  @trim()
  @Length(3, 160)
  title: string;

  @ApiProperty({
    example:
      'Meet adoptable dogs and cats from five partner rescues, with on-site ' +
      'adoption counsellors.',
    maxLength: 5000,
  })
  @IsString()
  @trim()
  @Length(10, 5000)
  description: string;

  @ApiPropertyOptional({
    enum: EventType,
    default: EventType.OTHER,
    description:
      'Demo taxonomy for this assignment, not an official product taxonomy.',
  })
  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @ApiPropertyOptional({
    enum: [EventStatus.DRAFT, EventStatus.PUBLISHED],
    default: EventStatus.PUBLISHED,
    description:
      'Only DRAFT or PUBLISHED may be set at creation. CANCELLED and ' +
      'COMPLETED are lifecycle transitions, reachable via PATCH.',
  })
  @IsOptional()
  @IsEnum([EventStatus.DRAFT, EventStatus.PUBLISHED], {
    message: 'status must be one of: DRAFT, PUBLISHED',
  })
  status?: EventStatus;

  @ApiProperty({ example: 'Brooklyn, NY', maxLength: 255 })
  @IsString()
  @trim()
  @Length(2, 255)
  location: string;

  @ApiProperty({
    example: '2026-10-10T14:00:00Z',
    description: 'ISO 8601 instant.',
  })
  @IsISO8601(
    { strict: true },
    { message: 'startsAt must be an ISO 8601 date-time' },
  )
  startsAt: string;

  @ApiProperty({ example: '2026-10-10T18:00:00Z' })
  @IsISO8601(
    { strict: true },
    { message: 'endsAt must be an ISO 8601 date-time' },
  )
  @IsAfterProperty('startsAt')
  endsAt: string;

  @ApiPropertyOptional({
    example: 'America/New_York',
    description:
      'IANA zone, stored for display. Instants are always persisted in UTC.',
  })
  @IsOptional()
  @trim()
  @IsIanaTimeZone()
  timezone?: string;

  @ApiPropertyOptional({
    example: 150,
    minimum: 1,
    maximum: MAX_EVENT_CAPACITY,
    description:
      'Maximum confirmed attendees. Omit or send null for an unlimited event.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EVENT_CAPACITY)
  capacity?: number | null;

  @ApiPropertyOptional({
    default: true,
    description:
      'When true, requests to a full event are queued as WAITLISTED and are ' +
      'promoted automatically as places free up. When false, a full event ' +
      'returns 409 EVENT_AT_CAPACITY. No effect on an unlimited event.',
  })
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;
}
