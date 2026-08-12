/**
 * Environment configuration — parsed and validated once at startup (fail fast).
 * Missing/invalid variables throw with a clear message instead of surfacing
 * as `undefined` mid-request.
 */

export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface Env {
  NODE_ENV: NodeEnv;
  HOST: string;
  PORT: number;
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  LOG_LEVEL: LogLevel;
  RATE_LIMIT_MAX: number;
}

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];
const LOG_LEVELS: readonly LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const errors: string[] = [];

  const rawNodeEnv = source.NODE_ENV ?? 'development';
  const nodeEnv: NodeEnv = NODE_ENVS.includes(rawNodeEnv as NodeEnv) ? (rawNodeEnv as NodeEnv) : 'development';
  if (!NODE_ENVS.includes(rawNodeEnv as NodeEnv)) {
    errors.push(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')} (got "${rawNodeEnv}")`);
  }

  const rawPort = source.PORT ?? '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT must be an integer between 1 and 65535 (got "${rawPort}")`);
  }

  const host = source.HOST ?? '0.0.0.0';

  const databaseUrl = source.DATABASE_URL ?? '';
  if (databaseUrl.length === 0) {
    errors.push('DATABASE_URL is required (e.g. postgresql://todo:todo@localhost:5432/todo)');
  } else if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    errors.push('DATABASE_URL must start with postgres:// or postgresql://');
  }

  const corsOrigin = source.CORS_ORIGIN ?? 'http://localhost:5173';

  const rawLogLevel = source.LOG_LEVEL ?? (nodeEnv === 'test' ? 'silent' : 'info');
  const logLevel: LogLevel = LOG_LEVELS.includes(rawLogLevel as LogLevel) ? (rawLogLevel as LogLevel) : 'info';
  if (!LOG_LEVELS.includes(rawLogLevel as LogLevel)) {
    errors.push(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')} (got "${rawLogLevel}")`);
  }

  const rawRateLimit = source.RATE_LIMIT_MAX ?? '300';
  const rateLimitMax = Number(rawRateLimit);
  if (!Number.isInteger(rateLimitMax) || rateLimitMax < 1) {
    errors.push(`RATE_LIMIT_MAX must be a positive integer (got "${rawRateLimit}")`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    NODE_ENV: nodeEnv,
    HOST: host,
    PORT: port,
    DATABASE_URL: databaseUrl,
    CORS_ORIGIN: corsOrigin,
    LOG_LEVEL: logLevel,
    RATE_LIMIT_MAX: rateLimitMax,
  };
}
