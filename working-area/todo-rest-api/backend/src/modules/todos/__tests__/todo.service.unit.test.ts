import type { Priority } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/errors.js';
import { decodeCursor, encodeCursor } from '../../../lib/pagination.js';
import { todoRepository } from '../todo.repository.js';
import { todoService } from '../todo.service.js';

vi.mock('../todo.repository.js', () => ({
  todoRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const repo = vi.mocked(todoRepository);

const UUID = '00000000-0000-4000-8000-000000000001';

type TodoRecord = {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: Priority;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function todo(overrides: Partial<TodoRecord> = {}): TodoRecord {
  return {
    id: overrides.id ?? UUID,
    title: overrides.title ?? 'Buy milk',
    description: overrides.description ?? null,
    completed: overrides.completed ?? false,
    priority: overrides.priority ?? 'MEDIUM',
    dueAt: overrides.dueAt ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('todoService.create', () => {
  it('trims and normalizes the title before creating', async () => {
    repo.create.mockResolvedValue(todo({ title: 'Buy milk' }));

    await todoService.create({ title: '  Buy milk  ' });

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Buy milk' }));
  });

  it('rejects an empty (whitespace-only) title with VALIDATION_ERROR', async () => {
    await expect(todoService.create({ title: '   ' })).rejects.toBeInstanceOf(AppError);
    await expect(todoService.create({ title: '   ' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'title', message: 'must not be empty' }],
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a title longer than 200 characters', async () => {
    await expect(todoService.create({ title: 'x'.repeat(201) })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'title' }],
    });
  });

  it('rejects a description longer than 1000 characters', async () => {
    await expect(
      todoService.create({ title: 'T', description: 'x'.repeat(1001) }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'description' }],
    });
  });

  it('parses a dueAt string into a Date', async () => {
    repo.create.mockResolvedValue(todo());

    await todoService.create({ title: 'T', dueAt: '2026-02-01T10:00:00.000Z' });

    const arg = repo.create.mock.calls[0]![0];
    expect(arg.dueAt).toBeInstanceOf(Date);
    expect((arg.dueAt as Date).toISOString()).toBe('2026-02-01T10:00:00.000Z');
  });

  it('rejects an invalid dueAt date', async () => {
    await expect(todoService.create({ title: 'T', dueAt: 'not-a-date' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'dueAt' }],
    });
  });
});

describe('todoService.update', () => {
  it('normalizes the title on update', async () => {
    repo.update.mockResolvedValue(todo({ title: 'Updated' }));

    await todoService.update(UUID, { title: '  Updated  ' });

    expect(repo.update).toHaveBeenCalledWith(UUID, { title: 'Updated' });
  });

  it('passes completed/priority through untouched', async () => {
    repo.update.mockResolvedValue(todo({ completed: true, priority: 'HIGH' }));

    await todoService.update(UUID, { completed: true, priority: 'HIGH' });

    expect(repo.update).toHaveBeenCalledWith(UUID, { completed: true, priority: 'HIGH' });
  });

  it('allows clearing description and dueAt with null', async () => {
    repo.update.mockResolvedValue(todo());

    await todoService.update(UUID, { description: null, dueAt: null });

    expect(repo.update).toHaveBeenCalledWith(UUID, { description: null, dueAt: null });
  });

  it('rejects an empty update payload', async () => {
    await expect(todoService.update(UUID, {})).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects an empty title after trim on update', async () => {
    await expect(todoService.update(UUID, { title: ' ' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('todoService.getById', () => {
  it('throws NOT_FOUND when the todo does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(todoService.getById(UUID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Todo not found',
    });
  });

  it('returns the todo when it exists', async () => {
    repo.findById.mockResolvedValue(todo());

    await expect(todoService.getById(UUID)).resolves.toMatchObject({ id: UUID });
  });
});

describe('todoService.remove', () => {
  it('delegates deletion to the repository', async () => {
    repo.delete.mockResolvedValue(undefined);

    await todoService.remove(UUID);

    expect(repo.delete).toHaveBeenCalledWith(UUID);
  });
});

describe('todoService.list (pagination)', () => {
  it('fetches limit + 1 rows and computes hasMore + nextCursor', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      todo({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        title: `Todo ${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      }),
    );
    repo.list.mockResolvedValue(rows);

    const result = await todoService.list({ limit: 2 });

    expect(repo.list).toHaveBeenCalledWith({
      limit: 3,
      cursor: null,
      completed: undefined,
      priority: undefined,
      sort: 'desc',
    });
    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({
      limit: 2,
      nextCursor: encodeCursor(rows[1]!.id),
      hasMore: true,
    });
  });

  it('returns no nextCursor when there are no more pages', async () => {
    repo.list.mockResolvedValue([todo()]);

    const result = await todoService.list({ limit: 2 });

    expect(result.meta).toEqual({ limit: 2, nextCursor: null, hasMore: false });
    expect(result.data).toHaveLength(1);
  });

  it('resolves the cursor row and passes the tuple reference to the repository', async () => {
    const cursorCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    repo.findById.mockResolvedValue(todo({ createdAt: cursorCreatedAt }));
    repo.list.mockResolvedValue([]);

    await todoService.list({ limit: 2, cursor: encodeCursor(UUID), sort: 'createdAt:asc' });

    expect(repo.findById).toHaveBeenCalledWith(UUID);
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: UUID, createdAt: cursorCreatedAt },
        sort: 'asc',
      }),
    );
  });

  it('returns an empty page when the cursor points to a deleted todo', async () => {
    repo.findById.mockResolvedValue(null);

    const result = await todoService.list({ cursor: encodeCursor(UUID) });

    expect(result).toEqual({ data: [], meta: { limit: 20, nextCursor: null, hasMore: false } });
    expect(repo.list).not.toHaveBeenCalled();
  });

  it('rejects an invalid cursor with VALIDATION_ERROR', async () => {
    await expect(todoService.list({ cursor: '!!not-base64!!' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'cursor' }],
    });
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('clamps the limit to the allowed range', async () => {
    repo.list.mockResolvedValue([]);

    await todoService.list({ limit: 1000 });
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 101 }));

    await todoService.list({ limit: -5 });
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));

    await todoService.list({});
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 21 }));
  });
});

describe('cursor codec', () => {
  it('round-trips a uuid', () => {
    expect(decodeCursor(encodeCursor(UUID))).toBe(UUID);
  });

  it('rejects garbage input', () => {
    expect(decodeCursor('garbage')).toBeNull();
  });

  it('rejects valid base64 that is not a uuid', () => {
    // base64 of "hello"
    expect(decodeCursor('aGVsbG8=')).toBeNull();
  });
});
