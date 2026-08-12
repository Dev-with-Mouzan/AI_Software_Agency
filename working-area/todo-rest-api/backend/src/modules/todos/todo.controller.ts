import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Priority } from '@prisma/client';
import { todoService } from './todo.service.js';

/**
 * Thin HTTP adapters: parse validated request inputs, call the service,
 * map results to responses. All business rules live in todo.service.ts.
 */

export interface ListTodosQuery {
  limit?: number;
  cursor?: string;
  completed?: boolean;
  priority?: Priority;
  sort?: string;
}

export interface TodoParams {
  id: string;
}

export interface CreateTodoBody {
  title: string;
  description?: string | null;
  priority?: Priority;
  dueAt?: string | null;
}

export interface UpdateTodoBody {
  title?: string;
  description?: string | null;
  completed?: boolean;
  priority?: Priority;
  dueAt?: string | null;
}

export async function listTodosHandler(
  request: FastifyRequest<{ Querystring: ListTodosQuery }>,
  reply: FastifyReply,
) {
  const result = await todoService.list(request.query);
  return reply.send(result);
}

export async function createTodoHandler(
  request: FastifyRequest<{ Body: CreateTodoBody }>,
  reply: FastifyReply,
) {
  const todo = await todoService.create(request.body);
  return reply.code(201).send(todo);
}

export async function getTodoHandler(
  request: FastifyRequest<{ Params: TodoParams }>,
  reply: FastifyReply,
) {
  const todo = await todoService.getById(request.params.id);
  return reply.send(todo);
}

export async function updateTodoHandler(
  request: FastifyRequest<{ Params: TodoParams; Body: UpdateTodoBody }>,
  reply: FastifyReply,
) {
  const todo = await todoService.update(request.params.id, request.body);
  return reply.send(todo);
}

export async function deleteTodoHandler(
  request: FastifyRequest<{ Params: TodoParams }>,
  reply: FastifyReply,
) {
  await todoService.remove(request.params.id);
  return reply.code(204).send();
}
