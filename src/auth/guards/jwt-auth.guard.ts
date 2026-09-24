import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Authentication guard, registered globally in AppModule.
 *
 * Global-by-default with an explicit `@Public()` opt-out is the safer polarity:
 * forgetting the decorator leaves a new endpoint locked rather than open.
 *
 * On a `@Public()` route the guard still *attempts* authentication and ignores
 * any failure. That is what makes a public route able to personalise its
 * response — event detail reports the caller's own RSVP state when a token is
 * present — without a second guard or a second endpoint. A public route must
 * therefore treat `request.user` as optional, which `@CurrentUser()` enforces
 * by throwing if it is missing on a protected route.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.isPublic(context)) {
      return (await super.canActivate(context)) as boolean;
    }

    try {
      await super.canActivate(context);
    } catch {
      // An absent, expired or malformed token is not an error on a public
      // route; the handler simply sees an anonymous caller.
    }
    return true;
  }

  /**
   * Normalises every authentication failure — missing, malformed, expired,
   * unknown subject — into one 401 with one message. Distinguishing them would
   * tell an attacker which of their guesses was closer.
   */
  override handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err instanceof Error) throw err;
    if (err !== null && err !== undefined) {
      // Passport can surface a non-Error rejection; normalise it rather than
      // rethrowing a value no handler upstream can inspect.
      throw new UnauthorizedException('Authentication failed');
    }
    if (user === false || user === null || user === undefined) {
      throw new UnauthorizedException(
        'A valid bearer token is required for this endpoint',
      );
    }
    return user;
  }
}
