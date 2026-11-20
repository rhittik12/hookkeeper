#                                                             Hookkeeper

Hookkeeper is a distributed webhook delivery system, built from scratch to learn queue-based architecture and distributed systems hands-on rather than relying on a library like Svix or Hookdeck to handle the hard parts.

The platform accepts events over a REST API, queues them for delivery, and reliably delivers them to a destination URL with automatic retries, exponential backoff, atomic idempotency, and per-destination rate limiting, so a slow or broken destination never starves delivery to every other destination on the queue.

---

https://github.com/user-attachments/assets/8e5aeb60-f10c-41e3-b023-594c95e07029

---

## High-Level Architecture

```mermaid
flowchart TD
    C[Client] -->|POST /api/events| API[Next.js API]
    API -->|Insert event, status: pending| PG[(PostgreSQL)]
    API -->|Enqueue delivery job| REDIS[(Redis / BullMQ)]
    C -->|GET /api/events| API
    API -->|Read events| PG

    subgraph Worker [Delivery Worker Pool]
        W[Worker] -->|Pull job| REDIS
        W -->|Check token bucket - Lua script| REDIS
        W -->|Sign payload - HMAC-SHA256| W
        W -->|POST webhook| DEST[Destination URL]
        W -->|Insert delivery_attempts| PG
        W -->|Update status: delivered/retrying/failed| PG
        W -.->|Failure, retries left| REDIS
    end

    subgraph Sweeper [Recovery Sweeper]
        S[Sweeper - runs every minute] -->|Find stuck pending events| PG
        S -->|Re-enqueue| REDIS
    end

    C2[Operator] -->|POST /api/events/:id/replay| API
    API -->|Reset status to pending, re-enqueue| REDIS
```

---

## What This Repo Contains

- `app/api/events/` — REST endpoints: create an event, list/filter events, replay a failed event
- `app/dashboard/` — live dashboard showing event status, delivery attempts, and a manual replay action
- `worker/` — long-running process that pulls jobs off the queue, checks the rate limiter, signs and delivers the payload, and records the outcome
- `scripts/sweep-stuck-events.ts` — a background job, scheduled every minute, that recovers events whose delivery job never made it into the queue (e.g. a transient Redis outage)
- `lib/rateLimiter.ts` — a token-bucket rate limiter implemented as an atomic Redis Lua script, scoped per destination
- `lib/queue.ts`, `lib/redis.ts` — queue and Redis connection setup shared by the API and the worker
- `db/schema.ts` — Drizzle ORM schema for `destinations`, `events`, and `delivery_attempts`
- `README.md` — this guide

---

## Core Flow

1. **Submit Event**: A client sends `POST /api/events` with a `destinationId`, an event `type`, and a caller-supplied `idempotencyKey`.
2. **Idempotency Check**: The insert relies on a database-level unique constraint on `idempotencyKey`, not a check-then-insert pattern, so two near-simultaneous duplicate requests can't both slip through and create two events. A duplicate returns the original event with `200`, not a new one.
3. **Queue the Job**: On a genuinely new event, the API writes a `pending` row to Postgres and enqueues a delivery job in BullMQ with a unique `jobId`.
4. **Rate Limit Check**: The worker checks a per-destination token bucket (Redis Lua script, atomic read-modify-write) before attempting delivery. If the bucket is empty, the job is rescheduled with jitter via `moveToDelayed` without consuming one of the event's retry attempts.
5. **Signed Delivery**: The worker signs the exact outgoing payload with the destination's secret (HMAC-SHA256) and sends it as a header, so the receiver can verify the request's authenticity.
6. **Record the Attempt**: Every delivery attempt, success or failure, gets its own row in `delivery_attempts`, and the event's status moves to `delivered`, `retrying`, or `failed` depending on the outcome and whether retries remain.
7. **Retry with Backoff**: Failed attempts retry with exponential backoff up to 5 times before the event is marked `failed` and parked as a dead letter.
8. **Replay**: An operator can call `POST /api/events/:id/replay` on a `failed` event, which resets it to `pending` and enqueues a fresh job with a new `jobId`.
9. **Self-Healing**: A sweeper runs every minute, finds any event that's been `pending` for more than 2 minutes with no job behind it (e.g. Redis was briefly unreachable at creation time), and re-enqueues it automatically.

---

## Service Layout & Technology Stack

| Layer | Location | Technology / Packages |
|---|---|---|
| **API & Dashboard** | `app/` | Next.js (App Router), TypeScript, React |
| **Delivery Worker** | `worker/` | Node.js, BullMQ |
| **Recovery Sweeper** | `scripts/` | Node.js, BullMQ, Drizzle |
| **Rate Limiter** | `lib/rateLimiter.ts` | Redis (Lua scripting via `ioredis`) |
| **Queue & Job Store** | Redis | BullMQ (Upstash) |
| **Database** | PostgreSQL | Drizzle ORM (Neon) |
| **Signing** | `worker/` | Node `crypto` (HMAC-SHA256) |

---

## Local Setup

### Prerequisites

- Node.js 18+ installed
- A PostgreSQL database (Neon free tier works)
- A Redis database (Upstash, **Regional**, not Global — see note below)

---

### Step 1: Environment Configuration

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
REDIS_URL=rediss://default:password@host:6379
```

> **Note on Redis:** use a **Regional** Upstash database, not a Global one. A Global database's cross-region replication doesn't play cleanly with the atomic multi-key Lua scripts BullMQ relies on internally for queueing jobs.

---

### Step 2: Push the Database Schema

```bash
npm install
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

### Step 3: Boot the Services

Open three terminal sessions, each running one long-lived process:

#### 1. Start the API and Dashboard
```bash
npm run dev
# Runs on http://localhost:3000, dashboard at /dashboard
```

#### 2. Start the Delivery Worker
```bash
npm run worker
# Pulls jobs from the deliveryQueue, attempts delivery, applies rate limiting
```

#### 3. Start the Recovery Sweeper
```bash
npm run sweeper
# Checks every minute for stuck pending events and re-enqueues them
```

---

## Operational Details

- **Idempotency**: Enforced by a Postgres unique constraint on `idempotencyKey`, not application-level checking, so it holds up correctly under concurrent duplicate requests.
- **Rate Limiting**: A token bucket per destination (default capacity 5, refill 1 token / 2 seconds), computed lazily on each check rather than with a background timer, and consumed atomically via a Redis Lua script so concurrent workers can't both grab the last token.
- **Retry Policy**: Exponential backoff, 5 attempts max, with jitter added to rate-limit reschedules to avoid a thundering-herd pileup when many jobs wake up at once.
- **Payload Snapshot**: A job's destination URL is captured at the time it's queued, not re-fetched on every retry (event-carried state transfer, not event notification). This is faster and simpler, at the cost of a retry potentially using a stale URL if the destination changes mid-flight.
- **Horizontal Scaling**: Run `npm run worker` in multiple terminals to add worker capacity with zero code changes — BullMQ's per-job locking guarantees two workers never process the same job twice.
- **Load Tested**: Pushed past 40,000+ events through the full pipeline using a custom autocannon script against 20 parallel destinations, testing against a production build (`npm run build && npm run start`), not the dev server, since `next dev` becomes the bottleneck under real concurrent load.
