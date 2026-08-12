import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';

/**
 * End-to-end suite — the whole application (plugins, error handler, swagger,
 * todos module) against a real PostgreSQL test database.
 */

let app: FastifyInstance;

beforeAll(async () => {
  const env = loadEnv();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `E2E tests need PostgreSQL at ${env.DATABASE_URL}. See backend/README.md.`,
      { cause: err },
    );
  }
  app = await buildApp({ env, rateLimit: false });
  await app.ready();
});

beforeEach(async () => {
  await prisma.todo.deleteMany({});
});

afterAll(async () => {
  await app.close();
});

const api = () => request(app.server);

describe('GET /healthz', () => {
  it('reports ok with the database up', async () => {
    const res = await api().get('/healthz').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

describe('OpenAPI documentation', () => {
  it('serves the Swagger UI at /docs', async () => {
    const res = await api().get('/docs').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('serves the OpenAPI 3.1 spec at /docs/json with the real paths', async () => {
    const res = await api().get('/docs/json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.title).toBe('Todo REST API');
    expect(res.body.paths['/api/v1/todos']).toBeDefined();
    expect(res.body.paths['/api/v1/todos/{id}']).toBeDefined();
    expect(res.body.components.schemas.Todo).toBeDefined();
    expect(res.body.components.schemas.ErrorResponse).toBeDefined();
  });
});

describe('unknown routes', () => {
  it('returns the NOT_FOUND envelope for unknown routes', async () => {
    const res = await api().get('/api/v1/nope').expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('full CRUD lifecycle', () => {
  it('create → list → get → patch → delete', async () => {
    // create
    const created = await api()
      .post('/api/v1/todos')
      .send({ title: 'Lifecycle', priority: 'HIGH', dueAt: '2026-06-01T00:00:00.000Z' })
      .expect(201);
    expect(created.body.priority).toBe('HIGH');

    // list contains it
    const list = await api().get('/api/v1/todos').expect(200);
    expect(list.body.data.map((t: { id: string }) => t.id)).toContain(created.body.id);

    // get
    const fetched = await api().get(`/api/v1/todos/${created.body.id}`).expect(200);
    expect(fetched.body.title).toBe('Lifecycle');

    // patch
    const patched = await api()
      .patch(`/api/v1/todos/${created.body.id}`)
      .send({ completed: true, title: 'Lifecycle done' })
      .expect(200);
    expect(patched.body).toMatchObject({ completed: true, title: 'Lifecycle done' });

    // delete
    await api().delete(`/api/v1/todos/${created.body.id}`).expect(204);
    await api().get(`/api/v1/todos/${created.body.id}`).expect(404);
  });
});

describe('consistent error envelope', () => {
  it('uses VALIDATION_ERROR (400) with field details', async () => {
    const res = await api().post('/api/v1/todos').send({ title: '' }).expect(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        details: expect.any(Array),
      },
    });
    expect(res.body.error.details[0]).toMatchObject({ field: 'title' });
  });

  it('uses NOT_FOUND (404) for missing resources', async () => {
    const id = '00000000-0000-4000-8000-00000000dead';
    const res = await api().get(`/api/v1/todos/${id}`).expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });
});
