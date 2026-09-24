import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from './register.dto';

export class LoginDto {
  @ApiProperty({ example: 'anand@example.com' })
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  // Login deliberately does not re-apply the registration password rules. If
  // the policy is tightened later, existing users must still be able to sign
  // in with the password they already have.
  @ApiProperty({ example: 'correct-horse-battery-staple' })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;
}
