import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { loadEnv, type Env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { setErrorHandler } from './lib/errors.js';
import { todoRoutes } from './modules/todos/todo.routes.js';
import { corsPlugin } from './plugins/cors.js';
import { healthPlugin } from './plugins/health.js';
import { helmetPlugin } from './plugins/helmet.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { swaggerPlugin } from './plugins/swagger.js';

export interface BuildAppOptions {
  /** Override env (tests pass their own). Defaults to process.env. */
  env?: Env;
  /** Override Fastify logger config (tests may pass `false`/silent). */
  logger?: FastifyServerOptions['logger'];
  /** Disable rate limiting (tests). Enabled by default. */
  rateLimit?: boolean;
}

/**
 * Application factory — registers plugins, error handling and routes but
 * does NOT listen. Tests build the app in-process with Supertest.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({
    logger: options.logger ?? { level: env.LOG_LEVEL },
    // Trust X-Forwarded-For from the nginx reverse proxy (prod) so rate
    // limiting and logging see the real client IP.
    trustProxy: true,
    ajv: {
      customOptions: {
        // Fastify defaults with one change: unknown body/query fields are
        // REJECTED (400) instead of silently stripped (removeAdditional: false).
        coerceTypes: 'array',
        removeAdditional: false,
      },
    },
  });

  // Central error handler + 404 envelope (must be registered before routes).
  setErrorHandler(app);

  // Swagger must be registered before routes so it can capture their schemas.
  await app.register(swaggerPlugin());

  await app.register(helmetPlugin());
  await app.register(corsPlugin(env));
  if (options.rateLimit !== false) {
    await app.register(rateLimitPlugin(env));
  }

  await app.register(healthPlugin());
  await app.register(todoRoutes, { prefix: '/api/v1' });

  // Graceful shutdown: closing the HTTP server also disconnects Prisma.
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}
