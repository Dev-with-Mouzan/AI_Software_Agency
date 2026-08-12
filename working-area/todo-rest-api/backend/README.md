# Todo REST API — backend

Production-grade Todo REST API built with **Node.js 22 · TypeScript (strict) · Fastify 5 · Prisma 6 · PostgreSQL 17 · Vitest + Supertest**.

Implements the approved plan in [`docs/implementation_plan.md`](../docs/implementation_plan.md): strict validation, consistent error envelope, cursor-based pagination with stable `(createdAt, id)` ordering, executable OpenAPI docs at `/docs`, unit + integration + e2e tests, and a multi-stage production Docker image.

## Quickstart (local dev)

Requirements: **Node.js ≥ 22** (see `.nvmrc`) and **Docker** (for PostgreSQL).

```bash
cd backend

# 1) Install dependencies (generates package-lock.json + Prisma client)
npm install

# 2) Configure environment
cp .env.example .env        # adjust DATABASE_URL / CORS_ORIGIN as needed

# 3) Start PostgreSQL (from the repo root)
docker compose -f deployment/docker-compose.yml up -d db

# 4) Apply migrations to the dev database
npm run prisma:migrate

# 5) Run the API in watch mode
npm run dev
```

The API listens on `http://localhost:3000`:

- `GET /healthz` → liveness/readiness
- `GET /docs` → Swagger UI (OpenAPI 3.1, JSON spec at `/docs/json`)
- `GET /api/v1/todos` → cursor-paginated list

### Smoke test

```bash
curl -s localhost:3000/healthz
# {"status":"ok","db":"up","uptime":2.1,"timestamp":"..."}

curl -s -X POST localhost:3000/api/v1/todos \
  -H 'content-type: application/json' \
  -d '{"title":"Buy milk","priority":"HIGH"}'
# 201 {"id":"...","title":"Buy milk","description":null,"completed":false,"priority":"HIGH","dueAt":null,"createdAt":"...","updatedAt":"..."}

curl -s 'localhost:3000/api/v1/todos?limit=2&completed=false'
# {"data":[...],"meta":{"limit":2,"nextCursor":"...","hasMore":true}}
```

## API contract (v1)

Base path `/api/v1`. All errors use a consistent envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
             "details": [{ "field": "title", "message": "must be at least 1 character" }] } }
```

Codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

| Method | Path | Purpose | Success | Errors |
|---|---|---|---|---|
| GET | `/healthz` | liveness/readiness (checks DB) | 200 | 503 |
| GET | `/todos` | list: `?limit=&cursor=&completed=&priority=&sort=createdAt:desc\|asc` | 200 | 400 |
| POST | `/todos` | create `{title, description?, priority?, dueAt?}` | 201 | 400 |
| GET | `/todos/:id` | fetch one (uuid) | 200 | 400, 404 |
| PATCH | `/todos/:id` | partial, idempotent update (any field) | 200 | 400, 404 |
| DELETE | `/todos/:id` | delete | 204 | 400, 404 |
| GET | `/docs` | Swagger UI (OpenAPI 3.1) | 200 | — |

**Pagination** — cursor-based, stable under inserts. `limit` defaults to 20 (max 100), `cursor` is an opaque base64url-encoded todo id returned as `meta.nextCursor`; ordering is `(createdAt, id)` so ties cannot cause duplicates/skips. Response shape: `{ "data": [...], "meta": { "limit", "nextCursor", "hasMore" } }`.

**Validation notes**

- Request bodies are strict: unknown fields are rejected with `400 VALIDATION_ERROR`.
- `title` is trimmed; whitespace-only titles are rejected (1–200 chars). `description` max 1000 chars.
- `dueAt` must be a valid ISO 8601 date-time; pass `null` via PATCH to clear `description`/`dueAt`.
- Mutating routes are rate-limited (60/min per IP by default); reads 300/min.

## Environment variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `HOST` | `0.0.0.0` | Bind interface |
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | — | Postgres connection string, e.g. `postgresql://todo:todo@localhost:5432/todo` |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | pino level; `silent` in test |
| `RATE_LIMIT_MAX` | `300` | Global per-IP limit per 15 min |

