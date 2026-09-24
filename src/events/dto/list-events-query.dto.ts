import { ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus, EventType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Accepts `?upcoming=true`, `?upcoming=1` and bare `?upcoming`. */
const toBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    // Only strings and numbers are meaningful here; anything else is left alone
    // so @IsOptional/@IsEnum reports it rather than being silently coerced.
    if (typeof value !== 'string' && typeof value !== 'number') return value;
    const normalised = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', ''].includes(normalised)) return true;
    if (['false', '0', 'no'].includes(normalised)) return false;
    return value;
  });

export class ListEventsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    default: true,
    description:
      'When true (the default), only events that have not yet ended are ' +
      'returned — a discovery feed should not show last month.',
  })
  @IsOptional()
  @toBoolean()
  upcoming?: boolean = true;

  @ApiPropertyOptional({
    example: 'Brooklyn',
    description: 'Case-insensitive substring match on location.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 255)
  location?: string;

  @ApiPropertyOptional({
    example: 'adoption',
    description: 'Case-insensitive substring match on title.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 160)
  search?: string;

  @ApiPropertyOptional({
    enum: EventStatus,
    description:
      'Defaults to PUBLISHED. A DRAFT event is only visible to its organiser, ' +
      'so requesting DRAFT also restricts results to events you created.',
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Restrict to events created by this organiser.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'createdById must be a valid UUID' })
  createdById?: string;
}
