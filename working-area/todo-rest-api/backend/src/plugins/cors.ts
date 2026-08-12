import fastifyCors from '@fastify/cors';
import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../config/env.js';

/**
 * CORS — origin list comes from CORS_ORIGIN (comma-separated), so the Vite
 * dev server and production nginx origin can both be allowlisted.
 */
export function corsPlugin(env: Env): FastifyPluginAsync {
  return async (app) => {
    const origins = env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    await app.register(fastifyCors, {
      origin: origins.length === 1 ? origins[0] : origins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
  };
}
