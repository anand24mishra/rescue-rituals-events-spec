import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UsersService } from '../../users/users.service';

/** The only claims this application puts in, or reads out of, a token. */
export interface JwtPayload {
  /** Subject: the user's UUID. */
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('app.jwt.secret'),
      algorithms: ['HS256'],
    });
  }

  /**
   * Resolves the token's subject to a live user row.
   *
   * The extra lookup is deliberate. Trusting the token's claims alone would
   * mean a deleted user keeps full access until their token expires, and it
   * would tempt us into caching profile data in the token where it goes stale.
   * The token carries identity; the database carries state.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('Malformed authentication token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (user === null) {
      throw new UnauthorizedException(
        'Authentication token is no longer valid',
      );
    }

    return { id: user.id, email: user.email, name: user.name };
  }
}
