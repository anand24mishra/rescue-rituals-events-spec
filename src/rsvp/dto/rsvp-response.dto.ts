import { ApiProperty } from '@nestjs/swagger';
import { RsvpStatus } from '@prisma/client';

export class RsvpResponseDto {
  @ApiProperty({ format: 'uuid' })
  eventId: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Always the authenticated caller. Never taken from the request.',
  })
  userId: string;

  @ApiProperty({
    enum: RsvpStatus,
    description:
      'CONFIRMED when a place was available. WAITLISTED when the event was ' +
      'full and the organiser enabled a waitlist.',
  })
  status: RsvpStatus;

  @ApiProperty({
    example: 100,
    description: 'Confirmed attendees after this operation.',
  })
  confirmedCount: number;

  @ApiProperty({ nullable: true, example: 100 })
  capacity: number | null;

  @ApiProperty({
    nullable: true,
    example: 14,
    description:
      '1-based place in the queue, or null when CONFIRMED. Computed from queue ' +
      'order at read time, so it is always consistent with the queue itself.',
  })
  waitlistPosition: number | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
