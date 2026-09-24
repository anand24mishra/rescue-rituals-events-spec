import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodeValue } from './error-codes';

/**
 * An expected business-rule failure.
 *
 * Every expected failure carries a stable `code` alongside its status, so
 * clients never have to distinguish "already RSVP'd" from "event is full" by
 * string-matching a message — both are 409.
 */
export class DomainException extends HttpException {
  constructor(
    readonly code: ErrorCodeValue,
    status: HttpStatus,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}

/**
 * A validation failure that cannot be expressed on the DTO because it depends
 * on stored state — for example a PATCH that moves only one end of an event's
 * time range.
 */
export class InvalidTimeRangeException extends DomainException {
  constructor(startsAt: Date, endsAt: Date) {
    super(
      ErrorCode.VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      'endsAt must be later than startsAt',
      {
        fields: ['endsAt must be later than startsAt'],
        resultingStartsAt: startsAt.toISOString(),
        resultingEndsAt: endsAt.toISOString(),
      },
    );
  }
}

export class UserNotFoundException extends DomainException {
  constructor() {
    super(ErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND, 'User not found');
  }
}

export class EventNotFoundException extends DomainException {
  constructor(eventId: string) {
    super(ErrorCode.EVENT_NOT_FOUND, HttpStatus.NOT_FOUND, 'Event not found', {
      eventId,
    });
  }
}

export class NotEventOwnerException extends DomainException {
  constructor() {
    // Deliberately 403 rather than 404: the event is publicly readable, so
    // hiding its existence from a non-owner would buy no privacy while making
    // the failure harder for an organiser to understand.
    super(
      ErrorCode.NOT_EVENT_OWNER,
      HttpStatus.FORBIDDEN,
      'Only the organiser who created this event can modify it',
    );
  }
}

export class RsvpAlreadyExistsException extends DomainException {
  constructor(status: string) {
    super(
      ErrorCode.RSVP_ALREADY_EXISTS,
      HttpStatus.CONFLICT,
      "You have already RSVP'd to this event",
      { currentStatus: status },
    );
  }
}

export class EventAtCapacityException extends DomainException {
  constructor(capacity: number) {
    super(
      ErrorCode.EVENT_AT_CAPACITY,
      HttpStatus.CONFLICT,
      'This event has reached its capacity',
      { capacity },
    );
  }
}

export class EventNotOpenForRsvpException extends DomainException {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      ErrorCode.EVENT_NOT_OPEN_FOR_RSVP,
      HttpStatus.CONFLICT,
      reason,
      details,
    );
  }
}

export class RsvpNotFoundException extends DomainException {
  constructor() {
    super(
      ErrorCode.RSVP_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'You do not have an active RSVP for this event',
    );
  }
}

export class EmailAlreadyRegisteredException extends DomainException {
  constructor() {
    super(
      ErrorCode.EMAIL_ALREADY_REGISTERED,
      HttpStatus.CONFLICT,
      'An account with this email address already exists',
    );
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    // The same message is used for an unknown email and a wrong password so
    // the endpoint cannot be used to enumerate registered addresses.
    super(
      ErrorCode.INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED,
      'Invalid email or password',
    );
  }
}

export class CapacityBelowConfirmedCountException extends DomainException {
  constructor(capacity: number, confirmedCount: number) {
    super(
      ErrorCode.CAPACITY_BELOW_CONFIRMED_COUNT,
      HttpStatus.CONFLICT,
      'Capacity cannot be set below the number of attendees already confirmed',
      { requestedCapacity: capacity, confirmedCount },
    );
  }
}

export class IdempotencyKeyReusedException extends DomainException {
  constructor() {
    super(
      ErrorCode.IDEMPOTENCY_KEY_REUSED,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'This Idempotency-Key was already used for a different request',
    );
  }
}

export class ServiceBusyException extends DomainException {
  constructor() {
    // Raised when the RSVP transaction could not acquire a connection or the
    // event lock in time. It is retryable, which 503 communicates and 500
    // does not.
    super(
      ErrorCode.SERVICE_BUSY,
      HttpStatus.SERVICE_UNAVAILABLE,
      'The service is busy processing other requests. Please retry shortly.',
    );
  }
}
