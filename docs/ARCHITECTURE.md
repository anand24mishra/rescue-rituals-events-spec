# Architecture

## 1. Architecture choice

Use a **modular monolith**.

The application is intentionally a single NestJS service backed by PostgreSQL. This gives strong module boundaries without introducing distributed-system overhead that is not justified by the assignment.

```text
                   ┌─────────────────────┐
                   │ React / Web Client  │
                   └──────────┬──────────┘
                              │ HTTPS/JSON
                              v
                   ┌─────────────────────┐
                   │ NestJS API          │
                   │                     │
                   │ Auth                │
                   │ Events              │
                   │ RSVP                │
                   │ Health              │
                   │ Validation          │
                   │ Rate limiting       │
                   └──────────┬──────────┘
                              │
                              v
                   ┌─────────────────────┐
                   │ Prisma              │
                   │ ORM + transactions │
                   └──────────┬──────────┘
                              │
                              v
                   ┌─────────────────────┐
                   │ PostgreSQL          │
                   │                     │
                   │ users               │
                   │ events              │
                   │ rsvps               │
                   └─────────────────────┘
```

## 2. Module boundaries

### Auth module

Responsible for registration, credential verification, JWT creation, and authentication guards.

### Users module

Responsible for user lookup and safe user representations.

### Events module

Responsible for event lifecycle, event ownership, event listing/detail behavior, and event validation.

### RSVP module

Responsible for join/leave behavior, attendee count, capacity, and concurrency-sensitive transactions.

### Prisma module

Owns Prisma client lifecycle and database connectivity.

### Health module

Exposes service/database health information.

## 3. Request path

```text
HTTP request
  -> middleware/security
  -> JWT guard when required
  -> controller
  -> DTO validation
  -> service
  -> Prisma transaction/query
  -> PostgreSQL
  -> response DTO/serialization
```

Keep controllers thin.

Bad:

```text
controller
  -> JWT parsing
  -> SQL
  -> capacity logic
  -> JSON mapping
```

Preferred:

```text
controller
  -> eventsService.create(...)
```

and:

```text
rsvpController
  -> rsvpService.createRsvp(userId, eventId)
```

## 4. Authentication architecture

```text
POST /auth/login
      |
      v
verify email/password
      |
      v
sign JWT
      |
      v
client stores token
      |
      v
Authorization: Bearer <token>
      |
      v
JWT guard
      |
      v
request.user
```

JWT payload should contain a minimal stable identity, for example:

```json
{
  "sub": "user-uuid"
}
```

Avoid putting unnecessary profile or sensitive data in the token.

## 5. Authorization architecture

Event mutation authorization is object-level:

```text
JWT valid?
   |
   +-- no --> 401
   |
  yes
   |
load event
   |
   +-- not found --> 404
   |
compare event.createdById with request.user.id
   |
   +-- mismatch --> 403
   |
  match
   |
perform mutation
```

Do not trust an organizer ID in request JSON.

## 6. RSVP architecture

### Why the RSVP table exists

The relationship is many-to-many in the general case:

- one user can RSVP to many events
- one event can have many users

Therefore attendees are modeled as rows in `rsvps`, not as an array serialized into an event record.

### Concurrency-safe flow

```text
Request A ─┐
Request B ─┼─> NestJS ─> PostgreSQL
Request C ─┘
```

Inside PostgreSQL:

```text
BEGIN
SELECT event ... FOR UPDATE
CHECK current attendee count < capacity
CHECK no existing RSVP for user
INSERT RSVP
UPDATE attendee_count = attendee_count + 1
COMMIT
```

The event row is the serialization point for capacity changes. This prevents two concurrent requests from both observing the same available slot.

## 7. Why maintain attendeeCount

Fetching `COUNT(*)` from `rsvps` on every event list request is simple but may become expensive as the RSVP table grows and event lists become hot.

A denormalized `attendeeCount` gives constant-time event-card reads. The cost is that every RSVP and leave operation must update the counter in the same transaction.

This is acceptable because correctness is maintained transactionally.

## 8. Scaling path

Current:

```text
Load balancer / platform
       |
       +-- API instance 1
       +-- API instance 2
       +-- API instance N
                |
                v
           PostgreSQL
```

The API remains stateless, so horizontal scaling is straightforward.

Future, only when justified:

```text
                   ┌─────────────┐
                   │ Load balancer│
                   └──────┬──────┘
                          v
                   ┌─────────────┐
                   │ NestJS APIs │
                   └──────┬──────┘
                          |
             ┌────────────┼─────────────┐
             v            v             v
          Postgres      Redis         Queue
```

Redis could support distributed rate limiting/caching. A queue could handle non-critical asynchronous work such as notifications. PostgreSQL remains the source of truth for registration state.

## 9. Frontend architecture

Keep the frontend as a thin consumer of the API.

Suggested structure:

```text
frontend/
  src/
    api/
    auth/
    components/
    pages/
    hooks/
    types/
```

Do not duplicate business rules in the frontend. Frontend validation improves UX; the backend remains authoritative.

## 10. Failure boundaries

Expected errors should be converted to stable HTTP responses.

Examples:

```text
unique violation -> 409
missing event -> 404
invalid JWT -> 401
ownership mismatch -> 403
validation error -> 400
rate limit -> 429
```

Unexpected errors should be logged with enough context to debug them but should not leak internal details.


## 8. Company-context boundary

The public Rescue Rituals product includes multiple surfaces and actors, but this assignment implements only the Events slice. Future relationships to shelters, venues, pets, rewards, or messaging must remain extension points rather than speculative modules. See `docs/COMPANY_WEBSITE_RESEARCH.md` and `docs/DOMAIN_TRANSLATION.md`.

The service should therefore remain a **modular monolith with a narrow event domain**, not a simulated full Rescue Rituals backend.
