-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('ADOPTION_EVENT', 'RESCUE_FAIR', 'FOSTER_WORKSHOP', 'VOLUNTEER_EVENT', 'COMMUNITY_MEETUP', 'OTHER');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "rsvp_status" AS ENUM ('CONFIRMED', 'WAITLISTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "event_type" "event_type" NOT NULL DEFAULT 'OTHER',
    "status" "event_status" NOT NULL DEFAULT 'PUBLISHED',
    "location" VARCHAR(255) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" VARCHAR(64),
    "capacity" INTEGER,
    "confirmed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvps" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "rsvp_status" NOT NULL,
    "queued_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "scope" VARCHAR(160) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "events_starts_at_idx" ON "events"("starts_at");

-- CreateIndex
CREATE INDEX "events_created_by_id_idx" ON "events"("created_by_id");

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE INDEX "rsvps_event_id_status_queued_at_id_idx" ON "rsvps"("event_id", "status", "queued_at", "id");

-- CreateIndex
CREATE INDEX "rsvps_user_id_status_idx" ON "rsvps"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rsvps_event_id_user_id_key" ON "rsvps"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_id_scope_key_key" ON "idempotency_records"("user_id", "scope", "key");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Domain invariants (docs/DATA_MODEL.md §4).
--
-- These CHECK constraints are hand-written because the Prisma schema language
-- cannot express them. They are the last line of defence: DTO validation can
-- be bypassed by a direct database client, a bad migration, or a future bug in
-- the service layer, and these constraints cannot.
--
-- `prisma migrate dev` will not regenerate them — if you add a column that
-- participates in one of these rules, extend it in a new migration.
-- ---------------------------------------------------------------------------

-- An event must end after it starts. Zero-length and inverted ranges are both
-- rejected.
ALTER TABLE "events"
  ADD CONSTRAINT "events_ends_after_starts_check"
  CHECK ("ends_at" > "starts_at");

-- NULL capacity means unlimited; a stated capacity must be able to hold at
-- least one attendee.
ALTER TABLE "events"
  ADD CONSTRAINT "events_capacity_positive_check"
  CHECK ("capacity" IS NULL OR "capacity" > 0);

-- The denormalised counter can never go negative, which would indicate a
-- decrement without a matching confirmed rsvp.
ALTER TABLE "events"
  ADD CONSTRAINT "events_confirmed_count_non_negative_check"
  CHECK ("confirmed_count" >= 0);

-- The core oversubscription invariant. Even if the capacity decision in the
-- RSVP transaction were wrong, PostgreSQL would refuse the write: this is what
-- makes "capacity can never be exceeded" a guarantee rather than a hope.
ALTER TABLE "events"
  ADD CONSTRAINT "events_confirmed_count_within_capacity_check"
  CHECK ("capacity" IS NULL OR "confirmed_count" <= "capacity");

-- `queued_at` is the waitlist ordering key and must be present exactly when a
-- row is waitlisted, so queue ordering can never be non-deterministic.
ALTER TABLE "rsvps"
  ADD CONSTRAINT "rsvps_queued_at_matches_status_check"
  CHECK (
    ("status" = 'WAITLISTED' AND "queued_at" IS NOT NULL)
    OR ("status" <> 'WAITLISTED' AND "queued_at" IS NULL)
  );
