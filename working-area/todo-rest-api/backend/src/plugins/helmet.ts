import fastifyHelmet from '@fastify/helmet';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Security headers. The default CSP is disabled because Swagger UI injects
 * its own inline styles/scripts (it ships its own CSP via staticCSP); all
 * other helmet protections (X-Content-Type-Options, frame guards, etc.)
 * remain active.
 */
export function helmetPlugin(): FastifyPluginAsync {
  return async (app) => {
    await app.register(fastifyHelmet, {
      contentSecurityPolicy: false,
    });
  };
}
