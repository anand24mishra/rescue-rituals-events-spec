import { ApiProperty } from '@nestjs/swagger';
import { RsvpStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AttendeeResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({
    example: 'Anand Mishra',
    description:
      'Display name only. Email, and every other profile field, is ' +
      'deliberately absent: an attendee list is not a contact export.',
  })
  name: string;

  @ApiProperty({ enum: RsvpStatus })
  status: RsvpStatus;

  @ApiProperty({
    format: 'date-time',
    description: 'When this RSVP reached its current status.',
  })
  rsvpedAt: string;

  @ApiProperty({
    nullable: true,
    example: null,
    description: '1-based queue place, or null unless WAITLISTED.',
  })
  waitlistPosition: number | null;
}

export class ListAttendeesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: [RsvpStatus.CONFIRMED, RsvpStatus.WAITLISTED],
    description:
      'Defaults to CONFIRMED. Cancelled RSVPs are never listed — they are ' +
      'retained for state transitions, not as a public record of who left.',
  })
  @IsOptional()
  @IsEnum([RsvpStatus.CONFIRMED, RsvpStatus.WAITLISTED], {
    message: 'status must be one of: CONFIRMED, WAITLISTED',
  })
  status?: RsvpStatus;
}
