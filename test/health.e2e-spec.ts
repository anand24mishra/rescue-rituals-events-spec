import type { INestApplication } from '@nestjs/common';
import { api, createTestApp } from './helpers/test-app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports readiness including database connectivity', async () => {
    const response = await api(app).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(
      typeof (response.body as { uptimeSeconds: number }).uptimeSeconds,
    ).toBe('number');
  });

  it('reports liveness without touching the database', async () => {
    const response = await api(app).get('/live').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('is reachable without authentication and outside /api/v1', async () => {
    await api(app).get('/health').expect(200);
    // Confirms the endpoint is not versioned — a platform health check should not
    // break when the API version changes.
    await api(app).get('/api/v1/health').expect(404);
  });

  it('sets no-store so a proxy cannot serve a stale healthy response', async () => {
    const response = await api(app).get('/health').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns a correlation id that echoes a caller-supplied one', async () => {
    const generated = await api(app).get('/live').expect(200);
    expect(generated.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);

    const echoed = await api(app)
      .get('/live')
      .set('x-request-id', 'client-supplied-id-123')
      .expect(200);
    expect(echoed.headers['x-request-id']).toBe('client-supplied-id-123');
  });

  it('replaces an implausible caller-supplied correlation id', async () => {
    const response = await api(app)
      .get('/live')
      .set('x-request-id', 'bad id with spaces and <script>')
      .expect(200);
    expect(response.headers['x-request-id']).not.toContain('<script>');
  });
});
