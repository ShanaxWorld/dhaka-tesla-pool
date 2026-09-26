# Dhaka Tesla Pool

**Share a seat. Split the fare. Survive Dhaka traffic.**

A ride-pooling MVP where passengers share a three-seat electric "Tesla", split the fare fairly, and track a ride from request to completion. Two passengers with overlapping-but-not-identical trips can share one vehicle without ever exceeding its seat capacity, and each rider is charged for their own trip with a shared-ride discount.

- **Live app:** https://dhaka-tesla-pool-nine.vercel.app/
- **Repository:** https://github.com/ShanaxWorld/dhaka-tesla-pool
- **Demo video (6 min):** _[ADD VIDEO LINK HERE]_

---

## Problem statement

Nusrat wants to get from Banani to Mohakhali. Rafiq wants to get from Banani to Gulshan 1. Jashim's Tesla "Bullet" has three seats. The system has to decide, quickly, whether these two strangers can share a seat, split the fare fairly, and complete the ride — while the driver sees who is assigned and each passenger sees only their own fare and status. Once a ride finishes, the system keeps enough history to explain exactly what happened.

Three actors:

- **Passenger** (Nusrat, Rafiq, Shirin) — signs up, requests a ride, sees an estimated fare, tracks status (waiting → matched → in progress → completed/cancelled), views history, cancels while valid.
- **Driver + Tesla** (Jashim + "Bullet") — signs in, goes online/offline, sees waiting requests, accepts a ride/pool, marks arrival, starts and completes the trip, sees passengers and history.
- **Pool / Ride** — multiple requests may share one Tesla, occupied seats never exceed capacity, each passenger gets an individual fare, with a clear lifecycle and obvious pool membership.

---

## Features implemented

- Email/password auth with JWT in an httpOnly cookie (signup, login, logout, session)
- Passenger ride requests with a live fare estimate before booking
- Per-passenger ride history and status tracking (auto-refreshing)
- Cancel-while-valid, enforced by the server
- Driver online/offline toggle with current location
- Pool matching: compatible requests share one Tesla; incompatible ones open new pools
- Atomic seat-capacity enforcement, safe under concurrent claims on the last seat
- Individual fares with a shared-ride discount, stored as integer paisa
- Full ride lifecycle with validated state transitions and per-passenger propagation
- Append-only audit log of every status change
- Dockerized: `docker compose up` runs app + DB with migrations and seed
- Test suite covering all six risky behaviors from the brief
- Deployed to a public URL on a free tier

---

## Architecture

```mermaid
flowchart TD
    Browser["Browser<br/>(Passenger / Driver UI)"]
    subgraph NextApp["Next.js App (single deployable unit)"]
        UI["React Server + Client Components<br/>Tailwind CSS"]
        API["Route Handlers<br/>(Node.js API layer)"]
        Logic["Service layer<br/>auth · matching · fare · capacity · lifecycle"]
    end
    DB[("PostgreSQL<br/>via Prisma ORM")]

    Browser -->|HTTP| UI
    UI -->|fetch /api| API
    API --> Logic
    Logic -->|Prisma queries + row locks| DB
```

**Request lifecycle:** Browser → Next.js UI → route handler (API) → service layer → Prisma → PostgreSQL, and back.

**Why this shape**

- **One Next.js app** serves the UI *and* the API (route handlers are the Node.js layer), so there is one thing to build, containerize, and deploy — the right call for a time-boxed MVP.
- **Business logic lives in a service layer** (`src/lib/`), not inside route handlers, so pooling/fare/capacity/lifecycle rules are testable in isolation and reusable.
- **Prisma + PostgreSQL** with row-level locking is what makes the last-seat concurrency case safe.
- No queues, Redis, or microservices — added only where there is a reason.

---

## Entity-relationship diagram

```mermaid
erDiagram
    User ||--o| Tesla : "owns (driver)"
    User ||--o{ RideRequest : "requests (passenger)"
    Tesla ||--o{ Pool : hosts
    Pool ||--o{ RideRequest : "contains (members)"
    RideRequest ||--o{ RideEvent : logs

    User {
        string id PK
        string name
        string email UK
        string passwordHash
        Role role
        datetime createdAt
        datetime updatedAt
    }
    Tesla {
        string id PK
        string name
        int capacity
        boolean isOnline
        Area currentArea
        string driverId FK "unique"
    }
    Pool {
        string id PK
        string teslaId FK
        Area pickupArea
        PoolStatus status
        int seatsUsed
        datetime arrivedAt
        datetime startedAt
        datetime completedAt
    }
    RideRequest {
        string id PK
        string passengerId FK
        Area pickupArea
        Area dropoffArea
        int seats
        RideStatus status
        string poolId FK
        int baseFare
        int distanceCharge
        int poolDiscount
        int totalFare
        PaymentMethod paymentMethod
        PaymentStatus paymentStatus
    }
    RideEvent {
        string id PK
        string rideRequestId FK
        RideStatus fromStatus
        RideStatus toStatus
        string note
        datetime createdAt
    }
```

