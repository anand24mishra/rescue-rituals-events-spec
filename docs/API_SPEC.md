# API Specification

## 1. API principles

The API is designed for a consumer/mobile-friendly product while remaining easy for a reviewer to test through Swagger.

Base path:

```text
/api/v1
```

Local:

```text
http://localhost:3000/api/v1
```

Production placeholder:

```text
https://<deployed-api>/api/v1
```

Swagger UI:

```text
https://<deployed-api>/docs
```

---

## 2. Authentication

Protected routes use JWT bearer authentication.

```http
Authorization: Bearer <JWT>
```

The JWT subject should be the stable user identifier (`sub`).

Never accept `userId` from the request body when the identity can be derived from the JWT.

---

## 3. Auth endpoints

### POST /auth/register

Creates a user.

Request:

```json
{
  "name": "Anand Mishra",
  "email": "anand@example.com",
  "password": "strong-password"
}
```

Response `201`:

```json
{
  "user": {
    "id": "uuid",
    "name": "Anand Mishra",
    "email": "anand@example.com"
  },
  "accessToken": "jwt"
}
```

### POST /auth/login

Request:

```json
{
  "email": "anand@example.com",
  "password": "strong-password"
}
```

Response `200`:

```json
{
  "user": {
    "id": "uuid",
    "name": "Anand Mishra",
    "email": "anand@example.com"
  },
  "accessToken": "jwt"
}
```

### GET /auth/me

Protected.

Returns the safe authenticated-user representation.

---

## 4. Event endpoints

### GET /events

Public.

Query parameters:

```text
page        integer, default 1
limit       integer, default 20, capped
upcoming    boolean, default true
location    optional string
status      optional string
category    optional event type
```

Response:

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Brooklyn Rescue Adoption Fair",
      "description": "...",
      "eventType": "ADOPTION_EVENT",
      "status": "PUBLISHED",
      "location": "Brooklyn, NY",
      "startsAt": "2026-10-10T14:00:00Z",
      "endsAt": "2026-10-10T18:00:00Z",
      "timezone": "America/New_York",
      "capacity": 150,
      "confirmedCount": 71
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Sort deterministically:

```text
startsAt ASC, id ASC
```

### GET /events/:id

Public.

Returns complete public event representation plus current attendance summary.

### POST /events

Protected.

The server derives `createdById` from the authenticated user.

Example request:

```json
{
  "title": "Foster Orientation Workshop",
  "description": "Learn how to prepare for a first foster placement.",
  "eventType": "FOSTER_WORKSHOP",
  "location": "Manhattan, NY",
  "startsAt": "2026-10-12T15:00:00Z",
  "endsAt": "2026-10-12T17:00:00Z",
  "timezone": "America/New_York",
  "capacity": 50
}
```

The client must not set:

```text
createdById
confirmedCount
createdAt
updatedAt
```

### PATCH /events/:id

Protected + owner authorized.

Mutable fields may include:

```text
title
description
eventType
location
startsAt
endsAt
timezone
capacity
status              (only if product rule allows organizer changes)
```

Never allow direct mutation of:

```text
id
createdById
confirmedCount
createdAt
```

If decreasing capacity below current confirmed attendance is disallowed, return a clear conflict rather than silently ejecting attendees.

### DELETE /events/:id

Protected + owner authorized.

Recommended response:

```text
204 No Content
```

Consider using `CANCELLED` rather than hard delete if preserving event history becomes a real requirement.

---

## 5. RSVP / attendance endpoints

### POST /events/:id/rsvp

Protected.

Request body:

```json
{}
```

Do not require `userId` in the request.

Recommended response `201`:

```json
{
  "eventId": "uuid",
  "userId": "uuid",
  "status": "CONFIRMED",
  "confirmedCount": 100,
  "capacity": 100,
  "waitlistPosition": null,
  "createdAt": "2026-10-01T12:00:00Z"
}
```

When full and waitlisting is enabled:

```json
{
  "eventId": "uuid",
  "userId": "uuid",
  "status": "WAITLISTED",
  "confirmedCount": 100,
  "capacity": 100,
  "waitlistPosition": 14,
  "createdAt": "2026-10-01T12:00:00Z"
}
```

Possible errors:

```text
401 unauthenticated
404 event missing
409 already RSVP'd
409 event unavailable/full when waitlist is disabled
429 rate limited
```

### DELETE /events/:id/rsvp

Protected.

Cancels the authenticated user's active RSVP.

Response `204` on successful cancellation.

If the RSVP was confirmed and waitlist is enabled, promotion of the next eligible waitlisted participant occurs inside the same transaction.

Recommended response for no current RSVP:

```text
404 Not Found
```

### GET /events/:id/attendees

Protected.

Return only necessary safe attendee information.

Example:

```json
{
  "data": [
    {
      "userId": "uuid",
      "name": "Anand Mishra",
      "status": "CONFIRMED",
      "rsvpedAt": "2026-10-01T12:00:00Z"
    }
  ]
}
```

Do not expose attendee email/phone/password/profile data by default.

If the reviewer only needs confirmation counts, keep the public event representation count-based instead of exposing a full attendee list.

---

## 6. Optional idempotency

The RSVP route may accept:

```http
Idempotency-Key: <opaque-client-generated-key>
```

If implemented, idempotency scope should include the authenticated user and operation, and the server should persist enough information to return the same logical result for a safe retry.

This is a P2 reliability enhancement, not a replacement for the transaction/unique-constraint design.

---

## 7. Health

### GET /health

Example:

```json
{
  "status": "ok",
  "database": "up"
}
```

If a required dependency is unavailable, return a non-success health response appropriate for the deployment platform.

---

## 8. Error envelope

Use predictable structured errors:

```json
{
  "statusCode": 409,
  "code": "RSVP_ALREADY_EXISTS",
  "message": "You have already RSVP'd to this event",
  "path": "/api/v1/events/uuid/rsvp",
  "timestamp": "2026-10-01T12:00:00.000Z"
}
```

Validation errors should identify fields without leaking SQL, stack traces, or internal implementation details.

---

## 9. OpenAPI / Swagger requirements

Swagger must document:

- every route
- request bodies
- response schemas
- query/path parameters
- bearer authentication
- status codes
- representative examples
- RSVP conflict states

The deployed Swagger page must be usable for the live demo.
