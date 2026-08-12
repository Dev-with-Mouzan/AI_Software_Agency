# Implementation Plan — Todo REST API

Status: **Approved / Ready for implementation**
Last updated: 2026-08-11
Author: Planner agent

---

## 1. Product Summary

A production-grade **Todo REST API** — a reference-quality CRUD backend with a minimal web frontend that consumes it, packaged for local development and containerized deployment.

**What it does**

- Manages todo items (create, read, update, delete, list) with filtering, sorting and cursor-based pagination.
- Enforces validation, consistent error responses, and idempotent `PATCH` updates.
- Exposes executable OpenAPI documentation (Swagger UI) at `/docs`.
- Ships with unit + integration tests, a CI pipeline, and Docker Compose for dev and prod.

**Out of scope (v1)**

- Authentication / user accounts (single-user todo list).
- Real-time sync / WebSockets.
- Soft deletes, tags, subtasks, search indexing.

**Success criteria**

1. `GET /api/v1/todos` returns paginated, filterable data with stable ordering.
2. All endpoints validate input (400), return 404 for missing resources, and a consistent error envelope.
3. OpenAPI spec at `/docs` reflects the real API (executable docs).
4. `npm test` runs green: unit tests (service/repository logic) + integration tests (HTTP against real Postgres).
5. `docker compose up` starts API + Postgres; `docker compose -f docker-compose.prod.yml up` starts API + Postgres + nginx (frontend).

---

## 2. Recommended Tech Stack

