# Rescue Rituals — Events Platform

A full-stack events and RSVP management platform built with NestJS, PostgreSQL, Prisma, and React. Designed for community rescue organizations to create, manage, and track attendance for adoption fairs, foster workshops, volunteer events, and community meetups.

## Tech Stack

**Backend:** NestJS · TypeScript · Prisma ORM · PostgreSQL · JWT Auth · Swagger  
**Frontend:** React · Vite · TypeScript · React Router

## Features

- JWT authentication (register, login, session management)
- Event CRUD with owner-based authorization
- Concurrency-safe RSVP with `SELECT ... FOR UPDATE` row locking
- Capacity enforcement with optional waitlist
- Idempotent RSVP via `Idempotency-Key` header
- Paginated event listing with filtering and sorting
- Attendee tracking with denormalized counts
- Rate limiting (global, auth, RSVP-specific tiers)
- Health check endpoint
- Swagger/OpenAPI documentation
- Seed data with realistic rescue-themed events

## Prerequisites

- Node.js ≥ 20.11
- PostgreSQL 14+

## Getting Started

```bash
# Clone and install
git clone https://github.com/anand24mishra/rescue-rituals-events-spec.git
cd rescue-rituals-events-spec
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Run migrations and seed
npx prisma migrate deploy
npm run db:seed

# Start the API
npm run start:dev
```

The API runs at `http://localhost:3000`. Swagger docs are at `http://localhost:3000/docs`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend runs at `http://localhost:5173`.

## Testing

```bash
# Unit tests
npm test

# E2E tests (requires a separate test database)
cp .env.test.example .env.test
npm run test:e2e
```

## Project Structure

```
src/
  auth/           # JWT authentication, guards, strategies
  users/          # User management
  events/         # Event CRUD, filtering, pagination
  rsvp/           # RSVP with capacity enforcement + waitlist
  health/         # Readiness/liveness checks
  prisma/         # Prisma service and module
  common/         # Shared decorators, filters, pipes
  config/         # App configuration

frontend/
  src/
    api/          # API client
    auth/         # Auth context and hooks
    components/   # Reusable UI components
    pages/        # Route pages
    styles/       # CSS

prisma/
  schema.prisma   # Database schema
  migrations/     # Migration history
  seed.ts         # Demo data

test/             # E2E test suites
docs/             # Architecture, API spec, data model, decisions
```

## RSVP Concurrency Model

The RSVP endpoint uses a PostgreSQL transaction with row-level locking to prevent oversubscription:

1. `BEGIN TRANSACTION`
2. Lock the event row with `FOR UPDATE`
3. Check capacity against confirmed count
4. Verify no existing RSVP for the user
5. Insert RSVP + increment counter atomically
6. `COMMIT`

A `UNIQUE(event_id, user_id)` constraint acts as the final guard against duplicate RSVPs.

## Environment Variables

See [`.env.example`](.env.example) for all available configuration options.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System architecture
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — Database schema and invariants
- [`docs/API_SPEC.md`](docs/API_SPEC.md) — HTTP API contract
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — Key technical decisions
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Deployment guide
- [`docs/SECURITY.md`](docs/SECURITY.md) — Security considerations
- [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) — Test coverage strategy

## License

UNLICENSED — Take-home assignment submission.
