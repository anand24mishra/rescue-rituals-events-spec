import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  api,
  createEvent,
  createTestApp,
  hoursFromNow,
  registerUser,
  type TestUser,
} from './helpers/test-app';

describe('Events (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.truncateAllTables();
    owner = await registerUser(app);
    other = await registerUser(app);
  });

  const validPayload = {
    title: 'Brooklyn Rescue Adoption Fair',
    description: 'Meet adoptable dogs and cats from five partner rescues.',
    location: 'Brooklyn, NY',
    startsAt: hoursFromNow(48),
    endsAt: hoursFromNow(52),
  };

  describe('POST /events', () => {
    it('creates an event owned by the authenticated caller', async () => {
      const response = await api(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${owner.token}`)
        .send(validPayload)
        .expect(201);

      expect(response.body).toMatchObject({
        title: validPayload.title,
        createdById: owner.id,
        confirmedCount: 0,
        status: 'PUBLISHED',
        eventType: 'OTHER',
        waitlistEnabled: true,
      });
    });

    it('ignores a client-supplied organiser and rejects the attempt outright', async () => {
      const response = await api(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ ...validPayload, createdById: other.id })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('createdById');
    });

    it('requires authentication', async () => {
      await api(app).post('/api/v1/events').send(validPayload).expect(401);
    });

    it('rejects a capacity of zero', async () => {
      await api(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ ...validPayload, capacity: 0 })
        .expect(400);
    });

    it('rejects a negative capacity', async () => {
      await api(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ ...validPayload, capacity: -5 })
        .expect(400);
    });

    it('rejects a non-ISO start time', async () => {
      await api(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ ...validPayload, startsAt: 'next tuesday' })
        .expect(400);
    });

    it('rejects an end time equal to the start time', async () => {
      const sameMoment = hoursFromNow(48);
      await api(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ ...validPayload, startsAt: sameMoment, endsAt: sameMoment })
        .expect(400);
    });

    it('trims surrounding whitespace from text fields', async () => {
      const response = await api(app)
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ ...validPayload, title: '   Padded Title   ' })
        .expect(201);

      expect((response.body as { title: string }).title).toBe('Padded Title');
    });
  });

  describe('GET /events', () => {
    it('is public and paginates with deterministic ordering', async () => {
      await createEvent(app, owner, {
        title: 'Later Event',
        startsAt: hoursFromNow(100),
        endsAt: hoursFromNow(104),
      });
      await createEvent(app, owner, {
        title: 'Sooner Event',
        startsAt: hoursFromNow(10),
        endsAt: hoursFromNow(14),
      });

      const response = await api(app).get('/api/v1/events?limit=1').expect(200);
      const body = response.body as {
        data: { title: string }[];
        meta: { total: number; totalPages: number };
      };

      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe('Sooner Event');
      expect(body.meta).toMatchObject({ total: 2, totalPages: 2 });
    });

    it('excludes events that have already ended by default', async () => {
      // Written directly: the API refuses to create an event in the past, which
      // is the correct behaviour, so the fixture has to bypass it.
      await prisma.event.create({
        data: {
          title: 'Finished Event',
          description: 'This one is over and should not appear in the feed.',
          location: 'Brooklyn, NY',
          startsAt: new Date(Date.now() - 7_200_000),
          endsAt: new Date(Date.now() - 3_600_000),
          createdById: owner.id,
        },
      });

      const upcoming = await api(app).get('/api/v1/events').expect(200);
      expect((upcoming.body as { meta: { total: number } }).meta.total).toBe(0);

      const all = await api(app)
        .get('/api/v1/events?upcoming=false')
        .expect(200);
      expect((all.body as { meta: { total: number } }).meta.total).toBe(1);
    });

    it('filters by location, case-insensitively', async () => {
      await createEvent(app, owner, { location: 'Brooklyn, NY' });
      await createEvent(app, owner, { location: 'Jersey City, NJ' });

      const response = await api(app)
        .get('/api/v1/events?location=brooklyn')
        .expect(200);

      expect((response.body as { meta: { total: number } }).meta.total).toBe(1);
    });

    it('caps the page size instead of honouring an unbounded limit', async () => {
      await api(app).get('/api/v1/events?limit=5000').expect(400);
    });

    it('rejects a non-numeric page', async () => {
      await api(app).get('/api/v1/events?page=abc').expect(400);
    });

    it("hides another organiser's drafts", async () => {
      await createEvent(app, owner, { title: 'Secret Draft', status: 'DRAFT' });

      const anonymous = await api(app).get('/api/v1/events').expect(200);
      expect((anonymous.body as { meta: { total: number } }).meta.total).toBe(
        0,
      );

      const stranger = await api(app)
        .get('/api/v1/events?status=DRAFT')
        .set('Authorization', `Bearer ${other.token}`)
        .expect(200);
      expect((stranger.body as { meta: { total: number } }).meta.total).toBe(0);

      const asOwner = await api(app)
        .get('/api/v1/events?status=DRAFT')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect((asOwner.body as { meta: { total: number } }).meta.total).toBe(1);
    });

    it('does not expose organiser email addresses', async () => {
      await createEvent(app, owner);
      const response = await api(app).get('/api/v1/events').expect(200);
      expect(JSON.stringify(response.body)).not.toContain(owner.email);
    });
  });

  describe('GET /events/:id', () => {
    it("reports the caller's own RSVP state when authenticated", async () => {
      const event = await createEvent(app, owner, { capacity: 5 });

      const anonymous = await api(app)
        .get(`/api/v1/events/${event.id}`)
        .expect(200);
      expect(anonymous.body).not.toHaveProperty('viewerRsvp');

      const before = await api(app)
        .get(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(200);
      expect((before.body as { viewerRsvp: unknown }).viewerRsvp).toBeNull();

      await api(app)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(201);

      const after = await api(app)
        .get(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(200);
      expect(
        (after.body as { viewerRsvp: { status: string } }).viewerRsvp,
      ).toMatchObject({
        status: 'CONFIRMED',
        waitlistPosition: null,
      });
    });

    it('returns 404 for an unknown id and 400 for a malformed one', async () => {
      await api(app)
        .get('/api/v1/events/99999999-9999-4999-8999-999999999999')
        .expect(404);
      await api(app).get('/api/v1/events/not-a-uuid').expect(400);
    });

    it('derives spotsRemaining and isFull rather than trusting a stored value', async () => {
      const event = await createEvent(app, owner, { capacity: 1 });

      await api(app)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(201);

      const response = await api(app)
        .get(`/api/v1/events/${event.id}`)
        .expect(200);
      expect(response.body).toMatchObject({
        capacity: 1,
        confirmedCount: 1,
        spotsRemaining: 0,
        isFull: true,
      });
    });
  });

  describe('PATCH /events/:id', () => {
    it('lets the owner update', async () => {
      const event = await createEvent(app, owner);

      const response = await api(app)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect((response.body as { title: string }).title).toBe('Updated Title');
    });

    it('rejects a non-owner with 403 and leaves the event untouched', async () => {
      const event = await createEvent(app, owner, { title: 'Original Title' });

      const response = await api(app)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ title: 'Hijacked Title' })
        .expect(403);

      expect(response.body).toMatchObject({ code: 'NOT_EVENT_OWNER' });

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.title).toBe('Original Title');
    });

    it('rejects attempts to mutate protected fields', async () => {
      const event = await createEvent(app, owner);

      for (const payload of [
        { createdById: other.id },
        { confirmedCount: 500 },
        { id: '11111111-1111-4111-8111-111111111111' },
      ]) {
        await api(app)
          .patch(`/api/v1/events/${event.id}`)
          .set('Authorization', `Bearer ${owner.token}`)
          .send(payload)
          .expect(400);
      }

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.createdById).toBe(owner.id);
      expect(stored.confirmedCount).toBe(0);
    });

    it('rejects a partial update that would invert the time range', async () => {
      const event = await createEvent(app, owner, {
        startsAt: hoursFromNow(48),
        endsAt: hoursFromNow(52),
      });

      // Only endsAt is supplied, so the DTO cannot compare the two — this is the
      // check that happens against the stored row.
      const response = await api(app)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ endsAt: hoursFromNow(12) })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('allows raising capacity and clearing it to unlimited', async () => {
      const event = await createEvent(app, owner, { capacity: 2 });

      await api(app)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ capacity: 10 })
        .expect(200);

      const cleared = await api(app)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ capacity: null })
        .expect(200);

      expect(cleared.body).toMatchObject({
        capacity: null,
        spotsRemaining: null,
        isFull: false,
      });
    });

    it('refuses to lower capacity below the confirmed headcount', async () => {
      const event = await createEvent(app, owner, { capacity: 3 });
      await api(app)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(201);

      const response = await api(app)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ capacity: 0 })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });

      const conflict = await api(app)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ capacity: 1 })
        .expect(200);
      // Lowering to exactly the confirmed count is allowed; below it is not.
      expect((conflict.body as { capacity: number }).capacity).toBe(1);

      await api(app)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(201);
      // owner is now waitlisted; confirmed is still 1.

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.confirmedCount).toBe(1);
    });
  });

  describe('DELETE /events/:id', () => {
    it('lets the owner delete and cascades to RSVP rows', async () => {
      const event = await createEvent(app, owner, { capacity: 5 });
      await api(app)
        .post(`/api/v1/events/${event.id}/rsvp`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(201);

      await api(app)
        .delete(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(204);

      expect(
        await prisma.event.findUnique({ where: { id: event.id } }),
      ).toBeNull();
      expect(await prisma.rsvp.count({ where: { eventId: event.id } })).toBe(0);
    });

    it('rejects a non-owner with 403', async () => {
      const event = await createEvent(app, owner);

      await api(app)
        .delete(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403);

      expect(
        await prisma.event.findUnique({ where: { id: event.id } }),
      ).not.toBeNull();
    });

    it('returns 404 for an unknown event', async () => {
      await api(app)
        .delete('/api/v1/events/99999999-9999-4999-8999-999999999999')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(404);
    });
  });
});
