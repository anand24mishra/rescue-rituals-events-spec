import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { UserScopedThrottlerGuard } from './common/guards/user-scoped-throttler.guard';
import {
  REQUEST_ID_HEADER,
  RequestIdMiddleware,
} from './common/middleware/request-id.middleware';
import configuration from './config/configuration';
import type { ThrottleBucket } from './config/configuration';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RsvpModule } from './rsvp/rsvp.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // The config factory validates everything up front, so caching is safe
      // and no code path reads raw process.env later.
      cache: true,
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.getOrThrow<string>('app.logLevel'),
          // Pretty output for humans locally; newline-delimited JSON in
          // production, where a log aggregator is reading it.
          transport:
            config.getOrThrow<string>('app.nodeEnv') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          autoLogging: {
            // Health checks are polled every few seconds and would otherwise
            // be most of the log volume.
            ignore: (req) => req.url === '/health' || req.url === '/live',
          },
          customProps: (req) => ({
            requestId: req.headers[REQUEST_ID_HEADER],
          }),
          /**
           * Redaction is a hard requirement, not a nicety: without it every
           * request logs its bearer token, and the log store becomes a
           * credential store. Cookies and the raw DATABASE_URL are covered for
           * the same reason.
           */
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["idempotency-key"]',
              'res.headers["set-cookie"]',
              'req.body.password',
              'password',
              'passwordHash',
              'accessToken',
              'DATABASE_URL',
              'JWT_SECRET',
            ],
            censor: '[redacted]',
          },
        },
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // All three buckets are registered globally, and each controller opts
        // out of the ones that do not apply to it with @SkipThrottle. The limits
        // come from configuration so they can be tuned per environment without a
        // code change.
        throttlers: (['default', 'auth', 'rsvp'] as const).map((name) => {
          const bucket = config.getOrThrow<ThrottleBucket>(
            `app.throttle.${name}`,
          );
          return { name, ttl: bucket.ttlMs, limit: bucket.limit };
        }),
      }),
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    EventsModule,
    RsvpModule,
    HealthModule,
  ],
  providers: [
    // Order matters. JwtAuthGuard runs first so that request.user exists by the
    // time the throttler picks a tracking key, which is what lets the rate
    // limit be per-user rather than per-IP.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: UserScopedThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