**Schema decisions**

- **One `User` table with a `role` enum**, not separate passenger/driver tables — same identity, different capabilities. A user's role is fixed at signup (documented assumption).
- **A driver owns exactly one Tesla** (`driverId` unique on `Tesla`, a one-to-one).
- **Two status fields on purpose.** `Pool.status` is the shared trip's state; `RideRequest.status` is each passenger's own view — this is how one rider can cancel while the pool rides on, and how each passenger sees only their own status.
- **`seatsUsed` counter on `Pool` + `capacity` on `Tesla`** make capacity checks O(1), and `Pool` is the single row locked during the last-seat race.
- **Money as integer paisa** — floats lose precision on money, so the smallest unit is stored as an integer.
- **`RideEvent` is an append-only audit log** — every status change writes a row.
- **Areas as an enum** for MVP simplicity; distance and matching logic live in code and are documented below.

---

## Fare model (testable by hand)

```
passengerFare = baseFare + distanceCharge − poolDiscount
```

- **baseFare:** ৳30 (3000 paisa), flat per passenger
- **distanceCharge:** ৳20 (2000 paisa) per zone hop between pickup and dropoff
- **poolDiscount:** 20% off (base + distance) when the ride is shared

Distance is a fixed lookup along a corridor of Dhaka areas (no map API): the "hops" are the index difference between two areas on that corridor. Money is stored as integer paisa and only formatted to Taka for display.

