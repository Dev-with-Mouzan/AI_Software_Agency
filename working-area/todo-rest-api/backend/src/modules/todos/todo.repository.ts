import { Prisma, type Priority } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError, isPrismaKnownError } from '../../lib/errors.js';

/**
 * Data access layer — the only module that talks to Prisma models.
 * Prisma P2025 (record not found) is translated to AppError NOT_FOUND here,
 * so controllers/services never deal with Prisma specifics.
 */

export interface TodoCreateData {
  title: string;
  description?: string | null;
  priority?: Priority;
  dueAt?: Date | null;
}

export interface TodoUpdateData {
  title?: string;
  description?: string | null;
  completed?: boolean;
  priority?: Priority;
  dueAt?: Date | null;
}

export interface TodoListParams {
  limit: number;
  /** Resolved cursor row; null when starting from the beginning. */
  cursor: { id: string; createdAt: Date } | null;
  completed?: boolean;
  priority?: Priority;
  sort: 'asc' | 'desc';
}

export const todoRepository = {
  async create(data: TodoCreateData) {
    return prisma.todo.create({ data });
  },

  async findById(id: string) {
    return prisma.todo.findUnique({ where: { id } });
  },

  /**
   * Cursor-paginated list with stable (createdAt, id) ordering.
   * The cursor is translated into a tuple comparison:
   *   sort desc: (createdAt, id) < (cursor.createdAt, cursor.id)
   *   sort asc:  (createdAt, id) > (cursor.createdAt, cursor.id)
   * The service passes `limit + 1` so it can compute hasMore/nextCursor.
   */
  async list({ limit, cursor, completed, priority, sort }: TodoListParams) {
    const where: Prisma.TodoWhereInput = {};
    if (completed !== undefined) where.completed = completed;
    if (priority !== undefined) where.priority = priority;

    if (cursor) {
      where.OR =
        sort === 'desc'
          ? [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ]
          : [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ];
    }

    return prisma.todo.findMany({
      where,
      orderBy: [{ createdAt: sort }, { id: sort }],
      take: limit,
    });
  },

  async update(id: string, data: TodoUpdateData) {
    try {
      return await prisma.todo.update({ where: { id }, data });
    } catch (err) {
      if (isPrismaKnownError(err) && err.code === 'P2025') {
        throw AppError.notFound('Todo not found');
      }
      throw err;
    }
  },

  async delete(id: string) {
    try {
      await prisma.todo.delete({ where: { id } });
    } catch (err) {
      if (isPrismaKnownError(err) && err.code === 'P2025') {
        throw AppError.notFound('Todo not found');
      }
      throw err;
    }
  },
};
