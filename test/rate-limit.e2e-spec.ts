import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Proves the rate limits actually engage.
 *
 * The rest of the suite runs with the limits relaxed via .env.test so it is not
 * fighting a safeguard. This file does the opposite: it boots its own
 * application with deliberately tiny limits, which is only possible because the
 * limits come from configuration rather than being hardcoded in a decorator.
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let originalEnv: Record<string, string | undefined>;

  const api = () => request(app.getHttpServer() as App);

  beforeAll(async () => {
    originalEnv = {
      AUTH_THROTTLE_LIMIT: process.env.AUTH_THROTTLE_LIMIT,
      RSVP_THROTTLE_LIMIT: process.env.RSVP_THROTTLE_LIMIT,
      THROTTLE_LIMIT: process.env.THROTTLE_LIMIT,
    };

    process.env.AUTH_THROTTLE_LIMIT = '3';
    process.env.RSVP_THROTTLE_LIMIT = '3';
    process.env.THROTTLE_LIMIT = '1000';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    app.setGlobalPrefix('api', { exclude: ['health', 'live'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.truncateAllTables();
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('throttles repeated login attempts and reports a usable error code', async () => {
    const attempt = () =>
      api()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password-here' });

    const statuses: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const response = await attempt();
      statuses.push(response.status);
    }

    // The first few are honest 401s; once the window is spent the endpoint stops
    // spending an Argon2 hash per guess and answers 429 instead.
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429, 429]);

    const throttled = await attempt();
    expect(throttled.body).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('does not throttle the health endpoint, which a platform polls constantly', async () => {
    for (let index = 0; index < 25; index += 1) {
      await api().get('/health').expect(200);
    }
  });
});
