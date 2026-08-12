import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { loadEnv } from '../../../config/env.js';
import { prisma } from '../../../db/prisma.js';
import { encodeCursor } from '../../../lib/pagination.js';

/**
 * Integration tests — full HTTP stack (Fastify routes → service → repository
 * → real PostgreSQL). Requires the test database (see vitest.config.ts and
 * backend/README.md). The table is truncated before every test.
 */

let app: FastifyInstance;

beforeAll(async () => {
  const env = loadEnv();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `Integration tests need PostgreSQL at ${env.DATABASE_URL}. ` +
        `Start it (e.g. docker compose up -d db), create the todo_test database and run ` +
        `prisma migrate deploy against it. See backend/README.md.`,
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

const VALID_UUID = '00000000-0000-4000-8000-0000000000aa';

describe('POST /api/v1/todos', () => {
  it('creates a todo with defaults (201)', async () => {
    const res = await api().post('/api/v1/todos').send({ title: 'Buy milk' }).expect(201);

    expect(res.body).toMatchObject({
      title: 'Buy milk',
      completed: false,
      priority: 'MEDIUM',
      description: null,
      dueAt: null,
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof res.body.createdAt).toBe('string');
    expect(typeof res.body.updatedAt).toBe('string');
  });

  it('trims the title and echoes the full payload', async () => {
    const res = await api()
      .post('/api/v1/todos')
      .send({
        title: '  Ship v1  ',
        description: 'A description',
        priority: 'HIGH',
        dueAt: '2026-12-31T23:59:59.000Z',
      })
      .expect(201);

    expect(res.body.title).toBe('Ship v1');
    expect(res.body.description).toBe('A description');
    expect(res.body.priority).toBe('HIGH');
    expect(res.body.dueAt).toBe('2026-12-31T23:59:59.000Z');
  });

  it('rejects an empty title with a 400 VALIDATION_ERROR envelope', async () => {
    const res = await api().post('/api/v1/todos').send({ title: '' }).expect(400);

    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'title' })]),
    );
  });

  it('rejects unknown body fields (strict schema)', async () => {
    const res = await api().post('/api/v1/todos').send({ title: 'T', unknownField: 1 }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a missing title', async () => {
    await api().post('/api/v1/todos').send({}).expect(400);
  });

  it('rejects an invalid dueAt format', async () => {
    await api().post('/api/v1/todos').send({ title: 'T', dueAt: 'not-a-date' }).expect(400);
  });

  it('rejects a title longer than 200 characters', async () => {
    await api().post('/api/v1/todos').send({ title: 'x'.repeat(201) }).expect(400);
  });
});

