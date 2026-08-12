import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Executable OpenAPI 3.1 documentation.
 * - JSON spec:  GET /docs/json
 * - Swagger UI: GET /docs
 *
 * Schemas are derived from the Fastify route JSON Schemas, so the docs always
 * match the implemented contract.
 */
export function swaggerPlugin(): FastifyPluginAsync {
  return async (app) => {
    await app.register(fastifySwagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'Todo REST API',
          description:
            'Production-grade todo CRUD API with cursor pagination, strict validation and executable OpenAPI docs.',
          version: '1.0.0',
        },
        servers: [{ url: '/api/v1', description: 'API v1' }],
        tags: [
          { name: 'todos', description: 'Todo CRUD operations' },
          { name: 'system', description: 'Health and operational endpoints' },
        ],
      },
    });

    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', displayRequestDuration: true },
      staticCSP: true,
    });
  };
}
