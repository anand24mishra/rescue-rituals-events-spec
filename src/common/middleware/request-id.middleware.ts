import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Rejects absurd inbound values before they reach logs or response headers. */
const MAX_INBOUND_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * Assigns every request a correlation id, reusing a caller-supplied
 * `x-request-id` when one is present and plausible.
 *
 * The id is echoed back on the response and included in the error envelope, so
 * a user can quote it and an operator can find the exact request in the logs
 * without needing a timestamp and a guess.
 *
 * An inbound value is only trusted for correlation, never for authorisation,
 * and is length/charset-checked because it ends up in log output and a
 * response header.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const inbound = request.header(REQUEST_ID_HEADER);
    const requestId =
      inbound !== undefined &&
      inbound.length > 0 &&
      inbound.length <= MAX_INBOUND_REQUEST_ID_LENGTH &&
      SAFE_REQUEST_ID.test(inbound)
        ? inbound
        : randomUUID();

    request.headers[REQUEST_ID_HEADER] = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
