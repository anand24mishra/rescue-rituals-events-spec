import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  toUserResponse,
  UserResponseDto,
} from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserNotFoundException } from '../common/errors/domain.exception';

@ApiTags('auth')
/**
 * Only the `auth` rate-limit bucket applies here. It is far tighter than the
 * general limit because these are the two endpoints where an attacker gets
 * unlimited free guesses and where each attempt costs the server an Argon2 hash.
 * Limits come from AUTH_THROTTLE_LIMIT / AUTH_THROTTLE_TTL.
 */
@SkipThrottle({ default: true, rsvp: true })
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Creates a user and returns a bearer token, so a client can register ' +
      'and act in one round trip. Email is normalised to lowercase.',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({
    description: 'EMAIL_ALREADY_REGISTERED',
    type: ErrorResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'RATE_LIMIT_EXCEEDED',
    type: ErrorResponseDto,
  })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange credentials for a bearer token',
    description:
      'An unknown email and a wrong password return the same 401 with the ' +
      'same message, so this endpoint cannot be used to discover which ' +
      'addresses are registered.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'RATE_LIMIT_EXCEEDED',
    type: ErrorResponseDto,
  })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Return the authenticated user',
    description:
      'Useful for a client that has a stored token and needs to know whether ' +
      'it is still valid and who it belongs to.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ErrorResponseDto,
  })
  async me(@CurrentUser() caller: AuthenticatedUser): Promise<UserResponseDto> {
    const user = await this.users.findById(caller.id);
    if (user === null) {
      // The strategy already resolved this id against the database, so this can
      // only happen if the account was deleted mid-request.
      throw new UserNotFoundException();
    }
    return toUserResponse(user);
  }
}
