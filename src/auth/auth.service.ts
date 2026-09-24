import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import {
  EmailAlreadyRegisteredException,
  InvalidCredentialsException,
} from '../common/errors/domain.exception';
import { isPrismaKnownError, PrismaErrorCode } from '../prisma/prisma.service';
import { toUserResponse } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import type { AuthResponseDto } from './dto/auth-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import type { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const passwordHash = await this.passwords.hash(dto.password);

    let user: User;
    try {
      user = await this.users.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
      });
    } catch (error) {
      // Relying on the unique index rather than a prior `findByEmail` check:
      // the check-then-insert version has a race window in which two
      // simultaneous registrations both pass the check.
      if (
        isPrismaKnownError(error, PrismaErrorCode.UniqueConstraintViolation)
      ) {
        throw new EmailAlreadyRegisteredException();
      }
      throw error;
    }

    this.logger.log({ userId: user.id }, 'User registered');
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findByEmail(dto.email);

    if (user === null) {
      // Hash the supplied password anyway. Returning early for an unknown
      // email would make "no such account" measurably faster than "wrong
      // password" and turn response time into an account-enumeration oracle.
      await this.passwords.hash(dto.password);
      this.logger.warn({ reason: 'unknown_email' }, 'Failed login attempt');
      throw new InvalidCredentialsException();
    }

    const passwordMatches = await this.passwords.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordMatches) {
      this.logger.warn(
        { userId: user.id, reason: 'bad_password' },
        'Failed login attempt',
      );
      throw new InvalidCredentialsException();
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: User): AuthResponseDto {
    const payload: JwtPayload = { sub: user.id };
    const expiresIn = this.config.getOrThrow<string>('app.jwt.expiresIn');

    return {
      user: toUserResponse(user),
      accessToken: this.jwt.sign(payload),
      expiresIn: parseDurationToSeconds(expiresIn),
    };
  }
}

/**
 * Converts the `JWT_EXPIRES_IN` value into the seconds figure reported to
 * clients. Only the suffixes `@nestjs/jwt` itself accepts are supported; an
 * unrecognised value is reported as 0 rather than guessed at, so a client never
 * refreshes on a number this code invented.
 */
export function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(duration.trim());
  if (match === null) return 0;

  const amount = Number(match[1]);
  switch (match[2]) {
    case undefined:
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    case 'd':
      return amount * 86_400;
    default:
      return 0;
  }
}
