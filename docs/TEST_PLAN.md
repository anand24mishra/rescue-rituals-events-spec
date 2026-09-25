# Test Plan

## 1. Test philosophy

The assignment's highest-risk behavior is not basic CRUD. It is correctness at security and concurrency boundaries.

Prioritize tests that prove:

- identity is protected
- ownership is protected
- RSVP uniqueness is protected
- capacity is protected under concurrency

## 2. Unit tests

### Auth service

- register hashes password
- register rejects duplicate email
- login verifies credentials
- login rejects invalid password
- token generation contains expected minimal identity

### Events service

- creates event with authenticated creator
- rejects invalid time range
- rejects invalid capacity
- owner can update
- non-owner cannot update
- owner can delete
- missing event produces not-found behavior

### RSVP service

- user can RSVP once
- duplicate RSVP produces conflict
- full event produces conflict
- user can leave RSVP
- attendee count updates correctly

## 3. Integration tests

Use a real PostgreSQL test database for the transaction-sensitive flows if practical.

Do not rely exclusively on mocks for the concurrency path because mocks cannot prove database locking/constraint behavior.

## 4. E2E test sequence

```text
register user A
register user B
login user A
login user B

user A creates event
user A updates event -> 200
user B updates event -> 403

user A RSVP -> 201
user A RSVP again -> 409

user A leave RSVP -> 204
```

## 5. Concurrency test

Create an event with a small capacity, for example:

```text
capacity = 10
```

Create at least 50 authenticated users.

Send RSVP requests concurrently.

Expected:

```text
successful RSVPs <= 10
successful RSVPs == 10 if enough unique users and no unrelated failures
attendee_count == 10
rsvp row count == 10
no duplicate (event_id, user_id)
```

Then rerun the test multiple times to reduce the chance of a timing-dependent false positive.

## 6. Security tests

### Authentication

- missing token -> 401
- malformed token -> 401
- expired token -> 401

### Authorization

- user cannot edit another user's event
- user cannot delete another user's event
- request cannot override creator identity
- request cannot set another attendee's `userId`

### Input validation

- unknown payload field rejected
- malformed UUID rejected
- invalid date rejected
- end before start rejected
- negative capacity rejected

## 7. Abuse tests

- RSVP rate limit triggers under sustained repeated requests
- login rate limit if implemented
- large request bodies are rejected or constrained if practical

## 8. Smoke tests after deployment

From outside the deployment environment:

```text
GET /health
GET /docs
POST /auth/register
POST /auth/login
POST /events
GET /events
POST /events/:id/rsvp
POST /events/:id/rsvp -> expected conflict
```

## 9. Required CI gates

Pull request/commit should run:

```text
npm ci
npm run lint
npm run test
npm run test:e2e (or equivalent)
npm run build
```

Do not make deployment depend on tests that require unavailable external services unless the CI environment provides them.
