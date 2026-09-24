import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RsvpStatus } from '@prisma/client';
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EventResponseDto } from '../../events/dto/event-response.dto';

export class MyRsvpResponseDto {
  @ApiProperty({
    type: EventResponseDto,
    description:
      'The event, so a client can render a card without a second call.',
  })
  event: EventResponseDto;

  @ApiProperty({ enum: [RsvpStatus.CONFIRMED, RsvpStatus.WAITLISTED] })
  status: RsvpStatus;

  @ApiProperty({ nullable: true, example: null })
  waitlistPosition: number | null;

  @ApiProperty({
    format: 'date-time',
    description: 'When this RSVP reached its current status.',
  })
  rsvpedAt: string;
}

export class ListMyRsvpsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    default: true,
    description:
      'True returns events that have not yet ended; false returns the ones ' +
      'that have. A single flag rather than free-form date filters, because ' +
      '"what am I going to" and "what did I go to" are the only two questions ' +
      'this page answers.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return value;
    const normalised = value.trim().toLowerCase();
    if (['true', '1', 'yes', ''].includes(normalised)) return true;
    if (['false', '0', 'no'].includes(normalised)) return false;
    return value;
  })
  @IsBoolean()
  upcoming?: boolean = true;
}
