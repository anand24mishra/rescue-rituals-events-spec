import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export const MIN_PASSWORD_LENGTH = 10;
/**
 * Argon2 has no practical input limit, but an unbounded password is a cheap way
 * to make the server burn CPU hashing megabytes.
 */
export const MAX_PASSWORD_LENGTH = 128;

export class RegisterDto {
  @ApiProperty({ example: 'Anand Mishra', minLength: 1, maxLength: 100 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 100)
  name: string;

  @ApiProperty({
    example: 'anand@example.com',
    maxLength: 255,
    description: 'Normalised to lowercase. Must not already be registered.',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({
    example: 'correct-horse-battery-staple',
    minLength: MIN_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_LENGTH,
    description:
      'A length floor is enforced instead of a composition rule: length is ' +
      'what actually resists guessing, and composition rules push users ' +
      'toward predictable substitutions.',
  })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;
}
