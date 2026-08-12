/**
 * Cursor-based pagination helpers.
 *
 * The cursor is an opaque base64url encoding of a todo id. The list query
 * sorts by `(createdAt, id)` (id tiebreaker keeps ordering stable when
 * timestamps collide), and the repository translates the cursor into a
 * tuple-comparison WHERE clause.
 */

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

/**
 * Decodes an opaque cursor. Returns `null` when the value is not a
 * base64url-encoded uuid (callers turn that into a 400 VALIDATION_ERROR).
 */
export function decodeCursor(cursor: string): string | null {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  return isUuid(decoded) ? decoded : null;
}

/**
 * Clamps a requested page size to [1, MAX_LIMIT]. Falls back to DEFAULT_LIMIT
 * when the value is missing or not a number.
 */
export function clampLimit(limit: number | undefined, fallback = DEFAULT_LIMIT): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}
