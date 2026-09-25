# Deployment Plan

## 1. Target deployment

Recommended:

```text
Railway
  ├── API service
  └── PostgreSQL service
```

Railway currently supports provisioning PostgreSQL in a project and exposes connection variables including `DATABASE_URL`. Railway services can also deploy from a connected GitHub repository and support pre-deploy commands, which is useful for migrations.

## 2. Production environment variables

Required:

```text
DATABASE_URL
JWT_SECRET
JWT_EXPIRES_IN
PORT
CORS_ORIGIN
NODE_ENV
```

Optional:

```text
LOG_LEVEL
THROTTLE_LIMIT
THROTTLE_TTL
```

Never put production values in source control.

## 3. Build

The production image/process should:

1. install dependencies
2. generate Prisma client
3. build NestJS
4. run migrations in the deployment phase
5. start the compiled application

Typical commands:

```bash
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
npm run start:prod
```

Exact command placement depends on the platform.

## 4. Railway service settings

Recommended:

```text
Source: GitHub repository
Build: Dockerfile or Railpack
Pre-deploy: npx prisma migrate deploy
Start: npm run start:prod
Healthcheck: /health
```

Do not run migrations from application startup in a way that can cause multiple replicas to race unless the chosen migration mechanism safely handles it. Prefer the platform pre-deploy step or a separate release step.

## 5. Database safety

Production migration process:

```text
local schema change
      |
      v
prisma migrate dev
      |
      v
commit migration files
      |
      v
CI verification
      |
      v
production prisma migrate deploy
```

## 6. CORS

Only allow the deployed frontend origin and required local development origins.

Avoid `*` in production when credentials/auth behavior requires more specific origins.

## 7. Health checks

Use:

```text
GET /health
```

Health behavior should be simple and deterministic.

A database-aware health check is preferred for deployment monitoring.

## 8. Rollback thinking

For risky schema changes, keep migrations backward-compatible where practical.

For this take-home, the schema is small, but the README should state that production rollback is handled through deployment/database migration discipline rather than editing live tables manually.

## 9. Deployment verification checklist

```text
[ ] deployment succeeded
[ ] public domain exists
[ ] /health returns success
[ ] /docs loads
[ ] register works
[ ] login works
[ ] protected endpoint rejects missing token
[ ] event creation works
[ ] owner authorization works
[ ] RSVP works
[ ] duplicate RSVP is rejected
[ ] production database contains seed/demo data if intended
[ ] no secrets are visible
```