| Layer | Choice | Justification |
|---|---|---|
| Language | **TypeScript 5.x** (strict) | Type safety across API, ORM client and frontend; de-facto standard for Node APIs in 2025+. |
| Runtime | **Node.js 22 LTS** (or 24 LTS) | LTS, built-in test runner & fetch, `--watch` mode. Fastify 5 requires Node ≥ 20.19; pin via `.nvmrc` + `engines`. |
| Web framework | **Fastify 5** | Low overhead, first-class TypeScript, built-in **JSON Schema validation + serialization** that feeds automatic OpenAPI generation (`@fastify/swagger`). Faster and more modern than Express 5 for a pure API; less ceremony than NestJS (overkill for one resource). |
| Validation | **Fastify route schemas (JSON Schema)** | Native, zero extra deps, doubles as the OpenAPI contract. Zod is a valid alternative for complex cross-field rules; not needed here. |
| ORM / DB access | **Prisma 6** | Type-safe client, intuitive schema, automated migrations (`prisma migrate`). Drizzle is a lighter alternative if the team prefers SQL-first; Prisma chosen for mainstream DX and migration ergonomics. |
| Database | **PostgreSQL 17** | Web API with concurrent reads/writes → Postgres per current guidance (SQLite only fits single-process/local). Runs via Docker in dev and prod. |
| Logging | **pino** (via Fastify's built-in logger) | Structured JSON logs with `reqId` correlation — observability best practice. |
| Security | `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit` | CORS for the frontend, secure headers, per-IP rate limiting on mutating routes. |
| Testing | **Vitest 3 + Supertest** | Fast, TS-native; Supertest drives the Fastify app in-process against a real Postgres test DB. Reference: goldbergyoni/nodejs-testing-best-practices. |
| Frontend | **Vite 7 + React 19 + TypeScript** | Minimal SPA that exercises the API; Vite for instant dev server and simple nginx static hosting. |
| Docs | **OpenAPI 3.1** via `@fastify/swagger` + `@fastify/swagger-ui` | Executable docs — examples always match the real API. |
| Deployment | **Docker Compose v2** (multi-stage Dockerfile, healthchecks, named volumes, secrets via env) | Standard, reviewable, works on any VPS; prod variant adds nginx reverse proxy + static frontend. |
| CI | **GitHub Actions** | lint → typecheck → test → build on push/PR. |

---

## 3. Architecture

### 3.1 Repository layout (monorepo)

```
.
├── backend/                 # Fastify + TypeScript API (primary deliverable)
├── frontend/                # Vite + React todo UI
├── deployment/              # docker-compose files, nginx config, env templates
└── docs/                    # README.md, implementation_plan.md, api.md
```

### 3.2 Backend structure (feature-based, layered)

```
backend/
├── src/
│   ├── server.ts                  # entrypoint: build app, listen, graceful shutdown (SIGINT/SIGTERM)
│   ├── app.ts                     # buildApp(): registers plugins + routes (no listen — testable)
│   ├── config/env.ts              # env parsing + validation at startup (fail fast)
│   ├── plugins/
│   │   ├── cors.ts  helmet.ts  rate-limit.ts  swagger.ts  health.ts
│   ├── modules/
│   │   └── todos/
│   │       ├── todo.schema.ts     # JSON Schemas: params, query, body, responses
│   │       ├── todo.routes.ts     # route registration (path, method, schema, handler)
│   │       ├── todo.controller.ts # request → service, maps errors to HTTP
│   │       ├── todo.service.ts    # business rules (validation of state, pagination logic)
│   │       ├── todo.repository.ts # Prisma data access (only file importing Prisma models)
│   │       └── __tests__/
│   │           ├── todo.service.unit.test.ts
│   │           └── todo.integration.test.ts
│   ├── lib/
│   │   ├── errors.ts              # AppError(code, message, status), error handler hook
│   │   └── pagination.ts          # limit/cursor parsing + envelope builder
│   └── db/prisma.ts               # PrismaClient singleton
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/api.e2e.test.ts          # full HTTP suite against built app + real DB
├── Dockerfile                      # multi-stage: deps → build → pruned runtime
├── package.json  tsconfig.json  vitest.config.ts  .env.example
```

### 3.3 Request flow (how it works in reality)

```
Client ──HTTP──▶ Fastify server
  1. Route matched by path+method (todo.routes.ts)
  2. Route schema validation (JSON Schema): params → query → body
     ✗ invalid → 400 VALIDATION_ERROR envelope, request never reaches handler
  3. Handler (controller) called with validated, typed inputs
  4. Controller → Service (business rules: completeness, pagination math)
  5. Service → Repository → Prisma → PostgreSQL
  6. Response serialized by Fastify using the route's response schema
     (strips unknown fields, guarantees shape) → JSON to client
Cross-cutting: pino request logging (reqId), helmet headers, rate limit,
CORS, centralized error handler (AppError → status code + error envelope).
```

### 3.4 Data model (Prisma)

```prisma
enum Priority { LOW MEDIUM HIGH }

model Todo {
  id          String    @id @default(uuid())
  title       String    // 1..200 (validated in schema)
  description String?   // max 1000
  completed   Boolean   @default(false)
  priority    Priority  @default(MEDIUM)
  dueAt       DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([completed, createdAt])   // list filter + sort
  @@index([priority, createdAt])
}
```

### 3.5 API contract (v1)

Base path: `/api/v1` — versioned from day one (Postman best practice).

| Method | Path | Purpose | Success | Errors |
|---|---|---|---|---|
| GET | `/healthz` | liveness/readiness (checks DB) | 200 | 503 |
| GET | `/todos` | list: `?limit=20&cursor=&completed=&priority=&sort=createdAt:desc` | 200 | 400 |
| POST | `/todos` | create `{title, description?, priority?, dueAt?}` | 201 | 400 |
| GET | `/todos/:id` | fetch one (uuid) | 200 | 400, 404 |
| PATCH | `/todos/:id` | partial update (any field) — **idempotent** | 200 | 400, 404 |
| DELETE | `/todos/:id` | delete | 204 | 400, 404 |
| GET | `/docs` | Swagger UI (OpenAPI 3.1) | 200 | — |

**Pagination** — cursor-based (stable under inserts; recommended over offset for lists):
- Request: `limit` (default 20, max 100), `cursor` (opaque base64 of `id`), filters `completed`, `priority`, `sort=createdAt:desc|asc`.
- Response envelope: `{ "data": [...], "meta": { "limit", "nextCursor", "hasMore" } }`.

**Error envelope** (consistent shape for all errors):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [{ "field": "title", "message": "must be at least 1 character" }] } }
```

Codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

---

## 4. Milestones

| # | Milestone | Deliverable | Exit criteria |
|---|---|---|---|
| M0 | Scaffolding & tooling | Monorepo dirs, backend TS project, ESLint/Prettier, `.nvmrc`, git init | `npm run typecheck` + `npm run lint` pass on hello-world app |
| M1 | Data layer | Prisma schema + first migration, Prisma client generation | `prisma migrate dev` creates `todos` table in local Postgres |
| M2 | API core | Fastify app: config, logger, error handler, health, swagger, cors/helmet/rate-limit | `GET /healthz` 200; `/docs` renders spec |
| M3 | Todos module | Full CRUD + validation + pagination + OpenAPI | All endpoints pass contract checks in Postman/curl |
| M4 | Tests + CI | Unit + integration + e2e suites; GitHub Actions workflow | `npm test` green in CI |
| M5 | Frontend | Vite+React app: list, create, toggle, delete, edit | UI works against running API; CORS OK |
| M6 | Deployment & docs | Dockerfiles, compose files, nginx, README, API docs | `docker compose up` and prod compose bring stack up healthy |

---

## 5. Step-by-Step Plan

### M0 — Scaffolding & tooling
1. `git init`; create root `.gitignore` (node_modules, dist, .env, *.log), `.editorconfig`, root `README.md`.
2. Create `backend/` via `npm create` or manually:
   - `npm init -y`, install `typescript`, `tsx`, `@types/node`, `eslint`, `prettier`.
   - `tsconfig.json` with `"strict": true`, `"target": "ES2023"`, `"module": "NodeNext"`, `"outDir": "dist"`.
   - Scripts: `dev` (`tsx watch src/server.ts`), `build` (`tsc`), `start` (`node dist/server.js`), `typecheck`, `lint`, `test`.
   - `.nvmrc` with `22`, `engines: { "node": ">=22" }`.
3. Set up ESLint (typescript-eslint flat config) + Prettier; add CI-friendly configs.

### M1 — Data layer
4. Install `prisma` + `@prisma/client`; `npx prisma init --datasource-provider postgresql`.
5. Write `prisma/schema.prisma` per §3.4 (add `@@map` optional; keep defaults).
6. `docker compose up -d postgres` (dev compose in `deployment/`) with healthcheck (`pg_isready -U postgres`).
7. `.env` (git-ignored) + `.env.example` with `DATABASE_URL=postgresql://todo:todo@localhost:5432/todo`.
8. `npx prisma migrate dev --name init`; verify `\d todos` shows table + indexes.
9. `src/db/prisma.ts`: singleton client with `PrismaClient` and globalThis caching for dev hot-reload.

