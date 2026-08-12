import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';

const healthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'db', 'uptime', 'timestamp'],
  properties: {
    status: { type: 'string', enum: ['ok', 'error'] },
    db: { type: 'string', enum: ['up', 'down'] },
    uptime: { type: 'number', description: 'Process uptime in seconds' },
    timestamp: { type: 'string', format: 'date-time' },
  },
};

/**
 * GET /healthz — liveness/readiness probe that verifies PostgreSQL
 * connectivity (SELECT 1). Returns 200 when healthy, 503 otherwise.
 */
export function healthPlugin(): FastifyPluginAsync {
  return async (app) => {
    app.get(
      '/healthz',
      {
        schema: {
          tags: ['system'],
          summary: 'Liveness and readiness probe',
          description: 'Returns 200 when the API can reach PostgreSQL, 503 otherwise.',
          response: { 200: healthResponseSchema, 503: healthResponseSchema },
        },
      },
      async (request, reply) => {
        const base = { uptime: process.uptime(), timestamp: new Date().toISOString() };
        try {
          await prisma.$queryRaw`SELECT 1`;
          return reply.send({ status: 'ok', db: 'up', ...base });
        } catch (err) {
          request.log.error({ err }, 'health check failed');
          return reply.code(503).send({ status: 'error', db: 'down', ...base });
        }
      },
    );
  };
}
