# Hookkeeper

A webhook delivery system built to understand how production message queues actually work, retries, idempotency, dead-letter recovery, and rate limiting, not just to use a library that handles it for you.

Hookkeeper accepts events via an API, queues them for delivery, and reliably delivers them to a destination URL with automatic retries, exponential backoff, and per-destination rate limiting. If a destination is down, Hookkeeper doesn't give up after one try, and it doesn't let one broken destination starve delivery to everyone else.

## Why this exists

Most webhook systems look simple from the outside: receive an event, forward it somewhere. The hard part is everything that happens when things go wrong, a destination times out, a worker crashes mid-delivery, two requests for the same event arrive seconds apart, or the message queue itself becomes temporarily unavailable.

This project was built to implement those failure modes directly rather than read about them, queue-based architecture, retry/backoff strategy, idempotency, dead-letter recovery, and rate limiting, each written and load-tested by hand.

## Features

- **Queue-based delivery** — events are decoupled from delivery via BullMQ and Redis, so a slow or broken destination never blocks the API
- **Automatic retries with exponential backoff** — failed deliveries retry up to 5 times with increasing delay between attempts
- **Idempotency** — duplicate requests (same `idempotencyKey`) are detected and safely return the original event instead of creating a duplicate, handled atomically at the database level to avoid race conditions
- **Dead-letter queue + manual replay** — events that exhaust all retries are marked `failed` and can be manually replayed once the underlying issue is fixed
- **Stuck-event recovery (sweeper)** — a background job that finds events which never made it into the queue (e.g. due to a transient Redis outage) and automatically re-queues them
- **Per-destination rate limiting** — a token bucket algorithm, implemented from scratch as an atomic Redis Lua script, ensures one misbehaving destination can't exhaust delivery capacity for every other destination
- **HMAC request signing** — every delivered payload is signed with the destination's secret (SHA-256 HMAC) so receivers can verify authenticity
- **Live dashboard** — view event status, delivery attempts, and manually replay failed events in real time

## Architecture

```
Client → POST /api/events → Postgres (event created)
                           → Redis queue (delivery job queued)

Worker (always running) → picks up job → checks rate limit
                         → attempts HTTP delivery (signed)
                         → records attempt → updates status
                         → retries on failure (backoff)

Sweeper (runs every minute) → finds events stuck in "pending"
                             → re-queues them
```

Postgres is the source of truth for event state and history. Redis/BullMQ only coordinates *when* a delivery attempt happens. The two are kept in sync by the worker, not by any shared transaction, a deliberate tradeoff explored in depth while building this (see [Design notes](#design-notes) below).

## Stack

- **Next.js** (App Router) + **TypeScript** — API routes and dashboard
- **Drizzle ORM** + **PostgreSQL** (Neon) — event and delivery-attempt storage
- **BullMQ** + **Redis** (Upstash) — queue, retries, and backoff
- **Node `crypto`** — HMAC-SHA256 request signing

## Getting started

```bash
git clone https://github.com/rhittik12/hookkeeper
cd hookkeeper
npm install
```

Create a `.env` file:

```
DATABASE_URL=your_postgres_connection_string
REDIS_URL=your_redis_connection_string
```

Push the schema:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Run the three long-living processes, each in its own terminal:

```bash
npm run dev       # API + dashboard
npm run worker    # delivery worker
npm run sweeper   # stuck-event recovery
```

Visit `http://localhost:3000/dashboard` to watch events live.

## API

**`POST /api/events`** — create and queue a new event
```json
{
  "destinationId": "uuid",
  "type": "user.signup",
  "idempotencyKey": "unique-string-per-real-event"
}
```

**`GET /api/events`** — list recent events (optional `?status=` filter)

**`POST /api/events/:id/replay`** — manually re-queue a `failed` event

## Load testing

Pushed to 40,000+ events through the full pipeline (creation → queue → delivery → retry → rate limiting) using a custom autocannon script against 20 parallel destinations, confirming correct per-destination isolation and backoff behavior under concurrent load. See `scripts/load-test.ts`.

## Design notes

A few deliberate decisions worth knowing about if you're reading the code:

- **Idempotency is enforced at the database level** (a unique constraint + catching the Postgres error), not via a separate check-then-insert, to avoid a race condition where two near-simultaneous duplicate requests could both pass a "does it exist" check before either had inserted.
- **Rate limiting uses a token bucket**, not a fixed window counter, specifically to avoid the boundary-burst problem where a fixed window allows up to 2x its stated limit right at the window edge. The bucket math runs inside a Redis Lua script so the check-and-consume step is atomic across concurrent workers.
- **The webhook payload's URL is snapshotted at the time a delivery job is created**, not re-fetched on every retry. This is a deliberate event-carried-state-transfer tradeoff (vs. event notification): faster and simpler, at the cost of a retry potentially using a stale destination URL if it changes mid-flight. Real systems like Svix make the same tradeoff for the same reason.
- **A rate-limited attempt doesn't consume one of the event's 5 retry attempts.** It uses BullMQ's `moveToDelayed` to reschedule without penalizing the event, since being rate-limited is a decision made by this system, not a failure of the destination.

## What's next

- Deploy worker/sweeper as always-on services (currently requires them to be run manually)
- Multi-region Redis handling for horizontal worker scaling
- Webhook signature verification example for the receiving side

---

Built as a learning project to understand distributed systems and queue-based architecture hands-on. Not affiliated with or intended to compete with Svix, Hookdeck, or similar production services.
