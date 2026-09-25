# Architecture Decision Record (ADR) Log

This document is intentionally short and decision-oriented. Update it when implementation choices materially change.

## ADR-001 — Modular monolith

### Decision

Use one NestJS application with feature modules.

### Why

The assignment is small, the product is early-stage, and distributed infrastructure would add cost without improving the core evaluation signal.

### Revisit when

Separate deployment/scaling/security boundaries emerge from real product requirements.

## ADR-002 — PostgreSQL as source of truth

### Decision

Store users, events, and RSVPs in PostgreSQL.

### Why

The domain has strong relational integrity requirements and a concurrency-sensitive RSVP flow. PostgreSQL provides transactions, row-level locking, unique constraints, and reliable relational queries.

## ADR-003 — Prisma ORM

### Decision

Use Prisma for standard persistence and transaction orchestration, with narrowly-scoped raw SQL when PostgreSQL-specific locking is needed.

### Why

Prisma provides type-safe application access and migrations while allowing us to use database-specific behavior where correctness requires it.

## ADR-004 — UUID identifiers

### Decision

Use UUIDs for public entity identifiers.

### Why

They are stable, convenient for distributed generation, and less revealing than sequential integer IDs. They do not replace authorization.

## ADR-005 — RSVP join table

### Decision

Represent participation as `rsvps(event_id, user_id)` rather than embedding attendee IDs inside events.

### Why

It models the many-to-many relationship correctly, allows direct attendee queries, supports uniqueness constraints, and scales better than JSON/array membership fields.

## ADR-006 — Unique RSVP constraint

### Decision

Enforce `UNIQUE(event_id, user_id)` at the database level.

### Why

Application checks alone are race-prone. The constraint provides a final correctness guarantee.

## ADR-007 — attendeeCount denormalization

### Decision

Maintain `events.attendee_count` transactionally with RSVP create/delete.

### Why

Event list/detail responses need attendee counts frequently. A maintained counter avoids counting all RSVP rows for every read.

### Tradeoff

Every RSVP mutation becomes a transaction involving the event row and RSVP row.

## ADR-008 — event-row locking for capacity

### Decision

Lock the event row during the capacity-sensitive RSVP transaction.

### Why

The event row is the natural serialization point for a single event's attendee capacity.

### Tradeoff

Concurrent RSVPs for the same event serialize. This is acceptable because correctness is more important than maximum theoretical throughput for the scoped system.

## ADR-009 — API versioning

### Decision

Use `/api/v1`.

### Why

It costs little and provides an explicit evolution boundary.

## ADR-010 — Public discovery, protected mutation

### Decision

Event listing/details are public by default; create/update/delete and RSVP require auth.

### Why

It creates a simple consumer discovery experience while protecting state-changing operations.

## ADR-011 — Add capacity even though it is not explicit in the assignment

### Decision

Support optional event capacity.

### Why

It provides a realistic event-domain invariant and creates a concrete concurrency problem to solve and demonstrate.

## ADR-012 — Avoid premature distributed architecture

### Decision

Do not introduce Redis/Kafka/microservices until a real requirement exists.

### Why

The hiring signal is engineering judgment, not infrastructure volume. A clean modular monolith is easier to inspect and deploy within the deadline.
