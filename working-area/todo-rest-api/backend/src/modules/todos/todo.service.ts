import type { Priority } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { clampLimit, decodeCursor, encodeCursor } from '../../lib/pagination.js';
import { todoRepository } from './todo.repository.js';

/**
 * Business rules for todos: title normalization, field length validation,
 * date parsing and cursor-pagination math. No HTTP or Prisma knowledge here —
 * the repository is injected by import, which unit tests mock.
 */

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 1000;

export interface CreateTodoInput {
  title: string;
  description?: string | null;
  priority?: Priority;
  dueAt?: string | Date | null;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string | null;
  completed?: boolean;
  priority?: Priority;
  dueAt?: string | Date | null;
}

export interface ListTodosInput {
  limit?: number;
  cursor?: string;
  completed?: boolean;
  priority?: Priority;
  sort?: string;
}

export interface Page<T> {
  data: T[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

function normalizeTitle(raw: string): string {
  const title = raw.trim();
  if (title.length === 0) {
    throw AppError.validation('Title must not be empty', [
      { field: 'title', message: 'must not be empty' },
    ]);
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw AppError.validation(`Title must be at most ${TITLE_MAX_LENGTH} characters`, [
      { field: 'title', message: `must be at most ${TITLE_MAX_LENGTH} characters` },
    ]);
  }
  return title;
}

function normalizeDescription(description: string | null | undefined): string | null | undefined {
  if (description === null || description === undefined) return description;
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    throw AppError.validation(`Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`, [
      { field: 'description', message: `must be at most ${DESCRIPTION_MAX_LENGTH} characters` },
    ]);
  }
  return description;
}

function parseDate(
  value: string | Date | null | undefined,
  field: 'dueAt',
): Date | null | undefined {
  if (value === null || value === undefined) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.validation(`${field} must be a valid ISO 8601 date-time`, [
      { field, message: 'must be a valid ISO 8601 date-time' },
    ]);
  }
  return date;
}

export const todoService = {
  async create(input: CreateTodoInput) {
    const title = normalizeTitle(input.title);
    const description = normalizeDescription(input.description);
    const dueAt = parseDate(input.dueAt, 'dueAt');
    return todoRepository.create({
      title,
      description,
      priority: input.priority,
      dueAt,
    });
  },

  async getById(id: string) {
    const todo = await todoRepository.findById(id);
    if (!todo) throw AppError.notFound('Todo not found');
    return todo;
  },

  async update(id: string, input: UpdateTodoInput) {
    if (Object.keys(input).length === 0) {
      throw AppError.validation('At least one field must be provided to update', [
        { field: 'body', message: 'must include at least one known field' },
      ]);
    }

    const data: UpdateTodoInput = {};
    if (input.title !== undefined) data.title = normalizeTitle(input.title);
    if (input.description !== undefined) data.description = normalizeDescription(input.description);
    if (input.completed !== undefined) data.completed = input.completed;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.dueAt !== undefined) data.dueAt = parseDate(input.dueAt, 'dueAt');

    return todoRepository.update(id, data);
  },

  async remove(id: string) {
    await todoRepository.delete(id);
  },

  async list(input: ListTodosInput): Promise<Page<Awaited<ReturnType<typeof todoRepository.list>>[number]>> {
    const limit = clampLimit(input.limit);

    let cursorId: string | null = null;
    if (input.cursor !== undefined) {
      cursorId = decodeCursor(input.cursor);
      if (cursorId === null) {
        throw AppError.validation('Invalid cursor', [
          { field: 'cursor', message: 'must be a base64-encoded todo id' },
        ]);
      }
    }

    const sort: 'asc' | 'desc' = input.sort?.endsWith(':asc') ? 'asc' : 'desc';

    // Resolve the cursor to (createdAt, id) so the repository can build the
    // tuple comparison. If the referenced todo was deleted, return an empty page.
    let cursorRef: { id: string; createdAt: Date } | null = null;
    if (cursorId !== null) {
      const cursorRow = await todoRepository.findById(cursorId);
      if (cursorRow) {
        cursorRef = { id: cursorRow.id, createdAt: cursorRow.createdAt };
      } else {
        return { data: [], meta: { limit, nextCursor: null, hasMore: false } };
      }
    }

    // Fetch limit + 1 to determine whether another page exists.
    const rows = await todoRepository.list({
      limit: limit + 1,
      cursor: cursorRef,
      completed: input.completed,
      priority: input.priority,
      sort,
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && data.length > 0 ? encodeCursor(data[data.length - 1]!.id) : null;

    return { data, meta: { limit, nextCursor, hasMore } };
  },
};
