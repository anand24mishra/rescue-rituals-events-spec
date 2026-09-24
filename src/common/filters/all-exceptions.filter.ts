import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { DomainException } from '../errors/domain.exception';
import { ErrorCode, ErrorCodeValue } from '../errors/error-codes';
import { PrismaErrorCode } from '../../prisma/prisma.service';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

/** Status codes at or above this are our fault, and are logged as errors. */
const SERVER_ERROR_THRESHOLD = 500;

interface ErrorEnvelope {
  statusCode: number;
  /** An ErrorCodeValue, or a code carried on a thrown HttpException body. */
  code: string;
  message: string;
  path: string;
  timestamp: string;
  requestId?: string;
  details?: unknown;
}

/**
 * Converts every thrown value into the single documented error envelope
 * (docs/API_SPEC.md §8).
 *
 * The contract this filter maintains: a client always receives a `code` it can
 * branch on, and never receives a stack trace, SQL fragment, or Prisma
 * internals. Unexpected errors are logged in full server-side and reduced to a
 * generic message on the wire — the `requestId` is what ties the two together
 * when a user reports a failure.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const envelope = this.toEnvelope(exception, request);

    if (envelope.statusCode >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        {
          requestId: envelope.requestId,
          method: request.method,
          path: envelope.path,
          statusCode: envelope.statusCode,
          errorCode: envelope.code,
          err: exception,
        },
        'Unhandled error while processing request',
      );
    } else {
      this.logger.debug(
        {
          requestId: envelope.requestId,
          method: request.method,
          path: envelope.path,
          statusCode: envelope.statusCode,
          errorCode: envelope.code,
        },
        'Request rejected',
      );
    }

    httpAdapter.reply(response, envelope, envelope.statusCode);
  }

  private toEnvelope(exception: unknown, request: Request): ErrorEnvelope {
    const core = this.classify(exception);

    // Spread last so the envelope's keys always serialise in the documented
    // order: statusCode, code, message, then the request context.
    return {
      statusCode: core.statusCode,
      code: core.code,
      message: core.message,
      path: request.originalUrl || request.url,
      timestamp: new Date().toISOString(),
      requestId: request.header(REQUEST_ID_HEADER) ?? undefined,
      ...(core.details === undefined ? {} : { details: core.details }),
    };
  }

  private classify(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof DomainException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests. Please slow down and try again shortly.',
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Only genuine constraint violations are conflicts. Everything else
      // Prisma can raise — a missing column, a bad query, an unreachable
      // database — is a server fault, and reporting those as 409 would tell the
      // client to change its request when the deployment is what is broken. It
      // would also hide schema drift behind a plausible-looking response.
      const isConstraintViolation =
        exception.code === PrismaErrorCode.UniqueConstraintViolation ||
        exception.code === PrismaErrorCode.ForeignKeyConstraintViolation ||
        // Check-constraint violations arrive as a raw database error.
        exception.code === 'P2010';

      if (isConstraintViolation) {
        // The specific constraint is logged, never returned: constraint names
        // describe the schema.
        return {
          statusCode: HttpStatus.CONFLICT,
          code: ErrorCode.INTERNAL_ERROR,
          message:
            'The request conflicts with the current state of the resource',
        };
      }

      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    };
  }

  private fromHttpException(exception: HttpException): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    const status = exception.getStatus();
    const body = exception.getResponse();

    // ValidationPipe throws a BadRequestException whose response body carries
    // `message` as an array of per-field failures. Those are surfaced under
    // `details` so the envelope's own `message` stays a single string.
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      const rawMessage = record.message;

      if (Array.isArray(rawMessage)) {
        return {
          statusCode: status,
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Request validation failed',
          details: { fields: rawMessage },
        };
      }

      return {
        statusCode: status,
        code:
          typeof record.code === 'string'
            ? record.code
            : this.defaultCodeForStatus(status),
        message:
          typeof rawMessage === 'string' ? rawMessage : exception.message,
        details: record.details,
      };
    }

    return {
      statusCode: status,
      code: this.defaultCodeForStatus(status),
      message: typeof body === 'string' ? body : exception.message,
    };
  }

  /**
   * Fallback code for an HttpException thrown without one — typically by Nest
   * itself, e.g. the 404 for an unrouted path.
   *
   * A lookup rather than a switch, so the mapping is data and the statuses stay
   * comparable as the numbers they are.
   */
  private defaultCodeForStatus(status: number): ErrorCodeValue {
    const byStatus: Record<number, ErrorCodeValue> = {
      [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
      [HttpStatus.UNAUTHORIZED]: ErrorCode.AUTHENTICATION_REQUIRED,
      [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCode.RESOURCE_NOT_FOUND,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMIT_EXCEEDED,
      [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_BUSY,
    };

    return byStatus[status] ?? ErrorCode.INTERNAL_ERROR;
  }
}
