import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { SWAGGER_PATH, setupSwagger } from './swagger';

/**
 * Request bodies are small by design — the largest is an event description.
 * A tight limit means an oversized payload is rejected at the edge instead of
 * being buffered and parsed.
 */
const BODY_LIMIT = '64kb';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Defer logging to pino so that startup messages are structured too.
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
  const isProduction = config.nodeEnv === 'production';

  // Behind a platform load balancer, Express must be told to trust the
  // forwarding headers or every client appears to share the proxy's IP — which
  // would make IP-based rate limiting meaningless.
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      // Swagger UI loads its own inline styles and scripts; the default CSP
      // blocks them and the docs page renders blank. The API itself serves only
      // JSON, so it is not the surface CSP is protecting.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });

  app.enableCors({
    origin:
      config.corsOrigins.includes('*') && !isProduction
        ? true
        : config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
    credentials: false,
    maxAge: 86_400,
  });

  app.setGlobalPrefix('api', {
    // Health endpoints describe the deployment rather than the API, so they are
    // not versioned or prefixed.
    exclude: ['health', 'live'],
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties with no DTO decorator, then reject any that were
      // stripped. Together these close off mass assignment: a request that
      // tries to set `createdById` or `confirmedCount` is a 400, not a silent
      // no-op that leaves the client believing it worked.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Query strings and path params arrive as strings; DTOs opt into
      // conversion explicitly with @Type(() => Number).
      forbidUnknownValues: true,
    }),
  );

  // Lets Nest run onModuleDestroy hooks — notably Prisma's $disconnect — when
  // the platform sends SIGTERM during a deploy, instead of dropping
  // connections mid-request.
  app.enableShutdownHooks();

  setupSwagger(app);

  await app.listen(config.port, '0.0.0.0');

  const logger = app.get(PinoLogger);
  logger.log(
    {
      port: config.port,
      nodeEnv: config.nodeEnv,
      docs: `/${SWAGGER_PATH}`,
      corsOrigins: config.corsOrigins,
    },
    'Rescue Rituals Events API started',
  );
}

void bootstrap();