describe('GET /api/v1/todos/:id', () => {
  it('returns the todo (200)', async () => {
    const created = await api().post('/api/v1/todos').send({ title: 'Get me' }).expect(201);
    const res = await api().get(`/api/v1/todos/${created.body.id}`).expect(200);
    expect(res.body).toEqual(created.body);
  });

  it('returns 404 NOT_FOUND for an unknown id', async () => {
    const res = await api().get(`/api/v1/todos/${VALID_UUID}`).expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns 400 for a non-uuid id', async () => {
    const res = await api().get('/api/v1/todos/not-a-uuid').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/todos/:id', () => {
  it('updates fields and is idempotent (200)', async () => {
    const created = await api().post('/api/v1/todos').send({ title: 'Before' }).expect(201);

    const first = await api()
      .patch(`/api/v1/todos/${created.body.id}`)
      .send({ title: 'After', completed: true, priority: 'LOW' })
      .expect(200);

    expect(first.body).toMatchObject({ title: 'After', completed: true, priority: 'LOW' });
    expect(first.body.updatedAt).not.toBe(created.body.updatedAt);

    const second = await api()
      .patch(`/api/v1/todos/${created.body.id}`)
      .send({ title: 'After', completed: true, priority: 'LOW' })
      .expect(200);

    expect(second.body).toMatchObject({ title: 'After', completed: true, priority: 'LOW' });
  });

  it('clears nullable fields with null', async () => {
    const created = await api()
      .post('/api/v1/todos')
      .send({ title: 'T', description: 'desc', dueAt: '2026-12-31T00:00:00.000Z' })
      .expect(201);

    const res = await api()
      .patch(`/api/v1/todos/${created.body.id}`)
      .send({ description: null, dueAt: null })
      .expect(200);

    expect(res.body.description).toBeNull();
    expect(res.body.dueAt).toBeNull();
  });

  it('rejects an empty patch body (minProperties 1)', async () => {
    const created = await api().post('/api/v1/todos').send({ title: 'T' }).expect(201);
    const res = await api().patch(`/api/v1/todos/${created.body.id}`).send({}).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid field types', async () => {
    const created = await api().post('/api/v1/todos').send({ title: 'T' }).expect(201);
    await api().patch(`/api/v1/todos/${created.body.id}`).send({ completed: 'yes' }).expect(400);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await api().patch(`/api/v1/todos/${VALID_UUID}`).send({ completed: true }).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/v1/todos/:id', () => {
  it('deletes the todo (204) and it is gone afterwards', async () => {
    const created = await api().post('/api/v1/todos').send({ title: 'Delete me' }).expect(201);

    await api().delete(`/api/v1/todos/${created.body.id}`).expect(204);
    await api().get(`/api/v1/todos/${created.body.id}`).expect(404);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await api().delete(`/api/v1/todos/${VALID_UUID}`).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/v1/todos (list, filters, pagination)', () => {
  async function seed() {
    const rows = [
      { title: 'Todo 0', priority: 'HIGH', completed: true, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)) },
      { title: 'Todo 1', priority: 'MEDIUM', completed: false, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 1)) },
      { title: 'Todo 2', priority: 'LOW', completed: true, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 2)) },
      { title: 'Todo 3', priority: 'MEDIUM', completed: false, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 3)) },
      { title: 'Todo 4', priority: 'HIGH', completed: true, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 4)) },
    ] as const;
    // `as const` produces a readonly tuple; spread into a mutable array for Prisma.
    await prisma.todo.createMany({ data: [...rows] });
    return prisma.todo.findMany({ orderBy: { createdAt: 'asc' } });
  }

  it('returns an empty page initially', async () => {
    const res = await api().get('/api/v1/todos').expect(200);
    expect(res.body).toEqual({ data: [], meta: { limit: 20, nextCursor: null, hasMore: false } });
  });

  it('walks all pages with the cursor without duplicates or skips', async () => {
    await seed();

    const collected: string[] = [];
    let cursor: string | undefined;
    let pages = 0;

    do {
      const query: Record<string, string | number> = { limit: 2 };
      if (cursor) query.cursor = cursor;
      const res = await api().get('/api/v1/todos').query(query).expect(200);

      expect(res.body.data.length).toBeLessThanOrEqual(2);
      collected.push(...res.body.data.map((t: { id: string }) => t.id));
      cursor = res.body.meta.nextCursor ?? undefined;
      pages += 1;
    } while (cursor !== undefined);

    expect(pages).toBe(3); // 2 + 2 + 1
    expect(collected).toHaveLength(5);
    expect(new Set(collected).size).toBe(5);
  });

  it('filters by completed', async () => {
    await seed();
    const res = await api().get('/api/v1/todos').query({ completed: true, limit: 100 }).expect(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.every((t: { completed: boolean }) => t.completed === true)).toBe(true);
  });

  it('filters by priority', async () => {
    await seed();
    const res = await api().get('/api/v1/todos').query({ priority: 'HIGH', limit: 100 }).expect(200);
    expect(res.body.data.map((t: { title: string }) => t.title).sort()).toEqual(['Todo 0', 'Todo 4']);
  });

  it('combines filters', async () => {
    await seed();
    const res = await api()
      .get('/api/v1/todos')
      .query({ priority: 'HIGH', completed: true, limit: 100 })
      .expect(200);
    expect(res.body.data.map((t: { title: string }) => t.title).sort()).toEqual(['Todo 0', 'Todo 4']);
  });

  it('sorts ascending and descending by createdAt', async () => {
    await seed();

    const asc = await api().get('/api/v1/todos').query({ sort: 'createdAt:asc', limit: 100 }).expect(200);
    expect(asc.body.data.map((t: { title: string }) => t.title)).toEqual([
      'Todo 0',
      'Todo 1',
      'Todo 2',
      'Todo 3',
      'Todo 4',
    ]);

    const desc = await api().get('/api/v1/todos').query({ sort: 'createdAt:desc', limit: 100 }).expect(200);
    expect(desc.body.data.map((t: { title: string }) => t.title)).toEqual([
      'Todo 4',
      'Todo 3',
      'Todo 2',
      'Todo 1',
      'Todo 0',
    ]);
  });

  it('rejects an invalid limit (> 100)', async () => {
    await api().get('/api/v1/todos').query({ limit: 101 }).expect(400);
  });

  it('rejects an invalid cursor', async () => {
    const res = await api().get('/api/v1/todos').query({ cursor: 'not-a-cursor' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns an empty page for a cursor pointing to a deleted todo', async () => {
    await seed();
    const res = await api().get('/api/v1/todos').query({ cursor: encodeCursor(VALID_UUID) }).expect(200);
    expect(res.body).toEqual({ data: [], meta: { limit: 20, nextCursor: null, hasMore: false } });
  });
});
