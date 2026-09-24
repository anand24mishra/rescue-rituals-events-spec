import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import request from 'supertest';
import type { App } from 'supertest/types';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Boots the real application for integration testing.
 *
 * The global pipe, prefix and versioning are configured exactly as in main.ts.
 * If they drifted, the tests would exercise a different application than the one
 * that gets deployed — which is the failure mode that makes an e2e suite give
 * false confidence. (Helmet, CORS and pino are omitted: they are transport
 * concerns that do not change any behaviour under test.)
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });

  app.setGlobalPrefix('api', { exclude: ['health', 'live'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      forbidUnknownValues: true,
    }),
  );

  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

export const api = (app: INestApplication) =>
  request(app.getHttpServer() as App);

let userCounter = 0;

export interface TestUser {
  id: string;
  email: string;
  name: string;
  token: string;
}

/** Registers a user and returns their identity plus a usable bearer token. */
export async function registerUser(
  app: INestApplication,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<TestUser> {
  userCounter += 1;
  const email =
    overrides.email ?? `user${userCounter}-${Date.now()}@example.com`;
  const password = overrides.password ?? 'test-password-long-enough';
  const name = overrides.name ?? `Test User ${userCounter}`;

  const response = await api(app)
    .post('/api/v1/auth/register')
    .send({ name, email, password })
    .expect(201);

  const body = response.body as {
    user: { id: string; email: string; name: string };
    accessToken: string;
  };

  return {
    id: body.user.id,
    email: body.user.email,
    name: body.user.name,
    token: body.accessToken,
  };
}

/**
 * Creates users straight in the database and signs tokens for them.
 *
 * Used by the concurrency suite, which needs dozens of distinct callers. Going
 * through `POST /auth/register` for those would trip the registration rate limit
 * — a safeguard that is doing its job — and would spend most of the test's time
 * computing Argon2 hashes for accounts that never log in.
 *
 * Tests that are *about* authentication use `registerUser` and the real endpoint.
 */
export async function createUsersDirectly(
  app: INestApplication,
  count: number,
): Promise<TestUser[]> {
  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);

  const rows = Array.from({ length: count }, (_, index) => {
    userCounter += 1;
    return {
      name: `Bulk User ${userCounter}`,
      email: `bulk-${userCounter}-${Date.now()}-${index}@example.com`,
      // These accounts are never logged into, so no real hash is needed. The
      // value is a syntactically valid Argon2 string so nothing downstream
      // chokes on it.
      passwordHash:
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$' +
        'ZHVtbXloYXNobm90dXNlZGZvcmxvZ2luYXRhbGw',
    };
  });

  await prisma.user.createMany({ data: rows });

  const created = await prisma.user.findMany({
    where: { email: { in: rows.map((row) => row.email) } },
    select: { id: true, email: true, name: true },
  });

  return created.map((user) => ({
    ...user,
    token: jwt.sign({ sub: user.id }),
  }));
}

const hoursFromNow = (hours: number) =>
  new Date(Date.now() + hours * 3_600_000).toISOString();

/** Creates an event owned by `owner`, with sensible valid defaults. */
export async function createEvent(
  app: INestApplication,
  owner: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; [key: string]: unknown }> {
  const response = await api(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({
      title: 'Test Rescue Event',
      description: 'An event created by the automated test suite.',
      location: 'Brooklyn, NY',
      startsAt: hoursFromNow(48),
      endsAt: hoursFromNow(52),
      ...overrides,
    })
    .expect(201);

  return response.body as { id: string };
}

export { hoursFromNow };
