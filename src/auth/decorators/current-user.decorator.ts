import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Injects the authenticated caller.
 *
 * Throws if no user is present, which can only happen if a handler using this
 * decorator is reachable without authentication — a wiring mistake, not a
 * client error. Failing loudly here is what stops such a handler from
 * proceeding with `undefined` as the acting user.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (user === undefined) {
      throw new InternalServerErrorException(
        'Route requires an authenticated user but none was resolved',
      );
    }

    return user;
  },
);

/**
 * Injects the caller when one is identifiable, or `undefined` for an anonymous
 * request. For `@Public()` routes that personalise their response.
 */
export const OptionalCurrentUser = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.user as AuthenticatedUser | undefined;
  },
);
