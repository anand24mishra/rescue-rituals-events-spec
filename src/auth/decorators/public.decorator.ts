import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without authentication.
 *
 * A token is still parsed when one is supplied, so a public route may
 * personalise its response for a signed-in caller — see JwtAuthGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
