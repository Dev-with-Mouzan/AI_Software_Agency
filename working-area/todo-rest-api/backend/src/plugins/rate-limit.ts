import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../config/env.js';

/**
 * Per-IP rate limiting. A global default applies to all routes; the todos
 * module tightens the limit on mutating routes (POST/PATCH/DELETE) via
 * per-route `config.rateLimit`.
 */
export function rateLimitPlugin(env: Env): FastifyPluginAsync {
  return async (app) => {
    await app.register(fastifyRateLimit, {
      global: true,
      max: env.RATE_LIMIT_MAX,
      timeWindow: '15 minutes',
      errorResponseBuilder: (_request, context) => ({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
          details: [{ message: `Rate limit of ${context.max} requests exceeded` }],
        },
      }),
    });
  };
}