### M2 — API core
10. Install Fastify 5 + plugins: `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/swagger-ui`, `pino-pretty` (dev).
11. `src/config/env.ts`: validate `NODE_ENV`, `PORT`, `HOST`, `DATABASE_URL`, `CORS_ORIGIN` at boot; throw with clear message on missing vars (fail fast).
12. `src/lib/errors.ts`: `AppError` class + Fastify `setErrorHandler` producing the §3.5 error envelope; log 5xx with stack, hide internals in prod.
13. `src/plugins/health.ts`: `GET /healthz` runs `SELECT 1` through Prisma → 200/503.
14. `src/app.ts`: `buildApp()` registers plugins + health route; `src/server.ts` starts it and handles SIGINT/SIGTERM graceful shutdown (close server → disconnect Prisma).
15. Swagger plugin: set `openapi: '3.1.0'`, info, `servers: [{url: '/api/v1'}]`, expose UI at `/docs`.

### M3 — Todos module
16. `todo.schema.ts`: JSON Schemas for `params` (id: uuid format), `query` (limit 1–100, cursor string, completed boolean, priority enum, sort pattern), `body` (create vs patch: `additionalProperties: false`), `responses` (200/201/204/400/404 shapes). Shared `TodoResponse` object for OpenAPI `components.schemas`.
17. `todo.repository.ts`: `create`, `findById`, `list({limit, cursor, filters, sort})` (cursor WHERE clause: `(createdAt, id) < (…, …)` with id tiebreaker), `update`, `delete`.
18. `todo.service.ts`: business rules — title trimmed & non-empty; `dueAt` in the future is *not* enforced (v1) but documented; build `meta` (fetch `limit+1` rows to compute `hasMore`/`nextCursor`).
19. `todo.controller.ts`: thin handlers mapping service results → responses; convert `Prisma.PrismaClientKnownRequestError` `P2025` (record not found) → 404 `NOT_FOUND`.
20. `todo.routes.ts`: register under `prefix: '/api/v1/todos'`; verify with curl:
    - create → 201 + body; duplicate/empty title → 400 envelope; unknown id → 404; pagination cursor walk returns all rows without duplicates.

