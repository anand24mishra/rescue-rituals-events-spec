import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { PaginationMetaDto } from '../common/dto/paginated-response.dto';
import type { PaginatedDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  ListMyRsvpsQueryDto,
  MyRsvpResponseDto,
} from './dto/my-rsvp-response.dto';
import { RsvpService } from './rsvp.service';

/**
 * The authenticated caller's own participation.
 *
 * Kept on `/me` rather than under `/events` because the resource here is the
 * person, not an event — and because scoping it to the token holder makes it
 * impossible to express "show me somebody else's RSVPs" in the URL at all.
 */
@ApiTags('rsvp')
@SkipThrottle({ auth: true, rsvp: true })
@Controller({ path: 'me', version: '1' })
@ApiExtraModels(MyRsvpResponseDto, PaginationMetaDto)
export class MeController {
  constructor(private readonly rsvp: RsvpService) {}

  @Get('rsvps')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List the events you are attending',
    description:
      "Returns the caller's active RSVPs with the full event attached, so a " +
      'client can render the list without a second request per event. ' +
      'Cancelled RSVPs are not returned.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(MyRsvpResponseDto) },
        },
        meta: { $ref: getSchemaPath(PaginationMetaDto) },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'AUTHENTICATION_REQUIRED',
    type: ErrorResponseDto,
  })
  async listMine(
    @CurrentUser() caller: AuthenticatedUser,
    @Query() query: ListMyRsvpsQueryDto,
  ): Promise<PaginatedDto<MyRsvpResponseDto>> {
    return this.rsvp.listMyRsvps(caller.id, query);
  }
}
