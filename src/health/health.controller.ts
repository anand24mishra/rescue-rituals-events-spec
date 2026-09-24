import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' })
  status: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  database: 'up' | 'down';

  @ApiProperty({ example: 132.44, description: 'Process uptime in seconds.' })
  uptimeSeconds: number;

  @ApiProperty({ example: '2026-10-01T12:00:00.000Z' })
  timestamp: string;
}

class LivenessResponseDto {
  @ApiProperty({ example: 'ok' })
  status: 'ok';
}

/** A hung database must not hold the health check open indefinitely. */
const DATABASE_PROBE_TIMEOUT_MS = 2_000;

/**
 * Health endpoints sit outside `/api/v1` — they describe the deployment, not
 * the API contract, and a platform health check should not have to be updated
 * when the API version changes.
 */
@ApiTags('health')
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Readiness: is this instance able to serve traffic?
   *
   * Reports `degraded` with a 503 when the database is unreachable, because an
   * instance that cannot reach PostgreSQL cannot serve any meaningful request —
   * the platform should stop routing to it rather than return 500s to users.
   *
   * Not rate limited: throttling the endpoint a platform polls every few
   * seconds would eventually mark a healthy instance unhealthy.
   */
  @Public()
  @SkipThrottle({ default: true, auth: true, rsvp: true })
  @Get('health')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Readiness check, including database connectivity' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'Database unreachable.',
    type: HealthResponseDto,
  })
  async health(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponseDto> {
    const databaseUp = await this.probeDatabase();

    // The status code is set directly rather than by throwing, so that a
    // degraded response keeps the same body shape as a healthy one. A monitor
    // parsing this endpoint should not need two schemas.
    response.status(
      databaseUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Liveness: is the process running at all?
   *
   * Deliberately checks nothing external. A liveness probe that fails on a
   * database outage would make the platform restart every instance during an
   * outage it cannot fix by restarting.
   */
  @Public()
  @SkipThrottle({ default: true, auth: true, rsvp: true })
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Liveness check' })
  @ApiOkResponse({ type: LivenessResponseDto })
  live(): LivenessResponseDto {
    return { status: 'ok' };
  }

  private async probeDatabase(): Promise<boolean> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_resolve, reject) =>
          setTimeout(
            () => reject(new Error('database probe timed out')),
            DATABASE_PROBE_TIMEOUT_MS,
          ),
        ),
      ]);
      return true;
    } catch (error) {
      this.logger.error({ err: error }, 'Database health probe failed');
      return false;
    }
  }
}
