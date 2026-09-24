/**
 * Demo data for local development and for the reviewer walkthrough.
 *
 * Deterministic in two senses:
 *
 *  - Fixed UUIDs plus `upsert`, so running it twice produces the same database
 *    rather than a second copy of everything.
 *  - Dates computed relative to *now*, so the seeded events are always in the
 *    future. Hard-coded dates would quietly fall out of the `upcoming=true`
 *    feed after the date passed, and the demo would appear to return nothing.
 *
 * All records are fictional. They are rescue-themed because the assignment's
 * public product context is, but they do not represent real Rescue Rituals
 * events, venues or people.
 */
import {
  EventStatus,
  EventType,
  PrismaClient,
  RsvpStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/** Shared across the demo accounts, and printed at the end. Local use only. */
const DEMO_PASSWORD = 'rescue-rituals-demo-2026';

const USERS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Asha Organiser',
    email: 'organiser@example.com',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Ben Attendee',
    email: 'attendee@example.com',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Cleo Volunteer',
    email: 'volunteer@example.com',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Dev Foster',
    email: 'foster@example.com',
  },
] as const;

const hoursFromNow = (hours: number): Date =>
  new Date(Date.now() + hours * 60 * 60 * 1000);

const EVENTS = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    title: 'Brooklyn Rescue Adoption Fair',
    description:
      'Meet adoptable dogs and cats from five partner rescues. Adoption ' +
      'counsellors on site all afternoon to talk through home checks and ' +
      'first-week preparation.',
    eventType: EventType.ADOPTION_EVENT,
    status: EventStatus.PUBLISHED,
    location: 'Brooklyn, NY',
    startsAt: hoursFromNow(72),
    endsAt: hoursFromNow(78),
    timezone: 'America/New_York',
    capacity: 150,
    waitlistEnabled: true,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    title: 'Foster Orientation Workshop',
    description:
      'A two-hour introduction for prospective fosters: what the first ' +
      'placement actually involves, what the rescue covers, and how to decide ' +
      'whether now is the right time.',
    eventType: EventType.FOSTER_WORKSHOP,
    status: EventStatus.PUBLISHED,
    location: 'Manhattan, NY',
    startsAt: hoursFromNow(120),
    endsAt: hoursFromNow(122),
    // Small capacity on purpose: this is the event to demonstrate the
    // capacity and waitlist behaviour against.
    capacity: 3,
    timezone: 'America/New_York',
    waitlistEnabled: true,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000003',
    title: 'Community Dog Walk & Meet-Up',
    description:
      'A relaxed group walk along the park loop for adopters, fosters and ' +
      'anyone considering either. Dogs optional, conversation guaranteed.',
    eventType: EventType.COMMUNITY_MEETUP,
    status: EventStatus.PUBLISHED,
    location: 'Queens, NY',
    startsAt: hoursFromNow(48),
    endsAt: hoursFromNow(50),
    timezone: 'America/New_York',
    // No capacity: demonstrates the unlimited path.
    capacity: null,
    waitlistEnabled: true,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000004',
    title: 'Rescue Volunteer Training',
    description:
      'Required session for new volunteers covering intake handling, ' +
      'transport runs, and what to do when an animal arrives in poor ' +
      'condition.',
    eventType: EventType.VOLUNTEER_EVENT,
    status: EventStatus.PUBLISHED,
    location: 'Jersey City, NJ',
    startsAt: hoursFromNow(200),
    endsAt: hoursFromNow(204),
    timezone: 'America/New_York',
    // Waitlist off: this is the event that returns 409 EVENT_AT_CAPACITY when
    // full, so both capacity behaviours are demonstrable from seed data.
    capacity: 2,
    waitlistEnabled: false,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000005',
    title: 'Adoption Café Weekend',
    description:
      'A weekend pop-up in a partner café: cats in the lounge, paperwork at ' +
      'the counter, pastries for the humans.',
    eventType: EventType.RESCUE_FAIR,
    status: EventStatus.PUBLISHED,
    location: 'Brooklyn, NY',
    startsAt: hoursFromNow(300),
    endsAt: hoursFromNow(310),
    timezone: 'America/New_York',
    capacity: 40,
    waitlistEnabled: true,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000006',
    title: 'Winter Shelter Supply Drive (draft)',
    description:
      'Not yet announced. Included in the seed so the DRAFT visibility rule ' +
      'can be demonstrated: only the organiser can see this one.',
    eventType: EventType.OTHER,
    status: EventStatus.DRAFT,
    location: 'Bronx, NY',
    startsAt: hoursFromNow(400),
    endsAt: hoursFromNow(408),
    timezone: 'America/New_York',
    capacity: null,
    waitlistEnabled: true,
  },
] as const;

async function main(): Promise<void> {
  console.log('Seeding demo data…');

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { name: user.name, email: user.email, passwordHash },
      create: { ...user, passwordHash },
    });
  }
  console.log(`  ${USERS.length} users`);

  const [organiser] = USERS;

  for (const event of EVENTS) {
    await prisma.event.upsert({
      where: { id: event.id },
      // `confirmedCount` is deliberately not written here. It is reset below
      // from the RSVP rows that actually exist, so the seed can never leave the
      // counter disagreeing with the membership it is supposed to summarise.
      update: { ...event, createdById: organiser.id },
      create: { ...event, createdById: organiser.id },
    });
  }
  console.log(`  ${EVENTS.length} events`);

  // A couple of RSVPs so the demo starts with a non-empty attendee list.
  const seededRsvps = [
    {
      eventId: EVENTS[1].id,
      userId: USERS[1].id,
      status: RsvpStatus.CONFIRMED,
    },
    {
      eventId: EVENTS[1].id,
      userId: USERS[2].id,
      status: RsvpStatus.CONFIRMED,
    },
    {
      eventId: EVENTS[0].id,
      userId: USERS[3].id,
      status: RsvpStatus.CONFIRMED,
    },
  ];

  for (const rsvp of seededRsvps) {
    await prisma.rsvp.upsert({
      where: {
        eventId_userId: { eventId: rsvp.eventId, userId: rsvp.userId },
      },
      update: { status: rsvp.status, queuedAt: null },
      create: { ...rsvp, queuedAt: null },
    });
  }
  console.log(`  ${seededRsvps.length} RSVPs`);

  await reconcileConfirmedCounts();

  console.log('\nDemo accounts (local/demo use only):');
  for (const user of USERS) {
    console.log(`  ${user.email}  /  ${DEMO_PASSWORD}`);
  }
  console.log(
    '\nThe 3-place "Foster Orientation Workshop" is the event to try ' +
      'capacity and waitlist behaviour against.',
  );
  console.log(
    'The 2-place "Rescue Volunteer Training" has the waitlist disabled, so ' +
      'filling it returns 409 EVENT_AT_CAPACITY.',
  );
}

/**
 * Recomputes every event's `confirmedCount` from its RSVP rows.
 *
 * The counter is denormalised, so a seed that sets it by hand can drift. This
 * derives it from the source of truth instead, which also means the seed can be
 * re-run after manual poking without leaving the database inconsistent.
 */
async function reconcileConfirmedCounts(): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "events" e
    SET "confirmed_count" = COALESCE(counted.total, 0)
    FROM (
      SELECT ev."id" AS event_id,
             COUNT(r."id") FILTER (WHERE r."status" = 'CONFIRMED') AS total
      FROM "events" ev
      LEFT JOIN "rsvps" r ON r."event_id" = ev."id"
      GROUP BY ev."id"
    ) AS counted
    WHERE e."id" = counted.event_id
  `;
  console.log('  confirmed counts reconciled from RSVP rows');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
