import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';

/**
 * Consistent error envelope, documented in OpenAPI:
 *   { "error": { "code": "...", "message": "...", "details": [...] } }
 *
 * Codes: VALIDATION_ERROR (400), NOT_FOUND (404), RATE_LIMITED (429), INTERNAL_ERROR (500).
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ErrorDetail {
  field?: string;
  message: string;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: ErrorDetail[];

  constructor(statusCode: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, ErrorCodes.NOT_FOUND, message);
  }

  static validation(message: string, details?: ErrorDetail[]): AppError {
    return new AppError(400, ErrorCodes.VALIDATION_ERROR, message, details);
  }
}

export function isPrismaKnownError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

interface ErrorBody {
  error: { code: string; message: string; details?: ErrorDetail[] };
}

function envelope(code: string, message: string, details?: ErrorDetail[]): ErrorBody {
  return {
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
    },
  };
}

/**
 * Central error handler — maps every failure to the API error envelope.
 * 5xx responses are logged with stack traces; internals are never leaked to clients.
 */
export function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    // Domain errors thrown by services/controllers.
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error }, 'request failed');
      }
      return reply.code(error.statusCode).send(envelope(error.code, error.message, error.details));
    }

    // Fastify JSON Schema validation failures (route schemas).
    const validation = (error as { validation?: unknown[] }).validation;
    if (Array.isArray(validation) && validation.length > 0) {
      const details = validation.map((v) => {
        const item = v as { instancePath?: string; message?: string };
        const field = item.instancePath ? item.instancePath.replace(/^\//, '') : 'request';
        return { field, message: item.message ?? 'Invalid value' };
      });
      return reply.code(400).send(envelope(ErrorCodes.VALIDATION_ERROR, 'Request validation failed', details));
    }

    // Rate limiter (429) — also produced by the plugin's errorResponseBuilder.
    if (error.statusCode === 429) {
      return reply.code(429).send(envelope(ErrorCodes.RATE_LIMITED, 'Too many requests, please try again later'));
    }

    // Other client errors (404 unknown route, 415 unsupported media type, parser errors).
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      const code = error.statusCode === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.VALIDATION_ERROR;
      return reply.code(error.statusCode).send(envelope(code, error.message ?? 'Request failed'));
    }

    // Defensive: Prisma record-not-found should have been mapped by the repository.
    if (isPrismaKnownError(error) && error.code === 'P2025') {
      return reply.code(404).send(envelope(ErrorCodes.NOT_FOUND, 'Resource not found'));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send(envelope(ErrorCodes.INTERNAL_ERROR, 'Internal server error'));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .code(404)
      .send(envelope(ErrorCodes.NOT_FOUND, `Route ${request.method} ${request.url} not found`));
  });
}
