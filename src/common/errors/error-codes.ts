/**
 * Stable machine-readable error codes.
 *
 * Clients branch on `code`, not on the human-readable `message`: messages are
 * free to be reworded, codes are part of the contract and are not. Every code
 * that can reach a client is listed here and documented in docs/API_SPEC.md.
 */
export const ErrorCode = {
  // 400 / 422 — request shape
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',

  // 401
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // 403
  FORBIDDEN: 'FORBIDDEN',
  NOT_EVENT_OWNER: 'NOT_EVENT_OWNER',

  // 404
  /** Fallback for an unrouted path; domain misses use the specific codes. */
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  RSVP_NOT_FOUND: 'RSVP_NOT_FOUND',

  // 409 — business conflicts
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  RSVP_ALREADY_EXISTS: 'RSVP_ALREADY_EXISTS',
  EVENT_AT_CAPACITY: 'EVENT_AT_CAPACITY',
  EVENT_NOT_OPEN_FOR_RSVP: 'EVENT_NOT_OPEN_FOR_RSVP',
  CAPACITY_BELOW_CONFIRMED_COUNT: 'CAPACITY_BELOW_CONFIRMED_COUNT',

  // 429
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // 503 / 500
  SERVICE_BUSY: 'SERVICE_BUSY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
