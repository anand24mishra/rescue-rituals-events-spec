import type { INestApplication } from '@nestjs/common';
import { RsvpStatus } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  api,
  createEvent,
  createTestApp,
  createUsersDirectly,
  registerUser,
  type TestUser,
} from './helpers/test-app';

/**
 * The proof that capacity holds under concurrency.
 *
 * This is the test the whole RSVP design exists for, so it asserts against the
 * *database* rather than against HTTP response counts. Counting 201s would pass
 * even if the responses were lies; counting rows cannot.
 */
describe('RSVP concurrency (e2e)', () => {
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

  /**
   * Fires every request in one tick so they genuinely overlap. Sequential
   * requests would pass against a naive count-then-insert implementation and
   * prove nothing.
   */
  const rsvpAllAtOnce = async (
    eventId: string,
    users: TestUser[],
  ): Promise<number[]> =>
    Promise.all(
      users.map(async (user): Promise<number> => {
        const response = await api(app)
          .post(`/api/v1/events/${eventId}/rsvp`)
          .set('Authorization', `Bearer ${user.token}`);
        return response.status;
      }),
    );

  /**
   * Contenders are created directly rather than through `POST /auth/register`.
   * Sixty registrations would (correctly) hit the registration rate limit, and
   * the Argon2 hashing would dominate a test whose subject is the RSVP
   * transaction, not sign-up.
   */
  const registerMany = (count: number): Promise<TestUser[]> =>
    createUsersDirectly(app, count);

  it('never confirms more attendees than capacity, with a waitlist absorbing the rest', async () => {
    const CAPACITY = 10;
    const CONTENDERS = 60;

    const organiser = await registerUser(app);
    const event = await createEvent(app, organiser, {
      title: 'Concurrency Proof — Waitlist Enabled',
      capacity: CAPACITY,
    });

    const contenders = await registerMany(CONTENDERS);
    const statuses = await rsvpAllAtOnce(event.id, contenders);

    // Every request must get a definite answer. A 5xx here would mean the
    // implementation fell over under contention rather than serialising.
    expect(statuses.every((status: number) => status === 201)).toBe(true);

    const [confirmed, waitlisted, cancelled, stored] = await Promise.all([
      prisma.rsvp.count({
        where: { eventId: event.id, status: RsvpStatus.CONFIRMED },
      }),
      prisma.rsvp.count({
        where: { eventId: event.id, status: RsvpStatus.WAITLISTED },
      }),
      prisma.rsvp.count({
        where: { eventId: event.id, status: RsvpStatus.CANCELLED },
      }),
      prisma.event.findUniqueOrThrow({ where: { id: event.id } }),
    ]);

    expect(confirmed).toBe(CAPACITY);
    expect(waitlisted).toBe(CONTENDERS - CAPACITY);
    expect(cancelled).toBe(0);

    // The denormalised counter must agree exactly with the rows it summarises.
    expect(stored.confirmedCount).toBe(CAPACITY);

    // One row per user, no duplicates — the unique index held.
    const totalRows = await prisma.rsvp.count({ where: { eventId: event.id } });
    expect(totalRows).toBe(CONTENDERS);

    // Every queued row must carry a queue key — the CHECK constraint enforces
    // this, so a violation here means the constraint was dropped.
    const missingQueueKey = await prisma.rsvp.count({
      where: {
        eventId: event.id,
        status: RsvpStatus.WAITLISTED,
        queuedAt: null,
      },
    });
    expect(missingQueueKey).toBe(0);

    // Positions reported by the API must be a contiguous 1..N over the queue,
    // which is what makes it fair rather than merely ordered. Checked through
    // the API so the reported number, not just the stored order, is verified.
    const queue = await prisma.rsvp.findMany({
      where: { eventId: event.id, status: RsvpStatus.WAITLISTED },
      orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
      select: { userId: true },
    });

    const reported = await Promise.all(
      queue.map(async (row) => {
        const user = contenders.find(
          (candidate) => candidate.id === row.userId,
        );
        const response = await api(app)
          .get(`/api/v1/events/${event.id}`)
          .set('Authorization', `Bearer ${user?.token ?? ''}`)
          .expect(200);
        return (response.body as { viewerRsvp: { waitlistPosition: number } })
          .viewerRsvp.waitlistPosition;
      }),
    );

    expect(reported).toEqual(
      Array.from({ length: CONTENDERS - CAPACITY }, (_, index) => index + 1),
    );
  });

  it('rejects the overflow with 409 when the organiser disabled the waitlist', async () => {
    const CAPACITY = 5;
    const CONTENDERS = 40;

    const organiser = await registerUser(app);
    const event = await createEvent(app, organiser, {
      title: 'Concurrency Proof — No Waitlist',
      capacity: CAPACITY,
      waitlistEnabled: false,
    });

    const contenders = await registerMany(CONTENDERS);
    const statuses = await rsvpAllAtOnce(event.id, contenders);

    const created = statuses.filter((status: number) => status === 201).length;
    const conflicts = statuses.filter(
      (status: number) => status === 409,
    ).length;

    expect(created).toBe(CAPACITY);
    expect(conflicts).toBe(CONTENDERS - CAPACITY);
    // No request may fail for any other reason — in particular, no 500s and no
    // timeouts dressed up as 503s.
    expect(created + conflicts).toBe(CONTENDERS);

    const stored = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    const confirmed = await prisma.rsvp.count({
      where: { eventId: event.id, status: RsvpStatus.CONFIRMED },
    });

    expect(confirmed).toBe(CAPACITY);
    expect(stored.confirmedCount).toBe(CAPACITY);
  });

  it('keeps the counter correct when RSVPs and cancellations race each other', async () => {
    const CAPACITY = 8;
    const organiser = await registerUser(app);
    const event = await createEvent(app, organiser, {
      title: 'Concurrency Proof — Mixed Traffic',
      capacity: CAPACITY,
    });

    const users = await registerMany(24);

    // Fill the event and build a queue behind it.
    await rsvpAllAtOnce(event.id, users);

    const confirmedBefore = await prisma.rsvp.findMany({
      where: { eventId: event.id, status: RsvpStatus.CONFIRMED },
      select: { userId: true },
    });
    const confirmedUsers = users.filter((user) =>
      confirmedBefore.some((row) => row.userId === user.id),
    );

    // Half the confirmed attendees leave simultaneously. Each departure must
    // promote exactly one queued person, so the confirmed total should not move.
    const leavers = confirmedUsers.slice(0, CAPACITY / 2);
    await Promise.all(
      leavers.map((user) =>
        api(app)
          .delete(`/api/v1/events/${event.id}/rsvp`)
          .set('Authorization', `Bearer ${user.token}`)
          .expect(204),
      ),
    );

    const [confirmed, stored] = await Promise.all([
      prisma.rsvp.count({
        where: { eventId: event.id, status: RsvpStatus.CONFIRMED },
      }),
      prisma.event.findUniqueOrThrow({ where: { id: event.id } }),
    ]);

    expect(confirmed).toBe(CAPACITY);
    expect(stored.confirmedCount).toBe(CAPACITY);
    expect(stored.confirmedCount).toBeLessThanOrEqual(CAPACITY);

    // Everyone who left is CANCELLED, and nobody holds two states at once.
    const leaverRows = await prisma.rsvp.findMany({
      where: { eventId: event.id, userId: { in: leavers.map((u) => u.id) } },
    });
    expect(leaverRows).toHaveLength(leavers.length);
    expect(leaverRows.every((row) => row.status === RsvpStatus.CANCELLED)).toBe(
      true,
    );
  });

  it('treats a retried request with the same Idempotency-Key as one RSVP', async () => {
    const organiser = await registerUser(app);
    const event = await createEvent(app, organiser, { capacity: 5 });
    const user = await registerUser(app);
    const key = 'retry-key-abc-123';

    // Ten concurrent attempts with one key: the classic "client retried after a
    // timeout, several times" scenario.
    const responses = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const response = await api(app)
          .post(`/api/v1/events/${event.id}/rsvp`)
          .set('Authorization', `Bearer ${user.token}`)
          .set('Idempotency-Key', key);
        return { status: response.status, body: response.body as unknown };
      }),
    );

    // Every attempt reports the same successful outcome; none reports a
    // spurious conflict for an operation that did in fact succeed.
    expect(responses.every((response) => response.status === 201)).toBe(true);

    // Compared as parsed objects, not as JSON text: a replayed body round-trips
    // through a jsonb column, which does not preserve key order. The contract is
    // that the outcome is the same, not that the bytes are.
    const [first, ...rest] = responses.map((response) => response.body);
    for (const body of rest) {
      expect(body).toEqual(first);
    }

    const rows = await prisma.rsvp.count({ where: { eventId: event.id } });
    const stored = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });

    expect(rows).toBe(1);
    expect(stored.confirmedCount).toBe(1);

    const records = await prisma.idempotencyRecord.count({
      where: { userId: user.id },
    });
    expect(records).toBe(1);
  });
});
