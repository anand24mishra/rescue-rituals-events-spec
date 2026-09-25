# Data Model

## 1. Modeling goal

Keep the assignment domain intentionally small while making it credible as an event/community module that could sit inside Rescue Rituals' broader public ecosystem.

Public context indicates users can participate in rescue-related experiences and that shelters, venues, adopters, fosters, and rescue teams are part of the broader product. This assignment does **not** implement those broader systems.

Core entities:

```text
User 1 ───── * Event
User 1 ───── * RSVP * ───── 1 Event
```

---

## 2. ER diagram

```text
+----------------+             +----------------------+
| users          |             | events               |
+----------------+  1       * +----------------------+
| id PK          |-------------| id PK                |
| name           |             | title                |
| email UNIQUE   |             | description          |
| password_hash  |             | event_type           |
| created_at     |             | status               |
| updated_at     |             | location             |
+-------+--------+             | starts_at            |
        |                      | ends_at              |
        | 1                    | timezone             |
        |                      | capacity             |
        | *                    | confirmed_count      |
        |                      | created_by_id FK     |
        |                      | created_at           |
        |                      | updated_at           |
        |                      +----------+-----------+
        |                                 |
        |                                 | 1
        |                                 |
        |                                 | *
        |                           +-----+------+
        +---------------------------| rsvps      |
                                    +------------+
                                    | id PK      |
                                    | event_id FK|
                                    | user_id FK |
                                    | status     |
                                    | position   |
                                    | created_at |
                                    | updated_at |
                                    | UNIQUE(event_id,user_id)
                                    +------------+
```

---

## 3. User

Suggested logical fields:

```text
id              UUID primary key
name            VARCHAR(100) not null
email           VARCHAR(255) not null unique
password_hash   TEXT not null
created_at      TIMESTAMPTZ not null
updated_at      TIMESTAMPTZ not null
```

### Email policy

At minimum:

```text
trim
↓
lowercase
↓
validate
↓
unique constraint
```

Do not pretend that lowercasing every internationalized email is universally correct; the take-home can adopt a simple normalization policy and document it.

---

## 4. Event

Suggested logical fields:

```text
id               UUID primary key
title            VARCHAR(160) not null
description      TEXT not null
event_type       ENUM/string optional
status           ENUM/string optional
location         VARCHAR(255) not null
starts_at        TIMESTAMPTZ not null
ends_at          TIMESTAMPTZ not null
timezone         VARCHAR(64) nullable
capacity         INTEGER nullable
confirmed_count  INTEGER not null default 0
created_by_id    UUID not null references users(id)
created_at       TIMESTAMPTZ not null
updated_at       TIMESTAMPTZ not null
```

### Suggested event type values

These are demo/domain assumptions, not official company taxonomy:

```text
ADOPTION_EVENT
RESCUE_FAIR
FOSTER_WORKSHOP
VOLUNTEER_EVENT
COMMUNITY_MEETUP
OTHER
```

### Suggested event status values

```text
DRAFT
PUBLISHED
CANCELLED
COMPLETED
```

Keep the initial implementation simple. If status adds more code than value, use a smaller state model and document why.

### Core invariants

```text
ends_at > starts_at
capacity IS NULL OR capacity > 0
confirmed_count >= 0
confirmed_count <= capacity when capacity is not null
created_by_id refers to an existing user
```

`confirmed_count` is not independently authoritative. PostgreSQL RSVPs remain the source of truth for membership; the materialized count exists to make event reads efficient and must be updated transactionally.

---

## 5. RSVP

Suggested logical fields:

```text
id          UUID primary key
event_id    UUID not null references events(id)
user_id     UUID not null references users(id)
status      ENUM not null
position    INTEGER nullable
created_at  TIMESTAMPTZ not null
updated_at  TIMESTAMPTZ not null
```

Suggested status values:

```text
CONFIRMED
WAITLISTED
CANCELLED
```

`position` is used for waitlist ordering when waitlisting is enabled. For `CONFIRMED`/`CANCELLED`, it should be null unless a stronger reason exists.

Critical invariant:

```text
UNIQUE(event_id, user_id)
```

This guarantees one current RSVP record per user/event relationship. Re-joining after cancellation should be handled as an explicit state transition or controlled recreation policy; do not create duplicate active rows accidentally.

---

## 6. RSVP state machine

Recommended P1/P2 behavior:

```text
                  +----------------+
       RSVP ----> |   CONFIRMED    |
                  +----------------+
                    |            ^
                    | cancel     | promote
                    v            |
              +-----------+      |
              | CANCELLED |      |
              +-----------+      |
                                 |
                  +----------------+
                  |  WAITLISTED     |
                  +----------------+
```

Actual transition rules:

```text
available capacity
    → CONFIRMED

full capacity
    → WAITLISTED       (if waitlist enabled)

confirmed user leaves
    → CANCELLED

capacity becomes available
    → earliest WAITLISTED promoted to CONFIRMED
```

Promotion must be deterministic and transactional.

Recommended ordering:

```text
created_at ASC, id ASC
```

The `id` tie-breaker prevents nondeterministic ordering when timestamps collide.

---

## 7. Foreign-key behavior

Recommended:

- event -> RSVP: `ON DELETE CASCADE` only if the application truly supports hard event deletion
- user deletion: block or use an explicit anonymization/deactivation policy

If the implementation later moves toward event archival/cancellation instead of hard deletion, reassess the delete behavior.

---

## 8. Index strategy

Start with:

```text
users(email) UNIQUE

events(starts_at)
events(created_by_id)
events(status, starts_at)    if status filtering is frequent

rsvps(event_id)
rsvps(user_id)
UNIQUE(event_id, user_id)
```

If waitlisting is implemented and promotion queries are hot, consider an index shaped around the actual query, for example:

```text
rsvps(event_id, status, created_at, id)
```

Do not add every conceivable index. Explain indexes through access patterns.

---

## 9. Concurrency and count integrity

For a capacity-sensitive RSVP:

```text
BEGIN
  lock target event row
  inspect current capacity/count
  inspect current user/event membership
  choose CONFIRMED or WAITLISTED
  insert/update RSVP
  update confirmed_count if necessary
COMMIT
```

The transaction must be the serialization boundary for the shared event-capacity invariant.

At the same time, the unique RSVP constraint remains the database-level protection against duplicate membership.

---

## 10. Time handling

Store timestamps with timezone semantics, preferably `TIMESTAMPTZ` in PostgreSQL.

API input/output should use ISO 8601.

Example:

```text
2026-10-10T14:00:00Z
```

If `timezone` is included as an explicit event field, use an IANA timezone such as:

```text
America/New_York
```

Do not implement custom timezone conversion logic unless required. Let a well-tested date/time library handle parsing/formatting.

---

## 11. Migration policy

Schema changes must be represented by migrations.

Local development:

```bash
npx prisma migrate dev
```

Production:

```bash
npx prisma migrate deploy
```

Do not use production `db push` as the normal deployment mechanism.
