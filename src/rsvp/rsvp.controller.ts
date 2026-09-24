import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { RsvpStatus } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { PaginationMetaDto } from '../common/dto/paginated-response.dto';
import type { PaginatedDto } from '../common/dto/paginated-response.dto';
import { ErrorCode } from '../common/errors/error-codes';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  AttendeeResponseDto,
  ListAttendeesQueryDto,
} from './dto/attendee-response.dto';
import { RsvpResponseDto } from './dto/rsvp-response.dto';
import { IdempotencyService } from './idempotency.service';
import type { IdempotencyContext } from './idempotency.service';
import { RsvpService } from './rsvp.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventNotFoundException } from '../common/errors/domain.exception';

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

@ApiTags('rsvp')
/**
 * Only the `rsvp` bucket applies here, and it is keyed by authenticated user
 * rather than by IP (see UserScopedThrottlerGuard). An IP-keyed limit is wrong
 * in both directions for this route: it lets one user cycle addresses to hammer
 * an event, and it punishes everyone behind a shared NAT — an office, a campus,
 * a carrier — for one person's retries.
 */
@SkipThrottle({ default: true, auth: true })
@Controller({ path: 'events', version: '1' })
@ApiExtraModels(AttendeeResponseDto, PaginationMetaDto)
export class RsvpController {
  constructor(
    private readonly rsvp: RsvpService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':id/rsvp')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'RSVP to an event',
    description:
      "Records the authenticated caller's intent to attend. The attendee is " +
      'always the token holder; there is no `userId` field to send.\n\n' +
      'The capacity decision runs inside a transaction that holds a row lock ' +
      'on the event, so concurrent requests cannot both claim the last place. ' +
      'A full event either returns 409 EVENT_AT_CAPACITY or, when the ' +
      'organiser enabled a waitlist, returns 201 with status WAITLISTED.\n\n' +
      'Send an `Idempotency-Key` header to make a retry after a network ' +
      'timeout safe.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Opaque client-generated key. Repeating a request with the same key ' +
      'returns the original outcome instead of attempting the change again.',
  })
  @ApiCreatedResponse({ type: RsvpResponseDto })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'EVENT_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'RSVP_ALREADY_EXISTS, EVENT_AT_CAPACITY or EVENT_NOT_OPEN_FOR_RSVP',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'IDEMPOTENCY_KEY_REUSED — same key, different request',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'RATE_LIMIT_EXCEEDED',
    type: ErrorResponseDto,
  })
  async create(
    @Param('id', new ParseUUIDPipe()) eventId: string,
    @CurrentUser() caller: AuthenticatedUser,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<RsvpResponseDto> {
    this.assertEmptyBody(body);

    return this.rsvp.createRsvp(
      eventId,
      caller.id,
      this.buildIdempotencyContext(eventId, caller.id, idempotencyKey),
    );
  }

  @Delete(':id/rsvp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel your RSVP',
    description:
      'Releases the place and, if a waitlist has people on it, promotes the ' +
      'longest-waiting one in the same transaction — so a freed place cannot ' +
      'be handed out twice.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'RSVP cancelled.' })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'EVENT_NOT_FOUND or RSVP_NOT_FOUND',
    type: ErrorResponseDto,
  })
  async remove(
    @Param('id', new ParseUUIDPipe()) eventId: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    await this.rsvp.cancelRsvp(eventId, caller.id);
  }

  @Get(':id/attendees')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List attendees',
    description:
      'Visible to the organiser and to people attending the event. A signed-in ' +
      'stranger gets 403: knowing an event is public is not the same as being ' +
      'entitled to the list of who is going. Names only — no email addresses.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(AttendeeResponseDto) },
        },
        meta: { $ref: getSchemaPath(PaginationMetaDto) },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'FORBIDDEN — caller is neither the organiser nor an attendee',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'EVENT_NOT_FOUND',
    type: ErrorResponseDto,
  })
  async listAttendees(
    @Param('id', new ParseUUIDPipe()) eventId: string,
    @CurrentUser() caller: AuthenticatedUser,
    @Query() query: ListAttendeesQueryDto,
  ): Promise<PaginatedDto<AttendeeResponseDto>> {
    await this.assertMaySeeAttendees(eventId, caller.id);
    return this.rsvp.listAttendees(eventId, query);
  }

  /**
   * This endpoint takes no body fields, and says so rather than ignoring them.
   *
   * There is no DTO to validate against: an empty class registers no validation
   * metadata, which makes `forbidUnknownValues` reject every request including
   * the valid empty one. So the check is explicit here.
   *
   * Silently accepting `{"userId": "..."}` would be safe — identity comes from
   * the token and the field is never read — but it would let a client believe it
   * had RSVP'd somebody else and get a 201 confirming it. Better to say no.
   */
  private assertEmptyBody(body: unknown): void {
    if (
      typeof body === 'object' &&
      body !== null &&
      Object.keys(body).length > 0
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'This endpoint does not accept a request body',
        details: {
          fields: Object.keys(body).map(
            (key) => `property ${key} should not exist`,
          ),
          hint: 'The attendee is always the authenticated caller.',
        },
      });
    }
  }

  /**
   * Object-level authorization for the attendee list.
   *
   * Ownership alone would be too strict — attendees reasonably want to see who
   * else is coming — and "any authenticated user" would be too loose, turning
   * every public event into a roster of named individuals for anyone who
   * registers. The rule is therefore: organiser, or a current participant.
   */
  private async assertMaySeeAttendees(
    eventId: string,
    callerId: string,
  ): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { createdById: true },
    });

    if (event === null) throw new EventNotFoundException(eventId);
    if (event.createdById === callerId) return;

    const ownRsvp = await this.prisma.rsvp.findUnique({
      where: { eventId_userId: { eventId, userId: callerId } },
      select: { status: true },
    });

    const isParticipant =
      ownRsvp !== null &&
      (ownRsvp.status === RsvpStatus.CONFIRMED ||
        ownRsvp.status === RsvpStatus.WAITLISTED);

    if (!isParticipant) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message:
          'Only the organiser and people attending this event can see the ' +
          'attendee list',
      });
    }
  }

  private buildIdempotencyContext(
    eventId: string,
    userId: string,
    key?: string,
  ): IdempotencyContext | undefined {
    if (key === undefined) return undefined;

    const trimmed = key.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      // An unusable key is ignored rather than fatal: the request is still a
      // valid RSVP, and the unique constraint still prevents a duplicate.
      return undefined;
    }

    return {
      key: trimmed,
      userId,
      scope: 'POST:/events/:id/rsvp',
      // The event is the only meaningful input, since the attendee comes from
      // the token. Reusing one key across two events is therefore a reuse
      // conflict, which is what a client that recycles keys deserves to hear.
      fingerprint: IdempotencyService.fingerprint({ eventId }),
    };
  }
}
