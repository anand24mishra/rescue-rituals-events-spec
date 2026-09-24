import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { api, createTestApp, registerUser } from './helpers/test-app';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.truncateAllTables();
  });

  const credentials = {
    name: 'Anand Mishra',
    email: 'anand@example.com',
    password: 'correct-horse-battery-staple',
  };

  describe('POST /auth/register', () => {
    it('creates the user, returns a token, and never returns the password hash', async () => {
      const response = await api(app)
        .post('/api/v1/auth/register')
        .send(credentials)
        .expect(201);

      expect(response.body).toMatchObject({
        user: { email: 'anand@example.com', name: 'Anand Mishra' },
      });
      expect(
        typeof (response.body as { accessToken: string }).accessToken,
      ).toBe('string');

      // The serialised response must not contain the hash under any key name.
      expect(JSON.stringify(response.body)).not.toContain('argon2');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain(credentials.password);
    });

    it('stores the password as an Argon2id hash, not as plaintext', async () => {
      await api(app)
        .post('/api/v1/auth/register')
        .send(credentials)
        .expect(201);

      const stored = await prisma.user.findUniqueOrThrow({
        where: { email: credentials.email },
      });

      expect(stored.passwordHash).not.toBe(credentials.password);
      expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
    });

    it('rejects a duplicate email with 409', async () => {
      await api(app)
        .post('/api/v1/auth/register')
        .send(credentials)
        .expect(201);

      const response = await api(app)
        .post('/api/v1/auth/register')
        .send(credentials)
        .expect(409);

      expect(response.body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    });

    it('treats email as case-insensitive for uniqueness', async () => {
      await api(app)
        .post('/api/v1/auth/register')
        .send(credentials)
        .expect(201);

      await api(app)
        .post('/api/v1/auth/register')
        .send({ ...credentials, email: 'ANAND@Example.COM' })
        .expect(409);
    });

    it('rejects a password below the length floor', async () => {
      const response = await api(app)
        .post('/api/v1/auth/register')
        .send({ ...credentials, password: 'short' })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('rejects a malformed email', async () => {
      await api(app)
        .post('/api/v1/auth/register')
        .send({ ...credentials, email: 'not-an-email' })
        .expect(400);
    });

    it('rejects unknown properties rather than ignoring them', async () => {
      const response = await api(app)
        .post('/api/v1/auth/register')
        .send({ ...credentials, isAdmin: true })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('isAdmin');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await api(app)
        .post('/api/v1/auth/register')
        .send(credentials)
        .expect(201);
    });

    it('returns a token for valid credentials', async () => {
      const response = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      expect(
        typeof (response.body as { accessToken: string }).accessToken,
      ).toBe('string');
    });

    it('accepts a differently-cased email', async () => {
      await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'Anand@EXAMPLE.com', password: credentials.password })
        .expect(200);
    });

    it('rejects a wrong password with 401', async () => {
      const response = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: 'wrong-password-here' })
        .expect(401);

      expect(response.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('gives an unknown email the identical response to a wrong password, so accounts cannot be enumerated', async () => {
      const unknown = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: credentials.password })
        .expect(401);

      const wrongPassword = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: 'wrong-password-here' })
        .expect(401);

      expect(unknown.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect((unknown.body as { message: string }).message).toBe(
        (wrongPassword.body as { message: string }).message,
      );
    });
  });

  describe('GET /auth/me', () => {
    it('returns the caller for a valid token', async () => {
      const user = await registerUser(app);

      const response = await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(response.body).toMatchObject({ id: user.id, email: user.email });
    });

    it('rejects a missing token with 401', async () => {
      const response = await api(app).get('/api/v1/auth/me').expect(401);
      expect(response.body).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    });

    it('rejects a malformed token with 401', async () => {
      await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });

    it('rejects a token whose subject no longer exists', async () => {
      const user = await registerUser(app);
      await prisma.user.delete({ where: { id: user.id } });

      await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(401);
    });

    it('rejects a token signed with the wrong secret', async () => {
      // Signed with a valid structure but a different key; accepting this would
      // mean signature verification is not happening.
      const forged =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiI5OTk5OTk5OS05OTk5LTQ5OTktODk5OS05OTk5OTk5OTk5OTkifQ.' +
        'bm90LXRoZS1yaWdodC1zaWduYXR1cmU';

      await api(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });
  });
});
