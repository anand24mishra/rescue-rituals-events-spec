import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  CurrentUser,
  OptionalCurrentUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { PaginationMetaDto } from '../common/dto/paginated-response.dto';
import type { PaginatedDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateEventDto } from './dto/create-event.dto';
import { EventResponseDto } from './dto/event-response.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@ApiTags('events')
// The tight auth/rsvp buckets are not relevant to event CRUD; the general
// per-caller limit is.
@SkipThrottle({ auth: true, rsvp: true })
@Controller({ path: 'events', version: '1' })
@ApiExtraModels(EventResponseDto, PaginationMetaDto)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List events',
    description:
      'Public discovery feed. Returns PUBLISHED, not-yet-ended events by ' +
      'default, sorted by `startsAt` then `id` so paging is stable. ' +
      'Attendee rows are never loaded here — `confirmedCount` is read from ' +
      'the event row.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(EventResponseDto) },
        },
        meta: { $ref: getSchemaPath(PaginationMetaDto) },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  async list(
    @Query() query: ListEventsQueryDto,
    @OptionalCurrentUser() viewer?: AuthenticatedUser,
  ): Promise<PaginatedDto<EventResponseDto>> {
    return this.events.findMany(query, viewer?.id);
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Get one event',
    description:
      'Public. When a bearer token is supplied, the response also carries ' +
      "`viewerRsvp` describing the caller's own RSVP state, which is what a " +
      'client needs to render the RSVP button correctly.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: EventResponseDto })
  @ApiNotFoundResponse({
    description: 'EVENT_NOT_FOUND',
    type: ErrorResponseDto,
  })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @OptionalCurrentUser() viewer?: AuthenticatedUser,
  ): Promise<EventResponseDto> {
    return this.events.findOne(id, viewer?.id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an event',
    description:
      'The organiser is taken from the bearer token. `createdById`, ' +
      '`confirmedCount`, `createdAt` and `updatedAt` are not accepted in the ' +
      'payload and sending them is a 400.',
  })
  @ApiCreatedResponse({ type: EventResponseDto })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ErrorResponseDto,
  })
  async create(
    @CurrentUser() caller: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ): Promise<EventResponseDto> {
    return this.events.create(caller.id, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update an event you organise',
    description:
      'Requires ownership. Lowering `capacity` below the number of confirmed ' +
      'attendees returns 409 rather than removing anyone.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: EventResponseDto })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'NOT_EVENT_OWNER',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'EVENT_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'CAPACITY_BELOW_CONFIRMED_COUNT',
    type: ErrorResponseDto,
  })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() caller: AuthenticatedUser,
    @Body() dto: UpdateEventDto,
  ): Promise<EventResponseDto> {
    return this.events.update(id, caller.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete an event you organise',
    description:
      "Requires ownership. Cascades to the event's RSVP rows. Prefer setting " +
      'status to CANCELLED when attendance history matters.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Event deleted.' })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'NOT_EVENT_OWNER',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'EVENT_NOT_FOUND',
    type: ErrorResponseDto,
  })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    await this.events.remove(id, caller.id);
  }
}
