/**
 * JSON Schemas for the todos module. These double as the OpenAPI contract:
 * Fastify validates requests and serializes responses with them, and
 * @fastify/swagger derives the OpenAPI document from them.
 */

export const priorityValues = ['LOW', 'MEDIUM', 'HIGH'];

const titleProperty = {
  type: 'string',
  minLength: 1,
  maxLength: 200,
  description: 'Short title (1–200 characters)',
};

const descriptionProperty = {
  type: ['string', 'null'],
  maxLength: 1000,
  description: 'Optional longer description (max 1000 characters)',
};

const priorityProperty = {
  type: 'string',
  enum: priorityValues,
  description: 'Priority level',
};

const dueAtProperty = {
  type: ['string', 'null'],
  format: 'date-time',
  description: 'ISO 8601 due date',
};

export const todoObjectSchema = {
  type: 'object',
  title: 'Todo',
  description: 'A single todo item',
  additionalProperties: false,
  required: ['id', 'title', 'completed', 'priority', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Unique todo id (uuid v4)' },
    title: titleProperty,
    description: descriptionProperty,
    completed: { type: 'boolean', description: 'Whether the todo is done' },
    priority: priorityProperty,
    dueAt: dueAtProperty,
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
  },
};

export const listResponseSchema = {
  type: 'object',
  title: 'TodoListResponse',
  additionalProperties: false,
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: todoObjectSchema, description: 'Page of todos' },
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['limit', 'nextCursor', 'hasMore'],
      properties: {
        limit: { type: 'integer', description: 'Number of items in this page' },
        nextCursor: {
          type: ['string', 'null'],
          description: 'Opaque cursor for the next page, or null when there are no more pages',
        },
        hasMore: { type: 'boolean', description: 'Whether more pages exist after this one' },
      },
    },
  },
};

export const errorResponseSchema = {
  type: 'object',
  title: 'ErrorResponse',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          enum: ['VALIDATION_ERROR', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR'],
          description: 'Machine-readable error code',
        },
        message: { type: 'string', description: 'Human-readable error message' },
        details: {
          type: 'array',
          description: 'Optional per-field validation details',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['message'],
            properties: {
              field: { type: 'string', description: 'The request field that failed validation' },
              message: { type: 'string', description: 'Human-readable detail' },
            },
          },
        },
      },
    },
  },
};

export const paramsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Todo id (uuid v4)' },
  },
};

export const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
      description: 'Number of items per page (1–100)',
    },
    cursor: {
      type: 'string',
      minLength: 1,
      description: 'Opaque cursor from the previous page (base64-encoded todo id)',
    },
    completed: { type: 'boolean', description: 'Filter by completion status' },
    priority: { type: 'string', enum: priorityValues, description: 'Filter by priority' },
    sort: {
      type: 'string',
      pattern: '^createdAt:(asc|desc)$',
      default: 'createdAt:desc',
      description: 'Stable sort order (createdAt with id tiebreaker)',
    },
  },
};

export const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    title: titleProperty,
    description: descriptionProperty,
    priority: priorityProperty,
    dueAt: dueAtProperty,
  },
};

export const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    title: titleProperty,
    description: descriptionProperty,
    completed: { type: 'boolean', description: 'Whether the todo is done' },
    priority: priorityProperty,
    dueAt: dueAtProperty,
  },
};