Configuration is validated at boot — the process fails fast with a clear message instead of crashing mid-request.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run with tsx watch (hot reload) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build (`node dist/server.js`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint (flat config) |
| `npm run format` / `format:check` | Prettier |
| `npm test` | All suites (unit + integration + e2e) — needs Postgres test DB |
| `npm run test:unit` | Unit tests only (no DB) |
| `npm run test:integration` | Integration + e2e (real Postgres `todo_test`) |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run prisma:migrate` | `prisma migrate dev` (dev DB) |
| `npm run prisma:deploy` | `prisma migrate deploy` (prod/test DBs) |
| `npm run prisma:studio` | Prisma Studio |

## Testing

- **Unit** (`src/modules/todos/__tests__/todo.service.unit.test.ts`) — service pagination math, title normalization, date parsing, error mapping; repository is mocked, no DB.
- **Integration** (`todo.integration.test.ts`) — full HTTP stack against real PostgreSQL (`todo_test`), table truncated between tests.
- **E2E** (`tests/api.e2e.test.ts`) — healthz, OpenAPI spec, full CRUD lifecycle, error-envelope consistency.

One-time test database setup (Postgres must be running):

```bash
# create the test database
docker compose -f deployment/docker-compose.yml exec -T db psql -U todo -c 'CREATE DATABASE todo_test;'

# apply migrations to it
DATABASE_URL=postgresql://todo:todo@localhost:5432/todo_test npm run prisma:deploy

# run everything (or TEST_DATABASE_URL=... npm test in CI)
npm test
```

## Docker

Multi-stage `Dockerfile` (`node:22-alpine`): deps → build (prisma generate + tsc) → pruned runtime as non-root `node` user with a `/healthz` HEALTHCHECK. The `prisma` CLI ships in the runtime image so `prisma migrate deploy` can run before startup (never `migrate dev` in prod).

```bash
# build and run the API container against a Postgres on the host network
docker build -t todo-api backend
docker run --rm -p 3000:3000 --env-file backend/.env todo-api
```

For the full stack (API + Postgres, and API + Postgres + nginx in prod) see `../deployment/` — the compose files in that directory consume this image.

## Project layout

```
backend/
├── prisma/
│   ├── schema.prisma              # Todo model + Priority enum + list indexes
│   └── migrations/                # init migration (apply with migrate deploy)
├── src/
│   ├── server.ts                  # entrypoint: listen + graceful shutdown
│   ├── app.ts                     # buildApp(): plugins, error handler, routes (no listen — testable)
│   ├── config/env.ts              # env parsing/validation, fail fast
│   ├── db/prisma.ts               # PrismaClient singleton
│   ├── lib/
│   │   ├── errors.ts              # AppError + centralized error handler (error envelope)
│   │   └── pagination.ts          # limit/cursor parsing + cursor codec
│   ├── plugins/                   # cors, helmet, rate-limit, swagger, health
│   └── modules/todos/             # feature-based: schema → routes → controller → service → repository
│       └── __tests__/             # unit + integration tests
├── tests/api.e2e.test.ts          # full-stack e2e suite
├── Dockerfile                     # multi-stage production image
├── vitest.config.ts               # test env (todo_test DB), coverage
└── .env.example                   # env template (never commit .env)
```

## Notes / decisions

- **ESM** end-to-end (`"type": "module"`, `NodeNext`) — Node 22 native, works with tsx, Vitest and `node dist/server.js`.
- **Strict bodies**: `removeAdditional: false` + `additionalProperties: false` → unknown fields are rejected, not silently dropped.
- **Helmet CSP disabled** so Swagger UI can render its inline styles; all other security headers remain enabled.
- **Prisma in `dependencies`** (not dev) so `prisma migrate deploy` works inside the production image.
- `POST` create intentionally does not accept `completed` (defaults to `false`); `PATCH` does.
