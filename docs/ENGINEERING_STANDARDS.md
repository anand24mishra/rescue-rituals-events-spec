# Engineering Standards

## 1. TypeScript

- strict TypeScript mode
- avoid `any` unless justified and isolated
- prefer explicit domain types for service inputs/outputs
- keep DTOs separate from persistence models
- use `unknown` and narrow it rather than trusting unchecked values

## 2. NestJS

Use Nest's intended architecture:

```text
Controller = HTTP adapter
Service = business logic
Guard = authentication/authorization boundary
DTO = external input contract
Repository/data access = persistence interaction
Module = dependency boundary
```

Do not put database transactions directly in controllers.

## 3. Validation

Use strict boundary validation.

Recommended global settings:

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

Adjust only if there is a documented reason.

## 4. API versioning

Use `/api/v1` from day one. This makes future breaking changes easier to explain.

## 5. Naming

TypeScript:

```text
camelCase
PascalCase for classes/types
```

Database:

```text
snake_case
```

API JSON:

```text
camelCase
```

Keep these mappings explicit.

## 6. Errors

Prefer typed application errors or Nest exceptions that map cleanly to stable API codes.

Avoid:

```text
throw new Error('something went wrong')
```

for expected business conflicts.

## 7. Logging

Use structured logs where practical.

Log useful metadata:

```text
requestId
route
method
statusCode
durationMs
errorCode
```

Never log:

```text
password
passwordHash
JWT
DATABASE_URL
secret keys
```

## 8. Security

At minimum:

- password hashing
- JWT validation
- object-level authorization
- strict DTO validation
- rate limiting
- CORS configured explicitly
- secure headers where practical
- production secrets from environment variables

## 9. Database

Use migrations.

Prefer database constraints for invariants.

Use transactions whenever multiple writes must behave atomically.

## 10. Query discipline

Before adding an index, explain the query/access pattern it supports.

Avoid N+1 queries.

Select only fields needed by each API response where practical.

Do not eagerly load full attendee records for event lists.

## 11. Testing

Tests should answer questions like:

```text
Can a duplicate RSVP happen?
Can a non-owner edit an event?
Can concurrent requests exceed capacity?
```

rather than simply checking line coverage.

## 12. Comments

Comment business decisions and non-obvious concurrency behavior.

Do not comment every line.

A useful comment:

```ts
// Lock the event row so concurrent RSVPs serialize around the capacity check.
```

A poor comment:

```ts
// Increment count by one
count += 1;
```

## 13. Git

Use focused commits when practical:

```text
feat(auth): add JWT authentication
feat(events): add event CRUD
feat(rsvp): add capacity-safe RSVP flow
test(rsvp): add concurrency coverage
docs: add API and architecture documentation
```

Do not commit generated build artifacts or secrets.

## 14. Dependencies

Every dependency should have a reason.

Before adding a new package, ask:

- does Nest/TypeScript/PostgreSQL already solve this?
- does it materially improve reliability or readability?
- does it increase deployment complexity?

## 15. Definition of production-minded

Production-minded does not mean “maximally complex.” It means:

- predictable behavior
- explicit invariants
- useful errors
- observable failures
- reproducible setup
- secure boundaries
- tested critical paths
- documented assumptions
