import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({ env });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down gracefully');
    try {
      await app.close(); // closes HTTP server + onClose hooks (Prisma disconnect)
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(
    { host: env.HOST, port: env.PORT, env: env.NODE_ENV },
    `todo-api listening — docs at http://${env.HOST}:${env.PORT}/docs`,
  );
}

main().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
