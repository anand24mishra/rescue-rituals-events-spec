import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-codes';

/**
 * Documentation-only mirror of what AllExceptionsFilter emits. Kept in this
 * file so Swagger can reference one schema for every error response instead of
 * repeating an inline example per endpoint.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 409 })
  statusCode: number;

  @ApiProperty({
    description:
      'Stable machine-readable code. Branch on this rather than on `message`.',
    enum: Object.values(ErrorCode),
    example: ErrorCode.RSVP_ALREADY_EXISTS,
  })
  code: string;

  @ApiProperty({ example: "You have already RSVP'd to this event" })
  message: string;

  @ApiProperty({ example: '/api/v1/events/1f8c.../rsvp' })
  path: string;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' })
  timestamp: string;

  @ApiPropertyOptional({
    description: 'Correlation id, also returned in the `x-request-id` header.',
    example: 'b1e6f0c2-6f3a-4b25-9a1f-0f0c1d2e3a4b',
  })
  requestId?: string;

  @ApiPropertyOptional({
    description:
      'Context for the failure. For validation errors this carries `fields`.',
    example: { capacity: 2 },
  })
  details?: Record<string, unknown>;
}
