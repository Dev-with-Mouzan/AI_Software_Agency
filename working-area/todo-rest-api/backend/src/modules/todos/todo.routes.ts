import type { FastifyInstance } from 'fastify';
import {
  createTodoHandler,
  deleteTodoHandler,
  getTodoHandler,
  listTodosHandler,
  updateTodoHandler,
} from './todo.controller.js';
import {
  createBodySchema,
  errorResponseSchema,
  listQuerySchema,
  listResponseSchema,
  paramsSchema,
  patchBodySchema,
  todoObjectSchema,
} from './todo.schema.js';

/**
 * Todos routes — registered under `/api/v1` (see app.ts), so paths are
 * `/api/v1/todos...`.
 *
 * Mutating routes get a stricter per-route rate limit; list/get keep the
 * global default from RATE_LIMIT_MAX.
 */
export async function todoRoutes(app: FastifyInstance): Promise<void> {
  // Register shared schemas so they surface in OpenAPI components.schemas.
  app.addSchema({ $id: 'Todo', ...todoObjectSchema });
  app.addSchema({ $id: 'TodoListResponse', ...listResponseSchema });
  app.addSchema({ $id: 'ErrorResponse', ...errorResponseSchema });

  const mutatingRateLimit = { max: 60, timeWindow: '1 minute' };
  const readRateLimit = { max: 300, timeWindow: '1 minute' };

  app.get(
    '/todos',
    {
      schema: {
        tags: ['todos'],
        summary: 'List todos',
        description:
          'Returns a cursor-paginated list of todos with optional filtering (completed, priority) and stable (createdAt, id) sorting.',
        querystring: listQuerySchema,
        response: {
          200: listResponseSchema,
          400: errorResponseSchema,
        },
      },
      config: { rateLimit: readRateLimit },
    },
    listTodosHandler,
  );

  app.post(
    '/todos',
    {
      schema: {
        tags: ['todos'],
        summary: 'Create a todo',
        description: 'Creates a todo. Title is required and trimmed; priority defaults to MEDIUM.',
        body: createBodySchema,
        response: {
          201: todoObjectSchema,
          400: errorResponseSchema,
        },
      },
      config: { rateLimit: mutatingRateLimit },
    },
    createTodoHandler,
  );

  app.get(
    '/todos/:id',
    {
      schema: {
        tags: ['todos'],
        summary: 'Get a todo by id',
        params: paramsSchema,
        response: {
          200: todoObjectSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      config: { rateLimit: readRateLimit },
    },
    getTodoHandler,
  );

  app.patch(
    '/todos/:id',
    {
      schema: {
        tags: ['todos'],
        summary: 'Update a todo',
        description:
          'Partial, idempotent update. Send only the fields to change; pass null to clear description/dueAt.',
        params: paramsSchema,
        body: patchBodySchema,
        response: {
          200: todoObjectSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      config: { rateLimit: mutatingRateLimit },
    },
    updateTodoHandler,
  );

  app.delete(
    '/todos/:id',
    {
      schema: {
        tags: ['todos'],
        summary: 'Delete a todo',
        params: paramsSchema,
        response: {
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      config: { rateLimit: mutatingRateLimit },
    },
    deleteTodoHandler,
  );
}
