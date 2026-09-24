import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { MAX_EVENT_CAPACITY } from './create-event.dto';

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/**
 * Written out rather than derived with `PartialType(CreateEventDto)` so the
 * mutable field set is visible in one place. That list is a security boundary:
 * `createdById`, `confirmedCount`, `createdAt` and `id` are absent here, and
 * `forbidNonWhitelisted` turns an attempt to send them into a 400 rather than a
 * silent no-op.
 *
 * `status` accepts the full enum here because CANCELLED and COMPLETED are
 * lifecycle transitions an organiser performs after creation.
 */
export class UpdateEventDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @trim()
  @Length(3, 160)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @trim()
  @Length(10, 5000)
  description?: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @ApiPropertyOptional({
    enum: EventStatus,
    description:
      'Setting CANCELLED closes the event to new RSVPs. Existing RSVPs remain ' +
      'readable so attendees can still see what they had signed up for.',
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @trim()
  @Length(2, 255)
  location?: string;

  @ApiPropertyOptional({ example: '2026-10-10T14:00:00Z' })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'startsAt must be an ISO 8601 date-time' },
  )
  startsAt?: string;

  @ApiPropertyOptional({
    example: '2026-10-10T18:00:00Z',
    description:
      'When both bounds are supplied they are compared here. When only one is ' +
      'supplied it is compared against the stored value in the service.',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'endsAt must be an ISO 8601 date-time' },
  )
  @IsAfterProperty('startsAt')
  endsAt?: string;

  @ApiPropertyOptional({ example: 'America/New_York', nullable: true })
  @IsOptional()
  @trim()
  @IsIanaTimeZone()
  timezone?: string | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_EVENT_CAPACITY,
    nullable: true,
    description:
      'Send null to make the event unlimited. Lowering capacity below the ' +
      'number of already-confirmed attendees is rejected with 409 rather than ' +
      'silently removing people.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EVENT_CAPACITY)
  capacity?: number | null;

  @ApiPropertyOptional({
    description:
      'Turning this on does not retroactively queue anyone who was already ' +
      'refused; turning it off leaves existing queued RSVPs in place and they ' +
      'are still promoted as places free up.',
  })
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;
}