### M4 — Tests + CI
21. Install `vitest`, `supertest`, `@types/supertest`; `vitest.config.ts` with `pool`, coverage provider `v8`.
22. Unit tests: service pagination math, title normalization, error mapping (no DB).
23. Integration tests (`todo.integration.test.ts`): `buildApp()` + real Postgres **test database** (`DATABASE_URL` → `todo_test`); `beforeEach` truncate `todos`; supertest through the whole stack.
24. E2E (`tests/api.e2e.test.ts`): full CRUD lifecycle + error cases + pagination over HTTP.
25. Scripts: `test` (unit+integration), `test:coverage` (≥ 80% lines), `test:ci` (run migrations on test DB first).
26. GitHub Actions `.github/workflows/ci.yml`: matrix Node 22; services `postgres:17` with healthcheck; steps: install → lint → typecheck → `prisma migrate deploy` on test DB → test → build. Cache npm deps.

### M5 — Frontend
27. Scaffold `frontend/` with Vite React-TS template; set `VITE_API_URL` (`http://localhost:3000/api/v1` dev; `/api/v1` prod via nginx).
28. `src/api/client.ts`: typed `fetch` wrapper (GET/POST/PATCH/DELETE), envelope + error handling, maps 400 details to form errors.
29. Components: `TodoForm` (create), `TodoList` + `TodoItem` (toggle, delete, edit inline), filter by `completed`, priority badge, minimal loading/error/empty states.
30. Style: plain CSS (no UI framework — keeps v1 lean); responsive, accessible (labels, keyboard).

### M6 — Deployment & docs
31. `backend/Dockerfile`: multi-stage — `node:22-alpine` deps (`npm ci`), build (`tsc`), runtime `npm ci --omit=dev` + `prisma generate`, `HEALTHCHECK` against `/healthz`, non-root `USER node`.
32. `deployment/docker-compose.yml` (dev): `postgres:17-alpine` (healthcheck `pg_isready`, named volume, `start_period`), `api` (build `../backend`, `depends_on: {db: {condition: service_healthy}}`, ports `3000:3000`, `env_file`).
33. `deployment/docker-compose.prod.yml`: adds `nginx` serving the built frontend and proxying `/api` → `api:3000`; `restart: unless-stopped`; resource limits; secrets via env (never committed).
34. `deployment/nginx/nginx.conf`: serve SPA with `try_files`, proxy `/api/` with headers, gzip, security headers.
35. Docs: root `README.md` (quickstart: `docker compose up`, curl examples, project layout), `docs/api.md` (endpoint reference + example payloads), `.env.example` files.
36. Smoke test prod stack: `docker compose -f deployment/docker-compose.prod.yml up -d --build` → `/healthz` 200, `/docs` reachable through nginx, frontend CRUD works end-to-end.

---

## 6. Risks & Pitfalls (learned from research)

1. **Fastify schema strictness** — `additionalProperties: false` on bodies; remember `coerceTypes` behavior for query booleans/numbers (use `type: 'string'` with enum or `type: 'boolean'` correctly) or 400s will surprise consumers.
2. **Prisma in Docker** — `prisma generate` must run during the Docker build (postinstall) and `prisma migrate deploy` (not `dev`) in prod; the generated client must be included in the runtime image.
3. **Cursor pagination tiebreaker** — order by `(createdAt, id)` and filter with tuple comparison to avoid duplicates/skips when timestamps collide.
4. **Test DB isolation** — always truncate between tests; never run integration tests against the dev DB.
5. **Graceful shutdown** — close HTTP server + Prisma on SIGTERM/SIGINT or you'll leak connections in containers.
6. **Env hygiene** — `.env` never committed; validate at boot (fail fast) rather than `undefined` blowing up mid-request.
7. **CORS** — in dev the Vite origin must be allowlisted; keep `CORS_ORIGIN` configurable for prod.
8. **Node version drift** — pin with `.nvmrc` + `engines`; Fastify 5 needs Node ≥ 20.19.

---

## 7. Definition of Done (whole project)

- [ ] All M0–M6 exit criteria met.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` green locally and in CI.
- [ ] OpenAPI spec at `/docs` matches implemented behavior (spot-check every endpoint).
- [ ] README quickstart works from a clean clone with a single `docker compose up`.
- [ ] No secrets or env files committed; `.env.example` present in backend, frontend, deployment.