**Worked example (the brief's cast):**

| Passenger | Trip | Hops | Solo | Pooled (−20%) |
|---|---|---|---|---|
| Nusrat | Banani → Mohakhali | 3 | ৳90 | **৳72** |
| Rafiq | Banani → Gulshan 1 | 2 | ৳70 | **৳56** |

The two fares differ **by design** — each passenger pays for their own trip distance, then both receive the shared-ride discount. Pooling is not "split one fare in half."

Payment is Cash or a simulated **TeslaPay** wallet — no real gateway.

---

## Pool matching rule

Two ride requests are poolable in the same Tesla when both hold:

1. **Same pickup zone** — they board in the same area.
2. **Compatible direction** — their dropoffs are within 2 zones of each other on the corridor.

This is why Nusrat (Banani → Mohakhali) and Rafiq (Banani → Gulshan 1) pool: same pickup, adjacent dropoffs — overlapping but not identical. The rule is deliberately simple and applied consistently.

---

## Ride lifecycle & state machine

```
REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED   (+ CANCELLED)
```

The pool advances as a unit (one driver action moves everyone), but each passenger keeps their own status row and audit trail. Only legal forward transitions are permitted; illegal jumps or reversals are rejected server-side (e.g. `COMPLETED → STARTED` returns `409`). Cancellation is allowed only before the trip starts (`REQUESTED`, `MATCHED`, `DRIVER_ARRIVED`).

---

## Concurrency: the last-seat problem

Bullet has one seat left. Nusrat and Shirin both try to claim it at nearly the same instant, and both initially see one seat available. Overbooking is prevented with a **two-layer defense**:

1. The accept operation runs inside a single **Serializable** transaction.
2. Before adding a member, it takes an explicit **row lock on the pool** (`SELECT "seatsUsed" FROM "Pool" WHERE id = ... FOR UPDATE`) and re-reads `seatsUsed` under the lock — never trusting the value read before locking.

Any concurrent accept on the same pool blocks until the first commits, then re-reads and correctly sees the seat is gone. The losing transaction either finds no space or is aborted by Postgres with a serialization error — both are correct outcomes. This is verified by an integration test that fires two accepts in parallel and asserts `seatsUsed` never exceeds capacity.

At larger scale I would move seat allocation behind an atomic conditional update or a short-lived distributed lock, and make accept idempotent with a request key — see the scaling notes below.

---

## Tech stack & justifications

For every non-mandated choice: what it is, the realistic alternative, why it fits, and what would make me switch.

| Choice | Why it fits a ride-pooling MVP | Alternative / when I'd switch |
|---|---|---|
| **TypeScript** | Types catch state-machine and fare bugs early; pairs with Prisma's generated types. | Plain JS — faster to start, but riskier for money and status logic. |
| **Next.js (App Router)** | UI + API in one deployable unit — one build, one container, one deploy. | Separate Express/Nest backend — the textbook split; I'd switch when the API needs independent scaling or non-web clients. |
| **Prisma (ORM)** | Schema-first, generates migrations, type-safe queries, and the ERD; supports raw SQL for the `FOR UPDATE` lock. | Raw SQL / Kysely for finer control; I'd reach for it if query shapes outgrew the ORM. |
| **PostgreSQL** | Relational fit for pooling/capacity; row-level locking solves the concurrency case. | MySQL is comparable; SQLite for pure local dev. |
| **Prisma v6 (pinned)** | v7 had just released with breaking config changes and mandatory driver adapters; v6 is mature and well-documented for a short build. | v7's adapter model on a longer-lived project where connection-pool control matters. |
| **Zod** | Validates every request body at the boundary; pairs with TS. | Manual validation — more code, more gaps. |
| **JWT (httpOnly cookie) + bcryptjs** | Simple enough to explain every line; `httpOnly` blocks XSS token theft, `sameSite=lax` gives basic CSRF defense; bcryptjs is pure-JS so it bundles cleanly on serverless. | A managed auth library — less to own, but harder to defend line-by-line; native `bcrypt` fails to compile on some platforms. |
| **Vitest** | First-class TS/ESM, zero-config path aliases. | Jest — needs extra transform setup. |
| **Tailwind CSS** | Fast, clean, consistent UI without a separate stylesheet. | CSS Modules — more ceremony for an MVP. |
| **Vercel + Neon (free tier)** | Native Next.js host + free serverless Postgres; pooled endpoint for the app, direct endpoint for migrations. | Any Docker host (a reproducible `docker compose` setup is included as the portable fallback). |

---

## Project structure

```
dhaka-tesla-pool/
├─ prisma/
│  ├─ schema.prisma        # data model (source of the ERD)
│  ├─ migrations/          # versioned SQL migrations
│  └─ seed.ts              # seeds the story cast (Jashim, Bullet, Nusrat, Rafiq, Shirin)
├─ src/
│  ├─ app/
│  │  ├─ login/            # login + signup page
│  │  ├─ passenger/        # passenger dashboard
│  │  ├─ driver/           # driver dashboard
│  │  └─ api/
│  │     ├─ auth/          # signup, login, logout, me
│  │     ├─ rides/         # create, list, estimate, [id] (view/cancel)
│  │     └─ driver/        # status, accept, pools, dashboard, pools/[id]/advance
│  └─ lib/
│     ├─ prisma.ts         # shared Prisma client
│     ├─ auth.ts           # token + cookie helpers
│     ├─ guard.ts          # auth guard for routes
│     ├─ fare.ts           # fare model + zone distance
│     ├─ matching.ts       # pool matching rule
│     ├─ lifecycle.ts      # state machine
│     └─ services/pool.ts  # accept + capacity logic (locked transaction)
├─ tests/                  # unit + integration tests
├─ docs/                   # architecture + generated ERD
├─ Dockerfile
├─ docker-compose.yml
└─ .env.example
```

---

## Prerequisites

- Node.js 20+
- Docker Desktop (for the containerized route)
- npm

## Environment variables

Copy `.env.example` to `.env` and fill in your own values. Never commit the real `.env`.

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/teslapool?schema=public"
JWT_SECRET="your-long-random-secret-here"
```

## Run with Docker (recommended)

One command brings up the app and the database, applies migrations, and seeds the cast:

```bash
docker compose up --build
```

Then open http://localhost:3000. The Postgres container has a healthcheck; the app waits for it before migrating. Data persists in a named volume across restarts, so the idempotent seed will report "already applied" on later runs.

## Run locally (without Docker)

```bash
# 1. Start Postgres only (or point DATABASE_URL at your own)
docker compose up -d db

# 2. Install dependencies
npm install

# 3. Apply migrations and seed
npx prisma migrate dev
npx prisma db seed

# 4. Start the dev server
npm run dev
```

## Run the tests

Requires the database to be up (integration tests hit real Postgres):

```bash
npm test
```

## Demo credentials

All seeded users share the password **`password123`**.

| Role | Email |
|---|---|
| Driver (owns "Bullet") | `jashim@teslapool.dev` |
| Passenger | `nusrat@teslapool.dev` |
| Passenger | `rafiq@teslapool.dev` |
| Passenger | `shirin@teslapool.dev` |

The login screen also has one-tap demo chips for each account.

---

## API overview

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Register (passenger, or driver — provisions a Tesla) |
| POST | `/api/auth/login` | Log in, set session cookie |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Current user |
| POST | `/api/rides` | Create a ride request |
| GET | `/api/rides` | List *your own* rides |
| GET | `/api/rides/estimate` | Fare estimate for a pickup/dropoff |
| GET | `/api/rides/[id]` | View one ride (owner only) |
| DELETE | `/api/rides/[id]` | Cancel while valid (owner only) |
| PATCH | `/api/driver/status` | Go online/offline, set location |
| POST | `/api/driver/accept` | Accept a request into a pool (capacity-safe) |
| GET | `/api/driver/pools` | Driver's pools and members |
| GET | `/api/driver/dashboard` | Tesla + waiting requests + pools |
| POST | `/api/driver/pools/[id]/advance` | Advance the pool through the lifecycle |

Every mutation re-checks ownership from the token, so a user can never read or modify another user's ride.

---

## Testing

Meaningful tests over coverage-chasing. The six risky behaviors from the brief:

| Behavior | Test |
|---|---|
| Bullet's capacity can never be exceeded | `tests/pool.integration.test.ts` |
| Two concurrent requests can't corrupt capacity | `tests/pool.integration.test.ts` (parallel accepts) |
| Nusrat's and Rafiq's pooled fares are correct | `tests/fare.test.ts` |
| Invalid state transitions are rejected | `tests/lifecycle.test.ts` |
| A user can't modify another user's ride | `tests/rides.integration.test.ts` |
| Cancellation rules hold | `tests/rides.integration.test.ts` |

Plus a unit test for the pool matching rule.

---

## Key decisions & trade-offs

- **Individual fares, not a split fare** — each passenger pays for their own distance with a shared discount. This is the brief's "each passenger gets an individual fare."
- **Pool advances as a unit, riders keep individual state** — a shared trip with per-passenger status and audit trail.
- **Serializable + row lock** for the last-seat race — simple and correct for MVP scale; heavier machinery deferred until it's justified.
- **Full `node_modules` in the Docker runtime image** — larger image, but reliable Prisma CLI at container startup for migrate/seed. A leaner image would bundle only the required engine binaries.
- **Pinned Prisma v6 and Zod v3** — maturity and documentation over the newest release, for a time-boxed build.

## Known limitations

- Geography is a fixed area corridor, not real routing.
- No websockets — the client polls every few seconds for status updates.
- One Tesla per driver; no live map or GPS.
- Payment is simulated (no gateway).

## Next improvements

- Real-time updates over websockets instead of polling.
- Idempotency keys on accept, so retries can't double-book.
- Richer matching (detour tolerance, ETA windows) and real geodata.
- Ratings and a fuller TeslaPay wallet.

---

## Bonus: if "Oi Tesla" goes viral (1M passengers, 100k drivers)

Reasoning, not box count:

- **Stateless app tier behind a load balancer**, scaled horizontally — the app already keeps no server-side session state (JWT in cookie).
- **Database:** primary for writes, **read replicas** for dashboards/history; index the hot paths (`status`, `poolId`, `pickupArea`, `passengerId`, already present). Move seat allocation to an atomic conditional update to cut lock contention.
- **Geospatial matching:** PostGIS or a geohash/H3 index so drivers and requests are matched by proximity instead of a fixed corridor.
- **Caching:** Redis for online-driver sets and hot lookups; a short TTL on estimates.
- **Events/queues:** a queue for match dispatch and notifications, decoupling accept from delivery; **idempotency keys** so retries can't double-book.
- **Real-time:** websockets/SSE via a pub/sub layer for live status and driver location.
- **Resilience:** rate limiting, retries with backoff, circuit breakers, and observability (structured logs, metrics, tracing) to find contention hotspots.
- **Deployment:** blue-green or canary releases; migrations run separately from app boot at this scale.

The core invariant — seats never exceed capacity — is preserved at every scale; only the *mechanism* for enforcing it changes.

---

## AI usage

I used Claude as a pair-programming assistant throughout: scaffolding, boilerplate for API routes, Tailwind markup, test structure, and debugging. AI is a normal engineering tool; I own every line and can explain, debug, and modify it.

- **Accepted:** the two-layer concurrency approach for the last-seat race — a Serializable transaction plus a `SELECT … FOR UPDATE` row lock on the pool. I understood the trade-off, verified it with a concurrent test, and kept it.
- **Rejected / corrected:** the assistant initially stated Nusrat's and Rafiq's pooled fares were equal (৳56 each). Running the code showed ৳72 and ৳56 — the fares *should* differ, because each passenger pays for their own trip distance. I corrected the documented numbers to match the real corridor logic; the difference is a feature (individual fares), not a bug.
- **Owned end-to-end:** the AI-suggested Docker and Vercel configuration didn't work first try. I debugged the container entrypoint, a YAML/encoding issue, the Prisma-CLI-in-container error, and several deployment errors myself, and shipped the working live app.

---

_Built for the RoBenDevs Dhaka Tesla Pool challenge. In Dhaka, your Tesla may have three wheels — but the engineering is production-minded._
