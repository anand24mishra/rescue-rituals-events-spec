import type { INestApplication } from '@nestjs/common';
import { EventStatus, RsvpStatus } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  api,
  createEvent,
  createTestApp,
  createUsersDirectly,
  registerUser,
  type TestUser,
} from './helpers/test-app';

describe('RSVP (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let organiser: TestUser;
  let attendee: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.truncateAllTables();
    organiser = await registerUser(app);
    attendee = await registerUser(app);
  });

  const rsvp = (eventId: string, user: TestUser) =>
    api(app)
      .post(`/api/v1/events/${eventId}/rsvp`)
      .set('Authorization', `Bearer ${user.token}`);

  const cancel = (eventId: string, user: TestUser) =>
    api(app)
      .delete(`/api/v1/events/${eventId}/rsvp`)
      .set('Authorization', `Bearer ${user.token}`);

  describe('POST /events/:id/rsvp', () => {
    it('confirms the first RSVP and increments the counter', async () => {
      const event = await createEvent(app, organiser, { capacity: 10 });

      const response = await rsvp(event.id, attendee).expect(201);
      expect(response.body).toMatchObject({
        eventId: event.id,
        userId: attendee.id,
        status: 'CONFIRMED',
        confirmedCount: 1,
        capacity: 10,
        waitlistPosition: null,
      });

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.confirmedCount).toBe(1);
    });

    it('works on an unlimited event', async () => {
      const event = await createEvent(app, organiser);
      const response = await rsvp(event.id, attendee).expect(201);
      expect(response.body).toMatchObject({
        status: 'CONFIRMED',
        capacity: null,
      });
    });

    it('rejects a duplicate RSVP with 409 and does not double-count', async () => {
      const event = await createEvent(app, organiser, { capacity: 10 });
      await rsvp(event.id, attendee).expect(201);

      const response = await rsvp(event.id, attendee).expect(409);
      expect(response.body).toMatchObject({ code: 'RSVP_ALREADY_EXISTS' });

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.confirmedCount).toBe(1);
      expect(await prisma.rsvp.count({ where: { eventId: event.id } })).toBe(1);
    });

    it('requires authentication', async () => {
      const event = await createEvent(app, organiser);
      await api(app).post(`/api/v1/events/${event.id}/rsvp`).expect(401);
    });

    it('returns 404 for an unknown event', async () => {
      await rsvp('99999999-9999-4999-8999-999999999999', attendee).expect(404);
    });

    it('accepts no body fields at all — the attendee is the token holder', async () => {
      const event = await createEvent(app, organiser, { capacity: 10 });

      // Trying to RSVP somebody else must not be possible even in principle.
      await rsvp(event.id, attendee).send({ userId: organiser.id }).expect(400);

      await rsvp(event.id, attendee).expect(201);
      const row = await prisma.rsvp.findFirstOrThrow({
        where: { eventId: event.id },
      });
      expect(row.userId).toBe(attendee.id);
    });

    it('refuses a cancelled event', async () => {
      const event = await createEvent(app, organiser, { capacity: 5 });
      await api(app)
        .patch(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${organiser.token}`)
        .send({ status: EventStatus.CANCELLED })
        .expect(200);

      const response = await rsvp(event.id, attendee).expect(409);
      expect(response.body).toMatchObject({ code: 'EVENT_NOT_OPEN_FOR_RSVP' });
    });

    it('refuses an event that has already ended', async () => {
      const event = await prisma.event.create({
        data: {
          title: 'Already Over',
          description: 'This event finished an hour ago.',
          location: 'Brooklyn, NY',
          startsAt: new Date(Date.now() - 7_200_000),
          endsAt: new Date(Date.now() - 3_600_000),
          createdById: organiser.id,
        },
      });

      const response = await rsvp(event.id, attendee).expect(409);
      expect(response.body).toMatchObject({ code: 'EVENT_NOT_OPEN_FOR_RSVP' });
    });

    it('hides a draft event from a non-organiser as 404, not 409', async () => {
      const event = await createEvent(app, organiser, { status: 'DRAFT' });
      await rsvp(event.id, attendee).expect(404);
    });
  });

  describe('capacity and waitlist', () => {
    it('queues beyond capacity when a waitlist is enabled, with sequential positions', async () => {
      const event = await createEvent(app, organiser, {
        capacity: 1,
        waitlistEnabled: true,
      });
      const [first, second] = await createUsersDirectly(app, 2);

      await rsvp(event.id, attendee).expect(201);

      const queuedFirst = await rsvp(event.id, first).expect(201);
      expect(queuedFirst.body).toMatchObject({
        status: 'WAITLISTED',
        waitlistPosition: 1,
        confirmedCount: 1,
      });

      const queuedSecond = await rsvp(event.id, second).expect(201);
      expect(queuedSecond.body).toMatchObject({
        status: 'WAITLISTED',
        waitlistPosition: 2,
      });

      // Queued RSVPs must not inflate the confirmed count.
      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.confirmedCount).toBe(1);
    });

    it('returns 409 beyond capacity when the waitlist is disabled', async () => {
      const event = await createEvent(app, organiser, {
        capacity: 1,
        waitlistEnabled: false,
      });

      await rsvp(event.id, attendee).expect(201);
      const response = await rsvp(event.id, organiser).expect(409);

      expect(response.body).toMatchObject({
        code: 'EVENT_AT_CAPACITY',
        details: { capacity: 1 },
      });
    });

    it('promotes the longest-waiting person when a confirmed attendee leaves', async () => {
      const event = await createEvent(app, organiser, { capacity: 1 });
      const [firstInQueue, secondInQueue] = await createUsersDirectly(app, 2);

      await rsvp(event.id, attendee).expect(201);
      await rsvp(event.id, firstInQueue).expect(201);
      await rsvp(event.id, secondInQueue).expect(201);

      await cancel(event.id, attendee).expect(204);

      const promoted = await prisma.rsvp.findUniqueOrThrow({
        where: {
          eventId_userId: { eventId: event.id, userId: firstInQueue.id },
        },
      });
      const stillQueued = await prisma.rsvp.findUniqueOrThrow({
        where: {
          eventId_userId: { eventId: event.id, userId: secondInQueue.id },
        },
      });

      expect(promoted.status).toBe(RsvpStatus.CONFIRMED);
      // A promoted row must have its queue key cleared, or the CHECK constraint
      // would reject it and the queue ordering would be ambiguous.
      expect(promoted.queuedAt).toBeNull();
      expect(stillQueued.status).toBe(RsvpStatus.WAITLISTED);

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.confirmedCount).toBe(1);

      // The remaining queued person moves up to position 1.
      const detail = await api(app)
        .get(`/api/v1/events/${event.id}`)
        .set('Authorization', `Bearer ${secondInQueue.token}`)
        .expect(200);
      expect(
        (detail.body as { viewerRsvp: { waitlistPosition: number } })
          .viewerRsvp,
      ).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });
    });

    it('promotes nobody when a queued person withdraws', async () => {
      const event = await createEvent(app, organiser, { capacity: 1 });
      const [queued] = await createUsersDirectly(app, 1);

      await rsvp(event.id, attendee).expect(201);
      await rsvp(event.id, queued).expect(201);

      await cancel(event.id, queued).expect(204);

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.confirmedCount).toBe(1);
    });

    it('does not restore an old queue position when someone re-joins', async () => {
      const event = await createEvent(app, organiser, { capacity: 1 });
      const [early, later] = await createUsersDirectly(app, 2);

      await rsvp(event.id, attendee).expect(201);
      await rsvp(event.id, early).expect(201); // position 1
      await cancel(event.id, early).expect(204); // leaves the queue
      await rsvp(event.id, later).expect(201); // now position 1
      const rejoined = await rsvp(event.id, early).expect(201);

      // `early` goes to the back, because `queuedAt` is reset on re-join rather
      // than preserved from the original row.
      expect(rejoined.body).toMatchObject({
        status: 'WAITLISTED',
        waitlistPosition: 2,
      });
    });
  });

  describe('DELETE /events/:id/rsvp', () => {
    it('cancels a confirmed RSVP and decrements the counter', async () => {
      const event = await createEvent(app, organiser, { capacity: 5 });
      await rsvp(event.id, attendee).expect(201);

      await cancel(event.id, attendee).expect(204);

      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.confirmedCount).toBe(0);

      // The row is retained as CANCELLED rather than deleted, which is what
      // keeps UNIQUE(event_id, user_id) able to stay absolute.
      const row = await prisma.rsvp.findUniqueOrThrow({
        where: { eventId_userId: { eventId: event.id, userId: attendee.id } },
      });
      expect(row.status).toBe(RsvpStatus.CANCELLED);
      expect(row.queuedAt).toBeNull();
    });

    it('allows re-joining after cancelling, reusing the same row', async () => {
      const event = await createEvent(app, organiser, { capacity: 5 });

      await rsvp(event.id, attendee).expect(201);
      await cancel(event.id, attendee).expect(204);
      await rsvp(event.id, attendee).expect(201);

      expect(await prisma.rsvp.count({ where: { eventId: event.id } })).toBe(1);
      const stored = await prisma.event.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(stored.confirmedCount).toBe(1);
    });

    it('returns 404 when there is no active RSVP', async () => {
      const event = await createEvent(app, organiser, { capacity: 5 });

      const never = await cancel(event.id, attendee).expect(404);
      expect(never.body).toMatchObject({ code: 'RSVP_NOT_FOUND' });

      await rsvp(event.id, attendee).expect(201);
      await cancel(event.id, attendee).expect(204);
      await cancel(event.id, attendee).expect(404);
    });

    it('requires authentication', async () => {
      const event = await createEvent(app, organiser);
      await api(app).delete(`/api/v1/events/${event.id}/rsvp`).expect(401);
    });
  });

  describe('GET /me/rsvps', () => {
    it('returns the events the caller is attending, with the event attached', async () => {
      const event = await createEvent(app, organiser, {
        title: 'Something To Attend',
        capacity: 5,
      });
      await rsvp(event.id, attendee).expect(201);

      const response = await api(app)
        .get('/api/v1/me/rsvps')
        .set('Authorization', `Bearer ${attendee.token}`)
        .expect(200);

      const body = response.body as {
        data: { status: string; event: { id: string; title: string } }[];
        meta: { total: number };
      };

      expect(body.meta.total).toBe(1);
      expect(body.data[0]).toMatchObject({ status: 'CONFIRMED' });
      expect(body.data[0].event).toMatchObject({
        id: event.id,
        title: 'Something To Attend',
      });
    });

    it('reports the queue position for a waitlisted RSVP', async () => {
      const event = await createEvent(app, organiser, { capacity: 1 });
      const [queued] = await createUsersDirectly(app, 1);

      await rsvp(event.id, attendee).expect(201);
      await rsvp(event.id, queued).expect(201);

      const response = await api(app)
        .get('/api/v1/me/rsvps')
        .set('Authorization', `Bearer ${queued.token}`)
        .expect(200);

      expect((response.body as { data: unknown[] }).data[0]).toMatchObject({
        status: 'WAITLISTED',
        waitlistPosition: 1,
      });
    });

    it('excludes a cancelled RSVP', async () => {
      const event = await createEvent(app, organiser, { capacity: 5 });
      await rsvp(event.id, attendee).expect(201);
      await cancel(event.id, attendee).expect(204);

      const response = await api(app)
        .get('/api/v1/me/rsvps')
        .set('Authorization', `Bearer ${attendee.token}`)
        .expect(200);

      expect((response.body as { meta: { total: number } }).meta.total).toBe(0);
    });

    it('separates upcoming from past by the event end time', async () => {
      const past = await prisma.event.create({
        data: {
          title: 'Already Happened',
          description: 'An event that finished before now.',
          location: 'Brooklyn, NY',
          startsAt: new Date(Date.now() - 7_200_000),
          endsAt: new Date(Date.now() - 3_600_000),
          createdById: organiser.id,
          confirmedCount: 1,
        },
      });
      await prisma.rsvp.create({
        data: { eventId: past.id, userId: attendee.id, status: 'CONFIRMED' },
      });

      const upcoming = await api(app)
        .get('/api/v1/me/rsvps')
        .set('Authorization', `Bearer ${attendee.token}`)
        .expect(200);
      expect((upcoming.body as { meta: { total: number } }).meta.total).toBe(0);

      const previous = await api(app)
        .get('/api/v1/me/rsvps?upcoming=false')
        .set('Authorization', `Bearer ${attendee.token}`)
        .expect(200);
      expect((previous.body as { meta: { total: number } }).meta.total).toBe(1);
    });

    it('requires authentication, and cannot be scoped to another user', async () => {
      await api(app).get('/api/v1/me/rsvps').expect(401);

      // There is no parameter that could name a different person: the caller is
      // the token holder, so passing one is a rejected unknown field.
      await api(app)
        .get(`/api/v1/me/rsvps?userId=${organiser.id}`)
        .set('Authorization', `Bearer ${attendee.token}`)
        .expect(400);
    });
  });

  describe('GET /events/:id/attendees', () => {
    it('is visible to the organiser and exposes no email addresses', async () => {
      const event = await createEvent(app, organiser, { capacity: 5 });
      await rsvp(event.id, attendee).expect(201);

      const response = await api(app)
        .get(`/api/v1/events/${event.id}/attendees`)
        .set('Authorization', `Bearer ${organiser.token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        data: [
          { userId: attendee.id, name: attendee.name, status: 'CONFIRMED' },
        ],
        meta: { total: 1 },
      });
      expect(JSON.stringify(response.body)).not.toContain(attendee.email);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('is visible to a fellow attendee', async () => {
      const event = await createEvent(app, organiser, { capacity: 5 });
      const [fellow] = await createUsersDirectly(app, 1);
      await rsvp(event.id, attendee).expect(201);
      await rsvp(event.id, fellow).expect(201);

      await api(app)
        .get(`/api/v1/events/${event.id}/attendees`)
        .set('Authorization', `Bearer ${fellow.token}`)
        .expect(200);
    });

    it('is hidden from a signed-in stranger', async () => {
      const event = await createEvent(app, organiser, { capacity: 5 });
      await rsvp(event.id, attendee).expect(201);
      const [stranger] = await createUsersDirectly(app, 1);

      const response = await api(app)
        .get(`/api/v1/events/${event.id}/attendees`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('requires authentication', async () => {
      const event = await createEvent(app, organiser);
      await api(app).get(`/api/v1/events/${event.id}/attendees`).expect(401);
    });

    it('lists the waitlist separately, in queue order with positions', async () => {
      const event = await createEvent(app, organiser, { capacity: 1 });
      const [firstQueued, secondQueued] = await createUsersDirectly(app, 2);

      await rsvp(event.id, attendee).expect(201);
      await rsvp(event.id, firstQueued).expect(201);
      await rsvp(event.id, secondQueued).expect(201);

      const response = await api(app)
        .get(`/api/v1/events/${event.id}/attendees?status=WAITLISTED`)
        .set('Authorization', `Bearer ${organiser.token}`)
        .expect(200);

      const body = response.body as {
        data: { userId: string; waitlistPosition: number }[];
      };
      expect(body.data.map((row) => row.userId)).toEqual([
        firstQueued.id,
        secondQueued.id,
      ]);
      expect(body.data.map((row) => row.waitlistPosition)).toEqual([1, 2]);
    });

    it('excludes cancelled RSVPs and refuses to list them', async () => {
      const event = await createEvent(app, organiser, { capacity: 5 });
      await rsvp(event.id, attendee).expect(201);
      await cancel(event.id, attendee).expect(204);

      const response = await api(app)
        .get(`/api/v1/events/${event.id}/attendees`)
        .set('Authorization', `Bearer ${organiser.token}`)
        .expect(200);
      expect((response.body as { meta: { total: number } }).meta.total).toBe(0);

      await api(app)
        .get(`/api/v1/events/${event.id}/attendees?status=CANCELLED`)
        .set('Authorization', `Bearer ${organiser.token}`)
        .expect(400);
    });
  });
});
