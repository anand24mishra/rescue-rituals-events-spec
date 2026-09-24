import { ApiProperty } from '@nestjs/swagger';
import type { User } from '@prisma/client';

/**
 * The safe public representation of a user.
 *
 * Built by an explicit mapper rather than by spreading the Prisma row, so that
 * adding a sensitive column to the `users` table can never silently start
 * leaking it through an API response.
 */
export class UserResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '9f1c6b9a-2f5e-4c9a-9a0e-5a7b1c2d3e4f',
  })
  id: string;

  @ApiProperty({ example: 'Anand Mishra' })
  name: string;

  @ApiProperty({ format: 'email', example: 'anand@example.com' })
  email: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-20T09:15:00.000Z' })
  createdAt: string;
}

export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}
