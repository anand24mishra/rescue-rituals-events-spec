/**
 * The authenticated caller, as resolved from a verified JWT by JwtStrategy.
 *
 * This is the *only* source of caller identity in the application. No service
 * accepts a `userId` from a request body or query string, because a client can
 * set those to anything.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}
