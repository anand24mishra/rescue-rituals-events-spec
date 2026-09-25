# Security Review

## Threat model

Assume clients can:

- call the API without using the frontend
- alter JSON payloads
- replay requests
- send concurrent requests
- guess public IDs
- attempt actions against another user's resources

The backend must remain correct under these conditions.

## Authentication

JWT authentication protects state-changing endpoints.

Passwords are never stored in plaintext.

Tokens should be short-lived enough for the product context and should not contain unnecessary sensitive data.

## Authorization

Authorization occurs at the object level for event mutation.

Example:

```text
JWT user = U1
Event owner = U2
PATCH /events/E1
=> 403
```

A valid token does not imply permission to mutate arbitrary event IDs.

## Mass assignment protection

The backend must explicitly control mutable event fields.

A malicious request such as:

```json
{
  "title": "Legitimate title",
  "createdById": "someone-else",
  "attendeeCount": 999999
}
```

must not be able to modify protected fields.

## Password storage

Preferred: Argon2id.

Acceptable alternative: bcrypt with a suitable cost factor.

## Input validation

Reject unknown properties and invalid values at the API boundary.

Validation does not replace DB constraints.

## Rate limiting

Protect especially:

- login
- registration
- RSVP

Exact limits should be documented and tuned for demo usability.

## CORS

Allow only known origins in production.

## Secrets

Production secret values are managed by the hosting platform.

Repository contains:

```text
.env.example
```

but not:

```text
.env
production.env
real database credentials
```

## Data minimization

Attendee endpoints should return only the information required by the product. Do not expose emails by default.

## Error handling

Expected client errors should be explicit and safe.

Unexpected server errors should be logged internally, while the client receives a generic safe response.

## Future security work

For a production consumer platform, consider:

- refresh-token strategy or secure cookie-based sessions
- account verification
- password reset
- abuse detection
- CAPTCHA/risk checks
- audit trails
- distributed rate limiting
- secret rotation
- automated dependency scanning
- centralized security monitoring
