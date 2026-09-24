import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({
    description:
      'JWT bearer token. Send as `Authorization: Bearer <token>`. Short-lived ' +
      'by design; there is no refresh-token flow in this scope.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Seconds until `accessToken` expires.',
    example: 3600,
  })
  expiresIn: number;
}
